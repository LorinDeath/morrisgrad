// Стадия ICE чёрной магии: стихии как ось, ледяные детали/тела/мобы, чистый урон стихий, bmMinDmg, ледяные навыки.
// Запуск: esbuild ice-test.ts --bundle --platform=node --format=esm --loader:.json=json → node
import { BMA_CFG, BM_PARTS, BP_ELEMS, BP_TYPES, BM_NAMES, BM_SKILLS, pieceId, shardId, partCost, computeArtifact, bmDefendEx, bmPure, pureVsDef, pureSum, skillElem, elemOf, isBmSkill } from "./blackArt";
import { forgeState, craftPart, checkBuild } from "./blackForge";
import { makeArtifact } from "./blackArtReg";
import { BM_MOBS, BM_BODY, registerBlackMobs, mobErr, mobElem, mobPure, resElem, bmmClient } from "./blackMobs";
import { validatePatch, SCHEMA } from "./overrides";
import { newAccount } from "./profile";
import { RESOURCES } from "./shared";
import { ITEM_BY_ID, ZONE_MOBS, ABILITY_BY_ID } from "./defs";
import { shapeOf } from "./abilityShapes";
import { Zone } from "./zone";
import FX from "../../public/bm-art/fx/index.json";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
registerBlackMobs(ITEM_BY_ID as any);

// --- 1. стихии — ось
ok(BP_ELEMS.includes("fire") && BP_ELEMS.includes("ice"), "стихии: огонь и лёд");
ok(Object.values(BM_PARTS).every((p) => BP_ELEMS.includes(elemOf(p.elem))), "у каждой детали оружия есть стихия");
ok(Object.values(BM_PARTS).filter((p) => !/^(ice|water|stone|nature|lightning)_/.test(p.id)).every((p) => elemOf(p.elem) === "fire"), "старые детали — огонь");
ok(Object.values(BM_PARTS).filter((p) => p.id.startsWith("ice_")).length >= 21 && Object.values(BM_PARTS).filter((p) => p.id.startsWith("ice_")).every((p) => p.elem === "ice"), "21 ледяная деталь (рукояти, лезвия, посохи, кристалл), все ice");
ok(Object.values(BM_BODY).filter((b) => b.id.startsWith("ib_")).length === 35 && Object.values(BM_BODY).filter((b) => b.id.startsWith("ib_")).every((b) => b.elem === "ice"), "35 ледяных частей тела");
ok(Object.values(BM_BODY).filter((b) => b.id.startsWith("fb_")).every((b) => elemOf(b.elem) === "fire"), "старые части тела — огонь");
for (const t of BP_TYPES) ok(!!RESOURCES[pieceId("ice", t)], `ресурс ${pieceId("ice", t)}`);
ok(!!RESOURCES[shardId("ice")], "ресурс «Осколок льда»");
ok(resElem(pieceId("ice", "blade")) === "ice" && resElem(shardId("fire")) === "fire" && resElem("gold") === null, "resElem");

// --- 2. ледяные мобы и кусочки
const iceMobs = Object.values(BM_MOBS).filter((m) => mobElem(m, ITEM_BY_ID as any) === "ice");
ok(iceMobs.length >= 4, "4 встроенных ледяных моба");
ok(iceMobs.every((m) => !mobErr(m)), "ледяные мобы собраны без ошибок");
const iceDropMobs = Object.values(BM_MOBS).filter((m) => (m.drops || []).some((d) => resElem(d.res) === "ice"));
ok(iceDropMobs.length > 0 && iceDropMobs.every((m) => mobElem(m, ITEM_BY_ID as any) === "ice"), "ледяные кусочки падают только с ледяных мобов");
{ const fm = { ...BM_MOBS.bmx_ash_warden, drops: [{ res: pieceId("ice", "blade"), chance: 10, qty: [1, 1] as [number, number] }] };
  ok(!!mobErr(fm as any), "огненному мобу нельзя дать ледяной кусочек: " + mobErr(fm as any));
  ok(!!mobErr({ ...BM_MOBS.bmx_ash_warden, elem: "lava" } as any), "неизвестная стихия моба — отказ");
  const mixed = { ...BM_MOBS.bmx_ash_warden, weapon: { handle: "fire_handle", blade: "ice_blade" }, drops: [] };
  ok(!mobErr(mixed as any) && mobElem(mixed as any) === "ice", "смешанный моб разрешён; стихия — по лезвию");
  ok(!!mobErr({ ...mixed, drops: BM_MOBS.bmx_ash_warden.drops } as any), "смешанный (лёд по лезвию) с огненными кусочками — отказ: ледяные мобы — только ледяные");
  const mixedB = { ...BM_MOBS.bmx_frost_warden, body: { ...BM_MOBS.bmx_frost_warden.body, head: "fb_head_1" } };
  ok(!mobErr(mixedB as any), "смешанное тело (огонь + лёд) разрешено");
  const v = validatePatch("bmmob" as any, "bmx_frost_warden", { drops: [{ res: pieceId("fire", "blade"), chance: 5, qty: [1, 1] }] });
  ok(typeof v === "string", "огненный кусочек на ледяном — нельзя (ледяные мобы — только ледяные кусочки)"); }
