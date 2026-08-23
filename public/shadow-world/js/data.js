const QUALITIES = {
  1: { name: 'Обычное', mult: 1.0, maxAffixes: 1, dropRate: [75, 20, 5, 0, 0], cls: 'q-1', bg: 'bg-q1' },
  2: { name: 'Необычное', mult: 1.5, maxAffixes: 2, dropRate: [20, 50, 20, 5, 0], cls: 'q-2', bg: 'bg-q2' },
  3: { name: 'Редкое', mult: 2.3, maxAffixes: 3, dropRate: [5, 25, 45, 15, 5], cls: 'q-3', bg: 'bg-q3' },
  4: { name: 'Эпическое', mult: 3.5, maxAffixes: 4, dropRate: [0, 5, 25, 50, 15], cls: 'q-4', bg: 'bg-q4' },
  5: { name: 'Легендарное', mult: 5.5, maxAffixes: 5, dropRate: [0, 0, 5, 25, 45], cls: 'q-5', bg: 'bg-q5' },
  6: { name: 'Мифическое', mult: 8.5, maxAffixes: 6, dropRate: [0, 0, 0, 5, 25], cls: 'q-6', bg: 'bg-q6' },
  7: { name: 'Древнее', mult: 13.0, maxAffixes: 7, dropRate: [0, 0, 0, 0, 8], cls: 'q-7', bg: 'bg-q7' },
  8: { name: 'Сингулярное', mult: 20.0, maxAffixes: 8, dropRate: [0, 0, 0, 0, 2], cls: 'q-8', bg: 'bg-q8' }
};

const ELITE_TIERS = [
  { id: 'strong',   name: 'Сильный',      mult: 4,   quality: 2, color: 'var(--q2)' },
  { id: 'dreadful', name: 'Ужасный',      mult: 8,   quality: 3, color: 'var(--q3)' },
  { id: 'danger',   name: 'Опасный',      mult: 16,  quality: 4, color: 'var(--q4)' },
  { id: 'incred',   name: 'Невероятный',  mult: 32,  quality: 5, color: 'var(--q5)' },
  { id: 'divine',   name: 'Божественный', mult: 64,  quality: 6, color: 'var(--q6)' },
  { id: 'colossal', name: 'Колоссальный', mult: 96,  quality: 6, color: 'var(--q6)' },
  { id: 'titanic',  name: 'Титанический', mult: 128, quality: 7, color: 'var(--q7)' },
  { id: 'primordial', name: 'Первородный', mult: 180, quality: 7, color: 'var(--q7)' },
  { id: 'singular', name: 'Сингулярный',  mult: 250, quality: 8, color: 'var(--q8)' },
  { id: 'absolute', name: 'Абсолютный',   mult: 360, quality: 8, color: 'var(--q8)' }
];

const SLOTS = {
  weapon: 'Оружие',
  armor: 'Доспех',
  helm: 'Шлем',
  boots: 'Сапоги',
  amulet: 'Амулет',
  ring: 'Кольцо',
  belt: 'Пояс',
  cloak: 'Плащ',
  bracers: 'Наручи',
  relic: 'Реликвия'
};

const RUNES_DB = [
  { id: 'r_vamp', name: 'Руна Жатвы', icon: '🩸', desc: '+15% шанс исцелить 15% от HP при ударе' },
  { id: 'r_chrono', name: 'Руна Хроноса', icon: '⏳', desc: '-25% к требуемому времени идеального замаха' },
  { id: 'r_nova', name: 'Руна Сверхновой', icon: '💥', desc: 'Сверхзамах бьет мощным взрывом по всем врагам' },
  { id: 'r_creator', name: 'Руна Творца', icon: '👑', desc: '+35% ко всем базовым параметрам предмета' }
];

