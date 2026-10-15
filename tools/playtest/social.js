// Рейтинг и просмотр персонажа: 2 игрока (десктоп, полноэкранный HUD) + телефон (390×844).
const { chromium, devices } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
const d1 = (sql) => execSync(`cd /workspace/mg-work/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --command ${JSON.stringify(sql)}`, { stdio: 'pipe' });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now();
  const uidA = `test_r2_socA_${T}`;
  d1(`INSERT OR REPLACE INTO users (id, username, created_at) VALUES ('${uidA}', 'Алекс_Тест', ${T})`);
  const open = async (n, uid, ctxOpts = { viewport: { width: 1440, height: 860 } }, extra = '') => {
    const p = await (await b.newContext(ctxOpts)).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&panels=1&debug=1${extra}`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const hero = async (p, cls) => { for (let i = 0; i < 6; i++) { await G(p, (c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1300); if (await G(p, () => !!window.__game.meta?.hero)) break; } };
  const A = await open('Alex', uidA), B = await open('Bob', `test_r2_socB_${T}`);
  await hero(A, 'warrior'); await hero(B, 'mage');
  // A: опыт, снаряжение, Сияние нет — просто раскладка по умолчанию
  await G(A, () => window.__game.debug.rawSend({ type: 'dev_grant', xp: 30000, item: 'fly_blades', flags: { talents_open: 1 } })); await A.waitForTimeout(900);
  await G(A, () => window.__game.debug.rawSend({ type: 'dev_grant', item: 'fly_eyes' })); await A.waitForTimeout(700);
  for (const id of ['fly_blades', 'fly_eyes']) { await G(A, (id) => { const it = window.__game.meta.state.account.inv.find((i) => i.id === id); if (it) window.__game.debug.rawSend({ type: 'equip', uid: it.uid }); }, id); await A.waitForTimeout(500); }
  // рядом друг с другом в хабе
  await G(A, () => window.__game.debug.teleport(600, 660)); await G(B, () => window.__game.debug.teleport(640, 640));
  await B.waitForTimeout(2500);
  // B кликает по A
  const aId = await G(A, () => window.__game.state().myId);
  let clicked = false;
  for (let i = 0; i < 6 && !clicked; i++) {
    const pt = await G(B, (id) => { const o = [...(window.__game.debug.othersInfo?.() || [])]; const me = o.find((x) => x); return me ? window.__game.debug.screenOf(me.x, me.y) : null; }, aId);
    if (pt) { await B.mouse.click(pt.x, pt.y - 6); await B.waitForTimeout(400); }
    clicked = await G(B, () => (() => { const b = document.querySelector('.mc-pmenu'); return !!b && getComputedStyle(b).display !== 'none' && !!b.querySelector('[data-m="insp"]'); })());
  }
  ok(clicked, 'B clicks A in hub → player menu with «👤 Персонаж»'); // верхнюю панель цели убрали (r6) — теперь меню игрока
  await B.locator('.mc-pmenu').screenshot({ path: `${OUT}/social-player-menu.png` }).catch(() => {});
  await B.screenshot({ path: `${OUT}/social-target-full.png` });
  await B.click('.mc-pmenu [data-m="insp"]');
  await B.waitForSelector('.mc-insp .mc-insp-name', { timeout: 6000 }).catch(() => {});
  const ins = await G(B, () => ({ name: document.querySelector('.mc-insp-name')?.textContent, cls: document.querySelector('.mc-insp-cls')?.textContent, gear: document.querySelectorAll('.mc-insp-slot:not(.empty) .mc-ic').length, stats: document.querySelectorAll('.mc-insp-st').length, abs: document.querySelectorAll('.mc-insp-ab').length, talents: /талант/i.test(document.querySelector('.mc-insp')?.textContent || '') }));
  ok(ins.name === 'Алекс_Тест' && /Велес|Воин|warrior/i.test(ins.cls) && ins.gear === 2 && ins.stats >= 10 && ins.abs >= 1 && !ins.talents, 'inspect view: name, hero, 2 gear icons, params, skills, no talent tree ' + JSON.stringify(ins));
  await B.hover('.mc-insp-slot:not(.empty)'); await B.waitForTimeout(200);
  ok(await G(B, () => getComputedStyle(document.querySelector('.mc-insp-slot:not(.empty) .tip')).display === 'block'), 'gear tooltip with stats on hover');
  await B.screenshot({ path: `${OUT}/social-inspect.png` });
  await B.keyboard.press('Escape'); await B.waitForTimeout(300);
  // A бьёт моба (рекорд урона), затем рейтинг
  for (let i = 0; i < 6; i++) { await G(A, () => window.__game.debug.teleport(640, 200)); await A.waitForTimeout(300); for (let k = 0; k < 4; k++) { await G(A, () => window.__game.debug.rawSend({ type: 'zone_attack', dx: 0, dy: -1 })); await A.waitForTimeout(450); } }
  await G(A, () => window.__game.debug.rawSend({ type: 'dev_grant', ratingRefresh: true })); await A.waitForTimeout(1500);
  await A.click('#ghud-rating-btn');
  await A.waitForSelector('.mc-soc-tbl tbody tr', { timeout: 8000 }).catch(() => {});
  const lv = await G(A, () => ({ rows: document.querySelectorAll('.mc-soc-scroll tbody tr').length, me: document.querySelector('.mc-soc-tbl tr.me')?.textContent || '', btnBottom: (() => { const r = document.querySelector('.hud-rating-card').getBoundingClientRect(), c = document.querySelector('.hud-right').getBoundingClientRect(); return Math.round(c.bottom - r.bottom); })() }));
  ok(lv.rows >= 2 && /Алекс_Тест/.test(lv.me), 'rating level tab: rows + own row highlighted ' + JSON.stringify(lv));
  ok(lv.btnBottom < 40, 'rating button at the bottom of the right HUD column');
  await A.screenshot({ path: `${OUT}/social-rating-level.png` });
  await A.click('.mc-soc-tabs [data-tab="dmg"]'); await A.waitForTimeout(300);
  const dm = await G(A, () => ({ rows: document.querySelectorAll('.mc-soc-scroll tbody tr').length, me: document.querySelector('.mc-soc-tbl tr.me')?.textContent || '', mine: document.querySelector('.mc-soc-mine')?.textContent || '' }));
  ok(dm.rows >= 1 && /Алекс_Тест/.test(dm.me) && /Поляна/.test(dm.me), 'rating damage tab: own record with place ' + JSON.stringify(dm));
  await A.screenshot({ path: `${OUT}/social-rating-damage.png` });
  // клик по строке рейтинга → просмотр персонажа (и назад)
  await A.click('.mc-soc-tbl tr.me'); await A.waitForSelector('.mc-insp .mc-insp-name', { timeout: 6000 }).catch(() => {});
  ok(await G(A, () => document.querySelector('.mc-insp-name')?.textContent === 'Алекс_Тест' && !!document.querySelector('.mc-soc-back')), 'rating row → inspect view (with back button)');
  await A.click('.mc-soc-back'); await A.waitForTimeout(300);
  ok(await G(A, () => !!document.querySelector('.mc-soc-tabs')), 'back to rating');
  await A.keyboard.press('Escape');
  // телефон
  const M = await open('Mob', `test_r2_socM_${T}`, { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } });
  await hero(M, 'rogue');
  await G(M, () => window.__game.debug.teleport(620, 680)); await M.waitForTimeout(2000);
  await M.tap('.mc3d-tbtn[data-act="rating"]'); await M.waitForSelector('.mc-soc-tbl tbody tr', { timeout: 8000 }).catch(() => {});
  ok(await G(M, () => document.querySelectorAll('.mc-soc-scroll tbody tr').length >= 2 && document.querySelector('.mc-soc').getBoundingClientRect().right <= innerWidth + 1), 'mobile: 🏆 opens rating, fits screen');
  await M.screenshot({ path: `${OUT}/social-mobile-rating.png` });
  await M.tap('.mc-soc-x'); await M.waitForTimeout(300);
  let chip = false;
  for (let i = 0; i < 6 && !chip; i++) {
    const pt = await G(M, () => { const o = (window.__game.debug.othersInfo?.() || []).find((x) => x.world === window.__game.state().world); return o ? window.__game.debug.screenOf(o.x, o.y) : null; });
    if (pt) { await M.touchscreen.tap(pt.x, pt.y - 6); await M.waitForTimeout(500); }
    chip = await G(M, () => getComputedStyle(document.querySelector('.mc-tchip')).display !== 'none');
  }
  ok(chip, 'mobile: tap another player → target chip with «Посмотреть персонажа»');
  await M.screenshot({ path: `${OUT}/social-mobile-target.png` });
  if (chip) { await M.tap('.mc-tchip .insp'); await M.waitForSelector('.mc-insp .mc-insp-name', { timeout: 6000 }).catch(() => {}); ok(await G(M, () => !!document.querySelector('.mc-insp-name')?.textContent), 'mobile: inspect opens'); await M.screenshot({ path: `${OUT}/social-mobile-inspect.png` }); }
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
