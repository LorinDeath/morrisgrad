// «Проклятые»: общие (сервер + клиент) определения прогрессии по плану автора (DESIGN-month-plan.md).
// Сервер — единственный источник истины: требования, цены, статы предметов, шансы дропа,
// прогресс квестов и награды считаются ТОЛЬКО на сервере (server/meta/*.ts).
// Клиент импортирует файл лишь для отображения (тултипы, деревья, тексты квестов, бестиарий).
//
// Модель хранения:
//  • герой (warrior/spearman/rogue/mage) качается ОТДЕЛЬНО: уровень, опыт, очки талантов, таланты,
//    навыки и их Сияние, раскладка навыков, надетая экипировка (5 слотов) — всё своё у каждого героя;
//  • аккаунт: общая сумка предметов и материалы, кошелёк звёзд, очки Создания и ветка души,
//    сюжет/квесты, бестиарий. Баланс и капы — docs/MORRISCURSE-BALANCE.md.

export const HERO_IDS = ["warrior", "spearman", "rogue", "mage"] as const;
export type HeroId = (typeof HERO_IDS)[number];
export const HERO_NAMES: Record<string, string> = { warrior: "Велес", spearman: "Нофорд", rogue: "Кавега", mage: "Мариэль" };

// ---------------- уровень класса → очки талантов ----------------
export const HERO_MAX_LEVEL = 30;
export function heroXpNeed(level: number): number { return Math.round(80 + 40 * Math.pow(level, 1.45)); }
export function talentPointsForLevel(level: number): number { return Math.max(0, Math.min(HERO_MAX_LEVEL, level) - 1); }
export function abilitySlots(level: number): number { return level >= 5 ? 3 : 2; }
export function heroLevelHp(level: number): number { return (Math.min(HERO_MAX_LEVEL, level) - 1) * 2; }

// ---------------- статы и капы (баланс: никаких «богов») ----------------
export type StatKey = "hp" | "armor" | "dmgPct" | "speedPct" | "regen" | "magnetPct" | "cdrPct" | "critPct" | "lifestealPct" | "atkSpeedPct" | "revive";
// Жёсткие капы итоговых значений после всех источников (таланты + предметы + сияние + душа)
export const STAT_CAPS: Record<string, number> = {
  critPct: 40, cdrPct: 35, lifestealPct: 8, atkSpeedPct: 40, speedPct: 30, magnetPct: 120, dmgPct: 80, regen: 3, damageReduction: 0.6,
};
// Убывающая отдача: эффективное = cap * (1 - exp(-raw / cap)) — первые очки почти 1:1, дальше всё меньше.
export function softCap(raw: number, cap: number): number {
  if (raw <= 0) return raw;
  return cap * (1 - Math.exp(-raw / cap));
}
// Броня → снижение урона с убывающей отдачей, кап 60%
export function armorToReduction(armor: number): number {
  if (armor <= 0) return 0;
  return Math.min(STAT_CAPS.damageReduction, armor / (armor + 60));
}

// ---------------- дерево талантов класса ----------------
export interface TalentDef { id: string; name: string; icon: string; desc: string; tier: 1 | 2 | 3; max: number; per: Partial<Record<StatKey, number>>; req?: string }
export const TALENT_TIER_REQ: Record<number, number> = { 1: 0, 2: 5, 3: 12 }; // очков вложено в дерево до яруса
function tree(cls: string, n: { might: string; ward: string; focus: string; crit: string; regen: string; revive: string }): TalentDef[] {
  const t = (key: string, d: Omit<TalentDef, "id">): TalentDef => ({ ...d, id: `${cls}.${key}` });
  return [
    t("vit", { name: "Живучесть", icon: "❤️", desc: "+6 макс. здоровья", tier: 1, max: 5, per: { hp: 6 } }),
    t("might", { name: n.might, icon: "💪", desc: "+3% урона", tier: 1, max: 5, per: { dmgPct: 3 } }),
    t("ward", { name: n.ward, icon: "🛡️", desc: "+2 брони", tier: 1, max: 5, per: { armor: 2 } }),
    t("greed", { name: "Притяжение", icon: "🧲", desc: "+8% радиус сбора", tier: 1, max: 3, per: { magnetPct: 8 } }),
    t("swift", { name: "Лёгкий шаг", icon: "👟", desc: "+3% скорости", tier: 2, max: 4, per: { speedPct: 3 } }),
    t("focus", { name: n.focus, icon: "📜", desc: "−3% перезарядки навыков", tier: 2, max: 5, per: { cdrPct: 3 } }),
    t("crit", { name: n.crit, icon: "🎯", desc: "+2% шанс крита", tier: 2, max: 5, per: { critPct: 2 } }),
    t("haste", { name: "Ритм боя", icon: "⏱️", desc: "+3% скорость атаки", tier: 2, max: 4, per: { atkSpeedPct: 3 } }),
    t("regen", { name: n.regen, icon: "🌿", desc: "+0.2 HP/с", tier: 3, max: 4, per: { regen: 0.2 } }),
    t("leech", { name: "Жажда", icon: "🩸", desc: "+1% вампиризма", tier: 3, max: 3, per: { lifestealPct: 1 } }),
    t("revive", { name: n.revive, icon: "🕯️", desc: "Раз за забег/бой встать с 40% HP", tier: 3, max: 1, per: { revive: 1 }, req: `${cls}.vit` }),
  ];
}
export const TALENTS: Record<string, TalentDef[]> = {
  warrior: tree("warrior", { might: "Тяжесть Стража", ward: "Закалка", focus: "Клятва совета", crit: "Удар без промаха", regen: "Кровь бессмертных", revive: "Клятва Вайт" }),
  spearman: tree("spearman", { might: "Хватка детектива", ward: "Кожаный жилет", focus: "Чутьё на улики", crit: "Точный выпад", regen: "Упрямство Гринпойса", revive: "Второй шанс" }),
  rogue: tree("rogue", { might: "Пламя нулевого дня", ward: "Плащ из сажи", focus: "Ритм печи", crit: "Холодный расчёт", regen: "Тлеющие угли", revive: "Пепел возрождается" }),
  mage: tree("mage", { might: "Эфир Аезера", ward: "Белый мундир", focus: "Библиотечная тишина", crit: "Острый ум", regen: "Фиолетовое пламя", revive: "Последняя страница" }),
};
export const TALENT_BY_ID: Record<string, TalentDef> = Object.fromEntries(Object.values(TALENTS).flat().map((t) => [t.id, t]));

