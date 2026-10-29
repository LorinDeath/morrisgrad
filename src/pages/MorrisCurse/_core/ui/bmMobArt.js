// «Чёрная магия», этап В: сборка чёрного моба из листов Художника (public/bm-art/body, 104 px, 19×4, 64 кадра)
// и оружия в руке (bmWeaponArt.drawWeapon, хват handle.grip → точка handR кадра правой руки, угол handAngle: 0 — вверх, + по часовой).
// Части нарисованы в общих координатах рига: собрать кадр = наложить клетки по z. Нет листа у части — огненная ЗАГЛУШКА с подписью.
import { BM_BODY, BM_MOBS, BODY_SLOTS, BM_CLASS_NAMES } from '../../../../../server/meta/blackMobs.ts';
import { drawWeapon, BM_ART_BASE } from './bmWeaponArt.js';

export const BODY_CELL = 104, PAD_X = 20, PAD_Y = 40, MCELL = 144, MCOLS = 16; // клетка моба с запасом под оружие и табличку
export const BANIM = { idle: { off: 0, n: 16, fps: 12, loop: true }, walk: { off: 16, n: 12, fps: 24, loop: true }, atk: { off: 28, n: 12, fps: 20 }, hurt: { off: 40, n: 6, fps: 24 }, die: { off: 46, n: 18, fps: 24 } };
const CLS_ICON = { warrior: '⚔', archer: '🏹', mage: '✦', brute: '⛨' };
let IDX = null, idxP = null;
/** манифест тела (точки руки по кадрам); null — ещё грузится */
export function bodyIndex() {
  if (IDX || idxP || typeof fetch === 'undefined') return IDX;
  idxP = fetch(`${BM_ART_BASE}/body/index.json`).then((r) => (r.ok ? r.json() : {})).then((j) => { IDX = j || {}; if (IDX.anims) for (const [k, a] of Object.entries(IDX.anims)) BANIM[k] = { ...BANIM[k], ...a }; }).catch(() => { IDX = {}; });
  return IDX;
}
const IMGS = new Map();
/** картинка с состоянием: {img, ok, bad} */
export function bodyImg(name) {
  if (!name || typeof Image === 'undefined') return { ok: false, bad: true };
  let e = IMGS.get(name);
  if (!e) { e = { img: new Image(), ok: false, bad: false }; e.img.onload = () => { e.ok = true; }; e.img.onerror = () => { e.bad = true; }; e.img.src = `${BM_ART_BASE}/body/${name}.png`; IMGS.set(name, e); }
  return e;
}
const partOf = (v) => (!v ? null : typeof v === 'object' ? v : BM_BODY[v] || null);
const Z = { tail: 0, armL: 1, legL: 2, torso: 3, legR: 4, head: 5, armR: 6 };
// заглушка части: огненный силуэт по точкам рига (шея 52,40 · плечи 40/64,46 · бёдра 46/58,70 · земля 100)
const STUB = { torso: [40, 40, 24, 32], head: [42, 18, 20, 22], armR: [62, 44, 8, 26], armL: [34, 44, 8, 26], legR: [55, 70, 8, 30], legL: [43, 70, 8, 30], tail: [24, 66, 20, 8] };
function stubPart(ctx, slot, f, x0, y0) {
  const r = STUB[slot]; if (!r) return; const bob = Math.sin(f * 0.4) * 1;
  ctx.fillStyle = '#5c1a0b'; ctx.fillRect(x0 + r[0], y0 + r[1] + bob, r[2], r[3]);
  ctx.fillStyle = '#ff6a1a'; ctx.fillRect(x0 + r[0] + 1, y0 + r[1] + bob + 1, r[2] - 2, 2);
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1; ctx.strokeRect(x0 + r[0] + 0.5, y0 + r[1] + bob + 0.5, r[2] - 1, r[3] - 1);
}
const DEF_HAND = [66, 68, 24];
/** точка руки и угол для кадра f (по листу правой руки) */
export function handAt(armImg, f) { const h = IDX?.parts?.[armImg]?.hand; const p = Array.isArray(h) ? h[f] || h[0] : null; return Array.isArray(p) ? p : DEF_HAND; }
/** состояние загрузки тела: 'art' — все листы, 'stub' — у каких-то частей заглушка, 'wait' — грузится */
export function bodyState(body) {
  if (!bodyIndex()) return 'wait';
  let stub = false;
  for (const s of BODY_SLOTS) { const p = partOf(body?.[s]); if (!p) continue; const e = bodyImg(p.img); if (!e.ok && !e.bad) return 'wait'; if (e.bad) stub = true; }
  return stub ? 'stub' : 'art';
}
/** нарисовать кадр f (0–63) моба: (x0, y0) — левый верх клетки тела 104×104; weapon — {handle, blade, …}; glow — свечение */
export function drawMobFrame(ctx, body, weapon, f, x0 = 0, y0 = 0, o = {}) {
  const { glow = 1, labels = false, anim = 'idle', t = 0 } = o;
  const slots = BODY_SLOTS.filter((s) => partOf(body?.[s])).sort((a, b) => Z[a] - Z[b]);
  const col = f % 19, row = Math.floor(f / 19), C = BODY_CELL;
  ctx.imageSmoothingEnabled = false;
  for (const s of slots) { const p = partOf(body[s]), e = bodyImg(p.img); if (e.ok) ctx.drawImage(e.img, col * C, row * C, C, C, x0, y0, C, C); else stubPart(ctx, s, f, x0, y0); }
  if (glow > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glow);
    for (const s of slots) { const p = partOf(body[s]), e = bodyImg(`${p.img}_glow`); if (e.ok) ctx.drawImage(e.img, col * C, row * C, C, C, x0, y0, C, C); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  const arm = partOf(body?.armR);
  if (weapon && (weapon.handle || weapon.blade) && f < 50) { // с 50-го кадра смерти — распад, оружие падает (не рисуем)
    const [hx, hy, ha] = handAt(arm?.img, f);
    const wa = anim === 'atk' ? (f >= 34 && f <= 36 ? 'swing' : f < 34 ? 'charge' : 'idle') : 'idle';
    drawWeapon(ctx, weapon, anim === 'atk' ? Math.max(0, (f - 34) / 20) : t, { x: x0 + hx, y: y0 + hy, angle: (ha * Math.PI) / 180, scale: 1, anim: wa, glow });
  }
  if (labels) { ctx.font = '700 7px system-ui'; ctx.fillStyle = '#ffe08a'; ctx.textAlign = 'left'; ctx.fillText(`кадр ${f}`, x0 + 2, y0 + C - 2); }
}
/** табличка класса: «⚔ Воин 8» над головой (в листе) */
export function drawPlate(ctx, m, cx, y) {
  if (!m) return; const txt = `${CLS_ICON[m.cls] || '✦'} ${BM_CLASS_NAMES[m.cls] || m.cls || ''} ${m.lvl || ''}`.trim();
  ctx.save(); ctx.font = '700 10px system-ui,sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(txt).width + 8;
  ctx.fillStyle = '#1a0d08dd'; ctx.fillRect(Math.round(cx - w / 2), y - 10, Math.round(w), 13); ctx.strokeStyle = m.cursed ? '#c084fc' : '#ff6a1a'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(cx - w / 2) + 0.5, y - 9.5, Math.round(w) - 1, 12);
  ctx.fillStyle = '#ffe08a'; ctx.fillText(txt, cx, y); ctx.restore();
}
/** ряды листа: 0–3 — смотрит вправо (как нарисовал Художник), 4–7 — тот же риг зеркально (смотрит влево) */
export const MROWS = 8, MIRROR_ROW = 4;
/** клетка моба зеркально относительно её центра (тело по центру: PAD_X + 52 = MCELL / 2): тело, свечение, оружие, хвост — всё вместе */
export function drawMobCell(ctx, m, f, x, y, faceL, o = {}) {
  const anim = f >= 46 ? 'die' : f >= 40 ? 'hurt' : f >= 28 ? 'atk' : f >= 16 ? 'walk' : 'idle';
  if (faceL) { ctx.save(); ctx.translate(x + MCELL, y); ctx.scale(-1, 1); drawMobFrame(ctx, m.body, m.weapon, f, PAD_X, PAD_Y, { anim, t: f / 12 }); ctx.restore(); }
  else drawMobFrame(ctx, m.body, m.weapon, f, x + PAD_X, y + PAD_Y, { anim, t: f / 12 });
  if (o.plate !== false && f < 46) drawPlate(ctx, m, x + PAD_X + 52, y + 14); // табличка — всегда прямо (не зеркалится)
}
/** лист моба на 64 кадра × 2 стороны: MCOLS×8 клеток MCELL (ряды 4–7 — зеркальный риг); null — листы ещё грузятся */
export function composeMobSheet(mobId, o = {}) {
  const m = BM_MOBS[mobId]; if (!m || typeof document === 'undefined') return null;
  const st = bodyState(m.body); if (st === 'wait') return null;
  const cv = document.createElement('canvas'); cv.width = MCOLS * MCELL; cv.height = MROWS * MCELL; const ctx = cv.getContext('2d');
  for (let side = 0; side < 2; side++) for (let f = 0; f < 64; f++) drawMobCell(ctx, m, f, (f % MCOLS) * MCELL, (Math.floor(f / MCOLS) + side * MIRROR_ROW) * MCELL, side === 1, o);
  cv.state = st; return cv;
}
/** сторона взгляда чёрного моба (клиент): сервер шлёт, куда он смотрит в бою (биты 26/27 флагов), иначе — по ходу по x; вверх/вниз — прежняя */
export function mobFaceL(prevL, dxMove, flags) {
  if (flags & (1 << 27)) return !!(flags & (1 << 26));
  if (Math.abs(dxMove) > 1) return dxMove < 0;
  return !!prevL;
}
/** кадр анимации по времени */
export const animFrame = (a, t) => { const A = BANIM[a] || BANIM.idle; const k = Math.floor(t * A.fps); return A.off + (A.loop ? k % A.n : Math.min(A.n - 1, k)); };

