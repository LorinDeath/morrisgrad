// t1198: тест границы стен.  nice bun tools/strat/wall-edges-test.ts
import { edges, cellWalls, vertexDegrees, type Edge } from "../../src/scripts/strat/wall-edges";
let ok = 0, bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { bad++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } };
const shape = (rows: string[]) => { const c: [number, number][] = []; rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && c.push([x, y]))); return c; };
const perim = (c: [number, number][]) => { const S = new Set(c.map(([x, y]) => x + "," + y)); let p = 0; for (const [x, y] of c) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!S.has(x + dx + "," + (y + dy))) p++; return p; };
const sk = (E: Edge[]) => E.map((e) => `${e.x},${e.y}${e.d}`).sort();
function check(name: string, rows: string[], expEdges: number, expOuter: number, expInner: number) {
  const c = shape(rows), E = edges(c), own = (x: number, y: number) => rows[y]?.[x] === "#";
  eq(E.length, expEdges, name + ": рёбер"); eq(E.length, perim(c), name + ": = периметр");
  eq(new Set(sk(E)).size, E.length, name + ": без дублей");
  // ни одного внутреннего ребра: за каждым ребром — не своя клетка
  eq(E.every((e) => { const [dx, dy] = ({ n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as any)[e.d]; return !own(e.x + dx, e.y + dy); }), true, name + ": стены только наружу");
  eq([...vertexDegrees(E).values()].every((d) => d === 2 || d === 4), true, name + ": замкнуто (вершины 2/4)");
  let o = 0, i = 0, wallN = 0; for (const [x, y] of c) { const w = cellWalls(own, x, y); o += w.outer.length; i += w.inner.length; wallN += Object.values(w.wall).filter(Boolean).length; }
  eq(wallN, E.length, name + ": cellWalls = edges"); eq(o, expOuter, name + ": внешних углов"); eq(i, expInner, name + ": внутренних углов");
}
check("одна клетка", ["#"], 4, 4, 0);
check("квадрат 2×2", ["##", "##"], 8, 4, 0);
check("L", ["#.", "#.", "##"], 10, 5, 1);
check("U", ["#.#", "#.#", "###"], 16, 6, 2);
check("кольцо с дырой", ["###", "#.#", "###"], 16, 4, 4);
check("диагональ", ["#.", ".#"], 8, 8, 0);
check("плюс", [".#.", "###", ".#."], 12, 8, 4);
check("кольцо 5×5 с дырой 3×3", ["#####", "#...#", "#...#", "#...#", "#####"], 32, 4, 4);
// анклав: чужая клетка внутри — 4 стены вокруг неё изнутри
{ const c = shape(["###", "#.#", "###"]), E = edges(c); eq(E.filter((e) => (e.x === 1 && e.y === 0 && e.d === "s") || (e.x === 0 && e.y === 1 && e.d === "e") || (e.x === 2 && e.y === 1 && e.d === "w") || (e.x === 1 && e.y === 2 && e.d === "n")).length, 4, "дыра: 4 стены внутрь"); }
eq(sk(edges([[0, 0], [0, 0]])), sk(edges([[0, 0]])), "дубли клеток не удваивают стены");
console.log(`wall-edges: ${ok} ok, ${bad} fail`); if (bad) process.exit(1);
