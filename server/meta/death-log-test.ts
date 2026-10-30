// «Последние смерти»: кольцо ударов (кто/чем/сколько/% ОЗ) пишется во ВСЕХ путях урона по герою и снимается при гибели.
// Моб (ближний/снаряд/каст/чёрный со стихией и чистым), PK, Чёрный маг (окружение), дуэль (нокаут + DoT). Запуск: cd server && bun meta/death-log-test.ts
import { MetaService } from "./service";
import { Pvp, DUEL_COUNTDOWN_MS } from "./pvp";
import { WEAPON_TYPES } from "./defs";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs } from "./blackMobs";
import { inCity } from "./city";
import { dlHit, dlDeath, dlList, dlReset, DL_HITS, DL_DEATHS } from "./deathLog";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const realNow = Date.now;
// ---------- модуль ----------
{ dlReset(); const ms: any = { pkey: "uid:u", zp: { maxHp: 1000 } }; const t0 = 1e12;
  for (let i = 0; i < 40; i++) dlHit(ms, t0 + i * 100, "m", "imp", "melee", 10 + i);
  ok(ms.dlog.length === DL_HITS && ms.dlog[0].d === 10 + 40 - DL_HITS, `кольцо: хранит последние ${DL_HITS} ударов`);
  dlHit(ms, t0, "m", "imp", "melee", 0); ok(ms.dlog.length === DL_HITS, "удар 0 не пишется");
  ms.dlog[0].t = t0 - 60_000; const r = dlDeath(ms, t0 + 4000, "arinar")!;
  ok(r.hits.length === DL_HITS - 1 && r.mx === 1000 && ms.dlog.length === 0, "смерть: окно 30 с, макс. ОЗ, кольцо очищено");
  for (let i = 0; i < 9; i++) dlDeath(ms, t0 + i, "arinar"); ok(dlList("uid:u").length === DL_DEATHS, `хранится ${DL_DEATHS} смертей`);
  const N = 1_000_000, a = performance.now(); for (let i = 0; i < N; i++) dlHit(ms, t0 + i, "m", "imp", "melee", 5, { el: "water", p: 1 }); const us = (performance.now() - a) * 1000 / N;
  ok(us < 2, `перф: запись удара ${us.toFixed(3)} мкс`); dlReset(); }
// ---------- мир (MetaService) ----------
function world() {
  const svc: any = new MetaService(null, {}); const sess = new Map<string, any>(), acc = new Map<string, any>(), sent: any[] = [];
  svc.store.account = (pk: string) => (acc.get(pk) || acc.set(pk, { pk: pk === "uid:a" }).get(pk)); svc.send = (ws: any, o: any) => sent.push({ to: ws?.id, ...o }); svc.push = () => {};
  svc.sessionLookup = (s: string) => sess.get(s) || null; svc.equippedIds = () => [];
  svc.effective = () => ({ level: 10, wtype: "sword", weaponMin: 40, weaponMax: 40, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [] });
  const z = svc.zones.arinar; svc.bmInit(); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
  const c = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c.x + 900, Y = c.y + 900;
  for (const [id, x] of [["a", X], ["b", X + 50]] as [string, number][]) {
    sess.set(id, [{ id }, { id, username: id === "a" ? "Разбойник" : "Жертва", world: "arinar", x, y: Y, stats: { classId: "warrior" } }]);
    svc.ms.set(id, { sid: id, pkey: "uid:" + id, ready: true, zp: { sid: id, x, y: Y, hp: 300, maxHp: 300, alive: true, armorRed: 0, lvl: 10 }, pub: { lvl: 10 }, abilCd: {}, lastAtk: 0 });
  }
  return { svc, z, sent, X, Y };
}
{ dlReset(); const W = world(), b = W.svc.ms.get("b"), now = realNow();
  const bk = Object.keys(ZONE_MOBS).find((k) => (ZONE_MOBS as any)[k].black && (ZONE_MOBS as any)[k].bmPure && (ZONE_MOBS as any)[k].elem && (ZONE_MOBS as any)[k].elem !== "fire") || Object.keys(ZONE_MOBS).find((k) => (ZONE_MOBS as any)[k].black && (ZONE_MOBS as any)[k].elem === "water") || Object.keys(ZONE_MOBS).find((k) => (ZONE_MOBS as any)[k].black)!;
  const norm = Object.keys(ZONE_MOBS).find((k) => !(ZONE_MOBS as any)[k].black && !(ZONE_MOBS as any)[k].boss)!;
  W.svc.zoneHit("arinar", W.z, "b", 40, norm, null, now, undefined, "melee");
  W.svc.zoneHit("arinar", W.z, "b", 40, norm, null, now + 10, undefined, "proj:fireball");
  W.svc.zoneHit("arinar", W.z, "b", 40, norm, null, now + 20, undefined, "cast:meteor");
  const bm = W.z.addMob(bk, W.X + 120, W.Y, { fixed: true });
  for (let i = 0; i < 40 && b.zp.alive; i++) W.svc.zoneHit("arinar", W.z, "b", 60, bk, bm, now + 30 + i, 40, "swing");
  const L = dlList("uid:b"), r = L[0];
  ok(!b.zp.alive && r && r.world === "arinar" && r.mx === 300, `моб убил героя → запись смерти (${r?.hits.length} ударов)`);
  const hs = r?.hits || [];
  ok(hs.some((h) => h.k === "m" && h.w === norm && h.h === "melee") && hs.some((h) => h.h === "proj:fireball") && hs.some((h) => h.h === "cast:meteor"), "ближний / снаряд / каст моба — в записи");
  const bh = hs.filter((h) => h.w === bk); const md: any = (ZONE_MOBS as any)[bk];
  ok(bh.length > 0 && bh.every((h) => h.b === 1 && h.el === (md.elem || "fire") && h.h === "swing"), `чёрный моб ${bk}: b=1, стихия ${md.elem || "fire"}${md.bmPure ? ", чистый " + bh[0]?.p : ""}`);
  ok(!md.bmPure || bh.some((h) => (h.p || 0) > 0), "чистый урон чёрного моба отмечен (p)");
  ok(W.sent.some((s) => s.to === "b" && s.type === "death_log" && s.fresh && s.list?.length === 1), "герою ушёл death_log сразу при гибели");
  const sum = hs.reduce((s, h) => s + h.d, 0); ok(sum >= 300, `сумма ударов ${sum} ≥ макс. ОЗ 300`); }
{ dlReset(); const W = world(), b = W.svc.ms.get("b"); const [, sa] = W.svc.sessionLookup("a"); b.zp.hp = 90;
  let t = realNow(); for (let i = 0; i < 20 && b.zp.alive; i++) { (Date as any).now = () => t; W.svc.ms.get("a").lastAtk = 0; W.svc.zoneAttack(null, sa, { tx: b.zp.x, ty: b.zp.y }); t += 2000; } (Date as any).now = realNow;
  const r = dlList("uid:b")[0];
  ok(!b.zp.alive && r && r.hits.length > 0 && r.hits.every((h) => h.k === "p" && h.w === "Разбойник" && (h.h === "pvp" || h.h === "pvp_r")), `PK: убийца-игрок в записи (${r?.hits.map((h) => h.d).join("+")})`); }
{ dlReset(); const W = world(), b = W.svc.ms.get("b");
  for (let i = 0; i < 10 && b.zp.alive; i++) W.svc.bmHurt("b", 40, i % 2 ? "expl" : "arrow", 0);
  const r = dlList("uid:b")[0];
  ok(!b.zp.alive && r && r.hits.every((h) => h.k === "e" && h.w === "black_mage") && r.hits.some((h) => h.h === "expl") && r.hits.some((h) => h.h === "arrow"), `Чёрный маг (окружение): стрелы и взрывы (${r?.hits.length})`); }
