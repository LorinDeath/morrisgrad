// «Орда Обители» — правила хаба. Прокачка, лут и сумка живут здесь, не в бою.
// Тот же модуль считает награды на сервере (D1) и рисует их в клиенте.
// Числа экономики и лута — в tune.ts. Меняет их только проверенный набор админки.
import { HARD_CAP, capLabel, rateChance } from "./caps";
import { DIFF_NAME, chestTotal, diffRow, eliteDmg, eliteHp, getTune, mobHp, partyHpMult } from "./tune";
import { UPG, upgCost, upgStats } from "../../../server/meta/upgrade.ts";
import { MAT_NAME } from "./mats";
import { FLOOR_N, SW_DUNGEONS, SW_FLOORS, SW_QUESTS, fightScale, floorsOf } from "./sw-catalog";
import { markAnchor, markGold, markPay, markSeed, readBook as readMarks, rollBook, type EliteMark, type MarkBook } from "./mark";
import { MODE_LIST, modeIndex, modeSpec, type ModeId } from "./modes";

export const BAG_START = 12;
export const BAG_STEP = 4;
export const BAG_MAX = 48;
export const BAG_PRICES = [80, 700, 1400, 2500, 4200, 7000, 11000, 17000, 26000];
export const MAX_LVL = 300;
export const START_GOLD = 150;

export type Stat = "str" | "dex" | "vit" | "ene";
export type Slot = "weapon" | "helm" | "chest" | "gloves" | "boots" | "amulet" | "ring";
export type Paper = "weapon" | "helm" | "chest" | "gloves" | "boots" | "amulet" | "ring1" | "ring2";
export type Rarity = "common" | "magic" | "rare" | "legendary" | "set";
export type AffStat = Stat | "dmg" | "hp" | "armor" | "crit" | "dodge" | "aspd" | "ls" | "skill";
export type Shape = "arc" | "circle" | "dash" | "line";

export type Affix = { stat: AffStat; val: number; name: string };
export type Item = {
  id: string;
  base: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  ilvl: number;
  req: number;
  dmg: number;
  armor: number;
  affixes: Affix[];
  unique?: string;
  set?: string;
  /** 1 — проклятый экземпляр: статы × curse.statMult, скорость героя × curse.speed. */
  cursed?: 0 | 1;
  /** Ярус зачарования 1…6, имена как у «Проклятых». 0 и отсутствие — без чар. */
  ench?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Уровень улучшения у Петра, 0 — вещь ещё не точили. Шлифовка — это оно: успех всегда, слома нет. */
  up?: number;
  /** До двух рун Тёмного мира. Только оружие, без повтора одной и той же. */
  sockets?: RuneId[];
};

export const RUNES = [
  { id: "r_vamp", name: "Руна Жатвы", note: "Жажда навыка лечит, но вместе с вампиризмом не выше 10%" },
  { id: "r_chrono", name: "Руна Хроноса", note: "Перезарядка навыков короче на четверть" },
  { id: "r_nova", name: "Руна Сверхновой", note: "Навык бьёт шире" },
  { id: "r_creator", name: "Руна Творца", note: "База этого оружия выше на треть" },
] as const;
export type RuneId = (typeof RUNES)[number]["id"];
const RUNE_SET = new Set<string>(RUNES.map((r) => r.id));

export const RADIANCE_PROP = {
  echo: { name: "Эхо", note: "Навык бьёт ещё раз через мгновение, слабее" },
  vamp: { name: "Жажда", note: "Доля урона навыка лечит. Вместе с вампиризмом не выше 10%" },
  nova: { name: "Вспышка", note: "Вокруг героя вспышка в момент навыка" },
  swift: { name: "Порыв", note: "После навыка шаг быстрее два мгновения" },
  extend: { name: "Размах", note: "Этот навык достаёт дальше" },
} as const;
export type GlowId = keyof typeof RADIANCE_PROP;
const HERO_GLOW: Record<string, [GlowId, GlowId, GlowId]> = {
  lorin: ["echo", "vamp", "nova"],
  lorelin: ["extend", "echo", "nova"],
  veles: ["extend", "nova", "vamp"],
  listaf: ["echo", "swift", "nova"],
  chronos: ["echo", "swift", "nova"],
  fox: ["swift", "echo", "vamp"],
  itrain: ["extend", "echo", "nova"],
  alex: ["nova", "swift", "echo"],
};

export const ENCH_NAME = ["Необычный", "Редкий", "Странный", "Легендарный", "Божественный", "Чёрный"] as const;
export type ChestPick = "plain" | "curse" | 1 | 2 | 3 | 4 | 5 | 6;
export const OATHS = [
  { id: "none", name: "Без клятвы", note: "Этаж как есть" },
  { id: "pawn", name: "Пешка", note: "Золото этажа ×1.2, шаг ×0.9" },
  { id: "knight", name: "Конь", note: "Шаг ×1.12, здоровье ×0.88" },
  { id: "rook", name: "Ладья", note: "+12 брони, шаг ×0.86" },
  { id: "harvest", name: "Руна жатвы", note: "Вампиризм +54 рейтинга, около 6% с нуля и меньше, если рейтинг уже есть. Урон ×0.92" },
  { id: "haste", name: "Руна спешки", note: "Скорость атаки ×1.12, здоровье ×0.9" },
  { id: "cup", name: "Кубок", note: "Ставка до боя: победа возвращает её дважды, поражение забирает" },
] as const;
export type OathId = (typeof OATHS)[number]["id"];

export type SkillDef = {
  id: string;
  name: string;
  key: string;
  cd: number;
  musou?: boolean;
  shape: Shape;
  r: number;
  ang: number;
  dmg: number;
  heal?: number;
  stun?: number;
  dash?: number;
  fx: string;
  fx2: string;
};

export type HeroId = "lorin" | "lorelin" | "veles" | "listaf" | "chronos" | "fox" | "itrain" | "alex";

export type HeroDef = {
  id: HeroId;
  name: string;
  title: string;
  faction: string;
  blurb: string;
  hair: string;
  cloth: string;
  accent: string;
  skin: string;
  metal: string;
  weapon: "scythe" | "staff" | "sword" | "daggers" | "hour" | "katana" | "rail" | "glitch";
  hairStyle: "long" | "waves" | "short" | "hood" | "tie" | "fox" | "spiky" | "messy";
  base: Record<Stat, number>;
  skills: SkillDef[];
};

export type Sig = "circle" | "cone" | "line" | "curse" | "summon";
export type FloorDef = {
  n: number;
  /** id данжа из public/shadow-world/js/data.js */
  sw: string;
  name: string;
  place: string;
  dungeonName: string;
  desc: string;
  /** Три волны одной мусо-комнаты. Имена этапа, не список этажей данжа. */
  stages: [string, string, string];
  tint: string;
  ember: string;
  mob: string;
  general: string;
  boss: string;
  bossTitle: string;
  goal: "pack" | "elite" | "boss";
  dungeon: number;
  stage: number;
  stagesInDungeon: number;
  srcHp: number;
  srcAtk: number;
  file: string;
  spawnGeneral: 0 | 1;
  story?: string;
  /** Приём генерала и босса. В файлах Тёмного мира приёма нет: там скорость атаки и защита. */
  gSig: Sig;
  bSig: Sig;
  /** Ряды bestiary_atlas: генерал, босс, три поведения толпы. */
  gRow: number;
  bRow: number;
  mobRows: [number, number, number];
  /** Особый режим. У этапов кампании поля нет. */
  play?: Play;
};

export type Play = {
  kind: ModeId;
  winSec?: number;
  enrageSec?: number;
  playerDmg?: number;
  foeHp?: number;
  armor?: number;
  mirror?: boolean;
  soloBoss?: boolean;
  loot?: number;
  /** Этаж бездны или индекс босс-раша. Поднимает ярус чар, не выше Чёрного. */
  step?: number;
};

const sk = (p: SkillDef): SkillDef => p;

export const HEROES: HeroDef[] = [
  {
    id: "lorin", name: "Лорин Дэс", title: "Смерть", faction: "Адское пламя",
    blurb: "Коса по толпе. Финальный взмах сжигает всё, что стоит рядом.",
    hair: "#1a0a0c", cloth: "#3a1014", accent: "#ff4a32", skin: "#f0c8b0", metal: "#c9a27a",
    weapon: "scythe", hairStyle: "long",
    base: { str: 16, dex: 8, vit: 9, ene: 7 },
    skills: [
      sk({ id: "harvest", name: "Жатва", key: "Q", cd: 3.2, shape: "arc", r: 168, ang: 1.45, dmg: 1.85, fx: "#ff5a3c", fx2: "#ffd0a8" }),
      sk({ id: "ash", name: "Пепел", key: "E", cd: 5.2, shape: "circle", r: 138, ang: 0, dmg: 1.55, fx: "#ffb020", fx2: "#ff5a1a" }),
      sk({ id: "wing", name: "Крыло бездны", key: "R", cd: 6, shape: "dash", r: 70, ang: 0.5, dmg: 1.7, dash: 230, fx: "#ffd0a8", fx2: "#ff3a1a" }),
      sk({ id: "hell", name: "Адское пламя", key: "F", cd: 0, musou: true, shape: "circle", r: 300, ang: 0, dmg: 4.6, fx: "#ff2a12", fx2: "#fff1c4" }),
    ],
  },
  {
    id: "lorelin", name: "Лорелин Сэйлор", title: "Лекарь", faction: "Обитель тьмы",
    blurb: "Свет режет орду и поднимает отряд. Круг жизни — по своим.",
    hair: "#2a1038", cloth: "#4a2060", accent: "#e7b6ff", skin: "#f3d0c4", metal: "#e7d2ff",
    weapon: "staff", hairStyle: "waves",
    base: { str: 6, dex: 8, vit: 10, ene: 16 },
    skills: [
      sk({ id: "pulse", name: "Пульс", key: "Q", cd: 3, shape: "arc", r: 150, ang: 1.2, dmg: 1.5, fx: "#e7b6ff", fx2: "#fff" }),
      sk({ id: "circle", name: "Круг жизни", key: "E", cd: 6, shape: "circle", r: 160, ang: 0, dmg: 1.05, heal: 0.2, fx: "#d8fff0", fx2: "#e7b6ff" }),
      sk({ id: "shine", name: "Сияние", key: "R", cd: 5, shape: "circle", r: 148, ang: 0, dmg: 1.7, fx: "#fff6ff", fx2: "#c080ff" }),
      sk({ id: "abode", name: "Обитель", key: "F", cd: 0, musou: true, shape: "circle", r: 280, ang: 0, dmg: 3.4, heal: 0.38, fx: "#f4e6ff", fx2: "#ffffff" }),
    ],
  },
  {
    id: "veles", name: "Велес", title: "Главный страж", faction: "Модераторы",
    blurb: "Щит и широкий клинок. Держит генерала лицом к себе.",
    hair: "#1c2430", cloth: "#1c3048", accent: "#8ec5ff", skin: "#e7c2a4", metal: "#d5dee8",
    weapon: "sword", hairStyle: "short",
    base: { str: 12, dex: 7, vit: 16, ene: 6 },
    skills: [
      sk({ id: "wall", name: "Стена", key: "Q", cd: 3.4, shape: "arc", r: 132, ang: 0.7, dmg: 2.05, fx: "#8ec5ff", fx2: "#fff" }),
      sk({ id: "bash", name: "Удар щита", key: "E", cd: 4.6, shape: "arc", r: 118, ang: 1.5, dmg: 1.7, stun: 0.45, fx: "#dce7ff", fx2: "#8ec5ff" }),
      sk({ id: "line", name: "Клин стража", key: "R", cd: 5.5, shape: "dash", r: 64, ang: 0.4, dmg: 1.8, dash: 200, fx: "#b9d7ff", fx2: "#fff" }),
      sk({ id: "mod", name: "Модерация", key: "F", cd: 0, musou: true, shape: "circle", r: 250, ang: 0, dmg: 3.8, stun: 0.8, fx: "#d6e6ff", fx2: "#8ec5ff" }),
    ],
  },
  {
    id: "listaf", name: "Листаф Элфдид", title: "Губитель", faction: "Ядовитый эфир",
    blurb: "Быстрые кинжалы. Веер накрывает пачку, тень прошивает её насквозь.",
    hair: "#14301c", cloth: "#143222", accent: "#3dff9a", skin: "#efc8b4", metal: "#b7f5c8",
    weapon: "daggers", hairStyle: "hood",
    base: { str: 8, dex: 16, vit: 7, ene: 8 },
    skills: [
      sk({ id: "poison", name: "Яд", key: "Q", cd: 2.6, shape: "arc", r: 128, ang: 1.15, dmg: 1.35, fx: "#3dff9a", fx2: "#d8ffb0" }),
      sk({ id: "fan", name: "Веер", key: "E", cd: 4.4, shape: "arc", r: 176, ang: 2.15, dmg: 1.45, fx: "#b6ff6a", fx2: "#3dff9a" }),
      sk({ id: "shade", name: "Тень", key: "R", cd: 5, shape: "dash", r: 60, ang: 0.45, dmg: 1.65, dash: 250, fx: "#d8ffc8", fx2: "#1c8a4a" }),
      sk({ id: "ether", name: "Эфир", key: "F", cd: 0, musou: true, shape: "circle", r: 270, ang: 0, dmg: 4.1, fx: "#b6ff6a", fx2: "#f4ffe8" }),
    ],
  },
  {
    id: "chronos", name: "Хронос", title: "Библиотекарь", faction: "ДаргСирром",
    blurb: "Останавливает генерала на взмахе и бьёт в чужое замедленное время.",
    hair: "#3a3018", cloth: "#3a2c16", accent: "#f0d080", skin: "#f0d0b8", metal: "#ffe7a8",
    weapon: "hour", hairStyle: "tie",
    base: { str: 7, dex: 9, vit: 8, ene: 16 },
    skills: [
      sk({ id: "slow", name: "Замедление", key: "Q", cd: 5, shape: "circle", r: 150, ang: 0, dmg: 0.7, stun: 0.85, fx: "#f0d080", fx2: "#fff6d0" }),
      sk({ id: "break", name: "Разрыв часа", key: "E", cd: 3.4, shape: "arc", r: 156, ang: 1.25, dmg: 1.7, fx: "#ffe7a8", fx2: "#fff" }),
      sk({ id: "loop", name: "Петля", key: "R", cd: 5.4, shape: "dash", r: 66, ang: 0.4, dmg: 1.6, dash: 210, fx: "#fff6d0", fx2: "#c8a050" }),
      sk({ id: "chronicle", name: "Хроника", key: "F", cd: 0, musou: true, shape: "circle", r: 290, ang: 0, dmg: 3.6, stun: 1.15, fx: "#fff1c2", fx2: "#ffffff" }),
    ],
  },
  {
    id: "fox", name: "Вайт Фокс", title: "Белая охота", faction: "Альказак",
    blurb: "Рывки и клыки. Длинный мусоу прочерчивает арену белой дугой.",
    hair: "#f4f7ff", cloth: "#d8e2f2", accent: "#9fd6ff", skin: "#f6d5c4", metal: "#ffffff",
    weapon: "katana", hairStyle: "fox",
    base: { str: 10, dex: 15, vit: 8, ene: 7 },
    skills: [
      sk({ id: "rush", name: "Рывок", key: "Q", cd: 2.8, shape: "dash", r: 58, ang: 0.4, dmg: 1.4, dash: 220, fx: "#ffffff", fx2: "#9fd6ff" }),
      sk({ id: "fangs", name: "Клыки", key: "E", cd: 4, shape: "arc", r: 150, ang: 1.3, dmg: 1.7, fx: "#e7f4ff", fx2: "#ffffff" }),
      sk({ id: "snow", name: "Метель", key: "R", cd: 5.2, shape: "circle", r: 142, ang: 0, dmg: 1.45, fx: "#d7f0ff", fx2: "#ffffff" }),
      sk({ id: "hunt", name: "Белая охота", key: "F", cd: 0, musou: true, shape: "dash", r: 90, ang: 0.7, dmg: 4.4, dash: 340, fx: "#ffffff", fx2: "#b9e4ff" }),
    ],
  },
  {
    id: "itrain", name: "Айтрейн", title: "Машинист", faction: "Рельсы",
    blurb: "Удар идёт рельсом: прямая полоса через всю пачку.",
    hair: "#2a2418", cloth: "#2c2414", accent: "#ffd15a", skin: "#e8c4a8", metal: "#7ecbff",
    weapon: "rail", hairStyle: "spiky",
    base: { str: 9, dex: 14, vit: 8, ene: 10 },
    skills: [
      sk({ id: "rail", name: "Рельс", key: "Q", cd: 2.7, shape: "line", r: 360, ang: 0, dmg: 1.75, fx: "#ffd15a", fx2: "#7ecbff" }),
      sk({ id: "train", name: "Состав", key: "E", cd: 4.8, shape: "line", r: 300, ang: 0.35, dmg: 1.4, fx: "#fff", fx2: "#ffd15a" }),
      sk({ id: "whistle", name: "Свисток", key: "R", cd: 6, shape: "circle", r: 150, ang: 0, dmg: 1.1, stun: 0.7, fx: "#7ecbff", fx2: "#fff" }),
      sk({ id: "express", name: "Экспресс", key: "F", cd: 0, musou: true, shape: "line", r: 540, ang: 0, dmg: 4.3, fx: "#fff6c8", fx2: "#7ecbff" }),
    ],
  },
  {
    id: "alex", name: "Алекс Сэйлор", title: "Поехавший", faction: "Сбой",
    blurb: "Глитч путает взмахи. Перегруз рвёт круг, мусоу — три кольца сразу.",
    hair: "#ff3d8a", cloth: "#2a1030", accent: "#ff3d8a", skin: "#f0c8c0", metal: "#7a5cff",
    weapon: "glitch", hairStyle: "messy",
    base: { str: 11, dex: 11, vit: 8, ene: 12 },
    skills: [
      sk({ id: "glitch", name: "Сбой", key: "Q", cd: 2.8, shape: "arc", r: 160, ang: 1.6, dmg: 1.6, fx: "#ff3d8a", fx2: "#7a5cff" }),
      sk({ id: "loopa", name: "Петля кода", key: "E", cd: 4.6, shape: "dash", r: 64, ang: 0.5, dmg: 1.55, dash: 210, fx: "#7a5cff", fx2: "#ff3d8a" }),
      sk({ id: "over", name: "Перегруз", key: "R", cd: 5.4, shape: "circle", r: 155, ang: 0, dmg: 1.8, fx: "#ff7ad2", fx2: "#fff" }),
      sk({ id: "mad", name: "Поехавший", key: "F", cd: 0, musou: true, shape: "circle", r: 300, ang: 0, dmg: 4.2, fx: "#ff3d8a", fx2: "#7a5cff" }),
    ],
  },
];

