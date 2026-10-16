// Подписи биомов на карте M: «Биом / зона · ур. A–B» — только там, где герой уже побывал (туман войны).
// Сводка зон (имя, уровни мобов из живой таблицы с правками админки) приходит с сервера в meta_state.mapZones;
// где подписывать — считаем по клеткам регионов (zoneGen) и маске разведки (fog). Подпись — в центре
// РАЗВЕДАННОЙ части пятна, так что неразведанные места не выдают себя ни подписью, ни её положением.
import { WORLD_GEN } from '../../../../../server/meta/zoneGen.ts';
import { zoneKeyOf } from '../../../../../server/meta/mapZones.ts';
import { fog } from './fog.js';

let ZONES = null; let zver = 0;
export function setMapZones(z) { if (z && typeof z === 'object') { ZONES = z; zver++; } }
export const mapZonesKnown = () => !!ZONES;

// группы: пятно (patch) × половина (ключ зоны); ядро хаба — регион целиком
let GROUPS = null;
function groups() {
  if (GROUPS) return GROUPS;
  const m = new Map();
  for (const r of WORLD_GEN.arinar.regions) {
    const key = zoneKeyOf(r.id), gk = r.patch != null ? key + '@' + r.patch : key;
    let g = m.get(gk); if (!g) m.set(gk, (g = { key, cells: [] }));
    g.cells.push(r.rect);
  }
  return (GROUPS = [...m.values()]);
}
// клетка разведана, если открыта хоть одна точка сетки 5×5 внутри неё
function seenRect(rc) {
  const n = Math.max(3, Math.min(8, Math.round((rc[2] - rc[0]) / 480)));
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const x = rc[0] + ((a + 0.5) / n) * (rc[2] - rc[0]), y = rc[1] + ((b + 0.5) / n) * (rc[3] - rc[1]);
    if (fog.seen('arinar', x, y)) return true;
  }
  return false;
}
let cache = { k: '', out: [] };
/** подписи для мира: [{x,y,name,sub,lvl,color,cells}] — только разведанные зоны */
export function biomeLabels(world) {
  if (world !== 'arinar' || !ZONES || !fog.active(world)) return [];
  const k = fog.ver + ':' + zver; if (cache.k === k) return cache.out;
  const out = [];
  for (const g of groups()) {
    const z = ZONES[g.key]; if (!z) continue;
    let sx = 0, sy = 0, n = 0;
    for (const rc of g.cells) if (seenRect(rc)) { sx += (rc[0] + rc[2]) / 2; sy += (rc[1] + rc[3]) / 2; n++; }
    if (n) out.push({ x: sx / n, y: sy / n, name: z.name, sub: z.sub, lvl: z.lvl, color: z.color, safe: z.safe, cells: n, key: g.key });
  }
  cache = { k, out }; return out;
}
// табличка в стиле пиксельного UI: тёмная плашка, золотая рамка 2px без скруглений, полоса цвета биома
export function drawBiomeLabel(ctx, x, y, L, k) {
  const big = k > 0.03, f1 = big ? 13 : 11, f2 = big ? 11 : 10;
  const t1 = L.name, lv = L.safe ? 'без монстров' : L.lvl[0] === L.lvl[1] ? `ур. ${L.lvl[0]}` : `ур. ${L.lvl[0]}–${L.lvl[1]}`, t2 = L.sub ? `${L.sub} · ${lv}` : lv;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${f1}px monospace`; const w1 = ctx.measureText(t1).width; ctx.font = `${f2}px monospace`; const w2 = ctx.measureText(t2).width;
  const w = Math.round(Math.max(w1, w2) + 16), h = f1 + f2 + 12, x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  ctx.fillStyle = '#000'; ctx.fillRect(x0 + 3, y0 + 3, w, h); // жёсткая пиксельная тень
  ctx.fillStyle = '#c59b27'; ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
  ctx.fillStyle = '#120c1f'; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = L.color; ctx.fillRect(x0, y0, 4, h); ctx.fillRect(x0 + w - 4, y0, 4, h);
  ctx.fillStyle = '#fde68a'; ctx.font = `bold ${f1}px monospace`; ctx.fillText(t1, x, y0 + 4 + f1 / 2);
  ctx.fillStyle = !L.safe && L.lvl[1] >= 9 ? '#fca5a5' : '#cbd5e1'; ctx.font = `${f2}px monospace`; ctx.fillText(t2, x, y0 + 8 + f1 + f2 / 2);
  ctx.restore();
}
