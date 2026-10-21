// Пропсы — спрайты утверждённых листов на SpriteBatch. Два набора с ОДНИМИ ключами, вариантами и размерами в метрах:
//  • v2 (props2): props_p32 32×48, props_b64 64×64 + *_glow, 10 px арта на метр — «Текстуры: Старые (16)», телефоны по умолчанию;
//  • v3 (props3, Художник): props32_p64 64×96, props32_b128 128×128, props32_x64 64×64 (замены 3D-мешей арены и ореолы света) + *_glow,
//    20 px/м, кадров больше — «Текстуры: Новые (32)» (worlds/texPref.js) и админка «🖼 Графика» → props3. Модуль v3 и его листы
//    грузятся динамически (props3Set.js) только когда он выбран; лист x64 — только по запросу (extra).
// Кадры анимации играет шейдер (iAnim + общий uTime), поэтому даже статичные батчи чанков качаются/мерцают;
// у каждого экземпляра своя фаза (хеш позиции), варианты (tree/tree_2/tree_3…) — детерминированно по позиции
// (server/meta/propsV2.ts → propVariant: те же, что у сервера для коллизий; сервер всегда считает по атласу v2 — размеры в метрах те же).
import { SpriteBatch, loadAtlasTexture, assetUrl } from './spriteBatch.js';
import { GRADE } from './atmosphere.js';
import { LIGHT, pixTex, setDisplayRGB } from './pixColor.js';
import { GFX, PROP_SET, PROP_FPS, PROP_GLOW, propSetFor } from './gfxCfg.js';
import { PROPS_META as META, propVariant, propDef } from '../../../../../server/meta/propsV2.ts';
import p32 from '../../../../assets/mc/props2/props_p32.png';
import b64 from '../../../../assets/mc/props2/props_b64.png';
import p32g from '../../../../assets/mc/props2/props_p32_glow.png';
import b64g from '../../../../assets/mc/props2/props_b64_glow.png';

const SRC = { p32, b64, p32_glow: p32g, b64_glow: b64g };
export { PROP_SET };
export { FALLBACK_V2, propSetFor } from './gfxCfg.js';
const LAZY = new Set(['x64', 'x64_glow']); // лист арены/ореолов — только по запросу (extra)
const SETS = {};
const setInfo = (set) => (set === 'v3'
  ? import('./props3Set.js').then((m) => ({ META: m.META, src: m.SRC, pxm: m.META.tex_px_per_m || 20, pack: !!GFX.pack16, packGlow: !!GFX.packGlow }))
  : Promise.resolve({ META, src: SRC, pxm: 10, pack: false }));
// Лист как текстура; pack — RGBA 5551 (базовые листы — GFX.pack16, по умолчанию выкл: light-fidelity ловит ΔS обелиска; свечение — GFX.packGlow, вкл) (16 бит/пиксель вместо 32): у листов props3 альфа только 0/255, ошибка цвета ≤ 1/62
// WebGL при загрузке в 5551 отбрасывает младшие биты (усечение → всё темнее до 1/31, тёмные тона теряют насыщенность), поэтому
// лист заранее округляем до ближайшего уровня 5 бит и пишем значение, которое после усечения даёт именно этот уровень: ошибка ≤ 1/62, без сдвига.
let Q5 = null;
export function quant5(img) {
  if (!Q5) { Q5 = new Uint8Array(256); for (let v = 0; v < 256; v++) Q5[v] = Math.min(255, Math.ceil(Math.round(v * 31 / 255) * 255 / 31)); }
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0); const D = g.getImageData(0, 0, cv.width, cv.height), a = D.data;
  for (let i = 0; i < a.length; i += 4) { if (!a[i + 3]) continue; a[i] = Q5[a[i]]; a[i + 1] = Q5[a[i + 1]]; a[i + 2] = Q5[a[i + 2]]; }
  g.putImageData(D, 0, 0); return cv;
}
function sheetTex(THREE, src, pack) {
  return loadAtlasTexture(THREE, assetUrl(src)).then((t) => {
    if (pack && THREE.UnsignedShort5551Type) { t.userData = t.userData || {}; t.userData.src = t.image; t.image = quant5(t.image); t.type = THREE.UnsignedShort5551Type; t.format = THREE.RGBAFormat; t.needsUpdate = true; }
    return t; });
}
/** статистика загрузки (тесты/отчёт): мс и байты видеопамяти по листам */
export const PROP_STATS = { set: PROP_SET, sheets: {}, t0: 0, msBase: 0 };
/**
 * Текстуры листов набора: объект { META, set, pxm, <лист>: THREE.Texture }. extra — ленивые листы (['x64'], ['x64_glow']),
 * догружаются в тот же объект. Один и тот же объект на набор (кэш).
 */
