// Древо между ночами. Числа — docs/eternal-watch-v2-DESIGN.md.
import {
  TOWER_NAME, enemyRec, towerRec,
  type Bonuses, type Cost, type EnemyKind, type Meta, type TowerKind,
} from "./types.ts";

export interface Effect {
  t: "unlock" | "stat" | "special" | "air" | "airdmg" | "abyss" | "minerAbyss"
    | "gold" | "startGold" | "spark" | "ash" | "hearts" | "interest" | "discount" | "sell"
    | "stamps" | "stampPower" | "tileDmg" | "tileRange" | "miner" | "know" | "detect"
    | "ab" | "abPower" | "abTime" | "cd" | "radius" | "global";
  kind?: TowerKind;
  enemy?: EnemyKind;
  stat?: "dmg" | "rate" | "range" | "xp";
  per?: number;
  id?: "fire" | "bliz" | "dawn";
}

export interface ResearchNode {
  id: string;
  branch: string;
  name: string;
  text: string;
  max: number;
  cost: (level: number) => Cost;
  requires: { id: string; level: number }[];
  x: number;
  y: number;
  effect: Effect;
}

const z = (sparks = 0, ash = 0, vein = 0): Cost => ({ sparks, ash, vein });
const sparkGrow = (base: number, grow: number) => (n: number): Cost => z(Math.ceil(base * grow ** (n - 1)));

const NODES: ResearchNode[] = [];

function add(n: Omit<ResearchNode, "x" | "y"> & { col: number; row: number }): void {
  NODES.push({
    id: n.id, branch: n.branch, name: n.name, text: n.text, max: n.max, cost: n.cost,
    requires: n.requires, effect: n.effect, x: 80 + n.col * 214, y: 70 + n.row * 118,
  });
}

const UNLOCK: Record<TowerKind, number> = {
  spark: 6, miner: 12, muzzle: 14, chill: 16, venom: 18, needle: 20, blaze: 22,
  swarm: 22, bolt: 24, halo: 26, arc: 28, awl: 32, beam: 34,
};
const NATURAL = new Set<TowerKind>(["beam", "bolt", "halo", "swarm"]);
const ORDER: TowerKind[] = [
  "spark", "needle", "muzzle", "chill", "venom", "arc", "beam", "bolt", "blaze", "halo", "awl", "swarm", "miner",
];

function dmg2Cost(n: number): Cost {
  return z(Math.ceil(16 * 1.58 ** (n - 1)), n >= 4 ? n - 3 : 0, n >= 5 ? (n - 4) * 2 : 0);
}
function abyssCost(n: number): Cost {
  return z(Math.ceil(28 * 1.46 ** (n - 1)), n >= 6 ? Math.ceil(1.22 ** (n - 6)) : 0, n >= 3 ? Math.ceil(0.8 * n) : 0);
}
function specialCost(n: number): Cost {
  return z(Math.ceil(12 * 1.6 ** (n - 1)), 0, n >= 2 ? n : 0);
}

const SPECIAL_TEXT: Record<TowerKind, string> = {
  spark: "+8% урона по цели выше 70% здоровья за уровень.",
  needle: "+10 процентных пунктов пробития брони за уровень.",
  muzzle: "+0.10 клетки к взрыву за уровень.",
  chill: "+6 процентных пунктов замедления за уровень.",
  venom: "+15% к урону яда в секунду за уровень.",
  arc: "+1 прыжок за уровень.",
  beam: "+1 цель на линии за уровень.",
  bolt: "+10% урона по воздуху за уровень.",
  blaze: "+0.10 радиуса за уровень.",
  halo: "+0.08 радиуса за уровень.",
  awl: "+1 цель на линии за уровень.",
  swarm: "+1 снаряд за уровень.",
  miner: "+10 процентных пунктов шанса лишней руды за уровень.",
};

