// Пиксельная земля и пропсы открытых миров (единый масштаб: 10 px арта = 1 м = 20 px мира; тайл 16×16 = 32 px мира).
// Раскладка детерминирована (тот же сид для всех клиентов) и строится из регионов zoneGen (биом региона → семейство тайлов).
// Земля запекается в ОДНУ текстуру (canvas из tiles_atlas) на плоскости мира + поля по краям; пропсы — один SpriteBatch.
import tilesSrc from '../../../../assets/mc/tiles_atlas.png';
import tilesMeta from '../../../../assets/mc/tiles_atlas.json';
import { loadPropTextures, PropSprites } from '../engine/propAtlas.js';
import { WORLD_GEN, rng } from '../../../../../server/meta/zoneGen.ts';
import { NPCS, ZONE_RESPAWN } from '../../../../../server/meta/shared.ts';
import { worldSize } from '../../../../../server/worlds/sizes.ts';
import { WORLD_PORTALS as PORTALS } from '../../../../../server/worlds/portals.ts';
import { HELLFIRE_MAP_TILES } from '../../../../../server/maps/hellfireMap.ts';
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ, PX } from '../engine/geometry.js';
import { ArinarTerrain } from './terrainChunks.js';

export const CELL = 32;         // px мира на тайл
const TEX = tilesMeta.tile;     // 16 px текстуры на тайл
const MARGIN = 8;               // тайлов поля за краем мира (чтобы край не обрывался в пустоту)
const T = tilesMeta.index;

// семейства тайлов по биому (варианты выбираются шумом)
const FAM = {
  grass: ['grass0', 'grass1', 'grass2', 'grass3'],
  grove: ['grass0', 'grass1', 'grass2', 'grass3', 'grass1'],
  meadow: ['grass0', 'grass1', 'grass_violet0', 'grass_violet1', 'grass_violet2', 'grass_white0', 'grass_white1', 'grass2'],
  garden: ['garden0', 'garden1', 'garden2', 'garden0', 'garden_flowers'],
  waste: ['waste0', 'waste1', 'waste2', 'waste3'],
  rot: ['rot0', 'rot1', 'rot2', 'rot3'],
  ridge: ['dirt0', 'dirt1', 'dirt2', 'cobble2', 'waste1'],
  pylon: ['cobble0', 'cobble1', 'cobble2', 'dirt2', 'brick1'],
  glitch: ['rot1', 'rot2', 'crater1', 'crater0'],
  crater: ['crater0', 'crater1', 'crater2', 'crater3'],
  thin: ['sand0', 'sand1', 'waste2', 'sand0'],
  dirt: ['dirt0', 'dirt1', 'dirt2'],
  cobble: ['cobble0', 'cobble1', 'cobble2'],
  plaza: ['plaza0', 'plaza1', 'plaza2', 'plaza3'],
  water: ['water0', 'water1', 'water2'],
};
const GRASSY = new Set(['grass', 'grove', 'meadow', 'garden']);

// пропсы по биому: [имя, вес]; плотность — доля клеток с пропсом
const PROPS = {
  grass: { d: 0.05, list: [['tree', 3], ['bush', 3], ['violets', 2], ['rock', 1]] },
  grove: { d: 0.16, list: [['tree', 6], ['bush', 3], ['violets', 1], ['mushroom', 1], ['rock', 1]] },
  meadow: { d: 0.07, list: [['violets', 6], ['bush', 2], ['tree', 1], ['rock', 1]] },
  garden: { d: 0.12, list: [['pome_tree', 6], ['violets', 2], ['bush', 2], ['fence', 1]] },
  waste: { d: 0.06, list: [['rock', 4], ['dead_tree', 2], ['star_crystal', 1]] },
  rot: { d: 0.07, list: [['mushroom', 4], ['dead_tree', 2], ['rock', 2], ['tombstone', 1]] },
  ridge: { d: 0.08, list: [['rock', 5], ['star_crystal', 2], ['dead_tree', 1]] },
  pylon: { d: 0.05, list: [['pylon', 3], ['crystal', 1], ['rock', 1]] },
  glitch: { d: 0.06, list: [['glitch_shard', 4], ['crystal', 1], ['rock', 1]] },
  crater: { d: 0.06, list: [['crystal', 3], ['star_crystal', 2], ['rock', 2]] },
  thin: { d: 0.06, list: [['tombstone', 3], ['ruin_pillar', 2], ['obelisk', 1], ['dead_tree', 1]] },
  edge: { d: 0.55, list: [['tree', 6], ['bush', 2], ['dead_tree', 1]] },
};

