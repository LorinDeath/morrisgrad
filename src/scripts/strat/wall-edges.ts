// t1198: стены по правилу Алекса — стена стоит на каждом ребре своей (союзной) клетки, которое НЕ касается другой своей клетки,
// т. е. ровно по внешней границе земли. Любая форма (вогнутая, с дырой, одиночная клетка, анклав, касание по диагонали) —
// ребро за ребром; углы: внешний — где сходятся две стены одной клетки, внутренний — обе стороны свои, а диагональ чужая.
// Чистые функции без DOM: их проверяет tools/strat/wall-edges-test.ts.
export type Dir = "n" | "e" | "s" | "w";
export type Edge = { x: number; y: number; d: Dir };
export const DIRS: Record<Dir, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const key = (x: number, y: number) => x + "," + y;

/** Все рёбра границы набора клеток: для каждой клетки — стороны, за которыми нет клетки набора. */
export function edges(cells: Iterable<readonly [number, number]>): Edge[] {
  const S = new Set<string>(), L: [number, number][] = [];
  for (const [x, y] of cells) { const k = key(x, y); if (!S.has(k)) { S.add(k); L.push([x, y]); } }
  const out: Edge[] = [];
  for (const [x, y] of L) for (const d of ["n", "e", "s", "w"] as Dir[]) { const [dx, dy] = DIRS[d]; if (!S.has(key(x + dx, y + dy))) out.push({ x, y, d }); }
  return out;
}

/** Куски стены одной клетки по предикату «своя клетка» (в координатах сетки; поворот на экран — у вызывающего).
 *  wall — стороны со стеной; outer — внешние углы (обе стороны угла — стены); inner — внутренние (обе стороны свои, диагональ чужая). */
export function cellWalls(own: (x: number, y: number) => boolean, x: number, y: number) {
  const wall = {} as Record<Dir, boolean>;
  for (const d of ["n", "e", "s", "w"] as Dir[]) { const [dx, dy] = DIRS[d]; wall[d] = !own(x + dx, y + dy); }
  const outer: string[] = [], inner: string[] = [];
  for (const cn of ["ne", "nw", "se", "sw"]) { const a = cn[0] as Dir, b = cn[1] as Dir;
    if (wall[a] && wall[b]) outer.push(cn);
    else if (!wall[a] && !wall[b]) { const [ax, ay] = DIRS[a], [bx, by] = DIRS[b]; if (!own(x + ax + bx, y + ay + by)) inner.push(cn); } }
  return { wall, outer, inner };
}

/** Замкнутость границы: в каждой вершине сетки сходится чётное число рёбер границы (0, 2 или 4) — без разрывов и висящих концов. */
export function vertexDegrees(E: Edge[]): Map<string, number> {
  const deg = new Map<string, number>(), add = (x: number, y: number) => deg.set(key(x, y), (deg.get(key(x, y)) || 0) + 1);
  for (const { x, y, d } of E) {
    if (d === "n") { add(x, y); add(x + 1, y); } else if (d === "s") { add(x, y + 1); add(x + 1, y + 1); }
    else if (d === "w") { add(x, y); add(x, y + 1); } else { add(x + 1, y); add(x + 1, y + 1); } }
  return deg;
}
