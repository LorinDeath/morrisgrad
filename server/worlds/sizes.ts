// Размеры миров (px; 20 px = 1 м). Аринар — 48000×48000 px (1500×1500 клеток по 32 px мира; 1 клетка = тайл 16 px арта ×2):
// центральный хаб + 4 стихийных биома + дальние окраины ярусов 6–25 (meta/zoneGen.ts, meta/biomes.ts).
// arena — закрытая арена PvP-дуэли: 25×25 клеток по 32 px, по краю — стена в одну клетку.
export const WORLD_SIZES: Record<string, number> = { hellfire: 1200, arinar: 48000, arena: 800 };
export function worldSize(world: string | null | undefined): number { return WORLD_SIZES[world || "hellfire"] || 1200; }
export const ARENA_CELL = 32;
export const ARENA_PAD = ARENA_CELL + 14; // стена + радиус героя
// допустимые координаты центра героя в мире (стены арены непроходимы)
export function worldBounds(world: string | null | undefined): [number, number] {
  const s = worldSize(world);
  return world === "arena" ? [ARENA_PAD, s - ARENA_PAD] : [0, s];
}
// Аринар: хаб в центре, крупные миры стримятся чанками (клиент) и спят по чанкам (сервер)
export const ARINAR_HUB = { x: 24000, y: 24000, r: 1200 };
export const WORLD_CHUNK = 2000; // px: ячейка «сна» сервера и интереса игрока
export const ARINAR_LAYOUT_VER = 3; // версия раскладки: старые позиции (v1 2400 px, v2 24000 px) → возрождение в хабе

// Обзор камеры в открытом мире (Аринар): клеток (32 px) по большей стороне экрана — ближе / по умолчанию / дальше.
// Сервер шлёт мобов/игроков только в квадрате ±OPEN_AOI — с запасом на самый дальний зум, не больше.
export const VIEW_CELLS = { min: 30, def: 60, max: 90 };
export const CELL_PX = 32;
export const OPEN_AOI = Math.round((VIEW_CELLS.max * CELL_PX) / 2 * 1.1); // 1584 px
