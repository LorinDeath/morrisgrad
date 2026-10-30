// Стадия A чёрной магии: формулы артефакта, мешок крита, заряд, глушение снаряжения, замок слотов, навыки артефакта.
// Запуск: cd server && bun meta/black-art-test.ts
import { BMA_CFG, bagDraw, bmHit, bmDefend, bmSkillPct, chargeFrac, chargedAtk, computeArtifact, BM_SKILLS, BM_SKILL_IDS, type Bag } from "./blackArt";
import { makeArtifact, artInfo, recalcAllArtifacts } from "./blackArtReg";
import { BM_PARTS } from "./blackArt";
import { newAccount, newHero, addItem, equip, unequip, heroEffective, usableAbility, setLoadout, artifactAbilities, monsterAbilities, artInHand, newUid } from "./profile";
import { ITEMS, ITEM_BY_ID, ABILITY_BY_ID } from "./defs";
import { itemCard } from "./library";
import { validatePatch } from "./overrides";
import { shapeOf } from "./abilityShapes";
import { Zone } from "./zone";
import { SK_DEFS } from "./skillCraft";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

// --- мешок крита: ровно bcrit на мешочек; выпали все криты — сразу новый мешочек (ответ Алекса 28.10)
{ let bag: Bag | null = null, crits = 0; let r = 0.37; const rnd = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  let draws = 0; while (crits < 7 && draws < 200) { const d = bagDraw(bag, 7, rnd, 100); bag = d.bag; draws++; if (d.crit) crits++; }
  ok(crits === 7 && draws <= 100, `мешок: 7 критов не позже 100-го удара (вышло ${crits} за ${draws})`);
  ok(bag![0] === 0 && bag![1] === 0 && bag![3] === 7, `мешок: после 7-го крита — сразу новый мешочек ${JSON.stringify(bag)}`);
  // много мешочков: каждый кончается ровно на 7-м крите, в мешочке ≤ 100 ударов
  let bagsOk = true, nBags = 0, inBag = 0, cIn = 0; bag = null;
  for (let i = 0; i < 20000; i++) { const d = bagDraw(bag, 7, Math.random, 100); bag = d.bag; inBag++; if (d.crit) cIn++; if (bag[0] === 0) { if (cIn !== 7 || inBag > 100) bagsOk = false; nBags++; inBag = 0; cIn = 0; } }
  ok(bagsOk && nBags > 150, `мешок: ${nBags} мешочков подряд — в каждом ровно 7 критов и ≤ 100 ударов`);
  // старое сохранение мешка ([вытянуто, выпало, размер, в мешке]) читается как есть
  { const d = bagDraw([50, 3, 100, 7], 7, () => 0, 100); ok(d.crit && d.bag[0] === 51 && d.bag[1] === 4, "мешок: старое состояние продолжается"); }
  let b0: Bag | null = null, c0 = 0; for (let i = 0; i < 250; i++) { const d = bagDraw(b0, 0, Math.random, 100); b0 = d.bag; if (d.crit) c0++; }
  ok(c0 === 0, "мешок: bcrit 0 — критов нет");
  let b1: Bag | null = null, c1 = 0; for (let i = 0; i < 100; i++) { const d = bagDraw(b1, 100, Math.random, 100); b1 = d.bag; if (d.crit) c1++; }
  ok(c1 === 100, "мешок: bcrit 100 — все удары криты");
}
// --- урон
{ const bm: any = { force: 40, power: 0, charge: 1, bdmg: 0.1, barm: 0, bcap: 0, bcrit: 0 };
  ok(near(bmHit(10000, "mob", bm, 0, false), 10), "bmHit: 0.1% от 10000 = 10");
  ok(near(bmHit(10000, "boss", bm, 0, false), 10 * BMA_CFG.classMul.boss), "bmHit: босс × classMul");
  ok(near(bmHit(10000, "mob", bm, 1, false), 14), "bmHit: полный заряд — удар × (1 + 40%)");
  ok(near(bmHit(10000, "mob", bm, 0.99, false), 10), "bmHit: неполный заряд — обычный удар");
  ok(near(bmHit(300, "mob", { ...bm, bdmg: 10, force: 20 }, 1, false), 36), "bmHit: пример Алекса 10% от 300 = 30, сила +20% → 36");
  ok(near(bmHit(10000, "mob", bm, 1, true), 14 * BMA_CFG.critMul), "bmHit: крит × critMul");
  ok(bmDefend(100, { barm: 30, bcap: 0 }, 1000) === 70, "bmDefend: −чёрная броня");
  ok(bmDefend(100, { barm: 0, bcap: 5 }, 1000) === 50, "bmDefend: потолок 5% ОЗ");
  { const mn = BMA_CFG.bmMinDmg; BMA_CFG.bmMinDmg = 0; ok(bmDefend(10, { barm: 30, bcap: 5 }, 1000) === 0, "bmDefend: 0 разрешён (bmMinDmg = 0)");
    BMA_CFG.bmMinDmg = 1; ok(bmDefend(10, { barm: 30, bcap: 5 }, 1000) === 1, "bmDefend: bmMinDmg = 1 — броня не обнуляет удар"); BMA_CFG.bmMinDmg = mn; }
  ok(near(bmSkillPct({ pct: 0.6, k: 2 }, 0.12), 0.84), "навык: pct + k × bdmg");
  ok(chargeFrac(0, 5000, 1) === 0 && chargeFrac(1000, 1500, 1) === 0 && chargeFrac(1000, 2000, 1) === 1 && chargeFrac(1000, 4000, 1) === 1, "заряд: только полный (≥ «Скорость заряда») — 1, раньше — 0");
  ok(chargeFrac(1000, 1000 + (BMA_CFG.holdMaxSec + 1) * 1000, 1) === 0, "заряд: передержал дольше holdMaxSec — сгорел");
  { const hm = BMA_CFG.holdMaxSec; BMA_CFG.holdMaxSec = 0; ok(chargeFrac(1000, 60000, 1) === 1, "заряд: holdMaxSec 0 — не сгорает"); BMA_CFG.holdMaxSec = hm; }
  const A = chargedAtk({ kind: "arc", range: 100, arc: 1 }, 400, 1); ok(A.range === 100 * BMA_CFG.powerMaxMul, "заряд: размер не больше powerMaxMul");
  ok(chargedAtk({ kind: "arc", range: 100, arc: 1 }, 50, 0.9).range === 100 && chargedAtk({ kind: "arc", range: 100, arc: 1 }, 50, 1).range === 150, "Мощность: только на полном заряде");
}
// --- артефакт
const parts = { handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2", blade3: "fire_blade3", crystal: "fire_crystal" };
{ const i = computeArtifact(parts)!;
  ok(i && i.atk.kind === "arc" && i.cd === BM_PARTS.fire_handle.cd, "computeArtifact: ближний, кд рукояти");
  ok(near(i.stats.bdmg, 0.12) && i.stats.barm === 5 && i.stats.bcrit === 8, "computeArtifact: статы частей складываются");
  ok(new Set(i.skills).size === 5, "computeArtifact: 5 разных огненных навыков");
  const r = computeArtifact({ ...parts, blade: "fire_blade_r" })!; ok(r.ranged && r.atk.kind === "proj" && r.atk.range <= BMA_CFG.maxRangeTiles * BMA_CFG.tile, "дальний: снаряд, не дальше maxRangeTiles");
  ok(computeArtifact({ blade: "fire_blade" }) === null, "без рукояти артефакта нет");
}
ok(BM_SKILLS.length === 30 && BM_SKILL_IDS.every((id) => (ABILITY_BY_ID as any)[id]?.cls === "artifact" && shapeOf(id)), "30 навыков (по 5 на 6 стихий) в общем реестре, у каждого форма");
ok(typeof validatePatch("skill", "bmf_ember_lash", { "bm.pct": 1.2, "bm.k": 3 }) !== "string", "админка: pct/k навыка артефакта правятся");
ok(typeof validatePatch("bmagic", "main", { critMul: 2, vsPlayer: 0.5 }) !== "string", "админка: настройки чёрной магии");
ok(typeof validatePatch("bpart", "fire_blade", { "stats.bdmg": 0.2 }) !== "string", "админка: части оружия");

// --- глушение снаряжения и замок слотов
{ const a = newAccount(), h = newHero("warrior"); h.lvl = 20; a.hero = "warrior";
  const base = { maxHp: 100, armor: 5, minAtk: 6, maxAtk: 9 };
  const wpn = ITEMS.find((x) => x.slot === "weapon" && (x.req || 1) <= 5 && (!x.classes || x.classes.includes("warrior")))!;
  const arm = ITEMS.find((x) => x.slot !== "weapon" && (x.stats as any)?.hp > 0 && (x.req || 1) <= 5 && (!x.classes || x.classes.includes("warrior")))!;
  const iw = addItem(a, wpn.id, "t", "warrior")!, ia = addItem(a, arm.id, "t", "warrior")!;
  ok(equip(a, h, "warrior", iw.uid).ok && equip(a, h, "warrior", ia.uid).ok, "обычные вещи надеваются");
  const e0: any = heroEffective(a, h, "warrior", base);
  const def = makeArtifact(parts)!; const ai: any = { uid: newUid(), id: def.id, at: 1, src: "grant:test", n: 1, hero: "warrior" }; a.inv.push(ai);
  ok(itemCard(def.id)?.art?.skills?.length === 5, "карточка артефакта: статы, навыки");
  ok(equip(a, h, "warrior", ai.uid).ok, "артефакт надевается в оружие");
  ok(artInHand(a, h), "артефакт в руке");
  const e1: any = heroEffective(a, h, "warrior", base);
  ok(e1.wtype === "artifact" && e1.bm && e1.art?.skills?.length === 5, "effective: чёрные статы и навыки");
  ok(e1.maxHp < e0.maxHp && e1.itemDmgMin === 0 && e1.look === null, "снаряжение заглушено (ОЗ вещи не действуют, урон вещей 0)");
  ok(!unequip(h, arm.slot, a).ok, "замок: остальные слоты не снимаются");
  const arm2 = addItem(a, arm.id, "t", "warrior")!; ok(!equip(a, h, "warrior", arm2.uid).ok, "замок: остальные слоты не надеваются");
  ok(monsterAbilities(a, h).length === 0, "трофейные навыки заглушены");
  ok(artifactAbilities(a, h).length === 5 && usableAbility(a, h, "warrior", "bmf_magma_ring"), "навыки артефакта доступны");
  ok(setLoadout(a, h, "warrior", ["bmf_magma_ring", "bmf_ember_lash", ""]).ok, "раскладка: навыки артефакта в слоты");
  const e2: any = heroEffective(a, h, "warrior", base); ok(e2.abilities.some((x: any) => x.id === "bmf_magma_ring"), "навык артефакта — в effective.abilities");
  ok(unequip(h, "weapon", a).ok, "артефакт снимается");
  ok(!usableAbility(a, h, "warrior", "bmf_magma_ring"), "без артефакта навык недоступен");
  const e3: any = heroEffective(a, h, "warrior", base); ok(!e3.abilities.some((x: any) => x.id === "bmf_magma_ring") && !e3.bm, "без артефакта — обычный герой");
  ok(equip(a, h, "warrior", arm2.uid).ok, "без артефакта слоты снова свободны");
}
// --- снимок и «Пересчитать все»
{ const d = makeArtifact(parts)!; const before = artInfo(d.id)!.stats.bdmg;
  const old = BM_PARTS.fire_blade.stats!.bdmg; (BM_PARTS.fire_blade.stats as any).bdmg = 0.5;
  ok(artInfo(d.id)!.stats.bdmg === before, "снимок: правка части не меняет созданный артефакт");
  ok(artInfo(d.id)!.stats.bdmg === before, "слепок: и после правки детали артефакт прежний (t996u)");
  (BM_PARTS.fire_blade.stats as any).bdmg = old;
  const lp = BMA_CFG.liveParts; (BMA_CFG as any).liveParts = true; (BM_PARTS.fire_blade.stats as any).bdmg = 0.5;
  ok(artInfo(d.id)!.stats.bdmg === before, "слепок: liveParts больше не действует (t994u)"); (BMA_CFG as any).liveParts = lp; (BM_PARTS.fire_blade.stats as any).bdmg = old;
}
// --- чёрный урон в зоне: броня моба не действует; навык артефакта у моба — % ОЗ игрока
{ const z = new Zone("arinar", [], [], { proc: true, seed: 11 } as any);
  const m: any = z.mobs.find((x: any) => !x.dead && !x.special);
  if (m) { const hp = m.hp; const r1 = z.damage(m, "p1", 7.4, () => {}, { black: true } as any, "ba"); ok(r1 === 7 && m.hp === hp - 7, "zone.damage black: без брони");
    const r0 = z.damage(m, "p1", 0.2, () => {}, { black: true } as any, "ba"); ok(r0 === 0, "zone.damage black: 0 возможен");
    m.casts = []; const t: any = { sid: "p1", x: m.x + 40, y: m.y, hp: 100, maxHp: 100, armorRed: 0, alive: true, respawnAt: 0 };
    // навык конструктора у моба идёт через castCraft (bm-mob-craft-test): удар после телеграфа, % — в onHit
    const bmH: number[] = [], n0 = Date.now(); (z as any).pl = new Map([["p1", t]]); (z as any).curHit = (_s: string, _d: number, _src: string, _m: any, bm?: number) => bmH.push(bm || 0); (z as any).now = n0;
    z.heroCast(m, { bdmg: 0 }, "bmf_magma_ring", t, new Map([["p1", t]]), n0, 10, 1, 300, 1, 0); for (let i = 1; i <= 60; i++) (z as any).runMfx(n0 + i * 100);
    const sdef: any = SK_DEFS.bmf_magma_ring, mult = (Number(sdef.mul) || 1) * ((sdef.ticks || 1) > 1 ? 1 / Math.sqrt(sdef.ticks) : 1);
    ok(bmH.length > 0 && bmH.every((b) => near(b, ABILITY_BY_ID.bmf_magma_ring.bm.pct * mult, 1e-3)), `моб: навык артефакта несёт bm = pct (обычный моб, bdmg 0): ${bmH.map((b) => b.toFixed(2)).join(",")}`);
    m.casts = []; z.heroCast(m, { bdmg: 0 }, "fireball", t, new Map([["p1", t]]), Date.now(), 10, 1, 300, 1, 0); ok(m.casts.every((c: any) => !c.bm), "моб: обычный навык без bm");
  } else ok(false, "в зоне нет моба для проверки");
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
