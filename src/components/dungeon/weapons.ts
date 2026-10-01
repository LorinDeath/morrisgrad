// weapons.ts - Diablo-style Weapon & Scroll System for Dungeon Gathering Roguelite

export type WeaponRarity = 'common' | 'magic' | 'rare' | 'legendary';
export type WeaponType = 'sword' | 'dagger' | 'wand' | 'bow' | 'hammer';

export type WeaponAffixType =
  | 'damage'
  | 'speed'
  | 'crit'
  | 'lifesteal'
  | 'vitality'
  | 'light'
  | 'pierce'
  | 'knockback'
  | 'element'
  | 'multishot'
  | 'homing'
  | 'explosive'
  | 'armor'
  | 'moveSpeed'
  | 'execute'
  | 'ricochet'
  | 'souls'
  | 'pull';

export interface WeaponAffix {
  id: string;
  name: string;
  desc: string;
  type: WeaponAffixType;
  value: number;
  element?: 'fire' | 'frost' | 'lightning' | 'arcane' | 'poison' | 'solar';
}

export interface WeaponProjectileConfig {
  speed: number;
  pierce: number; // сколько врагов пробивает насквозь
  color: string;
  glowColor: string;
  trailColor: string;
  radius: number;
  isMagicOrb?: boolean; // жезл со светящимся шаром энергии
  orbType?: 'arcane' | 'plasma' | 'solar' | 'void' | 'frost' | 'storm';
  multishot?: number; // количество сфер за выстрел (веер)
  homing?: boolean; // самонаведение на врагов
  explosive?: boolean; // взрыв при попадании
}

export interface Weapon {
  id: string;
  name: string;
  type: WeaponType;
  rarity: WeaponRarity;
  level: number; // Уровень заточки свитками (+0, +1, +2...)

  // 3 Базовых параметра скейлинга
  statDamage: number;     // 1. Урон / Сила
  statSpeed: number;      // 2. Скорость атаки / Ловкость
  statMagicVitality: number; // 3. Магия / Снаряды / ХП / Свет

  // Итоговые рассчитанные боевые параметры
  baseDamage: number;
  attackCooldown: number; // секунды между ударами
  attackRange: number;

  // Дальнобойные параметры (для жезла, лука)
  projectile?: WeaponProjectileConfig;

  // Аффиксы в стиле Diablo
  affixes: WeaponAffix[];

  // Бонусы от аффиксов и заточки
  bonusDamage: number;
  bonusSpeedPct: number;
  bonusMaxHp: number;
  bonusCritChance: number;
  bonusCritMult: number;
  bonusLifesteal: number;
  bonusMoveSpeed: number;
  bonusLightRadius: number;
  bonusKnockback: number;
  bonusArmor: number;
  bonusMultishot: number;
  bonusHoming: boolean;
  bonusExplosive: boolean;
  bonusExecute: boolean;
  bonusSouls: boolean;
  element?: 'fire' | 'frost' | 'lightning' | 'arcane' | 'poison' | 'solar';

  // SVG иконка
  svgIcon: string;
}

export type ScrollType = 'might' | 'swiftness' | 'vitality' | 'vampirism' | 'transmutation';

export interface ScrollItem {
  id: string;
  type: ScrollType;
  name: string;
  desc: string;
  icon: string;
  color: string;
}

export interface GroundWeapon {
  id: number;
  weapon: Weapon;
  x: number;
  y: number;
  bobTimer: number;
}

export interface GroundScroll {
  id: number;
  scroll: ScrollItem;
  x: number;
  y: number;
  bobTimer: number;
}

// Цвета редкости в стиле Diablo
export const RARITY_COLORS: Record<WeaponRarity, { main: string; glow: string; label: string }> = {
  common: { main: '#e2e8f0', glow: 'rgba(226, 232, 240, 0.4)', label: 'Обычное' },
  magic: { main: '#38bdf8', glow: 'rgba(56, 189, 248, 0.6)', label: 'Магическое' },
  rare: { main: '#facc15', glow: 'rgba(250, 204, 21, 0.7)', label: 'Редкое' },
  legendary: { main: '#fb923c', glow: 'rgba(251, 146, 60, 0.9)', label: 'Легендарное' },
};

