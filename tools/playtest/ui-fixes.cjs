// LOCAL ONLY: точечные проверки раскладки (THEME new|old, TAG before|after):
//  ПК — диалог NPC не перекрывает панель навыков; телефон — кнопки лобби видны без прокрутки;
//  телефон — игровое поле занимает весь экран (нет чёрной полосы снизу). Скриншоты: OUT/<tag>-<theme>-<вид>-<что>.png
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const THEME = process.env.THEME || 'new', TAG = process.env.TAG || 'after';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/fixes';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const inter = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rectOf = (p, sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent || x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
async function open(b, view) {
  const mob = view === 'mobile';
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: 1280, height: 760 } });
  await guardLocal(ctx); await ctx.addInitScript((t) => { try { localStorage.setItem('mc_ui_theme', t); } catch {} }, THEME);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=Фикс&uid=fix_${view}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  return p;
}
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const nm = (v, w) => `${OUT}/${TAG}-${THEME}-${v}-${w}.png`;
  // 1) ПК: диалог NPC vs панель навыков
  { const p = await open(b, 'pc');
    const np = await p.evaluate(() => window.__game.debug.npcPos('petr') || window.__game.debug.npcSpawn('petr'));
    for (const [ox, oy] of [[40, 10], [30, 0], [-30, 0], [0, 30], [0, -30]]) { // рядом бывает портал — тогда пробуем другую сторону
      await p.evaluate(([x, y]) => window.__game.debug.teleport(x, y), [np.x + ox, np.y + oy]); await sleep(1500);
      await p.evaluate(() => window.__game.debug.interact()); await sleep(1800);
      if (await p.$('.mc-dialog-screen .mc-dialog')) break;
      await p.keyboard.press('Escape'); await sleep(400); await p.evaluate(() => window.__game.debug.close?.()); }
    await p.mouse.move(2, 2);
    const d = await rectOf(p, '.mc-dialog'), a = await rectOf(p, '.mc-abar-main');
    await p.screenshot({ path: nm('pc', 'npc-dialog') });
    if (THEME === 'old') console.log(`INFO старая тема не меняется (как было): диалог ${d && Math.round(d.y + d.h)} / панель ${a && Math.round(a.y)}`); else ok(!!d && !!a && !inter(d, a), `ПК: диалог NPC (${d && Math.round(d.y + d.h)}) не перекрывает панель навыков (${a && Math.round(a.y)})`);
    ok(!p.errs.length, 'ПК: без ошибок страницы ' + p.errs.join(' | ')); await p.context().close(); }
  // 2) телефон: лобби + 3) полоса снизу
  { const p = await open(b, 'mobile');
    const lay = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.y), Math.round(q.height)]; }; return { ih: innerHeight, vv: visualViewport?.height, svh: (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;height:100svh'; document.body.append(d); const h = d.getBoundingClientRect().height; d.remove(); return h; })(), screen: r('#game-screen') || r('.game-screen'), canvas: r('canvas') }; });
    console.log('INFO раскладка телефона', JSON.stringify(lay));
    await p.screenshot({ path: nm('mobile', 'hud') });
    const cv = lay.canvas || [0, 0];
    // как на сайте в полноэкранном режиме: шапка окна 46 px сверху + игровое поле до низа экрана (CSS резервирует ровно 46 px под шапку)
    ok(cv[0] + cv[1] >= lay.ih - 1, `телефон: игровое поле до низа экрана, без чёрной полосы (canvas ${cv[0]}+${cv[1]} из ${lay.ih})`);
    await p.evaluate(() => window.__game.debug.lobby()); await sleep(1500);
    const btns = await p.evaluate(() => [...document.querySelectorAll('.mc-lobby-screen .mc3d-btn')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), top: Math.round(r.y), bot: Math.round(r.y + r.height) }; }));
    await p.screenshot({ path: nm('mobile', 'lobby') });
    ok(btns.length > 0 && btns.every((x) => x.top >= 0 && x.bot <= 390), `телефон: кнопки лобби видны без прокрутки ${JSON.stringify(btns)}`);
    ok(!p.errs.length, 'телефон: без ошибок страницы ' + p.errs.join(' | ')); await p.context().close(); }
  console.log(fails ? `FAILED ${fails}` : 'ui-fixes ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
