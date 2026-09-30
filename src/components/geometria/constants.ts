import type {
  DifficultyConfig,
  DifficultyMultiplier,
  PlayerCore,
  PlayerCoreType,
  MetaUpgrade,
  WeaponId,
  EvolutionWeaponId,
  PassiveId,
  DimensionPact
} from './types';

export const DIFFICULTY_CONFIGS: Record<DifficultyMultiplier, DifficultyConfig> = {
  1: {
    multiplier: 1,
    name: 'Стабильная Геометрия',
    subtitle: 'Базовое измерение',
    badgeColor: '#00ffcc',
    enemyHpMult: 1.0,
    enemySpeedMult: 1.0,
    enemyCountMult: 1.0,
    eliteChance: 0.05,
    shardMultiplier: 1.0,
    scoreMultiplier: 1.0,
    description: 'Идеальный баланс евклидовой геометрии. Отлично подходит для изучения синергий и прокачки.',
    mechanics: [
      'Стандартный спавн врагов',
      'Обычная скорость снарядов',
      'Элиты появляются редко (5%)',
      'Множитель квантов x1.0'
    ]
  },
  2: {
    multiplier: 2,
    name: 'Возмущение Плоскости',
    subtitle: 'Нарушение симметрии',
    badgeColor: '#38bdf8',
    enemyHpMult: 1.5,
    enemySpeedMult: 1.15,
    enemyCountMult: 1.3,
    eliteChance: 0.15,
    shardMultiplier: 2.5,
    scoreMultiplier: 2.2,
    description: 'Враги движутся быстрее, ряды пополняют стреляющие пента-турели.',
    mechanics: [
      '+50% HP врагов, +15% скорость',
      'Враги-турели стреляют тройными залпами',
      'Шанс элит 15%',
      'Множитель квантов x2.5'
    ]
  },
  4: {
    multiplier: 4,
    name: 'Фрактальный Разлом',
    subtitle: 'Топологический сдвиг',
    badgeColor: '#a855f7',
    enemyHpMult: 2.4,
    enemySpeedMult: 1.3,
    enemyCountMult: 1.7,
    eliteChance: 0.3,
    shardMultiplier: 6.0,
    scoreMultiplier: 5.0,
    description: 'Толпы уплотняются. Появляются мерцающие фантомные ромбы и элитные ауры.',
    mechanics: [
      '+140% HP врагов, +30% скорость',
      'Элиты получают щиты и ауры ускорения',
      'Боссы выпускают лазерные лучи',
      'Множитель квантов x6.0'
    ]
  },
  8: {
    multiplier: 8,
    name: 'Энтропия Измерений',
    subtitle: 'Коллапс векторов',
    badgeColor: '#f59e0b',
    enemyHpMult: 4.0,
    enemySpeedMult: 1.45,
    enemyCountMult: 2.3,
    eliteChance: 0.5,
    shardMultiplier: 15.0,
    scoreMultiplier: 12.0,
    description: 'Уничтоженные враги взрываются смертоносными осколочными кольцами!',
    mechanics: [
      '+300% HP врагов, +45% скорость',
      'Смертельная шрапнель при гибели врагов',
      'Каждый второй элитный враг',
      'Множитель квантов x15.0'
    ]
  },
  16: {
    multiplier: 16,
    name: 'Сингулярный Коллапс',
    subtitle: 'Абсолютный шторм',
    badgeColor: '#ef4444',
    enemyHpMult: 6.5,
    enemySpeedMult: 1.65,
    enemyCountMult: 3.0,
    eliteChance: 0.7,
    shardMultiplier: 40.0,
    scoreMultiplier: 30.0,
    description: 'Вражеские пули рикошетят от стенок арены! Непрерывный напор свирепых полигонов.',
    mechanics: [
      '+550% HP врагов, +65% скорость',
      'Рикошет вражеских снарядов от границ экрана',
      'Двойные аффиксы у элиты',
      'Множитель квантов x40.0'
    ]
  },
  32: {
    multiplier: 32,
    name: 'Неевклидов Хаос',
    subtitle: 'Искривление реальности',
    badgeColor: '#ec4899',
    enemyHpMult: 11.0,
    enemySpeedMult: 1.9,
    enemyCountMult: 4.2,
    eliteChance: 0.85,
    shardMultiplier: 100.0,
    scoreMultiplier: 80.0,
    description: 'Экстремальный Geometric Bullet Hell. Враги телепортируются, искажая пространство.',
    mechanics: [
      '+1000% HP врагов, +90% скорость',
      'Плотные узоры Danmaku от боссов и элит',
      'Враги регенерируют и ускоряют друг друга',
      'Множитель квантов x100.0'
    ]
  },
  64: {
    multiplier: 64,
    name: 'Апофеоз Бесконечности ^',
    subtitle: 'За пределами геометрии',
    badgeColor: '#ffd700',
    enemyHpMult: 18.0,
    enemySpeedMult: 2.2,
    enemyCountMult: 5.5,
    eliteChance: 0.95,
    shardMultiplier: 300.0,
    scoreMultiplier: 250.0,
    description: 'Для истинных демиургов. Граница между выживанием и чистым восторгом.',
    mechanics: [
      '+1700% HP врагов, +120% скорость',
      'Почти все враги элитные с тройными аффиксами',
      'Бесконечные волны и максимальный фарм квантов',
      'Множитель квантов x300.0'
    ]
  }
};

