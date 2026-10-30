// Контент 30.10: «ждали vs вышло» по архетипам (стеклянная пушка / середина / крепость) — на НАСТОЯЩИХ мобах генератора.
// Удар (% макс. ОЗ игрока), навык (тот же %, через реальный каст castCraft), «Предельная броня» (пример Алекса) и чёрная броня.
// Запуск: cd server && bun meta/c30-archetype-test.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { build } from "../../tools/content/gen-1030";
import { TIERS } from "../../tools/content/c30-data";
import { MetaService } from "./service";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs } from "./blackMobs";
import { BM_PARTS, BMA_CFG, bmSkillPct } from "./blackArt";
import { ABILITY_BY_ID } from "./shared";
import { SK_DEFS } from "./skillCraft";
import { inCity } from "./city";
import "./skillReg";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
registerBlackMobs(ITEM_BY_ID as any);
const { mobs } = build();
const vsP = Number(BMA_CFG.vsPlayer) || 0, capMin = Number(BMA_CFG.caps.bcap) || 0, mn0 = BMA_CFG.bmMinDmg;
const svc: any = new MetaService(null, {}); const sess = new Map<string, any>(), acc = new Map<string, any>();
svc.store.account = (pk: string) => (acc.get(pk) || acc.set(pk, {}).get(pk)); svc.send = () => {}; svc.push = () => {};
svc.sessionLookup = (s: string) => sess.get(s) || null; svc.equippedIds = () => [];
const z: any = svc.zones.arinar; svc.bmInit(); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
const c0 = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c0.x + 900, Y = c0.y + 900;
const MAXHP = 10000;
function player(lvl: number) {
  sess.set("p", [{ id: "p" }, { id: "p", username: "p", world: "arinar", x: X, y: Y, stats: { classId: "warrior" } }]);
  svc.ms.set("p", { sid: "p", pkey: "uid:p", ready: true, zp: { sid: "p", x: X, y: Y, hp: 1e7, maxHp: MAXHP, alive: true, armorRed: 0, lvl }, pub: { lvl }, abilCd: {}, lastAtk: 0 });
  return svc.ms.get("p");
}
const sumPart = (ids: string[], k: string) => ids.reduce((a, id) => a + (Number(BM_PARTS[id]?.stats?.[k]) || 0), 0);
const rows: string[] = [];
for (const t of TIERS) {
  const mob = mobs.find((m) => m.tier.t === t.t)!; const d: any = (ZONE_MOBS as any)[mob.id]; const P = player(mob.P.lvl);
  const parts = [mob.P["weapon.handle"], mob.P["weapon.blade"], mob.P["weapon.crystal"]];
  const expBd = sumPart(parts, "bdmg"), expCap = t.bcap > 0 ? Math.max(capMin, sumPart(parts, "bcap")) : 0, expArm = sumPart(parts, "barm");
  ok(Math.abs(d.bdmg - expBd) < 1e-9, `${mob.id} [${t.t}]: чёрный урон моба ${d.bdmg} % (ждали ${expBd})`);
  ok(t.bcap ? d.bmDef?.bcap === expCap && Math.abs(d.bmDef.barm - expArm) < 1e-9 : !d.bmDef?.bcap, `${mob.id}: предельная ${d.bmDef?.bcap ?? 0} % / чёрная броня ${d.bmDef?.barm ?? 0} (ждали ${expCap} / ${expArm})`);
  // удар: плоский + bdmg % от 10 000 ОЗ
  const hp0 = P.zp.hp; svc.zoneHit("arinar", z, "p", d.dmg, mob.id, null, Date.now(), undefined, "swing"); const got = hp0 - P.zp.hp;
  const swingExp = Math.round(MAXHP * expBd / 100 * vsP), swingAct = got - (d.bmPctOnly ? 0 : Math.round(d.dmg)); // t1062u: «только %» — плоского урона по игроку нет
  ok(Math.abs(swingAct - swingExp) <= 2, `${mob.id}: удар +${swingAct} сверху плоского (ждали +${swingExp} = ${expBd.toFixed(3)} % × ${MAXHP})`);
  // навык: настоящий каст (телеграф → castCraft), процент на попадание = pct + k × bdmg (× «множитель» формы)
  const sk = SK_DEFS[mob.skill], AD: any = (ABILITY_BY_ID as any)[mob.skill];
  const skExp = sk.dmg === "normal" ? 0 : bmSkillPct(AD.bm, d.bdmg);
  const m = z.addMob(mob.id, X - (sk.form === "proj" || sk.form === "rain" ? 220 : 90), Y); m.skills = []; m.atkCd = 99;
  const pl = { sid: "p", x: X, y: Y, hp: 1e9, maxHp: MAXHP, armorRed: 0, alive: true, respawnAt: 0, lvl: mob.P.lvl };
  const players = new Map([["p", pl]]), hits: any[] = []; let now = Date.now(); z.now = now; z.pl = players;
  const onHit = (sid: string, dmg: number, _s: string, _m: any, bm?: number, how?: string) => hits.push({ sid, dmg, bm, how });
  z.curHit = onHit; z.heroCast(m, d, mob.skill, pl, players, now, 100, 1, 1000, 1, 0);
  for (let s = 0; s < 4000; s += 50) { now += 50; m.atkCd = 99; z.update(0.05, now, players, onHit, () => {}); }
  const sh = hits.filter((h) => h.how === "skill:" + mob.skill);
  const skAct = sh.length && sh[0].bm ? (sh[0].bm * 100) / sh[0].dmg : 0; // bm = pct × mult, dmg = D(100) × mult
  ok(sh.length > 0 && Math.abs(skAct - skExp) < 1e-6, `${mob.id}: навык «${sk.name}» (${sk.form}/${sk.path}) — ${sh.length} попад., % на попадание ${skAct.toFixed(3)} (ждали ${skExp.toFixed(3)})`);
  z.mobs.splice(z.mobs.indexOf(m), 1);
  // защита: удар игрока 1e6 и пример Алекса (моб 100 ОЗ, удар 100)
  (BMA_CFG as any).bmMinDmg = 0;
  const mm = z.addMob(mob.id, X + 300, Y); const mh = mm.maxHp; const big = z.damage(mm, "p", 1e6, () => {}, { black: true });
  const bigExp = expCap ? Math.round(mh * expCap / 100) : mh;
  ok(expCap ? big === bigExp : big >= mh, `${mob.id}: удар 1e6 по ${mh} ОЗ → ${big} (ждали ${expCap ? bigExp : "≥ " + mh})`);
  const ma = z.addMob(mob.id, X + 330, Y); ma.maxHp = 100; ma.hp = 100; const ex = z.damage(ma, "p", 100, () => {}, { black: true });
  const exExp = Math.round(expCap ? Math.min(Math.max(0, 100 - expArm), expCap) : Math.max(0, 100 - expArm));
  ok(ex === exExp, `${mob.id}: пример Алекса — 100 ОЗ, удар 100 → ${ex} (ждали ${exExp})`);
  (BMA_CFG as any).bmMinDmg = mn0;
  rows.push(`| ${t.arch} | ${t.t} | ${mob.P.name} (${mob.id}) | ${expBd.toFixed(3)} / ${d.bdmg.toFixed(3)} | +${swingExp} / +${swingAct} | ${sk.name}: ${skExp.toFixed(2)} / ${skAct.toFixed(2)} | ${expCap || "—"} / ${d.bmDef?.bcap || "—"} | ${expArm} | ${expCap ? bigExp : "все " + mh} / ${big} | ${exExp} / ${ex} |`);
}
// все 50 навыков: каждый настоящим кастом своего моба попадает по игроку, КД в рамках (ближ. 10–15, дальн. 10–20)
import { SKILLS, skId, isRangedBlade } from "../../tools/content/c30-data";
import { MOB_SKILLS } from "./mobSkills";
const skRows: string[] = [];
for (const r of SKILLS) {
  const id = skId(r), sk = SK_DEFS[id], mob = mobs.find((m) => m.skill === id)!; const d: any = (ZONE_MOBS as any)[mob.id];
  const rng = isRangedBlade(r[0]); const cd = MOB_SKILLS[id]?.cd;
  ok(rng ? cd >= 10 && cd <= 20 : cd >= 10 && cd <= 15, `${id}: КД у моба ${cd} с (${rng ? "дальний" : "ближний"})`);
  const dist = sk.form === "proj" ? Math.min(300, (sk.path === "boomerang" ? sk.range / 2 : sk.range) * 0.85) : sk.form === "rain" ? 200 : sk.form === "dash" ? Math.min(160, sk.len * 0.6) : sk.form === "nova" ? Math.min(80, (sk.r || 100) * 0.5) : Math.min(90, sk.len * 0.5);
  const m = z.addMob(mob.id, X - dist, Y); m.skills = []; m.atkCd = 99;
  const pl = { sid: "p", x: X, y: Y, hp: 1e9, maxHp: MAXHP, armorRed: 0, alive: true, respawnAt: 0, lvl: mob.P.lvl };
  const players = new Map([["p", pl]]), hits: any[] = []; let now = Date.now(); z.now = now; z.pl = players; z.events.length = 0;
  const onHit = (sid: string, dmg: number, _s: string, _m: any, bm?: number, how?: string) => hits.push({ dmg, bm, how });
  z.curHit = onHit; z.heroCast(m, d, id, pl, players, now, 100, 1, 1000, 1, 0);
  for (let s = 0; s < 5000; s += 50) { now += 50; m.atkCd = 99; pl.x = X; pl.y = Y; z.update(0.05, now, players, onHit, () => {}); }
  const sh = hits.filter((h) => h.how === "skill:" + id), sum = sh.reduce((a, h) => a + (h.bm || 0), 0);
  ok(sh.length > 0, `${id} «${sk.name}» ${sk.form}/${sk.path}: ${sh.length} попад. с ${Math.round(dist)} px, итого ${sum.toFixed(2)} % ОЗ`);
  skRows.push(`| ${sk.name} | ${r[0]} | ${sk.form} | ${sk.path} | ${cd} | ${mob.P.name} | ${sh.length} | ${sum.toFixed(2)} |`);
  z.mobs.splice(z.mobs.indexOf(m), 1);
}
writeFileSync("/workspace/content-1030/sql/skills.md", ["| навык | лезвие | форма | путь | КД, с | моб | попаданий | % ОЗ за каст |", "|---|---|---|---|---|---|---|---|", ...skRows].join("\n") + "\n");
mkdirSync("/workspace/content-1030/sql", { recursive: true });
writeFileSync("/workspace/content-1030/sql/archetypes.md", ["| архетип | ядро | моб | чёрный урон %, ждали/вышло | удар по 10 000 ОЗ сверху плоского, ждали/вышло | навык: % на попадание, ждали/вышло | предельная %, ждали/вышло | чёрная броня | удар 1e6, ждали/вышло | пример Алекса (100 ОЗ, удар 100), ждали/вышло |", "|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n") + "\n");
console.log(`\n${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
