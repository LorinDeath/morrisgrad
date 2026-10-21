// @ts-nocheck
// Коллизии пропсов v2 по мирам: одна сетка ColliderGrid на мир. Источник пропсов — те же чистые раскладки, что рисует клиент
// (worldLayout.ts для Поляны/арены, arinarLayout.ts для чанков Аринара), поэтому сервер (авторитетно) и клиент (предсказание)
// выталкивают одинаково. Аринар 48000 px строится лениво: чанк (≈1.8 мс) — при первом запросе точки рядом, затем кэш.
import { ColliderGrid, propColliders, resolveCircle, blocked } from './propsV2.ts';
import { layoutWorld } from './worldLayout.ts';
import { CELL as A_CELL, CH, arinarPlan, layoutChunk } from './arinarLayout.ts';
import { WORLD_PORTALS } from '../worlds/portals.ts';
import { worldBounds } from '../worlds/sizes.ts';
import { inRoomArea, resolveRoom, roomAt, roomBounds, roomWalkable, buildingColliders } from './cityBuild.ts';

export const BODY_R = 10;              // радиус тела героя (как прежний hub.map.isBlocked(…, 10))
const ALTAR_EDGE = { o: 22, r: 9 };    // алтарь Перевоплощения: основание ~60 px — твёрдые края, центр активируем
const grids = new Map<string, any>();

function addPortals(g: ColliderGrid, world: string) {
  for (const p of WORLD_PORTALS) {
    if ((p.world || 'hellfire') !== world) continue;
    if (p.id === 'portal_class_select') {
      for (const s of [-1, 1]) g.add({ x: p.x + s * ALTAR_EDGE.o, y: p.y, rx: ALTAR_EDGE.r, ry: ALTAR_EDGE.r * 0.6 });
    } else for (const c of propColliders('portal', p.x, p.y, 0.75)) g.add(c);
  }
}

class ArinarGrid {
  grid = new ColliderGrid(); done = new Set<number>(); plan = null; span = A_CELL * CH;
  ensure(x: number, y: number) {
    const ci = Math.floor(x / this.span), cj = Math.floor(y / this.span);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj, k = i * 4096 + j;
      if (i < 0 || j < 0 || this.done.has(k)) continue;
      this.done.add(k);
      if (!this.plan) { this.plan = arinarPlan(); addPortals(this.grid, 'arinar'); for (const c of buildingColliders()) this.grid.add(c); } // здания города
      if (i * this.span >= this.plan.size || j * this.span >= this.plan.size) continue;
      const L = layoutChunk(this.plan, i, j);
      for (const p of L.props) for (const c of propColliders(p.k, p.x, p.y, p.s)) this.grid.add(c);
      for (const c of L.cols || []) this.grid.add(c); // центральный объект города, пропсы dm_* (city.ts / cityBuild.ts)
    }
    return this.grid;
  }
}

/** Сетка коллайдеров мира вокруг точки (x, y) или null, если у мира нет пропсов */
export function worldGrid(world: string, x = 0, y = 0): ColliderGrid | null {
  world = world || 'hellfire';
  let g = grids.get(world);
  if (g === undefined) {
    if (world === 'arinar') g = new ArinarGrid();
    else {
      try {
        const L = layoutWorld(world); g = new ColliderGrid();
        for (const p of L.props) propColliders(p.k, p.x, p.y, p.s).forEach((c) => g.add(c));
        addPortals(g, world);
      } catch { g = null; }
    }
    grids.set(world, g);
  }
  return g instanceof ArinarGrid ? g.ensure(x, y) : g;
}

/** Вытолкнуть тело радиуса r из твёрдых пропсов мира */
export function resolveWorld(world: string, x: number, y: number, r = BODY_R): [number, number] {
  if (world === 'arinar' && inRoomArea(x, y)) return resolveRoom(x, y, r); // интерьер здания города (cityBuild.ts)
  return resolveCircle(worldGrid(world, x, y), x, y, r);
}
export function blockedWorld(world: string, x: number, y: number, r = BODY_R): boolean {
  if (world === 'arinar' && inRoomArea(x, y)) return !roomWalkable(x, y, r);
  return blocked(worldGrid(world, x, y), x, y, r);
}
/** границы перемещения [lo, hi] в точке: в интерьере — комната, иначе мир (worldBounds) */
export function boundsAt(world: string, x: number, y: number): [number, number] {
  if (world === 'arinar' && inRoomArea(x, y)) { const b = roomAt(x, y); if (b) return roomBounds(b); }
  return worldBounds(world);
}
/** Ближайшая свободная точка (для спавнов): спираль от (x, y) */
export function freeSpot(world: string, x: number, y: number, r = BODY_R): [number, number] {
  if (!blockedWorld(world, x, y, r)) return [x, y];
  for (let k = 1; k <= 24; k++) {
    const a = k * 2.399, d = 12 * k;
    const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
    if (!blockedWorld(world, nx, ny, r)) return [nx, ny];
  }
  return resolveWorld(world, x, y, r);
}
