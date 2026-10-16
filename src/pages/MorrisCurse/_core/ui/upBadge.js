// Значок улучшения «+N» на иконке предмета: пиксельная плашка в правом нижнем углу (замок — слева сверху, «новое» — справа сверху).
// Цвет по ступеням: +1–9 бронза, +10–19 серебро, +20–29 золото, +30–39 изумруд, +40–49 сапфир, +50–58 рубин (на максимуме — переливается).
// Проклятые — фиолетовые тона той же ступени. sm — для мелких иконок (подсказки, строки списков).
import { UPG } from '../../../../../server/meta/upgrade.ts';
export const upTier = (up) => Math.min(6, Math.floor((up | 0) / 10) + 1);
export function upBadge(up, cursed = false, sm = false) {
  up |= 0; if (up <= 0) return '';
  const max = up >= (UPG.maxLvl | 0);
  return `<i class="mc-upb t${upTier(up)}${cursed ? ' cz' : ''}${max ? ' max' : ''}${sm ? ' sm' : ''}" aria-label="улучшение +${up}">+${up}</i>`;
}
