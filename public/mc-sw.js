// Сервис-воркер кэша ресурсов «Проклятых» (scope /MorrisCurse, регистрация — src/pages/MorrisCurse/_core/boot/assetCache.js).
// Трогает ТОЛЬКО GET-запросы к файлам из манифеста игры (/mc-assets/manifest.json → индекс путь → хеш). Всё прочее —
// HTML, /api, WebSocket, Clerk, админка, музыка (Range) — идёт в сеть как без воркера (respondWith не вызывается).
// Отдача: Cache Storage по ключу «путь[?v=хеш]» с проверкой хеша из индекса; промах/несовпадение → сеть (и кладём в кэш).
// Обновление: сам файл отдаётся с no-cache и регистрируется с updateViaCache:'none'; новая версия сразу skipWaiting + claim.
// Индекс обновляет страница (postMessage 'mc-index') ДО загрузки кода игры, поэтому старый воркер не держит старые файлы:
// у файлов vite хеш в имени, у прочих — ?v=хеш. Аварийный выключатель: flags.cache=false в манифесте → страница снимает воркер.
const SW_VER = 1, CA = 'mc-assets-v1', CM = 'mc-meta-v1', META_KEY = '/__mc/manifest';
let IX = null, OFF = false; // путь → { h, s, k (ключ кэша) }
const keyOf = (e) => (e.p.startsWith('/_astro/') ? e.p : `${e.p}?v=${e.h}`);
function setIndex(m) { OFF = !m || m.flags?.cache === false; const ix = new Map(); for (const e of m?.files || []) ix.set(e.p, { h: e.h, s: e.s, k: keyOf(e) }); IX = ix; }
async function loadIndex() { if (IX) return IX; try { const r = await (await caches.open(CM)).match(META_KEY); setIndex(r ? await r.json() : null); } catch (_) { setIndex(null); } return IX; }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (/^mc-(assets|meta)-v/.test(k) && k !== CA && k !== CM) await caches.delete(k); // кэши прошлых схем
  await self.clients.claim();
})()));
self.addEventListener('message', (ev) => {
  const d = ev.data || {};
  if (d.type === 'mc-index') { setIndex(d.manifest); ev.ports?.[0]?.postMessage({ ok: true, ver: SW_VER, files: IX.size }); }
  if (d.type === 'mc-ping') ev.ports?.[0]?.postMessage({ ok: true, ver: SW_VER, files: IX ? IX.size : -1, off: OFF });
});
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url); if (u.origin !== self.location.origin) return;
  if (IX) { const e = IX.get(u.pathname); if (!e || OFF) return; ev.respondWith(serve(req, e)); return; }
  // индекс ещё не загружен (воркер только что проснулся): решаем после чтения индекса, но только для путей игры
  if (!/^\/(_astro|js|mc-vn)\//.test(u.pathname)) return;
  ev.respondWith(loadIndex().then((ix) => { const e = ix.get(u.pathname); return e && !OFF ? serve(req, e) : fetch(req); }));
});
async function serve(req, e) {
  let c = null;
  try { c = await caches.open(CA); const hit = await c.match(e.k); if (hit && hit.headers.get('x-mc-h') === e.h) return hit; if (hit) await c.delete(e.k); } catch (_) {}
  const net = await fetch(e.k, { credentials: 'same-origin' }); // ?v=хеш — CDN/браузер не подсунут старую версию
  if (net.ok && net.status === 200 && c) {
    try {
      const buf = await net.clone().arrayBuffer();
      if (buf.byteLength === e.s) { const h = new Headers(net.headers); h.set('x-mc-h', e.h); await c.put(e.k, new Response(buf, { status: 200, headers: h })); }
    } catch (_) { /* квота/приватный режим — отдаём из сети без кэша */ }
  }
  return net;
}
