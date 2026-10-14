// Иконки характеристик (icons_new: stats_16.png / stats_32.png, 8 колонок, одинаковый порядок; stats_icons.json: id → индекс).
// 16 px — строки статов/подсказки/админ-панель, 32 px — окно персонажа. Пиксель-арт: image-rendering: pixelated.
import s16 from '../../../../assets/mc/stats_16.png';
import s32 from '../../../../assets/mc/stats_32.png';
import meta from '../../../../assets/mc/stats_icons.json';

const SRC = { 16: s16, 32: s32 };
const ROWS = Math.ceil(Object.keys(meta.index).length / meta.cols);
// синонимы id из игры → id иконки
const ALIAS = { maxHp: 'maxHp', weapon: 'weaponMin', damageReductionPct: 'damageReduction' };
export function statIcon(id, size = 16) {
  const i = meta.index[id] ?? meta.index[ALIAS[id]];
  if (i === undefined) return '';
  const c = i % meta.cols, r = Math.floor(i / meta.cols);
  return `<i class="mc-sti" data-st="${id}" style="width:${size}px;height:${size}px;background:url(${SRC[size] || s16}) -${c * size}px -${r * size}px / ${meta.cols * size}px ${ROWS * size}px no-repeat"></i>`;
}
export const STAT_ICON_IDS = Object.keys(meta.index);
