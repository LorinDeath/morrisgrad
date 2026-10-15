#!/usr/bin/env node
// Per-ITEM weapon R skill + 1–2 DoTs → tools/balance/apply.sql (item overrides) + WEAPON_SKILLS.md
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { buildSync } from "esbuild";
import { tmpdir } from "os";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "../..");
const outDir = "/workspace/morrisgrad-round3/rebalance";
mkdirSync(outDir, { recursive: true });

const dir = mkdtempSync(join(tmpdir(), "mcitem-"));
writeFileSync(join(dir, "e.ts"), `
export { ITEM_BY_ID } from ${JSON.stringify(join(root, "server/meta/defs.ts"))};
export { validatePatch, currentValues } from ${JSON.stringify(join(root, "server/meta/overrides.ts"))};
export { WEAPON_TYPES } from ${JSON.stringify(join(root, "server/meta/shared.ts"))};
`);
buildSync({ entryPoints: [join(dir, "e.ts")], bundle: true, format: "esm", platform: "node", outfile: join(dir, "o.mjs"), logLevel: "error" });
const B = await import(pathToFileURL(join(dir, "o.mjs")).href);
const { ITEM_BY_ID, validatePatch, WEAPON_TYPES } = B;

const weapons = Object.values(ITEM_BY_ID).filter((i) => i.slot === "weapon");

// --- thematic pools (existing ids only) ---
const RUN = {
  war_axe: "war_axe", spear: "spear", daggers: "daggers", fire_spark: "fire_spark",
  orbit_skulls: "orbit_skulls", chain_bolt: "chain_bolt", ice_fan: "ice_fan",
  thorn_bow: "thorn_bow", moon_orb: "moon_orb", glyph_mine: "glyph_mine",
  sun_beam: "sun_beam", split_shard: "split_shard", plague_flask: "plague_flask",
  fly_blades: "fly_blades",
};
const AB = (id) => "ab:" + id;

// Default by wtype (low-tier fallback)
const BY_TYPE = {
  spear: RUN.spear, daggers: RUN.daggers, book: RUN.fire_spark, staff: RUN.sun_beam,
  sword: RUN.war_axe, bow: RUN.thorn_bow, axe: RUN.war_axe, fly_blades: RUN.fly_blades,
  moon_blade: RUN.moon_orb,
};

