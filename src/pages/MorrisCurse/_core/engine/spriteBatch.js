// 2.5D-билборды из атласа: один InstancedMesh (= один draw call) на атлас.
// Каждый экземпляр: позиция «ног», размер в метрах, ячейка атласа, отражение по X, тон, вспышка, прозрачность.
// Квад всегда повёрнут к камере (в пространстве вида), низ квада — в точке ног, поэтому спрайт «стоит» на земле.
// Атласы — пиксель-арт: NearestFilter, без мипмапов; горячий цикл без аллокаций (только запись в Float32Array).

import { GRADE } from './atmosphere.js';

const VERT = `
attribute vec3 iPos;
attribute vec4 iSize;   // w, h (м), flipX (±1), yOffset (м)
attribute vec4 iUV;     // u0, v0, du, dv
attribute vec4 iTint;   // r, g, b, flash
attribute float iAlpha;
varying vec2 vUv;
varying vec4 vTint;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(iPos + vec3(0.0, iSize.w, 0.0), 1.0);
  // глубина — по точке НОГ на земле (не по поднятому якорю летуна): при наклонной камере подъём по Y
  // приближал квад к камере, и летающий/подпрыгивающий моб позади рисовался ПОВЕРХ игрока.
  // Так порядок слоёв = порядок по «y мира» (кто ближе к низу экрана — тот спереди), одинаково для всех батчей.
  mvPosition.z = (modelViewMatrix * vec4(iPos, 1.0)).z;
  mvPosition.xy += vec2(position.x * iSize.x, position.y * iSize.y);
  float u = iSize.z < 0.0 ? 1.0 - uv.x : uv.x;
  vUv = vec2(iUV.x + u * iUV.z, iUV.y + uv.y * iUV.w);
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
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.3) discard;
  vec3 col = c.rgb * vTint.rgb * uLight * uGrade;
  col = mix(col, vec3(1.0), clamp(vTint.a, 0.0, 1.0));
  gl_FragColor = vec4(col, c.a * vAlpha);
  #include <fog_fragment>
}`;

export class SpriteBatch {
  /**
   * @param THREE
   * @param texture THREE.Texture атласа
   * @param opts { cellW, cellH, cols, rows, max }
   */
  constructor(THREE, texture, { cellW, cellH, cols, rows, max = 512, light = 1 }) {
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
    this.aPos = mk(3); this.aSize = mk(4); this.aUV = mk(4); this.aTint = mk(4); this.aAlpha = mk(1);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iSize', this.aSize); geo.setAttribute('iUV', this.aUV);
    geo.setAttribute('iTint', this.aTint); geo.setAttribute('iAlpha', this.aAlpha);
    geo.instanceCount = 0;
    this.geo = geo;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: light } }]);
    uniforms.map.value = texture;
    // общий тон зоны (engine/atmosphere.js) — один объект uniform на все батчи
    if (!GRADE.value) GRADE.value = new THREE.Color(1, 1, 1);
    uniforms.uGrade = GRADE;
    this.material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, depthWrite: true });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
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
    p[i * 3] = x; p[i * 3 + 1] = 0; p[i * 3 + 2] = z;
    s[i * 4] = widthM || heightM * this.cellAspect; s[i * 4 + 1] = heightM; s[i * 4 + 2] = flip ? -1 : 1; s[i * 4 + 3] = y;
    u[i * 4] = col * this.du; u[i * 4 + 1] = 1 - (row + 1) * this.dv; u[i * 4 + 2] = this.du; u[i * 4 + 3] = this.dv;
    t[i * 4] = r; t[i * 4 + 1] = g; t[i * 4 + 2] = b; t[i * 4 + 3] = flash;
    this.aAlpha.array[i] = alpha;
    return true;
  }

  end() {
    this.geo.instanceCount = this.n;
    const upd = (a) => { a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = this.n * a.itemSize; };
    upd(this.aPos); upd(this.aSize); upd(this.aUV); upd(this.aTint); upd(this.aAlpha);
  }

  dispose() { this.geo.dispose(); this.material.dispose(); }
}

// Загрузка атласа как текстуры (sRGB-файл выводится «как есть» — пиксели точно как в листе)
export function loadAtlasTexture(THREE, src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const t = new THREE.Texture(img); t.needsUpdate = true; resolve(t); };
    img.onerror = () => reject(new Error('атлас не загрузился: ' + src));
    img.src = src;
  });
}