function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// гладкий value-noise для размытых границ биомов
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

// Раскладка мира: что за тайл в каждой клетке (включая поля за краем) и где пропсы.
// Арена PvP-дуэли: 25×25 клеток — каменная площадка с руной в центре, стена в одну клетку по краю
// (непроходима: сервер не пускает центр героя ближе 46 px к краю), за стеной — выжженная пустошь.
function layoutArena() {
  const size = worldSize('arena');
  const n = Math.ceil(size / CELL), N = n + MARGIN * 2, seed = 23;
  const base = new Uint16Array(N * N), over = [], biome = new Array(N * N);
  const c = n / 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const ci = i - MARGIN, cj = j - MARGIN;
    const inside = ci >= 1 && cj >= 1 && ci <= n - 2 && cj <= n - 2;
    const wall = !inside && ci >= 0 && cj >= 0 && ci <= n - 1 && cj <= n - 1;
    let name, b;
    if (inside) {
      b = 'plaza';
      const d = Math.hypot(ci + 0.5 - c, cj + 0.5 - c);
      name = Math.abs(d - 5.2) < 0.55 || d < 1.1 ? 'plaza_rune' : Math.abs(d - 9.5) < 0.5 ? 'cobble' + (ci + cj) % 3 : ['plaza0', 'plaza1', 'plaza2', 'plaza3'][(ci & 1) + 2 * (cj & 1)];
    } else if (wall) {
      b = 'wall';
      name = cj === 0 ? 'wall_top' : hash2(ci, cj, seed) < 0.25 ? 'brick_moss' : hash2(ci, cj, seed + 1) < 0.5 ? 'brick0' : 'brick1';
    } else {
      b = 'waste';
      const r = hash2(i, j, seed);
      name = r < 0.18 ? 'crater' + Math.floor(r * 22) % 4 : 'waste' + Math.floor(r * 40) % 4;
    }
    base[j * N + i] = T[name] ?? 0;
    biome[j * N + i] = b;
    if (inside) {
      if (cj === 1) over.push(i, j, T.curb_n);
      if (cj === n - 2) over.push(i, j, T.curb_s);
      if (ci === 1) over.push(i, j, T.curb_w);
      if (ci === n - 2) over.push(i, j, T.curb_e);
    }
  }
  const props = [];
  // стена: колонны по периметру (через клетку) и факелы у середины каждой стороны
  for (let k = 0; k < n; k += 3) {
    const x = k * CELL + CELL / 2;
    props.push({ k: 'ruin_pillar', x, y: CELL - 2, s: 1, f: k % 2 === 0 }, { k: 'ruin_pillar', x, y: size - 2, s: 1, f: k % 2 === 1 });
    if (k > 0 && k < n - 1) props.push({ k: 'ruin_pillar', x: CELL / 2, y: k * CELL + CELL - 2, s: 1, f: false }, { k: 'ruin_pillar', x: size - CELL / 2, y: k * CELL + CELL - 2, s: 1, f: true });
  }
  for (const [x, y] of [[size / 2 - 70, CELL + 10], [size / 2 + 70, CELL + 10], [size / 2 - 70, size - CELL + 6], [size / 2 + 70, size - CELL + 6], [CELL + 12, size / 2], [size - CELL - 12, size / 2]]) props.push({ k: 'torch', x, y, s: 1, f: x > size / 2 });
  for (const [x, y] of [[CELL * 1.6, CELL * 1.8], [size - CELL * 1.6, CELL * 1.8], [CELL * 1.6, size - CELL * 0.9], [size - CELL * 1.6, size - CELL * 0.9]]) props.push({ k: 'obelisk', x, y, s: 1.05, f: x > size / 2 });
  // за стеной — пустошь: камни, надгробия, кристаллы
  const R = rng(seed * 7919 + 5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (biome[j * N + i] !== 'waste') { R(); continue; }
    const x = (i - MARGIN + R()) * CELL, y = (j - MARGIN + R()) * CELL;
    if (R() > 0.14) continue;
    const r = R();
    props.push({ k: r < 0.4 ? 'rock' : r < 0.65 ? 'tombstone' : r < 0.85 ? 'dead_tree' : 'star_crystal', x, y, s: 0.85 + R() * 0.3, f: R() < 0.5 });
  }
  props.sort((a, b) => a.y - b.y);
  return { world: 'arena', size, n, N, base, over, props, biome };
}

