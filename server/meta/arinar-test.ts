// Аринар 48000: лагеря, биомы, поводок, сон чанков, проклятые, навыки боссов, опыт, индекс типов.
// Запуск: esbuild server/meta/arinar-test.ts --bundle --platform=node --format=esm --outfile=/tmp/at.mjs && node /tmp/at.mjs
import { Zone, skillsFor, type ZPlayer } from "./zone";
import { ZONE_GEN, WORLD_GEN, regionAt, inSafe, ARINAR_PATCHES } from "./zoneGen";
import { ZONE_MOBS } from "./defs";
import { MOB_INFO, ZONE_RESPAWN, STATIC_NPCS as NPCS } from "./shared";
import { BIOMES, VARIANTS, baseOf } from "./biomes";
import { killXp, xpNeed, mobXp } from "./balance";
import { WORLD_SIZES, ARINAR_HUB } from "../worlds/sizes";
import { WORLD_PORTALS } from "../worlds/portals";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const P = (sid: string, x: number, y: number, hp = 1e9): ZPlayer => ({ sid, x, y, hp, maxHp: hp, armorRed: 0, alive: true, respawnAt: 0 });
const noop = () => {};

ok(WORLD_SIZES.arinar === 48000, "Arinar is 48000×48000 px (1500×1500 cells of 32 px)");
ok(Math.hypot(ZONE_RESPAWN.x - ARINAR_HUB.x, ZONE_RESPAWN.y - ARINAR_HUB.y) < ARINAR_HUB.r && inSafe(ZONE_RESPAWN.x, ZONE_RESPAWN.y), "respawn in central hub safe zone");
ok(Object.values(NPCS).filter((n) => n.world === "arinar").every((n) => Math.hypot(n.x - ARINAR_HUB.x, n.y - ARINAR_HUB.y) < ARINAR_HUB.r), "Alzi/Leyr stand in the hub");
ok(WORLD_PORTALS.filter((p: any) => p.world === "arinar").every((p: any) => inSafe(p.x, p.y)) && WORLD_PORTALS.find((p: any) => p.id === "portal_arinar")!.targetX === ZONE_RESPAWN.x, "arinar portals in hub; hellfire→arinar lands in hub");
// индексы типов совпадают (сервер ZONE_MOBS ↔ клиент MOB_INFO)
ok(Object.keys(ZONE_MOBS).join() === Object.keys(MOB_INFO).join(), `mob type index aligned server/client (${Object.keys(ZONE_MOBS).length} types, ${VARIANTS.length} biome variants)`);

