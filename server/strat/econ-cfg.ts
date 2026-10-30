// «Партия Чёрных королей» — числа этапа 2 (экономика, города, постройки, найм, технологии, таланты, Слава).
// Только данные, без импортов: всё правится в админке (game_overrides kind='strat_rules', id='main' → deepMerge поверх).
// Партия хранит снимок конфига на старте (правки действуют только на новые партии).

export const ECON = {
  start: { gold: 6, know: 0, secondGold: 4, firstAp1: 0 }, // secondGold — компенсация второму игроку; firstAp1 — ОД первого игрока на 1-м ходу (0 = как обычно)
  /** по размеру поля: эпох доступно (0 = без технологий, блиц), застав максимум, слоты столицы по уровню, порог Славы (0 = нет), лимит фигур */
  sizes: {
    5: { eras: 0, outposts: 0, capSlots: [1, 1, 1], glory: 0, pop: 8 },
    8: { eras: 2, outposts: 1, capSlots: [2, 3, 4], glory: 150, pop: 14 },
    15: { eras: 3, outposts: 2, capSlots: [2, 3, 4], glory: 300, pop: 22 },
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
  research: { cost: [0, 6, 12, 20], eraCost: [0, 0, 14, 26], need: 2, perTurn: 1 }, // цена технологии по эпохе; переход в эпоху N
  xp: { hit: 1, kill: 2, lv: [0, 0, 3, 7] }, // опыт фигуры; уровень 2 при 3, уровень 3 при 7 → выбор таланта
  quiet: { draw: 30 }, // «без лимита»: N ходов подряд без ударов → автоничья
  /** 2 на 2 (этап 5): обмен между союзниками, только по согласию обеих сторон; передачи без встречной оплаты нет */
  trade: { minRatio: 0.5, maxRatio: 2, perTurn: 1, maxShare: 0.3 },
  market: { rate: 1, max: 6 }, // Рынок: N знаний → N×rate золота за действие города
  glacier: { every: 3, share: 0.1, max: 5 },
  forgeMax: 2,
  /** величины эффектов технологий */
  fx: { formationArm: 1, ambushDmg: 2, steelAtk: 1, shieldsArm: 1, drillAp: 1, bastionArm: 1, wallArm: 1, tradeGold: 1, farmingGrowth: 1, masonsDisc: 0.25, scribesKnow: 1, treasuryGold: 3,
    wildfireTurns: 3, embersDmg: 2, shot3: 3, furyDmg: 2, kingHp: 10, killGlory: 2, deepfreezeTurns: 2, frostArm: 2, rimeDmg: 3 },
};

export type BuildId = "barracks" | "stable" | "magetower" | "forge" | "wall" | "market" | "library" | "granary" | "crucible" | "glacier";
export const BUILD: Record<BuildId, { name: string; cost: number; eff: string; race?: string; gold?: number; know?: number; growth?: number; icon: string }> = {
  barracks: { name: "Казарма", cost: 6, eff: "найм Стражей; Ополченцы за 2 з", icon: "⚔" },
  stable: { name: "Конюшня", cost: 7, eff: "найм Всадников", icon: "🐎" },
  magetower: { name: "Башня магов", cost: 8, eff: "найм Магов", icon: "✦" },
  forge: { name: "Кузня", cost: 8, eff: "+1 АТК выбранному типу (до 2 раз)", icon: "⚒" },
  wall: { name: "Стена", cost: 6, eff: "+1 БРН своим фигурам у города", icon: "▦" },
  market: { name: "Рынок", cost: 7, eff: "+1 з за ход; обмен знаний на золото", gold: 1, icon: "⚖" },
  library: { name: "Библиотека", cost: 6, eff: "+1 знание за ход", know: 1, icon: "📜" },
  granary: { name: "Амбар", cost: 5, eff: "+1 рост за ход", growth: 1, icon: "🌾" },
  crucible: { name: "Горнило", race: "fire", cost: 7, eff: "Кузня вдвое дешевле; +1 АТК новым фигурам", icon: "🔥" },
  glacier: { name: "Ледник", race: "ice", cost: 7, eff: "раз в 3 хода +10% к золоту (до +5)", icon: "❄" },
};
/** что открывает найм фигуры (null — доступна сразу); Герой — с эпохи II, один на игрока */
export const UNLOCK: Record<string, string | null> = { pawn: null, rook: "barracks", knight: "stable", mage: "magetower", hero: null, king: "never" };
export const PAWN_BARRACKS_COST = 2;
export const HERO_ERA = 2;

export type Branch = "war" | "econ" | "elem";
export type Tech = { id: string; br: Branch; era: number; race?: string; name: string; eff: string };
/** 3 ветви × 3 эпохи, в каждой ячейке пара: выбрал одну — вторая закрыта навсегда. Ветвь «Стихия» — своя у каждой расы. */
export const TECHS: Tech[] = [
  { id: "formation", br: "war", era: 1, name: "Строй", eff: "+1 БРН Ополченцу рядом с другим Ополченцем" },
  { id: "ambush", br: "war", era: 1, name: "Засада", eff: "+2 урона по фигуре, ходившей в прошлый ход" },
  { id: "steel", br: "war", era: 2, name: "Сталь", eff: "+1 АТК всем фигурам" },
  { id: "shields", br: "war", era: 2, name: "Щиты", eff: "+1 БРН Стражам и Вождю" },
  { id: "drill", br: "war", era: 3, name: "Муштра", eff: "+1 очко действия за ход" },
  { id: "bastion", br: "war", era: 3, name: "Бастион", eff: "+1 БРН на своей территории" },
  { id: "trade", br: "econ", era: 1, name: "Торговля", eff: "+1 з с каждого рудника и деревни" },
  { id: "farming", br: "econ", era: 1, name: "Земледелие", eff: "+1 рост каждому городу" },
  { id: "masons", br: "econ", era: 2, name: "Каменщики", eff: "постройки на 25% дешевле" },
  { id: "scribes", br: "econ", era: 2, name: "Писцы", eff: "+1 знание с каждого города" },
  { id: "treasury", br: "econ", era: 3, name: "Казна", eff: "+3 з за ход" },
  { id: "empire", br: "econ", era: 3, name: "Империя", eff: "+1 радиус столицы" },
  { id: "wildfire", br: "elem", era: 1, race: "fire", name: "Пожар", eff: "поджог длится 3 хода" },
  { id: "embers", br: "elem", era: 1, race: "fire", name: "Угли", eff: "поджог: 2 урона вместо 1" },
  { id: "pyromancy", br: "elem", era: 2, race: "fire", name: "Пиромантия", eff: "Маги стреляют на 3" },
  { id: "fury", br: "elem", era: 2, race: "fire", name: "Ярость", eff: "+2 урона по горящим" },
  { id: "phoenix", br: "elem", era: 3, race: "fire", name: "Феникс", eff: "Вождь +10 HP" },
  { id: "blaze", br: "elem", era: 3, race: "fire", name: "Зарево", eff: "+2 Славы за убийство" },
  { id: "deepfreeze", br: "elem", era: 1, race: "ice", name: "Глубокий холод", eff: "обморозка на 2 хода" },
  { id: "frostarmor", br: "elem", era: 1, race: "ice", name: "Ледяная броня", eff: "+2 БРН Стражам" },
  { id: "icelance", br: "elem", era: 2, race: "ice", name: "Ледяное копьё", eff: "Маги стреляют на 3" },
  { id: "rime", br: "elem", era: 2, race: "ice", name: "Иней", eff: "+3 урона по обмороженным (и ход спустя)" },
  { id: "winterking", br: "elem", era: 3, race: "ice", name: "Зимний король", eff: "Вождь +10 HP" },
  { id: "avalanche", br: "elem", era: 3, race: "ice", name: "Лавина", eff: "+2 Славы за убийство" },
];
export const techById = (id: string) => TECHS.find((t) => t.id === id);
/** пара технологии (та же ветвь, эпоха и раса) */
export const techSibling = (t: Tech) => TECHS.find((o) => o !== t && o.br === t.br && o.era === t.era && o.race === t.race);

export type Talent = { id: string; name: string; eff: string; atk?: number; arm?: number; hp?: number; shot?: number; ap?: number };
/** таланты фигур: [уровень 2: a | b, уровень 3: a | b] */
export const TALENTS: Record<string, [Talent, Talent][]> = {
  pawn: [[{ id: "shield", name: "Щит", eff: "+1 БРН", arm: 1 }, { id: "spear", name: "Копьё", eff: "+1 АТК", atk: 1 }],
    [{ id: "veteran", name: "Ветеран", eff: "+5 HP", hp: 5 }, { id: "zeal", name: "Рвение", eff: "+2 АТК", atk: 2 }]],
  knight: [[{ id: "charge", name: "Натиск", eff: "+2 АТК", atk: 2 }, { id: "dodge", name: "Уклон", eff: "+1 БРН", arm: 1 }],
    [{ id: "ram", name: "Таран", eff: "+3 АТК", atk: 3 }, { id: "scout", name: "Разведчик", eff: "+6 HP", hp: 6 }]],
  mage: [[{ id: "focus", name: "Фокус", eff: "+2 АТК", atk: 2 }, { id: "ward", name: "Оберег", eff: "+1 БРН", arm: 1 }],
    [{ id: "reach", name: "Дальнобой", eff: "стреляет на 1 дальше", shot: 1 }, { id: "arcane", name: "Чародей", eff: "+3 АТК", atk: 3 }]],
  rook: [[{ id: "bulwark", name: "Оплот", eff: "+2 БРН", arm: 2 }, { id: "smash", name: "Сокрушение", eff: "+2 АТК", atk: 2 }],
    [{ id: "titan", name: "Титан", eff: "+8 HP", hp: 8 }, { id: "crusher", name: "Молот", eff: "+3 АТК", atk: 3 }]],
  hero: [[{ id: "blade", name: "Клинок", eff: "+2 АТК", atk: 2 }, { id: "aegis", name: "Эгида", eff: "+2 БРН", arm: 2 }],
    [{ id: "legend", name: "Легенда", eff: "+10 HP", hp: 10 }, { id: "warlord", name: "Полководец", eff: "+1 ОД, пока жив", ap: 1 }]],
  king: [[{ id: "guard", name: "Гвардия", eff: "+2 БРН", arm: 2 }, { id: "command", name: "Приказ", eff: "+2 АТК", atk: 2 }],
    [{ id: "crown", name: "Венец", eff: "+10 HP", hp: 10 }, { id: "tactician", name: "Тактик", eff: "+1 ОД, пока жив", ap: 1 }]],
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
