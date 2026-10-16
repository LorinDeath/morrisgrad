// LOCAL: «Спавн» → локация «groves»: множитель лагерей и пачки/мобы меняют живой спавн сразу (без перезапуска). Только localhost.
const { chromium } = require('playwright-core'); const { execSync } = require('node:child_process'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/map-biomes-v2', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', ADMIN = 'test_admin_bm';
const R = [19200, 19200, 28800, 22200]; // прямоугольник «Северные гранатовые рощи»
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
execSync(`cd /workspace/mg-push/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-chests/wr --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)"`, { stdio: 'pipe' });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await guardLocal(ctx); const p = await ctx.newPage(); const fr = [];
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/"(toast_error|admin_result)"/.test(s)) fr.push(s.slice(0, 200)); }));
  await p.goto(assertLocalUrl(`${BASE}?name=SpawnA&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (fn, a) => p.evaluate(fn, a);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
  }
  await G(() => window.__game.debug.tp(24000, 20700, true));
  const camps = async () => { await p.waitForTimeout(4500); return G((R) => (window.__game.debug.campsRaw() || []).filter((c) => c[1] >= R[0] && c[1] <= R[2] && c[2] >= R[1] && c[2] <= R[3]), R); };
  const save = async (patch) => { await G((pt) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'region', id: 'groves', patch: pt }), patch); await p.waitForTimeout(600); };
  await G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'region', id: 'groves' })); await p.waitForTimeout(600);
  const c0 = await camps(), max0 = Math.max(...c0.map((c) => c[4]));
  ok(c0.length > 3, `как в коде: лагерей ${c0.length}, мобов в лагере до ${max0}`);
  await save({ dens: 2.5 }); const c1 = await camps(); ok(c1.length > c0.length * 1.5, `множитель 2.5: лагерей ${c0.length} → ${c1.length}`);
  await save({ dens: 1, 'packs.0': 1, 'packs.1': 1, 'pack.0': 1, 'pack.1': 1 }); const c2 = await camps(); const max2 = Math.max(...c2.map((c) => c[4]));
  ok(max2 <= 3, `1 пачка × 1 моб: мобов в лагере до ${max2} (было до ${max0}; + вожак)`);
  await save({ 'packs.0': 4, 'packs.1': 4, 'pack.0': 4, 'pack.1': 4 }); const c3 = await camps(); const min3 = Math.min(...c3.map((c) => c[4]));
  ok(min3 >= 16, `4 пачки × 4 моба: в каждом лагере ≥ 16 (мин ${min3})`);
  await save({ dens: 0 }); const c4 = await camps(); ok(c4.length === 0, `множитель 0: лагерей ${c4.length}`);
  await G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'region', id: 'groves' })); const c5 = await camps(); ok(c5.length > 3, `сброс — снова лагеря (${c5.length})`);
  ok(!fr.some((f) => /toast_error/.test(f)), 'без отказов сервера ' + fr.filter((f) => /toast_error/.test(f)).join(' '));
  // админка: подсказки «как в коде» вместо «—»
  await G(() => window.__game.debug.openAdmin()); await p.waitForSelector('.mc-admin [data-tab="spawn"]'); await p.click('.mc-admin [data-tab="spawn"]'); await p.waitForTimeout(300);
  await p.fill('.mc-admin aside input', 'groves'); await p.waitForTimeout(300); await p.click('.mc-admin aside li[data-id="region:groves"]'); await p.waitForTimeout(500);
  const ph = await G(() => [...document.querySelectorAll('.mc-admin section input[type=number]')].map((i) => i.placeholder)); ok(!ph.includes('—') && ph.some((x) => /3 \(в/.test(x)), 'подсказки по умолчанию: ' + JSON.stringify(ph));
  await p.screenshot({ path: `${OUT}/06-admin-region-defaults.png` });
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
