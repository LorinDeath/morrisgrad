// LOCAL ONLY: окно входа Clerk на страницах сайта (шапка: «Войти» → SignIn, «Регистрация» → SignUp) — ПК и телефон, до/после темы.
// TAG=before|after. Разрешены только localhost и форма Clerk (*.clerk.accounts.dev, img.clerk.com); ничего не вводим.
// Плюс снимок страницы без окна — сверка «больше на сайте ничего не поменялось» (diff before/after делается отдельно).
const { chromium } = require('playwright-core');
const { LOCAL, assertLocalUrl } = require('./_local.cjs');
const OUT = (process.env.OUT || '/workspace/morrisgrad-round3/guest-login/site') + '/' + (process.env.TAG || 'before');
const BASE = process.env.BASE || 'http://127.0.0.1:4331'; assertLocalUrl(BASE);
const CLERK_OK = /^https:\/\/([a-z0-9-]+\.)*clerk\.accounts\.dev\/|^https:\/\/img\.clerk\.com\//;
const PAGES = (process.env.PAGES || '/,/forum,/MorrisCurse,/books').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const res = [];
  for (const mobile of [false, true]) for (const path of PAGES) {
    const tag = (mobile ? 'phone' : 'pc') + (path === '/' ? '-home' : path.replace(/\//g, '-'));
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 800 } });
    await ctx.route('**/*', (r) => { const u = r.request().url(); if (LOCAL.test(u) || /^(data|blob):/.test(u) || CLERK_OK.test(u)) return r.continue(); return r.abort(); });
    await ctx.addCookies([{ name: 'mg_dev_noclerk', value: '1', url: BASE }]);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    await p.goto(BASE + path, { waitUntil: 'load' }); await sleep(5000);
    await p.evaluate(() => { if (!window.Clerk) document.dispatchEvent(new Event('astro:page-load')); }); // гонка astro dev (см. guest-login.cjs)
    await p.waitForFunction(() => window.Clerk?.loaded, null, { timeout: 30000 }).catch(() => {});
    await p.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await p.screenshot({ path: `${OUT}/${tag}-page.png` });
    const btn = await p.$('.login-btn'); if (btn) { await btn.click(); }
    await p.waitForSelector('.cl-signIn-root, .cl-card', { timeout: 20000 }).catch(() => {}); await sleep(1500);
    await p.screenshot({ path: `${OUT}/${tag}-signin.png` });
    const title = await p.evaluate(() => document.querySelector('.cl-headerTitle')?.innerText || '');
    await p.click('.cl-footerActionLink').catch(() => {}); await p.waitForSelector('.cl-signUp-root', { timeout: 15000 }).catch(() => {}); await sleep(1500);
    await p.screenshot({ path: `${OUT}/${tag}-signup.png` });
    const t2 = await p.evaluate(() => document.querySelector('.cl-headerTitle')?.innerText || '');
    const bg = await p.evaluate(() => { const c = document.querySelector('.cl-card'); return c ? getComputedStyle(c).backgroundImage + ' ' + getComputedStyle(c).backgroundColor : ''; });
    res.push({ tag, title, t2, clerk: await p.evaluate(() => !!window.Clerk?.loaded), url: p.url().replace(BASE, ''), errs, bg: bg.slice(0, 80) });
    await ctx.close();
  }
  for (const r of res) console.log(JSON.stringify(r));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
