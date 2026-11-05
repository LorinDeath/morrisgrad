// t1243: полная админка правил «Партии Чёрных королей». Схема строится АВТОМАТИЧЕСКИ из STRAT_CFG: каждое число, текст и переключатель
// конфига — поле с путём, типом, границами и русской подписью. Правка хранится как «путь → значение» (strat_cfg_override, key "p:<путь>"),
// превращается в deepMerge-патч поверх STRAT_CFG и уходит в снимок партии (L.cfg) — идущие партии и повторы не меняются.
// Пути элементов списков с id — по id («techs.#horse.era»), а не по индексу: новая технология в коде не сдвинет чужую правку.
import { STRAT_CFG, RACES, KINDS } from "./rules";

export type FT = "int" | "num" | "bool" | "text" | "enum";
export type Field = { p: string; t: FT; def: any; min?: number; max?: number; opts?: string[]; len?: number; ro?: string; sec: string; g: string; l: string; pin?: number; hint?: string };
type Keys = (string | number)[];

export const SECTIONS: { id: string; name: string; hint: string }[] = [
  { id: "units", name: "Фигуры", hint: "характеристики, дальность, таланты, умения и ульты фигур" },
  { id: "races", name: "Расы", hint: "пассивки рас, «Сила стихии», жеребьёвка рас" },
  { id: "chief", name: "Вожди", hint: "опыт и рост Вождя, типы Вождей и их деревья навыков, имена" },
  { id: "ults", name: "Ульты Вождей", hint: "ОД, перезарядка, дальность, форма, урон" },
  { id: "techs", name: "Технологии и эпохи", hint: "дерево тактик: эпоха, группа «или», требования, эффекты; цены исследований" },
  { id: "build", name: "Постройки и чудеса", hint: "цены, эффекты, прочность, расовые варианты, башни" },
  { id: "econ", name: "Экономика и земля", hint: "старт, города, клетки карты, рост земли, поселения, торговля" },
  { id: "league", name: "Лиги и размеры карт", hint: "ОД по лигам, лимит ходов, время хода, армии, эпохи и население по размеру" },
  { id: "goals", name: "Цели и рейтинг", hint: "шесть целей, пороги по размеру, сколько нужно для победы, коэффициенты рейтинга" },
  { id: "xp", name: "Опыт и Слава", hint: "опыт фигур, кривая уровней, источники Славы" },
  { id: "misc", name: "Служебное", hint: "повторы и прочее" },
];
function secOf(k: Keys): string {
  const a = String(k[0]), b = String(k[1] ?? "");
  if (["units", "range", "talents", "unitTree", "unitUlts", "unitRaceNames"].includes(a)) return "units";
  if (a === "race" || a === "elementBonus" || (a === "econ" && (b === "raceAp" || b === "raceDraw"))) return "races";
  if (["chief", "chiefs", "chiefNames"].includes(a)) return "chief";
  if (a === "ults") return "ults";
  if (a === "techs" || a === "techRace" || (a === "econ" && b === "research")) return "techs";
  if (["build", "bldHp", "buildTpl", "buildRace"].includes(a) || (a === "econ" && ["tower", "era4", "forgeMax", "fx", "glacier", "market"].includes(b))) return "build";
  if (a === "sizes" || (a === "econ" && ["sizes", "league", "leagueRules"].includes(b))) return "league";
  if (a === "goals") return "goals";
  if (a === "econ" && (b === "xp" || b === "glory" || b === "obelisk")) return "xp";
  if (a === "econ" && b !== "replay") return "econ";
  return "misc";
}

