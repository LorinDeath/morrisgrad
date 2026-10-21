// LOCAL: производительность и устойчивость города (кадр днём/ночью, утечки при правках админки, переподключение у купола, PK-отсчёт при
// телепорте/переподключении, несколько игроков). Только 127.0.0.1. Раньше было: аудит админки города — по одной правке во вкладках «Город», «PK-режим», «День и ночь» (огни): сохранение →
// применилось у клиента ВЖИВУЮ (без перезахода) → лежит в D1 (локальная) и переживает перезаход → «Вернуть исходное» → по умолчанию.
// Скриншоты вкладок (новые поля). Только 127.0.0.1; D1 — локальный persist этого стенда (mc-harness-city/wr).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const { execSync } = require('node:child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/polish/perf';
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
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--js-flags=--expose-gc', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, small) => {
    const ctx = await b.newContext({ viewport: small ? { width: 480, height: 300 } : { width: 1280, height: 760 } }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e.stack || e).slice(0, 400)));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`), { timeout: 120000 });
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


  const perf = (p) => p.G(() => window.__game.debug.perf ? window.__game.debug.perf() : window.__game.perf?.());
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const sample = async (p, ms = 6000) => { const r = []; const T0 = Date.now(); while (Date.now() - T0 < ms) { r.push(await perf(p)); await sleep(500); }
    const o = {}; for (const k of ['fps', 'cpuMs', 'calls', 'tris', 'dnLights', 'dnMs', 'cityGlows', 'cityLights', 'geos', 'texs', 'progs']) o[k] = med(r.map((x) => x?.[k] ?? 0)); return o; };
  const mem = async (p) => { await p.G(() => window.gc?.()); await sleep(300); await p.G(() => window.gc?.()); const x = await perf(p); return { geos: x.geos, texs: x.texs, progs: x.progs, heap: x.heap }; };
  const A = await open('city_admin'); await toArinar(A);
  for (const k of left) { await reset(A, k); await sleep(700); }
  const PART = process.env.PART || 'perf,leak,edge,crowd', on = (k) => PART.split(',').includes(k);
  t('perf() доступен', Number.isFinite((await perf(A))?.calls), await perf(A));
  const R = {};
  if (on('perf')) for (const [name, x, y, pin] of [['plaza-day', 24624, 3480, '13:00'], ['plaza-night', 24624, 3480, '23:00'], ['garden-night', 23840, 2750, '23:00'], ['world-night', 26400, 3376, '23:00']]) {
    await A.G((m) => window.__game.debug.dn({ pin: m }), pin); await tp(A, x, y); await sleep(2500); R[name] = await sample(A); console.log('perf', name, JSON.stringify(R[name])); }
  if (on('perf')) { t('ночью в городе: огней под маской ≤ 384 (предел инстансов)', R['plaza-night'].dnLights <= 384, R['plaza-night']);
  t('маска ночи в городе ≤ 2 мс CPU', R['plaza-night'].dnMs <= 2, R['plaza-night']);
  fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(R, null, 1)); }
  // утечки: 8 правок админки (перебак земли, пятно, точки огня → пересборка карты города), сброс → геометрии/текстуры как были
  if (on('leak')) {
  await A.G(() => window.__game.debug.dn({ pin: '13:00' })); await tp(A, 24624, 3300); await sleep(2500);
  const LK = process.env.LEAK_KIND || 'city,dn';
  const round = async () => { for (let i = 0; i < 8; i++) { if (LK.includes('city')) { await save(A, 'city', { groundLight: i % 2 ? 1.2 : 1.4, blightSize: i % 2 ? 1.3 : 0.8 }); await sleep(700); }
    if (LK.includes('dn')) { await save(A, 'dn', { emitters: JSON.stringify({ 'city:dm_lantern_pole': [5 + (i % 2), 28] }) }); await sleep(1600); } else await sleep(1600); } };
  await round(); await sleep(2000); const m0 = await mem(A); console.log('mem0 (после разогрева: 8 правок)', JSON.stringify(m0));
  await round(); await sleep(2000); const m1 = await mem(A); console.log('mem1 (+8 правок)', JSON.stringify(m1));
  let m2; for (let r = 2; r <= (Number(process.env.LEAK_ROUNDS) || 2); r++) { await round(); await sleep(2000); m2 = await mem(A); console.log(`mem${r} (+8 правок)`, JSON.stringify(m2)); }
  t('админка вживую: геометрии/текстуры/куча не растут от правок (2 × 8 правок: ±8, куча ±6 МБ)', [m1, m2].every((m) => Math.abs(m.geos - m0.geos) <= 8 && Math.abs(m.texs - m0.texs) <= 8 && Math.abs(m.heap - m0.heap) <= 6), { m0, m1, m2 });
  t('админка вживую: шейдеры не множатся', m2.progs - m0.progs <= 2, { m0: m0.progs, m2: m2.progs });
  await A.screenshot({ path: `${OUT}/after-24-admin-edits.png` }); const cv = await city(A); t('после 24 пересборок город на месте (пропсы, огни)', cv.dome.props > 50, cv.dome);
  for (const k of ['city', 'dn']) { await reset(A, k); await sleep(800); } await sleep(3000);
  }
  const CX = 24624, CY = 3376, RR = (await city(A)).dome.r;
  if (on('edge')) {
  // переподключение у самого края купола (внутри) — остаётся внутри, без ошибок
  const rel = async (p) => { await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800); await toArinar(p); await sleep(2500); };
  const pos = async (p) => p.G(() => { const s = window.__game.state(); return { x: Math.round(s.player?.x), y: Math.round(s.player?.y), world: s.world }; });
  await tp(A, CX + RR - 6, CY); await sleep(2500); const e0 = await pos(A); await rel(A); const e1 = await pos(A);
  t('переподключение у края купола (внутри): на том же месте ±40 px, в Аринаре', e1.world === 'arinar' && Math.hypot(e1.x - e0.x, e1.y - e0.y) <= 40, { e0, e1 });
  await tp(A, CX + RR + 30, CY); await sleep(2500); const o0 = await pos(A); await rel(A); const o1 = await pos(A);
  t('переподключение у края купола (снаружи): снаружи, ±40 px', Math.hypot(o1.x - CX, o1.y - CY) > RR && Math.hypot(o1.x - o0.x, o1.y - o0.y) <= 40, { o0, o1 });
  // PK-режим: убийцу (PK) после переподключения внутри — за край
  await tp(A, CX + RR - 200, CY); await dev(A, { pk: true }); await sleep(2500); const k0 = await pos(A);
  t('PK внутри купола — выталкивается за край', Math.hypot(k0.x - CX, k0.y - CY) > RR, k0);
  await rel(A); const k1 = await pos(A); t('PK после переподключения — снаружи купола', Math.hypot(k1.x - CX, k1.y - CY) > RR, k1);
  // PK-отсчёт входа (7 с) переживает телепорт и переподключение
  await dev(A, { pk: false, fastPk: { enter: 7, exit: 30 } }); await tp(A, CX + RR + 300, CY); await sleep(1200);
  await A.click('.ch-pk'); await sleep(1500); const h0 = (await city(A)).hud; t('PK: отсчёт входа начался', h0.to === true, h0);
  await tp(A, CX + RR + 900, CY + 300); await sleep(1500); const h1 = (await city(A)).hud; t('PK: телепорт не сбросил отсчёт', h1.to === true || h1.pk === true, h1);
  await rel(A); const h2 = (await city(A)).hud; t('PK: после переподключения отсчёт идёт/завершился (не потерян)', h2.to === true || h2.pk === true, h2);
  await sleep(6000); const h3 = (await city(A)).hud; t('PK: отсчёт завершился — PK включён', h3.pk === true, h3);
  await dev(A, { pk: false });
  }
  if (on('crowd')) {
  // несколько игроков в городе: метки PK/кадр у A
  const B = []; for (let i = 0; i < 3; i++) { const p = await open('city_bot' + i, true); await toArinar(p); await tp(p, CX + 60 * i - 90, 3460); B.push(p); }
  await tp(A, CX, 3440); await A.G(() => window.__game.debug.dn({ pin: '23:00' })); await sleep(3000);
  R.crowd = await sample(A); console.log('perf crowd (A + 3)', JSON.stringify(R.crowd)); fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(R, null, 1));
  await A.screenshot({ path: `${OUT}/crowd-night.png` });
  t('несколько игроков: без ошибок страниц', [A, ...B].every((p) => !p.errs.length), [A, ...B].map((p) => p.errs.slice(0, 2)));
  }
  for (const k of ['city', 'pk', 'dn']) { await reset(A, k); await sleep(700); }
  console.log(`\n${ok} ok, ${bad} fail`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
