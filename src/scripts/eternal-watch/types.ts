// Типы «Вечной стражи», вторая ночь. Без DOM.

export const SAVE_KEY = "mg-eternal-watch-v2";
export const SAVE_KEY_V1 = "mg-eternal-watch-v1";

export const MODE_IDS = [
  "campaign", "endless",
  "blitz", "boss", "five", "maze", "fog", "dual", "life", "daily", "chaos", "sandbox",
] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const TOWER_KINDS = [
  "spark", "needle", "muzzle", "chill", "venom", "arc",
  "beam", "bolt", "blaze", "halo", "awl", "swarm", "miner",
] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

export const ENEMY_KINDS = [
  "walker", "runner", "knight", "healer", "splitter", "shield",
  "flyer", "shade", "caller", "boss", "mite", "thrall",
] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export const DMG_TYPES = ["phys", "fire", "frost", "shock", "poison", "energy", "blast"] as const;
export type DmgType = (typeof DMG_TYPES)[number];

export type ModKind = "dmg" | "range" | "rate" | "xp" | "bounty";
export type TargetMode = "first" | "last" | "strong" | "near";
export type GlobalId = "fire" | "bliz" | "dawn";

export const TOWER_NAME: Record<TowerKind, string> = {
  spark: "Искра", needle: "Игла", muzzle: "Жерло", chill: "Стужа", venom: "Яд",
  arc: "Разряд", beam: "Луч", bolt: "Стрела", blaze: "Жар", halo: "Ореол",
  awl: "Шило", swarm: "Россыпь", miner: "Жильник",
};

export const TOWER_COLOR: Record<TowerKind, string> = {
  spark: "#ffb020", needle: "#3ee0ff", muzzle: "#ff6a1a", chill: "#9ad7ff", venom: "#b6ff3c",
  arc: "#c9a6ff", beam: "#ff3d9a", bolt: "#ff3355", blaze: "#ff5a1f", halo: "#5dffd0",
  awl: "#e7f3ff", swarm: "#ffe566", miner: "#d8b15a",
};

export const ENEMY_NAME: Record<EnemyKind, string> = {
  walker: "Пехота ночи", runner: "Бегун", knight: "Латник", healer: "Знахарь",
  splitter: "Дробильщик", shield: "Щитоносец", flyer: "Ночница", shade: "Тень",
  caller: "Зов", boss: "Страж ночи", mite: "Искра роя", thrall: "Прислужник",
};

export const ENEMY_COLOR: Record<EnemyKind, string> = {
  walker: "#d7c4a4", runner: "#ffd56a", knight: "#c0c6d4", healer: "#7dffb2",
  splitter: "#ff9a6a", shield: "#9ecbff", flyer: "#e6d0ff", shade: "#8a7cff",
  caller: "#ff7ad1", boss: "#ff4d6a", mite: "#ffc2a8", thrall: "#d2b4ff",
};

export const DMG_NAME: Record<DmgType, string> = {
  phys: "сталь", fire: "огонь", frost: "стужа", shock: "гроза",
  poison: "яд", energy: "свет", blast: "разрыв",
};

export const TARGET_NAME: Record<TargetMode, string> = {
  first: "первый на тропе", last: "последний", strong: "самый здоровый", near: "ближайший",
};

export const TARGET_ORDER: TargetMode[] = ["first", "last", "strong", "near"];

export interface Cost { sparks: number; ash: number; vein: number }
export interface Cell { x: number; y: number }
export interface Act { ok: boolean; reason: string }

export const ok = (): Act => ({ ok: true, reason: "" });
export const fail = (reason: string): Act => ({ ok: false, reason });

export function towerRec<T>(fill: () => T): Record<TowerKind, T> {
  const o = {} as Record<TowerKind, T>;
  for (const k of TOWER_KINDS) o[k] = fill();
  return o;
}
export function enemyRec<T>(fill: () => T): Record<EnemyKind, T> {
  const o = {} as Record<EnemyKind, T>;
  for (const k of ENEMY_KINDS) o[k] = fill();
  return o;
}

