import { mobHomes, nearestHome } from "./mobHome";
import { WORLD_GEN } from "./zoneGen";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const ar = WORLD_GEN.arinar.regions.find((r) => r.table.length)!, t = ar.table[0].type;
const hs = mobHomes(t); ok(hs.some((h) => h.world === "arinar"), `${t}: водится в Аринаре (${hs.length} мест)`);
const n = nearestHome(t, "arinar", ar.rect[0], ar.rect[1]); ok(n && n.home.world === "arinar" && !n.portal, "в том же мире — ближайший регион, без портала: " + n?.home.region);
const n2 = nearestHome(t, "hellfire", 600, 600); ok(n2 && n2.home.world === "arinar" && n2.portal, "с Поляны — мир Аринар + портал туда: " + JSON.stringify(n2?.portal));
const hub = WORLD_GEN.hellfire.regions.find((r) => r.table.length);
if (hub) { const n3 = nearestHome(hub.table[0].type, "hellfire", 0, 0); ok(n3?.home.world === "hellfire", "моб Поляны — на Поляне: " + hub.table[0].type); }
const b = WORLD_GEN.arinar.bosses[0]; if (b) ok(mobHomes(b.type).some((h) => h.kind === "boss"), "мировой босс — точка логова: " + b.type);
ok(mobHomes("no_such_mob").length === 0 && nearestHome("no_such_mob", "arinar", 0, 0) === null, "неизвестный — пусто");
console.log(f ? `FAILED ${f}` : "mob-home ok"); if (f) process.exit(1);
