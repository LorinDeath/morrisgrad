// 2.5D-картинка «Орды»: косая площадь, аниме-герои МоррисГрада и росчерки комбо.
import { heroById, type HeroDef } from "./rules";
import { ARENA_H, ARENA_W, type Actor, type Anim, type Battle, type Fx } from "./sim";
import { blitElite, blitHero, blitMob, heroFrame, pixelSlash } from "./sprites";

export type Cam = { x: number; y: number };

const TAU = Math.PI * 2;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function project(x: number, y: number, cam: Cam, w: number, h: number, zoom: number) {
  return {
    sx: (x - cam.x) * zoom + w / 2,
    sy: (y - cam.y) * zoom * 0.78 + h * 0.58,
    s: zoom,
  };
}

export function drawBattle(ctx: CanvasRenderingContext2D, b: Battle, w: number, h: number, cam: Cam, now: number) {
  const zoom = Math.min(w, h) / 820;
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1a0c14");
  sky.addColorStop(0.42, rgba(b.floor.tint, 0.55));
  sky.addColorStop(1, "#070406");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const shakeX = b.shake ? Math.sin(now * 0.05) * b.shake : 0;
  const shakeY = b.shake ? Math.cos(now * 0.07) * b.shake * 0.6 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawFloor(ctx, b, w, h, cam, zoom, now);
  drawGroundFx(ctx, b, w, h, cam, zoom, now);

  type Spr = { y: number; draw: () => void };
  const spr: Spr[] = [];
  for (const m of b.mobs()) {
    const p = project(m.x, m.y, cam, w, h, zoom);
    spr.push({
      y: m.y,
      draw: () => blitMob(ctx, m.kind, (now / 180 + m.x) | 0, p.sx, p.sy, Math.max(2, zoom * 2.1) * (m.alive ? 1 : 0.85), Math.cos(m.facing) >= 0 ? 1 : -1),
    });
  }
  for (const e of b.elites) {
    if (!e.alive) continue;
    const p = project(e.x, e.y, cam, w, h, zoom);
    spr.push({
      y: e.y,
      draw: () => blitElite(ctx, e.kind === "boss", e.wind > 0, p.sx, p.sy, Math.max(2, zoom * (e.kind === "boss" ? 3.1 : 2.5)), Math.cos(e.facing) >= 0 ? 1 : -1),
    });
  }
  for (const a of b.party) {
    const p = project(a.x, a.y, cam, w, h, zoom);
    spr.push({
      y: a.y + 2,
      draw: () => {
        const hero = heroById(a.hero);
        drawShadow(ctx, p.sx, p.sy, 26 * zoom, 10 * zoom, 0.45);
        if (a.musou >= 100) aura(ctx, p.sx, p.sy - 34 * zoom, 36 * zoom, hero.accent, 0.35 + Math.sin(now / 180) * 0.15);
        paintHero(ctx, hero, p.sx, p.sy, Math.max(2.4, zoom * 2.15), a.facing, a.anim, a.swing, now / 1000, a.hurt, a.musou / 100, a.pose);
        if (a.iframe > 0) {
          ctx.strokeStyle = rgba("#fff", 0.35);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(p.sx, p.sy, 22 * zoom, 9 * zoom, 0, 0, TAU);
          ctx.stroke();
        }
      },
    });
  }
  for (const f of b.fx) if (f.k === "ghost" && f.hero) {
    const p = project(f.x, f.y, cam, w, h, zoom);
    spr.push({
      y: f.y - 1,
      draw: () => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life / f.max) * 0.45;
        paintHero(ctx, heroById(f.hero!), p.sx, p.sy, Math.max(2.2, zoom * 2), f.facing || 0, "swing", f.swing || 0.5, now / 1000, 0, 0);
        ctx.restore();
      },
    });
  }
  spr.sort((a, c) => a.y - c.y);
  for (const s of spr) s.draw();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const f of b.fx) drawAir(ctx, f, cam, w, h, zoom);
  ctx.restore();

  for (const a of b.party) {
    const p = project(a.x, a.y, cam, w, h, zoom);
    bar(ctx, p.sx, p.sy - 86 * zoom, 54 * zoom, 5, a.hp / a.maxHp, "#e24b4b", "#3a1414");
  }
  for (const e of b.elites) {
    if (!e.alive) continue;
    const p = project(e.x, e.y, cam, w, h, zoom);
    nameplate(ctx, p.sx, p.sy - (e.kind === "boss" ? 128 : 102) * zoom, e.name, e.tint);
    bar(ctx, p.sx, p.sy - (e.kind === "boss" ? 112 : 88) * zoom, (e.kind === "boss" ? 90 : 64) * zoom, 6, e.hp / e.maxHp, e.tint, "#2a0c0c");
  }

  ctx.restore();
  vignette(ctx, w, h);
  if (b.flash > 0) {
    ctx.fillStyle = rgba(b.flashCol || "#fff", Math.min(0.45, b.flash));
    ctx.fillRect(0, 0, w, h);
  }
  if (b.bannerT > 0) banner(ctx, w, b.banner, b.bannerSub, Math.min(1, b.bannerT));
  if (b.combo >= 2 && b.phase === "fight") comboMark(ctx, w, b.combo);
}

