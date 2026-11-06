// Пиксельные спрайты «Орды»: 2.5D, без 3D-моделей. Кадры пекутся один раз в канвас.
import { heroById, type HeroDef } from "./rules";

const FW = 64;
const FH = 80;
const FRAMES = 13;

type Pal = { skin: string; skin2: string; hair: string; hair2: string; cloth: string; cloth2: string; accent: string; metal: string; line: string; eye: string };

function shade(hex: string, k: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const ch = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) * k | 0));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function palOf(hero: HeroDef): Pal {
  return {
    skin: hero.skin,
    skin2: shade(hero.skin, 0.78),
    hair: hero.hair,
    hair2: shade(hero.hair, 1.35),
    cloth: hero.cloth,
    cloth2: shade(hero.cloth, 0.62),
    accent: hero.accent,
    metal: hero.metal,
    line: "#14080c",
    eye: "#1a0c10",
  };
}

type Img = { c: HTMLCanvasElement; w: number; h: number };

const cache = new Map<string, Img>();

function sheet(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D; put: (x: number, y: number, col: string) => void } | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = FW * FRAMES;
  c.height = FH;
  const g = c.getContext("2d");
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  const put = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x | 0, y | 0, 1, 1);
  };
  return { c, g, put };
}

function bakeHero(id: string): Img | null {
  const hit = cache.get("h:" + id);
  if (hit) return hit;
  const s = sheet();
  if (!s) return null;
  const hero = heroById(id);
  const pal = palOf(hero);
  for (let f = 0; f < FRAMES; f++) drawHeroFrame(s.put, f * FW, pal, hero, f);
  const img = { c: s.c, w: FW, h: FH };
  cache.set("h:" + id, img);
  return img;
}

function drawHeroFrame(p: (x: number, y: number, c: string) => void, ox: number, pal: Pal, hero: HeroDef, frame: number) {
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < FW && y >= 0 && y < FH) p(ox + x, y, c);
  };
  const bob = frame === 1 ? -1 : 0;
  const run = frame === 2 ? 2 : frame === 3 ? -2 : 0;
  const hurt = frame === 9;
  const down = frame === 10;
  const dodge = frame === 12;
  const lean = dodge ? 3 : hurt ? -2 : 0;
  if (down) {
    drawDown(put, pal, hero);
    return;
  }
  const y0 = 18 + bob;
  legs(put, pal, 24 + lean, y0 + 36, run, dodge);
  coat(put, pal, 24 + lean, y0 + 16, hero.weapon === "staff" || hero.hairStyle === "waves");
  head(put, pal, 24 + lean, y0, hero);
  weaponPix(put, pal, hero, frame, lean);
  if (hurt) {
    for (let i = 0; i < 8; i++) put(18 + (i * 3) % 16, 20 + (i * 5) % 28, "rgba(255,220,220,0.9)");
  }
}

function legs(put: (x: number, y: number, c: string) => void, pal: Pal, x: number, y: number, run: number, dodge: boolean) {
  const a = dodge ? 4 : run;
  const b = dodge ? -3 : -run;
  for (let i = 0; i < 12; i++) {
    put(x - 6 + (i > 8 ? a : 0), y + i, pal.line);
    put(x - 5 + (i > 8 ? a : 0), y + i, pal.cloth2);
    put(x - 4 + (i > 8 ? a : 0), y + i, pal.cloth2);
    put(x + 2 + (i > 8 ? b : 0), y + i, pal.line);
    put(x + 3 + (i > 8 ? b : 0), y + i, pal.cloth);
    put(x + 4 + (i > 8 ? b : 0), y + i, pal.cloth);
  }
  boot(put, pal, x - 7 + (run > 0 ? a : 0), y + 11);
  boot(put, pal, x + 1 + (run < 0 ? b : 0), y + 11);
}

function boot(put: (x: number, y: number, c: string) => void, pal: Pal, x: number, y: number) {
  for (let i = 0; i < 6; i++) put(x + i, y, pal.metal);
  for (let i = 0; i < 5; i++) put(x + i, y + 1, pal.line);
  put(x + 5, y, pal.accent);
}

