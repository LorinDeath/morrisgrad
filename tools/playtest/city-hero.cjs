// LOCAL: обзорные снимки купола Альказака (снаружи/внутри/роза/ворота). Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/hero';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CX = 24624, CY = 3376; let R = 1280;
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const gif = (dir, name, fps = 10) => { try { execFileSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/f%03d.png`, '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', `${OUT}/${name}.gif`]); return fs.statSync(`${OUT}/${name}.gif`).size; } catch (e) { console.log('gif', String(e)); return 0; } };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(assertLocalUrl(`${BASE}?name=hero_t&uid=hero_t&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  const G = (f, a) => p.evaluate(f, a);
  if ((await G(() => window.__game.state().player?.stats?.classId)) == null) { await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  const dev = async (o) => { await G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 8000 }); return G(() => window.__devCity); };
  const dome = () => G(() => window.__game.debug.city().dome);
  const hud = () => G(() => window.__game.debug.city().hud);
  const tp = async (x, y) => { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1800); };
  const cells = (c) => G((c) => window.__game.debug.setCells(c), c);
  // обзорные кадры купола: снаружи (оболочка 0.9, обод, свечение), внутри (0.02), роза у кадки
  for (const [n, x, y, c, wait] of [['h1-outside-south-wide', CX, CY + R + 620, 110, 5000], ['h2-outside-east-wide', CX + R + 620, CY, 110, 4000], ['h3-inside-center-wide', CX, CY + 120, 70, 4000], ['h4-rose-planter', 24624, 3300, 14, 3000], ['h5-west-gate', CX - R + 60, CY, 40, 3000]]) {
    await tp(x, y); await G(([c]) => window.__game.debug.setCells(c, true), [c]); await sleep(wait);
    const d = await G(() => window.__game.debug.city().dome); console.log(n, JSON.stringify({ shellA: d.shellA, props: d.props }));
    await p.screenshot({ path: `${OUT}/${n}.png` });
  }
  const rose = await G(() => { const g = window.__game; const r = g.debug.bm?.()?.roses || g.debug.roses?.() || null; return r; }).catch(() => null);
  console.log('roses(client)', JSON.stringify(rose)?.slice(0, 400));
  console.log('errors', errs.slice(0, 3)); await b.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
