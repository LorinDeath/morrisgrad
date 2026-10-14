// Онлайн / друзья / настройки / «Не беспокоить 5 минут» / сумка героя / «Сохранить сейчас» — 2 игрока + гость + телефон.
// NODE_PATH=<playwright-core> node tools/playtest/friends.js  (локально: wrangler dev :8787, страница game.html :5199)
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now();
  const open = async (n, uid, ctxOpts = { viewport: { width: 1440, height: 860 } }, extra = '') => {
    const p = await (await b.newContext(ctxOpts)).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1${extra}`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const hero = async (p, cls) => { for (let i = 0; i < 6; i++) { await G(p, (c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1300); if (await G(p, (c) => window.__game.meta?.hero?.cls === c, cls)) break; } };
  const A = await open('Alex', `t_fr_A_${T}`), B = await open('Bob', `t_fr_B_${T}`), Gs = await open('Странник', '');
  await hero(A, 'warrior'); await hero(B, 'mage'); await hero(Gs, 'rogue');
  await A.waitForTimeout(2500);
  // онлайн
  await A.click('.mc-onlinebtn'); await A.waitForTimeout(1200);
  const rows = await A.locator('.mc-soc-pl').count();
  ok(rows >= 3, `online list rows=${rows}`);
  const guestRow = await A.locator('.mc-soc-pl', { hasText: '«Гость»' }).count();
  ok(guestRow >= 1, 'guest shown as «Гость» Имя in online list');
  await A.screenshot({ path: `${OUT}/friends-01-online.png` });
  await A.locator('.mc-soc-pl', { hasText: 'Bob' }).locator('[data-act="add"]').click(); await A.waitForTimeout(1200);
  // B: заявка
  await B.click('.mc-friendsbtn'); await B.waitForTimeout(800);
  await B.click('[data-ftab="req"]'); await B.waitForTimeout(800);
  ok(await B.locator('.mc-soc-pl', { hasText: 'Alex' }).count() === 1, 'B sees incoming request from Alex');
  await B.screenshot({ path: `${OUT}/friends-02-requests.png` });
  await B.locator('.mc-soc-pl', { hasText: 'Alex' }).locator('[data-act="acc"]').click(); await B.waitForTimeout(1200);
  await A.click('[data-view="friends"]'); await A.waitForTimeout(1200);
  ok(await A.locator('.mc-soc-pl', { hasText: 'Bob' }).locator('[data-act="duel"]').count() === 1, 'A friends list: Bob online with «На дуэль»');
  await A.screenshot({ path: `${OUT}/friends-03-list.png` });
  // профиль из списка друзей
  await A.locator('.mc-soc-pl', { hasText: 'Bob' }).locator('[data-act="view"]').click(); await A.waitForTimeout(1500);
  ok(await A.locator('.mc-insp-name').count() === 1 && await A.locator('.mc-insp-cls', { hasText: 'ур.' }).count() === 1, 'view profile from friends');
  await A.screenshot({ path: `${OUT}/friends-04-profile.png` });
  await A.click('.mc-soc-x');
  // настройки B
  await B.click('[data-view="settings"]'); await B.waitForTimeout(900);
  await B.click('[data-act="duelset"][data-v="friends"]'); await B.waitForTimeout(900);
  ok(await B.locator('[data-act="duelset"][data-v="friends"].gold').count() === 1, 'B: duel rule «Только друзья» saved by server');
  await B.screenshot({ path: `${OUT}/friends-05-settings.png` });
  await B.click('.mc-soc-x');
  // гость не может вызвать B
  const sidB = await G(B, () => window.__game.state().myId);
  await G(Gs, (s) => window.__game.debug.rawSend({ type: 'duel_challenge', sid: s }), sidB); await Gs.waitForTimeout(900);
  ok(await Gs.locator('text=только от друзей').count() >= 1, 'stranger refused by friends-only rule (toast)');
  // друг A вызывает B → окно с «Не беспокоить 5 мин»
  await G(A, () => window.__game.debug.teleport(600, 660)); await G(B, () => window.__game.debug.teleport(640, 640)); await A.waitForTimeout(800);
  await G(A, (s) => window.__game.debug.rawSend({ type: 'duel_challenge', sid: s }), sidB); await B.waitForTimeout(1200);
  ok(await B.locator('.mc-duel-card.inv .dnd').count() === 1, 'invite card has «Не беспокоить 5 мин»');
  await B.screenshot({ path: `${OUT}/friends-06-invite-dnd.png` });
  await B.locator('.mc-duel-card.inv .dnd').dispatchEvent('pointerdown'); await B.waitForTimeout(1200);
  await B.click('.mc-setbtn'); await B.waitForTimeout(900);
  ok(await B.locator('[data-act="dnd"].gold').count() === 1, 'settings show DND on');
  await B.screenshot({ path: `${OUT}/friends-07-dnd-on.png` });
  await B.click('.mc-soc-x');
  // сумка героя: надетое скрыто из сумки, снятие нажатием на слот
  await G(A, () => window.__game.debug.rawSend({ type: 'dev_grant', item: 'fly_legs' })); await A.waitForTimeout(900);
  await G(A, () => { const it = window.__game.meta.state.account.inv.find((i) => i.id === 'fly_legs'); window.__game.debug.rawSend({ type: 'equip', uid: it.uid }); }); await A.waitForTimeout(900);
  await G(A, () => window.__game.debug.openBook('gear')); await A.waitForTimeout(900);
  const eqUid = await G(A, () => window.__game.meta.hero.equip.legs);
  ok(!!eqUid && await A.locator(`.mc-bag [data-v="${eqUid}"]`).count() === 0, 'equipped item hidden from bag');
  ok(await A.locator('.mc-gslot.filled[data-act="unequip"]').count() === 1, 'equipped item shown in slot');
  await A.screenshot({ path: `${OUT}/friends-08-gear-equipped.png` });
  await A.locator('.mc-gslot.filled[data-act="unequip"]').click(); await A.waitForTimeout(1200);
  ok(await G(A, () => !window.__game.meta.hero.equip.legs), 'click on slot unequips');
  ok(await A.locator(`.mc-bag [data-v="${eqUid}"]`).count() === 1, 'unequipped item returns to bag');
  await A.screenshot({ path: `${OUT}/friends-09-gear-unequipped.png` });
  await G(A, () => window.__game.api?.book?.close?.()); await A.keyboard.press('Escape');
  // алтарь: «Сохранить сейчас»
  await G(A, () => window.__game.debug.teleport(565, 600)); await A.waitForTimeout(1200);
  await G(A, () => window.__game.debug.openAltar()); await A.waitForTimeout(700);
  ok(await A.locator('.mc-save-now').count() === 1, 'altar has «Сохранить сейчас»');
  await A.click('.mc-save-now'); await A.waitForTimeout(1500);
  ok(await A.locator('text=Сохранено').count() >= 1, 'save now → «Сохранено ✓»');
  await A.screenshot({ path: `${OUT}/friends-10-altar-save.png` });
  // телефон
  const M = await open('Mobi', `t_fr_M_${T}`, { ...devices['iPhone 13'] }, '&mobile=1');
  await M.waitForTimeout(1500);
  ok(await M.locator('.mc3d-tbtn[data-act="people"]').count() === 1, 'mobile has 👥 button');
  await M.locator('.mc3d-tbtn[data-act="people"]').dispatchEvent('pointerdown'); await M.waitForTimeout(1500);
  ok(await M.locator('.mc-soc-pl').count() >= 3, 'mobile online list');
  await M.screenshot({ path: `${OUT}/friends-11-mobile-online.png` });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