// 14 СТАТОВ: процентные статы отделены от числовых
const AFFIX_POOL = [
  // Числовые статы (растут вместе с множителями данжей)
  { name: 'Ярости', stat: 'atk', val: [6, 12], label: '⚔ +Атк', isPct: false },
  { name: 'Титана', stat: 'hp', val: [35, 75], label: '❤️ +HP', isPct: false },
  { name: 'Бастиона', stat: 'def', val: [4, 9], label: '🛡 +Защ', isPct: false },
  { name: 'Разлома', stat: 'pierce', val: [4, 10], label: '🗡 +Пробой', isPct: false },
  { name: 'Исцеления', stat: 'regen', val: [1, 2], label: '💚 +Реген/с', isPct: false },

  // Процентные статы: сбалансированные плавные значения (уменьшены в 8-12 раз)
  { name: 'Ветра', stat: 'aspd', val: [1.5, 3.5], label: '⚡ +ASPD', isPct: true },
  { name: 'Палача', stat: 'crit', val: [0.6, 1.8], label: '🎯 +Крит', isPct: true },
  { name: 'Кары', stat: 'critDmg', val: [4.0, 10.0], label: '💥 +Крит.Урон', isPct: true },
  { name: 'Вампира', stat: 'vamp', val: [0.4, 1.0], label: '🩸 +Вампир', isPct: true },
  { name: 'Неуязвимости', stat: 'dmgReduction', val: [0.3, 0.8], label: '🛡 +Срез Урона', isPct: true },
  { name: 'Проклятия', stat: 'curseChance', val: [0.8, 2.0], label: '🔮 +Проклятье', isPct: true },
  { name: 'Чародея', stat: 'skillPower', val: [1.5, 3.5], label: '✨ +Сила умений', isPct: true },
  { name: 'Алчности', stat: 'goldBonus', val: [2.0, 5.0], label: '🪙 +Золото', isPct: true },
  { name: 'Мудрости', stat: 'expBonus', val: [2.0, 5.0], label: '📜 +Опыт', isPct: true }
];
const PREFIX_NAMES = ['Тёмный', 'Искажённый', 'Первозданный', 'Фрактальный', 'Древний', 'Пламенный', 'Сингулярный', 'Абсолютный', 'Тяжёлый', 'Колоссальный', 'Грозовой', 'Инфернальный'];

const SKILLS_DB = {
  fireball: { id: 'fireball', name: 'Огненный Шар', icon: '🔥', baseCd: 8.0, targetType: 'single', desc: 'Запускает огненный сгусток в текущую цель, нанося повышенный урон.', calcDmg: (lvl, atk, mult, sp, isAwk) => Math.round(atk * (1.8 + (lvl - 1) * 0.40) * mult * (1 + sp / 100) * (isAwk ? 2.2 : 1.0)) },
  hellfire: { id: 'hellfire', name: 'Адское Пламя', icon: '🌋', baseCd: 12.0, targetType: 'aoe', desc: 'Взрывает землю под всеми противниками на арене.', calcDmg: (lvl, atk, mult, sp, isAwk) => Math.round(atk * (1.2 + (lvl - 1) * 0.30) * mult * (1 + sp / 100) * (isAwk ? 2.0 : 1.0)) },
  harvest: { id: 'harvest', name: 'Кровавая Жатва', icon: '🩸', baseCd: 13.0, targetType: 'single', desc: 'Наносит урон врагу и восстанавливает герою 80% от нанесённого урона.', calcDmg: (lvl, atk, mult, sp, isAwk) => Math.round(atk * (1.3 + (lvl - 1) * 0.28) * mult * (1 + sp / 100) * (isAwk ? 2.0 : 1.0)) },
  shield: { id: 'shield', name: 'Барьер Пустоты', icon: '🛡', baseCd: 15.0, targetType: 'buff', desc: 'Окружает героя энергетическим щитом в зависимости от максимального HP.', calcDmg: () => 0, calcEffect: (lvl, maxHp, mult, sp, isAwk) => Math.round(maxHp * (0.25 + (lvl - 1) * 0.08) * Math.min(2.2, Math.max(0.5, mult)) * (1 + sp / 100) * (isAwk ? 2.5 : 1.0)) },
  cleave: { id: 'cleave', name: 'Адский Рассекатель', icon: '🗡', baseCd: 10.0, targetType: 'single', desc: 'Мощный удар, игнорирующий 50% защиты противника.', calcDmg: (lvl, atk, mult, sp, isAwk) => Math.round(atk * (2.0 + (lvl - 1) * 0.45) * mult * (1 + sp / 100) * (isAwk ? 2.2 : 1.0)) },
  haste: { id: 'haste', name: 'Скорость', icon: '⚡', baseCd: 14.0, targetType: 'buff', desc: '+100% к скорости атаки персонажа на 6 секунд.', calcDmg: () => 0, calcEffect: () => 6.0 },
  leap: { id: 'leap', name: 'Атака с прыжка', icon: '🌪', baseCd: 13.0, targetType: 'single', desc: 'Разрушительный прыжок с 3x уроном и 3 зарядами уклонения.', calcDmg: (lvl, atk, mult, sp, isAwk) => Math.round(atk * (isAwk ? 5.0 : 3.0) * (1 + (lvl - 1) * 0.20) * mult * (1 + sp / 100)) },
  deathgame: { id: 'deathgame', name: 'Смертельная игра', icon: '🕸', baseCd: 16.0, targetType: 'buff', desc: 'Ловушка на 10 секунд: враги замедлены, а урон по ним повышен на +20%.', calcDmg: () => 0, calcEffect: () => 10.0 }
};

