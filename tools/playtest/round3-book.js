// Раунд 3: Библиотека/Бестиарий/Кодекс — прокрутка не сбрасывается при выборе, сортировка по уровню, «Отслеживать», все навыки в Кодексе
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  await p.keyboard.press('k'); await p.waitForTimeout(400);
  const openTab = async (id) => { await p.evaluate((id) => document.querySelector(`.mc-book-tabs [data-v="${id}"]`)?.click(), id); await p.waitForTimeout(1500); };
  // Библиотека: прокрутка сетки
  await openTab('library');
  const scrollEl = await p.evaluate(() => { const c = [document.querySelector('.mc-libgrid'), document.querySelector('.mc-book-body')].find((e) => e && e.scrollHeight > e.clientHeight + 20); if (!c) return null; c.scrollTop = 400; return c.className; });
  await p.waitForTimeout(200);
  const before = await p.evaluate(() => { const e = [document.querySelector('.mc-libgrid'), document.querySelector('.mc-book-body')].find((e) => e && e.scrollTop > 0); return e ? e.scrollTop : 0; });
  const btn = await p.evaluateHandle(() => [...document.querySelectorAll('.mc-lib[data-act="lsel"]')].find((e) => { const r = e.getBoundingClientRect(); return r.top > 100 && r.bottom < 800; }));
  if (btn.asElement()) { await btn.asElement().click(); await p.waitForTimeout(1200); }
  const after = await p.evaluate(() => { const e = [document.querySelector('.mc-libgrid'), document.querySelector('.mc-book-body')].find((e) => e && e.scrollTop > 0); return e ? e.scrollTop : 0; });
  ok(!scrollEl || (before > 0 && Math.abs(after - before) < 5), `Библиотека: прокрутка ${before} → ${after} после выбора (${scrollEl})`);
  await p.evaluate(() => document.querySelector('[data-act="lvlsort"]')?.click()); await p.waitForTimeout(500);
  ok(await p.$('[data-act="lvlsort"]') && /↓/.test(await p.$eval('[data-act="lvlsort"]', (e) => e.textContent)), 'сортировка по уровню переключается ↑/↓');
  await p.screenshot({ path: `${OUT}/r3-library-sort.png` });
  // Бестиарий: открыть встреченного, «Отслеживать»
  await openTab('bestiary');
  const has = await p.evaluate(() => { const h = document.querySelector('.mc-beast-h'); if (h) h.click(); return !!h; }); await p.waitForTimeout(800);
  const tb = await p.$('[data-act="mtrack"]');
  ok(has && !!tb, 'в Бестиарии у моба есть «Отслеживать»');
  if (tb) { await tb.click(); await p.waitForTimeout(600); const t = await G(() => window.__game.meta?.mobTrack ?? null).catch(() => null); ok(/Не отслеживать/.test(await p.$eval('[data-act="mtrack"]', (e) => e.textContent)), 'отслеживание включено (кнопка → «Не отслеживать»)'); }
  const stTxt = await p.$eval('.mc-beast .s', (e) => e.textContent).catch(() => '');
  ok(/ОЗ \d+/.test(stTxt), 'статы моба с сервера: ' + stTxt);
  await p.screenshot({ path: `${OUT}/r3-bestiary-track.png` });
  // Кодекс
  await openTab('runskills');
  const head = await p.$eval('.mc-rs-head b', (e) => e.textContent).catch(() => '');
  const n = Number((head.match(/\/(\d+)/) || [])[1] || 0);
  ok(n >= 24 + 14 + 9, 'Кодекс: все навыки — ' + head);
  await p.screenshot({ path: `${OUT}/r3-codex.png` });
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
