// LOCAL: карта M — режим «🧭 Биомы» (N): цвет биома + подписи только в разведанном; обычный вид без подписей;
// подписи не налезают на иконки; правка админки (уровень моба, имя биома) — на карте сразу, без переподключения;
// модератор не может править «Рывок». Только localhost.
const { chromium } = require('playwright-core'); const { execSync } = require('node:child_process'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/map-biomes-v2', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
const ADMIN = 'test_admin_bm', MOD = 'test_mod_bm'; // постоянные id: кэш ролей сервера — 1 мин; разведку героя чистим перед прогоном
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
execSync(`cd /workspace/mg-push/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-chests/wr --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0), ('uid:${MOD}', 'moderator', 'local-test', 0); DELETE FROM hero_explore WHERE pkey LIKE '%${ADMIN}%'"`, { stdio: 'pipe' });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (n, uid) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await guardLocal(ctx); const p = await ctx.newPage(); p.fr = []; p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/"(toast_error|admin_result|admin_catalog)"/.test(s)) p.fr.push(s.slice(0, 300)); }));
    await p.goto(assertLocalUrl(`${BASE}?name=${n}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.waitForTimeout(1000); await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(2000); return p; };
  const p = await open('BiomeA', ADMIN), G = (fn, a) => p.evaluate(fn, a);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
  }
  await p.waitForFunction(() => window.__game.debug.fog().active, null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(1500);
  const wm = () => G(() => window.__game.debug.worldMap());
  await p.keyboard.press('KeyM'); await p.waitForTimeout(500); await G(() => window.__game.debug.mapZoom(0.4)); await p.waitForTimeout(300);
  let s = await wm(); ok(s.open && !s.biome && s.labelsDrawn === 0, `обычная карта: без подписей (${s.labelsDrawn})`);
  await p.screenshot({ path: `${OUT}/01-map-normal.png` });
  await p.keyboard.press('KeyN'); await p.waitForTimeout(400); s = await wm();
  ok(s.biome && s.labels.length === 1 && /Гранатовый двор/.test(s.labels[0]), `N → карта биомов; до похода только хаб: ${JSON.stringify(s.labels)}`);
  ok(!s.overlap, 'подписи не налезают на игрока/порталы');
  await p.screenshot({ path: `${OUT}/02-biome-before.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  for (const [x, y] of [[22800, 29000], [22800, 30000], [23400, 30600], [18000, 20400], [17400, 20000]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await p.waitForTimeout(1600); }
  await G(() => window.__game.debug.tp(22800, 27600, true)); await p.waitForTimeout(1600);
  await p.keyboard.press('KeyM'); await p.waitForTimeout(400); await G(() => window.__game.debug.mapZoom(0.4)); await p.waitForTimeout(300);
  s = await wm(); ok(s.biome, 'режим биомов запомнился до следующего открытия');
  ok(s.labels.some((l) => /^Кровавые льды: Алый наст 3-5/.test(l)) && s.labels.some((l) => /^Синее пламя: Тлеющие поля/.test(l)), 'после похода: льды 3–5 и синее пламя: ' + JSON.stringify(s.labels));
  ok(!s.labels.some((l) => /Железные каменоломни|Звёздная высь/.test(l)), 'неразведанные биомы скрыты');
  ok(!s.overlap, 'после похода — подписи не на иконках');
  await p.screenshot({ path: `${OUT}/03-biome-after.png` });
  // правка админки: уровень моба льдов → 20, имя биома → «Алые снега», без переподключения
  await G(() => { window.__game.debug.rawSend({ type: 'admin_save', kind: 'mob', id: 'ice_whisper_wisp', patch: { lvl: 20 } }); }); await p.waitForTimeout(500); await G(() => { window.__game.debug.rawSend({ type: 'admin_save', kind: 'biome', id: 'ice_inner', patch: { name: 'Алые снега', sub: 'Алый наст' } }); });
  await p.waitForFunction(() => (window.__game.debug.worldMap().labels || []).some((l) => /^Алые снега: Алый наст 3-20/.test(l)), null, { timeout: 15000 }).catch(() => {});
  s = await wm(); ok(s.labels.some((l) => /^Алые снега: Алый наст 3-20/.test(l)), 'правка админки на карте сразу: ' + JSON.stringify(s.labels.filter((l) => /Алы/.test(l))));
  await p.screenshot({ path: `${OUT}/04-biome-after-admin-edit.png` });
  await p.keyboard.press('KeyN'); await p.waitForTimeout(300); s = await wm(); ok(!s.biome && s.labelsDrawn === 0, 'N ещё раз — обычная карта');
  await G(() => { window.__game.debug.rawSend({ type: 'admin_reset', kind: 'mob', id: 'ice_whisper_wisp' }); }); await p.waitForTimeout(500); await G(() => { window.__game.debug.rawSend({ type: 'admin_reset', kind: 'biome', id: 'ice_inner' }); }); await p.waitForTimeout(1500);
  await p.keyboard.press('KeyN'); await p.waitForTimeout(300); s = await wm(); ok(s.labels.some((l) => /^Кровавые льды: Алый наст 3-5/.test(l)), 'сброс правок — снова как в коде');
  ok(!p.errs.length, 'без ошибок страницы ' + p.errs.join('|'));
  // модератор: нет вкладок «Рывок»/«Биомы», сервер отклоняет правку
  const M = await open('ModBm', MOD); await M.evaluate(() => window.__game.debug.openAdmin()); await M.waitForSelector('.mc-admin [data-tab]', { timeout: 15000 }).catch(() => {});
  const tabs = await M.evaluate(() => [...document.querySelectorAll('.mc-admin [data-tab]')].map((b) => b.dataset.tab)); ok(!tabs.includes('dash') && !tabs.includes('biome'), 'модератор: вкладок нет ' + JSON.stringify(tabs));
  M.fr.length = 0; await M.evaluate(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'dash', id: 'main', patch: { cd: 0.5 } })); await M.waitForTimeout(1200);
  ok(M.fr.some((f) => /Недостаточно прав|прав/.test(f)) && !M.fr.some((f) => /"admin_result"[^}]*"ok":true/.test(f)), 'модератор: правка рывка отклонена сервером ' + JSON.stringify(M.fr).slice(0, 200));
  const di = await M.evaluate(() => window.__game.debug.dashInfo()); ok(di.cd === 5, 'рывок остался 5 с');
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
