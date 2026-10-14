// Аринар 48000×48000 px (1500×1500 клеток по 32 px мира, тайл 16 px арта): земля стримится ЧАНКАМИ.
// Чанк = 32×32 клетки (1024 px мира, канвас 512×512): запекается по требованию вокруг камеры (бюджет — 1–2 чанка
// за кадр), LRU-кэш выгружает дальние. Под чанками — дешёвая «дальняя» плоскость 750×750 (1 px = клетка, цвет биома),
// чтобы на границе стрима не было дыр. Раскладка детерминирована (одинакова у всех клиентов): биом клетки —
// регион zoneGen (пятна Вороного, как в Minecraft) + шум границ; биомы Аринара рисуются своими тайлсетами (tiles_<ice|fire|stone|air>.png).
import tilesSrc from '../../../../assets/mc/tiles_atlas.png';
import tilesMeta from '../../../../assets/mc/tiles_atlas.json';
import tIce from '../../../../assets/mc/tiles_ice.png';
import tFire from '../../../../assets/mc/tiles_fire.png';
import tStone from '../../../../assets/mc/tiles_stone.png';
import tAir from '../../../../assets/mc/tiles_air.png';
import propsSrc from '../../../../assets/mc/props_atlas.png';
import propsMeta from '../../../../assets/mc/props_atlas.json';
import { WORLD_GEN, regionAt } from '../../../../../server/meta/zoneGen.ts';
import { NPCS, ZONE_RESPAWN } from '../../../../../server/meta/shared.ts';
import { BIOMES } from '../../../../../server/meta/biomes.ts';
import { worldSize, ARINAR_HUB } from '../../../../../server/worlds/sizes.ts';
import { WORLD_PORTALS as PORTALS } from '../../../../../server/worlds/portals.ts';
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ, PX } from '../engine/geometry.js';

export const CELL = 32, CH = 32;
const TEX = tilesMeta.tile, T = tilesMeta.index, COLS = tilesMeta.cols;
const SHEET = { b_ice: 1, b_fire: 2, b_stone: 3, b_air: 4 };
const FAM = {
  grass: ['grass0', 'grass1', 'grass2', 'grass3'], grove: ['grass0', 'grass1', 'grass2', 'grass3', 'grass1'],
  meadow: ['grass0', 'grass1', 'grass_violet0', 'grass_violet1', 'grass_violet2', 'grass_white0', 'grass_white1', 'grass2'],
  garden: ['garden0', 'garden1', 'garden2', 'garden0', 'garden_flowers'], waste: ['waste0', 'waste1', 'waste2', 'waste3'],
  rot: ['rot0', 'rot1', 'rot2', 'rot3'], ridge: ['dirt0', 'dirt1', 'dirt2', 'cobble2', 'waste1'], pylon: ['cobble0', 'cobble1', 'cobble2', 'dirt2', 'brick1'],
  glitch: ['rot1', 'rot2', 'crater1', 'crater0'], crater: ['crater0', 'crater1', 'crater2', 'crater3'], thin: ['sand0', 'sand1', 'waste2', 'sand0'],
  dirt: ['dirt0', 'dirt1', 'dirt2'], cobble: ['cobble0', 'cobble1', 'cobble2'], plaza: ['plaza0', 'plaza1', 'plaza2', 'plaza3'], water: ['water0', 'water1', 'water2'],
  // стихийные биомы (слоты индекса те же — рисуются листом своего тайлсета)
  b_ice: ['waste0', 'waste1', 'waste2', 'waste3', 'crater0', 'grass_white0', 'waste1'],
  b_fire: ['rot0', 'rot1', 'rot2', 'rot3', 'crater1', 'waste2'],
  b_stone: ['cobble0', 'cobble1', 'cobble2', 'dirt0', 'dirt1', 'crater2', 'cobble1'],
  b_air: ['crater0', 'crater1', 'crater2', 'crater3', 'plaza1', 'sand0'],
};
const GRASSY = new Set(['grass', 'grove', 'meadow', 'garden']);
const PROPS = {
  grass: { d: 0.05, list: [['tree', 3], ['bush', 3], ['violets', 2], ['rock', 1]] },
  grove: { d: 0.13, list: [['pome_tree', 3], ['tree', 4], ['bush', 3], ['violets', 2], ['mushroom', 1]] },
  meadow: { d: 0.08, list: [['violets', 7], ['bush', 2], ['pome_tree', 1], ['rock', 1]] },
  garden: { d: 0.11, list: [['pome_tree', 7], ['violets', 3], ['bush', 2], ['fence', 1]] },
  waste: { d: 0.05, list: [['rock', 4], ['dead_tree', 2], ['star_crystal', 1]] },
  rot: { d: 0.06, list: [['mushroom', 4], ['dead_tree', 2], ['rock', 2], ['tombstone', 1]] },
  ridge: { d: 0.07, list: [['rock', 5], ['star_crystal', 2], ['dead_tree', 1]] },
  pylon: { d: 0.05, list: [['pylon', 3], ['crystal', 1], ['rock', 1]] },
  glitch: { d: 0.05, list: [['glitch_shard', 4], ['crystal', 1], ['rock', 1]] },
  crater: { d: 0.05, list: [['crystal', 3], ['star_crystal', 2], ['rock', 2]] },
  thin: { d: 0.05, list: [['tombstone', 3], ['ruin_pillar', 2], ['obelisk', 1], ['dead_tree', 1]] },
  b_ice: { d: 0.05, list: [['crystal', 4], ['rock', 3], ['dead_tree', 2], ['tombstone', 1]] },
  b_fire: { d: 0.05, list: [['crystal', 3], ['dead_tree', 3], ['rock', 2], ['torch', 1]] },
  b_stone: { d: 0.06, list: [['rock', 5], ['ruin_pillar', 2], ['pylon', 1], ['obelisk', 1]] },
  b_air: { d: 0.05, list: [['star_crystal', 4], ['obelisk', 2], ['glitch_shard', 2], ['crystal', 1]] },
  edge: { d: 0.4, list: [['tree', 6], ['bush', 2], ['dead_tree', 1]] },
};
const FAR_COL = { grass: '#3d5a3a', grove: '#2f4d33', meadow: '#4a4f70', garden: '#5a3a3a', waste: '#3a4458', rot: '#3d4426', ridge: '#4a4038', pylon: '#3c3a52',
  glitch: '#24402e', crater: '#3a3a4a', thin: '#4a4250', dirt: '#5a4a34', cobble: '#55525a', plaza: '#6a6270', water: '#203a5a',
  b_ice: '#7a8fb0', b_fire: '#1d3060', b_stone: '#5c636e', b_air: '#2a1f4a' };

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); }

