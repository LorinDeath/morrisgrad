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
export function iconHtml(d, px = 40, cls = '') {
  const n = d && Number.isInteger(d.n) ? d.n : -1;
  if (n < 0 || n >= ATLAS.count) return `<span class="mc-ic-fb">${d?.icon || '·'}</span>`;
  const k = px / ATLAS.cell, col = n % ATLAS.cols, row = Math.floor(n / ATLAS.cols);
  return `<i class="mc-ic ${cls}" style="width:${px}px;height:${px}px;background-image:url('${ATLAS_URL}');background-size:${ATLAS.cols * ATLAS.cell * k}px auto;background-position:-${col * ATLAS.cell * k}px -${row * ATLAS.cell * k}px"></i>`;
}
