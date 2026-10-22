// Админка «Спавн» → локации: плотность лагерей, пачки, мобы в пачке, лимит элит, босс; пересборка без дублей
import { Zone } from "./zone";
import { ZONE_NODES } from "./defs";
import { ZONE_GEN } from "./zoneGen";
import { validatePatch, applyOverride, TABLES } from "./overrides";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const z: any = new Zone("arinar", [], ZONE_NODES, { proc: true, seed: ZONE_GEN.seed });
const rid = Object.keys(TABLES.region).find((id) => z.camps.filter((c: any) => c.region === id).length >= 4)!;
const cnt = () => z.camps.filter((c: any) => c.region === rid).length, alive = () => z.mobs.filter((m: any) => !m.dead && m.camp && z.camps.find((c: any) => c.id === m.camp)?.region === rid);
const c0 = cnt(), ids0 = new Set(z.camps.map((c: any) => c.id));
ok(c0 > 0, `локация ${rid}: лагерей ${c0}`);
const p = validatePatch("region", rid, { dens: 2, "packs.0": 3, "packs.1": 3, "pack.0": 2, "pack.1": 2, eliteMax: 1, elite: 1 });
ok(typeof p !== "string", "патч плотности валиден");
ok(typeof validatePatch("region", rid, { "pack.0": 5, "pack.1": 2 }) === "string", "«от» > «до» отклонено");
applyOverride("region", rid, p); z.regenRegion(rid);
const c1 = cnt(); ok(c1 > c0, `плотность ×2: лагерей ${c0} → ${c1}`);
ok(z.camps.filter((c: any) => c.region === rid).every((c: any) => !ids0.has(c.id)), "новые id лагерей (без дублей)");
const byCamp = new Map<number, any[]>(); for (const m of alive()) { const l = byCamp.get(m.camp) || []; l.push(m); byCamp.set(m.camp, l); }
const sizes = [...byCamp.values()].map((l) => l.filter((m) => !m.chief).length);
ok(sizes.every((n) => n === 9), `3 пачки × 2 моба × 1.5 (численность лагерей) = 9 в каждом лагере (${[...new Set(sizes)]})`);
ok([...byCamp.values()].every((l) => l.filter((m) => m.elite && !m.chief).length <= 1), "элит в лагере ≤ 1 (кроме вожаков)");
const stale = z.mobs.filter((m: any) => !m.dead && m.camp && !z.camps.some((c: any) => c.id === m.camp)).length;
ok(stale === 0, "живых мобов от старых лагерей не осталось");
applyOverride("region", rid, { dens: 0 }); z.regenRegion(rid); ok(cnt() === 0, "множитель 0 — лагерей нет");
applyOverride("region", rid, null);
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("region-density ok");
