// LOCAL ONLY: кромка арены 32 крупно — 4 темы, точки на круге (N, NW, W, SW, S, NNW), зум 1× (0.5), 2× (1.0), 4× (2.0).
// MOBILE=1 — телефон; OUT — папка; ROOMS; TAG — метка (before/after); PTS — точки; ZS — зумы
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/props3/arena3edge/raw';
const BASE = assertLocalUrl(process.env.LF_BASE || 'http://127.0.0.1:5331/game.html'), WS = assertLocalUrl(process.env.LF_WS || 'ws://127.0.0.1:8931');
const MOB = !!process.env.MOBILE, PF = MOB ? 'phone' : 'pc', TAG = process.env.TAG || 'x';
const ROOMS = (process.env.ROOMS || 'crypt,abyss,duel,trial').split(',');
const TH = { crypt: 'crypt', abyss: 'abyss', duel: 'mirror', trial: 'abode' };
const ANG = { n: -90, nnw: -112.5, nw: -135, w: 180, sw: 135, s: 90, se: 45, ne: -45 };
const PTS = (process.env.PTS || 'n,nnw,nw,w,sw,s').split(','), ZS = (process.env.ZS || '0.5,1,2').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(MOB ? { ...devices['Pixel 7'], viewport: { width: 412, height: 839 } } : { viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' || /arena32/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const uid = `a3edge_${PF}`;
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1&props=3&arena=3${MOB ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 240000 });
  await sleep(1200); await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2000);
  const D = (fn, ...a) => p.evaluate(([fn, a]) => window.__game.debug[fn](...a), [fn, a]);
  const info = {};
  for (const room of ROOMS) {
    if ((await p.evaluate(() => window.__game.state().mode)) === 'run') { await D('leaveRun'); await p.waitForFunction(() => window.__game.state().mode === 'hub', null, { timeout: 60000 }); await sleep(1500); }
    await D('gfxLocal', JSON.parse(process.env.CFG || '{"arena3Wall":"auto","arena3Posts":1}'));
    await p.evaluate((r) => window.__game.startRun(r), room);
    await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 60000 });
    for (let i = 0; i < 60; i++) { const a = await D('arena32'); if (!a || a.ready) break; await sleep(250); }
    await sleep(3000); const th = TH[room]; info[th] = await D('arena32');
    for (const pt of PTS) for (const z of ZS) {
      const a = ANG[pt] * Math.PI / 180, r = z >= 2 ? 60.6 : z >= 1 ? 59.5 : 57;
      await D('freeCam', { x: Math.cos(a) * r, z: Math.sin(a) * r, zoom: z }); await sleep(1600); await p.mouse.move(5, 5);
      await p.screenshot({ path: `${OUT}/${PF}-${th}-${TAG}-${pt}-z${z}.png` });
    }
    await D('freeCam', null);
  }
  console.log('info', JSON.stringify(info)); console.log('errs', errs.join(' | ') || 0); await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
