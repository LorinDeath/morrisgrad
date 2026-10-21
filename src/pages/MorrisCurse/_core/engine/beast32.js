// Мобы bestiary32 (Художник: 20 px/м, 64 кадра на моба, 10 страниц по тирам + _glow) — потоковая загрузка в видеопамять.
// Страница (лист тира) грузится, только когда моб с неё в радиусе подгрузки (GFX.mobLoadR тайлов от героя) или в текущей арене,
// и выгружается (gl.deleteTexture), если мобов с неё нет ближе радиуса выгрузки (+6 тайлов) дольше GFX.mobGrace секунд.
// Пока лист грузится — моб рисуется старым атласом (beastSprites.js): ни «пустых» мобов, ни ожидания.
// На странице — два SpriteBatch: основной и аддитивный _glow (та же раскладка ячеек) → 2 draw call на страницу, пустые батчи скрыты.
//
// Точки подключения asset-cache (менеджер ресурсов, ветка asset-cache):
//   B32_HOOKS.loadTexture(THREE, url, info) → Promise<THREE.Texture> — взять лист из локального кэша/манифеста (по умолчанию Image по url);
//   B32_HOOKS.radiusTiles() → число — общий радиус стриминга видеопамяти (по умолчанию GFX.mobLoadR);
//   B32_HOOKS.onLoad(info) / onFree(info) — учёт видеопамяти менеджером (info: { page, tier, bytes, image, glow });
//   b32Stats() — снимок для менеджера/отчёта; b32FreeAll() — сброс (смена режима, нехватка памяти).
import META from '../../../../assets/mc/bestiary32/bestiary32_atlas.json';
import { SpriteBatch, loadAtlasTexture, assetUrl } from './spriteBatch.js';
import { GFX, MOB_GLOW } from './gfxCfg.js';
import { prepMeta } from './beastFrames.js';
import { quant5 } from './propAtlas.js';
import { MOBS_ON, onMobMode } from './mobPref.js';

export { META as B32_META };
export const B32 = prepMeta(META);
export const B32_HOOKS = { loadTexture: null, radiusTiles: null, onLoad: null, onFree: null };
export const TILE_PX = 32; // клетка мира (server/meta/worldLayout.ts CELL) в единицах сервера
const NP = META.pages.length;
/** id моба → { page, start, tier, flying, body } (null — нет в bestiary32: Keyt/Dar, NPC, Чёрный маг → старые листы) */
export const b32Mob = (id) => META.mobs[id] || null;
/** высота билборда, при которой видимое тело = vis метров (как beastHeightFor старого атласа) */
export function b32HeightFor(id, vis) { const m = META.mobs[id], b = m?.body; const px = b ? Math.max(8, b[1] - b[0]) : META.cell * 0.6; return (vis * META.cell) / px; }
export const b32Flying = (id) => !!META.mobs[id]?.flying;