export function loadPropTextures(THREE, { set = PROP_SET, extra = [] } = {}) {
  let S = SETS[set];
  if (!S) {
    S = SETS[set] = { tex: null, pend: {} };
    const t0 = performance.now(); PROP_STATS.t0 = PROP_STATS.t0 || t0;
    S.base = setInfo(set).then((I) => {
      S.I = I; S.tex = { META: I.META, set, pxm: I.pxm };
      const names = Object.keys(I.src).filter((k) => !LAZY.has(k));
      return Promise.all(names.map((k) => S.load(THREE, k))).then(() => { if (set === PROP_SET) PROP_STATS.msBase = Math.round(performance.now() - t0); return S.tex; });
    });
    S.load = (THREE, k) => {
      if (!S.pend[k]) { const t1 = performance.now(); S.pend[k] = sheetTex(THREE, S.I.src[k], k.endsWith('_glow') ? S.I.packGlow : S.I.pack).then((t) => { S.tex[k] = t;
        const im = t.image; PROP_STATS.sheets[set + ':' + k] = { w: im.width, h: im.height, bytes: im.width * im.height * (t.type === THREE.UnsignedShort5551Type ? 2 : 4), ms: Math.round(performance.now() - t1) }; return t; }); }
      return S.pend[k];
    };
  }
  if (!extra.length) return S.base;
  return S.base.then((tex) => Promise.all(extra.filter((k) => S.I.src[k]).map((k) => S.load(THREE, k))).then(() => tex));
}
export const phaseOf = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return (h - Math.floor(h)) * 10; };
// высота кадра в метрах: frameH / (px/м набора) — у v2 /10, у v3 /20 (метры одинаковы)
export const propHeightM = (key, s = 1) => { const d = propDef(key); return d ? META.sheets[d.sheet].frameH / 10 * s : 4.8 * s; };
const metaOf = (tex) => tex?.META || META;
const pxmOf = (tex) => tex?.pxm || 10;

