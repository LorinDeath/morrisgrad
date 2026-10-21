// LOCAL: снимок портала «Аринар» крупно (как на скрине игрока). OUT/TAG — куда и с каким суффиксом.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/light-fix', TAG = process.env.TAG || 'probe';
const BASE = process.env.LF_BASE || ('http://127.0.0.1:5321/' + (process.env.PAGE || 'game.html')), WS = process.env.LF_WS || 'ws://127.0.0.1:8921';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=lf&uid=lf_probe&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await p.evaluate(() => window.__game.debug.selectClass('mage')); await sleep(1500);
  const shot = async (name, x, y, z) => { await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await p.evaluate((z) => window.__game.debug.setZoom(z), z); await sleep(2200); await p.mouse.move(5, 750); await p.screenshot({ path: `${OUT}/${TAG}-${name}.png` }); };
  const SH = (process.env.SHOTS || 'portal,hub-wide').split(',');
  const at = { portal: [212, 622, 1.1], 'hub-wide': [300, 640, 0.5], torch: [190, 650, 1.3], torches: [300, 940, 1.0] };
  if (process.env.LIGHT) await p.evaluate((c) => window.__game.debug.light?.(c), JSON.parse(process.env.LIGHT));
  for (const n of SH) if (at[n]) { await shot(n, ...at[n]); if (process.env.ATMO_DBG) console.log(n, JSON.stringify(await p.evaluate(() => window.__game.debug.atmo()))); }
  if (process.env.ARINAR) { // биомы Аринара: через портал, затем точки биомов (x,y px) из ARINAR="ice:x:y,fire:x:y"
    for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) { await p.evaluate(() => window.__game.debug.tp(240, 610, true)); await sleep(700); await p.evaluate(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(2500); }
    for (const e of process.env.ARINAR.split(',')) { const [n, x, y] = e.split(':'); await shot('arinar-' + n, +x, +y, +(process.env.AZ || 0.8)); }
  }
  console.log('errs', errs.join(' | ') || 0); await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
