// «Проклятые»: доска заданий и достижений (в духе Monster Hunter, без сюжета).
// Только сервер: прогресс копится из потока событий qev (service.ts), награда выдаётся здесь же по запросу
// игрока (board_claim) — один раз на ступень (номер ступени записывается ДО выдачи). Хранение — a.board в JSON
// аккаунта (accounts.data), миграция D1 не нужна. Определения генерируются из данных (мобы, боссы, ресурсы,
// комнаты) по шаблонам и правятся в админке (вид btask), общие настройки — вид board.
// Опыт — строго по таблице «уровень × сложность» (BOARD_CFG.xp, % от опыта на уровень), с дневным потолком.
// Формулы опыта за мобов, регенерация и множитель элиты здесь не трогаются.
import { ZONE_MOBS, MONSTER_LOOT, RESOURCES, RECIPES, ITEM_BY_ID, heroXpNeed, HERO_MAX_LEVEL, HERO_IDS } from "./defs";
import { HERO_NAMES } from "./shared";
import { VARIANTS, VARIANT_BY_ID, BIOMES, baseOf, goalMatch, type BiomeId } from "./biomes";
import { BOSS_TIMERS } from "./zoneGen";
import { gainXp, addRes, addItem, talentSpent, equippedItems, activeLook, type Account, type Hero } from "./profile";
import { charBlk, blkOf } from "./bmCfg";

export type Cat = "tut" | "npc" | "hunt" | "daily" | "weekly" | "monthly" | "hard" | "ach";
export const CATS: Cat[] = ["tut", "npc", "hunt", "daily", "weekly", "monthly", "hard", "ach"];
export const CAT_NAMES: Record<Cat, string> = { tut: "Обучение", npc: "Персонажи", hunt: "Доска охоты", daily: "Ежедневные", weekly: "Еженедельные", monthly: "Ежемесячные", hard: "Тяжёлые", ach: "Достижения" };
/** кто выдаёт: персонаж или «Доска объявлений» (объект в Аринаре; задания с неё берут, отменяют и сдают рядом с ней) */
export const GIVERS = ["", "board", "petr", "kyut", "alzi", "leyr"];
export const GIVER_NAMES: Record<string, string> = { "": "—", board: "Доска объявлений", petr: "Петр", kyut: "Кьют", alzi: "Алзи", leyr: "Лэйр" };
const PERIODIC: Cat[] = ["daily", "weekly", "monthly"];

export interface BTask {
  id: string; cat: Cat; on: boolean; ord: number; giver: string;
  title: string; why: string; pc: string; mob: string; hl: string; // подсказки управления (обучение) и цель подсветки
  ev: string; m: string; f: string; minT: number;                  // событие, цель, условия (через запятую), мин. время забега
  n: number[]; d: number[];                                         // ступени (0 — нет) и сложность ступени 1…5
  lvl: number; minLvl: number; maxLvl: number; req: string;         // уровень цели (для опыта), доступность, предусловия
  res: Record<string, number>; item: string;                        // материалы за ступень (× номер ступени), предмет за последнюю
  auto: string;                                                     // обучение: состояние, при котором шаг засчитан сам
  hidden: boolean;                                                  // скрытое: до выполнения игрок видит «???» (текст не уходит клиенту)
}
export const BOARD_CFG: any = {
  on: true,
  cats: { tut: true, npc: true, hunt: true, daily: true, weekly: true, monthly: true, hard: true, ach: true },
  dailyN: 5, weeklyN: 4, monthlyN: 3, huntMax: 6, pinMax: 3,
  // Доска объявлений — объект на стартовой площади Аринара (не персонаж и не Альказак): заказы с неё берут, отменяют и сдают
  // рядом с ней. Заказы охоты обновляются каждый игровой день (сброс ежедневных); взятые остаются до сдачи или отмены.
  huntOffer: 8, huntBossOffer: 2,
  dailyFixed: "d_bmage",   // ежедневные, которые есть у всех каждый день (сверх dailyN), id через запятую
  nbWorld: "arinar", nbX: 24130, nbY: 24300, nbRange: 110,
  // Доска достижений — у Алтаря тел в хабе (достижения открываются и с неё, и из общего окна)
  abWorld: "hellfire", abX: 720, abY: 590, abRange: 110,
  tz: "Europe/Kyiv", resetHour: 0, weekDay: 1,
  // % от опыта на уровень (heroXpNeed) по полосам уровней и сложности 1…5
  xp: [[3, 6, 10, 16, 25], [2, 4, 7, 12, 20], [2, 4, 7, 12, 20], [1.5, 3, 5, 9, 15], [1, 2, 4, 7, 12], [1, 2, 4, 7, 12]],
  bands: [5, 10, 15, 20, 25, 30],
  refPlus: 2,      // задание с уровнем цели L даёт опыт не выше уровня L + refPlus (низкие задания на высоком уровне — мало)
  capPct: 30,      // потолок опыта доски в сутки, % уровня (не считаются еженедельные, ежемесячные, тяжёлые, обучение)
  tutOn: true, tutVetLvl: 10, tutSkip: true,
  qol: { help: true, lowHp: true, lvlInfo: true, talentNag: true, bmArrow: true, lowHpPct: 30 },
};

