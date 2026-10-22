// Кэш карточек предметов, присланных сервером. Клиент НЕ содержит таблиц предметов/дропа (defs.ts не импортируется):
// карточку предмета сервер присылает только для открытых игроком предметов (сумка, добыча, Библиотека, награды).
// ITEM_BY_ID — прокси для старого кода: ITEM_BY_ID[id] → карточка или undefined (неизвестный предмет).
const cards = new Map();
let version = 0;

export function addCards(obj) {
  if (!obj) return;
  for (const [id, c] of Object.entries(obj)) if (c && typeof c === 'object') { cards.set(id, c); version++; }
}
export function cardVersion() { return version; }
export function card(id) { return cards.get(id); }

export const ITEM_BY_ID = new Proxy({}, {
  get: (_, id) => (typeof id === 'string' ? cards.get(id) : undefined),
  has: (_, id) => cards.has(id),
});

// Пиксельные иконки предметов: атлас items_atlas.png (ячейка 20 px с рамкой редкости), индекс = номер в пуле (card.n).
import atlasSrc from '../../../../assets/mc/items_atlas.png';
import ATLAS from '../../../../assets/mc/items_atlas.json';
const ATLAS_URL = typeof atlasSrc === 'object' && atlasSrc ? atlasSrc.src || atlasSrc.default || '' : atlasSrc;
// очернение (Чёрный маг, it.blk 1…100): поверх значка — (1) тёмная «ползущая снизу» тень, высота = blk%, плотность = blkK(blk)
// (кривая/предел из админки, meta/blkVis.js); (2) кадр арта item_blacken (5 кадров: 1–24, 25–49, 50–74, 75–99, 100 = сломано),
// 64 px для значков крупнее 32; (3) при 100% — трещины item_broken. Только CSS-фоны — дёшево.
import blkSrc from '../../../../assets/mc/bm/item_blacken_32.png';
import blk64Src from '../../../../assets/mc/bm/item_blacken_64.png';
import brkSrc from '../../../../assets/mc/bm/item_broken_32.png';
import brk64Src from '../../../../assets/mc/bm/item_broken_64.png';
import { blkK } from './blkVis.js';
const U = (s) => (typeof s === 'object' && s ? s.src || s.default || '' : s);
export function blkOverlay(blk, px) {
  const b = Math.max(0, Math.min(100, Number(blk) || 0)); if (!(b > 0)) return '';
  const k = blkK(b); if (!(k > 0)) return '';
  const f = b >= 100 ? 4 : Math.min(3, Math.floor(b / 25)), big = px > 32;
  const c = (a) => `rgba(8,2,14,${Math.round(Math.min(1, a) * 1000) / 1000})`, h = Math.round(Math.min(100, 12 + b * 0.88));
  const shade = `linear-gradient(to top,${c(k)} 0%,${c(k * 0.92)} ${h}%,${c(k * 0.4)} ${Math.min(100, h + 18)}%,${c(k * 0.22)} 100%)`;
  const S = 'position:absolute;inset:0;pointer-events:none;image-rendering:pixelated;';
  return `<i class="mc-blkd" style="${S}background:${shade}"></i><i class="mc-blk" data-blk="${f}" data-k="${Math.round(k * 100)}" style="${S}opacity:${Math.round((0.55 + 0.45 * Math.min(1, k / 0.85)) * 100) / 100};background:url('${U(big ? blk64Src : blkSrc)}') -${f * px}px 0/${px * 5}px ${px}px no-repeat"></i>${b >= 100 ? `<i class="mc-brk" style="${S}background:url('${U(big ? brk64Src : brkSrc)}') 0 0/${px}px ${px}px no-repeat"></i>` : ''}`;
}
export function iconHtml(d, px = 40, cls = '') {
  // ic — номер значка в атласе (у копий трофеев — значок базового предмета), иначе номер в пуле n
  const n = d && Number.isInteger(d.ic) ? d.ic : d && Number.isInteger(d.n) ? d.n : -1;
  if (n < 0 || n >= ATLAS.count) return `<span class="mc-ic-fb">${d?.icon || '·'}</span>`;
  const k = px / ATLAS.cell, col = n % ATLAS.cols, row = Math.floor(n / ATLAS.cols);
  const ov = d.blk ? blkOverlay(d.blk, px) : '';
  return `<i class="mc-ic ${cls}" style="width:${px}px;height:${px}px;background-image:url('${ATLAS_URL}');background-size:${ATLAS.cols * ATLAS.cell * k}px auto;background-position:-${col * ATLAS.cell * k}px -${row * ATLAS.cell * k}px${ov ? ';position:relative' : ''}">${ov}</i>`;
}
export function cardIds() { return [...cards.keys()]; }
