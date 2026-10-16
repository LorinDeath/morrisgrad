// Подписи биомов на карте M: «биом · ур. мобов» для каждой зоны (ключ = тип региона без номера клетки).
// Уровни берутся из ЖИВОЙ таблицы мобов (ZONE_MOBS с правками админки «Бестиарий»), а не из кода —
// сервер шлёт сводку в meta_state; клиент подписывает только разведанные (туман войны) места.
import { BIOMES, type BiomeId } from "./biomes";

/** названия зон для карты (админка «🧭 Биомы», kind='biome', id = ключ зоны): name — биом, sub — зона */
export const ZONE_NAMES: Record<string, { name: string; sub: string; icon?: string }> = {};
export function initZoneNames(regions: { id: string; name: string; biome: string }[]) {
  for (const r of regions) { const key = zoneKeyOf(r.id); if (ZONE_NAMES[key]) continue; const [name, sub] = splitName(r); ZONE_NAMES[key] = { name, sub }; }
  return ZONE_NAMES;
}
function splitName(r: { name: string; biome: string }): [string, string] {
  const nm = r.name.replace(/\s*\([^)]*пятно[^)]*\)\s*$/, "");
  return r.biome.startsWith("b_") && nm.includes(": ") ? [nm.slice(0, nm.indexOf(": ")), nm.slice(nm.indexOf(": ") + 2)] : [nm, ""];
}
export const zoneKeyOf = (id: string) => id.split("#")[0];
export interface MapZone { name: string; sub: string; lvl: [number, number]; color: string; safe?: true }
const LEGACY_COL: Record<string, string> = { grove: "#4ade80", meadow: "#a78bfa", garden: "#f472b6", waste: "#93c5fd", rot: "#a3e635", ridge: "#d6a76c", pylon: "#818cf8", glitch: "#4ade80", crater: "#c4b5fd", thin: "#e9d5ff" };

/** regions — регионы мира (WORLD_GEN[w].regions, таблицы заполнены сервером); mobs — живая таблица мобов */
export function mapZones(regions: { id: string; name: string; biome: string; lvl: [number, number]; table: { type: string }[] }[], mobs: Record<string, { lvl?: number } | undefined>): Record<string, MapZone> {
  const out: Record<string, MapZone> = {};
  for (const r of regions) {
    const key = zoneKeyOf(r.id); if (out[key]) continue;
    const lv = (r.table || []).map((t) => mobs[t.type]?.lvl).filter((v): v is number => Number.isFinite(v));
    const lvl: [number, number] = lv.length ? [Math.min(...lv), Math.max(...lv)] : [r.lvl[0], r.lvl[1]];
    const b = r.biome.startsWith("b_") ? BIOMES[r.biome.slice(2) as BiomeId] : null;
    const def = splitName(r), ov = ZONE_NAMES[key], name = ov?.name || def[0], sub = ov ? ov.sub ?? def[1] : def[1];
    out[key] = { name, sub, lvl, color: b ? b.color : LEGACY_COL[r.biome] || "#fde68a", ...(lv.length ? {} : { safe: true as const }) };
  }
  return out;
}
