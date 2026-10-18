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
// очернение (Чёрный маг, it.blk 1…100): поверх значка — слой item_blacken_32 (5 кадров: 1–24, 25–49, 50–74, 75–99, 100 = сломано) и трещины item_broken_32
import blkSrc from '../../../../assets/mc/bm/item_blacken_32.png';
import brkSrc from '../../../../assets/mc/bm/item_broken_32.png';
const U = (s) => (typeof s === 'object' && s ? s.src || s.default || '' : s);
export function blkOverlay(blk, px) {
  const b = Math.max(0, Math.min(100, Number(blk) || 0)); if (!(b > 0)) return '';
  const f = b >= 100 ? 4 : Math.min(3, Math.floor(b / 25));
  return `<i class="mc-blk" data-blk="${f}" style="position:absolute;inset:0;pointer-events:none;image-rendering:pixelated;background:url('${U(blkSrc)}') -${f * px}px 0/${px * 5}px ${px}px no-repeat"></i>${b >= 100 ? `<i class="mc-brk" style="position:absolute;inset:0;pointer-events:none;image-rendering:pixelated;background:url('${U(brkSrc)}') 0 0/${px}px ${px}px no-repeat"></i>` : ''}`;
}
export function iconHtml(d, px = 40, cls = '') {
  const n = d && Number.isInteger(d.n) ? d.n : -1;
  if (n < 0 || n >= ATLAS.count) return `<span class="mc-ic-fb">${d?.icon || '·'}</span>`;
  const k = px / ATLAS.cell, col = n % ATLAS.cols, row = Math.floor(n / ATLAS.cols);
  const ov = d.blk ? blkOverlay(d.blk, px) : '';
  return `<i class="mc-ic ${cls}" style="width:${px}px;height:${px}px;background-image:url('${ATLAS_URL}');background-size:${ATLAS.cols * ATLAS.cell * k}px auto;background-position:-${col * ATLAS.cell * k}px -${row * ATLAS.cell * k}px${ov ? ';position:relative' : ''}">${ov}</i>`;
}
export function cardIds() { return [...cards.keys()]; }