export { FLOOR_N, SW_DUNGEONS, SW_QUESTS };
export const FLOORS: FloorDef[] = SW_FLOORS.map((f) => ({
  n: f.n, sw: f.sw, name: f.name, place: f.dungeonName, dungeonName: f.dungeonName, desc: f.desc, stages: f.wave,
  tint: f.tint, ember: f.ember, mob: f.mob, general: f.general, boss: f.boss, bossTitle: f.bossTitle,
  goal: f.goal, dungeon: f.dungeon, stage: f.stage, stagesInDungeon: f.stagesInDungeon,
  srcHp: f.srcHp, srcAtk: f.srcAtk, file: f.file, spawnGeneral: f.spawnGeneral, story: f.story,
  gSig: f.gSig, bSig: f.bSig, gRow: f.gRow, bRow: f.bRow, mobRows: f.mobRows,
}));

export const RARITY_NAME: Record<Rarity, string> = {
  common: "обычный", magic: "магический", rare: "редкий", legendary: "легендарный", set: "комплект",
};
export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#c4b8a4", magic: "#6ea8ff", rare: "#f0d56a", legendary: "#ff9a3c", set: "#3dff9a",
};

type SetDef = { id: string; name: string; a: { slot: Slot; name: string }; b: { slot: Slot; name: string }; stat: "dmg" | "heal" | "armor" | "aspd"; val: number; text: string };
const SETS: SetDef[] = [
  { id: "flame", name: "Адское пламя", a: { slot: "weapon", name: "Коса пламени" }, b: { slot: "chest", name: "Мантия пламени" }, stat: "dmg", val: 0.15, text: "Урон +15%" },
  { id: "veil", name: "Вуаль Обители", a: { slot: "weapon", name: "Посох вуали" }, b: { slot: "amulet", name: "Кулон вуали" }, stat: "heal", val: 0.1, text: "Лечение +10%" },
  { id: "guard", name: "Стража Велеса", a: { slot: "weapon", name: "Клинок стражи" }, b: { slot: "helm", name: "Шлем стражи" }, stat: "armor", val: 12, text: "Броня +12" },
  { id: "ether", name: "Ядовитый эфир", a: { slot: "weapon", name: "Кинжалы эфира" }, b: { slot: "gloves", name: "Перчатки эфира" }, stat: "aspd", val: 0.12, text: "Скорость атаки +12%" },
];

type UniqueDef = { id: string; name: string; slot: Slot; dmg: number; armor: number; affixes: Affix[] };
const UNIQUES: UniqueDef[] = [
  { id: "scythe", name: "Коса Обители", slot: "weapon", dmg: 22, armor: 0, affixes: [{ stat: "str", val: 6, name: "силы" }, { stat: "ls", val: 3, name: "вампиризма" }] },
  { id: "seal", name: "Печать Велеса", slot: "helm", dmg: 0, armor: 14, affixes: [{ stat: "vit", val: 8, name: "живучести" }, { stat: "armor", val: 6, name: "брони" }] },
  { id: "clock", name: "Часы Хроноса", slot: "amulet", dmg: 0, armor: 0, affixes: [{ stat: "ene", val: 8, name: "энергии" }, { stat: "skill", val: 8, name: "урона навыков" }] },
  { id: "fang", name: "Белый клык", slot: "weapon", dmg: 16, armor: 0, affixes: [{ stat: "dex", val: 7, name: "ловкости" }, { stat: "crit", val: 5, name: "крита" }] },
  { id: "rail", name: "Рельс Айтрейна", slot: "weapon", dmg: 18, armor: 0, affixes: [{ stat: "dex", val: 4, name: "ловкости" }, { stat: "dmg", val: 8, name: "к урону" }] },
  { id: "cape", name: "Сбойный плащ", slot: "chest", dmg: 0, armor: 8, affixes: [{ stat: "ene", val: 5, name: "энергии" }, { stat: "aspd", val: 6, name: "скорости атаки" }] },
];

const BASES: Record<Slot, { id: string; name: string; dmg: number; armor: number }[]> = {
  weapon: [
    { id: "blade", name: "Клинок", dmg: 7, armor: 0 },
    { id: "scythe", name: "Коса", dmg: 9, armor: 0 },
    { id: "staff", name: "Посох", dmg: 6, armor: 0 },
    { id: "daggers", name: "Кинжалы", dmg: 6, armor: 0 },
    { id: "bow", name: "Лук", dmg: 7, armor: 0 },
  ],
  helm: [{ id: "helm", name: "Шлем", dmg: 0, armor: 5 }, { id: "hood", name: "Капюшон", dmg: 0, armor: 3 }],
  chest: [{ id: "mail", name: "Доспех", dmg: 0, armor: 9 }, { id: "robe", name: "Мантия", dmg: 0, armor: 5 }],
  gloves: [{ id: "gloves", name: "Перчатки", dmg: 0, armor: 3 }],
  boots: [{ id: "boots", name: "Сапоги", dmg: 0, armor: 4 }],
  amulet: [{ id: "amulet", name: "Амулет", dmg: 0, armor: 0 }],
  ring: [{ id: "ring", name: "Кольцо", dmg: 0, armor: 0 }],
};

const AFFIX_POOL: { stat: AffStat; name: string; min: number; max: number }[] = [
  { stat: "str", name: "силы", min: 1, max: 6 },
  { stat: "dex", name: "ловкости", min: 1, max: 6 },
  { stat: "vit", name: "живучести", min: 1, max: 6 },
  { stat: "ene", name: "энергии", min: 1, max: 6 },
  { stat: "dmg", name: "к урону", min: 2, max: 9 },
  { stat: "hp", name: "здоровья", min: 12, max: 40 },
  { stat: "armor", name: "брони", min: 2, max: 8 },
  { stat: "crit", name: "крита", min: 1, max: 3 },
  { stat: "dodge", name: "уклонения", min: 1, max: 2 },
  { stat: "aspd", name: "скорости атаки", min: 2, max: 7 },
  { stat: "ls", name: "вампиризма", min: 1, max: 2 },
  { stat: "skill", name: "урона навыков", min: 2, max: 8 },
];

const PREFIX = ["Злобный", "Тихий", "Рваный", "Ночной", "Пыльный", "Кровавый", "Старый", "Ясный"];
const SUFFIX = ["порога", "купола", "эфира", "стражи", "пепла", "луны", "рельса", "сбоя"];

export type QuestKind = "kills" | "generals" | "boss" | "bag";
export type QuestDef = {
  id: string; floor: number; kind: QuestKind; need: number;
  name: string; desc: string; gold: number; xp: number; chest: Rarity | null;
};

export function killNeed(floor: number) { return 80 + Math.round(fightScale(floor)) * 20; }

export function questDefs(): QuestDef[] {
  const out: QuestDef[] = [{
    id: "bag16", floor: 0, kind: "bag", need: 16,
    name: "Сумка на 16 ячеек",
    desc: "В лавке у порога купи первое расширение сумки.",
    gold: 80, xp: 40, chest: null,
  }];
  for (const f of FLOORS) {
    const need = killNeed(f.n);
    out.push({
      id: `k${f.n}`, floor: f.n, kind: "kills", need,
      name: `${f.name}: ${need} тварей`,
      desc: `Повалить ${need} тварей на этаже «${f.name}». Толпа лезет сама, генералы бьют по-настоящему.`,
      gold: 70 + f.n * 30, xp: 40 + f.n * 18, chest: null,
    });
    out.push({
      id: `g${f.n}`, floor: f.n, kind: "generals", need: 3,
      name: `${f.name}: генералы`,
      desc: `Сразить трёх генералов волны. Имя их командира — ${f.general}.`,
      gold: 110 + f.n * 35, xp: 55 + f.n * 20, chest: "magic",
    });
    out.push({
      id: `b${f.n}`, floor: f.n, kind: "boss", need: 1,
      name: `Зачистить: ${f.name}`,
      desc: f.goal === "boss" ? `Одолеть босса «${f.boss}». ${f.bossTitle}.` : `Зачистить этап. Цель: «${f.boss}». ${f.bossTitle}.`,
      gold: 180 + f.n * 50, xp: 90 + f.n * 28, chest: f.n >= 7 ? "rare" : "magic",
    });
  }
  return out;
}

const QUEST_BY = new Map(questDefs().map((q) => [q.id, q]));
export function questById(id: string) { return QUEST_BY.get(id) || null; }

export type QuestState = { p: number; done: 0 | 1; claimed: 0 | 1 };
export type Equip = Record<Paper, Item | null>;
export type Pending = {
  floor: number; at: number; nonce: string; chests?: number; oath?: OathId; diff: number; hero?: HeroId; mode?: ModeId;
  /** Общий сид забега. Переподключение его не бросает заново. */
  seed?: number;
  /** Ярусы генералов и босса, выбранные при старте. */
  marks?: MarkBook;
  step?: number;
};

export type ModeBook = { abyss: number; best: number; rush: number; wins: number[] };

export function emptyBook(): ModeBook {
  return { abyss: 1, best: 0, rush: 0, wins: [0, 0, 0, 0, 0, 0, 0] };
}

function readBook(raw: any): ModeBook {
  const b = emptyBook();
  if (!raw || typeof raw !== "object") return b;
  b.abyss = Math.max(1, Math.min(999, raw.abyss | 0 || 1));
  b.best = Math.max(0, Math.min(999, raw.best | 0));
  b.rush = Math.max(0, raw.rush | 0);
  if (Array.isArray(raw.wins)) {
    for (let i = 0; i < 7; i++) b.wins[i] = Math.max(0, Math.min(9999, raw.wins[i] | 0));
  }
  return b;
}

export type HeroCard = {
  id: HeroId;
  lvl: number;
  xp: number;
  unspent: number;
  alloc: Record<Stat, number>;
  clears: number[];
  chain: number[];
  quests: Record<string, QuestState>;
  equip: Equip;
  kills: number;
  oath: OathId;
  book: ModeBook;
  /** Сияние навыков 0…9. Своё у героя. Числа — как у Проклятых: +6% силы за шаг, не выше +45%, перезарядка −2.5% за шаг. */
  radiance: number;
};