const AVATARS = {
  dummy: `<svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="12" cy="5" r="3"></circle><line x1="12" y1="8" x2="12" y2="18"></line><line x1="5" y1="12" x2="19" y2="12"></line><line x1="8" y1="21" x2="16" y2="21"></line></svg>`,
  shadow_guard: `<svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"></path><circle cx="12" cy="11" r="2.5"></circle></svg>`,
  bandit: `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M6 21v-2a6 6 0 0 1 12 0v2"></path><line x1="4" y1="9" x2="20" y2="9"></line></svg>`,
  slime: `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 4c-5 0-9 4-9 9 0 4 3 7 9 7s9-3 9-7c0-5-4-9-9-9z"></path><circle cx="9" cy="12" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle></svg>`,
  skeleton: `<svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M12 2a6 6 0 0 0-6 6v3c0 2 1 3.5 2 4.5V18h8v-2.5c1-1 2-2.5 2-4.5V8a6 6 0 0 0-6-6z"></path><circle cx="9" cy="9" r="1.5"></circle><circle cx="15" cy="9" r="1.5"></circle></svg>`,
  jailer: `<svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
  reaper: `<svg viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8M8 12h8"></path></svg>`,
  frost_elem: `<svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><polygon points="12 2 15 8 21 9 17 14 18 20 12 17 6 20 7 14 3 9 9 8 12 2"></polygon></svg>`,
  frost_golem: `<svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="10" r="1.5"></circle><circle cx="15" cy="10" r="1.5"></circle></svg>`,
  dragon: `<svg viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><path d="M12 3c-4 3-7 8-7 13 0 3 2 5 7 5s7-2 7-5c0-5-3-10-7-13z"></path><path d="M9 13l3-3 3 3"></path></svg>`,
  priest: `<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><circle cx="12" cy="7" r="4"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2"></path></svg>`,
  demon: `<svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  archdemon: `<svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="13" r="7"></circle><path d="M18 4l2 4-3 1zM6 4L4 8l3 1z"></path></svg>`,
  matrix: `<svg viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="4"></rect><path d="M7 7l10 10M17 7L7 17"></path></svg>`
};

function generateTowerStages(count, theme, mobTemplates, bossTemplate) {
  const stages = [];
  for (let f = 1; f <= count; f++) {
    const isBoss = (f === count);
    const isSwarm = (!isBoss && (f === 4 || f === 8 || f === 12));
    const stageName = isBoss ? `👑 Чертог Владыки (Этаж ${f})` : isSwarm ? `🔥 Орда (Этаж ${f})` : `Ярус ${f}: ${theme}`;
    let enemies = [];
    if (isBoss) {
      enemies.push(bossTemplate);
      enemies.push({ ...mobTemplates[0], id: `${mobTemplates[0].id}_bg1`, name: `Страж Трона A` });
      enemies.push({ ...mobTemplates[1 % mobTemplates.length], id: `${mobTemplates[1 % mobTemplates.length].id}_bg2`, name: `Страж Трона B` });
    } else if (isSwarm) {
      for (let i = 0; i < 6; i++) {
        const base = mobTemplates[Math.floor(Math.random() * mobTemplates.length)];
        enemies.push({ ...base, id: `${base.id}_sw_${f}_${i}`, name: `${base.name} #${i+1}`, hp: Math.round(base.hp * 0.75), atk: Math.round(base.atk * 0.75) });
      }
    } else {
      const mobCount = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < mobCount; i++) {
        const base = mobTemplates[Math.floor(Math.random() * mobTemplates.length)];
        enemies.push({ ...base, id: `${base.id}_f${f}_${i}`, name: base.name });
      }
    }
    stages.push({ name: stageName, enemies });
  }
  return stages;
}

