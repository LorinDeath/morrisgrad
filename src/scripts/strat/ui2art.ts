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
/** steps>0 — ступенчатая полоса (аудит M4: «Скрытое здоровье» — 3 деления ok/hurt/low, без плавной заливки). */
export const HS_STEP: Record<string, number> = { ok: 3, hurt: 2, low: 1, dead: 0 };
export function hpBarArt(ctx: CanvasRenderingContext2D, x: number, ty: number, w: number, th: number, fr: number, fill: string, enemy: boolean, redraw?: () => void, steps = 0) {
  const f = uImg(enemy ? HPF.enemy : HPF.own, redraw), s = th / 8, tx = x + 10 * s, tw = Math.max(1, w - 20 * s); fr = Math.max(0, Math.min(1, fr));
  if (steps > 0) fr = Math.round(fr * steps) / steps;
  ctx.fillStyle = "#140f18"; ctx.fillRect(tx, ty, tw, th); ctx.fillStyle = fill; ctx.fillRect(tx, ty, tw * fr, th);
  ctx.fillStyle = "#ffffff38"; ctx.fillRect(tx, ty, tw * fr, th * 0.38);
  if (steps > 1 && !f) { ctx.fillStyle = "#140f18"; const gw = Math.max(1.5, th * 0.32); for (let i = 1; i < steps; i++) ctx.fillRect(tx + (tw * i) / steps - gw / 2, ty, gw, th); }
  if (!f) { ctx.strokeStyle = "#140f18"; ctx.lineWidth = 1; ctx.strokeRect(tx - 0.5, ty - 0.5, tw + 1, th + 1); return; }
  const cap = 16 * s, H = 24 * s, top = ty - 8 * s;
  ctx.drawImage(f, 0, 0, 16, 24, x, top, cap, H); ctx.drawImage(f, 16, 0, 96, 24, x + cap, top, Math.max(0, w - 2 * cap), H); ctx.drawImage(f, 112, 0, 16, 24, x + w - cap, top, cap, H);
}
/** Захват клетки (аудит п.6): capture_ring_frame_N + N белых сегментов capture_ring_segment_N, сегмент k — поворот 360°/N·k
 *  вокруг центра, тон — multiply цветом захватчика; окно r<21 прозрачно — число рисует игра. N вне 2..12 — старый кадр на 4. */
export function drawCapture(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, k: number, max: number, col: string, label: string, redraw?: () => void) {
  const s = size / 96, N = Math.max(1, Math.round(max)), kc = Math.max(0, Math.min(N, Math.round(k)));
  const num = () => { if (label && size >= 22) { ctx.font = `700 ${Math.round(21 * s * 1.15)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = Math.max(2, size * 0.04); ctx.strokeStyle = "#140f18"; ctx.strokeText(label, cx, cy + 1); ctx.fillStyle = "#f4ead2"; ctx.fillText(label, cx, cy + 1); } };
  const NN = N >= 2 && N <= 12 ? N : 4, kk = NN === N ? kc : Math.round((kc / N) * 4);
  const fr = uImg(U + `map/capture_ring_frame_${NN}.png`, redraw), seg = tinted(U + `map/capture_ring_segment_${NN}.png`, col, redraw);
  if (!fr) { const im = uImg(U + `map/capture_marker_${Math.min(4, Math.round((kc / N) * 4))}.png`, redraw); if (im) ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size); num(); return; }
  ctx.drawImage(fr, cx - size / 2, cy - size / 2, size, size);
  if (seg) for (let i = 0; i < kk; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(((Math.PI * 2) / NN) * i); ctx.drawImage(seg, -size / 2, -size / 2, size, size); ctx.restore(); }
  num();
}
/** Скрытое здоровье (аудит п.5): готовая полоса hp_bar_enemy_{ok,hurt,low,dead} 128×24 вместо кодовых делений. false — не загружена. */
export function hsBarArt(ctx: CanvasRenderingContext2D, x: number, ty: number, w: number, th: number, hs: string, redraw?: () => void) {
  const im = uImg(U + `frames/hp_bar_enemy_${HS_STEP[hs] != null ? hs : "dead"}.png`, redraw); if (!im) return false;
  const s = th / 8; ctx.drawImage(im, x, ty - 8 * s, w, 24 * s); return true;
}
/** Полоса ОЗ фигуры: unit_hp_bar_frame(_enemy) 64×10, 3-slice 10/10, жёлоб x6..58 y3..7 (заливка под рамкой);
 *  hs — скрытое здоровье: готовая unit_hp_bar_enemy_<hs>. x,w — внешняя рамка, y — верх рамки, H — её высота. */
export function unitHpArt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, H: number, fr: number, fill: string, enemy: boolean, hs: string | null, redraw?: () => void) {
  const k = H / 10;
  if (hs) { const im = uImg(U + `frames/unit_hp_bar_enemy_${HS_STEP[hs] != null ? hs : "dead"}.png`, redraw); if (im) { ctx.drawImage(im, 0, 0, 10, 10, x, y, 10 * k, H); ctx.drawImage(im, 10, 0, 44, 10, x + 10 * k, y, Math.max(0, w - 20 * k), H); ctx.drawImage(im, 54, 0, 10, 10, x + w - 10 * k, y, 10 * k, H); return true; } }
  const f = uImg(U + (enemy ? "frames/unit_hp_bar_frame_enemy.png" : "frames/unit_hp_bar_frame.png"), redraw); if (!f) return false;
  const gx = x + 6 * k, gw = Math.max(1, w - 12 * k), gy = y + 3 * k, gh = 4 * k; fr = Math.max(0, Math.min(1, fr));
  ctx.fillStyle = "#140f18"; ctx.fillRect(gx, gy, gw, gh); ctx.fillStyle = fill; ctx.fillRect(gx, gy, gw * fr, gh); ctx.fillStyle = "#ffffff38"; ctx.fillRect(gx, gy, gw * fr, gh * 0.4);
  ctx.drawImage(f, 0, 0, 10, 10, x, y, 10 * k, H); ctx.drawImage(f, 10, 0, 44, 10, x + 10 * k, y, Math.max(0, w - 20 * k), H); ctx.drawImage(f, 54, 0, 10, 10, x + w - 10 * k, y, 10 * k, H);
  return true;
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
