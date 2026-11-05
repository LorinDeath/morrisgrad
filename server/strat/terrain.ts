// «Партия Чёрных королей» — рельеф и постройки на карте. Чистые функции: генерация официальных карт (симметрия
// относительно центра = честный старт), проверка карт игроков, правила проходимости. Один модуль для сервера и клиента.

/** Рельеф (1 символ на клетку): */
export const TERRAIN = {
  ".": { name: "Равнина" },
  ",": { name: "Луг" },        // как равнина, другой рисунок
  f: { name: "Лес" },          // можно войти, скольжение останавливается; укрытие +1 БРН
  m: { name: "Горы" },         // непроходимы (кроме расы Камня); закрывают обстрел
  w: { name: "Река / вода" },  // непроходима (кроме расы Воды); обстрел не закрывает
  b: { name: "Мост" },         // проход через воду
  r: { name: "Дорога" },       // как равнина (этап 2: +1 к ходу Ополченцев, путь для торговли)
  "#": { name: "Стена" },      // непроходима для всех; закрывает обстрел
  g: { name: "Ворота" },       // проход в стене; укрытие +1 БРН
} as const;
export type TerrainCh = keyof typeof TERRAIN;

/** Постройки и места на карте (1 символ на клетку, '.' — пусто). Все проходимы. */
export const STRUCT = {
  M: { name: "Рудник", eff: "+2 золота за ход владельцу (этап 2)", res: true },
  Q: { name: "Каменоломня", eff: "+1 золото, дешевле стены (этап 2)", res: true },
  A: { name: "Алтарь", eff: "+2 знания за ход (этап 2)", res: true },
  S: { name: "Святилище", eff: "+1 знание и +1 Слава за ход (этап 2–3)", res: true },
  V: { name: "Деревня", eff: "+1 золото, +1 рост ближнему городу (этап 2)", res: true },
  T: { name: "Башня", eff: "укрытие +2 БРН (уже работает)", res: false },
  W: { name: "Колодец", eff: "лечит свою фигуру на 1 HP в начале хода (уже работает)", res: false },
  R: { name: "Руины", eff: "разовая награда первому вошедшему (этап 2)", res: false },
  X: { name: "Обелиск", eff: "+1 Слава за ход удержания (этап 3)", res: false },
  D: { name: "Причал", eff: "у воды: Вода ходит дальше, Гавань (этап 3)", res: false },
  O: { name: "Место чуда", eff: "здесь строится Чудо (этап 3)", res: false },
  P: { name: "Точка спавна", eff: "старт Вождя и столицы", res: false },
} as const;
export type StructCh = keyof typeof STRUCT;

