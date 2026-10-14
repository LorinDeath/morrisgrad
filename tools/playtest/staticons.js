// Иконки характеристик: 32 px в окне героя, 16 px в подсказке предмета. Скриншоты → /workspace/morrisgrad-round2/stat-icons-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=StI&uid=test_r2_sti_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__game.book.toggle('hero')); await p.waitForTimeout(800);
  const big = await p.$$eval('.mc-stats .mc-sti', (a) => a.map((e) => [e.dataset.st, e.offsetWidth]));
  ok(big.length >= 9 && big.every(([, w]) => w === 32), `hero window: ${big.length} stat icons 32px (${big.map((x) => x[0]).join(',')})`);
  const loaded = await p.evaluate(async () => { const u = getComputedStyle(document.querySelector('.mc-sti')).backgroundImage.slice(5, -2); const i = new Image(); i.src = u; await i.decode(); return [i.naturalWidth, getComputedStyle(document.querySelector('.mc-sti')).imageRendering]; });
  ok(loaded[0] === 256 && /pixelated|crisp/.test(loaded[1]), `32px sheet loaded ${loaded[0]}px wide, ${loaded[1]}`);
  await p.locator('.mc-book').screenshot({ path: `${OUT}/stat-icons-hero-32.png` });
  await p.evaluate(() => window.__game.book.toggle('craft')); await p.waitForTimeout(800); // рецепты — строки статов предметов
  const small = await p.$$eval('.mc-book .mc-sti', (a) => a.map((e) => e.offsetWidth));
  ok(small.length >= 1 && small.every((w) => w === 16), `craft item stat rows: ${small.length} stat icons 16px`);
  await p.locator('.mc-book').screenshot({ path: `${OUT}/stat-icons-items-16.png` });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
