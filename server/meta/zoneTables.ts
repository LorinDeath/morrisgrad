// Таблицы мобов регионов (только сервер): из тегов where бестиария. Импортируется zone.ts.
import { BESTIARY } from "./bestiary";
import { WORLD_GEN, type MobRow } from "./zoneGen";

const PACK: Record<string, [number, number]> = { swarm: [3, 5], charger: [1, 3], melee: [1, 3], ranged: [1, 2], caster: [1, 2], tank: [1, 1] };
const ROLE_W: Record<string, number> = { swarm: 0.85, tank: 0.7, caster: 0.9, ranged: 1, melee: 1, charger: 1 };
export function regionTable(tags: Record<string, number>): MobRow[] {
  const out: MobRow[] = [];
  for (const m of BESTIARY) {
    if (m.rare || m.size !== "s") continue;
    let w = 0;
    for (const t of m.where) if (tags[t]) w = Math.max(w, tags[t]);
    if (w) out.push({ type: m.id, w: Math.round(w * ROLE_W[m.role] * 100) / 100, pack: PACK[m.role] });
  }
  return out;
}
for (const w of Object.values(WORLD_GEN)) for (const r of w.regions) {
  if (r.table.length) continue;
  r.table = regionTable(r.tags);
  // «Фиолетовая ночь»: ночные Отголоски появляются чаще
  r.night = Object.fromEntries(r.table.filter((x) => /moth|ghost|wisp|wraith|shade|bat|eye/.test(x.type)).map((x) => [x.type, 1.8]));
}
export const TABLES_READY = true;