for (let col = 0; col < ORDER.length; col++) {
  const kind = ORDER[col];
  const name = TOWER_NAME[kind];
  const branch = name;
  const root = `${kind}.root`;
  if (kind === "miner") {
    add({
      id: root, branch, col, row: 0, name: "Открыть Жильника", max: 1,
      text: "Жильник ставится на жилу и добывает руду для древа.",
      cost: () => z(12), requires: [], effect: { t: "unlock", kind },
    });
    add({
      id: "miner.rate", branch, col, row: 1, name: "Темп добычи", max: 5,
      text: "+25% к скорости такта добычи за уровень.",
      cost: sparkGrow(8, 1.5), requires: [{ id: root, level: 1 }], effect: { t: "miner", per: 0.25 },
    });
    add({
      id: "miner.xp", branch, col, row: 2, name: "Опыт жилы", max: 3,
      text: "+15% опыта Жильника за уровень.",
      cost: sparkGrow(10, 1.55), requires: [{ id: root, level: 1 }], effect: { t: "stat", kind, stat: "xp", per: 0.15 },
    });
    add({
      id: "miner.special", branch, col, row: 3, name: "Богато", max: 3,
      text: SPECIAL_TEXT.miner,
      cost: specialCost, requires: [{ id: "miner.rate", level: 2 }], effect: { t: "special", kind },
    });
    add({
      id: "miner.abyss", branch, col, row: 4, name: "Бездна жилы", max: 20,
      text: "+8% к объёму такта за уровень. Цена растёт и просит руду с пеплом.",
      cost: abyssCost, requires: [{ id: "miner.rate", level: 5 }], effect: { t: "minerAbyss", per: 0.08 },
    });
    continue;
  }
  add({
    id: root, branch, col, row: 0,
    name: kind === "spark" ? "Закалка искры" : `Открыть: ${name}`,
    max: 1,
    text: kind === "spark"
      ? "Искра и так с вами. Закалка даёт +6% урона и открывает ветку."
      : `Открывает башню «${name}».`,
    cost: () => z(UNLOCK[kind]),
    requires: [],
    effect: kind === "spark" ? { t: "stat", kind, stat: "dmg", per: 0.06 } : { t: "unlock", kind },
  });
  add({
    id: `${kind}.dmg1`, branch, col, row: 1, name: `Урон I: ${name}`, max: 5,
    text: "+8% урона за уровень.",
    cost: sparkGrow(8, 1.55), requires: [{ id: root, level: 1 }], effect: { t: "stat", kind, stat: "dmg", per: 0.08 },
  });
  add({
    id: `${kind}.rate1`, branch, col, row: 2, name: `Темп I: ${name}`, max: 4,
    text: "+7% темпа за уровень.",
    cost: sparkGrow(8, 1.55), requires: [{ id: root, level: 1 }], effect: { t: "stat", kind, stat: "rate", per: 0.07 },
  });
  add({
    id: `${kind}.range1`, branch, col, row: 3, name: `Радиус I: ${name}`, max: 3,
    text: "+6% радиуса за уровень.",
    cost: sparkGrow(9, 1.5), requires: [{ id: `${kind}.dmg1`, level: 2 }], effect: { t: "stat", kind, stat: "range", per: 0.06 },
  });
  add({
    id: `${kind}.special`, branch, col, row: 4, name: `Особое: ${name}`, max: 3,
    text: SPECIAL_TEXT[kind],
    cost: specialCost, requires: [{ id: `${kind}.rate1`, level: 2 }], effect: { t: "special", kind },
  });
  add({
    id: `${kind}.xp`, branch, col, row: 5, name: `Опыт: ${name}`, max: 3,
    text: "+12% опыта этой башни за уровень.",
    cost: sparkGrow(10, 1.55), requires: [{ id: `${kind}.special`, level: 1 }], effect: { t: "stat", kind, stat: "xp", per: 0.12 },
  });
  if (NATURAL.has(kind)) {
    add({
      id: `${kind}.airdmg`, branch, col, row: 6, name: `По воздуху: ${name}`, max: 3,
      text: "+10% урона по ночницам за уровень.",
      cost: sparkGrow(14, 1.55), requires: [{ id: `${kind}.range1`, level: 2 }], effect: { t: "airdmg", kind, per: 0.1 },
    });
  } else {
    add({
      id: `${kind}.air`, branch, col, row: 6, name: `Небо: ${name}`, max: 1,
      text: "Башня начинает бить ночниц.",
      cost: () => z(16, 2, 0), requires: [{ id: `${kind}.range1`, level: 2 }], effect: { t: "air", kind },
    });
  }
  add({
    id: `${kind}.dmg2`, branch, col, row: 7, name: `Урон II: ${name}`, max: 8,
    text: "+7% урона за уровень. С 4 уровня просит пепел, с 5 — руду.",
    cost: dmg2Cost, requires: [{ id: `${kind}.dmg1`, level: 5 }], effect: { t: "stat", kind, stat: "dmg", per: 0.07 },
  });
  add({
    id: `${kind}.abyss`, branch, col, row: 8, name: `Бездна: ${name}`, max: 40,
    text: "+2.5% урона за уровень. Цена растёт почти без края.",
    cost: abyssCost, requires: [{ id: `${kind}.dmg2`, level: 4 }], effect: { t: "abyss", kind, per: 0.025 },
  });
}

