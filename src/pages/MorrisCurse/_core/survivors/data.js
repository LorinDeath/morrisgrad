// Данные забега «Проклятых»: классы → навыки, оружие (только снаряды), пассивки, враги, комнаты.
// id классов и навыков совпадают с сервером (server/classes.ts, server/skills.ts):
//   warrior → backstab, spearman → pierce, rogue → trick_strike, mage → fireball.

// tiles — тайлсет пола подземелья (src/assets/mc/tiles_<theme>.png, tilesets_new): Склеп=камень, Бездна=воздух,
// Испытание отражений=лёд (зеркала Кьют), Испытание Обители=огонь (сердце под Миром Адского Пламени). Открытый мир — прежний tiles_atlas.
export const RUN_ROOMS = {
  crypt: { id: 'crypt', name: 'Склеп', theme: 'crypt', tiles: 'stone', color: '#ef4444', desc: 'Каменный склеп под Миром Адского Пламени. Бесы, упыри и Страж Проклятия.' },
  abyss: { id: 'abyss', name: 'Бездна', theme: 'abyss', tiles: 'air', color: '#22d3ee', desc: 'Осколок Аринара в пустоте. Те же твари — в космическом обличье.' },
  // мини-игры хаба (тот же движок комнат; награды и квестовые события — на сервере)
  duel: { id: 'duel', name: 'Испытание отражений', theme: 'abyss', tiles: 'ice', color: '#f472b6', mode: 'duel', desc: 'Кьют выпускает своё отражение. Победите его — можно урезать себе здоровье (50% / 30%) ради звёздных заданий.' },
  trial: { id: 'trial', name: 'Испытание Обители', theme: 'crypt', tiles: 'fire', color: '#fbbf24', mode: 'trial', desc: 'Сердце Обители в центре зала. Удержите его 8 волн — твари идут к нему, а не к вам.' },
};
// Испытание Обители: 8 волн по 20 с (сервер проверяет время ≥ волна × 20 с)
export const TRIAL = { waves: 8, every: 20, heartHp: 600, heartR: 1.6 };
export const TRIAL_WAVES = [
  { imp: 14 }, { imp: 12, bat: 8 }, { ghoul: 8, blade_fly: 6 }, { imp: 10, spitter: 5, blade_fly: 6 },
  { ghoul: 10, golem: 2, bat: 8 }, { dream_moth: 8, rot_glitch: 8, ghoul: 6 }, { golem: 4, spitter: 6, blade_fly: 10 }, { warden: 1, ghoul: 10, imp: 12 },
];

// Классовые определения забега. stats с сервера (hp/armor/minAtk/maxAtk) приходят в welcome
// и переводятся в параметры забега в classRunStats().
export const RUN_CLASSES = {
  soul: {
    id: null, name: 'Душа', color: '#a5f3fc', model: 'soul',
    startWeapon: 'soul_spark', ability: null,
    affinity: ['soul_spark', 'chain_bolt', 'orbit_skulls', 'moon_orb'],
    blurb: 'Без тела. Искры души сами ищут цель. Обретите тело у Алтаря для навыка класса.',
  },
  warrior: {
    id: 'warrior', hero: 'Велес', name: 'Воин', color: '#38bdf8', model: 'warrior',
    startWeapon: 'war_axe', ability: 'backstab',
    affinity: ['war_axe', 'orbit_skulls', 'ice_fan', 'glyph_mine'],
    blurb: 'Крепкий и бронированный. Метательные топоры возвращаются как бумеранг.',
  },
  spearman: {
    id: 'spearman', hero: 'Нофорд', name: 'Копейщик', color: '#ef4444', model: 'spearman',
    startWeapon: 'spear', ability: 'pierce',
    affinity: ['spear', 'ice_fan', 'daggers', 'thorn_bow'],
    blurb: 'Копья пронзают ряды врагов насквозь. Навык игнорирует броню.',
  },
  rogue: {
    id: 'rogue', hero: 'Кавега', name: 'Разбойник', color: '#22c55e', model: 'rogue',
    startWeapon: 'daggers', ability: 'trick_strike',
    affinity: ['daggers', 'chain_bolt', 'soul_spark', 'fly_blades', 'plague_flask'],
    blurb: 'Быстрые кинжалы веером. Навык лечит часть нанесённого урона.',
  },
  mage: {
    id: 'mage', hero: 'Мариэль', name: 'Маг', color: '#a855f7', model: 'mage',
    startWeapon: 'fire_spark', ability: 'fireball',
    affinity: ['fire_spark', 'chain_bolt', 'orbit_skulls', 'sun_beam', 'split_shard'],
    blurb: 'Хрупкий, но смертоносный. Огненные искры взрываются по площади.',
  },
};

