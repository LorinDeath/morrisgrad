// «Чёрная магия»: рисовалка оружия из частей (рукоять, лезвие, 2-е и 3-е лезвие, кристалл) для кузни, конструктора и руки моба.
// Если у части есть лист Художника (img → /bm-art/weapon/<img>.png) — рисуем его; иначе огненная ЗАГЛУШКА на canvas.
// Чистая функция кадра: drawWeapon(ctx, parts, t, {x, y, scale, angle}) — t в секундах (огонь «дышит»).
import { BM_PARTS } from '../../../../../server/meta/blackArt.ts';

export const BM_ART_BASE = '/bm-art';
const imgs = new Map();
/** картинка листа Художника (кэш); null — пока грузится/нет файла */
export function artImg(path) {
  if (!path || typeof Image === 'undefined') return null;
  let e = imgs.get(path);
  if (!e) { e = { img: new Image(), ok: false, bad: false }; e.img.onload = () => { e.ok = true; }; e.img.onerror = () => { e.bad = true; }; e.img.src = `${BM_ART_BASE}/${path}`; imgs.set(path, e); }
  return e.ok ? e.img : null;
}
const flame = (ctx, x, y, w, h, t, c1 = '#ffe08a', c2 = '#ff6a1a', seed = 0) => {
  const k = 1 + 0.08 * Math.sin(t * 13 + seed) + 0.05 * Math.sin(t * 29 + seed * 2);
  const g = ctx.createLinearGradient(x, y + h, x, y - h * k);
  g.addColorStop(0, c2); g.addColorStop(0.55, c1); g.addColorStop(1, '#fff6c800');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w / 2, y + h * 0.1);
  ctx.quadraticCurveTo(x - w * 0.55, y - h * 0.4 * k, x + Math.sin(t * 9 + seed) * w * 0.15, y - h * k);
  ctx.quadraticCurveTo(x + w * 0.55, y - h * 0.4 * k, x + w / 2, y + h * 0.1); ctx.closePath(); ctx.fill();
};
const label = (ctx, txt, x, y) => { ctx.save(); ctx.font = '700 7px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#1a0d08cc'; const w = ctx.measureText(txt).width + 4; ctx.fillRect(x - w / 2, y - 6, w, 8); ctx.fillStyle = '#ffe08a'; ctx.fillText(txt, x, y); ctx.restore(); };

/** геометрия заглушки в «единицах оружия»: рукоять вниз от 0, лезвие вверх; длина лезвия от reach */
function geom(parts) {
  const bl = partOf(parts.blade), L = bl ? Math.max(26, Math.min(70, (bl.reach || 60) * 0.55)) : 40;
  return { L, ranged: !!bl?.ranged };
}
/** нарисовать оружие: (x, y) — точка хвата (рука), angle — радианы (0 — вверх), scale — множитель */
const partOf = (v) => (!v ? null : typeof v === 'object' ? v : BM_PARTS[v] || null);
export function drawWeapon(ctx, parts, t = 0, o = {}) {
  const { x = 0, y = 0, scale = 1, angle = 0, labels = false, glow = 1 } = o;
  const P = (k) => partOf(parts[k]); // id детали или сам объект (черновик админки)
  const { L, ranged } = geom(parts);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  // — рукоять
  const h = P('handle');
  if (h) { const im = artImg(h.img ? `weapon/${h.img}.png` : '');
    if (im) ctx.drawImage(im, -im.width / 2, -6, im.width, im.height);
    else { ctx.fillStyle = '#2a1308'; ctx.fillRect(-3, -6, 6, 26); ctx.fillStyle = h.color || '#e0601a'; for (let i = 0; i < 4; i++) ctx.fillRect(-3, -2 + i * 6, 6, 1.5);
      ctx.fillStyle = '#ff6a1a'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); ctx.fillRect(-2, 18, 4, 4); ctx.globalAlpha = 1;
      ctx.fillStyle = '#3b1a0c'; ctx.fillRect(-10, -9, 20, 4); }
    if (labels) label(ctx, 'рукоять', 0, 30); }
  // — кристалл (на гарде)
  const c = P('crystal');
  // — лезвия: 2-е и 3-е — боковые языки под углом
  for (const [k, side] of [['blade2', -1], ['blade3', 1]]) { const b = P(k); if (!b) continue;
    const im = artImg(b.img ? `weapon/${b.img}.png` : '');
    ctx.save(); ctx.translate(side * 7, -8); ctx.rotate(side * 0.55);
    if (im) ctx.drawImage(im, -im.width / 2, -im.height, im.width, im.height);
    else { ctx.fillStyle = '#5c1a0b'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, -L * 0.5); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill(); flame(ctx, 0, -2, 7, L * 0.48, t, '#ffd36a', b.color || '#ff3d00', side * 3); }
    if (labels) label(ctx, k === 'blade2' ? 'лезвие 2' : 'лезвие 3', 0, -L * 0.55);
    ctx.restore(); }
  const b = P('blade');
  if (b) { const im = artImg(b.img ? `weapon/${b.img}.png` : '');
    if (im) ctx.drawImage(im, -im.width / 2, -im.height - 8, im.width, im.height);
    else if (ranged) { // дальний: «посох» с огненным шаром на конце
      ctx.fillStyle = '#3b1a0c'; ctx.fillRect(-2, -L, 4, L - 6);
      const r = 7 + Math.sin(t * 8) * 1.2; const g = ctx.createRadialGradient(0, -L - 4, 1, 0, -L - 4, r * 2.2); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.4, b.color || '#ffa531'); g.addColorStop(1, '#ff3d0000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -L - 4, r * 2.2, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#4a1a0a'; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(0, -8 - L); ctx.lineTo(6, -8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 1; ctx.stroke();
      flame(ctx, 0, -9, 13, L * 1.02, t, '#ffe08a', b.color || '#ff6a1a', 1);
    }
    if (labels) label(ctx, ranged ? 'лезвие (дальнее)' : 'лезвие', 0, -L - 14); }
  if (c) { const im = artImg(c.img ? `weapon/${c.img}.png` : '');
    if (im) ctx.drawImage(im, -im.width / 2, -12 - im.height / 2, im.width, im.height);
    else { ctx.save(); ctx.translate(0, -8); ctx.rotate(Math.PI / 4); const s = 5 + Math.sin(t * 5) * 0.6;
      ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = 10 * glow; ctx.fillStyle = c.color || '#ffcf4a'; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore(); }
    if (labels) label(ctx, 'кристалл', 16, -6); }
  ctx.restore();
}

