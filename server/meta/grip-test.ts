// t1062u: рукоять — бонус к ОЗ (+ОЗ / %) и к «предельной броне»: части, снимок крафта, ОЗ героя, мобы, админка.
// Запуск: cd server && bun meta/grip-test.ts
import { BMA_CFG, BM_PARTS, GRIP_DEF, bcapJoin, capBm, computeArtifact } from "./blackArt";
import { makeArtifact, artInfo } from "./blackArtReg";
import { newAccount, newHero, addItem, equip, heroEffective, newUid } from "./profile";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { validatePatch, applyOverride } from "./overrides";
import { registerBlackMobs, BM_MOBS, mobFinal } from "./blackMobs";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };

// 1) все рукояти получили бонус по редкости (если поле не задано явно)
const H = Object.values(BM_PARTS).filter((p) => p.type === "handle");
ok(H.length > 0 && H.every((p: any) => p.stats.hp > 0 && p.stats.bcap > 0), `рукояти (${H.length}): у всех есть +ОЗ и предельная броня`);
const h2: any = BM_PARTS.stone_handle2; ok(h2 && h2.stats.hp === GRIP_DEF[h2.rarity].hp && h2.stats.bcap === GRIP_DEF[h2.rarity].bcap, `stone_handle2 (${h2?.rarity}): ОЗ ${h2?.stats.hp}, предельная ${h2?.stats.bcap} %`);
ok(Object.values(BM_PARTS).filter((p) => p.type !== "handle" && p.type !== "blade2").every((p: any) => !(p.stats.hp > 0) && !(p.stats.hpp > 0)), "ОЗ — только у рукоятей (остальные части без изменений)");
// 2) сборка: ОЗ в снимке; предельная броня — сильнейшая (min), флажок bcapSum — старое сложение
ok(bcapJoin(40, 0) === 40 && bcapJoin(0, 30) === 30 && bcapJoin(40, 30) === 30 && bcapJoin(0, 0) === 0, "bcapJoin: min из ненулевых");
const P = { handle: "stone_handle2", blade: "stone_blade_2" };
const A = computeArtifact(P)!; ok(A.stats.hp === h2.stats.hp && A.stats.bcap === h2.stats.bcap, `снимок: +${A.stats.hp} ОЗ, предельная ${A.stats.bcap} %`);
const b2 = Object.values(BM_PARTS).find((p: any) => p.type === "blade2" && p.stats.bcap > 0 && p.elem === "stone") as any;
if (b2) { const A2 = computeArtifact({ ...P, blade2: b2.id })!; ok(A2.stats.bcap === Math.min(h2.stats.bcap, b2.stats.bcap), `рукоять ${h2.stats.bcap} + ${b2.id} ${b2.stats.bcap} → ${A2.stats.bcap} (сильнейшая)`);
  (BMA_CFG as any).bcapSum = true; const A3 = computeArtifact({ ...P, blade2: b2.id })!; (BMA_CFG as any).bcapSum = false;
  ok(Math.abs(A3.stats.bcap - (h2.stats.bcap + b2.stats.bcap)) < 1e-6, `bcapSum: сложение ${A3.stats.bcap}`); }
// 3) старый снимок без hp/hpp читается как 0
const old: any = { force: 1, bdmg: 0.1 }; const c = capBm(old); ok(c.hp === 0 && c.hpp === 0, "старый снимок без ОЗ → 0 (не NaN)");
// 4) крафт: правка части не меняет уже сделанный артефакт; ОЗ героя растёт
const def = makeArtifact(P)!; const hp0 = artInfo(def.id)!.stats.hp;
const saved = h2.stats.hp; h2.stats.hp = 999; ok(artInfo(def.id)!.stats.hp === hp0, `старый крафт не пересчитан (${hp0} ОЗ при части 999)`);
const def2 = makeArtifact(P)!; ok(artInfo(def2.id)!.stats.hp === 999, "новый крафт — с новым значением части"); h2.stats.hp = saved;
{ const a = newAccount(); const h = newHero(a as any, "warrior"); const base = { maxHp: 100, armor: 5, minAtk: 6, maxAtk: 9 };
  const ai: any = { uid: newUid(), id: def.id, at: 1, src: "grant:test", n: 1, hero: "warrior" }; a.inv.push(ai);
  const e0: any = heroEffective(a, h, "warrior", base); equip(a, h, "warrior", ai.uid); const e1: any = heroEffective(a, h, "warrior", base);
  ok(e1.maxHp === e0.maxHp + hp0, `ОЗ героя с артефактом: ${e0.maxHp} → ${e1.maxHp} (+${hp0})`);
  ok(e1.bm.bcap === A.stats.bcap, "предельная броня героя = снимок"); }
// 5) мобы: ОЗ рукояти добавляется; предельная — из рукояти; c30 «стеклянные» без предельной
const mb = Object.values(BM_MOBS).find((m: any) => m.weapon?.handle === "stone_handle2" || (m.weapon?.handle && BM_PARTS[m.weapon.handle]?.stats.hp > 0)) as any;
if (mb) { const hd: any = BM_PARTS[mb.weapon.handle]; const f1 = mobFinal(mb, ITEM_BY_ID as any).hp; const sv = hd.stats.hp; hd.stats.hp = sv + 100; const f2 = mobFinal(mb, ITEM_BY_ID as any).hp; hd.stats.hp = sv;
  ok(f2 > f1 && f2 - f1 <= 100 * 1.2 + 1, `моб ${mb.id}: +100 ОЗ рукояти → ${f1} → ${f2}`); }
// 6) админка: поля рукояти правятся, тот же id (без дублей)
const n0 = Object.keys(BM_PARTS).length; const pt = validatePatch("bpart", "stone_handle2", { "stats.hp": 33, "stats.hpp": 4, "stats.bcap": 37 });
ok(typeof pt !== "string", "админка: stats.hp / stats.hpp / bcap рукояти принимаются"); if (typeof pt !== "string") applyOverride("bpart", "stone_handle2", pt);
ok(BM_PARTS.stone_handle2.stats.hp === 33 && (BM_PARTS.stone_handle2.stats as any).hpp === 4 && Object.keys(BM_PARTS).length === n0, "админка: сохранение — та же часть, без дубля");
ok(typeof validatePatch("bpart", "stone_handle2", { "stats.hp": 1e7 }) === "string", "админка: ОЗ вне диапазона — отказ");
applyOverride("bpart", "stone_handle2", null);
console.log(`\n${pass} PASS, ${fail} FAIL`); if (fail) process.exit(1);
