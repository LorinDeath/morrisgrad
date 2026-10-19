// Маленький портрет героя в окне «Мой персонаж» / «Персонаж»: кадр «стойка, лицом к камере» из heroes_atlas (48×60) на canvas
// и очернение тем же правилом, что шейдер PixCharacter.setBlacken (тень ползёт от ног вверх, 70–100 % — чёрный силуэт с фиолетовым ободком; k 0…1 = inspect.bk/100 от сервера).
// Рисуется один раз при открытии окна — ничего не стоит в кадре игры.
import heroesSrc from '../../../../assets/mc/heroes_atlas.png';
const URL_ = typeof heroesSrc === 'object' && heroesSrc ? heroesSrc.src || heroesSrc.default || '' : heroesSrc;
const ROWS = { spearman: 0, rogue: 1, mage: 2, warrior: 3 }, CW = 48, CH = 60, COL = 1; // строка = класс, колонка 1 = стойка (вниз)
let img = null, wait = null;
const load = () => wait || (wait = new Promise((ok) => { const i = new Image(); i.onload = () => { img = i; ok(i); }; i.onerror = () => ok(null); i.src = URL_; }));
const H = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** очернить пиксели кадра (RGBA, w×h) — как фрагментный шейдер setBlacken (без анимации) */
export function blackenPixels(px, w, h, k) {   // как шейдер: правая (на экране) половина, доля k; шов — фиолетовый
  if (!(k > 0.005)) return px;
  for (let y = 0; y < h; y++) { const rN = H(y, 3), rS = H(y, 7), b = 1 - k + (rN - 0.5) * 0.1 * Math.min(1, k * 4) - (rS > 0.86 ? 0.18 * Math.min(1, k * 3) : 0);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (px[i + 3] < 77) continue;
      const u = ((x + 0.5) / w - 0.5) / 0.3;
      if (u >= b) { px[i] = 2; px[i + 1] = 0; px[i + 2] = 4; if (H(x, y) > 0.975) { px[i] = 140; px[i + 1] = 56; px[i + 2] = 217; } }
      else if (u >= b - 0.16) { const a = 0.85; px[i] = px[i] * (1 - a) + 140 * a; px[i + 1] = px[i + 1] * (1 - a) + 56 * a; px[i + 2] = px[i + 2] * (1 - a) + 217 * a; }
    } }
  return px;
}
export async function drawHeroPreview(cv, cls, k = 0) {
  const row = ROWS[cls]; if (row == null || !cv) return;
  const im = img || await load(); if (!im || !cv.isConnected) return;
  const t = document.createElement('canvas'); t.width = CW; t.height = CH;
  const tc = t.getContext('2d', { willReadFrequently: true }); tc.imageSmoothingEnabled = false;
  tc.drawImage(im, COL * CW, row * CH, CW, CH, 0, 0, CW, CH);
  if (k > 0.005) { const d = tc.getImageData(0, 0, CW, CH); blackenPixels(d.data, CW, CH, k); tc.putImageData(d, 0, 0); }
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
  const s = Math.min(cv.width / CW, cv.height / CH); c.drawImage(t, 0, 0, CW, CH, (cv.width - CW * s) / 2, cv.height - CH * s, CW * s, CH * s);
  cv.dataset.drawn = String(Math.round(k * 100));
}