function drawFloor(ctx: CanvasRenderingContext2D, b: Battle, w: number, h: number, cam: Cam, zoom: number, now: number) {
  const tint = b.floor.tint;
  const left = cam.x - w / zoom;
  const right = cam.x + w / zoom;
  const top = cam.y - h / zoom;
  const bot = cam.y + h / zoom;
  const S = 92;
  const x0 = Math.floor(left / S) - 1;
  const x1 = Math.ceil(right / S) + 1;
  const y0 = Math.floor(top / S) - 1;
  const y1 = Math.ceil(bot / S) + 1;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const p = project(tx * S + S / 2, ty * S + S / 2, cam, w, h, zoom);
      const tw = S * zoom * 0.5;
      const th = S * zoom * 0.5 * 0.78;
      const alt = (tx + ty) & 1;
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy - th);
      ctx.lineTo(p.sx + tw, p.sy);
      ctx.lineTo(p.sx, p.sy + th);
      ctx.lineTo(p.sx - tw, p.sy);
      ctx.closePath();
      ctx.fillStyle = alt ? rgba(tint, 0.34) : "rgba(36,18,22,0.9)";
      ctx.fill();
      ctx.strokeStyle = alt ? "rgba(224,192,122,0.07)" : "rgba(224,192,122,0.035)";
      ctx.stroke();
    }
  }
  const pool = project(ARENA_W / 2, ARENA_H / 2, cam, w, h, zoom);
  const glow = ctx.createRadialGradient(pool.sx, pool.sy, 12 * zoom, pool.sx, pool.sy, 460 * zoom);
  glow.addColorStop(0, rgba(b.floor.ember, 0.28));
  glow.addColorStop(0.42, rgba(tint, 0.1));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const c = project(ARENA_W / 2, ARENA_H / 2, cam, w, h, zoom);
  ctx.beginPath();
  ctx.ellipse(c.sx, c.sy, 430 * zoom, 430 * zoom * 0.78, 0, 0, TAU);
  ctx.strokeStyle = rgba(b.floor.ember, 0.28);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(c.sx, c.sy, 80 * zoom, 80 * zoom * 0.78, 0, 0, TAU);
  ctx.strokeStyle = "rgba(224,192,122,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  medallion(ctx, c.sx, c.sy, 34 * zoom, b.floor.n);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const px = ARENA_W / 2 + Math.cos(a) * 560;
    const py = ARENA_H / 2 + Math.sin(a) * 420;
    const p = project(px, py, cam, w, h, zoom);
    pillar(ctx, p.sx, p.sy, zoom);
    if (i % 2 === 0) brazier(ctx, p.sx + 18 * zoom, p.sy, zoom, b.floor.ember, now);
  }
  embers(ctx, cam, w, h, zoom, now, b.floor.ember);
}