const KIND_RU: Record<string, string> = { pawn: "Ополченец", knight: "Всадник", mage: "Маг", rook: "Страж", hero: "Герой", king: "Вождь" };
const RACE_RU: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
const LEAGUE_RU: Record<string, string> = { quick: "Быстрая лига", normal: "Обычная лига", tactical: "Тактическая лига" };
const GOAL_RU: Record<string, string> = { chief: "Цареубийство", hold: "Твердыня", treasury: "Казна", domain: "Держава", wonder: "Великое чудо", glory: "Слава" };
/** Подписи ключей (то, что не нашлось — показывается как есть). */
export const KEY_RU: Record<string, string> = {
  hp: "Здоровье (HP)", atk: "Атака (АТК)", arm: "Броня (БРН)", cost: "Цена", ap: "ОД", cd: "Перезарядка, ходов", range: "Дальность", r: "Радиус",
  mageMove: "Ход Мага", mageShot: "Выстрел Мага", rookMove: "Ход Стража", heroMove: "Ход Героя", elementBonus: "Бонус стихии (круг рас)",
  hpMul: "HP ×", burnTurns: "Поджог: ходов", burnDmg: "Поджог: урон", chillMove: "Обморожение: −ход", chillTurns: "Обморожение: ходов", knowPen: "Штраф знаний", knowFloor: "Нижний порог знаний",
  rookAtk: "АТК Стража", healOwnT: "Лечение на своей земле", growthMul: "Рост ×", forestKnow: "Знание за лес", forestKnowMax: "Знание за лес: максимум", armOutside: "БРН вне своей земли", chain: "Разряд (цепь)",
  turnLimit: "Лимит ходов (0 — без лимита)", turnSec: "Время хода, с", reserveSec: "Запас времени, с", army: "Армия", size: "Размер",
  gold: "Золото", know: "Знания", glory: "Слава", growth: "Рост", secondGold: "Золото второму игроку", firstAp1: "ОД первого игрока на 1-м ходу",
  eras: "Эпох доступно", outposts: "Застав максимум", capSlots: "Слоты столицы по уровню", pop: "Лимит фигур",
  capGold: "Золото столицы", capKnow: "Знания столицы", outGold: "Золото заставы", outKnow: "Знания заставы", growthBase: "Базовый рост", growthThr: "Пороги роста столицы",
  capRadius: "Радиус столицы по уровню", outRadius: "Радиус заставы", outSlots: "Слоты заставы", outMinDist: "Мин. расстояние заставы", recruitRadius: "Радиус найма", siegeTurns: "Осада: ходов до взятия",
  kill: "За убийство", tech: "За технологию", era: "Эпоха", perTerr: "Клеток земли на 1 Славу", found: "Поселение", capture: "Захват",
  eraCost: "Цена перехода в эпоху", need: "Нужно", perTurn: "За ход", maxPaths: "Тактик можно взять", techGlory: "Слава за технологию",
  hit: "За удар", lv: "Опыт до уровня", grow: "Рост", draw: "Ничья",
  on: "Включено", mode: "Режим", sizeOff: "Без роста на размере", min: "Минимум", max: "Максимум", reach: "Дальность от города", bank: "Копится прав", autoAfter: "Авто-рост через, ходов",
  perCell: "Доплата за клетку", bld: "Постройки", turns: "Ходов", by: "Кто основывает", armPen: "Штраф БРН", refund: "Возврат при отмене", bare: "Голое поселение",
  spawnOnCity: "Призыв на клетке города", apoGlory: "Слава за Апофеоз", legendMax: "Легендарных построек", wonderEra: "Эпоха Чуда",
  apBase: "ОД: база", apTech: "ОД за ОД-технологию", apBld: "ОД за Военный совет", raceCap: "«Сила стихии»: максимум", onceMax: "Однократных построек", apMax: "ОД: максимум",
  growMin: "Рост земли: минимум", growMax: "Рост земли: максимум", respawn: "Возрождение Вождя, ходов", xp: "Опыт", research: "Исследования", techEra: "Эпоха технологии",
  kind: "Вид", per: "Единиц на +1 ОД", label: "Подпись", fav: "Шанс любимой расы, %", other: "Шанс другой расы, %", favMax: "Любимых рас",
  keepDays: "Хранить дней", recent: "Последних", saveMax: "Сохранённых максимум", rollMs: "Сохранять каждые, мс", maxBytes: "Размер максимум, байт", leagueRules: "Правила лиг включены",
  armor: "Броня", counter: "Ответный удар", outDist: "Дальность от земли", minRatio: "Курс: минимум", maxRatio: "Курс: максимум", maxShare: "Доля максимум", rate: "Курс", every: "Раз в N ходов", share: "Доля",
  forgeMax: "Кузня: раз максимум", wallArm: "БРН от Стены", quarryWallArm: "БРН Стены с Каменоломней", quarryGold: "Золото с каменоломни", harborMax: "Гавань: максимум", rodChain: "Громоотвод: разряд", staticChain: "Статика: разряд",
  name: "Название", eff: "Описание", icon: "Значок", race: "Раса", legend: "Легендарная", once: "Однократная", field: "Полевая", fx: "Эффект",
  era_: "Эпоха", br: "Тактика", grp: "Группа («или»)", req: "Требует", unlock: "Открывает", lvl: "Уровень", ult: "Ульта",
  banner: "Баннер", shape: "Форма", dmg: "Урон", pow: "Сила", mag: "Сила", dur: "Длительность", type: "Тип", up: "Усиление (ур. 4+)", act: "Умения (ур. 3)",
  base: "База", tree: "Дерево навыков", holdK: "Твердыня: очков", holdTurns: "Твердыня: ходов подряд", wonderGold: "Чудо: золото", wonderKnow: "Чудо: знания", wonderCap: "Чудо только в столице",
  list: "Цели в игре", winA: "Рейтинг победителю: a", winB: "Рейтинг победителю: b", loseA: "Рейтинг проигравшему: a", loseB: "Рейтинг проигравшему: b",
  hold: "Твердыня", city: "Свой город", walled: "Город со Стеной", enemyCap: "Взятая столица", point: "Опорная точка", points: "Клетки-точки", wonderGlory: "Слава за ход владельцу Чуда",
  chiefKill: "За убийство Вождя", holdEvery: "Стоять на объекте: раз в N ходов", survive: "За выживание", surviveEvery: "Выживание: раз в N ходов",
  noChiefAp: "−ОД без Вождя", killGlory: "Слава за первого Вождя", lateKillGlory: "Слава за следующих Вождей", renames: "Переименований", window: "Окно переименования, ходов", sameTypeOnRespawn: "Тот же тип при возрождении",
  rebuild: "Отстройка, доля цены", repairHpPerGold: "Ремонт: HP за золото", razeGlory: "Слава за снос", razeXp: "Опыт за снос", wonderGloryLost: "Чудо теряет Славу при сносе",
  hop: "Прыжок", hops: "Прыжков", eraHops: "Прыжков за эпоху", eraDmg: "Урон за эпоху", chiefMul: "Урон по Вождю ×", shot: "Дальность выстрела",
  atkK: "АТК по типу", armK: "БРН по типу", goldTurn: "Золото за ход", goldCity: "Золото с города", goldMV: "Золото с рудника и деревни", knowCity: "Знания с города", bldDisc: "Скидка на постройки",
  capR: "Радиус столицы", outR: "Радиус заставы", kingHp: "HP Вождя", siege: "Осада дольше", atkEnemyT: "АТК на вражеской земле", armOwnT: "БРН на своей земле", armKing2: "БРН у Вождя (радиус 2)",
  formation: "Строй", ambush: "Засада", terrGlory: "Слава с земли ×", knightDisc: "Всадник дешевле", ultPow: "Сила ульты", ultCd: "Перезарядка ульты −", auraArm: "Аура БРН", auraAtk: "Аура АТК",
  heal: "Лечение", summon: "Призыв", slayer: "Убийца", burn: "Поджог", chill: "Обморожение", xpMul: "Опыт ×", ids: "Цели", info: "Описание", order: "Порядок",
  v: "Версия", id: "Код", sprite: "Спрайт", version: "Версия правил", spawn: "Появление", quiet: "Тихие ходы", ruins: "Руины", obelisk: "Обелиск", start: "Старт",
};
const SKIP = new Set(["techRace.order"]); // служебные списки: только просмотр
const TEXT_KEYS = new Set(["name", "eff", "label", "banner", "icon"]);
const TEXT_ROOTS = new Set(["chiefNames", "unitRaceNames"]);
const LOCK_KEYS: Record<string, string> = { id: "код элемента — на него ссылается логика", sprite: "файл арта", v: "версия типа Вождя", version: "версия правил (служебное)" };