// Keyword → skill (checked against id+name+monster+lore)
const KEYWORDS = [
  [/fly|мух|лезв|blade_fly|swarm|мошкар|жало/i, RUN.fly_blades],
    [/swarm_mother|матк|рой|swarm_call/i, AB("swarm_call")],
  [/stag|олен|white_stag/i, AB("stag_charge")],
  [/thorn_matron|садовниц|тернов.*цвет|thorn_bloom/i, AB("thorn_bloom")],
  [/rust_baron|барон|шестер|gear_spin/i, AB("gear_spin")],
  [/warden|страж.*проклят|warden_slam/i, AB("warden_slam")],
  [/moon_sentinel|безветр|штиль|dead_calm|violet_moon/i, AB("dead_calm")],
  [/cooler_maw|пасть|вихрь-втяг|vortex/i, AB("vortex_pull")],
  [/silencer|глушител|тишин.*камер|total_silence/i, AB("total_silence")],
  [/fallen_star|падш.*звезд|starfall|звездопад/i, AB("starfall")],
  [/violet_queen|затемн|eclipse|скипетр затм/i, AB("eclipse")],
  [/огон|жар|огнен|heat_golem|spark_imp|fire_spark|fireball|пыльц(?!е)|солнеч/i, RUN.fire_spark],
  [/лёд|мороз|лунн.*пыл|ice|frost|moon_moth|moon_jelly/i, RUN.ice_fan],
  [/молни|разряд|цепн|cable|spark|chain/i, RUN.chain_bolt],
  [/яд|чум|паук|гнилой|rot_spider|plague|spitter|яд/i, RUN.plague_flask],
  [/череп|смерть|упырь|ghoul|shade|orbit|кости|скелет/i, RUN.orbit_skulls],
  [/глиф|рун|кристалл|golem|split|оскол|pixel|glitch/i, RUN.split_shard],
  [/лун|moon|crescent|серебр|рикшет|moon_orb|moon_wolf|moon_blade/i, RUN.moon_orb],
  [/солн|солнеч|sun_beam|lantern_ghost|aezer_staff|аезер/i, RUN.sun_beam],
  [/терн|шип|thorn|vine|bow|пращ|лук/i, RUN.thorn_bow],
  [/кинжал|клык|зуб|dagger|нож|лезви/i, RUN.daggers],
  [/копь|рогатин|клюв|spear|трезуб|хлыст-лоза/i, RUN.spear],
  [/топор|молот|кувалд|секир|axe|клешн/i, RUN.war_axe],
  [/ловуш|мин|glyph|веретен/i, RUN.glyph_mine],
  [/метеор|meteor|аезер/i, AB("meteor")],
  [/огненн.*шар|fireball/i, AB("fireball")],
  [/морозн.*звезд|frost_nova/i, AB("frost_nova")],
  [/вихрь стал|whirlwind/i, AB("whirlwind")],
  [/удар в спину|backstab/i, AB("backstab")],
  [/колющ|pierce/i, AB("pierce")],
  [/дождь копий|spear_rain/i, AB("spear_rain")],
  [/прыжок|leap/i, AB("leap_strike")],
  [/коварн|trick/i, AB("trick_strike")],
  [/сажа|smoke/i, AB("smoke_bomb")],
  [/рывок нулев|shadow_step/i, AB("shadow_step")],
  [/звездн.*меч|star_knight|starfall/i, AB("starfall")],
  [/эхо|echo_warden/i, AB("dead_calm")],
  [/тонк|thin|void_eye|faceless|нотный/i, AB("total_silence")],
  [/кристальн.*дыхан|drake/i, AB("meteor")],
];

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** Stronger skills unlocked by level/rarity — upgrade pool. */
function upgradeSkill(rs, lvl, rarity) {
  const rank = RARITY_RANK[rarity] || 0;
  const power = lvl + rank * 3;
  // early: keep run skills; mid: allow hero basics; high: monster/ultimates already assigned stay
  if (rs.startsWith("ab:")) return rs; // unique monster/hero stay
  if (power >= 28) {
    // mythic-tier: map run → strong ab
    const hi = {
      fire_spark: AB("fireball"), sun_beam: AB("meteor"), ice_fan: AB("frost_nova"),
      war_axe: AB("whirlwind"), spear: AB("spear_rain"), daggers: AB("trick_strike"),
      thorn_bow: AB("thorn_bloom"), moon_orb: AB("dead_calm"), plague_flask: AB("vortex_pull"),
      fly_blades: AB("fly_blade_dash"), chain_bolt: AB("starfall"), split_shard: AB("eclipse"),
      orbit_skulls: AB("total_silence"), glyph_mine: AB("warden_slam"),
    };
    return hi[rs] || rs;
  }
  if (power >= 18) {
    const mid = {
      fire_spark: AB("fireball"), sun_beam: AB("meteor"), ice_fan: AB("frost_nova"),
      war_axe: AB("whirlwind"), spear: AB("pierce"), daggers: AB("shadow_step"),
      thorn_bow: RUN.thorn_bow, moon_orb: RUN.moon_orb, plague_flask: RUN.plague_flask,
      fly_blades: AB("fly_blade_dash"), chain_bolt: RUN.chain_bolt, split_shard: RUN.split_shard,
      orbit_skulls: RUN.orbit_skulls, glyph_mine: RUN.glyph_mine,
    };
    return mid[rs] || rs;
  }
  if (power >= 12) {
    const low = {
      fire_spark: RUN.fire_spark, sun_beam: RUN.sun_beam, daggers: AB("trick_strike"),
      spear: AB("pierce"), war_axe: AB("backstab"), ice_fan: RUN.ice_fan,
    };
    return low[rs] || rs;
  }
  return rs;
}

const SPECIAL = {
  aezer_staff: AB("meteor"),
  guard_axe: AB("warden_slam"),
  greenpoise_bow: RUN.plague_flask,
};