ok((ZONE_MOBS as any).bmx_frost_warden?.elem === "ice" && (ZONE_MOBS as any).bmx_ash_warden?.elem !== "ice", "ZONE_MOBS: elem");
ok((bmmClient(ITEM_BY_ID as any) as any).mobs.bmx_glacier_seer?.elem === "ice", "клиент: моб несёт elem");

// --- ковка: лёд только из ледяных кусочков
const a: any = newAccount("ice"); a.inv = []; a.res = {};
a.res[pieceId("fire", "handle")] = 999; a.res[pieceId("fire", "blade")] = 999;
let r = craftPart(a, "ice_handle", 30); ok(!r.ok, "ледяная рукоять из огненных кусочков — отказ");
a.res[pieceId("ice", "handle")] = partCost(BM_PARTS.ice_handle);
r = craftPart(a, "ice_handle", 30); ok(r.ok && a.bmParts.ice_handle === 1 && !a.res[pieceId("ice", "handle")] && a.res[pieceId("fire", "handle")] === 999, "ледяная рукоять — только из ледяных кусочков");
ok(craftPart(a, "fire_blade", 30).ok, "огненное лезвие — как прежде");
{ const fs: any = forgeState(a, 30); ok(fs.pieces[pieceId("ice", "blade")] === 0 && fs.pieces[pieceId("fire", "blade")] > 0 && fs.shardsBy && fs.elems?.includes("ice"), "forgeState: кусочки по стихиям");
  ok(fs.parts.find((p: any) => p.id === "ice_blade")?.piece === pieceId("ice", "blade"), "forgeState: деталь льда требует bp_ice_blade"); }
const mix = checkBuild(a, { handle: "ice_handle", blade: "fire_blade" });
ok(mix.ok, "кузня: смешанное оружие из своих деталей обеих стихий " + (mix.err || ""));

// --- 3. чистый урон
ok(BM_NAMES.pfire?.name === "Чистый огненный урон" && BM_NAMES.pice?.name === "Чистый ледяной урон", "статы: имена");
{ const art = computeArtifact({ handle: "ice_handle", blade: "ice_blade", crystal: "ice_crystal" })!;
  ok(art.elem === "ice" && art.stats.pice > 0 && !art.stats.pfire, "ледяной артефакт: elem ice, pice от кристалла");
  const mx = computeArtifact({ handle: "fire_handle", blade: "ice_blade", crystal: "fire_crystal" })!;
  ok(mx.elem === "ice" && mx.elems?.length === 2 && mx.stats.pfire > 0, "смешанный артефакт: elems [fire, ice]");
  const d = makeArtifact({ handle: "ice_handle", blade: "ice_blade" })!; ok(/Лед/.test(d.name), "имя ледяного артефакта: " + d.name); }
const save = JSON.parse(JSON.stringify(BMA_CFG));
{ const p = bmPure(1000, { pfire: 2, pice: 1 }, "mob"); ok(p.fire === 20 && p.ice === 10, "bmPure: % макс. ОЗ атакующего (1000 ОЗ, 2% / 1% → 20 / 10)");
  BMA_CFG.pureMul.ice = 3; ok(bmPure(1000, { pice: 1 }, "mob").ice === 30, "pureMul.ice ×3");
  BMA_CFG.pureClassMul.boss = 0.5; ok(bmPure(1000, { pice: 1 }, "boss").ice === 15, "pureClassMul.boss ×0.5");
  ok(bmPure(1000, { pfire: 999 }, "mob").fire === 1000 * BMA_CFG.caps.pfire / 100, "кап pfire");
  ok(bmPure(1000, { pfire: 1 }, "mob", 1, true).fire === 10, "крит не действует (pureCrit выкл)");
  BMA_CFG.pureCrit = true; ok(bmPure(1000, { pfire: 1 }, "mob", 1, true).fire === Math.round(10 * BMA_CFG.critMul), "pureCrit вкл — ×critMul");
  ok(bmPure(0, { pfire: 1 }, "mob").fire === 0 && pureSum(bmPure(1000, null, "mob")) === 0, "без ОЗ/статов — 0");
  const pp = { fire: 30, ice: 10 };
  ok(pureVsDef(pp, { barm: 100, bcap: 0 }, 1000) === pp, "pureArmor выкл — мимо чёрной брони");
  BMA_CFG.pureArmor = true; const q = pureVsDef(pp, { barm: 20, bcap: 0 }, 1000); ok(pureSum(q) === 20, "pureArmor вкл — режется бронёй");
  Object.assign(BMA_CFG, JSON.parse(JSON.stringify(save))); }
