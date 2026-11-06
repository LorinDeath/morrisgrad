// Единый числовой набор «Орды». Его читают хаб, симулятор и комната.
// Админка пишет только сюда, после проверки диапазонов. Ярусы зачарования 4–6
// «Проклятых» (до ×10) в Орду не входят: потолок яруса — 3.

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
  ench: { stat: [number, number, number] };
  xp: { base: number; pow: number };
  floors: FloorTune[];
};

export type FloorTune = { general: string; boss: string; gSig: Sig; bSig: Sig };
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
    partyHpPerExtra: 0,
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
  ench: { stat: [1.5, 1.8, 2] },
  xp: { base: 50, pow: 1.45 },
  floors: [
    { general: "Осколок Командира", boss: "Теневой Страж", gSig: "circle", bSig: "cone" },
    { general: "Наёмник-Головорез", boss: "Атаман Мародёров", gSig: "cone", bSig: "line" },
    { general: "Кристальный Страж", boss: "Кристальная Владычица", gSig: "line", bSig: "circle" },
    { general: "Могильный Упырь", boss: "Чёрный Жнец", gSig: "curse", bSig: "summon" },
    { general: "Громовержец", boss: "Райдзин", gSig: "line", bSig: "cone" },
    { general: "Пожиратель Сущностей", boss: "Танатос", gSig: "curse", bSig: "circle" },
    { general: "Магма-Голем", boss: "Суртур", gSig: "circle", bSig: "summon" },
    { general: "Бездонный Страж", boss: "Левиафан", gSig: "summon", bSig: "cone" },
    { general: "Коррумпированное Ядро", boss: "Творец Искажения", gSig: "line", bSig: "curse" },
    { general: "Страж Нулевой Точки", boss: "Азатот", gSig: "curse", bSig: "summon" },
    { general: "Жрец Крови", boss: "Кармилла", gSig: "cone", bSig: "curse" },
    { general: "Каратель", boss: "Призрачный Понтифик", gSig: "cone", bSig: "line" },
    { general: "Пробужденный Страж", boss: "Титан Атлас", gSig: "circle", bSig: "summon" },
  ],
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
  "xp.base": { min: 10, max: 400, int: true },
  "xp.pow": { min: 1, max: 1.8 },
};

const TRIPLE: Record<string, Bound> = {
  "combat.mobHp": { min: 1, max: 80, int: true },
  "combat.mobDmg": { min: 1, max: 30, int: true },
  "ench.stat": { min: 1, max: 2.5 },
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
  const allow = new Set(["v", "economy", "combat", "loot", "curse", "ench", "xp", "floors"]);
  for (const k of Object.keys(src)) if (!allow.has(k)) return { ok: false, err: `лишнее поле ${k}` };
  const out = clone(DEFAULT_TUNE);
  if ("floors" in src) {
    const names = readFloors(src.floors);
    if (typeof names === "string") return { ok: false, err: names };
    out.floors = names;
  }
  const sections = ["economy", "combat", "loot", "curse", "ench", "xp"] as const;
  for (const sec of sections) {
    const block = src[sec];
    if (!block || typeof block !== "object" || Array.isArray(block)) return { ok: false, err: `${sec}: нужен объект` };
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
  void NUM;
  return { ok: true, tune: out };
}

const SIGS = new Set(["circle", "cone", "line", "curse", "summon"]);

function readFloors(raw: unknown): FloorTune[] | string {
  if (!Array.isArray(raw) || raw.length !== 13) return "floors: ровно 13 этажей";
  const out: FloorTune[] = [];
  for (let i = 0; i < 13; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) return `floors[${i}]: нужен объект`;
    const rec = row as Record<string, unknown>;
    for (const k of Object.keys(rec)) if (!["general", "boss", "gSig", "bSig"].includes(k)) return `floors[${i}]: лишнее поле ${k}`;
    const general = cleanNote(rec.general);
    const boss = cleanNote(rec.boss);
    if (general.length < 2 || boss.length < 2) return `floors[${i}]: имя короче 2`;
    if (!SIGS.has(String(rec.gSig)) || !SIGS.has(String(rec.bSig))) return `floors[${i}]: приём circle, cone, line, curse или summon`;
    out.push({ general, boss, gSig: rec.gSig as Sig, bSig: rec.bSig as Sig });
  }
  return out;
}

export function floorKit(n: number, t = active): FloorTune {
  const i = Math.max(1, Math.min(13, n | 0)) - 1;
  return t.floors[i];
}

export function mobHp(kind: number, floor: number, t = active) {
  const i = ((kind % 3) + 3) % 3;
  return t.combat.mobHp[i] + Math.max(1, floor | 0) * t.combat.mobHpPerFloor;
}
export function mobDmg(kind: number, t = active) {
  const i = ((kind % 3) + 3) % 3;
  return t.combat.mobDmg[i];
}
export function eliteHp(kind: "general" | "boss", floor: number, party = 1, t = active) {
  const n = Math.max(1, Math.min(13, floor | 0));
  const base = kind === "boss"
    ? t.combat.bossHp + n * t.combat.bossHpPerFloor
    : t.combat.generalHp + n * t.combat.generalHpPerFloor;
  const extra = Math.max(0, (party | 0) - 1);
  const mult = Math.min(t.combat.partyHpCap, 1 + t.combat.partyHpPerExtra * extra);
  return Math.round(base * mult);
}
export function eliteDmg(kind: "general" | "boss", floor: number, t = active) {
  const n = Math.max(1, Math.min(13, floor | 0));
  return kind === "boss" ? t.combat.bossDmg + n * t.combat.bossDmgPerFloor : t.combat.generalDmg + n * t.combat.generalDmgPerFloor;
}

export type TunePreview = {
  floor: number;
  clearGold: number;
  surrenderGold: number;
  killGold10: number;
  mobHp: number;
  bossHpSolo: number;
  bossHpParty4: number;
  xp1: number;
  curseSpeed: number;
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
    xp1: Math.round(t.xp.base * Math.pow(1, t.xp.pow)),
    curseSpeed: t.curse.speed,
  };
}

export function cleanNote(raw: unknown) {
  return String(raw || "").replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
}
