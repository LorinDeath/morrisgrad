// Рукотворные ночи. Сетки совпадают с docs/eternal-watch-v2-DESIGN.md.
import type { Cell, ModKind } from "./types.ts";

export interface Route { pts: Cell[]; length: number; gate: Cell }

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  waves: number;
  difficulty: number;
  goldBonus: number;
  heartBonus: number;
  star3: string;
  grid: string[];
  cols: number;
  rows: number;
  spawns: Cell[];
  gates: Cell[];
  ground: Route[];
  air: Route[];
}

const WALK = new Set(["=", "S", "T", "U", "G", "H"]);
const BUILD = new Set([".", "+", "*", "~", "^", "$"]);
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function cellChar(map: MapDef, x: number, y: number): string {
  if (y < 0 || x < 0 || y >= map.rows || x >= map.cols) return "#";
  return map.grid[y][x] ?? "#";
}

export function baseMod(ch: string): ModKind | null {
  if (ch === "+") return "dmg";
  if (ch === "*") return "range";
  if (ch === "~") return "rate";
  if (ch === "^") return "xp";
  if (ch === "$") return "bounty";
  return null;
}

export function tileBuildable(ch: string, kind: "tower" | "miner"): boolean {
  if (kind === "miner") return ch === "v";
  return BUILD.has(ch);
}

function bfs(grid: string[], sx: number, sy: number): Cell[] | null {
  const h = grid.length;
  const w = grid[0].length;
  const key = (x: number, y: number) => y * w + x;
  const prev = new Map<number, number>();
  const q: number[] = [];
  const start = key(sx, sy);
  q.push(start);
  prev.set(start, -1);
  let found = -1;
  while (q.length) {
    const cur = q.shift()!;
    const x = cur % w;
    const y = (cur / w) | 0;
    const ch = grid[y][x];
    if ((ch === "G" || ch === "H") && cur !== start) { found = cur; break; }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny);
      if (prev.has(nk)) continue;
      if (!WALK.has(grid[ny][nx])) continue;
      prev.set(nk, cur);
      q.push(nk);
    }
  }
  if (found < 0) return null;
  const cells: Cell[] = [];
  let c = found;
  while (c !== -1) {
    cells.push({ x: (c % w) + 0.5, y: ((c / w) | 0) + 0.5 });
    const p = prev.get(c);
    if (p === undefined) break;
    c = p;
  }
  cells.reverse();
  return cells;
}

function toRoute(pts: Cell[]): Route {
  return {
    pts,
    length: Math.max(0, pts.length - 1),
    gate: { x: pts[pts.length - 1].x - 0.5, y: pts[pts.length - 1].y - 0.5 },
  };
}

export function along(route: Route, progress: number): Cell {
  const pts = route.pts;
  if (!pts.length) return { x: 0.5, y: 0.5 };
  if (progress <= 0 || pts.length === 1) return pts[0];
  let left = Math.min(Math.max(0, progress), route.length);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === pts.length - 2) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  return pts[pts.length - 1];
}

interface Seed {
  id: string;
  name: string;
  blurb: string;
  waves: number;
  difficulty: number;
  goldBonus: number;
  heartBonus: number;
  star3: string;
  grid: string;
}

const STAR = "Ни одного прорыва и не меньше 80% силы Врат.";
const BOTH = "Удержать оба Врат: ни одного прорыва и 80% силы.";

