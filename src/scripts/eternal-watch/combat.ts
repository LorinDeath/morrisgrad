// Формулы урона, волн, опыта и профиля башни. Без DOM.
import { mapById, type MapDef } from "./maps.ts";
import type { Bonuses } from "./types.ts";
import {
  TOWERS, emptyExtra,
  type DmgType, type Enemy, type EnemyKind, type Extra, type ModKind, type Tower, type TowerKind,
} from "./types.ts";

export const RESIST: Record<EnemyKind, Partial<Record<DmgType, number>>> = {
  walker: {},
  runner: { frost: 0.22 },
  knight: { phys: 0.3, poison: 0.05, blast: -0.18 },
  healer: { shock: 0.1, energy: 0.22 },
  splitter: { fire: -0.22, poison: 0.12 },
  shield: { phys: 0.12, shock: -0.1 },
  flyer: { phys: 0.15, energy: 0.05, blast: -0.22 },
  shade: { phys: 0.28, energy: -0.18 },
  caller: { fire: 0.12, poison: -0.15 },
  boss: { phys: 0.12, fire: 0.12, frost: 0.12, shock: 0.12, poison: 0.12, energy: 0.12, blast: 0.06 },
  mite: { fire: -0.3 },
  thrall: {},
};

export const ENEMY_BASE: Record<EnemyKind, { hp: number; speed: number; armor: number; leak: number }> = {
  walker: { hp: 18, speed: 1, armor: 0, leak: 1 },
  runner: { hp: 12, speed: 1.7, armor: 0, leak: 1 },
  knight: { hp: 52, speed: 0.68, armor: 6, leak: 2 },
  healer: { hp: 24, speed: 0.92, armor: 0, leak: 1 },
  splitter: { hp: 22, speed: 1.1, armor: 0, leak: 1 },
  shield: { hp: 40, speed: 0.78, armor: 3, leak: 2 },
  flyer: { hp: 16, speed: 1.4, armor: 0, leak: 1 },
  shade: { hp: 20, speed: 1.16, armor: 0, leak: 1 },
  caller: { hp: 30, speed: 0.84, armor: 0, leak: 2 },
  boss: { hp: 260, speed: 0.58, armor: 8, leak: 6 },
  mite: { hp: 8, speed: 1.5, armor: 0, leak: 1 },
  thrall: { hp: 14, speed: 1.05, armor: 0, leak: 1 },
};

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1000) {
    if (Math.abs(v - Math.round(v)) < 1e-6) return sign + String(Math.round(v));
    return sign + v.toFixed(1).replace(/\.0$/, "");
  }
  const units = ["K", "M", "B", "T"];
  let x = v;
  let u = -1;
  while (x >= 1000 && u < units.length - 1) { x /= 1000; u++; }
  if (x >= 1000) return sign + x.toExponential(2).replace("e+", "e");
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  return sign + x.toFixed(digits) + units[u];
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a >= 100) return formatNumber(n);
  const r = Math.round(n * 100) / 100;
  return String(r);
}

export function mitigate(raw: number, resist: number, armor: number, pen: number, ignoreArmor: boolean): number {
  const after = raw * (1 - resist);
  if (after <= 0 || raw <= 0) return 0;
  let dealt = after;
  if (!ignoreArmor) {
    const eff = Math.max(0, armor) * (1 - Math.max(0, Math.min(0.85, pen)));
    dealt = after * (1 - eff / (eff + 10));
  }
  return Math.max(0.25, dealt);
}

export function levelOf(xp: number): number {
  let level = 1;
  let left = Math.max(0, xp);
  while (level < 30) {
    const need = Math.floor(32 * level ** 1.18);
    if (left < need) break;
    left -= need;
    level++;
  }
  return level;
}

export function xpBar(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, xp);
  while (level < 30) {
    const need = Math.floor(32 * level ** 1.18);
    if (left < need) return { level, into: left, need };
    left -= need;
    level++;
  }
  return { level: 30, into: 1, need: 1 };
}

export function rankCost(baseCost: number, rank: number): number {
  return Math.ceil(baseCost * 1.5 ** rank);
}

export interface WaveGroup { kind: EnemyKind; count: number }

export function spawnInterval(wave: number): number {
  return 0.58 * 0.985 ** Math.min(wave - 1, 25);
}

