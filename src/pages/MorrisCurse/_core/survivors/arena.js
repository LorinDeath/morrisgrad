// 3D-арена комнаты забега: «Склеп» (адский камень) и «Бездна» (осколок Аринара).
import { loadPropTextures, PropSprites, keyStrip, stripFrame } from '../engine/propAtlas.js';
import { arenaSet, GFX } from '../engine/gfxCfg.js';
import { buildArena32, TILE_M as A32_TILE } from './arena32.js';
import { pixTex, pixMat } from '../engine/pixColor.js';
import { PROPS_META, propDef } from '../../../../../server/meta/propsV2.ts';
import { ARENA_RADIUS } from './data.js';
import { PILLARS } from './run.js';
import { createStoneCanvas } from '../worlds/artDeco.js';
import tilesStone from '../../../../assets/mc/tiles_stone.png';
import tilesAir from '../../../../assets/mc/tiles_air.png';
import tilesIce from '../../../../assets/mc/tiles_ice.png';
import tilesFire from '../../../../assets/mc/tiles_fire.png';
import tilesMeta from '../../../../assets/mc/tiles_stone.json'; // индекс 63 слотов одинаков у всех тем (и у tiles_atlas)

const TILE_SRC = { stone: tilesStone, air: tilesAir, ice: tilesIce, fire: tilesFire };
// акцент темы: сигил/обод/огни колонн
export const TILE_ACCENT = { stone: 0xc59b27, air: 0x22d3ee, ice: 0x93c5fd, fire: 0xff6a1a };
// Настройки тёмной арены (все комнаты/темы забега): пол почти чёрный, свет — сигил, мобы, магия
export const DARK = { amb: 0.13, sigilR: 6.0, sigilK: 0.95, meR: 4.2, meK: 0.32, edge: 0.35, maxLights: 40, wallLight: 0.42 };
// светлые тайлсеты (воздух/лёд) темним сильнее — итоговая яркость пола одинаково низкая во всех темах
const TILE_DARK = { air: 0.4, ice: 0.6, stone: 1, fire: 1 };
const srcUrl = (s) => (typeof s === 'object' && s ? (s.src || s.default || '') : s);
const TILE_M = 1.6; // 16 px = 1.6 м — тот же масштаб пикселей, что у мира и спрайтов

// Пол подземелья из тайлсета темы: центр — плаза с руной, кольцо брусчатки с вкраплениями, край — кладка
export function bakeTileFloor(img, R, seed = 7) {
  const T = tilesMeta.tile, cols = tilesMeta.cols, I = tilesMeta.index;
  const N = Math.ceil((2 * (R + 2)) / TILE_M);
  const cv = document.createElement('canvas'); cv.width = cv.height = N * T;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (...names) => I[names[Math.floor(rnd() * names.length)]];
  const c = (N - 1) / 2, rT = (R + 2) / TILE_M;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    let id;
    if (d < 0.8) id = I.plaza_rune;
    else if (d < rT * 0.18) id = pick('plaza0', 'plaza1', 'plaza2', 'plaza3');
    else if (d > rT - 2.2) id = pick('brick0', 'brick1', 'brick_moss', 'wall_top');
    else { const r = rnd(); id = r < 0.06 ? pick('crater0', 'crater1', 'crater2', 'crater3') : r < 0.12 ? pick('rot0', 'rot1', 'waste0', 'waste1') : r < 0.2 ? pick('dirt0', 'dirt1', 'dirt2') : pick('cobble0', 'cobble1', 'cobble2'); }
    if (id === undefined) id = I.cobble0;
    g.drawImage(img, (id % cols) * T, Math.floor(id / cols) * T, T, T, x * T, y * T, T, T);
  }
  return cv;
}

export class RunArena {
  constructor(theme = 'crypt', tiles = null) {
    this.theme = theme;
    this.tiles = TILE_SRC[tiles] ? tiles : null;
    const abyss = theme === 'abyss';
    this.id = 'run_' + theme;
    this.sky = abyss ? 0x03020a : 0x050308;
    this.fog = abyss ? { color: 0x060418, near: 24, far: 70 } : { color: 0x0a0610, near: 22, far: 60 };
    this.hemi = abyss ? { sky: 0x8ea2ff, ground: 0x1b0c33, intensity: 0.6 } : { sky: 0xb38bd6, ground: 0x2a1006, intensity: 0.5 };
    this.sun = abyss ? { color: 0xc7d2fe, intensity: 0.75 } : { color: 0xffc58a, intensity: 0.8 };
  }

