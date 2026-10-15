// Плейтесты — ТОЛЬКО локально: любой запрос/WebSocket не на localhost/127.0.0.1 обрывается, тест падает.
const LOCAL = /^(wss?|https?):\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;
const OK_SCHEME = /^(data|blob|about|chrome|devtools):/;
function assertLocalUrl(u) { if (!LOCAL.test(u)) throw new Error('playtest: не локальный адрес запрещён: ' + u); return u; }
async function guardLocal(ctx) {
  const blocked = [];
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (LOCAL.test(u) || OK_SCHEME.test(u)) return r.continue(); blocked.push(u); return r.abort(); });
  if (ctx.routeWebSocket) await ctx.routeWebSocket(/.*/, (ws) => { const u = ws.url(); if (LOCAL.test(u)) return ws.connectToServer(); blocked.push(u); ws.close(); });
  ctx.on('page', (p) => p.on('websocket', (w) => { if (!LOCAL.test(w.url())) { blocked.push(w.url()); console.log('FAIL не локальный WebSocket: ' + w.url()); process.exit(2); } }));
  return blocked;
}
module.exports = { guardLocal, assertLocalUrl, LOCAL };