add({ id: "econ.purse", branch: "Казна", col: 13, row: 0, name: "Кошель", max: 4, text: "+18 стартового золота за уровень.", cost: sparkGrow(7, 1.6), requires: [], effect: { t: "startGold", per: 18 } });
add({ id: "econ.gold", branch: "Казна", col: 13, row: 1, name: "Жадность ночи", max: 5, text: "+8% золота за уровень.", cost: sparkGrow(9, 1.55), requires: [{ id: "econ.purse", level: 1 }], effect: { t: "gold", per: 0.08 } });
add({ id: "econ.interest", branch: "Казна", col: 13, row: 2, name: "Процент", max: 4, text: "В конце волны +1.2% текущего золота за уровень, потолок 12%.", cost: sparkGrow(12, 1.6), requires: [{ id: "econ.gold", level: 2 }], effect: { t: "interest", per: 1 } });
add({ id: "econ.sell", branch: "Казна", col: 13, row: 3, name: "Скупка", max: 2, text: "+5 процентных пунктов к возврату с продажи за уровень.", cost: (n) => z(n === 1 ? 14 : 26), requires: [{ id: "econ.gold", level: 1 }], effect: { t: "sell", per: 0.05 } });
add({ id: "econ.spark", branch: "Казна", col: 13, row: 4, name: "Ночные искры", max: 4, text: "+10% искр награды за уровень.", cost: sparkGrow(10, 1.6), requires: [{ id: "econ.purse", level: 1 }], effect: { t: "spark", per: 0.1 } });
add({ id: "econ.ash", branch: "Казна", col: 13, row: 5, name: "Горсть пепла", max: 2, text: "+1 пепла за убитого Стража за уровень.", cost: (n) => z(n === 1 ? 18 : 28), requires: [{ id: "econ.spark", level: 2 }], effect: { t: "ash", per: 1 } });
add({ id: "econ.discount", branch: "Казна", col: 13, row: 6, name: "Первая скидка", max: 2, text: "−15% к первой боевой башне ночи за уровень.", cost: (n) => z(n === 1 ? 8 : 16), requires: [{ id: "econ.purse", level: 1 }], effect: { t: "discount", per: 0.15 } });
add({ id: "gate.hearts", branch: "Казна", col: 13, row: 7, name: "Крепче Врата", max: 4, text: "+4 силы Врат за уровень.", cost: sparkGrow(10, 1.55), requires: [{ id: "econ.purse", level: 1 }], effect: { t: "hearts", per: 4 } });
add({ id: "gate.hearts2", branch: "Казна", col: 13, row: 8, name: "Вторая кладка", max: 3, text: "+3 силы Врат за уровень. Просит пепел.", cost: (n) => z(Math.ceil(16 * 1.6 ** (n - 1)), n, 0), requires: [{ id: "gate.hearts", level: 4 }], effect: { t: "hearts", per: 3 } });

