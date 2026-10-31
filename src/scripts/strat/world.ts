// Мир партии поверх доски (этап 5): территория стенами по городам, прирост/покупка клеток, захват клеток, постройки с HP,
// стройка Вождём, основание поселения, скрытое здоровье, источники ОД.
// Формы данных — из WIP балансового воркера (server/strat/match.ts, econ.ts, hidehp.ts в mg-strat); старый сервер ветки
// strategy-ui их не шлёт, поэтому всё читается защитно и без полей просто не рисуется.
//   g.ec.cities[]: { bhp?{b:hp}, bhs?{b:"ok"|"hurt"|"low"|"dead"}, ruin?[b], grow?[cellIdx], set?(поселение) }
//   g.ec.towers[{id,owner,x,y}], g.ec.tbhp{id:hp} | tbhs{id:hs}; g.ec.lost{idx:1}; g.ec.ct{idx:{o,n}}; g.ec.fnd[side]{id,x,y,left,gold}
//   S.terr (только своя сторона) { cities:[{city,every,tg,ready,left,cost,cells:[[x,y]]}], fnd, ap, raceAp{n,have,per,cap,label,kind} }
//   S.league { id, apBase, apTech, apBld, onceMax, apMax, raceCap, grow, capture, found, ... }; S.bhp [{city,b:[{b,hp,max}|{b,hs}],ruin[]}]
//   Действия: build{b,id,x?,y?}, raze{id,city,b}, claim{city,x,y}, found{id}, found_cancel
//   ДОГАДКИ (нет в сервере): S.apSrc [{label,n}] — готовый разбор ОД; cfg {hiddenHp} в лобби; S.raze[pieceId] — цели по постройкам.
import { cellWalls } from "./wall-edges";
import type { GameState, Piece, StratCfg } from "../../../server/strat/rules";
import { attackTargets } from "../../../server/strat/rules";
import { BUILD, TECHS, type BuildId } from "../../../server/strat/econ-cfg";
import { canBuild, buildCost } from "../../../server/strat/econ";
import { openMap, passable } from "../../../server/strat/terrain";
import { ic, iconImg, BUILD_ICON } from "./icons";
import { esc } from "./ui-kit";
import { bSprite, bImg, drawAnchored, drawBanner, isBig, wonderStage, bCard, bLod, LOD_MAX } from "./bldart";
import { hpBarArt, hsBarArt, HS_STEP, drawCapture, drawSettleRing, uImg, BUY_MARKER } from "./ui2art";
import { cfgOf, rv, bName, ECON_ERR, type Ctx } from "./econ-ui";

type SX = (v: number) => number;
export const W = { mode: null as null | { k: "build"; b: string; tower: boolean } | { k: "claim"; city: number } };
export const HS_NAME: Record<string, string> = { ok: "цел", hurt: "ранен", low: "при смерти", dead: "уничтожен" };
export const HS_COL: Record<string, string> = { ok: "#7fc25a", hurt: "#e0b04a", low: "#c23a2a", dead: "#555" };

// ---------- территория ----------
let tKey: any = null, tVal: Int8Array = new Int8Array(0), cVal: Int16Array = new Int16Array(0);
/** Территория с учётом прироста (city.grow) и потерь (ec.lost); плюс карта «клетка → город». */
export function terrFull(G: GameState, base: ArrayLike<number>, key: any): { T: Int8Array; C: Int16Array } {
  if (key === tKey && tVal.length === base.length) return { T: tVal, C: cVal };
  const n = G.size, ec: any = G.ec, T = Int8Array.from(base as any), C = new Int16Array(n * n).fill(-1);
  for (const c of ec?.cities || []) for (const i of c.grow || []) if (i >= 0 && i < T.length) T[i] = c.owner;
  for (const k of Object.keys(ec?.lost || {})) T[+k] = -1;
  const cs: any[] = ec?.cities || [];
  for (const c of cs) for (const i of c.grow || []) if (T[i] === c.owner) C[i] = c.id;
  for (let i = 0; i < T.length; i++) { if (T[i] < 0 || C[i] >= 0) continue; const x = i % n, y = (i / n) | 0; let best = -1, bd = 1e9;
    for (const c of cs) { if (c.owner !== T[i]) continue; const d = Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) * 2 + (c.cap ? 0 : 1); if (d < bd) { bd = d; best = c.id; } }
    C[i] = best; }
  tKey = key; tVal = T; cVal = C; return { T, C };
}
export function cityName(G: GameState, id: number) { const c: any = G.ec?.cities.find((q) => q.id === id); return c ? c.name || (c.cap ? "Столица" : "Застава") : ""; }

// ---------- стены-границы ----------
// Процедурная заглушка по расе, пока Художник рисует walls-v1 (256 px на клетку, стена ~40 px). Когда в /strat/walls/manifest.json
// есть куски расы ({ "<race>": { edge, outer, inner } } — путь к PNG; edge — горизонтальная стена по верхнему краю клетки), берём их.
type WallSet = { edge?: HTMLImageElement; outer?: HTMLImageElement; inner?: HTMLImageElement };
const wallArt: Record<string, WallSet> = {}; let wallTried = false;
// Арт стен walls-v1 (Художник): /strat/walls/{walls|small|lod}/wall_<race>_<piece>.png (256/128/64), лента владельца wall_owner_band_<n|e|s|w>.png.
// Детали: straight_<d>, outer_<nw|ne|sw|se>, inner_<..>, end_<d>(_rev). Сборка — по manifest.assembly (src/assemble.py).
type Tier = "walls" | "small" | "lod";
const TIER_PX: Record<Tier, number> = { walls: 256, small: 128, lod: 64 };
let wallMan: { races: Set<string>; files: Map<string, string>; band: Record<Tier, number>; v2: boolean; hole: Record<string, Record<string, number[]>> } | null = null, wallRedraw: () => void = () => {};
const wallImg = new Map<string, HTMLImageElement | null>(), tintCache = new Map<string, HTMLCanvasElement>();
export function loadWalls(redraw: () => void) {
  if (wallTried) return; wallTried = true; wallRedraw = redraw;
  fetch("/strat/walls/manifest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((m: any) => {
    if (!m?.files?.length) return; const files = new Map<string, string>();
    const band: Record<Tier, number> = { walls: +m.bands?.walls || +m.band || 48, small: +m.bands?.small || 0, lod: +m.bands?.lod || 0 };
    for (const f of m.files) if (f?.path && f?.tier && f.tier in TIER_PX) { if (f.band && f.kind !== "owner_band") band[f.tier as Tier] ||= +f.band; }
    band.small ||= band.walls / 2; band.lod ||= band.small / 2; // ширина полосы и квадрат угла — из manifest (48/36/18), не константа
    for (const f of m.files) if (f?.path && f?.tier) files.set(f.tier + "/" + (f.key || f.path.split("/").pop().replace(".png", "")), "/strat/walls/" + f.path);
    for (const d of "nesw") for (const t of ["walls", "small", "lod"]) files.set(`${t}/wall_owner_band_${d}`, `/strat/walls/${t}/wall_owner_band_${d}.png`);
    wallMan = { races: new Set(Object.keys(m.races || {})), files, band, v2: false, hole: {} }; redraw();
    // walls-v2: ворота (gate_<d>, _open), общая стена союзников (shared_<d>, shared_post_<угол>), фронт (border_front_<d> + split_<d>_a/_b)
    return fetch("/strat/walls/manifest-v2.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((m2: any) => {
      if (!m2?.files?.length || !wallMan) return;
      for (const f of m2.files) if (f?.path && f?.tier) wallMan.files.set(f.tier + "/" + f.key, "/strat/walls/" + f.path);
      wallMan.hole = m2.gate?.hole_box || {}; wallMan.v2 = true; redraw(); });
  }).catch(() => {});
}
function wimg(tier: Tier, key: string): HTMLImageElement | null {
  const k = tier + "/" + key; if (wallImg.has(k)) { const im = wallImg.get(k)!; return im && im.complete && im.naturalWidth ? im : null; }
  const src = wallMan?.files.get(k); if (!src) { wallImg.set(k, null); return null; }
  const im = new Image(); wallImg.set(k, im); im.onload = () => wallRedraw(); im.onerror = () => wallImg.set(k, null); im.src = src; return null;
}
/** Квадрат угла (башня/столб) под лентой не красится: B×B в пикселях тира (corner_box в assemble.py). */
const cornerBox = (c: string, S: number, B: number): [number, number, number, number] => { const x0 = c.includes("e") ? S - B : 0, y0 = c.includes("s") ? S - B : 0; return [x0, y0, B, B]; };
/** Деталь стены + лента цвета владельца (как owner_overlay/tint в assemble.py / assemble2.py), кэш по детали/цвету/тиру.
 * band: v1-детали и ворота (лента края, у ворот проём hole_box очищен); shared — wall_owner_band_shared_<d>; front — split_<d>_a цветом col, _b цветом col2; post — без ленты. */