const DUNGEONS = [
  { id: 'dungeon_intro_1', name: 'Подвалы Старого Замка', desc: 'Тренировочные подвалы замка.', minLvl: 1, cooldownSec: 0, stages: [{ name: 'Сектор Мишеней', enemies: [{ id: 'm_dummy_1', name: 'Манекен I', hp: 30, atk: 6, def: 1, xp: 10, gold: 8, isBoss: false, avatar: 'dummy', attackSpeed: 3.5, desc: 'Учебный манекен.' }] }, { name: 'Оружейный зал', enemies: [{ id: 'b_shadow_guard', name: 'Теневой Страж [БОСС]', hp: 120, atk: 14, def: 4, xp: 50, gold: 40, isBoss: true, avatar: 'shadow_guard', attackSpeed: 2.9, desc: 'Призрачный хранитель замка.' }] }], itemPool: [{ name: 'Учебный Меч', slot: 'weapon', baseAtk: 6, baseDef: 0, baseHp: 0, baseAspd: 5, pierce: 0 }, { name: 'Медный Амулет', slot: 'amulet', baseAtk: 2, baseDef: 1, baseHp: 15, baseAspd: 0, pierce: 0 }] },
  { id: 'dungeon_intro_2', name: 'Заброшенный Тракт Альказака', desc: 'Дикие тракты мародёров.', minLvl: 2, cooldownSec: 0, stages: [{ name: 'Лагерь Атамана', enemies: [{ id: 'b_bandit_leader', name: 'Атаман Мародёров [БОСС]', hp: 180, atk: 18, def: 5, xp: 80, gold: 65, isBoss: true, avatar: 'bandit', attackSpeed: 2.7, desc: 'Главарь банды.' }] }], itemPool: [{ name: 'Кривой Тесак Тракта', slot: 'weapon', baseAtk: 10, baseDef: 0, baseHp: 0, baseAspd: 8, pierce: 2 }, { name: 'Кольцо Разбойника', slot: 'ring', baseAtk: 5, baseDef: 0, baseHp: 20, baseAspd: 4, pierce: 1 }] },
  { id: 'dungeon_intro_3', name: 'Чёрные Чумные Топи', desc: 'Заболоченная низина.', minLvl: 4, cooldownSec: 120, stages: [{ name: 'Гнилая Топь', enemies: [{ id: 'b_swamp_horror', name: 'Болотный Ужас [БОСС]', hp: 280, atk: 25, def: 7, xp: 150, gold: 120, isBoss: true, avatar: 'slime', attackSpeed: 2.8, desc: 'Ядовитый монстр.' }] }], itemPool: [{ name: 'Чумной Кинжал', slot: 'weapon', baseAtk: 14, baseDef: 0, baseHp: 15, baseAspd: 12, pierce: 3 }, { name: 'Пояс Трясины', slot: 'belt', baseAtk: 2, baseDef: 6, baseHp: 45, baseAspd: 0, pierce: 0 }] },
  { id: 'dungeon_1', name: 'Катакомбы Скорби', desc: 'Заброшенные склепы.', minLvl: 7, cooldownSec: 180, stages: [{ name: 'Трон Праха', enemies: [{ id: 'b_reaper', name: 'Чёрный Жнец [БОСС]', hp: 550, atk: 50, def: 14, xp: 320, gold: 260, isBoss: true, avatar: 'reaper', attackSpeed: 2.6, desc: 'Повелитель склепов.' }] }], itemPool: [{ name: 'Костяной Тесак', slot: 'weapon', baseAtk: 22, baseDef: 0, baseHp: 0, baseAspd: 10, pierce: 5 }, { name: 'Плащ Мертвеца', slot: 'cloak', baseAtk: 4, baseDef: 12, baseHp: 65, baseAspd: 5, pierce: 0 }] },
  { id: 'dungeon_storm_tower', name: '⚡ Башня Бесконечного Шторма (12 Этажей)', desc: 'Шпиль бури.', minLvl: 10, cooldownSec: 210, stages: generateTowerStages(12, 'Шторм', [{ id: 'm_st_1', name: 'Грозовой Дух', hp: 160, atk: 32, def: 8, xp: 85, gold: 70, isBoss: false, avatar: 'frost_elem', attackSpeed: 2.5 }], { id: 'b_raijin', name: 'Повелитель Бурь Райдзин [БОСС]', hp: 1100, atk: 75, def: 28, xp: 750, gold: 600, isBoss: true, avatar: 'dragon', attackSpeed: 2.2 }), itemPool: [{ name: 'Громовой Клинок', slot: 'weapon', baseAtk: 40, baseDef: 0, baseHp: 50, baseAspd: 20, pierce: 12 }, { name: 'Наручи Молнии', slot: 'bracers', baseAtk: 12, baseDef: 14, baseHp: 80, baseAspd: 15, pierce: 4 }] },
  { id: 'dungeon_soul_labyrinth', name: '👻 Лабиринт Забытых Душ (14 Этажей)', desc: 'Призрачные орды.', minLvl: 20, cooldownSec: 260, stages: generateTowerStages(14, 'Лабиринт', [{ id: 'm_sl_1', name: 'Блуждающий Призрак', hp: 380, atk: 72, def: 18, xp: 210, gold: 170, isBoss: false, avatar: 'skeleton', attackSpeed: 2.4 }], { id: 'b_thanatos', name: 'Владыка Забвения Танатос [БОСС]', hp: 2800, atk: 180, def: 60, xp: 2200, gold: 1700, isBoss: true, avatar: 'reaper', attackSpeed: 2.1 }), itemPool: [{ name: 'Эфирная Коса', slot: 'weapon', baseAtk: 95, baseDef: 15, baseHp: 180, baseAspd: 18, pierce: 25 }, { name: 'Реликвия Душ', slot: 'relic', baseAtk: 45, baseDef: 30, baseHp: 240, baseAspd: 10, pierce: 15 }] },
  { id: 'dungeon_chaos_inferno', name: '🌋 Пекло Первородного Хаоса (15 Этажей)', desc: 'Лавовые демоны.', minLvl: 30, cooldownSec: 320, stages: generateTowerStages(15, 'Инферно', [{ id: 'm_ci_1', name: 'Лавовый Скорпион', hp: 950, atk: 160, def: 45, xp: 620, gold: 500, isBoss: false, avatar: 'demon', attackSpeed: 2.3 }], { id: 'b_surtur', name: 'Владыка Хаоса Суртур [БОСС]', hp: 6500, atk: 420, def: 135, xp: 5200, gold: 4200, isBoss: true, avatar: 'archdemon', attackSpeed: 2.0 }), itemPool: [{ name: 'Меч Пламени', slot: 'weapon', baseAtk: 260, baseDef: 40, baseHp: 500, baseAspd: 30, pierce: 50 }, { name: 'Амулет Инферно', slot: 'amulet', baseAtk: 120, baseDef: 60, baseHp: 650, baseAspd: 15, pierce: 25 }] },
  { id: 'dungeon_abyss', name: 'Затонувший Храм Бездны', desc: 'Глубинные ужасы.', minLvl: 40, cooldownSec: 330, stages: [{ name: 'Святилище Левиафана', enemies: [{ id: 'b_kraken', name: 'Кракеноподобный Левиафан [БОСС]', hp: 11000, atk: 620, def: 210, xp: 12000, gold: 9500, isBoss: true, avatar: 'dragon', attackSpeed: 2.0, desc: 'Хозяин бездны.' }] }], itemPool: [{ name: 'Трезубец Бездны', slot: 'weapon', baseAtk: 420, baseDef: 60, baseHp: 800, baseAspd: 40, pierce: 80 }, { name: 'Кольцо Глубин', slot: 'ring', baseAtk: 180, baseDef: 90, baseHp: 950, baseAspd: 20, pierce: 35 }] },
  { id: 'dungeon_5', name: 'Разрыв Антиматрицы', desc: 'Цифровой сбой.', minLvl: 50, cooldownSec: 360, stages: [{ name: 'Фрактальный Трон', enemies: [{ id: 'b_matrix', name: 'Творец Искажения [БОСС]', hp: 28000, atk: 1650, def: 480, xp: 35000, gold: 28000, isBoss: true, avatar: 'matrix', attackSpeed: 1.8, desc: 'Первородный баг.' }] }], itemPool: [{ name: 'Кинжал Нулевого Дня', slot: 'weapon', baseAtk: 850, baseDef: 120, baseHp: 1500, baseAspd: 65, pierce: 150 }, { name: 'Реликвия Сбоя', slot: 'relic', baseAtk: 400, baseDef: 250, baseHp: 1900, baseAspd: 35, pierce: 80 }] },
  { id: 'dungeon_void_rift', name: '🌌 Разлом Вечной Тьмы (10 Этажей)', desc: 'Существа антиматерии.', minLvl: 60, cooldownSec: 350, stages: generateTowerStages(10, 'Тьма', [{ id: 'm_vr_1', name: 'Абсолютный Фантом', hp: 5500, atk: 850, def: 240, xp: 4500, gold: 3600, isBoss: false, avatar: 'matrix', attackSpeed: 2.0 }], { id: 'b_void_walker', name: 'Ходок Бездны Азатот [БОСС]', hp: 35000, atk: 2200, def: 600, xp: 45000, gold: 35000, isBoss: true, avatar: 'matrix', attackSpeed: 1.7 }), itemPool: [{ name: 'Серп Антиматерии', slot: 'weapon', baseAtk: 1100, baseDef: 150, baseHp: 2200, baseAspd: 50, pierce: 200 }, { name: 'Плащ Тьмы', slot: 'cloak', baseAtk: 350, baseDef: 450, baseHp: 2500, baseAspd: 25, pierce: 50 }] },
  { id: 'dungeon_blood_citadel', name: '🩸 Кровавая Цитадель Кармиллы', desc: 'Вампирские лорды.', minLvl: 75, cooldownSec: 380, stages: generateTowerStages(12, 'Кровь', [{ id: 'm_bc_1', name: 'Кровавый Рыцарь', hp: 8000, atk: 1200, def: 320, xp: 6800, gold: 5200, isBoss: false, avatar: 'jailer', attackSpeed: 1.9 }], { id: 'b_carmilla', name: 'Королева Кармилла [БОСС]', hp: 52000, atk: 2900, def: 800, xp: 70000, gold: 55000, isBoss: true, avatar: 'priest', attackSpeed: 1.6 }), itemPool: [{ name: 'Венец Бессмертия', slot: 'helm', baseAtk: 450, baseDef: 550, baseHp: 3800, baseAspd: 40, pierce: 80 }, { name: 'Пояс Крови', slot: 'belt', baseAtk: 220, baseDef: 400, baseHp: 3200, baseAspd: 20, pierce: 40 }] },
  { id: 'dungeon_spectral_cathedral', name: '⛪ Спектральный Собор', desc: 'Святилище иллюзий.', minLvl: 90, cooldownSec: 400, stages: generateTowerStages(12, 'Спектр', [{ id: 'm_sc_1', name: 'Инквизитор', hp: 12000, atk: 1650, def: 420, xp: 10000, gold: 8000, isBoss: false, avatar: 'skeleton', attackSpeed: 1.8 }], { id: 'b_specter_pope', name: 'Призрачный Понтифик [БОСС]', hp: 75000, atk: 3800, def: 1100, xp: 110000, gold: 90000, isBoss: true, avatar: 'priest', attackSpeed: 1.5 }), itemPool: [{ name: 'Мантия Бога', slot: 'armor', baseAtk: 320, baseDef: 1200, baseHp: 6500, baseAspd: 35, pierce: 0 }, { name: 'Наручи Спектра', slot: 'bracers', baseAtk: 380, baseDef: 450, baseHp: 3100, baseAspd: 30, pierce: 60 }] },
  { id: 'dungeon_titan_cradle', name: '🗿 Колыбель Забытых Титанов', desc: 'Древнейшие колоссы.', minLvl: 110, cooldownSec: 420, stages: generateTowerStages(14, 'Титаны', [{ id: 'm_tc_1', name: 'Каменный Страж', hp: 22000, atk: 2200, def: 750, xp: 18000, gold: 14000, isBoss: false, avatar: 'frost_golem', attackSpeed: 2.2 }], { id: 'b_atlas', name: 'Титан Атлас [БОСС]', hp: 140000, atk: 5200, def: 1800, xp: 200000, gold: 160000, isBoss: true, avatar: 'frost_golem', attackSpeed: 1.8 }), itemPool: [{ name: 'Сокрушитель Миров', slot: 'weapon', baseAtk: 2400, baseDef: 300, baseHp: 4500, baseAspd: 30, pierce: 450 }, { name: 'Кольцо Атласа', slot: 'ring', baseAtk: 750, baseDef: 500, baseHp: 4800, baseAspd: 25, pierce: 120 }] },
  { id: 'dungeon_astral_sanctuary', name: '✨ Астральное Святилище Звёзд', desc: 'Звёздные духи.', minLvl: 130, cooldownSec: 450, stages: generateTowerStages(12, 'Астрал', [{ id: 'm_as_1', name: 'Звёздный Феникс', hp: 35000, atk: 3400, def: 900, xp: 30000, gold: 24000, isBoss: false, avatar: 'frost_elem', attackSpeed: 1.6 }], { id: 'b_astral_demiurge', name: 'Демиург Селестия [БОСС]', hp: 240000, atk: 7500, def: 2400, xp: 350000, gold: 280000, isBoss: true, avatar: 'dragon', attackSpeed: 1.4 }), itemPool: [{ name: 'Амулет Звёздного Ядра', slot: 'amulet', baseAtk: 1400, baseDef: 750, baseHp: 7000, baseAspd: 60, pierce: 300 }, { name: 'Реликвия Селестии', slot: 'relic', baseAtk: 1200, baseDef: 800, baseHp: 6500, baseAspd: 40, pierce: 250 }] },
  { id: 'dungeon_oblivion_depths', name: '🕳 Глубины Небытия', desc: 'Истинная тьма.', minLvl: 150, cooldownSec: 480, stages: generateTowerStages(15, 'Небытие', [{ id: 'm_od_1', name: 'Тень Забвения', hp: 55000, atk: 4800, def: 1300, xp: 50000, gold: 40000, isBoss: false, avatar: 'reaper', attackSpeed: 1.5 }], { id: 'b_oblivion_lord', name: 'Владыка Энтропия [БОСС]', hp: 400000, atk: 11000, def: 3500, xp: 600000, gold: 480000, isBoss: true, avatar: 'reaper', attackSpeed: 1.3 }), itemPool: [{ name: 'Сапоги Энтропии', slot: 'boots', baseAtk: 750, baseDef: 950, baseHp: 6200, baseAspd: 120, pierce: 0 }, { name: 'Плащ Небытия', slot: 'cloak', baseAtk: 950, baseDef: 1100, baseHp: 7500, baseAspd: 50, pierce: 150 }] },
  { id: 'dungeon_chronos_engine', name: '⚙️ Сердце Вечного Времени', desc: 'Конструкты времени.', minLvl: 175, cooldownSec: 500, stages: generateTowerStages(15, 'Время', [{ id: 'm_ce_1', name: 'Автоматон', hp: 90000, atk: 6800, def: 1900, xp: 85000, gold: 70000, isBoss: false, avatar: 'matrix', attackSpeed: 1.4 }], { id: 'b_chronos_prime', name: 'Хронос Прайм [БОСС]', hp: 650000, atk: 16000, def: 5200, xp: 1000000, gold: 800000, isBoss: true, avatar: 'matrix', attackSpeed: 1.2 }), itemPool: [{ name: 'Хронометр Вечности', slot: 'amulet', baseAtk: 2200, baseDef: 1200, baseHp: 11000, baseAspd: 80, pierce: 500 }, { name: 'Пояс Времени', slot: 'belt', baseAtk: 1200, baseDef: 1500, baseHp: 9500, baseAspd: 60, pierce: 200 }] },
  { id: 'dungeon_null_dimension', name: '⬛ Нуль-Измерение Создателя', desc: 'Финальная цитадель.', minLvl: 300, cooldownSec: 720, stages: generateTowerStages(20, 'Нуль', [{ id: 'm_nd_1', name: 'Нуль-Разрушитель', hp: 600000, atk: 25000, def: 7500, xp: 600000, gold: 500000, isBoss: false, avatar: 'matrix', attackSpeed: 1.0 }], { id: 'b_absolute_creator', name: 'Архитектор Бытия [БОСС]', hp: 6000000, atk: 65000, def: 22000, xp: 12000000, gold: 10000000, isBoss: true, avatar: 'matrix', attackSpeed: 0.9 }), itemPool: [{ name: 'Корона Создателя', slot: 'helm', baseAtk: 3500, baseDef: 3500, baseHp: 32000, baseAspd: 100, pierce: 800 }, { name: 'Реликвия Абсолюта', slot: 'relic', baseAtk: 4500, baseDef: 3000, baseHp: 35000, baseAspd: 80, pierce: 1200 }] }
];