function pickSkill(w) {
  const blob = [w.id, w.name, w.monster || "", w.grantsAbility || ""].join(" "); // без lore — ложные совпадения
  if (SPECIAL[w.id]) return SPECIAL[w.id];
  // 1) explicit grantsAbility from bestiary (boss/rare unique)
  if (w.grantsAbility) return AB(w.grantsAbility);
  // 2) keywords
  for (const [re, sk] of KEYWORDS) if (re.test(blob)) return upgradeSkill(sk, w.lvl || 1, w.rarity);
  // 3) wtype default
  return upgradeSkill(BY_TYPE[w.wtype] || RUN.war_axe, w.lvl || 1, w.rarity);
}

function pickDots(w, rs) {
  const rank = RARITY_RANK[w.rarity] || 0;
  const lvl = w.lvl || 1;
  const chance = Math.min(45, 18 + rank * 5 + Math.floor(lvl / 8));
  const dps = Math.min(22, 9 + rank * 2 + Math.floor(lvl / 10));
  const dur = Math.round((2.5 + rank * 0.4 + lvl * 0.04) * 10) / 10;
  const blob = [w.id, w.name, w.monster || "", w.wtype || "", rs].join(" ");
  let primary;
  if (/яд|паук|чум|гни|rot|plague|poison|spitter|vine|thin|eclipse|plague_flask/i.test(blob)) primary = { k: "poison", chance, dpsPct: Math.max(6, dps - 3), dur: dur + 2 };
  else if (/огон|жар|искр|fire|heat|sun|spark|метеор|meteor|fireball|fire_spark|sun_beam|aezer/i.test(blob)) primary = { k: "burn", chance, dpsPct: dps + 2, dur };
  else if (/лёд|мороз|лун|ice|frost|moon|штиль/i.test(blob)) primary = { k: "poison", chance: Math.max(15, chance - 5), dpsPct: Math.max(6, dps - 2), dur: dur + 1 }; // cold→slow poison vibe; add freeze as 2nd
  else if (/bleed|клык|нож|кинжал|меч|топор|копь|лезв|жало|claw|blade|sword|axe|spear|dagger|хлыст|тесак|кирк/i.test(blob)) primary = { k: "bleed", chance, dpsPct: dps, dur };
  else primary = { k: "bleed", chance, dpsPct: dps, dur };

  const traits = [primary];
  // 2nd DoT/effect for rare+
  if (rank >= 2) {
    if (primary.k === "bleed" && /яд|паук|чум|vine|spider/i.test(blob)) traits.push({ k: "poison", chance: Math.max(12, chance - 10), dpsPct: Math.max(6, dps - 4), dur: dur + 2 });
    else if (primary.k === "burn") traits.push({ k: "slow", chance: Math.max(15, chance - 8) });
    else if (/лун|мороз|ice|moon|frost/i.test(blob)) traits.push({ k: "freeze", chance: Math.min(18, 8 + rank * 2), dur: Math.min(1.5, 0.5 + rank * 0.2) });
    else if (rank >= 3) traits.push(primary.k === "bleed" ? { k: "burn", chance: Math.max(12, chance - 12), dpsPct: Math.max(8, dps - 2), dur: Math.max(2, dur - 0.5) } : { k: "bleed", chance: Math.max(12, chance - 10), dpsPct: Math.max(8, dps - 2), dur });
    else if (rank === 2) traits.push({ k: "slow", chance: Math.max(15, chance - 10) });
  }
  // mythic/epic boss: ensure 2
  if (rank >= 3 && traits.length < 2) traits.push({ k: "bleed", chance: 20, dpsPct: 10, dur: 3 });
  return traits.slice(0, 2);
}

// Load prod item overrides to merge
let prodItems = {};
try {
  const raw = JSON.parse(readFileSync(join(outDir, "prod-overrides-raw.json"), "utf8"));
  const rows = raw[0]?.results || raw.results || [];
  for (const r of rows) if (r.kind === "item") prodItems[r.id] = JSON.parse(r.data);
} catch {}

