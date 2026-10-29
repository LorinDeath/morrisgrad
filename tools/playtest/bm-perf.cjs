// LOCAL: 📊 нагрузочный плейтест: много мобов + навыки без отката (снаряды, дожди, кольца) — FPS клиента и такт сервера.
// LABEL=before|after, MOBS=60, SEC=20, RATE=ms между залпами. Только 127.0.0.1 (guardLocal). Светлый день (pin 12:00) — только в клиенте.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/perf';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5414/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8414';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-ice/wr';
const VIDEO = process.env.VIDEO || '', SEG = process.env.SEG || 'all', ON = (s) => SEG === 'all' || SEG.split(',').includes(s);
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-ice/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const ADMIN = 'qa_perf_' + Date.now().toString(36);
const walk = (o, out) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { for (const x of o) walk(x, out); return; } if (typeof o.k === 'string' || typeof o.t === 'string') out.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, out); };
const ICE_RES = { bp_ice_handle: 40, bp_ice_blade: 60, bp_ice_blade2: 30, bp_ice_blade3: 30, bp_ice_crystal: 40 };
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; const fr = []; const ev = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_bmm|admin_bmf|bm_forge|admin_result|"dev_mob"/.test(s)) fr.push(s.slice(0, 2500));
    if (/"pi"|"pf"|ice_bolt|"z":1|"z":true/.test(s)) { try { const o = JSON.parse(s), out = []; walk(o, out); const at = Date.now(); for (const e of out) if (e.pi || e.pf || e.t === 'ice_bolt' || e.z) ev.push({ ...e, at }); } catch {} } }));
  if (process.env.DBG) p.on('websocket', (ws) => { ws.on('framereceived', (f) => { const s = String(f.payload); for (const m of s.match(/\{[^{}]*"(aline|ability_move)"[^{}]*\}/g) || []) console.log('DBG<', m.slice(0, 200)); }); ws.on('framesent', (f) => { const s = String(f.payload); if (/ability|cast/.test(s)) console.log('DBG>', s.slice(0, 200)); }); });
  const G = (f, a) => p.evaluate(f, a);
  const T0 = Date.now(), marks = []; const mark = (n) => marks.push([n, (Date.now() - T0) / 1000]);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(250); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); mark(n); };
  const waitFr = async (re, ms = 6000) => { for (let i = 0; i < ms / 150; i++) { const x = fr.find((y) => re.test(y)); if (x) return x; await sleep(150); } return null; };
  const S = () => G(() => window.__game.debug.metaSt());
  const me = () => G(() => window.__game.debug.me());
  const spawn = async (type, dx, dy, calm = false) => { fr.length = 0; await G((m) => window.__game.debug.rawSend({ type: 'dev_grant', spawnMob: m }), { type, dx, dy, calm }); const x = await waitFr(/"dev_mob"/, 4000); let r = null; try { r = JSON.parse(x.slice(0, x.lastIndexOf('}') + 1)); } catch {} return r; };
  const kill = async (ty) => { for (let i = 0; i < 6; i++) { await G((ty) => window.__game.debug.rawSend({ type: 'dev_grant', killNearAny: true, killType: ty }), ty); await sleep(120); } };
  const clearNear = async () => { const ms = await G(() => window.__game.debug.zoneMobsFull().map((m) => m.type)); for (const ty of [...new Set(ms)]) await kill(ty); };
  const aimAt = async (wx, wy) => { const q = await G(([x, y]) => window.__game.debug.w2s(x, y), [wx, wy]); if (q) await p.mouse.move(q.x, q.y); return q; };
  const strike = async (wx, wy, holdMs = 300) => { await aimAt(wx, wy); await p.mouse.down(); const t0 = Date.now(); while (Date.now() - t0 < holdMs) { await sleep(80); } await p.mouse.up(); };
  const blacks = () => G(() => { const m0 = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((m) => window.__game.debug.mobDef(m.type)?.black).map((m) => ({ id: m.id, type: m.type, hp: m.hp, x: Math.round(m.x), y: Math.round(m.y), d: Math.hypot(m.x - m0.x, m.y - m0.y) })).sort((a, b) => a.d - b.d); });
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400);
  const dn = await G(() => { try { return window.__game.dn?.({ pin: '12:00' }) || null; } catch (e) { return String(e); } }); console.log('day', JSON.stringify(dn)?.slice(0, 80));
  await G(() => { clearInterval(window.__icePin); window.__icePin = setInterval(() => { try { window.__game.dn?.({ pin: '12:00' }); } catch {} }, 1500); }); // сервер может сбросить pin — держим светлый день
  await G(() => window.__game.debug.send({ type: 'dev_grant', xp: 5000000 })); await sleep(900);
  // в Аринар
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  const toZnahar = async () => { let z = null; for (let i = 0; i < 20 && !z; i++) { z = await G(() => window.__game.debug.npcByName('Знахарь')); if (!z) await sleep(700); }
    const q = await G((id) => window.__game.debug.npcAt(id), z.id); await G(([x, y]) => window.__game.debug.tp(x, y + 30, true), [q.x, q.y]); await sleep(1300); return z; };
  const iceArt = async (name) => { // ледяные детали из ледяных кусочков → артефакт (сообщения сервера, как кнопки кузни)
    for (const id of ['ice_handle', 'ice_blade', 'ice_blade2', 'ice_blade3', 'ice_crystal']) { await G((id) => window.__game.debug.send({ type: 'bm_forge_craft', part: id }), id); await sleep(350); }
    fr.length = 0; await G((n) => window.__game.debug.send({ type: 'bm_forge_build', handle: 'ice_handle', blade: 'ice_blade', blade2: 'ice_blade2', blade3: 'ice_blade3', crystal: 'ice_crystal', name: n }), name); await sleep(1800);
    const bf = fr.find((x) => x.includes('"built"')); let bid = null; try { bid = JSON.parse(bf).built; } catch {}
    const s = await S(); return s.account.inv.find((i) => i.id === bid) || null; };

  const field = async () => { let P0 = null; for (const [x, y] of [[31000, 31000], [17000, 31000], [30500, 24150], [17500, 24150], [24000, 31000], [17000, 17000]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(2200); const n = await G(() => { const m = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((q) => Math.hypot(q.x - m.x, q.y - m.y) < 700).length; }); if (n <= 1) { const pr = await spawn('golem', 0, 420, true); await kill('golem'); if (pr && !pr.safe) { P0 = [x, y]; break; } } }
    if (!P0) { P0 = [30500, 24150]; await G(([x, y]) => window.__game.debug.tp(x, y, true), P0); await sleep(1500); } await clearNear(); await sleep(600); return P0; };
  const raw = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); mark(n); };

  const LABEL = process.env.LABEL || 'run', MOBS = +(process.env.MOBS || 60), SEC = +(process.env.SEC || 20), RATE = +(process.env.RATE || 200);
  const s0 = await S(); const had = new Set(s0.account.inv.map((i) => i.uid)); await G(() => window.__game.debug.send({ type: 'bm_test_artifact', ranged: false })); await sleep(1600);
  const A = (await S()).account.inv.find((i) => !had.has(i.uid) && /bm|art/i.test(i.id)) || null; t('артефакт', !!A);
  let ids = []; for (let k = 0; k < 4 && ids.length !== 5; k++) { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), A.uid); await sleep(1500 + 700 * k); ids = (await S()).hero.artAbilities || []; }
  const cast = [ids[2], ids[3], ids[1]].filter(Boolean); await G((ids) => window.__game.debug.send({ type: 'loadout_set', ids }), cast); await sleep(900);
  const P0 = await field(); console.log('field', P0, cast);
  const ring = []; for (let i = 0; i < MOBS; i++) { const a = (i / MOBS) * Math.PI * 2, r = 260 + (i % 4) * 90; ring.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]); }
  for (const [dx, dy] of ring) { await G((m) => window.__game.debug.rawSend({ type: 'dev_grant', spawnMob: m }), { type: ['golem', 'wolf', 'skeleton'][Math.abs(dx + dy) % 3], dx, dy, calm: true }); await sleep(60); }
  await sleep(1500);
  const perf = async (ms) => { fr.length = 0; await G((ms) => window.__game.debug.rawSend({ type: 'dev_grant', perfStats: ms }), ms); for (let i = 0; i < 40; i++) { const x = fr.find((y) => y.includes('"dev_perf"')); if (x) return JSON.parse(x); await sleep(100); } return null; };
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"dev_perf"')) fr.push(s.slice(0, 2500)); }));
  const fpsStart = () => G(() => { const F = (window.__fps = { d: [], last: performance.now(), on: true, live: 0, fx: 0 }); const loop = (t) => { if (!F.on) return; F.d.push(t - F.last); F.last = t; try { const q = window.__game.debug.projs(); F.live = Math.max(F.live, q.live); F.fx = Math.max(F.fx, q.fx); } catch {} requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const fpsStop = () => G(() => { const F = window.__fps; F.on = false; const d = F.d.slice(5).sort((a, b) => a - b), n = d.length, sum = d.reduce((a, b) => a + b, 0);
    const q = (p) => d[Math.min(n - 1, Math.floor(p * n))]; return { frames: n, fps: +(1000 * n / sum).toFixed(1), p50ms: +q(0.5).toFixed(1), p95ms: +q(0.95).toFixed(1), p99ms: +q(0.99).toFixed(1), maxMs: +d[n - 1].toFixed(1), long50: d.filter((x) => x > 50).length, low1fps: +(1000 / q(0.99)).toFixed(1), paxLiveMax: F.live, paxFxMax: F.fx }; });
  const res = { label: LABEL, mobs: MOBS, sec: SEC, rate: RATE, cast };
  // фон: только мобы
  await fpsStart(); await sleep(8000); res.idle = { client: await fpsStop(), server: await perf(8000) };
  // нагрузка: залпы навыков без отката по кругу + удары
  const mobsNow = (await G(() => window.__game.debug.zoneMobsFull().length)); res.mobsSeen = mobsNow;
  await fpsStart(); const tS = Date.now(); let n = 0, maxProj = 0;
  while (Date.now() - tS < SEC * 1000) { const a = (n * 0.7) % (Math.PI * 2), id = cast[n % cast.length]; const m = await me();
    await G(([id, dx, dy, x, y]) => window.__game.debug.rawSend({ type: 'dev_grant', stressCast: { id, dx, dy, ox: x, oy: y, tx: Math.round(x + dx * 400), ty: Math.round(y + dy * 400), cid: Math.floor(Math.random() * 1e6) } }), [id, +Math.cos(a).toFixed(3), +Math.sin(a).toFixed(3), Math.round(m.x), Math.round(m.y)]);
    n++; if (n % 25 === 0) { const q = await perf(1000); if (q) maxProj = Math.max(maxProj, q.projs); } await sleep(RATE); }
  res.stress = { casts: n, client: await fpsStop(), server: await perf(SEC * 1000), maxServerProjs: maxProj };
  await raw(`perf-${LABEL}`);
  console.log('PERF', JSON.stringify(res));
  fs.writeFileSync(`${OUT}/perf-${LABEL}.json`, JSON.stringify(res, null, 1));
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
