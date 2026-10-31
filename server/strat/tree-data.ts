// «Партия Чёрных королей» — ДАННЫЕ ДЕРЕВЬЕВ (технологии + деревья навыков Вождей + расовые имена/варианты узлов).
// Только сервер, админка и симулятор. В клиентскую сборку этот модуль НЕ попадает: сборщик подменяет его на
// tree-data.public.ts (пустые списки), а игрок получает дерево от сервера в каждом состоянии партии — урезанным
// (скрытые узлы без имён/эффектов). Подробно — ТЗ §14.F. Новые поля добавлять сюда же, а в .public.ts — пустую заглушку.
import type { Tech } from "./econ-cfg";
import type { ChiefNode, ChiefDef } from "./content-cfg";
// (ULTS объявлены ниже, до T — порядок важен)
export const TREE_DATA_FULL = true;
export const TECHS: Tech[] = [
  // ⚔ Натиск
  { id: "horse", br: "rush", era: 1, grp: "root", name: "Коневодство", eff: "открывает Конюшню; Всадник на 1 з дешевле", unlock: ["stable"], fx: { knightDisc: 1 } },
  { id: "ambush", br: "rush", era: 2, grp: "rush2", req: ["horse"], name: "Засада", eff: "+2 урона по фигуре, ходившей в прошлый ход", fx: { ambush: 2 } },
  { id: "steel", br: "rush", era: 2, grp: "rush2", req: ["horse"], name: "Сталь", eff: "+1 АТК всем; открывает Кузню", unlock: ["forge"], fx: { atk: 1 } },
  { id: "drill", br: "rush", era: 2, grp: "rush2", req: ["horse"], name: "Муштра", eff: "+ОД за ход (ОД-технология: Быстрая/Обычная +1, Тактическая +2)", fx: { ap: 1 } },
  { id: "warcry", br: "rush", era: 3, grp: "rush3a", req: ["ambush", "drill"], name: "Боевой клич", eff: "+1 АТК Ополченцам и Всадникам", fx: { atkK: { pawn: 1, knight: 1 } } },
  { id: "siegecraft", br: "rush", era: 3, grp: "rush3b", req: ["steel", "drill"], name: "Осадное дело", eff: "+2 АТК на вражеской территории", fx: { atkEnemyT: 2 } },
  // 🛡 Крепость
  { id: "masonry", br: "fort", era: 1, grp: "root", name: "Каменное дело", eff: "открывает Стену и Кузню; +1 БРН Стражам и Вождю", unlock: ["wall", "forge"], fx: { armK: { rook: 1, king: 1 } } },
  { id: "formation", br: "fort", era: 2, grp: "fort2", req: ["masonry"], name: "Строй", eff: "+1 БРН Ополченцу рядом с Ополченцем; +1 БРН у Вождя (радиус 2)", fx: { formation: 1, armKing2: 1 } },
  { id: "bastion", br: "fort", era: 2, grp: "fort2", req: ["masonry"], name: "Бастион", eff: "+1 БРН на своей территории", fx: { armOwnT: 1 } },
  { id: "beacons", br: "fort", era: 2, grp: "fort2", req: ["masonry"], name: "Сигнальные огни", eff: "+ОД за ход (ОД-технология: Быстрая/Обычная +1, Тактическая +2)", fx: { ap: 1 } },
  { id: "guardians", br: "fort", era: 3, grp: "fort3a", req: ["formation", "beacons"], name: "Гвардия", eff: "Вождь +10 HP; ещё +1 БРН у Вождя", fx: { kingHp: 10, armKing2: 1 } },
  { id: "citadel", br: "fort", era: 3, grp: "fort3b", req: ["bastion", "beacons"], name: "Цитадель", eff: "врагу нужен лишний ход осады твоих городов; +1 БРН на своей территории", fx: { siege: 1, armOwnT: 1 } },
  // ⚖ Торговля
  { id: "trade", br: "trade", era: 1, grp: "root", name: "Торговля", eff: "открывает Рынок; +1 з с каждого рудника и деревни", unlock: ["market"], fx: { goldMV: 1 } },
  { id: "merchants", br: "trade", era: 2, grp: "trade2", req: ["trade"], name: "Купцы", eff: "+2 з за ход", fx: { goldTurn: 2 } },
  { id: "guilds", br: "trade", era: 2, grp: "trade2", req: ["trade"], name: "Гильдии", eff: "постройки на 25% дешевле", fx: { bldDisc: 0.25 } },
  { id: "treasury", br: "trade", era: 3, grp: "trade3a", req: ["merchants"], name: "Казна", eff: "+3 з за ход", fx: { goldTurn: 3 } },
  { id: "caravans", br: "trade", era: 3, grp: "trade3b", req: ["guilds"], name: "Караваны", eff: "+2 з с каждого города", fx: { goldCity: 2 } },
  // 🌾 Экспансия
  { id: "farming", br: "expand", era: 1, grp: "root", name: "Земледелие", eff: "открывает Амбар; +1 рост каждому городу", unlock: ["granary"], fx: { growth: 1 } },
  { id: "settlers", br: "expand", era: 2, grp: "expand2", req: ["farming"], name: "Поселенцы", eff: "+1 застава; заставы можно ставить на 1 ближе", fx: { outposts: 1, outDist: 1 } },
  { id: "roads", br: "expand", era: 2, grp: "expand2", req: ["farming"], name: "Дороги", eff: "+1 клетка земли каждой заставе", fx: { outR: 1 } },
  { id: "empire", br: "expand", era: 3, grp: "expand3a", req: ["settlers"], name: "Империя", eff: "+1 клетка земли столице", fx: { capR: 1 } },
  { id: "colonies", br: "expand", era: 3, grp: "expand3b", req: ["roads"], name: "Колонии", eff: "Слава с территории вдвое быстрее", fx: { terrGlory: 2 } },
  // ✦ Тайное знание
  { id: "arcana", br: "arcana", era: 1, grp: "root", name: "Тайное знание", eff: "открывает Библиотеку и Башню магов", unlock: ["library", "magetower"], fx: {} },
  { id: "scribes", br: "arcana", era: 2, grp: "arcana2", req: ["arcana"], name: "Писцы", eff: "+1 знание с каждого города", fx: { knowCity: 1 } },
  { id: "battlemage", br: "arcana", era: 2, grp: "arcana2", req: ["arcana"], name: "Боевая магия", eff: "Маги стреляют на 3", fx: { shot: 3 } },
  { id: "academy", br: "arcana", era: 3, grp: "arcana3a", req: ["scribes"], name: "Академия", eff: "2 исследования за ход; +3 Славы за технологию", fx: { research: 1 } },
  { id: "archmage", br: "arcana", era: 3, grp: "arcana3b", req: ["battlemage"], name: "Архимаг", eff: "+2 АТК Магам", fx: { atkK: { mage: 2 } } },
  // Стихия — у каждой расы своя пара в каждой эпохе (свободна от корней тактик)
  { id: "wildfire", br: "elem", era: 1, grp: "fire1", race: "fire", name: "Пожар", eff: "поджог длится 3 хода", fx: { burnT: 1 } },
  { id: "embers", br: "elem", era: 1, grp: "fire1", race: "fire", name: "Угли", eff: "поджог: 2 урона вместо 1", fx: { burnD: 1 } },
  { id: "pyromancy", br: "elem", era: 2, grp: "fire2", race: "fire", name: "Пиромантия", eff: "Маги стреляют на 3", fx: { shot: 3 } },
  { id: "fury", br: "elem", era: 2, grp: "fire2", race: "fire", name: "Ярость", eff: "+2 урона по горящим", fx: { fury: 2 } },
  { id: "phoenix", br: "elem", era: 3, grp: "fire3", race: "fire", name: "Феникс", eff: "Вождь +10 HP", fx: { kingHp: 10 } },
  { id: "blaze", br: "elem", era: 3, grp: "fire3", race: "fire", name: "Зарево", eff: "+2 Славы за убийство", fx: { killGlory: 2 } },
  { id: "deepfreeze", br: "elem", era: 1, grp: "ice1", race: "ice", name: "Глубокий холод", eff: "обморозка на 2 хода", fx: { chillT: 1 } },
  { id: "frostarmor", br: "elem", era: 1, grp: "ice1", race: "ice", name: "Ледяная броня", eff: "+2 БРН Стражам", fx: { armK: { rook: 2 } } },
  { id: "icelance", br: "elem", era: 2, grp: "ice2", race: "ice", name: "Ледяное копьё", eff: "Маги стреляют на 3", fx: { shot: 3 } },
  { id: "rime", br: "elem", era: 2, grp: "ice2", race: "ice", name: "Иней", eff: "+3 урона по обмороженным (и ход спустя)", fx: { rime: 3 } },
  { id: "winterking", br: "elem", era: 3, grp: "ice3", race: "ice", name: "Зимний король", eff: "Вождь +10 HP", fx: { kingHp: 10 } },
  { id: "avalanche", br: "elem", era: 3, grp: "ice3", race: "ice", name: "Лавина", eff: "+2 Славы за убийство", fx: { killGlory: 2 } },
  { id: "undertow", br: "elem", era: 1, grp: "water1", race: "water", name: "Отлив", eff: "лечение на своей территории +1", fx: { heal: 1 } },
  { id: "tide", br: "elem", era: 1, grp: "water1", race: "water", name: "Прилив", eff: "+1 рост каждому городу", fx: { growth: 1 } },
  { id: "pearls", br: "elem", era: 2, grp: "water2", race: "water", name: "Жемчуг", eff: "+1 з с каждого города", fx: { goldCity: 1 } },
  { id: "currents", br: "elem", era: 2, grp: "water2", race: "water", name: "Стремнина", eff: "+1 клетка земли каждой заставе", fx: { outR: 1 } },
  { id: "leviathan", br: "elem", era: 3, grp: "water3", race: "water", name: "Левиафан", eff: "Вождь +10 HP", fx: { kingHp: 10 } },
  { id: "delta", br: "elem", era: 3, grp: "water3", race: "water", name: "Дельта", eff: "Слава с территории вдвое быстрее", fx: { terrGlory: 2 } },
  { id: "bedrock", br: "elem", era: 1, grp: "stone1", race: "stone", name: "Скала", eff: "+1 БРН Стражам", fx: { armK: { rook: 1 } } },
  { id: "quarrymen", br: "elem", era: 1, grp: "stone1", race: "stone", name: "Каменотёсы", eff: "постройки на 15% дешевле", fx: { bldDisc: 0.15 } },
  { id: "rampart", br: "elem", era: 2, grp: "stone2", race: "stone", name: "Вал", eff: "+1 БРН на своей территории", fx: { armOwnT: 1 } },
  { id: "hammer", br: "elem", era: 2, grp: "stone2", race: "stone", name: "Молот гор", eff: "+1 АТК Стражам и Вождю", fx: { atkK: { rook: 1, king: 1 } } },
  { id: "mountainking", br: "elem", era: 3, grp: "stone3", race: "stone", name: "Горный король", eff: "Вождь +10 HP", fx: { kingHp: 10 } },
  { id: "monolith", br: "elem", era: 3, grp: "stone3", race: "stone", name: "Монолит", eff: "врагу нужен лишний ход осады", fx: { siege: 1 } },
  { id: "thorns", br: "elem", era: 1, grp: "nature1", race: "nature", name: "Шипы", eff: "+1 БРН Ополченцам", fx: { armK: { pawn: 1 } } },
  { id: "bloom", br: "elem", era: 1, grp: "nature1", race: "nature", name: "Цветение", eff: "+1 знание с каждого города", fx: { knowCity: 1 } },
  { id: "grove", br: "elem", era: 3, grp: "nature3", race: "nature", name: "Чаща", eff: "+1 клетка земли столице (со 2-го уровня столицы)", fx: { capR: 1, capRLvl: 2 } },
  { id: "wildhunt", br: "elem", era: 2, grp: "nature2", race: "nature", name: "Дикая охота", eff: "+1 АТК Всадникам и Ополченцам", fx: { atkK: { knight: 1, pawn: 1 } } },
  { id: "worldtree", br: "elem", era: 2, grp: "nature2", race: "nature", name: "Древо", eff: "Вождь +10 HP", fx: { kingHp: 10 } },
  { id: "harvest", br: "elem", era: 3, grp: "nature3", race: "nature", name: "Урожай", eff: "+3 з за ход", fx: { goldTurn: 3 } },
  { id: "static", br: "elem", era: 1, grp: "light1", race: "lightning", name: "Статика", eff: "разряд: 3 урона вместо 2", fx: {} },
  { id: "spark", br: "elem", era: 1, grp: "light1", race: "lightning", name: "Искра", eff: "+2 урона по фигуре, ходившей в прошлый ход", fx: { ambush: 2 } },
  { id: "stormcall", br: "elem", era: 2, grp: "light2", race: "lightning", name: "Зов бури", eff: "Маги стреляют на 3", fx: { shot: 3 } },
  { id: "thunder", br: "elem", era: 2, grp: "light2", race: "lightning", name: "Гром", eff: "+1 АТК Всадникам", fx: { atkK: { knight: 1 } } },
  { id: "eyestorm", br: "elem", era: 3, grp: "light3", race: "lightning", name: "Око бури", eff: "+1 АТК всем", fx: { atk: 1 } },
  { id: "skyfire", br: "elem", era: 3, grp: "light3", race: "lightning", name: "Небесный огонь", eff: "+2 Славы за убийство", fx: { killGlory: 2 } },
  // ═══ ЭПОХА IV (t1139; только поля, где sizes.eras ≥ 4 — по умолчанию 15×15). В каждой тактике пара-развилка X4 (одна из двух):
  //     a — мощная вершина + легендарная постройка (одна на игрока, в столице); b — сильнейшая «чистая» вершина.
  //     t1140: усиление ультимейта Вождя даёт ВЕЛИКОЕ ЧУДО (cfg.build.wonder.fx). У каждой расы пара elem4: «путь Чуда» (Чудо усиливает ульту ещё) или стихийный апофеоз. Скрыты до эпохи III по общим правилам.
  { id: "warlords", br: "rush", era: 4, grp: "rush4", req: ["warcry", "siegecraft"], name: "Владыки войны", eff: "+2 АТК на вражеской земле; открывает Чертог войны", unlock: ["warhall"], fx: { atkEnemyT: 2 } },
  { id: "blitzking", br: "rush", era: 4, grp: "rush4", req: ["warcry", "siegecraft"], name: "Гроза полей", eff: "+1 АТК всем; +2 Славы за убийство", fx: { atk: 1, killGlory: 2 } },
  { id: "bulwark", br: "fort", era: 4, grp: "fort4", req: ["guardians", "citadel"], name: "Незыблемость", eff: "+1 БРН на своей земле; открывает Твердыню", unlock: ["stronghold"], fx: { armOwnT: 1 } },
  { id: "aegis", br: "fort", era: 4, grp: "fort4", req: ["guardians", "citadel"], name: "Эгида", eff: "Вождь +15 HP; +1 БРН всем", fx: { kingHp: 15, arm: 1 } },
  { id: "goldenage", br: "trade", era: 4, grp: "trade4", req: ["treasury", "caravans"], name: "Золотой век", eff: "+2 з с каждого города; открывает Монетный двор", unlock: ["mint"], fx: { goldCity: 2 } },
  { id: "patronage", br: "trade", era: 4, grp: "trade4", req: ["treasury", "caravans"], name: "Меценатство", eff: "+6 з за ход", fx: { goldTurn: 6 } },
  { id: "dominion", br: "expand", era: 4, grp: "expand4", req: ["empire", "colonies"], name: "Владычество", eff: "земля растёт быстрее; открывает Метрополию", unlock: ["metropolis"], fx: { terrGrow: 1, terrGlory: 1 } },
  { id: "manifest", br: "expand", era: 4, grp: "expand4", req: ["empire", "colonies"], name: "Предназначение", eff: "+1 поселение; +1 Слава с территории", fx: { outposts: 1, terrGlory: 1 } },
  { id: "omniscience", br: "arcana", era: 4, grp: "arcana4", req: ["academy", "archmage"], name: "Всеведение", eff: "+2 знания с каждого города; открывает Обсерваторию", unlock: ["observatory"], fx: { knowCity: 2 } },
  { id: "archon", br: "arcana", era: 4, grp: "arcana4", req: ["academy", "archmage"], name: "Архонт", eff: "+1 исследование за ход; +2 АТК Магам", fx: { research: 1, atkK: { mage: 2 } } },
  { id: "fire_wonder", br: "elem", era: 4, grp: "fire4", race: "fire", name: "Вечное пламя", eff: "Великое чудо сильнее усиливает ультимейт Вождя: ещё +2 силы, перезарядка −1", fx: { wonderUlt: 2, wonderCd: 1 } },
  { id: "inferno", br: "elem", era: 4, grp: "fire4", race: "fire", name: "Преисподняя", eff: "поджог +1 урона и +1 ход", fx: { burnD: 1, burnT: 1 } },
  { id: "ice_wonder", br: "elem", era: 4, grp: "ice4", race: "ice", name: "Вечная мерзлота", eff: "Великое чудо сильнее усиливает ультимейт Вождя: ещё +2 силы, перезарядка −1", fx: { wonderUlt: 2, wonderCd: 1 } },
  { id: "absolutezero", br: "elem", era: 4, grp: "ice4", race: "ice", name: "Абсолютный ноль", eff: "обморожение +1 ход; +2 урона по обмороженным", fx: { chillT: 1, rime: 2 } },
  { id: "water_wonder", br: "elem", era: 4, grp: "water4", race: "water", name: "Сердце океана", eff: "Великое чудо сильнее усиливает ультимейт Вождя: ещё +2 силы, перезарядка −1", fx: { wonderUlt: 2, wonderCd: 1 } },
  { id: "maelstrom", br: "elem", era: 4, grp: "water4", race: "water", name: "Мальстрём", eff: "+1 АТК всем", fx: { atk: 1 } },
  { id: "stone_wonder", br: "elem", era: 4, grp: "stone4", race: "stone", name: "Вечный колосс", eff: "Великое чудо сильнее усиливает ультимейт Вождя: ещё +2 силы, перезарядка −1", fx: { wonderUlt: 2, wonderCd: 1 } },
  { id: "earthcore", br: "elem", era: 4, grp: "stone4", race: "stone", name: "Ядро земли", eff: "+1 БРН всем", fx: { arm: 1 } },
  { id: "nature_wonder", br: "elem", era: 4, grp: "nature4", race: "nature", name: "Мировое древо", eff: "Великое чудо сильнее усиливает ультимейт Вождя: ещё +2 силы, перезарядка −1", fx: { wonderUlt: 2, wonderCd: 1 } },
  { id: "overgrowth", br: "elem", era: 4, grp: "nature4", race: "nature", name: "Буйный рост", eff: "лечение +1 за ход; земля растёт быстрее", fx: { heal: 1, terrGrow: 1 } },
  { id: "light_wonder", br: "elem", era: 4, grp: "light4", race: "lightning", name: "Небесный шпиль", eff: "Великое чудо сильнее усиливает ультимейт Вождя: ещё +2 силы, перезарядка −1", fx: { wonderUlt: 2, wonderCd: 1 } },
  { id: "thunderlord", br: "elem", era: 4, grp: "light4", race: "lightning", name: "Владыка грома", eff: "Маги стреляют на 4", fx: { shot: 4 } },
];

