// Видеопамять по требованию («🖼 Графика → Видеопамять»): текстура лежит на GPU, только пока она нужна сцене.
//  • учёт: раз в 0,5 с обходим сцену (видимые объекты → материалы → map/uniform-текстуры) и помечаем «нужна сейчас»;
//    байты на GPU = Σ ширина×высота×(4 или 2 у RGBA5551)×(4/3 с мипами) по текстурам, которые three уже загрузил (__webglInit);
//  • выгрузка: текстура не нужна сцене дольше grace (ПК 20 с, телефон 10 с) → texture.dispose() — освобождается только копия
//    на GPU, картинка остаётся в памяти, и three сам загрузит её снова при следующем показе (сервер и мир не трогаются);
//    сверх бюджета (ПК 2048 МБ — Mac/ПК с общей памятью тянут спокойно; телефон 512 МБ) — сначала самые давно ненужные, без ожидания grace,
//    но только то, что не было в кадре ≥ PRESS_IDLE_MS, и не общие атласы ≥ 16 МБ (их — только по grace×3); выгружаем до 90 % бюджета;
//  • без рывков: новые текстуры (чанки земли, следующая зона) грузятся на GPU заранее очередью prewarm() — не больше
//    upMs мс за кадр (renderer.initTexture), а не в момент, когда объект впервые попал в кадр;
//  • радиус: земля Аринара держит чанки в радиусе loadTiles (50 клеток) от героя, выгружает дальше loadTiles+hystTiles
//    (56) через grace — worlds/terrainChunks.js. Радиус не меньше обзора камеры + запас.
import { showError } from '../boot/errorBox.js';
const MOB = (() => { try { return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') || /[?&]mobile=1/.test(location.search); } catch (_) { return false; } })();
export const VRAM_DEF = { budgetPc: 2048, budgetMob: 512, gracePc: 20, graceMob: 10, loadTilesPc: 50, loadTilesMob: 50, hystTiles: 6, marginTiles: 4, upMsPc: 4, upMsMob: 2 };
const C = { ...VRAM_DEF };
try { if (/[?&]vramLegacy=1/.test(location.search)) Object.assign(C, { legacy: true, loadTilesPc: 59, loadTilesMob: 59, budgetPc: 8192, budgetMob: 4096 }); } catch (_) {} // замер «как раньше» (плейтест ac-vram BEFORE=1)
const PRESS_IDLE_MS = 5000; // под давлением бюджета выгружать только то, чего не было в кадре дольше 5 с
const cl = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
/** снимок админки (d.gfx.vram) — применяется сразу */
export function setVramCfg(v) {
  if (!v || typeof v !== 'object') return;
  C.budgetPc = cl(v.budgetPc, 128, 8192, C.budgetPc); C.budgetMob = cl(v.budgetMob, 64, 4096, C.budgetMob);
  C.gracePc = cl(v.gracePc, 1, 600, C.gracePc); C.graceMob = cl(v.graceMob, 1, 600, C.graceMob);
  C.loadTilesPc = cl(v.loadTilesPc, 20, 150, C.loadTilesPc); C.loadTilesMob = cl(v.loadTilesMob, 20, 150, C.loadTilesMob);
  C.hystTiles = cl(v.hystTiles, 1, 40, C.hystTiles); C.marginTiles = cl(v.marginTiles, 0, 20, C.marginTiles);
  if (typeof v.legacy === 'boolean') C.legacy = v.legacy; // замер «как раньше» (плейтест BEFORE): без скрытия пустых пачек, без выгрузки, без prewarm
  C.upMsPc = cl(v.upMsPc, 0.5, 16, C.upMsPc); C.upMsMob = cl(v.upMsMob, 0.5, 16, C.upMsMob);
}
/** действующие значения для этого устройства */
export const vcfg = () => ({ budgetMB: MOB ? C.budgetMob : C.budgetPc, graceMs: (MOB ? C.graceMob : C.gracePc) * 1000, loadTiles: MOB ? C.loadTilesMob : C.loadTilesPc, hystTiles: C.hystTiles, marginTiles: C.marginTiles, upMs: MOB ? C.upMsMob : C.upMsPc, mobile: MOB, legacy: !!C.legacy });
export function texBytes(t) {
  const im = t.image; if (!im) return 0;
  if (Array.isArray(im)) return im.reduce((a, x) => a + (x?.width || 0) * (x?.height || 0) * 4, 0); // куб
  const w = im.width || 0, h = im.height || 0;
  const bpp = t.type === 1018 /* UnsignedShort5551 */ || t.type === 1017 /* 4444 */ || t.type === 1019 /* 565? */ ? 2 : im.data?.BYTES_PER_ELEMENT === 4 && t.type === 1015 ? 16 : 4;
  const mip = t.generateMipmaps && t.minFilter !== 1003 && t.minFilter !== 1006 ? 4 / 3 : 1; // Nearest/Linear без мипов
  return Math.round(w * h * bpp * mip);
}
/** ничего не рисует: InstancedMesh с count 0 или меш на InstancedBufferGeometry (SpriteBatch) с instanceCount 0 */
const isEmpty = (o) => (o.isInstancedMesh && o.count === 0) || (o.isMesh && o.geometry?.isInstancedBufferGeometry && o.geometry.instanceCount === 0);
export class VramStream {
  constructor(renderer, scene) {
    this.r = renderer; this.scene = scene;
    this.seen = new Map(); // texture → { last, bytes }
    this.q = []; this.qSet = new Set();
    this.stats = { gpuMB: 0, gpuTex: 0, tracked: 0, evicted: 0, prewarmed: 0, upMsMax: 0, scanMs: 0, overBudget: 0 };
    this._scanAt = 0; this._warned = false;
  }
  onGpu(t) { const p = this.r.properties.get(t); return !!(p && p.__webglInit); }
  mark(t, now) { if (!t || !t.isTexture || t.isRenderTargetTexture || t.isVideoTexture) return; let e = this.seen.get(t); if (!e) { e = { last: now, bytes: 0 }; this.seen.set(t, e); t.addEventListener('dispose', () => this.seen.delete(t)); } e.last = now; }
  scan(now) {
    const t0 = performance.now(), mark = (t) => this.mark(t, now);
    const mat = (m) => { if (!m) return; for (const k in m) { const v = m[k]; if (v && v.isTexture) mark(v); } const u = m.uniforms; if (u) for (const k in u) { const v = u[k]?.value; if (v && v.isTexture) mark(v); else if (Array.isArray(v)) v.forEach((x) => x && x.isTexture && mark(x)); } };
    const walk = (o) => { if (!o.visible || (!C.legacy && isEmpty(o))) return; if (o.material) (Array.isArray(o.material) ? o.material.forEach(mat) : mat(o.material)); for (const c of o.children) walk(c); };
    walk(this.scene);
    if (this.scene.background?.isTexture) mark(this.scene.background);
    this.stats.scanMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  /** в очередь на загрузку в GPU заранее (без рывка в момент появления) */
  prewarm(t) { if (t && t.isTexture && !this.qSet.has(t)) { this.q.push(t); this.qSet.add(t); this.mark(t, performance.now()); } }
  /** «скоро понадобится» (объект рядом, но ещё ничего не рисует — эффекты Чёрного мага): держать на GPU и догрузить заранее очередью */
  need(list, now = performance.now()) { for (const t of list) { if (!t?.isTexture) continue; this.mark(t, now); if (t.image && !this.onGpu(t) && !this.qSet.has(t)) { this.q.push(t); this.qSet.add(t); } } }
  get pending() { return this.q.length; }
  /** каждый кадр: очередь загрузки (не дольше upMs), раз в 0,5 с — учёт и выгрузка */
  tick(now = performance.now()) {
    const cfg = vcfg();
    this.frameUp = 0; if (cfg.legacy) { this.q.length = 0; this.qSet.clear(); }
    if (this.busy && (this._skips = (this._skips || 0) + 1) <= 2) { this.busy = false; } else if ((this.busy = false, this._skips = 0, this.q.length)) { const t0 = performance.now(); while (this.q.length && performance.now() - t0 < cfg.upMs) { const t = this.q.shift(); this.qSet.delete(t); if (t.image && !this.onGpu(t)) { try { const u0 = performance.now(); this.r.initTexture(t); this.stats.prewarmed++; (this.upLog ||= []).push([Math.round((performance.now() - u0) * 10) / 10, t.image.width, t.image.height]); if (this.upLog.length > 200) this.upLog.shift(); } catch (e) { showError('MC-G03', { soft: true, autoClose: 6000, detail: 'initTexture: ' + (e?.message || e) }); } } } const dt = performance.now() - t0; this.frameUp = dt; if (dt > this.stats.upMsMax) this.stats.upMsMax = Math.round(dt * 10) / 10; }
    if (now - this._scanAt < 500) return; this._scanAt = now;
    this.scan(now);
    let sum = 0, n = 0, evicted = 0; const idle = [];
    for (const [t, e] of this.seen) { if (!this.onGpu(t)) continue; e.bytes = texBytes(t); sum += e.bytes; n++; if (!t.userData?.pin && now - e.last > 0 && !this.qSet.has(t)) idle.push([t, e]); }
    idle.sort((a, b) => a[1].last - b[1].last);
    const budget = cfg.budgetMB * 1048576; const flush = this.flushAt && now > this.flushAt; if (flush) this.flushAt = 0;
    for (const [t, e] of cfg.legacy ? [] : idle) {
      // большие общие атласы (≥16 МБ: листы пропсов/спрайтов) держим втрое дольше: их повторная загрузка — самый тяжёлый рывок,
      // а выпадают из кадра они ненадолго. Чанки земли (4 МБ) уходят по обычному grace.
      const old = now - e.last > (flush ? 1500 : cfg.graceMs * (e.bytes >= 16777216 ? 3 : 1));
      // давление бюджета (hotfix 22.10): только давно не бывшие в кадре и не общие атласы — иначе под перебором
      // каждые 0,5 с выгружались и тут же грузились снова текстуры, которые сцена ещё использует (рывки, «перемешанные» спрайты на Mac)
      const press = sum > (this._press ? budget * 0.9 : budget) && now - e.last > PRESS_IDLE_MS && e.bytes < 16777216;
      if (!old && !press) continue;
      if (now - e.last < 1000) continue; // нужна только что (не в кадре из-за visible-мигания) — не трогаем
      t.dispose(); sum -= e.bytes; n--; this.stats.evicted++; evicted++; if (press && !old) { this.stats.overBudget++; this._press = true; }
    }
    if (sum <= budget * 0.9) this._press = false;
    // удалённые текстуры могли остаться «привязанными» в кэше состояния three (r128 не чистит его при deleteTexture) — сбросить кэш
    if (evicted) { try { this.r.resetState?.(); } catch (_) {} }
    // перебор бюджета — не ошибка игрока: тихо (консоль + журнал сервера, один раз за сессию), без плашки на экране
    if (sum > budget && !this._warned) { this._warned = true; showError('MC-G04', { quiet: true, detail: `${(sum / 1048576).toFixed(0)} МБ > ${cfg.budgetMB}` }); }
    this.stats.gpuMB = Math.round((sum / 1048576) * 10) / 10; this.stats.gpuTex = n; this.stats.tracked = this.seen.size; this.stats.three = this.r.info?.memory?.textures ?? null;
  }
  /** вокруг рендера кадра: пустые пачки экземпляров (InstancedMesh.count 0, SpriteBatch instanceCount 0 — эффекты Чёрного мага, пустые пачки спрайтов) временно
   *  скрываем — иначе three привязывает (и грузит в GPU) их текстуры, ничего не рисуя: 400+ МБ листов bm_fx_* в хабе.
   *  После кадра видимость возвращается как была (код игры её не замечает). */
  //  Плюс: объект с крупной (≥2 МБ) текстурой, которой ещё нет в GPU, не рисуем в этом кадре, а ставим текстуру в очередь
  //  (появится через кадр-другой, у края обзора) — иначе three загрузит её синхронно прямо в рендере, это и есть рывок.
  hideEmpty() {
    if (C.legacy) return; const H = this._hid || (this._hid = []);
    const cold = (o) => { const m = o.material; if (!m || Array.isArray(m)) return null; const t = m.map || m.uniforms?.map?.value; return t && t.isTexture && !t.isRenderTargetTexture && !t.isVideoTexture && t.image && t.image.width && !this.onGpu(t) && texBytes(t) >= 2097152 ? t : null; };
    const walk = (o) => { if (!o.visible) return; if (isEmpty(o)) { o.visible = false; H.push(o); return; } const t = o.isMesh || o.isSprite ? cold(o) : null; if (t) { this.prewarm(t); this.stats.deferred = (this.stats.deferred || 0) + 1; o.visible = false; H.push(o); return; } for (const c of o.children) walk(c); };
    walk(this.scene);
  }
  /** смена зоны: через 2 с выгрузить всё, что новой зоне не понадобилось (без ожидания grace) */
  zoneFlush() { this.flushAt = performance.now() + 2000; }
  restoreEmpty() { const H = this._hid; if (!H) return; for (const o of H) o.visible = true; H.length = 0; }
  /** «байты текстур на GPU» прямо сейчас (для замеров), без ожидания такта */
  measure() { let sum = 0, n = 0; for (const t of this.seen.keys()) if (this.onGpu(t)) { sum += texBytes(t); n++; } return { gpuMB: Math.round((sum / 1048576) * 10) / 10, gpuTex: n, three: this.r.info?.memory?.textures ?? null }; }
}
export const VRAM = { inst: null };
