// LOCAL: нападение на самого Чёрного мага — барьер вокруг мага, напавший вытолкнут (с 7 клеток — большой купол, вблизи — малая сфера,
// повторный удар изнутри — снова вон); убегающего маг догоняет рывком. Только 127.0.0.1 (guardLocal).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/blacken-visuals';
const BASE = process.env.BM_BASE || 'http://127.0.0.1:5293/game.html', WS = process.env.BM_WS || 'ws://127.0.0.1:8879';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), TL = 32;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"dev_bm"')) try { p.dev = JSON.parse(s); } catch {} }));
  const uid = 'bm_chase_' + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.send(x), o);
  for (let i = 0; i < 12 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(1500); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  const bm = async (o) => { p.dev = null; await S({ type: 'dev_grant', bm: o }); for (let i = 0; i < 40 && !p.dev; i++) await sleep(100); return p.dev; };
  const tp = async (x, y) => { await G(([a, c]) => window.__game.debug.tp(a, c, true), [x, y]); await sleep(700); };
  const me = () => G(() => window.__game.state().player);
  const SP = (await bm({ openSpot: 1100 })).spot; ok(!!SP, 'открытое место ' + JSON.stringify(SP));
  const MX = SP.x, MY = SP.y; await bm({ at: { x: MX, y: MY }, calm: 1, clearDomes: 1 });
  await G(() => window.__game.debug.setCells?.(18));
  // 1) удар по магу с 7 клеток → большой купол вокруг мага, напавший вытолкнут за край (+1 клетка)
  await tp(MX - 7 * TL, MY); let d = await bm({ aggro: 1 }); await sleep(1200);
  let c = d.info.cast_c, pl = await me(), dist = Math.hypot(pl.x - MX, pl.y - MY);
  ok(c && Math.hypot(c.x - MX, c.y - MY) < 4, 'удар с 7 клеток: большой купол с магом в центре ' + JSON.stringify(c));
  ok(dist >= 8 * TL + 28 + TL - 2, `напавший вытолкнут: ${(dist / TL).toFixed(1)} кл. от центра (край 8 + 1.9)`);
  await p.screenshot({ path: `${OUT}/mage-1-self-attack-big-dome.png` });
  // 2) попытка войти и ударить изнутри — снова вон
  await tp(MX - 3 * TL, MY); await sleep(400); pl = await me(); const back = Math.hypot(pl.x - MX, pl.y - MY);
  ok(back >= 8 * TL, `войти обратно нельзя: ${(back / TL).toFixed(1)} кл.`);
  await bm({ aggro: 1 }); await sleep(800); pl = await me(); ok(Math.hypot(pl.x - MX, pl.y - MY) >= 8 * TL + 28, 'повторный удар — снова за краем');
  // 3) вблизи без купола → малая сфера, вытолкнут
  await bm({ clearDomes: 1, calm: 1 }); await tp(MX - 2 * TL, MY); await sleep(300); d = await bm({ aggro: 1, smallCd: 0 }); await sleep(900);
  c = d.info.cast_s; pl = await me(); dist = Math.hypot(pl.x - MX, pl.y - MY);
  ok(c && Math.hypot(c.x - MX, c.y - MY) < 4, 'удар вблизи: малая сфера вокруг мага'); ok(dist >= 2.5 * TL + 28 + TL - 2, `вытолкнут из сферы: ${(dist / TL).toFixed(1)} кл.`);
  await p.screenshot({ path: `${OUT}/mage-2-self-attack-small.png` });
  // 4) убегает на 25 клеток — рывок к нему
  await bm({ clearDomes: 1 }); const b0 = (await bm({})).info.blinks || 0;
  await tp(MX + 25 * TL, MY); await sleep(1500);
  d = await bm({}); pl = await me(); const md = Math.hypot(pl.x - d.info.x, pl.y - d.info.y);
  ok((d.info.blinks || 0) > b0 && md < 9 * TL, `рывок: маг в ${(md / TL).toFixed(1)} кл. от убегающего (рывков ${d.info.blinks})`);
  await p.screenshot({ path: `${OUT}/mage-3-blink-chase.png` });
  await tp(MX + 60 * TL, MY + 10 * TL); await sleep(6500); d = await bm({}); pl = await me();
  ok(Math.hypot(pl.x - d.info.x, pl.y - d.info.y) < 12 * TL && d.info.aggro > 0, `убежал на 60 клеток — маг всё равно рядом (${(Math.hypot(pl.x - d.info.x, pl.y - d.info.y) / TL).toFixed(1)} кл.), помнит`);
  await bm({ calm: 1, clearDomes: 1 });
  ok(!p.errs.length, 'без ошибок страницы ' + p.errs.join(' | '));
  console.log(fails ? `FAILED ${fails}` : 'mage-chase ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
