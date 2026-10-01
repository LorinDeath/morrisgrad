// relics.ts - Binding of Isaac style Relics & Synergy System for Dungeon Gathering

import type { RelicRarity, Relic } from './types';

export interface SynergyInfo {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
}

export const ALL_RELICS: Relic[] = [
  {
    id: 'isaac_tear',
    name: 'Слеза Исаака',
    desc: 'Магические сферы при попадании во врага или стену распадаются на 4 самонаводящиеся микросферы.',
    icon: '💧',
    rarity: 'epic',
    effectType: 'isaac_tear',
    stats: {
      bonusDamage: 4,
    },
  },
  {
    id: 'brimstone_beam',
    name: 'Знак Серы (Brimstone)',
    desc: 'Выстрелы превращаются в колоссальный пронзающий лазерный луч Серы, непрерывно испепеляющий всех на линии огня.',
    icon: '🩸',
    rarity: 'legendary',
    effectType: 'brimstone_beam',
    stats: {
      bonusDamage: 12,
    },
  },
  {
    id: 'sacred_heart',
    name: 'Священное Сердце',
    desc: 'Сферы увеличиваются в 2.5 раза, медленно парят с божественным сиянием, самонаводятся на врагов и наносят +120% урона.',
    icon: '💖',
    rarity: 'legendary',
    effectType: 'sacred_heart',
    stats: {
      bonusHp: 4,
      bonusDamage: 10,
    },
  },
  {
    id: 'black_hole',
    name: 'Сингулярность Бездны',
    desc: 'Убийство врага с шансом 35% порождает черную дыру, затягивающую всех врагов в эпицентр и наносящую непрерывный гравитационный урон.',
    icon: '🕳️',
    rarity: 'legendary',
    effectType: 'black_hole',
    stats: {
      bonusDamage: 6,
    },
  },
  {
    id: 'meat_cube',
    name: 'Куб Мясника',
    desc: 'Два орбитальных защитных куба вращаются вокруг героя, блокируют любые вражеские снаряды и наносят 45 урона при касании.',
    icon: '🥩',
    rarity: 'rare',
    effectType: 'meat_cube',
    stats: {
      bonusHp: 2,
    },
  },
  {
    id: 'occult_eye',
    name: 'Око Оккультиста',
    desc: 'Все снаряды и сферы получают агрессивное самонаведение на ближайших монстров с резкими доворотами и +25% к скорости.',
    icon: '👁️',
    rarity: 'rare',
    effectType: 'occult_eye',
    stats: {
      bonusCrit: 0.15,
    },
  },
  {
    id: 'doomsday_watch',
    name: 'Часы Судного Дня',
    desc: 'Убийства заряжают шкалу Ульты. При нажатии [R] или кнопки в HUD: 4 секунды остановки времени для всех врагов + орбитальные астральные лазеры!',
    icon: '⏳',
    rarity: 'legendary',
    effectType: 'doomsday_watch',
    stats: {
      bonusSpeed: 20,
    },
  },
  {
    id: 'blood_crown',
    name: 'Корона Мученика',
    desc: 'При убийстве врага из его тела с оглушительным треском вылетает веер из 8 кровавых шипов во все стороны.',
    icon: '👑',
    rarity: 'rare',
    effectType: 'blood_crown',
    stats: {
      bonusLifesteal: 0.08,
    },
  },
  {
    id: 'unholy_triquetra',
    name: 'Нечестивый Трикветр',
    desc: 'Все атаки выпускают тройную спираль энергии с чумным вампиризмом и шансом критического разрыва плоти.',
    icon: '🔯',
    rarity: 'epic',
    effectType: 'unholy_triquetra',
    stats: {
      bonusCrit: 0.12,
      bonusLifesteal: 0.06,
    },
  },
  {
    id: 'chaos_d6',
    name: 'Кость Хаоса D6',
    desc: 'Каждые 14 секунд генерирует волну космического хаоса: бесплатные зелья, монеты или взрыв чистой энергии склепа.',
    icon: '🎲',
    rarity: 'rare',
    effectType: 'chaos_d6',
    stats: {
      bonusSpeed: 15,
    },
  },
  {
    id: 'godhead_halo',
    name: 'Ореол Божества',
    desc: 'Вокруг героя горит божественная аура, наносящая огромный периодический урон всем монстрам в радиусе 110px и отталкивающая их.',
    icon: '✨',
    rarity: 'legendary',
    effectType: 'godhead_core',
    stats: {
      bonusDamage: 8,
      bonusHp: 2,
    },
  },
];

