// @ts-nocheck
// Непроходимые жидкости по типу тайла (вода, глубокая вода, лава) — общий модуль сервера (авторитетно) и клиента (предсказание),
// как propCollision.ts. Источник — те же чистые раскладки, что рисует клиент: worldLayout.ts (Поляна) и arinarPlan().biomeAt (Аринар).
// Клетка жидкости непроходима, кроме полосы TERRAIN_CFG.edge px со стороны суши (там нарисован берег/кромка) — берега,
// кромки и мостки (тайлы суши) остаются проходимыми. Тот, кто уже стоит в жидкости (старое сохранение, телепорт) — мягко
// выносится на ближайшую сушу.
import { TERRAIN_CFG } from './terrainCfg.ts';
import { layoutWorld, CELL, MARGIN } from './worldLayout.ts';
import { CELL as A_CELL, arinarPlan } from './arinarLayout.ts';

const WATER = new Set(['water', 'deep', 'deep_water']);
const LAVA = new Set(['lava']);
const maps = new Map(); // world → { cell, i0, n, get(i, j) → 0 суша / 1 вода / 2 лава }

function kindOf(b) { return WATER.has(b) ? 1 : LAVA.has(b) ? 2 : 0; }
let lastW = null, lastM = null; // одноэлементный кэш: в тике подряд идут вызовы одного мира
function worldMap(world) {
  world = world || 'hellfire';
  if (world === lastW) return lastM;
  let m = maps.get(world);
  if (m !== undefined) { lastW = world; lastM = m; return m; }
  m = null;
  try {
    if (world === 'arinar') {
      const plan = arinarPlan(), n = plan.n, cache = new Uint8Array(n * n); // 0 — не считали, иначе kind+1
      const W = plan.waters || null; // быстрый отсев: клетка дальше r+64 от всех озёр — суша без biomeAt (мобы в тике)
      const near = (i, j) => { if (!W) return true; const x = (i + 0.5) * A_CELL, y = (j + 0.5) * A_CELL; for (const w of W) if (Math.abs(x - w.x) < w.r + 64 && Math.abs(y - w.y) < w.r + 64) return true; return false; };
      m = { cell: A_CELL, get: (i, j) => { if (i < 0 || j < 0 || i >= n || j >= n) return 0; const k = j * n + i; let v = cache[k]; if (!v) cache[k] = v = (near(i, j) ? kindOf(plan.biomeAt(i, j)) : 0) + 1; return v - 1; } };
    } else if (world === 'hellfire') {
      const L = layoutWorld(world), N = L.N, bio = L.biome;
      if (bio) m = { cell: CELL, get: (i, j) => { const ii = i + MARGIN, jj = j + MARGIN; return ii < 0 || jj < 0 || ii >= N || jj >= N ? 0 : kindOf(bio[jj * N + ii]); } };
    }
  } catch { m = null; }
  maps.set(world, m); lastW = world; lastM = m;
  return m;
}
const on = (k) => (k === 1 && TERRAIN_CFG.waterBlock !== false) || (k === 2 && TERRAIN_CFG.lavaBlock !== false);
const edge = () => Math.max(0, Math.min(16, Number(TERRAIN_CFG.edge) || 0));

/** Тип тайла под точкой: 0 суша, 1 вода, 2 лава (без учёта выключателей) */
export function liquidAt(world, x, y) { const m = worldMap(world); return m ? m.get(Math.floor(x / m.cell), Math.floor(y / m.cell)) : 0; }

/** Точка внутри непроходимой жидкости (с учётом полосы берега и выключателей админки) */
export function inLiquid(world, x, y) {
  const m = worldMap(world); if (!m) return false;
  const C = m.cell, i = Math.floor(x / C), j = Math.floor(y / C), k = m.get(i, j);
  if (!k || !on(k)) return false;
  const E = edge(); if (!E) return true;
  const fx = x - i * C, fy = y - j * C;
  const dry = (di, dj) => { const q = m.get(i + di, j + dj); return !q || !on(q); };
  if ((fx < E && dry(-1, 0)) || (fx > C - E && dry(1, 0)) || (fy < E && dry(0, -1)) || (fy > C - E && dry(0, 1))) return false;
  if ((fx < E && fy < E && dry(-1, -1)) || (fx > C - E && fy < E && dry(1, -1)) || (fx < E && fy > C - E && dry(-1, 1)) || (fx > C - E && fy > C - E && dry(1, 1))) return false;
  return true;
}

/** Вынести точку из жидкости: на кромку соседней клетки суши (скольжение вдоль берега), иначе — к ближайшей суше (до 24 клеток) */
export function resolveLiquid(world, x, y) {
  if (!inLiquid(world, x, y)) return [x, y];
  const m = worldMap(world), C = m.cell, i = Math.floor(x / C), j = Math.floor(y / C), E = Math.max(1, edge()) - 0.5;
  const x0 = i * C, y0 = j * C;
  const cand = [[x0 + E, y], [x0 + C - E, y], [x, y0 + E], [x, y0 + C - E], [x0 + E, y0 + E], [x0 + C - E, y0 + E], [x0 + E, y0 + C - E], [x0 + C - E, y0 + C - E]];
  let best = null, bd = 1e9;
  for (const [cx, cy] of cand) { if (inLiquid(world, cx, cy)) continue; const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = [cx, cy]; } }
  if (best) return best;
  for (let r = 1; r <= 24; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const cx = (i + di + 0.5) * C, cy = (j + dj + 0.5) * C;
      if (inLiquid(world, cx, cy)) continue;
      const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = [cx, cy]; }
    }
    if (best) return best;
  }
  return [x, y];
}

/** Есть ли жидкость (любая, без учёта выключателей) в точке или на окружностях r и r/2 вокруг неё — для генерации
 *  лагерей/узлов/точек: содержание мира не зависит от админ-выключателя и не «плавает» */
export function wetNear(world, x, y, r = 0) {
  if (liquidAt(world, x, y)) return true;
  if (r <= 0) return false;
  for (const rr of [r, r / 2]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (liquidAt(world, x + Math.cos(a) * rr, y + Math.sin(a) * rr)) return true; }
  return false;
}