// Отображаемое имя: персонаж по референсам + роль (id класса для сервера не меняется)
export function displayClassName(classId, fallback = 'Душа') {
  const c = RUN_CLASSES[classId];
  if (!c || !classId) return fallback;
  return c.hero ? `${c.hero} · ${c.name}` : c.name;
}

// Активные навыки классов (имена/описания/кд как на сервере; кд в забеге ускорен ×0.4)
export const ABILITIES = {
  backstab: {
    id: 'backstab', name: 'Удар в спину', icon: '🗡️', serverCooldown: 30, runCooldown: 12,
    desc: 'Рывок за спину сильнейшего врага рядом и веер из 10 клинков (урон ×1.5 от замаха).',
  },
  pierce: {
    id: 'pierce', name: 'Колющий удар', icon: '🔱', serverCooldown: 20, runCooldown: 8,
    desc: 'Гигантское копьё насквозь через всю линию. Урон ×1.2, полностью игнорирует броню.',
  },
  trick_strike: {
    id: 'trick_strike', name: 'Коварный удар', icon: '🌀', serverCooldown: 30, runCooldown: 12,
    desc: 'Вихрь из 16 кинжалов (урон ×1.1). Восстанавливает 10% нанесённого урона.',
  },
  fireball: {
    id: 'fireball', name: 'Огненный шар', icon: '☄️', serverCooldown: 40, runCooldown: 16,
    desc: 'Огромный огненный шар в гущу врагов: взрыв ×10 урона по площади.',
  },
};

