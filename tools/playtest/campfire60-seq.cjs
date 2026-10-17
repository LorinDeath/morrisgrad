// LOCAL: кадры костра 60 подряд при «замороженном» времени спрайтов (uTime = t, шаг 2 кадра = 1/15 с) — ПК и телефон.
// Только 127.0.0.1. BASE=http://127.0.0.1:5301/game.html WS=ws://127.0.0.1:8901 node tools/playtest/campfire60-seq.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:5301/game.html', WS = process.env.WS || 'ws://127.0.0.1:8901', SRC = process.env.SRC || '/workspace/mg-push';
const OUT = (process.env.OUT || '/workspace/morrisgrad-round3') + '/campfire60'; fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let errsAll = 0;
  for (const dev of ['pc', 'mobile']) {
    const mobile = dev === 'mobile';
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 760 } });
    await guardLocal(ctx); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    const uid = `cf60_seq_${dev}_${Date.now().toString(36).slice(-4)}`;
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 180000 }); await sleep(1500);
    const G = (f, a) => p.evaluate(f, a);
    const cf = await G(async (src) => { const m = await import(`/@fs${src}/server/meta/shared.ts`); const n = m.NPCS.petr; return { x: n.x + 42, y: n.y - 10 }; }, SRC);
    await G(([x, y]) => window.__game.debug.tp(x - 10, y + 45, true), [cf.x, cf.y]); await sleep(2500);
    // заморозить общее время спрайтов: геттер отдаёт заданное t, игровой цикл (tickSpriteTime) не сдвигает
    await G(async (src) => { const m = await import(`/@fs${src}/src/pages/MorrisCurse/_core/engine/spriteBatch.js`); let t = 0; Object.defineProperty(m.SPRITE_TIME, 'value', { get: () => t, set: () => {}, configurable: true }); window.__cfT = (v) => { t = v; }; }, SRC);
    const vp = p.viewportSize(), cw = mobile ? 220 : 260, ch = mobile ? 240 : 230;
    const clip = { x: Math.round(vp.width / 2 - cw / 2 + 10), y: Math.round(vp.height / 2 - ch * 0.95 - (mobile ? 45 : 35)), width: cw, height: ch };
    for (let k = 0; k < 12; k++) { await G((v) => window.__cfT(v), 50 + k / 15); await sleep(250); await p.screenshot({ path: `${OUT}/seq-${dev}-f${String(k).padStart(2, '0')}.png`, clip }); }
    console.log(dev, 'errors', errs.length, errs.slice(0, 2)); errsAll += errs.length;
    await ctx.close();
  }
  await b.close(); process.exit(errsAll ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
