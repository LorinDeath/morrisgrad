// Единый числовой набор «Орды». Его читают хаб, симулятор и комната.
// Админка пишет только сюда, после проверки диапазонов.
// Ярусы чар 1–6 носят имена «Проклятых», включая Чёрный ×10.
// За скорость платит герой: чем выше ярус, тем медленнее шаг.
// Мутации Тёмного мира носят те же десять имён, но множитель режется
// потолком 2.4: ×360 стирает ручной бой и правилом не проходит.
import { FLOOR_N, SW_FLOORS, SW_MODES, fightScale } from "./sw-catalog";

export type OrdaTune = {
  v: 1;
  economy: {
    startGold: number;
    bagPrices: number[];
    bagGoldFind: number;
    killGold: number;
    generalGold: number;
    clearBase: number;
    clearPerFloor: number;
    bossBase: number;
    bossPerFloor: number;
    partyGold: number;
    /** Доля платы за босса и зачистку на повторе. Первый проход всегда 1. */
    replayGold: number;
    /** Доля опыта данжа на повторе. Опыт тварей не режется. */
    replayXp: number;
  };
  combat: {
    mobHp: [number, number, number];
    mobHpPerFloor: number;
    mobDmg: [number, number, number];
    contactIframe: number;
    generalHp: number;
    generalHpPerFloor: number;
    bossHp: number;
    bossHpPerFloor: number;
    generalDmg: number;
    generalDmgPerFloor: number;
    bossDmg: number;
    bossDmgPerFloor: number;
    /** Доля здоровья элиты за каждого союзника сверх первого. 0 — как соло. */
    partyHpPerExtra: number;
    /** Потолок множителя здоровья элиты. Выше 2.05 правило не пускает. */
    partyHpCap: number;
  };
  loot: {
    magicShop: number;
    magicDrop: number;
    rareShop: number;
    rareDrop: number;
    rarePerFloor: number;
    rareCap: number;
    legShop: number;
    legBase: number;
    legPerFloor: number;
    legCap: number;
    setShop: number;
    setPerFloor: number;
    setCap: number;
    curseChance: number;
    enchChance: number;
    chestCount: number;
  };
  curse: { statMult: number; speed: number };
  ench: { stat: [number, number, number, number, number, number]; speed: [number, number, number, number, number, number] };
  /** Десять имён мутаций Тёмного мира. Множитель — только в этом потолке. */
  mut: { mult: [number, number, number, number, number, number, number, number, number, number] };
  /** Клятва выбирается в хабе до боя. Кубок списывает ставку. */
  oath: { on: number; stake: number };
  xp: { base: number; pow: number };
  floors: FloorTune[];
  /** Семь ступеней: базовая и шесть цветов чар Проклятых, до Чёрного. */
  diff: DiffTune;
  /** Кузница Петра: включена, сколько материала за зачистку, потолок плюса. */
  forge: { on: number; drop: number; max: number };
  /** Пороги MODE_MIN_LVL. Имена режимов не меняются. */
  modes: { arena: number; duel: number; horde: number; abyss: number; bossrush: number; purgatory: number; demiurge: number };
  /**
   * Генерал и босс. minTier — гарантированный ярус чар на ступени сложности, не ниже её цвета.
   * up — маленький шанс шага на один реальный ярус выше. modeTier — гарантированный ярус режима.
   */
  elite: {
    minTier: Sept;
    up: Sept;
    modeTier: Sept;
  };
  /** Гнёзда рун Тёмного мира и сияние навыков Проклятых. Шлифовка — это forge. */
  craft: { sockets: number; radianceMax: number; radianceGold: number; runeGold: number };
  /**
   * Сундук генерала и сундук босса. Семь чисел — базовая и шесть цветов чар.
   * Шанс — доля убийств, после которых сундук есть. min/max — сколько вещей внутри.
   * Это стартовая таблица админки, не обещание с листа: запись проверяет границы.
   */
  drops: {
    generalChance: Sept;
    bossChance: Sept;
    generalMin: Sept;
    generalMax: Sept;
    bossMin: Sept;
    bossMax: Sept;
  };
};

export const DIFF_N = 7;
export type DiffAct = "none" | "mend" | "plate" | "blink" | "brand" | "nova" | "killer";
export type DiffStep = { name: string; color: string; ink: string; icon: string; lore: string; act: DiffAct; tier: number };

