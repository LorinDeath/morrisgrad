// Ресурсы игры у игрока: скачать один раз, дальше — только изменения. Запускается из index.astro ДО загрузки кода игры.
//  1) манифест (/mc-assets/manifest.json, no-store, таймаут 8 с) → флаг cache=false или «🖼 Графика → Кэш ресурсов: выкл» → снять воркер, стереть кэш, работать из сети;
//  2) сервис-воркер public/mc-sw.js (scope /MorrisCurse) получает новый индекс до загрузки игры;
//  3) diff с тем, что РЕАЛЬНО лежит в Cache Storage (manifestDiff.js): докачать нужные группы этого устройства, удалить лишнее;
//     файл проверяется по размеру и sha256, пишется в кэш только целиком → прерванная загрузка продолжается с недостающих файлов;
//  4) ленивые группы (другой набор пропсов, карта мира, Чёрный маг, VN) — ensureGroup() в фоне с индикатором в углу.
// Ошибки — коды MC-L0x (src/errors/codes.js) и автоматический откат «работаем из сети», без зависаний.
import { MANIFEST_URL, CACHE_ASSETS, CACHE_META, META_KEY, assetUrl, diffManifest, eagerGroups, fmtMB } from './manifestDiff.js';
import { fullLoader, updateToast, flashOk, cornerJob } from './loaderUI.js';
import { showError } from './errorBox.js';
export const AC = { mode: 'none', version: null, manifest: null, stats: { manifestBytes: 0, fetched: 0, fetchedBytes: 0, evicted: 0, ms: 0, failed: 0 }, groups: new Set(), errors: [] };
const OFF_KEY = 'mc_cache_off';
const isMob = () => { try { const ua = navigator.userAgent || ''; return /Mobi|Android|iPhone|iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches) || /[?&]mobile=1/.test(location.search); } catch (_) { return false; } };
/** группы этого устройства — та же логика, что texPref.js (TEX_MODE) и gfxCfg.js (PROP_SET), без их импорта (они тянут игру) */
export function deviceGroups() {
  let tex = isMob() ? '16' : '32', gfx = {}, props = null;
  try { const q = location.search.match(/[?&]tex=(16|32)/); const v = localStorage.getItem('mc_tex'); tex = q ? q[1] : v === '16' || v === '32' ? v : tex; gfx = JSON.parse(localStorage.getItem('mc_gfx') || '{}') || {}; const pq = location.search.match(/[?&]props=(2|3)/); if (pq) props = pq[1] === '3' ? 'props3' : 'props2'; } catch (_) {}
  if (!props) props = tex === '32' && (isMob() ? gfx.props3Mobile === true : gfx.props3Pc !== false) ? 'props3' : 'props2';
  return { props, tiles: tex === '32' ? 'tiles32' : 'tiles16' };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url, ms) { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); try { const r = await fetch(url, { cache: 'no-store', signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); const tx = await r.text(); AC.stats.manifestBytes = tx.length; return JSON.parse(tx); } finally { clearTimeout(t); } }
