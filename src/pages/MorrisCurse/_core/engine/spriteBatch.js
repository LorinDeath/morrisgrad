// 2.5D-билборды из атласа: один InstancedMesh (= один draw call) на атлас.
// Каждый экземпляр: позиция «ног», размер в метрах, ячейка атласа, отражение по X, тон, вспышка, прозрачность.
// Квад всегда повёрнут к камере (в пространстве вида), низ квада — в точке ног, поэтому спрайт «стоит» на земле.
// Атласы — пиксель-арт: NearestFilter, без мипмапов; горячий цикл без аллокаций (только запись в Float32Array).

import { GRADE } from './atmosphere.js';

// --- стабильная сортировка спрайтов (мир, хаб, забеги): общая для SpriteBatch и THREE.Sprite (pixSprites) ---
export const DEPTH_Q = 0.05; // м = 1 px мира
const KEY_N = 16;            // корзин ключа: шаг Q·0.9/16 ≈ 2.8 мм > точности буфера глубины на дистанции камеры
/** id (число/строка) → ключ [0,1) детерминированно */
export function sortKey(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % KEY_N) / KEY_N;
}
/** z «ног» для глубины: квант по y + ключ (одинаково с шейдером SpriteBatch) */
export function depthZ(z, key) { return Math.floor(z / DEPTH_Q) * DEPTH_Q + key * DEPTH_Q * 0.9; }
const posKey = (x, z) => sortKey(Math.round(x * 20) * 7919 + Math.round(z * 20));

const VERT = `
attribute vec3 iPos;
attribute vec4 iSize;   // w, h (м), flipX (±1), yOffset (м)
attribute vec4 iUV;     // u0, v0, du, dv
attribute vec4 iTint;   // r, g, b, flash
attribute float iAlpha;
attribute vec3 iAnim;   // кадров, к/с, сдвиг фазы (сек) — анимация пропсов на GPU (статичные батчи чанков тоже «живут»)
uniform float uTime;
varying vec2 vUv;
varying vec4 vTint;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(iPos.x, iSize.w, iPos.z, 1.0);
  // глубина — по точке НОГ на земле (не по поднятому якорю летуна): при наклонной камере подъём по Y
  // приближал квад к камере, и летающий/подпрыгивающий моб позади рисовался ПОВЕРХ игрока.
  // Так порядок слоёв = порядок по «y мира» (кто ближе к низу экрана — тот спереди), одинаково для всех батчей.
  // Стабильный порядок: глубина по y ног, квантованному до DEPTH_Q (1 px мира), + детерминированный ключ экземпляра
  // (iPos.y ∈ [0,1): id сущности или хэш позиции) — равные/дрожащие по float y спрайты больше не мерцают (z-fighting).
  float zq = floor(iPos.z / ${DEPTH_Q.toFixed(4)}) * ${DEPTH_Q.toFixed(4)} + iPos.y * ${(DEPTH_Q * 0.9).toFixed(4)};
  mvPosition.z = (modelViewMatrix * vec4(iPos.x, 0.0, zq, 1.0)).z;
  mvPosition.xy += vec2(position.x * iSize.x, position.y * iSize.y);
  float u = iSize.z < 0.0 ? 1.0 - uv.x : uv.x;
  float fr = iAnim.x > 1.5 ? floor(mod((uTime + iAnim.z) * iAnim.y, iAnim.x)) : 0.0;
  // кадры идут вправо от ячейки; длинные циклы (костёр 60 кадров) переносятся на следующие строки листа
  float cols = floor(1.0 / iUV.z + 0.5);
  float cc = floor(iUV.x / iUV.z + 0.5) + fr;
  float wr = floor(cc / cols);
  vUv = vec2((cc - wr * cols + u) * iUV.z, iUV.y - wr * iUV.w + uv.y * iUV.w);
  vTint = iTint;
  vAlpha = iAlpha;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform sampler2D map;
uniform float uLight;
uniform vec3 uGrade;
varying vec2 vUv;
varying vec4 vTint;
varying float vAlpha;
#include <fog_pars_fragment>
uniform float uAdd;
void main() {
  vec4 c = texture2D(map, vUv);
  if (uAdd > 3.5) { gl_FragColor = vec4(vTint.rgb * step(0.3, c.a) * vAlpha * uGrade, 1.0); return; } // аура силуэта (узлы сбора), аддитивно
  if (uAdd > 2.5) { if (c.a < 0.3) discard; gl_FragColor = vec4(vTint.rgb, vAlpha); return; } // сплошной силуэт цветом (пиксельный контур под спрайтом)
  if (uAdd > 1.5) { gl_FragColor = vec4(mix(vTint.rgb, vec3(1.0), c.r), c.a * vAlpha); return; } // мягкое свечение (ореол проклятия): R — подмес белого, A — плотность
  if (uAdd > 0.5) { gl_FragColor = vec4(c.rgb * vTint.rgb * c.a * vAlpha * uGrade, 1.0); return; } // свечение (*_glow.png), аддитивно
  if (c.a < 0.3) discard;
  vec3 col = c.rgb * vTint.rgb * uLight * uGrade;
  col = mix(col, vec3(1.0), clamp(vTint.a, 0.0, 1.0));
  gl_FragColor = vec4(col, c.a * vAlpha);
  #include <fog_fragment>
}`;