/** Имена, цвета и порядок — ярусы чар Проклятых. Базовая только первая. Чёрный замыкает цепочку. */
export const DIFF_CHAIN: DiffStep[] = [
  { name: "Базовая", color: "#c4b8a8", ink: "#1a1214", icon: "·", lore: "Подвал без чар. Твари обычные, добыча без яруса.", act: "none", tier: 0 },
  { name: "Необычный", color: "#4ade80", ink: "#052e16", icon: "✦", lore: "Зелёная искра. Тварь заращивает царапину.", act: "mend", tier: 1 },
  { name: "Редкий", color: "#3b82f6", ink: "#eff6ff", icon: "✦", lore: "Синяя закалка. Удар вязнет в броне.", act: "plate", tier: 2 },
  { name: "Странный", color: "#ec4899", ink: "#fdf2f8", icon: "✦", lore: "Розовый скачок. Тварь пропадает и встаёт ближе.", act: "blink", tier: 3 },
  { name: "Легендарный", color: "#facc15", ink: "#1c1404", icon: "✦", lore: "Жёлтое клеймо. Генерал чаще бьёт линией.", act: "brand", tier: 4 },
  { name: "Божественный", color: "#ef4444", ink: "#fff1f2", icon: "✦", lore: "Красная волна. Элита лечится и бьёт кольцом.", act: "nova", tier: 5 },
  { name: "Чёрный", color: "#0a0a0a", ink: "#f4f4f5", icon: "☠", lore: "Чёрный ярус Проклятых: рывок, аура проклятия и призыв. Добыча может быть младше.", act: "killer", tier: 6 },
];
export const DIFF_NAME = DIFF_CHAIN.map((d) => d.name);

type Sept = [number, number, number, number, number, number, number];
export type DiffTune = {
  hp: Sept;
  dmg: Sept;
  gold: Sept;
  xp: Sept;
  rare: Sept;
  leg: Sept;
  affix: Sept;
  /** Прибавка к уровню вещи. Базовая — 0, потолок вещи 60. */
  ilvl: Sept;
  /** Множитель урона, брони и чисел аффиксов. Это качество вещи, не шанс. */
  budget: Sept;
  curse: Sept;
  ench: Sept;
  chest: Sept;
  /** Доля добычи младшего яруса. Базовая — 0. Выше нуля и ниже единицы: свой ярус не исчезает. */
  lower: Sept;
  /** Вес ближайшего младшего яруса против самого слабого. */
  near: Sept;
  /** Доля урона героя, которую гасит броня этой ступени. */
  soak: Sept;
  /** Доля максимального здоровья в секунду, которую тварь возвращает себе. */
  regen: Sept;
};

export type FloorTune = { general: string; boss: string; gSig: Sig; bSig: Sig; mut: number; need: number; xp: number };

export const MUT_NAMES = [
  "Сильный", "Ужасный", "Опасный", "Невероятный", "Божественный",
  "Колоссальный", "Титанический", "Первородный", "Сингулярный", "Абсолютный",
] as const;
type Sig = "circle" | "cone" | "line" | "curse" | "summon";

