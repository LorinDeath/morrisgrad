// Размеры миров (px; 20 px = 1 м). Аринар расширен под пять ярусов сложности (ур. 1–25).
// arena — закрытая арена PvP-дуэли: 25×25 клеток по 32 px, по краю — стена в одну клетку.
export const WORLD_SIZES: Record<string, number> = { hellfire: 1200, arinar: 2400, arena: 800 };
export function worldSize(world: string | null | undefined): number { return WORLD_SIZES[world || "hellfire"] || 1200; }
export const ARENA_CELL = 32;
export const ARENA_PAD = ARENA_CELL + 14; // стена + радиус героя
// допустимые координаты центра героя в мире (стены арены непроходимы)
export function worldBounds(world: string | null | undefined): [number, number] {
  const s = worldSize(world);
  return world === "arena" ? [ARENA_PAD, s - ARENA_PAD] : [0, s];
}