const rows = [];
const patches = {};
for (const w of weapons.sort((a, b) => (a.lvl || 1) - (b.lvl || 1) || a.id.localeCompare(b.id))) {
  const rs = pickSkill(w);
  const traits = pickDots(w, rs);
  const prev = prodItems[w.id] || {};
  // merge: keep prod numeric/salvage fields if any, set rs+traits
  const patch = { ...prev, rs, traits };
  // strip illegal status.* from old weapon-like fields if any leaked
  for (const k of Object.keys(patch)) if (k.startsWith("status.")) delete patch[k];
  const v = validatePatch("item", w.id, patch);
  if (typeof v === "string") {
    // retry minimal
    const v2 = validatePatch("item", w.id, { rs, traits });
    if (typeof v2 === "string") { console.error("FAIL", w.id, v, v2); process.exit(1); }
    patches[w.id] = v2;
    rows.push({ id: w.id, name: w.name, lvl: w.lvl || 1, rarity: w.rarity, wtype: w.wtype, monster: w.monster || "", rs: v2.rs, traits: v2.traits, note: "minimal" });
  } else {
    patches[w.id] = v;
    rows.push({ id: w.id, name: w.name, lvl: w.lvl || 1, rarity: w.rarity, wtype: w.wtype, monster: w.monster || "", rs: v.rs, traits: v.traits });
  }
}

// Clear type-level rs/traits (keep combat geometry from current apply / defaults)
const weaponClears = {};
for (const [id, def] of Object.entries(WEAPON_TYPES)) {
  const cur = B.currentValues("weapon", id);
  const patch = {
    cd: cur.cd ?? def.cd,
    "atk.kind": cur["atk.kind"] ?? def.atk.kind,
    "atk.range": cur["atk.range"] ?? def.atk.range,
    ...(def.atk.width != null ? { "atk.width": cur["atk.width"] ?? def.atk.width } : {}),
    ...(def.atk.arc != null ? { "atk.arc": cur["atk.arc"] ?? def.atk.arc } : {}),
    ...(def.atk.max != null ? { "atk.max": cur["atk.max"] ?? def.atk.max } : {}),
    ...(def.atk.count != null ? { "atk.count": cur["atk.count"] ?? def.atk.count } : {}),
    ...(def.atk.spread != null ? { "atk.spread": cur["atk.spread"] ?? def.atk.spread } : {}),
    ...(def.atk.per != null ? { "atk.per": cur["atk.per"] ?? def.atk.per } : {}),
    "status.knock": cur["status.knock"] ?? def.status?.knock ?? 0,
    rs: "",
    traits: [],
  };
  if (id === "axe") patch["atk.range"] = Math.max(patch["atk.range"], 250);
  if (id === "sword") patch["atk.max"] = Math.max(patch["atk.max"] || 4, 5);
  const v = validatePatch("weapon", id, patch);
  if (typeof v === "string") { console.error("weapon clear fail", id, v); process.exit(1); }
  weaponClears[id] = v;
}

