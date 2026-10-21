import { rsOptions, SKILL_REGISTRY } from "./rsAny";
import { initZoneNames } from "./mapZones";
import { DASH_CFG } from "./dash";
import { GATHER_CFG } from "./gatherCfg";
import { UI_CFG } from "./uiCfg";
import { TERRAIN_CFG } from "./terrainCfg";
import { NPC_CFG } from "./npcWander";
import { BM_CFG } from "./bmCfg";
import { mobSkillOptions } from "./mobSkills";
// «Проклятые»: правки игровых данных из админ-панели — общая часть сервера и клиента (без D1).
// Схема полей (тип, диапазон) — ЕДИНСТВЕННЫЙ список того, что можно менять; патч вне схемы отклоняется.
// apply() восстанавливает исходное значение из кода и накладывает патч — повторное применение идемпотентно.
// Черты (traits) — эффекты в духе RPG Maker MZ «Traits/Effects»: поджог, кровотечение, яд, заморозка, замедление,
// отбрасывание, вампиризм — с параметрами; вешаются на оружие (тип), предмет и навык; применяет сервер при попадании.
import { ZONE_MOBS, WEAPON_TYPES, ITEM_BY_ID, ABILITY_BY_ID, MONSTER_LOOT, RESOURCES, salvageDefault } from "./defs";
import { RUN_SKILLS } from "./shared";
import { MOB_SKILLS_LIST } from "./mobSkills";
import { ZONE_GEN, BOSS_TIMERS, WORLD_GEN } from "./zoneGen";
import { CURSE } from "./cursed";
import { ENCH, ENCH_N } from "./enchant";
// шанс проклятого моба, % — живёт в ZONE_GEN.cursedPct (там его читают зона и тесты); правится во вкладке «☠ Проклятие» (curse.cursedPct)
if (!Object.getOwnPropertyDescriptor(CURSE, "cursedPct")) Object.defineProperty(CURSE, "cursedPct", { get: () => ZONE_GEN.cursedPct, set: (v: number) => { ZONE_GEN.cursedPct = v; }, enumerable: true });
import { CHEST } from "./chests";
import { UPG, UPG_ORDER } from "./upgrade";