export function wavePlan(difficulty: number, wave: number, endless: boolean, waves: number): WaveGroup[] {
  const d = difficulty;
  const n = wave;
  const out: WaveGroup[] = [{ kind: "walker", count: 5 + Math.floor(n * 0.65) + Math.floor((d - 1) * 0.3) }];
  if (n >= 2) out.push({ kind: "runner", count: 2 + Math.floor(n / 3) });
  if (n >= 3 && d >= 3) out.push({ kind: "knight", count: 1 + Math.floor((n - 2) / 4) });
  if (n >= 4 && d >= 5) out.push({ kind: "splitter", count: 1 + Math.floor(n / 6) });
  if (n >= 4 && d >= 6) out.push({ kind: "healer", count: 1 + Math.floor((n - 3) / 5) });
  if (n >= 5 && d >= 8) out.push({ kind: "shield", count: 1 + Math.floor(n / 7) });
  if (n >= 3 && d >= 7) out.push({ kind: "flyer", count: 2 + Math.floor(n / 4) });
  if (n >= 5 && d >= 10) out.push({ kind: "shade", count: 1 + Math.floor(n / 6) });
  if (n >= 6 && d >= 13) out.push({ kind: "caller", count: 1 + Math.floor((n - 5) / 8) });
  if ((!endless && n === waves && d >= 4) || (endless && n % 10 === 0)) {
    out.push({ kind: "boss", count: 1 + (endless ? Math.floor(n / 25) : 0) });
  }
  return out;
}

export function enemyHp(kind: EnemyKind, wave: number, difficulty: number, endless: boolean, knowHp: number): number {
  const extra = endless && wave > 12 ? 1.018 ** (wave - 12) : 1;
  const hp = ENEMY_BASE[kind].hp * 1.12 ** (wave - 1) * 1.045 ** (difficulty - 1) * extra * (1 - Math.min(0.6, knowHp));
  return Math.max(1, hp);
}

export function enemyArmor(kind: EnemyKind, wave: number, endless: boolean): number {
  let a = ENEMY_BASE[kind].armor;
  if (kind === "knight") a = 6 + Math.floor(wave / 6);
  if (kind === "boss") a = 8 + Math.floor(wave / 8);
  if (endless && wave >= 20) a += 3;
  return a;
}

export interface TileBonus { dmg: number; range: number; rate: number; xp: number; bounty: number }

export function tileBonus(mod: ModKind | null, b: Bonuses): TileBonus {
  const p = b.stampPower;
  const on = mod !== null;
  return {
    dmg: (mod === "dmg" ? 0.18 + 0.05 * p : 0) + (on ? b.tileDmg : 0),
    range: (mod === "range" ? 0.14 + 0.05 * p : 0) + (on ? b.tileRange : 0),
    rate: mod === "rate" ? 0.16 + 0.05 * p : 0,
    xp: mod === "xp" ? 0.25 + 0.08 * p : 0,
    bounty: mod === "bounty" ? 0.2 + 0.08 * p : 0,
  };
}

export interface Profile {
  dmgMul: number;
  rateMul: number;
  rangeAdd: number;
  pen: number;
  splash: number;
  edge: number;
  maxTargets: number;
  width: number;
  jumps: number;
  jumpKeep: number;
  jumpRange: number;
  shots: number;
  execute: number;
  full70: number;
  full80: number;
  boss: number;
  shieldBonus: number;
  airMul: number;
  poison: number;
  poisonTime: number;
  poisonCap: number;
  fire: number;
  fireTime: number;
  bleed: number;
  slow: number;
  slowTime: number;
  frost: boolean;
  freezeAt: number;
  reveal: number;
  mute: number;
  shred: number;
  mark: number;
  brittle: boolean;
  shatter: boolean;
  melt: boolean;
  sticky: boolean;
  goldChance: number;
  stun: number;
  spread: number;
  cloud: boolean;
  burst: boolean;
  coneAll: boolean;
  embers: boolean;
  sanctuary: number;
  twinChance: number;
  cluster: boolean;
  bounce: boolean;
  bunch: boolean;
  firstMul: number;
  slug: boolean;
  extractMul: number;
  veinChance: number;
  sparkChance: number;
  intervalMul: number;
  flatVein: number;
  shadeBonus: number;
  pair: boolean;
}

