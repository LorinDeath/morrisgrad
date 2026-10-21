// Арена забега 32 px (Художник, assets/mc/arena32, README §4): пол из 6 вариантов, кромка (12 тайлов автотайла) вместо торус-обода,
// парапет (10 кусков) спрайтами PropSprites или запечённый в канвас пола, декали (трещины и пятна) вместо меша stains.
// Только отрисовка: коллайдер арены остаётся ARENA_RADIUS (data.js), механика и спавн не зависят от набора.
// Включается вместе с arena3 (админка «🖼 Графика»); настройки arena3Wall/Posts/Tall/TallGap/Rim/Cracks/GlowW — со следующей арены.
// Цвет — правило pixColor.js: канвас/полосы пиксель-арта — pixTex(), материалы — pixMat(), множители — setDisplayRGB().
// Свечение (_glow) не запечено в основу: отдельные аддитивные слои (InstancedMesh на ключ, кадры — общая полоса keyStrip).
import { PropSprites, keyStrip, stripFrame } from '../engine/propAtlas.js';
import { GFX, IS_MOBILE, PROP_FPS, PROP_GLOW } from '../engine/gfxCfg.js';
import { PILLARS } from './run.js';
import { pixTex, pixMat, setDisplayRGB } from '../engine/pixColor.js';

import { TILE_M, layoutArena32 } from './arena32Layout.js';
export { TILE_M };
export const TPX = 32, PXM = 20;
// Свет арены 32 (makeDarkFloor a32): пол = пиксель атласа × свет в экранном пространстве (pixColor.js), без ACES — как спрайты и превью Художника.
// свет = фон темы (админка arena3Amb) + карта света bakeArenaLight (сигил, колонны, свечи, кристаллы, кромка; × arena3Lit) + герой + огни боя.
// Раньше пол шёл через линейный × ACES с фоном старой арены 0.13 (× TILE_DARK 0.4 у «Бездны») и виньеткой 0.35 → почти чёрный; A32_FLOOR_K был заплаткой.
export const A32_FLOOR_K = { crypt: 1, abyss: 1, mirror: 1, abode: 1 }; // поправка пола по темам поверх света, × админка arena3Floor
// запечённый парапет: свет стены в том же экранном пространстве, что у спрайтов (A.wallLight) — поправка не нужна
export const A32_BAKED_WALL_K = 1;
// огни карты света: [цвет | null — акцент темы, радиус м, сила (экранный ×)]
export const A32_LIGHTS = { sigil: [null, 11, 0.5], column: [null, 6.5, 0.42], candles: [0xffb45a, 3.4, 0.38], crystal_abyss: [0x5eead4, 4.2, 0.4], crystal_mirror: [0xbfdbfe, 4.2, 0.36], rim: [null, 3.2, 0.3] };
const LM_PX = 128, LM_K = 1.5; // карта света 128² на весь квадрат пола (~1 м/px, линейная фильтрация); 255 = LM_K

/** Карта света арены: аддитивные радиальные пятна статичных огней (центроиды — места спрайтов buildProps/PILLARS) + кольцо кромки.
 *  size — сторона квадрата пола, м; decor — RunArena.decor [ключ, x, z, s]; pillars — [{x, z}]. Канвас LM_PX², значения — свет / LM_K */
