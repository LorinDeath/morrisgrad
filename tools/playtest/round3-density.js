// Раунд 3: админка «Спавн» → локации: правка плотности применяется сразу (лагеря пересобраны на сервере)
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const res = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('admin_result')) res.push(s.slice(0, 200)); }));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  // рощи к северу от двора
  const go = async (x, y) => { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await p.waitForTimeout(4500); };
  await go(24000, 20500);
  const n0 = await G(() => (window.__game.debug.campsRaw() || []).length);
  await G(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'region', id: 'groves', patch: { dens: 2.5, 'pack.0': 2, 'pack.1': 3 } })); await p.waitForTimeout(6000);
  const n1 = await G(() => (window.__game.debug.campsRaw() || []).length);
  ok(res.some((s) => s.includes('"ok":true')), 'админка сохранила плотность в D1: ' + (res[0] || ''));
  ok(n1 > n0, `лагерей рядом: ${n0} → ${n1} (пересборка вживую)`);
  await G(() => window.__game.debug.openAdmin()); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.mc-admin [data-tab="spawn"]')?.click()); await p.waitForTimeout(800);
  await p.evaluate(() => [...document.querySelectorAll('.mc-admin aside li')].find((l) => /Северные/.test(l.textContent))?.click()); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/r3-admin-density.png` });
  await G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'region', id: 'groves' })); await p.waitForTimeout(5000);
  const n2 = await G(() => (window.__game.debug.campsRaw() || []).length);
  ok(n2 < n1, `сброс — как в коде: ${n1} → ${n2}`);
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
