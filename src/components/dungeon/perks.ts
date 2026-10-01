// perks.ts - Roguelite Perks & Upgrades Pool for Dungeon Gathering

import type { Perk, PlayerStats } from './types';

export const ALL_PERKS: Perk[] = [
  {
    id: 'orb_mastery',
    name: 'Магистр Сфер',
    desc: 'Урон магических сфер увеличен на +40%, они пробивают на +1 врага больше и становятся крупнее.',
    icon: '🔮',
    rarity: 'epic',
    category: 'magic',
  },
  {
    id: 'plasma_nova',
    name: 'Плазменная Сверхновая',
    desc: 'Каждый 3-й выстрел или критический удар выпускает вспышку 4 вращающихся микро-сфер вокруг героя.',
    icon: '✨',
    rarity: 'legendary',
    category: 'magic',
  },
  {
    id: 'vampiric_claws',
    name: 'Когти Вампира',
    desc: 'Удары по врагам восстанавливают 1 HP с шансом 30%, вампиризм +15%.',
    icon: '🩸',
    rarity: 'rare',
    category: 'offense',
  },
  {
    id: 'vampiric_bloodline',
    name: 'Кровавое Наследие',
    desc: 'Каждое убийство монстра мгновенно восстанавливает 1 HP герою.',
    icon: '🍷',
    rarity: 'epic',
    category: 'defense',
  },
  {
    id: 'toxic_rupture',
    name: 'Чумной Взрыв',
    desc: 'Враги при гибели взрываются ядовитой волной, нанося 45 урона окружающим.',
    icon: '🧪',
    rarity: 'epic',
    category: 'magic',
  },
  {
    id: 'reaper_edge',
    name: 'Жатва Смерти',
    desc: 'Шанс критического удара +30%, критический урон увеличен до 2.8x.',
    icon: '⚔️',
    rarity: 'rare',
    category: 'offense',
  },
  {
    id: 'shadow_haste',
    name: 'Теневой Шаг',
    desc: 'Скорость бега +30%, время перезарядки рывка снижено на 45%.',
    icon: '⚡',
    rarity: 'common',
    category: 'utility',
  },
  {
    id: 'hyper_haste',
    name: 'Сверхзвуковой Рефлекс',
    desc: 'Скорость атаки всего оружия +35%, перезарядка рывка снижена в 2 раза.',
    icon: '💨',
    rarity: 'rare',
    category: 'utility',
  },
  {
    id: 'obsidian_flesh',
    name: 'Обсидиановая Плоть',
    desc: 'Добавляет +2 максимальных сердца (4 HP), +1 к броне и полностью исцеляет.',
    icon: '🛡️',
    rarity: 'epic',
    category: 'defense',
  },
  {
    id: 'iron_clad',
    name: 'Железный Оплот',
    desc: 'Добавляет +2 к броне, существенно снижая весь входящий урон.',
    icon: '🏰',
    rarity: 'epic',
    category: 'defense',
  },
  {
    id: 'flame_aura',
    name: 'Огненная Аура',
    desc: 'Вокруг героя кружат священные угли, непрерывно сжигающие подошедших монстров (30 урона/сек).',
    icon: '🔥',
    rarity: 'rare',
    category: 'magic',
  },
  {
    id: 'gravedigger_greed',
    name: 'Алчность Могильщика',
    desc: '+120% к золоту и синим душам из ваз, сундуков и поверженных монстров.',
    icon: '💰',
    rarity: 'common',
    category: 'utility',
  },
  {
    id: 'soul_bolt',
    name: 'Некро-Снаряд',
    desc: 'Каждый 3-й удар выпускает самонаводящийся мистический череп во врага (55 урона).',
    icon: '💀',
    rarity: 'epic',
    category: 'magic',
  },
  {
    id: 'cleave_master',
    name: 'Широкий Размах',
    desc: 'Радиус и сектор атаки увеличены на +50%, базовый урон +12.',
    icon: '🪓',
    rarity: 'common',
    category: 'offense',
  },
  {
    id: 'titan_might',
    name: 'Титаническая Мощь',
    desc: 'Весь наносимый урон увеличен на +35%, сила отталкивания монстров +120.',
    icon: '🗿',
    rarity: 'epic',
    category: 'offense',
  },
  {
    id: 'berserker_rage',
    name: 'Ярость Отчаяния',
    desc: 'Когда у вас 2 сердца или меньше, наносимый урон возрастает на +100%.',
    icon: '💢',
    rarity: 'legendary',
    category: 'offense',
  },
  {
    id: 'freeze_dash',
    name: 'Ледяной Рывок',
    desc: 'Рывок оставляет морозный шлейф, замораживающий и замедляющий монстров на 75%.',
    icon: '❄️',
    rarity: 'rare',
    category: 'utility',
  },
  {
    id: 'alchemist_mastery',
    name: 'Мастер Зельеварения',
    desc: 'Зелья дают двойной эффект, и вы мгновенно получаете по 2 каждого зелья.',
    icon: '🏺',
    rarity: 'rare',
    category: 'utility',
  },
  {
    id: 'chain_lightning',
    name: 'Цепная Молния',
    desc: 'Каждый 3-й удар вызывает дуговой электрический разряд по 4 соседним монстрам (50 урона).',
    icon: '⚡',
    rarity: 'legendary',
    category: 'magic',
  },
  {
    id: 'aegis_shield',
    name: 'Эгида Титана',
    desc: 'Каждые 12 секунд окружает героя сияющим барьером, блокирующим 1 полученный удар.',
    icon: '🔰',
    rarity: 'legendary',
    category: 'defense',
  },
  {
    id: 'spectral_magnet',
    name: 'Спектральный Магнит',
    desc: 'Радиус притяжения монет, душ и кристаллов увеличивается на 180 пикселей.',
    icon: '🧲',
    rarity: 'common',
    category: 'utility',
  },
  {
    id: 'singularity',
    name: 'Гравитационная Воронка',
    desc: 'Снаряды при попадании кратковременно притягивают соседних монстров в эпицентр взрыва.',
    icon: '🌀',
    rarity: 'epic',
    category: 'magic',
  },
];

