// «Партия Чёрных королей» — этап 4: цели победы, Вожди (типы + дерево навыков), расовые варианты построек и технологий.
// Только данные (правятся в админке: game_overrides strat_rules/main → deepMerge). Принцип ШАБЛОН + РАСОВЫЙ ВАРИАНТ:
// у всех рас один скелет (те же id, ветки, развилки, эпохи), раса меняет имя/иконку и параметры при равном бюджете силы.
// Бюджет: 1 HP = 1, 1 АТК = 3, 1 БРН = 4, +1 з/ход = 3, +1 знание/ход = 3, +1 рост/ход = 2, −1 з к цене найма ≈ 1.

/** Пять целей. Партию выигрывает тот, кто первым выполнил need целей (выполненная цель — навсегда, партия идёт дальше). */
export const GOALS = {
  ids: ["chief", "hold", "treasury", "domain", "wonder"] as const,
  info: {
    chief: { name: "Цареубийство", icon: "👑", eff: "пал первый Вождь соперника" },
    hold: { name: "Твердыня", icon: "🏰", eff: "удерживать опорные пункты несколько ходов подряд" },
    treasury: { name: "Казна", icon: "💰", eff: "заработать за партию заданную сумму золота" },
    domain: { name: "Держава", icon: "🗺", eff: "владеть долей карты" },
    wonder: { name: "Великое чудо", icon: "✨", eff: "возвести Чудо своей расы в столице" },
  } as Record<string, { name: string; icon: string; eff: string }>,
  /** по размеру поля (ближайший ключ снизу): нужно целей, какие цели в игре, пороги */
  sizes: {
    4: { need: 1, list: ["chief", "hold"], holdK: 3, holdTurns: 1, gold: 0, share: 0, wonderGold: 0, wonderKnow: 0 },
    5: { need: 1, list: ["chief", "hold"], holdK: 3, holdTurns: 1, gold: 0, share: 0, wonderGold: 0, wonderKnow: 0 },
    8: { need: 3, list: ["chief", "hold", "treasury", "domain", "wonder"], holdK: 3, holdTurns: 3, gold: 80, share: 0.56, wonderGold: 18, wonderKnow: 6, wonderCap: false },
    15: { need: 3, list: ["chief", "hold", "treasury", "domain", "wonder"], holdK: 7, holdTurns: 4, gold: 190, share: 0.33, wonderGold: 40, wonderKnow: 15, wonderCap: true },
  } as Record<number, { need: number; list: string[]; holdK: number; holdTurns: number; gold: number; share: number; wonderGold: number; wonderKnow: number; wonderCap?: boolean }>,
  /** очки опорных пунктов (Твердыня): свой город; город со Стеной; взятая столица соперника (сверху); своя фигура на Обелиске/Башне/Месте чуда */
  hold: { city: 1, walled: 1, enemyCap: 2, point: 1, points: "XTO" },
  wonderGlory: 2, // Слава за ход владельцу Чуда
};

/** Вожди: типы (реестр) и дерево навыков. Имя Вождя даёт игрок — отдельно от типа. */
export type ChiefNode = { id: string; lvl: number; grp: string; req?: string[]; kind: "passive" | "active"; name: string; eff: string; ult?: string;
  fx: Partial<Record<"atk" | "arm" | "hp" | "ap" | "auraArm" | "auraAtk" | "glory" | "slayer" | "heal" | "summon" | "cd" | "r" | "burn" | "chill" | "xpMul", number>> };
export type ChiefDef = { id: string; v: number; race: string; name: string; sprite: string; unlock: string; base: { hp: number; atk: number; arm: number }; tree: ChiefNode[] };
export const CHIEF = {
  lv: [0, 4, 10, 18, 28], // опыт до уровня 1…5
  grow: { hp: [0, 3, 6, 10, 14], atk: [0, 0, 1, 1, 2], arm: [0, 0, 0, 1, 1] }, // рост характеристик по уровню (сверх базы)
  xp: { hit: 1, kill: 3, chiefKill: 6, hold: 1, survive: 1, surviveEvery: 2 },
  respawn: 5, // своих ходов до нового Вождя
  noChiefAp: 1, // −ОД за ход, пока Вождя нет (не ниже 1)
  killGlory: 8, lateKillGlory: 2, // Слава за первого павшего Вождя соперника / за последующих
  name: { min: 2, max: 20, renames: 2, window: 1 }, // переименований на одного Вождя; окно — до конца N-го своего хода после рождения
  sameTypeOnRespawn: true,
};
export { CHIEFS, ULTS, ULT_OF, UNIT_TREE, UNIT_ULTS, UNIT_RACE_NAMES } from "./tree-data";
export type { UnitAct } from "./tree-data";
export type { UltDef } from "./tree-data"; // типы Вождей и их деревья — tree-data.ts

/** Расовые названия Вождей по умолчанию (если игрок пропустил ввод имени) */
export const CHIEF_NAMES: Record<string, string[]> = {
  fire: ["Арган", "Пепелар", "Ингвар Жар", "Сажень", "Огнеслав", "Каэр"],
  ice: ["Снегирь", "Иней", "Хольд", "Стужан", "Белояр", "Мороз"],
  water: ["Прибой", "Ливень", "Нерей", "Отлив", "Морен", "Брод"],
  stone: ["Гранит", "Торвальд", "Кремень", "Базальт", "Глыба", "Ортан"],
  nature: ["Ясень", "Терн", "Вереск", "Дубрав", "Листопад", "Мох"],
  lightning: ["Перун", "Раскат", "Искрен", "Гроза", "Зарница", "Тор"],
};

