// Неон на тёмной сетке. Свечение берётся из маленьких холстов, без shadowBlur в кадре.
import { MAPS, campaignAnchor, cellChar, type MapDef } from "./maps.ts";
import { canBuy, compile, RESEARCH } from "./research.ts";
import { enemyPos } from "./sim.ts";
import { statsOf } from "./combat.ts";
import { modAt } from "./sim.ts";
import {
  ENEMY_COLOR, TOWER_COLOR,
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

export function paintBattle(
  ctx: CanvasRenderingContext2D, w: number, h: number, map: MapDef, run: Run, meta: Meta,
  cam: Cam, selected: number, showNumbers: boolean,
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
    ctx.strokeStyle = "rgba(90, 160, 255, 0.35)";
    ctx.lineWidth = Math.max(2, z * 0.18);
    ctx.stroke();
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
    blob(ctx, p.x, p.y, e.air ? z * 0.42 : z * 0.34, ENEMY_COLOR[e.kind]);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (e.air) ctx.arc(p.x, p.y, Math.max(4, z * 0.16), 0, Math.PI * 2);
    else {
      ctx.moveTo(p.x, p.y - z * 0.18);
      ctx.lineTo(p.x + z * 0.16, p.y);
      ctx.lineTo(p.x, p.y + z * 0.18);
      ctx.lineTo(p.x - z * 0.16, p.y);
    }
    ctx.closePath();
    ctx.fill();
    const ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(p.x - z * 0.22, p.y - z * 0.32, z * 0.44, 3);
    ctx.fillStyle = ratio > 0.4 ? "#7dffb2" : "#ff5a7a";
    ctx.fillRect(p.x - z * 0.22, p.y - z * 0.32, z * 0.44 * ratio, 3);
  }
  for (const proj of run.projs) {
    const p = toScreen(cam, w, h, proj.x, proj.y);
    blob(ctx, p.x, p.y, 8, proj.color);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const fx of run.fx) {
    if (fx.kind === "num") {
      if (!showNumbers) continue;
      ctx.fillStyle = fx.color;
      ctx.font = "700 12px sans-serif";
      ctx.fillText(fx.text, toScreen(cam, w, h, fx.x, fx.y).x, toScreen(cam, w, h, fx.x, fx.y).y);
    } else if (fx.kind === "beam") {
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
  ctx.lineWidth = 2;
  for (let i = 1; i < MAPS.length; i++) {
    const a = campaignAnchor(i - 1);
    const b = campaignAnchor(i);
    const pa = toScreen(cam, w, h, a.x, a.y);
    const pb = toScreen(cam, w, h, b.x, b.y);
    ctx.strokeStyle = (meta.stars[MAPS[i - 1].id] ?? 0) > 0 ? "rgba(120, 220, 255, 0.7)" : "rgba(80, 110, 160, 0.35)";
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "center";
  MAPS.forEach((map, i) => {
    const anchor = campaignAnchor(i);
    const p = toScreen(cam, w, h, anchor.x, anchor.y);
    const stars = meta.stars[map.id] ?? 0;
    const open = i === 0 || (meta.stars[MAPS[i - 1].id] ?? 0) >= 1;
    const color = open ? (stars > 0 ? "#7dfff0" : "#8ecbff") : "#3c4e68";
    blob(ctx, p.x, p.y, 22, color);
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
      ctx.fillText(endless ? (open ? (best ? String(best) : "·") : "") : "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars)), p.x, p.y + 26);
    }
    ctx.font = "700 13px sans-serif";
  });
  ctx.textAlign = "left";
}

export function paintTree(ctx: CanvasRenderingContext2D, w: number, h: number, meta: Meta, cam: Cam, selected: string | null): void {
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1.5;
  for (const node of RESEARCH) {
    for (const req of node.requires) {
      const parent = RESEARCH.find((n) => n.id === req.id);
      if (!parent) continue;
      const a = toScreen(cam, w, h, parent.x, parent.y);
      const b = toScreen(cam, w, h, node.x, node.y);
      const have = (meta.nodes[req.id] ?? 0) >= req.level;
      ctx.strokeStyle = have ? "rgba(120, 220, 255, 0.55)" : "rgba(70, 90, 120, 0.35)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.textAlign = "center";
  ctx.font = "700 12px sans-serif";
  for (const node of RESEARCH) {
    const p = toScreen(cam, w, h, node.x, node.y);
    const lv = meta.nodes[node.id] ?? 0;
    const open = canBuy(meta, node.id).ok || lv > 0;
    const color = lv >= node.max ? "#ffe08a" : lv > 0 ? "#7dfff0" : open ? "#8ecbff" : "#35506e";
    if (p.x < -80 || p.y < -40 || p.x > w + 80 || p.y > h + 40) continue;
    blob(ctx, p.x, p.y, node.id === selected ? 28 : 18, color);
    ctx.fillStyle = "rgba(8, 14, 28, 0.92)";
    ctx.strokeStyle = color;
    ctx.lineWidth = node.id === selected ? 2.5 : 1.2;
    roundRect(ctx, p.x - 78, p.y - 24, 156, 48, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e7f3ff";
    ctx.fillText(node.name, p.x, p.y - 4);
    ctx.fillStyle = "#9eb6d4";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${lv}/${node.max} · ${node.branch}`, p.x, p.y + 12);
    ctx.font = "700 12px sans-serif";
  }
  ctx.textAlign = "left";
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
  for (let i = RESEARCH.length - 1; i >= 0; i--) {
    const node = RESEARCH[i];
    const p = toScreen(cam, w, h, node.x, node.y);
    if (Math.abs(sx - p.x) <= 78 && Math.abs(sy - p.y) <= 24) return node.id;
  }
  return null;
}