add({ id: "ab.fire", branch: "Умения", col: 14, row: 0, name: "Пожар", max: 1, text: "Открывает Пожар: 36 урона огнём в радиусе 2.2, перезарядка 42 с.", cost: () => z(18), requires: [{ id: "econ.purse", level: 1 }], effect: { t: "ab", id: "fire" } });
add({ id: "ab.fire2", branch: "Умения", col: 14, row: 1, name: "Жарче пожар", max: 4, text: "+28% урона Пожара за уровень.", cost: sparkGrow(12, 1.55), requires: [{ id: "ab.fire", level: 1 }], effect: { t: "abPower", id: "fire", per: 0.28 } });
add({ id: "ab.bliz", branch: "Умения", col: 14, row: 2, name: "Буран", max: 1, text: "Открывает Буран: замедление 40% на 4.2 с всем на карте, перезарядка 46 с.", cost: () => z(20), requires: [{ id: "econ.purse", level: 1 }], effect: { t: "ab", id: "bliz" } });
add({ id: "ab.bliz2", branch: "Умения", col: 14, row: 3, name: "Дольше буран", max: 3, text: "+0.55 с к Бурану за уровень.", cost: sparkGrow(12, 1.5), requires: [{ id: "ab.bliz", level: 1 }], effect: { t: "abTime", id: "bliz", per: 0.55 } });
add({ id: "ab.dawn", branch: "Умения", col: 14, row: 4, name: "Удар зари", max: 1, text: "Открывает Удар зари: 120 урона разрывом в радиусе 1.9, сопротивления этой атаки ×0.6, перезарядка 78 с.", cost: () => z(16, 2, 0), requires: [{ id: "ab.fire", level: 1 }, { id: "ab.bliz", level: 1 }], effect: { t: "ab", id: "dawn" } });
add({ id: "ab.dawn2", branch: "Умения", col: 14, row: 5, name: "Ярче заря", max: 4, text: "+24% урона Удара зари за уровень.", cost: sparkGrow(14, 1.55), requires: [{ id: "ab.dawn", level: 1 }], effect: { t: "abPower", id: "dawn", per: 0.24 } });
add({ id: "ab.cd", branch: "Умения", col: 14, row: 6, name: "Короче откат", max: 5, text: "Каждый уровень умножает перезарядку умений на 0.93.", cost: sparkGrow(11, 1.5), requires: [{ id: "ab.fire", level: 1 }], effect: { t: "cd", per: 1 } });
add({ id: "ab.radius", branch: "Умения", col: 14, row: 7, name: "Шире рука", max: 3, text: "Каждый уровень умножает радиус Пожара и Удара зари на 1.12.", cost: sparkGrow(12, 1.55), requires: [{ id: "ab.cd", level: 1 }], effect: { t: "radius", per: 1 } });

const CODEX: { id: EnemyKind; name: string }[] = [
  { id: "walker", name: "Пехота" }, { id: "runner", name: "Бегун" }, { id: "knight", name: "Латник" },
  { id: "healer", name: "Знахарь" }, { id: "splitter", name: "Дробильщик" }, { id: "shield", name: "Щитоносец" },
  { id: "flyer", name: "Ночница" }, { id: "shade", name: "Тень" }, { id: "caller", name: "Зов" }, { id: "boss", name: "Страж" },
];
add({ id: "codex.root", branch: "Бестиарий", col: 15, row: 0, name: "Бестиарий", max: 1, text: "Открывает листы тварей. +2% золота.", cost: () => z(8), requires: [], effect: { t: "gold", per: 0.02 } });
CODEX.forEach((c, i) => {
  add({
    id: `codex.${c.id}`, branch: "Бестиарий", col: 15, row: i + 1, name: `Знание: ${c.name}`, max: 5,
    text: "−4% здоровья этой твари и +6 процентных пунктов пробития брони по ней за уровень.",
    cost: sparkGrow(9, 1.52), requires: [{ id: "codex.root", level: 1 }],
    effect: { t: "know", enemy: c.id, per: 0.04 },
  });
});
add({ id: "codex.eye", branch: "Бестиарий", col: 15, row: 11, name: "Зоркость", max: 1, text: "Тени берутся в прицел всеми башнями.", cost: () => z(22, 1, 0), requires: [{ id: "codex.shade", level: 3 }], effect: { t: "detect" } });