// Генератор SVG иконок для каждого оружия
export function generateWeaponSvg(type: WeaponType, rarity: WeaponRarity, orbType: string = 'plasma'): string {
  const color = RARITY_COLORS[rarity].main;

  if (type === 'wand') {
    // Палочка с парящим магическим шаром энергии!
    let coreColor = '#ffffff';
    let auraColor = '#ec4899';
    let ringColor = color;
    if (orbType === 'solar') {
      coreColor = '#fef08a';
      auraColor = '#f97316';
      ringColor = '#eab308';
    } else if (orbType === 'frost') {
      coreColor = '#e0f2fe';
      auraColor = '#38bdf8';
      ringColor = '#0284c7';
    } else if (orbType === 'void') {
      coreColor = '#e879f9';
      auraColor = '#9333ea';
      ringColor = '#581c87';
    } else if (orbType === 'storm') {
      coreColor = '#f0fdf4';
      auraColor = '#06b6d4';
      ringColor = '#3b82f6';
    }

    return `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="orbGlow_${type}_${rarity}_${orbType}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${coreColor}"/>
          <stop offset="40%" stop-color="${ringColor}"/>
          <stop offset="100%" stop-color="${auraColor}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <!-- Рукоять посоха -->
      <line x1="7" y1="27" x2="20" y2="14" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
      <line x1="9" y1="25" x2="22" y2="12" stroke="#d97706" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Золотое навершие -->
      <circle cx="21" cy="13" r="3" fill="#ffd700"/>
      <!-- Ореол сферы энергии -->
      <circle cx="23" cy="9" r="7.5" fill="url(#orbGlow_${type}_${rarity}_${orbType})" opacity="0.85"/>
      <!-- Магический шар (сфера энергии) -->
      <circle cx="23" cy="9" r="4.5" fill="${auraColor}"/>
      <circle cx="23" cy="9" r="3.5" fill="${ringColor}"/>
      <circle cx="22" cy="8" r="1.6" fill="${coreColor}"/>
      <!-- Искры вокруг шара -->
      <circle cx="16" cy="8" r="1" fill="#ffd700"/>
      <circle cx="28" cy="6" r="1" fill="${coreColor}"/>
      <circle cx="25" cy="15" r="1" fill="${auraColor}"/>
    </svg>`;
  }

  if (type === 'sword') {
    return `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 25L9 27L25 11L27 5L21 7L7 25Z" fill="${color}" stroke="#0f172a" stroke-width="1"/>
      <line x1="10" y1="22" x2="23" y2="9" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M5 21L11 27" stroke="#ffd700" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="6" y1="26" x2="4" y2="28" stroke="#78350f" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="3" cy="29" r="1.5" fill="#ffd700"/>
    </svg>`;
  }

  if (type === 'dagger') {
    return `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 22L12 24L24 12L25 7L20 8L10 22Z" fill="${color}" stroke="#0f172a" stroke-width="1"/>
      <line x1="8" y1="20" x2="14" y2="26" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
      <line x1="9" y1="23" x2="6" y2="26" stroke="#475569" stroke-width="2" stroke-linecap="round"/>
      <circle cx="5" cy="27" r="1.2" fill="${color}"/>
    </svg>`;
  }

  if (type === 'hammer') {
    return `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="26" x2="21" y2="11" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
      <rect x="17" y="5" width="10" height="7" rx="1.5" transform="rotate(45 17 5)" fill="${color}" stroke="#0f172a" stroke-width="1"/>
      <circle cx="21" cy="9" r="2" fill="#ffd700"/>
    </svg>`;
  }

  // Bow
  return `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 7C16 12 20 16 25 25" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="7" y1="7" x2="25" y2="25" stroke="${color}" stroke-width="1" stroke-dasharray="2 1"/>
    <line x1="10" y1="22" x2="22" y2="10" stroke="#f8fafc" stroke-width="1.5"/>
    <path d="M22 10L24 7L21 9Z" fill="${color}"/>
  </svg>`;
}

export function generateScrollSvg(color: string): string {
  return `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="8" width="20" height="16" rx="3" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5"/>
    <path d="M8 12H24M8 16H20M8 20H22" stroke="#854d0e" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1"/>
    <circle cx="16" cy="16" r="2" fill="#ffffff" fill-opacity="0.8"/>
  </svg>`;
}

// Расширенный пул префиксов в стиле Diablo
export const PREFIXES: {
  name: string;
  type: WeaponAffixType;
  desc: string;
  valRange: [number, number];
  element?: 'fire' | 'frost' | 'lightning' | 'arcane' | 'poison' | 'solar';
}[] = [
  { name: 'Пылающий', type: 'element', desc: 'Урон огнём и периодический ожог монстров', valRange: [6, 16], element: 'fire' },
  { name: 'Леденящий', type: 'element', desc: 'Урон холодом и замедление на 50%', valRange: [5, 14], element: 'frost' },
  { name: 'Громовой', type: 'element', desc: 'Урон молнией с цепным разрядом по врагам', valRange: [7, 18], element: 'lightning' },
  { name: 'Токсичный', type: 'element', desc: 'Чумной ядовитый урон и разложение плоти', valRange: [6, 15], element: 'poison' },
  { name: 'Астральный', type: 'element', desc: 'Урон чистой космической магией сфер', valRange: [8, 20], element: 'arcane' },
  { name: 'Солнечный', type: 'element', desc: 'Священный свет, испепеляющий нежить', valRange: [10, 22], element: 'solar' },
  { name: 'Острый', type: 'damage', desc: '+к прямому урону оружия', valRange: [6, 14] },
  { name: 'Хаотический', type: 'damage', desc: '+к сокрушительному физическому урону', valRange: [10, 24] },
  { name: 'Смертоносный', type: 'crit', desc: '+к шансу и силе критического удара', valRange: [12, 30] },
  { name: 'Стремительный', type: 'speed', desc: '+к скорости атаки оружия', valRange: [20, 45] },
  { name: 'Вихревой', type: 'speed', desc: '+к бешеной скорости ударов и рывков', valRange: [25, 50] },
  { name: 'Кровожадный', type: 'lifesteal', desc: '+% похищения здоровья при ударе', valRange: [6, 14] },
  { name: 'Титанический', type: 'vitality', desc: '+к максимальному запасу здоровья', valRange: [3, 8] },
  { name: 'Аркановый', type: 'pierce', desc: 'Светящиеся сферы пронзают врагов насквозь', valRange: [2, 4] },
  { name: 'Призрачный', type: 'pierce', desc: 'Снаряды проходят сквозь толпы врагов', valRange: [3, 5] },
  { name: 'Озаряющий', type: 'light', desc: '+к радиусу обзора и освещения в склепе', valRange: [40, 90] },
  { name: 'Сокрушающий', type: 'knockback', desc: '+к силе отбрасывания монстров', valRange: [60, 160] },
  { name: 'Многоликий', type: 'multishot', desc: 'Выпускает дополнительную магическую сферу веером', valRange: [1, 2] },
  { name: 'Самонаводящийся', type: 'homing', desc: 'Магические сферы сами наводятся на ближайших врагов', valRange: [1, 1] },
  { name: 'Взрывной', type: 'explosive', desc: 'Сферы взрываются при контакте с врагом, нанося урон по площади', valRange: [15, 35] },
  { name: 'Карающий', type: 'execute', desc: '+50% урона по врагам с запасом здоровья ниже 35%', valRange: [1, 1] },
  { name: 'Эгидный', type: 'armor', desc: '+к броне (снижает весь входящий урон)', valRange: [1, 2] },
];