// ---------------- навыки: пул класса + навыки монстров; раскладка 2–3 слота ----------------
export interface AbilityDef {
  id: string; cls: HeroId | "monster"; name: string; icon: string; desc: string;
  cd: number; power: number; unlockLevel: number; legacy?: boolean;
  radiance: [string, string, string]; // уникальное свойство на 3-м уровне жёлтого / красного / фиолетового сияния
}
export const ABILITIES_DEF: AbilityDef[] = [
  { id: "backstab", cls: "warrior", name: "Удар в спину", icon: "🗡️", cd: 12, power: 1.5, unlockLevel: 1, legacy: true, desc: "Рывок за спину сильнейшего врага и веер из 10 клинков.", radiance: ["echo", "vamp", "nova"] },
  { id: "shield_wall", cls: "warrior", name: "Стена щитов", icon: "🛡️", cd: 16, power: 1.0, unlockLevel: 2, desc: "4 с: входящий урон −50%, ударная волна отбрасывает врагов.", radiance: ["extend", "nova", "vamp"] },
  { id: "whirlwind", cls: "warrior", name: "Вихрь стали", icon: "🌪️", cd: 10, power: 0.9, unlockLevel: 4, desc: "Топоры кружат вокруг героя 3 с.", radiance: ["extend", "swift", "echo"] },
  { id: "pierce", cls: "spearman", name: "Колющий удар", icon: "🔱", cd: 8, power: 1.2, unlockLevel: 1, legacy: true, desc: "Гигантское копьё насквозь через линию, игнорирует броню.", radiance: ["echo", "swift", "nova"] },
  { id: "spear_rain", cls: "spearman", name: "Дождь копий", icon: "☔", cd: 14, power: 0.8, unlockLevel: 2, desc: "18 копий падают по площади вокруг героя.", radiance: ["extend", "echo", "vamp"] },
  { id: "leap_strike", cls: "spearman", name: "Прыжок детектива", icon: "🦘", cd: 11, power: 1.6, unlockLevel: 4, desc: "Прыжок вперёд, неуязвимость в полёте, удар при приземлении.", radiance: ["nova", "swift", "echo"] },
  { id: "trick_strike", cls: "rogue", name: "Коварный удар", icon: "🌀", cd: 12, power: 1.1, unlockLevel: 1, legacy: true, desc: "Вихрь из 16 кинжалов, лечит 10% урона.", radiance: ["echo", "swift", "nova"] },
  { id: "smoke_bomb", cls: "rogue", name: "Сажа печи", icon: "💨", cd: 15, power: 0.5, unlockLevel: 2, desc: "Облако сажи: 2.5 с неуязвимости, враги в облаке замедлены.", radiance: ["extend", "vamp", "nova"] },
  { id: "shadow_step", cls: "rogue", name: "Рывок нулевого дня", icon: "🔥", cd: 9, power: 1.4, unlockLevel: 4, desc: "Рывок сквозь врагов, позади — взрывающийся след.", radiance: ["swift", "echo", "vamp"] },
  { id: "fireball", cls: "mage", name: "Огненный шар", icon: "☄️", cd: 16, power: 10, unlockLevel: 1, legacy: true, desc: "Огромный огненный шар: взрыв ×10 урона по площади.", radiance: ["extend", "echo", "nova"] },
  { id: "frost_nova", cls: "mage", name: "Морозная звезда", icon: "❄️", cd: 12, power: 1.0, unlockLevel: 2, desc: "Кольцо льда: урон и заморозка на 2 с.", radiance: ["extend", "vamp", "echo"] },
  { id: "meteor", cls: "mage", name: "Метеор Аезера", icon: "🌠", cd: 20, power: 6, unlockLevel: 4, desc: "Через 1.2 с в отмеченную точку падает метеор (зона видна).", radiance: ["nova", "echo", "swift"] },
  // навык монстра — трофей (главное правило «Проклятых»): даётся надетым оружием мухи
  { id: "fly_blade_dash", cls: "monster", name: "Лезвийный рывок мухи", icon: "🪰", cd: 7, power: 1.3, unlockLevel: 1, desc: "Рывок с вращающимися лезвиями на лапках: режет всех на пути.", radiance: ["swift", "echo", "vamp"] },
];
export const ABILITY_BY_ID: Record<string, AbilityDef> = Object.fromEntries(ABILITIES_DEF.map((a) => [a.id, a]));
export const LEGACY_ABILITY: Record<string, string> = { warrior: "backstab", spearman: "pierce", rogue: "trick_strike", mage: "fireball" };
export const RADIANCE_PROPS: Record<string, { name: string; desc: string }> = {
  echo: { name: "Эхо", desc: "Навык повторяется через 0.6 с с силой 40%" },
  vamp: { name: "Жажда", desc: "8% урона навыка лечит героя (кап вампиризма общий)" },
  nova: { name: "Вспышка", desc: "При применении — взрыв вокруг героя" },
  swift: { name: "Порыв", desc: "+25% скорости на 2 с после применения" },
  extend: { name: "Размах", desc: "+40% длительность/радиус" },
};

