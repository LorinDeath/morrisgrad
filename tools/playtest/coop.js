// Отряд: пауза у всех, пока кто-то выбирает улучшение; кто выбирает — видно; автовыбор ~10 с.
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n, d !== undefined ? JSON.stringify(d) : ''); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (name) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    p.on('pageerror', (e) => errs.push(name + ' ' + String(e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${name}&uid=test_r2_coop_${name}_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && !!window.__game.meta?.account, null, { timeout: 60000 });
    const G = (fn, a) => p.evaluate(fn, a);
    for (let i = 0; i < 5 && !(await G(() => !!window.__game.meta.hero)); i++) { await G(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500); }
    const walk = async (x, y) => { for (let i = 0; i < 80; i++) { const st = await G(() => window.__game.state().player); const dx = x - st.x, dy = y - st.y, d = Math.hypot(dx, dy); if (d < 4) break; const k = Math.min(1, 45 / d); await G(([a, c]) => window.__game.debug.teleport(a, c), [st.x + dx * k, st.y + dy * k]); await p.waitForTimeout(110); } };
    await walk(900, 330);
    return { p, G };
  };
  const A = await mk('Алекс'), B = await mk('Бета');
  await A.p.keyboard.press('KeyE'); await A.p.waitForSelector('#mc-lobby-create', { timeout: 6000 });
  await A.p.click('#mc-lobby-create');
  await A.p.waitForFunction(() => window.__game.lobby()?.state === 'lobby', null, { timeout: 6000 });
  await B.p.keyboard.press('KeyE'); await B.p.waitForSelector('[data-join]', { timeout: 8000 }).catch(() => {});
  await B.p.click('[data-join]');
  await B.p.waitForFunction(() => window.__game.lobby()?.state === 'lobby', null, { timeout: 6000 }).catch(() => {});
  ok('B joined A lobby', await B.G(() => !!window.__game.lobby()));
  await B.p.click('#mc-lobby-ready');
  await A.p.waitForFunction(() => window.__game.lobby()?.members?.every?.((m) => m.ready) ?? true, null, { timeout: 5000 }).catch(() => {});
  await A.p.waitForTimeout(1200);
  await A.p.click('#mc3d-run-start');
  await A.p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 });
  await B.p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 }).catch(() => {});
  await A.p.waitForTimeout(2500);
  ok('both in co-op run, see each other', await A.G(() => window.__game.run.remotes.size === 1) && await B.G(() => window.__game.run.remotes.size === 1));
  for (const X of [A, B]) await X.G(() => { const r = window.__game.run; r.me.hp = r.me.maxHp = 1e6; });
  // хост получает уровень (отряд — общий опыт)
  await A.G(() => { const r = window.__game.run; r.team.xp += 60; });
  await A.p.waitForTimeout(1500);
  const sA = await A.G(() => ({ pend: window.__game.run.pendingChoices, info: window.__game.run.pauseInfo.map((c) => c.username), t: window.__game.run.t }));
  const sB = await B.G(() => ({ pend: window.__game.run.pendingChoices, info: window.__game.run.pauseInfo.map((c) => c.username), t: window.__game.run.t, bar: document.querySelector('.mc3d-pausebar')?.textContent || '' }));
  ok('level-up in co-op: both players get a choice', sA.pend > 0 && sB.pend > 0, { sA, sB });
  await A.p.waitForTimeout(1500);
  const tA2 = await A.G(() => window.__game.run.t), tB2 = await B.G(() => window.__game.run.t);
  ok('co-op paused for everyone while choosing (clocks frozen)', Math.abs(tA2 - sA.t) < 0.05 && Math.abs(tB2 - sB.t) < 0.3, { a: [sA.t, tA2], b: [sB.t, tB2] });
  await A.p.screenshot({ path: `${OUT}/coop-levelup-A-choosing.png` });
  // B выбирает сразу, A — нет: B стоит на паузе и видит, что выбирает A
  for (let i = 0; i < 6 && await B.G(() => window.__game.run.pendingChoices > 0); i++) { await B.G(() => document.querySelector('.mc3d-choice')?.click()); await B.p.waitForTimeout(500); }
  await B.p.waitForTimeout(700);
  const bar = await B.G(() => document.querySelector('.mc3d-pausebar')?.style.display !== 'none' ? document.querySelector('.mc3d-pausebar').textContent : '');
  const tB3 = await B.G(() => window.__game.run.t); await B.p.waitForTimeout(1000); const tB4 = await B.G(() => window.__game.run.t);
  ok('after own picks, B still paused and sees who is choosing', /Алекс/.test(bar) && !/: вы /.test(bar) && Math.abs(tB4 - tB3) < 0.05, { bar, tB3, tB4 });
  await B.p.screenshot({ path: `${OUT}/coop-levelup-B-waiting.png` });
  // автовыбор у A через ~10 с
  await A.p.waitForFunction(() => window.__game.run.pendingChoices === 0, null, { timeout: 35000 }).catch(() => {});
  const auto = await A.G(() => ({ pend: window.__game.run.pendingChoices, choiceT: window.__game.run.choiceT }));
  ok('auto-pick (~10 s per pending choice) releases the pause', auto.pend === 0, auto);
  await A.p.waitForTimeout(1500);
  const r1 = await A.G(() => window.__game.run.t), q1 = await B.G(() => window.__game.run.t);
  await A.p.waitForTimeout(1200);
  const r2 = await A.G(() => window.__game.run.t), q2 = await B.G(() => window.__game.run.t);
  ok('both clocks run again after everyone chose', r2 > r1 + 0.5 && q2 > q1 + 0.5, { a: [r1, r2], b: [q1, q2] });
  ok('pause bar hidden after resume', await B.G(() => document.querySelector('.mc3d-pausebar').style.display === 'none'));
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})();
