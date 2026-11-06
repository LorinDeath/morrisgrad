// Единый числовой набор «Орды». Его читают хаб, симулятор и комната.
// Админка пишет только сюда, после проверки диапазонов.
// Ярусы чар 1–6 носят имена «Проклятых», включая Чёрный ×10.
// За скорость платит герой: чем выше ярус, тем медленнее шаг.
// Мутации Тёмного мира носят те же десять имён, но множитель режется
// потолком 2.4: ×360 стирает ручной бой и правилом не проходит.

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
  /** Четыре сложности Тёмного мира, которые помещаются в потолок 60 уровня. */
  diff: DiffTune;
};

export type DiffTune = {
  need: [number, number, number, number];
  hp: [number, number, number, number];
  dmg: [number, number, number, number];
  gold: [number, number, number, number];
  xp: [number, number, number, number];
  rare: [number, number, number, number];
  leg: [number, number, number, number];
  affix: [number, number, number, number];
  curse: [number, number, number, number];
  ench: [number, number, number, number];
  chest: [number, number, number, number];
};

/** Имена Тёмного мира. Инферно ×35, Сингулярность ×100 и Абсолютный хаос ×360 требуют уровни 100–200 и в Орду не входят. */
export const DIFF_NAME = ["Обычная", "Сложная", "Героическая", "Кошмар"] as const;

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
  ench: { stat: [1.5, 1.8, 2, 3, 4, 10], speed: [0.97, 0.94, 0.9, 0.82, 0.72, 0.55] },
  mut: { mult: [1.12, 1.22, 1.32, 1.44, 1.56, 1.7, 1.84, 2, 2.15, 2.3] },
  oath: { on: 1, stake: 25 },
  xp: { base: 50, pow: 1.45 },
  diff: {
    need: [1, 10, 30, 60],
    hp: [1, 2.2, 5, 12],
    dmg: [1, 2.2, 5, 12],
    gold: [1, 1.45, 1.9, 2.4],
    xp: [1, 1.35, 1.7, 2.1],
    rare: [0, 0.07, 0.14, 0.22],
    leg: [0, 0, 0.03, 0.07],
    affix: [0, 1, 1, 2],
    curse: [1, 1.4, 1.8, 2.2],
    ench: [1, 1.4, 1.8, 2.2],
    chest: [0, 0, 1, 1],
  },
  floors: [
    { general: "Манекен I", boss: "Теневой Страж", gSig: "circle", bSig: "cone", mut: 0, need: 1, xp: 135 },
    { general: "Головорез тракта", boss: "Атаман Мародёров", gSig: "cone", bSig: "line", mut: 0, need: 2, xp: 190 },
    { general: "Чумной сгусток", boss: "Болотный Ужас", gSig: "line", bSig: "circle", mut: 0, need: 4, xp: 245 },
    { general: "Могильный Упырь", boss: "Чёрный Жнец", gSig: "curse", bSig: "summon", mut: 0, need: 6, xp: 300 },
    { general: "Громовержец", boss: "Райдзин", gSig: "line", bSig: "cone", mut: 1, need: 7, xp: 355 },
    { general: "Пожиратель Сущностей", boss: "Танатос", gSig: "curse", bSig: "circle", mut: 2, need: 8, xp: 410 },
    { general: "Магма-Голем", boss: "Суртур", gSig: "circle", bSig: "summon", mut: 3, need: 9, xp: 465 },
    { general: "Бездонный Страж", boss: "Левиафан", gSig: "summon", bSig: "cone", mut: 4, need: 10, xp: 520 },
    { general: "Коррумпированное Ядро", boss: "Творец Искажения", gSig: "line", bSig: "curse", mut: 5, need: 11, xp: 575 },
    { general: "Страж Нулевой Точки", boss: "Азатот", gSig: "curse", bSig: "summon", mut: 6, need: 12, xp: 2830 },
    { general: "Жрец Крови", boss: "Кармилла", gSig: "cone", bSig: "curse", mut: 7, need: 13, xp: 685 },
    { general: "Каратель", boss: "Призрачный Понтифик", gSig: "cone", bSig: "line", mut: 8, need: 14, xp: 1640 },
    { general: "Каменный Страж", boss: "Титан Атлас", gSig: "circle", bSig: "summon", mut: 10, need: 15, xp: 795 },
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
};

const TRIPLE: Record<string, Bound> = {
  "combat.mobHp": { min: 1, max: 80, int: true },
  "combat.mobDmg": { min: 1, max: 30, int: true },
};

const ROW: Record<string, { n: number; b: Bound }> = {
  "ench.stat": { n: 6, b: { min: 1, max: 10 } },
  "ench.speed": { n: 6, b: { min: 0.5, max: 1 } },
  "mut.mult": { n: 10, b: { min: 1, max: 2.4 } },
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
  const allow = new Set(["v", "economy", "combat", "loot", "curse", "ench", "mut", "oath", "xp", "floors", "diff"]);
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
  const sections = ["economy", "combat", "loot", "curse", "ench", "mut", "oath", "xp"] as const;
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
  void NUM;
  return { ok: true, tune: out };
}

const SIGS = new Set(["circle", "cone", "line", "curse", "summon"]);

const DIFF_KEYS = ["need", "hp", "dmg", "gold", "xp", "rare", "leg", "affix", "curse", "ench", "chest"] as const;
const DIFF_BOUND: Record<(typeof DIFF_KEYS)[number], Bound> = {
  need: { min: 1, max: 60, int: true },
  hp: { min: 1, max: 12 },
  dmg: { min: 1, max: 12 },
  gold: { min: 1, max: 3 },
  xp: { min: 1, max: 2.5 },
  rare: { min: 0, max: 0.4 },
  leg: { min: 0, max: 0.15 },
  affix: { min: 0, max: 3, int: true },
  curse: { min: 1, max: 2.5 },
  ench: { min: 1, max: 2.5 },
  chest: { min: 0, max: 2, int: true },
};