// ---------------- Сияние: 3 цвета × 3 уровня, звёзды ----------------
export const STAR_COLORS = ["yellow", "red", "purple", "black"] as const;
export const STAR_NAMES: Record<string, string> = { yellow: "Жёлтая звезда", red: "Красная звезда", purple: "Фиолетовая звезда", black: "Чёрная звезда" };
export const RADIANCE_MAX = 9; // 1–3 жёлтое, 4–6 красное, 7–9 фиолетовое (максимум — фиолетовое 3)
export function radianceColor(step: number): "yellow" | "red" | "purple" { return step <= 3 ? "yellow" : step <= 6 ? "red" : "purple"; }
export function radianceCost(nextStep: number): { color: string; stars: number } { return { color: radianceColor(nextStep), stars: ((nextStep - 1) % 3) + 1 }; }
// Мягкий кап: +6% силы за шаг, но не более +45%; перезарядка −2.5%/шаг (общий кап CDR 35%)
export function radiancePowerMult(step: number): number { return 1 + Math.min(0.45, 0.06 * step); }
export function radianceCdMult(step: number): number { return 1 - 0.025 * step; }
export function radianceProps(abilityId: string, step: number): string[] {
  const a = ABILITY_BY_ID[abilityId];
  if (!a) return [];
  return [step >= 3 && a.radiance[0], step >= 6 && a.radiance[1], step >= 9 && a.radiance[2]].filter(Boolean) as string[];
}

// ---------------- ветка души (очки Создания) — содержимое скрыто до покупки ----------------
export const SOUL_BRANCH: { id: string; name: string; desc: string; cost: number; req?: string; per: Partial<Record<StatKey, number>> }[] = [
  { id: "void_whisper", name: "Шёпот пустоты", desc: "Чёрное пламя тлеет в каждом ударе: +5% урона всем героям.", cost: 1, per: { dmgPct: 5 } },
  { id: "hollow_heart", name: "Полое сердце", desc: "Сердце без сияния бьётся ровнее: +12 HP всем героям.", cost: 1, req: "void_whisper", per: { hp: 12 } },
  { id: "crown_echo", name: "Отзвук короны", desc: "Тень Чёрной короны укорачивает время: −5% перезарядки.", cost: 2, req: "hollow_heart", per: { cdrPct: 5 } },
  { id: "unmaker", name: "Тот, кто стирает", desc: "…", cost: 3, req: "crown_echo", per: { dmgPct: 8, critPct: 4 } },
];

// ---------------- материалы ----------------
export const RESOURCES: Record<string, { name: string; icon: string; color: string }> = {
  fly_wing: { name: "Крыло лезвийной мухи", icon: "🪽", color: "#a5f3fc" },
  fly_chitin: { name: "Хитин мухи", icon: "🟫", color: "#a16207" },
  moonpetal: { name: "Ночная фиалка", icon: "🪻", color: "#c084fc" },
  starsilver: { name: "Звёздное серебро", icon: "✨", color: "#e2e8f0" },
  dreamwood: { name: "Гранатовая ветвь", icon: "🌿", color: "#be123c" },
  rot_ore: { name: "Гнилая руда", icon: "🪨", color: "#84cc16" },
  soul_shard: { name: "Осколок души", icon: "💠", color: "#c084fc" },
};

