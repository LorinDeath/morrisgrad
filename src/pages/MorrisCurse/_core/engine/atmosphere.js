// Атмосфера 2.5D-миров (дёшево, без пост-обработки — пиксель-арт остаётся чётким):
//  • мягкие «капли»-тени под билбордами (герои, мобы, пропсы): один InstancedMesh на кадр + статический — под пропсами;
//  • свет зоны (Поляна — лунная ночь, сады — тёплые сумерки, пустоши — холод…): плавный переход hemi/sun/fog +
//    общий тон спрайтов (uniform uGrade во всех SpriteBatch) + CSS-виньетка и цветокоррекция поверх канваса;
//  • источники света (фонари, факелы, костры, порталы, алтарь): аддитивные ореолы + световые пятна на земле
//    с мерцанием («блум» без пост-обработки) и пул из N настоящих PointLight на ближайших источниках (desktop);
//    ореол стоит по глубине ЗА спрайтом источника (LIGHT.haloBehind) — светится вокруг арки/огня, а не поверх пикселей;
//    цвета и сила — экранные значения (pixColor.js: setDisplayRGB, без ACES), сила — LIGHT.pool / LIGHT.halo из админки «💡 Свет»;
//    на props3 ореол и пятно — пиксельные спрайты Художника (light_halo/pool_neutral, админка «🖼 Графика» → lightSprites);
//  • частицы зоны рядом с камерой: светлячки, лепестки, пыль, фиолетовые искры у алтаря.
// Всё зависит от уровня качества (setQuality): на мобильных/низком — меньше частиц, без PointLight и без blend-тона.
import { toX, toZ } from './geometry.js';
import { LIGHT, pixMat, pixTex, setDisplayHex, setDisplayRGB } from './pixColor.js';
import { regionAt } from '../../../../../server/meta/zoneGen.ts';
import { propVariant } from '../../../../../server/meta/propsV2.ts';
import { lightEmitter, hasEmitter } from './lightEmitter.js';
import { PROP_SET, GFX, propSetFor, PORTAL_S } from './gfxCfg.js';
// тип огня → строка админки «🖼 Графика» (lt.<тип>: размер/сила ореола и пятна)
const LIGHT_TYPE = { lantern: 'warm', torch: 'fire', campfire: 'fire', crystal: 'cool', star_crystal: 'violet', pylon: 'lime' };
import { SPRITE_TIME } from './spriteBatch.js';
// фаза анимации экземпляра пропса — та же, что у PropSprites (propAtlas.js phaseOf): кадр огня = кадр на экране
const phaseOf = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return (h - Math.floor(h)) * 10; };

// оттенок спрайтов (общий uniform — SpriteBatch подключает его в шейдер)
export const GRADE = { value: null };