// --- общие текстуры страниц (на все виды: мир, забег, облики) ---
const P = META.pages.map((pg, i) => ({ i, tier: pg.tier, st: 0, base: null, glow: null, bytes: 0, views: 0, lookUse: -1e9, gen: 0, ms: 0 })); // st: 0 нет, 1 грузится, 2 готова, 3 ошибка
const STATS = { loads: 0, frees: 0, fails: 0, peak: 0 };
let SET = null, GEN = 1, THREE_ = null;
const now = () => performance.now() / 1000;
function setUrls() { return SET || (SET = import('./bestiary32Set.js').then((m) => m.SRC)); }
function texDefaultLoad(THREE, url) { return loadAtlasTexture(THREE, url); }
function prep(THREE, t, pack) {
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (pack && THREE.UnsignedShort5551Type) { t.image = quant5(t.image); t.type = THREE.UnsignedShort5551Type; t.format = THREE.RGBAFormat; }
  t.needsUpdate = true; return t;
}
function requestPage(THREE, i) {
  const p = P[i]; if (p.st === 1 || p.st === 2) return; THREE_ = THREE;
  if (p.st === 3 && now() - p.failAt < 30) return; // ошибка — повтор не чаще раза в 30 с (моб пока на старом листе)
  p.st = 1; const gen = p.gen = GEN, t0 = performance.now(), pg = META.pages[i], pack = !!GFX.mobPackGlow;
  const ld = B32_HOOKS.loadTexture || texDefaultLoad;
  setUrls().then((SRC) => Promise.all([ld(THREE, assetUrl(SRC[pg.image]), { page: i, glow: false }), ld(THREE, assetUrl(SRC[pg.glow]), { page: i, glow: true })]))
    .then(([b, g]) => {
      if (gen !== p.gen || p.st !== 1) { b.dispose(); g.dispose(); return; } // сбросили, пока грузилось
      p.base = prep(THREE, b, false); p.glow = prep(THREE, g, pack);
      p.bytes = pg.w * pg.h * 4 + pg.w * pg.h * (p.glow.type === THREE.UnsignedShort5551Type ? 2 : 4);
      p.st = 2; p.ms = Math.round(performance.now() - t0); STATS.loads++;
      const tot = b32Bytes(); if (tot > STATS.peak) STATS.peak = tot;
      B32_HOOKS.onLoad?.({ page: i, tier: p.tier, bytes: p.bytes, image: pg.image, glow: pg.glow });
    })
    .catch((e) => { if (gen !== p.gen) return; p.st = 3; p.failAt = now(); STATS.fails++; console.warn('[beast32]', e?.message || e); });
}
function freePage(i) {
  const p = P[i]; if (p.st === 0) return;
  const had = p.st === 2;
  p.base?.dispose(); p.glow?.dispose(); p.base = p.glow = null; p.st = 0; p.gen = 0; p.lookUse = -1e9;
  if (had) { STATS.frees++; B32_HOOKS.onFree?.({ page: i, tier: p.tier, bytes: p.bytes }); }
  p.bytes = 0;
}
const VIEWS = new Set();
/** выгрузить всё (смена режима на «Старые», выключатель админки) — сначала батчи видов, потом текстуры */
export function b32FreeAll() { GEN++; for (const v of VIEWS) v.releaseAll(); for (let i = 0; i < NP; i++) freePage(i); }
/** текстуры страницы (тесты light-fidelity): { base, glow } или null */
export const b32Page = (i) => (P[i]?.st === 2 ? { base: P[i].base, glow: P[i].glow } : null);
export const b32Bytes = () => P.reduce((a, p) => a + (p.st === 2 ? p.bytes : 0), 0);
export function b32Stats() {
  return { pages: P.map((p) => ({ page: p.i, tier: p.tier, st: ['none', 'loading', 'ready', 'error'][p.st], mb: +(p.bytes / 1048576).toFixed(1), views: p.views, ms: p.ms })),
    mb: +(b32Bytes() / 1048576).toFixed(1), peakMb: +(STATS.peak / 1048576).toFixed(1), loads: STATS.loads, frees: STATS.frees, fails: STATS.fails, views: VIEWS.size };
}
/** глобальная выгрузка страниц, которые держали только облики (у видов — свой учёт) */
function globalTick(t) { const g = GFX.mobGrace || 20; for (const p of P) if (p.st === 2 && p.views === 0 && t - p.lookUse > g) freePage(p.i); }

// --- облики «look:» (PixCharacter): кадр рисуется в свой маленький канвас 104×104 (копия листа на каждого героя стоила бы 30 МБ) ---
/** изображение страницы моба (для обликов) или null; вызов держит страницу загруженной grace-секунд */
export function b32LookImage(THREE, id) {
  const m = META.mobs[id]; if (!m) return null; const p = P[m.page];
  p.lookUse = now(); if (p.st !== 2) { requestPage(THREE, m.page); return null; }
  return p.base.image;
}

/**
 * Мобы bestiary32 одного вида (мир или забег): батчи по страницам. Порядок в кадре: begin() → use()/push() → end().
 */