const z = new Zone("arinar", [], [], { proc: true });
const camps = z.camps;
let minD = Infinity;
for (let i = 0; i < camps.length; i++) for (let j = i + 1; j < camps.length; j++) { const d = Math.hypot(camps[i].x - camps[j].x, camps[i].y - camps[j].y); if (d < minD) minD = d; }
ok(camps.length > 900 && minD >= ZONE_GEN.campMinDist, `${camps.length} camps, ${z.mobs.length} mobs; min camp spacing ${minD.toFixed(0)} ≥ ${ZONE_GEN.campMinDist}px`);
{ // большие лагеря не сливаются: ближайшие мобы РАЗНЫХ лагерей дальше радиуса агро
  const B = new Map<number, any[]>(); for (const m of z.mobs as any[]) if (m.camp) { const k = Math.floor(m.x / 600) * 4096 + Math.floor(m.y / 600); (B.get(k) || B.set(k, []).get(k)!).push(m); }
  let gap = Infinity; for (const m of z.mobs as any[]) { if (!m.camp) continue; const cx = Math.floor(m.x / 600), cy = Math.floor(m.y / 600);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of B.get((cx + i) * 4096 + cy + j) || []) if (o.camp !== m.camp) gap = Math.min(gap, Math.hypot(o.x - m.x, o.y - m.y)); }
  const aggro = Math.max(...Object.values(ZONE_MOBS).filter((d: any) => !d.boss).map((d: any) => d.aggro || 0));
  ok(gap > aggro + 40, `anti-merge between big camps: closest mobs of different camps ${gap.toFixed(0)} px > aggro ${aggro} + 40`);
}
ok(camps.every((c) => !inSafe(c.x, c.y, 250)), "no camps in/near hub safe zone");
for (const b of Object.values(BIOMES)) {
  const ms = z.mobs.filter((m) => (ZONE_MOBS[m.type] as any).biome === b.id && !ZONE_MOBS[m.type].boss);
  const lv = ms.map((m) => ZONE_MOBS[m.type].lvl);
  ok(ms.length > 50 && Math.min(...lv) === b.lvl[0] && Math.max(...lv) === b.lvl[1], `biome ${b.id} (${b.name}): ${ms.length} mobs lvl ${Math.min(...lv)}–${Math.max(...lv)} (want ${b.lvl.join("–")})`);
}
const bb = WORLD_GEN.arinar.bosses.filter((b) => (ZONE_MOBS[b.type] as any).biome);
const tOf = (id: string) => new Set(bb.filter((b) => (ZONE_MOBS[b.type] as any).biome === id).map((b) => b.type)).size;
ok(Object.keys(BIOMES).every((id) => tOf(id) >= 1 && tOf(id) <= 2), `1–2 themed boss TYPES per biome, ${bb.length} placements across patches: ${bb.map((b) => b.type).join(", ")}`);
ok(bb.every((b) => regionAt(b.x, b.y)?.biome === "b_" + (ZONE_MOBS[b.type] as any).biome), "biome bosses stand in their biome");
const hubR = regionAt(ARINAR_HUB.x, ARINAR_HUB.y);
{ // Minecraft-подобная генерация: несколько пятен каждого биома, в каждом лагеря, боссы распределены
  const cnt = (k: string) => ARINAR_PATCHES.filter((p) => p.kind === k).length;
  ok(["ice", "fire", "stone", "air"].every((k) => cnt(k) >= 4), `biome patches: ${["ice", "fire", "stone", "air"].map((k) => k + "×" + cnt(k)).join(", ")} (+ ${ARINAR_PATCHES.length - 24} patches of old tiers)`);
  const withCamps = ARINAR_PATCHES.filter((P) => camps.some((c) => (regionAt(c.x, c.y) as any)?.patch === P.idx)).length;
  ok(withCamps === ARINAR_PATCHES.length, `camps in every patch (${withCamps}/${ARINAR_PATCHES.length})`);
  const elemP = ARINAR_PATCHES.filter((P) => ["ice", "fire", "stone", "air"].includes(P.kind));
  ok(elemP.every((P) => WORLD_GEN.arinar.bosses.some((b) => (regionAt(b.x, b.y) as any)?.patch === P.idx)), `every elemental patch has its own boss (${WORLD_GEN.arinar.bosses.length} boss spawns total)`);
  const lv = (k: string) => WORLD_GEN.arinar.regions.filter((r: any) => r.kind?.startsWith(k + "_")).map((r) => r.lvl);
  ok(["ice", "fire", "stone", "air"].every((k: any) => lv(k).every((l) => l[0] >= (BIOMES as any)[k].lvl[0] && l[1] <= (BIOMES as any)[k].lvl[1])), "level bands follow biome TYPE in every patch");
}
ok(hubR?.id === "hub" && ["groves", "meadow", "violets_w", "pome_e"].every((id) => WORLD_GEN.arinar.regions.find((r) => r.id === id)!.lvl[1] <= 5), "hub «Гранатовый двор» ringed by lvl 1–5 groves/violet meadows/pomegranate garden");
ok(baseOf("ice_dew_slime") === "dew_slime" && (MOB_INFO as any).ice_dew_slime.tint.length === 3, "variants: base for loot/bestiary + tint for client");

// сон: без игроков рядом мобы не двигаются; рядом — просыпаются
{
  // лагерь с ближником, который быстрее игрока (иначе он просто теряет цель — тоже честно, но не поводок)
  const okMob = (t: string) => ZONE_MOBS[t].speed >= 70 && ["melee", "charger", "swarm"].includes(ZONE_MOBS[t].role);
  const camp = camps.find((c) => (regionAt(c.x, c.y) as any)?.kind === "fire_inner" && okMob(c.types[0]))!;
  const mob = z.mobs.find((m) => m.camp === camp.id && m.type === camp.types[0])!;
  const far = z.mobs.find((m) => Math.hypot(m.x - camp.x, m.y - camp.y) > 16000)!;
  const fx = far.x, fy = far.y;
  const p = P("a", camp.x + 120, camp.y); const pm = new Map([["a", p]]);
  let now = 1_000_000;
  for (let i = 0; i < 20; i++) { now += 100; z.update(0.1, now, pm, noop, noop); }
  ok(z.stats.asleep > z.stats.awake * 5 && far.x === fx && far.y === fy, `sleep: ${z.stats.awake} awake / ${z.stats.asleep} asleep; far mob frozen`);
  ok(mob.targetSid === "a", "camp mob aggroed on nearby player");
  const mates = z.mobs.filter((m) => m.camp === camp.id && !m.dead);
  ok(mates.every((m) => m.targetSid === "a"), `pack aggro: all ${mates.length} camp members engage together`);
  const others = z.mobs.filter((m) => m.camp && m.camp !== camp.id && m.targetSid === "a");
  ok(others.length === 0, "neighbouring camps not pulled");
  // поводок: утягиваем игрока далеко от дома
  const dmg = z.damage(mob, "a", 50, noop);
  const step = ZONE_MOBS[mob.type].speed * 0.07;
  for (let i = 0; i < 600 && !mob.reset; i++) { now += 100; p.x += step; z.update(0.1, now, pm, noop, noop); }
  ok(mob.reset && z.events.some((e) => e.k === "evade"), `leash: mob resets after ${Math.round(Math.hypot(mob.x - mob.sx, mob.y - mob.sy))}px from home (leash ${ZONE_GEN.leash})`);
  ok(z.damage(mob, "a", 999999, noop) === 0 && !mob.dead, "resetting mob is immune (evade) and ignores player");
  const hp0 = mob.hp;
  let t = 0; for (; t < 200 && mob.reset; t++) { now += 100; z.update(0.1, now, pm, noop, noop); if (mob.reset) ok2(mob.targetSid === null); }
  ok(!mob.reset && mob.hp === mob.maxHp && Math.hypot(mob.x - mob.sx, mob.y - mob.sy) < 1, `returned home in ${(t / 10).toFixed(1)}s, regenerated to full (${Math.round(hp0)}→${mob.maxHp}; dmg dealt ${dmg})`);
}
function ok2(c: boolean) { if (!c) ok(false, "reset mob retargeted player"); }

