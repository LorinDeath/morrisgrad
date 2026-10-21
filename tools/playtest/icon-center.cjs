// LOCAL ONLY: иконки в рамках кита по центру. Для каждой рамочной ячейки (быстрые кнопки HUD, панель навыков,
// слоты снаряжения в окне C и книге, узлы талантов, тач-кнопки) снимаем скриншот ячейки, прячем подписи/бейджи,
// ищем пиксели иконки внутри внутренней области рамки и сравниваем центр их bbox с центром внутренней области (≤ TOL px).
// THEME=new VIEW=pc|mobile NODE_PATH=... node tools/playtest/icon-center.cjs   (OUT — кропы до/после: TAG=before|after)
const { chromium } = require('playwright-core');
const sharp = require('sharp');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const VIEW = process.env.VIEW || 'pc', TAG = process.env.TAG || 'after', TOL = +(process.env.TOL || 1);
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/fixes/icons-center';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// box — элемент с рамкой; inset — видимая толщина рамки (px); всё, что не иконка, прячем на время замера
const HIDE = '.mc-cnt, b, em, small, .tip, .nm, .plus, .k, .key, .kb, .hk, .cd, .cdt, .mc-lk, .mc-up, .mc-upb, .mc-gem, .gems, .mc-eg, .lvl, .rk';
const GROUPS = {
  hud: { sel: '.mc-bookbtn, .mc-ratebtn, .mc3d-tbtn, .mm-btn', inset: 4 },
  abil: { sel: '.mc-as', inset: 4 },
  C: { sel: '.mc-charsheet .mc-insp-slot:not(.empty):not(.ench) .ic', inset: 4 },
  book: { sel: '.mc-gslot.filled:not(.ench) > span', inset: 4 },
  talents: { sel: '.mc-tn', inset: 4 },
};
async function measure(p, group, nm) {
  const { sel, inset } = GROUPS[group];
  const boxes = await p.evaluate(([sel, HIDE]) => {
    document.documentElement.classList.add('icchk');
    if (!document.getElementById('icchk-st')) { const s = document.createElement('style'); s.id = 'icchk-st'; s.textContent = `html.icchk :is(${HIDE}) { visibility: hidden !important; } html.icchk .mc-glitch-strip, html.icchk .mc-as::after { display: none !important; } html.icchk-blank :is(${sel}) { font-size: 0 !important; } html.icchk-blank :is(${sel}) * { visibility: hidden !important; }`; document.head.append(s); }
    return [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return e.offsetParent && r.width > 20 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }).slice(0, 14).map((e, i) => { const r = e.getBoundingClientRect(); const sp = e.querySelector(':scope > .mc-sic, :scope > i.mc-sic, :scope > .ic > .mc-sic'); const q = sp?.getBoundingClientRect(); return { i, sp: q ? [+(q.x + q.width / 2 - r.x - r.width / 2).toFixed(1), +(q.y + q.height / 2 - r.y - r.height / 2).toFixed(1)] : null, x: r.x, y: r.y, w: r.width, h: r.height, id: (e.className.baseVal ?? e.className).toString().split(' ').slice(0, 3).join('.') + (e.dataset.slot ? '#' + e.dataset.slot : '') + (e.dataset.v ? '#' + e.dataset.v.slice(0, 12) : '') }; });
  }, [sel, HIDE]);
  await sleep(250);
  const res = [];
  const raw = async (buf) => sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const bx of boxes) {
    const clip = { x: Math.floor(bx.x), y: Math.floor(bx.y), width: Math.ceil(bx.w), height: Math.ceil(bx.h) };
    // разница «с иконкой» и «без иконки» (тот же кадр рамки) = пиксели иконки; фон за полупрозрачной заливкой не мешает
    await p.evaluate(() => document.documentElement.classList.add('icchk-blank')); await sleep(60);
    const blank = await raw(await p.screenshot({ clip, scale: 'css', animations: 'disabled' }));
    await p.evaluate(() => document.documentElement.classList.remove('icchk-blank')); await sleep(60);
    const buf = await p.screenshot({ clip, scale: 'css', animations: 'disabled' });
    const { data, info } = await raw(buf); const W = info.width, H = info.height, dpr = W / clip.width, I = Math.round(inset * dpr);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = I; y < H - I; y++) for (let x = I; x < W - I; x++) { const o = (y * W + x) * 3; if (Math.max(Math.abs(data[o] - blank.data[o]), Math.abs(data[o + 1] - blank.data[o + 1]), Math.abs(data[o + 2] - blank.data[o + 2])) > 48) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) { res.push({ ...bx, empty: true }); continue; }
    let dx = ((x0 + x1 + 1) / 2 - W / 2) / dpr, dy = ((y0 + y1 + 1) / 2 - H / 2) / dpr;
    if (bx.sp) { dx = bx.sp[0]; dy = bx.sp[1]; } // спрайтовая иконка: центр её блока (рисунок внутри спрайта — дело художника)
    res.push({ ...bx, dx: +dx.toFixed(1), dy: +dy.toFixed(1), bw: +((x1 - x0 + 1) / dpr).toFixed(0), bh: +((y1 - y0 + 1) / dpr).toFixed(0) });
    await sharp(buf).resize(Math.round(W * 3 / dpr), Math.round(H * 3 / dpr), { kernel: 'nearest' }).toFile(`${OUT}/${TAG}-${VIEW}-${nm}-${bx.i}.png`);
  }
  await p.evaluate(() => document.documentElement.classList.remove('icchk'));
  for (const r of res) if (!r.empty) ok(Math.abs(r.dx) <= TOL && Math.abs(r.dy) <= TOL, `${VIEW} ${nm}[${r.i}] ${r.id}: смещение иконки dx=${r.dx} dy=${r.dy} (иконка ${r.bw}×${r.bh}, ячейка ${Math.round(r.w)}×${Math.round(r.h)})`);
  if (!res.length) console.log('INFO', nm, 'нет ячеек');
  return res;
}
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const mob = VIEW === 'mobile';
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: 1280, height: 760 } });
  await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); p.st = null; const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { p.st = JSON.parse(s); } catch {} }));
  await p.goto(assertLocalUrl(`${BASE}?name=Икон&uid=icc_${VIEW}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  const G = (f, a) => p.evaluate(f, a); const S = (o) => G((x) => window.__game.debug.send(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
  await S({ type: 'dev_grant', xp: 60000 }); for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) await S({ type: 'dev_grant', item: id });
  await sleep(1500); for (const it of (p.st?.account?.inv || [])) { await S({ type: 'equip', uid: it.uid }); await sleep(250); }
  await sleep(1500); await p.mouse.move(mob ? 420 : 640, mob ? 150 : 300);
  // центровка не должна «включать» скрытые кнопки: на тач-раскладке быстрых кнопок ПК нет, «домой» видна только в Аринаре
  const shown = await G(() => [...document.querySelectorAll('.mc-bookbtn, .mc-ratebtn')].filter((e) => e.offsetParent).map((e) => e.className));
  ok(mob ? shown.length === 0 : !shown.some((c) => /mc-homebtn/.test(c)), `${VIEW}: скрытые кнопки остаются скрытыми (${shown.length ? shown.join(', ') : 'нет видимых'})`);
  await measure(p, 'hud', 'hud'); if (!mob) await measure(p, 'abil', 'abil');
  await G(() => window.__game.debug.charSheet()); await p.waitForSelector('.mc-charsheet .mc-insp-gear', { timeout: 10000 }); await sleep(1200); await p.mouse.move(2, 2);
  await measure(p, 'C', 'C'); await measure(p, 'talents', 'talents');
  await p.keyboard.press('Escape'); await sleep(400); await G(() => { for (const x of document.querySelectorAll('.mc-soc-x')) if (x.offsetParent) x.click(); }); await sleep(300);
  await G(() => window.__game.debug.openBook('gear')); await sleep(1000); await p.mouse.move(2, 2);
  await measure(p, 'book', 'book');
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `FAILED ${fails}` : 'icon-center ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
