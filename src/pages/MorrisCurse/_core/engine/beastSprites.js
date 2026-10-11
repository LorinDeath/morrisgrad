// Единый пиксельный атлас всех Отголосков (tools/mc-sprites/gen_bestiary.py): строка = моб,
// кадры 0–3 ход, 4–6 замах/удар, 7 вспышка, 8–11 распад; ячейка 48 px = 4.8 м (10 px арта = 1 м).
// Используют и открытый мир (hub/zoneView.js), и забеги Vampire Like (survivors/runView.js).
import { SpriteBatch, loadAtlasTexture } from './spriteBatch.js';
import beastSrc from '../../../../assets/mc/bestiary_atlas.png';
import beastMeta from '../../../../assets/mc/bestiary_atlas.json';
import { MOB_INFO } from '../../../../../server/meta/shared.ts';

export const BEAST_ROW = Object.fromEntries(beastMeta.rows.map((id, i) => [id, i]));
export const BEAST_H = beastMeta.cell / (beastMeta.pxPerM || 10); // v2: 12.5 px арта = 1 м (детальнее при прежнем размере в мире)
export const beastFlying = (type) => beastMeta.flying[type] !== undefined;
// высота «макушки» (для полосок/значков статусов над головой)
export const beastTop = (type) => { const m = MOB_INFO[type]; return m?.boss || m?.huge ? 4.6 : m?.size === 'l' ? 3.4 : beastFlying(type) ? 3.0 : 2.4; };

export function loadBeastBatch(THREE, max = 320) {
  const url = typeof beastSrc === 'object' && beastSrc ? (beastSrc.src || beastSrc.default || '') : beastSrc;
  return loadAtlasTexture(THREE, url).then((t) => new SpriteBatch(THREE, t, { cellW: beastMeta.cell, cellH: beastMeta.cell, cols: beastMeta.cols, rows: beastMeta.rows.length, max }));
}

// Высота билборда, при которой видимое тело моба = vis метров (кадр 0, body из генератора)
export function beastHeightFor(type, vis) {
  const r = BEAST_ROW[type];
  const b = r !== undefined && beastMeta.body ? beastMeta.body[r] : null;
  const px = b ? Math.max(6, b[1] - b[0]) : beastMeta.cell * 0.6;
  return (vis * beastMeta.cell) / px;
}
