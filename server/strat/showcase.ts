// Витринные карты (t1217): встроенные, одобренные, автор — Лорендес. Рисуются детерминированно кодом (без БД),
// центрально-симметричны (честно для 1×1), проходят validateMap. id: s01…s10.
import { type MapData, passable, unreachableCells } from "./terrain";

export const SHOWCASE_AUTHOR = "system", SHOWCASE_NICK = "Лорендес";
type P = { id: string; name: string; size: number; descr: string; paint: (c: Canvas) => void };

class Canvas {
  t: string[]; s: string[]; r: () => number;
  constructor(public n: number, seed: number, base = ".") { this.t = Array(n * n).fill(base); this.s = Array(n * n).fill("."); let a = seed >>> 0 || 1; this.r = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return (a >>> 0) / 4294967296; }; }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.n && y < this.n; }
  /** клетка и её центрально-симметричная пара */
  T(x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); if (!this.in(x, y)) return; const n = this.n; this.t[y * n + x] = c; this.t[(n - 1 - y) * n + (n - 1 - x)] = c; }
  S(x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); if (!this.in(x, y)) return; const n = this.n; this.s[y * n + x] = c; this.s[(n - 1 - y) * n + (n - 1 - x)] = c; }
  get(x: number, y: number) { return this.t[y * this.n + x]; }
  disc(cx: number, cy: number, r: number, c: string, keep?: string) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && this.in(x, y) && (!keep || !keep.includes(this.get(x, y)))) this.T(x, y, c); }
  /** «клякса» — неровное пятно */
  blob(cx: number, cy: number, r: number, c: string, keep?: string) { for (let k = 0; k < 6; k++) this.disc(cx + (this.r() - 0.5) * r, cy + (this.r() - 0.5) * r, r * (0.45 + this.r() * 0.4), c, keep); }
  line(x0: number, y0: number, x1: number, y1: number, c: string, w = 1, keep?: string) { const L = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2; for (let i = 0; i <= L; i++) { const x = x0 + ((x1 - x0) * i) / L, y = y0 + ((y1 - y0) * i) / L; if (w <= 1) { if (this.in(Math.round(x), Math.round(y)) && (!keep || !keep.includes(this.get(Math.round(x), Math.round(y))))) this.T(x, y, c); } else this.disc(x, y, w / 2, c, keep); } }
  /** извилистая линия (река/дорога) через точки */
  path(pts: [number, number][], c: string, w = 1, wob = 0, keep?: string) { for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = pts[i], [x, y] = pts[i + 1]; const mx = (a + x) / 2 + (this.r() - 0.5) * wob, my = (b + y) / 2 + (this.r() - 0.5) * wob; this.line(a, b, mx, my, c, w, keep); this.line(mx, my, x, y, c, w, keep); } }
  /** шум: лес/луг по случайным пятнам */
  sprinkle(k: number, c: string, r: number, on = ".,") { const n = this.n; for (let i = 0; i < k; i++) { const x = this.r() * n, y = this.r() * n; this.blob(x, y, r, c, "mw#bgr" + (on.includes(".") ? "" : ".")); } }
  free(x: number, y: number) { return this.in(x, y) && !"mw#".includes(this.get(x, y)); }
  /** постройка на ближайшей проходимой клетке */
  put(x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); for (let d = 0; d < 6; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const a = x + dx, b = y + dy; if (this.free(a, b) && this.s[b * this.n + a] === "." && this.s[(this.n - 1 - b) * this.n + (this.n - 1 - a)] === ".") { if (this.get(a, b) === "g" || this.get(a, b) === "b") continue; this.S(a, b, c); return; } } }
  /** поле у точки спавна чистое (армия встаёт рядами к центру) */
  spawn(x: number, y: number, clear = 3) { for (let dy = -clear; dy <= 1; dy++) for (let dx = -clear - 2; dx <= clear + 2; dx++) if (this.in(x + dx, y + dy)) { this.T(x + dx, y + dy, "mw#".includes(this.get(x + dx, y + dy)) || this.get(x + dx, y + dy) === "f" ? "," : this.get(x + dx, y + dy)); this.S(x + dx, y + dy, "."); } this.S(x, y, "P"); }
  map(id: string, name: string): MapData {
    const m: MapData = { id, name, size: this.n, t: this.t.join(""), s: this.s.join("") };
    // карманы, отрезанные от основной области: мелкие — заливаем горой, крупные — пробиваем проход к центру
    for (let pass = 0; pass < 8; pass++) {
      const un = unreachableCells({ ...m, t: this.t.join(""), s: this.s.join("") }); if (!un.length) break;
      const n = this.n, i = un[0], x = i % n, y = Math.floor(i / n), c = (n - 1) / 2;
      const L = Math.max(Math.abs(c - x), Math.abs(c - y), 1);
      for (let k = 0; k <= L; k++) { const a = Math.round(x + ((c - x) * k) / L), b = Math.round(y + ((c - y) * k) / L); const ch = this.get(a, b); if (ch === "w") this.T(a, b, "b"); else if (ch === "#") this.T(a, b, "g"); else if (ch === "m") this.T(a, b, ","); }
    }
    for (let i = 0; i < this.n * this.n; i++) if (!passable({ ...m, t: this.t.join("") } as MapData, i % this.n, Math.floor(i / this.n))) { this.s[i] = "."; }
    return { ...m, t: this.t.join(""), s: this.s.join("") };
  }
}

