// LOCAL плейтест сравнения предметов / карточки / закрепления (только localhost: guardLocal).
// IC_BASE=http://127.0.0.1:5263/game.html IC_WS=ws://127.0.0.1:8819 node tools/playtest/inv-compare.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/inv-compare';
const BASE = process.env.IC_BASE || 'http://127.0.0.1:5263/game.html', WS = process.env.IC_WS || 'ws://127.0.0.1:8819';
fs.mkdirSync(OUT, { recursive: true });
const R = { pass: [], fail: [] };
const ok = (c, m) => { (c ? R.pass : R.fail).push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  await guardLocal(ctx);
  const p = await ctx.newPage(); p.st = null; p.errs = []; p.toasts = [];
  p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.startsWith('{"type":"meta_state"') || s.includes('"type":"meta_state"')) { try { const j = JSON.parse(s); if (j.account) p.st = j; if (j.toast) p.toasts.push(j.toast); } catch {} } if (s.includes('toast_error')) { try { p.toasts.push('ERR ' + JSON.parse(s).message); } catch {} } }));
  const uid = 'ic_' + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=Картограф&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
  const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
  await S({ type: 'dev_grant', xp: 5000 });
  for (const id of ['whisper_wisp_helmet', 'night_bat_helmet', 'dew_slime_helmet', 'night_bat_helmet@c', 'dew_slime_weapon', 'mirage_hare_weapon', 'rot_glitch_armor', 'whisper_wisp_armor']) { await S({ type: 'dev_grant', item: id }); await sleep(150); }
  await S({ type: 'meta_get' }); await sleep(1200);
  const inv = () => p.st.account.inv;
  const U = (id, c) => inv().find((i) => i.id === id && !!i.cursed === !!c)?.uid;
  await S({ type: 'equip', uid: U('whisper_wisp_helmet') }); await sleep(300);
  await S({ type: 'equip', uid: U('dew_slime_weapon') }); await sleep(600);
  await p.evaluate(() => window.__game.debug.openBook('gear')); await p.waitForTimeout(900);
  const hover = async (u, f) => { const el = await p.$(`.mc-bag .mc-item[data-v="${u}"]`); const bb = await el.boundingBox(); await p.mouse.move(bb.x + 5, bb.y + 5); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(250); const t = await p.evaluate(() => { const c = document.querySelector('.mc-cmp'); return c && c.style.display !== 'none' ? c.innerText : ''; }); if (f) await p.screenshot({ path: `${OUT}/${f}` }); return t; };
  let t = await hover(U('night_bat_helmet'), '01-tooltip-better.png');
  ok(/Сравнение с надетым/.test(t) && /▲/.test(t) && !/▼/.test(t.split('Навык')[0]), 'лучший шлем: только ▲ — ' + t.replace(/\n/g, ' | ').slice(0, 220));
  t = await hover(U('dew_slime_helmet'), '02-tooltip-worse-new-lost.png');
  ok(/▼/.test(t) && /новое/.test(t) && /потеряете/.test(t), 'худший шлем: ▼, «новое» (крит), «потеряете» (броня) — ' + t.replace(/\n/g, ' | ').slice(0, 260));
  t = await hover(U('night_bat_helmet', 1), '03-tooltip-cursed.png');
  ok(/Проклят/.test(t) && /\+108/.test(t), 'проклятый шлем: hp 72×1.5=108 с сервера — ' + t.replace(/\n/g, ' | ').slice(0, 200));
  t = await hover(U('mirage_hare_weapon'), '04-tooltip-weapon.png');
  ok(/Урон: 19–50/.test(t) && /было 6–16/.test(t) && /Навык R/.test(t), 'оружие: диапазон урона, было, навык R — ' + t.replace(/\n/g, ' | ').slice(0, 220));
  t = await hover(U('rot_glitch_armor'), '05-tooltip-empty-slot.png');
  ok(/пуст/.test(t), 'пустой слот брони — всё прибавка');
  // карточка: клик
  await p.mouse.move(5, 5); await p.waitForTimeout(400);
  await p.click(`.mc-bag .mc-item[data-v="${U('dew_slime_helmet')}"]`); await p.waitForTimeout(500);
  const acts = await p.$$eval('.mc-detail .acts button', (x) => x.map((e) => e.innerText.trim()));
  ok(acts.includes('Надеть') && acts.some((a) => /Закрепить/.test(a)) && acts.includes('Разобрать'), 'карточка: ' + acts.join(', '));
  await p.mouse.move(5, 5); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/06-item-card.png` });
  // закрепить (и второй common), lock-иконка
  await p.click('.mc-detail [data-act="lock"]'); await sleep(900);
  await p.click(`.mc-bag .mc-item[data-v="${U('whisper_wisp_armor')}"]`); await p.waitForTimeout(400); await p.click('.mc-detail [data-act="lock"]'); await sleep(900);
  const lk = inv().filter((i) => i.lk).map((i) => i.id);
  ok(lk.includes('dew_slime_helmet') && lk.includes('whisper_wisp_armor'), 'сервер сохранил закрепление: ' + lk.join(','));
  const icons = await p.$$eval('.mc-bag .mc-item .mc-lk', (x) => x.length);
  ok(icons === 2, `значок 🔒 на ${icons} слотах`);
  const dis = await p.$eval('.mc-detail .acts .danger', (e) => e.disabled);
  ok(dis, 'кнопка «Разобрать» у закреплённого неактивна');
  await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/07-locked-icon-card.png` });
  // сервер отклоняет одиночный разбор закреплённого (минуя UI)
  const n0 = inv().length; p.toasts = [];
  await S({ type: 'salvage', uid: U('dew_slime_helmet') }); await sleep(800);
  ok(inv().length === n0 && p.toasts.some((x) => /закреплён/.test(x)), 'сервер: разбор закреплённого отклонён — ' + p.toasts.join(' / '));
  // массовый разбор common: превью без закреплённых
  const commons = inv().filter((i) => ['whisper_wisp_armor', 'dew_slime_helmet', 'rot_glitch_armor', 'mirage_hare_weapon'].includes(i.id) && !i.cursed).length;
  await p.click('.mc-salv [data-v="common"]'); await p.waitForTimeout(900);
  const ask = await p.$eval('.mc-ask', (e) => e.innerText);
  const m = ask.match(/\((\d+)\)/), nBefore = inv().length;
  await p.screenshot({ path: `${OUT}/08-bulk-preview.png` });
  await p.click('.mc-ask [data-ask="ok"]'); await sleep(1200);
  const left = inv().map((i) => i.id);
  ok(m && Number(m[1]) === nBefore - left.length && !/Капля-шапочка|Мерцающий жилет/.test(ask), `превью: к разбору ${m && m[1]}, разобрано ${nBefore - left.length}; закреплённых в списке нет`);
  ok(left.includes('dew_slime_helmet') && left.includes('whisper_wisp_armor') && !left.includes('rot_glitch_armor') && !left.includes('mirage_hare_weapon'), 'массовый разбор: закреплённые остались, остальные common разобраны — ' + left.join(','));
  // двойной клик — надеть
  await S({ type: 'dev_grant', item: 'night_bat_helmet' }); await S({ type: 'meta_get' }); await sleep(900);
  const nb = U('night_bat_helmet'); p.toasts = []; await p.dblclick(`.mc-bag .mc-item[data-v="${nb}"]`);  await sleep(1000); await S({ type: 'meta_get' }); await sleep(700); console.log('toasts', p.toasts, p.st.hero?.equip);
  ok(p.st.hero?.equip?.helmet === nb, 'двойной клик надел шлем');
  await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/09-after-dblclick-equip.png` });
  // после перезахода закрепление на месте (D1)
  await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500); await S({ type: 'meta_get' }); await sleep(800);
  ok(inv().filter((i) => i.lk).length === 2, 'закрепление пережило перезаход: ' + inv().filter((i) => i.lk).length);
  // телефон: долгое нажатие
  const mctx = await b.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true }); await guardLocal(mctx);
  const q = await mctx.newPage();
  await q.goto(assertLocalUrl(`${BASE}?name=Картограф&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await q.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await q.waitForTimeout(1000);
  await q.evaluate(() => window.__game.debug.selectClass('warrior')); await q.waitForTimeout(1500);
  await q.evaluate(() => window.__game.debug.openBook('gear')); await q.waitForTimeout(900);
  const el = await q.$(`.mc-bag .mc-item[data-v="${U('dew_slime_helmet')}"]`); await el.scrollIntoViewIfNeeded(); const bb = await el.boundingBox();
  const cdp = await mctx.newCDPSession(q); const pt = [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt }); await q.waitForTimeout(650);
  const mt = await q.evaluate(() => { const c = document.querySelector('.mc-cmp'); return c && c.style.display !== 'none' ? c.innerText : ''; });
  await q.screenshot({ path: `${OUT}/10-mobile-longpress.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await q.waitForTimeout(300);
  ok(/Сравнение/.test(mt), 'телефон: долгое нажатие показывает сравнение');
  ok(!p.errs.length && !(q.errs || []).length, 'без ошибок страницы ' + p.errs.join(';'));
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(R, null, 1));
  console.log(`\n${R.pass.length} PASS, ${R.fail.length} FAIL`);
  await b.close(); process.exit(R.fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
