// LOCAL ONLY: вход гостя в «Проклятых» (оверлей mcAuthGate). Страница — astro dev этой ветки, сервер игры — wrangler dev (локальная D1).
// Режимы:
//  • по умолчанию — Clerk ПОДМЕНЁН заглушкой (в браузере теста, не в коде игры): весь сетевой трафик только localhost (_local.cjs).
//    Проверяем: гость → оверлей (ленивый модуль грузится), вошедший → оверлея и модуля НЕТ; «вход» → игра стартует без перезагрузки;
//    «Играть как гость»; сессия пропала посреди игры → «Сессия истекла», связь и позиция те же; тот же аккаунт → без переподключения;
//    другой аккаунт → переподключение на той же позиции; auth_invalid → тихий повтор, второй раз → оверлей MC-A03; телефон; ошибок в консоли нет.
//  • REAL=1 — настоящий Clerk (dev-инстанс, только загрузка формы, ничего не вводим): скриншоты оверлея и окна сайта для сравнения.
//    Кроме localhost разрешены только *.clerk.accounts.dev и img.clerk.com (форма Clerk); остальное (в т.ч. прод игры/сайта) обрывается.
const { chromium } = require('playwright-core');
const { assertLocalUrl, LOCAL } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/guest-login';
const BASE = process.env.GL_BASE || 'http://127.0.0.1:4331/MorrisCurse';
const WS = process.env.GL_WS || 'ws://127.0.0.1:8931';
const REAL = process.env.REAL === '1';
assertLocalUrl(BASE); assertLocalUrl(WS);
const CLERK_OK = /^https:\/\/([a-z0-9-]+\.)*clerk\.accounts\.dev\/|^https:\/\/img\.clerk\.com\//;
const OK_SCHEME = /^(data|blob|about|chrome|devtools):/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

async function guard(ctx, blocked) {
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (LOCAL.test(u) || OK_SCHEME.test(u) || (REAL && CLERK_OK.test(u))) return r.continue(); blocked.push(u); return r.abort(); });
  if (ctx.routeWebSocket) await ctx.routeWebSocket(/.*/, (ws) => { const u = ws.url(); if (LOCAL.test(u)) return ws.connectToServer(); blocked.push(u); ws.close(); });
  ctx.on('page', (p) => p.on('websocket', (w) => { if (!LOCAL.test(w.url())) { console.log('FAIL не локальный WebSocket: ' + w.url()); process.exit(2); } }));
}

// заглушка Clerk (только в браузере теста): тот же интерфейс, что использует оверлей и @clerk/astro
const STUB = (init) => {
  const L = new Set(); let user = init.user ? { id: init.user } : null;
  const st = () => ({ user, session: user ? C.session : null, client: {}, organization: null });
  const C = window.Clerk = {
    loaded: false, user, session: null, __props: [], __mounted: [],
    load(o) { this.loaded = true; this.__init = o; this.__sync(); setTimeout(() => L.forEach((f) => f(st())), 0); return Promise.resolve(); },
    addListener(f) { L.add(f); if (this.loaded) f(st()); return () => L.delete(f); },
    __sync() { this.user = user; this.session = user ? { id: 'sess_' + user.id, getToken: async (o) => { window.__tokCalls = (window.__tokCalls || 0) + 1; window.__tokFresh = (window.__tokFresh || 0) + (o?.skipCache ? 1 : 0); return init.token || ''; } } : null; },
    __setUser(id) { user = id ? { id } : null; this.__sync(); L.forEach((f) => f(st())); },
    __unstable__updateProps(p) { this.__props.push(p); return Promise.resolve(); },
    mountSignIn(el, p) { this.__mounted.push(['in', p]); el.innerHTML = '<div class="cl-rootBox" style="padding:24px;background:#1b1529;color:#dcd3e6;font:14px sans-serif;text-align:center">[заглушка Clerk SignIn]<br><br><button id="stub-in" style="padding:8px 16px">Войти (тест)</button></div>'; el.querySelector('#stub-in').onclick = () => C.__setUser(init.signInAs || 'user_gl_test1'); },
    mountSignUp(el, p) { this.__mounted.push(['up', p]); el.innerHTML = '<div class="cl-rootBox" style="padding:24px;background:#1b1529;color:#dcd3e6;font:14px sans-serif;text-align:center">[заглушка Clerk SignUp]</div>'; },
    unmountSignIn() {}, unmountSignUp() {},
    openSignIn() {}, redirectToSignIn() {},
    async signOut(o) { window.__signOuts = (window.__signOuts || 0) + 1; C.__setUser(null); if (o?.redirectUrl) location.href = o.redirectUrl; },
  };
  setTimeout(() => { if (!C.loaded) C.load({}); }, 300); // локально без ключа Clerk интеграция load() не зовёт — заглушка «загружается» сама
};