export interface TowerSpec {
  kind: TowerKind;
  cost: number;
  dmg: number;
  rate: number;
  range: number;
  type: DmgType;
  air: boolean;
  blurb: string;
}

export const TOWERS: Record<TowerKind, TowerSpec> = {
  spark: { kind: "spark", cost: 35, dmg: 14, rate: 1.2, range: 2.75, type: "phys", air: false, blurb: "Один снаряд по земле." },
  needle: { kind: "needle", cost: 75, dmg: 42, rate: 0.4, range: 5.1, type: "energy", air: false, blurb: "Дальняя игла. Игнорирует 45% брони." },
  muzzle: { kind: "muzzle", cost: 62, dmg: 20, rate: 0.6, range: 3.35, type: "blast", air: false, blurb: "Взрыв 1.10 клетки, на краю 55% урона." },
  chill: { kind: "chill", cost: 50, dmg: 6, rate: 1, range: 2.65, type: "frost", air: false, blurb: "Замедление 34% на 1.5 с. Три стака — лёд на 0.7 с." },
  venom: { kind: "venom", cost: 54, dmg: 4, rate: 0.9, range: 2.85, type: "poison", air: false, blurb: "Яд 4.5 в секунду на 3.2 с, до 5 стаков. Броня яду не мешает." },
  arc: { kind: "arc", cost: 80, dmg: 16, rate: 0.8, range: 3.15, type: "shock", air: false, blurb: "Два прыжка, следующий удар 72%, прыжок до 1.7 клетки." },
  beam: { kind: "beam", cost: 90, dmg: 24, rate: 0.55, range: 4.3, type: "energy", air: true, blurb: "Луч шириной 0.38, до 3 целей. Бьёт воздух." },
  bolt: { kind: "bolt", cost: 84, dmg: 26, rate: 0.52, range: 4.4, type: "blast", air: true, blurb: "Самонаведение и взрыв 0.70. Бьёт воздух." },
  blaze: { kind: "blaze", cost: 58, dmg: 9, rate: 3, range: 2.2, type: "fire", air: false, blurb: "Конус. Поджог 3.2 в секунду на 2 с." },
  halo: { kind: "halo", cost: 74, dmg: 7, rate: 2.2, range: 1.8, type: "shock", air: true, blurb: "Аура по всем в радиусе. Раскрывает тень на 1.4 с. Бьёт воздух." },
  awl: { kind: "awl", cost: 96, dmg: 25, rate: 0.72, range: 4.6, type: "phys", air: false, blurb: "Линия, до 4 целей." },
  swarm: { kind: "swarm", cost: 66, dmg: 8, rate: 1.1, range: 3.05, type: "phys", air: true, blurb: "Три снаряда: 100%, 75% и 55%. Бьёт воздух." },
  miner: { kind: "miner", cost: 40, dmg: 0, rate: 1 / 6, range: 0, type: "phys", air: false, blurb: "Только на жиле. 1 руда каждые 6 с. 8 опыта за руду." },
};

export interface AbilityDef { id: string; name: string; text: string }

