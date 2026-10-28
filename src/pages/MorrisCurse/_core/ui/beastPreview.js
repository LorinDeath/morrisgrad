// Превью особи в Бестиарии: живой спрайт bestiary32 (покой ↔ шаг) с оттенком варианта — проклятый (фиолетовое свечение),
// ярус зачарования (цвет яруса; Чёрный — тёмный глитч с мерцанием), вариант края (множитель RGB биома). Невстреченный — тёмный силуэт.
// Разметка — строкой (<canvas data-bprev>), оживляет общий цикл кадров; листы грузятся лениво и только при открытой карточке.
import META from '../../../../assets/mc/bestiary32/bestiary32_atlas.json';
import { enchRGB } from '../meta/enchCfg.js';

const url = (s) => (typeof s === 'object' && s !== null ? s.src || s.default?.src || s.default || '' : s);
const IMG = new Map(); let SRC = null, raf = 0;
function sheet(pg) {
  if (IMG.has(pg)) return IMG.get(pg);
  const im = new Image(); IMG.set(pg, im);
  (SRC || (SRC = import('../engine/bestiary32Set.js').then((m) => m.SRC))).then((S) => { im.src = url(S[META.pages[pg].image]); });
  return im;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** есть ли спрайт у вида (вариант края берёт спрайт базового вида) */
export const hasPreview = (spr) => !!META.mobs?.[spr];
/** разметка превью: spr — вид спрайта; k — c | e1…e6 | v (вариант края); tint — [r,g,b] биома; sil — силуэт (не встречен) */
export function bprevHtml(spr, k, tint, sil, size = 64) {
  css();
  if (!hasPreview(spr)) return '';
  if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  return `<canvas class="mc-bprev" width="104" height="104" style="width:${size}px;height:${size}px" data-bprev="${esc(spr)}" data-k="${esc(k || '')}" data-t="${tint ? tint.join(',') : ''}"${sil ? ' data-sil="1"' : ''}></canvas>`;
}
// стили строк «Варианты» — здесь, чтобы не трогать общий core3d.css
let CSS = false;
function css() {
  if (CSS || typeof document === 'undefined') return; CSS = true;
  const s = document.createElement('style'); s.dataset.mc = 'bvar';
  s.textContent = `.mc-bvars{list-style:none;padding:0;margin:4px 0 6px;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px}
.mc-bvar{display:flex;gap:8px;align-items:center;padding:3px 6px;border:1px solid #2b2140;border-radius:7px;background:#0d0918}
.mc-bvar>div{display:flex;flex-direction:column;min-width:0}.mc-bvar small{color:#94a3b8;font-size:11px}
.mc-bvar .ok{color:#4ade80}.mc-bvar .no{color:#fbbf24}.mc-bvar.unseen{opacity:.6}
.mc-bprev{flex:none;image-rendering:auto;background:radial-gradient(#4a3a6e,#160f26 72%);border-radius:6px}
.mc-bvar b{text-shadow:0 0 3px rgba(255,255,255,.55),0 1px 0 #000}
.mc-bvar-q{flex:none;width:56px;height:56px;display:grid;place-items:center;font-size:26px;color:#4b3d66}`;
  document.head.appendChild(s);
}
const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
/** множители RGB варианта в момент T (как в мире: hub/zoneView.js enchTint и подсветка проклятых) */
function mulOf(k, t, T, sil) {
  if (sil) return null;
  if (k === 'c') { const p = 0.8 + Math.sin(T * 4) * 0.2; return [1.1 * p + 0.2, 0.55, 1.5 * p + 0.2]; }
  const n = /^e([1-6])$/.exec(k)?.[1] | 0;
  if (n === 6) { const fl = hash(Math.floor(T * 11)) > 0.85 ? 1.7 : 0.38; return [0.32 * fl + 0.04, 0.26 * fl, 0.34 * fl + 0.05]; }
  if (n) { const [er, eg, eb] = enchRGB(n), p = 0.78 + Math.sin(T * 3) * 0.22; return [0.45 + 0.95 * er * p, 0.45 + 0.95 * eg * p, 0.45 + 0.95 * eb * p]; }
  return t;
}
const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function draw(cv, T) {
  const m = META.mobs[cv.dataset.bprev]; if (!m) return;
  const im = sheet(m.page); if (!im.complete || !im.naturalWidth) return;
  const sil = !!cv.dataset.sil, k = cv.dataset.k, t = cv.dataset.t ? cv.dataset.t.split(',').map(Number) : null;
  // покой 3 с, затем шаг 1.5 с (силуэт — неподвижен)
  const ph = sil ? 0 : T % 4.5, A = ph < 3 ? META.anims.idle : META.anims.walk, f = sil ? 0 : Math.floor((ph < 3 ? ph : ph - 3) * A.fps) % A.n;
  const idx = m.start + A.off + f, C = META.cell, sx = (idx % META.cols) * C, sy = Math.floor(idx / META.cols) * C;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, C, C);
  const jx = k === 'e6' && hash(Math.floor(T * 14) + 3) > 0.7 ? (hash(Math.floor(T * 14)) - 0.5) * 12 : 0;
  g.drawImage(im, sx, sy, C, C, jx, 0, C, C);
  const mul = mulOf(k, t, T, sil);
  if (!sil && !mul) return;
  const d = g.getImageData(0, 0, C, C), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    if (sil) { p[i] = 8; p[i + 1] = 6; p[i + 2] = 14; p[i + 3] = Math.min(p[i + 3], 235); continue; } // тёмный силуэт на светлом пятне фона
    p[i] = Math.min(255, p[i] * mul[0]); p[i + 1] = Math.min(255, p[i + 1] * mul[1]); p[i + 2] = Math.min(255, p[i + 2] * mul[2]);
  }
  g.putImageData(d, 0, 0);
  if (k === 'e6' && scratch && hash(Math.floor(T * 9)) > 0.6) { // Чёрный: красно-голубой двойник-глитч
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(cv, 4, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}
let idle = 0;
function tick(ms) {
  const L = document.querySelectorAll('canvas[data-bprev]');
  if (!L.length) { if (++idle > 120) { raf = 0; idle = 0; return; } } else idle = 0;
  const T = ms / 1000; for (const cv of L) if (cv.isConnected && cv.offsetParent !== null) draw(cv, T);
  raf = requestAnimationFrame(tick);
}
