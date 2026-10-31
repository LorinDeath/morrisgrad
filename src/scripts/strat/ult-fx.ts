import { t2 } from "./t2";
import { drawFxArt, fxDur } from "./fx2";
// Ультимативные умения: телеграф области при прицеливании, анимация каста на доске, глобальный баннер, тряска камеры,
// стойкие наложения на клетки (горящая земля, лёд, стены, заросли, подтопление). Всё запускается событиями сервера.
// Масштаб: Вождь — «big», ульта фигуры (ур. 5) — «small» (меньше радиус, без глобального баннера на весь экран).
export type UltKind = "doom" | "chain" | "wall" | "blizzard" | "wave" | "overgrowth";
type Def = { kind: UltKind; key: string; title: string; sub: string; r: number; col: string; col2: string; zone?: string; turns: number };
/** серверный ключ ульты → раса (tree-data ULT_OF) */
const RACE_OF_ULT: Record<string, string> = { doom: "fire", blink: "lightning", dome: "stone", blizzard: "ice", tide: "water", grove: "nature" };
export const ULT: Record<string, Def> = {
  fire: { kind: "doom", key: "doom", title: "DOOM", sub: "Огненный удар Вождя", r: 2, col: "#ff7a1a", col2: "#ffd23f", zone: "burn", turns: 2 },
  lightning: { kind: "chain", key: "blink", title: "МОЛНИЕНОСНЫЙ РЫВОК", sub: "Вождь молнией перескакивает между врагами", r: 3, col: "#b9a7ff", col2: "#ffffff", turns: 0 },
  stone: { kind: "wall", key: "dome", title: "КАМЕННЫЙ КУПОЛ", sub: "Стены поднимаются из земли", r: 2, col: "#c2a27a", col2: "#f4ead2", zone: "wall", turns: 2 },
  ice: { kind: "blizzard", key: "blizzard", title: "БЕЛАЯ МГЛА", sub: "Буран сковывает поле", r: 2, col: "#9fe0ff", col2: "#ffffff", zone: "frost", turns: 2 },
  water: { kind: "wave", key: "tide", title: "ДЕВЯТЫЙ ВАЛ", sub: "Волна сметает строй", r: 2, col: "#3fa7d6", col2: "#d6f3ff", zone: "flood", turns: 1 },
  nature: { kind: "overgrowth", key: "grove", title: "ПРОБУЖДЕНИЕ ЛЕСА", sub: "Корни и лозы оплетают врагов", r: 2, col: "#7ccf5a", col2: "#e6ffb0", zone: "vines", turns: 2 },
};
const KIND_RACE: Record<string, string> = Object.fromEntries(Object.entries(ULT).map(([r, d]) => [d.kind, r]));
export type UltCast = { race: string; def: Def; x: number; y: number; r: number; pts: [number, number][]; side: number; small: boolean; t0: number; dur: number;
  /** клетки области с сервера (e.cells): квадрат купола/мглы/леса, линия вала, цели рывка; нет — круг r */ cells: [number, number][]; from: [number, number] };
export type Zone = { k: string; x: number; y: number; r: number; until: number; side?: number; cells?: [number, number][] };
/** клетки зоны: присланные сервером, иначе круг r */
export const zoneCells = (z: { x: number; y: number; r: number; cells?: [number, number][] }, n: number) => z.cells?.length ? z.cells : discCells(z.x, z.y, z.r, n);
const toPt = (t: any, g: any): [number, number] | null => Array.isArray(t) ? [t[0], t[1]] : typeof t === "number" ? (() => { const p = g?.pieces?.find((q: any) => q.id === t); return p ? [p.x, p.y] as [number, number] : null; })() : t && t.x != null ? [t.x, t.y] : null;