add({ id: "mod.stamp", branch: "Чертёж", col: 16, row: 0, name: "Клеймо", max: 3, text: "+1 клеймо за ночь. Клеймо стоит 42 золота и кладёт плитку на пустырь.", cost: sparkGrow(12, 1.7), requires: [], effect: { t: "stamps", per: 1 } });
add({ id: "mod.power", branch: "Чертёж", col: 16, row: 1, name: "Ярче плитки", max: 4, text: "+0.05 к долям урона, радиуса и темпа плитки и +0.08 к долям опыта и дани за уровень.", cost: sparkGrow(10, 1.55), requires: [{ id: "mod.stamp", level: 1 }], effect: { t: "stampPower", per: 1 } });
add({ id: "mod.tile", branch: "Чертёж", col: 16, row: 2, name: "Тёплая плитка", max: 4, text: "+4% урона башне на бонусной плитке за уровень.", cost: sparkGrow(11, 1.55), requires: [{ id: "mod.power", level: 1 }], effect: { t: "tileDmg", per: 0.04 } });
add({ id: "mod.long", branch: "Чертёж", col: 16, row: 3, name: "Длинная плитка", max: 3, text: "+4% радиуса башне на бонусной плитке за уровень.", cost: sparkGrow(11, 1.55), requires: [{ id: "mod.tile", level: 1 }], effect: { t: "tileRange", per: 0.04 } });
add({ id: "mod.purse", branch: "Чертёж", col: 16, row: 4, name: "Ночная плитка", max: 3, text: "+8 стартового золота за уровень.", cost: sparkGrow(9, 1.5), requires: [{ id: "mod.stamp", level: 1 }], effect: { t: "startGold", per: 8 } });
add({ id: "mod.bounty", branch: "Чертёж", col: 16, row: 5, name: "Щедрая клетка", max: 3, text: "+5% золота за уровень.", cost: sparkGrow(12, 1.55), requires: [{ id: "mod.power", level: 1 }], effect: { t: "gold", per: 0.05 } });

add({
  id: "night.abyss", branch: "Бездна", col: 17, row: 2, name: "Ночь без края", max: 50,
  text: "+2% урона всем башням за уровень. Цена растёт искрами, пеплом и рудой.",
  cost: (n) => z(Math.ceil(40 * 1.42 ** (n - 1)), Math.ceil(1.3 ** (n - 1)), n),
  requires: [{ id: "econ.ash", level: 1 }, { id: "gate.hearts", level: 2 }],
  effect: { t: "global", per: 0.02 },
});

export const RESEARCH: readonly ResearchNode[] = NODES;
const BY_ID = new Map(NODES.map((n) => [n.id, n]));
export function nodeById(id: string): ResearchNode | null {
  return BY_ID.get(id) ?? null;
}

export function freshBonuses(): Bonuses {
  const b: Bonuses = {
    dmg: towerRec(() => 0), rate: towerRec(() => 0), range: towerRec(() => 0), xp: towerRec(() => 0),
    special: towerRec(() => 0), abyss: towerRec(() => 0), air: towerRec(() => false), airDmg: towerRec(() => 0),
    unlocked: towerRec(() => false),
    gold: 0, startGold: 0, spark: 0, ashFlat: 0, hearts: 0, interest: 0, discount: 0, sell: 0,
    stamps: 0, stampPower: 0, tileDmg: 0, tileRange: 0, miner: 0, minerAbyss: 0,
    knowHp: enemyRec(() => 0), knowPen: enemyRec(() => 0), detectShades: false,
    abFire: false, abBliz: false, abDawn: false, firePower: 0, blizTime: 0, dawnPower: 0,
    cdSteps: 0, radiusSteps: 0, globalDmg: 0,
  };
  b.unlocked.spark = true;
  return b;
}