/** анимированное превью в <canvas>: оружие покачивается, раз в 2,4 с — замах (дуга удара) или выстрел */
export class WeaponPreview {
  constructor(canvas) { this.cv = canvas; this.parts = {}; this.t0 = performance.now(); this.raf = 0; this.on = false; this.labels = true; }
  set(parts) { this.parts = { ...parts }; }
  start() { if (this.on) return; this.on = true; const loop = () => { if (!this.on || !this.cv.isConnected) { this.on = false; return; } this.frame(); this.raf = requestAnimationFrame(loop); }; loop(); }
  stop() { this.on = false; cancelAnimationFrame(this.raf); }
  frame() {
    const cv = this.cv, ctx = cv.getContext('2d'), W = cv.width, H = cv.height, t = (performance.now() - this.t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, H * 0.9, 10, W / 2, H * 0.6, H); bg.addColorStop(0, '#5c1a0b'); bg.addColorStop(0.6, '#1a0d08'); bg.addColorStop(1, '#0b0604');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // искры
    for (let i = 0; i < 18; i++) { const sx = (i * 53 + t * 20 * (1 + (i % 3))) % W, sy = H - ((t * 40 * (1 + (i % 4)) + i * 37) % H); ctx.fillStyle = i % 2 ? '#ffb347aa' : '#ff6a1a88'; ctx.fillRect(sx, sy, 2, 2); }
    const ph = (t % 2.4) / 2.4, sw = ph > 0.7 ? Math.sin((ph - 0.7) / 0.3 * Math.PI) : 0;
    const bl = partOf(this.parts.blade);
    if (!this.parts.handle && !this.parts.blade) { ctx.fillStyle = '#fdba74'; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Выберите рукоять и лезвие', W / 2, H / 2); return; }
    const ang = bl?.ranged ? -0.25 + Math.sin(t * 1.5) * 0.05 : -0.35 + Math.sin(t * 1.5) * 0.06 + sw * 1.9;
    if (sw > 0.05 && bl && !bl.ranged) { const arc = bl.arc || 1.1; ctx.save(); ctx.translate(W / 2, H * 0.72); ctx.strokeStyle = `rgba(255,154,60,${0.6 * sw})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, H * 0.5, -Math.PI / 2 - arc / 2, -Math.PI / 2 + arc / 2); ctx.stroke(); ctx.restore(); }
    if (bl?.ranged && ph > 0.7) { const k = (ph - 0.7) / 0.3; ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(W / 2 + k * W * 0.45, H * 0.3 - k * 10, 5, 0, 7); ctx.fill(); }
    drawWeapon(ctx, this.parts, t, { x: W / 2, y: H * 0.72, scale: Math.min(W, H) / 120, angle: ang, labels: this.labels });
    ctx.fillStyle = '#ffe08a99'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ЗАГЛУШКА · арт частей — от Художника', 6, H - 6);
  }
}
