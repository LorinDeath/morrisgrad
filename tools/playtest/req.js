const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Req&uid=test_r2_req_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
  const G = (fn, a) => p.evaluate(fn, a);
  await p.waitForFunction(() => !!window.__game.meta?.account, null, { timeout: 30000 });
  for (let i = 0; i < 5 && !(await G(() => !!window.__game.meta.hero)); i++) { await G(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500); }
  console.log('hero', await G(() => window.__game.meta.hero?.lvl));
  for (const it of ['spark_imp_helmet', 'fly_legs']) { await G((i) => window.__game.debug.send({ type: 'dev_grant', item: i }), it); await p.waitForTimeout(500); }
  await p.keyboard.press('KeyI'); await p.waitForTimeout(800);
  console.log('items', await p.locator('.mc-item').count(), await G(() => JSON.stringify(window.__game.meta.account?.inv), null)); await p.screenshot({ path: '/tmp/req_dbg.png' });
  const low = p.locator('.mc-item.unmet').first();
  console.log('unmet items', await p.locator('.mc-item.unmet').count());
  await low.click(); await p.waitForTimeout(500);
  const dis = await p.locator('.mc-detail button[disabled]').count();
  const red = await p.locator('.mc-detail .mc-req.bad').innerText().catch(() => '');
  console.log('disabled equip', dis, '| req text:', red);
  await p.screenshot({ path: `${OUT}/desktop-req-01-gear-unmet.png` });
  // library tab
  await p.keyboard.press('KeyL'); await p.waitForTimeout(1200);
  const lib = p.locator('.mc-lib[data-v="spark_imp_helmet"]');
  if (await lib.count()) { await lib.click(); await p.waitForTimeout(500); }
  console.log('library req:', await p.locator('.mc-req.bad').first().innerText().catch(() => 'none'));
  await p.screenshot({ path: `${OUT}/desktop-req-02-library-unmet.png` });
  console.log('errors', errs);
  await b.close();
})();
