// Рисованные кодом тайлы рельефа и построек в стиле варианта C (плоские заливки, жирная чистая линия #1a1014,
// ар-деко-мотивы; чёрный/золото/слоновая кость/красный + стихийные акценты). Заглушки до арта Художника
// (заказ: minigame-tz/art-request-terrain.md). Рельеф пререндерится в offscreen-canvas один раз на карту/размер.
import type { MapData } from "../../../server/strat/terrain";

export const INK = "#1a1014", GOLD = "#d9a441", GOLD2 = "#f3cf68", IVORY = "#efe6cf", RED = "#b3261e";
const C = {
  plain: ["#7f8b50", "#86935a"], meadow: "#93a05c", tuft: "#5f6e3a",
  forest: "#58733f", tree: "#2e5233", tree2: "#3f6b3f",
  mount: "#80747f", mountD: "#5b4f5c",
  water: "#2f6f9a", waterD: "#255a80", wave: "#a8d6ea",
  road: "#c9a96b", roadD: "#a88850",
  plank: "#9a6a3a", plankD: "#6f4a26",
  wall: "#4a3d50", wallL: "#62536a",
};
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

type Nb = (dx: number, dy: number) => string; // рельеф соседа в экранных направлениях ("?" — за краем)
function lw(c: number) { return Math.max(1.5, c * 0.045); }
function poly(ctx: CanvasRenderingContext2D, pts: number[][], fill: string, line = true, w = 0) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.lineWidth = w || ctx.lineWidth; ctx.strokeStyle = INK; ctx.stroke(); }
}
function ground(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, py: number, c: number, meadow = false) {
  ctx.fillStyle = meadow ? C.meadow : C.plain[hash(x, y) < 0.5 ? 0 : 1]; ctx.fillRect(px, py, c + 0.6, c + 0.6);
  if (meadow || hash(y, x) < 0.25) { // пучки травы — короткие штрихи «ар-деко»
    ctx.strokeStyle = C.tuft; ctx.lineWidth = Math.max(1, c * 0.03); ctx.lineCap = "round";
    for (let i = 0; i < (meadow ? 3 : 1); i++) { const a = px + c * (0.2 + 0.6 * hash(x + i * 7, y)), b = py + c * (0.25 + 0.6 * hash(x, y + i * 5));
      ctx.beginPath(); ctx.moveTo(a - c * 0.05, b); ctx.lineTo(a - c * 0.08, b - c * 0.08); ctx.moveTo(a, b); ctx.lineTo(a, b - c * 0.1); ctx.moveTo(a + c * 0.05, b); ctx.lineTo(a + c * 0.08, b - c * 0.08); ctx.stroke(); }
  }
}
function tree(ctx: CanvasRenderingContext2D, cx: number, by: number, s: number, col: string) {
  ctx.lineWidth = Math.max(1.2, s * 0.09);
  ctx.fillStyle = GOLD; ctx.fillRect(cx - s * 0.06, by - s * 0.22, s * 0.12, s * 0.22); ctx.strokeStyle = INK; ctx.strokeRect(cx - s * 0.06, by - s * 0.22, s * 0.12, s * 0.22);
  poly(ctx, [[cx, by - s], [cx + s * 0.38, by - s * 0.2], [cx - s * 0.38, by - s * 0.2]], col);
  ctx.strokeStyle = GOLD2; ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath(); ctx.moveTo(cx - s * 0.16, by - s * 0.45); ctx.lineTo(cx, by - s * 0.6); ctx.lineTo(cx + s * 0.16, by - s * 0.45); ctx.stroke();
}
function waterCell(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, py: number, c: number, nb: Nb) {
  ctx.fillStyle = C.water; ctx.fillRect(px, py, c + 0.6, c + 0.6);
  ctx.strokeStyle = C.wave; ctx.lineWidth = Math.max(1, c * 0.04); ctx.lineCap = "round";
  for (let i = 0; i < 2; i++) { const yy = py + c * (0.35 + i * 0.32), x0 = px + c * (0.18 + 0.12 * hash(x, y + i)); // шевроны волн
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + c * 0.12, yy - c * 0.07); ctx.lineTo(x0 + c * 0.24, yy); ctx.lineTo(x0 + c * 0.36, yy - c * 0.07); ctx.lineTo(x0 + c * 0.48, yy); ctx.stroke(); }
  // берег: жирная линия и золотая кромка там, где сосед — суша
  const wet = (t: string) => t === "w" || t === "b" || t === "?";
  ctx.lineCap = "butt";
  const edge = (dx: number, dy: number, x1: number, y1: number, x2: number, y2: number) => {
    if (wet(nb(dx, dy))) return;
    ctx.strokeStyle = IVORY; ctx.lineWidth = lw(c) * 2.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = lw(c); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  edge(0, -1, px, py, px + c, py); edge(0, 1, px, py + c, px + c, py + c); edge(-1, 0, px, py, px, py + c); edge(1, 0, px + c, py, px + c, py + c);
}
function roadBand(ctx: CanvasRenderingContext2D, px: number, py: number, c: number, nb: Nb) {
  const link = (t: string) => t === "r" || t === "b" || t === "g";
  const w = c * 0.34, cx = px + c / 2, cy = py + c / 2;
  const segs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => link(nb(dx, dy))) as any;
  if (!segs.length) segs.push([0, -1], [0, 1]);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const [col, ww] of [[INK, w + lw(c) * 2], [C.road, w]] as const) {
    ctx.strokeStyle = col; ctx.lineWidth = ww as number; ctx.beginPath();
    for (const [dx, dy] of segs) { ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * c * 0.52, cy + dy * c * 0.52); }
    ctx.stroke();
  }
  ctx.fillStyle = C.roadD; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(cx + (i ? 1 : -1) * w * 0.18, cy + (i ? -1 : 1) * w * 0.15, c * 0.025, 0, 7); ctx.fill(); }
}