function coat(put: (x: number, y: number, c: string) => void, pal: Pal, x: number, y: number, robe: boolean) {
  const w = robe ? 11 : 9;
  for (let row = 0; row < 22; row++) {
    const fl = robe && row > 14 ? 2 : 0;
    for (let i = -w - fl; i <= w + fl; i++) {
      const edge = i === -w - fl || i === w + fl;
      const shadeCol = i < -2 ? pal.cloth2 : pal.cloth;
      put(x + i, y + row, edge ? pal.line : shadeCol);
    }
    if (row === 4 || row === 16) {
      for (let i = -w + 1; i < w; i++) put(x + i, y + row, pal.accent);
    }
  }
  put(x, y + 6, pal.accent);
  put(x, y + 7, pal.accent);
  put(x, y + 8, pal.metal);
}

function head(put: (x: number, y: number, c: string) => void, pal: Pal, x: number, y: number, hero: HeroDef) {
  const rows = [5, 7, 8, 9, 9, 9, 8, 8, 7, 6];
  for (let r = 0; r < rows.length; r++) {
    const w = rows[r];
    for (let i = -w; i <= w; i++) {
      const edge = i === -w || i === w || r === 0 || r === rows.length - 1;
      put(x + i, y + r, edge ? pal.line : i < 1 ? pal.skin2 : pal.skin);
    }
  }
  put(x + 3, y + 4, pal.eye);
  put(x + 4, y + 4, pal.eye);
  put(x + 5, y + 4, pal.eye);
  put(x + 3, y + 5, pal.eye);
  put(x + 5, y + 3, "#fff");
  put(x - 2, y + 4, pal.eye);
  put(x - 1, y + 4, pal.eye);
  put(x - 2, y + 5, pal.eye);
  hair(put, pal, x, y, hero.hairStyle);
}

function hair(put: (x: number, y: number, c: string) => void, pal: Pal, x: number, y: number, style: HeroDef["hairStyle"]) {
  const h = (dx: number, dy: number, c = pal.hair) => put(x + dx, y + dy, c);
  if (style === "long") {
    for (let i = -8; i <= 8; i++) h(i, -1);
    for (let i = -9; i <= 6; i++) h(i, 0);
    for (let row = 1; row < 16; row++) {
      h(-9, row);
      h(-8, row);
      h(-7, row, pal.hair2);
    }
    h(-10, 4); h(-10, 8); h(-10, 12);
  } else if (style === "waves") {
    for (let i = -8; i <= 9; i++) h(i, -1);
    for (let i = -7; i <= 8; i++) h(i, 0, pal.hair2);
    for (let row = 1; row < 8; row++) { h(7, row); h(8, row); h(9, row, pal.hair2); }
    h(6, 2); h(10, 3);
  } else if (style === "short") {
    for (let i = -7; i <= 7; i++) h(i, -1);
    for (let i = -6; i <= 6; i++) h(i, 0, pal.hair2);
    h(-8, 1); h(7, 1); h(-5, -2); h(0, -2); h(4, -2);
  } else if (style === "hood") {
    for (let i = -10; i <= 10; i++) h(i, -2, pal.cloth);
    for (let row = -1; row < 6; row++) { h(-10, row, pal.cloth); h(10, row, pal.cloth); h(-9, row, pal.cloth2); h(9, row, pal.cloth2); }
    for (let i = -6; i <= 4; i++) h(i, -1);
  } else if (style === "tie") {
    for (let i = -7; i <= 7; i++) h(i, -1);
    for (let row = 0; row < 14; row++) { h(8, row); h(9, row, pal.hair2); }
    h(7, 8, pal.accent); h(8, 8, pal.accent); h(9, 8, pal.accent);
  } else if (style === "fox") {
    h(-6, -6); h(-5, -8); h(-4, -10); h(-3, -8); h(-4, -6);
    h(2, -6); h(3, -9); h(4, -12); h(5, -9); h(4, -6);
    for (let i = -7; i <= 7; i++) h(i, -1, "#f7f7ff");
    for (let i = -6; i <= 6; i++) h(i, 0, "#fff");
    h(-8, 1, "#f7f7ff"); h(7, 1, "#fff");
  } else if (style === "spiky") {
    const spikes = [-8, -4, 0, 4, 8];
    for (const s of spikes) { h(s, -1); h(s, -3); h(s, -5); h(s + 1, -4, pal.hair2); }
    for (let i = -8; i <= 8; i++) h(i, 0);
  } else {
    for (let i = -8; i <= 8; i++) h(i, -1);
    for (let i = -7; i <= 9; i++) h(i, 0);
    for (let row = 1; row < 5; row++) h(8, row, pal.accent);
    h(9, 2, pal.accent);
  }
}

