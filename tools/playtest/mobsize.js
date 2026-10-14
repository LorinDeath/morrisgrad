// Размер мобов: кадр у большого лагеря на зуме 20 (по умолчанию). OUTNAME=mobs-size-before|after
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Size&uid=test_size_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
  }
  const CX = 24746, CY = 26870;
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [CX, CY + 200]); await p.waitForTimeout(4500);
  await G(() => window.__game.debug.setCells(20)); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/${process.env.OUTNAME || 'mobs-size'}.png` });
  if (process.env.CLICK) { // клик по телу ближайшего моба (точка над «ногами») выбирает его
    const mobs = await G(() => window.__game.debug.zoneMobs()); let okc = 0, tried = 0;
    for (const m of mobs.slice(0, 6)) { const sc = await G(([x, y]) => window.__game.debug.screenOf(x, y), [m.x, m.y]); if (!sc) continue; tried++;
      await p.mouse.click(sc.x, sc.y - 18); await p.waitForTimeout(250); const sel = await G(() => window.__game.debug.selected?.() ?? null); if (sel) okc++; }
    ok(tried > 0 && okc >= Math.ceil(tried * 0.6), `клик по телу моба выбирает цель: ${okc}/${tried}`);
  }
  ok(!errs.length, 'нет ошибок ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
