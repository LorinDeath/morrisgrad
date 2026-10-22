// Плейтест (локально): задания по телам — трекер с заданием «Выполнить на: X», доска на двух телах, Алтарь перевоплощения
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-qol/shots';
const BASE = 'http://127.0.0.1:5371', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOB = process.env.MOB === '1', PFX = MOB ? 'mob' : 'pc';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(MOB ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1440, height: 900 } });
  await ctx.route(/^(?!https?:\/\/127\.0\.0\.1|ws:\/\/127\.0\.0\.1|data:|blob:)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = 'qa_body_' + PFX + '_' + Date.now().toString(36);
  await p.goto(`${BASE}/${MOB ? 'game.html' : 'game-panel.html'}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${MOB ? '&mobile=1' : ''}`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await p.waitForFunction(() => window.__game?.board?.ready, null, { timeout: 30000 }); await sleep(1500);
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove())); await p.mouse.move(2, 2); await sleep(500); await p.screenshot({ path: `${OUT}/${PFX}-${n}.png` }); console.log('shot', n); };
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board.tut('skip')); await sleep(600);
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', boardRoll: { id: 'd_kill_a', r: 'C', n: 3, minL: 1, rb: 'mage' } })); await sleep(1200);
  await G(() => window.__game.board.pin('d_kill_a', true)); await sleep(1200);
  console.log('roll', JSON.stringify(await G(() => window.__game.board.st.roll.d_kill_a)), 'req', await G(() => window.__game.board.reqText(window.__game.board.def('d_kill_a'))));
  await shot('95-xb-tracker-warrior');
  await G(() => window.__game.boardWin.open('all', 'daily')); await sleep(900);
  await G(() => document.querySelector('.mc-bd-row[data-id="d_kill_a"]')?.scrollIntoView({ block: 'center' })); await shot('96-board-warrior');
  await G(() => window.__game.boardWin.close()); await sleep(300);
  // Алтарь перевоплощения → второе тело (маг)
  await G(() => window.__game.debug.tp(565, 640)); await sleep(1500);
  await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_class_select' })); await sleep(1500);
  await shot('97-altar');
  await G(() => window.__game.debug.selectClass('mage')); await sleep(3000); await p.keyboard.press('Escape'); await sleep(800);
  console.log('body now', await G(() => window.__game.board.body), 'cross', JSON.stringify(await G(() => window.__game.board.crossList().map((x) => [x.t.id, x.o, x.p]))));
  await shot('98-xb-tracker-mage');
  await G(() => window.__game.boardWin.open('all', 'daily')); await sleep(900); await shot('99-board-mage');
  console.log('ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