/** Обойти конфиг: каждый лист (число, строка, булево) → [ключи, значение]. */
export function leaves(o: any, k: Keys = [], out: [Keys, any][] = []): [Keys, any][] {
  if (o === null || o === undefined) return out;
  if (typeof o !== "object") { out.push([k, o]); return out; }
  if (Array.isArray(o)) o.forEach((v, i) => leaves(v, [...k, i], out)); else for (const kk of Object.keys(o)) leaves(o[kk], [...k, kk], out);
  return out;
}
const idOf = (v: any) => (v && typeof v === "object" && !Array.isArray(v) && typeof v.id === "string" ? v.id : null);
const hasUniqueIds = (a: any[]) => { const ids = a.map(idOf); return ids.every((x) => x) && new Set(ids).size === ids.length; };
/** Ключи → путь («techs.#horse.era»). */
export function toPath(base: any, k: Keys): string {
  const out: string[] = []; let o = base;
  for (const s of k) { if (Array.isArray(o) && typeof s === "number" && hasUniqueIds(o)) out.push("#" + idOf(o[s])); else out.push(String(s)); o = o?.[s as any]; }
  return out.join(".");
}
/** Путь → ключи по текущему базовому конфигу (null — такого поля больше нет). */
export function resolve(base: any, p: string): Keys | null {
  if (typeof p !== "string" || !p || p.length > 200) return null;
  const out: Keys = []; let o = base;
  for (const s of p.split(".")) {
    if (o === null || typeof o !== "object") return null;
    if (Array.isArray(o)) {
      let i: number; if (s.startsWith("#")) i = o.findIndex((x) => idOf(x) === s.slice(1)); else { if (!/^\d+$/.test(s)) return null; i = Number(s); if (hasUniqueIds(o)) return null; }
      if (i < 0 || i >= o.length) return null; out.push(i); o = o[i];
    } else { if (!Object.prototype.hasOwnProperty.call(o, s)) return null; out.push(s); o = o[s]; }
  }
  return o !== null && typeof o === "object" ? null : out;
}
export const getAt = (o: any, k: Keys) => k.reduce((a, s) => (a == null ? a : a[s as any]), o);

