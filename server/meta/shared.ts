// «Проклятые»: КЛИЕНТОБЕЗОПАСНЫЕ общие определения (сервер + клиент): герои, таланты, навыки, Сияние,
// материалы, редкости, слоты, типы оружия, NPC, публичные данные мобов. Здесь НЕТ предметов, снаряжения
// мобов и шансов дропа — они живут только на сервере (defs.ts / library.ts / D1 item_library), и клиент
// получает карточки предметов от сервера лишь для открытых в «Библиотеке предметов».
//
// Модель хранения:
//  • герой (warrior/spearman/rogue/mage) качается ОТДЕЛЬНО: уровень, опыт, очки талантов, таланты,
//    навыки и их Сияние, раскладка навыков, надетая экипировка (5 слотов) — всё своё у каждого героя;
//  • аккаунт: общая сумка предметов и материалы, кошелёк звёзд, очки Создания и ветка души,
//    сюжет/квесты, бестиарий. Баланс и капы — docs/MORRISCURSE-BALANCE.md.

import { BM_SKILLS } from "./blackArt";
import { xpNeed } from "./balance";
import { cityNpcDefs } from "./cityBuild";
import { MOBS_PUBLIC_ALL } from "./biomes";
import { MOBS_PUBLIC, MONSTER_ABILITIES, MOB_RESOURCES, type MobPublic } from "./generated/public";

export const HERO_IDS = ["warrior", "spearman", "rogue", "mage"] as const;
export type HeroId = (typeof HERO_IDS)[number];
export const HERO_NAMES: Record<string, string> = { warrior: "Велес", spearman: "Нофорд", rogue: "Кавега", mage: "Мариэль" };

// ---------------- уровень класса → очки талантов ----------------
export const HERO_MAX_LEVEL = 30;
export function heroXpNeed(level: number): number { return xpNeed(level); } // кривая — balance.ts
export function talentPointsForLevel(level: number): number { return Math.max(0, Math.min(HERO_MAX_LEVEL, level) - 1); }
export function abilitySlots(level: number): number { return level >= 5 ? 3 : 2; }
export function heroLevelHp(level: number): number { return (Math.min(HERO_MAX_LEVEL, level) - 1) * 2; }

// ---------------- статы и капы (баланс: никаких «богов») ----------------
export type StatKey = "hp" | "armor" | "dmgPct" | "speedPct" | "regen" | "magnetPct" | "cdrPct" | "critPct" | "lifestealPct" | "atkSpeedPct" | "revive";
// Жёсткие капы итоговых значений после всех источников (таланты + предметы + сияние + душа)
export const STAT_CAPS: Record<string, number> = {
  critPct: 55, cdrPct: 40, lifestealPct: 12, atkSpeedPct: 55, speedPct: 35, magnetPct: 120, dmgPct: 100, regen: 8, damageReduction: 0.72, armorPenPct: 40, armorPen: 90,
};
// Убывающая отдача: эффективное = cap * (1 - exp(-raw / cap)) — первые очки почти 1:1, дальше всё меньше.
export function softCap(raw: number, cap: number): number {
  if (raw <= 0) return raw;
  return cap * (1 - Math.exp(-raw / cap));
}
// Броня → снижение урона с убывающей отдачей, кап 60%
export function armorToReduction(armor: number): number {
  if (armor <= 0) return 0;
  // Крупная шкала брони (v2): константа 250, чтобы танк-шмот давал ощутимый DR, не упираясь в кап сразу
  return Math.min(STAT_CAPS.damageReduction, armor / (armor + 250));
}

