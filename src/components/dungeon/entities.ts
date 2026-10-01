// entities.ts - Entities, combat math, and spawner for Dungeon Gathering Roguelite

import type {
  Enemy,
  EnemyType,
  HeroClass,
  ItemDrop,
  MetaUpgrades,
  Particle,
  FloatingText,
  PlayerStats,
  Room,
  DifficultyLevel,
  GameMode,
  StartingLoadoutWeapon,
  StartingPack,
  BiomeType,
} from './types';
import { createStarterWeapon, createLoadoutWeapon } from './weapons';

export function createInitialPlayer(
  heroClass: HeroClass = 'zombie',
  meta: MetaUpgrades = {
    extraHearts: 0,
    extraDamage: 0,
    extraGold: 0,
    extraLight: 0,
    extraPotions: 0,
    vampireMastery: 0,
    critMastery: 0,
    greedMastery: 0,
    spectralDiscount: 0,
    soulMagnet: 0,
    lootLuck: 0,
    starAffinity: 0,
  },
  difficulty: DifficultyLevel = 'normal',
  gameMode: GameMode = 'campaign',
  startingWeaponChoice: StartingLoadoutWeapon = 'default',
  startingPackChoice: StartingPack = 'none'
): PlayerStats {
  const starterWeapon = startingWeaponChoice && startingWeaponChoice !== 'default'
    ? createLoadoutWeapon(startingWeaponChoice, heroClass)
    : createStarterWeapon(heroClass);

  if ((meta.starAffinity || 0) > 0) {
    starterWeapon.stars = meta.starAffinity || 0;
  }
  let maxHp = 6 + (meta.extraHearts || 0) * 2 + starterWeapon.bonusMaxHp;
  let speed = 132 + starterWeapon.bonusMoveSpeed;
  let damage = starterWeapon.bonusDamage + (meta.extraDamage || 0);
  let attackRange = starterWeapon.attackRange;
  let critChance = 0.12 + starterWeapon.bonusCritChance + (meta.critMastery || 0) * 0.04;
  let armor = starterWeapon.bonusArmor;
  let lifestealChance = 0.08 + starterWeapon.bonusLifesteal + (meta.vampireMastery || 0) * 0.05;
  let dashCooldown = 1.2;
  let attackCooldown = starterWeapon.attackCooldown;
  let critMult = starterWeapon.bonusCritMult;

  if (heroClass === 'zombie') {
    speed = 138;
    lifestealChance = 0.20 + starterWeapon.bonusLifesteal;
    dashCooldown = 1.0;
  } else if (heroClass === 'paladin') {
    maxHp += 4;
    armor += 1;
    speed = 124;
  } else if (heroClass === 'sorcerer') {
    speed = 130;
    maxHp += 2;
  } else if (heroClass === 'berserker') {
    speed = 136;
    dashCooldown = 1.05;
  } else if (heroClass === 'assassin') {
    speed = 155;
    dashCooldown = 0.70;
  }

  // Бонусы новичка на легкой сложности
  if (difficulty === 'easy') {
    maxHp += 2;
    dashCooldown *= 0.85;
  }

  // Стартовые припасы и мета-апгрейды
  let startGold = (meta.extraGold || 0) + (difficulty === 'easy' ? 40 : 0);
  let startPotHp = 1 + (meta.extraPotions || 0) + (difficulty === 'easy' ? 1 : 0);
  let startPotSpeed = 1;
  let startPotPower = (meta.extraPotions || 0) > 0 ? 1 : 0;
  let bonusLightRadius = starterWeapon.bonusLightRadius + (meta.extraLight || 0) * 35;

  if (startingPackChoice === 'traveler_purse') {
    startGold += 60;
  } else if (startingPackChoice === 'medic_kit') {
    startPotHp += 2;
    startPotSpeed += 1;
  } else if (startingPackChoice === 'sharpening_scroll') {
    starterWeapon.level += 1;
    starterWeapon.bonusDamage += 5;
    damage += 5;
  } else if (startingPackChoice === 'light_amulet') {
    bonusLightRadius += 70;
  } else if (startingPackChoice === 'orb_resonator') {
    damage += 6;
  }

  // Слоты реликвий по классам: sorcerer = 3, berserker = 1, остальные = 2
  const relicSlotsCount = heroClass === 'sorcerer' ? 3 : heroClass === 'berserker' ? 1 : 2;

  return {
    heroClass,
    gameMode,
    difficulty,
    score: 0,
    maxHp,
    hp: maxHp,
    speed,
    damage,
    attackCooldown,
    attackTimer: 0,
    attackRange,
    comboStep: 0,
    comboResetTimer: 0,
    critChance: Math.min(0.85, critChance),
    critMult,
    armor,
    lifestealChance: Math.min(0.65, lifestealChance),

    dashCooldown,
    dashTimer: 0,
    dashDuration: 0.22,
    isDashing: false,

    specialSkillCooldown: 4.5,
    specialSkillTimer: 0,

    invulnerableTimer: 0,

    gold: startGold,
    blueCoins: 0,
    xp: 0,
    level: 1,
    nextLevelXp: 80,
    floor: 1,

    potions: {
      hp: startPotHp,
      speed: startPotSpeed,
      power: startPotPower,
    },

    buffSpeedTimer: 0,
    buffPowerTimer: 0,

    cleaveBonus: 0,
    toxicRupture: false,
    flameAura: false,
    soulBoltReadyCounter: 0,
    chainLightning: false,
    freezeDash: false,
    aegisShieldTimer: 0,
    hasAegisShield: false,
    perks: [],

    equippedWeapon: starterWeapon,
    bonusLightRadius,
    bonusDarkMagicPct: starterWeapon.bonusDarkMagicPct || 0,

    relicSlotsCount,
    relics: new Array(relicSlotsCount).fill(null),
    activeSynergy: null,
    ultimateCharge: 0,
    ultimateMax: 100,
    isUltimateActive: false,
    ultimateTimer: 0,
    startingPack: startingPackChoice,
  };
}

