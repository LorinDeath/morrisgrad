// LOCAL: стиль сундука рядом с мобом/мешком/героем + тень. Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/chest-style', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); await p.goto(assertLocalUrl(`${BASE}?name=Style&uid=ch_style_${Date.now()}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
  const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
  const P0 = await p.evaluate(() => window.__game.debug.pos()); const X = Math.round(P0.x) + 150, Y = Math.round(P0.y) - 400; await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [X, Y]); await p.waitForTimeout(800);
  await S({ type: 'dev_grant', chestSpawn: { dx: 70, dy: -10, by: { me: ['dew_slime_weapon'] } } });
  await S({ type: 'dev_grant', chestSpawn: { dx: -70, dy: -10, by: { me: ['dew_slime_weapon@c', 'dew_slime_weapon@c', 'dew_slime_weapon@c'] } } });
  await p.evaluate((a) => window.__game.debug.devSpawn('dew_slime', ...a, false), [X, Y - 110]); await p.waitForTimeout(400);
  await p.evaluate((a) => window.__game.debug.devSpawn('dew_slime', ...a, false), [X + 30, Y - 130]);
  await S({ type: 'dev_grant', engageNear: 300 }).catch(() => {}); await S({ type: 'dev_grant', killNear: true }).catch(() => {}); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({ chests: window.__game.debug.chests().length, bags: window.__game.debug.bags().length }));
  console.log(JSON.stringify(st)); console.log(JSON.stringify(await p.evaluate(() => ({ a: window.__game.debug.atmo?.(), w: window.__game.state?.() }))));
  await p.evaluate((a) => window.__game.debug.devSpawn('dew_slime', ...a, false), [X - 10, Y + 70]); await p.waitForTimeout(800);
  await p.evaluate(() => window.__game.debug.setZoom?.(0.8)); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/01-compare-mob-bag-player.png` });
  await p.evaluate(() => window.__game.debug.setZoom?.(1.0)); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/02-closeup-shadow.png` });
  await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [X, Y + 460]); await p.waitForTimeout(500);
  await S({ type: 'dev_grant', chestSpawn: { dx: 70, dy: -10, by: { me: ['dew_slime_weapon'] } } }); await S({ type: 'dev_grant', chestSpawn: { dx: -70, dy: -10, by: { me: ['dew_slime_weapon@c', 'dew_slime_weapon@c', 'dew_slime_weapon@c'] } } });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/03-compare-crate-barrel-npc.png` });
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