/** Радиус из данных баланса, если есть (cfg.ults / cfg.chiefs…ult), иначе по умолчанию. */
export function ultRadius(cfg: any, race: string, small: boolean): number {
  const u = cfg?.ults?.[race] ?? cfg?.econ?.ults?.[race]; const r = small ? u?.unitR ?? u?.small?.r : u?.r;
  return typeof r === "number" ? r : small ? Math.max(1, ULT[race]?.r - 1 || 1) : ULT[race]?.r ?? 2;
}
export const inDisc = (dx: number, dy: number, r: number) => dx * dx + dy * dy <= r * r + r; // r=2 → «круг» диаметром 5 клеток
export function discCells(x: number, y: number, r: number, n: number): [number, number][] {
  const out: [number, number][] = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < n && Y < n && inDisc(dx, dy, r)) out.push([X, Y]); } return out;
}
/** Разбор события сервера (e.e = "ult" | "ultimate" | "uult"). Форма данных — защитная: ТЗ §14 ещё уточняется. */
/** prevG — снимок до события: откуда начался «Молниеносный рывок» (после него Вождь уже стоит у последней цели). */
export function parseUlt(e: any, g: any, now: number, prevG?: any): UltCast | null {
  if (!e || !/^(ult|ultimate|uult|unit_ult)$/.test(e.e)) return null;
  const caster = g?.pieces?.find((p: any) => p.id === (e.id ?? e.by)); const side = e.side ?? caster?.o ?? 0;
  const race = e.race ?? (e.kind && KIND_RACE[e.kind]) ?? (e.ult && RACE_OF_ULT[e.ult]) ?? g?.races?.[side] ?? "fire", d0 = ULT[race]; if (!d0) return null;
  // название — с сервера (ULTS[key].banner/name, §B3 аудита); запасное — серверные названия в d0.title
  const title = String(e.banner ?? (e.name ? String(e.name).toUpperCase() : "") ?? "") || d0.title, def: Def = { ...d0, key: e.ult ?? e.key ?? d0.key, title };
  const small = e.e === "uult" || e.e === "unit_ult" || e.small === true || (caster && caster.k !== "king");
  const x = e.x ?? caster?.x ?? 0, y = e.y ?? caster?.y ?? 0, r = e.r ?? (small ? Math.max(1, def.r - 1) : def.r);
  // сервер (ult.ts) шлёт cells: область или цепочку целей рывка по порядку; старые поля — запасной вариант
  const cells = ((Array.isArray(e.cells) ? e.cells : []).map((t: any) => toPt(t, g)).filter(Boolean)) as [number, number][];
  const tg: any[] = e.tg ?? e.targets ?? e.hits ?? [];
  const pts = def.kind === "chain" && cells.length ? cells : (tg.map((t: any) => toPt(t, prevG || g)).filter(Boolean) as [number, number][]);
  const c0 = prevG?.pieces?.find((p: any) => p.id === (e.id ?? e.by)) || caster, from: [number, number] = c0 ? [c0.x, c0.y] : [x, y];
  const hops = def.kind === "chain" ? Math.max(1, pts.length) : 1;
  return { race, def, x, y, r, pts, side, small, t0: now, dur: small ? 1300 : def.kind === "doom" ? 2600 : def.kind === "chain" ? Math.max(2200, 600 + hops * 450) : 2200, cells: def.kind === "chain" ? [] : cells, from };
}
// ---------- состояние ----------
export const casts: UltCast[] = [];
let localZones: Zone[] = [];
export function addCast(c: UltCast, turn: number) {
  casts.push(c);
  if (c.def.zone && c.def.turns) localZones.push({ k: c.def.zone, x: c.x, y: c.y, r: c.r, until: turn + c.def.turns * 2, side: c.side, ...(c.cells.length ? { cells: c.cells.map((q) => [q[0], q[1]] as [number, number]) } : {}) });
}
/** Зоны: с сервера (g.zones / g.ec.zones; горящая земля — g.ec.fire [{x,y,t,s}]), остальное — локально из событий ульт (сервер их не хранит:
 * купол — это щиты на фигурах, мгла — chill, лес — root; клетки зоны — из e.cells). */
export function zonesOf(g: any): Zone[] {
  const srv = g?.zones ?? g?.ec?.zones; if (Array.isArray(srv)) return srv.map((z: any) => ({ k: z.k ?? z.kind, x: z.x, y: z.y, r: z.r ?? 0, until: Infinity, side: z.side, cells: z.cells }));
  localZones = localZones.filter((z) => z.until > (g?.turn ?? 0));
  if (!g?.ec) return localZones;
  const F = (Array.isArray(g.ec.fire) ? g.ec.fire : []) as { x: number; y: number; s: number }[], out = localZones.filter((z) => z.k !== "burn");
  for (const s of [0, 1]) { const cs = F.filter((f) => f.s === s).map((f) => [f.x, f.y] as [number, number]); if (!cs.length) continue;
    const mx = cs.reduce((a, c) => a + c[0], 0) / cs.length, my = cs.reduce((a, c) => a + c[1], 0) / cs.length, mid = cs.reduce((b, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(b[0] - mx, b[1] - my) ? c : b));
    out.push({ k: "burn", x: mid[0], y: mid[1], r: 0, until: Infinity, side: s, cells: cs }); }
  return out;
}
export function resetUlt() { casts.length = 0; localZones = []; }

