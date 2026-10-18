// LOCAL: скриншоты уведомлений и статистики (desktop + mobile). Только 127.0.0.1 (guardLocal).
const { chromium } = require('/workspace/.pwtools/node_modules/playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/forum/notify/', BASE = 'http://127.0.0.1:4391';
const DESK = { width: 1366, height: 900 }, MOB = { width: 390, height: 844 };
const IDS = /user_3DX|user_38Q|dev_admin|dev_mod|dev_fmod|p_kira|p_vlad|p_mira|p_olek|p_dan|p_yana|p_spam|p_lena/;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const leaks = [], errs = [];
  const mk = async (uid, vp) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp === MOB ? 2 : 1, isMobile: vp === MOB, hasTouch: vp === MOB, locale: 'ru-RU', timezoneId: 'Europe/Kiev' });
    await guardLocal(ctx);
    await ctx.addCookies([{ name: 'mg_dev_uid', value: uid, url: BASE }]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    return { ctx, p };
  };
  const check = async (p, path) => {
    const txt = await p.evaluate(() => document.body.innerText + ' ' + Array.from(document.querySelectorAll('a[href],[data-uid],[data-ban],[data-block]')).map((a) => (a.getAttribute('href') || '') + (a.getAttribute('data-uid') || '')).join(' '));
    if (IDS.test(txt)) leaks.push(path + ' → ' + txt.match(IDS)[0]);
  };
  const go = async (p, path) => { await p.goto(assertLocalUrl(BASE + path), { waitUntil: 'networkidle' }); await p.waitForTimeout(300); await check(p, path); };
  const shot = async (p, name, full = false) => { await p.screenshot({ path: OUT + name + '.png', fullPage: full }); console.log('shot', name); };
  const kiraPid = async (p) => p.evaluate(() => document.getElementById('forum-root')?.dataset.uid);

  for (const [vp, sfx] of [[DESK, 'desktop'], [MOB, 'mobile']]) {
    const { ctx, p } = await mk('p_kira', vp);
    await go(p, '/forum');
    const n = await p.locator('.f-bell-n').textContent();
    console.log(sfx, 'bell count', n, 'visible', await p.locator('.f-bell-n').isVisible());
    await shot(p, `n01-bell-counter-${sfx}`);
    if (sfx === 'desktop') await p.locator('.f-top').screenshot({ path: OUT + 'n01b-bell-closeup-desktop.png' });
    await go(p, '/forum/notifications'); await shot(p, `n02-notifications-list-${sfx}`, true);
    // polling endpoint returns the same count
    const api = await p.evaluate(async () => (await (await fetch('/api/forum/notifs/count')).json()).n);
    console.log(sfx, 'api count', api);
    // click a reply notification → topic, highlighted comment
    const link = p.locator('.f-notif.unread', { hasText: 'ответил(а) на ваш комментарий' }).first();
    await link.click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(450);
    console.log(sfx, 'after click url', p.url().replace(BASE, ''), 'target', await p.evaluate(() => !!document.querySelector('.f-cm:target')));
    await check(p, p.url());
    await shot(p, `n03-comment-highlight-after-click-${sfx}`);
    await go(p, '/forum/notifications');
    console.log(sfx, 'bell after click', await p.locator('.f-bell-n').textContent());
    await go(p, '/forum/me#notif-settings');
    await p.locator('#notif-settings').scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
    if (sfx === 'desktop') { await p.locator('#notif-settings input[value="like"]').uncheck(); await p.locator('#notif-settings button[type=submit]').click(); await p.waitForTimeout(500); }
    await shot(p, `n05-notification-settings-${sfx}`);
    if (sfx === 'desktop') { await p.locator('#notif-settings input[value="like"]').check(); await p.locator('#notif-settings button[type=submit]').click(); await p.waitForTimeout(400); }
    const pid = await kiraPid(p);
    await go(p, `/forum/u/${pid}`); await shot(p, `n06-author-stats-${sfx}`, true);
    await go(p, '/forum/t/3');
    const sub = p.locator('[data-sub="t"]');
    console.log(sfx, 'topic sub button', await sub.textContent());
    if (sfx === 'desktop') { await sub.scrollIntoViewIfNeeded(); await shot(p, 'n07-topic-follow-button-desktop'); await go(p, '/forum/s/news'); await shot(p, 'n08-section-follow-button-desktop'); }
    await ctx.close();
  }
  { const { ctx, p } = await mk('p_kira', DESK); await go(p, '/forum/notifications'); await p.click('[data-notif-all]'); await p.waitForTimeout(600); await shot(p, 'n04-mark-all-read-desktop'); console.log('bell after mark all', JSON.stringify(await p.locator('.f-bell-n').textContent()), await p.locator('.f-bell-n').isVisible()); await ctx.close(); }
  // someone else's stats (guest-ish view by another user)
  const { ctx, p } = await mk('p_dan', DESK);
  await go(p, '/forum/u/1'); await shot(p, 'n09-author-stats-other-user-desktop', true);
  await ctx.close();
  await b.close();
  console.log('leaks:', leaks.length ? leaks : 'none');
  console.log('page errors:', errs.length ? errs : 'none');
})();
