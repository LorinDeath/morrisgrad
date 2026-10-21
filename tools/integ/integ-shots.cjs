// LOCAL ONLY: обзорные снимки интеграционной сборки (integ-preview): город Альказак в НОВОМ интерфейсе (HUD в поле,
// круглая мини-карта), день/20:00/23:00, купол снаружи, окно C со счётом убийств, настройки «Интерфейс»/«Текстуры»,
// портал хаба (цвет без засветки), город на телефоне. Только 127.0.0.1 (guardLocal).
// NODE_PATH=/workspace/mc-ui-tools/node_modules I_BASE=http://127.0.0.1:5333 I_WS=ws://127.0.0.1:8933 node tools/integ/integ-shots.cjs
const { chromium } = require('playwright-core');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('../playtest/_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/integ';
const BASE = assertLocalUrl(process.env.I_BASE || 'http://127.0.0.1:5333'), WS = assertLocalUrl(process.env.I_WS || 'ws://127.0.0.1:8933');
const CX = 24624, CY = 3376; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m, x) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); if (!c) fails++; };
fs.mkdirSync(OUT, { recursive: true });
async function session(b, { mob, uid }) {
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: 1440, height: 860 } });
  const blocked = await guardLocal(ctx);
  await ctx.addInitScript((m) => { try { localStorage.setItem('mc_ui_theme', 'new'); if (!m) localStorage.setItem('mc_tex', '32'); } catch {} }, mob);
  const p = await ctx.newPage(); p.errs = []; p.blocked = blocked; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}/${mob ? 'game.html' : 'game-panel.html'}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  p.G = (f, a) => p.evaluate(f, a);
  if ((await p.G(() => window.__game.state().player?.stats?.classId)) == null) { await p.G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
  p.shot = async (n) => { await sleep(400); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', `${OUT}/${n}.png`); };
  p.esc = async () => { await p.keyboard.press('Escape'); await sleep(450); await p.G(() => { for (const x of document.querySelectorAll('.mc-soc-x, .mc-upg-x, .mc-altar .x')) if (x.offsetParent) x.click(); }); await sleep(250); };
  p.toArinar = async () => { for (let i = 0; i < 8 && (await p.G(() => window.__game.state().world)) !== 'arinar'; i++) { await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await p.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(2500); } };
  p.dev = async (o) => { await p.G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 8000 }).catch(() => {}); return p.G(() => window.__devCity); };
  p.tp = async (x, y) => { await p.G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1800); };
  p.pin = (m) => p.G((m) => window.__game.debug.dn({ pin: m }), m);
  p.cells = (n) => p.G((n) => window.__game.debug.setCells(n, true), n);
  return p;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // ——— портал хаба (цвет без засветки): новый герой стартует в хабе ———
  { const h = await session(b, { mob: false, uid: 'integ_portal_' + Date.now().toString(36) });
    ok((await h.G(() => window.__game.state().world)) !== 'arinar', 'новый герой — в хабе', await h.G(() => window.__game.state().world));
    await h.G(() => window.__game.debug.tp(212, 622, true)); await h.G(() => window.__game.debug.setZoom(1.1)); await sleep(3000); await h.mouse.move(2, 2); await h.shot('07-hub-portal');
    await h.G(() => window.__game.debug.setZoom(0.5)); await sleep(2500); await h.shot('07b-hub-wide');
    ok(!h.errs.length, 'хаб: без ошибок страницы', h.errs.slice(0, 3)); await h.context().close(); }
  // ——— ПК: новый интерфейс, текстуры 32, страница с колонками (как сайт) ———
  const p = await session(b, { mob: false, uid: 'city_admin' });
  const ui = await p.G(() => ({ ui: document.documentElement.classList.contains('mc-ui'), ig: document.documentElement.classList.contains('mc-hud-ig'), mm: !!document.querySelector('.mc-ighud #mm-canvas') }));
  ok(ui.ui && ui.ig && ui.mm, 'новый интерфейс: html.mc-ui + HUD в поле + круглая мини-карта', ui);
  // настройки
  for (let i = 0; i < 3 && !(await p.$('[data-act="uitheme"]')); i++) { await p.click('.mc-setbtn').catch(() => {}); await sleep(1000); }
  const st = await p.G(() => document.querySelector('.mc-soc')?.innerText || '');
  ok(/Интерфейс/.test(st) && /Текстуры/.test(st) && /Старые панели/.test(st), 'настройки: «Интерфейс», «Текстуры», «Старые панели»');
  await p.mouse.move(2, 2); await p.shot('06-settings'); await p.esc();
  // город
  await p.toArinar(); ok((await p.G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  await p.dev({ pk: false });
  await p.tp(CX, CY + 60); await p.pin('12:00'); await p.cells(34); await sleep(4000); await p.mouse.move(2, 2); await p.shot('01-city-day-wide');
  await p.cells(20); await sleep(2500); await p.shot('02-city-day-plaza');
  await p.pin('20:00'); await sleep(2500); await p.shot('03-city-2000');
  await p.pin('23:00'); await sleep(2500); await p.shot('04-city-2300');
  const dome0 = await p.G(() => window.__game.debug.city().dome);
  // купол снаружи (днём)
  await p.pin('12:00'); await p.tp(CX, CY + 1280 + 260); await p.cells(40); await sleep(4000);
  const dome1 = await p.G(() => window.__game.debug.city().dome); ok(true, 'купол: внутри / снаружи', { inside: dome0, outside: dome1 });
  await p.shot('05-dome-outside');
  // окно C со счётом убийств
  await p.tp(CX, CY + 60); await p.cells(24);
  await p.G(() => window.__game.debug.charSheet()); await p.waitForSelector('.mc-charsheet', { timeout: 10000 }).catch(() => {}); await sleep(1500);
  const kills = await p.G(() => document.querySelector('.mc-insp-kills')?.innerText || '');
  ok(/Игроков убито/.test(kills), 'окно C: «Счёт убийств»', kills.replace(/\s+/g, ' ').slice(0, 120));
  await p.mouse.move(2, 2); await p.shot('08-C-killstats'); await p.esc();
  await p.pin(null);
  ok(!p.errs.length, 'ПК: без ошибок страницы', p.errs.slice(0, 3)); ok(!p.blocked.length, 'ПК: нет внешних запросов', p.blocked.slice(0, 3));
  await p.context().close();
  // ——— телефон: город ———
  const m = await session(b, { mob: true, uid: 'city_mob' });
  await m.toArinar(); await m.tp(CX, CY + 60); await m.pin('12:00'); await sleep(4000); await m.shot('09-mobile-city');
  await m.pin('23:00'); await sleep(2500); await m.shot('10-mobile-city-2300'); await m.pin(null);
  ok(!m.errs.length, 'телефон: без ошибок страницы', m.errs.slice(0, 3)); ok(!m.blocked.length, 'телефон: нет внешних запросов', m.blocked.slice(0, 3));
  console.log(fails ? `integ-shots: FAILED ${fails}` : 'integ-shots ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(2); });
