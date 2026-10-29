// Чёрная магия, этап В: конструктор чёрных мобов, лагеря, таймеры, драка чёрных с обычными (только рядом с игроком).
// Запуск: cd server && bun meta/black-mobs-test.ts
import { BM_MOBS, BM_BODY, BM_CAMPS, BMM_CFG, registerBlackMobs, mobErr, mobFinal, bmmClient, applyBmmClient, bmxIndex, bmxTypeAt, BMX_BASE, refStats } from "./blackMobs";
import { validatePatch, applyOverride, TABLES, SCHEMA } from "./overrides";
import { KINDS } from "./admin";
import { ZONE_MOBS, MONSTER_LOOT, ITEM_BY_ID } from "./defs";
import { Zone, factionOf, hostile, type ZPlayer } from "./zone";
import { makeArtifact } from "./blackArtReg";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };

registerBlackMobs(ITEM_BY_ID as any);
ok(Object.keys(BM_BODY).length === 210, "210 встроенных частей тела (6 стихий × 7 слотов × 5 листов Художника)", Object.keys(BM_BODY).length);
{ const by: Record<string, Record<string, number>> = {}; for (const b of Object.values(BM_BODY) as any[]) { const el = b.elem || "fire"; (by[el] ||= {})[b.slot] = (by[el][b.slot] || 0) + 1; }
  const EL = ["fire", "ice", "water", "stone", "nature", "lightning"], SL = ["head", "torso", "armL", "armR", "legL", "legR", "tail"];
  for (const el of EL) ok(SL.every((s) => by[el]?.[s] === 5), `стихия ${el}: по 5 частей в каждом из 7 слотов`, by[el]); }