const numKey = (k: Keys) => String([...k].reverse().find((s) => typeof s === "string") ?? "");
const FRAC = /mul|share|ratio|rate|refund|bonus|disc|pow|^win|^lose|rebuild/i;
type Spec = Partial<Pick<Field, "t" | "min" | "max" | "opts" | "len" | "ro">>;
/** Явные границы (регулярка по пути с «*» вместо индексов и id). Порядок важен: первое совпадение. */
const RULES: [RegExp, Spec][] = [
  [/^units\.[\w*]+\.hp$/, { t: "int", min: 1, max: 500 }], [/^units\.[\w*]+\.atk$/, { t: "int", min: 0, max: 100 }], [/^units\.[\w*]+\.arm$/, { t: "int", min: 0, max: 30 }], [/^units\.[\w*]+\.cost$/, { t: "int", min: 0, max: 500 }],
  [/^range\./, { t: "int", min: 0, max: 20 }], [/^elementBonus$/, { t: "num", min: 0, max: 1 }],
  [/^race\.[\w*]+\.hpMul$/, { t: "num", min: 0.1, max: 5 }], [/^race\.[\w*]+\.growthMul$/, { t: "num", min: 0.1, max: 5 }],
  [/^sizes\.[\w*]+\.turnLimit$/, { t: "int", min: 0, max: 2000 }], [/^sizes\.[\w*]+\.(turnSec|reserveSec)$/, { t: "int", min: 5, max: 86400 }], [/^sizes\.[\w*]+\.ap$/, { t: "int", min: 1, max: 20 }], [/^sizes\.[\w*]+\.size$/, { ro: "размер поля — ключ таблицы" }],
  [/^econ\.league\.[\w*]+\.(xp|research)$/, { t: "num", min: 0.01, max: 10 }], [/^econ\.league\.[\w*]+\.race\.[\w*]+\.hpMul$/, { t: "num", min: 0.1, max: 5 }],
  [/^econ\.league\.[\w*]+\.(apBase|apTech|apBld|raceCap|onceMax)$/, { t: "int", min: 0, max: 20 }], [/^econ\.league\.[\w*]+\.apMax$/, { t: "int", min: 1, max: 30 }], [/^econ\.league\.[\w*]+\.(grow|growMin|growMax|capture|found|respawn)$/, { t: "int", min: 1, max: 200 }],
  [/^econ\.sizes\.[\w*]+\.eras$/, { t: "int", min: 0, max: 4 }], [/^econ\.sizes\.[\w*]+\.glory$/, { t: "int", min: 0, max: 100000 }], [/^econ\.sizes\.[\w*]+\.pop$/, { t: "int", min: 1, max: 500 }],
  [/^econ\.research\.(cost|eraCost)\.\*$/, { t: "int", min: 0, max: 10000 }], [/^econ\.research\.maxPaths$/, { t: "int", min: 1, max: 6 }], [/^econ\.research\.(need|perTurn)$/, { t: "int", min: 1, max: 10 }],
  [/^econ\.xp\.lv\.\*$/, { t: "int", min: 0, max: 100000 }], [/^chief\.lv\.\*$/, { t: "int", min: 0, max: 100000 }],
  [/^econ\.raceDraw\.(fav|other)$/, { t: "int", min: 0, max: 100 }], [/^econ\.replay\.maxBytes$/, { ro: "технический предел хранилища" }],
  [/^econ\.trade\.(minRatio|maxRatio)$/, { t: "num", min: 0.05, max: 10 }], [/^econ\.found\.refund$/, { t: "num", min: 0, max: 1 }], [/^econ\.trade\.maxShare$/, { t: "num", min: 0, max: 1 }],
  [/^goals\.sizes\.[\w*]+\.need$/, { t: "int", min: 1, max: 6 }], [/^goals\.sizes\.[\w*]+\.share$/, { t: "num", min: 0, max: 0.95 }], [/^goals\.sizes\.[\w*]+\.(gold|wonderGold|wonderKnow)$/, { t: "int", min: 0, max: 100000 }],
  [/^goals\.sizes\.[\w*]+\.(holdK|holdTurns)$/, { t: "int", min: 1, max: 1000 }], [/^goals\.sizes\.[\w*]+\.rate\.(winA|loseA)$/, { t: "num", min: 0.05, max: 5 }], [/^goals\.sizes\.[\w*]+\.rate\.(winB|loseB)$/, { t: "num", min: 0, max: 1 }],
  [/^goals\.(ids|hold\.points)/, { ro: "коды целей — на них ссылается логика" }], [/^techRace\.order/, { ro: "порядок узлов для расовых имён" }],
  [/^(ults|unitUlts)\.[\w*]+\.ap$/, { t: "int", min: 0, max: 20 }], [/^(ults|unitUlts)\.[\w*]+\.cd$/, { t: "int", min: 0, max: 50 }], [/^(ults|unitUlts)\.[\w*]+\.range$/, { t: "int", min: 0, max: 35 }], [/^(ults|unitUlts)\.[\w*]+\.chiefMul$/, { t: "num", min: 0, max: 5 }],
  [/^unitTree\.[\w*]+\.act\.\*\.ap$/, { t: "int", min: 0, max: 20 }], [/^unitTree\.[\w*]+\.act\.\*\.cd$/, { t: "int", min: 0, max: 50 }], [/^unitTree\.[\w*]+\.up\.pow$/, { t: "num", min: 0.1, max: 10 }],
  [/\.era$/, { t: "int", min: 1, max: 4 }], [/\.lvl$/, { t: "int", min: 1, max: 10 }], [/\.(ap)$/, { t: "int", min: 0, max: 20 }], [/\.(cd)$/, { t: "int", min: 0, max: 50 }], [/\.(range|r)$/, { t: "int", min: 0, max: 35 }],
  [/\.cost$/, { t: "int", min: 0, max: 10000 }], [/^chiefs\.\*\.base\.hp$/, { t: "int", min: 1, max: 500 }], [/^chiefs\.\*\.base\.(atk|arm)$/, { t: "int", min: 0, max: 100 }],
];
const norm = (p: string) => p.split(".").map((s) => (s.startsWith("#") || /^\d+$/.test(s) ? "*" : s)).join(".");