function weaponPix(put: (x: number, y: number, c: string) => void, pal: Pal, hero: HeroDef, frame: number, lean: number) {
  const atk = frame >= 4 && frame <= 8;
  const pose = frame === 4 ? 0 : frame === 5 ? 1 : frame === 6 ? 2 : frame === 7 ? 3 : frame === 8 ? 4 : frame === 11 ? 1 : 0;
  const x = 30 + lean;
  const y = 34;
  const blade = (pts: [number, number][], col: string) => {
    for (const [dx, dy] of pts) put(x + dx, y + dy, col);
  };
  if (hero.weapon === "scythe") {
    const swing = [[6, -2], [14, -10], [20, -4], [8, 8], [18, -16]];
    const [sx, sy] = swing[pose] || swing[0];
    for (let i = 0; i < 18; i++) put(x + (sx * i) / 18, y + (sy * i) / 18, pal.metal);
    blade([[sx, sy], [sx + 4, sy - 2], [sx + 7, sy + 1], [sx + 5, sy + 4], [sx + 1, sy + 3]], pal.accent);
    blade([[sx + 5, sy], [sx + 8, sy + 2]], "#fff4d0");
  } else if (hero.weapon === "staff") {
    for (let i = -16; i < 16; i++) put(x + 4, y + i, pal.metal);
    for (let r = -4; r <= 4; r++) for (let c = -4; c <= 4; c++) if (r * r + c * c <= 16 && r * r + c * c >= 6) put(x + 4 + c, y - 18 + r, pal.accent);
    put(x + 4, y - 18, "#fff");
  } else if (hero.weapon === "sword") {
    const ang = [[2, -16], [10, -8], [14, 2], [6, 10], [16, -12]];
    const [sx, sy] = ang[pose] || ang[0];
    put(x - 3, y, pal.metal); put(x + 3, y, pal.metal); put(x, y, pal.accent);
    for (let i = 1; i <= 14; i++) put(x + (sx * i) / 14, y + (sy * i) / 14, i > 12 ? pal.accent : "#e8eef8");
    if (hero.hairStyle === "short") {
      for (let i = -5; i <= 2; i++) put(x - 10, y + i, pal.metal);
      for (let i = -4; i <= 1; i++) put(x - 9, y + i, pal.accent);
    }
  } else if (hero.weapon === "daggers") {
    const s = pose % 2 === 0 ? -6 : 6;
    for (let i = 0; i < 8; i++) { put(x + 2, y - 8 + i + s, pal.metal); put(x - 4, y - 2 + i - s, pal.accent); }
  } else if (hero.weapon === "hour") {
    for (let i = -6; i < 12; i++) put(x + 3, y + i, pal.metal);
    for (let r = -5; r <= 5; r++) for (let c = -4; c <= 4; c++) if (Math.abs(r) + Math.abs(c) === 6) put(x + 3 + c, y - 10 + r, pal.accent);
  } else if (hero.weapon === "katana") {
    const ang = [[4, -18], [12, -6], [16, 4], [8, 12], [18, -8]];
    const [sx, sy] = ang[pose] || ang[0];
    for (let i = 0; i < 16; i++) put(x + (sx * i) / 16, y + (sy * i) / 16, "#f4f7ff");
    put(x, y, pal.accent); put(x + 1, y, pal.accent); put(x - 1, y, pal.line);
  } else if (hero.weapon === "rail") {
    for (let i = 0; i < 16; i++) put(x + 2, y - 14 + i, pal.metal);
    for (let i = 0; i < 10; i++) put(x + 2, y - 18 + i, pal.accent);
    if (atk || frame === 11) { put(x + 8, y - 8, pal.accent); put(x + 12, y - 6, "#fff"); put(x + 16, y - 4, pal.accent); }
  } else {
    const ang = [[4, -12], [10, -4], [12, 6], [6, 10], [14, -8]];
    const [sx, sy] = ang[pose] || ang[0];
    for (let i = 0; i < 10; i++) put(x + (sx * i) / 10, y + (sy * i) / 10, pal.accent);
    put(x + sx, y + sy - 1, "#fff");
  }
}

