// Стадия Б чёрной магии: свои детали (bpx_), кузня Знахаря (детали из кусочков, сборка, имя, лимит, разбор), черновики.
// Запуск: cd server && bun meta/black-forge-test.ts
import { BM_PARTS, BMA_CFG, pieceId, shardId, partCost, CUSTOM_BP, BP_TYPES } from "./blackArt";
import { forgeState, craftPart, checkBuild, spendParts, cleanArtName, rateOk, artSalvage } from "./blackForge";
import { makeArtifact, artifactRow, registerArtifactRow } from "./blackArtReg";
import { newAccount, newHero, salvage } from "./profile";
import { RESOURCES } from "./shared";
import { ITEM_BY_ID, salvageYield } from "./defs";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { mergeRows } from "./admin";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };

// --- ресурсы: кусочки и осколки
for (const t of BP_TYPES) ok(!!RESOURCES[pieceId("fire", t)], `ресурс кусочка ${pieceId("fire", t)}`);
ok(!!RESOURCES[shardId("fire")], "ресурс «Осколок огня»");

// --- имя: очистка и мат-фильтр
ok(cleanArtName("  Пепельный  клык ").ok && (cleanArtName("  Пепельный  клык ") as any).name === "Пепельный клык", "имя: пробелы схлопнуты");
ok(!cleanArtName("a").ok, "имя: слишком короткое");
ok(!cleanArtName("x".repeat(25)).ok, "имя: слишком длинное");
ok(!cleanArtName("<script>").ok, "имя: теги запрещены");
ok(!cleanArtName("Клык\u202Eтест").ok === false && (cleanArtName("Клык\u202Eтест") as any).name === "Клыктест", "имя: RTL-метка вырезана");
ok(!cleanArtName("Клык\u200bх").ok === false && !(cleanArtName("Клык\u200bх") as any).name.includes("\u200b"), "имя: нулевая ширина вырезана");
ok(!cleanArtName("12345").ok, "имя: нужна буква");
ok(!cleanArtName("хуй меча").ok, "имя: мат отклонён");
ok(!cleanArtName("Ｂｌａｄｅ💀").ok, "имя: эмодзи нельзя (после NFKC)");
ok(cleanArtName("Ｂｌａｄｅ").ok && (cleanArtName("Ｂｌａｄｅ") as any).name === "Blade", "имя: NFKC полуширинные → обычные");
ok(cleanArtName("Клинок д'Арка-2").ok, "имя: дефис, апостроф, цифры можно");

// --- детали из кусочков
const a: any = newAccount("t"); a.inv = []; a.res = {};
let r = craftPart(a, "fire_handle", 10); ok(!r.ok && /Не хватает/.test(r.err!), "деталь: без кусочков — отказ");
a.res[pieceId("fire", "handle")] = partCost(BM_PARTS.fire_handle) * 2 + 3;
r = craftPart(a, "fire_handle", 10); ok(r.ok && a.bmParts.fire_handle === 1 && a.res[pieceId("fire", "handle")] === partCost(BM_PARTS.fire_handle) + 3, "деталь создана, кусочки списаны");
r = craftPart(a, "fire_blade", 10); ok(!r.ok, "лезвие без кусочков лезвия — отказ");
a.res[pieceId("fire", "blade")] = 999; a.res[pieceId("fire", "crystal")] = 999; a.res[pieceId("fire", "blade2")] = 999;
ok(craftPart(a, "fire_blade", 10, 3).ok && a.bmParts.fire_blade === 3, "лезвие ×3");
ok(!craftPart(a, "nope", 10).ok, "неизвестная деталь — отказ");
BM_PARTS.fire_crystal.reqLvl = 20; ok(!craftPart(a, "fire_crystal", 5).ok, "уровень детали проверяется"); BM_PARTS.fire_crystal.reqLvl = 0;
ok(craftPart(a, "fire_crystal", 5).ok, "кристалл");
const st = forgeState(a, 10); ok(st.parts.length >= 5 && st.parts.find((p: any) => p.id === "fire_blade")?.have === 3 && st.max === BMA_CFG.maxArtifacts, "витрина кузни");