// Набор батчей на группу пропсов (чанк/сцена): 2 листа × (обычный + свечение)
export class PropSprites {
  constructor(THREE, tex, { max = 256, light = 1, parent = null, outline = false } = {}) {
    this.b = {}; this.M = metaOf(tex); this.pxm = pxmOf(tex);
    const M = this.M;
    for (const sh of Object.keys(M.sheets).filter((s) => !s.endsWith('_glow') && tex[s])) { // листы набора (v2: p32, b64; v3: p64, b128 [+ x64])
      const S = M.sheets[sh];
      this.b[sh] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, fpsU: PROP_FPS, glowU: PROP_GLOW });
      if (tex[sh + '_glow']) this.b[sh + '_glow'] = new SpriteBatch(THREE, tex[sh + '_glow'], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, additive: true, fpsU: PROP_FPS, glowU: PROP_GLOW });
      if (outline) { // свечение узлов сбора: сплошной контур под спрайтом + аддитивная аура поверх (те же кадры атласа)
        this.b[sh + '_sil'] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, sil: true, fpsU: PROP_FPS });
        this.b[sh + '_aura'] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, aura: true, fpsU: PROP_FPS });
      }
    }
    this.list = Object.values(this.b);
    if (parent) for (const B of this.list) parent.add(B.mesh);
  }
  begin() { for (const B of this.list) B.begin(); }
  end() { for (const B of this.list) B.end(); }
  setLight(k) { for (const B of this.list) B.setLight(k); }
  // k — ключ (старый или v2); (wx, wy) — точка мира (для варианта и фазы); (x, z) — сцена; s — масштаб; y — подъём (м)
  push(k, wx, wy, x, z, s = 1, flip = false, alpha = 1, y = 0, tint = null, variant = true) {
    const key = variant ? propVariant(k, wx, wy) : (META.aliases[k] || k);
    const d = key && this.M.keys[key], B = d && this.b[d.sheet]; if (!B) return false;
    const h = this.M.sheets[d.sheet].frameH / this.pxm * s, ph = phaseOf(wx, wy);
    const r = tint ? tint[0] : 1, g = tint ? tint[1] : 1, bb = tint ? tint[2] : 1;
    B.push(x, y, z, h, d.col, d.row, flip, r, g, bb, 0, alpha); if (d.frames > 1) B.anim(d.frames, d.fps, ph);
    const G = d.glow && this.b[d.glow.sheet];
    if (G) { G.push(x, y, z, h, d.col, d.row, flip, 1, 1, 1, 0, alpha); if (d.frames > 1) G.anim(d.frames, d.fps, ph); }
    return true;
  }
  // свечение узла: контур цветом rgb (масштаб size, альфа a) и аура (яркость k) — тот же кадр/вариант, что у push()
  pushGlow(k, wx, wy, x, z, s, flip, rgb, size, a, auraK, variant = true) {
    const key = variant ? propVariant(k, wx, wy) : (META.aliases[k] || k);
    const d = key && this.M.keys[key]; if (!d || !this.b[d.sheet + '_sil']) return false;
    const h = this.M.sheets[d.sheet].frameH / this.pxm * s, ph = phaseOf(wx, wy), S = this.b[d.sheet + '_sil'], A = this.b[d.sheet + '_aura'];
    S.push(x, -h * (size - 1) * 0.12, z, h * size, d.col, d.row, flip, rgb[0], rgb[1], rgb[2], 0, a); if (d.frames > 1) S.anim(d.frames, d.fps, ph);
    if (auraK > 0) { A.push(x, 0, z, h, d.col, d.row, flip, rgb[0] * auraK, rgb[1] * auraK, rgb[2] * auraK, 0, 1); if (d.frames > 1) A.anim(d.frames, d.fps, ph); }
    return true;
  }
  // плоская декаль (arena_sigil): кладётся на землю отдельным мешем — здесь только проверка ключа
  dispose(parent) { for (const B of this.list) { B.dispose(); parent?.remove(B.mesh); } }
}

// Полоса кадров одного ключа из большого листа (v3): у r128 clone() текстуры = ещё одна загрузка всего листа в видеопамять
// (b128 4096² — 64 МБ на каждый портал), поэтому одиночный пропс берёт свою полосу кадров (одна на ключ и лист, общая для всех копий).
const STRIPS = new Map();
export function keyStrip(THREE, img, S, d, pack = false) {
  const id = `${img.src || (img.__sid || (img.__sid = Math.random().toString(36).slice(2)))}|${d.row}|${d.col}|${d.frames}`; if (STRIPS.has(id)) return STRIPS.get(id);
  const n = Math.max(1, d.frames || 1), fw = S.frameW, fh = S.frameH, cols = Math.max(1, Math.min(n, Math.floor(4096 / fw))), rows = Math.ceil(n / cols);
  const cv = document.createElement('canvas'); cv.width = cols * fw; cv.height = rows * fh; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let f = 0; f < n; f++) { const c = d.col + f, r = d.row + Math.floor(c / S.cols); g.drawImage(img, (c % S.cols) * fw, r * fh, fw, fh, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh); }
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (pack && THREE.UnsignedShort5551Type) { t.type = THREE.UnsignedShort5551Type; t.format = THREE.RGBAFormat; }
  t.repeat.set(1 / cols, 1 / rows); t.offset.set(0, 1 - 1 / rows); t.needsUpdate = true;
  const o = { tex: t, cols, rows, frames: n, frame: -1 }; STRIPS.set(id, o); return o;
}
export function stripFrame(st, f) { if (st.frame === f) return; st.frame = f; st.tex.offset.x = (f % st.cols) / st.cols; st.tex.offset.y = 1 - (Math.floor(f / st.cols) + 1) / st.rows; }

