// LOCAL: скриншоты форума (desktop + mobile). Только 127.0.0.1 (guardLocal). Вход — dev-cookie (только astro dev).
const { chromium } = require('/workspace/.pwtools/node_modules/playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/forum/', BASE = 'http://127.0.0.1:4391';
const DESK = { width: 1366, height: 900 }, MOB = { width: 390, height: 844 };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const mk = async (uid, vp, opts = {}) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp === MOB ? 2 : 1, isMobile: vp === MOB, hasTouch: vp === MOB, locale: 'ru-RU', timezoneId: 'Europe/Kiev', ...opts });
    await guardLocal(ctx);
    await ctx.addCookies([uid ? { name: 'mg_dev_uid', value: uid, url: BASE } : { name: 'mg_dev_noclerk', value: '1', url: BASE }]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    return { ctx, p };
  };
  const go = async (p, path) => { await p.goto(assertLocalUrl(BASE + path), { waitUntil: 'networkidle' }); await p.waitForTimeout(300); };
  const shot = async (p, name, full = false) => {
    if (full) { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); }); await p.waitForTimeout(500); } await p.screenshot({ path: OUT + name + '.png', fullPage: full }); console.log('shot', name); };

  // --- игрок (Кира) — desktop ---
  let { ctx, p } = await mk('p_kira', DESK);
  await go(p, '/forum'); await shot(p, '01-feed-recommended-desktop', true);
  await go(p, '/forum?tab=new'); await shot(p, '02-feed-fresh-desktop');
  await go(p, '/forum?tab=top'); await shot(p, '03-feed-popular-desktop');
  await go(p, '/forum/sections'); await shot(p, '04-sections-classic-desktop', true);
  await go(p, '/forum/s/curse'); await shot(p, '05-section-topics-desktop');
  await go(p, '/forum/t/3'); await shot(p, '06-topic-article-with-images-desktop', true);
  await p.locator('#comments').scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await shot(p, '07-topic-comments-likes-desktop');
  await go(p, '/forum/t/7'); await p.locator('.f-like').first().click(); await p.waitForTimeout(900); await shot(p, '08-post-with-image-liked-desktop', true);
  await go(p, '/forum/u/p_kira'); await shot(p, '09-author-page-desktop', true);
  await go(p, '/forum/t/4'); await p.locator('#comments').scrollIntoViewIfNeeded(); await shot(p, '10-profanity-masked-desktop');
  // компактный и светлый режимы
  await go(p, '/forum'); await p.click('[data-toggle=compact]'); await p.waitForTimeout(200); await shot(p, '11-feed-compact-wap-desktop');
  await p.click('[data-toggle=compact]'); await go(p, "/forum/t/6"); await p.click("[data-toggle=light]"); await p.waitForTimeout(200); await shot(p, '12-topic-light-mode-desktop');
  await p.click('[data-toggle=light]');
  // редактор с предпросмотром и загрузкой картинки (новый участник — у Киры сработала бы пауза между темами)
  await ctx.close(); ({ ctx, p } = await mk('p_lena', DESK));
  await go(p, '/forum'); await p.evaluate(() => fetch('/api/forum/me', { method: 'PUT', headers: { 'x-forum': '1', 'content-type': 'application/json' }, body: JSON.stringify({ nick: 'Лена_Пепел', signature: 'Маг огня · гильдия «Пепел»' }) }));
  await go(p, '/forum/new?section=2');
  await p.click('.f-ed-kind label:nth-child(2)');
  await p.fill('input[name=title]', 'Мой путь в Аринаре: от новичка до первого босса');
  await p.fill('textarea[name=body]', '# Как всё начиналось\nПервый вечер в **«Проклятых»** я просто *бродила* по лагерю.\n\n## Что помогло\n- квесты у костра\n- ~~удача~~ терпение\n- советы с [форума](/forum)\n\n> Не бойтесь умирать — это часть пути.\n\n`Огненный шар` + `Вспышка` = ❤\n\n||Босс боится огня||\n');
  await p.setInputFiles('[data-cover-file]', '/workspace/morrisgrad-round3/forum/seed/map.jpg');
  await p.setInputFiles('[data-file]', '/workspace/morrisgrad-round3/forum/seed/fire-mage.jpg');
  await p.waitForFunction(() => /!\[\]\(\/api\/forum\/media\/u\/\d+\/[a-z0-9]+\.webp\)/.test(document.querySelector('textarea[name=body]').value), null, { timeout: 20000 });
  await p.waitForFunction(() => !!document.querySelector('[data-cover-drop] img'), null, { timeout: 20000 });
  await p.waitForTimeout(800); await shot(p, '13-editor-preview-upload-desktop', true);
  await p.locator('.f-ed-bar').scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -60)); await p.waitForTimeout(300); await shot(p, '13b-editor-toolbar-preview-desktop');
  const ta = await p.inputValue('textarea[name=body]'); console.log('uploaded as:', ta.match(/media\/[^)]+/)[0]);
  await p.click('button[type=submit]'); await p.waitForURL(/\/forum\/t\/\d+/); await p.waitForTimeout(500); await shot(p, '14-published-article-desktop', true);
  // жалоба
  await ctx.close(); ({ ctx, p } = await mk('p_kira', DESK));
  await go(p, '/forum/t/6');
  await p.locator('[data-report="t"]').click(); await p.waitForTimeout(300); await p.check('input[value="Спам / реклама"]'); await p.fill('#f-report-dialog textarea', 'Похоже на копию чужого текста'); await shot(p, '15-report-dialog-desktop');
  await p.click('#f-report-dialog button[value=ok]'); await p.waitForTimeout(500); await shot(p, '16-report-sent-toast-desktop');
  await ctx.close();

  // --- фильтр в режиме «не пропускать» ---
  ({ ctx, p } = await mk('dev_admin', DESK));
  await go(p, '/forum/admin?tab=filter'); await p.selectOption('select[name=filter_mode]', 'block'); await p.fill('[data-filter-test]', 'ну ты и x.y.й, cyka бл*ть'); await p.waitForTimeout(200);
  await shot(p, '17-admin-filter-settings-desktop', true);
  await p.click('[data-settings-form] button[type=submit]'); await p.waitForTimeout(16500);
  await ctx.close();
  ({ ctx, p } = await mk('p_olek', DESK));
  await go(p, '/forum/t/5'); await p.fill('form[data-quick] textarea', 'Ти що, мудак? Це ж очевидно'); await p.click('form[data-quick] button[type=submit]'); await p.waitForTimeout(500);
  await shot(p, '18-profanity-blocked-message-desktop');
  await ctx.close();
  ({ ctx, p } = await mk('dev_admin', DESK));
  await go(p, '/forum/admin?tab=filter'); await p.selectOption('select[name=filter_mode]', 'mask'); await p.click('[data-settings-form] button[type=submit]'); await p.waitForTimeout(500);
  await go(p, '/forum/admin?tab=sections'); await shot(p, '19-admin-sections-desktop', true);
  await go(p, '/forum/admin?tab=settings'); await shot(p, '20-admin-limits-desktop', true);
  await go(p, '/forum/admin?tab=mods'); await shot(p, '21-admin-moderators-desktop', true);
  await go(p, '/forum/t/6'); await p.locator('#comments').scrollIntoViewIfNeeded(); await shot(p, '22-admin-deleted-comment-restore-desktop');
  await ctx.close();

  // --- модератор форума ---
  ({ ctx, p } = await mk('dev_fmod', DESK));
  await go(p, '/forum/admin'); await shot(p, '23-moderation-queue-desktop', true);
  await go(p, '/forum/t/4'); await shot(p, '24-moderator-topic-controls-desktop', true);
  await go(p, '/forum/admin?tab=log'); await shot(p, '25-moderation-log-desktop', true);
  await go(p, '/forum/admin?tab=users'); await shot(p, '26-moderation-bans-desktop');
  await ctx.close();

  // --- mobile ---
  ({ ctx, p } = await mk('p_kira', MOB));
  await go(p, '/forum'); await shot(p, 'm01-feed-recommended-mobile', true);
  await go(p, '/forum/sections'); await shot(p, 'm02-sections-classic-mobile', true);
  await go(p, '/forum/s/curse'); await shot(p, 'm03-section-topics-mobile');
  await go(p, '/forum/t/3'); await shot(p, 'm04-topic-article-mobile', true);
  await go(p, '/forum/u/p_kira'); await shot(p, 'm05-author-mobile');
  await go(p, '/forum/new'); await p.fill('input[name=title]', 'Тема с телефона'); await p.fill('textarea[name=body]', '**Привет** с телефона!\n\n- пункт один\n- пункт два\n\n> цитата'); await shot(p, 'm06-editor-mobile');
  await p.click('[data-mode=preview]'); await p.waitForTimeout(300); await shot(p, 'm07-editor-preview-mobile');
  await go(p, '/forum'); await p.click('[data-toggle=compact]'); await shot(p, 'm08-feed-compact-mobile'); await p.click('[data-toggle=compact]');
  await ctx.close();
  ({ ctx, p } = await mk('dev_fmod', MOB));
  await go(p, '/forum/t/4'); await p.locator('#comments').scrollIntoViewIfNeeded(); await shot(p, 'm09-moderator-controls-mobile');
  await go(p, '/forum/admin'); await shot(p, 'm10-moderation-queue-mobile', true);
  await ctx.close();
  ({ ctx, p } = await mk(null, DESK));
  await go(p, '/forum/rules'); await shot(p, '27-rules-desktop', true);
  await go(p, '/forum/t/3'); await p.locator('#comments').scrollIntoViewIfNeeded(); await p.locator('.f-quick, .f-alert-info').last().scrollIntoViewIfNeeded(); await shot(p, '28-guest-view-desktop');
  await go(p, '/'); await shot(p, '29-site-header-forum-link-desktop');
  await ctx.close();
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
