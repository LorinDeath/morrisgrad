// Неон на тёмной сетке. Свечение берётся из маленьких холстов, без shadowBlur в кадре.
import { MAPS, campaignAnchor, cellChar, type MapDef } from "./maps.ts";
import { canBuy, compile, RESEARCH } from "./research.ts";
import { enemyPos } from "./sim.ts";
import { statsOf } from "./combat.ts";
import { modAt } from "./sim.ts";
import {
  ENEMY_COLOR, TOWER_COLOR, TOWER_KINDS, TOWER_NAME,
  type Meta, type Run, type TowerKind,
} from "./types.ts";

export interface Cam { x: number; y: number; z: number }

const glows = new Map<string, HTMLCanvasElement>();

function glow(color: string, radius: number): HTMLCanvasElement {
  const r = Math.max(8, Math.round(radius));
  const key = color + ":" + r;
  const hit = glows.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  const s = r * 4;
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (!g) return c;
  const grd = g.createRadialGradient(s / 2, s / 2, r * 0.15, s / 2, s / 2, r * 1.7);
  grd.addColorStop(0, color);
  grd.addColorStop(0.45, color);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = 0.9;
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  glows.set(key, c);
  return c;
}

export function toScreen(cam: Cam, w: number, h: number, x: number, y: number): { x: number; y: number } {
  return { x: (x - cam.x) * cam.z + w / 2, y: (y - cam.y) * cam.z + h / 2 };
}

export function toWorld(cam: Cam, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - w / 2) / cam.z + cam.x, y: (sy - h / 2) / cam.z + cam.y };
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const sprite = glow(color, radius);
  ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
}

function shape(ctx: CanvasRenderingContext2D, kind: TowerKind, x: number, y: number, s: number): void {
  ctx.beginPath();
  const u = s * 0.28;
  if (kind === "needle" || kind === "bolt") {
    ctx.moveTo(x, y - u * 1.3);
    ctx.lineTo(x + u * 0.7, y + u);
    ctx.lineTo(x - u * 0.7, y + u);
  } else if (kind === "muzzle" || kind === "awl") {
    ctx.rect(x - u, y - u * 0.7, u * 2, u * 1.4);
  } else if (kind === "spark" || kind === "swarm") {
    ctx.moveTo(x, y - u);
    ctx.lineTo(x + u, y);
    ctx.lineTo(x, y + u);
    ctx.lineTo(x - u, y);
  } else if (kind === "miner") {
    ctx.rect(x - u * 0.8, y - u * 0.8, u * 1.6, u * 1.6);
  } else if (kind === "arc" || kind === "beam") {
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      ctx.lineTo(x + Math.cos(a) * u, y + Math.sin(a) * u);
    }
  } else {
    ctx.arc(x, y, u, 0, Math.PI * 2);
  }
  ctx.closePath();
}

export function fitCam(w: number, h: number, worldW: number, worldH: number, pad = 1.4): Cam {
  const z = Math.min(w / (worldW + pad), h / (worldH + pad));
  return { x: worldW / 2, y: worldH / 2, z: Math.max(0.35, z) };
}

export interface Ghost { x: number; y: number; kind: TowerKind; range: number; ok: boolean }

