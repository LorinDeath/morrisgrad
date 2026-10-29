import { BMM_CFG, BM_BODY, BM_MOBS, BM_CAMPS, BODY_SLOTS, BM_CLASSES, CUSTOM_BB, CUSTOM_BM, CUSTOM_BC, makeBody, makeMob, makeCamp, cleanDrops, cleanCampMobs, mobErr, registerBlackMobs, BM_BUILTIN } from "./blackMobs";
import { BMA_CFG, BM_PARTS, BM_SKILL_IDS, BP_TYPES, BP_ELEMS, CUSTOM_BP, makeBpart } from "./blackArt";
import { rsOptions, SKILL_REGISTRY } from "./rsAny";
import { initZoneNames } from "./mapZones";
import { DASH_CFG } from "./dash";
import { GATHER_CFG } from "./gatherCfg";
import { UI_CFG } from "./uiCfg";
import { TERRAIN_CFG } from "./terrainCfg";
import { NPC_CFG } from "./npcWander";
import { BM_CFG } from "./bmCfg";
import { LIGHT_CFG } from "./lightCfg";
import { DN_CFG } from "./dayNight";
import { CITY_CFG, PK_CFG, POS_CFG, CITY_SLOTS, CITY_LOOKS, CENTERPIECES } from "./city";
import { BUILD_DEF, ROOMS } from "./cityBuild";
import { GFX_CFG, LIGHT_TYPES, EMIT_KEYS } from "./gfxCfg";
import { mobSkillOptions } from "./mobSkills";
// «Проклятые»: правки игровых данных из админ-панели — общая часть сервера и клиента (без D1).
// Схема полей (тип, диапазон) — ЕДИНСТВЕННЫЙ список того, что можно менять; патч вне схемы отклоняется.
// apply() восстанавливает исходное значение из кода и накладывает патч — повторное применение идемпотентно.
// Черты (traits) — эффекты в духе RPG Maker MZ «Traits/Effects»: поджог, кровотечение, яд, заморозка, замедление,
// отбрасывание, вампиризм — с параметрами; вешаются на оружие (тип), предмет и навык; применяет сервер при попадании.
import { ZONE_MOBS, WEAPON_TYPES, ITEM_BY_ID, ABILITY_BY_ID, MONSTER_LOOT, RESOURCES, salvageDefault } from "./defs";
import { RUN_SKILLS, HERO_NAMES } from "./shared";
import { MOB_SKILLS_LIST } from "./mobSkills";
import { ZONE_GEN, BOSS_TIMERS, WORLD_GEN } from "./zoneGen";
import { CURSE } from "./cursed";
import { ENCH, ENCH_N } from "./enchant";
// шанс проклятого моба, % — живёт в ZONE_GEN.cursedPct (там его читают зона и тесты); правится во вкладке «☠ Проклятие» (curse.cursedPct)
if (!Object.getOwnPropertyDescriptor(CURSE, "cursedPct")) Object.defineProperty(CURSE, "cursedPct", { get: () => ZONE_GEN.cursedPct, set: (v: number) => { ZONE_GEN.cursedPct = v; }, enumerable: true });
import { CHEST } from "./chests";
import { BCHEST, BC_TIERS, BC_RANKS, BC_CATS, BC_CAT_NAMES, BC_RARS, BC_ART, BC_ENCH_CAP, BC_CURSE_MAX, bchestErr, bcSpecErr, bcSpecNorm, QDEF_NAMES } from "./boardChestCfg";
import { RARITIES as RAR_NAMES } from "./shared";
import { UPG, UPG_ORDER } from "./upgrade";
import { prepXp, prepAllXp, BOARD_CFG, BTASKS, GIVERS, GIVER_NAMES, CATS, CAT_NAMES, isEnchFlag, syncBoardCols, NPC_GIVERS, CUSTOM_BT, BT_CATS_NEW, BT_EVS, BT_STATES, BT_ROLE_NAMES, ROOM_NAMES, makeBtask, delBtask, RANKS, RANK_CATS, BONUS_NAMES, reindexBtasks, type Cat } from "./board";
import { BIOMES } from "./biomes";
import { RECIPES, HERO_IDS } from "./defs";
import { WORLD_NAMES } from "./mobHome";

export type Kind = "bchest" | "mob" | "weapon" | "item" | "skill" | "loot" | "spawn" | "boss" | "rare" | "region" | "curse" | "chest" | "dash" | "biome" | "upgrade" | "gather" | "npc" | "ench" | "bmage" | "light" | "ui" | "terrain" | "city" | "pk" | "pos" | "dn" | "gfx" | "board" | "btask" | "bmagic" | "bpart" | "bmbody" | "bmmob" | "bmcamp" | "bmmcfg";
export interface Field { path: string; label: string; t: "hdr" | "int" | "num" | "bool" | "enum" | "skills" | "resmap" | "color" | "text" | "ltext" | "chests"; min?: number; max?: number; opts?: string[]; optl?: { id: string; name: string; group: string }[]; optn?: Record<string, string>; h?: string } // h — короткая подсказка (что делает, единицы); диапазон и «по умолчанию» админка допишет сама
export interface TraitParam { k: string; label: string; min: number; max: number; def: number }
export const TRAIT_DEFS: Record<string, { name: string; params: TraitParam[] }> = {
  burn: { name: "Поджог", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 25 }, { k: "dpsPct", label: "Урон/с, % удара", min: 1, max: 200, def: 15 }, { k: "dur", label: "Длит., с", min: 0.5, max: 20, def: 3 }] },
  bleed: { name: "Кровотечение", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 25 }, { k: "dpsPct", label: "Урон/с, % удара", min: 1, max: 200, def: 12 }, { k: "dur", label: "Длит., с", min: 0.5, max: 20, def: 3 }] },
  poison: { name: "Яд", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 20 }, { k: "dpsPct", label: "Урон/с, % удара", min: 1, max: 200, def: 8 }, { k: "dur", label: "Длит., с", min: 0.5, max: 30, def: 6 }] },
  freeze: { name: "Заморозка", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 10 }, { k: "dur", label: "Длит., с", min: 0.2, max: 5, def: 1 }] },
  slow: { name: "Замедление", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 30 }] },
  knock: { name: "Отбрасывание", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 30 }, { k: "power", label: "Сила", min: 0.5, max: 10, def: 2 }] },
  lifesteal: { name: "Вампиризм", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 100 }, { k: "pct", label: "% урона в ОЗ", min: 1, max: 50, def: 5 }] },
};
export interface Trait { k: string; [p: string]: any }

