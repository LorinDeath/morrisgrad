// t1062u: таблица TTK контента 30.10 — игрок (воин, ур. 10/22/30) с базовым и сильным артефактом против архетипов и логов.
// Урон игрока: настоящие bmHit/bmPure/zone.damage (заряженный удар или частые без заряда — что выгоднее), крит — ожидание мешка.
// Урон по игроку: настоящий ИИ (zone.update → svc.zoneHit) 20 с на моба. Запуск: cd server && bun meta/c30-ttk.ts [out.json]
import { build } from "../../tools/content/gen-1030";
import { MetaService, heroBase } from "./service";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs } from "./blackMobs";
import { BMA_CFG, computeArtifact, capBm, bmHit, bmPure, bmSkillPct } from "./blackArt";
import { ABILITY_BY_ID } from "./defs";
import { heroLevelHp } from "./shared";
import { inCity } from "./city";
import { writeFileSync } from "node:fs";
import "./skillReg";
registerBlackMobs(ITEM_BY_ID as any); const { mobs, lairs } = build();
const NOSK = !!process.env.NOSK;
const svc: any = new MetaService(null, {}); const sess = new Map<string, any>(), acc = new Map<string, any>();
svc.store.account = (pk: string) => (acc.get(pk) || acc.set(pk, {}).get(pk)); svc.send = () => {}; svc.push = () => {};
svc.sessionLookup = (s: string) => sess.get(s) || null; svc.equippedIds = () => []; svc.onMobKilled = () => {};
const z: any = svc.zones.arinar; svc.bmInit(); { const T = process.env.TAKE; if (T != null) for (const mb of mobs) (ZONE_MOBS as any)[mb.id].bmTake = Number(T) === 1 ? undefined : Number(T); } // калибровка: TAKE=… — «получаемый чёрный урон ×» всем c30 (после bmInit — он пересобирает описания)
for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
const c0 = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c0.x + 900, Y = c0.y + 900;
const GEAR: Record<string, (el: string) => Record<string, string>> = {
  basic: (el) => ({ handle: `${el}_handle2`, blade: `${el}_blade_2` }),
  strong: (el) => ({ handle: `${el}_handle5`, blade: `${el}_blade`, blade2: `${el}_blade2_5`, blade3: `${el}_blade3_5`, crystal: `${el}_crystal_5` }),
};
const LV = [10, 22, 30], base = heroBase("warrior");
const art = (g: string, el = "stone") => { const a = computeArtifact(GEAR[g](el)); if (!a) throw new Error("сборка " + g); return { ...a, stats: capBm(a.stats) }; };
const hpOf = (lv: number, st: any) => Math.round((base.maxHp + heroLevelHp(lv) + (st.hp || 0)) * (1 + (st.hpp || 0) / 100));
/** игрок → моб: удары до смерти и секунды */
function kill(mobId: string, chief: boolean, A: any, HP: number) {
  const m = z.addMob(mobId, X + 3000, Y); m.chief = chief; m.elite = false; m.cursed = false; m.ench = 0; m.hp = m.maxHp;
  const cat = svc.bmCat(m), ec = 1 + (A.stats.bcrit / BMA_CFG.bagSize) * (BMA_CFG.critMul - 1);
  const per = (frac: number) => { const h0 = m.hp; const d = bmHit(m.maxHp, cat, A.stats, frac, false, 1) * ec; const pure = bmPure(HP, A.stats, cat, ec, false);
    z.damage(m, "p", d, () => {}, { black: true, pure, el: A.elem } as any, "ba"); const got = h0 - m.hp; m.hp = m.maxHp; m.dead = false; return got; };
  const cdS = Math.max(0.2, A.cd / 1000), chS = Math.max(cdS, A.stats.charge || 1);
  const dC = per(1), dU = per(0), dpsC = dC / chS, dpsU = dU / cdS, useC = dpsC >= dpsU, hitD = useC ? dC : dU, iv = useC ? chS : cdS;
  // навыки артефакта (настоящая формула service: % макс. ОЗ × класс, тот же zone.damage) — каждый по перезарядке
  let skDps = 0; if (!NOSK) for (const sk of A.skills || []) { const ad: any = (ABILITY_BY_ID as any)[sk]; if (!ad?.bm || !(ad.cd > 0)) continue;
    const h0 = m.hp, raw = m.maxHp * bmSkillPct(ad.bm, A.stats.bdmg) / 100 * (BMA_CFG.classMul[cat] ?? 1) * ec;
    z.damage(m, "p", raw, () => {}, { black: true, pure: bmPure(HP, A.stats, cat, Number(BMA_CFG.pureSkill) || 0, false), el: A.elem } as any, "ab"); skDps += (h0 - m.hp) / ad.cd; m.hp = m.maxHp; m.dead = false; }
  const dps = hitD / iv + skDps, sec = dps > 0 ? m.maxHp / dps : Infinity, hits = Math.ceil(sec / iv);
  z.mobs.splice(z.mobs.indexOf(m), 1);
  return { hits, sec, hp: m.maxHp, skShare: dps > 0 ? skDps / dps : 0 };
}
/** моб → игрок: доля ОЗ в секунду (настоящий ИИ 20 с, игрок стоит рядом) */
function incoming(mobId: string, chief: boolean, A: any, HP: number) {
  sess.set("p", [{ id: "p" }, { id: "p", username: "p", world: "arinar", x: X, y: Y, stats: { classId: "warrior" } }]);
  svc.ms.set("p", { sid: "p", pkey: "uid:p", ready: true, zp: { sid: "p", x: X, y: Y, hp: 1e9, maxHp: HP, alive: true, armorRed: 0, bm: { barm: A.stats.barm, bcap: A.stats.bcap } }, pub: {}, abilCd: {}, lastAtk: 0 });
  const S = svc.ms.get("p"); const m = z.addMob(mobId, X - 140, Y); m.chief = chief; m.elite = false; m.cursed = false; m.ench = 0;
  const pl = { sid: "p", x: X, y: Y, hp: 1e9, maxHp: HP, armorRed: 0, alive: true, respawnAt: 0 }; const players = new Map([["p", pl]]);
  let now = Date.now(), tot = 0, mx = 0; z.now = now;
  const onHit = (sid: string, dmg: number, src: string, mm: any, bm?: number, how?: string) => { const h0 = S.zp.hp; svc.zoneHit("arinar", z, sid, dmg, src, mm, now, bm, how); const g = h0 - S.zp.hp; tot += g; if (g > mx) mx = g; };
  z.curHit = onHit; const T = 20000;
  for (let s = 0; s < T; s += 50) { now += 50; pl.x = X; pl.y = Y; S.zp.x = X; S.zp.y = Y; if (m.hp < m.maxHp) m.hp = m.maxHp; z.update(0.05, now, players, onHit, () => {}); }
  z.mobs.splice(z.mobs.indexOf(m), 1);
  return { pps: tot / HP / (T / 1000), maxPct: mx / HP * 100 };
}
const out: any = { arch: [], lairs: [] };
const ARCH = ["glass", "mid", "fort"];
for (const g of ["basic", "strong"]) for (const lv of LV) {
  const A = art(g), HP = hpOf(lv, A.stats);
  const per: Record<string, any> = {};
  for (const mb of mobs) { const k = kill(mb.id, false, A, HP), inc = incoming(mb.id, false, A, HP); per[mb.id] = { ...k, ...inc, arch: mb.tier.arch, role: mb.role }; }
  for (const ar of ARCH) { const L = Object.values(per).filter((r: any) => r.arch === ar) as any[]; const av = (f: (r: any) => number) => L.reduce((a, r) => a + f(r), 0) / L.length;
    out.arch.push({ g, lv, HP, arch: ar, n: L.length, hits: +av((r) => r.hits).toFixed(1), sec: +av((r) => r.sec).toFixed(1), survive: +av((r) => 1 / Math.max(1e-6, r.pps)).toFixed(1), maxHit: +Math.max(...L.map((r) => r.maxPct)).toFixed(1) }); }
  for (const L of lairs) {
    const list: { id: string; chief: boolean }[] = L.chief ? [{ id: L.chief, chief: true }] : []; for (const x of L.mobs) for (let i = 0; i < x.n; i++) list.push({ id: x.mob, chief: false });
    const tk = L.mul?.take || 1, dl = L.mul?.deal || 1; // сложность лагеря (take / deal): линейно по времени убийства и урону по игроку
    const rows = list.map((x) => (x.chief ? { ...kill(x.id, true, A, HP), ...incoming(x.id, true, A, HP) } : per[x.id])).map((r: any) => ({ ...r, sec: r.sec / tk, pps: r.pps * dl }));
    // соло: сначала самых опасных (наибольший урон/с на секунду боя), все в агро сразу
    rows.sort((a: any, b: any) => b.pps / b.sec - a.pps / a.sec);
    let t = 0, taken = 0, alive = rows.reduce((a: number, r: any) => a + r.pps, 0);
    for (const r of rows as any[]) { taken += alive * r.sec; t += r.sec; alive -= r.pps; }
    out.lairs.push({ g, lv, HP, lair: L.id, name: L.name, hard: !!L.hard, n: list.length, clearSec: Math.round(t), takenHp: +taken.toFixed(2), solo: taken < 1 });
  }
}
writeFileSync(process.argv[2] || "/workspace/content-1030/tmp/ttk.json", JSON.stringify(out, null, 1));
for (const r of out.arch) console.log(`${r.g} ур.${r.lv} ОЗ ${r.HP} ${r.arch}: ${r.hits} уд / ${r.sec} с, выживание ${r.survive} с, макс. удар ${r.maxHit}%`);
for (const r of out.lairs) if (r.lv === 22) console.log(`${r.g} ${r.lair}${r.hard ? " [вожак]" : ""} (${r.n}): ${r.clearSec} с, урон ${r.takenHp}×ОЗ ${r.solo ? "соло ✓" : "группа"}`);
