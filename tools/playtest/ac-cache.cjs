// LOCAL ONLY: сценарии кэша ресурсов. Трафик — по журналу сайта (что реально дошло до сервера).
// 1 первый визит · 2 повторный (только манифест) · 3 изменённый файл · 4 удалённый · 5 кэш выключен (флаг/localStorage)
// 6 манифест недоступен при кэше (L06) · 7 первый визит без манифеста (L01) · 8 нестабильная сеть · 9 квота (L03)
// 10 приватный режим (L04) · 11 обновление сервис-воркера (старый SW + новый деплой) · ошибки консоли.
const fs = require('fs'), crypto = require('crypto');
const L = require('./ac-lib.cjs');
const MOB = process.env.MOBILE === '1';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; return c; };
const ROOT = `/workspace/mc-harness-assets/ac-cache-${MOB ? 'mob' : 'pc'}`;
const fresh = (n) => { const d = `${ROOT}-${n}`; fs.rmSync(d, { recursive: true, force: true }); return d; };
const KNOWN = (s) => /Missing publishableKey|ERR_FAILED|ERR_PROXY_CONNECTION_FAILED/.test(s); // Clerk JS заблокирован guardLocal (только в стенде)
const allCons = [];
async function run(ctx, label, q = '', { routes, netFail = false } = {}) {
  const p = ctx.pages()[0] || (await ctx.newPage());
  await p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  if (routes) await routes(p);
  const mk = L.logMark(); const t0 = Date.now();
  const v = await L.visit(ctx, `&uid=ac_${label}&name=ac_${label}${q}`);
  await L.sleep(1500);
  const st = await L.acState(v.page), errs = await v.page.evaluate(() => (window.__mcErrLog || []).map((e) => e.code));
  const reqs = L.logSince(mk), game = reqs.filter((r) => !/^\/(api|_server|MorrisCurse\/?$|MorrisCurse\/\?)/.test(r.path));
  const r = { label, ffMs: v.ffMs, st, errs, reqN: game.length, bytes: L.bytesOf(game), paths: game.map((x) => x.path), wall: Date.now() - t0 };
  allCons.push(...v.cons.filter((s) => !KNOWN(s) && !(netFail && /Failed to load resource: net::ERR_(INTERNET_DISCONNECTED|CONNECTION_RESET)/.test(s))).map((s) => label + ': ' + s), ...v.errs.filter((s) => !KNOWN(s)).map((s) => label + ' pageerror: ' + s));
  console.log('·', label, JSON.stringify({ ffMs: r.ffMs, mode: st?.mode, fetched: st?.fetched, mb: st?.mb, evicted: st?.evicted, failed: st?.failed, ms: Math.round(st?.ms || 0), errs, reqN: r.reqN, kb: Math.round(r.bytes / 1024), list: st?.list, evList: st?.evList }));
  return { ...r, page: v.page };
}
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
(async () => {
  const M = L.manifest(), MP = '/mc-assets/manifest.json';
  // --- 1/2 первый и повторный визит
  let ctx = await L.launch(fresh('main'), { mobile: MOB });
  const v1 = await run(ctx, 'visit1');
  ok(v1.st.mode === 'sw' && v1.st.fetched > 10, `первый визит: скачано ${v1.st.fetched} файлов, ${v1.st.mb} МБ, первый кадр ${v1.ffMs} мс`);
  const v2 = await run(ctx, 'visit2');
  const v2assets = v2.paths.filter((x) => M.files.some((f) => x.split('?')[0] === f.p));
  ok(v2.st.fetched === 0 && v2assets.length === 0, `повторный визит: ресурсов с сервера ${v2assets.length}, манифест ${Math.round(v2.st.manifestBytes / 1024)} КБ, sync ${Math.round(v2.st.ms)} мс, первый кадр ${v2.ffMs} мс`);
  const ctlr = await v2.page.evaluate(() => !!navigator.serviceWorker.controller);
  ok(ctlr, 'страница под управлением SW');
  // --- 3 изменён файл (новый хеш): скачать только его, старую версию выселить, SW отдаёт новую
  const tgt = M.files.find((f) => f.p === '/js/three.min.js');
  const body = Buffer.concat([fs.readFileSync(L.DIST + tgt.p), Buffer.from('\n/* ac-test change */\n')]), nh = sha16(body);
  const M3 = JSON.parse(JSON.stringify(M)); const e3 = M3.files.find((f) => f.p === tgt.p); e3.h = nh; e3.s = body.length; M3.version += '-t3';
  const r3 = async (p) => { await p.route('**' + MP + '*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(M3) })); await p.route((u) => u.pathname === tgt.p && u.search === `?v=${nh}`, (rt) => rt.fulfill({ status: 200, contentType: 'text/javascript', body })); };
  const v3 = await run(ctx, 'changed', '', { routes: r3 });
  const k3 = await L.cacheKeys(v3.page);
  ok(v3.st.fetched === 1 && v3.st.evicted >= 1 && k3.includes(`${tgt.p}?v=${nh}`) && !k3.includes(`${tgt.p}?v=${tgt.h}`), `изменённый файл: скачано ${v3.st.fetched} (${Math.round(v3.st.fetchedBytes / 1024)} КБ), выселено ${v3.st.evicted}`);
  // --- 4 удалён файл из манифеста → выселен
  const gone = M.files.find((f) => f.g === 'sprites');
  const M4 = JSON.parse(JSON.stringify(M)); M4.files = M4.files.filter((f) => f.p !== gone.p); M4.version += '-t4';
  const v4 = await run(ctx, 'removed', '', { routes: (p) => p.route('**' + MP + '*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(M4) })) });
  const k4 = await L.cacheKeys(v4.page);
  ok(!k4.some((k) => k.startsWith(gone.p)), `удалённый файл ${gone.p} выселен (выселено ${v4.st.evicted}, вернулся three.min.js: скачано ${v4.st.fetched})`);
  // --- 6 манифест недоступен, кэш есть → L06, игра из кэша
  const v6 = await run(ctx, 'offline-manifest', '', { routes: (p) => p.route('**' + MP + '*', (rt) => rt.abort('internetdisconnected')), netFail: true });
  ok(v6.errs.includes('MC-L06') && v6.st.mode === 'sw' && v6.ffMs, `манифест недоступен: ${v6.errs.join(',')}, режим ${v6.st.mode}, игра запустилась за ${v6.ffMs} мс`);
  // --- 11 обновление SW: новый деплой (SW_VER+1 и новый манифест) поверх старого SW
  const swPath = L.DIST + '/mc-sw.js', swOrig = fs.readFileSync(swPath, 'utf8');
  const ver0 = await v6.page.evaluate(() => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data.ver); navigator.serviceWorker.controller.postMessage({ type: 'mc-ping' }, [ch.port2]); setTimeout(() => res(null), 3000); }));
  await ctx.close(); ctx = await L.launch(`${ROOT}-main`, { mobile: MOB, netGuard: true });
  fs.writeFileSync(swPath, swOrig.replace(/SW_VER\s*=\s*(\d+)/, (m, n) => `SW_VER = ${+n + 1}`));
  try {
    await L.sleep(1500);
    const ping = (pg) => pg.evaluate(() => new Promise((res) => { const c = navigator.serviceWorker.controller; if (!c) return res(null); const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data.ver); c.postMessage({ type: 'mc-ping' }, [ch.port2]); setTimeout(() => res(null), 2000); }));
    // первый визит после деплоя: страницей может ещё управлять старый воркер — он обязан отдать НОВЫЙ файл (индекс шлёт страница,
    // ?v=хеш не из его индекса → сеть), а не старую копию из кэша
    const M11 = { ...M3, sw: ver0 + 1 };
    const r11 = async (p) => { await p.route('**' + MP + '*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(M11) })); await p.route((u) => u.pathname === tgt.p && u.search === `?v=${nh}`, (rt) => rt.fulfill({ status: 200, contentType: 'text/javascript', body })); };
    const v11 = await run(ctx, 'sw-update', '', { routes: r11 });
    const verA = await ping(v11.page);
    const served = await v11.page.evaluate(async (u) => (await (await fetch(u)).text()).includes('ac-test change'), `${tgt.p}?v=${nh}`);
    const live = await v11.page.evaluate(async (p) => { const s = [...document.scripts].map((x) => x.src).find((x) => x.includes(p)); return s || null; }, tgt.p);
    // следующий заход (навигация в scope): браузер сам проверяет воркер (updateViaCache:'none') → новая версия, skipWaiting + claim
    // следующий заход (новый запуск браузера/вкладки): навигация в scope сама проверяет воркер (updateViaCache:'none') → новая версия
    await ctx.close(); ctx = await L.launch(`${ROOT}-main`, { mobile: MOB, netGuard: true });
    const v12 = await run(ctx, 'after-update', '', { routes: r11 });
    let verB = null; for (let i = 0; i < 10 && !(verB > ver0); i++) { verB = await ping(v12.page); if (!(verB > ver0)) await L.sleep(1000); }
    console.log('  sw', JSON.stringify({ from: v11.st.swFrom, to: v11.st.swTo, syncMs: Math.round(v11.st.ms) }));
    ok(served && verA > ver0 && verB > ver0 && v12.st.mode === 'sw' && v12.ffMs, `обновление SW: воркер v${ver0} → v${verA} на экране загрузки (sync ${Math.round(v11.st.ms)} мс), новый файл отдаётся сразу: ${served}; следующий заход v${verB}, игра ${v12.ffMs} мс${live ? ', ' + live.split('/').pop() : ''}`);
  } finally { fs.writeFileSync(swPath, swOrig); }
  await ctx.close(); ctx = await L.launch(`${ROOT}-main`, { mobile: MOB });
  // --- 5 выключатели
  const v5 = await run(ctx, 'flag-off', '', { routes: (p) => p.route('**' + MP + '*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...M, flags: { cache: false } }) })) });
  const sw5 = await v5.page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, keys: (await caches.keys()).filter((k) => k.startsWith('mc-')).length }));
  ok(v5.st.mode === 'off' && v5.ffMs && sw5.regs === 0 && sw5.keys === 0, `флаг cache=false: режим ${v5.st.mode}, SW снят (${sw5.regs}), кэши удалены (${sw5.keys}), игра ${v5.ffMs} мс`);
  await v5.page.evaluate(() => localStorage.setItem('mc_cache_off', '1'));
  const v5b = await run(ctx, 'ls-off');
  ok(v5b.st.mode === 'off' && v5b.ffMs, `localStorage mc_cache_off: режим ${v5b.st.mode}, игра ${v5b.ffMs} мс`);
  await v5b.page.evaluate(() => localStorage.removeItem('mc_cache_off'));
  const v5c = await run(ctx, 'reenable');
  ok(v5c.st.mode === 'sw' && v5c.st.fetched > 10, `кэш снова включён → полная докачка ${v5c.st.fetched} файлов`);
  await ctx.close();
  // --- 7 первый визит без манифеста
  ctx = await L.launch(fresh('nomani'), { mobile: MOB });
  const v7 = await run(ctx, 'first-no-manifest', '', { routes: (p) => p.route('**' + MP + '*', (rt) => rt.abort('internetdisconnected')), netFail: true });
  ok(v7.errs.includes('MC-L01') && v7.st.mode === 'net' && v7.ffMs, `первый визит без манифеста: ${v7.errs.join(',')}, режим ${v7.st.mode}, игра из сети ${v7.ffMs} мс`);
  await ctx.close();
  // --- 8 нестабильная сеть: 30% загрузок ресурсов обрываются
  ctx = await L.launch(fresh('flaky'), { mobile: MOB });
  let aborted = 0; const seen = new Set();
  const v8 = await run(ctx, 'flaky', '', { routes: (p) => p.route(/\/(_astro|images|js|props[23]|mc-vn)\/.*/, (rt) => { const u = rt.request().url(); if (rt.request().resourceType() === 'fetch' && !seen.has(u) && Math.random() < 0.3) { seen.add(u); aborted++; return rt.abort('connectionreset'); } seen.add(u); return rt.continue(); }), netFail: true });
  ok(v8.st.mode === 'sw' && v8.st.failed === 0 && v8.ffMs, `нестабильная сеть: оборвано ${aborted}, докачано повтором, ошибок ${v8.st.failed}, игра ${v8.ffMs} мс`);
  await ctx.close();
  // --- 8b обрыв на самом загрузчике страницы (первый визит): окно MC-L09 с «Повторить», а не пустой экран
  ctx = await L.launch(fresh('bootfail'), { mobile: MOB });
  { const p = ctx.pages()[0] || (await ctx.newPage()); let hit = 0;
    await p.route((u) => /index\.astro_astro_type_script/.test(u.pathname), (rt) => { hit++; return rt.abort('connectionreset'); });
    await p.goto(`${L.SITE}/MorrisCurse/?debug=1`, { waitUntil: 'domcontentloaded' });
    const box = await p.waitForSelector('.mcl-err[data-code="MC-L09"]', { timeout: 30000 }).then(() => true, () => false);
    if (box) await p.screenshot({ path: `/workspace/morrisgrad-round3/asset-cache/errors/MC-L09-${MOB ? 'phone' : 'pc'}.png` }).catch(() => {});
    await p.unrouteAll({ behavior: 'ignoreErrors' });
    let healed = false; if (box) { await p.click('.mcl-guard button:last-child'); healed = await p.waitForSelector('#btn-start', { timeout: 30000 }).then(() => p.waitForFunction(() => window.__mcLaunch === 1, null, { timeout: 30000 })).then(() => true, () => false); }
    ok(hit > 0 && box && healed, `загрузчик страницы не скачался: окно MC-L09 ${box ? 'показано' : 'НЕТ'}, «Повторить» → загрузчик работает: ${healed}`); }
  await ctx.close();
  // --- 9 квота: Cache.put бросает QuotaExceededError
  ctx = await L.launch(fresh('quota'), { mobile: MOB, init: () => { const o = Cache.prototype.put; Cache.prototype.put = function (req, res) { if (String(req.url || req).includes('/mc-assets/') || String(req.url || req).includes('__mc')) return o.call(this, req, res); return Promise.reject(new DOMException('quota', 'QuotaExceededError')); }; } });
  const v9 = await run(ctx, 'quota');
  ok(v9.errs.includes('MC-L03') && v9.st.mode === 'net' && v9.ffMs, `квота: ${v9.errs.join(',')}, режим ${v9.st.mode}, игра ${v9.ffMs} мс`);
  await ctx.close();
  // --- 10 приватный режим: нет caches и serviceWorker
  ctx = await L.launch(fresh('private'), { mobile: MOB, init: () => { try { delete window.caches; Object.defineProperty(window, 'caches', { value: undefined }); } catch (_) {} try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); } catch (_) {} } });
  const v10 = await run(ctx, 'private');
  ok(v10.errs.includes('MC-L04') && v10.st.mode === 'net' && v10.ffMs, `приватный режим: ${v10.errs.join(',')}, режим ${v10.st.mode}, игра ${v10.ffMs} мс`);
  await ctx.close();
  ok(allCons.length === 0, 'ошибок консоли нет (кроме Clerk стенда): ' + JSON.stringify(allCons.slice(0, 6)));
  fs.writeFileSync(`/workspace/mc-harness-assets/ac-cache-${MOB ? 'mob' : 'pc'}.json`, JSON.stringify({ v1: v1.st, v1ff: v1.ffMs, v2: v2.st, v2ff: v2.ffMs, v2req: v2.paths }, null, 1));
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
