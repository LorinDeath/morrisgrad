// LOCAL ONLY: UI-реворк «проклятое + очернённое», фаза 1 — HUD (нижняя панель + трекер), окно C, книга «Снаряжение» + подсказка,
// в двух+ локациях (Поляна-хаб и биомы Аринара), чтобы показать, что тема по локации работает. Только 127.0.0.1 (guardLocal).
// TAG=before|after OUT=... node tools/playtest/ui-rework.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const TAG = process.env.TAG || 'after';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/phase1';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
const BLK = +(process.env.BLK || 45);
const ONLY = (process.env.ONLY || 'hub,ice,fire').split(',');
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); p.st = null; const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { p.st = JSON.parse(s); } catch {} if (s.includes('"type":"dev_bm"')) try { p.dev = JSON.parse(s); } catch {} }));
  const uid = 'ui_' + (process.env.UID || TAG + Date.now().toString(36));
  await p.goto(assertLocalUrl(`${BASE}?name=Велес&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  const G = (f, a) => p.evaluate(f, a); const S = (o) => G((x) => window.__game.debug.send(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
  await S({ type: 'dev_grant', xp: 60000 }); await sleep(500);
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) await S({ type: 'dev_grant', item: id });
  await sleep(1500);
  for (const it of (p.st?.account?.inv || [])) { await S({ type: 'equip', uid: it.uid }); await sleep(250); }
  await sleep(800);
  // очернение (BLK %) — чтобы на вещах и в окне C был виден слой «очернённое»
  p.dev = null; await S({ type: 'dev_grant', bm: { blk: BLK } }); for (let i = 0; i < 40 && !p.dev; i++) await sleep(100);
  const legs = (p.st?.account?.inv || []).find((i) => /legs/.test(i.id)); if (legs) { await S({ type: 'dev_grant', bm: { blkUid: { uid: legs.uid, v: 80 } } }); }
  await sleep(1500);
  const toArinar = async () => { for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(1800); } };
  const SPOTS = { hub: null, ice: [25154, 28989], fire: [18261, 20917], stone: [16222, 23693], air: [26175, 18540] };
  for (const loc of ONLY) {
    if (SPOTS[loc]) { await toArinar(); await G(([x, y]) => window.__game.debug.tp(x, y), SPOTS[loc]); await sleep(7000); }
    else await sleep(1500);
    const bv = await G(() => window.__game.debug.biomeVars()); console.log(loc, 'biome', JSON.stringify(bv));
    if (SPOTS[loc]) ok(bv.biome === 'b_' + loc, `${loc}: тема локации активна (${bv.biome} ${bv.col})`);
    await p.mouse.move(640, 300); await sleep(300);
    await p.screenshot({ path: `${OUT}/${TAG}-${loc}-hud.png` });
    await G(() => window.__game.debug.charSheet()); await p.waitForSelector('.mc-charsheet .mc-insp-gear', { timeout: 10000 }); await sleep(1600);
    await p.mouse.move(1270, 740); await sleep(300); await p.screenshot({ path: `${OUT}/${TAG}-${loc}-C.png` });
    const slot = await p.$('.mc-charsheet .mc-insp-slot:nth-child(3)'); if (slot) { await slot.hover(); await sleep(500); await p.screenshot({ path: `${OUT}/${TAG}-${loc}-C-tip.png` }); }
    await p.keyboard.press('Escape'); await sleep(500);
    await G(() => window.__game.debug.openBook('gear')); await sleep(1200);
    const g = await p.$('.mc-gslot.filled'); if (g) { await g.click(); await sleep(600); }
    await p.mouse.move(5, 750); await sleep(200);
    await p.screenshot({ path: `${OUT}/${TAG}-${loc}-gear.png` });
    const h = await p.$('.mc-gslot.filled:nth-of-type(3)') || g; if (h) { await h.hover(); await sleep(500); await p.screenshot({ path: `${OUT}/${TAG}-${loc}-gear-tip.png` }); }
    await p.keyboard.press('Escape'); await sleep(600);
  }
  if (process.env.PERF) { const f = await G(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const fr = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(fr); else r(Math.round(n / 3)); }; requestAnimationFrame(fr); })); console.log('fps', f); }
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  ok(!blocked.length, 'нет внешних запросов ' + blocked.slice(0, 3).join(' '));
  console.log(fails ? `FAILED ${fails}` : 'ui-rework ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
