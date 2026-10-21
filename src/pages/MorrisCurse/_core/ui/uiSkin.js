// Интерфейс «проклятое + очернённое»: тема поверх старых стилей (styles/ui-cursed.css), включается классом html.mc-ui.
// - Кит Художника (/mc-ui/*.png, 1 px арта = 2 CSS px): рамки 9-slice, слоты, кнопки, полоски.
// - Металл рамок перекрашивается под локацию: серый слой <name>_tint.png → градиент-карта в цвет T, поверх <name>_fixed.png
//   (контур, true black, фиолетовые швы — не тонируются). T = mix(проклятый #8a6aa6, --mc-biome, biomeMix%).
//   --mc-biome/data-biome ставит atmosphere.js (как и раньше) — здесь только слушаем и пересобираем куски (раз на смену биома).
// - Забег (режим «выживание») тему не получает: setUiMode('run') снимает html.mc-ui — там всё как было.
// - Настройки — админка «🎨 Интерфейс» (meta_state.ui): вкл/выкл, глитч 0/1/2, доля цвета локации, застёжки, аватары.
export const UI_BASE = '/mc-ui/';
export const UI = { on: true, glitch: 1, biomeMix: 60, ornaments: true, avatarCursedAt: 25, avatars: true, hudIngame: true, hudOldDefault: false, mmMobile: true, mmSize: 176,
  mmX: 10, mmY: 10, mmZoom: 1, mmRound: true, tgtSide: 'left', tgtTop: 100, tgtHide: 0, plate: 88,
  atmo: true, vig: 45, grade: 30, parts: 50, atmoMobile: 40, partsMobile: 60, loc: {}, sfx: true, sfxVol: 40, trans: true, transMs: 160, loadScreen: true,
  texPc: '32', texMobile: '16' };
const CURSED = '#8a6aa6';
const TINTABLE = ['frame_window', 'frame_panel', 'frame_small', 'frame_tooltip', 'corner_tl', 'corner_tr', 'corner_bl', 'corner_br',
  'divider_h', 'divider_v', 'divider_ornament', 'slot_normal_normal', 'slot_normal_hover', 'slot_normal_selected',
  'button_normal', 'button_hover', 'button_pressed', 'bar_frame'];