// ---------- раскладка (чистые функции: тестируемы без DOM) ----------
export function arinarPlan() {
  const gen = WORLD_GEN.arinar, size = worldSize('arinar'), seed = 7;
  const center = { x: ARINAR_HUB.x, y: ARINAR_HUB.y };
  const portals = PORTALS.filter((p) => (p.world || 'hellfire') === 'arinar');
  const npcs = Object.values(NPCS).filter((p) => p.world === 'arinar');
  const pois = [...portals.map((p) => ({ x: p.x, y: p.y })), ...npcs.map((p) => ({ x: p.x, y: p.y })), { x: ZONE_RESPAWN.x, y: ZONE_RESPAWN.y }];
  const roads = [];
  pois.forEach((p) => roads.push([center.x, center.y, p.x, p.y, 26, 'cobble']));
  for (const r of gen.regions) {
    if (r.id === 'hub' || (r.kind && !r.seed)) continue; // пятна биомов: одна дорога в «семя» пятна
    const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2, kx = center.x + (cx - center.x) * 0.5;
    roads.push([center.x, center.y, kx, center.y + (cy - center.y) * 0.5, 48, 'dirt'], [kx, center.y + (cy - center.y) * 0.5, cx, cy, 40, 'dirt']);
  }
  const K = size / 24000; // базовые единицы 24000 → мир
  const waters = [{ x: 10400, y: 13700, r: 260 }, { x: 13600, y: 10300, r: 220 }, { x: 9800, y: 4000, r: 420 }, { x: 20500, y: 12000, r: 360 }, { x: 14000, y: 20000, r: 380 }, { x: 3500, y: 12500, r: 400 }].map((w) => ({ x: w.x * K, y: w.y * K, r: w.r * (K > 1 ? 1.5 : 1) }));
  // клетки → регион: грубая сетка-индекс (регионов ~22, клеток 750² — без индекса дорого)
  const plazaR = 260;
  waters.push({ x: center.x + 420, y: center.y + 420, r: 150 }); // пруд хаба
  const roadIdx = new Map(); // ячейка 1000 px → дороги рядом
  roads.forEach((rd, k) => {
    const x0 = Math.min(rd[0], rd[2]) - 60, x1 = Math.max(rd[0], rd[2]) + 60, y0 = Math.min(rd[1], rd[3]) - 60, y1 = Math.max(rd[1], rd[3]) + 60;
    for (let gx = Math.floor(x0 / 1000); gx <= Math.floor(x1 / 1000); gx++) for (let gy = Math.floor(y0 / 1000); gy <= Math.floor(y1 / 1000); gy++) {
      const key = gx * 1000 + gy; if (!roadIdx.has(key)) roadIdx.set(key, []); roadIdx.get(key).push(k);
    }
  });
  function biomeAt(i, j) {
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
    const outside = x < 0 || y < 0 || x > size || y > size;
    const jx = x + (vnoise(x / 180, y / 180, seed) - 0.5) * 220, jy = y + (vnoise(x / 180, y / 180, seed + 11) - 0.5) * 220;
    let b = 'grass';
    { const r = regionAt(Math.min(size - 1, Math.max(0, jx)), Math.min(size - 1, Math.max(0, jy)), 'arinar'); if (r) b = r.biome; } // O(1): сетка пятен
    if (outside) return b.startsWith('b_') ? b : 'grove';
    for (const wv of waters) { if (Math.abs(x - wv.x) < wv.r + 40 && Math.abs(y - wv.y) < wv.r + 40 && Math.hypot(x - wv.x, y - wv.y) + (vnoise(x / 40, y / 40, seed + 3) - 0.5) * 40 < wv.r) return 'water'; }
    const ids = roadIdx.get(Math.floor(x / 1000) * 1000 + Math.floor(y / 1000));
    if (ids) for (const k of ids) { const rd = roads[k]; if (segDist(x, y, rd[0], rd[1], rd[2], rd[3]) + (vnoise(x / 50, y / 50, seed + 7) - 0.5) * 12 < rd[4]) return b.startsWith('b_') && rd[5] === 'dirt' ? b : rd[5]; }
    if (Math.hypot(x - center.x, y - center.y) < plazaR) return 'plaza';
    if (portals.some((p) => Math.hypot(x - p.x, y - p.y) < 64)) return 'cobble';
    return b;
  }
  const keepClear = (x, y) => pois.some((p) => Math.abs(x - p.x) < 100 && Math.abs(y - p.y) < 100) || Math.hypot(x - center.x, y - center.y) < plazaR + 40;
  return { size, seed, center, portals, npcs, pois, plazaR, biomeAt, keepClear, n: Math.ceil(size / CELL) };
}

