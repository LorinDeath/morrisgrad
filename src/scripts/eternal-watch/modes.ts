// Режимы ночи. Симуляция кампании не меняется, пока mode остаётся campaign или endless.
import { buildMap, cloneMap, registerMap, type MapDef, type Route } from "./maps.ts";
import { freshBonuses, compile } from "./research.ts";
import {
  MODE_IDS, TOWER_KINDS,
  type Bonuses, type Enemy, type Meta, type ModeId, type Run,
} from "./types.ts";

export const WALL_COST = 6;

export interface Mutator { id: string; name: string; text: string }

export const MUTATORS: readonly Mutator[] = [
  { id: "haste", name: "Скорый шаг", text: "Враги быстрее на 20%." },
  { id: "hide", name: "Толстая шкура", text: "У всех врагов +3 брони." },
  { id: "fury", name: "Жаркая ночь", text: "Башни наносят на 18% больше урона." },
  { id: "gold", name: "Золотая жила", text: "Золото с убийств и волн +40%." },
  { id: "rush", name: "Частый выводок", text: "Враги выходят из портала чаще." },
  { id: "glass", name: "Хрупкие", text: "У врагов на 15% меньше здоровья." },
  { id: "reach", name: "Дальняя стража", text: "Радиус башен +12%." },
  { id: "tempo", name: "Ярость", text: "Темп башен +15%." },
];

export function mutatorById(id: string): Mutator | null {
  return MUTATORS.find((m) => m.id === id) ?? null;
}

export interface ModeInfo {
  id: Exclude<ModeId, "campaign" | "endless">;
  name: string;
  icon: string;
  summary: string;
  rules: string;
  research: string;
  score: string;
}

export const PLAY_MODES: readonly ModeInfo[] = [
  {
    id: "blitz", name: "Блиц", icon: "mode_blitz",
    summary: "Волны идут без паузы, портал выпускает тварей чаще.",
    rules: "Между волнами нет обычной передышки: следующая начинается почти сразу после выхода последней твари, а интервал появления короче. Пауза игрока по-прежнему останавливает ночь. Древо между ночами действует.",
    research: "Древо действует.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "boss", name: "Парад боссов", icon: "mode_boss_parade",
    summary: "Из портала выходят только Стражи. С седьмой волны их двое.",
    rules: "Каждая волна — Страж ночи со своими фазами. С седьмой волны в волне два Стража. Обычной пехоты в очереди нет: пехота и латники появляются только как свита фаз. Древо действует. Золота на старте больше, чтобы успеть поставить ряд.",
    research: "Древо действует.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "five", name: "Пять башен", icon: "mode_five_towers",
    summary: "На поле не больше пяти башен, считая жильник.",
    rules: "Шестая башня не встаёт, пока не продадите одну из пяти. Ранги, умения и клейма работают как в кампании. Древо действует.",
    research: "Древо действует.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "maze", name: "Лабиринт", icon: "mode_labyrinth",
    summary: "Пустой двор. Стены и башни задают тропу, но Врата нельзя отрезать.",
    rules: "Враги ищут путь по свободным клеткам. Стена стоит 6 золота. Башня тоже занимает клетку. Поставить преграду нельзя, если хотя бы один портал или уже вышедшая тварь потеряет путь к Вратам. Ночницы по-прежнему летят напрямик. Первая волна выходит через 14 секунд. Древо действует.",
    research: "Древо действует.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "fog", name: "Туман", icon: "mode_fog",
    summary: "Видно только у Ореола и у Врат. В тумане башни не стреляют.",
    rules: "Клетки вне света Ореола и вне круга у Врат скрыты. Башни выбирают цель только в видимом круге. Ореол в этом режиме открыт даже без ветки. Буран накрывает всю ночь. Пожар и Удар зари бьют только видимое. Древо действует на остальные башни.",
    research: "Древо действует. Ореол открыт в этом режиме сразу.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "dual", name: "Два потока", icon: "mode_two_streams",
    summary: "Два портала выпускают волну по очереди в одни Врата.",
    rules: "Твари чередуют верхний и нижний вход. Оба потока надо перекрыть. Древо действует.",
    research: "Древо действует.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "life", name: "Одна жизнь", icon: "mode_one_life",
    summary: "Любой прорыв гасит Врата. Сила Врат всегда равна единице.",
    rules: "Даже пехота, дошедшая до Врат, кончает ночь. Древо не прибавляет силу Врат: она всегда 1. Урон, темп, радиус и экономика из древа действуют. Тропа длинная, золота на старте много.",
    research: "Древо действует на башни и золото. Сила Врат всегда 1.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "daily", name: "Испытание дня", icon: "mode_daily",
    summary: "Один двор и два модификатора на дату. У всех игроков они одинаковые.",
    rules: "Дата берётся по всемирному времени, поэтому двор не зависит от часового пояса. Древо в испытании дня не действует: все башни открыты с базовыми числами, без искр, пепла и руды на бонусы. Два модификатора дня видны до старта. Рекорд пишется отдельно на каждую дату.",
    research: "Древо не действует. У всех одни и те же башни и числа.",
    score: "Рекорд дня — число полностью разобранных волн.",
  },
  {
    id: "chaos", name: "Хаос", icon: "mode_chaos",
    summary: "Каждая пятая волна приносит случайный модификатор. Они копятся.",
    rules: "На волнах 5, 10 и 15 на ночь ложится новый модификатор и остаётся до конца. Имя и смысл показываются плашкой. Древо действует.",
    research: "Древо действует.",
    score: "Рекорд — число полностью разобранных волн.",
  },
  {
    id: "sandbox", name: "Песочница", icon: "mode_sandbox",
    summary: "Золото не кончается. Можно пробовать башни. Рекорды не пишутся.",
    rules: "Все башни и три умения ночи открыты. Древо усиливает числа, если узлы уже куплены. Прорыв не гасит Врата. Искры, пепел и руда за эту ночь не начисляются. Рекорд не ведётся. Кнопка «Закончить» закрывает опыт.",
    research: "Древо действует. Наград и рекордов нет.",
    score: "Рекорды не пишутся.",
  },
];

