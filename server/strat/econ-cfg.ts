// «Партия Чёрных королей» — числа этапа 2 (экономика, города, постройки, найм, технологии, таланты, Слава).
// Только данные, без импортов: всё правится в админке (game_overrides kind='strat_rules', id='main' → deepMerge поверх).
// Партия хранит снимок конфига на старте (правки действуют только на новые партии).

type Kind = "pawn" | "knight" | "mage" | "rook" | "hero" | "king";

export const ECON = {
  start: { gold: 6, know: 0, secondGold: 4, firstAp1: 0 }, // secondGold — компенсация второму игроку; firstAp1 — ОД первого игрока на 1-м ходу (0 = как обычно)
  /** по размеру поля: эпох доступно (0 = без технологий, блиц), застав максимум, слоты столицы по уровню, порог Славы (0 = нет), лимит фигур */
  sizes: {
    5: { eras: 0, outposts: 0, capSlots: [1, 1, 1], glory: 0, pop: 8 },
    8: { eras: 2, outposts: 1, capSlots: [2, 3, 4], glory: 150, pop: 14 },
    15: { eras: 4, outposts: 2, capSlots: [2, 3, 4], glory: 300, pop: 22 },
    35: { eras: 4, outposts: 4, capSlots: [2, 3, 4], glory: 600, pop: 34 }, // t1201: Тактическая (35×35)
  } as Record<number, { eras: number; outposts: number; capSlots: number[]; glory: number; pop: number }>,
  city: {
    capGold: 2, capKnow: 1, outGold: 1, outKnow: 0, // базовый доход города
    growthBase: 2, growthThr: [15, 40], // очки роста столицы → уровень 1, 2 (радиус +1, слот +1)
    capRadius: [1, 2, 3], outRadius: 1, outSlots: 2, outMinDist: 4, recruitRadius: 1,
    siegeTurns: 1, // враг простоял на клетке города N своих ходов подряд → город взят (столица → военная победа)
  },
  /** доход клеток-построек карты внутри своей территории (вражеская фигура на клетке — набег, дохода нет) */
  struct: {
    M: { gold: 2 }, Q: { gold: 1 }, A: { know: 2 }, S: { know: 1, glory: 1 }, V: { gold: 1, growth: 1 }, D: { gold: 1 },
  } as Record<string, { gold?: number; know?: number; glory?: number; growth?: number }>,
  ruins: { gold: 6, know: 3, glory: 3 }, // R: разово первому вошедшему
  obelisk: { glory: 2 }, // X: за ход, пока на нём стоит своя фигура
  glory: { kill: 3, tech: 5, era: 10, perTerr: 10, found: 5, capture: 10 }, // perTerr: клеток территории на 1 Славу за ход
  research: { cost: [0, 6, 12, 20, 30], eraCost: [0, 0, 14, 26, 40], need: 2, perTurn: 1, maxPaths: 2, techGlory: 3 }, // цена технологии по эпохе; переход в эпоху N
  xp: { hit: 1, kill: 2, lv: [0, 0, 3, 7, 12, 20], grow: { hp: [0, 0, 1, 2, 5, 7], atk: [0, 0, 0, 0, 1, 1] } }, // опыт фигуры: ур. 2…5 при 3/7/12/20; рост характеристик по уровню (ур. 4 — заметный скачок)
  quiet: { draw: 0 }, // t1135: автоничьи нет (счётчик тихих ходов — только статистика)
  /** t1139: территория. grow — рост «как в Civ»: город раз в N ходов присоединяет 1 соседнюю нейтральную клетку
   *  (N = base[раса] − бонусы построек/технологий, не меньше min; base скрыт от игроков). reach — не дальше радиуса города + reach.
   *  Выбор клетки: соседняя со своей землёй → клетка-структура карты (доход) → рядом со структурой → ближе к городу → меньший индекс.
   *  capture — захват земли: вражеская фигура простояла turns своих ходов подряд на твоей клетке (не город) → клетка её. */
  terr: {
    // t1140: медленно и платно. Город копит «право на клетку» раз в N ходов (N = bySize[размер] + race[раса] − постройки − технологии, ≥ min);
    // право тратит ИГРОК действием «claim» (сам выбирает клетку из допустимых, платит gold + perCell×уже присоединённых); копится не больше bank.
    // Боты выбирают клетку правилом growPick. Заставы-поселения не растут.
    // mode: "claim" (решение Алекса) — интервал прошёл → «Можно купить клетку»: игрок покупает ЛЮБУЮ соседнюю со своей землёй клетку за gold+perCell×присоединённых;
    //   не купил за autoAfter своих ходов — клетка (growPick) присоединяется бесплатно; затем новый интервал. "auto" — сразу бесплатный авторост.
    // Интервал: league[...].grow + race + постройки/технологии, зажат в [growMin, growMax] лиги (Быстрая 5–6, Обычная 10–14, Тактическая 15–20).
    grow: { on: true, mode: "claim" as "claim" | "auto", sizeOff: [5] as number[], race: { nature: -2, water: -1, fire: 0, lightning: 0, ice: 1, stone: 2 } as Record<string, number>,
      min: 5, reach: 3, bank: 1, autoAfter: 4, gold: 3, perCell: 1, // min — без лиговых правил; gold + perCell×присоединённых — цена «Расширить»
      bld: { granary: 1, sacredgrove: 1, metropolis: 3 } as Record<string, number>, tech: { settlers: 1, empire: 1, colonies: 1 } as Record<string, number> },
    // t1140: вражеская фигура простояла turns своих ходов подряд на клетке твоей земли (не город) → клетка НЕЙТРАЛЬНА (не переходит к врагу)
    capture: { on: true, turns: 4 }, // turns — если лиговые правила выключены
  },
  /** t1139: новые поселения (заставы). by: кто основывает — "king" (Вождь, не расходуется, тратит ОД и gold) или "pawn" (Ополченец расходуется) */
  //  t1140: Вождь «закладывает» поселение turns ходов (канал): стоит неподвижно, не действует, БРН −armPen (уязвим); gold платится сразу,
  //  отмена (действие found_cancel) возвращает refund от цены; гибель/сдвиг Вождя — канал сорван без возврата. Поселение (bare) даёт только
  //  точку призыва + свою землю радиуса 1: без дохода, слотов, роста, Славы основания.
  found: { on: true, by: "king" as "king" | "pawn" | "both", gold: 6, turns: 10, armPen: 2, refund: 0.5, bare: true },
  /** t1139: призыв появляется на клетке города; занята — ближайшая свободная клетка своей земли */
  spawnOnCity: true,
  /** t1139: эпоха IV — «Апофеоз»: при входе Вождь полностью лечится, перезарядки ультимейтов сброшены, + glory Славы; одно легендарное здание на игрока */
  era4: { apoGlory: 10, legendMax: 1, wonderEra: 3 },
  /** t1140/t1141: ПРАВИЛА ЛИГ (лига — по большей стороне карты, rating.ts leagueOf: ≤9 Быстрая, ≤35 Обычная, ≤100 Тактическая).
   *  ОД: apBase + apTech за каждую ОД-технологию (Муштра / Сигнальные огни — каждая в развилке «одна из трёх») + apBld за «Военный совет»
   *  (однократная постройка: onceMax на игрока), не больше apMax (до талантов Вождя). grow — ходов на право клетки; capture — ходов до потери
   *  клетки; found — ходов канала поселения; respawn — ходов до нового Вождя; xp — множитель опыта фигур/Вождя; research — множитель цены
   *  технологий и эпох (темп эпох). t1143: apBase 1/2/3; итог ОД не меньше 1 (без Вождя −1 ОД не опускает ниже 1). */
  league: {
    // t1163 (баланс-сим, набор H): race — правки чисел расы только в этой лиге (поверх cfg.race, см. econ.ts raceCfg); secondGold — компенсация второму игроку в лиге (вместо start.secondGold)
    quick:    { apBase: 1, apTech: 1, apBld: 1, raceCap: 1, onceMax: 1, apMax: 6,  grow: 6, growMin: 5, growMax: 6, capture: 4, found: 8,  respawn: 4, xp: 1.25, research: 0.8,
                race: { water: { healOwnT: 0 }, fire: { hpMul: 1.1 }, lightning: { chain: 1, hpMul: 0.8 } } }, // secondGold: 6 (H) и 5 (t1175) пробовали — перевес первого хода не снизился (61% / 60%), не берём; t1175: Огонь HP ×1,0→×1,1, Молния HP ×0,9→×0,8 (8×8: 39%/61%)
    normal:   { apBase: 2, apTech: 1, apBld: 3, raceCap: 2, onceMax: 1, apMax: 7,  grow: 12, growMin: 10, growMax: 14, capture: 4, found: 10, respawn: 5, xp: 1,    research: 1,
                race: { lightning: { hpMul: 1.1 }, nature: { hpMul: 0.9 } }, techEra: { grove: 4 } }, // t1163: «Чаща» в Обычной — с эры IV (Природа 68% на 15×15); t1175: Молния HP ×1,0→×1,1 (29% на 15×15; разряд 2→3 пробовали — ~33%, не берём); t1175: Природа HP ×0,9 (64% на 15×15; «Урожай» с эры IV пробовали — бот берёт «Чащу», Природа ~82%, не берём)
    tactical: { apBase: 3, apTech: 2, apBld: 4, raceCap: 3, onceMax: 2, apMax: 12, grow: 17, growMin: 15, growMax: 20, capture: 5, found: 12, respawn: 6, xp: 0.8,  research: 1.25 },
  } as Record<string, { apBase: number; apTech: number; apBld: number; raceCap: number; onceMax: number; apMax: number; grow: number; growMin: number; growMax: number; capture: number; found: number; respawn: number; xp: number; research: number; secondGold?: number; race?: Record<string, Record<string, number>>; techEra?: Record<string, number> }>,
  /** t1143: «Сила стихии» — свой ситуативный прирост ОД у каждой расы (скрытая связь раса↔тактика: игрок видит только «+N ОД: <причина>»).
   *  +1 ОД за каждые per единиц условия, не больше raceCap лиги. Считается в начале хода.
   *  fire  kills — убийства в свой прошлый ход («жар битвы»); ice chilled — обмороженные враги на поле;
   *  stone walls — свои Стены и Сторожевые башни; nature grown — присоединённые клетки (рост земли);
   *  lightning fullAp — прошлый ход потрачены все ОД («разряд»); water shore — свои фигуры на воде/у воды на своей земле. */
  raceAp: {
    fire: { kind: "kills", per: 1, label: "Жар битвы" }, ice: { kind: "chilled", per: 2, label: "Стужа" }, stone: { kind: "walls", per: 2, label: "Твердь" },
    nature: { kind: "grown", per: 3, label: "Рост" }, lightning: { kind: "fullAp", per: 1, label: "Разряд" }, water: { kind: "shore", per: 3, label: "Прилив" },
  } as Record<string, { kind: string; per: number; label: string }>,
  /** Рейтинговые партии (Алекс): раса назначается сервером при старте. Игрок задаёт до favMax «Любимых рас».
   *  Вес: fav — сумма на любимые, other — на остальные (по умолчанию 85/15, правится в админке game_overrides).
   *  Повторов нет, пока хватает рас; если игроков больше, чем рас, повтор разрешён только у игроков разных команд (FFA — минимум повторов). */
  raceDraw: { on: true, fav: 85, other: 15, favMax: 3 },
  /** t1156: история и повторы партий. keepDays — сколько хранить недавние партии (сохранённые в «Библиотеку» — бессрочно);
   *  recent — сколько последних партий игрока показывать; saveMax — лимит «Библиотеки» на игрока; rollMs — как часто писать живой лог в D1. */
  replay: { on: true, keepDays: 90, recent: 50, saveMax: 100, rollMs: 30000, maxBytes: 900000 },
  /** правила лиг включены (false — прежние числа: ОД из rules sizes[].ap, fx.ap технологий как есть) */
  leagueRules: true,
  /** t1140: Сторожевая башня — единственная постройка ВНЕ территории (полевая): Вождь ставит на свободную проходимую клетку не дальше
   *  outDist от своей земли; HP/БРН/ответный удар как у Стены-типа «fort»; своим фигурам рядом (радиус 1) +arm БРН; не больше max на игрока. */
  tower: { on: true, cost: 8, outDist: 2, arm: 1, max: 3, hp: 16, armor: 2, counter: 2 },
  /** 2 на 2 (этап 5): обмен между союзниками, только по согласию обеих сторон; передачи без встречной оплаты нет */
  trade: { minRatio: 0.5, maxRatio: 2, perTurn: 1, maxShare: 0.3 },
  market: { rate: 1, max: 6 }, // Рынок: N знаний → N×rate золота за действие города
  glacier: { every: 3, share: 0.1, max: 5 },
  forgeMax: 2,
  /** общие величины построек (эффекты технологий — в самих узлах дерева, cfg.techs[i].fx) */
  fx: { wallArm: 1, quarryWallArm: 1, quarryGold: 1, harborMax: 3, rodChain: 1, staticChain: 1 },
};