/** чанк (ci,cj): тайлы [лист, индекс] на CH×CH клеток + оверлеи + пропсы (px мира) */
export function layoutChunk(plan, ci, cj) {
  const i0 = ci * CH, j0 = cj * CH, W = CH + 2;
  const bio = new Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) bio[j * W + i] = plan.biomeAt(i0 + i - 1, j0 + j - 1);
  const sheet = new Uint8Array(CH * CH), base = new Uint16Array(CH * CH), over = [], props = [];
  const at = (i, j) => bio[(j + 1) * W + (i + 1)];
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const b = at(i, j), fam = FAM[b] || FAM.grass, gi = i0 + i, gj = j0 + j;
    let name;
    if (b === 'plaza') { const d = Math.hypot((gi + 0.5) * CELL - plan.center.x, (gj + 0.5) * CELL - plan.center.y); name = Math.abs(d - plan.plazaR * 0.6) < 18 || d < 30 ? 'plaza_rune' : fam[(gi & 1) + 2 * (gj & 1)]; }
    else name = fam[Math.floor(hash2(gi, gj, plan.seed) * fam.length) % fam.length];
    base[j * CH + i] = T[name] ?? 0; sheet[j * CH + i] = SHEET[b] || 0;
    if (!GRASSY.has(b)) {
      if (b === 'water') { if (at(i, j - 1) !== 'water') over.push(i, j, T.shore_n); if (at(i, j + 1) !== 'water') over.push(i, j, T.shore_s); if (at(i + 1, j) !== 'water') over.push(i, j, T.shore_e); if (at(i - 1, j) !== 'water') over.push(i, j, T.shore_w); }
      else { if (GRASSY.has(at(i, j - 1))) over.push(i, j, T.fringe_n); if (GRASSY.has(at(i, j + 1))) over.push(i, j, T.fringe_s); if (GRASSY.has(at(i + 1, j))) over.push(i, j, T.fringe_e); if (GRASSY.has(at(i - 1, j))) over.push(i, j, T.fringe_w); }
    }
    if (b === 'water' || b === 'dirt' || b === 'cobble' || b === 'plaza') continue;
    const x = (gi + hash2(gi, gj, 91)) * CELL, y = (gj + hash2(gi, gj, 92)) * CELL;
    const outside = x < -8 || y < -8 || x > plan.size + 8 || y > plan.size + 8;
    const tbl = outside && !b.startsWith('b_') ? PROPS.edge : (PROPS[b] || PROPS.grass);
    if (hash2(gi, gj, 93) > tbl.d || (!outside && plan.keepClear(x, y))) continue;
    let s = 0; for (const [, w] of tbl.list) s += w;
    let r = hash2(gi, gj, 94) * s, k = tbl.list[0][0];
    for (const [nm, w] of tbl.list) { r -= w; if (r <= 0) { k = nm; break; } }
    props.push({ k, x, y, s: 0.85 + hash2(gi, gj, 95) * 0.3, f: hash2(gi, gj, 96) < 0.5 });
  }
  // хаб: гранатовые деревья и фиалки по кругу площади, фонари, колодец (лор Гранатового двора)
  const c = plan.center, R0 = plan.plazaR;
  const extra = [];
  for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; extra.push({ k: 'pome_tree', x: c.x + Math.cos(ang) * (R0 + 70), y: c.y + Math.sin(ang) * (R0 + 70), s: 1.1, f: a % 2 === 0 }); extra.push({ k: 'violets', x: c.x + Math.cos(ang + 0.26) * (R0 + 30), y: c.y + Math.sin(ang + 0.26) * (R0 + 30), s: 1, f: false }); }
  for (let a = 0; a < 4; a++) { const ang = (a / 4) * Math.PI * 2 + Math.PI / 4; extra.push({ k: 'lantern', x: c.x + Math.cos(ang) * (R0 + 8), y: c.y + Math.sin(ang) * (R0 + 8), s: 1, f: false }); }
  extra.push({ k: 'well', x: c.x + 150, y: c.y + 140, s: 1, f: false }, { k: 'signpost', x: c.x - 120, y: c.y - 160, s: 1, f: false });
  plan.portals.forEach((p) => extra.push({ k: 'torch', x: p.x - 50, y: p.y + 6, s: 1, f: false }, { k: 'torch', x: p.x + 50, y: p.y + 6, s: 1, f: true }));
  plan.npcs.forEach((p, idx) => extra.push({ k: idx % 2 ? 'crate' : 'barrel', x: p.x - 40, y: p.y - 14, s: 1, f: false }, { k: 'campfire', x: p.x + 42, y: p.y - 10, s: 1, f: false }));
  const x0 = i0 * CELL, y0 = j0 * CELL, x1 = x0 + CH * CELL, y1 = y0 + CH * CELL;
  for (const p of extra) if (p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1) props.push(p);
  props.sort((a, b) => a.y - b.y);
  return { ci, cj, sheet, base, over, props };
}

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s);
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img ' + src)); im.src = src; });

