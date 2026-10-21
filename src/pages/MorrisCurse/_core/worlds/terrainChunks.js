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
import tDark from '../../../../assets/mc/city/tiles_dark.png';
import darkMeta from '../../../../assets/mc/city/tiles_dark.json';
import { loadPropTextures, PropSprites } from '../engine/propAtlas.js';
import { WORLD_GEN, regionAt } from '../../../../../server/meta/zoneGen.ts';
import { markersOf } from '../../../../../server/meta/markers.ts';
import { STATIC_NPCS as NPCS, ZONE_RESPAWN } from '../../../../../server/meta/shared.ts';
import { BIOMES } from '../../../../../server/meta/biomes.ts';
import { worldSize, ARINAR_HUB } from '../../../../../server/worlds/sizes.ts';
import { WORLD_PORTALS as PORTALS } from '../../../../../server/worlds/portals.ts';
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ, PX } from '../engine/geometry.js';

import { CELL, CH, arinarPlan, layoutChunk } from '../../../../../server/meta/arinarLayout.ts';
export { CELL, CH, arinarPlan, layoutChunk };
const TEX = tilesMeta.tile, T = tilesMeta.index, COLS = tilesMeta.cols;
const SHEET = { b_ice: 1, b_fire: 2, b_stone: 3, b_air: 4 };
const FAR_COL = { grass: '#3d5a3a', grove: '#2f4d33', meadow: '#4a4f70', garden: '#5a3a3a', waste: '#3a4458', rot: '#3d4426', ridge: '#4a4038', pylon: '#3c3a52',
  glitch: '#24402e', crater: '#3a3a4a', thin: '#4a4250', dirt: '#5a4a34', cobble: '#55525a', plaza: '#6a6270', water: '#203a5a',
  b_ice: '#7a8fb0', b_fire: '#1d3060', b_stone: '#5c636e', b_air: '#2a1f4a', city: '#1d1a26' };

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
    this.maxLive = /Mobi|Android|iPhone/i.test(globalThis.navigator?.userAgent || '') ? 28 : 42; // запас над видимыми (~25 при 30 клетках): без выгрузки/перебейка при ходьбе
    this.ground = null; this.batch = null;
  }
  async init(px = ZONE_RESPAWN.x, py = ZONE_RESPAWN.y) {
    const THREE = this.THREE;
    this.sheets = await Promise.all([tilesSrc, tIce, tFire, tStone, tAir].map((s) => loadImg(url(s))));
    this.dark = await loadImg(url(tDark)).catch(() => null); // Альказак: тайлсет «очернённое средневековье» 32 px (карта Историка)
    this.ptex = await loadPropTextures(THREE); // пропсы v2 (props_p32/b64 + свечение)
    // дальняя плоскость: 1 px = 1 клетка, цвет биома
    const n = this.plan.n, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(n / 4); // 375×375: 1 px = 4×4 клетки
    const g = cv.getContext('2d');
    for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) { g.fillStyle = FAR_COL[this.plan.biomeAt(i * 4, j * 4)] || '#334'; g.fillRect(i, j, 1, 1); }
    const ft = new THREE.CanvasTexture(cv); ft.magFilter = THREE.LinearFilter;
    this.farMat = new THREE.MeshBasicMaterial({ map: ft, color: 0xb8b4c8 });
    const span = this.plan.size / PX;
    const far = new THREE.Mesh(new THREE.PlaneGeometry(span, span), this.farMat);
    far.rotation.x = -Math.PI / 2; far.position.set(toX(this.plan.size / 2), -0.25, toZ(this.plan.size / 2)); far.name = 'ground-far'; far.renderOrder = -1; // ниже чанков с запасом — без z-конфликта на дальнем зуме
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
    // чанк с городом — в родной плотности тайлов города (32 px на клетку), остальные — 16
    const DK = this.dark && L.dover?.length ? (darkMeta.tile || 32) : 0, TX = DK || TEX, DC = darkMeta.cols || 16;
    const cv = document.createElement('canvas'); cv.width = cv.height = CH * TX;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { const idx = L.base[j * CH + i], im = this.sheets[L.sheet[j * CH + i]]; g.drawImage(im, (idx % COLS) * TEX, Math.floor(idx / COLS) * TEX, TEX, TEX, i * TX, j * TX, TX, TX); }
    for (let k = 0; k < L.over.length; k += 3) { const idx = L.over[k + 2]; if (idx === undefined) continue; g.drawImage(this.sheets[0], (idx % COLS) * TEX, Math.floor(idx / COLS) * TEX, TEX, TEX, L.over[k] * TX, L.over[k + 1] * TX, TX, TX); }
    if (DK) for (let k = 0; k < L.dover.length; k += 3) { const idx = L.dover[k + 2]; g.drawImage(this.dark, (idx % DC) * DK, Math.floor(idx / DC) * DK, DK, DK, L.dover[k] * TX, L.dover[k + 1] * TX, TX, TX); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipMapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd6d2e0 }); mat.color.setScalar(0.84 * this.light);
    const sp = (CH * CELL) / PX;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sp, sp), mat);
    mesh.rotation.x = -Math.PI / 2; const cx = (ci + 0.5) * CH * CELL, cy = (cj + 0.5) * CH * CELL;
    mesh.position.set(toX(cx), 0, toZ(cy)); mesh.receiveShadow = true; mesh.name = `chunk ${ci},${cj}`;
    this.group.add(mesh);
    let batch = null;
    if (L.props.length) {
      batch = new PropSprites(THREE, this.ptex, { max: L.props.length + 2, parent: this.group });
      batch.begin();
      for (const p of L.props) batch.push(p.k, p.x, p.y, toX(p.x), toZ(p.y), p.s, p.f);
      batch.end(); batch.setLight(this.light); for (const B of batch.list) B.mesh.name = 'props';
    }
    const c = { key, ci, cj, mesh, mat, tex, batch, used: performance.now(), props: L.props };
    this.chunks.set(key, c);
    this.stats.baked++; this.stats.bakeMs = Math.round((this.stats.bakeMs * 0.8 + (performance.now() - t0) * 0.2) * 10) / 10;
    return c;
  }
  drop(c) {
    this.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mat.dispose(); c.tex.dispose();
    if (c.batch) c.batch.dispose(this.group);
    this.chunks.delete(c.key); this.stats.evicted++;
  }
  /** кадр: px,py — фокус камеры (px мира). Бакает недостающие видимые чанки (бюджет), выгружает дальние */
  update(px, py, budget = 1, view = null) {
    // область стрима — от фактического обзора камеры (+запас 1 чанк), не меньше прежних ±1900×±1600
    const S = CH * CELL, rx = Math.max(1900, (view?.rx || 0) + S), ry = Math.max(1600, (view?.ry || 0) + S), now = performance.now();
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