const MECHANIC_ACHIEVEMENTS = [
  { id: 'm_transcend', name: '🌌 Возвышение Пустоты', desc: 'Совершить престиж-сброс героя.', target: 1, getProg: p => p.transcendLevel || 0 },
  { id: 'm_forge', name: '⭐ Закалка у Кузнеца', desc: 'Закалить предметы экипировки 10 раз.', target: 10, getProg: p => p.mechanicStats?.forgeCount || 0 },
  { id: 'm_rune', name: '🧪 Мастер Рун', desc: 'Сковать или инкрустировать руну в Алтаре Синтеза.', target: 3, getProg: p => p.mechanicStats?.runeCount || 0 },
  { id: 'm_overcharge', name: '💥 Идеальный Тайминг', desc: 'Нанести 25 ударов в фазе Сверхзамаха (Overcharge).', target: 25, getProg: p => p.mechanicStats?.overchargeHits || 0 },
  { id: 'm_curse', name: '🔮 Апогей Проклятия', desc: 'Спровоцировать мутацию врага в элитного монстра.', target: 5, getProg: p => p.mechanicStats?.curseMutations || 0 },
  { id: 'm_abyss', name: '🌀 Покоритель Бездны', desc: 'Достичь 10-го этажа Фрактальной Бездны.', target: 10, getProg: p => p.abyssRecord || 0 },
  { id: 'm_bossrush', name: '👑 Марафон Боссов', desc: 'Одолеть 5 боссов в режиме «Босс-Раш».', target: 5, getProg: p => p.mechanicStats?.bossRushWins || 0 },
  { id: 'm_raid', name: '👁 Падение Демиурга', desc: 'Успешно завершить Рейд против Демиурга.', target: 1, getProg: p => p.mechanicStats?.raidWins || 0 },
  { id: 'm_duel', name: '🤺 Теневой Чемпион', desc: 'Победить своего Теневого Двойника в дуэли 1 на 1.', target: 3, getProg: p => p.mechanicStats?.duelWins || 0 },
  { id: 'm_anomaly', name: '⚛️ Мастер Аномалий', desc: 'Повысить уровень Калибратора Аномалий до 5.', target: 5, getProg: p => p.anomalyTier || 0 },
  { id: 'm_astrolabe', name: '🌟 Архитектор Созвездий', desc: 'Активировать все 4 созвездия Астролябии.', target: 4, getProg: p => Object.values(p.astrolabe || {}).filter(Boolean).length }
];

