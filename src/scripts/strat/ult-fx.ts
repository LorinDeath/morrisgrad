import { t2 } from "./t2";
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
export type UltCast = { race: string; def: Def; x: number; y: number; r: number; pts: [number, number][]; side: number; small: boolean; t0: number; dur: number };
export type Zone = { k: string; x: number; y: number; r: number; until: number; side?: number };

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
export function parseUlt(e: any, g: any, now: number): UltCast | null {
  if (!e || !/^(ult|ultimate|uult|unit_ult)$/.test(e.e)) return null;
  const caster = g?.pieces?.find((p: any) => p.id === (e.id ?? e.by)); const side = e.side ?? caster?.o ?? 0;
  const race = e.race ?? (e.kind && KIND_RACE[e.kind]) ?? (e.ult && RACE_OF_ULT[e.ult]) ?? g?.races?.[side] ?? "fire", d0 = ULT[race]; if (!d0) return null;
  // название — с сервера (ULTS[key].banner/name, §B3 аудита); запасное — серверные названия в d0.title
  const title = String(e.banner ?? (e.name ? String(e.name).toUpperCase() : "") ?? "") || d0.title, def: Def = { ...d0, key: e.ult ?? e.key ?? d0.key, title };
  const small = e.e === "uult" || e.e === "unit_ult" || e.small === true || (caster && caster.k !== "king");
  const x = e.x ?? caster?.x ?? 0, y = e.y ?? caster?.y ?? 0, r = e.r ?? (small ? Math.max(1, def.r - 1) : def.r);
  const tg: any[] = e.tg ?? e.targets ?? e.hits ?? [];
  const pts = tg.map((t: any) => Array.isArray(t) ? [t[0], t[1]] : typeof t === "number" ? (() => { const p = g?.pieces?.find((q: any) => q.id === t); return p ? [p.x, p.y] : null; })() : t && t.x != null ? [t.x, t.y] : null).filter(Boolean) as [number, number][];
  return { race, def, x, y, r, pts, side, small, t0: now, dur: small ? 1300 : def.kind === "doom" ? 2600 : 2200 };
}
// ---------- состояние ----------
export const casts: UltCast[] = [];
let localZones: Zone[] = [];
export function addCast(c: UltCast, turn: number) {
  casts.push(c);
  if (c.def.zone && c.def.turns) localZones.push({ k: c.def.zone, x: c.x, y: c.y, r: c.r, until: turn + c.def.turns * 2, side: c.side });
}
/** Зоны: с сервера (g.zones / g.ec.zones), иначе локальные из событий (пока сервер их не присылает). */
export function zonesOf(g: any): Zone[] {
  const srv = g?.zones ?? g?.ec?.zones; if (Array.isArray(srv)) return srv.map((z: any) => ({ k: z.k ?? z.kind, x: z.x, y: z.y, r: z.r ?? 0, until: Infinity, side: z.side }));
  localZones = localZones.filter((z) => z.until > (g?.turn ?? 0)); return localZones;
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
export function drawAim(ctx: CanvasRenderingContext2D, race: string, x: number, y: number, r: number, n: number, sx: SX, sy: SX, z: number, now: number, ok = true) {
  const d = ULT[race] || ULT.fire, pulse = 0.5 + 0.5 * Math.sin(now / 160);
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
  const px = z * (devicePixelRatio || 1), k = zn.k, cells = discCells(zn.x, zn.y, zn.r, n), set = new Set(cells.map(([x, y]) => y * n + x));
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
  for (const zn of zs) if (!drawZoneArt(ctx, zn, n, sx, sy, z, now)) for (const [X, Y] of discCells(zn.x, zn.y, zn.r, n)) {
    const x0 = sx(X), y0 = sy(Y), h = ((X * 73856093) ^ (Y * 19349663)) >>> 0; ctx.save();
    if (zn.k === "burn") { ctx.fillStyle = "rgba(60,14,6,.55)"; ctx.fillRect(x0, y0, z, z);
      for (let i = 0; i < 3; i++) { const fx = x0 + ((h >> (i * 5)) % 100) / 100 * z * 0.8 + z * 0.1, fy = y0 + z * 0.85, fl = 0.75 + 0.25 * Math.sin(now / 120 + i + h); ctx.fillStyle = i % 2 ? "#ffd23f" : "#ff7a1a";
        ctx.beginPath(); ctx.moveTo(fx - z * 0.08, fy); ctx.quadraticCurveTo(fx, fy - z * 0.42 * fl, fx + z * 0.08, fy); ctx.fill(); }
      ctx.strokeStyle = "#ff7a1a88"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 1, y0 + 1, z - 2, z - 2); }
    else if (zn.k === "frost") { ctx.fillStyle = "rgba(200,240,255,.38)"; ctx.fillRect(x0, y0, z, z); ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = Math.max(1, z * 0.025);
      const cx = x0 + z / 2, cy = y0 + z / 2; for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * z * 0.22, cy - Math.sin(a) * z * 0.22); ctx.lineTo(cx + Math.cos(a) * z * 0.22, cy + Math.sin(a) * z * 0.22); ctx.stroke(); } }
    else if (zn.k === "wall") { const edge = !inDisc(X - zn.x, Y - zn.y, zn.r - 1); if (edge) { ctx.fillStyle = "#4a3a2a"; ctx.fillRect(x0 + z * 0.08, y0 + z * 0.3, z * 0.84, z * 0.6); ctx.fillStyle = "#c2a27a";
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x0 + z * (0.1 + c * 0.28 + (r % 2) * 0.06), y0 + z * (0.32 + r * 0.19), z * 0.24, z * 0.16); }
      else { ctx.fillStyle = "rgba(194,162,122,.18)"; ctx.fillRect(x0, y0, z, z); } }
    else if (zn.k === "vines") { ctx.strokeStyle = "#3d7a2a"; ctx.lineWidth = Math.max(1.5, z * 0.05); ctx.beginPath(); ctx.moveTo(x0, y0 + z * 0.8); ctx.bezierCurveTo(x0 + z * 0.3, y0 + z * 0.2, x0 + z * 0.7, y0 + z, x0 + z, y0 + z * 0.3); ctx.stroke();
      ctx.fillStyle = "#7ccf5a"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x0 + z * (0.2 + i * 0.3), y0 + z * (0.55 + ((h >> i) & 1) * 0.15), z * 0.08, z * 0.04, i, 0, 7); ctx.fill(); } }
    else if (zn.k === "flood") { ctx.fillStyle = "rgba(63,167,214,.35)"; ctx.fillRect(x0, y0, z, z); ctx.strokeStyle = "#d6f3ffaa"; ctx.lineWidth = Math.max(1, z * 0.03); const o = Math.sin(now / 400 + X) * z * 0.05;
      ctx.beginPath(); ctx.moveTo(x0 + z * 0.1, y0 + z * 0.5 + o); ctx.quadraticCurveTo(x0 + z * 0.3, y0 + z * 0.35 + o, x0 + z * 0.5, y0 + z * 0.5 + o); ctx.quadraticCurveTo(x0 + z * 0.7, y0 + z * 0.65 + o, x0 + z * 0.9, y0 + z * 0.5 + o); ctx.stroke(); }
    ctx.restore();
  }
  return zs.length > 0;
}
/** Анимация каста. Возвращает true, пока что-то движется. */
export function drawCasts(ctx: CanvasRenderingContext2D, n: number, sx: SX, sy: SX, z: number, now: number): boolean {
  for (let i = casts.length - 1; i >= 0; i--) if (now - casts[i].t0 > casts[i].dur) casts.splice(i, 1);
  for (const c of casts) {
    const k = (now - c.t0) / c.dur, cx = sx(c.x) + z / 2, cy = sy(c.y) + z / 2, R = (c.r + 0.5) * z, d = c.def; ctx.save();
    if (d.kind === "doom") { // падение, вспышка, ударная волна, огненный шар, дым
      if (k < 0.18) { const f = k / 0.18; ctx.strokeStyle = d.col2; ctx.lineWidth = z * 0.12 * (1 - f) + 2; ctx.beginPath(); ctx.moveTo(cx, cy - R * 3 * (1 - f)); ctx.lineTo(cx, cy); ctx.stroke(); }
      else { const f = (k - 0.18) / 0.82, e = easeOut(Math.min(1, f * 1.6));
        if (f < 0.12) { ctx.fillStyle = `rgba(255,255,230,${0.8 * (1 - f / 0.12)})`; ctx.fillRect(sx(0) - z * 4, sy(0) - z * 4, n * z + z * 8, n * z + z * 8); }
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * e); gr.addColorStop(0, `rgba(255,240,180,${1 - f})`); gr.addColorStop(0.45, `rgba(255,122,26,${0.9 * (1 - f)})`); gr.addColorStop(1, "rgba(127,33,25,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * e, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,210,63,${1 - f})`; ctx.lineWidth = z * 0.18 * (1 - f) + 1; ctx.beginPath(); ctx.arc(cx, cy, R * (0.4 + 1.1 * e), 0, 7); ctx.stroke();
        ctx.strokeStyle = `rgba(26,20,32,${0.8 * (1 - f)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R * (0.4 + 1.1 * e) + z * 0.1, 0, 7); ctx.stroke();
        for (let j = 0; j < 14; j++) { const a = (j / 14) * Math.PI * 2 + j, rr = R * (0.2 + 1.2 * e) * (0.6 + ((j * 37) % 10) / 25); ctx.fillStyle = j % 2 ? d.col2 : d.col; ctx.globalAlpha = 1 - f;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr - f * z * 0.8, z * 0.08 * (1 - f) + 1, 0, 7); ctx.fill(); } } }
    else if (d.kind === "chain") { // «мигание» по цели с молниями-следами (как Флэш)
      const pts: [number, number][] = [[c.x, c.y], ...c.pts], seg = Math.max(1, pts.length - 1), at = Math.min(seg, k * 1.4 * seg);
      for (let j = 0; j < Math.floor(at) + 1 && j < seg; j++) { const [ax, ay] = pts[j], [bx, by] = pts[j + 1] || pts[j], p = Math.min(1, at - j), A = [sx(ax) + z / 2, sy(ay) + z / 2], B = [sx(bx) + z / 2, sy(by) + z / 2];
        const fade = Math.max(0, 1 - (k - (j / seg) / 1.4) * 1.6); ctx.globalAlpha = fade;
        for (const [w, col] of [[z * 0.16, d.col], [z * 0.05, d.col2]] as [number, string][]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "miter"; ctx.beginPath(); ctx.moveTo(A[0], A[1]);
          for (let s = 1; s <= 6; s++) { const t = (s / 6) * p, jit = s < 6 ? Math.sin(now / 30 + s * 7 + j) * z * 0.18 : 0; ctx.lineTo(A[0] + (B[0] - A[0]) * t + jit, A[1] + (B[1] - A[1]) * t - jit); } ctx.stroke(); }
        if (p >= 1) { ctx.fillStyle = d.col2; ctx.beginPath(); ctx.arc(B[0], B[1], z * 0.35 * fade, 0, 7); ctx.fill(); } }
      ctx.globalAlpha = 1; }
    else if (d.kind === "wall") { const e = easeOut(Math.min(1, k * 1.8)); for (const [X, Y] of discCells(c.x, c.y, c.r, n)) { if (inDisc(X - c.x, Y - c.y, c.r - 1)) continue; const h = z * 0.7 * e;
        ctx.fillStyle = "#4a3a2a"; ctx.fillRect(sx(X) + z * 0.08, sy(Y) + z * 0.9 - h, z * 0.84, h); ctx.fillStyle = "#c2a27a"; ctx.fillRect(sx(X) + z * 0.12, sy(Y) + z * 0.9 - h, z * 0.76, z * 0.14); }
      ctx.globalAlpha = (1 - k) * 0.6; ctx.strokeStyle = d.col2; ctx.lineWidth = z * 0.08; ctx.beginPath(); ctx.ellipse(cx, cy, R, R * e, 0, Math.PI, 0); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (d.kind === "blizzard") { ctx.globalAlpha = Math.sin(Math.PI * k); const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2); gr.addColorStop(0, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(159,224,255,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, 7); ctx.fill(); ctx.fillStyle = "#fff";
      for (let j = 0; j < 60; j++) { const a = j * 2.4 + k * 9, rr = ((j * 53) % 100) / 100 * R * 1.2; ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z * 0.06, z * 0.06); } ctx.globalAlpha = 1; }
    else if (d.kind === "wave") { const f = easeOut(k), wx = cx - R * 1.6 + f * R * 3.2; ctx.beginPath(); ctx.rect(cx - R, cy - R, R * 2, R * 2); ctx.clip();
      ctx.fillStyle = "rgba(63,167,214,.75)"; ctx.beginPath(); ctx.moveTo(wx - R, cy - R); ctx.lineTo(wx, cy - R); for (let s = 0; s <= 10; s++) ctx.lineTo(wx + Math.sin(s + now / 90) * z * 0.25, cy - R + (s / 10) * R * 2); ctx.lineTo(wx - R, cy + R); ctx.fill();
      ctx.strokeStyle = d.col2; ctx.lineWidth = z * 0.1; ctx.beginPath(); for (let s = 0; s <= 10; s++) ctx.lineTo(wx + Math.sin(s + now / 90) * z * 0.25, cy - R + (s / 10) * R * 2); ctx.stroke(); }
    else if (d.kind === "overgrowth") { const e = easeOut(Math.min(1, k * 1.5)); ctx.strokeStyle = "#3d7a2a"; ctx.lineWidth = z * 0.09;
      for (let j = 0; j < 10; j++) { const a = (j / 10) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a + 0.6) * R * 0.6 * e, cy + Math.sin(a + 0.6) * R * 0.6 * e, cx + Math.cos(a) * R * e, cy + Math.sin(a) * R * e); ctx.stroke(); }
      ctx.fillStyle = d.col; for (let j = 0; j < 10; j++) { const a = (j / 10) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * e, cy + Math.sin(a) * R * e, z * 0.12 * e, 0, 7); ctx.fill(); } }
    ctx.restore();
  }
  return casts.length > 0;
}