export type Profile = {
  v: 1;
  hero: HeroId | null;
  /** Слоты героев. Сумка, золото и материалы в карточку не входят. */
  roster: HeroCard[];
  lvl: number;
  xp: number;
  gold: number;
  unspent: number;
  alloc: Record<Stat, number>;
  bagSize: number;
  nextId: number;
  shopSeed: number;
  equip: Equip;
  bag: Item[];
  inbox: Item[];
  quests: Record<string, QuestState>;
  clears: number[];
  /** Высшая пройденная сложность на данже: 0 нет, 1 базовая … 7 чёрная. */
  chain: number[];
  kills: number;
  pending: Pending | null;
  /** Клятва на следующий забег. В бою действует копия внутри pending. */
  oath: OathId;
  /** Материалы Петра. Общие на аккаунт, не на героя. */
  res: Record<string, number>;
  /** Этаж Бездны, индекс Босс-Раша и победы режимов. Свои у героя. */
  book: ModeBook;
  /** Сияние активного героя. В карточке то же поле, сумка его не делит. */
  radiance: number;
};

export type Sheet = {
  hero: HeroId;
  name: string;
  hp: number;
  dmg: number;
  armor: number;
  aspd: number;
  crit: number;
  critRaw: number;
  dodge: number;
  dodgeRaw: number;
  speed: number;
  skill: number;
  ls: number;
  lsRaw: number;
  heal: number;
  gold: number;
  accent: string;
  /** Множитель перезарядки навыков. 1 — как в листе героя. */
  cdMul: number;
  /** Множитель радиуса навыков. */
  radiusMul: number;
  /** Шаг сияния, уже обрезанный потолком набора. */
  radiance: number;
};

export function heroById(id: string | null | undefined): HeroDef {
  return HEROES.find((h) => h.id === id) || HEROES[0];
}
export function floorByN(n: number) { return FLOORS[Math.max(0, Math.min(FLOOR_N - 1, (n | 0) - 1))]; }

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;

function emptyEquip(): Equip {
  return { weapon: null, helm: null, chest: null, gloves: null, boots: null, amulet: null, ring1: null, ring2: null };
}

export function newProfile(seed = 1): Profile {
  return {
    v: 1, hero: null, lvl: 1, xp: 0, gold: getTune().economy.startGold, unspent: 0,
    alloc: { str: 0, dex: 0, vit: 0, ene: 0 },
    bagSize: BAG_START, nextId: 1, shopSeed: seed >>> 0,
    equip: emptyEquip(), bag: [], inbox: [], quests: {},
    clears: Array.from({ length: FLOOR_N }, () => 0),
    chain: Array.from({ length: FLOOR_N }, () => 0),
    kills: 0, pending: null, oath: "none", roster: [], res: {}, book: emptyBook(), radiance: 0,
  };
}

function freshCard(id: HeroId): HeroCard {
  return {
    id, lvl: 1, xp: 0, unspent: 0, alloc: { str: 0, dex: 0, vit: 0, ene: 0 },
    clears: Array.from({ length: FLOOR_N }, () => 0),
    chain: Array.from({ length: FLOOR_N }, () => 0),
    quests: {}, equip: emptyEquip(), kills: 0, oath: "none", book: emptyBook(), radiance: 0,
  };
}

function snapshot(p: Profile): HeroCard {
  return JSON.parse(JSON.stringify({
    id: p.hero, lvl: p.lvl, xp: p.xp, unspent: p.unspent, alloc: p.alloc,
    clears: p.clears, chain: p.chain, quests: p.quests, equip: p.equip, kills: p.kills, oath: p.oath, book: p.book,
    radiance: p.radiance | 0,
  }));
}

export function seal(p: Profile) {
  if (!p.hero) return;
  const card = snapshot(p);
  const i = p.roster.findIndex((r) => r.id === p.hero);
  if (i < 0) p.roster.push(card);
  else p.roster[i] = card;
}

function mount(p: Profile, id: HeroId) {
  const card = p.roster.find((r) => r.id === id);
  if (!card) return;
  const c = JSON.parse(JSON.stringify(card)) as HeroCard;
  p.hero = c.id;
  p.lvl = c.lvl;
  p.xp = c.xp;
  p.unspent = c.unspent;
  p.alloc = c.alloc;
  p.clears = c.clears;
  p.chain = c.chain;
  p.quests = c.quests;
  p.equip = c.equip;
  p.kills = c.kills;
  p.oath = c.oath;
  p.book = readBook(c.book);
  p.radiance = Math.max(0, Math.min(9, c.radiance | 0));
}

export function xpNeed(lvl: number) {
  const x = getTune().xp;
  return Math.round(x.base * Math.pow(Math.max(1, lvl), x.pow));
}

/** Доля одного уровня за полную зачистку актуального данжа. Обычная — 0.10, третья (Редкая) — 0.25. Остальные ступени — ровные шаги между ними. Игроку эти доли не показываются. */
export const LEVEL_SHARE = [0.10, 0.15, 0.25, 0.32, 0.38, 0.44, 0.50] as const;

export function relevance(lvl: number, dungeon: number): number {
  const rows = floorsOf(dungeon);
  if (!rows.length) return 1;
  const next = SW_DUNGEONS[dungeon];
  const ceiling = next ? Math.max(rows[0].minLvl, next.minLvl - 1) : MAX_LVL;
  const level = Math.max(1, lvl | 0);
  if (level <= ceiling) return 1;
  return Math.max(0.08, ceiling / level);
}

export function dungeonBudget(lvl: number, dungeon: number, diff: number): number {
  const share = LEVEL_SHARE[Math.max(0, Math.min(6, (diff | 0) - 1))] ?? 0.1;
  return Math.max(1, Math.round(xpNeed(Math.max(1, lvl | 0)) * share * relevance(lvl, dungeon)));
}

function stageWeight(goal: string, general: boolean): number {
  if (goal === "boss") return 1.6;
  if (goal === "elite" || general) return 1.15;
  return 1;
}

/** Кусок бюджета данжа на один этап. Сумма этапов равна бюджету. Толпа, генерал и зачистка внутри куска тоже складываются в него. */
export function stageSlice(lvl: number, floor: number, diff: number): { total: number; mob: number; general: number; clear: number } {
  const f = floorByN(floor);
  const rows = floorsOf(f.dungeon);
  const budget = dungeonBudget(lvl, f.dungeon, diff);
  const weights = rows.map((row) => stageWeight(row.goal, !!row.spawnGeneral));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((w) => (budget * w) / sum);
  const base = exact.map((x) => Math.floor(x));
  let left = budget - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < left; k++) base[order[k % order.length].i]++;
  const total = base[Math.max(0, f.stage - 1)] ?? 0;
  const hasGen = !!f.spawnGeneral;
  let general = hasGen ? Math.round(total * 0.34) : 0;
  let mob = Math.round(total * 0.16);
  if (general + mob > total) mob = Math.max(0, total - general);
  return { total, mob, general, clear: total - general - mob };
}

export function stagePay(lvl: number, floor: number, diff: number, replay: boolean) {
  const s = stageSlice(lvl, floor, diff);
  if (!replay) return s;
  const total = Math.max(0, Math.round(s.total * getTune().economy.replayXp));
  if (total <= 0) return { total: 0, mob: 0, general: 0, clear: 0 };
  const general = s.general > 0 ? Math.min(total, Math.round(total * 0.34)) : 0;
  const mob = Math.min(Math.max(0, total - general), Math.round(total * 0.16));
  return { total, mob, general, clear: total - general - mob };
}

export function marksOn(floor: number, book?: MarkBook, mode?: ModeId): EliteMark[] {
  if (!book) return [];
  if (mode) return [mode === "arena" || mode === "horde" ? book.g0 : book.boss];
  const f = floorByN(floor);
  const out: EliteMark[] = [];
  if (f.spawnGeneral) out.push(book.g0, book.g1, book.g2);
  if (f.goal !== "pack") out.push(book.boss);
  return out;
}

export function bagTier(p: Profile) { return Math.max(0, Math.round((p.bagSize - BAG_START) / BAG_STEP)); }
export function bagPrice(p: Profile): number | null {
  const t = bagTier(p);
  const prices = getTune().economy.bagPrices;
  return t >= prices.length || p.bagSize >= BAG_MAX ? null : prices[t];
}
export function goldFind(p: Profile) { return bagTier(p) * getTune().economy.bagGoldFind; }
export function bagFree(p: Profile) { return Math.max(0, p.bagSize - p.bag.length); }
export function bestFloor(p: Profile) {
  let n = 0;
  for (let i = 0; i < p.clears.length; i++) if (p.clears[i] > 0) n = i + 1;
  return n;
}
/** Уровень, с которого данж открыт. Число из админки, не номер прошлой зачистки. */
export function floorNeed(n: number) {
  const row = getTune().floors[(n | 0) - 1];
  return row ? row.need | 0 : 99;
}
export function floorPassed(p: Profile, n: number) {
  return ((p.clears[Math.max(0, (n | 0) - 1)] || 0) > 0);
}
export function floorLock(p: Profile, n: number): string | null {
  if ((n | 0) < 1 || (n | 0) > FLOOR_N) return "Нет такого этапа";
  if (floorPassed(p, n)) return null;
  const f = FLOORS[(n | 0) - 1];
  if (f.stage > 1 && !floorPassed(p, n - 1)) {
    const prev = FLOORS[n - 2];
    return `«${f.name}» открывается после этапа «${prev.name}» в данже «${f.dungeonName}». Уровень открывает данж и не пропускает его этажи.`;
  }
  const need = floorNeed(n);
  if ((p.lvl | 0) >= need) return null;
  return `«${f.dungeonName}» открывается с уровня ${need}. Сейчас ${p.lvl}. Уровень копится опытом зачистки и квестами, номер пройденного этажа его не заменяет.`;
}
export function floorOpen(p: Profile, n: number) { return floorLock(p, n) === null; }

function mint(p: Profile) { return "i" + (p.nextId++); }

function validItem(it: any): it is Item {
  return !!it && typeof it.id === "string" && typeof it.slot === "string" && typeof it.rarity === "string" && Array.isArray(it.affixes);
}

function sanitizeItem(it: Item): Item {
  const n = it.ench | 0;
  const ench = n >= 1 && n <= 6 ? n as 1 | 2 | 3 | 4 | 5 | 6 : 0;
  const cursed = it.cursed === 1 ? 1 : 0;
  const next: Item = { ...it, affixes: it.affixes.slice(0, 6) };
  if (cursed) next.cursed = 1; else delete next.cursed;
  if (ench) next.ench = ench; else delete next.ench;
  const up = Math.max(0, Math.min(UPG.maxLvl | 0, it.up | 0));
  if (up) next.up = up; else delete next.up;
  const sockets = readSockets(it);
  if (it.slot === "weapon" && sockets.length) next.sockets = sockets; else delete next.sockets;
  return next;
}

function readSockets(it: { sockets?: unknown }): RuneId[] {
  if (!Array.isArray(it.sockets)) return [];
  const out: RuneId[] = [];
  for (const id of it.sockets) {
    const s = String(id || "");
    if (!RUNE_SET.has(s) || out.includes(s as RuneId)) continue;
    out.push(s as RuneId);
    if (out.length >= 2) break;
  }
  return out;
}

export function skillGlow(hero: string, idx: number, step: number): GlowId | null {
  const row = HERO_GLOW[hero];
  if (!row || idx < 0 || idx > 2) return null;
  const need = idx === 0 ? 3 : idx === 1 ? 6 : 9;
  if ((step | 0) < need) return null;
  return row[idx];
}

export function radianceStep(p: Profile): number {
  return Math.max(0, Math.min(getTune().craft.radianceMax | 0, p.radiance | 0));
}

