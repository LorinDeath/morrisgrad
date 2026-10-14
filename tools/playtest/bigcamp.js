// Большой лагерь: 2–3 пачки + вожак(и) (золотое кольцо, крупнее) — видно на камере 30 клеток. Скриншот arinar-big-camp.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Camp&uid=test_camp_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
  }
  const CX = 24746, CY = 26870; // лагерь: 3 пачки + 2 вожака (сид мира ZONE_GEN.seed)
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [CX, CY + 120]); await p.waitForTimeout(4500);
  await G(() => window.__game.debug.setCells(30)); await p.waitForTimeout(1500);
  const mobs = await G(() => window.__game.debug.zoneMobs());
  const near = mobs.filter((m) => Math.hypot(m.x - CX, m.y - CY) < 320), chiefs = near.filter((m) => m.chief);
  ok(near.length >= 6, `лагерь: ${near.length} мобов в радиусе 320 px (${[...new Set(near.map((m) => m.type))].join(', ')})`);
  ok(chiefs.length === 2, `вожаков: ${chiefs.length} (${chiefs.map((m) => m.type).join(', ')})`);
  const all = mobs.length; console.log(JSON.stringify(near)); ok(all >= 7, `вокруг на экране 30 клеток: ${all} мобов`);
  await p.screenshot({ path: `${OUT}/arinar-big-camp.png` });
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
