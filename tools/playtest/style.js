// «Единый стиль»: до (выкл.) / после (по умолчанию 50) / максимум; хаб и мир; плюс FPS. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2500);
  const set = async (v) => { await G((v) => window.__game.debug.style(v), v); await p.waitForTimeout(600); };
  const fps = () => G(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  const shots = async (tag) => { await set(0); const f0 = await fps(); await p.screenshot({ path: `${OUT}/style-${tag}-before.png` }); await set(50); const f1 = await fps(); await p.screenshot({ path: `${OUT}/style-${tag}-after.png` }); await set(100); await p.screenshot({ path: `${OUT}/style-${tag}-max.png` }); console.log(tag, 'fps off', f0, 'on', f1); };
  await shots('hub');
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 24000, y: 20500, god: true }); window.__game.debug.teleport(24000, 20500); }); await p.waitForTimeout(4000);
  const m = (await G(() => window.__game.debug.zoneMobs())).sort((a, z) => Math.hypot(a.x - 24000, a.y - 20500) - Math.hypot(z.x - 24000, z.y - 20500))[0];
  if (m) { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [m.x - 160, m.y]); await p.waitForTimeout(1500); }
  await shots('world');
  console.log( 'blocked', blocked.length, 'errs', errs.join('|') || 0); await b.close();
})();