export function bakeArenaLight(size, { R, accent, decor = [], pillars = [], k = 1 }) {
  const cv = document.createElement('canvas'); cv.width = cv.height = LM_PX; const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, LM_PX, LM_PX); g.globalCompositeOperation = 'lighter';
  const px = LM_PX / size, P = (m) => (m / size + 0.5) * LM_PX, rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  let n = 0;
  const spot = (x, z, [hex, r, w]) => { const [cr, cg, cb] = rgb(hex ?? accent), a = Math.min(1, (w * k) / LM_K); if (a <= 0) return;
    const G = g.createRadialGradient(P(x), P(z), 0, P(x), P(z), r * px); G.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`); G.addColorStop(0.45, `rgba(${cr},${cg},${cb},${a * 0.35})`); G.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = G; g.fillRect(P(x) - r * px, P(z) - r * px, 2 * r * px, 2 * r * px); n++; };
  spot(0, 0, A32_LIGHTS.sigil);
  for (const p of pillars) spot(p.x, p.z, A32_LIGHTS.column);
  for (const [key, x, z] of decor) { const L = /candles/.test(key) ? A32_LIGHTS.candles : /crystal_mirror/.test(key) ? A32_LIGHTS.crystal_mirror : /crystal/.test(key) ? A32_LIGHTS.crystal_abyss : null; if (L) spot(x, z, L); }
  { const [hex, w, s] = A32_LIGHTS.rim, [cr, cg, cb] = rgb(hex ?? accent), a = Math.min(1, (s * k) / LM_K), c = LM_PX / 2; // кромка: кольцо света у бордюра внутрь арены
    if (a > 0) { const G = g.createRadialGradient(c, c, (R - w) * px, c, c, (R + 1.2) * px); G.addColorStop(0, `rgba(${cr},${cg},${cb},0)`); G.addColorStop(0.8, `rgba(${cr},${cg},${cb},${a})`); G.addColorStop(1, `rgba(${cr},${cg},${cb},0)`); g.fillStyle = G; g.fillRect(0, 0, LM_PX, LM_PX); n++; } }
  return { canvas: cv, lights: n, K: LM_K };
}
const GROUND_Y = 57; // земля у лицевой стороны парапета, px ячейки 32×64 (атлас: ground_y)
const W_LIFT = -(64 - GROUND_Y) / PXM; // низ ячейки под землёй: -0.35 м

let LOAD = null;
const img = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('arena32: лист не загрузился')); im.src = typeof src === 'object' && src ? (src.src || src.default || '') : src; });
/** атлас и листы (один раз за загрузку страницы; изображения — общие для всех арен, текстуры — свои у каждой арены) */
export function loadArena32() {
  if (!LOAD) LOAD = import('../engine/arena32Set.js').then(async (m) => {
    const names = Object.keys(m.SRC), ims = await Promise.all(names.map((k) => img(m.SRC[k])));
    return { META: m.META, img: Object.fromEntries(names.map((k, i) => [k, ims[i]])) };
  }).catch((e) => { LOAD = null; throw e; });
  return LOAD;
}

/** кадр 0 ключа из листа в канвас (dx, dy — px канваса) */
const blit = (g, im, S, d, dx, dy, f = 0) => g.drawImage(im, ((d.col + f) % S.cols) * S.frameW, (d.row + Math.floor((d.col + f) / S.cols)) * S.frameH, S.frameW, S.frameH, dx, dy, S.frameW, S.frameH);
/** запечь кусок парапета в пол: непрозрачные пиксели кадра 0 → цвет и альфа 254 (метка «стена» для шейдера пола: свет стены, не виньетка) */
function bakeWall(g, src, S, d, dx, dy) {
  const sx = d.col * S.frameW, sy = d.row * S.frameH, W = S.frameW, H = S.frameH;
  const A = src.data, sw = src.width, D = g.getImageData(dx, dy, W, H), o = D.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((sy + y) * sw + sx + x) * 4; if (A[i + 3] < 128) continue; const j = (y * W + x) * 4; o[j] = A[i]; o[j + 1] = A[i + 1]; o[j + 2] = A[i + 2]; o[j + 3] = 254; }
  g.putImageData(D, dx, dy);
}

/** режим парапета для этой арены: auto — ПК спрайты, телефон запечён */
export const wallMode = () => (GFX.arena3Wall === 'sprites' || GFX.arena3Wall === 'baked' ? GFX.arena3Wall : IS_MOBILE ? 'baked' : 'sprites');

/**
 * Собрать арену 32 в группу g. A — RunArena (floor, makeDarkFloor, stains32 — места пятен из buildProps), AT — тема пропсов.
 * Возвращает объект с update(t) и dispose(); до загрузки листов на месте остаётся прежний пол.
 */
export function buildArena32(THREE, A, g, { AT, R, Rf = R + TILE_M }) {
  const st = { ready: false, strips: [], mats: [], canvas: null, wall: null, mode: wallMode(), stats: null, disposed: false };
  st.promise = loadArena32().then(({ META, img: I }) => {
    if (st.disposed) return st;
    const TH = META.themes[AT] || META.themes.crypt, K = META.keys, SH = META.sheets;
    const anim = TH.floor.map((k, i) => (K[k].frames > 1 || K[k].glow ? i : -1)).filter((i) => i >= 0);
    const L = layoutArena32(Rf, { seed: AT.length * 131 + 7, glowW: GFX.arena3GlowW, anim, posts: GFX.arena3Posts });
    const N = L.N, c = L.c, cx = (x) => (x - c) * TILE_M, cz = (y) => (y - c) * TILE_M;
    // 1) пол + кромка (кадр 0), 2) декали (пятна на местах меша stains и трещины), 3) парапет — при «запечь»
    const cv = st.canvas = document.createElement('canvas'); cv.width = cv.height = N * TPX;
    const gx = cv.getContext('2d', { willReadFrequently: st.mode === 'baked' }); gx.imageSmoothingEnabled = false;
    const glowAt = {}; // ключ со свечением → [[x, z, поворот, масштаб], …]
    for (const q of L.cells) {
      const key = q.edge ? TH.edge[q.edge] : TH.floor[q.v], d = K[key];
      blit(gx, I.floor, SH.floor, d, q.x * TPX, q.y * TPX);
      if (d.glow) (glowAt[key] ||= []).push([cx(q.x), cz(q.y), 0, 1]);
    }
    // декали: поворот на 90°·k (пиксели остаются квадратными), масштаб 1 или 2 (целый — без «рваных» пикселей)
    const dec = [], decK = (n) => `arena_decal_${AT}_${n}`;
    let s2 = 4242 + AT.length; const rnd = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
    (A.stains32 || []).forEach((o, i) => dec.push([decK(i % 3 === 2 ? 'stain_1' : 'stain_0'), o.x, o.z, o.s * 0.75 > 1.4 ? 2 : 1, Math.floor(rnd() * 4)]));
    for (let i = 0; i < GFX.arena3Cracks; i++) { const a = rnd() * Math.PI * 2, r = 5 + rnd() * (R - 8); dec.push([decK(rnd() < 0.5 ? 'crack_0' : 'crack_1'), Math.cos(a) * r, Math.sin(a) * r, rnd() < 0.25 ? 2 : 1, Math.floor(rnd() * 4)]); }
    for (const [key, x, z, sc, rot] of dec) {
      const d = K[key]; if (!d) continue; const px = (x / TILE_M + c + 0.5) * TPX, py = (z / TILE_M + c + 0.5) * TPX;
      gx.save(); gx.translate(Math.round(px), Math.round(py)); gx.rotate(rot * Math.PI / 2); gx.scale(sc, sc);
      blit(gx, I.decal, SH.decal, d, -32, -32); gx.restore();
      if (d.glow) (glowAt[key] ||= []).push([x, z, rot, sc]);
    }
    if (st.mode === 'baked') {
      const wc = document.createElement('canvas'); wc.width = I.wall.width; wc.height = I.wall.height; const wg = wc.getContext('2d', { willReadFrequently: true }); wg.drawImage(I.wall, 0, 0);
      const src = wg.getImageData(0, 0, wc.width, wc.height);
      for (const q of L.wall) bakeWall(gx, src, SH.wall, K[`arena_parapet_${AT}_${q.piece}`], q.x * TPX, q.y * TPX - TPX);
    }
    const tex = pixTex(THREE, new THREE.CanvasTexture(cv)); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    // пол: квадрат N·1.6 м (тайл ровно 1.6 м), снаружи кромки — прозрачно (alphaTest); материал — тот же тёмный шейдер + метка стены
    const F = A.floor; F.geometry.dispose(); F.geometry = new THREE.PlaneGeometry(N * TILE_M, N * TILE_M);
    const m = F.material, prevMap = m.map; m.map = tex; if (prevMap && prevMap !== tex) prevMap.dispose(); // каменный холст до загрузки — освободить
    m.alphaTest = 0.5; m.transparent = false; if (A.darkU) { A.darkU.uWallK.value = st.mode === 'baked' ? A.wallLight * A32_BAKED_WALL_K : 0; A.darkU.uFloorK.value = (A32_FLOOR_K[AT] ?? 1) * GFX.arena3Floor; } m.needsUpdate = true;
    // карта света арены (одна выборка в шейдере пола; огни боя — по-прежнему uL)
    if (A.darkU) { const S = N * TILE_M, lm = bakeArenaLight(S, { R, accent: parseInt(String(TH.accent || '#c59b27').slice(1), 16), decor: A.decor || [], pillars: PILLARS, k: GFX.arena3Lit });
      const lt = st.lmTex = new THREE.CanvasTexture(lm.canvas); lt.magFilter = lt.minFilter = THREE.LinearFilter; lt.generateMipmaps = false;
      const old = A.darkU.uLM.value; A.darkU.uLM.value = lt; old?.dispose?.(); A.darkU.uLMS.value = 1 / S; A.darkU.uLMK.value = lm.K; st.lights = lm.lights; lt.onUpdate = () => { lt.onUpdate = null; lm.canvas.width = lm.canvas.height = 0; }; /* канвас — после загрузки в видеопамять */ }
    // свечение пола и декалей: InstancedMesh на ключ, кадры — полоса keyStrip листа _glow (общая фаза)
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
    for (const [key, list] of Object.entries(glowAt)) {
      const d = K[key], GS = d.glow.sheet, S = SH[GS], strip = keyStrip(THREE, I[GS], S, d); pixTex(THREE, strip.tex);
      const mat = pixMat(new THREE.MeshBasicMaterial({ map: strip.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const sz = S.frameW / PXM, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(sz, sz), mat, list.length);
      list.forEach(([x, z, rot, sc], i) => { e.set(-Math.PI / 2, 0, -rot * Math.PI / 2); q4.setFromEuler(e); v.set(x, 0.014, z); sv.set(sc, sc, 1); m4.compose(v, q4, sv); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true; im.renderOrder = 1; im.name = 'a32glow:' + key; g.add(im);
      st.strips.push({ st: strip, d }); st.mats.push(mat);
    }
    // парапет спрайтами: якорь — низ ячейки, земля ground_y=57 на линии бордюра (px 25 тайла кромки)
    let wallN = 0;
    if (st.mode === 'sprites') {
      const WS = SH.wall, wt = pixTex(THREE, new THREE.Texture(I.wall)); wt.needsUpdate = true;
      const WM = { sheets: { wall: { frameW: WS.frameW, frameH: WS.frameH, cols: WS.cols, rows: WS.rows } }, keys: K };
      const B = st.wall = new PropSprites(THREE, { META: WM, wall: wt, pxm: PXM }, { max: L.wall.length + 4, parent: g });
      B.begin();
      for (const q of L.wall) { const x = cx(q.x), z = cz(q.y) - TILE_M / 2 + (TPX - 7) / PXM; if (B.push(`arena_parapet_${AT}_${q.piece}`, q.x * 32, q.y * 32, x, z, 1, false, 1, W_LIFT, null, false)) wallN++; }
      B.end(); B.setLight(A.wallLight);
    }
    st.stats = { N, px: N * TPX, mb: +((N * TPX) ** 2 * 4 / 1048576).toFixed(1), cells: L.cells.length, wall: L.wall.length, wallSprites: wallN, posts: L.posts, tight: L.tight, thinned: L.thinned, glowKeys: Object.keys(glowAt).length, lights: st.lights || 0, amb: A.darkU?.uAmb.value, decals: dec.length, mode: st.mode };
    st.ready = true; A.floorReady = true;
    return st;
  });
  st.update = (t) => { if (!st.ready) return; const tt = t * PROP_FPS.value; for (const o of st.strips) if (o.d.frames > 1) stripFrame(o.st, Math.floor(tt * o.d.fps) % o.d.frames);
    const k = PROP_GLOW.value; for (const mt of st.mats) setDisplayRGB(mt.color, k); };
  st.dispose = () => { st.disposed = true; st.lmTex?.dispose(); st.lmTex = null; if (st.canvas) { st.canvas.width = st.canvas.height = 0; st.canvas = null; } };
  return st;
}
