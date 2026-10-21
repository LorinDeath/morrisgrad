// LOCAL ONLY: атмосфера нового интерфейса (ui/atmoUi.js): виньетка/тон локации, частицы, звуки, плавные окна, экран загрузки.
// VIEW=pc|mobile, THEME=new|old. Скриншоты: OUT/<view>-<theme>-NN-<что>.png (+ кадры перехода окна, «до/после» без атмосферы).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const VIEW = process.env.VIEW || 'pc', THEME = process.env.THEME || 'new';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/atmo';
const mob = VIEW === 'mobile', NEW = THEME === 'new';
const BASE = process.env.UI_BASE || `http://127.0.0.1:5311/${mob ? 'game.html' : 'game-panel.html'}`, WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: 1280, height: 720 } });
  await guardLocal(ctx);
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('mc_ui_theme', t); localStorage.setItem('mc_hud_old', '0'); } catch {}
    // счётчик звуков интерфейса: каждый uiSfx создаёт осциллятор
    window.__osc = 0; const A = window.AudioContext; if (A) { const o = A.prototype.createOscillator; A.prototype.createOscillator = function () { window.__osc++; return o.call(this); }; }
  }, THEME);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  let n = 0; const shot = async (w, o = {}) => { n++; await p.screenshot({ path: `${OUT}/${VIEW}-${THEME}-${String(n).padStart(2, '0')}-${w}.png`, ...o }); };
  // экран загрузки: задерживаем three.min.js, чтобы застать его
  let release; const held = new Promise((r) => { release = r; });
  await p.route('**/js/three.min.js', async (route) => { await held; route.continue().catch(() => {}); });
  await p.goto(assertLocalUrl(`${BASE}?name=Атмо&uid=atmo_${VIEW}${THEME}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`), { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mc3d-loading', { timeout: 60000 }); await sleep(900);
  await shot('loading');
  const ld = await p.evaluate(() => ({ fancy: !!document.querySelector('.mc3d-loading .mc-load .sig'), old: document.querySelector('.mc3d-loading')?.textContent.includes('Загрузка 3D-мира') }));
  ok(NEW ? ld.fancy : ld.old && !ld.fancy, NEW ? 'экран загрузки: знак, полоса, шаг и подсказка' : 'старая тема: прежний экран загрузки');
  release();
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); await S({ type: 'dev_grant', xp: 60000 }); await sleep(3000);
  const W = mob ? 844 : 1280, H = mob ? 390 : 720;
  await p.mouse.move(W / 2, H / 3);
  const st = () => G(() => { const L = [...document.querySelectorAll('.mc-atmo-ui')]; if (!L.length) return null; const cs = (e) => getComputedStyle(e); const q = (c) => L.find((e) => e.classList.contains(c));
    const cv = q('parts'), g = cv.getContext('2d'), w = cv.width, h = cv.height, d = w && h ? g.getImageData(0, 0, w, h).data : [];
    let lit = 0, mid = 0; for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const a = d[(y * w + x) * 4 + 3]; if (a > 8) { lit++; if (Math.hypot((x - w / 2) / (Math.min(w, h) / 2), (y - h / 2) / (Math.min(w, h) / 2)) < 0.3) mid++; } }
    return { shown: L.every((e) => cs(e).display !== 'none'), mood: q('tone').dataset.mood || '', blends: L.filter((e) => e.tagName !== 'CANVAS').map((e) => cs(e).mixBlendMode), vig: +cs(q('vig')).opacity, tone: +cs(q('tone')).opacity, lit, mid, w, h }; });
  await sleep(1500); await shot('hub');
  let s = await st();
  if (NEW) {
    ok(s && s.shown && s.mood === 'hub', `атмосфера включена, локация ${s && s.mood}`);
    ok(s && s.blends.every((m) => m === 'multiply'), `экранные слои только multiply (не высветляют): ${s && s.blends.join(', ')}`);
    ok(s && s.vig > 0 && s.tone > 0 && (!mob || s.vig < 0.3), `виньетка ${s && s.vig.toFixed(2)}, тон ${s && s.tone.toFixed(2)}${mob ? ' (телефон — слабее)' : ''}`);
    ok(s && s.lit > 3, `частицы рисуются (${s && s.lit} точек)`);
    ok(s && s.mid === 0, `центр экрана (герой) без частиц (${s && s.mid})`);
    // не высветляет: слои виньетки/тона (частицы скрыты) против кадра без атмосферы; мир анимирован — сравниваем с шумом
    // двух кадров без атмосферы (тот же интервал). Светлее > 10 уровней — не больше шума + 0.6% пикселей (multiply светлее сделать не может — это анимация мира)
    const fs = require('fs');
    const frame = async (atm) => { await G((v) => { document.querySelectorAll('.mc-atmo-ui').forEach((e) => { e.style.visibility = v && !e.classList.contains('parts') ? '' : 'hidden'; }); }, atm); await sleep(150); return p.screenshot(); };
    const diff = (A, B) => G(async ([A, B]) => { const ld = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + u; }); const [ia, ib] = await Promise.all([ld(A), ld(B)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const g = c.getContext('2d'); g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
      let up = 0, tot = 0, sa = 0, sb = 0; for (let i = 0; i < da.length; i += 16) { const la = da[i] * .3 + da[i + 1] * .59 + da[i + 2] * .11, lb = db[i] * .3 + db[i + 1] * .59 + db[i + 2] * .11; tot++; sa += la; sb += lb; if (la > lb + 10) up++; } return { up: up / tot, ma: sa / tot, mb: sb / tot }; }, [A.toString('base64'), B.toString('base64')]);
    const off1 = await frame(false), off2 = await frame(false), on1 = await frame(true);
    await G(() => document.querySelectorAll('.mc-atmo-ui').forEach((e) => { e.style.visibility = ''; }));
    fs.writeFileSync(`${OUT}/${VIEW}-${THEME}-cmp-off.png`, off2); fs.writeFileSync(`${OUT}/${VIEW}-${THEME}-cmp-on.png`, on1);
    const noise = await diff(off2, off1), cmp = await diff(on1, off2);
    ok(cmp.up <= noise.up + 0.006 && cmp.ma < cmp.mb, `виньетка и тон не высветляют: светлее ${(cmp.up * 100).toFixed(2)}% пикселей (шум кадров ${(noise.up * 100).toFixed(2)}%); средняя яркость ${cmp.mb.toFixed(1)} → ${cmp.ma.toFixed(1)}`);
    await shot('hub-with-particles');
  } else ok(!s || !s.shown, 'старая тема: атмосферы интерфейса нет');
  // плавное окно: лобби забега (showScreen) — кадры появления и закрытия
  await G(() => window.__game.debug.lobby()); await sleep(50);
  const an = await G(() => { const e = document.querySelector('.mc3d-screen:not(.mc-ghost)'); return e ? getComputedStyle(e).animationName : ''; });
  await shot('win-open-50ms'); await sleep(300); await shot('win-open');
  ok(NEW ? an === 'mc-scr-in' : an === 'none' || an === '', `окно: анимация появления «${an}»`);
  await p.keyboard.press('Escape'); await sleep(30);
  const gh = await G(() => ({ g: document.querySelectorAll('.mc3d-screen.mc-ghost').length, live: document.querySelectorAll('.mc3d-screen:not(.mc-ghost)').length, ids: document.querySelectorAll('.mc-ghost [id]').length }));
  await shot('win-close-40ms');
  if (NEW) ok(gh.g === 1 && gh.ids === 0, `закрытие: окно гаснет (призрак ${gh.g}, id в призраке ${gh.ids})`);
  await sleep(400);
  ok(!(await G(() => document.querySelector('.mc3d-screen'))), 'после перехода окна нет совсем');
  // звуки интерфейса
  const osc0 = await G(() => window.__osc);
  await p.mouse.click(W / 2, H / 2); await sleep(200);
  await G(() => window.__game.debug.lobby()); await sleep(300); await G(() => window.__game.debug.clearTarget?.());
  const osc1 = await G(() => window.__osc);
  ok(NEW ? osc1 > osc0 : osc1 === osc0, `звук открытия окна: ${osc1 - osc0} осцилл.${NEW ? '' : ' (старая тема — тишина)'}`);
  await p.keyboard.press('Escape'); await sleep(400);
  if (!mob) {
    for (let i = 0; i < 3 && !(await p.$('[data-sfx]')); i++) { await p.click('.mc-setbtn').catch(() => {}); await sleep(900); }
    const row = await G(() => { const r = document.querySelector('[data-sfx]'); return r ? { dis: r.disabled, v: r.value } : null; });
    ok(!!row && row.dis === !NEW, `Настройки: «🔔 Звуки интерфейса» ${row ? (row.dis ? 'выключен (старая тема)' : 'ползунок ' + row.v + '%') : 'нет'}`);
    const r = await p.$('.mc-set-row:has([data-sfx])'); if (r) await r.screenshot({ path: `${OUT}/${VIEW}-${THEME}-settings-sfx.png` });
    await shot('settings');
    if (NEW && row) {
      await G(() => { const r = document.querySelector('[data-sfx]'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await p.keyboard.press('Escape'); await sleep(400);
      const o0 = await G(() => window.__osc); await G(() => window.__game.debug.lobby()); await sleep(300); const o1 = await G(() => window.__osc);
      ok(o1 === o0, 'громкость 0 — тишина'); await p.keyboard.press('Escape'); await sleep(300);
      await G(() => localStorage.removeItem('mc_ui_sfx'));
    } else await p.keyboard.press('Escape');
    await sleep(300);
  }
  // локации: Аринар (лёд → снег), тон и частицы меняются
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  // точки глубоко внутри краёв, не в воде (regionAt + inLiquid, посчитано по сиду мира)
  const LOCS = [['ice', 24000, 29500, 'b_ice'], ['fire', 18500, 20750, 'b_fire'], ['stone', 16000, 23250, 'b_stone'], ['air', 24000, 18500, 'b_air']];
  for (const [nm, x, y, key] of LOCS) {
    await G(([x, y]) => window.__game.debug.tp(x, y), [x, y]); await sleep(5000); await p.mouse.move(W / 2, H / 3); await shot('arinar-' + nm);
    s = await st(); if (NEW) ok(s && s.mood === key, `локация ${nm}: настроение ${s && s.mood}`);
  }
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `atmo-ui FAILED (${fails})` : 'atmo-ui ok');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