function wallPiece(race: string, piece: string, col: string, tier: Tier, col2?: string): HTMLCanvasElement | null {
  const ck = `${tier}|${race}|${piece}|${col}|${col2 || ""}`, hit = tintCache.get(ck); if (hit) return hit;
  const front = piece.startsWith("border_front_"), w = wimg(tier, front ? `wall_${piece}` : `wall_${race}_${piece}`); if (!w) return null;
  const parts = piece.split("_"), kind = parts[0], d = piece.slice(-1);
  const S = TIER_PX[tier], cv = document.createElement("canvas"); cv.width = cv.height = S; const c = cv.getContext("2d")!;
  const tinted = (masks: HTMLImageElement[], cl: string, hole?: number[]) => { const t = document.createElement("canvas"); t.width = t.height = S; const x = t.getContext("2d")!;
    for (const b of masks) x.drawImage(b, 0, 0, S, S); x.globalCompositeOperation = "multiply"; x.fillStyle = cl; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = "destination-in"; for (const b of masks) x.drawImage(b, 0, 0, S, S); x.drawImage(w, 0, 0, S, S);
    if (hole) x.clearRect(hole[0], hole[1], hole[2] - hole[0], hole[3] - hole[1]); return t; };
  c.drawImage(w, 0, 0, S, S);
  if (kind === "shared" && parts[1] === "post") { /* столбик — без ленты */ }
  else if (kind === "shared") { const m = wimg(tier, "wall_owner_band_shared_" + d); if (!m) return null; c.drawImage(tinted([m], col), 0, 0); }
  else if (front) { const ma = wimg(tier, `wall_owner_band_split_${d}_a`), mb = wimg(tier, `wall_owner_band_split_${d}_b`); if (!ma || !mb) return null;
    c.drawImage(tinted([ma], col), 0, 0); c.drawImage(tinted([mb], col2 || col), 0, 0); }
  else { const edges = kind === "straight" || kind === "end" || kind === "gate" ? [parts[1]] : parts[1].split("");
    const bands = edges.map((e) => wimg(tier, "wall_owner_band_" + e)); if (bands.some((b) => !b)) return null; // lod/ — своя тонкая лента ≈6 px (walls-v1 v1.1)
    const t = tinted(bands as HTMLImageElement[], col, kind === "gate" ? wallMan!.hole[tier]?.[parts[1]] : undefined);
    if (kind === "outer" || kind === "inner") { const [x0, y0, bw, bh] = cornerBox(parts[1], S, wallMan!.band[tier] || S * 0.1875); t.getContext("2d")!.clearRect(x0, y0, bw, bh); }
    c.drawImage(t, 0, 0); }
  if (tintCache.size > 600) tintCache.clear(); tintCache.set(ck, cv); return cv;
}
/** Опции стен: сторона/союз владельца (общая стена союзников), режим фронта врагов, открытые ворота. */
export type WallOpts = { side?: (owner: number) => number; front?: boolean; gateOpen?: (x: number, y: number, X: number, Y: number) => boolean };
/** Ярус арта стен: walls-v2 «телефонное» правило — клетка ≤48 CSS px → lod (small там мельчит), дальше по пикселям устройства. */
export const wallTier = (z: number): Tier => (z <= 48 ? "lod" : z * (devicePixelRatio || 1) > 140 ? "walls" : "small");
/** Сборка стен из арта в экранных направлениях (доска может быть развёрнута). false — арт ещё не готов, рисуем процедурно.
 * Правила walls-v2 (assemble2.layout): союзные города — одна область, общее ребро рисует меньший id (shared_<d> + столбики);
 * враги — двойная стена (каждый свой straight) или, при front, частокол border_front_<d> + лента split A/B; ворота — вместо straight_<d> там, где подходит дорога. */
