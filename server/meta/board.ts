// «Проклятые»: доска заданий и достижений (в духе Monster Hunter, без сюжета).
// Только сервер: прогресс копится из потока событий qev (service.ts), награда выдаётся здесь же по запросу
// игрока (board_claim) — один раз на ступень (номер ступени записывается ДО выдачи). Хранение — a.board в JSON
// аккаунта (accounts.data), миграция D1 не нужна. Определения генерируются из данных (мобы, боссы, ресурсы,
// комнаты) по шаблонам и правятся в админке (вид btask), общие настройки — вид board.
// Опыт — строго по таблице «уровень × сложность» (BOARD_CFG.xp, % от опыта на уровень), с дневным потолком.
// Формулы опыта за мобов, регенерация и множитель элиты здесь не трогаются.
import { ZONE_MOBS, MONSTER_LOOT, RESOURCES, RECIPES, ITEM_BY_ID, heroXpNeed, HERO_MAX_LEVEL, HERO_IDS } from "./defs";
import { HERO_NAMES } from "./shared";
import { BCHEST, BC_CATS, BC_TIERS, BC_CURSE_MAX, tierOfRank, countOf, rankCursePct, bcSpecCount, type BcSpec } from "./boardChestCfg";
import { grantChest, grantSpec, chestRoomErr, chestsOf, chestOps } from "./boardChest";
import { VARIANTS, VARIANT_BY_ID, BIOMES, baseOf, goalMatch, type BiomeId } from "./biomes";
import { BOSS_TIMERS, WORLD_GEN } from "./zoneGen";
import { gainXp, addRes, addItem, talentSpent, equippedItems, activeLook, type Account, type Hero } from "./profile";
import { charBlk, blkOf } from "./bmCfg";
import { setBoardCols } from "./boardCols";

export type Cat = "tut" | "npc" | "hunt" | "daily" | "weekly" | "monthly" | "hard" | "ach";
export const CATS: Cat[] = ["tut", "npc", "hunt", "daily", "weekly", "monthly", "hard", "ach"];
export const CAT_NAMES: Record<Cat, string> = { tut: "Обучение", npc: "Персонажи", hunt: "Доска охоты", daily: "Ежедневные", weekly: "Еженедельные", monthly: "Ежемесячные", hard: "Тяжёлые", ach: "Достижения" };
/** кто выдаёт: персонаж или «Доска объявлений» (объект в Аринаре; задания с неё берут, отменяют и сдают рядом с ней) */
export const GIVERS = ["", "board", "petr", "kyut", "alzi", "leyr"];
/** персонажи, которые сами выдают и принимают свои (личные) задания — в диалоге, как сюжетные квесты */
export const NPC_GIVERS = ["petr", "kyut", "alzi", "leyr"];
export const GIVER_NAMES: Record<string, string> = { "": "—", board: "Доска объявлений", petr: "Петр", kyut: "Кьют", alzi: "Алзи", leyr: "Лэйр" };
const PERIODIC: Cat[] = ["daily", "weekly", "monthly", "hard"]; // тяжёлые — случайный набор на неделю (решение Алекса: всё повторяющееся — из пула)

export interface BTask {
  id: string; cat: Cat; on: boolean; ord: number; giver: string;
  title: string; why: string; pc: string; mob: string; hl: string; // подсказки управления (обучение) и цель подсветки
  ev: string; m: string; f: string; minT: number;                  // событие, цель, условия (через запятую), мин. время забега
  n: number[]; d: number[];                                         // ступени (0 — нет) и сложность ступени 1…5
  lvl: number; minLvl: number; maxLvl: number; req: string;         // уровень цели (для опыта), доступность, предусловия
  res: Record<string, number>; item: string;                        // материалы за ступень (× номер ступени), предмет за последнюю
  auto: string;                                                     // обучение: состояние, при котором шаг засчитан сам
  hidden: boolean;                                                  // скрытое: до выполнения игрок видит «???» (текст не уходит клиенту)
  hint: string;                                                     // скрытое: необязательная подсказка вместо «???»-текста (админка; пусто — стандартная строка)
  x: number[]; xm: boolean;                                       // опыт за ступень — число (от уровня задания по таблице); xm — задан вручную в админке
  rmax: string;                                                     // высший ранг при выпадении ("" — по событию: S/SS только для боёв, забегов, испытаний)
  w: number;                                                        // вес в случайном пуле (ежедневные/еженедельные/ежемесячные/заказы), 0 — не выпадает
  ch?: BcSpec[];                                                    // награда «Сундуки» за последнюю ступень (админка): ярус, уровень, чары, проклятость; нет — как раньше
  rb: string;                                                       // на каком теле выполнять условие: "" — на своём (владелец), "any" — на любом, warrior/spearman/rogue/mage — на этом
}
export const BOARD_CFG: any = {
  on: true,
  cats: { tut: true, npc: true, hunt: true, daily: true, weekly: true, monthly: true, hard: true, ach: true },
  // случайный пул: на период каждому игроку выдаётся от Min до Max заданий категории (детерминированно: игрок + период, сброс по Киеву);
  // вероятность задания — его вес w (админка «Задания доски»), 0 — не выпадает. Тяжёлые не случайны: это разовые личные задания персонажей.
  dailyMin: 4, dailyMax: 6, weeklyMin: 3, weeklyMax: 4, monthlyMin: 2, monthlyMax: 3,
  hardMin: 1, hardMax: 2, // тяжёлые — тоже случайный набор на неделю
  // РАНГИ повторяющихся заданий (ежедневные, еженедельные, ежемесячные, тяжёлые, заказы охоты): ранг выпадает при выборе на период.
  // w — вес выпадения; plus — уровней врагов/задания сверх уровня героя на момент выпадения; mul — множитель опыта;
  // cnt — множитель количества; bon — сколько бонусных условий (0…3). S и SS — на отряд: враги намного выше, мировые боссы.
  ranks: {
    F: { w: 30, plus: -2, mul: 0.6, cnt: 0.6, bon: 0 }, E: { w: 24, plus: -1, mul: 0.8, cnt: 0.8, bon: 1 }, D: { w: 18, plus: 0, mul: 1, cnt: 1, bon: 1 },
    C: { w: 12, plus: 1, mul: 1.2, cnt: 1.2, bon: 1 }, B: { w: 8, plus: 2, mul: 1.5, cnt: 1.4, bon: 2 }, A: { w: 5, plus: 3, mul: 1.8, cnt: 1.6, bon: 2 },
    S: { w: 2, plus: 6, mul: 2, cnt: 1.3, bon: 3 }, SS: { w: 0.6, plus: 10, mul: 3, cnt: 1.5, bon: 3 }, // S/SS: уровень задания уже намного выше — множитель умеренный
  } as Record<string, { w: number; plus: number; mul: number; cnt: number; bon: number }>,
  rankOn: { daily: true, weekly: true, monthly: true, hunt: true, hard: true } as Record<string, boolean>,
  catPlus: { daily: 0, weekly: 2, monthly: 3, hunt: 0, hard: 3 } as Record<string, number>, // неделя: герой 10 ур. → враги 12 ур. (ранг D)
  bonusXp: 25, // % опыта ранга за каждое выполненное бонусное условие
  // бонусные условия (только то, что проверяет сервер). fast.min — минут с первого засчитанного до выполнения, по разделам
  bonus: {
    nodeath: { on: true }, fast: { on: true, daily: 30, weekly: 240, monthly: 900, hunt: 40, hard: 240 }, body: { on: false }, // «только в теле»: выключено — задания теперь у каждого тела свои, вместо него «Выполнить на другом теле» (xbody)
    higher: { on: true, n: 3 }, party: { on: true }, solo: { on: true }, night: { on: true }, elite: { on: true }, hirank: { on: true },
  } as Record<string, any>,
  // задания тел (решение Алекса): ежедневные, еженедельные, ежемесячные, тяжёлые и заказы Доски — у каждого тела свой набор, сброс и сдача.
  // xbody — доля выпавших заданий, условие которых нужно выполнить на ДРУГОМ сыгранном теле (сдаётся и награждает — тело-владелец).
  xbody: { on: true, pct: 15 } as { on: boolean; pct: number },
  mobWin: 3, // повторяющиеся на конкретного врага: враг не ниже уровня героя − mobWin (иначе в набор не попадает)
  huntMax: 6, npcMax: 8, pinMax: 10, trackMax: 10, bars: { ach: true, lib: true } as Record<string, boolean>,
  // Доска объявлений — объект на стартовой площади Аринара (не персонаж и не Альказак): заказы с неё берут, отменяют и сдают
  // рядом с ней. Заказы охоты обновляются каждый игровой день (сброс ежедневных); взятые остаются до сдачи или отмены.
  huntOffer: 8, huntBossOffer: 2,
  dailyFixed: "",          // ежедневные, которые есть у всех каждый день (сверх случайных), id через запятую; пусто — только пул
  nbWorld: "arinar", nbX: 24130, nbY: 24300, nbRange: 110,
  // Доска достижений — у Алтаря тел в хабе (достижения открываются и с неё, и из общего окна)
  abWorld: "hellfire", abX: 720, abY: 590, abRange: 110,
  tz: "Europe/Kyiv", resetHour: 0, weekDay: 1,
  // % от опыта на уровень (heroXpNeed) по полосам уровней и сложности 1…5
  xp: [[3, 6, 10, 16, 25], [2, 4, 7, 12, 20], [2, 4, 7, 12, 20], [1.5, 3, 5, 9, 15], [1, 2, 4, 7, 12], [1, 2, 4, 7, 12]],
  bands: [5, 10, 15, 20, 25, 30],
  refPlus: 2,      // устарело (не используется): опыт теперь — число от уровня задания; было: задание с уровнем цели L даёт опыт не выше уровня L + refPlus (низкие задания на высоком уровне — мало)
  // множитель к таблице по категории и потолок опыта категории за её период (% опыта на уровень; 0 — без потолка).
  // День — ежедневные, заказы Доски объявлений, личные задания персонажей, достижения; неделя — еженедельные и тяжёлые; месяц — ежемесячные.
  xpMul: { tut: 1, npc: 1, hunt: 0.35, daily: 0.6, weekly: 1 / 3, monthly: 1, hard: 0.6, ach: 0.25 },
  caps: { tut: 0, npc: 0, hunt: 0, daily: 0, weekly: 0, monthly: 0, hard: 0, ach: 0 }, // решение Алекса: потолков нет (механизм оставлен выключенным — число > 0 в админке включит)
  tutOn: true, tutVetLvl: 10, tutSkip: true,
  tutVetReward: true,       // опытному игроку (tutVetLvl) награды шагов обучения всё равно выдаются — один раз (решение Алекса; выкл — как раньше, без наград)
  qol: { help: true, lowHp: true, lvlInfo: true, talentNag: true, bmArrow: true, lowHpPct: 30, bossTimer: true, bossSoonSec: 10 },
};

/** коллизии обеих досок по текущим настройкам (вызывается при загрузке и после правки «📋 Доска» в админке) */
export function syncBoardCols() {
  const C = BOARD_CFG; setBoardCols(C.on === false ? [] : [{ world: C.nbWorld, x: Number(C.nbX), y: Number(C.nbY) }, { world: C.abWorld, x: Number(C.abX), y: Number(C.abY) }]);
}
syncBoardCols();

// ---------------- генерация ----------------
const T = (o: Partial<BTask> & { id: string; cat: Cat; title: string; ev: string }): BTask => ({
  on: true, ord: 0, giver: "", why: "", pc: "", mob: "", hl: "", m: "", f: "", minT: 0, n: [1, 0, 0, 0, 0], d: [1, 0, 0, 0, 0],
  lvl: 0, minLvl: 1, maxLvl: 30, req: "", res: {}, item: "", auto: "", hidden: false, hint: "", w: 1, x: [0, 0, 0, 0, 0], xm: false, rmax: "", rb: "", ...o,
} as BTask);
const pad5 = (a: number[]) => [...a, 0, 0, 0, 0, 0].slice(0, 5); // всегда 5 ячеек: админка правит n.0…n.4 / d.0…d.4
const mobName = (id: string) => ZONE_MOBS[id]?.name || id;
const resName = (r: string) => RESOURCES[r]?.name || r;
const firstMat = (base: string) => (MONSTER_LOOT[base]?.materials || []).map((m) => m.res).find((r) => RESOURCES[r] && r !== "soul_shard") || "soul_shard";
const HUNT_TIERS = [10, 15, 20, 30, 45];
const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
/** редкие Отголоски — из реестра класса (WORLD_GEN[мир].rares): новый редкий получает охоту/достижения сам */
const RARES: string[] = [...new Set(Object.values(WORLD_GEN).flatMap((G: any) => (G.rares || []).map((r: any) => r.type as string)))];
/** исполнитель по смыслу задания: охота — Алзи, ремесло и материалы — Петр, арена и забеги — Кьют, остальное — Лэйр */
const giverOf = (ev: string, f = "") => ev === "kill" ? (f.includes("party") ? "kyut" : "alzi") : ["gather", "craft", "salvage", "upgrade", "loot"].includes(ev) ? "petr" : ["run", "trial", "duel", "duel_win", "party", "dash", "ability"].includes(ev) ? "kyut" : "leyr";
const ROLE_NAMES: Record<string, string> = { swarm: "стайных", melee: "бойцов ближнего боя", charger: "таранящих", ranged: "стрелков", tank: "толстокожих", caster: "колдующих" };

function genTut(): BTask[] {
  const S: [string, string, string, string, string, string, string, number, number, string, string?][] = [
    // id, заголовок, зачем, ПК, телефон, событие, цель, n, уровень шага, подсветка, авто-засчёт
    ["move", "Пройдитесь немного", "Так вы перемещаетесь по миру", "W A S D или стрелки", "Левый джойстик внизу экрана", "ui", "move", 1, 1, "", "lvl:2"],
    ["hero", "Выберите героя у Алтаря", "Без героя нельзя сражаться", "Подойдите к Алтарю и нажмите E", "Подойдите к Алтарю и нажмите ✋", "select_hero", "", 1, 1, "altar", "hero"],
    ["book", "Откройте Книгу героя", "В ней снаряжение, таланты и задания", "Клавиша B (или J — задания)", "Кнопка 📖 внизу", "ui", "book", 1, 1, "btn:book", ""],
    ["board", "Откройте доску заданий", "Охота, ежедневные задания и достижения", "Клавиша U или кнопка 📋 внизу слева", "Кнопка 📋 внизу", "ui", "board", 1, 1, "btn:board", ""],
    ["arinar", "Пройдите в Аринар", "Там водятся Отголоски и лежат ресурсы", "Шагните в портал", "Шагните в портал", "reach", "arinar", 1, 1, "portal_arinar", "world:arinar"],
    ["kill", "Победите 3 Отголосков", "За победы растёт уровень героя", "ЛКМ в сторону врага (удерживайте) или V — автоатака", "Кнопка атаки справа внизу", "kill", "", 3, 1, "mob", "kills:3"],
    ["loot", "Заберите добычу из мешка", "Вещи и материалы падают в мешок у врага", "Клик по мешку или E рядом с ним", "Нажмите на мешок рядом с собой", "loot", "bag", 1, 1, "bag", ""],
    ["ability", "Примените навык", "Навыки сильнее обычной атаки", "Q, G, F или R", "Круглые кнопки навыков справа", "ability", "", 1, 1, "", ""],
    ["dash", "Сделайте рывок", "Рывком уходят от ударов", "Пробел или Shift", "Кнопка рывка справа", "dash", "", 1, 1, "", ""],
    ["equip", "Наденьте найденную вещь", "Снаряжение прибавляет урон и защиту", "Клавиша I (снаряжение) → нажмите на вещь", "📖 → «Снаряжение» → нажмите на вещь", "equip", "", 1, 1, "btn:book", "equipped:1"],
    ["gather", "Соберите ресурс", "Ресурсы нужны для ремесла и улучшений", "Подойдите к цветку или дереву и нажмите E", "Подойдите и нажмите ✋", "gather", "", 1, 1, "node", ""],
    ["map", "Откройте карту", "На ней видно, куда идти", "Клавиша M", "Кнопка 🗺 внизу", "ui", "map", 1, 1, "btn:map", ""],
    ["lvl3", "Дорастите до 3 уровня", "Каждый уровень даёт очко таланта", "Побеждайте Отголосков своего уровня", "Побеждайте Отголосков своего уровня", "lvl", "", 3, 1, "", "lvl:3"],
    ["talent", "Изучите талант", "Таланты усиливают героя навсегда", "Клавиша T (герой) → дерево талантов", "📖 → «Герой» → дерево талантов", "talent", "", 1, 2, "btn:book", "talents:1"],
    ["portal", "Откройте портал домой", "Быстрый путь в хаб и обратно", "Клавиша H", "Кнопка 🌀 внизу", "portal", "", 1, 3, "", ""],
    ["lvl5", "Дорастите до 5 уровня", "Откроется третья ячейка навыка", "Охотьтесь на Отголосков чуть сильнее себя", "Охотьтесь на Отголосков чуть сильнее себя", "lvl", "", 5, 3, "", "lvl:5"],
    ["salvage", "Разберите ненужную вещь у Петра", "Разбор даёт материалы для улучшений", "Подойдите к Петру и нажмите E", "Подойдите к Петру и нажмите ✋", "salvage", "", 1, 4, "npc:petr", ""],
    ["upgrade", "Улучшите вещь у Петра", "Улучшение — главный способ стать сильнее", "Петр → «Улучшение» → выберите вещь", "Петр → «Улучшение» → выберите вещь", "upgrade", "", 1, 5, "npc:petr", ""],
    ["hunt", "Возьмите заказ на Доске объявлений и сдайте его", "Заказы дают опыт и материалы сверх обычного", "Доска у портала в Аринаре: подойдите и нажмите E", "Доска у портала в Аринаре: подойдите и нажмите ✋", "claim", "hunt", 1, 5, "noticeboard", ""],
    ["elite", "Победите элитного Отголоска", "Элита в рамке — сильнее, но добычи больше", "Ищите врага с рамкой у имени", "Ищите врага с рамкой у имени", "kill", "", 1, 6, "mob", ""],
    ["crypt", "Продержитесь 2 минуты в Склепе", "Забег — быстрый опыт и редкие вещи", "Вход в Склеп — в хабе", "Вход в Склеп — в хабе", "run", "crypt", 1, 6, "", ""],
    ["party", "Соберите отряд", "Вместе быстрее и безопаснее", "Клик по игроку → «Пригласить»", "Нажмите на игрока → «Пригласить»", "party", "", 1, 7, "", ""],
    ["duel", "Сыграйте дуэль у Кьюта", "Дуэль — проверка сборки без риска", "Подойдите к Кьюту и нажмите E", "Подойдите к Кьюту и нажмите ✋", "duel", "", 1, 8, "npc:kyut", ""],
    ["lvl10", "Дорастите до 10 уровня", "Откроются Бездна и сильные боссы", "Задания доски ускоряют рост", "Задания доски ускоряют рост", "lvl", "", 10, 8, "", "lvl:10"],
    ["wboss", "Победите мирового босса", "Боссы дают лучшие материалы", "Время появления — на карте (M)", "Время появления — на карте", "kill", "", 1, 10, "", ""],
    ["lvl15", "Дорастите до 15 уровня", "Дальше — Звёздная высь и тяжёлые задания", "Ежедневные задания — хороший темп", "Ежедневные задания — хороший темп", "lvl", "", 15, 12, "", "lvl:15"],
  ];
  return S.map((s, i) => T({ id: "tut_" + s[0], cat: "tut", ord: i + 1, title: s[1], why: s[2], pc: s[3], mob: s[4], ev: s[5], m: s[6], n: pad5([s[7]]), d: pad5([1]), minLvl: 1, lvl: s[8], hl: s[9], auto: s[10] || "",
    f: s[0] === "elite" ? "elite" : s[0] === "wboss" ? "wboss" : "", minT: s[0] === "crypt" ? 120 : 0,
    res: s[0] === "gather" ? { moonpetal: 2 } : s[0] === "upgrade" ? { soul_shard: 1 } : s[0] === "wboss" ? { soul_shard: 2 } : {} }));
}

