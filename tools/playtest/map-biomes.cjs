// LOCAL: карта M — подписи «биом · ур. мобов» только в разведанных местах. Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/map-biomes', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=MapB&uid=mb_${Date.now()}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await p.waitForTimeout(1000); await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
  }
  await p.waitForFunction(() => window.__game.debug.fog().active, null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(1500);
  const wm = async () => G(() => window.__game.debug.worldMap()); console.log('biomes', JSON.stringify(await G(() => window.__game.debug.biomes())));
  const openMap = async (k) => { await p.keyboard.press('KeyM'); await p.waitForTimeout(500); if (k) { await G((k) => window.__game.debug.mapZoom(k), k); await p.waitForTimeout(400); } };
  await openMap(0.012); let s = await wm();
  ok(s.open, `карта открыта, разведано ${s.pct}%`);
  ok(s.labels.every((l) => !/Кровавые льды|Синее пламя/.test(l)), `до похода: льдов/пламени нет; подписи: ${JSON.stringify(s.labels)}`);
  await p.screenshot({ path: `${OUT}/01-map-before.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  for (const [x, y] of [[22800, 29000], [22800, 30000], [23400, 30600], [18000, 20400], [17400, 20000]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await p.waitForTimeout(1600); }
  await openMap(0.012); s = await wm();
  ok(s.labels.some((l) => /^Кровавые льды: Алый наст 3-5/.test(l)), 'после похода — «Кровавые льды: Алый наст, ур. 3–5»');
  ok(s.labels.some((l) => /^Синее пламя: Тлеющие поля/.test(l)), 'после похода — «Синее пламя: Тлеющие поля»');
  ok(!s.labels.some((l) => /Железные каменоломни|Звёздная высь/.test(l)), 'неразведанные биомы не подписаны');
  console.log('labels', JSON.stringify(s.labels));
  await p.screenshot({ path: `${OUT}/02-map-after-two-biomes.png` });
  await G(() => window.__game.debug.mapZoom(5)); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/03-map-after-zoom-fire.png` });
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
