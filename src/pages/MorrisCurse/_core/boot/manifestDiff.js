// Манифест ресурсов игры (tools/mc-assets/manifest.mjs → /mc-assets/manifest.json) и его сравнение с локальным кэшем.
// Чистые функции без DOM: общие для страницы (assetCache.js), сервис-воркера (public/mc-sw.js копирует логику ключей) и тестов.
// Запись: { p: путь на сайте, h: хеш содержимого (sha256, 16 hex), s: байт, g: группа }. Ключ кэша — путь + '?v=' + h у нехешированных файлов.
export const MANIFEST_URL = '/mc-assets/manifest.json';
export const CACHE_ASSETS = 'mc-assets-v1', CACHE_META = 'mc-meta-v1', META_KEY = '/__mc/manifest';
/** URL, по которому файл качается и лежит в кэше: у файлов vite (/_astro/имя.ХЕШ.ext) хеш уже в имени, у прочих — ?v=хеш (CDN не отдаст старое) */
export const assetUrl = (e) => (e.p.startsWith('/_astro/') ? e.p : `${e.p}?v=${e.h}`);
/** группы, нужные этой загрузке страницы (eager): core всегда; набор пропсов и тайлов — по настройкам устройства */
// мобы 32 (mobs32, 4.5 МБ) заранее не качаются: листы тиров грузятся по радиусу (mobLoadR) через сервис-воркер и кэшируются один раз
export function eagerGroups({ props = 'props2', tiles = 'tiles16' } = {}) { return ['core', 'sprites', 'ui', props, tiles]; }
/**
 * Сравнение: next — новый манифест, have — Map(url → {s, h}) того, что реально лежит в кэше (не прошлый манифест: так кэш «лечит себя»),
 * groups — какие группы качать сейчас. Возвращает { fetch: [записи], evict: [url], keep, bytes, files }.
 * Изменённый файл = новый URL (хеш другой) → старый URL уходит в evict, новый — в fetch; удалённый — только evict.
 */
export function diffManifest(next, have, groups) {
  const want = new Set(groups), all = new Map(), fetch = [], keep = [];
  for (const e of next?.files || []) all.set(assetUrl(e), e);
  for (const [u, e] of all) {
    if (!want.has(e.g)) continue;
    const c = have.get(u);
    if (c && c.s === e.s && (!c.h || c.h === e.h)) keep.push(u); else fetch.push(e);
  }
  const evict = [...have.keys()].filter((u) => !all.has(u) || (have.get(u).h && have.get(u).h !== all.get(u).h));
  return { fetch, evict, keep, bytes: fetch.reduce((a, e) => a + e.s, 0), files: fetch.length };
}
/** индекс для сервис-воркера: путь (без ?v) → запись; запросы вне индекса воркер не трогает */
export function indexOf(m) { const ix = new Map(); for (const e of m?.files || []) ix.set(e.p, e); return ix; }
export const fmtMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