// ---------------- деревья талантов классов (у каждого — своё) ----------------
// Узлы: stat — пассивные ранги; active — открывает активный навык класса (кроме стартового legacy, он бесплатен);
// mod — меняет навык класса (свойство t_* в props навыка и/или ±% силы/перезарядки); keystone — выбор «одно из двух» (excl).
// Раскладка: tier = ряд (1..5, сверху вниз), col = колонка 0..4. req — все перечисленные узлы должны быть изучены.
// Всё проверяет сервер (profile.ts → learnTalent): очки, порог яруса, пререквизиты, взаимоисключение ключевых узлов.
export type TalentKind = "stat" | "active" | "mod" | "keystone";
export interface TalentMod { ability: string; prop?: string; powerPct?: number; cdPct?: number }
export interface TalentDef {
  id: string; name: string; icon: string; desc: string; tier: 1 | 2 | 3 | 4 | 5; col: number; max: number;
  per: Partial<Record<StatKey, number>>; req?: string[]; kind: TalentKind; grants?: string; mod?: TalentMod; excl?: string; branch?: string;
}
export const TALENT_TIER_REQ: Record<number, number> = { 1: 0, 2: 3, 3: 7, 4: 12, 5: 18 }; // очков вложено в дерево до яруса
export const TALENT_VERSION = 2; // 1 = старое общее дерево (сброс с возвратом очков при загрузке)
type N = Omit<TalentDef, "id" | "kind" | "per" | "max"> & { kind?: TalentKind; per?: TalentDef["per"]; max?: number };
function classTree(cls: string, branches: string[], nodes: Record<string, N>): TalentDef[] {
  const out: TalentDef[] = [];
  for (const [key, n] of Object.entries(nodes)) {
    out.push({ kind: "stat", per: {}, max: 1, ...n, id: `${cls}.${key}`, req: n.req?.map((r) => `${cls}.${r}`), excl: n.excl ? `${cls}.${n.excl}` : undefined, branch: n.branch || branches[Math.min(branches.length - 1, Math.floor(n.col * branches.length / 5))] });
  }
  return out;
}
export const TALENT_BRANCHES: Record<string, string[]> = {
  warrior: ["Бастион", "Клинки", "Вихрь стали"],
  spearman: ["Протокол", "Копьё", "Слежка"],
  rogue: ["Сажа", "Кинжалы", "Нулевой день"],
  mage: ["Лёд", "Пламя", "Эфир"],
};
export const TALENTS: Record<string, TalentDef[]> = {
  // Страж Вайт: щиты слева, клинки удара в спину по центру, вращающиеся топоры справа
  warrior: classTree("warrior", TALENT_BRANCHES.warrior, {
    vit: { name: "Живучесть стража", icon: "❤️", desc: "+6 макс. здоровья", tier: 1, col: 0, max: 5, per: { hp: 6 } },
    might: { name: "Тяжесть Стража", icon: "💪", desc: "+3% урона", tier: 1, col: 2, max: 5, per: { dmgPct: 3 } },
    ward: { name: "Закалка", icon: "🛡️", desc: "+2 брони", tier: 1, col: 4, max: 5, per: { armor: 2 } },
    shield_wall: { kind: "active", grants: "shield_wall", name: "Стена щитов", icon: "🛡️", desc: "Открывает навык «Стена щитов»", tier: 2, col: 0, req: ["vit"] },
    fan: { kind: "mod", mod: { ability: "backstab", prop: "t_fan" }, name: "Веер клинков", icon: "🗡️", desc: "Удар в спину: 14 клинков вместо 10", tier: 2, col: 2, req: ["might"] },
    whirlwind: { kind: "active", grants: "whirlwind", name: "Вихрь стали", icon: "🌪️", desc: "Открывает навык «Вихрь стали»", tier: 2, col: 4, req: ["ward"] },
    bulwark: { kind: "mod", mod: { ability: "shield_wall", prop: "t_reflect" }, name: "Отражение", icon: "🔰", desc: "Стена щитов: +1 с, ударная волна ×2 урона", tier: 3, col: 0, req: ["shield_wall"] },
    crit: { name: "Удар без промаха", icon: "🎯", desc: "+2% шанс крита", tier: 3, col: 2, max: 5, per: { critPct: 2 }, req: ["fan"] },
    axes: { kind: "mod", mod: { ability: "whirlwind", prop: "t_axes6" }, name: "Шесть топоров", icon: "🪓", desc: "Вихрь стали: 6 топоров вместо 4", tier: 3, col: 4, req: ["whirlwind"] },
    iron: { kind: "keystone", excl: "fury", name: "Железная клятва", icon: "⛓️", desc: "+10 брони, +20 здоровья, −6% скорости", tier: 4, col: 1, per: { armor: 10, hp: 20, speedPct: -6 } },
    fury: { kind: "keystone", excl: "iron", name: "Ярость Вайт", icon: "🔥", desc: "+12% урона, +2% вампиризма, −8 брони", tier: 4, col: 3, per: { dmgPct: 12, lifestealPct: 2, armor: -8 } },
    regen: { name: "Кровь бессмертных", icon: "🌿", desc: "+0.2 HP/с", tier: 4, col: 0, max: 4, per: { regen: 0.2 }, req: ["bulwark"] },
    haste: { name: "Ритм боя", icon: "⏱️", desc: "+3% скорость атаки", tier: 4, col: 4, max: 4, per: { atkSpeedPct: 3 }, req: ["axes"] },
    oath: { name: "Клятва Вайт", icon: "🕯️", desc: "Раз за забег/бой встать с 40% HP", tier: 5, col: 2, per: { revive: 1 }, req: ["crit"] },
    echo: { kind: "keystone", excl: "unbroken", mod: { ability: "backstab", cdPct: -25 }, name: "Эхо клинков", icon: "🌀", desc: "Удар в спину: −25% перезарядки", tier: 5, col: 1 },
    unbroken: { kind: "keystone", excl: "echo", mod: { ability: "shield_wall", cdPct: -30, powerPct: 20 }, name: "Нерушимый", icon: "🏰", desc: "Стена щитов: −30% перезарядки, +20% силы", tier: 5, col: 3 },
  }),
  // Детектив Гринпойс: протокол (защита/перезарядка) слева, копьё по центру, слежка (сбор/дождь копий) справа
  spearman: classTree("spearman", TALENT_BRANCHES.spearman, {
    vest: { name: "Кожаный жилет", icon: "🧥", desc: "+2 брони", tier: 1, col: 0, max: 5, per: { armor: 2 } },
    grip: { name: "Хватка детектива", icon: "✊", desc: "+3% урона", tier: 1, col: 2, max: 5, per: { dmgPct: 3 } },
    clue: { name: "Чутьё на улики", icon: "🔎", desc: "+8% радиус сбора", tier: 1, col: 4, max: 3, per: { magnetPct: 8 } },
    focus: { name: "Протокол", icon: "📋", desc: "−3% перезарядки навыков", tier: 2, col: 0, max: 5, per: { cdrPct: 3 }, req: ["vest"] },
    twin: { kind: "mod", mod: { ability: "pierce", prop: "t_twin" }, name: "Двойной выпад", icon: "🔱", desc: "Колющий удар: два копья веером", tier: 2, col: 2, req: ["grip"] },
    spear_rain: { kind: "active", grants: "spear_rain", name: "Дождь копий", icon: "☔", desc: "Открывает навык «Дождь копий»", tier: 2, col: 4, req: ["clue"] },
    leap_strike: { kind: "active", grants: "leap_strike", name: "Прыжок детектива", icon: "🦘", desc: "Открывает навык «Прыжок детектива»", tier: 3, col: 0, req: ["focus"] },
    precise: { name: "Точный выпад", icon: "🎯", desc: "+2% шанс крита", tier: 3, col: 2, max: 5, per: { critPct: 2 }, req: ["twin"] },
    storm: { kind: "mod", mod: { ability: "spear_rain", prop: "t_storm" }, name: "Ливень улик", icon: "🌧️", desc: "Дождь копий: 26 копий вместо 18", tier: 3, col: 4, req: ["spear_rain"] },
    quake: { kind: "mod", mod: { ability: "leap_strike", prop: "t_quake" }, name: "Сотрясение", icon: "💥", desc: "Прыжок: радиус приземления ×1.5, враги замедлены", tier: 4, col: 0, req: ["leap_strike"] },
    hunter: { kind: "keystone", excl: "patrol", name: "Охотник", icon: "🏹", desc: "+6% крита, +5% урона", tier: 3, col: 1, per: { critPct: 6, dmgPct: 5 } },
    patrol: { kind: "keystone", excl: "hunter", name: "Патрульный", icon: "🚨", desc: "+8% скорости, +30% сбора, +0.3 HP/с", tier: 3, col: 3, per: { speedPct: 8, magnetPct: 30, regen: 0.3 } },
    swift: { name: "Лёгкий шаг", icon: "👟", desc: "+3% скорости", tier: 4, col: 4, max: 4, per: { speedPct: 3 }, req: ["storm"] },
    second: { name: "Второй шанс", icon: "🕯️", desc: "Раз за забег/бой встать с 40% HP", tier: 4, col: 2, per: { revive: 1 }, req: ["precise"] },
    impale: { kind: "keystone", excl: "barrage", mod: { ability: "pierce", cdPct: -30 }, name: "Пригвоздить", icon: "📌", desc: "Колющий удар: −30% перезарядки", tier: 5, col: 1 },
    barrage: { kind: "keystone", excl: "impale", mod: { ability: "spear_rain", powerPct: 40 }, name: "Шквал", icon: "🌩️", desc: "Дождь копий: +40% урона", tier: 5, col: 3 },
    manhunt: { name: "Розыск", icon: "🗂️", desc: "+3% урона, +1% крита", tier: 5, col: 2, max: 3, per: { dmgPct: 3, critPct: 1 }, req: ["second"] },
    stub: { name: "Упрямство Гринпойса", icon: "🌿", desc: "+0.2 HP/с", tier: 4, col: 3, max: 4, per: { regen: 0.2 }, req: ["storm"] },
  }),
  // Кавега: сажа (уклонение) слева, ядовитые кинжалы по центру, огненный рывок нулевого дня справа
  rogue: classTree("rogue", TALENT_BRANCHES.rogue, {
    agile: { name: "Плащ из сажи", icon: "🧥", desc: "+3% скорости", tier: 1, col: 0, max: 4, per: { speedPct: 3 } },
    ember: { name: "Пламя нулевого дня", icon: "🔥", desc: "+3% урона", tier: 1, col: 2, max: 5, per: { dmgPct: 3 } },
    cold: { name: "Холодный расчёт", icon: "🎯", desc: "+2% шанс крита", tier: 1, col: 4, max: 5, per: { critPct: 2 } },
    smoke_bomb: { kind: "active", grants: "smoke_bomb", name: "Сажа печи", icon: "💨", desc: "Открывает навык «Сажа печи»", tier: 2, col: 0, req: ["agile"] },
    venom: { kind: "mod", mod: { ability: "trick_strike", prop: "t_poison" }, name: "Ядовитые кинжалы", icon: "🧪", desc: "Коварный удар: кинжалы отравляют (урон 4 с)", tier: 2, col: 2, req: ["ember"] },
    rhythm: { name: "Ритм печи", icon: "⏱️", desc: "+3% скорость атаки", tier: 2, col: 4, max: 4, per: { atkSpeedPct: 3 }, req: ["cold"] },
    choke: { kind: "mod", mod: { ability: "smoke_bomb", prop: "t_choke" }, name: "Чадящая печь", icon: "🌫️", desc: "Сажа печи: облако +1.5 с и жжёт врагов", tier: 3, col: 0, req: ["smoke_bomb"] },
    leech: { name: "Тлеющие угли", icon: "🩸", desc: "+1% вампиризма", tier: 4, col: 2, max: 3, per: { lifestealPct: 1 }, req: ["venom"] },
    shadow_step: { kind: "active", grants: "shadow_step", name: "Рывок нулевого дня", icon: "☄️", desc: "Открывает навык «Рывок нулевого дня»", tier: 3, col: 4, req: ["rhythm"] },
    soot: { name: "Сажевая кожа", icon: "❤️", desc: "+6 макс. здоровья", tier: 4, col: 0, max: 4, per: { hp: 6 }, req: ["choke"] },
    ghost: { kind: "keystone", excl: "cuts", name: "Призрак сажи", icon: "👻", desc: "+10% скорости, +4 брони", tier: 3, col: 1, per: { speedPct: 10, armor: 4 } },
    cuts: { kind: "keystone", excl: "ghost", name: "Тысяча порезов", icon: "✂️", desc: "+6% крита, +6% скорости атаки", tier: 3, col: 3, per: { critPct: 6, atkSpeedPct: 6 } },
    trail: { kind: "mod", mod: { ability: "shadow_step", prop: "t_trail" }, name: "Огненный след", icon: "🔥", desc: "Рывок нулевого дня: след взрывается второй раз", tier: 4, col: 4, req: ["shadow_step"] },
    ashes: { name: "Пепел возрождается", icon: "🕯️", desc: "Раз за забег/бой встать с 40% HP", tier: 5, col: 2, per: { revive: 1 }, req: ["leech"] },
    fan24: { kind: "keystone", excl: "double", mod: { ability: "trick_strike", prop: "t_fan24" }, name: "Веер ножей", icon: "🗡️", desc: "Коварный удар: 24 кинжала вместо 16", tier: 5, col: 0 },
    double: { kind: "keystone", excl: "fan24", mod: { ability: "trick_strike", prop: "t_double" }, name: "Двойной вихрь", icon: "🌀", desc: "Коварный удар: второй вихрь через 0.4 с", tier: 5, col: 4 },
  }),
  // Мариэль/Аезер: лёд слева, огненный шар по центру, эфир и метеор справа
  mage: classTree("mage", TALENT_BRANCHES.mage, {
    coat: { name: "Белый мундир", icon: "🧥", desc: "+2 брони", tier: 1, col: 0, max: 5, per: { armor: 2 } },
    ether: { name: "Эфир Аезера", icon: "✨", desc: "+3% урона", tier: 1, col: 2, max: 5, per: { dmgPct: 3 } },
    mind: { name: "Острый ум", icon: "🎯", desc: "+2% шанс крита", tier: 1, col: 4, max: 5, per: { critPct: 2 } },
    frost_nova: { kind: "active", grants: "frost_nova", name: "Морозная звезда", icon: "❄️", desc: "Открывает навык «Морозная звезда»", tier: 2, col: 0, req: ["coat"] },
    split: { kind: "mod", mod: { ability: "fireball", prop: "t_split3" }, name: "Тройной шар", icon: "☄️", desc: "Огненный шар раскалывается на 3 (каждый — 55% взрыва)", tier: 2, col: 2, req: ["ether"] },
    quiet: { name: "Библиотечная тишина", icon: "📚", desc: "−3% перезарядки навыков", tier: 2, col: 4, max: 5, per: { cdrPct: 3 }, req: ["mind"] },
    deep: { kind: "mod", mod: { ability: "frost_nova", prop: "t_deep" }, name: "Глубокая стужа", icon: "🧊", desc: "Морозная звезда: 28 осколков, заморозка 3 с", tier: 3, col: 0, req: ["frost_nova"] },
    violet: { name: "Фиолетовое пламя", icon: "🌿", desc: "+0.2 HP/с", tier: 3, col: 2, max: 4, per: { regen: 0.2 }, req: ["split"] },
    meteor: { kind: "active", grants: "meteor", name: "Метеор Аезера", icon: "🌠", desc: "Открывает навык «Метеор Аезера»", tier: 3, col: 4, req: ["quiet"] },
    vit: { name: "Чернильная стойкость", icon: "❤️", desc: "+6 макс. здоровья", tier: 4, col: 0, max: 4, per: { hp: 6 }, req: ["deep"] },
    pyro: { kind: "keystone", excl: "cryo", mod: { ability: "fireball", powerPct: 35 }, name: "Пиромант", icon: "🔥", desc: "Огненный шар: +35% урона", tier: 4, col: 1 },
    cryo: { kind: "keystone", excl: "pyro", mod: { ability: "frost_nova", cdPct: -30 }, name: "Криомант", icon: "❄️", desc: "Морозная звезда: −30% перезарядки", tier: 4, col: 3 },
    shower: { kind: "mod", mod: { ability: "meteor", prop: "t_shower" }, name: "Звездопад Аезера", icon: "🌠", desc: "Метеор: следом падают ещё 2 малых", tier: 4, col: 4, req: ["meteor"] },
    page: { name: "Последняя страница", icon: "🕯️", desc: "Раз за забег/бой встать с 40% HP", tier: 5, col: 2, per: { revive: 1 }, req: ["violet"] },
    glass: { kind: "keystone", excl: "archive", name: "Стеклянная пушка", icon: "💎", desc: "+15% урона, −20 здоровья", tier: 5, col: 0, per: { dmgPct: 15, hp: -20 } },
    archive: { kind: "keystone", excl: "glass", name: "Архивариус", icon: "📜", desc: "+25 здоровья, +0.4 HP/с", tier: 5, col: 4, per: { hp: 25, regen: 0.4 } },
  }),
};
// навык класса → узел дерева, который его открывает
export const ACTIVE_NODE: Record<string, string> = Object.fromEntries(Object.values(TALENTS).flat().filter((t) => t.grants).map((t) => [t.grants!, t.id]));
export const TALENT_BY_ID: Record<string, TalentDef> = Object.fromEntries(Object.values(TALENTS).flat().map((t) => [t.id, t]));

