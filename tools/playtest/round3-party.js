// Раунд 3: отряд — приглашение (игровое окно), рамки, мини-карта, без дуэлей между союзниками, делёж добычи/опыта, вход в «Бездну» к лидеру без портала
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const errs = [];
  const mk = async (name, uid) => {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + String(e).slice(0, 160)));
    const got = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/"(toast_error|duel_err|party_run|run_joined)"/.test(s)) got.push(s.slice(0, 400)); else if (s.includes('"loot":{')) got.push('LOOT ' + s.slice(s.indexOf('"loot":{'), s.indexOf('"loot":{') + 300)); }));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${encodeURIComponent(name)}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
    await p.addStyleTag({ content: '.game-hud-panel{display:block!important}#ghud-minimap-slot{position:fixed!important;right:8px;bottom:90px;z-index:9999}' });
    return { p, got, G: (fn, a) => p.evaluate(fn, a) };
  };
  const A = await mk('Лидер', 'test_admin_pt'), B = await mk('Боец', 'test_party_b' + (Date.now() % 1e4));
  for (const X of [A, B]) { await X.G(() => window.__game.debug.selectClass('warrior')); await X.p.waitForTimeout(2000);
    for (let i = 0; i < 8 && (await X.G(() => window.__game.state().world)) !== 'arinar'; i++) { await X.G(() => window.__game.debug.teleport(240, 600)); await X.p.waitForTimeout(700); await X.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await X.p.waitForTimeout(1800); } }
  const tp = async (X, x, y, w = 2500) => { await X.G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await X.p.waitForTimeout(w); };
  await tp(A, 24200, 24100, 500); await tp(B, 24260, 24100);
  const bid = await B.G(() => window.__game.debug.myId()), aid = await A.G(() => window.__game.debug.myId());
  await A.G((s) => window.__game.debug.rawSend({ type: 'party_invite', sid: s }), bid); await B.p.waitForSelector('.mc-party-ask [data-a="yes"]', { timeout: 6000 });
  await B.p.screenshot({ path: `${OUT}/r3-party-invite.png` });
  await B.p.click('.mc-party-ask [data-a="yes"]'); await A.p.waitForTimeout(2200);
  const sa = await A.G(() => window.__game.debug.party()), sb = await B.G(() => window.__game.debug.party());
  ok(sa?.members?.length === 2 && sb?.leader === aid, `отряд из 2, лидер — пригласивший (${sa?.members?.map((m) => m.name)})`);
  await tp(B, 25200, 24100, 2500);
  const mmA = await A.G(() => window.__game.debug.track().mm);
  ok((mmA?.party || 0) >= 1, `мини-карта лидера: союзников ${mmA?.party}`);
  await A.p.screenshot({ path: `${OUT}/r3-party-frames.png` });
  // союзники не дерутся
  A.got.length = 0; await A.G((s) => window.__game.debug.rawSend({ type: 'duel_challenge', sid: s }), bid); await A.p.waitForTimeout(800);
  ok(A.got.some((s) => s.includes('союзник')), 'вызов союзника на дуэль отклонён сервером: ' + A.got.filter((s) => s.includes('err')).join(' ').slice(0, 160));
  // делёж: убиваем моба рядом с обоими
  const camp = await A.G(() => (window.__game.debug.campsRaw() || []).filter((c) => c[3] > 0)[0]);
  if (camp) { await tp(A, camp[1], camp[2] + 120, 2500); }
  const mobs = await A.G(() => window.__game.debug.mobsNear(600));
  if (mobs.length) { const m = mobs[0]; await tp(A, m.x - 40, m.y, 800); await tp(B, m.x + 40, m.y, 1200); A.got.length = 0; B.got.length = 0;
    await A.G(() => window.__game.debug.rawSend({ type: 'dev_grant', killNear: 1 })); await A.p.waitForTimeout(1500);
    const la = A.got.find((s) => s.startsWith('LOOT')), lb = B.got.find((s) => s.startsWith('LOOT')); console.log('mob', JSON.stringify(m), 'A', A.got.join(' | ').slice(0, 300));
    ok(!!la && !!lb && /"party":2/.test(la) && /"party":2/.test(lb), `оба получили награду с долей отряда: A ${la?.match(/"xp":\d+/)} · B ${lb?.match(/"xp":\d+/)}`); }
  else ok(false, 'нет моба рядом для проверки дележа');
  // «Бездна»: лидер у портала, участник — далеко
  await tp(A, 24300, 24000, 1500); await tp(B, 26000, 25000, 1500);
  await A.G(() => window.__game.debug.rawSend({ type: 'lobby_create', room: 'abyss', portalId: 'portal_run_abyss', isPublic: false })); 
  await B.p.waitForSelector('.mc-party-ask [data-a="yes"]', { timeout: 6000 }).catch(() => null);
  await B.p.screenshot({ path: `${OUT}/r3-party-abyss-ask.png` });
  B.got.length = 0; await B.p.click('.mc-party-ask [data-a="yes"]').catch(() => null); await B.p.waitForTimeout(2000);
  ok(B.got.some((s) => s.includes('"run_joined"') && s.includes('abyss')), 'участник вошёл в «Бездну» лидера без похода к порталу');
  await B.p.screenshot({ path: `${OUT}/r3-party-abyss-joined.png` });
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
