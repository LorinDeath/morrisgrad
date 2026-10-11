// Юнит-тесты процедурного спавна и атаки по направлению (без сети).
// Запуск: esbuild server/meta/zone-test.ts --bundle --platform=node --outfile=/tmp/zt.js && node /tmp/zt.js
import { Zone, type ZPlayer } from "./zone";
import { ZONE_GEN, REGIONS, SAFE_ZONES, genNodes, inSafe, regionAt } from "./zoneGen";
import { WEAPON_TYPES, ZONE_MOBS } from "./defs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const P = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0 });
const noop = () => {};

// 1. детерминированные узлы ресурсов
const a = genNodes(ZONE_GEN.seed), b = genNodes(ZONE_GEN.seed), c = genNodes(12345);
ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), `genNodes deterministic per seed (${a.length} nodes, other seed differs)`);
ok(a.every((n) => !inSafe(n.x, n.y) && regionAt(n.x, n.y)), "nodes inside regions and outside safe zones");
let minNode = Infinity;
for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) minNode = Math.min(minNode, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y));
ok(minNode >= ZONE_GEN.nodeMinDist - 1, `node min distance ${minNode.toFixed(0)} ≥ ${ZONE_GEN.nodeMinDist}`);

// 2. спавн: капы, безопасные зоны, дистанция от игроков, детерминизм
function sim(seed: number, players: ZPlayer[], secs: number, t0 = 1_000_000) {
  const z = new Zone("arinar", [], [], { proc: true, seed });
  const pm = new Map(players.map((p) => [p.sid, p]));
  const spawnedAt: { x: number; y: number; dmin: number }[] = [];
  let maxAlive = 0, maxNear = 0, now = t0;
  const seen = new Set<number>();
  for (let t = 0; t < secs * 10; t++) {
    now += 100;
    z.update(0.1, now, pm, noop, noop);
    // мобов «замораживаем» на месте спавна, чтобы мерить именно режиссёра
    for (const m of z.mobs) {
      if (!seen.has(m.id)) { seen.add(m.id); spawnedAt.push({ x: m.x, y: m.y, dmin: Math.min(...players.map((p) => Math.hypot(p.x - m.x, p.y - m.y))) }); }
      m.x = m.sx; m.y = m.sy; m.targetSid = null;
    }
    const alive = z.mobs.filter((m) => !m.dead && m.id !== z.bossId);
    maxAlive = Math.max(maxAlive, alive.length);
    for (const p of players) maxNear = Math.max(maxNear, alive.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) < ZONE_GEN.nearR).length);
    for (const r of REGIONS) if (alive.filter((m) => m.region === r.id).length > r.cap) ok(false, "region cap exceeded " + r.id);
  }
  return { z, spawnedAt, maxAlive, maxNear, now };
}
const solo = sim(7, [P("a", 620, 300)], 60);
ok(solo.z.stats.spawned > 0 && solo.maxAlive <= ZONE_GEN.globalCap, `solo: spawned ${solo.z.stats.spawned}, max alive ${solo.maxAlive} ≤ global cap ${ZONE_GEN.globalCap}`);
ok(solo.maxNear <= ZONE_GEN.nearBase, `solo: density near player ${solo.maxNear} ≤ nearBase ${ZONE_GEN.nearBase}`);
ok(solo.spawnedAt.every((s) => !inSafe(s.x, s.y)), "no spawns in safe zones (" + SAFE_ZONES.map((s) => s.name).join(", ") + ")");
// первые мобы пачки ≥ spawnMinDist; соседи по пачке — до 44 px от центра
ok(solo.spawnedAt.every((s) => s.dmin >= ZONE_GEN.spawnMinDistCrowded - 45 && s.dmin <= ZONE_GEN.spawnMaxDist + 45), "spawns between spawnMinDist and spawnMaxDist from players");
const group = sim(7, [P("a", 620, 300), P("b", 640, 320), P("c", 600, 280), P("d", 630, 290)], 60);
const lim4 = Math.min(ZONE_GEN.nearMax, ZONE_GEN.nearBase + ZONE_GEN.nearPerPlayer * 3);
ok(group.maxNear <= lim4 && group.maxNear >= solo.maxNear, `group of 4: density ${group.maxNear} ≤ ${lim4} (scales with players, capped at ${ZONE_GEN.nearMax})`);
const many = sim(9, [...Array(12)].map((_, i) => P("p" + i, 150 + (i % 4) * 300, 200 + Math.floor(i / 4) * 400)), 120);
ok(many.maxAlive > 0 && many.maxAlive <= ZONE_GEN.globalCap, `12 spread players: max alive ${many.maxAlive} ≤ global cap ${ZONE_GEN.globalCap}`);
// темп: не больше burst + rate*t пачек
const s1 = sim(3, [P("a", 620, 300)], 2);
ok(s1.z.stats.spawned <= (ZONE_GEN.burst + ZONE_GEN.ratePerSec * 2) * 6, `rate limit: ${s1.z.stats.spawned} mobs in first 2 s (token bucket burst ${ZONE_GEN.burst}, ${ZONE_GEN.ratePerSec}/s)`);
const d1 = sim(42, [P("a", 620, 300)], 20), d2 = sim(42, [P("a", 620, 300)], 20);
const sig = (z: Zone) => z.mobs.map((m) => `${m.type}@${Math.round(m.sx)},${Math.round(m.sy)}${m.elite ? "*" : ""}`).join("|");
ok(sig(d1.z) === sig(d2.z) && sig(d1.z).length > 0, "same seed + same inputs → identical spawns (debuggable)");

