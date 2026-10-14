// Тени: моб/предметы мира/герой — тень под ногами (скрин: до/после). Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3', TAG = process.argv[2] || 'after';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/r3-shadows-hub-${TAG}.png` });
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 24000, y: 20500, god: true }); window.__game.debug.teleport(24000, 20500); }); await p.waitForTimeout(4000);
  const m = (await G(() => window.__game.debug.zoneMobs())).sort((a, z) => Math.hypot(a.x - 24000, a.y - 20500) - Math.hypot(z.x - 24000, z.y - 20500))[0];
  if (m) { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [m.x - 140, m.y]); await p.waitForTimeout(1200); }
  await p.screenshot({ path: `${OUT}/r3-shadows-world-${TAG}.png` });
  console.log('blocked', blocked.length, 'errs', errs.length, errs.join('|')); await b.close();
})();
