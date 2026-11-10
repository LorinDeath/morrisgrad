// «Вечная стража» — чистая симуляция ночи. Без DOM.
// Карта 16×10, тропа из DESIGN. Башни, волны, руны, законы, сохранение.
//
// Отклонения от чисел DESIGN (играбельны, перечислены в отчёте):
// - Стаки инея живут 3.2 с. Замедление по-прежнему 1.4 с. Иначе одна башня
//   с темпом 1/с не набирает 3 стака, пока каждый держится 1.4 с.
// - Сумка рун: 12 + число покупок в лавке. Отдельного улучшения сумки нет,
//   а формула говорит «12 + мета».
// - Цена улучшения округляется до целого золота.
// - Числовые бонусы уровня 3 действуют сразу. Пока глиф не выбран, его эффекта
//   нет и улучшение до 4 уровня закрыто.
// - Стартовое золото ночи 100, не 50. Осколок стоит 55: с 50 золота первая
//   башня не успевает зачищать волну, и золото на вторую не копится. 100 хватает
//   на осколок и луч — ночь с ними доходит за 30-ю волну.

export const SAVE_KEY = "mg-eternal-watch-v1";
export const TILE = 16;
export const COLS = 16;
export const ROWS = 10;
export const MAP_W = COLS * TILE;
export const MAP_H = ROWS * TILE;
export const FROST_STACK_LIFE = 3.2;
export const SLOW_TIME = 1.4;
export const FREEZE_LOCK = 1.2;

export type TowerKind = "beam" | "mortar" | "frost" | "spike" | "beacon" | "chain" | "well";
export type DmgType = "phys" | "fire" | "frost" | "light" | "void";
export type EnemyKind = "walker" | "runner" | "tank" | "swarm" | "healer" | "boss";
export type TargetMode = "first" | "last" | "strongest" | "nearest";
export type GlyphId =
  | "split" | "focus" | "dawn"
  | "crater" | "volley" | "embers"
  | "blizzard" | "iceblock" | "glass"
  | "saw" | "execute" | "poison"
  | "haste" | "bounty" | "far"
  | "link" | "surge" | "mute"
  | "tribute" | "spark" | "key";
export type RuneId =
  | "ricochet" | "gateThirst" | "execute" | "greed" | "speed" | "sniper" | "swarm" | "pierce"
  | "chainSpark" | "frostTrail" | "crit" | "bossSlayer" | "firstStrike" | "lastBreath" | "fourth"
  | "silence" | "beaconEcho" | "chaos" | "eternity" | "hoard";
export type LawId =
  | "goldThirst" | "coldNight" | "doubleSparks" | "merge" | "secondRow" | "critSpark" | "swarmFlame"
  | "freeBeacon" | "worldArmor" | "quietBoss" | "transfusion" | "echoShot" | "narrow" | "generous" | "endless";
export type ComboId = "glassice" | "spotlight" | "brittle" | "shred" | "storm";
export type ShopId = "chain" | "well" | "rune2" | "rune3" | "gold" | "hearts" | "discount" | "pads" | "interest";

export interface Cell { x: number; y: number }

export interface GlyphSpec { id: GlyphId; name: string; text: string }
export interface TowerSpec {
  kind: TowerKind;
  name: string;
  cost: number;
  damage: number;
  rate: number;
  range: number;
  dmg: DmgType;
  special: string;
  glyphs: readonly GlyphSpec[];
  shop?: number;
}

export const DMG_NAME: Record<DmgType, string> = {
  phys: "физика",
  fire: "огонь",
  frost: "мороз",
  light: "свет",
  void: "пустота",
};

export const TARGET_NAME: Record<TargetMode, string> = {
  first: "первый на тропе",
  last: "последний на тропе",
  strongest: "сильнейший",
  nearest: "ближайший",
};

export const TOWERS: readonly TowerSpec[] = [
  {
    kind: "beam", name: "Луч", cost: 40, damage: 6, rate: 1.2, range: 3.2, dmg: "light",
    special: "Пробивает 3 цели в полосе шириной 0.35 клетки.",
    glyphs: [
      { id: "split", name: "Раскол", text: "Луч пробивает ещё 2 цели." },
      { id: "focus", name: "Фокус", text: "Луч не пробивает и бьёт одну цель с уроном ×2.1." },
      { id: "dawn", name: "Рассвет", text: "Казнит цель, если у неё меньше 12% здоровья." },
    ],
  },
  {
    kind: "mortar", name: "Осколок", cost: 55, damage: 14, rate: 0.55, range: 4, dmg: "fire",
    special: "Взрыв радиусом 1.1 клетки: полный урон в центре, 55% на краю.",
    glyphs: [
      { id: "crater", name: "Кратер", text: "Радиус взрыва 1.6 клетки." },
      { id: "volley", name: "Залп", text: "Три снаряда по 45% урона в случайные цели в радиусе." },
      { id: "embers", name: "Угли", text: "Подожжение: 25% урона попадания за 2 секунды. С одной башни не копится." },
    ],
  },
  {
    kind: "frost", name: "Иней", cost: 45, damage: 4, rate: 1, range: 2.8, dmg: "frost",
    special: "Замедляет на 35% на 1.4 с. Три стака инея замораживают на 0.7 с, затем пауза 1.2 с.",
    glyphs: [
      { id: "blizzard", name: "Буран", text: "Мелкий взрыв 0.7 клетки и замедление 60%." },
      { id: "iceblock", name: "Глыба", text: "Заморозка длится 1.2 с." },
      { id: "glass", name: "Стекло", text: "Смерть замороженного бьёт врагов в 1 клетке на 20% его максимального здоровья." },
    ],
  },
  {
    kind: "spike", name: "Шип", cost: 50, damage: 16, rate: 1.4, range: 1.35, dmg: "phys",
    special: "Ближний бой по тропе. Казнит цель, если у неё меньше 15% здоровья.",
    glyphs: [
      { id: "saw", name: "Пила", text: "Удар задевает всех врагов в радиусе." },
      { id: "execute", name: "Казнь", text: "Порог казни поднимается до 25%." },
      { id: "poison", name: "Яд", text: "Яд: 20% урона попадания за 2.5 с. С одной башни не копится." },
    ],
  },
  {
    kind: "beacon", name: "Маяк", cost: 70, damage: 0, rate: 0, range: 1.5, dmg: "light",
    special: "Не стреляет. Союзным башням в радиусе 1.5: +18% темпа и +0.4 радиуса. Другие маяки не усиливает. Несколько маяков не складываются — берётся лучший.",
    glyphs: [
      { id: "haste", name: "Ускорение", text: "+32% темпа союзникам вместо 18%." },
      { id: "bounty", name: "Золото", text: "Убийства в радиусе ауры дают +20% золота." },
      { id: "far", name: "Дальность", text: "+0.9 радиуса союзникам вместо +0.4." },
    ],
  },
  {
    kind: "chain", name: "Цепь", cost: 90, damage: 9, rate: 0.85, range: 3, dmg: "void", shop: 40,
    special: "Прыгает ещё на 2 цели в пределах 1.8 клетки. Каждый следующий удар — 70% предыдущего.",
    glyphs: [
      { id: "link", name: "Звено", text: "Ещё один прыжок." },
      { id: "surge", name: "Разряд", text: "Первый удар сильнее на 50%." },
      { id: "mute", name: "Глушение", text: "Попадание по лекарю запрещает ему лечить 3 секунды." },
    ],
  },
  {
    kind: "well", name: "Колодец", cost: 80, damage: 3, rate: 0.7, range: 2.2, dmg: "light", shop: 55,
    special: "Убийства врагов, которые умерли в радиусе, дают +35% золота. Считается от базовой награды и складывается с маяком и законами.",
    glyphs: [
      { id: "tribute", name: "Дань", text: "+60% золота вместо 35%." },
      { id: "spark", name: "Искра", text: "8% шанс получить 1 искру с убийства в радиусе. Не чаще одной искры в 4 секунды со всех колодцев." },
      { id: "key", name: "Ключ", text: "Колодец казнит цель, если у неё меньше 10% здоровья." },
    ],
  },
];

const TOWER_BY = new Map(TOWERS.map((t) => [t.kind, t]));
export const towerSpec = (k: TowerKind): TowerSpec => {
  const s = TOWER_BY.get(k);
  if (!s) throw new Error("tower " + k);
  return s;
};

export interface RuneSpec { id: RuneId; name: string; text: string }
export const RUNES: readonly RuneSpec[] = [
  { id: "ricochet", name: "Рикошет", text: "Снаряд осколка, цепи или инея один раз отскакивает в цель в радиусе 1.6 клетки и бьёт на 70%." },
  { id: "gateThirst", name: "Жажда врат", text: "2% нанесённого урона лечит Врата. Не больше 1 сердца раз в 8 секунд." },
  { id: "execute", name: "Казнь", text: "Порог казни этой башни выше на 10 процентных пунктов. Если казни не было — появляется порог 10%." },
  { id: "greed", name: "Жадность", text: "+25% золота с убийств этой башни." },
  { id: "speed", name: "Скорость", text: "+25% темпа и −10% урона." },
  { id: "sniper", name: "Снайпер", text: "+0.8 радиуса. Когда руна встаёт в слот, прицел переключается на сильнейшего." },
  { id: "swarm", name: "Рой", text: "Каждый выстрел выпускает слабый снаряд на 30% урона во вторую ближайшую цель, если она есть." },
  { id: "pierce", name: "Бронебой", text: "Игнорирует 40% брони цели." },
  { id: "chainSpark", name: "Цепная искра", text: "20% шанс прыгнуть в соседнюю цель на 60% урона." },
  { id: "frostTrail", name: "Инейный след", text: "Попадания замедляют на 12% на 0.8 секунды." },
  { id: "crit", name: "Критический", text: "20% шанс ударить вдвое сильнее." },
  { id: "bossSlayer", name: "Палач боссов", text: "+40% урона по боссам." },
  { id: "firstStrike", name: "Первый удар", text: "+80% урона по целям с полным здоровьем." },
  { id: "lastBreath", name: "Последний вздох", text: "При убийстве взрыв на 25% максимального здоровья жертвы в радиусе 0.9." },
  { id: "fourth", name: "Залп четвёртый", text: "Каждый четвёртый выстрел двойной." },
  { id: "silence", name: "Тишина", text: "Попадание по лекарю глушит лечение на 2.5 секунды." },
  { id: "beaconEcho", name: "Эхо маяка", text: "15% урона этой башни плоским бонусом к ближайшей союзной башне." },
  { id: "chaos", name: "Хаос", text: "Каждый выстрел наносит случайный тип урона из пяти." },
  { id: "eternity", name: "Вечность", text: "8% шанс выстрелить ещё раз сразу." },
  { id: "hoard", name: "Клад", text: "3% шанс удвоить золото с убийства." },
];
const RUNE_BY = new Map(RUNES.map((r) => [r.id, r]));
export const runeSpec = (id: RuneId): RuneSpec => {
  const r = RUNE_BY.get(id);
  if (!r) throw new Error("rune " + id);
  return r;
};