// --- сборка
ok(!checkBuild(a, { handle: "fire_handle" }).ok, "сборка: без лезвия — отказ");
ok(!checkBuild(a, { handle: "fire_blade", blade: "fire_blade" }).ok, "сборка: тип не на своём месте — отказ");
ok(!checkBuild(a, { handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2" }).ok, "сборка: детали нет у игрока — отказ");
let c = checkBuild(a, { handle: "fire_handle", blade: "fire_blade", crystal: "fire_crystal", blade3: "" });
ok(c.ok && Object.keys(c.parts!).length === 3, "сборка: рукоять+лезвие+кристалл");
const def = makeArtifact(c.parts!, "Пепельный клык", { author: "Тест", src: "forge" });
ok(def && def.name === "Пепельный клык" && def.author === "Тест" && def.bm.parts.crystal === "fire_crystal", "артефакт с именем и автором");
spendParts(a, c.parts!); ok(!a.bmParts.fire_handle && a.bmParts.fire_blade === 2 && !a.bmParts.fire_crystal, "детали списаны");
const row = artifactRow(def); const back = registerArtifactRow({ id: row[0], name: row[1], rarity: row[3], item_level: row[4], icon: row[9], description: row[10], props: row[8] });
ok(back && back.author === "Тест" && back.src === "forge", "строка items: автор/источник сохраняются");

// --- лимит 30
a.inv = Array.from({ length: BMA_CFG.maxArtifacts }, (_, i) => ({ uid: "u" + i, id: def.id, n: 1 }));
a.bmParts.fire_handle = 1;
ok(!checkBuild(a, { handle: "fire_handle", blade: "fire_blade" }).ok, `лимит ${BMA_CFG.maxArtifacts} артефактов`);
a.inv = [];

// --- разбор → осколки
const y = salvageYield(def.id); ok(y[shardId("fire")] === BMA_CFG.salvageBase + BMA_CFG.salvagePerPart, `разбор: ${JSON.stringify(y)}`);
ok(artSalvage({ parts: { handle: 1, blade: 1 }, elem: "fire" })[shardId("fire")] === BMA_CFG.salvageBase, "разбор 2 деталей = база");
const h: any = newHero("warrior"); a.inv = [{ uid: "s1", id: def.id, n: 1 }];
const sr: any = salvage(a, [h], "s1"); ok(sr.ok && (a.res[shardId("fire")] || 0) >= BMA_CFG.salvageBase && a.inv.length === 0, "разбор артефакта — осколки в ресурсах");
a.inv = [{ uid: "s2", id: def.id, n: 1 }]; h.equip = { weapon: "s2" }; ok(!(salvage(a, [h], "s2") as any).ok, "надетый — не разбирается");

// --- темп
const log: number[] = []; let n = 0; for (let i = 0; i < 10; i++) if (rateOk(log, 6, 1000 + i)) n++; ok(n === 6, "не чаще 6 сборок в минуту"); ok(rateOk(log, 6, 70000), "через минуту — снова можно");

// --- своя деталь (bpx_) в админке
const cid = "bpx_blade_test1"; ok(CUSTOM_BP.test(cid), "id своей детали");
const p0 = validatePatch("bpart" as any, cid, { type: "blade", elem: "fire", name: "Лезвие искры", "stats.bdmg": 0.3, cost: 40, ranged: true, rangeTiles: 6 });
ok(typeof p0 !== "string", "своя деталь проходит проверку " + (typeof p0 === "string" ? p0 : ""));
ok(!BM_PARTS[cid], "проверка не оставляет временную деталь");
applyOverride("bpart" as any, cid, p0); ok(BM_PARTS[cid]?.name === "Лезвие искры" && BM_PARTS[cid].ranged === true && partCost(BM_PARTS[cid]) === 40, "своя деталь создана публикацией");
ok(typeof validatePatch("bpart" as any, "fire_handle", { type: "blade" }) === "string", "тип встроенной детали не меняется");
ok(typeof validatePatch("bpart" as any, "bpx_handle_x1", { type: "handle", ranged: true }) === "string", "дальность — только у лезвия");
ok(typeof validatePatch("bpart" as any, "bpx_blade_x2", { type: "blade", img: "../../etc" }) === "string", "лист Художника: путь запрещён");
ok(typeof validatePatch("bpart" as any, "BAD id", { type: "blade" }) === "string", "кривой id — отказ");
const a2: any = newAccount("t2"); a2.inv = []; a2.res = { [pieceId("fire", "blade")]: 40 };
ok(craftPart(a2, cid, 1).ok && a2.bmParts[cid] === 1, "своя деталь создаётся в кузне");
const cv: any = currentValues("bpart" as any, cid); ok(cv && cv.type === "blade" && cv.cost === 40, "значения своей детали в админке");
applyOverride("bpart" as any, cid, null); ok(!BM_PARTS[cid], "сброс своей детали — удаление");

// --- черновики не попадают в игру (sync: kind bmc_* пропускается в SQL; mergeRows их бы не отличил)
ok(mergeRows([{ kind: "bpart", id: "fire_blade", data: "{\"cost\":5}" }]).get("bpart:fire_blade")?.cost === 5, "mergeRows: правка детали");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
