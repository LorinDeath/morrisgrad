// Неон на тёмной сетке и целые пиксельные спрайты. Свечение берётся из маленьких холстов, без shadowBlur в кадре.
import { MAPS, campaignAnchor, cellChar, type MapDef } from "./maps.ts";
import { canBuy, compile, RESEARCH } from "./research.ts";
import { bonusesFor, revealed } from "./modes.ts";
import { enemyPos } from "./sim.ts";
import { levelOf, statsOf } from "./combat.ts";
import { modAt } from "./sim.ts";
import { enemyFrame, spriteUrl, towerFrame, PROJ_SPRITE, TOWER_SPRITE } from "./sprites.ts";
import {
  ENEMY_COLOR, ENEMY_KINDS, TOWER_COLOR, TOWER_KINDS, TOWER_NAME,
  type EnemyKind, type Meta, type Run, type TowerKind,
} from "./types.ts";

export interface Cam { x: number; y: number; z: number; turn?: boolean; span?: number }

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

function visualOf(cam: Cam, x: number, y: number): { x: number; y: number } {
  if (!cam.turn) return { x, y };
  return { x: (cam.span ?? 0) - y, y: x };
}

export function toScreen(cam: Cam, w: number, h: number, x: number, y: number): { x: number; y: number } {
  const v = visualOf(cam, x, y);
  return { x: (v.x - cam.x) * cam.z + w / 2, y: (v.y - cam.y) * cam.z + h / 2 };
}

export function toWorld(cam: Cam, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  const vx = (sx - w / 2) / cam.z + cam.x;
  const vy = (sy - h / 2) / cam.z + cam.y;
  if (!cam.turn) return { x: vx, y: vy };
  return { x: vy, y: (cam.span ?? 0) - vx };
}

function screenAngle(cam: Cam, ang: number): number {
  if (!cam.turn) return ang;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  return Math.atan2(dx, -dy);
}

function fillCell(ctx: CanvasRenderingContext2D, cam: Cam, w: number, h: number, x: number, y: number, z: number): void {
  const a = toScreen(cam, w, h, x, y);
  const b = toScreen(cam, w, h, x + 1, y + 1);
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 0.5, Math.abs(b.y - a.y) + 0.5);
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const sprite = glow(color, radius);
  ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
}

const frames = new Map<string, HTMLImageElement>();

export function warmSprites(): void {
  const names = new Set<string>();
  for (const k of TOWER_KINDS) {
    names.add(TOWER_SPRITE[k] + "_a");
    names.add(TOWER_SPRITE[k] + "_b");
    names.add(PROJ_SPRITE[k]);
  }
  for (const k of ENEMY_KINDS) names.add(enemyFrame(k, 1, 0, 0));
  for (const n of [
    "boss_lich", "boss_demon", "boss_skeleton_king", "boss_minotaur", "boss_dragon", "boss_warlord",
    "enemy_walker_a", "enemy_walker_b", "enemy_runner_a", "enemy_runner_b", "enemy_tank_a", "enemy_tank_b",
    "enemy_swarm_a", "enemy_swarm_b", "enemy_healer_a", "enemy_healer_b", "enemy_flyer_a", "enemy_flyer_b",
    "enemy_shield_a", "enemy_shield_b", "enemy_splitter_a", "enemy_splitter_b", "enemy_ghost_a", "enemy_ghost_b",
    "enemy_regen_a", "enemy_regen_b",
    "fx_explode", "fx_hit", "fx_shockwave", "fx_spark",
    "proj_arrow", "proj_cannonball", "proj_fireball", "proj_ice_shard", "proj_bolt", "proj_poison", "proj_beam",
    "tile_rock", "tile_ore", "tile_crystal", "tile_portal", "tile_gate", "tile_castle", "tile_tree", "tile_tree_pine",
    "tile_tree_dead", "tile_stump", "tile_ruin", "tile_rubble", "tile_wall", "tile_wall_moss", "decor_lantern", "decor_lamp", "decor_fence", "decor_bridge",
    "ability_fire", "ability_blizzard", "ability_dawn",
    "icon_gold", "icon_heart", "icon_star", "icon_gem", "icon_skull", "icon_clock", "icon_lock", "icon_sword", "icon_shield", "icon_trophy", "icon_map", "icon_chest",
    "mode_blitz", "mode_boss_parade", "mode_five_towers", "mode_labyrinth", "mode_fog", "mode_two_streams", "mode_one_life", "mode_daily", "mode_chaos", "mode_sandbox",
  ]) names.add(n);
  for (const name of names) {
    if (frames.has(name)) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = spriteUrl(name);
    frames.set(name, img);
  }
}

