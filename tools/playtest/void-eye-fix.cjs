// LOCAL ONLY: void_eye до/после правки Художника (кадры atk 28–39, hurt 40–44, die 61). «До» — старый лист из git (OLD_DIR), подменяется маршрутом.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/mobs32';
const OLD = process.env.OLD_DIR || '/tmp/ve';
const BASE = assertLocalUrl(process.env.LF_BASE || 'http://127.0.0.1:5341/game.html'), WS = assertLocalUrl(process.env.LF_WS || 'ws://127.0.0.1:8941');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = (p, fn, ...a) => p.evaluate(([fn, a]) => window.__game.debug[fn](...a), [fn, a]);
const frames2 = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
// кадры показа: atk замах/удар/возврат, hurt, die
const SHOTS = [['atk', 0.33], ['atk', 0.4], ['atk', 0.5], ['hurt', 0.06], ['hurt', 0.16], ['die', 0.42]];
async function run(b, old) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  if (old) await p.route(/bestiary32_t5_p1(_glow)?\.png/, (r) => { const g = /_glow/.test(r.request().url()); r.fulfill({ contentType: 'image/png', body: fs.readFileSync(`${OLD}/old${g ? '_glow' : ''}.png`) }); });
  const uid = 've_' + (old ? 'old' : 'new');
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1&props=3`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 240000 });
  await sleep(1500); await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2000);
  for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) { await D(p, 'tp', 240, 610, true); await sleep(700); await D(p, 'rawSend', { type: 'use_portal', portalId: 'portal_arinar' }); await sleep(3000); }
  await D(p, 'tp', 20400, 1200, true); await sleep(5000); await D(p, 'mood', 'b_stone');
  await D(p, 'setZoom', 1.6); await D(p, 'mobPref', 'new');
  const files = [];
  for (let i = 0; i < SHOTS.length; i++) {
    const [anim, t] = SHOTS[i];
    await D(p, 'mobDemo', [{ type: 'void_eye', anim, dx: 0, dy: 40 }]); await D(p, 'mobDemoAt', t);
    for (let k = 0; k < 80; k++) { const st = await D(p, 'mobs32'); if (st.drawn > 0 && st.pages.some((q) => q.st === 'ready')) break; await sleep(250); }
    await frames2(p); await sleep(300); await p.mouse.move(5, 5);
    const f = `${OUT}/frames/ve-${old ? 'old' : 'new'}-${i}.png`; await p.screenshot({ path: f, clip: { x: 390, y: 170, width: 500, height: 420 } }); files.push(f);
  }
  await ctx.close(); return { files, errs };
}
(async () => {
  fs.mkdirSync(OUT + '/frames', { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const o = await run(b, true), n = await run(b, false);
  await b.close();
  console.log(JSON.stringify({ old: o, new: n }));
})().catch((e) => { console.error(e); process.exit(1); });
