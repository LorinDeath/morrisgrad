// t1062u: баланс — «Получаемый чёрный урон, ×» моба и сложность лагеря (take / deal). Старые мобы и лагеря — без изменений.
// Запуск: cd server && bun meta/bm-take-test.ts
import { build } from "../../tools/content/gen-1030";
import { C30_TAKE, EASY, HARD_LAIRS } from "../../tools/content/c30-data";
import { MetaService } from "./service";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs, BM_MOBS, BM_CAMPS, campMul } from "./blackMobs";
import { validatePatch, applyOverride } from "./overrides";
import "./skillReg";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
registerBlackMobs(ITEM_BY_ID as any); const { mobs, lairs, rows } = build();
const svc: any = new MetaService(null, {}); const sess = new Map<string, any>();
svc.store.account = () => ({}); svc.send = () => {}; svc.push = () => {}; svc.sessionLookup = (s: string) => sess.get(s) || null; svc.equippedIds = () => []; svc.onMobKilled = () => {};
const z: any = svc.zones.arinar; svc.bmInit(); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
const X = 90000, Y = 90000;
// 1) встроенные (прод) чёрные мобы — без множителя
const old = Object.keys(BM_MOBS).filter((id) => !id.startsWith("bmx_c30_"));
ok(old.length > 0 && old.every((id) => !(ZONE_MOBS as any)[id].bmTake), `старые чёрные мобы (${old.length}): «получаемый урон» не задан`);
ok(mobs.every((mb: any) => (ZONE_MOBS as any)[mb.id].bmTake === C30_TAKE), `мобы c30 (${mobs.length}): получаемый урон ×${C30_TAKE}`);
// 2) удар игрока по мобу: ×take до брони/предельной
const oldId = old.find((id) => !((ZONE_MOBS as any)[id].bmDef?.barm > 0))!; const c30g = mobs.find((mb: any) => mb.tier.arch === "glass")!.id;
const hit = (type: string, d: number, bmc?: string) => { const m = z.addMob(type, X, Y); m.maxHp = 1e9; m.hp = 1e9; if (bmc) m.bmc = bmc; const r = z.damage(m, "p", d, () => {}, { black: true }, "ba"); z.mobs.splice(z.mobs.indexOf(m), 1); return r; };
ok(hit(oldId, 7) === 7, `старый моб ${oldId}: удар 7 → 7`);
ok(hit(c30g, 7) === 7 * C30_TAKE, `${c30g}: удар 7 → ${7 * C30_TAKE}`);
{ const m = z.addMob(c30g, X, Y); m.maxHp = 1e9; m.hp = 1e9; const r = z.damage(m, "mob:x", 7, () => {}, { black: true }); z.mobs.splice(z.mobs.indexOf(m), 1); ok(r === 7, "удар моба по мобу — без множителя"); }
// 3) лагерь: take / deal; лёгкие — без вожака, с вожаком — как было
const easy = lairs.filter((L: any) => !L.hard), hard = lairs.filter((L: any) => L.hard);
ok(hard.length === HARD_LAIRS.size && hard.every((L: any) => L.chief && !L.mul), `логова с вожаком (${hard.length}): вожак есть, множителей лагеря нет`);
ok(easy.length > 0 && easy.every((L: any) => !L.chief && L.mul === EASY), `лёгкие логова (${easy.length}): без вожака, ×${EASY.take} получают / ×${EASY.deal} наносят`);
ok(rows.filter((r: any) => r.kind === "bmcamp").every((r: any) => r.data.hidden && !r.data.x && !r.data.y), "логова — только шаблоны (hidden, 0/0)");
const eid = easy[0].id; for (const r of rows) if (r.kind === "bmcamp" && r.id === eid) { const p = validatePatch("bmcamp", eid, r.data); ok(typeof p !== "string", `${eid}: шаблон проходит проверку`); if (typeof p !== "string") applyOverride("bmcamp", eid, p); }
ok(campMul({ bmc: eid }, "take") === EASY.take && campMul({ bmc: eid }, "deal") === EASY.deal && campMul({}, "take") === 1 && campMul({ bmc: "nope" }, "deal") === 1, "campMul: лагерь / без лагеря / неизвестный");
ok(hit(c30g, 7, eid) === 7 * C30_TAKE * EASY.take, `моб лёгкого логова: удар 7 → ${7 * C30_TAKE * EASY.take}`);
// 4) моб → игрок: deal лагеря (настоящий zoneHit)
const P = (bmc?: string) => { sess.set("p", [{ id: "p" }, { id: "p", username: "p", world: "arinar", x: X, y: Y, stats: { classId: "warrior" } }]);
  svc.ms.set("p", { sid: "p", pkey: "uid:p", ready: true, zp: { sid: "p", x: X, y: Y, hp: 1e6, maxHp: 1000, alive: true, armorRed: 0 }, pub: {}, abilCd: {}, lastAtk: 0 });
  const m = z.addMob(c30g, X + 50, Y); if (bmc) m.bmc = bmc; const S = svc.ms.get("p"); svc.zoneHit("arinar", z, "p", (ZONE_MOBS as any)[c30g].dmg, c30g, m, Date.now(), undefined, "swing"); z.mobs.splice(z.mobs.indexOf(m), 1); return 1e6 - S.zp.hp; };
const d0 = P(), d1 = P(eid); ok(d0 > 0 && Math.abs(d1 - d0 * EASY.deal) <= 1, `удар моба по игроку: ${d0} → в лёгком логове ${d1} (×${EASY.deal})`);
// 5) админка: поля правятся, тот же id
const n0 = Object.keys(BM_CAMPS).length; const pc = validatePatch("bmcamp", eid, { take: 3, deal: 0.5 }); ok(typeof pc !== "string", "админка лагеря: take / deal принимаются");
if (typeof pc !== "string") applyOverride("bmcamp", eid, pc); ok(BM_CAMPS[eid].take === 3 && BM_CAMPS[eid].deal === 0.5 && Object.keys(BM_CAMPS).length === n0, "админка лагеря: тот же лагерь, без дубля");
ok(typeof validatePatch("bmcamp", eid, { deal: 0 }) === "string" && typeof validatePatch("bmcamp", eid, { take: 50 }) === "string", "админка лагеря: вне диапазона — отказ");
ok(typeof validatePatch("bmmob", c30g, { take: 50 }) !== "string" && typeof validatePatch("bmmob", c30g, { take: 5000 }) === "string", "админка моба: «получаемый урон» 0…1000");
console.log(`\n${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
