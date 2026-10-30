// Детали оружия чёрного моба работают в бою (раньше игнорировались): «Чёрный урон, %», «Чёрная броня», «Предельная броня, %», «Навык части».
// Запуск: cd server && bun meta/bm-weapon-stats-test.ts
import { MetaService } from "./service";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs, BM_MOBS } from "./blackMobs";
import { BM_PARTS, BMA_CFG, bmDefendEx } from "./blackArt";
import { validatePatch, applyOverride } from "./overrides";
import { ownSkills } from "./zone";
import { inCity } from "./city";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
registerBlackMobs(ITEM_BY_ID as any);
const mn0 = BMA_CFG.bmMinDmg;
// ---------- формула «Предельной брони» (пример Алекса) ----------
(BMA_CFG as any).bmMinDmg = 0;
ok(bmDefendEx(100, { barm: 0, bcap: 10 }, 100).d === 10, "пример Алекса: моб 100 ОЗ, удар 100, предельная 10% → 10");
ok(bmDefendEx(5, { barm: 0, bcap: 10 }, 100).d === 5, "удар меньше предела — проходит целиком");
ok(bmDefendEx(100, { barm: 30, bcap: 0 }, 100).d === 70, "чёрная броня: −30 с удара");
(BMA_CFG as any).bmMinDmg = mn0;
// ---------- детали из конструктора → статы моба ----------
const part = (id: string, p: any) => { const v = validatePatch("bpart" as any, id, p); ok(typeof v === "object", `деталь ${id} проходит ${typeof v === "string" ? v : ""}`); applyOverride("bpart" as any, id, v); };
part("bpx_t_core_glass", { type: "crystal", elem: "fire", name: "Ядро стеклянной пушки", "stats.bdmg": 5, hidden: true });
part("bpx_t_core_fort", { type: "crystal", elem: "stone", name: "Ядро крепости", "stats.bdmg": 0.1, "stats.bcap": 1, "stats.barm": 4, hidden: true });
part("bpx_t_core_mid", { type: "crystal", elem: "water", name: "Ядро середины", "stats.bdmg": 1, "stats.bcap": 10, hidden: true });
const mob = (id: string, el: string, core: string, extra: any = {}) => {
  const P = { name: "Проба " + id, cls: "warrior", lvl: 10, "body.torso": "fb_torso_2", "body.head": "fb_head_3", "body.legL": "fb_legL_1", "body.legR": "fb_legR_1", "body.armR": "fb_armR_5",
    "weapon.handle": `${el}_handle`, "weapon.blade": `${el}_blade`, "weapon.crystal": core, ...extra };
  const v = validatePatch("bmmob" as any, id, P); ok(typeof v === "object", `моб ${id} проходит ${typeof v === "string" ? v : ""}`); applyOverride("bmmob" as any, id, v); return (ZONE_MOBS as any)[id];
};
const bladeBd = (el: string) => (Number(BM_PARTS[`${el}_handle`].stats.bdmg) || 0) + (Number(BM_PARTS[`${el}_blade`].stats.bdmg) || 0);
const G = mob("bmx_t_glass", "fire", "bpx_t_core_glass"), F = mob("bmx_t_fort", "stone", "bpx_t_core_fort"), M = mob("bmx_t_mid", "water", "bpx_t_core_mid");
ok(Math.abs(G.bdmg - (5 + bladeBd("fire"))) < 1e-6, `bdmg = сумма деталей (стекло ${G.bdmg})`);
ok(G.bmDef?.bcap === Number(BM_PARTS.fire_handle.stats.bcap) && !G.bmDef?.barm && F.bmDef?.bcap === Math.max(1, Number(BMA_CFG.caps.bcap) || 0) && F.bmDef?.barm >= 4 && M.bmDef?.bcap === 10, "barm/bcap деталей → защита моба (рукоять по умолчанию — предельная броня)");
ok(BM_MOBS.bmx_t_glass && G.bmSkills?.includes(BM_PARTS.fire_blade.skill) && ownSkills(G).includes(BM_PARTS.fire_blade.skill), "«Навык части» лезвия → навык моба");
// ---------- бой: мир ----------
function world() {
  const svc: any = new MetaService(null, {}); const sess = new Map<string, any>(), acc = new Map<string, any>();
  svc.store.account = (pk: string) => (acc.get(pk) || acc.set(pk, {}).get(pk)); svc.send = () => {}; svc.push = () => {};
  svc.sessionLookup = (s: string) => sess.get(s) || null; svc.equippedIds = () => [];
  const z = svc.zones.arinar; svc.bmInit(); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
  const c = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c.x + 900, Y = c.y + 900;
  sess.set("p", [{ id: "p" }, { id: "p", username: "p", world: "arinar", x: X, y: Y, stats: { classId: "warrior" } }]);
  svc.ms.set("p", { sid: "p", pkey: "uid:p", ready: true, zp: { sid: "p", x: X, y: Y, hp: 1e6, maxHp: 1e4, alive: true, armorRed: 0, lvl: 10 }, pub: { lvl: 10 }, abilCd: {}, lastAtk: 0 });
  return { svc, z, X, Y, p: svc.ms.get("p") };
}
const W = world(), now = Date.now();
// удар моба: плоский + bdmg% макс. ОЗ игрока (10 000 ОЗ)
for (const [id, d] of [["bmx_t_glass", G], ["bmx_t_fort", F], ["bmx_t_mid", M]] as [string, any][]) {
  const hp0 = W.p.zp.hp; W.svc.zoneHit("arinar", W.z, "p", d.dmg, id, null, now, undefined, "swing"); const got = hp0 - W.p.zp.hp;
  const gap = got - Math.round(d.dmg * 1); // разница уровней = 1 на равных уровнях
  const exp = Math.round(1e4 * d.bdmg / 100 * (Number(BMA_CFG.vsPlayer) || 0));
  ok(Math.abs(gap - exp) <= 2, `${id}: удар = плоский ${Math.round(d.dmg)} + ${d.bdmg}% ОЗ (ждали +${exp}, вышло +${gap})`);
}
{ const hp0 = W.p.zp.hp; W.svc.zoneHit("arinar", W.z, "p", 100, "bmx_t_glass", null, now, 2, "skill:x"); ok(hp0 - W.p.zp.hp === Math.round(1e4 * 0.02 * (Number(BMA_CFG.vsPlayer) || 0)), "навык с bm: только %, без добавки"); }
// удар игрока по мобу: предельная броня
(BMA_CFG as any).bmMinDmg = 0;
{ const m = W.z.addMob("bmx_t_mid", W.X + 40, W.Y); m.maxHp = 100; m.hp = 100;
  const r = W.z.damage(m, "p", 100, () => {}, { black: true }); ok(r === 10 && m.hp === 90, `игрок → моб (100 ОЗ, предельная 10%): удар 100 → ${r}`);
  const r2 = W.z.damage(m, "p", 7, () => {}, { black: true }); ok(r2 === 7, "удар меньше предела проходит целиком");
  const r3 = W.z.damage(m, "mob:1", 100, () => {}, { black: true }); ok(r3 === 100 || m.dead, "моб → моб: защита деталей не применяется (как раньше)"); }
{ const m = W.z.addMob("bmx_t_fort", W.X + 60, W.Y); const mh = m.maxHp;
  const r = W.z.damage(m, "p", 1e6, () => {}, { black: true }); ok(r === Math.round(mh * F.bmDef.bcap / 100), `крепость: удар 1e6 → ${r} (= ${F.bmDef.bcap}% от ${mh})`);
  const r2 = W.z.damage(m, "p", 3, () => {}, { black: true }); ok(r2 === 0, "крепость: удар 3 ≤ чёрной брони 4 → 0"); }
{ const m = W.z.addMob("bmx_t_glass", W.X + 80, W.Y); const r = W.z.damage(m, "p", 500, () => {}, { black: true }); ok(r === 500, "стекло: без защиты — удар целиком"); }
(BMA_CFG as any).bmMinDmg = mn0;
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
