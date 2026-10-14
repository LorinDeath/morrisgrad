// Клик по игроку: ПК — только всплывающее меню у курсора (без верхней плашки); телефон — только верхняя плашка. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async (uid, extra = '', opts = {}) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, ...opts }); await guardLocal(ctx); const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=${uid}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1${extra}`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game.debug.myId?.(), null, { timeout: 120000 }); await p.waitForTimeout(1500); return p; };
  const B = await mk('pt_click_b'); await B.evaluate(() => window.__game.debug.teleport(760, 800));
  const clickB = async (A, tap) => { await A.evaluate(() => window.__game.debug.teleport(700, 800)); await A.waitForTimeout(2500);
    const bp = await B.evaluate(() => window.__game.state().player); const sp = await A.evaluate(([x, y]) => window.__game.debug.screenOf(x, y), [bp.x, bp.y]);
    if (tap) await A.touchscreen.tap(sp.x, sp.y); else await A.mouse.click(sp.x, sp.y); await A.waitForTimeout(800);
    return { chip: await A.isVisible('.mc-tchip'), menu: await A.isVisible('.mc-pmenu') }; };
  const A = await mk('pt_click_a');
  let r = await clickB(A, false); await A.screenshot({ path: `${OUT}/party-ui-8-desktop-click.png` });
  ok(r.menu && !r.chip, 'ПК: клик по игроку — только меню у курсора ' + JSON.stringify(r));
  const M = await mk('pt_click_m', '&mobile=1', { hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
  r = await clickB(M, true); await M.screenshot({ path: `${OUT}/party-ui-9-mobile-tap.png` });
  ok(r.chip && !r.menu, 'телефон: тап по игроку — только верхняя плашка ' + JSON.stringify(r));
  ok(![A, B, M].some((p) => p.errs.length), 'без ошибок ' + [A, B, M].map((p) => p.errs.join('|')).join(' '));
  console.log(fails ? `FAILED ${fails}` : 'player-click ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