const SEEDS: Seed[] = [
  {
    id: "spark-path", name: "Первая искра", waves: 5, difficulty: 1, goldBonus: 40, heartBonus: 6,
    blurb: "Короткая тропа у первых Врат. Здесь учатся ставить Искру.",
    star3: STAR,
    grid: `
################
#..............#
#S=======......#
#.......=..+...#
#...^...=......#
#.......=...*..#
#.......=......#
#.......=====G.#
#........v.....#
################`,
  },
  {
    id: "knee", name: "Колено серпантина", waves: 6, difficulty: 2, goldBonus: 30, heartBonus: 4,
    blurb: "Тропа ломает колено между скалами. Башни любят внешний угол.",
    star3: STAR,
    grid: `
################
#S====.........#
#....=.........#
#..##=.+.......#
#..#.=.........#
#....========..#
#...........=..#
#........~..=..#
#.v.........=..#
#.......G====..#
################`,
  },
  {
    id: "two-portals", name: "Два портала", waves: 6, difficulty: 3, goldBonus: 24, heartBonus: 4,
    blurb: "Два входа сходятся к одним Вратам. Не оставляйте нижний портал без глаз.",
    star3: "Удержать единственные Врата от обоих порталов: ни одного прорыва и 80% силы.",
    grid: `
################
#S=======......#
#.......=...v..#
#...+...=......#
#.......=......#
#.......=====G.#
#...*...=......#
#.......=......#
#T=======..$...#
#..............#
################`,
  },
  {
    id: "rocks", name: "Каменная гряда", waves: 7, difficulty: 4, goldBonus: 20, heartBonus: 4,
    blurb: "Скалы режут площадки. Ставьте туда, где тропа ещё видна.",
    star3: STAR,
    grid: `
#################
#...............#
#S===.#.*.#.....#
#...=.#...#...=G#
#...=.##......=.#
#.+.=v....##..=.#
#...=...##..~.=.#
#...=.........=.#
#...===========.#
#...............#
#################`,
  },
  {
    id: "veins", name: "Жилы под ночью", waves: 7, difficulty: 5, goldBonus: 16, heartBonus: 2,
    blurb: "Под тропой три жилы. Жильник кормит древо, башни кормят Врата.",
    star3: "Ночь без прорыва и 80% силы. Руда с жил для звезды не нужна.",
    grid: `
################
#..............#
#S=============#
#...v...v.....=#
#.....+.......=#
#..============#
#..=.......v...#
#..=========G..#
#........^.....#
################`,
  },
  {
    id: "tiles", name: "Плитки зари", waves: 7, difficulty: 6, goldBonus: 16, heartBonus: 2,
    blurb: "Вдоль серпантина лежат плитки урона, радиуса, темпа, опыта и дани.",
    star3: STAR,
    grid: `
################
#.===========S.#
#.=............#
#.=.+.*.~.^.$..#
#.=............#
#.=..+...*.....#
#.=....v.......#
#.=............#
#.===========G.#
################`,
  },
  {
    id: "serpent", name: "Долгий серпантин", waves: 8, difficulty: 7, goldBonus: 10, heartBonus: 2,
    blurb: "Длинная петля. Кто стоит у колена, видит тропу дважды.",
    star3: STAR,
    grid: `
##################
#S=======........#
#.....+.=..##....#
#.......=..#.....#
#...=====........#
#...=.....*......#
#...=............#
#...===========..#
#.....~.......=..#
#.v.........^.=..#
#.......G======..#
##################`,
  },
  {
    id: "runners", name: "Ночь бегунов", waves: 8, difficulty: 8, goldBonus: 10, heartBonus: 2,
    blurb: "Три прямых плеча. Бегуны проскакивают короткое плечо, если его не перекрыть.",
    star3: STAR,
    grid: `
################
#S=============#
#...~...+.....=#
#.............=#
#==============#
#=.............#
#=.....*...v...#
#=.............#
#=============G#
################`,
  },
  {
    id: "twin-gates", name: "Две тропы", waves: 8, difficulty: 9, goldBonus: 8, heartBonus: 2,
    blurb: "Два портала и двое Врат. Прорыв в любые Врата бьёт по одной силе.",
    star3: BOTH,
    grid: `
##################
#S=======........#
#.......=........#
#...+...=...~....#
#.......=........#
#.......========G#
#.......=........#
#...*...=.##.....#
#.....v.=...$....#
#.......=........#
#T==============H#
##################`,
  },
  {
    id: "shields", name: "Щиты у стены", waves: 9, difficulty: 10, goldBonus: 8, heartBonus: 1,
    blurb: "У стены идут щитоносцы. Гроза снимает щит быстрее стали.",
    star3: STAR,
    grid: `
################
#..............#
#S=====....~...#
#.....=.+......#
#..#..=......=G#
#..#..=..#...=.#
#.....=..##..=.#
#...*.=......=.#
#.....========.#
#..............#
#######v########`,
  },
  {
    id: "sky", name: "Короткое небо", waves: 9, difficulty: 11, goldBonus: 6, heartBonus: 1,
    blurb: "Земля идёт вдоль края, ночницы режут двор по прямой. Нужны башни по воздуху.",
    star3: "Не отдать ночницам ни одних Врат и сохранить 80% силы.",
    grid: `
################
#S==...........#
#..=.....v.....#
#..=.+.........#
#..=....*......#
#..=.......~...#
#..=..^........#
#..=...........#
#..===========G#
################`,
  },
  {
    id: "shades", name: "Тени серпантина", waves: 9, difficulty: 12, goldBonus: 6, heartBonus: 1,
    blurb: "Тени не берутся в прицел, пока их не раскроет Ореол, взрыв или Зоркость.",
    star3: "Не пустить тени и сохранить 80% силы.",
    grid: `
################
#..............#
#S.......*.....#
#=..##..#..#...#
#=.............#
#==============#
#.............=#
#...#...#..#..=#
#.....+.....^.=#
#..v..........G#
################`,
  },
  {
    id: "fork", name: "Развилка", waves: 10, difficulty: 13, goldBonus: 4, heartBonus: 1,
    blurb: "Верхний и нижний порталы сходятся к одним Вратам.",
    star3: STAR,
    grid: `
##################
#................#
#S=============..#
#.............=..#
#...+......~..=..#
#.............=..#
#.............==G#
#.......*.....=..#
#...........$.=..#
#T=============..#
#.....v..........#
##################`,
  },
  {
    id: "ore-yard", name: "Рудный двор", waves: 10, difficulty: 14, goldBonus: 4, heartBonus: 0,
    blurb: "Четыре жилы на длинном дворе. Руда копится, если ночь вообще стоит.",
    star3: STAR,
    grid: `
#################
#S==============#
#..............=#
#..v....v...v..=#
#..............=#
#....+.......~.=#
#.....v........=#
#.........*....=#
#..............=#
#.G=============#
#################`,
  },
  {
    id: "ledge", name: "Узкий карниз", waves: 10, difficulty: 11, goldBonus: 12, heartBonus: 8,
    blurb: "Почти вся скала глухая. Несколько плиток смотрят прямо на тропу.",
    star3: "На узком карнизе: ни одного прорыва и 80% силы.",
    grid: `
##################
##################
##+##.##~#..##v###
#S==============G#
##.##*##.##^##.###
##..#.##.#####..##
##################
##################`,
  },
  {
    id: "healers", name: "Знахари", waves: 11, difficulty: 16, goldBonus: 2, heartBonus: 0,
    blurb: "Знахари поднимают соседей. Тишина и быстрый урон важнее толпы слабых башен.",
    star3: STAR,
    grid: `
################
#S======.......#
#......=.......#
#..+...=.......#
#......=..*....#
#T===..=.......#
#...====.......#
#......=....^..#
#....~.=.v.....#
#......=.......#
#......=======G#
################`,
  },
  {
    id: "spiral", name: "Спираль искры", waves: 11, difficulty: 17, goldBonus: 0, heartBonus: 0,
    blurb: "Спираль затягивает к Вратам в сердце двора. Внешний край длинный.",
    star3: STAR,
    grid: `
################
#S=============#
#........^....=#
#.==========..=#
#.=........=..=#
#.=.+......=..=#
#.=.....*..=..=#
#.=........=..=#
#.=........=..=#
#.=..G======..=#
#.=...~.......=#
#.=....v......=#
#.=============#
################`,
  },
  {
    id: "teeth", name: "Зубцы", waves: 12, difficulty: 18, goldBonus: 0, heartBonus: 0,
    blurb: "Прямая тропа, а по бокам зубцы скал. Стрелять можно из карманов между ними.",
    star3: STAR,
    grid: `
##################
#................#
#...+...*.....$..#
#................#
#..#.#.#.#.#.#...#
#..#.#.#.#.#.#...#
#S==============G#
#..#.#.#.#.#.#...#
#..#.#.#.#.#.#...#
#................#
#.....v...^.~....#
##################`,
  },
  {
    id: "two-doors", name: "Двойные врата", waves: 12, difficulty: 19, goldBonus: 0, heartBonus: 2,
    blurb: "Двое Врат на разной высоте. Каждая тропа кормит свой выход.",
    star3: BOTH,
    grid: `
##################
#S=====..........#
#.....=..........#
#..+..=...~......#
#.....=..........#
#.....==========G#
#.....=.$........#
#..*..=..........#
#.....==========H#
#.....=..........#
#T=====...^..v...#
##################`,
  },
  {
    id: "callers", name: "Зов во тьме", waves: 12, difficulty: 20, goldBonus: 0, heartBonus: 0,
    blurb: "Зов тащит за собой прислужников. Не давайте ему идти спокойно.",
    star3: STAR,
    grid: `
#################
#...............#
#S=======.......#
#.......=....v..#
#.....*.=.......#
#...##..=..#..$.#
#.......=...#...#
#..+....=.~.#...#
#.......=.......#
#.......=======G#
#...............#
########^########`,
  },
  {
    id: "storm", name: "Буря плиток", waves: 13, difficulty: 21, goldBonus: 4, heartBonus: 0,
    blurb: "Плитки разбросаны по буре. Кто стоит на них, стреляет иначе.",
    star3: STAR,
    grid: `
##################
#................#
#S====..##+......#
#....=..#...====G#
#..+.=.*....=....#
#....=...^..=....#
#....=......=.$..#
#....=.~....=....#
#...v=......=.*..#
#....========..v.#
#................#
##################`,
  },
  {
    id: "ash-yard", name: "Пепельный двор", waves: 13, difficulty: 22, goldBonus: 0, heartBonus: 0,
    blurb: "Двор, где Страж ночи оставляет пепел. Пепел кормит верх древа.",
    star3: "Снять Стража, не отдав никого и сохранив 80% силы.",
    grid: `
##################
#................#
#S===============#
#.......*.......=#
#..+..##..##..v.=#
#...............=#
#...=============#
#...=............#
#...=.^.##..#~...#
#...=............#
#...===========G.#
#......v..$......#
##################`,
  },
  {
    id: "predawn", name: "Предрассветный ход", waves: 14, difficulty: 23, goldBonus: 0, heartBonus: 0,
    blurb: "Длинный ход перед рассветом. Ошибок тропа уже не прощает.",
    star3: STAR,
    grid: `
####################
#S=====............#
#.....=..*......##.#
#..+..=............#
#.....=========....#
#.............=..v.#
#..........~..=....#
#.............=....#
#...===========.$..#
#.v.=.....###......#
#...=...^..........#
#...==============G#
####################`,
  },
  {
    id: "finale", name: "Врата искры", waves: 15, difficulty: 24, goldBonus: 6, heartBonus: 2,
    blurb: "Два портала, двое Врат, жилы и плитки. Последняя волна приводит Стража ночи.",
    star3: "Снять Стража ночи, не отдав никого и сохранив 80% силы Врат.",
    grid: `
####################
#S=======..........#
#.......=..........#
#..+....=...^......#
#...#...=.#...+....#
#....~..=..........#
#.......==========G#
#.....#.=..........#
#..*....=.#.$..#...#
#.......=..........#
#.....v.==========H#
#.......=..........#
#T=======.v...*.v..#
####################`,
  },
];