type ChainRow = [string, string, string, string, string, string, number[], number[], number, string, Record<string, number>?, number?];
function genNpc(): BTask[] {
  // id, исполнитель, заголовок, зачем, событие, цель|условия, ступени, сложность, мин. уровень, предусловия, материалы, minT
  const R: ChainRow[] = [
    ["p01", "petr", "Первые ресурсы", "Петру нужно сырьё для мастерской", "gather", "", [10], [1], 1, "", { dreamwood: 2 }],
    ["p02", "petr", "Разбор хлама", "Разбор возвращает материалы", "salvage", "", [3], [1], 2, "npc_p01", { soul_shard: 1 }],
    ["p03", "petr", "Первое ремесло", "Своими руками — надёжнее", "craft", "", [1], [2], 3, "npc_p02,npc_k01", { moonpetal: 3 }],
    ["p04", "petr", "Заточка", "Улучшенная вещь служит дольше", "upgrade", "", [1], [2], 4, "npc_p03", { soul_shard: 2 }],
    ["p05", "petr", "Ночные фиалки", "Фиалки нужны для ремесла", "gather", "moonpetal", [20], [2], 4, "npc_p04", { dreamwood: 4 }],
    ["p06", "petr", "Разбор с запасом", "Материалы для следующих улучшений", "salvage", "", [15], [2], 6, "npc_p05,npc_a03", { soul_shard: 3 }],
    ["p07", "petr", "Гнилая руда", "Руда нужна для прочных вещей", "gather", "rot_ore", [15], [3], 7, "npc_p06,npc_l04", { rot_ore: 4 }],
    ["p08", "petr", "Пять улучшений", "Набейте руку в мастерской", "upgrade", "", [5], [3], 8, "npc_p07", { soul_shard: 4 }],
    ["p09", "petr", "Мастер ремесла", "Каждый рецепт — новая вещь", "craft", "", [3], [3], 9, "npc_p08,npc_k04", { moonpetal: 6 }],
    ["p10", "petr", "Полная сумка", "Сотня материалов из мешков", "loot", "res", [100], [3], 10, "npc_p09", { soul_shard: 4 }],
    ["p11", "petr", "Звёздное серебро", "Серебро — для лучших улучшений", "gather", "starsilver", [25], [4], 12, "npc_p10,npc_l08", { starsilver: 5 }],
    ["p12", "petr", "Вещь +5", "Доведите одну вещь до +5", "upgrade", "max", [5], [4], 12, "npc_p11", { soul_shard: 6 }],
    ["k01", "kyut", "Первая дуэль", "Дуэль показывает слабые места", "duel", "", [1], [1], 2, "", {}],
    ["k02", "kyut", "Спуск в Склеп", "Забег — быстрые бои подряд", "run", "crypt", [1], [1], 3, "npc_k01,npc_a01", { soul_shard: 1 }],
    ["k03", "kyut", "Три минуты в Склепе", "Учитесь держаться дольше", "run", "crypt", [1], [2], 5, "npc_k02", { soul_shard: 2 }, 180],
    ["k04", "kyut", "Три волны Испытания", "Испытание проверяет выносливость", "trial", "max", [3], [2], 6, "npc_k03", { soul_shard: 2 }],
    ["k05", "kyut", "Первая победа", "Победа в дуэли", "duel_win", "", [1], [2], 6, "npc_k04,npc_a03", { soul_shard: 2 }],
    ["k06", "kyut", "Бездна", "Бездна — для героев посильнее", "run", "abyss", [1], [3], 10, "npc_k05", { soul_shard: 3 }],
    ["k07", "kyut", "Плечом к плечу", "В отряде — 30 побед", "kill", "|party", [30], [2], 7, "npc_k05,npc_l05", { soul_shard: 2 }],
    ["k08", "kyut", "Шесть волн", "Дольше — значит лучше", "trial", "max", [6], [3], 9, "npc_k07", { soul_shard: 3 }],
    ["k09", "kyut", "Пять побед в дуэлях", "Дуэлянт растёт в бою", "duel_win", "", [5], [3], 10, "npc_k08", { soul_shard: 4 }],
    ["k10", "kyut", "Пять минут в Бездне", "Выдержка в Бездне", "run", "abyss", [1], [4], 12, "npc_k09,npc_p09", { soul_shard: 5 }, 300],
    ["k11", "kyut", "Десять забегов", "Опыт приходит с повторением", "run", "", [10], [3], 12, "npc_k10", { soul_shard: 5 }],
    ["k12", "kyut", "Все восемь волн", "Пройдите Испытание целиком", "trial", "max", [8], [5], 14, "npc_k11", { soul_shard: 8 }],
    ["a01", "alzi", "Первая охота", "Десять Отголосков — для разминки", "kill", "", [10], [1], 1, "", { moonpetal: 2 }],
    ["a02", "alzi", "Элита", "Элитные враги — с рамкой у имени, а также редкие Отголоски", "kill", "|elite", [3], [2], 3, "npc_a01", { soul_shard: 1 }],
    ["a03", "alzi", "Кровавые льды", "Ближний к хабу край", "kill", "biome:ice", [30], [2], 3, "npc_a02,npc_l01", { soul_shard: 2 }],
    ["a04", "alzi", "Синее пламя", "Край огненных Отголосков", "kill", "biome:fire", [30], [2], 5, "npc_a03,npc_p03", { soul_shard: 2 }],
    ["a05", "alzi", "Проклятый враг", "Проклятые — с особой меткой", "kill", "|cursed", [1], [3], 5, "npc_a04", { soul_shard: 2 }],
    ["a06", "alzi", "Мировой босс", "Позовите отряд — так надёжнее", "kill", "|wboss", [1], [3], 6, "npc_a05,npc_k05", { soul_shard: 3 }],
    ["a07", "alzi", "Железные каменоломни", "Крепкие враги — крепкая добыча", "kill", "biome:stone", [40], [3], 7, "npc_a06", { soul_shard: 3 }],
    ["a08", "alzi", "Зачарованные", "У зачарованных — больше добычи", "kill", "|ench", [3], [3], 8, "npc_a07,npc_k06", { soul_shard: 3 }],
    ["a09", "alzi", "Звёздная высь", "Самый дальний край", "kill", "biome:air", [50], [3], 9, "npc_a08", { soul_shard: 4 }],
    ["a10", "alzi", "Редкий Отголосок", "Редкие уходят, если их не найти", "kill", "|rare", [1], [4], 8, "npc_a09,npc_l07", { soul_shard: 4 }],
    ["a11", "alzi", "Сотня равных", "Враги не ниже вашего уровня − 2", "kill", "|lvl", [100], [4], 10, "npc_a10", { soul_shard: 5 }],
    ["a12", "alzi", "Пять мировых боссов", "Настоящий охотник", "kill", "|wboss", [5], [5], 12, "npc_a11,npc_k10", { soul_shard: 8 }],
    ["l01", "leyr", "Дорога в Аринар", "Там начинается охота", "reach", "arinar", [1], [1], 1, "", {}],
    ["l02", "leyr", "Дрёмодрево", "Дерево нужно для ремесла", "gather", "dreamwood", [10], [1], 2, "npc_l01", { moonpetal: 2 }],
    ["l03", "leyr", "Дорога домой", "Портал домой экономит время", "portal", "", [1], [1], 3, "npc_l02", {}],
    ["l04", "leyr", "Пять записей бестиария", "Бестиарий подскажет, где кто живёт", "st", "bestiary", [5], [2], 3, "npc_l03,npc_a02", { soul_shard: 1 }],
    ["l05", "leyr", "Двадцать мешков", "Не оставляйте добычу на земле", "loot", "bag", [20], [2], 4, "npc_l04", { dreamwood: 4 }],
    ["l06", "leyr", "Сундук лагеря", "Зачистите лагерь — откроется сундук", "chest", "", [1], [2], 5, "npc_l05,npc_k03", { soul_shard: 2 }],
    ["l07", "leyr", "Десять записей", "Изучайте новых Отголосков", "st", "bestiary", [10], [3], 7, "npc_l06", { soul_shard: 2 }],
    ["l08", "leyr", "Высь", "Десять Отголосков Звёздной выси", "kill", "biome:air", [10], [3], 9, "npc_l07,npc_a07", { soul_shard: 3 }],
    ["l09", "leyr", "Пятьдесят ресурсов", "Сбор окупается в мастерской", "gather", "", [50], [3], 9, "npc_l08,npc_p08", { soul_shard: 3 }],
    ["l10", "leyr", "Двадцать записей", "Почти полный бестиарий", "st", "bestiary", [20], [4], 11, "npc_l09", { soul_shard: 4 }],
    ["l11", "leyr", "Три редких", "Редких ищут по всей карте", "kill", "|rare", [3], [4], 12, "npc_l10,npc_a10", { soul_shard: 5 }],
    ["l12", "leyr", "Пятнадцатый уровень", "Половина пути пройдена", "st", "lvl", [15], [4], 12, "npc_l11", { soul_shard: 6 }],
  ];
  return R.map((r, i) => { const [m, f] = r[5].split("|"); return T({ id: "npc_" + r[0], cat: "npc", ord: i + 1, giver: r[1], title: r[2], why: r[3], ev: r[4], m: m || "", f: f || "", n: pad5(r[6]), d: pad5(r[7]), minLvl: r[8], lvl: r[8] + 2, req: r[9], res: r[10] || {}, minT: r[11] || 0 }); });
}

function genHunt(): BTask[] {
  const out: BTask[] = [];
  const D = [1, 1, 2, 2, 3];
  for (const v of VARIANTS.filter((x) => !x.boss)) {
    const mat = firstMat(v.base), L = ZONE_MOBS[v.id]?.lvl || v.lvl;
    out.push(T({ id: "hunt_" + v.id, cat: "hunt", giver: "board", title: `Охота: ${v.name}`, why: `${BIOMES[v.biome].name}, ур. ${L}. Трофей: ${resName(mat)}`, ev: "kill", m: v.id,
      n: HUNT_TIERS, d: D, lvl: L, minLvl: Math.max(1, L - 3), res: { [mat]: 2 }, hl: "mob:" + v.id }));
  }
  for (const id of Object.keys(BOSS_TIMERS)) {
    const L = ZONE_MOBS[id]?.lvl || 10, mat = firstMat(baseOf(id));
    out.push(T({ id: "hunt_wb_" + id, cat: "hunt", giver: "board", title: `Босс: ${mobName(id)}`, why: `Мировой босс, ур. ${L}. Отряд — надёжнее`, ev: "kill", m: id, f: "boss",
      n: [1, 3, 5, 10, 15], d: [3, 3, 4, 4, 5], lvl: L, minLvl: Math.max(1, L - 2), res: { [mat]: 1, soul_shard: 2 } }));
  }
  for (const id of RARES) {
    const L = ZONE_MOBS[id]?.lvl || 10, mat = firstMat(id);
    out.push(T({ id: "hunt_rare_" + id, cat: "hunt", giver: "board", title: `Редкий: ${mobName(id)}`, why: `Появляется ненадолго, ур. ${L}`, ev: "kill", m: id, f: "rare",
      n: [1, 2, 3, 5, 8], d: [2, 3, 3, 4, 4], lvl: L, minLvl: Math.max(1, L - 3), res: { [mat]: 1, soul_shard: 1 } }));
  }
  for (const b of BIOME_IDS) {
    const B = BIOMES[b], L = B.lvl[1], L0 = B.lvl[0];
    out.push(T({ id: `hunt_${b}_any`, cat: "hunt", giver: "board", title: `Зачистка: ${B.name}`, why: `Любые Отголоски края, ур. ${L0}–${L}`, ev: "kill", m: "biome:" + b, n: [25, 50, 100, 200, 400], d: [1, 2, 2, 3, 4], lvl: L, minLvl: L0, res: { soul_shard: 1 } }));
    out.push(T({ id: `hunt_${b}_elite`, cat: "hunt", giver: "board", title: `Элита края: ${B.name}`, why: "Элитные — с рамкой у имени", ev: "kill", m: "biome:" + b, f: "elite", n: [3, 6, 10, 20, 35], d: [2, 2, 3, 3, 4], lvl: L, minLvl: L0, res: { soul_shard: 1 } }));
    out.push(T({ id: `hunt_${b}_cursed`, cat: "hunt", giver: "board", title: `Проклятые: ${B.name}`, why: "Проклятые сильнее, но щедрее", ev: "kill", m: "biome:" + b, f: "cursed", n: [1, 2, 4, 7, 10], d: [2, 3, 3, 4, 4], lvl: L, minLvl: L0 + 1, res: { soul_shard: 2 } }));
    out.push(T({ id: `hunt_${b}_ench`, cat: "hunt", giver: "board", title: `Зачарованные: ${B.name}`, why: "Зачарованные роняют больше", ev: "kill", m: "biome:" + b, f: "ench", n: [2, 4, 6, 10, 15], d: [2, 2, 3, 3, 4], lvl: L, minLvl: L0 + 1, res: { soul_shard: 1 } }));
    out.push(T({ id: `hunt_${b}_party`, cat: "hunt", giver: "board", title: `Отрядом: ${B.name}`, why: "Побеждайте в отряде", ev: "kill", m: "biome:" + b, f: "party", n: [20, 40, 80, 150, 250], d: [1, 2, 2, 3, 3], lvl: L, minLvl: L0, res: { soul_shard: 1 } }));
  }
  for (const b of BIOME_IDS) out.push(T({ id: `hunt_${b}_strong`, cat: "hunt", giver: "board", title: `Сильнейшие: ${BIOMES[b].name}`, why: "Враги не ниже вашего уровня − 2", ev: "kill", m: "biome:" + b, f: "lvl", n: [15, 30, 60, 100, 150], d: [2, 2, 3, 3, 4], lvl: BIOMES[b].lvl[1], minLvl: BIOMES[b].lvl[0] + 2, res: { soul_shard: 1 } }));
  for (const [role, nm] of Object.entries(ROLE_NAMES))
    out.push(T({ id: `hunt_role_${role}`, cat: "hunt", giver: "board", title: `Охота на ${nm}`, why: "Учитесь против разных врагов", ev: "kill", m: "role:" + role, n: [15, 30, 60, 100, 160], d: [1, 2, 2, 3, 3], lvl: 0, minLvl: 3, res: { soul_shard: 1 } }));
  // трофеи: материалы, которые падают с Отголосков краёв (мешок → «Забрать»)
  const seen = new Set<string>();
  for (const v of VARIANTS.filter((x) => !x.boss)) for (const m of MONSTER_LOOT[v.base]?.materials || []) {
    if (!RESOURCES[m.res] || m.res === "soul_shard" || seen.has(m.res)) continue; seen.add(m.res);
    const L = ZONE_MOBS[v.id]?.lvl || v.lvl;
    out.push(T({ id: `hunt_mat_${m.res}`, cat: "hunt", giver: "board", title: `Трофеи: ${resName(m.res)}`, why: `Падает с: ${v.name}`, ev: "loot", m: m.res, n: [5, 10, 20, 35, 50], d: [1, 1, 2, 2, 3], lvl: L, minLvl: Math.max(1, L - 3), res: { soul_shard: 1 } }));
  }
  return out.map((t, i) => ({ ...t, ord: i + 1 }));
}

type PRow = [string, Cat, string, string, string, string, number, number, number, number, Record<string, number>?];
function genPeriodic(): BTask[] {
  // id, категория, заголовок, зачем, событие, цель|условия, n, сложность, minLvl, maxLvl, материалы
  const R: PRow[] = [];
  for (const [lo, hi, s, k] of [[1, 9, "a", 1], [10, 19, "b", 1.5], [20, 30, "c", 2]] as [number, number, string, number][]) {
    R.push([`d_kill_${s}`, "daily", "Разминка", "Враги не ниже вашего уровня − 2", "kill", "|lvl", Math.round(40 * k), 2, lo, hi]);
    R.push([`d_elite_${s}`, "daily", "Элитная охота", "Элита — с рамкой у имени или редкий Отголосок", "kill", "|elite", Math.round(3 * k), 2, Math.max(3, lo), hi]);
    R.push([`d_gather_${s}`, "daily", "Сборщик", "Любые ресурсы с узлов", "gather", "", Math.round(10 * k), 1, lo, hi, { moonpetal: 2 }]);
    R.push([`d_loot_${s}`, "daily", "Мешки", "Забирайте добычу из мешков", "loot", "bag", Math.round(15 * k), 1, lo, hi]);
    R.push([`w_kill_${s}`, "weekly", "Неделя охоты", "Враги не ниже вашего уровня − 2", "kill", "|lvl", Math.round(400 * k), 3, lo, hi, { soul_shard: 3 }]);
    R.push([`w_elite_${s}`, "weekly", "Неделя элиты", "Элита — с рамкой у имени или редкий Отголосок", "kill", "|elite", Math.round(25 * k), 3, Math.max(3, lo), hi, { soul_shard: 3 }]);
  }
  R.push(
    ["d_dash", "daily", "Ловкость", "Рывок спасает от ударов", "dash", "", 30, 1, 1, 30],
    ["d_ability", "daily", "Навыки в деле", "Применяйте навыки в бою", "ability", "", 40, 1, 1, 30],
    ["d_crypt", "daily", "Минуты в Склепе", "Минуты в Склепе суммируются", "run", "crypt|min", 5, 2, 3, 30],
    ["d_abyss", "daily", "Минуты в Бездне", "Минуты в Бездне суммируются", "run", "abyss|min", 3, 3, 10, 30],
    ["d_duel", "daily", "Дуэль дня", "Любая дуэль у Кьюта", "duel", "", 1, 1, 2, 30],
    ["d_duel_win", "daily", "Победа в дуэли", "Выиграйте одну дуэль", "duel_win", "", 1, 2, 6, 30],
    ["d_trial", "daily", "Испытание: 3 волны", "Испытание Обители", "trial", "max", 3, 2, 5, 30],
    ["d_trial5", "daily", "Испытание: 5 волн", "Испытание Обители", "trial", "max", 5, 3, 9, 30],
    ["d_salvage", "daily", "Разбор", "Разбирайте ненужное у Петра", "salvage", "", 3, 1, 4, 30, { soul_shard: 1 }],
    ["d_upgrade", "daily", "Улучшение", "Одно улучшение у Петра", "upgrade", "", 1, 2, 5, 30, { soul_shard: 1 }],
    ["d_craft", "daily", "Ремесло", "Создайте вещь у Петра", "craft", "", 1, 2, 4, 30],
    ["d_cursed", "daily", "Проклятый", "Победите проклятого врага", "kill", "|cursed", 1, 3, 6, 30, { soul_shard: 1 }],
    ["d_ench", "daily", "Зачарованные", "Победите зачарованных врагов", "kill", "|ench", 2, 2, 6, 30],
    ["d_party", "daily", "Отрядом", "Побеждайте в отряде", "kill", "|party", 20, 2, 5, 30],
    ["d_wboss", "daily", "Мировой босс", "Позовите отряд", "kill", "|wboss", 1, 3, 10, 30, { soul_shard: 2 }],
    ["d_rare", "daily", "Редкая цель", "Найдите редкого Отголоска", "kill", "|rare", 1, 3, 8, 30, { soul_shard: 1 }],
    ["d_portal", "daily", "Портал домой", "Сходите домой и обратно", "portal", "", 1, 1, 3, 30],
    ["d_chest", "daily", "Сундук лагеря", "Зачистите лагерь до сундука", "chest", "", 1, 2, 4, 30, { soul_shard: 1 }],
    ["w_chest", "weekly", "Сундуки недели", "Сундуки лагерей", "chest", "", 5, 3, 4, 30, { soul_shard: 3 }],
    ["m_chest", "monthly", "Сундуки месяца", "Сундуки лагерей", "chest", "", 20, 4, 4, 30, { soul_shard: 8 }],
    ["d_bmage", "daily", "Найти Чёрного мага", "Трекер ведёт к нему или его куполу — дойдите", "bm_find", "", 1, 1, 1, 30],
    ["d_ench_hi", "daily", "Яркое зачарование", "Зачарованные враги «Редкий» и выше", "kill", "|e2up", 1, 3, 8, 30, { soul_shard: 1 }],
    ["w_ench_hi", "weekly", "Неделя зачарованных", "Зачарованные враги «Странный» и выше", "kill", "|e3up", 3, 4, 10, 30, { soul_shard: 4 }],
    ["w_ench_upg", "weekly", "Зачарованный металл", "Улучшите зачарованные вещи у Петра", "upgrade", "|ench", 3, 3, 6, 30, { soul_shard: 3 }],
    ["m_ench", "monthly", "Месяц зачарований", "Зачарованные враги", "kill", "|ench", 40, 4, 6, 30, { soul_shard: 10 }],
    ["m_ench_leg", "monthly", "Легенды месяца", "Зачарованные «Легендарный» и выше", "kill", "|e4up", 3, 5, 12, 30, { soul_shard: 12 }],
    ["d_explore", "daily", "Разведка", "Открывайте новые клетки карты", "explore", "", 30, 1, 1, 30],
    ["d_res", "daily", "Материалы", "Материалы из мешков", "loot", "res", 30, 1, 1, 30],
    ["w_wboss", "weekly", "Боссы недели", "Мировые боссы", "kill", "|wboss", 3, 4, 8, 30, { soul_shard: 5 }],
    ["w_rare", "weekly", "Редкие недели", "Редкие Отголоски", "kill", "|rare", 3, 4, 8, 30, { soul_shard: 4 }],
    ["w_crypt", "weekly", "Неделя в Склепе", "Минуты в Склепе суммируются", "run", "crypt|min", 30, 3, 4, 30, { soul_shard: 3 }],
    ["w_abyss", "weekly", "Неделя в Бездне", "Минуты в Бездне суммируются", "run", "abyss|min", 20, 4, 10, 30, { soul_shard: 4 }],
    ["w_trial", "weekly", "Испытание целиком", "Все 8 волн", "trial", "max", 8, 4, 10, 30, { soul_shard: 4 }],
    ["w_runs", "weekly", "Забеги недели", "Любые забеги", "run", "", 10, 3, 4, 30, { soul_shard: 3 }],
    ["w_duels", "weekly", "Дуэлянт", "Дуэли у Кьюта", "duel", "", 10, 2, 4, 30, { soul_shard: 2 }],
    ["w_duel_win", "weekly", "Пять побед", "Победы в дуэлях", "duel_win", "", 5, 3, 6, 30, { soul_shard: 3 }],
    ["w_gather", "weekly", "Склад Петра", "Любые ресурсы с узлов", "gather", "", 150, 3, 1, 30, { dreamwood: 6 }],
    ["w_loot", "weekly", "Полные мешки", "Материалы из мешков", "loot", "res", 400, 3, 1, 30, { soul_shard: 3 }],
    ["w_salvage", "weekly", "Большой разбор", "Разбор у Петра", "salvage", "", 20, 2, 4, 30, { soul_shard: 3 }],
    ["w_upgrade", "weekly", "Улучшения недели", "Улучшения у Петра", "upgrade", "", 5, 3, 5, 30, { soul_shard: 4 }],
    ["w_craft", "weekly", "Ремесло недели", "Ремесло у Петра", "craft", "", 3, 3, 4, 30, { moonpetal: 6 }],
    ["w_cursed", "weekly", "Проклятая неделя", "Проклятые враги", "kill", "|cursed", 5, 4, 6, 30, { soul_shard: 4 }],
    ["w_ench", "weekly", "Зачарованная неделя", "Зачарованные враги", "kill", "|ench", 10, 3, 6, 30, { soul_shard: 3 }],
    ["w_party", "weekly", "Отряд недели", "Побеждайте в отряде", "kill", "|party", 200, 3, 5, 30, { soul_shard: 3 }],
    ["w_daily", "weekly", "Пять дней", "Ежедневные этого тела", "claim", "daily", 5, 2, 1, 30, { soul_shard: 2 }],
    ["m_kill", "monthly", "Месяц охоты", "Враги не ниже вашего уровня − 2", "kill", "|lvl", 2500, 4, 1, 30, { soul_shard: 10 }],
    ["m_elite", "monthly", "Месяц элиты", "Элитные враги", "kill", "|elite", 150, 4, 3, 30, { soul_shard: 10 }],
    ["m_wboss", "monthly", "Охотник на боссов", "Мировые боссы", "kill", "|wboss", 15, 5, 8, 30, { soul_shard: 12 }],
    ["m_rare", "monthly", "Следопыт", "Редкие Отголоски", "kill", "|rare", 10, 5, 8, 30, { soul_shard: 10 }],
    ["m_runs", "monthly", "Забеги месяца", "Любые забеги", "run", "", 40, 4, 4, 30, { soul_shard: 8 }],
    ["m_trial", "monthly", "Пять полных Испытаний", "Все 8 волн", "trial", "full", 5, 5, 10, 30, { soul_shard: 12 }],
    ["m_duel_win", "monthly", "Двадцать пять побед", "Победы в дуэлях", "duel_win", "", 25, 4, 6, 30, { soul_shard: 8 }],
    ["m_gather", "monthly", "Большой сбор", "Любые ресурсы с узлов", "gather", "", 800, 4, 1, 30, { dreamwood: 20 }],
    ["m_upgrade", "monthly", "Улучшения месяца", "Улучшения у Петра", "upgrade", "", 20, 4, 5, 30, { soul_shard: 10 }],
    ["m_cursed", "monthly", "Проклятый месяц", "Проклятые враги", "kill", "|cursed", 25, 5, 6, 30, { soul_shard: 12 }],
    ["m_daily", "monthly", "Двадцать дней", "Ежедневные этого тела", "claim", "daily", 20, 3, 1, 30, { soul_shard: 6 }],
    ["m_weekly", "monthly", "Три недели", "Еженедельные этого тела", "claim", "weekly", 3, 3, 1, 30, { soul_shard: 6 }],
    ["m_lvlup", "monthly", "Два уровня", "Уровни этого тела", "lvlup", "", 2, 3, 1, 29, { soul_shard: 6 }],
  );
  for (const b of BIOME_IDS) {
    const B = BIOMES[b];
    R.push([`d_${b}`, "daily", `Край: ${B.name}`, `Отголоски края, ур. ${B.lvl[0]}–${B.lvl[1]}`, "kill", "biome:" + b, 30, 2, B.lvl[0], B.lvl[1] + 6]);
    R.push([`d_${b}_elite`, "daily", `Элита: ${B.name}`, "Элита края (в рамке)", "kill", "biome:" + b + "|elite", 3, 2, B.lvl[0], B.lvl[1] + 6]);
    R.push([`w_${b}`, "weekly", `Неделя: ${B.name}`, "Отголоски края", "kill", "biome:" + b, 150, 3, B.lvl[0], B.lvl[1] + 6, { soul_shard: 3 }]);
  }
  for (const r of ["dreamwood", "moonpetal", "rot_ore", "starsilver"]) {
    const lo = r === "rot_ore" ? 7 : r === "starsilver" ? 10 : 1;
    R.push([`d_g_${r}`, "daily", `Сбор: ${resName(r)}`, "Ищите узлы на карте", "gather", r, 8, 1, lo, 30]);
  }
  // периодические — общие (без выдающего): берутся и сдаются в окне «Задания»; «кто выдаёт» можно назначить в админке
  return R.map((r, i) => { const [m, f] = r[5].split("|"); return T({ id: r[0], cat: r[1], ord: i + 1, giver: "", w: r[0] === "d_bmage" ? 3 : 1, title: r[2], why: r[3], ev: r[4], m: m || "", f: f || "", n: pad5([r[6]]), d: pad5([r[7]]), minLvl: r[8], maxLvl: r[9], res: r[10] || {} }); });
}

