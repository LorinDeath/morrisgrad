// LOCAL ONLY: страница «Проклятых» (src/pages/MorrisCurse/index.astro) — автозапуск без «Начать игру», окно игры на всё окно,
// полный экран по первому жесту (один раз), Esc → остаёмся «на всё окно» без сдвига, меню/окна игры по Esc работают, ресайз.
// Страница — astro dev этой ветки (FW_BASE), сервер — wrangler dev (FW_WS, локальная D1). Clerk — заглушка в браузере теста (как guest-login.cjs).
const { chromium } = require('playwright-core');
const { assertLocalUrl, LOCAL } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-qol/shots/fullwin';
const BASE = process.env.FW_BASE || 'http://127.0.0.1:4375/MorrisCurse';
const WS = process.env.FW_WS || 'ws://127.0.0.1:8975';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, bad = 0; const t = (m, c, d) => { n++; if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + m + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const STUB = (init) => {
  const L = new Set(); const user = init.user ? { id: init.user } : null;
  const st = () => ({ user, session: user ? C.session : null, client: {}, organization: null });
  const C = window.Clerk = { loaded: false, user, session: user ? { id: 's_' + user.id, getToken: async () => '' } : null,
    load() { this.loaded = true; setTimeout(() => L.forEach((f) => f(st())), 0); return Promise.resolve(); },
    addListener(f) { L.add(f); if (this.loaded) f(st()); return () => L.delete(f); },
    __unstable__updateProps() { return Promise.resolve(); },
    mountSignIn(el) { el.innerHTML = '<div class="cl-rootBox" style="padding:24px;color:#ccc">[заглушка Clerk]</div>'; }, mountSignUp() {}, unmountSignIn() {}, unmountSignUp() {}, openSignIn() {}, async signOut() {} };
  setTimeout(() => { if (!C.loaded) C.load({}); }, 300);
};
async function open(b, { mobile, user, tag }) {
  const ctx = await b.newContext(mobile ? { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' } : { viewport: { width: 1366, height: 800 }, screen: { width: 1366, height: 800 } });
  const blocked = [];
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (LOCAL.test(u) || /^(data|blob|about|chrome|devtools):/.test(u)) return r.continue(); blocked.push(u); return r.abort(); });
  if (ctx.routeWebSocket) await ctx.routeWebSocket(/.*/, (ws) => { if (LOCAL.test(ws.url())) return ws.connectToServer(); blocked.push(ws.url()); ws.close(); });
  await ctx.addCookies([{ name: 'mg_dev_noclerk', value: '1', url: new URL(BASE).origin }]);
  await ctx.addInitScript(STUB, { user });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') { const x = m.text(); if (!/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(x)) errs.push('console: ' + x.slice(0, 200)); } });
  await p.goto(assertLocalUrl(`${BASE}?ws=${encodeURIComponent(WS)}&debug=1${mobile ? '&mobile=1' : ''}`));
  return { ctx, p, errs, blocked, tag, mobile };
}
const G = (p, f, a) => p.evaluate(f, a);
const geo = (p) => G(p, () => { const w = document.getElementById('game-window').getBoundingClientRect(), c = document.getElementById('game-canvas').getBoundingClientRect(), h = document.querySelector('.mc3d-hud, .mc-hud, #mc-hud')?.getBoundingClientRect?.();
  return { iw: innerWidth, ih: innerHeight, w: [w.x, w.y, w.width, w.height].map(Math.round), c: [c.x, c.y, c.width, c.height].map(Math.round), sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, sy: scrollY, fs: !!document.fullscreenElement }; });
const full = (g) => g.w[0] === 0 && g.w[1] === 0 && Math.abs(g.w[2] - g.iw) <= 1 && Math.abs(g.w[3] - g.ih) <= 1 && Math.abs(g.c[2] - g.iw) <= 2 && Math.abs(g.c[3] - g.ih) <= 2;
const waitGame = (p) => p.waitForFunction(() => window.__MC3D_GAME__?.state?.().myId && window.__MC3D_GAME__?.state?.().mode === 'hub', null, { timeout: 150000 });

async function run(b, mobile) {
  const tag = mobile ? 'mob' : 'pc';
  const s = await open(b, { mobile, user: `user_fw_${tag}`, tag }); const p = s.p;
  // 1. открытие — без нажатий
  const t0 = Date.now(); let started = true; await waitGame(p).catch(() => { started = false; });
  t(`${tag}: игра стартует сама, без нажатий (${Math.round((Date.now() - t0) / 1000)} с)`, started);
  await sleep(2500);
  const dom = await G(p, () => ({ start: !!document.getElementById('btn-start'), title: !!document.querySelector('.game-title'), hdr: !!document.querySelector('header, footer, .site-header, .site-footer, nav.main-nav'), h1: !!document.querySelector('h1'), alk: /Альказак/.test(document.body.innerText), bare: document.body.classList.contains('mc-bare'),
    meta: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'), ac: window.__mcAC?.state || null }));
  t(`${tag}: нет «Начать игру», нет отладочного заголовка, нет шапки/подвала`, !dom.start && !dom.title && !dom.hdr && !dom.h1 && !dom.alk && dom.bare, dom);
  t(`${tag}: meta standalone (iOS «На экран Домой»)`, dom.meta);
  let g = await geo(p);
  t(`${tag}: окно игры = всё окно, прокрутки нет`, full(g) && g.sh <= g.ih && g.sw <= g.iw && !g.fs, g);
  await p.screenshot({ path: `${OUT}/${tag}-01-open.png` });
  // прокрутка/свайп не двигает страницу
  await G(p, () => window.scrollTo(0, 500)); await p.mouse.wheel(0, 600).catch(() => {}); await sleep(300);
  t(`${tag}: страница не прокручивается`, (await G(p, () => scrollY + document.documentElement.scrollTop)) === 0);
  // 2. первый жест — полный экран + звук
  if (mobile) await p.touchscreen.tap(g.iw / 2, g.ih / 2 - 40); else await p.mouse.click(g.iw / 2, g.ih / 2 - 40);
  await sleep(1200);
  const g1 = await geo(p), ac1 = await G(p, () => window.__mcAC?.state || null);
  t(`${tag}: первый жест → полный экран`, g1.fs, g1);
  t(`${tag}: первый жест → звук разблокирован (AudioContext)`, ac1 === 'running' || ac1 === 'suspended', ac1);
  t(`${tag}: в полном экране окно игры = всё окно`, full(g1), g1);
  await p.screenshot({ path: `${OUT}/${tag}-02-after-click.png` });
  // 3. Esc браузера: выход из полного экрана (браузер Esc не передаёт странице) — раскладка та же
  const hud0 = await G(p, () => [...document.querySelectorAll('[data-ud]')].slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.ud, Math.round(r.x), Math.round(r.y)]; }));
  await G(p, () => document.exitFullscreen()); await sleep(1200);
  const g2 = await geo(p);
  t(`${tag}: после Esc — не полный экран, но всё окно, без сдвига`, !g2.fs && full(g2) && g2.sy === 0, g2);
  const hud1 = await G(p, () => [...document.querySelectorAll('[data-ud]')].slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.ud, Math.round(r.x), Math.round(r.y)]; }));
  t(`${tag}: блоки HUD на тех же местах после Esc`, JSON.stringify(hud0) === JSON.stringify(hud1) || hud0.every((a, i) => hud1[i] && Math.abs(a[1] - hud1[i][1]) <= 2 && Math.abs(a[2] - hud1[i][2]) <= 2), { hud0, hud1 });
  await p.screenshot({ path: `${OUT}/${tag}-03-after-esc.png` });
  // второй жест — полный экран повторно НЕ включается (один раз за загрузку)
  if (mobile) await p.touchscreen.tap(g.iw / 2 + 30, g.ih / 2 - 60); else await p.mouse.click(g.iw / 2 + 30, g.ih / 2 - 60);
  await sleep(900);
  t(`${tag}: следующий жест не включает полный экран снова`, !(await geo(p)).fs);
  // меню игры по Esc (клавиша доходит до игры вне полного экрана): открыть книгу и закрыть Esc
  if (!mobile) {
    await p.keyboard.press('j').catch(() => {}); await sleep(200);
    const opened = await G(p, () => { const a = window.__MC3D_GAME__; if (a.book && !a.book.isOpen) a.book.open?.(); return !!a.book?.isOpen; });
    await p.keyboard.press('Escape'); await sleep(500);
    const closed = await G(p, () => !window.__MC3D_GAME__.book?.isOpen);
    t(`${tag}: Esc в игре закрывает окно (меню игры работает)`, opened && closed, { opened, closed });
    t(`${tag}: Esc в игре не включает полный экран и не сдвигает окно`, !(await geo(p)).fs && full(await geo(p)));
  }
  // 4. ресайз окна (ПК / телефон поворот / Яндекс-контейнер)
  const sizes = mobile ? [[390, 844], [844, 390]] : [[1024, 640], [1600, 900], [820, 560]];
  for (const [w, h] of sizes) {
    await p.setViewportSize({ width: w, height: h }); await sleep(1000);
    const gr = await geo(p);
    t(`${tag}: ресайз ${w}×${h} — окно и канвас на всё окно`, full(gr) && gr.sh <= h, gr);
    if (mobile && w < h) await p.screenshot({ path: `${OUT}/${tag}-04-portrait.png` });
  }
  t(`${tag}: без ошибок страницы`, s.errs.length === 0, s.errs.slice(0, 3));
  console.log(`info ${tag}: оборвано не-локальных запросов ${s.blocked.length} (${[...new Set(s.blocked.map((u) => { try { return new URL(u).host; } catch (_) { return u; } }))].join(', ')})`);
  await s.ctx.close();
}
async function adminOff(b) { // админ-флаг UI.fsAuto выкл (последний известный — localStorage mc_fs_adm) и выбор игрока «авто выкл»
  for (const [k, v, why] of [['mc_fs_adm', '0', 'админ-флаг выкл'], ['mc_fs_auto', '0', 'игрок выключил авто']]) {
    const s = await open(b, { mobile: false, user: 'user_fw_pc', tag: 'pc' });
    await s.p.evaluate(([k, v]) => localStorage.setItem(k, v), [k, v]); await s.p.reload(); await waitGame(s.p).catch(() => {}); await sleep(1500);
    if (k === 'mc_fs_adm') await G(s.p, () => { window.__MC_FS_AUTO__ = false; });
    await s.p.mouse.click(600, 300); await sleep(1000);
    t(`pc: ${why} → первый клик не включает полный экран`, !(await geo(s.p)).fs);
    await s.p.evaluate((k) => localStorage.removeItem(k), k); await s.ctx.close();
  }
}
async function guest(b) { // гость: окно «Войти / Играть гостем» появляется само (без «Начать игру»), «гостем» → игра
  const s = await open(b, { mobile: false, user: null, tag: 'guest' }); const p = s.p;
  const gate = await p.waitForSelector('.mc-auth:not([hidden])', { timeout: 30000 }).then(() => true, () => false);
  t('гость: окно входа открывается само', gate);
  await p.screenshot({ path: `${OUT}/guest-01-gate.png` });
  await p.click('[data-guest]').catch(() => {}); const ok = await waitGame(p).then(() => true, () => false);
  t('гость: «Играть гостем» → игра', ok);
  await sleep(1500); t('гость: без ошибок страницы', s.errs.length === 0, s.errs.slice(0, 3));
  await s.ctx.close();
}
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const only = process.env.ONLY || '';
  if (!only || only === 'pc') await run(b, false);
  if (!only || only === 'mob') await run(b, true);
  if (!only || only === 'adm') await adminOff(b);
  if (!only || only === 'guest') await guest(b);
  await b.close(); console.log(`fullwin ${n - bad}/${n}`); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
