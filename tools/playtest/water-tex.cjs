// LOCAL ONLY: непроходимая вода (сервер + предсказание клиента) и настройка «Текстуры: новые (32) / старые (16)».
// Для TEX=32 и TEX=16 (через ?tex=): идём от берега в пруд Поляны — остаёмся на суше; телепорт в середину пруда — выносит
// на сушу и сервер согласен; замер памяти канвасов земли и fps; скриншоты Поляны и биомов Аринара.
// NODE_PATH=... node tools/playtest/water-tex.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/water-tex';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
const MODES = (process.env.TEXS || '32,16').split(','), VIEW = process.env.VIEW || 'pc';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const perf = {};
  for (const T of MODES) {
    const mob = VIEW === 'mobile';
    const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 760 } });
    const blocked = await guardLocal(ctx);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    let myId = null, srv = null;
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (!myId || !s.includes('"players_state"')) return; try { const m = JSON.parse(s); const me = (m.players || []).find((q) => q.id === myId); if (me) srv = { x: me.x, y: me.y }; } catch {} }));
    const uid = 'wt_' + T + Date.now().toString(36);
    await p.goto(assertLocalUrl(`${BASE}?name=Вода${T}&uid=${uid}&ws=${WS}&fs=1&debug=1&tex=${T}${mob ? '&mobile=1' : ''}`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
    const G = (f, a) => p.evaluate(f, a);
    await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
    myId = await G(() => window.__game.debug.myId());
    const tex = await G(() => window.__game.debug.tex()); ok(tex.mode === T, `текстуры ${T}: режим ${tex.mode}, земля ${tex.mb} МБ (${tex.canvases} канв.)`);
    // пруд Поляны: клетка воды с сушей на западе и водой сверху/снизу (иначе вдоль кромки берега можно идти — так задумано)
    // пруд Поляны (worldLayout.ts: центр 1000,1000, r 70): западная клетка воды в ряду через центр
    const spot = await G(() => { const K = (x, y) => window.__game.debug.liquid(x, y).kind; const y = 1008; if (K(1008, y) !== 1) return null; let x = 1008; while (K(x - 32, y) === 1) x -= 32; return { x, y }; });
    ok(!!spot, `найден берег пруда ${JSON.stringify(spot)}`);
    if (spot) {
      await G(([x, y]) => window.__game.debug.tp(x, y), [spot.x - 70, spot.y]); await sleep(1500);
      await p.keyboard.down('d'); await sleep(2200); await p.keyboard.up('d'); await sleep(800);
      const me = await G(() => { const s = window.__game.state(); return { x: s.x ?? s.player?.x, y: s.y ?? s.player?.y }; });
      const lq = await G(() => window.__game.debug.liquid());
      ok(!lq.blocked && me.x < 1000 - 16, `идём в пруд — не в воде, середины не достигли (${Math.round(me.x)},${Math.round(me.y)}; берег неровный — скольжение по кромке)`);
      await p.screenshot({ path: `${OUT}/tex${T}-${VIEW}-hub-shore.png` });
      ok(srv && Math.hypot(srv.x - me.x, srv.y - me.y) < 24, `сервер согласен с клиентом (${srv && Math.round(srv.x)},${srv && Math.round(srv.y)})`);
      // телепорт прямо в пруд — выносит на сушу
      await G(([x, y]) => window.__game.debug.tp(x, y), [spot.x + 48, spot.y]); await sleep(2500);
      const lq2 = await G(() => window.__game.debug.liquid()); const me2 = await G(() => { const s = window.__game.state(); return { x: s.x ?? s.player?.x, y: s.y ?? s.player?.y }; });
      ok(!lq2.blocked, `стоявший в воде вынесен на сушу (${Math.round(me2.x)},${Math.round(me2.y)})`);
      await sleep(1200); ok(srv && !(await G(([x, y]) => window.__game.debug.liquid(x, y).blocked, [srv.x, srv.y])), `и на сервере не в воде (${srv && Math.round(srv.x)},${srv && Math.round(srv.y)})`);
      await p.screenshot({ path: `${OUT}/tex${T}-${VIEW}-hub-nudged.png` });
    }
    const fps = () => G(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const fr = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(fr); else r(Math.round(n / 3)); }; requestAnimationFrame(fr); }));
    perf[T] = { hub: { ...(await G(() => window.__game.debug.tex())), fps: await fps(), heapMB: await G(() => Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)) } };
    await G(() => window.__game.debug.teleport(600, 640)); await sleep(1500); await p.screenshot({ path: `${OUT}/tex${T}-${VIEW}-hub.png` });
    // Аринар: биомы
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(1800); }
    for (const [nm, x, y] of [['arinar-hub', 24000, 24150], ['ice', 25154, 28989], ['fire', 18261, 20917], ['stone', 16222, 23693], ['air', 26175, 18540]]) {
      await G(([x, y]) => window.__game.debug.tp(x, y), [x, y]); await sleep(6000);
      await p.screenshot({ path: `${OUT}/tex${T}-${VIEW}-${nm}.png` });
    }
    perf[T].arinar = { ...(await G(() => window.__game.debug.tex())), fps: await fps(), heapMB: await G(() => Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)) };
    ok(!errs.length, `${T}: без ошибок страницы ${errs.join(' | ')}`); ok(!blocked.length, `${T}: нет внешних запросов`);
    await ctx.close();
  }
  console.log('perf', JSON.stringify(perf));
  console.log(fails ? `FAILED ${fails}` : 'water-tex ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
