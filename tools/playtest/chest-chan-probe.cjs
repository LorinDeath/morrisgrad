// LOCAL: почему канал открытия общего сундука сбрасывается (~4 с). Сценарии: ПК, телефон (touch), высокий пинг, моб вне экрана.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', OUT = '/workspace/morrisgrad-round3/camp-loot';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCN = (process.env.SCN || 'desktop,mobile,ping,stick').split(',');
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  { const ctx = await b.newContext(); await guardLocal(ctx); const a = await ctx.newPage();
    await a.goto(assertLocalUrl(`${BASE}?name=PAdm&uid=test_admin_perf&ws=${WS}&fs=1&debug=1`)); await a.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
    await a.evaluate((g) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'chest', id: 'main', patch: { personalSec: 0, channelSec: 15, guard: g } }), process.env.GUARD === '1'); await sleep(1500); await ctx.close(); }
  for (const sc of SCN) {
    const mob = sc !== 'desktop' && sc !== 'ping';
    const ctx = await b.newContext(mob ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } : { viewport: { width: 1280, height: 760 } });
    await guardLocal(ctx); if (process.env.SKEW) await ctx.addInitScript((k) => { const D = Date.now.bind(Date); Date.now = () => D() + k; }, Number(process.env.SKEW)); const p = await ctx.newPage(); p.ev = [];
    p.on('websocket', (ws) => { ws.on('framereceived', (f) => { const s = String(f.payload); if (/"type":"chest_(channel|cancel|view|err)/.test(s)) p.ev.push({ t: Date.now(), s: s.slice(0, 160) }); }); ws.on('framesent', (f) => { const s = String(f.payload); if (/chest_|"move"|"pos"/.test(s.slice(0, 40))) p.ev.push({ t: Date.now(), out: s.slice(0, 100) }); }); });
    if (sc === 'ping') { const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 450, downloadThroughput: -1, uploadThroughput: -1 }); }
    await p.goto(assertLocalUrl(`${BASE}?name=Probe${sc}&uid=probe_${sc}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
    const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
    await S({ type: 'dev_grant', chestSpawn: { by: { me: ['dew_slime_weapon'] }, dx: 40, dy: 0 } }); await sleep(800);
    const st = await p.evaluate(() => { const g = window.__game; return { me: g.state().player || null, ch: g.debug.chests?.() }; });
    const c = (st.ch || []).sort((a, z) => z.id - a.id)[0]; if (!c) { console.log(sc, 'нет сундука', JSON.stringify(st).slice(0, 200)); continue; }
    if (sc === 'stick') { // палец лежит на джойстике с дрожью ±3 px
      const j = await p.$('.mc3d-joy, [class*="joy"]'); const bb = j && (await j.boundingBox()); if (bb) { const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2; await p.touchscreen.tap(cx, cy).catch(() => {});
        await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const ev = (t, dx) => el.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x + dx, clientY: y + dx, bubbles: true, pointerType: 'touch' })); ev('pointerdown', 0); let k = 0; window.__jit = setInterval(() => ev('pointermove', (k++ % 2 ? 3 : -3)), 60); }, [cx, cy]); } }
    const t0 = Date.now(); p.ev.length = 0;
    await S({ type: 'chest_open', chest: c.id });
    const bars = []; for (let i = 0; i < 34; i++) { await sleep(500); bars.push(await p.evaluate(() => { const b = document.querySelector('.mc-chest-chan'); return b ? (b.querySelector('i').style.width || '') + '|' + (b.querySelector('span')?.textContent || '') : '-'; })); if (i === 7) await p.screenshot({ path: `${OUT}/probe-${sc}${process.env.SKEW ? '-skew' : ''}-4s.png` }); }
    console.log('полоса каждые 0.5 с:', bars.join(' '));
    await p.screenshot({ path: `${OUT}/probe-${sc}.png` });
    const pos = await p.evaluate(() => { const s = window.__game.state(); return s.player ? { x: Math.round(s.player.x), y: Math.round(s.player.y) } : null; });
    console.log(`\n== ${sc}: сундук ${c.id} @${c.x},${c.y}; я ${JSON.stringify(pos)}`);
    for (const e of p.ev) console.log(((e.t - t0) / 1000).toFixed(1) + 's', e.s ? '← ' + e.s : '→ ' + e.out);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
