const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.stack || e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:5199/game.html?name=Mobs&uid=test_r2_mobs_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1200);
  const walk = async (x, y) => { for (let i = 0; i < 400; i++) { const st = await G(() => window.__game.state().player); const dx = x - st.x, dy = y - st.y, d = Math.hypot(dx, dy); if (d < 5) break; const k = Math.min(1, 45 / d); await G(([a, c]) => window.__game.debug.teleport(a, c), [st.x + dx * k, st.y + dy * k]); await p.waitForTimeout(100); } };
  await walk(255, 600); await p.keyboard.press('KeyE'); await p.waitForTimeout(3000);
  console.log('world', await G(() => window.__game.state().world));
  const spots = [['meadow', 400, 1200], ['gardens', 1300, 840], ['wastes', 1000, 300]];
  for (const [nm, x, y] of spots) {
    await walk(x, y); await p.waitForTimeout(2500);
    await G(() => window.__game.debug.setZoom(0.4)); await p.waitForTimeout(600);
    const n = await G(() => window.__game.debug.zone.mobs.size);
    console.log(nm, 'mobs', n);
    await p.screenshot({ path: `${OUT}/arinar-${nm}.png` });
  }
  console.log(errs.slice(0, 5).join('\n'));
  await b.close();
})();
