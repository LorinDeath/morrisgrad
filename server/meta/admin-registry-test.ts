// Админка — единый источник правды: каждая сущность из кодовых реестров видна в каталоге админки
import { AdminStore } from "./admin";
import { MONSTER_LOOT, ZONE_MOBS, ITEM_BY_ID, ABILITY_BY_ID, WEAPON_TYPES } from "./defs";
let fail = 0; const eq = (n: string, a: number, b: number) => { const ok = a === b; if (!ok) fail++; console.log(`${ok ? "ok  " : "FAIL"} ${n}: админка ${a}, реестр ${b}`); };
const c: any = new AdminStore(null).catalog().ent;
const cnt = (k: string) => (Array.isArray(c[k]) ? c[k].length : Object.keys(c[k] || {}).length);
eq("мобы", cnt("mob"), Object.keys(ZONE_MOBS).length);
eq("дроп ⊇ мобы", Object.keys(ZONE_MOBS).filter((k) => !MONSTER_LOOT[k]).length, 0);
eq("дроп", cnt("loot"), Object.keys(MONSTER_LOOT).length);
eq("предметы", cnt("item"), Object.keys(ITEM_BY_ID).length);
eq("навыки", cnt("skill"), Object.keys(ABILITY_BY_ID).length);
eq("оружие", cnt("weapon"), Object.keys(WEAPON_TYPES).length);
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("admin-registry ok");
