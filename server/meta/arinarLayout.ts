// @ts-nocheck
// Раскладка Аринара (биом клетки, тайлы, ПРОПСЫ) — чистые функции без DOM, общие для клиента (worlds/terrainChunks.js рисует)
// и сервера (коллизии пропсов: server/meta/propCollision.ts). Перенесено из terrainChunks.js без изменений логики.
import tilesMeta from "../../src/assets/mc/tiles_atlas.json";
import { WORLD_GEN, regionAt } from "./zoneGen";
import { markersOf } from "./markers";
import { STATIC_NPCS as NPCS, ZONE_RESPAWN } from "./shared";
import { worldSize, ARINAR_HUB } from "../worlds/sizes";
import { WORLD_PORTALS as PORTALS } from "../worlds/portals";
export const CELL = 32, CH = 32;
const T = tilesMeta.index;
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


export function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
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
  return { size, seed, center, portals, npcs, pois, plazaR, biomeAt, keepClear, n: Math.ceil(size / CELL), waters }; // waters — быстрый отсев в liquid.ts
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
  extra.push({ k: 'well', x: c.x + 150, y: c.y + 140, s: 1, f: false });
  // таблички — из реестра объектов карты (markers.ts): всё, что туда внесено, стоит и в мире, и на картах
  for (const m of markersOf('arinar', 'sign')) extra.push({ k: 'signpost', x: m.x, y: m.y, s: 1, f: false });
  plan.portals.forEach((p) => extra.push({ k: 'torch', x: p.x - 50, y: p.y + 6, s: 1, f: false }, { k: 'torch', x: p.x + 50, y: p.y + 6, s: 1, f: true }));
  plan.npcs.forEach((p, idx) => extra.push({ k: idx % 2 ? 'crate' : 'barrel', x: p.x - 40, y: p.y - 14, s: 1, f: false }, { k: 'campfire', x: p.x + 42, y: p.y - 10, s: 1, f: false }));
  const x0 = i0 * CELL, y0 = j0 * CELL, x1 = x0 + CH * CELL, y1 = y0 + CH * CELL;
  for (const p of extra) if (p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1) props.push(p);
  props.sort((a, b) => a.y - b.y);
  return { ci, cj, sheet, base, over, props };
}

