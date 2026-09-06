export const CLASSES = {
  warrior: {
    id: 'warrior',
    name: 'Воин',
    color: '#38bdf8', // Голубой
    hp: 200,
    maxHp: 200,
    armor: 50,
    minAtk: 1,
    maxAtk: 4,
    ability: {
      name: 'Удар в спину',
      cooldown: 14,
      mult: 1.5,
      ignoreArmor: false,
      vampirism: 0,
      desc: 'Урон 1.5x от текущего замаха. Не игнорирует броню.'
    }
  },
  spearman: {
    id: 'spearman',
    name: 'Копейщик',
    color: '#ef4444', // Красный
    hp: 50,
    maxHp: 50,
    armor: 5,
    minAtk: 5,
    maxAtk: 10,
    ability: {
      name: 'Колющий удар',
      cooldown: 14,
      mult: 1.2,
      ignoreArmor: true,
      vampirism: 0,
      desc: 'Урон 1.2x от текущего замаха. Полностью игнорирует броню!'
    }
  },
  rogue: {
    id: 'rogue',
    name: 'Разбойник',
    color: '#22c55e', // Зелёный
    hp: 150,
    maxHp: 150,
    armor: 8,
    minAtk: 1,
    maxAtk: 15,
    ability: {
      name: 'Коварный удар',
      cooldown: 14,
      mult: 1.1,
      ignoreArmor: false,
      vampirism: 0.1, // 10% исцеления
      desc: 'Урон 1.1x от текущего замаха. Исцеляет на 10% нанесённого урона.'
    }
  }
};

// Расчёт процента защиты брони (1 брони = 1%, 10 брони = 5%, максимум 90%)
export function getArmorReduction(armor) {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.90, pct / 100);
}

// Расчёт замаха атаки по времени (сек)
export function getChargeInfo(seconds) {
  let mult = 0.2;
  let tier = 'weak';
  let color = '#6b7280'; // Серый
  let label = 'Быстрый выпад';

  if (seconds < 7) {
    mult = 0.2 + (seconds / 7) * 0.8; // от 0.2 до 1.0
    tier = 'charging';
    color = '#eab308'; // Жёлтый
    label = 'Зарядка';
  } else if (seconds < 12) {
    mult = 1.0 + ((seconds - 7) / 5) * 1.0; // от 1.0 до 2.0
    tier = 'charged';
    color = '#f97316'; // Оранжевый
    label = 'Сверхзаряд (x1)';
  } else if (seconds < 15) {
    mult = 2.0 + ((seconds - 12) / 3) * 1.0; // от 2.0 до 3.0
    tier = 'overcharged';
    color = '#ec4899'; // Розовый/Неон
    label = 'Сверхзаряд (x2)';
  } else {
    mult = 3.0; // Максимум
    tier = 'ultra';
    color = '#a855f7'; // Фиолетовый
    label = 'УЛЬТРА-ЗАРЯД (x3)';
  }

  return { mult: Number(mult.toFixed(2)), tier, color, label };
}