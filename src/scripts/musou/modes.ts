// Режимы Тёмного мира из MODE_MIN_LVL и combat.js.
// Пороги по умолчанию — SW_MODES. Админка может сдвинуть число, не имя.

import { SW_MODES } from "./sw-catalog";

export type ModeId = "arena" | "duel" | "horde" | "abyss" | "bossrush" | "purgatory" | "demiurge";

export type ModeSpec = {
  id: ModeId;
  name: string;
  /** Что делает режим в combat.js. */
  rule: string;
  /** Как это легло в ручной бой Орды. */
  orda: string;
  file: string;
  /** Минимальное время зачёта победы, мс. Быстрее — поражение. */
  minMs: number;
};

export const MODE_LIST: ModeSpec[] = [
  {
    id: "arena",
    name: "Арена Испытаний",
    rule: "Таймер 30 секунд, затем подкрепление. Живых не больше шести. Конца нет: круг длится, пока герой жив.",
    orda: "Толпа сама идёт в бой. С восьмой секунды выходит зачарованный генерал. Победа — выстоять 30 секунд.",
    file: "public/shadow-world/js/combat.js",
    minMs: 25_000,
  },
  {
    id: "duel",
    name: "Дуэль 1 на 1",
    rule: "Один Теневой Двойник. Здоровье, урон и защита — от героя, с разбросом 0.9…1.1.",
    orda: "Двойник преследует и бьёт своим приёмом. Здоровье равно здоровью героя. Ярус чар — редкий, с маленьким шансом странного.",
    file: "public/shadow-world/js/combat.js",
    minMs: 4_000,
  },
  {
    id: "horde",
    name: "Орда Бездны",
    rule: "Таймер выживания. Каждые 15 секунд подкрепление, если живых меньше шести. Счёта победы нет.",
    orda: "Волны плотнее арены, твари догоняют. Зачарованный генерал выходит на круг. Победа сессии — выстоять 60 секунд.",
    file: "public/shadow-world/js/combat.js",
    minMs: 55_000,
  },
  {
    id: "abyss",
    name: "Фрактальная Бездна",
    rule: "Этаж героя currentAbyssFloor. Каждый пятый — босс. Множитель 1.35 в степени этажа. После победы этаж растёт. Потолка нет.",
    orda: "Счётчик этажа на герое. Каждый пятый — босс, который преследует. Ярус чар растёт с этажом и упирается в Чёрный. Шаг силы 1.15, потолок ×8.",
    file: "public/shadow-world/js/combat.js",
    minMs: 4_000,
  },
  {
    id: "bossrush",
    name: "Босс-Раш",
    rule: "Все враги с isBoss по порядку данжей. С пятого босса появляются умения. Финал — сферы и золото.",
    orda: "Семнадцать боссов по одному за забег. Каждый преследует и несёт ярус чар: к концу цепи он доходит до Чёрного. Индекс хранится на герое.",
    file: "public/shadow-world/js/combat.js",
    minMs: 4_000,
  },
  {
    id: "purgatory",
    name: "Чистилище",
    rule: "Последний открытый уровнем данж. Урон героя −30%, враги в броне, добыча ×3.",
    orda: "Босс этого данжа одним боем, божественный ярус чар. Урон героя ×0.7, броня цели 30%, три вещи. Добыча может быть младше яруса.",
    file: "public/shadow-world/js/combat.js",
    minMs: 4_000,
  },
  {
    id: "demiurge",
    name: "Рейд: Демиург",
    rule: "Один босс с originDungeonId dungeon_5. Через 45 секунд герой падает. Здоровье max(500000, от героя), множитель элиты 360.",
    orda: "Демиург — чёрный ярус чар, преследует и бьёт приёмом. Здоровье ×8, ярость на 45-й секунде. Редкий плюс Петра не выдумывает седьмой цвет. Полмиллиона и ×360 вне удара.",
    file: "public/shadow-world/js/combat.js",
    minMs: 8_000,
  },
];

export function modeSpec(id: string): ModeSpec | null {
  return MODE_LIST.find((m) => m.id === id) || null;
}

export function modeIndex(id: ModeId) {
  return MODE_LIST.findIndex((m) => m.id === id);
}

export const MODE_FLOOR: Record<ModeId, number> = {
  arena: SW_MODES.arena,
  duel: SW_MODES.duel,
  horde: SW_MODES.horde,
  abyss: SW_MODES.abyss,
  bossrush: SW_MODES.bossrush,
  purgatory: SW_MODES.purgatory,
  demiurge: SW_MODES.demiurge,
};
