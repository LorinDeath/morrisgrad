// LOCAL ONLY: «🔍 Размер интерфейса» — прогон масштабов × экранов × тем. На каждом масштабе: все корни HUD (рамка героя,
// мини-карта, «Цель», трекер, панель умений, отряд, кнопки, тач-кнопки, джойстик, слот PK) внутри поля и не наезжают
// друг на друга (сверка с 100%: наложение, которого нет при 100%, — провал); на телефоне тач-цели ≥ 44 px. На мин/100/макс
// открываем окна: настройки, книгу, лист персонажа (C), диалог, окно улучшения, всплывающее окно у мини-карты — окно не
// выходит за экран по ширине, по высоте либо помещается, либо прокручивается. Плюс: выбор хранится отдельно для ПК и
// телефона, «Авто» на телефоне, ползунок в Настройках с живым предпросмотром, в забеге масштаб не действует.
// Скриншоты: OUT/<экран>-<тема>-s<масштаб>.png и OUT/win/… . ONLY=подстрока тега — прогнать часть.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/ui-scale';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game-panel.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const SCALES = (process.env.SCALES || '70,85,100,115,130,150').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const VIEWS = [['pc1280', 1280, 720, 0], ['pc1920', 1920, 1080, 0], ['p360', 360, 640, 1], ['l360', 640, 360, 1], ['p390', 390, 844, 1], ['l390', 844, 390, 1], ['p412', 412, 915, 1], ['l412', 915, 412, 1]];
const HUD = ['.mc-tracker', '.mc-abar', '.mc-party', '.mc-ratebtn', '.mc-bookbtn', '.mc-pframe', '.mc-pf-mob', '.ig-mm', '.ig-tgt', '.mc3d-ttop > .mc3d-tbtn', '.mc3d-tbtns > .mc3d-tbtn', '.mc3d-joy-hint'];
(async () => {
  require('fs').mkdirSync(OUT + '/win', { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [vt, W, H, mob] of VIEWS) for (const theme of ['new', 'old']) {
    const tag = `${vt}-${theme}`; if (process.env.ONLY && !tag.includes(process.env.ONLY)) continue;
    const ctx = await b.newContext(mob ? { viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: W, height: H } });
    await guardLocal(ctx);
    await ctx.addInitScript((t) => { try { localStorage.setItem('mc_ui_theme', t); localStorage.setItem('mc_hud_old', '0'); } catch {} }, theme);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const page = mob ? BASE.replace('game-panel.html', 'game.html') : BASE;
    await p.goto(assertLocalUrl(`${page}?name=Масштаб&uid=uis_${tag}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
    await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
    // «Цель»: идём в Аринар и выбираем моба (в хабе целей нет)
    await S({ type: 'dev_grant', xp: 60000 }); await sleep(1500);
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
    await G(() => window.__game.debug.tp(24000, 29500)); await sleep(4000);
    const P = await G(() => { const s = window.__game.state(); return { x: s.x ?? s.player?.x, y: s.y ?? s.player?.y }; });
    await S({ type: 'dev_spawn_mob', mob: 'dew_slime', x: P.x + 90, y: P.y + 40, ench: 0, special: '', calm: true }); await sleep(1500);
    const m = await G(([x, y]) => window.__game.debug.zoneMobsFull().filter((o) => Math.hypot(o.x - x, o.y - y) < 300).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0], [P.x, P.y]);
    if (m) { await G((id) => window.__game.debug.selectMobId(id), m.id); await sleep(1200); }
    // слот PK — макет кнопки (как в pk-slot.cjs), чтобы проверить и его
    await G(() => { const s = document.getElementById('mc-pf-pk-slot'); if (s && !s.firstChild) { const b = document.createElement('button'); b.className = 'pk-mock'; b.style.cssText = 'width:36px;height:36px;padding:0;box-sizing:border-box;background:#1a1626;color:#e05a6e;font:bold 11px monospace'; b.textContent = 'PK'; s.appendChild(b); } });
    if (!mob) await p.mouse.move(W / 2, H / 3);
    const def = await G(() => window.__mcUiScale.get());
    ok(def.mobile === !!mob && (mob ? def.def >= 85 && def.def <= 110 : def.def === 100), `${tag}: по умолчанию ${def.def}% (${mob ? 'авто по экрану' : 'ПК'}), подходит экрану — ${def.fit}%`);
    const snap = () => G((HUD) => {
      const vis = (e) => { if (!e.isConnected) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !!(e.offsetParent || cs.position === 'fixed'); };
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const items = []; for (const s of HUD) document.querySelectorAll(s).forEach((e, i) => { if (vis(e) && !e.closest('.game-hud-panel')) items.push({ k: s.replace(/^\./, '').replace(/ > \./, '>') + (e.dataset.act ? ':' + e.dataset.act + (e.closest('.mc3d-ttop') ? '(верх)' : '') : e.className.includes('k-') ? ':' + (e.className.match(/k-\w+/) || [''])[0] : '') + (/ratebtn|bookbtn/.test(s) ? ':' + i : ''), r: R(e) }); });
      const lay = R(document.querySelector('.mc3d-layer'));
      const taps = [...document.querySelectorAll('.mc-touch .mc3d-tbtn, .mc-pf-mob button')].filter(vis).map((e) => ({ k: e.dataset.act || e.className, r: R(e) }));
      const panels = [...document.querySelectorAll('.game-hud-panel')].filter(vis).map((pn) => ({ cw: pn.clientWidth, sw: pn.scrollWidth }));
      return { items, lay, taps, panels, s: window.__mcUiScale.get() };
    }, HUD);
    const ov = (a, c) => a.x < c.x + c.w - 1 && c.x < a.x + a.w - 1 && a.y < c.y + c.h - 1 && c.y < a.y + a.h - 1;
    const pairs = (it) => { const o = []; for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) if (ov(it[i].r, it[j].r)) o.push(it[i].k + ' × ' + it[j].k); return o; };
    await G(() => window.__mcUiScale.set(100)); await sleep(500);
    const base = new Set(pairs((await snap()).items));
    if (base.size) console.log(`INFO ${tag}: наложения уже при 100% (до масштаба): ${[...base].join('; ')}`);
    for (const sc of SCALES) {
      await G((v) => window.__mcUiScale.set(v), sc); await sleep(450);
      const z = await snap(), L = z.lay, eff = z.s.eff;
      const out = z.items.filter((o) => o.r.x < L.x - 1 || o.r.y < L.y - 1 || o.r.x + o.r.w > L.x + L.w + 1 || o.r.y + o.r.h > L.y + L.h + 1).map((o) => `${o.k} ${Math.round(o.r.x)},${Math.round(o.r.y)} ${Math.round(o.r.w)}×${Math.round(o.r.h)}`);
      const nov = pairs(z.items).filter((x) => !base.has(x));
      const small = z.taps.filter((t) => Math.min(t.r.w, t.r.h) < 43.5).map((t) => `${t.k} ${Math.round(t.r.w)}×${Math.round(t.r.h)}`);
      const pan = z.panels.filter((x) => x.sw > x.cw + 1);
      ok(!out.length && !nov.length && !small.length && !pan.length && eff <= sc && eff <= z.s.fit,
        `${tag} @${sc}% (факт. ${eff}%): ${z.items.length} элементов в поле, без наложений${mob ? `, тач-цели ≥ 44 (${z.taps.length})` : ''}` + (out.length ? ` | ЗА КРАЕМ: ${out.join('; ')}` : '') + (nov.length ? ` | НАЛОЖЕНИЯ: ${nov.join('; ')}` : '') + (small.length ? ` | МЕЛКО: ${small.join('; ')}` : '') + (pan.length ? ' | боковая панель шире' : ''));
      await p.screenshot({ path: `${OUT}/${tag}-s${sc}.png` });
    }
    if (process.env.QUICK) { await ctx.close(); continue; }
    // окна на мин/100/макс
    for (const sc of [SCALES[0], 100, SCALES[SCALES.length - 1]]) {
      await G((v) => window.__mcUiScale.set(v), sc); await sleep(300);
      const wins = [['settings', () => window.__game.openPeople('settings'), '.mc3d-screen'], ['book', () => window.__game.debug.openBook(), '.mc-book'], ['charC', () => window.__game.toggleCharSheet(), '.mc3d-screen'],
        ['dialog', () => window.__game.debug.vn('alzi', 'calm', 'Проверка размера интерфейса: длинная реплика, чтобы окно диалога было полным.'), '.mc3d-screen'], ['upgrade', () => window.__game.debug.openUpgrade(), '.mc-upg-box'],
        ...(theme === 'new' && !mob ? [['pop', null, '.ig-pop.open']] : [])];
      for (const [wn, fn, sel] of wins) {
        if (fn) await G(fn); else await p.click('.ig-b[data-ig="runs"]'); await sleep(900);
        const r = await G((sel) => { const host = [...document.querySelectorAll(sel)].pop(); if (!host) return null; const box = host.matches('.mc3d-screen') ? host.firstElementChild : host; const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
          const cs = getComputedStyle(host); const scroller = host.matches('.mc3d-screen') ? host : null;
          const inner = [...box.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2; }).length;
          return { box: R(box), scroll: scroller ? scroller.scrollHeight > scroller.clientHeight + 2 : false, inner, vw: innerWidth, vh: innerHeight, z: box.currentCSSZoom || 1 }; }, sel);
        if (!r) { ok(false, `${tag} @${sc}%: окно «${wn}» не открылось`); continue; }
        const fitsW = r.box.x >= -1 && r.box.x + r.box.w <= r.vw + 1, fitsH = r.box.y >= -1 && r.box.y + r.box.h <= r.vh + 1;
        ok(fitsW && (fitsH || r.scroll), `${tag} @${sc}%: окно «${wn}» ${Math.round(r.box.w)}×${Math.round(r.box.h)} (масштаб ${r.z.toFixed(2)}) ${fitsH ? 'на экране' : 'прокручивается'}${r.inner ? `, внутри ${r.inner} прокрутк.` : ''}`);
        if (sc !== 100) await p.screenshot({ path: `${OUT}/win/${tag}-${wn}-s${sc}.png` });
        if (wn === 'book') await G(() => window.__game.book.close()); else if (wn === 'upgrade') await G(() => window.__game.upgWin.close()); else if (wn === 'pop') await p.click('.ig-b[data-ig="runs"]'); else await G(() => { if (window.__game.debug.overlay.screen) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } });
        await sleep(500); await G(() => { const o = window.__game.debug.overlay; if (o.screen) o.hideScreen(true); });
      }
    }
    // ползунок в настройках: живой предпросмотр, «Авто/100%», хранение по типу устройства
    await G(() => window.__mcUiScale.set(null)); await G(() => window.__game.openPeople('settings')); await sleep(900);
    const sl = await G(() => { const r = document.querySelector('[data-uis]'); return r && { min: +r.min, max: +r.max, v: +r.value, lbl: r.closest('.mc-set-row')?.textContent.replace(/\s+/g, ' ').trim() }; });
    ok(!!sl && sl.min === 70 && sl.max === 150 && /Размер интерфейса/.test(sl.lbl), `${tag}: в Настройках ползунок «🔍 Размер интерфейса» ${sl?.min}–${sl?.max}% (${sl?.lbl})`);
    const pf0 = await G(() => [...document.querySelectorAll(window.__mcUiScale.get().mobile ? '.mc3d-ttop > .mc3d-tbtn' : '.mc-pframe, .mc-tracker')].map((e) => e.getBoundingClientRect().width).find((w) => w > 1));
    await G(() => { const r = document.querySelector('[data-uis]'); r.value = '120'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
    const live = await G(() => ({ s: window.__mcUiScale.get(), w: [...document.querySelectorAll(window.__mcUiScale.get().mobile ? '.mc3d-ttop > .mc3d-tbtn' : '.mc-pframe, .mc-tracker')].map((e) => e.getBoundingClientRect().width).find((w) => w > 1), held: document.querySelector('.mc3d-screen')?.firstElementChild.style.zoom, txt: document.querySelector('[data-uisv]')?.textContent }));
    ok(live.s.want === 120 && (live.s.eff === 120 ? live.w > pf0 * 1.1 : live.w >= pf0) && !!live.held, `${tag}: предпросмотр на лету — HUD ${Math.round(pf0)} → ${Math.round(live.w)} px, окно настроек держит масштаб, пока тянут (${live.txt})`);
    await G(() => { const r = document.querySelector('[data-uis]'); r.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
    const st = await G(() => ({ pc: localStorage.getItem('mc_ui_scale_pc'), mob: localStorage.getItem('mc_ui_scale_mob'), held: document.querySelector('.mc3d-screen')?.firstElementChild.style.zoom }));
    ok(mob ? st.mob === '120' && st.pc == null : st.pc === '120' && st.mob == null, `${tag}: выбор сохранён для ${mob ? 'телефона' : 'ПК'} отдельно (pc=${st.pc}, mob=${st.mob})`);
    ok(!st.held, `${tag}: отпустили ползунок — окно настроек тоже в новом масштабе`);
    if (vt === 'pc1280' || vt === 'l390') await p.screenshot({ path: `${OUT}/${tag}-settings.png` });
    await G(() => document.querySelector('[data-uisdef]').click()); await sleep(300);
    const rs = await G(() => ({ s: window.__mcUiScale.get(), k: localStorage.getItem(window.__mcUiScale.get().mobile ? 'mc_ui_scale_mob' : 'mc_ui_scale_pc'), v: document.querySelector('[data-uis]')?.value }));
    ok(rs.k == null && rs.s.want === rs.s.def && +rs.v === rs.s.def, `${tag}: «${mob ? 'Авто' : '100%'}» — вернулось к ${rs.s.def}%`);
    await G(() => { const o = window.__game.debug.overlay; if (o.screen) o.hideScreen(true); }); await sleep(300);
    if (vt === 'pc1280' || vt === 'l390') { // забег: масштаб не действует (раскладка забега как была)
      await G(() => window.__mcUiScale.set(130)); await G(() => window.__game.startRun('crypt'));
      const inRun = await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 30000 }).then(() => true).catch(() => false); await sleep(1500);
      const rs2 = await G(() => ({ cls: document.documentElement.classList.contains('mc-uis'), s: getComputedStyle(document.documentElement).getPropertyValue('--ui-s').trim(), st: getComputedStyle(document.documentElement).getPropertyValue('--ui-st').trim() }));
      ok(inRun && !rs2.cls && rs2.s === '1' && rs2.st === '1', `${tag}: в забеге масштаб выключен (выбрано 130%, mc-uis=${rs2.cls}, --ui-s=${rs2.s}, --ui-st=${rs2.st})`);
      await G(() => window.__game.leaveRun?.()); await G(() => window.__mcUiScale.set(null));
    }
    ok(!errs.length, `${tag}: без ошибок страницы ${errs.join(' | ')}`);
    await ctx.close();
  }
  console.log(fails ? `ui-scale FAILED (${fails})` : 'ui-scale ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
