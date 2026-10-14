// Настройки картинки: ползунки «Мрачность», «Дымка вдали», «Единый стиль» у обычного игрока (не админа), сохранение,
// сброс, телефон — «Единый стиль» по умолчанию 0. Только локально.
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const run = async (opts, uid, tag) => {
    const ctx = await b.newContext(opts); await guardLocal(ctx); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Игрок&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1`)); // без debug, обычный игрок
    await p.waitForFunction(() => document.querySelector('.mc-setbtn, .mc3d-tbtn'), null, { timeout: 120000 }); await p.waitForTimeout(2500);
    // ПК — кнопка ⚙️; телефон — 👥 → вкладка «Настройки»
    if (opts.isMobile) { await p.tap('.mc3d-tbtn[data-act="people"]'); await p.waitForSelector('[data-view="settings"]', { timeout: 15000 }); await p.tap('[data-view="settings"]'); } else await p.click('.mc-setbtn', { force: true }); await p.waitForSelector('[data-grim]', { timeout: 15000 }); await p.waitForTimeout(600);
    const vals = await p.$$eval('[data-grim]', (rs) => Object.fromEntries(rs.map((r) => [r.dataset.grim, Number(r.value)])));
    await p.screenshot({ path: `${OUT}/settings-visual-${tag}.png` });
    return { ctx, p, vals, errs };
  };
  let r = await run({ viewport: { width: 1440, height: 860 } }, 'pt_plain_user', 'desktop');
  ok(['grim', 'fog', 'style'].every((k) => k in r.vals), 'обычный игрок: все три ползунка ' + JSON.stringify(r.vals));
  ok(r.vals.style === 50, 'ПК: «Единый стиль» по умолчанию 50');
  await r.p.$eval('[data-grim="style"]', (e) => { e.value = 20; e.dispatchEvent(new Event('input', { bubbles: true })); });
  ok(await r.p.evaluate(() => localStorage.getItem('mc-style')) === '20' && (await r.p.$eval('[data-grimv="style"]', (e) => e.textContent)) === '20%', 'сохранено на устройстве, подпись 20%');
  await r.p.click('[data-act="grimreset"]'); await r.p.waitForTimeout(500);
  ok((await r.p.$eval('[data-grim="style"]', (e) => Number(e.value))) === 50, 'сброс к стандартным');
  ok(!r.errs.length, 'ПК: без ошибок ' + r.errs.join('|')); await r.ctx.close();
  r = await run({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, 'pt_plain_phone', 'mobile');
  ok(r.vals.style === 0, 'телефон: «Единый стиль» по умолчанию 0 (выкл.)');
  ok(!r.errs.length, 'телефон: без ошибок ' + r.errs.join('|')); await r.ctx.close();
  console.log(fails ? `FAILED ${fails}` : 'settings ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