/**
 * УЛЬТИМЕЙТЫ ВОЖДЕЙ — один на тип, уровень 5 дерева (группа l5, альтернатива двум обычным узлам). Скрыты: игрок узнаёт о них,
 * только дойдя до развилки 5-го уровня (правило урезания дерева). Общие правила (ult.ts): ap ОД, перезарядка cd своих ходов,
 * цель — клетка в радиусе range (Чебышёв) от Вождя; бьёт только врагов; по вражескому Вождю — chiefMul урона и не ниже 1 HP
 * (ультой нельзя добить Вождя → цель «Цареубийство» не берётся одной кнопкой); era* — рост с эпохой стороны (эпоха III).
 */
export type UltDef = { name: string; eff: string; banner?: string; shape: "circle" | "square" | "chain" | "line"; ap: number; cd: number; range: number;
  r?: number; size?: number; eraSize?: number; dmg?: number; eraDmg?: number; hops?: number; eraHops?: number; hop?: number;
  burnCells?: number; chill?: number; shield?: number; shieldTurns?: number; push?: number; heal?: number; len?: number; root?: number; spawn?: number; eraSpawn?: number; chiefMul: number };
export const ULTS: Record<string, UltDef> = {
  doom: { name: "DOOM", banner: "DOOM", eff: "огненный круг ⌀5 клеток: тяжёлый урон врагам, земля горит", shape: "circle", ap: 2, cd: 7, range: 4, r: 2.5, dmg: 9, eraDmg: 2, burnCells: 3, chiefMul: 0.5 },
  blink: { name: "Молниеносный рывок", banner: "МОЛНИЕНОСНЫЙ РЫВОК", eff: "Вождь молнией перескакивает между 3 врагами (эпоха III — 4), бьёт каждого и встаёт рядом с последним", shape: "chain", ap: 2, cd: 7, range: 4, hop: 3, hops: 3, eraHops: 1, dmg: 7, eraDmg: 1, chiefMul: 0.5 },
  dome: { name: "Каменный купол", banner: "КАМЕННЫЙ КУПОЛ", eff: "щит над областью 3×3 (эпоха III — 5×5): свои фигуры поглощают урон 3 хода", shape: "square", ap: 2, cd: 7, range: 3, size: 3, eraSize: 5, shield: 10, shieldTurns: 3, chiefMul: 0.5 },
  blizzard: { name: "Белая мгла", banner: "БЕЛАЯ МГЛА", eff: "буран 5×5: урон и сильное замедление всем врагам в области", shape: "square", ap: 2, cd: 7, range: 4, size: 5, dmg: 5, eraDmg: 1, chill: 2, chiefMul: 0.5 },
  tide: { name: "Девятый вал", banner: "ДЕВЯТЫЙ ВАЛ", eff: "волна шириной 3 на 5 клеток от Вождя: урон и отброс врагов, лечение своих", shape: "line", ap: 2, cd: 7, range: 1, len: 5, dmg: 6, eraDmg: 1, push: 1, heal: 3, chiefMul: 0.5 },
  grove: { name: "Пробуждение леса", banner: "ПРОБУЖДЕНИЕ ЛЕСА", eff: "корни 5×5: враги не двигаются 2 хода и получают урон; вырастают 2 Древня-стража (эпоха III — 3)", shape: "square", ap: 2, cd: 7, range: 3, size: 5, dmg: 3, eraDmg: 1, root: 2, spawn: 2, eraSpawn: 1, chiefMul: 0.5 },
};
export const ULT_OF: Record<string, string> = { fire: "doom", lightning: "blink", stone: "dome", ice: "blizzard", water: "tide", nature: "grove" };

