// Алтарь Перевоплощения: спрайт (цикл) + вспышка при открытии выбора героя. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  let opened = 0; p.on('websocket', (ws) => ws.on('framereceived', (f) => { if (String(f.payload).includes('open_class_selection')) opened++; }));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.teleport(565, 650)); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/altar-idle.png` });
  await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_class_select' }));
  await p.waitForTimeout(1500); await p.keyboard.press('Escape'); await p.waitForTimeout(1200);
  await G(() => window.__game.debug.altarFlash());
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(90); await p.screenshot({ path: `${OUT}/altar-flash-${i + 1}.png` }); }
  console.log('open_class_selection', opened, 'blocked', blocked.length, 'errs', errs.join('|') || 0); await b.close();
})();