// Отдельный анимированный пропс как THREE.Sprite (порталы, Сердце Обители и др. одиночные объекты сцены):
// основа (обычное смешивание, alphaTest) + свечение (аддитивно). Низ кадра — в точке группы. update(t) листает кадры.
// Цвет — как у пропсов SpriteBatch: пиксель атласа × тон зоны (GRADE) × LIGHT.props (свечение × LIGHT.glow), см. pixColor.js.
// set — набор листов ('v2'/'v3', по умолчанию — набор страницы; забег передаёт свой). Размер в метрах одинаков в обоих наборах.
export function propObject(THREE, k, { s = 1, tint = null, glowTint = null, set = PROP_SET } = {}) {
  const key = META.aliases[k] || k, d0 = propDef(key); set = propSetFor(key, set);
  const g = new THREE.Group(); if (!d0) return { group: g, update() {} };
  const S0 = META.sheets[d0.sheet], h = S0.frameH / 10 * s, w = S0.frameW / 10 * s;
  const mk = (add) => { const m = new THREE.SpriteMaterial({ transparent: true, alphaTest: add ? 0 : 0.3, depthWrite: !add, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }); const sp = new THREE.Sprite(m); sp.center.set(0.5, 0); sp.scale.set(w, h, 1); sp.renderOrder = add ? 3 : 2; return sp; };
  const base = mk(false), glow = d0.glow ? mk(true) : null;
  const C = THREE.Color, baseTint = new C(tint ?? 0xffffff), glowCol = new C(glowTint ?? tint ?? 0xffffff);
  const paint = () => { // экранные множители → линейный цвет материала
    const G = GRADE.value || { r: 1, g: 1, b: 1 }, kp = LIGHT.props, kg = LIGHT.glow * PROP_GLOW.value;
    setDisplayRGB(base.material.color, baseTint.r * G.r * kp, baseTint.g * G.g * kp, baseTint.b * G.b * kp);
    if (glow) setDisplayRGB(glow.material.color, glowCol.r * G.r * kg, glowCol.g * G.g * kg, glowCol.b * G.b * kg);
  };
  paint();
  g.add(base); if (glow) g.add(glow);
  const maps = [], strips = [];
  let d = d0, S = S0;
  loadPropTextures(THREE, { set }).then((tex) => {
    const M = metaOf(tex), d3 = M.keys[key]; if (!d3 || !tex[d3.sheet]) return;
    d = d3; S = M.sheets[d.sheet];
    if (tex.set === 'v3') { // своя полоса кадров ключа (общая для всех копий ключа), без клона листа
      const set1 = (sp, t) => { const st = keyStrip(THREE, t.userData?.src || t.image, S, d); pixTex(THREE, st.tex); sp.material.map = st.tex; sp.material.needsUpdate = true; strips.push(st); maps.push(st.tex); };
      set1(base, tex[d.sheet]); if (glow && d.glow && tex[d.glow.sheet]) set1(glow, tex[d.glow.sheet]);
      return;
    }
    const set1 = (sp, t) => { const m = pixTex(THREE, t.clone()); m.needsUpdate = true; m.magFilter = m.minFilter = THREE.NearestFilter; m.generateMipmaps = false; m.repeat.set(1 / S.cols, 1 / S.rows); m.offset.set(d.col / S.cols, 1 - (d.row + 1) / S.rows); sp.material.map = m; sp.material.needsUpdate = true; maps.push(m); };
    set1(base, tex[d.sheet]); if (glow) set1(glow, tex[d.glow.sheet]);
  });
  const ph = Math.random() * 5;
  return { group: g, key, set, base, glow, maps, update(t) { paint(); if (d.frames < 2) return; t *= PROP_FPS.value;
    if (strips.length) { const f = Math.floor(t * d.fps) % d.frames; for (const st of strips) stripFrame(st, f); return; } // общая полоса — общая фаза
    const f = Math.floor((t + ph) * d.fps) % d.frames, c = d.col + f, r = d.row + Math.floor(c / S.cols); for (const m of maps) { m.offset.x = (c % S.cols) / S.cols; m.offset.y = 1 - (r + 1) / S.rows; } } };
}