export function layoutWorld(world) {
  if (world === 'arena') return layoutArena();
  const w = world === 'arinar' ? 'arinar' : 'hellfire';
  const gen = WORLD_GEN[w];
  const size = worldSize(w);
  const n = Math.ceil(size / CELL);
  const N = n + MARGIN * 2;
  const seed = w === 'arinar' ? 7 : 3;
  const portals = PORTALS.filter((p) => (p.world || 'hellfire') === w);
  const npcs = Object.values(NPCS).filter((p) => p.world === w);
  const isHub = w === 'hellfire';
  const center = isHub ? { x: 565, y: 600 } : { x: ZONE_RESPAWN.x, y: ZONE_RESPAWN.y };
  const pois = [...portals.map((p) => ({ x: p.x, y: p.y })), ...npcs.map((p) => ({ x: p.x, y: p.y }))];
  // дороги: от центра к порталам/NPC/регионам
  const roads = [];
  const roadKind = isHub ? 'cobble' : 'dirt';
  pois.forEach((p) => roads.push([center.x, center.y, p.x, p.y, isHub ? 22 : 18, roadKind]));
  if (!isHub) {
    // главные тракты к центрам регионов (через «колено», чтобы дороги не были идеально прямыми)
    for (const r of gen.regions) {
      const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2;
      const kx = center.x + (cx - center.x) * 0.5, ky = cy;
      roads.push([center.x, center.y, kx, center.y + (ky - center.y) * 0.5, 20, 'dirt']);
      roads.push([kx, center.y + (ky - center.y) * 0.5, cx, cy, 18, 'dirt']);
    }
  }
  const waters = isHub
    ? [{ x: 1000, y: 1000, r: 70 }, { x: 140, y: 300, r: 60 }, { x: 980, y: 560, r: 45 }]
    : [{ x: 400, y: 1690, r: 130 }, { x: 860, y: 900, r: 70 }, { x: 1560, y: 1300, r: 60 }, { x: 2200, y: 480, r: 55 }];
  const plazaR = isHub ? 150 : 110;

  const biome = new Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i - MARGIN + 0.5) * CELL, y = (j - MARGIN + 0.5) * CELL;
    let b = 'grass';
    const outside = x < 0 || y < 0 || x > size || y > size;
    const jx = x + (vnoise(x / 90, y / 90, seed) - 0.5) * 90, jy = y + (vnoise(x / 90, y / 90, seed + 11) - 0.5) * 90;
    if (!isHub) {
      for (const r of gen.regions) {
        const [x0, y0, x1, y1] = r.rect;
        if (jx >= x0 - 40 && jx <= x1 + 40 && jy >= y0 - 40 && jy <= y1 + 40) { b = r.biome; break; }
      }
    } else {
      // поляна: светлый луг в кольце, роща у края
      const dEdge = Math.min(x, y, size - x, size - y);
      b = dEdge < 140 ? 'grove' : (vnoise(x / 160, y / 160, 5) > 0.62 ? 'meadow' : 'grass');
    }
    if (outside) b = isHub ? 'grove' : (b === 'grass' ? 'grove' : b);
    for (const wv of waters) {
      const dd = Math.hypot(x - wv.x, y - wv.y) + (vnoise(x / 40, y / 40, seed + 3) - 0.5) * 40;
      if (dd < wv.r) b = 'water';
    }
    if (b !== 'water') {
      for (const rd of roads) {
        const d = segDist(x, y, rd[0], rd[1], rd[2], rd[3]) + (vnoise(x / 50, y / 50, seed + 7) - 0.5) * 10;
        if (d < rd[4]) { b = rd[5]; break; }
      }
      if (Math.hypot(x - center.x, y - center.y) < plazaR) b = 'plaza';
      else if (portals.some((p) => Math.hypot(x - p.x, y - p.y) < 56)) b = 'cobble';
    }
    biome[j * N + i] = b;
  }

  // тайлы: базовый + оверлеи (кромка травы на дорогах, берег у воды)
  const base = new Uint16Array(N * N);
  const over = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const b = biome[j * N + i];
    const fam = FAM[b] || FAM.grass;
    const x = (i - MARGIN) * CELL, y = (j - MARGIN) * CELL;
    let name;
    if (b === 'plaza') {
      const d = Math.hypot(x + CELL / 2 - center.x, y + CELL / 2 - center.y);
      name = Math.abs(d - plazaR * 0.55) < 16 ? 'plaza_rune' : fam[(i & 1) + 2 * (j & 1)];
    } else {
      const r = hash2(i, j, seed);
      name = fam[Math.floor(r * fam.length) % fam.length];
    }
    base[j * N + i] = T[name] ?? 0;
    const at = (di, dj) => { const ii = i + di, jj = j + dj; return ii < 0 || jj < 0 || ii >= N || jj >= N ? b : biome[jj * N + ii]; };
    if (!GRASSY.has(b)) {
      if (b === 'water') {
        if (at(0, -1) !== 'water') over.push(i, j, T.shore_n);
        if (at(0, 1) !== 'water') over.push(i, j, T.shore_s);
        if (at(1, 0) !== 'water') over.push(i, j, T.shore_e);
        if (at(-1, 0) !== 'water') over.push(i, j, T.shore_w);
      } else {
        if (GRASSY.has(at(0, -1))) over.push(i, j, T.fringe_n);
        if (GRASSY.has(at(0, 1))) over.push(i, j, T.fringe_s);
        if (GRASSY.has(at(1, 0))) over.push(i, j, T.fringe_e);
        if (GRASSY.has(at(-1, 0))) over.push(i, j, T.fringe_w);
      }
    }
  }

  // пропсы: по клеткам, с отступом от точек интереса, дорог и воды
  const props = [];
  const R = rng(seed * 7919 + 13);
  const solid = new Set(isHub ? (HELLFIRE_MAP_TILES || []).filter((t) => t.layer !== 0).map((t) => t.x + '_' + t.y) : []);
  const keepClear = (x, y) => solid.has(Math.floor(x / CELL) + '_' + Math.floor(y / CELL)) || pois.some((p) => Math.hypot(x - p.x, y - p.y) < 90) || Math.hypot(x - center.x, y - center.y) < plazaR + 30;
  const pick = (list) => {
    let s = 0; for (const [, wgt] of list) s += wgt;
    let r = R() * s; for (const [nm, wgt] of list) { r -= wgt; if (r <= 0) return nm; }
    return list[0][0];
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const b = biome[j * N + i];
    if (b === 'water' || b === 'dirt' || b === 'cobble' || b === 'plaza') { R(); continue; }
    const x = (i - MARGIN + R()) * CELL, y = (j - MARGIN + R()) * CELL;
    const outside = x < -8 || y < -8 || x > size + 8 || y > size + 8;
    const tbl = outside ? PROPS.edge : (PROPS[b] || PROPS.grass);
    if (R() > tbl.d) continue;
    if (!outside && keepClear(x, y)) continue;
    props.push({ k: pick(tbl.list), x, y, s: 0.85 + R() * 0.3, f: R() < 0.5 });
  }
  // декор у центра/порталов: фонари вдоль площади, у NPC — бочки/ящики
  for (let a = 0; a < 4; a++) {
    const ang = a / 4 * Math.PI * 2 + Math.PI / 4;
    props.push({ k: 'lantern', x: center.x + Math.cos(ang) * (plazaR + 6), y: center.y + Math.sin(ang) * (plazaR + 6), s: 1, f: false });
  }
  portals.forEach((p, idx) => {
    if (p.id === 'portal_class_select') return;
    props.push({ k: 'torch', x: p.x - 50, y: p.y + 6, s: 1, f: false }, { k: 'torch', x: p.x + 50, y: p.y + 6, s: 1, f: true });
  });
  npcs.forEach((p, idx) => {
    props.push({ k: idx % 2 ? 'crate' : 'barrel', x: p.x - 40, y: p.y - 14, s: 1, f: false });
    props.push({ k: idx % 2 ? 'barrel' : 'campfire', x: p.x + 42, y: p.y - 10, s: 1, f: false });
  });
  if (!isHub) {
    props.push({ k: 'well', x: center.x + 150, y: center.y + 120, s: 1, f: false }, { k: 'signpost', x: center.x + 130, y: center.y - 60, s: 1, f: false });
    // вехи регионов: знак у входа
    for (const r of gen.regions) props.push({ k: 'signpost', x: r.rect[0] + 20, y: r.rect[1] + 30, s: 1, f: false });
  } else {
    // руины и колонны карты Поляны (коллизии те же — worldMap.js) — пиксельными пропсами
    const seen = new Set();
    for (const t of HELLFIRE_MAP_TILES || []) {
      if (t.layer === 0) continue;
      const key = t.x + '_' + t.y;
      if (seen.has(key)) continue;
      seen.add(key);
      const k = t.tileId === 'column_rune' ? 'obelisk' : ((t.x * 7 + t.y * 13) % 3 === 0 ? 'rock' : 'ruin_pillar');
      props.push({ k, x: t.x * CELL + CELL / 2, y: t.y * CELL + CELL - 4, s: k === 'rock' ? 1.2 : 0.9, f: (t.x + t.y) % 2 === 0 });
    }
    props.push({ k: 'well', x: 760, y: 470, s: 1, f: false }, { k: 'signpost', x: 380, y: 560, s: 1, f: false });
  }
  props.sort((a, b) => a.y - b.y);
  return { world: w, size, n, N, base, over, props, biome };
}

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s);
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img ' + src)); im.src = src; });
}
let tilesImg = null;
async function tilesImage() { return tilesImg || (tilesImg = await loadImg(url(tilesSrc))); }