const N = (path: string, label: string, min: number, max: number, t: "int" | "num" = "num"): Field => ({ path, label, t, min, max });
const ST = ["dmgMin", "dmgMax", "armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct", "armorPen", "armorPenPct"];
export const SCHEMA: Record<Kind, { name: string; fields: Field[]; traits?: boolean }> = {
  mob: { name: "Бестиарий", fields: [N("lvl", "Уровень", 1, 60, "int"), N("hp", "ОЗ", 1, Number.MAX_SAFE_INTEGER, "int"), N("dmg", "Урон", 0, 1e5), N("armor", "Броня", 0, 1e4), N("speed", "Скорость", 0, 400), N("aggro", "Агро, px", 0, 2000, "int"), N("xp", "Опыт", 0, 1e6, "int"), N("radius", "Радиус", 4, 200, "int"), { path: "skills", label: "Навыки моба (любые навыки игры, до 5)", t: "skills", optl: mobSkillOptions() },
    { path: "cat", label: "Категория: вкладка Бестиария (игра и сайт) и фильтр админки; пусто — по месту появления", t: "enum", opts: ["", "mob", "elite", "chief", "rare", "boss", "world", "black"], optn: { "": "— по месту появления", mob: "Моб", elite: "Элита", chief: "Вожак", rare: "Редкий", boss: "Босс", world: "Мировой босс" } }] },
  weapon: { name: "Оружие", traits: true, fields: [N("cd", "Перезарядка удара, мс", 100, 5000, "int"), { path: "atk.kind", label: "Форма удара", t: "enum", opts: ["proj", "line", "arc"] }, N("atk.range", "Дальность", 20, 800, "int"), N("atk.width", "Ширина", 4, 200, "int"), N("atk.arc", "Дуга, рад", 0.1, 3.2), N("atk.max", "Целей", 1, 10, "int"), N("atk.count", "Снарядов в залпе", 1, 9, "int"), N("atk.spread", "Веер, рад", 0, 2), N("atk.per", "Урон снаряда, ×", 0.05, 1), N("status.knock", "Отбрасывание", 0, 10),
    { path: "rs", label: "Навык оружия (R) для всего типа — важнее выпавшего (предмет может задать свой)", t: "enum", opts: ["", ...rsOptions().map((r) => r.id)], optl: rsOptions() }] }, // статусы — только чертами предметов
  item: { name: "Предметы", traits: true, fields: [N("lvl", "Ур. предмета", 1, 60, "int"), N("req", "Треб. уровень (надеть)", 1, 60, "int"), ...ST.map((k) => N("stats." + k, k, 0, 1e4)),
    // навык оружия (R): если задан — важнее навыка, выпавшего у экземпляра; «» — как выпало
    { path: "rs", label: "Навык оружия (R), важнее выпавшего — любой навык игры", t: "enum", opts: ["", ...rsOptions().map((r) => r.id)], optl: rsOptions() },
    { path: "salvage", label: "Разбор даёт (ресурс: кол-во)", t: "resmap" }] },
  skill: { name: "Навыки", traits: true, fields: [N("cd", "Перезарядка, с", 0.5, 120), N("power", "Сила, ×", 0.1, 10),
    N("bm.pct", "Только навыки артефактов: урон, % макс. ОЗ цели (основа)", 0, 100), N("bm.k", "Только навыки артефактов: + × «Чёрный урон» героя", 0, 100)] },
  // чёрная магия (blackArt.ts): артефакты-оружие, чёрные статы, мешок крита, заряд
  bmagic: { name: "Чёрная магия: артефакты", fields: [{ path: "on", label: "Артефакты включены", t: "bool" },
    N("critMul", "Крит, × урона", 1, 10), N("bagSize", "Мешочек крита: ударов в мешке", 10, 1000, "int"),
    { path: "_h_cls", label: "Чёрный урон по категориям целей, ×", t: "hdr" },
    ...["mob", "elite", "chief", "rare", "boss", "world"].map((c) => N("classMul." + c, { mob: "Моб", elite: "Элита", chief: "Вожак", rare: "Редкий", boss: "Босс", world: "Мировой босс" }[c]!, 0, 10)),
    { path: "_h_vs", label: "Чёрный урон по игрокам", t: "hdr" },
    N("vsPlayer", "Чёрные мобы и навыки артефактов у мобов по игрокам, ×", 0, 10), N("pvpMul", "PK: чёрный удар игрока по игроку, ×", 0, 10),
    { path: "_h_pure", label: "ICE: чистый урон стихий (% макс. ОЗ АТАКУЮЩЕГО за удар, сверху остального урона)", t: "hdr" },
    N("pureMul.fire", "Чистый огненный урон: глобально, ×", 0, 20), N("pureMul.ice", "Чистый ледяной урон: глобально, ×", 0, 20),
    ...["mob", "elite", "chief", "rare", "boss", "world", "player"].map((c) => N("pureClassMul." + c, "Чистый урон по цели: " + ({ mob: "Моб", elite: "Элита", chief: "Вожак", rare: "Редкий", boss: "Босс", world: "Мировой босс", player: "Игрок" }[c]!) + ", ×", 0, 10)),
    N("pureSkill", "Чистый урон с навыков артефакта (за попадание), ×", 0, 10), N("pureVsPlayer", "Чистый урон по игрокам (PK, дуэли, чёрные мобы), ×", 0, 10),
    N("pureMob", "Чёрные мобы: их чистый урон, ×", 0, 10),
    { path: "pureCrit", label: "Крит умножает и чистый урон", t: "bool" }, { path: "pureArmor", label: "Чистый урон режется чёрной/предельной бронёй цели (выкл — мимо брони)", t: "bool" },
    N("bmMinDmg", "Мин. урон удара по чёрной броне (если удар > 0; 0 — разрешить 0)", 0, 1e6),
    { path: "iceSlow", label: "Ледяные навыки (Ледяной хлыст, Кольцо инея) замедляют", t: "bool" },
    { path: "_h_chg", label: "Заряд и форма удара", t: "hdr" },
    N("chargeMoveMul", "Скорость героя при зарядке, ×", 0.1, 1), N("holdMaxSec", "Заряд сгорает через, с (0 — не сгорает)", 0, 60), N("powerMaxMul", "Мощность: предел размера, ×", 1, 5),
    N("maxRangeTiles", "Дальнее лезвие: макс. дальность, клеток", 1, 40, "int"),
    N("arcMax", "Ближнее лезвие: целей за взмах (все в дуге, до N)", 1, 50, "int"), N("mobRangeMul", "Чёрные мобы: дальность их лезвия, ×", 0.3, 3), N("mobCdMul", "Чёрные мобы: кд удара, × (к рукояти)", 0.2, 5), N("mobAimMs", "Чёрные стрелки: прицел до выстрела, мс", 0, 2000, "int"),
    N("staffSpread", "Посохи: угол между снарядами мульти-выстрела, °", 0, 60), { path: "staffStatsAdd", label: "Посохи во 2/3 слоте: складывать их боевые статы (выкл — у каждого снаряда урон основного)", t: "bool" },
    N("staffRangeTiles", "Посох без своей дальности: дальность, клеток", 1, 40, "int"), N("muzzleScale", "Вылет снаряда из дула посоха: px листа → px мира (0 — из центра)", 0, 2), { path: "staffTest", label: "ТЕСТ: все детали 2-го/3-го лезвия — посохи (до арта Художника)", t: "bool" },
    { path: "_h_misc", label: "Прочее", t: "hdr" },
    N("maxArtifacts", "Артефактов на аккаунт", 1, 300, "int"), { path: "levelGapOff", label: "Разница уровней не режет чёрный урон", t: "bool" },
    { path: "soulToBlack", label: "Проценты души/талантов (+% урона) усиливают чёрный урон", t: "bool" },
    { path: "liveParts", label: "Живой пересчёт частей (выкл — снимок при сборке)", t: "bool" },
    { path: "skillBag", label: "Навыки артефакта тоже тянут крит из мешочка", t: "bool" },
    { path: "_h_caps", label: "Капы чёрных статов (заряд и предельная броня — нижний предел)", t: "hdr" },
    N("caps.force", "Сила атаки, макс. %", 0, 5000), N("caps.power", "Мощность, макс. %", 0, 1000), N("caps.charge", "Скорость заряда, мин. с", 0.05, 10),
    N("caps.bdmg", "Чёрный урон, макс. %", 0, 100), N("caps.barm", "Чёрная броня, макс.", 0, 1e7), N("caps.bcap", "Предельная броня, мин. %", 0, 100), N("caps.bcrit", "Крит, макс. из 100", 0, 100, "int"),
    N("caps.pfire", "Чистый огненный урон, макс. % ОЗ", 0, 100), N("caps.pice", "Чистый ледяной урон, макс. % ОЗ", 0, 100)] },
  bmbody: { name: "Части тела чёрных мобов", fields: [{ path: "name", label: "Название", t: "ltext" }, { path: "slot", label: "Слот (у встроенной не меняется)", t: "enum", opts: [...BODY_SLOTS] },
    { path: "img", label: "Лист Художника (slot_N / ice_slot_N из public/bm-art/body)", t: "text" }, { path: "elem", label: "Стихия", t: "enum", opts: [...BP_ELEMS] },
    N("pfire", "Чистый огненный урон моба, % его ОЗ", 0, 100), N("pice", "Чистый ледяной урон моба, % его ОЗ", 0, 100), { path: "desc", label: "Описание", t: "ltext" }, { path: "hidden", label: "Скрыта (нельзя выбрать)", t: "bool" },
    N("hp", "ОЗ моба, %", -90, 500), N("dmg", "Урон моба, %", -90, 500), N("armor", "Броня моба, +", -1000, 1e5), N("speed", "Скорость моба, %", -90, 300)] },
  bmmob: { name: "Чёрные мобы", fields: [{ path: "name", label: "Имя", t: "ltext" }, { path: "desc", label: "Описание", t: "ltext" },
    { path: "cls", label: "Класс (табличка)", t: "enum", opts: [...BM_CLASSES] }, N("lvl", "Уровень", 1, 60, "int"),
    N("hp", "ОЗ (база)", 1, 1e9, "int"), N("dmg", "Урон (база)", 0, 1e6), N("armor", "Броня (база)", 0, 1e6, "int"), N("speed", "Скорость", 10, 400, "int"),
    { path: "elem", label: "Стихия (пусто — по лезвию/торсу; ледяные кусочки — только с ледяных)", t: "enum", opts: ["", ...BP_ELEMS] },
    N("aggro", "Агро, px", 0, 2000, "int"), N("radius", "Хитбокс, px", 6, 80, "int"), N("xp", "Опыт", 0, 1e7, "int"), N("scale", "Размер, ×", 0.4, 3),
    { path: "cursed", label: "Всегда проклятый", t: "bool" }, N("ench", "Ярус зачарования (0 — по миру)", 0, 6, "int"), { path: "hidden", label: "Снят с публикации", t: "bool" },
    { path: "artId", label: "Артефакт игрока в руке (art_…)", t: "text" },
    ...BODY_SLOTS.map((s) => ({ path: "body." + s, label: "Тело: " + s, t: "text" as const })),
    ...BP_TYPES.map((t) => ({ path: "weapon." + t, label: "Оружие: " + t, t: "text" as const })),
    { path: "drops", label: "Дроп [{res, chance, qty:[a,b]}]", t: "text" }] },
  bmcamp: { name: "Лагеря чёрных мобов", fields: [{ path: "name", label: "Название", t: "ltext" }, { path: "world", label: "Мир", t: "enum", opts: ["arinar", "hellfire"] },
    N("x", "X, px", -1e6, 1e6, "int"), N("y", "Y, px", -1e6, 1e6, "int"), N("r", "Радиус, px", 40, 1200, "int"), { path: "chief", label: "Вожак (вид моба)", t: "text" },
    N("respawnMin", "Возрождение от, с", 5, 86400, "int"), N("respawnMax", "Возрождение до, с", 5, 86400, "int"), { path: "lair", label: "Логово (одиночный сильный)", t: "bool" },
    { path: "hidden", label: "Выключен", t: "bool" }, { path: "mobs", label: "Состав [{mob, n}]", t: "text" }] },
  bmmcfg: { name: "Чёрные мобы: настройки", fields: [{ path: "on", label: "Чёрные мобы и лагеря в мире", t: "bool" },
    N("fightNearTiles", "Драка с обычными мобами: игрок ближе, клеток", 0, 64, "int"), N("maxCampMobs", "Мобов в лагере, макс.", 1, 200, "int"), N("maxCamps", "Лагерей, макс.", 0, 500, "int"),
    N("maxCustomMobs", "Своих мобов, макс.", 0, 2000, "int"), N("maxCustomBody", "Своих частей тела, макс.", 0, 3000, "int"), N("mobVis", "Масштаб листа в мире", 0.1, 3),
    N("weaponDmgPct", "Оружие в руке: +% урона", 0, 500), N("refMul", "«Авто по уровню»: × обычного моба", 0.1, 10), N("campMinDist", "Лагерь от города, мин. px", 0, 20000, "int"),
    ...BM_CLASSES.flatMap((c) => [N(`cls.${c}.hp`, `${c}: ×ОЗ`, 0.1, 10), N(`cls.${c}.dmg`, `${c}: ×урон`, 0.1, 10), N(`cls.${c}.speed`, `${c}: ×скорость`, 0.1, 10)])] },
  bpart: { name: "Части оружия", fields: [{ path: "name", label: "Название", t: "ltext" },
    { path: "type", label: "Тип детали (у встроенной не меняется)", t: "enum", opts: [...BP_TYPES] }, { path: "elem", label: "Стихия", t: "enum", opts: [...BP_ELEMS] },
    { path: "icon", label: "Значок (эмодзи, пока нет листа Художника)", t: "text" }, { path: "color", label: "Цвет заглушки", t: "color" },
    { path: "img", label: "Лист Художника (ключ файла, пусто — огненная заглушка)", t: "text" }, { path: "desc", label: "Описание", t: "ltext" },
    { path: "rarity", label: "Редкость", t: "enum", opts: ["common", "uncommon", "rare", "epic", "legendary", "mythic"] }, N("lvl", "Уровень", 1, 60, "int"),
    { path: "hidden", label: "Скрыта (не выдаётся)", t: "bool" },
    { path: "_h_st", label: "Чёрные статы части", t: "hdr" },
    N("stats.force", "Сила атаки, % к удару на полном заряде", 0, 5000), N("stats.power", "Мощность, %", 0, 1000), N("stats.charge", "Скорость заряда, с", 0, 30), N("stats.bdmg", "Чёрный урон, %", 0, 100),
    N("stats.barm", "Чёрная броня", 0, 1e7), N("stats.bcap", "Предельная броня, %", 0, 100), N("stats.bcrit", "Крит, из 100", 0, 100, "int"),
    N("stats.pfire", "Чистый огненный урон, % ОЗ атакующего", 0, 100), N("stats.pice", "Чистый ледяной урон, % ОЗ атакующего", 0, 100),
    { path: "_h_f", label: "Форма (рукоять — темп, лезвие — дальность/дуга)", t: "hdr" },
    N("cd", "Рукоять: перезарядка удара, мс", 200, 5000, "int"), N("reach", "Ближнее лезвие: дальность, px", 40, 400, "int"), N("arc", "Ближнее лезвие: дуга, рад", 0.2, 3.1),
    { path: "ranged", label: "Лезвие дальнего боя (снаряд)", t: "bool" },
    { path: "form", label: "Вид лезвия: staff — палка/посох (основной — дальний бой с переключателем; во 2/3 слоте — +1 снаряд), blade — клинок; пусто — по листу (blade_3 — посох)", t: "enum", opts: ["", "blade", "staff"] },
    N("rangeTiles", "Дальнее лезвие: дальность, клеток", 1, 40, "int"), N("width", "Дальнее лезвие: ширина снаряда, px", 4, 120, "int"),
    { path: "skill", label: "Навык части — любой навык артефактов из общего списка «✨ Навыки»", t: "enum", opts: ["", ...BM_SKILL_IDS] },
    { path: "_h_cost", label: "Создание у Знахаря", t: "hdr" },
    N("cost", "Кусочков чертежа (bp_<стихия>_<тип>) на одну деталь", 0, 9999, "int"), N("reqLvl", "Требуемый уровень героя", 0, 60, "int")] },
  loot: { name: "Дроп", fields: [] }, // gear/materials — таблицы, проверяются отдельно (validateLoot)
  // спавн Аринара (живые: сервер читает ZONE_GEN на каждом респавне/проверке) — лагеря и бродячие мобы
  spawn: { name: "Спавн", fields: [N("regenCombat", "Восстановление ХП в бою, × (вне боя — полное)", 0, 1), N("regenCombatSec", "«В бою» после удара/урона, с", 0, 60),
    N("levelGap.hit1", "Урон героя по мобу на 1 ур. выше, ×", 0, 1), N("levelGap.hit2", "Урон героя по мобу на 2 ур. выше, ×", 0, 1), N("levelGap.hit3", "Урон героя по мобу на 3+ ур. выше, ×", 0, 1),
    N("campPopMul", "Лагеря: численность мобов, × (1 — как было; цель 1.5; смена — лагеря пересобираются)", 0.25, 4),
    N("campRespawnMin", "Лагеря: респавн моба, от, с (случайно от…до, цель 180…300; оба 0 — действует «Респавн лагеря» ниже)", 0, 3600, "int"),
    N("campRespawnMax", "Лагеря: респавн моба, до, с", 0, 3600, "int"),
    N("campRespawn", "Респавн лагеря, с — только если «от/до» = 0 (вожак ×2, кочевник ×1.5)", 5, 3600, "int"),
    { path: "ambientOn", label: "Бродячие мобы включены", t: "bool" }, N("ambientEvery", "Бродячие: проверка раз в, с", 2, 600, "int"),
    N("ambientChance", "Бродячие: шанс одиночки, %", 0, 100), N("ambientGroupChance", "Бродячие: шанс группы с элитой, %", 0, 100),
    N("ambientGroup", "Бродячие: обычных в группе (+1 элита)", 1, 8, "int"), N("ambientCap", "Бродячие: максимум на игрока", 0, 20, "int"),
    N("ambientNear", "«Пусто», если нет мобов ближе, px", 150, 1500, "int"), N("ambientEdge", "Появляются на расстоянии, px (экран 640×360)", 200, 1200, "int"),
    N("ambientHunt", "Охотятся на игрока, с", 0, 120, "int"), N("ambientLife", "Уходят без боя через, с", 10, 600, "int")] },
  // плотность мобов по локациям Аринара (лагеря строятся заново при правке — сервер, без дублей)
  region: { name: "Локации: плотность", fields: [N("dens", "Лагерей: множитель (0 — без лагерей, 1 — как в коде)", 0, 5),
    N("packs.0", "Пачек в лагере: от", 1, 6, "int"), N("packs.1", "Пачек в лагере: до", 1, 6, "int"),
    N("pack.0", "Мобов в пачке: от", 1, 10, "int"), N("pack.1", "Мобов в пачке: до", 1, 10, "int"),
    N("elite", "Шанс элиты (0…1; с лимитом — на пачку)", 0, 1), N("eliteMax", "Максимум элит в лагере (кроме вожаков)", 0, 12, "int"),
    { path: "bossOn", label: "Мировой босс в локации", t: "bool" }] },
  boss: { name: "Мировые боссы", fields: [N("every", "Возрождение после смерти, с", 30, 86400, "int"), N("firstAfter", "Первое появление после старта, с", 0, 86400, "int")] },
  // «Проклятие» — только админ (модератору не отдаётся: roles.MOD_ADMIN_KINDS); одна запись id='main'
  curse: { name: "Проклятие", fields: [N("cursedPct", "Шанс проклятого моба при появлении, %", 0, 100), N("equipDropMult", "Шанс дропа экипировки, × (открытый мир и забеги; сундук лагеря — по таблице)", 0, 100),
    N("mobDropMult", "Проклятый моб/босс: шанс обычных вещей и материалов, ×", 0, 100),
    N("itemChanceMult", "Проклятая версия вещи: шанс = базовый × (отдельный бросок)", 0, 100),
    { path: "bossOnly", label: "Проклятые вещи — только с проклятых боссов", t: "bool" },
    N("statMult", "Статы проклятой вещи, ×", 1, 10), N("rsMult", "Урон навыка R проклятого оружия, ×", 1, 10),
    N("mobHp", "Проклятый моб: ОЗ, ×", 1, 50), N("mobDmg", "Проклятый моб: урон, ×", 1, 50), N("mobArmor", "Проклятый моб: броня, ×", 1, 20), N("mobXp", "Проклятый моб: опыт, ×", 0, 50),
    N("glow1", "Свечение: 1 вещь (0…1)", 0, 1), N("glow2", "Свечение: 2 вещи", 0, 1), N("glow3", "Свечение: 3 вещи", 0, 1), N("glow4", "Свечение: 4 вещи", 0, 1), N("glow5", "Свечение: полный комплект (пульсирует)", 0, 1),
    { path: "tint", label: "Цвет проклятия", t: "color" },
    { path: "_h_bsk", label: "Навыки боссов (случайные из пула; явные навыки моба в «Бестиарии» добавляются)", t: "hdr" },
    N("bossSkillsMin", "Обычный босс: навыков от", 0, 10, "int"), N("bossSkillsMax", "Обычный босс: навыков до", 0, 10, "int"),
    N("worldBossSkillsMin", "Мировой босс: навыков от", 0, 10, "int"), N("worldBossSkillsMax", "Мировой босс: навыков до", 0, 10, "int"),
    { path: "_h_pow", label: "Сила навыков", t: "hdr" },
    N("skillPowerCap", "Предел силы навыка героя, × (мир и дуэли; 100 — без предела)", 1, 100),
    N("mobSkillPowerCap", "Навык героя у моба: предел силы, ×", 0.5, 20)] },
  // «✦ Зачарование» — только админ (не в roles.MOD_ADMIN_KINDS); одна запись id='main', ярусы — tiers.0 … tiers.5
  ench: { name: "Зачарование", fields: [
    { path: "on", label: "Зачарованные мобы и дроп включены (выкл — не появляются и не падают; уже выпавшие вещи сохраняют статы)", t: "bool" },
    N("comboPct", "Проклятый моб / проклятая копия: доп. шанс ещё и зачарования, % (ярус — по весам шансов ярусов)", 0, 100),
    N("cursedRegen", "Регенерация проклятого моба, % макс. ОЗ/с (в бою тоже)", 0, 20),
    { path: "dropLower", label: "Зачарованный моб роняет копии своего и младших ярусов", t: "bool" },
    ...Array.from({ length: ENCH_N }, (_, i) => { const p = (k: string) => `tiers.${i}.${k}`; return [
      { path: p("_h"), label: `Ярус ${i + 1}`, t: "hdr" as const },
      { path: p("name"), label: "Название", t: "text" as const }, { path: p("color"), label: "Цвет", t: "color" as const },
      N(p("stat"), "Статы вещи, × (плоские и %)", 1, 100),
      N(p("spawnPct"), "Шанс моба при появлении, %", 0, 100), { path: p("boss"), label: "Может быть боссом / мировым боссом", t: "bool" as const },
      N(p("mobHp"), "Моб: ОЗ, ×", 1, 200), N(p("mobDmg"), "Моб: урон, ×", 1, 200), N(p("mobArmor"), "Моб: броня, ×", 1, 200), N(p("mobXp"), "Моб: опыт, ×", 0, 100),
      N(p("regen"), "Моб: регенерация, % макс. ОЗ/с (в бою тоже)", 0, 20),
      N(p("dropMult"), "Моб: шанс обычных вещей и материалов, ×", 0, 100), N(p("itemChance"), "Копия этого яруса: шанс = шанс строки × (отдельный бросок)", 0, 100),
      N(p("skMin"), "Случайных навыков: от", 0, 10, "int"), N(p("skMax"), "Случайных навыков: до", 0, 10, "int"),
      { path: p("killer"), label: "Убийца: скорость, рывок и агрессия как у проклятого", t: "bool" as const },
      N(p("upPct"), "Улучшение: +% ко всем статам за уровень (вместо обычного)", 0, 100), N(p("matMult"), "Улучшение: материалов ×", 1, 1000),
    ]; }).flat()] },
  // «⚒ Улучшение» у Петра — только админ: материал и кол-во на каждый уровень, проклятые, прибавка статов (провалов/поломок нет)
  upgrade: { name: "Улучшение", fields: [N("maxLvl", `Максимальный уровень улучшения (≤ ${UPG_ORDER.length})`, 0, UPG_ORDER.length, "int"), N("cost", "Материалов за уровень (обычная вещь), если у уровня не задано своё", 1, 999, "int"),
    N("cursedMult", "Проклятая вещь: кол-во ×, плюс второй материал (следующий по редкости)", 1, 20),
    N("flatPct", "Обычная: +% к плоским статам за уровень (от базы)", 0, 100), N("pctPts", "Обычная: +п.п. к процентным статам за уровень", 0, 10),
    N("cFlatPct", "Проклятая: +% к плоским статам за уровень (от проклятой базы)", 0, 100), N("cPctPts", "Проклятая: +п.п. к процентным статам за уровень", 0, 10),
    ...UPG_ORDER.flatMap((_, i) => [{ path: `order.${i}`, label: `+${i + 1}: материал`, t: "enum" as const, opts: Object.keys(RESOURCES), optn: Object.fromEntries(Object.entries(RESOURCES).map(([k, r]) => [k, `${r.icon} ${r.name}`])) },
      N(`costs.${i}`, `+${i + 1}: кол-во (0 — общее)`, 0, 999, "int")])] },
  // «Рывок» — только админ: перезарядка и неуязвимость (сервер считает по времени)
  biome: { name: "Биомы карты", fields: [{ path: "name", label: "Название биома на карте M", t: "text" }, { path: "sub", label: "Название зоны (вторая строка; пусто — без неё)", t: "text" }] },
  dash: { name: "Рывок", fields: [N("cd", "Перезарядка рывка, с", 0.5, 60), N("invulnMs", "Неуязвимость после рывка, мс (1 кадр ≈ 16,7 мс · 5 кадров ≈ 83 мс; 0 — нет)", 0, 1000, "int"), { path: "blink", label: "Мигание героя во время неуязвимости (видят все)", t: "bool" }] },
  // «⛏ Сбор» — только админ: свечение узлов ресурсов и личные таймеры
  gather: { name: "Сбор ресурсов", fields: [{ path: "glowOn", label: "Свечение готовых к сбору узлов (деревья, кристаллы, цветы, руда)", t: "bool" },
    { path: "glowColor", label: "Цвет свечения", t: "color" }, N("glowPower", "Яркость свечения (0 — нет, 1 — обычно, 3 — максимум)", 0, 3),
    N("glowPulse", "Скорость пульсации (0 — без пульса)", 0, 5), N("glowSize", "Размер ореола, × спрайта", 1, 1.6),
    { path: "personal", label: "Личные узлы: собранный одним игроком остаётся доступным другим", t: "bool" },
    N("respawnMult", "Восстановление узла, × (1 — как в коде)", 0.05, 20),
    N("range", "Дальность сбора, px (от узла; 75 — как в коде)", 20, 400, "int"), N("slack", "Запас дальности при сборе, px (на сколько можно сместиться, не прерывая сбор)", 0, 200, "int"),
    N("timeMs", "Время сбора, мс (1100 — как в коде)", 100, 15000, "int")] },
  // «🚶 NPC» — только админ: прогулка NPC вокруг точки появления (сервер двигает, все видят одно и то же)
  npc: { name: "NPC: прогулка", fields: [{ path: "on", label: "NPC ходят вокруг точки появления (выкл — стоят на месте)", t: "bool" },
    N("radiusTiles", "Радиус прогулки, клеток (1 клетка = 32 px)", 0, 30), N("speed", "Скорость шага, px/с (герой ≈ 160)", 5, 200),
    N("pauseMin", "Пауза между прогулками, мин. с", 0, 120), N("pauseMax", "Пауза между прогулками, макс. с", 0, 300),
    N("talkHoldSec", "Стоит у собеседника, если окно не закрыли, макс. с", 5, 600, "int")] },
  // «Сундуки схватки» — только админ (не в roles.MOD_ADMIN_KINDS); одна запись id='main'
  chest: { name: "Сундуки", fields: [{ path: "_h_camp", label: "Лагерь", t: "hdr" },
    { path: "on", label: "Сундук зачищенного лагеря включён (выкл — мешок с каждого моба)", t: "bool" },
    { path: "campRaw", label: "Сундук лагеря: шансы ровно как в таблице (выкл — таблица × свой множитель)", t: "bool" },
    N("campMult", "Сундук лагеря: свой множитель шансов, × (если «как в таблице» выкл)", 0, 100),
    N("campSecondPct", "Шанс второго сундука, %", 0, 100), { path: "campSpawnEmpty", label: "Ставить сундук, даже если пустой", t: "bool" },
    N("campIdleSec", "Зачистка лагеря сбрасывается без убийств через, с", 30, 7200, "int"),
    { path: "lvlGuard", label: "Страж уровня добычи: вещи сундука лагеря и мешков — по уровню моба (вне окна — своя вещь моба или ничего)", t: "bool" },
    N("lvlUp", "Окно уровня добычи: выше уровня моба не более, ур.", 0, 20, "int"), N("lvlDown", "Окно уровня добычи: ниже уровня моба не более, ур.", 0, 20, "int"),
    N("matDropMult", "Шанс материалов в открытом мире, × (мешки мобов; количество не меняется)", 0, 100),
    { path: "_h_gen", label: "Общие", t: "hdr" },
    N("personalSec", "Личная фаза, с", 0, 3600, "int"), N("publicSec", "Общий сундук живёт, с", 10, 86400, "int"), N("channelSec", "Открытие общего сундука (канал), с", 0, 120),
    N("range", "Дальность открыть/взять, px", 40, 400, "int"), N("linkRadius", "(не используется) радиус связи мобов, px", 50, 3000, "int"), N("linkWindowSec", "(не используется) окно продолжения, с", 0, 300),
    N("timeoutSec", "(не используется) закрыть без убийств через, с", 5, 900, "int"),  N("minSharePct", "Порог вклада, % урона по лагерю", 0, 100),
    { path: "partyNear", label: "Отряд участника рядом тоже получает добычу", t: "bool" },
    { path: "partyMode", label: "Режим отряда: personal — свои броски; rr — общий бросок по кругу; roll — общий бросок, случайному", t: "enum", opts: ["personal", "rr", "roll"] },
    { path: "guard", label: "Стража у общего сундука", t: "bool" }, N("guardN", "Стражей", 0, 8, "int"), N("takeRate", "Взятий в секунду (двойной клик / Shift+клик)", 1, 30)] },
  // «🌑 Чёрный маг» — только админ (не в roles.MOD_ADMIN_KINDS); одна запись id='main' (bmCfg.ts)
  bmage: { name: "Чёрный маг", fields: [{ path: "on", label: "Чёрный маг в Аринаре (выкл — исчезает, купола и розы остаются)", t: "bool" },
    { path: "_h_move", label: "Перемещение", t: "hdr" },
    N("tpEveryMin", "Телепорт в случайную точку Аринара раз в, мин", 1, 1440), N("hubPadTiles", "Не ближе к центральной площади, клеток (к радиусу хаба)", 0, 200, "int"),
    N("speed", "Скорость шага, px/с (герой ≈ 160)", 5, 200), N("wanderTiles", "Прогулка вокруг точки телепорта, клеток", 0, 40),
    N("protectTiles", "Идёт на бой, если бой ближе, клеток", 0, 40), { path: "stepBetween", label: "Встаёт между нападающим и защищаемым", t: "bool" },
    { path: "_h_dome", label: "Купола", t: "hdr" },
    N("domeTiles", "Радиус купола, клеток", 1, 20), N("domeLifeSec", "Купол живёт, с", 10, 86400, "int"),
    N("domeCdMin", "Боевой купол: перезарядка, мин. с", 1, 3600, "int"), N("domeCdMax", "Боевой купол: перезарядка, макс. с", 1, 3600, "int"),
    { path: "smallDomeOn", label: "Малая сфера вокруг мага (Ø5): игрок рядом бьёт мага или моба возле него", t: "bool" },
    N("smallDomeTiles", "Малая сфера: радиус, клеток", 0.5, 10), N("smallDomeLifeSec", "Малая сфера живёт, с", 2, 3600, "int"), N("smallDomeCdSec", "Малая сфера: перерыв, с", 0, 3600, "int"), N("smallTriggerTiles", "Малая сфера, если маг→защищаемый ближе, клеток (дальше — большой)", 1, 30), N("smallCastTiles", "Малая сфера: подходит к цели до, клеток", 0, 30),
    N("bigCastTiles", "Большой купол: подходит к цели до, клеток (маг в центре)", 1, 30), N("bigCastMinTiles", "Большой купол: если цель отходит — догоняет до, клеток", 1, 30),
    N("worldDomesMax", "Случайных куполов в мире, макс.", 0, 50, "int"), N("worldDomeEveryMin", "Случайный купол раз в, мин. мин", 1, 1440), N("worldDomeEveryMax", "Случайный купол раз в, макс. мин", 1, 1440),
    N("domesHardCap", "Всего куполов (страховка производительности)", 1, 500, "int"),
    { path: "domeAggro", label: "Удар из/в купол = нападение на мага", t: "bool" },
    { path: "_h_atk", label: "Чёрная магия", t: "hdr" },
    N("compressTiles", "Сжатие пространства: радиус, клеток (убивает любого моба в куполе)", 0, 10),
    N("arrowPct", "Стрела вне купола: урон, % макс. ОЗ", 0, 100), N("arrowRate", "Стрел в секунду вне купола", 0.1, 30), N("arrowTiles", "Размер стрелы вне купола, клеток", 0.05, 3),
    N("arrowDomePct", "Стрела в куполе: урон, % макс. ОЗ", 0, 100), N("arrowDomeRate", "Стрел в секунду в куполе", 0.1, 30), N("arrowDomeTiles", "Размер стрелы в куполе, клеток", 0.05, 3),
    N("arrowSpeed", "Скорость стрел, px/с", 100, 3000, "int"), N("rangeTiles", "Дальность стрельбы, клеток", 2, 60),
    N("volleyMin", "Залп длится, мин. с", 0.2, 120), N("volleyMax", "Залп длится, макс. с", 0.2, 120), N("volleyGapMin", "Пауза между залпами, мин. с", 0, 120), N("volleyGapMax", "Пауза между залпами, макс. с", 0, 120),
    N("hitBlk", "Попадание стрелы мага: +% очернения каждой надетой вещи (сразу)", 0, 100), N("explTiles", "Взрыв стрелы: радиус, клеток", 0, 10), N("explPct", "Взрыв: урон другим игрокам, % макс. ОЗ", 0, 100), N("explBlk", "Взрыв: очернение надетых вещей, %", 0, 100),
    { path: "_h_pvp", label: "Выстрелы игроков из купола (купол исходящие не гасит)", t: "hdr" },
    { path: "pvpShot", label: "Выстрел, вылетевший из купола, становится чёрным", t: "bool" },
    N("pvpShotPct", "Чёрный выстрел по игроку: урон, % макс. ОЗ", 0, 100), N("pvpExplPct", "Чёрный взрыв: урон игрокам рядом, % макс. ОЗ", 0, 100), N("pvpExplBlk", "Чёрный взрыв: очернение надетых вещей, %", 0, 100),
    N("aggroForgetSec", "Забывает напавшего через, с", 5, 3600, "int"), N("leashTiles", "Перестаёт преследовать дальше, клеток", 5, 500),
    N("chaseSpeedMul", "Погоня за напавшим: скорость ×", 1, 10), { path: "blinkOn", label: "Рывок к убегающему напавшему", t: "bool" },
    N("blinkTriggerTiles", "Рывок, если напавший дальше, клеток", 2, 100), N("blinkToTiles", "Рывок: приземляется от напавшего в, клеток", 1, 30), N("blinkCdSec", "Рывок: не чаще раза в, с", 0.5, 600),
    { path: "selfDomeOn", label: "Нападение на самого мага: барьер вокруг мага, напавший вытолкнут", t: "bool" },
    { path: "selfBigDome", label: "…напавший дальше «малой» дистанции — большой купол (иначе только малая сфера)", t: "bool" },
    N("selfDomeCdSec", "Большой купол при нападении на мага: не чаще раза в, с (иначе — малая сфера)", 0, 3600), N("selfDomeLifeSec", "Большой купол от нападения на мага живёт, с", 2, 86400, "int"), N("pushExtraTiles", "Выталкивание: за край купола ещё на, клеток", 0, 10),
    N("hitsForgetSec", "Счёт попаданий (очернение при смерти) сгорает через, с", 10, 86400, "int"),
    { path: "_h_blk", label: "Очернение и проклятая земля", t: "hdr" },
    N("blkK", "k очернённых статов: стат = база × очернение% × k", 0, 10),
    { path: "_h_blkv", label: "Вид очернения (значки вещей и герой — видно всем)", t: "hdr" },
    { path: "blkVisOn", label: "Показывать очернение на значках и на герое", t: "bool" },
    N("blkVisItemMax", "Значок вещи при 100%: сила затемнения, 0…1", 0, 1), N("blkVisCharMax", "Герой: доля чёрной половины при 100 % (1 — ровно половина)", 0, 1),
    N("blkVisCurve", "Значки: кривая силы = макс × (очернение/100)^кривая", 0.1, 5),
    { path: "blkGlitch", label: "Глитч чёрной половины героя (сдвиг на 1 px вправо)", t: "bool" }, N("blkGlitchHz", "Глитч: раз в секунду", 0, 10), N("heroLight", "Яркость спрайтов героев (1 — как в атласе)", 0.3, 1.5),
    { path: "blkVisMode", label: "Очернение героя: slots — Σ по 5 слотам ÷ 5; avg — среднее надетых; max — самая чёрная вещь", t: "enum", opts: ["avg", "slots", "max"] },
    { path: "groundTalentsOff", label: "На проклятой земле не работают и таланты/ветка души", t: "bool" },
    N("sproutDays", "Роза: росток, дней", 0, 365), N("budDays", "Роза: бутон, дней", 0, 365), N("openDays", "Роза: раскрытие, дней", 0, 365),
    N("curseTilesPerDay", "Проклятая земля: рост радиуса, клеток/день", 0, 50), N("curseMaxTiles", "Проклятая земля: макс. радиус, клеток", 0, 500),
    N("trailSec", "Чёрный след мага (визуал), с", 0, 10)] },
  // «💡 Свет» — только админ; одна запись id='main' (lightCfg.ts). Множители в экранном пространстве (engine/pixColor.js)
  light: { name: "Свет", fields: [N("ground", "Яркость земли (тайлы), × атласа", 0.2, 1.5), N("hero", "Герои и облики: яркость, ×", 0.3, 1.5),
    N("props", "Порталы, Алтарь и другие одиночные пропсы: яркость, ×", 0.3, 1.5), N("glow", "Свечение вихря портала (*_glow), ×", 0, 2),
    N("pool", "Световые пятна огней на земле: сила, ×", 0, 2), N("halo", "Ореолы огней и порталов: сила, ×", 0, 2),
    { path: "haloBehind", label: "Ореол за источником (не засвечивает спрайт; выкл — поверх, как раньше)", t: "bool" },
    N("shadow", "Тени под героями, мобами и пропсами: плотность, ×", 0, 1.5)] },
  ui: { name: "Интерфейс", fields: [{ path: "_h_ui", label: "Стиль", t: "hdr" },
    { path: "on", label: "Новый стиль интерфейса «проклятое + очернённое» (выкл — прежний вид)", t: "bool" },
    N("glitch", "Глитч рамок: 0 — нет, 1 — под курсором, 2 — ещё редкие вздрагивания окон", 0, 2, "int"),
    N("biomeMix", "Цвет локации в металле рамок, % (0 — всегда фиолет проклятия)", 0, 100, "int"),
    { path: "ornaments", label: "Ромбы-застёжки на углах больших окон", t: "bool" },
    { path: "avatars", label: "Аватары героев (окно C, карточка героя, просмотр игрока)", t: "bool" },
    N("avatarCursedAt", "Очернённый аватар с очернения героя, %", 0, 100, "int"),
    { path: "_h_hud", label: "HUD в игровом поле", t: "hdr" },
    { path: "hudIngame", label: "HUD внутри игрового поля: круглая мини-карта, панель цели, компактные кнопки (выкл — боковые колонки у всех)", t: "bool" },
    { path: "hudOldDefault", label: "«Старые панели» по умолчанию (пока игрок не выбрал сам)", t: "bool" },
    { path: "mmMobile", label: "Круглая мини-карта на телефоне", t: "bool" },
    N("mmSize", "Диаметр мини-карты на ПК, px (телефон ×0.6)", 120, 240, "int"),
    N("mmX", "Мини-карта: отступ от правого края, px", 0, 200, "int"), N("mmY", "Мини-карта: отступ сверху, px", 0, 200, "int"),
    N("mmZoom", "Мини-карта: зум по умолчанию (1 — 1x, 2 — 2x, 3 — 3x)", 1, 3, "int"),
    { path: "mmRound", label: "Мини-карта круглая (выкл — квадратная в рамке)", t: "bool" },
    { path: "tgtSide", label: "Панель «Цель»: где", t: "enum", opts: ["left", "center", "right"], optn: { left: "слева, под рамкой героя", center: "по центру сверху", right: "справа, под мини-картой" } },
    N("tgtTop", "Панель «Цель»: отступ сверху, px", 40, 500, "int"),
    N("plate", "Плашки в поле («Цель», всплывающие окна): плотность тёмного фона, % (читаемость на льду/снегу)", 50, 100, "int"),
    N("tgtHide", "Панель «Цель»: скрыть, если у цели ничего не меняется, с (0 — не скрывать)", 0, 60, "int"),
    { path: "_h_atmo", label: "Атмосфера (только новый интерфейс, не в забеге)", t: "hdr" },
    { path: "atmo", label: "Атмосфера: виньетка и тон по локации, частицы поверх экрана", t: "bool" },
    N("vig", "Виньетка-«порча» по краям в цвет локации, %", 0, 100, "int"), N("grade", "Тон локации (лёгкий оттенок, не высветляет), %", 0, 100, "int"),
    N("parts", "Частицы интерфейса (пепел, снег, угли…), % плотности", 0, 100, "int"),
    N("atmoMobile", "Телефон: сила виньетки и тона, % от ПК (0 — атмосфера выкл)", 0, 100, "int"),
    N("partsMobile", "Телефон: плотность частиц, % от ПК", 0, 100, "int"),
    ...([["hub", "Поляна"], ["ice", "Аринар · лёд"], ["fire", "Аринар · огонь"], ["stone", "Аринар · камень"], ["air", "Аринар · воздух"], ["arinar", "Аринар · прочие края"]] as const).flatMap(([k, nm]) => [
      { path: `_h_loc_${k}`, label: `Локация: ${nm} (% от общих значений)`, t: "hdr" as const },
      N(`loc.${k}.vig`, `${nm}: виньетка, %`, 0, 200, "int"), N(`loc.${k}.grade`, `${nm}: тон, %`, 0, 200, "int"), N(`loc.${k}.parts`, `${nm}: частицы, %`, 0, 200, "int")]),
    { path: "_h_sfx", label: "Звуки и окна", t: "hdr" },
    { path: "sfx", label: "Звуки интерфейса (клик, открытие/закрытие окон)", t: "bool" }, N("sfxVol", "Громкость звуков интерфейса по умолчанию, % (0 — по умолчанию выкл)", 0, 100, "int"),
    { path: "trans", label: "Плавное открытие/закрытие окон", t: "bool" }, N("transMs", "Длительность перехода окна, мс", 60, 400, "int"),
    { path: "loadScreen", label: "Экран загрузки в стиле нового интерфейса", t: "bool" },
    { path: "_h_tex", label: "Текстуры по умолчанию (пока игрок не выбрал сам; со следующей загрузки)", t: "hdr" },
    { path: "texPc", label: "ПК", t: "enum", opts: ["32", "16"], optn: { "32": "новые (32 px)", "16": "старые (16 px)" } },
    { path: "texMobile", label: "Телефон", t: "enum", opts: ["32", "16"], optn: { "32": "новые (32 px)", "16": "старые (16 px)" } },
    { path: "_h_scale", label: "🔍 Размер интерфейса (пока игрок не выбрал сам; не больше, чем помещается на экран)", t: "hdr" },
    N("scalePc", "ПК: по умолчанию, %", 50, 200, "int"), N("scaleMobile", "Телефон: по умолчанию, % (0 — авто по размеру экрана)", 0, 200, "int"),
    N("scaleMin", "Ползунок: минимум, %", 50, 100, "int"), N("scaleMax", "Ползунок: максимум, %", 100, 200, "int"),
    { path: "_h_drag", label: "✥ Перетаскивание интерфейса и полоса опыта", t: "hdr" },
    { path: "drag", label: "Игроки могут перетаскивать блоки HUD и окна (раскладка хранится в аккаунте; выкл — всё на местах по умолчанию)", t: "bool" },
    { path: "dragMobile", label: "Перетаскивание и на телефоне (долгое нажатие)", t: "bool" },
    N("longPressMs", "Телефон: долгое нажатие для перетаскивания, мс", 250, 1500, "int"),
    { path: "xpBar", label: "Полоса опыта над панелью навыков", t: "bool" },
    { path: "xpPop", label: "«+0,1% опыта» на полосе за убийства (вместо «+N опыта» над героем)", t: "bool" },
    N("xpPopMs", "Сколько держится «+% опыта» (убийства подряд суммируются), мс", 600, 5000, "int"),
    { path: "fsAuto", label: "Полный экран по первому касанию/клику на странице игры (где браузер разрешает)", t: "bool" }] },
  terrain: { name: "Рельеф", fields: [{ path: "waterBlock", label: "Вода и глубокая вода непроходимы для героев и ходячих мобов (берега и мостки — проходимы)", t: "bool" },
    { path: "lavaBlock", label: "Лава непроходима", t: "bool" },
    N("edge", "Полоса берега, px: насколько тело заходит на клетку жидкости со стороны суши", 0, 16, "int")] },
  // «🏰 Альказак» — только админ: город под куполом (city.ts). Раскладка земли/домов строится при запуске сервера (центр/радиус — после перезапуска)
  city: { name: "Город Альказак", fields: [{ path: "on", label: "Город включён (купол, безопасная зона, NPC)", t: "bool" }, { path: "name", label: "Название города", t: "text" },
    { path: "_h_dome", label: "Купол", t: "hdr" },
    N("x", "Центр X, px мира (после перезапуска)", 0, 48000, "int"), N("y", "Центр Y, px мира (после перезапуска)", 0, 48000, "int"), N("rTiles", "Радиус купола, клеток (32 = 64×64; раскладка города растягивается; после перезапуска)", 8, 160, "int"),
    N("alphaIn", "Купол изнутри: непрозрачность (0.02 = прозрачность 98 %)", 0, 1), N("fadeSec", "Переход прозрачности при входе/выходе, с", 0.1, 5), N("fadeBandPx", "…полоса перехода у края купола, px", 4, 200, "int"), N("alphaOut", "Купол снаружи: непрозрачность", 0, 1), N("rim", "Яркость ободка", 0, 2), { path: "color", label: "Цвет купола", t: "color" },
    { path: "_h_safe", label: "Безопасная зона", t: "hdr" },
    { path: "noDamage", label: "Внутри урон 0 (атаки, навыки, снаряды, статусы — в обе стороны)", t: "bool" }, { path: "mobsOut", label: "Мобы не заходят внутрь", t: "bool" }, N("mobPushPx", "…моб у купола выталкивается за край на, px", 0, 400, "int"), N("mobAggroPadPx", "…цель под куполом глубже края на столько px — моб сбрасывает агро", 0, 200, "int"), { path: "mobBossesOut", label: "…боссы тоже не заходят", t: "bool" }, { path: "mobDomeFlash", label: "…вспышка купола, когда он выталкивает моба (не чаще раза в 3 с на моба)", t: "bool" }, { path: "nodesOut", label: "Узлы ресурсов под куполом — переносить за край (после перезапуска)", t: "bool" },
    { path: "_h_kill", label: "Убийцы: купол не пускает (выталкивает)", t: "hdr" },
    { path: "pkBlocked", label: "PK-режим — убийца", t: "bool" },
    { path: "killerPOn", label: "Убийца: убил игроков", t: "bool" }, N("killerP", "…игроков (1 — сразу)", 1, 100, "int"),
    { path: "killerMOn", label: "Убийца: убил мобов", t: "bool" }, N("killerM", "…мобов", 1, 1000, "int"),
    N("windowMin", "…за последние, мин", 0.5, 1440), N("pushExtraTiles", "Выталкивание: за край ещё на, клеток", 0, 10), N("denyMsgSec", "Сообщение «не пускает» не чаще раза в, с", 0.5, 60),
    { path: "_h_rose", label: "Роза в центре города", t: "hdr" },
    { path: "roseId", label: "id розы (black_roses)", t: "text" }, { path: "roseBloom", label: "Сразу раскрыта (стадия 6)", t: "bool" }, { path: "roseNoCurse", label: "Без проклятой земли", t: "bool" },
    { path: "noCurseIn", label: "Внутри купола проклятая земля роз не действует", t: "bool" },
    { path: "ringOn", label: "Линия края купола на земле по всему кругу (только вид, вживую)", t: "bool" }, N("ringA", "…непрозрачность линии", 0, 1), N("ringW", "…ширина линии, px мира", 1, 24), N("ringGlow", "…ореол, × ширины (0 — без ореола)", 0, 10),
    { path: "blightOn", label: "Пятно порчи под розой (только вид)", t: "bool" }, N("blightSize", "…размер пятна, ×", 0.3, 3), N("blightK", "…сила пятна (непрозрачность, искры), ×", 0, 2),
    { path: "_h_look", label: "Вид", t: "hdr" },
    N("plazaTiles", "Площадь: радиус, клеток (после перезапуска)", 4, 12, "int"),
    { path: "centerpiece", label: "Центр площади: fountain — фонтан, statue — статуя (место зарезервировано), none — пусто (коллизия — после перезапуска)", t: "enum", opts: Object.keys(CENTERPIECES) },
    N("centerFreeTiles", "Свободно вокруг центра, клеток (после перезапуска)", 1, 6),
    N("groundLight", "Яркость земли города (1 — как тайлы; больше — светлее днём и ночью; вживую)", 0.4, 2.5),
    { path: "_h_altar", label: "Алтарь перевоплощения (у фонтана)", t: "hdr" },
    { path: "altar.on", label: "Алтарь стоит (привязка точки возрождения, облик души)", t: "bool" },
    N("altar.dx", "Точка X, px от центра города (клетка фонтана)", -1200, 1200, "int"), N("altar.dy", "Точка Y, px от центра города", -1200, 1200, "int"),
    N("altar.r", "Радиус взаимодействия, px", 40, 400, "int"), N("altar.bindCdSec", "Откат привязки возрождения, с", 0, 3600, "int"),
    { path: "altar.soulOn", label: "Можно принять облик души (белая душа, без атак и сбора)", t: "bool" }, N("altar.soulCdSec", "Откат смены облика (душа ↔ тело), с", 0, 600, "int"),
    { path: "_h_walk", label: "Жители: прогулка (места с «ходит»)", t: "hdr" },
    { path: "walk.on", label: "Жители ходят (выкл — стоят дома на своём месте)", t: "bool" }, { path: "walk.goOut", label: "Выходят из дома на улицу", t: "bool" },
    N("walk.speed", "Скорость шага, px/с", 5, 160, "int"), N("walk.rInTiles", "Радиус прогулки дома, клеток", 0, 6), N("walk.rOutTiles", "Радиус прогулки на улице (от двери), клеток", 0, 20),
    N("walk.inMinSec", "Дома: от, с", 5, 3600, "int"), N("walk.inMaxSec", "Дома: до, с", 5, 3600, "int"), N("walk.outMinSec", "На улице: от, с", 5, 3600, "int"), N("walk.outMaxSec", "На улице: до, с", 5, 3600, "int"),
    N("walk.pauseMin", "Пауза между шагами: от, с", 0, 60), N("walk.pauseMax", "Пауза: до, с", 0, 60),
    N("walk.roamRTiles", "«Бродит по городу»: длина шага-перехода, клеток (следующая точка — от текущей позиции)", 2, 30), N("walk.roamOutMul", "…на улице дольше обычного, ×", 1, 10),
    N("walk.roamHomeSec", "…путь домой пешком: не дольше, с (потом — сразу через дверь)", 10, 600, "int"),
    { path: "_h_fx", label: "Эффекты: дым из труб, камин", t: "hdr" },
    { path: "fx.smokeOn", label: "Дым из труб (вживую)", t: "bool" }, N("fx.smokeRate", "…частота клубов, ×", 0.1, 4), N("fx.smokeRise", "…скорость подъёма, ×", 0.1, 4), N("fx.smokeAlpha", "…непрозрачность", 0, 1), N("fx.smokeSize", "…размер клубов, ×", 0.3, 3), { path: "fx.smokeSheet", label: "…лист дыма (main — основной, thin — тонкий)", t: "enum", opts: ["main", "thin"] },
    { path: "fx.resGlow", label: "Свечение листов жителей (residents/<key>_glow.png: глаза и т.п.)", t: "bool" }, N("fx.resGlowK", "…сила свечения", 0, 4), N("fx.resRim", "Контур жителей 1px (видимость тёмных волос на тёмной земле), 0 — выкл", 0, 1),
    { path: "fx.hearthOn", label: "Огонь в каминах домов (анимация + свет)", t: "bool" }, N("fx.hearthFlick", "…мерцание света: сила (0 — ровный)", 0, 1), N("fx.hearthSpeed", "…мерцание: скорость, ×", 0.1, 5),
    N("fx.hearthK", "…яркость света", 0, 2), N("fx.hearthR", "…радиус света, ×", 0.3, 3),
    ...Array.from({ length: CITY_SLOTS }, (_, i) => { const p = (k: string) => `npc.${i}.${k}`; return [
      { path: p("_h"), label: `NPC — место ${i + 1}`, t: "hdr" as const }, { path: p("on"), label: "Стоит в городе (квесты — во вкладке «📜 Квесты», NPC city_" + (i + 1) + ")", t: "bool" as const },
      { path: p("name"), label: "Имя", t: "text" as const }, { path: p("title"), label: "Подпись", t: "text" as const },
      { path: p("look"), label: "Вид (временный, лист NPC)", t: "enum" as const, opts: CITY_LOOKS },
      { path: p("sprite"), label: "Свой спрайт: ключ листа src/assets/mc/city/residents/<ключ>.png (пусто/нет файла — «Вид»)", t: "text" as const },
      { path: p("walk"), label: "Ходит: живёт в здании и выходит гулять по городу", t: "bool" as const },
      { path: p("roam"), label: "Бродит по всему городу (не только у своей двери)", t: "bool" as const },
      N(p("dx"), "Снаружи: точка X, клеток от центра (по умолчанию — точки карты Историка)", -60, 60), N(p("dy"), "Снаружи: точка Y, клеток от центра", -60, 60),
      { path: p("house"), label: "В здании (пусто — снаружи, по точке X/Y)", t: "enum" as const, opts: ["", ...BUILD_DEF.map((h) => h.id)], optn: Object.fromEntries([["", "— снаружи"], ...BUILD_DEF.map((h) => [h.id, h.name])]) },
      { path: p("spot"), label: "Место в здании: " + [...new Set(Object.values(ROOMS).flatMap((r: any) => (r.npc_spots || []).map((s: any) => s.id)))].join(" / "), t: "text" as const },
    ]; }).flat()] },
  // «⚔ PK» — только админ: PK-режим (кнопка у полоски ОЗ), PvP в открытом мире
  pk: { name: "PK-режим", fields: [{ path: "on", label: "PK-режим доступен", t: "bool" }, N("enterSec", "Включить: ждать без боя, с", 0, 600, "int"), N("exitSec", "Выключить: ждать без боя, с", 0, 3600, "int"),
    { path: "defense", label: "Самооборона: retaliate — не-PK отвечает напавшему PK (не становится убийцей), none — не может", t: "enum", opts: ["retaliate", "none"] },
    N("defendSec", "Право ответа длится, с", 1, 600, "int"), N("dmgMult", "Урон по игрокам, ×", 0, 5), { path: "color", label: "Цвет имени PK", t: "color" },
    { path: "barFrom", label: "Полоса над героем: цвет «мирный» (вход начинается с него, выход им кончается)", t: "color" }, { path: "barTo", label: "Полоса над героем: цвет «PK»", t: "color" },
    { path: "barCancel", label: "Полоса: цвет сброса боем", t: "color" }, N("barW", "Полоса: ширина, px", 24, 140, "int"),
    { path: "tagText", label: "Значок слева от имени (PK → АДМИН → имя)", t: "text" }, { path: "tagBg", label: "Значок: фон", t: "color" }, { path: "tagFg", label: "Значок: текст", t: "color" }, { path: "tagGlow", label: "Значок: свечение", t: "color" },
    { path: "cancelOnHit", label: "Отсчёт PK сбрасывает ПОЛУЧЕННЫЙ урон", t: "bool" }, { path: "cancelOnDeal", label: "Отсчёт PK сбрасывает НАНЕСЁННЫЙ урон", t: "bool" },
    { path: "tagKiller", label: "Значок и красное имя — и у убийц (не только PK-режим)", t: "bool" }] },
  // «📍 Вход» — позиция между входами
  pos: { name: "Вход: позиция", fields: [{ path: "on", label: "Вход/переподключение — туда, где был (выкл — в хабе)", t: "bool" }, N("saveSec", "Позиция пишется не чаще раза в, с (и при смене мира/выходе)", 5, 3600, "int"),
    { path: "perBody", label: "У каждого тела своя точка (вход — туда, где оставили активное тело)", t: "bool" },
    { path: "switchTp", label: "Смена тела у Алтаря переносит новое тело на его точку (выкл — остаёмся у Алтаря)", t: "bool" }] },
  // «🌗 День и ночь» — только мир Аринар (забеги не трогаем). Время — реальное по часовому поясу; переходы плавные
  dn: { name: "День и ночь", fields: [{ path: "on", label: "Смена дня и ночи (выкл — всегда день)", t: "bool" },
    { path: "_h_t", label: "Время (ЧЧ:ММ, часовой пояс ниже)", t: "hdr" },
    { path: "duskStart", label: "Закат начинается", t: "text" }, { path: "night", label: "Полная ночь с", t: "text" },
    { path: "dawnStart", label: "Рассвет начинается", t: "text" }, { path: "day", label: "Полный день с", t: "text" },
    { path: "tz", label: "Часовой пояс (IANA, напр. Europe/Kiev)", t: "text" }, N("utcOffsetH", "Смещение от UTC, ч (если пояс не поддержан)", -12, 14, "num"),
    { path: "_h_l", label: "Свет", t: "hdr" },
    N("nightDark", "Темнота полной ночи (0 — нет, 1 — чёрная)", 0, 0.95), N("lightsOn", "Огни загораются с доли заката", 0, 0.95), N("lightsFull", "Огни в полную силу с доли заката", 0.05, 1),
    N("playerLightM", "Свет героя, радиус м", 2, 16), N("mobLight", "Свечение мобов, ×", 0, 3), N("townLight", "Огни города/лагерей, ×", 0, 3), N("maskMax", "Огни ярче дня: множитель под огнём до", 1, 2), N("lampStagger", "Огни вразнобой: разброс старта, мин", 0, 25), N("lampFade", "Огонь загорается/гаснет за, мин", 1, 20),
    N("reduceMax", "«Смягчить ночь» (ползунок игрока): максимум, %", 0, 100, "int"),
    { path: "_h_lt", label: "Огни: вид (мерцание, ореолы, пятна, сила по видам)", t: "hdr" },
    N("lt.flickFire", "Мерцание: костры/факелы (0 — ровно)", 0, 1), N("lt.flickLamp", "Мерцание: фонари/окна", 0, 1), N("lt.flickSpeed", "Мерцание: скорость, ×", 0.1, 5), N("lt.kFire", "Сила пятна света: огонь (костры, факелы), ×", 0, 3), N("lt.kLamp", "Сила пятна: фонари, ×", 0, 3), N("lt.kWindow", "Сила пятна: окна и двери, ×", 0, 3), N("lt.cityAmb", "Ночной фон города (лунный свет под куполом; 0 — нет)", 0, 1), N("lt.pool", "Пятно на земле: размер, ×", 0.3, 3), N("lt.poolEl", "Пятно: вытянутость по горизонтали (3/4), ×", 1, 2.5), N("lt.halo", "Ореол у огня: размер, ×", 0.2, 3), N("lt.haloFire", "Ореол поверх темноты: огонь", 0, 1.5), N("lt.haloLamp", "…фонари", 0, 1.5), N("lt.haloWindow", "…окна", 0, 1.5), N("lt.haloDoor", "…двери", 0, 1.5), N("lt.glowFire", "Свечение спрайта (_glow) поверх темноты: огонь", 0, 1.5), N("lt.glowLamp", "…фонари", 0, 1.5), N("lt.glowWindow", "…окна", 0, 1.5), N("lt.nightLamp", "Свечение спрайта ночью под маской: фонари", 0, 1.5), N("lt.nightWindow", "…окна", 0, 1.5),
    { path: "emitters", label: "Точки огня — правки (JSON {\"city:dm_lantern_pole\": [ex, ey]}, арт-px от низа-центра, ey вверх; пусто — авто по _glow)", t: "text" },
    { path: "_h_c", label: "Цвета (ключевые кадры)", t: "hdr" },
    { path: "cDay", label: "День", t: "color" }, { path: "cGolden", label: "Закат: золото", t: "color" }, { path: "cPink", label: "Закат: розово-фиолетовый", t: "color" }, { path: "cNight", label: "Ночь (оттенок)", t: "color" },
    { path: "cDawnViolet", label: "Рассвет: холодный фиолет", t: "color" }, { path: "cDawnPink", label: "Рассвет: розовый", t: "color" }, { path: "cDawnWarm", label: "Рассвет: тёплый", t: "color" },
    { path: "_h_f", label: "Тест", t: "hdr" },
    { path: "force", label: "Форс-время ЧЧ:ММ (пусто — реальное)", t: "text" }, N("speed", "Ускорение часов при форсе (60 = минута за секунду)", 0, 1440)] },
  // «🖼 Графика» — только админ; одна запись id='main' (gfxCfg.ts). Только отрисовка. Живые поля — сразу; набор листов — со следующей загрузки
  gfx: { name: "Графика", fields: [{ path: "_h0", label: "Пропсы 32 (props3) — со следующей загрузки страницы", t: "hdr" },
    { path: "props3Pc", label: "ПК: пропсы 32 при «Текстуры: Новые (32)»", t: "bool" },
    { path: "props3Mobile", label: "Телефон: пропсы 32 при «Текстуры: Новые (32)» (по умолчанию выкл)", t: "bool" },
    { path: "pack16", label: "Основные листы 16 бит/пиксель (RGBA 5551) — −70 МБ видеопамяти, цвет чуть тусклее", t: "bool" },
    { path: "packGlow", label: "Листы свечения 16 бит/пиксель (RGBA 5551) — −55 МБ видеопамяти", t: "bool" },
    { path: "lightSprites", label: "Ореолы и пятна огней — пиксельные спрайты; выкл — гладкий градиент", t: "bool" },
    { path: "fallbackV2", label: "Портал при пропсах 32 — из старых (props2), пока нет нового арта (список: props3/fallback_v2.json)", t: "bool" },
    { path: "arena3", label: "Арена забега: спрайты props3 вместо 3D-мешей + пол, кромка и парапет 32 (со следующей арены; механика не меняется)", t: "bool" },
    { path: "arena3Shape", label: "Арена 32: граница — round (ровный круг) / tiles (ступеньки по клеткам, как в README Художника)", t: "enum", opts: ["round", "tiles"], optn: { round: "круг", tiles: "клетки" } },
    { path: "arena3Wall", label: "Арена 32: парапет — auto (ПК спрайтами, телефон запечён в пол) / sprites (объёмнее) / baked (дешевле)", t: "enum", opts: ["auto", "sprites", "baked"], optn: { auto: "авто: ПК — спрайты, телефон — в полу", sprites: "спрайты (объёмнее)", baked: "запечь в пол (дешевле)" } },
    N("arena3Posts", "Арена 32: угловые столбы на диагоналях — каждый n-й (1 — все)", 1, 6, "int"),
    { path: "arena3Tall", label: "Арена 32: высокая стена arena_wall_* за парапетом (только у границы «клетки»)", t: "bool" },
    N("arena3TallGap", "Арена 32: высокая стена дальше парапета, м", 0, 8),
    { path: "arena3Rim", label: "Арена 32: тонкий светящийся обод поверх кромки (как раньше)", t: "bool" },
    N("arena3Cracks", "Арена 32: трещин на полу, шт.", 0, 80, "int"),
    N("arena3Floor", "Арена 32: яркость пола поверх света, × (1 — без поправки)", 0.2, 3),
    { path: "_h_a3l", label: "Арена 32: свет (экранный ×, 1 — как превью Художника; со следующей арены)", t: "hdr" },
    N("arena3Amb.crypt", "Свет арены 32 · Склеп: общий фон", 0, 1.5), N("arena3Amb.abyss", "Свет арены 32 · Бездна: общий фон", 0, 1.5),
    N("arena3Amb.mirror", "Свет арены 32 · Отражения: общий фон", 0, 1.5), N("arena3Amb.abode", "Свет арены 32 · Обитель: общий фон", 0, 1.5),
    N("arena3Lit", "Свет арены 32: огни (колонны, сигил, свечи, кристаллы, кромка), ×", 0, 3),
    N("arena3Edge", "Свет арены 32: пол у стены (1 — без затемнения, 0 — чёрный)", 0, 1),
    N("arena3WallL", "Свет арены 32: парапет, колонны и декор, × (свечение огней — полное)", 0.2, 1.5),
    N("arena3GlowW", "Арена 32: доля светящихся плит пола (вес варианта)", 0, 3),
    { path: "_hm", label: "Мобы 32 (bestiary32, Художник) — всё сразу, без перезагрузки", t: "hdr" },
    { path: "mobs32", label: "Новые спрайты мобов (общий выключатель; выкл — у всех старые, сильнее настройки игрока)", t: "bool" },
    { path: "mobs32Pc", label: "ПК: «Мобы: Новые» по умолчанию", t: "bool" },
    { path: "mobs32Mobile", label: "Телефон: «Мобы: Новые» по умолчанию (по умолчанию выкл; игрок может включить сам)", t: "bool" },
    { path: "mobs32Run", label: "Забеги: новые мобы тоже (по умолчанию выкл)", t: "bool" },
    N("mobFps", "Мобы: скорость анимации, ×", 0.25, 3), N("mobGlow", "Мобы: сила свечения (*_glow), ×", 0, 3),
    N("mobHurtFlash", "Мобы: белая вспышка при попадании поверх новых кадров (0 — нет)", 0, 1),
    N("mobGrace", "Мобы: выгрузка листа тира из видеопамяти через, с без мобов рядом", 2, 600, "int"),
    N("mobLoadR", "Мобы: радиус подгрузки листов, тайлов", 10, 200, "int"),
    { path: "mobPackGlow", label: "Мобы: листы свечения 16 бит/пиксель (RGBA 5551) — вдвое меньше видеопамяти", t: "bool" },
    { path: "_hc", label: "Кэш ресурсов у игрока", t: "hdr" },
    { path: "assetCache", label: "Кэш ресурсов (скачать один раз, дальше только изменения); выкл — аварийно снять кэш у всех при следующем входе", t: "bool" },
    { path: "_hv", label: "Видеопамять — сразу", t: "hdr" },
    N("vram.budgetPc", "ПК: бюджет видеопамяти текстур, МБ", 128, 8192, "int"), N("vram.budgetMob", "Телефон: бюджет видеопамяти текстур, МБ", 64, 4096, "int"),
    N("vram.gracePc", "ПК: выгрузить ненужную текстуру через, с", 1, 600, "int"), N("vram.graceMob", "Телефон: выгрузить ненужную текстуру через, с", 1, 600, "int"),
    N("vram.loadTilesPc", "ПК: радиус загрузки земли в видеопамять, клеток", 20, 150, "int"), N("vram.loadTilesMob", "Телефон: радиус загрузки земли, клеток", 20, 150, "int"),
    N("vram.hystTiles", "Запас до выгрузки (гистерезис), клеток сверх радиуса", 1, 40, "int"), N("vram.marginTiles", "Радиус не меньше обзора камеры + клеток", 0, 20, "int"),
    N("vram.upMsPc", "ПК: загрузка текстур в GPU, мс за кадр", 0.5, 16), N("vram.upMsMob", "Телефон: загрузка текстур в GPU, мс за кадр", 0.5, 16),
    { path: "_h1", label: "Анимация и свечение — сразу", t: "hdr" },
    N("fpsMul", "Скорость анимации пропсов, × (1 — как в атласе)", 0.25, 3), N("glow", "Сила свечения пропсов (*_glow), ×", 0, 3),
    ...LIGHT_TYPES.flatMap((t) => { const nm = ({ warm: "фонари", fire: "факелы и костры", cool: "кристаллы", violet: "звёздные кристаллы", lime: "пилоны", portal: "порталы и алтарь" } as any)[t];
      return [{ path: "_h_" + t, label: `Огни: ${nm}`, t: "hdr" as const }, N(`lt.${t}.haloS`, `${nm}: размер ореола, ×`, 0.2, 3), N(`lt.${t}.haloK`, `${nm}: сила ореола, ×`, 0, 3),
        N(`lt.${t}.poolS`, `${nm}: размер пятна на земле, ×`, 0.2, 3), N(`lt.${t}.poolK`, `${nm}: сила пятна на земле, ×`, 0, 3)]; }),
    { path: "_h2", label: "Точка излучения (px кадра; −1 — авто по свечению)", t: "hdr" },
    ...(["v3", "v2"] as const).flatMap((s) => EMIT_KEYS.flatMap((k) => { const nm = ({ lantern: "фонарь", torch: "факел", campfire: "костёр", crystal: "кристалл", star_crystal: "звёздный кристалл", pylon: "пилон" } as any)[k] || k, pre = s === "v3" ? "Пропсы 32" : "Пропсы 16";
      return [N(`em.${s}.${k}.x`, `${pre} · ${nm}: x`, -1, 128, "int"), N(`em.${s}.${k}.y`, `${pre} · ${nm}: y`, -1, 128, "int")]; }))] },
  rare: { name: "Редкие Отголоски", fields: [N("every.0", "Появление через, мин. с", 60, 86400, "int"), N("every.1", "Появление через, макс. с", 60, 86400, "int"), N("life", "Живёт, если не нашли, с", 30, 7200, "int")] },
  // 📋 Доска заданий (board.ts): общие настройки, таблица опыта, обучение, QoL
  bchest: { name: "🎁 Сундуки наград доски", fields: [
    { path: "_h_bc0", label: "Общее (за сданное задание с рангом — сундук в 🎁; вещи бросаются при открытии)", t: "hdr" },
    { path: "on", label: "Сундуки наград включены", t: "bool" },
    N("spread", "Уровень вещей: уровень задания ±", 0, 10, "int"), N("maxStore", "Хранится сундуков (полно — задание с рангом не сдаётся)", 1, 500, "int"),
    N("maxItems", "Потолок вещей в одном сундуке", 1, 200, "int"),
    { path: "_h_bc1", label: "Ранг задания → сундук", t: "hdr" },
    ...BC_RANKS.map((r): Field => ({ path: `rankTier.${r}`, label: `Ранг ${r}`, t: "enum", opts: [...BC_TIERS], optn: Object.fromEntries(BC_TIERS.map((t) => [t, BCHEST.tiers[t].name])) })),
    { path: "_h_bc1c", label: "Ранг → шанс, что сундук — ПРОКЛЯТЫЙ вариант своего яруса (тот же потолок чар, больше проклятых вещей), %; не больше 30 %, чёрные проклятые вещи — только в «Чёрном проклятом»", t: "hdr" },
    ...BC_RANKS.map((r): Field => N(`rankCurse.${r}`, `Ранг ${r}: проклятый сундук, % (не больше ${BC_CURSE_MAX})`, 0, BC_CURSE_MAX)),
    { path: "_h_bc1u", label: "Ранг → шанс, что сундук УЛУЧШИТСЯ при выдаче (бросок на сервере): на 1 ярус / сразу на 2 яруса, %", t: "hdr" },
    ...BC_RANKS.flatMap((r): Field[] => [{ ...N(`rankUp.${r}`, `Ранг ${r}: улучшение на 1 ярус, %`, 0, 100), h: "Шанс, что сундук ранга станет на ярус лучше (простой → добротный). Сумма с «на 2 яруса» — не больше 100 %." },
      { ...N(`rankUp2.${r}`, `Ранг ${r}: улучшение сразу на 2 яруса, %`, 0, 100), h: "Шанс прыжка через ярус (простой → редкий). Бросается первым." }]),
    { path: "_h_bc1r", label: "Сундук ЗА РАНГ по разделам доски (выкл. — только сундук задания: своё поле «Сундуки» или по типу ниже)", t: "hdr" },
    ...BC_CATS.map((c): Field => ({ path: `rankChest.${c}`, label: `${BC_CAT_NAMES[c]}: случайный сундук за ранг`, t: "bool", h: c === "hunt" ? "Охота: по умолчанию выключено — вместо случайного сундука ранга выдаётся сундук задания (тип «Заказ»)." : "Вкл. — за сданное задание с рангом выдаётся сундук яруса ранга (как раньше)." })),
    { path: "_h_bc1q", label: "Сундук по ТИПУ квеста (наследуется, если у квеста/задания нет своего поля «Сундуки» и не стоит «без сундука»)", t: "hdr" },
    ...Object.keys(BCHEST.qdef).flatMap((k): Field[] => [
      { ...N(`qdef.${k}.n`, `${QDEF_NAMES[k] || k}: сколько сундуков`, 0, 10, "int"), h: "0 — без сундука по умолчанию. Свой список «Сундуки» у квеста заменяет это значение." },
      { path: `qdef.${k}.t`, label: `${QDEF_NAMES[k] || k}: ярус`, t: "enum", opts: [...BC_TIERS], optn: Object.fromEntries(BC_TIERS.map((t) => [t, BCHEST.tiers[t].name])), h: "Базовый ярус сундука до броска улучшения." },
      { ...N(`qdef.${k}.u`, `${QDEF_NAMES[k] || k}: улучшение на 1 ярус, %`, 0, 100), h: "«Шанс улучшиться до …» следующего яруса. Показывается игроку в окне квеста." },
      { ...N(`qdef.${k}.u2`, `${QDEF_NAMES[k] || k}: улучшение на 2 яруса, %`, 0, 100), h: "Шанс прыжка через ярус. Сумма с «на 1 ярус» ≤ 100 %." }]),
    { path: "_h_bc1a", label: "Вид сундука по рангу — только если нужно отличие от яруса (по умолчанию «как у яруса»: вид = содержимое)", t: "hdr" },
    ...BC_RANKS.map((r): Field => ({ path: `rankArt.${r}`, label: `Ранг ${r} — вид`, t: "enum", ...{ opts: ["", ...BC_ART], optn: { "": "как у яруса", ...Object.fromEntries(BC_ART.map((k) => [k, (k.startsWith("cursed_") ? "проклятый " : "") + (RAR_NAMES[k.replace("cursed_", "")]?.name || k)])) } } })),
    { path: "_h_bc2", label: "Сколько вещей (от/до) по разделам", t: "hdr" },
    ...BC_CATS.flatMap((c) => [N(`count.${c}.min`, `${BC_CAT_NAMES[c]}: вещей от`, 1, 200, "int"), N(`count.${c}.max`, `${BC_CAT_NAMES[c]}: вещей до`, 1, 200, "int")]),
    { ...N("count.quest.min", "Сюжетные и свои квесты: вещей от", 1, 200, "int"), h: "Сколько вещей выпадает при открытии сундука за квест у NPC (минимум)." }, { ...N("count.quest.max", "Сюжетные и свои квесты: вещей до", 1, 200, "int"), h: "Максимум вещей в сундуке за квест у NPC." },
    ...BC_TIERS.flatMap((t): Field[] => [
      { path: `_h_bct_${t}`, label: `Ярус: ${BCHEST.tiers[t].name}`, t: "hdr" },
      { path: `tiers.${t}.name`, label: "Название", t: "text" }, { path: `tiers.${t}.art`, label: "Анимация и иконка (рисунок художника)", t: "enum", opts: [...BC_ART], optn: Object.fromEntries(BC_ART.map((k) => [k, (k.startsWith("cursed_") ? "проклятый " : "") + (RAR_NAMES[k.replace("cursed_", "")]?.name || k)])) }, { path: `tiers.${t}.color`, label: "Цвет", t: "color" },
      { path: `tiers.${t}.minRar`, label: "Мин. редкость вещей (если в окне уровней таких нет — опускается)", t: "enum", opts: [...BC_RARS], optn: Object.fromEntries(BC_RARS.map((r) => [r, RAR_NAMES[r]?.name || r])) },
      { path: `tiers.${t}.maxRar`, label: "Макс. редкость вещей (качество не выше)", t: "enum", opts: [...BC_RARS], optn: Object.fromEntries(BC_RARS.map((r) => [r, RAR_NAMES[r]?.name || r])) },
      N(`tiers.${t}.boost`, "Сдвиг редкости: вес вещи = общий шанс дропа × boost^ступень редкости (1 — как с мобов)", 0.1, 50),
      N(`tiers.${t}.enchMult`, "Зачарование: × общий шанс зачарованного моба (Σ «появление» ярусов ✦), по шансам — не упирается в 100 %", 0, 50), N(`tiers.${t}.enchMax`, `Ярус зачарования не выше (0 — нет; потолок яруса — ${BC_ENCH_CAP[t] ? `${BC_ENCH_CAP[t]} «${ENCH.tiers[BC_ENCH_CAP[t] - 1].name}»` : "0, без чар"})`, 0, BC_ENCH_CAP[t], "int"),
      N(`tiers.${t}.enchBoost`, "Сдвиг яруса зачарования: вес = «появление» × boost^(ярус−1)", 0.1, 50),
      N(`tiers.${t}.curseMult`, "Проклятие: × общая доля проклятых в дропе проклятого босса (☠ Проклятие), по шансам — не упирается в 100 %", 0, 100),
      { path: `tiers.${t}.nameC`, label: "☠ Проклятый вариант: название", t: "text" },
      { path: `tiers.${t}.artC`, label: "☠ Проклятый вариант: анимация и иконка", t: "enum", opts: [...BC_ART], optn: Object.fromEntries(BC_ART.map((k) => [k, (k.startsWith("cursed_") ? "проклятый " : "") + (RAR_NAMES[k.replace("cursed_", "")]?.name || k)])) },
      N(`tiers.${t}.cCurseMult`, "☠ Проклятый вариант: × общая доля проклятых (вместо обычного множителя)", 0, 100),
      { path: `tiers.${t}.dark`, label: "Тёмный тон рисунка (оба варианта; у «Чёрного» своего листа нет)", t: "bool" },
      N(`tiers.${t}.blkPct`, "Очернение (Чёрный маг): шанс очернённой вещи, %", 0, 100), N(`tiers.${t}.blkMin`, "Очернение: от, %", 1, 99, "int"), N(`tiers.${t}.blkMax`, "Очернение: до, %", 1, 99, "int"),
      N(`tiers.${t}.blkCurve`, "Очернение: перекос (>1 — чаще малое, редко большое)", 0.2, 10),
    ]),
  ] },
  board: { name: "📋 Доска заданий: настройки", fields: [
    { path: "_h_b1", label: "Общее", t: "hdr" }, { path: "on", label: "Доска включена", t: "bool" },
    ...CATS.map((c): Field => ({ path: `cats.${c}`, label: `Вкладка «${CAT_NAMES[c]}»`, t: "bool" })),
    { path: "_h_bp", label: "Случайный пул (каждому игроку — своё на период; вес задания — в «Задания доски»)", t: "hdr" },
    N("dailyMin", "Ежедневных в день: от", 0, 12, "int"), N("dailyMax", "Ежедневных в день: до", 0, 12, "int"),
    N("weeklyMin", "Еженедельных в неделю: от", 0, 12, "int"), N("weeklyMax", "Еженедельных в неделю: до", 0, 12, "int"),
    N("monthlyMin", "Ежемесячных в месяц: от", 0, 12, "int"), N("monthlyMax", "Ежемесячных в месяц: до", 0, 12, "int"),
    N("hardMin", "Тяжёлых в неделю: от", 0, 12, "int"), N("hardMax", "Тяжёлых в неделю: до", 0, 12, "int"),
    { path: "_h_br", label: "Ранги F…SS повторяющихся заданий: вес выпадения, +уровней врагов к уровню героя, множитель опыта, множитель количества, бонусных условий", t: "hdr" },
    ...RANKS.flatMap((r): Field[] => [N(`ranks.${r}.w`, `${r}: вес выпадения`, 0, 1000), N(`ranks.${r}.plus`, `${r}: +уровней врагов/задания`, -10, 20, "int"),
      N(`ranks.${r}.mul`, `${r}: множитель опыта`, 0, 50), N(`ranks.${r}.cnt`, `${r}: множитель количества`, 0.1, 10), N(`ranks.${r}.bon`, `${r}: бонусных условий (0–3)`, 0, 3, "int")]),
    ...RANK_CATS.flatMap((c): Field[] => [{ path: `rankOn.${c}`, label: `Ранги: ${CAT_NAMES[c]}`, t: "bool" }, N(`catPlus.${c}`, `${CAT_NAMES[c]}: +уровней сверх ранга`, -5, 10, "int")]),
    { path: "_h_bb", label: "Бонусные условия (проверяет только сервер)", t: "hdr" }, N("bonusXp", "Опыт за каждое выполненное бонусное, % от опыта ранга", 0, 500),
    ...Object.keys(BONUS_NAMES).map((k): Field => ({ path: `bonus.${k}.on`, label: `Бонус в пуле: ${BONUS_NAMES[k]}`, t: "bool" })),
    N("bonus.higher.n", "«Враги выше вас»: на сколько уровней", 1, 15, "int"),
    ...RANK_CATS.map((c) => N(`bonus.fast.${c}`, `«Уложиться»: ${CAT_NAMES[c]}, минут`, 5, 10000, "int")),
    N("npcMax", "Личных заданий персонажей взято одновременно", 1, 30, "int"),
    N("huntMax", "Доска объявлений: взятых заказов одновременно", 1, 20, "int"), N("huntOffer", "Доска объявлений: заказов охоты в день", 1, 30, "int"), N("huntBossOffer", "…из них боссов и редких", 0, 10, "int"),
    { path: "_h_nb", label: "Доска объявлений (стартовая площадь Аринара) и Доска достижений (Алтарь тел)", t: "hdr" },
    { path: "nbWorld", label: "Доска объявлений: мир", t: "enum", opts: ["arinar", "hellfire"], optn: { arinar: "Аринар", hellfire: "Хаб" } }, N("nbX", "Доска объявлений: x", 0, 48000, "int"), N("nbY", "Доска объявлений: y", 0, 48000, "int"), N("nbRange", "Доска объявлений: радиус, px", 40, 300, "int"),
    { path: "abWorld", label: "Доска достижений: мир", t: "enum", opts: ["hellfire", "arinar"], optn: { arinar: "Аринар", hellfire: "Хаб" } }, N("abX", "Доска достижений: x", 0, 48000, "int"), N("abY", "Доска достижений: y", 0, 48000, "int"), N("abRange", "Доска достижений: радиус, px", 40, 300, "int"), N("pinMax", "Отслеживаемых заданий (трекер, стрелки, карта)", 1, 30, "int"), N("trackMax", "Отслеживаемых врагов из Бестиария", 1, 30, "int"), { path: "bars.ach", label: "Шкала прогресса достижений", t: "bool" }, { path: "bars.lib", label: "Шкала прогресса Бестиария", t: "bool" },
    { path: "_h_b2", label: "Сброс (часовой пояс — Киев)", t: "hdr" }, { path: "tz", label: "Часовой пояс", t: "text" }, N("resetHour", "Час сброса (0–23)", 0, 23, "int"), N("weekDay", "День недельного сброса (1 = пн … 7 = вс)", 1, 7, "int"),
    { path: "_h_b3", label: "Опыт: % от опыта на уровень (по уровню цели × сложность)", t: "hdr" },
    ...[0, 1, 2, 3, 4, 5].flatMap((b) => [N(`bands.${b}`, `Полоса ${b + 1}: до уровня`, 1, 30, "int"), ...[0, 1, 2, 3, 4].map((d) => N(`xp.${b}.${d}`, `Полоса ${b + 1} · сложность ${d + 1}, %`, 0, 100))]),
    N("refPlus", "Устарело, не используется (опыт — число от уровня задания)", 0, 30, "int"),
    { path: "xbody.on", label: "Задания на другое тело (случайно в наборе)", t: "bool" }, N("xbody.pct", "Доля заданий на другое тело, %", 0, 100),
    N("mobWin", "Повторяющиеся на конкретного врага: враг не ниже уровня героя минус N", 0, 30, "int"),
    { path: "_h_b6", label: "Опыт по категориям: множитель к таблице и потолок за период (% опыта на уровень; 0 — без потолка)", t: "hdr" },
    ...CATS.flatMap((c): Field[] => [N(`xpMul.${c}`, `${CAT_NAMES[c]}: множитель опыта`, 0, 10),
      ...(c === "tut" ? [] : [N(`caps.${c}`, `${CAT_NAMES[c]}: потолок, % уровня ${c === "weekly" || c === "hard" ? "в неделю" : c === "monthly" ? "в месяц" : "в сутки"}`, 0, 500)])]),
    { path: "_h_b4", label: "Обучение", t: "hdr" }, { path: "tutOn", label: "Обучение включено", t: "bool" }, { path: "tutSkip", label: "Можно пропустить целиком", t: "bool" },
    { path: "dailyFixed", label: "Ежедневные у всех каждый день (id через запятую)", t: "ltext" }, N("tutVetLvl", "Опытный игрок с уровня, включительно («больше десятого» = 11) (обучение засчитано сразу)", 1, 31, "int"),
    { path: "tutVetReward", label: "Опытному игроку — награды за шаги обучения тоже выдаются (один раз, без повторов)", t: "bool" },
    { path: "_h_b5", label: "Удобство (QoL)", t: "hdr" }, { path: "qol.help", label: "Справка по управлению (F1 / ❔)", t: "bool" }, { path: "qol.lowHp", label: "Предупреждение о низком ОЗ", t: "bool" },
    N("qol.lowHpPct", "Низкое ОЗ, %", 5, 80, "int"), { path: "qol.lvlInfo", label: "Что открылось на новом уровне", t: "bool" }, { path: "qol.talentNag", label: "Напоминание о свободных очках талантов", t: "bool" },
    { path: "qol.bmArrow", label: "Стрелка трекера к Чёрному магу (живая позиция)", t: "bool" },
    { path: "qol.bossTimer", label: "Мировые боссы: таймер появления в трекере, охоте, заданиях, на карте и у метки", t: "bool" }, N("qol.bossSoonSec", "Мировые боссы: «появляется» за сколько секунд до спавна", 0, 120, "int"),
    { path: "qol.campTimer", label: "Логова и лагеря: таймер возрождения на карте, мини-карте и у логова (игрок может скрыть в настройках)", t: "bool" },
    N("qol.campZoom", "Мини-карта: таймеры лагерей с приближения (× к самому дальнему обзору; 1 — всегда, обычный ≈1.5, ближе всего — 3)", 0.5, 8), N("qol.campNear", "Таймер в мире: показывать ближе, px", 100, 4000, "int"),
    { path: "_h_bfit", label: "Редкие и боссы по уровню героя", t: "hdr" }, { path: "fit.on", label: "Общие задания «редкие / боссы / мировые боссы»: цель по уровню героя", t: "bool" },
    N("fit.below", "Окно целей: ниже, ур.", 0, 30, "int"), N("fit.above", "Окно целей: выше, ур.", 0, 30, "int"),
    N("fit.resPct", "Ресурсы: +% за каждый уровень цели", 0, 100), N("fit.tierLvl", "Сундук: +1 ярус за каждые N ур. цели (0 — нет)", 0, 60, "int"), N("fit.tierMax", "Сундук: не больше +N ярусов", 0, 5, "int"),
  ] },
  btask: { name: "📋 Задание доски", fields: [
    { path: "cat", label: "Раздел (выбирается при создании)", t: "enum", opts: CATS, optn: CAT_NAMES },
    { path: "ev", label: "Что нужно сделать (выбирается при создании)", t: "enum", opts: [...BT_EVS.map((e) => e.id), "ui"], optn: { ...Object.fromEntries(BT_EVS.map((e) => [e.id, e.name])), ui: "Действие в интерфейсе (обучение)" } },
    { path: "on", label: "Включено", t: "bool" }, { path: "title", label: "Название", t: "ltext" }, { path: "why", label: "Зачем (одна строка)", t: "ltext" },
    { path: "pc", label: "Подсказка: ПК", t: "ltext" }, { path: "mob", label: "Подсказка: телефон", t: "ltext" },
    { path: "giver", label: "Кто выдаёт и принимает: персонаж — в своём диалоге, Доска объявлений — у доски, «—» — в окне «Задания»", t: "enum", opts: GIVERS, optn: GIVER_NAMES },
    { path: "hl", label: "Подсветка (altar, mob, node, bag, npc:petr, btn:book…)", t: "text" },
    { path: "rmax", label: "Высший ранг при выпадении (пусто — S/SS только для боёв, забегов, испытаний)", t: "enum", opts: ["", ...RANKS], optn: { "": "по событию" } },
    { path: "rb", label: "На каком теле выполнять условие (сдаёт и получает награду — тело-владелец)", t: "enum", opts: ["", "any", ...HERO_IDS], optn: { "": "на своём теле (владелец)", any: "на любом теле", ...HERO_NAMES } },
    N("ord", "Порядок", 0, 9999, "int"), N("minLvl", "Доступно с уровня", 1, 30, "int"), N("maxLvl", "До уровня (пул периодических)", 1, 30, "int"), N("lvl", "Уровень задания (от него опыт по таблице; 0 — подобрать по цели)", 0, 30, "int"),
    { path: "req", label: "Сначала выполнить (id через запятую, id@ступень)", t: "ltext" },
    { path: "m", label: "Цель (моб, ресурс, biome:ice, role:tank…)", t: "text" }, { path: "f", label: "Условия (elite, cursed, ench, e1…e6, e3up, ewear6, party, solo, rare, boss, wboss, lvl, min, night…)", t: "text" },
    N("minT", "Забег не короче, с", 0, 3600, "int"),
    ...[0, 1, 2, 3, 4].flatMap((i) => [N(`n.${i}`, `Ступень ${i + 1}: сколько (0 — нет)`, 0, 1000000, "int"), N(`d.${i}`, `Ступень ${i + 1}: сложность 1–5`, 0, 5, "int")]),
    { path: "res", label: "Материалы за ступень (× номер ступени)", t: "resmap" }, { path: "item", label: "Предмет за последнюю ступень (id)", t: "text" },
    { path: "ch", label: "Сундуки за последнюю ступень (ярус, сколько, уровень вещей, потолок чар, проклятость, шанс улучшения)", t: "chests", h: "Пусто — сундук по типу задания (🎁 Сундуки наград → «Сундук по типу квеста»)." },
    { path: "chOff", label: "Без сундука (не выдавать даже сундук по типу)", t: "bool", h: "Вкл. — за задание сундук не выдаётся совсем." },
    { path: "auto", label: "Обучение: засчитать само (lvl:5, equipped:1…)", t: "text" },
    { path: "hidden", label: "Скрытое («???» до выполнения)", t: "bool" },
    { path: "hint", label: "Скрытое: подсказка до выполнения (необязательно; пусто — «Условие откроется, когда вы его выполните»)", t: "ltext" },
    { path: "xm", label: "Опыт задан вручную (иначе — по таблице от уровня задания)", t: "bool" },
    ...[0, 1, 2, 3, 4].map((i) => N(`x.${i}`, `Ступень ${i + 1}: опыт (число)`, 0, 10000000, "int")),
    N("w", "Вес в случайном пуле (0 — не выпадает)", 0, 100),
  ] },
};
export const TABLES: Record<Kind, Record<string, any>> = { bchest: { main: BCHEST }, board: { main: BOARD_CFG }, btask: BTASKS, mob: ZONE_MOBS, weapon: WEAPON_TYPES, item: ITEM_BY_ID, skill: SKILL_REGISTRY, loot: MONSTER_LOOT,
  spawn: { arinar: ZONE_GEN }, curse: { main: CURSE }, ench: { main: ENCH }, chest: { main: CHEST }, dash: { main: DASH_CFG }, gather: { main: GATHER_CFG }, npc: { main: NPC_CFG }, bmage: { main: BM_CFG }, bmagic: { main: BMA_CFG }, bpart: BM_PARTS, bmbody: BM_BODY, bmmob: BM_MOBS, bmcamp: BM_CAMPS, bmmcfg: { main: BMM_CFG }, light: { main: LIGHT_CFG }, ui: { main: UI_CFG }, terrain: { main: TERRAIN_CFG }, city: { main: CITY_CFG }, pk: { main: PK_CFG }, pos: { main: POS_CFG }, dn: { main: DN_CFG }, gfx: { main: GFX_CFG }, upgrade: { main: UPG }, biome: initZoneNames(WORLD_GEN.arinar.regions as any), region: Object.fromEntries(WORLD_GEN.arinar.regions.filter((r: any) => r.table.length).map((r: any) => [r.id, r])), boss: BOSS_TIMERS, rare: Object.fromEntries(WORLD_GEN.arinar.rares.map((r: any) => [r.type, r])) };
