// Аринар 48000×48000 px (1500×1500 клеток по 32 px мира, тайл 16 px арта): земля стримится ЧАНКАМИ.
// Чанк = 32×32 клетки (1024 px мира, канвас 512×512): запекается по требованию вокруг камеры (бюджет — 1–2 чанка
// за кадр), LRU-кэш выгружает дальние. Под чанками — дешёвая «дальняя» плоскость 750×750 (1 px = клетка, цвет биома),
// чтобы на границе стрима не было дыр. Раскладка детерминирована (одинакова у всех клиентов): биом клетки —
// регион zoneGen (пятна Вороного, как в Minecraft) + шум границ; биомы Аринара рисуются своими тайлсетами (tiles_<ice|fire|stone|air>.png).
import { TILES, TEX_MODE } from './texPref.js';
import { VRAM, vcfg } from '../engine/vramStream.js';
import { VIEW_CELLS } from '../../../../../server/worlds/sizes.ts';
const tilesMeta = TILES.meta; // 16 или 32 px — настройка «Текстуры» (texPref.js); все 5 листов одного размера
import { loadPropTextures, PropSprites } from '../engine/propAtlas.js';
import { WORLD_GEN, regionAt } from '../../../../../server/meta/zoneGen.ts';
import { markersOf } from '../../../../../server/meta/markers.ts';
import { STATIC_NPCS as NPCS, ZONE_RESPAWN } from '../../../../../server/meta/shared.ts';
import { BIOMES } from '../../../../../server/meta/biomes.ts';
import { worldSize, ARINAR_HUB } from '../../../../../server/worlds/sizes.ts';
import { WORLD_PORTALS as PORTALS } from '../../../../../server/worlds/portals.ts';
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ, PX } from '../engine/geometry.js';
import { LIGHT, onLight, pixTex, pixMat, setDisplayRGB, setDisplayHex } from '../engine/pixColor.js';

