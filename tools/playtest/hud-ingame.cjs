// LOCAL ONLY: HUD внутри игрового поля (новый интерфейс + «Старые панели: Выкл») против боковых колонок («Вкл»).
// VIEW=pc — страница с колонками (как сайт в полноэкранном режиме), VIEW=mobile — телефон. HUD=ig|old — выбор игрока.
// TAG=before — только скриншоты (код до изменения). Скриншоты: OUT/<tag>-<view>-<hud>-<NN>-<что>.png
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const VIEW = process.env.VIEW || 'pc', HUD = process.env.HUD || 'ig', TAG = process.env.TAG || 'after', THEME = process.env.THEME || 'new';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/hud-ingame';
const mob = VIEW === 'mobile';
const BASE = process.env.UI_BASE || `http://127.0.0.1:5311/${mob ? 'game.html' : 'game-panel.html'}`, WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const CHECK = TAG !== 'before';
const inter = (a, b) => a && b && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: 1280, height: 720 } });
  await guardLocal(ctx);
  await ctx.addInitScript(([t, h]) => { try { localStorage.setItem('mc_ui_theme', t); localStorage.setItem('mc_hud_old', h === 'old' ? '1' : '0'); } catch {} }, [THEME, HUD]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=Худ&uid=hud_${VIEW}${HUD}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); await S({ type: 'dev_grant', xp: 60000 }); await sleep(2500);
  let n = 0; const shot = async (w, clip) => { n++; await sleep(300); await p.screenshot({ path: `${OUT}/${TAG}-${VIEW}-${THEME === 'old' ? 'oldtheme' : HUD}-${String(n).padStart(2, '0')}-${w}.png`, ...(clip ? { clip } : {}) }); };
  const R = (sel) => G((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length || getComputedStyle(e).display === 'none' || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  const ig = () => G(() => document.documentElement.classList.contains('mc-hud-ig'));
  const W = mob ? 844 : 1280, H = mob ? 390 : 720;
  await p.mouse.move(W / 2, H / 3); await shot('hub');
  const wantIg = THEME === 'new' && HUD === 'ig';
  if (CHECK) {
    ok((await ig()) === wantIg, `режим HUD: html.mc-hud-ig ${wantIg ? 'есть' : 'нет'} (тема ${THEME}, «Старые панели» ${HUD === 'old' ? 'Вкл' : 'Выкл'})`);
    const mm = await R('#mm-canvas'), cv = await R('#game-canvas');
    if (wantIg) {
      ok(!(await R('.hud-left')) && !(await R('.hud-right')), 'боковые колонки скрыты');
      if (!mob) ok(cv && cv.w >= W - 2, `игровое поле на всю ширину (${cv && Math.round(cv.w)} из ${W})`);
      ok(!!mm && Math.abs(mm.w - mm.h) < 1 && (await G(() => getComputedStyle(document.querySelector('#mm-canvas')).borderRadius)) === '50%', `мини-карта круглая (${mm && Math.round(mm.w)}×${mm && Math.round(mm.h)})`);
      ok(!!mm && mm.x + mm.w <= W && mm.x > W * 0.6 && mm.y < H * 0.4, `мини-карта в правом верхнем углу поля (${mm && Math.round(mm.x)},${mm && Math.round(mm.y)})`);
      ok(await G(() => !!document.querySelector('.mc3d-layer .mc-ighud #mm-canvas')), 'мини-карта — часть игрового слоя (не колонки)');
      const tr = await R('.mc-tracker'), blk = await R('.ig-mm');
      ok(!inter(tr, blk), `трекер заданий не под мини-картой (трекер y=${tr && Math.round(tr.y)}, карта до ${blk && Math.round(blk.y + blk.h)})`);
      if (mob) { const tb = await G(() => [...document.querySelectorAll('.mc3d-tbtn, .mc3d-ttop, .mc-party')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, c: e.className }; }));
        const hit = tb.filter((r) => inter(r, blk)); ok(!hit.length, `телефон: карта не перекрывает тач-кнопки/отряд ${hit.map((h) => h.c).join(', ')}`); }
      else ok(!(await R('.ig-tgt')), 'без цели панели «Цель» нет');
    } else {
      if (!mob) { ok(!!(await R('.hud-left')) && !!(await R('.hud-right')), 'колонки на месте (как раньше)');
        ok(await G(() => !!document.querySelector('.hud-right #ghud-minimap-slot #mm-canvas')), 'мини-карта в правой колонке');
        const cs = await G(() => { const c = document.querySelector('#mm-canvas'); return [c.width, c.height, getComputedStyle(c).borderRadius]; }); ok(cs[0] === 220 && cs[1] === 150 && cs[2] !== '50%', `мини-карта прежняя: холст ${cs[0]}×${cs[1]}, скругление ${cs[2]}`); }
      ok(!(await R('.mc-ighud')), 'внутриигрового HUD нет');
    }
  }
  if (!mob) {
    // зум мини-карты: 1x → 2x → 3x (кроп)
    const crop = async (w) => { const r = (await R(wantIg ? '.ig-mm' : '.hud-minimap-card')) || { x: W - 300, y: 0, w: 300, h: 260 }; await shot(w, { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: Math.min(W - Math.max(0, r.x - 6), r.w + 12), height: r.h + 12 }); };
    await crop('minimap-1x');
    for (const z of ['2x', '3x']) { await p.click('#mm-btn-plus'); await sleep(700); if (CHECK) ok((await G(() => document.querySelector('#mm-zoom-text')?.textContent)) === z, `мини-карта: зум ${z}`); await crop('minimap-' + z); }
    await p.click('#mm-btn-minus'); await p.click('#mm-btn-minus'); await sleep(400);
    if (CHECK && wantIg) {
      await p.click('#mm-toggle-players'); await sleep(300); ok(await G(() => document.querySelector('#mm-toggle-players').classList.contains('mm-toggle-inactive')), 'кнопка «Игроки» на мини-карте работает'); await p.click('#mm-toggle-players');
      // всплывающие окна
      await p.click('.ig-b[data-ig="runs"]'); await sleep(500); ok(!!(await R('.ig-pop[data-pop="runs"] #ghud-run-rooms')), '⚔ — окно «Забеги (co-op)» с комнатами'); await shot('pop-runs');
      await p.click('.ig-b[data-ig="near"]'); await sleep(500); ok(!!(await R('.ig-pop[data-pop="near"] #ghud-nearby-list')) && !(await R('.ig-pop[data-pop="runs"]')), '👁 — окно «Рядом» (забеги закрылись)'); await shot('pop-near');
      await p.click('.ig-b[data-ig="near"]'); await sleep(300); ok(!(await R('.ig-pop.open')), 'повторный клик закрывает');
      await p.mouse.click(W / 2, H / 2); await sleep(200); await p.keyboard.press('Shift+Slash'); await sleep(500); ok(!!(await R('.ig-help.open .ig-help-w')), '«?» — окно «Управление»'); await shot('help');
      await p.keyboard.press('Escape'); await sleep(400); ok(!(await R('.ig-help.open')), 'Esc закрывает «Управление»');
      const net = await G(() => document.querySelector('.ig-net')?.title || ''); ok(/пинг/.test(net) && /в сети/.test(net), `индикатор сети: ${net.replace(/\n/g, ' / ')}`);
    }
  }
  // Аринар: лёд + цель
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  await G(([x, y]) => window.__game.debug.tp(x, y), [25154, 28989]); await sleep(6000); await p.mouse.move(W / 2, H / 3); await shot('arinar-ice');
  if (!mob) {
    const P = await G(() => { const s = window.__game.state(); return { x: s.x ?? s.player?.x, y: s.y ?? s.player?.y }; });
    await S({ type: 'dev_spawn_mob', mob: 'dew_slime', x: P.x + 90, y: P.y + 40, ench: 3, special: '', calm: true }); await sleep(1500);
    const m = await G(([x, y]) => window.__game.debug.zoneMobsFull().filter((o) => Math.hypot(o.x - x, o.y - y) < 300).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0], [P.x, P.y]);
    if (m) { await G((id) => window.__game.debug.selectMobId(id), m.id); await sleep(1800); }
    await p.mouse.move(W / 2, H / 3); await shot('arinar-target');
    if (CHECK) {
      const tgt = await R(wantIg ? '.ig-tgt' : '#ghud-target-details'), nm = await G(() => document.getElementById('ghud-target-name')?.textContent || '');
      ok(!!m && !!tgt && nm.length > 1 && nm !== 'Цель', `цель выбрана — панель «Цель» видна: ${nm} (${await G(() => document.getElementById('ghud-target-hp')?.textContent)})`);
      if (wantIg) { const pf = await R('.mc-pframe'); ok(!!tgt && tgt.x < W * 0.3 && !inter(tgt, pf), 'панель «Цель» слева под рамкой героя'); }
      // настройки админки на лету (как meta_state.ui): квадратная карта, отступы, «Цель» справа с автоскрытием через 3 с
      if (wantIg) {
        const setCfg = (c) => G(async (c) => { const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/ui\/uiSkin\.js/.test(n)); const m = await import(u); m.setUiCfg(c); }, c);
        await setCfg({ mmRound: false, mmX: 30, mmY: 24, tgtSide: 'right', tgtTop: 300, tgtHide: 3 }); await sleep(800);
        const ly = await R('.mc-ighud'), mm2 = await R('.ig-mm'), t2 = await R('.ig-tgt'), cr = await G(() => getComputedStyle(document.querySelector('#mm-canvas')).borderRadius);
        const rx = mm2 && ly && Math.round(ly.x + ly.w - (mm2.x + mm2.w)), ry = mm2 && ly && Math.round(mm2.y - ly.y);
        ok(cr === '0px' && rx === 30 && ry === 24, `админка: квадратная мини-карта (${cr}), отступы от края поля ${rx}/${ry}`);
        ok(!!t2 && t2.x > W * 0.6 && Math.round(t2.y) === 300, `админка: «Цель» справа, сверху 300 (${t2 && Math.round(t2.x)},${t2 && Math.round(t2.y)})`);
        await p.mouse.move(W / 2, H / 3); await shot('admin-square-right');
        await sleep(4200); const idle = await G(() => +getComputedStyle(document.querySelector('.ig-tgt')).opacity);
        ok(idle === 0, `автоскрытие «Цели» через 3 с без изменений (прозрачность ${idle})`); await shot('admin-target-idle');
        await setCfg({ mmRound: true, mmX: 10, mmY: 10, tgtSide: 'left', tgtTop: 100, tgtHide: 0 }); await sleep(600);
      }
      await G(() => window.__game.debug.clearTarget()); await sleep(900);
      if (wantIg) ok(!(await R('.ig-tgt')), 'цель снята — панель «Цель» исчезла');
    }
  }
  // настройка «Старые панели» (только ПК: на телефоне колонок нет)
  if (CHECK && !mob && THEME === 'new') {
    for (let i = 0; i < 3 && !(await p.$('[data-act="hudold"]')); i++) { await G(() => document.querySelector('.mc-setbtn')?.click() || document.querySelector('#ghud-set-btn')?.click()); await sleep(900); }
    await shot('settings');
    const flip = HUD === 'ig' ? '1' : '0';
    await G((v) => document.querySelector(`[data-act="hudold"][data-v="${v}"]`)?.click(), flip); await sleep(700);
    ok((await ig()) === (flip === '0'), `настройка «Старые панели» → ${flip === '1' ? 'Вкл' : 'Выкл'} применяется сразу`);
    ok(await G(() => localStorage.getItem('mc_hud_old')) === flip, 'выбор сохранён на устройстве');
    await p.keyboard.press('Escape'); await sleep(300); await G(() => { for (const x of document.querySelectorAll('.mc-soc-x')) if (x.offsetParent) x.click(); }); await sleep(600);
    if (flip === '1') { ok(!!(await R('.hud-right #mm-canvas')) && !!(await R('.hud-left')), 'колонки вернулись, мини-карта снова в колонке (220×150)'); }
    else ok(!!(await R('.mc-ighud #mm-canvas')), 'мини-карта переехала в игровое поле');
    await p.mouse.move(W / 2, H / 3); await shot('setting-' + (flip === '1' ? 'on' : 'off'));
  }
  if (CHECK) ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `FAILED ${fails}` : 'hud-ingame ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