const STORY_QUESTS = [
  { id: 'sq_0', title: 'Пролог: Испытание Замка', desc: 'Победите Теневого Стража.', targetId: 'b_shadow_guard', total: 1, xp: 100, gold: 90, tp: 1, rewardQ: 2 },
  { id: 'sq_0b', title: 'Глава I: Безопасный Тракт', desc: 'Одолейте Атамана Мародёров.', targetId: 'b_bandit_leader', total: 1, xp: 180, gold: 150, tp: 1, rewardQ: 3 },
  { id: 'sq_0c', title: 'Глава II: Очищение Топей', desc: 'Уничтожьте Болотный Ужас.', targetId: 'b_swamp_horror', total: 1, xp: 320, gold: 260, tp: 1, rewardQ: 3 },
  { id: 'sq_1', title: 'Глава III: Эхо Катакомб', desc: 'Сразите Чёрного Жнеца.', targetId: 'b_reaper', total: 1, xp: 600, gold: 500, tp: 1, rewardQ: 4 },
  { id: 'sq_storm', title: 'Глава IV: Владыка Бурь', desc: 'Покорите Башню Шторма.', targetId: 'b_raijin', total: 1, xp: 1200, gold: 950, tp: 2, rewardQ: 4 },
  { id: 'sq_soul', title: 'Глава V: Забвение Душ', desc: 'Сразите Танатоса.', targetId: 'b_thanatos', total: 1, xp: 2600, gold: 2000, tp: 2, rewardQ: 5 },
  { id: 'sq_chaos', title: 'Глава VI: Пламя Хаоса', desc: 'Победите Суртура.', targetId: 'b_surtur', total: 1, xp: 6000, gold: 4800, tp: 3, rewardQ: 6 },
  { id: 'sq_abyss', title: 'Глава VII: Левиафан Бездны', desc: 'Победите Левиафана.', targetId: 'b_kraken', total: 1, xp: 20000, gold: 16000, tp: 4, rewardQ: 7 },
  { id: 'sq_5', title: 'Глава VIII: Сбой Антиматрицы', desc: 'Уничтожьте Творца Искажения.', targetId: 'b_matrix', total: 1, xp: 50000, gold: 40000, tp: 5, rewardQ: 8 },
  { id: 'sq_vr', title: 'Глава IX: Разлом Тьмы', desc: 'Победите Азатота.', targetId: 'b_void_walker', total: 1, xp: 120000, gold: 90000, tp: 5, rewardQ: 8 },
  { id: 'sq_bc', title: 'Глава X: Королева Кармилла', desc: 'Одолейте Кармиллу.', targetId: 'b_carmilla', total: 1, xp: 250000, gold: 180000, tp: 6, rewardQ: 8 },
  { id: 'sq_sc', title: 'Глава XI: Спектральный Понтифик', desc: 'Свергните Понтифика.', targetId: 'b_specter_pope', total: 1, xp: 500000, gold: 350000, tp: 6, rewardQ: 8 },
  { id: 'sq_tc', title: 'Глава XII: Титан Атлас', desc: 'Сразите Атласа.', targetId: 'b_atlas', total: 1, xp: 1000000, gold: 700000, tp: 7, rewardQ: 8 },
  { id: 'sq_as', title: 'Глава XIII: Демиург Селестия', desc: 'Победите Селестию.', targetId: 'b_astral_demiurge', total: 1, xp: 2000000, gold: 1500000, tp: 8, rewardQ: 8 },
  { id: 'sq_od', title: 'Глава XIV: Энтропия Небытия', desc: 'Уничтожьте Энтропию.', targetId: 'b_oblivion_lord', total: 1, xp: 4000000, gold: 3000000, tp: 9, rewardQ: 8 },
  { id: 'sq_ce', title: 'Глава XV: Хронос Прайм', desc: 'Остановите Хроноса.', targetId: 'b_chronos_prime', total: 1, xp: 8000000, gold: 6000000, tp: 10, rewardQ: 8 },
  { id: 'sq_nd', title: 'ФИНАЛ: Архитектор Бытия', desc: 'Сразите Абсолютного Архитектора!', targetId: 'b_absolute_creator', total: 1, xp: 50000000, gold: 40000000, tp: 20, rewardQ: 8 }
];

const ASTROLABE_COSTS = { midas: 100000, chronophase: 250000, supernova: 500000, chaoslord: 1000000 };
const SAVE_KEY = 'shadows_world_save_v1';

// Минимальный уровень для каждой сложности (1–7)
const DIFF_MIN_LVL = {
  1: 1,
  2: 10,
  3: 30,
  4: 60,
  5: 100,
  6: 150,
  7: 200
};

// Требования уровней для особых режимов и арен
const MODE_MIN_LVL = {
  arena: 5,       // Арена Разлома
  duel: 10,       // Дуэль 1 на 1
  horde: 15,      // Орда Бездны
  abyss: 20,      // Фрактальная Бездна
  bossrush: 25,   // Босс-Раш
  purgatory: 35,  // Чистилище
  demiurge: 80    // Рейд: Демиург
};