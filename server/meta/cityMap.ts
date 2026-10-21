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
/** клумба розы на карте (клетки 767..770 × 99..102, «tilled_rot» + столбики) — по решению пользователя роза стоит на ТРАВЕ:
 *  клетки клумбы — трава (оверлеи карты сняты), столбики/ведро вокруг убраны; под розой клиент рисует пятно порчи (cityView) */
// ——— правки карты поверх alkazak_map.json (карта Историка не меняется; правки — данные здесь) ———
/** колодец с мощёной площади — на траву (7 клеток к югу: ближайшее место 5×4 без мощения/тропы); проходимость (#) переезжает вместе с ним. Ведро — часть кадра dm_well */
export const WELL_MOVES: { from: [number, number]; to: [number, number] }[] = [{ from: [24758, 3468], to: [24758, 3692] }];
{ const W: string[] = MAP.walk || [], [ox, oy] = MAP.world_origin_px || [23136, 1888];
  for (const m of WELL_MOVES) { const p = (MAP.props || []).find((q: any) => q.k === "dm_well" && q.x === m.from[0] && q.y === m.from[1]); if (!p) continue; // уже перенесён (модуль грузится раз)
    const i0 = Math.floor((m.from[0] - ox) / T), j0 = Math.floor((m.from[1] - oy) / T), di = Math.round((m.to[0] - m.from[0]) / T), dj = Math.round((m.to[1] - m.from[1]) / T);
    const cells: [number, number][] = []; for (let j = j0 - 2; j <= j0 + 1; j++) for (let i = i0 - 2; i <= i0 + 2; i++) if (W[j]?.[i] === "#") cells.push([i, j]);
    const set = (i: number, j: number, c: string) => { if (W[j] && i >= 0 && i < W[j].length) W[j] = W[j].slice(0, i) + c + W[j].slice(i + 1); };
    for (const [i, j] of cells) set(i, j, "."); for (const [i, j] of cells) set(i + di, j + dj, "#");
    p.x = m.to[0]; p.y = m.to[1]; } }
/** вертикальный забор: в атласе только горизонтальный пролёт dm_fence и узловой столб dm_fence_post (с обрубками жердей вбок).
 *  Колонна столбов через 32 px торчала обрубками → колонна пересобирается: столбы без перекладин (dm_fence_vpost) через ~64 px
 *  и жердь вдоль глубины (dm_fence_vrail, растягивается между столбами; len — длина пролёта px). Концы колонны
 *  стыкуются с крайним колышком горизонтального пролёта (x — на его колышек, y — до его основания). Арт: tools/city-fence/gen.py */
