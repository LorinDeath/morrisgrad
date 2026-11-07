// Боевые картинки «Орды» — готовые листы «Проклятых», не процедурные манекены.
// Герои: src/assets/mc/heroes_atlas.png, клетка 48×60, 4 направления × 6 кадров
//   (шаг, стойка, шаг, вдох, замах, удар). Ряды листа: Нофорд, Кавега, Мариэль, Велес, Алзи, Лэйр, Петр, Кьют.
// Толпа и элиты: src/assets/mc/bestiary_atlas.png, клетка 64, 12 кадров (шаг 0–3, удар 4–6, попадание 7, смерть 8–11).
// Пол: src/assets/mc/tiles_atlas.png, клетка 16.
// Удары и телеграфы: src/assets/mc/fx30 (hit, tele_circle_ring, tele_cone, nova_burst).
// Конструктор public/bm-art — слои демонического рига 104px. На чиби-лист 48×60 его не накладываем:
// пропорции другие, а готовый лист героев уже читается. Слои не собираются на каждом кадре.

declare module "*.png?url" {
  const src: string;
  export default src;
}

import { beastFrame, heroDir, heroLocalFrame } from "./anim";
import heroesUrl from "../../assets/mc/heroes_atlas.png?url";
import beastsUrl from "../../assets/mc/bestiary_atlas.png?url";
import tilesUrl from "../../assets/mc/tiles_atlas.png?url";
import fx32Url from "../../assets/mc/fx30/fx30_s32.png?url";
import fx64Url from "../../assets/mc/fx30/fx30_s64.png?url";
import fx128Url from "../../assets/mc/fx30/fx30_r128.png?url";
import fxConeUrl from "../../assets/mc/fx30/fx30_c128.png?url";
import chestUrl from "../../assets/mc/props3/chest/chest.png?url";

const HERO_W = 48;
const HERO_H = 60;
const HERO_COLS = 6;
const BEAST = 64;
const TILE = 16;

/** Строка heroes_atlas.png на стабильный heroId. Картинка и имя на карточке — один и тот же человек.
 *  0 Нофорд, 1 Кавега, 2 Мариэль, 3 Велес, 4 Алзи, 5 Лэйр, 6 Петр, 7 Кьют
 *  (build_hero_atlases.py ROWS, pixSprites.js HERO_ROWS / NPC_ROWS). */
const HERO_ROW: Record<string, number> = {
  lorelin: 0,
  listaf: 1,
  chronos: 2,
  veles: 3,
  lorin: 4,
  alex: 5,
  itrain: 6,
  fox: 7,
};

/** grass_imp, night_bat, garden_golem — три разных поведения толпы. */
const MOB_ROW = [6, 2, 18];
const GENERAL_ROW = 36;
const BOSS_ROW = 37;

/** Индексы tiles_atlas.json: plaza, cobble, dirt, waste, rot, garden, grass, water, … */
export const FLOOR_TILE = [19, 16, 13, 27, 31, 9, 0, 24, 20, 28, 4, 32, 21];

function load(src: string) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

const heroes = load(heroesUrl);
const beasts = load(beastsUrl);
const tiles = load(tilesUrl);
const fx32 = load(fx32Url);
const fx64 = load(fx64Url);
const fx128 = load(fx128Url);
const fxCone = load(fxConeUrl);

function ready(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0;
}

export function blitHero(
  ctx: CanvasRenderingContext2D, id: string, frame: number, x: number, y: number, scale: number, _flip: number, facing = 0, down = false,
) {
  if (!ready(heroes)) return;
  const row = HERO_ROW[id] ?? 4;
  const local = Math.max(0, Math.min(HERO_COLS - 1, frame | 0));
  const col = heroDir(facing) * HERO_COLS + local;
  const dw = HERO_W * scale;
  const dh = HERO_H * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y + (down ? 8 * scale : 0));
  if (down) ctx.scale(1, 0.72);
  ctx.drawImage(heroes, col * HERO_W, row * HERO_H, HERO_W, HERO_H, -dw / 2, -dh + 6, dw, dh);
  ctx.restore();
}

export function blitMob(
  ctx: CanvasRenderingContext2D, kind: number, frame: number, x: number, y: number, scale: number, facing: number, alive = true, rowOverride?: number,
) {
  if (!ready(beasts)) return;
  const row = rowOverride == null ? MOB_ROW[Math.abs(kind | 0) % 3] : Math.max(0, rowOverride | 0);
  const col = Math.max(0, Math.min(11, frame | 0));
  const dw = BEAST * scale * 0.78;
  const dh = dw;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (!alive) ctx.scale(1, 0.9);
  ctx.drawImage(beasts, col * BEAST, row * BEAST, BEAST, BEAST, -dw / 2, -dh + 8, dw, dh);
  ctx.restore();
  void facing;
}