export const DEFAULT_TUNE: OrdaTune = {
  v: 1,
  economy: {
    startGold: 150,
    bagPrices: [80, 700, 1400, 2500, 4200, 7000, 11000, 17000, 26000],
    bagGoldFind: 0.03,
    killGold: 0.22,
    generalGold: 18,
    clearBase: 18,
    clearPerFloor: 8,
    bossBase: 46,
    bossPerFloor: 12,
    partyGold: 1.1,
    replayGold: 0.4,
    replayXp: 0.25,
  },
  combat: {
    mobHp: [8, 5, 16],
    mobHpPerFloor: 2,
    mobDmg: [4, 5, 7],
    contactIframe: 0.42,
    generalHp: 680,
    generalHpPerFloor: 300,
    bossHp: 1500,
    bossHpPerFloor: 620,
    generalDmg: 8,
    generalDmgPerFloor: 2.1,
    bossDmg: 14,
    bossDmgPerFloor: 3.1,
    partyHpPerExtra: 0.18,
    partyHpCap: 2.05,
  },
  loot: {
    magicShop: 0.42,
    magicDrop: 0.3,
    rareShop: 0.1,
    rareDrop: 0.08,
    rarePerFloor: 0.012,
    rareCap: 0.2,
    legShop: 0.02,
    legBase: 0.01,
    legPerFloor: 0.006,
    legCap: 0.09,
    setShop: 0.015,
    setPerFloor: 0.004,
    setCap: 0.05,
    curseChance: 0.08,
    enchChance: 0.06,
    chestCount: 2,
  },
  curse: { statMult: 1.5, speed: 0.92 },
  ench: { stat: [1.5, 1.8, 2, 3, 4, 10], speed: [0.97, 0.94, 0.9, 0.82, 0.72, 0.55] },
  mut: { mult: [1.12, 1.22, 1.32, 1.44, 1.56, 1.7, 1.84, 2, 2.15, 2.3] },
  oath: { on: 1, stake: 25 },
  xp: { base: 50, pow: 1.45 },
  diff: {
    hp: [1, 1.5, 2.5, 4, 7, 12, 20],
    dmg: [1, 1.2, 1.5, 2, 3, 6, 9],
    gold: [1, 1.12, 1.24, 1.36, 1.5, 1.66, 1.85],
    xp: [1, 1.08, 1.16, 1.26, 1.38, 1.5, 1.65],
    rare: [0, 0.04, 0.07, 0.1, 0.14, 0.18, 0.22],
    leg: [0, 0, 0.01, 0.02, 0.04, 0.06, 0.08],
    affix: [0, 0, 1, 1, 1, 2, 2],
    ilvl: [0, 1, 2, 3, 4, 6, 8],
    budget: [1, 1.08, 1.14, 1.22, 1.32, 1.46, 1.62],
    curse: [1, 1.1, 1.2, 1.35, 1.55, 1.8, 2.2],
    ench: [1, 1.15, 1.3, 1.45, 1.6, 1.85, 2.2],
    chest: [0, 0, 0, 1, 1, 1, 1],
    lower: [0, 0.28, 0.34, 0.4, 0.46, 0.52, 0.6],
    near: [1, 1.4, 1.5, 1.6, 1.7, 1.8, 2],
    soak: [0, 0, 0.12, 0.12, 0.18, 0.22, 0.28],
    regen: [0, 0.01, 0.01, 0.012, 0.012, 0.02, 0.02],
  },
  forge: { on: 1, drop: 3, max: 58 },
  modes: {
    arena: SW_MODES.arena, duel: SW_MODES.duel, horde: SW_MODES.horde, abyss: SW_MODES.abyss,
    bossrush: SW_MODES.bossrush, purgatory: SW_MODES.purgatory, demiurge: SW_MODES.demiurge,
  },
  elite: {
    minTier: [0, 1, 2, 3, 4, 5, 6],
    up: [0.08, 0.07, 0.06, 0.05, 0.04, 0.035, 0.03],
    modeTier: [1, 2, 2, 3, 4, 5, 6],
  },
  craft: { sockets: 1, radianceMax: 9, radianceGold: 80, runeGold: 160 },
  drops: {
    generalChance: [0.35, 0.42, 0.48, 0.55, 0.62, 0.7, 0.78],
    bossChance: [0.7, 0.76, 0.82, 0.88, 0.93, 0.97, 1],
    generalMin: [1, 1, 1, 1, 1, 1, 1],
    generalMax: [1, 1, 1, 1, 1, 2, 2],
    bossMin: [1, 1, 1, 1, 1, 1, 2],
    bossMax: [1, 1, 2, 2, 2, 2, 3],
  },
  floors: SW_FLOORS.map((f) => ({ general: f.general, boss: f.boss, gSig: f.gSig, bSig: f.bSig, mut: f.mut, need: f.minLvl, xp: f.xp })),
};

const NUM = new Set(["number"]);

type Bound = { min: number; max: number; int?: boolean };