export function compile(meta: Meta): Bonuses {
  const b = freshBonuses();
  for (const node of NODES) {
    const lv = meta.nodes[node.id] ?? 0;
    if (lv <= 0) continue;
    const e = node.effect;
    const per = (e.per ?? 0) * lv;
    const kind = e.kind;
    if (e.t === "unlock" && kind) b.unlocked[kind] = true;
    else if (e.t === "stat" && kind && e.stat) b[e.stat][kind] += per;
    else if (e.t === "special" && kind) b.special[kind] += lv;
    else if (e.t === "air" && kind) b.air[kind] = true;
    else if (e.t === "airdmg" && kind) b.airDmg[kind] += per;
    else if (e.t === "abyss" && kind) b.abyss[kind] += per;
    else if (e.t === "minerAbyss") b.minerAbyss += per;
    else if (e.t === "gold") b.gold += per;
    else if (e.t === "startGold") b.startGold += per;
    else if (e.t === "spark") b.spark += per;
    else if (e.t === "ash") b.ashFlat += per;
    else if (e.t === "hearts") b.hearts += per;
    else if (e.t === "interest") b.interest += lv;
    else if (e.t === "discount") b.discount += per;
    else if (e.t === "sell") b.sell += per;
    else if (e.t === "stamps") b.stamps += lv;
    else if (e.t === "stampPower") b.stampPower += lv;
    else if (e.t === "tileDmg") b.tileDmg += per;
    else if (e.t === "tileRange") b.tileRange += per;
    else if (e.t === "miner") b.miner += per;
    else if (e.t === "know" && e.enemy) { b.knowHp[e.enemy] += (e.per ?? 0) * lv; b.knowPen[e.enemy] += 0.06 * lv; }
    else if (e.t === "detect") b.detectShades = true;
    else if (e.t === "ab" && e.id === "fire") b.abFire = true;
    else if (e.t === "ab" && e.id === "bliz") b.abBliz = true;
    else if (e.t === "ab" && e.id === "dawn") b.abDawn = true;
    else if (e.t === "abPower" && e.id === "fire") b.firePower += per;
    else if (e.t === "abPower" && e.id === "dawn") b.dawnPower += per;
    else if (e.t === "abTime") b.blizTime += per;
    else if (e.t === "cd") b.cdSteps += lv;
    else if (e.t === "radius") b.radiusSteps += lv;
    else if (e.t === "global") b.globalDmg += per;
  }
  for (const k of Object.keys(b.knowHp) as EnemyKind[]) b.knowHp[k] = Math.min(0.6, b.knowHp[k]);
  b.discount = Math.min(0.6, b.discount);
  b.sell = Math.min(0.2, b.sell);
  return b;
}

export function canBuy(meta: Meta, id: string): { ok: boolean; reason: string; cost: Cost | null } {
  const node = BY_ID.get(id);
  if (!node) return { ok: false, reason: "Нет такого узла.", cost: null };
  const lv = meta.nodes[id] ?? 0;
  if (lv >= node.max) return { ok: false, reason: "Уровень максимальный.", cost: null };
  for (const r of node.requires) {
    const have = meta.nodes[r.id] ?? 0;
    if (have < r.level) {
      const need = BY_ID.get(r.id);
      return { ok: false, reason: `Нужно: ${need?.name ?? r.id} ур. ${r.level}.`, cost: null };
    }
  }
  const cost = node.cost(lv + 1);
  if (meta.sparks < cost.sparks || meta.ash < cost.ash || meta.vein < cost.vein) {
    return { ok: false, reason: "Не хватает искр, пепла или руды.", cost };
  }
  return { ok: true, reason: "", cost };
}

export function buyNode(meta: Meta, id: string): { ok: boolean; reason: string } {
  const gate = canBuy(meta, id);
  if (!gate.ok || !gate.cost) return { ok: false, reason: gate.reason };
  meta.sparks -= gate.cost.sparks;
  meta.ash -= gate.cost.ash;
  meta.vein -= gate.cost.vein;
  meta.nodes[id] = (meta.nodes[id] ?? 0) + 1;
  return { ok: true, reason: "" };
}

export function researchCount(): number {
  return NODES.length;
}
