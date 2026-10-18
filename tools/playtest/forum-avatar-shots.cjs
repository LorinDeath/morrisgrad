// LOCAL: скриншоты аватаров и профилей без id (desktop + mobile). Только 127.0.0.1 (guardLocal).
const { chromium } = require('/workspace/.pwtools/node_modules/playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/forum/avatars/', BASE = 'http://127.0.0.1:4391';
const PIC = '/workspace/morrisgrad-round3/forum/seed/lorin.jpg';
const DESK = { width: 1366, height: 900 }, MOB = { width: 390, height: 844 };
const IDS = /user_3DX|user_38Q|dev_admin|dev_mod|dev_fmod|p_kira|p_vlad|p_mira|p_olek|p_dan|p_yana|p_spam|p_lena/;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const leaks = [];
  const mk = async (uid, vp) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp === MOB ? 2 : 1, isMobile: vp === MOB, hasTouch: vp === MOB, locale: 'ru-RU', timezoneId: 'Europe/Kiev' });
    await guardLocal(ctx);
    await ctx.addCookies([uid ? { name: 'mg_dev_uid', value: uid, url: BASE } : { name: 'mg_dev_noclerk', value: '1', url: BASE }]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    return { ctx, p };
  };
  const go = async (p, path) => {
    await p.goto(assertLocalUrl(BASE + path), { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    const txt = await p.evaluate(() => document.body.innerText + ' ' + Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')).join(' '));
    if (IDS.test(txt)) leaks.push(path + ' → ' + txt.match(IDS)[0]);
  };
  const shot = async (p, name, full = false) => {
    if (full) { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); }); await p.waitForTimeout(400); }
    await p.screenshot({ path: OUT + name + '.png', fullPage: full }); console.log('shot', name);
  };
  const crop = async (p) => {
    await p.setInputFiles('[data-ava-file]', PIC); await p.waitForSelector('[data-crop]:not([hidden])');
    await p.fill('[data-crop-zoom]', '1.6'); await p.dispatchEvent('[data-crop-zoom]', 'input');
    const bx = await p.locator('[data-crop-canvas]').boundingBox();
    await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.mouse.move(bx.x + bx.width / 2 + 25, bx.y + bx.height / 2 + 35, { steps: 5 }); await p.mouse.up();
    await p.waitForTimeout(200);
  };

  // --- desktop ---
  let { ctx, p } = await mk('p_olek', DESK);
  await go(p, '/forum/me'); await shot(p, 'a01-profile-no-avatar-generated-desktop');
  await crop(p); await p.locator('[data-ava-box]').scrollIntoViewIfNeeded(); await shot(p, 'a02-profile-avatar-crop-desktop');
  await p.click('[data-crop-save]'); await p.waitForTimeout(500); await shot(p, 'a03-profile-avatar-saved-toast-desktop');
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(900); await go(p, '/forum/me'); await shot(p, 'a04-profile-avatar-set-desktop');
  await ctx.close();
  ({ ctx, p } = await mk('p_kira', DESK));
  await go(p, '/forum'); await shot(p, 'a05-feed-cards-avatars-desktop');
  await go(p, '/forum/t/3'); await p.locator('#comments').scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await shot(p, 'a06-topic-comments-avatars-desktop');
  await go(p, '/forum/t/4'); await shot(p, 'a07-topic-generated-avatars-desktop', true);
  await go(p, '/forum/u/p_kira'); await shot(p, 'a08-author-page-avatar-desktop'); console.log('legacy url →', p.url());
  await go(p, '/forum/sections'); await shot(p, 'a09-sections-online-avatars-desktop', true);
  await go(p, '/forum/rules'); await p.locator('.f-team').scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await shot(p, 'a10-rules-forum-team-no-ids-desktop');
  await ctx.close();
  ({ ctx, p } = await mk('dev_admin', DESK));
  await go(p, '/forum/admin?tab=mods'); await p.fill('[data-mod-add] input[name=nick]', 'Ян'); await p.waitForTimeout(600); await shot(p, 'a11-admin-moderators-no-ids-desktop', true);
  await go(p, '/forum/admin?tab=log'); await shot(p, 'a12-admin-log-nicks-desktop');
  await ctx.close();
  ({ ctx, p } = await mk('dev_fmod', DESK));
  await go(p, '/forum/u/p_vlad'); await shot(p, 'a13-moderator-remove-avatar-button-desktop');
  await ctx.close();

  // --- mobile ---
  ({ ctx, p } = await mk('p_dan', MOB));
  await go(p, '/forum/me'); await crop(p); await p.locator('[data-ava-box]').scrollIntoViewIfNeeded(); await shot(p, 'm-a01-profile-avatar-crop-mobile');
  await ctx.close();
  ({ ctx, p } = await mk('p_kira', MOB));
  await go(p, '/forum'); await shot(p, 'm-a02-feed-avatars-mobile');
  await go(p, '/forum/t/3'); await p.locator('#comments').scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await shot(p, 'm-a03-topic-comments-avatars-mobile');
  await go(p, '/forum/u/p_kira'); await shot(p, 'm-a04-author-page-mobile');
  await go(p, '/forum/rules'); await p.locator('.f-team').scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await shot(p, 'm-a05-rules-team-mobile');
  await ctx.close();
  ({ ctx, p } = await mk('dev_admin', MOB));
  await go(p, '/forum/admin?tab=mods'); await shot(p, 'm-a06-admin-moderators-mobile', true);
  await ctx.close();
  console.log('LEAKS', JSON.stringify(leaks));
  await b.close();
})();
