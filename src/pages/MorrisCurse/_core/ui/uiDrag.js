// Перетаскивание интерфейса: блоки HUD и окна. Сдвиг каждого блока от его места по умолчанию хранится в долях окна игры [dx, dy]
// (на другом размере экрана — пропорционально) и применяется CSS-свойством `translate` (не трогает transform/zoom самих блоков).
// ПК: окна — за заголовок; блоки HUD — в режиме «✥ Настроить». Телефон: долгое нажатие на блок (кнопки управления не трогаем).
// Блок всегда целиком в окне (пересчёт при resize/повороте/полноэкранном режиме). Раскладка — на сервере (аккаунт, отдельно ПК/телефон,
// server/meta/uiLayout.ts) + кэш в localStorage. Админка «🎨 Интерфейс»: drag / dragMobile / longPressMs.
import { UI } from './uiSkin.js';

// id — те же, что принимает сервер (UI_LAY_IDS); win — окно (тащится за заголовок без режима настройки); group — несколько элементов одним блоком
export const DRAG_REG = [
  { id: 'pframe', sel: '.mc-pframe', name: 'Портрет' },
  { id: 'pfmob', sel: '.mc-pf-mob', name: 'Портрет' },
  { id: 'tracker', sel: '.mc-tracker', name: 'Задания' },
  { id: 'abar', sel: '.mc-abar', name: 'Панель умений', pc: true },
  { id: 'xp', sel: '.mc-xpbar', name: 'Опыт' },
  { id: 'party', sel: '.mc-party', name: 'Отряд' },
  { id: 'mm', sel: '.ig-mm, .hud-minimap-card', name: 'Миникарта' },
  { id: 'tgt', sel: '.ig-tgt', name: 'Цель' },
  { id: 'chat', sel: '.mc3d-chat', name: 'Чат' },
  { id: 'toasts', sel: '.mc3d-toasts', name: 'Сообщения' },
  { id: 'btns', sel: '.mc-bookbtn, .mc-ratebtn', name: 'Кнопки меню', group: true },
  { id: 'dps', sel: '.mc-dps', name: 'Урон' },
  { id: 'book', sel: '.mc-book', win: true },
  { id: 'char', sel: '.mc3d-soul-screen > :first-child', win: true },
  { id: 'soc', sel: '.mc3d-screen.mc-social > .mc-soc', win: true },
  { id: 'altar', sel: '.mc-altar-screen > :first-child', win: true },
  { id: 'loot', sel: '#mc-loot', win: true },
  { id: 'chest', sel: '#mc-chest', win: true },
  { id: 'bchest', sel: '#mc-bchest', win: true },
  { id: 'upg', sel: '.mc-upg', win: true },
  { id: 'board', sel: '.mc-bd', win: true },
  { id: 'map', sel: '.mc-worldmap', win: true },
];
const LS = 'mc_uilay_v1';
const NO_DRAG = 'button, input, select, textarea, a, label, [data-act], [contenteditable], .mc-soc-x, .mc-tab, [role="button"]';
const HEAD = '[class*="head"], [class*="title"], h1, h2, h3';
const r4 = (v) => Math.round(v * 10000) / 10000;

