// npx tsx server/meta/camp-loot-test.ts — сундук зачищенного лагеря: сырые шансы, множители открытого мира, без двойного броска, проклятые, второй/пустой сундук.
import { CURSE } from "./cursed";
import { CHEST, CampRuns, Chests, recipients, rollChest } from "./chests";
import { rollMonsterLoot, campRoll, matChance } from "./profile";
import { ITEMS, MONSTER_LOOT } from "./defs";
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
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