export function getRandomPerks(count: number, player: PlayerStats): Perk[] {
  const available = ALL_PERKS.filter((p) => !player.perks.includes(p.id) || p.rarity === 'common');
  const pool = [...(available.length >= count ? available : ALL_PERKS)];
  const selected: Perk[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(idx, 1)[0]);
  }

  return selected;
}

export function applyPerk(perk: Perk, player: PlayerStats) {
  player.perks.push(perk.id);

  switch (perk.id) {
    case 'orb_mastery':
      if (player.equippedWeapon.projectile) {
        player.equippedWeapon.projectile.radius *= 1.25;
        player.equippedWeapon.projectile.pierce += 1;
      }
      player.damage = Math.round(player.damage * 1.3);
      break;
    case 'vampiric_claws':
      player.lifestealChance += 0.25;
      break;
    case 'vampiric_bloodline':
      // Handled in killEnemy
      break;
    case 'toxic_rupture':
      player.toxicRupture = true;
      break;
    case 'reaper_edge':
      player.critChance += 0.30;
      player.critMult = 2.8;
      break;
    case 'shadow_haste':
      player.speed *= 1.30;
      player.dashCooldown *= 0.55;
      break;
    case 'hyper_haste':
      player.attackCooldown = Math.max(0.10, player.attackCooldown * 0.72);
      player.dashCooldown *= 0.50;
      break;
    case 'obsidian_flesh':
      player.maxHp += 4;
      player.hp = player.maxHp;
      player.armor += 1;
      break;
    case 'iron_clad':
      player.armor += 2;
      break;
    case 'flame_aura':
      player.flameAura = true;
      break;
    case 'cleave_master':
      player.attackRange += 22;
      player.damage += 12;
      player.cleaveBonus += 0.50;
      break;
    case 'titan_might':
      player.damage = Math.round(player.damage * 1.35);
      break;
    case 'alchemist_mastery':
      player.potions.hp += 2;
      player.potions.speed += 2;
      player.potions.power += 2;
      break;
    case 'chain_lightning':
      player.chainLightning = true;
      break;
    case 'freeze_dash':
      player.freezeDash = true;
      break;
    case 'aegis_shield':
      player.hasAegisShield = true;
      player.aegisShieldTimer = 0;
      break;
    case 'soul_bolt':
      player.soulBoltReadyCounter = 1;
      break;
  }
}