const T = (race: string, n: string[], tw: Record<string, Partial<ChiefNode>> = {}): ChiefNode[] => {
  const base: ChiefNode[] = [
    { id: "aura", lvl: 2, grp: "l2", kind: "passive", name: n[0], eff: "+1 БРН своим рядом (радиус 1)", fx: { auraArm: 1, r: 1 } },
    { id: "inspire", lvl: 2, grp: "l2", kind: "passive", name: n[1], eff: "+1 АТК своим рядом (радиус 1)", fx: { auraAtk: 1, r: 1 } },
    { id: "rally", lvl: 3, grp: "l3", req: ["aura"], kind: "active", name: n[2], eff: "1 ОД: лечит своих в радиусе 2 на 4 HP; перезарядка 4 хода", fx: { heal: 4, r: 2, cd: 4 } },
    { id: "tough", lvl: 3, grp: "l3", kind: "passive", name: n[3], eff: "+8 HP", fx: { hp: 8 } },
    { id: "zeal", lvl: 3, grp: "l3", req: ["inspire"], kind: "passive", name: n[4], eff: "+2 АТК себе", fx: { atk: 2 } },
    { id: "command", lvl: 4, grp: "l4", kind: "passive", name: n[5], eff: "+1 ОД за ход, пока жив", fx: { ap: 1 } },
    { id: "levy", lvl: 4, grp: "l4", kind: "active", name: n[6], eff: "1 ОД: призывает Ополченца рядом; перезарядка 5 ходов", fx: { summon: 1, cd: 5 } },
    { id: "banner", lvl: 5, grp: "l5", req: ["command"], kind: "passive", name: n[7], eff: "+2 Славы за ход", fx: { glory: 2 } },
    { id: "slayer", lvl: 5, grp: "l5", req: ["levy"], kind: "passive", name: n[8], eff: "+3 АТК против Вождя и Героя", fx: { slayer: 3 } },
  ];
  const u = ULTS[ULT_OF[race]];
  if (u) base.push({ id: "ult", lvl: 5, grp: "l5", kind: "active", name: u.name, eff: u.eff, ult: ULT_OF[race], fx: { cd: u.cd } }); // скрытый ультимейт (ТЗ: только админ-раздел)
  return base.map((b) => ({ ...b, ...(tw[b.id] || {}), fx: { ...b.fx, ...(tw[b.id]?.fx || {}) } }));
};
export const CHIEFS: ChiefDef[] = [
  { id: "fire_lord", v: 2, race: "fire", name: "Владыка пепла", sprite: "chief_fire", unlock: "free", base: { hp: 28, atk: 6, arm: 2 },
    tree: T("fire", ["Жар очага", "Пламенный клич", "Тёплые угли", "Закалённый", "Ярость пламени", "Огненный приказ", "Призыв пепла", "Пылающее знамя", "Палач королей"],
      { zeal: { eff: "+1 АТК себе; удар Вождя поджигает", fx: { atk: 1, burn: 1 } } }) }, // поджог ≈ 3 урона за бой → −1 АТК
  { id: "ice_warden", v: 2, race: "ice", name: "Хозяин стужи", sprite: "chief_ice", unlock: "free", base: { hp: 30, atk: 4, arm: 3 },
    tree: T("ice", ["Ледяной щит", "Клич бурана", "Тёплый очаг", "Вечная мерзлота", "Холодная злость", "Зимний приказ", "Снежная дружина", "Знамя севера", "Ледяной приговор"],
      { tough: { eff: "+6 HP; +1 БРН", fx: { hp: 6, arm: 1 } } }) }, // −2 HP +1 БРН ≈ +2 → компенсировано базой
  { id: "water_tide", v: 2, race: "water", name: "Повелитель приливов", sprite: "chief_water", unlock: "free", base: { hp: 30, atk: 5, arm: 2 },
    tree: T("water", ["Пелена брызг", "Зов прибоя", "Живая вода", "Глубинный", "Шторм", "Приказ отлива", "Береговое ополчение", "Морское знамя", "Гнев пучины"],
      { rally: { eff: "1 ОД: лечит своих в радиусе 2 на 5 HP; перезарядка 5 ходов", fx: { heal: 5, cd: 5 } } }) },
  { id: "stone_thane", v: 2, race: "stone", name: "Горный тан", sprite: "chief_stone", unlock: "free", base: { hp: 31, atk: 4, arm: 2 },
    tree: T("stone", ["Каменная стойка", "Боевой рог", "Отдых в чертоге", "Гранитный", "Тяжёлый молот", "Приказ тана", "Горное ополчение", "Знамя чертога", "Сокрушитель"],
      { aura: { eff: "+1 БРН своим в радиусе 2", fx: { auraArm: 1, r: 2 } }, inspire: { eff: "+1 АТК своим в радиусе 1; +2 HP себе", fx: { hp: 2 } } }) },
  { id: "nature_keeper", v: 2, race: "nature", name: "Хранитель рощи", sprite: "chief_nature", unlock: "free", base: { hp: 34, atk: 5, arm: 1 },
    tree: T("nature", ["Кора", "Зов стаи", "Целебные травы", "Древний", "Звериная ярость", "Приказ рощи", "Лесные стрелки", "Знамя листвы", "Охотник на королей"],
      {}) },
  { id: "storm_caller", v: 2, race: "lightning", name: "Громовержец", sprite: "chief_lightning", unlock: "free", base: { hp: 27, atk: 6, arm: 2 },
    tree: T("lightning", ["Искрящий щит", "Раскат", "Озон", "Громоотвод", "Разряд", "Грозовой приказ", "Дружина бури", "Знамя грома", "Удар молнии"],
      { command: { eff: "+1 ОД за ход, пока жив", fx: { ap: 1 } } }) },
];