function drawWallsArt(ctx: CanvasRenderingContext2D, G: GameState, T: Int8Array, C: Int16Array, z: number, sx: SX, sy: SX, vis: (x: number, y: number) => boolean, col: (s: number) => string, o: WallOpts = {}): boolean {
  if (!wallMan) return false; const n = G.size, tier: Tier = wallTier(z), v2 = wallMan.v2, front = v2 && !!o.front, sideOf = o.side || ((q: number) => q);
  // экранное направление → сдвиг по сетке
  const g2s = (dx: number, dy: number) => { const ux = Math.sign(sx(dx) - sx(0)) || 0, uy = Math.sign(sy(dy) - sy(0)) || 0; return ux > 0 ? "e" : ux < 0 ? "w" : uy > 0 ? "s" : "n"; };
  const D: Record<string, [number, number]> = {}; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) D[g2s(dx, dy)] = [dx, dy];
  if (Object.keys(D).length < 4) return false;
  const tt: string = (G as any).map?.t || "", inb = (X: number, Y: number) => X >= 0 && Y >= 0 && X < n && Y < n;
  const road = (X: number, Y: number) => inb(X, Y) && (tt[Y * n + X] === "r" || tt[Y * n + X] === "b");
  // owner города по id (первая клетка)
  const ownC = new Map<number, number>(); for (let i = 0; i < n * n; i++) if (C[i] >= 0 && !ownC.has(C[i])) ownC.set(C[i], T[i]);
  let missing = false; const jobs: [HTMLCanvasElement, number, number][] = [];
  const frontE = new Map<string, { x: number; y: number; d: string; o: number }>(); // «частокол» на стыке с врагом (front) — у хозяина ребра
  const cellJobs = new Map<number, string[]>();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, cid = C[i]; if (cid < 0) continue;
    const at = (d: string, k = 1) => { const [dx, dy] = D[d]; return [x + dx * k, y + dy * k] as const; };
    const cAt = (X: number, Y: number) => (inb(X, Y) ? C[Y * n + X] : -1), sd = sideOf(T[i]);
    // t1198 (правило Алекса): стена — на каждом ребре, за которым нет СВОЕЙ/союзной клетки (wall-edges.ts); между своими городами стен нет.
    // front: стык с врагом рисуется частоколом (одним на ребро), а не двумя стенами.
    const ownAt = (X: number, Y: number) => cAt(X, Y) >= 0 && sideOf(T[Y * n + X]) === sd;
    const foeAt = (X: number, Y: number) => front && cAt(X, Y) >= 0 && !ownAt(X, Y);
    const region = (X: number, Y: number) => ownAt(X, Y) || foeAt(X, Y);
    // экранные смещения (ex, ey) → сетка (учёт разворота доски); куски клетки — из cellWalls (wall-edges.ts, покрыт тестом)
    const scr = (ex: number, ey: number) => { const a = ex ? D[ex > 0 ? "e" : "w"] : [0, 0], b = ey ? D[ey > 0 ? "s" : "n"] : [0, 0]; return region(x + a[0] + b[0], y + a[1] + b[1]); };
    const cw = cellWalls(scr, 0, 0), wallE: Record<string, boolean> = cw.wall;
    const pieces: string[] = [], used = new Set<string>();
    for (const cn of cw.outer) { pieces.push("outer_" + cn); used.add(cn[0]); used.add(cn[1]); }
    const side: Record<string, [string, string]> = { n: ["w", "e"], s: ["w", "e"], e: ["n", "s"], w: ["n", "s"] };
    for (const d of "nesw") { if (!wallE[d] || used.has(d)) continue; const [l, r] = side[d];
      // ворота: дорога подходит к краю d (клетка дороги внутри и снаружи), и вдоль стены по обе стороны — та же стена (не у угла)
      const [lx, ly] = at(l), [rx, ry] = at(r);
      const [ddx, ddy] = D[d], walled = (ax: number, ay: number) => cAt(ax, ay) === cid && !region(ax + ddx, ay + ddy);
      const cand = (ax: number, ay: number) => road(ax, ay) && road(ax + ddx, ay + ddy);
      // середина стороны ≥3 клеток, не у угла; одни ворота на участок — у соседней дороги-кандидата слева ворот нет (берём первую)
      const gate = v2 && cand(x, y) && walled(lx, ly) && walled(rx, ry) && !(cand(lx, ly) && walled(...at(l, 2)) && walled(x, y));
      pieces.push(gate ? `gate_${d}${o.gateOpen?.(x, y, ...at(d)) ? "_open" : ""}` : "straight_" + d); }
    for (const cn of cw.inner) pieces.push("inner_" + cn);
    if (v2 && front) for (const d of "nesw") { const [X, Y] = at(d), c2 = cAt(X, Y); if (foeAt(X, Y) && Math.min(cid, c2) === cid) frontE.set(`${x},${y},${d}`, { x, y, d, o: c2 }); }
    cellJobs.set(i, pieces); }
  const raceOf = (cid: number) => { const r = G.races[ownC.get(cid)!]; return wallMan!.races.has(r) ? r : "stone"; };
  const push = (cv: HTMLCanvasElement | null, x: number, y: number) => { if (!cv) { missing = true; return; } jobs.push([cv, sx(x), sy(y)]); };
  for (const [i, pieces] of cellJobs) { const x = i % n, y = (i / n) | 0; if (!vis(x, y)) continue; const cid = C[i], race = raceOf(cid), pc = col(T[i]);
    for (const e of "nesw") { const s0 = frontE.get(`${x},${y},${e}`); if (s0) push(wallPiece(race, "border_front_" + e, pc, tier, col(ownC.get(s0.o)!)), x, y); }
    for (const p of pieces) push(wallPiece(race, p, pc, tier), x, y); }
  if (missing && !jobs.length) return false;
  for (const [cv, X, Y] of jobs) ctx.drawImage(cv, X, Y, z, z);
  return true;
}
const WALL: Record<string, { base: string; hi: string; mort: string; kind: "brick" | "shard" | "stake" | "coral" | "plate" }> = {
  fire: { base: "#3a1d14", hi: "#b8502a", mort: "#ff8a3d", kind: "brick" }, stone: { base: "#5b4a36", hi: "#c9ad84", mort: "#2a2016", kind: "brick" },
  ice: { base: "#4f7fa3", hi: "#e6f6ff", mort: "#24425e", kind: "shard" }, nature: { base: "#5a3b1e", hi: "#a8743e", mort: "#2a1a0a", kind: "stake" },
  water: { base: "#1d5d72", hi: "#6fd0d8", mort: "#0c2c38", kind: "coral" }, lightning: { base: "#2d2a44", hi: "#8f87c9", mort: "#ffe14d", kind: "plate" },
};
/** Стены по краю земли каждого города (стыки краёв, внешние и внутренние углы); между своими городами — тоньше. */
export function drawWalls(ctx: CanvasRenderingContext2D, G: GameState, T: Int8Array, C: Int16Array, z: number, sx: SX, sy: SX, vis: (x: number, y: number) => boolean, col: (s: number) => string, wo: WallOpts = {}) {
  const n = G.size; if (z < 7) return; if (drawWallsArt(ctx, G, T, C, z, sx, sy, vis, col, wo)) return; const t = Math.max(2.5, z * 0.15), sideOf = wo.side || ((q: number) => q);
  const cx = (x: number) => sx(x) + z / 2, cy = (y: number) => sy(y) + z / 2;
  ctx.save();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, cid = C[i]; if (cid < 0 || !vis(x, y)) continue;
    const o = T[i], race = G.races[o] || "stone", st = WALL[race] || WALL.stone, art = wallArt[race];
    // t1198: стена — только по внешней границе своей/союзной земли (wall-edges.ts), между своими городами стен нет
    const other = (X: number, Y: number) => X < 0 || Y < 0 || X >= n || Y >= n || C[Y * n + X] < 0 || sideOf(T[Y * n + X]) !== sideOf(o);
    const thin = (_X: number, _Y: number) => false;
    const N = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const, wall = N.map(([dx, dy]) => other(x + dx, y + dy));
    for (let k = 0; k < 4; k++) { if (!wall[k]) continue; const [dx, dy] = N[k];
      // экранное направление наружу (учёт разворота доски)
      const ux = Math.sign(cx(x + dx) - cx(x)), uy = Math.sign(cy(y + dy) - cy(y)), X0 = sx(x), Y0 = sy(y), th = thin(x + dx, y + dy) ? t * 0.55 : t;
      const r = ux > 0 ? [X0 + z - th, Y0, th, z] : ux < 0 ? [X0, Y0, th, z] : uy > 0 ? [X0, Y0 + z - th, z, th] : [X0, Y0, z, th];
      const ang = ux > 0 ? Math.PI / 2 : ux < 0 ? -Math.PI / 2 : uy > 0 ? Math.PI : 0;
      if (art?.edge) { ctx.save(); ctx.translate(X0 + z / 2, Y0 + z / 2); ctx.rotate(ang); ctx.drawImage(art.edge, -z / 2, -z / 2, z, z); ctx.restore(); }
      else wallSeg(ctx, r[0], r[1], r[2], r[3], st, col(o), ux !== 0, (x * 31 + y * 17 + k) | 0, ux > 0 || uy > 0); }
    // углы: внешний (две стены сходятся) — башенка; внутренний (диагональ чужая, стороны свои) — заполняем стык
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    for (const [dx, dy] of corners) { const wx = other(x + dx, y), wy = other(x, y + dy), wd = other(x + dx, y + dy);
      const ux = Math.sign(cx(x + dx) - cx(x)), uy = Math.sign(cy(y + dy) - cy(y)), PX = ux > 0 ? sx(x) + z : sx(x), PY = uy > 0 ? sy(y) + z : sy(y);
      if (wx && wy) { const s = t * 1.35, bx = ux > 0 ? PX - s : PX, by = uy > 0 ? PY - s : PY;
        if (art?.outer) { ctx.save(); ctx.translate(sx(x) + z / 2, sy(y) + z / 2); ctx.rotate(Math.atan2(uy, ux) - Math.PI / 4 - Math.PI / 2); ctx.drawImage(art.outer, -z / 2, -z / 2, z, z); ctx.restore(); }
        else { ctx.fillStyle = st.base; ctx.fillRect(bx, by, s, s); ctx.fillStyle = st.hi; ctx.fillRect(bx + s * 0.18, by + s * 0.18, s * 0.64, s * 0.64); ctx.strokeStyle = "#140f18"; ctx.lineWidth = Math.max(1, z * 0.02); ctx.strokeRect(bx, by, s, s);
          ctx.fillStyle = col(o); ctx.fillRect(bx + s * 0.34, by + s * 0.34, s * 0.32, s * 0.32); } }
      else if (!wx && !wy && wd) { const bx = ux > 0 ? PX - t : PX, by = uy > 0 ? PY - t : PY;
        if (art?.inner) { ctx.save(); ctx.translate(sx(x) + z / 2, sy(y) + z / 2); ctx.rotate(Math.atan2(uy, ux) - Math.PI / 4 - Math.PI / 2); ctx.drawImage(art.inner, -z / 2, -z / 2, z, z); ctx.restore(); }
        else { ctx.fillStyle = st.base; ctx.fillRect(bx, by, t, t); ctx.fillStyle = st.hi; ctx.fillRect(bx + t * 0.25, by + t * 0.25, t * 0.5, t * 0.5); } } }
  }
  ctx.restore();
}
function wallSeg(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, st: (typeof WALL)[string], pc: string, vert: boolean, seed: number, far: boolean) {
  const L = vert ? h : w, T = vert ? w : h, lw = Math.max(1, T * 0.12);
  ctx.fillStyle = st.base; ctx.fillRect(x, y, w, h);
  const seg = (a: number, len: number, inset: number, f: string) => { ctx.fillStyle = f; if (vert) ctx.fillRect(x + inset, y + a, T - inset * 2, len); else ctx.fillRect(x + a, y + inset, len, T - inset * 2); };
  const k = Math.max(2, Math.round(L / (T * 1.6)));
  if (st.kind === "brick" || st.kind === "coral" || st.kind === "plate") {
    for (let i = 0; i < k; i++) { const a = (i / k) * L, len = L / k; seg(a + lw * 0.5, len - lw, lw, i % 2 ? st.hi : shade(st.hi, -0.12));
      if (st.kind === "plate") { ctx.fillStyle = st.mort; const r = Math.max(0.8, T * 0.08), px = vert ? x + T / 2 : x + a + len / 2, py = vert ? y + a + len / 2 : y + T / 2; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); } }
    if (st.kind === "coral") { ctx.strokeStyle = st.mort; ctx.lineWidth = lw; ctx.beginPath(); for (let i = 0; i <= k * 2; i++) { const a = (i / (k * 2)) * L, o = (i % 2 ? 0.3 : 0.7) * T; vert ? ctx.lineTo(x + o, y + a) : ctx.lineTo(x + a, y + o); } ctx.stroke(); }
    else if (st.kind === "brick") { ctx.fillStyle = st.mort; for (let i = 1; i < k; i++) { const a = (i / k) * L; vert ? ctx.fillRect(x, y + a - lw / 2, T, lw) : ctx.fillRect(x + a - lw / 2, y, lw, T); } } }
  else if (st.kind === "shard") { for (let i = 0; i < k; i++) { const a = (i / k) * L, len = L / k, hh = T * (0.55 + 0.4 * (((seed + i) * 7) % 5) / 5);
      ctx.fillStyle = i % 2 ? st.hi : shade(st.hi, -0.2); ctx.beginPath();
      if (vert) { const bx = far ? x + T : x, d = far ? -1 : 1; ctx.moveTo(bx, y + a); ctx.lineTo(bx + d * hh, y + a + len / 2); ctx.lineTo(bx, y + a + len); }
      else { const by = far ? y + T : y, d = far ? -1 : 1; ctx.moveTo(x + a, by); ctx.lineTo(x + a + len / 2, by + d * hh); ctx.lineTo(x + a + len, by); }
      ctx.closePath(); ctx.fill(); } }
  else if (st.kind === "stake") { const m = Math.max(3, Math.round(L / (T * 0.7))); for (let i = 0; i < m; i++) { const a = (i / m) * L, len = L / m;
      seg(a + lw * 0.4, len - lw * 0.8, 0, i % 2 ? st.hi : shade(st.hi, -0.15)); } ctx.fillStyle = st.mort; vert ? ctx.fillRect(x, y, T, lw) : ctx.fillRect(x, y, lw, T); }
  // кромка цвета игрока по внешнему краю + чернильный контур
  ctx.fillStyle = pc; const e = Math.max(1.5, T * 0.22);
  if (vert) ctx.fillRect(far ? x + w - e : x, y, e, h); else ctx.fillRect(x, far ? y + h - e : y, w, e);
  ctx.strokeStyle = "#140f18"; ctx.lineWidth = Math.max(0.8, T * 0.08); ctx.strokeRect(x, y, w, h);
}
function shade(hex: string, k: number) { const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, "0")).join(""); }