export function blitElite(
  ctx: CanvasRenderingContext2D, boss: boolean, frame: number, x: number, y: number, scale: number, facing: number, alive = true, rowOverride?: number,
) {
  if (!ready(beasts)) return;
  const row = rowOverride == null ? (boss ? BOSS_ROW : GENERAL_ROW) : Math.max(0, rowOverride | 0);
  const col = Math.max(0, Math.min(11, frame | 0));
  const dw = BEAST * scale * (boss ? 1.05 : 0.92);
  const dh = dw;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (!alive) ctx.scale(1, 0.9);
  if (Math.cos(facing) < 0) ctx.scale(-1, 1);
  ctx.drawImage(beasts, col * BEAST, row * BEAST, BEAST, BEAST, -dw / 2, -dh + 10, dw, dh);
  ctx.restore();
}

const chest = new Image();
chest.src = chestUrl;

const blade = new Image();
blade.src = "/bm-art/weapon/stone_blade_1.png";
const staff = new Image();
staff.src = "/bm-art/weapon/water_blade_staff_1.png";

export function blitWeapon(ctx: CanvasRenderingContext2D, hero: string, x: number, y: number, facing: number, scale: number, swing = 0.5) {
  const img = hero === "lorelin" || hero === "chronos" || hero === "alex" ? staff : blade;
  if (!ready(img)) return;
  const wind = swing < 0.45 ? -0.9 : swing < 0.9 ? 0.8 : 0.15;
  ctx.save();
  ctx.translate(x, y - 18 * scale);
  ctx.rotate(facing + Math.PI / 2 + wind);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 64, 64, -10 * scale, -28 * scale, 22 * scale, 22 * scale);
  ctx.restore();
}

export function blitChest(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, open: boolean, frame: number) {
  if (!ready(chest)) return false;
  const col = open ? Math.min(14, Math.abs(frame | 0) % 15) : Math.abs(frame | 0) % 24;
  const row = open ? 2 : 0;
  const dw = 48 * scale;
  const dh = 44 * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(chest, col * 48, row * 44, 48, 44, x - dw / 2, y - dh, dw, dh);
  ctx.restore();
  return true;
}

export function blitTile(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, w: number, h: number) {
  if (!ready(tiles)) return false;
  const i = Math.max(0, Math.min(63, index | 0));
  const col = i % 16;
  const row = (i / 16) | 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiles, col * TILE, row * TILE, TILE, TILE, x - w / 2, y - h / 2, w, h);
  return true;
}

function sheetFrame(img: HTMLImageElement, x: number, y: number, w: number, h: number, frames: number, t: number) {
  const fr = Math.abs(t | 0) % frames;
  return { img, sx: x + fr * w, sy: y, sw: w, sh: h };
}

export function blitTeleRing(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, alpha: number, t: number) {
  if (!ready(fx64)) return false;
  const f = sheetFrame(fx64, 0, 896, 64, 64, 30, t);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, x - rad, y - rad * 0.78, rad * 2, rad * 1.56);
  ctx.restore();
  return true;
}

export function blitTeleCone(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, alpha: number, t: number) {
  if (!ready(fxCone)) return false;
  const f = sheetFrame(fxCone, 0, 192, 128, 64, 30, t);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  const w = len * 1.15;
  const h = len * 0.72;
  ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, -h / 2, w, h);
  ctx.restore();
  return true;
}

export function blitNova(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, alpha: number, t: number) {
  if (!ready(fx128)) return false;
  const f = sheetFrame(fx128, 0, 128, 128, 128, 30, t);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, x - rad, y - rad * 0.78, rad * 2, rad * 1.56);
  ctx.restore();
  return true;
}

export function pixelSlash(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, radius: number, spread: number, col: string, a: number) {
  if (ready(fx32)) {
    const fr = Math.min(29, ((1 - Math.max(0, Math.min(1, a))) * 18) | 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = Math.max(0.35, Math.min(1, a));
    ctx.imageSmoothingEnabled = false;
    const dw = Math.max(36, radius * 0.85);
    ctx.drawImage(fx32, fr * 32, 2144, 32, 32, radius * 0.15, -dw / 2, dw, dw);
    ctx.restore();
    return;
  }
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

export function heroFrame(anim: string, _pose: number, hurt: number, t: number) {
  return heroLocalFrame(anim, 0, hurt, t);
}

export { beastFrame, heroLocalFrame };
