// Досев библиотеки при старте DO: ни одной NULL в NOT NULL-колонках (иначе D1 batch падает на КАЖДОМ старте — прод: mobs.name/kind/stats)
import { seedTables } from "./library";
import { registerBlackMobs } from "./blackMobs";
import { ITEM_BY_ID } from "./defs";
registerBlackMobs(ITEM_BY_ID as any);
const NN: Record<string, string[]> = {
  rarities: ["id", "name", "sort", "color", "budget_mult", "dmg_mult", "drop_pct_mob", "drop_pct_rare", "drop_pct_boss"],
  mobs: ["id", "name", "lvl", "tier", "role", "size", "kind", "rare", "stats", "where_tags", "description"],
  items: ["id", "name", "slot", "rarity", "item_level", "req_level", "stats"],
  mob_drops: ["mob_id", "kind", "ref_id", "chance"],
};
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
for (const [t, rows] of seedTables()) {
  const bad = rows.filter((r: any) => (NN[t] || []).some((c) => r[c] == null)).map((r: any) => (r.id || r.mob_id) + ":" + (NN[t] || []).filter((c) => r[c] == null).join("/"));
  ok(rows.length > 0 && bad.length === 0, `${t}: ${rows.length} строк без NULL в NOT NULL` + (bad.length ? " — " + bad.slice(0, 5).join(", ") : ""));
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