/** Варианты для полей-ссылок (код другого элемента). */
function enumOf(base: any, k: Keys, p: string, observed: Map<string, Set<string>>): string[] | null {
  const n = norm(p), a = String(k[0]);
  if (/^techs\.\*\.req\.\*$/.test(n)) return base.techs.map((t: any) => t.id);
  if (/^techs\.\*\.unlock\.\*$/.test(n)) return Object.keys(base.build);
  if (/\.race$/.test(n) && (a === "techs" || a === "chiefs" || a === "build")) return [...RACES];
  if (/^chiefs\.\*\.tree\.\*\.req\.\*$/.test(n)) return (base.chiefs[k[1] as number]?.tree || []).map((x: any) => x.id);
  if (/^chiefs\.\*\.tree\.\*\.ult$/.test(n)) return Object.keys(base.ults);
  if (/^unitTree\.\w+\.ult$/.test(n)) return Object.keys(base.unitUlts);
  if (/^(ults|unitUlts)\.\w+\.shape$/.test(n)) return ["circle", "square", "line", "chain"];
  if (/^goals\.sizes\.\w+\.list\.\*$/.test(n)) return [...base.goals.ids];
  if (/^sizes\.\w+\.army\.\*\.\*$/.test(n)) return KINDS.filter((x) => x !== "king" || true);
  const o = observed.get(n); return o && o.size ? [...o] : null;
}

let cached: { base: any; fields: Field[]; byPath: Map<string, Field> } | null = null;
/** Схема всех полей конфига (кэш на базовый конфиг). */
/** t1243: «Главное» — поля, которые админ правит чаще всего; показываются отдельным блоком вверху (порядок = порядок здесь).
 *  Стартовые ОД: при включённых правилах лиг ход начинается с econ.league.<лига>.apBase (+технологии/постройки, до apMax); без них — sizes.<N>.ap. */
