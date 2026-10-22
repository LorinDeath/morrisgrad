// Снимки сундуков наград: окно, открытие каждого вида (замороженные кадры через clock), сетка, «пуф», админка.
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-qol/shots/bchest';
const BASE = 'http://127.0.0.1:5371', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOB = process.env.MOB === '1', ADMIN = process.env.ADMIN === '1', PFX = ADMIN ? 'adm' : MOB ? 'mob' : 'pc';
const ATLAS = require('/workspace/mg-qol/src/assets/mc/rewardchest/chests_atlas.json');
const RANKS = (process.env.RANKS || 'F,C,A,S,SS').split(',');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(MOB ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 800 } });
  await ctx.route(/^(?!https?:\/\/127\.0\.0\.1|ws:\/\/127\.0\.0\.1|data:|blob:)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = [];
  await p.clock.install();
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = ADMIN ? 'qa_admin' : 'qa_bc_' + PFX + '_' + Date.now().toString(36);
  await p.goto(`${BASE}/${MOB ? 'game.html' : 'game-panel.html'}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${MOB ? '&mobile=1' : ''}`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await sleep(1500);
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove())); await p.screenshot({ path: `${OUT}/${PFX}-${n}.png` }); console.log('shot', n); };
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(800);
  await G((r) => window.__game.debug.rawSend({ type: 'dev_grant', xp: 3000, bchestGrant: { ranks: r, L: 12, cat: 'weekly' } }), RANKS); await sleep(1200);
  await G(() => window.__game.debug.rawSend({ type: 'meta_get' })); await sleep(1500);
  await shot('01-hud-badge');
  if (MOB) await p.tap('.mc3d-tbtn[data-act="chests"]'); else await p.keyboard.press('KeyY');
  await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(1200);
  await shot('02-window');
  const ids = await G(() => window.__game.bchestWin.st.list.map((c) => ({ id: c.id, art: c.art, rank: c.rank })));
  console.log('chests', JSON.stringify(ids));
  const FPS = 24;
  for (const [k, c] of ids.entries()) {
    if (MOB && k > 0) break; // на телефоне — одно открытие
    await G((id) => document.querySelector(`#mc-bchest .bc-row[data-id="${id}"]`)?.click(), c.id); await sleep(500);
    if (k === 0) await shot(`03-odds-${c.art}`);
    const ev = ATLAS.keys['chest_open_' + c.art]?.events || null;
    if (MOB) await p.tap('#mc-bchest .bc-open'); else await p.click('#mc-bchest .bc-open');
    await p.waitForSelector('.bc-fx[data-run]', { timeout: 15000 });
    const now = await G(() => Date.now()); for (let tr = 0; tr < 5; tr++) { try { await p.clock.pauseAt((await G(() => Date.now())) + 60); break; } catch (e) { if (tr === 4) throw e; } }
    const E = ev || { flash: 12, items_out: 14, idle_start: 30 };
    const marks = [['a-shake', E.flash - 3], ['b-flash', E.flash + 1], ['c-items', E.items_out + 8], ['d-idle', E.idle_start + 4]];
    let t = 0;
    for (const [n, f] of marks) { const ms = Math.round(f * 1000 / FPS) - t; if (ms > 0) { await p.clock.runFor(ms); t += ms; } await sleep(150); await shot(`10-open-${c.art}-${n}`); }
    await p.clock.resume();
    await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(900); await shot(`11-grid-${c.art}`);
  }
  // сравнение: наведение на клетку
  const cell = await p.$('#mc-bchest .grid .cell');
  if (cell) { if (MOB) { await cell.tap(); } else { await cell.hover(); } await sleep(700); await shot('12-compare'); }
  // забрать всё у последнего → пустой сундук исчезает с «пуфом»
  if (await p.$('#mc-bchest .bc-acts .all:not([disabled])')) { await p.click('#mc-bchest .bc-acts .all'); await sleep(120); await shot('13-take-all-poof'); await sleep(1200); await shot('14-after-take'); }
  if (ADMIN) {
    await G(() => window.__game.bchestWin.close());
    await G(() => window.__game.debug.openAdmin()); await p.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 20000 });
    await G(() => document.querySelector('.mc-admin [data-tab="bchest"]')?.click()); await sleep(800);
    await G(() => document.querySelector('.mc-admin aside li[data-id]')?.click()); await sleep(1000);
    await shot('20-admin-form');
    await G(() => document.querySelector('.mc-admin .bcp-go')?.click()); await sleep(1500);
    await G(() => document.querySelector('.mc-admin .mc-bcp')?.scrollIntoView()); await sleep(400);
    await shot('21-admin-preview');
  }
  console.log('ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