// Оружие: всё — снаряды. lv 1..8; per-level надбавки описаны в levels.
export const WEAPONS = {
  soul_spark: {
    name: 'Искра души', icon: '✨', color: 0x67e8f9,
    base: { dmg: 9, cd: 1.1, count: 1, speed: 13, pierce: 1, size: 0.28, life: 2.2, homing: 6 },
    levels: ['+1 искра', 'Урон +30%', '+1 искра', 'Перезарядка -15%', '+1 искра', 'Урон +40%', '+2 искры'],
    desc: 'Самонаводящиеся искры.',
  },
  war_axe: {
    name: 'Метательный топор', icon: '🪓', color: 0xcbd5e1,
    base: { dmg: 16, cd: 1.6, count: 1, speed: 14, pierce: 99, size: 0.45, life: 1.6, boomerang: true, knock: 1.6 },
    levels: ['+1 топор', 'Урон +30%', 'Размер +25%', '+1 топор', 'Перезарядка -15%', 'Урон +40%', '+1 топор'],
    desc: 'Вращающиеся топоры летят и возвращаются, пронзая всех.',
  },
  spear: {
    name: 'Копьё', icon: '🔱', color: 0xfbbf24,
    base: { dmg: 14, cd: 1.3, count: 1, speed: 24, pierce: 4, size: 0.3, life: 1.2, knock: 0.8 },
    levels: ['Пробитие +2', 'Урон +30%', '+1 копьё', 'Перезарядка -15%', 'Пробитие +3', '+1 копьё', 'Урон +50%'],
    desc: 'Быстрые копья к ближайшему врагу, пронзают нескольких.',
  },
  daggers: {
    name: 'Кинжалы', icon: '🗡️', color: 0xe2e8f0,
    base: { dmg: 6, cd: 0.55, count: 2, speed: 22, pierce: 1, size: 0.22, life: 0.9, spread: 0.18, bleed: 1.5 },
    levels: ['+1 кинжал', 'Урон +30%', '+1 кинжал', 'Перезарядка -15%', '+1 кинжал', 'Пробитие +1', '+2 кинжала'],
    desc: 'Веер кинжалов по направлению взгляда.',
  },
  fire_spark: {
    name: 'Огненные искры', icon: '🔥', color: 0xf97316,
    base: { dmg: 12, cd: 1.4, count: 1, speed: 11, pierce: 1, size: 0.36, life: 1.8, explode: 2.2, burn: 3 },
    levels: ['Радиус +25%', 'Урон +30%', '+1 искра', 'Перезарядка -15%', 'Радиус +25%', '+1 искра', 'Урон +50%'],
    desc: 'Огненные снаряды взрываются при попадании.',
  },
  orbit_skulls: {
    name: 'Кольцо черепов', icon: '💀', color: 0xfef3c7,
    base: { dmg: 8, cd: 4.5, count: 2, speed: 0, pierce: 999, size: 0.4, life: 3.0, orbit: 2.6, knock: 1.2 },
    levels: ['+1 череп', 'Урон +30%', 'Длительность +1с', '+1 череп', 'Радиус +20%', 'Урон +40%', '+2 черепа'],
    desc: 'Черепа-снаряды кружат вокруг героя.',
  },
  chain_bolt: {
    name: 'Цепная молния', icon: '⚡', color: 0xa5b4fc,
    base: { dmg: 11, cd: 1.7, count: 1, speed: 26, pierce: 1, size: 0.26, life: 1.0, chain: 2 },
    levels: ['+1 прыжок', 'Урон +30%', '+1 разряд', '+1 прыжок', 'Перезарядка -15%', '+2 прыжка', 'Урон +50%'],
    desc: 'Разряд перескакивает между врагами.',
  },
  ice_fan: {
    name: 'Ледяной веер', icon: '❄️', color: 0x7dd3fc,
    base: { dmg: 7, cd: 1.9, count: 5, speed: 15, pierce: 2, size: 0.26, life: 0.8, spread: 0.32, slow: 0.45 },
    levels: ['+2 осколка', 'Урон +30%', 'Замедление сильнее', '+2 осколка', 'Перезарядка -15%', 'Урон +40%', 'Пробитие +2'],
    desc: 'Широкий веер ледяных осколков замедляет врагов (сильное замедление — заморозка).',
  },
  // --- новые виды поведения снарядов (раунд 2) ---
  thorn_bow: {
    name: 'Терновый лук', icon: '🏹', color: 0xdc2626, tag: 'Пронзание · Кровотечение',
    base: { dmg: 10, cd: 1.0, count: 1, speed: 30, pierce: 3, size: 0.25, life: 0.9, bleed: 3 },
    levels: ['+1 стрела', 'Урон +30%', 'Пробитие +2', '+1 стрела', 'Перезарядка -15%', 'Урон +40%', '+2 стрелы'],
    desc: 'Быстрые стрелы прошивают ряд врагов и вызывают кровотечение.',
  },
  moon_orb: {
    name: 'Лунный рикошет', icon: '🌕', color: 0xfde68a, tag: 'Отскоки',
    base: { dmg: 12, cd: 1.5, count: 1, speed: 16, pierce: 1, size: 0.4, life: 3.0, bounce: 4 },
    levels: ['Отскоки +2', 'Урон +30%', '+1 сфера', 'Перезарядка -15%', 'Отскоки +2', 'Урон +40%', '+1 сфера'],
    desc: 'Сфера отскакивает от врага к врагу и от стен арены.',
  },
  glyph_mine: {
    name: 'Глифы-ловушки', icon: '🔯', color: 0xa855f7, tag: 'Мины · Отбрасывание',
    base: { dmg: 22, cd: 2.2, count: 1, speed: 0, pierce: 99, size: 0.6, life: 9, explode: 3.0, knock: 3.5, arm: 0.6 },
    levels: ['+1 глиф', 'Урон +30%', 'Радиус +25%', 'Перезарядка -15%', '+1 глиф', 'Урон +40%', 'Радиус +25%'],
    desc: 'Глифы на земле взрываются под врагами и отбрасывают их.',
  },
  sun_beam: {
    name: 'Солнечный луч', icon: '☀️', color: 0xfbbf24, tag: 'Луч · Горение',
    base: { dmg: 6, cd: 2.6, count: 1, speed: 0, pierce: 999, size: 0.7, life: 0.9, len: 11, tick: 0.15, burn: 3 },
    levels: ['Урон +30%', 'Размер +25%', 'Перезарядка -15%', '+1 луч', 'Урон +40%', 'Перезарядка -15%', '+1 луч'],
    desc: 'Жгучий луч к ближайшему врагу: урон каждые 0.15 с всем на линии и горение.',
  },
  split_shard: {
    name: 'Раскалывающийся кристалл', icon: '💎', color: 0xec4899, tag: 'Раскол',
    base: { dmg: 9, cd: 1.2, count: 1, speed: 20, pierce: 1, size: 0.3, life: 1.4, split: 3 },
    levels: ['Раскол +1', 'Урон +30%', '+1 кристалл', 'Перезарядка -15%', 'Раскол +2', 'Урон +40%', '+1 кристалл'],
    desc: 'При попадании кристалл раскалывается на осколки веером.',
  },
  plague_flask: {
    name: 'Чумная склянка', icon: '🧪', color: 0x84cc16, tag: 'Зона · Яд',
    base: { dmg: 5, cd: 3.0, count: 1, speed: 12, pierce: 1, size: 0.35, life: 0.9, zone: 2.6, zoneLife: 4, poison: 4 },
    levels: ['Радиус +25%', 'Урон +30%', '+1 склянка', 'Перезарядка -15%', 'Радиус +25%', 'Урон +40%', 'Длительность +1с'],
    desc: 'Склянка разбивается ядовитым облаком: урон по площади и отравление.',
  },
  fly_blades: {
    name: 'Летучие клинки', icon: '🌀', color: 0xa3e635, tag: 'Наведение · Кровотечение',
    base: { dmg: 8, cd: 1.3, count: 2, speed: 17, pierce: 3, size: 0.32, life: 1.6, homing: 9, bleed: 2, knock: 0.6 },
    levels: ['+1 клинок', 'Урон +30%', 'Пробитие +2', '+1 клинок', 'Перезарядка -15%', 'Урон +40%', '+2 клинка'],
    desc: 'Вращающиеся клинки сами находят цель, режут насквозь и пускают кровь.',
  },
};