const PINS: [RegExp, string, string][] = [
  [/^econ\.league\.(quick|normal|tactical)\.apBase$/, "Стартовые ОД (в начале каждого хода)", "База ОД на ход; к ней добавляются ОД-технологии и Военный совет, но не выше «ОД: максимум»."],
  [/^econ\.league\.(quick|normal|tactical)\.apMax$/, "ОД: максимум за ход", "Потолок ОД с технологиями и постройками. Должен быть не меньше стартовых ОД."],
  [/^econ\.leagueRules$/, "Правила лиг включены", "Если выключить — ОД берутся из «ОД без правил лиг» по размеру карты."],
  [/^sizes\.\d+\.ap$/, "ОД без правил лиг", "Стартовые ОД по размеру карты — действуют, только если правила лиг выключены."],
  [/^econ\.start\.firstAp1$/, "", "0 — первый игрок на 1-м ходу получает обычные ОД."],
  [/^sizes\.\d+\.turnLimit$/, "", ""],
];
export function schema(base: any = STRAT_CFG): { fields: Field[]; byPath: Map<string, Field> } {
  if (cached && cached.base === base) return cached;
  const L = leaves(base), observed = new Map<string, Set<string>>();
  for (const [k, v] of L) if (typeof v === "string") { const n = norm(toPath(base, k)); if (!observed.has(n)) observed.set(n, new Set()); observed.get(n)!.add(v); }
  const fields: Field[] = [];
  for (const [k, v] of L) {
    const p = toPath(base, k), n = norm(p), key = numKey(k), last = k[k.length - 1];
    const f: Field = { p, t: "int", def: v, sec: secOf(k), ...labels(base, k) };
    const rule = RULES.find(([re]) => re.test(n))?.[1] || {};
    if (SKIP.has(n.split(".").slice(0, 2).join("."))) f.ro = "служебный список";
    if (typeof v === "boolean") f.t = "bool";
    else if (typeof v === "string") {
      const lockReason = typeof last === "string" ? LOCK_KEYS[last] : undefined;
      if (lockReason) f.ro = lockReason;
      if (TEXT_KEYS.has(key) || TEXT_ROOTS.has(String(k[0])) || (k[0] === "techRace" && k[1] === "names") || (k[0] === "techRace" && k[1] === "fx" && key === "eff")) {
        f.t = "text"; f.len = key === "icon" ? 8 : key === "eff" ? 400 : 60;
      } else { f.t = "enum"; f.opts = enumOf(base, k, p, observed) || [v]; if (!f.opts.includes(v)) f.opts.push(v); }
    } else {
      f.t = Number.isInteger(v) && !FRAC.test(key) ? "int" : "num";
      if (rule.t) f.t = rule.t === "int" && !Number.isInteger(v) ? "num" : rule.t; if (rule.min !== undefined) f.min = rule.min; if (rule.max !== undefined) f.max = rule.max;
      if (f.min === undefined) f.min = v < 0 ? -Math.max(10, Math.abs(v) * 10) : 0;
      if (f.max === undefined) f.max = Math.min(100000, Math.max(f.t === "num" ? 10 : 20, Math.abs(v) * 10));
      if (v < f.min) f.min = v; if (v > f.max) f.max = v; // умолчание всегда в границах
    }
    if (rule.ro) f.ro = rule.ro;
    const pin = PINS.findIndex(([re]) => re.test(p)); if (pin >= 0) { const [, l, hint] = PINS[pin]; f.pin = pin + 1; if (l) f.l = l; if (hint) f.hint = hint; }
    fields.push(f);
  }
  cached = { base, fields, byPath: new Map(fields.map((f) => [f.p, f])) };
  return cached;
}

const STRUCT_RU: Record<string, string> = { M: "Рудник", Q: "Каменоломня", A: "Алтарь", S: "Святилище", V: "Деревня", D: "Причал" };
const BTYPE_RU: Record<string, string> = { economy: "Хозяйственные", knowledge: "Знания", military: "Военные", special: "Особые", fort: "Укрепления", wonder: "Чудо", legend: "Легендарные", tower: "Башни" };
const ROOT_RU: Record<string, string> = { econ: "", goals: "Цели", chief: "Вождь", bldHp: "Прочность построек", techRace: "Расовые технологии", range: "Дальность ходов", sizes: "", talents: "Таланты", build: "Постройки",
  trade: "Торговля", market: "Рынок", glacier: "Ледник", tower: "Сторожевые башни", era4: "Эпоха IV", terr: "Земля", struct: "Объекты карты", raceDraw: "Жеребьёвка рас", replay: "Повторы", fx: "Эффекты построек",
  start: "Старт", city: "Города", ruins: "Руины", obelisk: "Обелиск", glory: "Слава", research: "Исследования", xp: "Опыт", quiet: "Тихие ходы", found: "Поселения", info: "Описание целей", rate: "Рейтинг", names: "Имена", lv: "Кривая уровней", grow: "Рост за уровень" };
