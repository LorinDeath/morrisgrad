// LOCAL: место города Альказак — вид в игре (центр купола), только 127.0.0.1
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = JSON.parse(process.env.SHOTS || '[["01-spot-center",24624,3376,20],["01b-spot-wide",24624,3376,30],["01c-spot-rose",24624,3300,12]]');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  const uid = process.env.UID || 'city_admin';
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  const G = (f, a) => p.evaluate(f, a);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  console.log('world', await G(() => window.__game.state().world));
  for (const [name, x, y, cells] of SHOTS) {
    await G(([a, c]) => window.__game.debug.tp(a, c, true), [x, y]); await sleep(1500);
    await G((n) => window.__game.debug.setCells(n), cells); await sleep(4500);
    await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name, JSON.stringify(await G(() => { const s = window.__game.state(); return { x: Math.round(s.player?.x ?? 0), y: Math.round(s.player?.y ?? 0) }; })));
  }
  if (process.env.EVAL) console.log('eval', JSON.stringify(await G(new Function(process.env.EVAL))));
  console.log('errors', errs.slice(0, 5));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