/** Клетка рельефа. px,py — экранный угол клетки, nb — сосед в экранных направлениях. */
export function drawTerrainCell(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, px: number, py: number, c: number, nb: Nb) {
  ctx.lineJoin = "round";
  switch (t) {
    case "w": waterCell(ctx, x, y, px, py, c, nb); break;
    case "b": {
      waterCell(ctx, x, y, px, py, c, nb);
      const vert = nb(0, -1) !== "w" && nb(0, 1) !== "w"; // мост поперёк реки: река идёт слева-направо → настил вертикальный
      ctx.save(); ctx.translate(px + c / 2, py + c / 2); if (!vert) ctx.rotate(Math.PI / 2);
      ctx.lineWidth = lw(c); ctx.fillStyle = C.plank; ctx.fillRect(-c * 0.3, -c * 0.52, c * 0.6, c * 1.04); ctx.strokeStyle = INK; ctx.strokeRect(-c * 0.3, -c * 0.52, c * 0.6, c * 1.04);
      ctx.strokeStyle = C.plankD; ctx.lineWidth = Math.max(1, c * 0.025); for (let i = 1; i < 6; i++) { const yy = -c * 0.52 + (c * 1.04 * i) / 6; ctx.beginPath(); ctx.moveTo(-c * 0.3, yy); ctx.lineTo(c * 0.3, yy); ctx.stroke(); }
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = lw(c) * 0.8; for (const sx of [-1, 1]) { ctx.fillRect(sx * c * 0.34 - c * 0.04, -c * 0.5, c * 0.08, c * 1.0); ctx.strokeRect(sx * c * 0.34 - c * 0.04, -c * 0.5, c * 0.08, c * 1.0); }
      ctx.restore(); break;
    }
    case "f": {
      ground(ctx, x, y, px, py, c); ctx.fillStyle = C.forest; ctx.fillRect(px, py, c + 0.6, c + 0.6);
      const s = c * 0.5, h = hash(x, y);
      tree(ctx, px + c * 0.3, py + c * 0.58, s * (0.9 + h * 0.2), C.tree); tree(ctx, px + c * 0.7, py + c * 0.52, s * (1.0 - h * 0.15), C.tree2); tree(ctx, px + c * 0.5, py + c * 0.95, s * 0.95, C.tree);
      break;
    }
    case "m": {
      ground(ctx, x, y, px, py, c); ctx.lineWidth = lw(c);
      const h = hash(x, y);
      poly(ctx, [[px + c * 0.02, py + c * 0.92], [px + c * (0.3 + h * 0.06), py + c * 0.3], [px + c * 0.6, py + c * 0.92]], C.mountD);
      poly(ctx, [[px + c * 0.3, py + c * 0.95], [px + c * 0.62, py + c * 0.1], [px + c * 0.98, py + c * 0.95]], C.mount);
      poly(ctx, [[px + c * 0.62, py + c * 0.1], [px + c * 0.74, py + c * 0.42], [px + c * 0.65, py + c * 0.36], [px + c * 0.56, py + c * 0.45], [px + c * 0.51, py + c * 0.38]], IVORY);
      ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1, c * 0.03); ctx.beginPath(); ctx.moveTo(px + c * 0.62, py + c * 0.5); ctx.lineTo(px + c * 0.7, py + c * 0.9); ctx.stroke();
      break;
    }
    case "r": ground(ctx, x, y, px, py, c); roadBand(ctx, px, py, c, nb); break;
    case "#": case "g": {
      ground(ctx, x, y, px, py, c);
      const hz = nb(-1, 0) === "#" || nb(1, 0) === "#" || nb(-1, 0) === "g" || nb(1, 0) === "g" || !(nb(0, -1) === "#" || nb(0, 1) === "#");
      ctx.save(); ctx.translate(px + c / 2, py + c / 2); if (!hz) ctx.rotate(Math.PI / 2);
      const W = c * 1.02, H = c * 0.62; ctx.lineWidth = lw(c);
      if (t === "#") {
        ctx.fillStyle = C.wall; ctx.fillRect(-W / 2, -H / 2, W, H); ctx.strokeStyle = INK; ctx.strokeRect(-W / 2, -H / 2, W, H);
        ctx.strokeStyle = IVORY + "aa"; ctx.lineWidth = Math.max(1, c * 0.02);
        for (let r = 0; r < 3; r++) { const yy = -H / 2 + (H * (r + 1)) / 3; ctx.beginPath(); ctx.moveTo(-W / 2, yy); ctx.lineTo(W / 2, yy); ctx.stroke();
          for (let k = 0; k < 3; k++) { const xx = -W / 2 + W * ((k + (r % 2 ? 0.5 : 0)) / 3); ctx.beginPath(); ctx.moveTo(xx, yy - H / 3); ctx.lineTo(xx, yy); ctx.stroke(); } }
        ctx.fillStyle = GOLD; ctx.fillRect(-W / 2, -H / 2 - c * 0.06, W, c * 0.06); ctx.strokeStyle = INK; ctx.lineWidth = lw(c) * 0.7; ctx.strokeRect(-W / 2, -H / 2 - c * 0.06, W, c * 0.06);
      } else { // ворота: две башенки и арка с золотыми створками
        ctx.fillStyle = C.wall; for (const sx of [-1, 1]) { ctx.fillRect(sx > 0 ? W / 2 - c * 0.22 : -W / 2, -H / 2 - c * 0.08, c * 0.22, H + c * 0.08); ctx.strokeStyle = INK; ctx.strokeRect(sx > 0 ? W / 2 - c * 0.22 : -W / 2, -H / 2 - c * 0.08, c * 0.22, H + c * 0.08); }
        ctx.beginPath(); ctx.moveTo(-c * 0.29, H / 2); ctx.lineTo(-c * 0.29, -H * 0.05); ctx.arc(0, -H * 0.05, c * 0.29, Math.PI, 0); ctx.lineTo(c * 0.29, H / 2); ctx.closePath();
        ctx.fillStyle = GOLD; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(0, -H * 0.05 - c * 0.29); ctx.stroke();
        ctx.fillStyle = INK; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * c * 0.07, H * 0.12, c * 0.025, 0, 7); ctx.fill(); }
      }
      ctx.restore(); break;
    }
    default: ground(ctx, x, y, px, py, c, t === ",");
  }
}