export const TRAITS: Record<string, Record<string, Trait[]>> = { weapon: {}, item: {}, skill: {} };

const getP = (o: any, p: string) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const setP = (o: any, p: string, v: any) => { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] = x[k] ?? {}; if (v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = v; };

export function validateTraits(list: any): Trait[] | string {
  if (!Array.isArray(list) || list.length > 6) return "черт — не больше 6";
  const out: Trait[] = [];
  for (const t of list) {
    const d = TRAIT_DEFS[t?.k]; if (!d) return `неизвестный эффект ${t?.k}`;
    const o: Trait = { k: t.k };
    for (const p of d.params) { const v = Number(t[p.k] ?? p.def); if (!Number.isFinite(v) || v < p.min || v > p.max) return `${d.name}: «${p.label}» вне ${p.min}…${p.max}`; o[p.k] = v; }
    out.push(o);
  }
  return out;
}
function validateLoot(patch: any): any | string {
  const out: any = {};
  if (patch.gear !== undefined) {
    if (!Array.isArray(patch.gear) || patch.gear.length > 20) return "gear: список до 20";
    out.gear = [];
    for (const g of patch.gear) { if (!ITEM_BY_ID[g?.item]) return `нет предмета ${g?.item}`; const c = Number(g.chance); if (!(c >= 0 && c <= 100)) return "шанс 0…100"; out.gear.push({ item: g.item, chance: c }); }
  }
  if (patch.materials !== undefined) {
    if (!Array.isArray(patch.materials) || patch.materials.length > 12) return "materials: список до 12";
    out.materials = [];
    for (const m of patch.materials) {
      if (!RESOURCES[m?.res]) return `нет ресурса ${m?.res}`; const c = Number(m.chance), a = Math.round(Number(m.qty?.[0])), b = Math.round(Number(m.qty?.[1]));
      if (!(c >= 0 && c <= 100) || !(a >= 1 && b >= a && b <= 99)) return "материал: шанс 0…100, кол-во 1…99"; out.materials.push({ res: m.res, chance: c, qty: [a, b] });
    }
  }
  return out;
}
/** чёрные мобы (этап В): свои «bbx_/bmx_/bcx_…» создаются по шаблону на время проверки; списки (дроп, состав, тело) — своя проверка */
const BMK: Record<string, { T: Record<string, any>; re: RegExp; make: (id: string, p: any) => any; max: () => number }> = {
  bmbody: { T: BM_BODY, re: CUSTOM_BB, make: (id, p) => makeBody(id, String(p?.slot || "torso")), max: () => BMM_CFG.maxCustomBody || 300 },
  bmmob: { T: BM_MOBS, re: CUSTOM_BM, make: (id, p) => makeMob(id, Number(p?.lvl) || 5, String(p?.cls || "warrior")), max: () => BMM_CFG.maxCustomMobs || 200 },
  bmcamp: { T: BM_CAMPS, re: CUSTOM_BC, make: (id) => makeCamp(id), max: () => BMM_CFG.maxCamps || 30 },
};
function validateBm(kind: string, id: string, patch: any): any | string {
  const K = BMK[kind]; if (!patch || typeof patch !== "object") return "пустой патч";
  let made = false;
  if (!K.T[id]) { if (!K.re.test(id)) return "нет такой сущности"; if (Object.keys(K.T).filter((k) => K.re.test(k)).length >= K.max()) return `своих не больше ${K.max()}`; K.T[id] = K.make(id, patch); made = true; }
  try {
    const P = K.T[id], rest: any = {}, out: any = {};
    for (const [k, v] of Object.entries(patch)) {
      if (kind === "bmmob" && k === "drops") { const d = cleanDrops(v); if (typeof d === "string") return d; out.drops = d; }
      else if (kind === "bmcamp" && k === "mobs") { const d = cleanCampMobs(v); if (typeof d === "string") return d; out.mobs = d; }
      else if (kind === "bmmob" && (k.startsWith("body.") || k.startsWith("weapon.") || k === "artId")) { const t = String(v ?? "").trim(); if (!/^[A-Za-z0-9_]{0,48}$/.test(t)) return `${k}: латиница`; out[k] = t; }
      else if (kind === "bmcamp" && k === "chief") { const t = String(v ?? "").trim(); if (t && !ZONE_MOBS[t] && !BM_MOBS[t]) return `вожак: нет моба ${t}`; out.chief = t; }
      else if (kind === "bmbody" && k === "img") { const t = String(v ?? "").trim(); if (!/^[a-z0-9_-]{0,48}$/.test(t)) return "лист: латиница"; out.img = t; }
      else rest[k] = v;
    }
    const r = validatePatch0(kind as Kind, id, rest); if (typeof r === "string") return r; Object.assign(out, r);
    if (kind === "bmbody" && !K.re.test(id) && out.slot !== undefined && out.slot !== (ORIG.get("bmbody:" + id)?.slot ?? P.slot)) return "слот встроенной части не меняется — создайте новую";
    if (kind === "bmmob") { const c = JSON.parse(JSON.stringify(P)); for (const [k, v] of Object.entries(out)) setP(c, k, v); const e = mobErr(c); if (e) return e; }
    if (kind === "bmcamp") { const a = out.respawnMin ?? P.respawnMin, b = out.respawnMax ?? P.respawnMax; if (a > b) return "возрождение: «от» больше «до»"; }
    if (K.re.test(id) && kind === "bmbody") out.slot = out.slot ?? P.slot;
    return out;
  } finally { if (made) delete K.T[id]; }
}
/** деталь оружия (этап Б): своя деталь «bpx_…», которой ещё нет, создаётся по шаблону на время проверки; тип встроенной не меняется */
function validateBpart(id: string, patch: any): any | string {
  let made = false;
  if (!BM_PARTS[id]) {
    if (!CUSTOM_BP.test(id)) return "нет такой сущности";
    if (Object.keys(BM_PARTS).filter((k) => CUSTOM_BP.test(k)).length >= (BMA_CFG.maxCustomParts || 300)) return `своих деталей не больше ${BMA_CFG.maxCustomParts || 300}`;
    const t = String(patch?.type || ""); if (!(BP_TYPES as readonly string[]).includes(t)) return "тип детали: выберите из списка";
    BM_PARTS[id] = makeBpart(id, t, String(patch?.elem || "fire")); made = true;
  }
  const P = BM_PARTS[id], custom = CUSTOM_BP.test(id);
  if (!custom && patch?.type !== undefined && String(patch.type) !== String((ORIG.get("bpart:" + id)?.type) ?? P.type)) return "тип встроенной детали не меняется — создайте новую деталь";
  const r = validatePatch0("bpart", id, patch);
  if (made) delete BM_PARTS[id];
  if (typeof r === "string") return r;
  if (r.img !== undefined && !/^[a-z0-9_-]{0,48}$/.test(String(r.img))) return "лист Художника: латиница, цифры, _ и - (до 48)";
  if (r.icon !== undefined && String(r.icon).length > 8) return "значок: до 8 символов";
  const ty = r.type ?? P.type;
  if (r.ranged && ty !== "blade") return "дальний бой — только у основного лезвия";
  return r;
}
/** Проверка патча: только поля схемы, числа в диапазоне. Возвращает очищенный патч или текст ошибки. */
/** Проверка правки. Задание доски с id «cx_…», которого ещё нет, — новое (из админки): шаблон создаётся на время проверки
 *  и удаляется, если правка не прошла. Раздел и событие встроенного задания менять нельзя (на них завязаны счётчики игроков). */