export interface LawSpec { id: LawId; name: string; text: string }
export const LAWS: readonly LawSpec[] = [
  { id: "goldThirst", name: "Жажда золота", text: "Золота на 50% больше. У врагов на 20% больше здоровья." },
  { id: "coldNight", name: "Холодная ночь", text: "Все замедления сильнее на 30%." },
  { id: "doubleSparks", name: "Двойные искры", text: "Искры за волны и боссов на 80% больше. Стартового золота на 20 меньше, но не ниже 20." },
  { id: "merge", name: "Слияние", text: "Один раз за ночь две башни одного типа 5 уровня и выше сливаются в пробуждённую: +35% урона и второй глиф." },
  { id: "secondRow", name: "Второй ряд", text: "Четыре дополнительные площадки рядом с тропой и уже открытыми площадками." },
  { id: "critSpark", name: "Критическая искра", text: "Критический удар с шансом 10% даёт 1 искру. Не чаще раза в 6 секунд." },
  { id: "swarmFlame", name: "Рой и пламя", text: "У особей роя на 30% меньше здоровья, у танков на 30% больше." },
  { id: "freeBeacon", name: "Вечный маяк", text: "Первый маяк за ночь ничего не стоит." },
  { id: "worldArmor", name: "Броня мира", text: "У врагов +6 брони. Пороги казни всех башен выше на 10 процентных пунктов." },
  { id: "quietBoss", name: "Тихие боссы", text: "Босс не зовёт подмогу, но у него на 50% больше здоровья." },
  { id: "transfusion", name: "Переливание", text: "Если ночь кончилась поражением, 10% непотраченного золота переходит в следующую ночь. На Рассвете золото обменивается на искры." },
  { id: "echoShot", name: "Эхо выстрела", text: "У каждой башни 10% шанс выстрелить дважды." },
  { id: "narrow", name: "Узкая тропа", text: "Враги медленнее на 12%." },
  { id: "generous", name: "Щедрый портал", text: "Стартового золота на 25 больше." },
  { id: "endless", name: "Ночь без конца", text: "Рассвет нельзя встретить раньше 50-й волны. Искры этой ночи, включая обмен золота, умножаются на 3." },
];
const LAW_BY = new Map(LAWS.map((l) => [l.id, l]));
export const lawSpec = (id: LawId): LawSpec => {
  const l = LAW_BY.get(id);
  if (!l) throw new Error("law " + id);
  return l;
};

export const COMBO_TEXT: Record<ComboId, string> = {
  glassice: "Стеклолёд: взрыв осколка дополнительно бьёт на 8% недостающего здоровья.",
  spotlight: "Прожектор: у этого луча радиус больше на 0.6, полоса шире (0.5).",
  brittle: "Хрупкость: порог казни этого шипа выше на 8 процентных пунктов.",
  shred: "Осколки брони: попадания этого осколка режут броню цели на 4 на 3 секунды.",
  storm: "Гроза: у этой цепи на один прыжок больше.",
};

export interface ShopSpec { id: ShopId; name: string; cost: number; max: number; text: string }
export const SHOP: readonly ShopSpec[] = [
  { id: "chain", name: "Цепь", cost: 40, max: 1, text: "Открывает башню «Цепь»: пустота, прыжки по целям." },
  { id: "well", name: "Колодец", cost: 55, max: 1, text: "Открывает башню «Колодец»: убийства в радиусе дают больше золота." },
  { id: "rune2", name: "Второй слот руны", cost: 30, max: 1, text: "В каждую башню можно вставить вторую руну." },
  { id: "rune3", name: "Третий слот руны", cost: 80, max: 1, text: "В каждую башню можно вставить третью руну. Сначала нужен второй слот." },
  { id: "gold", name: "Стартовое золото +25", cost: 20, max: 4, text: "Каждая покупка даёт +25 золота в начале ночи. Можно купить 4 раза." },
  { id: "hearts", name: "Сердца Врат +5", cost: 25, max: 3, text: "Врата держат на 5 сердец больше. Можно купить 3 раза. В текущей ночи сердца прибавляются сразу." },
  { id: "discount", name: "Скидка на первую башню", cost: 15, max: 1, text: "Первая башня каждой ночи стоит на 50% дешевле." },
  { id: "pads", name: "Две площадки", cost: 35, max: 1, text: "Две дополнительные площадки рядом с тропой. Один раз." },
  { id: "interest", name: "Интерес", cost: 45, max: 1, text: "В конце волны нетраченное золото повышает награду следующей: +1% за каждые 10 золота, не больше +15%." },
];

export const SPEED: Record<EnemyKind, number> = {
  walker: 1.15, runner: 1.9, tank: 0.7, swarm: 1.4, healer: 1, boss: 0.85,
};
export const LEAK: Record<EnemyKind, number> = {
  walker: 1, runner: 1, tank: 2, swarm: 1, healer: 1, boss: 5,
};
export const ENEMY_NAME: Record<EnemyKind, string> = {
  walker: "пехота", runner: "бегун", tank: "танк", swarm: "рой", healer: "лекарь", boss: "босс",
};

export const SPRITE_NAMES = [
  "tile_ground", "tile_path", "tile_pad", "tile_spawn", "tile_gate", "tile_wall",
  "tower_beam", "tower_beam2", "tower_mortar", "tower_mortar2", "tower_frost", "tower_frost2",
  "tower_spike", "tower_spike2", "tower_beacon", "tower_beacon2", "tower_chain", "tower_chain2",
  "tower_well", "tower_well2",
  "enemy_walker_1", "enemy_walker_2", "enemy_runner_1", "enemy_runner_2",
  "enemy_tank_1", "enemy_tank_2", "enemy_swarm", "enemy_healer_1", "enemy_healer_2",
  "enemy_boss_1", "enemy_boss_2",
  "proj_mortar", "proj_frost", "proj_chain", "proj_spike", "fx_hit", "fx_explode",
  "ui_gold", "ui_spark", "ui_heart", "ui_rune", "ui_button",
] as const;

const WAYPOINTS: readonly Cell[] = [
  { x: 15, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 7 }, { x: 4, y: 7 }, { x: 4, y: 2 }, { x: 1, y: 2 },
];

function trace(wps: readonly Cell[]): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i]!;
    const b = wps[i + 1]!;
    let x = a.x;
    let y = a.y;
    if (i === 0) cells.push({ x, y });
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    while (x !== b.x || y !== b.y) {
      x += dx;
      y += dy;
      cells.push({ x, y });
    }
  }
  return cells;
}

export const PATH: readonly Cell[] = trace(WAYPOINTS);
export const PATH_LEN = PATH.length - 1;
export const GATE: Cell = { x: 1, y: 2 };
export const SPAWN: Cell = { x: 15, y: 2 };

const ck = (x: number, y: number) => x + "," + y;
const PATH_SET = new Set(PATH.map((c) => ck(c.x, c.y)));

function orthoPads(blocked: Set<string>): Cell[] {
  const out: Cell[] = [];
  const seen = new Set<string>();
  for (const p of PATH) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const k = ck(x, y);
      if (blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ x, y });
    }
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

export const PADS: readonly Cell[] = orthoPads(PATH_SET);

function extraPads(n: number, taken: Set<string>): Cell[] {
  const blocked = new Set(taken);
  const near = new Set(taken);
  const out: Cell[] = [];
  for (let y = 0; y < ROWS && out.length < n; y++) {
    for (let x = 0; x < COLS && out.length < n; x++) {
      const k = ck(x, y);
      if (blocked.has(k)) continue;
      let touch = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (near.has(ck(x + dx, y + dy))) touch = true;
      }
      if (!touch) continue;
      out.push({ x, y });
      blocked.add(k);
      near.add(k);
    }
  }
  return out;
}

const PAD_SET = new Set(PADS.map((c) => ck(c.x, c.y)));
export const META_PADS: readonly Cell[] = extraPads(2, new Set([...PATH_SET, ...PAD_SET]));
export const LAW_PADS: readonly Cell[] = extraPads(4, new Set([...PATH_SET, ...PAD_SET, ...META_PADS.map((c) => ck(c.x, c.y))]));

export function padsFor(extra: boolean, laws: readonly LawId[]): Cell[] {
  const list = PADS.slice();
  if (extra) list.push(...META_PADS);
  if (laws.includes("secondRow")) list.push(...LAW_PADS);
  return list;
}

export function isPath(x: number, y: number): boolean {
  return PATH_SET.has(ck(x, y));
}

export interface Pose { x: number; y: number; face: 1 | -1 }

export function pathPose(progress: number): Pose {
  const p = Math.max(0, Math.min(PATH_LEN, progress));
  const i = Math.min(PATH.length - 2, Math.floor(p));
  const t = p - i;
  const a = PATH[i]!;
  const b = PATH[Math.min(PATH.length - 1, i + 1)]!;
  const face: 1 | -1 = b.x < a.x ? -1 : b.x > a.x ? 1 : faceOfSegment(i);
  return { x: a.x + 0.5 + (b.x - a.x) * t, y: a.y + 0.5 + (b.y - a.y) * t, face };
}

function faceOfSegment(i: number): 1 | -1 {
  for (let k = i; k >= 0; k--) {
    const a = PATH[k]!;
    const b = PATH[k + 1];
    if (!b) break;
    if (b.x < a.x) return -1;
    if (b.x > a.x) return 1;
  }
  return -1;
}

export function progressAtCell(x: number, y: number): number {
  const i = PATH.findIndex((c) => c.x === x && c.y === y);
  return i < 0 ? 0 : i;
}

export interface WaveGroup { kind: EnemyKind; count: number }

export function wavePlan(n: number): WaveGroup[] {
  const plan: WaveGroup[] = [{ kind: "walker", count: 8 + Math.floor(n * 0.6) }];
  if (n >= 3) plan.push({ kind: "runner", count: 2 + Math.floor(n / 5) });
  if (n >= 5) plan.push({ kind: "tank", count: 1 + Math.floor((n - 5) / 6) });
  if (n >= 8) plan.push({ kind: "swarm", count: (1 + Math.floor((n - 8) / 8)) * 4 });
  if (n >= 15) plan.push({ kind: "healer", count: 1 + Math.floor((n - 15) / 12) });
  if (n % 10 === 0) plan.push({ kind: "boss", count: 1 });
  return plan;
}

export function spawnInterval(n: number): number {
  return 0.55 * Math.pow(0.98, Math.min(n - 1, 40));
}

export function enemyMaxHp(kind: EnemyKind, wave: number, laws: readonly LawId[]): number {
  const g = Math.pow(1.13, wave - 1);
  let hp = kind === "walker" ? 20 * g
    : kind === "runner" ? 12 * g
    : kind === "tank" ? 55 * g
    : kind === "swarm" ? 7 * g
    : kind === "healer" ? 18 * g
    : 400 * Math.pow(1.18, wave / 10);
  if (laws.includes("goldThirst")) hp *= 1.2;
  if (laws.includes("swarmFlame")) {
    if (kind === "swarm") hp *= 0.7;
    if (kind === "tank") hp *= 1.3;
  }
  if (kind === "boss" && laws.includes("quietBoss")) hp *= 1.5;
  return hp;
}

export function enemyArmor(kind: EnemyKind, wave: number, laws: readonly LawId[]): number {
  let a = kind === "tank" ? 8 : kind === "boss" ? 12 : 0;
  if (wave >= 120) a += 10;
  if (laws.includes("worldArmor")) a += 6;
  return a;
}