// ---------- дуэль: нокаут ----------
{ dlReset(); const out: Record<string, any[]> = { a: [], b: [] }, ms = new Map<string, any>(), sess = new Map<string, any>();
  for (const id of ["a", "b"]) { const ws: any = { id }; sess.set(id, [ws, { id, username: id === "a" ? "Дуэлянт" : "b", world: "arinar", x: 300, y: 600, stats: { classId: "warrior" } }]); ms.set(id, { pkey: "uid:" + id, ready: true, zp: { hp: 1000, maxHp: 1000, alive: true, armorRed: 0 }, abilCd: {} }); }
  const eff = { level: 10, wtype: "sword", weaponMin: 400, weaponMax: 400, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [] };
  const host: any = { ms, sessionLookup: (s: string) => sess.get(s) || null, effective: () => eff, send: (ws: any, o: any) => out[ws.id].push(o), displayName: (s: any) => s.username,
    recordDuel: async () => {}, duelRecord: async () => ({ w: 0, l: 0, d: 0 }), onWorldChange: () => {}, onPlayersChanged: () => {} };
  const pvp = new Pvp(host); const [wa, sa] = sess.get("a"), [wb, sb] = sess.get("b");
  pvp.challenge(wa, sa, { sid: "b" }); pvp.respond(wb, sb, { from: "a", accept: true });
  let t = realNow() + DUEL_COUNTDOWN_MS + 20; pvp.tick(t - 10); (Date as any).now = () => t;
  sa.x = 600; sa.y = 600; sb.x = 600 + Math.round((WEAPON_TYPES as any).sword.atk.range * 0.6); sb.y = 600;
  const bx = sb.x; for (let i = 0; i < 30; i++) { sa.x = 600; sa.y = 600; sb.x = bx; sb.y = 600; pvp.attack(wa, sa, { tx: sb.x, ty: sb.y }); t += 1500; pvp.tick(t); }
  (Date as any).now = realNow;
  const r = dlList("uid:b")[0], m = out.b.find((o) => o.type === "death_log");
  ok(r && r.duel === 1 && r.hits.length > 0 && r.hits.every((h) => h.k === "p" && h.w === "Дуэлянт" && h.h.startsWith("d")) && m, `дуэль: нокаут → запись (duel), ${r?.hits.length} ударов`);
  ok(!dlList("uid:a").length, "победителю дуэли смерть не пишется"); }
console.log(`\ndeath-log ${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