import { CELL, CH, arinarPlan, layoutChunk } from '../../../../../server/meta/arinarLayout.ts';
export { CELL, CH, arinarPlan, layoutChunk };
const TEX = tilesMeta.tile, T = tilesMeta.index, COLS = tilesMeta.cols;
const SHEET = { b_ice: 1, b_fire: 2, b_stone: 3, b_air: 4 };
const FAR_COL = { grass: '#3d5a3a', grove: '#2f4d33', meadow: '#4a4f70', garden: '#5a3a3a', waste: '#3a4458', rot: '#3d4426', ridge: '#4a4038', pylon: '#3c3a52',
  glitch: '#24402e', crater: '#3a3a4a', thin: '#4a4250', dirt: '#5a4a34', cobble: '#55525a', plaza: '#6a6270', water: '#203a5a',
  b_ice: '#7a8fb0', b_fire: '#1d3060', b_stone: '#5c636e', b_air: '#2a1f4a' };;

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
    this.maxLive = /Mobi|Android|iPhone/i.test(globalThis.navigator?.userAgent || '') ? (TEX_MODE === '32' ? 26 : 28) : 42; // аварийный потолок: радиус 56 клеток ≈ 12–16 чанков, с grace — до ~25
    this.ground = null; this.batch = null;
  }
  async init(px = ZONE_RESPAWN.x, py = ZONE_RESPAWN.y) {
    const THREE = this.THREE;
    this.sheets = await Promise.all(TILES.sheets.map((s) => loadImg(url(s))));
    this.ptex = await loadPropTextures(THREE); // пропсы v2 (props_p32/b64 + свечение)
    // дальняя плоскость: 1 px = 1 клетка, цвет биома
    const n = this.plan.n, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(n / 4); // 375×375: 1 px = 4×4 клетки
    const g = cv.getContext('2d');
    for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) { g.fillStyle = FAR_COL[this.plan.biomeAt(i * 4, j * 4)] || '#334'; g.fillRect(i, j, 1, 1); }
    const ft = new THREE.CanvasTexture(cv); ft.magFilter = THREE.LinearFilter;
    // земля — пиксели тайлов × LIGHT.ground × свет (экранный множитель, без ACES и двойного sRGB — engine/pixColor.js)
    this.farMat = pixMat(new THREE.MeshBasicMaterial({ map: pixTex(THREE, ft) })); setDisplayHex(this.farMat.color, 0xb8b4c8, this.light * LIGHT.ground / 0.84);
    onLight(() => this.setLight(this.light));
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
    const cv = document.createElement('canvas'); cv.width = cv.height = CH * TEX;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { const idx = L.base[j * CH + i], im = this.sheets[L.sheet[j * CH + i]]; g.drawImage(im, (idx % COLS) * TEX, Math.floor(idx / COLS) * TEX, TEX, TEX, i * TEX, j * TEX, TEX, TEX); }
    for (let k = 0; k < L.over.length; k += 3) { const idx = L.over[k + 2]; if (idx === undefined) continue; g.drawImage(this.sheets[0], (idx % COLS) * TEX, Math.floor(idx / COLS) * TEX, TEX, TEX, L.over[k] * TEX, L.over[k + 1] * TEX, TEX, TEX); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipMapLinearFilter;
    const mat = pixMat(new THREE.MeshBasicMaterial({ map: pixTex(THREE, tex) })); setDisplayRGB(mat.color, LIGHT.ground * this.light);
    (tex.userData ||= {}).mcChunk = 1; // учёт VRAM: текстура чанка земли (живёт ровно столько, сколько чанк)
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
  /** кадр: px,py — фокус (герой, px мира). Радиус-стрим (engine/vramStream.js, «🖼 Графика → Видеопамять»):
   *  чанк нужен, если его ближайшая точка не дальше loadR = max(loadTiles, обзор камеры + marginTiles) клеток; выгружается,
   *  если дальше loadR + hystTiles дольше grace; maxLive — аварийный потолок. Новый чанк сразу ставится в очередь загрузки
   *  на GPU (prewarm, ≤ upMs мс/кадр) — к моменту, когда он въедет в кадр, текстура уже там (без рывка). */
  update(px, py, budget = 1, view = null) {
    const S = CH * CELL, now = performance.now(), cfg = vcfg();
    const viewR = Math.max(view?.rx || 0, view?.ry || 0, (VIEW_CELLS.max * CELL) / 2);
    const loadR = Math.max(cfg.loadTiles * CELL, viewR + cfg.marginTiles * CELL), dropR = loadR + cfg.hystTiles * CELL;
    this.radius = { loadTiles: Math.round(loadR / CELL), dropTiles: Math.round(dropR / CELL), viewTiles: Math.round(viewR / CELL) };
    const dist = (ci, cj) => { const dx = Math.max(ci * S - px, 0, px - (ci + 1) * S), dy = Math.max(cj * S - py, 0, py - (cj + 1) * S); return Math.hypot(dx, dy); };
    const c0 = Math.floor((px - loadR) / S), c1 = Math.floor((px + loadR) / S), r0 = Math.floor((py - loadR) / S), r1 = Math.floor((py + loadR) / S);
    const want = [];
    for (let ci = c0; ci <= c1; ci++) for (let cj = r0; cj <= r1; cj++) {
      if (ci < -1 || cj < -1 || ci * S > this.plan.size + S || cj * S > this.plan.size + S) continue;
      const d = dist(ci, cj); if (d > loadR) continue;
      if (!this.chunks.has(ci * 1000 + cj)) want.push([ci, cj, d]);
    }
    want.sort((a, b) => a[2] - b[2]);
    const vs = VRAM.inst;
    // запекание (канвас) — не больше budget чанков и ~6 мс за кадр; ближние — первыми
    const tb = performance.now(); if (vs) vs.frameBake = 0;
    for (let k = 0; k < Math.min(budget + (want.length && want[0][2] === 0 ? 1 : 0), want.length) && (k === 0 || performance.now() - tb < 6); k++) {
      const c = this.bake(want[k][0], want[k][1]); c.used = now; if (vs) { vs.busy = true; vs.frameBake = performance.now() - tb; /* кадр запекания — без загрузки в GPU (разнести по кадрам) */ vs.prewarm(c.tex); for (const B of c.batch?.list || []) for (const t of [B.mesh?.material?.map, B.mesh?.material?.uniforms?.map?.value]) if (t) vs.prewarm(t); }
    }
    let far = [];
    for (const c of this.chunks.values()) {
      const d = dist(c.ci, c.cj);
      if (d <= dropR) { c.used = now; c.farAt = 0; } else { c.farAt ||= now; far.push([c, d]); }
    }
    far.sort((a, b) => b[1] - a[1]);
    for (const [c] of far) if (now - c.farAt > cfg.graceMs || this.chunks.size > this.maxLive) this.drop(c);
    this.stats.live = this.chunks.size;
  }
  setLight(k) {
    this.light = k;
    for (const c of this.chunks.values()) { setDisplayRGB(c.mat.color, LIGHT.ground * k); c.batch?.setLight?.(k); }
    setDisplayHex(this.farMat.color, 0xb8b4c8, k * LIGHT.ground / 0.84);
  }
}
