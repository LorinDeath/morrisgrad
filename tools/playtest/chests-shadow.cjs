// LOCAL: тень сундука рядом с героем. Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/chest-style-v2', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); await p.goto(assertLocalUrl(`${BASE}?name=Shadow&uid=ch_sh_${Date.now()}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
  const P0 = await p.evaluate(() => window.__game.debug.pos()); const X = Math.round(P0.x) + 260, Y = Math.round(P0.y) + 220;
  await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [X, Y]); await p.waitForTimeout(600);
  await p.evaluate((o) => window.__game.debug.send(o), { type: 'dev_grant', chestSpawn: { dx: 70, dy: 60, by: { me: ['dew_slime_weapon'] } } });
  await p.evaluate(() => window.__game.debug.setZoom?.(1.7)); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/07-shadow-dark.png` }); await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
