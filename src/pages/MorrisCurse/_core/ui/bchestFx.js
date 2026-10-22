// 🎁 Сцена открытия сундука награды. Рисунок художника (chestArt.js: лист открытия 224×224, 24 к/с, события
// flash / lid_off / items_out / idle_start, треки вылета предметов) или процедурный запасной сундук.
// Поверх: тряска (сильнее у высоких ярусов), плоская вспышка цветом редкости, обломки-пиксели, НАСТОЯЩИЕ иконки
// выпавших вещей летят по трекам художника, у проклятых — чёрный дым и трещины. Без свечения и звёздочек:
// только плоские заливки и квадратные пиксели. Тап/клик/пробел — пропустить к концу.
import { openAnim } from './chestArt.js';
import { card, iconHtml } from '../meta/itemCards.js';
import { RARITIES } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';

const ART_RI = (art) => Math.max(0, ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(String(art).replace('cursed_', '')));
const FR = [24, 34, 43, 53, 62, 72]; // кадров открытия у запасного сундука (как у художника)
const rarOf = (x) => card(x.id)?.rarity || 'common';
const rcol = (x) => (x.c ? '#a855f7' : RARITIES[rarOf(x)]?.color || '#9ca3af');
const rord = (x) => (RARITIES[rarOf(x)]?.order ?? 0) + (x.e ? 0.5 : 0);
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
export const MAX_FLY = 16; // столько иконок летит; остальное — «+N»

/** Полноэкранная сцена открытия. chest: { art, color, name, tier }, items: [{lid,id,c,e}].
 *  opts.target(i) → DOMRect клетки в окне (куда прилетит вещь), opts.onLand(i) — вещь «легла» в клетку, opts.onDone() */
