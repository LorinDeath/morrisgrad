// Сценарии именных боссов и генералов.
// В файлах данжей Тёмного мира у врага есть имя, роль и описание, но нет скрипта приёма.
// Здесь у каждого из 17 данжей свой порядок телеграфов. Цифра здоровья этот порядок не заменяет.
// pull — притягивает, пока круг ещё не ударил: рывок выносит из зоны.
// bite — короткий конус и лечение босса долей нанесённого.
// slow — круг, который замедляет шаг. Остальные формы — те же, что уже читает удар.

export type Move = "line" | "circle" | "cone" | "curse" | "summon" | "pull" | "bite" | "slow";
export type CastShape = "line" | "circle" | "cone" | "curse" | "summon";

export type CastScript = {
  id: string;
  who: string;
  tell: string[];
  moves: Move[];
};

const SHAPE: Record<Move, CastShape> = {
  line: "line", circle: "circle", cone: "cone", curse: "curse", summon: "summon",
  pull: "circle", bite: "cone", slow: "circle",
};

const RADIUS: Record<Move, number> = {
  line: 168, circle: 118, cone: 168, curse: 118, summon: 96,
  pull: 78, bite: 112, slow: 150,
};

/** Босс данжа 1…17. Порядок — порядок файлов `01`…`17`. */
export const BOSS_SCRIPTS: CastScript[] = [
  { id: "b_shadow_guard", who: "Теневой Страж", tell: ["копьё", "щит"], moves: ["line", "cone"] },
  { id: "b_marauder_ataman", who: "Атаман Мародёров", tell: ["шайка", "замах"], moves: ["summon", "cone"] },
  { id: "b_crystal_queen", who: "Кристальная Владычица", tell: ["осколки", "луч"], moves: ["circle", "line"] },
  { id: "b_black_reaper", who: "Чёрный Жнец", tell: ["коса", "метка"], moves: ["cone", "curse"] },
  { id: "b_raiden", who: "Повелитель Бурь Райдзин", tell: ["молния", "кольцо бури"], moves: ["line", "circle"] },
  { id: "b_thanatos", who: "Владыка Забвения Танатос", tell: ["зов душ", "забвение"], moves: ["pull", "curse"] },
  { id: "b_surtur", who: "Владыка Хаоса Суртур", tell: ["пламя", "призыв"], moves: ["circle", "summon"] },
  { id: "b_leviathan", who: "Кракеноподобный Левиафан", tell: ["прилив", "клешня"], moves: ["pull", "cone"] },
  { id: "b_distortion", who: "Творец Искажения", tell: ["разрыв", "вязкость"], moves: ["line", "slow"] },
  { id: "b_azathoth", who: "Ходок Бездны Азатот", tell: ["тьма", "шёпот"], moves: ["circle", "curse"] },
  { id: "b_carmilla", who: "Королева Кармилла", tell: ["укус", "веер"], moves: ["bite", "cone"] },
  { id: "b_pontiff", who: "Призрачный Понтифик", tell: ["хорал", "метка", "прихожане"], moves: ["circle", "curse", "summon"] },
  { id: "b_atlas", who: "Титан Атлас", tell: ["обрушение", "кольцо"], moves: ["cone", "circle"] },
  { id: "b_celestia", who: "Демиург Селестия", tell: ["луч звезды", "венец", "кольцо"], moves: ["line", "cone", "circle"] },
  { id: "b_entropy", who: "Владыка Энтропия", tell: ["замедление", "распад"], moves: ["slow", "curse"] },
  { id: "b_chronos_prime", who: "Хронос Прайм", tell: ["стоп-кадр", "секунда"], moves: ["slow", "line"] },
  { id: "b_architect", who: "Архитектор Бытия", tell: ["чертёж", "круг", "луч", "слово"], moves: ["summon", "circle", "line", "curse"] },
];

/** Генерал того же данжа. Первый приём не совпадает с первым приёмом босса. */
export const GENERAL_SCRIPTS: CastScript[] = [
  { id: "g_castle", who: "Страж подвала", tell: ["строй", "манекены"], moves: ["circle", "summon"] },
  { id: "g_road", who: "Дозор тракта", tell: ["залп", "шайка"], moves: ["line", "summon"] },
  { id: "g_crystal", who: "Кристальный дозор", tell: ["осколок", "холод"], moves: ["cone", "slow"] },
  { id: "g_sorrow", who: "Жнец скорби", tell: ["жало", "разрез"], moves: ["curse", "line"] },
  { id: "g_storm", who: "Страж Трона", tell: ["разряд", "копьё бури"], moves: ["cone", "line"] },
  { id: "g_soul", who: "Страж лабиринта", tell: ["кольцо душ", "воронка"], moves: ["circle", "pull"] },
  { id: "g_chaos", who: "Искровой генерал", tell: ["искра", "веер огня"], moves: ["summon", "cone"] },
  { id: "g_abyss", who: "Жрец прилива", tell: ["глубина", "прилив"], moves: ["slow", "pull"] },
  { id: "g_rift", who: "Искажённый страж", tell: ["петля", "вязкость"], moves: ["circle", "slow"] },
  { id: "g_void", who: "Страж разлома", tell: ["шёпот", "клешня"], moves: ["curse", "cone"] },
  { id: "g_blood", who: "Кровавый двор", tell: ["двор", "укус"], moves: ["summon", "bite"] },
  { id: "g_choir", who: "Призрачный хор", tell: ["хор", "метка"], moves: ["summon", "curse"] },
  { id: "g_titan", who: "Страж колыбели", tell: ["удар", "обрушение"], moves: ["circle", "cone"] },
  { id: "g_star", who: "Звёздный страж", tell: ["венец", "зов"], moves: ["cone", "pull"] },
  { id: "g_entropy", who: "Страж небытия", tell: ["распад", "время"], moves: ["curse", "slow"] },
  { id: "g_chrono", who: "Страж секунды", tell: ["секунда", "стоп"], moves: ["line", "slow"] },
  { id: "g_null", who: "Страж нуля", tell: ["чертёж", "слуги", "слово"], moves: ["circle", "summon", "curse"] },
];

export function castScript(dungeon: number, kind: "boss" | "general"): CastScript {
  const table = kind === "boss" ? BOSS_SCRIPTS : GENERAL_SCRIPTS;
  const i = Math.max(0, Math.min(table.length - 1, (dungeon | 0) - 1));
  return table[i];
}

export function castOf(dungeon: number, kind: "boss" | "general", pattern: number, tier = 0) {
  const row = castScript(dungeon, kind);
  const i = Math.max(0, pattern | 0) % row.moves.length;
  let move = row.moves[i];
  let tell = row.tell[i % row.tell.length];
  if ((tier | 0) >= 6 && (pattern | 0) % 4 === 3) {
    move = "curse";
    tell = "чёрный след";
  }
  return { move, shape: SHAPE[move], tell, r: move === "circle" && kind === "boss" ? 118 : RADIUS[move], who: row.who };
}
