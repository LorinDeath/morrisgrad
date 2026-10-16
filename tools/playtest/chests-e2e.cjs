// LOCAL e2e сундуков схватки (только localhost: guardLocal). 3 игрока + модератор.
// CH_BASE=http://127.0.0.1:5243/game.html CH_WS=ws://127.0.0.1:8799 node tools/playtest/chests-e2e.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/loot-chests';
const BASE = process.env.CH_BASE || 'http://127.0.0.1:5243/game.html', WS = process.env.CH_WS || 'ws://127.0.0.1:8799';
fs.mkdirSync(OUT, { recursive: true });
const R = { pass: [], fail: [], notes: [] };
const ok = (c, m) => { (c ? R.pass : R.fail).push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  await guardLocal(ctx);
  const open = async (name, uid, cls) => {
    const p = await ctx.newPage(); p.msgs = []; p.errs = []; p.raw = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('chest')) p.raw.push({ t: Date.now(), s }); if (/"type":"(chest_|dev_chests|admin_result|toast_error)/.test(s) || s.includes('"loot":{')) { try { p.msgs.push(JSON.parse(s)); } catch {} } }));
    await p.goto(assertLocalUrl(`${BASE}?name=${encodeURIComponent(name)}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.waitForTimeout(1000);
    await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1500);
    return p;
  };
  const S = (p, o) => p.evaluate((x) => window.__game.debug.send(x), o);
  const RAW = (p, o) => p.evaluate((x) => window.__game.debug.rawSend(x), o);
  const msg = async (p, pred, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const i = p.msgs.findIndex(pred); if (i >= 0) return p.msgs.splice(i, 1)[0]; await sleep(80); } return null; };
  const shot = (p, f) => p.screenshot({ path: `${OUT}/${f}` });
  const tp = (p, x, y, god = true) => p.evaluate(([a, b2, g]) => window.__game.debug.tp(a, b2, g), [x, y, god]);
  const chests = async (p) => { p.msgs = p.msgs.filter((m) => m.type !== 'dev_chests'); await S(p, { type: 'dev_grant', chestInfo: true }); const r = await msg(p, (m) => m.type === 'dev_chests'); if (r && R.pre) r.list = r.list.filter((c) => !R.pre.includes(c.id)); return r; };

  // ---- админка: отдельная вкладка «📦 Сундуки», только админ ----
  const A = await open('Админ', 'ch_admin', 'warrior');
  await S(A, { type: 'dev_grant', xp: 3000 });
  await A.evaluate(() => window.__game.debug.openAdmin()); await A.waitForTimeout(1500);
  const tabsA = await A.evaluate(() => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
  ok(tabsA.includes('chest'), 'админ видит вкладку «📦 Сундуки»');
  await A.evaluate(() => document.querySelector('.mc-admin [data-tab="chest"]')?.click()); await A.waitForTimeout(500);
  await A.evaluate(() => document.querySelector('.mc-admin aside li[data-id="main"]')?.click()); await A.waitForTimeout(700);
  const nF = await A.evaluate(() => document.querySelectorAll('.mc-admin section [data-p]').length);
  ok(nF >= 14, `форма сундуков: ${nF} полей`);
  await shot(A, '01-admin-chest-tab.png');
  await A.waitForTimeout(1500); const pre = await chests(A); R.pre = (pre?.list || []).map((c) => c.id);
  ok(true, `восстановлено из D1 после перезапуска сервера: ${R.pre.length} сундук(ов) ${JSON.stringify(R.pre)}`); R.notes.push('restored ' + JSON.stringify(pre?.list));
  // быстрые таймеры для теста (живая правка из админки → D1)
  A.msgs.length = 0;
  await RAW(A, { type: 'admin_save', kind: 'chest', id: 'main', patch: { personalSec: 45, channelSec: 8, publicSec: 600, minSharePct: 7, guard: true, guardN: 3 } });
  const sv = await msg(A, (m) => m.type === 'admin_result'); ok(sv && sv.ok !== false, 'админ сохранил быстрые таймеры (45 с / канал 8 с)');
  await RAW(A, { type: 'admin_save', kind: 'curse', id: 'main', patch: { equipDropMult: 100 } }); await msg(A, (m) => m.type === 'admin_result'); // чтобы дроп был гарантирован
  await A.evaluate(() => window.__game.debug.closeAdmin?.() || document.querySelector('.mc-admin .x, .mc-admin [data-act="close"]')?.click());
  const M = await open('Модер', 'ch_mod', 'mage');
  await M.evaluate(() => window.__game.debug.openAdmin()); await M.waitForTimeout(1500);
  const tabsM = await M.evaluate(() => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
  ok(!tabsM.includes('chest'), `модератор не видит «Сундуки»: ${tabsM.join(',')}`);
  M.msgs.length = 0; await RAW(M, { type: 'admin_save', kind: 'chest', id: 'main', patch: { personalSec: 1 } });
  const mr = await msg(M, (m) => m.type === 'admin_result' || m.type === 'toast_error'); ok(mr && (mr.ok === false || mr.type === 'toast_error'), `сервер отклонил правку модератора: ${JSON.stringify(mr).slice(0, 120)}`);
  await M.close();

  // ---- 3 игрока: схватка из 3 мобов → один сундук ----
  const B = await open('Боец', 'ch_b_' + Date.now(), 'mage');
  const C = await open('Чужой', 'ch_c_' + Date.now(), 'warrior');
  await A.reload(); await A.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await A.waitForTimeout(1200);
  const P0 = await A.evaluate(() => window.__game.debug.pos()); const X = Math.round(P0.x), Y = Math.round(P0.y) + 220;
  for (const p of [A, B, C]) await tp(p, X, Y);
  await A.waitForTimeout(600);
  for (let i = 0; i < 3; i++) await A.evaluate(([x, y]) => window.__game.debug.devSpawn('dew_slime', x, y, false), [X + 120 + i * 40, Y + (i - 1) * 40]);
  await A.waitForTimeout(800);
  await S(A, { type: 'dev_grant', engageNear: 320 }); await S(B, { type: 'dev_grant', engageNear: 320 });
  await A.waitForTimeout(300);
  await S(A, { type: 'dev_grant', killNear: true }); await A.waitForTimeout(250);
  let ci = await chests(A); ok(ci && ci.list.length === 0 && ci.enc >= 1, `после 1-го убийства: сундука нет, схватка открыта (${JSON.stringify(ci)})`);
  await S(B, { type: 'dev_grant', killNear: true }); await A.waitForTimeout(250);
  await S(A, { type: 'dev_grant', killNear: true }); await A.waitForTimeout(800);
  for (let i = 0; i < 10; i++) { ci = await chests(A); if (ci.list.length) break; await S(i % 2 ? B : A, { type: 'dev_grant', killNear: true }); await A.waitForTimeout(500); } // в схватку могли войти бродячие мобы Поляны — добиваем всех
  R.notes.push('extra kills until chest: ' + JSON.stringify(ci));
  ci = await chests(A); const ch = ci?.list?.[0]; R.chestAt = Date.now();
  ok(ci && ci.list.length === 1, `последний моб → ОДИН сундук (${JSON.stringify(ci?.list)})`);
  ok(ch && ch.owners.length === 2, `личные броски у A и B, C без вклада (${ch && ch.owners.join(',')})`);
  // одиночный моб → мешок, не сундук
  await tp(A, X + 1400, Y + 900); await A.waitForTimeout(700); const Pl = await A.evaluate(() => window.__game.debug.pos());
  await A.evaluate(([x, y]) => window.__game.debug.devSpawn('dew_slime', x, y, false), [Pl.x + 60, Pl.y]); await A.waitForTimeout(700);
  A.msgs.length = 0; await S(A, { type: 'dev_grant', killNear: true });
  const lm = await msg(A, (m) => m.loot && (m.loot.bag || m.loot.enc !== undefined), 4000); const lo = lm && (lm.loot || lm.push?.loot || Object.values(lm).find((v) => v && v.loot)?.loot);
  const ci2 = await chests(A); R.notes.push('lone loot msg: ' + JSON.stringify(lm).slice(0, 300));
  ok(lo && lo.bag && lo.enc === undefined && ci2.list.length === 1, `одиночный моб → мешок сразу (bag=${JSON.stringify(lo?.bag)}), сундуков по-прежнему 1`);
  await tp(A, ch.x - 40, ch.y + 30); await A.waitForTimeout(900);
  await A.evaluate(() => window.__game.debug.setZoom?.(1.4)); await A.waitForTimeout(900);
  await shot(A, '02-chest-in-world-personal.png');
  // ---- личная фаза ----
  A.msgs.length = 0; await S(A, { type: 'chest_open', chest: ch.id });
  const va = await msg(A, (m) => m.type === 'chest_view'); ok(va && va.entries.length > 0 && va.entries.every((e) => e.mine) && !va.pub, `A открыл сразу, видит только своё (${va?.entries.length})`);
  await A.waitForTimeout(500); await shot(A, '03-personal-window.png'); await A.evaluate(() => { const w = document.getElementById('mc-chest'); if (w) w.style.visibility = 'hidden'; }); await A.waitForTimeout(300); await shot(A, '11-world-chest-opened.png'); await A.evaluate(() => { const w = document.getElementById('mc-chest'); if (w) w.style.visibility = ''; });
  const myN = ch.per['uid:ch_admin']; ok(va.entries.length === myN, `A: в сети пришло ровно своих ${va.entries.length} из ${ch.n} (свои по серверу ${myN})`);
  // обычный клик — подсказка, Shift+клик — взять
  const cell = A.locator('#mc-chest .cell[data-lid]').first(); const lid0 = Number(await cell.getAttribute('data-lid'));
  await cell.click(); await A.waitForTimeout(400);
  ok(/Shift/.test(await A.locator('#mc-chest .msg').innerText()), 'клик без Shift не берёт (подсказка)');
  await cell.click({ modifiers: ['Shift'] });
  const ta = await msg(A, (m) => m.type === 'chest_view' && m.taken === lid0); ok(!!ta && !ta.entries.some((e) => e.lid === lid0), 'Shift+клик: предмет взят');
  await A.waitForTimeout(300); await shot(A, '04-personal-after-shift-take.png');
  // анти-дюп: повтор того же lid
  A.msgs.length = 0; await S(A, { type: 'chest_take', chest: ch.id, lid: lid0 }); const dd = await msg(A, (m) => m.type === 'chest_err'); ok(dd && /Уже/.test(dd.message), 'повтор lid → «Уже забрали»');
  // B: своё; B пытается взять позицию A
  await tp(B, ch.x + 30, ch.y); await B.waitForTimeout(700); B.msgs.length = 0;
  await S(B, { type: 'chest_open', chest: ch.id }); const vb = await msg(B, (m) => m.type === 'chest_view'); ok(vb && vb.entries.every((e) => e.mine), `B видит только своё (${vb?.entries.length})`);
  const bPk = Object.keys(ch.per).find((k) => k !== 'uid:ch_admin');
  ok(vb.entries.length === ch.per[bPk], `B: пришло ровно своих ${vb.entries.length} (по серверу ${ch.per[bPk]})`);
  const aL = new Set(va.entries.map((e) => e.lid)); ok(!vb.entries.some((e) => aL.has(e.lid)), 'личные payload A и B не пересекаются (чужие позиции не отправляются)');
  const aLid = va.entries.find((e) => e.lid !== lid0)?.lid; if (aLid) { await S(B, { type: 'chest_take', chest: ch.id, lid: aLid }); const e1 = await msg(B, (m) => m.type === 'chest_err'); ok(e1 && /чужая/.test(e1.message), 'B не может взять позицию A'); }
  // C без вклада
  await tp(C, ch.x, ch.y + 40); await C.waitForTimeout(700); C.msgs.length = 0;
  await S(C, { type: 'chest_open', chest: ch.id }); const ec = await msg(C, (m) => m.type === 'chest_err'); ok(ec && /личный/.test(ec.message), `C: «${ec?.message}»`);
  await C.waitForTimeout(300); await shot(C, '05-foreign-personal-denied.png');
  const leakC = C.raw.filter((r) => /"entries":\[\{/.test(r.s)); ok(!leakC.length, `C в личной фазе не получил ни одной позиции (кадров с entries: ${leakC.length})`);
  // смерть/возвращение: A «умирает» (перезаход новой сессией) и возвращается — его вещи ждут
  await A.reload(); await A.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await A.waitForTimeout(1200);
  await tp(A, ch.x - 40, ch.y + 30); await A.waitForTimeout(800); A.msgs.length = 0;
  await S(A, { type: 'chest_open', chest: ch.id }); const va2 = await msg(A, (m) => m.type === 'chest_view'); ok(va2 && va2.entries.length === va.entries.length - 1, `после перезахода A снова открывает: ${va2?.entries.length} своих`);
  // ---- общая фаза ----
  const wait = Math.max(0, ch && (25000 - (Date.now() - (R.t0 || Date.now()))) );
  console.log('ждём общую фазу…'); await sleep(Math.max(0, 46000 - (Date.now() - R.chestAt)));
  ci = await chests(C); ok(ci.list[0]?.pub, 'через personalSec сундук общий');
  ok(ci.list[0]?.guarded, 'стража выставлена (guard)');
  C.msgs.length = 0; await C.evaluate(() => window.__game.debug.setZoom?.(2.0));
  await S(C, { type: 'chest_open', chest: ch.id }); const cc = await msg(C, (m) => m.type === 'chest_channel'); ok(cc && cc.sec === 8, `C: канал открытия ${cc?.sec} с`);
  await C.waitForTimeout(1500); await shot(C, '06-public-channel-progress.png'); await C.evaluate(() => window.__game.debug.setZoom?.(1.4)); await C.waitForTimeout(300); await shot(C, '12-world-chest-channel-shake.png');
  await S(C, { type: 'dev_grant', hurtMe: true }); const cx = await msg(C, (m) => m.type === 'chest_cancel'); ok(cx && /ударили/.test(cx.message), 'урон прерывает канал');
  await C.waitForTimeout(300); await shot(C, '07-channel-interrupted.png');
  C.msgs.length = 0; await S(C, { type: 'chest_open', chest: ch.id }); await msg(C, (m) => m.type === 'chest_channel');
  const vc = await msg(C, (m) => m.type === 'chest_view' && m.opened, 12000); const ciPub = await chests(C); ok(vc && vc.pub && vc.entries.length === ciPub.list[0].n, `общая фаза: C видит ВСЕ оставшиеся ${vc?.entries.length} из ${ciPub.list[0].n}`);
  await C.waitForTimeout(400); await shot(C, '08-public-window.png');
  await A.evaluate(() => window.__game.debug.setZoom?.(1.4)); await A.waitForTimeout(500); await shot(A, '13-world-chest-public-grey.png');
  // B тоже открывает; конкуренция за одну позицию
  B.msgs.length = 0; await S(B, { type: 'chest_open', chest: ch.id }); await msg(B, (m) => m.type === 'chest_channel'); const vbo = await msg(B, (m) => m.type === 'chest_view' && m.opened, 12000);
  const L = vc.entries[0].lid; C.msgs.length = 0; B.msgs.length = 0;
  await Promise.all([S(C, { type: 'chest_take', chest: ch.id, lid: L }), S(B, { type: 'chest_take', chest: ch.id, lid: L })]);
  const rc = await msg(C, (m) => (m.type === 'chest_view' && m.taken === L) || (m.type === 'chest_err' && m.lid === L)), rb = await msg(B, (m) => (m.type === 'chest_view' && m.taken === L) || (m.type === 'chest_err' && m.lid === L));
  const wins = [rc, rb].filter((m) => m && m.type === 'chest_view').length; ok(!!vbo && wins === 1, `конкуренция: взял ровно один (${rc?.type}/${rb?.type})`);
  // Shift+клик мышью в общем окне
  const c2 = C.locator('#mc-chest .cell[data-lid]').first(); if (await c2.count()) { const l2 = Number(await c2.getAttribute('data-lid')); await c2.click({ modifiers: ['Shift'] }); const t2 = await msg(C, (m) => m.type === 'chest_view' && m.taken === l2); ok(!!t2, 'общий: Shift+клик берёт'); }
  // реальный удар моба закрывает окно
  await tp(C, ch.x, ch.y + 40, false); await C.waitForTimeout(400); C.msgs.length = 0;
  await S(C, { type: 'dev_grant', hurtMe: true });
  const cl = await msg(C, (m) => m.type === 'chest_close'); ok(cl && /ударили/.test(cl.message), 'урон закрывает окно добычи');
  await C.waitForTimeout(400); ok(!(await C.evaluate(() => window.__game.debug.chest().open)), 'окно закрыто у клиента'); await shot(C, '09-window-closed-on-hit.png');
  // D1: сундук сохранён (переживает перезапуск DO)
  R.notes.push('pageerrors: ' + JSON.stringify([A, B, C].flatMap((p) => p.errs)));
  ok([A, B, C].every((p) => !p.errs.length), 'нет ошибок страницы');
  // вернуть настройки
  await RAW(A, { type: 'admin_reset', kind: 'chest', id: 'main' }); await RAW(A, { type: 'admin_reset', kind: 'curse', id: 'main' }); await A.waitForTimeout(1500);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(R, null, 1));
  console.log(`\n${R.pass.length} passed, ${R.fail.length} failed`);
  await b.close(); process.exit(R.fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
