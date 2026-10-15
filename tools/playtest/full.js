// Полный плей-тест round2: node full.js desktop|mobile
const { chromium, devices } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
const kind = process.argv[2] || 'desktop';
const report = { kind, checks: [], perf: {} };
const ok = (name, cond, extra) => { report.checks.push({ name, pass: !!cond, extra }); console.log(cond ? 'PASS' : 'FAIL', name, extra ? JSON.stringify(extra) : ''); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctxOpts = kind === 'mobile' ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 860 } };
  delete ctxOpts.defaultBrowserType;
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  let errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text() + ' @ ' + (m.location()?.url || '')); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.stack || e)));
  const uid = `test_r2_${kind}_${Date.now().toString(36)}`; // свежий профиль: узлы сбора и квесты не «истрачены» прошлым прогоном
  await p.goto(`http://127.0.0.1:5199/game.html?name=${kind === 'mobile' ? 'Мобайл' : 'Десктоп'}&uid=${uid}&ws=ws://127.0.0.1:8787${kind === 'desktop' ? '&fs=1' : ''}&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
  await p.waitForFunction(() => window.__game.meta?.state, null, { timeout: 20000 }).catch(() => {});
  ok('meta_state received', await p.evaluate(() => !!window.__game.meta?.state));
  const shot = (n) => p.screenshot({ path: `${OUT}/${kind}-${n}.png` });
  const G = (fn, arg) => p.evaluate(fn, arg);
  const walk = async (x, y) => { // шагами, как живой игрок (сервер ограничивает скорость перемещения)
    for (let i = 0; i < 80; i++) {
      const st = await G(() => window.__game.state().player);
      const dx = x - st.x, dy = y - st.y, d = Math.hypot(dx, dy);
      if (d < 4) break;
      const k = Math.min(1, 45 / d);
      await G(([a, b]) => window.__game.debug.teleport(a, b), [st.x + dx * k, st.y + dy * k]);
      await p.waitForTimeout(110);
    }
  };
  await G(() => window.__game.debug.selectClass('rogue'));
  await p.waitForTimeout(1500);
  ok('hero profile after class select', await G(() => window.__game.meta.hero?.cls === 'rogue'), await G(() => window.__game.meta.hero && { lvl: window.__game.meta.hero.lvl, ab: window.__game.meta.hero.effective?.abilities?.map((a) => a.id) }));
  await G(() => window.__game.debug.setZoom(0.22));
  await p.waitForTimeout(900);
  await shot('01-hub-map');
  await G(() => window.__game.debug.setZoom(0.55));
  // бой с Мошкарой на северном краю
  await walk(600, 240);
  await p.waitForTimeout(800);
  const kills0 = await G(() => (window.__game.meta.account?.bestiary?.blade_fly?.kills || 0));
  ok('auto-attack is OFF by default (no hits without input)', await G(() => !window.__game.debug.aim().autoAttack));
  const mobPos = () => G(() => { const st = window.__game.state().player; const m = window.__game.debug.zone.nearestMob(st.x, st.y, 600); return m ? window.__game.debug.screenOf(m.x, m.y) : null; });
  if (kind === 'mobile') {
    // телефон: удержание большой кнопки ⚔ с автонаведением
    const bb = await p.locator('.mc3d-tbtn.atk').boundingBox();
    ok('mobile attack button visible', !!bb, bb);
    const cdp = await ctx.newCDPSession(p);
    const tp = [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, id: 7 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
    for (let i = 0; i < 24; i++) { await p.waitForTimeout(400); if (await G((k0) => (window.__game.meta.account?.bestiary?.blade_fly?.kills || 0) > k0, kills0)) break; }
    await shot('02-hub-fight');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    // ПК: ЛКМ по мобу, удержание — повтор атаки; курсор следует за целью
    let pt = await mobPos();
    ok('mob on screen for click attack', !!pt, pt);
    if (pt) { await p.mouse.move(pt.x, pt.y); await p.mouse.down(); }
    for (let i = 0; i < 24; i++) {
      await p.waitForTimeout(400);
      if (i === 1) await shot('02-hub-fight');
      if (await G((k0) => (window.__game.meta.account?.bestiary?.blade_fly?.kills || 0) > k0, kills0)) break;
      pt = await mobPos(); if (pt) await p.mouse.move(pt.x, pt.y);
    }
    await p.mouse.up();
  }
  const best = await G(() => window.__game.meta.account?.bestiary?.blade_fly?.kills || 0) - kills0;
  ok(`hub ${kind === 'mobile' ? '⚔ button (aim assist)' : 'mouse-click'} attack kills blade fly (server)`, best > 0, { kills: best });
  // Кьют: диалог
  await walk(780, 715);
  await p.waitForTimeout(700);
  if (kind === 'mobile') await p.tap('.mc3d-tbtn[data-act="interact"]'); else await p.keyboard.press('KeyE');
  await p.waitForSelector('.mc-dialog', { timeout: 5000 }).catch(() => {});
  ok('NPC dialog opens', await G(() => !!document.querySelector('.mc-dialog')));
  await shot('03-npc-dialog');
  await G(() => window.__game.debug.overlay.hideScreen());
  // Книга
  for (const [tab, key] of [['quests', 'KeyJ'], ['hero', 'KeyT'], ['skills', 'KeyK'], ['gear', 'KeyI'], ['bestiary', 'KeyB']]) {
    if (kind === 'mobile') await G((t) => window.__game.debug.openBook(t), tab);
    else { await p.keyboard.press(key); }
    await p.waitForTimeout(400);
    const vis = await G(() => { const e = document.querySelector('.mc-book'); return e && e.style.display !== 'none' && e.querySelector('.mc-book-body').innerText.length > 20; });
    ok(`book tab ${tab}`, vis);
    if (tab === 'gear') { await p.click('.mc-item').catch(() => {}); await p.waitForTimeout(200); }
    await shot(`04-book-${tab}`);
    if (kind === 'desktop') { await p.keyboard.press(key); await p.waitForTimeout(150); }
    else await G(() => document.querySelector('.mc-book-x').click());
  }
  ok('book closed', await G(() => document.querySelector('.mc-book').style.display === 'none'));
  // Аринар
  await G(() => window.__game.debug.teleport(255, 600));
  await p.waitForTimeout(500);
  if (kind === 'mobile') await p.tap('.mc3d-tbtn[data-act="interact"]'); else await p.keyboard.press('KeyE');
  await p.waitForFunction(() => window.__game.state().world === 'arinar', null, { timeout: 6000 }).catch(() => {});
  ok('portal to Arinar', await G(() => window.__game.state().world === 'arinar'));
  await p.waitForTimeout(1500);
  // ближайший узел ресурса (узлы — из сида зоны, те же, что на сервере)
  const node = await G(() => { const st = window.__game.state().player; let best = null, bd = 1e9; for (const n of window.__game.debug.zone.nodes.values()) { const d = Math.hypot(n.def.x - st.x, n.def.y - st.y); if (d < bd) { bd = d; best = n.def; } } return best && { x: best.x, y: best.y, type: best.type, res: best.res }; });
  console.log('nearest node', JSON.stringify(node));
  if (node) await walk(node.x, node.y + 30);
  await p.waitForTimeout(600);
  const res0 = await G(() => JSON.stringify(window.__game.meta.account?.res || {}));
  if (kind === 'mobile') await p.tap('.mc3d-tbtn[data-act="interact"]'); else await p.keyboard.press('KeyE');
  await p.waitForTimeout(2200);
  const res1 = await G(() => JSON.stringify(window.__game.meta.account?.res || {}));
  ok('gather resource node in Arinar', res0 !== res1, { res0, res1 });
  await G(() => window.__game.debug.setZoom(0.4));
  await G(() => window.__game.debug.teleport(600, 600));
  await p.waitForTimeout(1500);
  await shot('05-arinar');
  await G(() => window.__game.debug.setZoom(0.55));
  // назад на Поляну
  // портал «Мир Адского Пламени» теперь у хаба Аринара (worlds/portals.ts: 23700,24000)
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 23700, y: 24000 }); window.__game.debug.teleport(23700, 24000); });
  await p.waitForTimeout(1200);
  if (kind === 'mobile') await p.tap('.mc3d-tbtn[data-act="interact"]'); else await p.keyboard.press('KeyE');
  await p.waitForFunction(() => window.__game.state().world === 'hellfire', null, { timeout: 6000 }).catch(() => {});
  // Лобби через портал Склепа
  await walk(900, 305);
  if (kind === 'mobile') await p.tap('.mc3d-tbtn[data-act="interact"]'); else await p.keyboard.press('KeyE');
  await p.waitForSelector('.mc-lobby', { timeout: 5000 }).catch(() => {});
  ok('crypt portal opens lobby browser', await G(() => !!document.querySelector('.mc-lobby #mc-lobby-create, .mc-lobby') && !!document.querySelector('#mc-lobby-create')));
  await shot('05b-lobby-browser');
  await p.fill('.mc-lobby-name', 'Тестовый отряд').catch(() => {});
  await p.click('#mc-lobby-create');
  await p.waitForFunction(() => window.__game.lobby()?.state === 'lobby', null, { timeout: 5000 }).catch(() => {});
  ok('create lobby → lobby screen', await G(() => window.__game.lobby()?.name === 'Тестовый отряд' && !!document.querySelector('#mc-lobby-leave')));
  await shot('05c-lobby');
  await p.click('#mc3d-run-start');
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 }).catch(() => {});
  ok('leader starts run from lobby', await G(() => window.__game.state().mode === 'run' && window.__game.run.epoch === 1));
  // искусственно «прокачанный» забег → гибель → сброс
  await G(() => { const r = window.__game.run; r.team.level = 13; r.seenLevel = 13; r.nextBoss = 9999; window.__game.debug.spawn('ghoul', 40); });
  await p.waitForTimeout(500);
  await G(() => { const r = window.__game.run; r.me.iframes = 0; r.me.choosingInvuln = 0; r.damageMe(1e6); });
  await p.waitForFunction(() => window.__game.lobby()?.epoch === 2, null, { timeout: 6000 }).catch(() => {});
  ok('team wipe → server reset (epoch 2, lobby)', await G(() => window.__game.lobby()?.epoch === 2 && window.__game.lobby()?.state === 'lobby'), await G(() => window.__game.lobby() && { e: window.__game.lobby().epoch, s: window.__game.lobby().state }));
  await shot('05d-wipe-results');
  await p.click('#mc3d-again').catch(() => {});
  await p.waitForTimeout(500);
  ok('results → back to lobby', await G(() => window.__game.state().mode === 'hub' && !!document.querySelector('#mc-lobby-leave')));
  await p.click('#mc3d-run-start');
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 }).catch(() => {});
  ok('restart after wipe is a fresh run (lvl 1, epoch 3, no old mobs)', await G(() => { const r = window.__game.run; return r.epoch === 3 && r.team.level === 1 && r.enemies.size < 10 && r.t < 5; }), await G(() => ({ ep: window.__game.run?.epoch, lv: window.__game.run?.team.level, en: window.__game.run?.enemies.size })));
  // «Сдаться»
  await G(() => { const r = window.__game.run; r.me.iframes = 0; r.me.choosingInvuln = 0; r.damageMe(1e6); });
  await p.waitForTimeout(300);
  await G(() => window.__game.leaveRun());
  await p.waitForFunction(() => window.__game.state().mode === 'hub' && !window.__game.lobby(), null, { timeout: 6000 }).catch(() => {});
  ok('leave lobby → hub, instance released', await G(() => window.__game.state().mode === 'hub' && !window.__game.lobby()));
  // Забег: 300 врагов
  await G(() => window.__game.startRun('crypt'));
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 });
  await p.waitForTimeout(1500);
  ok('run has 3D abilities from meta', await G(() => window.__game.run.me.abilities.length >= 1), await G(() => window.__game.run.me.abilities.map((a) => a.id)));
  await G(() => { const r = window.__game.run; r.nextBoss = 9999; r.nextElite = 9999; });
  await G(() => { window.__game.debug.spawn('imp', 120); window.__game.debug.spawn('ghoul', 60); window.__game.debug.spawn('blade_fly', 60); window.__game.debug.spawn('golem', 30); window.__game.debug.spawn('dream_moth', 30); window.__game.debug.spawn('golem', 3, true); });
  await G(() => { window.__game.run.me.hp = 1e6; window.__game.run.me.maxHp = 1e6; });
  await p.waitForTimeout(3000);
  const samples = [];
  for (let i = 0; i < 8; i++) { await p.waitForTimeout(500); samples.push(await G(() => window.__game.perf())); }
  report.perf.pix = samples;
  console.log('PERF pix', JSON.stringify(samples.slice(-3)));
  await shot('06-run-300');
  // ability keys
  if (kind === 'desktop') { await p.keyboard.press('KeyQ'); await p.waitForTimeout(300); }
  else await p.tap('.mc3d-tbtn.ab[data-slot="0"]').catch(() => {});
  ok('ability used in run', await G(() => window.__game.run.me.stats.usedAbility));
  // Страховка паузы улучшения: открываем выбор, затем перекрываем другим окном и закрываем его
  await G(() => { const r = window.__game.run; r.team.xp += 5000; });
  await p.waitForSelector('.mc3d-choice', { timeout: 5000 }).catch(() => {});
  ok('level-up choice opens', await G(() => !!document.querySelector('.mc3d-choice')));
  // Новое правило: БЕЗ паузы; 3 с неуязвимости, пока открыт выбор; не успел — уязвим (выбор остаётся открытым)
  ok('level-up: 3 s invulnerability starts', await G(() => window.__game.run.invulnLeft() > 2.3), await G(() => window.__game.run.invulnLeft()));
  { const t0 = await G(() => window.__game.run.t); await p.waitForTimeout(900); await p.waitForFunction((a) => window.__game.run.t > a + 0.45, t0, { timeout: 6000 }).catch(() => {}); const t1 = await G(() => window.__game.run.t);
    ok('no pause while choosing (run clock advances)', t1 > t0 + 0.4, { t0, t1 }); }
  await shot('07a-run-levelup-invuln');
  await p.waitForFunction(() => window.__game.run.invulnLeft() === 0, null, { timeout: 20000 }).catch(() => {});
  const hp0 = await G(() => window.__game.run.me.hp);
  for (let i = 0; i < 60; i++) { if (i >= 10 && (await G(() => window.__game.run.me.hp)) < hp0) break; await G(() => { const r = window.__game.run; let k = 0; for (const e of r.enemies.values()) { if (e.dead || k++ > 6) continue; e.x = r.me.x + 0.2; e.z = r.me.z; } }); await p.waitForTimeout(100); }
  const hp1 = await G(() => window.__game.run.me.hp);
  ok('after 3 s: choice still open, invulnerability over, hero takes damage', await G(() => window.__game.run.pendingChoices > 0 && !!document.querySelector('.mc3d-choice') && !!document.querySelector('.mc3d-inv-ring.over')) && hp1 < hp0, { hp0, hp1 });
  await shot('07b-run-levelup-vulnerable');
  await G(() => { window.__game.run.lastWave = null; });
  if (kind === 'desktop') await p.keyboard.press('Digit1'); else await p.tap('.mc3d-choice').catch(() => {});
  await p.waitForTimeout(200);
  ok('late pick (after 3 s) → no shockwave', await G(() => !window.__game.run.lastWave));
  await G(() => { const o = window.__game.debug.overlay; o.showScreen('<p>перекрытие</p>', []); o.hideScreen(); });
  await p.waitForTimeout(600);
  ok('level-up watchdog reopens choice after it was hidden', await G(() => !!document.querySelector('.mc3d-choice') && window.__game.run.pendingChoices > 0), await G(() => ({ pend: window.__game.run.pendingChoices, open: window.__game.debug.runUI.choiceOpen })));
  for (let i = 0; i < 40 && await G(() => window.__game.run.pendingChoices > 0); i++) {
    if (kind === 'desktop') await p.keyboard.press('Digit1'); else await p.tap('.mc3d-choice').catch(() => {});
    await p.waitForTimeout(150);
  }
  ok('all level-up choices resolved', await G(() => window.__game.run.pendingChoices === 0 && !document.querySelector('.mc3d-choice')));
  const t0 = await G(() => window.__game.run.t); await p.waitForTimeout(1000); const t1 = await G(() => window.__game.run.t);
  ok('run clock advances after choices', t1 > t0, { t0, t1 });
  await shot('07-run-after-levelups');
  // выбор в первые 3 с → ударная волна отбрасывает врагов рядом (без урона)
  await G(() => { window.__game.debug.spawn('ghoul', 20); window.__game.run.lastWave = null; });
  await p.waitForTimeout(500);
  await G(() => { const r = window.__game.run; let need = 0; r.team.xp += 1e5; });
  await p.waitForSelector('.mc3d-choice', { timeout: 5000 }).catch(() => {});
  const hpE0 = await G(() => [...window.__game.run.enemies.values()].reduce((a, e) => a + e.hp, 0));
  await G(() => { const r = window.__game.run; let k = 0; for (const e of r.enemies.values()) { if (e.dead || e.boss || k >= 6) continue; const a = k++ * 1.05; e.x = r.me.x + Math.cos(a) * 2; e.z = r.me.z + Math.sin(a) * 2; } });
  if (kind === 'desktop') await p.keyboard.press('Digit1'); else await p.tap('.mc3d-choice').catch(() => {});
  await p.waitForTimeout(120);
  await shot('07c-run-levelup-wave');
  const wv = await G(() => window.__game.run.lastWave);
  ok('quick pick (< 3 s) → shockwave knocks nearby enemies back', !!wv && wv.n > 0, wv);
  ok('shockwave: invulnerability ends right after the pick', await G(() => window.__game.run.invulnLeft() <= 0.3));
  for (let i = 0; i < 60 && await G(() => window.__game.run.pendingChoices > 0); i++) {
    if (kind === 'desktop') await p.keyboard.press('Digit1'); else await p.tap('.mc3d-choice').catch(() => {});
    await p.waitForTimeout(120);
  }
  ok('only one shockwave per level-up event', await G(() => window.__game.run.waveEvent === window.__game.run.lvlEvent));
  await G(() => window.__game.leaveRun());
  await p.waitForFunction(() => window.__game.state().mode === 'hub', null, { timeout: 8000 });
  // Испытание Обители
  await p.waitForTimeout(800);
  await G(() => window.__game.startRun('trial'));
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 });
  await G(() => { window.__game.run.t = 43; });
  await p.waitForTimeout(3500);
  ok('trial waves spawn + heart', await G(() => window.__game.run.trialWave >= 3 && window.__game.run.heart.hp > 0), await G(() => ({ w: window.__game.run.trialWave, hh: window.__game.run.heart.hp, en: window.__game.run.enemies.size })));
  await shot('08-trial');
  await G(() => window.__game.leaveRun());
  await p.waitForFunction(() => window.__game.state().mode === 'hub', null, { timeout: 8000 });
  // Испытание отражений
  await p.waitForTimeout(800);
  await G(() => window.__game.startRun('duel'));
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 });
  await p.waitForFunction(() => [...window.__game.run.enemies.values()].some((e) => e.type === 'kyut_mirror'), null, { timeout: 15000 }).catch(() => {});
  ok('duel mirror spawned', await G(() => [...window.__game.run.enemies.values()].some((e) => e.type === 'kyut_mirror')));
  await shot('09-duel');
  await G(() => { window.__game.run.t = 15; for (const e of window.__game.run.enemies.values()) if (e.type === 'kyut_mirror') window.__game.run.killEnemy(e, window.__game.run.myId); });
  await p.waitForFunction(() => window.__game.run.ended, null, { timeout: 15000 }).catch(() => {});
  ok('duel won', await G(() => window.__game.run.ended && window.__game.run.won), await G(() => window.__game.run.endInfo?.reason));
  await p.waitForTimeout(1500);
  await shot('10-duel-result');
  await G(() => window.__game.leaveRun());
  await p.waitForTimeout(1500);
  // «Сдаться» в co-op: 2-й игрок (гость) жив → сдавшийся уходит в лобби, забег идёт
  report.errors = errs = errs.filter((e) => !/favicon\.ico/.test(e)); // у стенда нет favicon — не ошибка игры
  ok('no console errors', errs.length === 0, errs.slice(0, 6));
  require('fs').writeFileSync(`${OUT}/test-${kind}.json`, JSON.stringify(report, null, 1));
  await b.close();
})().catch((e) => { console.error('SCRIPT', e); process.exit(1); });
