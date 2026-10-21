// Общие помощники плейтестов кэша ресурсов (LOCAL ONLY): сайт — wrangler dev сборки dist (:8952), игра — server (:8951).
// Счёт трафика — по журналу сайта (wrangler: строки «GET /путь 200»): это то, что реально дошло до сервера, мимо SW и кэшей.
const fs = require('fs');
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl, LOCAL } = require('./_local.cjs');
const SITE = process.env.AC_SITE || 'http://127.0.0.1:8952', WS = process.env.AC_WS || 'ws://127.0.0.1:8951', LOG = process.env.AC_LOG || '/workspace/mc-harness-assets/site.log';
const DIST = process.env.AC_DIST || __dirname + '/../../dist';
assertLocalUrl(SITE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = () => JSON.parse(fs.readFileSync(DIST + '/mc-assets/manifest.json', 'utf8'));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
function logMark() { return fs.statSync(LOG).size; }
/** запросы к сайту после метки: [{ m, path, st }] */
function logSince(mark) {
  const fd = fs.openSync(LOG, 'r'), n = fs.statSync(LOG).size - mark, b = Buffer.alloc(Math.max(0, n)); fs.readSync(fd, b, 0, n, mark); fs.closeSync(fd);
  return strip(b.toString()).split('\n').map((l) => l.match(/\[wrangler:info\] (GET|HEAD|POST) (\S+) (\d{3})/)).filter(Boolean).map((m) => ({ m: m[1], path: m[2], st: +m[3] }));
}
/** байты по журналу: размер из манифеста (или файла dist) для каждого 200 */
function bytesOf(reqs) {
  const M = manifest(), by = new Map(M.files.map((f) => [f.p, f.s])); let b = 0;
  for (const r of reqs) { if (r.st !== 200 || r.m !== 'GET') continue; const p = decodeURIComponent(r.path.split('?')[0]); let s = by.get(p); if (s == null) { try { s = fs.statSync(DIST + p).size; } catch (_) { s = 0; } } b += s; }
  return b;
}
// netGuard: «только локально» силами самого Chrome (всё не-локальное → мёртвый прокси 127.0.0.1:9), без ctx.route —
// перехват Playwright подвешивает проверку обновления сервис-воркера (registration.update() не завершается).
async function launch(dir, { mobile = false, init = null, netGuard = false } = {}) {
  const opt = { executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    viewport: mobile ? { width: 390, height: 800 } : { width: 1280, height: 760 }, ...(mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) };
  if (netGuard) opt.args.push('--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  const ctx = await chromium.launchPersistentContext(dir, opt);
  if (!netGuard) await guardLocal(ctx);
  else ctx.on('page', (p) => p.on('request', (r) => { if (!LOCAL.test(r.url()) && !/^(data|blob|about|chrome):/.test(r.url())) console.log('  (net-guard: не локальный запрос оборван Chrome) ' + r.url().slice(0, 80)); }));
  if (init) await ctx.addInitScript(init);
  return ctx;
}
/** открыть страницу игры, нажать «Играть», дождаться хаба. Возвращает { page, errs, t: { nav→first-frame мс } } */
async function visit(ctx, q = '', { wait = 'hub', timeout = 180000 } = {}) {
  const p = ctx.pages()[0] || (await ctx.newPage()); const errs = [], cons = [];
  p.removeAllListeners('pageerror'); p.removeAllListeners('console');
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 240)));
  p.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 240)); });
  await p.addInitScript(() => { window.addEventListener('mc:first-frame', () => { window.__ff = performance.now(); }); });
  await p.goto(assertLocalUrl(`${SITE}/MorrisCurse/?debug=1&ws=${encodeURIComponent(WS)}${q}`), { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#btn-start'); const t0 = await p.evaluate(() => performance.now());
  await p.click('#btn-start');
  if (wait === 'hub') await p.waitForFunction(() => window.__MC3D_GAME__?.state?.().mode === 'hub' && window.__ff, null, { timeout });
  const ff = wait === 'hub' ? await p.evaluate(() => window.__ff) : 0;
  return { page: p, errs, cons, ffMs: ff ? Math.round(ff - t0) : null };
}
const acState = (p) => p.evaluate(() => window.__mcAssets ? window.__mcAssets.cacheSummary() : null);
const cacheKeys = (p) => p.evaluate(async () => { const c = await caches.open('mc-assets-v1'); return (await c.keys()).map((r) => { const u = new URL(r.url); return decodeURIComponent(u.pathname) + u.search; }); });
module.exports = { SITE, WS, LOG, DIST, sleep, manifest, logMark, logSince, bytesOf, launch, visit, acState, cacheKeys };
