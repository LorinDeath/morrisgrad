// Карта мира + туман войны: маска с сервера, раскрытие при движении, M/кнопка 🗺, зум, объекты реестра,
// мини-карта под туманом, сохранение в D1 при перезаходе, у другого героя — с нуля. Скриншоты → /workspace/morrisgrad-round2/worldmap-*.png
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const UID = 'test_wm_' + Date.now();
  const open = async (n, mobile) => {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' } : { viewport: { width: 1440, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e).slice(0, 300)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${UID}&ws=ws://127.0.0.1:8787${mobile ? '' : '&fs=1&panels=1'}&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const toArinar = async (p) => {
    for (let i = 0; i < 8 && (await G(p, () => window.__game.state().world)) !== 'arinar'; i++) {
      await G(p, () => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await p.waitForTimeout(700);
      await G(p, () => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
    }
  };
  const tp = async (p, x, y) => { await G(p, ([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await p.waitForTimeout(1600); };
  const fogOf = (p) => G(p, () => window.__game.debug.fog());
  let A = await open('WmA');
  await G(A, () => window.__game.debug.selectClass('mage')); await A.waitForTimeout(2500);
  let f = await fogOf(A); ok(!f.active, `Поляна: тумана нет (${JSON.stringify(f)})`);
  await toArinar(A); await A.waitForTimeout(2500);
  f = await fogOf(A); ok(f.active && f.cells > 100, `Аринар: маска от сервера, открыто ${f.cells}`);
  const c0 = f.cells;
  for (const [x, y] of [[25200, 24150], [26400, 24150], [27600, 24600], [28800, 25200]]) await tp(A, x, y);
  f = await fogOf(A); ok(f.cells > c0 + 300, `при движении открывается: ${c0} → ${f.cells}`);
  await A.keyboard.press('KeyM'); await A.waitForTimeout(600);
  let wm = await G(A, () => window.__game.debug.worldMap());
  ok(wm.open && wm.fog, `M открывает карту (k=${wm.k?.toFixed(3)}, видно объектов ${wm.markers})`);
  ok(wm.markers >= 2, 'видны таблички/порталы рядом с хабом');
  await A.screenshot({ path: `${OUT}/worldmap-zoomed.png` });
  await G(A, () => window.__game.debug.mapZoom(0.05)); await A.waitForTimeout(300);
  wm = await G(A, () => window.__game.debug.worldMap()); ok(wm.k < 0.03, `отдаление до всей карты (k=${wm.k.toFixed(4)})`);
  await A.screenshot({ path: `${OUT}/worldmap-full-fog.png` });
  await A.mouse.move(700, 450); await A.mouse.down(); await A.mouse.move(500, 300, { steps: 5 }); await A.mouse.up();
  await A.keyboard.press('Escape'); await A.waitForTimeout(300);
  ok(!(await G(A, () => window.__game.debug.worldMap())).open, 'Esc закрывает карту');
  await tp(A, 24000, 24300); await A.waitForTimeout(800); // мини-карта = область камеры ×1.3 — объекты хаба рядом
  const mm = await G(A, () => window.__game.debug.minimap()); ok(mm && mm.markers >= 1, `мини-карта: объекты реестра под туманом (${mm?.markers}) ${JSON.stringify(mm)}`);
  await A.screenshot({ path: `${OUT}/worldmap-minimap-fog.png` });
  const before = f.cells;
  await A.context().close(); await new Promise((r) => setTimeout(r, 3000));
  const row = execSync(`cd server && npx wrangler d1 execute morrisgrad_db --local --json --command "SELECT hero, cells FROM hero_explore WHERE pkey LIKE '%${UID}%'"`).toString();
  ok(/"cells":\s*\d{3,}/.test(row), `D1 hero_explore сохранено при выходе: ${row.replace(/\s+/g, ' ').match(/\[\s*\{.*?\}\s*\]/)?.[0] || row.slice(-200)}`);
  const acc = execSync(`cd server && npx wrangler d1 execute morrisgrad_db --local --json --command "SELECT best_cells, heroes FROM account_explore WHERE pkey LIKE '%${UID}%'"`).toString();
  ok(/best_cells/.test(acc) && /"heroes":\s*1/.test(acc), 'account_explore — сводка по аккаунту');
  // перезаход (телефон): та же маска; кнопка 🗺 у мини-карты
  A = await open('WmA', true);
  await toArinar(A); await A.waitForFunction(() => window.__game.debug.fog().cells > 0, null, { timeout: 15000 }).catch(() => {});
  f = await fogOf(A); ok(f.active && f.cells >= before - 5, `после перезахода маска восстановлена: ${JSON.stringify(f)} (было ${before})`);
  const btn = await A.$('.mc3d-tbtn[data-act="map"]'); const bb = btn && await btn.boundingBox();
  if (btn) await btn.tap().catch(() => btn.click()); else await G(A, () => window.__game.debug.openMap());
  await A.waitForTimeout(600);
  ok(btn && (await G(A, () => window.__game.debug.worldMap())).open, `моб.: кнопка 🗺 открывает карту (${bb ? Math.round(bb.width) + '×' + Math.round(bb.height) : 'нет кнопки'})`);
  await A.screenshot({ path: `${OUT}/worldmap-mobile.png` });
  const xb = await A.$('.mc-worldmap .wm-x'); const xbb = await xb.boundingBox(); ok(xbb.width >= 44 && xbb.height >= 44, 'моб.: кнопки карты ≥44 px');
  await xb.tap();
  // другой герой — разведка с нуля
  await G(A, () => window.__game.debug.selectClass('warrior')); await A.waitForFunction(() => window.__game.debug.fog().cells < 400, null, { timeout: 15000 }).catch(() => {});
  f = await fogOf(A); ok(f.active && f.cells < 400, `новый герой (воин) — карта с нуля: ${JSON.stringify(f)}`);
  ok(!errs.length, 'без ошибок страницы ' + errs.slice(0, 3).join(' | '));
  console.log(`\n${pass}/${pass + fail} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
