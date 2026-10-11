// Отряд: уровень без паузы; 3 с неуязвимости (хост подтверждает окно), быстрый выбор → ударная волна (хост применяет/проверяет).
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
  const idA = await A.G(() => window.__game.run.myId), idB = await B.G(() => window.__game.run.myId);
  // уровень отряда: БЕЗ паузы; у каждого 3 с неуязвимости, союзники видят пузырь (хост подтверждает окно)
  await A.G(() => { window.__game.run.team.xp += 60; window.__game.debug.spawn('ghoul', 30); });
  await A.p.waitForTimeout(700);
  const sA = await A.G(() => ({ pend: window.__game.run.pendingChoices, inv: window.__game.run.invulnLeft(), t: window.__game.run.t }));
  const sB = await B.G(() => ({ pend: window.__game.run.pendingChoices, inv: window.__game.run.invulnLeft(), t: window.__game.run.t }));
  ok('level-up in co-op: both players get a choice + invulnerability', sA.pend > 0 && sB.pend > 0 && sA.inv > 1.5 && sB.inv > 1.5, { sA, sB });
  await A.p.waitForTimeout(800);
  const tA2 = await A.G(() => window.__game.run.t), tB2 = await B.G(() => window.__game.run.t);
  ok('co-op NOT paused while choosing (both clocks advance)', tA2 > sA.t + 0.4 && tB2 > sB.t + 0.4, { a: [sA.t, tA2], b: [sB.t, tB2] });
  ok('host sees guest shimmer (validated window)', await A.G((id) => !!window.__game.run.remotes.get(id)?.inv, idB));
  ok('guest sees host shimmer (from host snapshot)', await B.G((id) => !!window.__game.run.remotes.get(id)?.inv, idA));
  await A.p.screenshot({ path: `${OUT}/coop-levelup-A-invuln.png` });
  // гость выбирает в первые 3 с → волна; применяет и проверяет хост
  await B.G(() => document.querySelector('.mc3d-choice')?.click());
  await B.p.waitForTimeout(300);
  const wA = await A.G(() => window.__game.run.lastWave);
  ok('guest quick pick → host applies guest shockwave', !!wA && wA.owner === idB, wA);
  ok('host renders guest wave', await A.G((id) => window.__game.run.waveFx.some((w) => w.owner === id) || !!window.__game.run.lastWave, idB));
  await B.p.screenshot({ path: `${OUT}/coop-levelup-B-wave.png` });
  // подделки: вторая волна за то же событие и «неуязвимость» вне окна — хост отклоняет
  const rej0 = await A.G(() => window.__game.run.waveRejected || 0);
  await B.G(() => window.__game.run.send({ k: 'wave' }));
  await A.p.waitForTimeout(400);
  ok('host rejects a 2nd wave for the same level-up', await A.G((r0) => (window.__game.run.waveRejected || 0) > r0, rej0));
  await A.p.waitForTimeout(3600);
  await B.G(() => { const r = window.__game.run, m = r.me; r.send({ k: 'me', iv: 1, x: m.x, z: m.z, dx: 0, dz: 1, mv: 0, hp: m.hp, mh: m.maxHp, dead: 0, mag: 2.4, cls: r.classKey }); });
  await A.p.waitForTimeout(300);
  ok('host ignores forged invulnerability outside the 3 s window', await A.G((id) => !window.__game.run.remotes.get(id)?.inv, idB));
  const rej1 = await A.G(() => window.__game.run.waveRejected || 0);
  await B.G(() => window.__game.run.send({ k: 'wave' }));
  await A.p.waitForTimeout(400);
  ok('host rejects a wave outside the window', await A.G((r0) => (window.__game.run.waveRejected || 0) > r0, rej1));
  ok('host invulnerability ended after 3 s (choice may stay open)', await A.G(() => window.__game.run.invulnLeft() === 0));
  for (const X of [A, B]) for (let i = 0; i < 6 && await X.G(() => window.__game.run.pendingChoices > 0); i++) { await X.G(() => document.querySelector('.mc3d-choice')?.click()); await X.p.waitForTimeout(300); }
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})();