/** Иконка постройки, центр (cx,cy), размер s (≈ 0.7 клетки). side — для точки спавна: цвет стороны. */
export function drawStruct(ctx: CanvasRenderingContext2D, ch: string, cx: number, cy: number, s: number, sideCol = GOLD) {
  ctx.save(); ctx.translate(cx, cy); ctx.lineJoin = "round"; ctx.lineCap = "round";
  const w = Math.max(1.3, s * 0.065); ctx.lineWidth = w; ctx.strokeStyle = INK;
  const R = (x: number, y: number, ww: number, hh: number, f: string) => { ctx.fillStyle = f; ctx.fillRect(x * s, y * s, ww * s, hh * s); ctx.strokeRect(x * s, y * s, ww * s, hh * s); };
  const P = (pts: number[][], f: string) => poly(ctx, pts.map(([a, b]) => [a * s, b * s]), f, true, w);
  const O = (x: number, y: number, r: number, f: string) => { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, 7); ctx.fillStyle = f; ctx.fill(); ctx.stroke(); };
  // медальон-подложка (ар-деко): тёмный круг с золотой каймой — постройку видно на любом рельефе
  if (ch !== "O" && ch !== "P") { ctx.beginPath(); ctx.arc(0, 0, s * 0.56, 0, 7); ctx.fillStyle = INK + "cc"; ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = w * 0.9; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = w; }
  switch (ch) {
    case "M": P([[-0.42, 0.32], [-0.2, -0.22], [0.2, -0.22], [0.42, 0.32]], "#8a6a4a"); P([[-0.15, 0.32], [-0.15, 0], [0, -0.12], [0.15, 0], [0.15, 0.32]], INK);
      O(0.27, 0.2, 0.08, GOLD2); O(-0.28, 0.22, 0.06, GOLD2); break;
    case "Q": R(-0.36, 0.06, 0.34, 0.24, "#9a8f99"); R(0.02, 0.06, 0.34, 0.24, "#b1a6af"); R(-0.17, -0.2, 0.34, 0.26, "#c9bfc6"); break;
    case "A": R(-0.38, 0.18, 0.76, 0.14, IVORY); R(-0.26, 0.02, 0.52, 0.16, IVORY); P([[0, -0.42], [0.14, -0.12], [0.06, 0.02], [-0.06, 0.02], [-0.14, -0.12]], RED); P([[0, -0.26], [0.06, -0.08], [-0.06, -0.08]], GOLD2); break;
    case "S": P([[-0.4, -0.12], [0, -0.42], [0.4, -0.12]], GOLD); R(-0.36, -0.12, 0.72, 0.06, IVORY); for (const x of [-0.28, -0.06, 0.16]) R(x, -0.06, 0.12, 0.3, IVORY); R(-0.4, 0.24, 0.8, 0.08, IVORY); break;
    case "V": P([[-0.42, 0.3], [-0.42, -0.02], [-0.22, -0.2], [-0.02, -0.02], [-0.02, 0.3]], IVORY); P([[-0.48, 0.0], [-0.22, -0.26], [0.04, 0.0]], RED);
      P([[0.02, 0.3], [0.02, 0.06], [0.2, -0.1], [0.38, 0.06], [0.38, 0.3]], IVORY); P([[-0.03, 0.08], [0.2, -0.16], [0.43, 0.08]], RED); R(-0.26, 0.12, 0.08, 0.18, INK); break;
    case "T": R(-0.17, -0.22, 0.34, 0.56, "#9a8f99"); for (const x of [-0.17, -0.05, 0.07]) R(x, -0.32, 0.1, 0.1, "#9a8f99"); R(-0.05, 0.14, 0.1, 0.2, INK);
      ctx.beginPath(); ctx.moveTo(0, -0.32 * s); ctx.lineTo(0, -0.52 * s); ctx.stroke(); P([[0, -0.52], [0.22, -0.46], [0, -0.4]], RED); break;
    case "W": R(-0.3, -0.04, 0.6, 0.32, "#9a8f99"); ctx.beginPath(); ctx.ellipse(0, -0.04 * s, 0.3 * s, 0.09 * s, 0, 0, 7); ctx.fillStyle = "#5fb0dc"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.26 * s, -0.04 * s); ctx.lineTo(-0.26 * s, -0.36 * s); ctx.moveTo(0.26 * s, -0.04 * s); ctx.lineTo(0.26 * s, -0.36 * s); ctx.stroke(); P([[-0.36, -0.34], [0, -0.5], [0.36, -0.34]], RED); break;
    case "R": R(-0.36, 0.2, 0.72, 0.1, IVORY); R(-0.3, -0.18, 0.12, 0.38, IVORY); P([[0.06, 0.2], [0.06, -0.06], [0.14, -0.14], [0.2, -0.02], [0.2, 0.2]], IVORY); R(-0.36, -0.26, 0.24, 0.08, IVORY); O(0.3, 0.14, 0.05, "#9a8f99"); break;
    case "X": P([[-0.1, 0.32], [-0.06, -0.3], [0, -0.44], [0.06, -0.3], [0.1, 0.32]], "#3a2f3f"); P([[-0.06, -0.3], [0, -0.44], [0.06, -0.3]], GOLD2); R(-0.24, 0.3, 0.48, 0.07, GOLD); break;
    case "D": R(-0.4, -0.02, 0.8, 0.14, "#9a6a3a"); for (const x of [-0.3, 0.0, 0.3]) R(x - 0.04, 0.12, 0.08, 0.22, "#6f4a26"); ctx.strokeStyle = "#a8d6ea"; ctx.beginPath(); ctx.moveTo(-0.4 * s, 0.3 * s); ctx.lineTo(0.4 * s, 0.3 * s); ctx.stroke(); ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(0.22 * s, -0.02 * s); ctx.lineTo(0.22 * s, -0.4 * s); ctx.stroke(); P([[0.22, -0.4], [-0.08, -0.12], [0.22, -0.12]], IVORY); break;
    case "O": { // место чуда: золотое кольцо с лучами (ар-деко «солнце»), пунктир
      ctx.setLineDash([s * 0.08, s * 0.06]); ctx.strokeStyle = GOLD2; ctx.lineWidth = w * 1.1; ctx.beginPath(); ctx.arc(0, 0, s * 0.44, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = INK; ctx.lineWidth = w; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; P([[Math.cos(a) * 0.1, Math.sin(a) * 0.1], [Math.cos(a + 0.18) * 0.3, Math.sin(a + 0.18) * 0.3], [Math.cos(a) * 0.36, Math.sin(a) * 0.36], [Math.cos(a - 0.18) * 0.3, Math.sin(a - 0.18) * 0.3]], i % 2 ? GOLD : IVORY); }
      O(0, 0, 0.1, RED); break;
    }
    case "P": ctx.beginPath(); ctx.ellipse(0, 0.3 * s, 0.4 * s, 0.13 * s, 0, 0, 7); ctx.fillStyle = sideCol + "88"; ctx.fill(); ctx.strokeStyle = GOLD; ctx.stroke(); ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(-0.2 * s, 0.3 * s); ctx.lineTo(-0.2 * s, -0.45 * s); ctx.stroke(); P([[-0.2, -0.45], [0.3, -0.32], [-0.2, -0.16]], sideCol); break;
  }
  ctx.restore();
}