function readDiff(raw: unknown): DiffTune | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "diff: нужен объект";
  const rec = raw as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!DIFF_KEYS.includes(k as (typeof DIFF_KEYS)[number])) return `лишнее поле diff.${k}`;
  const out = {} as DiffTune;
  for (const key of DIFF_KEYS) {
    const arr = rec[key];
    if (!Array.isArray(arr) || arr.length !== 4) return `diff.${key}: 4 числа, по сложности Тёмного мира`;
    const got: number[] = [];
    for (let i = 0; i < 4; i++) {
      const n = num(arr[i], DIFF_BOUND[key], `diff.${key}[${i}]`);
      if (typeof n === "string") return n;
      if (i > 0 && n < got[i - 1]) return `diff.${key}: ступени не убывают`;
      got.push(n);
    }
    (out as any)[key] = got;
  }
  if (out.need[0] !== 1) return "diff.need[0]: обычная сложность открыта с 1 уровня";
  for (let i = 1; i < 4; i++) if (out.need[i] <= out.need[i - 1]) return "diff.need: уровни строго растут";
  if (out.hp[0] !== 1 || out.dmg[0] !== 1 || out.gold[0] !== 1 || out.xp[0] !== 1) return "обычная сложность держит множители ×1";
  return out;
}

function readFloors(raw: unknown): FloorTune[] | string {
  if (!Array.isArray(raw) || raw.length !== 13) return "floors: ровно 13 этажей";
  const out: FloorTune[] = [];
  for (let i = 0; i < 13; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) return `floors[${i}]: нужен объект`;
    const rec = row as Record<string, unknown>;
    for (const k of Object.keys(rec)) if (!["general", "boss", "gSig", "bSig", "mut", "need", "xp"].includes(k)) return `floors[${i}]: лишнее поле ${k}`;
    const general = cleanNote(rec.general);
    const boss = cleanNote(rec.boss);
    if (general.length < 2 || boss.length < 2) return `floors[${i}]: имя короче 2`;
    if (!SIGS.has(String(rec.gSig)) || !SIGS.has(String(rec.bSig))) return `floors[${i}]: приём circle, cone, line, curse или summon`;
    const mut = rec.mut == null ? 0 : rec.mut;
    if (typeof mut !== "number" || !Number.isInteger(mut) || mut < 0 || mut > MUT_NAMES.length) return `floors[${i}]: мутация 0…${MUT_NAMES.length}`;
    const need = rec.need == null ? DEFAULT_TUNE.floors[i].need : rec.need;
    const xp = rec.xp == null ? DEFAULT_TUNE.floors[i].xp : rec.xp;
    if (typeof need !== "number" || !Number.isInteger(need) || need < 1 || need > 60) return `floors[${i}]: уровень входа 1…60`;
    if (typeof xp !== "number" || !Number.isInteger(xp) || xp < 0 || xp > 8000) return `floors[${i}]: опыт зачистки 0…8000`;
    out.push({ general, boss, gSig: rec.gSig as Sig, bSig: rec.bSig as Sig, mut, need, xp });
  }
  return out;
}

export function floorKit(n: number, t = active): FloorTune {
  const i = Math.max(1, Math.min(13, n | 0)) - 1;
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
  return i < 0 ? 0 : i > 3 ? 3 : i;
}
export function diffRow(n: number, t = active) {
  const i = diffIndex(n);
  const d = t.diff;
  return {
    id: i + 1,
    name: DIFF_NAME[i],
    need: d.need[i],
    hp: d.hp[i],
    dmg: d.dmg[i],
    gold: d.gold[i],
    xp: d.xp[i],
    rare: d.rare[i],
    leg: d.leg[i],
    affix: d.affix[i] | 0,
    curse: d.curse[i],
    ench: d.ench[i],
    chest: d.chest[i] | 0,
  };
}
export function chestTotal(diff = 1, t = active) {
  return Math.max(0, Math.min(4, (t.loot.chestCount | 0) + diffRow(diff, t).chest));
}

export function mobHp(kind: number, floor: number, t = active, diff = 1) {
  const i = ((kind % 3) + 3) % 3;
  const base = t.combat.mobHp[i] + Math.max(1, floor | 0) * t.combat.mobHpPerFloor;
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
  const n = Math.max(1, Math.min(13, floor | 0));
  const base = kind === "boss"
    ? t.combat.bossHp + n * t.combat.bossHpPerFloor
    : t.combat.generalHp + n * t.combat.generalHpPerFloor;
  const grown = floorMut(n, t)?.mult || 1;
  return Math.round(base * partyHpMult(party, t) * grown * diffRow(diff, t).hp);
}
export function eliteDmg(kind: "general" | "boss", floor: number, t = active, diff = 1) {
  const n = Math.max(1, Math.min(13, floor | 0));
  const base = kind === "boss" ? t.combat.bossDmg + n * t.combat.bossDmgPerFloor : t.combat.generalDmg + n * t.combat.generalDmgPerFloor;
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
  bossNightmare: number;
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
    bossNightmare: eliteHp("boss", floor, 1, t, 4),
    xp1: Math.round(t.xp.base * Math.pow(1, t.xp.pow)),
    curseSpeed: t.curse.speed,
  };
}

export function cleanNote(raw: unknown) {
  return String(raw || "").replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
}