// ---------------- генерация ----------------
const T = (o: Partial<BTask> & { id: string; cat: Cat; title: string; ev: string }): BTask => ({
  on: true, ord: 0, giver: "", why: "", pc: "", mob: "", hl: "", m: "", f: "", minT: 0, n: [1, 0, 0, 0, 0], d: [1, 0, 0, 0, 0],
  lvl: 0, minLvl: 1, maxLvl: 30, req: "", res: {}, item: "", auto: "", hidden: false, ...o,
} as BTask);
const pad5 = (a: number[]) => [...a, 0, 0, 0, 0, 0].slice(0, 5); // всегда 5 ячеек: админка правит n.0…n.4 / d.0…d.4
const mobName = (id: string) => ZONE_MOBS[id]?.name || id;
const resName = (r: string) => RESOURCES[r]?.name || r;
const firstMat = (base: string) => (MONSTER_LOOT[base]?.materials || []).map((m) => m.res).find((r) => RESOURCES[r] && r !== "soul_shard") || "soul_shard";
const HUNT_TIERS = [10, 15, 20, 30, 45];
const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
const RARES = ["dew_king", "white_stag", "rust_baron", "cooler_maw", "fallen_star"];
/** исполнитель по смыслу задания: охота — Алзи, ремесло и материалы — Петр, арена и забеги — Кьют, остальное — Лэйр */
const giverOf = (ev: string, f = "") => ev === "kill" ? (f.includes("party") ? "kyut" : "alzi") : ["gather", "craft", "salvage", "upgrade", "loot"].includes(ev) ? "petr" : ["run", "trial", "duel", "duel_win", "party", "dash", "ability"].includes(ev) ? "kyut" : "leyr";
const ROLE_NAMES: Record<string, string> = { swarm: "стайных", melee: "бойцов ближнего боя", charger: "таранящих", ranged: "стрелков", tank: "толстокожих", caster: "колдующих" };