export const PLAYER_CORES: Record<PlayerCoreType, PlayerCore> = {
  delta: {
    id: 'delta',
    name: 'Дельта-3',
    title: 'Быстрый Клинок',
    shapeName: 'Треугольник',
    color: '#00ffcc',
    glowColor: 'rgba(0, 255, 204, 0.6)',
    sides: 3,
    baseHp: 90,
    baseSpeed: 340,
    baseDamage: 24,
    description: 'Легкий и стремительный треугольный корпус. Высокий крит-шанс (+25%) и повышенная мобильность.',
    specialAbility: 'Гипер-Рассечение',
    specialAbilityDesc: 'Мгновенный рывок сквозь экран, испепеляющий врагов на пути лазерным следом (400% урона).',
    abilityCooldown: 6.0
  },
  tetra: {
    id: 'tetra',
    name: 'Тетра-4',
    title: 'Монолитный Страж',
    shapeName: 'Квадрат',
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.6)',
    sides: 4,
    baseHp: 150,
    baseSpeed: 280,
    baseDamage: 20,
    description: 'Крепкий ромбовидный бастион. Обладает естественной броней (-20% урона) и барьером.',
    specialAbility: 'ЭМИ-Импульс',
    specialAbilityDesc: 'Взрывная волна уничтожает все пули врагов, оглушает их на 2.5 сек и дает 3 сек неуязвимости.',
    abilityCooldown: 8.0
  },
  hexa: {
    id: 'hexa',
    name: 'Гекса-6',
    title: 'Синтезатор Роя',
    shapeName: 'Шестиугольник',
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.6)',
    sides: 6,
    baseHp: 110,
    baseSpeed: 300,
    baseDamage: 22,
    description: 'Гармоничный гексагональный узел. Начинает с 2 постоянными орбитальными щитами.',
    specialAbility: 'Фотонная Призма',
    specialAbilityDesc: 'Разворачивает 3 стационарные гео-турели, ведущие непрерывный огонь по ближайшим целям.',
    abilityCooldown: 10.0
  },
  octa: {
    id: 'octa',
    name: 'Окта-8',
    title: 'Ядро Сингулярности',
    shapeName: 'Восьмиугольник',
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.6)',
    sides: 8,
    baseHp: 130,
    baseSpeed: 290,
    baseDamage: 26,
    description: 'Древний полиэдр. Удвоенный радиус сбора квантовых осколков и шанс двойного лута.',
    specialAbility: 'Луч Судного Дня',
    specialAbilityDesc: 'Выпускает сфокусированный мега-луч на 3.5 сек, плавящий толпы врагов и боссов.',
    abilityCooldown: 12.0
  }
};

// 20 Standard Weapons Definitions
export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  iconSides: number;
  color: string;
  baseCooldown: number;
  baseDamage: number;
}

