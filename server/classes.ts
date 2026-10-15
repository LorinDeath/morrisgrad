export interface BaseClassStats {
  hp: number;
  maxHp: number;
  armor: number;
  minAtk: number;
  maxAtk: number;
  critChance?: number;
}

export interface CharacterClass {
  id: string;
  name: string;
  color: string;
  abilityId: string;
  stats: BaseClassStats;
}

export const CHARACTER_CLASSES: Record<string, CharacterClass> = {
  // Базы классов почти как были: роль задаёт ШМОТ (архетипы), не класс. Экип без локов.
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
    stats: { hp: 90, maxHp: 90, armor: 18, minAtk: 5, maxAtk: 10 },
  },
  rogue: {
    id: "rogue",
    name: "Разбойник",
    color: "#22c55e",
    abilityId: "trick_strike",
    stats: { hp: 140, maxHp: 140, armor: 8, minAtk: 2, maxAtk: 7 },
  },
  mage: {
    id: "mage",
    name: "Маг",
    color: "#a855f7",
    abilityId: "fireball",
    stats: { hp: 40, maxHp: 40, armor: 2, minAtk: 2, maxAtk: 4 },
  },
};

export function getClassConfig(classId: string | null | undefined): CharacterClass {
  if (!classId || !CHARACTER_CLASSES[classId]) {
    return CHARACTER_CLASSES.warrior;
  }
  return CHARACTER_CLASSES[classId];
}