export class UiDrag {
  constructor({ root, layer, mobile, send, onMove }) {
    this.root = root; this.layer = layer; this.mobile = !!mobile; this.send = send; this.onMove = onMove;
    this.dev = this.mobile ? 'mob' : 'pc';
    this.st = this.load(); this.edit = false; this.drag = null; this.els = new Map(); this.sendT = 0; this.suppress = 0;
    this.reg = DRAG_REG.filter((r) => !(r.pc && this.mobile));
    root.addEventListener('pointerdown', (e) => this.down(e), true);
    window.addEventListener('pointermove', (e) => this.move(e), true);
    window.addEventListener('pointerup', (e) => this.up(e), true);
    window.addEventListener('pointercancel', (e) => this.up(e, true), true);
    window.addEventListener('touchmove', (e) => { if (this.drag?.live || this.drag?.armed && this.mobile) e.preventDefault(); }, { passive: false, capture: true }); // iOS: тащим блок — не прокручивать
    root.addEventListener('click', (e) => { if (this.edit && this.find(e.target) || performance.now() < this.suppress) { e.preventDefault(); e.stopPropagation(); } }, true);
    root.addEventListener('contextmenu', (e) => { if (this.drag || (this.mobile && this.find(e.target))) e.preventDefault(); }, true);
    window.addEventListener('keydown', (e) => { if (this.edit && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.setEdit(false); } }, true);
    const re = () => requestAnimationFrame(() => this.clampAll());
    window.addEventListener('resize', re); window.addEventListener('orientationchange', () => setTimeout(re, 250)); document.addEventListener('fullscreenchange', re);
    new MutationObserver(() => this.scan(false)).observe(layer, { childList: true });
    this.iv = setInterval(() => this.scan(true), 400);
    this.scan(true);
  }
  enabled() { return UI.drag !== false && !(this.mobile && UI.dragMobile === false); }
  lay() { return (this.st[this.dev] ||= { off: {}, at: 0 }); }
  locked() { return !!this.lay().lock; }
  load() { try { const v = JSON.parse(localStorage.getItem(LS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }
  save(push = true) {
    try { localStorage.setItem(LS, JSON.stringify(this.st)); } catch (_) {}
    if (!push) return;
    clearTimeout(this.sendT);
    this.sendT = setTimeout(() => { const L = this.lay(); this.send?.({ type: 'ui_layout_set', dev: this.dev, lay: L.off, lock: !!L.lock }); }, 800);
  }
  /** meta_state.uiLay при входе: новее — побеждает (сервер или кэш этого устройства); кэш новее — отправить на сервер */
  applyServer(v) {
    const s = v && typeof v === 'object' ? v[this.dev] : null, L = this.lay();
    if (s && (Number(s.at) || 0) >= (Number(L.at) || 0)) { this.st[this.dev] = { off: { ...(s.off || {}) }, lock: s.lock ? 1 : 0, at: Number(s.at) || Date.now() }; this.save(false); }
    else if (L.at && Object.keys(L.off || {}).length) this.save(true);
    this.scan(true);
  }
  find(t) { if (!t?.closest) return null; for (const [el, r] of this.els) if (el.contains(t)) return { el, r }; return null; }
  cont() { return this.root.getBoundingClientRect(); }
  /** найти блоки на странице и сразу выставить сохранённый сдвиг (без чтения размеров); clamp — с размерами, только видимые */
  scan(clamp) {
    const on = this.enabled(), C = this.cont(), seen = new Set();
    for (const r of this.reg) {
      const list = r.group ? [...this.root.querySelectorAll(r.sel)] : [this.root.querySelector(r.sel)].filter(Boolean);
      for (const el of list) { seen.add(el); if (!this.els.has(el)) { this.els.set(el, r); el.classList.add('mc-dr'); if (r.win) el.classList.add('mc-dr-win'); } }
      if (!list.length) continue;
      const o = on ? this.lay().off?.[r.id] : null;
      for (const el of list) this.put(el, o ? o[0] * C.width : 0, o ? o[1] * C.height : 0);
    }
    for (const el of [...this.els.keys()]) if (!seen.has(el)) { this.els.delete(el); }
    for (const el of this.els.keys()) el.classList.toggle('mc-dr-edit', this.edit && on);
    if (clamp) this.clampAll();
  }
  put(el, x, y) {
    const z = el.currentCSSZoom || 1, v = x || y ? `${Math.round(x / z * 10) / 10}px ${Math.round(y / z * 10) / 10}px` : '';
    el._mcT = [x, y];
    if (el.style.translate !== v) { el.style.translate = v; // смещение ещё и в переменных: анимации по translate (вздрагивание при наведении) строятся от него, иначе на миг возвращают блок на старое место и клик уходит мимо
      if (v) { const [dx, dy] = v.split(' '); el.style.setProperty('--mc-dx', dx); el.style.setProperty('--mc-dy', dy); } else { el.style.removeProperty('--mc-dx'); el.style.removeProperty('--mc-dy'); } }
  }
  members(r) { const out = []; for (const [el, rr] of this.els) if (rr === r) out.push(el); return out; }
  /** прямоугольник блока без нашего сдвига (союз элементов группы); null — не виден */
  natural(list) {
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    for (const el of list) { const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue; const t = el._mcT || [0, 0];
      L = Math.min(L, b.left - t[0]); T = Math.min(T, b.top - t[1]); R = Math.max(R, b.right - t[0]); B = Math.max(B, b.bottom - t[1]); }
    return L === Infinity ? null : { L, T, R, B };
  }
  /** сдвиг (px) так, чтобы блок целиком был в окне игры */
  clampPx(n, C, x, y) {
    const fit = (a, b, lo, hi, d) => (b - a >= hi - lo ? lo - a : Math.min(hi - b, Math.max(lo - a, d)));
    return [fit(n.L, n.R, C.left, C.right, x), fit(n.T, n.B, C.top, C.bottom, y)];
  }
  clampAll() {
    if (!this.enabled()) return; const C = this.cont(); if (C.width < 50) return;
    const off = this.lay().off || {};
    for (const r of this.reg) {
      const o = off[r.id]; if (!o) continue; const list = this.members(r); if (!list.length) continue;
      const n = this.natural(list); if (!n) continue;
      const [x, y] = this.clampPx(n, C, o[0] * C.width, o[1] * C.height);
      for (const el of list) this.put(el, x, y);
    }
    if (this.edit) this.placeBar();
    this.onMove?.();
  }
  canStart(hit, e) {
    if (!this.enabled() || this.locked() && !this.edit) return false;
    if (this.edit) return true;
    if (hit.r.win) { // окно — за заголовок (или верхние 34 px рамки), не за кнопки; на телефоне — ещё и долгим нажатием
      if (e.target.closest(NO_DRAG)) return false;
      const h = e.target.closest(HEAD); if (h && hit.el.contains(h)) return true;
      return e.clientY - hit.el.getBoundingClientRect().top < 34;
    }
    return this.mobile; // блоки HUD: телефон — долгое нажатие; ПК — только в режиме «✥ Настроить»
  }
  down(e) {
    if (e.button > 0 || this.drag || this.replay) return;
    if (this.mobile && e.target.closest?.('.mc3d-touch') && !this.find(e.target)) return; // джойстик и кнопки боя — не трогаем
    const hit = this.find(e.target); if (!hit || !this.canStart(hit, e)) return;
    const list = hit.r.group ? this.members(hit.r) : [hit.el], n = this.natural(list); if (!n) return;
    const t = hit.el._mcT || [0, 0];
    this.drag = { r: hit.r, list, n, sx: e.clientX, sy: e.clientY, bx: t[0], by: t[1], id: e.pointerId, live: false, at: performance.now(), lp: 0 };
    if (this.mobile && !this.edit && !hit.r.win) { // блок HUD на телефоне: его действие (задания → книга, рамка → C) — по отпусканию короткого касания, иначе долгое нажатие сначала открыло бы окно
      e.stopPropagation(); this.drag.tap = { t: e.target, init: { bubbles: true, cancelable: true, composed: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons } };
    }
    if (this.mobile && !this.edit) { // долгое нажатие: до срабатывания палец можно увести — тогда это обычное касание
      const ms = Math.min(1500, Math.max(250, Number(UI.longPressMs) || 450));
      this.drag.lp = setTimeout(() => { if (this.drag && !this.drag.live) { this.drag.armed = true; this.go(); try { navigator.vibrate?.(15); } catch (_) {} } }, ms);
    } else this.drag.armed = true;
    if (this.edit) { e.preventDefault(); e.stopPropagation(); }
  }
  go() { const d = this.drag; d.live = true; for (const el of d.list) el.classList.add('mc-dr-live'); document.documentElement.classList.add('mc-dragging'); }
  move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.live) {
      if (!d.armed) { if (Math.hypot(dx, dy) > 10) this.cancel(); return; } // телефон: увёл палец до долгого нажатия
      if (Math.hypot(dx, dy) < 6) return;
      this.go();
    }
    e.preventDefault(); e.stopPropagation();
    const C = this.cont(), [x, y] = this.clampPx(d.n, C, d.bx + dx, d.by + dy);
    for (const el of d.list) this.put(el, x, y);
    d.x = x; d.y = y; this.onMove?.();
  }
  cancel() { const d = this.drag; if (!d) return; clearTimeout(d.lp); for (const el of d.list) el.classList.remove('mc-dr-live'); document.documentElement.classList.remove('mc-dragging'); this.drag = null; }
  up(e, cancel) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const live = d.live; this.cancel();
    if (!live) {
      if (d.armed && this.mobile && !this.edit) this.suppress = performance.now() + 350; // долгое нажатие без сдвига — не «тап»
      else if (d.tap && !cancel && d.tap.t.isConnected) { this.replay = true; try { d.tap.t.dispatchEvent(new PointerEvent('pointerdown', d.tap.init)); } finally { this.replay = false; } } // короткое касание — как обычно
      return;
    }
    e.preventDefault(); e.stopPropagation(); this.suppress = performance.now() + 350; // отпускание не «кликает» по блоку
    if (cancel || d.x == null) return;
    const C = this.cont(), L = this.lay(); L.off ||= {};
    const fx = r4(d.x / C.width), fy = r4(d.y / C.height);
    if (Math.abs(fx) < 1e-3 && Math.abs(fy) < 1e-3) delete L.off[d.r.id]; else L.off[d.r.id] = [fx, fy];
    L.at = Date.now(); this.save(true);
    if (this.edit) this.placeBar();
  }
  setEdit(v) {
    this.edit = !!v && this.enabled(); document.documentElement.classList.toggle('mc-uiedit', this.edit);
    if (this.edit && !this.bar) this.mkBar();
    if (this.bar) this.bar.style.display = this.edit ? '' : 'none';
    if (!this.edit) this.barUser = null; // новый сеанс настройки — панель снова сама ищет свободное место
    this.scan(true);
    if (this.edit) requestAnimationFrame(() => this.placeBar());
  }
  /** Панель режима настройки. Не должна закрывать перетаскиваемые блоки: сама панель пропускает указатель
   *  (pointer-events: none), ловят только её кнопки и ручка ✥; место выбирается свободное от блоков (placeBar),
   *  её можно перетащить за ✥ и свернуть в маленький значок. */
  mkBar() {
    const b = document.createElement('div'); b.className = 'mc-uiedit-bar';
    const how = this.mobile ? 'Перетащите блок пальцем · двойное касание — на место' : 'Перетащите блок мышью · двойной щелчок — на место';
    b.innerHTML = `<button type="button" class="grip" data-e="grip" title="Перетащить эту панель" aria-label="Перетащить эту панель">✥</button>`
      + `<span class="tx"><b>Настройка интерфейса</b><small>${how}</small></span>`
      + `<button type="button" class="mc-btn sm" data-e="reset">Сбросить всё</button>`
      + `<button type="button" class="mc-btn sm gold" data-e="done">Готово</button>`
      + `<button type="button" class="mc-btn sm mn" data-e="min" title="Свернуть панель" aria-label="Свернуть панель">–</button>`;
    b.addEventListener('click', (e) => {
      const k = e.target.closest('[data-e]')?.dataset.e; e.stopPropagation();
      if (performance.now() < (this.barSup || 0)) return;
      if (k === 'done') this.setEdit(false); else if (k === 'reset') this.reset();
      else if (k === 'min' || k === 'grip' && b.classList.contains('min')) { this.barMin(!b.classList.contains('min')); }
    });
    b.addEventListener('dblclick', (e) => e.stopPropagation());
    const grip = b.querySelector('.grip');
    grip.addEventListener('pointerdown', (e) => { // своя ручка: панель — не блок раскладки, её место не сохраняется на сервере
      if (e.button > 0) return; e.preventDefault(); e.stopPropagation();
      const r = b.getBoundingClientRect(), C = this.cont();
      this.barDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left - C.left, y: r.top - C.top, live: false };
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', (e) => {
      const d = this.barDrag; if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy; if (!d.live && Math.hypot(dx, dy) < 5) return;
      d.live = true; e.preventDefault(); this.barAt(d.x + dx, d.y + dy); this.barUser = this.barXY;
    });
    const end = (e) => { const d = this.barDrag; if (!d || e.pointerId !== d.id) return; this.barDrag = null; if (d.live) this.barSup = performance.now() + 300; };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    this.layer.appendChild(b); this.bar = b;
    this.dbl = (e) => { if (!this.edit) return; const h = this.find(e.target); if (!h) return; e.preventDefault(); e.stopPropagation(); const L = this.lay(); delete L.off[h.r.id]; L.at = Date.now(); this.save(true); this.scan(true); this.placeBar(); };
    this.root.addEventListener('dblclick', this.dbl, true);
  }
  barMin(v) { if (!this.bar) return; this.bar.classList.toggle('min', !!v); const m = this.bar.querySelector('.mn'); if (m) { m.textContent = v ? '+' : '–'; m.title = m.ariaLabel = v ? 'Развернуть панель' : 'Свернуть панель'; } this.placeBar(); }
  /** x, y — от левого верхнего угла окна игры; панель всегда целиком в окне */
  barAt(x, y) {
    const b = this.bar, C = this.cont(); if (!b) return;
    const w = b.offsetWidth, h = b.offsetHeight;
    x = Math.max(4, Math.min(C.width - w - 4, x)); y = Math.max(4, Math.min(C.height - h - 4, y));
    b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px'; this.barXY = [x, y];
  }
  /** видимые прямоугольники блоков раскладки (с учётом сдвига), относительно окна игры */
  blockRects() {
    const C = this.cont(), out = [];
    for (const [el, r] of this.els) { if (r.win) continue; const q = el.getBoundingClientRect(); if (q.width < 2 || q.height < 2) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      out.push({ id: r.id, L: q.left - C.left - 3, T: q.top - C.top - 3, R: q.right - C.left + 3, B: q.bottom - C.top + 3 }); }
    return out;
  }
  /** свободное место: перебор позиций (верх по центру, ниже верхних блоков, над панелью умений, середина) —
   *  первая, где панель не перекрывает ни один блок; иначе — с наименьшей площадью перекрытия. Своё место (перетащил) — уважаем, пока оно свободно. */
  placeBar() {
    const b = this.bar; if (!b || !this.edit) return; const C = this.cont(); if (C.width < 50) return;
    const w = b.offsetWidth, h = b.offsetHeight, R = this.blockRects();
    const over = (x, y) => { let s = 0; for (const q of R) { const ix = Math.min(x + w, q.R) - Math.max(x, q.L), iy = Math.min(y + h, q.B) - Math.max(y, q.T); if (ix > 0 && iy > 0) s += ix * iy; } return s; };
    const cx = (C.width - w) / 2, cands = [];
    // место, куда панель поставил сам игрок, не пересматриваем (иначе при следующем пересчёте она «отпрыгивает»), только держим в пределах экрана
    if (this.barUser) { const [ux, uy] = this.barUser, x = Math.max(4, Math.min(C.width - w - 4, ux)), y = Math.max(4, Math.min(C.height - h - 4, uy)); this.barAt(x, y); this.barUser = this.barXY; b.dataset.over = over(x, y) > 0 ? '1' : ''; return; }
    cands.push([cx, 8]);
    const topB = Math.max(0, ...R.filter((q) => q.T < C.height * 0.3 && q.L < C.width / 2 + w / 2 && q.R > C.width / 2 - w / 2).map((q) => q.B));
    cands.push([cx, topB + 6]);
    const ab = R.find((q) => q.id === 'abar'); cands.push([cx, (ab ? ab.T : C.height - 90) - h - 8]);
    cands.push([cx, C.height * 0.42], [cx, C.height * 0.6], [cx, C.height * 0.25]);
    for (let y = 8; y < C.height - h; y += Math.max(24, h)) cands.push([cx, y]);
    let best = null, bs = Infinity;
    for (const [x0, y0] of cands) { const x = Math.max(4, Math.min(C.width - w - 4, x0)), y = Math.max(4, Math.min(C.height - h - 4, y0)), s = over(x, y); if (s < bs) { bs = s; best = [x, y]; } if (!s) break; }
    if (best) this.barAt(best[0], best[1]);
    b.dataset.over = bs > 0 ? '1' : '';
  }
  reset() { this.barUser = null; const L = this.lay(); L.off = {}; L.at = Date.now(); this.save(true); this.scan(true); this.placeBar(); }
  setLock(v) { const L = this.lay(); L.lock = v ? 1 : 0; L.at = Date.now(); if (v) this.setEdit(false); this.save(true); }
  state() { const L = this.lay(); return { dev: this.dev, edit: this.edit, lock: !!L.lock, enabled: this.enabled(), off: { ...(L.off || {}) }, ids: [...new Set([...this.els.values()].map((r) => r.id))] }; }
}