function frameOf(name: string): HTMLImageElement | null {
  const img = frames.get(name);
  if (!img || !img.complete || img.naturalWidth <= 0) return null;
  return img;
}

function blit(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number): boolean {
  const img = frameOf(name);
  if (!img) return false;
  const s = Math.max(4, Math.round(size));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  return true;
}

const aimVis = new Map<number, { ang: number; kick: number }>();
const projTrail = new Map<number, { x: number; y: number }[]>();

function cellHash(x: number, y: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  return n;
}

function shadowUnder(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y + size * 0.34), Math.max(3, size * 0.28), Math.max(2, size * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
}

function enemyShape(ctx: CanvasRenderingContext2D, kind: EnemyKind, x: number, y: number, r: number): void {
  ctx.beginPath();
  const poly = (n: number, spin: number, rad: (i: number) => number) => {
    for (let i = 0; i < n; i++) {
      const a = spin + (Math.PI * 2 * i) / n;
      const d = rad(i);
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  };
  if (kind === "walker") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.78, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.78, y);
  } else if (kind === "runner") {
    ctx.moveTo(x - r * 0.15, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x - r * 0.15, y + r);
    ctx.lineTo(x - r * 0.72, y);
  } else if (kind === "knight") poly(6, Math.PI / 6, () => r);
  else if (kind === "healer") ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  else if (kind === "splitter") {
    ctx.moveTo(x, y);
    ctx.lineTo(x - r, y - r * 0.72);
    ctx.lineTo(x - r, y + r * 0.72);
    ctx.closePath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r, y - r * 0.72);
    ctx.lineTo(x + r, y + r * 0.72);
  } else if (kind === "shield") {
    ctx.moveTo(x - r, y - r * 0.62);
    ctx.lineTo(x + r, y - r * 0.62);
    ctx.lineTo(x + r * 0.78, y + r * 0.15);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.78, y + r * 0.15);
  } else if (kind === "flyer") {
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 1.15, y - r * 0.45);
    ctx.lineTo(x - r * 0.15, y);
    ctx.lineTo(x - r * 1.15, y + r * 0.45);
    ctx.closePath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r * 1.15, y - r * 0.45);
    ctx.lineTo(x + r * 0.15, y);
    ctx.lineTo(x + r * 1.15, y + r * 0.45);
  } else if (kind === "shade") {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 0.38, y);
    ctx.lineTo(x, y + r * 1.2);
    ctx.lineTo(x - r * 0.38, y);
  } else if (kind === "caller") poly(10, -Math.PI / 2, (i) => (i % 2 === 0 ? r : r * 0.42));
  else if (kind === "boss") poly(8, -Math.PI / 8, (i) => (i % 2 === 0 ? r * 1.05 : r * 0.62));
  else if (kind === "mite") ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  else ctx.rect(x - r * 0.68, y - r * 0.68, r * 1.36, r * 1.36);
  ctx.closePath();
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

export function fitBattle(w: number, h: number, cols: number, rows: number): { cam: Cam; minZ: number; maxZ: number } {
  const portrait = h > w * 1.12 && w < 820;
  const turn = portrait && cols > rows + 0.5;
  const ww = turn ? rows : cols;
  const hh = turn ? cols : rows;
  const pad = 0.35;
  const contain = Math.min(w / (ww + pad), h / (hh + pad));
  const cover = Math.max(w / (ww + pad), h / (hh + pad));
  const phone = Math.min(w, h) < 820;
  const z = phone ? Math.max(36, cover) : Math.max(8, contain);
  return {
    cam: { x: ww / 2, y: hh / 2, z, turn, span: rows },
    minZ: Math.max(8, Math.min(contain, z) * 0.92),
    maxZ: Math.max(z, 36) * 2.4,
  };
}