// Расширенный пул суффиксов в стиле Diablo
export const SUFFIXES: {
  name: string;
  type: WeaponAffixType;
  desc: string;
  valRange: [number, number];
  element?: 'fire' | 'frost' | 'lightning' | 'arcane' | 'poison' | 'solar';
}[] = [
  { name: 'Погибели', type: 'damage', desc: '+дополнительный сокрушающий урон', valRange: [8, 20] },
  { name: 'Бури', type: 'speed', desc: '+молниеносная скорость ударов', valRange: [20, 38] },
  { name: 'Мясника', type: 'crit', desc: '+смертоносный шанс критического удара', valRange: [15, 28] },
  { name: 'Вампира', type: 'lifesteal', desc: '+похищение жизненных сил врагов', valRange: [5, 12] },
  { name: 'Вечного Света', type: 'light', desc: '+яркий радиус света вокруг героя', valRange: [40, 85] },
  { name: 'Тени', type: 'moveSpeed', desc: '+скорость бега и мобильность в бою', valRange: [16, 32] },
  { name: 'Исполина', type: 'vitality', desc: '+максимальное здоровье героя', valRange: [3, 8] },
  { name: 'Пустоты', type: 'pierce', desc: '+пробивание врагов снарядами-сферами', valRange: [2, 4] },
  { name: 'Сверхновой', type: 'element', desc: 'Критические удары вызывают взрыв сверхновой', valRange: [10, 24], element: 'fire' },
  { name: 'Абсолютного Нуля', type: 'element', desc: 'Замораживает врагов коркой льда на 2 секунды', valRange: [8, 18], element: 'frost' },
  { name: 'Штормового Разряда', type: 'element', desc: 'Вызывает дуговой разряд по соседним зомби', valRange: [10, 22], element: 'lightning' },
  { name: 'Жнеца Душ', type: 'souls', desc: '+100% шанс выпадения синих душ из поверженных монстров', valRange: [1, 1] },
  { name: 'Неуязвимости', type: 'armor', desc: '+к броне героя против атак монстров', valRange: [1, 2] },
  { name: 'Эфирных Сфер', type: 'multishot', desc: '+1 дополнительная сфера к залпу', valRange: [1, 1] },
  { name: 'Сингулярности', type: 'pull', desc: 'Сферы притягивают окружающих врагов в эпицентр', valRange: [1, 1] },
  { name: 'Безумия', type: 'damage', desc: '+необузданная ярость и колоссальный урон', valRange: [14, 28] },
  { name: 'Вестника Рока', type: 'execute', desc: 'Убийственный палаческий урон по раненым монстрам', valRange: [1, 1] },
];

export const WEAPON_BASE_NAMES: Record<WeaponType, string[]> = {
  wand: [
    'Магический Жезл Сфер',
    'Посох Плазменных Сфер',
    'Скипетр Эфира',
    'Орбоносец Катакомб',
    'Аркановый Жезл',
    'Плазменный Пульсар',
    'Око Пустоты',
    'Солнечная Сфера',
    'Ледяной Хрусталь',
    'Громовой Пульсар',
    'Астральный Светоч',
    'Сфероносец Грёз',
    'Сингулярность Бездны',
  ],
  sword: ['Клинок Пепла', 'Меч Склепа', 'Палаш Тьмы', 'Эспадон Рыцаря', 'Клеймор Палача'],
  dagger: ['Кинжал Тени', 'Стилет Погибели', 'Кортик Бездны', 'Шип Нечестивого', 'Теневой Зуб'],
  bow: ['Композитный Лук', 'Самострел Пустоты', 'Длинный Лук Пепла', 'Арбалет Охотника', 'Звёздный Лук'],
  hammer: ['Боевой Молот Титана', 'Секира Ярости', 'Булава Сокрушения', 'Дробитель Костей', 'Моргенштерн Хаоса'],
};