function genTut(): BTask[] {
  const S: [string, string, string, string, string, string, string, number, number, string, string?][] = [
    // id, заголовок, зачем, ПК, телефон, событие, цель, n, уровень шага, подсветка, авто-засчёт
    ["move", "Пройдитесь немного", "Так вы перемещаетесь по миру", "W A S D или стрелки", "Левый джойстик внизу экрана", "ui", "move", 1, 1, "", "lvl:2"],
    ["hero", "Выберите героя у Алтаря", "Без героя нельзя сражаться", "Подойдите к Алтарю и нажмите E", "Подойдите к Алтарю и нажмите ✋", "select_hero", "", 1, 1, "altar", "hero"],
    ["book", "Откройте Книгу героя", "В ней снаряжение, таланты и задания", "Клавиша B (или J — задания)", "Кнопка 📖 сверху", "ui", "book", 1, 1, "btn:book", ""],
    ["board", "Откройте доску заданий", "Охота, ежедневные задания и достижения", "Клавиша U или кнопка 📋 внизу слева", "Кнопка 📋 сверху", "ui", "board", 1, 1, "btn:board", ""],
    ["arinar", "Пройдите в Аринар", "Там водятся Отголоски и лежат ресурсы", "Шагните в портал", "Шагните в портал", "reach", "arinar", 1, 1, "portal_arinar", "world:arinar"],
    ["kill", "Победите 3 Отголосков", "За победы растёт уровень героя", "ЛКМ в сторону врага (удерживайте) или V — автоатака", "Кнопка атаки справа внизу", "kill", "", 3, 1, "mob", "kills:3"],
    ["loot", "Заберите добычу из мешка", "Вещи и материалы падают в мешок у врага", "Клик по мешку или E рядом с ним", "Нажмите на мешок рядом с собой", "loot", "bag", 1, 1, "bag", ""],
    ["ability", "Примените навык", "Навыки сильнее обычной атаки", "Q, G, F или R", "Круглые кнопки навыков справа", "ability", "", 1, 1, "", ""],
    ["dash", "Сделайте рывок", "Рывком уходят от ударов", "Пробел или Shift", "Кнопка рывка справа", "dash", "", 1, 1, "", ""],
    ["equip", "Наденьте найденную вещь", "Снаряжение прибавляет урон и защиту", "Клавиша I (снаряжение) → нажмите на вещь", "📖 → «Снаряжение» → нажмите на вещь", "equip", "", 1, 1, "btn:book", "equipped:1"],
    ["gather", "Соберите ресурс", "Ресурсы нужны для ремесла и улучшений", "Подойдите к цветку или дереву и нажмите E", "Подойдите и нажмите ✋", "gather", "", 1, 1, "node", ""],
    ["map", "Откройте карту", "На ней видно, куда идти", "Клавиша M", "Кнопка 🗺 сверху", "ui", "map", 1, 1, "btn:map", ""],
    ["lvl3", "Дорастите до 3 уровня", "Каждый уровень даёт очко таланта", "Побеждайте Отголосков своего уровня", "Побеждайте Отголосков своего уровня", "lvl", "", 3, 1, "", "lvl:3"],
    ["talent", "Изучите талант", "Таланты усиливают героя навсегда", "Клавиша T (герой) → дерево талантов", "📖 → «Герой» → дерево талантов", "talent", "", 1, 2, "btn:book", "talents:1"],
    ["portal", "Откройте портал домой", "Быстрый путь в хаб и обратно", "Клавиша H", "Кнопка 🌀 (сверху)", "portal", "", 1, 3, "", ""],
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
    ["a02", "alzi", "Элита", "Элитные враги — с рамкой у имени", "kill", "|elite", [3], [2], 3, "npc_a01", { soul_shard: 1 }],
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
    R.push([`d_elite_${s}`, "daily", "Элитная охота", "Элита — с рамкой у имени", "kill", "|elite", Math.round(3 * k), 2, Math.max(3, lo), hi]);
    R.push([`d_gather_${s}`, "daily", "Сборщик", "Любые ресурсы с узлов", "gather", "", Math.round(10 * k), 1, lo, hi, { moonpetal: 2 }]);
    R.push([`d_loot_${s}`, "daily", "Мешки", "Забирайте добычу из мешков", "loot", "bag", Math.round(15 * k), 1, lo, hi]);
    R.push([`w_kill_${s}`, "weekly", "Неделя охоты", "Враги не ниже вашего уровня − 2", "kill", "|lvl", Math.round(400 * k), 3, lo, hi, { soul_shard: 3 }]);
    R.push([`w_elite_${s}`, "weekly", "Неделя элиты", "Элита — с рамкой у имени", "kill", "|elite", Math.round(25 * k), 3, Math.max(3, lo), hi, { soul_shard: 3 }]);
  }
  R.push(
    ["d_dash", "daily", "Ловкость", "Рывок спасает от ударов", "dash", "", 30, 1, 1, 30],
    ["d_ability", "daily", "Навыки в деле", "Применяйте навыки в бою", "ability", "", 40, 1, 1, 30],
    ["d_crypt", "daily", "Склеп: 5 минут", "Минуты в Склепе суммируются", "run", "crypt|min", 5, 2, 3, 30],
    ["d_abyss", "daily", "Бездна: 3 минуты", "Минуты в Бездне суммируются", "run", "abyss|min", 3, 3, 10, 30],
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
    ["w_chest", "weekly", "Пять сундуков", "Сундуки лагерей", "chest", "", 5, 3, 4, 30, { soul_shard: 3 }],
    ["m_chest", "monthly", "Двадцать сундуков", "Сундуки лагерей", "chest", "", 20, 4, 4, 30, { soul_shard: 8 }],
    ["d_bmage", "daily", "Найти Чёрного мага", "Трекер ведёт к нему или его куполу — дойдите", "bm_find", "", 1, 1, 1, 30],
    ["d_explore", "daily", "Разведка", "Откройте 30 клеток карты", "explore", "", 30, 1, 1, 30],
    ["d_res", "daily", "Материалы", "Материалы из мешков", "loot", "res", 30, 1, 1, 30],
    ["w_wboss", "weekly", "Боссы недели", "Мировые боссы", "kill", "|wboss", 3, 4, 8, 30, { soul_shard: 5 }],
    ["w_rare", "weekly", "Редкие недели", "Редкие Отголоски", "kill", "|rare", 3, 4, 8, 30, { soul_shard: 4 }],
    ["w_crypt", "weekly", "Склеп: 30 минут", "Минуты в Склепе суммируются", "run", "crypt|min", 30, 3, 4, 30, { soul_shard: 3 }],
    ["w_abyss", "weekly", "Бездна: 20 минут", "Минуты в Бездне суммируются", "run", "abyss|min", 20, 4, 10, 30, { soul_shard: 4 }],
    ["w_trial", "weekly", "Испытание целиком", "Все 8 волн", "trial", "max", 8, 4, 10, 30, { soul_shard: 4 }],
    ["w_runs", "weekly", "Десять забегов", "Любые забеги", "run", "", 10, 3, 4, 30, { soul_shard: 3 }],
    ["w_duels", "weekly", "Дуэлянт", "Десять дуэлей", "duel", "", 10, 2, 4, 30, { soul_shard: 2 }],
    ["w_duel_win", "weekly", "Пять побед", "Победы в дуэлях", "duel_win", "", 5, 3, 6, 30, { soul_shard: 3 }],
    ["w_gather", "weekly", "Склад Петра", "Любые ресурсы с узлов", "gather", "", 150, 3, 1, 30, { dreamwood: 6 }],
    ["w_loot", "weekly", "Полные мешки", "Материалы из мешков", "loot", "res", 400, 3, 1, 30, { soul_shard: 3 }],
    ["w_salvage", "weekly", "Большой разбор", "Разбор у Петра", "salvage", "", 20, 2, 4, 30, { soul_shard: 3 }],
    ["w_upgrade", "weekly", "Пять улучшений", "Улучшения у Петра", "upgrade", "", 5, 3, 5, 30, { soul_shard: 4 }],
    ["w_craft", "weekly", "Три вещи", "Ремесло у Петра", "craft", "", 3, 3, 4, 30, { moonpetal: 6 }],
    ["w_cursed", "weekly", "Проклятая неделя", "Проклятые враги", "kill", "|cursed", 5, 4, 6, 30, { soul_shard: 4 }],
    ["w_ench", "weekly", "Зачарованная неделя", "Зачарованные враги", "kill", "|ench", 10, 3, 6, 30, { soul_shard: 3 }],
    ["w_party", "weekly", "Отряд недели", "Побеждайте в отряде", "kill", "|party", 200, 3, 5, 30, { soul_shard: 3 }],
    ["w_daily", "weekly", "Пять дней", "Сдайте 5 ежедневных заданий", "claim", "daily", 5, 2, 1, 30, { soul_shard: 2 }],
    ["m_kill", "monthly", "Месяц охоты", "Враги не ниже вашего уровня − 2", "kill", "|lvl", 2500, 4, 1, 30, { soul_shard: 10 }],
    ["m_elite", "monthly", "Месяц элиты", "Элитные враги", "kill", "|elite", 150, 4, 3, 30, { soul_shard: 10 }],
    ["m_wboss", "monthly", "Охотник на боссов", "Мировые боссы", "kill", "|wboss", 15, 5, 8, 30, { soul_shard: 12 }],
    ["m_rare", "monthly", "Следопыт", "Редкие Отголоски", "kill", "|rare", 10, 5, 8, 30, { soul_shard: 10 }],
    ["m_runs", "monthly", "Сорок забегов", "Любые забеги", "run", "", 40, 4, 4, 30, { soul_shard: 8 }],
    ["m_trial", "monthly", "Пять полных Испытаний", "Все 8 волн, пять раз", "trial", "full", 5, 5, 10, 30, { soul_shard: 12 }],
    ["m_duel_win", "monthly", "Двадцать пять побед", "Победы в дуэлях", "duel_win", "", 25, 4, 6, 30, { soul_shard: 8 }],
    ["m_gather", "monthly", "Большой сбор", "Любые ресурсы с узлов", "gather", "", 800, 4, 1, 30, { dreamwood: 20 }],
    ["m_upgrade", "monthly", "Двадцать улучшений", "Улучшения у Петра", "upgrade", "", 20, 4, 5, 30, { soul_shard: 10 }],
    ["m_cursed", "monthly", "Проклятый месяц", "Проклятые враги", "kill", "|cursed", 25, 5, 6, 30, { soul_shard: 12 }],
    ["m_daily", "monthly", "Двадцать дней", "Сдайте 20 ежедневных", "claim", "daily", 20, 3, 1, 30, { soul_shard: 6 }],
    ["m_weekly", "monthly", "Три недели", "Сдайте 3 еженедельных", "claim", "weekly", 3, 3, 1, 30, { soul_shard: 6 }],
    ["m_lvlup", "monthly", "Два уровня", "Поднимите уровень героя дважды", "lvlup", "", 2, 3, 1, 29, { soul_shard: 6 }],
  );
  for (const b of BIOME_IDS) {
    const B = BIOMES[b];
    R.push([`d_${b}`, "daily", `Край: ${B.name}`, `Отголоски края, ур. ${B.lvl[0]}–${B.lvl[1]}`, "kill", "biome:" + b, 30, 2, B.lvl[0], B.lvl[1] + 6]);
    R.push([`d_${b}_elite`, "daily", `Элита: ${B.name}`, "Элита края", "kill", "biome:" + b + "|elite", 3, 2, B.lvl[0], B.lvl[1] + 6]);
    R.push([`w_${b}`, "weekly", `Неделя: ${B.name}`, "Отголоски края", "kill", "biome:" + b, 150, 3, B.lvl[0], B.lvl[1] + 6, { soul_shard: 3 }]);
  }
  for (const r of ["dreamwood", "moonpetal", "rot_ore", "starsilver"]) {
    const lo = r === "rot_ore" ? 7 : r === "starsilver" ? 10 : 1;
    R.push([`d_g_${r}`, "daily", `Сбор: ${resName(r)}`, "Ищите узлы на карте", "gather", r, 8, 1, lo, 30]);
  }
  return R.map((r, i) => { const [m, f] = r[5].split("|"); return T({ id: r[0], cat: r[1], ord: i + 1, giver: giverOf(r[4], f || ""), title: r[2], why: r[3], ev: r[4], m: m || "", f: f || "", n: pad5([r[6]]), d: pad5([r[7]]), minLvl: r[8], maxLvl: r[9], res: r[10] || {} }); });
}