export interface Ghost { x: number; y: number; kind: TowerKind | "wall"; range: number; ok: boolean }

function paintProps(
  ctx: CanvasRenderingContext2D, map: MapDef, run: Run, cam: Cam, w: number, h: number, z: number,
): void {
  const size = Math.max(10, z * 0.86);
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    const ch = cellChar(map, x, y);
    const p = toScreen(cam, w, h, x + 0.5, y + 0.5);
    const n = cellHash(x, y);
    if (ch === "#") {
      const pick = ["tile_rock", "tile_ruin", "tile_rubble", "tile_tree_dead", "tile_stump", "tile_wall", "tile_wall_moss", "tile_tree"][n % 8];
      if (n % 3 !== 0) blit(ctx, pick, p.x, p.y, size * (n % 5 === 0 ? 1.05 : 0.82));
    } else if (ch === "v") blit(ctx, "tile_ore", p.x, p.y, size);
    else if (ch === "+" || run.mods[x + "," + y] === "dmg") blit(ctx, "tile_crystal", p.x, p.y - z * 0.05, size * 0.72);
    else if ("*~^$".includes(ch) || run.mods[x + "," + y]) blit(ctx, "fx_spark", p.x, p.y, size * 0.55);
    else if (ch === "." && n % 11 === 0) blit(ctx, n % 2 ? "tile_tree_pine" : "decor_lamp", p.x, p.y, size * 0.7);
  }
  for (const wall of run.walls) {
    const [xs, ys] = wall.split(",").map(Number);
    const p = toScreen(cam, w, h, xs + 0.5, ys + 0.5);
    blit(ctx, "decor_fence", p.x, p.y, size);
  }
}