async function open(b, { mobile, stub, name }) {
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1366, height: 800 } });
  const blocked = []; await guard(ctx, blocked);
  await ctx.addCookies([{ name: 'mg_dev_noclerk', value: '1', url: 'http://127.0.0.1:4331' }]); // локально нет секретного ключа Clerk → серверная часть как «не вошёл»
  if (stub) await ctx.addInitScript(STUB, stub);
  await ctx.addInitScript(() => { window.__MORRIS_WS_URL__ = undefined; });
  const p = await ctx.newPage();
  const errs = [], reqs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(t)) errs.push('console: ' + t.slice(0, 200)); } });
  p.on('request', (r) => reqs.push(r.url()));
  await p.goto(assertLocalUrl(`${BASE}?ws=${encodeURIComponent(WS)}&debug=1${mobile ? '&mobile=1' : ''}`));
  await p.waitForLoadState('load');
  return { ctx, p, errs, reqs, blocked, name };
}
const gateLoaded = (reqs) => reqs.some((u) => /mcAuthGate/.test(u));
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
const waitGame = (p) => p.waitForFunction(() => window.__MC3D_GAME__?.state?.().myId && window.__MC3D_GAME__?.meta?.state, null, { timeout: 120000 });
const G = (p, f, a) => p.evaluate(f, a);

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  if (REAL) {
    for (const mobile of [false, true]) {
      const tag = mobile ? 'phone' : 'pc';
      const s = await open(b, { mobile, name: tag });
      await s.p.waitForFunction(() => window.Clerk?.loaded, null, { timeout: 30000 }).catch(() => {});
      ok(await G(s.p, () => !!window.Clerk?.loaded), `${tag}: настоящий Clerk загрузился`);
      // окно входа сайта (как сейчас) — для сравнения
      await s.p.click('.login-btn').catch(() => {}); await sleep(2500);
      await s.p.screenshot({ path: `${OUT}/${tag}-site-modal-now.png` });
      await s.p.keyboard.press('Escape'); await sleep(800);
      ok(!gateLoaded(s.reqs), `${tag}: до «Начать игру» оверлей не скачан`);
      await s.p.click('#btn-start'); await s.p.waitForSelector('.mc-auth:not([hidden]) .cl-rootBox', { timeout: 30000 }).catch(() => {});
      await sleep(2500);
      ok(await visible(s.p, '.mc-auth'), `${tag}: оверлей входа виден`);
      const txt = await G(s.p, () => document.querySelector('#mc-auth-in')?.innerText || '');
      ok(/Вход в МоррисГрад/.test(txt) && /Google/.test(txt), `${tag}: форма Clerk по-русски, Google на месте`);
      await s.p.screenshot({ path: `${OUT}/${tag}-overlay-signin.png` });
      await s.p.click('[data-tab="up"]'); await s.p.waitForSelector('#mc-auth-up .cl-rootBox', { timeout: 20000 }).catch(() => {}); await sleep(2000);
      ok(/Регистрация в МоррисГраде/.test(await G(s.p, () => document.querySelector('#mc-auth-up')?.innerText || '')), `${tag}: вкладка «Регистрация» (SignUp)`);
      await s.p.screenshot({ path: `${OUT}/${tag}-overlay-signup.png` });
      // «Играть как гость» → игра; затем показываем «Сессия истекла» поверх идущей игры (тот же модуль, режим expired)
      await s.p.click('[data-guest]'); await waitGame(s.p); await sleep(3000);
      await G(s.p, () => import('/src/scripts/mcAuthGate.ts').then((g) => { g.openAuthGate({ host: document.getElementById('game-window'), mode: 'expired', code: 'MC-A02' }); }));
      await s.p.waitForSelector('#mc-auth-in .cl-rootBox', { timeout: 20000 }).catch(() => {}); await sleep(2000);
      await s.p.screenshot({ path: `${OUT}/${tag}-overlay-expired.png` });
      const site = await G(s.p, () => window.Clerk?.__unstable__updateProps ? 'ok' : '');
      ok(site === 'ok', `${tag}: updateProps доступен (локализация только на время оверлея)`);
      ok(s.errs.length === 0, `${tag}: ошибок в консоли нет${s.errs.length ? ' — ' + s.errs.join(' | ') : ''}`);
      console.log(`INFO ${tag}: оборвано не-локальных запросов: ${s.blocked.length} (${[...new Set(s.blocked.map((u) => new URL(u).host))].join(', ')})`);
      await s.ctx.close();
    }
    await b.close(); console.log(fails ? `FAILED ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
  }

  // ── 1. вошедший игрок: оверлея нет, модуль входа не скачан ──
  for (const mobile of [false, true]) {
    const tag = mobile ? 'phone' : 'pc';
    const s = await open(b, { mobile, stub: { user: `user_gl_in_${tag}` }, name: tag });
    await s.p.click('#btn-start'); await waitGame(s.p); await sleep(1500);
    ok(!(await visible(s.p, '.mc-auth')), `${tag}/вошёл: оверлея входа нет`);
    ok(!gateLoaded(s.reqs), `${tag}/вошёл: модуль входа (mcAuthGate) не скачивался`);
    ok(await G(s.p, () => !!window.__MC3D_GAME__.meta.state?.verified), `${tag}/вошёл: профиль аккаунта (verified)`);
    ok(s.errs.length === 0, `${tag}/вошёл: ошибок в консоли нет${s.errs.length ? ' — ' + s.errs.join(' | ') : ''}`);
    await s.ctx.close();
  }

  // ── 2. гость → оверлей → вход → игра без перезагрузки; истечение сессии; смена аккаунта; auth_invalid ──
  for (const mobile of [false, true]) {
    const tag = mobile ? 'phone' : 'pc';
    const s = await open(b, { mobile, stub: { user: null, signInAs: `user_gl_${tag}` }, name: tag });
    const p = s.p;
    await G(p, () => { window.__navs = 0; window.addEventListener('beforeunload', () => { window.__navs++; }); });
    await p.click('#btn-start'); await p.waitForSelector('.mc-auth:not([hidden])', { timeout: 15000 });
    ok(gateLoaded(s.reqs), `${tag}/гость: модуль входа скачан только сейчас`);
    ok(await visible(s.p, '[data-tab="in"]') && await visible(s.p, '[data-tab="up"]'), `${tag}/гость: вкладки «Войти» / «Регистрация»`);
    const props = await G(p, () => window.Clerk.__mounted.map(([t, pr]) => [t, pr.routing, pr.oauthFlow, pr.forceRedirectUrl]));
    ok(props[0]?.[0] === 'in' && props[0][1] === 'virtual' && props[0][2] === 'redirect' && /#mc-auth-done$/.test(props[0][3]), `${tag}/гость: SignIn смонтирован (virtual, redirect, возврат в игру) ${JSON.stringify(props[0])}`);
    ok(await G(p, () => !!window.Clerk.__props.find((x) => x.options?.localization?.signIn?.start?.title === 'Вход в МоррисГрад')), `${tag}/гость: русский язык включён на время оверлея`);
    const sc = await G(p, () => getComputedStyle(document.querySelector('.mc-auth')).getPropertyValue('--mc-auth-s'));
    const fits = await G(p, () => { const r = document.querySelector('.mc-auth-panel').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
    ok(fits, `${tag}/гость: панель по ширине в экране (масштаб ${sc})`);
    await p.screenshot({ path: `${OUT}/stub-${tag}-1-overlay.png` });
    await p.click('[data-tab="up"]'); await sleep(300);
    ok(await G(p, () => window.Clerk.__mounted.some(([t]) => t === 'up')), `${tag}/гость: вкладка «Регистрация» монтирует SignUp`);
    await p.click('[data-tab="in"]'); await sleep(200);
    // «вход»
    await p.click('#stub-in'); await waitGame(p); await sleep(2000);
    ok(!(await visible(p, '.mc-auth')), `${tag}: после входа оверлей закрыт`);
    ok(await G(p, () => window.__navs === 0), `${tag}: игра стартовала без перезагрузки страницы`);
    ok(await G(p, () => !!window.__MC3D_GAME__.meta.state?.verified), `${tag}: профиль аккаунта (verified)`);
    ok(await G(p, () => !window.Clerk.__props.length || window.Clerk.__props[window.Clerk.__props.length - 1].options?.localization === undefined), `${tag}: язык окна сайта вернули как было`);
    const id0 = await G(p, () => window.__MC3D_GAME__.state().myId);
    await G(p, () => window.__MC3D_GAME__.debug?.teleport?.(700, 640)); await sleep(1200);
    const pos0 = await G(p, () => ({ ...window.__MC3D_GAME__.state().player }));
    // сессия пропала посреди игры
    await G(p, () => window.Clerk.__setUser(null)); await p.waitForSelector('.mc-auth:not([hidden])', { timeout: 15000 }); await sleep(500);
    const note = await G(p, () => document.querySelector('[data-note]')?.innerText || '');
    ok(/Сессия истекла/.test(note) && /MC-A02/.test(note), `${tag}: «Сессия истекла» + код MC-A02 («${note.replace(/\s+/g, ' ')}»)`);
    ok(await G(p, () => window.__MC3D_GAME__.state().net.open), `${tag}: связь с игрой не разорвана, пока открыт оверлей`);
    await p.screenshot({ path: `${OUT}/stub-${tag}-2-expired.png` });
    // тот же аккаунт снова → без переподключения (состояние не трогаем)
    await G(p, (id) => window.Clerk.__setUser(id), `user_gl_${tag}`); await sleep(1500);
    ok(!(await visible(p, '.mc-auth')), `${tag}: вошёл снова — оверлей закрыт`);
    ok(await G(p, () => window.__MC3D_GAME__.state().myId) === id0, `${tag}: тот же аккаунт — без переподключения (myId тот же)`);
    // другой аккаунт → переподключение на той же позиции
    await G(p, () => window.Clerk.__setUser(null)); await p.waitForSelector('.mc-auth:not([hidden])', { timeout: 15000 });
    await G(p, (id) => window.Clerk.__setUser(id), `user_gl_${tag}_2`);
    await p.waitForFunction((a) => window.__MC3D_GAME__.state().myId && window.__MC3D_GAME__.state().myId !== a, id0, { timeout: 20000 }).catch(() => {});
    await sleep(2500);
    const pos1 = await G(p, () => ({ ...window.__MC3D_GAME__.state().player }));
    ok(await G(p, () => window.__MC3D_GAME__.state().myId) !== id0, `${tag}: другой аккаунт — переподключение`);
    ok(Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y) < 40, `${tag}: позиция сохранена (${Math.round(pos0.x)},${Math.round(pos0.y)} → ${Math.round(pos1.x)},${Math.round(pos1.y)})`);
    ok(await G(p, () => window.__MC3D_GAME__.state().net.open && !window.__MC3D_GAME__.state().net.offline), `${tag}: после переподключения онлайн`);
    // сервер не принял токен: первый раз — тихий повтор со свежим токеном, второй — оверлей MC-A03
    const id1 = await G(p, () => window.__MC3D_GAME__.state().myId);
    await G(p, () => window.__MC3D_GAME__.net.emit('auth_invalid', { code: 'MC-A03' }));
    await p.waitForFunction((a) => window.__MC3D_GAME__.state().myId !== a, id1, { timeout: 20000 }).catch(() => {});
    ok(await G(p, () => window.__tokFresh >= 1), `${tag}: auth_invalid → токен без кэша (skipCache) и переподключение`);
    ok(!(await visible(p, '.mc-auth')), `${tag}: первый auth_invalid — без оверлея`);
    await sleep(1500);
    await G(p, () => window.__MC3D_GAME__.net.emit('auth_invalid', { code: 'MC-A03' }));
    await p.waitForSelector('.mc-auth:not([hidden])', { timeout: 15000 }).catch(() => {});
    ok(/MC-A03/.test(await G(p, () => document.querySelector('[data-note]')?.innerText || '')), `${tag}: повторный auth_invalid — оверлей с MC-A03`);
    ok(await visible(p, '[data-relogin]'), `${tag}: при живой, но непринятой сессии — «Войти заново» (а не мгновенное закрытие)`);
    await p.screenshot({ path: `${OUT}/stub-${tag}-3-invalid.png` });
    const id2 = await G(p, () => window.__MC3D_GAME__.state().myId);
    await p.click('[data-relogin]'); await p.waitForSelector('#stub-in', { timeout: 10000 });
    ok(await G(p, () => window.__signOuts === 1 && window.__navs === 0), `${tag}: «Войти заново» — выход из сессии без перезагрузки`);
    await p.click('#stub-in');
    await p.waitForFunction((a) => window.__MC3D_GAME__.state().myId !== a, id2, { timeout: 20000 }).catch(() => {});
    ok(!(await visible(p, '.mc-auth')) && await G(p, (a) => window.__MC3D_GAME__.state().myId !== a, id2), `${tag}: новый вход → переподключение`);
    await sleep(1500);
    await G(p, () => window.__MC3D_GAME__.net.emit('auth_invalid', { code: 'MC-A03' }));
    await p.waitForSelector('[data-guest]:visible', { timeout: 15000 }).catch(() => {});
    await p.click('[data-guest]'); await sleep(3000);
    ok(await G(p, () => window.__MC3D_GAME__.state().net.open && window.__MC3D_GAME__.meta.state && window.__MC3D_GAME__.meta.state.verified === false), `${tag}: «Играть как гость» — переподключился гостем`);
    ok(s.errs.length === 0, `${tag}: ошибок в консоли нет${s.errs.length ? ' — ' + s.errs.join(' | ') : ''}`);
    await s.ctx.close();
  }

  // ── 3. гость сразу «Играть как гость»; затем вход кнопкой в шапке (сессия появилась) → переподключение аккаунтом ──
  {
    const s = await open(b, { mobile: false, stub: { user: null }, name: 'pc-guest' });
    await s.p.click('#btn-start'); await s.p.waitForSelector('.mc-auth:not([hidden])');
    await s.p.click('[data-guest]'); await waitGame(s.p); await sleep(2000);
    ok(await G(s.p, () => window.__MC3D_GAME__.meta.state?.verified === false), 'гость: играет гостем');
    const id0 = await G(s.p, () => window.__MC3D_GAME__.state().myId);
    await G(s.p, () => window.Clerk.__setUser('user_gl_header'));
    await s.p.waitForFunction((a) => window.__MC3D_GAME__.state().myId !== a && window.__MC3D_GAME__.meta.state?.verified, id0, { timeout: 20000 }).catch(() => {});
    ok(await G(s.p, () => !!window.__MC3D_GAME__.meta.state?.verified), 'гость вошёл (шапка сайта) — переподключение аккаунтом без перезагрузки');
    ok(s.errs.length === 0, `гость: ошибок в консоли нет${s.errs.length ? ' — ' + s.errs.join(' | ') : ''}`);
    await s.ctx.close();
  }

  // ── 4. вернулись со входа Google/Discord/Twitch (полная загрузка с #mc-auth-done) → «Продолжить» ──
  {
    const s = await open(b, { mobile: true, stub: { user: 'user_gl_oauth' }, name: 'oauth' });
    await s.p.evaluate(() => sessionStorage.setItem('mc-auth-pending', String(Date.now())));
    await s.p.goto(assertLocalUrl(`${BASE}?ws=${encodeURIComponent(WS)}&mobile=1&back=1#mc-auth-done`)); await sleep(2500);
    ok(/Продолжить/.test(await s.p.textContent('#btn-start')) && await visible(s.p, '#auth-back'), 'возврат после OAuth: «✓ Вход выполнен» и «Продолжить»');
    ok(!/#mc-auth-done/.test(s.p.url()), 'возврат после OAuth: служебный #mc-auth-done убран из адреса');
    await s.p.screenshot({ path: `${OUT}/stub-phone-4-oauth-return.png` });
    await s.ctx.close();
  }
  await b.close();
  console.log(fails ? `FAILED ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
