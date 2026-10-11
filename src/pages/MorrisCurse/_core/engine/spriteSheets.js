// Реестр спрайт-листов проекта (те же файлы и раскладка, что использовало 2D-ядро).
// Раскладка кадров: 3 колонки (шаг анимации) × 4 ряда (вниз, влево, вправо, вверх).
import soulSrc from '../../../../assets/character_1_frame16x20.png';
import rogueSrc from '../../../../assets/character_1_frame16x20 2.png';
import warriorSrc from '../../../../assets/character_8_frame16x20.png';
import spearmanSrc from '../../../../assets/character_9_frame16x20.png';
import mageSrc from '../../../../assets/mage.png';
import keytSrc from '../../../../assets/Keyt.png';
import darSrc from '../../../../assets/Dar.png';

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s);

// sheetCols/sheetRows — сетка всего листа; кадры персонажа — левый верхний блок 3×4.
// heightM — рост фигуры в метрах (1 м = 20 px мира), подобрано под размеры отрисовки 2D-версии.
export const SHEETS = {
  soul: { src: url(soulSrc), sheetCols: 3, sheetRows: 4, heightM: 1.9 },
  rogue: { src: url(rogueSrc), sheetCols: 3, sheetRows: 4, heightM: 2.0 },
  warrior: { src: url(warriorSrc), sheetCols: 3, sheetRows: 4, heightM: 2.0 },
  spearman: { src: url(spearmanSrc), sheetCols: 3, sheetRows: 4, heightM: 2.0 },
  mage: { src: url(mageSrc), sheetCols: 12, sheetRows: 8, heightM: 2.15 },
  keyt: { src: url(keytSrc), sheetCols: 12, sheetRows: 8, heightM: 2.5 },
  dar: { src: url(darSrc), sheetCols: 12, sheetRows: 8, heightM: 2.4 },
};

export const WALK_SEQUENCE = [0, 1, 2, 1];

// Ряд листа по направлению движения в координатах мира (как getDirectionRow 2D-ядра)
export function directionRow(dirX, dirY) {
  if (Math.abs(dirX) > Math.abs(dirY)) return dirX < 0 ? 1 : 2;
  return dirY < 0 ? 3 : 0;
}
