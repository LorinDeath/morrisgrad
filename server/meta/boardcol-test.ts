// Доски непроходимы, но не перекрывают проходы: заливка свободного места вокруг каждой доски с коллизией и без.
import { BOARD_CFG, syncBoardCols } from "./board";
import { setBoardCols, BOARD_COL } from "./boardCols";
import { blockedWorld, resolveWorld } from "./propCollision";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const R = 12, STEP = 6, HALF = 360;
function fill(world: string, cx: number, cy: number) {
  const n = Math.floor((2 * HALF) / STEP) + 1, free = new Uint8Array(n * n), seen = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) free[j * n + i] = blockedWorld(world, cx - HALF + i * STEP, cy - HALF + j * STEP, R) ? 0 : 1;
  // старт — самая большая область, найденная из свободных клеток по краю квадрата
  let best: Uint8Array | null = null, bestN = 0;
  for (let s = 0; s < n * n; s++) { const i = s % n, j = (s / n) | 0; if (!(i === 0 || j === 0 || i === n - 1 || j === n - 1) || !free[s] || seen[s]) continue;
    const comp = new Uint8Array(n * n), q = [s]; comp[s] = 1; seen[s] = 1; let c = 0;
    while (q.length) { const k = q.pop()!; c++; const x = k % n, y = (k / n) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= n || Y >= n) continue; const kk = Y * n + X; if (free[kk] && !seen[kk]) { seen[kk] = 1; comp[kk] = 1; q.push(kk); } } }
    if (c > bestN) { bestN = c; best = comp; } }
  return { n, free, comp: best!, size: bestN };
}
for (const kind of ["nb", "ab"] as const) {
  const C: any = BOARD_CFG, w = C[kind + "World"], x = Number(C[kind + "X"]), y = Number(C[kind + "Y"]), name = kind === "nb" ? "Доска объявлений" : "Доска достижений";
  syncBoardCols();
  ok(blockedWorld(w, x, y, R), `${name}: в центр доски не пройти`);
  const [px, py] = resolveWorld(w, x + 2, y + 1, R); ok(Math.hypot(px - x, py - y) > 10, `${name}: игрока выталкивает (${Math.round(px - x)},${Math.round(py - y)})`);
  const t0 = performance.now(); const on = fill(w, x, y); const dt = performance.now() - t0;
  setBoardCols([]); const off = fill(w, x, y); syncBoardCols();
  // всё, что было в главной области без доски и не занято доской, — по-прежнему в главной области
  let lost = 0; const pad = Math.max(BOARD_COL.rx, BOARD_COL.ry) + R + STEP;
  for (let k = 0; k < off.n * off.n; k++) if (off.comp[k] && !on.comp[k]) { const i = k % off.n, j = (k / off.n) | 0; const dx = -HALF + i * STEP, dy = -HALF + j * STEP; if (Math.abs(dx) > pad || Math.abs(dy) > pad) lost++; }
  ok(lost === 0, `${name} (${w} ${x},${y}): проходы не перекрыты — отрезано клеток вне доски: ${lost} (область ${on.size} из ${off.size}, ${dt.toFixed(0)} мс)`);
  // обойти доску вокруг: 16 точек на расстоянии 70 — свободные точки в одной области
  const pts: number[] = []; for (let a = 0; a < 16; a++) { const X = Math.round((70 * Math.cos(a * Math.PI / 8) + HALF) / STEP), Y = Math.round((70 * Math.sin(a * Math.PI / 8) + HALF) / STEP); const k = Y * on.n + X; if (on.free[k]) pts.push(k); }
  ok(pts.length >= 8 && pts.every((k) => on.comp[k]), `${name}: вокруг доски можно обойти (${pts.length}/16 свободных точек в одной области)`);
}
// доска выключена — коллизии нет
{ const C: any = BOARD_CFG; const was = C.on; C.on = false; syncBoardCols(); ok(!blockedWorld(C.abWorld, Number(C.abX), Number(C.abY), R), "доска выключена — коллизия снята"); C.on = was; syncBoardCols(); }
if (f) { console.log("FAILED " + f); process.exit(1); } else console.log("boardcol ok");