export type MapData = { id: string; name: string; size: number; w?: number; h?: number; t: string; s: string; mode?: string }; // mode — t1219: режим карты (1v1, 2v2, ffa3…ffa8); нет — по числу точек спавна
/** Карты игроков (редактор, t1217): сторона 4…100. Лига — по стороне (rating.leagueOf). */
export const MAP_MIN = 4, MAP_MAX = 100, SPAWN_MAX = 8;
export const isMapSize = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= MAP_MIN && n <= MAP_MAX;
/** Шаблон правил для произвольной стороны: армия, ОД, таймер, цели берутся у ближайшего штатного размера своей лиги. */
export const tplSize = (n: number) => (n <= 6 ? 5 : n <= 9 ? 8 : n <= 29 ? 15 : 35);
/** Точки спавна (P) карты: [x,y] по порядку чтения. */
/** t1247: прямоугольные карты — ширина/высота (size = большая сторона, по ней лига и правила). Квадрат: w/h не заданы. */
export const mw = (m: { size: number; w?: number }) => m.w || m.size;
export const mh = (m: { size: number; h?: number }) => m.h || m.size;
export function spawnsOf(m: MapData): [number, number][] { const out: [number, number][] = []; for (let i = 0; i < m.s.length; i++) if (m.s[i] === "P") out.push([i % mw(m), Math.floor(i / mw(m))]); return out; }
/** Старт 1×1 на карте игрока: сторона 0 — нижняя точка спавна, сторона 1 — верхняя. null — меньше двух точек. */
export function duelSpawns(m: MapData): [[number, number], [number, number]] | null {
  const sp = spawnsOf(m); if (sp.length < 2) return null; const mid = (mh(m) - 1) / 2, midx = (mw(m) - 1) / 2;
  const by = (a: [number, number], b: [number, number]) => Math.abs(b[1] - mid) - Math.abs(a[1] - mid) || Math.abs(a[0] - midx) - Math.abs(b[0] - midx);
  const lo = sp.filter((p) => p[1] > mid).sort(by)[0], hi = sp.filter((p) => p[1] < mid).sort(by)[0];
  return lo && hi ? [lo, hi] : null;
}
/** t1219: мест в режиме и режимы по числу точек (карта на 4 точки годится и для 2×2, и для «Все ×4») */
export const MODE_SEATS: Record<string, number> = { "1v1": 2, "2v2": 4, ffa3: 3, ffa4: 4, ffa6: 6, ffa8: 8 };
export const mapModes = (m: MapData): string[] => { const n = spawnsOf(m).length; if (m.mode && MODE_SEATS[m.mode]) return m.mode === "2v2" || m.mode === "ffa4" ? ["2v2", "ffa4"] : [m.mode]; return n === 2 ? ["1v1"] : Object.keys(MODE_SEATS).filter((k) => MODE_SEATS[k] === n && k !== "1v1"); };
/** Подходит ли карта режиму: официальные/случайные (без точек) — только 1×1; иначе — по объявленному режиму / числу точек. */
export const mapFits = (m: MapData, mode: string) => { const n = spawnsOf(m).length; if (mode === "1v1") return n === 0 || mapModes(m).includes("1v1") || (!m.mode && n === 2); return n === MODE_SEATS[mode] && mapModes(m).includes(mode); };
/** t1219: точки спавна по местам режима. 2×2: места [A1,B1,A2,B2] — команда A внизу (A1 левее), B1 — напротив A1 (центральная пара), ход A1→B1→A2→B2.
 *  FFA: по кругу (по часовой от нижней точки) — соседние места соседствуют и на карте. null — число точек не совпадает. */
export function seatSpawns(m: MapData, mode: string): [number, number][] | null {
  const sp = spawnsOf(m), need = MODE_SEATS[mode]; if (!need || sp.length !== need) return null;
  if (mode === "1v1") return duelSpawns(m);
  const cx = (mw(m) - 1) / 2, cy = (mh(m) - 1) / 2, ang = (p: [number, number]) => { let a = Math.atan2(p[1] - cy, p[0] - cx) - Math.PI / 2; while (a < -1e-9) a += 2 * Math.PI; return a; };
  if (mode === "2v2") {
    const by = [...sp].sort((a, b) => b[1] - a[1] || a[0] - b[0]), A = by.slice(0, 2).sort((a, b) => a[0] - b[0]), B = by.slice(2);
    const far = (p: [number, number]) => [...B].sort((a, b) => Math.hypot(b[0] - p[0], b[1] - p[1]) - Math.hypot(a[0] - p[0], a[1] - p[1]))[0];
    const b1 = far(A[0]), b2 = B.find((q) => q !== b1)!; return [A[0], b1, A[1], b2];
  }
  return [...sp].sort((a, b) => ang(a) - ang(b) || a[0] - b[0]);
}
/** Расстановка армии вокруг точки спавна (Вождь — на самой точке). army — ряды из cfg.sizes[n].army (ряд 0 — с Вождём).
 *  Клетка занята/непроходима — ближайшая свободная проходимая (до 4 клеток). null — не хватило места. */