// ---------- DOM: баннер для всех игроков + тряска ----------
export function ultBanner(c: UltCast, mine: boolean, who: string) {
  const host = document.body, el = document.createElement("div");
  el.className = `ultban k-${c.def.key}${c.small ? " small" : ""}`; el.setAttribute("role", "status");
  const t = document.createElement("div"); t.className = "ult-title"; t.textContent = c.def.title; t.dataset.text = c.def.title;
  const s = document.createElement("div"); s.className = "ult-sub"; s.textContent = (mine ? "Вы: " : who ? who + ": " : "") + c.def.sub;
  el.append(Object.assign(document.createElement("i"), { className: "ult-rays" }), t, s); host.appendChild(el);
  setTimeout(() => el.classList.add("out"), c.small ? 1100 : 1900); setTimeout(() => el.remove(), c.small ? 1500 : 2500);
  shake(c.small ? 1 : c.def.kind === "doom" ? 3 : 2);
}
export function shake(lv: number) {
  const st = document.querySelector<HTMLElement>("#stage"); if (!st || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  st.classList.remove("shake1", "shake2", "shake3"); void st.offsetWidth; st.classList.add("shake" + lv); setTimeout(() => st.classList.remove("shake" + lv), 900);
}

// ---------- canvas ----------
type SX = (x: number) => number;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
/** Телеграф: подсветка круга и клеток под прицелом. */
/** Форма ульты Вождя по расе — зеркало server/strat/ult.ts ultCells + tree-data ULTS (в публичный бандл ULTS не уходят). */
const AIM_SHAPE: Record<string, { s: "circle" | "square" | "line" | "chain"; r?: number; size?: number; eraSize?: number; len?: number; hops?: number; hop?: number }> = {
  fire: { s: "circle", r: 2.5 }, lightning: { s: "chain", hops: 3, hop: 3 }, stone: { s: "square", size: 3, eraSize: 5 }, ice: { s: "square", size: 5 }, water: { s: "line", len: 5 }, nature: { s: "square", size: 5 },
};
export type AimCtx = { from: [number, number]; era: number; side: number; pieces: { x: number; y: number; o: number; hp: number; id: number }[] };
/** клетки ульты расы race в цель (x, y) так же, как считает сервер; null — формы нет (способности фигур — круг r) */
export function ultAimCells(race: string, x: number, y: number, n: number, A: AimCtx): [number, number][] | null {
  const u = AIM_SHAPE[race]; if (!u) return null; const out: [number, number][] = [], inb = (X: number, Y: number) => X >= 0 && Y >= 0 && X < n && Y < n;
  if (u.s === "circle") { const r = u.r!, R = Math.ceil(r); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 1e-9 && inb(x + dx, y + dy)) out.push([x + dx, y + dy]); }
  else if (u.s === "square") { const sz = A.era >= 3 && u.eraSize ? u.eraSize : u.size!, h = (sz - 1) >> 1; for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) if (inb(x + dx, y + dy)) out.push([x + dx, y + dy]); }
  else if (u.s === "line") { const [fx, fy] = A.from, sx = Math.sign(x - fx), sy = Math.sign(y - fy); if (!sx && !sy) return out; const px = -sy, py = sx;
    for (let i = 1; i <= u.len!; i++) for (const w of [-1, 0, 1]) { const cx = fx + sx * i + px * w, cy = fy + sy * i + py * w; if (inb(cx, cy) && !out.some(([a, b]) => a === cx && b === cy)) out.push([cx, cy]); } }
  else { // цепь: цель — враг в клетке, дальше ближайший непобитый враг в радиусе hop (как castUlt)
    const foes = A.pieces.filter((q) => q.o !== A.side && q.hp > 0), hit = new Set<number>(); let cur = foes.find((q) => q.x === x && q.y === y);
    if (!cur) return [[x, y]];
    for (let i = 0; i < u.hops! + (A.era >= 3 ? 1 : 0) && cur; i++) { hit.add(cur.id); out.push([cur.x, cur.y]); const L: AimCtx["pieces"][number] = cur;
      cur = foes.filter((q) => !hit.has(q.id) && Math.max(Math.abs(q.x - L.x), Math.abs(q.y - L.y)) <= u.hop!).sort((a, b) => Math.max(Math.abs(a.x - L.x), Math.abs(a.y - L.y)) - Math.max(Math.abs(b.x - L.x), Math.abs(b.y - L.y)) || a.hp - b.hp)[0]; } }
  return out;
}
export function drawAim(ctx: CanvasRenderingContext2D, race: string, x: number, y: number, r: number, n: number, sx: SX, sy: SX, z: number, now: number, ok = true, A?: AimCtx) {
  const d = ULT[race] || ULT.fire, pulse = 0.5 + 0.5 * Math.sin(now / 160);
  const cells = A ? ultAimCells(race, x, y, n, A) : null;
  if (cells) { // форма ульты: квадрат / линия / круг клетками / цепь — контур по границе области, пунктир бежит
    const set = new Set(cells.map(([a, b]) => b * n + a)), chain = AIM_SHAPE[race]?.s === "chain";
    ctx.save(); ctx.fillStyle = ok ? d.col + "4a" : "#7f211940"; for (const [X, Y] of cells) ctx.fillRect(sx(X) + 1, sy(Y) + 1, z - 2, z - 2);
    ctx.strokeStyle = ok ? d.col2 : "#e6623f"; ctx.lineWidth = Math.max(2, z * 0.06); ctx.setLineDash([z * 0.25, z * 0.12]); ctx.lineDashOffset = -now / 30; ctx.beginPath();
    for (const [X, Y] of cells) { const x0 = Math.min(sx(X), sx(X) + z), y0 = Math.min(sy(Y), sy(Y) + z), fl = sx(1) < sx(0) ? -1 : 1, fv = sy(1) < sy(0) ? -1 : 1;
      const E: [number, number, number, number, number, number][] = [[0, -fv, 0, 0, z, 0], [0, fv, 0, z, z, z], [-fl, 0, 0, 0, 0, z], [fl, 0, z, 0, z, z]];
      for (const [dx, dy, a1, b1, a2, b2] of E) if (chain || !set.has((Y + dy) * n + X + dx) || X + dx < 0 || X + dx >= n) { ctx.moveTo(x0 + a1, y0 + b1); ctx.lineTo(x0 + a2, y0 + b2); } }
    ctx.stroke(); ctx.setLineDash([]);
    if (chain && cells.length > 1) { ctx.globalAlpha = 0.5 + 0.4 * pulse; ctx.lineWidth = Math.max(1.5, z * 0.05); ctx.beginPath(); cells.forEach(([X, Y], i) => { const px = sx(X) + z / 2, py = sy(Y) + z / 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.globalAlpha = 1; }
    const cx = sx(x) + z / 2, cy = sy(y) + z / 2; ctx.fillStyle = d.col2; ctx.beginPath(); ctx.moveTo(cx, cy - z * 0.18); ctx.lineTo(cx + z * 0.12, cy); ctx.lineTo(cx, cy + z * 0.18); ctx.lineTo(cx - z * 0.12, cy); ctx.fill();
    ctx.restore(); return;
  }
  ctx.save(); ctx.fillStyle = ok ? d.col + "40" : "#7f211940";
  for (const [X, Y] of discCells(x, y, r, n)) ctx.fillRect(sx(X) + 1, sy(Y) + 1, z - 2, z - 2);
  const cx = sx(x) + z / 2, cy = sy(y) + z / 2, R = (r + 0.5) * z;
  ctx.strokeStyle = ok ? d.col2 : "#e6623f"; ctx.lineWidth = Math.max(2, z * 0.06); ctx.setLineDash([z * 0.25, z * 0.12]); ctx.lineDashOffset = -now / 30;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 0.35 + 0.35 * pulse; ctx.lineWidth = Math.max(1, z * 0.03); ctx.beginPath(); ctx.arc(cx, cy, R * (0.92 + 0.06 * pulse), 0, 7); ctx.stroke();
  // ар-деко прицел: ромб в центре и 4 засечки
  ctx.globalAlpha = 1; ctx.fillStyle = d.col2; ctx.beginPath(); ctx.moveTo(cx, cy - z * 0.18); ctx.lineTo(cx + z * 0.12, cy); ctx.lineTo(cx, cy + z * 0.18); ctx.lineTo(cx - z * 0.12, cy); ctx.fill();
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - z * 0.2), cy + Math.sin(a) * (R - z * 0.2)); ctx.lineTo(cx + Math.cos(a) * (R + z * 0.2), cy + Math.sin(a) * (R + z * 0.2)); ctx.stroke(); }
  ctx.restore();
}
/** Стойкие наложения на клетки. */
/** Зоны terrain-v2: zone_<k>_1..2 на клетках зоны, zone_<k>_edge_<d> на клетке снаружи (зона со стороны d), стена — zone_wall_ring_<d>
 * на клетке зоны у края d; burn — плюс воронка zone_scorch_crater в центре. Нет арта — рисование кодом ниже. */