// проклятые ≈10%; навыки: обычный босс — 1, проклятый — 2–5
{
  const n = z.mobs.length, c = z.mobs.filter((m) => m.cursed).length;
  ok(c / n > 0.07 && c / n < 0.13, `cursed rate ${(100 * c / n).toFixed(1)}% (target ${ZONE_GEN.cursedPct}%)`);
  ok(z.mobs.filter((m) => m.cursed).every((m) => m.skills.length >= 2 && m.skills.length <= 5 && m.maxHp >= ZONE_MOBS[m.type].hp * 4), "cursed: 2–5 skills, ×5.2 HP");
  ok(z.mobs.filter((m) => !m.cursed && !m.ench && !ZONE_MOBS[m.type].boss).every((m) => m.skills.length === 0), "regular mobs: no skills");
  const bosses = Object.keys(ZONE_MOBS).filter((k) => ZONE_MOBS[k].boss);
  ok(bosses.every((k) => skillsFor(k, 1).length === 1), `every regular boss gets exactly 1 skill (${bosses.length} bosses; e.g. fire_warden: ${skillsFor("fire_warden", 1)})`);
  const zb = new Zone("hellfire", [], [], { proc: false });
  const pm = new Map([["a", P("a", 600, 600)]]);
  const b = zb.addMob("fire_warden", 700, 600); b.cursed = false; b.skills = skillsFor("fire_warden", 1); b.skCd = { [b.skills[0]]: 0 }; b.targetSid = "a";
  let now = 2_000_000; for (let i = 0; i < 30; i++) { now += 100; zb.update(0.1, now, pm, noop, noop); }
  ok(zb.events.some((e) => e.k === "mskill"), `boss uses its skill: ${zb.events.find((e) => e.k === "mskill")?.name}`);
  const st = zb.state(600, 600, []);
  const zc = new Zone("hellfire", [], [], { proc: false }); const cm = zc.addMob("dew_slime", 650, 600); cm.cursed = true;
  ok((zc.state(600, 600, []).m[5] & 1024) !== 0 && (st.m[5] & 256) === 0, "cursed flag 1024 in zone_state");
}
// опасность: прыжок у ближников (телеграф)
{
  const zz = new Zone("hellfire", [], [], { proc: false });
  const pm = new Map([["a", P("a", 600, 600)]]);
  const m = zz.addMob("rot_glitch", 760, 600); m.cursed = false; m.skills = []; m.targetSid = "a";
  let now = 3_000_000; for (let i = 0; i < 5; i++) { now += 100; zz.update(0.1, now, pm, noop, noop); }
  ok(zz.events.some((e) => e.k === "tele_circle" && e.r === 52), "melee pack mob leaps with a circle telegraph");
}
// опыт (ребаланс: доля xpNeed; ниже = 0.01%, равный = 0.1%, выше = 1%; босс ×10)
{
  const need = xpNeed(10);
  ok(killXp({ xp: 0, mobL: 5, heroL: 10 }) === Math.max(1, Math.round(need * 0.0001)), "ниже → 0.01% xpNeed");
  ok(killXp({ xp: 0, mobL: 10, heroL: 10 }) === Math.max(1, Math.round(need * 0.001)), "равный → 0.1%");
  ok(killXp({ xp: 0, mobL: 12, heroL: 10 }) === Math.max(1, Math.round(need * 0.01)), "+2 → 1%");
  ok(killXp({ xp: 0, mobL: 20, heroL: 10 }) === Math.max(1, Math.round(need * 0.01)), ">+3 → кап 1%");
  const same = killXp({ xp: 0, mobL: 10, heroL: 10 });
  ok(same < killXp({ xp: 0, mobL: 10, heroL: 10, elite: true }) && killXp({ xp: 0, mobL: 10, heroL: 10, elite: true }) <= killXp({ xp: 0, mobL: 10, heroL: 10, elite: true, cursed: true }), "элита/проклятый дают больше");
  ok(killXp({ xp: 0, mobL: 10, heroL: 10, boss: true }) === Math.max(1, Math.round(need * 0.01)), "босс своего ур. → 1%");
  ok(killXp({ xp: 0, mobL: 30, heroL: 10, boss: true }) === Math.max(1, Math.round(need * 0.1)), "босс выше → 10%");
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