// Настроение по зоне/региону
const MOOD = {
  // Поляна: ночь, фиолетовая луна
  hub: { sky: 0x17122e, fog: 0x1d1538, hemiSky: 0xb7a2ff, hemiGround: 0x2c3a3a, hemi: 0.95, sun: 0xc4b0ff, sunI: 0.62, grade: [0.9, 0.88, 1.06], tint: 'rgba(120,80,220,0.22)', vig: 0.5, parts: 'fireflies' },
  meadow: { sky: 0x161034, fog: 0x1a1640, hemiSky: 0xc7c2ff, hemiGround: 0x334d3d, hemi: 0.95, sun: 0xffe9d2, sunI: 0.7, grade: [0.96, 0.96, 1.04], tint: 'rgba(110,100,220,0.10)', vig: 0.42, parts: 'fireflies' },
  grove: { sky: 0x101a24, fog: 0x15222a, hemiSky: 0xbfe6c8, hemiGround: 0x23402e, hemi: 0.95, sun: 0xfff0c8, sunI: 0.7, grade: [0.95, 1.0, 0.96], tint: 'rgba(60,140,90,0.10)', vig: 0.45, parts: 'fireflies' },
  garden: { sky: 0x2a1424, fog: 0x3a1c2a, hemiSky: 0xffc9a0, hemiGround: 0x4a2a2a, hemi: 1.0, sun: 0xffb27a, sunI: 0.9, grade: [1.07, 0.96, 0.9], tint: 'rgba(255,140,90,0.24)', vig: 0.42, parts: 'petals' },
  waste: { sky: 0x0e1626, fog: 0x18243a, hemiSky: 0x9fb8ff, hemiGround: 0x2a3446, hemi: 0.9, sun: 0xbfd8ff, sunI: 0.75, grade: [0.9, 0.96, 1.1], tint: 'rgba(90,140,230,0.22)', vig: 0.5, parts: 'dust' },
  ridge: { sky: 0x121826, fog: 0x1c2232, hemiSky: 0xb4c4e8, hemiGround: 0x2e2a2a, hemi: 0.9, sun: 0xd8e4ff, sunI: 0.75, grade: [0.94, 0.96, 1.06], tint: 'rgba(100,130,200,0.12)', vig: 0.48, parts: 'dust' },
  rot: { sky: 0x101a0e, fog: 0x1a2614, hemiSky: 0xc8e6a0, hemiGround: 0x2a2a14, hemi: 0.85, sun: 0xd9f99d, sunI: 0.6, grade: [0.95, 1.04, 0.88], tint: 'rgba(120,180,40,0.12)', vig: 0.55, parts: 'spores' },
  pylon: { sky: 0x14122a, fog: 0x1e1a3a, hemiSky: 0xc4b5fd, hemiGround: 0x2a2440, hemi: 0.95, sun: 0xe0e7ff, sunI: 0.7, grade: [0.96, 0.95, 1.06], tint: 'rgba(140,110,255,0.12)', vig: 0.48, parts: 'sparks' },
  glitch: { sky: 0x0a1810, fog: 0x0f2418, hemiSky: 0x86efac, hemiGround: 0x1a2a20, hemi: 0.85, sun: 0xbbf7d0, sunI: 0.6, grade: [0.92, 1.06, 0.96], tint: 'rgba(60,220,120,0.12)', vig: 0.55, parts: 'sparks' },
  crater: { sky: 0x101020, fog: 0x1a1a30, hemiSky: 0xe0e7ff, hemiGround: 0x2a2a34, hemi: 0.95, sun: 0xf1f5f9, sunI: 0.8, grade: [0.95, 0.97, 1.06], tint: 'rgba(170,180,255,0.12)', vig: 0.5, parts: 'dust' },
  thin: { sky: 0x18101e, fog: 0x241830, hemiSky: 0xe9d5ff, hemiGround: 0x2e2434, hemi: 0.85, sun: 0xf5f3ff, sunI: 0.6, grade: [0.98, 0.94, 1.04], tint: 'rgba(200,160,255,0.12)', vig: 0.58, parts: 'dust' },
  // биомы Аринара (server/meta/biomes.ts): мягкий тон героя (grade), свет и частицы; переход — плавный lerp
  b_ice: { sky: 0x0c1424, fog: 0x14203a, hemiSky: 0xbfdcff, hemiGround: 0x3a2030, hemi: 0.95, sun: 0xdbeaff, sunI: 0.8, grade: [0.98, 0.97, 1.1], tint: 'rgba(120,170,255,0.16)', vig: 0.5, parts: 'snow', hud: '#9cc9ff', hud2: '#e05a6e' },
  b_fire: { sky: 0x070c22, fog: 0x0c1636, hemiSky: 0x93b4ff, hemiGround: 0x101c48, hemi: 0.9, sun: 0x7fa8ff, sunI: 0.85, grade: [0.9, 0.98, 1.14], tint: 'rgba(60,120,255,0.20)', vig: 0.55, parts: 'bluefire', hud: '#4f8dff', hud2: '#7dd3fc' },
  b_stone: { sky: 0x101318, fog: 0x1a1e26, hemiSky: 0xd0d6e0, hemiGround: 0x2c2e34, hemi: 0.92, sun: 0xe8edf5, sunI: 0.75, grade: [0.97, 0.98, 1.02], tint: 'rgba(160,170,190,0.14)', vig: 0.5, parts: 'metal', hud: '#b8c2d0', hud2: '#8b95a5' },
  b_air: { sky: 0x0a0618, fog: 0x140c2a, hemiSky: 0xc9b2ff, hemiGround: 0x1e1438, hemi: 0.9, sun: 0xe9d8ff, sunI: 0.7, grade: [1.0, 0.92, 1.12], tint: 'rgba(150,90,255,0.18)', vig: 0.55, parts: 'stars', hud: '#a78bfa', hud2: '#f0abfc' },
  crypt: { sky: 0x050308, fog: 0x0a0610, hemiSky: 0xb38bd6, hemiGround: 0x2a1006, hemi: 0.16, sun: 0xffc58a, sunI: 0.2, grade: [1.04, 0.97, 0.94], tint: 'rgba(255,120,60,0.10)', vig: 0.78, parts: 'embers' },
  abyss: { sky: 0x03020a, fog: 0x060418, hemiSky: 0x8ea2ff, hemiGround: 0x1b0c33, hemi: 0.16, sun: 0xc7d2fe, sunI: 0.2, grade: [0.92, 0.96, 1.08], tint: 'rgba(80,120,255,0.12)', vig: 0.78, parts: 'dust' },
};
const PART = {
  fireflies: { n: 70, col: [[1, 0.93, 0.55], [0.8, 0.95, 0.5], [0.85, 0.7, 1]], size: 0.13, fall: 0, sway: 0.5, blink: true },
  petals: { n: 90, col: [[1, 0.62, 0.72], [1, 0.8, 0.85], [0.98, 0.5, 0.55]], size: 0.11, fall: 0.55, sway: 0.9, blink: false },
  dust: { n: 90, col: [[0.85, 0.9, 1], [0.75, 0.8, 0.95]], size: 0.07, fall: -0.05, sway: 0.25, blink: false },
  spores: { n: 80, col: [[0.75, 0.95, 0.35], [0.55, 0.8, 0.3]], size: 0.09, fall: -0.15, sway: 0.4, blink: true },
  sparks: { n: 60, col: [[0.75, 0.6, 1], [0.6, 0.95, 1]], size: 0.09, fall: -0.4, sway: 0.3, blink: true },
  snow: { n: 80, col: [[0.92, 0.96, 1], [1, 0.55, 0.6], [0.8, 0.9, 1]], size: 0.08, fall: 0.45, sway: 0.6, blink: false },
  bluefire: { n: 60, col: [[0.45, 0.65, 1], [0.6, 0.9, 1]], size: 0.09, fall: -0.6, sway: 0.4, blink: true },
  metal: { n: 50, col: [[0.85, 0.88, 0.92], [1, 0.85, 0.55]], size: 0.06, fall: -0.2, sway: 0.2, blink: true },
  stars: { n: 80, col: [[1, 1, 1], [0.8, 0.7, 1], [0.6, 0.8, 1]], size: 0.07, fall: 0, sway: 0.15, blink: true },
  embers: { n: 60, col: [[1, 0.6, 0.25], [1, 0.8, 0.4]], size: 0.08, fall: -0.6, sway: 0.4, blink: true },
};
// какие пропсы — источники света: [цвет, радиус пятна (м), высота огня (м), сила]
const LIGHT_PROPS = { lantern: [0xffd27a, 3.2, 2.6, 1], torch: [0xff9a3c, 3.0, 2.4, 1.1], campfire: [0xff8a2a, 4.2, 0.7, 1.3], crystal: [0x9be8ff, 2.2, 1.0, 0.6], star_crystal: [0xc4b5fd, 2.2, 1.0, 0.6], pylon: [0xa78bfa, 2.6, 3.0, 0.7] };
const PROP_SHADOW = { tree: 1.5, pome_tree: 1.4, dead_tree: 1.0, bush: 0.9, rock: 0.9, violets: 0.45, lantern: 0.4, crystal: 0.6, ruin_pillar: 0.8, obelisk: 0.8, altar: 1.3, barrel: 0.55, crate: 0.6, campfire: 0.7, torch: 0.3, fence: 0.9, signpost: 0.4, mushroom: 0.6, glitch_shard: 0.6, pylon: 0.7, tombstone: 0.6, star_crystal: 0.6, well: 1.2, ore_node: 0.6 };

