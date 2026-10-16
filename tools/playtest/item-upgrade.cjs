// LOCAL плейтест улучшения у Петра (только localhost: guardLocal).
// IU_BASE=http://127.0.0.1:5263/game.html IU_WS=ws://127.0.0.1:8819 node tools/playtest/item-upgrade.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/item-upgrade';
const BASE = process.env.IU_BASE || 'http://127.0.0.1:5263/game.html', WS = process.env.IU_WS || 'ws://127.0.0.1:8819';
fs.mkdirSync(OUT, { recursive: true });
const R = { pass: [], fail: [] };
const ok = (c, m) => { (c ? R.pass : R.fail).push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  await guardLocal(ctx);
  const open = async (uid) => {
    const p = await ctx.newPage(); p.st = null; p.errs = []; p.toasts = []; p.res = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); try { if (s.includes('"type":"meta_state"')) { const j = JSON.parse(s); if (j.account) p.st = j; if (j.toast) p.toasts.push(j.toast); } else if (s.includes('toast_error')) p.toasts.push('ERR ' + JSON.parse(s).message); else if (s.includes('upgrade_result')) p.res.push(JSON.parse(s)); else if (s.includes('admin_result')) p.res.push(JSON.parse(s)); } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=Кузнец&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.waitForTimeout(1000); await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
    return p;
  };
  const p = await open('upg_' + Date.now().toString(36));
  const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
  await S({ type: 'dev_grant', xp: 5000 });
  for (const id of ['night_bat_helmet', 'night_bat_helmet@c', 'dew_slime_weapon']) { await S({ type: 'dev_grant', item: id }); await sleep(150); }
  await S({ type: 'meta_get' }); await sleep(900);
  const ORDER = p.st.upg.order; ok(ORDER.length === 58 && p.st.upg.maxLvl === 58, 'конфиг улучшения пришёл: 58 уровней');
  const inv = () => p.st.account.inv, U = (id, c) => inv().find((i) => i.id === id && !!i.cursed === !!c)?.uid;
  // вдали от Петра — отказ
  p.toasts = []; await S({ type: 'item_upgrade', uid: U('night_bat_helmet') }); await sleep(600);
  ok(p.toasts.some((t) => /у Петра/.test(t)), 'вдали от Петра сервер отказывает: ' + p.toasts.join('/'));
  await p.evaluate(() => window.__game.debug.tp(420, 800, true)); await sleep(800);
  await S({ type: 'item_upgrade', uid: U('night_bat_helmet') }); await sleep(700);
  ok(/Не хватает/.test(p.res.pop()?.err || ''), 'без материалов — отказ');
  // окно Петра (через диалог)
  await p.evaluate(() => window.__game.debug.openUpgrade()); await p.waitForTimeout(800);
  await p.click(`.mc-upg [data-u="sel"][data-v="${U('night_bat_helmet')}"]`); await p.waitForTimeout(400);
  const dis = await p.$eval('.mc-upg [data-u="go"]', (e) => e.disabled); ok(dis, 'кнопка неактивна без материалов');
  await p.screenshot({ path: `${OUT}/01-petr-window-need.png` });
  await S({ type: 'dev_grant', res: { [ORDER[0]]: 9, [ORDER[1]]: 9, [ORDER[2]]: 6 } }); await sleep(900);
  const hp0 = await p.$eval('.mc-upg table.st', (e) => e.innerText);
  await p.screenshot({ path: `${OUT}/02-petr-window-ready.png` });
  await p.click('.mc-upg [data-u="go"]'); await sleep(1000);
  const r1 = p.res.pop(); ok(r1?.ok && r1.up === 1 && inv().find((i) => i.uid === U('night_bat_helmet')).up === 1 && p.st.account.res[ORDER[0]] === 6, 'успех: +1, списано 3 (успех всегда, без провалов)');
  await p.click('.mc-upg [data-u="go"]'); await sleep(1000); // +2 требует ORDER[1]
  const nm = await p.$eval('.mc-upg .dt .nm', (e) => e.innerText);
  ok(/\+2/.test(nm) && p.st.account.res[ORDER[1]] === 6, 'второе улучшение: +2, списан материал второго уровня — ' + nm.trim());
  await p.screenshot({ path: `${OUT}/03-success-plus2.png` });
  // проклятая — стоимость ×2 и второй материал
  await p.click(`.mc-upg [data-u="sel"][data-v="${U('night_bat_helmet', 1)}"]`); await p.waitForTimeout(400);
  const cc = await p.$$eval('.mc-upg .cost', (x) => x.map((e) => e.innerText));
  ok(cc.length === 2 && cc.every((t) => /\/6$/.test(t.trim())), 'проклятая: 2 материала по 6 — ' + cc.join(' | '));
  await p.screenshot({ path: `${OUT}/04-cursed-cost.png` });
  await p.click('.mc-upg [data-u="go"]'); await sleep(1000);
  ok(p.res.pop()?.ok && !p.st.account.res[ORDER[0]] && p.st.account.res[ORDER[1]] === 0 || !p.st.account.res[ORDER[1]], 'проклятая +1: списано 6 + 6');
  // нехватка (нет ORDER[1] больше) — отказ, ничего не списано
  const before = JSON.stringify(p.st.account.res); await S({ type: 'item_upgrade', uid: U('night_bat_helmet', 1) }); await sleep(800);
  ok(!p.res.pop()?.ok && JSON.stringify(p.st.account.res) === before, 'не хватает — отказ, ресурсы не тронуты');
  await p.screenshot({ path: `${OUT}/05-not-enough.png` });
  // карточка в книге и подсказка: +N и улучшенные статы
  await p.evaluate(() => window.__game.api?.upgWin?.close?.() || document.querySelector('.mc-upg [data-u="x"]').click()); await p.waitForTimeout(300);
  await p.evaluate(() => window.__game.debug.openBook('gear')); await p.waitForTimeout(800);
  const cell = await p.$(`.mc-bag .mc-item[data-v="${U('night_bat_helmet')}"]`); const bb = await cell.boundingBox(); await p.mouse.move(bb.x + 20, bb.y + 20); await p.waitForTimeout(300);
  const tip = await p.evaluate(() => document.querySelector('.mc-cmp')?.innerText || '');
  ok(/\+2/.test(tip) && /Здоровье: \+76/.test(tip), 'подсказка: «+2» и hp 72×1.06=76 — ' + tip.replace(/\n/g, ' | ').slice(0, 160));
  await p.screenshot({ path: `${OUT}/06-tooltip-upgraded.png` });
  // сохранение после перезахода (D1)
  await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1200); await S({ type: 'meta_get' }); await sleep(800);
  ok(inv().find((i) => i.id === 'night_bat_helmet' && !i.cursed)?.up === 2 && inv().find((i) => i.cursed)?.up === 1, 'уровни улучшения пережили перезаход');
  // админка: вкладка «⚒ Улучшение», живая правка
  const A = await open('upg_admin');
  await A.evaluate(() => window.__game.debug.openAdmin()); await A.waitForTimeout(1500);
  const tabs = await A.evaluate(() => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
  ok(tabs.includes('upgrade'), 'админ видит вкладку «⚒ Улучшение»');
  await A.evaluate(() => document.querySelector('.mc-admin [data-tab="upgrade"]')?.click()); await A.waitForTimeout(500);
  await A.evaluate(() => document.querySelector('.mc-admin aside li[data-id="main"]')?.click()); await A.waitForTimeout(700);
  const nF = await A.evaluate(() => document.querySelectorAll('.mc-admin section [data-p]').length); ok(nF >= 7 + 116, `форма: ${nF} полей (7 общих + материал и кол-во на 58 уровней)`);
  await A.screenshot({ path: `${OUT}/07-admin-tab.png` });
  await A.evaluate(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'upgrade', id: 'main', patch: { cost: 1, flatPct: 10 } })); await sleep(1000);
  await S({ type: 'meta_get' }); await sleep(800);
  ok(p.st.upg.cost === 1 && p.st.upg.flatPct === 10, 'правка админки дошла до игрока живьём');
  await A.evaluate(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'upgrade', id: 'main' })); await sleep(800);
  ok(!p.errs.length && !A.errs.length, 'без ошибок страницы ' + [...p.errs, ...A.errs].join(';'));
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(R, null, 1));
  console.log(`\n${R.pass.length} PASS, ${R.fail.length} FAIL`);
  await b.close(); process.exit(R.fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