/** t1219: куда смотрит армия у точки (2×2/FFA): к центру по большей оси — точка у левого/правого края строит ряды столбцами */
export function armyDir(m: MapData, sp: [number, number]): { dir: -1 | 1; axis: "x" | "y" } {
  const dx = sp[0] - (mw(m) - 1) / 2, dy = sp[1] - (mh(m) - 1) / 2;
  return Math.abs(dx) > Math.abs(dy) + 0.5 ? { dir: dx > 0 ? -1 : 1, axis: "x" } : { dir: dy > 0 ? -1 : 1, axis: "y" };
}
export function placeArmy(m: MapData, army: string[][], sp: [number, number], dir: -1 | 1, taken = new Set<number>(), axis: "x" | "y" = "y"): { k: string; x: number; y: number }[] | null {
  const n = mw(m), H = mh(m), out: { k: string; x: number; y: number }[] = [], free = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < H && passable(m, x, y);
  if (!free(sp[0], sp[1]) || taken.has(sp[1] * n + sp[0])) return null;
  // клетки, достижимые от точки по проходимым (не через реку/стену), в радиусе рядов армии + 4
  const R = army.length + 4, near = new Map<number, number>([[sp[1] * n + sp[0], 0]]), q = [sp[1] * n + sp[0]];
  while (q.length) { const i = q.shift()!, d = near.get(i)!, x = i % n, y = Math.floor(i / n); if (d >= R) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy, j = b * n + a; if (free(a, b) && !near.has(j)) { near.set(j, d + 1); q.push(j); } } }
  const ki = Math.max(0, army[0].indexOf("king")), L = axis === "y" ? n : H, x00 = Math.floor((L - army[0].length) / 2) + ki; // ряды центрированы относительно ряда Вождя, как в штатной расстановке
  const want: { k: string; x: number; y: number }[] = [];
  army.forEach((row, r) => { const x0 = Math.floor((L - row.length) / 2); row.forEach((k, i) => want.push(axis === "y" ? { k, x: sp[0] + x0 + i - x00, y: sp[1] + dir * r } : { k, x: sp[0] + dir * r, y: sp[1] + x0 + i - x00 })); });
  want.sort((a, b) => (a.k === "king" ? -1 : b.k === "king" ? 1 : 0));
  for (const w of want) {
    let best = -1, bd = Infinity;
    if (w.k === "king") best = sp[1] * n + sp[0];
    else for (const [j] of near) { if (taken.has(j)) continue; const x = j % n, y = Math.floor(j / n); const d = Math.max(Math.abs(x - w.x), Math.abs(y - w.y)) * 4 + Math.abs(x - w.x) + Math.abs(y - w.y) + (((axis === "y" ? y - sp[1] : x - sp[0]) * dir) < 0 ? 6 : 0); if (d < bd) { bd = d; best = j; } }
    if (best < 0) return null; taken.add(best); out.push({ k: w.k, x: best % n, y: Math.floor(best / n) });
  }
  return out;
}
/** Клетки, недостижимые из главной области (для подсветки в редакторе). */
export function unreachableCells(m: MapData): number[] {
  const n = mw(m), H = mh(m), seen = new Uint8Array(n * H); let best: number[] = [];
  for (let s = 0; s < n * H; s++) { if (seen[s] || !passable(m, s % n, Math.floor(s / n))) continue;
    const comp = [s], q = [s]; seen[s] = 1;
    while (q.length) { const i = q.pop()!, x = i % n, y = Math.floor(i / n);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= n || b >= H) continue; const j = b * n + a; if (!seen[j] && passable(m, a, b)) { seen[j] = 1; comp.push(j); q.push(j); } } }
    if (comp.length > best.length) best = comp; }
  const main = new Set(best), out: number[] = []; for (let i = 0; i < n * H; i++) if (passable(m, i % n, Math.floor(i / n)) && !main.has(i)) out.push(i); return out;
}
export const TER_RULES = { forestArm: 1, gateArm: 1, towerArm: 2, wellHeal: 1 };

