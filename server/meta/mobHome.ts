// Где водится моб (для «Отслеживать» из Бестиария): статические данные генерации мира — регионы, где тип в таблице спавна,
// мировые боссы и редкие Отголоски. Общая часть сервера и клиента. Живые мобы/лагеря рядом уточняют цель на клиенте.
import { WORLD_GEN } from "./zoneGen";
import { baseOf } from "./biomes";
import { WORLD_PORTALS } from "../worlds/portals";

export const WORLD_NAMES: Record<string, string> = { arinar: "Аринар", hellfire: "Поляна" };
export interface MobHome { world: string; x: number; y: number; region: string; kind: "region" | "boss" | "rare" }
const cache = new Map<string, MobHome[]>();
const same = (t: string, id: string) => t === id || baseOf(t) === id || baseOf(id) === t;

export function mobHomes(id: string): MobHome[] {
  if (cache.has(id)) return cache.get(id)!;
  const out: MobHome[] = [];
  for (const [world, G] of Object.entries(WORLD_GEN)) {
    const byId = new Map(G.regions.map((r) => [r.id, r]));
    for (const r of G.regions) if (r.table?.some((row) => same(row.type, id))) out.push({ world, x: (r.rect[0] + r.rect[2]) / 2, y: (r.rect[1] + r.rect[3]) / 2, region: r.name, kind: "region" });
    for (const b of G.bosses || []) if (same(b.type, id)) out.push({ world, x: b.x, y: b.y, region: b.where || "", kind: "boss" });
    for (const r of G.rares || []) if (same(r.type, id)) { const rg = byId.get(r.region); if (rg) out.push({ world, x: (rg.rect[0] + rg.rect[2]) / 2, y: (rg.rect[1] + rg.rect[3]) / 2, region: rg.name, kind: "rare" }); }
  }
  cache.set(id, out); return out;
}
/** Ближайшее место обитания: в текущем мире — ближайший регион; иначе — первый мир, где водится, и портал туда из текущего. */
export function nearestHome(id: string, world: string, x: number, y: number): { home: MobHome; portal?: { x: number; y: number; name: string } } | null {
  const hs = mobHomes(id); if (!hs.length) return null;
  const here = hs.filter((h) => h.world === world);
  if (here.length) { let best = here[0], bd = Infinity; for (const h of here) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } } return { home: best }; }
  const home = hs[0];
  const p = (WORLD_PORTALS as any[]).find((q) => (q.world || "hellfire") === world && q.targetWorld === home.world && q.x != null);
  return { home, portal: p ? { x: p.x, y: p.y, name: p.name || "Портал" } : undefined };
}
