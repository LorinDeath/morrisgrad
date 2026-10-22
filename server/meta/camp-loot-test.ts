// npx tsx server/meta/camp-loot-test.ts — сундук зачищенного лагеря: сырые шансы, множители открытого мира, без двойного броска, проклятые, второй/пустой сундук.
import { CURSE } from "./cursed";
import { CHEST, CampRuns, Chests, recipients, rollChest } from "./chests";
import { rollMonsterLoot, campRoll, matChance, activeLook } from "./profile";
import { ITEMS, ITEM_BY_ID, MONSTER_LOOT, ZONE_MOBS, ZONE_NODES, VARIANT_GEAR, LOOKS } from "./defs";
import { VARIANT_BY_ID } from "./biomes";
import { parseTag } from "./enchant";
import { itemCard } from "./library";
import { Zone } from "./zone";
import { ZONE_GEN } from "./zoneGen";
import { validatePatch, applyOverride } from "./overrides";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
let seed = 12345; const rnd = () => { let t = (seed = (seed + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
const W: any = (ITEMS as any[]).find((i) => i.slot === "weapon");
(MONSTER_LOOT as any).__c = { gear: [{ item: W.id, chance: 20 }], materials: [{ res: "soul_shard", chance: 40, qty: [1, 1] }] };
const N = 200000, freq = (f: () => { items: string[]; res: Record<string, number> }) => { let gi = 0, ci = 0, mi = 0; for (let i = 0; i < N; i++) { const r = f(); gi += r.items.filter((x) => x === W.id).length; ci += r.items.filter((x) => x.endsWith("@c")).length; mi += r.res.soul_shard ? 1 : 0; } return { g: (gi / N) * 100, c: (ci / N) * 100, m: (mi / N) * 100 }; };
const near = (a: number, b: number, m: string) => { const tol = 4 * Math.sqrt(Math.max(b, 0.01) * (100 - b) / N) + 0.02; ok(Math.abs(a - b) <= tol, `${m}: ${a.toFixed(3)}% ≈ ${b}% (±${tol.toFixed(3)})`); };
// прод-настройки: экипировка ×0.1, материалы ×0.1
CURSE.equipDropMult = 0.1; CHEST.matDropMult = 0.1; CHEST.campRaw = true; CHEST.campMult = 1;
let f = freq(() => rollMonsterLoot("__c", rnd, 1, false, "world")); near(f.g, 2, "открытый мир: экипировка 20% × 0.1"); near(f.m, 4, "открытый мир: материалы 40% × 0.1");
f = freq(() => campRoll({ lootKey: "__c", elite: false, cursed: false, boss: false }, rnd)); near(f.g, 20, "сундук лагеря: экипировка — сырые 20%"); near(f.m, 40, "сундук лагеря: материалы — сырые 40%");
f = freq(() => rollMonsterLoot("__c", rnd, 1, false, "base")); near(f.m, 40, "забеги (base): материалы без matDropMult");
(MONSTER_LOOT as any).__r = { gear: [{ item: W.id, chance: 0.14 }], materials: [] }; // «Клинок Фиолетовой Луны 0.14%»
{ let n = 0; const M = 2_000_000; for (let i = 0; i < M; i++) if (campRoll({ lootKey: "__r", elite: false, cursed: false, boss: false }, rnd).items.length) n++; const p = (n / M) * 100; ok(Math.abs(p - 0.14) < 0.012, `редкая вещь 0.14% в сундуке лагеря: ${p.toFixed(4)}%`); }
CHEST.campRaw = false; CHEST.campMult = 0.5; f = freq(() => campRoll({ lootKey: "__c", elite: false, cursed: false, boss: false }, rnd)); near(f.g, 10, "свой множитель лагеря ×0.5"); CHEST.campRaw = true;
// проклятые в лагере: обычные × mobDropMult, проклятые копии — только с боссов при bossOnly; шанс копии = сырой × itemChanceMult
CURSE.mobDropMult = 2; CURSE.itemChanceMult = 1; CURSE.bossOnly = true;
f = freq(() => campRoll({ lootKey: "__c", elite: false, cursed: true, boss: false }, rnd)); near(f.g, 40, "проклятый моб лагеря: обычная ×2 (сырые)"); ok(f.c === 0, "bossOnly: проклятый не-босс — без проклятых копий");
f = freq(() => campRoll({ lootKey: "__c", elite: false, cursed: true, boss: true }, rnd)); near(f.c, 20, "проклятый босс лагеря: проклятая копия по сырому шансу 20%");
CURSE.bossOnly = false; f = freq(() => campRoll({ lootKey: "__c", elite: false, cursed: true, boss: false }, rnd)); near(f.c, 20, "bossOnly выкл: копии и с обычных проклятых"); CURSE.bossOnly = true;
// проклятые копии попадают в сундук (флаг c)
{ const Cs = new Chests(); const c = Cs.spawn("arinar", 0, 0, [{ o: "uid:a", id: W.id + "@c", k: "item", n: 1 }], "camp:arinar:1", "mob", "x", "x")!; ok(c.entries[0].c === 1 && c.entries[0].id === W.id, "проклятая копия в сундуке лагеря помечена"); }
// зачистка: только лагерные, каждый убит хотя бы раз, без двойного броска
{
  const R = new CampRuns(); const mk = (id: number, o: any = {}) => ({ id, x: id * 10, y: 0, camp: 5, dead: false, respawnAt: 0, dmgBy: new Map([["A", 100]]), ...o });
  const mobs = [mk(1), mk(2), mk(3), mk(4, { camp: 0 })];
  ok(R.onKill("arinar", mobs[3], () => "uid:a") === null, "моб без лагеря — не копится (мешок)");
  ok(R.onKill("arinar", { ...mk(9), chestGuard: 1 }, () => "uid:a") === null, "страж сундука — не копится");
  const r = R.onKill("arinar", mobs[0], () => "uid:a")!; mobs[0].dead = true; ok(!R.cleared(r, mobs), "1 из 3 — не зачищен");
  mobs[0].dead = false; // возродился (45 с) — уже засчитан
  R.onKill("arinar", mobs[1], () => "uid:a"); ok(!R.cleared(r, mobs), "2 из 3");
  ok(R.onKill("arinar", mobs[2], () => "uid:a") === r && R.cleared(r, mobs), "каждый убит хотя бы раз → зачищен (возрождение не мешает)");
  R.close(r); ok(!R.map.size, "после сундука зачистка закрыта — следующий раз заново");
  const r2 = R.onKill("arinar", mobs[0], () => "uid:a", Date.now())!; R.expire(Date.now() + CHEST.campIdleSec * 1000 + 1); ok(!R.map.size && r2, "зачистка без убийств дольше campIdleSec — сброс");
}
// без двойного броска: убийство лагерного моба не роняет мешок, а в сундуке каждое убийство бросается ровно один раз на получателя
{
  let calls = 0; const e: any = { dmg: new Map([["A", 10]]), pkey: new Map([["A", "uid:a"]]), kills: [{ lootKey: "__c" }, { lootKey: "__c" }, { lootKey: "__c" }] };
  CHEST.partyMode = "personal"; const rec = recipients(e, (s) => [s]);
  rollChest(e, rec, (s) => [s], () => { calls++; return { items: [], res: {} }; }, rnd); ok(calls === 3, `3 убийства → 3 броска (не 6): ${calls}`);
  const src = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  ok(/if \(!enc && !split && ownerGrp\.includes\(sid\)\)/.test(src) && /const bag = enc \? null/.test(src), "service: мешок и бросок мира только без зачистки лагеря");
}
// пустой сундук
{ const Cs = new Chests(); ok(Cs.spawn("arinar", 0, 0, [], "camp:a:1", "mob", "x", "x") === null, "пустой — не ставится (по умолчанию)");
  const c = Cs.spawn("arinar", 0, 0, [], "camp:a:1", "mob", "x", "x", Date.now(), true)!; ok(c && c.keepEmpty === 1 && typeof Cs.get(c.id, "arinar", 0, 0) === "object" && !("err" in Cs.tryOpen(c, "uid:z", "z")), "campSpawnEmpty: пустой ставится и открывается");
  Cs.expire(Date.now()); ok(Cs.chests.has(c.id), "пустой (keepEmpty) не исчезает сразу"); }
// админка: валидация
ok(typeof validatePatch("chest", "main", { matDropMult: 0.05, campRaw: true, campMult: 0.3, campSecondPct: 15, campSpawnEmpty: true }) === "object", "правка «Лагерь» валидна (0.05)");
ok(typeof validatePatch("chest", "main", { matDropMult: -1 }) === "string" && typeof validatePatch("chest", "main", { campSecondPct: 101 }) === "string", "выход за пределы отклонён");
ok(typeof validatePatch("chest", "main", { _h_camp: 1 }) === "string", "заголовок раздела не редактируется");
const before = { ...CHEST }; applyOverride("chest", "main", validatePatch("chest", "main", { matDropMult: 0.05, campSecondPct: 15 })); ok(CHEST.matDropMult === 0.05 && CHEST.campSecondPct === 15 && Math.abs(matChance({ chance: 40 }) - 2) < 1e-9, "живое применение");
applyOverride("chest", "main", null); ok(CHEST.matDropMult === before.matDropMult && CHEST.campSecondPct === before.campSecondPct && CHEST.campRaw === before.campRaw, "сброс — исходные");
// канал: дрожание позиции до +40 px не прерывает
{ const Cs = new Chests(); const c = Cs.spawn("arinar", 0, 0, [{ o: "uid:a", id: W.id, k: "item", n: 1 }], "dev", "mob", "x", "x", 0)!; const now = c.pubAt + 1; Cs.tryOpen(c, "uid:b", "b", now);
  let ev = Cs.tick(now + 4000, () => 0, () => ({ world: "arinar", x: CHEST.range + 30, y: 0, alive: true })); ok(!ev.length, "дрожание +30 px за пределом — канал идёт");
  ev = Cs.tick(now + CHEST.channelSec * 1000, () => 0, () => ({ world: "arinar", x: 10, y: 0, alive: true })); ok(ev[0]?.k === "opened", "через channelSec — открыт"); }
// ---- уровень добычи = уровень моба (варианты биомов — свой уровень; раньше — предметы базы: «Стальной паук» 9 → вещи 13) ----
{
  const lv = (tag: string) => ITEM_BY_ID[parseTag(tag).id]?.lvl || 1;
  // таблицы: у каждого моба мира все вещи ровно его уровня
  const bad = Object.keys(ZONE_MOBS).filter((t) => (MONSTER_LOOT[t]?.gear || []).some((g) => ITEM_BY_ID[g.item]?.slot && (ITEM_BY_ID[g.item].lvl || 1) !== ZONE_MOBS[t].lvl));
  ok(!bad.length, `таблица каждого моба мира — вещи ровно его уровня (несовпадений: ${bad.length}${bad.length ? " — " + bad.slice(0, 5).join(", ") : ""})`);
  const copies = (ITEMS as any[]).filter((i) => i.part);
  ok(copies.length > 0 && new Set(ITEMS.map((i) => i.id)).size === ITEMS.length, `копии трофеев вариантов: ${copies.length}, id уникальны`);
  ok(copies.every((c) => { const b = ITEM_BY_ID[c.part]; return b && b.slot === c.slot && b.rarity === c.rarity && b.look === c.look && b.wtype === c.wtype && b.grantsAbility === c.grantsAbility && b.monster === c.monster && c.lvl === ZONE_MOBS[c.from].lvl && c.req >= c.lvl; }),
    "копия = базовый трофей (слот/редкость/облик/тип оружия/навык/комплект), уровень и требование — варианта");
  const first = ITEMS.findIndex((i: any) => i.part); ok(first > 0 && ITEMS.slice(first).every((i: any) => i.part), "копии — в конце пула (номера старых предметов не сдвинуты)");
  ok(MONSTER_LOOT.stone_rot_spider.gear.every((g) => lv(g.item) === 9) && MONSTER_LOOT.rot_spider.gear.every((g) => lv(g.item) === ZONE_MOBS.rot_spider.lvl), "«Стальной паук» 9 → вещи 9 ур.; базовый паук — свои");
  ok(VARIANT_BY_ID.stone_rot_spider && itemCard(VARIANT_GEAR.stone_rot_spider[MONSTER_LOOT.rot_spider.gear[0].item])?.monsterName === ZONE_MOBS.stone_rot_spider.name, "карточка копии: источник — вариант");
  // облик: комплект из копий варианта (и вперемешку с базой) — тот же облик базы
  const lk = Object.values(LOOKS).find((l) => l.parts.every((p) => Object.values(VARIANT_GEAR).some((m) => Object.keys(m).includes(p))))!;
  if (lk) { const vk = Object.keys(VARIANT_GEAR).find((k) => lk.parts.every((p) => VARIANT_GEAR[k][p]))!;
    const inv = lk.parts.map((p, i) => ({ uid: "u" + i, id: i % 2 ? p : VARIANT_GEAR[vk][p] })); const equip = Object.fromEntries(inv.map((x) => [ITEM_BY_ID[x.id].slot, x.uid]));
    ok(activeLook({ inv } as any, { equip, lvl: 99 } as any) === lk.id, `облик «${lk.name}» собирается из копий ${vk} вперемешку с базой`); }
  // все лагеря Аринара (настоящая сборка): ни одна вещь сундука и мешка не выше макс. уровня мобов лагеря + окна
  const z: any = new Zone("arinar", [], ZONE_NODES, { proc: true, seed: ZONE_GEN.seed });
  const camps = new Map<number, any[]>(); for (const m of z.byId.values()) if (m.camp) { const a = camps.get(m.camp) || []; a.push(m); camps.set(m.camp, a); }
  let n = 0, over = 0, low = 0, n910 = 0, over910 = 0; const hist910: Record<number, number> = {};
  for (const [, mobs] of camps) {
    const mx = Math.max(...mobs.map((m) => ZONE_MOBS[m.type].lvl));
    for (let i = 0; i < 10; i++) for (const m of mobs) {
      const L = ZONE_MOBS[m.type].lvl, k = { lootKey: m.type, elite: !!m.elite, cursed: !!m.cursed, ench: m.ench || 0, boss: !!ZONE_MOBS[m.type].boss };
      const items = [...campRoll(k, rnd).items, ...rollMonsterLoot(m.type, rnd, 1, false, "world", m.ench || 0).items];
      for (const it of items) { const l = lv(it); n++; if (l > mx + CHEST.lvlUp) over++; if (l < L - CHEST.lvlDown) low++; if (mx >= 9 && mx <= 10) { n910++; hist910[l] = (hist910[l] || 0) + 1; if (l > mx) over910++; } }
    }
  }
  ok(camps.size > 500 && n > 10000 && over === 0, `все лагеря (${camps.size}): ни одна из ${n} вещей не выше макс. ур. мобов лагеря + ${CHEST.lvlUp} (выше: ${over})`);
  ok(low === 0, `ни одна вещь не ниже уровня своего моба − ${CHEST.lvlDown} (ниже: ${low})`);
  ok(n910 > 0 && over910 === 0, `лагеря 9–10 ур.: ${n910} вещей, выше 10 ур. — ${over910}; ур.: ${Object.entries(hist910).map(([l, c]) => l + ":" + c).join(" ")}`);
  // страж уровня: правка «Дроп» админа со старыми предметами базы (13 ур.) у «Стального паука» (9) → своя вещь слота
  const keep = MONSTER_LOOT.stone_rot_spider.gear;
  MONSTER_LOOT.stone_rot_spider.gear = MONSTER_LOOT.rot_spider.gear.map((g) => ({ item: g.item, chance: 100 }));
  let r = campRoll({ lootKey: "stone_rot_spider", elite: false, cursed: false, boss: false }, rnd);
  ok(r.items.length === keep.length && r.items.every((x) => lv(x) === 9 && VARIANT_GEAR.stone_rot_spider[ITEM_BY_ID[x].part!] === x), `страж: вещи базы 13 ур. в таблице варианта 9 ур. → свои вещи слота 9 ур. (${r.items.length})`);
  CHEST.lvlUp = 5; r = campRoll({ lootKey: "stone_rot_spider", elite: false, cursed: false, boss: false }, rnd); ok(r.items.every((x) => lv(x) === ZONE_MOBS.rot_spider.lvl), "окно lvlUp=5 — вещи базы проходят (правится в админке)"); CHEST.lvlUp = 1;
  CHEST.lvlGuard = false; r = campRoll({ lootKey: "stone_rot_spider", elite: false, cursed: false, boss: false }, rnd); ok(r.items.every((x) => lv(x) === ZONE_MOBS.rot_spider.lvl), "страж выкл — как в таблице"); CHEST.lvlGuard = true;
  MONSTER_LOOT.stone_rot_spider.gear = [{ item: ITEMS.find((i: any) => i.slot === "helmet" && (i.lvl || 1) >= 20 && !i.part)!.id, chance: 100 }];
  MONSTER_LOOT.stone_rot_spider.gear.push(...keep.filter((g) => ITEM_BY_ID[g.item].slot !== "helmet").map((g) => ({ ...g, chance: 0 })));
  r = campRoll({ lootKey: "stone_rot_spider", elite: false, cursed: false, boss: false }, rnd); ok(r.items.length === 1 && lv(r.items[0]) === 9 && ITEM_BY_ID[r.items[0]].slot === "helmet", "чужая вещь 20+ ур. → свой шлем 9 ур.");
  MONSTER_LOOT.stone_rot_spider.gear = keep;
  ok(typeof validatePatch("chest", "main", { lvlGuard: false, lvlUp: 2, lvlDown: 0 }) === "object" && typeof validatePatch("chest", "main", { lvlUp: 21 }) === "string" && typeof validatePatch("chest", "main", { lvlDown: -1 }) === "string", "админка: окно уровня добычи 0–20, страж вкл/выкл");
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
