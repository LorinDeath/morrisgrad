// Атмосфера нового интерфейса «проклятое + очернённое» (только html.mc-ui: старая тема и забег — без изменений).
//  • виньетка-«порча» по краям и тон локации — экранные CSS-слои между холстом и интерфейсом, mix-blend-mode: multiply
//    (только затемняют/окрашивают, спрайты не высветляют — никакой белёсой дымки поверх пиксель-арта);
//  • частицы интерфейса (пепел, снег, угли, споры…) — маленький 2D-холст, пиксельные точки с прозрачностью, центр
//    экрана (герой) чистый; на телефоне — слабее/реже (админка atmoMobile, 0 — выкл);
//  • звуки интерфейса — синтез WebAudio (без файлов): клик, открытие и закрытие окна; громкость — Настройки (у игрока),
//    по умолчанию — админка; общий «🔊 Звук: выключен» глушит и их;
//  • экран загрузки — loadingHtml()/setLoadStep() (game.js).
// Локация — atmo.moodKey (engine/atmosphere.js), читаем без правок движка.
import { UI, uiActive } from './uiSkin.js';
import { atmo } from '../engine/atmosphere.js';

// цвет «порчи» по краям (тёмный, насыщенный) и тон (светлый — multiply почти не темнит, только окрашивает); частицы
const MOOD = {
  hub: { vig: '#2e1450', tone: '#d9ccff', p: 'ash' }, meadow: { vig: '#241a4e', tone: '#dcd8ff', p: 'ash' },
  grove: { vig: '#10301f', tone: '#d4f0dc', p: 'spores' }, garden: { vig: '#40141f', tone: '#ffd9cc', p: 'petals' },
  waste: { vig: '#122244', tone: '#d0ddff', p: 'dust' }, ridge: { vig: '#1c2236', tone: '#dbe1f2', p: 'dust' },
  rot: { vig: '#243010', tone: '#e2f0c4', p: 'spores' }, pylon: { vig: '#22184a', tone: '#ddd6ff', p: 'ash' },
  glitch: { vig: '#0c3018', tone: '#cff5dc', p: 'spores' }, crater: { vig: '#1a1c36', tone: '#e0e2ff', p: 'dust' },
  thin: { vig: '#341c44', tone: '#ecdcff', p: 'ash' },
  b_ice: { vig: '#132a4c', tone: '#d6e6ff', p: 'snow' }, b_fire: { vig: '#0a1650', tone: '#ccd8ff', p: 'embers' },
  b_stone: { vig: '#1e2026', tone: '#e4e6ec', p: 'dust' }, b_air: { vig: '#220c44', tone: '#e4d4ff', p: 'stars' },
};
// частицы: цвета (без белого «света» — приглушённые), размер px, скорость падения (px/с, <0 — вверх), покачивание, мерцание
const PART = {
  ash: { col: ['#8a6aa6', '#5b3f7a', '#b39ad1'], s: [2, 3], fall: -9, sway: 14, blink: 0.3, a: 0.55 },
  spores: { col: ['#9fbf4a', '#6f8f34', '#c4dc7a'], s: [2, 3], fall: -6, sway: 10, blink: 0.6, a: 0.5 },
  petals: { col: ['#d9788f', '#b0506a', '#f0a0b0'], s: [2, 4], fall: 16, sway: 22, blink: 0, a: 0.55 },
  dust: { col: ['#8a94aa', '#5e6678', '#a8b0c4'], s: [1, 2], fall: 3, sway: 8, blink: 0, a: 0.45 },
  snow: { col: ['#c4d6f2', '#9fb4d8', '#d8a0ac'], s: [2, 3], fall: 20, sway: 16, blink: 0, a: 0.5 },
  embers: { col: ['#4f7dff', '#7aa8ff', '#3858c8'], s: [2, 3], fall: -18, sway: 10, blink: 0.8, a: 0.6 },
  stars: { col: ['#b49cf0', '#8a7ad8', '#d8c8ff'], s: [1, 2], fall: 0, sway: 2, blink: 1, a: 0.6 },
};
const MAXN = 70; // частиц на ПК при parts = 100%

let host = null, root = null, vigEl = null, crackEl = null, toneEl = null, cv = null, g = null, mobile = false, ps = [], kind = '', moodKey = '', raf = 0, last = 0, W = 0, H = 0;
const k = () => (mobile ? (Number(UI.atmoMobile) || 0) / 100 : 1); // сила на этом устройстве
const on = () => uiActive() && UI.atmo !== false && k() > 0;