export class ArinarTerrain {
  constructor(THREE) {
    this.THREE = THREE;
    this.group = new THREE.Group(); this.group.name = 'terrain-arinar-chunks';
    this.plan = arinarPlan();
    this.chunks = new Map(); // key → {mesh, batch, tex, used}
    this.layout = { world: 'arinar', props: [], size: this.plan.size, chunked: true };
    this.light = 1;
    this.stats = { baked: 0, live: 0, evicted: 0, bakeMs: 0 };
    this.maxLive = /Mobi|Android|iPhone/i.test(globalThis.navigator?.userAgent || '') ? 20 : 30;
    this.ground = null; this.batch = null;
  }
  async init(px = ZONE_RESPAWN.x, py = ZONE_RESPAWN.y) {
    const THREE = this.THREE;
    this.sheets = await Promise.all([tilesSrc, tIce, tFire, tStone, tAir].map((s) => loadImg(url(s))));
    this.ptex = await loadAtlasTexture(THREE, url(propsSrc));
    // дальняя плоскость: 1 px = 1 клетка, цвет биома
    const n = this.plan.n, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(n / 4); // 375×375: 1 px = 4×4 клетки
    const g = cv.getContext('2d');
    for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) { g.fillStyle = FAR_COL[this.plan.biomeAt(i * 4, j * 4)] || '#334'; g.fillRect(i, j, 1, 1); }
    const ft = new THREE.CanvasTexture(cv); ft.magFilter = THREE.LinearFilter;
    this.farMat = new THREE.MeshBasicMaterial({ map: ft, color: 0xb8b4c8 });
    const span = this.plan.size / PX;
    const far = new THREE.Mesh(new THREE.PlaneGeometry(span, span), this.farMat);
    far.rotation.x = -Math.PI / 2; far.position.set(toX(this.plan.size / 2), -0.02, toZ(this.plan.size / 2)); far.name = 'ground-far';
    this.group.add(far); this.ground = far;
    // старт: 3×3 вокруг точки входа сразу
    const ci = Math.floor(px / (CH * CELL)), cj = Math.floor(py / (CH * CELL));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) this.bake(ci + a, cj + b);
    this.layout.props = [...this.chunks.values()].flatMap((c) => c.props); // тени/огни хаба (atmosphere.setScene)
    return this;
  }
  bake(ci, cj) {
    const key = ci * 1000 + cj;
    if (this.chunks.has(key)) return this.chunks.get(key);
    const t0 = performance.now(), THREE = this.THREE;
    const L = layoutChunk(this.plan, ci, cj);
    const cv = document.createElement('canvas'); cv.width = cv.height = CH * TEX;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { const idx = L.base[j * CH + i], im = this.sheets[L.sheet[j * CH + i]]; g.drawImage(im, (idx % COLS) * TEX, Math.floor(idx / COLS) * TEX, TEX, TEX, i * TEX, j * TEX, TEX, TEX); }
    for (let k = 0; k < L.over.length; k += 3) { const idx = L.over[k + 2]; if (idx === undefined) continue; g.drawImage(this.sheets[0], (idx % COLS) * TEX, Math.floor(idx / COLS) * TEX, TEX, TEX, L.over[k] * TEX, L.over[k + 1] * TEX, TEX, TEX); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipMapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd6d2e0 }); mat.color.setScalar(0.84 * this.light);
    const sp = (CH * CELL) / PX;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sp, sp), mat);
    mesh.rotation.x = -Math.PI / 2; const cx = (ci + 0.5) * CH * CELL, cy = (cj + 0.5) * CH * CELL;
    mesh.position.set(toX(cx), 0, toZ(cy)); mesh.receiveShadow = true; mesh.name = `chunk ${ci},${cj}`;
    this.group.add(mesh);
    let batch = null;
    if (L.props.length) {
      const [cw, ch] = propsMeta.cell;
      batch = new SpriteBatch(THREE, this.ptex, { cellW: cw, cellH: ch, cols: propsMeta.cols, rows: propsMeta.rows, max: L.props.length + 2, light: 1 });
      batch.begin();
      for (const p of L.props) { const e = propsMeta.index[p.k]; if (e) batch.push(toX(p.x), 0, toZ(p.y), (ch / 10) * p.s, e[0], e[1], p.f); }
      batch.end(); batch.setLight?.(this.light); batch.mesh.name = 'props'; this.group.add(batch.mesh);
    }
    const c = { key, ci, cj, mesh, mat, tex, batch, used: performance.now(), props: L.props };
    this.chunks.set(key, c);
    this.stats.baked++; this.stats.bakeMs = Math.round((this.stats.bakeMs * 0.8 + (performance.now() - t0) * 0.2) * 10) / 10;
    return c;
  }
  drop(c) {
    this.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mat.dispose(); c.tex.dispose();
    if (c.batch) { this.group.remove(c.batch.mesh); c.batch.mesh.geometry?.dispose?.(); c.batch.mesh.material?.dispose?.(); }
    this.chunks.delete(c.key); this.stats.evicted++;
  }
  /** кадр: px,py — фокус камеры (px мира). Бакает недостающие видимые чанки (бюджет), выгружает дальние */
  update(px, py, budget = 1) {
    const S = CH * CELL, rx = 1900, ry = 1600, now = performance.now();
    const c0 = Math.floor((px - rx) / S), c1 = Math.floor((px + rx) / S), r0 = Math.floor((py - ry) / S), r1 = Math.floor((py + ry) / S);
    const want = [];
    for (let ci = c0; ci <= c1; ci++) for (let cj = r0; cj <= r1; cj++) {
      if (ci < -1 || cj < -1 || ci * S > this.plan.size + S || cj * S > this.plan.size + S) continue;
      const c = this.chunks.get(ci * 1000 + cj);
      if (c) c.used = now; else want.push([ci, cj, Math.hypot((ci + 0.5) * S - px, (cj + 0.5) * S - py)]);
    }
    want.sort((a, b) => a[2] - b[2]);
    for (let k = 0; k < Math.min(budget, want.length); k++) this.bake(want[k][0], want[k][1]).used = now;
    if (this.chunks.size > this.maxLive) {
      const old = [...this.chunks.values()].sort((a, b) => a.used - b.used);
      for (const c of old.slice(0, this.chunks.size - this.maxLive)) if (c.used < now) this.drop(c);
    }
    this.stats.live = this.chunks.size;
  }
  setLight(k) {
    this.light = k;
    for (const c of this.chunks.values()) { c.mat.color.setScalar(0.84 * k); c.batch?.setLight?.(k); }
    this.farMat.color.setScalar(0.72 * k);
  }
}