// ---------------- навыки: пул класса + навыки монстров; раскладка 2–3 слота ----------------
export interface AbilityDef {
  id: string; cls: HeroId | "monster" | "artifact"; name: string; icon: string; desc: string;
  cd: number; power: number; unlockLevel: number; legacy?: boolean; base?: string; monster?: string;
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
// навыки монстров из бестиария (base — какая реализация навыка используется в забеге)
for (const a of MONSTER_ABILITIES) if (!ABILITIES_DEF.some((x) => x.id === a.id)) ABILITIES_DEF.push(a);
// навыки артефактов (чёрная магия): тот же единый список навыков — у героя с артефактом, у любого моба, у оружия
for (const a of BM_SKILLS) if (!ABILITIES_DEF.some((x) => x.id === a.id)) ABILITIES_DEF.push(a as any);
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
  // чёрная магия, этап Б: кусочки чертежа (bp_<стихия>_<тип>) и базовые осколки разбора артефактов — огонь
  bp_fire_handle: { name: "Кусочек чертежа: огненная рукоять", icon: "📜", color: "#ff7a1a" },
  bp_fire_blade: { name: "Кусочек чертежа: огненное лезвие", icon: "📜", color: "#ffa531" },
  bp_fire_blade2: { name: "Кусочек чертежа: второе лезвие", icon: "📜", color: "#e0601a" },
  bp_fire_blade3: { name: "Кусочек чертежа: третье лезвие", icon: "📜", color: "#c2410c" },
  bp_fire_crystal: { name: "Кусочек чертежа: кристалл жара", icon: "📜", color: "#ffe08a" },
  bm_shard_fire: { name: "Осколок огня", icon: "🔸", color: "#ff7a1a" },
};
for (const [k, v] of Object.entries(MOB_RESOURCES)) if (!RESOURCES[k]) RESOURCES[k] = v;

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
export interface ItemStats { dmgMin?: number; dmgMax?: number; armor?: number; hp?: number; speedPct?: number; critPct?: number; regen?: number; cdrPct?: number; magnetPct?: number; lifestealPct?: number; atkSpeedPct?: number; armorPen?: number; armorPenPct?: number }
export interface ItemDef {
  id: string; name: string; slot: string; rarity: string; classes?: HeroId[]; stats: ItemStats; lore: string; icon: string;
  monster?: string; look?: string; grantsAbility?: string; band?: string; // band — зона/полоса силы
  lvl?: number; req?: number; wtype?: string; // уровень предмета (= уровень моба-источника), требуемый уровень героя, тип оружия
  from?: string; part?: string; // копия трофея варианта биома: from — вариант-источник, part — базовый предмет комплекта
}