/** Пул повторяющихся из данных: цель × период (каждый вид Отголоска, вариант края, ресурс, край) — разнообразие сочетаний
 *  цели, количества; ранг и бонусные условия добавляются при выпадении (makeRoll). */
function genPool(): BTask[] {
  const out: BTask[] = [], pickW = (L: string[], id: string) => L[hash(id) % L.length];
  const bases = Object.entries(ZONE_MOBS).filter(([id, m]: any) => !VARIANT_BY_ID[id] && !m.boss && !m.rare && !BOSS_TIMERS[id]).sort((x: any, y: any) => x[1].lvl - y[1].lvl);
  let o = 1000;
  for (const [id, m] of bases as [string, any][]) {
    const L = m.lvl || 1, lo = Math.max(1, L - 3), hi = Math.min(30, L + 6), mat = firstMat(id);
    out.push(T({ id: "pd_" + id, cat: "daily", ord: o++, title: `${pickW(["Цель дня", "Расчистка", "Отлов", "Заказ на голову"], id)}: ${mobName(id)}`, why: `Отголоски «${mobName(id)}», ур. ${L}`, ev: "kill", m: id, n: pad5([20]), d: pad5([2]), lvl: L, minLvl: lo, maxLvl: hi, w: 0.6, res: { [mat]: 1 } }));
    out.push(T({ id: "pw_" + id, cat: "weekly", ord: o++, title: `${pickW(["Истребление", "Зачистка", "Неделя охоты"], id)}: ${mobName(id)}`, why: `Отголоски «${mobName(id)}», ур. ${L}`, ev: "kill", m: id, n: pad5([150]), d: pad5([3]), lvl: L, minLvl: lo, maxLvl: hi, w: 0.5, res: { [mat]: 3 } }));
    if (L >= 5) out.push(T({ id: "pm_" + id, cat: "monthly", ord: o++, title: `${pickW(["Большая охота", "Месяц под знаком"], id)}: ${mobName(id)}`, why: `Отголоски «${mobName(id)}», ур. ${L}`, ev: "kill", m: id, n: pad5([600]), d: pad5([4]), lvl: L, minLvl: lo, maxLvl: hi, w: 0.4, res: { soul_shard: 6 } }));
  }
  for (const v of VARIANTS) {
    const id = v.id, L = ZONE_MOBS[id]?.lvl || 1; if (!ZONE_MOBS[id] || (ZONE_MOBS[id] as any).boss) continue;
    const bn = (BIOMES as any)[v.biome]?.name || v.biome;
    out.push(T({ id: "pdv_" + id, cat: "daily", ord: o++, title: `${pickW(["След края", "Чужак края", "Гость края"], id)}: ${mobName(id)}`, why: `Вариант края «${bn}», ур. ${L}`, ev: "kill", m: id, n: pad5([15]), d: pad5([2]), lvl: L, minLvl: Math.max(1, L - 3), maxLvl: Math.min(30, L + 6), w: 0.6 }));
    out.push(T({ id: "pwv_" + id, cat: "weekly", ord: o++, title: `${pickW(["Неделя края", "Облава"], id)}: ${mobName(id)}`, why: `Вариант края «${bn}», ур. ${L}`, ev: "kill", m: id, n: pad5([100]), d: pad5([3]), lvl: L, minLvl: Math.max(1, L - 3), maxLvl: Math.min(30, L + 6), w: 0.5, res: { soul_shard: 2 } }));
  }
  for (const b of BIOME_IDS) {
    const B = BIOMES[b];
    out.push(T({ id: "hard_b_" + b, cat: "hard", giver: "alzi", ord: o++, title: `Чистка края: ${B.name}`, why: `Элита края, ур. ${B.lvl[0]}–${B.lvl[1]}`, ev: "kill", m: "biome:" + b, f: "elite", n: pad5([40]), d: pad5([5]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.7, res: { soul_shard: 6 } }));
    out.push(T({ id: "pw_os_" + b, cat: "weekly", ord: o++, title: `Один удар: ${B.name}`, why: `Отголоски края — первый же удар добивает`, ev: "kill", m: "biome:" + b, f: "oneshot", n: pad5([30]), d: pad5([3]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.5, res: { soul_shard: 3 } }));
    out.push(T({ id: "pw_sk_" + b, cat: "weekly", ord: o++, title: `Только навыки: ${B.name}`, why: `Отголоски края без автоатаки`, ev: "kill", m: "biome:" + b, f: "skillonly", n: pad5([60]), d: pad5([3]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.5, res: { soul_shard: 3 } }));
    out.push(T({ id: "pw_ba_" + b, cat: "weekly", ord: o++, title: `Без навыков: ${B.name}`, why: `Отголоски края одной автоатакой`, ev: "kill", m: "biome:" + b, f: "basiconly", n: pad5([60]), d: pad5([3]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.5, res: { soul_shard: 3 } }));
    out.push(T({ id: "pd_ba_" + b, cat: "daily", ord: o++, title: `Чистая сталь: ${B.name}`, why: `Без навыков — только автоатака`, ev: "kill", m: "biome:" + b, f: "basiconly", n: pad5([15]), d: pad5([2]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.4, res: {} }));
    out.push(T({ id: "pd_sk_" + b, cat: "daily", ord: o++, title: `Мастер навыков: ${B.name}`, why: `Только навыки — без автоатаки`, ev: "kill", m: "biome:" + b, f: "skillonly", n: pad5([15]), d: pad5([2]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.4, res: {} }));
    out.push(T({ id: "pm_os_" + b, cat: "monthly", ord: o++, title: `Месяц одного удара: ${B.name}`, why: `Отголоски края с первого удара`, ev: "kill", m: "biome:" + b, f: "oneshot", n: pad5([200]), d: pad5([4]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.4, res: { soul_shard: 8 } }));
    out.push(T({ id: "m_b_" + b, cat: "monthly", ord: o++, title: `Хозяин края: ${B.name}`, why: `Отголоски края, ур. ${B.lvl[0]}–${B.lvl[1]}`, ev: "kill", m: "biome:" + b, n: pad5([700]), d: pad5([4]), minLvl: B.lvl[0], maxLvl: Math.min(30, B.lvl[1] + 6), w: 0.5, res: { soul_shard: 8 } }));
  }
  for (const r of ["dreamwood", "moonpetal", "rot_ore", "starsilver"]) {
    const lo = r === "rot_ore" ? 7 : r === "starsilver" ? 10 : 1;
    out.push(T({ id: "pwg_" + r, cat: "weekly", ord: o++, title: `Запас: ${resName(r)}`, why: "Узлы на карте", ev: "gather", m: r, n: pad5([60]), d: pad5([3]), minLvl: lo, w: 0.6, res: { [r]: 4 } }));
    out.push(T({ id: "pmg_" + r, cat: "monthly", ord: o++, title: `Склад: ${resName(r)}`, why: "Узлы на карте", ev: "gather", m: r, n: pad5([250]), d: pad5([4]), minLvl: lo, w: 0.4, res: { [r]: 12 } }));
  }
  return out;
}

function genHard(): BTask[] {
  const out: BTask[] = [];
  for (const id of Object.keys(BOSS_TIMERS)) {
    const L = ZONE_MOBS[id]?.lvl || 10;
    out.push(T({ id: "hard_solo_" + id, cat: "hard", giver: "alzi", title: `В одиночку: ${mobName(id)}`, why: `Мировой босс ур. ${L} без отряда`, ev: "kill", m: id, f: "boss,solo", n: pad5([1]), d: pad5([5]), lvl: L, minLvl: L, res: { soul_shard: 6 } }));
  }
  // как убит — проверяет сервер по каждому удару: одним ударом / только навыками / без навыков
  for (const id of Object.keys(BOSS_TIMERS)) {
    const L = ZONE_MOBS[id]?.lvl || 10, nm = mobName(id);
    out.push(T({ id: "hard_os_" + id, cat: "hard", giver: "kyut", title: `Одним ударом: ${nm}`, why: `Мировой босс ур. ${L} — первый же удар добивает`, ev: "kill", m: id, f: "boss,oneshot", n: pad5([1]), d: pad5([5]), lvl: L, minLvl: L, w: 0.25, rmax: "SS", res: { soul_shard: 10 } }));
    out.push(T({ id: "hard_sk_" + id, cat: "hard", giver: "kyut", title: `Только навыками: ${nm}`, why: `Мировой босс ур. ${L} без единой автоатаки`, ev: "kill", m: id, f: "boss,skillonly", n: pad5([1]), d: pad5([5]), lvl: L, minLvl: L, w: 0.5, res: { soul_shard: 6 } }));
    out.push(T({ id: "hard_ba_" + id, cat: "hard", giver: "kyut", title: `Без навыков: ${nm}`, why: `Мировой босс ур. ${L} одной автоатакой`, ev: "kill", m: id, f: "boss,basiconly", n: pad5([1]), d: pad5([5]), lvl: L, minLvl: L, w: 0.5, res: { soul_shard: 6 } }));
  }
  for (const id of RARES) {
    const L = ZONE_MOBS[id]?.lvl || 10, nm = mobName(id);
    out.push(T({ id: "hard_osr_" + id, cat: "hard", giver: "kyut", title: `Одним ударом: ${nm}`, why: "Редкий Отголосок — первый же удар добивает", ev: "kill", m: id, f: "rare,oneshot", n: pad5([1]), d: pad5([5]), lvl: L, minLvl: L, w: 0.4, res: { soul_shard: 6 } }));
    out.push(T({ id: "hard_skr_" + id, cat: "hard", giver: "kyut", title: `Только навыками: ${nm}`, why: "Редкий Отголосок без автоатаки", ev: "kill", m: id, f: "rare,skillonly", n: pad5([3]), d: pad5([5]), lvl: L, minLvl: L, w: 0.6, res: { soul_shard: 6 } }));
    out.push(T({ id: "hard_bar_" + id, cat: "hard", giver: "kyut", title: `Без навыков: ${nm}`, why: "Редкий Отголосок одной автоатакой", ev: "kill", m: id, f: "rare,basiconly", n: pad5([3]), d: pad5([5]), lvl: L, minLvl: L, w: 0.6, res: { soul_shard: 6 } }));
  }
  for (const id of RARES) {
    const L = ZONE_MOBS[id]?.lvl || 10;
    out.push(T({ id: "hard_rare_" + id, cat: "hard", giver: "leyr", title: `Редкий в одиночку: ${mobName(id)}`, why: "Редкий Отголосок без отряда", ev: "kill", m: id, f: "rare,solo", n: pad5([5]), d: pad5([5]), lvl: L, minLvl: L, res: { soul_shard: 6 } }));
  }
  const H: [string, string, string, string, string, string, number[], number[], number, number?][] = [
    ["crypt15", "Склеп: 15 минут", "Целый забег до конца", "run", "crypt", "", [1], [5], 6, 900],
    ["abyss15", "Бездна: 15 минут", "Самый долгий забег", "run", "abyss", "", [1], [5], 12, 900],
    ["crypt_solo", "Склеп в одиночку: 10 минут", "Без отряда", "run", "crypt", "solo", [1], [5], 8, 600],
    ["abyss_solo", "Бездна в одиночку: 10 минут", "Без отряда", "run", "abyss", "solo", [1], [5], 14, 600],
    ["trial_full", "Испытание целиком трижды", "Все 8 волн", "trial", "full", "", [3], [5], 10],
    ["trial_solo", "Испытание целиком в одиночку", "Все 8 волн без отряда", "trial", "full", "solo", [1], [5], 12],
    ["duel50", "Дуэль с половиной ОЗ", "Победа при ограничении ОЗ 50%", "duel_win", "hp50", "", [3], [5], 8],
    ["duel25", "Дуэль с четвертью ОЗ", "Победа при ограничении ОЗ 25%", "duel_win", "hp25", "", [1], [5], 10],
    ["cursed_boss", "Проклятый босс", "Мировой босс с проклятием", "kill", "", "wboss,cursed", [1], [5], 10],
    ["ench_boss", "Зачарованный босс", "Мировой босс с зачарованием", "kill", "", "wboss,ench", [1], [5], 10],
    ["elite500", "Гроза элиты", "Сотни элитных врагов", "kill", "", "elite", [100, 250, 500], [4, 5, 5], 8],
    ["cursed100", "Проклятья не страшны", "Проклятые враги", "kill", "", "cursed", [25, 50, 100], [4, 5, 5], 8],
    ["lvl30", "Тридцатый уровень", "Предел героя", "st", "lvl", "", [20, 25, 30], [4, 5, 5], 18],
    ["all15", "Все тела 15+", "Велес, Нофорд, Кавега и Мариэль", "st", "heroes15", "", [2, 3, 4], [4, 5, 5], 15],
    ["bestiary", "Полный бестиарий", "Записи бестиария с победами", "st", "bestiary", "", [20, 25, 30], [4, 5, 5], 12],
    ["wb_all", "Все мировые боссы", "Каждого хотя бы раз", "st", "wbosses", "", [5, 9, 13], [4, 5, 5], 12],
    ["upg10", "Вещь +10", "Доведите вещь до +10", "upgrade", "max", "", [10], [5], 15],
    ["os_elite", "Элита одним ударом", "Первый же удар добивает элитного врага", "kill", "", "elite,oneshot", [3, 10, 25], [4, 5, 5], 8],
    ["os_lvl", "Одним ударом — по силе", "Враги не ниже вашего уровня − 2, с первого удара", "kill", "", "lvl,oneshot", [25, 60, 150], [4, 5, 5], 6],
    ["os_cursed", "Проклятый с одного удара", "Проклятый враг, первый удар добивает", "kill", "", "cursed,oneshot", [1, 3, 10], [5, 5, 5], 10],
    ["sk_elite", "Элита: только навыки", "Ни одной автоатаки по цели", "kill", "", "elite,skillonly", [20, 50, 120], [4, 5, 5], 6],
    ["ba_elite", "Элита: без навыков", "Только автоатака по цели", "kill", "", "elite,basiconly", [20, 50, 120], [4, 5, 5], 6],
    ["sk_boss", "Боссы только навыками", "Любые боссы, ни одной автоатаки", "kill", "", "boss,skillonly", [2, 5, 10], [5, 5, 5], 10],
    ["ba_boss", "Боссы без навыков", "Любые боссы, только автоатака", "kill", "", "boss,basiconly", [2, 5, 10], [5, 5, 5], 10],
    ["ba_cursed", "Проклятые без навыков", "Проклятые враги, только автоатака", "kill", "", "cursed,basiconly", [5, 15, 40], [4, 5, 5], 8],
    ["sk_lvl", "Только навыками — по силе", "Враги не ниже вашего уровня − 2, без автоатаки", "kill", "", "lvl,skillonly", [80, 200, 400], [4, 4, 5], 5],
  ];
  for (const h of H) out.push(T({ id: "hard_" + h[0], cat: "hard", giver: giverOf(h[3], h[5]), title: h[1], why: h[2], ev: h[3], m: h[4], f: h[5], n: pad5(h[6]), d: pad5(h[7]), minLvl: h[8], lvl: 0, minT: h[9] || 0, res: { soul_shard: 6 } }));
  return out.map((t, i) => ({ ...t, ord: i + 1 }));
}

function genAch(): BTask[] {
  const out: BTask[] = [];
  const A = (id: string, title: string, why: string, ev: string, m: string, f: string, n: number[], d: number[], lvl = 0, res: Record<string, number> = { soul_shard: 1 }) =>
    out.push(T({ id: "ach_" + id, cat: "ach", title, why, ev, m, f, n: pad5(n), d: pad5(d), lvl, res }));
  const MT = [10, 50, 150, 400, 1000], MD = [1, 1, 2, 2, 3];
  for (const b of [...new Set(VARIANTS.filter((v) => !v.boss).map((v) => v.base))]) A("mob_" + b, `Бестиарий: ${mobName(b)}`, "Победы над этим видом во всех краях (с запуска доски)", "kill", b, "", MT, MD, ZONE_MOBS[b]?.lvl || 0);
  for (const id of Object.keys(BOSS_TIMERS)) A("wb_" + id, `Гроза: ${mobName(id)}`, "Победы над мировым боссом", "kill", id, "boss", [1, 5, 15, 40, 100], [2, 2, 3, 4, 5], ZONE_MOBS[id]?.lvl || 0, { soul_shard: 2 });
  for (const id of RARES) A("rare_" + id, `Следопыт: ${mobName(id)}`, "Победы над редким Отголоском", "kill", id, "rare", [1, 3, 10, 25, 50], [2, 2, 3, 4, 5], ZONE_MOBS[id]?.lvl || 0);
  for (const b of BIOME_IDS) {
    A(`biome_${b}`, `Край: ${BIOMES[b].name}`, "Победы в этом краю", "kill", "biome:" + b, "", [100, 500, 2000, 5000, 10000], [1, 2, 3, 4, 5], BIOMES[b].lvl[1]);
    A(`biome_${b}_elite`, `Элита: ${BIOMES[b].name}`, "Элитные враги края", "kill", "biome:" + b, "elite", [10, 50, 200, 500, 1000], [1, 2, 3, 4, 5], BIOMES[b].lvl[1]);
  }
  // тела Алтаря (shared.HERO_NAMES): Велес, Нофорд, Кавега, Мариэль — ступени по уровню, победам, боссам
  for (const c of HERO_IDS) {
    const nm = HERO_NAMES[c] || c;
    A(`cls_lvl_${c}`, `Тело: ${nm} — уровни`, `Прокачайте ${nm} до 5, 10, 15, 20 и 30 уровня`, "st", "hero:" + c, "", [5, 10, 15, 20, 30], [1, 2, 3, 4, 5]);
    A(`cls_kill_${c}`, `Тело: ${nm} — победы`, `Победы в теле «${nm}»`, "kill", "cls:" + c, "", [100, 500, 2000, 5000, 10000], [1, 2, 3, 4, 5]);
    A(`cls_wb_${c}`, `Тело: ${nm} — мировые боссы`, `Мировые боссы в теле «${nm}»`, "kill", "cls:" + c, "wboss", [1, 5, 15, 40, 100], [2, 3, 4, 4, 5]);
  }
  const M: [string, string, string, string, string, string, number[], number[]][] = [
    ["kills", "Охотник", "Любые победы", "kill", "", "", [100, 1000, 5000, 20000, 50000], [1, 2, 3, 4, 5]],
    ["kills_lvl", "Достойные противники", "Враги не ниже вашего уровня − 2", "kill", "", "lvl", [100, 1000, 5000, 15000, 40000], [1, 2, 3, 4, 5]],
    ["elite", "Элитный охотник", "Элитные враги", "kill", "", "elite", [10, 100, 500, 2000, 5000], [1, 2, 3, 4, 5]],
    ["cursed", "Снимающий проклятия", "Проклятые враги", "kill", "", "cursed", [1, 10, 50, 200, 500], [1, 2, 3, 4, 5]],
    ["ench", "Охотник за чарами", "Зачарованные враги", "kill", "", "ench", [5, 50, 200, 800, 2000], [1, 2, 3, 4, 5]],
    ["party_k", "Командный игрок", "Победы в отряде", "kill", "", "party", [50, 500, 2000, 8000, 20000], [1, 2, 3, 4, 5]],
    ["wboss", "Убийца боссов", "Любые мировые боссы", "kill", "", "wboss", [1, 10, 50, 150, 400], [2, 3, 4, 4, 5]],
    ["rare", "Следопыт", "Любые редкие", "kill", "", "rare", [1, 10, 30, 80, 200], [2, 3, 3, 4, 5]],
    ["solo_wb", "Одиночка", "Мировой босс без отряда", "kill", "", "wboss,solo", [1, 5, 20, 50, 100], [3, 4, 4, 5, 5]],
    ["gather", "Собиратель", "Ресурсы с узлов", "gather", "", "", [50, 500, 2000, 8000, 20000], [1, 2, 3, 4, 5]],
    ["loot_res", "Запасливый", "Материалы из мешков", "loot", "res", "", [100, 1000, 5000, 20000, 50000], [1, 2, 3, 4, 5]],
    ["loot_items", "Барахольщик", "Вещи из мешков", "loot", "item", "", [10, 100, 500, 2000, 5000], [1, 2, 3, 4, 5]],
    ["bags", "Ничего не оставлю", "Открытые мешки", "loot", "bag", "", [50, 500, 2000, 8000, 20000], [1, 2, 3, 4, 5]],
    ["chests", "Сундуки лагерей", "Сундуки после зачистки", "chest", "", "", [1, 10, 50, 200, 500], [1, 2, 3, 4, 5]],
    ["craft", "Ремесленник", "Созданные вещи", "craft", "", "", [1, 5, 20, 50, 100], [1, 2, 3, 4, 5]],
    ["salvage", "Разборщик", "Разобранные вещи", "salvage", "", "", [10, 100, 500, 2000, 5000], [1, 2, 3, 4, 5]],
    ["upgrade", "Кузнец", "Улучшения у Петра", "upgrade", "", "", [1, 25, 100, 400, 1000], [1, 2, 3, 4, 5]],
    ["upg_max", "Отточенная вещь", "Лучшее улучшение одной вещи", "upgrade", "max", "", [3, 5, 8, 10, 12], [1, 2, 3, 4, 5]],
    ["talents", "Ученик", "Изученные таланты героя", "st", "talents", "", [1, 5, 10, 20, 29], [1, 2, 3, 4, 5]],
    ["equipped", "Во всеоружии", "Занятые слоты снаряжения", "st", "equipped", "", [1, 3, 5, 7, 9], [1, 1, 2, 2, 3]],
    ["monster_set", "Трофейный вид", "Надетые вещи с Отголосков", "equip_monster", "", "", [1, 3, 6, 10, 15], [1, 2, 2, 3, 3]],
    ["bestiary", "Исследователь", "Записи бестиария с победами", "st", "bestiary", "", [5, 10, 15, 20, 30], [1, 2, 3, 4, 5]],
    ["items_found", "Коллекционер", "Найденные виды вещей", "st", "items", "", [10, 30, 60, 100, 160], [1, 2, 3, 4, 5]],
    ["dash", "Неуловимый", "Рывки", "dash", "", "", [50, 500, 2000, 8000, 20000], [1, 1, 2, 2, 3]],
    ["ability", "Мастер навыков", "Применённые навыки", "ability", "", "", [100, 1000, 5000, 20000, 50000], [1, 2, 3, 4, 5]],
    ["duels", "Завсегдатай арены", "Сыгранные дуэли", "duel", "", "", [1, 10, 50, 150, 400], [1, 2, 3, 4, 5]],
    ["duel_win", "Дуэлянт", "Победы в дуэлях", "duel_win", "", "", [1, 10, 30, 100, 250], [1, 2, 3, 4, 5]],
    ["trial", "Испытуемый", "Лучший результат Испытания (волны)", "trial", "max", "", [2, 4, 6, 7, 8], [1, 2, 3, 4, 5]],
    ["trial_full", "Обитель покорена", "Испытания целиком", "trial", "full", "", [1, 5, 20, 50, 100], [3, 3, 4, 4, 5]],
    ["runs", "Бегун", "Любые забеги", "run", "", "", [1, 10, 50, 150, 400], [1, 2, 3, 4, 5]],
    ["crypt_min", "Хранитель Склепа", "Минуты в Склепе", "run", "crypt", "min", [10, 60, 300, 1000, 3000], [1, 2, 3, 4, 5]],
    ["abyss_min", "Взгляд в Бездну", "Минуты в Бездне", "run", "abyss", "min", [10, 60, 300, 1000, 3000], [2, 2, 3, 4, 5]],
    ["crypt_runs", "Завсегдатай Склепа", "Забеги в Склеп", "run", "crypt", "", [1, 10, 40, 120, 300], [1, 2, 3, 4, 5]],
    ["abyss_runs", "Завсегдатай Бездны", "Забеги в Бездну", "run", "abyss", "", [1, 10, 40, 120, 300], [2, 2, 3, 4, 5]],
    ["trials", "Гость Обители", "Испытания Обители (любой итог)", "trial", "", "", [1, 10, 40, 120, 300], [1, 2, 3, 4, 5]],
    ["portal", "Домосед", "Порталы домой", "portal", "", "", [1, 10, 50, 200, 500], [1, 1, 2, 2, 3]],
    ["party", "Душа компании", "Собранные отряды", "party", "", "", [1, 10, 50, 150, 400], [1, 2, 2, 3, 3]],
    ["lvl", "Рост", "Наивысший уровень героя", "st", "lvl", "", [5, 10, 15, 20, 30], [1, 2, 3, 4, 5]],
    ["heroes15", "Все в строю", "Тела 15+ уровня", "st", "heroes15", "", [1, 2, 3, 4], [2, 3, 4, 5]],
    ["quests", "Помощник", "Сданные сюжетные задания", "quest", "", "", [1, 5, 15, 30, 60], [1, 2, 3, 4, 5]],
    ["board", "Доска почёта", "Сданные задания доски (без достижений)", "claim", "", "", [10, 50, 200, 600, 1500], [1, 2, 3, 4, 5]],
    ["daily", "Каждый день", "Сданные ежедневные", "claim", "daily", "", [5, 30, 100, 300, 700], [1, 2, 3, 4, 5]],
    ["weekly", "Каждую неделю", "Сданные еженедельные", "claim", "weekly", "", [3, 12, 40, 100, 200], [1, 2, 3, 4, 5]],
    ["monthly", "Каждый месяц", "Сданные ежемесячные", "claim", "monthly", "", [1, 3, 8, 15, 30], [2, 3, 4, 4, 5]],
    ["hunts", "Ремесло охотника", "Сданные задания охоты", "claim", "hunt", "", [5, 25, 80, 200, 400], [1, 2, 3, 4, 5]],
    ["hard", "Не ищу лёгких путей", "Сданные тяжёлые задания", "claim", "hard", "", [1, 3, 8, 15, 30], [3, 3, 4, 5, 5]],
    ["npc", "Свой человек", "Задания персонажей", "claim", "npc", "", [5, 15, 30, 48], [1, 2, 3, 4]],
    ["deaths", "Встать и идти", "Возрождения после поражения", "death", "", "", [1, 10, 50, 150, 400], [1, 1, 1, 2, 2]],
    ["wbosses_all", "Каждый босс", "Разные мировые боссы", "st", "wbosses", "", [1, 3, 6, 9, 13], [2, 3, 4, 4, 5]],
  ];
  M.push(
    ["explore", "Картограф", "Открытые клетки карты (туман)", "explore", "", "", [100, 500, 2000, 5000, 10000], [1, 2, 3, 4, 5]],
    ["marks", "Свои метки", "Метки на карте M", "mark", "", "", [1, 5, 20], [1, 1, 2]],
    ["chat", "Голос в толпе", "Сообщения в чате", "chat", "", "", [1, 20, 100], [1, 1, 2]],
    ["friends", "Друзья", "Принятые заявки в друзья", "friend", "", "", [1, 3, 10], [1, 2, 3]],
    ["inspect", "Любопытство", "Осмотренные игроки", "inspect", "", "", [1, 10, 50], [1, 1, 2]],
    ["rating", "Табель", "Загляните в рейтинг", "rating", "", "", [1], [1]],
    ["track", "Следопыт бестиария", "Отслеживание цели из Бестиария", "track", "", "", [1, 5, 20], [1, 1, 2]],
    ["lock", "Не продаётся", "Закреплённые вещи", "lock", "", "", [1, 5, 20], [1, 1, 2]],
    ["soul", "Ветка души", "Узлы ветки души у Алтаря", "soul", "", "", [1, 3, 6, 10], [1, 2, 3, 4]],
    ["radiance", "Сила навыка", "Усиления навыков", "radiance", "", "", [1, 5, 15, 30], [1, 2, 3, 4]],
    ["loadout", "Своя раскладка", "Сохранённые раскладки навыков", "loadout", "", "", [1, 5, 20], [1, 1, 2]],
    ["pvp", "Поединщик", "Дуэли с игроками (не короче 15 с)", "pvp", "", "", [1, 10, 50, 150], [1, 2, 3, 4]],
    ["pvp_win", "Победитель поединков", "Победы над игроками в дуэлях", "pvp", "win", "", [1, 5, 25, 100], [2, 2, 3, 4]],
    ["pk", "Риск — дело благородное", "Включите PK-режим в Аринаре", "pk", "", "", [1], [1]],
    ["runskill", "Навыки забегов", "Новые навыки «Вампир-лайка» с оружия", "runskill", "", "", [1, 3, 6, 10], [2, 3, 4, 5]],
    ["bm_find", "Встреча в тумане", "Найдите Чёрного мага или его купол", "bm_find", "", "", [1, 5, 20, 50], [1, 2, 3, 4]],
    ["night", "Ночная охота", "Победы ночью", "kill", "", "night", [50, 500, 2000, 5000], [1, 2, 3, 4]],
    ["ench_eq", "Зачарованное снаряжение", "Надетые зачарованные вещи", "st", "ench_eq", "", [1, 3, 5], [1, 2, 3]],
    // «Зачарованные» (enchant.ts): ярусы 1 Необычный … 5 Божественный, 6 Чёрный — обычные достижения
    ["ench_kill", "Охотник на зачарованных", "Победы над зачарованными врагами", "kill", "", "ench", [10, 50, 200, 600, 1500], [1, 2, 3, 4, 5]],
    ["ench_kill_e1", "Необычные враги", "Победы над врагами яруса «Необычный»", "kill", "", "e1", [5, 25, 100, 300], [1, 2, 3, 4]],
    ["ench_kill_e2", "Редкие враги", "Победы над врагами яруса «Редкий»", "kill", "", "e2", [3, 15, 60, 200], [1, 2, 3, 4]],
    ["ench_kill_e3", "Странные враги", "Победы над врагами яруса «Странный»", "kill", "", "e3", [1, 10, 40, 120], [2, 2, 3, 4]],
    ["ench_own", "Зачарованная находка", "Зачарованные вещи в сумке и на героях", "st", "ench_own", "", [1, 5, 15, 40], [1, 2, 3, 4]],
    ["ench_tiers", "Лестница ярусов", "Разные ярусы зачарования среди ваших вещей", "st", "ench_tiers", "", [2, 3, 4], [2, 3, 4]],
    ["ench_upg", "Зачарованный металл", "Улучшения зачарованных вещей у Петра", "upgrade", "", "ench", [1, 10, 40], [1, 2, 3]],
    ["ench_salvage", "Разбор чар", "Разобранные зачарованные вещи", "salvage", "", "ench", [1, 10, 50], [1, 2, 3]],
    ["look", "Облик Отголоска", "Соберите полный трофейный облик", "st", "look", "", [1], [3]],
  );
  for (const r of M) A(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
  // 🎁 сундуки наград доски (ранговые задания): открытые сундуки по ярусам и проклятым вариантам. Считает сервер (chestOps),
  // засчитываются и сундуки, открытые до появления достижений, если след остался в данных аккаунта. Награда — опыт + Осколки души (админка).
  const CT = [1, 10, 50, 100, 500];
  A("bch_all", "Охотник за сундуками", "Открытые сундуки наград доски", "st", "bch:all", "", CT, [1, 2, 3, 4, 5]);
  A("bch_cur", "Проклятая добыча", "Открытые проклятые сундуки (любые)", "st", "bch:cur", "", CT, [2, 2, 3, 4, 5], 0, { soul_shard: 2 });
  A("bch_ench", "Чары из сундука", "Зачарованные вещи из сундуков наград", "st", "bch:ench", "", [1, 10, 50, 100, 500], [1, 2, 3, 4, 5]);
  const CD: Record<string, number[]> = { common: [1, 1, 2, 3, 4], uncommon: [1, 2, 2, 3, 4], rare: [1, 2, 3, 4, 5], strange: [2, 2, 3, 4, 5], legendary: [2, 3, 4, 5, 5], divine: [3, 3, 4, 5, 5], black: [3, 4, 5, 5, 5] };
  for (const t of BC_TIERS) {
    const T = BCHEST.tiers[t]; if (!T) continue; const sh = t === "divine" || t === "black" ? 3 : t === "legendary" || t === "strange" ? 2 : 1;
    A(`bch_${t}`, `${T.name}`, `Открытые «${T.name}»`, "st", "bch:" + t, "", CT, CD[t] || [1, 2, 3, 4, 5], 0, { soul_shard: sh });
    A(`bch_${t}_c`, `${T.nameC}`, `Открытые «${T.nameC}»`, "st", `bch:${t}:c`, "", CT, (CD[t] || [1, 2, 3, 4, 5]).map((d) => Math.min(5, d + 1)), 0, { soul_shard: sh + 1 });
  }
  // ——— СКРЫТЫЕ (до выполнения — «???»). Проклятые вещи (флаг экземпляра, cursed.ts) и очернение (blk 0…100 %, bmCfg.ts;
  // у героя — глитч чёрной половины). Отдельных «глитч-вещей» в коде нет: глитч — вид очернения. Засчитывает сервер.
  const H = (id: string, title: string, why: string, ev: string, m: string, f: string, n: number, d: number) =>
    out.push(T({ id: "ach_x_" + id, cat: "ach", title, why, ev, m, f, n: pad5([n]), d: pad5([d]), hidden: true, res: { soul_shard: 2 } }));
  H("cursed_first", "Тяжёлая находка", "Получите первую проклятую вещь", "st", "cursed_own", "", 1, 2);
  H("cursed_hoard", "Коллекция проклятий", "Храните 5 проклятых вещей одновременно", "st", "cursed_own", "", 5, 4);
  H("cursed_wear", "Примерка", "Наденьте проклятую вещь", "st", "cursed_eq", "", 1, 2);
  H("cursed_three", "Под тяжестью", "Носите 3 проклятые вещи одновременно", "st", "cursed_eq", "", 3, 4);
  H("cursed_full", "Полный комплект проклятия", "Все 5 слотов — проклятые вещи", "st", "cursed_eq", "", 5, 5);
  H("blk_touch", "Тронутая тьмой", "Вещь очернена на 10%", "st", "blk_item", "", 10, 1);
  H("blk_half", "Наполовину чёрная", "Вещь очернена на 50%", "st", "blk_item", "", 50, 3);
  H("blk_full", "Чёрная вещь", "Вещь очернена полностью", "st", "blk_item", "", 100, 4);
  H("char_shadow", "Тень на теле", "Очернение тела 25%", "st", "blk_char", "", 25, 2);
  H("char_half", "Половина во тьме", "Очернение тела 50% (глитч заметен)", "st", "blk_char", "", 50, 4);
  H("char_black", "Чёрный силуэт", "Очернение тела 90%", "st", "blk_char", "", 90, 5);
  H("cursed_black", "Чёрное проклятие", "Проклятая вещь 15+ уровня, очернённая на 80%+", "st", "cursed_black", "", 1, 5);
  H("cursed_ench", "Двойная печать", "Проклятая вещь с зачарованием 3+ яруса", "st", "cursed_ench", "", 1, 4);
  H("cursed_upg", "Закалённое проклятие", "Проклятая вещь, улучшенная до +5", "st", "cursed_upg", "", 1, 4);
  H("bch_first_cur", "Печать на замке", "Откройте первый проклятый сундук", "st", "bch:cur", "", 1, 2);
  H("bch_first_black_c", "Чёрная печать", "Откройте первый «Чёрный проклятый сундук»", "st", "bch:black:c", "", 1, 5);
  H("cursed_vs", "Проклятый против проклятого", "Победите проклятого врага в проклятой вещи", "kill", "", "cursed,wearc", 1, 3);
  H("cursed_boss", "Подобное к подобному", "Мировой босс с проклятием — в полном проклятом комплекте", "kill", "", "wboss,cursed,wearc5", 1, 5);
  H("dark_boss", "Тьма к тьме", "Мировой босс при очернении тела 50%+", "kill", "", "wboss,dark50", 1, 5);
  H("cursed_death", "Проклятие не отпускает", "Падите в полном проклятом комплекте — и вернитесь", "death", "", "wearc5", 1, 3);
  H("bm_death", "Отмечен магом", "Падите от Чёрного мага", "death", "bm", "", 1, 2);
  H("revive", "Второе дыхание", "Талант вернул вас в бой", "revive", "", "", 1, 2);
  H("naked_boss", "Без доспехов", "Мировой босс без единой надетой вещи", "kill", "", "wboss,naked", 1, 5);
  H("last_breath", "На волоске", "Добейте босса, имея меньше 10% ОЗ", "kill", "", "boss,hp10", 1, 4);
  H("midnight", "Полуночник", "Победа ровно в полночь по Киеву (00:00–00:59)", "kill", "", "midnight", 1, 2);
  H("bag_full", "Барахольщик до краёв", "Забейте сумку до отказа", "st", "bag_full", "", 1, 1);
  H("ench6", "Чёрный ярус", "Вещь с зачарованием «Чёрный» (6 ярус)", "st", "ench6", "", 1, 5);
  // ——— скрытые на «Зачарованные» (ярусы 1…6) и чёрные вещи (ярус «Чёрный»; проклятые — выше)
  H("ench_t1", "Первая искра", "Получите вещь яруса «Необычный»", "st", "ench_own:1", "", 1, 1);
  H("ench_t2", "Синий отблеск", "Получите вещь яруса «Редкий»", "st", "ench_own:2", "", 1, 2);
  H("ench_t3", "Странное мерцание", "Получите вещь яруса «Странный»", "st", "ench_own:3", "", 1, 3);
  H("ench_t4", "Золотая легенда", "Получите вещь яруса «Легендарный»", "st", "ench_own:4", "", 1, 4);
  H("ench_t5", "Дар богов", "Получите вещь яруса «Божественный»", "st", "ench_own:5", "", 1, 5);
  H("ench_all6", "Вся лестница", "Держите вещи всех шести ярусов одновременно", "st", "ench_tiers", "", 6, 5);
  H("ench_hoard", "Сокровищница чар", "20 зачарованных вещей одновременно", "st", "ench_own", "", 20, 4);
  H("ench_div3", "Пантеон", "3 вещи яруса «Божественный» одновременно", "st", "ench_own:5", "", 3, 5);
  H("ench_same5", "Один тон", "5 надетых вещей одного яруса зачарования", "st", "ench_eq_same", "", 5, 4);
  H("ench_rainbow", "Радуга чар", "Надеты вещи пяти разных ярусов", "st", "ench_eq_kinds", "", 5, 5);
  H("ench_eq_div", "Облачённый богами", "Наденьте вещь яруса «Божественный»", "st", "ench_eq_t:5", "", 1, 4);
  H("ench_up10", "Чары и сталь", "Зачарованная вещь, улучшенная до +10", "st", "ench_up10", "", 1, 5);
  H("ench_leg25", "Легенда высокого уровня", "Вещь «Легендарный» или выше 25+ уровня", "st", "ench_hi25", "", 1, 4);
  H("ench_div_cursed", "Проклятый дар", "Проклятая вещь яруса «Божественный»", "st", "ench_cursed:5", "", 1, 5);
  H("ench_combo_mob", "Двойная метка", "Победите врага, проклятого и зачарованного сразу", "kill", "", "cursed,ench", 1, 3);
  H("ench_kill_e4", "Сразить легенду", "Победите врага яруса «Легендарный»", "kill", "", "e4", 1, 3);
  H("ench_kill_e5", "Богоборец", "Победите врага яруса «Божественный»", "kill", "", "e5", 1, 4);
  H("ench_boss_e4", "Легендарный босс", "Босс яруса «Легендарный» и выше", "kill", "", "boss,e4up", 1, 4);
  H("ench_solo_e5", "Один против бога", "Божественный враг — без отряда", "kill", "", "e5,solo", 1, 5);
  H("ench_salv_hi", "Не жалко", "Разберите вещь «Легендарный» или выше", "salvage", "", "e4up", 1, 3);
  H("ench_upg_hi", "Огранка легенды", "Улучшите вещь «Легендарный» или выше", "upgrade", "", "e4up", 1, 3);
  // чёрные вещи — ярус «Чёрный»
  H("black_three", "Три тени", "3 чёрные вещи одновременно", "st", "ench_own:6", "", 3, 5);
  H("black_wear", "В чёрном", "Наденьте чёрную вещь", "st", "ench_eq_t:6", "", 1, 4);
  H("black_full", "Чёрный комплект", "Все 5 слотов — чёрные вещи", "st", "ench_eq_t:6", "", 5, 5);
  H("black_cursed", "Абсолютная тьма", "Чёрная вещь, ещё и проклятая", "st", "ench_cursed:6", "", 1, 5);
  H("black_up5", "Закалённая тьма", "Чёрная вещь, улучшенная до +5", "st", "ench6_up5", "", 1, 5);
  H("black_hi", "Тьма высшего уровня", "Чёрная вещь 20+ уровня", "st", "ench6_hi20", "", 1, 5);
  H("black_kill", "Чёрный против чёрного", "Победите чёрного врага", "kill", "", "e6", 1, 4);
  H("black_kill_wear", "Тьма к тьме, сталь к стали", "Победите чёрного врага в чёрной вещи", "kill", "", "e6,ewear6", 1, 5);
  H("black_boss", "Чёрный исполин", "Победите чёрного босса", "kill", "", "boss,e6", 1, 5);
  H("black_night", "Ночь без звёзд", "Чёрный враг — ночью", "kill", "", "e6,night", 1, 4);
  H("black_party", "Свет отряда", "Чёрный враг — отрядом", "kill", "", "e6,party", 1, 3);
  H("black_cursed_mob", "Тьма в квадрате", "Победите чёрного врага с проклятием", "kill", "", "e6,cursed", 1, 5);
  H("black_salvage", "Расточитель тьмы", "Разберите чёрную вещь", "salvage", "", "e6", 1, 4);
  H("alkazak", "Под куполом", "Впервые попасть в Альказак (под купол)", "city", "", "", 1, 2); // единственное про Альказак: первый вход под купол
  for (const r of ["dreamwood", "moonpetal", "rot_ore", "starsilver"]) A("gather_" + r, `Сбор: ${resName(r)}`, "С узлов на карте", "gather", r, "", [20, 100, 400, 1500, 4000], [1, 2, 3, 4, 5]);
  for (const r of RECIPES) A("craft_" + r.id, `Рецепт: ${ITEM_BY_ID[r.item]?.name || r.item}`, "Создано у Петра", "craft", r.id, "", [1, 3, 10], [1, 2, 3]);
  const seen = new Set<string>();
  for (const v of VARIANTS.filter((x) => !x.boss)) for (const m of MONSTER_LOOT[v.base]?.materials || []) {
    if (!RESOURCES[m.res] || m.res === "soul_shard" || seen.has(m.res)) continue; seen.add(m.res);
    A("mat_" + m.res, `Запас: ${resName(m.res)}`, `Падает с: ${v.name}`, "loot", m.res, "", [25, 100, 300, 800, 2000], [1, 2, 3, 4, 5], ZONE_MOBS[v.id]?.lvl || 0);
  }
  return out.map((t, i) => ({ ...t, ord: i + 1 }));
}

export const BTASKS: Record<string, BTask> = {};
for (const t of [...genTut(), ...genNpc(), ...genHunt(), ...genPeriodic(), ...genPool(), ...genHard(), ...genAch()]) BTASKS[t.id] = t;
/** убийство «элиты» для заданий: особь в рамке ИЛИ редкий именной Отголосок (вкладка «Элита» Бестиария). Босс мира — не элита. */
export const isEliteKill = (m: { elite?: any }, d: { rare?: any }): boolean => !!m.elite || !!d.rare;
export const BTASK_LIST = () => Object.values(BTASKS);
const BY_EV = new Map<string, BTask[]>();
/** индекс «событие → задания»; пересобирается после любой правки задания в админке (новое, удалённое, сменилось событие) */
export function reindexBtasks() {
  BY_EV.clear();
  for (const t of BTASK_LIST()) { const k = t.ev === "ability" ? "ability_used" : t.ev === "claim" ? "board_claim" : t.ev === "quest" ? "quest_done" : t.ev; (BY_EV.get(k) || BY_EV.set(k, []).get(k)!).push(t); }
}
reindexBtasks();
// ── задания и достижения, созданные в админке (id «cx_…»): шаблон создаётся при сохранении, поля — правка game_overrides ──
export const CUSTOM_BT = /^cx_[a-z0-9_]{2,40}$/;
export const BT_CATS_NEW: Cat[] = ["npc", "hunt", "daily", "weekly", "monthly", "hard", "ach"];
/** события, на которые можно повесить задание; target — из какого списка выбирается цель в админке */
export const BT_EVS: { id: string; name: string; target: string; hint?: string }[] = [
  { id: "kill", name: "Победить врагов", target: "mob" }, { id: "gather", name: "Собрать ресурс", target: "res" },
  { id: "loot", name: "Забрать добычу", target: "loot" }, { id: "craft", name: "Создать вещь (ремесло)", target: "recipe" },
  { id: "salvage", name: "Разобрать вещи", target: "" }, { id: "upgrade", name: "Улучшить вещь", target: "upmax" },
  { id: "run", name: "Забег (Склеп/Бездна)", target: "room" }, { id: "trial", name: "Испытание волн", target: "trial" },
  { id: "duel", name: "Сыграть дуэль", target: "" }, { id: "duel_win", name: "Победить в дуэли", target: "" },
  { id: "pvp", name: "Бой с игроком", target: "pvp" }, { id: "claim", name: "Сдать задания доски", target: "cat" },
  { id: "quest", name: "Выполнить сюжетный квест", target: "" }, { id: "reach", name: "Прийти в мир", target: "world" },
  { id: "ability", name: "Применить умение", target: "" }, { id: "lvlup", name: "Получить уровни", target: "" },
  { id: "death", name: "Пасть в бою", target: "mob" }, { id: "st", name: "Достичь состояния (уровень, бестиарий, вещи…)", target: "state" },
];
export const ROOM_NAMES: Record<string, string> = { crypt: "Склеп", abyss: "Бездна" };
export const BT_ROLE_NAMES = ROLE_NAMES;
/** состояния для события «st» (что можно проверить по аккаунту) */
export const BT_STATES: Record<string, string> = {
  lvl: "Уровень героя", talents: "Потрачено очков талантов", equipped: "Надето вещей", bestiary: "Разных врагов побеждено (с запуска)", items: "Открыто разных предметов",
  heroes15: "Героев 15+ уровня", wbosses: "Разных мировых боссов побеждено", cursed_own: "Проклятых вещей в сумке", bag_full: "Сумка полна", look: "Активен облик",
  cursed_eq: "Надето проклятых вещей", blk_char: "Чернота персонажа", blk_item: "Чернота лучшей вещи", cursed_black: "Проклятая вещь 15+ с чернотой 80+",
  cursed_ench: "Проклятая вещь с ярусом 3+", cursed_upg: "Проклятая вещь +5", ench6: "Есть «Чёрная» вещь", ench_own: "Зачарованных вещей", ench_tiers: "Разных ярусов зачарования",
  ench_up10: "Зачарованная вещь +10", ench6_up5: "«Чёрная» вещь +5", ench6_hi20: "«Чёрная» вещь 20+ ур.", ench_hi25: "Ярус 4+ на вещи 25+ ур.",
  ench_eq: "Надето зачарованных", ench_eq_kinds: "Надето разных ярусов", ench_eq_same: "Надето одного яруса",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((t) => [[`ench_own:${t}`, `Вещей яруса ${t} в сумке`], [`ench_eq_t:${t}`, `Надето яруса ${t}`], [`ench_cursed:${t}`, `Проклятая вещь яруса ${t}`]])),
  ...Object.fromEntries(HERO_IDS.map((c) => [`hero:${c}`, `Уровень героя «${(HERO_NAMES as any)[c] || c}»`])),
};
export function makeBtask(id: string, cat: Cat, ev: string): BTask {
  return T({ id, cat, ev, title: cat === "ach" ? "Новое достижение" : "Новое задание", giver: cat === "hunt" ? "board" : "", ord: 9000, w: 1 });
}
export function delBtask(id: string) { if (CUSTOM_BT.test(id)) delete BTASKS[id]; }
export function boardCounts() {
  const c: Record<string, number> = {}; let tiers = 0;
  for (const t of BTASK_LIST()) { c[t.cat] = (c[t.cat] || 0) + 1; tiers += tiersOf(t).length; }
  return { ...c, total: BTASK_LIST().length, tasks: BTASK_LIST().filter((t) => t.cat !== "ach").length, tiers };
}

// ---------------- время (Киев) ----------------
const FMT = new Map<string, Intl.DateTimeFormat>();
function fmtOf(tz: string) {
  let f = FMT.get(tz); if (f) return f;
  const o: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" };
  try { f = new Intl.DateTimeFormat("en-CA", { ...o, timeZone: tz }); } catch { f = new Intl.DateTimeFormat("en-CA", { ...o, timeZone: "Europe/Kyiv" }); }
  FMT.set(tz, f); return f;
}
/** номер «игрового» дня: сутки начинаются в resetHour по Киеву */
function kyivDay(t: number): number {
  const p: any = Object.fromEntries(fmtOf(BOARD_CFG.tz || "Europe/Kyiv").formatToParts(new Date(t - (BOARD_CFG.resetHour | 0) * 3600e3)).map((x) => [x.type, x.value]));
  return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 864e5);
}
export function kyivHour(t: number): number {
  const f = FMT.get("h:" + (BOARD_CFG.tz || "Europe/Kyiv")) || (() => { let x: Intl.DateTimeFormat; try { x = new Intl.DateTimeFormat("en-GB", { timeZone: BOARD_CFG.tz || "Europe/Kyiv", hour: "2-digit", hourCycle: "h23" }); } catch { x = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hourCycle: "h23" }); } FMT.set("h:" + (BOARD_CFG.tz || "Europe/Kyiv"), x); return x; })();
  return Number(f.format(new Date(t))) % 24;
}
export function periodKey(cat: Cat, t = Date.now()): string {
  const d = kyivDay(t);
  if (cat === "daily") return "d" + d;
  if (cat === "weekly") { const wd = Math.min(7, Math.max(1, (BOARD_CFG.weekDay | 0) || 1)); return "w" + Math.floor((d + 3 - (wd - 1)) / 7); } // день 0 (1970-01-01) — четверг
  if (cat === "monthly") { const x = new Date(d * 864e5); return "m" + (x.getUTCFullYear() * 12 + x.getUTCMonth()); }
  if (cat === "hard") return "h" + periodKey("weekly", t);
  return "";
}
let resetCache: { at: number; sig: string; v: Record<string, number> } | null = null;
/** когда сменится период (мс): для таймера «сброс через …» в окне */
export function nextResets(now = Date.now()): Record<string, number> {
  const sig = `${BOARD_CFG.tz}|${BOARD_CFG.resetHour}|${BOARD_CFG.weekDay}`;
  if (resetCache && resetCache.sig === sig && Object.values(resetCache.v).every((x) => x > now)) return resetCache.v;
  const v: Record<string, number> = {};
  for (const c of PERIODIC) {
    const k0 = periodKey(c, now); let lo = now, hi = now + 3600e3;
    while (periodKey(c, hi) === k0 && hi - now < 40 * 864e5) { lo = hi; hi += c === "daily" ? 3600e3 : 6 * 3600e3; }
    while (hi - lo > 30e3) { const mid = Math.floor((lo + hi) / 2); if (periodKey(c, mid) === k0) lo = mid; else hi = mid; }
    v[c] = hi;
  }
  resetCache = { at: now, sig, v };
  return v;
}

// ---------------- состояние игрока ----------------
export interface BoardState {
  v: number; rev: number; p: Record<string, number>; c: Record<string, number>; tk: string[]; pin: string[];
  per: Record<string, string>; sel: Record<string, string[]>; xd: { k: string; v: number }; xs: Record<string, { k: string; v: number }>;
  t0: number; pre: Record<string, number>; // t0 — запуск доски для игрока (точка отсчёта «с нуля»), pre — ступени, закрытые на запуске без награды
  tut: { off?: boolean; skip?: boolean; vet?: boolean }; lv: Record<string, number>; cnt: Record<string, number>;
  roll: Record<string, Roll>; // выпавший вариант повторяющегося задания: ранг, уровень, количество, бонусные условия
  cur?: string; bod?: Record<string, BodySlice>; // задания тел: cur — чьи задания сейчас в p/c/sel/per/roll/tk/pin, bod — отложенные наборы других тел
}
/** набор заданий одного тела (ежедневные, еженедельные, ежемесячные, тяжёлые, заказы Доски): прогресс, сдача, выпавшее, период */
export interface BodySlice { p: Record<string, number>; c: Record<string, number>; roll: Record<string, Roll>; sel: Record<string, string[]>; per: Record<string, string>; xs: Record<string, { k: string; v: number }>; tk: string[]; pin: string[] }
/** категории, у которых у каждого тела свой набор (достижения, обучение и личные задания персонажей — общие на профиль) */
export const BODY_CATS: Cat[] = ["daily", "weekly", "monthly", "hard", "hunt"];
/** задание принадлежит телу: повторяющееся или заказ Доски объявлений */
export const perBody = (t: BTask | undefined) => !!t && (BODY_CATS.includes(t.cat) || (t.cat !== "ach" && t.cat !== "tut" && t.giver === "board"));
const pbId = (id: string) => perBody(BTASKS[id]);
const objOk = (x: any) => x && typeof x === "object" && !Array.isArray(x);
/** Переключить состояние доски на тело cls: отложить набор прежнего тела в b.bod и достать набор cls.
 *  Весь остальной код работает с b.p/b.c/b.sel/b.roll как раньше — там всегда задания текущего тела + общие (достижения, обучение, личные). */
function bodySwap(b: BoardState, cls: string) {
  if (!cls || b.cur === cls) return;
  if (!objOk(b.bod)) b.bod = {};
  const bod = b.bod!;
  if (b.cur) { // отложить набор прежнего тела
    const S: BodySlice = { p: {}, c: {}, roll: b.roll, sel: b.sel, per: b.per, xs: {}, tk: b.tk.filter(pbId), pin: b.pin.filter(pbId) };
    for (const id of Object.keys(b.p)) if (pbId(id)) { S.p[id] = b.p[id]; delete b.p[id]; }
    for (const id of Object.keys(b.c)) if (pbId(id)) { S.c[id] = b.c[id]; delete b.c[id]; }
    for (const c of BODY_CATS) if (b.xs[c]) { S.xs[c] = b.xs[c]; delete b.xs[c]; }
    b.tk = b.tk.filter((x) => !pbId(x)); b.pin = b.pin.filter((x) => !pbId(x));
    bod[b.cur] = S;
  } // впервые (b.cur ещё нет): то, что уже есть, — набор этого тела
  const L = bod[cls];
  if (L) {
    Object.assign(b.p, objOk(L.p) ? L.p : {}); Object.assign(b.c, objOk(L.c) ? L.c : {}); Object.assign(b.xs, objOk(L.xs) ? L.xs : {});
    b.roll = objOk(L.roll) ? L.roll : {}; b.sel = objOk(L.sel) ? L.sel : {}; b.per = objOk(L.per) ? L.per : {};
    b.tk = [...b.tk, ...(Array.isArray(L.tk) ? L.tk : []).filter((x) => typeof x === "string" && !b.tk.includes(x))];
    for (const x of Array.isArray(L.pin) ? L.pin : []) if (typeof x === "string" && !b.pin.includes(x) && b.pin.length < pinLimit()) b.pin.push(x);
    delete bod[cls];
  } else if (b.cur) { b.roll = {}; b.sel = {}; b.per = {}; } // у тела ещё нет набора — выпадет при обновлении
  b.cur = cls; b.rev++;
}
export function boardOf(a: Account): BoardState {
  const A = a as any;
  if (!A.board || typeof A.board !== "object" || Array.isArray(A.board)) A.board = {};
  const b = A.board;
  b.v = 1; b.rev = b.rev | 0;
  for (const k of ["p", "c", "per", "sel", "tut", "lv", "cnt", "xs", "pre", "roll"]) if (!b[k] || typeof b[k] !== "object" || Array.isArray(b[k])) b[k] = {};
  b.tk = Array.isArray(b.tk) ? b.tk.filter((x: any) => typeof x === "string") : []; b.pin = Array.isArray(b.pin) ? b.pin.filter((x: any) => typeof x === "string") : [];
  if (!b.xd || typeof b.xd !== "object") b.xd = { k: "", v: 0 };
  if (a.hero && b.cur !== a.hero) bodySwap(b, a.hero);
  return b;
}
/** на каком теле выполнять условие задания: "" — на своём, "any" — на любом, id тела — только на нём */
export const reqBody = (t: BTask, R?: Roll | null): string => (R?.rb || t.rb || "");
/** засчитывается ли событие тела cur заданию тела owner */
export const bodyOk = (rb: string, owner: string, cur: string) => rb === "any" || (rb && rb !== "owner" ? cur === rb : cur === owner);
export const tiersOf = (t: BTask) => { const out: number[] = []; for (const x of t.n || []) { if (!(x > 0)) break; if (out.length && x <= out[out.length - 1]) break; out.push(x); } return out.length ? out : [1]; };
const FLAGS = new Map<string, Set<string>>();
const flags = (t: BTask) => { let s = FLAGS.get(t.f || ""); if (!s) { s = new Set((t.f || "").split(",").map((x) => x.trim()).filter(Boolean)); FLAGS.set(t.f || "", s); } return s; };
const catOn = (c: Cat) => BOARD_CFG.on !== false && BOARD_CFG.cats?.[c] !== false;
export interface Ctx { pkey: string; heroes?: Record<string, Hero> }

// ═════════════ Ранги и бонусные условия повторяющихся заданий ═════════════
export const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS"] as const;
export const RANK_CATS: Cat[] = ["daily", "weekly", "monthly", "hard", "hunt"];
export interface RollBonus { k: string; v?: number | string; xp: number; ok: 0 | 1 }
export interface Roll { r: string; L: number; minL: number; n: number; d: number; x: number; f: string; bon: RollBonus[]; t1?: number; done?: number; k: string; w: string; rb?: string }
export const BONUS_NAMES: Record<string, string> = {
  nodeath: "Без единой смерти, пока задание не выполнено", fast: "Уложиться в N мин с первого засчитанного", body: "Только в теле героя",
  higher: "Только враги на N ур. выше вас", party: "Только в отряде", solo: "Только в одиночку", night: "Только ночью", elite: "Только элитные враги",
  hirank: "Сдавать только задания ранга C и выше",
};
/** какие бонусные условия подходят событию (сервер умеет их проверить) */
const BONUS_BY_EV: Record<string, string[]> = {
  kill: ["nodeath", "fast", "body", "higher", "party", "solo", "night", "elite"], gather: ["nodeath", "fast", "body"], loot: ["nodeath", "fast", "body"],
  craft: ["fast", "body"], salvage: ["fast"], upgrade: ["fast"], run: ["fast", "body", "solo"], trial: ["fast", "body", "solo"], chest: ["nodeath", "fast", "body"],
  // мета-задания: «уложиться» за период не проверить честно (дни/недели сдач), поэтому — без смерти и «ранг C и выше» (сервер видит ранг сданного)
  claim: ["nodeath", "hirank"], lvlup: ["nodeath", "fast"], duel: ["fast"], duel_win: ["fast"], explore: ["nodeath", "fast"], // дуэли без nodeath: поражение в дуэли — не «смерть» для условия
  dash: ["nodeath", "fast"], ability: ["nodeath", "fast"], portal: ["fast"], quest: ["nodeath"], bm_find: ["nodeath", "fast"],
  // st (состояние: «уровень 30», «весь бестиарий») — без бонусов: условие не к чему привязать; S/SS у них только принудительно (обычный бросок не выше A)
};
const GROUP_EVS = new Set(["kill", "run", "trial"]); // S и SS — только там, где есть «враги намного выше» и отряд
/** события, условие которых может требовать другое тело (не состояния героя, не интерфейс и не сдача) */
const XB_EVS = new Set(["kill", "gather", "loot", "craft", "salvage", "run", "trial", "chest", "explore", "duel", "duel_win", "pvp", "death", "dash", "ability"]);
/** количество НЕ растёт с рангом (ранг меняет опыт, сложность и бонусы): счётчики сдач, уровни, дуэли (нужен второй игрок),
 *  «лучший результат» (волны Испытания, +N вещи) и задания «один раз» у тяжёлых */
export function noScale(t: BTask): boolean {
  return ["claim", "lvlup", "lvl", "st", "duel", "duel_win", "quest", "portal", "bm_find", "city", "select_hero"].includes(t.ev) || t.m === "max" || t.m === "full" || (t.cat === "hard" && tiersOf(t)[0] === 1);
}
/** верхняя граница количества за период (выполнимость): дни/недели периода × слоты; уровни — не больше 3 за месяц */
export function feasCap(t: BTask): number {
  const days = t.cat === "monthly" ? 28 : t.cat === "weekly" || t.cat === "hard" ? 7 : 1;
  if (t.ev === "claim") return t.m === "weekly" ? 4 * (Number(BOARD_CFG.weeklyMin) || 3) : t.m === "daily" ? days * (Number(BOARD_CFG.dailyMin) || 4) : days * 6;
  if (t.ev === "lvlup") return t.cat === "monthly" ? 3 : t.cat === "weekly" ? 2 : 1;
  if (t.ev === "trial" && t.m === "max") return 8;
  if (t.ev === "upgrade" && t.m === "max") return 15;
  if (t.ev === "duel" || t.ev === "duel_win") return days * 3;
  return Infinity;
}
/** конкретный враг для повторяющегося набора — не намного ниже героя (иначе «900 жуков 5 ур.» герою 10 ур.) */
export const mobWindow = (t: BTask, lvl: number): boolean => { const L = t.ev === "kill" && t.m && !t.m.includes(":") ? (ZONE_MOBS as any)[t.m]?.lvl || 0 : 0; return !L || L >= lvl - (Number(BOARD_CFG.mobWin) || 3); };
const hu = (s: string) => (hash(s) + 1) / 4294967297;
function pickRank(seed: string, ev: string, rmax: string): string {
  const R = BOARD_CFG.ranks || {}, top = rmax && RANKS.includes(rmax as any) ? RANKS.indexOf(rmax as any) : GROUP_EVS.has(ev) ? 7 : 5;
  const L = RANKS.filter((r, i) => i <= top && (Number(R[r]?.w) || 0) > 0); if (!L.length) return "D";
  let W = L.reduce((a, r) => a + Number(R[r].w), 0), x = hu(seed + "|rank") * W;
  for (const r of L) { x -= Number(R[r].w); if (x <= 0) return r; }
  return L[L.length - 1];
}
const MAX_MOB_LVL = () => Math.max(1, ...Object.values(ZONE_MOBS).map((m: any) => m.lvl || 1));
const autoTarget = (t: BTask) => t.ev === "kill" && (!t.m || t.m.startsWith("biome:") || t.m.startsWith("role:")) && !/(^|,)(boss|wboss|rare)(,|$)/.test(t.f); // у боссов и редких свой уровень
/** база опыта задания уровня L: на стыке ступеней xpPct (16, 21 ур.) процент падает — берём максимум по 5 уровням ниже,
 *  чтобы ранг выше (враги на +N ур.) никогда не давал меньше опыта */
const xpBaseAt = (L: number, d: number) => { let m = 0; for (let l = Math.max(1, L - 5); l <= L; l++) m = Math.max(m, heroXpNeed(l) * xpPct(l, d) / 100); return m; };
/** бросок варианта задания при выдаче: детерминированно по игроку, периоду и заданию */
export function makeRoll(t: BTask, heroLvl: number, seed: string, k: string, heroes: string[], force = "", owner = "", lv: Record<string, number> = {}, forceRb = ""): Roll {
  // условие на другом теле: из поля задания (админка) или случайно (доля xbody.pct) — только для событий, которые можно сделать любым телом
  let rb = forceRb || (t.rb && t.rb !== "owner" && t.rb !== "any" && t.rb !== owner ? t.rb : "");
  const others = heroes.filter((c) => c !== owner);
  if (!rb && !t.rb && owner && others.length && BOARD_CFG.xbody?.on !== false && XB_EVS.has(t.ev) && hu(seed + "|xb") * 100 < (Number(BOARD_CFG.xbody?.pct) || 0))
    rb = others[Math.floor(hu(seed + "|xbw") * others.length)];
  if (rb && lv[rb] > 0) heroLvl = lv[rb]; // враги и количество — по уровню тела, на котором выполнять
  let r = force && RANKS.includes(force as any) ? force : pickRank(seed, t.ev, (t as any).rmax || "");
  const mobL = t.ev === "kill" && t.m && !t.m.includes(":") ? (ZONE_MOBS as any)[t.m]?.lvl || 0 : 0;
  // конкретный враг: ранги B…SS — только если он не ниже героя + «плюс» ранга, иначе ранг снижается (опыт не за лёгких врагов)
  if (mobL) { let i = RANKS.indexOf(r as any); while (i > 3 && mobL < heroLvl + (Number(BOARD_CFG.ranks?.[RANKS[i]]?.plus) || 0)) i--; r = RANKS[i]; }
  const RC = BOARD_CFG.ranks?.[r] || { plus: 0, mul: 1, cnt: 1, bon: 1 };
  const ri = RANKS.indexOf(r as any), plus = (Number(RC.plus) || 0) + (Number(BOARD_CFG.catPlus?.[t.cat]) || 0);
  const tiers = tiersOf(t);
  let n: number, d: number, f = "", minL = 0;
  if (tiers.length > 1) { const ti = Math.min(tiers.length - 1, Math.floor(ri * tiers.length / 8)); n = tiers[ti]; d = t.d?.[ti] || 1; } // многоступенчатые (заказы, тяжёлые): ступень по рангу
  else { n = noScale(t) ? tiers[0] : Math.max(1, Math.round(tiers[0] * (Number(RC.cnt) || 1))); d = t.d?.[0] || 1; }
  n = Math.min(n, Math.max(tiers[0], feasCap(t))); // выполнимо за период
  d = Math.max(1, Math.min(5, d + (ri >= 6 ? 1 : 0) - (ri <= 0 ? 1 : 0)));
  let L = clampL(Math.max(t.lvl || 1, heroLvl + plus));
  if (autoTarget(t)) minL = Math.min(t.m.startsWith("biome:") ? (BIOMES as any)[t.m.slice(6)]?.lvl?.[1] || MAX_MOB_LVL() : MAX_MOB_LVL(), clampL(heroLvl + plus)); // требуемый уровень врагов от уровня героя на момент выпадения
  if (r === "SS" && t.ev === "kill" && autoTarget(t) && heroLvl >= 8 && /^(lvl|party)?$/.test(t.f)) { // только простые цели: «один удар», «элита», «зачарованные», «проклятые» не теряют своё условие // SS: мировые боссы — звать отряд
    f = "wboss"; minL = 0; n = t.cat === "monthly" ? 6 : t.cat === "weekly" || t.cat === "hard" ? 3 : 1; L = clampL(Math.max(L, heroLvl + 6));
  }
  if (mobL && !f) L = clampL(mobL); // конкретный враг: уровень задания = уровень врага (ранг меняет количество, опыт и бонусы)
  if (minL) L = clampL(Math.max(L, minL));
  const mul = Number(BOARD_CFG.xpMul?.[t.cat] ?? 1), x = Math.round(xpBaseAt(L, d) * (Number.isFinite(mul) ? Math.max(0, mul) : 1) * (Number(RC.mul) || 1));
  // бонусные условия: из пула события, без противоречий с основным
  const have = flags(t), B = BOARD_CFG.bonus || {};
  const pool = (BONUS_BY_EV[t.ev] || []).filter((q) => B[q]?.on !== false && !have.has(q) && !(q === "solo" && (have.has("party") || f === "wboss")) && !(q === "party" && have.has("solo")) && !(q === "body" && (heroes.length < 2 || !!rb || !!owner)) && !(q === "higher" && (minL || f || /(^|,)(boss|wboss|rare)(,|$)/.test(t.f) || (mobL && mobL < heroLvl + (Number(B.higher?.n) || 3)))) && !(q === "elite" && (have.has("boss") || have.has("wboss") || have.has("rare") || have.has("elite") || f)));
  const want = Math.min(pool.length, Math.max(0, Math.min(3, Number(RC.bon) | 0)));
  const order = pool.map((q) => ({ q, u: hu(seed + "|b|" + q) })).sort((a, b) => a.u - b.u).map((o) => o.q), bon: RollBonus[] = [];
  const bx = Math.round(x * (Number(BOARD_CFG.bonusXp) || 0) / 100);
  for (const q of order) {
    if (bon.length >= want) break;
    if (q === "party" && bon.some((o) => o.k === "solo")) continue; if (q === "solo" && bon.some((o) => o.k === "party")) continue;
    const v = q === "fast" ? Math.max(5, Number(B.fast?.[t.cat]) || 60) : q === "higher" ? Math.max(1, Number(B.higher?.n) || 3) : q === "body" ? heroes[Math.floor(hu(seed + "|body") * heroes.length)] : undefined;
    bon.push({ k: q, v, xp: bx, ok: 1 });
  }
  const out: Roll = { r, L, minL, n, d, x, f, bon, k, w: rollText(t, { r, L, minL, n, f }) };
  if (rb) out.rb = rb;
  return out;
}
/** уровни тел (для заданий «выполнить на другом теле») */
function heroLvls(a: Account, ctx: Ctx): Record<string, number> {
  const b: any = (a as any).board || {}, out: Record<string, number> = {};
  for (const c of HERO_IDS) out[c] = Math.max(ctx.heroes?.[c]?.lvl || 0, b.lv?.[c] || 0);
  return out;
}
/** тела для бонуса «только в теле» и заданий на другом теле: те, которыми игрок уже играл (уровень > 1), и текущее */
function rollHeroes(a: Account, ctx: Ctx): string[] {
  const L = Object.entries(ctx.heroes || {}).filter(([c, hh]: any) => HERO_IDS.includes(c) && (hh?.lvl || 0) > 1).map(([c]) => c);
  if (a.hero && !L.includes(a.hero)) L.push(a.hero);
  return L;
}
/** только для локальных тестов (dev_grant): выпавший вариант с заданным рангом; задание — в набор периода */
export function devBoardRoll(a: Account, h: Hero | null, id: string, r: string, n: number, minL: number, ctx: Ctx, rb = "", p = 0): boolean {
  const t = BTASKS[id]; if (!t || !RANK_CATS.includes(t.cat)) return false;
  const b = boardOf(a), lvl = h?.lvl || 1, cat = t.cat === "hunt" ? "hunt" : t.cat;
  if (!(b.sel[cat] || []).includes(id)) b.sel[cat] = [id, ...(b.sel[cat] || [])];
  const heroes = rollHeroes(a, ctx);
  const R = makeRoll(t, lvl, ctx.pkey + "|dev|" + id + "|" + Date.now(), b.per[cat] || "dev", heroes, r, a.hero || "", heroLvls(a, ctx), HERO_IDS.includes(rb as any) && rb !== a.hero ? rb : "");
  if (n > 0) R.n = n; if (minL >= 0) { R.minL = minL; R.w = rollText(t, R); }
  b.roll[id] = R; delete b.p[id]; delete b.c[id]; if (p > 0) b.p[id] = Math.min(p, R.n); b.rev++; return true; // p — сразу прогресс (плейтест сдачи)
}
/** основное условие словами (для окна и трекера) */
function rollText(t: BTask, o: { r?: string; L?: number; minL: number; n: number; f: string }): string {
  const what = o.minL && flags(t).has("lvl") ? "" : t.why || "";
  if (o.f === "wboss") return "Мировые боссы — зовите отряд";
  return [what, o.minL ? `враги ${o.minL} ур. и выше` : ""].filter(Boolean).join(" · ");
}
/** задание с учётом выпавшего варианта (ранг, количество, уровень врагов) */
export function effOf(b: BoardState, t: BTask): BTask {
  const R = b?.roll?.[t.id]; if (!R) return t;
  return { ...t, n: [R.n, 0, 0, 0, 0], d: [R.d, 0, 0, 0, 0], x: [R.x + R.bon.reduce((a, o) => a + (o.ok && R.done ? o.xp : 0), 0), 0, 0, 0, 0], f: [t.f, R.f].filter(Boolean).join(","), m: R.f === "wboss" ? "" : t.m, lvl: R.L, minL: R.minL } as any;
}
const SELS = new WeakMap<object, { refs: any[]; s: Set<string>; n: number }>(); // кэш «выпавшие на период» по ссылкам на массивы b.sel (они заменяются целиком)
function selSet(b: BoardState): Set<string> {
  const refs = Object.values(b.sel), c = SELS.get(b); let n = 0; for (const r of refs) n += (r as any)?.length || 0; // n — на случай правки массива на месте
  if (c && c.n === n && c.refs.length === refs.length && c.refs.every((r, i) => r === refs[i])) return c.s;
  const s = new Set<string>(refs.flat() as string[]); SELS.set(b, { refs, s, n }); return s;
}
/** бонусы: событие засчитано заданию — проверить «каждое событие должно…» */
function bonusOnEvent(R: Roll, ev: any, cls: string, lvl: number, now: number) {
  if (!R.t1) R.t1 = now;
  for (const o of R.bon) {
    if (!o.ok) continue;
    if (o.k === "body" && (ev.cls || cls) !== o.v) o.ok = 0;
    if (o.k === "higher" && ev.type === "kill" && !((ev.lvl || 0) >= lvl + (Number(o.v) || 0))) o.ok = 0;
    if (o.k === "party" && ev.type === "kill" && !(ev.party > 1)) o.ok = 0;
    if (o.k === "solo" && ((ev.type === "kill" && ev.party > 1) || ((ev.type === "run" || ev.type === "trial") && (ev.players || 1) > 1))) o.ok = 0;
    if (o.k === "night" && ev.type === "kill" && !ev.night) o.ok = 0;
    if (o.k === "elite" && ev.type === "kill" && !ev.elite) o.ok = 0;
    if (o.k === "hirank" && ev.type === "board_claim" && !(RANKS.indexOf(ev.rank) >= 3)) o.ok = 0;
  }
}
function bonusOnDone(R: Roll, now: number) {
  R.done = now;
  for (const o of R.bon) if (o.ok && o.k === "fast" && now - (R.t1 || now) > (Number(o.v) || 0) * 60e3) o.ok = 0;
}

function stateVal(a: Account, h: Hero | null, key: string, ctx: Ctx): number {
  const b = boardOf(a);
  if (key === "lvl") return Math.max(h?.lvl || 0, ...Object.values(ctx.heroes || {}).map((x) => x?.lvl || 0), ...Object.values(b.lv));
  if (key === "hero") return a.hero ? 1 : 0;
  if (key === "talents") return h ? talentSpent(h) : 0;
  if (key === "equipped") return h ? Object.values(h.equip || {}).filter(Boolean).length : 0;
  // «с нуля»: разные виды, побеждённые после запуска доски (b.cnt «k:<вид>» копит boardEvent), а не записи бестиария
  if (key === "bestiary") { let n = 0; for (const k in b.cnt) if (k.charCodeAt(0) === 107 && k.charCodeAt(1) === 58) n++; return n; }
  if (key === "items") return Object.keys(a.disc?.items || {}).length;
  if (key === "kills") return Object.values(a.bestiary || {}).reduce((s, x) => s + (x.kills || 0), 0); // только авто-засчёт обучения («уже умеет»), не награды доски
  if (key.startsWith("ench")) return enchVal(a, h, key);
  if (key === "heroes15") return HERO_IDS.filter((c) => Math.max(ctx.heroes?.[c]?.lvl || 0, b.lv[c] || 0) >= 15).length;
  if (key === "wbosses") return Object.keys(BOSS_TIMERS).filter((id) => (b.cnt["wb:" + id] || 0) > 0).length;
  if (key === "cursed_own") return (a.inv || []).filter((i: any) => i.cursed).length;
  if (key === "bag_full") return (a.inv?.length || 0) >= 120 ? 1 : 0;
  if (key === "cursed_black") return (a.inv || []).some((i: any) => i.cursed && blkOf(i) >= 80 && (ITEM_BY_ID[i.id]?.lvl || 0) >= 15) ? 1 : 0;
  if (key === "cursed_ench") return (a.inv || []).some((i: any) => i.cursed && (i.ench | 0) >= 3) ? 1 : 0;
  if (key === "cursed_upg") return (a.inv || []).some((i: any) => i.cursed && (i.up | 0) >= 5) ? 1 : 0;
  if (key === "blk_item") return Math.floor(Math.max(0, ...(a.inv || []).map((i: any) => blkOf(i))));
  if (key === "cursed_eq" || key === "blk_char" || key === "look") {
    if (!h) return 0; const eq = equippedItems(a, h);
    if (key === "cursed_eq") return eq.filter((e) => e.cursed).length;
    if (key === "look") return activeLook(a, h) ? 1 : 0;
    return Math.floor(charBlk(eq));
  }
  if (key.startsWith("bch:")) return chestOps(a)[key.slice(4)] || 0; // 🎁 открытые сундуки наград (boardChest.chestOps, с учётом прошлого)
  if (key.startsWith("mob:")) return b.cnt["k:" + key.slice(4)] || 0;
  if (key.startsWith("hero:")) { const c = key.slice(5); return Math.max(ctx.heroes?.[c]?.lvl || 0, b.lv[c] || 0, h && a.hero === c ? h.lvl : 0); }
  if (key.startsWith("world:")) return b.cnt["w:" + key.slice(6)] ? 1 : 0;
  return 0;
}
/** состояния «Зачарованных» (InvItem.ench 1…6) по сумке и надетому */
function enchVal(a: Account, h: Hero | null, key: string): number {
  const inv: any[] = a.inv || [], i = key.indexOf(":"), k = i < 0 ? key : key.slice(0, i), t = i < 0 ? 0 : Number(key.slice(i + 1)) | 0;
  const lvlOf = (x: any) => ITEM_BY_ID[x.id]?.lvl || 0;
  switch (k) {
    case "ench6": return inv.some((x) => (x.ench | 0) === 6) ? 1 : 0;
    case "ench_own": return inv.filter((x) => (t ? (x.ench | 0) === t : (x.ench | 0) > 0)).length;
    case "ench_tiers": return new Set(inv.map((x) => x.ench | 0).filter((e) => e > 0)).size;
    case "ench_cursed": return inv.some((x) => x.cursed && (x.ench | 0) === t) ? 1 : 0;
    case "ench_up10": return inv.some((x) => (x.ench | 0) > 0 && (x.up | 0) >= 10) ? 1 : 0;
    case "ench6_up5": return inv.some((x) => (x.ench | 0) === 6 && (x.up | 0) >= 5) ? 1 : 0;
    case "ench6_hi20": return inv.some((x) => (x.ench | 0) === 6 && lvlOf(x) >= 20) ? 1 : 0;
    case "ench_hi25": return inv.some((x) => (x.ench | 0) >= 4 && lvlOf(x) >= 25) ? 1 : 0;
  }
  if (!h) return 0;
  const eq = equippedItems(a, h).map((x: any) => x.ench | 0);
  if (k === "ench_eq") return eq.filter((e) => e > 0).length;
  if (k === "ench_eq_t") return eq.filter((e) => e === t).length;
  if (k === "ench_eq_kinds") return new Set(eq.filter((e) => e > 0)).size;
  if (k === "ench_eq_same") { const c: Record<number, number> = {}; let m = 0; for (const e of eq) if (e > 0) m = Math.max(m, (c[e] = (c[e] || 0) + 1)); return m; }
  return 0;
}
/** условия-ярусы: e3 — ровно «Странный», e3up — «Странный» и выше; ench — любой ярус */
const ENCH_FLAG = /^e([1-6])(up)?$/;
function enchOk(F: Set<string>, e: number): boolean {
  for (const f of F) { const m = ENCH_FLAG.exec(f); if (!m) continue; const n = +m[1]; if (m[2] ? !(e >= n) : e !== n) return false; }
  if (F.has("ench") && !(e > 0)) return false;
  return true;
}
export const isEnchFlag = (f: string) => ENCH_FLAG.test(f);

function autoDone(a: Account, h: Hero | null, auto: string, ctx: Ctx): boolean {
  if (!auto) return false;
  const i = auto.indexOf(":"); const k = i < 0 ? auto : auto.slice(0, i), v = i < 0 ? "" : auto.slice(i + 1);
  if (k === "world") return stateVal(a, h, auto, ctx) > 0;
  return stateVal(a, h, k, ctx) >= (Number(v) || 1);
}

/** почему задание недоступно (null — доступно) */
export function lockReason(a: Account, t: BTask, lvl: number): string | null {
  if (!t.on || !catOn(t.cat)) return "выключено";
  if (lvl < t.minLvl) return `с ${t.minLvl} уровня`;
  if (t.req) for (const r of t.req.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [rid, tr] = r.split("@"); const R = BTASKS[rid]; if (!R) continue;
    const need = Math.min(tiersOf(R).length, Math.max(1, Number(tr) || tiersOf(R).length));
    if ((boardOf(a).c[rid] || 0) < need) return `сначала: «${R.title}»`;
  }
  return null;
}
export const isDone = (a: Account, t: BTask) => { const b = boardOf(a); return (b.c[t.id] || 0) >= tiersOf(effOf(b, t)).length; };
/** заказ: задание с Доски объявлений, которое берут у доски (периодические, обучение и достижения не берутся) */
/** где берут и сдают: "board" — Доска объявлений, id персонажа — у него в диалоге (личное задание), "" — в окне «Задания».
 *  Это поле «кто выдаёт» из админки; достижения и обучение всегда без выдающего. */
export const takeAt = (t: BTask): string => t.cat === "ach" || t.cat === "tut" ? "" : t.giver === "board" ? "board" : NPC_GIVERS.includes(t.giver) ? t.giver : t.cat === "hunt" ? "board" : "";
/** нужно ли сначала взять (у доски или персонажа); периодические выдаются сами — выбором периода */
export const needsTake = (t: BTask) => !!takeAt(t) && !PERIODIC.includes(t.cat);
/** сдаётся только у Доски объявлений */
export const atBoard = (t: BTask) => takeAt(t) === "board";
const tutActive = (b: BoardState) => BOARD_CFG.tutOn !== false && !b.tut.off && !b.tut.skip && !b.tut.vet;
/** копит ли задание прогресс сейчас */
function counts(a: Account, b: BoardState, t: BTask, lvl: number): boolean {
  if (isDone(a, t) || lockReason(a, t, lvl)) return false;
  if (perBody(t) && !bodyOk(reqBody(t, b.roll[t.id]), a.hero || "", a.hero || "")) return false; // условие — на другом теле: считается в boardEvent (crossEvent)
  if (needsTake(t)) return b.tk.includes(t.id);
  if (PERIODIC.includes(t.cat)) return (b.sel[t.cat] || []).includes(t.id);
  if (t.cat === "tut") return tutActive(b);
  return true;
}

/** сколько заданий категории на период: от Min до Max (детерминированно по игроку и периоду) */
export function periodCount(c: Cat, seed: string): number {
  const lo = Math.max(0, Math.min(12, BOARD_CFG[c + "Min"] | 0)), hi = Math.max(lo, Math.min(12, BOARD_CFG[c + "Max"] | 0));
  return lo + (hash(seed + "|n") % (hi - lo + 1));
}
/** взвешенный случайный порядок без повторов (Efraimidis–Spirakis): ключ u^(1/w), u — из хеша игрок+период+задание */
function weighted(pool: BTask[], seed: string): BTask[] {
  return pool.map((t) => { const u = (hash(seed + "|" + t.id) + 1) / 4294967297; return { t, k: Math.pow(u, 1 / Math.max(0.01, Number(t.w ?? 1) || 1)) }; })
    .sort((x, y) => y.k - x.k).map((x) => x.t);
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** смена периода: обнулить прогресс задач периода и выбрать новые (детерминированно: игрок + период) */
function rollPeriods(a: Account, b: BoardState, lvl: number, ctx: Ctx, now: number): boolean {
  let ch = false;
  const owner = a.hero || "", S0 = ctx.pkey + (owner ? "|" + owner : ""); // набор — своё у каждого тела: игрок + тело + период
  const heroes = rollHeroes(a, ctx), lv = heroLvls(a, ctx);
  const rbOk = (t: BTask) => !t.rb || t.rb === "any" || t.rb === "owner" || t.rb === owner || heroes.includes(t.rb); // «на теле X» — только если X уже сыгран
  for (const c of PERIODIC) {
    const k = periodKey(c, now);
    if (b.per[c] === k && Array.isArray(b.sel[c])) { // набор периода есть; не добран (герой был ниже) — добрать при новом уровне, не трогая выпавшее
      const want = periodCount(c, S0 + "|" + k);
      if (b.sel[c].length < want && b.per[c + "L"] !== String(lvl)) {
        b.per[c + "L"] = String(lvl);
        const pool = BTASK_LIST().filter((t) => t.cat === c && lvl <= (t.maxLvl || 30) && !lockReason(a, t, lvl) && (t.w ?? 1) > 0 && rbOk(t) && mobWindow(t, lvl) && !b.sel[c].includes(t.id));
        const add = weighted(pool, S0 + "|" + k).slice(0, want - b.sel[c].length).map((t) => t.id);
        if (add.length) { b.sel[c] = [...b.sel[c], ...add]; ch = true; }
      }
      continue;
    }
    for (const t of BTASK_LIST()) if (t.cat === c) { delete b.p[t.id]; delete b.c[t.id]; delete b.roll[t.id]; }
    const pool = BTASK_LIST().filter((t) => t.cat === c && lvl <= (t.maxLvl || 30) && !lockReason(a, t, lvl) && (t.w ?? 1) > 0 && rbOk(t) && mobWindow(t, lvl));
    const n = periodCount(c, S0 + "|" + k);
    const sorted = weighted(pool, S0 + "|" + k);
    const pick: string[] = [], sigs = new Set<string>();
    const fixed = c === "daily" ? String(BOARD_CFG.dailyFixed || "").split(",").map((x) => x.trim()).filter((id) => BTASKS[id]?.cat === "daily" && pool.some((t) => t.id === id)) : [];
    for (const t of sorted) { if (pick.length >= n) break; if (fixed.includes(t.id)) continue; const sig = t.ev + ":" + t.f; if (sigs.has(sig)) continue; sigs.add(sig); pick.push(t.id); } // разнообразие
    for (const t of sorted) { if (pick.length >= n) break; if (!pick.includes(t.id)) pick.push(t.id); }
    b.sel[c] = [...fixed, ...pick]; b.per[c] = k; ch = true;
  }
  // ранги: вариант выпавшего (и у уже выбранных до включения рангов — если ещё не сдано)
  for (const c of PERIODIC) for (const id of b.sel[c] || []) {
    const t = BTASKS[id]; if (!t) continue;
    if (BOARD_CFG.rankOn?.[c] === false) { if (b.roll[id] && !(b.c[id] > 0)) { delete b.roll[id]; ch = true; } continue; }
    if (!b.roll[id] && !(b.c[id] > 0)) { b.roll[id] = makeRoll(t, lvl, S0 + "|" + b.per[c] + "|" + id, b.per[c], heroes, "", owner, lv); ch = true; }
  }
  // заказы охоты на Доске объявлений: новые каждый игровой день; взятые не пропадают. Часть мест — боссам и редким.
  const hk = "h" + periodKey("daily", now);
  if (b.per.hunt !== hk || !Array.isArray(b.sel.hunt)) {
    const pool = weighted(BTASK_LIST().filter((t) => atBoard(t) && t.cat === "hunt" && !isDone(a, t) && !b.tk.includes(t.id) && !lockReason(a, t, lvl) && (t.lvl <= 0 || t.lvl <= lvl + 6) && (t.w ?? 1) > 0 && rbOk(t) && mobWindow(t, lvl)), S0 + "|" + hk);
    const N = Math.max(1, Math.min(30, (BOARD_CFG.huntOffer | 0) || 8)), NB = Math.max(0, Math.min(N, BOARD_CFG.huntBossOffer | 0));
    const big = (t: BTask) => /(^|,)(boss|rare)(,|$)/.test(t.f);
    const pick = pool.filter(big).slice(0, NB);
    for (const t of pool) { if (pick.length >= N) break; if (!pick.includes(t)) pick.push(t); }
    b.sel.hunt = pick.sort((x, y) => x.ord - y.ord).map((t) => t.id); b.per.hunt = hk; ch = true;
    for (const id of Object.keys(b.roll)) if (BTASKS[id]?.cat === "hunt" && !b.tk.includes(id)) delete b.roll[id]; // невзятые заказы — новый бросок
  }
  if (BOARD_CFG.rankOn?.hunt !== false) for (const id of b.sel.hunt || []) { const t = BTASKS[id];
    if (t && !b.roll[id] && !b.tk.includes(id) && !(b.c[id] > 0)) { b.roll[id] = makeRoll(t, lvl, S0 + "|" + b.per.hunt + "|" + id, b.per.hunt, heroes, "", owner, lv); ch = true; } }
  return ch;
}

// ---------------- события ----------------
/** условия по надетому (проклятые, очернение, «без вещей») — ev.wear считает boardEvent */
function wearOk(F: Set<string>, ev: any): boolean {
  if (!(F.has("wearc") || F.has("wearc5") || F.has("dark50") || F.has("naked"))) return true;
  const w = ev.wear || { c: 0, blk: 0, n: 0 };
  if (F.has("wearc") && !(w.c >= 1)) return false;
  if (F.has("wearc5") && !(w.c >= 5)) return false;
  if (F.has("dark50") && !(w.blk >= 50)) return false;
  if (F.has("naked") && w.n > 0) return false;
  return true;
}
/** насколько событие продвигает задание (0 — не подходит); max — прогресс = лучший результат */
function amount(t: BTask, ev: any, lvl: number): { v: number; max?: boolean } {
  const F = flags(t), ty = ev.type, NO = { v: 0 };
  switch (t.ev) {
    case "kill": {
      if (ty !== "kill") return NO;
      const kind = String(ev.kind || ev.mob || "");
      if (t.m) {
        if (t.m.startsWith("biome:")) { if (VARIANT_BY_ID[kind]?.biome !== t.m.slice(6)) return NO; }
        else if (t.m.startsWith("role:")) { if (ZONE_MOBS[kind]?.role !== t.m.slice(5) || ev.boss || ev.rare) return NO; }
        else if (t.m.startsWith("cls:")) { if (ev.cls !== t.m.slice(4)) return NO; }
        else if (!goalMatch(t.m, kind)) return NO;
      }
      if ((t as any).minL && !((ev.lvl || 0) >= (t as any).minL)) return NO; // ранг: враги не ниже уровня, выпавшего при выдаче
      if (F.has("elite") && !ev.elite) return NO;
      if (F.has("cursed") && !ev.cursed) return NO;
      if (!enchOk(F, ev.ench | 0)) return NO;
      if (F.has("ewear6") && !((ev.wear?.e6 || 0) >= 1)) return NO;
      if (F.has("party") && !(ev.party > 1)) return NO;
      if (F.has("solo") && ev.party > 1) return NO;
      if (F.has("rare") && !ev.rare) return NO;
      if (F.has("boss") && !ev.boss) return NO;
      if (F.has("wboss") && !(ev.boss && BOSS_TIMERS[kind])) return NO;
      if (F.has("lvl") && !((ev.lvl || 0) >= lvl - 2)) return NO;
      if (F.has("night") && !ev.night) return NO;
      if (F.has("midnight") && !ev.midnight) return NO;
      if (F.has("hp10") && !(ev.hpPct > 0 && ev.hpPct < 10)) return NO;
      if (F.has("oneshot") && !ev.oneshot) return NO;     // сервер: первый удар игрока по целому мобу и добил (service.ts onMobKilled → zone.ts hb)
      if (F.has("skillonly") && !ev.skillOnly) return NO; // только навыками: ни одной автоатаки по этому мобу
      if (F.has("basiconly") && !ev.basicOnly) return NO; // без навыков: ни одного навыка по этому мобу
      if (!wearOk(F, ev)) return NO;
      return { v: 1 };
    }
    case "gather": return ty === "gather" && (!t.m || ev.res === t.m) ? { v: Math.max(1, Math.min(99, ev.n | 0)) } : NO;
    case "loot": {
      if (ty !== "loot") return NO;
      if (t.m === "bag") return { v: 1 };
      if (t.m === "item") return { v: Math.min(40, ev.items | 0) };
      const res = ev.res || {};
      if (t.m === "res" || !t.m) return { v: Math.min(999, Object.values(res).reduce((s: number, x: any) => s + (x | 0), 0) as number) };
      return { v: Math.min(999, res[t.m] | 0) };
    }
    case "craft": return ty === "craft" && (!t.m || ev.recipe === t.m) ? { v: 1 } : NO;
    case "salvage": {
      if (ty !== "salvage") return NO;
      if (F.size) { const n = (ev.items || []).filter((x: any) => enchOk(F, x?.ench | 0) && (!F.has("cursed") || x?.cursed)).length; return n ? { v: Math.min(200, n) } : NO; }
      return { v: Math.max(1, Math.min(200, ev.n | 0)) };
    }
    case "upgrade": {
      if (ty !== "upgrade" || !enchOk(F, ev.ench | 0) || (F.has("cursed") && !ev.cursed)) return NO;
      return t.m === "max" ? { v: ev.up | 0, max: true } : { v: 1 };
    }
    case "run": {
      if (ty !== "run" || (t.m && ev.room !== t.m)) return NO;
      if (F.has("solo") && (ev.players || 1) > 1) return NO;
      if (F.has("min")) return { v: Math.floor(Math.min(15 * 60, ev.time || 0) / 60) };
      if (t.minT && (ev.time || 0) < t.minT) return NO;
      return { v: 1 };
    }
    case "trial": {
      if (ty !== "trial") return NO;
      if (F.has("solo") && (ev.players || 1) > 1) return NO;
      if (t.m === "full") return { v: ev.waves >= 8 ? 1 : 0 };
      if (t.m === "max") return { v: Math.min(8, ev.waves | 0), max: true };
      return { v: 1 };
    }
    case "duel": return ty === "duel" ? { v: 1 } : NO;
    case "duel_win": {
      if (ty !== "duel_win") return NO;
      if (t.m === "hp50" && !(ev.hpCapPct <= 50)) return NO;
      if (t.m === "hp25" && !(ev.hpCapPct <= 25)) return NO;
      return { v: 1 };
    }
    case "claim": return ty === "board_claim" && ev.cat !== "ach" && ev.cat !== "tut" && (!t.m || ev.cat === t.m) ? { v: 1 } : NO;
    case "quest": return ty === "quest_done" ? { v: 1 } : NO;
    case "ui": return ty === "ui" && ev.name === t.m ? { v: 1 } : NO;
    case "reach": return ty === "reach" && (!t.m || ev.world === t.m) ? { v: 1 } : NO;
    case "ability": return ty === "ability_used" ? { v: 1 } : NO;
    case "lvlup": return ty === "lvlup" ? { v: Math.max(1, Math.min(30, ev.n | 0)) } : NO;
    case "death": return ty === "death" && (!t.m || ev.by === t.m) && wearOk(F, ev) ? { v: 1 } : NO;
    case "pvp": return ty === "pvp" && (t.m !== "win" || ev.win) ? { v: 1 } : NO;
    case "explore": return ty === "explore" ? { v: Math.max(1, Math.min(500, ev.n | 0)) } : NO;
    case "select_hero": case "dash": case "talent": case "equip": case "equip_monster": case "chest": case "portal": case "party":
    case "mark": case "chat": case "friend": case "inspect": case "rating": case "track": case "lock": case "soul": case "radiance": case "loadout": case "pk": case "runskill": case "bm_find": case "revive": case "city":
      return ty === t.ev ? { v: 1 } : NO;
  }
  return NO;
}

/** Событие из потока qev (service.ts). true — доска изменилась. */
export function boardEvent(a: Account, h: Hero | null, ev: any, ctx: Ctx): boolean {
  if (BOARD_CFG.on === false || !ev || typeof ev.type !== "string") return false;
  const b = boardOf(a); const lvl = h?.lvl || 1;
  let ch = false;
  // счётчики для состояний: разные мировые боссы, посещённые миры
  if (ev.type === "kill" && ev.boss && BOSS_TIMERS[ev.kind]) { b.cnt["wb:" + ev.kind] = (b.cnt["wb:" + ev.kind] || 0) + 1; ch = true; }
  if (ev.type === "reach" && ev.world && !b.cnt["w:" + ev.world]) { b.cnt["w:" + ev.world] = 1; ch = true; }
  if ((ev.type === "kill" || ev.type === "death") && h && !ev.wear) { const eq = equippedItems(a, h); ev.wear = { c: eq.filter((e) => e.cursed).length, blk: charBlk(eq), n: eq.length, e6: eq.filter((e: any) => (e.ench | 0) === 6).length }; }
  if (ev.type === "kill" && ev.kind) { const k = "k:" + baseOf(String(ev.kind)); b.cnt[k] = (b.cnt[k] || 0) + 1; ch = true; } // виды и победы — с запуска доски
  if (ev.type === "kill" && ev.midnight === undefined) ev.midnight = kyivHour(Date.now()) === 0;
  if (ev.type === "city") { if (b.cnt.city) return false; b.cnt.city = 1; ch = true; }
  const now = Date.now();
  if (ev.type === "death") for (const R of Object.values(b.roll)) if (!R.done) for (const o of R.bon) if (o.k === "nodeath" && o.ok) { o.ok = 0; ch = true; } // бонус «без смерти» — сорван
  const SEL = selSet(b); // один раз на событие (раньше — на каждое задание)
  for (const t0 of BY_EV.get(ev.type) || []) {
    if (ev.type === "ui" && t0.cat !== "tut") continue; // «ui» присылает клиент — только для шагов обучения
    if (PERIODIC.includes(t0.cat) ? !SEL.has(t0.id) : needsTake(t0) && !b.tk.includes(t0.id)) continue; // быстро: не выпало/не взято (сотни шаблонов пула)
    const t = effOf(b, t0), R = b.roll[t0.id];
    const r = amount(t, ev, lvl); if (!(r.v > 0)) continue;
    if (!counts(a, b, t0, lvl)) continue;
    const tiers = tiersOf(t), cap = tiers[tiers.length - 1], cur = b.p[t.id] || 0;
    const nv = Math.min(cap, r.max ? Math.max(cur, r.v) : cur + r.v);
    if (nv !== cur) { b.p[t.id] = nv; ch = true;
      if (R && !R.done) { bonusOnEvent(R, ev, a.hero || "", lvl, now); if (nv >= cap) bonusOnDone(R, now); } }
  }
  if (crossEvent(a, b, ev, lvl, ctx, now)) ch = true;
  if (ch) b.rev++;
  return ch;
}
/** задания ДРУГИХ тел, условие которых — выполнить на текущем теле (или на любом): прогресс — в их отложенный набор.
 *  Задание остаётся в списке тела-владельца, сдаётся и награждает только его. */
function crossEvent(a: Account, b: BoardState, ev: any, lvl: number, ctx: Ctx, now: number): boolean {
  const cur = a.hero || "", bod = b.bod; if (!cur || !bod) return false;
  let ch = false;
  for (const owner of Object.keys(bod)) {
    if (owner === cur) continue; const S = bod[owner]; if (!S || !objOk(S.sel)) continue;
    const ownerLvl = Math.max(ctx.heroes?.[owner]?.lvl || 0, b.lv[owner] || 0, 1);
    const ids = new Set<string>([...Object.values(S.sel).flat(), ...(S.tk || [])] as string[]);
    for (const id of ids) {
      const t0 = BTASKS[id]; if (!t0 || !t0.on || !catOn(t0.cat)) continue;
      const R = S.roll?.[id]; const rb = reqBody(t0, R); if (rb !== "any" && rb !== cur) continue;
      if (needsTake(t0) && !(S.tk || []).includes(id)) continue;
      if (ev.type === "ui" || lockReason(a, t0, ownerLvl)) continue;
      const t = effOf({ roll: S.roll || {} } as any, t0), tiers = tiersOf(t), cap = tiers[tiers.length - 1];
      if ((S.c[id] || 0) >= tiers.length) continue;
      if (ev.type === "death" && R && !R.done) for (const o of R.bon) if (o.k === "nodeath" && o.ok) { o.ok = 0; ch = true; }
      const r = amount(t, ev, lvl); if (!(r.v > 0)) continue;
      const curP = S.p[id] || 0, nv = Math.min(cap, r.max ? Math.max(curP, r.v) : curP + r.v);
      if (nv !== curP) { S.p[id] = nv; ch = true; if (R && !R.done) { bonusOnEvent(R, ev, cur, lvl, now); if (nv >= cap) bonusOnDone(R, now); } }
    }
  }
  return ch;
}

/** Точка отсчёта «с нуля»: при первом запуске доски для игрока ступени заданий-состояний (уровень, вещи, таланты…),
 *  которые уже были выполнены ДО запуска, закрываются без награды (b.pre — сколько). Счётчики событий начинаются с нуля сами;
 *  победы и виды бестиария считаются с этого момента (b.cnt «k:»), а не из истории аккаунта. Обучение — отдельно (опытный игрок). */
function boardBaseline(a: Account, h: Hero | null, b: BoardState, ctx: Ctx, now: number) {
  b.t0 = now;
  for (const t of BTASK_LIST()) {
    if (t.cat === "tut" || (t.ev !== "st" && t.ev !== "lvl")) continue;
    const v = t.ev === "st" ? stateVal(a, h, t.m, ctx) : stateVal(a, h, "lvl", ctx), tiers = tiersOf(t);
    let n = 0; while (n < tiers.length && v >= tiers[n]) n++;
    if (n > (b.c[t.id] || 0)) { b.pre[t.id] = n - (b.c[t.id] || 0); b.c[t.id] = n; b.p[t.id] = Math.max(b.p[t.id] || 0, Math.min(v, tiers[tiers.length - 1])); }
  }
  b.rev++;
}

/** Пересчёт по состоянию (уровень, таланты, бестиарий…), смена периодов, авто-шаги обучения
 *  и выдача наград за шаги обучения. Возвращает выданные награды (для тоста). */
export function boardRefresh(a: Account, h: Hero | null, ctx: Ctx, now = Date.now()): { changed: boolean; granted: any[]; levelUps: number } {
  const out = { changed: false, granted: [] as any[], levelUps: 0 };
  if (BOARD_CFG.on === false) return out;
  const b = boardOf(a), lvl = h?.lvl || 1, rev0 = b.rev;
  // уровни героев: запоминаем максимум (прирост уровней — событие lvlup)
  if (h && a.hero) { const prev = b.lv[a.hero] || 0; if (h.lvl > prev) { if (prev > 0) boardEvent(a, h, { type: "lvlup", n: h.lvl - prev }, ctx); b.lv[a.hero] = h.lvl; out.changed = true; } }
  for (const [c, hh] of Object.entries(ctx.heroes || {})) if ((hh?.lvl || 0) > 1 && hh.lvl > (b.lv[c] || 0)) { b.lv[c] = hh.lvl; out.changed = true; }
  const top = stateVal(a, h, "lvl", ctx);
  if (!b.t0 && (h || !Object.keys(ctx.heroes || {}).length)) { boardBaseline(a, h, b, ctx, now); out.changed = true; } // без выбранного героя (а герои есть) — ждём героя
  if (rollPeriods(a, b, h ? lvl : top, ctx, now)) out.changed = true; // набор тела — по уровню этого тела
  // опытные игроки: обучение считается пройденным (подсказки шагов не ведут)
  if (!b.tut.vet && !b.tut.skip && top >= (Number(BOARD_CFG.tutVetLvl) || 99) && !(Object.keys(b.c).some((id) => id.startsWith("tut_")))) { b.tut.vet = true; out.changed = true; }
  // …и награды шагов обучения выдаются всё равно (tutVetReward), в том числе тем, кто уже был отмечен опытным без наград.
  // Повторной выдачи нет: полученная ступень записана в b.c (claimTiers пишет её ДО выдачи), такие шаги пропускаются.
  if (h && b.tut.vet && BOARD_CFG.tutVetReward !== false && BOARD_CFG.tutOn !== false) for (const t of BTASK_LIST()) {
    if (t.cat !== "tut" || !t.on || !catOn(t.cat)) continue;
    const tiers = tiersOf(t); if ((b.c[t.id] || 0) >= tiers.length) continue;
    const cap = tiers[tiers.length - 1]; if ((b.p[t.id] || 0) < cap) { b.p[t.id] = cap; out.changed = true; } // шаг засчитан выполненным
    const r = claimTiers(a, h, b, t, ctx); if (r.ok) { r.vet = 1; out.granted.push(r); out.levelUps += r.levelUps || 0; out.changed = true; }
  }
  for (const t of BTASK_LIST()) {
    if (t.ev !== "st" && t.ev !== "lvl" && !t.auto) continue;
    if (!counts(a, b, t, lvl)) continue;
    const tiers = tiersOf(t), cap = tiers[tiers.length - 1];
    let v = t.ev === "st" ? stateVal(a, h, t.m, ctx) : t.ev === "lvl" ? top : 0;
    if (t.auto && autoDone(a, h, t.auto, ctx)) v = cap;
    const cur = b.p[t.id] || 0, nv = Math.min(cap, Math.max(cur, v));
    if (nv !== cur) { b.p[t.id] = nv; out.changed = true; }
  }
  // обучение: награда сразу по выполнении шага (без кнопки), только с выбранным героем
  if (h && tutActive(b)) for (const t of BTASK_LIST()) if (t.cat === "tut" && counts(a, b, t, lvl) && (b.p[t.id] || 0) >= tiersOf(t)[0]) {
    const r = claimTiers(a, h, b, t, ctx); if (r.ok) { out.granted.push(r); out.levelUps += r.levelUps || 0; out.changed = true; }
  }
  if (out.changed && b.rev === rev0) b.rev++;
  return out;
}

// ---------------- награды ----------------
export function bandOf(L: number): number { const B: number[] = BOARD_CFG.bands || [5, 10, 15, 20, 25, 30]; for (let i = 0; i < B.length; i++) if (L <= B[i]) return i; return B.length - 1; }
export function xpPct(L: number, d: number): number { const row = BOARD_CFG.xp?.[bandOf(L)] || []; return Math.max(0, Math.min(100, Number(row[Math.max(0, Math.min(4, (d | 0) - 1))]) || 0)); }
// ── Опыт — фиксированное число от уровня ЗАДАНИЯ (решение Алекса): одно и то же задание даёт одинаковый опыт героям любого уровня ──
const clampL = (x: number) => Math.max(1, Math.min(HERO_MAX_LEVEL, Math.round(x) || 1));
/** уровень задания, если он не задан: от моба/края/босса/забега, иначе — по доступности (минимальный уровень; у широких
 *  периодических «для всех уровней» тоже минимальный: середина диапазона давала новичкам до 86% уровня в день) */
export function guessLvl(t: BTask): number {
  const m = t.m || "", mob = (id: string) => (ZONE_MOBS as any)[id]?.lvl || 0;
  if ((t.ev === "kill" || t.ev === "death") && m) {
    if (mob(m)) return clampL(mob(m));
    if (m.startsWith("biome:")) { const B = (BIOMES as any)[m.slice(6)]; if (B) return clampL((B.lvl[0] + B.lvl[1]) / 2); }
  }
  if (t.ev === "st" && m.startsWith("mob:") && mob(m.slice(4))) return clampL(mob(m.slice(4)));
  if (t.ev === "run") return clampL(Math.max(t.minLvl || 1, m === "abyss" ? 10 : 3));
  return clampL(t.minLvl || 1);
}
/** уровень ступени: лестницы уровня героя («дорасти до N») — сам N; у достижений и тяжёлых ступени открываются позже — +4 уровня за ступень */
export function tierLvl(t: BTask, ti: number): number {
  const base = t.lvl > 0 ? t.lvl : guessLvl(t);
  if (t.ev === "st" && (t.m === "lvl" || t.m.startsWith("hero:"))) return clampL(t.n?.[ti] || base);
  if ((t.cat === "ach" || t.cat === "hard") && ti > 0) return clampL(base + 4 * ti);
  return clampL(base);
}
/** опыт ступени по таблице «уровень × сложность» × множитель раздела (для кнопки «пересчитать» и заполнения при загрузке) */
export function tableXp(t: BTask, ti: number): number {
  const L = tierLvl(t, ti), mul = Number(BOARD_CFG.xpMul?.[t.cat] ?? 1), k = Number.isFinite(mul) ? Math.max(0, mul) : 1;
  return Math.round(heroXpNeed(L) * xpPct(L, t.d?.[ti] || 1) / 100 * k);
}
/** назначить уровень (если 0) и опыт ступеней (если не задан вручную) */
export function prepXp(t: BTask) {
  if (!(t.lvl > 0)) t.lvl = guessLvl(t);
  if (!Array.isArray(t.x)) t.x = [0, 0, 0, 0, 0];
  if (!t.xm) for (let i = 0; i < 5; i++) t.x[i] = i < tiersOf(t).length ? tableXp(t, i) : 0;
}
export function prepAllXp() { for (const t of BTASK_LIST()) prepXp(t); }
/** опыт ступени — сохранённое число (heroLvl не влияет; параметр оставлен для совместимости вызовов) */
export function tierXp(t: BTask, ti: number, _heroLvl?: number): number { const v = Number(t.x?.[ti]); return Number.isFinite(v) && v > 0 ? Math.round(v) : 0; }
/** период потолка опыта категории: день, неделя (еженедельные и тяжёлые) или месяц */
export const capPeriod = (c: Cat): Cat | "" => c === "tut" ? "" : c === "weekly" || c === "hard" ? "weekly" : c === "monthly" ? "monthly" : "daily";
/** потолок опыта категории за её период, опыт (0 — без потолка) */
export const catCap = (c: Cat, heroLvl: number) => { const pct = Number(BOARD_CFG.caps?.[c]) || 0; return pct > 0 && capPeriod(c) ? Math.round(heroXpNeed(Math.min(HERO_MAX_LEVEL, heroLvl)) * pct / 100) : 0; };
export const dayCap = (heroLvl: number) => catCap("daily", heroLvl); // ежедневные: не больше caps.daily % уровня в сутки
const BAG_LIMIT = 120; // как у ремесла (profile.craft)

function claimTiers(a: Account, h: Hero, b: BoardState, t0: BTask, ctx: Ctx): any {
  const R = b.roll[t0.id], t = effOf(b, t0); // выпавший вариант: ранг, количество, опыт (+ выполненные бонусные условия)
  const tiers = tiersOf(t), p = b.p[t.id] || 0; let ti = b.c[t.id] || 0;
  if (ti >= tiers.length) return { ok: false, err: "Награда уже получена" };
  if (p < tiers[ti]) return { ok: false, err: "Задание ещё не выполнено" };
  let last = ti; while (last + 1 < tiers.length && p >= tiers[last + 1]) last++;
  const wantItem = !!(t.item && ITEM_BY_ID[t.item]) && last === tiers.length - 1;
  if (wantItem && (a.inv?.length || 0) >= BAG_LIMIT) return { ok: false, err: "Сумка полна — освободите место для награды" }; // проверка ДО записи ступени
  const wantChest = !!(R && R.r && tierOfRank(R.r)) && (BC_CATS as readonly string[]).includes(t.cat) && last === tiers.length - 1 && BCHEST.on !== false;
  const wantSpec = Array.isArray(t.ch) && t.ch.length > 0 && last === tiers.length - 1 && BCHEST.on !== false;
  const needCh = (wantChest ? 1 : 0) + (wantSpec ? bcSpecCount(t.ch) : 0);
  if (needCh) { const e = chestRoomErr(a, needCh); if (e) return { ok: false, err: e }; } // хранилище сундуков полно — ступень не пишем, награда не пропадает
  const cp = capPeriod(t.cat), ck = cp ? periodKey(cp) : "", cap = catCap(t.cat, h.lvl);
  const xs = (b.xs[t.cat] && b.xs[t.cat].k === ck) ? b.xs[t.cat] : (b.xs[t.cat] = { k: ck, v: 0 });
  const r: any = { ok: true, id: t.id, title: t.title, cat: t.cat, rank: R?.r, bon: R ? R.bon.filter((o) => o.ok && R.done).length : undefined, xp: 0, res: {} as Record<string, number>, tiers: [] as number[], cappedXp: 0, levelUps: 0 };
  for (; ti <= last; ti++) {
    b.c[t.id] = ti + 1; // ступень отмечена ДО выдачи: повтор запроса ничего не даст
    let xp = tierXp(t, ti, h.lvl);
    if (cap > 0) { const left = Math.max(0, cap - xs.v); if (xp > left) { r.cappedXp += xp - left; xp = left; } xs.v += xp; }
    r.xp += xp; r.tiers.push(ti + 1);
    for (const [res, n] of Object.entries(t.res || {})) if (RESOURCES[res] && n > 0) { const q = Math.round(n * (ti + 1)); addRes(a, res, q); r.res[res] = (r.res[res] || 0) + q; }
  }
  if (wantItem) { const it = addItem(a, t.item, "board:" + t.id, a.hero); if (it) r.item = { id: it.id, uid: it.uid }; }
  if (wantChest && a.hero) { const c = grantChest(a, a.hero, R!.r, R!.L, t.cat, "board:" + t.id); if (c) { const [lo, hi] = countOf(t.cat); r.chest = { id: c.id, tier: c.tier, cur: !!c.cur, name: (c.cur ? BCHEST.tiers[c.tier].nameC : BCHEST.tiers[c.tier].name), color: BCHEST.tiers[c.tier].color, L: c.L, lo, hi }; } }
  if (wantSpec && a.hero) { const L = R?.L || t.lvl || h.lvl || 1; // «по уровню задания» — уровень выпавшего ранга, иначе уровень задания, иначе героя (±spread при открытии)
    r.chests = grantSpec(a, a.hero, t.ch!, L, t.cat, "board:" + t.id).map((c) => ({ id: c.id, tier: c.tier, cur: !!c.cur, name: (c.cur ? BCHEST.tiers[c.tier].nameC : BCHEST.tiers[c.tier].name), color: BCHEST.tiers[c.tier].color, L: c.L })); }
  if (r.xp > 0) r.levelUps = gainXp(h, r.xp);
  if ((b.c[t.id] || 0) >= tiers.length) { b.tk = b.tk.filter((x) => x !== t.id); b.pin = b.pin.filter((x) => x !== t.id);
    if (t.cat === "hunt" && R) { delete b.c[t.id]; delete b.p[t.id]; delete b.roll[t.id]; b.sel.hunt = (b.sel.hunt || []).filter((x) => x !== t.id); } } // заказ повторяемый: сдан — снова в пуле (не сегодня)
  b.rev++;
  boardEvent(a, h, { type: "board_claim", cat: t.cat, id: t.id, rank: R?.r }, ctx);
  return r;
}

export function boardClaim(a: Account, h: Hero | null, id: string, ctx: Ctx): any {
  if (BOARD_CFG.on === false) return { ok: false, err: "Доска заданий выключена" };
  if (!h) return { ok: false, err: "Сначала выберите героя на Алтаре" };
  const t = BTASKS[id]; if (!t) return { ok: false, err: "Нет такого задания" };
  if (t.cat === "tut") return { ok: false, err: "Шаги обучения награждаются сами" };
  const b = boardOf(a);
  boardRefresh(a, h, ctx);
  const why = lockReason(a, t, h.lvl); if (why) return { ok: false, err: why };
  if (PERIODIC.includes(t.cat) && !(b.sel[t.cat] || []).includes(t.id)) return { ok: false, err: "Задание сменилось — обновите доску" };
  if (needsTake(t) && !b.tk.includes(t.id)) return { ok: false, err: atBoard(t) ? "Сначала возьмите заказ у Доски объявлений" : `Сначала возьмите задание у персонажа: ${GIVER_NAMES[takeAt(t)] || takeAt(t)}` };
  return claimTiers(a, h, b, t, ctx);
}
export function boardTake(a: Account, h: Hero | null, id: string, on: boolean): any {
  const t = BTASKS[id]; if (!t || !needsTake(t)) return { ok: false, err: "Это задание брать не нужно" };
  const b = boardOf(a), at = takeAt(t), npc = at !== "board";
  const max = npc ? (BOARD_CFG.npcMax | 0) || 8 : (BOARD_CFG.huntMax | 0) || 6;
  const mine = b.tk.filter((x) => BTASKS[x] && (takeAt(BTASKS[x]) === "board") === !npc);
  if (!on) {
    if (!b.tk.includes(id)) return { ok: true };
    b.tk = b.tk.filter((x) => x !== id); b.pin = b.pin.filter((x) => x !== id);
    // сброс только текущей ступени: полученные ступени остаются, прогресс — до последней полученной
    const got = b.c[id] || 0; if (got > 0) b.p[id] = tiersOf(t)[got - 1]; else delete b.p[id];
    b.rev++; return { ok: true, msg: "Задание снято" };
  }
  const why = lockReason(a, t, h?.lvl || 1); if (why) return { ok: false, err: why };
  if (isDone(a, t)) return { ok: false, err: "Уже выполнено" };
  if (b.tk.includes(id)) return { ok: true };
  if (!npc && t.cat === "hunt" && !(b.sel.hunt || []).includes(id)) return { ok: false, err: "Этого заказа сегодня нет на доске" };
  if (mine.length >= max) return { ok: false, err: npc ? `Личных заданий взято ${mine.length} из ${max} — сдайте что-нибудь` : `Взято ${mine.length} из ${max} — сдайте или отмените заказ` };
  b.tk.push(id); if (b.pin.length < pinLimit() && !b.pin.includes(id)) b.pin.push(id); b.rev++;
  return { ok: true, msg: npc ? `Задание принято: ${t.title}` : "Задание взято" };
}
/** сколько заданий можно отслеживать одновременно (админка pinMax, по умолчанию 10) */
export const pinLimit = () => Math.max(1, Math.min(30, (BOARD_CFG.pinMax | 0) || 10));
/** Личные задания персонажа для его диалога: как сюжетные квесты — available / active / complete / done / locked */
export function npcTasks(a: Account, h: Hero | null, npc: string): { id: string; state: string; reason?: string; p: number; n: number; tier: number; tiers: number }[] {
  if (BOARD_CFG.on === false || !NPC_GIVERS.includes(npc)) return [];
  const b = boardOf(a), lvl = h?.lvl || 1, out: any[] = [];
  for (const t of BTASK_LIST()) {
    if (!t.on || !catOn(t.cat) || takeAt(t) !== npc) continue;
    const tiers = tiersOf(t), c = b.c[t.id] || 0, p = b.p[t.id] || 0, per = PERIODIC.includes(t.cat);
    if (per && !(b.sel[t.cat] || []).includes(t.id)) continue; // периодическое — только выпавшее на этот период
    let state = "", reason: string | undefined;
    if (c >= tiers.length) state = "done";
    else if (per || b.tk.includes(t.id)) state = p >= tiers[c] ? "complete" : "active";
    else { const why = lockReason(a, t, lvl); if (why) { state = "locked"; reason = why; } else state = "available"; }
    out.push({ id: t.id, state, reason, p, n: tiers[Math.min(c, tiers.length - 1)], tier: c, tiers: tiers.length });
  }
  return out;
}
/** рядом ли игрок с доской (kind nb — объявлений, ab — достижений); позиции — из админки */
export function nearBoard(kind: "nb" | "ab", world: string, x: number, y: number): boolean {
  const C = BOARD_CFG; return world === C[kind + "World"] && Math.hypot(x - C[kind + "X"], y - C[kind + "Y"]) <= (Number(C[kind + "Range"]) || 110) + 20;
}
export function boardPin(a: Account, id: string, on: boolean): any {
  if (!BTASKS[id]) return { ok: false, err: "Нет такого задания" };
  if (on && BTASKS[id].hidden) return { ok: false, err: "Скрытое достижение нельзя отслеживать" };
  const b = boardOf(a), max = pinLimit();
  b.pin = b.pin.filter((x) => x !== id && BTASKS[x]);
  if (on) { if (b.pin.length >= max) return { ok: false, err: `В трекере не больше ${max} заданий` }; b.pin.push(id); }
  b.rev++; return { ok: true };
}
export function boardTut(a: Account, mode: string): any {
  const b = boardOf(a);
  if (mode === "skip") { if (BOARD_CFG.tutSkip === false) return { ok: false, err: "Пропуск обучения выключен" }; b.tut.skip = true; }
  else if (mode === "off") b.tut.off = true;
  else if (mode === "on") b.tut.off = false;
  else if (mode === "restart") { b.tut.skip = false; b.tut.off = false; } // полученные награды не повторяются: ступени остаются
  else return { ok: false, err: "Неверный режим" };
  b.rev++; return { ok: true };
}

// ---------------- клиенту ----------------
/** определения: раз в сессию и после правок в админке */
/** задание → описание для клиента (скрытое — без текста). Его же использует предпросмотр в админке */
export const btDef = (t: BTask): any => t.hidden ? { id: t.id, cat: t.cat, ord: t.ord, hid: 1, t: "???", h: String(t.hint || "").trim() || undefined, n: tiersOf(t), d: (t.d || []).slice(0, tiersOf(t).length) } : ({ id: t.id, cat: t.cat, ord: t.ord, g: t.giver || undefined, hid: t.hidden || undefined, t: t.hidden ? "???" : t.title, w: t.hidden ? undefined : t.why || undefined, pc: t.pc || undefined, mob: t.mob || undefined, hl: t.hl || undefined,
      ev: t.ev, m: t.m || undefined, f: t.f || undefined, nb: atBoard(t) || undefined, at: takeAt(t) || undefined, take: needsTake(t) || undefined, wt: t.w !== 1 ? t.w : undefined, n: tiersOf(t), d: (t.d || []).slice(0, tiersOf(t).length), lvl: t.lvl || 0, min: t.minLvl, max: t.maxLvl < 30 ? t.maxLvl : undefined, res: Object.keys(t.res || {}).length ? t.res : undefined, item: t.item || undefined, x: (t.x || []).slice(0, tiersOf(t).length) });
export function boardDefs() {
  return {
    v: 1, on: BOARD_CFG.on !== false,
    cats: CATS.filter(catOn), names: CAT_NAMES,
    tasks: BTASK_LIST().filter((t) => t.on && catOn(t.cat)).map(btDef),
    xp: { t: BOARD_CFG.xp, bands: BOARD_CFG.bands, refPlus: BOARD_CFG.refPlus | 0, need: Array.from({ length: HERO_MAX_LEVEL }, (_, i) => heroXpNeed(i + 1)), mul: BOARD_CFG.xpMul, caps: BOARD_CFG.caps },
    givers: GIVER_NAMES,
    props: { nb: { world: BOARD_CFG.nbWorld, x: BOARD_CFG.nbX, y: BOARD_CFG.nbY, r: BOARD_CFG.nbRange }, ab: { world: BOARD_CFG.abWorld, x: BOARD_CFG.abX, y: BOARD_CFG.abY, r: BOARD_CFG.abRange } },
    cfg: { huntMax: BOARD_CFG.huntMax, npcMax: BOARD_CFG.npcMax, huntOffer: BOARD_CFG.huntOffer, pinMax: pinLimit(), trackMax: Math.max(1, Math.min(30, (BOARD_CFG.trackMax | 0) || 10)), bars: { ach: BOARD_CFG.bars?.ach !== false, lib: BOARD_CFG.bars?.lib !== false }, tutSkip: BOARD_CFG.tutSkip !== false, tutOn: BOARD_CFG.tutOn !== false, tutVetReward: BOARD_CFG.tutVetReward !== false, qol: BOARD_CFG.qol },
  };
}
/** состояние игрока: в meta_state, когда меняется rev */
export function boardClient(a: Account, h: Hero | null) {
  const b = boardOf(a), lvl = h?.lvl || 1;
  const lock: Record<string, string> = {};
  for (const t of BTASK_LIST()) if (t.on && catOn(t.cat) && !PERIODIC.includes(t.cat) && t.cat !== "ach" && t.cat !== "tut") { const r = lockReason(a, t, lvl); if (r) lock[t.id] = r; }
  // скрытые: текст — только выполненным (условие игрок не видит до получения). Выполненное раскрывается ВСЕГДА — и закрытое
  // «заранее» (pre: было выполнено до запуска доски, без награды): раньше такие оставались «✔ ???» — непонятно, что сделано.
  // Вместе с текстом — награда ступеней (x — опыт, res — материалы), её показывает строка.
  const reveal: Record<string, { t: string; w: string; x?: number[]; res?: Record<string, number> }> = {};
  for (const t of BTASK_LIST()) if (t.hidden && t.on && ((b.p[t.id] || 0) >= tiersOf(t)[0] || (b.c[t.id] || 0) > 0 || (b.pre[t.id] || 0) > 0))
    reveal[t.id] = { t: t.title, w: t.why, x: (t.x || []).slice(0, tiersOf(t).length), ...(Object.keys(t.res || {}).length ? { res: t.res } : {}) };
  const xs: Record<string, [number, number]> = {};
  for (const c of CATS) { const cp = capPeriod(c); if (!cp) continue; const cap = catCap(c, lvl); if (!cap) continue; const v = b.xs[c]?.k === periodKey(cp) ? b.xs[c].v : 0; xs[c] = [v, cap]; }
  const roll: Record<string, Roll> = {};
  for (const id of new Set([...Object.values(b.sel).flat(), ...b.tk])) if (b.roll[id]) roll[id] = b.roll[id];
  // сундук за задание с рангом (выдаёт claimTiers за последнюю ступень): ярус и шанс проклятого — из BCHEST (админка «🎁 Сундуки наград»,
  // правки D1), клиент сам их не знает. bc[id] = { n: имя, c: цвет, cp: шанс проклятого %, nc: имя проклятого варианта, lo/hi: вещей }
  const bc: Record<string, { n: string; c: string; cp: number; nc: string; lo: number; hi: number }> = {};
  if (BCHEST.on !== false) for (const [id, R] of Object.entries(roll)) { const t = BTASKS[id], tr = R?.r ? tierOfRank(R.r) : null;
    if (!t || !tr || !(BC_CATS as readonly string[]).includes(t.cat)) continue; const T = BCHEST.tiers[tr], [lo, hi] = countOf(t.cat);
    bc[id] = { n: T.name, c: T.color, cp: rankCursePct(R.r), nc: T.nameC, lo, hi }; }
  // награда «Сундуки» из админки (поле ch): для карточки и записки — имя яруса, цвет, уровень, потолок чар, проклятость
  const bx: Record<string, any[]> = {};
  if (BCHEST.on !== false) for (const t of BTASK_LIST()) { if (!t.on || !Array.isArray(t.ch) || !t.ch.length || (t.hidden && !reveal[t.id])) continue;
    bx[t.id] = t.ch.filter((x) => BCHEST.tiers[x.t]).map((x) => { const T = BCHEST.tiers[x.t], cur = x.c === "yes" ? 100 : typeof x.c === "number" ? Math.min(BC_CURSE_MAX, x.c) : 0;
      return { k: x.n, n: cur === 100 ? T.nameC : T.name, c: T.color, nc: T.nameC, L: x.L || 0, L2: x.L2 || 0, e: Number.isInteger(x.e) ? x.e : -1, cp: cur }; }); }
  const bcs = { n: chestsOf(a).list.length, max: Math.max(1, BCHEST.maxStore | 0 || 100) };
  // задания других тел, которые выполняются на текущем: показать в трекере («для Велеса — сдать на Велесе»)
  const xb: any[] = [];
  if (a.hero && b.bod) for (const [o, S] of Object.entries(b.bod)) { if (o === a.hero || !S || !objOk(S.sel)) continue;
    for (const id of new Set<string>([...Object.values(S.sel).flat(), ...(S.tk || [])] as string[])) { const t0 = BTASKS[id], R = S.roll?.[id]; if (!t0 || !t0.on || !catOn(t0.cat)) continue;
      const rb = reqBody(t0, R); if (rb !== a.hero) continue; if (needsTake(t0) && !(S.tk || []).includes(id)) continue;
      const tiers = tiersOf(effOf({ roll: S.roll || {} } as any, t0)); if ((S.c[id] || 0) >= tiers.length) continue;
      xb.push({ id, o, p: S.p[id] || 0, c: S.c[id] || 0, roll: R || undefined }); } }
  return { body: a.hero || "", xb, reveal, roll, bc, bx, bcs, rev: b.rev, p: b.p, c: b.c, tk: b.tk.filter((x) => BTASKS[x]), pin: b.pin.filter((x) => BTASKS[x]), sel: b.sel, lock, reset: nextResets(), xd: xs.daily?.[0] || 0, cap: dayCap(lvl), xs, pre: b.pre, lvl,
    tut: { off: !!b.tut.off, skip: !!b.tut.skip, vet: !!b.tut.vet } };
}

/** нужно ли искать Чёрного мага сегодня (ежедневное выбрано и не выполнено) — сервер проверяет близость раз в 2 с */
export function bmWanted(a: Account): boolean {
  if (!(a as any).board || !BOARD_CFG.on) return false; const b = boardOf(a); // набор текущего тела
  const t = BTASKS["d_bmage"]; if (!t || !t.on) return false;
  return (b.sel?.daily || []).includes("d_bmage") && (b.p?.["d_bmage"] || 0) < 1;
}

/** есть шаг обучения, выполненный, но без награды (выдаёт boardRefresh в meta_state) — тогда шлём полный meta_state */
export function tutPending(a: Account): boolean {
  const b = (a as any).board; if (!b || b.tut?.skip || b.tut?.vet) return false;
  for (const t of BTASK_LIST()) if (t.cat === "tut" && t.on && (b.p[t.id] || 0) >= tiersOf(t)[0] && !(b.c[t.id] > 0)) return true;
  return false;
}

// опыт заданий — числа от уровня задания (после объявления всех таблиц и функций модуля)
prepAllXp();
