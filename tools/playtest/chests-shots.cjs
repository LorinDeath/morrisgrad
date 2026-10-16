// LOCAL: скриншоты сундука в мире (личный/общий, подпись с таймером). Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/loot-chests', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); await p.goto(assertLocalUrl(`${BASE}?name=Admin&uid=ch_admin&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
  const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
  await S({ type: 'admin_save', kind: 'chest', id: 'main', patch: { personalSec: 12 } });
  await S({ type: 'admin_save', kind: 'curse', id: 'main', patch: { equipDropMult: 100 } });
  const P = await p.evaluate(() => window.__game.debug.pos()); const X = Math.round(P.x) + 900, Y = Math.round(P.y) + 500;
  await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [X, Y]); await p.waitForTimeout(800);
  for (let i = 0; i < 3; i++) await p.evaluate(([x, y]) => window.__game.debug.devSpawn('dew_slime', x, y, false), [X + 80 + i * 30, Y + 20 * i]);
  await p.waitForTimeout(700); await S({ type: 'dev_grant', engageNear: 300 });
  for (let i = 0; i < 3; i++) { await S({ type: 'dev_grant', killNear: true }); await p.waitForTimeout(300); }
  await p.waitForTimeout(1200);
  const c = await p.evaluate(() => window.__game.debug.chests().sort((a, b2) => b2.id - a.id)[0]);
  await p.evaluate(([x, y]) => window.__game.debug.tp(x - 90, y + 60, true), [c.x, c.y]); await p.evaluate(() => window.__game.debug.setZoom?.(1.6)); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/10-world-chest-personal-label.png` });
  await p.waitForTimeout(13000); await p.screenshot({ path: `${OUT}/11-world-chest-public-label-guards.png` });
  await S({ type: 'admin_reset', kind: 'chest', id: 'main' }); await S({ type: 'admin_reset', kind: 'curse', id: 'main' }); await p.waitForTimeout(800);
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