function drawDown(put: (x: number, y: number, c: string) => void, pal: Pal, hero: HeroDef) {
  for (let i = 8; i < 56; i++) {
    put(i, 58, pal.line);
    put(i, 59, pal.cloth);
    put(i, 60, pal.cloth2);
    put(i, 61, pal.line);
  }
  for (let r = 0; r < 8; r++) for (let i = -6; i <= 6; i++) put(16 + i, 52 + r, Math.abs(i) === 6 || r === 0 ? pal.line : pal.skin);
  for (let i = -5; i <= 5; i++) put(16 + i, 51, pal.hair);
  put(20, 55, pal.eye);
  put(48, 58, pal.accent);
  put(50, 57, hero.metal);
}

function bakeMob(kind: number): Img | null {
  const key = "m:" + kind;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = sheet();
  if (!s) return null;
  for (let f = 0; f < 2; f++) drawMobFrame(s.put, f * FW, kind, f);
  const img = { c: s.c, w: FW, h: FH };
  cache.set(key, img);
  return img;
}

function drawMobFrame(p: (x: number, y: number, c: string) => void, ox: number, kind: number, frame: number) {
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < FW && y < FH) p(ox + x, y, c); };
  const bob = frame ? -1 : 1;
  const body = kind === 2 ? "#3a241c" : kind === 1 ? "#241018" : "#1a1014";
  const trim = kind === 2 ? "#c4553a" : kind === 1 ? "#7dcea0" : "#8a3038";
  const y = 28 + bob;
  const w = kind === 2 ? 8 : kind === 1 ? 5 : 6;
  for (let row = 0; row < 18; row++) {
    for (let i = -w; i <= w; i++) put(32 + i, y + row, i === -w || i === w ? "#0c0608" : body);
  }
  if (kind === 0) {
    for (let i = -7; i <= 7; i++) put(32 + i, y - 2, trim);
    put(32, y - 8, trim); put(31, y - 6, trim); put(33, y - 6, trim); put(30, y - 4, trim); put(34, y - 4, trim);
  } else if (kind === 1) {
    for (let i = -4; i <= 4; i++) put(32 + i, y - 6, trim);
    put(36, y - 8, trim); put(38, y - 4, "#d8ffe8");
  } else {
    for (let i = -8; i <= 8; i++) put(32 + i, y - 3, "#6a5346");
    put(32, y - 8, trim); put(28, y - 6, "#6a5346"); put(36, y - 6, "#6a5346");
  }
  put(34, y + 4, "#ffb0a0");
  put(35, y + 4, "#ffb0a0");
  put(30, y + 16, "#0c0608");
  put(34, y + 16, "#0c0608");
}

function bakeElite(boss: boolean): Img | null {
  const key = boss ? "eb" : "eg";
  const hit = cache.get(key);
  if (hit) return hit;
  const s = sheet();
  if (!s) return null;
  drawEliteFrame(s.put, 0, boss, false);
  drawEliteFrame(s.put, FW, boss, true);
  const img = { c: s.c, w: FW, h: FH };
  cache.set(key, img);
  return img;
}