function blankProfile(): Profile {
  return {
    dmgMul: 1, rateMul: 1, rangeAdd: 0, pen: 0, splash: 0, edge: 0.55, maxTargets: 1, width: 0.38,
    jumps: 0, jumpKeep: 0.72, jumpRange: 1.7, shots: 1, execute: 0, full70: 0, full80: 0, boss: 0,
    shieldBonus: 0, airMul: 0, poison: 0, poisonTime: 3.2, poisonCap: 5, fire: 0, fireTime: 2, bleed: 0,
    slow: 0, slowTime: 1.5, frost: false, freezeAt: 3, reveal: 0, mute: 0, shred: 0, mark: 0,
    brittle: false, shatter: false, melt: false, sticky: false, goldChance: 0, stun: 0, spread: 0,
    cloud: false, burst: false, coneAll: false, embers: false, sanctuary: 0, twinChance: 0, cluster: false,
    bounce: false, bunch: false, firstMul: 1, slug: false, extractMul: 1, veinChance: 0, sparkChance: 0,
    intervalMul: 1, flatVein: 0, shadeBonus: 0, pair: false,
  };
}

function has(tower: Tower, id: string): boolean {
  return tower.abilities.includes(id);
}
function up(tower: Tower, id: string): number {
  return tower.upgraded === id ? 1.5 : 1;
}

export function profileOf(tower: Tower, b: Bonuses): Profile {
  const p = blankProfile();
  const s = b.special[tower.kind];
  const k = tower.kind;
  if (k === "spark") p.full70 = 0.08 * s;
  if (k === "needle") p.pen += 0.45 + 0.1 * s;
  if (k === "muzzle") p.splash = 1.1 + 0.1 * s;
  if (k === "chill") { p.slow = 0.34 + 0.06 * s; p.slowTime = 1.5; p.frost = true; }
  if (k === "venom") { p.poison = 4.5 * (1 + 0.15 * s); p.poisonTime = 3.2; p.poisonCap = 5; }
  if (k === "arc") { p.jumps = 2 + s; p.jumpKeep = 0.72; p.jumpRange = 1.7; }
  if (k === "beam") { p.maxTargets = 3 + s; p.width = 0.38; }
  if (k === "bolt") { p.splash = 0.7; p.airMul += 0.1 * s; }
  if (k === "blaze") { p.rangeAdd += 0.1 * s; p.fire = 3.2; p.fireTime = 2; }
  if (k === "halo") { p.rangeAdd += 0.08 * s; p.reveal = 1.4; }
  if (k === "awl") p.maxTargets = 4 + s;
  if (k === "swarm") p.shots = 3 + s;
  if (k === "miner") p.veinChance += 0.1 * s;

  const bump = (id: string, fn: (m: number) => void) => { if (has(tower, id)) fn(up(tower, id)); };

  bump("sting", (m) => { p.full80 += 0.35 * m; });
  bump("twin", (m) => { p.twinChance += 0.28 * m; });
  bump("mercy", (m) => { p.execute = Math.max(p.execute, 0.09 * m); });
  bump("tempo", (m) => { p.rateMul *= 1 + 0.12 * m; });
  bump("sparkle", (m) => { p.goldChance += 0.12 * m; });
  bump("puncture", (m) => { p.pen += 0.35 * m; });
  bump("headshot", (m) => { p.boss += 0.45 * m; });
  bump("glass", (m) => { p.rangeAdd += 0.7 * m; p.rateMul *= 1 - 0.12 * m; });
  bump("steady", (m) => { p.dmgMul *= 1 + 0.15 * m; });
  bump("mark", (m) => { p.mark += 0.12 * m; });
  bump("crater", (m) => { p.splash += 0.4 * m; });
  bump("cluster", () => { p.cluster = true; });
  bump("napalm", (m) => { p.fire = Math.max(p.fire, 3 * m); p.fireTime = Math.max(p.fireTime, 2.5); });
  bump("quick", (m) => { p.rateMul *= 1 + 0.18 * m; });
  bump("heavy", (m) => { p.dmgMul *= 1 + 0.25 * m; p.splash = Math.max(0.3, p.splash - 0.2 * m); });
  bump("spread", (m) => { p.spread = 0.8 * m; });
  bump("deep", () => { p.freezeAt = 2; });
  bump("brittle", () => { p.brittle = true; });
  bump("longer", (m) => { p.slowTime += 0.8 * m; });
  bump("shatter", () => { p.shatter = true; });
  bump("plague", (m) => { p.poisonCap += Math.round(3 * m); });
  bump("burst", () => { p.burst = true; });
  bump("melt", () => { p.melt = true; });
  bump("sticky", () => { p.sticky = true; });
  bump("cloud", () => { p.cloud = true; });
  bump("fork", (m) => { p.jumps += Math.round(1 * m); });
  bump("overload", (m) => { p.firstMul *= 1 + 0.45 * m; });
  bump("silence", (m) => { p.mute = 3 * m; });
  bump("longarc", (m) => { p.jumpRange += 0.5 * m; });
  bump("livearc", () => { p.jumpKeep = 0.85; });
  bump("wide", (m) => { p.width += 0.2 * m; p.maxTargets += Math.round(1 * m); });
  bump("focus", (m) => { p.maxTargets = 1; p.dmgMul *= 1.75 * m; });
  bump("dawn", (m) => { p.execute = Math.max(p.execute, 0.12 * m); });
  bump("burn", (m) => { p.fire = Math.max(p.fire, 2 * m); p.fireTime = Math.max(p.fireTime, 2); });
  bump("spear", (m) => { p.maxTargets += Math.round(2 * m); });
  bump("pair", () => { p.pair = true; });
  bump("breaker", (m) => { p.shieldBonus += 0.3 * m; });
  bump("liquid", (m) => { p.fire = Math.max(p.fire, 3 * m); p.fireTime = Math.max(p.fireTime, 2.5); });
  bump("farther", (m) => { p.rangeAdd += 0.4 * m; });
  bump("wideblast", (m) => { p.splash += 0.35 * m; });
  bump("reach", (m) => { p.rangeAdd += 0.55 * m; });
  bump("oil", (m) => { p.fireTime *= 2 * m; });
  bump("fan", () => { p.coneAll = true; });
  bump("inferno", (m) => { p.dmgMul *= 1 + 0.2 * m; });
  bump("embers", () => { p.embers = true; });
  bump("pulse", (m) => { p.dmgMul *= 1 + 0.3 * m; });
  bump("sanctuary", (m) => { p.sanctuary = 0.1 * m; });
  bump("eye", (m) => { p.reveal = Math.max(p.reveal, 1.4); p.shadeBonus += 0.25 * m; });
  bump("storm", (m) => { p.stun = 0.2 * m; });
  bump("ward", (m) => { p.dmgMul *= 1 + 0.15 * m; });
  bump("rail", (m) => { p.maxTargets += Math.round(4 * m); });
  bump("slug", (m) => { p.maxTargets = 1; p.firstMul *= 1.65 * m; });
  bump("bleed", (m) => { p.bleed = 2 * m; });
  bump("fast", (m) => { p.rateMul *= 1 + 0.15 * m; });
  bump("sunder", (m) => { p.shred += 2 * m; });
  bump("extra", (m) => { p.shots += Math.round(2 * m); });
  bump("bunch", () => { p.bunch = true; });
  bump("bounce", () => { p.bounce = true; });
  bump("sky", (m) => { p.airMul += 0.25 * m; });
  bump("rapid", (m) => { p.rateMul *= 1 + 0.2 * m; });
  bump("mdeep", (m) => { p.extractMul *= 1.4 * m; });
  bump("mrich", (m) => { p.veinChance += 0.22 * m; });
  bump("mhaste", (m) => { p.intervalMul *= Math.max(0.45, 1 - 0.25 * m); });
  bump("mstock", (m) => { p.flatVein += 1 * m; });
  if (has(tower, "mspark")) p.sparkChance += 0.08 * up(tower, "mspark");
  if (has(tower, "focus")) p.maxTargets = 1;
  return p;
}