function medallion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(224,192,122,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.78;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "rgba(224,192,122,0.75)";
  ctx.font = `700 ${Math.max(10, r * 0.7)}px Cinzel, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 0, 1);
  ctx.restore();
}

function pillar(ctx: CanvasRenderingContext2D, x: number, y: number, z: number) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * z, 16 * z, 6 * z, 0, 0, TAU);
  ctx.fill();
  const g = ctx.createLinearGradient(x - 7 * z, 0, x + 7 * z, 0);
  g.addColorStop(0, "#0e090b");
  g.addColorStop(0.45, "#3a2a28");
  g.addColorStop(1, "#120c0e");
  ctx.fillStyle = g;
  ctx.fillRect(x - 7 * z, y - 78 * z, 14 * z, 78 * z);
  ctx.fillStyle = "#5a4632";
  ctx.fillRect(x - 12 * z, y - 86 * z, 24 * z, 10 * z);
  ctx.fillRect(x - 12 * z, y - 8 * z, 24 * z, 8 * z);
  ctx.fillStyle = "rgba(231,201,138,0.7)";
  ctx.fillRect(x - 12 * z, y - 84 * z, 24 * z, 2 * z);
  ctx.fillRect(x - 1 * z, y - 76 * z, 2 * z, 68 * z);
}

function embers(ctx: CanvasRenderingContext2D, cam: Cam, w: number, h: number, zoom: number, now: number, col: string) {
  for (let i = 0; i < 36; i++) {
    const x = (i * 173) % ARENA_W;
    const base = (i * 97) % ARENA_H;
    const rise = (now * 0.035 + i * 40) % 260;
    const p = project(x, base - rise, cam, w, h, zoom);
    if (p.sx < -8 || p.sy < -8 || p.sx > w + 8 || p.sy > h + 8) continue;
    const a = 0.18 + (i % 5) * 0.1;
    ctx.fillStyle = rgba(i % 3 === 0 ? "#fff4d0" : col, a);
    const s = (1.2 + (i % 3)) * Math.max(0.6, zoom);
    ctx.fillRect(p.sx, p.sy, s, s);
  }
}

function brazier(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, col: string, now: number) {
  ctx.fillStyle = "#2a1a14";
  ctx.fillRect(x - 4 * z, y - 16 * z, 8 * z, 16 * z);
  const f = 8 + Math.sin(now / 120) * 3;
  ctx.fillStyle = rgba(col, 0.9);
  ctx.beginPath();
  ctx.ellipse(x, y - 18 * z, 6 * z, f * z, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba("#fff", 0.7);
  ctx.beginPath();
  ctx.ellipse(x, y - 18 * z, 2.5 * z, f * 0.45 * z, 0, 0, TAU);
  ctx.fill();
}

function drawGroundFx(ctx: CanvasRenderingContext2D, b: Battle, w: number, h: number, cam: Cam, zoom: number, now: number) {
  for (const e of b.elites) {
    if (!e.alive || e.wind <= 0) continue;
    const p = project(e.x, e.y, cam, w, h, zoom);
    const k = 1 - e.wind / (e.windMax || 0.5);
    const rad = (e.kind === "boss" ? 118 : 96) * zoom * (0.72 + k * 0.28);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, rad, rad * 0.78, 0, 0, TAU);
    ctx.fillStyle = rgba(e.tint, 0.13 + k * 0.18);
    ctx.fill();
    ctx.lineWidth = 2 + k * 3;
    ctx.strokeStyle = rgba("#ffd0c8", 0.4 + k * 0.55);
    ctx.stroke();
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, rad * (0.45 + k * 0.2), rad * (0.45 + k * 0.2) * 0.78, now / 400, 0, TAU);
    ctx.strokeStyle = rgba("#fff", 0.35 + k * 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const f of b.fx) {
    if (f.k !== "zone") continue;
    const p = project(f.x, f.y, cam, w, h, zoom);
    const a = Math.max(0, f.life / f.max);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, f.r * zoom * (1.05 - a * 0.2), f.r * zoom * 0.78, 0, 0, TAU);
    ctx.fillStyle = rgba(f.col, 0.16 * a);
    ctx.fill();
  }
}

function drawAir(ctx: CanvasRenderingContext2D, f: Fx, cam: Cam, w: number, h: number, zoom: number) {
  const p = project(f.x, f.y, cam, w, h, zoom);
  const a = Math.max(0, f.life / f.max);
  if (f.k === "slash") {
    pixelSlash(ctx, p.sx, p.sy - 28 * zoom, f.a, f.r * zoom, f.ang, f.col, a);
  } else if (f.k === "ring" || f.k === "nova") {
    const grow = f.k === "nova" ? 1 - a * 0.25 : 0.7 + (1 - a) * 0.45;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, f.r * zoom * grow, f.r * zoom * grow * 0.78, 0, 0, TAU);
    ctx.strokeStyle = rgba(f.col, 0.85 * a);
    ctx.lineWidth = (f.k === "nova" ? 8 : 3) * zoom;
    ctx.stroke();
    if (f.k === "nova") {
      ctx.strokeStyle = rgba(f.col2, 0.5 * a);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, f.r * zoom * grow * 0.72, f.r * zoom * grow * 0.56, 0, 0, TAU);
      ctx.stroke();
    }
  } else if (f.k === "beam") {
    const x2 = f.x + Math.cos(f.a) * f.r;
    const y2 = f.y + Math.sin(f.a) * f.r;
    const q = project(x2, y2, cam, w, h, zoom);
    const g = ctx.createLinearGradient(p.sx, p.sy, q.sx, q.sy);
    g.addColorStop(0, rgba(f.col, 0));
    g.addColorStop(0.15, rgba(f.col2, a));
    g.addColorStop(1, rgba(f.col, 0.1 * a));
    ctx.strokeStyle = g;
    ctx.lineWidth = (f.thick || 12) * zoom;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(q.sx, q.sy);
    ctx.stroke();
    ctx.strokeStyle = rgba("#fff", 0.7 * a);
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (f.k === "spark") {
    ctx.fillStyle = rgba(f.col2, a);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, (2 + f.r * 0.15) * a * zoom, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(f.col, a);
    ctx.lineWidth = 1;
    const s = f.r * zoom * a;
    ctx.beginPath();
    ctx.moveTo(p.sx - s, p.sy);
    ctx.lineTo(p.sx + s, p.sy);
    ctx.moveTo(p.sx, p.sy - s * 0.6);
    ctx.lineTo(p.sx, p.sy + s * 0.6);
    ctx.stroke();
  } else if (f.k === "text" && f.txt) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;
    ctx.fillStyle = f.col;
    ctx.font = `700 ${15 + (1 - a) * 4}px "Exo 2", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.txt, p.sx, p.sy - (1 - a) * 28);
    ctx.restore();
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a: number) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function aura(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

export function paintHero(
  ctx: CanvasRenderingContext2D, hero: HeroDef, x: number, y: number, s: number,
  facing: number, anim: Anim, _swing: number, t: number, hurt: number, musou: number, pose = 0,
) {
  const flip = Math.cos(facing) >= 0 ? 1 : -1;
  if (musou > 0.85) aura(ctx, x, y - 36 * s, 16 * s, hero.accent, 0.45);
  blitHero(ctx, hero.id, heroFrame(anim, pose, hurt, t), x, y, s, flip);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, k: number, fill: string, back: string) {
  ctx.fillStyle = back;
  ctx.fillRect(x - w / 2, y, w, hgt);
  ctx.fillStyle = fill;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), hgt);
  ctx.strokeStyle = "rgba(224,192,122,0.45)";
  ctx.strokeRect(x - w / 2, y, w, hgt);
}