  build(THREE) {
    const abyss = this.theme === 'abyss';
    const acc = this.tiles ? TILE_ACCENT[this.tiles] : null; // акцент тайлсета
    const g = new THREE.Group();
    const R = ARENA_RADIUS;
    // набор листов арены: v2 (props2, по умолчанию) или v3 (props3 + x64 — замены 3D-мешей; админка «🖼 Графика» → arena3). Только отрисовка.
    // v3 = ещё и пол/кромка/парапет/декали arena32 (arena32.js): до загрузки листов виден прежний каменный холст.
    const AS = this.propSet = arenaSet(), A32 = AS === 'v3';
    this.wallLight = A32 ? GFX.arena3WallL : DARK.wallLight; // arena32: камень в свете арены (экранный ×), огни *_glow — полные
    const tex = new THREE.CanvasTexture(createStoneCanvas(abyss
      ? { base: '#0d1026', motif: 'rgba(103,232,249,0.10)', crack: 'rgba(0,0,0,0.4)' }
      : { base: '#1a1212', motif: 'rgba(197,155,39,0.09)', moss: 'rgba(60,80,40,0.35)' }, abyss ? 11 : 5));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(R / 4, R / 4);
    tex.anisotropy = 4;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    // тайлсет темы (если есть): каменный холст — до загрузки PNG, потом запечённый пол из тайлов
    if (this.tiles && !A32) {
      const img = new Image();
      img.onload = () => {
        if (this.gone) return; // арену уже закрыли — не создавать текстуру-сироту
        const t2 = new THREE.CanvasTexture(bakeTileFloor(img, R, this.tiles.length * 31));
        t2.magFilter = THREE.NearestFilter; t2.minFilter = THREE.NearestFilter; t2.generateMipmaps = false;
        if (THREE.sRGBEncoding) t2.encoding = THREE.sRGBEncoding;
        const prev = floor.material.map; floor.material.map = t2; floor.material.needsUpdate = true; if (prev && prev !== t2) prev.dispose(); /* каменный холст больше не нужен */ this.floorReady = true;
      };
      img.src = srcUrl(TILE_SRC[this.tiles]);
    }
    const AT = { stone: 'crypt', air: 'abyss', ice: 'mirror', fire: 'abode' }[this.tiles] || (abyss ? 'abyss' : 'crypt');
    this.propTheme = AT;
    // Тёмный пол: без света сцены (MeshBasic) — освещают только сигил, мобы, снаряды/эффекты и слабый ореол героя (makeDarkFloor)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2, 64), this.makeDarkFloor(THREE, tex, R, acc ?? (abyss ? 0x22d3ee : 0xef4444), A32));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // Сигил, стена-кольцо и колонны — пропсы v2 (arena_sigil / arena_wall_<тема> / arena_column_<тема>): тема по тайлсету комнаты
    const sigilCol = new THREE.Color(acc ?? (abyss ? 0x22d3ee : 0xef4444));
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: sigilCol, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    sigil.rotation.x = -Math.PI / 2; sigil.position.y = 0.02;
    g.add(sigil); this.sigil = sigil;
    const sigil2 = new THREE.Mesh(new THREE.RingGeometry(9, 9.2, 48), new THREE.MeshBasicMaterial({ color: sigilCol, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    sigil2.rotation.x = -Math.PI / 2; sigil2.position.y = 0.02;
    g.add(sigil2);
    this.decor = null; // v3: спрайты вместо мешей buildProps (заполняется там же, выводится после загрузки листов)
    loadPropTextures(THREE, { set: AS, extra: AS === 'v3' ? ['x64', 'x64_glow'] : [] }).then((tex) => {
      if (AS === 'v3') { // сигил — своя полоса кадров (без клона листа b128 4096²)
        const d = tex.META.keys.arena_sigil, st = keyStrip(THREE, tex[d.sheet].userData?.src || tex[d.sheet].image, tex.META.sheets[d.sheet], d);
        pixTex(THREE, st.tex); sigil.material.map = st.tex; sigil.material.needsUpdate = true; this.sigilStrip = st; this.sigilDef = d;
      } else {
        const sd = propDef('arena_sigil'), SS = PROPS_META.sheets[sd.sheet];
        const t = tex[sd.sheet].clone(); t.needsUpdate = true; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
        t.repeat.set(1 / SS.cols, 1 / SS.rows); t.offset.set(sd.col / SS.cols, 1 - (sd.row + 1) / SS.rows);
        sigil.material.map = t; sigil.material.needsUpdate = true; this.sigilTex = t; this.sigilDef = sd; this.sigilCols = SS.cols;
      }
      const items = [];
      // arena32: высокое кольцо arena_wall_* — за парапетом (Rf + arena3TallGap) или убрано (arena3Tall выкл)
      const seg = 5.4, Rw = A32 ? R + A32_TILE + GFX.arena3TallGap : R + 1.6, n = A32 && !GFX.arena3Tall ? 0 : Math.round((2 * Math.PI * Rw) / seg);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; items.push(['arena_wall_' + AT, Math.cos(a) * Rw, Math.sin(a) * Rw, 0.9]); }
      PILLARS.forEach((p) => items.push(['arena_column_' + AT, p.x, p.z, p.r / 1.44])); // коллайдер колонны (run.js) = 45% ширины 6.4 м → 1.44 м при s=1
      const D = this.decor || [];
      const B = new PropSprites(THREE, tex, { max: items.length + D.length + 4, parent: g });
      B.begin(); for (const [k, x, z, sc] of items) B.push(k, x * 20, z * 20, x, z, sc, false, 1, 0, null, false);
      for (const [k, x, z, sc, y] of D) B.push(k, x * 20, z * 20, x, z, sc, false, 1, y || 0, null, false);
      B.end();
      B.setLight(this.wallLight, A32 ? 1 : this.wallLight); // стены/колонны/декор — в полутьме, акцент только у огней; arena32: свечение огней полное
      this.props = B;
      if (this.decorDots?.length) this.buildDots(THREE, g, tex);
    }).catch((e) => console.warn('[arena props]', e.message));
    // обод: arena32 заменяет его бордюром кромки (arena3Rim — оставить тонкой подсветкой по бордюру)
    if (!A32 || GFX.arena3Rim) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(A32 ? R + A32_TILE - 0.3 : R + 0.2, A32 ? 0.05 : 0.12, 4, 96), new THREE.MeshBasicMaterial({ color: acc ?? (abyss ? 0x22d3ee : 0xc59b27) }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.05;
      g.add(rim);
    }
    // свет у колонн (сами колонны — спрайты v2 выше)
    this.flames = [];
    PILLARS.forEach((p, i) => {
      if (i % 2 === 0 && !A32) { // arena32: PointLight некому освещать (всё — спрайты и пол со своим светом) — огни колонн в карте света
        const light = new THREE.PointLight(acc ?? (abyss ? 0x67e8f9 : 0xff8a3c), 0.55, 9, 1.8);
        light.position.set(p.x, 4.4, p.z);
        g.add(light);
      }
    });
    this.floor = floor;
    this.buildProps(THREE, g, abyss, AT);
    this.a32 = A32 ? buildArena32(THREE, this, g, { AT, R }) : null;
    if (this.a32) this.a32.promise.catch((e) => console.warn('[arena32]', e.message));
    // Внешний мир
    if (abyss) {
      const N = 900; const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 80;
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = -30 + Math.random() * 90; pos[i * 3 + 2] = Math.sin(a) * r;
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe0e7ff, size: 0.7, fog: false })));
    } else {
      const N = 160; const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * R * 2; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2;
      }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.embers = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff9a3c, size: 0.12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(this.embers);
    }
    this.group = g;
    this.time = 0;
    return g;
  }

  /** Материал пола «тёмное подземелье»: яркость = ambient + свет сигила (центр) + ореол героя + до MAXL динамических огней,
   *  жёсткая виньетка к стене. Огни (мобы, снаряды, взрывы) задаёт RunView каждый кадр: setLights(). */
  makeDarkFloor(THREE, tex, R, sigilHex, a32 = false) {
    const MAXL = DARK.maxLights;
    const U = this.darkU = {
      uAmb: { value: DARK.amb * (TILE_DARK[this.tiles] ?? 1) }, uSig: { value: new THREE.Color(sigilHex) }, uR: { value: R },
      uMe: { value: new THREE.Vector2(0, 0) }, uN: { value: 0 }, uWallK: { value: 0 }, uFloorK: { value: 1 },
      uL: { value: Array.from({ length: MAXL }, () => new THREE.Vector4()) }, uLC: { value: Array.from({ length: MAXL }, () => new THREE.Color()) },
      // arena32: карта света арены (arena32.js bakeArenaLight: сигил, колонны, свечи, кристаллы, кромка) — экранный множитель, одна выборка
      uLM: { value: null }, uLMS: { value: 1 }, uLMK: { value: 0 }, uEdge: { value: DARK.edge },
    };
    if (a32) { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; U.uLM.value = t; U.uAmb.value = GFX.arena3Amb[this.propTheme] ?? 0.85; U.uEdge.value = GFX.arena3Edge; }
    const m = new THREE.MeshBasicMaterial({ map: tex });
    // arena32 (pixColor.js): свет — экранный множитель пиксель-арта (как у спрайтов), без ACES; li = 1 → пиксель как в атласе/превью
    if (a32) pixMat(m);
    m.customProgramCacheKey = () => (a32 ? 'arenaDark32' : 'arenaDark'); // r128: ключ программы — исходник onBeforeCompile, общий у обеих веток
    const LIGHT32 = `
    vec3 li = vec3(uAmb) + texture2D(uLM, vec2(vW.x, -vW.y) * uLMS + 0.5).rgb * uLMK;
    float dm = length(vW - uMe); float pm = 1.0 - smoothstep(0.0, ${DARK.meR.toFixed(1)}, dm); li += vec3(pm * pm * ${DARK.meK.toFixed(2)});
    for (int i = 0; i < ${MAXL}; i++) { if (i >= uN) break; vec4 L = uL[i]; float a = max(0.0, 1.0 - length(vW - L.xy) / L.z); li += uLC[i] * (L.w * a * a); }
    li *= mix(1.0, uEdge, smoothstep(uR * 0.6, uR + 1.5, dc)); // к стене — мягче, чем у старой арены (кромку подсвечивает карта света)
    li = min(li * uFloorK, vec3(1.6));
    float wm = step(0.5, diffuseColor.a) * step(diffuseColor.a, 0.998) * step(0.001, uWallK);
    li = mix(li, max(li, vec3(uWallK)), wm); diffuseColor.a = mix(diffuseColor.a, 1.0, wm);
    diffuseColor.rgb = sRGBToLinear(vec4(LinearTosRGB(vec4(diffuseColor.rgb, 1.0)).rgb * li, 1.0)).rgb; // точно экранный ×: encode(результат) = пиксель атласа × свет (pow 2.2 врёт в тёмном «носке» sRGB)`;
    const LIGHT = `
    vec3 li = vec3(uAmb);
    float sg = 1.0 - smoothstep(0.0, ${DARK.sigilR.toFixed(1)}, dc); li += uSig * (sg * sg * ${DARK.sigilK.toFixed(2)});
    float dm = length(vW - uMe); float pm = 1.0 - smoothstep(0.0, ${DARK.meR.toFixed(1)}, dm); li += vec3(pm * pm * ${DARK.meK.toFixed(2)});
    for (int i = 0; i < ${MAXL}; i++) { if (i >= uN) break; vec4 L = uL[i]; float a = max(0.0, 1.0 - length(vW - L.xy) / L.z); li += uLC[i] * (L.w * a * a); }
    li *= mix(1.0, ${DARK.edge.toFixed(2)}, smoothstep(uR * 0.5, uR + 1.5, dc)); // виньетка к стене
    diffuseColor.rgb *= li;`;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec2 vW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vW = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = `varying vec2 vW;
uniform float uAmb; uniform vec3 uSig; uniform float uR; uniform vec2 uMe; uniform int uN; uniform float uWallK; uniform float uFloorK;
uniform vec4 uL[${MAXL}]; uniform vec3 uLC[${MAXL}];
uniform sampler2D uLM; uniform float uLMS; uniform float uLMK; uniform float uEdge;
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    float dc = length(vW);${a32 ? LIGHT32 : LIGHT}
  }`);
    };
    return m;
  }
  /** огни кадра: list = [[x, z, радиус м, сила, hex], …]; me — позиция героя (м) */
  setLights(list, n, me) {
    const U = this.darkU; if (!U) return;
    const k = Math.min(n, DARK.maxLights);
    for (let i = 0; i < k; i++) { const L = list[i]; U.uL.value[i].set(L[0], L[1], L[2], L[3]); U.uLC.value[i].setHex(L[4]); }
    U.uN.value = k;
    if (me) U.uMe.value.set(me.x, me.z);
  }

  // Декор (не влияет на коллизии): плоские детали пола + невысокие предметы у стены и у колонн.
  // Всё инстансами: 1 вызов отрисовки на тип.
  // v3 (this.propSet === 'v3'): те же позиции и та же последовательность rnd(), но вместо мешей — спрайты x64 (README §5, this.decor);
  // пятна (stains) — по-прежнему меши, «звёзды» пола — плоские декали со свечением arena_stardot (buildDots).
  buildProps(THREE, g, abyss, AT = abyss ? 'abyss' : 'crypt') {
    const R = ARENA_RADIUS;
    let seed = abyss ? 99 : 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const V3 = this.propSet === 'v3', D = V3 ? (this.decor = []) : null;
    // spr: [ключ, масштаб спрайта от o, подъём] — v3 кладёт спрайт в (o.x, o.z) вместо экземпляра меша; высота видимого арта ≈ высоте меша
    const inst = (geo, mat, n, place, spr) => {
      const im = V3 && spr ? null : new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) {
        const o = place(i);
        if (!im) { D.push([spr[0], o.x, o.z, spr[1](o)]); continue; }
        e.set(o.rx || 0, o.ry || 0, o.rz || 0); q.setFromEuler(e);
        v.set(o.x, o.y || 0, o.z); sc.set(o.s, o.sy || o.s, o.sz || o.s);
        m4.compose(v, q, sc); im.setMatrixAt(i, m4);
      }
      if (!im) { geo.dispose(); return null; }
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = true;
      g.add(im);
      return im;
    };
    const ring = (rMin, rMax) => { const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin); return { x: Math.cos(a) * r, z: Math.sin(a) * r, a }; };
    // обломки/камни вдоль стены (Dodecahedron r0.5: высота ≈ s·sy → арт 1.5 м)
    const rubbleMat = new THREE.MeshStandardMaterial({ color: abyss ? 0x272552 : 0x2b2222, flatShading: true, roughness: 0.95 });
    inst(new THREE.DodecahedronGeometry(0.5, 0), rubbleMat, 70, () => { const p = ring(R - 3.2, R + 0.5); return { ...p, y: 0.15, s: 0.4 + rnd() * 0.9, sy: 0.3 + rnd() * 0.5, ry: rnd() * 6 }; },
      ['arena_rubble_' + AT, (o) => Math.max(0.35, o.s * 0.75)]);
    if (abyss) {
      // кристаллы Аринара у стены (Octahedron: высота s·sy → арт 2.7 м)
      const crMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0e7490, emissiveIntensity: 0.6, roughness: 0.25, flatShading: true });
      inst(new THREE.OctahedronGeometry(0.5, 0), crMat, 28, () => { const p = ring(R - 2.2, R + 1); return { ...p, y: 0.6, s: 0.5 + rnd() * 0.6, sy: 1 + rnd() * 1.6, rz: (rnd() - 0.5) * 0.5 }; },
        [AT === 'mirror' ? 'arena_crystal_mirror' : 'arena_crystal_abyss', (o) => (o.s * o.sy + 0.6) / 2.7]);
      // светящиеся пятна-«звёзды» на полу
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.18, depthWrite: false });
      const dots = V3 ? (this.decorDots = []) : null;
      inst(new THREE.CircleGeometry(0.5, 8), dotMat, 60, () => { const p = ring(6, R - 4); const o = { ...p, y: 0.015, s: 0.4 + rnd() * 1.4, rx: -Math.PI / 2 }; dots?.push(o); return o; }, V3 ? ['', () => 0] : null);
      if (V3) D.splice(D.length - 60, 60); // «звёзды» — не стоячие спрайты, а декали (buildDots)
    } else {
      // надгробия и свечи у стены (Box 1.2 м → арт 2.2 м)
      const graveMat = new THREE.MeshStandardMaterial({ color: 0x3a3238, flatShading: true, roughness: 0.9 });
      inst(new THREE.BoxGeometry(0.9, 1.2, 0.25), graveMat, 22, () => { const p = ring(R - 2.0, R - 0.8); return { ...p, y: 0.5, s: 0.8 + rnd() * 0.4, ry: -p.a + Math.PI / 2 + (rnd() - 0.5) * 0.4, rz: (rnd() - 0.5) * 0.25 }; },
        [AT === 'abode' ? 'arena_tombstone_abode' : 'arena_tombstone_crypt', (o) => o.s * 0.7]);
      const candles = Array.from({ length: 40 }, () => { const p = ring(R - 2.6, R - 0.6); return { ...p, s: 0.8 + rnd() * 0.8 }; });
      const CK = AT === 'abode' ? 'arena_candles_abode' : 'arena_candles';
      inst(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }), candles.length, (i) => ({ ...candles[i], y: 0.2 * candles[i].s }), [CK, (o) => o.s * 0.3]);
      if (!V3) inst(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffc46b }), candles.length, (i) => ({ x: candles[i].x, z: candles[i].z, y: 0.4 * candles[i].s + 0.06, s: 1, sy: 1.6 })); // v3: огонёк уже в спрайте
      // кости / черепки на полу (плоские)
      const boneMat = new THREE.MeshStandardMaterial({ color: 0x6b6152, roughness: 1 });
      inst(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 4), boneMat, 50, () => { const p = ring(7, R - 3); return { ...p, y: 0.04, s: 0.7 + rnd() * 0.6, rx: Math.PI / 2, rz: rnd() * 6 }; }, ['arena_bones', (o) => o.s * 0.35]);
      // тёмные пятна: v2 — меш; v3 — декали arena32 на тех же местах (та же последовательность rnd(), запекаются в пол)
      const stain = () => { const p = ring(4, R - 2); return { ...p, y: 0.012, s: 0.8 + rnd() * 2.2, sz: 0.6 + rnd(), rx: -Math.PI / 2 }; };
      if (V3) { this.stains32 = Array.from({ length: 26 }, stain); }
      else { const stainMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }); inst(new THREE.CircleGeometry(1, 10), stainMat, 26, stain); }
    }
    // мох/трава у колонн (Cone 0.45 м → арт 0.8 м)
    const tuftMat = new THREE.MeshStandardMaterial({ color: abyss ? 0x3730a3 : 0x3f4a2a, flatShading: true });
    inst(new THREE.ConeGeometry(0.12, 0.45, 3), tuftMat, PILLARS.length * 6, (i) => {
      const p = PILLARS[Math.floor(i / 6)]; const a = rnd() * Math.PI * 2, r = p.r + 0.2 + rnd() * 0.6;
      return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, y: 0.2, s: 0.8 + rnd() * 0.8 };
    }, [abyss ? 'arena_tuft_abyss' : 'arena_tuft_crypt', (o) => o.s * 0.5]);
  }
  // v3: «звёзды» пола — плоские аддитивные декали кадра arena_stardot (только _glow), общая полоса кадров
  buildDots(THREE, g, tex) {
    const d = tex.META.keys.arena_stardot, G = d && tex[d.glow?.sheet]; if (!G) return;
    const st = keyStrip(THREE, G.userData?.src || G.image, tex.META.sheets[d.sheet], d); pixTex(THREE, st.tex);
    const mat = new THREE.MeshBasicMaterial({ map: st.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const L = this.decorDots, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 3.2), mat, L.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    L.forEach((o, i) => { m4.compose(new THREE.Vector3(o.x, o.y, o.z), q, new THREE.Vector3(o.s * 0.6, o.s * 0.6, 1)); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.renderOrder = 1; g.add(im); this.dotStrip = st; this.dotDef = d;
  }

  /** освободить то, что не убирает RunView.dispose (канвас пола arena32) */
  dispose() { this.gone = true; this.a32?.dispose(); this.a32 = null; }

  update(dt) {
    this.time += dt;
    if (this.sigil) this.sigil.rotation.z += dt * 0.2;
    if (this.sigilTex) { const d = this.sigilDef; this.sigilTex.offset.x = (d.col + (Math.floor(this.time * d.fps) % d.frames)) / this.sigilCols; }
    if (this.sigilStrip) { const d = this.sigilDef; stripFrame(this.sigilStrip, Math.floor(this.time * d.fps) % d.frames); }
    if (this.dotStrip) { const d = this.dotDef; stripFrame(this.dotStrip, Math.floor(this.time * d.fps) % d.frames); }
    this.a32?.update(this.time);
    this.flames?.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(this.time * 9 + i) * 0.25; });
    if (this.embers) {
      const a = this.embers.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.array[i * 3 + 1] + dt * (0.5 + (i % 5) * 0.15);
        if (y > 8) y = 0;
        a.array[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
    }
  }
}