// ---------- постройки: HP, башни, цели для удара ----------
export type BRow = { b: string; hp?: number; max?: number; hs?: string; ruin?: boolean };
const bMax = (cfg: StratCfg, b: string) => { const c: any = cfg; const t = c.buildTpl?.[b]?.type || (b === "wonder" ? "wonder" : "special"); return c.bldHp?.type?.[t]?.hp ?? (b === "watchtower" ? c.econ?.tower?.hp ?? 16 : 10); };
/** Строки HP построек города: из S.bhp (полные), иначе из city.bhp/bhs + cfg. */
export function cityBld(S: any, G: GameState, c: any, cfg: StratCfg): BRow[] {
  const srv = (S?.bhp || []).find((r: any) => r.city === c.id);
  const rows: BRow[] = srv ? srv.b.map((r: any) => ({ b: r.b, hp: r.hp, max: r.max, hs: r.hs })) : (c.bld || []).filter((b: string) => c.bhp?.[b] != null || c.bhs?.[b]).map((b: string) => ({ b, hp: c.bhp?.[b], max: bMax(cfg, b), hs: c.bhs?.[b] }));
  for (const b of srv?.ruin || c.ruin || []) rows.push({ b, ruin: true, hp: 0, max: bMax(cfg, b), hs: "dead" });
  return rows;
}
export const towersOf = (G: GameState): any[] => ((G.ec as any)?.towers || []) as any[];
export function towerHp(G: GameState, t: any, cfg: StratCfg): BRow { const ec: any = G.ec; return { b: "watchtower", hp: ec?.tbhp?.[t.id] ?? (ec?.tbhs ? undefined : bMax(cfg, "watchtower")), max: bMax(cfg, "watchtower"), hs: ec?.tbhs?.[t.id] }; }
/** Полоса ОЗ постройки в рамке ui-v2 (hp_bar_frame / _enemy): x,w — жёлоб, рамка выступает на 1,25·h с боков. */
function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fr: number, hs?: string, enemy = false, redraw?: () => void) {
  const fill = hs ? HS_COL[hs] || "#888" : fr > 0.5 ? "#c9a24a" : fr > 0.25 ? "#e07a2a" : "#c23a2a";
  if (hs && hsBarArt(ctx, x - h * 1.25, y, w + h * 2.5, h, hs, redraw)) return; // аудит п.5: готовая полоса 3 ячейки
  hpBarArt(ctx, x - h * 1.25, y, w + h * 2.5, h, hs ? (HS_STEP[hs] ?? 0) / 3 : fr, fill, enemy, redraw, hs ? 3 : 0); // M4: скрытое — 3 ступени
}
/** Раскладка построек города по клеткам его земли (сервер позиций не шлёт): по порядку постройки, ближние клетки первыми;
 *  чудо/легенда — первый свободный блок 2×2. Ключ — состав, так что старые постройки не «прыгают» при новых. */
