// Цветы Дара: подсказка «E — тронуть бутон» только рядом с ВИДИМЫМ бутоном (пиксельный билборд + кольцо), нигде кроме Поляны.
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  const errs = []; let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.stack || e)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Flow&uid=test_r2_flow_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
  const G = (fn, a) => p.evaluate(fn, a);
  await p.waitForTimeout(1500);
  const X = 700, Y = 760;
  await G(([x, y]) => window.__game.debug.teleport(x, y), [X - 200, Y]); await p.waitForTimeout(600);
  const before = (await G(() => window.__game.debug.flowers())).map((f) => f.id);
  await G(([x, y]) => window.__game.debug.plantFlower(x, y), [X, Y]);
  await p.waitForFunction((ids) => window.__game.debug.flowers().some((f) => !ids.includes(f.id)), before, { timeout: 8000 }).catch(() => {});
  const fl = (await G(() => window.__game.debug.flowers())).find((f) => !before.includes(f.id));
  ok(!!fl, 'dev bud planted and synced to client');
  if (fl) {
    await G(([x, y]) => window.__game.debug.teleport(x, y), [fl.x - 30, fl.y]); await p.waitForTimeout(900);
    const pr = await G(() => window.__game.debug.prompt());
    ok(/тронуть бутон/.test(pr), 'near (30 px): prompt shows bud — ' + pr);
    ok(await G((id) => window.__game.debug.flowerVisible(id), fl.id), 'near: bud object rendered and on screen');
    ok(await G((id) => window.__game.debug.flowerHighlighted(id), fl.id), 'near: bud highlighted (ring)');
    await p.screenshot({ path: `${OUT}/desktop-flower-bud-prompt.png` });
    await G(([x, y]) => window.__game.debug.teleport(x, y), [fl.x - 95, fl.y]); await p.waitForTimeout(700);
    const pr2 = await G(() => window.__game.debug.prompt());
    ok(!/бутон|цветок/.test(pr2), 'far (95 px): no flower prompt — "' + pr2 + '"');
    ok(!(await G((id) => window.__game.debug.flowerHighlighted(id), fl.id)), 'far: no highlight');
  }
  // каждый цветок, для которого показывается подсказка, виден на экране
  const all = await G(() => window.__game.debug.flowers());
  let shown = 0, bad = 0;
  for (const f of all) {
    if (f.stage === 'active') continue;
    await G(([x, y]) => window.__game.debug.teleport(x, y), [f.x + 25, f.y]); await p.waitForTimeout(500);
    const pr = await G(() => window.__game.debug.prompt());
    if (/бутон|цветок/.test(pr)) { shown++; if (!(await G((id) => window.__game.debug.flowerVisible(id), f.id))) bad++; }
  }
  ok(bad === 0 && shown > 0, `all flower prompts (${shown}) have a visible flower`);
  // в Аринаре цветов Поляны нет — подсказки быть не может
  await G(() => window.__game.debug.teleport(255, 600)); await p.waitForTimeout(700); await p.keyboard.press('KeyE'); await p.waitForTimeout(3500);
  const w = await G(() => window.__game.state().world);
  if (w === 'arinar' && fl) {
    await G(([x, y]) => window.__game.debug.teleport(x, y), [fl.x - 20, fl.y]); await p.waitForTimeout(800);
    ok(!/бутон|цветок/.test(await G(() => window.__game.debug.prompt())), 'arinar at the same coords: no flower prompt');
  } else ok(false, 'entered arinar (got ' + w + ')');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
