#!/usr/bin/env node
// v2: генератор apply_v2.sql / rollback_v2.sql (все статы — в game_overrides) + сим сценариев.
// node tools/balance/sim_v2.mjs
import { buildSync } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
const OUT = "/workspace/morrisgrad-round3/rebalance-v2";
buildSync({ stdin: { contents: `export * from "./server/meta/balance.ts"; export { softCap, STAT_CAPS, armorToReduction } from "./server/meta/shared.ts"; export { CONTENT, genItemStats } from "./server/meta/content.ts"; export { ITEMS } from "./server/meta/defs.ts"; export { ZONE_GEN } from "./server/meta/zoneGen.ts"; export { validatePatch } from "./server/meta/overrides.ts";`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, format: "esm", platform: "node", outfile: "/tmp/simv2.mjs", logLevel: "error" });
const B = await import("/tmp/simv2.mjs?" + Date.now());
const { CONTENT, ZONE_GEN: G, refBuild, mitigateDamage, softCap, STAT_CAPS, armorToReduction, OUTLEVEL_SOLO_BOSS, weaponHitMult, weaponAvg, itemBudget, validatePatch } = B;
const prod = JSON.parse(readFileSync(OUT + "/prod-overrides-raw.json", "utf8"))[0].results;
const P = Object.fromEntries(prod.map((r) => [r.kind + ":" + r.id, JSON.parse(r.data)]));
const esc = (s) => String(s).replace(/'/g, "''");
const up = (k, id, d, by) => `INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES ('${k}', '${esc(id)}', '${esc(JSON.stringify(d))}', 1, '${by}', ${Date.now()}) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = game_overrides.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at;`;
const apply = ["-- MorrisCurse rebalance-v2: ВСЕ статы предметов/мобов/боссов в game_overrides (правятся в админке). LOCAL D1 only."], touched = [];
const fails = [];
// предметы: статы из v2-бюджета; per-item rs/traits/salvage/lvl/req из прода сохраняются
const genIds = new Set(CONTENT.items.map((i) => i.id));
const hs = (s) => { let h = 0; for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; };
const allItems = [...CONTENT.items, ...B.ITEMS.filter((i) => !genIds.has(i.id) && i.slot).map((i) => ({ ...i, lvl: i.lvl || 1, req: i.req || i.lvl || 1, stats: B.genItemStats(i.slot, P["item:" + i.id]?.lvl || i.lvl || 1, i.rarity || "common", hs(i.id), i.wtype) }))];
for (const it of allItems) {
  const old = P["item:" + it.id] || {};
  const d = { lvl: old.lvl ?? it.lvl, req: old.req ?? it.req };
  for (const k of ["dmgMin", "dmgMax", "armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct"]) d["stats." + k] = it.stats[k] || 0; // явные 0 — старые базовые значения не «протекают»
  for (const k of ["rs", "traits", "salvage"]) if (old[k] != null) d[k] = old[k];
  const v = validatePatch("item", it.id, d); if (typeof v === "string") { fails.push(`item ${it.id}: ${v}`); continue; }
  apply.push(up("item", it.id, v, "rebalance-v2")); touched.push("item:" + it.id);
}
// мобы и мировые боссы
const mobRows = [];
for (const [id, m] of Object.entries(CONTENT.zoneMobs)) {
  const old = P["mob:" + id] || {};
  const d = { lvl: m.lvl, hp: m.hp, dmg: m.dmg, armor: m.armor, speed: old.speed ?? m.speed, aggro: old.aggro ?? m.aggro, xp: m.xp, radius: old.radius ?? m.radius, skills: old.skills || [] };
  const v = validatePatch("mob", id, d); if (typeof v === "string") { fails.push(`mob ${id}: ${v}`); continue; }
  apply.push(up("mob", id, v, "rebalance-v2")); touched.push("mob:" + id);
  mobRows.push({ id, name: m.name, lvl: m.lvl, boss: !!m.boss, before: old.hp != null ? { hp: old.hp, dmg: old.dmg, armor: old.armor } : null, after: { hp: v.hp, dmg: v.dmg, armor: v.armor } });
}
apply.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");
const rb = ["-- rollback v2 → состояние прода (snapshot e4ca2ca)"];
for (const k of touched) { const [kind, id] = k.split(":"); rb.push(P[k] ? up(kind, id, P[k], "rollback-v2") : `DELETE FROM game_overrides WHERE kind='${kind}' AND id='${esc(id)}';`); }
rb.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");
writeFileSync("tools/balance/apply_v2.sql", apply.join("\n") + "\n");
writeFileSync("tools/balance/rollback_v2.sql", rb.join("\n") + "\n");

// ---------- сим: дискретный бой, броня-soak на каждый удар ----------
const mobAt = (L, size = "s", role = "melee") => ({ ...B.mobStats(L, role, size), lvl: L });
function hero(L, arch = "bruiser", gearD = 0, syn = {}) {
  const b = refBuild(Math.max(1, L + gearD), arch);
  const crit = softCap(b.crit + (syn.crit || 0), STAT_CAPS.critPct) / 100;
  const as = softCap(b.atkSp + (syn.as || 0), STAT_CAPS.atkSpeedPct) / 100;
  const ls = softCap(b.life + (syn.ls || 0), STAT_CAPS.lifestealPct) / 100;
  const hpMul = syn.hpMul || 1, dmgMul = syn.dmgMul || 1;
  const hit = b.hit / (1 + 0.75 * Math.min(0.45, b.crit / 100)) * dmgMul; // без крита
  return { L, arch, hp: b.hp * hpMul, red: armorToReduction(b.armor * (syn.armMul || 1)), hit, aps: (1000 / 450) * (1 + as), crit, critMul: 1.75 + (syn.critDmg || 0), ls, skill: arch === "caster" ? 1.55 : 1.3 };
}
// fight: n героев против моба; kite=true — соло уходит из мили (обычный моб не догоняет, проклятый/босс догоняет)
function fight(hs, m, { cursed = false, world = false, kite = false, maxT = 900 } = {}) {
  const gm = B.levelGapDmgMult(m.lvl || hs[0].L, hs[0].L); let mhp = m.hp * (cursed ? G.cursedHp : 1), arm = m.armor * (cursed ? 1.3 : 1), dmg = m.dmg * (cursed ? G.cursedDmg : 1);
  const hp = hs.map((h) => h.hp); let t = 0, dt = 0.1, enr = false, regenAcc = 0, heal = 0;
  while (t < maxT) {
    t += dt;
    const alive = hs.filter((_, i) => hp[i] > 0); if (!alive.length) return { win: false, t: +t.toFixed(1), why: "dead" };
    let dealt = 0;
    for (const h of alive) { const per = mitigateDamage(h.hit * (1 + h.crit * (h.critMul - 1)), arm) * h.skill; const d = per * h.aps * dt * (kite ? 0.55 : 1); dealt += d; heal = d * h.ls; const i = hs.indexOf(h); hp[i] = Math.min(h.hp, hp[i] + heal); }
    mhp -= dealt; if (mhp <= 0) return { win: true, t: +t.toFixed(1) };
    if (world && !enr && hs[0].L < m.lvl + OUTLEVEL_SOLO_BOSS && ((alive.length < G.bossEnrageMinPlayers && t >= G.bossEnrageSec) || t >= G.bossSoftEnrageSec)) enr = true;
    // кайт: обычный моб почти не попадает; проклятый (×cursedSpeed + прыжки) и мировой босс (рывки) — догоняют ~85%
    const catchUp = kite ? (cursed || world ? 0.85 : 0.1) : 1;
    const tanks = alive.filter((h) => h.arch === "tank" || h.arch === "bruiser"); const pool = world && tanks.length ? tanks : alive; const tank = world && pool.length > 1 ? pool[Math.floor(t / 10) % pool.length] : pool.reduce((a, b) => (b.hp > a.hp ? b : a)); // рейд: танк+брузер меняются каждые 10 с, ДД ловят только AoE
    const ti = hs.indexOf(tank);
    hp[ti] -= (dmg * gm / 1.1) * dt * (1 - tank.red) * catchUp * (enr ? G.bossEnrageDmg : 1) * (world ? 1 : 1);
    if (world) for (const h of alive) if (h !== tank) hp[hs.indexOf(h)] -= dmg * gm * 0.15 * dt * (1 - h.red) * (enr ? G.bossEnrageDmg : 1); // AoE по всем
  }
  return { win: false, t: maxT, why: "timeout" };
}
const R = { normal: [], world: [], synergy: [], weapons: [] };
for (const L of [5, 10, 15, 20, 25]) {
  const m = mobAt(L), mUp = mobAt(L + 1);
  R.normal.push({ L, mob: m, same: fight([hero(L)], m), gapHard: fight([hero(L, "bruiser", -1)], mUp), low_vs_high: { L5vsL8_hitAfterArmor: L === 5 ? mitigateDamage(hero(5).hit, mobAt(8).armor) : undefined }, kiteCursed: fight([hero(L)], m, { cursed: true, kite: true }), cursedSolo: fight([hero(L)], m, { cursed: true }), cursedParty3: fight([hero(L, "tank"), hero(L, "caster"), hero(L, "assassin")], m, { cursed: true }) });
  const wb = mobAt(L, "huge", "caster");
  R.world.push({ L, hp: wb.hp, armor: wb.armor, soloKite: fight([hero(L)], wb, { world: true, kite: true }), solo: fight([hero(L)], wb, { world: true }),
    party5: fight([hero(L, "tank"), hero(L, "caster"), hero(L, "assassin"), hero(L, "bruiser"), hero(L, "balanced")], wb, { world: true }),
    soloOutlevel: fight([hero(L + OUTLEVEL_SOLO_BOSS)], wb, { world: true, kite: true, maxT: 1800 }), soloOutlevel5: fight([hero(L + 5)], wb, { world: true, kite: true, maxT: 1800 }) });
}
const L = 20, m20 = mobAt(20);
const builds = {
  "crit+atkSpeed (assassin)": hero(L, "assassin", 0, { crit: 60, as: 60, critDmg: 0.5 }),
  "lifesteal tank": hero(L, "tank", 0, { ls: 40 }),
  "glass-cannon caster": hero(L, "caster", 0, { crit: 30, dmgMul: 1.6, hpMul: 0.7 }),
  "baseline bruiser": hero(L),
};
for (const [n, h] of Object.entries(builds)) { const f = fight([h], m20), c = fight([h], m20, { cursed: true }); R.synergy.push({ build: n, crit: +(h.crit * 100).toFixed(1), atkSpeedPct: +((h.aps / (1000 / 450) - 1) * 100).toFixed(1), lifesteal: +(h.ls * 100).toFixed(1), dpsVsMob: Math.round(mitigateDamage(h.hit * (1 + h.crit * (h.critMul - 1)), m20.armor) * h.skill * h.aps), normal: f, cursedSolo: c }); }
for (const w of Object.keys(B.WEAPON_CD)) { const hit = weaponAvg(20, "epic") * weaponHitMult(w); R.weapons.push({ w, cd: B.WEAPON_CD[w], hit: Math.round(hit), dmgMin: Math.round(hit * 0.55), dmgMax: Math.round(hit * 1.45), dpsIndex: Math.round(hit * (B.WEAPON_VOLLEY[w] || 1) / (B.WEAPON_CD[w] / 1000)) }); }
// проверки
for (const n of R.normal) { if (!n.same.win) fails.push(`L${n.L} same-level`); if (n.kiteCursed.win) fails.push(`L${n.L} cursed kite should fail`); if (n.cursedSolo.win) fails.push(`L${n.L} cursed solo should fail`); if (!n.cursedParty3.win) fails.push(`L${n.L} cursed party3`); }
for (const w of R.world) { if (w.soloKite.win || w.solo.win) fails.push(`WB L${w.L} solo should fail`); if (!w.party5.win || w.party5.t < 150 || w.party5.t > 400) fails.push(`WB L${w.L} party5 ${w.party5.t}s`); if (!w.soloOutlevel.win) fails.push(`WB L${w.L} solo +${OUTLEVEL_SOLO_BOSS} should win`); }
for (const s of R.synergy) if (s.lifesteal > STAT_CAPS.lifestealPct + 0.01 || s.crit > STAT_CAPS.critPct + 0.01) fails.push("cap broken " + s.build);
writeFileSync(OUT + "/sim-v2.json", JSON.stringify({ ...R, mobRows, fails, caps: STAT_CAPS, outlevel: OUTLEVEL_SOLO_BOSS }, null, 2));
console.log(JSON.stringify({ normal: R.normal.map((n) => [n.L, n.same.t, n.gapHard.win, n.kiteCursed.win, n.cursedParty3.t, n.low_vs_high.L5vsL8_hitAfterArmor]), world: R.world.map((w) => [w.L, w.hp, w.solo.why, w.party5.win, w.party5.t, w.soloOutlevel.win, w.soloOutlevel.t, w.soloOutlevel5.win, w.solo.t]), syn: R.synergy.map((s) => [s.build, s.dpsVsMob, s.normal.t, s.cursedSolo.win]), weapons: R.weapons.map((w) => [w.w, w.hit, w.dpsIndex]) }));
console.log("items/mobs", touched.length, "FAILS", fails.length, fails.slice(0, 20));
if (process.env.DBG) { const wb = mobAt(20, "huge", "caster"); for (const a of ["tank","caster","assassin","bruiser","balanced"]) { const h = hero(20, a); console.log(a, Math.round(h.hit), wb.armor, Math.round(mitigateDamage(h.hit*(1+h.crit*(h.critMul-1)), wb.armor)*h.skill*h.aps), Math.round(h.hp)); } const h=hero(29); console.log("L29", Math.round(mitigateDamage(h.hit*(1+h.crit*(h.critMul-1)), wb.armor)*h.skill*h.aps), h.hp, wb.dmg); }
if (process.env.DBG2) { for (const L of [5,20]) { const wb = mobAt(L, "huge", "caster"); const hs = ["tank","caster","assassin","bruiser","balanced"].map(a=>hero(L,a)); const d = hs.map(h=>Math.round(mitigateDamage(h.hit*(1+h.crit*(h.critMul-1)), wb.armor)*h.skill*h.aps)); const rb = ["tank","caster","assassin","bruiser","balanced"].map(a=>{const r=refBuild(L,a); return Math.round(mitigateDamage(r.hit, wb.armor)/r.hit*r.dps)}); console.log(L, wb.hp, wb.dmg, d, rb, hs.map(h=>Math.round(h.hp)+"/"+h.red.toFixed(2))); } }