const layCache = new Map<number, { k: string; v: Map<string, { x: number; y: number; big: boolean }> }>();
/** вторая клетка столицы terrain-v2 (арт 2×1): восточная по карте, если она суша и свободна, иначе западная */
export function capPair(G: GameState, ct: any): number { const n = G.size, m: any = (G as any).map || openMap(n);
  const okc = (x: number) => x >= 0 && x < n && !"w#m".includes(m.t?.[ct.y * n + x] || ".") && (!m.s?.[ct.y * n + x] || m.s[ct.y * n + x] === ".");
  return okc(ct.x + 1) ? ct.x + 1 : okc(ct.x - 1) ? ct.x - 1 : ct.x + 1 < n ? ct.x + 1 : ct.x - 1; }
export function cityLayout(G: GameState, C: Int16Array | null, ct: any, items: string[]): Map<string, { x: number; y: number; big: boolean }> {
  const n = G.size, m: any = (G as any).map || openMap(n), k = items.join(",") + "|" + (C ? C.length : 0) + "|" + n + "|" + (C ? Array.from(C).reduce((a, v, i) => (v === ct.id ? a + i : a), 0) : 0);
  const hit = layCache.get(ct.id); if (hit && hit.k === k) return hit.v;
  const towers = new Set(towersOf(G).map((t) => t.y * n + t.x)), cities = new Set((G.ec?.cities || []).map((q: any) => q.y * n + q.x));
  for (const q of G.ec?.cities || []) if ((q as any).cap) cities.add(q.y * n + capPair(G, q)); // столица terrain-v2 занимает 2 клетки
  const R = 1, near = (x: number, y: number) => Math.max(Math.abs(x - ct.x), Math.abs(y - ct.y));
  // своя земля города; если мест не хватает — ничья клетка рядом (до 2), только для картинки
  const ok = (x: number, y: number) => { if (x < 0 || y < 0 || x >= n || y >= n) return false; const i = y * n + x;
    if (C ? !(C[i] === ct.id || (C[i] < 0 && near(x, y) <= 2)) : near(x, y) > R) return false; if (cities.has(i) || towers.has(i)) return false;
    const t = m.t?.[i] || "."; if (t === "#" || t === "w" || t === "m") return false; const st = m.s?.[i]; return !st || st === "."; };
  const cand: [number, number][] = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (ok(x, y)) cand.push([x, y]);
  const d = (c: [number, number]) => Math.max(Math.abs(c[0] - ct.x), Math.abs(c[1] - ct.y)) * 10 + Math.abs(c[0] - ct.x) + Math.abs(c[1] - ct.y);
  const own = (c: [number, number]) => (C && C[c[1] * n + c[0]] !== ct.id ? 1000 : 0);
  cand.sort((A, B) => own(A) + d(A) - own(B) - d(B) || A[1] - B[1] || A[0] - B[0]);
  const used = new Set<number>(), out = new Map<string, { x: number; y: number; big: boolean }>(), free = (x: number, y: number) => ok(x, y) && !used.has(y * n + x);
  for (const b of items) { const big = isBig(b);
    if (big) { const c = cand.find(([x, y]) => free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) || cand.find(([x, y]) => free(x, y));
      if (!c) continue; const [x, y] = c; const full = free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1);
      for (const [dx, dy] of full ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) used.add((y + dy) * n + x + dx); out.set(b, { x, y, big: full }); continue; }
    const c = cand.find(([x, y]) => free(x, y)); if (!c) continue; used.add(c[1] * n + c[0]); out.set(b, { x: c[0], y: c[1], big: false }); }
  layCache.set(ct.id, { k, v: out }); return out;
}
/** Постройки на доске: спрайты Художника на клетках земли города + полоса HP под каждой; баннер с именем над городом; башни. */
export function drawBuildings(ctx: CanvasRenderingContext2D, c: Ctx, z: number, sx: SX, sy: SX, vis: (x: number, y: number) => boolean, hideOwn: boolean, C: Int16Array | null = null) {
  const { G, S } = c, cfg = cfgOf(S); if (!G.ec || z < 14) return;
  const n = G.size, bh = Math.max(4, z * 0.075);
  type DI = { Y: number; sprite: () => void; over: () => void };
  const L: DI[] = [], banners: (() => void)[] = [];
  for (const ct of G.ec.cities as any[]) { if (!vis(ct.x, ct.y)) continue; const race = G.races[ct.owner] || "fire";
    const rows = cityBld(S, G, ct, cfg), live = [...new Set<string>(ct.bld || [])], ruins = rows.filter((r) => r.ruin).map((r) => r.b);
    const stg = wonderStage(ct); if (stg && stg < 4 && !live.includes("wonder")) live.push("wonder");
    const items = [...live, ...ruins.filter((b) => !live.includes(b))], lay = cityLayout(G, C, ct, items);
    const showBar = !(hideOwn && ct.owner === S.you && rows.every((r) => (r.hp ?? 1) >= (r.max ?? 1)));
    const lv2 = (ct.bld || []).filter((b: string) => b === "forge").length >= 2;
    for (const b of items) { const p = lay.get(b); if (!p || !vis(p.x, p.y)) continue; const ruin = !live.includes(b), r = rows.find((q) => q.b === b && !!q.ruin === ruin);
      const big = p.big, X0 = big ? Math.min(sx(p.x), sx(p.x + 1)) : sx(p.x), Y0 = big ? Math.min(sy(p.y), sy(p.y + 1)) : sy(p.y), W = big ? 2 * z : z;
      const st = b === "wonder" ? stg : 0, src = bSprite(b, race, { lv2: b === "forge" && lv2, stage: st && st < 4 ? st : 0 });
      const lodSrc = !big && z <= LOD_MAX && !ruin ? bLod(b) : null; // телефон/дальний зум: плоский LOD 64
      L.push({ Y: Y0 + W, sprite: () => { const lim = lodSrc ? bImg(lodSrc, c.redraw) : null, im = lim || (src ? bImg(src, c.redraw) : null);
        ctx.save(); if (ruin) { ctx.filter = "grayscale(1) brightness(0.55)"; ctx.globalAlpha = 0.85; }
        ctx.fillStyle = c.col(ct.owner) + "40"; ctx.beginPath(); ctx.ellipse(X0 + W / 2, Y0 + W * 0.86, W * 0.36, W * 0.09, 0, 0, 7); ctx.fill();
        if (lim) drawAnchored(ctx, lim, X0 + W / 2, Y0 + W * 0.9, W, false, true);
        else if (im) drawAnchored(ctx, im, X0 + W / 2, Y0 + W * 0.9, W * (big ? 1.25 : 1.15), big || isBig(b));
        else { const ii = iconImg(BUILD_ICON[b] || "build", c.redraw); ctx.fillStyle = "#1a1420cc"; ctx.strokeStyle = c.col(ct.owner); ctx.lineWidth = Math.max(1.2, z * 0.03); // заглушка: арта нет
          ctx.beginPath(); ctx.roundRect(X0 + W * 0.22, Y0 + W * 0.2, W * 0.56, W * 0.56, W * 0.1); ctx.fill(); ctx.stroke(); if (ii) ctx.drawImage(ii, X0 + W * 0.3, Y0 + W * 0.28, W * 0.4, W * 0.4); }
        ctx.restore(); },
      over: () => {
        if (ruin) { const bi = iconImg("burn", c.redraw); if (bi) ctx.drawImage(bi, X0 + W * 0.36, Y0 + W * 0.36, W * 0.28, W * 0.28); }
        if (st && st < 4) { // стадия стройки чуда
          const bx = X0 + W * 0.2, by = Y0 + W * 0.8, bw = W * 0.6; hpBarArt(ctx, bx - bh * 1.25, by, bw + bh * 2.5, bh, st / 4, "#7fb6e0", ct.owner !== S.you, c.redraw);
          if (z >= 28) { ctx.font = `600 ${Math.round(z * 0.18)}px "Oswald", sans-serif`; ctx.fillStyle = "#f6ead0"; ctx.textAlign = "center"; ctx.shadowColor = "#000"; ctx.shadowBlur = 3; ctx.fillText(`стройка ${st}/3`, X0 + W / 2, by - 4); ctx.shadowBlur = 0; ctx.textAlign = "start"; } }
        else if (showBar && r && !ruin) bar(ctx, X0 + W * 0.2, Y0 + W * 0.8, W * 0.6, bh, (r.hp ?? 0) / Math.max(1, r.max ?? 1), r.hs && r.hp == null ? r.hs : undefined, ct.owner !== S.you, c.redraw); } }); }
    if (z >= 40) banners.push(() => { const h = Math.max(14, z * 0.28); drawBanner(ctx, race, cityName(G, ct.id) || "Город", sx(ct.x) + z * 0.5, sy(ct.y) + z - h * 1.1, h, c.redraw); }); }
  L.sort((A, B) => A.Y - B.Y); for (const d of L) d.sprite(); for (const d of L) d.over(); for (const f of banners) f();
  for (const t of towersOf(G)) { if (!vis(t.x, t.y)) continue; const X = sx(t.x), Y = sy(t.y), r = towerHp(G, t, cfg);
    ctx.fillStyle = c.col(t.owner) + "55"; ctx.beginPath(); ctx.ellipse(X + z / 2, Y + z * 0.84, z * 0.3, z * 0.09, 0, 0, 7); ctx.fill();
    const lo = z <= LOD_MAX ? bImg(bLod("watchtower")!, c.redraw) : null, src = bSprite("watchtower", G.races[t.owner] || "fire"), im = src ? bImg(src, c.redraw) : null; // bld_watchtower (256, якорь 128,234) / LOD 64
    if (lo) drawAnchored(ctx, lo, X + z / 2, Y + z * 0.9, z, false, true); else if (im) drawAnchored(ctx, im, X + z / 2, Y + z * 0.9, z * 1.15, false); else { const ii = iconImg("tower", c.redraw); if (ii) ctx.drawImage(ii, X + z * 0.18, Y + z * 0.12, z * 0.64, z * 0.64); }
    bar(ctx, X + z * 0.2, Y + z * 0.8, z * 0.6, bh, (r.hp ?? 0) / Math.max(1, r.max ?? 1), r.hs && r.hp == null ? r.hs : undefined, t.owner !== S.you, c.redraw); }
}
/** Цели удара по постройкам для фигуры: сервер (догадка S.raze[id]) или по тем же клеткам удара, что и атака. */
export function razeTargets(S: any, G: GameState, P: Piece): { city: number; x: number; y: number; b: string[]; tower?: boolean }[] {
  const srv = S?.raze?.[P.id]; if (Array.isArray(srv)) return srv;
  if (!G.ec) return []; const out: any[] = [];
  const test = (x: number, y: number, owner: number) => { if (G.pieces.some((q) => q.x === x && q.y === y && q.owner === owner)) return false;
    const dummy: any = { id: -99, owner, kind: "pawn", x, y, hp: 1, maxHp: 1, atk: 0, arm: 0 };
    return attackTargets({ ...G, pieces: [...G.pieces.filter((q) => !(q.x === x && q.y === y)), dummy] } as any, P).some(([a, b]) => a === x && b === y); };
  for (const c of G.ec.cities as any[]) if (c.owner !== P.owner && c.bld?.length && test(c.x, c.y, c.owner)) out.push({ city: c.id, x: c.x, y: c.y, b: [...new Set<string>(c.bld)] });
  for (const t of towersOf(G)) if (t.owner !== P.owner && test(t.x, t.y, t.owner)) out.push({ city: t.id, x: t.x, y: t.y, b: ["watchtower"], tower: true });
  return out;
}