const hex = (h) => { h = String(h || '').trim().replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mixHex = (a, b, k) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); };
const K1 = [0x1a, 0x16, 0x26], HI = [236, 226, 240];
// градиент-карта кита (README «Для Мэл»): тени уходят в контур #1a1626, свет — к #ece2f0
function ramp(L, T) {
  const x = L / 255, hi = T.map((t, i) => t + (HI[i] - t) * 0.55);
  return x <= 0.6 ? T.map((t, i) => K1[i] + (t - K1[i]) * (x / 0.6)) : T.map((t, i) => t + (hi[i] - t) * ((x - 0.6) / 0.4));
}
const imgs = new Map();
const load = (src) => { if (!imgs.has(src)) imgs.set(src, new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = err; im.src = src; })); return imgs.get(src); };
const cache = new Map();
async function tintPiece(name, color) {
  const key = name + color; if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const [t, f] = await Promise.all([load(UI_BASE + name + '_tint.png'), load(UI_BASE + name + '_fixed.png')]);
    const c = document.createElement('canvas'); c.width = t.width; c.height = t.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    g.drawImage(t, 0, 0); const d = g.getImageData(0, 0, c.width, c.height), a = d.data, T = hex(color), lut = {};
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      const L = a[i], v = lut[L] || (lut[L] = ramp(L, T).map(Math.round));
      a[i] = v[0]; a[i + 1] = v[1]; a[i + 2] = v[2]; a[i + 3] = 255;
    }
    g.putImageData(d, 0, 0); g.drawImage(f, 0, 0);
    return c.toDataURL('image/png');
  })();
  cache.set(key, p); return p;
}
let curT = '', want = '', busy = false;
// металл рамок под локацию; вызывается при смене --mc-biome (MutationObserver) и при правке biomeMix в админке
async function retint() {
  const root = document.documentElement, b = root.dataset.biome ? getComputedStyle(root).getPropertyValue('--mc-biome').trim() : '';
  const T = b ? mixHex(CURSED, b, UI.biomeMix / 100) : CURSED;
  want = T; if (busy || T === curT) return; busy = true;
  try {
    const urls = await Promise.all(TINTABLE.map((n) => tintPiece(n, T)));
    const rs = root.style; TINTABLE.forEach((n, i) => rs.setProperty('--ui-' + n.replace(/_/g, '-'), `url(${urls[i]})`));
    rs.setProperty('--ui-metal', T); rs.setProperty('--ui-metal-hi', toHex(ramp(200, hex(T)))); rs.setProperty('--ui-metal-lo', toHex(ramp(104, hex(T))));
    curT = T;
  } catch (e) { console.warn('ui-skin: кит не загрузился, остаются CSS-рамки', e); curT = T; }
  busy = false; if (want !== curT) retint();
}
let mode = 'hub', inited = false;
// выбор игрока «Интерфейс: новый / старый» — на этом устройстве (localStorage); админка может выключить новый для всех
const PREF_KEY = 'mc_ui_theme';
let pref = (() => { try { return localStorage.getItem(PREF_KEY) === 'old' ? 'old' : 'new'; } catch (_) { return 'new'; } })();
export const uiPref = () => pref;
export const uiActive = () => UI.on && pref === 'new' && mode !== 'run';
export function setUiPref(v) { pref = v === 'old' ? 'old' : 'new'; try { localStorage.setItem(PREF_KEY, pref); } catch (_) {} applyClasses(); }
// «Старые панели: Вкл/Выкл» — боковые колонки HUD (как раньше) или всё внутри игрового поля (круглая мини-карта, цель,
// компактные кнопки). На этом устройстве; пока игрок не выбрал — по умолчанию из админки (hudOldDefault).
// Внутриигровой HUD — только с новым интерфейсом и не в забеге: старая тема и забег = прежние колонки без изменений.
const HUD_KEY = 'mc_hud_old';
let hudPref = (() => { try { const v = localStorage.getItem(HUD_KEY); return v === '1' ? true : v === '0' ? false : null; } catch (_) { return null; } })();
export const hudOldPanels = () => (hudPref == null ? !!UI.hudOldDefault : hudPref);
export const hudIngame = () => uiActive() && !!UI.hudIngame && !hudOldPanels();
export function setHudOldPanels(v) { hudPref = !!v; try { localStorage.setItem(HUD_KEY, hudPref ? '1' : '0'); } catch (_) {} applyClasses(); }
let hudWas = null;
function applyClasses() {
  const c = document.documentElement.classList, on = uiActive();
  c.toggle('mc-ui', on); c.toggle('mc-ui-orn', on && UI.ornaments);
  document.documentElement.dataset.uiGlitch = on ? String(UI.glitch) : '0';
  const ig = hudIngame(); c.toggle('mc-hud-ig', ig);
  const rs = document.documentElement.style, cl = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
  rs.setProperty('--ig-mm', cl(UI.mmSize, 120, 240, 176) + 'px');
  rs.setProperty('--ig-mm-x', cl(UI.mmX, 0, 200, 10) + 'px'); rs.setProperty('--ig-mm-y', cl(UI.mmY, 0, 200, 10) + 'px'); rs.setProperty('--ig-tgt-top', cl(UI.tgtTop, 40, 500, 100) + 'px'); rs.setProperty('--ui-plate', (cl(UI.plate, 50, 100, 88) / 100).toFixed(2));
  c.toggle('mc-ig-sq', UI.mmRound === false);
  document.documentElement.dataset.igTgt = ['left', 'center', 'right'].includes(UI.tgtSide) ? UI.tgtSide : 'left';
  if (ig !== hudWas) { hudWas = ig; window.dispatchEvent(new CustomEvent('mc-hud-ig', { detail: ig })); }
  // плавные окна (overlay.showScreen/hideScreen) — класс на <html>; длительность из админки
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  c.toggle('mc-atmo-tr', on && !!UI.trans && !reduce);
  document.documentElement.style.setProperty('--mc-tr', (Math.max(60, Math.min(400, Number(UI.transMs) || 160)) | 0) + 'ms');
  window.dispatchEvent(new CustomEvent('mc-ui-cfg', { detail: on })); // атмосфера интерфейса (ui/atmoUi.js) пересобирается
}
/** окна открываются/закрываются плавно (новый интерфейс, не в забеге, админка «trans», без prefers-reduced-motion) */
export const uiTrans = () => document.documentElement.classList.contains('mc-atmo-tr');
export function initUiSkin() {
  if (inited) return; inited = true;
  applyClasses(); retint();
  // atmosphere.js меняет data-biome и --mc-biome на <html> — ловим это без опроса в кадре
  new MutationObserver(() => retint()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-biome', 'style'] });
}
export function setUiMode(m) { if (m === mode) return; mode = m; applyClasses(); }
export function setUiCfg(c) {
  if (!c || typeof c !== 'object') return;
  const mix = UI.biomeMix;
  for (const k of Object.keys(UI)) if (c[k] != null) UI[k] = c[k];
  // экран загрузки показывается до прихода настроек с сервера — запоминаем выбор админки на следующую загрузку
  try { localStorage.setItem('mc_ui_load', UI.on !== false && UI.loadScreen !== false ? '1' : '0'); } catch (_) {}
  // «Текстуры» по умолчанию для ПК/телефона (worlds/texPref.js texDefault) — тоже до прихода настроек, со следующей загрузки
  try { localStorage.setItem('mc_tex_def', JSON.stringify({ pc: UI.texPc === '16' ? '16' : '32', mob: UI.texMobile === '32' ? '32' : '16' })); } catch (_) {}
  applyClasses(); if (UI.biomeMix !== mix) { curT = ''; retint(); }
}
// ——— аватары (Историк, /mc-ui/avatars): 64/128 px, показываем 1:1 (без дробного масштаба) ———
const AV = { warrior: 'veles', spearman: 'nofford', rogue: 'kavega', mage: 'mariel' };
export const AV_NPC = { petr: 'petr', kyut: 'kyut', alzi: 'alzi', leyr: 'leyr' };
export function avatarId(cls) { return AV[cls] || AV_NPC[cls] || ''; }
// bk — очернение героя 0…100 (как у силуэта героя, сервер: blkVis); с порога из админки — очернённый вариант
export function avatarUrl(cls, bk = 0, size = 64) {
  const id = avatarId(cls); if (!id || !UI.avatars) return '';
  return `${UI_BASE}avatars/${id}${(Number(bk) || 0) > 0 && (Number(bk) || 0) >= UI.avatarCursedAt ? '_cursed' : ''}_${size === 128 ? 128 : 64}.png`;
}
export function avatarHtml(cls, bk = 0, size = 64, extra = '') {
  const u = avatarUrl(cls, bk, size); if (!u) return '';
  const cz = u.includes('_cursed');
  return `<span class="mc-av s${size}${cz ? ' cz' : ''} ${extra}" style="--av:url('${u}')" title="${cz ? 'Очернённый облик' : ''}"><i></i></span>`;
}