// bmMinDmg
{ ok(bmDefendEx(10, { barm: 30, bcap: 0 }, 100).d === 1 && bmDefendEx(10, { barm: 30, bcap: 0 }, 100).zero, "bmMinDmg=1: броня поглотила — 1 урона и флаг «0 урона»");
  ok(bmDefendEx(0, { barm: 30, bcap: 0 }, 100).d === 0, "bmMinDmg: удар 0 остаётся 0");
  BMA_CFG.bmMinDmg = 5; ok(bmDefendEx(10, { barm: 30, bcap: 0 }, 100).d === 5, "bmMinDmg настраивается");
  ok(bmDefendEx(50, { barm: 10, bcap: 0 }, 100).d === 40 && !bmDefendEx(50, { barm: 10, bcap: 0 }, 100).zero, "без обнуления — обычная броня");
  BMA_CFG.bmMinDmg = save.bmMinDmg; }
// мобы: чистый урон
ok(mobPure(BM_MOBS.bmx_glacier_seer, ITEM_BY_ID as any)?.pice! > 0 && !mobPure(BM_MOBS.bmx_frost_warden, ITEM_BY_ID as any), "чистый урон моба — от кристалла льда");
ok((ZONE_MOBS as any).bmx_glacier_seer?.bmPure?.pice > 0, "ZONE_MOBS: bmPure");
// зона: чистый урон сверху, мимо брони, в событии pf/pi/el
{ const z = new Zone("arinar", [], [], { proc: true, seed: 12 } as any);
  const m: any = z.mobs.find((x: any) => !x.dead && !x.special); m.hp = m.maxHp = 10000;
  const r1 = z.damage(m, "p1", 5, () => {}, { black: true, pure: { fire: 7, ice: 11 }, el: "ice" } as any, "ba");
  const ev: any = (z as any).events.filter((e: any) => e.k === "hit" && e.id === m.id).pop();
  ok(r1 === 23 && ev?.pf === 7 && ev?.pi === 11 && ev?.el === "ice", "zone.damage: чистый урон сверху (5 + 7 + 11), событие pf/pi/el"); }

// --- 4. ледяные навыки
const ICE_SK = ["bmi_frost_whip", "bmi_rime_ring", "bmi_shard_bolt", "bmi_icicle_hail", "bmi_blizzard_dash"];
ok(ICE_SK.every((id) => BM_SKILLS.some((s: any) => s.id === id) && (ABILITY_BY_ID as any)[id]?.cls === "artifact" && shapeOf(id) && skillElem(id) === "ice" && isBmSkill(id)), "5 ледяных навыков: реестр, форма, стихия");
ok(["Ледяной хлыст", "Кольцо инея", "Осколочный снаряд", "Град сосулек", "Рывок метели"].every((n) => BM_SKILLS.some((s: any) => s.name === n)), "имена ледяных навыков");
ok(!!(shapeOf("bmi_frost_whip") as any).slow, "Ледяной хлыст замедляет (iceSlow)");
BMA_CFG.iceSlow = false; ok(!(shapeOf("bmi_frost_whip") as any).slow, "iceSlow выкл — без замедления"); BMA_CFG.iceSlow = save.iceSlow;
ok(Object.values(BM_PARTS).filter((p) => p.elem === "ice" && p.skill).every((p) => p.skill!.startsWith("bmi_")), "ледяные детали дают ледяные навыки");

// --- админка: поля
const F = (k: string) => (SCHEMA as any)[k].fields.map((f: any) => f.path);
ok(F("bpart").includes("stats.pfire") && F("bpart").includes("stats.pice"), "админка: чистый урон детали");
ok(F("bmbody").includes("elem") && F("bmbody").includes("pice") && F("bmmob").includes("elem"), "админка: стихия тела/моба");
ok(["pureMul.fire", "pureMul.ice", "pureClassMul.player", "pureSkill", "pureVsPlayer", "pureMob", "pureCrit", "pureArmor", "bmMinDmg", "iceSlow", "caps.pice"].every((p) => F("bmagic").includes(p)), "админка: множители чистого урона, bmMinDmg, iceSlow");
ok(typeof validatePatch("bmagic" as any, "main", { bmMinDmg: 3, "pureMul.ice": 2 }) === "object", "админка: правка bmMinDmg/pureMul проходит");

// --- fx-атлас льда
ok(["ice_bolt", "ice_hit", "ice_arc", "ice_release", "ice_crit", "ice_zero"].every((k) => (FX as any)[k]), "fx льда в индексе");
ok(!Object.keys(FX as any).some((k) => k.startsWith("bm_")), "ключи fx без префикса bm_ (иначе zoneView примет за Чёрного мага)");

console.log(`\n${pass} PASS / ${fail} FAIL`); if (fail) process.exitCode = 1;