function esc(s) { return String(s).replace(/'/g, "''"); }
function upsert(kind, id, data, by = "rebalance") {
  const ts = Date.now();
  return `INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES ('${kind}', '${esc(id)}', '${esc(JSON.stringify(data))}', 1, '${by}', ${ts}) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = game_overrides.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at;`;
}


// Read existing apply.sql mob lines to preserve
const oldApply = readFileSync(join(__dir, "apply.sql"), "utf8");
const mobPatches = {};
for (const l of oldApply.split("\n")) {
  const m = l.match(/VALUES \('mob', '([^']+)', '(\{.*?\})'/);
  if (m) { try { mobPatches[m[1]] = JSON.parse(m[2].replace(/''/g, "'")); } catch {} }
}

let apply = [];
apply.push("-- MorrisCurse rebalance apply (local). Mobs + per-ITEM weapon skills/DoTs. Type rs cleared.");
apply.push("-- Generated by tools/balance/gen-item-skills.mjs");
for (const [id, p] of Object.entries(mobPatches)) apply.push(upsert("mob", id, p));
for (const [id, p] of Object.entries(weaponClears)) apply.push(upsert("weapon", id, p));
for (const [id, p] of Object.entries(patches)) apply.push(upsert("item", id, p));
apply.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");
writeFileSync(join(__dir, "apply.sql"), apply.join("\n") + "\n");

// Rollback: prod snapshot + delete our new item/weapon/mob keys not in prod
let prod = [];
try {
  const raw = JSON.parse(readFileSync(join(outDir, "prod-overrides-raw.json"), "utf8"));
  prod = raw[0]?.results || raw.results || [];
} catch {}
const prodKeys = new Set(prod.map((r) => r.kind + ":" + r.id));
let rollback = [];
rollback.push("-- Rollback rebalance to pre-rebalance prod overrides");
for (const id of Object.keys(patches)) if (!prodKeys.has("item:" + id)) rollback.push(`DELETE FROM game_overrides WHERE kind = 'item' AND id = '${esc(id)}';`);
for (const id of Object.keys(weaponClears)) if (!prodKeys.has("weapon:" + id)) rollback.push(`DELETE FROM game_overrides WHERE kind = 'weapon' AND id = '${esc(id)}';`);
// mobs from apply
for (const id of Object.keys(mobPatches)) {
  if (!prodKeys.has("mob:" + id)) rollback.push(`DELETE FROM game_overrides WHERE kind = 'mob' AND id = '${esc(id)}';`);
}
for (const r of prod) rollback.push(upsert(r.kind, r.id, JSON.parse(r.data), "rollback"));
rollback.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");
writeFileSync(join(__dir, "rollback.sql"), rollback.join("\n") + "\n");

// Markdown table
const SKILL_NAME = Object.fromEntries([
  ...Object.entries(RUN).map(([k]) => [k, k]),
]);
// enrich names from rs options dump if present
let names = {};
try {
  for (const o of JSON.parse(readFileSync("/tmp/mc-rs.json", "utf8"))) names[o.id] = o.name;
} catch {}
function skillLabel(rs) { return names[rs] || rs; }
function traitLabel(t) {
  const n = { burn: "Поджог", bleed: "Кровотечение", poison: "Яд", freeze: "Заморозка", slow: "Замедление" }[t.k] || t.k;
  const bits = [n];
  if (t.chance != null) bits.push(`${t.chance}%`);
  if (t.dpsPct != null) bits.push(`${t.dpsPct}%/с`);
  if (t.dur != null) bits.push(`${t.dur}с`);
  return bits.join(" ");
}

let md = `# Оружие → навык R → DoT (per-item)

Все **${rows.length}** оружия каталога. Навыки только существующие (run / \`ab:…\` герои и монстры).
Приоритет: **правка предмета** > тип оружия > выпавший rs. Типам \`rs\` очищен.

| Ур. | Редк. | id | Название | Тип | Навык R | DoT / эффекты |
|---:|---|---|---|---|---|---|
`;
for (const r of rows) {
  md += `| ${r.lvl} | ${r.rarity} | \`${r.id}\` | ${r.name} | ${r.wtype || "—"} | **${skillLabel(r.rs)}** (\`${r.rs}\`) | ${r.traits.map(traitLabel).join("; ")} |\n`;
}
md += `\nВсего: ${rows.length}. Сгенерировано \`tools/balance/gen-item-skills.mjs\`.\n`;
writeFileSync(join(outDir, "WEAPON_SKILLS.md"), md);
writeFileSync(join(outDir, "item-skill-patches.json"), JSON.stringify({ patches, weaponClears, rows }, null, 2));

console.log("weapons", rows.length);
console.log("sample", rows.slice(0, 5).map((r) => `${r.id} → ${r.rs} [${r.traits.map((t) => t.k).join("+")}]`).join("\n"));
console.log("boss samples", rows.filter((r) => String(r.rs).startsWith("ab:")).slice(0, 8).map((r) => `${r.id} → ${r.rs}`).join("\n"));
console.log("wrote apply.sql, rollback.sql, WEAPON_SKILLS.md");