// Тип оружия героя в открытом мире: визуал выстрела (спрайт FX atlas v2 у клиента) и статус (сервер-авторитет).
// dpsPct — урон по времени в % от удара в секунду (не стакается: держится сильнейший), dur — сек.
// atk — форма удара по клику: proj — первый моб на луче, line — пронзает до max, arc — дуга ±arc рад до max целей.
// cd — базовая перезарядка удара (мс), делится на (1 + скорость атаки %/100); удержание ЛКМ повторяет удар с этим темпом.
// Вторичные цели line/arc получают 70%/80% урона. knock — отбрасывание (px-импульс; боссы иммунны, элита ×0.5), slow — замедление на 1.2 с.
// count/spread/per — залп: count снарядов веером на угол spread (рад), каждый наносит per × урона.
// per подобран так, что «все снаряды в одну цель» ≈ ×1.1–1.2 одиночного выстрела (на дистанции попадает меньше,
// зато веер цепляет пачку) — DPS сбалансирован. Всё считает сервер (service.zoneAttack / pvp.attack).
export interface WeaponAtk { kind: "proj" | "line" | "arc"; range: number; width?: number; arc?: number; max?: number; count?: number; spread?: number; per?: number }
// Статусы (поджог/кровотечение/яд/замедление) у ТИПА оружия больше не задаются — только чертами конкретного предмета в админке;
// у типа осталось лишь отбрасывание (реакция на удар).
export interface WeaponTypeDef { name: string; shot: string; cd: number; atk: WeaponAtk; status: { kind?: string; dpsPct?: number; dur?: number; slow?: boolean; knock?: number } }
export const WEAPON_TYPES: Record<string, WeaponTypeDef> = {
  spear: { name: "Копьё", shot: "spear", cd: 520, atk: { kind: "line", range: 200, width: 22, max: 3 }, status: { knock: 2.5 } },
  daggers: { name: "Кинжалы", shot: "daggers", cd: 340, atk: { kind: "proj", range: 200, width: 18, count: 2, spread: 0.16, per: 0.56 }, status: {} },
  book: { name: "Гримуар", shot: "soul_spark", cd: 450, atk: { kind: "proj", range: 230, width: 22 }, status: {} },
  staff: { name: "Посох", shot: "staff_bolt", cd: 560, atk: { kind: "proj", range: 240, width: 24 }, status: {} },
  sword: { name: "Меч", shot: "ab_backstab", cd: 480, atk: { kind: "arc", range: 115, arc: 1.2, max: 4 }, status: { knock: 2 } },
  bow: { name: "Лук", shot: "thorn_bow", cd: 560, atk: { kind: "line", range: 270, width: 16, max: 2 }, status: {} },
  axe: { name: "Секира", shot: "war_axe", cd: 640, atk: { kind: "arc", range: 125, arc: 1.4, max: 5 }, status: { knock: 4 } },
  fly_blades: { name: "Лапки-лезвия", shot: "fly_blades", cd: 360, atk: { kind: "proj", range: 220, width: 16, count: 5, spread: 0.7, per: 0.24 }, status: {} },
  moon_blade: { name: "Лунный клинок", shot: "chain_bolt", cd: 480, atk: { kind: "arc", range: 135, arc: 1.3, max: 4 }, status: { knock: 1 } },
};
/** Направления снарядов залпа (единичные векторы) — одинаково на сервере и клиенте. */
export function volleyDirs(atk: WeaponAtk, dx: number, dy: number): [number, number][] {
  const n = atk.kind === "proj" ? Math.max(1, atk.count || 1) : 1;
  if (n === 1) return [[dx, dy]];
  const a0 = Math.atan2(dy, dx), sp = atk.spread || 0.3, out: [number, number][] = [];
  for (let k = 0; k < n; k++) { const a = a0 + sp * (k / (n - 1) - 0.5); out.push([Math.cos(a), Math.sin(a)]); }
  return out;
}
export const CLASS_WTYPE: Record<string, string> = { spearman: "spear", rogue: "daggers", mage: "book", warrior: "sword" };
export const GATHER_RANGE = 75;
export const GATHER_TIME_MS = 1100;
export const ZONE_ATTACK_RANGE = 230;
export const ZONE_ATTACK_CD_MS = 450;
export const ZONE_RESPAWN = { x: 24000, y: 24150 }; // центральный хаб Аринара (worlds/sizes.ts ARINAR_HUB)