const DEFS: P[] = [
  { id: "s01", name: "Камень дуэли", size: 4, descr: "Самое маленькое поле: четыре клетки, два Вождя и колодец посередине.", paint: (c) => { c.T(0, 1, "f"); c.T(3, 1, ","); c.S(1, 1, "W"); c.spawn(1, 3, 0); } },
  { id: "s02", name: "Лесная опушка", size: 8, descr: "Быстрая партия: опушки, рудник у каждого и башня в центре.", paint: (c) => {
    for (const [x, y] of [[0, 3], [1, 3], [0, 4], [6, 2], [7, 2]]) c.T(x, y, "f"); c.T(3, 4, ","); c.T(4, 4, ","); c.T(2, 3, "m");
    c.S(3, 3, "T"); c.S(1, 5, "M"); c.S(6, 5, "A"); c.spawn(3, 7, 1); } },
  { id: "s03", name: "Две реки", size: 15, descr: "Реки делят поле на три полосы, мосты — горячие точки. В центре — святилище.", paint: (c) => {
    c.sprinkle(6, "f", 2.2); c.sprinkle(6, ",", 2.5);
    c.path([[0, 4], [5, 5], [9, 4], [14, 5]], "w"); for (const x of [2, 11]) c.T(x, 5, "b"); c.T(7, 5, "b");
    c.S(7, 7, "S"); c.put(2, 10, "M"); c.put(12, 10, "V"); c.put(7, 11, "W"); c.put(4, 8, "R"); c.spawn(7, 14, 2); } },
  { id: "s04", name: "Перекрёсток королей", size: 35, descr: "Тракты сходятся к Чуду в центре; четыре крепости с воротами, леса по флангам.", paint: (c) => {
    c.sprinkle(28, ",", 4); c.sprinkle(22, "f", 3);
    c.line(17, 0, 17, 34, "r"); c.line(0, 17, 34, 17, "r"); c.line(3, 31, 31, 3, "r");
    for (const [x, y] of [[8, 8], [26, 8]]) { for (let k = -3; k <= 3; k++) { c.T(x + k, y - 3, "#"); c.T(x + k, y + 3, "#"); c.T(x - 3, y + k, "#"); c.T(x + 3, y + k, "#"); } c.T(x, y + 3, "g"); c.T(x, y - 3, "g"); c.S(x, y, "T"); c.put(x + 1, y + 1, "A"); }
    c.blob(6, 17, 3, "m"); c.blob(28, 17, 3, "m"); c.S(17, 17, "O");
    for (const [x, y, k] of [[10, 25, "M"], [24, 26, "Q"], [5, 24, "V"], [29, 23, "S"], [17, 22, "X"], [13, 20, "W"], [21, 20, "R"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(17, 33, 3); } },
  { id: "s05", name: "Великая река", size: 50, descr: "Широкая река с островом в центре и тремя мостами. Причалы для народа Воды.", paint: (c) => {
    c.sprinkle(40, ",", 5); c.sprinkle(36, "f", 3.5);
    c.path([[0, 20], [10, 22], [20, 19], [30, 23], [40, 21], [49, 24]], "w", 3, 4);
    c.blob(25, 25, 4, ","); c.S(25, 25, "O");
    for (const x of [6, 25, 43]) for (let y = 14; y <= 30; y++) if (c.get(x, y) === "w") c.T(x, y, "b");
    c.line(25, 49, 25, 30, "r"); c.line(6, 49, 6, 30, "r");
    c.blob(12, 38, 3, "m"); c.blob(40, 40, 2.5, "m");
    for (const [x, y, k] of [[10, 30, "D"], [38, 30, "D"], [18, 40, "M"], [33, 42, "Q"], [4, 44, "V"], [45, 37, "A"], [25, 37, "W"], [14, 32, "R"], [36, 33, "S"], [22, 29, "X"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(25, 48, 3); } },
  { id: "s06", name: "Горный перевал", size: 50, descr: "Хребет через всё поле и три перевала. Народ Камня ходит напрямик.", paint: (c) => {
    c.sprinkle(30, ",", 5); c.sprinkle(30, "f", 3);
    c.path([[0, 25], [12, 22], [25, 25], [38, 28], [49, 25]], "m", 4, 5);
    for (const x of [8, 25, 41]) c.line(x, 15, x, 35, ",", 2);
    c.blob(12, 36, 3, "m"); c.blob(38, 38, 3, "m"); c.blob(20, 40, 3, "f");
    c.S(25, 25, "X"); c.line(25, 49, 25, 27, "r");
    for (const [x, y, k] of [[8, 30, "T"], [41, 31, "T"], [15, 33, "M"], [33, 34, "M"], [5, 42, "Q"], [44, 44, "V"], [25, 38, "W"], [18, 28, "A"], [30, 31, "R"], [10, 45, "S"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(25, 48, 3); } },
  { id: "s07", name: "Крепости в чаще", size: 75, descr: "Густой лес, четыре каменные цитадели с воротами и обелиски на прогалинах.", paint: (c) => {
    c.sprinkle(90, "f", 4); c.sprinkle(40, ",", 5);
    const fort = (x: number, y: number, r: number) => { for (let k = -r; k <= r; k++) { c.T(x + k, y - r, "#"); c.T(x + k, y + r, "#"); c.T(x - r, y + k, "#"); c.T(x + r, y + k, "#"); } for (let yy = y - r + 1; yy < y + r; yy++) for (let xx = x - r + 1; xx < x + r; xx++) c.T(xx, yy, "."); c.T(x, y + r, "g"); c.T(x, y - r, "g"); c.T(x - r, y, "g"); c.T(x + r, y, "g"); c.S(x, y, "T"); c.put(x + 2, y + 2, "W"); c.put(x - 2, y - 2, "A"); };
    fort(20, 20, 6); fort(55, 20, 6); fort(37, 37, 5);
    c.path([[37, 74], [30, 60], [37, 44]], "r", 1, 6); c.path([[0, 50], [20, 52], [37, 44]], "r", 1, 6);
    for (const [x, y, k] of [[12, 60, "M"], [60, 62, "M"], [25, 66, "Q"], [50, 54, "V"], [8, 45, "X"], [66, 45, "X"], [30, 50, "R"], [45, 64, "S"], [20, 40, "V"], [62, 70, "R"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(37, 73, 3); } },
  { id: "s08", name: "Озёрный край", size: 75, descr: "Цепь озёр, луга и рыбацкие причалы; в центре — остров с местом чуда.", paint: (c) => {
    c.sprinkle(60, ",", 6); c.sprinkle(50, "f", 3.5);
    for (const [x, y, r] of [[15, 15, 6], [37, 37, 7], [60, 18, 5], [12, 45, 4], [40, 14, 4], [58, 45, 3]] as [number, number, number][]) c.blob(x, y, r, "w");
    c.disc(37, 37, 2.5, ","); c.line(37, 40, 37, 46, "b"); c.S(37, 37, "O");
    c.path([[37, 74], [37, 47]], "r"); c.path([[5, 70], [20, 55], [37, 47]], "r", 1, 5);
    for (const [x, y, k] of [[20, 22, "D"], [52, 22, "D"], [17, 50, "D"], [30, 58, "M"], [50, 60, "Q"], [8, 60, "V"], [66, 60, "V"], [25, 44, "S"], [48, 50, "A"], [37, 60, "W"], [62, 35, "R"], [10, 30, "X"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(37, 73, 3); c.spawn(8, 66, 2); } },
  { id: "s09", name: "Королевские тракты", size: 75, descr: "Сеть дорог между деревнями, мосты через ручьи, рудники в предгорьях.", paint: (c) => {
    c.sprinkle(50, ",", 6); c.sprinkle(45, "f", 3.5); c.sprinkle(10, "m", 2.5);
    c.path([[0, 30], [20, 33], [40, 28], [74, 32]], "w", 1, 6);
    const hubs: [number, number][] = [[37, 37], [15, 55], [59, 55], [10, 20], [37, 62], [62, 15]];
    for (const [x, y] of hubs) { c.disc(x, y, 2, ","); c.put(x, y, "V"); }
    for (const [a, b] of [[0, 1], [0, 2], [1, 4], [2, 4], [0, 3], [0, 5], [1, 3]] as [number, number][]) c.line(hubs[a][0], hubs[a][1], hubs[b][0], hubs[b][1], "r");
    for (let i = 0; i < 75 * 75; i++) if (c.t[i] === "r") { const x = i % 75, y = Math.floor(i / 75); void x; void y; }
    for (const [x, y, k] of [[22, 66, "M"], [52, 68, "M"], [30, 48, "Q"], [45, 46, "A"], [5, 40, "S"], [68, 42, "T"], [37, 70, "W"], [25, 25, "R"], [50, 25, "X"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(37, 73, 3); } },
  { id: "s10", name: "Мир Лорендеса", size: 100, descr: "Большой мир: река, хребты, леса, крепость в центре, восемь точек старта (1×1 — нижняя и верхняя).", paint: (c) => {
    c.sprinkle(120, ",", 7); c.sprinkle(110, "f", 4.5);
    c.path([[0, 38], [20, 42], [40, 36], [60, 41], [80, 37], [99, 40]], "w", 3, 6);
    for (const x of [10, 33, 50, 67, 90]) for (let y = 28; y <= 50; y++) if (c.get(x, y) === "w") c.T(x, y, "b");
    c.path([[5, 70], [25, 66], [40, 72]], "m", 3, 5); c.blob(80, 75, 4, "m"); c.blob(15, 88, 3, "m");
    for (let k = -6; k <= 6; k++) { c.T(50 + k, 44, "#"); c.T(50 + k, 56, "#"); c.T(44, 50 + k, "#"); c.T(56, 50 + k, "#"); }
    for (let y = 45; y < 56; y++) for (let x = 45; x < 56; x++) c.T(x, y, ".");
    c.T(50, 56, "g"); c.T(50, 44, "g"); c.T(44, 50, "g"); c.T(56, 50, "g"); c.S(50, 50, "O"); c.put(48, 52, "T");
    c.line(50, 99, 50, 57, "r"); c.path([[0, 60], [30, 58], [43, 50]], "r", 1, 4);
    for (const [x, y, k] of [[20, 80, "M"], [78, 85, "M"], [35, 90, "Q"], [65, 92, "V"], [10, 60, "V"], [88, 62, "A"], [30, 60, "S"], [70, 66, "X"], [50, 75, "W"], [40, 82, "R"], [12, 48, "D"], [62, 48, "D"], [85, 55, "T"], [25, 55, "W"]] as [number, number, string][]) c.put(x, y, k);
    c.spawn(50, 98, 3); c.spawn(15, 95, 2); c.spawn(85, 95, 2); c.spawn(6, 75, 2); } },
];

const cache = new Map<string, MapData & { descr: string }>();
export function showcaseMap(id: string): (MapData & { descr: string }) | null {
  if (cache.has(id)) return cache.get(id)!; const d = DEFS.find((x) => x.id === id); if (!d) return null;
  const c = new Canvas(d.size, parseInt(d.id.slice(1), 10) * 7919 + d.size); d.paint(c);
  const m = { ...c.map(d.id, d.name), descr: d.descr }; cache.set(id, m); return m;
}
export const SHOWCASE_IDS = DEFS.map((d) => d.id);
export const showcaseAll = () => SHOWCASE_IDS.map((id) => showcaseMap(id)!);
