// Пропсы v2 (утверждённые листы художницы, src/assets/mc/props2/): общие для клиента и сервера метаданные + коллизии.
// Клиент рисует спрайты (engine/propAtlas.js), сервер и клиент (предсказание) считают ОДИНАКОВЫЕ коллайдеры отсюда.
// Коллайдер — эллипс у основания (anchor = низ по центру): полуось rx = доля ширины size_m, ry = rx·ELL_Y
// (вид сверху-сбоку: основание сплюснуто), поэтому за кроной дерева можно пройти — твёрдый только ствол.
import META from "../../src/assets/mc/props2/props_atlas.json";

export const PROPS_META: any = META;
export const PX_PER_M = 20; // мир: 1 м = 20 px
export const ELL_Y = 0.6;
// твёрдые (доля ширины size_m под коллайдер — 40–60%); всё остальное (трава, цветы, декали, сигилы, факелы) — проходимо
const SOLID: Record<string, number> = {
  tree: 0.4, pome_tree: 0.4, dead_tree: 0.4, rock: 0.6, barrel: 0.5, crate: 0.6, well: 0.55, ruin_pillar: 0.5, obelisk: 0.5, pylon: 0.5,
  tent: 0.6, cage: 0.55, campfire: 0.45, tombstone: 0.45, glitch_shard: 0.45, crystal: 0.4, star_crystal: 0.4,
  hell_spire: 0.5, hell_crag: 0.55, hell_wall: 0.6, brazier: 0.4,
  arena_column_crypt: 0.45, arena_column_abyss: 0.45, arena_column_mirror: 0.45, arena_column_abode: 0.45,
  arena_wall_crypt: 0.6, arena_wall_abyss: 0.6, arena_wall_mirror: 0.6, arena_wall_abode: 0.6, heart_of_abode: 0.45,
};
// порталы — твёрдые только по краям арки (две «ноги»), центр проходим — к нему подходят и активируют
export const PORTAL_EDGE = { offset: 0.36, r: 0.09 }; // доли size_m: смещение ног от центра и их радиус

const hash = (x: number, y: number, s: number) => { let h = (Math.imul(Math.floor(x) | 0, 374761393) + Math.imul(Math.floor(y) | 0, 668265263) + Math.imul(s, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** ключ (или старый псевдоним) → базовый ключ v2 */
export function propBase(k: string): string | null { const a = META.aliases[k] || k; return (META.keys as any)[a] ? a : null; }
/** вариант ключа для экземпляра в (x,y): детерминированно (одинаково у сервера и всех клиентов) */
export function propVariant(k: string, x: number, y: number): string | null {
  const b = propBase(k); if (!b) return null;
  const v = (META.variants as any)[b]; if (!v || v.length < 2) return b;
  return v[Math.floor(hash(x, y, 77) * v.length) % v.length];
}
export function propDef(key: string): any { return (META.keys as any)[key] || null; }
/** доля ширины для коллайдера базового вида (с учётом variant_of) или 0 — проходимо */
export function solidK(key: string): number { const d = propDef(key); if (!d) return 0; return SOLID[key] ?? SOLID[d.variant_of] ?? 0; }
export interface Collider { x: number; y: number; rx: number; ry: number }
/** коллайдеры пропса (px мира); s — масштаб экземпляра */
export function propColliders(k: string, x: number, y: number, s = 1, out: Collider[] = []): Collider[] {
  const key = propVariant(k, x, y); if (!key) return out;
  const d = propDef(key), W = d.size_m[0] * PX_PER_M * s;
  if (key === "portal" || key === "portal_arch") { const o = W * PORTAL_EDGE.offset, r = W * PORTAL_EDGE.r; out.push({ x: x - o, y, rx: r, ry: r * ELL_Y }, { x: x + o, y, rx: r, ry: r * ELL_Y }); return out; }
  const k2 = solidK(key); if (!k2) return out;
  const rx = W * k2 / 2; out.push({ x, y, rx, ry: rx * ELL_Y });
  return out;
}

/** Пространственная сетка коллайдеров (ячейка CELL px) — O(1) запрос окрестности */
export class ColliderGrid {
  cells = new Map<number, Collider[]>(); n = 0;
  constructor(public cell = 256, public margin = 48) {} // margin — запас под радиус тела (герой/моб ≤ 48 px)
  key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768); }
  add(c: Collider) { const s = this.cell, m = this.margin, i0 = Math.floor((c.x - c.rx - m) / s), i1 = Math.floor((c.x + c.rx + m) / s), j0 = Math.floor((c.y - c.ry - m) / s), j1 = Math.floor((c.y + c.ry + m) / s); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = this.key(i, j); let a = this.cells.get(k); if (!a) this.cells.set(k, (a = [])); a.push(c); } this.n++; }
  near(x: number, y: number): Collider[] | undefined { return this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell))); }
}
/**
 * Вытолкнуть круг радиуса r из всех коллайдеров рядом (эллипс ⊕ круг ≈ эллипс с полуосями rx+r, ry+r).
 * Возвращает [x, y] — ближайшую свободную точку; 2 прохода (на стыке двух коллайдеров).
 */
export function resolveCircle(grid: ColliderGrid | null, x: number, y: number, r: number): [number, number] {
  if (!grid) return [x, y];
  for (let pass = 0; pass < 2; pass++) {
    const L = grid.near(x, y); if (!L) break;
    let moved = false;
    for (const c of L) {
      const ax = c.rx + r, ay = c.ry + r * ELL_Y, dx = x - c.x, dy = y - c.y;
      const q = (dx * dx) / (ax * ax) + (dy * dy) / (ay * ay);
      if (q >= 1) continue;
      if (q < 1e-6) { x = c.x + ax; moved = true; continue; }
      const k = 1 / Math.sqrt(q) + 1e-3; x = c.x + dx * k; y = c.y + dy * k; moved = true;
    }
    if (!moved) break;
  }
  return [x, y];
}
export function blocked(grid: ColliderGrid | null, x: number, y: number, r = 0): boolean {
  const L = grid?.near(x, y); if (!L) return false;
  for (const c of L) { const ax = c.rx + r, ay = c.ry + r * ELL_Y, dx = x - c.x, dy = y - c.y; if ((dx * dx) / (ax * ax) + (dy * dy) / (ay * ay) < 1) return true; }
  return false;
}
