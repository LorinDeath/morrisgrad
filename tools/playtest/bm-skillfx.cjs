// LOCAL: анимации навыков артефактов листами Художника: огонь и лёд, по 5 навыков (хлыст, кольцо, снаряд, дождь, рывок).
// ELEMS=fire,ice. Только 127.0.0.1 (guardLocal). Светлый день (pin 12:00) — только в клиенте.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-skillfx';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5414/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8414';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-ice/wr';
const VIDEO = process.env.VIDEO || '', SEG = process.env.SEG || 'all', ON = (s) => SEG === 'all' || SEG.split(',').includes(s);
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-ice/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const ADMIN = 'qa_skf_' + Date.now().toString(36);
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
  const ELEMS = (process.env.ELEMS || 'fire,ice').split(',');
  const arts = {};
  // огненный — тестовый артефакт; ледяной — из ледяных кусочков в кузне Знахаря
  if (ELEMS.includes('fire')) { const s0 = await S(); const had = new Set(s0.account.inv.map((i) => i.uid)); await G(() => window.__game.debug.send({ type: 'bm_test_artifact', ranged: false })); await sleep(1600);
    arts.fire = (await S()).account.inv.find((i) => !had.has(i.uid) && /bm|art/i.test(i.id)) || null; }
  if (ELEMS.includes('ice')) { await G((r) => window.__game.debug.send({ type: 'dev_grant', res: r }), ICE_RES); await sleep(900); await toZnahar(); arts.ice = await iceArt('Иней QA'); }
  t('артефакты огня и льда', ELEMS.every((e) => arts[e]), Object.fromEntries(Object.entries(arts).map(([k, v]) => [k, v?.id])));
  const P0 = await field(); console.log('field', P0);
  const SH = { whip: [90, 160, 260], ring: [120, 260, 420], bolt: [200, 420, 750], rain: [300, 700, 1100, 1500], dash: [80, 200, 380] };
  const SLOT = ['whip', 'ring', 'bolt', 'rain', 'dash'];
  for (const el of ELEMS) { const A = arts[el]; if (!A) continue;
    let ids = [];
    for (let k = 0; k < 4 && ids.length !== 5; k++) { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), A.uid); await sleep(1500 + 700 * k); ids = (await S()).hero.artAbilities || []; } t(`${el}: 5 навыков артефакта`, ids.length === 5, ids);
    const pre = await G(() => new Promise((r) => { const t0 = Date.now(); const f = () => { const l = window.__game.debug.skf().loaded; if ((l && Object.keys(l).length >= 10) || Date.now() - t0 > 15000) r(l); else setTimeout(f, 300); }; f(); }));
    t(`${el}: листы навыков подгружены заранее (preload)`, pre && Object.keys(pre).length >= 10, pre && Object.keys(pre).length);
    for (let g = 0; g < 5; g += 3) { const grp = ids.slice(g, g + 3);
      fr.length = 0; await G((ids) => window.__game.debug.send({ type: 'loadout_set', ids }), grp); await sleep(900);
      for (let j = 0; j < grp.length; j++) { const id = grp[j], slot = await G((id) => window.__game.debug.skfSlot(id), id);
        await clearNear(); const m0 = await me(); await G(([x, y]) => window.__game.debug.tp(x, y, true), [m0.x, m0.y]); await sleep(300);
        for (const [dx, dy] of [[150, -40], [190, 40], [240, 0]]) await spawn('golem', dx, dy, true);
        await sleep(700); const m = await me(); await aimAt(m.x + 260, m.y);
        const seen = new Set(); let poll = true; (async () => { while (poll) { const k = await G(() => window.__game.debug.skf()).catch(() => null); if (k) { k.k.forEach((x) => seen.add(x)); Object.keys(k.spawned || {}).forEach((x) => seen.add('proj:' + x)); } await sleep(40); } })();
        if (process.env.DBG) console.log('DBG me', JSON.stringify(await me()), id);
        await p.keyboard.press(['q', 'g', 'f'][j]); const t0 = Date.now();
        for (const [i, ms] of SH[slot].entries()) { while (Date.now() - t0 < ms) await sleep(10); await raw(`${el}-${g + j + 1}-${slot}-${i + 1}`); }
        poll = false; await sleep(60);
        const want = { whip: /_lash$/, ring: /_ring$/, bolt: new RegExp('_burst$'), boltP: 1, rain: /_drop$/, dash: /_trail$/ }[slot];
        t(`${el}: ${id} (${slot}) — лист Художника на экране`, [...seen].some((x) => want.test(x)) && (slot !== 'bolt' || seen.has('proj:p:' + id)), [...seen]);
        await sleep(900); }
    } }
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
