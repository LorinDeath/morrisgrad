// Доп. арт ui-v2 (Художник): рамка полосы ОЗ, маркеры захвата/покупки, кольцо поселения. Пути — /strat/ui2/{frames,map}/…
const U = "/strat/ui2/";
const imgs = new Map<string, HTMLImageElement>(), tints = new Map<string, HTMLCanvasElement>();
export function uImg(src: string, redraw?: () => void): HTMLImageElement | null {
  let im = imgs.get(src); if (!im) { im = new Image(); imgs.set(src, im); if (redraw) im.onload = redraw; im.src = src; }
  return im.complete && im.naturalWidth ? im : null;
}
/** Белая маска × цвет игрока (multiply), альфа — из маски. */
export function tinted(src: string, col: string, redraw?: () => void): HTMLCanvasElement | null {
  const k = src + "|" + col, hit = tints.get(k); if (hit) return hit; const b = uImg(src, redraw); if (!b) return null;
  const cv = document.createElement("canvas"); cv.width = b.naturalWidth; cv.height = b.naturalHeight; const c = cv.getContext("2d")!;
  c.drawImage(b, 0, 0); c.globalCompositeOperation = "multiply"; c.fillStyle = col; c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = "destination-in"; c.drawImage(b, 0, 0); if (tints.size > 200) tints.clear(); tints.set(k, cv); return cv;
}
export const HPF = { own: U + "frames/hp_bar_frame.png", enemy: U + "frames/hp_bar_frame_enemy.png" };
/** Полоса ОЗ в рамке 128×24 (3-slice 16/16; жёлоб x10..W−10, y8..16 — заливка ПОД рамкой).
 *  x,w — внешняя рамка; ty,th — жёлоб (рамка выступает на th сверху и снизу). fill — цвет заливки, fr 0..1. */
export function hpBarArt(ctx: CanvasRenderingContext2D, x: number, ty: number, w: number, th: number, fr: number, fill: string, enemy: boolean, redraw?: () => void) {
  const f = uImg(enemy ? HPF.enemy : HPF.own, redraw), s = th / 8, tx = x + 10 * s, tw = Math.max(1, w - 20 * s); fr = Math.max(0, Math.min(1, fr));
  ctx.fillStyle = "#140f18"; ctx.fillRect(tx, ty, tw, th); ctx.fillStyle = fill; ctx.fillRect(tx, ty, tw * fr, th);
  ctx.fillStyle = "#ffffff38"; ctx.fillRect(tx, ty, tw * fr, th * 0.38);
  if (!f) { ctx.strokeStyle = "#140f18"; ctx.lineWidth = 1; ctx.strokeRect(tx - 0.5, ty - 0.5, tw + 1, th + 1); return; }
  const cap = 16 * s, H = 24 * s, top = ty - 8 * s;
  ctx.drawImage(f, 0, 0, 16, 24, x, top, cap, H); ctx.drawImage(f, 16, 0, 96, 24, x + cap, top, Math.max(0, w - 2 * cap), H); ctx.drawImage(f, 112, 0, 16, 24, x + w - cap, top, cap, H);
}
/** Захват клетки: рамка-кольцо + k белых сегментов, тонированных цветом захватчика (по часовой от верха); k=max — готовый кадр 4. */
export function drawCapture(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, k: number, max: number, col: string, label: string, redraw?: () => void) {
  const s = size / 96, kk = Math.max(0, Math.min(4, Math.round((k / Math.max(1, max)) * 4)));
  if (kk >= 4) { const im = uImg(U + "map/capture_marker_4.png", redraw); if (im) ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size); return; }
  const fr = uImg(U + "map/capture_ring_frame.png", redraw), seg = tinted(U + "map/capture_ring_segment.png", col, redraw);
  if (!fr) { const im = uImg(U + `map/capture_marker_${kk}.png`, redraw); if (im) ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size); return; }
  ctx.drawImage(fr, cx - size / 2, cy - size / 2, size, size);
  if (seg) for (let i = 0; i < kk; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate((Math.PI / 2) * i); ctx.drawImage(seg, -size / 2, -size / 2, size, size); ctx.restore(); }
  if (label && size >= 26) { ctx.font = `700 ${Math.round(21 * s * 1.15)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f4ead2"; ctx.fillText(label, cx, cy + 1); }
}
/** Кольцо основания поселения 128 (центр r<38 прозрачен): маска цвета игрока + золотое кольцо по прогрессу. */
export function drawSettleRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fr: number, col: string, redraw?: () => void) {
  const w = tinted(U + "map/settlement_ring_white.png", col, redraw), g = uImg(U + "map/settlement_ring.png", redraw); if (!w || !g) return false;
  ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(w, cx - size / 2, cy - size / 2, size, size); ctx.restore();
  if (fr > 0) { ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, size, -Math.PI / 2, -Math.PI / 2 + Math.min(1, fr) * Math.PI * 2); ctx.closePath(); ctx.clip(); ctx.drawImage(g, cx - size / 2, cy - size / 2, size, size); ctx.restore(); }
  return true;
}
export const BUY_MARKER = U + "map/buy_marker.png";
export const DRUM_FRAME = U + "frames/race_drum_frame.png";
