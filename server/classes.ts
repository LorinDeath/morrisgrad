export interface BaseClassStats {
  hp: number;
  maxHp: number;
  armor: number;
  minAtk: number;
  maxAtk: number;
  critChance?: number;
  vampirism?: number;
}

export interface CharacterClass {
  id: string;
  name: string;
  color: string;
  abilityId: string;
  stats: BaseClassStats;
}

export const CHARACTER_CLASSES: Record<string, CharacterClass> = {
  warrior: {
    id: "warrior",
    name: "Воин",
    color: "#38bdf8",
    abilityId: "backstab",
    stats: { hp: 200, maxHp: 200, armor: 50, minAtk: 2, maxAtk: 5 },
  },
  spearman: {
    id: "spearman",
    name: "Копейщик",
    color: "#ef4444",
    abilityId: "pierce",
    stats: { hp: 80, maxHp: 80, armor: 15, minAtk: 5, maxAtk: 10 },
  },
  rogue: {
    id: "rogue",
    name: "Разбойник",
    color: "#22c55e",
    abilityId: "trick_strike",
    stats: { hp: 150, maxHp: 150, armor: 8, minAtk: 1, maxAtk: 7 },
  },
  mage: {
    id: "mage",
    name: "Маг",
    color: "#a855f7",
    abilityId: "fireball",
    stats: { hp: 30, maxHp: 30, armor: 1, minAtk: 1, maxAtk: 2 },
  },
  // Новые персонажи для алтаря перевоплощения (без навыков пока)
  lorin: {
    id: "lorin",
    name: "Лорин",
    color: "#e11d48",
    abilityId: "none",
    stats: { hp: 120, maxHp: 120, armor: 12, minAtk: 3, maxAtk: 8 },
  },
  alzor: {
    id: "alzor",
    name: "Алзор",
    color: "#22d3ee",
    abilityId: "none",
    stats: { hp: 140, maxHp: 140, armor: 18, minAtk: 4, maxAtk: 9 },
  },
  masked: {
    id: "masked",
    name: "Маскированный",
    color: "#64748b",
    abilityId: "none",
    stats: { hp: 160, maxHp: 160, armor: 22, minAtk: 3, maxAtk: 7 },
  },
  mariel: {
    id: "mariel",
    name: "Мариэль",
    color: "#4ade80",
    abilityId: "none",
    stats: { hp: 100, maxHp: 100, armor: 8, minAtk: 5, maxAtk: 12 },
  },
  scholar: {
    id: "scholar",
    name: "Учёная",
    color: "#c084fc",
    abilityId: "none",
    stats: { hp: 90, maxHp: 90, armor: 6, minAtk: 2, maxAtk: 6 },
  },
  officer: {
    id: "officer",
    name: "Офицер",
    color: "#16a34a",
    abilityId: "none",
    stats: { hp: 180, maxHp: 180, armor: 35, minAtk: 3, maxAtk: 6 },
  },
  whitehair: {
    id: "whitehair",
    name: "Беловласая",
    color: "#f8fafc",
    abilityId: "none",
    stats: { hp: 110, maxHp: 110, armor: 10, minAtk: 4, maxAtk: 9 },
  },
};

export function getClassConfig(classId: string | null | undefined): CharacterClass {
  if (!classId || !CHARACTER_CLASSES[classId]) {
    return CHARACTER_CLASSES.warrior;
  }
  return CHARACTER_CLASSES[classId];
}