function genHard(): BTask[] {
  const out: BTask[] = [];
  for (const id of Object.keys(BOSS_TIMERS)) {
    const L = ZONE_MOBS[id]?.lvl || 10;
    out.push(T({ id: "hard_solo_" + id, cat: "hard", giver: "alzi", title: `В одиночку: ${mobName(id)}`, why: `Мировой босс ур. ${L} без отряда`, ev: "kill", m: id, f: "boss,solo", n: pad5([1]), d: pad5([5]), lvl: L, minLvl: L, res: { soul_shard: 6 } }));
  }
  for (const id of RARES) {
    const L = ZONE_MOBS[id]?.lvl || 10;
    out.push(T({ id: "hard_rare_" + id, cat: "hard", giver: "leyr", title: `Пять раз в одиночку: ${mobName(id)}`, why: "Редкий Отголосок без отряда", ev: "kill", m: id, f: "rare,solo", n: pad5([5]), d: pad5([5]), lvl: L, minLvl: L, res: { soul_shard: 6 } }));
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
  ];
  for (const h of H) out.push(T({ id: "hard_" + h[0], cat: "hard", giver: giverOf(h[3], h[5]), title: h[1], why: h[2], ev: h[3], m: h[4], f: h[5], n: pad5(h[6]), d: pad5(h[7]), minLvl: h[8], lvl: 0, minT: h[9] || 0, res: { soul_shard: 6 } }));
  return out.map((t, i) => ({ ...t, ord: i + 1 }));
}