const BOUNDS: Record<string, Bound> = {
  "economy.startGold": { min: 0, max: 5000, int: true },
  "economy.bagGoldFind": { min: 0, max: 0.1 },
  "economy.killGold": { min: 0, max: 5 },
  "economy.generalGold": { min: 0, max: 200, int: true },
  "economy.clearBase": { min: 0, max: 500, int: true },
  "economy.clearPerFloor": { min: 0, max: 100, int: true },
  "economy.bossBase": { min: 0, max: 500, int: true },
  "economy.bossPerFloor": { min: 0, max: 200, int: true },
  "economy.partyGold": { min: 1, max: 1.25 },
  "economy.replayGold": { min: 0.15, max: 0.6 },
  "economy.replayXp": { min: 0.1, max: 0.5 },
  "combat.mobHpPerFloor": { min: 0, max: 20, int: true },
  "combat.contactIframe": { min: 0.15, max: 1.2 },
  "combat.generalHp": { min: 100, max: 8000, int: true },
  "combat.generalHpPerFloor": { min: 0, max: 2000, int: true },
  "combat.bossHp": { min: 200, max: 30000, int: true },
  "combat.bossHpPerFloor": { min: 0, max: 5000, int: true },
  "combat.generalDmg": { min: 1, max: 40 },
  "combat.generalDmgPerFloor": { min: 0, max: 12 },
  "combat.bossDmg": { min: 1, max: 60 },
  "combat.bossDmgPerFloor": { min: 0, max: 16 },
  "combat.partyHpPerExtra": { min: 0, max: 0.5 },
  "combat.partyHpCap": { min: 1, max: 2.05 },
  "loot.magicShop": { min: 0, max: 0.8 },
  "loot.magicDrop": { min: 0, max: 0.8 },
  "loot.rareShop": { min: 0, max: 0.5 },
  "loot.rareDrop": { min: 0, max: 0.5 },
  "loot.rarePerFloor": { min: 0, max: 0.05 },
  "loot.rareCap": { min: 0, max: 0.5 },
  "loot.legShop": { min: 0, max: 0.2 },
  "loot.legBase": { min: 0, max: 0.2 },
  "loot.legPerFloor": { min: 0, max: 0.02 },
  "loot.legCap": { min: 0, max: 0.25 },
  "loot.setShop": { min: 0, max: 0.15 },
  "loot.setPerFloor": { min: 0, max: 0.02 },
  "loot.setCap": { min: 0, max: 0.2 },
  "loot.curseChance": { min: 0, max: 0.35 },
  "loot.enchChance": { min: 0, max: 0.25 },
  "loot.chestCount": { min: 0, max: 4, int: true },
  "curse.statMult": { min: 1, max: 2 },
  "curse.speed": { min: 0.7, max: 1 },
  "oath.on": { min: 0, max: 1, int: true },
  "oath.stake": { min: 0, max: 500, int: true },
  "xp.base": { min: 10, max: 400, int: true },
  "xp.pow": { min: 1, max: 1.8 },
  "forge.on": { min: 0, max: 1, int: true },
  "forge.drop": { min: 0, max: 20, int: true },
  "forge.max": { min: 1, max: 58, int: true },
  "modes.arena": { min: 1, max: 300, int: true },
  "modes.duel": { min: 1, max: 300, int: true },
  "modes.horde": { min: 1, max: 300, int: true },
  "modes.abyss": { min: 1, max: 300, int: true },
  "modes.bossrush": { min: 1, max: 300, int: true },
  "modes.purgatory": { min: 1, max: 300, int: true },
  "modes.demiurge": { min: 1, max: 300, int: true },
  "craft.sockets": { min: 0, max: 1, int: true },
  "craft.radianceMax": { min: 0, max: 9, int: true },
  "craft.radianceGold": { min: 20, max: 500, int: true },
  "craft.runeGold": { min: 40, max: 2000, int: true },
};

const TRIPLE: Record<string, Bound> = {
  "combat.mobHp": { min: 1, max: 80, int: true },
  "combat.mobDmg": { min: 1, max: 30, int: true },
};

const ROW: Record<string, { n: number; b: Bound }> = {
  "ench.stat": { n: 6, b: { min: 1, max: 10 } },
  "ench.speed": { n: 6, b: { min: 0.5, max: 1 } },
  "mut.mult": { n: 10, b: { min: 1, max: 2.4 } },
  "elite.minTier": { n: 7, b: { min: 0, max: 6, int: true } },
  "elite.up": { n: 7, b: { min: 0.01, max: 0.12 } },
  "elite.modeTier": { n: 7, b: { min: 0, max: 6, int: true } },
  "drops.generalChance": { n: 7, b: { min: 0, max: 1 } },
  "drops.bossChance": { n: 7, b: { min: 0, max: 1 } },
  "drops.generalMin": { n: 7, b: { min: 0, max: 4, int: true } },
  "drops.generalMax": { n: 7, b: { min: 0, max: 4, int: true } },
  "drops.bossMin": { n: 7, b: { min: 0, max: 4, int: true } },
  "drops.bossMax": { n: 7, b: { min: 0, max: 4, int: true } },
};

function clone(t: OrdaTune): OrdaTune {
  return JSON.parse(JSON.stringify(t)) as OrdaTune;
}

let active: OrdaTune = clone(DEFAULT_TUNE);

