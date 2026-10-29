// «Чёрная магия»: рисовалка оружия из частей (рукоять, лезвие, 2-е и 3-е лезвие, кристалл) для кузни, конструктора и руки моба.
// Если у части есть лист Художника (img → /bm-art/weapon/<img>.png) — рисуем его; иначе огненная ЗАГЛУШКА на canvas.
// Чистая функция кадра: drawWeapon(ctx, parts, t, {x, y, scale, angle}) — t в секундах (огонь «дышит»).
import { BM_PARTS, BMA_CFG } from '../../../../../server/meta/blackArt.ts';

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
const partOf = (v) => (!v ? null : typeof v === 'object' ? v : BM_PARTS[v] || null);
// манифест листов Художника (public/bm-art/weapon/index.json: точки стыковки, анимации)
let WMAN = null, wmanP = null;
export function weaponManifest() {
  if (WMAN || wmanP || typeof fetch === 'undefined') return WMAN;
  wmanP = fetch(`${BM_ART_BASE}/weapon/index.json`).then((r) => (r.ok ? r.json() : {})).then((j) => { WMAN = j || {}; }).catch(() => { WMAN = {}; });
  return WMAN;
}
export const weaponSheets = () => Object.entries(weaponManifest() || {}).map(([k, v]) => ({ key: k, slot: v.slot, name: v.name, mode: v.mode }));
const ORDER = ['blade3', 'blade2', 'handle', 'blade', 'crystal'];
let sheetMz = [];
/** дула последнего нарисованного оружия (экран canvas, слева направо): из них вылетают снаряды посохов */
export let lastMuzzles = [];
/** оружие по листам: все части есть в манифесте и картинки загружены → true (нарисовано) */
function drawSheets(ctx, P, t, anim, glow) {
  const M = weaponManifest(); if (!M) return false;
  const sh = {}; for (const k of ORDER) { const p = P(k); if (!p) continue; const m = p.img && M[p.img]; if (!m) return false; const im = artImg(`weapon/${p.img}.png`); if (!im) return false; sh[k] = { m, im, gl: artImg(`weapon/${p.img}_glow.png`) }; }
  if (!sh.handle || !sh.blade) return false;
  const pt = (k, n) => sh[k].m.points[n] || [32, 32];
  const o = {}; const g = pt('handle', 'grip'); o.handle = [-g[0], -g[1]];
  const hb = pt('handle', 'bladeBase'), bb = pt('blade', 'base'); o.blade = [o.handle[0] + hb[0] - bb[0], o.handle[1] + hb[1] - bb[1]];
  if (sh.blade2) { const a = pt('blade', 'branch1'), b = pt('blade2', 'base'); o.blade2 = [o.blade[0] + a[0] - b[0], o.blade[1] + a[1] - b[1]]; }
  if (sh.blade3) { const a = pt('blade', 'branch2'), b = pt('blade3', 'base'); o.blade3 = [o.blade[0] + a[0] - b[0], o.blade[1] + a[1] - b[1]]; }
  if (sh.crystal) { const a = pt('handle', 'crystalSlot'), b = pt('crystal', 'base'); o.crystal = [o.handle[0] + a[0] - b[0], o.handle[1] + a[1] - b[1]]; }
  ctx.imageSmoothingEnabled = false;
  for (const pass of [0, 1]) { if (pass) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glow); }
    for (const k of ORDER) { const e = sh[k]; if (!e) continue; const im = pass ? e.gl : e.im; if (!im) continue;
      const A = e.m.anims[anim] || e.m.anims.idle, c = e.m.cell || 64; const f = A.loop ? Math.floor(t * A.fps) % A.n : Math.min(A.n - 1, Math.floor(t * A.fps));
      ctx.drawImage(im, f * c, A.row * c, c, c, o[k][0], o[k][1], c, c); } }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // дула стреляющих частей (основное лезвие + посохи во 2/3 слоте), покадрово (muzzleFrames) — в координатах оружия от хвата
  const mz = [];
  for (const k of ['blade', 'blade2', 'blade3']) { const e = sh[k]; if (!e) continue; const pts = e.m.points; if (k !== 'blade' && e.m.type !== 'staff') continue;
    const A = e.m.anims[anim] || e.m.anims.idle, f = A.loop ? Math.floor(t * A.fps) % A.n : Math.min(A.n - 1, Math.floor(t * A.fps));
    const m = e.m.muzzleFrames?.[anim]?.[f] || pts.muzzle || pts.tip; if (m) mz.push([o[k][0] + m[0], o[k][1] + m[1]]); }
  sheetMz = mz.sort((a, b) => a[0] - b[0]);
  return true;
}
/** нарисовать оружие: (x, y) — точка хвата (рука), angle — радианы (0 — вверх), scale — множитель; anim — idle/charge/full/swing/cast (листы) */
export function drawWeapon(ctx, parts, t = 0, o = {}) {
  const { x = 0, y = 0, scale = 1, angle = 0, labels = false, glow = 1, anim = 'idle' } = o;
  const P = (k) => partOf(parts[k]); // id детали или сам объект (черновик админки)
  const { L, ranged } = geom(parts);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  if (drawSheets(ctx, P, t, anim, glow)) { ctx.restore(); const c = Math.cos(angle), s = Math.sin(angle);
    lastMuzzles = sheetMz.map(([lx, ly]) => [x + scale * (c * lx - s * ly), y + scale * (s * lx + c * ly)]); return 'art'; }
  lastMuzzles = [];
  // — ЗАГЛУШКА (нет листа у какой-то части)
  // — рукоять
  const h = P('handle');
  if (h) { ctx.fillStyle = '#2a1308'; ctx.fillRect(-3, -6, 6, 26); ctx.fillStyle = h.color || '#e0601a'; for (let i = 0; i < 4; i++) ctx.fillRect(-3, -2 + i * 6, 6, 1.5);
      ctx.fillStyle = '#ff6a1a'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); ctx.fillRect(-2, 18, 4, 4); ctx.globalAlpha = 1;
      ctx.fillStyle = '#3b1a0c'; ctx.fillRect(-10, -9, 20, 4);
    if (labels) label(ctx, 'рукоять', 0, 30); }
  const c = P('crystal');
  for (const [k, side] of [['blade2', -1], ['blade3', 1]]) { const b = P(k); if (!b) continue;
    ctx.save(); ctx.translate(side * 7, -8); ctx.rotate(side * 0.55);
    ctx.fillStyle = '#5c1a0b'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, -L * 0.5); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill(); flame(ctx, 0, -2, 7, L * 0.48, t, '#ffd36a', b.color || '#ff3d00', side * 3);
    if (labels) label(ctx, k === 'blade2' ? 'лезвие 2' : 'лезвие 3', 0, -L * 0.55);
    ctx.restore(); }
  const b = P('blade');
  if (b) {
    if (ranged) {
      ctx.fillStyle = '#3b1a0c'; ctx.fillRect(-2, -L, 4, L - 6);
      const r = 7 + Math.sin(t * 8) * 1.2; const g = ctx.createRadialGradient(0, -L - 4, 1, 0, -L - 4, r * 2.2); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.4, b.color || '#ffa531'); g.addColorStop(1, '#ff3d0000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -L - 4, r * 2.2, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#4a1a0a'; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(0, -8 - L); ctx.lineTo(6, -8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 1; ctx.stroke();
      flame(ctx, 0, -9, 13, L * 1.02, t, '#ffe08a', b.color || '#ff6a1a', 1);
    }
    if (labels) label(ctx, ranged ? 'лезвие (дальнее)' : 'лезвие', 0, -L - 14); }
  if (c) { ctx.save(); ctx.translate(0, -8); ctx.rotate(Math.PI / 4); const s = 5 + Math.sin(t * 5) * 0.6;
      ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = 10 * glow; ctx.fillStyle = c.color || '#ffcf4a'; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
    if (labels) label(ctx, 'кристалл', 16, -6); }
  ctx.restore();
  return 'stub';
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
    const anim = ph < 0.35 ? 'idle' : ph < 0.6 ? 'charge' : ph < 0.7 ? 'full' : bl?.ranged ? 'cast' : 'swing';
    const mode = drawWeapon(ctx, this.parts, anim === 'swing' || anim === 'cast' ? (ph - 0.7) * 2.4 : t, { x: W / 2, y: H * 0.72, scale: Math.max(1, Math.floor(Math.min(W, H) / 70)), angle: ang, labels: this.labels, anim });
    this.mode = mode;
    if (bl?.ranged && ph > 0.7) { // выстрел: по снаряду из дула каждого посоха (веер), как на сервере
      const k = (ph - 0.7) / 0.3, M = lastMuzzles.length ? lastMuzzles : [[W / 2, H * 0.3]], n = M.length, st = (this.spread ?? BMA_CFG.staffSpread ?? 12) * Math.PI / 180;
      M.forEach(([mx, my], i) => { const a = -0.25 + st * (i - (n - 1) / 2), d = k * W * 0.5, px = mx + Math.cos(a) * d, py = my + Math.sin(a) * d;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 9); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.4, '#ffb347'); g.addColorStop(1, '#ff3d0000'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill();
        if (k < 0.3) { ctx.fillStyle = `rgba(255,230,160,${0.8 * (1 - k / 0.3)})`; ctx.beginPath(); ctx.arc(mx, my, 6, 0, 7); ctx.fill(); } }); }
    if (mode !== 'art') { ctx.fillStyle = '#ffe08a99'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ЗАГЛУШКА · у части нет листа Художника', 6, H - 6); }
  }
}