export function paintBattle(
  ctx: CanvasRenderingContext2D, w: number, h: number, map: MapDef, run: Run, meta: Meta,
  cam: Cam, selected: number, showNumbers: boolean, ghost: Ghost | null = null,
): void {
  warmSprites();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);
  const z = cam.z;
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
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
      fillCell(ctx, cam, w, h, x, y, z);
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
  paintProps(ctx, map, run, cam, w, h, z);
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
    const flow = (run.time * 0.65) % 1;
    for (let i = 0; i < route.pts.length - 1; i += 2) {
      const a = route.pts[i];
      const b = route.pts[i + 1];
      const p = toScreen(cam, w, h, a.x + (b.x - a.x) * flow, a.y + (b.y - a.y) * flow);
      const ang = screenAngle(cam, Math.atan2(b.y - a.y, b.x - a.x));
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
  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 280);
  const tick = Math.floor(run.time * 4);
  if (run.mode === "fog") {
    ctx.fillStyle = "rgba(2, 4, 12, 0.72)";
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
      if (revealed(run, map, x + 0.5, y + 0.5)) continue;
      fillCell(ctx, cam, w, h, x, y, z);
    }
  }
  for (const s of map.spawns) {
    const p = toScreen(cam, w, h, s.x + 0.5, s.y + 0.5);
    blob(ctx, p.x, p.y, z * (0.48 + pulse * 0.12), "#c9a6ff");
    if (!blit(ctx, "tile_portal", p.x, p.y, z * 0.92)) {
      ctx.strokeStyle = "#e7d6ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, z * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (z > 18) {
      ctx.fillStyle = "#f4e9ff";
      ctx.font = `700 ${Math.max(10, Math.round(z * 0.2))}px "Exo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Портал", Math.round(p.x), Math.round(p.y - z * 0.52));
    }
  }
  for (const g of map.gates) {
    const p = toScreen(cam, w, h, g.x + 0.5, g.y + 0.5);
    blob(ctx, p.x, p.y, z * (0.55 + pulse * 0.16), "#ffb020");
    blit(ctx, "tile_castle", p.x, p.y - z * 0.08, z * 0.95);
    blit(ctx, "tile_gate", p.x, p.y + z * 0.02, z * 0.78);
    if (z > 18) {
      ctx.fillStyle = "#fff4d2";
      ctx.font = `700 ${Math.max(10, Math.round(z * 0.2))}px "Exo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Врата", Math.round(p.x), Math.round(p.y - z * 0.56));
    }
  }
  for (const route of map.air) {
    if (run.mode === "fog" && !route.pts.some((pt) => revealed(run, map, pt.x, pt.y))) continue;
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
  if (ghost && ghost.kind !== "wall") {
    const p = toScreen(cam, w, h, ghost.x + 0.5, ghost.y + 0.5);
    ctx.globalAlpha = ghost.ok ? 0.9 : 0.35;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ghost.range * z, 0, Math.PI * 2);
    ctx.strokeStyle = TOWER_COLOR[ghost.kind];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    blob(ctx, p.x, p.y, Math.max(12, z * 0.46), TOWER_COLOR[ghost.kind]);
    const spr = towerFrame(ghost.kind, false);
    if (!blit(ctx, spr, p.x, p.y, z * 0.86)) {
      ctx.fillStyle = TOWER_COLOR[ghost.kind];
      shape(ctx, ghost.kind, p.x, p.y, z);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (ghost && ghost.kind === "wall") {
    const p = toScreen(cam, w, h, ghost.x + 0.5, ghost.y + 0.5);
    ctx.globalAlpha = ghost.ok ? 0.9 : 0.35;
    blit(ctx, "decor_fence", p.x, p.y, z * 0.86);
    ctx.globalAlpha = 1;
  }
  const sel = run.towers.find((t) => t.id === selected);
  if (sel && sel.kind !== "miner") {
    const st = statsOf(sel, modAt(map, run, sel.x, sel.y), bonusesFor(meta, run), 0);
    const p = toScreen(cam, w, h, sel.x + 0.5, sel.y + 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, st.range * z, 0, Math.PI * 2);
    ctx.strokeStyle = TOWER_COLOR[sel.kind];
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const bLive = bonusesFor(meta, run);
  for (const t of run.towers) {
    const p = toScreen(cam, w, h, t.x + 0.5, t.y + 0.5);
    const color = TOWER_COLOR[t.kind];
    let ang = aimVis.get(t.id)?.ang ?? -Math.PI / 2;
    let nearest = 1e9;
    if (t.kind !== "miner") {
      for (const e of run.enemies) {
        if (!e.alive) continue;
        const q = enemyPos(map, e);
        const dx = q.x - (t.x + 0.5);
        const dy = q.y - (t.y + 0.5);
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest) { nearest = d2; ang = Math.atan2(dy, dx); }
      }
    }
    const rate = Math.max(0.2, statsOf(t, modAt(map, run, t.x, t.y), bLive, 0).rate || 0.2);
    const kickTarget = t.kind === "miner" ? 0 : Math.max(0, Math.min(1, t.cd * rate));
    const prev = aimVis.get(t.id) ?? { ang, kick: 0 };
    let delta = ang - prev.ang;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const nextAng = prev.ang + delta * 0.22;
    const nextKick = prev.kick + (kickTarget - prev.kick) * 0.35;
    aimVis.set(t.id, { ang: nextAng, kick: nextKick });
    const aim = screenAngle(cam, nextAng);
    const lean = t.kind === "miner" || t.kind === "halo" ? 0 : nextKick;
    const ox = -Math.cos(aim) * lean * Math.min(8, z * 0.12);
    const oy = -Math.sin(aim) * lean * Math.min(8, z * 0.12);
    blob(ctx, p.x, p.y, Math.max(10, z * 0.5), color);
    shadowUnder(ctx, p.x + ox, p.y + oy, z * 0.7);
    const upgraded = levelOf(t.xp) >= 4 || t.abilities.length > 0 || t.ranks.dmg + t.ranks.rate + t.ranks.range >= 2;
    const drew = blit(ctx, towerFrame(t.kind, upgraded), p.x + ox, p.y + oy, z * 0.9);
    if (!drew) {
      ctx.fillStyle = color;
      ctx.strokeStyle = "#f4fbff";
      ctx.lineWidth = 1.4;
      shape(ctx, t.kind, p.x, p.y, z);
      ctx.fill();
      ctx.stroke();
    }
    if (t.kind !== "miner" && nearest < 80) {
      const muzzle = Math.min(z * 0.42, 18);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35 + lean * 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + ox, p.y + oy);
      ctx.lineTo(p.x + ox + Math.cos(aim) * muzzle, p.y + oy + Math.sin(aim) * muzzle);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (t.offer) {
      blit(ctx, "fx_spark", p.x + z * 0.28, p.y - z * 0.32, Math.max(10, z * 0.28));
    }
  }
  for (const e of run.enemies) {
    if (!e.alive) continue;
    const q = enemyPos(map, e);
    if (run.mode === "fog" && !revealed(run, map, q.x, q.y)) continue;
    const p = toScreen(cam, w, h, q.x, q.y);
    const hidden = e.kind === "shade" && e.revealedUntil <= run.time;
    const body = e.kind === "boss" ? z * 0.92 : e.kind === "mite" ? z * 0.48 : z * 0.72;
    const color = hidden ? "rgba(138,124,255,0.55)" : ENEMY_COLOR[e.kind];
    blob(ctx, p.x, p.y, Math.max(8, body * 0.55), color);
    shadowUnder(ctx, p.x, p.y, body);
    ctx.globalAlpha = hidden ? 0.55 : 1;
    const spr = enemyFrame(e.kind, e.wave, e.id, tick);
    if (!blit(ctx, spr, p.x, p.y - body * 0.08, body)) {
      ctx.fillStyle = color;
      ctx.strokeStyle = "#f7fbff";
      ctx.lineWidth = 1.2;
      enemyShape(ctx, e.kind, p.x, p.y, Math.max(6, body * 0.36));
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (e.freezeUntil > run.time) blit(ctx, "fx_shockwave", p.x, p.y, body * 0.8);
    else if (e.hp < e.maxHp) blit(ctx, "fx_hit", p.x, p.y, body * 0.45);
    const ratio = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
    const bw = Math.max(16, Math.round(body * 0.9));
    const bh = Math.max(3, Math.min(5, Math.round(z * 0.08)));
    const bx = Math.round(p.x - bw / 2);
    const by = Math.round(p.y - body * 0.62);
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = ratio > 0.45 ? "#8dffc0" : "#ff5d7a";
    ctx.fillRect(bx, by, Math.max(0, Math.round(bw * ratio)), bh);
    if (e.shield > 0) {
      ctx.fillStyle = "#9ad7ff";
      ctx.fillRect(bx, by - 3, Math.round(bw * Math.min(1, e.shield / (e.maxHp * 0.5))), 2);
    }
  }
  const seenProj = new Set<number>();
  for (const proj of run.projs) {
    seenProj.add(proj.id);
    const hist = projTrail.get(proj.id) ?? [];
    hist.push({ x: proj.x, y: proj.y });
    while (hist.length > 5) hist.shift();
    projTrail.set(proj.id, hist);
    for (let i = 0; i < hist.length - 1; i++) {
      const hp = toScreen(cam, w, h, hist[i].x, hist[i].y);
      ctx.globalAlpha = (i + 1) / hist.length * 0.45;
      blit(ctx, PROJ_SPRITE[proj.kind], hp.x, hp.y, Math.max(6, z * 0.18));
    }
    ctx.globalAlpha = 1;
    const p = toScreen(cam, w, h, proj.x, proj.y);
    const prev = hist.length > 1 ? hist[hist.length - 2] : hist[0];
    const ang = screenAngle(cam, Math.atan2(proj.y - prev.y, proj.x - prev.x));
    blob(ctx, p.x, p.y, 7, proj.color);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    const spr = frameOf(PROJ_SPRITE[proj.kind]);
    const s = Math.max(8, Math.round(z * 0.28));
    if (spr) ctx.drawImage(spr, Math.round(-s / 2), Math.round(-s / 2), s, s);
    else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const id of [...projTrail.keys()]) if (!seenProj.has(id)) projTrail.delete(id);
  if (showNumbers) {
    const bags = new Map<string, { x: number; y: number; sum: number; ttl: number; color: string }>();
    for (const fx of run.fx) {
      if (fx.kind !== "num" || !fx.text) continue;
      const n = Number(String(fx.text).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) continue;
      const key = Math.round(fx.x * 2) + ":" + Math.round(fx.y * 2);
      const bag = bags.get(key);
      if (!bag) bags.set(key, { x: fx.x, y: fx.y, sum: n, ttl: fx.ttl, color: fx.color });
      else { bag.sum += n; bag.ttl = Math.max(bag.ttl, fx.ttl); }
    }
    ctx.font = "700 12px \"Exo 2\", sans-serif";
    ctx.textAlign = "center";
    const placed: { x: number; y: number }[] = [];
    for (const bag of bags.values()) {
      const p = toScreen(cam, w, h, bag.x, bag.y);
      const rise = (0.7 - Math.min(0.7, bag.ttl)) * 26;
      let x = p.x;
      let y = p.y - 22 - rise;
      for (const prev of placed) {
        if (Math.abs(prev.x - x) < 26 && Math.abs(prev.y - y) < 14) y = prev.y - 14;
      }
      placed.push({ x, y });
      ctx.globalAlpha = Math.max(0.2, Math.min(1, bag.ttl / 0.35));
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4,8,16,0.9)";
      ctx.strokeText(String(Math.round(bag.sum)), x, y);
      ctx.fillStyle = bag.color;
      ctx.fillText(String(Math.round(bag.sum)), x, y);
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
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(2, z * 0.06);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      blit(ctx, "fx_spark", b.x, b.y, Math.max(10, z * 0.28));
    } else if (fx.kind === "boom") {
      const p = toScreen(cam, w, h, fx.x, fx.y);
      const size = (0.55 + fx.ttl) * Math.max(18, z * 0.7);
      if (!blit(ctx, "fx_explode", p.x, p.y, size)) blob(ctx, p.x, p.y, 18 * (0.4 + fx.ttl), fx.color);
    } else {
      const p = toScreen(cam, w, h, fx.x, fx.y);
      if (!blit(ctx, fx.kind === "ring" ? "fx_hit" : "fx_shockwave", p.x, p.y, 16 + fx.ttl * 28)) {
        blob(ctx, p.x, p.y, 18 * (0.4 + fx.ttl), fx.color);
      }
    }
  }
  if (run.outcome !== "play") {
    const title = run.mode === "sandbox" ? "Опыт закончен" : run.outcome === "win" ? "Ночь удержана" : "Врата пали";
    const bw = Math.min(w - 28, 460);
    const bh = 92;
    const bx = (w - bw) / 2;
    const by = Math.max(18, h * 0.18);
    ctx.fillStyle = "rgba(6,10,20,0.9)";
    ctx.strokeStyle = run.outcome === "win" ? "#8dffc0" : "#ff8aa8";
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    blit(ctx, run.outcome === "win" ? "icon_trophy" : "icon_skull", bx + 36, by + 32, 36);
    ctx.fillStyle = "#f4fbff";
    ctx.font = "400 26px Shket, Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText(title, bx + 64, by + 40);
    ctx.font = "700 14px \"Exo 2\", sans-serif";
    ctx.fillStyle = "#c5d7ee";
    const stars = run.reward?.stars ?? 0;
    const tail = run.mode === "campaign" ? "  " + "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars)) : "";
    ctx.fillText(`Волн ${run.wavesCleared}   прорывов ${run.leaks}${tail}`, bx + 64, by + 68);
  }
}
export function paintWorld(ctx: CanvasRenderingContext2D, w: number, h: number, meta: Meta, cam: Cam, endless: boolean): void {
  warmSprites();
  ctx.imageSmoothingEnabled = false;
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
    if (open) blit(ctx, stars > 0 ? "icon_star" : "tile_gate", p.x, p.y - 22, 18);
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
  warmSprites();
  ctx.imageSmoothingEnabled = false;
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
      if (!blit(ctx, towerFrame(s.kind, owned), p.x - 58, p.y, 28)) {
        ctx.fillStyle = s.color;
        shape(ctx, s.kind, p.x - 58, p.y, 28);
        ctx.fill();
      }
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