export type BuildId = "barracks" | "stable" | "magetower" | "forge" | "wall" | "market" | "library" | "granary" | "crucible" | "glacier" | "harbor" | "quarry" | "sacredgrove" | "lightningrod" | "warhall" | "stronghold" | "mint" | "metropolis" | "observatory" | "watchtower" | "warcouncil" | "wonder";
export const BUILD: Record<BuildId, { name: string; cost: number; eff: string; race?: string; gold?: number; know?: number; growth?: number; icon: string; legend?: boolean; once?: boolean; field?: boolean; fx?: Record<string, number> }> = {
  barracks: { name: "Казарма", cost: 9, eff: "найм Стражей; Ополченцы за 2 з", icon: "⚔" },
  stable: { name: "Конюшня", cost: 11, eff: "найм Всадников", icon: "🐎" },
  magetower: { name: "Башня магов", cost: 12, eff: "найм Магов", icon: "✦" },
  forge: { name: "Кузня", cost: 12, eff: "+1 АТК выбранному типу (до 2 раз)", icon: "⚒" },
  wall: { name: "Стена", cost: 9, eff: "+1 БРН своим фигурам у города", icon: "▦" },
  market: { name: "Рынок", cost: 11, eff: "+1 з за ход; обмен знаний на золото", gold: 1, icon: "⚖" },
  library: { name: "Библиотека", cost: 9, eff: "+1 знание за ход", know: 1, icon: "📜" },
  granary: { name: "Амбар", cost: 8, eff: "+1 рост за ход", growth: 1, icon: "🌾" },
  crucible: { name: "Горнило", race: "fire", cost: 11, eff: "Кузня вдвое дешевле; +1 АТК новым фигурам", icon: "🔥" },
  glacier: { name: "Ледник", race: "ice", cost: 11, eff: "раз в 3 хода +10% к золоту (до +5)", icon: "❄" },
  harbor: { name: "Гавань", race: "water", cost: 11, eff: "+1 з за каждую клетку воды в территории (до +3)", icon: "⚓" },
  quarry: { name: "Каменоломня", race: "stone", cost: 11, eff: "Стена даёт ещё +1 БРН; +1 з с каменоломен", icon: "⛏" },
  sacredgrove: { name: "Священная роща", race: "nature", cost: 11, eff: "+1 знание и +1 рост городу", know: 1, growth: 1, icon: "🌳" },
  lightningrod: { name: "Громоотвод", race: "lightning", cost: 11, eff: "+1 знание за ход; разряд +1", know: 1, icon: "⚡" },
  // t1139: легендарные постройки эпохи IV (одна на игрока, только столица; открываются вершинами IV тактик). fx — как у технологий.
  warhall: { name: "Чертог войны", cost: 30, eff: "+1 АТК всем фигурам", icon: "🏛", legend: true, fx: { atk: 1 } },
  stronghold: { name: "Несокрушимая твердыня", cost: 30, eff: "+1 БРН всем фигурам; осада твоих городов на ход дольше", icon: "🗿", legend: true, fx: { arm: 1, siege: 1 } },
  mint: { name: "Монетный двор", cost: 26, eff: "+6 з за ход", icon: "🪙", legend: true, fx: { goldTurn: 6 } },
  metropolis: { name: "Метрополия", cost: 28, eff: "+1 клетка земли столице; земля растёт быстрее", icon: "🏙", legend: true, fx: { capR: 1 } },
  observatory: { name: "Обсерватория", cost: 28, eff: "+3 знания за ход; +1 исследование за ход", know: 3, icon: "🔭", legend: true, fx: { research: 1 } },
  warcouncil: { name: "Военный совет", cost: 16, eff: "+ОД за ход (Быстрая +1, Обычная +3, Тактическая +4); однократная: 1 на игрока (в Тактической 2)", icon: "⚑", once: true } as any,
  watchtower: { name: "Сторожевая башня", cost: 8, eff: "полевая постройка: можно вне своей земли (до 2 клеток); +1 БРН своим рядом; бьёт в ответ", icon: "🗼", field: true } as any,
  wonder: { name: "Великое чудо", fx: { ultPow: 3, ultCd: 2 }, cost: 0, eff: "цель «Великое чудо»; +2 Славы за ход; усиливает ультимейт Вождя (+3 силы, перезарядка −2). Только столица, последняя эпоха и технология-вершина тактики; цена — золото и знания (goals.sizes)", icon: "✨" },
};
/** что открывает найм фигуры (null — доступна сразу); Герой — с эпохи II, один на игрока */
export const UNLOCK: Record<string, string | null> = { pawn: null, rook: "barracks", knight: "stable", mage: "magetower", hero: null, king: "never" };
export const PAWN_BARRACKS_COST = 2;
export const HERO_ERA = 2;