export function playOpen(chest, items, opts = {}) {
  const root = document.createElement('div'); root.className = 'bc-fx'; root.innerHTML = `<canvas class="pt"></canvas><div class="sh"><canvas class="ch"></canvas><div class="its"></div></div><div class="cap"></div><div class="skip">${matchMedia('(hover: none)').matches ? 'Тап — пропустить' : 'Клик или пробел — пропустить'}</div>`;
  (opts.host || document.body).appendChild(root);
  const pt = root.querySelector('.pt'), ptx = pt.getContext('2d'), shEl = root.querySelector('.sh'), cv = root.querySelector('.ch'), cx = cv.getContext('2d'), itsEl = root.querySelector('.its'), cap = root.querySelector('.cap');
  const art = chest.art || 'common', ri = ART_RI(art), cursed = String(art).startsWith('cursed_'), col = chest.color && chest.color !== '#1c1917' ? chest.color : (RARITIES[String(art).replace('cursed_', '')]?.color || '#9ca3af');
  const power = (ri + (cursed ? 1.5 : 0)) / 6.5; // 0…1 — размах всех эффектов
  let W = 0, H = 0, S = 1, CX = 0, CY = 0, dead = false, A = null, t0 = 0, skip = false, phase = 'open', flyT = 0;
  const parts = []; const cracks = [];
  const fit = () => { W = innerWidth; H = innerHeight; pt.width = W; pt.height = H; S = Math.max(1, Math.min(3, Math.floor(Math.min(W * 0.9, H * 0.55) / 224 * 2) / 2)); cv.width = 224 * S; cv.height = 224 * S; cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px'; CX = W / 2; CY = H * 0.5; shEl.style.left = CX - 112 * S + 'px'; shEl.style.top = CY - 211 * S + 'px'; cap.style.top = CY + 10 + 'px'; };
  fit(); addEventListener('resize', fit);
  const order = items.map((x, i) => i).sort((a, b) => rord(items[b]) - rord(items[a])); // лучшие вылетают первыми — по главным трекам
  const shown = order.slice(0, MAX_FLY), extra = items.length - shown.length;
  const els = shown.map((i, j) => { const x = items[i], cc = card(x.id) || { name: x.id }; const e = document.createElement('div'); e.className = 'bc-it' + (x.c ? ' cz' : ''); e.style.setProperty('--rc', rcol(x)); e.innerHTML = iconHtml(cc, 32); e.style.display = 'none'; itsEl.appendChild(e); return { e, i, j, landed: false }; });
  const best = items.length ? items[order[0]] : null;
  // ---- частицы: квадратные пиксели (обломки, дым, «всплеск» редкости). Без свечения ----
  const burst = (x, y, n, c, sp = 3, up = 1) => { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * sp; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up * 2, g: 0.18, s: (1 + Math.floor(Math.random() * 3)) * Math.max(1, S), c, life: 30 + Math.random() * 30, t: 0 }); } };
  const smoke = (x, y, n, big = 1) => { for (let k = 0; k < n; k++) parts.push({ x: x + (Math.random() - 0.5) * 80 * S, y: y - Math.random() * 20 * S, vx: (Math.random() - 0.5) * 0.6, vy: -0.5 - Math.random() * 1.1, g: -0.004, s: (3 + Math.floor(Math.random() * 4)) * S * big, c: Math.random() < 0.5 ? '#0b0910' : '#1d1726', life: 50 + Math.random() * 50, t: 0, smoke: 1 }); };
  const crack = () => { const n = 3 + Math.round(power * 5); for (let k = 0; k < n; k++) { let a = Math.PI * (0.05 + Math.random() * 0.9) + (Math.random() < 0.5 ? 0 : Math.PI), x = CX, y = CY - 4 * S; const pts = [[x, y]]; const L = (40 + Math.random() * 90) * S * (0.6 + power); for (let d = 0; d < L; d += 8 * S) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 8 * S; y += Math.sin(a) * 4 * S; pts.push([x, y]); } cracks.push({ pts, w: Math.max(1, Math.round(S * (1 + power))) }); } };
  let shake = 0, flash = 0;
  const finish = () => { if (dead) return; dead = true; for (const o of els) o.e.remove(); removeEventListener('resize', fit); removeEventListener('keydown', onKey, true); root.remove(); opts.onDone?.(); };
  const toTargets = () => { if (phase === 'fly' || phase === 'end') return; phase = 'fly'; flyT = performance.now(); cap.classList.add('out');
    els.forEach((o, k) => { const r = opts.target?.(o.i); const b = o.e.getBoundingClientRect(); o.from = b.width ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: CX, y: CY - 80 * S }; o.e.style.display = ''; document.body.appendChild(o.e); o.e.classList.add('fly'); /* вне сцены: сцена гаснет, а вещи долетают */ o.to = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W / 2, y: H }; o.delay = skip ? 0 : k * 45; o.flown = false; }); };
  const onSkip = () => { if (phase === 'fly') { finishFly(); return; } skip = true; toTargets(); };
  const finishFly = () => { for (const o of els) if (!o.flown) { o.flown = true; opts.onLand?.(o.i); } for (const i of order.slice(MAX_FLY)) opts.onLand?.(i); phase = 'end'; finish(); };
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); onSkip(); });
  const onKey = (e) => { if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); onSkip(); } };
  addEventListener('keydown', onKey, true);
  // ---- запасной сундук (нет рисунка): пиксельные прямоугольники по тем же фазам ----
  const proc = { frames: FR[ri], ev: { flash: Math.round(FR[ri] * 0.42), lid_off: Math.round(FR[ri] * 0.42) + 1, items_out: Math.round(FR[ri] * 0.42) + 2, idle_start: FR[ri] } };
  const drawProc = (f) => { const c = cx, s = S; c.clearRect(0, 0, cv.width, cv.height); const ev = proc.ev, fl = f >= ev.flash && f < ev.flash + 3, off = f >= ev.lid_off;
    const R = (x, y, w, h, k) => { c.fillStyle = k; c.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s)); };
    const body = cursed ? '#2a2433' : '#6b4423', band = col, dark = '#1a1626';
    R(60, 150, 104, 62, dark); R(62, 152, 100, 58, fl ? col : body); if (!fl) { R(62, 168, 100, 4, band); R(62, 196, 100, 4, band); R(76, 152, 6, 58, band); R(142, 152, 6, 58, band); R(106, 160, 12, 14, '#d6c38a'); }
    if (cursed && !fl) { R(70, 182, 30, 2, '#000'); R(98, 180, 22, 2, '#000'); R(120, 186, 26, 2, '#000'); }
    if (!off) { const k = Math.min(1, f / ev.flash), j = (Math.random() - 0.5) * 3 * k; R(58 + j, 122, 108, 32, dark); R(60 + j, 124, 104, 28, fl ? col : body); if (!fl) R(60 + j, 140, 104, 4, band); }
    else { const k = Math.min(1, (f - ev.lid_off) / 8); c.save(); c.translate((150 + 20 * k) * s, (130 - 40 * Math.sin(k * Math.PI) + 40 * k) * s); c.rotate(k * 1.4); c.fillStyle = dark; c.fillRect(-54 * s, -16 * s, 108 * s, 32 * s); c.fillStyle = body; c.fillRect(-52 * s, -14 * s, 104 * s, 28 * s); c.fillStyle = band; c.fillRect(-52 * s, 2 * s, 104 * s, 4 * s); c.restore(); R(64, 152, 96, 6, col); } };
  const procTrack = (j, n, f) => { const ev = proc.ev, st = ev.items_out + j * 2; if (f < st) return null; const k = Math.min(1, (f - st) / 12), sx = 112 + (j - (n - 1) / 2) * Math.min(26, 180 / Math.max(1, n)), sy = 70 - Math.sin((j + 0.5) / n * Math.PI) * 14;
    return [112 + (sx - 112) * k, 150 + (sy - 150) * k - Math.sin(k * Math.PI) * 40 + (f > ev.idle_start ? Math.sin((f + j * 5) / 4) * 1.5 : 0)]; };
  // ---- кадр ----
  const step = (now) => {
    if (dead) return;
    const fps = A?.fps || 24, f = Math.floor((now - t0) / 1000 * fps), ev = A ? A.open.events : proc.ev, nOpen = A ? A.open.frames : proc.frames;
    if (phase === 'open' || phase === 'idle') {
      if (skip && f < ev.idle_start) t0 = now - ev.idle_start / fps * 1000;
      const fr = f < nOpen ? f : nOpen + ((f - nOpen) % (A?.idle?.frames || 24));
      // события художника → эффекты
      if (f >= 2 && f < ev.flash) { shake = Math.max(shake, (f / ev.flash) * (1 + power * 5) * S); if (cursed && Math.random() < 0.3 + power * 0.4) smoke(CX, CY - 30 * S, 1); }
      if (!step.fl && f >= ev.flash) { step.fl = 1; flash = 1; shake = (4 + power * 10) * S; burst(CX, CY - 60 * S, 24 + power * 70, col, 3 + power * 5); if (cursed) { crack(); smoke(CX, CY - 40 * S, 30 + power * 40, 1.3); } opts.onEvent?.('flash'); }
      if (!step.lo && f >= ev.lid_off) { step.lo = 1; burst(CX + 30 * S, CY - 90 * S, 14 + power * 20, '#5b3b22', 4, 1.5); burst(CX, CY - 90 * S, 10, '#1a1626', 3); opts.onEvent?.('lid_off'); }
      if (!step.io && f >= ev.items_out) { step.io = 1; opts.onEvent?.('items_out'); cap.innerHTML = `<b style="color:${esc(col)}">${esc(chest.name || 'Сундук')}</b><span>${items.length ? `${items.length} ${plural(items.length)}` : 'пусто'}</span>${best ? `<em style="color:${rcol(best)}">Лучшее: ${esc(card(best.id)?.name || best.id)}${best.c ? ' ☠' : ''}${best.e ? ' ✦' : ''}</em>` : ''}`; cap.classList.add('in'); }
      if (f >= ev.idle_start && phase === 'open') { phase = 'idle'; step.idleAt = now; opts.onEvent?.('idle_start'); }
      if (phase === 'idle' && now - step.idleAt > (skip ? 0 : 900 + Math.min(1400, items.length * 60))) toTargets();
      // сундук
      if (A) { const sh = A.sheet, i = (A.open.start || 0) + fr; cx.imageSmoothingEnabled = false; cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(A.img, (i % sh.cols) * sh.frameW, Math.floor(i / sh.cols) * sh.frameH, sh.frameW, sh.frameH, 0, 0, sh.frameW * S, sh.frameH * S); }
      else drawProc(fr);
      // иконки вещей по трекам художника (позиция центра в координатах кадра)
      const tr = A?.items || [];
      for (const o of els) { let p = null; const wave = tr.length ? Math.floor(o.j / tr.length) : 0, T = tr.length ? tr[o.j % tr.length] : null;
        if (T) { const ff = fr - wave * 3; const q = T.track[Math.max(0, Math.min(T.track.length - 1, ff))]; if (q && ff >= 0) p = [q[0] + (wave ? (wave % 2 ? 1 : -1) * Math.ceil(wave / 2) * 9 : 0), q[1] - wave * 15]; }
        else p = procTrack(o.j, els.length, fr);
        if (p) { if (o.e.style.display === 'none') { o.e.style.display = ''; const g = rord(items[o.i]); burst(CX + (p[0] - 112) * S, CY + (p[1] - 211) * S, 6 + g * 6, rcol(items[o.i]), 2 + g * 0.6); if (g >= 4) shake = Math.max(shake, 3 * S); }
          o.e.style.transform = `translate(${p[0] * S}px, ${p[1] * S}px) translate(-50%, -50%) scale(${S >= 2 ? 1.25 : 1})`; }
      }
    } else if (phase === 'fly') {
      let all = true;
      for (const o of els) { const k = Math.max(0, Math.min(1, (now - flyT - o.delay) / 380)); if (k < 1) all = false; const e = k * k * (3 - 2 * k), x = o.from.x + (o.to.x - o.from.x) * e, y = o.from.y + (o.to.y - o.from.y) * e - Math.sin(e * Math.PI) * 60;
        o.e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - 0.15 * e})`;
        if (k >= 1 && !o.flown) { o.flown = true; opts.onLand?.(o.i); burst(o.to.x, o.to.y, 8, rcol(items[o.i]), 2, 0.5); o.e.style.display = 'none'; } }
      root.classList.add('fade');
      if (all && !parts.length) { finishFly(); return; }
      if (all && now - flyT > 1600) { finishFly(); return; }
    }
    // частицы / вспышка / трещины / тряска
    ptx.clearRect(0, 0, W, H);
    if (flash > 0) { ptx.globalAlpha = flash * 0.38; ptx.fillStyle = col; ptx.fillRect(0, 0, W, H); ptx.globalAlpha = 1; flash = Math.max(0, flash - 0.08); }
    for (const c of cracks) { ptx.strokeStyle = '#05040a'; ptx.lineWidth = c.w * 2; ptx.beginPath(); c.pts.forEach(([x, y], k) => (k ? ptx.lineTo(x, y) : ptx.moveTo(x, y))); ptx.stroke(); ptx.strokeStyle = col; ptx.lineWidth = Math.max(1, c.w - 1); ptx.stroke(); }
    if (cursed && phase !== 'fly' && step.fl && Math.random() < 0.35 + power * 0.4) smoke(CX, CY - 10 * S, 1);
    for (let k = parts.length - 1; k >= 0; k--) { const p = parts[k]; p.t++; p.vy += p.g; p.x += p.vx; p.y += p.vy; if (p.smoke) p.s += 0.06 * S; if (p.t > p.life) { parts.splice(k, 1); continue; }
      ptx.globalAlpha = p.smoke ? Math.min(0.85, (1 - p.t / p.life) * 1.2) : 1; ptx.fillStyle = p.c; const z = Math.round(p.s); ptx.fillRect(Math.round(p.x), Math.round(p.y), z, z); }
    ptx.globalAlpha = 1;
    if (shake > 0.3 && !REDUCED) { shEl.style.transform = `translate(${Math.round((Math.random() - 0.5) * shake)}px, ${Math.round((Math.random() - 0.5) * shake)}px)`; shake *= 0.86; } else { shEl.style.transform = ''; shake = 0; }
    requestAnimationFrame(step);
  };
  cap.innerHTML = `<b style="color:${esc(col)}">${esc(chest.name || 'Сундук')}</b><span>Открываем…</span>`;
  openAnim(art).then((a) => { A = a; if (dead) return; t0 = performance.now(); root.dataset.run = a ? 'art' : 'proc'; requestAnimationFrame(step); });
  if (extra > 0) { const x = document.createElement('div'); x.className = 'bc-more'; x.textContent = `+${extra}`; root.appendChild(x); }
  return { root, skip: onSkip, stop: finish };
}
const plural = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'вещь' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'вещи' : 'вещей'; };
/** «пуф» опустевшего сундука: серый пиксельный дым из прямоугольника r (DOMRect), без свечения */
export function poof(r, host = document.body) {
  const c = document.createElement('canvas'), W = Math.round(r.width + 120), H = Math.round(r.height + 120); c.width = W; c.height = H; c.className = 'bc-poof'; c.style.left = r.left - 60 + 'px'; c.style.top = r.top - 60 + 'px'; host.appendChild(c);
  const x = c.getContext('2d'), P = []; for (let k = 0; k < 46; k++) { const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 2.2; P.push({ x: W / 2 + (Math.random() - 0.5) * r.width * 0.6, y: H / 2 + (Math.random() - 0.5) * r.height * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, s: 3 + Math.random() * 5, c: ['#d6d3d1', '#a8a29e', '#78716c', '#57534e'][k % 4] }); }
  let t = 0; const tick = () => { t++; x.clearRect(0, 0, W, H); for (const p of P) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy = p.vy * 0.94 - 0.03; p.s += 0.25; x.globalAlpha = Math.max(0, 1 - t / 34); x.fillStyle = p.c; const z = Math.round(p.s); x.fillRect(Math.round(p.x - z / 2), Math.round(p.y - z / 2), z, z); } if (t < 34) requestAnimationFrame(tick); else c.remove(); };
  requestAnimationFrame(tick);
}
