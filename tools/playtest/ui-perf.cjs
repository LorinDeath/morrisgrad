// LOCAL ONLY: нагрузка и надёжность изменений ветки ui-cursed-rework (тема, атмосфера, HUD в поле, слот PK, размер интерфейса).
// На каждой конфигурации (ПК/телефон × новая/старая тема): 1) покой 6 с — cpu мс/кадр (api.perf), раскладки и пересчёты стилей
// в секунду и на кадр (CDP Performance: LayoutCount/RecalcStyleCount — «дёрганье раскладки» = больше 1 раскладки на кадр),
// число DOM-узлов; 2) ползунок «🔍 Размер интерфейса» 70→150 шагами по 5 — время одного шага (пересчёт + раскладка) и
// худший кадр во время протяжки; 3) 10 циклов открыть/закрыть Настройки, книгу, C, диалог — прирост DOM-узлов и
// обработчиков событий (после сборки мусора) ≈ 0; 4) ошибки консоли и страницы. Swiftshader: абсолютный fps низкий — сравнивать
// конфигурации между собой. Итог: OUT/perf.json.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/ui-scale';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game-panel.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const CONF = [['pc-new', 1280, 720, 0, 'new'], ['pc-old', 1280, 720, 0, 'old'], ['mob-new', 844, 390, 1, 'new'], ['mob-old', 390, 844, 1, 'old']];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const res = {};
  for (const [tag, W, H, mob, theme] of CONF) {
    if (process.env.ONLY && !tag.includes(process.env.ONLY)) continue;
    const ctx = await b.newContext(mob ? { viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: W, height: H } });
    await guardLocal(ctx); await ctx.addInitScript((t) => { try { localStorage.setItem('mc_ui_theme', t); localStorage.setItem('mc_hud_old', '0'); } catch {} }, theme);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('page: ' + String(e).slice(0, 160)));
    p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|favicon|net::ERR|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    await p.goto(assertLocalUrl(`${mob ? BASE.replace('game-panel.html', 'game.html') : BASE}?name=Перф&uid=perf_${tag}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`), { timeout: 180000, waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    const G = (f, a) => p.evaluate(f, a);
    await G(() => window.__game.debug.selectClass('warrior')); await sleep(4000);
    const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
    const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const gcNodes = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(300); const m = await met(); return { nodes: m.Nodes, lis: m.JSEventListeners, dom: await G(() => document.getElementsByTagName('*').length) }; };
    // 1) покой
    const frames = () => G(() => new Promise((r) => { const t = []; let last = performance.now(); const f = (n) => { t.push(n - last); last = n; if (t.length < 400 && n - t0 < 6000) requestAnimationFrame(f); else r(t); }; const t0 = performance.now(); requestAnimationFrame(f); }));
    const m0 = await met(); const ft = await frames(); const m1 = await met(); const perf = await G(() => window.__game.perf());
    const secs = (m1.Timestamp - m0.Timestamp), nf = ft.length, srt = [...ft].sort((a, c) => a - c);
    const idle = { fps: +(nf / secs).toFixed(1), p95ms: +srt[Math.floor(nf * 0.95)].toFixed(1), cpuMs: perf.cpuMs, layoutsPerFrame: +((m1.LayoutCount - m0.LayoutCount) / nf).toFixed(2), stylePerFrame: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / nf).toFixed(2),
      layoutMsPerS: +(((m1.LayoutDuration - m0.LayoutDuration) * 1000) / secs).toFixed(2), styleMsPerS: +(((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000) / secs).toFixed(2), domNodes: await G(() => document.getElementsByTagName('*').length) };
    console.log('INFO', `${tag}: покой ${idle.fps} fps (p95 ${idle.p95ms} мс, cpu ${idle.cpuMs} мс/кадр), раскладок на кадр ${idle.layoutsPerFrame}, стилей ${idle.stylePerFrame}, раскладка ${idle.layoutMsPerS} мс/с, стили ${idle.styleMsPerS} мс/с, DOM ${idle.domNodes}`);
    // 2) протяжка ползунка размера
    await G(() => window.__game.openPeople('settings')); await sleep(900);
    const drag = await G(async () => { if (!window.__mcUiScale) return { na: true }; const r = document.querySelector('[data-uis]'); if (!r) return null; const steps = []; let worst = 0, last = performance.now(), run = true;
      const f = (n) => { worst = Math.max(worst, n - last); last = n; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
      for (let v = 70; v <= 150; v += 5) { const t = performance.now(); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); void document.body.offsetHeight; steps.push(performance.now() - t); await new Promise((q) => setTimeout(q, 60)); }
      r.dispatchEvent(new Event('change', { bubbles: true })); const t = performance.now(); void document.body.offsetHeight; const rel = performance.now() - t; run = false;
      return { stepAvg: +(steps.reduce((a, c) => a + c, 0) / steps.length).toFixed(2), stepMax: +Math.max(...steps).toFixed(2), release: +rel.toFixed(2), worstFrame: +worst.toFixed(1) }; });
    await G(() => document.querySelector('[data-uisdef]')?.click()); await G(() => { const o = window.__game.debug.overlay; if (o.screen) o.hideScreen(true); }); await sleep(500);
    if (!drag?.na) ok(!!drag && drag.stepMax < 50, `${tag}: ползунок 70→150 — шаг (пересчёт+раскладка) в среднем ${drag?.stepAvg} мс, худший ${drag?.stepMax} мс, отпускание ${drag?.release} мс, худший кадр ${drag?.worstFrame} мс`);
    // 3) окна: 10 циклов
    // закрываем как игрок: Esc, затем ✕ (прямой hideScreen оставлял открытым состояние соц. окна — оно перерисовывалось)
    const cycle = async () => { for (const fn of [() => window.__game.openPeople('settings'), () => window.__game.debug.openBook(), () => window.__game.toggleCharSheet?.(), () => window.__game.debug.vn('alzi', 'calm', 'Проверка.')]) {
      await G(fn).catch(() => {}); await sleep(250); await p.keyboard.press('Escape'); await sleep(150);
      await G(() => { document.querySelector('.mc3d-screen:not(.mc-ghost) :is(.mc-soc-x, [data-close])')?.click(); if (window.__game.book.isOpen) window.__game.book.close(); const o = window.__game.debug.overlay; if (o.screen) o.hideScreen(); }); await sleep(250); } };
    await cycle(); // прогрев: книга строит содержимое один раз
    const n0 = await gcNodes();
    for (let i = 0; i < 10; i++) await cycle();
    await sleep(800); const n1 = await gcNodes();
    const bub = await G(() => document.querySelectorAll('.mc3d-bubble').length); res.bub = bub; ok(n1.dom - n0.dom <= 8 && n1.lis - n0.lis <= 20, `${tag}: 40 открытий/закрытий окон — DOM ${n0.dom} → ${n1.dom}, узлы (с отсоединёнными) ${n0.nodes} → ${n1.nodes}, обработчики ${n0.lis} → ${n1.lis}`);
    ok(!errs.length, `${tag}: без ошибок консоли/страницы${errs.length ? ': ' + [...new Set(errs)].slice(0, 4).join(' | ') : ''}`);
    res[tag] = { idle, drag, windows: { before: n0, after: n1 }, errors: errs.length };
    await ctx.close();
  }
  require('fs').writeFileSync(`${OUT}/perf-${process.env.TAG || 'branch'}.json`, JSON.stringify(res, null, 1));
  console.log(fails ? `ui-perf FAILED (${fails})` : 'ui-perf ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