export function getRandomRelic(excludeIds: string[] = []): Relic {
  const pool = ALL_RELICS.filter((r) => !excludeIds.includes(r.id));
  if (pool.length === 0) return ALL_RELICS[Math.floor(Math.random() * ALL_RELICS.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getRelicById(id: string): Relic | undefined {
  return ALL_RELICS.find((r) => r.id === id);
}

// Расчет синергий комбинаций реликвий в стиле Isaac
export function evaluateSynergy(equipped: (Relic | null)[]): SynergyInfo | null {
  const activeIds = new Set(equipped.filter((r): r is Relic => r !== null).map((r) => r.id));

  // 1. Brimstone + Isaac's Tear = Кровавый Распад
  if (activeIds.has('brimstone_beam') && activeIds.has('isaac_tear')) {
    return {
      id: 'brimstone_splinter',
      name: '💥 СИНЕРГИЯ: КРОВАВЫЙ РАСПАД',
      desc: 'Луч Серы при соприкосновении с врагами взрывается каскадом самонаводящихся серных сфер во все стороны!',
      icon: '💥',
      color: '#ef4444',
    };
  }

  // 2. Sacred Heart + Godhead = Божественный Абсолют
  if (activeIds.has('sacred_heart') && activeIds.has('godhead_halo')) {
    return {
      id: 'divine_absolute',
      name: '☀️ СИНЕРГИЯ: БОЖЕСТВЕННЫЙ АБСОЛЮТ',
      desc: 'Ореол Божества расширен до 180px, урон сфер увеличен вдвое, герой регенерирует 1 HP каждые 5 сек!',
      icon: '☀️',
      color: '#ffd700',
    };
  }

  // 3. Black Hole + Doomsday Watch = Событийный Горизонт
  if (activeIds.has('black_hole') && activeIds.has('doomsday_watch')) {
    return {
      id: 'event_horizon',
      name: '🌌 СИНЕРГИЯ: СОБЫТИЙНЫЙ ГОРИЗОНТ',
      desc: 'Ульта не только останавливает время, но и затягивает абсолютно всех врагов на этаже в сверхмассивную Черную Дыру!',
      icon: '🌌',
      color: '#a855f7',
    };
  }

  // 4. Meat Cube + Blood Crown = Мясорубка Смерти
  if (activeIds.has('meat_cube') && activeIds.has('blood_crown')) {
    return {
      id: 'meat_grinder',
      name: '⚙️ СИНЕРГИЯ: МЯСОРУБКА СМЕРТИ',
      desc: 'Орбитальные кубы мясника выпускают кольца кровавых шипов каждую секунду при вращении!',
      icon: '⚙️',
      color: '#e11d48',
    };
  }

  // 5. Две любые легендарные реликвии = Пробуждение Исаака
  const legendCount = equipped.filter((r) => r && r.rarity === 'legendary').length;
  if (legendCount >= 2) {
    return {
      id: 'isaac_awakening',
      name: '👼 СИНЕРГИЯ: ПРОБУЖДЕНИЕ БОЖЕСТВА',
      desc: 'Все атаки получают взрывной эффект, +20 к базовому урону и сияющий золотой ореол непобедимости!',
      icon: '👼',
      color: '#38bdf8',
    };
  }

  return null;
}