/** host — родитель холста (.game-screen / контейнер 3D); слои — над холстом и мрачной дымкой, под интерфейсом */
export function initAtmoUi(canvas, { mobile: mob = false } = {}) {
  if (root || !canvas?.parentElement) return;
  host = canvas.parentElement; mobile = !!mob;
  // слои — соседи холста (как у grim.js), каждый с z-index: так multiply смешивается с самим холстом;
  // внутри общей обёртки со своим контекстом наложения он смешался бы с пустотой и высветлил кадр
  const mk = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = 'mc-atmo-ui ' + cls; e.setAttribute('aria-hidden', 'true'); return e; };
  root = [toneEl, vigEl, crackEl, cv] = [mk('tone'), mk('vig'), mk('crk'), mk('parts', 'canvas')];
  const layer = host.querySelector(':scope > .mc3d-layer');
  root.forEach((e) => host.insertBefore(e, layer || null));
  g = cv.getContext('2d');
  window.addEventListener('mc-ui-cfg', apply); window.addEventListener('resize', size);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
  initSfx();
  apply();
}
function size() { if (!cv) return; const r = host.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height)); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } }
function apply() {
  if (!root) return;
  const vis = on();
  root.forEach((e) => { e.style.display = vis ? '' : 'none'; });
  if (!vis) { cancelAnimationFrame(raf); raf = 0; return; }
  moodKey = ''; size(); loop();
}
// локация для админки (сила по локациям, % от общих): Поляна, четыре края Аринара, прочие края
const locOf = (key) => (key === 'hub' ? 'hub' : key === 'b_ice' ? 'ice' : key === 'b_fire' ? 'fire' : key === 'b_stone' ? 'stone' : key === 'b_air' ? 'air' : 'arinar');
const locK = (key, f) => { const v = Number(UI.loc?.[locOf(key)]?.[f]); return Number.isFinite(v) ? Math.max(0, Math.min(200, v)) / 100 : 1; };
function setMood(key) {
  moodKey = key; const M = MOOD[key] || MOOD.hub, s = k();
  const vig = Math.min(1, (Number(UI.vig) || 0) / 100 * s * locK(key, 'vig')), grade = Math.min(1, (Number(UI.grade) || 0) / 100 * s * locK(key, 'grade'));
  vigEl.style.background = `radial-gradient(ellipse 78% 72% at 50% 50%, transparent 58%, ${M.vig} 100%)`;
  vigEl.style.opacity = vig.toFixed(3);
  crackEl.style.opacity = (vig * 0.35).toFixed(3);
  // тон: смесь белого и светлого цвета локации; multiply с почти белым — лёгкий оттенок без потери яркости
  toneEl.style.backgroundColor = M.tone; toneEl.style.opacity = (grade * 0.6).toFixed(3);
  toneEl.dataset.mood = key;
  const pk = M.p; if (pk !== kind) { kind = pk; ps = []; }
}
function spawn(P, any) {
  const s = P.s[0] + Math.floor(Math.random() * (P.s[1] - P.s[0] + 1));
  return { x: Math.random() * W, y: any ? Math.random() * H : P.fall > 0 ? -4 : P.fall < 0 ? H + 4 : Math.random() * H,
    s, c: P.col[Math.floor(Math.random() * P.col.length)], ph: Math.random() * 6.28, v: 0.6 + Math.random() * 0.8, life: 0, max: 6 + Math.random() * 10 };
}
function loop() {
  if (raf || !root || document.hidden) return;
  const step = (now) => {
    raf = 0; if (!on() || document.hidden) return;
    raf = requestAnimationFrame(step);
    if (now - last < 33) return; // ~30 кадров/с — частицам хватает
    const dt = Math.min(0.1, (now - last) / 1000 || 0.033); last = now;
    const key = atmo.moodKey || 'hub';
    if (key !== moodKey) setMood(key);
    if (cv.width !== W || !W) size();
    draw(dt, now / 1000);
  };
  raf = requestAnimationFrame(step);
}
function draw(dt, T) {
  const P = PART[kind] || PART.ash, pm = mobile ? Math.max(0, Math.min(100, Number(UI.partsMobile) || 0)) / 100 : 1;
  const n = Math.min(MAXN * 2, Math.round(MAXN * (Number(UI.parts) || 0) / 100 * k() * pm * locK(moodKey, 'parts')));
  g.clearRect(0, 0, W, H);
  if (!n) return;
  while (ps.length < n) ps.push(spawn(P, true));
  if (ps.length > n) ps.length = n;
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.5;
  for (let i = 0; i < ps.length; i++) {
    let p = ps[i];
    p.life += dt;
    p.y += P.fall * p.v * dt; p.x += Math.sin(T * 0.6 + p.ph) * P.sway * dt;
    if (p.y < -8 || p.y > H + 8 || p.x < -8 || p.x > W + 8 || (P.fall === 0 && p.life > p.max)) { p = ps[i] = spawn(P, P.fall === 0); }
    // центр (герой, бой) чистый: прозрачность растёт к краям
    const d = Math.hypot((p.x - cx) / R, (p.y - cy) / R), edge = Math.max(0, Math.min(1, (d - 0.35) / 0.45));
    const fade = Math.min(1, p.life / 1.2) * (P.fall === 0 ? Math.min(1, (p.max - p.life) / 1.2) : 1);
    const bl = P.blink ? 1 - P.blink * 0.5 * (1 + Math.sin(T * (1.5 + p.v) + p.ph * 3)) : 1;
    const a = P.a * edge * fade * bl; if (a < 0.02) continue;
    g.globalAlpha = a; g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  g.globalAlpha = 1;
}

// ——— звуки интерфейса (WebAudio, синтез) ———
const SFX_KEY = 'mc_ui_sfx';
export function sfxVol() { try { const v = localStorage.getItem(SFX_KEY); if (v != null && Number.isFinite(Number(v))) return Math.max(0, Math.min(100, Number(v))); } catch (_) {} return Math.max(0, Math.min(100, Number(UI.sfxVol) || 0)); }
export function setSfxVol(v) { try { localStorage.setItem(SFX_KEY, String(Math.round(Math.max(0, Math.min(100, Number(v) || 0))))); } catch (_) {} }
const soundAllowed = () => { try { return localStorage.getItem('mc-sound') !== '0'; } catch (_) { return true; } };
let ac = null, noise = null, lastPlay = {};
function ctx() {
  if (ac) return ac;
  const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
  try { ac = window.__mcAC || (window.__mcAC = new A()); } catch (_) { return null; } // общий с boot/audioUnlock.js (разблокирован первым жестом)
  const b = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b; return ac;
}
/** звук интерфейса: 'click' | 'open' | 'close' | 'deny' */
export function uiSfx(kind) {
  if (!uiActive() || UI.sfx === false || !soundAllowed()) return;
  const vol = sfxVol() / 100; if (vol <= 0) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // до первого жеста браузер звук не даст
  const now = performance.now(); if (now - (lastPlay[kind] || 0) < 45) return; lastPlay[kind] = now;
  const c = ctx(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t = c.currentTime + 0.005, out = c.createGain(); out.gain.value = vol * 0.5; out.connect(c.destination);
  const tone = (f0, f1, dur, type = 'sine', gain = 0.5) => {
    const o = c.createOscillator(), e = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(gain, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e).connect(out); o.start(t); o.stop(t + dur + 0.02);
  };
  const hiss = (f0, f1, dur, gain = 0.4, q = 1.2) => {
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), e = c.createGain(); s.buffer = noise;
    bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(e).connect(out); s.start(t); s.stop(t + dur + 0.02);
  };
  if (kind === 'click') { tone(420, 260, 0.045, 'triangle', 0.35); hiss(2400, 1200, 0.03, 0.18, 2); }
  else if (kind === 'open') { hiss(300, 1400, 0.18, 0.32, 0.9); tone(150, 230, 0.16, 'sine', 0.3); }
  else if (kind === 'close') { hiss(1200, 260, 0.14, 0.26, 0.9); tone(210, 130, 0.12, 'sine', 0.25); }
  else if (kind === 'deny') { tone(140, 110, 0.12, 'square', 0.12); }
}
const CLICKABLE = 'button, .mc3d-tbtn, .mc-btn, [data-act], .mc3d-choice, .mc3d-class, .mc-aslot, .mc-abil, .mc-tal';
function initSfx() {
  // клики по интерфейсу игры (кнопки окон, HUD, панели) — одним делегатом; холст и чат не звучат
  document.addEventListener('pointerdown', (e) => {
    const el = e.target?.closest?.(CLICKABLE); if (!el) return;
    if (!el.closest('.mc3d-layer, .game-hud-panel, .mc-ighud, .game-screen')) return;
    uiSfx(el.disabled || el.getAttribute('aria-disabled') === 'true' ? 'deny' : 'click');
  }, { capture: true, passive: true });
}

// ——— экран загрузки (новый интерфейс) ———
const HINTS = ['Вода и лава непроходимы — ищите берега и мостки.',
  'Проклятая земля растёт день за днём.',
  'Аринар делится на края: лёд, огонь, камень и воздух.',
  'Очернение героя видно по облику — и по аватару.',
  'На ПК клавиша ? — подсказка по управлению.'];
const STEPS = ['Пробуждение мира…', 'Спрайты и атласы…', 'Свет и тени…', 'Врата открываются…'];
export const loadScreenOn = () => { if (!uiActive()) return false; try { return localStorage.getItem('mc_ui_load') !== '0'; } catch (_) { return true; } };
export function loadingHtml() {
  const hint = HINTS[Math.floor(Math.random() * HINTS.length)];
  return `<div class="mc-load"><div class="sig" aria-hidden="true"><i></i><b></b><s></s></div><h2>ПРОКЛЯТЫЕ</h2>
    <div class="bar"><span style="width:6%"></span></div><p class="st">${STEPS[0]}</p><p class="hint">${hint}</p></div>`;
}
/** шаг загрузки 0…STEPS.length (последний — 100%) */
export function setLoadStep(i, scr = document) {
  const el = scr?.querySelector?.('.mc-load'); if (!el) return;
  const n = STEPS.length, f = Math.max(0, Math.min(1, (i + 1) / n));
  const bar = el.querySelector('.bar > span'); if (bar) bar.style.width = Math.round(6 + 94 * f) + '%';
  const st = el.querySelector('.st'); if (st && STEPS[i]) st.textContent = STEPS[i];
}
