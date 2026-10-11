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
