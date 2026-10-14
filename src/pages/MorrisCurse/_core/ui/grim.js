// Мрачная атмосфера: цветокоррекция и дальняя дымка поверх 3D-холста (мир, хаб, дуэли, забеги — один холст).
// Лёгкая: CSS-фильтр холста (экспозиция/насыщенность/контраст) + два слоя-градиента между холстом и интерфейсом
// (холодные тени — soft-light; дымка к краям экрана — радиальный градиент, центр с героем чистый). Без лишнего
// прохода рендера. Интерфейс (DOM поверх) не затронут. Сила — ползунки «Мрачность» и «Дымка» в Настройках (localStorage).
const KEY = { grim: 'mc-grim', fog: 'mc-fog' }, DEF = { grim: 60, fog: 50 };
export function grimGet(k) { try { const v = Number(localStorage.getItem(KEY[k])); return Number.isFinite(v) && localStorage.getItem(KEY[k]) != null ? Math.max(0, Math.min(100, v)) : DEF[k]; } catch (_) { return DEF[k]; } }
export function grimSet(k, v) { try { localStorage.setItem(KEY[k], String(Math.round(v))); } catch (_) {} applyGrim(); }
let canvas = null, tone = null, haze = null;
export function initGrim(c) {
  canvas = c; if (!c?.parentElement) return;
  // слои как atmosphere: над холстом, под интерфейсом
  const mk = (cls) => { const d = document.createElement('div'); d.className = cls; d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;'; c.insertAdjacentElement('afterend', d); return d; };
  haze = mk('mc-grim-haze'); tone = mk('mc-grim-tone'); // порядок в DOM: холст → тон → дымка → интерфейс
  applyGrim();
}
export function applyGrim() {
  if (!canvas) return;
  const g = grimGet('grim') / 100, f = grimGet('fog') / 100;
  // темнее и глуше, чуть контрастнее (снаряды/метки/свечение добычи — яркие и остаются читаемыми)
  canvas.style.filter = g > 0 ? `brightness(${(1 - 0.2 * g).toFixed(3)}) saturate(${(1 - 0.32 * g).toFixed(3)}) contrast(${(1 + 0.1 * g).toFixed(3)})` : '';
  // холодные тени, тёплый оттенок в светлом: soft-light синий снизу → тёплый у центра (там свет героя/огней)
  tone.style.background = g > 0 ? `radial-gradient(ellipse 60% 55% at 50% 52%, rgba(255,190,120,${(0.10 * g).toFixed(3)}), rgba(40,60,130,${(0.38 * g).toFixed(3)}) 75%)` : 'none';
  tone.style.mixBlendMode = 'soft-light';
  // дымка: прозрачно рядом с героем, тёмная мгла к краям (виньетка), плюс лёгкий туман сверху (дальний план)
  const a = (0.3 + 0.65 * f) * (f > 0 ? 1 : 0);
  haze.style.background = f > 0 || g > 0
    ? `radial-gradient(ellipse 75% 70% at 50% 54%, rgba(8,6,16,0) ${Math.round(42 - 14 * f)}%, rgba(8,6,16,${(a * 0.6).toFixed(3)}) 72%, rgba(6,4,12,${(Math.min(0.9, a + 0.1 * g)).toFixed(3)}) 100%),`
      + ` linear-gradient(to bottom, rgba(14,12,26,${(0.3 * f).toFixed(3)}), rgba(14,12,26,0) 35%)`
    : 'none';
}