export const FENCE_END_DX = [-25, 27]; // крайние колышки dm_fence от центра, px мира (кадр 32 px × 2)
export function fenceRuns(props: any[]): any[] {
  const H_RE = /^dm_fence(_gate|_broken)?$/, hor = props.filter((p) => H_RE.test(p.k)), posts = props.filter((p) => p.k === "dm_fence_post");
  const byX = new Map<number, any[]>(); for (const p of posts) { let a = byX.get(p.x); if (!a) byX.set(p.x, (a = [])); a.push(p); }
  const drop = new Set<any>(), out: any[] = [];
  for (const [x, col] of byX) {
    col.sort((a, b) => a.y - b.y);
    const runs: any[][] = []; for (const p of col) { const r = runs[runs.length - 1]; if (r && p.y - r[r.length - 1].y <= 34) r.push(p); else runs.push([p]); }
    for (const r of runs) { if (r.length < 2) continue; const y0 = r[0].y, y1 = r[r.length - 1].y;
      // стык с горизонтальным пролётом: крайний колышек в пределах 28 px по x, основание — в 48 px над/под колонной
      const end = (fy: (h: any) => boolean) => { let best: any = null; for (const h of hor) if (fy(h)) for (const dx of FENCE_END_DX) { const d = Math.abs(h.x + dx - x); if (d <= 28 && (!best || d < best.d)) best = { d, x: h.x + dx, y: h.y }; } return best; };
      const top = end((h) => h.y < y0 && y0 - h.y <= 48), bot = end((h) => h.y > y1 && h.y - y1 <= 48);
      const X = top ? top.x : bot ? bot.x : x, yA = top ? top.y : y0, yB = bot ? bot.y : y1, n = Math.max(1, Math.round((yB - yA) / 64)), st = (yB - yA) / n;
      for (let i = 0; i <= n; i++) { const y = Math.round(yA + st * i);
        if ((i > 0 || !top) && (i < n || !bot)) out.push({ k: "dm_fence_vpost", x: X, y, s: 1, f: false });  // столб (на стыке — колышек пролёта)
        if (i > 0) out.push({ k: "dm_fence_vrail", x: X, y, s: 1, f: false, len: Math.round(st) }); }     // жердь от этого столба вглубь до предыдущего
      for (const p of r) drop.add(p);
      if (Math.floor(X / T) !== Math.floor(x / T)) WALK_SHIFT.push({ from: Math.floor(x / T), to: Math.floor(X / T), j0: Math.floor(yA / T) + 1, j1: Math.floor(yB / T) - 1 }); }
  }
  return props.filter((p) => !drop.has(p)).concat(out);
}
/** колонна сдвинута на соседнюю клетку (стык с колышком) — стена проходимости (#) едет за ней (клетки мира карты, без сдвига) */
export const WALK_SHIFT: { from: number; to: number; j0: number; j1: number }[] = [];
const PROPS_FIX: any[] = fenceRuns(MAP.props || []);
{ const W: string[] = MAP.walk || [], [ox, oy] = MAP.world_origin_px || [23136, 1888], c0 = Math.floor(ox / T), r0 = Math.floor(oy / T);
  const set = (i: number, j: number, c: string) => { if (W[j] && i >= 0 && i < W[j].length) W[j] = W[j].slice(0, i) + c + W[j].slice(i + 1); };
  for (const m of WALK_SHIFT) for (let gj = m.j0; gj <= m.j1; gj++) { const j = gj - r0; if (W[j]?.[m.from - c0] === "#" && W[j]?.[m.to - c0] === ".") { set(m.from - c0, j, "."); set(m.to - c0, j, "#"); } } }
const propsFixed = () => PROPS_FIX;
export const ROSE_BED = { i0: 767, i1: 770, j0: 99, j1: 102 };
const inRoseBed = (i: number, j: number) => { const [a, b] = [MAP_CELL0[0], MAP_CELL0[1]]; const ci = i + a, cj = j + b; return ci >= ROSE_BED.i0 && ci <= ROSE_BED.i1 && cj >= ROSE_BED.j0 && cj <= ROSE_BED.j1; };
/** прямоугольник клумбы в px мира (со сдвигом карты) */
export function roseBedPx(): [number, number, number, number] { const [a, b] = mapShiftPx(); return [ROSE_BED.i0 * T + a, ROSE_BED.j0 * T + b, (ROSE_BED.i1 + 1) * T + a, (ROSE_BED.j1 + 1) * T + b]; }
export function cityGround(gi: number, gj: number, rTiles = Number(CITY_CFG.rTiles) || 40): CityGround | null {
  if (CITY_CFG.on === false) return null;
  const d = Math.hypot((gi + 0.5) * T - CITY_CFG.x, (gj + 0.5) * T - CITY_CFG.y) / T;
  if (d > rTiles + 2 && d > 48) return null;
  const [sx, sy] = mapShift(), i = gi - MAP_CELL0[0] - sx, j = gj - MAP_CELL0[1] - sy, inGrid = i >= 0 && j >= 0 && i < N && j < N;
  const ov = inGrid && !inRoseBed(i, j) ? over().get(j * N + i) || [] : []; // клумба розы — трава
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
  const [bx0, by0, bx1, by1] = roseBedPx(), bed = (x: number, y: number) => x > bx0 - T && x < bx1 + T && y > by0 - T && y < by1 + T;
  for (const p of propsFixed()) { const [x, y] = sh(p.x, p.y); if (bed(x, y) && /^dm_(fence|bucket)/.test(p.k)) continue; const d = Math.hypot(x - CITY_CFG.x, y - CITY_CFG.y) / T; if (d <= rTiles + EDGE_PAD + 3) out.push(p.len ? { k: p.k, x, y, s: p.s || 1, f: !!p.f, len: p.len } : { k: p.k, x, y, s: p.s || 1, f: !!p.f }); }
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
