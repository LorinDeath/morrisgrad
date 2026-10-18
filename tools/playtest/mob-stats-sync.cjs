// LOCAL: ОЗ из админки = ОЗ живых мобов после перечитанного набора правок (как на проде: правки записаны в D1, версия поднята).
// Перед запуском в локальную базу кладётся набор правок «до ребаланса»; живые мобы появляются; затем — набор «после» (SQL + версия).
// Только 127.0.0.1 (guardLocal). MS_BASE=http://127.0.0.1:5313/game-panel.html MS_WS=ws://127.0.0.1:8913 MS_WR=/workspace/mc-harness-enchant/wr MS_TAG=before|after
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs'), cp = require('child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/mob-stats-sync';
const BASE = process.env.MS_BASE || 'http://127.0.0.1:5313/game-panel.html', WS = process.env.MS_WS || 'ws://127.0.0.1:8913', WR = process.env.MS_WR || '/workspace/mc-harness-enchant/wr';
const TAG = process.env.MS_TAG || 'after', SHIP_SQL = process.env.MS_SHIP_SQL || `${OUT}/local-ship.sql`;
const SRV = process.env.MS_SRV || `${__dirname}/../../server`;
const d1 = (args) => cp.execSync(`cd ${SRV} && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} ${args}`, { stdio: 'ignore' });
const ADMIN = 'ms_admin_' + Date.now().toString(36);
d1(`--command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'playtest', ${Date.now()})"`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const MOBS = [['puff_mushroom', 3], ['puff_mushroom', 0], ['glitch_knight', 0], ['dew_slime', 1], ['white_stag', 0]];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, vp) => {
    const ctx = await b.newContext({ viewport: vp }); const blocked = await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.blocked = blocked; p.tg = null; p.cat = null; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload);
      if (s.includes('"type":"zone_state"') && s.includes('"tg":{')) try { p.tg = JSON.parse(s).tg; } catch {}
      if (s.includes('"type":"admin_catalog"')) try { p.cat = JSON.parse(s); } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500); return p;
  };
  // 1) герой в Аринаре, рядом живые мобы, появившиеся при наборе «до ребаланса»
  const H = await open('ms_hero_' + Date.now().toString(36), { width: 1440, height: 860 });
  const G = (fn, a) => H.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'герой в Аринаре');
  const X = 30000 + Math.floor(Math.random() * 3000), Y = 8000 + Math.floor(Math.random() * 2000);
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X, Y]); await sleep(2000);
  const ids = [];
  for (let i = 0; i < MOBS.length; i++) {
    const [t, en] = MOBS[i]; const before = await G(() => window.__game.debug.zoneMobsFull().map((m) => m.id));
    await S({ type: 'dev_spawn_mob', mob: t, x: X - 200 + i * 100, y: Y + 90, special: '', cursed: false, ench: en, calm: true }); await sleep(900);
    const m = await G(([t, ids]) => window.__game.debug.zoneMobsFull().find((m) => m.type === t && !ids.includes(m.id)) || null, [t, before]); ids.push(m?.id || 0);
  }
  const read = async (id) => { await S({ type: 'zone_target', id }); H.tg = null; for (let i = 0; i < 30 && !(H.tg && H.tg.id === id); i++) await sleep(100); return H.tg && H.tg.id === id ? { ...H.tg } : null; };
  const pre = []; for (const id of ids) pre.push(await read(id));
  console.log('до:', pre.map((t) => t && `${t.type}${t.ench ? '✦' + t.ench : ''} ${t.maxHp}/${t.dmg}/${t.armor}`).join(' | '));
  // 2) набор правок «после» — как на проде: SQL в D1 + версия (без admin_save и без входа игроков)
  d1(`--file ${SHIP_SQL}`); const tShip = Date.now();
  await sleep(16000); // периодическая сверка версии — не чаще раза в 10 с
  const mid = []; for (const id of ids) mid.push(await read(id));
  console.log('через 16 с без входа игроков:', mid.map((t) => t && `${t.type} ${t.maxHp}/${t.dmg}/${t.armor}`).join(' | '));
  // 3) админ открывает панель (принудительная сверка) — значения бестиария
  const A = await open(ADMIN, { width: 1440, height: 860 });
  await A.evaluate(() => window.__game.debug.rawSend({ type: 'admin_open' })); for (let i = 0; i < 60 && !A.cat; i++) await sleep(200);
  await sleep(4000);
  const adm = (id) => (A.cat?.ent?.mob || []).find((e) => e.id === id)?.values || (A.cat?.ent?.mob || []).find((e) => e.id === id) || null;
  const post = []; for (const id of ids) post.push(await read(id));
  const rows = [];
  for (let i = 0; i < ids.length; i++) {
    const t = post[i], a = adm(MOBS[i][0]); if (!t || !a) { ok(false, `${MOBS[i][0]}: нет данных (цель ${!!t}, админка ${!!a})`); continue; }
    const av = a.values || a, en = MOBS[i][1];
    const mul = en ? { 1: [1.5, 1.2, 1.2], 3: [4, 4, 4] }[en] : [1, 1, 1]; // ярусы как на проде («Необычный» по коду, «Странный» ×4/×4/×4 — правка прода)
    rows.push({ mob: MOBS[i][0], ench: en, admin: { hp: av.hp, dmg: av.dmg, armor: av.armor }, before: pre[i] && { hp: pre[i].maxHp, dmg: pre[i].dmg, armor: pre[i].armor }, mid: mid[i] && { hp: mid[i].maxHp, dmg: mid[i].dmg, armor: mid[i].armor }, after: { hp: t.maxHp, dmg: t.dmg, armor: t.armor } });
    if (!en || en === 1) ok(Math.abs(t.maxHp - Math.round(av.hp * mul[0])) <= 1 && Math.abs(t.dmg - Math.round(av.dmg * mul[1] * 10) / 10) <= 0.11 && Math.abs(t.armor - Math.round(av.armor * mul[2] * 10) / 10) <= 0.11,
      `${TAG} ${MOBS[i][0]}${en ? ' ✦' + en : ''}: цель ${t.maxHp}/${t.dmg}/${t.armor} = админка ${av.hp}/${av.dmg}/${av.armor}${en ? ` × ярус` : ''}`);
    else ok(Math.abs(t.maxHp - Math.round(av.hp * 4)) <= 1, `${TAG} ${MOBS[i][0]} ✦${en}: цель ОЗ ${t.maxHp} = админка ${av.hp} × ярус ${t.maxHp / av.hp}`);
  }
  fs.writeFileSync(`${OUT}/${TAG}-result.json`, JSON.stringify(rows, null, 1));
  // 4) скриншоты: панель «Цель» у Пыхтящего гриба ✦Странный и он же в админке
  await read(ids[0]); await G((id) => window.__game.debug.selectMobId(id), ids[0]); await sleep(1500);
  await H.screenshot({ path: `${OUT}/${TAG}-target-puff_mushroom.png` });
  await A.evaluate(() => window.__game.debug.openAdmin()); await sleep(2500);
  try { await A.click('[data-tab="mob"]'); await sleep(600); await A.fill('aside input', 'Пыхт'); await sleep(800); await A.click('li[data-id="puff_mushroom"]'); await sleep(1200); } catch (e) { console.log('admin UI', String(e).slice(0, 120)); }
  await A.screenshot({ path: `${OUT}/${TAG}-admin-puff_mushroom.png` });
  for (const p of [H, A]) { ok(!p.blocked.length, 'нет запросов наружу'); ok(!p.errs.length, 'без ошибок страницы ' + p.errs.join(' | ')); }
  await b.close(); console.log(fails ? `FAILED ${fails}` : 'mob-stats-sync ok'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
