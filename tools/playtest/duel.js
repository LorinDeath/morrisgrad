// PvP-дуэль в браузере: 2 игрока (десктоп) — панель «ЦЕЛЬ» со статами сервера, вызов, принятие, отсчёт на арене,
// бой мышью, результат, возврат в Аринар, вкладка «Дуэлянты»; затем телефон (390×844) против десктопа: вызов с плашки,
// отсчёт, сдача, экран результата.
const { chromium, devices } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
const d1 = (sql) => execSync(`cd /workspace/mg-work/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --command ${JSON.stringify(sql)}`, { stdio: 'pipe' });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now();
  const uidA = `test_r2_duelA_${T}`, uidB = `test_r2_duelB_${T}`, uidM = `test_r2_duelM_${T}`, uidD = `test_r2_duelD_${T}`;
  d1(`INSERT OR REPLACE INTO users (id, username, created_at) VALUES ('${uidA}', 'Алекс_Тест', ${T}), ('${uidB}', 'Боб_Тест', ${T}), ('${uidM}', 'Мобильный', ${T}), ('${uidD}', 'Дэн_Тест', ${T})`);
  const open = async (n, uid, ctxOpts = { viewport: { width: 1440, height: 860 } }) => {
    const p = await (await b.newContext(ctxOpts)).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&panels=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const hero = async (p, cls) => { for (let i = 0; i < 6; i++) { await G(p, (c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1300); if (await G(p, () => !!window.__game.meta?.hero)) break; } };
    const A = await open('Alex', uidA), B = await open('Bob', uidB);
  await hero(A, 'warrior'); await hero(B, 'mage');
  await G(A, () => window.__game.debug.rawSend({ type: 'dev_grant', xp: 30000, item: 'fly_blades' })); await A.waitForTimeout(900);
  await G(A, () => { const it = window.__game.meta.state.account.inv.find((i) => i.id === 'fly_blades'); if (it) window.__game.debug.rawSend({ type: 'equip', uid: it.uid }); }); await A.waitForTimeout(700);
  await G(A, () => window.__game.debug.teleport(600, 660)); await G(B, () => window.__game.debug.teleport(640, 640));
  await B.waitForTimeout(2500);
  // ——— A1: панель «ЦЕЛЬ» — статы сервера ———
  let clicked = false;
  for (let i = 0; i < 6 && !clicked; i++) {
    const pt = await G(B, () => { const o = (window.__game.debug.othersInfo?.() || [])[0]; return o ? window.__game.debug.screenOf(o.x, o.y) : null; });
    if (pt) { await B.mouse.click(pt.x, pt.y - 6); await B.waitForTimeout(400); }
    clicked = await G(B, () => (() => { const b = document.querySelector('.mc-pmenu'); return !!b && getComputedStyle(b).display !== 'none' && !!b.querySelector('[data-m="duel"]'); })());
  }
  ok(clicked, 'B clicks A → player menu with «⚔️ Вызвать на дуэль»'); // панель «ЦЕЛЬ» убрана в r6
  await B.waitForTimeout(600);
  await B.locator('.mc-pmenu').screenshot({ path: `${OUT}/duel-player-menu.png` }).catch(() => {});
  // ——— вызов ———
  await B.click('.mc-pmenu [data-m="duel"]');
  await A.waitForSelector('.mc-duel-card.inv', { timeout: 5000 }).catch(() => {});
  ok(await G(A, () => /Bob|Боб/.test(document.querySelector('.mc-duel-card.inv')?.textContent || '')), 'A sees challenge prompt from B');
  ok(await G(B, () => !!document.querySelector('.mc-duel-card.pend')), 'B sees «Вызов отправлен»');
  await A.waitForTimeout(500);
  await A.screenshot({ path: `${OUT}/duel-challenge-prompt.png` });
  await A.locator('.mc-duel-card.inv').screenshot({ path: `${OUT}/duel-challenge-card.png` });
  await A.locator('.mc-duel-card.inv .ok').dispatchEvent('pointerdown');
  await A.waitForFunction(() => window.__game.state().world === 'arena', null, { timeout: 5000 }).catch(() => {});
  await B.waitForFunction(() => window.__game.state().world === 'arena', null, { timeout: 5000 }).catch(() => {});
  ok(await G(A, () => window.__game.state().world === 'arena') && await G(B, () => window.__game.state().world === 'arena'), 'both in the arena');
  await A.waitForTimeout(700);
  const cd = await G(A, () => ({ txt: document.querySelector('.mc-duel-cd')?.textContent, show: document.querySelector('.mc-duel-cd')?.classList.contains('show'), hud: !!document.querySelector('.mc-duel-hud') }));
  ok(cd.hud && cd.show && /^[123]$/.test(cd.txt), 'countdown visible ' + JSON.stringify(cd));
  await A.screenshot({ path: `${OUT}/duel-countdown.png` });
  // во время отсчёта клавиши движения не двигают
  const x0 = await G(A, () => window.__game.debug.pos().x);
  await A.keyboard.down('d'); await A.waitForTimeout(400); await A.keyboard.up('d');
  const x1 = await G(A, () => window.__game.debug.pos().x);
  ok(x0 === undefined || Math.abs(x1 - x0) < 1, `no movement during countdown (${x0} → ${x1})`);
  await A.waitForFunction(() => document.querySelector('.mc-duel-cd')?.textContent === 'БОЙ!', null, { timeout: 5000 }).catch(() => {});
  ok(await G(A, () => document.querySelector('.mc-duel-cd')?.textContent === 'БОЙ!'), '«БОЙ!» after countdown');
  // A идёт к B и бьёт мышью (зажата ЛКМ на сопернике); B отвечает
  const toward = async (p) => G(p, () => { const o = (window.__game.debug.othersInfo?.() || []).find((x) => x.world === 'arena'); return o && o.x < window.__game.debug.pos().x ? 'a' : 'd'; });
  // идём до сближения (под swiftshader fps низкий — фиксированных 1.3 с не хватало, воин оставался в 200 px)
  const gap = () => G(A, () => { const o = (window.__game.debug.othersInfo?.() || []).find((x) => x.world === 'arena'), me = window.__game.debug.pos(); return o ? Math.abs(o.x - me.x) : 0; });
  const k = await toward(A); await A.keyboard.down(k); for (let i = 0; i < 40 && (await gap()) > 60; i++) await A.waitForTimeout(150); await A.keyboard.up(k);
  const hold = async (p) => { const pt = await G(p, () => { const o = (window.__game.debug.othersInfo?.() || []).find((x) => x.world === 'arena'); return o ? window.__game.debug.screenOf(o.x, o.y) : null; }); if (pt) { await p.mouse.move(pt.x, pt.y - 10); await p.mouse.down(); } return pt; };
  await hold(A); await hold(B);
  await A.waitForFunction(() => [...document.querySelectorAll('.mc-duel-hud .hp span')].some((x) => { const [a, m] = x.textContent.split(' / ').map(Number); return a < m; }), null, { timeout: 8000 }).catch(() => {});
  await A.screenshot({ path: `${OUT}/duel-fight.png` });
  const hpMid = await G(A, () => [...document.querySelectorAll('.mc-duel-hud .hp span')].map((x) => x.textContent));
  ok(hpMid.length === 2 && hpMid.some((t) => { const [a, m] = t.split(' / ').map(Number); return a < m; }), 'fight: HP bars drop ' + JSON.stringify(hpMid));
  let res = null;
  for (let i = 0; i < 60 && !res; i++) { await A.waitForTimeout(500); await A.mouse.up(); await hold(A); res = await G(A, () => document.querySelector('.mc-duel-res .big')?.textContent || null); }
  await A.mouse.up(); await B.mouse.up();
  const resB = await G(B, () => document.querySelector('.mc-duel-res .big')?.textContent || null);
  ok(res && resB && ((res === 'ПОБЕДА' && resB === 'ПОРАЖЕНИЕ') || (res === 'ПОРАЖЕНИЕ' && resB === 'ПОБЕДА')), `result screens: A ${res}, B ${resB}`);
  await A.waitForTimeout(800);
  await A.screenshot({ path: `${OUT}/duel-result.png` });
  await B.screenshot({ path: `${OUT}/duel-result-other.png` });
  ok(await G(A, () => window.__game.state().world === 'arinar') && await G(B, () => window.__game.state().world === 'arinar'), 'both back in Arinar');
  await A.click('.mc-duel-screen .mc3d-btn'); await B.click('.mc-duel-screen .mc3d-btn');
  // ——— рейтинг «Дуэлянты» ———
  await G(A, () => window.__game.debug.rawSend({ type: 'dev_grant', ratingRefresh: true })); await A.waitForTimeout(1500);
  await A.click('#ghud-rating-btn'); await A.waitForSelector('.mc-soc-tabs', { timeout: 8000 }).catch(() => {});
  await A.click('.mc-soc-tabs [data-tab="duel"]'); await A.waitForTimeout(400);
  const du = await G(A, () => ({ rows: document.querySelectorAll('.mc-soc-scroll tbody tr').length, me: document.querySelector('.mc-soc-tbl tr.me')?.textContent || '', head: document.querySelector('.mc-soc-tbl thead')?.textContent || '' }));
  ok(du.rows >= 2 && /Алекс_Тест/.test(du.me) && /П\/П/.test(du.head), 'rating «Дуэлянты» tab: rows + own row ' + JSON.stringify(du));
  await A.screenshot({ path: `${OUT}/duel-rating-tab.png` });
  await A.keyboard.press('Escape');
  // ——— телефон против A ———
  const M = await open('Mob', uidM, { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } });
  await hero(M, 'rogue');
  // соперник телефона — новый десктопный игрок на Поляне (A и B уже в Аринаре)
  const D = await open('Dan', uidD); await hero(D, 'warrior');
  ok(await G(D, () => window.__game.state().world) === await G(M, () => window.__game.state().world), 'desktop D and phone in the same world');
  await G(D, () => window.__game.debug.teleport(1000, 420)); await G(M, () => window.__game.debug.teleport(1000, 480)); await M.waitForTimeout(2200);
  let chip = false;
  for (let i = 0; i < 8 && !chip; i++) {
    const pt = await G(M, () => { const o = (window.__game.debug.othersInfo?.() || []).find((x) => x.world === window.__game.state().world); return o ? window.__game.debug.screenOf(o.x, o.y) : null; });
    if (pt) { await M.touchscreen.tap(pt.x, pt.y - 6); await M.waitForTimeout(500); }
    chip = await G(M, () => getComputedStyle(document.querySelector('.mc-tchip')).display !== 'none' && getComputedStyle(document.querySelector('.mc-tchip .duel')).display !== 'none');
  }
  ok(chip, 'mobile: tap player → chip with «⚔️ Дуэль»');
  await M.screenshot({ path: `${OUT}/duel-mobile-target.png` });
  await M.tap('.mc-tchip .duel');
  await D.waitForSelector('.mc-duel-card.inv', { timeout: 6000 }).catch(() => {});
  ok(await G(D, () => !!document.querySelector('.mc-duel-card.inv')), 'desktop receives challenge from phone');
  await D.locator('.mc-duel-card.inv .ok').dispatchEvent('pointerdown').catch(() => {});
  await M.waitForSelector('.mc-duel-hud', { timeout: 6000 }).catch(() => {});
  await M.waitForTimeout(600);
  const mh = await G(M, () => { const r = document.querySelector('.mc-duel-hud')?.getBoundingClientRect(); return r ? { l: r.left, r: r.right, w: innerWidth, cd: document.querySelector('.mc-duel-cd')?.textContent } : null; });
  ok(mh && mh.l >= 0 && mh.r <= mh.w + 1 && /^[123]$/.test(mh.cd || ''), 'mobile: arena HUD fits, countdown ' + JSON.stringify(mh));
  await M.screenshot({ path: `${OUT}/duel-mobile-countdown.png` });
  await M.waitForFunction(() => document.querySelector('.mc-duel-cd')?.textContent === 'БОЙ!', null, { timeout: 5000 }).catch(() => {});
  // атака с кнопки ⚔ (автонаведение на соперника)
  // ⚔ на телефоне: удар с автонаведением на соперника (зажать кнопку)
  await M.keyboard.down('w').catch(() => {});
  await G(M, () => window.__game.debug.teleport(window.__game.debug.pos().x, window.__game.debug.pos().y));
  await M.locator('[data-hold="attack"]').dispatchEvent('pointerdown', { pointerId: 7 });
  await M.waitForTimeout(1500);
  const aimT = await G(M, () => window.__game.debug.aim().touch);
  await M.locator('[data-hold="attack"]').dispatchEvent('pointerup', { pointerId: 7 });
  await M.keyboard.up('w').catch(() => {});
  ok(aimT, 'mobile: ⚔ hold = attack toward opponent');
  await M.waitForTimeout(800);
  await M.screenshot({ path: `${OUT}/duel-mobile-fight.png` });
  await M.locator('.mc-duel-leave').dispatchEvent('pointerdown'); await M.waitForTimeout(300);
  await M.locator('.mc-duel-leave').dispatchEvent('pointerdown');
  await M.waitForSelector('.mc-duel-res', { timeout: 6000 }).catch(() => {});
  const mres = await G(M, () => document.querySelector('.mc-duel-res .big')?.textContent);
  const ares = await D.waitForSelector('.mc-duel-res', { timeout: 6000 }).then(() => G(D, () => document.querySelector('.mc-duel-res .big')?.textContent)).catch(() => null);
  ok(mres === 'ПОРАЖЕНИЕ' && ares === 'ПОБЕДА', `mobile surrender: phone ${mres}, desktop ${ares}`);
  ok(await G(M, () => { const r = document.querySelector('.mc-duel-res')?.getBoundingClientRect(); return r && r.right <= innerWidth + 1; }), 'mobile result screen fits');
  await M.screenshot({ path: `${OUT}/duel-mobile-result.png` });
  ok(await G(M, () => window.__game.state().world === 'arinar'), 'phone back in Arinar');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  d1(`DELETE FROM duel_stats WHERE pkey IN ('uid:${uidA}','uid:${uidB}','uid:${uidM}','uid:${uidD}')`);
  d1(`DELETE FROM duel_results WHERE a_pkey IN ('uid:${uidA}','uid:${uidB}','uid:${uidM}','uid:${uidD}') OR b_pkey IN ('uid:${uidA}','uid:${uidB}','uid:${uidM}','uid:${uidD}')`);
  d1(`DELETE FROM users WHERE id IN ('${uidA}','${uidB}','${uidM}','${uidD}')`);
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