export function killGoldBase(maxHp: number): number {
  return 1 + Math.floor(maxHp / 25);
}
export function waveClearGold(wave: number): number {
  return 5 + wave;
}
export function sparkMilestone(wave: number): number {
  return wave % 5 === 0 ? 1 + Math.floor(wave / 10) : 0;
}
export function sparkBoss(wave: number): number {
  return wave % 10 === 0 ? 3 + Math.floor(wave / 10) : 0;
}
export function sparkFactor(laws: readonly LawId[]): number {
  let f = 1;
  if (laws.includes("doubleSparks")) f *= 1.8;
  if (laws.includes("endless")) f *= 3;
  return f;
}
export function dawnConversion(gold: number, wave: number, laws: readonly LawId[]): number {
  const base = Math.floor(gold / 25) + Math.floor(wave * 0.4);
  return Math.max(0, Math.round(base * sparkFactor(laws)));
}
export function dawnMin(laws: readonly LawId[]): number {
  return laws.includes("endless") ? 50 : 30;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1000) return sign + String(Math.round(v));
  if (v < 1e6) {
    const s = (v / 1e3).toFixed(1);
    return sign + (s.endsWith(".0") ? s.slice(0, -2) : s) + "K";
  }
  if (v < 1e9) {
    const s = (v / 1e6).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return sign + s + "M";
  }
  if (v < 1e12) return sign + (v / 1e9).toFixed(2) + "B";
  if (v < 1e15) return sign + (v / 1e12).toFixed(2) + "T";
  const exp = Math.floor(Math.log10(v) + 1e-9);
  const mant = v / 10 ** exp;
  return sign + mant.toFixed(2) + "e" + exp;
}

export function fmtStat(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 100) / 100;
  return String(r);
}

export interface Dot { towerId: number; perSec: number; until: number }
export interface Enemy {
  id: number;
  kind: EnemyKind;
  wave: number;
  hp: number;
  maxHp: number;
  armor: number;
  progress: number;
  alive: boolean;
  slowUntil: number;
  slowPct: number;
  trailUntil: number;
  trailPct: number;
  freezeUntil: number;
  stackLockUntil: number;
  frostStacks: number[];
  burns: Dot[];
  poisons: Dot[];
  shred: number;
  shredUntil: number;
  silenceUntil: number;
  healCd: number;
  bossPhase: number;
  fromSplit: boolean;
  lastHit: number;
}
export interface Tower {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  level: number;
  glyphs: GlyphId[];
  awakened: boolean;
  runes: RuneId[];
  target: TargetMode;
  spent: number;
  cooldown: number;
  shots: number;
}
export interface Proj {
  id: number;
  towerId: number;
  kind: "mortar" | "frost" | "chain" | "bolt" | "spike";
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  targetId: number;
  speed: number;
  damage: number;
  dmg: DmgType;
  splash: number;
  homing: boolean;
  jumps: number;
  hit: number[];
  ricochet: boolean;
  payload: boolean;
  burn: boolean;
  poison: boolean;
  silence: number;
  shred: boolean;
  frost: boolean;
  slow: number;
  freeze: number;
  allowSpark: boolean;
  breath: boolean;
}
export interface Fx {
  id: number;
  kind: "hit" | "explode" | "beam";
  x: number;
  y: number;
  x2: number;
  y2: number;
  until: number;
  scale: number;
}
export interface Run {
  night: number;
  wave: number;
  cleared: number;
  phase: "gap" | "fight";
  gap: number;
  queue: EnemyKind[];
  spawnCd: number;
  gold: number;
  hearts: number;
  maxHearts: number;
  sparksNight: number;
  interest: number;
  time: number;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Proj[];
  fx: Fx[];
  nextId: number;
  bag: RuneId[];
  slots: number;
  laws: LawId[];
  rerollUsed: boolean;
  merged: boolean;
  beaconFree: boolean;
  discountArmed: boolean;
  discountUsed: boolean;
  wellSparkCd: number;
  critSparkCd: number;
  gateHealCd: number;
  gatePool: number;
  speed: 0 | 1 | 2;
  defeated: boolean;
  dawnReady: boolean;
  rng: number;
}
export interface Meta {
  v: 1;
  sparks: number;
  laws: LawId[];
  chain: boolean;
  well: boolean;
  runeSlots: number;
  startGoldRanks: number;
  heartRanks: number;
  discount: boolean;
  extraPads: boolean;
  interest: boolean;
  purchases: number;
  night: number;
  bestWave: number;
  carryGold: number;
  bag: RuneId[];
  dawnUnlocked: boolean;
  lawOffer: LawId[] | null;
  run: Run | null;
}

export function freshMeta(): Meta {
  return {
    v: 1, sparks: 0, laws: [], chain: false, well: false, runeSlots: 1,
    startGoldRanks: 0, heartRanks: 0, discount: false, extraPads: false, interest: false,
    purchases: 0, night: 1, bestWave: 0, carryGold: 0, bag: [], dawnUnlocked: false, lawOffer: null, run: null,
  };
}

export function startingGold(meta: Meta): number {
  let g = 100 + meta.startGoldRanks * 25 + meta.carryGold;
  if (meta.laws.includes("generous")) g += 25;
  if (meta.laws.includes("doubleSparks")) g -= 20;
  return Math.max(20, g);
}

export function maxHearts(meta: Meta): number {
  return 20 + meta.heartRanks * 5;
}
export function bagMax(meta: Meta): number {
  return 12 + meta.purchases;
}

export function beginNight(meta: Meta, seed?: number): Run {
  const hearts = maxHearts(meta);
  const run: Run = {
    night: meta.night,
    wave: 1,
    cleared: 0,
    phase: "gap",
    gap: 2.6,
    queue: [],
    spawnCd: 0,
    gold: startingGold(meta),
    hearts,
    maxHearts: hearts,
    sparksNight: 0,
    interest: 0,
    time: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    fx: [],
    nextId: 1,
    bag: meta.bag,
    slots: meta.runeSlots,
    laws: meta.laws.slice(),
    rerollUsed: false,
    merged: false,
    beaconFree: meta.laws.includes("freeBeacon"),
    discountArmed: meta.discount,
    discountUsed: false,
    wellSparkCd: 0,
    critSparkCd: 0,
    gateHealCd: 0,
    gatePool: 0,
    speed: 1,
    defeated: false,
    dawnReady: false,
    rng: (seed ?? 1) >>> 0,
  };
  meta.carryGold = 0;
  meta.bag = run.bag;
  meta.run = run;
  meta.lawOffer = null;
  return run;
}

function rand(run: Run): number {
  let a = run.rng >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  run.rng = (t ^ (t >>> 14)) >>> 0;
  return run.rng / 4294967296;
}

function nid(run: Run): number {
  return run.nextId++;
}

export function spawnEnemy(run: Run, kind: EnemyKind, progress: number, fromSplit = false): Enemy {
  const wave = run.wave;
  const maxHp = enemyMaxHp(kind, wave, run.laws);
  const e: Enemy = {
    id: nid(run), kind, wave, hp: maxHp, maxHp,
    armor: enemyArmor(kind, wave, run.laws),
    progress, alive: true,
    slowUntil: 0, slowPct: 0, trailUntil: 0, trailPct: 0,
    freezeUntil: 0, stackLockUntil: 0, frostStacks: [],
    burns: [], poisons: [], shred: 0, shredUntil: 0, silenceUntil: 0,
    healCd: 2.4, bossPhase: 0, fromSplit, lastHit: 0,
  };
  run.enemies.push(e);
  return e;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}
