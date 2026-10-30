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

export type MapData = { id: string; name: string; size: number; t: string; s: string };
export const TER_RULES = { forestArm: 1, gateArm: 1, towerArm: 2, wellHeal: 1 };

const idx = (n: number, x: number, y: number) => y * n + x;
export const ter = (m: MapData, x: number, y: number) => m.t[idx(m.size, x, y)] as TerrainCh;
export const str = (m: MapData, x: number, y: number) => m.s[idx(m.size, x, y)] as StructCh | ".";

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

export function openMap(size: number): MapData { return { id: "open", name: "Открытое поле", size, t: ".".repeat(size * size), s: ".".repeat(size * size) }; }

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
      y = Math.max(Math.floor(mid) - (n >= 15 ? 2 : 0), Math.min(Math.ceil(mid) + (n >= 15 ? 1 : 0) - (n % 2 ? 0 : 1), y));
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
    const nb = n >= 15 ? 2 : 1;
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
  else { blob("m", 2, 4); blob("f", 3, 5); }
  if (n >= 15) { // стена с воротами (крепостной вал на фланге)
    for (let t = 0; t < 40; t++) {
      const y = n - 1 - o.armyRows - ri(2, 3), len = ri(4, 5), x0 = R() < 0.5 ? ri(0, 2) : n - len - ri(0, 2);
      if (![...Array(len).keys()].every((i) => free(x0 + i, y) || get(T, x0 + i, y) === "f")) continue;
      for (let i = 0; i < len; i++) set(T, x0 + i, y, i === Math.floor(len / 2) ? "g" : "#");
      break;
    }
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
export function validateMap(m: MapData, o?: { armyRows: number; armyCols: [number, number][] }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [], n = m.size;
  if (!Number.isInteger(n) || n < 5 || n > 30) return { errors: ["size"], warnings };
  if (typeof m.t !== "string" || typeof m.s !== "string" || m.t.length !== n * n || m.s.length !== n * n) return { errors: ["shape"], warnings };
  for (const c of m.t) if (!(c in TERRAIN)) return { errors: ["bad_terrain"], warnings };
  for (const c of m.s) if (c !== "." && !(c in STRUCT)) return { errors: ["bad_struct"], warnings };
  let blocked = 0, res0 = 0, res1 = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!passable(m, x, y)) { blocked++; if (str(m, x, y) !== ".") errors.push("struct_on_blocked"); }
    const s = str(m, x, y); if (s !== "." && (STRUCT as any)[s].res) { if (y > (n - 1) / 2) res0++; else if (y < (n - 1) / 2) res1++; }
  }
  if (blocked > n * n * 0.25) errors.push("too_blocked");
  if (res0 + res1 > Math.floor((n * n) / 12)) errors.push("too_many_resources");
  if (Math.abs(res0 - res1) > 1) warnings.push("resources_unequal");
  if (o) for (const [x, y] of o.armyCols) {
    if (!passable(m, x, y) || !passable(m, n - 1 - x, n - 1 - y)) errors.push("army_blocked");
  }
  // связность проходимых клеток (8 соседей)
  const seen = new Uint8Array(n * n); let start = -1, total = 0;
  for (let i = 0; i < n * n; i++) if (passable(m, i % n, Math.floor(i / n))) { total++; if (start < 0) start = i; }
  if (start >= 0) {
    const q = [start]; seen[start] = 1; let c = 1;
    while (q.length) { const i = q.pop()!, x = i % n, y = Math.floor(i / n);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= n || b >= n) continue; const j = idx(n, a, b); if (!seen[j] && passable(m, a, b)) { seen[j] = 1; c++; q.push(j); } } }
    if (c !== total) errors.push("unreachable");
  }
  let sym = true; for (let i = 0; i < n * n; i++) if (m.t[i] !== m.t[n * n - 1 - i] || m.s[i] !== m.s[n * n - 1 - i]) { sym = false; break; }
  if (!sym) warnings.push("not_symmetric");
  return { errors: [...new Set(errors)], warnings };
}
