// LOCAL ONLY: пропсы 32 (props3) — снимки до/после и замеры. PROPS=2|3 (набор), MOBILE=1 (как телефон), TAG — суффикс.
// SHOTS=hub,portal,lights,arinar,stats,arena … ; ARENA=2|3 — набор арены забега (?arena=); вывод — OUT (по умолчанию /workspace/morrisgrad-round3/props3).
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/props3', TAG = process.env.TAG || ('p' + (process.env.PROPS || '3'));
const BASE = process.env.LF_BASE || 'http://127.0.0.1:5331/game.html', WS = process.env.LF_WS || 'ws://127.0.0.1:8931';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SH = (process.env.SHOTS || 'stats,hub,portal,lights,arinar').split(',');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mob = !!process.env.MOBILE;
  const ctx = await b.newContext(mob ? { ...devices['Pixel 7'], viewport: { width: 412, height: 839 } } : { viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' || /props|atmo/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const reqs = []; p.on('request', (r) => { if (/props[23]|props32|light_emitters/.test(r.url())) reqs.push((/[?&]import/.test(r.url()) ? 'stub ' : r.resourceType() + ' ') + r.url().replace(/^.*\/src\/assets\//, '')); });
  const t0 = Date.now();
  const q = (process.env.PROPS ? `&props=${process.env.PROPS}` : '') + (process.env.ARENA ? `&arena=${process.env.ARENA}` : '');
  const uid = 'p3_' + (mob ? 'm' : 'pc') + '_' + TAG;
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${q}${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 180000 }).catch(async (e) => { console.log('errs', errs.join(' | ')); await p.screenshot({ path: `${OUT}/boot-fail-${TAG}.png` }); throw e; }); const tHub = Date.now() - t0;
  await sleep(1200);
  await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2500);
  const shot = async (name, x, y, z, wait = 2600) => { await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await p.evaluate((z) => window.__game.debug.setZoom(z), z); await sleep(wait); await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/${name}-${TAG}.png` }); };
  if (SH.includes('stats')) { await sleep(3000); const st = await p.evaluate(() => window.__game.debug.props()); st.tHubMs = tHub; st.requests = reqs; require('fs').writeFileSync(`${OUT}/stats-${TAG}.json`, JSON.stringify(st, null, 1)); console.log('stats', JSON.stringify(st).slice(0, 1500)); }
  if (SH.includes('hub')) await shot('hub-wide', 300, 640, 0.5);
  if (SH.includes('portal')) await shot('portal-close', 212, 622, 1.6);
  if (SH.includes('portalfb')) { // портал целиком: свободная камера на вихре (точка излучения), герой в стороне
    const P = (await p.evaluate(() => window.__game.debug.lightSources())).filter((s) => s.k === 'portal').sort((a, b) => Math.hypot(a.px - 212, a.py - 600) - Math.hypot(b.px - 212, b.py - 600))[0];
    console.log('portal', JSON.stringify(P));
    await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [P.px + 120, P.py + 80]); await sleep(1500); await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [P.px + 120, P.py + 80]); await sleep(1500);
    await p.evaluate((c) => window.__game.debug.freeCam(c), { x: P.x, z: P.z - 3.5, zoom: 0.95 }); await sleep(3000); await p.mouse.move(5, 5);
    await p.screenshot({ path: `${OUT}/portal-full-${TAG}.png` }); await p.evaluate(() => window.__game.debug.freeCam(null)); }
  if (SH.includes('lights')) {
    const L = await p.evaluate(() => window.__game.debug.lightSources()); console.log('lights', JSON.stringify(L.slice(0, 20)));
    const by = {}; for (const s of L) if (s.k && !by[s.k.replace(/_\d+$/, '')]) by[s.k.replace(/_\d+$/, '')] = s;
    for (const [k, s] of Object.entries(by)) await shot('night-' + k, s.px - 60, s.py - 40, 1.3);
  }
  if (SH.includes('arinar')) {
    for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) { await p.evaluate(() => window.__game.debug.tp(240, 610, true)); await sleep(700); await p.evaluate(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
    for (const [n, x, y] of [['ice', 20400, 1200], ['fire', 6000, 8400], ['stone', 13200, 1200], ['air', 34800, 3600]]) await shot('arinar-' + n, x, y, 0.8, 6000);
    const L = await p.evaluate(() => window.__game.debug.lightSources()); const s = L.find((s) => s.k); if (s) await shot('arinar-light-' + s.k, s.px - 60, s.py - 40, 1.3, 4000);
  }
  if (SH.includes('arena')) { // комнаты забега: тот же сид декора → одинаковые позиции в v2/v3
    for (const room of (process.env.ROOMS || 'crypt,abyss,trial').split(',')) {
      if ((await p.evaluate(() => window.__game.state().mode)) !== 'hub') { await p.goto(p.url()); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 180000 }); await sleep(2000); await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(1500); }
      await p.evaluate((r) => window.__game.startRun(r), room);
      await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 60000 }).catch(() => {});
      await sleep(7000); await p.mouse.move(5, 5);
      await p.screenshot({ path: `${OUT}/arena-${room}-${TAG}.png` });
      await p.evaluate(() => window.__game.debug.setZoom(0.4)).catch(() => {}); await sleep(2500);
      await p.screenshot({ path: `${OUT}/arena-${room}-wide-${TAG}.png` });
      // стены и колонны: свободная камера (debug.freeCam) у северной стены и у первой колонны
      const pil = await p.evaluate(async () => { try { const m = await import('/@fs/workspace/mg-props/src/pages/MorrisCurse/_core/survivors/run.js'); return m.PILLARS.slice(0, 2).map((q) => ({ x: q.x, z: q.z })); } catch (e) { return []; } });
      const cams = [['wall', { x: 0, z: -54, zoom: 0.45 }], ...pil.slice(0, 1).map((q) => ['column', { x: q.x, z: q.z + 3, zoom: 0.7 }])];
      for (const [nm, c] of cams) { await p.evaluate((c) => window.__game.debug.freeCam(c), c); await sleep(3000); await p.screenshot({ path: `${OUT}/arena-${room}-${nm}-${TAG}.png` }); }
      await p.evaluate(() => window.__game.debug.freeCam(null));
      const ar = await p.evaluate(() => { const g = window.__game; const st = g.state(); return { mode: st.mode, enemies: st.run?.enemies, sheets: Object.keys(g.debug.props().sheets) }; });
      console.log('arena', room, JSON.stringify(ar));
    }
  }
  const fin = await p.evaluate(() => window.__game.debug.props()); console.log('final sheets', JSON.stringify(fin.sheets));
  console.log('errs', errs.join(' | ') || 0); await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
