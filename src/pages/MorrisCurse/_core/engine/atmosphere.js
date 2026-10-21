// Атмосфера 2.5D-миров (дёшево, без пост-обработки — пиксель-арт остаётся чётким):
//  • мягкие «капли»-тени под билбордами (герои, мобы, пропсы): один InstancedMesh на кадр + статический — под пропсами;
//  • свет зоны (Поляна — лунная ночь, сады — тёплые сумерки, пустоши — холод…): плавный переход hemi/sun/fog +
//    общий тон спрайтов (uniform uGrade во всех SpriteBatch) + CSS-виньетка и цветокоррекция поверх канваса;
//  • источники света (фонари, факелы, костры, порталы, алтарь): аддитивные ореолы + световые пятна на земле
//    с мерцанием («блум» без пост-обработки) и пул из N настоящих PointLight на ближайших источниках (desktop);
//  • частицы зоны рядом с камерой: светлячки, лепестки, пыль, фиолетовые искры у алтаря.
// Всё зависит от уровня качества (setQuality): на мобильных/низком — меньше частиц, без PointLight и без blend-тона.
import { emitterOffsetM, emitterWorld, emitterGround, setEmitterCamera } from './lightEmitter.js';
import { flickerOf, FIRE as FIRE_RE, LT as LT_CFG } from './dayNight.js';
import { toX, toZ } from './geometry.js';
import { regionAt } from '../../../../../server/meta/zoneGen.ts';

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
    this.shMat = new THREE.MeshBasicMaterial({ map: shTex, color: 0x0a0614, transparent: true, depthWrite: false, opacity: 0.85 });
    this.shadows = new THREE.InstancedMesh(flat(), this.shMat, 768);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.shadows.frustumCulled = false; this.shadows.count = 0; this.shadows.renderOrder = 1;
    stage.scene.add(this.shadows);
    this.staticShadows = null;
    // ореолы и световые пятна (аддитивно)
    const glowTex = radialTex(THREE, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, fog: false });
    this.pools = new THREE.InstancedMesh(flat(), this.poolMat, 160);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pools.frustumCulled = false; this.pools.count = 0; this.pools.renderOrder = 2;
    this.pools.setColorAt(0, new THREE.Color(1, 1, 1));
    stage.scene.add(this.pools);
    const halo = new THREE.PlaneBufferGeometry(1, 1);
    this.haloMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, opacity: 0.8, fog: false });
    this.halos = new THREE.InstancedMesh(halo, this.haloMat, 160);
    this.halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.halos.frustumCulled = false; this.halos.count = 0; this.halos.renderOrder = 3;
    this.halos.setColorAt(0, new THREE.Color(1, 1, 1));
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
    this.sources = []; this.altar = null; this.t = 0;
    this.d = new THREE.Object3D(); this.c = new THREE.Color(); this.v3 = new THREE.Vector3();
    this.enabled = true; this.ready = true;
    this.begin();
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
        if (L) this.sources.push({ x: toX(p.x), z: toZ(p.y), col: new THREE.Color(L[0]), r: L[1] * (p.s || 1), h: L[2] * (p.s || 1), k: L[3], ph: Math.random() * 10, fire: FIRE_RE.test(p.k), off: emitterOffsetM(p.k, { s: p.s || 1, flip: !!p.f, set: 'world' }) }); // off — точка огня у спрайта (центроид _glow)
      }
      im.count = n; im.frustumCulled = false; im.renderOrder = 1;
      this.staticShadows = im; this.stage.scene.add(im);
    }
    this.altar = null;
    for (const p of portals || []) {
      if ((p.world || 'hellfire') !== world) continue;
      const altar = p.id === 'portal_class_select';
      const s = { x: toX(p.x), z: toZ(p.y), col: new THREE.Color(altar ? 0xc084fc : 0xa855f7), r: altar ? 5 : 3.8, h: 1.6, k: altar ? 1.3 : 0.9, ph: Math.random() * 10, fire: false };
      this.sources.push(s);
      if (altar) this.altar = s;
    }
  }

  moodFor(world, px, py) {
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
    setEmitterCamera(st.camera);
    const fx = st.focus.x, fz = st.focus.z, R2 = 34 * 34;
    const near = [];
    for (const s of this.sources) { const dx = s.x - fx, dz = s.z - fz, dd = dx * dx + dz * dz; if (dd < R2) near.push([dd, s]); }
    near.sort((a, b) => a[0] - b[0]);
    const d = this.d; let np = 0, nh = 0;
    for (const [, s] of near) {
      if (np >= 160) break;
      const fl = flickerOf(T * 1000, s.x + s.ph, s.z, s.fire); // огонь мерцает сильнее, фонари — едва (админка «Огни»)
      s.f = fl;
      // пятно — на земле прямо под огнём (у фонаря на кронштейне — под фонарём, не под столбом), чуть вытянуто в 3/4
      const off = s.off || [0, s.h]; emitterGround(s.x, s.z, off, this._g2 ||= [0, 0]);
      d.position.set(this._g2[0], 0.04, this._g2[1]); d.rotation.set(0, 0, 0); d.scale.set(s.r * 2 * fl * (LT_CFG.poolEl || 1), 1, s.r * 2 * fl); d.updateMatrix();
      this.pools.setMatrixAt(np, d.matrix); this.pools.setColorAt(np++, this.c.copy(s.col).multiplyScalar(s.k * fl));
      // ореол у огня — квад, повёрнутый к камере
      const W = emitterWorld(s.x, 0, s.z, off, 0.15, this._w3 ||= [0, 0, 0]); d.position.set(W[0], W[1], W[2]); d.quaternion.copy(st.camera.quaternion); /* ореол — в точке огня, чуть за спрайтом */ const hs = (s.fire ? 1.5 : 2.2) * fl * (0.7 + 0.3 * s.k) * (LT_CFG.halo || 1); d.scale.set(hs, hs, hs); d.updateMatrix();
      this.halos.setMatrixAt(nh, d.matrix); this.halos.setColorAt(nh++, this.c.copy(s.col).multiplyScalar(0.8 * fl));
    }
    this.pools.count = np; this.halos.count = nh;
    for (const im of [this.pools, this.halos]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.lights.forEach((l, i) => {
      const s = near[i]?.[1];
      if (!s || this.qLevel >= 2) { l.intensity = 0; return; }
      const W = emitterWorld(s.x, 0, s.z, s.off || [0, s.h], -0.4, this._w3 ||= [0, 0, 0]); l.position.set(W[0], W[1], W[2]); // свет — из огня (чуть к камере) l.color.copy(s.col); l.intensity = 1.4 * s.k * (s.f || 1); l.distance = s.r * 3;
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
