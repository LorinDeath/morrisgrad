// «Орда Обители» — правила хаба. Прокачка, лут и сумка живут здесь, не в бою.
// Тот же модуль считает награды на сервере (D1) и рисует их в клиенте.
// Числа экономики и лута — в tune.ts. Меняет их только проверенный набор админки.
import { chestTotal, diffRow, eliteDmg, eliteHp, getTune, mobHp, partyHpMult } from "./tune";

export const BAG_START = 12;
export const BAG_STEP = 4;
export const BAG_MAX = 48;
export const BAG_PRICES = [80, 700, 1400, 2500, 4200, 7000, 11000, 17000, 26000];
export const MAX_LVL = 60;
export const START_GOLD = 150;

export type Stat = "str" | "dex" | "vit" | "ene";
export type Slot = "weapon" | "helm" | "chest" | "gloves" | "boots" | "amulet" | "ring";
export type Paper = "weapon" | "helm" | "chest" | "gloves" | "boots" | "amulet" | "ring1" | "ring2";
export type Rarity = "common" | "magic" | "rare" | "legendary" | "set";
export type AffStat = Stat | "dmg" | "hp" | "armor" | "crit" | "aspd" | "ls" | "skill";
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
};

export const ENCH_NAME = ["Необычный", "Редкий", "Странный", "Легендарный", "Божественный", "Чёрный"] as const;
export type ChestPick = "plain" | "curse" | 1 | 2 | 3 | 4 | 5 | 6;
export const OATHS = [
  { id: "none", name: "Без клятвы", note: "Этаж как есть" },
  { id: "pawn", name: "Пешка", note: "Золото этажа ×1.2, шаг ×0.9" },
  { id: "knight", name: "Конь", note: "Шаг ×1.12, здоровье ×0.88" },
  { id: "rook", name: "Ладья", note: "+12 брони, шаг ×0.86" },
  { id: "harvest", name: "Руна жатвы", note: "Вампиризм +6%, урон ×0.92" },
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
  desc: string;
  /** Три яруса волны. У башен — имена generateTowerStages, у коротких данжей — имена stages. */
  stages: [string, string, string];
  tint: string;
  ember: string;
  mob: string;
  general: string;
  boss: string;
  bossTitle: string;
  /** Приём генерала и босса из данжа Тёмного мира. */
  gSig: Sig;
  bSig: Sig;
  /** Ряды bestiary_atlas: генерал, босс, три поведения толпы. */
  gRow: number;
  bRow: number;
  mobRows: [number, number, number];
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

export const FLOORS: FloorDef[] = [
  { n: 1, sw: "dungeon_intro_1", name: "Подвалы Старого Замка", place: "Альказак", desc: "Тренировочные подвалы замка.", stages: ["Сектор Мишеней", "Оружейный зал", "Трон хранителя"], tint: "#4a3034", ember: "#ff8a50", mob: "Манекен", general: "Манекен I", boss: "Теневой Страж", bossTitle: "призрачный хранитель замка", gSig: "circle", bSig: "cone", gRow: 35, bRow: 41, mobRows: [6, 2, 18] },
  { n: 2, sw: "dungeon_intro_2", name: "Заброшенный Тракт Альказака", place: "Альказак", desc: "Дикие тракты мародёров.", stages: ["Дикий тракт", "Обоз мародёров", "Лагерь Атамана"], tint: "#4a3828", ember: "#ffb060", mob: "Мародёр", general: "Головорез тракта", boss: "Атаман Мародёров", bossTitle: "главарь банды", gSig: "cone", bSig: "line", gRow: 34, bRow: 54, mobRows: [26, 4, 32] },
  { n: 3, sw: "dungeon_intro_3", name: "Чёрные Чумные Топи", place: "Топи", desc: "Заболоченная низина.", stages: ["Гнилая кромка", "Трясина", "Гнилая Топь"], tint: "#1c3428", ember: "#7dff9a", mob: "Болотная слизь", general: "Чумной сгусток", boss: "Болотный Ужас", bossTitle: "ядовитый монстр топей", gSig: "line", bSig: "circle", gRow: 30, bRow: 11, mobRows: [0, 27, 29] },
  { n: 4, sw: "dungeon_1", name: "Катакомбы Скорби", place: "Порт", desc: "Заброшенные склепы.", stages: ["Склеп", "Галерея праха", "Трон Праха"], tint: "#322838", ember: "#c9b6ff", mob: "Могильная тварь", general: "Могильный Упырь", boss: "Чёрный Жнец", bossTitle: "повелитель склепов", gSig: "curse", bSig: "summon", gRow: 28, bRow: 48, mobRows: [28, 25, 31] },
  { n: 5, sw: "dungeon_storm_tower", name: "Башня Бесконечного Шторма", place: "ДаргСирром", desc: "Шпиль бури, двенадцать ярусов башни.", stages: ["Ярус 1: Шторм", "Орда (Этаж 4)", "Чертог Владыки"], tint: "#243044", ember: "#d0e6ff", mob: "Грозовой Дух", general: "Громовержец", boss: "Райдзин", bossTitle: "повелитель бурь", gSig: "line", bSig: "cone", gRow: 39, bRow: 42, mobRows: [46, 3, 38] },
  { n: 6, sw: "dungeon_soul_labyrinth", name: "Лабиринт Забытых Душ", place: "Эзернис", desc: "Призрачные орды лабиринта.", stages: ["Ярус 1: Лабиринт", "Орда (Этаж 4)", "Чертог Владыки"], tint: "#241430", ember: "#e7b6ff", mob: "Блуждающий Призрак", general: "Пожиратель Сущностей", boss: "Танатос", bossTitle: "владыка забвения", gSig: "curse", bSig: "circle", gRow: 51, bRow: 57, mobRows: [1, 44, 22] },
  { n: 7, sw: "dungeon_chaos_inferno", name: "Пекло Первородного Хаоса", place: "Пламя", desc: "Лавовые демоны инферно.", stages: ["Ярус 1: Инферно", "Орда (Этаж 8)", "Чертог Владыки"], tint: "#3a1814", ember: "#ff4a32", mob: "Лавовый Скорпион", general: "Магма-Голем", boss: "Суртур", bossTitle: "владыка хаоса", gSig: "circle", bSig: "summon", gRow: 42, bRow: 58, mobRows: [46, 30, 49] },
  { n: 8, sw: "dungeon_abyss", name: "Затонувший Храм Бездны", place: "Порт", desc: "Глубинные ужасы святилища.", stages: ["Подход к святилищу", "Глубинная галерея", "Святилище Левиафана"], tint: "#142433", ember: "#7ec8ff", mob: "Бездонная тварь", general: "Бездонный Страж", boss: "Левиафан", bossTitle: "хозяин бездны", gSig: "summon", bSig: "cone", gRow: 63, bRow: 49, mobRows: [0, 53, 21] },
  { n: 9, sw: "dungeon_5", name: "Разрыв Антиматрицы", place: "Петля Сэйлора", desc: "Цифровой сбой решётки.", stages: ["Сбой решётки", "Фрактальный коридор", "Фрактальный Трон"], tint: "#341428", ember: "#ff3d8a", mob: "Цифровой фантом", general: "Коррумпированное Ядро", boss: "Творец Искажения", bossTitle: "первородный баг", gSig: "line", bSig: "curse", gRow: 5, bRow: 65, mobRows: [5, 41, 66] },
  { n: 10, sw: "dungeon_void_rift", name: "Разлом Вечной Тьмы", place: "Пути Айтрейна", desc: "Существа антиматерии, десять ярусов тьмы.", stages: ["Ярус 1: Тьма", "Орда (Этаж 4)", "Чертог Владыки"], tint: "#1c1830", ember: "#c8c0ff", mob: "Абсолютный Фантом", general: "Страж Нулевой Точки", boss: "Азатот", bossTitle: "ходок бездны", gSig: "curse", bSig: "summon", gRow: 52, bRow: 37, mobRows: [66, 51, 40] },
  { n: 11, sw: "dungeon_blood_citadel", name: "Кровавая Цитадель Кармиллы", place: "Альказак", desc: "Вампирские лорды цитадели.", stages: ["Ярус 1: Кровь", "Орда (Этаж 4)", "Чертог Владыки"], tint: "#3a1420", ember: "#ff6080", mob: "Кровавый Рыцарь", general: "Жрец Крови", boss: "Кармилла", bossTitle: "королева цитадели", gSig: "cone", bSig: "curse", gRow: 45, bRow: 59, mobRows: [20, 16, 34] },
  { n: 12, sw: "dungeon_spectral_cathedral", name: "Спектральный Собор", place: "Обитель", desc: "Святилище иллюзий.", stages: ["Ярус 1: Спектр", "Орда (Этаж 8)", "Чертог Владыки"], tint: "#281428", ember: "#f0e6ff", mob: "Инквизитор", general: "Каратель", boss: "Призрачный Понтифик", bossTitle: "призрачный понтифик собора", gSig: "cone", bSig: "line", gRow: 36, bRow: 56, mobRows: [22, 7, 14] },
  { n: 13, sw: "dungeon_titan_cradle", name: "Колыбель Забытых Титанов", place: "Купол", desc: "Древнейшие колоссы.", stages: ["Ярус 1: Титаны", "Орда (Этаж 8)", "Чертог Владыки"], tint: "#3a301c", ember: "#ffd76a", mob: "Осколок титана", general: "Каменный Страж", boss: "Титан Атлас", bossTitle: "титанический колосс", gSig: "circle", bSig: "summon", gRow: 32, bRow: 67, mobRows: [10, 19, 18] },
];

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
  { stat: "crit", name: "крита", min: 1, max: 4 },
  { stat: "aspd", name: "скорости атаки", min: 2, max: 7 },
  { stat: "ls", name: "вампиризма", min: 1, max: 3 },
  { stat: "skill", name: "урона навыков", min: 2, max: 8 },
];