export function validatePatch(kind: Kind, id: string, patch: any): any | string {
  if (kind === "bpart") return validateBpart(id, patch);
  if (BMK[kind]) return validateBm(kind, id, patch);
  if (kind !== "btask") return validatePatch0(kind, id, patch);
  let made = false;
  if (!TABLES.btask[id]) {
    if (!CUSTOM_BT.test(id)) return "нет такой сущности";
    if (Object.keys(BTASKS).filter((k) => CUSTOM_BT.test(k)).length >= 400) return "новых заданий не больше 400";
    const cat = String(patch?.cat || ""), ev = String(patch?.ev || "");
    if (!BT_CATS_NEW.includes(cat as Cat)) return "раздел: выберите из списка";
    if (!BT_EVS.some((e) => e.id === ev)) return "что нужно сделать: выберите из списка";
    BTASKS[id] = makeBtask(id, cat as Cat, ev); made = true;
  }
  const T = TABLES.btask[id], custom = CUSTOM_BT.test(id);
  if (patch && typeof patch === "object") {
    for (const p of ["cat", "ev"]) if (patch[p] !== undefined && String(patch[p]) !== String(T[p]) && !(made)) {
      if (!custom) { if (made) delBtask(id); return "раздел и «что сделать» у встроенного задания не меняются — сделайте копию"; }
      return "раздел и «что сделать» задаются при создании — сделайте копию";
    }
    if (custom && patch.cat === "tut") { if (made) delBtask(id); return "обучение — только встроенные шаги"; }
  }
  const r = validatePatch0(kind, id, patch);
  if (typeof r === "string") { if (made) delBtask(id); return r; }
  if (custom) { r.cat = T.cat; r.ev = T.ev; } // для пересоздания при загрузке правок
  if (made) delBtask(id); // создаст applyOverride
  return r;
}
function validatePatch0(kind: Kind, id: string, patch: any): any | string {
  const S = SCHEMA[kind]; if (!S || !TABLES[kind][id]) return "нет такой сущности";
  if (!patch || typeof patch !== "object") return "пустой патч";
  if (kind === "loot") return validateLoot(patch);
  const out: any = {};
  for (const [p, v] of Object.entries(patch)) {
    if (p === "traits") { if (!S.traits) return "у этой сущности нет черт"; const t = validateTraits(v); if (typeof t === "string") return t; out.traits = t; continue; }
    const f = S.fields.find((x) => x.path === p); if (!f || f.t === "hdr") return `поле ${p} не редактируется`;
    if (f.t === "bool") out[p] = !!v;
    else if (f.t === "enum") { if (!f.opts!.includes(String(v))) return `${f.label}: недопустимо`; if (p === "rs" && v && kind === "item" && TABLES.item[id].slot !== "weapon") return "навык R — только у оружия"; out[p] = String(v); }
    else if (f.t === "resmap") {
      if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > 8) return `${f.label}: до 8 ресурсов`;
      const m: Record<string, number> = {};
      for (const [r, n] of Object.entries(v as any)) { const q = Math.round(Number(n)); if (!RESOURCES[r]) return `нет ресурса ${r}`; if (!(q >= 0 && q <= 999)) return "кол-во 0…999"; if (q) m[r] = q; }
      out[p] = m;
    }
    else if (f.t === "text" && kind === "dn" && p === "emitters") { const t = String(v ?? "").trim(); if (t.length > 4000) return `${f.label}: до 4000 символов`;
      if (t) { let o: any; try { o = JSON.parse(t); } catch { return `${f.label}: неверный JSON`; } if (!o || typeof o !== "object" || Array.isArray(o)) return `${f.label}: нужен объект`;
        for (const [k, e] of Object.entries(o)) { const a: any = Array.isArray(e) ? e : [(e as any)?.ex, (e as any)?.ey]; if (!/^[\w:.-]{1,64}$/.test(k) || !(a.length >= 2 && a.slice(0, 2).every((x: any) => Number.isFinite(+x) && Math.abs(+x) <= 300))) return `${f.label}: ${k} — [ex, ey], числа ±300`; } }
      out[p] = t; }
    else if (f.t === "text") { const t = String(v ?? "").replace(/[<>\u0000-\u001f]/g, "").trim(); if (kind === "dn" && ["duskStart", "night", "dawnStart", "day", "force"].includes(p) && !(p === "force" && !t) && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) return `${f.label}: ЧЧ:ММ`; if (kind === "dn" && p === "tz" && t) { try { new Intl.DateTimeFormat("en", { timeZone: t }); } catch { return `${f.label}: неизвестный пояс`; } } if (t.length > 48) return `${f.label}: до 48 символов`; if (!t && p === "name") return `${f.label}: не пусто`; out[p] = t; }
    else if (f.t === "ltext") { const t = String(v ?? "").replace(/[<>\u0000-\u001f]/g, "").trim(); if (t.length > 160) return `${f.label}: до 160 символов`; if (!t && p === "title") return `${f.label}: не пусто`; out[p] = t; }
    else if (f.t === "chests") { const e = bcSpecErr(v); if (e) return e; out[p] = bcSpecNorm(v); }
    else if (f.t === "color") { if (!/^#[0-9a-fA-F]{6}$/.test(String(v))) return `${f.label}: #rrggbb`; out[p] = String(v).toLowerCase(); }
    else if (f.t === "skills") { if (!Array.isArray(v) || v.length > 5 || !v.every((s) => MOB_SKILLS_LIST.includes(s))) return "навыки моба: до 5 из списка"; out[p] = [...new Set(v as string[])]; }
    else { const n = Number(v); if (!Number.isFinite(n) || n < f.min! || n > f.max!) return `${f.label}: ${f.min}…${f.max}`; out[p] = f.t === "int" ? Math.round(n) : n; }
  }
  if (kind === "region") { const R = TABLES.region[id]; for (const k of ["packs", "pack"]) { const a = out[k + ".0"] ?? R[k]?.[0], b = out[k + ".1"] ?? R[k]?.[1]; if (a != null && b != null && a > b) return `${k === "packs" ? "пачек" : "мобов"}: «от» больше «до»`; } }
  if (kind === "curse") { const C = TABLES.curse[id]; for (const k of ["bossSkills", "worldBossSkills"]) { const a = out[k + "Min"] ?? C[k + "Min"], b = out[k + "Max"] ?? C[k + "Max"]; if (a > b) return "навыков боссов: «от» больше «до»"; } }
  if (kind === "board") { // набор периода «от» ≤ «до»; хотя бы один ранг с весом
    for (const c of ["daily", "weekly", "monthly", "hard"]) { const lo = out[`${c}Min`] ?? BOARD_CFG[`${c}Min`], hi = out[`${c}Max`] ?? BOARD_CFG[`${c}Max`]; if (lo > hi) return `${CAT_NAMES[c as Cat]}: «от» больше «до»`; }
    if (!RANKS.some((r) => (out[`ranks.${r}.w`] ?? BOARD_CFG.ranks?.[r]?.w ?? 0) > 0)) return "Ранги: хотя бы у одного ранга вес должен быть больше 0";
  }
  if (kind === "ench") { const E = TABLES.ench[id]; for (let i = 0; i < ENCH_N; i++) { const a = out[`tiers.${i}.skMin`] ?? E.tiers[i].skMin, b = out[`tiers.${i}.skMax`] ?? E.tiers[i].skMax; if (a > b) return `ярус ${i + 1}: навыков «от» больше «до»`; } }
  if (kind === "btask") { const r = validateBtask(id, out); if (r) return r; }
  if (kind === "bchest") { const e = bchestErr((p) => (out[p] !== undefined ? out[p] : getP(BCHEST, p))); if (e) return e; }
  if (kind === "board") {
    const C = TABLES.board[id]; let prev = 0;
    for (let b = 0; b < 6; b++) { const x = out[`bands.${b}`] ?? C.bands?.[b]; if (!(x > prev)) return "полосы уровней должны расти"; prev = x; }
    if (prev < 30) return "последняя полоса — до 30 уровня";
    for (const c of ["daily", "weekly", "monthly"]) { const lo = out[c + "Min"] ?? C[c + "Min"], hi = out[c + "Max"] ?? C[c + "Max"]; if (lo > hi) return `${CAT_NAMES[c as keyof typeof CAT_NAMES]}: «от» больше «до»`; }
    if (out.tz != null) { try { new Intl.DateTimeFormat("en", { timeZone: out.tz || "Europe/Kyiv" }); } catch { return "Часовой пояс: неизвестный"; } }
  }
  if (kind === "rare") { const cur = TABLES.rare[id].every; const a = out["every.0"] ?? cur[0], b = out["every.1"] ?? cur[1]; if (a > b) return "мин. время больше макс."; }
  return out;
}
/** условия задания — названия для админки (флажки вместо ввода) */
export const BT_FLAG_NAMES: Record<string, string> = {
  elite: "элитный враг", cursed: "проклятый (враг/вещь)", ench: "зачарованный (любой ярус)", rare: "редкий враг", boss: "босс", wboss: "мировой босс",
  party: "в отряде", solo: "в одиночку", lvl: "враг не ниже уровня героя − 2", night: "ночью", midnight: "в полночь", hp10: "на последних 10% ОЗ",
  min: "считать минуты забега", ewear6: "в «Чёрной» вещи", wearc: "в проклятой вещи", wearc5: "в 5 проклятых вещах", dark50: "чернота героя 50+", naked: "без снаряжения",
  oneshot: "одним ударом (первый удар по целому врагу добил его)", skillonly: "только навыками (без автоатаки)", basiconly: "без навыков (только автоатака)",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((t) => [[`e${t}`, `ярус ${t} ровно`], [`e${t}up`, `ярус ${t} и выше`]])),
};
const BT_FLAGS = new Set(["elite", "cursed", "ench", "ewear6", "party", "solo", "rare", "boss", "wboss", "lvl", "min", "night", "midnight", "hp10", "wearc", "wearc5", "dark50", "naked", "oneshot", "skillonly", "basiconly"]);
function validateBtask(id: string, out: any): string | null {
  const T = TABLES.btask[id], get = (p: string, d: any) => (out[p] !== undefined ? out[p] : p.split(".").reduce((x: any, k) => x?.[k], T) ?? d);
  let prev = 0, end = false;
  for (let i = 0; i < 5; i++) {
    const n = get(`n.${i}`, 0), d = get(`d.${i}`, 0);
    if (!n) { if (i === 0) return "ступень 1: нужно число больше 0"; end = true; continue; }
    if (end) return `ступень ${i + 1}: после пустой ступени не может быть заполненной`;
    if (n <= prev) return `ступень ${i + 1}: должно быть больше предыдущей`;
    if (!(d >= 1 && d <= 5)) return `ступень ${i + 1}: сложность 1…5`;
    prev = n;
  }
  if (get("minLvl", 1) > get("maxLvl", 30)) return "«доступно с» больше «до уровня»";
  const f = String(get("f", "")); for (const x of f.split(",").map((s) => s.trim()).filter(Boolean)) if (!BT_FLAGS.has(x) && !isEnchFlag(x)) return `условие «${x}» неизвестно`;
  if (!/^[\w:]{0,40}$/.test(String(get("m", "")))) return "цель: латиница, цифры, «_» и «:»";
  { const m = String(get("m", "")), ev = String(get("ev", "")), orig = ORIG.get("btask:" + id)?.m ?? T.m; if (m !== orig || CUSTOM_BT.test(id)) { const e = btTargetErr(ev, m); if (e) return e; } }
  if (CUSTOM_BT.test(id) && T.cat === "npc" && !NPC_GIVERS.includes(String(get("giver", "")))) return "задание персонажа: выберите, кто его выдаёт (Петр, Кьют, Алзи, Китти или Лэйр)";
  const item = String(get("item", "")); if (item && !ITEM_BY_ID[item]) return `нет предмета ${item}`;
  for (const r of String(get("req", "")).split(",").map((s) => s.trim()).filter(Boolean)) { const rid = r.split("@")[0]; if (!TABLES.btask[rid]) return `нет задания ${rid}`; if (rid === id) return "задание не может требовать само себя"; }
  if (!/^[\w:]{0,40}$/.test(String(get("hl", "")))) return "подсветка: латиница, цифры, «_» и «:»";
  if (!/^[\w:]{0,40}$/.test(String(get("auto", "")))) return "авто: латиница, цифры, «_» и «:»";
  return null;
}
/** цель задания — только из списков (то же, что предлагает админка) */
export function btTargetErr(ev: string, m: string): string | null {
  const tg = BT_EVS.find((e) => e.id === ev)?.target ?? (ev === "ui" ? "ui" : "");
  if (tg === "ui") return null;
  if (tg === "state") return BT_STATES[m] || (m.startsWith("mob:") && ZONE_MOBS[m.slice(4)]) || (m.startsWith("world:") && WORLD_NAMES[m.slice(6)]) ? null : "состояние: выберите из списка";
  if (!m) return null;
  const ok: Record<string, (x: string) => boolean> = {
    mob: (x) => !!ZONE_MOBS[x] || (x.startsWith("biome:") && !!(BIOMES as any)[x.slice(6)]) || (x.startsWith("role:") && !!BT_ROLE_NAMES[x.slice(5)]) || (x.startsWith("cls:") && HERO_IDS.includes(x.slice(4) as any)),
    res: (x) => !!RESOURCES[x], loot: (x) => ["bag", "item", "res"].includes(x) || !!RESOURCES[x], recipe: (x) => RECIPES.some((r) => r.id === x),
    upmax: (x) => x === "max", room: (x) => !!ROOM_NAMES[x], trial: (x) => x === "full" || x === "max", pvp: (x) => x === "win",
    cat: (x) => (CATS as string[]).includes(x), world: (x) => !!WORLD_NAMES[x],
  };
  return ok[tg] ? (ok[tg](m) ? null : "цель: выберите из списка") : "у этого действия нет цели — оставьте пустой";
}
const ORIG = new Map<string, any>();
/** Наложить правку (патч поверх значений из кода). patch=null — вернуть исходное. */
export function applyOverride(kind: Kind, id: string, patch: any | null) {
  if (kind === "btask" && CUSTOM_BT.test(id)) { // своё задание: правка — создать по шаблону, сброс — удалить целиком
    ORIG.delete("btask:" + id); delBtask(id);
    if (patch) { BTASKS[id] = makeBtask(id, patch.cat, patch.ev); applyOverride0(kind, id, patch); prepXp(BTASKS[id]); }
    reindexBtasks(); return;
  }
  if (kind === "bpart" && CUSTOM_BP.test(id)) { // своя деталь: правка — создать по шаблону, сброс — удалить
    ORIG.delete("bpart:" + id); delete BM_PARTS[id];
    if (patch) { BM_PARTS[id] = makeBpart(id, String(patch.type || "blade"), String(patch.elem || "fire")); applyOverride0(kind, id, patch); }
    return;
  }
  if (BMK[kind] && BMK[kind].re.test(id) && !(kind === "bmmob" && BM_BUILTIN.has(id))) { // свой моб/часть/лагерь: правка — создать по шаблону, сброс — убрать из таблицы (вид в ZONE_MOBS остаётся для живых)
    const K = BMK[kind]; ORIG.delete(kind + ":" + id); delete K.T[id];
    if (patch) { K.T[id] = K.make(id, patch); applyOverride0(kind, id, patch); }
    if (kind !== "bmcamp") registerBlackMobs(ITEM_BY_ID as any); return;
  }
  applyOverride0(kind, id, patch);
  if (kind === "bmbody" || kind === "bmmob" || kind === "bmmcfg") registerBlackMobs(ITEM_BY_ID as any);
  if (kind === "btask") { if (BTASKS[id]) prepXp(BTASKS[id]); reindexBtasks(); } // опыт — по таблице, если не задан вручную
  if (kind === "board") prepAllXp(); // таблица опыта/множители поменялись — пересчитать (кроме заданных вручную)
  if (kind === "board") syncBoardCols(); // доски передвинули/выключили — коллизии за ними
}
function applyOverride0(kind: Kind, id: string, patch: any | null) {
  const o = TABLES[kind]?.[id]; if (!o) return;
  const key = kind + ":" + id;
  const paths = kind === "loot" ? ["gear", "materials"] : [...SCHEMA[kind].fields.map((f) => f.path)];
  if (!ORIG.has(key)) ORIG.set(key, Object.fromEntries(paths.map((p) => [p, JSON.parse(JSON.stringify(getP(o, p) ?? null))])));
  const orig = ORIG.get(key);
  for (const p of paths) setP(o, p, orig[p] === null ? undefined : JSON.parse(JSON.stringify(orig[p])));
  if (SCHEMA[kind].traits) delete TRAITS[kind][id];
  if (!patch) return;
  for (const [p, v] of Object.entries(patch)) {
    if (p === "traits") TRAITS[kind][id] = v as Trait[];
    else if (!SCHEMA[kind].fields.some((f) => f.path === p)) continue; // старые поля из D1 (например, статус типа оружия) — игнорируются
    else setP(o, p, v);
  }
}
/** значения из кода (до правок D1) для полей, где правка их меняет: админка показывает «по умолчанию: …» */
export function defaultDiff(kind: Kind, id: string): Record<string, any> | undefined {
  const orig = ORIG.get(kind + ":" + id), o = TABLES[kind]?.[id]; if (!orig || !o || kind === "loot") return undefined;
  const out: Record<string, any> = {};
  for (const [p, v] of Object.entries(orig)) if (JSON.stringify(v) !== JSON.stringify(getP(o, p) ?? null)) out[p] = v;
  return Object.keys(out).length ? out : undefined;
}
export function currentValues(kind: Kind, id: string) {
  const o = TABLES[kind][id]; if (!o) return null;
  if (kind === "loot") return { gear: o.gear, materials: o.materials };
  const v: any = Object.fromEntries(SCHEMA[kind].fields.map((f) => [f.path, getP(o, f.path) ?? null]));
  if (kind === "item" && v.salvage == null) v.salvage = salvageDefault(id);
  if (kind === "region" && v.bossOn == null) v.bossOn = true; // по умолчанию босс есть (флажок не должен выключить его случайно) // по умолчанию — текущая логика разбора
  if (SCHEMA[kind].traits) v.traits = TRAITS[kind][id] || [];
  return v;
}