export function modeInfo(id: string): ModeInfo | null {
  return PLAY_MODES.find((m) => m.id === id) ?? null;
}

export function isPlayMode(id: string): id is ModeInfo["id"] {
  return PLAY_MODES.some((m) => m.id === id);
}

const STAR = "Ни одного прорыва и не меньше 80% силы Врат.";

function rows(lines: string[]): string {
  const w = lines[0]?.length ?? 0;
  if (!w || lines.some((r) => r.length !== w)) throw new Error("рваная сетка режима");
  return lines.join("\n");
}

const SERPENT = rows([
  "##################",
  "#S=======........#",
  "#.....+.=..##....#",
  "#.......=..#.....#",
  "#...=====........#",
  "#...=.....*......#",
  "#...=............#",
  "#...===========..#",
  "#.....~.......=..#",
  "#.v.........^.=..#",
  "#.......G======..#",
  "##################",
]);

const TILES = rows([
  "################",
  "#.===========S.#",
  "#.=............#",
  "#.=.+.*.~.^.$..#",
  "#.=............#",
  "#.=..+...*.....#",
  "#.=....v.......#",
  "#.=............#",
  "#.===========G.#",
  "################",
]);

const KNEE = rows([
  "################",
  "#S====.........#",
  "#....=.........#",
  "#..##=.+.......#",
  "#..#.=.........#",
  "#....========..#",
  "#...........=..#",
  "#........~..=..#",
  "#.v.........=..#",
  "#.......G====..#",
  "################",
]);

const DUAL = rows([
  "################",
  "#S=======......#",
  "#.......=...v..#",
  "#...+...=......#",
  "#.......=......#",
  "#.......=====G.#",
  "#...*...=......#",
  "#.......=......#",
  "#T=======..$...#",
  "#..............#",
  "################",
]);

