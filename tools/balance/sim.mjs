#!/usr/bin/env node
// Детерминированный симулятор боя «Проклятых» + генератор admin-SQL (game_overrides).
// Использует те же формулы, что сервер (balance.ts / ZONE_GEN / armor).
// Запуск: node tools/balance/sim.mjs
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "fs";
import { pathToFileURL } from "url";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";
import { tmpdir } from "os";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "../..");
const outDir = "/workspace/morrisgrad-round3/rebalance";
mkdirSync(outDir, { recursive: true });

function ensureBundle() {
  const marker = join(__dir, ".bundle-path");
  try {
    const pth = readFileSync(marker, "utf8").trim();
    if (pth) { readFileSync(pth); return pth; }
  } catch {}
  const dir = mkdtempSync(join(tmpdir(), "mcbal-"));
  const entry = join(dir, "entry.ts");
  const lines = [
    `export * from ${JSON.stringify(join(root, "server/meta/balance.ts"))};`,
    `export { CONTENT } from ${JSON.stringify(join(root, "server/meta/content.ts"))};`,
    `export { ZONE_GEN } from ${JSON.stringify(join(root, "server/meta/zoneGen.ts"))};`,
    `export { WEAPON_TYPES, ITEM_BY_ID, RUN_SKILLS } from ${JSON.stringify(join(root, "server/meta/defs.ts"))};`,
    `export { TABLES, SCHEMA, validatePatch, applyOverride, currentValues, TRAITS } from ${JSON.stringify(join(root, "server/meta/overrides.ts"))};`,
  ];
  writeFileSync(entry, lines.join("\n"));
  const out = join(dir, "bundle.mjs");
  buildSync({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
  writeFileSync(marker, out);
  return out;
}
const bundlePath = ensureBundle();
const B = await import(pathToFileURL(bundlePath).href);

const {
  refHero, xpNeed, killXp, mobXp, xpFrac, soloPressure, dotStackMax, weaponSkillPowerMult,
  PROGRESSION, ROLE_MULT, SIZE_MULT, mobArmor, ttkTarget, weaponAvg, itemBudget,
  CONTENT, ZONE_GEN, WEAPON_TYPES, ITEM_BY_ID, RUN_SKILLS,
  validatePatch, currentValues, TABLES,
} = B;

const MOBS = CONTENT.zoneMobs;
const ATK_CD = 1.1; // с между ударами моба (как в balance.ts)

function armorRed(armor) { return Math.min(0.6, armor / (armor + 60)); }

/** Эталонный герой с сдвигом уровня шмота (gearDelta: -1 = шмот на ур. ниже). */
function heroAt(L, gearDelta = 0) {
  const gL = Math.max(1, L + gearDelta);
  const base = refHero(L);
  // приближение: DPS/EHP масштабируются отношением weaponAvg/budget
  const wRatio = weaponAvg(gL, "uncommon") / weaponAvg(L, "uncommon");
  const bRatio = itemBudget(gL, "uncommon") / itemBudget(L, "uncommon");
  const dps = base.dps * (0.55 + 0.45 * wRatio); // оружие ~45% DPS
  const ehp = base.ehp * (0.7 + 0.3 * bRatio);
  const hp = base.hp * (0.7 + 0.3 * bRatio);
  return { ...base, dps, ehp, hp, gearL: gL };
}

/** Эффективные статы моба после админ-патча (если передан). */
function mobEff(id, patch) {
  const d = MOBS[id];
  const hp = patch?.hp ?? d.hp;
  const dmg = patch?.dmg ?? d.dmg;
  const armor = patch?.armor ?? d.armor;
  return { ...d, id, hp, dmg, armor };
}

/** Бой 1v1: возвращает { win, ttk, death, hpLeft }. DoT avg добавляется к DPS игрока. */
function fight(hero, mob, { cursed = false, party = 1, dotDps = 0, skillDps = 0 } = {}) {
  const cHp = ZONE_GEN.cursedHp, cDmg = ZONE_GEN.cursedDmg;
  let mArmor = mob.armor * (cursed ? 1.3 : 1);
  let mHp = mob.hp * (cursed ? cHp : 1);
  let mDmg = mob.dmg * (cursed ? cDmg : 1);
  const red = armorRed(mArmor);
  const playerDps = (hero.dps + dotDps + skillDps) * party;
  const eDps = playerDps * (1 - red); // урон по ХП после брони
  const ttk = mHp / Math.max(0.01, eDps);
  // моб бьёт одного танка; в партии из 3 урон по танку тот же, убивают быстрее
  const mobDps = mDmg / ATK_CD;
  const death = hero.ehp / Math.max(0.01, mobDps);
  const win = ttk < death * 0.92; // небольшой запас на риски
  const hpLeft = win ? Math.max(0, hero.hp * (1 - ttk / death)) : 0;
  return { win, ttk: +ttk.toFixed(2), death: +death.toFixed(2), hpLeft: Math.round(hpLeft), mHp: Math.round(mHp), mDmg: +mDmg.toFixed(1) };
}

/** Целевые статы моба под soloPressure и роль/размер. */
function targetStats(d) {
  const L = d.lvl;
  const R = ROLE_MULT[d.role] || ROLE_MULT.melee;
  const S = SIZE_MULT[d.size === "l" ? "l" : d.boss || d.size === "boss" ? "boss" : d.size === "huge" ? "huge" : "s"] || SIZE_MULT.s;
  const sizeKey = d.huge ? "huge" : d.boss ? "boss" : d.size === "l" ? "l" : "s";
  const Sz = SIZE_MULT[sizeKey] || SIZE_MULT.s;
  const press = soloPressure(L);
  const h = refHero(L);
  const targetTTK = 3.8 + 2.2 * (L - 1) / 24; // 3.8→6.0 с
  const targetDeath = 38 - 6 * (L - 1) / 24; // 38→32 с
  const armor = Math.round(mobArmor(L) * (d.role === "tank" || sizeKey !== "s" ? 1.5 : 1));
  const red = armorRed(armor);
  const hp = Math.round(h.dps * targetTTK / (1 - red) * R.hp * Sz.hp * press);
  const dmg = Math.round(h.ehp / targetDeath * ATK_CD * R.dmg * Sz.dmg * press * 10) / 10;
  const xp = Math.round(mobXp(L) * R.xp * Sz.xp); // информативно; killXp больше не читает
  return { hp, dmg, armor, xp, press: +press.toFixed(3), targetTTK: +targetTTK.toFixed(2), targetDeath: +targetDeath.toFixed(2) };
}

// ---------- оружие: навык R + 1–2 DoT ----------
const WEAPON_KIT = {
  spear:      { rs: "spear",        traits: [{ k: "bleed", chance: 30, dpsPct: 14, dur: 3 }] },
  daggers:    { rs: "daggers",      traits: [{ k: "bleed", chance: 35, dpsPct: 12, dur: 3 }, { k: "poison", chance: 20, dpsPct: 8, dur: 5 }] },
  book:       { rs: "fire_spark",   traits: [{ k: "burn", chance: 30, dpsPct: 15, dur: 3 }] },
  staff:      { rs: "sun_beam",     traits: [{ k: "burn", chance: 28, dpsPct: 16, dur: 3.5 }, { k: "slow", chance: 20 }] },
  sword:      { rs: "war_axe",      traits: [{ k: "bleed", chance: 28, dpsPct: 13, dur: 3 }] },
  bow:        { rs: "thorn_bow",    traits: [{ k: "bleed", chance: 32, dpsPct: 12, dur: 3 }, { k: "poison", chance: 18, dpsPct: 7, dur: 5 }] },
  axe:        { rs: "war_axe",      traits: [{ k: "bleed", chance: 30, dpsPct: 15, dur: 3.5 }] },
  fly_blades: { rs: "fly_blades",   traits: [{ k: "bleed", chance: 35, dpsPct: 11, dur: 3 }, { k: "poison", chance: 22, dpsPct: 8, dur: 4 }] },
  moon_blade: { rs: "moon_orb",     traits: [{ k: "poison", chance: 28, dpsPct: 10, dur: 5 }, { k: "freeze", chance: 12, dur: 0.8 }] },
};

/** Средний DoT DPS от черт оружия (шанс × dpsPct × uptime). */
function avgDotDps(hero, traits) {
  let dps = 0;
  const hit = hero.hit || hero.dps * 0.45;
  for (const t of traits || []) {
    if (!["burn", "bleed", "poison"].includes(t.k)) continue;
    const chance = (t.chance || 0) / 100;
    const tick = hit * (t.dpsPct || 0) / 100;
    // стаки до dotStackMax; в среднем ~1.5 эффективных стака на длинном бою
    dps += chance * tick * Math.min(1.6, (t.dur || 3) / 2);
  }
  return dps;
}

// ---------- построить патчи мобов ----------
const mobPatches = {};
const beforeAfter = [];
for (const [id, d] of Object.entries(MOBS)) {
  const tgt = targetStats(d);
  const patch = {
    lvl: d.lvl,
    hp: tgt.hp,
    dmg: tgt.dmg,
    armor: tgt.armor,
    speed: d.speed,
    aggro: d.aggro,
    xp: tgt.xp,
    radius: d.radius,
    skills: [],
  };
  const v = validatePatch("mob", id, patch);
  if (typeof v === "string") { console.error("mob patch fail", id, v); process.exit(1); }
  mobPatches[id] = v;
  beforeAfter.push({
    id, name: d.name, lvl: d.lvl, role: d.role, boss: !!d.boss,
    before: { hp: d.hp, dmg: d.dmg, armor: d.armor, xp: d.xp },
    after: { hp: v.hp, dmg: v.dmg, armor: v.armor, xp: v.xp },
    press: tgt.press,
  });
}

// ---------- патчи оружия ----------
const weaponPatches = {};
for (const [id, def] of Object.entries(WEAPON_TYPES)) {
  const kit = WEAPON_KIT[id];
  if (!kit) continue;
  const cur = currentValues("weapon", id);
  const patch = {
    cd: cur.cd ?? def.cd,
    "atk.kind": cur["atk.kind"] ?? def.atk.kind,
    "atk.range": cur["atk.range"] ?? def.atk.range,
    ...(def.atk.width != null || cur["atk.width"] != null ? { "atk.width": cur["atk.width"] ?? def.atk.width } : {}),
    ...(def.atk.arc != null || cur["atk.arc"] != null ? { "atk.arc": cur["atk.arc"] ?? def.atk.arc } : {}),
    ...(def.atk.max != null || cur["atk.max"] != null ? { "atk.max": cur["atk.max"] ?? def.atk.max } : {}),
    ...(def.atk.count != null || cur["atk.count"] != null ? { "atk.count": cur["atk.count"] ?? def.atk.count } : {}),
    ...(def.atk.spread != null || cur["atk.spread"] != null ? { "atk.spread": cur["atk.spread"] ?? def.atk.spread } : {}),
    ...(def.atk.per != null || cur["atk.per"] != null ? { "atk.per": cur["atk.per"] ?? def.atk.per } : {}),
    "status.knock": cur["status.knock"] ?? def.status?.knock ?? 0,
    rs: kit.rs,
    traits: kit.traits,
  };
  // axe had range 250 on prod — keep if larger
  if (id === "axe") patch["atk.range"] = Math.max(patch["atk.range"], 250);
  if (id === "sword") patch["atk.max"] = Math.max(patch["atk.max"] || 4, 5);
  const v = validatePatch("weapon", id, patch);
  if (typeof v === "string") { console.error("weapon patch fail", id, v); process.exit(1); }
  weaponPatches[id] = v;
}

// ---------- симуляция сценариев ----------
const sampleByLvl = {};
const prefer = ["melee", "charger", "ranged", "caster"]; // танков/swarm не берём для эталонных боёв
for (const role of prefer) {
  for (const [id, d] of Object.entries(MOBS)) {
    if (d.boss || d.rare || d.size === "l" || d.size === "boss" || d.size === "huge") continue;
    if (d.role !== role) continue;
    if (!sampleByLvl[d.lvl]) sampleByLvl[d.lvl] = id;
  }
}
// fallback: swarm, затем tank, затем любой не-босс
for (const role of ["swarm", "tank"]) {
  for (const [id, d] of Object.entries(MOBS)) {
    if (d.boss || d.rare || d.size === "l" || d.size === "boss" || d.size === "huge") continue;
    if (d.role !== role) continue;
    if (!sampleByLvl[d.lvl]) sampleByLvl[d.lvl] = id;
  }
}
for (const [id, d] of Object.entries(MOBS)) {
  if (!d.boss && !sampleByLvl[d.lvl]) sampleByLvl[d.lvl] = id;
}

const scenarios = [];
const levels = [1, 5, 10, 15, 20, 25];
for (const L of levels) {
  const id = sampleByLvl[L];
  if (!id) continue;
  const mob = mobEff(id, mobPatches[id]);
  const kit = WEAPON_KIT.sword;
  const h = heroAt(L, 0);
  const hLow = heroAt(L, -1);
  const dot = avgDotDps(h, kit.traits);
  const skill = h.dps * 0.12 * weaponSkillPowerMult(L); // R ~12% DPS
  const same = fight(h, mob, { dotDps: dot, skillDps: skill });
  const gap = (() => {
    const id2 = sampleByLvl[L + 1] || id;
    const m2 = mobEff(id2, mobPatches[id2]);
    // герой L со шмотом L-1 бьёт моба L+1
    return fight(hLow, m2, { dotDps: avgDotDps(hLow, kit.traits), skillDps: hLow.dps * 0.12 * weaponSkillPowerMult(L) });
  })();
  const cursedSolo = fight(h, mob, { cursed: true, dotDps: dot, skillDps: skill });
  const cursedParty = (() => {
    const r = fight(h, mob, { cursed: true, party: 3, dotDps: dot, skillDps: skill });
    r.death = +(r.death * 2.2).toFixed(2); // party peel / target switch
    r.win = r.ttk < r.death;
    return r;
  })();
  scenarios.push({ L, mob: id, same, gap, cursedSolo, cursedParty, xpSame: killXp({ xp: 0, mobL: L, heroL: L }), xpLow: killXp({ xp: 0, mobL: L - 1, heroL: L }), xpHi: killXp({ xp: 0, mobL: L + 2, heroL: L }), xpBoss: killXp({ xp: 0, mobL: L, heroL: L, boss: true }), need: xpNeed(L) });
}

// solo win rate curve 1..25
const soloCurve = [];
for (let L = 1; L <= 25; L++) {
  const id = sampleByLvl[L] || sampleByLvl[Object.keys(sampleByLvl).map(Number).sort((a, b) => Math.abs(a - L) - Math.abs(b - L))[0]];
  if (!id) continue;
  const mob = mobEff(id, mobPatches[id]);
  const h = heroAt(L, 0);
  const r = fight(h, mob, { dotDps: avgDotDps(h, WEAPON_KIT.sword.traits), skillDps: h.dps * 0.12 * weaponSkillPowerMult(L) });
  // «win rate»: детерминированный прокси = clamp(death/ttk * 0.5, 0, 1) сглаженный
  const margin = r.death / Math.max(0.01, r.ttk);
  const winRate = Math.max(0, Math.min(1, (margin - 1.0) / 3.5)); // L1 ~100%, L25 ~40%
  soloCurve.push({ L, mob: id, win: r.win, ttk: r.ttk, death: r.death, winRate: +winRate.toFixed(3), press: soloPressure(L) });
}

// ---------- SQL ----------
function esc(s) { return String(s).replace(/'/g, "''"); }
function sqlUpsert(kind, id, data, by = "rebalance") {
  const js = esc(JSON.stringify(data));
  return `INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES ('${kind}', '${esc(id)}', '${js}', 1, '${by}', strftime('%s','now')*1000)
ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = game_overrides.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at;`;
}

let apply = [];
apply.push("-- MorrisCurse rebalance: admin overrides (идемпотентно). LOCAL D1 only until user «ок».");
apply.push("-- Generated by tools/balance/sim.mjs");
for (const [id, p] of Object.entries(mobPatches)) apply.push(sqlUpsert("mob", id, p));
for (const [id, p] of Object.entries(weaponPatches)) apply.push(sqlUpsert("weapon", id, p));
apply.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");

// rollback: restore prod rows we have, delete keys we newly introduced
let prod = [];
try {
  const raw = JSON.parse(readFileSync(join(outDir, "prod-overrides-raw.json"), "utf8"));
  prod = raw[0]?.results || raw.results || [];
} catch { /* empty */ }
const prodKeys = new Set(prod.map((r) => r.kind + ":" + r.id));
let rollback = [];
rollback.push("-- Rollback rebalance overrides to pre-rebalance prod state");
for (const [id] of Object.entries(mobPatches)) {
  if (!prodKeys.has("mob:" + id)) rollback.push(`DELETE FROM game_overrides WHERE kind = 'mob' AND id = '${esc(id)}';`);
}
for (const [id] of Object.entries(weaponPatches)) {
  if (!prodKeys.has("weapon:" + id)) rollback.push(`DELETE FROM game_overrides WHERE kind = 'weapon' AND id = '${esc(id)}';`);
}
for (const r of prod) {
  rollback.push(sqlUpsert(r.kind, r.id, JSON.parse(r.data), "rollback"));
}
rollback.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");

writeFileSync(join(root, "tools/balance/apply.sql"), apply.join("\n") + "\n");
writeFileSync(join(root, "tools/balance/rollback.sql"), rollback.join("\n") + "\n");
writeFileSync(join(outDir, "sim-results.json"), JSON.stringify({ scenarios, soloCurve, beforeAfter: beforeAfter.slice(0, 30), weaponKit: WEAPON_KIT, progression: PROGRESSION, cursed: { hp: ZONE_GEN.cursedHp, dmg: ZONE_GEN.cursedDmg }, dropNote: "DROP_PCT bumped ~35% in balance.ts" }, null, 2));

// checks
const fails = [];
for (const s of scenarios) {
  if (!s.same.win) fails.push(`L${s.L} same-level should win`);
  if (s.cursedSolo.win) fails.push(`L${s.L} cursed solo should LOSE`);
  if (!s.cursedParty.win) fails.push(`L${s.L} cursed party3 should win`);
  // gap: hard but preferably winnable at low-mid; at high L may tip — allow lose at L>=20
  if (s.L <= 15 && !s.gap.win) fails.push(`L${s.L} gear-1 vs mob+1 should be winnable (hard)`);
}
if (fails.length) {
  console.error("SIM FAILS:\n" + fails.join("\n"));
  // still write report; exit 1 after
}

console.log("scenarios:");
for (const s of scenarios) {
  console.log(`  L${s.L} ${s.mob}: same win=${s.same.win} ttk=${s.same.ttk}/${s.same.death} | gap win=${s.gap.win} ttk=${s.gap.ttk}/${s.gap.death} | cursedSolo win=${s.cursedSolo.win} | party win=${s.cursedParty.win} | xp ${s.xpSame}/${s.need}`);
}
console.log("solo curve (winRate):", soloCurve.filter((x) => [1, 5, 10, 15, 20, 25].includes(x.L)).map((x) => `L${x.L}:${(x.winRate * 100).toFixed(0)}%`).join(" "));
console.log("mobs", Object.keys(mobPatches).length, "weapons", Object.keys(weaponPatches).length);
console.log("FAILS", fails.length);
if (fails.length) process.exitCode = 1;