// ---------- стройка Вождём ----------
export const TOWER_DEF = { name: "Сторожевая башня", eff: "Ставится Вождём рядом с собой, вне своей земли (до 2 клеток от неё). Своим фигурам рядом +1 БРН.", cost: 8 };
const bDef = (cfg: StratCfg, b: string, race: string): any => (b === "watchtower" ? { ...TOWER_DEF, ...((cfg as any).build?.watchtower || {}), cost: (cfg as any).econ?.tower?.cost ?? 8 } : rv(((cfg as any).build?.[b] || (BUILD as any)[b]) as any, race));
export function buildList(cfg: StratCfg, race: string): string[] { const ks = Object.keys((cfg as any).build || BUILD).filter((b) => { const B: any = ((cfg as any).build || BUILD)[b]; return !B?.race || B.race === race; });
  if (!ks.includes("watchtower")) ks.push("watchtower"); return ks; }
/** Город, на чьей земле стоит Вождь (постройка уходит ближайшему своему городу-не-поселению). */
export function chiefSite(G: GameState, T: Int8Array, side: number, k: Piece): any | null {
  const n = G.size; if (T[k.y * n + k.x] !== side) return null; let best: any = null, bd = 1e9;
  for (const c of G.ec?.cities as any[] || []) if (c.owner === side && !c.set) { const d = Math.max(Math.abs(c.x - k.x), Math.abs(c.y - k.y)) * 2 + (c.cap ? 0 : 1); if (d < bd) { bd = d; best = c; } }
  return best;
}
/** Клетки для башни: соседние с Вождём, свободные, «.»/«P», не дальше outDist от своей земли и не на чужой. */
export function towerCells(G: GameState, T: Int8Array, side: number, k: Piece, cfg: StratCfg): [number, number][] {
  const n = G.size, m: any = (G as any).map || openMap(n), R = (cfg as any).econ?.tower?.outDist ?? 2, out: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = k.x + dx, y = k.y + dy; if ((!dx && !dy) || x < 0 || y < 0 || x >= n || y >= n) continue;
    if (G.pieces.some((q) => q.x === x && q.y === y)) continue; const ss = m.s?.[y * n + x];
    if (!passable(m, x, y, G.races[side])) continue; if (ss && ss !== "." && ss !== "P") continue;
    if (G.ec?.cities.some((c) => c.x === x && c.y === y) || towersOf(G).some((t) => t.x === x && t.y === y)) continue;
    const o = T[y * n + x]; if (o >= 0 && o !== side) continue;
    let d = 99; for (let yy = Math.max(0, y - R); yy <= Math.min(n - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(n - 1, x + R); xx++) if (T[yy * n + xx] === side) d = Math.min(d, Math.max(Math.abs(xx - x), Math.abs(yy - y)));
    if (d <= R) out.push([x, y]); }
  return out;
}
/** Карточки выбора постройки (для choiceDlg) с ценой и причиной недоступности. */
export function buildChoices(c: Ctx, k: Piece, T: Int8Array): { id: string; title: string; text: string; icon: string; img?: string; foot: string; off?: boolean }[] {
  const { G, me } = c, cfg = cfgOf(c.S), race = G.races[me], site = chiefSite(G, T, me, k), gold = G.ec.res[me].gold;
  return buildList(cfg, race).map((b) => { const B = bDef(cfg, b, race); let err: string | null = null, cost = B.cost ?? 0;
    if (b === "watchtower") { const mine = towersOf(G).filter((t) => t.owner === me).length, max = (cfg as any).econ?.tower?.max ?? 3;
      err = mine >= max ? `Башен уже ${mine} из ${max}` : !towerCells(G, T, me, k, cfg).length ? "Рядом с Вождём нет подходящей клетки" : gold < cost ? ECON_ERR.no_gold || "Не хватает золота" : null; }
    else if (!site) err = "Вождь должен стоять на своей земле";
    else { try { cost = buildCost(G, me, b as BuildId, cfg); const e = (site.bld || []).includes(b) && b !== "forge" ? "built" : canBuild(G, me, site, b as BuildId, cfg, b === "forge" ? "rook" : undefined); err = e && !/acted/.test(e) ? (e === "built" ? "Уже построено" : ECON_ERR[e] || e) : null; } catch { err = null; } }
    return { id: b, title: B.name || bName(b, race), text: (B.eff || "") + (err ? ` · ${err}` : "") + (b !== "watchtower" && site ? ` · в городе ${site.name || "Столица"}` : ""), icon: BUILD_ICON[b] || (b === "watchtower" ? "tower" : "build"), img: bCard(b, race) || undefined, foot: `${ic("gold")}${cost}`, off: !!err }; });
}