function nameplate(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, col: string) {
  ctx.font = `700 13px Cinzel, serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const w = ctx.measureText(name).width + 16;
  ctx.fillRect(x - w / 2, y - 12, w, 18);
  ctx.fillStyle = col;
  ctx.fillText(name, x, y + 2);
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function banner(ctx: CanvasRenderingContext2D, w: number, title: string, sub: string, a: number) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, a * 1.4);
  const bw = Math.min(560, w - 28);
  const x = (w - bw) / 2;
  const y = w < 720 ? 148 : 48;
  ctx.fillStyle = "rgba(8,4,6,0.78)";
  ctx.fillRect(x, y, bw, w < 720 ? 64 : 86);
  ctx.strokeStyle = "rgba(231,201,138,0.85)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, bw, w < 720 ? 64 : 86);
  ctx.fillStyle = "#f0d080";
  ctx.font = `700 ${w < 720 ? 20 : 34}px Cinzel, serif`;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 10;
  ctx.fillText(title, w / 2, y + (w < 720 ? 26 : 42));
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f3e6d4";
  ctx.font = `500 ${w < 720 ? 12 : 15}px "Exo 2", sans-serif`;
  ctx.fillText(sub, w / 2, y + (w < 720 ? 46 : 68));
  ctx.restore();
}

function comboMark(ctx: CanvasRenderingContext2D, w: number, n: number) {
  ctx.save();
  ctx.textAlign = "right";
  ctx.shadowColor = n >= 20 ? "#e24b3b" : "#6a3a12";
  ctx.shadowBlur = 18;
  ctx.fillStyle = n >= 20 ? "#fff1c2" : "#ffd76a";
  ctx.font = `700 ${n >= 30 ? 64 : 46}px Cinzel, serif`;
  ctx.fillText(String(n), w - 28, 96);
  ctx.shadowBlur = 0;
  ctx.font = `600 13px "Exo 2", sans-serif`;
  ctx.fillStyle = "#f3e6d4";
  ctx.fillText(n >= 20 ? "МУСОУ" : "КОМБО", w - 28, 118);
  ctx.restore();
}

export function drawPortrait(ctx: CanvasRenderingContext2D, id: string, w: number, h: number, t: number) {
  const hero = heroById(id);
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(hero.accent, 0.35));
  g.addColorStop(1, "#14080c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  drawShadow(ctx, w / 2, h * 0.84, w * 0.28, 10, 0.45);
  const sc = Math.max(1.7, Math.min(w / 72, (h * 0.78) / 80));
  paintHero(ctx, hero, w / 2, h * 0.84, sc, 0.4, "idle", 0, t, 0, 0);
}
