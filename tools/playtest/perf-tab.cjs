// LOCAL: админка «📊 Нагрузка» — 4 подраздела, графики, «Скопировать JSON»; модератору вкладки нет и сервер отказывает.
const { chromium } = require('playwright-core'); const { execSync } = require('node:child_process'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/perf-tab', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', ADMIN = 'test_admin_perf', MOD = 'test_mod_perf';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const rx = () => { const W = window.WebSocket; window.__rx = []; window.WebSocket = class extends W { constructor(...a) { super(...a); this.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); if (m.type !== 'players_state' && m.type !== 'zone_state') window.__rx.push(m.type === 'admin_perf' ? m : { type: m.type, message: m.message }); } catch (_) {} }); } }; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, name) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await guardLocal(ctx); await ctx.addInitScript(rx); await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5243' });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`${BASE}?name=${name}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500); return p; };
  // гость для онлайна «гости»
  const g = await open('', 'Гость1').catch(() => null);
  const p = await open(ADMIN, 'PerfAdm');
  await p.evaluate(() => window.__game.debug.openAdmin()); await p.waitForSelector('.mc-admin [data-tab="perf"]', { timeout: 15000 });
  ok(true, 'админ видит вкладку «📊 Нагрузка»');
  await p.click('.mc-admin [data-tab="perf"]'); await p.waitForSelector('.pf-kv', { timeout: 15000 }); await p.waitForTimeout(800);
  const subs = [['server', '01-server'], ['online', '02-online'], ['players', '03-players'], ['economy', '04-economy']];
  for (const [k, f] of subs) { await p.click(`.mc-admin [data-psub="${k}"]`); await p.waitForTimeout(500); const t = await p.textContent('.mc-admin section');
    ok(t.length > 200 && !/undefined|NaN/.test(t), `подраздел ${k}: отрисован без undefined/NaN`); await p.screenshot({ path: `${OUT}/${f}.png` }); await p.locator('.mc-admin section').screenshot({ path: `${OUT}/${f}-section.png` }).catch(() => {}); }
  const data = await p.evaluate(() => window.__rx.filter((m) => m.type === 'admin_perf').pop()?.data);
  ok(data && data.server.target.tickMs === 100 && data.server.tickHz && data.online.now.total >= 1, 'JSON: цель такта, онлайн ' + JSON.stringify(data?.online?.now));
  ok(data && !/test_admin_perf|PerfAdm|Гость1|127\.0\.0\.1/.test(JSON.stringify(data)), 'JSON без ников/uid/IP');
  ok(data && Object.keys(data.server.zones).length >= 1, 'JSON: время миров ' + Object.keys(data?.server?.zones || {}).join(','));
  await p.click('.mc-admin [data-pcopy]'); await p.waitForTimeout(400);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  let parsed = null; try { parsed = JSON.parse(clip); } catch (_) {} ok(parsed && parsed.v === 1 && parsed.server && parsed.economy, 'кнопка «Скопировать JSON» → валидный JSON (' + clip.length + ' байт)');
  require('fs').writeFileSync(`${OUT}/sample.json`, clip || '{}');
  ok(!p.errs.length, 'без ошибок у админа ' + p.errs.join('|'));
  // модератор
  const m = await open(MOD, 'PerfMod');
  await m.evaluate(() => window.__game.debug.openAdmin()); await m.waitForTimeout(1500);
  const tabs = await m.$$eval('.mc-admin [data-tab]', (x) => x.map((e) => e.dataset.tab)).catch(() => []);
  ok(tabs.length > 0 && !tabs.includes('perf'), 'модератор: вкладок ' + tabs.join(',') + ' — «Нагрузки» нет');
  await m.evaluate(() => window.__game.debug.rawSend({ type: 'admin_perf' })); await m.waitForTimeout(1500);
  const mr = await m.evaluate(() => window.__rx.slice(-10));
  ok(!mr.some((x) => x.type === 'admin_perf') && mr.some((x) => x.type === 'toast_error'), 'модератор: сервер отказал в admin_perf ' + JSON.stringify(mr.filter((x) => x.type === 'toast_error')));
  await m.screenshot({ path: `${OUT}/05-moderator-no-tab.png` });
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
