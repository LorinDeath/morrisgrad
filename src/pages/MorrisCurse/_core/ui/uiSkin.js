// Интерфейс «проклятое + очернённое»: тема поверх старых стилей (styles/ui-cursed.css), включается классом html.mc-ui.
// - Кит Художника (/mc-ui/*.png, 1 px арта = 2 CSS px): рамки 9-slice, слоты, кнопки, полоски.
// - Металл рамок перекрашивается под локацию: серый слой <name>_tint.png → градиент-карта в цвет T, поверх <name>_fixed.png
//   (контур, true black, фиолетовые швы — не тонируются). T = mix(проклятый #8a6aa6, --mc-biome, biomeMix%).
//   --mc-biome/data-biome ставит atmosphere.js (как и раньше) — здесь только слушаем и пересобираем куски (раз на смену биома).
// - Забег (режим «выживание») тему не получает: setUiMode('run') снимает html.mc-ui — там всё как было.
// - Настройки — админка «🎨 Интерфейс» (meta_state.ui): вкл/выкл, глитч 0/1/2, доля цвета локации, застёжки, аватары.
export const UI_BASE = '/mc-ui/';
export const UI = { on: true, glitch: 1, biomeMix: 60, ornaments: true, avatarCursedAt: 25, avatars: true };
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
function applyClasses() {
  const c = document.documentElement.classList, on = uiActive();
  c.toggle('mc-ui', on); c.toggle('mc-ui-orn', on && UI.ornaments);
  document.documentElement.dataset.uiGlitch = on ? String(UI.glitch) : '0';
}
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
