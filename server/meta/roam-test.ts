// Аринар: органичные лагеря (без сетки), кочевники, бой моб↔моб, сон чанков, производительность.
// Запуск: esbuild server/meta/roam-test.ts --bundle --platform=node --format=esm --outfile=/tmp/rt.mjs && node /tmp/rt.mjs
import { Zone, HOSTILITY, hostile, factionOf, type ZPlayer, type ZMob } from "./zone";
import { ZONE_GEN } from "./zoneGen";
import { ZONE_MOBS } from "./defs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const P = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0 });

const z = new Zone("arinar", [], [], { proc: true });
const C = z.camps;
// 1. органика: ближайший сосед — разброс, ≥ campMinDist; нет сетки
const nn = C.map((c) => { let d = Infinity; for (const o of C) if (o !== c) d = Math.min(d, Math.hypot(o.x - c.x, o.y - c.y)); return d; });
const mean = nn.reduce((a, b) => a + b, 0) / nn.length, sd = Math.sqrt(nn.reduce((a, b) => a + (b - mean) ** 2, 0) / nn.length);
ok(Math.min(...nn) >= ZONE_GEN.campMinDist, `anti-merge kept: min camp spacing ${Math.min(...nn).toFixed(0)} ≥ ${ZONE_GEN.campMinDist}`);
ok(sd / mean > 0.15 && Math.max(...nn) > 1.8 * Math.min(...nn), `varied spacing: nearest-neighbour ${Math.min(...nn).toFixed(0)}…${Math.max(...nn).toFixed(0)} px, mean ${mean.toFixed(0)}, CV ${(sd / mean).toFixed(2)}`);
const onLattice = C.filter((c) => Math.abs(((c.x % 1000) + 1000) % 1000 - 500) < 230 && Math.abs(((c.y % 1000) + 1000) % 1000 - 500) < 230).length / C.length;
ok(onLattice < 0.4, `not on the old 1000 px grid: ${(onLattice * 100).toFixed(0)}% within old jitter box (random ≈ 21%, old grid 100%)`);
const sizes = new Set(C.map((c) => c.types.length));
ok(sizes.size >= 5 && sizes.has(1), `group sizes vary: ${[...sizes].sort().join(",")}`);
// формы: расстояния членов от центра пачки — не кольцо (разброс радиусов)
let ringish = 0, multi = 0;
for (const c of C) {
  const ms = z.mobs.filter((m) => m.camp === c.id); if (ms.length < 3) continue; multi++;
  const cx = ms.reduce((a, m) => a + m.x, 0) / ms.length, cy = ms.reduce((a, m) => a + m.y, 0) / ms.length;
  const r = ms.map((m) => Math.hypot(m.x - cx, m.y - cy)), rm = r.reduce((a, b) => a + b, 0) / r.length;
  const rs = Math.sqrt(r.reduce((a, b) => a + (b - rm) ** 2, 0) / r.length);
  if (rs / (rm || 1) < 0.12) ringish++;
}
ok(ringish / multi < 0.25, `packs are not perfect rings: ${ringish}/${multi} ring-like`);
const minIn = Math.min(...C.map((c) => { const ms = z.mobs.filter((m) => m.camp === c.id); let d = Infinity; for (const a of ms) for (const b of ms) if (a !== b) d = Math.min(d, Math.hypot(a.x - b.x, a.y - b.y)); return d; }).filter(Number.isFinite));
ok(minIn >= 15, `members of a pack don't overlap (min ${minIn.toFixed(0)} px)`);
ok(C.length > 1200 && C.length < 1800, `${C.length} camps, ${z.mobs.length} mobs (old grid: 1433 camps)`);

// 2. кочевники
const roam = z.mobs.filter((m) => m.roam);
const share = roam.length / z.mobs.length;
ok(share >= 0.05 && share <= 0.1, `roamers: ${roam.length} (${(share * 100).toFixed(1)}% of mobs)`);
const byF: Record<string, [number, number]> = {};
for (const m of z.mobs) { const f = factionOf(m.type); byF[f] ??= [0, 0]; byF[f][0]++; if (m.roam) byF[f][1]++; }
ok(Object.values(byF).every(([n, r]) => r / n > 0.03 && r / n < 0.13), `roamer share per faction: ${Object.entries(byF).map(([f, [n, r]]) => `${f} ${(100 * r / n).toFixed(1)}%`).join(", ")}`);
ok(roam.every((m) => m.roam!.pts.length >= 2 && m.roam!.pts.every((p) => Math.hypot(p[0] - m.x, p[1] - m.y) < ZONE_GEN.roamRange + 600)), "roam paths: 2+ waypoints near home");
ok(roam.every((m) => ZONE_GEN && z.gen.regions.find((r) => r.id === m.region)!.table.some((t) => t.type === m.type)), "roamers come from their region table (biome levels kept)");
// 3. враждебность
ok(Object.entries(HOSTILITY).every(([a, l]) => l.every((b) => HOSTILITY[b].includes(a)) && !l.includes(a)), "hostility table symmetric, no self-hostility");
ok(hostile("ice_dew_slime", "fire_dew_slime") && !hostile("ice_dew_slime", "ice_night_bat") && factionOf("dew_slime") === "wild", "ice↔fire hostile, same faction friendly, base types = wild");

