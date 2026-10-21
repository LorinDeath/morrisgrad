// LOCAL ONLY: быстрый взгляд на арену 32 (одна комната). ROOM, ARENA=2|3, WALL=sprites|baked, MOBILE=1
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/props3/arena3/probe';
const BASE = assertLocalUrl('http://127.0.0.1:5331/game.html'), WS = assertLocalUrl('ws://127.0.0.1:8931');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mob = !!process.env.MOBILE;
  const ctx = await b.newContext(mob ? { ...devices['Pixel 7'], viewport: { width: 412, height: 839 } } : { viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text().slice(0, 200)); });
  const uid = 'a3probe' + (mob ? 'm' : '');
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1&props=3&arena=${process.env.ARENA || 3}${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 240000 });
  await sleep(1200); await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2000);
  await p.evaluate((w) => window.__game.debug.gfxLocal({ arena3Wall: w[0], arena3Posts: w[1] }), [process.env.WALL || 'auto', +(process.env.POSTS || 1)]);
  await p.evaluate((r) => window.__game.startRun(r), process.env.ROOM || 'crypt');
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 60000 });
  await sleep(7000); await p.mouse.move(5, 5);
  console.log('a32', JSON.stringify(await p.evaluate(() => window.__game.debug.arena32())), JSON.stringify(await p.evaluate(() => window.__game.debug.glMem())));
  await p.screenshot({ path: `${OUT}/hero.png` });
  for (const [nm, c] of [['north', { x: 0, z: -55, zoom: 0.6 }], ['diag', { x: -40, z: -40, zoom: 0.6 }], ['south', { x: 0, z: 52, zoom: 0.6 }], ['wide', { x: 0, z: -30, zoom: 0.3 }]]) { await p.evaluate((c) => window.__game.debug.freeCam(c), c); await sleep(2500); await p.screenshot({ path: `${OUT}/${nm}.png` }); }
  console.log('errs', errs.join(' | ') || 0); await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