export const ALL_WEAPONS_LIST: WeaponDef[] = [
  { id: 'pulse_needle', name: 'Игольчатый Излучатель', desc: 'Скоростные лазерные иглы прямого прицельного огня.', iconSides: 3, color: '#38bdf8', baseCooldown: 0.35, baseDamage: 22 },
  { id: 'orbital_gliders', name: 'Орбитальные Диски', desc: 'Вращающиеся острые клинки вокруг ядра.', iconSides: 6, color: '#a855f7', baseCooldown: 0.0, baseDamage: 24 },
  { id: 'void_seekers', name: 'Искатели Пустоты', desc: 'Самонаводящиеся ромбовидные ракеты.', iconSides: 4, color: '#ec4899', baseCooldown: 0.9, baseDamage: 30 },
  { id: 'fractal_mines', name: 'Фрактальные Мины', desc: 'Выбрасывает мины с каскадными осколочными взрывами.', iconSides: 5, color: '#f59e0b', baseCooldown: 1.8, baseDamage: 60 },
  { id: 'singularity_nova', name: 'Кольцо Сингулярности', desc: 'Периодическая круговая ударная волна гео-энергии.', iconSides: 8, color: '#00ffcc', baseCooldown: 2.8, baseDamage: 45 },
  { id: 'tesla_polygon', name: 'Тесла-Полигон', desc: 'Разряды молний, цепно связывающие до 5 врагов.', iconSides: 3, color: '#facc15', baseCooldown: 1.2, baseDamage: 35 },
  { id: 'prism_beam', name: 'Призматический Луч', desc: 'Вращающийся непрерывный лазерный луч-секатор.', iconSides: 4, color: '#06b6d4', baseCooldown: 3.5, baseDamage: 25 },
  { id: 'bouncing_shuriken', name: 'Гео-Сюрикен', desc: 'Быстрые сюрикены, рикошетящие от врагов и стен арены.', iconSides: 4, color: '#10b981', baseCooldown: 1.1, baseDamage: 28 },
  { id: 'vortex_gravity', name: 'Гравитационная Воронка', desc: 'Черная дыра, затягивающая толпы врагов в эпицентр.', iconSides: 8, color: '#8b5cf6', baseCooldown: 3.2, baseDamage: 50 },
  { id: 'plasma_mortar', name: 'Плазменная Мортира', desc: 'Высокоточные плазменные бомбы с мощным взрывом по площади.', iconSides: 5, color: '#ef4444', baseCooldown: 2.2, baseDamage: 75 },
  { id: 'hex_drone', name: 'Гекса-Дрон', desc: 'Автономный дрон сопровождения, стреляющий по целям.', iconSides: 6, color: '#c084fc', baseCooldown: 0.5, baseDamage: 18 },
  { id: 'sonic_rings', name: 'Звуковые Кольца', desc: 'Серия расширяющихся колец, отталкивающих и ранящих врагов.', iconSides: 0, color: '#38bdf8', baseCooldown: 2.0, baseDamage: 32 },
  { id: 'mirror_boomerang', name: 'Зеркальный Бумеранг', desc: 'Полигональный клинок, летящий вперед и возвращающийся обратно.', iconSides: 3, color: '#34d399', baseCooldown: 1.4, baseDamage: 38 },
  { id: 'toxic_matrix', name: 'Ядовитая Матрица', desc: 'Оставляет на арене светящиеся токсичные поля с периодическим уроном.', iconSides: 6, color: '#84cc16', baseCooldown: 1.5, baseDamage: 16 },
  { id: 'meteor_swarm', name: 'Метеоритный Ливень', desc: 'С небес обрушиваются горящие додекаэдры в случайные зоны.', iconSides: 5, color: '#f97316', baseCooldown: 2.4, baseDamage: 80 },
  { id: 'orbital_laser_satellite', name: 'Лазерный Спутник', desc: 'Орбитальный сателлит на дальней дистанции с лазерным огнем.', iconSides: 4, color: '#00ffcc', baseCooldown: 0.7, baseDamage: 26 },
  { id: 'cryo_spikes', name: 'Крио-Шипы', desc: 'Ледяные кристаллы, замедляющие скорость врагов на 50%.', iconSides: 6, color: '#67e8f9', baseCooldown: 1.6, baseDamage: 30 },
  { id: 'saw_blade', name: 'Пила Измерений', desc: 'Гигантская вращающаяся пила, медленно режущая всё насквозь.', iconSides: 8, color: '#e11d48', baseCooldown: 2.5, baseDamage: 40 },
  { id: 'cluster_dodecahedron', name: 'Кластерная Граната', desc: 'Снаряд при детонации разделяется на 6 меньших взрывных гранат.', iconSides: 5, color: '#d97706', baseCooldown: 2.6, baseDamage: 55 },
  { id: 'chaos_spark', name: 'Искра Хаоса', desc: 'Зигзагообразная шаровая молния, хаотично мечущаяся по экрану.', iconSides: 0, color: '#f43f5e', baseCooldown: 1.3, baseDamage: 42 }
];

