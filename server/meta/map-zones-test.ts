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
{ // админка «🧭 Биомы»: правка названия зоны (kind biome) → подпись карты, сброс — как в коде
  const { validatePatch, applyOverride, TABLES } = await import("./overrides");
  ok(!!TABLES.biome.ice_inner && TABLES.biome.ice_inner.name === "Кровавые льды", "kind biome: запись на зону");
  ok(typeof validatePatch("biome", "ice_inner", { name: "x".repeat(60) }) === "string", "длинное имя отклонено");
  const pt = validatePatch("biome", "ice_inner", { name: "Алые <b>снега</b>", sub: "Наст" }); ok(typeof pt !== "string" && !(pt as any).name.includes("<"), "теги вырезаны " + JSON.stringify(pt));
  applyOverride("biome", "ice_inner", pt as any); const z2 = mapZones(R, ZONE_MOBS as any); ok(z2.ice_inner.name.startsWith("Алые") && z2.ice_inner.sub === "Наст", "имя с админки на карте: " + z2.ice_inner.name);
  applyOverride("biome", "ice_inner", null); ok(mapZones(R, ZONE_MOBS as any).ice_inner.name === "Кровавые льды", "сброс — как в коде");
  console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
}
