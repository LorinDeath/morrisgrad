// Проходимость точки мира для входа/телепорта: твёрдые пропсы (propCollision.ts) + подключаемые проверки.
// WALK_HOOKS — сюда регистрируются новые запреты (вода/лава с ветки ui-cursed-rework: WALK_HOOKS.push((w, x, y) => !isWater(w, x, y))).
import { blockedWorld, BODY_R } from "./propCollision";
import { worldBounds } from "../worlds/sizes";
export const WALK_HOOKS: ((world: string, x: number, y: number) => boolean)[] = [];
export const POS_WORLDS = new Set(["arinar", "hellfire"]); // мир, куда можно вернуть при входе (арена/забеги — нет)
export function walkable(world: string, x: number, y: number, r = BODY_R): boolean {
  const [lo, hi] = worldBounds(world); if (!(x >= lo && x <= hi && y >= lo && y <= hi)) return false;
  try { if (blockedWorld(world, x, y, r)) return false; } catch { return false; }
  for (const h of WALK_HOOKS) { try { if (!h(world, x, y)) return false; } catch { return false; } }
  return true;
}
/** ближайшая проходимая точка: спираль до maxR px (null — не нашли) */
export function freeWalk(world: string, x: number, y: number, maxR = 640): [number, number] | null {
  if (walkable(world, x, y)) return [x, y];
  for (let k = 1; k * 9 <= maxR; k++) { const a = k * 2.399, d = 9 * k, nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d; if (walkable(world, nx, ny)) return [Math.round(nx), Math.round(ny)]; }
  return null;
}
