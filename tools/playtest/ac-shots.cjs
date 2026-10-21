// LOCAL ONLY: скриншоты экранов загрузки и окон ошибок (ПК и телефон) → /workspace/morrisgrad-round3/asset-cache/{,errors/}
// MOBILE=1 — телефон (390×800, DPR 2, масштаб UI 1.25). Сеть замедляется маршрутом (задержка ответа), чтобы застать прогресс.
const fs = require('fs'), crypto = require('crypto');
const L = require('./ac-lib.cjs');
const MOB = process.env.MOBILE === '1', DEV = MOB ? 'phone' : 'pc';
const OUT = '/workspace/morrisgrad-round3/asset-cache', EOUT = OUT + '/errors'; fs.mkdirSync(EOUT, { recursive: true });
const MP = '/mc-assets/manifest.json', got = [];
const shot = async (p, name, dir = OUT) => { const f = `${dir}/${name}-${DEV}.png`; await p.screenshot({ path: f }); got.push(f); };
const G = (p, fn, a) => p.evaluate(fn, a);
const waitSel = (p, s, t = 20000) => p.waitForSelector(s, { timeout: t }).then(() => true, () => false);
async function slowAssets(p, ms) { await p.route(/\/(_astro\/.*\.(png|webp|json)|images\/|props[23]\/|js\/three)/, async (rt) => { if (rt.request().resourceType() === 'fetch') await L.sleep(ms); return rt.continue(); }); }
async function start(p, q = '') { await p.goto(`${L.SITE}/MorrisCurse/?debug=1&ws=${encodeURIComponent(L.WS)}${q}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#btn-start'); await p.click('#btn-start'); }
const inHub = (p) => p.waitForFunction(() => window.__MC3D_GAME__?.state?.().mode === 'hub', null, { timeout: 120000 });
(async () => {
  const dir = `/workspace/mc-harness-assets/ac-shots-${DEV}`; fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await L.launch(dir, { mobile: MOB, init: MOB ? () => { try { localStorage.setItem('mc_ui_scale_mob', '1.25'); } catch (_) {} } : null });
  const p = ctx.pages()[0] || (await ctx.newPage()); const cons = []; p.on('console', (m) => m.type() === 'error' && cons.push(m.text().slice(0, 160)));
  const uid = '&uid=shots_' + DEV + '&name=shots';
  // 1 первый визит: полный экран, стадии, байты/скорость/ETA, объяснение
  await slowAssets(p, 350); await start(p, uid);
  if (await waitSel(p, '[data-mcl="full"]')) { await L.sleep(1800); await shot(p, '01-first-visit'); await G(p, () => document.documentElement.classList.add('mc-ui')); await L.sleep(200); await shot(p, '01b-first-visit-cursed-theme'); await G(p, () => document.documentElement.classList.remove('mc-ui')); }
  await inHub(p); await p.unrouteAll({ behavior: 'ignoreErrors' });
  // 2 «Ресурсы актуальны» (повторный визит)
  await start(p, uid); if (await waitSel(p, '[data-mcl="ok"]', 15000)) await shot(p, '02-up-to-date');
  await inHub(p);
  // 3 тост обновления: один изменённый файл, медленно
  const M = L.manifest(), tgt = M.files.find((f) => f.p === '/js/three.min.js');
  const body = Buffer.concat([fs.readFileSync(L.DIST + tgt.p), Buffer.from('\n/* shots */\n')]), nh = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  const M3 = JSON.parse(JSON.stringify(M)); Object.assign(M3.files.find((f) => f.p === tgt.p), { h: nh, s: body.length }); M3.version += '-s';
  await p.route('**' + MP + '*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(M3) }));
  await p.route((u) => u.pathname === tgt.p && u.search === `?v=${nh}`, async (rt) => { await L.sleep(2500); rt.fulfill({ status: 200, contentType: 'text/javascript', body }); });
  await start(p, uid); if (await waitSel(p, '[data-mcl="update"]', 15000)) { await L.sleep(600); await shot(p, '03-update-toast'); }
  await inHub(p); await p.unrouteAll({ behavior: 'ignoreErrors' }); await L.sleep(1500);
  // 4 угловой индикатор: ленивая группа «map», медленно
  await slowAssets(p, 900);
  await G(p, () => { window.__mcAssets.AC.groups.delete('map'); window.__mcAssets.ensureGroup('map'); });
  if (await waitSel(p, '.mcl-corner, [data-mcl="corner"]', 8000)) { await L.sleep(700); const c = await p.$('.mcl-corner, [data-mcl="corner"]'); await c.hover().catch(() => {}); await L.sleep(400); await shot(p, '04-corner-indicator'); }
  await p.unrouteAll({ behavior: 'ignoreErrors' });
  // 5 подпись перехода между зонами (прогрев)
  await G(p, () => window.__MC3D_GAME__.debug.tp(240, 600)); await L.sleep(900);
  await G(p, () => window.__MC3D_GAME__.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' }));
  if (await waitSel(p, '[data-mcl="veil"]', 10000)) await shot(p, '05-zone-veil');
  await p.waitForFunction(() => window.__MC3D_GAME__.state().world === 'arinar', null, { timeout: 30000 }).catch(() => {}); await L.sleep(4000);
  // --- ошибки
  const errShot = async (code, fn) => { await G(p, () => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await fn(); const okk = await waitSel(p, `.mcl-err[data-code="${code}"]`, 15000); if (okk) { await L.sleep(400); await shot(p, code, EOUT); } console.log((okk ? 'PASS ' : 'FAIL ') + code); };
  await errShot('MC-G03', async () => { await p.route(/missing_atlas/, (rt) => rt.fulfill({ status: 404, body: 'x' })); await G(p, () => window.__MC3D_GAME__.debug.loadAtlas?.('/_astro/missing_atlas.png')); });
  await p.unrouteAll({ behavior: 'ignoreErrors' });
  await errShot('MC-A03', async () => { await G(p, () => window.__MC3D_GAME__.debug.openAdmin()); });
  await G(p, () => { try { window.__MC3D_GAME__.debug.closeAdmin?.(); } catch (_) {} document.querySelector('.adm-close, [data-adm-close]')?.click(); });
  // обрыв связи: сокет закрывается со стороны «сервера» (маршрут Playwright стоит между страницей и локальным сервером)
  let wsr = null; await p.routeWebSocket(/127\.0\.0\.1:8951/, (ws) => { ws.connectToServer(); wsr = ws; });
  await start(p, uid); await inHub(p); await L.sleep(2000);
  await errShot('MC-N02', async () => { await wsr?.close({ code: 1011, reason: 'test drop' }); });
  await errShot('MC-G01', async () => { await G(p, () => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); gl.getExtension('WEBGL_lose_context').loseContext(); }); });
  // офлайн-манифест (L06) и ресурсы не скачаны без сети (L01) — на новом заходе
  await errShot('MC-L06', async () => { await p.route('**' + MP + '*', (rt) => rt.abort('internetdisconnected')); await start(p, uid); });
  await p.unrouteAll({ behavior: 'ignoreErrors' });
  console.log('shots', got.length); console.log(got.join('\n'));
  console.log('console.error', JSON.stringify(cons.filter((s) => !/publishableKey|ERR_FAILED|ERR_INTERNET/.test(s)).slice(0, 8)));
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(2); });