// ---------------- NPC ----------------
// mobile — НПС без постоянной точки (Чёрный маг: blackMage.ts, позиция только с сервера): не входит в раскладку мира,
// безопасные зоны, коллизии и бродилку NpcWander; x/y — заглушка далеко за картой (до первого zone_state)
export const NPCS: Record<string, { name: string; title: string; world: string; x: number; y: number; color: string; role: string; mobile?: boolean }> = {
  alzi: { name: "Алзи", title: "Создатель Мэлвелдила", world: "arinar", x: 24160, y: 23880, color: "#fde68a", role: "story" },
  leyr: { name: "Лэйр", title: "Хозяйка лугов Мэлвелдила", world: "arinar", x: 23850, y: 24200, color: "#f9a8d4", role: "story" },
  petr: { name: "Петр", title: "Распаковщик архивов · ремесло", world: "hellfire", x: 420, y: 760, color: "#fbbf24", role: "craft" },
  kyut: { name: "Кьют", title: "Испытание отражений (дуэли)", world: "hellfire", x: 780, y: 760, color: "#f472b6", role: "arena" },
  black_mage: { name: "Чёрный маг", title: "???", world: "arinar", x: -100000, y: -100000, color: "#a78bfa", role: "story", mobile: true },
  ...cityNpcDefs(), // места NPC города Альказак (city_1…12): «мобильные» (не в раскладке); выключенное место — world '-'
};
/** НПС с постоянной точкой (раскладка, коллизии, безопасные зоны) — без «мобильных» */
export const STATIC_NPCS = Object.fromEntries(Object.entries(NPCS).filter(([, n]) => !n.mobile)) as typeof NPCS;
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
  // опыт забега ГЕРОЮ — в «мобах уровня героя» (× balance.mobXp(lvl)): 2 в минуту + 0.01 за убийство, потолок 15 минут
  // (≤ ~38 убийств-эквивалентов за забег: уровни забега быстрые, но героя они почти не качают)
  runXpPerMinute: 2, runXpPerKill: 0.01, runMaxMinutes: 15, runMaxKillsPerSecond: 5, runMaxLootRolls: 40,
  duel: { winXp: 40, lossXp: 12, minWinSec: 3 }, trial: { perWaveXp: 12, maxWaves: 8 },
};


