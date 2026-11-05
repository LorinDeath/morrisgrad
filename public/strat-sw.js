// Кэш ресурсов «Партии Чёрных королей» (scope /games/strategy; регистрация — src/scripts/strat/asset-cache.ts).
// Трогает только GET к файлам из /strat/precache.json (путь → хеш). HTML, /api, WebSocket, Clerk — в сеть как без воркера.
// Отдача: Cache Storage (проверка хеша) → иначе сеть и кладём в кэш. Тики/перерисовки больше не перекачивают неизменённые картинки.
const CA = 'strat-assets-v1', CM = 'strat-meta-v1', MK = '/__strat/index';
let IX = null;
const setIndex = (m) => { const ix = new Map(); for (const e of m?.files || []) ix.set(e.p, e); IX = ix; };
async function loadIndex() { if (IX) return IX; try { const r = await (await caches.open(CM)).match(MK); setIndex(r ? await r.json() : null); } catch (_) { setIndex(null); } return IX; }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil((async () => { for (const k of await caches.keys()) if (/^strat-(assets|meta)-v/.test(k) && k !== CA && k !== CM) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('message', (ev) => {
  const d = ev.data || {}, port = ev.ports?.[0];
  if (d.type === 'strat-index') { setIndex(d.index); caches.open(CM).then((c) => c.put(MK, new Response(JSON.stringify(d.index)))).catch(() => {});
    pruneOld().catch(() => {}); port?.postMessage({ ok: true, files: IX.size }); }
  if (d.type === 'strat-warm') ev.waitUntil?.(warm(d.paths || []).then((n) => port?.postMessage({ ok: true, warmed: n })));
});
self.addEventListener('fetch', (ev) => {
  const req = ev.request; if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url); if (u.origin !== self.location.origin || !u.pathname.startsWith('/strat/') || u.pathname === '/strat/precache.json') return;
  let path = u.pathname; try { path = decodeURIComponent(path); } catch (_) {}
  ev.respondWith(loadIndex().then((ix) => { const e = ix.get(path); return e ? serve(e) : fetch(req); }));
});
async function serve(e) {
  let c = null;
  try { c = await caches.open(CA); const hit = await c.match(e.p); if (hit && hit.headers.get('x-sh') === e.h) return hit; } catch (_) {}
  const net = await fetch(`${e.p}?v=${e.h}`, { credentials: 'same-origin' });
  if (net.ok && net.status === 200 && c) { try { const buf = await net.clone().arrayBuffer(); const h = new Headers(net.headers); h.set('x-sh', e.h); await c.put(e.p, new Response(buf, { status: 200, headers: h })); } catch (_) {} }
  return net;
}
async function warm(paths) { const ix = await loadIndex(), c = await caches.open(CA); let n = 0;
  for (let i = 0; i < paths.length; i += 6) await Promise.all(paths.slice(i, i + 6).map(async (p) => { const e = ix.get(p); if (!e) return;
    const hit = await c.match(p); if (hit && hit.headers.get('x-sh') === e.h) return; try { await serve(e); n++; } catch (_) {} }));
  return n; }
async function pruneOld() { const c = await caches.open(CA); for (const r of await c.keys()) { const p = new URL(r.url).pathname, e = IX.get(p); if (!e) { await c.delete(r); continue; } const m = await c.match(r); if (m && m.headers.get('x-sh') !== e.h) await c.delete(r); } }
