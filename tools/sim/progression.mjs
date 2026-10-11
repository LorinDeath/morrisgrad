// Симуляция темпа прогрессии «Проклятых» (ур. 1–25) по тем же данным, что использует сервер:
// server/meta/balance.ts (кривые) + content.ts (мобы/предметы/дроп из бестиария) + zoneGen.ts (регионы).
// Запуск (из корня с node_modules): node tools/sim/progression.mjs [прогонов=40] [--json]
// Модель: герой фармит регион своего яруса (мобы ур. L−1…L+1 из таблиц регионов), пачки по роли, убивает
// по очереди; получает урон, пока мобы живы (70% телеграфов уклоняется); отдыхает при ХП < 45% (вне боя 4%/с);
// смерть = 5 с + 30 с на возвращение. Каждые 60 мин игры — забег 12 мин; раз в 90 мин — мировой босс яруса
// (группа из 4), раз в 60 мин — шанс 35% встретить редкого. Квесты: +15% к опыту (по журналу квестов).
// Предметы: надевает лучший доступный (требуемый уровень ≤ L) по бюджету/урону.
import { buildSync } from "esbuild";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = mkdtempSync(join(tmpdir(), "mcsim-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export * from ${JSON.stringify(join(root, "server/meta/balance.ts"))};
export { CONTENT } from ${JSON.stringify(join(root, "server/meta/content.ts"))};
export { WORLD_GEN } from ${JSON.stringify(join(root, "server/meta/zoneGen.ts"))};
export { TABLES_READY } from ${JSON.stringify(join(root, "server/meta/zoneTables.ts"))};
export { REWARD_RULES, HERO_MAX_LEVEL } from ${JSON.stringify(join(root, "server/meta/defs.ts"))};`);
const out = join(dir, "bundle.mjs");
buildSync({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
const B = await import(pathToFileURL(out).href);
const { CONTENT, WORLD_GEN, REWARD_RULES } = B;

const RUNS = Number(process.argv.find((a) => /^\d+$/.test(a)) || 40);
const JSON_OUT = process.argv.includes("--json");
const ITEM = Object.fromEntries(CONTENT.items.map((i) => [i.id, i]));
const MOBS = CONTENT.zoneMobs;
const LOOT = CONTENT.loot;
const PACK = { swarm: 4, charger: 2, melee: 2, ranged: 1.5, caster: 1.5, tank: 1 };
const SEEK = 7; // с: поиск следующей пачки (плотность режиссёра ~6 мобов в 480 px, скорость ~110 px/с)

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// мобы, которых фармит герой уровня L: таблицы регионов Аринара/Поляны с подходящим уровнем
const pool = {};
for (let L = 1; L <= 25; L++) {
  const rows = [];
  for (const w of Object.values(WORLD_GEN)) for (const r of w.regions) for (const row of r.table) {
    const m = MOBS[row.type];
    if (m.lvl >= L - 1 && m.lvl <= L + 1) rows.push({ type: row.type, w: row.w });
  }
  if (!rows.length) for (const w of Object.values(WORLD_GEN)) for (const r of w.regions) for (const row of r.table) if (Math.abs(MOBS[row.type].lvl - L) <= 3) rows.push({ type: row.type, w: row.w });
  pool[L] = rows;
}
const tierBoss = (L) => WORLD_GEN.arinar.bosses.find((b) => B.tierOf(MOBS[b.type].lvl) === B.tierOf(L))?.type;
const tierRare = (L) => WORLD_GEN.arinar.rares.find((b) => B.tierOf(MOBS[b.type].lvl) === B.tierOf(L))?.type;

function score(it) { return it.slot === "weapon" ? (it.stats.dmgMin + it.stats.dmgMax) / 2 : B.itemBudget(it.lvl, it.rarity); }

function simulate(seed) {
  const R = mulberry(seed);
  let L = 1, xp = 0, t = 0, deaths = 0, kills = 0;
  const gear = {}; // slot → item
  const got = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  const reach = { 1: 0 };
  const sets = {}; let fullSets = 0;
  const gearAt = {}; const lvlTime = {};
  let nextRun = 3600, nextBoss = 5400, nextRare = 3600;
  const roll = (key, shareMult = 1) => {
    const lt = LOOT[key]; if (!lt) return;
    for (const g of lt.gear) if (R() * 100 < g.chance * shareMult) {
      const it = ITEM[g.item]; got[it.rarity]++;
      (sets[it.monster] = sets[it.monster] || new Set()).add(it.id);
      if (sets[it.monster].size === 5 && !sets[it.monster].done) { sets[it.monster].done = true; fullSets++; }
      if (it.req <= L && (!gear[it.slot] || score(it) > score(gear[it.slot]))) gear[it.slot] = it;
    }
  };
  const gainXp = (n) => {
    xp += n * 1.15; // квесты
    while (L < 25 && xp >= B.xpNeed(L)) { xp -= B.xpNeed(L); lvlTime[L] = t / 3600 - (reach[L] || 0); L++; reach[L] = t / 3600; gearAt[L] = Object.values(gear).reduce((a, it) => a + it.lvl, 0) / 5; }
  };
  const hero = () => {
    const ref = B.refHero(L);
    let hp = 118 + 2 * (L - 1) + Math.min(30, 6 * 0.12 * (L - 1)), armor = 4 + Math.min(10, 0.16 * (L - 1)), regen = 0;
    for (const it of Object.values(gear)) { hp += it.stats.hp || 0; armor += it.stats.armor || 0; regen += it.stats.regen || 0; }
    const w = gear.weapon ? (gear.weapon.stats.dmgMin + gear.weapon.stats.dmgMax) / 2 : 0;
    const dps = ref.dps * (7.5 + w) / (7.5 + B.weaponAvg(L, "uncommon"));
    const red = Math.min(0.6, armor / (armor + 60));
    return { hp, red, dps, regen };
  };
  let cur = hero(), hp = cur.hp;
  while (L < 25 && t < 600 * 3600) {
    cur = hero();
    // забег (12 мин): опыт по формуле сервера, броски дропа ограничены
    if (t >= nextRun) {
      const per = B.mobXp(L), mins = 12;
      gainXp(Math.min(REWARD_RULES.runMaxMinutes * REWARD_RULES.runXpPerMinute * 1.25, mins * REWARD_RULES.runXpPerMinute + 300 * REWARD_RULES.runXpPerKill) * per);
      const runMobs = Object.keys(CONTENT.runLoot).filter((k) => CONTENT.runLoot[k].kind !== "boss");
      for (let i = 0; i < REWARD_RULES.runMaxLootRolls; i++) roll(runMobs[Math.floor(R() * runMobs.length)]);
      t += mins * 60; nextRun = t + 3600; continue;
    }
    // мировой босс яруса: группа из 4, ~3 мин, опыт полностью, дроп каждому
    if (t >= nextBoss) { const b = tierBoss(L); if (b && MOBS[b].lvl <= L + 2) { gainXp(MOBS[b].xp * B.xpLevelMult(MOBS[b].lvl, L)); roll(b); t += 180; kills++; } nextBoss = t + 5400; continue; }
    if (t >= nextRare) { const r = tierRare(L); if (r && R() < 0.35) { gainXp(MOBS[r].xp * B.xpLevelMult(MOBS[r].lvl, L)); roll(r); t += 60; kills++; } nextRare = t + 3600; continue; }
    // пачка
    const rows = pool[L]; let tw = rows.reduce((a, r) => a + r.w, 0) * R(); let row = rows[0];
    for (const r of rows) { tw -= r.w; if (tw <= 0) { row = r; break; } }
    const m = MOBS[row.type];
    const elite = R() < 0.06;
    const n = elite ? 1 : Math.max(1, Math.round(PACK[m.role] * (0.6 + R() * 0.8)));
    const armorRed = Math.min(0.6, m.armor / (m.armor + 60));
    const aoe = n >= 2 ? 1.5 : 1; // дуга меча / пронзание копья / навыки по площади
    const ttk = (m.hp * (elite ? 2.2 : 1) * (1 - armorRed)) / (cur.dps * aoe);
    const mobDps = (m.dmg * (elite ? 1.35 : 1) / 1.1) * (m.role === "ranged" || m.role === "caster" ? 0.3 * 1.3 + 0.2 : 1); // дальние: 70% телеграфов уклонено
    let alive = n, fight = 0;
    for (let i = 0; i < n; i++) {
      const dmg = alive * mobDps * (1 - cur.red) * ttk;
      hp -= dmg; fight += ttk; alive--;
      if (hp <= 0) break;
    }
    t += SEEK + fight;
    if (hp <= 0) { deaths++; t += 35; hp = cur.hp; continue; }
    for (let i = 0; i < n; i++) { gainXp(m.xp * (elite ? 2.5 : 1) * B.xpLevelMult(m.lvl, L)); roll(row.type); kills++; if (elite) roll(row.type); }
    hp = Math.min(cur.hp, hp + cur.regen * (SEEK + fight) + 0.3 * SEEK + Math.max(0, SEEK - 5) * cur.hp * 0.04);
    if (hp < cur.hp * 0.45) { const rest = 5 + (cur.hp - hp) / (cur.hp * 0.04); t += rest; hp = cur.hp; }
  }
  return { reach, deaths, kills, got, fullSets, hours: t / 3600, gearAt, lvlTime };
}

const res = [];
for (let s = 1; s <= RUNS; s++) res.push(simulate(s * 7919));
const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
const pct = (f, p) => { const v = res.map(f).sort((a, b) => a - b); return v[Math.floor(p * (v.length - 1))]; };
const report = { runs: RUNS, reach: {}, drops: {}, deaths: avg((r) => r.deaths), kills: avg((r) => r.kills), fullSets: avg((r) => r.fullSets), gearLvl: {} };
for (const L of [2, 5, 10, 15, 20, 25]) report.reach[L] = { mean: +avg((r) => r.reach[L] ?? 999).toFixed(2), p10: +pct((r) => r.reach[L] ?? 999, 0.1).toFixed(2), p90: +pct((r) => r.reach[L] ?? 999, 0.9).toFixed(2) };
for (const k of Object.keys(res[0].got)) report.drops[k] = { total: +avg((r) => r.got[k]).toFixed(1), perHour: +avg((r) => r.got[k] / r.hours).toFixed(2) };
for (const L of [5, 10, 15, 20, 25]) report.gearLvl[L] = +avg((r) => r.gearAt[L] || 0).toFixed(1);
report.perLevel = {}; for (let L = 1; L < 25; L++) report.perLevel[L] = +avg((r) => r.lvlTime[L] || 0).toFixed(3);
if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
console.log(`Симуляция прогрессии: ${RUNS} прогонов`);
console.log("Уровень | часов (среднее) | p10 | p90 | ср. ур. надетых вещей");
for (const L of [2, 5, 10, 15, 20, 25]) console.log(`${String(L).padStart(7)} | ${String(report.reach[L].mean).padStart(15)} | ${report.reach[L].p10} | ${report.reach[L].p90} | ${report.gearLvl[L] ?? "-"}`);
console.log(`Убийств до 25: ${report.kills.toFixed(0)}, смертей: ${report.deaths.toFixed(1)}, полных комплектов: ${report.fullSets.toFixed(1)}`);
if (process.argv.includes("--levels")) console.log("часов на уровень:", Object.entries(report.perLevel).map(([l, h]) => l + ":" + h).join(" "));
console.log("Дроп предметов (за весь путь / в час):");
for (const [k, v] of Object.entries(report.drops)) console.log(`  ${k.padEnd(10)} ${String(v.total).padStart(7)}  ${v.perHour}/ч`);
