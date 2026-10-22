// Реестр Бестиария: всё, что появляется в игре, — в реестре и в своей группе; убийства вариантов/боссов/забегов пишутся в свои карточки.
import { bestiaryRegistry, arenaKey, ARENA_ONLY, TRIAL_BOSS_WAVE, BGROUPS } from "./bestiaryReg";
import { bestiaryKey, summonPool, VARIANT_BY_ID } from "./biomes";
import { ZONE_MOBS, HUB_SPAWNS } from "./defs";
import { WORLD_GEN, BOSS_TIMERS } from "./zoneGen";
import { MOB_INFO } from "./shared";
import { newAccount } from "./profile";
import { MetaService } from "./service";
import { RUN_ROOMS, ROOM_WAVES, ROOM_BOSS, ROOM_ELITES, TRIAL_WAVES, ENEMIES } from "../../src/pages/MorrisCurse/_core/survivors/data.js";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const reg = bestiaryRegistry(), by = Object.fromEntries(reg.map((e) => [e.id, e]));
const cnt: Record<string, number> = {}; for (const e of reg) cnt[e.g] = (cnt[e.g] || 0) + 1;
console.log("реестр:", reg.length, JSON.stringify(cnt));

// 1) всё, что спавнится, есть в реестре
const spawn = new Set<string>();
for (const G of Object.values(WORLD_GEN) as any[]) {
  for (const r of G.regions) for (const row of r.table || []) spawn.add(row.type);
  for (const b of G.bosses || []) { spawn.add(b.type); for (const t of summonPool(ZONE_MOBS, (ZONE_MOBS as any)[b.type])) spawn.add(t); }
  for (const r of G.rares || []) spawn.add(r.type);
}
for (const s of HUB_SPAWNS) spawn.add(s.type);
for (const t of Object.values(BOSS_TIMERS)) spawn.add(t.type);
for (const room of Object.keys(RUN_ROOMS)) {
  for (const m of room === "trial" ? (TRIAL_WAVES as any[]) : ((ROOM_WAVES as any)[room] || []).map((w: any) => w.mix)) for (const t of Object.keys(m)) spawn.add(t);
  for (const t of (ROOM_ELITES as any)[room] || []) spawn.add(t);
  if ((ROOM_BOSS as any)[room]) spawn.add((ROOM_BOSS as any)[room]);
}
for (const t of Object.keys(ENEMIES)) spawn.add(t);
const miss = [...spawn].filter((t) => !by[t]);
ok(!miss.length, "в реестре нет: " + miss.join(", "));
ok(reg.every((e) => (ZONE_MOBS as any)[e.id] || ARENA_ONLY[e.id]), "в реестре только известные виды");
ok(reg.every((e) => spawn.has(e.id)), "в реестре только то, что появляется");
ok(reg.every((e) => BGROUPS.includes(e.g) && e.where.length > 0), "у каждой записи группа и место");
const noMI = Object.keys(MOB_INFO).filter((k) => !by[k]);
console.log("справочник вне реестра (не появляется):", noMI.join(", ") || "—");

// 2) группы
ok(Object.values(BOSS_TIMERS).every((t) => by[t.type]?.g === "world"), "мировые боссы (таймеры) — «Мировые боссы»");
ok(Object.keys(VARIANT_BY_ID).filter((v) => VARIANT_BY_ID[v].boss).every((v) => by[v]?.g === "world"), "варианты-боссы краёв — «Мировые боссы»");
ok(["dew_king", "white_stag", "rust_baron", "cooler_maw", "fallen_star"].every((t) => by[t]?.g === "elite"), "редкие Отголоски — «Элита»");
ok(by.warden?.g === "boss" && by.kyut_mirror?.g === "boss" && by.kyut_mirror.name === "Отражение Кьют", "боссы забегов/испытаний: Страж Проклятия, Отражение Кьют");
ok(Object.keys(VARIANT_BY_ID).filter((v) => !VARIANT_BY_ID[v].boss).every((v) => by[v]?.g === "mob"), "варианты краёв — «Мобы», своими карточками");
ok(["dew_king", "white_stag", "rust_baron", "cooler_maw", "fallen_star"].every((t) => by[t].where.some((w) => w.startsWith("Аринар · ") && !/пятно/.test(w))), "у редких — место (пятна биома по kind)");
ok(!reg.some((e) => /альказ|alkaz/i.test(e.where.join(" ") + (e.name || ""))), "публичный текст без названия города");
ok(!reg.some((e) => e.where.some((w) => /·\s*\(|·\s*$/.test(w))), "без безымянных регионов");

// 3) ключи убийств
ok(bestiaryKey("stone_golem") === "stone_golem" && bestiaryKey("air_moon_sentinel") === "air_moon_sentinel" && bestiaryKey("golem") === "golem", "вариант и вариант-босс — свои карточки");
ok(arenaKey("imp") === "imp" && arenaKey("kyut_mirror") === "kyut_mirror" && arenaKey("hack") === null, "ключ арены");
ok(TRIAL_BOSS_WAVE === 8, "босс испытания — с 8-й волны");
const P: any = (MetaService as any).prototype;
{ const a: any = newAccount(); P.noteArenaKills.call({}, a, { imp: 5, ghoul: 2, warden: 1, hack: 9 }, { skip: "warden" });
  ok(a.bestiary.imp?.kills === 5 && a.bestiary.ghoul?.kills === 2 && !a.bestiary.warden && !a.bestiary.hack && !a.bestiary.run_imp, "забег: виды мира, без run_*, босс — отдельно"); }
{ const a: any = newAccount(); P.noteArenaKills.call({}, a, { imp: 50, warden: 3 }, { cap: 20, bossOk: true });
  ok(a.bestiary.imp?.kills === 20 && !a.bestiary.warden, "испытание: потолок убийств"); }
{ const a: any = newAccount(); P.noteArenaKills.call({}, a, { warden: 3, imp: 4 }, { cap: 99, bossOk: true });
  ok(a.bestiary.warden?.kills === 1 && a.bestiary.imp?.kills === 4, "испытание: босс не больше одного"); }
{ const a: any = newAccount(); P.noteArenaKills.call({}, a, { warden: 1 }, { cap: 99, bossOk: false }); ok(!a.bestiary.warden, "испытание: босс до своей волны не пишется"); }
{ const a: any = newAccount(); P.noteArenaKills.call({}, a, { kyut_mirror: 4, imp: 3 }, { cap: 1, onlyBoss: true });
  ok(a.bestiary.kyut_mirror?.kills === 1 && !a.bestiary.imp, "дуэль: только «Отражение Кьют», одно"); }
{ const a: any = newAccount(); P.noteArenaKills.call({}, a, null, {}); P.noteArenaKills.call({}, a, "x", {}); ok(!Object.keys(a.bestiary).length, "мусор в kills — без записей"); }
console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