// 10 Evolution Recipes (Max Level Weapon + Required Passive)
export interface EvolutionRecipe {
  evoId: EvolutionWeaponId;
  baseWeaponId: WeaponId;
  requiredPassiveId: PassiveId;
  name: string;
  titleRu: string;
  desc: string;
  color: string;
  iconSides: number;
}

export const EVOLUTION_RECIPES: Record<EvolutionWeaponId, EvolutionRecipe> = {
  hyper_rail: {
    evoId: 'hyper_rail',
    baseWeaponId: 'pulse_needle',
    requiredPassiveId: 'quantum_overclock',
    name: 'Фотонный Рельсотрон',
    titleRu: 'ЭВОЛЮЦИЯ: РЕЛЬСОТРОН',
    desc: 'Сквозной гипер-луч с бесконечным пробиванием и увеличенной частотой огня.',
    color: '#00ffff',
    iconSides: 3
  },
  event_horizon: {
    evoId: 'event_horizon',
    baseWeaponId: 'orbital_gliders',
    requiredPassiveId: 'crystalline_armor',
    name: 'Горизонт Событий',
    titleRu: 'ЭВОЛЮЦИЯ: ГОРИЗОНТ',
    desc: 'Сплошное кольцо клинков смерти, поглощающее пули врагов и режущее боссов.',
    color: '#ffd700',
    iconSides: 6
  },
  quantum_swarm: {
    evoId: 'quantum_swarm',
    baseWeaponId: 'void_seekers',
    requiredPassiveId: 'gravity_grip',
    name: 'Квантовый Рой',
    titleRu: 'ЭВОЛЮЦИЯ: РОЙ ПУСТОТЫ',
    desc: 'Непрерывный поток гипер-скоростных самонаводящихся микро-игл.',
    color: '#ec4899',
    iconSides: 4
  },
  supernova_tetra: {
    evoId: 'supernova_tetra',
    baseWeaponId: 'fractal_mines',
    requiredPassiveId: 'fractal_scale',
    name: 'Сверхновая Тетраэдра',
    titleRu: 'ЭВОЛЮЦИЯ: СВЕРХНОВАЯ',
    desc: 'Цепные термоядерные взрывы, сотрясающие всё измерение.',
    color: '#f59e0b',
    iconSides: 5
  },
  entropy_tsunami: {
    evoId: 'entropy_tsunami',
    baseWeaponId: 'singularity_nova',
    requiredPassiveId: 'kinetic_vector',
    name: 'Цунами Энтропии',
    titleRu: 'ЭВОЛЮЦИЯ: ЦУНАМИ',
    desc: 'Каскадные волны сингулярности с колоссальным отталкиванием и уроном.',
    color: '#00ffcc',
    iconSides: 8
  },
  thunder_god_matrix: {
    evoId: 'thunder_god_matrix',
    baseWeaponId: 'tesla_polygon',
    requiredPassiveId: 'overcharge_battery',
    name: 'Матрица Громовержца',
    titleRu: 'ЭВОЛЮЦИЯ: ГРОМОВЕРЖЕЦ',
    desc: 'Шторм цепных молний поражает до 18 врагов одновременно с крит-эффектом.',
    color: '#facc15',
    iconSides: 3
  },
  death_star_prism: {
    evoId: 'death_star_prism',
    baseWeaponId: 'prism_beam',
    requiredPassiveId: 'prism_focus',
    name: 'Призма Смерти',
    titleRu: 'ЭВОЛЮЦИЯ: ПРИЗМА СМЕРТИ',
    desc: '4 перекрестных лазера вращаются вокруг ядра, расщепляя все на атомы.',
    color: '#06b6d4',
    iconSides: 4
  },
  infinite_ricochet: {
    evoId: 'infinite_ricochet',
    baseWeaponId: 'bouncing_shuriken',
    requiredPassiveId: 'kinetic_momentum',
    name: 'Бесконечный Рикошет',
    titleRu: 'ЭВОЛЮЦИЯ: РИКОШЕТ',
    desc: 'Сюрикены не исчезают, рикошетят до 15 раз и делятся на части при попадании.',
    color: '#10b981',
    iconSides: 4
  },
  black_hole_singularity: {
    evoId: 'black_hole_singularity',
    baseWeaponId: 'vortex_gravity',
    requiredPassiveId: 'dimensional_flux',
    name: 'Истинная Черная Дыра',
    titleRu: 'ЭВОЛЮЦИЯ: ЧЕРНАЯ ДЫРА',
    desc: 'Гигантская гравитационная воронка мгновенно засасывает и стирает обычных врагов.',
    color: '#8b5cf6',
    iconSides: 8
  },
  orbital_cataclysm: {
    evoId: 'orbital_cataclysm',
    baseWeaponId: 'plasma_mortar',
    requiredPassiveId: 'volatile_fuel',
    name: 'Орбитальный Катаклизм',
    titleRu: 'ЭВОЛЮЦИЯ: КАТАКЛИЗМ',
    desc: 'Ковровые бомбардировки с непрерывными плазменными штормами.',
    color: '#ef4444',
    iconSides: 5
  }
};

