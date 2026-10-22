// LOCAL ONLY: вход в игру со страницы сайта (ссылка /MorrisCurse) — проверка, что не всплывает MC-L04 (кэш ресурсов).
// Сценарии: свежий профиль, повторный вход, перезагрузка с Shift (страница без управления SW), ПК и телефон.
// SITE=http://127.0.0.1:8993 node tools/playtest/l04-site-entry.cjs [out-dir]
const fs = require('fs');
process.env.AC_SITE = process.env.SITE || process.env.AC_SITE || 'http://127.0.0.1:8993';
process.env.AC_LOG = process.env.AC_LOG || '/workspace/mg-l04-site.log';
const L = require('./ac-lib.cjs');
const OUT = process.argv[2] || '/workspace/mg-l04-repro';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function enter(ctx, label, { from = '/', reloadBypass = false, soft = false } = {}) {
  const p = ctx.pages()[0] || (await ctx.newPage()); const logs = [];
  // soft: эмулировать старый сайт (мягкий переход ClientRouter в игру) — глушим правило Layout до того, как оно сработает

  p.removeAllListeners('console'); p.on('console', (m) => { const t = m.text(); if (/mc-err|mc-assets|\[sw\]/.test(t)) logs.push(t.slice(0, 300)); });
  await p.goto(L.SITE + from, { waitUntil: 'domcontentloaded' });
  if (soft) await p.evaluate(() => { window.addEventListener('astro:before-preparation', (e) => e.stopPropagation(), { capture: true }); });
  const link = p.locator('a[href="/MorrisCurse"]').first();
  await Promise.all([p.waitForURL(/\/MorrisCurse/), link.click()]);
  if (reloadBypass) { const cdp = await ctx.newCDPSession(p); await cdp.send('Page.reload', { ignoreCache: true }); await p.waitForLoadState('domcontentloaded'); }
  await p.waitForLoadState('domcontentloaded'); // ui-drag: автозапуск — кнопки «Начать игру» больше нет (если есть — жмём)
  const ev = async (fn) => { for (let i = 0; ; i++) { try { return await p.evaluate(fn); } catch (e) { if (i > 5 || !/context was destroyed|navigation/i.test(String(e))) throw e; await p.waitForLoadState('domcontentloaded').catch(() => {}); await L.sleep(300); } } }; // автозапуск: загрузчик может перезагрузить страницу
  const pre = await ev(() => ({ url: location.href, ctl: !!navigator.serviceWorker?.controller, doc: new URL(performance.getEntriesByType('navigation')[0].name).pathname }));
  if (await p.locator('#btn-start').count()) await p.click('#btn-start');
  const g = p.locator('[data-guest]'); await g.waitFor({ state: 'visible', timeout: 15000 }).then(() => g.click()).catch(() => {}); // гость (Clerk в стенде заблокирован)
  await p.waitForFunction(() => window.__mcAssets && window.__mcAssets.AC.stats.t && 'claim' in window.__mcAssets.AC.stats.t, null, { timeout: 90000 }).catch(() => {});
  await L.sleep(600);
  const st = await ev(() => ({ mode: window.__mcAssets?.AC.mode, t: window.__mcAssets?.AC.stats.t, errs: (window.__mcErrLog || []).map((e) => e.code), toast: document.querySelector('.mcl-err')?.dataset.code || null, ctl: !!navigator.serviceWorker?.controller, inScope: window.__mcAssets?.AC.stats.inScope, swWas: window.__mcAssets?.AC.stats.swWas || 0, quiet: (window.__mcErrLog || []).filter((e) => e.quiet).map((e) => e.code) }));
  await p.screenshot({ path: `${OUT}/${label}.png` });
  const l04 = logs.filter((s) => /MC-L04/.test(s)); st.l04toast = (st.errs || []).filter((c) => c === 'MC-L04').length > (st.quiet || []).filter((c) => c === 'MC-L04').length;
  console.log('·', label, JSON.stringify({ pre, ...st, l04 }));
  return { pre, ...st };
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [dev, opt] of [['pc', {}], ['phone', { mobile: true }], ['pcsoft', {}]]) {
    const dir = `/workspace/mg-l04-repro/prof-${dev}`; fs.rmSync(dir, { recursive: true, force: true });
    const ctx = await L.launch(dir, { ...opt, netGuard: true });
    if (dev === 'phone') await ctx.close().then(() => 0);
    const c = dev === 'phone' ? await require('playwright-core').chromium.launchPersistentContext(dir, { executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'], viewport: { width: 390, height: 800 }, userAgent: IPHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }) : ctx;
    if (dev === 'pcsoft') { // свежий профиль, вход ТОЛЬКО мягким переходом (страница сайта открыта до выкладки) — проверка запасного пути загрузчика
      for (const n of ['1-fresh', '2-repeat']) { const e = await enter(c, `${dev}-${n}`, { soft: true }); ok(!e.l04toast && e.mode === 'sw' && e.pre.doc === '/', `${dev} ${n}: мягкий переход (doc ${e.pre.doc}) — без плашки MC-L04, mode ${e.mode}, тихих L04: ${e.quiet.filter((q) => q === 'MC-L04').length}`); }
      await c.close(); continue;
    }
    const a = await enter(c, `${dev}-1-fresh`);
    ok(!a.errs.includes('MC-L04') && a.mode === 'sw', `${dev}: первый вход с сайта без MC-L04 (mode ${a.mode})`);
    const b = await enter(c, `${dev}-2-repeat`);
    ok(!b.errs.includes('MC-L04') && b.mode === 'sw', `${dev}: повторный вход с сайта без MC-L04 (mode ${b.mode})`);
    ok(b.ctl === true || process.env.BEFORE === '1', `${dev}: повторный вход с сайта — страница под управлением SW (ctl ${b.ctl})`);
    const d = await enter(c, `${dev}-3-hardreload`, { reloadBypass: true });
    ok(!d.errs.includes('MC-L04'), `${dev}: вход после Ctrl+F5 (без управления SW) без MC-L04 (mode ${d.mode})`);
    // запасной путь загрузчика: документ всё же пришёл мягким переходом (старая страница сайта в открытой вкладке, будущие ссылки) — без плашки
    const e = await enter(c, `${dev}-4-softnav`, { soft: true });
    ok(!e.l04toast && e.mode === 'sw', `${dev}: мягкий переход сайта (документ вне scope) — без плашки MC-L04, кэш работает (mode ${e.mode}, doc ${e.pre.doc})`);
    await c.close();
  }
  console.log(fails ? `FAILS: ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