/** Подписи: группа (элемент с именем — технология, фигура, лига…) и само поле. */
function labels(base: any, k: Keys): { g: string; l: string } {
  const parts: { t: string; n: boolean }[] = []; let o = base;
  for (let i = 0; i < k.length; i++) {
    const s = k[i], parent = i ? String(k[i - 1]) : "", root = String(k[0]), next = o?.[s as any];
    let named = "";
    if (typeof s === "number" && idOf(next)) named = (next.name ? next.name : next.id) + (next.race && root === "techs" ? ` (${RACE_RU[next.race] || next.race})` : "");
    else if (typeof s === "number" && root === "talents" && i === 2) named = `ряд ${s + 1}`;
    else if (typeof s === "string" && i > 0) {
      if (KIND_RU[s] && i === 1 && ["units", "talents", "unitTree"].includes(root)) named = KIND_RU[s];
      else if (RACE_RU[s] && (i === 1 || ["race", "raceAp", "names", "fx"].includes(parent) && root !== "econ" || parent === "race" || parent === "raceAp")) named = RACE_RU[s];
      else if (LEAGUE_RU[s] && parent === "league") named = LEAGUE_RU[s];
      else if (/^\d+$/.test(s) && parent === "sizes") named = `${s}×${s}`;
      else if (parent === "build" || parent === "buildTpl" || (root === "buildRace" && i === 2)) named = base.build?.[s]?.name || (s === "special" ? "Особые" : s);
      else if (root === "techRace" && parent !== "names" && i === 3) named = base.techs.find((t: any) => t.id === s)?.name || s;
      else if (parent === "ults" || parent === "unitUlts") named = next?.name || s;
      else if (parent === "info" && GOAL_RU[s]) named = GOAL_RU[s];
      else if (parent === "struct") named = STRUCT_RU[s] || s;
      else if (parent === "type" && root === "bldHp") named = BTYPE_RU[s] || s;
    }
    if (named) parts.push({ t: named, n: true });
    else if (typeof s === "number") parts.push({ t: `#${s + 1}`, n: false });
    else parts.push({ t: i < 2 && ROOT_RU[s] !== undefined ? ROOT_RU[s]! : KEY_RU[s] || KIND_RU[s] || RACE_RU[s] || base.unitUlts?.[s]?.name || s, n: false });
    o = next;
  }
  if (parts.length) parts[parts.length - 1]!.n = false; // сам лист — всегда подпись поля, не группа
  const ln = parts.map((x) => x.n).lastIndexOf(true);
  if (ln >= 0) return { g: parts.filter((x, i) => x.n && i <= ln).map((x) => x.t).join(" › "), l: parts.slice(ln + 1).map((x) => x.t).join(" · ") || "значение" };
  const rest = parts.filter((x) => x.t);
  if (rest.length <= 1) return { g: "Общее", l: rest[0]?.t || "значение" };
  return { g: rest[0]!.t, l: rest.slice(1).map((x) => x.t).join(" · ") };
}

export type FieldErr = { p: string; msg: string };
/** Проверить одно значение по схеме. */
export function checkValue(f: Field | undefined, v: any, p: string): string | null {
  if (!f) return `поля «${p}» нет в правилах (возможно, его убрали из кода)`;
  if (f.ro) return `«${f.l}» не редактируется: ${f.ro}`;
  if (f.t === "bool") return typeof v === "boolean" ? null : "нужно да/нет";
  if (f.t === "text") {
    if (typeof v !== "string") return "нужен текст"; const s = v.trim();
    if (!s) return "текст не может быть пустым"; if (s.length > (f.len || 60)) return `слишком длинно: ${s.length} символов, можно до ${f.len}`;
    if (/[<>\u0000-\u001f]/.test(s)) return "нельзя использовать символы < > и управляющие символы"; return null;
  }
  if (f.t === "enum") return typeof v === "string" && f.opts!.includes(v) ? null : `можно только: ${f.opts!.join(", ")}`;
  if (typeof v !== "number" || !Number.isFinite(v)) return "нужно число";
  if (f.t === "int" && !Number.isInteger(v)) return "нужно целое число";
  if (v < f.min! || v > f.max!) return `${fmt(v)} вне границ ${fmt(f.min!)}…${fmt(f.max!)}`;
  return null;
}
const fmt = (n: number) => String(n).replace(".", ",");

/** Карта правок «путь → значение» → deepMerge-патч (вложенные объекты; индексы списков — строковые ключи). Устаревшие пути пропускаются. */
export function pathsPatch(map: Record<string, any>, base: any = STRAT_CFG): any {
  const P: any = {}, S = schema(base);
  for (const [p, v] of Object.entries(map || {})) {
    const k = resolve(base, p); if (!k) continue; if (checkValue(S.byPath.get(p), v, p)) continue;
    let o = P; for (let i = 0; i < k.length - 1; i++) o = o[String(k[i])] ??= {};
    o[String(k[k.length - 1])] = typeof v === "string" ? v.trim() : v;
  }
  return P;
}
/** Обратное: патч поверх базы → «путь → значение» (только отличия от базы). */
export function flatten(patch: any, base: any = STRAT_CFG): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of leaves(base)) { const pv = getAt(patch, k.map(String)); if (pv !== undefined && pv !== null && typeof pv !== "object" && pv !== v) out[toPath(base, k)] = pv; }
  return out;
}

