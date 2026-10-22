// Окно сундука на телефоне: «Открыть» и «Забрать всё» видны без прокрутки (липкий футер). VP=iphone13|iphone13l|se|sel, TAG. Только локальный стенд.
// Телефон: кнопка «Открыть» (и «Забрать всё») видна без прокрутки. VP=iphone13|iphone13l|se|sel. Только локальный стенд.
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('/workspace/mg-qol/tools/playtest/_local.cjs');
const VPS = { iphone13: devices['iPhone 13'], iphone13l: devices['iPhone 13 landscape'],
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent },
  sel: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent } };
const VP = process.env.VP || 'iphone13', TAG = process.env.TAG || 'after';
const OUT = '/workspace/morrisgrad-qol/shots/bchest4';
const BASE = 'http://127.0.0.1:5371/game.html', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const d = { ...VPS[VP] }; delete d.defaultBrowserType;
  const ctx = await b.newContext(d); await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = 'bcft_' + VP + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=Кнопка&uid=${uid}&ws=${WS}&fs=1&debug=1&mobile=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (f, a) => p.evaluate(f, a); const S = (o) => G((x) => window.__game.debug.send(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(500);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(400);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['SS', 'F'], L: 12, cat: 'monthly' } }); await sleep(800);
  await S({ type: 'meta_get' }); await sleep(1000);
  const hide = () => G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove()));
  await G(() => window.__game.bchestWin.open()); await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(1200);
  const id = await G(() => window.__game.bchestWin.st.list.find((c) => c.rank === 'SS').id);
  await G((i) => document.querySelector(`#mc-bchest .bc-row[data-id="${i}"]`).click(), id); await sleep(800);
  const vis = (sel) => G((s) => { const e = document.querySelector(s); if (!e) return { sel: s, none: 1 }; const r = e.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; const h = document.elementFromPoint(cx, cy);
    return { sel: s, y: Math.round(r.y), h: Math.round(r.height), vh: innerHeight, vw: innerWidth, hit: !!h && (h === e || e.contains(h)) }; }, sel);
  const win = await vis('#mc-bchest'); const o1 = await vis('#mc-bchest .bc-open');
  console.log(VP, 'window', JSON.stringify(win), 'open', JSON.stringify(o1));
  await hide(); await p.screenshot({ path: `${OUT}/${TAG}-${VP}-1-closed.png` });
  // нажатие пальцем без прокрутки
  const bb = await (await p.$('#mc-bchest .bc-open')).boundingBox();
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const fx = await p.waitForSelector('.bc-fx', { timeout: 5000 }).then(() => 1, () => 0);
  console.log(VP, 'tap «Открыть» без прокрутки →', fx ? 'анимация пошла' : 'НЕ СРАБОТАЛО');
  if (fx) { await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 30000 }).catch(() => {}); await sleep(1200); }
  const o2 = await vis('#mc-bchest [data-a="all"]'); console.log(VP, 'take-all', JSON.stringify(o2));
  await hide(); await p.screenshot({ path: `${OUT}/${TAG}-${VP}-2-opened.png` });
  console.log(VP, 'RESULT', o1.hit && fx && o2.hit ? 'PASS' : 'FAIL', 'ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