export const ABILITIES: Record<TowerKind, AbilityDef[]> = {
  spark: [
    { id: "sting", name: "Жало", text: "+35% урона по цели выше 80% здоровья." },
    { id: "twin", name: "Двойник", text: "28% шанс второго снаряда на 70% урона." },
    { id: "mercy", name: "Милость", text: "Если после удара здоровье ниже 9%, цель падает. У Стража порог не выше 6%." },
    { id: "tempo", name: "Разгон", text: "+12% темпа." },
    { id: "sparkle", name: "Искра в горсти", text: "12% шанс +1 золота с попадания." },
  ],
  needle: [
    { id: "puncture", name: "Прокол", text: "+35 процентных пунктов пробития брони." },
    { id: "headshot", name: "По Стражу", text: "+45% урона по Стражу ночи." },
    { id: "glass", name: "Стекло", text: "+0.7 радиуса и −12% темпа." },
    { id: "steady", name: "Ровная рука", text: "+15% урона." },
    { id: "mark", name: "Метка", text: "3 с цель получает +12% урона от всех." },
  ],
  muzzle: [
    { id: "crater", name: "Кратер", text: "+0.40 клетки к взрыву." },
    { id: "cluster", name: "Гроздь", text: "Ещё два разрыва по 40% по ближайшим в радиусе." },
    { id: "napalm", name: "Напалм", text: "Поджог 3 в секунду на 2.5 с." },
    { id: "quick", name: "Короткий ствол", text: "+18% темпа." },
    { id: "heavy", name: "Тяжёлое ядро", text: "+25% урона и −0.2 клетки взрыва." },
  ],
  chill: [
    { id: "spread", name: "Поземка", text: "Замедление плещется на 0.8 клетки." },
    { id: "deep", name: "Глубь", text: "Лёд с двух стаков, не с трёх." },
    { id: "brittle", name: "Хрупкость", text: "Замороженный получает +20% урона." },
    { id: "longer", name: "Длинная стужа", text: "+0.8 с к замедлению." },
    { id: "shatter", name: "Осколки", text: "Смерть замороженного бьёт соседей в 1 клетке на 25% его полного здоровья стужей." },
  ],
  venom: [
    { id: "plague", name: "Чума", text: "+3 к потолку стаков яда." },
    { id: "burst", name: "Облако смерти", text: "При убийстве яд 2.2 в секунду на 2.5 с в радиусе 1.1." },
    { id: "melt", name: "Разъезд", text: "Каждый стак яда срезает 1 брони, пока яд держится." },
    { id: "sticky", name: "Липкий", text: "Отравленный медленнее на 12%." },
    { id: "cloud", name: "Брызги", text: "Половина яда плещется на 0.6 клетки." },
  ],
  arc: [
    { id: "fork", name: "Ещё звено", text: "+1 прыжок." },
    { id: "overload", name: "Перегруз", text: "+45% к первому удару." },
    { id: "silence", name: "Тишина", text: "Знахарь не лечит 3 с." },
    { id: "longarc", name: "Длинная дуга", text: "+0.5 клетки к прыжку." },
    { id: "livearc", name: "Живая дуга", text: "Прыжок сохраняет 85% урона вместо 72%." },
  ],
  beam: [
    { id: "wide", name: "Шире", text: "Ширина +0.2 и +1 цель." },
    { id: "focus", name: "Фокус", text: "Без пробития, урон ×1.75." },
    { id: "dawn", name: "Рассвет", text: "Казнь ниже 12% здоровья. У Стража порог не выше 6%." },
    { id: "burn", name: "Ожог", text: "Поджог 2 в секунду на 2 с по целям луча." },
    { id: "spear", name: "Игла света", text: "+2 цели на линии." },
  ],
  bolt: [
    { id: "pair", name: "Парный пуск", text: "Второй снаряд по другой цели на 80%." },
    { id: "breaker", name: "Лом", text: "+30% урона по латнику и щитоносцу." },
    { id: "liquid", name: "Жидкий огонь", text: "Поджог 3 в секунду на 2.5 с." },
    { id: "farther", name: "Дальше", text: "+0.4 радиуса." },
    { id: "wideblast", name: "Широкий разрыв", text: "+0.35 клетки к взрыву." },
  ],
  blaze: [
    { id: "reach", name: "Длинный язык", text: "+0.55 радиуса." },
    { id: "oil", name: "Масло", text: "Поджог длится вдвое." },
    { id: "fan", name: "Веер", text: "Бьёт всех в радиусе, не только конус." },
    { id: "inferno", name: "Пекло", text: "+20% урона." },
    { id: "embers", name: "Угли", text: "+10% урона за каждую уже горящую цель, до +40%." },
  ],
  halo: [
    { id: "pulse", name: "Пульс", text: "+30% урона." },
    { id: "sanctuary", name: "Придел", text: "Башни в радиусе Ореола получают +10% темпа." },
    { id: "eye", name: "Око", text: "Раскрытие теней и +25% урона по ним." },
    { id: "storm", name: "Гроза", text: "20% шанс оглушить на 0.35 с." },
    { id: "ward", name: "Сторож", text: "+15% урона." },
  ],
  awl: [
    { id: "rail", name: "Рельс", text: "+4 цели на линии." },
    { id: "slug", name: "Болванка", text: "Первая цель ×1.65, линия дальше не идёт." },
    { id: "bleed", name: "Кровь", text: "Сталь 2 в секунду на 2.5 с. Броня этому следу не мешает." },
    { id: "fast", name: "Частый удар", text: "+15% темпа." },
    { id: "sunder", name: "Надрез", text: "Удар срезает 2 брони на 3 с." },
  ],
  swarm: [
    { id: "extra", name: "Ещё два", text: "+2 снаряда." },
    { id: "bunch", name: "Сноп", text: "Все снаряды в одну цель, каждый на 80%." },
    { id: "bounce", name: "Рикошет", text: "Один отскок на 60% в соседа до 1.5 клетки." },
    { id: "sky", name: "По небу", text: "+25% урона по воздуху." },
    { id: "rapid", name: "Частая россыпь", text: "+20% темпа." },
  ],
  miner: [
    { id: "mdeep", name: "Глубь", text: "Добыча ×1.4." },
    { id: "mrich", name: "Богатая жила", text: "22% шанс +1 руды." },
    { id: "mspark", name: "Искра жилы", text: "8% шанс +1 искры в копилку ночи, не чаще раза в 20 с." },
    { id: "mhaste", name: "Спешка", text: "Такт добычи ×0.75." },
    { id: "mstock", name: "Запас", text: "+1 руда к каждому такту." },
  ],
};