// ---------------- предметы: ФИКСИРОВАННЫЕ статы, 5 слотов ----------------
export const RARITIES: Record<string, { name: string; color: string; order: number }> = {
  common: { name: "Обычный", color: "#9ca3af", order: 0 },
  uncommon: { name: "Необычный", color: "#4ade80", order: 1 },
  rare: { name: "Редкий", color: "#60a5fa", order: 2 },
  epic: { name: "Эпический", color: "#c084fc", order: 3 },
  legendary: { name: "Легендарный", color: "#f59e0b", order: 4 },
  mythic: { name: "Мифический", color: "#f43f5e", order: 5 },
};
// 4 слота одежды (шлем, броня, ноги, руки) + оружие
export const SLOTS: Record<string, string> = { weapon: "Оружие", helmet: "Шлем", armor: "Броня", legs: "Ноги", hands: "Руки" };
export const SLOT_ORDER = ["weapon", "helmet", "armor", "legs", "hands"];
export interface ItemStats { dmgMin?: number; dmgMax?: number; armor?: number; hp?: number; speedPct?: number; critPct?: number; regen?: number; cdrPct?: number; magnetPct?: number; lifestealPct?: number; atkSpeedPct?: number }
export interface ItemDef {
  id: string; name: string; slot: string; rarity: string; classes?: HeroId[]; stats: ItemStats; lore: string; icon: string;
  monster?: string; look?: string; grantsAbility?: string; band?: string; // band — зона/полоса силы
}
export const ITEMS: ItemDef[] = [
  // --- трофеи лезвийной мухи (полный пример главного правила) ---
  { id: "fly_blades", name: "Лапки-лезвия мухи", slot: "weapon", rarity: "uncommon", stats: { dmgMin: 5, dmgMax: 7, atkSpeedPct: 4 }, icon: "🦿", monster: "blade_fly", look: "blade_fly", grantsAbility: "fly_blade_dash", band: "Мэлвелдил I", lore: "Шесть заточенных лапок. Режут воздух со звуком «вжжж»." },
  { id: "fly_eyes", name: "Фасеточный шлем мухи", slot: "helmet", rarity: "uncommon", stats: { critPct: 3 }, icon: "🪖", monster: "blade_fly", look: "blade_fly", band: "Мэлвелдил I", lore: "Видишь всё сразу. Голова немного кружится." },
  { id: "fly_carapace", name: "Хитиновый панцирь мухи", slot: "armor", rarity: "uncommon", stats: { armor: 4, hp: 8 }, icon: "🪲", monster: "blade_fly", look: "blade_fly", band: "Мэлвелдил I", lore: "Переливается, как бензиновое пятно." },
  { id: "fly_legs", name: "Сапоги-лапки мухи", slot: "legs", rarity: "uncommon", stats: { speedPct: 5 }, icon: "🥾", monster: "blade_fly", look: "blade_fly", band: "Мэлвелдил I", lore: "Липнут к потолку. И к полу. Немного к совести." },
  // --- мотылёк снов ---
  { id: "moth_hood", name: "Капюшон мотылька", slot: "helmet", rarity: "rare", stats: { cdrPct: 4, hp: 6 }, icon: "🦋", monster: "dream_moth", look: "dream_moth", band: "Мэлвелдил I", lore: "Пыльца на нём пахнет чужими снами." },
  { id: "moth_cloak", name: "Плащ мотылька снов", slot: "armor", rarity: "rare", stats: { armor: 5, hp: 12, regen: 0.2 }, icon: "🧥", monster: "dream_moth", look: "dream_moth", band: "Мэлвелдил I", lore: "Мягкий, как сон на рассвете." },
  { id: "moth_gloves", name: "Пыльные перчатки", slot: "hands", rarity: "rare", stats: { magnetPct: 12, critPct: 2 }, icon: "🧤", monster: "dream_moth", look: "dream_moth", band: "Мэлвелдил I", lore: "Щепотка пыльцы — и ты не помнишь, зачем пришёл." },
  // --- гниль системы ---
  { id: "rot_greaves", name: "Поножи из гнилой руды", slot: "legs", rarity: "common", stats: { armor: 2, speedPct: 1 }, icon: "🦵", monster: "rot_glitch", band: "Мэлвелдил I", lore: "Тяжёлые, зелёные, слегка мерцают." },
  { id: "rot_grip", name: "Сбойные рукавицы", slot: "hands", rarity: "common", stats: { atkSpeedPct: 3 }, icon: "🧤", monster: "rot_glitch", band: "Мэлвелдил I", lore: "Иногда пальцев пять. Иногда шесть." },
  // --- Страж Фиолетовой Луны (мировой босс) ---
  { id: "violet_moon_blade", name: "Клинок Фиолетовой Луны", slot: "weapon", rarity: "mythic", stats: { dmgMin: 14, dmgMax: 19, critPct: 5 }, icon: "🌙", monster: "moon_sentinel", look: "moon_sentinel", band: "Мэлвелдил босс", lore: "Помнит Апокалипсис Фиолетовой Луны." },
  { id: "moon_crown", name: "Венец Лунного стража", slot: "helmet", rarity: "legendary", stats: { hp: 25, cdrPct: 6 }, icon: "👑", monster: "moon_sentinel", look: "moon_sentinel", band: "Мэлвелдил босс", lore: "Холодный свет на висках." },
  { id: "moon_plate", name: "Лунные латы", slot: "armor", rarity: "epic", stats: { armor: 9, hp: 20 }, icon: "🛡️", monster: "moon_sentinel", look: "moon_sentinel", band: "Мэлвелдил босс", lore: "Тяжесть, которую носят с гордостью." },
  // --- Страж Проклятия (босс забега) ---
  { id: "warden_gauntlets", name: "Рукавицы Стража Проклятия", slot: "hands", rarity: "epic", stats: { armor: 3, dmgMin: 1, dmgMax: 2, lifestealPct: 1 }, icon: "🧤", monster: "warden", band: "Склеп", lore: "Срываются со Стража лишь однажды за много пробуждений." },
  { id: "black_crown_shard", name: "Осколок Чёрной короны", slot: "helmet", rarity: "mythic", stats: { critPct: 5, cdrPct: 6, hp: 15 }, icon: "🖤", monster: "warden", band: "Склеп", lore: "Шепчет о тотальном стирании. Не слушайте." },
  // --- рядовые забегов ---
  { id: "imp_horns", name: "Рожки беса", slot: "helmet", rarity: "common", stats: { hp: 4 }, icon: "😈", monster: "imp", band: "Склеп", lore: "Носить с достоинством затруднительно." },
  { id: "ghoul_wraps", name: "Обмотки упыря", slot: "hands", rarity: "common", stats: { armor: 1, regen: 0.1 }, icon: "🩹", monster: "ghoul", band: "Склеп", lore: "Лучше не спрашивать, чем они пропитаны." },
  // --- классовое / ремесло ---
  { id: "greenpoise_bow", name: "Лук Гринпойса", slot: "weapon", rarity: "uncommon", classes: ["spearman", "rogue"], stats: { dmgMin: 5, dmgMax: 7 }, icon: "🏹", band: "ремесло", lore: "Из диких земель истребления. Тетива поёт на ветру." },
  { id: "guard_axe", name: "Секира Стража", slot: "weapon", rarity: "rare", classes: ["warrior"], stats: { dmgMin: 6, dmgMax: 9, armor: 2 }, icon: "🪓", band: "ремесло", lore: "Выдаётся членам совета Стражей." },
  { id: "aezer_staff", name: "Посох эфира Аезера", slot: "weapon", rarity: "rare", classes: ["mage"], stats: { dmgMin: 6, dmgMax: 9, cdrPct: 3 }, icon: "🪄", band: "ремесло", lore: "Белые маги не любили вопросов." },
  { id: "padded_coat", name: "Стёганая куртка", slot: "armor", rarity: "common", stats: { armor: 2, hp: 5 }, icon: "🧥", band: "старт", lore: "Тёплая. Это главное." },
  { id: "melveldil_sandals", name: "Сандалии Мэлвелдила", slot: "legs", rarity: "rare", stats: { speedPct: 7, regen: 0.2 }, icon: "👡", band: "ремесло", lore: "Лэйр говорит: в них земля сама толкает вперёд." },
];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// ---------------- монстры: «что есть у монстра — то можно забрать» ----------------
// Каждый враг сам описывает: свои вещи (по слотам) с шансами, материалы, облик (полный комплект → вы
// выглядите как он) и навыки (даются надетым трофеем). Бросок — на сервере. Шансы — в процентах.
export interface MonsterLoot {
  name: string; kind: "zone" | "run" | "boss";
  stats: { hp: number; dmg: number; armor: number; speed: string };
  abilitiesText: string[];
  gear: { item: string; chance: number }[];
  materials: { res: string; chance: number; qty: [number, number] }[];
  look?: { id: string; name: string; parts: string[]; bonus: string };
  abilities?: string[];
}
export const MONSTER_LOOT: Record<string, MonsterLoot> = {
  blade_fly: {
    name: "Мошкара-Жнец", kind: "zone", stats: { hp: 55, dmg: 6, armor: 1, speed: "очень быстрая" },
    abilitiesText: ["Лезвийный рывок: после жужжащего замаха (красная линия на земле) бросается вперёд.", "Лезет в глаза. Буквально."],
    gear: [{ item: "fly_blades", chance: 5 }, { item: "fly_eyes", chance: 5 }, { item: "fly_carapace", chance: 5 }, { item: "fly_legs", chance: 5 }],
    materials: [{ res: "fly_wing", chance: 45, qty: [1, 2] }, { res: "fly_chitin", chance: 35, qty: [1, 1] }],
    look: { id: "blade_fly", name: "Облик Мошкары-Жнеца", parts: ["fly_blades", "fly_eyes", "fly_carapace", "fly_legs"], bonus: "Вы выглядите как муха: крылья, лапки-лезвия; +5% скорости (в пределах капа)" },
    abilities: ["fly_blade_dash"],
  },
  dream_moth: {
    name: "Тихий мотылёк", kind: "zone", stats: { hp: 80, dmg: 7, armor: 1, speed: "средняя" },
    abilitiesText: ["Сонная пыльца: облако, замедляющее героя."],
    gear: [{ item: "moth_hood", chance: 2.5 }, { item: "moth_cloak", chance: 2.5 }, { item: "moth_gloves", chance: 2.5 }],
    materials: [{ res: "moonpetal", chance: 40, qty: [1, 2] }, { res: "soul_shard", chance: 6, qty: [1, 1] }],
    look: { id: "dream_moth", name: "Облик мотылька снов", parts: ["moth_hood", "moth_cloak", "moth_gloves"], bonus: "Пыльные крылья и мягкий свет" },
  },
  rot_glitch: {
    name: "Глитч-слизь", kind: "zone", stats: { hp: 45, dmg: 5, armor: 0, speed: "медленная" },
    abilitiesText: ["Распад: при смерти оставляет лужу гнили."],
    gear: [{ item: "rot_greaves", chance: 4 }, { item: "rot_grip", chance: 4 }],
    materials: [{ res: "rot_ore", chance: 50, qty: [1, 2] }, { res: "soul_shard", chance: 3, qty: [1, 1] }],
  },
  moon_sentinel: {
    name: "Безветрие (Отголосок, съевший ветер)", kind: "boss", stats: { hp: 4200, dmg: 24, armor: 8, speed: "средняя" },
    abilitiesText: ["Лунный удар: круг на земле, через 1.2 с — взрыв.", "Кольцо осколков каждые 6 с."],
    gear: [{ item: "violet_moon_blade", chance: 0.1 }, { item: "moon_crown", chance: 0.8 }, { item: "moon_plate", chance: 2 }],
    materials: [{ res: "starsilver", chance: 100, qty: [3, 6] }, { res: "soul_shard", chance: 100, qty: [3, 5] }],
    look: { id: "moon_sentinel", name: "Облик Лунного стража", parts: ["violet_moon_blade", "moon_crown", "moon_plate"], bonus: "Фиолетовое сияние вокруг героя" },
  },
  warden: {
    name: "Страж Проклятия", kind: "boss", stats: { hp: 2400, dmg: 26, armor: 10, speed: "средняя" },
    abilitiesText: ["Удар по земле с предупреждением", "Кольцо проклятых снарядов"],
    gear: [{ item: "warden_gauntlets", chance: 4 }, { item: "black_crown_shard", chance: 0.1 }],
    materials: [{ res: "soul_shard", chance: 100, qty: [2, 4] }],
  },
  imp: { name: "Бес", kind: "run", stats: { hp: 10, dmg: 6, armor: 0, speed: "быстрая" }, abilitiesText: ["Толпой."], gear: [{ item: "imp_horns", chance: 0.2 }], materials: [{ res: "soul_shard", chance: 0.5, qty: [1, 1] }] },
  ghoul: { name: "Упырь", kind: "run", stats: { hp: 26, dmg: 9, armor: 2, speed: "средняя" }, abilitiesText: ["Крепкий."], gear: [{ item: "ghoul_wraps", chance: 0.3 }], materials: [{ res: "rot_ore", chance: 3, qty: [1, 1] }] },
  run_fly: { name: "Мошкара-Жнец (забег)", kind: "run", stats: { hp: 14, dmg: 7, armor: 0, speed: "очень быстрая" }, abilitiesText: ["Рывок с замахом."],
    gear: [{ item: "fly_blades", chance: 0.4 }, { item: "fly_eyes", chance: 0.4 }, { item: "fly_carapace", chance: 0.4 }, { item: "fly_legs", chance: 0.4 }],
    materials: [{ res: "fly_wing", chance: 6, qty: [1, 1] }] },
  run_moth: { name: "Тихий мотылёк (забег)", kind: "run", stats: { hp: 16, dmg: 6, armor: 0, speed: "средняя" }, abilitiesText: ["Сонная пыльца замедляет."],
    gear: [{ item: "moth_hood", chance: 0.2 }, { item: "moth_cloak", chance: 0.2 }, { item: "moth_gloves", chance: 0.2 }],
    materials: [{ res: "moonpetal", chance: 5, qty: [1, 1] }] },
  run_glitch: { name: "Глитч-слизь (забег)", kind: "run", stats: { hp: 22, dmg: 6, armor: 0, speed: "медленная" }, abilitiesText: ["Оставляет лужу гнили."],
    gear: [{ item: "rot_greaves", chance: 0.3 }, { item: "rot_grip", chance: 0.3 }],
    materials: [{ res: "rot_ore", chance: 6, qty: [1, 1] }] },
};
// тип врага в забеге → таблица трофеев (в забегах шансы ниже, чем в открытом мире)
export const RUN_LOOT_KEY: Record<string, string> = { imp: "imp", ghoul: "ghoul", blade_fly: "run_fly", dream_moth: "run_moth", rot_glitch: "run_glitch" };
export const RUN_BOSS_BY_ROOM: Record<string, string> = { crypt: "warden", abyss: "moon_sentinel" };
export const LOOKS: Record<string, { id: string; name: string; parts: string[]; bonus: string }> =
  Object.fromEntries(Object.values(MONSTER_LOOT).filter((m) => m.look).map((m) => [m.look!.id, m.look!]));

