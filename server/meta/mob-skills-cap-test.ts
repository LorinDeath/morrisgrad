// Навыки боссов (случайные 1–3 / мировые 5–10, админка «☠ Проклятие») и предел силы навыка героя (был жёсткий ×4).
// bun server/meta/mob-skills-cap-test.ts
import { Zone, type ZPlayer } from "./zone";
import { ZONE_MOBS } from "./defs";
import { CURSE, skillPowerMult } from "./cursed";
import { validatePatch, applyOverride } from "./overrides";
import { Pvp, DUEL_COUNTDOWN_MS } from "./pvp";
import { ZONE_GEN } from "./zoneGen";
import { ENCH } from "./enchant";
ENCH.on = false; // счёт навыков — без случайного зачарования (свои навыки ярусов — enchant-test)
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const P = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0 } as any);
const bosses = Object.keys(ZONE_MOBS).filter((k) => ZONE_MOBS[k].boss), small = Object.keys(ZONE_MOBS).find((k) => !ZONE_MOBS[k].boss && ZONE_MOBS[k].size === "s")!;
const pct0 = ZONE_GEN.cursedPct;
{ // счёт навыков по видам мобов (без проклятия)
  ZONE_GEN.cursedPct = 0;
  const z: any = new Zone("arinar", [], [], { proc: false });
  const cnt = (special: string, type: string, n = 60) => Array.from({ length: n }, () => z.addMob(type, 500, 500, { special }).skills.length);
  const w = bosses.flatMap((b) => cnt("boss", b)), o = bosses.flatMap((b) => cnt("", b)), s = cnt("", small);
  ok(Math.min(...w) === 5 && Math.max(...w) === 10, `мировой босс: ${Math.min(...w)}–${Math.max(...w)} навыков (5–10)`);
  ok(Math.min(...o) === 1 && Math.max(...o) === 3, `обычный босс: ${Math.min(...o)}–${Math.max(...o)} навыков (1–3)`);
  ok(s.every((n) => n === 0), "обычный моб без проклятия — без навыков (как было)");
  const a = z.addMob(bosses[0], 500, 500, { special: "boss" }).skills.join(), b = z.addMob(bosses[0], 500, 500, { special: "boss" }).skills.join();
  ok(a !== b, "набор случайный на каждое появление");
  ok(w.every(Boolean) && z.mobs.every((m: any) => new Set(m.skills).size === m.skills.length), "навыки не повторяются");
  // админка: диапазоны
  const pt = validatePatch("curse", "main", { worldBossSkillsMin: 7, worldBossSkillsMax: 7, bossSkillsMin: 2, bossSkillsMax: 2 }); ok(typeof pt !== "string", "правка диапазонов принимается");
  applyOverride("curse", "main", pt as any);
  ok(cnt("boss", bosses[1], 20).every((n) => n === 7) && cnt("", bosses[1], 20).every((n) => n === 2), "правка диапазонов действует на новых боссов");
  ok(typeof validatePatch("curse", "main", { worldBossSkillsMin: 9, worldBossSkillsMax: 6 }) === "string", "«от» > «до» отклонено");
  applyOverride("curse", "main", null); ok(CURSE.worldBossSkillsMax === 10 && CURSE.bossSkillsMin === 1, "сброс — как в коде");
  // явные навыки в Бестиарии всегда есть и добавляются к случайным
  const t = bosses[2]; applyOverride("mob", t, validatePatch("mob", t, { skills: ["meteor", "pierce"] }) as any);
  const n0 = z.mobs.length; cnt("boss", t, 30); const ws = z.mobs.slice(n0);
  const bad = ws.filter((m: any) => !(m.skills.includes("meteor") && m.skills.includes("pierce") && m.skills.length >= 5)); ok(!bad.length, `мировой: явные + случайные до 5–10 (${ws.length}) ${bad.slice(0, 2).map((m: any) => m.id + ":" + m.skills).join(" | ")}`);
  const live = ws[ws.length - 1], before = live.skills.length;
  applyOverride("mob", t, validatePatch("mob", t, { skills: ["frost_nova"] }) as any); z.syncMobSkills();
  ok(live.skills[0] === "frost_nova" && !live.skills.includes("pierce") && live.skills.length >= before - 1, `правка явных у живого босса: ${live.skills}`);
  applyOverride("mob", t, null); z.syncMobSkills();
  ok(!live.skills.includes("frost_nova") || live.skills.length >= 5, "сброс явных — остаются случайные");
  // проклятые: как раньше (обычный моб: 2–5, всего ≤ 5)
  ZONE_GEN.cursedPct = 100;
  const c = cnt("", small, 200); ok(Math.min(...c) === 2 && Math.max(...c) === 5, `проклятый обычный моб: ${Math.min(...c)}–${Math.max(...c)} (2–5)`);
  const cb = cnt("boss", bosses[0], 60); ok(Math.min(...cb) >= 5 && Math.max(...cb) <= 10, `проклятый мировой босс: ${Math.min(...cb)}–${Math.max(...cb)}`);
  ZONE_GEN.cursedPct = pct0;
}
{ // не проклятый мировой босс действительно кастует свои навыки
  ZONE_GEN.cursedPct = 0;
  const z: any = new Zone("arinar", [], [], { proc: false });
  const m = z.addMob("moon_sentinel", 3000, 3000, { special: "boss" });
  ZONE_GEN.cursedPct = pct0;
  const pm = new Map<string, ZPlayer>([["p", P("p", 3150, 3000)]]); m.targetSid = "p";
  const names = new Set<string>(); const now = Date.now();
  for (let i = 0; i < 400; i++) { z.events = []; z.update(0.1, now + i * 100, pm, () => {}, () => {}); for (const e of z.events) if (e.k === "mskill" && e.id === m.id) names.add(e.name); pm.get("p")!.hp = 1e9; }
  ok(!m.cursed && names.size >= 3, `Безветрие (не проклятое, ${m.skills.length} навыков) за 40 с применило ${names.size}: ${[...names].join(", ")}`);
}
{ // предел силы: ×10 > ×6 > ×4 (раньше всё ×4)
  ok(skillPowerMult(10) === 10 && skillPowerMult(6) === 6 && skillPowerMult(0.2) === 0.6 && skillPowerMult(NaN) === 1, "skillPowerMult без жёсткого ×4");
  applyOverride("curse", "main", validatePatch("curse", "main", { skillPowerCap: 4 }) as any); ok(skillPowerMult(10) === 4, "предел из админки (×4) применяется");
  applyOverride("curse", "main", null);
  ok(typeof validatePatch("curse", "main", { skillPowerCap: 0 }) === "string", "предел < 1 отклонён");
}
{ // дуэль: Огненный шар ×10 бьёт в 2.5 раза сильнее, чем при ×4
  const realNow = Date.now;
  const hit = (power: number) => {
    const ms = new Map<string, any>(), sess = new Map<string, any>(), out: any = {};
    const mk = (id: string) => { const ws: any = { id }; out[id] = []; sess.set(id, [ws, { id, username: id, world: "arinar", x: 300, y: 600, stats: { classId: "mage" } }]); ms.set(id, { pkey: "uid:" + id, ready: true, zp: { hp: 1e7, maxHp: 1e7, alive: true, armorRed: 0 }, abilCd: {}, lastAtk: 0 }); };
    const host: any = { ms, sessionLookup: (sid: string) => sess.get(sid) || null, effective: () => ({ level: 20, wtype: "staff", weaponMin: 10, weaponMax: 10, dmgPct: 0, critPct: 0, atkSpeedPct: 0, lifestealPct: 0, abilities: [{ id: "fireball", cd: 1, power, props: [] }] }),
      send: (ws: any, o: any) => out[ws.id].push(o), displayName: (s: any) => s.username, recordDuel: async () => {}, duelRecord: async () => ({ w: 0, l: 0, d: 0 }), onWorldChange: () => {}, onPlayersChanged: () => {} };
    const pvp: any = new Pvp(host); mk("a"); mk("b");
    const [wa, sa] = sess.get("a"), [wb, sb] = sess.get("b");
    pvp.challenge(wa, sa, { sid: "b" }); pvp.respond(wb, sb, { from: "a", accept: true });
    const t0 = realNow(); pvp.tick(t0 + DUEL_COUNTDOWN_MS + 10); (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20;
    sa.x = 300; sa.y = 400; sb.x = 420; sb.y = 400;
    pvp.ability(wa, sa, { id: "fireball", dx: 1, dy: 0 });
    for (let k = 0; k <= 40; k++) { (Date as any).now = () => t0 + DUEL_COUNTDOWN_MS + 20 + k * 50; pvp.tick(t0 + DUEL_COUNTDOWN_MS + 20 + k * 50); }
    (Date as any).now = realNow; return 1e7 - ms.get("b").zp.hp;
  };
  const d4 = hit(4), d6 = hit(6), d10 = hit(10);
  ok(d4 > 0 && Math.abs(d10 / d4 - 2.5) < 0.15 && Math.abs(d6 / d4 - 1.5) < 0.1, `дуэль: Огненный шар ×4 → ${Math.round(d4)}, ×6 → ${Math.round(d6)}, ×10 → ${Math.round(d10)} (×${(d10 / d4).toFixed(2)})`);
}
console.log(f ? `FAILED ${f}` : "mob-skills-cap ok"); if (f) process.exit(1);