export function getTune(): OrdaTune { return active; }
export function setTune(t: OrdaTune) { active = t; }
export function resetTune() { active = clone(DEFAULT_TUNE); }

function num(v: unknown, b: Bound, path: string): string | number {
  if (typeof v !== "number" || !Number.isFinite(v)) return `${path}: нужно число`;
  if (b.int && !Number.isInteger(v)) return `${path}: нужно целое`;
  if (v < b.min || v > b.max) return `${path}: вне ${b.min}…${b.max}`;
  return v;
}

export function validateTune(raw: unknown): { ok: true; tune: OrdaTune } | { ok: false; err: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, err: "набор должен быть объектом" };
  const src = raw as Record<string, unknown>;
  if (src.v !== 1) return { ok: false, err: "нужна версия набора 1" };
  const allow = new Set(["v", "economy", "combat", "loot", "curse", "ench", "mut", "oath", "xp", "floors", "diff", "forge", "modes", "elite", "craft", "drops"]);
  for (const k of Object.keys(src)) if (!allow.has(k)) return { ok: false, err: `лишнее поле ${k}` };
  const out = clone(DEFAULT_TUNE);
  if ("floors" in src) {
    const names = readFloors(src.floors);
    if (typeof names === "string") return { ok: false, err: names };
    out.floors = names;
  }
  if ("diff" in src) {
    const diff = readDiff(src.diff);
    if (typeof diff === "string") return { ok: false, err: diff };
    out.diff = diff;
  }
  const sections = ["economy", "combat", "loot", "curse", "ench", "mut", "oath", "xp", "forge", "modes", "elite", "craft", "drops"] as const;
  for (const sec of sections) {
    const block = src[sec];
    if (!block) continue;
    if (typeof block !== "object" || Array.isArray(block)) return { ok: false, err: `${sec}: нужен объект` };
    const rec = block as Record<string, unknown>;
    const known = new Set(Object.keys((DEFAULT_TUNE as any)[sec]));
    for (const k of Object.keys(rec)) {
      if (!known.has(k)) return { ok: false, err: `лишнее поле ${sec}.${k}` };
      const path = `${sec}.${k}`;
      if (path === "economy.bagPrices") {
        const arr = rec[k];
        if (!Array.isArray(arr) || arr.length !== 9) return { ok: false, err: "economy.bagPrices: ровно 9 цен" };
        const prices: number[] = [];
        for (let i = 0; i < 9; i++) {
          const n = num(arr[i], { min: 1, max: 100000, int: true }, `economy.bagPrices[${i}]`);
          if (typeof n === "string") return { ok: false, err: n };
          if (i > 0 && n <= prices[i - 1]) return { ok: false, err: "цены сумки должны расти" };
          prices.push(n);
        }
        out.economy.bagPrices = prices;
        continue;
      }
      const row = ROW[path];
      if (row) {
        const arr = rec[k];
        if (!Array.isArray(arr) || arr.length !== row.n) return { ok: false, err: `${path}: ${row.n} чисел` };
        const got: number[] = [];
        for (let i = 0; i < row.n; i++) {
          const n = num(arr[i], row.b, `${path}[${i}]`);
          if (typeof n === "string") return { ok: false, err: n };
          got.push(n);
        }
        (out as any)[sec][k] = got;
        continue;
      }
      const triple = TRIPLE[path];
      if (triple) {
        const arr = rec[k];
        if (!Array.isArray(arr) || arr.length !== 3) return { ok: false, err: `${path}: три числа` };
        const got: number[] = [];
        for (let i = 0; i < 3; i++) {
          const n = num(arr[i], triple, `${path}[${i}]`);
          if (typeof n === "string") return { ok: false, err: n };
          got.push(n);
        }
        (out as any)[sec][k] = got;
        continue;
      }
      const b = BOUNDS[path];
      if (!b) return { ok: false, err: `нет правила для ${path}` };
      const n = num(rec[k], b, path);
      if (typeof n === "string") return { ok: false, err: n };
      (out as any)[sec][k] = n;
    }
  }
  const drop = out.loot.magicDrop + out.loot.rareDrop + out.loot.legBase + out.loot.setShop;
  if (drop > 0.95) return { ok: false, err: "сумма шансов дропа больше 0.95" };
  for (let i = 0; i < 7; i++) {
    if (out.drops.generalMax[i] < out.drops.generalMin[i] || out.drops.bossMax[i] < out.drops.bossMin[i]) {
      return { ok: false, err: `drops: на ступени ${i + 1} максимум вещей меньше минимума` };
    }
  }
  for (let i = 0; i < 7; i++) {
    if (out.elite.minTier[i] < i) return { ok: false, err: `elite.minTier[${i}] ниже цвета этой ступени` };
  }
  void NUM;
  return { ok: true, tune: out };
}