export function hitsAir(kind: TowerKind, b: Bonuses): boolean {
  return TOWERS[kind].air || b.air[kind];
}

export function seesShade(tower: Tower, enemy: Enemy, b: Bonuses, time: number): boolean {
  if (enemy.kind !== "shade") return true;
  if (enemy.revealedUntil > time) return true;
  if (b.detectShades) return true;
  if (tower.kind === "halo" || tower.abilities.includes("eye")) return true;
  return false;
}

export interface Stats { dmg: number; rate: number; range: number; type: DmgType; xpMul: number; bounty: number }

export function statsOf(tower: Tower, mod: ModKind | null, b: Bonuses, sanctuary = 0): Stats {
  const spec = TOWERS[tower.kind];
  const tile = tileBonus(mod, b);
  const p = profileOf(tower, b);
  const lv = levelOf(tower.xp);
  const dmg = spec.dmg
    * (1 + b.dmg[tower.kind] + 0.14 * tower.ranks.dmg + b.abyss[tower.kind])
    * (1 + 0.03 * (lv - 1))
    * (1 + tile.dmg)
    * (1 + b.globalDmg)
    * p.dmgMul;
  const rate = spec.rate
    * (1 + b.rate[tower.kind] + 0.1 * tower.ranks.rate)
    * (1 + 0.02 * (lv - 1))
    * (1 + tile.rate)
    * (1 + sanctuary)
    * p.rateMul;
  const range = (spec.range + p.rangeAdd)
    * (1 + b.range[tower.kind] + 0.07 * tower.ranks.range)
    * (1 + tile.range);
  return { dmg, rate: Math.max(0.05, rate), range, type: spec.type, xpMul: (1 + b.xp[tower.kind]) * (1 + tile.xp), bounty: tile.bounty };
}