// 20 Passive Items Definitions
export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string;
  color: string;
}

export const ALL_PASSIVES_LIST: PassiveDef[] = [
  { id: 'kinetic_vector', name: 'Кинетический Вектор', desc: '+12% к скорости передвижения за уровень.', color: '#38bdf8' },
  { id: 'crystalline_armor', name: 'Кристаллическая Броня', desc: '-15% получаемого урона за уровень (до 70%).', color: '#60a5fa' },
  { id: 'gravity_grip', name: 'Гравитационный Захват', desc: '+40% к радиусу сбора кристаллов и квантов.', color: '#a855f7' },
  { id: 'quantum_overclock', name: 'Квантовый Оверклок', desc: '+15% к скорострельности всех орудий за уровень.', color: '#00ffcc' },
  { id: 'fractal_scale', name: 'Фрактальный Масштаб', desc: '+25% к размеру всех снарядов и зон взрывов.', color: '#f59e0b' },
  { id: 'prism_focus', name: 'Призма Фокуса', desc: '+10% к шансу крита и +35% к крит. урону.', color: '#ffd700' },
  { id: 'nano_repair', name: 'Нано-Регенератор', desc: '+0.8 HP/сек пассивного восстановления здоровья.', color: '#10b981' },
  { id: 'overcharge_battery', name: 'Перегрузочная Батарея', desc: '+20% к урону способностей и снижению кулдауна.', color: '#facc15' },
  { id: 'kinetic_momentum', name: 'Кинетический Импульс', desc: '+30% к скорости полета снарядов.', color: '#2dd4bf' },
  { id: 'dimensional_flux', name: 'Поток Измерений', desc: '+25% к длительности лучей, зон и эффектов.', color: '#c084fc' },
  { id: 'volatile_fuel', name: 'Нестабильный Эфир', desc: '+30% к урону от взрывов и минных полей.', color: '#fb923c' },
  { id: 'vampiric_matrix', name: 'Вампирическая Матрица', desc: '+4% шанс восстановить 2 HP при убийстве формы.', color: '#f43f5e' },
  { id: 'energy_shield_generator', name: 'Генератор Энергощита', desc: '+35 к макс щиту и +2 щита/сек регенерации.', color: '#38bdf8' },
  { id: 'chrono_dilation', name: 'Хроно-Дилатация', desc: 'Замедляет всех врагов в радиусе 180px на 20%.', color: '#818cf8' },
  { id: 'luck_algorithm', name: 'Алгоритм Удачи', desc: '+15% к шансу выпадения редких карт, критов и лута.', color: '#fbbf24' },
  { id: 'greed_prism', name: 'Призма Жадности', desc: '+25% к количеству получаемых квантовых осколков.', color: '#e879f9' },
  { id: 'berserk_resonator', name: 'Резонатор Берсерка', desc: 'Увеличивает урон до +100% при низком здоровье.', color: '#ef4444' },
  { id: 'thorns_reflector', name: 'Отражатель Шипов', desc: 'Возвращает 150% полученного урона атакующим.', color: '#4ade80' },
  { id: 'pierce_accelerator', name: 'Ускоритель Пробивания', desc: '+1 дополнительное пробивание для всех пуль.', color: '#93c5fd' },
  { id: 'multi_fork', name: 'Фазовый Разветвитель', desc: '+1 дополнительный снаряд ко всем видам оружия!', color: '#a78bfa' }
];