const ROCKS = rows([
  "#################",
  "#...............#",
  "#S===.#.*.#.....#",
  "#...=.#...#...=G#",
  "#...=.##......=.#",
  "#.+.=v....##..=.#",
  "#...=...##..~.=.#",
  "#...=.........=.#",
  "#...===========.#",
  "#...............#",
  "#################",
]);

function makeMaze(): MapDef {
  const cols = 16;
  const rowsN = 11;
  const grid: string[] = [];
  for (let y = 0; y < rowsN; y++) {
    let row = "";
    for (let x = 0; x < cols; x++) {
      const edge = y === 0 || x === 0 || y === rowsN - 1 || x === cols - 1;
      if (edge) row += "#";
      else if (y === 5 && x === 1) row += "S";
      else if (y === 5 && x === cols - 2) row += "G";
      else row += ".";
    }
    grid.push(row);
  }
  const pts = [];
  for (let x = 1; x <= cols - 2; x++) pts.push({ x: x + 0.5, y: 5.5 });
  const route: Route = { pts, length: pts.length - 1, gate: { x: cols - 2, y: 5 } };
  const air: Route = { pts: [pts[0], pts[pts.length - 1]], length: pts.length - 1, gate: { ...route.gate } };
  return {
    id: "mode-maze", name: "Лабиринт", blurb: "Пустой двор. Сложите тропу сами.",
    waves: 10, difficulty: 3, goldBonus: 48, heartBonus: 6, star3: STAR,
    grid, cols, rows: rowsN, spawns: [{ x: 1, y: 5 }], gates: [{ x: cols - 2, y: 5 }],
    ground: [route], air: [air],
  };
}

const REGISTERED = new Map<string, MapDef>();

function buildLookup(id: string): MapDef | null {
  const grids: Record<string, { name: string; blurb: string; waves: number; difficulty: number; goldBonus: number; heartBonus: number; grid: string }> = {
    "mode-blitz": { name: "Блиц", blurb: "Волны без передышки.", waves: 12, difficulty: 3, goldBonus: 70, heartBonus: 8, grid: SERPENT },
    "mode-boss": { name: "Парад боссов", blurb: "Только Стражи.", waves: 8, difficulty: 3, goldBonus: 130, heartBonus: 14, grid: SERPENT },
    "mode-five": { name: "Пять башен", blurb: "Не больше пяти башен.", waves: 10, difficulty: 4, goldBonus: 110, heartBonus: 6, grid: TILES },
    "mode-fog": { name: "Туман", blurb: "Свет только у Ореола и Врат.", waves: 10, difficulty: 3, goldBonus: 85, heartBonus: 6, grid: KNEE },
    "mode-dual": { name: "Два потока", blurb: "Два портала, одни Врата.", waves: 10, difficulty: 4, goldBonus: 44, heartBonus: 6, grid: DUAL },
    "mode-life": { name: "Одна жизнь", blurb: "Один прорыв гасит Врата.", waves: 8, difficulty: 3, goldBonus: 100, heartBonus: 0, grid: SERPENT },
    "mode-chaos": { name: "Хаос", blurb: "Каждая пятая волна меняет правила.", waves: 15, difficulty: 5, goldBonus: 42, heartBonus: 10, grid: ROCKS },
    "mode-sandbox": { name: "Песочница", blurb: "Золото не кончается.", waves: 40, difficulty: 4, goldBonus: 0, heartBonus: 0, grid: TILES },
  };
  const s = grids[id];
  if (!s) return null;
  return buildMap({ id, star3: STAR, ...s });
}

for (const id of ["mode-blitz", "mode-boss", "mode-five", "mode-fog", "mode-dual", "mode-life", "mode-chaos", "mode-sandbox"]) {
  const map = buildLookup(id);
  if (map) {
    REGISTERED.set(id, map);
    registerMap(map);
  }
}
registerMap(makeMaze());

