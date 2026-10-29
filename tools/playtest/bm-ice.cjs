// LOCAL: этап ICE — ледяные чёрные мобы/лагерь, кузня только из ледяных кусочков, чистый урон (цифры), админка: фильтр стихий + превью.
// SEG=camp|forge|pure|admin|all. Только 127.0.0.1 (guardLocal). Светлый день (pin 12:00) — только в клиенте.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-ice';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5414/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8414';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-ice/wr';
const VIDEO = process.env.VIDEO || '', SEG = process.env.SEG || 'all', ON = (s) => SEG === 'all' || SEG.split(',').includes(s);
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-ice/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const ADMIN = 'qa_ice_' + Date.now().toString(36);
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
  let ART = null;
  // ================= FORGE =================
  if (ON('forge')) {
    const z = await toZnahar();
    // лёд нельзя без ледяных кусочков (огненные есть — не помогают)
    await G(() => window.__game.debug.send({ type: 'dev_grant', res: { bp_fire_blade: 30 } })); await sleep(700);
    fr.length = 0; await G(() => window.__game.debug.send({ type: 'bm_forge_craft', part: 'ice_blade' })); await sleep(1100);
    const s0 = await S(); const er = fr.find((x) => /toast_error|"err"|Не хватает/.test(x));
    t('ледяная деталь без ледяных кусочков — отказ сервера', !(s0.bma?.parts?.ice_blade > 0) && /Не хватает/.test(er || ''), er?.slice(0, 200));
    await G((r) => window.__game.debug.send({ type: 'dev_grant', res: r }), ICE_RES); await sleep(900);
    await G((id) => window.__game.debug.rawSend({ type: 'npc_talk', npc: id }), z.id); await sleep(1500);
    await G(() => ([...document.querySelectorAll('button')].find((b) => b.textContent.includes('Кузня Знахаря')))?.click()); await sleep(1500);
    if (!(await G(() => window.__game.forgeWin?.isOpen))) await G(() => window.__game.forgeWin.open()); await sleep(1200);
    await shot('f01-forge-all-elements');
    await G(() => document.querySelector('[data-f="elf"][data-v="ice"]')?.click()); await sleep(900);
    const fl = await G(() => ({ n: document.querySelectorAll('.bmf-part').length, ice: [...document.querySelectorAll('.bmf-part')].filter((e) => /ice_/.test(e.dataset.part)).length, can: document.querySelectorAll('.bmf-part.can').length }));
    t('кузня: фильтр «лёд» — только ледяные детали, можно ковать', fl.n > 0 && fl.ice === fl.n && fl.can > 0, fl);
    await shot('f02-forge-ice-filter');
    for (const id of ['ice_handle', 'ice_blade', 'ice_blade2', 'ice_blade3', 'ice_crystal']) { await G((id) => { const e = document.querySelector(`.bmf-part[data-part="${id}"]`); e?.scrollIntoView({ block: 'center' }); e?.querySelector('[data-f="craft"]')?.click(); }, id); await sleep(VIDEO ? 700 : 400); }
    await sleep(800); let s = await S();
    t('ледяные детали скованы из bp_ice_*', ['ice_handle', 'ice_blade', 'ice_crystal'].every((id) => (s.bma?.parts?.[id] || 0) >= 1) && s.account.res.bp_ice_blade < ICE_RES.bp_ice_blade, { parts: s.bma?.parts, res: s.account.res });
    await shot('f03-forge-ice-crafted');
    await G(() => document.querySelector('[data-f="tab"][data-v="asm"]').click()); await sleep(600);
    for (const [k, id] of Object.entries({ handle: 'ice_handle', blade: 'ice_blade', blade2: 'ice_blade2', blade3: 'ice_blade3', crystal: 'ice_crystal' })) { await G(([k, id]) => { const s = document.querySelector(`select[data-slot="${k}"]`); if (s) { s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); } }, [k, id]); await sleep(VIDEO ? 600 : 300); }
    await sleep(1500);
    const asm = await G(() => ({ txt: document.querySelector('.bmf-stats')?.innerText || '', og: [...document.querySelectorAll('select[data-slot="blade"] optgroup')].map((o) => o.label) }));
    t('сборка: стихия «лёд», чистый ледяной урон, optgroup по стихиям', /Лёд|лёд/.test(asm.txt) && /ледяной/i.test(asm.txt) && asm.og.length >= 1, asm);
    await shot('f04-forge-ice-assembly'); await sleep(900); await shot('f04b-forge-ice-assembly-swing');
    await p.fill('.bmf-name', ''); await p.type('.bmf-name', 'Клык метели', { delay: VIDEO ? 45 : 0 }); await sleep(200);
    fr.length = 0; await G(() => document.querySelector('[data-f="build"]').click()); await sleep(2500);
    const bf = fr.find((x) => x.includes('"built"')); let bid = null; try { bid = JSON.parse(bf).built; } catch {}
    s = await S(); ART = s.account.inv.find((i) => i.id === bid);
    t('выкован ледяной артефакт', !!ART, { fr: fr.filter((x) => !x.includes('"st"')).slice(0, 2).map((x) => x.slice(0, 200)) });
    await shot('f05-forge-ice-built');
    await G(() => document.querySelector('[data-f="tab"][data-v="salv"]')?.click()); await sleep(700); await shot('f06-forge-salvage-elements');
    await G(() => window.__game.forgeWin.close()); await sleep(500);
  }
  if (!ART && (ON('camp') || ON('pure'))) { await G((r) => window.__game.debug.send({ type: 'dev_grant', res: r }), ICE_RES); await sleep(900); await toZnahar(); ART = await iceArt('Клык метели'); }
  if (ART && (ON('camp') || ON('pure'))) { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), ART.uid); await sleep(1300); }
  // поле: пустошь вне города
  const field = async () => { let P0 = null; for (const [x, y] of [[31000, 31000], [17000, 31000], [30500, 24150], [17500, 24150], [24000, 31000], [17000, 17000]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(2200); const n = await G(() => { const m = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((q) => Math.hypot(q.x - m.x, q.y - m.y) < 700).length; }); if (n <= 1) { const pr = await spawn('golem', 0, 420, true); await kill('golem'); if (pr && !pr.safe) { P0 = [x, y]; break; } } }
    if (!P0) { P0 = [30500, 24150]; await G(([x, y]) => window.__game.debug.tp(x, y, true), P0); await sleep(1500); } await clearNear(); await sleep(600); return P0; };
  // ================= PURE =================
  if (ON('pure')) {
    const P0 = await field(); console.log('field', P0);
    const M = await me(); ev.length = 0;
    let tg = null, tg2 = null; for (let k = 0; k < 4 && !tg; k++) { tg = await spawn('bmx_ash_warden', 110, 0, true); if (!tg) { console.log('spawn retry', k); await sleep(1200); } } for (let k = 0; k < 3 && !tg2; k++) tg2 = await spawn('golem', 120, 90, true);
    await sleep(800); await shot('p01-pure-targets');
    for (let i = 0; i < 14; i++) { const q = await G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id), i % 2 ? tg2?.id : tg?.id) || (await G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id), tg?.id)); if (!q) break; await strike(q.x, q.y, 250); await sleep(VIDEO ? 650 : 450); if (i === 3 || i === 8) await shot(`p0${i === 3 ? 2 : 3}-pure-ice-numbers`); }
    const pi = ev.filter((e) => e.pi > 0);
    t('чистый ледяной урон в событиях удара (pi > 0)', pi.length > 0, pi.slice(0, 3));
    await shot('p04-pure-ice-numbers-end');
    await kill('bmx_ash_warden'); await kill('golem');
  }
  // ================= CAMP =================
  if (ON('camp')) {
    if (!ON('pure')) await field();
    const M = await me();
    await p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
    fr.length = 0;
    await G(([x, y]) => window.__game.debug.send({ type: 'admin_bmm', op: 'save', kind: 'bmcamp', id: '', data: { name: 'Ледяной лагерь (тест)', world: 'arinar', x: Math.round(x + 330), y: Math.round(y), r: 120, mobs: [{ mob: 'bmx_frost_warden', n: 2 }, { mob: 'bmx_rime_archer', n: 2 }], chief: 'bmx_yeti_brute', respawnMin: 20, respawnMax: 25 } }), [M.x, M.y]);
    const sv = await waitFr(/"op":"save"/, 8000); t('ледяной лагерь сохранён (admin_bmm)', !!sv && sv.includes('"ok":true'), sv?.slice(0, 200));
    await G(() => window.__game.debug.closeAdmin()); await sleep(600);
    let bm = []; for (let i = 0; i < 25; i++) { bm = await blacks(); if (bm.length >= 4) break; await sleep(700); }
    t('ледяные чёрные мобы лагеря в мире', bm.length >= 4 && bm.every((m) => /^bmx_(frost|rime|yeti|glacier)/.test(m.type)), bm.slice(0, 5));
    await shot('c01-ice-camp'); ev.length = 0;
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 16000) { const bl = await blacks(); if (!bl.length) break; const q = bl[0]; if (q.d > 140) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [q.x - 90, q.y]); await sleep(250); } await strike(q.x, q.y, 250); await sleep(380); n++; if (n === 4 || n === 12) await shot(`c0${n === 4 ? 2 : 3}-ice-camp-fight`); }
    const ib = ev.filter((e) => e.t === 'ice_bolt'), pi = ev.filter((e) => e.pi > 0);
    t('ледяные стрелки стреляют ice_bolt', ib.length > 0, ib.slice(0, 2)); t('чистый лёд по мобам лагеря', pi.length > 0, pi.length);
    await shot('c04-ice-camp-after');
  }
  // ================= ADMIN =================
  if (ON('admin')) {
    await p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
    await p.waitForFunction(() => { if (document.querySelectorAll('.bmfa .pl [data-p]').length >= 5) return true; document.querySelector('.mc-admin [data-tab="bmforge"]')?.click(); return false; }, null, { timeout: 20000, polling: 1500 }).catch(() => {}); await sleep(500);
    await shot('a01-admin-parts-all');
    await G(() => document.querySelector('.bmfa [data-ef="ice"]')?.click()); await sleep(900);
    const fi = await G(() => ({ n: document.querySelectorAll('.bmfa .pl [data-p]').length, ice: [...document.querySelectorAll('.bmfa .pl [data-p]')].filter((e) => /^ice_|^bpx_/.test(e.dataset.p)).length }));
    t('админка оружия: фильтр «лёд»', fi.n > 0 && fi.ice === fi.n, fi);
    const ids = await G(() => [...document.querySelectorAll('.bmfa .pl [data-p]')].slice(0, 5).map((e) => e.dataset.p));
    for (const id of ids) { const r = await G((id) => { const e = document.querySelector(`.bmfa .pl [data-p="${id}"]`); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, id); await p.mouse.move(r.x, r.y); await sleep(VIDEO ? 900 : 500); }
    const hov = await G(() => { const c = document.querySelector('.bmfa-hov'); return !!c && c.style.display !== 'none'; });
    t('наведение — всплывающее живое превью детали', hov); await shot('a02-admin-ice-filter-hover');
    await G((id) => document.querySelector(`.bmfa .pl [data-p="${id}"]`)?.click(), ids[1] || ids[0]); await sleep(1200);
    await G(() => document.querySelector('.bmfa [data-pva="attack"]')?.click()); await sleep(900); await shot('a03-admin-part-preview-attack');
    await G(() => document.querySelector('.bmfa [data-pva="idle"]')?.click()); await sleep(700);
    await G(() => document.querySelector('.bmfa [data-bs="arts"]')?.click()); await sleep(900);
    await G(() => document.querySelector('.bmfa [data-aef="ice"]')?.click()); await sleep(700); await shot('a04-admin-artifacts-ice');
    // мобы
    await p.waitForFunction(() => { if (document.querySelectorAll('.bmma .pl [data-m]').length >= 3) return true; document.querySelector('.mc-admin [data-tab="bmmobs"]')?.click(); return false; }, null, { timeout: 25000, polling: 1500 }).catch(() => {}); await sleep(400);
    await G(() => document.querySelector('.bmma [data-ef="mef:ice"]')?.click()); await sleep(800);
    const ml = await G(() => [...document.querySelectorAll('.bmma .pl [data-m]')].map((e) => e.dataset.elem));
    t('админка мобов: фильтр «лёд»', ml.length >= 4 && ml.every((x) => x === 'ice'), ml);
    await G(() => document.querySelector('.bmma .pl [data-m="bmx_glacier_seer"]')?.click()); await sleep(1800);
    const og = await G(() => [...document.querySelectorAll('.bmma select[data-k="body.torso"] optgroup')].map((o) => o.label));
    t('пикер тела сгруппирован по стихиям', og.length >= 2, og);
    await shot('a05-admin-mob-ice'); await G(() => document.querySelector('.bmma canvas')?.click()); await sleep(800); await shot('a06-admin-mob-ice-attack');
    await G(() => document.querySelector('.bmma [data-bs="body"]')?.click()); await sleep(900);
    await G(() => document.querySelector('.bmma [data-ef="bef:ice"]')?.click()); await sleep(800);
    const rows = await G(() => [...document.querySelectorAll('.bmma tr[data-bh]')].slice(0, 5).map((e) => e.dataset.bh));
    for (const id of rows) { const r = await G((id) => { const e = document.querySelector(`.bmma tr[data-bh="${id}"]`); const b = e.getBoundingClientRect(); return { x: b.x + 60, y: b.y + b.height / 2 }; }, id); await p.mouse.move(r.x, r.y); await sleep(VIDEO ? 800 : 450); }
    const bh = await G(() => { const c = document.querySelector('.bmma-hov'); return !!c && c.style.display !== 'none'; });
    t('части тела: фильтр «лёд» + превью по наведению', rows.length > 0 && bh, rows); await shot('a07-admin-body-ice-hover');
    await G((id) => document.querySelector(`.bmma [data-bpv="${id}"]`)?.click(), rows[0]); await sleep(700); await shot('a08-admin-body-attack');
    await p.mouse.move(5, 5); await G(() => document.querySelector('.bmma [data-bs="camps"]')?.click()); await sleep(1000);
    await shot('a09-admin-camps-elements');
    await G(() => document.querySelector('.bmma [data-ef="cef:ice"]')?.click()); await sleep(800); await shot('a10-admin-camps-ice');
  }
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks-${SEG}.json`, JSON.stringify(marks));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