const cache = new Map<string, HTMLCanvasElement>();
/** Пререндер рельефа (+ постройки) в offscreen-canvas. flip — вид со стороны игрока 1. */
export function terrainLayer(m: MapData, side: number, flip: boolean, sideCols: [string, string]): HTMLCanvasElement {
  const key = m.id + "|" + side + "|" + flip + "|" + sideCols.join() + "|" + m.t + m.s;
  const hit = cache.get(key); if (hit) return hit;
  if (cache.size > 6) cache.clear();
  const n = m.size, c = side / n, cv = document.createElement("canvas"); cv.width = cv.height = side;
  const ctx = cv.getContext("2d")!;
  const T = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? "?" : m.t[y * n + x]);
  const scr = (x: number, y: number) => (flip ? [n - 1 - x, n - 1 - y] : [x, y]);
  // порядок: сначала плоские клетки, потом выступающие (горы/лес/стены), чтобы контуры не перекрывались соседями
  const order = (t: string) => ("w b".includes(t) ? 0 : ".,r".includes(t) ? 1 : 2);
  const cells: [number, number][] = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push([x, y]);
  cells.sort((a, b) => order(T(a[0], a[1])) - order(T(b[0], b[1])) || scr(a[0], a[1])[1] - scr(b[0], b[1])[1]);
  for (const [x, y] of cells) {
    const [sx, sy] = scr(x, y), d = flip ? -1 : 1;
    drawTerrainCell(ctx, T(x, y), x, y, sx * c, sy * c, c, (dx, dy) => T(x + dx * d, y + dy * d));
  }
  // тонкая сетка — клетки читаются, но это не шахматная доска
  ctx.strokeStyle = "rgba(26,16,20,.22)"; ctx.lineWidth = 1;
  for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * c, 0); ctx.lineTo(i * c, side); ctx.moveTo(0, i * c); ctx.lineTo(side, i * c); ctx.stroke(); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ch = m.s[y * n + x]; if (ch === ".") continue; const [sx, sy] = scr(x, y);
    drawStruct(ctx, ch, (sx + 0.5) * c, (sy + 0.5) * c, c * 0.7, sideCols[y > (n - 1) / 2 ? 0 : 1]);
  }
  // рамка в стиле C: чёрная линия + золотая кайма
  ctx.lineWidth = Math.max(3, c * 0.08); ctx.strokeStyle = INK; ctx.strokeRect(0, 0, side, side);
  ctx.lineWidth = Math.max(1.5, c * 0.03); ctx.strokeStyle = GOLD; ctx.strokeRect(c * 0.06, c * 0.06, side - c * 0.12, side - c * 0.12);
  cache.set(key, cv); return cv;
}