function drawZoneArt(ctx: CanvasRenderingContext2D, zn: Zone, n: number, sx: SX, sy: SX, z: number, now: number): boolean {
  const px = z * (devicePixelRatio || 1), k = zn.k, cells = zoneCells(zn, n), set = new Set(cells.map(([x, y]) => y * n + x));
  if (!t2(`zone_${k}_1`, px)) return false;
  const flip = sx(1) < sx(0), d = flip ? -1 : 1, S: Record<string, [number, number]> = { n: [0, -d], e: [d, 0], s: [0, d], w: [-d, 0] };
  const inZ = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && set.has(y * n + x);
  const put = (nm: string, x: number, y: number) => { const im = t2(nm, px); if (im) ctx.drawImage(im, sx(x), sy(y), z + 0.5, z + 0.5); };
  for (const [x, y] of cells) put(`zone_${k}_${1 + (((x * 7 + y * 13) >>> 0) % 2)}`, x, y);
  // края снаружи: для клетки вне зоны — с какой стороны зона
  const outs = new Map<number, string[]>();
  for (const [x, y] of cells) for (const [dn, [dx, dy]] of Object.entries(S)) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= n || Y >= n || inZ(X, Y)) continue;
    const back = ({ n: "s", s: "n", e: "w", w: "e" } as any)[dn]; const i = Y * n + X, l = outs.get(i) || []; if (!l.includes(back)) l.push(back); outs.set(i, l); }
  for (const [i, l] of outs) for (const dn of l) put(`zone_${k}_edge_${dn}`, i % n, Math.floor(i / n));
  if (k === "wall") for (const [x, y] of cells) { const o = (dn: string) => !inZ(x + S[dn][0], y + S[dn][1]), N = o("n"), E = o("e"), Ss = o("s"), W = o("w");
    if (N && E) put("zone_wall_ring_ne", x, y); if (N && W) put("zone_wall_ring_nw", x, y); if (Ss && E) put("zone_wall_ring_se", x, y); if (Ss && W) put("zone_wall_ring_sw", x, y);
    if (N && !E && !W) put("zone_wall_ring_n", x, y); if (Ss && !E && !W) put("zone_wall_ring_s", x, y); if (E && !N && !Ss) put("zone_wall_ring_e", x, y); if (W && !N && !Ss) put("zone_wall_ring_w", x, y); }
  if (k === "burn") { const im = t2("zone_scorch_crater", px); if (im) { ctx.globalAlpha = 0.85 + 0.15 * Math.sin(now / 300); ctx.drawImage(im, sx(zn.x), sy(zn.y), z, z); ctx.globalAlpha = 1; } }
  return true;
}
export function drawZones(ctx: CanvasRenderingContext2D, zs: Zone[], n: number, sx: SX, sy: SX, z: number, now: number) {
  for (const zn of zs) { const zc = zoneCells(zn, n), zset = new Set(zc.map(([x, y]) => y * n + x)), edgeOf = (X: number, Y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !zset.has((Y + b) * n + X + a) || X + a < 0 || X + a >= n);
  if (!drawZoneArt(ctx, zn, n, sx, sy, z, now)) for (const [X, Y] of zc) {
    const x0 = sx(X), y0 = sy(Y), h = ((X * 73856093) ^ (Y * 19349663)) >>> 0; ctx.save();
    if (zn.k === "burn") { ctx.fillStyle = "rgba(60,14,6,.55)"; ctx.fillRect(x0, y0, z, z);
      for (let i = 0; i < 3; i++) { const fx = x0 + ((h >> (i * 5)) % 100) / 100 * z * 0.8 + z * 0.1, fy = y0 + z * 0.85, fl = 0.75 + 0.25 * Math.sin(now / 120 + i + h); ctx.fillStyle = i % 2 ? "#ffd23f" : "#ff7a1a";
        ctx.beginPath(); ctx.moveTo(fx - z * 0.08, fy); ctx.quadraticCurveTo(fx, fy - z * 0.42 * fl, fx + z * 0.08, fy); ctx.fill(); }
      ctx.strokeStyle = "#ff7a1a88"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 1, y0 + 1, z - 2, z - 2); }
    else if (zn.k === "frost") { ctx.fillStyle = "rgba(200,240,255,.38)"; ctx.fillRect(x0, y0, z, z); ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = Math.max(1, z * 0.025);
      const cx = x0 + z / 2, cy = y0 + z / 2; for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * z * 0.22, cy - Math.sin(a) * z * 0.22); ctx.lineTo(cx + Math.cos(a) * z * 0.22, cy + Math.sin(a) * z * 0.22); ctx.stroke(); } }
    else if (zn.k === "wall") { const edge = edgeOf(X, Y); if (edge) { ctx.fillStyle = "#4a3a2a"; ctx.fillRect(x0 + z * 0.08, y0 + z * 0.3, z * 0.84, z * 0.6); ctx.fillStyle = "#c2a27a";
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x0 + z * (0.1 + c * 0.28 + (r % 2) * 0.06), y0 + z * (0.32 + r * 0.19), z * 0.24, z * 0.16); }
      else { ctx.fillStyle = "rgba(194,162,122,.18)"; ctx.fillRect(x0, y0, z, z); } }
    else if (zn.k === "vines") { ctx.strokeStyle = "#3d7a2a"; ctx.lineWidth = Math.max(1.5, z * 0.05); ctx.beginPath(); ctx.moveTo(x0, y0 + z * 0.8); ctx.bezierCurveTo(x0 + z * 0.3, y0 + z * 0.2, x0 + z * 0.7, y0 + z, x0 + z, y0 + z * 0.3); ctx.stroke();
      ctx.fillStyle = "#7ccf5a"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x0 + z * (0.2 + i * 0.3), y0 + z * (0.55 + ((h >> i) & 1) * 0.15), z * 0.08, z * 0.04, i, 0, 7); ctx.fill(); } }
    else if (zn.k === "flood") { ctx.fillStyle = "rgba(63,167,214,.35)"; ctx.fillRect(x0, y0, z, z); ctx.strokeStyle = "#d6f3ffaa"; ctx.lineWidth = Math.max(1, z * 0.03); const o = Math.sin(now / 400 + X) * z * 0.05;
      ctx.beginPath(); ctx.moveTo(x0 + z * 0.1, y0 + z * 0.5 + o); ctx.quadraticCurveTo(x0 + z * 0.3, y0 + z * 0.35 + o, x0 + z * 0.5, y0 + z * 0.5 + o); ctx.quadraticCurveTo(x0 + z * 0.7, y0 + z * 0.65 + o, x0 + z * 0.9, y0 + z * 0.5 + o); ctx.stroke(); }
    ctx.restore();
  } }
  return zs.length > 0;
}
/** Анимация каста. Возвращает true, пока что-то движется. Формы — из c.cells (квадрат/линия с сервера), без них — круг r. */
export function drawCasts(ctx: CanvasRenderingContext2D, n: number, sx: SX, sy: SX, z: number, now: number): boolean {
  for (let i = casts.length - 1; i >= 0; i--) if (now - casts[i].t0 > casts[i].dur) casts.splice(i, 1);
  for (const c of casts) {
    const k = (now - c.t0) / c.dur, d = c.def, cells = c.cells.length ? c.cells : discCells(c.x, c.y, c.r, n), set = new Set(cells.map(([x, y]) => y * n + x));
    // рамка области (bbox клеток) — центр и «радиус» для общих эффектов
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [X, Y] of cells) { x0 = Math.min(x0, sx(X), sx(X) + z); x1 = Math.max(x1, sx(X), sx(X) + z); y0 = Math.min(y0, sy(Y), sy(Y) + z); y1 = Math.max(y1, sy(Y), sy(Y) + z); }
    if (!cells.length) { x0 = sx(c.x); x1 = x0 + z; y0 = sy(c.y); y1 = y0 + z; }
    const cx = d.kind === "doom" || !c.cells.length ? sx(c.x) + z / 2 : (x0 + x1) / 2, cy = d.kind === "doom" || !c.cells.length ? sy(c.y) + z / 2 : (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2;
    const edge = (X: number, Y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !set.has((Y + b) * n + X + a) || X + a < 0 || X + a >= n);
    const fillCells = (col: string) => { ctx.fillStyle = col; for (const [X, Y] of cells) ctx.fillRect(sx(X) + 1, sy(Y) + 1, z - 2, z - 2); };
    ctx.save();
    // арт Художника (fx_ult_<key>) — по центру области; поверх — кодовая форма по клеткам (чтобы было видно, какие клетки задеты)
    { const age = now - c.t0, fd = fxDur("ult_" + d.key); if (fd) { // арт fx-v1 fx_ult_<вид>; рывок — в конечной клетке Вождя; обрезка по доске (blink/blizzard выходят за край)
      const L = c.pts.length ? c.pts[c.pts.length - 1] : null, ax = d.kind === "chain" && L ? sx(L[0]) + z / 2 : cx, ay = d.kind === "chain" && L ? sy(L[1]) + z / 2 : cy;
      const bx0 = Math.min(sx(0), sx(n - 1)), by0 = Math.min(sy(0), sy(n - 1)), bx1 = Math.max(sx(0), sx(n - 1)) + z, by1 = Math.max(sy(0), sy(n - 1)) + z;
      ctx.save(); ctx.beginPath(); ctx.rect(bx0, by0, bx1 - bx0, by1 - by0); ctx.clip(); ctx.globalAlpha = age > fd * 0.8 ? Math.max(0, 1 - (age - fd * 0.8) / (fd * 0.2)) : 1;
      drawFxArt(ctx, "ult_" + d.key, ax, ay, d.kind === "chain" ? z * 2.4 : Math.max(z * 2.4, R * 2.3), age); ctx.restore(); } }
    if (d.kind === "doom") { // падение, вспышка, ударная волна, огненный шар, дым
      if (k < 0.18) { const f = k / 0.18; ctx.strokeStyle = d.col2; ctx.lineWidth = z * 0.12 * (1 - f) + 2; ctx.beginPath(); ctx.moveTo(cx, cy - R * 3 * (1 - f)); ctx.lineTo(cx, cy); ctx.stroke(); }
      else { const f = (k - 0.18) / 0.82, e = easeOut(Math.min(1, f * 1.6));
        if (f < 0.12) { ctx.fillStyle = `rgba(255,255,230,${0.8 * (1 - f / 0.12)})`; ctx.fillRect(sx(0) - z * 4, sy(0) - z * 4, n * z + z * 8, n * z + z * 8); }
        if (c.cells.length) { ctx.globalAlpha = 1 - f; fillCells("rgba(255,122,26,.35)"); ctx.globalAlpha = 1; }
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * e); gr.addColorStop(0, `rgba(255,240,180,${1 - f})`); gr.addColorStop(0.45, `rgba(255,122,26,${0.9 * (1 - f)})`); gr.addColorStop(1, "rgba(127,33,25,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * e, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,210,63,${1 - f})`; ctx.lineWidth = z * 0.18 * (1 - f) + 1; ctx.beginPath(); ctx.arc(cx, cy, R * (0.4 + 1.1 * e), 0, 7); ctx.stroke();
        ctx.strokeStyle = `rgba(26,20,32,${0.8 * (1 - f)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R * (0.4 + 1.1 * e) + z * 0.1, 0, 7); ctx.stroke();
        for (let j = 0; j < 14; j++) { const a = (j / 14) * Math.PI * 2 + j, rr = R * (0.2 + 1.2 * e) * (0.6 + ((j * 37) % 10) / 25); ctx.fillStyle = j % 2 ? d.col2 : d.col; ctx.globalAlpha = 1 - f;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr - f * z * 0.8, z * 0.08 * (1 - f) + 1, 0, 7); ctx.fill(); } } }
    else if (d.kind === "chain") { // рывок: от исходной клетки Вождя по всем целям цепочки (cells по порядку), молния-след и вспышка на каждой
      const pts: [number, number][] = [c.from, ...c.pts], seg = Math.max(1, pts.length - 1), at = Math.min(seg, k * 1.4 * seg);
      for (let j = 0; j < Math.floor(at) + 1 && j < seg; j++) { const [ax, ay] = pts[j], [bx, by] = pts[j + 1] || pts[j], p = Math.min(1, at - j), A = [sx(ax) + z / 2, sy(ay) + z / 2], B = [sx(bx) + z / 2, sy(by) + z / 2];
        const fade = Math.max(0, 1 - (k - (j / seg) / 1.4) * 1.6); ctx.globalAlpha = fade;
        for (const [w, col] of [[z * 0.16, d.col], [z * 0.05, d.col2]] as [number, string][]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "miter"; ctx.beginPath(); ctx.moveTo(A[0], A[1]);
          for (let s = 1; s <= 6; s++) { const t = (s / 6) * p, jit = s < 6 ? Math.sin(now / 30 + s * 7 + j) * z * 0.18 : 0; ctx.lineTo(A[0] + (B[0] - A[0]) * t + jit, A[1] + (B[1] - A[1]) * t - jit); } ctx.stroke(); }
        if (p >= 1) { const age = now - c.t0 - ((j + 1) / seg / 1.4) * c.dur; if (!drawFxArt(ctx, "zapHit", B[0], B[1], z * 1.4, age)) { ctx.fillStyle = d.col2; ctx.beginPath(); ctx.arc(B[0], B[1], z * 0.35 * fade, 0, 7); ctx.fill(); }
          ctx.globalAlpha = fade; ctx.strokeStyle = d.col2; ctx.lineWidth = Math.max(2, z * 0.06); const q = z * 0.18; ctx.beginPath(); ctx.moveTo(B[0] - q, B[1] - q); ctx.lineTo(B[0] + q, B[1] + q); ctx.moveTo(B[0] + q, B[1] - q); ctx.lineTo(B[0] - q, B[1] + q); ctx.stroke(); } }
      ctx.globalAlpha = 1; }
    else if (d.kind === "wall") { const e = easeOut(Math.min(1, k * 1.8)); ctx.globalAlpha = 0.5 * (1 - k); fillCells("rgba(194,162,122,.5)"); ctx.globalAlpha = 1;
      for (const [X, Y] of cells) { if (!edge(X, Y)) continue; const h = z * 0.7 * e;
        ctx.fillStyle = "#4a3a2a"; ctx.fillRect(sx(X) + z * 0.08, sy(Y) + z * 0.9 - h, z * 0.84, h); ctx.fillStyle = "#c2a27a"; ctx.fillRect(sx(X) + z * 0.12, sy(Y) + z * 0.9 - h, z * 0.76, z * 0.14); }
      ctx.globalAlpha = (1 - k) * 0.6; ctx.strokeStyle = d.col2; ctx.lineWidth = z * 0.08; ctx.beginPath(); ctx.ellipse(cx, cy, R, R * e, 0, Math.PI, 0); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (d.kind === "blizzard") { const a = Math.sin(Math.PI * k); ctx.globalAlpha = a; fillCells("rgba(230,248,255,.55)");
      ctx.beginPath(); for (const [X, Y] of cells) ctx.rect(sx(X), sy(Y), z, z); ctx.clip(); ctx.fillStyle = "#fff";
      for (let j = 0; j < 30 + cells.length * 4; j++) { const fx = x0 + (((j * 53) % 97) / 97) * (x1 - x0) + Math.sin(k * 9 + j) * z * 0.3, fy = y0 + ((((j * 31) % 89) / 89 + k * 0.8) % 1) * (y1 - y0); ctx.fillRect(fx, fy, z * 0.06, z * 0.06); } ctx.globalAlpha = 1; }
    else if (d.kind === "wave") { // линия от Вождя: клетки накрывает по мере удаления
      const f = easeOut(Math.min(1, k * 1.3)), dist = (X: number, Y: number) => Math.max(Math.abs(X - c.from[0]), Math.abs(Y - c.from[1])), L = Math.max(1, ...cells.map(([X, Y]) => dist(X, Y))), front = f * (L + 1);
      for (const [X, Y] of cells) { const dd = dist(X, Y); if (dd > front) continue; const near = front - dd < 1;
        ctx.fillStyle = near ? "rgba(214,243,255,.85)" : `rgba(63,167,214,${0.7 * (1 - k * 0.6)})`; ctx.fillRect(sx(X) + 1, sy(Y) + 1, z - 2, z - 2);
        if (near) { ctx.strokeStyle = d.col2; ctx.lineWidth = z * 0.08; ctx.beginPath(); const o = Math.sin(now / 90 + X + Y) * z * 0.1; ctx.moveTo(sx(X) + z * 0.1, sy(Y) + z * 0.5 + o); ctx.quadraticCurveTo(sx(X) + z * 0.5, sy(Y) + z * 0.2 - o, sx(X) + z * 0.9, sy(Y) + z * 0.5 + o); ctx.stroke(); } } }
    else if (d.kind === "overgrowth") { const e = easeOut(Math.min(1, k * 1.5)); ctx.globalAlpha = 0.6 * (1 - k * 0.5); fillCells("rgba(61,122,42,.35)"); ctx.globalAlpha = 1; ctx.strokeStyle = "#3d7a2a"; ctx.lineWidth = z * 0.09;
      for (const [X, Y] of cells) { const tx = sx(X) + z / 2, ty = sy(Y) + z / 2; if (Math.hypot(tx - cx, ty - cy) < 1) continue; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + (tx - cx) * 0.5 + (ty - cy) * 0.25, cy + (ty - cy) * 0.5 - (tx - cx) * 0.25, cx + (tx - cx) * e, cy + (ty - cy) * e); ctx.stroke(); }
      ctx.fillStyle = d.col; for (const [X, Y] of cells) { ctx.beginPath(); ctx.arc(cx + (sx(X) + z / 2 - cx) * e, cy + (sy(Y) + z / 2 - cy) * e, z * 0.1 * e, 0, 7); ctx.fill(); } }
    ctx.restore();
  }
  return casts.length > 0;
}