export const ABILITY_BY_ID: Record<string, AbilityDef> = {};
for (const k of TOWER_KINDS) for (const a of ABILITIES[k]) ABILITY_BY_ID[a.id] = a;

export interface Bonuses {
  dmg: Record<TowerKind, number>;
  rate: Record<TowerKind, number>;
  range: Record<TowerKind, number>;
  xp: Record<TowerKind, number>;
  special: Record<TowerKind, number>;
  abyss: Record<TowerKind, number>;
  air: Record<TowerKind, boolean>;
  airDmg: Record<TowerKind, number>;
  unlocked: Record<TowerKind, boolean>;
  gold: number;
  startGold: number;
  spark: number;
  ashFlat: number;
  hearts: number;
  interest: number;
  discount: number;
  sell: number;
  stamps: number;
  stampPower: number;
  tileDmg: number;
  tileRange: number;
  miner: number;
  minerAbyss: number;
  knowHp: Record<EnemyKind, number>;
  knowPen: Record<EnemyKind, number>;
  detectShades: boolean;
  abFire: boolean;
  abBliz: boolean;
  abDawn: boolean;
  firePower: number;
  blizTime: number;
  dawnPower: number;
  cdSteps: number;
  radiusSteps: number;
  globalDmg: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  xp: number;
  spent: number;
  ranks: { dmg: number; rate: number; range: number };
  abilities: string[];
  offer: string[] | null;
  upgraded: string | null;
  cd: number;
  target: TargetMode;
  sparkLock: number;
  kills: number;
  dealt: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  shield: number;
  armor: number;
  shred: number;
  shredUntil: number;
  progress: number;
  route: number;
  air: boolean;
  slowUntil: number;
  slowPct: number;
  freezeUntil: number;
  frostStacks: number;
  frostLock: number;
  poisonDps: number;
  poisonUntil: number;
  poisonStacks: number;
  poisonFrom: number;
  fireDps: number;
  fireUntil: number;
  fireFrom: number;
  bleedDps: number;
  bleedUntil: number;
  bleedFrom: number;
  revealedUntil: number;
  muteUntil: number;
  markUntil: number;
  markAmp: number;
  brittleUntil: number;
  shatterArmed: boolean;
  phased2: boolean;
  phased3: boolean;
  fromSplit: boolean;
  parent: number;
  healerCd: number;
  callerCd: number;
  stunUntil: number;
  wave: number;
  alive: boolean;
}

