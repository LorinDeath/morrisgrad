// «🔍 Размер интерфейса» — масштаб HUD, окон и кнопок на этом устройстве (обе темы; забег не трогаем).
//  • выбор игрока хранится отдельно для телефона и ПК (localStorage mc_ui_scale_mob / mc_ui_scale_pc);
//  • по умолчанию — админка (scalePc, scaleMobile; 0 у телефона — «авто» по размеру экрана), пределы scaleMin…scaleMax;
//  • фактический масштаб не больше того, при котором интерфейс помещается в поле (fitMax по размеру поля) — ничего не
//    уезжает за край и не наезжает друг на друга; ползунок показывает и выбранный, и фактический;
//  • реализация — CSS zoom на корнях интерфейса (styles/ui-cursed.css §11): вёрстка сама пересчитывается, пиксель-арт
//    (image-rendering: pixelated) остаётся чётким; тач-кнопки и джойстик — не меньше 100% (цель для пальца ≥ 44 px).
import { UI, uiMode } from './uiSkin.js';

const isMobile = () => { try { const ua = navigator.userAgent || ''; return /Mobi|Android|iPhone|iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches) || /[?&]mobile=1/.test(location.search); } catch (_) { return false; } };
let MOB = isMobile();
let KEY = MOB ? 'mc_ui_scale_mob' : 'mc_ui_scale_pc';
const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r5 = (v) => Math.round(v * 20) / 20;

export const uiScaleMobile = () => MOB;
export const uiScaleKey = () => KEY;
export function uiScaleRange() {
  const lo = cl(Number(UI.scaleMin) || 70, 50, 100), hi = cl(Number(UI.scaleMax) || 150, 100, 200);
  return { min: lo, max: Math.max(lo, hi) };
}
/** авто для телефона: по короткой стороне экрана (CSS px) и плотности — маленький экран чуть мельче, большой — крупнее */
export function uiScaleAuto() {
  const sw = Math.min(screen?.width || innerWidth, screen?.height || innerHeight) || 390, dpr = devicePixelRatio || 1;
  let s = cl(sw / 400, 0.85, 1.1);
  if (dpr < 2 && sw >= 400) s = Math.min(s, 1); // планшеты/низкая плотность — без укрупнения
  return Math.round(r5(s) * 100);
}
export function uiScaleDefault() {
  const { min, max } = uiScaleRange();
  const d = MOB ? (Number(UI.scaleMobile) || 0) || uiScaleAuto() : Number(UI.scalePc) || 100;
  return cl(Math.round(d), min, max);
}
export function uiScalePref() { try { const v = localStorage.getItem(KEY); if (v != null && Number.isFinite(Number(v))) return Number(v); } catch (_) {} return null; }
export function uiScaleChosen() { const { min, max } = uiScaleRange(), v = uiScalePref(); return v == null ? uiScaleDefault() : cl(Math.round(v), min, max); }
/** null — вернуть «по умолчанию» (авто на телефоне) */
export function setUiScale(v) { try { if (v == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(Math.round(v))); } catch (_) {} applyUiScale(); }

// больше этого масштаба интерфейс в поле не помещается (по размеру игрового поля, CSS px). Опорные размеры подобраны
// плейтестом ui-scale (все корни HUD внутри поля и без наложений на 360×640…1920×1080, обе ориентации)
const REF = { pc: [760, 480], land: [600, 312], port: [330, 520] };
let field = null;
export function uiScaleFitMax() {
  const r = (field || document.querySelector('.mc3d-layer'))?.getBoundingClientRect();
  const W = r?.width || innerWidth, H = r?.height || innerHeight;
  const ref = !MOB ? REF.pc : W >= H ? REF.land : REF.port;
  return Math.max(50, Math.floor(Math.min(W / ref[0], H / ref[1]) * 20) * 5); // шаг 5%
}
let eff = 100, touch = 100, lastSig = '';
export const uiScaleEffective = () => eff;
/** масштаб тач-управления (джойстик, тач-кнопки): не меньше 1 */
export const uiTouchScale = () => touch / 100;
export function applyUiScale() {
  const root = document.documentElement, on = uiMode() !== 'run';
  const want = uiScaleChosen(), fit = uiScaleFitMax();
  eff = on ? Math.min(want, fit) : 100;
  touch = Math.max(100, eff);
  const sig = `${on && eff !== 100}|${eff}|${touch}`;
  if (sig === lastSig) return; // ничего не поменялось — ни записи в стили, ни пересчёта раскладки (resize, ResizeObserver, mc-ui-cfg)
  lastSig = sig;
  root.classList.toggle('mc-uis', on && eff !== 100);
  root.style.setProperty('--ui-s', String(eff / 100)); root.style.setProperty('--ui-st', String(touch / 100));
  root.dataset.uiScale = String(eff);
  window.dispatchEvent(new CustomEvent('mc-ui-scale', { detail: { want, eff, fit } }));
}
let inited = false;
export function initUiScale(fieldEl, opt = {}) {
  field = fieldEl || null;
  if (typeof opt.mobile === 'boolean') { MOB = opt.mobile; KEY = MOB ? 'mc_ui_scale_mob' : 'mc_ui_scale_pc'; }
  if (inited) { applyUiScale(); return; } inited = true;
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => requestAnimationFrame(applyUiScale), 120); }; // пачкой, после шторма resize
  window.addEventListener('resize', later); window.addEventListener('orientationchange', later);
  window.addEventListener('mc-ui-cfg', applyUiScale); // админка (пределы/по умолчанию), смена режима (забег)
  try { new ResizeObserver(later).observe(field || document.documentElement); } catch (_) {}
  window.__mcUiScale = { set: setUiScale, get: () => ({ want: uiScaleChosen(), eff, fit: uiScaleFitMax(), touch, def: uiScaleDefault(), mobile: MOB }) }; // плейтест ui-scale
  applyUiScale();
}