function build(seed: Seed): MapDef {
  const grid = seed.grid.trim().split("\n").map((r) => r.trim());
  const rows = grid.length;
  const cols = grid[0].length;
  if (grid.some((r) => r.length !== cols)) throw new Error(`${seed.id}: рваная сетка`);
  const spawns: Cell[] = [];
  const gates: Cell[] = [];
  let buildN = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = grid[y][x];
    if (!"#.=STUGH+*~^$v".includes(c)) throw new Error(`${seed.id}: символ ${c}`);
    if (c === "S" || c === "T" || c === "U") spawns.push({ x, y });
    if (c === "G" || c === "H") gates.push({ x, y });
    if (BUILD.has(c)) buildN++;
  }
  if (spawns.length < 1 || gates.length < 1) throw new Error(`${seed.id}: нет портала или Врат`);
  if (buildN < 8) throw new Error(`${seed.id}: мало площадок ${buildN}`);
  const ground: Route[] = [];
  const air: Route[] = [];
  const usedGates = new Set<string>();
  for (const s of spawns) {
    const cells = bfs(grid, s.x, s.y);
    if (!cells) throw new Error(`${seed.id}: портал ${s.x},${s.y} не доходит`);
    const route = toRoute(cells);
    ground.push(route);
    const g = route.gate;
    usedGates.add(g.x + "," + g.y);
    const a = { x: s.x + 0.5, y: s.y + 0.5 };
    const b = { x: g.x + 0.5, y: g.y + 0.5 };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    air.push({ pts: [a, b], length: len, gate: g });
  }
  for (const g of gates) {
    if (!usedGates.has(g.x + "," + g.y)) throw new Error(`${seed.id}: Врата ${g.x},${g.y} никому не ближайшие`);
  }
  return { ...seed, grid, cols, rows, spawns, gates, ground, air };
}

export const MAPS: MapDef[] = SEEDS.map(build);
export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

export function mapById(id: string): MapDef | null {
  return MAP_BY_ID[id] ?? null;
}

export function campaignAnchor(index: number): Cell {
  const col = index % 6;
  const row = Math.floor(index / 6);
  const ox = row % 2 === 0 ? 0 : 36;
  return { x: 100 + col * 150 + ox, y: 90 + row * 128 };
}

export const WORLD_W = 1040;
export const WORLD_H = 640;

export function goalsOf(map: MapDef): [string, string, string] {
  return [
    "Пройти все волны, пока Врата держатся.",
    "Закончить ночь, сохранив не меньше половины силы Врат.",
    map.star3,
  ];
}

export function unlockedIndex(stars: Record<string, number>): number {
  let n = 0;
  for (let i = 0; i < MAPS.length; i++) {
    if (i === 0 || (stars[MAPS[i - 1].id] ?? 0) >= 1) n = i;
    else break;
  }
  return n;
}
