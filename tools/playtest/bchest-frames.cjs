// Рамки: сетка сундука наград vs сумка C — одни и те же ячейки (itemSlot). MODE=pc|phone. Только локальный стенд.
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('/workspace/mg-qol/tools/playtest/_local.cjs');
const MODE = process.env.MODE || 'pc';
const OUT = '/workspace/morrisgrad-qol/shots/bchest3';
const BASE = 'http://127.0.0.1:5371/game-panel.html', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(MODE === 'phone' ? { ...devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 1280, height: 800 } });
  await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = 'bcf_' + MODE + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=Рамки&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await sleep(1500);
  const G = (f, a) => p.evaluate(f, a);
  const hideErr = () => G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove()));
  const shot = async (n, el) => { await hideErr(); if (el) await (await p.$(el)).screenshot({ path: `${OUT}/${MODE}-${n}.png` }); else await p.screenshot({ path: `${OUT}/${MODE}-${n}.png` }); console.log('shot', n); };
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(600);
  const S = (o) => G((x) => window.__game.debug.send(x), o);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(500); await S({ type: 'dev_grant', xp: 3000000 }); await sleep(500);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['SS', 'SS', 'SS', 'SS', 'SS', 'SS'], L: 12, cat: 'monthly' } }); await sleep(1000);
  await S({ type: 'meta_get' }); await sleep(1200);
  await G(() => window.__game.bchestWin.open());
  await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(1200);
  const ids = await G(() => window.__game.bchestWin.st.list.filter((c) => !c.opened).map((c) => c.id));
  let it = [];
  for (const id of ids) {
    await G((i) => document.querySelector(`#mc-bchest .bc-row[data-id="${i}"]`)?.click(), id); await sleep(400);
    await G(() => document.querySelector('#mc-bchest .bc-open')?.click());
    await p.waitForSelector('.bc-fx', { timeout: 15000 }).catch(() => {});
    await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 30000 }).catch(() => {});
    await sleep(1000);
    it = await G(() => window.__game.bchestWin.cur()?.items || []);
    const k = { bc: it.filter((x) => x.c && x.e === 6).length, c: it.filter((x) => x.c && !x.e).length, e: it.filter((x) => !x.c && x.e).length, b: it.filter((x) => x.b).length, p: it.filter((x) => !x.c && !x.e && !x.b).length };
    console.log('opened', id, it.length, JSON.stringify(k));
    if (k.bc && k.c && k.e && k.b && k.p) break;
  }
  await p.mouse.move(2, 2); await sleep(400);
  const cells = await G(() => [...document.querySelectorAll('#mc-bchest .grid > *')].map((e) => e.className));
  console.log('grid classes', JSON.stringify(cells));
  await shot('01-chest-window');
  await shot('02-chest-grid', '#mc-bchest .grid');
  if (MODE === 'phone') { // двойной тап — забрать одну
    const x = it[0]; const el = await p.$(`#mc-bchest .grid [data-lid="${x.lid}"]`); const bb = await el.boundingBox();
    await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(120); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(1500);
    const left = await G(() => window.__game.bchestWin.cur()?.items?.length || 0); console.log('dbltap: было', it.length, 'стало', left);
  }
  await G(() => document.querySelector('#mc-bchest [data-a="all"]')?.click()); await sleep(2000);
  await G(() => window.__game.bchestWin.close()); await sleep(300);
  await G(() => window.__game.debug.openBook('gear')); await sleep(1500);
  const bag = await G(() => [...document.querySelectorAll('.mc-bag .mc-item')].map((e) => e.className));
  console.log('bag classes', JSON.stringify(bag));
  await shot('03-inventory');
  await shot('04-inventory-bag', '.mc-bag');
  console.log('ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