const idx = (n: number, x: number, y: number) => y * n + x;
export const ter = (m: MapData, x: number, y: number) => m.t[idx(mw(m), x, y)] as TerrainCh;
export const str = (m: MapData, x: number, y: number) => m.s[idx(mw(m), x, y)] as StructCh | ".";

/** Может ли фигура расы race стоять/пройти на клетке. */
export function passable(m: MapData | undefined, x: number, y: number, race?: string): boolean {
  if (!m) return true;
  const c = ter(m, x, y);
  if (c === "#") return false;
  if (c === "m") return race === "stone";
  if (c === "w") return race === "water";
  return true;
}
/** Скольжение останавливается на этой клетке (лес). */
export const stopsSlide = (m: MapData | undefined, x: number, y: number) => !!m && ter(m, x, y) === "f";
/** Клетка закрывает обстрел (стены и горы). */
export const blocksShot = (m: MapData | undefined, x: number, y: number) => !!m && (ter(m, x, y) === "#" || ter(m, x, y) === "m");
/** Бонус брони защитника от клетки. */
export function coverArm(m: MapData | undefined, x: number, y: number): number {
  if (!m) return 0;
  const s = str(m, x, y); if (s === "T") return TER_RULES.towerArm;
  const c = ter(m, x, y); return c === "f" ? TER_RULES.forestArm : c === "g" ? TER_RULES.gateArm : 0;
}

export function openMap(size: number, w = size, h = size): MapData { const r = w !== h; return { id: "open", name: "Открытое поле", size: r ? Math.max(w, h) : size, ...(r ? { w, h } : {}), t: ".".repeat(w * h), s: ".".repeat(w * h) }; }

// ---------- генерация (официальные карты и «Случайная»)
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
export type GenOpts = { size: number; seed: number; armyRows: number; armyCols: [number, number][]; kingCol: number; name?: string; id?: string };

