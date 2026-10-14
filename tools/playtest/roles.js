// Роли: «Админ» (красная плашка) / «Модератор» (зелёная) — над головой, в чате, «Онлайн», рейтинге, профиле;
// админ (сервер проверяет) выдаёт/снимает модерку из профиля; не-админ кнопок не видит и сервер ему отказывает.
// NODE_PATH=<playwright-core> node tools/playtest/roles.js  (из каталога server; wrangler dev :8787; game.html :5199)
const { chromium, devices } = require('playwright-core');
const { execSync } = require('node:child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round2';
const WR = process.env.WRANGLER || '../node_modules/.bin/wrangler';
const ADMIN = process.env.ADMIN_UID || 'user_38QeREOr606p1c96P4f14YFsLp7'; // из прежнего ADMIN_USER_IDS (миграция 0008)
const d1 = (sql) => JSON.parse(execSync(`${WR} d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now(), uidB = `t_role_B_${T}`;
  const open = async (n, uid, ctxOpts = { viewport: { width: 1440, height: 860 } }) => {
    const p = await (await b.newContext(ctxOpts)).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const hero = async (p, cls) => { await G(p, (c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1500); };
  d1(`DELETE FROM player_roles WHERE pkey='uid:${uidB}'`);
  ok(d1(`SELECT role FROM player_roles WHERE pkey='uid:${ADMIN}'`)[0]?.role === 'admin', 'D1 player_roles: seeded admin from old ADMIN_USER_IDS');
  const A = await open('Alex', ADMIN), B = await open('Bob', uidB);
  await hero(A, 'spearman'); await hero(B, 'mage');
  await G(A, () => window.__game.debug.teleport(600, 640)); await G(B, () => window.__game.debug.teleport(660, 640)); await A.waitForTimeout(2000);
  ok(await A.locator('.mc3d-label .mc-role.admin').count() >= 1, 'A: own head label has red «Админ»');
  ok(await B.locator('.mc3d-label .mc-role.admin', { hasText: 'Админ' }).count() === 1, 'B sees «Админ» above Alex head');
  await G(A, () => window.__game.debug.rawSend({ type: 'chat', text: 'Всем привет!' })); await B.waitForTimeout(900);
  ok(await B.locator('.mc3d-bubble .mc-role.admin').count() === 1, 'chat bubble from admin has «Админ» tag');
  await B.screenshot({ path: `${OUT}/roles-01-admin-head-chat.png` });
  // B (не админ) открывает профиль A — кнопок нет; прямой role_set — отказ сервера
  await B.click('.mc-onlinebtn'); await B.waitForTimeout(1200);
  ok(await B.locator('.mc-soc-pl', { hasText: 'Alex' }).locator('.mc-role.admin').count() === 1, 'online list: «Админ» before Alex');
  await B.locator('.mc-soc-pl', { hasText: 'Alex' }).locator('[data-act="view"]').click(); await B.waitForTimeout(1500);
  ok(await B.locator('.mc-insp-name .mc-role.admin').count() === 1, 'profile: «Админ» tag');
  ok(await B.locator('.mc-modbtn').count() === 0, 'non-admin never sees «Выдать модерку»');
  await B.click('.mc-soc-x');
  await G(B, () => window.__game.debug.rawSend({ type: 'role_set', sid: 'x', moderator: true })); await B.waitForTimeout(800);
  ok(await B.locator('text=Недостаточно прав').count() >= 1, 'server refuses role_set from non-admin');
  // A выдаёт модерку B из профиля
  await A.click('.mc-onlinebtn'); await A.waitForTimeout(1200);
  await A.locator('.mc-soc-pl', { hasText: 'Bob' }).locator('[data-act="view"]').click(); await A.waitForTimeout(1500);
  ok(await A.locator('.mc-modbtn', { hasText: 'Выдать модерку' }).count() === 1, 'admin sees «Выдать модерку» in Bob profile');
  await A.screenshot({ path: `${OUT}/roles-02-admin-profile-grant.png` });
  await A.click('.mc-modbtn'); await A.waitForTimeout(1500);
  ok(d1(`SELECT role FROM player_roles WHERE pkey='uid:${uidB}'`)[0]?.role === 'moderator', 'D1: Bob → moderator');
  ok(await A.locator('.mc-insp-name .mc-role.moderator').count() === 1 && await A.locator('.mc-modbtn', { hasText: 'Снять' }).count() === 1, 'profile updated: «Модератор» + «Снять»');
  await A.screenshot({ path: `${OUT}/roles-03-moderator-granted.png` });
  await A.click('.mc-soc-x'); await A.waitForTimeout(1500);
  ok(await A.locator('.mc3d-label .mc-role.moderator', { hasText: 'Модератор' }).count() === 1, 'green «Модератор» above Bob head');
  ok(await B.locator('.mc3d-label .mc-role.moderator').count() >= 1, 'Bob sees own «Модератор» label');
  await G(B, () => window.__game.debug.rawSend({ type: 'chat', text: 'Слежу за порядком' })); await A.waitForTimeout(900);
  ok(await A.locator('.mc3d-bubble .mc-role.moderator').count() === 1, 'moderator chat bubble tag');
  await A.screenshot({ path: `${OUT}/roles-04-heads-chat.png` });
  await A.click('.mc-onlinebtn'); await A.waitForTimeout(1200);
  ok(await A.locator('.mc-soc-pl', { hasText: 'Bob' }).locator('.mc-role.moderator').count() === 1, 'online list: «Модератор» before Bob');
  await A.screenshot({ path: `${OUT}/roles-05-online.png` });
  await A.click('.mc-soc-x');
  // рейтинг
  await G(A, () => window.__game.debug.rawSend({ type: 'save_now' })); await G(B, () => window.__game.debug.rawSend({ type: 'save_now' })); await A.waitForTimeout(1500);
  await A.click('#ghud-rating-btn'); await A.waitForTimeout(1500);
  const rr = await A.locator('.mc-soc td.nm .mc-role').count();
  ok(rr >= 1, `rating rows with role tag: ${rr}`);
  await A.screenshot({ path: `${OUT}/roles-06-rating.png` });
  await A.click('.mc-soc-x').catch(() => {});
  // мобильный: «Онлайн» с плашками
  const M = await open('Мобила', `t_role_M_${T}`, { ...devices['Pixel 7'] });
  await M.waitForTimeout(1500); await M.locator('[data-act="people"]').dispatchEvent('pointerdown').catch(() => {}); await M.waitForTimeout(1500);
  if (!(await M.locator('.mc-soc-pl').count())) { await G(M, () => document.querySelector('.mc-onlinebtn')?.click()); await M.waitForTimeout(1200); }
  ok(await M.locator('.mc-soc-pl .mc-role.admin').count() === 1 && await M.locator('.mc-soc-pl .mc-role.moderator').count() === 1, 'mobile online list shows both tags');
  await M.screenshot({ path: `${OUT}/roles-07-mobile-online.png` });
  await M.locator('.mc-soc-x').click().catch(() => {}); await G(M, () => window.__game.debug.teleport(630, 600)); await M.waitForTimeout(1500);
  await M.screenshot({ path: `${OUT}/roles-08-mobile-heads.png` });
  // снять
  await A.click('.mc-onlinebtn'); await A.waitForTimeout(1000);
  await A.locator('.mc-soc-pl', { hasText: 'Bob' }).locator('[data-act="view"]').click(); await A.waitForTimeout(1500);
  await A.click('.mc-modbtn'); await A.waitForTimeout(1500);
  ok(!d1(`SELECT role FROM player_roles WHERE pkey='uid:${uidB}'`).length, 'revoke: D1 row removed');
  ok(await A.locator('.mc-modbtn', { hasText: 'Выдать модерку' }).count() === 1, 'profile back to «Выдать модерку»');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0].slice(0, 300) : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