export function previewStats(kind: TowerKind, b: Bonuses): Stats {
  const ghost: Tower = {
    id: 0, kind, x: 0, y: 0, xp: 0, spent: 0, ranks: { dmg: 0, rate: 0, range: 0 },
    abilities: [], offer: null, upgraded: null, cd: 0, target: "first", sparkLock: 0, kills: 0, dealt: 0,
  };
  return statsOf(ghost, null, b, 0);
}

export function extraFrom(p: Profile, b: Bonuses, kind: EnemyKind): Extra {
  const e = emptyExtra();
  e.pen = p.pen + b.knowPen[kind];
  e.execute = p.execute;
  e.fullHp = p.full80;
  e.fullLine = 0.8;
  e.boss = p.boss;
  e.shieldBonus = p.shieldBonus;
  e.poison = p.poison;
  e.poisonTime = p.poisonTime;
  e.poisonStacks = p.poisonCap;
  e.fire = p.fire;
  e.fireTime = p.fireTime;
  e.bleed = p.bleed;
  e.slow = Math.min(0.8, p.slow);
  e.slowTime = p.slowTime;
  e.frost = p.frost;
  e.freezeAt = p.freezeAt;
  e.reveal = p.reveal;
  e.mute = p.mute;
  e.shred = p.shred;
  e.mark = p.mark;
  e.brittle = p.brittle;
  e.shatter = p.shatter;
  e.melt = p.melt;
  e.sticky = p.sticky;
  e.goldChance = p.goldChance;
  e.stun = p.stun;
  e.ignoreArmor = p.poison > 0 || p.bleed > 0;
  e.jumps = p.jumps;
  e.jumpKeep = p.jumpKeep;
  e.jumpRange = p.jumpRange;
  e.bounce = p.bounce;
  e.cluster = p.cluster;
  e.full70 = p.full70;
  e.airMul = p.airMul;
  e.shadeBonus = p.shadeBonus;
  return e;
}

export function killGold(maxHp: number, goldBonus: number, bounty: number): number {
  return Math.max(1, Math.floor((3 + maxHp / 22) * (1 + goldBonus) * (1 + bounty)));
}

export function waveGold(wave: number, goldBonus: number): number {
  return Math.floor((4 + wave) * (1 + goldBonus));
}

export function interestGold(gold: number, levels: number): number {
  if (levels <= 0) return 0;
  return Math.floor(gold * Math.min(0.12, 0.012 * levels));
}

export function rewardAmounts(
  outcome: "play" | "win" | "lose",
  endless: boolean,
  difficulty: number,
  stars: number,
  wavesCleared: number,
  bossKilled: boolean,
  mined: number,
  b: Bonuses,
): { sparks: number; ash: number; vein: number; stars: number } {
  let sparks = 0;
  if (endless) sparks = Math.floor((wavesCleared * 1.25 + (bossKilled ? 4 : 0)) * (1 + b.spark));
  else if (outcome === "win") sparks = Math.floor((8 + 3 * difficulty + 4 * stars) * (1 + b.spark));
  else sparks = Math.floor(wavesCleared * 1.5 * (1 + b.spark));
  let ash = 0;
  if (bossKilled) ash = 1 + Math.floor(difficulty / 10) + b.ashFlat;
  if (endless) ash += Math.floor(wavesCleared / 12);
  return { sparks, ash, vein: mined, stars: endless || outcome !== "win" ? 0 : stars };
}

export function starCount(outcome: "play" | "win" | "lose", endless: boolean, hearts: number, maxHearts: number, leaks: number): 0 | 1 | 2 | 3 {
  if (endless || outcome !== "win" || maxHearts <= 0) return 0;
  const ratio = hearts / maxHearts;
  if (leaks === 0 && ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

export function abilityCd(base: number, steps: number): number {
  return base * 0.93 ** Math.min(5, steps);
}

export function abilityRadius(base: number, steps: number): number {
  return base * 1.12 ** Math.min(3, steps);
}

export function mapDifficulty(mapId: string): MapDef | null {
  return mapById(mapId);
}