/** Технологии: тот же скелет у всех рас; раса даёт имя и (редко) вариант эффекта равного бюджета. Порядок имён = порядок узлов тактик. */
export const TECH_NODE_ORDER = ["horse", "ambush", "steel", "drill", "siegecraft", "masonry", "formation", "bastion", "guardians", "citadel", "trade", "merchants", "guilds", "treasury", "caravans", "farming", "settlers", "roads", "empire", "colonies", "arcana", "scribes", "battlemage", "academy", "archmage"];
const N = (s: string) => s.split("|");
export const TECH_RACE_NAMES: Record<string, string[]> = {
  fire: N("Огненные кони|Засада в дыму|Закалка огнём|Огненная муштра|Осадный жар|Обожжённый камень|Строй пламени|Огненный бастион|Пепельная гвардия|Цитадель пламени|Торговля углём|Купцы пепла|Гильдии кузнецов|Огненная казна|Караваны угля|Пепельные поля|Поселенцы пламени|Тракты лавы|Огненная империя|Колонии пепла|Тайна огня|Огненные писцы|Боевая пиромагия|Академия пламени|Архимаг огня"),
  ice: N("Снежные скакуны|Засада в метели|Ледяная сталь|Зимняя муштра|Осада стужей|Ледяная кладка|Строй щитов|Ледяной бастион|Гвардия стужи|Ледяная цитадель|Торговля мехом|Северные купцы|Гильдии ледорубов|Казна зимы|Санные караваны|Северное земледелие|Зимовщики|Санные пути|Империя льда|Колонии севера|Тайна инея|Писцы рун|Боевая криомагия|Академия севера|Архимаг стужи"),
  water: N("Морские кони|Засада у брода|Сталь глубин|Муштра прибоя|Осада с воды|Коралловая кладка|Строй волн|Бастион прилива|Гвардия глубин|Цитадель на воде|Морская торговля|Купцы гаваней|Гильдии лодочников|Казна жемчуга|Речные караваны|Заливные поля|Поселенцы берегов|Речные пути|Империя морей|Колонии дельты|Тайна глубин|Писцы приливов|Боевая гидромагия|Академия волн|Архимаг пучины"),
  stone: N("Горные пони|Засада в ущелье|Горная сталь|Муштра тана|Таран гор|Каменное дело|Стена щитов|Скальный бастион|Гвардия тана|Цитадель в скале|Торговля рудой|Купцы-рудознатцы|Гильдии каменщиков|Подгорная казна|Рудные караваны|Террасы|Горные поселенцы|Тоннели|Подгорная империя|Горные колонии|Тайна рун|Писцы скрижалей|Боевая геомантия|Академия рун|Архимаг камня"),
  nature: N("Олени-скакуны|Засада в чаще|Терновая сталь|Муштра охотников|Корни в стенах|Живые стены|Строй лесничих|Бастион корней|Гвардия рощи|Цитадель-древо|Торговля травами|Купцы-травники|Гильдии садовников|Казна урожая|Караваны травников|Земледелие|Поселенцы рощ|Лесные тропы|Империя леса|Колонии рощ|Тайна листвы|Писцы коры|Боевая друидия|Академия друидов|Архидруид"),
  lightning: N("Грозовые кони|Засада в грозе|Звонкая сталь|Муштра бури|Осадный гром|Громовая кладка|Строй громовержцев|Бастион молний|Гвардия бури|Цитадель громов|Торговля искрами|Купцы бури|Гильдии медников|Казна грозы|Караваны бури|Грозовые поля|Поселенцы бурь|Пути молний|Империя бури|Колонии гроз|Тайна разряда|Писцы молний|Боевая электромагия|Академия бури|Архимаг грозы"),
};
/** варианты эффекта (равный бюджет): раса → узел → {eff, fx} (fx целиком заменяет шаблонный) */
export const TECH_RACE_FX: Record<string, Record<string, { eff: string; fx: Record<string, any> }>> = {
  ice: { steel: { eff: "+1 БРН Ополченцам, Стражам и Вождю; открывает Кузню", fx: { armK: { pawn: 1, rook: 1, king: 1 } } } }, // 4×3 фигур ≈ +1 АТК всем
  water: { merchants: { eff: "+1 з с каждого города", fx: { goldCity: 1 } } }, // 2+ города ≈ +2 з
  stone: { siegecraft: { eff: "+2 АТК Стражам; +1 АТК на вражеской территории", fx: { atkK: { rook: 2 }, atkEnemyT: 1 } } },
  nature: { farming: { eff: "открывает Амбар; +1 рост городам; своим на своей земле +1 HP лечения", fx: { growth: 1, heal: 1 } } },
  lightning: { ambush: { eff: "+1 урона по ходившей фигуре; +1 АТК Всадникам", fx: { ambush: 1, atkK: { knight: 1 } } } },
};