/** Разрушаемые постройки (t1136): HP/БРН по типу шаблона. counter — ответный удар атакующему вплотную (только у Стены).
 *  Разрушенная постройка → руины: эффекты сразу пропадают, слот свободен, восстановление — за rebuild × цены.
 *  Ремонт (действие города): repairHpPerGold HP за 1 золото, округление вверх; нельзя, пока на клетке города враг. */
export const BUILD_HP = {
  type: {
    economy: { hp: 8, arm: 0 }, knowledge: { hp: 12, arm: 1 }, military: { hp: 14, arm: 2 }, special: { hp: 14, arm: 1 },
    fort: { hp: 20, arm: 3, counter: 2 }, wonder: { hp: 40, arm: 4 }, legend: { hp: 30, arm: 3 }, tower: { hp: 16, arm: 2, counter: 2 },
  } as Record<string, { hp: number; arm: number; counter?: number }>,
  rebuild: 0.5, repairHpPerGold: 2, razeGlory: 1, razeXp: 1, wonderGloryLost: true,
};

/** Постройки: шаблон (тип) + параметры, которые читает движок. Расы переименовывают и слегка меняют параметры (бюджет равен). */
export const BUILD_TPL = {
  barracks: { type: "military", p: { pawnCost: 2 } },
  stable: { type: "military", p: { knightDisc: 0 } },
  magetower: { type: "knowledge", p: { mageDisc: 0 } },
  forge: { type: "military", p: { atk: 1 } },
  wall: { type: "fort", p: { arm: 1, r: 1 } },
  market: { type: "economy", p: { gold: 1, rate: 1 } },
  library: { type: "knowledge", p: { know: 1 } },
  granary: { type: "economy", p: { growth: 1, gold: 0 } },
  special: { type: "special", p: {} },
  wonder: { type: "wonder", p: {} },
  warhall: { type: "legend", p: {} }, stronghold: { type: "legend", p: {} }, mint: { type: "legend", p: {} }, watchtower: { type: "tower", p: {} }, warcouncil: { type: "military", p: {} }, metropolis: { type: "legend", p: {} }, observatory: { type: "legend", p: {} },
} as Record<string, { type: string; p: Record<string, number> }>;
type BV = { name: string; icon?: string; eff?: string; p?: Record<string, number> };
export const BUILD_RACE: Record<string, Record<string, BV>> = {
  fire: { barracks: { name: "Казарма пепла" }, stable: { name: "Конюшня саламандр" }, magetower: { name: "Башня пиромантов" }, forge: { name: "Огненная кузня" },
    wall: { name: "Стена из обсидиана" }, market: { name: "Угольный рынок" }, library: { name: "Зал пламени" }, granary: { name: "Пепельный амбар" },
    wonder: { name: "Вечное пламя", icon: "🔥" } },
  ice: { barracks: { name: "Ледяной острог" }, stable: { name: "Псарня ездовых волков" }, magetower: { name: "Башня инея" }, forge: { name: "Ледяная кузня" },
    wall: { name: "Ледяной вал", eff: "+2 БРН фигуре на клетке города", p: { arm: 2, r: 0 } }, market: { name: "Меховой торг" }, library: { name: "Рунный архив" }, granary: { name: "Погреб" },
    wonder: { name: "Ледяной трон", icon: "❄" } },
  water: { barracks: { name: "Казарма прибоя" }, stable: { name: "Стойла гиппокампов" }, magetower: { name: "Башня приливов" }, forge: { name: "Кузня глубин" },
    wall: { name: "Коралловая стена" }, market: { name: "Портовый рынок" }, library: { name: "Грот знаний" },
    granary: { name: "Рыбный садок", eff: "+1 з за ход", p: { growth: 0, gold: 1 } }, wonder: { name: "Великий маяк", icon: "🗼" } },
  stone: { barracks: { name: "Казематы" }, stable: { name: "Загон горных козлов" }, magetower: { name: "Башня рун" }, forge: { name: "Подгорная кузня" },
    wall: { name: "Крепостная стена", eff: "+1 БРН своим в радиусе 2 от города; стена дороже не стала", p: { arm: 1, r: 2 } }, market: { name: "Рудный двор" }, library: { name: "Скрижальня" },
    granary: { name: "Каменный амбар" }, wonder: { name: "Сердце горы", icon: "⛰" } },
  nature: { barracks: { name: "Лагерь лесничих" }, stable: { name: "Олений загон" }, magetower: { name: "Круг друидов" }, forge: { name: "Терновая мастерская" },
    wall: { name: "Живая изгородь" }, market: { name: "Ярмарка трав" }, library: { name: "Древесный архив" },
    granary: { name: "Сад изобилия", eff: "+2 роста за ход, без золота", p: { growth: 2 } }, wonder: { name: "Древо мира", icon: "🌳" } },
  lightning: { barracks: { name: "Казарма грозы" }, stable: { name: "Стойла грозовых коней" }, magetower: { name: "Башня разрядов" }, forge: { name: "Медная кузня" },
    wall: { name: "Стена громоотводов" }, market: { name: "Медный рынок", eff: "обмен знаний на золото 1:2, без дохода", p: { gold: 0, rate: 2 } }, library: { name: "Зал молний" },
    granary: { name: "Грозовой амбар" }, wonder: { name: "Небесный шпиль", icon: "⚡" } },
};

export { TECH_NODE_ORDER, TECH_RACE_NAMES, TECH_RACE_FX } from "./tree-data"; // расовые имена/варианты узлов — tree-data.ts