export type Kind = "mob" | "weapon" | "item" | "skill" | "loot" | "spawn" | "boss" | "rare" | "region" | "curse" | "chest" | "dash" | "biome" | "upgrade" | "gather" | "npc" | "ench" | "bmage" | "ui" | "terrain";
export interface Field { path: string; label: string; t: "hdr" | "int" | "num" | "bool" | "enum" | "skills" | "resmap" | "color" | "text"; min?: number; max?: number; opts?: string[]; optl?: { id: string; name: string; group: string }[]; optn?: Record<string, string> }
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
  mob: { name: "Бестиарий", fields: [N("lvl", "Уровень", 1, 60, "int"), N("hp", "ОЗ", 1, Number.MAX_SAFE_INTEGER, "int"), N("dmg", "Урон", 0, 1e5), N("armor", "Броня", 0, 1e4), N("speed", "Скорость", 0, 400), N("aggro", "Агро, px", 0, 2000, "int"), N("xp", "Опыт", 0, 1e6, "int"), N("radius", "Радиус", 4, 200, "int"), { path: "skills", label: "Навыки моба (любые навыки игры, до 5)", t: "skills", optl: mobSkillOptions() }] },
  weapon: { name: "Оружие", traits: true, fields: [N("cd", "Перезарядка удара, мс", 100, 5000, "int"), { path: "atk.kind", label: "Форма удара", t: "enum", opts: ["proj", "line", "arc"] }, N("atk.range", "Дальность", 20, 800, "int"), N("atk.width", "Ширина", 4, 200, "int"), N("atk.arc", "Дуга, рад", 0.1, 3.2), N("atk.max", "Целей", 1, 10, "int"), N("atk.count", "Снарядов в залпе", 1, 9, "int"), N("atk.spread", "Веер, рад", 0, 2), N("atk.per", "Урон снаряда, ×", 0.05, 1), N("status.knock", "Отбрасывание", 0, 10),
    { path: "rs", label: "Навык оружия (R) для всего типа — важнее выпавшего (предмет может задать свой)", t: "enum", opts: ["", ...rsOptions().map((r) => r.id)], optl: rsOptions() }] }, // статусы — только чертами предметов
  item: { name: "Предметы", traits: true, fields: [N("lvl", "Ур. предмета", 1, 60, "int"), N("req", "Треб. уровень (надеть)", 1, 60, "int"), ...ST.map((k) => N("stats." + k, k, 0, 1e4)),
    // навык оружия (R): если задан — важнее навыка, выпавшего у экземпляра; «» — как выпало
    { path: "rs", label: "Навык оружия (R), важнее выпавшего — любой навык игры", t: "enum", opts: ["", ...rsOptions().map((r) => r.id)], optl: rsOptions() },
    { path: "salvage", label: "Разбор даёт (ресурс: кол-во)", t: "resmap" }] },
  skill: { name: "Навыки", traits: true, fields: [N("cd", "Перезарядка, с", 0.5, 120), N("power", "Сила, ×", 0.1, 10)] },
  loot: { name: "Дроп", fields: [] }, // gear/materials — таблицы, проверяются отдельно (validateLoot)
  // спавн Аринара (живые: сервер читает ZONE_GEN на каждом респавне/проверке) — лагеря и бродячие мобы
  spawn: { name: "Спавн", fields: [N("regenCombat", "Восстановление ХП в бою, × (вне боя — полное)", 0, 1), N("regenCombatSec", "«В бою» после удара/урона, с", 0, 60),
    N("levelGap.hit1", "Урон героя по мобу на 1 ур. выше, ×", 0, 1), N("levelGap.hit2", "Урон героя по мобу на 2 ур. выше, ×", 0, 1), N("levelGap.hit3", "Урон героя по мобу на 3+ ур. выше, ×", 0, 1),
    N("campRespawn", "Респавн лагеря, с (вожак ×2, кочевник ×1.5)", 5, 3600, "int"),
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
    N("respawnMult", "Восстановление узла, × (1 — как в коде)", 0.05, 20)] },
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
    { path: "blkGlitch", label: "Глитч чёрной половины героя (сдвиг на 1 px вправо)", t: "bool" }, N("blkGlitchHz", "Глитч: раз в секунду", 0, 10), N("heroLight", "Яркость спрайтов героев (1 — как было)", 0.3, 1.5),
    { path: "blkVisMode", label: "Очернение героя: slots — Σ по 5 слотам ÷ 5; avg — среднее надетых; max — самая чёрная вещь", t: "enum", opts: ["avg", "slots", "max"] },
    { path: "groundTalentsOff", label: "На проклятой земле не работают и таланты/ветка души", t: "bool" },
    N("sproutDays", "Роза: росток, дней", 0, 365), N("budDays", "Роза: бутон, дней", 0, 365), N("openDays", "Роза: раскрытие, дней", 0, 365),
    N("curseTilesPerDay", "Проклятая земля: рост радиуса, клеток/день", 0, 50), N("curseMaxTiles", "Проклятая земля: макс. радиус, клеток", 0, 500),
    N("trailSec", "Чёрный след мага (визуал), с", 0, 10)] },
  ui: { name: "Интерфейс", fields: [{ path: "on", label: "Новый стиль интерфейса «проклятое + очернённое» (выкл — прежний вид)", t: "bool" },
    N("glitch", "Глитч рамок: 0 — нет, 1 — под курсором, 2 — ещё редкие вздрагивания окон", 0, 2, "int"),
    N("biomeMix", "Цвет локации в металле рамок, % (0 — всегда фиолет проклятия)", 0, 100, "int"),
    { path: "ornaments", label: "Ромбы-застёжки на углах больших окон", t: "bool" },
    { path: "avatars", label: "Аватары героев (окно C, карточка героя, просмотр игрока)", t: "bool" },
    N("avatarCursedAt", "Очернённый аватар с очернения героя, %", 0, 100, "int")] },
  terrain: { name: "Рельеф", fields: [{ path: "waterBlock", label: "Вода и глубокая вода непроходимы для героев и ходячих мобов (берега и мостки — проходимы)", t: "bool" },
    { path: "lavaBlock", label: "Лава непроходима", t: "bool" },
    N("edge", "Полоса берега, px: насколько тело заходит на клетку жидкости со стороны суши", 0, 16, "int")] },
  rare: { name: "Редкие Отголоски", fields: [N("every.0", "Появление через, мин. с", 60, 86400, "int"), N("every.1", "Появление через, макс. с", 60, 86400, "int"), N("life", "Живёт, если не нашли, с", 30, 7200, "int")] },
};
export const TABLES: Record<Kind, Record<string, any>> = { mob: ZONE_MOBS, weapon: WEAPON_TYPES, item: ITEM_BY_ID, skill: SKILL_REGISTRY, loot: MONSTER_LOOT,
  spawn: { arinar: ZONE_GEN }, curse: { main: CURSE }, ench: { main: ENCH }, chest: { main: CHEST }, dash: { main: DASH_CFG }, gather: { main: GATHER_CFG }, npc: { main: NPC_CFG }, bmage: { main: BM_CFG }, ui: { main: UI_CFG }, terrain: { main: TERRAIN_CFG }, upgrade: { main: UPG }, biome: initZoneNames(WORLD_GEN.arinar.regions as any), region: Object.fromEntries(WORLD_GEN.arinar.regions.filter((r: any) => r.table.length).map((r: any) => [r.id, r])), boss: BOSS_TIMERS, rare: Object.fromEntries(WORLD_GEN.arinar.rares.map((r: any) => [r.type, r])) };
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
/** Проверка патча: только поля схемы, числа в диапазоне. Возвращает очищенный патч или текст ошибки. */
export function validatePatch(kind: Kind, id: string, patch: any): any | string {
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
    else if (f.t === "text") { const t = String(v ?? "").replace(/[<>\u0000-\u001f]/g, "").trim(); if (t.length > 48) return `${f.label}: до 48 символов`; if (!t && p === "name") return `${f.label}: не пусто`; out[p] = t; }
    else if (f.t === "color") { if (!/^#[0-9a-fA-F]{6}$/.test(String(v))) return `${f.label}: #rrggbb`; out[p] = String(v).toLowerCase(); }
    else if (f.t === "skills") { if (!Array.isArray(v) || v.length > 5 || !v.every((s) => MOB_SKILLS_LIST.includes(s))) return "навыки моба: до 5 из списка"; out[p] = [...new Set(v as string[])]; }
    else { const n = Number(v); if (!Number.isFinite(n) || n < f.min! || n > f.max!) return `${f.label}: ${f.min}…${f.max}`; out[p] = f.t === "int" ? Math.round(n) : n; }
  }
  if (kind === "region") { const R = TABLES.region[id]; for (const k of ["packs", "pack"]) { const a = out[k + ".0"] ?? R[k]?.[0], b = out[k + ".1"] ?? R[k]?.[1]; if (a != null && b != null && a > b) return `${k === "packs" ? "пачек" : "мобов"}: «от» больше «до»`; } }
  if (kind === "curse") { const C = TABLES.curse[id]; for (const k of ["bossSkills", "worldBossSkills"]) { const a = out[k + "Min"] ?? C[k + "Min"], b = out[k + "Max"] ?? C[k + "Max"]; if (a > b) return "навыков боссов: «от» больше «до»"; } }
  if (kind === "ench") { const E = TABLES.ench[id]; for (let i = 0; i < ENCH_N; i++) { const a = out[`tiers.${i}.skMin`] ?? E.tiers[i].skMin, b = out[`tiers.${i}.skMax`] ?? E.tiers[i].skMax; if (a > b) return `ярус ${i + 1}: навыков «от» больше «до»`; } }
  if (kind === "rare") { const cur = TABLES.rare[id].every; const a = out["every.0"] ?? cur[0], b = out["every.1"] ?? cur[1]; if (a > b) return "мин. время больше макс."; }
  return out;
}
const ORIG = new Map<string, any>();
/** Наложить правку (патч поверх значений из кода). patch=null — вернуть исходное. */
export function applyOverride(kind: Kind, id: string, patch: any | null) {
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
export function currentValues(kind: Kind, id: string) {
  const o = TABLES[kind][id]; if (!o) return null;
  if (kind === "loot") return { gear: o.gear, materials: o.materials };
  const v: any = Object.fromEntries(SCHEMA[kind].fields.map((f) => [f.path, getP(o, f.path) ?? null]));
  if (kind === "item" && v.salvage == null) v.salvage = salvageDefault(id);
  if (kind === "region" && v.bossOn == null) v.bossOn = true; // по умолчанию босс есть (флажок не должен выключить его случайно) // по умолчанию — текущая логика разбора
  if (SCHEMA[kind].traits) v.traits = TRAITS[kind][id] || [];
  return v;
}