// Boss Dimension Pacts (Mutation System)
export const DIMENSION_PACTS: DimensionPact[] = [
  {
    id: 'glass_cannon',
    title: 'Стеклянный Колосс',
    description: 'Колоссальная мощь за счет целостности корпуса.',
    boon: '+120% ко всему наносимому урону',
    curse: '-40% максимального запаса здоровья',
    icon: '🔮',
    color: '#f43f5e'
  },
  {
    id: 'time_warp',
    title: 'Искажение Времени',
    description: 'Пространство замедляется, но энтропия измерений растет.',
    boon: 'Все враги и их снаряды на 30% медленнее',
    curse: 'Количество врагов увеличено на 50%',
    icon: '⏳',
    color: '#38bdf8'
  },
  {
    id: 'quantum_greed',
    title: 'Жажда Геометрии',
    description: 'Умножение квантового дохода с риском потерь.',
    boon: '+250% к выпадению квантовых осколков',
    curse: 'При получении урона теряется 4% осколков',
    icon: '💎',
    color: '#ffd700'
  },
  {
    id: 'photon_cascade',
    title: 'Фотонный Каскад',
    description: 'Шквал геометрических орудий с перегрузкой систем.',
    boon: '+2 дополнительных снаряда ко ВСЕМ видам оружия',
    curse: '+25% время перезарядки рывка и ультимейта',
    icon: '⚡',
    color: '#a855f7'
  },
  {
    id: 'vampiric_pact',
    title: 'Вампирический Разлом',
    description: 'Пожирание энергии поверженных форм.',
    boon: '10% шанс восстановить 4 HP при любом убийстве',
    curse: 'Пассивная регенерация и щиты полностью отключены',
    icon: '🩸',
    color: '#e11d48'
  },
  {
    id: 'hyper_resonance_pact',
    title: 'Вечный Гипер-Резонанс',
    description: 'Постоянная перегрузка боевого ядра.',
    boon: 'Длительность Гипер-Резонанса увеличена втрое (15 сек)',
    curse: 'Вражеские элиты наносят на 35% больше урона',
    icon: '🔥',
    color: '#00ffcc'
  }
];

