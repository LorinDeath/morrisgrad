// LOCAL: ⚔ PK у ника, перетаскивание интерфейса (ПК/телефон), раскладка и точка в мире на сервере (перезагрузка, смена тела),
// полоса опыта и «+N% опыта» за мобов. Только 127.0.0.1 (_local.cjs). Снимки — OUT.
const { chromium } = require('playwright-core');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-qol/shots/uidrag';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5375/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8975';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n, x === undefined ? '' : JSON.stringify(x))) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const ONLY = process.env.ONLY || 'pc,mob';
const stamp = Date.now().toString(36);
async function open(b, { mob, uid, w = 1280, h = 800 }) {
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: w, height: h } });
  await guardLocal(ctx);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
  p.uid = uid; p.mob = mob; p.ws = []; p.on('websocket', (w) => w.on('framereceived', (f) => { const d = String(f.payload || ''); if (d.includes('"world_switched"') && d.includes('restored')) p.ws.push(d.slice(0, d.indexOf('}') + 1)); })); p.on('framenavigated', (f) => { if (f === p.mainFrame() && process.env.UD_NAV) console.log('nav', f.url().slice(0, 120), new Error().stack.split('\n').length); });
  await boot(p);
  return { ctx, p };
}
async function boot(p) {
  await p.goto(assertLocalUrl(`${BASE}?name=${p.uid}&uid=${p.uid}&ws=${WS}&fs=1&debug=1${p.mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await p.evaluate(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove()));
}
const G = (p, f, a) => p.evaluate(f, a);
async function toArinar(p) {
  for (let i = 0; i < 8 && (await G(p, () => window.__game.state().world)) !== 'arinar'; i++) {
    await G(p, () => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200);
    await G(p, () => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000);
  }
  return (await G(p, () => window.__game.state().world)) === 'arinar';
}
const rect = (p, sel) => G(p, (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom, vis: cs.display !== 'none' && r.width > 1, tr: e.style.translate }; }, sel);
const inView = (r, W, H) => r && r.x >= -1 && r.y >= -1 && r.r <= W + 1 && r.b <= H + 1;
async function drag(p, x, y, dx, dy, steps = 12) { await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(x + dx * i / steps, y + dy * i / steps); await sleep(16); } await p.mouse.up(); await sleep(300); }
const lay = (p) => G(p, () => window.__game.uiDrag.state());
async function toCamp(p, k = 0) {
  const c = await G(p, (k) => { const pl = window.__game.debug.pos(); const cs = (window.__game.debug.campsRaw() || []).slice().sort((a, b) => Math.hypot(a[1] - pl.x, a[2] - pl.y) - Math.hypot(b[1] - pl.x, b[2] - pl.y)); return cs[k] && { x: cs[k][1], y: cs[k][2], alive: cs[k][3], n: cs[k][4] }; }, k);
  if (c) { await G(p, (c) => window.__game.debug.tp(c.x + 140, c.y + 140, true), c); await sleep(3500); }
  return c;
}
async function killNear(p, n = 1) {
  const pops = [];
  await toCamp(p);
  for (let i = 0; i < n; i++) {
    const m = await G(p, () => { const pl = window.__game.debug.pos(); const ms = window.__game.debug.zoneMobs().filter((m) => !m.chief); ms.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)); return ms[0]; });
    if (!m) break;
    await G(p, (m) => window.__game.debug.tp(m.x + 60, m.y, true), m); await sleep(700);
    const prev = await G(p, () => document.querySelector('.mc-xpbar .pop').textContent);
    await G(p, () => window.__game.debug.rawSend({ type: 'dev_grant', killNear: true }));
    await p.waitForFunction((pv) => { const e = document.querySelector('.mc-xpbar'); return e.classList.contains('popon') && e.querySelector('.pop').textContent !== pv; }, prev, { timeout: 2500 }).catch(() => {});
    pops.push(await G(p, () => { const e = document.querySelector('.mc-xpbar'); return { on: e.classList.contains('popon'), txt: e.querySelector('.pop').textContent }; }));
  }
  return pops;
}

async function pc(b) {
  const uid = 'udpc_' + stamp; let { ctx, p } = await open(b, { uid });
  if ((await G(p, () => window.__game.state().player?.stats?.classId)) == null) { await G(p, () => window.__game.debug.selectClass('warrior')); await sleep(2500); }
  t('ПК: в Аринаре', await toArinar(p));
  await p.evaluate(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove()));
  await sleep(1500);
  // ⚔ PK у ника
  const pk = await G(p, () => { const s = document.getElementById('mc-pf-pk-slot'), f = document.querySelector('.mc-pframe'); const btn = s?.querySelector('button, .mc-pk, [class*="pk"]'); const r = (s?.firstElementChild || s)?.getBoundingClientRect(); const fr = f?.getBoundingClientRect();
    return { inFrame: !!(s && f && f.contains(s)), r: r && { x: r.x, y: r.y, w: r.width, h: r.height }, fr: fr && { x: fr.x, y: fr.y, w: fr.width, h: fr.height }, txt: s?.textContent?.trim(), shadow: btn ? getComputedStyle(btn).boxShadow : '', floatPk: [...document.querySelectorAll('.mc-pkbar, .mc-city-pk')].filter((e) => e.offsetParent && !s?.contains(e)).length }; });
  t('ПК: PK в рамке героя у ника (лево-верх)', pk.inFrame && pk.r && pk.r.y < 120 && pk.r.x < 300 && /PK/.test(pk.txt || ''), pk);
  // полоса опыта
  const xb = await rect(p, '.mc-xpbar'), am = await rect(p, '.mc-abar-main');
  t('ПК: полоса опыта сразу над панелью умений', xb?.vis && am && xb.b <= am.y + 1 && am.y - xb.b < 12 && Math.abs(xb.w - am.w) < 3 && xb.h <= 8, { xb, am });
  await p.mouse.move(xb.x + xb.w / 2, xb.y + 2); await sleep(400);
  const tip = await G(p, () => { const e = document.querySelector('.mc-xpbar'); return { on: e.classList.contains('tipon'), txt: e.querySelector('.tip').textContent }; });
  t('ПК: наведение — «Уровень N · cur/max опыта · P%»', tip.on && /^Уровень \d+ · \d+\/\d+ опыта · [\d,<]+%$/.test(tip.txt), tip);
  await p.screenshot({ path: `${OUT}/pc-01-hud-pk-xp.png` });
  await p.mouse.move(640, 300);
  // убийства мобов: доля уровня у полосы, без «+N опыта»
  const floats0 = await G(p, () => { window.__xpFloats = []; const ob = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.textContent && /опыта/.test(n.textContent) && !n.closest?.('.mc-xpbar')) window.__xpFloats.push(n.textContent); }); ob.observe(document.getElementById('game-screen') || document.body, { childList: true, subtree: true }); return 0; });
  const pops = await killNear(p, 3);
  t('ПК: убийство — «+N% опыта» у полосы', pops.length && pops.every((x) => x.on && /^\+[\d,<]+% опыта$/.test(x.txt)), pops);
  const nums = pops.map((x) => parseFloat(x.txt.replace(/[^\d,]/g, '').replace(',', '.')));
  t('ПК: быстрые убийства складываются', nums.length >= 2 && nums[nums.length - 1] > nums[0], nums);
  await p.screenshot({ path: `${OUT}/pc-02-xp-pop.png` });
  const fl = await G(p, () => window.__xpFloats.filter((s) => /\+\d+ опыта/.test(s) && !/^✔/.test(s.trim()))); // ✔ — награда задания (опыт задания не меняли)
  t('ПК: нет абсолютного «+N опыта» над мобом/в сообщениях', fl.length === 0, fl.slice(0, 3));
  // окно — за заголовок
  await G(p, () => window.__game.book.open()); await sleep(800);
  let bk = await rect(p, '.mc-book');
  if (bk?.vis) {
    await drag(p, bk.x + bk.w / 2, bk.y + 14, -180, 20);
    const bk2 = await rect(p, '.mc-book');
    t('ПК: окно (книга) тащится за заголовок', Math.abs(bk2.x - bk.x + 180) < 6 && Math.abs(bk2.y - bk.y - 20) < 6, { bk, bk2 });
    await p.screenshot({ path: `${OUT}/pc-03-book-dragged.png` });
    const still = await rect(p, '.mc-book'); t('ПК: отпускание заголовка не закрыло окно (клик подавлен)', still?.vis);
    await p.keyboard.press('Escape'); await sleep(500);
    await G(p, () => window.__game.book.open()); await sleep(800);
    const bk3 = await rect(p, '.mc-book'); t('ПК: окно открылось на новом месте', bk3?.vis && Math.abs(bk3.x - bk2.x) < 6 && Math.abs(bk3.y - bk2.y) < 6, { bk3 });
    await G(p, () => window.__game.book.close()); await sleep(400);
  } else t('ПК: книга открылась', false, bk);
  // HUD без режима настройки не тащится (клик по миникарте и игра не ломаются)
  const mm0 = await rect(p, '.ig-mm');
  await drag(p, mm0.x + mm0.w / 2, mm0.y + mm0.h / 2, -100, 80); const mm0b = await rect(p, '.ig-mm');
  t('ПК: без «Настроить» миникарта на месте', Math.abs(mm0b.x - mm0.x) < 2, { mm0, mm0b });
  // режим «✥ Настроить»
  await G(p, () => window.__game.uiDrag.setEdit(true)); await sleep(500);
  await p.screenshot({ path: `${OUT}/pc-04-edit-mode.png` });
  await drag(p, mm0.x + mm0.w / 2, mm0.y + mm0.h / 2, -420, 260);
  const tr0 = await rect(p, '.mc-tracker'); await drag(p, tr0.x + 40, tr0.y + 10, -700, 100);
  const xb0 = await rect(p, '.mc-xpbar'); await drag(p, xb0.x + 30, xb0.y + 2, 0, -120);
  const pf0 = await rect(p, '.mc-pframe'); await drag(p, pf0.x + 40, pf0.y + 40, -900, -500); // за край — блок остаётся в окне
  const pf1 = await rect(p, '.mc-pframe');
  t('ПК: блок не уходит за край окна', inView(pf1, 1280, 800) && pf1.x < 2 && pf1.y < 2, pf1);
  const L1 = await lay(p);
  t('ПК: сдвинуты миникарта, задания, полоса опыта', L1.off.mm && L1.off.tracker && L1.off.xp, L1.off);
  await p.screenshot({ path: `${OUT}/pc-05-edited.png` });
  await p.keyboard.press('Escape'); await sleep(300);
  t('ПК: Esc — выход из режима настройки', !(await lay(p)).edit);
  // игровой ввод после настройки
  await p.mouse.click(640, 400); const ps0 = await G(p, () => window.__game.debug.pos());
  await p.keyboard.down('d'); await sleep(700); await p.keyboard.up('d'); await sleep(200);
  const ps1 = await G(p, () => window.__game.debug.pos());
  t('ПК: WASD работает после перетаскивания', Math.hypot(ps1.x - ps0.x, ps1.y - ps0.y) > 20, { ps0, ps1 });
  const mmc = await G(p, () => { const r = document.querySelector('.ig-mm').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e?.closest('.ig-mm'); });
  t('ПК: сдвинутая миникарта принимает клики', mmc);
  // точка в мире + раскладка: перезагрузка (кэш стёрт — значит, с сервера)
  await G(p, () => window.__game.debug.tp(23900, 24150, true)); await sleep(2500);
  const posA = await G(p, () => window.__game.debug.pos());
  await sleep(1200);
  await G(p, () => localStorage.removeItem('mc_uilay_v1'));
  await boot(p); await sleep(1500);
  const L2 = await lay(p), w2 = await G(p, () => window.__game.state().world), pos2 = await G(p, () => window.__game.debug.pos());
  t('ПК: раскладка вернулась с сервера после перезагрузки', JSON.stringify(L2.off.mm) === JSON.stringify(L1.off.mm) && JSON.stringify(L2.off.xp) === JSON.stringify(L1.off.xp), { L1: L1.off, L2: L2.off });
  const why = (p.ws[p.ws.length - 1] || '').match(/"why":"(\w+)"/)?.[1];
  const rs = (() => { try { return JSON.parse(p.ws[p.ws.length - 1]); } catch (_) { return null; } })(); // точка входа от сервера (потом герой мог сдвинуться: мобы рядом)
  t('ПК: после перезагрузки — в Аринаре там же (или ближайшая допустимая, если точку занял купол/препятствие)', w2 === 'arinar' && rs?.world === 'arinar' && (Math.hypot(rs.x - posA.x, rs.y - posA.y) < 60 || ['bmdome', 'blocked'].includes(why)), { posA, rs, pos2, why });
  await p.screenshot({ path: `${OUT}/pc-06-after-reload.png` });
  // размер окна меньше — блоки в окне
  await p.setViewportSize({ width: 820, height: 560 }); await sleep(1200);
  const all = await G(p, () => [...document.querySelectorAll('.mc-dr')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 2 && e.style.translate).map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.split(' ')[0], x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom) }; }));
  t('ПК: окно 820×560 — сдвинутые блоки целиком в окне', all.length > 0 && all.every((r) => r.x >= -1 && r.y >= -1 && r.r <= 821 && r.b <= 561), all);
  await p.screenshot({ path: `${OUT}/pc-07-small-window.png` });
  await p.setViewportSize({ width: 1280, height: 800 }); await sleep(800);
  // замок
  await G(p, () => window.__game.uiDrag.setLock(true)); await sleep(200);
  await G(p, () => window.__game.book.open()); await sleep(800);
  bk = await rect(p, '.mc-book'); await drag(p, bk.x + bk.w / 2, bk.y + 14, 150, 0); const bkL = await rect(p, '.mc-book');
  t('ПК: замок — окна не тащатся', Math.abs(bkL.x - bk.x) < 2, { bk, bkL });
  await G(p, () => window.__game.book.close()); await sleep(400);
  // настройки: строки «Расположение» и «Полный экран»
  await G(p, () => window.__game.social.renderSettings()); await sleep(900);
  const srow = await G(p, () => [...document.querySelectorAll('.mc-set-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).filter((s) => /Расположение|Полный экран/.test(s)));
  t('ПК: в настройках — «Расположение интерфейса» (Настроить/Сбросить/замок) и «Полный экран»', srow.length === 2 && /Настроить/.test(srow[0]) && /Сбросить/.test(srow[0]) && /Закреплено/.test(srow[0]), srow);
  await p.screenshot({ path: `${OUT}/pc-08-settings.png` });
  await G(p, () => document.querySelector('[data-act="uilay"][data-v="lock"]')?.click()); await sleep(300);
  await G(p, () => document.querySelector('[data-act="uilay"][data-v="reset"]')?.click()); await sleep(500);
  const L3 = await lay(p); t('ПК: «Сбросить» и снять замок', !L3.lock && Object.keys(L3.off).length === 0, L3);
  await p.keyboard.press('Escape'); await sleep(300);
  const mmR = await rect(p, '.ig-mm'); t('ПК: после сброса миникарта на месте', mmR && !mmR.tr && mmR.x > 1000, mmR);
  // смена тела: у каждого тела своя точка
  await G(p, () => window.__game.debug.tp(23700, 24300, true)); await sleep(2500);
  const posW = await G(p, () => window.__game.debug.pos());
  await G(p, () => window.__game.debug.selectClass('mage')); await sleep(3000);
  const cls2 = await G(p, () => window.__game.state().player?.stats?.classId);
  await G(p, () => window.__game.debug.tp(24150, 24250, true)); await sleep(2500);
  const posM = await G(p, () => window.__game.debug.pos());
  await boot(p); const posM2 = await G(p, () => window.__game.debug.pos()), clsM2 = await G(p, () => window.__game.state().player?.stats?.classId);
  t('ПК: второе тело — перезагрузка в его точке', Math.hypot(posM2.x - posM.x, posM2.y - posM.y) < 60 || /"why":"blocked"/.test(p.ws[p.ws.length - 1] || ''), { cls2, clsM2, posM, posM2 });
  const posSw = await G(p, () => window.__game.debug.pos());
  await G(p, () => window.__game.debug.selectClass('warrior')); await sleep(3000);
  const posAft = await G(p, () => ({ ...window.__game.debug.pos(), cls: window.__game.state().player?.stats?.classId }));
  await boot(p); const posW2 = await G(p, () => window.__game.debug.pos()), clsW2 = await G(p, () => window.__game.state().player?.stats?.classId);
  t('ПК: смена тела без переноса (switchTp выкл) — вход там, где сменили', clsW2 === 'warrior' && (Math.hypot(posW2.x - posSw.x, posW2.y - posSw.y) < 120 || ['bmdome', 'blocked'].includes((p.ws[p.ws.length - 1] || '').match(/"why":"(\w+)"/)?.[1])), { clsW2, posW, posSw, posAft, posW2, msg: p.ws.slice(-2) });
  t('ПК: без ошибок страницы', p.errs.length === 0, p.errs.slice(0, 3));
  await ctx.close();
}

async function touchDrag(p, x, y, dx, dy, hold = 650) {
  const c = await p.context().newCDPSession(p);
  const pt = (X, Y) => [{ x: X, y: Y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) }); await sleep(hold);
  for (let i = 1; i <= 12; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + dx * i / 12, y + dy * i / 12) }); await sleep(20); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400); await c.detach();
}
async function mob(b) {
  const uid = 'udmob_' + stamp; let { ctx, p } = await open(b, { uid, mob: true });
  if ((await G(p, () => window.__game.state().player?.stats?.classId)) == null) { await G(p, () => window.__game.debug.selectClass('warrior')); await sleep(2500); }
  t('Тел: в Аринаре', await toArinar(p)); await p.evaluate(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(1500);
  const W = 844, H = 390;
  const pk = await G(p, () => { const s = document.getElementById('mc-pf-pk-slot'); const r = (s?.firstElementChild || s)?.getBoundingClientRect(); return { r: r && { x: r.x, y: r.y, w: r.width, h: r.height }, txt: s?.textContent?.trim(), host: s?.parentElement?.className }; });
  t('Тел: PK у ника слева сверху', pk.r && pk.r.y < 110 && pk.r.x < 320 && /PK/.test(pk.txt || ''), pk);
  const xb = await rect(p, '.mc-xpbar');
  t('Тел: полоса опыта внизу по центру, в окне', xb?.vis && inView(xb, W, H) && xb.b > H - 20, xb);
  await p.screenshot({ path: `${OUT}/mob-01-hud.png` });
  const pops = await killNear(p, 2);
  t('Тел: «+N% опыта» у полосы', pops.length && pops.every((x) => x.on && /^\+[\d,<]+% опыта$/.test(x.txt)), pops);
  await p.screenshot({ path: `${OUT}/mob-02-xp-pop.png` });
  // короткое касание — не перетаскивание
  const tr = await rect(p, '.mc-tracker');
  await touchDrag(p, tr.x + 40, tr.y + 12, 0, 0, 80);
  t('Тел: короткое касание задания не двигает', !(await lay(p)).off.tracker);
  const bkTap = await G(p, () => !!window.__game.book?.isOpen);
  t('Тел: короткое касание задания — как раньше открывает журнал', bkTap);
  await G(p, () => window.__game.book.close()); await sleep(500);
  // долгое нажатие + перетаскивание
  await touchDrag(p, tr.x + 40, tr.y + 12, 300, 120);
  t('Тел: долгое нажатие не открыло журнал', !(await G(p, () => !!window.__game.book?.isOpen)));
  const tr2 = await rect(p, '.mc-tracker'), Lm = await lay(p);
  t('Тел: долгое нажатие — задания перетащены', Lm.off.tracker && Math.abs(tr2.x - tr.x - 300) < 8, { tr, tr2, off: Lm.off });
  const mm = await rect(p, '.ig-mm'); await touchDrag(p, mm.x + mm.w / 2, mm.y + mm.h / 2, -600, 600);
  const mm2 = await rect(p, '.ig-mm'); t('Тел: миникарта за край — остаётся в окне', inView(mm2, W, H), mm2);
  // джойстик и кнопки боя — не тащатся
  const atk = await rect(p, '.mc3d-tbtn.k-atk'); await touchDrag(p, atk.x + atk.w / 2, atk.y + atk.h / 2, -200, -100);
  const atk2 = await rect(p, '.mc3d-tbtn.k-atk'); t('Тел: кнопка атаки не перетаскивается', Math.abs(atk2.x - atk.x) < 1 && !atk2.tr, { atk, atk2 });
  await p.screenshot({ path: `${OUT}/mob-03-dragged.png` });
  // поворот (портрет) — блоки в окне
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(1500);
  const all = await G(p, () => [...document.querySelectorAll('.mc-dr')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 2 && e.style.translate).map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.split(' ')[0], x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom) }; }));
  t('Тел: портрет 390×844 — сдвинутые блоки в окне', all.every((r) => r.x >= -1 && r.y >= -1 && r.r <= 391 && r.b <= 845), all);
  await p.screenshot({ path: `${OUT}/mob-04-portrait.png` });
  await p.setViewportSize({ width: W, height: H }); await sleep(1000);
  await G(p, () => localStorage.removeItem('mc_uilay_v1')); await boot(p); await sleep(1000);
  const Lm2 = await lay(p);
  t('Тел: раскладка телефона — с сервера после перезагрузки', JSON.stringify(Lm2.off.tracker) === JSON.stringify(Lm.off.tracker) && Lm2.dev === 'mob', Lm2.off);
  // лагеря: мобов рядом и кадр (swiftshader — только относительная оценка)
  const cc = await toCamp(p, 1); await sleep(2000);
  const camp = await G(p, (cc) => { const ms = window.__game.debug.zoneMobs(); return { all: ms.length, nearCamp: cc ? ms.filter((m) => Math.hypot(m.x - cc.x, m.y - cc.y) < 260).length : -1 }; }, cc);
  const fst = await G(p, () => window.__game.debug.frameStats(2000)).catch((e) => String(e));
  console.log('camp-perf(mob)', JSON.stringify({ camp, fst }));
  await p.screenshot({ path: `${OUT}/mob-05-camp.png` });
  t('Тел: без ошибок страницы', p.errs.length === 0, p.errs.slice(0, 3));
  // ПК-раскладка того же аккаунта не задета телефонной
  await ctx.close();
  ({ ctx, p } = await open(b, { uid }));
  const Lp = await lay(p); t('Тот же аккаунт на ПК: своя раскладка (телефонная не применена)', Lp.dev === 'pc' && !Lp.off.tracker, Lp.off);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try { if (ONLY.includes('pc')) await pc(b); } catch (e) { bad++; console.log('FAIL pc crash', String(e).slice(0, 400)); }
  try { if (ONLY.includes('mob')) await mob(b); } catch (e) { bad++; console.log('FAIL mob crash', String(e).slice(0, 400)); }
  console.log(`uidrag ${ok}/${ok + bad}`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
