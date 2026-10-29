// ЭТАП 2: конструктор — сундуки наград, снаряжение и кусочки с чёрных мобов и лагерей/логов (обычные мобы кусочков не роняют никогда).
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { validatePatch } from "./overrides";
import { BM_MOBS, BM_CAMPS, BM_CAMP_BUILTIN, registerBlackMobs, cleanGear, cleanChests, cleanCampLoot, rollBmChests, rollCampLoot, campElems, mobElem, cleanMove } from "./blackMobs";
import { pieceId, shardId } from "./blackArt";
import { grantSpec, chestsOf } from "./boardChest";
import { CampRuns } from "./chests";
import { RESOURCES } from "./shared";
import { BM_PARTS, BP_TYPES, partCost } from "./blackArt";
import { craftPart, forgeState } from "./blackForge";
import CI from "../../public/bm-art/craft/index.json";
let P = 0, F = 0; const ok = (c: any, m: string) => { if (c) { P++; console.log("PASS " + m); } else { F++; console.log("FAIL " + m); } };
registerBlackMobs(ITEM_BY_ID as any);
const ELS = ["water", "stone", "nature", "lightning"];
// встроенные лагеря и логова
for (const el of ELS) { const c = BM_CAMPS[`bc_${el}`], l = BM_CAMPS[`bc_${el}_lair`];
  ok(c && l && c.hidden && l.hidden && l.lair && !!l.chief, `${el}: лагерь и логово есть, скрыты по умолчанию, у логова вожак`);
  ok([...campElems(c)].join() === el && [...campElems(l)].join() === el, `${el}: в лагере/логове мобы только своей стихии`);
  ok(typeof cleanCampLoot(l.loot, l) === "object" && (l.loot!.drops || []).every((d) => d.res.includes(el)), `${el}: добыча логова — кусочки своей стихии`);
  ok(Object.values(BM_MOBS).filter((m) => mobElem(m) === el).every((m) => m.drops.every((d) => !/^bp_|^bm_shard_/.test(d.res) || d.res.includes(el))), `${el}: мобы роняют только свои кусочки`); }
ok(BM_CAMP_BUILTIN.size === 8, "8 встроенных лагерей/логов");
// проверки
ok(typeof cleanGear([{ item: "nope_x", chance: 5 }]) === "string" && Array.isArray(cleanGear([{ item: Object.keys(ITEM_BY_ID)[0], chance: 5 }])), "снаряжение: предмет должен существовать");
ok(typeof cleanChests([{ t: "mythic", chance: 5 }]) === "string" && typeof cleanChests([{ t: "rare", chance: 150 }]) === "string", "сундук: ярус из списка, шанс 0…100");
ok(JSON.stringify(cleanChests([{ t: "rare", chance: 25, c: 10, L: 12 }])) === JSON.stringify([{ t: "rare", chance: 25, c: 10, L: 12 }]), "сундук: ярус/шанс/проклятый/уровень сохраняются");
ok(typeof cleanCampLoot({ drops: [{ res: pieceId("fire", "blade"), chance: 10, qty: [1, 1] }] }, BM_CAMPS.bc_water) === "string", "лагерь воды: огненные кусочки нельзя");
ok(typeof cleanCampLoot({ drops: [{ res: shardId("water"), chance: 10, qty: [1, 1] }] }, BM_CAMPS.bc_water) === "object", "лагерь воды: осколки воды можно");
// админка (validatePatch)
const mob = "bmx_storm_warden";
ok(typeof validatePatch("bmmob" as any, mob, { chests: [{ t: "rare", chance: 20 }] }) === "object", "админка: сундуки моба сохраняются");
ok(typeof validatePatch("bmmob" as any, mob, { chests: [{ t: "zzz", chance: 20 }] }) === "string", "админка: неверный ярус отклоняется");
ok(typeof validatePatch("bmmob" as any, mob, { gear: [{ item: "zzz", chance: 20 }] }) === "string", "админка: несуществующее снаряжение отклоняется");
ok(typeof validatePatch("bmmob" as any, mob, { drops: [{ res: pieceId("water", "blade"), chance: 20, qty: [1, 1] }] }) === "string", "админка: молнии нельзя кусочки воды");
ok(typeof validatePatch("bmcamp" as any, "bc_stone", { loot: { drops: [{ res: pieceId("stone", "blade"), chance: 20, qty: [1, 1] }], chests: [{ t: "rare", chance: 50 }] } }) === "object", "админка: добыча лагеря камня — свои кусочки + сундук");
ok(typeof validatePatch("bmcamp" as any, "bc_stone", { loot: { drops: [{ res: pieceId("nature", "blade"), chance: 20, qty: [1, 1] }] } }) === "string", "админка: в лагерь камня кусочки природы нельзя");
ok(typeof validatePatch("bmmob" as any, mob, { move: { spd: 1.6, dash: { cd: 1500, len: 200, spd: 1600 }, blink: { cd: 4000, range: 260 }, ghost: 6 } }) === "object", "админка: движение моба (скорость/рывок/телепорт/шлейф)");
ok((cleanMove({ spd: 99, dash: { cd: 10, len: 1, spd: 1 } }) as any).spd === 4 && (cleanMove({ dash: { cd: 10 } }) as any).dash.cd === 300, "движение: значения зажимаются");
// бросок
let n = 0; const r = () => Math.random(); for (let i = 0; i < 2000; i++) n += rollBmChests([{ t: "rare", chance: 25 }], 10, r).length;
ok(n > 380 && n < 620, `сундуки: шанс 25% ≈ ${n}/2000`);
ok(rollBmChests([{ t: "rare", chance: 100, c: 100 }], 7, r)[0].cur && rollBmChests([{ t: "rare", chance: 100 }], 7, r)[0].L === 7, "сундук: проклятый 100% и уровень по мобу");
const cl = rollCampLoot({ drops: [{ res: shardId("water"), chance: 100, qty: [2, 2] }], gear: [{ item: Object.keys(ITEM_BY_ID)[0], chance: 100 }] }, r);
ok(cl.res[shardId("water")] === 2 && cl.items.length === 1, "добыча лагеря: ресурсы и снаряжение");
const a: any = { hero: "warrior", heroes: {} }; const made = grantSpec(a, "warrior", [{ t: "rare", n: 1, L: 9 } as any], 9, "black", "bmmob:test");
ok(made.length === 1 && chestsOf(a).list[0].src === "bmmob:test" && chestsOf(a).list[0].cat === "black", "сундук выдаётся в окно «🎁 Сундуки» (src bmmob:…)");
// зачистка: CampRun знает свой лагерь конструктора
const R = new CampRuns(); const m: any = { id: 1, type: "bmx_tide_warden", camp: 77, bmc: "bc_water", x: 0, y: 0, dmgBy: new Map([["s1", 50]]) };
const run: any = R.onKill("arinar", m, () => "uid:a", Date.now()); ok(run && run.bmc === "bc_water", "зачистка лагеря: CampRun.bmc = id лагеря конструктора");
ok(Object.keys(ZONE_MOBS).filter((id) => !(ZONE_MOBS as any)[id].black).length > 20, "обычные мобы на месте");
// крафт: кусочки 4 стихий — ресурсы; деталь каждой стихии создаётся только из своих кусочков; иконки из craft_index.json
const ci = JSON.stringify(CI);
for (const el of ELS) {
  ok(BP_TYPES.every((t) => !!(RESOURCES as any)[pieceId(el, t)]) && !!(RESOURCES as any)[shardId(el)], `${el}: кусочки и осколок — ресурсы`);
  ok(BP_TYPES.every((t) => ci.includes(pieceId(el, t))), `${el}: иконки кусочков в craft_index.json`);
  const part = Object.values(BM_PARTS).find((p: any) => p.elem === el && p.type === "blade" && !p.hidden && !(p.reqLvl > 30)) as any;
  const acc: any = { res: { [pieceId(el, "blade")]: partCost(part), [pieceId("fire", "blade")]: 999 } };
  const r1 = craftPart(acc, part.id, 30); ok(r1.ok && acc.bmParts[part.id] === 1 && !acc.res[pieceId(el, "blade")] && acc.res[pieceId("fire", "blade")] === 999, `${el}: деталь ${part.id} — из своих кусочков`);
  const r2 = craftPart({ res: { [pieceId("fire", "blade")]: 999 } }, part.id, 30); ok(!r2.ok, `${el}: чужие кусочки не подходят`);
  ok(forgeState(acc, 30).parts.some((p: any) => p.elem === el), `${el}: детали стихии в кузне`); }
