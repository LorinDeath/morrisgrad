// Размеры миров (px; 20 px = 1 м). Аринар расширен под пять ярусов сложности (ур. 1–25).
export const WORLD_SIZES: Record<string, number> = { hellfire: 1200, arinar: 2400 };
export function worldSize(world: string | null | undefined): number { return WORLD_SIZES[world || "hellfire"] || 1200; }
