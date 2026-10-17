// Аудит мобов/боссов: имена ↔ id, дубли, спавны, цели квестов, места обитания (Безветрие/Часовой и подобные).
import { ZONE_MOBS } from "../../server/meta/defs";
import { VARIANTS, VARIANT_BY_ID, goalMatch } from "../../server/meta/biomes";
import { WORLD_GEN } from "../../server/meta/zoneGen";
import { QUESTS } from "../../server/meta/quests";
import { mobHomes } from "../../server/meta/mobHome";
import { MOBS_PUBLIC } from "../../server/meta/generated/public";
const out: string[] = []; const say = (s: string) => { out.push(s); console.log(s); };
const Z: any = ZONE_MOBS;
// 1. дубли имён
const byName = new Map<string, string[]>();
for (const [id, m] of Object.entries(Z) as any) { const k = String(m.name).toLowerCase(); byName.set(k, [...(byName.get(k) || []), id]); }
for (const [n, ids] of byName) if (ids.length > 1) say(`DUP-NAME «${n}»: ${ids.join(", ")}`);
// 2. варианты: id коллизия, база существует, вариант-босс с базой-боссом другого имени
for (const v of VARIANTS) {
  if (!Z[v.base]) say(`VARIANT ${v.id}: нет базы ${v.base}`);
  const b = Z[v.base];
  if (v.boss) say(`BOSS-VARIANT ${v.id} «${v.name}» (ур.${v.lvl}, ${v.biome}) → база ${v.base} «${b?.name}»${b?.boss ? " (база — тоже босс: раньше засчитывался/отслеживался как она)" : ""}`);
  else if (b?.boss) say(`MINION-VARIANT-OF-BOSS ${v.id} «${v.name}» → база-босс ${v.base} «${b?.name}»`);
}
// 3. спавны регионов/боссов/редких — на несуществующих мобов
for (const [w, G] of Object.entries(WORLD_GEN) as any) {
  for (const r of G.regions) for (const row of r.table || []) if (!Z[row.type]) say(`SPAWN ${w}/${r.id}: нет моба ${row.type}`);
  for (const b of G.bosses || []) if (!Z[b.type]) say(`BOSS-SPAWN ${w}: нет моба ${b.type}`); else if (!Z[b.type].boss) say(`BOSS-SPAWN ${w}: ${b.type} «${Z[b.type].name}» не помечен boss`);
  for (const r of G.rares || []) if (!Z[r.type]) say(`RARE ${w}: нет моба ${r.type}`);
}
// 4. цели квестов (код)
for (const q of QUESTS) q.objectives.forEach((o: any, i) => {
  if ((o.type === "kill" || o.type === "kill_boss") && !Z[o.mob]) say(`QUEST ${q.id}[${i}]: нет моба ${o.mob}`);
  if (o.type === "kill_boss" && Z[o.mob] && !Z[o.mob].boss) say(`QUEST ${q.id}[${i}]: kill_boss на не-боссе ${o.mob}`);
  if (o.type === "kill" || o.type === "kill_boss") { const wrong = VARIANTS.filter((v) => v.base === o.mob && v.boss).map((v) => `${v.id} «${v.name}»`);
    if (wrong.length) say(`QUEST ${q.id}[${i}] «${o.text}»: цель ${o.mob} «${Z[o.mob]?.name}» — раньше засчитывались и отслеживались ещё ${wrong.join(", ")}; теперь только точное совпадение`); }
});
// 5. места обитания: базовые боссы больше не ведут к вариантам-боссам
for (const v of VARIANTS.filter((x) => x.boss)) { const hs = mobHomes(v.base).length, hv = mobHomes(v.id).length; say(`HOMES ${v.base}: ${hs} мест; ${v.id}: ${hv} мест; goalMatch(${v.base}, ${v.id}) = ${goalMatch(v.base, v.id)}`); }
// 6. бестиарий (публичные данные) ↔ ZONE_MOBS имена
for (const [id, p] of Object.entries(MOBS_PUBLIC) as any) if (Z[id] && Z[id].name !== p.name) say(`NAME ${id}: зона «${Z[id].name}» ≠ бестиарий «${p.name}»`);
console.log(`\n${out.length} строк`);