// 3. деспавн далёких праздных мобов
{
  const z = new Zone("arinar", [], [], { proc: true, seed: 5 });
  const p = P("a", 620, 300); const pm = new Map([["a", p]]);
  let now = 2_000_000;
  for (let t = 0; t < 100; t++) { now += 100; z.update(0.1, now, pm, noop, noop); for (const m of z.mobs) { m.x = m.sx; m.y = m.sy; m.targetSid = null; } }
  const before = z.mobs.filter((m) => !m.dead).length;
  p.x = 150; p.y = 1150; // далеко от пустошей
  for (let t = 0; t < (ZONE_GEN.despawnIdle + 5) * 10; t++) { now += 100; z.update(0.1, now, pm, noop, noop); for (const m of z.mobs) { m.x = m.sx; m.y = m.sy; m.targetSid = null; } }
  const far = z.mobs.filter((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) > ZONE_GEN.despawnDist);
  ok(before > 0 && z.stats.despawned > 0 && far.length === 0, `despawn: ${z.stats.despawned} far idle mobs removed after ${ZONE_GEN.despawnIdle}s, none left beyond ${ZONE_GEN.despawnDist}px`);
}

// 4. мировой босс по таймеру + объявление, повтор после смерти
{
  const z = new Zone("arinar", [], [], { proc: true, seed: 5 });
  const pm = new Map([["a", P("a", 620, 300)]]);
  let now = 3_000_000;
  z.update(0.5, now, pm, noop, noop);
  for (let s = 0; s < ZONE_GEN.boss.firstAfter + 2; s++) { now += 1000; z.update(1, now, pm, noop, noop); }
  const boss = z.mobs.find((m) => m.type === ZONE_GEN.boss.type && !m.dead);
  const ann = z.events.find((e) => e.k === "announce");
  ok(!!boss && !!ann, `world boss ${ZONE_GEN.boss.type} after ${ZONE_GEN.boss.firstAfter}s with announcement: "${ann?.text}"`);
  if (boss) { z.kill(boss, noop); now += 1000; z.update(1, now, pm, noop, noop); }
  ok(z.bossAt > now + (ZONE_GEN.boss.every - 5) * 1000 && !z.mobs.some((m) => m.type === ZONE_GEN.boss.type && !m.dead), `boss re-timer ${ZONE_GEN.boss.every}s after kill`);
}

// 5. атака по направлению: форма оружия
{
  const z = new Zone("arinar", [], [], { proc: false });
  const p = P("a", 500, 500);
  const m1 = z.addMob("rot_glitch", 600, 500), m2 = z.addMob("rot_glitch", 680, 505), m3 = z.addMob("rot_glitch", 500, 590);
  const spear = WEAPON_TYPES.spear.atk, book = WEAPON_TYPES.book.atk, sword = WEAPON_TYPES.sword.atk;
  ok(z.targetsInDir(p, 1, 0, book).map((m) => m.id).join() === String(m1.id), "proj: hits only the first mob on the ray");
  ok(z.targetsInDir(p, 1, 0, spear).length === 2, "line (spear): pierces 2 mobs in a row");
  ok(z.targetsInDir(p, -1, 0, book).length === 0, "wrong direction → miss (server-validated)");
  ok(z.targetsInDir(p, 0, 1, sword).map((m) => m.id).join() === String(m3.id), "arc (sword): hits mob in the swing, not those outside the arc");
  ok(z.targetsInDir(p, 0.7071, 0.7071, sword).length >= 2, "arc (sword): 45° swing catches mobs on both sides (cleave)");
  const far = z.addMob("rot_glitch", 500, 500 - (book.range + 60));
  ok(!z.targetsInDir(p, 0, -1, book).includes(far), "out of range → miss");
  m1.dead = true;
  ok(z.targetsInDir(p, 1, 0, book)[0]?.id === m2.id, "dead mobs are skipped");
}

// 6. статусы: горение тикает, отбрасывание, босс не отбрасывается
{
  const z = new Zone("arinar", [], [], { proc: false });
  const m = z.addMob("dream_moth", 600, 600); const hp0 = m.hp;
  z.applyStatus(m, "a", { kind: "burn", dps: 10, dur: 3 }, 550, 600);
  z.applyStatus(m, "a", { knock: 3 }, 550, 600);
  const pm = new Map<string, ZPlayer>();
  const now = Date.now();
  for (let i = 0; i < 10; i++) z.update(0.1, now + i * 100, pm, noop, noop);
  ok(m.hp < hp0 - 8 && m.dmgBy.get("a")! > 8, `burn DoT ${Math.round(hp0 - m.hp)} dmg in 1s credited to attacker`);
  ok(m.x > 610, `knockback pushes away from attacker (x ${m.x.toFixed(0)})`);
  const bossType = Object.keys(ZONE_MOBS).find((k) => ZONE_MOBS[k].boss)!;
  const bm = z.addMob(bossType, 300, 300);
  z.applyStatus(bm, "a", { knock: 5 }, 250, 300);
  ok(bm.kbx === 0, "bosses are immune to knockback");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