const PREFIX = ["Злобный", "Тихий", "Рваный", "Ночной", "Пыльный", "Кровавый", "Старый", "Ясный"];
const SUFFIX = ["порога", "купола", "эфира", "стражи", "пепла", "луны", "рельса", "сбоя"];

export type QuestKind = "kills" | "generals" | "boss" | "bag";
export type QuestDef = {
  id: string; floor: number; kind: QuestKind; need: number;
  name: string; desc: string; gold: number; xp: number; chest: Rarity | null;
};

export function killNeed(floor: number) { return 80 + floor * 20; }

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
      desc: `Одолеть босса «${f.boss}», ${f.bossTitle}.`,
      gold: 180 + f.n * 50, xp: 90 + f.n * 28, chest: f.n >= 7 ? "rare" : "magic",
    });
  }
  return out;
}

const QUEST_BY = new Map(questDefs().map((q) => [q.id, q]));
export function questById(id: string) { return QUEST_BY.get(id) || null; }

export type QuestState = { p: number; done: 0 | 1; claimed: 0 | 1 };
export type Equip = Record<Paper, Item | null>;
export type Pending = { floor: number; at: number; nonce: string; chests?: number; oath?: OathId; diff: number };

export type Profile = {
  v: 1;
  hero: HeroId | null;
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
  kills: number;
  pending: Pending | null;
  /** Клятва на следующий забег. В бою действует копия внутри pending. */
  oath: OathId;
};

