// Арт карты мира Аринара (художник, v5): подложка 4096 (десктоп) / 2048 (мобильные и мини-карта), иконки объектов,
// текстура тумана. Масштаб: px карты = px мира × N/48000. Грузится лениво — только при первом показе.
import map4096 from '../../../../assets/mc/worldmap_arinar_4096.webp';
import map2048 from '../../../../assets/mc/worldmap_arinar_2048.webp';
import mk16 from '../../../../assets/mc/wm_markers_16.png';
import mk32 from '../../../../assets/mc/wm_markers_32.png';
import fogTile from '../../../../assets/mc/wm_fog_tile_512.png';

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default || '') : s);
const cache = {};
const img = (k, src) => cache[k] || (cache[k] = Object.assign(new Image(), { src: url(src), decoding: 'async' }));
const small = () => matchMedia('(max-width: 900px), (pointer: coarse)').matches;
/** подложка: big=true — 4096 на десктопе (большая карта), иначе 2048 */
export function mapImage(big) {
  const lo = img('m2048', map2048);
  if (!big || small()) return lo;
  const hi = img('m4096', map4096);
  return hi.complete && hi.naturalWidth ? hi : lo; // пока 4096 грузится — 2048
}
// markers.json художника: одна строка, 7 иконок, якорь — центр
export const MARKER_INDEX = { sign: 0, boss_lair: 1, boss: 1, portal: 2, npc: 3, altar: 4, player: 5, chest: 6 };
export function drawMarkerIcon(ctx, type, x, y, size = 32) {
  const i = MARKER_INDEX[type]; if (i == null) return false;
  const s = size <= 16 ? 16 : 32, im = img('mk' + s, s === 16 ? mk16 : mk32);
  if (!im.complete || !im.naturalWidth) return false;
  ctx.drawImage(im, i * s, 0, s, s, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  return true;
}
import fogEdge from '../../../../assets/mc/wm_fog_edge.png';
// Органичный туман: маска FOG_N (1 ячейка = 128 px мира) → размытие (box ×2) → край «рвётся» шумом из fog_tile
// (порог smoothstep), цвет — облака fog_tile; профиль края — альфа-колонка fog_edge (LUT). Пересчёт — по версии маски.
let texA = null, texC = null, lut = null, org = null, orgVer = -1, orgAt = 0;
function sample(imgEl, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(imgEl, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; }
function boxBlur(src, n, r) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * n + Math.min(n - 1, Math.max(0, x))];
    for (let x = 0; x < n; x++) { tmp[y * n + x] = acc / (2 * r + 1); acc += src[y * n + Math.min(n - 1, x + r + 1)] - src[y * n + Math.max(0, x - r)]; } }
  for (let x = 0; x < n; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(n - 1, Math.max(0, y)) * n + x];
    for (let y = 0; y < n; y++) { out[y * n + x] = acc / (2 * r + 1); acc += tmp[Math.min(n - 1, y + r + 1) * n + x] - tmp[Math.max(0, y - r) * n + x]; } }
  return out;
}
export function organicFog(fog, N, getBit, S = 2) {
  const tile = img('fog', fogTile), edge = img('fogEdge', fogEdge);
  if (org && orgVer === fog.ver) return org;
  const now = performance.now(); if (org && now - orgAt < 400) return org; // не чаще 2.5 раз/с при ходьбе
  if (!texA && tile.complete && tile.naturalWidth) { const d = sample(tile, 256, 256); texA = new Float32Array(65536); texC = new Float32Array(65536); for (let i = 0; i < 65536; i++) { texA[i] = d[i * 4 + 3] / 255; texC[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765; } }
  if (!lut && edge.complete && edge.naturalWidth) { const d = sample(edge, 1, 64); lut = new Float32Array(64); for (let i = 0; i < 64; i++) lut[i] = d[i * 4 + 3] / 255; }
  let m = new Float32Array(N * N); for (let k = 0; k < N * N; k++) m[k] = getBit(fog.mask, k) ? 1 : 0;
  m = boxBlur(boxBlur(m, N, 1), N, 1);
  const W = N * S; org = org || document.createElement('canvas'); if (org.width !== W) { org.width = org.height = W; }
  const g = org.getContext('2d'), id = g.createImageData(W, W), d = id.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const fx = x / S - 0.5, fy = y / S - 0.5, i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fy))), ax = Math.min(1, Math.max(0, fx - i)), ay = Math.min(1, Math.max(0, fy - j));
    const v = (m[j * N + i] * (1 - ax) + m[j * N + i + 1] * ax) * (1 - ay) + (m[(j + 1) * N + i] * (1 - ax) + m[(j + 1) * N + i + 1] * ax) * ay;
    const t = ((y * 3) & 255) * 256 + ((x * 3) & 255), n = texA ? texA[t] : 0.7, c = texC ? texC[t] : 0.3;
    let e = v + (n - 0.7) * 0.9;                         // шум рвёт край
    e = Math.min(1, Math.max(0, (e - 0.25) / 0.5));      // 0 — туман, 1 — открыто
    const a = lut ? lut[Math.min(63, Math.floor(e * 63))] : 1 - e * e * (3 - 2 * e);
    const o = (y * W + x) * 4; d[o] = 6 + c * 34; d[o + 1] = 4 + c * 26; d[o + 2] = 12 + c * 44; d[o + 3] = Math.round(a * 255);
  }
  g.putImageData(id, 0, 0); orgVer = fog.ver; orgAt = now;
  return org;
}
/** туман поверх карты: органичная маска (см. organicFog), растянутая на мир */
export function drawFog(ctx, fog, x0, y0, sz, N, getBit) {
  const c = organicFog(fog, N, getBit);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(c, x0, y0, sz, sz);
}
