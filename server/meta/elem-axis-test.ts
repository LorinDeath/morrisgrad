// Ось стихий (данные), дефолты ICE: pureClassMul = classMul, ледяные мобы — только ледяные кусочки, проверка в «💰 Дроп», цветные цифры (pe).
import { ELEMENTS, ALL_ELEMS, BP_ELEMS, PURE_KEYS, ELEM_COLOR, BP_ELEM_ICONS, BMA_CFG, bmPure, pureSum, pureVsDef, pureEvFields, pureList, pieceId } from "./blackArt";
import { BM_MOBS, mobErr, mobElem, registerBlackMobs, BMM_CFG } from "./blackMobs";
import { validatePatch, lootElemErr } from "./overrides";
import { ITEM_BY_ID } from "./defs";
let P = 0, F = 0; const ok = (c: any, m: string) => { if (c) { P++; console.log("PASS " + m); } else { F++; console.log("FAIL " + m); } };
ok(["fire", "ice", "water", "stone", "nature", "lightning"].every((e) => ALL_ELEMS.includes(e)), "реестр: 6 стихий");
ok(ELEMENTS.every((e) => e.color && e.icon && e.name && e.pure === "p" + e.id && e.fx?.proj && e.fx?.skills), "у каждой: цвет, иконка, имя, чистый стат, набор fx");
ok(BP_ELEMS.join() === "fire,ice,water,stone,nature,lightning", "в игре (live) все 6 стихий (этап 2: вода, камень, природа, молния)");
ok(PURE_KEYS.lightning === "plightning" && ELEM_COLOR.nature && BP_ELEM_ICONS.lightning === "⚡", "производные таблицы из реестра");
ok(ALL_ELEMS.every((e) => BMA_CFG.pureMul[e] === 1 && BMA_CFG.caps[PURE_KEYS[e]] === 20), "pureMul/caps — для всей оси");
{ const p = bmPure(1000, { pfire: 1, pnature: 2 } as any, "mob"); ok(p.fire === 10 && p.nature === 20 && pureSum(p) === 30, "bmPure: заготовленная стихия считается по данным"); 
  const ev = pureEvFields(p); ok(ev.pf === 10 && ev.pe?.nature === 20 && !ev.pi, "событие: pf + pe{nature}");
  ok(JSON.stringify(pureList(ev)) === JSON.stringify([["fire", 10], ["nature", 20]]), "клиент: pureList");
  const sv = BMA_CFG.pureArmor; BMA_CFG.pureArmor = true; const q = pureVsDef(p, { barm: 15, bcap: 0 }, 1000); ok(q.fire === 5 && q.nature === 10, "pureVsDef: пропорционально по всем стихиям"); BMA_CFG.pureArmor = sv; }
ok(Object.entries(BMA_CFG.classMul).every(([k, v]) => BMA_CFG.pureClassMul[k] === v) && BMA_CFG.pureClassMul.player === 1, "pureClassMul по умолчанию = classMul чёрного урона");
ok(!BMA_CFG.pureCrit && !BMA_CFG.pureArmor, "чистый урон: без крита и мимо брони по умолчанию");
registerBlackMobs(ITEM_BY_ID as any);
const ice = Object.values(BM_MOBS).filter((m) => mobElem(m) === "ice");
ok(ice.length > 0 && ice.every((m) => (m.drops || []).every((d) => !/^bp_fire_|^bm_shard_fire$/.test(d.res))), "встроенные ледяные мобы — только ледяные кусочки");
ok(Object.values(BM_MOBS).every((m) => !mobErr(m)), "все встроенные мобы проходят проверку");
{ const m: any = { ...ice[0], drops: [{ res: pieceId("fire", "blade"), chance: 10, qty: [1, 1] }] }; ok(!!mobErr(m), "ледяному мобу огненный кусочек — нельзя");
  BMM_CFG.strictElemDrops = false; ok(!mobErr(m), "strictElemDrops выкл — огненные можно (настройка в админке)"); BMM_CFG.strictElemDrops = true; }
{ const iid = Object.keys(BM_MOBS).find((k) => mobElem(BM_MOBS[k]) === "ice")!, fid = Object.keys(BM_MOBS).find((k) => mobElem(BM_MOBS[k]) === "fire")!;
  ok(!!lootElemErr(iid, pieceId("fire", "blade")) && !lootElemErr(iid, pieceId("ice", "blade")), "💰 Дроп: ледяной моб — только ледяные кусочки");
  ok(!!lootElemErr(fid, pieceId("ice", "blade")), "💰 Дроп: огненному мобу ледяной кусочек — нельзя");
  ok(!!lootElemErr("wolf", pieceId("ice", "handle")) && !lootElemErr("wolf", "gold"), "💰 Дроп: обычному мобу ледяные кусочки нельзя, прочее — можно");
  ok(typeof validatePatch("loot" as any, iid, { materials: [{ res: pieceId("fire", "blade"), chance: 5, qty: [1, 1] }] }) === "string", "💰 Дроп: validatePatch отклоняет чужую стихию");
  ok(typeof validatePatch("loot" as any, iid, { materials: [{ res: pieceId("ice", "blade"), chance: 5, qty: [1, 1] }] }) === "object", "💰 Дроп: своя стихия проходит"); }
console.log(`\n${P} passed, ${F} failed`); if (F) process.exit(1);