// Функция создания / пересчета оружия
export function calculateWeaponStats(weapon: Weapon): Weapon {
  let dmg = weapon.baseDamage + (weapon.level * 4);
  let cd = weapon.attackCooldown;
  let range = weapon.attackRange;
  let bonusMaxHp = 0;
  let bonusCrit = 0;
  let bonusLifesteal = 0;
  let bonusMoveSpeed = 0;
  let bonusLight = 0;
  let bonusKb = 0;
  let bonusArmor = 0;
  let bonusMultishot = 0;
  let bonusHoming = false;
  let bonusExplosive = false;
  let bonusExecute = false;
  let bonusSouls = false;
  let pierce = weapon.projectile?.pierce || 1;
  let elem: Weapon['element'] = undefined;

  // 1. statDamage
  dmg += Math.round(weapon.statDamage * 0.9);
  // 2. statSpeed снижает кулдаун
  const speedBonus = 1 + (weapon.statSpeed * 0.035);
  cd = Math.max(0.10, weapon.attackCooldown / speedBonus);
  // 3. statMagicVitality
  bonusMaxHp += Math.floor(weapon.statMagicVitality / 5) * 2;
  bonusLight += weapon.statMagicVitality * 2.5;
  if (weapon.projectile) {
    pierce += Math.floor(weapon.statMagicVitality / 8);
  }

  // Применяем все аффиксы
  for (const affix of weapon.affixes) {
    if (affix.type === 'damage') dmg += affix.value;
    else if (affix.type === 'speed') cd = Math.max(0.10, cd * (1 - affix.value / 100));
    else if (affix.type === 'vitality') bonusMaxHp += affix.value;
    else if (affix.type === 'crit') bonusCrit += affix.value / 100;
    else if (affix.type === 'lifesteal') bonusLifesteal += affix.value / 100;
    else if (affix.type === 'light') bonusLight += affix.value;
    else if (affix.type === 'knockback') bonusKb += affix.value;
    else if (affix.type === 'pierce') pierce += affix.value;
    else if (affix.type === 'moveSpeed') bonusMoveSpeed += affix.value;
    else if (affix.type === 'armor') bonusArmor += affix.value;
    else if (affix.type === 'multishot') bonusMultishot += affix.value;
    else if (affix.type === 'homing') bonusHoming = true;
    else if (affix.type === 'explosive') {
      bonusExplosive = true;
      dmg += Math.round(affix.value * 0.5);
    } else if (affix.type === 'execute') bonusExecute = true;
    else if (affix.type === 'souls') bonusSouls = true;
    else if (affix.type === 'element') {
      dmg += affix.value;
      if (!elem) elem = affix.element || 'fire';
    }
  }

  weapon.bonusDamage = dmg;
  weapon.attackCooldown = Math.round(cd * 100) / 100;
  weapon.bonusMaxHp = bonusMaxHp;
  weapon.bonusCritChance = Math.min(0.85, bonusCrit);
  weapon.bonusCritMult = 2.0 + (bonusCrit > 0.15 ? 0.6 : 0);
  weapon.bonusLifesteal = bonusLifesteal;
  weapon.bonusLightRadius = bonusLight;
  weapon.bonusKnockback = bonusKb;
  weapon.bonusMoveSpeed = bonusMoveSpeed;
  weapon.bonusArmor = bonusArmor;
  weapon.bonusMultishot = bonusMultishot;
  weapon.bonusHoming = bonusHoming;
  weapon.bonusExplosive = bonusExplosive;
  weapon.bonusExecute = bonusExecute;
  weapon.bonusSouls = bonusSouls;
  weapon.element = elem;

  if (weapon.projectile) {
    weapon.projectile.pierce = pierce;
    if (bonusMultishot > 0) {
      weapon.projectile.multishot = (weapon.projectile.multishot || 1) + bonusMultishot;
    }
    if (bonusHoming) weapon.projectile.homing = true;
    if (bonusExplosive) weapon.projectile.explosive = true;
  }

  return weapon;
}

