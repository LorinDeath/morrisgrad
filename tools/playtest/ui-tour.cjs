// LOCAL ONLY: полный обход интерфейса для UI-реворка — все окна и HUD в теме THEME (new|old) на VIEW (pc|mobile).
// Скриншоты: OUT/<theme>-<view>-<NN>-<окно>.png. Проверки: тема включается/выключается (html.mc-ui), аватар → очернённый
// выше порога, в забеге темы нет, нет ошибок страницы и внешних запросов. Только 127.0.0.1 (guardLocal).
// THEME=new VIEW=pc NODE_PATH=... node tools/playtest/ui-tour.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const THEME = process.env.THEME || 'new', VIEW = process.env.VIEW || 'pc';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/tour';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
const LOC = process.env.LOC || 'hub';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const mob = VIEW === 'mobile';
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: 1280, height: 760 } });
  const blocked = await guardLocal(ctx);
  await ctx.addInitScript((t) => { try { localStorage.setItem('mc_ui_theme', t); } catch {} }, THEME);
  const p = await ctx.newPage(); p.st = null; const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { p.st = JSON.parse(s); } catch {} if (s.includes('"type":"dev_bm"')) try { p.dev = JSON.parse(s); } catch {} }));
  const uid = 'tour_' + THEME + VIEW + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=Велес&uid=${uid}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  const G = (f, a) => p.evaluate(f, a); const S = (o) => G((x) => window.__game.debug.send(x), o);
  let n = 0; const shot = async (nm) => { n++; await sleep(350); await p.screenshot({ path: `${OUT}/${THEME}-${VIEW}-${LOC}-${String(n).padStart(2, '0')}-${nm}.png` }); };
  const esc = async () => { await p.keyboard.press('Escape'); await sleep(450); await G(() => { for (const x of document.querySelectorAll('.mc-soc-x, .mc-upg-x, .mc-altar .x')) if (x.offsetParent) x.click(); }); await sleep(250); };
  const hasUi = () => G(() => document.documentElement.classList.contains('mc-ui'));
  // класс-выбор (первый вход) — до выбора класса
  await shot('start');
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
  await S({ type: 'dev_grant', xp: 60000 }); await sleep(500);
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) await S({ type: 'dev_grant', item: id });
  await sleep(1500);
  for (const it of (p.st?.account?.inv || [])) { await S({ type: 'equip', uid: it.uid }); await sleep(250); }
  ok((await hasUi()) === (THEME === 'new'), `тема ${THEME}: html.mc-ui ${THEME === 'new' ? 'есть' : 'нет'}`);
  if (LOC !== 'hub') {
    const SP = { ice: [25154, 28989], fire: [18261, 20917], stone: [16222, 23693], air: [26175, 18540] }[LOC];
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(1800); }
    await G(([x, y]) => window.__game.debug.tp(x, y), SP); await sleep(7000);
  }
  await p.mouse.move(mob ? 420 : 640, mob ? 150 : 300); await shot('hud');
  // аватар: чистый → очернённый выше порога (по умолчанию 25)
  const avOf = () => G(() => getComputedStyle(document.querySelector('.mc-pframe .mc-av') || document.body).getPropertyValue('--av') + '|' + (document.querySelector('#ghud-my-av')?.style.getPropertyValue('--av') || ''));
  const av0 = await avOf();
  p.dev = null; await S({ type: 'dev_grant', bm: { blk: 60 } }); for (let i = 0; i < 40 && !p.dev; i++) await sleep(100); await sleep(1500);
  const av1 = await avOf();
  if (THEME === 'new') ok(!/_cursed/.test(av0) && /_cursed/.test(av1), `аватар: чистый (0%) → очернённый (60%) ${av0.slice(-40)} → ${av1.slice(-40)}`);
  await shot('hud-blk');
  const avSizes = async (where) => { const sz = await G(() => [...document.querySelectorAll('.mc-av > i')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return r.width + 'x' + r.height; }));
    if (THEME === 'new') ok(sz.length > 0 && sz.every((x) => x === '64x64' || x === '128x128'), `аватары ${where} в родном размере (без дробного масштаба): ${sz.join(', ')}`); };
  if (!mob) await avSizes('HUD');
  await G(() => window.__game.debug.charSheet()); await p.waitForSelector('.mc-charsheet .mc-insp-gear', { timeout: 10000 }); await sleep(1200);
  await p.mouse.move(2, 2); await shot('C');
  await avSizes('в окне C');
  await esc();
  for (const t of ['quests', 'hero', 'skills', 'gear', 'library', 'bestiary', 'runskills', 'craft', 'soul']) {
    await G((x) => window.__game.debug.openBook(x), t); await sleep(900);
    if (t === 'gear') { const g = await p.$('.mc-gslot.filled'); if (g) { await g.click(); await sleep(500); } }
    await p.mouse.move(2, 2); await shot('book-' + t);
  }
  await esc();
  const clickBtn = async (sel, nm) => { const e = await p.$(sel); if (e && await e.isVisible()) { await e.click(); await sleep(1100); await p.mouse.move(2, 2); await shot(nm); await esc(); } else console.log('skip', nm, '(кнопка скрыта)'); };
  await clickBtn('.mc-setbtn', 'settings');
  await clickBtn('.mc-ratebtn:not(.mc-onlinebtn):not(.mc-friendsbtn):not(.mc-setbtn):not(.mc-homebtn)', 'rating');
  await clickBtn('.mc-onlinebtn', 'online');
  await clickBtn('.mc-friendsbtn', 'friends');
  // осмотр себя (профиль) — через открытие персонажа с аватаром 128
  await G(() => window.__game.debug.openUpgrade()); await sleep(1000); await shot('upgrade'); await esc();
  await G(() => window.__game.debug.openAltar()); await sleep(1200); await shot('altar'); await esc();
  await G(() => window.__game.debug.openMap()); await sleep(1500); await shot('worldmap'); await esc();
  // переключатель темы в настройках работает на лету
  if (!mob) {
    for (let i = 0; i < 3 && !(await p.$('[data-act="uitheme"]')); i++) { await p.click('.mc-setbtn'); await sleep(900); }
    const want = THEME === 'new' ? 'old' : 'new';
    await G((v) => document.querySelector(`[data-act="uitheme"][data-v="${v}"]`)?.click(), want); await sleep(600);
    ok((await hasUi()) === (want === 'new'), `переключатель «Интерфейс» → ${want}`);
    await shot('settings-switched');
    await G((v) => document.querySelector(`[data-act="uitheme"][data-v="${v}"]`)?.click(), THEME); await sleep(400); await esc();
  }
  // диалог с NPC (Пётр в хабе)
  if (LOC === 'hub') {
    const np = await G(() => window.__game.debug.npcPos('petr') || window.__game.debug.npcSpawn('petr'));
    if (np) { await G(([x, y]) => window.__game.debug.teleport(x + 40, y + 10), [np.x, np.y]); await sleep(1500); await G(() => window.__game.debug.interact()); await sleep(1800); await shot('dialog'); if (THEME === 'new') { if (await p.$('.mc-dialog .who')) await avSizes('в диалоге'); else console.log('skip диалог: рядом оказался портал, а не NPC'); } await esc(); }
  }
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  ok(!blocked.length, 'нет внешних запросов ' + blocked.slice(0, 3).join(' '));
  console.log(fails ? `FAILED ${fails}` : 'ui-tour ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