export type Sheet = {
  hero: HeroId;
  name: string;
  hp: number;
  dmg: number;
  armor: number;
  aspd: number;
  crit: number;
  speed: number;
  skill: number;
  ls: number;
  heal: number;
  gold: number;
  accent: string;
};

export function heroById(id: string | null | undefined): HeroDef {
  return HEROES.find((h) => h.id === id) || HEROES[0];
}
export function floorByN(n: number) { return FLOORS[Math.max(0, Math.min(12, (n | 0) - 1))]; }

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
    clears: Array.from({ length: 13 }, () => 0),
    kills: 0, pending: null, oath: "none",
  };
}

export function xpNeed(lvl: number) {
  const x = getTune().xp;
  return Math.round(x.base * Math.pow(Math.max(1, lvl), x.pow));
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
  if ((n | 0) < 1 || (n | 0) > 13) return "Нет такого данжа";
  if (floorPassed(p, n)) return null;
  const need = floorNeed(n);
  if ((p.lvl | 0) >= need) return null;
  const f = FLOORS[(n | 0) - 1];
  return `«${f.name}» открывается с уровня ${need}. Сейчас ${p.lvl}. Уровень копится опытом зачистки и квестами, номер пройденного этажа его не заменяет.`;
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
  return next;
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
  p.clears = Array.from({ length: 13 }, (_, i) => Math.max(0, raw.clears?.[i] | 0));
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
    const diff = Math.max(1, Math.min(4, raw.pending.diff | 0 || 1));
    p.pending = { floor: raw.pending.floor | 0, at: raw.pending.at | 0, nonce: String(raw.pending.nonce).slice(0, 40), chests: raw.pending.chests | 0, diff, ...(oath !== "none" ? { oath } : {}) };
  }
  p.oath = oathOf(raw.oath);
  return p;
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
  if (p.hero && bestFloor(p) > 0) return "Герой закреплён после первой зачистки";
  p.hero = id;
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
  let dmg = 0, armor = 0, hp = 0, aspd = 0, crit = 0, ls = 0, skill = 0;
  let speedMul = 1;
  const tune = getTune();
  for (const it of equipped(p)) {
    if (p.lvl < it.req) continue;
    const mult = (it.cursed === 1 ? tune.curse.statMult : 1) * (it.ench ? tune.ench.stat[it.ench - 1] || 1 : 1);
    if (it.cursed === 1) speedMul *= tune.curse.speed;
    if (it.ench) speedMul *= tune.ench.speed[it.ench - 1] || 1;
    dmg += it.dmg * mult;
    armor += it.armor * mult;
    for (const a of it.affixes) {
      const val = a.val * mult;
      if (a.stat === "str") str += val;
      else if (a.stat === "dex") dex += val;
      else if (a.stat === "vit") vit += val;
      else if (a.stat === "ene") ene += val;
      else if (a.stat === "dmg") dmg += val;
      else if (a.stat === "hp") hp += val;
      else if (a.stat === "armor") armor += val;
      else if (a.stat === "crit") crit += val / 100;
      else if (a.stat === "aspd") aspd += val / 100;
      else if (a.stat === "ls") ls += val / 100;
      else if (a.stat === "skill") skill += val / 100;
    }
  }
  const set = setBonus(p);
  let hpOut = Math.round(90 + vit * 14 + hp);
  let dmgOut = Math.round((8 + str * 1.15 + dmg) * (1 + set.dmg));
  let armorOut = Math.round(armor + set.armor);
  let aspdOut = Math.min(2.2, 1 + dex * 0.0065 + aspd + set.aspd);
  let lsOut = Math.min(0.25, ls);
  let goldOut = goldFind(p);
  const vow = p.pending?.oath;
  if (vow === "pawn") { goldOut *= 1.2; speedMul *= 0.9; }
  else if (vow === "knight") { speedMul *= 1.12; hpOut = Math.round(hpOut * 0.88); }
  else if (vow === "rook") { armorOut += 12; speedMul *= 0.86; }
  else if (vow === "harvest") { lsOut = Math.min(0.25, lsOut + 0.06); dmgOut = Math.round(dmgOut * 0.92); }
  else if (vow === "haste") { aspdOut = Math.min(2.2, aspdOut * 1.12); hpOut = Math.round(hpOut * 0.9); }
  return {
    hero: h.id,
    name: h.name,
    hp: hpOut,
    dmg: dmgOut,
    armor: armorOut,
    aspd: aspdOut,
    crit: Math.min(0.6, 0.04 + dex * 0.0025 + crit),
    speed: Math.round((214 + dex * 0.4) * Math.max(0.45, speedMul)),
    skill: 1 + ene * 0.012 + skill,
    ls: lsOut,
    heal: 1 + set.heal,
    gold: goldOut,
    accent: h.accent,
  };
}