let enemyIdCounter = 1;

export function getDifficultyMobMultiplier(difficulty: DifficultyLevel = 'normal'): number {
  switch (difficulty) {
    case 'easy':
      return 0.65;
    case 'normal':
      return 0.75;
    case 'nightmare':
      return 1.0;
    case 'inferno':
      return 1.4; // 1.3x – 1.5x
    default:
      return 0.75;
  }
}


// 6 видов различных зомби + боссы с масштабированием сложности
export function createEnemyInstance(
  type: EnemyType,
  x: number,
  y: number,
  floor: number,
  roomIndex: number,
  isMiniBoss = false,
  difficulty: DifficultyLevel = 'normal',
  biome?: BiomeType
): Enemy {
  let name = 'Зомби-Пехотинец';
  let baseHp = 42;
  let baseDmg = 1;
  let speed = 48 + Math.random() * 12;
  let radius = 9;
  let attackCooldown = 0.9;
  let scale = 1.0;
  let tint: string | undefined = undefined;
  let preferredDistance: number | undefined = undefined;
  let rangedAttack: Enemy['rangedAttack'] = undefined;

  switch (type) {
    case 'zombie_walker':
      name = 'Зомби-Пехотинец';
      baseHp = 44;
      baseDmg = 1;
      speed = 52 + Math.random() * 10;
      radius = 9;
      // Рядовой зомби - атакует только вблизи когтями, без спама снарядами
      rangedAttack = undefined;
      break;

    case 'zombie_spitter':
      name = 'Кислотный Зомби-Плевун';
      baseHp = 36;
      baseDmg = 1;
      speed = 50 + Math.random() * 10;
      radius = 9;
      tint = '#84cc16';
      preferredDistance = 140;
      rangedAttack = {
        name: 'Кислотный Плевок',
        cooldown: 2.2,
        speed: 135,
        damage: 1,
        range: 210,
        color: '#84cc16',
        trailColor: '#4d7c0f',
        isOrb: true,
        radius: 4.5,
      };
      break;

    case 'zombie_runner':
      name = 'Бешеный Зомби-Бегун';
      baseHp = 28;
      baseDmg = 1;
      speed = 100 + Math.random() * 14;
      radius = 8;
      attackCooldown = 0.6;
      tint = '#38bdf8';
      // Быстрый спринтер - опасен скоростью сближения, без снарядов
      rangedAttack = undefined;
      break;

    case 'zombie_brute':
      name = 'Колоссальный Зомби-Громила';
      baseHp = 120;
      baseDmg = 3;
      speed = 36 + Math.random() * 6;
      radius = 16;
      scale = 1.5;
      attackCooldown = 1.5;
      tint = '#b91c1c';
      preferredDistance = 90;
      // Крупный опасный моб: бросает тяжелый сокрушающий валун
      rangedAttack = {
        name: 'Сокрушительный Валун',
        cooldown: 3.0,
        speed: 150,
        damage: 3,
        range: 230,
        color: '#78350f',
        trailColor: '#451a03',
        isOrb: true,
        radius: 8.5,
      };
      break;

    case 'zombie_witch':
      name = 'Некромантка Склепа';
      baseHp = 48;
      baseDmg = 1;
      speed = 46 + Math.random() * 8;
      radius = 9;
      tint = '#c084fc';
      preferredDistance = 160;
      rangedAttack = {
        name: 'Сфера Пустоты',
        cooldown: 2.2,
        speed: 125,
        damage: 2,
        range: 250,
        color: '#c084fc',
        trailColor: '#6b21a8',
        isOrb: true,
        radius: 5.5,
        homing: true,
      };
      break;

    case 'zombie_pyro':
      name = 'Пепельный Зомби-Пиромант';
      baseHp = 52;
      baseDmg = 1;
      speed = 50 + Math.random() * 10;
      radius = 10;
      tint = '#fb923c';
      preferredDistance = 130;
      rangedAttack = {
        name: 'Залп Огненных Сфер',
        cooldown: 2.4,
        speed: 155,
        damage: 1,
        range: 220,
        color: '#f97316',
        trailColor: '#c2410c',
        isOrb: true,
        radius: 4.5,
        spreadCount: 3,
      };
      break;

    case 'zombie_boss':
      name = 'Нечестивый Колосс Склепа';
      baseHp = 650;
      baseDmg = 2;
      speed = 70 + floor * 4;
      radius = 28;
      scale = 2.6;
      attackCooldown = 1.1;
      tint = '#ef4444';
      rangedAttack = {
        name: 'Плазменный Залп Владыки',
        cooldown: 2.0,
        speed: 190,
        damage: 2,
        range: 360,
        color: '#f43f5e',
        trailColor: '#881337',
        isOrb: true,
        radius: 8.5,
        spreadCount: 5,
      };
      break;
  }

  // 5. Независимый скейлинг статов мобов по этажу:
  // HP: BaseHP * (1 + (Floor - 1) * 0.28)
  // Damage: BaseDMG * (1 + (Floor - 1) * 0.18)
  const floorFactorHp = 1 + (floor - 1) * 0.35;
  const floorFactorDmg = 1 + (floor - 1) * 0.25;

  let hp = Math.round(baseHp * floorFactorHp);
  let damage = Math.max(1, Math.round(baseDmg * floorFactorDmg));
  if (rangedAttack) {
    rangedAttack.damage = Math.max(1, Math.round(rangedAttack.damage * floorFactorDmg));
  }

  // Броня моба: базовое сопротивление возрастает плавно с 5-го этажа
  let armor = 0;
  if (floor >= 4) {
    const floorArmorBonus = Math.floor((floor - 3) * 1.6);
    const typeMult = type === 'zombie_brute' ? 1.5 : type === 'zombie_boss' ? 2.0 : 1.0;
    armor = Math.round(floorArmorBonus * typeMult);
  }

  // Масштабирование от уровня сложности
  if (difficulty === 'easy') {
    hp = Math.max(12, Math.round(hp * 0.75));
    speed *= 0.88;
    armor = Math.max(0, armor - 2);
  } else if (difficulty === 'nightmare') {
    hp = Math.round(hp * 1.30);
    damage = Math.round(damage * 1.35);
    speed *= 1.15;
    armor += 1;
    attackCooldown = Math.max(0.4, attackCooldown * 0.85);
  } else if (difficulty === 'inferno') {
    hp = Math.round(hp * 1.60);
    damage = Math.round(damage * 1.65);
    speed *= 1.25;
    armor += 2;
    attackCooldown = Math.max(0.35, attackCooldown * 0.75);
  }

  // Элитный модификатор или Мини-Босс
  const eliteChance = difficulty === 'inferno' ? 0.35 : difficulty === 'nightmare' ? 0.25 : 0.16;
  const isElite = isMiniBoss || Math.random() < eliteChance + floor * 0.02;
  let eliteAffix: Enemy['eliteAffix'] = undefined;

  if (isMiniBoss) {
    hp = Math.round(hp * 2.8);
    damage += 1;
    armor += 3;
    scale *= 1.35;
    speed += 8;
    name = `★ СТРАЖ: ${name}`;
    tint = '#e11d48';
    eliteAffix = 'vampiric';
  } else if (isElite) {
    hp = Math.round(hp * 2.0);
    damage += 1;
    armor += 1;
    scale *= 1.15;
    const affixes: Enemy['eliteAffix'][] = ['fire', 'frost', 'vampiric'];
    eliteAffix = affixes[Math.floor(Math.random() * affixes.length)];
    name = `[Элита] ${name}`;
    tint = eliteAffix === 'fire' ? '#f97316' : eliteAffix === 'frost' ? '#38bdf8' : '#e11d48';
  }

  const darkShieldChance = isMiniBoss ? (floor >= 2 ? 0.45 : 0) : isElite ? (floor >= 3 ? 0.25 : 0) : (floor >= 4 ? 0.08 : 0);
  const hasDarkShield = Math.random() < darkShieldChance;
  const darkShieldHp = hasDarkShield ? Math.round(hp * 0.85 + 25) : 0;
  if (hasDarkShield) {
    name = `🛡️ [ЧЁРНЫЙ ЩИТ] ${name}`;
  }

  if (biome) {
    if (biome === 'toxic') {
      name = `Чумной ${name}`;
      if (!isElite && !isMiniBoss) tint = '#84cc16';
    } else if (biome === 'magma' || biome === 'abyss') {
      name = `Инфернальный ${name}`;
      if (!isElite && !isMiniBoss) tint = '#ea580c';
    } else if (biome === 'sunken') {
      name = `Глубинный ${name}`;
      if (!isElite && !isMiniBoss) tint = '#0284c7';
    } else if (biome === 'void') {
      name = `Пустотный ${name}`;
      if (!isElite && !isMiniBoss) tint = '#9333ea';
    } else if (biome === 'sanctum') {
      name = `Осквернённый ${name}`;
      if (!isElite && !isMiniBoss) tint = '#ca8a04';
      armor += 1;
    } else if (biome === 'crypt') {
      if (!isElite && !isMiniBoss) tint = '#94a3b8';
    }
  }

  return {
    id: enemyIdCounter++,
    type,
    name,
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    hp,
    maxHp: hp,
    speed,
    damage,
    armor,
    attackRange: rangedAttack ? rangedAttack.range : radius + 16,
    attackCooldown,
    attackTimer: Math.random() * 0.5,
    state: 'idle',
    dir: (Math.floor(Math.random() * 4) as any) || 0,
    frame: Math.floor(Math.random() * 4),
    animTimer: Math.random() * 0.15,
    hurtTimer: 0,
    deathTimer: 0,
    isDead: false,
    isBoss: type === 'zombie_boss' || isMiniBoss,
    scale,
    tint,
    roomIndex,
    isElite,
    eliteAffix,
    rangedAttack,
    dodgeCooldown: difficulty === 'inferno' ? 1.5 : difficulty === 'nightmare' ? 2.0 : 2.8,
    dodgeTimer: 0,
    preferredDistance,
    telegraphTimer: 0,
    hasDarkShield,
    darkShieldHp,
    maxDarkShieldHp: darkShieldHp,
    isEvolved: false,
    evolutionTier: 0,
    darkGlitchSeed: Math.random() * 100,
    biome,
  };
}