/** Связи между полями во всём конфиге (после слияния). Ошибки — по-русски; базовый конфиг обязан проходить без ошибок. */
export function invariants(c: any): FieldErr[] {
  const E: FieldErr[] = [], e = (p: string, msg: string) => E.push({ p, msg });
  const inc = (a: number[], from: number, p: string, what: string, strict = true) => { for (let i = from + 1; i < a.length; i++) if (strict ? a[i] <= a[i - 1] : a[i] < a[i - 1]) { e(p + "." + i, `${what}: каждое следующее значение должно быть ${strict ? "больше" : "не меньше"} предыдущего (${a.slice(from).join(" → ")})`); return; } };
  inc(c.econ.xp.lv, 2, "econ.xp.lv", "Опыт фигур до уровня"); inc(c.chief.lv, 1, "chief.lv", "Опыт Вождя до уровня");
  inc(c.econ.research.cost, 1, "econ.research.cost", "Цена технологии по эпохам", false); inc(c.econ.research.eraCost, 2, "econ.research.eraCost", "Цена эпохи", false);
  inc(c.econ.city.growthThr, 0, "econ.city.growthThr", "Пороги роста столицы"); inc(c.econ.city.capRadius, 0, "econ.city.capRadius", "Радиус столицы", false);
  for (const [lg, L] of Object.entries<any>(c.econ.league)) {
    if (!(L.growMin <= L.grow && L.grow <= L.growMax)) e(`econ.league.${lg}.grow`, `${LEAGUE_RU[lg] || lg}: должно быть «рост: минимум» ≤ «рост» ≤ «рост: максимум» (${L.growMin} ≤ ${L.grow} ≤ ${L.growMax})`);
    if (L.apBase > L.apMax) e(`econ.league.${lg}.apBase`, `${LEAGUE_RU[lg] || lg}: ОД база (${L.apBase}) больше максимума (${L.apMax})`);
  }
  if (c.econ.trade.minRatio > c.econ.trade.maxRatio) e("econ.trade.minRatio", "Торговля: минимальный курс больше максимального");
  { const d = c.econ.raceDraw; if (d.fav + d.other !== 100) e("econ.raceDraw.fav", `Жеребьёвка рас: шансы должны давать 100% (сейчас ${d.fav} + ${d.other})`); }
  for (const [n, s] of Object.entries<any>(c.sizes)) {
    if (s.turnLimit !== 0 && s.turnLimit < 5) e(`sizes.${n}.turnLimit`, `${n}×${n}: лимит ходов — 0 (без лимита) или от 5`);
    for (const [ri, row] of (s.army as string[][]).entries()) if (row.length > Number(n)) e(`sizes.${n}.army.${ri}`, `${n}×${n}: в ряду армии больше фигур, чем клеток`);
    if (s.army.flat().filter((x: string) => x === "king").length !== 1) e(`sizes.${n}.army`, `${n}×${n}: в армии должен быть ровно один Вождь`);
  }
  for (const [n, s] of Object.entries<any>(c.goals.sizes)) {
    const uniq = new Set(s.list); if (uniq.size !== s.list.length) e(`goals.sizes.${n}.list`, `${n}×${n}: цели в списке повторяются`);
    if (s.need > uniq.size) e(`goals.sizes.${n}.need`, `${n}×${n}: нужно ${s.need} целей, а в игре только ${uniq.size}`);
  }
  for (const [n, s] of Object.entries<any>(c.econ.sizes)) for (let i = 1; i < s.capSlots.length; i++) if (s.capSlots[i] < s.capSlots[i - 1]) { e(`econ.sizes.${n}.capSlots`, `${n}×${n}: слоты столицы не могут уменьшаться с уровнем`); break; }
  // технологии: требования существуют и раньше по эпохе; группа «или» — одна тактика и одна эпоха
  const T = new Map<string, any>(c.techs.map((t: any) => [t.id, t])), grp = new Map<string, any>();
  for (const t of c.techs) {
    for (const r of t.req || []) { const q = T.get(r); if (!q) e(`techs.#${t.id}.req`, `«${t.name}» требует несуществующую технологию «${r}»`); else if (q.era > t.era) e(`techs.#${t.id}.era`, `«${t.name}» (эпоха ${t.era}) требует «${q.name}» из более поздней эпохи ${q.era}`); else if (r === t.id) e(`techs.#${t.id}.req`, `«${t.name}» требует саму себя`); }
    if (t.grp !== "root") { const key = (t.race || "") + "|" + t.grp, g0 = grp.get(key); if (!g0) grp.set(key, t); else if (g0.br !== t.br || g0.era !== t.era) e(`techs.#${t.id}.grp`, `группа «или» ${t.grp}: «${t.name}» и «${g0.name}» должны быть из одной тактики и одной эпохи`); }
  }
  for (const ch of c.chiefs) { const N = new Map<string, any>(ch.tree.map((x: any) => [x.id, x]));
    for (const x of ch.tree) for (const r of x.req || []) { const q = N.get(r); if (!q) e(`chiefs.#${ch.id}.tree.#${x.id}.req`, `${ch.name}: «${x.name}» требует несуществующий навык`); else if (q.lvl >= x.lvl) e(`chiefs.#${ch.id}.tree.#${x.id}.lvl`, `${ch.name}: «${x.name}» (ур. ${x.lvl}) требует навык не младше себя («${q.name}», ур. ${q.lvl})`); } }
  return E;
}
