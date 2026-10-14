// Клиентская копия тумана войны: маска приходит от сервера (fog — целиком, fog_add — новые ячейки).
// Канвас FOG_N×FOG_N: чёрный там, где не разведано, прозрачный — где игрок был. Его рисуют большая карта и мини-карта.
import { FOG_N, FOG_CELL, decodeMask, getBit } from '../../../../../server/meta/explore.ts';

export class FogState {
  constructor() { this.world = null; this.mask = null; this.none = true; this.canvas = null; this.ver = 0; this.cells = 0; }
  _ensure() {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = FOG_N;
    this.ctx = this.canvas.getContext('2d');
  }
  setFull(msg) {
    this.world = msg.world; this.none = !!msg.none; this.ver++;
    if (this.none) { this.mask = null; return; }
    this._ensure();
    this.mask = decodeMask(msg.mask); this.cells = 0;
    const img = this.ctx.createImageData(FOG_N, FOG_N), d = img.data;
    for (let k = 0; k < FOG_N * FOG_N; k++) { const on = getBit(this.mask, k); this.cells += on; d[k * 4 + 3] = on ? 0 : 255; }
    this.ctx.putImageData(img, 0, 0);
  }
  add(msg) {
    if (!this.mask || msg.world !== this.world) return;
    for (const k of msg.c) { if (getBit(this.mask, k)) continue; this.mask[k >> 3] |= 1 << (k & 7); this.cells++; this.ctx.clearRect(k % FOG_N, Math.floor(k / FOG_N), 1, 1); }
    this.ver++;
  }
  /** разведана ли точка мира (без тумана — всегда да) */
  seen(world, x, y) {
    if (!this.active(world)) return true;
    const i = Math.floor(x / FOG_CELL), j = Math.floor(y / FOG_CELL);
    if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) return false;
    return !!getBit(this.mask, j * FOG_N + i);
  }
  active(world) { return !this.none && this.world === world && !!this.mask; }
  pct() { return Math.round((this.cells / (FOG_N * FOG_N)) * 1000) / 10; }
}
export const fog = new FogState();