// Meta Upgrades (Quantum Core Shop)
export const META_UPGRADES_LIST: MetaUpgrade[] = [
  {
    id: 'meta_hp',
    name: 'Полигональное Укрепление',
    desc: 'Увеличивает максимальный запас здоровья на старте.',
    currentLevel: 0,
    maxLevel: 10,
    costBase: 50,
    costMultiplier: 1.8,
    icon: '❤️',
    valuePerLevel: 12,
    formatValue: (lvl) => `+${lvl * 12} HP`
  },
  {
    id: 'meta_dmg',
    name: 'Фокусировка Квантов',
    desc: 'Повышает базовый урон всех видов вооружения.',
    currentLevel: 0,
    maxLevel: 10,
    costBase: 70,
    costMultiplier: 1.9,
    icon: '⚡',
    valuePerLevel: 8,
    formatValue: (lvl) => `+${lvl * 8}% урона`
  },
  {
    id: 'meta_speed',
    name: 'Кинетический Вектор',
    desc: 'Увеличивает скорость движения ядра.',
    currentLevel: 0,
    maxLevel: 5,
    costBase: 100,
    costMultiplier: 2.2,
    icon: '🚀',
    valuePerLevel: 6,
    formatValue: (lvl) => `+${lvl * 6}% скорости`
  },
  {
    id: 'meta_magnet',
    name: 'Гравитационный Захват',
    desc: 'Расширяет радиус притяжения кристаллов опыта и осколков.',
    currentLevel: 0,
    maxLevel: 5,
    costBase: 60,
    costMultiplier: 2.0,
    icon: '🧲',
    valuePerLevel: 30,
    formatValue: (lvl) => `+${lvl * 30}% радиус`
  },
  {
    id: 'meta_reroll',
    name: 'Матрица Переброса',
    desc: 'Дает дополнительные попытки переброса карточек при получении уровня.',
    currentLevel: 0,
    maxLevel: 5,
    costBase: 150,
    costMultiplier: 2.5,
    icon: '🎲',
    valuePerLevel: 1,
    formatValue: (lvl) => `+${lvl} перебросов`
  },
  {
    id: 'meta_banish',
    name: 'Матрица Изгнания (Banish)',
    desc: 'Позволяет навсегда исключать нежелательные модули из пула забега.',
    currentLevel: 0,
    maxLevel: 5,
    costBase: 200,
    costMultiplier: 2.5,
    icon: '🚫',
    valuePerLevel: 1,
    formatValue: (lvl) => `+${lvl} изгнаний`
  },
  {
    id: 'meta_revive',
    name: 'Квантовый Реаниматор',
    desc: 'Позволяет восстать после фатального урона с 60% HP.',
    currentLevel: 0,
    maxLevel: 2,
    costBase: 500,
    costMultiplier: 4.0,
    icon: '✨',
    valuePerLevel: 1,
    formatValue: (lvl) => `${lvl} возрожд.`
  },
  {
    id: 'meta_greed',
    name: 'Алхимия Осколков',
    desc: 'Увеличивает количество квантовых осколков, выпадающих в забегах.',
    currentLevel: 0,
    maxLevel: 8,
    costBase: 80,
    costMultiplier: 2.0,
    icon: '💎',
    valuePerLevel: 15,
    formatValue: (lvl) => `+${lvl * 15}% осколков`
  }
];

// Quantum Reactor Mastery Tree (4th new mechanic)
export interface ReactorNode {
  id: string;
  branch: 'assault' | 'bastion' | 'singularity';
  name: string;
  desc: string;
  cost: number;
  icon: string;
}

export const REACTOR_NODES: ReactorNode[] = [
  // Assault branch
  { id: 'node_crit_mastery', branch: 'assault', name: 'Сверхкритический Резонанс', desc: 'Критические удары вызывают круговые вспышки молний на 50% урона.', cost: 300, icon: '💥' },
  { id: 'node_hyper_projectiles', branch: 'assault', name: 'Двойная Синхронизация', desc: 'Все стартовые орудия сразу получают +1 дополнительный снаряд.', cost: 600, icon: '🔱' },
  { id: 'node_execute', branch: 'assault', name: 'Протокол Ликвидации', desc: 'Враги с HP ниже 15% мгновенно дезинтегрируются при любом попадании.', cost: 1200, icon: '⚡' },

  // Bastion branch
  { id: 'node_reactive_barrier', branch: 'bastion', name: 'Реактивный Барьер', desc: 'При падении щита до 0 происходит ЭМИ-взрыв, уничтожающий все пули врагов.', cost: 300, icon: '🛡️' },
  { id: 'node_emergency_phase', branch: 'bastion', name: 'Фазовый Сдвиг', desc: 'При получении урона свыше 25 HP вы становитесь неуязвимы на 1.5 сек.', cost: 600, icon: '🌀' },
  { id: 'node_vampire_lord', branch: 'bastion', name: 'Квантовый Симбиоз', desc: 'Убийства боссов и элит восстанавливают 20% макс HP и полностью заряжают щит.', cost: 1200, icon: '💖' },

  // Singularity branch
  { id: 'node_combo_extend', branch: 'singularity', name: 'Удлиненный Резонанс', desc: 'Время сохранения комбо увеличено на 100%, Гипер-Резонанс дает x3 урон.', cost: 300, icon: '🔥' },
  { id: 'node_luck_overflow', branch: 'singularity', name: 'Сингулярная Удача', desc: 'При повышении уровня всегда предлагается 5 карточек вместо 4.', cost: 600, icon: '⭐' },
  { id: 'node_free_evolution', branch: 'singularity', name: 'Эволюционный Прорыв', desc: 'Оружие может эволюционировать без наличия пассивного предмета в инвентаре.', cost: 1500, icon: '🌌' }
];