/** Пять тактик игры = пять ветвей дерева (+ расовая ветвь «Стихия»). */
export type Branch = "rush" | "fort" | "trade" | "expand" | "arcana" | "elem";
export const TACTICS: { id: Branch; name: string; icon: string; eff: string }[] = [
  { id: "rush", name: "Натиск", icon: "⚔", eff: "темп, удар, кавалерия, +ОД" },
  { id: "fort", name: "Крепость", icon: "🛡", eff: "стены, броня у своих городов, долгая осада" },
  { id: "trade", name: "Торговля", icon: "⚖", eff: "золото, рынки, дешёвые постройки" },
  { id: "expand", name: "Экспансия", icon: "🌾", eff: "заставы, рост, территория и Слава с неё" },
  { id: "arcana", name: "Тайное знание", icon: "✦", eff: "маги, знания, исследования" },
];
/**
 * Эффекты технологий — числа (правятся в админке). Суммируются по всем изученным технологиям стороны.
 * atk/arm — всем; atkK/armK — по типу; ap; shot — дальность Магов (max, не сумма); goldTurn; goldCity; goldMV — с рудника и деревни;
 * knowCity; growth — каждому городу; bldDisc — доля скидки построек; capR — радиус столицы; outR — радиус застав; outposts; outDist — мин. дистанция застав;
 * killGlory; kingHp; siege — враг дольше берёт твои города; atkEnemyT — АТК на вражеской территории; armOwnT — БРН на своей территории;
 * armKing2 — БРН своим в радиусе 2 от Вождя; formation — БРН Ополченцу рядом с Ополченцем; ambush — урон по ходившей фигуре;
 * research — исследований за ход; terrGlory — делитель «клеток на 1 Славу» (меньше = больше); knightDisc; burnT/burnD/chillT; fury; rime.
 */
