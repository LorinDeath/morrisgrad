// Интерфейс отряда: плашка «＋ Пригласить» без отряда, меню игрока по ПКМ/клику, окно «Вступить/Отклонить»,
// рамки участников (ОЗ, уровень, класс, корона лидера), передача лидерства, исключение, выход, максимум 4. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async (name, uid, cls) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx); const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=${encodeURIComponent(name)}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game.debug.myId?.(), null, { timeout: 120000 }); await p.waitForTimeout(1500);
    await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1500);
    p.G = (fn, a) => p.evaluate(fn, a); p.id = await p.G(() => window.__game.debug.myId()); return p; };
  const at = (p, x, y) => p.G(([x, y]) => window.__game.debug.teleport(x, y), [x, y]);
  const A = await mk('Алекс', 'pt_party_a', 'mage'), B = await mk('Бран', 'pt_party_b', 'warrior'), C = await mk('Ция', 'pt_party_c', 'rogue');
  await at(A, 700, 800); await at(B, 760, 800); await at(C, 640, 820); await A.waitForTimeout(2500);
  for (const p of [A, B, C]) await p.G(() => window.__game.debug.rawSend({ type: 'party_leave' })); await A.waitForTimeout(800);
  const st = (p) => p.G(() => window.__game.debug.party());
  ok(await A.isVisible('.mc-party [data-p="pick"]'), 'без отряда: плашка «＋ Пригласить»');
  await A.screenshot({ path: `${OUT}/party-ui-1-solo.png` });
  // ПКМ по Брану → меню → пригласить
  const bp = await B.G(() => { const s = window.__game.state(); return { x: s.player?.x ?? s.x, y: s.player?.y ?? s.y }; });
  const sp = await A.G(([x, y]) => window.__game.debug.screenOf(x, y), [bp.x, bp.y]);
  ok(!!sp, 'Бран на экране ' + JSON.stringify(sp));
  if (sp) await A.mouse.click(sp.x, sp.y, { button: 'right' }); await A.waitForTimeout(500);
  ok(await A.isVisible('.mc-pmenu [data-m="inv"]'), 'ПКМ по игроку: меню с «Пригласить в отряд»');
  await A.screenshot({ path: `${OUT}/party-ui-2-menu.png` });
  await A.click('.mc-pmenu [data-m="inv"]');
  await B.waitForSelector('.mc-party-ask [data-a="yes"]', { timeout: 8000 }); await B.screenshot({ path: `${OUT}/party-ui-3-invite-popup.png` });
  await B.click('.mc-party-ask [data-a="yes"]'); await A.waitForTimeout(2000);
  let s = await st(A); ok(s?.members?.length === 2 && s.leader === A.id, 'Бран вступил, лидер — Алекс');
  // «＋» → список рядом → Ция; сначала отклоняет, потом принимает
  await A.click('.mc-party [data-p="pick"]'); await A.waitForTimeout(400);
  ok(await A.isVisible(`.mc-party .pick [data-s="${C.id}"]`), '«＋»: Ция в списке рядом');
  await A.screenshot({ path: `${OUT}/party-ui-4-pick.png` });
  await A.click(`.mc-party .pick [data-s="${C.id}"]`);
  await C.waitForSelector('.mc-party-ask [data-a="no"]', { timeout: 8000 }); await C.click('.mc-party-ask [data-a="no"]'); await A.waitForTimeout(1500);
  s = await st(A); ok(s.members.length === 2, 'Ция отклонила — в отряде по-прежнему 2');
  await A.G((c) => window.__game.debug.rawSend({ type: 'party_invite', sid: c }), C.id);
  await C.waitForSelector('.mc-party-ask [data-a="yes"]', { timeout: 8000 }); await C.click('.mc-party-ask [data-a="yes"]'); await A.waitForTimeout(2500);
  s = await st(A); ok(s.members.length === 3, 'Ция вступила — 3/4');
  const rows = await A.$$eval('.mc-party .pm', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
  console.log('  ' + rows.join(' | '));
  ok(rows.length === 3 && rows.some((r) => r.includes('👑')) && rows.every((r) => /ур\. \d/.test(r) && /\d+\/\d+/.test(r)), 'рамки: корона, уровень, ОЗ');
  ok(rows.some((r) => /Маг|Воин|Разбойни|Плут|Тень/i.test(r)), 'рамки: класс героя');
  await A.screenshot({ path: `${OUT}/party-ui-5-panel-leader.png` });
  // передать лидерство Брану
  await A.click(`.mc-party [data-p="promote"][data-s="${B.id}"]`); await A.waitForTimeout(1500);
  s = await st(A); ok(s.leader === B.id, 'лидерство передано Брану');
  ok(!(await A.isVisible('.mc-party [data-p="kick"]')), 'не-лидер не видит «Исключить»');
  await B.screenshot({ path: `${OUT}/party-ui-6-new-leader.png` });
  // Бран исключает Цию
  await B.click(`.mc-party [data-p="kick"][data-s="${C.id}"]`); await A.waitForTimeout(1500);
  s = await st(A); ok(s.members.length === 2 && !(await st(C)), 'Бран исключил Цию');
  // Алекс выходит
  await A.click('.mc-party [data-p="leave"]'); await A.waitForTimeout(1500);
  ok(!(await st(A)) && !(await st(B)), 'Алекс вышел — отряд из 1 распущен');
  await A.screenshot({ path: `${OUT}/party-ui-7-after-leave.png` });
  ok(![A, B, C].some((p) => p.errs.length), 'без ошибок страницы ' + [A, B, C].map((p) => p.errs.join('|')).join(' '));
  console.log(fails ? `FAILED ${fails}` : 'party-ui ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