function genAch(): BTask[] {
  const out: BTask[] = [];
  const A = (id: string, title: string, why: string, ev: string, m: string, f: string, n: number[], d: number[], lvl = 0, res: Record<string, number> = { soul_shard: 1 }) =>
    out.push(T({ id: "ach_" + id, cat: "ach", title, why, ev, m, f, n: pad5(n), d: pad5(d), lvl, res }));
  const MT = [10, 50, 150, 400, 1000], MD = [1, 1, 2, 2, 3];
  for (const b of [...new Set(VARIANTS.filter((v) => !v.boss).map((v) => v.base))]) A("mob_" + b, `Бестиарий: ${mobName(b)}`, "Победы над этим видом во всех краях", "st", "mob:" + b, "", MT, MD, ZONE_MOBS[b]?.lvl || 0);
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
    ["look", "Облик Отголоска", "Соберите полный трофейный облик", "st", "look", "", [1], [3]],
  );
  for (const r of M) A(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
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
  H("ench6", "Высший ярус", "Вещь с зачарованием 6 яруса", "st", "ench6", "", 1, 5);
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
for (const t of [...genTut(), ...genNpc(), ...genHunt(), ...genPeriodic(), ...genHard(), ...genAch()]) BTASKS[t.id] = t;
export const BTASK_LIST = () => Object.values(BTASKS);
const BY_EV = new Map<string, BTask[]>();
for (const t of BTASK_LIST()) { const k = t.ev === "ability" ? "ability_used" : t.ev === "claim" ? "board_claim" : t.ev === "quest" ? "quest_done" : t.ev; (BY_EV.get(k) || BY_EV.set(k, []).get(k)!).push(t); }
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
  per: Record<string, string>; sel: Record<string, string[]>; xd: { k: string; v: number };
  tut: { off?: boolean; skip?: boolean; vet?: boolean }; lv: Record<string, number>; cnt: Record<string, number>;
}
export function boardOf(a: Account): BoardState {
  const A = a as any;
  if (!A.board || typeof A.board !== "object" || Array.isArray(A.board)) A.board = {};
  const b = A.board;
  b.v = 1; b.rev = b.rev | 0;
  for (const k of ["p", "c", "per", "sel", "tut", "lv", "cnt"]) if (!b[k] || typeof b[k] !== "object" || Array.isArray(b[k])) b[k] = {};
  b.tk = Array.isArray(b.tk) ? b.tk.filter((x: any) => typeof x === "string") : []; b.pin = Array.isArray(b.pin) ? b.pin.filter((x: any) => typeof x === "string") : [];
  if (!b.xd || typeof b.xd !== "object") b.xd = { k: "", v: 0 };
  return b;
}
export const tiersOf = (t: BTask) => { const out: number[] = []; for (const x of t.n || []) { if (!(x > 0)) break; if (out.length && x <= out[out.length - 1]) break; out.push(x); } return out.length ? out : [1]; };
const FLAGS = new Map<string, Set<string>>();
const flags = (t: BTask) => { let s = FLAGS.get(t.f || ""); if (!s) { s = new Set((t.f || "").split(",").map((x) => x.trim()).filter(Boolean)); FLAGS.set(t.f || "", s); } return s; };
const catOn = (c: Cat) => BOARD_CFG.on !== false && BOARD_CFG.cats?.[c] !== false;
export interface Ctx { pkey: string; heroes?: Record<string, Hero> }