function radialTex(THREE, stops, size = 64) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); return t;
}

class Atmosphere {
  constructor() { this.ready = false; this.qLevel = 0; this.mobile = false; }

  init(THREE, stage, { mobile = false } = {}) {
    if (this.ready) return;
    this.THREE = THREE; this.stage = stage; this.mobile = mobile;
    GRADE.value = new THREE.Color(1, 1, 1);
    this.cur = null; this.target = null; this.moodKey = '';
    const flat = (n) => { const g = new THREE.PlaneBufferGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; };
    // тени-капли
    const shTex = radialTex(THREE, [[0, 'rgba(0,0,0,0.75)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    this.shMat = pixMat(new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.85 })); setDisplayHex(this.shMat.color, 0x0a0614);
    this.shadows = new THREE.InstancedMesh(flat(), this.shMat, 768);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.shadows.frustumCulled = false; this.shadows.count = 0; this.shadows.renderOrder = 1;
    stage.scene.add(this.shadows);
    this.staticShadows = null;
    // ореолы и световые пятна (аддитивно)
    const glowTex = radialTex(THREE, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    this.poolMat = pixMat(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, fog: false }));
    this.pools = new THREE.InstancedMesh(flat(), this.poolMat, 160);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pools.frustumCulled = false; this.pools.renderOrder = 2;
    // буфер цветов — на всю ёмкость (r128 setColorAt выделяет его по ТЕКУЩЕМУ count: при count = 0 он был пустым → цвет 0, пятна и ореолы не было видно)
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3).setUsage(THREE.DynamicDrawUsage); this.pools.count = 0;
    stage.scene.add(this.pools);
    const halo = new THREE.PlaneBufferGeometry(1, 1);
    this.haloMat = pixMat(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, opacity: 0.8, fog: false }));
    this.halos = new THREE.InstancedMesh(halo, this.haloMat, 160);
    this.halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.halos.frustumCulled = false; this.halos.renderOrder = 3;
    this.halos.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3).setUsage(THREE.DynamicDrawUsage); this.halos.count = 0;
    stage.scene.add(this.halos);
    // настоящие точечные огни (фиксированный пул — число огней не меняется, шейдеры не перекомпилируются)
    this.lights = [];
    const NL = mobile ? 0 : 4;
    for (let i = 0; i < NL; i++) { const l = new THREE.PointLight(0xffaa55, 0, 9, 1.8); l.position.set(0, -50, 0); stage.scene.add(l); this.lights.push(l); }
    // частицы (квадратные точки — пиксельно-чёткие)
    const PN = 160;
    this.pPos = new Float32Array(PN * 3); this.pCol = new Float32Array(PN * 3); this.pSeed = new Float32Array(PN);
    for (let i = 0; i < PN; i++) this.pSeed[i] = Math.random() * 100;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.partMat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.parts = new THREE.Points(pg, this.partMat); this.parts.frustumCulled = false; this.parts.renderOrder = 4;
    this.partKind = ''; this.partN = 0;
    stage.scene.add(this.parts);
    // CSS: виньетка + цветовой тон поверх канваса (не размывает пиксели)
    const host = stage.canvas.parentElement;
    if (host) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      this.tintEl = document.createElement('div'); this.tintEl.className = 'mc-atmo-tint';
      this.tintEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;mix-blend-mode:soft-light;transition:background-color 1.2s';
      this.vigEl = document.createElement('div'); this.vigEl.className = 'mc-atmo-vig';
      this.vigEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;transition:background 1.2s';
      host.insertBefore(this.tintEl, stage.canvas.nextSibling); host.insertBefore(this.vigEl, this.tintEl.nextSibling);
    }
    // props3: ореол и пятно — пиксельные спрайты Художника light_halo_neutral / light_pool_neutral (24 кадра @12, лист x64_glow),
    // окраска та же (setColorAt, экранные значения); до загрузки и на props2 — радиальный градиент
    this.lightSpr = null;
    import('./propAtlas.js').then((m) => { if (m.PROP_SET !== 'v3') return null; return import('./gfxCfg.js').then((g) => (g.GFX.lightSprites ? m.loadPropTextures(THREE, { extra: ['x64_glow'] }) : null)); })
      .then((tex) => { if (tex?.x64_glow) this.useLightSprites(tex); }).catch((e) => console.warn('[atmo light sprites]', e.message));
    this.sources = []; this.altar = null; this.t = 0;
    this.d = new THREE.Object3D(); this.c = new THREE.Color(); this.v3 = new THREE.Vector3(); this.fw = new THREE.Vector3(); this.v4 = new THREE.Vector3();
    this.enabled = true; this.ready = true;
    this.begin();
  }

  // пиксельные ореолы/пятна (props3): полоса 24×2 кадров из x64_glow, кадр — атрибут экземпляра iF (своя фаза у каждого огня)
  useLightSprites(tex) {
    const THREE = this.THREE, M = tex.META, img = tex.x64_glow.userData?.src || tex.x64_glow.image, dh = M.keys.light_halo_neutral, dp = M.keys.light_pool_neutral;
    if (!dh || !dp || !img) return;
    const S = M.sheets[dh.glow?.sheet || 'x64_glow'] || M.sheets.x64, fw = S.frameW, fh = S.frameH, NF = Math.min(dh.frames, dp.frames);
    const cv = document.createElement('canvas'); cv.width = fw * NF; cv.height = fh * 2; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    [dh, dp].forEach((d, r) => { for (let f = 0; f < NF; f++) { const c = d.col + f, rr = d.row + Math.floor(c / S.cols); g.drawImage(img, (c % S.cols) * fw, rr * fh, fw, fh, f * fw, r * fh, fw, fh); } });
    // сплюснутость эллипса пятна в кадре (нарисован «как с камеры»): на плоскости земли растягиваем по глубине на 1/ELL
    const a = g.getImageData(0, fh, fw, fh).data; let y0 = fh, y1 = -1, x0 = fw, x1 = -1;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (a[(y * fw + x) * 4 + 3] > 0) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const ell = y1 > y0 && x1 > x0 ? (y1 - y0 + 1) / (x1 - x0 + 1) : 1;
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; pixTex(THREE, t); t.needsUpdate = true;
    const patch = (mat, row) => {
      mat.map = t; mat.userData.uRow = { value: row };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uRow = mat.userData.uRow;
        sh.vertexShader = 'attribute float iF;\nuniform float uRow;\n' + sh.vertexShader.replace('#include <uv_vertex>', `vUv = vec2((iF + uv.x) / ${NF.toFixed(1)}, (uRow + uv.y) * 0.5);`);
      };
      mat.customProgramCacheKey = () => 'mc-light-spr-' + NF; mat.needsUpdate = true;
    };
    for (const [im, row] of [[this.halos, 1], [this.pools, 0]]) {
      const at = new THREE.InstancedBufferAttribute(new Float32Array(160), 1).setUsage(THREE.DynamicDrawUsage);
      im.geometry.setAttribute('iF', at); patch(im.material, row);
    }
    this.lightSpr = { nf: NF, fps: dh.fps || 12, ell, fill: (x1 - x0 + 1) / fw };
  }

  setQuality(level) {
    this.qLevel = level;
    if (!this.ready) return;
    if (this.tintEl) this.tintEl.style.display = level >= 2 ? 'none' : '';   // blend-слой — только на высоком качестве
    this.lights.forEach((l) => { l.visible = level < 2; });
  }

  // зона: 'hellfire' | 'arinar' | 'run_crypt' | 'run_abyss'; источники света и тени пропсов — из раскладки terrain
  setScene(world, layout, portals) {
    if (!this.ready) return;
    this.world = world;
    this.sources = [];
    const THREE = this.THREE;
    if (this.staticShadows) { this.stage.scene.remove(this.staticShadows); this.staticShadows.dispose?.(); this.staticShadows = null; }
    const props = layout?.props || [];
    if (props.length) {
      const im = new THREE.InstancedMesh(this.shadows.geometry, this.shMat, props.length);
      const d = this.d; let n = 0;
      for (const p of props) {
        const r = (PROP_SHADOW[p.k] || 0.6) * (p.s || 1);
        // центр эллипса — у основания спрайта (как у героя), а не перед ним
        d.position.set(toX(p.x) + r * 0.06, 0.025, toZ(p.y) - r * 0.18); d.rotation.set(0, 0, 0); d.scale.set(r * 2.1, 1, r * 1.1); d.updateMatrix();
        im.setMatrixAt(n++, d.matrix);
        const L = LIGHT_PROPS[p.k];
        // точка излучения — у огня в кадре (lightEmitter: центроид свечения *_glow по кадрам), а не центр текстуры
        const ek = L && propVariant(p.k, p.x, p.y), em = ek && hasEmitter(ek, PROP_SET) ? ek : null;
        if (L) this.sources.push({ x: toX(p.x), z: toZ(p.y), col: new THREE.Color(L[0]), r: L[1] * (p.s || 1), h: L[2] * (p.s || 1), k: L[3], ph: Math.random() * 10, fire: p.k === 'torch' || p.k === 'campfire' || p.k === 'lantern',
          ek: em, es: p.s || 1, ef: p.f ? -1 : 1, eph: phaseOf(p.x, p.y), lt: LIGHT_TYPE[p.k] || 'warm' });
      }
      im.count = n; im.frustumCulled = false; im.renderOrder = 1;
      this.staticShadows = im; this.stage.scene.add(im);
    }
    this.altar = null;
    for (const p of portals || []) {
      if ((p.world || 'hellfire') !== world) continue;
      const altar = p.id === 'portal_class_select';
      const s = { x: toX(p.x), z: toZ(p.y), col: new THREE.Color(altar ? 0xc084fc : 0xa855f7), r: altar ? 5 : 3.8, h: 1.6, k: altar ? 1.3 : 0.9, ph: Math.random() * 10, fire: false, lt: 'portal' };
      if (!altar) { const es = propSetFor('portal'); if (hasEmitter('portal', es)) Object.assign(s, { ek: 'portal', eset: es, es: PORTAL_S, ef: 1, eph: 0 }); } // свет из вихря (models.js: portal, s = PORTAL_S); набор — с учётом отката на v2
      this.sources.push(s);
      if (altar) this.altar = s;
    }
  }

  moodFor(world, px, py) {
    if (this.moodOverride && MOOD[this.moodOverride]) return this.moodOverride; // только debug.mood (снимки «день/ночь»)
    if (world === 'run_crypt') return 'crypt';
    if (world === 'run_abyss') return 'abyss';
    if (world !== 'arinar') return 'hub';
    const r = regionAt(px, py, 'arinar');
    return (r && MOOD[r.biome] ? r.biome : 'meadow');
  }

  begin() {
    if (!this.ready) return;
    this.nSh = 0;
  }
  // тень-капля под билбордом: (x,z) — ноги в метрах, r — полуширина (м), a — плотность 0..1
  shadow(x, z, r = 0.6, a = 1) {
    if (!this.ready || this.nSh >= 768) return;
    // под ногами, как у героя (не «парит» перед основанием)
    const d = this.d; d.position.set(x + r * 0.06, 0.03, z - r * 0.18); d.rotation.set(0, 0, 0);
    const k = 0.55 + 0.45 * a; d.scale.set(r * 2.2 * k, 1, r * 1.1 * k); d.updateMatrix();
    this.shadows.setMatrixAt(this.nSh++, d.matrix);
  }

  // кадр: камера уже выставлена (stage.follow); world/px/py — где игрок (для региона)
  end(dt, world, px = 0, py = 0) {
    if (!this.ready) return;
    this.t += dt;
    const T = this.t, st = this.stage, THREE = this.THREE;
    this.shadows.count = this.nSh; this.shadows.instanceMatrix.needsUpdate = true;
    const show = this.enabled && !!world;
    for (const o of [this.shadows, this.pools, this.halos, this.parts]) o.visible = show;
    if (this.staticShadows) this.staticShadows.visible = show && (world === 'hellfire' || world === 'arinar');
    if (this.tintEl) this.tintEl.style.visibility = show ? '' : 'hidden';
    if (this.vigEl) this.vigEl.style.visibility = show ? '' : 'hidden';
    if (!show) { this.lights.forEach((l) => { l.intensity = 0; }); return; }
    // --- настроение: плавный переход
    const key = this.moodFor(world, px, py);
    const M = MOOD[key];
    if (key !== this.moodKey) {
      this.moodKey = key;
      if (this.tintEl) this.tintEl.style.backgroundColor = M.tint;
      if (this.vigEl) this.vigEl.style.background = `radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(6,3,14,${M.vig}) 100%)`;
      // тема HUD по биому: акцент рамок/свечения (CSS-переменные с transition; золотая база остаётся)
      const rs = document.documentElement.style;
      if (M.hud) { rs.setProperty('--mc-biome', M.hud); rs.setProperty('--mc-biome2', M.hud2 || M.hud); document.documentElement.dataset.biome = key; }
      else { rs.removeProperty('--mc-biome'); rs.removeProperty('--mc-biome2'); delete document.documentElement.dataset.biome; }
    }
    const k = Math.min(1, dt * 1.5);
    const lerpHex = (col, hex) => col.lerp(this.c.setHex(hex), k);
    if (st.scene.background?.isColor) lerpHex(st.scene.background, M.sky);
    if (st.scene.fog) lerpHex(st.scene.fog.color, M.fog);
    lerpHex(st.hemi.color, M.hemiSky); lerpHex(st.hemi.groundColor, M.hemiGround);
    st.hemi.intensity += (M.hemi - st.hemi.intensity) * k;
    lerpHex(st.sun.color, M.sunI ? M.sun : 0xffffff); st.sun.intensity += (M.sunI - st.sun.intensity) * k;
    // лунный «день-ночь»: очень медленное дыхание тона на Поляне
    const moon = key === 'hub' ? 0.03 * Math.sin(T * 0.05) : 0;
    GRADE.value.r += (M.grade[0] - moon - GRADE.value.r) * k; GRADE.value.g += (M.grade[1] - GRADE.value.g) * k; GRADE.value.b += (M.grade[2] + moon - GRADE.value.b) * k;
    // --- источники света рядом с камерой: ореолы, пятна, мерцание, N ближайших PointLight
    const fx = st.focus.x, fz = st.focus.z, R2 = 34 * 34;
    const near = [];
    for (const s of this.sources) { const dx = s.x - fx, dz = s.z - fz, dd = dx * dx + dz * dz; if (dd < R2) near.push([dd, s]); }
    near.sort((a, b) => a[0] - b[0]);
    const d = this.d; let np = 0, nh = 0;
    this.poolMat.opacity = 0.45 * LIGHT.pool; this.haloMat.opacity = 0.8 * LIGHT.halo; this.shMat.opacity = 0.85 * LIGHT.shadow;
    const cam = st.camera.position; st.camera.getWorldDirection(this.fw);
    const cq = st.camera.quaternion, cr = (this.cr || (this.cr = new THREE.Vector3())).set(1, 0, 0).applyQuaternion(cq), cu = (this.cu || (this.cu = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(cq);
    const ST = SPRITE_TIME.value;
    for (const [, s] of near) {
      if (np >= 160) break;
      // точка излучения этого кадра: билборд стоит в плоскости вида → смещение по «вправо/вверх» камеры от ног
      s.ex = s.x; s.ey = s.h; s.ez = s.z; s.gx = s.x; s.gz = s.z;
      if (s.ek) { const e0 = lightEmitter(s.ek, 0, s.eset || PROP_SET), fr0 = e0.frames > 1 && e0.fps ? Math.floor((ST + s.eph) * e0.fps) : 0, e = fr0 ? lightEmitter(s.ek, fr0, s.eset || PROP_SET) : e0;
        const dx = e.dx * s.es * s.ef, hh = e.h * s.es;
        s.ex = s.x + cr.x * dx + cu.x * hh; s.ey = cr.y * dx + cu.y * hh; s.ez = s.z + cr.z * dx + cu.z * hh;
        s.gx = s.x + cr.x * dx; s.gz = s.z + cr.z * dx; } // пятно — на земле прямо под огнём
      const fl = s.fire ? 0.82 + 0.1 * Math.sin(T * 9 + s.ph) + 0.08 * Math.sin(T * 23.7 + s.ph * 3) : 0.85 + 0.15 * Math.sin(T * 2 + s.ph);
      s.f = fl;
      const LT = GFX.lt[s.lt] || GFX.lt.warm, pS = LT.poolS, pK = LT.poolK, hS = LT.haloS, hK = LT.haloK;
      // пятно — у самой земли (0.012 м): выше — оно перекрывало нижние ряды пикселей спрайта у «ног» (основание алтаря)
      const LS = this.lightSpr, fr = LS ? Math.floor((T + s.ph) * LS.fps) % LS.nf : 0;
      // спрайт: эллипс занимает LS.fill ширины кадра и сплюснут в кадре (LS.ell) → на земле тот же круг радиуса r
      if (LS) { const w = s.r * 2 * fl * pS / LS.fill; d.position.set(s.gx, 0.012, s.gz); d.rotation.set(0, 0, 0); d.scale.set(w, 1, w / LS.ell); this.pools.geometry.attributes.iF.array[np] = fr; }
      else { d.position.set(s.gx, 0.012, s.gz); d.rotation.set(0, 0, 0); d.scale.set(s.r * 2 * fl * pS, 1, s.r * 2 * fl * pS); }
      d.updateMatrix();
      this.pools.setMatrixAt(np, d.matrix); this.pools.setColorAt(np++, setDisplayRGB(this.c, s.col.r * s.k * fl * pK, s.col.g * s.k * fl * pK, s.col.b * s.k * fl * pK));
      // ореол у огня — квад, повёрнутый к камере
      const hs = (s.fire ? 1.5 : 2.2) * fl * (0.7 + 0.3 * s.k) * hS;
      d.position.set(s.ex, s.ey, s.ez); d.quaternion.copy(st.camera.quaternion);
      if (LIGHT.haloBehind) {
        // по лучу из камеры (на экране там же) — на глубину «ног» источника + 0.25 м: спрайт источника (квад на глубине ног)
        // закрывает ореол своими пикселями, ореол виден только вокруг силуэта и не высветляет арку/вихрь/пламя
        const dFeet = this.v4.set(s.x - cam.x, -cam.y, s.z - cam.z).dot(this.fw);
        this.v3.subVectors(d.position, cam); const dist = this.v3.length(); this.v3.divideScalar(dist);
        const dPt = (dist * this.v3.dot(this.fw)), t = (dFeet + 0.25 - dPt) / Math.max(0.2, this.v3.dot(this.fw));
        d.position.addScaledVector(this.v3, t); const ks = (dist + t) / dist; d.scale.set(hs * ks, hs * ks, hs * ks);
      } else { this.v3.subVectors(cam, d.position).normalize(); d.position.addScaledVector(this.v3, 0.9); d.scale.set(hs, hs, hs); }
      d.updateMatrix();
      if (LS) this.halos.geometry.attributes.iF.array[nh] = (fr + 7) % LS.nf; // ореол и пятно — разные фазы
      this.halos.setMatrixAt(nh, d.matrix); this.halos.setColorAt(nh++, setDisplayRGB(this.c, s.col.r * 0.8 * fl * hK, s.col.g * 0.8 * fl * hK, s.col.b * 0.8 * fl * hK));
    }
    this.pools.count = np; this.halos.count = nh;
    for (const im of [this.pools, this.halos]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; if (im.geometry.attributes.iF) im.geometry.attributes.iF.needsUpdate = true; }
    this.lights.forEach((l, i) => {
      const s = near[i]?.[1];
      if (!s || this.qLevel >= 2) { l.intensity = 0; return; }
      l.position.set(s.ex ?? s.x, (s.ek ? s.ey : s.h + 0.4), s.ez ?? s.z); l.color.copy(s.col); l.intensity = 1.4 * s.k * (s.f || 1); l.distance = s.r * 3;
    });
    // --- частицы
    this.updateParticles(dt, M.parts, fx, fz);
  }

  updateParticles(dt, kind, fx, fz) {
    const P = PART[kind] || PART.dust;
    const cap = this.mobile || this.qLevel >= 2 ? 0.45 : 1;
    const n = Math.min(160, Math.round(P.n * cap));
    const pos = this.pPos, col = this.pCol, T = this.t, W = 20;
    const reset = kind !== this.partKind;
    this.partKind = kind;
    const alt = this.altar && Math.hypot(this.altar.x - fx, this.altar.z - fz) < 30 ? this.altar : null;
    const nAlt = alt ? Math.min(40, 160 - n) : 0;
    for (let i = 0; i < n + nAlt; i++) {
      const s = this.pSeed[i], o = i * 3;
      const isAlt = i >= n;
      if (isAlt) {
        // искры у алтаря: поднимаются спиралью и гаснут
        const life = (T * 0.35 + s) % 1, a = s * 6.283 + T * 0.8;
        const rr = 0.6 + (s % 1) * 2.2;
        pos[o] = alt.x + Math.cos(a) * rr; pos[o + 1] = 0.2 + life * 4; pos[o + 2] = alt.z + Math.sin(a) * rr;
        const b = (1 - life) * (0.6 + 0.4 * Math.sin(T * 12 + s * 7));
        col[o] = 0.8 * b; col[o + 1] = 0.5 * b; col[o + 2] = 1.0 * b;
        continue;
      }
      let x = pos[o], y = pos[o + 1], z = pos[o + 2];
      if (reset || i >= this.partN || Math.abs(x - fx) > W || Math.abs(z - fz) > W || y < 0 || y > 7) {
        x = fx + (Math.random() * 2 - 1) * W; z = fz + (Math.random() * 2 - 1) * W;
        y = P.fall > 0 ? 3 + Math.random() * 4 : 0.2 + Math.random() * 3;
      }
      x += Math.sin(T * 0.7 + s) * P.sway * dt + (P.fall > 0 ? 0.3 * dt : 0);
      z += Math.cos(T * 0.53 + s * 1.3) * P.sway * dt;
      y += (-P.fall + Math.sin(T * 1.1 + s) * 0.15) * dt;
      if (P.fall > 0 && y < 0.05) y = -1; // пересоздать сверху
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      const c = P.col[i % P.col.length];
      const b = P.blink ? Math.max(0, Math.sin(T * (1.3 + (s % 1)) + s * 5)) ** 2 : 0.75;
      col[o] = c[0] * b; col[o + 1] = c[1] * b; col[o + 2] = c[2] * b;
    }
    this.partN = n;
    const g = this.parts.geometry;
    g.setDrawRange(0, n + nAlt);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this.partMat.size = P.size;
  }
}

export const atmo = new Atmosphere();
