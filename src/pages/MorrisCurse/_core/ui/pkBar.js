// PK над героем: полоса отсчёта (вход 7 с — белый → красный, выход 30 с — красный → белый, сброс боем — гаснет серым с дрожью)
// и значок «PK» слева от имени (PK-режим и убийцы; порядок PK → АДМИН → имя). Состояние — с сервера (stats.pkT/pkP/pkD/pkC/pkK
// в снимке игроков — видят все; свой — pk_state). Цвета/ширина/подпись — админка «⚔ PK-режим» (cityClient.pkUi).
const UI = { color: '#ef4444', barFrom: '#f8fafc', barTo: '#dc2626', barCancel: '#94a3b8', barW: 54, tagText: 'PK', tagBg: '#7f1d1d', tagFg: '#fee2e2', tagGlow: '#ef4444', tagKiller: true };
export const pkUi = () => UI;
export function setPkUi(u) { if (u && typeof u === 'object') for (const k of Object.keys(UI)) if (u[k] !== undefined && u[k] !== null && u[k] !== '') UI[k] = u[k]; }
const hx = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); const n = m ? parseInt(m[1], 16) : 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const sm = (t) => t * t * (3 - 2 * t);
/** цвет полосы: доля p, направление t (1 — вход, 2 — выход) — плавно (smoothstep) */
export function pkBarColor(t, p) { const a = hx(t === 1 ? UI.barFrom : UI.barTo), b = hx(t === 1 ? UI.barTo : UI.barFrom), k = sm(Math.max(0, Math.min(1, p)));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pkTagHtml = () => `<span class="mc-role mc-pk-tag" style="background:${esc(UI.tagBg)};color:${esc(UI.tagFg)};box-shadow:0 0 6px ${esc(UI.tagGlow)},inset 0 0 0 1px ${esc(UI.tagGlow)}">${esc(UI.tagText || 'PK')}</span>`;

const CANCEL_MS = 1400, DONE_MS = 700; // сброс виден ~1.4 с
/** трекер отсчёта одного героя (локальная интерполяция между снимками) */
export class PkTrack {
  constructor() { this.t = 0; this.p = 0; this.at = 0; this.dur = 0; this.c = null; this.pk = null; this.fx = null; }
  cur(now) { return this.t && this.dur > 0 ? Math.min(1, this.p + (now - this.at) / (this.dur * 1000)) : 0; }
  /** обновить из публичного состояния: t (0/1/2), p (0…1), dur (с), c (сбросы), pk (0/1) */
  set(t, p, dur, c, pk, now = performance.now()) {
    const was = this.t, wasP = this.cur(now);
    if (this.c !== null && c !== this.c && was) this.fx = { k: 'cancel', at: now, p: wasP, t: was };                  // сброс боем / отмена
    else if (was && !t && this.pk !== null && pk !== this.pk) this.fx = { k: 'done', at: now, t: was };                // режим сменился
    this.c = c; this.pk = pk;
    if (!t) { this.t = 0; return; }
    if (t !== was || Math.abs(p - wasP) > 0.04) { this.p = p; this.at = now; }
    this.t = t; this.dur = dur;
  }
  /** html полосы (или '' — нечего показывать) */
  html(now = performance.now()) {
    const W = Math.max(24, Number(UI.barW) || 54);
    if (this.t) { const p = this.cur(now), left = Math.max(0, Math.ceil(this.dur * (1 - p))), col = pkBarColor(this.t, p);
      return `<div class="mc-pkbar ${this.t === 1 ? 'in' : 'out'}" style="width:${W}px" data-p="${p.toFixed(3)}" data-t="${this.t}"><i style="width:${(p * 100).toFixed(1)}%;background:${col};box-shadow:0 0 6px ${col}"></i><b>${left}</b></div>`; }
    const f = this.fx; if (!f) return '';
    const age = now - f.at;
    if (f.k === 'cancel') { if (age > CANCEL_MS) { this.fx = null; return ''; } const k = age / CANCEL_MS, dx = Math.sin(age / 18) * 3 * (1 - k);
      return `<div class="mc-pkbar cancel" style="width:${W}px;opacity:${(1 - k * k).toFixed(2)};transform:translateX(${dx.toFixed(1)}px)" data-t="c"><i style="width:${(f.p * (1 - sm(k)) * 100).toFixed(1)}%;background:${UI.barCancel}"></i><b>✕</b></div>`; }
    if (age > DONE_MS) { this.fx = null; return ''; } const col = pkBarColor(f.t, 1);
    return `<div class="mc-pkbar done" style="width:${W}px;opacity:${(1 - age / DONE_MS).toFixed(2)}" data-t="d"><i style="width:100%;background:${col};box-shadow:0 0 10px ${col}"></i></div>`;
  }
  get busy() { return !!this.t || !!this.fx; }
}
const TRACK = new Map();
/** трекер чужого героя из stats снимка */
export function pkTrackOf(id, st, now = performance.now()) {
  let r = TRACK.get(id); if (!r) TRACK.set(id, (r = new PkTrack()));
  r.set(st?.pkT | 0, Number(st?.pkP) || 0, Number(st?.pkD) || 0, st?.pkC | 0, st?.pk ? 1 : 0, now); return r;
}
export function pkTrackDrop(alive) { for (const k of TRACK.keys()) if (!alive.has(k)) TRACK.delete(k); }
/** убийца/PK — значок и красное имя */
export const pkMarked = (pk, killer) => !!pk || (!!killer && UI.tagKiller !== false);