// публичные данные мобов (имя, уровень, роль, размер, описание) — для клиента; порядок = индекс в zone_state
export const MOB_INFO: Record<string, MobPublic> = MOBS_PUBLIC_ALL as any; // + варианты биомов (biomes.ts)
export type { MobPublic };

// ---------------- навыки забега («Вампир-лайк»): пул аккаунта ----------------
// Трофей открытого мира: редкое оружие с монстров несёт навык забега (бросок на сервере). Открытый навык
// попадает в пул аккаунта (account.runSkills), один выбранный (account.runSkillSel) герой берёт в забег
// бесплатно — он не занимает 4 слота оружия улучшений. Ид. совпадают с WEAPONS забега (survivors/data.js).
export const RUN_SKILLS: { id: string; name: string; icon: string; desc: string }[] = [
  { id: "war_axe", name: "Метательный топор", icon: "🪓", desc: "Вращающиеся топоры летят и возвращаются, пронзая всех." },
  { id: "spear", name: "Копьё", icon: "🔱", desc: "Быстрые копья к ближайшему врагу, пронзают нескольких." },
  { id: "daggers", name: "Кинжалы", icon: "🗡️", desc: "Веер кинжалов по направлению взгляда." },
  { id: "fire_spark", name: "Огненные искры", icon: "🔥", desc: "Огненные снаряды взрываются при попадании." },
  { id: "orbit_skulls", name: "Кольцо черепов", icon: "💀", desc: "Черепа-снаряды кружат вокруг героя." },
  { id: "chain_bolt", name: "Цепная молния", icon: "⚡", desc: "Разряд перескакивает между врагами." },
  { id: "ice_fan", name: "Ледяной веер", icon: "❄️", desc: "Широкий веер ледяных осколков замедляет врагов." },
  { id: "thorn_bow", name: "Терновый лук", icon: "🏹", desc: "Быстрые стрелы прошивают ряд врагов и вызывают кровотечение." },
  { id: "moon_orb", name: "Лунный рикошет", icon: "🌕", desc: "Сфера отскакивает от врага к врагу и от стен арены." },
  { id: "glyph_mine", name: "Глифы-ловушки", icon: "🔯", desc: "Глифы на земле взрываются под врагами и отбрасывают их." },
  { id: "sun_beam", name: "Солнечный луч", icon: "☀️", desc: "Жгучий луч к ближайшему врагу: урон всем на линии и горение." },
  { id: "split_shard", name: "Раскалывающийся кристалл", icon: "💎", desc: "При попадании кристалл раскалывается на осколки веером." },
  { id: "plague_flask", name: "Чумная склянка", icon: "🧪", desc: "Ядовитое облако: урон по площади и отравление." },
  { id: "fly_blades", name: "Летучие клинки", icon: "🌀", desc: "Клинки сами находят цель, режут насквозь и пускают кровь." },
];
export const RUN_SKILL_BY_ID: Record<string, (typeof RUN_SKILLS)[number]> = Object.fromEntries(RUN_SKILLS.map((r) => [r.id, r]));
// шанс, что выпавшее с монстра ОРУЖИЕ несёт навык забега (%, за предмет): обычный / редкий / босс
export const RUN_SKILL_DROP_PCT = { mob: 2, rare: 8, boss: 20 };