function center(t: { x: number; y: number }): { x: number; y: number } {
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

export function resonanceOf(towers: readonly Tower[], id: number): { size: number; bonus: number } {
  const self = towers.find((t) => t.id === id);
  if (!self) return { size: 0, bonus: 0 };
  const seen = new Set<number>([self.id]);
  const q = [self];
  while (q.length) {
    const cur = q.pop()!;
    for (const o of towers) {
      if (seen.has(o.id) || o.kind !== self.kind) continue;
      if (Math.abs(o.x - cur.x) + Math.abs(o.y - cur.y) === 1) {
        seen.add(o.id);
        q.push(o);
      }
    }
  }
  const others = Math.min(5, seen.size - 1);
  return { size: seen.size, bonus: others * 0.08 };
}

export function combosOf(towers: readonly Tower[], id: number): ComboId[] {
  const self = towers.find((t) => t.id === id);
  if (!self) return [];
  const near = new Set<TowerKind>();
  for (const o of towers) {
    if (o.id === self.id) continue;
    if (Math.abs(o.x - self.x) + Math.abs(o.y - self.y) === 1) near.add(o.kind);
  }
  const out: ComboId[] = [];
  if (self.kind === "mortar" && near.has("frost")) out.push("glassice");
  if (self.kind === "beam" && near.has("beacon")) out.push("spotlight");
  if (self.kind === "spike" && near.has("frost")) out.push("brittle");
  if (self.kind === "mortar" && near.has("spike")) out.push("shred");
  if (self.kind === "chain" && near.has("beacon")) out.push("storm");
  return out;
}

export interface Aura { rate: number; range: number; gold: boolean; src: number }

export function auraFor(towers: readonly Tower[], target: Tower): Aura | null {
  if (target.kind === "beacon") return null;
  const c = center(target);
  let best: Aura | null = null;
  let gold = false;
  for (const b of towers) {
    if (b.kind !== "beacon") continue;
    const bc = center(b);
    if (dist(bc.x, bc.y, c.x, c.y) > 1.5 + 1e-6) continue;
    const rate = b.glyphs.includes("haste") ? 0.32 : 0.18;
    const range = b.glyphs.includes("far") ? 0.9 : 0.4;
    if (b.glyphs.includes("bounty")) gold = true;
    if (!best || rate > best.rate + 1e-9 || (Math.abs(rate - best.rate) < 1e-9 && range > best.range)) {
      best = { rate, range, gold: false, src: b.id };
    }
  }
  if (best) best.gold = gold;
  return best;
}

function runeN(t: Tower, id: RuneId): number {
  let n = 0;
  for (const r of t.runes) if (r === id) n++;
  return n;
}

function preDamage(run: Run, tower: Tower): number {
  const spec = towerSpec(tower.kind);
  let d = spec.damage * (1 + 0.18 * (tower.level - 1));
  d *= 1 + resonanceOf(run.towers, tower.id).bonus;
  if (tower.awakened) d *= 1.35;
  const spd = runeN(tower, "speed");
  if (spd) d *= Math.pow(0.9, spd);
  return d;
}

function echoFlat(run: Run, tower: Tower): number {
  let add = 0;
  for (const src of run.towers) {
    if (src.id === tower.id || runeN(src, "beaconEcho") === 0) continue;
    const nearest = nearestTower(run, src.id);
    if (nearest && nearest.id === tower.id) add += 0.15 * preDamage(run, src) * runeN(src, "beaconEcho");
  }
  return add;
}

function nearestTower(run: Run, fromId: number): Tower | null {
  const src = run.towers.find((t) => t.id === fromId);
  if (!src) return null;
  const c = center(src);
  let best: Tower | null = null;
  let bd = 1e9;
  for (const o of run.towers) {
    if (o.id === src.id) continue;
    const oc = center(o);
    const d = dist(c.x, c.y, oc.x, oc.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

export function shotDamage(run: Run, tower: Tower): number {
  return preDamage(run, tower) + echoFlat(run, tower);
}
export function shotRate(run: Run, tower: Tower): number {
  const spec = towerSpec(tower.kind);
  if (spec.rate <= 0) return 0;
  let r = spec.rate * (1 + 0.04 * (tower.level - 1));
  const aura = auraFor(run.towers, tower);
  if (aura) r *= 1 + aura.rate;
  const spd = runeN(tower, "speed");
  if (spd) r *= Math.pow(1.25, spd);
  return r;
}
export function shotRange(run: Run, tower: Tower): number {
  const spec = towerSpec(tower.kind);
  let r = spec.range;
  if (tower.kind !== "beacon") {
    const aura = auraFor(run.towers, tower);
    if (aura) r += aura.range;
  }
  if (tower.kind === "beam" && combosOf(run.towers, tower.id).includes("spotlight")) r += 0.6;
  r += 0.8 * runeN(tower, "sniper");
  return r;
}

export function executeThreshold(run: Run, tower: Tower): number {
  let t = 0;
  if (tower.kind === "spike") t = tower.glyphs.includes("execute") ? 0.25 : 0.15;
  if (tower.kind === "beam" && tower.glyphs.includes("dawn")) t = Math.max(t, 0.12);
  if (tower.kind === "well" && tower.glyphs.includes("key")) t = Math.max(t, 0.1);
  const er = runeN(tower, "execute");
  if (er) t = (t <= 0 ? 0.1 : t) + 0.1 * er;
  if (tower.kind === "spike" && combosOf(run.towers, tower.id).includes("brittle")) t += 0.08;
  if (run.laws.includes("worldArmor")) t += 0.1;
  if (run.wave >= 120) t += 0.08;
  return t;
}

function resistOf(kind: EnemyKind, type: DmgType, splash: boolean, beam: boolean): number {
  if (kind === "runner" && type === "frost") return 0.8;
  if (kind === "tank" && type === "phys") return 0.65;
  if (kind === "healer" && type === "light") return 0.7;
  if (kind === "boss") return 0.8;
  if (kind === "swarm") {
    let m = 1;
    if (type === "fire") m *= 1.3;
    if (splash) m *= 1.3;
    if (beam) m *= 0.8;
    return m;
  }
  return 1;
}

function bossAura(run: Run, e: Enemy): number {
  if (run.wave < 80 || e.kind === "boss") return 0;
  const p = pathPose(e.progress);
  for (const b of run.enemies) {
    if (!b.alive || b.kind !== "boss") continue;
    const bp = pathPose(b.progress);
    if (dist(p.x, p.y, bp.x, bp.y) <= 2) return 4;
  }
  return 0;
}

function moveSpeed(run: Run, e: Enemy): number {
  if (e.freezeUntil > run.time) return 0;
  let spd = SPEED[e.kind];
  if (run.laws.includes("narrow")) spd *= 0.88;
  let mult = 1;
  if (e.slowUntil > run.time) mult *= 1 - e.slowPct;
  if (e.trailUntil > run.time) mult *= 1 - e.trailPct;
  if (mult < 0.2) mult = 0.2;
  return spd * mult;
}

function giveSparks(run: Run, meta: Meta, n: number): void {
  if (n <= 0) return;
  meta.sparks += n;
  run.sparksNight += n;
}

function census(run: Run): Map<RuneId, number> {
  const m = new Map<RuneId, number>();
  const add = (id: RuneId) => m.set(id, (m.get(id) ?? 0) + 1);
  for (const id of run.bag) add(id);
  for (const t of run.towers) for (const id of t.runes) add(id);
  return m;
}

function rollRune(run: Run): RuneId | null {
  const c = census(run);
  const pool = RUNES.map((r) => r.id).filter((id) => (c.get(id) ?? 0) < 3);
  if (!pool.length) return null;
  return pool[Math.floor(rand(run) * pool.length)] ?? null;
}

function maybeDrop(run: Run, meta: Meta, kind: EnemyKind): void {
  if (run.bag.length >= bagMax(meta)) return;
  const p = kind === "boss" ? 1 : kind === "healer" ? 0.18 : 0.06;
  if (rand(run) > p) return;
  const id = rollRune(run);
  if (id) run.bag.push(id);
}

function poseE(e: Enemy): Pose {
  return pathPose(e.progress);
}

function inRange(run: Run, tower: Tower): Enemy[] {
  const range = shotRange(run, tower);
  const c = center(tower);
  const out: Enemy[] = [];
  for (const e of run.enemies) {
    if (!e.alive) continue;
    const p = poseE(e);
    if (dist(c.x, c.y, p.x, p.y) <= range + 1e-6) out.push(e);
  }
  return out;
}

function pickTarget(tower: Tower, list: Enemy[], from: { x: number; y: number }): Enemy | null {
  if (!list.length) return null;
  if (tower.target === "first") {
    let b = list[0]!;
    for (const e of list) if (e.progress > b.progress) b = e;
    return b;
  }
  if (tower.target === "last") {
    let b = list[0]!;
    for (const e of list) if (e.progress < b.progress) b = e;
    return b;
  }
  if (tower.target === "strongest") {
    let b = list[0]!;
    for (const e of list) if (e.hp > b.hp) b = e;
    return b;
  }
  let b = list[0]!;
  let bd = 1e9;
  for (const e of list) {
    const p = poseE(e);
    const d = dist(from.x, from.y, p.x, p.y);
    if (d < bd) {
      bd = d;
      b = e;
    }
  }
  return b;
}

function secondNearest(list: Enemy[], primary: Enemy, from: { x: number; y: number }): Enemy | null {
  let best: Enemy | null = null;
  let bd = 1e9;
  for (const e of list) {
    if (e.id === primary.id || !e.alive) continue;
    const p = poseE(e);
    const d = dist(from.x, from.y, p.x, p.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export function beamTargets(run: Run, tower: Tower, primary: Enemy): Enemy[] {
  const focus = tower.glyphs.includes("focus");
  if (focus) return [primary];
  const width = combosOf(run.towers, tower.id).includes("spotlight") ? 0.5 : 0.35;
  const pierce = 3 + (tower.glyphs.includes("split") ? 2 : 0);
  const o = center(tower);
  const range = shotRange(run, tower);
  const aim = poseE(primary);
  const dx = aim.x - o.x;
  const dy = aim.y - o.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hits: { e: Enemy; along: number }[] = [];
  for (const e of run.enemies) {
    if (!e.alive) continue;
    const q = poseE(e);
    const vx = q.x - o.x;
    const vy = q.y - o.y;
    const along = vx * ux + vy * uy;
    if (along < -1e-6) continue;
    if (Math.hypot(vx, vy) > range + 1e-6) continue;
    const perp = Math.abs(vx * uy - vy * ux);
    if (perp > width / 2 + 1e-6) continue;
    hits.push({ e, along });
  }
  hits.sort((a, b) => a.along - b.along);
  return hits.slice(0, pierce).map((h) => h.e);
}

function pushFx(run: Run, fx: Omit<Fx, "id">): void {
  run.fx.push({ ...fx, id: nid(run) });
  if (run.fx.length > 64) run.fx.splice(0, run.fx.length - 64);
}

function healGates(run: Run, amount: number): void {
  if (amount <= 0) return;
  run.gatePool += amount;
  if (run.gatePool >= 1 && run.gateHealCd <= 0 && run.hearts < run.maxHearts) {
    run.hearts += 1;
    run.gatePool -= 1;
    run.gateHealCd = 8;
  }
}

interface HitFlags {
  splash: boolean;
  beam: boolean;
  frost: boolean;
  slow: number;
  freeze: number;
  burn: boolean;
  poison: boolean;
  silence: number;
  shred: boolean;
  allowSpark: boolean;
  breath: boolean;
  execute: boolean;
}

function applyHit(run: Run, meta: Meta, enemy: Enemy, tower: Tower, raw: number, type: DmgType, flags: HitFlags): void {
  if (!enemy.alive || raw <= 0) return;
  let dmg = raw;
  const full = enemy.hp >= enemy.maxHp - 0.01;
  if (full) dmg *= 1 + 0.8 * runeN(tower, "firstStrike");
  if (enemy.kind === "boss") dmg *= 1 + 0.4 * runeN(tower, "bossSlayer");
  let crit = false;
  const cc = runeN(tower, "crit");
  if (cc && rand(run) < Math.min(0.8, 0.2 * cc)) {
    dmg *= 2;
    crit = true;
  }
  let dtype = type;
  if (runeN(tower, "chaos")) {
    const types: DmgType[] = ["phys", "fire", "frost", "light", "void"];
    dtype = types[Math.floor(rand(run) * types.length)] ?? type;
  }
  const thresh = flags.execute ? executeThreshold(run, tower) : 0;
  const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  const executed = thresh > 0 && ratio < thresh - 1e-9;
  dmg = raw;
  if (full) dmg *= 1 + 0.8 * runeN(tower, "firstStrike");
  if (enemy.kind === "boss") dmg *= 1 + 0.4 * runeN(tower, "bossSlayer");
  if (crit) dmg *= 2;
  const before = enemy.hp;
  if (executed) {
    enemy.hp = 0;
  } else {
    dmg *= resistOf(enemy.kind, dtype, flags.splash, flags.beam);
    let armor = enemy.armor + bossAura(run, enemy);
    if (enemy.shredUntil > run.time) armor -= enemy.shred;
    let pierce = 1;
    const pn = runeN(tower, "pierce");
    if (pn) pierce *= Math.pow(0.6, pn);
    armor = Math.max(0, armor * pierce);
    dmg = Math.max(1, dmg - armor);
    enemy.hp -= dmg;
  }
  const removed = before - Math.max(0, enemy.hp);
  enemy.lastHit = tower.id;
  if (runeN(tower, "gateThirst")) healGates(run, removed * 0.02);
  if (crit && run.laws.includes("critSpark") && run.critSparkCd <= 0 && rand(run) < 0.1) {
    giveSparks(run, meta, 1);
    run.critSparkCd = 6;
  }
  if (flags.frost && enemy.alive) {
    const cold = run.laws.includes("coldNight") ? 1.3 : 1;
    const pct = Math.min(0.75, flags.slow * cold);
    if (enemy.slowUntil <= run.time || pct >= enemy.slowPct - 1e-9) {
      enemy.slowPct = pct;
      enemy.slowUntil = run.time + SLOW_TIME;
    }
    if (enemy.stackLockUntil <= run.time) {
      enemy.frostStacks = enemy.frostStacks.filter((t) => t > run.time);
      enemy.frostStacks.push(run.time + FROST_STACK_LIFE);
      if (enemy.frostStacks.length >= 3) {
        const dur = flags.freeze > 0 ? flags.freeze : 0.7;
        enemy.freezeUntil = run.time + dur;
        enemy.stackLockUntil = enemy.freezeUntil + FREEZE_LOCK;
        enemy.frostStacks = [];
      }
    }
  }
  if (runeN(tower, "frostTrail")) {
    const cold = run.laws.includes("coldNight") ? 1.3 : 1;
    enemy.trailPct = Math.min(0.5, 0.12 * cold);
    enemy.trailUntil = run.time + 0.8;
  }
  if (flags.burn) {
    const total = (executed ? removed : dmg) * 0.25;
    const ex = enemy.burns.find((b) => b.towerId === tower.id);
    const dot = { towerId: tower.id, perSec: total / 2, until: run.time + 2 };
    if (ex) {
      ex.perSec = dot.perSec;
      ex.until = dot.until;
    } else enemy.burns.push(dot);
  }
  if (flags.poison) {
    const total = (executed ? removed : dmg) * 0.2;
    const ex = enemy.poisons.find((b) => b.towerId === tower.id);
    const dot = { towerId: tower.id, perSec: total / 2.5, until: run.time + 2.5 };
    if (ex) {
      ex.perSec = dot.perSec;
      ex.until = dot.until;
    } else enemy.poisons.push(dot);
  }
  if (flags.shred) {
    enemy.shred = Math.max(enemy.shred, 4);
    enemy.shredUntil = run.time + 3;
  }
  if (flags.silence > 0 && enemy.kind === "healer") {
    enemy.silenceUntil = Math.max(enemy.silenceUntil, run.time + flags.silence);
  }
  if (enemy.kind === "healer") {
    let sil = 0;
    if (tower.glyphs.includes("mute")) sil = Math.max(sil, 3);
    if (runeN(tower, "silence")) sil = Math.max(sil, 2.5);
    if (sil) enemy.silenceUntil = Math.max(enemy.silenceUntil, run.time + sil);
  }
  if (flags.allowSpark && runeN(tower, "chainSpark") && rand(run) < 0.2 * runeN(tower, "chainSpark")) {
    const p = poseE(enemy);
    let nxt: Enemy | null = null;
    let bd = 1.8;
    for (const o of run.enemies) {
      if (!o.alive || o.id === enemy.id) continue;
      const op = poseE(o);
      const d = dist(p.x, p.y, op.x, op.y);
      if (d <= bd) {
        bd = d;
        nxt = o;
      }
    }
    if (nxt) spawnBolt(run, tower, enemy, nxt, (executed ? removed : dmg) * 0.6, dtype, false);
  }
  if (enemy.hp <= 0) killEnemy(run, meta, enemy, tower.id, flags.breath);
  else maybeBossSummon(run, enemy);
}

function maybeBossSummon(run: Run, e: Enemy): void {
  if (e.kind !== "boss" || !e.alive || run.laws.includes("quietBoss")) return;
  const phase = Math.min(3, Math.floor((1 - e.hp / e.maxHp) * 4 + 1e-9));
  while (e.bossPhase < phase) {
    e.bossPhase++;
    for (let i = 0; i < 3; i++) spawnEnemy(run, "walker", Math.max(0, e.progress - 0.35 - i * 0.15));
  }
}

function killEnemy(run: Run, meta: Meta, enemy: Enemy, killerId: number, allowBreath: boolean): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.hp = 0;
  const killer = run.towers.find((t) => t.id === killerId) ?? null;
  const p = poseE(enemy);
  if (allowBreath && killer && runeN(killer, "lastBreath")) {
    for (const o of run.enemies) {
      if (!o.alive) continue;
      const op = poseE(o);
      if (dist(p.x, p.y, op.x, op.y) <= 0.9) {
        applyHit(run, meta, o, killer, enemy.maxHp * 0.25, towerSpec(killer.kind).dmg, emptyFlags({ breath: false, execute: false }));
      }
    }
  }
  const frozen = enemy.freezeUntil > run.time;
  if (frozen) {
    const glass = run.towers.find((t) => t.kind === "frost" && t.glyphs.includes("glass"));
    if (glass) {
      for (const o of run.enemies) {
        if (!o.alive) continue;
        const op = poseE(o);
        if (dist(p.x, p.y, op.x, op.y) <= 1) {
          applyHit(run, meta, o, glass, enemy.maxHp * 0.2, "frost", emptyFlags({ execute: false, breath: false }));
        }
      }
    }
  }
  if (run.wave >= 50 && enemy.kind === "walker" && !enemy.fromSplit && rand(run) < 0.15) {
    spawnEnemy(run, "swarm", enemy.progress, true);
    spawnEnemy(run, "swarm", Math.max(0, enemy.progress - 0.2), true);
  }
  const base = killGoldBase(enemy.maxHp);
  let add = 0;
  if (run.laws.includes("goldThirst")) add += 0.5;
  let bestWell = 0;
  let wellSpark = false;
  for (const t of run.towers) {
    if (t.kind !== "well") continue;
    const c = center(t);
    if (dist(c.x, c.y, p.x, p.y) <= shotRange(run, t) + 1e-6) {
      bestWell = Math.max(bestWell, t.glyphs.includes("tribute") ? 0.6 : 0.35);
      if (t.glyphs.includes("spark")) wellSpark = true;
    }
  }
  add += bestWell;
  for (const t of run.towers) {
    if (t.kind !== "beacon" || !t.glyphs.includes("bounty")) continue;
    const c = center(t);
    if (dist(c.x, c.y, p.x, p.y) <= 1.5 + 1e-6) {
      add += 0.2;
      break;
    }
  }
  if (killer) add += 0.25 * runeN(killer, "greed");
  let mult = (1 + add) * (1 + run.interest);
  if (killer && runeN(killer, "hoard") && rand(run) < Math.min(0.5, 0.03 * runeN(killer, "hoard"))) mult *= 2;
  run.gold += Math.max(1, Math.floor(base * mult));
  if (wellSpark && run.wellSparkCd <= 0 && rand(run) < 0.08) {
    giveSparks(run, meta, 1);
    run.wellSparkCd = 4;
  }
  maybeDrop(run, meta, enemy.kind);
  pushFx(run, { kind: "hit", x: p.x, y: p.y, x2: p.x, y2: p.y, until: run.time + 0.12, scale: 1 });
}

function emptyFlags(over: Partial<HitFlags>): HitFlags {
  return {
    splash: false, beam: false, frost: false, slow: 0, freeze: 0, burn: false, poison: false,
    silence: 0, shred: false, allowSpark: false, breath: true, execute: true, ...over,
  };
}

function impactFlags(run: Run, tower: Tower, proj: Proj): HitFlags {
  return {
    splash: proj.splash > 0,
    beam: false,
    frost: proj.frost,
    slow: proj.slow,
    freeze: proj.freeze,
    burn: proj.burn,
    poison: proj.poison,
    silence: proj.silence,
    shred: proj.shred || (tower.kind === "mortar" && combosOf(run.towers, tower.id).includes("shred")),
    allowSpark: proj.allowSpark,
    breath: proj.breath,
    execute: true,
  };
}

function spawnProj(run: Run, proj: Omit<Proj, "id" | "vx" | "vy"> & { vx?: number; vy?: number }): void {
  const dx = proj.tx - proj.x;
  const dy = proj.ty - proj.y;
  const len = Math.hypot(dx, dy) || 1;
  run.projectiles.push({
    ...proj,
    id: nid(run),
    vx: (dx / len) * proj.speed,
    vy: (dy / len) * proj.speed,
  });
}

function spawnBolt(run: Run, tower: Tower, from: Enemy | null, to: Enemy, damage: number, dmg: DmgType, allowSpark: boolean): void {
  const o = from ? poseE(from) : center(tower);
  const p = poseE(to);
  spawnProj(run, {
    towerId: tower.id, kind: "bolt", x: o.x, y: o.y, tx: p.x, ty: p.y, targetId: to.id,
    speed: 14, damage, dmg, splash: 0, homing: true, jumps: 0, hit: from ? [from.id] : [],
    ricochet: false, payload: true, burn: false, poison: false, silence: 0, shred: false,
    frost: false, slow: 0, freeze: 0, allowSpark, breath: true,
  });
}

function aimAt(run: Run, e: Enemy, x: number, y: number, speed: number, homing: boolean): { x: number; y: number } {
  const p = poseE(e);
  if (homing) return p;
  const d = dist(x, y, p.x, p.y);
  const t = d / Math.max(0.1, speed);
  return pathPose(Math.min(PATH_LEN, e.progress + moveSpeed(run, e) * t));
}

function fireOnce(run: Run, meta: Meta, tower: Tower, primary: Enemy, list: Enemy[]): void {
  const spec = towerSpec(tower.kind);
  let dmg = shotDamage(run, tower);
  const dtype = spec.dmg;
  const o = center(tower);
  if (tower.kind === "beam") {
    const focus = tower.glyphs.includes("focus");
    if (focus) dmg *= 2.1;
    const hits = beamTargets(run, tower, primary);
    const aim = poseE(primary);
    pushFx(run, { kind: "beam", x: o.x, y: o.y, x2: aim.x, y2: aim.y, until: run.time + 0.1, scale: 1 });
    for (const h of hits) {
      applyHit(run, meta, h, tower, dmg, dtype, emptyFlags({ beam: true, allowSpark: true }));
    }
    if (runeN(tower, "swarm")) {
      const sec = secondNearest(list, primary, o);
      if (sec && sec.alive && !hits.includes(sec)) applyHit(run, meta, sec, tower, dmg * 0.3, dtype, emptyFlags({ beam: true, allowSpark: false }));
    }
    return;
  }
  if (tower.kind === "spike") {
    const victims = tower.glyphs.includes("saw") ? list.slice() : [primary];
    for (const v of victims) {
      applyHit(run, meta, v, tower, dmg, dtype, emptyFlags({
        poison: tower.glyphs.includes("poison"), allowSpark: true,
      }));
      const p = poseE(v);
      spawnProj(run, {
        towerId: tower.id, kind: "spike", x: o.x, y: o.y, tx: p.x, ty: p.y, targetId: v.id,
        speed: 18, damage: 0, dmg: dtype, splash: 0, homing: true, jumps: 0, hit: [],
        ricochet: false, payload: false, burn: false, poison: false, silence: 0, shred: false,
        frost: false, slow: 0, freeze: 0, allowSpark: false, breath: false,
      });
    }
    if (runeN(tower, "swarm")) {
      const sec = secondNearest(list, primary, o);
      if (sec && sec.alive && !victims.includes(sec)) applyHit(run, meta, sec, tower, dmg * 0.3, dtype, emptyFlags({ allowSpark: false }));
    }
    return;
  }
  if (tower.kind === "well") {
    const p = poseE(primary);
    pushFx(run, { kind: "beam", x: o.x, y: o.y, x2: p.x, y2: p.y, until: run.time + 0.08, scale: 1 });
    applyHit(run, meta, primary, tower, dmg, dtype, emptyFlags({ allowSpark: true }));
    if (runeN(tower, "swarm")) {
      const sec = secondNearest(list, primary, o);
      if (sec && sec.alive) applyHit(run, meta, sec, tower, dmg * 0.3, dtype, emptyFlags({ allowSpark: false }));
    }
    return;
  }
  if (tower.kind === "mortar" && tower.glyphs.includes("volley")) {
    for (let i = 0; i < 3; i++) {
      const tgt = list[Math.floor(rand(run) * list.length)] ?? primary;
      launchMortar(run, tower, tgt, dmg * 0.45);
    }
    return;
  }
  if (tower.kind === "mortar") {
    launchMortar(run, tower, primary, dmg);
    if (runeN(tower, "swarm")) {
      const sec = secondNearest(list, primary, o);
      if (sec) launchMortar(run, tower, sec, dmg * 0.3);
    }
    return;
  }
  if (tower.kind === "frost") {
    launchFrost(run, tower, primary, dmg);
    if (runeN(tower, "swarm")) {
      const sec = secondNearest(list, primary, o);
      if (sec) launchFrost(run, tower, sec, dmg * 0.3);
    }
    return;
  }
  if (tower.kind === "chain") {
    const jumps = 2 + (tower.glyphs.includes("link") ? 1 : 0) + (combosOf(run.towers, tower.id).includes("storm") ? 1 : 0);
    const first = dmg * (tower.glyphs.includes("surge") ? 1.5 : 1);
    launchChain(run, tower, null, primary, first, jumps);
    if (runeN(tower, "swarm")) {
      const sec = secondNearest(list, primary, o);
      if (sec) launchChain(run, tower, null, sec, dmg * 0.3, 0);
    }
  }
}

function launchMortar(run: Run, tower: Tower, target: Enemy, damage: number): void {
  const o = center(tower);
  const aim = aimAt(run, target, o.x, o.y, 9, false);
  const splash = tower.glyphs.includes("crater") ? 1.6 : 1.1;
  spawnProj(run, {
    towerId: tower.id, kind: "mortar", x: o.x, y: o.y, tx: aim.x, ty: aim.y, targetId: target.id,
    speed: 9, damage, dmg: "fire", splash, homing: false, jumps: 0, hit: [],
    ricochet: runeN(tower, "ricochet") > 0, payload: true,
    burn: tower.glyphs.includes("embers"), poison: false, silence: 0,
    shred: combosOf(run.towers, tower.id).includes("shred"),
    frost: false, slow: 0, freeze: 0, allowSpark: true, breath: true,
  });
}

function launchFrost(run: Run, tower: Tower, target: Enemy, damage: number): void {
  const o = center(tower);
  const p = poseE(target);
  const bliz = tower.glyphs.includes("blizzard");
  spawnProj(run, {
    towerId: tower.id, kind: "frost", x: o.x, y: o.y, tx: p.x, ty: p.y, targetId: target.id,
    speed: 12, damage, dmg: "frost", splash: bliz ? 0.7 : 0, homing: true, jumps: 0, hit: [],
    ricochet: runeN(tower, "ricochet") > 0, payload: true, burn: false, poison: false, silence: 0, shred: false,
    frost: true, slow: bliz ? 0.6 : 0.35, freeze: tower.glyphs.includes("iceblock") ? 1.2 : 0.7,
    allowSpark: true, breath: true,
  });
}

function launchChain(run: Run, tower: Tower, from: Enemy | null, target: Enemy, damage: number, jumps: number, already: number[] = []): void {
  const o = from ? poseE(from) : center(tower);
  const p = poseE(target);
  const hit = already.slice();
  if (from) hit.push(from.id);
  spawnProj(run, {
    towerId: tower.id, kind: "chain", x: o.x, y: o.y, tx: p.x, ty: p.y, targetId: target.id,
    speed: 14, damage, dmg: "void", splash: 0, homing: true, jumps, hit,
    ricochet: !from && runeN(tower, "ricochet") > 0, payload: true, burn: false, poison: false, silence: 0, shred: false,
    frost: false, slow: 0, freeze: 0, allowSpark: true, breath: true,
  });
}

function explodeAt(run: Run, meta: Meta, proj: Proj, tower: Tower, x: number, y: number, except: number | null): void {
  const glass = proj.kind === "mortar" && combosOf(run.towers, tower.id).includes("glassice");
  const radius = proj.splash;
  pushFx(run, { kind: "explode", x, y, x2: x, y2: y, until: run.time + 0.2, scale: Math.max(1, radius) });
  for (const e of run.enemies) {
    if (!e.alive) continue;
    const p = poseE(e);
    const d = dist(x, y, p.x, p.y);
    if (d > radius + 1e-6) continue;
    const fall = 1 - 0.45 * (radius > 0 ? d / radius : 0);
    let raw = proj.damage * fall;
    if (glass) raw += 0.08 * Math.max(0, e.maxHp - e.hp);
    applyHit(run, meta, e, tower, raw, proj.dmg, impactFlags(run, tower, proj));
  }
  if (proj.ricochet) ricochetFrom(run, tower, proj, x, y, except);
}

function ricochetFrom(run: Run, tower: Tower, proj: Proj, x: number, y: number, except: number | null): void {
  if (proj.kind !== "mortar" && proj.kind !== "frost" && proj.kind !== "chain") return;
  let nxt: Enemy | null = null;
  let bd = 1.6;
  for (const e of run.enemies) {
    if (!e.alive || e.id === except) continue;
    const p = poseE(e);
    const d = dist(x, y, p.x, p.y);
    if (d <= bd && d > 0.05) {
      bd = d;
      nxt = e;
    }
  }
  if (!nxt) return;
  const p = poseE(nxt);
  spawnProj(run, {
    ...proj,
    x, y, tx: p.x, ty: p.y, targetId: nxt.id, damage: proj.damage * 0.7,
    ricochet: false, jumps: 0, hit: except ? [except] : [], allowSpark: false, homing: true, splash: proj.kind === "mortar" ? proj.splash : 0,
  });
}

function arrive(run: Run, meta: Meta, proj: Proj): void {
  const tower = run.towers.find((t) => t.id === proj.towerId);
  if (!tower || !proj.payload) return;
  const target = run.enemies.find((e) => e.id === proj.targetId && e.alive);
  if (proj.splash > 0) {
    const x = target && proj.homing ? poseE(target).x : proj.tx;
    const y = target && proj.homing ? poseE(target).y : proj.ty;
    explodeAt(run, meta, proj, tower, x, y, target ? target.id : null);
    return;
  }
  if (!target) return;
  applyHit(run, meta, target, tower, proj.damage, proj.dmg, impactFlags(run, tower, proj));
  pushFx(run, { kind: "hit", x: poseE(target).x, y: poseE(target).y, x2: 0, y2: 0, until: run.time + 0.12, scale: 1 });
  if (proj.jumps > 0) {
    const p = poseE(target);
    let nxt: Enemy | null = null;
    let bd = 1.8;
    for (const e of run.enemies) {
      if (!e.alive || e.id === target.id || proj.hit.includes(e.id)) continue;
      const ep = poseE(e);
      const d = dist(p.x, p.y, ep.x, ep.y);
      if (d <= bd) {
        bd = d;
        nxt = e;
      }
    }
    if (nxt) {
      launchChain(run, tower, target, nxt, proj.damage * 0.7, proj.jumps - 1, proj.hit);
      return;
    }
  }
  if (proj.ricochet) {
    const p = poseE(target);
    ricochetFrom(run, tower, proj, p.x, p.y, target.id);
  }
}

function tryFire(run: Run, meta: Meta, tower: Tower, dt: number): void {
  if (tower.kind === "beacon") return;
  const rate = shotRate(run, tower);
  if (rate <= 0) return;
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;
  const list = inRange(run, tower);
  const primary = pickTarget(tower, list, center(tower));
  if (!primary) {
    tower.cooldown = 0;
    return;
  }
  let bursts = 1;
  tower.shots += 1;
  if (tower.shots % 4 === 0 && runeN(tower, "fourth")) bursts++;
  if (runeN(tower, "eternity") && rand(run) < 0.08) bursts++;
  if (run.laws.includes("echoShot") && rand(run) < 0.1) bursts++;
  bursts = Math.min(4, bursts);
  for (let i = 0; i < bursts; i++) {
    const still = primary.alive ? primary : pickTarget(tower, inRange(run, tower), center(tower));
    if (!still) break;
    fireOnce(run, meta, tower, still, inRange(run, tower));
  }
  tower.cooldown += 1 / rate;
}

function tickDots(run: Run, meta: Meta, e: Enemy, dt: number): void {
  const tick = (list: Dot[], type: DmgType) => {
    for (const d of list) {
      if (d.until <= run.time || !e.alive) continue;
      const tower = run.towers.find((t) => t.id === d.towerId);
      if (!tower) continue;
      const before = e.hp;
      e.hp -= d.perSec * dt;
      if (runeN(tower, "gateThirst")) healGates(run, (before - Math.max(0, e.hp)) * 0.02);
      e.lastHit = tower.id;
      if (e.hp <= 0) killEnemy(run, meta, e, tower.id, true);
    }
  };
  tick(e.burns, "fire");
  tick(e.poisons, "phys");
}

function leak(run: Run, e: Enemy): void {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  run.hearts -= LEAK[e.kind];
  if (run.hearts <= 0) {
    run.hearts = 0;
    run.defeated = true;
    run.speed = 0;
  }
}

function onWaveCleared(run: Run, meta: Meta): void {
  const n = run.wave;
  let add = run.laws.includes("goldThirst") ? 0.5 : 0;
  run.gold += Math.floor(waveClearGold(n) * (1 + add) * (1 + run.interest));
  const factor = sparkFactor(run.laws);
  giveSparks(run, meta, Math.round(sparkMilestone(n) * factor));
  giveSparks(run, meta, Math.round(sparkBoss(n) * factor));
  run.cleared = n;
  if (n % 10 === 0 && n >= dawnMin(run.laws)) {
    run.dawnReady = true;
    meta.dawnUnlocked = true;
  }
  meta.bestWave = Math.max(meta.bestWave, n);
  if (meta.interest) run.interest = Math.min(0.15, Math.floor(run.gold / 10) * 0.01);
  run.wave = n + 1;
  run.phase = "gap";
  run.gap = 2.2;
  run.queue = [];
}

function startWave(run: Run): void {
  run.phase = "fight";
  const q: EnemyKind[] = [];
  for (const g of wavePlan(run.wave)) for (let i = 0; i < g.count; i++) q.push(g.kind);
  run.queue = q;
  run.spawnCd = 0;
}

function tick(run: Run, meta: Meta, dt: number): void {
  if (run.defeated) return;
  run.time += dt;
  run.wellSparkCd = Math.max(0, run.wellSparkCd - dt);
  run.critSparkCd = Math.max(0, run.critSparkCd - dt);
  run.gateHealCd = Math.max(0, run.gateHealCd - dt);
  run.fx = run.fx.filter((f) => f.until > run.time);

  if (run.phase === "gap") {
    run.gap -= dt;
    if (run.gap <= 0) startWave(run);
    return;
  }

  for (const e of run.enemies) {
    if (!e.alive) continue;
    e.progress += moveSpeed(run, e) * dt;
    if (e.progress >= PATH_LEN) leak(run, e);
  }
  if (run.defeated) return;

  for (const e of run.enemies) {
    if (!e.alive) continue;
    if (run.wave >= 25 && (e.kind === "tank" || e.kind === "boss")) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.004 * dt);
    }
  }
  for (const e of run.enemies) {
    if (!e.alive || e.kind !== "healer") continue;
    e.healCd -= dt;
    if (e.healCd > 0 || e.silenceUntil > run.time) continue;
    e.healCd = 2.4;
    const amount = 2 * Math.pow(1.13, e.wave - 1);
    const p = poseE(e);
    for (const o of run.enemies) {
      if (!o.alive || o.id === e.id) continue;
      const op = poseE(o);
      if (dist(p.x, p.y, op.x, op.y) <= 1.6) o.hp = Math.min(o.maxHp, o.hp + amount);
    }
  }
  for (const e of run.enemies) if (e.alive) tickDots(run, meta, e, dt);
  if (run.defeated) return;

  for (const t of run.towers) tryFire(run, meta, t, dt);

  const pending: Proj[] = [];
  for (const proj of run.projectiles) {
    const target = run.enemies.find((e) => e.id === proj.targetId && e.alive);
    if (proj.homing && target) {
      const p = poseE(target);
      proj.tx = p.x;
      proj.ty = p.y;
    }
    const dx = proj.tx - proj.x;
    const dy = proj.ty - proj.y;
    const d = Math.hypot(dx, dy);
    const step = proj.speed * dt;
    if (d <= step + 0.05) {
      proj.x = proj.tx;
      proj.y = proj.ty;
      arrive(run, meta, proj);
    } else {
      proj.x += (dx / d) * step;
      proj.y += (dy / d) * step;
      proj.vx = (dx / d) * proj.speed;
      proj.vy = (dy / d) * proj.speed;
      pending.push(proj);
    }
    if (run.defeated) return;
  }
  run.projectiles = pending;

  run.enemies = run.enemies.filter((e) => e.alive);
  if (run.queue.length === 0 && run.enemies.length === 0 && run.projectiles.length === 0 && run.phase === "fight") {
    onWaveCleared(run, meta);
    return;
  }
  if (run.spawnCd > 0) run.spawnCd -= dt;
  if (run.spawnCd <= 0 && run.queue.length) {
    const kind = run.queue.shift()!;
    spawnEnemy(run, kind, 0);
    run.spawnCd = spawnInterval(run.wave);
  }
}

export function stepRun(run: Run, meta: Meta, dt: number): void {
  if (run.defeated || run.speed === 0) return;
  let left = Math.min(0.3, Math.max(0, dt)) * run.speed;
  let guard = 0;
  while (left > 1e-4 && !run.defeated && guard < 12) {
    const h = Math.min(0.05, left);
    tick(run, meta, h);
    left -= h;
    guard++;
  }
}

export interface Act { ok: boolean; reason: string }

const OK: Act = { ok: true, reason: "" };

function padOpen(meta: Meta, run: Run, x: number, y: number): boolean {
  return padsFor(meta.extraPads, run.laws).some((p) => p.x === x && p.y === y);
}

export function placeCost(run: Run, kind: TowerKind): number {
  const base = towerSpec(kind).cost;
  if (kind === "beacon" && run.beaconFree) return 0;
  if (run.discountArmed && !run.discountUsed) return Math.floor(base * 0.5);
  return base;
}

export function placeTower(run: Run, meta: Meta, x: number, y: number, kind: TowerKind): Act {
  if (run.defeated) return { ok: false, reason: "Ночь уже кончилась." };
  if (kind === "chain" && !meta.chain) return { ok: false, reason: "Цепь ещё закрыта. Она открывается в лавке искр." };
  if (kind === "well" && !meta.well) return { ok: false, reason: "Колодец ещё закрыт. Он открывается в лавке искр." };
  if (!padOpen(meta, run, x, y)) return { ok: false, reason: "Сюда нельзя ставить. Нужна свободная площадка у тропы." };
  if (run.towers.some((t) => t.x === x && t.y === y)) return { ok: false, reason: "Площадка занята." };
  const cost = placeCost(run, kind);
  if (run.gold < cost) return { ok: false, reason: "Не хватает золота." };
  run.gold -= cost;
  if (kind === "beacon" && run.beaconFree) run.beaconFree = false;
  else if (run.discountArmed && !run.discountUsed) run.discountUsed = true;
  run.towers.push({
    id: nid(run), kind, x, y, level: 1, glyphs: [], awakened: false, runes: [],
    target: "first", spent: cost, cooldown: 0, shots: 0,
  });
  return OK;
}

export function upgradeCost(tower: Tower): number {
  return Math.round(towerSpec(tower.kind).cost * Math.pow(1.55, tower.level));
}

export function upgradeTower(run: Run, id: number): Act {
  const t = run.towers.find((x) => x.id === id);
  if (!t) return { ok: false, reason: "Башня не найдена." };
  if (t.level >= 8) return { ok: false, reason: "Башня уже максимального уровня." };
  if (t.level >= 3 && t.glyphs.length === 0) return { ok: false, reason: "Сначала выберите глиф. Без глифа башня не идёт на 4 уровень." };
  const cost = upgradeCost(t);
  if (run.gold < cost) return { ok: false, reason: "Не хватает золота на улучшение." };
  run.gold -= cost;
  t.spent += cost;
  t.level += 1;
  return OK;
}

export function chooseGlyph(run: Run, id: number, glyph: GlyphId): Act {
  const t = run.towers.find((x) => x.id === id);
  if (!t) return { ok: false, reason: "Башня не найдена." };
  if (t.level < 3 && !t.awakened) return { ok: false, reason: "Глиф открывается на 3 уровне." };
  const allowed = towerSpec(t.kind).glyphs.some((g) => g.id === glyph);
  if (!allowed) return { ok: false, reason: "Этот глиф не подходит башне." };
  if (t.glyphs.includes(glyph)) return { ok: false, reason: "Этот глиф уже стоит." };
  if (t.glyphs.length === 0) {
    t.glyphs.push(glyph);
    return OK;
  }
  if (t.awakened && t.glyphs.length === 1) {
    t.glyphs.push(glyph);
    return OK;
  }
  return { ok: false, reason: "Глиф уже выбран. Второй глиф даёт только пробуждение." };
}

export function sellTower(run: Run, id: number): Act {
  const i = run.towers.findIndex((t) => t.id === id);
  if (i < 0) return { ok: false, reason: "Башня не найдена." };
  const t = run.towers[i]!;
  run.gold += Math.floor(t.spent * 0.7);
  for (const r of t.runes) run.bag.push(r);
  run.towers.splice(i, 1);
  return OK;
}

export function cycleTarget(run: Run, id: number): Act {
  const t = run.towers.find((x) => x.id === id);
  if (!t) return { ok: false, reason: "Башня не найдена." };
  const order: TargetMode[] = ["first", "last", "strongest", "nearest"];
  const i = order.indexOf(t.target);
  t.target = order[(i + 1) % order.length]!;
  return OK;
}

export function socketRune(run: Run, towerId: number, bagIndex: number): Act {
  const t = run.towers.find((x) => x.id === towerId);
  if (!t) return { ok: false, reason: "Башня не найдена." };
  if (t.runes.length >= run.slots) return { ok: false, reason: "Свободных слотов нет. Лишние слоты открываются в лавке." };
  const rune = run.bag[bagIndex];
  if (!rune) return { ok: false, reason: "В сумке нет такой руны." };
  run.bag.splice(bagIndex, 1);
  t.runes.push(rune);
  if (rune === "sniper") t.target = "strongest";
  return OK;
}

export function unsocketRune(run: Run, towerId: number, slot: number): Act {
  const t = run.towers.find((x) => x.id === towerId);
  if (!t) return { ok: false, reason: "Башня не найдена." };
  const rune = t.runes[slot];
  if (!rune) return { ok: false, reason: "Слот пуст." };
  t.runes.splice(slot, 1);
  run.bag.push(rune);
  return OK;
}

export function rerollCost(run: Run): number {
  return 20 + 10 * run.night;
}

export function rerollRune(run: Run, towerId: number, slot: number): Act {
  const t = run.towers.find((x) => x.id === towerId);
  if (!t) return { ok: false, reason: "Башня не найдена." };
  const rune = t.runes[slot];
  if (!rune) return { ok: false, reason: "В этом слоте нет руны." };
  if (run.rerollUsed) return { ok: false, reason: "Переброс руны уже использован в эту ночь." };
  const cost = rerollCost(run);
  if (run.gold < cost) return { ok: false, reason: "Не хватает золота на переброс." };
  run.gold -= cost;
  run.rerollUsed = true;
  t.runes.splice(slot, 1);
  run.bag.push(rune);
  const next = rollRune(run);
  if (!next) return { ok: false, reason: "Новая руна не выпала: все виды уже лежат в трёх копиях." };
  // rollRune counts the returned rune. Take it from the pool by removing a fresh one.
  const idx = run.bag.lastIndexOf(rune);
  if (idx >= 0) run.bag.splice(idx, 1);
  t.runes.splice(slot, 0, next);
  if (next === "sniper") t.target = "strongest";
  return OK;
}

export function mergeTowers(run: Run, keepId: number, dropId: number): Act {
  if (!run.laws.includes("merge")) return { ok: false, reason: "Слияние открывает закон «Слияние» на Рассвете." };
  if (run.merged) return { ok: false, reason: "Слияние уже было в эту ночь." };
  const a = run.towers.find((t) => t.id === keepId);
  const b = run.towers.find((t) => t.id === dropId);
  if (!a || !b || a.id === b.id) return { ok: false, reason: "Нужны две разные башни." };
  if (a.kind !== b.kind) return { ok: false, reason: "Сливать можно только одинаковый тип." };
  if (a.level < 5 || b.level < 5) return { ok: false, reason: "Обе башни должны быть 5 уровня или выше." };
  a.awakened = true;
  a.spent += b.spent;
  a.level = Math.max(a.level, b.level);
  for (const r of b.runes) run.bag.push(r);
  run.towers = run.towers.filter((t) => t.id !== b.id);
  run.merged = true;
  return OK;
}

export function shopOwned(meta: Meta, id: ShopId): number {
  if (id === "chain") return meta.chain ? 1 : 0;
  if (id === "well") return meta.well ? 1 : 0;
  if (id === "rune2") return meta.runeSlots >= 2 ? 1 : 0;
  if (id === "rune3") return meta.runeSlots >= 3 ? 1 : 0;
  if (id === "gold") return meta.startGoldRanks;
  if (id === "hearts") return meta.heartRanks;
  if (id === "discount") return meta.discount ? 1 : 0;
  if (id === "pads") return meta.extraPads ? 1 : 0;
  return meta.interest ? 1 : 0;
}

export function buyShop(meta: Meta, id: ShopId, run: Run | null): Act {
  const spec = SHOP.find((s) => s.id === id);
  if (!spec) return { ok: false, reason: "Нет такого товара." };
  if (shopOwned(meta, id) >= spec.max) return { ok: false, reason: "Уже куплено." };
  if (id === "rune3" && meta.runeSlots < 2) return { ok: false, reason: "Сначала откройте второй слот руны." };
  if (meta.sparks < spec.cost) return { ok: false, reason: "Не хватает искр." };
  meta.sparks -= spec.cost;
  meta.purchases += 1;
  if (id === "chain") meta.chain = true;
  else if (id === "well") meta.well = true;
  else if (id === "rune2") meta.runeSlots = Math.max(meta.runeSlots, 2);
  else if (id === "rune3") meta.runeSlots = 3;
  else if (id === "gold") meta.startGoldRanks += 1;
  else if (id === "hearts") {
    meta.heartRanks += 1;
    if (run && !run.defeated) {
      run.maxHearts += 5;
      run.hearts += 5;
    }
  } else if (id === "discount") {
    meta.discount = true;
    if (run && run.towers.length === 0) run.discountArmed = true;
  } else if (id === "pads") meta.extraPads = true;
  else if (id === "interest") meta.interest = true;
  if (run) run.slots = meta.runeSlots;
  return OK;
}

export function canDawn(run: Run): boolean {
  const min = dawnMin(run.laws);
  if (run.defeated) return run.wave >= min || run.cleared >= min;
  return run.dawnReady && run.cleared >= min;
}

export function dawnWave(run: Run): number {
  if (run.defeated) return Math.max(run.wave, run.cleared);
  return Math.max(run.cleared, 1);
}

export function offerLaws(meta: Meta, rng: () => number): LawId[] {
  const left = LAWS.map((l) => l.id).filter((id) => !meta.laws.includes(id));
  for (let i = left.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = left[i]!;
    left[i] = left[j]!;
    left[j] = a;
  }
  return left.slice(0, 3);
}

export function ensureLawOffer(meta: Meta, run: Run): LawId[] {
  if (meta.lawOffer) return meta.lawOffer;
  const offer = offerLaws(meta, () => rand(run));
  meta.lawOffer = offer;
  return offer;
}

function reclaimRunes(run: Run): void {
  for (const t of run.towers) for (const r of t.runes) run.bag.push(r);
  run.towers = [];
}

export function bankDefeat(meta: Meta, run: Run): void {
  reclaimRunes(run);
  meta.bag = run.bag;
  meta.carryGold = run.laws.includes("transfusion") ? Math.floor(run.gold * 0.1) : 0;
  meta.bestWave = Math.max(meta.bestWave, run.wave, run.cleared);
  if (canDawn(run)) meta.dawnUnlocked = true;
  meta.night += 1;
  meta.run = null;
}

export function bankDawn(meta: Meta, run: Run, law: LawId | null): Act {
  if (!canDawn(run)) return { ok: false, reason: "Рассвет ещё закрыт." };
  const left = LAWS.filter((l) => !meta.laws.includes(l.id));
  if (law) {
    if (!left.some((l) => l.id === law)) return { ok: false, reason: "Этот закон уже взят или его нет." };
    if (meta.lawOffer && !meta.lawOffer.includes(law)) return { ok: false, reason: "Этот закон не предложен." };
    meta.laws.push(law);
  } else if (left.length > 0) {
    return { ok: false, reason: "Выберите один закон." };
  } else {
    meta.sparks += 15;
    run.sparksNight += 15;
  }
  const gained = dawnConversion(run.gold, dawnWave(run), run.laws);
  meta.sparks += gained;
  run.sparksNight += gained;
  reclaimRunes(run);
  meta.bag = run.bag;
  meta.carryGold = 0;
  meta.bestWave = Math.max(meta.bestWave, dawnWave(run));
  meta.dawnUnlocked = true;
  meta.night += 1;
  meta.lawOffer = null;
  meta.run = null;
  return OK;
}

const LAW_IDS = new Set<string>(LAWS.map((l) => l.id));
const RUNE_IDS = new Set<string>(RUNES.map((r) => r.id));
const TOWER_IDS = new Set<string>(TOWERS.map((t) => t.kind));

function asNum(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function asBool(v: unknown, d = false): boolean {
  return typeof v === "boolean" ? v : d;
}

function sanitizeRun(raw: unknown, bag: RuneId[]): Run | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Run>;
  try {
    const laws = Array.isArray(r.laws) ? r.laws.filter((id): id is LawId => typeof id === "string" && LAW_IDS.has(id)) : [];
    const run: Run = {
      night: Math.max(1, Math.floor(asNum(r.night, 1))),
      wave: Math.max(1, Math.floor(asNum(r.wave, 1))),
      cleared: Math.max(0, Math.floor(asNum(r.cleared, 0))),
      phase: r.phase === "fight" ? "fight" : "gap",
      gap: asNum(r.gap, 1),
      queue: Array.isArray(r.queue) ? r.queue.filter((k): k is EnemyKind => typeof k === "string" && k in SPEED) : [],
      spawnCd: asNum(r.spawnCd, 0),
      gold: Math.max(0, asNum(r.gold, 0)),
      hearts: asNum(r.hearts, 20),
      maxHearts: Math.max(1, asNum(r.maxHearts, 20)),
      sparksNight: Math.max(0, asNum(r.sparksNight, 0)),
      interest: Math.min(0.15, Math.max(0, asNum(r.interest, 0))),
      time: Math.max(0, asNum(r.time, 0)),
      towers: [],
      enemies: [],
      projectiles: [],
      fx: [],
      nextId: Math.max(1, Math.floor(asNum(r.nextId, 1))),
      bag,
      slots: Math.max(1, Math.min(3, Math.floor(asNum(r.slots, 1)))),
      laws,
      rerollUsed: asBool(r.rerollUsed),
      merged: asBool(r.merged),
      beaconFree: asBool(r.beaconFree),
      discountArmed: asBool(r.discountArmed),
      discountUsed: asBool(r.discountUsed),
      wellSparkCd: asNum(r.wellSparkCd, 0),
      critSparkCd: asNum(r.critSparkCd, 0),
      gateHealCd: asNum(r.gateHealCd, 0),
      gatePool: asNum(r.gatePool, 0),
      speed: r.speed === 0 || r.speed === 2 ? r.speed : 1,
      defeated: asBool(r.defeated),
      dawnReady: asBool(r.dawnReady),
      rng: asNum(r.rng, 1) >>> 0,
    };
    if (Array.isArray(r.towers)) {
      for (const t of r.towers) {
        if (!t || typeof t !== "object") continue;
        const tt = t as Partial<Tower>;
        if (typeof tt.kind !== "string" || !TOWER_IDS.has(tt.kind)) continue;
        const glyphs = Array.isArray(tt.glyphs) ? tt.glyphs.filter((g): g is GlyphId => typeof g === "string") : [];
        const runes = Array.isArray(tt.runes) ? tt.runes.filter((id): id is RuneId => typeof id === "string" && RUNE_IDS.has(id)) : [];
        run.towers.push({
          id: Math.floor(asNum(tt.id, run.nextId++)),
          kind: tt.kind as TowerKind,
          x: Math.floor(asNum(tt.x, 0)),
          y: Math.floor(asNum(tt.y, 0)),
          level: Math.max(1, Math.min(8, Math.floor(asNum(tt.level, 1)))),
          glyphs: glyphs.slice(0, 2),
          awakened: asBool(tt.awakened),
          runes: runes.slice(0, 3),
          target: tt.target === "last" || tt.target === "strongest" || tt.target === "nearest" ? tt.target : "first",
          spent: Math.max(0, asNum(tt.spent, 0)),
          cooldown: Math.max(0, asNum(tt.cooldown, 0)),
          shots: Math.max(0, Math.floor(asNum(tt.shots, 0))),
        });
      }
    }
    if (Array.isArray(r.enemies)) {
      for (const e of r.enemies) {
        if (!e || typeof e !== "object") continue;
        const ee = e as Partial<Enemy>;
        if (typeof ee.kind !== "string" || !(ee.kind in SPEED)) continue;
        if (ee.alive === false) continue;
        run.enemies.push({
          id: Math.floor(asNum(ee.id, run.nextId++)),
          kind: ee.kind as EnemyKind,
          wave: Math.max(1, Math.floor(asNum(ee.wave, run.wave))),
          hp: Math.max(0, asNum(ee.hp, 1)),
          maxHp: Math.max(1, asNum(ee.maxHp, 1)),
          armor: Math.max(0, asNum(ee.armor, 0)),
          progress: Math.max(0, asNum(ee.progress, 0)),
          alive: true,
          slowUntil: asNum(ee.slowUntil, 0),
          slowPct: asNum(ee.slowPct, 0),
          trailUntil: asNum(ee.trailUntil, 0),
          trailPct: asNum(ee.trailPct, 0),
          freezeUntil: asNum(ee.freezeUntil, 0),
          stackLockUntil: asNum(ee.stackLockUntil, 0),
          frostStacks: Array.isArray(ee.frostStacks) ? ee.frostStacks.filter((n) => typeof n === "number") : [],
          burns: [],
          poisons: [],
          shred: asNum(ee.shred, 0),
          shredUntil: asNum(ee.shredUntil, 0),
          silenceUntil: asNum(ee.silenceUntil, 0),
          healCd: asNum(ee.healCd, 2.4),
          bossPhase: Math.max(0, Math.floor(asNum(ee.bossPhase, 0))),
          fromSplit: asBool(ee.fromSplit),
          lastHit: Math.floor(asNum(ee.lastHit, 0)),
        });
      }
    }
    return run;
  } catch {
    return null;
  }
}

export function sanitizeMeta(raw: unknown): Meta {
  const base = freshMeta();
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Partial<Meta>;
  base.sparks = Math.max(0, Math.floor(asNum(m.sparks, 0)));
  base.laws = Array.isArray(m.laws) ? m.laws.filter((id): id is LawId => typeof id === "string" && LAW_IDS.has(id)) : [];
  base.chain = asBool(m.chain);
  base.well = asBool(m.well);
  base.runeSlots = Math.max(1, Math.min(3, Math.floor(asNum(m.runeSlots, 1))));
  base.startGoldRanks = Math.max(0, Math.min(4, Math.floor(asNum(m.startGoldRanks, 0))));
  base.heartRanks = Math.max(0, Math.min(3, Math.floor(asNum(m.heartRanks, 0))));
  base.discount = asBool(m.discount);
  base.extraPads = asBool(m.extraPads);
  base.interest = asBool(m.interest);
  base.purchases = Math.max(0, Math.floor(asNum(m.purchases, 0)));
  base.night = Math.max(1, Math.floor(asNum(m.night, 1)));
  base.bestWave = Math.max(0, Math.floor(asNum(m.bestWave, 0)));
  base.carryGold = Math.max(0, Math.floor(asNum(m.carryGold, 0)));
  base.bag = Array.isArray(m.bag) ? m.bag.filter((id): id is RuneId => typeof id === "string" && RUNE_IDS.has(id)) : [];
  base.dawnUnlocked = asBool(m.dawnUnlocked);
  base.lawOffer = Array.isArray(m.lawOffer) ? m.lawOffer.filter((id): id is LawId => typeof id === "string" && LAW_IDS.has(id)).slice(0, 3) : null;
  const run = sanitizeRun(m.run, base.bag);
  if (run) {
    base.run = run;
    base.bag = run.bag;
  }
  return base;
}

export function serializeSave(meta: Meta): string {
  return JSON.stringify(meta);
}

export function parseSave(raw: string | null): { meta: Meta; allowWrite: boolean } {
  if (raw == null || raw.trim() === "") return { meta: freshMeta(), allowWrite: true };
  try {
    const data = JSON.parse(raw) as { v?: unknown };
    if (!data || typeof data !== "object" || data.v !== 1) return { meta: freshMeta(), allowWrite: false };
    return { meta: sanitizeMeta(data), allowWrite: true };
  } catch {
    return { meta: freshMeta(), allowWrite: false };
  }
}

export function towerTip(kind: TowerKind, cost: number, locked: boolean): string {
  const s = towerSpec(kind);
  const head = locked && s.shop ? `${s.name} закрыта. Открывается за ${s.shop} искр в лавке.` : `${s.name}. Цена: ${cost} золота.`;
  const dmg = s.kind === "beacon" ? "Урон: нет, маяк не стреляет." : `Урон: ${fmtStat(s.damage)}. Темп: ${fmtStat(s.rate)} выстр/с.`;
  return [
    head,
    dmg,
    `Радиус: ${fmtStat(s.range)} клетки.`,
    `Тип урона: ${DMG_NAME[s.dmg]}.`,
    s.special,
  ].join("\n");
}

export function liveLines(run: Run, tower: Tower): string[] {
  const s = towerSpec(tower.kind);
  const lines = [
    `${s.name}, уровень ${tower.level}${tower.awakened ? ", пробуждена" : ""}.`,
    s.kind === "beacon"
      ? "Не стреляет. Держит ауру для соседних башен."
      : `Урон: ${fmtStat(shotDamage(run, tower))}. Темп: ${fmtStat(shotRate(run, tower))} выстр/с.`,
    `Радиус: ${fmtStat(shotRange(run, tower))} клетки.`,
    `Тип урона: ${DMG_NAME[s.dmg]}.`,
  ];
  const ex = executeThreshold(run, tower);
  if (ex > 0 && s.kind !== "beacon") lines.push(`Казнь: ниже ${Math.round(ex * 100)}% здоровья.`);
  lines.push(s.special);
  return lines;
}

export function resonanceText(towers: readonly Tower[], id: number): string {
  const r = resonanceOf(towers, id);
  if (r.size <= 1) return "Резонанс: башня стоит одна, бонуса нет. Поставьте рядом такой же тип.";
  return `Резонанс: ${r.size} в связке, +${Math.round(r.bonus * 100)}% урона.`;
}

export interface Fit { S: number }

/** Целый масштаб: один логический пиксель = S аппаратных. */
export function fitCanvas(availW: number, availH: number, dpr: number): Fit {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const S = Math.floor(Math.min((availW * d) / MAP_W, (availH * d) / MAP_H));
  return { S: Math.max(1, S) };
}
