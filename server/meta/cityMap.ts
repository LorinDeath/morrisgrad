// @ts-nocheck
// Альказак по карте Историка (alkazak_map.json → синк tools/sync-city-art): земля, пропсы, здания, точки, проходимость.
// Карта — источник правды; радиус купола (CITY_CFG.rTiles) настраивается отдельно:
//  • внутри купола клетка, где карта ничего непрозрачного не положила (просвечивает трава основы/лёд, край blob-тайла),
//    получает очернённую землю tiles_dark (blight*/ростки/больная трава — по тому же хешу, что прежняя раскладка), карта — поверх;
//  • за куполом остаётся лёд карты (ice_ground + кромка ice_bNN «лёд поверх черноты»), чернота за R обрезается:
//    клетка без льда дальше R + EDGE_PAD клеток — обычный биом мира (лёд Ледника), ближе — кромка карты (сливается со льдом).
// Модуль чистый (сервер и клиент считают одинаково).
import MAP_J from "../../src/assets/mc/city/alkazak_map.json";
import TILES_J from "../../src/assets/mc/city/tiles_dark.json";
import { CITY_CFG, CITY_TILE } from "./city";

export const MAP: any = MAP_J;
export const DARK_INDEX: Record<string, number> = (TILES_J as any).index || {};
const NAME_OF: Record<number, string> = Object.fromEntries(Object.entries(DARK_INDEX).map(([k, v]) => [v as number, k]));
const T = CITY_TILE, N = Number(MAP.N) || 93;
export const MAP_CELL0: [number, number] = MAP.world_first_cell || [723, 59];      // клетка мира (0,0) сетки
export const MAP_CENTER: [number, number] = MAP.center_world_px || [24624, 3376];  // центр купола, под который нарисована карта
export const EDGE_PAD = 1.5;                                                        // клеток за R, где кромка карты ещё рисуется
const H = (x: number, y: number, s: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** сдвиг карты в клетках, если центр города в админке перенесён (карта едет вместе с куполом) */
export const mapShift = (): [number, number] => [Math.floor(CITY_CFG.x / T) - Math.floor(MAP_CENTER[0] / T), Math.floor(CITY_CFG.y / T) - Math.floor(MAP_CENTER[1] / T)];
export const mapShiftPx = (): [number, number] => { const [a, b] = mapShift(); return [a * T, b * T]; };
// оверлеи по клеткам сетки: индекс → [индексы tiles_dark по порядку наложения]
let OVER: Map<number, number[]> | null = null;
function over(): Map<number, number[]> {
  if (OVER) return OVER; OVER = new Map();
  const o = MAP.over || [];
  for (let k = 0; k + 2 < o.length; k += 3) { const v = o[k + 2], idx = typeof v === "number" ? v : DARK_INDEX[v]; if (idx == null) continue; const key = o[k + 1] * N + o[k]; let a = OVER.get(key); if (!a) OVER.set(key, (a = [])); a.push(idx); }
  return OVER;
}
const nameOf = (i: number) => NAME_OF[i] || "";
/** непрозрачный тайл (закрывает клетку целиком): не blob-край (_bNN), не культуры/ковры */
export const opaqueTile = (i: number) => { const n = nameOf(i); return !!n && !/_b\d\d$/.test(n) && !/^(crop_|rug_)/.test(n); };
const isIce = (i: number) => /^ice_/.test(nameOf(i)), isIceFull = (i: number) => /^ice_ground/.test(nameOf(i));
const iceFull = (gi: number, gj: number) => DARK_INDEX[`ice_ground${Math.floor(H(gi, gj, 41) * 4) % 4}`] ?? DARK_INDEX.ice_ground0;
/** очернённая земля для пустой клетки внутри купола: в основном чернота, ростки, изредка пробивается больная трава */
export function fillTile(gi: number, gj: number): number {
  const h = H(gi, gj, 31), v = H(gi, gj, 7);
  const name = h < 0.66 ? `blight${Math.floor(v * 4) % 4}` : `blight_sprout${Math.floor(v * 3) % 3}`; // ростки = трава пробивается (grass_sick даёт квадрат на стыке — README тайлсета)
  return DARK_INDEX[name] ?? DARK_INDEX.blight0 ?? 0;
}
export interface CityGround { base: string; dover: number[]; fill: boolean; map: boolean }
/** земля клетки мира (gi, gj) под куполом/у кромки или null — обычный биом мира */
export function cityGround(gi: number, gj: number, rTiles = Number(CITY_CFG.rTiles) || 40): CityGround | null {
  if (CITY_CFG.on === false) return null;
  const d = Math.hypot((gi + 0.5) * T - CITY_CFG.x, (gj + 0.5) * T - CITY_CFG.y) / T;
  if (d > rTiles + 2 && d > 48) return null;
  const [sx, sy] = mapShift(), i = gi - MAP_CELL0[0] - sx, j = gj - MAP_CELL0[1] - sy, inGrid = i >= 0 && j >= 0 && i < N && j < N;
  const ov = inGrid ? over().get(j * N + i) || [] : [];
  const base = inGrid ? `grass${(MAP.base?.[j * N + i] ?? 0) & 3}` : "grass0";
  const pathOv = ov.filter((x) => /^path/.test(nameOf(x)));
  if (d <= rTiles) { // под куполом: карта в приоритете; лёд карты внутри R и пустые клетки — очернённая земля (тропы карты поверх)
    const own = ov.filter((x) => !isIce(x));
    if (own.some(opaqueTile) || (inGrid && own.length === ov.length)) return { base, dover: own, fill: false, map: true }; // клетка карты (в т. ч. авторская трава и blob-края)
    return { base, dover: [fillTile(gi, gj), ...own], fill: true, map: own.length > 0 };
  }
  // за куполом — лёд Ледника; чернота за R обрезана: клетка, соседняя с куполом, — кромка ice_bNN (blob-47) поверх черноты,
  // дальше — полный лёд карты (тропы поверх) или обычный мир
  const inside = (a: number, b: number) => Math.hypot((a + 0.5) * T - CITY_CFG.x, (b + 0.5) * T - CITY_CFG.y) / T <= rTiles;
  let m = 0; const nb: [number, number, number][] = [[0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128]];
  for (const [dx, dy, bit] of nb) if (!inside(gi + dx, gj + dy)) m |= bit;
  if (m !== 255) { // у края купола
    const B = (TILES_J as any).blob47, S = B.sets.ice; let mm = m;
    if (!(m & 1 && m & 4)) mm &= ~2; if (!(m & 4 && m & 16)) mm &= ~8; if (!(m & 16 && m & 64)) mm &= ~32; if (!(m & 64 && m & 1)) mm &= ~128; // диагональ — только при обеих сторонах
    const off = B.raw_to_offset[mm], ice = off === S.full_offset ? iceFull(gi, gj) : S.first + off;
    return { base, dover: [fillTile(gi, gj), ice, ...pathOv], fill: true, map: false };
  }
  if (inGrid && ov.length && (ov.some(isIce) || pathOv.length)) return { base, dover: [iceFull(gi, gj), ...pathOv], fill: false, map: true };
  return null;
}
/** проверка (плейтест/тест): «пустых» клеток внутри купола — без земли или с просвечивающим льдом */
export function emptyCellsInDome(rTiles = Number(CITY_CFG.rTiles) || 40): number {
  const ci = Math.floor(CITY_CFG.x / T), cj = Math.floor(CITY_CFG.y / T), r = Math.ceil(rTiles) + 1; let n = 0;
  for (let gj = cj - r; gj <= cj + r; gj++) for (let gi = ci - r; gi <= ci + r; gi++) {
    if (Math.hypot((gi + 0.5) * T - CITY_CFG.x, (gj + 0.5) * T - CITY_CFG.y) / T > rTiles) continue;
    const g = cityGround(gi, gj, rTiles); if (!g || g.dover.some(isIce) || (!g.map && !g.fill)) n++; // ничего не нарисовано или лёд внутри
  }
  return n;
}
// ——— пропсы, точки, проходимость (px мира, со сдвигом карты) ———
const sh = (x: number, y: number): [number, number] => { const [a, b] = mapShiftPx(); return [x + a, y + b]; };
export function mapProps(rTiles = Number(CITY_CFG.rTiles) || 40): { k: string; x: number; y: number; s: number; f: boolean }[] {
  const out: any[] = [];
  for (const p of MAP.props || []) { const [x, y] = sh(p.x, p.y), d = Math.hypot(x - CITY_CFG.x, y - CITY_CFG.y) / T; if (d <= rTiles + EDGE_PAD + 3) out.push({ k: p.k, x, y, s: p.s || 1, f: !!p.f }); }
  return out;
}
export function mapPoint(id: string): [number, number] | null { const p = MAP.points?.[id]; return p?.world ? sh(p.world[0], p.world[1]) : null; }
/** клетка проходимости карты в клетке мира: '.', '#', 'D', 'o' (вне сетки — 'o') */
export function walkCell(gi: number, gj: number): string {
  const [sx, sy] = mapShift(), i = gi - MAP_CELL0[0] - sx, j = gj - MAP_CELL0[1] - sy; const row = MAP.walk?.[j]; if (!row || i < 0 || i >= row.length) return "o"; return row[i] || "o";
}
/** коллайдеры стен/заборов/твёрдых пропсов из сетки walk ('#'): круг r 16 px в каждой клетке (без щелей для героя r 10) */
export function walkColliders(): { x: number; y: number; rx: number; ry: number }[] {
  const out: any[] = []; if (CITY_CFG.on === false) return out;
  const [sx, sy] = mapShift();
  (MAP.walk || []).forEach((row: string, j: number) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") { const gi = MAP_CELL0[0] + sx + i, gj = MAP_CELL0[1] + sy + j; out.push({ x: (gi + 0.5) * T, y: (gj + 0.5) * T, rx: 16, ry: 16 }); } });
  return out;
}
export const mapBuildings = (): any[] => MAP.buildings || [];