// Запечь раскладку в canvas (1 тайл = 16×16 px текстуры)
export async function bakeGround(layout) {
  const im = await tilesImage();
  const cols = tilesMeta.cols;
  const cv = document.createElement('canvas');
  cv.width = cv.height = layout.N * TEX;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const blit = (idx, i, j) => g.drawImage(im, (idx % cols) * TEX, Math.floor(idx / cols) * TEX, TEX, TEX, i * TEX, j * TEX, TEX, TEX);
  const { N, base, over } = layout;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) blit(base[j * N + i], i, j);
  for (let k = 0; k < over.length; k += 3) blit(over[k + 2], over[k], over[k + 1]);
  // мягкое затемнение полей за краем мира (граница читается, но не обрывается)
  const m = MARGIN * TEX, S = cv.width;
  const vg = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(8,6,18,0.75)'); gr.addColorStop(1, 'rgba(8,6,18,0)'); return gr; };
  g.fillStyle = vg(0, 0, m, 0); g.fillRect(0, 0, m, S);
  g.fillStyle = vg(S, 0, S - m, 0); g.fillRect(S - m, 0, m, S);
  g.fillStyle = vg(0, 0, 0, m); g.fillRect(0, 0, S, m);
  g.fillStyle = vg(0, S, 0, S - m); g.fillRect(0, S - m, S, m);
  return cv;
}

