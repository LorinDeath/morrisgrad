import { BLK_FX } from '../engine/pixSprites.js';
// Вид очернения (Чёрный маг): конфиг с сервера (meta_state.bmv = blkVisClient, админка «🌑 Чёрный маг» → «Вид очернения»).
// Только отрисовка. Уровень затемнения ГЕРОЯ (0…100) считает сервер и рассылает всем (players_state.stats.bk, inspect.bk),
// здесь — сила затемнения ЗНАЧКА вещи по её очернению.
export const BLKV = { on: true, itemMax: 0.85, charMax: 1, curve: 0.7 };
export function setBlkVis(c) {
  if (!c || typeof c !== 'object') return;
  for (const k of Object.keys(BLKV)) if (c[k] != null) BLKV[k] = c[k];
  if (c.heroLight != null) BLK_FX.heroLight = Math.max(0.3, Math.min(1.5, Number(c.heroLight) || 1));
  if (c.glitch != null) BLK_FX.glitch = !!c.glitch; if (c.hz != null) BLK_FX.hz = Math.max(0, Number(c.hz) || 0);
}
/** сила 0…1 по очернению 0…100 (как blkVisK на сервере) */
export function blkK(pct, max = BLKV.itemMax) {
  if (BLKV.on === false) return 0; const x = Math.max(0, Math.min(100, Number(pct) || 0)) / 100; if (!(x > 0)) return 0;
  return Math.max(0, Math.min(1, (Number(max) || 0) * Math.pow(x, Math.max(0.1, Number(BLKV.curve) || 1))));
}