export function paintBattle(
  ctx: CanvasRenderingContext2D, w: number, h: number, map: MapDef, run: Run, meta: Meta,
  cam: Cam, selected: number, showNumbers: boolean, ghost: Ghost | null = null,
): void {
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);
  const z = cam.z;
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const p = toScreen(cam, w, h, x, y);
      const ch = cellChar(map, x, y);
      const mod = run.mods[x + "," + y];
      let fill = "#0c1424";
      if (ch === "#") fill = "#080c14";
      else if (ch === "=" || ch === "S" || ch === "T" || ch === "U") fill = "#101a30";
      else if (ch === "G" || ch === "H") fill = "#2a1a08";
      else if (ch === "v") fill = "#241c0c";
      else if (ch === "+" || mod === "dmg") fill = "#2a140c";
      else if (ch === "*" || mod === "range") fill = "#0c2430";
      else if (ch === "~" || mod === "rate") fill = "#24102a";
      else if (ch === "^" || mod === "xp") fill = "#14240c";
      else if (ch === "$" || mod === "bounty") fill = "#2a2208";
      ctx.fillStyle = fill;
      ctx.fillRect(p.x, p.y, z + 0.5, z + 0.5);
    }
  }
  ctx.strokeStyle = "rgba(90, 150, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= map.cols; x++) {
    const a = toScreen(cam, w, h, x, 0);
    const b = toScreen(cam, w, h, x, map.rows);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = 0; y <= map.rows; y++) {
    const a = toScreen(cam, w, h, 0, y);
    const b = toScreen(cam, w, h, map.cols, y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  for (const route of map.ground) {
    ctx.beginPath();
    route.pts.forEach((pt, i) => {
      const p = toScreen(cam, w, h, pt.x, pt.y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = "rgba(70, 140, 255, 0.22)";
    ctx.lineWidth = Math.max(8, z * 0.42);
    ctx.stroke();
    ctx.strokeStyle = "rgba(150, 210, 255, 0.85)";
    ctx.lineWidth = Math.max(2, z * 0.08);
    ctx.stroke();
    for (let i = 0; i < route.pts.length - 1; i += 2) {
      const a = route.pts[i];
      const b = route.pts[i + 1];
      const p = toScreen(cam, w, h, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(210, 240, 255, 0.85)";
      ctx.beginPath();
      ctx.moveTo(z * 0.16, 0);
      ctx.lineTo(-z * 0.08, z * 0.09);
      ctx.lineTo(-z * 0.08, -z * 0.09);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 260);
  for (const s of map.spawns) {
    const p = toScreen(cam, w, h, s.x + 0.5, s.y + 0.5);
    blob(ctx, p.x, p.y, z * (0.55 + pulse * 0.15), "#c9a6ff");
    ctx.strokeStyle = "#e7d6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, z * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f4e9ff";
    ctx.font = `700 ${Math.max(10, z * 0.22)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Портал", p.x, p.y - z * 0.42);
  }
  for (const g of map.gates) {
    const p = toScreen(cam, w, h, g.x + 0.5, g.y + 0.5);
    blob(ctx, p.x, p.y, z * (0.62 + pulse * 0.2), "#ffb020");
    ctx.strokeStyle = "#ffe1a0";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - z * 0.28, p.y - z * 0.28, z * 0.56, z * 0.56);
    ctx.fillStyle = "#fff4d2";
    ctx.font = `700 ${Math.max(10, z * 0.22)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Врата", p.x, p.y - z * 0.42);
  }
  for (const route of map.air) {
    ctx.beginPath();
    route.pts.forEach((pt, i) => {
      const p = toScreen(cam, w, h, pt.x, pt.y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(200, 160, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (ghost) {
    const p = toScreen(cam, w, h, ghost.x + 0.5, ghost.y + 0.5);
    ctx.globalAlpha = ghost.ok ? 0.85 : 0.35;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ghost.range * z, 0, Math.PI * 2);
    ctx.strokeStyle = TOWER_COLOR[ghost.kind];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    blob(ctx, p.x, p.y, Math.max(12, z * 0.5), TOWER_COLOR[ghost.kind]);
    ctx.fillStyle = TOWER_COLOR[ghost.kind];
    shape(ctx, ghost.kind, p.x, p.y, z);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const sel = run.towers.find((t) => t.id === selected);
  if (sel && sel.kind !== "miner") {
    const st = statsOf(sel, modAt(map, run, sel.x, sel.y), compile(meta), 0);
    const p = toScreen(cam, w, h, sel.x + 0.5, sel.y + 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, st.range * z, 0, Math.PI * 2);
    ctx.strokeStyle = TOWER_COLOR[sel.kind];
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const t of run.towers) {
    const p = toScreen(cam, w, h, t.x + 0.5, t.y + 0.5);
    const color = TOWER_COLOR[t.kind];
    blob(ctx, p.x, p.y, Math.max(10, z * 0.55), color);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#f4fbff";
    ctx.lineWidth = 1.4;
    shape(ctx, t.kind, p.x, p.y, z);
    ctx.fill();
    ctx.stroke();
    if (t.offer) {
      ctx.fillStyle = "#ffe9a8";
      ctx.fillRect(p.x + z * 0.22, p.y - z * 0.42, 6, 6);
    }
  }
  for (const e of run.enemies) {
    const q = enemyPos(map, e);
    const p = toScreen(cam, w, h, q.x, q.y);
    const color = e.kind === "shade" && e.revealedUntil <= run.time ? "rgba(138,124,255,0.35)" : ENEMY_COLOR[e.kind];
    const body = Math.max(8, z * (e.kind === "boss" ? 0.42 : 0.3));
    blob(ctx, p.x, p.y, body * 1.7, ENEMY_COLOR[e.kind]);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#f7fbff";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (e.air) ctx.arc(p.x, p.y, body, 0, Math.PI * 2);
    else {
      ctx.moveTo(p.x, p.y - body);
      ctx.lineTo(p.x + body * 0.86, p.y);
      ctx.lineTo(p.x, p.y + body);
      ctx.lineTo(p.x - body * 0.86, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const bw = Math.max(16, z * 0.72);
    const bh = Math.max(4, z * 0.09);
    const bx = p.x - bw / 2;
    const by = p.y - body - bh - 3;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = ratio > 0.45 ? "#8dffc0" : "#ff5d7a";
    ctx.fillRect(bx, by, bw * ratio, bh);
    if (e.shield > 0) {
      ctx.fillStyle = "#9ad7ff";
      ctx.fillRect(bx, by - 2, bw * Math.min(1, e.shield / (e.maxHp * 0.5)), 2);
    }
  }
  for (const proj of run.projs) {
    const p = toScreen(cam, w, h, proj.x, proj.y);
    blob(ctx, p.x, p.y, 8, proj.color);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (showNumbers) {
    const bags = new Map<string, { x: number; y: number; sum: number; ttl: number; color: string }>();
    for (const fx of run.fx) {
      if (fx.kind !== "num") continue;
      const n = Number(String(fx.text).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) continue;
      const key = Math.round(fx.x) + ":" + Math.round(fx.y);
      const bag = bags.get(key);
      if (!bag) bags.set(key, { x: fx.x, y: fx.y, sum: n, ttl: fx.ttl, color: fx.color });
      else { bag.sum += n; bag.ttl = Math.max(bag.ttl, fx.ttl); }
    }
    ctx.font = "700 11px sans-serif";
    ctx.textAlign = "center";
    let i = 0;
    for (const bag of bags.values()) {
      const p = toScreen(cam, w, h, bag.x, bag.y);
      const rise = (0.75 - Math.min(0.75, bag.ttl)) * 28;
      const shift = (i % 3 - 1) * 10;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, bag.ttl / 0.35));
      ctx.fillStyle = bag.color;
      ctx.fillText(String(Math.round(bag.sum)), p.x + shift, p.y - 10 - rise);
      i++;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }
  for (const fx of run.fx) {
    if (fx.kind === "num") continue;
    if (fx.kind === "beam") {
      const a = toScreen(cam, w, h, fx.x, fx.y);
      const b = toScreen(cam, w, h, fx.x2, fx.y2);
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const p = toScreen(cam, w, h, fx.x, fx.y);
      blob(ctx, p.x, p.y, 18 * (0.4 + fx.ttl), fx.color);
    }
  }
}

export function paintWorld(ctx: CanvasRenderingContext2D, w: number, h: number, meta: Meta, cam: Cam, endless: boolean): void {
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(80, 140, 255, 0.08)";
  ctx.lineWidth = 1;
  const step = 48;
  const origin = toWorld(cam, w, h, 0, 0);
  const far = toWorld(cam, w, h, w, h);
  ctx.beginPath();
  for (let x = Math.floor(origin.x / step) * step; x < far.x; x += step) {
    const a = toScreen(cam, w, h, x, origin.y);
    const b = toScreen(cam, w, h, x, far.y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = Math.floor(origin.y / step) * step; y < far.y; y += step) {
    const a = toScreen(cam, w, h, origin.x, y);
    const b = toScreen(cam, w, h, far.x, y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 1; i < MAPS.length; i++) {
    const a = campaignAnchor(i - 1);
    const b = campaignAnchor(i);
    const pa = toScreen(cam, w, h, a.x, a.y);
    const pb = toScreen(cam, w, h, b.x, b.y);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (i % 2 === 0 ? 1 : -1) * Math.min(48, len * 0.28);
    const cx = (pa.x + pb.x) / 2 + (-dy / len) * bend;
    const cy = (pa.y + pb.y) / 2 + (dx / len) * bend;
    const cleared = (meta.stars[MAPS[i - 1].id] ?? 0) > 0;
    ctx.strokeStyle = cleared ? "rgba(130, 230, 255, 0.8)" : "rgba(70, 100, 140, 0.45)";
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "center";
  MAPS.forEach((map, i) => {
    const anchor = campaignAnchor(i);
    const p = toScreen(cam, w, h, anchor.x, anchor.y);
    const stars = meta.stars[map.id] ?? 0;
    const open = i === 0 || (meta.stars[MAPS[i - 1].id] ?? 0) >= 1;
    const frontier = open && stars === 0;
    const pulse = frontier ? 0.65 + 0.35 * Math.sin(Date.now() / 240) : 1;
    const color = !open ? "#2c3c52" : stars > 0 ? "#7dfff0" : "#9ad7ff";
    blob(ctx, p.x, p.y, frontier ? 26 + pulse * 8 : 18, color);
    ctx.globalAlpha = open ? 1 : 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#071018";
    ctx.fillText(String(i + 1), p.x, p.y + 4);
    const best = meta.endlessBest[map.id] ?? 0;
    ctx.fillStyle = "#9eb6d4";
    if (cam.z >= 0.62) {
      ctx.font = "600 11px sans-serif";
      ctx.fillText(map.name, p.x, p.y + 32);
      ctx.fillText(endless ? (open ? (best ? `волна ${best}` : "нет рекорда") : "закрыто") : "★".repeat(stars) + "☆".repeat(3 - stars), p.x, p.y + 46);
    } else {
      ctx.font = "600 9px sans-serif";
      ctx.fillText(endless ? (open ? (best ? `в.${best}` : "—") : "закр.") : "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars)), p.x, p.y + 26);
    }
    ctx.globalAlpha = 1;
    ctx.font = "700 13px sans-serif";
  });
  ctx.textAlign = "left";
}

const BRANCH_EXTRA: Record<string, string> = {
  "Казна": "#ffd56a", "Умения": "#ff7ad1", "Бестиарий": "#ff8a5a", "Чертёж": "#8dffc0", "Бездна": "#d7b4ff",
};

function branchColor(branch: string): string {
  for (const k of TOWER_KINDS) if (TOWER_NAME[k] === branch) return TOWER_COLOR[k];
  return BRANCH_EXTRA[branch] ?? "#8ecbff";
}

interface Slot { id: string; x: number; y: number; color: string; kind: TowerKind | null }
let treeSlots: Slot[] | null = null;

function treeLayout(): Slot[] {
  if (treeSlots) return treeSlots;
  const branches: string[] = [];
  for (const n of RESEARCH) if (!branches.includes(n.branch)) branches.push(n.branch);
  const out: Slot[] = [];
  branches.forEach((branch, i) => {
    const nodes = RESEARCH.filter((n) => n.branch === branch).sort((a, b) => a.y - b.y);
    const ang = -Math.PI / 2 + (i * Math.PI * 2) / branches.length;
    const kind = TOWER_KINDS.find((k) => TOWER_NAME[k] === branch) ?? null;
    nodes.forEach((n, j) => {
      const r = 280 + j * 200;
      out.push({ id: n.id, x: Math.cos(ang) * r, y: Math.sin(ang) * r, color: branchColor(branch), kind });
    });
  });
  treeSlots = out;
  return out;
}

function slotById(id: string): Slot | undefined {
  return treeLayout().find((s) => s.id === id);
}

export function paintTree(ctx: CanvasRenderingContext2D, w: number, h: number, meta: Meta, cam: Cam, selected: string | null): void {
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);
  const origin = toWorld(cam, w, h, 0, 0);
  const far = toWorld(cam, w, h, w, h);
  ctx.strokeStyle = "rgba(80, 140, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(origin.x / 80) * 80; x < far.x; x += 80) {
    const a = toScreen(cam, w, h, x, origin.y);
    const b = toScreen(cam, w, h, x, far.y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = Math.floor(origin.y / 80) * 80; y < far.y; y += 80) {
    const a = toScreen(cam, w, h, origin.x, y);
    const b = toScreen(cam, w, h, far.x, y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  const hub = toScreen(cam, w, h, 0, 0);
  const roots = new Map<string, Slot>();
  for (const s of treeLayout()) if (!roots.has(RESEARCH.find((n) => n.id === s.id)!.branch)) roots.set(RESEARCH.find((n) => n.id === s.id)!.branch, s);
  ctx.lineWidth = 1.6;
  for (const s of roots.values()) {
    const p = toScreen(cam, w, h, s.x, s.y);
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(hub.x, hub.y);
    ctx.quadraticCurveTo((hub.x + p.x) / 2, (hub.y + p.y) / 2 - 20, p.x, p.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const node of RESEARCH) {
    for (const req of node.requires) {
      const parent = slotById(req.id);
      const child = slotById(node.id);
      if (!parent || !child) continue;
      const a = toScreen(cam, w, h, parent.x, parent.y);
      const b = toScreen(cam, w, h, child.x, child.y);
      const cross = parent.color !== child.color;
      const have = (meta.nodes[req.id] ?? 0) >= req.level;
      ctx.strokeStyle = have ? child.color : "rgba(90, 110, 140, 0.4)";
      ctx.globalAlpha = cross ? 0.85 : 0.55;
      ctx.setLineDash(cross ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2 + (cross ? 18 : 0);
      const my = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
  blob(ctx, hub.x, hub.y, 36, "#ffb020");
  ctx.fillStyle = "#ffb020";
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1208";
  ctx.font = "700 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Врата", hub.x, hub.y + 4);
  for (const node of RESEARCH) {
    const s = slotById(node.id);
    if (!s) continue;
    const p = toScreen(cam, w, h, s.x, s.y);
    if (p.x < -120 || p.y < -60 || p.x > w + 120 || p.y > h + 60) continue;
    const lv = meta.nodes[node.id] ?? 0;
    const buy = canBuy(meta, node.id);
    const maxed = lv >= node.max;
    const owned = lv > 0;
    const ready = buy.ok;
    const color = maxed ? "#ffe08a" : owned ? s.color : ready ? "#d7f4ff" : "#3d516c";
    if (ready && !maxed) blob(ctx, p.x, p.y, 26, color);
    else if (owned) blob(ctx, p.x, p.y, 16, s.color);
    ctx.globalAlpha = ready || owned ? 1 : 0.55;
    ctx.fillStyle = "rgba(7, 12, 24, 0.94)";
    ctx.strokeStyle = color;
    ctx.lineWidth = node.id === selected ? 2.6 : 1.3;
    roundRect(ctx, p.x - 78, p.y - 26, 156, 52, 10);
    ctx.fill();
    ctx.stroke();
    if (s.kind) {
      ctx.fillStyle = s.color;
      shape(ctx, s.kind, p.x - 58, p.y, 28);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x - 58, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#eaf4ff";
    ctx.font = "700 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(node.name.slice(0, 16), p.x - 42, p.y - 4);
    ctx.fillStyle = "#9eb6d4";
    ctx.font = "10px sans-serif";
    const cost = maxed ? "максимум" : buy.cost ? `${buy.cost.sparks} искр` : "закрыто";
    ctx.fillText(`${lv}/${node.max} · ${cost}`, p.x - 42, p.y + 12);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
}

export function paintMapPreview(ctx: CanvasRenderingContext2D, map: MapDef, w: number, h: number): void {
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);
  const z = Math.min((w - 8) / map.cols, (h - 8) / map.rows);
  const ox = (w - map.cols * z) / 2;
  const oy = (h - map.rows * z) / 2;
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    const ch = map.grid[y][x];
    ctx.fillStyle = ch === "#" ? "#10151f" : ch === "=" || ch === "S" || ch === "T" ? "#163056" : ch === "G" || ch === "H" ? "#6a4010" : ch === "v" ? "#3a3014" : "#122033";
    ctx.fillRect(ox + x * z, oy + y * z, z + 0.4, z + 0.4);
  }
  ctx.strokeStyle = "#9ad7ff";
  ctx.lineWidth = Math.max(1.5, z * 0.18);
  for (const route of map.ground) {
    ctx.beginPath();
    route.pts.forEach((pt, i) => {
      const x = ox + pt.x * z;
      const y = oy + pt.y * z;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function worldHit(cam: Cam, w: number, h: number, sx: number, sy: number): number {
  let best = -1;
  let bd = 28 * 28;
  MAPS.forEach((_, i) => {
    const a = campaignAnchor(i);
    const p = toScreen(cam, w, h, a.x, a.y);
    const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function treeHit(cam: Cam, w: number, h: number, sx: number, sy: number): string | null {
  const slots = treeLayout();
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    const p = toScreen(cam, w, h, s.x, s.y);
    if (Math.abs(sx - p.x) <= 78 && Math.abs(sy - p.y) <= 26) return s.id;
  }
  return null;
}