function stateVal(a: Account, h: Hero | null, key: string, ctx: Ctx): number {
  const b = boardOf(a);
  if (key === "lvl") return Math.max(h?.lvl || 0, ...Object.values(ctx.heroes || {}).map((x) => x?.lvl || 0), ...Object.values(b.lv));
  if (key === "hero") return a.hero ? 1 : 0;
  if (key === "talents") return h ? talentSpent(h) : 0;
  if (key === "equipped") return h ? Object.values(h.equip || {}).filter(Boolean).length : 0;
  if (key === "bestiary") return Object.values(a.bestiary || {}).filter((x) => x.kills > 0).length;
  if (key === "items") return Object.keys(a.disc?.items || {}).length;
  if (key === "kills") return Object.values(a.bestiary || {}).reduce((s, x) => s + (x.kills || 0), 0);
  if (key === "heroes15") return HERO_IDS.filter((c) => Math.max(ctx.heroes?.[c]?.lvl || 0, b.lv[c] || 0) >= 15).length;
  if (key === "wbosses") return Object.keys(BOSS_TIMERS).filter((id) => (b.cnt["wb:" + id] || 0) > 0).length;
  if (key === "cursed_own") return (a.inv || []).filter((i: any) => i.cursed).length;
  if (key === "bag_full") return (a.inv?.length || 0) >= 120 ? 1 : 0;
  if (key === "ench6") return (a.inv || []).some((i: any) => (i.ench | 0) >= 6) ? 1 : 0;
  if (key === "cursed_black") return (a.inv || []).some((i: any) => i.cursed && blkOf(i) >= 80 && (ITEM_BY_ID[i.id]?.lvl || 0) >= 15) ? 1 : 0;
  if (key === "cursed_ench") return (a.inv || []).some((i: any) => i.cursed && (i.ench | 0) >= 3) ? 1 : 0;
  if (key === "cursed_upg") return (a.inv || []).some((i: any) => i.cursed && (i.up | 0) >= 5) ? 1 : 0;
  if (key === "blk_item") return Math.floor(Math.max(0, ...(a.inv || []).map((i: any) => blkOf(i))));
  if (key === "cursed_eq" || key === "blk_char" || key === "ench_eq" || key === "look") {
    if (!h) return 0; const eq = equippedItems(a, h);
    if (key === "cursed_eq") return eq.filter((e) => e.cursed).length;
    if (key === "ench_eq") return eq.filter((e) => (e.ench | 0) > 0).length;
    if (key === "look") return activeLook(a, h) ? 1 : 0;
    return Math.floor(charBlk(eq));
  }
  if (key.startsWith("mob:")) return a.bestiary?.[key.slice(4)]?.kills || 0;
  if (key.startsWith("hero:")) { const c = key.slice(5); return Math.max(ctx.heroes?.[c]?.lvl || 0, b.lv[c] || 0, h && a.hero === c ? h.lvl : 0); }
  if (key.startsWith("world:")) return b.cnt["w:" + key.slice(6)] ? 1 : 0;
  return 0;
}
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
export const isDone = (a: Account, t: BTask) => (boardOf(a).c[t.id] || 0) >= tiersOf(t).length;
/** заказ: задание с Доски объявлений, которое берут у доски (периодические, обучение и достижения не берутся) */
export const needsTake = (t: BTask) => t.cat === "hunt" || (t.giver === "board" && !PERIODIC.includes(t.cat) && t.cat !== "ach" && t.cat !== "tut");
/** сдаётся только у Доски объявлений */
export const atBoard = (t: BTask) => t.giver === "board" && t.cat !== "ach" && t.cat !== "tut";
const tutActive = (b: BoardState) => BOARD_CFG.tutOn !== false && !b.tut.off && !b.tut.skip && !b.tut.vet;
/** копит ли задание прогресс сейчас */
function counts(a: Account, b: BoardState, t: BTask, lvl: number): boolean {
  if (isDone(a, t) || lockReason(a, t, lvl)) return false;
  if (needsTake(t)) return b.tk.includes(t.id);
  if (PERIODIC.includes(t.cat)) return (b.sel[t.cat] || []).includes(t.id);
  if (t.cat === "tut") return tutActive(b);
  return true;
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** смена периода: обнулить прогресс задач периода и выбрать новые (детерминированно: игрок + период) */
function rollPeriods(a: Account, b: BoardState, lvl: number, ctx: Ctx, now: number): boolean {
  let ch = false;
  for (const c of PERIODIC) {
    const k = periodKey(c, now);
    if (b.per[c] === k && Array.isArray(b.sel[c])) continue;
    for (const t of BTASK_LIST()) if (t.cat === c) { delete b.p[t.id]; delete b.c[t.id]; }
    const pool = BTASK_LIST().filter((t) => t.cat === c && lvl <= (t.maxLvl || 30) && !lockReason(a, t, lvl));
    const n = Math.max(0, Math.min(12, (BOARD_CFG[c === "daily" ? "dailyN" : c === "weekly" ? "weeklyN" : "monthlyN"] | 0)));
    const sorted = pool.map((t) => ({ t, h: hash(ctx.pkey + "|" + k + "|" + t.id) })).sort((x, y) => x.h - y.h).map((x) => x.t);
    const pick: string[] = [], sigs = new Set<string>();
    const fixed = c === "daily" ? String(BOARD_CFG.dailyFixed || "").split(",").map((x) => x.trim()).filter((id) => BTASKS[id]?.cat === "daily" && pool.some((t) => t.id === id)) : [];
    for (const t of sorted) { if (pick.length >= n) break; if (fixed.includes(t.id)) continue; const sig = t.ev + ":" + t.f; if (sigs.has(sig)) continue; sigs.add(sig); pick.push(t.id); } // разнообразие
    for (const t of sorted) { if (pick.length >= n) break; if (!pick.includes(t.id)) pick.push(t.id); }
    b.sel[c] = [...fixed, ...pick]; b.per[c] = k; ch = true;
  }
  // заказы охоты на Доске объявлений: новые каждый игровой день; взятые не пропадают. Часть мест — боссам и редким.
  const hk = "h" + periodKey("daily", now);
  if (b.per.hunt !== hk || !Array.isArray(b.sel.hunt)) {
    const pool = BTASK_LIST().filter((t) => t.cat === "hunt" && !isDone(a, t) && !b.tk.includes(t.id) && !lockReason(a, t, lvl) && (t.lvl <= 0 || t.lvl <= lvl + 6))
      .map((t) => ({ t, h: hash(ctx.pkey + "|" + hk + "|" + t.id) })).sort((x, y) => x.h - y.h).map((x) => x.t);
    const N = Math.max(1, Math.min(30, (BOARD_CFG.huntOffer | 0) || 8)), NB = Math.max(0, Math.min(N, BOARD_CFG.huntBossOffer | 0));
    const big = (t: BTask) => /(^|,)(boss|rare)(,|$)/.test(t.f);
    const pick = pool.filter(big).slice(0, NB);
    for (const t of pool) { if (pick.length >= N) break; if (!pick.includes(t)) pick.push(t); }
    b.sel.hunt = pick.sort((x, y) => x.ord - y.ord).map((t) => t.id); b.per.hunt = hk; ch = true;
  }
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
      if (F.has("elite") && !ev.elite) return NO;
      if (F.has("cursed") && !ev.cursed) return NO;
      if (F.has("ench") && !(ev.ench > 0)) return NO;
      if (F.has("party") && !(ev.party > 1)) return NO;
      if (F.has("solo") && ev.party > 1) return NO;
      if (F.has("rare") && !ev.rare) return NO;
      if (F.has("boss") && !ev.boss) return NO;
      if (F.has("wboss") && !(ev.boss && BOSS_TIMERS[kind])) return NO;
      if (F.has("lvl") && !((ev.lvl || 0) >= lvl - 2)) return NO;
      if (F.has("night") && !ev.night) return NO;
      if (F.has("midnight") && !ev.midnight) return NO;
      if (F.has("hp10") && !(ev.hpPct > 0 && ev.hpPct < 10)) return NO;
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
    case "salvage": return ty === "salvage" ? { v: Math.max(1, Math.min(200, ev.n | 0)) } : NO;
    case "upgrade": return ty === "upgrade" ? (t.m === "max" ? { v: ev.up | 0, max: true } : { v: 1 }) : NO;
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
  if ((ev.type === "kill" || ev.type === "death") && h && !ev.wear) { const eq = equippedItems(a, h); ev.wear = { c: eq.filter((e) => e.cursed).length, blk: charBlk(eq), n: eq.length }; }
  if (ev.type === "kill" && ev.midnight === undefined) ev.midnight = kyivHour(Date.now()) === 0;
  if (ev.type === "city") { if (b.cnt.city) return false; b.cnt.city = 1; ch = true; }
  for (const t of BY_EV.get(ev.type) || []) {
    if (ev.type === "ui" && t.cat !== "tut") continue; // «ui» присылает клиент — только для шагов обучения
    const r = amount(t, ev, lvl); if (!(r.v > 0)) continue;
    if (!counts(a, b, t, lvl)) continue;
    const tiers = tiersOf(t), cap = tiers[tiers.length - 1], cur = b.p[t.id] || 0;
    const nv = Math.min(cap, r.max ? Math.max(cur, r.v) : cur + r.v);
    if (nv !== cur) { b.p[t.id] = nv; ch = true; }
  }
  if (ch) b.rev++;
  return ch;
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
  if (rollPeriods(a, b, Math.max(lvl, top), ctx, now)) out.changed = true;
  // опытные игроки: обучение считается пройденным, без наград
  if (!b.tut.vet && !b.tut.skip && top >= (Number(BOARD_CFG.tutVetLvl) || 99) && !(Object.keys(b.c).some((id) => id.startsWith("tut_")))) { b.tut.vet = true; out.changed = true; }
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
export function refLvl(t: BTask, heroLvl: number): number { return t.lvl > 0 ? Math.max(1, Math.min(heroLvl, t.lvl + (BOARD_CFG.refPlus | 0))) : heroLvl; }
export function tierXp(t: BTask, ti: number, heroLvl: number): number {
  const L = Math.min(HERO_MAX_LEVEL, refLvl(t, heroLvl));
  return Math.round(heroXpNeed(L) * xpPct(L, t.d?.[ti] || 1) / 100);
}
const capped = (t: BTask) => !["weekly", "monthly", "hard", "tut"].includes(t.cat);
export const dayCap = (heroLvl: number) => Math.round(heroXpNeed(Math.min(HERO_MAX_LEVEL, heroLvl)) * (Number(BOARD_CFG.capPct) || 0) / 100);
const BAG_LIMIT = 120; // как у ремесла (profile.craft)

function claimTiers(a: Account, h: Hero, b: BoardState, t: BTask, ctx: Ctx): any {
  const tiers = tiersOf(t), p = b.p[t.id] || 0; let ti = b.c[t.id] || 0;
  if (ti >= tiers.length) return { ok: false, err: "Награда уже получена" };
  if (p < tiers[ti]) return { ok: false, err: "Задание ещё не выполнено" };
  let last = ti; while (last + 1 < tiers.length && p >= tiers[last + 1]) last++;
  const wantItem = !!(t.item && ITEM_BY_ID[t.item]) && last === tiers.length - 1;
  if (wantItem && (a.inv?.length || 0) >= BAG_LIMIT) return { ok: false, err: "Сумка полна — освободите место для награды" }; // проверка ДО записи ступени
  const dk = periodKey("daily"); if (b.xd.k !== dk) b.xd = { k: dk, v: 0 };
  const r: any = { ok: true, id: t.id, title: t.title, cat: t.cat, xp: 0, res: {} as Record<string, number>, tiers: [] as number[], cappedXp: 0, levelUps: 0 };
  for (; ti <= last; ti++) {
    b.c[t.id] = ti + 1; // ступень отмечена ДО выдачи: повтор запроса ничего не даст
    let xp = tierXp(t, ti, h.lvl);
    if (capped(t)) { const left = Math.max(0, dayCap(h.lvl) - b.xd.v); if (xp > left) { r.cappedXp += xp - left; xp = left; } b.xd.v += xp; }
    r.xp += xp; r.tiers.push(ti + 1);
    for (const [res, n] of Object.entries(t.res || {})) if (RESOURCES[res] && n > 0) { const q = Math.round(n * (ti + 1)); addRes(a, res, q); r.res[res] = (r.res[res] || 0) + q; }
  }
  if (wantItem) { const it = addItem(a, t.item, "board:" + t.id, a.hero); if (it) r.item = { id: it.id, uid: it.uid }; }
  if (r.xp > 0) r.levelUps = gainXp(h, r.xp);
  if ((b.c[t.id] || 0) >= tiers.length) { b.tk = b.tk.filter((x) => x !== t.id); b.pin = b.pin.filter((x) => x !== t.id); }
  b.rev++;
  boardEvent(a, h, { type: "board_claim", cat: t.cat, id: t.id }, ctx);
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
  if (needsTake(t) && !b.tk.includes(t.id)) return { ok: false, err: "Сначала возьмите заказ у Доски объявлений" };
  return claimTiers(a, h, b, t, ctx);
}
export function boardTake(a: Account, h: Hero | null, id: string, on: boolean): any {
  const t = BTASKS[id]; if (!t || !needsTake(t)) return { ok: false, err: "Это задание брать не нужно" };
  const b = boardOf(a), max = (BOARD_CFG.huntMax | 0) || 6;
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
  if (t.cat === "hunt" && !(b.sel.hunt || []).includes(id)) return { ok: false, err: "Этого заказа сегодня нет на доске" };
  if (b.tk.length >= max) return { ok: false, err: `Взято ${b.tk.length} из ${max} — сдайте или отмените заказ` };
  b.tk.push(id); if (b.pin.length < ((BOARD_CFG.pinMax | 0) || 3) && !b.pin.includes(id)) b.pin.push(id); b.rev++;
  return { ok: true, msg: "Задание взято" };
}
/** рядом ли игрок с доской (kind nb — объявлений, ab — достижений); позиции — из админки */
export function nearBoard(kind: "nb" | "ab", world: string, x: number, y: number): boolean {
  const C = BOARD_CFG; return world === C[kind + "World"] && Math.hypot(x - C[kind + "X"], y - C[kind + "Y"]) <= (Number(C[kind + "Range"]) || 110) + 20;
}
export function boardPin(a: Account, id: string, on: boolean): any {
  if (!BTASKS[id]) return { ok: false, err: "Нет такого задания" };
  if (on && BTASKS[id].hidden) return { ok: false, err: "Скрытое достижение нельзя отслеживать" };
  const b = boardOf(a), max = (BOARD_CFG.pinMax | 0) || 3;
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
export function boardDefs() {
  return {
    v: 1, on: BOARD_CFG.on !== false,
    cats: CATS.filter(catOn), names: CAT_NAMES,
    tasks: BTASK_LIST().filter((t) => t.on && catOn(t.cat)).map((t) => t.hidden ? { id: t.id, cat: t.cat, ord: t.ord, hid: 1, t: "???", n: tiersOf(t), d: (t.d || []).slice(0, tiersOf(t).length) } : ({ id: t.id, cat: t.cat, ord: t.ord, g: t.giver || undefined, hid: t.hidden || undefined, t: t.hidden ? "???" : t.title, w: t.hidden ? undefined : t.why || undefined, pc: t.pc || undefined, mob: t.mob || undefined, hl: t.hl || undefined,
      ev: t.ev, m: t.m || undefined, f: t.f || undefined, nb: atBoard(t) || undefined, take: needsTake(t) || undefined, n: tiersOf(t), d: (t.d || []).slice(0, tiersOf(t).length), lvl: t.lvl || 0, min: t.minLvl, max: t.maxLvl < 30 ? t.maxLvl : undefined, res: Object.keys(t.res || {}).length ? t.res : undefined, item: t.item || undefined })),
    xp: { t: BOARD_CFG.xp, bands: BOARD_CFG.bands, refPlus: BOARD_CFG.refPlus | 0, need: Array.from({ length: HERO_MAX_LEVEL }, (_, i) => heroXpNeed(i + 1)), capPct: BOARD_CFG.capPct, capCats: ["npc", "hunt", "daily", "ach"] },
    givers: GIVER_NAMES,
    props: { nb: { world: BOARD_CFG.nbWorld, x: BOARD_CFG.nbX, y: BOARD_CFG.nbY, r: BOARD_CFG.nbRange }, ab: { world: BOARD_CFG.abWorld, x: BOARD_CFG.abX, y: BOARD_CFG.abY, r: BOARD_CFG.abRange } },
    cfg: { huntMax: BOARD_CFG.huntMax, huntOffer: BOARD_CFG.huntOffer, pinMax: BOARD_CFG.pinMax, tutSkip: BOARD_CFG.tutSkip !== false, tutOn: BOARD_CFG.tutOn !== false, qol: BOARD_CFG.qol },
  };
}
/** состояние игрока: в meta_state, когда меняется rev */
export function boardClient(a: Account, h: Hero | null) {
  const b = boardOf(a), lvl = h?.lvl || 1;
  const lock: Record<string, string> = {};
  for (const t of BTASK_LIST()) if (t.on && catOn(t.cat) && !PERIODIC.includes(t.cat) && t.cat !== "ach" && t.cat !== "tut") { const r = lockReason(a, t, lvl); if (r) lock[t.id] = r; }
  const dk = periodKey("daily");
  // скрытые: текст — только выполненным (условие игрок не видит до получения)
  const reveal: Record<string, { t: string; w: string }> = {};
  for (const t of BTASK_LIST()) if (t.hidden && t.on && (b.p[t.id] || 0) >= tiersOf(t)[0]) reveal[t.id] = { t: t.title, w: t.why };
  return { reveal, rev: b.rev, p: b.p, c: b.c, tk: b.tk, pin: b.pin, sel: b.sel, lock, reset: nextResets(), xd: b.xd.k === dk ? b.xd.v : 0, cap: dayCap(lvl), lvl,
    tut: { off: !!b.tut.off, skip: !!b.tut.skip, vet: !!b.tut.vet } };
}

/** нужно ли искать Чёрного мага сегодня (ежедневное выбрано и не выполнено) — сервер проверяет близость раз в 2 с */
export function bmWanted(a: Account): boolean {
  const b = (a as any).board; if (!b || !BOARD_CFG.on) return false;
  const t = BTASKS["d_bmage"]; if (!t || !t.on) return false;
  return (b.sel?.daily || []).includes("d_bmage") && (b.p?.["d_bmage"] || 0) < 1;
}

/** есть шаг обучения, выполненный, но без награды (выдаёт boardRefresh в meta_state) — тогда шлём полный meta_state */
export function tutPending(a: Account): boolean {
  const b = (a as any).board; if (!b || b.tut?.skip || b.tut?.vet) return false;
  for (const t of BTASK_LIST()) if (t.cat === "tut" && t.on && (b.p[t.id] || 0) >= tiersOf(t)[0] && !(b.c[t.id] > 0)) return true;
  return false;
}