const SIGS = new Set(["circle", "cone", "line", "curse", "summon"]);

const DIFF_KEYS = ["hp", "dmg", "gold", "xp", "rare", "leg", "affix", "ilvl", "budget", "curse", "ench", "chest", "lower", "near", "soak", "regen"] as const;
const DIFF_BOUND: Record<(typeof DIFF_KEYS)[number], Bound> = {
  hp: { min: 1, max: 32 },
  dmg: { min: 1, max: 16 },
  gold: { min: 1, max: 3 },
  xp: { min: 1, max: 2.5 },
  rare: { min: 0, max: 0.4 },
  leg: { min: 0, max: 0.15 },
  affix: { min: 0, max: 3, int: true },
  ilvl: { min: 0, max: 12, int: true },
  budget: { min: 1, max: 1.8 },
  curse: { min: 1, max: 2.5 },
  ench: { min: 1, max: 2.5 },
  chest: { min: 0, max: 2, int: true },
  lower: { min: 0, max: 0.85 },
  near: { min: 1, max: 4 },
  soak: { min: 0, max: 0.45 },
  regen: { min: 0, max: 0.05 },
};

function readDiff(raw: unknown): DiffTune | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "diff: нужен объект";
  const rec = raw as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!DIFF_KEYS.includes(k as (typeof DIFF_KEYS)[number])) return `лишнее поле diff.${k}`;
  const out = {} as DiffTune;
  for (const key of DIFF_KEYS) {
    if (!(key in rec)) {
      (out as any)[key] = [...DEFAULT_TUNE.diff[key]];
      continue;
    }
    const arr = rec[key];
    if (!Array.isArray(arr) || arr.length !== DIFF_N) return `diff.${key}: ${DIFF_N} чисел, базовая и шесть цветов чар`;
    const got: number[] = [];
    for (let i = 0; i < DIFF_N; i++) {
      const n = num(arr[i], DIFF_BOUND[key], `diff.${key}[${i}]`);
      if (typeof n === "string") return n;
      if (i > 0 && n < got[i - 1]) return `diff.${key}: ступени не убывают`;
      got.push(n);
    }
    (out as any)[key] = got;
  }
  if (out.hp[0] !== 1 || out.dmg[0] !== 1 || out.gold[0] !== 1 || out.xp[0] !== 1 || out.budget[0] !== 1 || out.ilvl[0] !== 0 || out.lower[0] !== 0) return "базовая сложность держит множители ×1 и не поднимает уровень вещи";
  if (!(out.lower[DIFF_N - 1] > 0)) return "чёрная сложность обязана иногда ронять младший ярус";
  if (out.hp[DIFF_N - 1] > 32 || out.dmg[DIFF_N - 1] > 16) return "чёрные здоровье и урон выше ×32 и ×16: удар перестаёт читаться";
  return out;
}

function readFloorRow(rec: Record<string, unknown>, i: number, fallback: FloorTune): FloorTune | string {
  for (const k of Object.keys(rec)) if (!["general", "boss", "gSig", "bSig", "mut", "need", "xp"].includes(k)) return `floors[${i}]: лишнее поле ${k}`;
  const general = rec.general == null ? fallback.general : cleanNote(rec.general);
  const boss = rec.boss == null ? fallback.boss : cleanNote(rec.boss);
  if (general.length < 2 || boss.length < 2) return `floors[${i}]: имя короче 2`;
  const gSig = rec.gSig == null ? fallback.gSig : rec.gSig;
  const bSig = rec.bSig == null ? fallback.bSig : rec.bSig;
  if (!SIGS.has(String(gSig)) || !SIGS.has(String(bSig))) return `floors[${i}]: приём circle, cone, line, curse или summon`;
  const mut = rec.mut == null ? fallback.mut : rec.mut;
  if (typeof mut !== "number" || !Number.isInteger(mut) || mut < 0 || mut > MUT_NAMES.length) return `floors[${i}]: мутация 0…${MUT_NAMES.length}`;
  const need = rec.need == null ? fallback.need : rec.need;
  const xp = rec.xp == null ? fallback.xp : rec.xp;
  if (typeof need !== "number" || !Number.isInteger(need) || need < 1 || need > 300) return `floors[${i}]: уровень входа 1…300`;
  if (typeof xp !== "number" || !Number.isInteger(xp) || xp < 0 || xp > 20000000) return `floors[${i}]: опыт зачистки 0…20000000`;
  return { general, boss, gSig: gSig as Sig, bSig: bSig as Sig, mut, need, xp };
}