function affixLine(a: { stat: AffStat; val: number; name: string }) {
  if (a.stat === "crit" || a.stat === "aspd" || a.stat === "ls" || a.stat === "skill") return `+${a.val}% ${a.name}`;
  return `+${a.val} ${a.name}`;
}

function rollAffix(rng: Rng, ilvl: number, used: Set<string>): Affix {
  const pool = AFFIX_POOL.filter((a) => !used.has(a.stat));
  const src = pool.length ? pool : AFFIX_POOL;
  const a = src[Math.floor(rng() * src.length)];
  used.add(a.stat);
  const t = Math.min(1, ilvl / 30);
  const val = a.min + Math.floor(rng() * (a.max - a.min + 1) + t * (a.max - a.min) * 0.45);
  const clamped = Math.min(a.max + Math.floor(ilvl / 8), val);
  return { stat: a.stat, val: clamped, name: a.name.replace(/^/, "") && affixLine({ stat: a.stat, val: clamped, name: a.name }).replace(/^\+\d+%?\s/, "") ? a.name : a.name };
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

export function itemPrice(it: Item) {
  const mult = { common: 1, magic: 3.1, rare: 8, legendary: 22, set: 16 }[it.rarity];
  return Math.max(20, Math.round((36 + it.ilvl * 11 + it.dmg * 3 + it.armor * 4) * mult));
}
export function salvageValue(it: Item) { return Math.max(1, Math.round(itemPrice(it) * 0.4)); }

export function rollItem(rng: Rng, o: { ilvl: number; floor: number; shop?: boolean; rarity?: Rarity; id?: string; bare?: boolean; extraAffix?: number; curseMul?: number; enchMul?: number }): Item {
  const ilvl = Math.max(1, Math.min(60, Math.round(o.ilvl)));
  const rarity = o.rarity || rarityRoll(rng, o.floor, !!o.shop);
  const slots = Object.keys(BASES) as Slot[];
  if (rarity === "legendary" && rng() < 0.75) {
    const u = UNIQUES[Math.floor(rng() * UNIQUES.length)];
    return markItem({
      id: o.id || "x", base: u.id, name: u.name, slot: u.slot, rarity, ilvl, req: Math.max(1, ilvl - 2),
      dmg: scaleBase(u.dmg, ilvl), armor: scaleBase(u.armor, ilvl), unique: u.id,
      affixes: u.affixes.map((a) => ({ ...a })),
    }, rng, !!o.shop, !!o.bare);
  }
  if (rarity === "set") {
    const set = SETS[Math.floor(rng() * SETS.length)];
    const piece = rng() < 0.5 ? set.a : set.b;
    const base = BASES[piece.slot][0];
    return markItem({
      id: o.id || "x", base: base.id, name: piece.name, slot: piece.slot, rarity, ilvl,
      req: Math.max(1, ilvl - 2), dmg: scaleBase(base.dmg + 3, ilvl), armor: scaleBase(base.armor + 2, ilvl),
      set: set.id, affixes: fillAffixes(rng, ilvl, 2),
    }, rng, !!o.shop, !!o.bare);
  }
  const slot = slots[Math.floor(rng() * slots.length)];
  const base = BASES[slot][Math.floor(rng() * BASES[slot].length)];
  const extra = Math.max(0, Math.min(3, o.extraAffix | 0));
  const nAff = (rarity === "common" ? 0 : rarity === "magic" ? 1 + (rng() < 0.45 ? 1 : 0) : rarity === "rare" ? 3 + (rng() < 0.4 ? 1 : 0) : 4) + (rarity === "common" ? 0 : extra);
  const affixes = fillAffixes(rng, ilvl, nAff);
  let name = base.name;
  if (rarity === "magic" && affixes[0]) name = `${base.name} ${affixes[0].name}`;
  if (rarity === "rare" || rarity === "legendary") {
    name = `${PREFIX[Math.floor(rng() * PREFIX.length)]} ${base.name.toLowerCase()} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`;
  }
  return markItem({
    id: o.id || "x", base: base.id, name, slot, rarity, ilvl, req: Math.max(1, ilvl - 3),
    dmg: scaleBase(base.dmg, ilvl), armor: scaleBase(base.armor, ilvl), affixes,
  }, rng, !!o.shop, !!o.bare, o.curseMul, o.enchMul);
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

function fillAffixes(rng: Rng, ilvl: number, n: number): Affix[] {
  const used = new Set<string>();
  const out: Affix[] = [];
  for (let i = 0; i < n; i++) {
    const a = rollAffix(rng, ilvl, used);
    a.name = affixLine(a).replace(/^\+\d+%?\s/, "");
    out.push(a);
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
  if (p.lvl < it.req) return `Нужен ${it.req} уровень`;
  const slot = paperFor(it, p.equip);
  if (!slot) return "Некуда надеть";
  const prev = p.equip[slot];
  p.equip[slot] = it;
  p.bag.splice(idx, 1);
  if (prev) p.bag.push(prev);
  return null;
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
export type RunIn = { floor: number; kills: number; generals: number; boss: boolean; elapsedMs: number; party: number; reason?: RunReason; diff?: number };
export type RunCheck = { kills: number; generals: number; boss: boolean; note: string | null };

export function spawnBudget(floor: number) {
  const need = killNeed(floor);
  return { quest: need, spawns: Math.round(need * 1.15), generals: 3 };
}

export type WaveScript = { floor: number; seed: number; waves: number[]; genAt: number[]; bossAt: number };

export function makeScript(floor: number, seed: number): WaveScript {
  const b = spawnBudget(Math.max(1, Math.min(13, floor | 0)));
  const w1 = Math.round(b.spawns * 0.3);
  const w2 = Math.round(b.spawns * 0.34);
  const w3 = Math.max(0, b.spawns - w1 - w2);
  return { floor: Math.max(1, Math.min(13, floor | 0)), seed: seed >>> 0, waves: [w1, w2, w3], genAt: [7000, 18000, 30000], bossAt: 36000 };
}

export function mobCredit(script: WaveScript, elapsedMs: number) {
  const gates = [0, script.genAt[0], script.genAt[1]];
  let n = 0;
  for (let i = 0; i < 3; i++) if (elapsedMs >= gates[i]) n += script.waves[i] || 0;
  return Math.min(spawnBudget(script.floor).spawns, n);
}

export function roomOutcome(script: WaveScript, elapsedMs: number, elites: { id: string; alive: boolean; spawned: boolean }[]) {
  const generals = elites.filter((e) => e.id.startsWith("g") && e.spawned && !e.alive).length;
  const boss = elites.some((e) => e.id === "boss" && e.spawned && !e.alive);
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
  const floor = Math.max(1, Math.min(13, r.floor | 0));
  const b = spawnBudget(floor);
  let kills = Math.max(0, Math.min(b.spawns, r.kills | 0));
  let generals = Math.max(0, Math.min(3, r.generals | 0));
  let boss = !!r.boss;
  const elapsed = Math.max(0, r.elapsedMs | 0);
  const min = kills * 45 + generals * 1600 + (boss ? 5000 + floor * 250 : 0);
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
  return rollItem(rng, {
    ilvl: Math.max(1, p.lvl), floor: p.pending?.floor || 1, bare: true,
    rarity: clearRarity(rng, p.pending?.floor || 1, diff, false),
    extraAffix: row.affix,
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
  const floor = Math.max(1, Math.min(13, raw.floor | 0));
  if (!p.hero) return { err: "Нет героя" };
  const asked: RunReason = raw.reason === "surrender" || raw.reason === "dead" || raw.reason === "win" ? raw.reason : (raw.boss ? "win" : "dead");
  const v = validateRun({ ...raw, boss: asked === "win" && raw.boss });
  const cleared = asked === "win" && v.boss;
  const reason: RunReason = cleared ? "win" : asked === "surrender" ? "surrender" : "dead";
  const replay = cleared && (p.clears[floor - 1] || 0) > 0;
  const quests: string[] = [];
  if (!replay && markQuest(p, `k${floor}`, v.kills)) quests.push(`k${floor}`);
  if (!replay && markQuest(p, `g${floor}`, v.generals)) quests.push(`g${floor}`);
  if (cleared && !replay && markQuest(p, `b${floor}`, 1)) quests.push(`b${floor}`);
  p.kills += v.kills;
  if (cleared) p.clears[floor - 1] = (p.clears[floor - 1] || 0) + 1;
  const eco = getTune().economy;
  const row = diffRow(raw.diff || 1);
  const flat = eco.clearBase + floor * eco.clearPerFloor + eco.bossBase + floor * eco.bossPerFloor;
  const clearPay = cleared ? Math.round(flat * row.gold * (replay ? eco.replayGold : 1)) : 0;
  const hunt = (v.kills * eco.killGold + v.generals * eco.generalGold) * row.gold;
  let gold = Math.round((clearPay + hunt) * (1 + goldFind(p)));
  if ((raw.party | 0) >= 2) gold = Math.round(gold * eco.partyGold);
  p.gold += gold;
  const killXp = Math.floor(v.kills * 0.2 * row.xp);
  const clearXp = cleared ? Math.round((getTune().floors[floor - 1]?.xp | 0) * row.xp * (replay ? eco.replayXp : 1)) : 0;
  const xp = killXp + clearXp;
  const levels = xp > 0 ? addXp(p, xp) : 0;
  const items: LootNote[] = [];
  if (cleared) {
    const rarity = clearRarity(rng, floor, row.id, replay);
    items.push(giveItem(p, rollItem(rng, {
      ilvl: Math.max(p.lvl, floor + 1), floor, rarity,
      extraAffix: row.affix, curseMul: row.curse, enchMul: row.ench,
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
    ? `${v.note ? v.note + " " : ""}${pass} Опыт зачистки ${clearXp}, за тварей ${killXp}.`
    : reason === "surrender"
      ? `Сдача. ${partial} Босс не засчитан. Опыт только за уже сбитых тварей.`
      : `Поражение: герой пал. ${partial} Босс не засчитан. Опыт только за уже сбитых тварей.`;
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
  const levels = addXp(p, def.xp);
  let item: LootNote | null = null;
  if (def.chest) item = giveItem(p, rollItem(rng, { ilvl: Math.max(p.lvl, def.floor + 1), floor: Math.max(1, def.floor), rarity: def.chest }));
  return { gold: def.gold, xp: def.xp, levels, item };
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

export function memberDiffLock(lvl: number, floorPassed: boolean, floor: number, diff: number): string | null {
  const n = Math.max(1, Math.min(13, floor | 0));
  const row = diffRow(diff);
  if (!floorPassed && (lvl | 0) < floorNeed(n)) {
    return `«${floorByN(n).name}» открывается с уровня ${floorNeed(n)}. Сейчас ${lvl | 0}. Уровень копится опытом зачистки и квестами, номер пройденного этажа его не заменяет.`;
  }
  if ((lvl | 0) < row.need) {
    return `Сложность «${row.name}» открывается с уровня ${row.need}. Сейчас ${lvl | 0}. Пройденный данж сам по себе её не открывает.`;
  }
  return null;
}
export function diffLock(p: Profile, floor: number, diff: number): string | null {
  return memberDiffLock(p.lvl | 0, floorPassed(p, floor), floor, diff);
}
export type RunOffer = {
  id: number; name: string; need: number; open: boolean; why: string | null;
  hp: number; dmg: number; mobHp: number; bossHp: number; bossDmg: number; bossHpParty4: number;
  goldFirst: number; goldReplay: number; xpFirst: number; xpReplay: number;
  rare: number; leg: number; affix: number; curse: number; ench: number; chests: number;
  partyGold: number; partyHp: number;
};
export function runOffer(p: Profile, floor: number, diff: number, party = 1): RunOffer {
  const n = Math.max(1, Math.min(13, floor | 0));
  const row = diffRow(diff);
  const why = diffLock(p, n, row.id);
  const eco = getTune().economy;
  const flat = eco.clearBase + n * eco.clearPerFloor + eco.bossBase + n * eco.bossPerFloor;
  const xp = getTune().floors[n - 1]?.xp | 0;
  const loot = getTune().loot;
  return {
    id: row.id, name: row.name, need: row.need, open: !why, why,
    hp: row.hp, dmg: row.dmg,
    mobHp: mobHp(0, n, getTune(), row.id),
    bossHp: eliteHp("boss", n, party, getTune(), row.id),
    bossDmg: Math.round(eliteDmg("boss", n, getTune(), row.id)),
    bossHpParty4: eliteHp("boss", n, 4, getTune(), row.id),
    goldFirst: Math.round(flat * row.gold),
    goldReplay: Math.round(flat * row.gold * eco.replayGold),
    xpFirst: Math.round(xp * row.xp),
    xpReplay: Math.round(xp * row.xp * eco.replayXp),
    rare: Math.min(0.75, (n >= 10 ? 0.18 : 0.08) + row.rare),
    leg: row.leg,
    affix: row.affix,
    curse: Math.min(0.75, loot.curseChance * row.curse),
    ench: Math.min(0.75, loot.enchChance * row.ench),
    chests: chestTotal(row.id),
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

export function beginRun(p: Profile, floor: number, now: number, nonce = startNonce(), carry = false, diff = 1): { nonce: string } | { err: string } {
  void carry;
  if (!p.hero) return { err: "Сначала выбери героя" };
  if (floor < 1 || floor > 13) return { err: "Нет такого данжа" };
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
  p.pending = { floor, at: now, nonce, chests: 0, diff: row.id, ...(oath !== "none" ? { oath } : {}) };
  return { nonce };
}

export function finishRun(p: Profile, body: { nonce?: string; kills?: number; generals?: number; boss?: boolean; party?: number; reason?: RunReason }, now: number, rng: Rng, trusted?: { kills: number; generals: number; boss: boolean }): RunReport | { err: string } {
  const pend = p.pending;
  if (!pend) return { err: "Забег не начат" };
  if (!body.nonce || body.nonce !== pend.nonce) return { err: "Чужой забег" };
  const elapsed = Math.max(0, now - (pend.at || now));
  const vow = pend.oath;
  p.pending = null;
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
  return report;
}