ok(Object.values(BM_MOBS).every((m) => !mobErr(m)), "встроенные мобы собраны без ошибок");
for (const id of Object.keys(BM_MOBS)) ok((ZONE_MOBS as any)[id]?.black && MONSTER_LOOT[id], `${id}: в ZONE_MOBS (black) и MONSTER_LOOT`);
ok(["bmbody", "bmmob", "bmcamp", "bmmcfg"].every((k) => (KINDS as string[]).includes(k) && SCHEMA[k as any] && TABLES[k as any]), "виды правок в админке");
// класс → роль; оружие в руке → +урон
const w = BM_MOBS.bmx_ash_warden, f = mobFinal(w), f0 = mobFinal({ ...w, weapon: {} });
ok(f.dmg > f0.dmg && Math.abs(f.dmg / f0.dmg - (1 + BMM_CFG.weaponDmgPct / 100)) < 0.02, "оружие в руке: +weaponDmgPct% урона");
ok((ZONE_MOBS as any).bmx_ember_archer.role === "ranged" && (ZONE_MOBS as any).bmx_forge_brute.role === "tank", "лучник — дальний, громила — танк");
ok(refStats(10).hp > refStats(3).hp, "«Авто по уровню» растёт с уровнем");
// артефакт игрока в руке
const art = makeArtifact({ handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2" })!;
(ITEM_BY_ID as any)[art.id] = art;
// своя: создать, проверки
const P = { name: "Пробный бес", cls: "mage", lvl: 7, "body.torso": "fb_torso_2", "body.head": "fb_head_3", "body.legL": "fb_legL_1", "body.legR": "fb_legR_1", "body.armR": "fb_armR_5", artId: art.id, cursed: true, ench: 2, drops: [{ res: "bp_fire_blade", chance: 25, qty: [1, 2] }] };
const v = validatePatch("bmmob" as any, "bmx_probe", P);
ok(typeof v === "object", "свой моб: правка проходит " + (typeof v === "string" ? v : ""));
ok(validatePatch("bmmob" as any, "bmx_probe", { ...P, "body.head": "fb_torso_1" }) === "Рёберная клетка: это не Голова", "часть тела не из своего слота — отказ");
ok(typeof validatePatch("bmmob" as any, "bmx_probe", { ...P, "body.torso": "" }) === "string", "без торса — отказ");
ok(typeof validatePatch("bmmob" as any, "bmx_probe", { ...P, drops: [{ res: "nope", chance: 5, qty: [1, 1] }] }) === "string", "дроп: неизвестный ресурс — отказ");
ok(typeof validatePatch("bmmob" as any, "bmx_probe", { ...P, "weapon.blade": "fire_handle" }) === "string", "оружие: деталь не того типа — отказ");
ok(!BM_MOBS.bmx_probe, "проверка не оставляет шаблон в таблице");
applyOverride("bmmob" as any, "bmx_probe", v);
const Z: any = (ZONE_MOBS as any).bmx_probe;
ok(Z?.black && Z.role === "caster" && MONSTER_LOOT.bmx_probe.materials[0].res === "bp_fire_blade", "свой моб опубликован: маг→caster, дроп деталей");
ok(JSON.stringify(mobFinal(BM_MOBS.bmx_probe, ITEM_BY_ID as any).weapon) === JSON.stringify(art.bm.parts), "оружие = артефакт игрока");
// клиент получает те же данные
const C = bmmClient(ITEM_BY_ID as any);
ok(C.mobs.bmx_probe && C.body.fb_head_3 && C.order.includes("bmx_probe"), "клиенту: мобы, части, порядок индексов");
const idx = bmxIndex("bmx_probe"); ok(idx >= BMX_BASE && bmxTypeAt(idx) === "bmx_probe", "индекс в состоянии зоны ≥ BMX_BASE и обратимо");
applyBmmClient(JSON.parse(JSON.stringify(C))); ok(bmxTypeAt(idx) === "bmx_probe", "клиентский порядок совпадает");
// фракция
ok(factionOf("bmx_probe") === "black" && hostile("bmx_probe", "ice_wolf") && hostile("ice_wolf", "bmx_probe") && !hostile("bmx_probe", "bmx_ash_warden"), "фракция «black»: враги всем обычным, своих не трогает");
// лагерь
const z = new Zone("arinar", [], [], { proc: true });
const base = z.camps.find((c) => !z.safeAt(c.x, c.y, 2000))!;
const cx = base.x + 900, cy = base.y + 900;
const cp = validatePatch("bmcamp" as any, "bcx_test", { name: "Тест-лагерь", world: "arinar", x: cx, y: cy, r: 120, chief: "bmx_forge_brute", mobs: [{ mob: "bmx_ash_warden", n: 3 }, { mob: "bmx_probe", n: 1 }], respawnMin: 30, respawnMax: 40 });
ok(typeof cp === "object", "лагерь: правка проходит " + (typeof cp === "string" ? cp : ""));
ok(typeof validatePatch("bmcamp" as any, "bcx_test", { mobs: [{ mob: "bmx_ash_warden", n: 999 }] }) === "string", "лагерь: больше лимита — отказ");
ok(typeof validatePatch("bmcamp" as any, "bcx_test", { respawnMin: 50, respawnMax: 10 }) === "string", "лагерь: «от» > «до» — отказ");
applyOverride("bmcamp" as any, "bcx_test", cp);
const pl = new Map<string, ZPlayer>();
let now = 50_000_000;
z.update(0.05, now, pl, () => {}, () => {});
const bm = z.mobs.filter((m: any) => m.bmc === "bcx_test" && m.respawnAt !== -1);
ok(bm.length === 5 && bm.filter((m) => m.chief).length === 1, "лагерь заспавнил 5 мобов, 1 вожак");
ok(bm.every((m) => m.camp >= 900000) && z.camps.some((c) => c.region === "bm:bcx_test"), "лагерь в списке лагерей (мини-карта, сундук зачистки)");
ok(bm.filter((m) => m.type === "bmx_probe").every((m) => m.cursed && m.ench === 2), "флаги из конструктора: проклятый, ярус 2");
const st = z.state(cx, cy, []); const types = new Set<number>(); for (let i = 0; i < st.m.length; i += 6) types.add(st.m[i + 1]);
ok([...types].some((t) => t >= BMX_BASE), "состояние зоны: чёрные мобы с индексом ≥ BMX_BASE");
// смерть → таймер от/до
const k = bm[1]; z.kill(k, () => {});
const sec = (k.respawnAt - Date.now()) / 1000; ok(sec >= 29 && sec <= 41, `возрождение по таймеру лагеря 30…40 с (${sec.toFixed(1)})`);
const T = z.bmTimers(); ok(Object.keys(T).length === 1 && T["bcx_test:" + (k as any).bmSlot] === k.respawnAt, "таймеры для library_meta");
// перезапуск: таймер восстанавливается
const z2 = new Zone("arinar", [], [], { proc: true }); z2.bmPending = T; z2.syncBlackCamps(Date.now(), true);
const k2 = z2.mobs.find((m: any) => m.bmc === "bcx_test" && m.bmSlot === (k as any).bmSlot)!; ok(k2?.dead && Math.abs(k2.respawnAt - k.respawnAt) < 2, "после перезапуска мёртвый ждёт свой таймер");
// драка: обычный моб рядом с лагерем; без игрока — не дерутся, с игроком — дерутся
const norm = Object.keys(ZONE_MOBS).find((t) => !(ZONE_MOBS as any)[t].black && !(ZONE_MOBS as any)[t].boss && (ZONE_MOBS as any)[t].lvl >= 5 && factionOf(t) !== "black")!;
const o = z.addMob(norm, cx + 60, cy, { fixed: true, respawn: 30 });
z.pl = new Map(); ok(!z.findFoe(bm[0], 400), "без игрока рядом чёрные не дерутся (мир спит)");
const p: ZPlayer = { sid: "p1", x: cx + 100, y: cy + 100, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 };
z.pl = new Map([["p1", p]]); const foe = z.findFoe(bm[0], 400); ok(!!foe && !(ZONE_MOBS as any)[foe.type].black, "игрок рядом — чёрный нашёл обычного врага");
ok(!!z.findFoe(o, 400) && (ZONE_MOBS as any)[z.findFoe(o, 400)!.type].black, "и обычный нападает на чёрного");
BMM_CFG.fightNearTiles = 0; ok(!z.findFoe(bm[0], 400), "fightNearTiles 0 — драк нет"); BMM_CFG.fightNearTiles = 12;
// прогон: кто-то кого-то ударил
let hits = 0; p.x = cx + 230; p.y = cy + 250; // игрок рядом (< fightNearTiles), но вне агро
for (let i = 0; i < 400; i++) { now += 50; z.update(0.05, now, new Map([["p1", p]]), () => {}, () => {}); }
hits = z.stats.mobHits; ok(hits > 0, `чёрные и обычные бьют друг друга (${hits} ударов)`);
// снять лагерь — мобы уходят
applyOverride("bmcamp" as any, "bcx_test", { ...cp, hidden: true }); z.syncBlackCamps(Date.now(), true);
ok(!z.mobs.some((m: any) => m.bmc === "bcx_test" && m.respawnAt !== -1) && !z.camps.some((c) => c.region === "bm:bcx_test"), "выключенный лагерь убран");
{ const { bestiaryRegistry } = await import("./bestiaryReg"); const { btTargetErr } = await import("./overrides");
  const C0: any = BM_CAMPS.bcx_test, h0 = C0.hidden; C0.hidden = false;
  const rb = bestiaryRegistry().filter((e) => e.g === "black"); C0.hidden = true;
  ok(!bestiaryRegistry().some((e) => e.where.some((w) => w.includes("Тест-лагерь"))), "Бестиарий: скрытый лагерь — не показан"); C0.hidden = h0;
  ok(rb.some((e) => e.id === "bmx_forge_brute" && e.where.some((w) => w.includes("Тест-лагерь"))), "Бестиарий: группа «Чёрные», место — лагерь");
  ok(btTargetErr("kill", "bmx_ash_warden") === null, "доска/охота: чёрный моб — допустимая цель"); }
// лагерь у города — отказ в мире
const city = { ...cp, x: -10, y: 5 }; ok(!!z.bmCampErr({ ...(BM_CAMPS.bcx_test as any), ...city }), "лагерь за краем/у города не ставится");
applyOverride("bmcamp" as any, "bcx_test", null); applyOverride("bmmob" as any, "bmx_probe", null);
ok(!BM_MOBS.bmx_probe && (ZONE_MOBS as any).bmx_probe, "сброс своего моба: из конструктора убран, вид для живых остаётся");
// логово: не-вожаки элитные и после возрождения (а не по шансу региона)
{ const lp = validatePatch("bmcamp" as any, "bcx_lair", { name: "Тест-логово", world: "arinar", x: cx, y: cy, r: 120, chief: "bmx_forge_brute", lair: true, mobs: [{ mob: "bmx_ash_warden", n: 3 }], respawnMin: 30, respawnMax: 40 });
  ok(typeof lp !== "string", "логово: правка принята", lp); applyOverride("bmcamp" as any, "bcx_lair", lp);
  const z3 = new Zone("arinar", [], [], { proc: true }); const p3 = new Map<string, ZPlayer>([["p3", { sid: "p3", x: cx + 900, y: cy + 900, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 }]]); // рядом — чанк бодрствует
  let t3 = 60_000_000; z3.update(0.05, t3, p3, () => {}, () => {});
  const L = z3.mobs.filter((m: any) => m.bmc === "bcx_lair" && m.respawnAt !== -1 && !m.chief);
  ok(L.length === 3 && L.every((m) => m.elite), "логово: не-вожаки элитные при появлении");
  for (const m of L) { z3.kill(m, () => {}); m.respawnAt = 1; }
  for (let i = 0; i < 4; i++) { t3 += 100; z3.update(0.05, t3, p3, () => {}, () => {}); }
  ok(L.every((m) => !m.dead), "логово: не-вожаки возродились");
  ok(L.every((m) => m.elite), "логово: после возрождения не-вожаки остаются элитными");
  applyOverride("bmcamp" as any, "bcx_lair", null); }
// сброс всех правок (admin reset) не удаляет встроенных bmx_* мобов
for (const id of Object.keys(BM_MOBS)) applyOverride("bmmob" as any, id, null);
ok(!!BM_MOBS.bmx_ash_warden && !!BM_MOBS.bmx_ember_archer && !!BM_MOBS.bmx_forge_brute, "сброс правок: встроенные чёрные мобы остаются");
console.log(`\n${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