// Статусы (урон в секунду × длительность — в docs/MORRISCURSE-BALANCE.md)
export const STATUS = {
  burn: { name: 'Горение', dur: 3, stack: 1 },
  poison: { name: 'Яд', dur: 4, stack: 1 },
  bleed: { name: 'Кровотечение', dur: 3, stack: 3 },
  freeze: { name: 'Заморозка', dur: 0.8, stack: 1 },
};

export const PASSIVES = {
  might: { name: 'Сила проклятия', icon: '💪', desc: '+10% урона', max: 5 },
  haste: { name: 'Спешка', icon: '⏱️', desc: '-7% перезарядки оружия', max: 5 },
  swift: { name: 'Лёгкие ноги', icon: '👟', desc: '+8% скорости бега', max: 5 },
  magnet: { name: 'Притяжение', icon: '🧲', desc: '+35% радиус сбора', max: 5 },
  vigor: { name: 'Живучесть', icon: '❤️', desc: '+15% макс. здоровья (и лечение)', max: 5 },
  regen: { name: 'Регенерация', icon: '🌿', desc: '+0.4 HP/с', max: 5 },
  amount: { name: 'Множество', icon: '➕', desc: '+1 снаряд всем оружиям (ур. 2 и 4)', max: 4 },
  area: { name: 'Размах', icon: '⭕', desc: '+10% размер и радиус взрывов', max: 5 },
  luck: { name: 'Удача', icon: '🍀', desc: '+6% шанс крита (x2 урон)', max: 5 },
  mastery: { name: 'Мастерство навыка', icon: '📜', desc: '-12% кд навыка класса, +20% его урон', max: 5, needsAbility: true },
};