const hex16 = async (buf) => { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); let s = ''; for (let i = 0; i < 8; i++) s += d[i].toString(16).padStart(2, '0'); return s; };
const cachesOk = () => { try { return typeof caches !== 'undefined' && !!caches.open; } catch (_) { return false; } };
/** полностью выключить кэш: снять воркер, стереть кэши (аварийный выключатель) */
export async function disableCache(persist = true) {
  if (persist) try { localStorage.setItem(OFF_KEY, '1'); } catch (_) {}
  // текущую вкладку воркер продолжает обслуживать и после unregister — сначала велим ему не трогать запросы (иначе он заново создаст кэш)
  try { const c = navigator.serviceWorker?.controller; if (c) await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = res; c.postMessage({ type: 'mc-off' }, [ch.port2]); setTimeout(res, 500); }); } catch (_) {}
  try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) if (r.active?.scriptURL?.endsWith('/mc-sw.js') || r.installing?.scriptURL?.endsWith('/mc-sw.js')) await r.unregister(); } catch (_) {}
  try { if (cachesOk()) for (const k of await caches.keys()) if (/^mc-(assets|meta)-v/.test(k)) await caches.delete(k); } catch (_) {}
  AC.mode = 'off';
}
export function enableCache() { try { localStorage.removeItem(OFF_KEY); } catch (_) {} }
// проверка нового воркера в фоне (через 3 с, чтобы не мешать запуску): новый деплой воркера ставится сам (skipWaiting + claim)
function laterUpdate(r) { setTimeout(() => r.update().then(() => { AC.stats.swUpd = 'ok'; }, (e) => { AC.stats.swUpd = 'err ' + (e?.message || e); }), 3000); }
const swVer = (w) => (w ? Promise.race([new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data?.ver || 0); w.postMessage({ type: 'mc-ping' }, [ch.port2]); }), sleep(800).then(() => 0)]) : Promise.resolve(0));
async function registerSW(m) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('no-sw');
  // повторный визит: воркер уже управляет страницей — не ждём проверку его обновления (до 2–3 с), она идёт в фоне через 3 с;
  // новый деплой воркера ставится сам (skipWaiting + claim), а индекс файлов мы всё равно шлём свежий (tellSW)
  const c = navigator.serviceWorker.controller;
  if (c && c.scriptURL.endsWith('/mc-sw.js')) {
    const r = await navigator.serviceWorker.getRegistration('/MorrisCurse');
    if (r?.active) {
      // новый деплой воркера (manifest.sw ≠ версия работающего): обновить сейчас, пока игра не запущена — позже, при работающей
      // игре, Chrome откладывает update() (замечено в стенде); старый воркер всё равно не отдаст старые файлы (проверка хеша)
      const want = m?.sw || 0, have = want ? await swVer(c) : 0;
      if (want && have !== want) { AC.stats.swFrom = have; try { await Promise.race([r.update(), sleep(4000)]); } catch (_) {} if (r.installing || r.waiting) await Promise.race([new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true })), sleep(2500)]); AC.stats.swTo = await swVer(navigator.serviceWorker.controller); }
      else laterUpdate(r);
      return r;
    }
  }
  const reg = await navigator.serviceWorker.register('/mc-sw.js', { scope: '/MorrisCurse', updateViaCache: 'none' });
  if (reg.active) laterUpdate(reg); // воркер уже был (вкладка без управления: вход через переход по сайту) — тоже проверить обновление
  const ready = await Promise.race([navigator.serviceWorker.ready, sleep(5000).then(() => null)]);
  if (!ready) throw new Error('sw-timeout');
  return ready;
}
async function tellSW(reg, manifest) {
  const sw = navigator.serviceWorker.controller || reg?.active; if (!sw) return false;
  return Promise.race([new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(!!e.data?.ok); sw.postMessage({ type: 'mc-index', manifest }, [ch.port2]); }), sleep(2000).then(() => false)]);
}
/** что реально лежит в кэше: url → { s, h } (h и s — из прошлого манифеста; файла, которого нет в кэше, тут нет → докачается) */
async function cachedMap(cache, prev) {
  const byUrl = new Map(); for (const e of prev?.files || []) byUrl.set(assetUrl(e), e);
  const have = new Map(); for (const req of await cache.keys()) { const u = new URL(req.url); let pn = u.pathname; try { pn = decodeURIComponent(pn); } catch (_) {} const k = pn + u.search, e = byUrl.get(k); have.set(k, e ? { s: e.s, h: e.h } : { s: -1, h: 'x' }); }
  return have;
}
class QuotaErr extends Error {}
/** скачать один файл целиком, проверить размер и хеш, положить в кэш. onBytes(delta) — для прогресса */
async function fetchOne(cache, e, onBytes, signal) {
  let lastErr;
  for (let a = 0; a < 3; a++) {
    let got = 0;
    try {
      const r = await fetch(assetUrl(e), { cache: a ? 'reload' : 'default', signal, credentials: 'same-origin' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rd = r.body?.getReader(), parts = [];
      if (rd) for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onBytes(value.length); }
      const buf = rd ? await new Blob(parts).arrayBuffer() : await r.arrayBuffer(); if (!rd) { got = buf.byteLength; onBytes(got); }
      if (buf.byteLength !== e.s || (await hex16(buf)) !== e.h) throw new Error(`битый файл ${e.p}: ${buf.byteLength}/${e.s}`);
      const h = new Headers(r.headers); h.set('x-mc-h', e.h);
      try { await cache.put(assetUrl(e), new Response(buf, { status: 200, headers: h })); } catch (err) { onBytes(-0); throw err?.name === 'QuotaExceededError' ? new QuotaErr('quota') : err; }
      return true;
    } catch (err) {
      onBytes(-got); lastErr = err; // откат прогресса недокачанного файла
      if (err instanceof QuotaErr || signal?.aborted) throw err;
      await sleep(400 * (a + 1));
    }
  }
  throw lastErr;
}
/** пул загрузок (4 параллельно), общий прогресс; сторож: 15 с без байтов → прервать и перезапустить недокачанное (до 2 раз) */
async function download(cache, list, ui) {
  const total = list.reduce((a, e) => a + e.s, 0); let done = 0, last = performance.now(), failed = [];
  const queue = list.slice();
  for (let round = 0; round < 3 && queue.length; round++) {
    const ac = new AbortController(), dog = setInterval(() => { if (performance.now() - last > 15000) { ui?.wait?.('ответ сервера ресурсов (нет данных 15 с)'); ac.abort(); } }, 1000);
    const left = queue.splice(0), retry = [];
    const worker = async () => { for (let e; (e = left.shift());) {
      try { await fetchOne(cache, e, (d) => { done += d; last = performance.now(); ui?.progress(done, total); }, ac.signal); AC.stats.fetched++; AC.stats.fetchedBytes += e.s; (AC.stats.list ||= []).length < 12 && AC.stats.list.push(e.p); }
      catch (err) { if (err instanceof QuotaErr) { clearInterval(dog); throw err; } (ac.signal.aborted ? retry : failed).push(e); console.warn('[mc-assets]', e.p, err?.message || err); }
    } };
    try { await Promise.all([worker(), worker(), worker(), worker()]); } finally { clearInterval(dog); }
    queue.push(...retry); last = performance.now();
  }
  failed.push(...queue);
  return failed;
}
/** освободить место: удалить ленивые группы (не нужные этой загрузке) */
async function shedLazy(cache, m, need) { let n = 0; for (const e of m.files) if (!need.has(e.g)) { if (await cache.delete(assetUrl(e))) n++; } return n; }
function gpu() { return isMob() ? 'phone' : 'pc'; }
/**
 * Главный шаг загрузки. Возвращает AC (mode: 'sw' — кэш работает, 'net' — из сети без кэша, 'off' — выключен).
 * Никогда не бросает: любая беда → код ошибки + откат «из сети». Блокирует только «нет сети и ничего не скачано» (MC-L07) — с «Повторить».
 */
export async function syncAssets() {
  const t0 = performance.now();
  if (/[?&]nocache=1/.test(location.search)) { await disableCache(false); AC.stats.ms = performance.now() - t0; return AC; }
  let m = null, mErr = null; const T = (AC.stats.t = {}), mark = (k) => { T[k] = Math.round(performance.now() - t0); };
  try { m = await fetchJson(MANIFEST_URL, 8000); } catch (err) { mErr = err; } mark('manifest');
  const off = (() => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (_) { return false; } })();
  if (m && (m.flags?.cache === false || off)) { await disableCache(m.flags?.cache === false ? false : true); window.__MC_VER__ = m.version; AC.version = m.version; AC.stats.ms = performance.now() - t0; return AC; }
  if (!cachesOk()) { AC.mode = 'net'; if (m) window.__MC_VER__ = m.version; showError('MC-L04', { detail: 'Cache Storage недоступен (приватный режим?)', soft: true, autoClose: 5000 }); AC.stats.ms = performance.now() - t0; return AC; }
  let cache, meta, prev = null;
  try { cache = await caches.open(CACHE_ASSETS); meta = await caches.open(CACHE_META); prev = await (await meta.match(META_KEY))?.json?.() || null; }
  catch (err) { AC.mode = 'net'; showError('MC-L04', { detail: 'caches.open: ' + (err?.message || err), soft: true, autoClose: 5000 }); AC.stats.ms = performance.now() - t0; return AC; }
  if (!m) { // нет манифеста: офлайн или сайт недоступен
    if (prev) { m = prev; window.__MC_VER__ = m.version; showError('MC-L06', { detail: String(mErr?.message || mErr), soft: true, autoClose: 5000 }); let reg = null; try { reg = await registerSW(); } catch (_) {} if (reg) await tellSW(reg, m); AC.mode = reg ? 'sw' : 'net'; AC.version = m.version; AC.manifest = m; AC.stats.ms = performance.now() - t0; return AC; }
    if (!navigator.onLine) { await new Promise((res) => showError('MC-L07', { detail: String(mErr?.message || mErr), onRetry: res })); return syncAssets(); }
    showError('MC-L01', { detail: String(mErr?.message || mErr), soft: true, autoClose: 6000 }); AC.mode = 'net'; AC.stats.ms = performance.now() - t0; return AC;
  }
  window.__MC_VER__ = m.version; AC.version = m.version; AC.manifest = m;
  let reg = null;
  try { reg = await registerSW(m); } catch (err) { showError('MC-L04', { detail: 'SW: ' + (err?.message || err), soft: true, autoClose: 5000 }); } mark('sw');
  const dg = deviceGroups(), groups = eagerGroups(dg); groups.forEach((g) => AC.groups.add(g));
  const have = await cachedMap(cache, prev), d = diffManifest(m, have, groups);
  for (const u of d.evict) if (await cache.delete(u)) { AC.stats.evicted++; (AC.stats.evList ||= []).length < 12 && AC.stats.evList.push(u); } mark('diff');
  let ui = null;
  if (d.files) {
    const first = !prev || have.size === 0 || d.bytes > 0.5 * m.files.filter((e) => AC.groups.has(e.g)).reduce((a, e) => a + e.s, 0);
    ui = first ? fullLoader({ kind: prev ? 'update' : 'first', files: d.files, bytes: d.bytes }) : updateToast({ files: d.files, bytes: d.bytes });
    ui.stage?.('check'); await sleep(0); ui.stage?.('gfx');
    let failed = [];
    try { failed = await download(cache, d.fetch, ui); }
    catch (err) { // квота: сбросить ленивые группы и попробовать ещё раз; не вышло — без кэша
      const shed = await shedLazy(cache, m, AC.groups).catch(() => 0);
      try { failed = shed ? await download(cache, d.fetch.filter((e) => !have.has(assetUrl(e))), ui) : null; } catch (_) { failed = null; }
      if (failed === null) { ui.close(); showError('MC-L03', { detail: 'quota', soft: true, autoClose: 6000 }); await disableCache(false); AC.mode = 'net'; AC.stats.ms = performance.now() - t0; return AC; }
    }
    AC.stats.failed = failed.length;
    if (failed.length) showError('MC-L02', { detail: failed.map((e) => e.p).slice(0, 5).join(', '), soft: true, autoClose: 8000, onRetry: () => syncAssets() });
    ui.stage?.('snd'); ui.stage?.('world');
  }
  // манифест пишем после загрузки: недокачанное останется «отсутствующим» и докачается в следующий раз (продолжение)
  mark('download');
  try { await meta.put(META_KEY, new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } })); } catch (_) {}
  if (reg) { await tellSW(reg, m); if (!navigator.serviceWorker.controller) await Promise.race([new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })), sleep(1500)]); }
  mark('claim'); AC.mode = reg ? 'sw' : 'net';
  if (!d.files && prev) flashOk(); else if (ui && !ui.el.dataset.full) { if (ui.el.dataset.mcl === 'update') setTimeout(() => ui.close(), 600); }
  AC.loader = ui; // полный экран закрывает index.astro, когда игра стартовала («Готовим мир…»)
  try { navigator.storage?.persist?.(); } catch (_) {}
  AC.stats.ms = performance.now() - t0; AC.stats.groups = [...AC.groups]; AC.stats.device = gpu();
  return AC;
}
const GROUP_LABEL = { props3: 'новые пропсы (32)', props2: 'пропсы (16)', tiles32: 'тайлы (32)', tiles16: 'тайлы (16)', map: 'карта мира', bm: 'эффекты Чёрного мага', vn: 'сцены', sprites: 'спрайты', core: 'код игры' };
const PENDING = new Map();
/** догрузить ленивую группу в кэш в фоне (индикатор в углу). Повторный вызов — тот же промис */
export function ensureGroup(g) {
  if (AC.mode !== 'sw' || !AC.manifest || AC.groups.has(g)) return Promise.resolve(true);
  if (PENDING.has(g)) return PENDING.get(g);
  const p = (async () => {
    const cache = await caches.open(CACHE_ASSETS), have = await cachedMap(cache, AC.manifest), d = diffManifest(AC.manifest, have, [g]);
    AC.groups.add(g); if (!d.files) return true;
    const job = cornerJob('g:' + g, GROUP_LABEL[g] || g);
    try { const failed = await download(cache, d.fetch, { progress: (a, b) => job.progress(a, b) }); if (failed.length) showError('MC-L08', { detail: g + ': ' + failed.length, soft: true, autoClose: 6000, onRetry: () => { AC.groups.delete(g); PENDING.delete(g); ensureGroup(g); } }); return !failed.length; }
    catch (_) { return false; } finally { job.end(); }
  })();
  PENDING.set(g, p); return p;
}
export const cacheSummary = () => ({ mode: AC.mode, version: AC.version, ...AC.stats, mb: +fmtMB(AC.stats.fetchedBytes) });
if (typeof window !== 'undefined') window.__mcAssets = { AC, syncAssets, ensureGroup, disableCache, enableCache, cacheSummary, deviceGroups };
