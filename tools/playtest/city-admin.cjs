// LOCAL: аудит админки города — по одной правке во вкладках «Город», «PK-режим», «День и ночь» (огни): сохранение →
// применилось у клиента ВЖИВУЮ (без перезахода) → лежит в D1 (локальная) и переживает перезаход → «Вернуть исходное» → по умолчанию.
// Скриншоты вкладок (новые поля). Только 127.0.0.1; D1 — локальный persist этого стенда (mc-harness-city/wr).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const { execSync } = require('node:child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/polish/admin';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400))); };
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mc-ui-tools && node node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-city/wr -c /workspace/mg-city/server/wrangler.json --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const row = (k) => d1(`SELECT data FROM game_overrides WHERE kind='${k}' AND id='main'`)[0]?.data || '';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const left = d1(`SELECT kind FROM game_overrides WHERE kind IN ('city','pk','dn')`).map((r) => r.kind);
  if (left.length && !process.env.CLEAN) { console.log('ABORT: в D1 уже есть правки', left, '— не трогаю (CLEAN=1 — сбросить через admin_reset, если это остатки этого плейтеста)'); process.exit(2); }
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
    p.G = (f, a) => p.evaluate(f, a); p.uid = uid; return p;
  };
  const toArinar = async (p) => {
    if ((await p.G(() => window.__game.state().player?.stats?.classId)) == null) { await p.G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
    for (let i = 0; i < 8 && (await p.G(() => window.__game.state().world)) !== 'arinar'; i++) { await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await p.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  };
  const dev = async (p, o) => { await p.G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 5000 }).catch(() => {}); return p.G(() => window.__devCity); };
  const tp = async (p, x, y) => { await p.G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1200); };
  const city = (p) => p.G(() => window.__game.debug.city());
  const live = (p) => p.G(() => window.__game.debug.cfgLive());
  const until = async (p, f, ms = 15000) => { const T0 = Date.now(); let v; while (Date.now() - T0 < ms) { v = await live(p); if (f(v)) return v; await sleep(400); } return v; };
  const save = (p, kind, patch) => p.G(([kind, patch]) => window.__game.debug.rawSend({ type: 'admin_save', kind, id: 'main', patch }), [kind, patch]);
  const reset = (p, kind) => p.G((kind) => window.__game.debug.rawSend({ type: 'admin_reset', kind, id: 'main' }), kind);
  const tabShot = async (p, tab, name, field, n) => {
    await p.G(() => window.__game.debug.openAdmin()); await sleep(2500);
    await p.G((tab) => document.querySelector(`.mc-admin [data-tab="${tab}"]`)?.click(), tab); await sleep(800);
    await p.G(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside li, .mc-admin aside button')].find((e) => /main|Город|PK|День/.test(e.textContent)); r?.click(); }); await sleep(900);
    const has = await p.G((f) => { const e = document.querySelector(`.mc-admin section [data-p="${f}"]`); e?.scrollIntoView({ block: 'center' }); return !!e; }, field); await sleep(500);
    await p.screenshot({ path: `${OUT}/${n}-${name}.png` }); console.log('shot', n, name);
    await p.G(() => window.__game.debug.closeAdmin?.() ?? document.querySelector('.mc-admin [data-close], .mc-admin .close')?.click()); await sleep(400); return has; };

  const A = await open('city_admin'); await toArinar(A);
  for (const k of left) { await reset(A, k); await sleep(700); } if (left.length) { await sleep(1500); console.log('CLEAN: сброшено', left, d1(`SELECT kind FROM game_overrides WHERE kind IN ('city','pk','dn')`)); }
  await tp(A, 24624, 3300); await A.G(() => window.__game.debug.setCells(14)); await sleep(3000);
  const d0 = await live(A);
  t('исходно: земля 1, пятно 1, переход 0.6 с, ползунок до 100 %, огни k 1, правок точек нет', d0.gl === 1 && d0.blightScale === 1 && d0.fade === 0.6 && d0.reduceMax === 100 && d0.lt.kLamp === 1 && !d0.emitters, d0);

  // вкладки: поля на месте (скриншоты до правок)
  t('вкладка «Город»: яркость земли, переход купола, пятно порчи', await tabShot(A, 'city', 'city-ground-dome-blight', 'groundLight', '01') && await tabShot(A, 'city', 'city-blight', 'blightSize', '02'));
  t('вкладка «PK-режим»: сброс отсчёта уроном (получил/нанёс), полоса, значок', await tabShot(A, 'pk', 'pk-interrupt-bar-tag', 'cancelOnHit', '03'));
  t('вкладка «День и ночь»: ползунок, огни (мерцание/ореол/пятно/сила), точки огня', await tabShot(A, 'dn', 'dn-lights', 'lt.kLamp', '04') && await tabShot(A, 'dn', 'dn-emitters', 'emitters', '05'));

  // 1) Город: яркость земли (перебак чанков города), пятно порчи, переход купола
  await save(A, 'city', { groundLight: 1.6, blightSize: 1.8, fadeSec: 1.5 });
  const c1 = await until(A, (v) => v.gl === 1.6 && v.blightScale === 1.8 && v.fade === 1.5 && v.cityChunksGl.length && v.cityChunksGl.every((g) => g === 1.6), 30000);
  t('Город: применилось вживую (земля перебакана 1.6, пятно ×1.8, переход 1.5 с)', c1.gl === 1.6 && c1.blightScale === 1.8 && c1.fade === 1.5 && c1.cityChunksGl.every((g) => g === 1.6), c1);
  t('Город: D1 game_overrides city/main', /"groundLight":1.6/.test(row('city')), row('city'));
  await A.screenshot({ path: `${OUT}/06-live-city-ground-1.6.png` });
  // 1b) Город → моб ↔ купол: по умолчанию выталкивает на 40 px со вспышкой; 200 px без вспышки — вживую (сервер), в D1; вне пределов — отказ
  t('вкладка «Город»: моб у купола (выталкивание, запас агро, боссы, вспышка)', await tabShot(A, 'city', 'city-mob-dome', 'mobPushPx', '01b'));
  const R = (await city(A)).dome.r, CX = 24624, CY = 3376;
  const lure = async (ms = 3500) => { await tp(A, CX + R - 140, CY); const rp0 = (await city(A)).dome.repel; await dev(A, { mobAt: [CX + R - 60, CY] }); let mx = 0, mn = 1e9; const T0 = Date.now();
    while (Date.now() - T0 < ms) { const d = (await A.G(() => window.__game.debug.domeMobs()))[0]?.d || 0; if (d && Date.now() - T0 > 800) { mx = Math.max(mx, d); mn = Math.min(mn, d); } /* первые 0.8 с — моб ещё в точке постановки (до тика сервера) */ await sleep(200); }
    return { mx, mn, flashes: (await city(A)).dome.repel - rp0 }; };
  const m0 = await lure(); t(`моб↔купол по умолчанию: не заходит, выталкивается ≤ R+40 (R ${R}), вспышка купола`, m0.mn >= R && m0.mx <= R + 70 && m0.flashes >= 1, m0);
  await save(A, 'city', { groundLight: 1.6, blightSize: 1.8, fadeSec: 1.5, mobPushPx: 200, mobDomeFlash: false }); // правка вкладки — целиком (сервер заменяет патч) await sleep(1500);
  const m1 = await lure(); t('моб↔купол: mobPushPx 200 вживую (дальше R+120), вспышка выкл — купол не мигает', m1.mn >= R && m1.mx >= R + 120 && m1.flashes === 0, m1);
  t('моб↔купол: D1 city/main', /"mobPushPx":200/.test(row('city')) && /"mobDomeFlash":false/.test(row('city')), row('city'));
  await sleep(700); await save(A, 'city', { groundLight: 1.6, blightSize: 1.8, fadeSec: 1.5, mobPushPx: 9999 }); await sleep(1200); t('моб↔купол: 9999 px вне пределов — отказ, в D1 по-прежнему 200', /"mobPushPx":200/.test(row('city')), row('city'));
  await A.screenshot({ path: `${OUT}/06b-live-mob-pushed-200.png` }); await sleep(700);
  // 2) PK: значок (цвет) вживую + правило «полученный урон не сбрасывает»
  await save(A, 'pk', { tagBg: '#1d4ed8', cancelOnHit: false });
  const p1 = await until(A, (v) => v.pk?.tagBg === '#1d4ed8');
  t('PK: цвет значка применился вживую', p1.pk?.tagBg === '#1d4ed8', p1.pk);
  t('PK: D1 game_overrides pk/main', /"cancelOnHit":false/.test(row('pk')), row('pk'));
  await tp(A, 24624 + 1280 + 260, 3376); await A.G(() => window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true } })); await sleep(600);
  await dev(A, { pk: false, fastPk: { enter: 7, exit: 30 } }); await A.click('.ch-pk'); await sleep(1500);
  await dev(A, { domeHit: 1 }); await sleep(1200);
  const h1 = (await city(A)).hud; t('PK: при cancelOnHit=false удар НЕ сбросил отсчёт входа', h1.to === true || h1.pk === true, h1);
  await A.screenshot({ path: `${OUT}/07-live-pk-tag-blue-countdown-survives-hit.png` });
  await dev(A, { pk: false });
  // 3) День и ночь → огни: максимум ползунка, сила фонарей, точка огня фонаря (город пересобирает огни)
  await tp(A, 24624, 3300); await sleep(1500);
  const ev0 = (await live(A)).emV;
  await save(A, 'dn', { reduceMax: 40, 'lt.kLamp': 1.8, 'lt.flickFire': 0.4, emitters: '{"city:dm_lantern_pole":[6,30]}' });
  const n1 = await until(A, (v) => v.reduceMax === 40 && v.lt.kLamp === 1.8 && v.lt.flickFire === 0.4 && v.lantern?.[0] === 6 && v.emV > ev0 && v.cityEmV === v.emV, 20000);
  t('Огни: применилось вживую (ползунок ≤40 %, фонари ×1.8, мерцание огня 0.4, точка фонаря [6,30], город пересобрал огни)', n1.reduceMax === 40 && n1.lt.kLamp === 1.8 && n1.lantern?.[0] === 6 && n1.lantern?.[1] === 30 && n1.cityEmV === n1.emV && n1.cityLights > 0, n1);
  t('Огни: D1 game_overrides dn/main', /"reduceMax":40/.test(row('dn')) && /lantern_pole/.test(row('dn')), row('dn'));
  // сохранность: перезаход
  await A.reload(); await A.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800); await toArinar(A); await tp(A, 24624, 3300); await sleep(2500);
  const r1 = await until(A, (v) => v.gl === 1.6 && v.reduceMax === 40 && v.pk?.tagBg === '#1d4ed8', 30000);
  t('после перезахода: правки на месте (земля 1.6, ползунок 40, значок синий, фонарь [6,30])', r1.gl === 1.6 && r1.reduceMax === 40 && r1.pk?.tagBg === '#1d4ed8' && r1.lantern?.[0] === 6, r1);
  // сброс
  for (const k of ['city', 'pk', 'dn']) { await reset(A, k); await sleep(700); } // сервер: правки админки не чаще 300 мс
  const z1 = await until(A, (v) => v.gl === 1 && v.blightScale === 1 && v.fade === 0.6 && v.pk?.tagBg === '#7f1d1d' && v.reduceMax === 100 && v.lt.kLamp === 1 && !v.emitters && v.lantern?.[0] !== 6, 30000);
  t('«Вернуть исходное»: всё по умолчанию вживую', z1.gl === 1 && z1.blightScale === 1 && z1.fade === 0.6 && z1.pk?.tagBg === '#7f1d1d' && z1.reduceMax === 100 && z1.lt.kLamp === 1 && !z1.emitters && z1.lantern?.[0] !== 6, z1);
  await tp(A, 24624, 3300); const m2 = await lure(); t('«Вернуть исходное»: моб снова ≤ R+40 со вспышкой', m2.mn >= R && m2.mx <= R + 70 && m2.flashes >= 1, m2);
  t('D1: правок city/pk/dn не осталось', !d1(`SELECT 1 FROM game_overrides WHERE kind IN ('city','pk','dn')`).length);
  console.log('errors', A.errs.slice(0, 5)); t('без ошибок страницы', !A.errs.length, A.errs);
  console.log(`\n${ok} ok, ${bad} fail`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
