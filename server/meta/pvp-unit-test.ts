// Юнит-тест дуэли без сервера: таймаут 3 мин (больший % ОЗ побеждает, равенство — ничья), стек дуэлей.
// esbuild pvp-unit-test.ts --bundle --platform=node --format=esm --outfile=/tmp/pvpu.mjs && node /tmp/pvpu.mjs
import { Pvp, DUEL_COUNTDOWN_MS, DUEL_FIGHT_MS } from "./pvp";
import { TRAITS } from "./overrides";
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
function world() {
  const out: Record<string, any[]> = {};
  const ms = new Map<string, any>(), sess = new Map<string, any>();
  const mk = (id: string, pkey: string) => {
    const ws: any = { id }; out[id] = [];
    sess.set(id, [ws, { id, username: id, world: "arinar", x: 300, y: 600, stats: { classId: "warrior" } }]);
    ms.set(id, { pkey, ready: true, zp: { hp: 100, maxHp: 100, alive: true, armorRed: 0 }, abilCd: {}, lastAtk: 0 });
  };
  const recs: any[] = [];
  const host: any = {
    ms, sessionLookup: (sid: string) => sess.get(sid) || null,
    effective: () => ({ level: 5, wtype: "sword", weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [] }),
    send: (ws: any, o: any) => out[ws.id].push(o), displayName: (s: any) => s.username,
    recordDuel: async (_d: any, w: any, reason: string) => { recs.push({ w, reason }); }, duelRecord: async () => ({ w: 0, l: 0, d: 0 }),
    onWorldChange: () => {}, onPlayersChanged: () => {},
  };
  return { out, ms, sess, mk, recs, pvp: new Pvp(host) };
}
const realNow = Date.now;
{ // черты админ-панели работают и в дуэли: вампиризм 100% лечит, заморозка 100% блокирует ответный удар
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b");
  TRAITS.weapon.sword = [{ k: "lifesteal", chance: 100, pct: 50 } as any, { k: "freeze", chance: 100, dur: 1 } as any];
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b");
  w.pvp.challenge(wa, sa, { sid: "b" }); w.pvp.respond(wb, sb, { from: "a", accept: true });
  const t0 = Date.now(); w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10);
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20;
  sa.x = 300; sa.y = 400; sb.x = 340; sb.y = 400;
  w.ms.get("a").zp.hp = 50;
  w.pvp.attack(wa, sa, { dx: 1, dy: 0 });
  const healed = w.ms.get("a").zp.hp, bHp = w.ms.get("b").zp.hp;
  const aBefore = w.ms.get("a").zp.hp; w.pvp.attack(wb, sb, { dx: -1, dy: 0 }); // b заморожен → удар не проходит
  ok(bHp < 100 && healed > 50, `duel traits: lifesteal heals attacker (${50}→${Math.round(healed)}), b hp ${Math.round(bHp)}`);
  ok(w.ms.get("a").zp.hp === aBefore, "duel traits: frozen opponent cannot attack");
  (Date as any).now = realNow; delete TRAITS.weapon.sword;
}
{ // пассивный вампиризм (lifestealPct) работает и с навыков в дуэли
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b");
  (w as any).pvp.host.effective = () => ({ level: 5, wtype: "sword", weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 50, abilities: [{ id: "pierce", cd: 1, power: 1, props: [] }] });
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b");
  w.pvp.challenge(wa, sa, { sid: "b" }); w.pvp.respond(wb, sb, { from: "a", accept: true });
  const t0 = Date.now(); w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10);
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20;
  sa.x = 300; sa.y = 400; sb.x = 450; sb.y = 400; w.ms.get("a").zp.hp = 20;
  (w.pvp as any).ability(wa, sa, { id: "pierce", dx: 1, dy: 0 });
  for (let k = 0; k <= 12; k++) w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 20 + k * 50);
  const bHp = w.ms.get("b").zp.hp, aHp = w.ms.get("a").zp.hp;
  ok(bHp < 100 && aHp > 20, `duel skill: passive lifesteal heals (20→${Math.round(aHp)}, b ${Math.round(bHp)})`);
  (Date as any).now = realNow;
}
{ // навыки в дуэли — направленные (те же формы, что в мире): «Пронзание» назад мимо, вперёд — попадание
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b");
  w.ms.get("a"); (w as any).pvp.host.effective = () => ({ level: 5, wtype: "sword", weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [{ id: "pierce", cd: 1, power: 1, props: [] }] });
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b");
  w.pvp.challenge(wa, sa, { sid: "b" }); w.pvp.respond(wb, sb, { from: "a", accept: true });
  const t0 = Date.now(); w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10);
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20;
  sa.x = 300; sa.y = 400; sb.x = 450; sb.y = 400;
  const fly = (t: number) => { for (let k = 0; k <= 12; k++) w.pvp.tick(t + k * 50); }; // снаряды дуэли летят в тике
  w.pvp.ability(wa, sa, { id: "pierce", dx: -1, dy: 0 }); fly(t0 + DUEL_COUNTDOWN_MS + 20);
  const hp1 = w.ms.get("b").zp.hp;
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 3000;
  w.pvp.ability(wa, sa, { id: "pierce", dx: 1, dy: 0 }); const hpNow = w.ms.get("b").zp.hp; fly(t0 + DUEL_COUNTDOWN_MS + 3000);
  const hp2 = w.ms.get("b").zp.hp;
  ok(hpNow === 100 && hp2 < 100, `duel projectile: no instant damage (${100 - hpNow}), damage on contact (${100 - hp2})`);
  (Date as any).now = realNow;
  ok(hp1 === 100 && hp2 < 100, `duel skill is directional: backwards ${100 - hp1} dmg, forwards ${100 - hp2} dmg`);
}
for (const [hpA, hpB, exp] of [[80, 40, 0], [30, 90, 1], [55, 55, null]] as const) {
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b");
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b");
  w.pvp.challenge(wa, sa, { sid: "b" });
  w.pvp.respond(wb, sb, { from: "a", accept: true });
  ok(w.pvp.inDuel("a") && w.pvp.inDuel("b") && sa.world === "arena", "duel started");
  const t0 = Date.now();
  w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10);
  w.ms.get("a").zp.hp = hpA; w.ms.get("b").zp.hp = hpB;
  w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + DUEL_FIGHT_MS + 50);
  await new Promise((r) => setTimeout(r, 10));
  const ea = w.out.a.find((m) => m.type === "pvp_end"), eb = w.out.b.find((m) => m.type === "pvp_end");
  const want = exp === null ? ["draw", "draw"] : exp === 0 ? ["win", "loss"] : ["loss", "win"];
  ok(ea?.result === want[0] && eb?.result === want[1] && ea.reason === "timeout" && w.recs[0]?.w === exp, `timeout ${hpA}% vs ${hpB}% → ${want.join("/")}`);
  ok(sa.world === "arinar" && sb.world === "arinar" && w.ms.get("a").zp.hp === 100 && w.ms.get("b").zp.hp === 100 && !w.pvp.inDuel("a"), "after timeout: Arinar, full HP");
}
// стек: участник дуэли не принимает второй вызов, третий не вызывает занятого
{
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b"); w.mk("c", "uid:c");
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b"), [wc, sc] = w.sess.get("c");
  w.pvp.challenge(wc, sc, { sid: "b" }); // c → b ждёт
  w.pvp.challenge(wa, sa, { sid: "b" }); // b занят приглашением
  ok(w.out.a.some((m) => m.type === "duel_err"), "second invite to busy target refused");
  w.pvp.respond(wb, sb, { from: "c", accept: true });
  w.pvp.challenge(wa, sa, { sid: "c" });
  ok(w.out.a.filter((m) => m.type === "duel_err").length === 2, "cannot challenge a duelist");
  // тот же аккаунт в двух вкладках — нельзя
  w.mk("a2", "uid:a"); const [wa2, sa2] = w.sess.get("a2");
  w.pvp.challenge(wa2, sa2, { sid: "a" });
  ok(w.out.a2.some((m) => m.type === "duel_err" && /самого себя/.test(m.message)), "same account (two tabs) cannot duel itself");
}
{ // дуэль: от стрелы можно увернуться (снаряд сервера), стоящего — бьёт
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b");
  (w as any).pvp.host.effective = () => ({ level: 5, wtype: "bow", weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [] });
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b");
  w.pvp.challenge(wa, sa, { sid: "b" }); w.pvp.respond(wb, sb, { from: "a", accept: true });
  const t0 = Date.now(); w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10);
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20;
  sa.x = 300; sa.y = 400; sb.x = 520; sb.y = 400;
  w.pvp.attack(wa, sa, { dx: 1, dy: 0 }); sb.y = 520; // ушёл с линии
  for (let k = 0; k <= 12; k++) w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 20 + k * 50);
  const dodged = w.ms.get("b").zp.hp; sb.y = 400;
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 3000;
  w.pvp.attack(wa, sa, { dx: 1, dy: 0 });
  for (let k = 0; k <= 12; k++) w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 3000 + k * 50);
  (Date as any).now = realNow;
  ok(dodged === 100 && w.ms.get("b").zp.hp < 100, `duel arrow: dodged → ${100 - dodged} dmg, standing → ${100 - w.ms.get("b").zp.hp} dmg`);
}
{ // дуэль = открытый мир: заморозка навыка (frost_nova), статус оружия (гримуар — поджог, тики DoT)
  const w = world(); w.mk("a", "uid:a"); w.mk("b", "uid:b");
  (w as any).pvp.host.effective = () => ({ level: 5, wtype: "book", weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [{ id: "frost_nova", cd: 1, power: 1, props: [] }] });
  const [wa, sa] = w.sess.get("a"), [wb, sb] = w.sess.get("b");
  w.pvp.challenge(wa, sa, { sid: "b" }); w.pvp.respond(wb, sb, { from: "a", accept: true });
  const t0 = Date.now(); w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10);
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20;
  sa.x = 300; sa.y = 400; sb.x = 400; sb.y = 400;
  const evs: any[] = []; const st0 = (w.pvp as any).status.bind(w.pvp); (w.pvp as any).status = (c: any, ss: any, st: any) => { if (st.freeze) evs.push({ k: "pstatus", s: "freeze" }); if (st.slow) evs.push({ k: "pstatus", s: "slow" }); if (st.kind) evs.push({ k: "pstatus", s: st.kind }); return st0(c, ss, st); };
  w.pvp.ability(wa, sa, { id: "frost_nova", dx: 1, dy: 0 });
  const frozen = (w.ms.get("b").slowUntil || 0) > Date.now() || evs.some((e) => e.s === "slow"); // Ледяная нова = как в забеге: замедление
  (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 3000;
  w.pvp.attack(wa, sa, { dx: 1, dy: 0 }); for (let k = 0; k <= 10; k++) w.pvp.tick(t0 + DUEL_COUNTDOWN_MS + 3000 + k * 50);
  (Date as any).now = realNow;
  ok(frozen && evs.some((e) => e.k === "pstatus" && e.s === "slow") && !evs.some((e) => e.k === "pstatus" && e.s === "burn"), `duel statuses like open world: slow from frost_nova (${frozen}); plain grimoire no longer burns (status only from item traits)`);
}
Date.now = realNow;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