export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 5;

// Враги орды. hp/dmg/speed — база, масштабируются временем забега и числом игроков.
export const ENEMIES = {
  // atk — «читаемая» атака с замахом (телеграф на земле): dash/lunge — рывок по линии, slam — удар по кругу,
  // dust — облако пыльцы (замедление). wind — длительность замаха, cd — перезарядка, range — дистанция начала.
  imp: { name: 'Бес', hp: 10, dmg: 6, speed: 4.3, radius: 0.45, xp: 1, armor: 0, weight: 1 },
  bat: { name: 'Нетопырь', hp: 6, dmg: 4, speed: 6.2, radius: 0.4, xp: 1, armor: 0, flying: true },
  ghoul: { name: 'Упырь', hp: 26, dmg: 9, speed: 3.2, radius: 0.55, xp: 2, armor: 2, atk: { kind: 'lunge', range: 4.5, wind: 0.5, cd: 3.2, len: 4, speed: 15 } },
  spitter: { name: 'Плевун', hp: 20, dmg: 7, speed: 2.4, radius: 0.6, xp: 3, armor: 1, ranged: true },
  golem: { name: 'Голем пепла', hp: 90, dmg: 16, speed: 2.1, radius: 0.95, xp: 6, armor: 6, atk: { kind: 'slam', range: 3.6, wind: 0.85, cd: 4, r: 3.2 } },
  warden: { name: 'Страж Проклятия', hp: 2400, dmg: 26, speed: 2.7, radius: 1.6, xp: 120, armor: 10, boss: true, atk: { kind: 'slam', range: 8, wind: 1.1, cd: 6, r: 5 } },
  // Отголоски Мэлвелдила (те же типы, что в открытом мире, но слабее — «забег»)
  blade_fly: { name: 'Мошкара-Жнец', hp: 14, dmg: 7, speed: 5.0, radius: 0.45, xp: 2, armor: 0, flying: true, atk: { kind: 'dash', range: 7, wind: 0.55, cd: 3.6, len: 8, speed: 22 } },
  dream_moth: { name: 'Тихий мотылёк', hp: 16, dmg: 6, speed: 3.6, radius: 0.5, xp: 2, armor: 0, flying: true, atk: { kind: 'dust', range: 4, wind: 0.7, cd: 4.5, r: 3 } },
  rot_glitch: { name: 'Глитч-слизь', hp: 22, dmg: 6, speed: 2.6, radius: 0.6, xp: 2, armor: 0, puddle: true },
  kyut_mirror: { name: 'Отражение Кьют', hp: 700, dmg: 13, speed: 4.4, radius: 0.6, xp: 0, armor: 4, boss: true, atk: { kind: 'dash', range: 10, wind: 0.45, cd: 2.4, len: 9, speed: 26 } },
  moon_sentinel: { name: 'Безветрие', hp: 3000, dmg: 24, speed: 2.6, radius: 1.7, xp: 140, armor: 8, boss: true, atk: { kind: 'slam', range: 10, wind: 1.2, cd: 5, r: 4.5 } },
};
// Волны по комнатам: Склеп — бесы/упыри/мошкара; Бездна — Отголоски Мэлвелдила (слизь, мотыльки, мошкара)
export const ROOM_BOSS = { crypt: 'warden', abyss: 'moon_sentinel', trial: 'warden' };
export const ROOM_ELITES = { crypt: ['ghoul', 'golem', 'blade_fly'], abyss: ['golem', 'dream_moth', 'rot_glitch'], trial: ['ghoul', 'golem'] };