/** живое превью в админке: анимация (idle/walk/atk/hurt/die или «all» по кругу), сетка, силуэт героя 1,8 м, круги хитбокса/агро */
export class MobPreview {
  constructor(canvas) { this.cv = canvas; this.mob = null; this.anim = 'all'; this.grid = true; this.hero = true; this.rings = true; this.faceL = false; this.t0 = performance.now(); this.on = false; this.zoom = 3; }
  set(mob) { this.mob = mob; }
  start() { if (this.on) return; this.on = true; const loop = () => { if (!this.on || !this.cv.isConnected) { this.on = false; return; } this.frame(); requestAnimationFrame(loop); }; loop(); }
  stop() { this.on = false; }
  frame() {
    const cv = this.cv, ctx = cv.getContext('2d'), W = cv.width, H = cv.height, t = (performance.now() - this.t0) / 1000, m = this.mob;
    ctx.fillStyle = '#120806'; ctx.fillRect(0, 0, W, H);
    const k = this.zoom, gx = W / 2, gy = H - 18; // земля
    if (this.grid) { ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 1; for (let x = gx % (20 * k / 2); x < W; x += 20 * k / 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = gy; y > 0; y -= 20 * k / 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.strokeStyle = '#ff6a1a55'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    if (!m) { ctx.fillStyle = '#fdba74'; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Выберите моба или создайте нового', W / 2, H / 2); return; }
    const sc = m.scale || 1;
    if (this.rings) { ctx.save(); ctx.translate(gx, gy); ctx.scale(1, 0.35); ctx.strokeStyle = '#38bdf8aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, (m.radius || 12) * k / 1.6 * sc, 0, 7); ctx.stroke(); ctx.setLineDash([6, 6]); ctx.strokeStyle = '#f8717188'; ctx.beginPath(); ctx.arc(0, 0, Math.min(W, (m.aggro || 200) * k / 6), 0, 7); ctx.stroke(); ctx.restore(); }
    if (this.hero) { const hh = 1.8 * 20 * k * 0.6 / 0.6; ctx.fillStyle = '#94a3b844'; const hx = gx - 60 * k / 2; ctx.fillRect(hx - 5 * k / 2, gy - hh * 0.6, 10 * k / 2, hh * 0.6); ctx.beginPath(); ctx.arc(hx, gy - hh * 0.6 - 4 * k / 2, 4 * k / 2, 0, 7); ctx.fill(); ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('герой 1,8 м', hx, gy + 12); }
    const seq = ['idle', 'walk', 'atk', 'hurt', 'idle', 'die'], dur = { idle: 1.3, walk: 1, atk: 0.6, hurt: 0.25, die: 0.75 };
    let a = this.anim, ta = t;
    if (a === 'all') { const tot = seq.reduce((s, x) => s + dur[x], 0) + 0.5; let r = t % tot; a = 'die'; for (const x of seq) { if (r < dur[x]) { a = x; break; } r -= dur[x]; } ta = r; }
    else if (!BANIM[a]?.loop) ta = t % (dur[a] + 0.5);
    const f = animFrame(a, ta);
    ctx.save(); ctx.translate(gx, gy); const s = k * 0.6 / 0.6 * sc * 0.6; ctx.scale(this.faceL ? -s : s, s); ctx.translate(-52, -100); // ◀ — зеркально, как в мире
    drawMobFrame(ctx, m.body, m.weapon, f, 0, 0, { anim: a, t, glow: 1 }); ctx.restore();
    this.state = bodyState(m.body); this.frameNo = f; this.animNow = a;
    drawPlate(ctx, m, gx, Math.max(14, gy - 100 * s - 6));
    ctx.fillStyle = '#ffe08acc'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${a} · кадр ${f}${this.faceL ? ' · ◀' : ''}${this.state === 'stub' ? ' · ЗАГЛУШКА у части без листа' : ''}`, 6, 14);
  }
}