export function glowLine(p: Profile): string {
  const step = radianceStep(p);
  const row = HERO_GLOW[p.hero || ""] || HERO_GLOW.lorin;
  const bits = [
    step >= 3 ? RADIANCE_PROP[row[0]].name : "",
    step >= 6 ? RADIANCE_PROP[row[1]].name : "",
    step >= 9 ? RADIANCE_PROP[row[2]].name : "",
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : "пока без особого свойства";
}

export function normalize(raw: any): Profile {
  const p = newProfile(1);
  if (!raw || typeof raw !== "object") return p;
  const hero = HEROES.some((h) => h.id === raw.hero) ? raw.hero as HeroId : null;
  p.hero = hero;
  p.lvl = Math.max(1, Math.min(MAX_LVL, raw.lvl | 0 || 1));
  p.xp = Math.max(0, raw.xp | 0);
  p.gold = Math.max(0, Math.min(50_000_000, raw.gold | 0));
  p.unspent = Math.max(0, raw.unspent | 0);
  for (const s of ["str", "dex", "vit", "ene"] as Stat[]) p.alloc[s] = Math.max(0, Math.min(400, raw.alloc?.[s] | 0));
  p.bagSize = Math.max(BAG_START, Math.min(BAG_MAX, raw.bagSize | 0 || BAG_START));
  p.nextId = Math.max(1, raw.nextId | 0 || 1);
  p.shopSeed = (raw.shopSeed >>> 0) || 1;
  p.kills = Math.max(0, raw.kills | 0);
  const prog = progressOf(raw.clears, raw.chain);
  p.clears = prog.clears;
  p.chain = prog.chain;
  const eq = emptyEquip();
  for (const slot of Object.keys(eq) as Paper[]) {
    const it = raw.equip?.[slot];
    if (validItem(it)) eq[slot] = sanitizeItem({ ...it, affixes: it.affixes.slice(0, 6) });
  }
  p.equip = eq;
  const bag = Array.isArray(raw.bag) ? raw.bag.filter(validItem).slice(0, BAG_MAX).map((it) => sanitizeItem(it)) : [];
  if (bag.length > p.bagSize) {
    const extra = bag.splice(p.bagSize);
    for (const it of extra) p.gold += salvageValue(it);
  }
  p.bag = bag;
  p.inbox = Array.isArray(raw.inbox) ? raw.inbox.filter(validItem).slice(0, 12).map((it) => sanitizeItem(it)) : [];
  if (raw.quests && typeof raw.quests === "object") {
    for (const [id, q] of Object.entries(raw.quests as Record<string, any>)) {
      if (!questById(id) || !q) continue;
      p.quests[id] = { p: Math.max(0, q.p | 0), done: q.done ? 1 : 0, claimed: q.claimed ? 1 : 0 };
    }
  }
  if (raw.pending && typeof raw.pending.nonce === "string" && (raw.pending.floor | 0) >= 1) {
    const oath = oathOf(raw.pending.oath);
    const diff = Math.max(1, Math.min(7, raw.pending.diff | 0 || 1));
    const who = HEROES.some((h) => h.id === raw.pending.hero) ? raw.pending.hero as HeroId : undefined;
    const mode = modeSpec(String(raw.pending.mode || ""))?.id;
    const marks = readMarks(raw.pending.marks);
    const seed = (raw.pending.seed | 0) >>> 0;
    p.pending = {
      floor: raw.pending.floor | 0, at: raw.pending.at | 0, nonce: String(raw.pending.nonce).slice(0, 40), chests: raw.pending.chests | 0, diff,
      ...(oath !== "none" ? { oath } : {}), ...(who ? { hero: who } : {}), ...(mode ? { mode } : {}),
      ...(seed ? { seed } : {}), ...(marks ? { marks } : {}),
      ...(raw.pending.step != null ? { step: Math.max(0, Math.min(999, raw.pending.step | 0)) } : {}),
    };
  }
  p.oath = oathOf(raw.oath);
  p.book = readBook(raw.book);
  p.radiance = Math.max(0, Math.min(9, raw.radiance | 0));
  if (raw.res && typeof raw.res === "object") {
    for (const [k, v] of Object.entries(raw.res as Record<string, unknown>)) {
      if (!MAT_NAME[k] && !RUNE_SET.has(k)) continue;
      const n = Math.max(0, Math.min(9999, (v as number) | 0));
      if (n) p.res[k] = n;
    }
  }
  const cards = Array.isArray(raw.roster) ? raw.roster.map(readCard).filter((c): c is HeroCard => !!c) : [];
  if (cards.length) {
    const seen = new Set<string>();
    p.roster = cards.filter((c) => seen.has(c.id) ? false : (seen.add(c.id), true));
    if (p.hero && p.roster.some((c) => c.id === p.hero)) mount(p, p.hero);
    else if (!p.hero && p.roster[0]) mount(p, p.roster[0].id);
  } else if (p.hero) {
    p.roster = [snapshot(p)];
  }
  pullWorn(p);
  seal(p);
  return p;
}

function readCard(raw: any): HeroCard | null {
  if (!raw || !HEROES.some((h) => h.id === raw.id)) return null;
  const card = freshCard(raw.id);
  card.lvl = Math.max(1, Math.min(MAX_LVL, raw.lvl | 0 || 1));
  card.xp = Math.max(0, raw.xp | 0);
  card.unspent = Math.max(0, raw.unspent | 0);
  for (const s of ["str", "dex", "vit", "ene"] as Stat[]) card.alloc[s] = Math.max(0, Math.min(400, raw.alloc?.[s] | 0));
  card.kills = Math.max(0, raw.kills | 0);
  const prog = progressOf(raw.clears, raw.chain);
  card.clears = prog.clears;
  card.chain = prog.chain;
  card.oath = oathOf(raw.oath);
  card.book = readBook(raw.book);
  card.radiance = Math.max(0, Math.min(9, raw.radiance | 0));
  if (raw.quests && typeof raw.quests === "object") {
    for (const [id, q] of Object.entries(raw.quests as Record<string, any>)) {
      if (!questById(id) || !q) continue;
      card.quests[id] = { p: Math.max(0, q.p | 0), done: q.done ? 1 : 0, claimed: q.claimed ? 1 : 0 };
    }
  }
  for (const slot of Object.keys(card.equip) as Paper[]) {
    const it = raw.equip?.[slot];
    if (validItem(it)) card.equip[slot] = sanitizeItem({ ...it, affixes: it.affixes.slice(0, 6) });
  }
  return card;
}

function pullWorn(p: Profile) {
  const worn = new Set<string>();
  for (const card of p.roster) {
    for (const slot of Object.keys(card.equip) as Paper[]) {
      const it = card.equip[slot];
      if (!it) continue;
      if (worn.has(it.id)) card.equip[slot] = null;
      else worn.add(it.id);
    }
  }
  if (p.hero) {
    const live = p.roster.find((c) => c.id === p.hero);
    if (live) p.equip = JSON.parse(JSON.stringify(live.equip));
  }
  p.bag = p.bag.filter((it) => !worn.has(it.id));
  p.inbox = p.inbox.filter((it) => !worn.has(it.id));
}

function oathOf(raw: unknown): OathId {
  const id = String(raw || "none");
  return OATHS.some((o) => o.id === id) ? id as OathId : "none";
}

export function setOath(p: Profile, id: string): string | null {
  if (!getTune().oath.on && id !== "none") return "Клятвы выключены в наборе чисел";
  if (!OATHS.some((o) => o.id === id)) return "Нет такой клятвы";
  p.oath = id as OathId;
  return null;
}

export function addXp(p: Profile, n: number) {
  let gained = 0;
  p.xp += Math.max(0, Math.round(n));
  while (p.lvl < MAX_LVL && p.xp >= xpNeed(p.lvl)) {
    p.xp -= xpNeed(p.lvl);
    p.lvl++;
    p.unspent += 5;
    gained++;
  }
  if (p.lvl >= MAX_LVL) p.xp = 0;
  return gained;
}

export function spendStat(p: Profile, stat: Stat): string | null {
  if (!p.hero) return "Сначала выбери героя";
  if (!(stat in p.alloc)) return "Нет такой характеристики";
  if (p.unspent < 1) return "Нет свободных очков";
  p.unspent--;
  p.alloc[stat]++;
  return null;
}

export function setHero(p: Profile, id: HeroId): string | null {
  if (!HEROES.some((h) => h.id === id)) return "Нет такого героя";
  if (p.hero === id) { seal(p); return null; }
  seal(p);
  if (!p.roster.some((r) => r.id === id)) p.roster.push(freshCard(id));
  mount(p, id);
  return null;
}

function equipped(p: Profile) {
  return (Object.keys(p.equip) as Paper[]).map((s) => p.equip[s]).filter((x): x is Item => !!x);
}

export function setBonus(p: Profile) {
  const items = equipped(p);
  const got: { name: string; text: string }[] = [];
  let dmg = 0, heal = 0, armor = 0, aspd = 0;
  for (const set of SETS) {
    const a = items.some((it) => it.set === set.id && it.slot === set.a.slot);
    const b = items.some((it) => it.set === set.id && it.slot === set.b.slot);
    if (!a || !b) continue;
    got.push({ name: set.name, text: set.text });
    if (set.stat === "dmg") dmg += set.val;
    if (set.stat === "heal") heal += set.val;
    if (set.stat === "armor") armor += set.val;
    if (set.stat === "aspd") aspd += set.val;
  }
  return { got, dmg, heal, armor, aspd };
}

export function sheet(p: Profile): Sheet {
  const h = heroById(p.hero);
  let str = h.base.str + p.alloc.str;
  let dex = h.base.dex + p.alloc.dex;
  let vit = h.base.vit + p.alloc.vit;
  let ene = h.base.ene + p.alloc.ene;
  let dmg = 0, armor = 0, hp = 0, aspd = 0, crit = 0, dodge = 0, ls = 0, skill = 0;
  let speedMul = 1, cdMul = 1, radiusMul = 1;
  const tune = getTune();
  for (const it of equipped(p)) {
    if (p.lvl < it.req) continue;
    const up = Math.max(0, it.up | 0);
    const grown = up ? upgStats({ dmg: it.dmg || 0, armor: it.armor || 0 }, up, false) : null;
    const mult = (it.cursed === 1 ? tune.curse.statMult : 1) * (it.ench ? tune.ench.stat[it.ench - 1] || 1 : 1);
    if (it.cursed === 1) speedMul *= tune.curse.speed;
    if (it.ench) speedMul *= tune.ench.speed[it.ench - 1] || 1;
    const creator = it.slot === "weapon" && it.sockets?.includes("r_creator") ? 1.35 : 1;
    dmg += (grown ? Number(grown.dmg) : it.dmg) * mult * creator;
    armor += (grown ? Number(grown.armor) : it.armor) * mult * creator;
    if (it.slot === "weapon" && it.sockets?.includes("r_vamp")) ls += 48;
    if (it.slot === "weapon" && it.sockets?.includes("r_chrono")) cdMul *= 0.75;
    if (it.slot === "weapon" && it.sockets?.includes("r_nova")) radiusMul *= 1.2;
    for (const a of it.affixes) {
      const base = up ? Number(upgStats({ v: a.val }, up, false).v) : a.val;
      const val = base * mult * creator;
      if (a.stat === "str") str += val;
      else if (a.stat === "dex") dex += val;
      else if (a.stat === "vit") vit += val;
      else if (a.stat === "ene") ene += val;
      else if (a.stat === "dmg") dmg += val;
      else if (a.stat === "hp") hp += val;
      else if (a.stat === "armor") armor += val;
      else if (a.stat === "crit") crit += val;
      else if (a.stat === "dodge") dodge += val;
      else if (a.stat === "aspd") aspd += val / 100;
      else if (a.stat === "ls") ls += val;
      else if (a.stat === "skill") skill += val / 100;
    }
  }
  const set = setBonus(p);
  let hpOut = Math.round(90 + vit * 14 + hp);
  let dmgOut = Math.round((8 + str * 1.15 + dmg) * (1 + set.dmg));
  let armorOut = Math.round(armor + set.armor);
  let aspdOut = Math.min(2.2, 1 + dex * 0.0065 + aspd + set.aspd);
  let goldOut = goldFind(p);
  const vow = p.pending?.oath;
  if (vow === "pawn") { goldOut *= 1.2; speedMul *= 0.9; }
  else if (vow === "knight") { speedMul *= 1.12; hpOut = Math.round(hpOut * 0.88); }
  else if (vow === "rook") { armorOut += 12; speedMul *= 0.86; }
  else if (vow === "harvest") { ls += 54; dmgOut = Math.round(dmgOut * 0.92); }
  else if (vow === "haste") { aspdOut = Math.min(2.2, aspdOut * 1.12); hpOut = Math.round(hpOut * 0.9); }
  const glow = radianceStep(p);
  const power = 1 + Math.min(0.45, 0.06 * glow);
  skill = (1 + ene * 0.012 + skill) * power;
  cdMul *= 1 - 0.025 * glow;
  const critRaw = 22 + dex * 0.45 + crit;
  const dodgeRaw = 4 + dex * 0.22 + dodge;
  const lsRaw = ls;
  return {
    hero: h.id,
    name: h.name,
    hp: hpOut,
    dmg: dmgOut,
    armor: armorOut,
    aspd: aspdOut,
    crit: rateChance(critRaw, "crit"),
    critRaw,
    dodge: rateChance(dodgeRaw, "dodge"),
    dodgeRaw,
    speed: Math.round((214 + dex * 0.4) * Math.max(0.45, speedMul)),
    skill,
    ls: rateChance(lsRaw, "ls"),
    lsRaw,
    heal: 1 + set.heal,
    gold: goldOut,
    accent: h.accent,
    cdMul,
    radiusMul,
    radiance: glow,
  };
}

export { HARD_CAP, capLabel };

/** Сравнение вещи сумки с тем, что уже надето. Профиль не меняется. */
export function compareGear(p: Profile, itemId: string) {
  const before = sheet(p);
  const it = p.bag.find((i) => i.id === itemId) || null;
  if (!it) return { item: null, slot: null as Paper | null, otherRing: null as { slot: Paper; item: Item | null } | null, blocked: "Вещи нет в сумке", worn: false, empty: true, before, after: before };
  const worn = (Object.keys(p.equip) as Paper[]).some((s) => p.equip[s]?.id === it.id);
  const slot = paperFor(it, p.equip);
  const otherRing = it.slot === "ring" && slot
    ? { slot: (slot === "ring1" ? "ring2" : "ring1") as Paper, item: p.equip[slot === "ring1" ? "ring2" : "ring1"] }
    : null;
  const blocked = p.lvl < it.req ? `Требует уровень ${it.req}. Сейчас ${p.lvl}. Надеть нельзя, статы не придут.` : null;
  const empty = !slot || !p.equip[slot];
  if (blocked || worn || !slot) return { item: it, slot, otherRing, blocked, worn, empty, before, after: before };
  const ghost = structuredClone(p);
  ghost.equip[slot] = structuredClone(it);
  return { item: it, slot, otherRing, blocked: null, worn: false, empty, before, after: sheet(ghost) };
}

/** Что даст одно очко, не тратя его. Сила растит урон, ловкость — крит, уклон и шаг, живучесть — здоровье, энергия — навыки. */
export function statGlance(p: Profile, stat: Stat) {
  const before = sheet(p);
  p.alloc[stat] += 1;
  const after = sheet(p);
  p.alloc[stat] -= 1;
  return { before, after };
}

function affixLine(a: { stat: AffStat; val: number; name: string }) {
  const noun = a.name.replace(/^рейтинга\s+/, "");
  if (a.stat === "crit" || a.stat === "dodge" || a.stat === "aspd" || a.stat === "ls" || a.stat === "skill") return `+${a.val} рейтинга ${noun}`;
  return `+${a.val} ${noun}`;
}

function rollAffix(rng: Rng, ilvl: number, used: Set<string>, bias?: string[]): Affix {
  const themed = bias?.length ? AFFIX_POOL.filter((a) => !used.has(a.stat) && bias.includes(a.stat)) : [];
  const pool = themed.length ? themed : AFFIX_POOL.filter((a) => !used.has(a.stat));
  const src = pool.length ? pool : AFFIX_POOL;
  const a = src[Math.floor(rng() * src.length)];
  used.add(a.stat);
  const t = Math.min(1, ilvl / 30);
  const val = a.min + Math.floor(rng() * (a.max - a.min + 1) + t * (a.max - a.min) * 0.45);
  const clamped = Math.min(a.max + Math.floor(ilvl / 8), val);
  return { stat: a.stat, val: clamped, name: a.name };
}

function rarityRoll(rng: Rng, floor: number, shop: boolean): Rarity {
  const x = rng();
  const loot = getTune().loot;
  const leg = shop ? loot.legShop : Math.min(loot.legCap, loot.legBase + floor * loot.legPerFloor);
  const set = shop ? loot.setShop : Math.min(loot.setCap, Math.max(0, (floor - 4) * loot.setPerFloor));
  const rare = (shop ? loot.rareShop : loot.rareDrop) + Math.min(loot.rareCap, floor * loot.rarePerFloor);
  const magic = shop ? loot.magicShop : loot.magicDrop;
  if (x < set) return "set";
  if (x < set + leg) return "legendary";
  if (x < set + leg + rare) return "rare";
  if (x < set + leg + rare + magic) return "magic";
  return "common";
}

function scaleBase(n: number, ilvl: number) { return Math.round(n * (1 + Math.max(0, ilvl - 1) * 0.08)); }

export function dropQuality(lvl: number, floor: number, diff: number) {
  const row = diffRow(diff);
  const ilvl = Math.max(1, Math.min(60, Math.max(lvl | 0, Math.max(1, floor | 0) + 1) + (row.ilvl | 0)));
  const budget = row.budget || 1;
  return {
    id: row.id, name: row.name, ilvl, budget, affix: row.affix,
    dmg: Math.round(scaleBase(7, ilvl) * budget),
    affixTop: Math.round((9 + Math.floor(ilvl / 8)) * budget),
  };
}

function applyBudget(it: Item, budget: number) {
  const b = budget > 0 ? budget : 1;
  if (b === 1) return it;
  it.dmg = Math.round(it.dmg * b);
  it.armor = Math.round(it.armor * b);
  it.affixes = it.affixes.map((a) => ({ ...a, val: Math.max(1, Math.round(a.val * b)) }));
  return it;
}

export function itemPrice(it: Item) {
  const mult = { common: 1, magic: 3.1, rare: 8, legendary: 22, set: 16 }[it.rarity];
  return Math.max(20, Math.round((36 + it.ilvl * 11 + it.dmg * 3 + it.armor * 4) * mult));
}
export function salvageValue(it: Item) { return Math.max(1, Math.round(itemPrice(it) * 0.4)); }

const ACT_BIAS: Record<string, string[]> = {
  mend: ["vit", "hp"],
  plate: ["armor", "str"],
  blink: ["dex", "aspd"],
  brand: ["crit", "dmg"],
  nova: ["ene", "skill"],
  killer: ["ls", "dmg"],
};

export function rollDropTier(rng: Rng, diff: number): number {
  const row = diffRow(diff);
  if (row.tier <= 0 || rng() >= row.lower) return row.tier;
  const weights: number[] = [];
  let sum = 0;
  for (let t = 0; t < row.tier; t++) {
    const w = Math.pow(row.near || 1, t);
    weights.push(w);
    sum += w;
  }
  let x = rng() * sum;
  for (let t = 0; t < weights.length; t++) {
    if (x < weights[t]) return t;
    x -= weights[t];
  }
  return Math.max(0, row.tier - 1);
}

export function rollItem(rng: Rng, o: { ilvl: number; floor: number; shop?: boolean; rarity?: Rarity; id?: string; bare?: boolean; extraAffix?: number; curseMul?: number; enchMul?: number; budget?: number; act?: string; tier?: number }): Item {
  const ilvl = Math.max(1, Math.min(60, Math.round(o.ilvl)));
  const budget = o.budget && o.budget > 0 ? o.budget : 1;
  const bias = ACT_BIAS[o.act || ""] || [];
  const rarity = o.rarity || rarityRoll(rng, o.floor, !!o.shop);
  const slots = Object.keys(BASES) as Slot[];
  if (rarity === "legendary" && rng() < 0.75) {
    const u = UNIQUES[Math.floor(rng() * UNIQUES.length)];
    return stampTier(applyBudget(markItem({
      id: o.id || "x", base: u.id, name: u.name, slot: u.slot, rarity, ilvl, req: Math.max(1, ilvl - 2),
      dmg: scaleBase(u.dmg, ilvl), armor: scaleBase(u.armor, ilvl), unique: u.id,
      affixes: u.affixes.map((a) => ({ ...a })),
    }, rng, !!o.shop, !!o.bare, o.curseMul, typeof o.tier === "number" ? 0 : o.enchMul), budget), o.tier);
  }
  if (rarity === "set") {
    const set = SETS[Math.floor(rng() * SETS.length)];
    const piece = rng() < 0.5 ? set.a : set.b;
    const base = BASES[piece.slot][0];
    return stampTier(applyBudget(markItem({
      id: o.id || "x", base: base.id, name: piece.name, slot: piece.slot, rarity, ilvl,
      req: Math.max(1, ilvl - 2), dmg: scaleBase(base.dmg + 3, ilvl), armor: scaleBase(base.armor + 2, ilvl),
      set: set.id, affixes: fillAffixes(rng, ilvl, 2 + extraAffixOf(o), bias),
    }, rng, !!o.shop, !!o.bare, o.curseMul, typeof o.tier === "number" ? 0 : o.enchMul), budget), o.tier);
  }
  const slot = slots[Math.floor(rng() * slots.length)];
  const base = BASES[slot][Math.floor(rng() * BASES[slot].length)];
  const extra = Math.max(0, Math.min(3, o.extraAffix | 0));
  const nAff = (rarity === "common" ? 0 : rarity === "magic" ? 1 + (rng() < 0.45 ? 1 : 0) : rarity === "rare" ? 3 + (rng() < 0.4 ? 1 : 0) : 4) + (rarity === "common" ? 0 : extra);
  const affixes = fillAffixes(rng, ilvl, nAff, bias);
  let name = base.name;
  if (rarity === "magic" && affixes[0]) name = `${base.name} ${affixes[0].name}`;
  if (rarity === "rare" || rarity === "legendary") {
    name = `${PREFIX[Math.floor(rng() * PREFIX.length)]} ${base.name.toLowerCase()} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`;
  }
  return stampTier(applyBudget(markItem({
    id: o.id || "x", base: base.id, name, slot, rarity, ilvl, req: Math.max(1, ilvl - 3),
    dmg: scaleBase(base.dmg, ilvl), armor: scaleBase(base.armor, ilvl), affixes,
  }, rng, !!o.shop, !!o.bare, o.curseMul, typeof o.tier === "number" ? 0 : o.enchMul), budget), o.tier);
}

function stampTier(it: Item, tier?: number) {
  if (typeof tier !== "number") return it;
  if (tier >= 1 && tier <= 6) enchantItem(it, tier as 1 | 2 | 3 | 4 | 5 | 6);
  else delete it.ench;
  return it;
}

function extraAffixOf(o: { extraAffix?: number }) {
  return Math.max(0, Math.min(3, o.extraAffix | 0));
}

function markItem(it: Item, rng: Rng, shop: boolean, bare = false, curseMul = 1, enchMul = 1): Item {
  if (bare) return it;
  const loot = getTune().loot;
  const curseP = Math.min(0.75, (shop ? loot.curseChance * 0.25 : loot.curseChance) * (curseMul || 1));
  const enchP = Math.min(0.75, (shop ? loot.enchChance * 0.25 : loot.enchChance) * (enchMul || 1));
  if (curseP > 0 && rng() < curseP) curseItem(it);
  if (enchP > 0 && rng() < enchP) enchantItem(it, rollEnchTier(rng));
  return it;
}

function rollEnchTier(rng: Rng): 1 | 2 | 3 | 4 | 5 | 6 {
  const w = [0.46, 0.28, 0.14, 0.07, 0.04, 0.01];
  let x = rng();
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return 1;
}

function curseItem(it: Item) {
  it.cursed = 1;
  if (!it.name.startsWith("Проклятый ")) it.name = "Проклятый " + it.name.charAt(0).toLowerCase() + it.name.slice(1);
}

function enchantItem(it: Item, tier: 1 | 2 | 3 | 4 | 5 | 6) {
  it.ench = tier;
  const label = ENCH_NAME[tier - 1];
  if (!it.name.startsWith(label + " ")) it.name = label + " " + it.name.charAt(0).toLowerCase() + it.name.slice(1);
}

function fillAffixes(rng: Rng, ilvl: number, n: number, bias?: string[]): Affix[] {
  const used = new Set<string>();
  const out: Affix[] = [];
  for (let i = 0; i < n; i++) {
    out.push(rollAffix(rng, ilvl, used, bias));
  }
  return out;
}

export function affixText(a: Affix) { return affixLine(a); }

export type Offer = { id: string; kind: "bag"; name: string; detail: string; price: number; to: number } | { id: string; kind: "item"; price: number; item: Item };

function shopRng(p: Profile) {
  const hero = p.hero ? HEROES.findIndex((h) => h.id === p.hero) : 0;
  return mulberry32((Math.imul(p.shopSeed >>> 0, 10007) + p.lvl * 13 + hero * 97) >>> 0);
}

export function shopOffers(p: Profile): Offer[] {
  const rng = shopRng(p);
  const out: Offer[] = [];
  const price = bagPrice(p);
  if (price != null) {
    out.push({
      id: "bag", kind: "bag", price, to: Math.min(BAG_MAX, p.bagSize + BAG_STEP),
      name: "Расширение сумки",
      detail: `${p.bagSize} → ${Math.min(BAG_MAX, p.bagSize + BAG_STEP)} ячеек. Золото с этажей +${Math.round(getTune().economy.bagGoldFind * 100)}% за каждый ранг сумки (сейчас +${Math.round(goldFind(p) * 100)}%).`,
    });
  }
  const floor = Math.max(1, bestFloor(p) || 1);
  for (let i = 0; i < 8; i++) {
    const item = rollItem(rng, { ilvl: Math.max(1, p.lvl + Math.floor(rng() * 3)), floor, shop: true, id: "shop" });
    out.push({ id: "g" + i, kind: "item", price: itemPrice(item), item });
  }
  return out;
}

export function buyBag(p: Profile): string | null {
  const price = bagPrice(p);
  if (price == null) return "Сумка уже на пределе";
  if (p.gold < price) return "Не хватает золота";
  p.gold -= price;
  p.bagSize = Math.min(BAG_MAX, p.bagSize + BAG_STEP);
  return null;
}

export function refreshCost(p: Profile) { return 40 + p.lvl * 15; }

export function refreshShop(p: Profile): string | null {
  const c = refreshCost(p);
  if (p.gold < c) return "Не хватает золота на обновление лавки";
  p.gold -= c;
  p.shopSeed = (p.shopSeed + 1 + Math.floor(Math.random() * 999)) >>> 0;
  return null;
}

export function buyOffer(p: Profile, id: string): string | null {
  if (id === "bag") return buyBag(p);
  const offer = shopOffers(p).find((o) => o.id === id);
  if (!offer || offer.kind !== "item") return "Этой вещи уже нет в лавке";
  if (p.gold < offer.price) return "Не хватает золота";
  if (bagFree(p) < 1) return "Сумка полна. Продай вещь или расширь сумку";
  p.gold -= offer.price;
  p.bag.push({ ...offer.item, id: mint(p), affixes: offer.item.affixes.map((a) => ({ ...a })) });
  return null;
}

function paperFor(it: Item, equip: Equip): Paper | null {
  if (it.slot === "ring") {
    if (!equip.ring1) return "ring1";
    if (!equip.ring2) return "ring2";
    return "ring1";
  }
  return it.slot;
}

export function equipItem(p: Profile, itemId: string): string | null {
  const idx = p.bag.findIndex((it) => it.id === itemId);
  if (idx < 0) return "Вещи нет в сумке";
  const it = p.bag[idx];
  if (p.lvl < it.req) return `«${it.name}» требует уровень ${it.req}. У ${heroById(p.hero).name} сейчас ${p.lvl}. Статы не применятся.`;
  const slot = paperFor(it, p.equip);
  if (!slot) return "Некуда надеть";
  const prev = p.equip[slot];
  p.equip[slot] = it;
  p.bag.splice(idx, 1);
  if (prev) p.bag.push(prev);
  return null;
}

function findOwned(p: Profile, id: string): Item | null {
  const bag = p.bag.find((it) => it.id === id);
  if (bag) return bag;
  for (const slot of Object.keys(p.equip) as Paper[]) if (p.equip[slot]?.id === id) return p.equip[slot];
  return null;
}

export function matLabel(id: string) { return MAT_NAME[id] || id; }

export function forgePreview(p: Profile, it: Item) {
  const cap = Math.min(UPG.maxLvl | 0, getTune().forge.max | 0);
  const cur = Math.max(0, it.up | 0);
  const cost = cur >= cap ? null : upgCost(cur + 1, it.cursed === 1, UPG, it.ench || 0);
  const lines = cost ? Object.entries(cost).map(([id, n]) => ({ id, name: matLabel(id), n, have: p.res[id] || 0 })) : [];
  const next = upgStats({ dmg: it.dmg || 0, armor: it.armor || 0 }, Math.min(cap, cur + 1), false);
  const miss = !getTune().forge.on ? "Кузница закрыта в наборе" : cur >= cap ? `Дальше +${cap} набор не пускает` : lines.some((l) => l.have < l.n) ? "Не хватает материалов" : null;
  return { cur, cap, lines, nextDmg: Math.round(Number(next.dmg) || 0), nextArmor: Math.round(Number(next.armor) || 0), miss };
}

export function forgeItem(p: Profile, id: string, expect?: number): { up: number } | { err: string } {
  if (!p.hero) return { err: "Сначала выбери героя" };
  if (!getTune().forge.on) return { err: "Кузница закрыта в наборе" };
  const it = findOwned(p, id);
  if (!it) return { err: "Вещи нет у этого героя" };
  const cap = Math.min(UPG.maxLvl | 0, getTune().forge.max | 0);
  const cur = Math.max(0, it.up | 0);
  if (expect != null && (expect | 0) !== cur) return { err: "Уровень вещи уже изменился" };
  if (cur >= cap) return { err: `Дальше +${cap} набор не пускает` };
  const cost = upgCost(cur + 1, it.cursed === 1, UPG, it.ench || 0);
  if (!cost) return { err: "Улучшение недоступно" };
  const miss = Object.entries(cost).filter(([k, n]) => (p.res[k] || 0) < n);
  if (miss.length) return { err: "Не хватает: " + miss.map(([k, n]) => `${matLabel(k)} ${p.res[k] || 0}/${n}`).join(", ") };
  for (const [k, n] of Object.entries(cost)) {
    p.res[k] = (p.res[k] || 0) - n;
    if (p.res[k] <= 0) delete p.res[k];
  }
  it.up = cur + 1;
  seal(p);
  return { up: it.up };
}

const SKILL_ICON: Record<string, string> = {
  harvest: "whirlwind", ash: "fireball", wing: "dash", hell: "meteor",
  pulse: "dew_splash", circle: "p_regen", shine: "starfall", abode: "eclipse",
  wall: "shield_wall", bash: "warden_slam", line: "pierce", mod: "total_silence",
  poison: "w_plague_flask", fan: "w_fly_blades", shade: "shadow_step", ether: "eclipse",
  slow: "frost_nova", break: "trick_strike", loop: "vortex_pull", chronicle: "dead_calm",
  rush: "leap_strike", fangs: "w_daggers", snow: "frost_nova", hunt: "dash",
  rail: "w_sun_beam", train: "spear_rain", whistle: "w_soul_spark", express: "w_chain_bolt",
  glitch: "w_split_shard", loopa: "vortex_pull", over: "meteor", mad: "eclipse",
};
const GLOW_ICON: Record<GlowId, string> = { echo: "whirlwind", vamp: "p_regen", nova: "starfall", swift: "p_swift", extend: "p_area" };

export type SkillRow = {
  name: string;
  key: string;
  icon: string;
  kind: "active" | "passive";
  text: string;
  meta: string;
  level: string;
  lock: string;
  effect: string;
};

function skillBlurb(sk: SkillDef) {
  const form = sk.shape === "arc" ? "Дуга перед героем" : sk.shape === "circle" ? "Круг вокруг героя" : sk.shape === "line" ? "Полоса по взгляду" : "Рывок по взгляду";
  const bits = [form];
  if (sk.heal) bits.push(`лечит своих на ${Math.round(sk.heal * 100)}% здоровья`);
  if (sk.stun) bits.push(`останавливает цель`);
  if (sk.dash) bits.push("уносит героя вперёд");
  bits.push(sk.musou ? "бьёт сильнее обычного удара, когда пыл полон" : "бьёт от силы навыка");
  return bits.join(". ") + ".";
}

export function skillBook(p: Profile) {
  const h = heroById(p.hero);
  const now = sheet(p);
  const step = radianceStep(p);
  const max = getTune().craft.radianceMax | 0;
  const ghost = structuredClone(p);
  ghost.radiance = Math.min(max, step + 1);
  const nxt = step < max ? sheet(ghost) : now;
  const row = HERO_GLOW[h.id] || HERO_GLOW.lorin;
  const cards: SkillRow[] = h.skills.map((sk, i) => {
    const glow = i < 3 ? skillGlow(h.id, i, step) : null;
    const prop = i < 3 ? RADIANCE_PROP[row[i]] : null;
    const need = i === 0 ? 3 : i === 1 ? 6 : i === 2 ? 9 : 0;
    const sec = sk.musou ? 1.2 : sk.cd * (now.cdMul || 1);
    const secNext = sk.musou ? 1.2 : sk.cd * (nxt.cdMul || 1);
    const open = glow && prop ? `${prop.name}: ${prop.note}` : "";
    return {
      name: sk.name,
      key: sk.key,
      icon: SKILL_ICON[sk.id] || "attack",
      kind: "active" as const,
      text: skillBlurb(sk),
      meta: sk.musou ? "пыл, затем 1.2 с" : `${sec.toFixed(1)} с`,
      level: sk.musou ? "пыл" : glow && prop ? `сияние ${step} · ${prop.name}` : need ? `откроется на сиянии ${need}` : "открыт",
      lock: sk.musou ? "Нужна полная шкала пыла" : "",
      effect: [open, step < max && !sk.musou ? `следующий шаг: ${secNext.toFixed(1)} с` : ""].filter(Boolean).join(". "),
    };
  });
  const passives: SkillRow[] = [
    { name: "Сила навыка", key: "", icon: "p_might", kind: "passive", text: "Энергия и сияние поднимают навыки.", meta: "всегда", level: `×${now.skill.toFixed(2)}`, lock: "", effect: step < max ? `следующий шаг ×${nxt.skill.toFixed(2)}` : "дальше набор не пускает" },
    { name: "Перезарядка", key: "", icon: "p_haste", kind: "passive", text: "Сияние и Руна Хроноса короче откат. Порыв тратит оставшиеся секунды быстрее.", meta: "всегда", level: `×${now.cdMul.toFixed(2)}`, lock: "", effect: step < max ? `следующий шаг ×${nxt.cdMul.toFixed(2)}` : "" },
  ];
  for (let i = 0; i < 3; i++) {
    const id = row[i];
    const prop = RADIANCE_PROP[id];
    const need = i === 0 ? 3 : i === 1 ? 6 : 9;
    const open = step >= need;
    passives.push({
      name: prop.name, key: h.skills[i]?.name || "", icon: GLOW_ICON[id], kind: "passive",
      text: `${h.skills[i]?.name || "Навык"}. ${prop.note}`,
      meta: open ? "в бою" : `с сияния ${need}`,
      level: open ? `сияние ${step}` : `закрыто до ${need}`,
      lock: open ? "" : `Откроется на сиянии ${need}`,
      effect: open ? "уже на герое" : "поднять сияние во вкладке",
    });
  }
  for (const rune of RUNES) {
    const on = !!p.equip.weapon?.sockets?.includes(rune.id);
    const icon = rune.id === "r_chrono" ? "p_haste" : rune.id === "r_nova" ? "p_area" : rune.id === "r_vamp" ? "p_regen" : "p_might";
    passives.push({
      name: rune.name, key: "", icon, kind: "passive", text: rune.note, meta: on ? "в оружии" : "гнездо",
      level: on ? "вставлена" : "нет в оружии", lock: on ? "" : "Нужно гнездо на оружии", effect: on ? "уже меняет бой" : "купить и вставить в сумке",
    });
  }
  if (p.oath && p.oath !== "none") {
    const oath = OATHS.find((o) => o.id === p.oath);
    passives.push({ name: oath?.name || "Клятва", key: "", icon: "p_mastery", kind: "passive", text: oath?.note || "", meta: "до боя", level: "клятва", lock: "", effect: "снимается выбором другой клятвы" });
  }
  const cost = (getTune().craft.radianceGold | 0) * (step + 1);
  const can = step < max && p.gold >= cost;
  const preview = step >= max
    ? `Сияние ${step}. Дальше этот набор не пускает.`
    : `Сияние ${step} → ${step + 1}. Сила навыка ${now.skill.toFixed(2)} → ${nxt.skill.toFixed(2)}. Откат ×${now.cdMul.toFixed(2)} → ×${nxt.cdMul.toFixed(2)}. ${p.gold < cost ? "Не хватает золота." : ""}`.trim();
  return { hero: h.id, cards, passives, preview, cost, can, step, max };
}

export function raiseRadiance(p: Profile): { step: number; gold: number } | { err: string } {
  if (!p.hero) return { err: "Сначала выбери героя" };
  const max = getTune().craft.radianceMax | 0;
  const cur = Math.max(0, Math.min(9, p.radiance | 0));
  if (cur >= max) return { err: "Сияние на пределе" };
  const cost = (getTune().craft.radianceGold | 0) * (cur + 1);
  if (p.gold < cost) return { err: "Не хватает золота на сияние" };
  p.gold -= cost;
  p.radiance = cur + 1;
  seal(p);
  return { step: p.radiance, gold: cost };
}

export function buyRune(p: Profile, id: string): { have: number } | { err: string } {
  if (!getTune().craft.sockets) return { err: "Гнёзда закрыты в наборе" };
  if (!RUNE_SET.has(id)) return { err: "Такой руны нет" };
  const have = p.res[id] || 0;
  if (have >= 20) return { err: "Больше этой руны не унести" };
  const cost = getTune().craft.runeGold | 0;
  if (p.gold < cost) return { err: "Не хватает золота на руну" };
  p.gold -= cost;
  p.res[id] = have + 1;
  seal(p);
  return { have: p.res[id] };
}

export function socketRune(p: Profile, itemId: string, rune: string): { sockets: RuneId[] } | { err: string } {
  if (!getTune().craft.sockets) return { err: "Гнёзда закрыты в наборе" };
  if (!RUNE_SET.has(rune)) return { err: "Такой руны нет" };
  const it = findOwned(p, itemId);
  if (!it) return { err: "Вещи нет у этого героя" };
  if (it.slot !== "weapon") return { err: "Руна садится только в оружие" };
  const have = readSockets(it);
  if (have.includes(rune as RuneId)) return { err: "Такая руна уже стоит" };
  if (have.length >= 2) return { err: "Оба гнезда заняты" };
  if ((p.res[rune] || 0) < 1) return { err: "Этой руны нет в запасе" };
  p.res[rune] -= 1;
  if (p.res[rune] <= 0) delete p.res[rune];
  it.sockets = [...have, rune as RuneId];
  seal(p);
  return { sockets: it.sockets };
}

export function unequip(p: Profile, slot: Paper): string | null {
  const it = p.equip[slot];
  if (!it) return "Слот пуст";
  if (bagFree(p) < 1) return "Сумка полна — сначала продай что-нибудь";
  p.equip[slot] = null;
  p.bag.push(it);
  return null;
}

export function takeInbox(p: Profile, mode: "bag" | "sell" | "drop"): { ok?: boolean; gold?: number } | { err: string } {
  const it = p.inbox[0];
  if (!it) return { err: "У входа ничего нет" };
  if (mode === "drop") { p.inbox.shift(); return { ok: true }; }
  if (mode === "sell") {
    p.inbox.shift();
    const gold = salvageValue(it);
    p.gold += gold;
    return { gold };
  }
  if (bagFree(p) < 1) return { err: "Сумка полна" };
  p.inbox.shift();
  p.bag.push(it);
  return { ok: true };
}

export function salvage(p: Profile, itemId: string): { gold: number } | { err: string } {
  const idx = p.bag.findIndex((it) => it.id === itemId);
  if (idx < 0) return { err: "Вещи нет в сумке" };
  const [it] = p.bag.splice(idx, 1);
  const gold = salvageValue(it);
  p.gold += gold;
  return { gold };
}

export type RunReason = "win" | "dead" | "surrender";
export type RunIn = { floor: number; kills: number; generals: number; boss: boolean; elapsedMs: number; party: number; reason?: RunReason; diff?: number; marks?: MarkBook };
export type RunCheck = { kills: number; generals: number; boss: boolean; note: string | null };

export function spawnBudget(floor: number) {
  const need = killNeed(floor);
  return { quest: need, spawns: Math.round(need * 1.15), generals: 3 };
}

export type WaveScript = { floor: number; seed: number; waves: number[]; genAt: number[]; bossAt: number };

export function makeScript(floor: number, seed: number): WaveScript {
  const n = Math.max(1, Math.min(FLOOR_N, floor | 0));
  const b = spawnBudget(n);
  const w1 = Math.round(b.spawns * 0.3);
  const w2 = Math.round(b.spawns * 0.34);
  const w3 = Math.max(0, b.spawns - w1 - w2);
  const pack = FLOORS[n - 1]?.goal === "pack";
  return { floor: n, seed: seed >>> 0, waves: [w1, w2, w3], genAt: [7000, 18000, 30000], bossAt: pack ? 8000 : 36000 };
}

export function mobCredit(script: WaveScript, elapsedMs: number) {
  const gates = [0, script.genAt[0], script.genAt[1]];
  let n = 0;
  for (let i = 0; i < 3; i++) if (elapsedMs >= gates[i]) n += script.waves[i] || 0;
  return Math.min(spawnBudget(script.floor).spawns, n);
}

export function roomOutcome(script: WaveScript, elapsedMs: number, elites: { id: string; alive: boolean; spawned: boolean }[]) {
  const generals = elites.filter((e) => e.id.startsWith("g") && e.spawned && !e.alive).length;
  const art = FLOORS[script.floor - 1];
  const boss = art?.goal === "pack"
    ? elapsedMs >= script.bossAt && mobCredit(script, elapsedMs) > 0
    : elites.some((e) => e.id === "boss" && e.spawned && !e.alive);
  return { kills: mobCredit(script, elapsedMs), generals: Math.min(3, generals), boss };
}

export function boundedSolo(floor: number, elapsedMs: number, kills: number, generals: number, boss: boolean) {
  const script = makeScript(floor, 1);
  const gCap = script.genAt.filter((t) => elapsedMs >= t + 1500).length;
  return {
    kills: Math.max(0, Math.min(kills | 0, mobCredit(script, elapsedMs))),
    generals: Math.max(0, Math.min(generals | 0, gCap)),
    boss: !!boss && elapsedMs >= script.bossAt,
  };
}

export function clampStrike(dmg: number, kind: string) {
  const mul = kind === "heavy" ? 2.4 : kind === "musou" ? 3.4 : kind === "skill" ? 2.1 : 1.25;
  return Math.max(1, Math.round(Math.max(1, dmg) * mul));
}

export function validateRun(r: RunIn): RunCheck {
  const floor = Math.max(1, Math.min(FLOOR_N, r.floor | 0));
  const b = spawnBudget(floor);
  let kills = Math.max(0, Math.min(b.spawns, r.kills | 0));
  let generals = Math.max(0, Math.min(3, r.generals | 0));
  let boss = !!r.boss;
  const elapsed = Math.max(0, r.elapsedMs | 0);
  const pace = Math.max(1, Math.round(fightScale(floor)));
  const min = kills * 45 + generals * 1600 + (boss ? 5000 + pace * 250 : 0);
  let note: string | null = null;
  if (elapsed < min) {
    const allow = Math.floor(elapsed / 90);
    kills = Math.min(kills, allow);
    if (elapsed < 8000) generals = 0;
    boss = false;
    note = "Слишком быстро для такой добычи — засчитана только часть.";
  }
  if (boss && generals < 1) generals = 1;
  return { kills, generals, boss, note };
}

export type LootNote = { item: Item; sold: boolean; gold: number; held?: boolean };
export type RunReport = {
  gold: number; xp: number; levels: number; items: LootNote[];
  quests: string[]; note: string | null; boss: boolean; reason: RunReason;
  /** Повтор уже пройденного данжа: квест не сдаётся снова, опыт и плата этажа урезаны. */
  replay: boolean;
  /** Сложность, записанная в забег. Тело запроса её не подменяет. */
  diff: number;
  diffName: string;
};

export type ChestView = {
  index: number;
  item: Item;
  curse: { stat: number; speed: number };
  tiers: { n: 1 | 2 | 3 | 4 | 5 | 6; name: string; stat: number; speed: number }[];
};

function chestGate(p: Profile, index: number): string | null {
  if (!p.pending) return "Сундук открывается только в забеге";
  const n = chestTotal(p.pending.diff || 1);
  const i = index | 0;
  if (i < 0 || i >= n) return "Такого сундука нет";
  if ((p.pending.chests || 0) & (1 << i)) return "Сундук уже открыт";
  return null;
}

function chestBase(p: Profile, rng: Rng): Item {
  const diff = p.pending?.diff || 1;
  const row = diffRow(diff);
  const q = dropQuality(p.lvl, p.pending?.floor || 1, diff);
  return rollItem(rng, {
    ilvl: q.ilvl, floor: p.pending?.floor || 1, bare: true, budget: q.budget,
    rarity: clearRarity(rng, p.pending?.floor || 1, diff, false),
    extraAffix: row.affix, curseMul: row.curse, enchMul: 0,
    act: row.act, tier: rollDropTier(rng, diff),
  });
}

export function chestChoices(p: Profile, index: number, rng: Rng): ChestView | { err: string } {
  const err = chestGate(p, index);
  if (err) return { err };
  const tune = getTune();
  return {
    index: index | 0,
    item: chestBase(p, rng),
    curse: { stat: tune.curse.statMult, speed: tune.curse.speed },
    tiers: ENCH_NAME.map((name, i) => ({
      n: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      name,
      stat: tune.ench.stat[i],
      speed: tune.ench.speed[i],
    })),
  };
}

export function parseChestPick(raw: unknown): ChestPick | null {
  if (raw === "plain" || raw === "curse") return raw;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  return null;
}

export function claimChest(p: Profile, index: number, rng: Rng, pick: ChestPick = "plain"): LootNote | { err: string } {
  const err = chestGate(p, index);
  if (err) return { err };
  const chosen = parseChestPick(pick);
  if (!chosen) return { err: "Выбери, что забрать из сундука" };
  const it = chestBase(p, rng);
  if (chosen === "curse") curseItem(it);
  else if (chosen !== "plain") enchantItem(it, chosen);
  p.pending!.chests = (p.pending!.chests || 0) | (1 << (index | 0));
  return giveItem(p, it);
}

function giveItem(p: Profile, it: Item): LootNote {
  it.id = mint(p);
  if (bagFree(p) < 1) {
    if (it.rarity === "rare" || it.rarity === "legendary" || it.rarity === "set") {
      p.inbox.push(it);
      if (p.inbox.length > 12) p.inbox.shift();
      return { item: it, sold: false, gold: 0, held: true };
    }
    const gold = salvageValue(it);
    p.gold += gold;
    return { item: it, sold: true, gold };
  }
  p.bag.push(it);
  return { item: it, sold: false, gold: 0 };
}

function markQuest(p: Profile, id: string, add: number): boolean {
  const def = questById(id);
  if (!def || def.kind === "bag") return false;
  const q = p.quests[id] || { p: 0, done: 0 as const, claimed: 0 as const };
  if (q.done || q.claimed) { p.quests[id] = q; return false; }
  q.p = Math.min(def.need, q.p + add);
  let became = false;
  if (q.p >= def.need) { q.done = 1; became = true; }
  p.quests[id] = q;
  return became;
}

export function applyRun(p: Profile, raw: RunIn, rng: Rng): RunReport | { err: string } {
  const floor = Math.max(1, Math.min(FLOOR_N, raw.floor | 0));
  if (!p.hero) return { err: "Нет героя" };
  const asked: RunReason = raw.reason === "surrender" || raw.reason === "dead" || raw.reason === "win" ? raw.reason : (raw.boss ? "win" : "dead");
  const v = validateRun({ ...raw, boss: asked === "win" && raw.boss });
  const cleared = asked === "win" && v.boss;
  const reason: RunReason = cleared ? "win" : asked === "surrender" ? "surrender" : "dead";
  const rowEarly = diffRow(raw.diff || 1);
  const prior = chainAt(p, floor);
  const replay = cleared && prior >= rowEarly.id;
  const quests: string[] = [];
  if (!replay && markQuest(p, `k${floor}`, v.kills)) quests.push(`k${floor}`);
  if (!replay && markQuest(p, `g${floor}`, v.generals)) quests.push(`g${floor}`);
  if (cleared && !replay && markQuest(p, `b${floor}`, 1)) quests.push(`b${floor}`);
  p.kills += v.kills;
  if (cleared) {
    p.clears[floor - 1] = (p.clears[floor - 1] || 0) + 1;
    p.chain[floor - 1] = Math.max(p.chain[floor - 1] || 0, rowEarly.id);
    const forge = getTune().forge;
    const mat = UPG.order[Math.max(0, Math.min(UPG.order.length - 1, floor - 1))];
    if (forge.on && forge.drop > 0 && mat) p.res[mat] = Math.min(9999, (p.res[mat] || 0) + (forge.drop | 0));
  }
  const eco = getTune().economy;
  const row = rowEarly;
  const flat = eco.clearBase + floor * eco.clearPerFloor + eco.bossBase + floor * eco.bossPerFloor;
  const clearPay = cleared ? Math.round(flat * row.gold * (replay ? eco.replayGold : 1)) : 0;
  const hunt = (v.kills * eco.killGold + v.generals * eco.generalGold) * row.gold;
  let gold = Math.round((clearPay + hunt) * (1 + goldFind(p)));
  if ((raw.party | 0) >= 2) gold = Math.round(gold * eco.partyGold);
  const pay = stagePay(p.lvl, floor, row.id, replay);
  const mobXp = v.kills > 0 ? pay.mob : 0;
  const genXp = v.generals > 0 ? pay.general : 0;
  const clearXp = cleared ? pay.total - mobXp - genXp : 0;
  const anchor = markAnchor(row.id);
  const bonusXp = cleared ? markPay(marksOn(floor, raw.marks), anchor, pay.total) : 0;
  const xp = mobXp + genXp + clearXp + bonusXp;
  gold += markGold(bonusXp);
  p.gold += gold;
  const levels = xp > 0 ? addXp(p, xp) : 0;
  const items: LootNote[] = [];
  if (cleared) {
    const bossMark = raw.marks?.boss;
    const dropDiff = bossMark && bossMark.tier > anchor && floorByN(floor).goal !== "pack" ? bossMark.tier + 1 : row.id;
    const q = dropQuality(p.lvl, floor, dropDiff);
    const rarity = clearRarity(rng, floor, dropDiff, replay);
    const tier = rollDropTier(rng, dropDiff);
    items.push(giveItem(p, rollItem(rng, {
      ilvl: q.ilvl, floor, rarity, budget: q.budget, act: row.act, tier,
      extraAffix: q.affix, curseMul: row.curse, enchMul: 0,
    })));
  }
  const partial = v.kills + v.generals > 0
    ? "В золото вошли только уже сбитые твари и генералы."
    : "Сбитых целей нет, золота за этаж нет.";
  const pass = replay
    ? (row.id <= 1
      ? "Повтор. Опыт и золото этажа урезаны, редкая вещь и квест этого данжа больше не выдаются."
      : `Повтор на сложности «${row.name}». Опыт и золото этажа урезаны, квест не сдаётся снова. Редкость дропа остаётся от сложности.`)
    : `Первый проход, сложность «${row.name}».`;
  const note = reason === "win"
    ? `${v.note ? v.note + " " : ""}${pass} Опыт ${xp}: твари ${mobXp}, генералы ${genXp}, зачистка ${clearXp}${bonusXp ? `, зачарованный ${bonusXp}` : ""}.`
    : reason === "surrender"
      ? `Сдача. ${partial} Босс не засчитан. Опыт ${xp}: твари ${mobXp}, генералы ${genXp}.`
      : `Поражение: герой пал. ${partial} Босс не засчитан. Опыт ${xp}: твари ${mobXp}, генералы ${genXp}.`;
  return { gold, xp, levels, items, quests, note, boss: cleared, reason, replay, diff: row.id, diffName: row.name };
}

export type ClaimReport = { gold: number; xp: number; levels: number; item: LootNote | null };

export function claimQuest(p: Profile, id: string, rng: Rng): ClaimReport | { err: string } {
  const def = questById(id);
  if (!def) return { err: "Нет такого квеста" };
  if (def.kind === "bag") {
    if (p.bagSize < def.need) return { err: "Сумка ещё меньше, чем нужно" };
  }
  const q = p.quests[id] || { p: def.kind === "bag" ? p.bagSize : 0, done: 0 as const, claimed: 0 as const };
  if (def.kind === "bag" && p.bagSize >= def.need) q.done = 1;
  if (q.claimed) return { err: "Награда уже взята" };
  if (!q.done) return { err: "Квест ещё не выполнен" };
  q.claimed = 1;
  q.done = 1;
  p.quests[id] = q;
  p.gold += def.gold;
  const xp = def.kind === "bag"
    ? 4
    : Math.max(1, Math.round(stagePay(p.lvl, Math.max(1, def.floor), 1, false).total * (def.kind === "boss" ? 0.35 : def.kind === "generals" ? 0.22 : 0.12)));
  const levels = addXp(p, xp);
  let item: LootNote | null = null;
  if (def.chest) item = giveItem(p, rollItem(rng, { ilvl: Math.max(p.lvl, def.floor + 1), floor: Math.max(1, def.floor), rarity: def.chest }));
  return { gold: def.gold, xp, levels, item };
}

export type QuestView = QuestDef & { p: number; done: boolean; claimed: boolean; ready: boolean };

export function questViews(p: Profile, floor: number): QuestView[] {
  return questDefs().filter((q) => q.floor === floor || (q.floor === 0 && !p.quests[q.id]?.claimed)).map((q) => {
    const st = p.quests[q.id];
    const prog = q.kind === "bag" ? Math.min(q.need, p.bagSize) : (st?.p || 0);
    const done = q.kind === "bag" ? p.bagSize >= q.need || !!st?.done : !!st?.done;
    const claimed = !!st?.claimed;
    return { ...q, p: prog, done, claimed, ready: done && !claimed };
  }).filter((q) => !q.claimed);
}

export function readyQuests(p: Profile): QuestView[] {
  const all: QuestView[] = [];
  for (const q of questDefs()) {
    const st = p.quests[q.id];
    const done = q.kind === "bag" ? p.bagSize >= q.need || !!st?.done : !!st?.done;
    if (done && !st?.claimed) all.push({ ...q, p: q.need, done: true, claimed: false, ready: true });
  }
  return all;
}

export function itemBlurb(it: Item) {
  const bits = [RARITY_NAME[it.rarity], `ур. ${it.req}`];
  if (it.dmg) bits.push(`урон ${it.dmg}`);
  if (it.armor) bits.push(`броня ${it.armor}`);
  return bits.join(" · ");
}

export const PAPER_NAME: Record<Paper, string> = {
  weapon: "Оружие", helm: "Голова", chest: "Доспех", gloves: "Перчатки", boots: "Сапоги", amulet: "Амулет", ring1: "Кольцо", ring2: "Кольцо",
};

export function startNonce() {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return [...rnd].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function progressOf(rawClears: unknown, rawChain: unknown): { clears: number[]; chain: number[] } {
  const clears = Array.from({ length: FLOOR_N }, () => 0);
  const chain = Array.from({ length: FLOOR_N }, () => 0);
  const srcC = Array.isArray(rawClears) ? rawClears : [];
  const srcH = Array.isArray(rawChain) ? rawChain : [];
  if (srcC.length === 13) {
    for (let d = 0; d < 13; d++) {
      if ((srcC[d] | 0) <= 0) continue;
      for (const f of SW_FLOORS) {
        if (f.dungeon !== d + 1) continue;
        clears[f.n - 1] = Math.max(1, srcC[d] | 0);
        const kept = f.stage === f.stagesInDungeon ? (srcH[d] | 0) : 1;
        chain[f.n - 1] = Math.max(1, Math.min(7, kept || 1));
      }
    }
    return { clears, chain };
  }
  for (let i = 0; i < FLOOR_N; i++) {
    clears[i] = Math.max(0, srcC[i] | 0);
    chain[i] = Math.max(0, Math.min(7, Math.max(srcH[i] | 0, clears[i] > 0 ? 1 : 0)));
  }
  return { clears, chain };
}

export function chainAt(src: { chain?: number[]; clears?: number[] }, floor: number) {
  const i = Math.max(0, Math.min(FLOOR_N - 1, (floor | 0) - 1));
  const saved = src.chain?.[i] | 0;
  const fromClear = (src.clears?.[i] || 0) > 0 ? 1 : 0;
  return Math.max(0, Math.min(7, Math.max(saved, fromClear)));
}

export function memberDiffLock(lvl: number, floorPassed: boolean, floor: number, diff: number, chain = 0, prevPassed = true): string | null {
  const n = Math.max(1, Math.min(FLOOR_N, floor | 0));
  const row = diffRow(diff);
  const f = floorByN(n);
  if (!floorPassed && f.stage > 1 && !prevPassed) {
    return `«${f.name}» открывается после предыдущего этапа данжа «${f.dungeonName}».`;
  }
  if (!floorPassed && (lvl | 0) < floorNeed(n)) {
    return `«${f.dungeonName}» открывается с уровня ${floorNeed(n)}. Сейчас ${lvl | 0}. Уровень копится опытом зачистки и квестами, номер пройденного этажа его не заменяет.`;
  }
  const have = chain | 0;
  if (row.id > 1 && have < row.id - 1) {
    const prev = DIFF_NAME[row.id - 2];
    const now = have > 0 ? DIFF_NAME[have - 1] : "ещё ничего";
    return `«${row.name}» открывается прохождением «${prev}» на этом данже. Сейчас пройдено: ${now}. Уровень открывает данж, не цвет чар.`;
  }
  return null;
}
export function diffLock(p: Profile, floor: number, diff: number): string | null {
  return memberDiffLock(p.lvl | 0, floorPassed(p, floor), floor, diff, chainAt(p, floor), floor <= 1 || floorPassed(p, floor - 1));
}
export type RunOffer = {
  id: number; name: string; open: boolean; why: string | null;
  color: string; icon: string; lore: string; act: string; tier: number;
  hp: number; dmg: number; mobHp: number; bossHp: number; bossDmg: number; bossHpParty4: number;
  goldFirst: number; goldReplay: number; xpFirst: number; xpReplay: number;
  rare: number; leg: number; affix: number; curse: number; ench: number; chests: number;
  lower: number; soak: number; regen: number;
  partyGold: number; partyHp: number;
};
export function runOffer(p: Profile, floor: number, diff: number, party = 1): RunOffer {
  const n = Math.max(1, Math.min(FLOOR_N, floor | 0));
  const row = diffRow(diff);
  const why = diffLock(p, n, row.id);
  const eco = getTune().economy;
  const flat = eco.clearBase + n * eco.clearPerFloor + eco.bossBase + n * eco.bossPerFloor;
  const xp = stagePay(p.lvl, n, row.id, false).total;
  const loot = getTune().loot;
  return {
    id: row.id, name: row.name, open: !why, why,
    color: row.color, icon: row.icon, lore: row.lore, act: row.act, tier: row.tier,
    hp: row.hp, dmg: row.dmg,
    mobHp: mobHp(0, n, getTune(), row.id),
    bossHp: eliteHp("boss", n, party, getTune(), row.id),
    bossDmg: Math.round(eliteDmg("boss", n, getTune(), row.id)),
    bossHpParty4: eliteHp("boss", n, 4, getTune(), row.id),
    goldFirst: Math.round(flat * row.gold),
    goldReplay: Math.round(flat * row.gold * eco.replayGold),
    xpFirst: xp,
    xpReplay: stagePay(p.lvl, n, row.id, true).total,
    rare: Math.min(0.75, (n >= 10 ? 0.18 : 0.08) + row.rare),
    leg: row.leg,
    affix: row.affix,
    curse: Math.min(0.75, loot.curseChance * row.curse),
    ench: Math.min(0.75, loot.enchChance * row.ench),
    chests: chestTotal(row.id),
    lower: row.lower,
    soak: row.soak,
    regen: row.regen,
    partyGold: eco.partyGold,
    partyHp: partyHpMult(4),
  };
}

function clearRarity(rng: Rng, floor: number, diff: number, replay: boolean): Rarity {
  const row = diffRow(diff);
  if (replay && row.id <= 1) return rng() < 0.35 ? "magic" : "common";
  const rare = Math.min(0.75, (floor >= 10 ? 0.18 : 0.08) + row.rare);
  const x = rng();
  if (x < row.leg) return "legendary";
  if (x < row.leg + rare) return "rare";
  if (x < row.leg + rare + 0.55) return "magic";
  return "common";
}

function bossStages() {
  return FLOORS.filter((f) => f.goal === "boss");
}

function highestDungeon(p: Profile) {
  let d = 1;
  for (const f of FLOORS) if (f.stage === 1 && p.lvl >= floorNeed(f.n)) d = f.dungeon;
  return d;
}

function anchorFloor(p: Profile) {
  const d = highestDungeon(p);
  const rows = FLOORS.filter((f) => f.dungeon === d);
  return (rows.find((f) => f.goal === "boss") || rows[rows.length - 1]).n;
}

export function modeFloor(p: Profile, id: ModeId): FloorDef {
  const spec = modeSpec(id)!;
  const base = floorByN(anchorFloor(p));
  const blank: Play = { kind: id };
  if (id === "arena") {
    return { ...base, sw: "mode_arena", name: "Арена Испытаний", place: "Арена", dungeonName: "Арена Испытаний", desc: spec.orda, stages: ["Волна", "Подкрепление", "Круг"], goal: "pack", boss: "Волна арены", bossTitle: "Выстоять 30 секунд", general: "Подкрепление", spawnGeneral: 0, tint: "#1e293b", ember: "#38bdf8", play: { ...blank, winSec: 30, step: 0 } };
  }
  if (id === "duel") {
    return { ...floorByN(1), sw: "mode_duel", name: "Дуэль 1 на 1", place: "Дуэль", dungeonName: "Дуэль 1 на 1", desc: spec.orda, stages: ["Круг", "Круг", "Двойник"], goal: "boss", boss: "Теневой Двойник", bossTitle: "Зеркало героя", general: "Теневой Двойник", spawnGeneral: 0, tint: "#2a2418", ember: "#e7c98a", play: { ...blank, soloBoss: true, mirror: true, step: 0 } };
  }
  if (id === "horde") {
    return { ...base, sw: "mode_horde", name: "Орда Бездны", place: "Орда", dungeonName: "Орда Бездны", desc: spec.orda, stages: ["Волна", "Подкрепление", "Волна"], goal: "pack", boss: "Волна орды", bossTitle: "Выстоять 60 секунд", general: "Подкрепление", spawnGeneral: 0, tint: "#3a1014", ember: "#e24b3b", play: { ...blank, winSec: 60, step: 0 } };
  }
  if (id === "abyss") {
    const fl = Math.max(1, p.book.abyss | 0);
    const boss = fl % 5 === 0;
    const anchor = floorByN(Math.min(FLOOR_N, 1 + Math.floor(fl / 2)));
    return { ...anchor, sw: "mode_abyss", name: boss ? `Повелитель Бездны` : `Фрактальный Страж`, place: `Этаж ${fl}`, dungeonName: "Фрактальная Бездна", desc: spec.orda, stages: [`Этаж ${fl}`, `Этаж ${fl}`, `Этаж ${fl}`], goal: boss ? "boss" : "pack", boss: boss ? `Повелитель Бездны, этаж ${fl}` : `Фрактальный Страж ${fl}`, bossTitle: boss ? "Каждый пятый этаж" : "Страж этажа", general: "Страж", spawnGeneral: 0, tint: "#102028", ember: "#22d3ee", play: { ...blank, soloBoss: boss, foeHp: Math.min(8, Math.pow(1.15, fl - 1)), step: fl } };
  }
  if (id === "bossrush") {
    const bosses = bossStages();
    const src = bosses[(p.book.rush | 0) % bosses.length];
    return { ...src, desc: spec.orda, play: { ...blank, soloBoss: true, step: p.book.rush | 0 } };
  }
  if (id === "purgatory") {
    const src = floorByN(anchorFloor(p));
    return { ...src, desc: spec.orda, play: { ...blank, soloBoss: true, playerDmg: 0.7, armor: 0.3, loot: 3, step: 0 } };
  }
  const src = FLOORS.find((f) => f.sw === "dungeon_5" && f.goal === "boss") || floorByN(1);
  return { ...src, sw: "mode_demiurge", name: "Рейд: Демиург", place: "Рейд", dungeonName: "Рейд: Демиург", desc: spec.orda, boss: "Демиург", bossTitle: "45 секунд, потом ярость", general: "Демиург", goal: "boss", spawnGeneral: 0, tint: "#0c1a24", ember: "#38bdf8", play: { ...blank, soloBoss: true, enrageSec: 45, foeHp: 8, step: 0 } };
}

export function modeLock(p: Profile, id: ModeId): string | null {
  const spec = modeSpec(id);
  if (!spec) return "Нет такого режима";
  const need = getTune().modes[id] | 0;
  if (p.lvl < need) return `«${spec.name}» открывается с уровня ${need}. Сейчас ${p.lvl}.`;
  return null;
}

export function beginMode(p: Profile, rawId: string, now: number, nonce = startNonce()): { nonce: string } | { err: string } {
  const spec = modeSpec(rawId);
  if (!spec) return { err: "Нет такого режима" };
  const id = spec.id;
  if (!p.hero) return { err: "Сначала выбери героя" };
  const lock = modeLock(p, id);
  if (lock) return { err: lock };
  const tune = getTune();
  const oath: OathId = tune.oath.on ? p.oath : "none";
  if (oath === "cup") {
    const stake = tune.oath.stake | 0;
    if (p.gold < stake) return { err: "На кубок не хватает золота" };
    p.gold -= stake;
  }
  const floor = modeFloor(p, id);
  const step = floor.play?.step || 0;
  const seed = markSeed(nonce, floor.n, 1);
  p.pending = { floor: floor.n, at: now, nonce, chests: 0, diff: 1, hero: p.hero, mode: id, seed, step, marks: rollBook(seed, 1, id, step), ...(oath !== "none" ? { oath } : {}) };
  return { nonce, seed };
}

export function applyMode(p: Profile, raw: { id: ModeId; elapsedMs: number; kills: number; boss: boolean; reason?: RunReason; marks?: MarkBook; step?: number }, rng: Rng): RunReport | { err: string } {
  const spec = modeSpec(raw.id);
  if (!spec || !p.hero) return { err: "Нет такого режима" };
  const asked: RunReason = raw.reason === "surrender" || raw.reason === "dead" || raw.reason === "win" ? raw.reason : (raw.boss ? "win" : "dead");
  let cleared = asked === "win" && !!raw.boss && raw.elapsedMs >= spec.minMs;
  let note: string | null = null;
  if (asked === "win" && raw.elapsedMs < spec.minMs) {
    cleared = false;
    note = "Слишком быстро для этого режима — победа не засчитана.";
  }
  if (raw.id === "demiurge" && raw.elapsedMs >= 45_000) {
    cleared = false;
    note = "Ярость Демиурга: 45 секунд вышли.";
  }
  const floor = modeFloor(p, raw.id);
  const kills = Math.max(0, Math.min(80, raw.kills | 0));
  p.kills += kills;
  const eco = getTune().economy;
  const hunt = kills * eco.killGold;
  const clearPay = cleared ? 24 + p.lvl * 4 : 0;
  const slice = stagePay(p.lvl, floor.n, 1, false);
  const anchor = markAnchor(1, raw.id, raw.step || 0);
  const live = marksOn(floor.n, raw.marks, raw.id);
  const bonusXp = cleared ? markPay(live, anchor, slice.total) : 0;
  let gold = Math.round((clearPay + hunt) * (1 + goldFind(p))) + markGold(bonusXp);
  p.gold += gold;
  const xp = cleared ? slice.total + bonusXp : 0;
  const levels = xp > 0 ? addXp(p, xp) : 0;
  const items: LootNote[] = [];
  const lootN = cleared ? (floor.play?.loot || 1) + (raw.id === "abyss" && p.book.abyss % 5 === 0 ? 1 : 0) : 0;
  const marked = live[0];
  const dropDiff = marked && marked.tier > anchor ? marked.tier + 1 : 1;
  for (let i = 0; i < lootN; i++) {
    const tier = rollDropTier(rng, dropDiff);
    const it = rollItem(rng, { ilvl: Math.max(1, p.lvl), floor: floor.n, bare: true, budget: 1, rarity: i === 0 && cleared ? "magic" : "common", extraAffix: 0, curseMul: 1, enchMul: 0, act: "none", tier });
    items.push(giveItem(p, it));
  }
  if (cleared) {
    const ix = modeIndex(raw.id);
    if (ix >= 0) p.book.wins[ix] = (p.book.wins[ix] || 0) + 1;
    if (raw.id === "abyss") {
      p.book.best = Math.max(p.book.best, p.book.abyss);
      p.book.abyss = Math.min(999, p.book.abyss + 1);
    }
    if (raw.id === "bossrush") p.book.rush = (p.book.rush + 1) % Math.max(1, bossStages().length);
  }
  return {
    gold, xp, levels, items, quests: [], note, boss: cleared, reason: cleared ? "win" : asked === "surrender" ? "surrender" : "dead",
    replay: false, diff: 1, diffName: spec.name,
  };
}

export function beginRun(p: Profile, floor: number, now: number, nonce = startNonce(), carry = false, diff = 1): { nonce: string } | { err: string } {
  void carry;
  if (!p.hero) return { err: "Сначала выбери героя" };
  if (floor < 1 || floor > FLOOR_N) return { err: "Нет такого этапа" };
  const row = diffRow(diff);
  const lock = diffLock(p, floor, row.id);
  if (lock) return { err: lock };
  const tune = getTune();
  const oath: OathId = tune.oath.on ? p.oath : "none";
  if (oath === "cup") {
    const stake = tune.oath.stake | 0;
    if (p.gold < stake) return { err: "На кубок не хватает золота" };
    p.gold -= stake;
  }
  const seed = markSeed(nonce, floor, row.id);
  p.pending = { floor, at: now, nonce, chests: 0, diff: row.id, hero: p.hero || undefined, seed, marks: rollBook(seed, row.id), ...(oath !== "none" ? { oath } : {}) };
  return { nonce, seed };
}

export function finishRun(p: Profile, body: { nonce?: string; kills?: number; generals?: number; boss?: boolean; party?: number; reason?: RunReason }, now: number, rng: Rng, trusted?: { kills: number; generals: number; boss: boolean }): RunReport | { err: string } {
  const pend = p.pending;
  if (!pend) return { err: "Забег не начат" };
  if (!body.nonce || body.nonce !== pend.nonce) return { err: "Чужой забег" };
  if (pend.hero && pend.hero !== p.hero) { seal(p); mount(p, pend.hero); }
  const elapsed = Math.max(0, now - (pend.at || now));
  const vow = pend.oath;
  const mode = pend.mode;
  p.pending = null;
  if (mode) {
    const report = applyMode(p, { id: mode, elapsedMs: elapsed, kills: body.kills || 0, boss: !!body.boss, reason: body.reason, marks: pend.marks, step: pend.step }, rng);
    if ("err" in report) return report;
    if (vow === "pawn") {
      const extra = Math.round(report.gold * 0.2);
      p.gold += extra;
      report.gold += extra;
    }
    if (vow === "cup" && report.boss) {
      const back = (getTune().oath.stake | 0) * 2;
      p.gold += back;
      report.gold += back;
    }
    seal(p);
    return report;
  }
  const counted = trusted || boundedSolo(pend.floor, elapsed, body.kills || 0, body.generals || 0, !!body.boss);
  const reason: RunReason = body.reason === "surrender" || body.reason === "dead" || body.reason === "win" ? body.reason : (counted.boss ? "win" : "dead");
  const report = applyRun(p, {
    floor: pend.floor,
    kills: counted.kills,
    generals: counted.generals,
    boss: reason === "win" && counted.boss,
    elapsedMs: elapsed,
    party: body.party || 1,
    reason,
    diff: pend.diff | 0 || 1,
    marks: pend.marks,
  }, rng);
  if ("err" in report) return report;
  if (vow === "pawn") {
    const extra = Math.round(report.gold * 0.2);
    p.gold += extra;
    report.gold += extra;
  }
  if (vow === "cup" && report.boss) {
    const back = (getTune().oath.stake | 0) * 2;
    p.gold += back;
    report.gold += back;
  }
  seal(p);
  return report;
}
