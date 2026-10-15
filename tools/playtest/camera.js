// Камера открытого мира: ~60 клеток по умолчанию, 30…90 колесом/щипком/кнопками мини-карты (общий зум),
// мини-карта = область камеры ×1.3, сервер шлёт мобов/игроков не дальше OPEN_AOI, чанки/производительность на 45.
// Скриншоты → /workspace/morrisgrad-round2/arinar-cam-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n, mobile) => {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' } : { viewport: { width: 1440, height: 860 } });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(n + ' ' + String(e).slice(0, 200)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=test_cam_${n}_${Date.now()}&ws=ws://127.0.0.1:8787${mobile ? '' : '&fs=1&panels=1'}&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    const G = (fn, a) => p.evaluate(fn, a);
    await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
      await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
      await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
    }
    return [p, G];
  };
  const [A, G] = await open('Cam');
  // у лагеря рядом с хабом (юг): мобы в кадре
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 23900, y: 26500, god: true }); window.__game.debug.teleport(23900, 26500); }); await A.waitForTimeout(5000);
  let c = await G(() => window.__game.debug.cam());
  ok(Math.abs(c.cells - 20) <= 2 && Math.abs(c.min - 10) <= 2 && Math.abs(c.max - 30) <= 2, `default ~20 cells, range ${c.min}…${c.max} (${JSON.stringify(c)})`);
  for (let k = 0; k < 12; k++) { await A.mouse.move(700, 400); await A.mouse.wheel(0, 400); await A.waitForTimeout(60); }
  await A.waitForTimeout(150); const mid = (await G(() => window.__game.debug.cam())).cells;
  await A.waitForTimeout(900); c = await G(() => window.__game.debug.cam());
  ok(Math.abs(c.cells - 30) <= 2, `wheel out clamps at ~30 cells (${c.cells}); smooth: mid-transition ${mid}`);
  const mm = await G(() => window.__game.debug.minimap());
  ok(Math.abs(mm.span - c.cells * 1.3 * 32) < 80, `minimap follows camera: ${mm.cam} cells → span ${mm.span}px`);
  const me = await G(() => window.__game.debug.pos());
  const mobs = await G(() => window.__game.debug.zoneMobs());
  const far = Math.max(0, ...mobs.map((m) => Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y))));
  ok(far <= 528 * 1.15 + 60, `server interest ≤ OPEN_AOI: ${mobs.length} mobs, farthest ${Math.round(far)}px (box ±${Math.round(528 * 1.15)})`);
  const t0 = await G(() => performance.now()); await A.waitForTimeout(4000);
  const ch = await G(() => window.__game.debug.chunks());
  const fps = await G(() => window.__game.debug.perf ? window.__game.debug.perf() : null);
  ok(ch && ch.live <= 30, `chunks at 30 cells: ${JSON.stringify(ch)} perf ${JSON.stringify(fps)}`);
  await A.screenshot({ path: `${OUT}/arinar-cam-30.png` });
  { // мерцание на 30 клетках: идём 3 с — чанки не выгружаются/не перебейкаются, пол не уходит в туман, тени покрывают обзор, near масштабирован
    const ch0 = await G(() => window.__game.debug.chunks());
    await A.keyboard.down('KeyD'); const shots = [];
    for (let i = 0; i < 6; i++) { await A.waitForTimeout(500); if (i % 2 === 0) { const f = `${OUT}/flicker-30-walk-${i / 2}.png`; await A.screenshot({ path: f }); shots.push(f); } }
    await A.keyboard.up('KeyD');
    const ch1 = await G(() => window.__game.debug.chunks()), r = await G(() => window.__game.debug.cam());
    const topDist = r.d / Math.cos(Math.max(0, Math.PI / 2 - r.pitch - (r.fov / 2) * Math.PI / 180)); // от камеры до верхнего края пола в кадре
    ok(ch1.evicted === ch0.evicted && ch1.live >= 20, `30 клеток, ходьба: чанки не выгружаются (${JSON.stringify(ch0)} → ${JSON.stringify(ch1)})`);
    ok(r.fogFar > topDist * 1.2 && r.shadowHalf >= r.d * 1.2 && r.near >= r.d * 0.05, `30 клеток: туман ${r.fogFar?.toFixed(0)} > верх пола ${topDist.toFixed(0)}, тени ±${r.shadowHalf}, near ${r.near.toFixed(2)} (d ${r.d.toFixed(1)})`);
  }
  await G(() => window.__game.debug.setCells(20)); await A.waitForTimeout(800); await A.screenshot({ path: `${OUT}/arinar-cam-20.png` });
  for (let k = 0; k < 12; k++) { await A.mouse.wheel(0, -400); await A.waitForTimeout(60); }
  await A.waitForTimeout(1000); c = await G(() => window.__game.debug.cam());
  ok(Math.abs(c.cells - 10) <= 1.5, `wheel in clamps at ~10 cells (${c.cells})`);
  await A.screenshot({ path: `${OUT}/arinar-cam-10.png` });
  await A.click('#mm-btn-minus'); await A.waitForTimeout(900); const c2 = await G(() => window.__game.debug.cam());
  ok(c2.cells >= c.cells * 1.15, `minimap «−» = camera zoom out (${c.cells} → ${c2.cells})`);
  // мобильный: щипок
  const [M, GM] = await open('CamM', true);
  await GM(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 23900, y: 26500, god: true }); window.__game.debug.teleport(23900, 26500); }); await M.waitForTimeout(4000);
  let cm = await GM(() => window.__game.debug.cam());
  ok(Math.abs(cm.cells - 20) <= 2, `mobile default ~20 cells (${JSON.stringify(cm)})`);
  await M.screenshot({ path: `${OUT}/arinar-cam-mobile-20.png` });
  const cdp = await M.context().newCDPSession(M);
  const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  await tp('touchStart', [[150, 400], [240, 400]]);
  for (let k = 1; k <= 8; k++) await tp('touchMove', [[150 - k * 8, 400], [240 + k * 8, 400]]);
  await tp('touchEnd', []); await M.waitForTimeout(900);
  const cm2 = await GM(() => window.__game.debug.cam());
  ok(cm2.cells < cm.cells * 0.8, `pinch out → zoom in (${cm.cells} → ${cm2.cells} cells)`);
  await GM(() => window.__game.debug.setCells(30)); await M.waitForTimeout(800);
  await M.screenshot({ path: `${OUT}/arinar-cam-mobile-30.png` });
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close();
})();
