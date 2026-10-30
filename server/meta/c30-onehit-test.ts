// t1062u: «умер с одного удара на 22 ур. (207 ОЗ)» — ни один удар 100 мобов контента 30.10 не больше заявленного %:
// удар/выстрел = bdmg % × явные множители атаки (танк ×1.25, снаряд ×1.2, рывок ×1.5, элита/вожак/проклятие из настроек),
// навык = bm (pct + k×bdmg) × множитель формы, чистый = % ОЗ ИГРОКА. Настоящий ИИ (zone.update) → svc.zoneHit, как в бою.
// Запуск: cd server && bun meta/c30-onehit-test.ts
import { build } from "../../tools/content/gen-1030";
import { MetaService } from "./service";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs } from "./blackMobs";
import { BMA_CFG } from "./blackArt";
import { mobDmgMul } from "./zone";
import { inCity } from "./city";
import "./skillReg";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
registerBlackMobs(ITEM_BY_ID as any); const { mobs } = build();
const svc: any = new MetaService(null, {}); const sess = new Map<string, any>(), acc = new Map<string, any>();
svc.store.account = (pk: string) => (acc.get(pk) || acc.set(pk, {}).get(pk)); svc.send = () => {}; svc.push = () => {};
svc.sessionLookup = (s: string) => sess.get(s) || null; svc.equippedIds = () => [];
const z: any = svc.zones.arinar; svc.bmInit(); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
const c0 = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c0.x + 900, Y = c0.y + 900;
const HP = 207, LV = 22, vsP = Number(BMA_CFG.vsPlayer) || 0;
const pureOf = (d: any) => Object.values(d.bmPure || {}).reduce((a: number, v: any) => a + (Number(v) || 0), 0) as number;
const ATK_MAX = 1.8 * 1.25; // явные множители атаки в коде: обычные навыки мобов до ×1.8 (метеор), рывок ×1.5, снаряд ×1.2 — × танк ×1.25
let worst = { id: "", pct: 0, how: "" }, total = 0;
for (const mob of mobs) for (const [elite, chief] of [[false, false], [true, true]]) {
  const d: any = (ZONE_MOBS as any)[mob.id]; ok(d.bmPctOnly === true, `${mob.id}: флажок «только %»`);
  sess.set("p", [{ id: "p" }, { id: "p", username: "p", world: "arinar", x: X, y: Y, stats: { classId: "warrior" } }]);
  svc.ms.set("p", { sid: "p", pkey: "uid:p", ready: true, zp: { sid: "p", x: X, y: Y, hp: 1e7, maxHp: HP, alive: true, armorRed: 0, lvl: LV }, pub: { lvl: LV }, abilCd: {}, lastAtk: 0 });
  const S = svc.ms.get("p"); const m = z.addMob(mob.id, X - 140, Y); m.elite = elite; m.chief = chief; m.cursed = false; m.ench = 0; // проклятие/ярус мира — свои явные множители (CURSE.mobDmg, ench), здесь без них
  const kMob = mobDmgMul(m);
  const pl = { sid: "p", x: X, y: Y, hp: 1e9, maxHp: HP, armorRed: 0, alive: true, respawnAt: 0, lvl: LV };
  const players = new Map([["p", pl]]); let now = Date.now(); z.now = now; z.pl = players;
  const onHit = (sid: string, dmg: number, src: string, mm: any, bm?: number, how?: string) => {
    const h0 = S.zp.hp; svc.zoneHit("arinar", z, sid, dmg, src, mm, now, bm, how); const got = h0 - S.zp.hp; total++;
    const k = d.dmg > 0 ? dmg / d.dmg : 1, pure = HP * pureOf(d) / 100;
    const decl = bm ? HP * bm / 100 * vsP + pure : HP * d.bdmg / 100 * vsP * k + pure; // заявлено: % × явные множители
    ok(got <= Math.ceil(decl) + 1, `${mob.id}${elite ? " элита+вожак" : ""} ${how}: ${got} > заявленного ${decl.toFixed(1)} (bm ${bm}, k ${k.toFixed(2)})`);
    if (!bm) ok(k <= ATK_MAX * kMob + 1e-6, `${mob.id} ${how}: множитель атаки ×${k.toFixed(2)} больше явных (≤ ${(ATK_MAX * kMob).toFixed(2)})`);
    if (got / HP > worst.pct) worst = { id: mob.id + (elite ? " (элита+вожак)" : ""), pct: got / HP, how: String(how) };
  };
  z.curHit = onHit;
  for (let s = 0; s < 20000; s += 50) { now += 50; pl.x = X; pl.y = Y; S.zp.x = X; S.zp.y = Y; if (m.hp < m.maxHp) m.hp = m.maxHp; z.update(0.05, now, players, onHit, () => {}); }
  z.mobs.splice(z.mobs.indexOf(m), 1);
}
ok(total > 1000, `ударов по игроку за прогон: ${total}`);
ok(worst.pct < 0.5, `худший одиночный удар: ${(worst.pct * 100).toFixed(1)} % ОЗ (${worst.id}, ${worst.how}) — меньше половины ОЗ`);
console.log(`худший удар: ${(worst.pct * 100).toFixed(1)} % от ${HP} ОЗ — ${worst.id} · ${worst.how}; ударов ${total}`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
