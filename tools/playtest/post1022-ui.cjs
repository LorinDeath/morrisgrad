// LOCAL: проверка исправлений после выкладки 22.10 на ПК 1280×800 и iPhone 13 (844×390, альбом): значки копий вещей, скрытые
// достижения, достижения «Сундуки», строка сундука в задании и на листке доски, кнопка «Кто в сети», ⛶ полный экран у карты,
// режим «✥ Настроить»: панель не закрывает блоки, сама пропускает указатель, тащится и сворачивается; каждый блок HUD хватается.
// Только 127.0.0.1 (_local.cjs). Снимки — OUT.
const { chromium } = require('playwright-core');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-qol/shots/post1022/ui';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8995';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n, x === undefined ? '' : JSON.stringify(x).slice(0, 600))) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 900))); };
const ONLY = (process.env.ONLY || 'pc,mob').split(',');
const stamp = Date.now().toString(36);
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const step = async (n, f) => { try { await f(); } catch (e) { t(n + ': исключение', false, String(e).slice(0, 300)); } };
async function open(b, mob) {
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA_IOS } : { viewport: { width: 1280, height: 800 } });
  await guardLocal(ctx);
  await ctx.addInitScript((ios) => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {}
    if (ios) { // iPhone Safari: Fullscreen API для страницы нет
      for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) try { delete Element.prototype[k]; Object.defineProperty(Element.prototype, k, { value: undefined, configurable: true }); } catch {}
      try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }); } catch {} } }, !!mob);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 300)));
  const uid = 'qa_p22_' + (mob ? 'mob' : 'pc') + '_' + stamp;
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  return { ctx, p };
}
const G = (p, f, a) => p.evaluate(f, a);
const clean = (p) => G(p, () => document.querySelectorAll('.mcl-err').forEach((e) => e.remove()));
const shot = async (p, n) => { await clean(p); await sleep(250); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
const rect = (p, sel) => G(p, (s) => { const L = [...document.querySelectorAll(s)].filter((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'; });
  if (!L.length) return null; let x = 1e9, y = 1e9, r = -1e9, b = -1e9; for (const e of L) { const q = e.getBoundingClientRect(); x = Math.min(x, q.left); y = Math.min(y, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); } return { x, y, r, b, w: r - x, h: b - y }; }, sel);
async function toArinar(p) {
  for (let i = 0; i < 8 && (await G(p, () => window.__game.state().world)) !== 'arinar'; i++) {
    await G(p, () => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200);
    await G(p, () => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000);
  }
  return (await G(p, () => window.__game.state().world)) === 'arinar';
}
async function stableRect(p, sel) { let a = await rect(p, sel); for (let i = 0; i < 12; i++) { await sleep(250); const b = await rect(p, sel); if (a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) return b; a = b; } return a; }
async function mouseDrag(p, x, y, dx, dy) { await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(x + dx * i / 10, y + dy * i / 10); await sleep(16); } await p.mouse.up(); await sleep(300); }
async function touchDrag(p, x, y, dx, dy, hold = 60) {
  const c = await p.context().newCDPSession(p); const pt = (X, Y) => [{ x: X, y: Y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) }); await sleep(hold);
  for (let i = 1; i <= 10; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + dx * i / 10, y + dy * i / 10) }); await sleep(20); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350); await c.detach();
}
const drag = (p, ...a) => (p.mob ? touchDrag(p, ...a) : mouseDrag(p, ...a));
async function tap(p, sel) { const r = await rect(p, sel); if (!r) return false; if (p.mob) await p.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); else await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await sleep(500); return true; }
/** Точка, где верхний элемент принадлежит блоку id (а не панели настройки и не другому блоку) */
const grabPoint = (p, id) => G(p, (id) => {
  const D = window.__game.uiDrag, els = [...D.els].filter(([, r]) => r.id === id).map(([e]) => e).filter((e) => e.getBoundingClientRect().width > 2);
  for (const el of els) { const q = el.getBoundingClientRect();
    for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) { const x = q.left + q.width * fx, y = q.top + q.height * fy; const h = document.elementFromPoint(x, y);
      if (h && els.some((e) => e.contains(h))) return { x, y, w: q.width, h: q.height, cx: innerWidth / 2 - x, cy: innerHeight / 2 - y }; } }
  const top = els[0] && document.elementFromPoint(els[0].getBoundingClientRect().left + 5, els[0].getBoundingClientRect().top + 5);
  return { none: true, n: els.length, top: top && (top.className || top.tagName) }; }, id);
