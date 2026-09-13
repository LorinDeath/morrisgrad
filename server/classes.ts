export interface BaseClassStats {
  hp: number;
  maxHp: number;
  armor: number;
  minAtk: number;
  maxAtk: number;
  critChance?: number; // опционально для будущего расширения
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
    stats: {
      hp: 200,
      maxHp: 200,
      armor: 50,
      minAtk: 1,
      maxAtk: 4,
    },
  },
  spearman: {
    id: "spearman",
    name: "Копейщик",
    color: "#ef4444",
    abilityId: "pierce",
    stats: {
      hp: 50,
      maxHp: 50,
      armor: 5,
      minAtk: 5,
      maxAtk: 10,
    },
  },
  rogue: {
    id: "rogue",
    name: "Разбойник",
    color: "#22c55e",
    abilityId: "trick_strike",
    stats: {
      hp: 150,
      maxHp: 150,
      armor: 8,
      minAtk: 1,
      maxAtk: 15,
    },
  },
};

export function getClassConfig(classId: string | null | undefined): CharacterClass {
  if (!classId || !CHARACTER_CLASSES[classId]) {
    return CHARACTER_CLASSES.warrior;
  }
  return CHARACTER_CLASSES[classId];
}