// ── разделы формы админки (заголовки t:"hdr"): каждый раздел сохраняется отдельно — своя строка game_overrides ──
// Строка раздела: (kind, "<id>@<путь заголовка>"), например ("city", "main@_h_kill"), ("city", "main@npc.3._h").
// Поля до первого заголовка, черты (traits) и сущности без заголовков — раздел "_main" = прежняя строка (kind, id).
// Старые воркеры строки с «@» пропускают (validatePatch → «нет такой сущности»), поэтому формат совместим.
export const SEC_MAIN = "_main";
export const SEC_SEP = "@";
/** kinds с отдельным сохранением раздела (loot/btask — свои формы с полным патчем) */
export function sectionable(kind: Kind) { return kind !== "loot" && kind !== "btask" && !!SCHEMA[kind]; }
/** путь поля → раздел (путь заголовка или SEC_MAIN) */
export function sectionMap(kind: Kind): Record<string, string> {
  const m: Record<string, string> = { traits: SEC_MAIN }; let cur = SEC_MAIN;
  for (const f of SCHEMA[kind]?.fields || []) { if (f.t === "hdr") { cur = f.path; continue; } m[f.path] = cur; }
  return m;
}
export function sectionIds(kind: Kind): string[] { return [SEC_MAIN, ...(SCHEMA[kind]?.fields || []).filter((f) => f.t === "hdr").map((f) => f.path)]; }
export const secRowId = (id: string, sec: string) => (sec === SEC_MAIN ? id : id + SEC_SEP + sec);
/** "main@_h_kill" → ["main", "_h_kill"]; "main" → ["main", SEC_MAIN] */
export function splitRowId(rowId: string): [string, string] { const i = rowId.indexOf(SEC_SEP); return i < 0 ? [rowId, SEC_MAIN] : [rowId.slice(0, i), rowId.slice(i + 1)]; }