const barInfo = (p) => G(p, () => {
  const D = window.__game.uiDrag, b = document.querySelector('.mc-uiedit-bar'); if (!b) return null; const q = b.getBoundingClientRect(), C = D.cont();
  const bl = D.blockRects().filter((r) => !['party'].includes('') ); const rr = { L: q.left - C.left, T: q.top - C.top, R: q.right - C.left, B: q.bottom - C.top };
  const over = bl.filter((r) => Math.min(rr.R, r.R - 3) - Math.max(rr.L, r.L + 3) > 0 && Math.min(rr.B, r.B - 3) - Math.max(rr.T, r.T + 3) > 0).map((r) => r.id);
  const fit = [...b.querySelectorAll('.tx b, .tx small, button')].filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim().slice(0, 24), ok: e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 2 }));
  const tx = b.querySelector('.tx'), tq = tx?.getBoundingClientRect(); const under = tq && tq.width ? document.elementFromPoint(tq.left + tq.width / 2, tq.top + tq.height / 2) : null;
  return { x: Math.round(rr.L), y: Math.round(rr.T), w: Math.round(q.width), h: Math.round(q.height), inView: q.left >= C.left - 1 && q.right <= C.right + 1 && q.top >= C.top - 1 && q.bottom <= C.bottom + 1, over, flag: b.dataset.over, fit, passThrough: !!under && !b.contains(under), min: b.classList.contains('min'), blocks: bl.map((r) => r.id) };
});
async function run(b, mob) {
  const tag = mob ? 'iphone13' : 'pc'; const { ctx, p } = await open(b, mob); p.mob = mob; const W = mob ? 844 : 1280, H = mob ? 390 : 800;
  await G(p, () => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(p, () => window.__game.board?.tut?.('skip')); await sleep(600);
  await G(p, () => window.__game.debug.rawSend({ type: 'dev_grant', xp: 4000 })); await sleep(800);
  // ——— 1. значки копий вещей (библиотека и сумка) ———
  await step(`${tag} значки копий`, async () => {
    for (const id of ['ice_whisper_wisp_weapon', 'ice_night_bat_weapon', 'fire_spitter_weapon', 'stone_golem_weapon', 'air_moon_moth_weapon']) await G(p, (id) => window.__game.debug.rawSend({ type: 'dev_grant', item: id }), id);
    await sleep(1200); await G(p, () => window.__game.debug.rawSend({ type: 'meta_get' })); await sleep(1200);
    await G(p, () => window.__game.debug.openBook('library')); await sleep(1500);
    await shot(p, `${tag}-01a-library-variant-icons`);
    const lib = await G(p, () => [...document.querySelectorAll('.mc-book [style*="background"]')].filter((e) => e.offsetParent && /items_atlas|url\(/.test(e.style.background + e.style.backgroundImage)).length);
    t(`${tag}: библиотека — открытые вещи со значком`, lib >= 5, lib);
    await G(p, () => window.__game.debug.openBook('gear')); await sleep(1500);
    await shot(p, `${tag}-01b-bag-variant-icons`);
    await p.keyboard.press('Escape'); await sleep(400); await G(p, () => { const b = document.querySelector('.mc-book'); if (b && b.style.display !== 'none') document.querySelector('.mc-book .x, .mc-book [data-x]')?.click(); });  await sleep(300);
  });
  // ——— 2/3. доска достижений: скрытые и «Сундуки» ———
  await step(`${tag} достижения`, async () => {
    await G(p, () => window.__game.boardWin.open('ab')); await sleep(900);
    await G(p, () => document.querySelector('.mc-bd [data-b="sec"][data-v="hidden"]')?.click()); await sleep(600);
    const hid = await G(p, () => [...document.querySelectorAll('.mc-bd-row')].slice(0, 6).map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)));
    t(`${tag}: раздел «Скрытые» — ??? до получения`, hid.length > 0, hid.slice(0, 3));
    await shot(p, `${tag}-02-ach-hidden`);
    await G(p, () => document.querySelector('.mc-bd [data-b="sec"][data-v="craft"]')?.click()); await sleep(600);
    const bch = await G(p, () => { const r = document.querySelector('.mc-bd-row[data-id^="ach_bch_"]'); r?.scrollIntoView({ block: 'start' }); return document.querySelectorAll('.mc-bd-row[data-id^="ach_bch_"]').length; }); await sleep(300);
    t(`${tag}: достижения «Сундуки» в «Добыча и ремесло» (17 открытых; 2 скрытых — в «Скрытых»)`, bch === 17, bch);
    await shot(p, `${tag}-03-ach-chests`);
    await G(p, () => window.__game.boardWin.close()); await sleep(300);
  });
  // ——— 4. строка сундука в ранговом задании (окно «Задания») ———
  await step(`${tag} строка сундука`, async () => {
    await G(p, () => window.__game.debug.rawSend({ type: 'dev_grant', boardRoll: { id: 'd_kill_a', r: 'C', n: 3 } })); await sleep(1200);
    await G(p, () => window.__game.boardWin.open('all', 'daily')); await sleep(900);
    const ln = await G(p, () => { const r = document.querySelector('.mc-bd-row[data-id="d_kill_a"]'); r?.scrollIntoView({ block: 'center' }); const c = r?.querySelector('.mc-bd-chest'); return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; });
    t(`${tag}: «+ сундук: Редкий сундук (шанс проклятого 15%)» и место в хранилище`, ln && /\+ сундук: редкий \(шанс проклятого 15%\)/i.test(ln) && /100/.test(ln), ln);
    await shot(p, `${tag}-04-task-chest-line`);
    await G(p, () => window.__game.boardWin.close()); await sleep(300);
  });
  // ——— 7. листок доски объявлений: ранг + сундук ———
  await step(`${tag} листки`, async () => {
    const hid = await G(p, () => { const L = window.__game.board.boardOrders?.() || []; return L.filter((x) => x.cat === 'hunt').map((x) => x.id).slice(0, 3); });
    for (const id of hid.slice(0, 2)) await G(p, (id) => window.__game.debug.rawSend({ type: 'dev_grant', boardRoll: { id, r: 'B' } }), id);
    await sleep(1200);
    await G(p, () => window.__game.boardWin.open('nb')); await sleep(1000);
    const nb = await G(p, () => [...document.querySelectorAll('.mc-nb-sheet')].map((s) => ({ rk: s.querySelector('.nm .mc-rank')?.textContent || '', ch: s.querySelector('.mc-bd-chest')?.textContent.replace(/\s+/g, ' ').trim() || '' })));
    t(`${tag}: на листках значок ранга`, nb.length && nb.some((x) => x.rk), nb.slice(0, 4));
    t(`${tag}: на листках строка сундука`, nb.some((x) => /сундук/.test(x.ch)), nb.filter((x) => x.ch).slice(0, 2));
    await shot(p, `${tag}-07-noticeboard-rank-chest`);
    await G(p, () => window.__game.boardWin.close()); await sleep(300);
  });
  t(`${tag}: в Аринаре`, await toArinar(p)); await clean(p); await sleep(1500);
  // цель — ближайший моб (панель «ЦЕЛЬ»)
  await step(`${tag} цель`, async () => {
    const pl = await G(p, () => window.__game.debug.pos());
    const c = await G(p, () => { const pl = window.__game.debug.pos(); const cs = (window.__game.debug.campsRaw() || []).slice().sort((a, b) => Math.hypot(a[1] - pl.x, a[2] - pl.y) - Math.hypot(b[1] - pl.x, b[2] - pl.y)); return cs[0] && { x: cs[0][1], y: cs[0][2] }; });
    if (c) { await G(p, (c) => window.__game.debug.tp(c.x + 260, c.y + 260, true), c); await sleep(3500); }
    const id = await G(p, () => { const pl = window.__game.debug.pos(); const ms = window.__game.debug.zoneMobsFull().slice().sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)); return ms[0]?.id; });
    let sel = false; for (let k = 0; k < 4 && !(await G(p, () => document.querySelector('.mc-ighud')?.classList.contains('tgt'))); k++) { const id2 = await G(p, () => { const pl = window.__game.debug.pos(); const ms = window.__game.debug.zoneMobsFull().filter((m) => m.hp > 0).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)); return ms[0]?.id; });
      sel = id2 != null && await G(p, (id) => window.__game.debug.selectMobId(id), id2); await sleep(900); }
    if (mob) { t(`${tag}: цель выбрана (на телефоне панели «ЦЕЛЬ» нет по задумке — .mc-ighud.mob скрывает .ig-tgt)`, sel && await G(p, () => document.querySelector('.mc-ighud')?.classList.contains('tgt'))); return; }
    t(`${tag}: панель «ЦЕЛЬ» видна`, sel && !!(await rect(p, '.ig-tgt')), { id, pl, sel, hud: await G(p, () => document.querySelector('.mc-ighud')?.className), n: await G(p, () => window.__game.debug.zoneMobsFull().length), pos: await G(p, () => window.__game.debug.pos()) });
  });
  await shot(p, `${tag}-05-hud-default`);
  // ——— 5. кнопка «Кто в сети» (ПК) ———
  if (!mob) await step('pc онлайн', async () => {
    const row = await G(p, () => [...document.querySelectorAll('.mc-bookbtn, .mc-ratebtn')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { c: e.className.replace(/mc-dr\S*/g, '').trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), vis: !!top && e.contains(top) }; }));
    const on = row.find((x) => /mc-onlinebtn/.test(x.c));
    t('ПК: 👥 «Кто в сети» видна и не закрыта другой кнопкой', on && on.vis, row);
    const lefts = row.filter((x) => Math.abs(x.y - (on?.y ?? 0)) < 4).map((x) => x.x).sort((a, b) => a - b); const dup = lefts.some((x, i) => i && x - lefts[i - 1] < 30);
    t('ПК: в ряду кнопок нет наложений', !dup, lefts);
    await tap(p, '.mc-onlinebtn'); await sleep(900);
    const soc = await rect(p, '.mc-social, .mc-soc'); t('ПК: «Кто в сети» открывает список игроков', !!soc, soc);
    await shot(p, 'pc-05b-online-panel'); await tap(p, '.mc-soc-x'); await sleep(500);
    t('ПК: ✕ закрывает список', !(await rect(p, '.mc-social, .mc-soc')));
  });
  // ——— 8. ⛶ полный экран у миникарты ———
  await step(`${tag} полный экран`, async () => {
    const fb = await G(p, () => { const b = document.querySelector('.ig-fs'); if (!b) return null; const r = b.getBoundingClientRect(), m = document.querySelector('.ig-mm').getBoundingClientRect(); return { hidden: b.hidden || getComputedStyle(b).display === 'none', title: b.title, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), mm: { x: Math.round(m.left), y: Math.round(m.top), r: Math.round(m.right), b: Math.round(m.bottom) } }; });
    if (mob) { t('iPhone 13: без Fullscreen API кнопки ⛶ нет (игра и так во всё окно)', fb && fb.hidden, fb); return; }
    t('ПК: ⛶ у миникарты, подсказка «Полноэкранный режим»', fb && !fb.hidden && fb.title === 'Полноэкранный режим' && fb.y >= fb.mm.y - 4 && fb.y <= fb.mm.b + 40, fb);
    await p.mouse.move(fb.x + fb.w / 2, fb.y + 8); await sleep(300); await p.screenshot({ path: `${OUT}/pc-08a-fs-button.png`, clip: { x: Math.max(0, fb.mm.x - 60), y: Math.max(0, fb.mm.y - 10), width: Math.min(1280 - Math.max(0, fb.mm.x - 60), 360), height: Math.min(300, 800 - fb.mm.y) } });
    await tap(p, '.ig-fs'); await sleep(800);
    const on = await G(p, () => ({ fe: document.fullscreenElement === document.documentElement, title: document.querySelector('.ig-fs').title, cls: document.querySelector('.ig-fs').classList.contains('on'), w: innerWidth, h: innerHeight }));
    t('ПК: нажатие — весь документ в полном экране, значок «выйти»', on.fe && on.title === 'Выйти из полноэкранного режима' && on.cls, on);
    await shot(p, 'pc-08b-fullscreen-on');
    await G(p, () => document.exitFullscreen()); await sleep(800); // как Esc / F11: выход браузером
    const off = await G(p, () => ({ fe: !!document.fullscreenElement, title: document.querySelector('.ig-fs').title, full: (() => { const g = document.getElementById('game-window'); if (!g) return null; const r = g.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(), W: innerWidth, H: innerHeight }));
    t('ПК: выход (Esc) — значок снова «войти», окно игры остаётся во всё окно', !off.fe && off.title === 'Полноэкранный режим' && (!off.full || off.full.w >= off.W - 2 && off.full.h >= off.H - 2), off);
  });
  // ——— 9. режим «✥ Настроить» ———
  await step(`${tag} настройка`, async () => {
    await G(p, () => window.__game.uiDrag.reset()); await G(p, () => window.__game.uiDrag.setEdit(true)); await sleep(600);
    const bi = await barInfo(p);
    t(`${tag}: панель настройки в окне, не закрывает ни один блок`, bi && bi.inView && !bi.over.length && !bi.flag, bi);
    t(`${tag}: текст панели помещается`, bi && bi.fit.every((x) => x.ok), bi?.fit);
    t(`${tag}: панель пропускает указатель (под текстом — игра/блок)`, bi && bi.passThrough, bi);
    await shot(p, `${tag}-09a-edit-mode`);
    const ids = await G(p, () => { const D = window.__game.uiDrag; return [...new Set([...D.els].filter(([e, r]) => !r.win && e.getBoundingClientRect().width > 2 && getComputedStyle(e).visibility !== 'hidden').map(([, r]) => r.id))]; });
    t(`${tag}: блоки на экране`, ids.length >= (mob ? 6 : 8), ids);
    for (const id of ['party', 'tgt', 'btns']) if (!ids.includes(id) && !(mob && (id === 'btns' || id === 'tgt'))) t(`${tag}: блок ${id} есть на экране`, false, ids);
    const res = {};
    for (const id of ids) {
      const g = await grabPoint(p, id); if (g.none) { res[id] = 'не схватить: ' + g.top; continue; }
      const dx = Math.max(-60, Math.min(60, Math.sign(g.cx) * 50)) || 40, dy = Math.max(-40, Math.min(40, Math.sign(g.cy) * 30)) || 20;
      await drag(p, g.x, g.y, dx, dy, 60);
      const off = (await G(p, () => window.__game.uiDrag.state())).off[id];
      res[id] = off && (Math.abs(off[0]) > 0.005 || Math.abs(off[1]) > 0.005) ? 'ok' : 'не сдвинулся';
    }
    t(`${tag}: каждый блок хватается и двигается в режиме настройки`, Object.values(res).every((v) => v === 'ok'), res);
    const bi2 = await barInfo(p); t(`${tag}: после перестановки панель снова на свободном месте`, bi2 && !bi2.over.length, bi2);
    await shot(p, `${tag}-09b-edit-moved`);
    // ручка ✥: перетащить панель; «–» — свернуть
    const gr = await stableRect(p, '.mc-uiedit-bar .grip'); const b0 = await barInfo(p); const c0 = await G(p, () => window.__game.uiDrag.cont().top);
    await drag(p, gr.x + gr.w / 2, gr.y + gr.h / 2, mob ? -120 : -200, mob ? 60 : 120, 30);
    const b1 = await barInfo(p); t(`${tag}: панель тащится за ✥`, Math.abs(b1.x - b0.x) > 40 || Math.abs(b1.y - b0.y) > 30, { b0: [b0.x, b0.y], b1: [b1.x, b1.y], c0, c1: await G(p, () => window.__game.uiDrag.cont().top), gr });
    await tap(p, '.mc-uiedit-bar .mn'); const b2 = await barInfo(p);
    t(`${tag}: «–» сворачивает панель в значок`, b2.min && b2.w < 140, { w: b2.w, h: b2.h });
    await shot(p, `${tag}-09c-edit-bar-min`);
    await tap(p, '.mc-uiedit-bar .mn'); const b3 = await barInfo(p); t(`${tag}: «+» разворачивает`, !b3.min, b3.w);
    // «Сбросить всё» — блоки на место
    await tap(p, '.mc-uiedit-bar [data-e="reset"]'); const L = await G(p, () => window.__game.uiDrag.state());
    t(`${tag}: «Сбросить всё»`, !Object.keys(L.off).length, L.off);
    await tap(p, '.mc-uiedit-bar [data-e="done"]'); t(`${tag}: «Готово» — выход из режима`, !(await G(p, () => window.__game.uiDrag.state().edit)));
  });
  // ——— 6. «ЦЕЛЬ», «Отряд», кнопки меню: тащатся, клики работают ———
  await step(`${tag} перенос блоков`, async () => {
    await G(p, () => window.__game.uiDrag.setEdit(true)); await sleep(400);
    for (const [id, dx, dy] of [['tgt', -260, 140], ['party', 220, 60], ['btns', 160, -40]]) {
      if (mob && (id === 'btns' || id === 'tgt')) continue; const g = await grabPoint(p, id); if (g.none) { t(`${tag}: ${id} — точка захвата`, false, g); continue; }
      await drag(p, g.x, g.y, dx, dy, 60); const off = (await G(p, () => window.__game.uiDrag.state())).off[id];
      t(`${tag}: «${id}» перетащен`, !!off, off);
    }
    await shot(p, `${tag}-06a-moved-target-party-buttons`);
    await G(p, () => window.__game.uiDrag.setEdit(false)); await sleep(400);
    const inv = await tap(p, '.mc-party [data-p="pick"]'); const pick = await G(p, () => !!document.querySelector('.mc-party .pick'));
    t(`${tag}: после переноса «＋ Пригласить» открывает список`, inv && pick);
    await shot(p, `${tag}-06b-party-invite-after-move`);
    await tap(p, '.mc-party [data-p="pick"]');
    if (!mob) { const bb = await G(p, () => { const e = [...document.querySelectorAll('.mc-bookbtn')].find((x) => ![...x.classList].some((c) => /^mc-(char|board|help|bchest)btn$/.test(c))); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y); const b = document.querySelector('.mc-book'); return { x, y, at: h && (h.className || h.tagName), was: !!b && b.style.display !== 'none' }; }); await p.mouse.click(bb.x, bb.y); await sleep(700); console.log('book-dbg', JSON.stringify(bb)); const bk = await G(p, () => { const b = document.querySelector('.mc-book'); return !!b && b.style.display !== 'none'; }); t('ПК: после переноса кнопка 📖 открывает книгу', bk); await p.keyboard.press('Escape'); await sleep(400); }
    // после перезагрузки — на тех же местах
    const before = (await G(p, () => window.__game.uiDrag.state())).off; await sleep(1200);
    await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.uiDrag, null, { timeout: 120000 }); await sleep(3500);
    const after = (await G(p, () => window.__game.uiDrag.state())).off;
    t(`${tag}: раскладка сохраняется после перезагрузки`, Object.keys(before).length >= 1 && Object.keys(before).every((k) => after[k] && before[k] && Math.abs(after[k][0] - before[k][0]) < 0.002), { before, after });
    await G(p, () => window.__game.uiDrag.reset()); await sleep(900);
  });
  t(`${tag}: без ошибок страницы`, !p.errs.length, p.errs.slice(0, 3));
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const m of [false, true]) { if (!ONLY.includes(m ? 'mob' : 'pc')) continue; try { await run(b, m); } catch (e) { bad++; console.log('FAIL exception', String(e).slice(0, 400)); } }
  await b.close(); console.log(`post1022-ui: ${ok} ok, ${bad} fail`); process.exit(bad ? 1 : 0);
})();
