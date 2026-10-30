// Чёрная магия доходит до боя: слепок артефакта (bdmg %, стихия, чистый урон pX, множители) → heroEffective → удар по мобу и по игроку (PK).
// Проверяем: числа удара = формуле из слепка; событие hit/phit несёт стихию (el) и чистый урон (pf/pi/pe) — по ним клиент красит цифры.
// Запуск: cd server && bun meta/bm-values-test.ts
import { MetaService } from "./service";
import { newAccount, newHero } from "./profile";
import { makeArtifact, artInfo } from "./blackArtReg";
import { BP_ELEMS, BMA_CFG, bmHit, bmPure, PURE_KEYS } from "./blackArt";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { inCity } from "./city";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const norm = Object.keys(ZONE_MOBS).find((t) => !(ZONE_MOBS as any)[t].black && !(ZONE_MOBS as any)[t].boss && (ZONE_MOBS as any)[t].lvl >= 5)!;
const origLog = console.log; const quiet = (f: () => any) => { console.log = () => {}; try { return f(); } finally { console.log = origLog; } };
function world(artId: string) {
  const svc: any = quiet(() => new MetaService(null, {})); const sess = new Map<string, any>(), acc = new Map<string, any>(), her = new Map<string, any>();
  svc.store.account = (pk: string) => acc.get(pk); svc.store.hero = (pk: string) => her.get(pk); svc.store.heroMap = (pk: string) => ({ mage: her.get(pk) });
  svc.send = () => {}; svc.push = () => {}; svc.store.audit = () => {}; svc.sessionLookup = (s: string) => sess.get(s) || null;
  const z = svc.zones.arinar; quiet(() => svc.bmInit()); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
  const c = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c.x + 900, Y = c.y + 900;
  const add = (id: string, x: number, art: boolean) => {
    const a: any = newAccount(), h: any = newHero("mage"); h.lvl = 60; a.hero = "mage"; a.pk = id === "a";
    if (art) { a.inv.push({ uid: "u1", id: artId, n: 1, at: 0 }); h.equip.weapon = "u1"; }
    acc.set("uid:" + id, a); her.set("uid:" + id, h);
    sess.set(id, [{ id }, { id, username: id, world: "arinar", x, y: Y, stats: { classId: "mage" } }]);
    svc.ms.set(id, { sid: id, pkey: "uid:" + id, ready: true, zp: { sid: id, x, y: Y, hp: 5000, maxHp: 5000, alive: true, armorRed: 0, lvl: 60 }, abilCd: {}, lastAtk: 0 });
  };
  return { svc, z, X, Y, add, sess };
}
const elOk = (e: any, el: string) => (el === "fire" ? !e.el : e.el === el);
const pureOf = (e: any) => (e.pf || 0) + (e.pi || 0) + Object.values(e.pe || {}).reduce((s: number, v: any) => s + v, 0);
for (const el of BP_ELEMS) for (const ranged of [false, true]) {
  const def = makeArtifact({ handle: `${el}_handle`, blade: ranged ? `${el}_blade_r` : `${el}_blade`, blade2: `${el}_blade2`, blade3: `${el}_blade3`, crystal: `${el}_crystal` });
  const tag = `${el} ${ranged ? "дальний" : "ближний"}`;
  if (!def) { ok(false, `${tag}: артефакт не собран`); continue; }
  const info: any = artInfo(def.id);
  // слепок: усилим bdmg и чистый урон своей стихии ×3 — урон обязан вырасти ровно по слепку
  for (const mul of [1, 3]) {
    const snap = (ITEM_BY_ID as any)[def.id].bm.stats; const keep = { ...snap };
    snap.bdmg = keep.bdmg * mul; const pk = PURE_KEYS[el]; snap[pk] = (keep[pk] || 0) * mul;
    const W = world(def.id); W.add("a", W.X, true); W.add("b", W.X + 70, false);
    const [, sa] = W.sess.get("a"); const eff = W.svc.effective(sa); const st = artInfo(def.id)!.stats as any;
    if (mul === 1) ok(eff.wtype === "artifact" && eff.art?.elem === el && eff.bm && eff.bm.bdmg === st.bdmg && eff.bm[pk] === st[pk] && eff.art.ranged === ranged,
      `${tag}: heroEffective берёт слепок (bdmg ${st.bdmg}%, ${pk} ${st[pk]}%, стихия ${eff.art?.elem}, ${eff.art?.atk?.kind})`);
    // моб
    const m = W.z.addMob(norm, W.X + 60, W.Y, { fixed: true }); m.maxHp = m.hp = 1e6; W.z.events.length = 0;
    W.svc.zoneAttack(null, sa, { tx: W.X + 1500, ty: W.Y, mob: m.id });
    const pl = new Map([...W.svc.ms.values()].map((q: any) => [q.sid, q.zp])); for (let k = 0; k < 30; k++) W.z.updateProjs(0.05, pl);
    const h = W.z.events.find((e: any) => e.k === "hit" && e.id === m.id) as any;
    const cat = W.svc.bmCat(m); const crit = !!W.z.events.find((e: any) => e.k === "crit" && e.id === m.id);
    const expD = Math.round(bmHit(m.maxHp, cat, eff.bm, 0, crit, 1)), expP = Object.values(bmPure(5000, eff.bm, cat, 1, crit)).reduce((s: number, v: any) => s + v, 0);
    ok(h && h.bm === 1 && elOk(h, el) && Math.abs(h.d - (expD + expP)) <= 2 && pureOf(h) === expP && (expP > 0 || !st[pk]),
      `${tag} ×${mul}: по мобу ${h?.d} = ${expD} чёрн. + ${expP} чист. (${JSON.stringify({ el: h?.el, pf: h?.pf, pi: h?.pi, pe: h?.pe })})${crit ? " крит" : ""}`);
    (W as any)[`d${mul}`] = h?.d; (globalThis as any)[`__${el}${ranged}${mul}`] = h?.d;
    // игрок (PK): та же стихия и чистый урон
    m.dead = true; W.svc.ms.get("a").lastAtk = 0; W.z.events.length = 0;
    W.svc.zoneAttack(null, sa, { tx: W.X + 1500, ty: W.Y }); for (let k = 0; k < 30; k++) W.z.updateProjs(0.05, pl);
    const ph = W.z.events.find((e: any) => e.k === "phit" && e.sid === "b") as any;
    const vs = (Number(BMA_CFG.vsPlayer) || 0) * (Number(BMA_CFG.pvpMul) || 0);
    ok(ph && ph.d > 0 && elOk(ph, el) && (vs === 0 || !st[pk] || pureOf(ph) > 0), `${tag} ×${mul}: по игроку phit ${ph?.d} (${JSON.stringify({ el: ph?.el, pf: ph?.pf, pi: ph?.pi, pe: ph?.pe })})`);
    Object.assign(snap, keep);
  }
  const d1 = (globalThis as any)[`__${el}${ranged}1`], d3 = (globalThis as any)[`__${el}${ranged}3`];
  ok(d1 > 0 && d3 > d1 * 2.2, `${tag}: слепок ×3 → урон ×${(d3 / d1).toFixed(2)} (крит может менять)`);
}
console.log(`\nbm-values ${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