function drawEliteFrame(p: (x: number, y: number, c: string) => void, ox: number, boss: boolean, wind: boolean) {
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < FW && y < FH) p(ox + x, y, c); };
  const tint = boss ? "#ffd76a" : "#ff6a4a";
  for (let row = 24; row < 62; row++) {
    const w = boss ? 12 : 9;
    for (let i = -w; i <= w; i++) put(28 + i, row, i === -w || i === w ? "#14080c" : row % 7 === 0 ? tint : "#2a1418");
  }
  for (let r = 0; r < 12; r++) {
    const w = r < 2 ? 6 : 8;
    for (let i = -w; i <= w; i++) put(28 + i, 12 + r, Math.abs(i) === w || r === 0 ? "#14080c" : "#3a2024");
  }
  if (boss) {
    put(20, 6, tint); put(21, 4, tint); put(22, 8, tint);
    put(34, 4, tint); put(35, 2, tint); put(36, 6, tint);
    put(28, 0, tint); put(28, 3, "#fff");
  } else {
    for (let i = 8; i < 18; i++) put(28, i, tint);
    put(26, 10, tint); put(30, 10, tint);
  }
  put(32, 16, "#ffd0c8");
  put(33, 16, "#ffd0c8");
  const sy = wind ? 18 : 28;
  for (let i = 0; i < 16; i++) put(40, sy + i, "#d8d0c8");
  put(38, sy, tint); put(42, sy, tint); put(40, sy - 2, "#fff");
}

export function blitHero(
  ctx: CanvasRenderingContext2D, id: string, frame: number, x: number, y: number, scale: number, flip: number,
) {
  const img = bakeHero(id);
  if (!img) return;
  const fr = Math.max(0, Math.min(FRAMES - 1, frame | 0));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.scale(flip * scale, scale);
  ctx.drawImage(img.c, fr * FW, 0, FW, FH, -FW / 2, -FH + 8, FW, FH);
  ctx.restore();
}

export function blitMob(ctx: CanvasRenderingContext2D, kind: number, frame: number, x: number, y: number, scale: number, flip: number) {
  const img = bakeMob(kind % 3);
  if (!img) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.scale(flip * scale, scale);
  ctx.drawImage(img.c, (frame & 1) * FW, 0, FW, FH, -FW / 2, -FH + 14, FW, FH);
  ctx.restore();
}

export function blitElite(ctx: CanvasRenderingContext2D, boss: boolean, wind: boolean, x: number, y: number, scale: number, flip: number) {
  const img = bakeElite(boss);
  if (!img) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.scale(flip * scale, scale);
  ctx.drawImage(img.c, wind ? FW : 0, 0, FW, FH, -FW / 2, -FH + 6, FW, FH);
  ctx.restore();
}

export function pixelSlash(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, radius: number, spread: number, col: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps - 0.5) * spread * 2;
    const px = Math.cos(ang + t) * radius * 0.72;
    const py = Math.sin(ang + t) * radius * 0.55;
    ctx.fillStyle = i % 3 === 0 ? "#fff6d8" : col;
    const s = i % 4 === 0 ? 4 : 3;
    ctx.fillRect(px | 0, py | 0, s, s);
  }
  ctx.restore();
}

export function heroFrame(anim: string, pose: number, hurt: number, t: number) {
  if (anim === "down") return 10;
  if (hurt > 0.05 && anim !== "swing") return 9;
  if (anim === "swing") {
    if (pose === 12) return 12;
    if (pose === 11) return 11;
    if (pose === 8) return 8;
    if (pose >= 4 && pose <= 7) return pose;
    return 5;
  }
  if (anim === "run") return 2 + ((t * 8) | 0) % 2;
  return (t * 2) % 1 < 0.5 ? 0 : 1;
}