// ЭТАП 2: лагеря разных стихий не рядом (elemGap): второй чужой стихии ближе зазора не ставится, своей стихии — ставится
{ const { Zone } = await import("./zone"); const { BMM_CFG } = await import("./blackMobs");
  const z: any = new Zone("arinar", [], [], { proc: true, seed: 3 }); const sv = Object.fromEntries(Object.entries(BM_CAMPS).map(([k, c]) => [k, c.hidden]));
  for (const c of Object.values(BM_CAMPS)) c.hidden = true;
  const w = BM_CAMPS.bc_water, s = BM_CAMPS.bc_stone, ws = { x: w.x, y: w.y }, ss = { x: s.x, y: s.y };
  w.hidden = false; s.hidden = false; s.x = w.x + 700; s.y = w.y;
  z.syncBlackCamps(Date.now(), true); const has = (id: string) => z.mobs.some((m: any) => m.bmc === id && m.respawnAt !== -1);
  ok(BMM_CFG.elemGap >= 1000 && has("bc_water") && !has("bc_stone"), `чужая стихия в 700 px (< ${BMM_CFG.elemGap}) не ставится — снаряды соседнего лагеря не долетают`);
  s.x = w.x + BMM_CFG.elemGap + 50; z.syncBlackCamps(Date.now(), true); ok(has("bc_water") && has("bc_stone"), "за зазором — оба лагеря стоят");
  const g0 = BMM_CFG.elemGap; BMM_CFG.elemGap = 0; s.x = w.x + 700; z.syncBlackCamps(Date.now(), true); ok(has("bc_stone"), "elemGap 0 — проверка выключена"); BMM_CFG.elemGap = g0;
  ok(validatePatch("bmmcfg" as any, "main", { elemGap: 2000 }) === null || typeof validatePatch("bmmcfg" as any, "main", { elemGap: 2000 }) !== "string", "elemGap правится в админке");
  Object.assign(w, ws); Object.assign(s, ss); for (const [k, h] of Object.entries(sv)) BM_CAMPS[k].hidden = h as any; }
console.log(`${P} PASS / ${F} FAIL`); if (F) process.exitCode = 1;