export function spawnEnemiesForRoom(
  room: Room,
  floor: number,
  difficulty: DifficultyLevel = 'normal',
  mode: GameMode = 'campaign'
): Enemy[] {
  const enemies: Enemy[] = [];

  // 1. ОБУЧАЮЩИЙ РЕЖИМ (TUTORIAL)
  if (mode === 'tutorial') {
    if (room.id === 1) {
      for (let i = 0; i < 2; i++) {
        const dummy = createEnemyInstance('zombie_walker', (room.cx - 2 + i * 4) * 16 + 8, room.cy * 16 + 8, 1, room.id, false, 'easy');
        dummy.name = 'Тренировочный Зомби';
        dummy.hp = 20;
        dummy.maxHp = 20;
        dummy.damage = 1;
        enemies.push(dummy);
      }
    } else if (room.id === 2) {
      for (let i = 0; i < 2; i++) {
        const dummy = createEnemyInstance('zombie_spitter', (room.cx - 2 + i * 4) * 16 + 8, room.cy * 16 + 8, 1, room.id, false, 'easy');
        dummy.name = 'Манекен Навыка';
        dummy.hp = 25;
        dummy.maxHp = 25;
        enemies.push(dummy);
      }
    } else if (room.id === 4) {
      const guardian = createEnemyInstance('zombie_brute', room.cx * 16 + 8, room.cy * 16 + 8, 1, room.id, true, 'easy');
      guardian.name = '★ ТРЕНИРОВОЧНЫЙ СТРАЖ';
      guardian.hp = 140;
      guardian.maxHp = 140;
      enemies.push(guardian);
    }
    return enemies;
  }

  // 2. БОСС-РАШ (BOSS RUSH)
  if (mode === 'boss_rush') {
    if (room.type === 'boss') {
      const wave = floor;
      if (wave === 1) {
        enemies.push(createEnemyInstance('zombie_brute', room.cx * 16 + 8, room.cy * 16 + 8, 3, room.id, true, difficulty));
      } else if (wave === 2) {
        enemies.push(createEnemyInstance('zombie_witch', room.cx * 16 + 8, room.cy * 16 + 8, 5, room.id, true, difficulty));
      } else if (wave === 3) {
        enemies.push(createEnemyInstance('zombie_boss', room.cx * 16 + 8, room.cy * 16 + 8, 6, room.id, true, difficulty));
      } else if (wave === 4) {
        enemies.push(createEnemyInstance('zombie_pyro', room.cx * 16 + 8, room.cy * 16 + 8, 8, room.id, true, difficulty));
      } else {
        const archlich = createEnemyInstance('zombie_boss', room.cx * 16 + 8, room.cy * 16 + 8, 11, room.id, true, difficulty);
        archlich.name = '👑 ВЕРХОВНЫЙ АРХИЛИЧ КАТАКОМБ';
        archlich.scale = 2.8;
        archlich.hp = Math.round(archlich.hp * 1.5);
        archlich.maxHp = archlich.hp;
        archlich.tint = '#e879f9';
        enemies.push(archlich);
      }
    }
    return enemies;
  }

  // 3. КАМПАНИЯ И БЕСКОНЕЧНЫЙ СПУСК
  if (room.type === 'spawn' || room.type === 'shrine' || room.type === 'shop') return enemies;

  // 1. Зависимость плотности спавна от сложности игры
  // Обычная (Normal / Casual): 0.65x – 0.75x
  // Кошмар (Nightmare): 1.0x
  // Ад / Пекло (Inferno): 1.3x – 1.5x (1.4x)
  const mobMultiplier = getDifficultyMobMultiplier(difficulty);

  // Boss Chamber
  if (room.type === 'boss') {
    const boss = createEnemyInstance('zombie_boss', room.cx * 16 + 8, room.cy * 16 + 8, floor, room.id, false, difficulty, room.biome);
    if (floor >= 12) {
      boss.name = '👑 ВЕРХОВНЫЙ ВЛАДЫКА АРХИЛИЧ';
      boss.scale = 2.8;
      boss.hp = Math.round(boss.hp * 1.6);
      boss.maxHp = boss.hp;
      boss.tint = '#e879f9';
    } else if (floor >= 9) {
      boss.name = '🔥 ПОВЕЛИТЕЛЬ ПЕПЛА И ИНФЕРНО';
      boss.tint = '#ea580c';
    } else if (floor >= 6) {
      boss.name = '🧪 КИСЛОТНЫЙ ПОЖИРАТЕЛЬ ГЛУБИН';
      boss.tint = '#65a30d';
    }
    enemies.push(boss);

    const minionTypes: EnemyType[] = ['zombie_witch', 'zombie_pyro', 'zombie_brute'];
    const minionCount = Math.max(2, Math.round(3 * mobMultiplier));
    for (let i = 0; i < minionCount; i++) {
      const mx = (room.cx - 3 + i * 3) * 16 + 8;
      const my = (room.cy + 3) * 16 + 8;
      enemies.push(createEnemyInstance(minionTypes[i % minionTypes.length], mx, my, floor, room.id, false, difficulty, room.biome));
    }
    return enemies;
  }

  const normalTypes: EnemyType[] = [
    'zombie_walker',
    'zombie_spitter',
    'zombie_runner',
    'zombie_brute',
    'zombie_witch',
    'zombie_pyro',
  ];

  // Зал Орды - 20-30 зомби (с учетом множителя сложности)
  if (room.type === 'horde') {
    const baseHordeCount = 20 + Math.floor(Math.random() * 11);
    const hordeCount = Math.max(10, Math.round(baseHordeCount * mobMultiplier));
    for (let i = 0; i < hordeCount; i++) {
      const rx = room.x + 2 + Math.floor(Math.random() * (room.w - 4));
      const ry = room.y + 2 + Math.floor(Math.random() * (room.h - 4));
      const chosenType = normalTypes[Math.floor(Math.random() * normalTypes.length)];
      enemies.push(
        createEnemyInstance(chosenType, rx * 16 + 8, ry * 16 + 8, floor, room.id, false, difficulty, room.biome)
      );
    }
    return enemies;
  }

  // Обитель Стража - 1 Мини-Босс и свита с плотностью по сложности
  if (room.type === 'elite') {
    const bossType: EnemyType = Math.random() < 0.5 ? 'zombie_brute' : 'zombie_pyro';
    enemies.push(
      createEnemyInstance(bossType, room.cx * 16 + 8, room.cy * 16 + 8, floor, room.id, true, difficulty, room.biome)
    );
    const minionCount = Math.max(2, Math.round(5 * mobMultiplier));
    for (let i = 0; i < minionCount; i++) {
      const rx = room.x + 2 + Math.floor(Math.random() * (room.w - 4));
      const ry = room.y + 2 + Math.floor(Math.random() * (room.h - 4));
      const chosenType = normalTypes[Math.floor(Math.random() * normalTypes.length)];
      enemies.push(
        createEnemyInstance(chosenType, rx * 16 + 8, ry * 16 + 8, floor, room.id, false, difficulty, room.biome)
      );
    }
    return enemies;
  }

  // Спокойная галерея (0-2 монстра, скейлинг по сложности)
  if (room.type === 'normal') {
    const isQuiet = Math.random() < 0.45;
    const baseCount = isQuiet ? (Math.random() < 0.5 ? 0 : 1) : 2 + Math.floor(Math.random() * 3);
    const count = Math.round(baseCount * mobMultiplier);

    for (let i = 0; i < count; i++) {
      const rx = room.x + 2 + Math.floor(Math.random() * (room.w - 4));
      const ry = room.y + 2 + Math.floor(Math.random() * (room.h - 4));
      const chosenType = normalTypes[Math.floor(Math.random() * normalTypes.length)];
      enemies.push(
        createEnemyInstance(chosenType, rx * 16 + 8, ry * 16 + 8, floor, room.id, false, difficulty, room.biome)
      );
    }
    return enemies;
  }

  // Сокровищницы и прочие залы
  const baseCount = room.type === 'treasure' ? 2 : 6;
  const count = Math.max(1, Math.round(baseCount * mobMultiplier));
  for (let i = 0; i < count; i++) {
    const rx = room.x + 2 + Math.floor(Math.random() * (room.w - 4));
    const ry = room.y + 2 + Math.floor(Math.random() * (room.h - 4));
    const chosenType = normalTypes[Math.floor(Math.random() * normalTypes.length)];
    enemies.push(
      createEnemyInstance(chosenType, rx * 16 + 8, ry * 16 + 8, floor, room.id, false, difficulty, room.biome)
    );
  }

  return enemies;
}