/**
 * ПРОГРЕССИЯ ФИГУР (шаблон по роли; раса меняет только имена — UNIT_RACE_NAMES, равный бюджет).
 * Ур. 1 — база и рост характеристик (econ.xp.grow); ур. 2 — 1 из 2 пассивок (TALENTS, видно сразу);
 * ур. 3 — 1 из 2 активных умений (ОД + перезарядка); ур. 4 — рост + усиление выбранного умения (сила ×up.pow, перезарядка −up.cd), без выбора;
 * ур. 5 — ультимейт роли (UNIT_ULTS), заметно слабее ультимейтов Вождя. Ур. 3+ скрыты до развилки (урезание дерева).
 * Умения: strike — следующий удар +mag; guard — +mag БРН на dur ходов; mend — лечит себя на mag; volley — выстрел по клетке в радиусе r на mag.
 */
export type UnitAct = { id: string; name: string; eff: string; type: "strike" | "guard" | "mend" | "volley"; mag: number; dur?: number; r?: number; ap: number; cd: number };
export const UNIT_TREE: Record<string, { act: [UnitAct, UnitAct]; up: { pow: number; cd: number; eff: string }; ult: string }> = {
  pawn: { act: [{ id: "lunge", name: "Выпад", eff: "следующий удар +3", type: "strike", mag: 3, ap: 1, cd: 3 }, { id: "brace", name: "Стойка", eff: "+2 БРН на 2 хода", type: "guard", mag: 2, dur: 2, ap: 1, cd: 3 }], up: { pow: 1.5, cd: 1, eff: "умение сильнее в 1,5 раза, перезарядка на 1 короче" }, ult: "shieldwall" },
  knight: { act: [{ id: "charge2", name: "Сшибка", eff: "следующий удар +4", type: "strike", mag: 4, ap: 1, cd: 3 }, { id: "rest", name: "Привал", eff: "лечит себя на 5", type: "mend", mag: 5, ap: 1, cd: 3 }], up: { pow: 1.5, cd: 1, eff: "умение сильнее в 1,5 раза, перезарядка на 1 короче" }, ult: "trample" },
  mage: { act: [{ id: "bolt", name: "Стрела силы", eff: "выстрел на 4 по врагу в радиусе 3", type: "volley", mag: 4, r: 3, ap: 1, cd: 3 }, { id: "barrier", name: "Барьер", eff: "+2 БРН на 2 хода", type: "guard", mag: 2, dur: 2, ap: 1, cd: 3 }], up: { pow: 1.5, cd: 1, eff: "умение сильнее в 1,5 раза, перезарядка на 1 короче" }, ult: "fireball" },
  rook: { act: [{ id: "bastion2", name: "Несокрушимость", eff: "+3 БРН на 2 хода", type: "guard", mag: 3, dur: 2, ap: 1, cd: 3 }, { id: "repair", name: "Починка", eff: "лечит себя на 6", type: "mend", mag: 6, ap: 1, cd: 3 }], up: { pow: 1.5, cd: 1, eff: "умение сильнее в 1,5 раза, перезарядка на 1 короче" }, ult: "quake" },
  hero: { act: [{ id: "cleave", name: "Рассечение", eff: "следующий удар +5", type: "strike", mag: 5, ap: 1, cd: 3 }, { id: "second", name: "Второе дыхание", eff: "лечит себя на 6", type: "mend", mag: 6, ap: 1, cd: 3 }], up: { pow: 1.5, cd: 1, eff: "умение сильнее в 1,5 раза, перезарядка на 1 короче" }, ult: "heroic" },
};
/** ультимейты фигур (ур. 5): малая область 2–3 клетки или сильный одиночный удар; 1 ОД, перезарядка 6 */
export const UNIT_ULTS: Record<string, UltDef> = {
  shieldwall: { name: "Стена щитов", eff: "щит 4 своим в области 3×3 на 2 хода", shape: "square", ap: 1, cd: 6, range: 1, size: 3, shield: 4, shieldTurns: 2, chiefMul: 0.5 },
  trample: { name: "Топот", eff: "рывок-волна на 3 клетки шириной 3: урон 4 и отброс", shape: "line", ap: 1, cd: 6, range: 1, len: 3, dmg: 4, push: 1, chiefMul: 0.5 },
  fireball: { name: "Огненный шар", eff: "взрыв ⌀3 (9 клеток… круг r 1,5) в радиусе 3: урон 4", shape: "circle", ap: 1, cd: 6, range: 3, r: 1.5, dmg: 4, chiefMul: 0.5 },
  quake: { name: "Сотрясение", eff: "3×3 вокруг клетки рядом: урон 3 и замедление", shape: "square", ap: 1, cd: 7, range: 1, size: 3, dmg: 3, chill: 1, chiefMul: 0.5 },
  heroic: { name: "Подвиг", eff: "сокрушительный удар по одному врагу в радиусе 2: урон 9", shape: "chain", ap: 1, cd: 6, range: 2, hops: 1, hop: 0, dmg: 9, chiefMul: 0.5 },
};
/** расовые имена ультимейтов фигур (шаблон тот же; пусто — имя шаблона) */
export const UNIT_RACE_NAMES: Record<string, Record<string, string>> = {
  fire: { fireball: "Огненный шар", shieldwall: "Стена жара" }, ice: { fireball: "Ледяная сфера", quake: "Ледолом" }, water: { fireball: "Водяной шар", trample: "Прибой" },
  stone: { fireball: "Каменный град", shieldwall: "Скальная стена" }, nature: { fireball: "Споровый взрыв", quake: "Корнелом" }, lightning: { fireball: "Шаровая молния", trample: "Грозовой топот" },
};