export const SPRITE_TIME = { value: 0 };
export function tickSpriteTime(dt) { SPRITE_TIME.value = (SPRITE_TIME.value + (dt || 0)) % 3600; }

export class SpriteBatch {
  /**
   * @param THREE
   * @param texture THREE.Texture атласа
   * @param opts { cellW, cellH, cols, rows, max }
   */
  constructor(THREE, texture, { cellW, cellH, cols, rows, max = 512, light = 1, additive = false, soft = false, sil = false, aura = false }) {
    this.THREE = THREE;
    this.cols = cols; this.rows = rows; this.max = max;
    this.du = 1 / cols; this.dv = 1 / rows;
    this.cellAspect = cellW / cellH;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const base = new THREE.PlaneBufferGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aSize = mk(4); this.aUV = mk(4); this.aTint = mk(4); this.aAlpha = mk(1); this.aAnim = mk(3);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iSize', this.aSize); geo.setAttribute('iUV', this.aUV);
    geo.setAttribute('iTint', this.aTint); geo.setAttribute('iAlpha', this.aAlpha); geo.setAttribute('iAnim', this.aAnim);
    geo.instanceCount = 0;
    this.geo = geo;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: light } }]);
    uniforms.map.value = texture;
    // общий тон зоны (engine/atmosphere.js) — один объект uniform на все батчи
    if (!GRADE.value) GRADE.value = new THREE.Color(1, 1, 1);
    uniforms.uGrade = GRADE;
    uniforms.uTime = SPRITE_TIME; // общее время анимации (обновляет игровой цикл: tickSpriteTime)
    if (aura) additive = true;
    uniforms.uAdd = { value: aura ? 4 : sil ? 3 : soft ? 2 : additive ? 1 : 0 };
    this.material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, depthWrite: !additive && !sil, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = sil ? 1 : additive ? 3 : 2; // силуэт — до спрайтов (контур виден только по краям)
    this.n = 0;
  }

  setLight(k) { this.material.uniforms.uLight.value = k; }

  begin() { this.n = 0; }

  // Добавить спрайт. col/row — ячейка атласа. Возвращает false, если батч заполнен.
  push(x, y, z, heightM, col, row, flip = false, r = 1, g = 1, b = 1, flash = 0, alpha = 1, widthM = 0) {
    const i = this.n;
    if (i >= this.max) return false;
    this.n++;
    const p = this.aPos.array, s = this.aSize.array, u = this.aUV.array, t = this.aTint.array;
    p[i * 3] = x; p[i * 3 + 1] = posKey(x, z); p[i * 3 + 2] = z; // y атрибута = ключ сортировки (по умолчанию — от позиции; sortId() — от id)
    s[i * 4] = widthM || heightM * this.cellAspect; s[i * 4 + 1] = heightM; s[i * 4 + 2] = flip ? -1 : 1; s[i * 4 + 3] = y;
    u[i * 4] = col * this.du; u[i * 4 + 1] = 1 - (row + 1) * this.dv; u[i * 4 + 2] = this.du; u[i * 4 + 3] = this.dv;
    t[i * 4] = r; t[i * 4 + 1] = g; t[i * 4 + 2] = b; t[i * 4 + 3] = flash;
    this.aAlpha.array[i] = alpha;
    const an = this.aAnim.array; an[i * 3] = 1; an[i * 3 + 1] = 0; an[i * 3 + 2] = 0;
    return true;
  }

  // ключ сортировки последнего спрайта по id сущности (стабилен при движении)
  sortId(id) { const i = this.n - 1; if (i >= 0) this.aPos.array[i * 3 + 1] = sortKey(id); }

  // анимация последнего добавленного спрайта: frames кадров подряд вправо от col (с переносом на след. строку), fps, фаза (сек)
  anim(frames, fps, phase = 0) { const i = this.n - 1; if (i < 0) return; const an = this.aAnim.array; an[i * 3] = frames; an[i * 3 + 1] = fps; an[i * 3 + 2] = phase; }

  end() {
    this.geo.instanceCount = this.n;
    const upd = (a) => { a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = this.n * a.itemSize; };
    upd(this.aPos); upd(this.aSize); upd(this.aUV); upd(this.aTint); upd(this.aAlpha); upd(this.aAnim);
  }

  dispose() { this.geo.dispose(); this.material.dispose(); }
}

// Загрузка атласа как текстуры (sRGB-файл выводится «как есть» — пиксели точно как в листе)
// Astro/Vite отдаёт импорт .png объектом {src,...}, esbuild — строкой: принимаем оба
export const assetUrl = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s);
export function loadAtlasTexture(THREE, src) {
  src = assetUrl(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const t = new THREE.Texture(img); t.needsUpdate = true; resolve(t); };
    img.onerror = () => reject(new Error('атлас не загрузился: ' + src));
    img.src = src;
  });
}