export interface Extra {
  pen: number;
  execute: number;
  fullHp: number;
  fullLine: number;
  boss: number;
  shieldBonus: number;
  poison: number;
  poisonTime: number;
  poisonStacks: number;
  fire: number;
  fireTime: number;
  bleed: number;
  slow: number;
  slowTime: number;
  frost: boolean;
  freezeAt: number;
  reveal: number;
  mute: number;
  shred: number;
  mark: number;
  brittle: boolean;
  shatter: boolean;
  melt: boolean;
  sticky: boolean;
  goldChance: number;
  stun: number;
  ignoreArmor: boolean;
  resistMul: number;
  jumps: number;
  jumpKeep: number;
  jumpRange: number;
  bounce: boolean;
  cluster: boolean;
  full70: number;
  airMul: number;
  shadeBonus: number;
}

export interface Proj {
  id: number;
  towerId: number;
  kind: TowerKind;
  x: number;
  y: number;
  destX: number;
  destY: number;
  enemyId: number;
  dmg: number;
  dmgType: DmgType;
  splash: number;
  edge: number;
  air: boolean;
  homing: boolean;
  extra: Extra;
  ttl: number;
  color: string;
  bounced: boolean;
}

export interface Fx {
  x: number;
  y: number;
  x2: number;
  y2: number;
  text: string;
  ttl: number;
  color: string;
  kind: "num" | "boom" | "beam" | "ring";
}

export interface Run {
  mapId: string;
  endless: boolean;
  mode: ModeId;
  mutators: string[];
  banner: string;
  bannerUntil: number;
  walls: string[];
  dailyKey: string;
  seed: number;
  rng: number;
  time: number;
  gold: number;
  goldEarned: number;
  hearts: number;
  maxHearts: number;
  towers: Tower[];
  enemies: Enemy[];
  projs: Proj[];
  mods: Record<string, ModKind>;
  stamps: number;
  nextId: number;
  scheduled: number;
  nextWaveAt: number;
  queue: { kind: EnemyKind; spawn: number; at: number; wave: number }[];
  mined: number;
  pendingSparks: number;
  leaks: number;
  kills: number;
  bossKilled: boolean;
  outcome: "play" | "win" | "lose";
  wavesCleared: number;
  rewarded: boolean;
  reward: { sparks: number; ash: number; vein: number; stars: number } | null;
  fx: Fx[];
  placedCombat: boolean;
  abilityCd: Record<GlobalId, number>;
  aim: GlobalId | null;
}

export interface Meta {
  v: 2;
  sparks: number;
  ash: number;
  vein: number;
  nodes: Record<string, number>;
  stars: Record<string, number>;
  endlessBest: Record<string, number>;
  modeBest: Record<string, number>;
  dailyBest: Record<string, number>;
  damageNumbers: boolean;
  v1Bonus: boolean;
  run: Run | null;
}

export function freshMeta(): Meta {
  return {
    v: 2, sparks: 0, ash: 0, vein: 0, nodes: {}, stars: {}, endlessBest: {},
    modeBest: {}, dailyBest: {},
    damageNumbers: true, v1Bonus: false, run: null,
  };
}

export function emptyExtra(): Extra {
  return {
    pen: 0, execute: 0, fullHp: 0, fullLine: 0.8, boss: 0, shieldBonus: 0,
    poison: 0, poisonTime: 0, poisonStacks: 0, fire: 0, fireTime: 0, bleed: 0,
    slow: 0, slowTime: 0, frost: false, freezeAt: 3, reveal: 0, mute: 0, shred: 0,
    mark: 0, brittle: false, shatter: false, melt: false, sticky: false,
    goldChance: 0, stun: 0, ignoreArmor: false, resistMul: 1,
    jumps: 0, jumpKeep: 0.72, jumpRange: 1.7, bounce: false, cluster: false,
    full70: 0, airMul: 0, shadeBonus: 0,
  };
}
