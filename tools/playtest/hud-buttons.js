// Хотфикс: кнопки HUD (Рейтинг / Онлайн / Друзья / ⚙ в боковой панели; 🤝 ⚙ 📖 🏆 👥 внизу слева; на телефоне — столбец кнопок)
// нажимаются НАСТОЯЩИМИ кликами мыши/тапами (без вызовов JS) и открывают свои окна; поле чата не перекрыто панелью навыков.
// U=<url страницы> — проверить другую сборку (например, продовую сборку astro через wrangler dev). Скриншоты → /workspace/morrisgrad-round2/
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
const { assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const BASE = process.env.U ? assertLocalUrl(process.env.U) : null; // только локальная сборка: прод из плейтеста не трогаем
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (mobile) => {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' } : { viewport: { width: 1440, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    if (BASE) { for (let i = 0; i < 4; i++) { const r = await p.goto(BASE, { waitUntil: 'load', timeout: 60000 }).catch(() => null); if (r && r.ok()) break; await p.waitForTimeout(1500); } await p.waitForTimeout(2500); await p.locator('text=Начать игру').first().click(); }
    else await p.goto(`http://127.0.0.1:5199/game.html?name=Hud${mobile ? 'M' : 'D'}&uid=hud_${Date.now()}&ws=ws://127.0.0.1:8787${mobile ? '' : '&fs=1&panels=1'}`); // боковые панели сайта (рейтинг/онлайн/друзья/⚙) — только с panels=1
    await p.waitForSelector(mobile ? '.mc3d-ttop .mc3d-tbtn:not([data-act="home"])' : '.mc-abar', { timeout: 90000 }); await p.waitForTimeout(4000);
    return p;
  };
  const screen = (p) => p.evaluate(() => { const s = document.querySelector('.mc3d-screen'); const bk = [...document.querySelectorAll('[class*=mc-book]')].find((e) => e.offsetParent && e.getBoundingClientRect().height > 200);
    return s ? s.textContent.trim().slice(0, 24) : bk ? 'BOOK' : ''; });
  const press = async (p, sel, mobile) => {
    const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded().catch(() => {}); const bb = await el.boundingBox();
    if (!bb) return null;
    const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
    if (mobile) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
    await p.waitForTimeout(900); return screen(p);
  };
  const close = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(250); if (await screen(p)) { const x = p.locator('.mc-soc-x, .mc3d-screen .mc3d-btn.ghost').first(); if (await x.count()) await x.click().catch(() => {}); await p.waitForTimeout(250); } };

  // ПК: боковая панель + нижний левый ряд
  const D = await open(false);
  const desk = [['#ghud-rating-btn', /РЕЙТИНГ/, 'боковая «Рейтинг игроков»'], ['#ghud-online-btn', /ИГРОКИ/, 'боковая «Онлайн»'], ['#ghud-friends-btn', /ДРУЗЬЯ/, 'боковая «Друзья»'], ['#ghud-set-btn', /НАСТРОЙКИ/, 'боковая ⚙'],
    ['.mc-friendsbtn', /ДРУЗЬЯ/, 'нижняя 🤝'], ['.mc-setbtn', /НАСТРОЙКИ/, 'нижняя ⚙'], ['.mc-bookbtn', /BOOK|Книга/i, 'нижняя 📖'], ['.mc-ratebtn:not(.mc-onlinebtn):not(.mc-friendsbtn):not(.mc-setbtn)', /РЕЙТИНГ/, 'нижняя 🏆'], ['.mc-onlinebtn', /ИГРОКИ/, 'нижняя 👥']];
  for (const [sel, re, name] of desk) {
    const got = await press(D, sel, false); ok(got !== null && re.test(got || ''), `ПК ${name}: клик мышью открывает окно (${got === null ? 'кнопки нет' : got || 'ничего'})`);
    if (sel === '#ghud-friends-btn') await D.screenshot({ path: `${OUT}/hud-btn-friends.png` });
    if (sel === '.mc-setbtn') await D.screenshot({ path: `${OUT}/hud-btn-settings.png` });
    if (sel === '.mc-bookbtn') await D.screenshot({ path: `${OUT}/hud-btn-book.png` });
    await close(D);
  }
  // повторный клик по открытой кнопке закрывает окно (переключатель)
  await press(D, '#ghud-online-btn', false); const again = await press(D, '#ghud-online-btn', false); ok(!again, 'повторный клик «Онлайн» закрывает окно'); await close(D);
  // чат: поле над панелью навыков, не перекрыто, кликабельно
  await D.keyboard.press('Enter'); await D.waitForTimeout(400);
  const ov = await D.evaluate(() => { const i = document.querySelector('.mc3d-chat input').getBoundingClientRect(); const bars = [...document.querySelectorAll('.mc-abar, .mc3d-slots, .mc3d-abilities')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    const hit = bars.some((r) => r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top);
    const top = document.elementFromPoint(i.left + i.width / 2, i.top + i.height / 2); return { hit, topIsInput: top?.tagName === 'INPUT', y: Math.round(i.top), h: Math.round(i.height) }; });
  ok(!ov.hit && ov.topIsInput, `ПК: поле чата не перекрывает панель навыков и сверху всех (${JSON.stringify(ov)})`);
  await D.keyboard.type('Видно поле чата'); await D.screenshot({ path: `${OUT}/chat-input-fixed.png` }); await D.keyboard.press('Escape');

  // телефон: столбец кнопок + чат
  const M = await open(true);
  const mob = [['.mc3d-tbtn[data-act="book"]', /BOOK|Книга/i, '📖'], ['.mc3d-tbtn[data-act="rating"]', /РЕЙТИНГ/, '🏆'], ['.mc3d-tbtn[data-act="people"]', /ИГРОКИ/, '👥']];
  for (const [sel, re, name] of mob) { const got = await press(M, sel, true); ok(got !== null && re.test(got || ''), `телефон ${name}: тап открывает окно (${got === null ? 'кнопки нет' : got || 'ничего'})`); if (name === '👥') await M.screenshot({ path: `${OUT}/hud-btn-mobile-people.png` }); await close(M); }
  await press(M, '.mc3d-tbtn[data-act="chat"]', true); await M.waitForTimeout(300);
  const ovm = await M.evaluate(() => { const i = document.querySelector('.mc3d-chat input').getBoundingClientRect(); const els = [...document.querySelectorAll('.mc-abar, .mc3d-tpad, .mc3d-tbtn, .mc3d-tact')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    const top = document.elementFromPoint(i.left + i.width / 2, i.top + i.height / 2); return { vis: i.width > 0, topIsInput: top?.tagName === 'INPUT', hit: els.some((r) => r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top) }; });
  ok(ovm.vis && ovm.topIsInput && !ovm.hit, `телефон: поле чата видно и не перекрыто (${JSON.stringify(ovm)})`);
  await M.screenshot({ path: `${OUT}/chat-input-fixed-mobile.png` });
  ok(!errs.length, 'без ошибок страницы ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