export type TechFx = Partial<Record<"atk" | "arm" | "ap" | "shot" | "goldTurn" | "goldCity" | "goldMV" | "knowCity" | "growth" | "bldDisc" | "capR" | "capRLvl" | "outR" | "outposts" | "outDist" | "killGlory" | "kingHp" | "siege" | "atkEnemyT" | "armOwnT" | "armKing2" | "formation" | "ambush" | "research" | "terrGlory" | "knightDisc" | "burnT" | "burnD" | "chillT" | "fury" | "rime" | "heal" | "ultPow" | "ultCd" | "terrGrow" | "wonderUlt" | "wonderCd", number>> & { atkK?: Partial<Record<Kind, number>>; armK?: Partial<Record<Kind, number>> };
/**
 * Узел дерева. grp — взаимоисключающая группа (взял один — остальные закрыты навсегда, а с ними всё, что от них зависит);
 * req — нужен хотя бы один из (родитель); unlock — открывает постройки. Эпоха I: корни пяти тактик, но корней можно взять
 * не больше econ.research.maxPaths (2) — остальные тактики закрываются целиком. Эпоха II — развилка внутри тактики, эпоха III — вершина.
 */
export type Tech = { id: string; br: Branch; era: number; grp: string; req?: string[]; race?: string; name: string; eff: string; unlock?: BuildId[]; fx: TechFx };
export { TECHS } from "./tree-data"; // данные дерева — в tree-data.ts (в клиентскую сборку не попадают, см. ТЗ §14.F)
import { TECHS } from "./tree-data";
export const techById = (id: string, list: Tech[] = TECHS) => list.find((t) => t.id === id);
/** соперники по группе (взял один — остальные закрыты) */
export const techRivals = (t: Tech, list: Tech[] = TECHS) => (t.grp === "root" ? [] : list.filter((o) => o !== t && o.grp === t.grp));
/** @deprecated пара для старого UI: первый соперник */
export const techSibling = (t: Tech) => techRivals(t)[0];
/** какие технологии открывают постройку (пусто — доступна с начала) */
export const buildGate = (b: BuildId, list: Tech[] = TECHS) => list.filter((t) => t.unlock?.includes(b)).map((t) => t.id);