// ---------- покупка клетки / прирост / захват / поселение ----------
export const terrCities = (S: any): any[] => (Array.isArray(S?.terr?.cities) ? S.terr.cities : []);
export const leagueCfg = (S: any): any => S?.league || {};
/** Подсветка режимов (стройка, покупка), маркеры захвата, кольцо основания поселения. */
export function drawWorldOverlay(ctx: CanvasRenderingContext2D, c: Ctx, z: number, sx: SX, sy: SX, vis: (x: number, y: number) => boolean, T: Int8Array, C: Int16Array, now: number) {
  const { G, S, me } = c, n = G.size, ec: any = G.ec; if (!ec) return; const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  const cell = (x: number, y: number, fill: string, stroke: string, dash = false) => { const X = sx(x), Y = sy(y); ctx.fillStyle = fill; ctx.fillRect(X + 2, Y + 2, z - 4, z - 4);
    ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1.5, z * 0.045); if (dash) ctx.setLineDash([z * 0.12, z * 0.08]); ctx.strokeRect(X + 3, Y + 3, z - 6, z - 6); ctx.setLineDash([]); };
  const k = G.pieces.find((q) => q.owner === me && q.kind === "king");
  if (W.mode?.k === "build" && k) {
    if (W.mode.tower) for (const [x, y] of towerCells(G, T, me, k, cfgOf(S))) { cell(x, y, `rgba(243,210,122,${0.2 + 0.15 * pulse})`, "#f3d27a"); const src = bSprite("watchtower", G.races[me] || "fire"), im = src ? bImg(src, c.redraw) : null; if (im) { ctx.save(); ctx.globalAlpha = 0.55 + 0.25 * pulse; drawAnchored(ctx, im, sx(x) + z / 2, sy(y) + z * 0.9, z * 1.0, false); ctx.restore(); } }
    else { const site = chiefSite(G, T, me, k); if (site) for (let i = 0; i < T.length; i++) if (C[i] === site.id) { const x = i % n, y = (i / n) | 0; if (vis(x, y)) { ctx.fillStyle = `rgba(243,210,122,${0.1 + 0.08 * pulse})`; ctx.fillRect(sx(x), sy(y), z, z); } } }
  }
  // покупка клетки (ui-v2 map/buy_marker): в режиме покупки — крупно с ценой; иначе готовые к покупке клетки помечены тихо
  const buy = uImg(BUY_MARKER, c.redraw);
  if (W.mode?.k === "claim") { const tc = terrCities(S).find((q) => q.city === (W.mode as any).city);
    for (const [x, y] of tc?.cells || []) { if (!vis(x, y)) continue; cell(x, y, `rgba(127,194,90,${0.12 + 0.1 * pulse})`, "#9fe07a", true);
      const ms = z * (0.6 + 0.04 * pulse); if (buy) ctx.drawImage(buy, sx(x) + (z - ms) / 2, sy(y) + z * 0.42 - ms / 2, ms, ms);
      if (z >= 22) { ctx.font = `700 ${Math.round(z * 0.2)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "#140f18";
        const s = String(tc.cost ?? "?"); ctx.strokeText(s, sx(x) + z / 2, sy(y) + z * 0.82); ctx.fillStyle = "#f3d27a"; ctx.fillText(s, sx(x) + z / 2, sy(y) + z * 0.82); } } }
  else if (buy && z >= 30 && !W.mode) for (const tc of claimable(S)) for (const [x, y] of tc.cells || []) { if (!vis(x, y)) continue;
    const ms = z * 0.42; ctx.save(); ctx.globalAlpha = 0.55 + 0.25 * pulse; ctx.drawImage(buy, sx(x) + (z - ms) / 2, sy(y) + (z - ms) / 2, ms, ms); ctx.restore(); }
  // захват: враг стоит на клетке N ходов — map/capture_ring_frame + сегменты цвета захватчика (по часовой от верха), в центре — сколько осталось
  // аудит M5: число ходов — с сервера (v.max/total/need, повторный захват — league.retake, лига: 5), а не фиксированные 4
  const L0 = leagueCfg(S), siegeT = (cfgOf(S) as any).econ?.city?.siegeTurns, capMax0 = L0.capture ?? siegeT ?? 4;
  for (const [ks, v] of Object.entries<any>(ec.ct || {})) { const i = +ks, x = i % n, y = (i / n) | 0; if (!vis(x, y) || !v) continue;
    const capMax = v.max ?? v.total ?? v.need ?? (v.re || v.retake ? L0.retake ?? capMax0 : capMax0), left = v.left ?? Math.max(0, capMax - (v.n ?? 0)), sz = Math.max(18, z * 0.46);
    drawCapture(ctx, sx(x) + z / 2, sy(y) + sz * 0.42, sz, v.n ?? 0, capMax, c.col(v.o), String(left), c.redraw); }
  // поселение: кольцо map/settlement_ring (маска цвета игрока + золото по прогрессу) на Вожде (свои — из S.terr.fnd / ec.fnd)
  const fl = Array.isArray(ec.fnd) ? ec.fnd : [S?.terr?.fnd && { ...S.terr.fnd, side: me }];
  fl.forEach((f: any, side: number) => { if (!f || f.left == null) return; const p = G.pieces.find((q) => q.id === f.id) || (f.x != null ? { x: f.x, y: f.y } : null); if (!p || !vis(p.x, p.y)) return;
    const total = /* M5: лига 8/10/12 — с сервера */ f.total ?? f.max ?? f.need ?? leagueCfg(S).found ?? (cfgOf(S) as any).econ?.found?.turns ?? 10, fr = Math.max(0, Math.min(1, 1 - f.left / total)), X = sx(p.x) + z / 2, Y = sy(p.y) + z / 2, R = z * 0.47;
    if (!drawSettleRing(ctx, X, Y, z * 1.28, fr, c.col(f.side ?? side), c.redraw)) {
      ctx.strokeStyle = "#140f18aa"; ctx.lineWidth = Math.max(3, z * 0.08); ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.stroke();
      ctx.strokeStyle = c.col(f.side ?? side); ctx.lineWidth = Math.max(2, z * 0.05); ctx.beginPath(); ctx.arc(X, Y, R, -Math.PI / 2, -Math.PI / 2 + fr * Math.PI * 2); ctx.stroke(); }
    if (z >= 24) { const im = iconImg("outpost", c.redraw), s = z * 0.26; ctx.fillStyle = "#140f18"; ctx.beginPath(); ctx.arc(X + R * 0.78, Y - R * 0.78, s * 0.62, 0, 7); ctx.fill(); if (im) ctx.drawImage(im, X + R * 0.78 - s / 2, Y - R * 0.78 - s / 2, s, s); } });
}
/** Город (свой), чью клетку можно купить сейчас; null — нечего. */
export const claimable = (S: any) => terrCities(S).filter((q) => q.ready && (q.cells || []).length);

// ---------- ОД: источники ----------
export function apSources(S: any, G: GameState, me: number): { rows: [string, number][]; total: number; max: number | null } {
  if (Array.isArray(S?.apSrc)) { const rows = S.apSrc.map((r: any) => [String(r.label), +r.n || 0]) as [string, number][]; return { rows, total: rows.reduce((a, r) => a + r[1], 0), max: leagueCfg(S).apMax ?? null }; }
  const L = leagueCfg(S), rows: [string, number][] = [], ec: any = G.ec;
  const LN: Record<string, string> = { quick: "Быстрая", fast: "Быстрая", normal: "Обычная", tactical: "Тактическая", tactic: "Тактическая" };
  const base = L.apBase ?? (S?.g?.apMax ?? 0); rows.push([`Основа лиги${L.id ? " «" + (LN[L.id] || L.id) + "»" : ""}`, base]);
  const have: string[] = ec?.techs?.[me] || [], apT = have.filter((id) => ((TECHS as any[]).find((t) => t.id === id)?.fx?.ap ?? 0) > 0).length;
  if (apT) rows.push([`Технологии (${apT})`, apT * (L.apTech ?? 1)]);
  const wc = (ec?.cities || []).filter((c: any) => c.owner === me && (c.bld || []).includes("warcouncil")).length;
  if (wc) rows.push(["Военный совет (уникальная постройка)", Math.min(wc, L.onceMax ?? 1) * (L.apBld ?? 1)]);
  const ra = S?.terr?.raceAp; if (ra) rows.push([`${ra.label || "Сила стихии"}${ra.per ? ` (${ra.have ?? 0}/${ra.per} за +1, до ${ra.cap ?? L.raceCap ?? "?"})` : ""}`, ra.n || 0]);
  const k = G.pieces.find((q) => q.owner === me && q.kind === "king");
  if (k) { const tl: any[] = ((cfgOf(S) as any).talents?.king || []).flat(); const ta = (k.tal || []).reduce((a: number, id: string) => a + (tl.find((t) => t.id === id)?.ap || 0), 0); if (ta) rows.push(["Навыки Вождя", ta]); }
  else rows.push(["Нет Вождя", -((cfgOf(S) as any).chief?.noChiefAp ?? 1)]);
  let total = rows.reduce((a, r) => a + r[1], 0); if (L.apMax != null && total > L.apMax) { rows.push([`Потолок лиги ${L.apMax}`, L.apMax - total]); total = L.apMax; }
  if (total < 1) { rows.push(["Минимум 1 ОД", 1 - total]); total = 1; }
  return { rows, total, max: L.apMax ?? null };
}
export function apTip(S: any, G: GameState, me: number): string {
  const a = apSources(S, G, me), cur = S?.g?.ap ?? 0, mx = S?.g?.apMax ?? a.total;
  return `<b>Очки действий: ${cur} из ${mx}</b><br><small>Каждое действие фигуры, Вождя или города тратит 1 ОД.</small><table class="aptab">${a.rows.map(([l, n]) => `<tr><td>${esc(l)}</td><td class="${n < 0 ? "neg" : ""}">${n > 0 ? "+" : ""}${n}</td></tr>`).join("")}<tr class="sum"><td>За ход</td><td>${mx}</td></tr></table>${mx !== a.total ? `<small>Сервер насчитал ${mx}; разница — эффекты, которых нет в разборе.</small>` : ""}`;
}

// ---------- скрытое здоровье ----------
export const hsOf = (p: any): string | null => (p && p.hp == null && p.hs ? p.hs : null);
export const hsByHp = (hp: number, mh: number) => (hp <= 0 ? "dead" : hp / mh > 0.66 ? "ok" : hp / mh >= 0.33 ? "hurt" : "low");

// ---------- события мира → всплывашки/тосты ----------
export type WEv = { fx?: { x: number; y: number; txt: string; col: string; big?: boolean }; toast?: [string, "info" | "good" | "bad" | "turn", string]; dust?: { x: number; y: number } };
export function worldEvent(e: any, me: number, G: GameState, nick: (s: number) => string): WEv | null {
  const ec: any = G.ec, cityAt = (id: number) => (id >= 10001 ? towersOf(G).find((t) => t.id === id) : ec?.cities.find((c: any) => c.id === id));
  const pos = (): { x: number; y: number } | null => (e.x != null ? { x: e.x, y: e.y } : cityAt(e.city) || null);
  const race = (s: number) => G.races[s] || "", bn = (b: string, s: number) => (b === "watchtower" ? "Сторожевая башня" : bName(b, race(s)));
  switch (e.e) {
    case "bhit": { const p = pos(); return p ? { fx: { ...p, txt: "−" + e.dmg, col: "#ffb067", big: true } } : null; }
    case "bcounter": { const p = G.pieces.find((q) => q.id === e.t); return p ? { fx: { x: p.x, y: p.y, txt: "−" + e.dmg, col: "#ff5040" } } : null; }
    case "bdestroy": { const p = pos(), mine = e.owner === me, by = e.by === me, nm = bn(e.b, e.owner);
      return { dust: p || undefined, fx: p ? { ...p, txt: "Разрушено", col: "#ff8f6b", big: true } : undefined,
        toast: mine ? [`Разрушено: ${nm}`, "bad", "burn"] : by ? [`Вы разрушили: ${nm}`, "good", "burn"] : [`${nick(e.by)} разрушил: ${nm}`, "info", "burn"] }; }
    case "repair": { const c = cityAt(e.city); return c?.owner === me ? { toast: [`Восстановлено: ${bn(e.b, me)}`, "good", "build"], fx: { x: c.x, y: c.y, txt: "Ремонт", col: "#9fe07a" } } : null; }
    case "tgrow": return { fx: { x: e.x, y: e.y, txt: "+земля", col: "#9fe07a" }, toast: e.owner === me ? ["Земля выросла: новая клетка", "good", "flag"] : undefined };
    case "tready": return e.owner === me ? { toast: [`Можно купить клетку · ${e.gold ?? "?"} золота`, "turn", "flag"] } : null;
    case "tcap": return { fx: { x: e.x, y: e.y, txt: e.by === me ? "Отбито" : "Потеряно", col: e.by === me ? "#9fe07a" : "#ff8f6b", big: true },
      toast: e.owner === me ? ["Территория потеряна", "bad", "flag"] : e.by === me ? ["Отбито: клетка больше не чужая", "good", "flag"] : undefined };
    case "found_start": return e.side === me ? { toast: [`Вождь основывает поселение: ${e.left} х.`, "info", "outpost"] } : { toast: [`${nick(e.side)} основывает поселение`, "info", "outpost"] };
    case "found_fail": return e.side === me ? { toast: [e.cancel ? `Основание отменено${e.gold ? ", возвращено " + e.gold + " золота" : ""}` : "Основание сорвано", "bad", "outpost"] } : null;
    case "build": if (e.tower != null && e.x != null) return { fx: { x: e.x, y: e.y, txt: "Башня", col: "#f3d27a" } }; return null;
  }
  return null;
}
