// LOCAL: чёрные мобы смотрят по ходу/на цель — снимки 4 направлений (огонь/лёд/смешанный), лагерь бродит (CAMP=1).
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
const ADMIN = 'qa_face_' + Date.now().toString(36);
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
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  const PRE = process.env.PRE || 'face-before', DBG = !!process.env.DBG;
  // смешанный моб: тело ледяное, оружие огненное (публикация через admin_bmm, как в конструкторе)
  await p.waitForFunction(() => { try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return document.querySelectorAll('.mc-admin [data-tab]').length > 0; }, null, { timeout: 30000 }).catch(() => {});
  fr.length = 0;
  await G(() => window.__game.debug.send({ type: 'admin_bmm', op: 'publish', id: 'bmx_qa_mixed', data: { name: 'Смешанный (тест)', cls: 'warrior', lvl: 9, hp: 400, dmg: 6, armor: 4, speed: 80, aggro: 400, xp: 10, radius: 16, scale: 1,
    elem: '', body: { tail: 'ib_tail_1', armL: 'fb_armL_1', legL: 'ib_legL_1', torso: 'ib_torso_1', legR: 'fb_legR_1', head: 'fb_head_1', armR: 'ib_armR_1' }, weapon: { handle: 'fire_handle', blade: 'fire_blade' }, drops: [] } }));
  const pub = await waitFr(/"op":"publish"/, 8000); t('смешанный моб опубликован', !!pub && pub.includes('"ok":true'), pub?.slice(0, 160));
  await G(() => { try { window.__game.debug.closeAdmin(); } catch {} }); await sleep(600);
  // поле
  await G(() => window.__game.debug.tp(30500, 24150, true)); await sleep(2500); await clearNear(); await sleep(500);
  const DIRS = { left: [180, 0], right: [-180, 0], up: [0, 160], down: [0, -160] }; // моб идёт к герою: справа → идёт влево
  const res = {};
  for (const type of (process.env.TYPES ? process.env.TYPES.split(',') : ['bmx_ash_warden', 'bmx_frost_warden', 'bmx_qa_mixed'])) {
    for (const [dir, [dx, dy]] of Object.entries(DIRS).filter(([d]) => !process.env.ONLYDIR || process.env.ONLYDIR.split(',').includes(d))) {
      const M0 = await me(); await clearNear(); await sleep(300);
      const sp = await spawn(type, dx, dy, false); if (DBG) console.log('SP', JSON.stringify(sp), JSON.stringify(await G(() => window.__game.debug.zoneMobsFull().slice(0, 5))), JSON.stringify(await me())); if (!sp) { t(`спавн ${type}`, false); continue; }
      let q = null; for (let i = 0; i < 14; i++) { await sleep(120); q = await G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id), sp.id); if (DBG) console.log('POLL', dir, i, JSON.stringify({ x: q?.x, flip: q?.flip, a: q?.bmA, f: q?.f })); if (q && q.bmA === 'walk') break; }
      await sleep(250); q = await G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id), sp.id);
      await shot(`${PRE}-${type.replace('bmx_', '')}-walk-${dir}`);
      res[`${type}:${dir}`] = { flip: q?.flip, a: q?.bmA };
      // удар: ждём, пока подойдёт
      for (let i = 0; i < 25; i++) { await sleep(150); q = await G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id), sp.id); if (q?.bmA === 'atk') break; }
      if (dir === 'left' || dir === 'right') { await sleep(120); await shot(`${PRE}-${type.replace('bmx_', '')}-atk-${dir}`); res[`${type}:${dir}:atk`] = { flip: q?.flip, a: q?.bmA }; }
      await G(([x, y]) => window.__game.debug.tp(x, y, true), [M0.x, M0.y]); await kill(type); await sleep(300);
    }
  }
  console.log('FACING', JSON.stringify(res));
  fs.writeFileSync(`${OUT}/${PRE}-facing.json`, JSON.stringify(res, null, 1));
  // лагерь бродит и поворачивается (видео)
  if (process.env.CAMP) {
    const M = await me(); await clearNear();
    for (const [type, dx, dy] of [['bmx_ash_warden', 160, -40], ['bmx_frost_warden', -160, 40], ['bmx_qa_mixed', 40, 170], ['bmx_rime_archer', -60, -180]]) await spawn(type, dx, dy, false);
    mark('camp-start');
    const path = [[220, 0], [220, 200], [-220, 200], [-220, -200], [220, -200], [0, 0]];
    for (const [ox, oy] of path) { for (let k = 0; k < 6; k++) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [M.x + ox * (k + 1) / 6, M.y + oy * (k + 1) / 6]); await sleep(330); } await sleep(700); }
    await shot(`${PRE}-camp-turning`); mark('camp-end');
  }
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks-${PRE}.json`, JSON.stringify(marks));
  await ctx.close(); await b.close();
  console.log(`DONE ok=${ok} bad=${bad}`);
})().catch((e) => { console.error(e); process.exit(1); });