// 3D-объект земли + пропсов; возвращает { group, setLight(k) }
export async function buildTerrain(THREE, world) {
  // Аринар 48000 px — стриминг чанков (terrainChunks.js): целиком мир в одну текстуру не влезает
  if (world === 'arinar') { const t = await new ArinarTerrain(THREE).init(); return t; }
  const L = layoutWorld(world);
  const group = new THREE.Group();
  group.name = 'terrain-' + L.world;
  const cv = await bakeGround(L);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.anisotropy = 4;
  const span = (L.N * CELL) / PX; // метры
  // пиксели «как есть» (без пересвета от hemi/sun), общий тон — множителем; туман применяется
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd6d2e0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), mat);
  ground.rotation.x = -Math.PI / 2;
  const c0 = -MARGIN * CELL + (L.N * CELL) / 2;
  ground.position.set(toX(c0), 0, toZ(c0));
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // пропсы v2: варианты и фаза анимации — по позиции, кадры играет шейдер
  const ptex = await loadPropTextures(THREE);
  const batch = new PropSprites(THREE, ptex, { max: L.props.length + 8, parent: group });
  batch.begin();
  for (const p of L.props) batch.push(p.k, p.x, p.y, toX(p.x), toZ(p.y), p.s, p.f);
  batch.end();
  for (const B of batch.list) B.mesh.name = 'props';
  return { group, layout: L, ground, batch, setLight: (k) => { batch.setLight(k); mat.color.setScalar(0.84 * k); } };
}
