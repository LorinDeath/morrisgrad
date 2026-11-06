// Окружение и схема этажа. Плитка одна и та же из атласа, свет и реквизит — от данжа.
// Схема боя, которая есть в файле, названа здесь и применяется в симуляторе.

export type Craft = {
  env: string;
  rule: string;
  source: string;
  /** Насколько тёмная чёрная клетка. Ниже — плитка читается. */
  dark: number;
  /** Насколько цвет данжа лежит на светлой клетке. */
  light: number;
  props: number[];
};

const ENV: Craft[] = [
  { env: "Каменный подвал", rule: "Три явных этапа: толпа, босс, элита. Отдельного босса на толпе нет.", source: "01_intro_castle.js", dark: 0.55, light: 0.22, props: [35, 23, 36] },
  { env: "Грунтовый тракт", rule: "Три явных этапа тракта. Толпа и босс названы в файле.", source: "02_intro_road.js", dark: 0.4, light: 0.16, props: [33, 23] },
  { env: "Хрустальные гроты", rule: "Три явных этапа гротов. Босс — Кристальная Владычица.", source: "03_intro_swamp.js", dark: 0.34, light: 0.28, props: [45, 36, 35] },
  { env: "Катакомбы", rule: "Три явных этапа склепа. Босс — Чёрный Жнец.", source: "04_catacombs.js", dark: 0.62, light: 0.14, props: [23, 35, 33] },
  { env: "Башня шторма", rule: "Ярусы 4, 8 и 12 — орда из шести, у каждой 0.75 здоровья. Последний ярус — босс и два Стража Трона.", source: "05_storm_tower.js", dark: 0.38, light: 0.2, props: [45, 36] },
  { env: "Лабиринт душ", rule: "Башня на 14 ярусов. Орда на 4, 8 и 12. Босс — Танатос, генерал — Страж Трона.", source: "06_soul_labyrinth.js", dark: 0.58, light: 0.18, props: [35, 23] },
  { env: "Пекло хаоса", rule: "Башня на 15 ярусов. Орда на 4, 8 и 12. Босс — Суртур.", source: "07_chaos_inferno.js", dark: 0.46, light: 0.26, props: [36, 45, 33] },
  { env: "Затонувший храм", rule: "Три явных этапа храма, не фрактальная бездна. Босс — Левиафан.", source: "08_abyss_temple.js", dark: 0.5, light: 0.24, props: [45, 23] },
  { env: "Разрыв матрицы", rule: "Три явных этапа. Босс — Творец Искажения. Рейд Демиурга ссылается на этот данж.", source: "09_antimatrix.js", dark: 0.42, light: 0.2, props: [36, 35] },
  { env: "Разлом тьмы", rule: "Башня на 10 ярусов. Орда на 4 и 8. Босс — Азатот.", source: "10_void_rift.js", dark: 0.66, light: 0.12, props: [35, 23, 33] },
  { env: "Кровавая цитадель", rule: "Башня на 12 ярусов. Орда на 4 и 8. Босс — Кармилла.", source: "11_blood_citadel.js", dark: 0.48, light: 0.22, props: [33, 36] },
  { env: "Спектральный собор", rule: "Башня на 12 ярусов. Орда на 4 и 8. Босс — Призрачный Понтифик.", source: "12_spectral_cathedral.js", dark: 0.44, light: 0.18, props: [23, 45, 35] },
  { env: "Колыбель титанов", rule: "Башня на 14 ярусов. Орда на 4, 8 и 12. Босс — Титан Атлас.", source: "13_titan_cradle.js", dark: 0.4, light: 0.16, props: [35, 33, 23] },
  { env: "Астральный зал", rule: "Башня на 12 ярусов. Орда на 4 и 8. Босс — Демиург Селестия.", source: "14_astral_sanctuary.js", dark: 0.36, light: 0.26, props: [45, 36, 23] },
  { env: "Глубины небытия", rule: "Башня на 15 ярусов. Орда на 4, 8 и 12. Босс — Владыка Энтропия.", source: "15_oblivion_depths.js", dark: 0.6, light: 0.14, props: [35, 33] },
  { env: "Сердце времени", rule: "Башня на 15 ярусов. Орда на 4, 8 и 12. Босс — Хронос Прайм.", source: "16_chronos_engine.js", dark: 0.42, light: 0.22, props: [36, 45] },
  { env: "Нуль-измерение", rule: "Башня на 20 ярусов. Орда на 4, 8 и 12. Босс — Архитектор Бытия, порог 300.", source: "17_null_dimension.js", dark: 0.7, light: 0.1, props: [35, 23, 36] },
];

const MODE_ENV: Record<string, Craft> = {
  mode_arena: { env: "Арена разлома", rule: "Круг 30 секунд и подкрепление.", source: "combat.js startArena", dark: 0.36, light: 0.24, props: [45, 36] },
  mode_duel: { env: "Круг дуэли", rule: "Один двойник героя.", source: "combat.js startDuelArena", dark: 0.5, light: 0.16, props: [35] },
  mode_horde: { env: "Орда бездны", rule: "Выживание, подкрепление по таймеру.", source: "combat.js startHordeMode", dark: 0.44, light: 0.2, props: [33, 36, 23] },
  mode_abyss: { env: "Фрактальная бездна", rule: "Этаж героя, каждый пятый — босс.", source: "combat.js startAbyss", dark: 0.58, light: 0.18, props: [45, 35] },
  mode_demiurge: { env: "Рейд демиурга", rule: "45 секунд, затем ярость.", source: "combat.js startRaidDemiurge", dark: 0.48, light: 0.22, props: [36, 45] },
};

export function craftFor(dungeon: number, sw: string): Craft {
  if (MODE_ENV[sw]) return MODE_ENV[sw];
  return ENV[Math.max(0, Math.min(ENV.length - 1, (dungeon | 0) - 1))];
}

/** Ярусы 4, 8 и 12 башни в generateTowerStages. */
export function swarmName(name: string) {
  return name.startsWith("Орда (");
}
