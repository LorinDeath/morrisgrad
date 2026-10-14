// «Проклятые»: туман войны (общая часть сервера и клиента). Аринар 1500×1500 клеток → сетка разведки 375×375
// (1 ячейка = 4×4 клетки = 128 px мира). Открывается кругом радиуса FOG_R ячеек вокруг ПОЗИЦИИ ИГРОКА НА СЕРВЕРЕ
// (клиент маску не присылает). Хранение — битсет, сжатый RLE (чередующиеся серии 0/1, длины — varint) → base64.
import { WORLD_SIZES } from "../worlds/sizes";
export const FOG_N = 375;
export const FOG_CELL = WORLD_SIZES.arinar / FOG_N; // 128 px
export const FOG_R = 7;                             // ≈ 900 px — чуть шире экрана
export const FOG_WORLDS = ["arinar"];               // в маленьких мирах (Поляна, арена) тумана нет
export const newMask = () => new Uint8Array(Math.ceil((FOG_N * FOG_N) / 8));
export const getBit = (m: Uint8Array, i: number) => (m[i >> 3] >> (i & 7)) & 1;
export const setBit = (m: Uint8Array, i: number) => { m[i >> 3] |= 1 << (i & 7); };
const OFFS: number[][] = [];
for (let dy = -FOG_R; dy <= FOG_R; dy++) for (let dx = -FOG_R; dx <= FOG_R; dx++) if (dx * dx + dy * dy <= FOG_R * FOG_R + FOG_R) OFFS.push([dx, dy]);
/** Открыть круг вокруг точки мира; возвращает индексы впервые открытых ячеек. */
export function reveal(m: Uint8Array, x: number, y: number): number[] {
  const cx = Math.floor(x / FOG_CELL), cy = Math.floor(y / FOG_CELL), out: number[] = [];
  for (const [dx, dy] of OFFS) {
    const i = cx + dx, j = cy + dy;
    if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) continue;
    const k = j * FOG_N + i;
    if (!getBit(m, k)) { setBit(m, k); out.push(k); }
  }
  return out;
}
export function countBits(m: Uint8Array) { let n = 0; for (let k = 0; k < FOG_N * FOG_N; k++) n += getBit(m, k); return n; }
const b64e = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
const b64d = (s: string) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
export function encodeMask(m: Uint8Array): string {
  const out: number[] = [];
  const push = (n: number) => { while (n >= 128) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); };
  let cur = 0, run = 0;
  for (let k = 0; k < FOG_N * FOG_N; k++) { const b = getBit(m, k); if (b === cur) run++; else { push(run); cur = b; run = 1; } }
  push(run);
  return b64e(new Uint8Array(out));
}
export function decodeMask(s: string | null | undefined): Uint8Array {
  const m = newMask(); if (!s) return m;
  let u: Uint8Array; try { u = b64d(s); } catch { return m; }
  let p = 0, k = 0, cur = 0;
  while (p < u.length && k < FOG_N * FOG_N) {
    let n = 0, sh = 0, c; do { c = u[p++]; n |= (c & 127) << sh; sh += 7; } while (c & 128 && p < u.length);
    if (cur) for (let i = 0; i < n && k + i < FOG_N * FOG_N; i++) setBit(m, k + i);
    k += n; cur ^= 1;
  }
  return m;
}