export function staticModeMap(id: ModeInfo["id"]): MapDef {
  if (id === "maze") return makeMaze();
  const map = REGISTERED.get(`mode-${id}`);
  if (!map) throw new Error("нет карты " + id);
  return map;
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyMutators(key: string): string[] {
  const rng = mulberry(hashString("mut:" + key));
  const help = ["fury", "gold", "reach", "tempo", "glass"];
  const harm = ["haste", "hide", "rush"];
  return [help[Math.floor(rng() * help.length)], harm[Math.floor(rng() * harm.length)]];
}

export function makeDailyMap(key: string): MapDef {
  const rng = mulberry(hashString("map:" + key));
  const cols = 18;
  const rowsN = 12;
  const cells: string[][] = [];
  for (let y = 0; y < rowsN; y++) {
    const row: string[] = [];
    for (let x = 0; x < cols; x++) row.push(y === 0 || x === 0 || y === rowsN - 1 || x === cols - 1 ? "#" : ".");
    cells.push(row);
  }
  let y = 2 + Math.floor(rng() * (rowsN - 4));
  const path = new Set<string>();
  for (let x = 1; x < cols - 1; x++) {
    path.add(x + "," + y);
    cells[y][x] = "=";
    if (x < cols - 2 && rng() < 0.42) {
      const ny = Math.max(1, Math.min(rowsN - 2, y + (rng() < 0.5 ? -1 : 1)));
      if (ny !== y) {
        cells[ny][x] = "=";
        path.add(x + "," + ny);
        y = ny;
      }
    }
  }
  cells[Number([...path][0].split(",")[1])][1] = "S";
  let gx = 1;
  let gy = 1;
  for (const k of path) {
    const [xs, ys] = k.split(",").map(Number);
    if (xs >= gx) { gx = xs; gy = ys; }
  }
  cells[gy][gx] = "G";
  const tiles = ["+", "*", "~", "^", "$"];
  let tilesLeft = 4;
  let veins = 2;
  const spots: { x: number; y: number }[] = [];
  for (let yy = 1; yy < rowsN - 1; yy++) for (let xx = 1; xx < cols - 1; xx++) {
    if (cells[yy][xx] === ".") spots.push({ x: xx, y: yy });
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = spots[i];
    spots[i] = spots[j];
    spots[j] = tmp;
  }
  for (const s of spots) {
    if (tilesLeft > 0 && rng() < 0.18) {
      cells[s.y][s.x] = tiles[tilesLeft % tiles.length];
      tilesLeft--;
    } else if (veins > 0 && rng() < 0.08) {
      cells[s.y][s.x] = "v";
      veins--;
    } else if (rng() < 0.07) cells[s.y][s.x] = "#";
  }
  const h = hashString(key);
  return buildMap({
    id: "daily-" + key,
    name: "Испытание " + key,
    blurb: "Двор этой даты. Завтра сетка будет другой.",
    waves: 10,
    difficulty: 3 + (h % 3),
    goldBonus: 36 + (h % 28),
    heartBonus: 4 + (h % 4),
    star3: STAR,
    grid: cells.map((r) => r.join("")).join("\n"),
  });
}

export function prepareModeMap(id: ModeInfo["id"], dailyKey = ""): MapDef {
  if (id === "daily") return makeDailyMap(dailyKey || todayKey());
  return cloneMap(staticModeMap(id));
}

export function bonusesFor(meta: Meta, run: Run | null): Bonuses {
  const mode = run?.mode ?? "campaign";
  if (mode === "daily") {
    const b = freshBonuses();
    for (const k of TOWER_KINDS) b.unlocked[k] = true;
    return b;
  }
  const b = compile(meta);
  if (mode === "fog") b.unlocked.halo = true;
  if (mode === "sandbox") {
    for (const k of TOWER_KINDS) b.unlocked[k] = true;
    b.abFire = true;
    b.abBliz = true;
    b.abDawn = true;
  }
  return b;
}

export function hasMut(run: Run, id: string): boolean {
  return Array.isArray(run.mutators) && run.mutators.includes(id);
}

const trails = new WeakMap<Enemy, Route>();

export function trailOf(enemy: Enemy): Route | null {
  return trails.get(enemy) ?? null;
}

export function bindTrail(enemy: Enemy, route: Route): void {
  trails.set(enemy, route);
}

export function revealed(run: Run, map: MapDef, x: number, y: number): boolean {
  if (run.mode !== "fog") return true;
  for (const g of map.gates) {
    if (Math.hypot(x - (g.x + 0.5), y - (g.y + 0.5)) <= 2.45) return true;
  }
  for (const t of run.towers) {
    if (t.kind !== "halo") continue;
    if (Math.hypot(x - (t.x + 0.5), y - (t.y + 0.5)) <= 3.45) return true;
  }
  return false;
}

export function cellOpen(map: MapDef, run: Run, x: number, y: number, extra?: { x: number; y: number }): boolean {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false;
  if (extra && extra.x === x && extra.y === y) return false;
  const ch = map.grid[y][x];
  if (ch === "#") return false;
  if (ch === "S" || ch === "T" || ch === "U" || ch === "G" || ch === "H") return true;
  if (run.walls.includes(x + "," + y)) return false;
  if (run.towers.some((t) => t.x === x && t.y === y)) return false;
  return ".+*~^$v=".includes(ch);
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function routeBetween(map: MapDef, run: Run, sx: number, sy: number, extra?: { x: number; y: number }): Route | null {
  if (!cellOpen(map, run, sx, sy, extra)) return null;
  const w = map.cols;
  const key = (x: number, y: number) => y * w + x;
  const prev = new Map<number, number>();
  const q: number[] = [key(sx, sy)];
  prev.set(key(sx, sy), -1);
  let found = -1;
  while (q.length) {
    const cur = q.shift()!;
    const x = cur % w;
    const y = (cur / w) | 0;
    const ch = map.grid[y][x];
    if ((ch === "G" || ch === "H") && !(x === sx && y === sy)) { found = cur; break; }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = key(nx, ny);
      if (prev.has(nk) || !cellOpen(map, run, nx, ny, extra)) continue;
      prev.set(nk, cur);
      q.push(nk);
    }
  }
  if (found < 0) return null;
  const pts: { x: number; y: number }[] = [];
  let c = found;
  while (c !== -1) {
    pts.push({ x: (c % w) + 0.5, y: ((c / w) | 0) + 0.5 });
    const p = prev.get(c);
    if (p === undefined) break;
    c = p;
  }
  pts.reverse();
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, length, gate: { x: found % w, y: (found / w) | 0 } };
}

export function projectProgress(route: Route, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  let acc = 0;
  const pts = route.pts;
  if (pts.length < 2) return 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg2 = dx * dx + dy * dy || 1;
    const seg = Math.sqrt(seg2);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / seg2));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) { bestD = d; best = acc + seg * t; }
    acc += seg;
  }
  return best;
}

export function noteModeScore(run: Run, meta: Meta): void {
  if (!run || run.mode === "sandbox" || run.mode === "campaign" || run.mode === "endless") return;
  const waves = Math.max(0, Math.floor(run.wavesCleared));
  if (run.mode === "daily") {
    if (run.dailyKey) meta.dailyBest[run.dailyKey] = Math.max(meta.dailyBest[run.dailyKey] ?? 0, waves);
    return;
  }
  meta.modeBest[run.mode] = Math.max(meta.modeBest[run.mode] ?? 0, waves);
}

export function modeLabel(run: Run | null): string {
  if (!run) return "Кампания";
  if (run.mode === "campaign") return "Кампания";
  if (run.mode === "endless") return "Бесконечная ночь";
  return modeInfo(run.mode)?.name ?? "Ночь";
}

void MODE_IDS;