let itemIdCounter = 1;
export function createDrop(
  type: ItemDrop['type'],
  x: number,
  y: number,
  value: number = 1
): ItemDrop {
  return {
    id: itemIdCounter++,
    type,
    x,
    y,
    vx: (Math.random() - 0.5) * 50,
    vy: (Math.random() - 0.5) * 50,
    value,
    frame: 0,
    animTimer: Math.random() * 0.2,
    magnetized: false,
  };
}

let textIdCounter = 1;
export function createFloatingText(
  x: number,
  y: number,
  text: string,
  color: string = '#ffffff',
  size: number = 12
): FloatingText {
  return {
    id: textIdCounter++,
    x: x + (Math.random() - 0.5) * 12,
    y: y - 10,
    text,
    color,
    size,
    alpha: 1.0,
    life: 0,
    maxLife: 0.85,
    vy: -32,
  };
}

export function createBloodParticles(x: number, y: number, color = '#dc2626'): Particle[] {
  const count = 7 + Math.floor(Math.random() * 6);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 2.5,
      color,
      alpha: 0.9,
      life: 0,
      maxLife: 0.4 + Math.random() * 0.3,
      gravity: 180,
    });
  }
  return particles;
}

export function createSparkleParticles(x: number, y: number, color = '#ffd700'): Particle[] {
  const count = 6 + Math.floor(Math.random() * 4);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 60;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      size: 1.5 + Math.random() * 2,
      color,
      alpha: 1.0,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.3,
    });
  }
  return particles;
}

export function createVaseShatterParticles(x: number, y: number): Particle[] {
  const count = 10;
  const particles: Particle[] = [];
  const colors = ['#8d5b4c', '#b37661', '#633d32', '#d49b82'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 100;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1.0,
      life: 0,
      maxLife: 0.5,
      gravity: 220,
    });
  }
  return particles;
}