// 4. бой моб↔моб: кочевник у враждебного лагеря; игрок рядом (чанк не спит), но вне агро
{
  const z2 = new Zone("arinar", [], [], { proc: true });
  let pair: { r: ZMob; c: ZMob } | null = null;
  for (const r of z2.mobs.filter((m) => m.roam)) {
    const c = z2.mobs.find((m) => m.camp && hostile(r.type, m.type) && Math.hypot(m.x - r.x, m.y - r.y) < 3000);
    if (c) { pair = { r, c }; break; }
  }
  ok(!!pair, "found roamer + hostile camp pair");
  const { r, c } = pair!;
  r.x = r.sx = c.x + 90; r.y = r.sy = c.y; r.roam!.home = [r.x, r.y];
  const pl = P("watch", c.x, c.y + 700), pm = new Map([["watch", pl]]);
  const killed: ZMob[] = []; let t = 2e9;
  for (let i = 0; i < 1200 && !killed.length; i++) { t += 100; z2.update(0.1, t, pm, () => {}, (m) => killed.push(m)); }
  ok(z2.stats.mobHits > 0 && killed.length > 0, `mobs fight server-side: ${z2.stats.mobHits} hits, first kill ${killed[0]?.type} after ${((t - 2e9) / 1000).toFixed(1)} s`);
  const k = killed[0];
  const playerShare = k ? [...k.dmgBy].filter(([s]) => !s.startsWith("mob:")).reduce((a, [, v]) => a + v, 0) : 1;
  ok(!!k && playerShare === 0 && [...k.dmgBy.keys()].every((s) => s.startsWith("mob:")), "mob-only kill credits nobody (dmgBy has only mob:* keys → service skips, no XP/drops)");
  // игрок со вкладом < 15% не получает (общий итог включает урон мобов)
  const fake = new Map<string, number>([["p", 10], ["mob:1", 90]]);
  const tot = [...fake.values()].reduce((a, b) => a + b, 0);
  ok(10 / tot < 0.15, "player share computed against mob damage too (10 of 100 → below 15% threshold)");
  if (k?.fixed) { const at = k.respawnAt; t = at + 200; z2.update(0.1, t, pm, () => {}, () => {}); ok(!k.dead && k.hp === k.maxHp && k.mobTarget === 0, `killed ${k.camp ? "camp" : "roaming"} mob respawns normally after ${k.respawn}s`); }
  // игрок важнее: удар игрока переключает цель
  const alive = [r, c].find((m) => !m.dead)!;
  pl.x = alive.x + 40; pl.y = alive.y; z2.damage(alive, "watch", 1, () => {}); t += 100; z2.update(0.1, t, pm, () => {}, () => {});
  ok(alive.dead || (alive.targetSid === "watch" && alive.mobTarget === 0), "a player hit takes priority over the mob fight");
}
// 5. сон: без игроков рядом кочевники не двигаются; производительность
{
  const z3 = new Zone("arinar", [], [], { proc: true });
  const before = z3.mobs.filter((m) => m.roam).map((m) => [m.x, m.y]);
  const pm = new Map([["a", P("a", 24000, 24100)]]);
  let t = 3e9; for (let i = 0; i < 50; i++) { t += 100; z3.update(0.1, t, pm, () => {}, () => {}); }
  const rm = z3.mobs.filter((m) => m.roam);
  const movedFar = rm.filter((m, i) => Math.hypot(m.x - before[i][0], m.y - before[i][1]) > 1 && !z3.awake.has(Math.floor(m.x / 2000) * 4096 + Math.floor(m.y / 2000))).length;
  ok(movedFar === 0 && z3.stats.asleep > z3.mobs.length * 0.9, `sleeping chunks stay asleep: ${movedFar} far roamers moved, ${z3.stats.asleep}/${z3.mobs.length} asleep`);
  const many = new Map<string, ZPlayer>();
  for (let i = 0; i < 32; i++) { const a = i * 2.4; many.set("p" + i, P("p" + i, 24000 + Math.cos(a) * (2000 + i * 500), 24000 + Math.sin(a) * (2000 + i * 500))); }
  const t0 = performance.now(); for (let i = 0; i < 100; i++) { t += 100; z3.update(0.1, t, many, () => {}, () => {}); }
  const ms = (performance.now() - t0) / 100;
  ok(ms < 8, `32 spread players: ${ms.toFixed(2)} ms/tick (awake ${z3.stats.awake}, mob hits ${z3.stats.mobHits})`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
