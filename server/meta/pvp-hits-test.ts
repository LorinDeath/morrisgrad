// PvP: удары игрока по игроку попадают — дуэль (арена) и PK в Аринаре, каждое оружие (ближнее/дальнее), курсор ДАЛЕКО за целью.
// Снаряды вылетают от героя (не от курсора). Запуск: cd server && bun meta/pvp-hits-test.ts
import { Pvp, DUEL_COUNTDOWN_MS } from "./pvp";
import { MetaService } from "./service";
import { WEAPON_TYPES } from "./defs";
import { inCity } from "./city";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const realNow = Date.now;
const eff = (wt: string) => ({ level: 10, wtype: wt, weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [] });
// ---------- дуэль ----------
for (const wt of Object.keys(WEAPON_TYPES)) {
  const A: any = (WEAPON_TYPES as any)[wt].atk; const dist = Math.round((A.kind === "arc" ? A.range * 0.6 : A.range * 0.7));
  const out: Record<string, any[]> = { a: [], b: [] }, ms = new Map<string, any>(), sess = new Map<string, any>();
  for (const id of ["a", "b"]) { const ws: any = { id }; sess.set(id, [ws, { id, username: id, world: "arinar", x: 300, y: 600, stats: { classId: "warrior" } }]); ms.set(id, { pkey: "uid:" + id, ready: true, zp: { hp: 1000, maxHp: 1000, alive: true, armorRed: 0 }, abilCd: {}, lastAtk: 0 }); }
  const host: any = { ms, sessionLookup: (s: string) => sess.get(s) || null, effective: () => eff(wt), send: (ws: any, o: any) => out[ws.id].push(o), displayName: (s: any) => s.username,
    recordDuel: async () => {}, duelRecord: async () => ({ w: 0, l: 0, d: 0 }), onWorldChange: () => {}, onPlayersChanged: () => {} };
  const pvp = new Pvp(host); const [wa, sa] = sess.get("a"), [wb, sb] = sess.get("b");
  pvp.challenge(wa, sa, { sid: "b" }); pvp.respond(wb, sb, { from: "a", accept: true });
  let t = realNow() + DUEL_COUNTDOWN_MS + 20; pvp.tick(t - 10); (Date as any).now = () => t;
  sa.x = 600; sa.y = 600; sb.x = 600 + dist; sb.y = 600;
  // курсор в 1500 px за соперником, клиент «подделал» вылет = курсор → сервер стреляет от героя
  pvp.attack(wa, sa, { tx: sa.x + 1500, ty: sa.y, ox: sa.x + 1500, oy: sa.y });
  for (let k = 0; k < 40; k++) { t += 50; pvp.tick(t); }
  const hp = ms.get("b").zp.hp; const shots = out.a.flatMap((o) => (o.ev || o.events || []) as any[]).filter((e) => e && (e.k === "shot" || e.k === "proj" || e.k === "dproj"));
  const fromHero = shots.every((e) => Math.hypot((e.x ?? sa.x) - 600, (e.y ?? sa.y) - 600) <= 48);
  ok(hp < 1000 && fromHero, `дуэль ${wt} (${A.kind}, ${dist}px, курсор в 1500px): попадание (ОЗ 1000→${Math.round(hp)}), вылет от героя (${shots.length} соб.)`);
  (Date as any).now = realNow;
}
// ---------- PK в Аринаре (MetaService: zoneAttack → дуга pvpArc / снаряд pv → guard.pvpHit → pvpStrike) ----------
for (const wt of Object.keys(WEAPON_TYPES)) {
  const A: any = (WEAPON_TYPES as any)[wt].atk; const dist = Math.round((A.kind === "arc" ? A.range * 0.6 : A.range * 0.7));
  const svc: any = new MetaService(null, {}); const sess = new Map<string, any>(); const acc = new Map<string, any>();
  svc.store.account = (pk: string) => (acc.get(pk) || acc.set(pk, { pk: pk === "uid:a" }).get(pk)); svc.send = () => {}; svc.push = () => {};
  svc.sessionLookup = (s: string) => sess.get(s) || null; svc.effective = () => eff(wt); svc.equippedIds = () => [];
  const z = svc.zones.arinar; svc.bmInit(); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
  const c = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000) && !inCity(cc.x, cc.y)); const X = c.x + 900, Y = c.y + 900;
  for (const [id, x] of [["a", X], ["b", X + dist]] as [string, number][]) {
    sess.set(id, [{ id }, { id, username: id, world: "arinar", x, y: Y, stats: { classId: "warrior" } }]);
    svc.ms.set(id, { sid: id, pkey: "uid:" + id, ready: true, zp: { sid: id, x, y: Y, hp: 1000, maxHp: 1000, alive: true, armorRed: 0, lvl: 10 }, abilCd: {}, lastAtk: 0 });
  }
  if (svc.pvpSafe("b", svc.ms.get("b"))) { ok(false, `PK ${wt}: точка теста — безопасная зона`); continue; }
  const [, sa] = sess.get("a"); z.events.length = 0;
  svc.zoneAttack(null, sa, { tx: sa.x + 1500, ty: sa.y, ox: sa.x + 1500, oy: sa.y });
  const pl = new Map([...svc.ms.values()].map((m: any) => [m.sid, m.zp]));
  const pr = z.projs.filter((p: any) => p.pv); const fromHero = pr.every((p: any) => Math.hypot(p.x - X, p.y - Y) <= 48);
  for (let k = 0; k < 40; k++) z.updateProjs(0.05, pl);
  const hp = svc.ms.get("b").zp.hp; const ph = z.events.filter((e: any) => e.k === "phit" && e.sid === "b" && e.src === "pvp");
  ok(hp < 1000 && ph.length > 0 && fromHero, `PK ${wt} (${A.kind}, ${dist}px, курсор в 1500px): попадание (ОЗ 1000→${Math.round(hp)}, phit ×${ph.length}), снаряды от героя (${pr.length})`);
}
console.log(`\npvp-hits ${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