/** Генерирует карту с центральной симметрией: клетка (x,y) ≡ (n-1-x, n-1-y). Зоны армий остаются равниной. */
export function generateMap(o: GenOpts): MapData {
  for (let tries = 0; tries < 60; tries++) {
    const m = tryGen(o, o.seed + tries * 7919);
    if (!validateMap(m, o).errors.length) return m;
  }
  return openMap(o.size); // не должно случаться: проверено тестами
}
function tryGen(o: GenOpts, seed: number): MapData {
  const n = o.size, R = rng(seed), T: string[] = Array(n * n).fill("."), S: string[] = Array(n * n).fill(".");
  const mir = (x: number, y: number): [number, number] => [n - 1 - x, n - 1 - y];
  const set = (A: string[], x: number, y: number, c: string) => { if (x < 0 || y < 0 || x >= n || y >= n) return; A[idx(n, x, y)] = c; const [a, b] = mir(x, y); A[idx(n, a, b)] = c; };
  const get = (A: string[], x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? "?" : A[idx(n, x, y)]);
  const army = (x: number, y: number) => y < o.armyRows + (n >= 8 ? 1 : 0) || y >= n - o.armyRows - (n >= 8 ? 1 : 0); // + ряд перед армией свободен
  const free = (x: number, y: number) => get(T, x, y) === "." && get(S, x, y) === "." && !army(x, y);
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  // луг — пятна для красоты
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (R() < 0.18 && T[idx(n, x, y)] === ".") set(T, x, y, ",");
  const mid = (n - 1) / 2;
  // река через центр с изгибами + мосты
  if (n >= 8) {
    const ys: number[] = [];
    let y = Math.floor(mid);
    for (let x = 0; x < Math.ceil(n / 2); x++) {
      if (x > 0 && R() < 0.45) y += R() < 0.5 ? -1 : 1;
      y = Math.max(Math.floor(mid) - (n >= 30 ? 4 : n >= 15 ? 2 : 0), Math.min(Math.ceil(mid) + (n >= 30 ? 3 : n >= 15 ? 1 : 0) - (n % 2 ? 0 : 1), y));
      if (n % 2 && x === Math.floor(mid)) y = mid; // центральная клетка нечётной доски — на оси
      ys.push(y);
    }
    for (let x = 0; x < ys.length; x++) {
      set(T, x, ys[x], "w");
      if (x > 0) for (let y2 = Math.min(ys[x], ys[x - 1]); y2 <= Math.max(ys[x], ys[x - 1]); y2++) set(T, x, y2, "w"); // связность русла
    }
    if (n % 2 === 0) { const L = ys.length - 1, my = n - 1 - ys[L]; for (let y2 = Math.min(ys[L], my); y2 <= Math.max(ys[L], my); y2++) set(T, L + 1, y2, "w"); } // шов в центре
    // мосты: колонки, где русло одной клеткой по вертикали
    let cand = [...Array(ys.length).keys()].filter((x) => x > 0 && x < n - 1 && get(T, x, ys[x] - 1) !== "w" && get(T, x, ys[x] + 1) !== "w");
    const nb = n >= 30 ? 3 : n >= 15 ? 2 : 1; // t1201: 35×35 (Тактическая) — 3 моста на половину
    for (let k = 0; k < nb && cand.length; k++) { const x = cand[Math.floor(R() * cand.length)]; set(T, x, ys[x], "b"); cand = cand.filter((c) => Math.abs(c - x) > 2); }
    // причал у воды (15+)
    if (n >= 15) for (let t = 0; t < 30; t++) { const x = ri(0, n - 1), yy = ys[Math.min(x, ys.length - 1)] + 1; if (free(x, yy) && get(T, x, yy - 1) === "w") { set(S, x, yy, "D"); break; } }
  }
  // кластеры гор и леса, стена с воротами
  const blob = (c: string, cnt: number, sz: number) => {
    for (let k = 0; k < cnt; k++) {
      let x = ri(0, n - 1), y = ri(0, n - 1), placed = 0;
      for (let s = 0; s < sz * 4 && placed < sz; s++) {
        if (free(x, y) && !(x === Math.round(mid) && y === Math.round(mid))) { set(T, x, y, c); placed++; }
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][ri(0, 3)]; x = Math.max(0, Math.min(n - 1, x + d[0])); y = Math.max(0, Math.min(n - 1, y + d[1]));
      }
    }
  };
  if (n === 5) { blob("f", 1, 1); }
  else if (n === 8) { blob("m", 1, 2); blob("f", 2, 3); }
  else if (n < 30) { blob("m", 2, 4); blob("f", 3, 5); }
  else { blob("m", 7, 6); blob("f", 9, 7); blob(",", 6, 6); } // t1201: 35×35 — больше рельефа (масштаб по площади)
  if (n >= 15) { // стена с воротами (крепостной вал на фланге)
    for (let t = 0; t < 40; t++) {
      const y = n - 1 - o.armyRows - ri(2, 3), len = ri(4, 5), x0 = R() < 0.5 ? ri(0, 2) : n - len - ri(0, 2);
      if (![...Array(len).keys()].every((i) => free(x0 + i, y) || get(T, x0 + i, y) === "f")) continue;
      for (let i = 0; i < len; i++) set(T, x0 + i, y, i === Math.floor(len / 2) ? "g" : "#");
      break;
    }
  }
  if (n >= 30) for (let t = 0; t < 60; t++) { // t1201: второй вал на 35×35 — ближе к центру
    const y = Math.ceil(mid) + ri(5, 8), len = ri(5, 7), x0 = ri(2, n - len - 2);
    if (![...Array(len).keys()].every((i) => free(x0 + i, y) || get(T, x0 + i, y) === "f")) continue;
    for (let i = 0; i < len; i++) set(T, x0 + i, y, i === Math.floor(len / 2) ? "g" : "#");
    break;
  }
  // постройки (по одной на каждую сторону — симметрия даёт пару)
  const place = (c: string, near?: (x: number, y: number) => boolean) => {
    for (let t = 0; t < 200; t++) {
      const x = ri(0, n - 1), y = ri(Math.ceil(mid), n - 1); // половина игрока 0 (симметрия даст вторую)
      if (!free(x, y) || (near && !near(x, y))) continue;
      if ([[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => /[A-Z]/.test(get(S, x + dx, y + dy)))) continue; // не вплотную
      set(S, x, y, c); return true;
    }
    return false;
  };
  const nearT = (ch: string) => (x: number, y: number) => [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => get(T, x + dx, y + dy) === ch);
  if (n === 5) { const c = Math.floor(mid); S[idx(n, c, c)] = "W"; }
  if (n >= 8) { place("M"); place("T", nearT("w")); place("R"); }
  if (n >= 15) { place("M"); place("A"); place("S"); place("V"); place("W"); place("Q", nearT("m")); place("X"); place("O"); }
  if (n >= 30) { place("M"); place("M"); place("T", nearT("w")); place("R"); place("R"); place("A"); place("S"); place("V"); place("V"); place("W"); place("Q", nearT("m")); place("X"); place("O"); place("O"); } // t1201: 35×35
  if (n === 8) place("A");
  // точки спавна (клетка Вождя) и дорога от Вождя к ближайшему мосту
  const ky0 = n - 1;
  set(S, o.kingCol, ky0, "P");
  if (n >= 8) {
    const bridges = [...Array(n * n).keys()].filter((i) => T[i] === "b").map((i) => [i % n, Math.floor(i / n)]).filter(([, y]) => y >= mid - 0.5);
    let best = bridges.sort((a, b) => Math.abs(a[0] - o.kingCol) - Math.abs(b[0] - o.kingCol))[0];
    if (best) { // кратчайший путь (BFS) по проходимым клеткам своей половины от фронта армии до моста — без разрывов
      const sx = o.kingCol, sy = ky0 - o.armyRows, start = idx(n, sx, sy), goal = idx(n, best[0], best[1]);
      const prev = new Map<number, number>([[start, -1]]), q = [start];
      while (q.length) { const c = q.shift()!; if (c === goal) break; const cx = c % n, cy = Math.floor(c / n);
        const dirs = R() < 0.5 ? [[0, -1], [1, 0], [-1, 0], [0, 1]] : [[1, 0], [-1, 0], [0, -1], [0, 1]];
        for (const [dx, dy] of dirs) { const x = cx + dx, y = cy + dy, t = get(T, x, y), i = idx(n, x, y);
          if (t === "?" || prev.has(i) || y < best[1] || (i !== goal && "wm#b".includes(t))) continue; prev.set(i, c); q.push(i); } }
      if (prev.has(goal)) for (let c = prev.get(goal)!; c >= 0; c = prev.get(c)!) { const x = c % n, y = Math.floor(c / n); if (get(T, x, y) === "." || get(T, x, y) === ",") set(T, x, y, "r"); }
    }
  }
  return { id: o.id || "gen:" + n + ":" + seed, name: o.name || "Случайная", size: n, t: T.join(""), s: S.join("") };
}