// ---------------- ремесло (у Петра) ----------------
export const RECIPES: { id: string; item: string; cost: Record<string, number> }[] = [
  { id: "r_fly_legs", item: "fly_legs", cost: { fly_wing: 6, fly_chitin: 4 } },
  { id: "r_fly_carapace", item: "fly_carapace", cost: { fly_chitin: 8, fly_wing: 2 } },
  { id: "r_bow", item: "greenpoise_bow", cost: { dreamwood: 6, moonpetal: 2 } },
  { id: "r_axe", item: "guard_axe", cost: { dreamwood: 4, starsilver: 3 } },
  { id: "r_staff", item: "aezer_staff", cost: { dreamwood: 4, moonpetal: 4, soul_shard: 2 } },
  { id: "r_padded", item: "padded_coat", cost: { dreamwood: 3, moonpetal: 1 } },
  { id: "r_sandals", item: "melveldil_sandals", cost: { starsilver: 4, moonpetal: 4, dreamwood: 2 } },
];

// ---------------- Аринар → государство Мэлвелдил: общий мир с мобами и ресурсами ----------------
export const ZONE_WORLD = "arinar";
export const ZONE_MOBS: Record<string, { name: string; hp: number; dmg: number; speed: number; aggro: number; xp: number; radius: number; armor: number; color: string; boss?: boolean }> = {
  blade_fly: { name: "Мошкара-Жнец", hp: 55, dmg: 6, speed: 105, aggro: 180, xp: 14, radius: 13, armor: 1, color: "#a5f3fc" },
  dream_moth: { name: "Тихий мотылёк", hp: 80, dmg: 7, speed: 70, aggro: 160, xp: 18, radius: 15, armor: 1, color: "#f0abfc" },
  rot_glitch: { name: "Глитч-слизь", hp: 45, dmg: 5, speed: 55, aggro: 130, xp: 10, radius: 13, armor: 0, color: "#84cc16" },
  moon_sentinel: { name: "Безветрие", hp: 4200, dmg: 24, speed: 55, aggro: 230, xp: 500, radius: 40, armor: 8, color: "#a855f7", boss: true },
};
export const ZONE_SPAWNS: { type: string; x: number; y: number; respawn: number }[] = [
  { type: "blade_fly", x: 420, y: 300, respawn: 20 }, { type: "blade_fly", x: 500, y: 250, respawn: 20 }, { type: "blade_fly", x: 560, y: 330, respawn: 20 },
  { type: "blade_fly", x: 700, y: 280, respawn: 20 }, { type: "blade_fly", x: 760, y: 360, respawn: 20 }, { type: "blade_fly", x: 640, y: 210, respawn: 20 },
  { type: "dream_moth", x: 300, y: 860, respawn: 30 }, { type: "dream_moth", x: 400, y: 940, respawn: 30 }, { type: "dream_moth", x: 230, y: 980, respawn: 30 },
  { type: "rot_glitch", x: 1000, y: 820, respawn: 22 }, { type: "rot_glitch", x: 1060, y: 900, respawn: 22 }, { type: "rot_glitch", x: 950, y: 960, respawn: 22 },
  { type: "moon_sentinel", x: 720, y: 1040, respawn: 480 },
];
export const ZONE_NODES: { type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[] = [
  { type: "tree", res: "dreamwood", x: 160, y: 300, respawn: 35, qty: [1, 3] },
  { type: "tree", res: "dreamwood", x: 240, y: 420, respawn: 35, qty: [1, 3] },
  { type: "tree", res: "dreamwood", x: 1080, y: 300, respawn: 35, qty: [1, 3] },
  { type: "flower", res: "moonpetal", x: 520, y: 760, respawn: 40, qty: [1, 2] },
  { type: "flower", res: "moonpetal", x: 860, y: 520, respawn: 40, qty: [1, 2] },
  { type: "flower", res: "moonpetal", x: 160, y: 700, respawn: 40, qty: [1, 2] },
  { type: "crystal", res: "starsilver", x: 1100, y: 620, respawn: 60, qty: [1, 2] },
  { type: "crystal", res: "starsilver", x: 560, y: 1100, respawn: 60, qty: [1, 2] },
  { type: "ore", res: "rot_ore", x: 1120, y: 1060, respawn: 45, qty: [1, 2] },
];
// Поляна перевоплощения (хаб): несколько Мошкар-Жнецов на северном краю — первый бой пролога
export const HUB_SPAWNS: { type: string; x: number; y: number; respawn: number }[] = [
  { type: "blade_fly", x: 520, y: 150, respawn: 12 }, { type: "blade_fly", x: 600, y: 120, respawn: 12 }, { type: "blade_fly", x: 680, y: 160, respawn: 12 },
  { type: "blade_fly", x: 760, y: 130, respawn: 12 },
];
// Тип оружия героя в открытом мире: визуал выстрела (спрайт proj_atlas у клиента) и статус (сервер-авторитет).
// dpsPct — урон по времени в % от удара в секунду (не стакается: держится сильнейший), dur — сек.
// atk — форма удара по клику: proj — первый моб на луче, line — пронзает до max, arc — дуга ±arc рад до max целей.
// cd — базовая перезарядка удара (мс), делится на (1 + скорость атаки %/100); удержание ЛКМ повторяет удар с этим темпом.
// Вторичные цели line/arc получают 70%/80% урона. knock — отбрасывание (px-импульс; боссы иммунны, элита ×0.5), slow — замедление на 1.2 с.
export interface WeaponAtk { kind: "proj" | "line" | "arc"; range: number; width?: number; arc?: number; max?: number }
export interface WeaponTypeDef { name: string; shot: string; cd: number; atk: WeaponAtk; status: { kind?: string; dpsPct?: number; dur?: number; slow?: boolean; knock?: number } }
export const WEAPON_TYPES: Record<string, WeaponTypeDef> = {
  spear: { name: "Копьё", shot: "spear", cd: 520, atk: { kind: "line", range: 200, width: 22, max: 3 }, status: { knock: 2.5 } },
  daggers: { name: "Кинжалы", shot: "daggers", cd: 340, atk: { kind: "proj", range: 200, width: 18 }, status: { kind: "bleed", dpsPct: 12, dur: 3 } },
  book: { name: "Гримуар", shot: "soul_spark", cd: 450, atk: { kind: "proj", range: 230, width: 22 }, status: { kind: "burn", dpsPct: 10, dur: 3 } },
  staff: { name: "Посох", shot: "staff_bolt", cd: 560, atk: { kind: "proj", range: 240, width: 24 }, status: { kind: "burn", dpsPct: 15, dur: 3 } },
  sword: { name: "Меч", shot: "ab_backstab", cd: 480, atk: { kind: "arc", range: 115, arc: 1.2, max: 4 }, status: { knock: 2 } },
  bow: { name: "Лук", shot: "thorn_bow", cd: 560, atk: { kind: "line", range: 270, width: 16, max: 2 }, status: { kind: "bleed", dpsPct: 10, dur: 3 } },
  axe: { name: "Секира", shot: "war_axe", cd: 640, atk: { kind: "arc", range: 125, arc: 1.4, max: 5 }, status: { knock: 4 } },
  fly_blades: { name: "Лапки-лезвия", shot: "fly_blades", cd: 360, atk: { kind: "proj", range: 220, width: 22 }, status: { kind: "bleed", dpsPct: 14, dur: 2.5 } },
  moon_blade: { name: "Лунный клинок", shot: "chain_bolt", cd: 480, atk: { kind: "arc", range: 135, arc: 1.3, max: 4 }, status: { slow: true, knock: 1 } },
};
export const ITEM_WTYPE: Record<string, string> = { fly_blades: "fly_blades", violet_moon_blade: "moon_blade", greenpoise_bow: "bow", guard_axe: "axe", aezer_staff: "staff" };
export const CLASS_WTYPE: Record<string, string> = { spearman: "spear", rogue: "daggers", mage: "book", warrior: "sword" };
export function weaponType(itemId: string | null | undefined, cls: string | null | undefined): string {
  return (itemId && ITEM_WTYPE[itemId]) || (cls && CLASS_WTYPE[cls]) || "book";
}

export const GATHER_RANGE = 75;
export const GATHER_TIME_MS = 1100;
export const ZONE_ATTACK_RANGE = 230;
export const ZONE_ATTACK_CD_MS = 450;
export const ZONE_RESPAWN = { x: 300, y: 600 };

// ---------------- NPC ----------------
export const NPCS: Record<string, { name: string; title: string; world: string; x: number; y: number; color: string; role: string }> = {
  alzi: { name: "Алзи", title: "Создатель Мэлвелдила", world: "arinar", x: 470, y: 560, color: "#fde68a", role: "story" },
  leyr: { name: "Лэйр", title: "Хозяйка лугов Мэлвелдила", world: "arinar", x: 380, y: 680, color: "#f9a8d4", role: "story" },
  petr: { name: "Петр", title: "Распаковщик архивов · ремесло", world: "hellfire", x: 420, y: 760, color: "#fbbf24", role: "craft" },
  kyut: { name: "Кьют", title: "Испытание отражений (дуэли)", world: "hellfire", x: 780, y: 760, color: "#f472b6", role: "arena" },
};
export const NPC_RANGE = 95;

// ---------------- мини-игры хаба (комнаты, как у забегов) ----------------
export const MINIGAMES: Record<string, { id: string; name: string; desc: string; maxPlayers: number; color: string }> = {
  duel: { id: "duel", name: "Испытание отражений", desc: "1×1 в реальном времени. Нет соперника — выйдет манекен Кьют.", maxPlayers: 2, color: "#f472b6" },
  trial: { id: "trial", name: "Испытание Обители", desc: "Защитите Сердце Обители от 8 волн.", maxPlayers: 4, color: "#fbbf24" },
};

// ---------------- награды: правило односторонней синхронизации ----------------
// В забег/мини-игру ИЗ профиля идут: выбранный герой, его уровень, таланты, экипировка (фикс. статы),
// раскладка навыков с Сиянием, ветка души. ОБРАТНО не идёт ничего, кроме явной награды, которую сервер
// считает сам: опыт героя (время ограничено реальным временем по часам сервера), броски дропа по
// трофеям убитых монстров (число бросков ограничено) и прогресс квестов. Уровни, оружие и пассивки
// забега в профиль не пишутся никогда.
export const REWARD_RULES = {
  runXpPerMinute: 30, runXpPerKill: 0.3, runMaxKillsPerSecond: 5, runMaxLootRolls: 40, runMaxXp: 900,
  duel: { winXp: 40, lossXp: 12 }, trial: { perWaveXp: 12, maxWaves: 8 },
};