function readFloors(raw: unknown): FloorTune[] | string {
  if (!Array.isArray(raw)) return "floors: нужен список";
  if (raw.length === 13) {
    const out = DEFAULT_TUNE.floors.map((row) => ({ ...row }));
    for (let d = 0; d < 13; d++) {
      const row = raw[d];
      if (!row || typeof row !== "object" || Array.isArray(row)) return `floors[${d}]: нужен объект`;
      const stages = SW_FLOORS.filter((f) => f.dungeon === d + 1);
      const boss = stages.filter((f) => f.goal === "boss").pop() || stages[stages.length - 1];
      for (const f of stages) {
        const parsed = readFloorRow(row as Record<string, unknown>, d, out[f.n - 1]);
        if (typeof parsed === "string") return parsed;
        out[f.n - 1] = f.n === boss.n ? parsed : { ...out[f.n - 1], need: parsed.need };
      }
    }
    return out;
  }
  if (raw.length !== FLOOR_N) return `floors: ${FLOOR_N} этапов или старые 13 данжей`;
  const out: FloorTune[] = [];
  for (let i = 0; i < FLOOR_N; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) return `floors[${i}]: нужен объект`;
    const parsed = readFloorRow(row as Record<string, unknown>, i, DEFAULT_TUNE.floors[i]);
    if (typeof parsed === "string") return parsed;
    out.push(parsed);
  }
  return out;
}

export function floorKit(n: number, t = active): FloorTune {
  const i = Math.max(1, Math.min(FLOOR_N, n | 0)) - 1;
  return t.floors[i];
}

export function floorMut(n: number, t = active): { id: number; name: string; mult: number } | null {
  const i = floorKit(n, t).mut | 0;
  if (i < 1 || i > MUT_NAMES.length) return null;
  const mult = t.mut.mult[i - 1];
  if (!(mult > 0)) return null;
  return { id: i, name: MUT_NAMES[i - 1], mult };
}

export function eliteName(kind: "general" | "boss", floor: number, t = active) {
  const kit = floorKit(floor, t);
  const base = kind === "boss" ? kit.boss : kit.general;
  const m = floorMut(floor, t);
  return m ? `${m.name} · ${base}` : base;
}

export function diffIndex(n: number) {
  const i = (n | 0) - 1;
  return i < 0 ? 0 : i > DIFF_N - 1 ? DIFF_N - 1 : i;
}
export function diffRow(n: number, t = active) {
  const i = diffIndex(n);
  const d = t.diff;
  const step = DIFF_CHAIN[i];
  return {
    id: i + 1,
    name: step.name,
    color: step.color,
    ink: step.ink,
    icon: step.icon,
    lore: step.lore,
    act: step.act,
    tier: step.tier,
    hp: d.hp[i],
    dmg: d.dmg[i],
    gold: d.gold[i],
    xp: d.xp[i],
    rare: d.rare[i],
    leg: d.leg[i],
    affix: d.affix[i] | 0,
    ilvl: d.ilvl[i] | 0,
    budget: d.budget[i],
    curse: d.curse[i],
    ench: d.ench[i],
    chest: d.chest[i] | 0,
    lower: d.lower[i],
    near: d.near[i],
    soak: d.soak[i],
    regen: d.regen[i],
  };
}
export function chestTotal(diff = 1, t = active) {
  return Math.max(0, Math.min(4, (t.loot.chestCount | 0) + diffRow(diff, t).chest));
}

function dropIndex(diff: number) {
  return Math.max(0, Math.min(6, (diff | 0) - 1));
}

/** Доля убийств, после которых сундук появляется. Число из набора, не обещание листа. */
export function dropChance(kind: "general" | "boss", diff = 1, t = active) {
  const row = kind === "boss" ? t.drops.bossChance : t.drops.generalChance;
  return row[dropIndex(diff)];
}