/** Проверка карты (официальной или игрока): ошибки блокируют публикацию, предупреждения дают «неравная». */
export function validateMap(m: MapData, o?: { armyRows: number; armyCols: [number, number][]; army?: string[][] }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [], n = mw(m), H = mh(m), N = n * H;
  if (!isMapSize(n) || !isMapSize(H) || m.size !== Math.max(n, H) || (m.w != null && m.h == null) || (m.h != null && m.w == null)) return { errors: ["size"], warnings };
  if (typeof m.t !== "string" || typeof m.s !== "string" || m.t.length !== N || m.s.length !== N) return { errors: ["shape"], warnings };
  for (const c of m.t) if (!(c in TERRAIN)) return { errors: ["bad_terrain"], warnings };
  for (const c of m.s) if (c !== "." && !(c in STRUCT)) return { errors: ["bad_struct"], warnings };
  let blocked = 0, res0 = 0, res1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < n; x++) {
    if (!passable(m, x, y)) { blocked++; if (str(m, x, y) !== ".") errors.push("struct_on_blocked"); }
    const s = str(m, x, y); if (s !== "." && (STRUCT as any)[s].res) { if (y > (H - 1) / 2) res0++; else if (y < (H - 1) / 2) res1++; }
  }
  if (blocked > N * 0.25) errors.push("too_blocked");
  if (res0 + res1 > Math.floor(N / 12)) errors.push("too_many_resources");
  if (Math.abs(res0 - res1) > 1) warnings.push("resources_unequal");
  const sp = spawnsOf(m);
  if (sp.length > SPAWN_MAX) errors.push("spawns_many");
  if (sp.length > 2 && m.mode !== "1v1") { // t1219: 2×2/«Все»: число точек = мест режима, армии всех мест помещаются
    const md = mapModes(m)[0], seats = md ? seatSpawns(m, md) : null;
    if (!md || !seats) errors.push("spawns_count");
    else if (o?.army) { const taken = new Set<number>(); if (seats.some((p) => { const a = armyDir(m, p); return !placeArmy(m, o.army!, p, a.dir, taken, a.axis); })) errors.push("spawn_space"); }
    if (seats) { // ресурсы у каждой точки (ближайшей по Чебышёву) — не больше ±1 от среднего
      const cnt = seats.map(() => 0); for (let i = 0; i < N; i++) { const ch = m.s[i]; if (ch === "." || !(STRUCT as any)[ch]?.res) continue; const x = i % n, y = Math.floor(i / n); let bi = 0, bd = 1e9; seats.forEach((p, k) => { const d = Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y)); if (d < bd) { bd = d; bi = k; } }); cnt[bi]++; }
      if (Math.max(...cnt) - Math.min(...cnt) > 1) warnings.push("resources_unequal_seats");
      const wi = warnings.indexOf("resources_unequal"); if (wi >= 0) warnings.splice(wi, 1); // верх/низ для FFA не мерило
    }
  } else if (sp.length >= 2) { // карта игрока со своими точками старта: армии встают у точек (placeArmy)
    const d = duelSpawns(m);
    if (!d) errors.push("spawn_half");
    else if (o?.army) { const taken = new Set<number>(); if (!placeArmy(m, o.army, d[0], -1, taken) || !placeArmy(m, o.army, d[1], 1, taken)) errors.push("spawn_space"); }
  } else if (n !== H) errors.push("rect_spawns"); // t1247: прямоугольная карта — только со своими точками старта
  else if (o) for (const [x, y] of o.armyCols) {
    if (!passable(m, x, y) || !passable(m, n - 1 - x, n - 1 - y)) errors.push("army_blocked");
  }
  // связность проходимых клеток (8 соседей)
  const seen = new Uint8Array(N); let start = -1, total = 0;
  for (let i = 0; i < N; i++) if (passable(m, i % n, Math.floor(i / n))) { total++; if (start < 0) start = i; }
  if (start >= 0) {
    const q = [start]; seen[start] = 1; let c = 1;
    while (q.length) { const i = q.pop()!, x = i % n, y = Math.floor(i / n);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= n || b >= H) continue; const j = idx(n, a, b); if (!seen[j] && passable(m, a, b)) { seen[j] = 1; c++; q.push(j); } } }
    if (c !== total) errors.push("unreachable");
  }
  // t1219: у карт 2×2/«Все» своя симметрия (поворот на 360°/мест) — честность меряем ресурсами у каждой точки и местом под армии
  let sym = true; if (!(sp.length > 2 && m.mode !== "1v1")) for (let i = 0; i < N; i++) if (m.t[i] !== m.t[N - 1 - i] || m.s[i] !== m.s[N - 1 - i]) { sym = false; break; }
  if (!sym) warnings.push("not_symmetric");
  return { errors: [...new Set(errors)], warnings };
}
