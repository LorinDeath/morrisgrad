// Карта M: сводка зон (биом · уровни мобов) — из живой таблицы мобов, правка уровня в админке меняет подпись.
import { mapZones, zoneKeyOf } from "./mapZones";
import { WORLD_GEN } from "./zoneGen";
import "./zoneTables";
import { ZONE_MOBS } from "./defs";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const R = WORLD_GEN.arinar.regions as any[];
let z = mapZones(R, ZONE_MOBS as any);
ok(zoneKeyOf("ice_inner#3_4") === "ice_inner", "ключ зоны без номера клетки");
ok(z.ice_inner && z.ice_inner.name === "Кровавые льды" && z.ice_inner.sub === "Алый наст", `стихия: биом + зона ${JSON.stringify(z.ice_inner)}`);
ok(z.ice_inner.lvl[0] === 3 && z.ice_inner.lvl[1] === 5, `ур. из таблицы мобов ${z.ice_inner.lvl}`);
ok(z.hub?.safe === true, "хаб — без монстров");
ok(z.groves && z.groves.lvl[0] >= 1 && !z.groves.safe, `кольцо хаба: мобы из таблицы ${z.groves?.lvl}`);
ok(Object.keys(z).length >= 15 && Object.values(z).every((v) => !/пятно/.test(v.name + v.sub)), `зон ${Object.keys(z).length}, без «пятно N» в подписи`);
const t = "ice_garden_golem", was = (ZONE_MOBS as any)[t].lvl; (ZONE_MOBS as any)[t].lvl = 30; // как правка админки «Бестиарий»
z = mapZones(R, ZONE_MOBS as any); ok(z.ice_outer.lvl[1] === 30, `правка ур. моба → подпись ${z.ice_outer.lvl}`); (ZONE_MOBS as any)[t].lvl = was;
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