/** Сколько вещей в сундуке этого убийства. Минимум и максимум — из набора. */
export function dropCount(kind: "general" | "boss", diff: number, rng: () => number, t = active) {
  const i = dropIndex(diff);
  const min = (kind === "boss" ? t.drops.bossMin : t.drops.generalMin)[i] | 0;
  const max = Math.max(min, (kind === "boss" ? t.drops.bossMax : t.drops.generalMax)[i] | 0);
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Радиус тела в мире. Рисунок элиты крупнее толпы, удар читает тот же рост. */
export function eliteBody(kind: "general" | "boss") {
  return kind === "boss" ? 68 : 44;
}

/** Множитель спрайта. Толпа остаётся на 2.1, эти двое заметно выше. */
export function eliteDraw(kind: "general" | "boss") {
  return kind === "boss" ? 4.6 : 3.6;
}

/** Дальность удара в тех же единицах, что и телеграф. К моменту удара кольцо доходит сюда. */
export function eliteReach(kind: "general" | "boss", move = "", sig = "") {
  if (move === "pull") return kind === "boss" ? 110 : 96;
  if (move === "bite") return kind === "boss" ? 160 : 140;
  if (move === "slow") return kind === "boss" ? 210 : 186;
  if (sig === "line" || sig === "cone") return kind === "boss" ? 248 : 210;
  return kind === "boss" ? 175 : 138;
}

export const ELITE_LINE_SIDE = 40;

export function mobHp(kind: number, floor: number, t = active, diff = 1) {
  const i = ((kind % 3) + 3) % 3;
  const base = t.combat.mobHp[i] + fightScale(floor) * t.combat.mobHpPerFloor;
  return Math.max(1, Math.round(base * diffRow(diff, t).hp));
}
export function mobDmg(kind: number, t = active, diff = 1) {
  const i = ((kind % 3) + 3) % 3;
  return Math.max(1, Math.round(t.combat.mobDmg[i] * diffRow(diff, t).dmg));
}
export function partyHpMult(party = 1, t = active) {
  const extra = Math.max(0, (party | 0) - 1);
  return Math.min(t.combat.partyHpCap, 1 + t.combat.partyHpPerExtra * extra);
}
export function eliteHp(kind: "general" | "boss", floor: number, party = 1, t = active, diff = 1) {
  const n = Math.max(1, Math.min(FLOOR_N, floor | 0));
  const scale = fightScale(n);
  const base = kind === "boss"
    ? t.combat.bossHp + scale * t.combat.bossHpPerFloor
    : t.combat.generalHp + scale * t.combat.generalHpPerFloor;
  const grown = floorMut(n, t)?.mult || 1;
  return Math.round(base * partyHpMult(party, t) * grown * diffRow(diff, t).hp);
}
export function eliteDmg(kind: "general" | "boss", floor: number, t = active, diff = 1) {
  const n = Math.max(1, Math.min(FLOOR_N, floor | 0));
  const scale = fightScale(n);
  const base = kind === "boss" ? t.combat.bossDmg + scale * t.combat.bossDmgPerFloor : t.combat.generalDmg + scale * t.combat.generalDmgPerFloor;
  return base * (floorMut(n, t)?.mult || 1) * diffRow(diff, t).dmg;
}

export type TunePreview = {
  floor: number;
  clearGold: number;
  surrenderGold: number;
  killGold10: number;
  mobHp: number;
  bossHpSolo: number;
  bossHpParty4: number;
  bossBlack: number;
  xp1: number;
  curseSpeed: number;
  generalChest: number;
  bossChest: number;
};

/** Сводка для экрана админки. Не пишет в профиль. */
export function previewTune(t: OrdaTune, floor = 1): TunePreview {
  const e = t.economy;
  const clear = e.clearBase + floor * e.clearPerFloor + e.bossBase + floor * e.bossPerFloor;
  return {
    floor,
    clearGold: clear,
    surrenderGold: 0,
    killGold10: Math.round(10 * e.killGold),
    mobHp: mobHp(0, floor, t),
    bossHpSolo: eliteHp("boss", floor, 1, t),
    bossHpParty4: eliteHp("boss", floor, 4, t),
    bossBlack: eliteHp("boss", floor, 1, t, DIFF_N),
    xp1: Math.round(t.xp.base * Math.pow(1, t.xp.pow)),
    curseSpeed: t.curse.speed,
    generalChest: t.drops.generalChance[0],
    bossChest: t.drops.bossChance[0],
  };
}

export function cleanNote(raw: unknown) {
  return String(raw || "").replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
}
