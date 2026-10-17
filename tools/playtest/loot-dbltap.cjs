// LOCAL: окна добычи — двойной клик (ПК) / двойной тап (телефон) забирает предмет; Shift+клик на ПК по-прежнему. Только localhost (guardLocal).
// LD_BASE=http://127.0.0.1:5283/game.html LD_WS=ws://127.0.0.1:8839 node tools/playtest/loot-dbltap.cjs
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/loot-dbltap';
const BASE = process.env.LD_BASE || 'http://127.0.0.1:5283/game.html', WS = process.env.LD_WS || 'ws://127.0.0.1:8839', ADMIN = process.env.LD_ADMIN || 'upg_admin';
require('fs').mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (ctx, name, uid) => {
    const p = await ctx.newPage(); p.rx = []; p.tx = []; p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => { ws.on('framesent', (f) => { const s = String(f.payload); if (/"type":"(chest_take|loot_take)"/.test(s)) p.tx.push(JSON.parse(s)); });
      ws.on('framereceived', (f) => { const s = String(f.payload); if (/"type":"(chest_|dev_chests|admin_result|loot_bag)/.test(s) || s.includes('"loot":{')) { try { p.rx.push(JSON.parse(s)); } catch (_) {} } }); });
    await p.goto(assertLocalUrl(`${BASE}?name=${encodeURIComponent(name)}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1200);
    for (let i = 0; i < 4 && !(await p.evaluate(() => !!window.__game.meta?.hero)); i++) { await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1300); }
    return p;
  };
  const S = (p, o) => p.evaluate((x) => window.__game.debug.send(x), o), RAW = (p, o) => p.evaluate((x) => window.__game.debug.rawSend(x), o);
  const wait = async (p, pred, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const i = p.rx.findIndex(pred); if (i >= 0) return p.rx.splice(i, 1)[0]; await sleep(80); } return null; };
  // сундук теперь — за зачистку лагеря (camp-loot): Аринар → ближайший лагерь → убить всех → сундук в центре; возвращает chest_view
  const makeChest = async (p, skip = 0) => {
    for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) {
      await p.evaluate(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700);
      await RAW(p, { type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1500);
    }
    await p.evaluate(() => window.__game.debug.tp(24000, 20700, true)); await sleep(4000);
    let camps = []; for (let i = 0; i < 10 && !camps.length; i++) { await sleep(1000); camps = await p.evaluate(() => window.__game.debug.campsRaw() || []); }
    const P = await p.evaluate(() => window.__game.debug.pos());
    const camp = camps.filter((c) => c[3] === c[4] && c[4] >= 2 && c[4] <= 12).sort((a, z) => Math.hypot(a[1] - P.x, a[2] - P.y) - Math.hypot(z[1] - P.x, z[2] - P.y))[skip];
    if (!camp) return null;
    await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [camp[1], camp[2]]); await sleep(1500);
    let spawned = null; p.rx.length = 0;
    for (let i = 0; i < 40 && !spawned; i++) { await S(p, { type: 'dev_grant', killNear: true }); await sleep(450); spawned = p.rx.find((m) => m.type === 'chest_spawn'); }
    if (!spawned) return null;
    await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [spawned.x - 30, spawned.y + 20]); await sleep(900);
    p.rx.length = 0; await S(p, { type: 'chest_open', chest: spawned.id }); const v = await wait(p, (m) => m.type === 'chest_view');
    await p.waitForSelector('#mc-chest .cell[data-lid]', { timeout: 5000 }).catch(() => {}); return v;
  };
  const center = async (p, sel) => { const bb = await p.locator(sel).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  const nthLid = (p, i) => p.locator('#mc-chest .cell[data-lid]').nth(i).getAttribute('data-lid').then(Number);

  // ---------- подготовка (админ, локально): гарантированный дроп, долгая личная фаза ----------
  const actx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(actx);
  let A = await open(actx, 'Админ', ADMIN);
  await RAW(A, { type: 'admin_save', kind: 'chest', id: 'main', patch: { on: true, personalSec: 300, guard: false, takeRate: 6, campRaw: false, campMult: 100, campSecondPct: 0, campSpawnEmpty: true } }); const r1 = await wait(A, (m) => m.type === 'admin_result');
  await RAW(A, { type: 'admin_save', kind: 'curse', id: 'main', patch: { equipDropMult: 100 } }); const r2 = await wait(A, (m) => m.type === 'admin_result');
  ok(r1?.ok !== false && r2?.ok !== false, 'локальная настройка сундуков сохранена');
  const lbl = await A.evaluate(async () => { window.__game.debug.openAdmin(); await new Promise((r) => setTimeout(r, 1500)); document.querySelector('.mc-admin [data-tab="chest"]')?.click(); await new Promise((r) => setTimeout(r, 500)); document.querySelector('.mc-admin aside li[data-id="main"]')?.click(); await new Promise((r) => setTimeout(r, 1200)); return document.querySelector('.mc-admin section')?.textContent || ''; });
  ok(/двойной клик \/ Shift\+клик/.test(lbl), 'админка: подпись «Взятий в секунду (двойной клик / Shift+клик)»');
  await A.keyboard.press('Escape'); await A.evaluate(() => window.__game.debug.closeAdmin?.()); await sleep(400);
  const ADM = A; // админ — только настройки; игрок ПК — новый персонаж (стартует в хабе)
  { const pc = await open(actx, 'Кликер', 'dbltap_pc_' + Date.now().toString(36)); A = pc; }

  // ---------- ПК ----------
  const v = process.env.ONLY_MOBILE ? null : await makeChest(A, 0);
  ok(v && v.entries.length >= 3, `ПК: сундук открыт (${v?.entries?.length} поз.)`);
  if (v && v.entries.length >= 3) {
    const foot = await A.locator('#mc-chest footer small').innerText(); ok(/Двойной клик/.test(foot) && /Shift/.test(foot), `ПК подсказка: «${foot}»`);
    await A.screenshot({ path: `${OUT}/01-pc-chest-window.png` });
    // одиночный клик — не берёт, показывает имя и подсказку
    let lid = await nthLid(A, 0); A.tx.length = 0;
    await A.locator(`#mc-chest .cell[data-lid="${lid}"]`).click(); await sleep(700);
    const m1 = await A.locator('#mc-chest .msg').innerText();
    ok(A.tx.length === 0 && /«.+»/.test(m1) && /двойной клик/.test(m1), `ПК одиночный клик не берёт: «${m1}»`);
    await A.locator('#mc-chest').screenshot({ path: `${OUT}/02-pc-single-click-hint.png` });
    // двойной клик — берёт ровно одно
    await sleep(500); A.tx.length = 0; A.rx.length = 0;
    await A.locator(`#mc-chest .cell[data-lid="${lid}"]`).dblclick(); const t1 = await wait(A, (m) => m.type === 'chest_view' && m.taken === lid);
    ok(!!t1 && A.tx.filter((x) => x.type === 'chest_take').length === 1 && !t1.entries.some((e) => e.lid === lid), `ПК двойной клик: взят lid ${lid}, запросов ${A.tx.length}`);
    await sleep(300); await A.locator('#mc-chest').screenshot({ path: `${OUT}/03-pc-after-dblclick.png` });
    // Shift+клик — по-прежнему берёт сразу
    const live = await A.locator('#mc-chest .cell[data-lid]').count(); lid = await nthLid(A, 0); A.tx.length = 0; A.rx.length = 0;
    await A.locator(`#mc-chest .cell[data-lid="${lid}"]`).click({ modifiers: ['Shift'] }); const t2 = await wait(A, (m) => m.type === 'chest_view' && m.taken === lid);
    ok(!!t2 && A.tx.length === 1, `ПК Shift+клик: взят lid ${lid} (было ${live} позиций)`);
    // клики по РАЗНЫМ клеткам подряд — не двойной
    if ((await A.locator('#mc-chest .cell[data-lid]').count()) >= 2) {
      const a = await nthLid(A, 0), c = await nthLid(A, 1); A.tx.length = 0;
      await A.locator(`#mc-chest .cell[data-lid="${a}"]`).click(); await A.locator(`#mc-chest .cell[data-lid="${c}"]`).click(); await sleep(700);
      ok(A.tx.length === 0, 'ПК: клик по одной и сразу по другой клетке — ничего не взято');
    }
    // лимит сервера: двойные клики по всем клеткам очень быстро → сервер режет «Не так быстро» при takeRate 1
    await RAW(ADM, { type: 'admin_save', kind: 'chest', id: 'main', patch: { takeRate: 1 } }); await wait(ADM, (m) => m.type === 'admin_result'); await sleep(500);
    const lids = await A.locator('#mc-chest .cell[data-lid]').evaluateAll((els) => els.map((e) => Number(e.dataset.lid)));
    A.rx.length = 0; A.tx.length = 0;
    await A.evaluate((ls) => { for (const l of ls) { const el = document.querySelector(`#mc-chest .cell[data-lid="${l}"]`); el?.click(); el?.click(); } }, lids); // двойной клик по каждой клетке подряд, без пауз
    await sleep(1200); const errs = A.rx.filter((m) => m.type === 'chest_err').map((m) => m.message);
    ok(lids.length < 2 || errs.some((e) => /быстро/.test(e)), `лимит «Взятий в секунду» действует на двойной клик: ${lids.length} двойных кликов → ${A.tx.length} запросов, отказов «${errs.join(' | ')}»`);
    await A.locator('#mc-chest').screenshot({ path: `${OUT}/04-pc-ratelimit.png` }).catch(() => {});
    await RAW(ADM, { type: 'admin_save', kind: 'chest', id: 'main', patch: { takeRate: 6 } }); await wait(ADM, (m) => m.type === 'admin_result');
    await A.keyboard.press('Escape');
  }
  // ПК мешок: клик берёт (как раньше), подсказка про Shift
  { const P = await A.evaluate(() => window.__game.debug.pos()); await A.evaluate(([x, y]) => window.__game.debug.tp(x + 1600, y + 600, true), [P.x, P.y]); await sleep(700); const Q = await A.evaluate(() => window.__game.debug.pos());
    await A.evaluate(([x, y]) => window.__game.debug.devSpawn('dew_slime', x, y, false), [Q.x + 50, Q.y]); await sleep(600); A.rx.length = 0; await S(A, { type: 'dev_grant', killNear: true });
    const lm = await wait(A, (m) => !!(m.loot || m.push?.loot)?.bag, 4000); const bag = (lm?.loot || lm?.push?.loot)?.bag;
    if (bag) { await S(A, { type: 'loot_open', bag: bag.id ?? bag }); await A.waitForSelector('#mc-loot .cell[data-lid]', { timeout: 4000 }).catch(() => {}); }
    const has = await A.locator('#mc-loot').count();
    if (has) { const foot = await A.locator('#mc-loot footer small').innerText(); ok(/Shift/.test(foot), `ПК мешок, подсказка: «${foot}»`); await A.locator('#mc-loot').screenshot({ path: `${OUT}/05-pc-bag.png` }); await A.keyboard.press('Escape'); }
    else console.log('NOTE ПК: мешок не выпал/не открылся — пропуск', JSON.stringify(bag)); }

  // ---------- телефон ----------
  const mctx = await b.newContext({ ...devices['Pixel 7'] }); await guardLocal(mctx);
  const M = await open(mctx, 'Тапер', 'dbltap_m_' + Date.now().toString(36));
  ok(await M.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), 'телефон: сенсорный режим (hover:none)');
  let mv = null; for (let k = 1; k < 5 && !(mv && mv.entries.length >= 3); k++) { await M.keyboard.press('Escape').catch(() => {}); mv = await makeChest(M, k); }
  ok(mv && mv.entries.length >= 3, `телефон: сундук открыт (${mv?.entries?.length} поз.)`);
  if (mv && mv.entries.length >= 3) {
    const foot = await M.locator('#mc-chest footer small').innerText(); ok(/Двойной тап/.test(foot) && !/Shift/.test(foot), `телефон подсказка: «${foot}»`);
    await M.screenshot({ path: `${OUT}/06-mobile-chest-window.png` });
    let lid = await nthLid(M, 0); let c = await center(M, `#mc-chest .cell[data-lid="${lid}"]`); M.tx.length = 0;
    await M.touchscreen.tap(c.x, c.y); await sleep(800); const m1 = await M.locator('#mc-chest .msg').innerText();
    ok(M.tx.length === 0 && /нажмите дважды/.test(m1), `телефон одиночный тап не берёт, показывает «${m1}»`);
    await M.screenshot({ path: `${OUT}/07-mobile-single-tap.png` });
    const c2 = await center(M, `#mc-chest .cell[data-lid="${lid}"]`); ok(Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1, `окно не сдвинулось после подсказки (Δy ${(c2.y - c.y).toFixed(1)})`);
    await sleep(300); M.tx.length = 0; M.rx.length = 0;
    await M.touchscreen.tap(c.x, c.y); await sleep(40); await M.touchscreen.tap(c.x, c.y);
    const t1 = await wait(M, (m) => m.type === 'chest_view' && m.taken === lid);
    ok(!!t1 && M.tx.length === 1, `телефон двойной тап: взят lid ${lid}, запросов ${M.tx.length}`);
    const zoom = await M.evaluate(() => visualViewport ? visualViewport.scale : 1); ok(zoom === 1, `двойной тап не масштабирует страницу (scale ${zoom})`);
    await sleep(300); await M.screenshot({ path: `${OUT}/08-mobile-after-dbltap.png` });
    // ещё один двойной тап по следующему
    lid = await nthLid(M, 0); c = await center(M, `#mc-chest .cell[data-lid="${lid}"]`); M.rx.length = 0;
    { const cdp = await mctx.newCDPSession(M); const pt = [{ x: c.x, y: c.y }]; const ev = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pt });
      await Promise.all([ev('touchStart'), ev('touchEnd'), ev('touchStart'), ev('touchEnd')]); } // быстрый двойной тап (~реальный палец), без ожидания отрисовки между тапами const t2 = await wait(M, (m) => m.type === 'chest_view' && (m.taken === lid || !m.entries.length));
    const t2 = await wait(M, (m) => m.type === 'chest_view' && (m.taken === lid || !m.entries.length));
    ok(!!t2 || !(await M.locator('#mc-chest').count()), `телефон: второй предмет тоже взят двойным тапом (${lid})`);
    // медленные тапы (>400 мс) — не двойной
    if (await M.locator('#mc-chest .cell[data-lid]').count()) { lid = await nthLid(M, 0); c = await center(M, `#mc-chest .cell[data-lid="${lid}"]`); M.tx.length = 0;
      await M.touchscreen.tap(c.x, c.y); await sleep(700); await M.touchscreen.tap(c.x, c.y); await sleep(700); ok(M.tx.length === 0, 'телефон: два медленных тапа (700 мс) — не берут'); }
  }
  // телефон мешок: тап берёт, подсказка без Shift
  { const P = await M.evaluate(() => window.__game.debug.pos()); await M.evaluate(([x, y]) => window.__game.debug.tp(x - 1500, y + 700, true), [P.x, P.y]); await sleep(700); const Q = await M.evaluate(() => window.__game.debug.pos());
    await M.evaluate(([x, y]) => window.__game.debug.devSpawn('dew_slime', x, y, false), [Q.x + 50, Q.y]); await sleep(600); M.rx.length = 0; await S(M, { type: 'dev_grant', killNear: true });
    const lm = await wait(M, (m) => !!(m.loot || m.push?.loot)?.bag, 4000); const bag = (lm?.loot || lm?.push?.loot)?.bag;
    if (bag) { await S(M, { type: 'loot_open', bag: bag.id ?? bag }); await M.waitForSelector('#mc-loot .cell[data-lid]', { timeout: 4000 }).catch(() => {}); }
    if (await M.locator('#mc-loot .cell[data-lid]').count()) {
      const foot = await M.locator('#mc-loot footer small').innerText(); ok(!/Shift/.test(foot) && /Тап/.test(foot), `телефон мешок, подсказка: «${foot}»`);
      await M.screenshot({ path: `${OUT}/09-mobile-bag.png` });
      const lid = Number(await M.locator('#mc-loot .cell[data-lid]').first().getAttribute('data-lid')); const c = await center(M, `#mc-loot .cell[data-lid="${lid}"]`); M.tx.length = 0;
      await M.touchscreen.tap(c.x, c.y); await sleep(900); ok(M.tx.some((x) => x.type === 'loot_take'), `телефон мешок: тап берёт (${JSON.stringify(M.tx[0])})`);
    } else console.log('NOTE телефон: мешок не выпал — пропуск'); }
  const errs = [...A.errs, ...M.errs, ...ADM.errs]; ok(!errs.length, `ошибок страницы нет ${errs.join(' | ')}`);
  await RAW(ADM, { type: 'admin_save', kind: 'curse', id: 'main', patch: { equipDropMult: 0.1 } }); await RAW(ADM, { type: 'admin_save', kind: 'chest', id: 'main', patch: { campRaw: true, campMult: 1, campSpawnEmpty: false, personalSec: 120, guard: true } }); await sleep(800);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