export type Talent = { id: string; name: string; eff: string; atk?: number; arm?: number; hp?: number; shot?: number; ap?: number };
/** таланты фигур: [уровень 2: a | b, уровень 3: a | b] */
export const TALENTS: Record<string, [Talent, Talent][]> = { // уровень 2 фигуры: выбор 1 из 2 пассивок (ур. 3–5 — tree-data.ts UNIT_TREE, скрыто до развилки)
  pawn: [[{ id: "shield", name: "Щит", eff: "+1 БРН", arm: 1 }, { id: "spear", name: "Копьё", eff: "+1 АТК", atk: 1 }]],
  knight: [[{ id: "charge", name: "Натиск", eff: "+2 АТК", atk: 2 }, { id: "dodge", name: "Уклон", eff: "+1 БРН", arm: 1 }]],
  mage: [[{ id: "focus", name: "Фокус", eff: "+2 АТК", atk: 2 }, { id: "ward", name: "Оберег", eff: "+1 БРН", arm: 1 }]],
  rook: [[{ id: "bulwark", name: "Оплот", eff: "+2 БРН", arm: 2 }, { id: "smash", name: "Сокрушение", eff: "+2 АТК", atk: 2 }]],
  hero: [[{ id: "blade", name: "Клинок", eff: "+2 АТК", atk: 2 }, { id: "aegis", name: "Эгида", eff: "+2 БРН", arm: 2 }]],
  king: [[{ id: "guard", name: "Гвардия", eff: "+2 БРН", arm: 2 }, { id: "command", name: "Приказ", eff: "+2 АТК", atk: 2 }]],
};

/** Глубокое слияние правок админки: только известные ключи, числа — только числами (защита от мусора в game_overrides). */
export function deepMerge<T>(base: T, over: any, depth = 0): T {
  if (!over || typeof over !== "object" || depth > 6) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(out)) {
    if (!(k in over)) continue;
    const b = out[k], v = over[k];
    if (typeof b === "number") { if (typeof v === "number" && Number.isFinite(v)) out[k] = v; }
    else if (typeof b === "string") { if (typeof v === "string") out[k] = v.slice(0, 80); }
    else if (typeof b === "boolean") { if (typeof v === "boolean") out[k] = v; }
    else if (b && typeof b === "object") out[k] = deepMerge(b, v, depth + 1);
  }
  return out;
}