export class Beast32View {
  constructor(THREE, root, { max = 320, run = false } = {}) {
    this.THREE = THREE; this.root = root; this.max = max; this.run = run;
    this.B = new Array(NP).fill(null); // { base, glow } — батчи, пока страница у вида
    this.keep = new Float64Array(NP).fill(-1e9); // последний кадр, когда моб страницы был ближе радиуса выгрузки
    this.t = 0; this.calls = 0;
    VIEWS.add(this);
  }
  /** радиус подгрузки/выгрузки в единицах сервера (квадраты) */
  radii() { const r = (B32_HOOKS.radiusTiles?.() || GFX.mobLoadR || 50) * TILE_PX, u = r + 6 * TILE_PX; this.r2 = r * r; this.u2 = u * u; }
  begin() {
    this.t = now(); this.radii();
    for (let i = 0; i < NP; i++) { const b = this.B[i]; if (b) { b.base.begin(); b.glow.begin(); } }
  }
  /**
   * Моб id на расстоянии² d2 (единицы сервера; 0 — «в текущей арене»): номер страницы, если её батч готов, иначе −1 (рисовать старым листом).
   * Ближе радиуса подгрузки — заказывает страницу; ближе радиуса выгрузки — продлевает её жизнь.
   */
  use(id, d2) {
    const m = META.mobs[id]; if (!m) return -1; const i = m.page;
    if (d2 <= this.u2) this.keep[i] = this.t;
    if (this.B[i]) return i;
    const p = P[i];
    if (p.st === 2 && this.keep[i] === this.t) { this.attach(i); return i; }
    if (d2 <= this.r2) requestPage(this.THREE, i);
    return -1;
  }
  attach(i) {
    const THREE = this.THREE, p = P[i], pg = META.pages[i];
    const o = { cellW: META.cell, cellH: META.cell, cols: META.cols, rows: pg.rows, max: this.max };
    const base = new SpriteBatch(THREE, p.base, o), glow = new SpriteBatch(THREE, p.glow, { ...o, additive: true, glowU: MOB_GLOW });
    this.root.add(base.mesh); this.root.add(glow.mesh); base.begin(); glow.begin();
    this.B[i] = { base, glow }; p.views++;
  }
  detach(i) {
    const b = this.B[i]; if (!b) return;
    this.root.remove(b.base.mesh); this.root.remove(b.glow.mesh); b.base.dispose(); b.glow.dispose(); // текстура — общая, её освобождает freePage
    this.B[i] = null; P[i].views--;
  }
  /** спрайт: f — кадр внутри моба (beastFrames.mobFrame), остальное — как SpriteBatch.push; ga — прозрачность свечения */
  push(page, id, f, x, y, z, h, flip, r, g, b, flash, alpha, sort, ga = alpha) {
    const bb = this.B[page]; const idx = META.mobs[id].start + f, col = idx % META.cols, row = (idx - col) / META.cols;
    if (!bb.base.push(x, y, z, h, col, row, flip, r, g, b, flash, alpha)) return;
    bb.base.sortId(sort);
    if (ga > 0.01 && bb.glow.push(x, y, z, h, col, row, flip, 1, 1, 1, 0, ga)) bb.glow.sortId(sort);
  }
  end() {
    let calls = 0; const g = GFX.mobGrace || 20;
    for (let i = 0; i < NP; i++) {
      const bb = this.B[i]; if (!bb) continue;
      bb.base.end(); bb.glow.end();
      bb.base.mesh.visible = bb.base.n > 0; bb.glow.mesh.visible = bb.glow.n > 0; calls += (bb.base.n > 0) + (bb.glow.n > 0);
      if (this.t - this.keep[i] > g) { this.detach(i); if (P[i].views === 0 && this.t - P[i].lookUse > g) freePage(i); }
    }
    this.calls = calls; globalTick(this.t);
  }
  mobStart(id) { return META.mobs[id].start; }
  /** число мобов, нарисованных новыми листами в этом кадре */
  count() { let n = 0; for (const b of this.B) if (b) n += b.base.n; return n; }
  releaseAll() { for (let i = 0; i < NP; i++) this.detach(i); this.keep.fill(-1e9); }
  dispose() { this.releaseAll(); VIEWS.delete(this); for (let i = 0; i < NP; i++) if (P[i].views === 0 && this.t - P[i].lookUse > (GFX.mobGrace || 20)) freePage(i); }
}

/** живое переключение «Мобы: Новые/Старые» и выключатель админки: виды, которым режим больше не положен, отдают батчи; ничьи листы — из видеопамяти */
onMobMode((m) => {
  for (const v of VIEWS) if (!(v.run ? m.run : m.zone)) v.releaseAll();
  if (!m.zone) for (const p of P) p.lookUse = -1e9; // облики — только в мире
  for (const p of P) if (p.views === 0 && (p.st === 1 || p.st === 2 || p.st === 3) && p.lookUse < 0) { if (p.st === 1) p.gen = 0; freePage(p.i); }
  if (!m.zone && !m.run) GEN++;
});
/** включён ли режим для вида (для горячего цикла) */
export const b32On = (run) => (run ? MOBS_ON.run : MOBS_ON.zone);