// Генерация процедурного оружия с богатыми аффиксами и упором на магические сферы
export function generateRandomWeapon(floor: number, forcedType?: WeaponType, forcedRarity?: WeaponRarity): Weapon {
  // Увеличиваем вероятность выпадения крутых магических жезлов со светящимися сферами!
  const typePool: WeaponType[] = ['wand', 'wand', 'wand', 'sword', 'dagger', 'bow', 'hammer'];
  const type = forcedType || typePool[Math.floor(Math.random() * typePool.length)];

  // Определение редкости
  let rarity: WeaponRarity = forcedRarity || 'common';
  if (!forcedRarity) {
    const roll = Math.random();
    if (roll < 0.15 + floor * 0.04) rarity = 'legendary';
    else if (roll < 0.42 + floor * 0.05) rarity = 'rare';
    else if (roll < 0.75) rarity = 'magic';
    else rarity = 'common';
  }

  let baseDamage = 18 + floor * 4;
  let attackCooldown = 0.28;
  let range = 50;
  let projConfig: WeaponProjectileConfig | undefined = undefined;

  let statDmg = 6 + Math.floor(Math.random() * 6) + floor * 2;
  let statSpd = 6 + Math.floor(Math.random() * 6) + floor;
  let statMag = 6 + Math.floor(Math.random() * 6) + floor * 2;

  let chosenOrbType: 'arcane' | 'plasma' | 'solar' | 'void' | 'frost' | 'storm' = 'plasma';

  if (type === 'wand') {
    // Палочка с парящим магическим шаром энергии!
    const orbTypes: Array<'arcane' | 'plasma' | 'solar' | 'void' | 'frost' | 'storm'> = [
      'plasma',
      'arcane',
      'solar',
      'void',
      'frost',
      'storm',
    ];
    chosenOrbType = orbTypes[Math.floor(Math.random() * orbTypes.length)];

    baseDamage = 20 + floor * 4;
    attackCooldown = 0.30;
    range = 240;
    statMag += 10;

    let orbColor = '#c084fc';
    let orbGlow = '#ec4899';
    let orbTrail = '#a855f7';

    if (chosenOrbType === 'plasma') {
      orbColor = '#fb923c';
      orbGlow = '#f43f5e';
      orbTrail = '#a855f7';
    } else if (chosenOrbType === 'solar') {
      orbColor = '#facc15';
      orbGlow = '#f97316';
      orbTrail = '#ea580c';
    } else if (chosenOrbType === 'frost') {
      orbColor = '#38bdf8';
      orbGlow = '#0284c7';
      orbTrail = '#0369a1';
    } else if (chosenOrbType === 'void') {
      orbColor = '#e879f9';
      orbGlow = '#9333ea';
      orbTrail = '#4c1d95';
    } else if (chosenOrbType === 'storm') {
      orbColor = '#67e8f9';
      orbGlow = '#3b82f6';
      orbTrail = '#1d4ed8';
    }

    const multishotCount = rarity === 'legendary' ? (Math.random() < 0.6 ? 3 : 2) : rarity === 'rare' ? 2 : 1;

    projConfig = {
      speed: 290,
      pierce: 2 + (rarity === 'legendary' ? 3 : rarity === 'rare' ? 2 : 1),
      color: orbColor,
      glowColor: orbGlow,
      trailColor: orbTrail,
      radius: 9,
      isMagicOrb: true,
      orbType: chosenOrbType,
      multishot: multishotCount,
      explosive: rarity === 'legendary',
    };
  } else if (type === 'dagger') {
    baseDamage = 14 + floor * 3;
    attackCooldown = 0.16;
    range = 40;
    statSpd += 12;
  } else if (type === 'sword') {
    baseDamage = 22 + floor * 4;
    attackCooldown = 0.26;
    range = 54;
    statDmg += 8;
  } else if (type === 'hammer') {
    baseDamage = 32 + floor * 5;
    attackCooldown = 0.38;
    range = 64;
    statDmg += 14;
  } else if (type === 'bow') {
    baseDamage = 18 + floor * 4;
    attackCooldown = 0.28;
    range = 250;
    statSpd += 8;
    projConfig = {
      speed: 350,
      pierce: 1 + (rarity === 'legendary' ? 3 : rarity === 'rare' ? 1 : 0),
      color: '#f8fafc',
      glowColor: '#38bdf8',
      trailColor: '#0284c7',
      radius: 4.5,
      multishot: rarity === 'legendary' ? 2 : 1,
    };
  }

  // Генерация аффиксов в зависимости от редкости
  const affixCount = rarity === 'legendary' ? 4 : rarity === 'rare' ? 3 : rarity === 'magic' ? 2 : 1;
  const affixes: WeaponAffix[] = [];

  const chosenPrefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const chosenSuffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];

  if (chosenPrefix) {
    const val = Math.floor(chosenPrefix.valRange[0] + Math.random() * (chosenPrefix.valRange[1] - chosenPrefix.valRange[0] + 1));
    affixes.push({
      id: `pref_${chosenPrefix.name}_${Math.random().toString(36).substring(2, 6)}`,
      name: chosenPrefix.name,
      desc: chosenPrefix.desc,
      type: chosenPrefix.type,
      value: val,
      ...(chosenPrefix.element ? { element: chosenPrefix.element } : {}),
    });
  }

  if (affixCount > 1 && chosenSuffix) {
    const val = Math.floor(chosenSuffix.valRange[0] + Math.random() * (chosenSuffix.valRange[1] - chosenSuffix.valRange[0] + 1));
    affixes.push({
      id: `suf_${chosenSuffix.name}_${Math.random().toString(36).substring(2, 6)}`,
      name: chosenSuffix.name,
      desc: chosenSuffix.desc,
      type: chosenSuffix.type,
      value: val,
      ...(chosenSuffix.element ? { element: chosenSuffix.element } : {}),
    });
  }

  // Дополнительные аффиксы для редких/легендарных
  while (affixes.length < affixCount) {
    const pool = [...PREFIXES, ...SUFFIXES].filter((p) => !affixes.some((a) => a.name === p.name));
    if (pool.length === 0) break;
    const extra = pool[Math.floor(Math.random() * pool.length)];
    const val = Math.floor(extra.valRange[0] + Math.random() * (extra.valRange[1] - extra.valRange[0] + 1));
    affixes.push({
      id: `extra_${extra.name}_${Math.random().toString(36).substring(2, 6)}`,
      name: extra.name,
      desc: extra.desc,
      type: extra.type,
      value: val,
      ...(extra.element ? { element: extra.element } : {}),
    });
  }

  // Имя оружия
  const baseNameList = WEAPON_BASE_NAMES[type];
  const baseName = baseNameList[Math.floor(Math.random() * baseNameList.length)];
  let fullName = baseName;
  if (chosenPrefix && chosenSuffix && affixCount > 1) {
    fullName = `${chosenPrefix.name} ${baseName} ${chosenSuffix.name}`;
  } else if (chosenPrefix) {
    fullName = `${chosenPrefix.name} ${baseName}`;
  } else if (chosenSuffix) {
    fullName = `${baseName} ${chosenSuffix.name}`;
  }

  const weapon: Weapon = {
    id: `wpn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: fullName,
    type,
    rarity,
    level: 0,
    statDamage: statDmg,
    statSpeed: statSpd,
    statMagicVitality: statMag,
    baseDamage,
    attackCooldown,
    attackRange: range,
    projectile: projConfig,
    affixes,
    bonusDamage: baseDamage,
    bonusSpeedPct: 0,
    bonusMaxHp: 0,
    bonusCritChance: 0,
    bonusCritMult: 2.0,
    bonusLifesteal: 0,
    bonusMoveSpeed: 0,
    bonusLightRadius: 0,
    bonusKnockback: 0,
    bonusArmor: 0,
    bonusMultishot: 0,
    bonusHoming: false,
    bonusExplosive: false,
    bonusExecute: false,
    bonusSouls: false,
    svgIcon: generateWeaponSvg(type, rarity, chosenOrbType),
  };

  return calculateWeaponStats(weapon);
}

// Генерация свитка в стиле Diablo
export function generateRandomScroll(): ScrollItem {
  const scrolls: ScrollItem[] = [
    {
      id: 'scroll_might',
      type: 'might',
      name: 'Свиток Разрушения',
      desc: 'Навсегда повышает уровень оружия (+1) и добавляет +4 базового урона!',
      icon: '⚔️',
      color: '#ef4444',
    },
    {
      id: 'scroll_swiftness',
      type: 'swiftness',
      name: 'Свиток Стремительности',
      desc: 'Повышает скорость атаки оружия на +20% (снижает задержку ударов)!',
      icon: '⚡',
      color: '#38bdf8',
    },
    {
      id: 'scroll_vitality',
      type: 'vitality',
      name: 'Свиток Астрала и Жизни',
      desc: 'Добавляет +2 к максимальному HP и расширяет радиус освещения на +45 пикселей!',
      icon: '❤️',
      color: '#4ade80',
    },
    {
      id: 'scroll_vampirism',
      type: 'vampirism',
      name: 'Свиток Кровавой Жатвы',
      desc: 'Наделяет оружие свойством вампиризма: +6% к исцелению от ударов по монстрам!',
      icon: '🩸',
      color: '#e11d48',
    },
    {
      id: 'scroll_transmutation',
      type: 'transmutation',
      name: 'Свиток Зачарования Хаоса',
      desc: 'Повышает качество оружия на 1 ранг (до Легендарного) и накладывает новый мощный аффикс!',
      icon: '✨',
      color: '#fb923c',
    },
  ];

  return scrolls[Math.floor(Math.random() * scrolls.length)];
}

// Применение свитка к оружию / игроку
export function applyScrollToWeapon(scroll: ScrollItem, weapon: Weapon): { message: string; upgraded: Weapon } {
  if (scroll.type === 'might') {
    weapon.level += 1;
    weapon.statDamage += 8;
    weapon.baseDamage += 5;
    return {
      message: `⚔️ ЗАТОЧЕНО: ${weapon.name} +${weapon.level}! (+5 Урона)`,
      upgraded: calculateWeaponStats(weapon),
    };
  }

  if (scroll.type === 'swiftness') {
    weapon.statSpeed += 7;
    weapon.affixes.push({
      id: `scroll_speed_${Date.now()}`,
      name: 'Стремительный',
      desc: '+20% скорость атаки',
      type: 'speed',
      value: 20,
    });
    return {
      message: `⚡ БЫСТРОТА: Скорость атаки повышена на +20%!`,
      upgraded: calculateWeaponStats(weapon),
    };
  }

  if (scroll.type === 'vitality') {
    weapon.statMagicVitality += 10;
    weapon.affixes.push({
      id: `scroll_vit_${Date.now()}`,
      name: 'Астральный Свет',
      desc: '+2 Max HP и +45 радиус света',
      type: 'vitality',
      value: 2,
    });
    return {
      message: `❤️ АСТРАЛ: +2 Max HP и +45 к радиусу света!`,
      upgraded: calculateWeaponStats(weapon),
    };
  }

  if (scroll.type === 'vampirism') {
    weapon.affixes.push({
      id: `scroll_vamp_${Date.now()}`,
      name: 'Кровожадный',
      desc: '+6% вампиризма при ударе',
      type: 'lifesteal',
      value: 6,
    });
    return {
      message: `🩸 ВАМПИРИЗМ: +6% к исцелению от ударов!`,
      upgraded: calculateWeaponStats(weapon),
    };
  }

  if (scroll.type === 'transmutation') {
    const rarities: WeaponRarity[] = ['common', 'magic', 'rare', 'legendary'];
    const currentIdx = rarities.indexOf(weapon.rarity);
    if (currentIdx < rarities.length - 1) {
      weapon.rarity = rarities[currentIdx + 1];
    }
    const extra = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const val = Math.floor(extra.valRange[0] + Math.random() * (extra.valRange[1] - extra.valRange[0] + 1));
    weapon.affixes.push({
      id: `transmute_${Date.now()}`,
      name: extra.name,
      desc: extra.desc,
      type: extra.type,
      value: val,
      ...(extra.element ? { element: extra.element } : {}),
    });

    weapon.svgIcon = generateWeaponSvg(weapon.type, weapon.rarity, weapon.projectile?.orbType || 'plasma');

    return {
      message: `✨ ХАОС: Оружие возвышено до [${RARITY_COLORS[weapon.rarity].label}]!`,
      upgraded: calculateWeaponStats(weapon),
    };
  }

  return { message: 'Свиток использован!', upgraded: calculateWeaponStats(weapon) };
}

// Создание стартового оружия для класса героя
export function createStarterWeapon(heroClass: string): Weapon {
  if (heroClass === 'sorcerer') {
    // Теневой Адепт стартует с Аркановым Жезлом Сфер (светящиеся шары!)
    return {
      id: 'starter_wand',
      name: 'Аркановый Посох Сфер',
      type: 'wand',
      rarity: 'magic',
      level: 0,
      statDamage: 10,
      statSpeed: 8,
      statMagicVitality: 14,
      baseDamage: 22,
      attackCooldown: 0.28,
      attackRange: 240,
      projectile: {
        speed: 290,
        pierce: 3, // Пробивает 3 врагов насквозь!
        color: '#c084fc',
        glowColor: '#ec4899',
        trailColor: '#a855f7',
        radius: 9,
        isMagicOrb: true,
        orbType: 'plasma',
        multishot: 1,
      },
      affixes: [
        {
          id: 'starter_pierce',
          name: 'Пронзающий',
          desc: 'Светящиеся магические сферы пробивают толпы врагов насквозь',
          type: 'pierce',
          value: 3,
        },
        {
          id: 'starter_astral',
          name: 'Астральный',
          desc: '+8 к урону космической магией сфер',
          type: 'element',
          value: 8,
          element: 'arcane',
        },
      ],
      bonusDamage: 22,
      bonusSpeedPct: 0,
      bonusMaxHp: 2,
      bonusCritChance: 0.18,
      bonusCritMult: 2.2,
      bonusLifesteal: 0,
      bonusMoveSpeed: 0,
      bonusLightRadius: 45,
      bonusKnockback: 40,
      bonusArmor: 0,
      bonusMultishot: 0,
      bonusHoming: false,
      bonusExplosive: false,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('wand', 'magic', 'plasma'),
    };
  }

  if (heroClass === 'assassin') {
    return {
      id: 'starter_dagger',
      name: 'Зазубренный Стилет Тени',
      type: 'dagger',
      rarity: 'magic',
      level: 0,
      statDamage: 7,
      statSpeed: 16,
      statMagicVitality: 4,
      baseDamage: 18,
      attackCooldown: 0.16,
      attackRange: 42,
      affixes: [
        {
          id: 'starter_crit',
          name: 'Смертоносный',
          desc: '+25% шанс критического удара',
          type: 'crit',
          value: 25,
        },
      ],
      bonusDamage: 18,
      bonusSpeedPct: 25,
      bonusMaxHp: 0,
      bonusCritChance: 0.30,
      bonusCritMult: 2.6,
      bonusLifesteal: 0,
      bonusMoveSpeed: 20,
      bonusLightRadius: 0,
      bonusKnockback: 20,
      bonusArmor: 0,
      bonusMultishot: 0,
      bonusHoming: false,
      bonusExplosive: false,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('dagger', 'magic'),
    };
  }

  if (heroClass === 'paladin') {
    return {
      id: 'starter_sword_paladin',
      name: 'Освящённый Меч Пепла',
      type: 'sword',
      rarity: 'magic',
      level: 0,
      statDamage: 12,
      statSpeed: 7,
      statMagicVitality: 10,
      baseDamage: 24,
      attackCooldown: 0.28,
      attackRange: 56,
      affixes: [
        {
          id: 'starter_vit',
          name: 'Священный',
          desc: '+3 Max HP и +1 к броне',
          type: 'vitality',
          value: 3,
        },
        {
          id: 'starter_arm',
          name: 'Эгидный',
          desc: '+1 к броне (снижает получаемый урон)',
          type: 'armor',
          value: 1,
        },
      ],
      bonusDamage: 24,
      bonusSpeedPct: 0,
      bonusMaxHp: 3,
      bonusCritChance: 0.12,
      bonusCritMult: 2.0,
      bonusLifesteal: 0,
      bonusMoveSpeed: 0,
      bonusLightRadius: 40,
      bonusKnockback: 70,
      bonusArmor: 1,
      bonusMultishot: 0,
      bonusHoming: false,
      bonusExplosive: false,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('sword', 'magic'),
    };
  }

  if (heroClass === 'berserker') {
    return {
      id: 'starter_hammer',
      name: 'Тяжёлая Секира Ярости',
      type: 'hammer',
      rarity: 'magic',
      level: 0,
      statDamage: 18,
      statSpeed: 5,
      statMagicVitality: 4,
      baseDamage: 30,
      attackCooldown: 0.36,
      attackRange: 64,
      affixes: [
        {
          id: 'starter_kb',
          name: 'Сокрушающий',
          desc: '+120 сила отталкивания монстров',
          type: 'knockback',
          value: 120,
        },
      ],
      bonusDamage: 30,
      bonusSpeedPct: 0,
      bonusMaxHp: 0,
      bonusCritChance: 0.18,
      bonusCritMult: 2.4,
      bonusLifesteal: 0,
      bonusMoveSpeed: 0,
      bonusLightRadius: 0,
      bonusKnockback: 120,
      bonusArmor: 0,
      bonusMultishot: 0,
      bonusHoming: false,
      bonusExplosive: false,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('hammer', 'magic'),
    };
  }

  // Zombie (default)
  return {
    id: 'starter_sword_zombie',
    name: 'Ржавый Чумной Клинок',
    type: 'sword',
    rarity: 'common',
    level: 0,
    statDamage: 9,
    statSpeed: 9,
    statMagicVitality: 8,
    baseDamage: 20,
    attackCooldown: 0.26,
    attackRange: 48,
    affixes: [
      {
        id: 'starter_vamp',
        name: 'Чумной',
        desc: '+10% вампиризм при ударе',
        type: 'lifesteal',
        value: 10,
      },
    ],
    bonusDamage: 20,
    bonusSpeedPct: 0,
    bonusMaxHp: 0,
    bonusCritChance: 0.15,
    bonusCritMult: 2.0,
    bonusLifesteal: 0.10,
    bonusMoveSpeed: 0,
    bonusLightRadius: 0,
    bonusKnockback: 45,
    bonusArmor: 0,
    bonusMultishot: 0,
    bonusHoming: false,
    bonusExplosive: false,
    bonusExecute: false,
    bonusSouls: false,
    svgIcon: generateWeaponSvg('sword', 'common'),
  };
}

export function createLoadoutWeapon(loadout: string, heroClass: string): Weapon {
  if (loadout === 'plasma_wand') {
    return {
      id: 'loadout_plasma_wand',
      name: 'Сфокусированный Плазменный Жезл',
      type: 'wand',
      rarity: 'rare',
      level: 0,
      statDamage: 12,
      statSpeed: 10,
      statMagicVitality: 16,
      baseDamage: 26,
      attackCooldown: 0.26,
      attackRange: 260,
      projectile: {
        speed: 310,
        pierce: 3,
        color: '#fb923c',
        glowColor: '#f43f5e',
        trailColor: '#a855f7',
        radius: 10,
        isMagicOrb: true,
        orbType: 'plasma',
        multishot: 2,
        explosive: true,
      },
      affixes: [
        {
          id: 'loadout_plasma_1',
          name: 'Плазменный Взрыв',
          desc: 'Сферы взрываются при попадании, нанося урон по площади',
          type: 'explosive',
          value: 20,
        },
        {
          id: 'loadout_plasma_2',
          name: 'Сдвоенный Залп',
          desc: 'Выпускает 2 сферы веером',
          type: 'multishot',
          value: 1,
        },
      ],
      bonusDamage: 26,
      bonusSpeedPct: 0,
      bonusMaxHp: 2,
      bonusCritChance: 0.22,
      bonusCritMult: 2.4,
      bonusLifesteal: 0,
      bonusMoveSpeed: 0,
      bonusLightRadius: 60,
      bonusKnockback: 40,
      bonusArmor: 0,
      bonusMultishot: 1,
      bonusHoming: false,
      bonusExplosive: true,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('wand', 'rare', 'plasma'),
    };
  }

  if (loadout === 'claymore') {
    return {
      id: 'loadout_claymore',
      name: 'Двуручный Клеймор Истребителя',
      type: 'sword',
      rarity: 'rare',
      level: 0,
      statDamage: 18,
      statSpeed: 6,
      statMagicVitality: 8,
      baseDamage: 32,
      attackCooldown: 0.32,
      attackRange: 66,
      affixes: [
        {
          id: 'loadout_claymore_1',
          name: 'Сокрушающий Размах',
          desc: '+14 к базовому физическому урону',
          type: 'damage',
          value: 14,
        },
        {
          id: 'loadout_claymore_2',
          name: 'Тяжелый Удар',
          desc: '+80 к силе отбрасывания зомби',
          type: 'knockback',
          value: 80,
        },
      ],
      bonusDamage: 32,
      bonusSpeedPct: 0,
      bonusMaxHp: 4,
      bonusCritChance: 0.20,
      bonusCritMult: 2.5,
      bonusLifesteal: 0,
      bonusMoveSpeed: -5,
      bonusLightRadius: 20,
      bonusKnockback: 90,
      bonusArmor: 1,
      bonusMultishot: 0,
      bonusHoming: false,
      bonusExplosive: false,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('sword', 'rare'),
    };
  }

  if (loadout === 'daggers') {
    return {
      id: 'loadout_daggers',
      name: 'Парные Кинжалы Вихря Крови',
      type: 'dagger',
      rarity: 'rare',
      level: 0,
      statDamage: 8,
      statSpeed: 20,
      statMagicVitality: 6,
      baseDamage: 19,
      attackCooldown: 0.14,
      attackRange: 42,
      affixes: [
        {
          id: 'loadout_daggers_1',
          name: 'Вихрь Стали',
          desc: '+35% к скорости ударов',
          type: 'speed',
          value: 35,
        },
        {
          id: 'loadout_daggers_2',
          name: 'Кровопускатель',
          desc: '+8% вампиризма при ударе',
          type: 'lifesteal',
          value: 8,
        },
      ],
      bonusDamage: 19,
      bonusSpeedPct: 35,
      bonusMaxHp: 0,
      bonusCritChance: 0.32,
      bonusCritMult: 2.6,
      bonusLifesteal: 0.08,
      bonusMoveSpeed: 25,
      bonusLightRadius: 0,
      bonusKnockback: 20,
      bonusArmor: 0,
      bonusMultishot: 0,
      bonusHoming: false,
      bonusExplosive: false,
      bonusExecute: false,
      bonusSouls: false,
      svgIcon: generateWeaponSvg('dagger', 'rare'),
    };
  }

  if (loadout === 'astral_blaster') {
    return {
      id: 'loadout_astral_blaster',
      name: 'Астральный Пульсар Звезд',
      type: 'wand',
      rarity: 'legendary',
      level: 0,
      statDamage: 14,
      statSpeed: 12,
      statMagicVitality: 22,
      baseDamage: 30,
      attackCooldown: 0.22,
      attackRange: 270,
      projectile: {
        speed: 330,
        pierce: 4,
        color: '#67e8f9',
        glowColor: '#3b82f6',
        trailColor: '#1d4ed8',
        radius: 11,
        isMagicOrb: true,
        orbType: 'storm',
        multishot: 3,
        homing: true,
        explosive: true,
      },
      affixes: [
        {
          id: 'loadout_astral_1',
          name: 'Тройной Звездный Залп',
          desc: 'Стреляет 3 сферами веером',
          type: 'multishot',
          value: 2,
        },
        {
          id: 'loadout_astral_2',
          name: 'Астральное Наведение',
          desc: 'Сферы наводятся на цели',
          type: 'homing',
          value: 1,
        },
      ],
      bonusDamage: 30,
      bonusSpeedPct: 15,
      bonusMaxHp: 4,
      bonusCritChance: 0.28,
      bonusCritMult: 2.6,
      bonusLifesteal: 0.05,
      bonusMoveSpeed: 15,
      bonusLightRadius: 80,
      bonusKnockback: 50,
      bonusArmor: 1,
      bonusMultishot: 2,
      bonusHoming: true,
      bonusExplosive: true,
      bonusExecute: false,
      bonusSouls: true,
      svgIcon: generateWeaponSvg('wand', 'legendary', 'storm'),
    };
  }

  return createStarterWeapon(heroClass);
}
