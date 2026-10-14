// Тайлсеты подземелий (камень/воздух/лёд/огонь) + новые пропсы и тюльпаны Дара в мире. Скриншоты, ПК + телефон.
// NODE_PATH=<playwright-core> node tools/playtest/dungeons.js  (из каталога server; wrangler dev :8787; game.html :5199)
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '/workspace/morrisgrad-round2';
const ROOMS = [['crypt', 'stone', 'Склеп'], ['abyss', 'air', 'Бездна'], ['duel', 'ice', 'Испытание отражений'], ['trial', 'fire', 'Испытание Обители']];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now();
  const open = async (n, uid, ctxOpts = { viewport: { width: 1440, height: 860 } }) => {
    const p = await (await b.newContext(ctxOpts)).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    await p.evaluate(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(1500);
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  for (const [i, [room, tiles, name]] of ROOMS.entries()) {
    const p = await open('Мэл', `t_dg_${i}_${T}`);
    await G(p, (r) => window.__game.startRun(r), room);
    await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 30000 }).catch(() => {});
    await p.waitForFunction(() => window.__game.debug.arena().ready, null, { timeout: 15000 }).catch(() => {});
    const a = await G(p, () => window.__game.debug.arena());
    ok(a.tiles === tiles && a.ready, `${name}: tileset ${tiles} baked (${JSON.stringify(a)})`);
    await p.waitForTimeout(4000);
    await p.screenshot({ path: `${OUT}/dungeon-${i + 1}-${room}-${tiles}.png` });
    await p.context().close();
  }
  // мир: пропсы (новый props_atlas) + тюльпаны Дара на Поляне (стадии бутон/созревший/активный)
  const W = await open('Мэл', `t_dg_w_${T}`);
  await G(W, () => window.__game.debug.teleport(520, 700));
  const fl = [[470, 690, 'bud'], [520, 650, 'mature'], [570, 690, 'active']];
  for (const [x, y, st] of fl) await G(W, (q) => window.__game.debug.plantFlower(q[0], q[1], q[2]), [x, y, st]);
  await W.waitForTimeout(3500);
  const flowers = await G(W, () => window.__game.debug.flowers());
  ok(flowers.length >= 3, `flowers planted: ${flowers.length}`);
  await W.screenshot({ path: `${OUT}/props-01-tulips-hub.png` });
  await G(W, () => window.__game.debug.teleport(300, 400)); await W.waitForTimeout(2500);
  await W.screenshot({ path: `${OUT}/props-02-world.png` });
  await G(W, () => window.__game.debug.teleport(900, 900)); await W.waitForTimeout(2500);
  await W.screenshot({ path: `${OUT}/props-03-world.png` });
  const M = await open('Мобила', `t_dg_m_${T}`, { ...devices['Pixel 7'] });
  await G(M, () => window.__game.debug.teleport(520, 720)); await M.waitForTimeout(3000);
  await M.screenshot({ path: `${OUT}/props-04-mobile-tulips.png` });
  await G(M, () => window.__game.startRun('trial')); await M.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 30000 }).catch(() => {});
  await M.waitForTimeout(5000); await M.screenshot({ path: `${OUT}/dungeon-5-mobile-trial-fire.png` });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0].slice(0, 300) : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
