// LOCAL: сундук — вид в мире, свечение проклятых 1/3/5, приватность (чужой видит 0). Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/loot-chests', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const open = async (name, uid) => { const p = await ctx.newPage(); p.zs = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"chests":[[')) p.zs.push(s); }));
    await p.goto(assertLocalUrl(`${BASE}?name=${name}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.waitForTimeout(1000); await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500); return p; };
  const A = await open('Glow', 'ch_glow_' + Date.now());
  const S = (p, o) => p.evaluate((x) => window.__game.debug.send(x), o);
  await A.evaluate(() => window.__game.debug.tp(400, 1000, true)); await A.waitForTimeout(800);
  const W = 'dew_slime_weapon';
  const mk = (n) => [...Array(n)].map(() => W + '@c').concat([W]);
  await S(A, { type: 'dev_grant', chestSpawn: { dx: -90, dy: -50, by: { me: mk(1) } } });
  await S(A, { type: 'dev_grant', chestSpawn: { dx: 0, dy: -50, by: { me: mk(3) } } });
  await S(A, { type: 'dev_grant', chestSpawn: { dx: 90, dy: -50, by: { me: mk(5).concat(mk(2)) } } });
  await S(A, { type: 'dev_grant', chestSpawn: { dx: 0, dy: 40, by: { me: [W] } } }); // без проклятых — золотой личный
  await A.waitForTimeout(1500); await A.evaluate(() => window.__game.debug.setZoom?.(1.25)); await A.waitForTimeout(1500);
  const cs = await A.evaluate(() => window.__game.debug.chests().map((c) => ({ id: c.id, cz: c.cz, mine: c.mine, pub: c.pub })));
  ok(cs.filter((c) => c.cz === 1).length >= 1 && cs.some((c) => c.cz === 3) && cs.some((c) => c.cz === 5), `уровни 1/3/5 (7 проклятых → 5): ${JSON.stringify(cs)}`);
  await A.screenshot({ path: `${OUT}/14-glow-1-3-5-personal.png` });
  // приватность: чужой рядом видит 0 своих и 0 свечения, payload без позиций
  const B = await open('Other', 'ch_other_' + Date.now()); await B.evaluate(() => window.__game.debug.tp(400, 1010, true)); await B.waitForTimeout(2000);
  const bs = await B.evaluate(() => window.__game.debug.chests().filter((c) => !c.pub).map((c) => ({ cz: c.cz, mine: c.mine })));
  ok(bs.length >= 4 && bs.every((c) => c.cz === 0 && c.mine === 0), `чужой: личные сундуки без свечения и без позиций ${JSON.stringify(bs)}`);
  ok(!B.zs.some((s) => /dew_slime_weapon/.test(s)), 'в zone_state чужого нет id предметов');
  await B.evaluate(() => window.__game.debug.setZoom?.(1.5)); await B.waitForTimeout(800); await B.screenshot({ path: `${OUT}/15-glow-foreign-sees-none.png` });
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
