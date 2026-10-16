// LOCAL: рывок — перезарядка 5 с на сервере (dash_reject), мигание неуязвимости видит другой игрок, вкладка админки «🏃 Рывок».
const { chromium } = require('playwright-core'); const { execSync } = require('node:child_process'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/map-biomes', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', ADMIN = 'test_admin_rmap';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
execSync(`cd /workspace/mg-push/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-chests/wr --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)"`, { stdio: 'pipe' });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (n, uid) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await guardLocal(ctx); const p = await ctx.newPage(); p.fr = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/"dash_(fx|reject)"/.test(s)) p.fr.push(JSON.parse(s)); }));
    await p.goto(assertLocalUrl(`${BASE}?name=${n}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500); return p; };
  const A = await open('DashA', ADMIN), B = await open('DashB', 'dash_b_' + Date.now());
  await A.evaluate(() => window.__game.debug.tp(600, 700, false)); await B.evaluate(() => window.__game.debug.tp(640, 700, false)); await A.waitForTimeout(1500);
  const di = await A.evaluate(() => window.__game.debug.dashInfo()); ok(di.cd === 5 && di.invulnMs === 83 && di.blink, 'клиент получил с сервера: ' + JSON.stringify(di));
  const watch = B.evaluate(() => new Promise((res) => { const seen = new Set(); const t0 = performance.now(); const f = () => { for (const k of window.__game.debug.dashInfo().blinking) seen.add(k); performance.now() - t0 < 1500 ? requestAnimationFrame(f) : res([...seen]); }; f(); }));
  await A.keyboard.press('Space');
  const sawB = await watch; // мигание у второго игрока
  await A.waitForTimeout(500);
  ok(B.fr.some((m) => m.type === 'dash_fx' && m.ms === 83), 'второй игрок получил dash_fx 83 мс'); ok(sawB.length >= 1, 'у второго игрока A мигал: ' + JSON.stringify(sawB));
  await A.evaluate(() => { window.__game.debug.rawSend({ type: 'dash' }); }); await A.waitForTimeout(400); // в обход клиентской перезарядки
  ok(A.fr.some((m) => m.type === 'dash_reject' && m.left > 1000), 'сервер отклонил повторный рывок до конца 5 с: ' + JSON.stringify(A.fr));
  await A.evaluate(() => window.__game.debug.openAdmin()); await A.waitForSelector('.mc-admin [data-tab="dash"]', { timeout: 15000 });
  await A.click('.mc-admin [data-tab="dash"]'); await A.waitForTimeout(400); await A.click('.mc-admin aside li[data-id]'); await A.waitForTimeout(500);
  ok(/Перезарядка рывка/.test(await A.textContent('.mc-admin section')), 'вкладка «🏃 Рывок»: поля видны');
  await A.screenshot({ path: `${OUT}/06-admin-dash.png` });
  const Bt = await B.evaluate(() => [...document.querySelectorAll('.mc-admin [data-tab]')].length); ok(Bt === 0, 'обычный игрок: админки нет');
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
