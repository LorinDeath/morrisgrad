// LOCAL: админка «Спавн» → локация: карта регионов с подсветкой выбранного; клик по карте выбирает регион.
const { chromium } = require('playwright-core'); const { execSync } = require('node:child_process'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/map-biomes', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', ADMIN = 'test_admin_rmap';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
execSync(`cd /workspace/mg-push/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-chests/wr --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)"`, { stdio: 'pipe' });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=RMap&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__game.debug.openAdmin()); await p.waitForSelector('.mc-admin [data-tab="spawn"]', { timeout: 15000 });
  await p.click('.mc-admin [data-tab="spawn"]'); await p.waitForTimeout(500);
  await p.fill('.mc-admin aside input', 'ice_inner'); await p.waitForTimeout(400);
  await p.click('.mc-admin aside li[data-id^="region:"]'); await p.waitForTimeout(600);
  const cap1 = await p.textContent('.adm-rmap-cap').catch(() => ''); ok(/ice_inner/.test(cap1), 'карта есть, выбран регион льдов: ' + cap1);
  await p.screenshot({ path: `${OUT}/04-admin-region-ice.png` });
  await p.fill('.mc-admin aside input', ''); await p.waitForTimeout(300);
  const cv = await p.$('.adm-rmap canvas'), bb = await cv.boundingBox();
  await p.mouse.click(bb.x + bb.width * (18000 / 48000), bb.y + bb.height * (20400 / 48000)); await p.waitForTimeout(700); // клик по пятну Синего пламени
  const cap2 = await p.textContent('.adm-rmap-cap').catch(() => ''); ok(/fire_inner/.test(cap2) && cap2 !== cap1, 'клик по карте выбрал другой регион: ' + cap2);
  ok(/fire_inner/.test(await p.textContent('.mc-admin aside li.on').catch(() => '')), 'в списке подсвечен тот же регион');
  await p.screenshot({ path: `${OUT}/05-admin-region-fire-click.png` });
  ok(!errs.length, 'без ошибок ' + errs.join('|'));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