// Расписание волн: [с минуты, веса типов, базовый темп спавна/сек, лимит живых]
export const WAVES = [
  { from: 0, mix: { imp: 1 }, rate: 1.3, cap: 40 },
  { from: 0.75, mix: { imp: 3, bat: 2, blade_fly: 1 }, rate: 1.9, cap: 60 },
  { from: 2, mix: { imp: 3, bat: 2, ghoul: 2, blade_fly: 1 }, rate: 2.5, cap: 80 },
  { from: 3.5, mix: { imp: 2, ghoul: 3, spitter: 1, bat: 2, blade_fly: 2 }, rate: 3.2, cap: 100 },
  { from: 5, mix: { ghoul: 3, spitter: 2, bat: 3, golem: 1, blade_fly: 2 }, rate: 3.8, cap: 120 },
  { from: 7, mix: { ghoul: 3, spitter: 2, bat: 2, golem: 2, imp: 2, blade_fly: 2 }, rate: 4.6, cap: 140 },
  { from: 10, mix: { ghoul: 2, spitter: 3, bat: 3, golem: 3, blade_fly: 3 }, rate: 5.4, cap: 160 },
];
export const ROOM_WAVES = {
  crypt: WAVES,
  abyss: [
    { from: 0, mix: { rot_glitch: 2, blade_fly: 1 }, rate: 1.3, cap: 40 },
    { from: 0.75, mix: { rot_glitch: 3, blade_fly: 2, dream_moth: 1 }, rate: 2, cap: 60 },
    { from: 2, mix: { rot_glitch: 2, blade_fly: 2, dream_moth: 2, spitter: 1 }, rate: 2.6, cap: 85 },
    { from: 3.5, mix: { rot_glitch: 2, blade_fly: 3, dream_moth: 2, spitter: 2, golem: 1 }, rate: 3.3, cap: 105 },
    { from: 5, mix: { blade_fly: 3, dream_moth: 3, spitter: 2, golem: 2, rot_glitch: 2 }, rate: 4, cap: 125 },
    { from: 7, mix: { blade_fly: 3, dream_moth: 3, spitter: 3, golem: 3, rot_glitch: 3 }, rate: 4.8, cap: 150 },
  ],
};

export const ELITE_EVERY = 60; // сек
export const BOSS_EVERY = 300; // сек
export const ARENA_RADIUS = 60; // м

export function xpNeed(level) {
  return Math.floor(6 + level * 7 + Math.pow(level, 1.55));
}

// Перевод классовых статов сервера в параметры забега
export function classRunStats(classKey, serverClass) {
  const c = serverClass || {};
  const hp = Number(c.maxHp || c.hp || 0);
  const armor = Number(c.armor || 0);
  const minAtk = Number(c.minAtk || 1);
  const maxAtk = Number(c.maxAtk || 2);
  if (classKey === 'soul' || !hp) {
    return { maxHp: 70, armor: 0, dmgMult: 1, speed: 8.4 };
  }
  return {
    maxHp: Math.round(55 + hp * 0.55),
    armor,
    // средний урон класса → множитель (воин 3.5 → 1.0, копейщик 7.5 → ~1.25, маг 1.5 → ~0.9)
    dmgMult: Number((0.8 + Math.min(0.6, ((minAtk + maxAtk) / 2) * 0.06)).toFixed(2)),
    speed: classKey === 'rogue' ? 9.4 : classKey === 'warrior' ? 8.0 : 8.6,
  };
}

// Тот же расчёт брони, что и в бою на сервере (classes.js / server/combat.ts)
export function armorReduction(armor) {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  return Math.min(0.9, (1 + (armor - 1) * (4 / 9)) / 100);
}
