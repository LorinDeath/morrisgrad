// B — книга-меню, кнопка 🧙 «Персонаж (C)» рядом с 📖 «Меню (B)»; реальные клики/клавиши. Скриншоты → /workspace/morrisgrad-round3/
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = []; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await b.newPage({ viewport: { width: 1440, height: 860 } }); p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:5199/game.html?name=HudBC&ws=ws://127.0.0.1:8787&fs=1&debug=1');
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(3000);
  const vis = (s) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, s);
  const t = await p.evaluate(() => ({ book: document.querySelector('.mc-bookbtn:not(.mc-charbtn)')?.title, ch: document.querySelector('.mc-charbtn')?.title }));
  ok(t.book === 'Меню (B)' && t.ch === 'Персонаж (C)', 'подсказки ' + JSON.stringify(t));
  const r = await p.evaluate(() => [...document.querySelectorAll('.mc-bookbtn, .mc-ratebtn')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => { const q = e.getBoundingClientRect(); return [e.className, q.left, q.top, q.right, q.bottom]; }));
  const ov = r.some((a, i) => r.some((c, j) => j > i && a[1] < c[3] && c[1] < a[3] && a[2] < c[4] && c[2] < a[4]));
  ok(!ov, 'кнопки HUD не перекрываются ' + r.map((x) => x[0].split(' ').pop() + '@' + Math.round(x[1])).join(' '));
  await p.mouse.click(720, 430); await p.keyboard.press('KeyB'); await p.waitForTimeout(600);
  ok(await vis('.mc-book'), 'B открывает книгу-меню'); await p.screenshot({ path: `${OUT}/hud-bc-1-book.png` });
  await p.keyboard.press('KeyB'); await p.waitForTimeout(500); ok(!(await vis('.mc-book')), 'B закрывает книгу');
  await p.hover('.mc-charbtn'); await p.waitForTimeout(300);
  const cb = await (await p.$('.mc-charbtn')).boundingBox(); await p.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); await p.waitForTimeout(800);
  ok(await vis('.mc-charsheet'), 'кнопка 🧙 открывает лист персонажа'); await p.screenshot({ path: `${OUT}/hud-bc-2-charsheet.png` });
  await p.keyboard.press('KeyC'); await p.waitForTimeout(600); ok(!(await vis('.mc-charsheet')), 'C закрывает лист (окно модальное, кнопку перекрывает фон)');
  await p.screenshot({ path: `${OUT}/hud-bc-3-buttons.png`, clip: { x: 0, y: 860 - 160, width: 360, height: 160 } });
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await m.goto('http://127.0.0.1:5199/game.html?name=HudBCm&ws=ws://127.0.0.1:8787&fs=1&debug=1'); await m.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  ok(await m.evaluate(() => getComputedStyle(document.querySelector('.mc-charbtn')).display === 'none'), 'телефон: кнопка скрыта, как и 📖');
  ok(!errs.length, 'без ошибок страницы ' + errs.join('|')); console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
