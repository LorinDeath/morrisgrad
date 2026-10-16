// LOCAL: проклятые вещи в карточке «Персонаж» (чужой и свой C) и на Алтаре. Только localhost (guardLocal).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/item-upgrade/inspect-cursed';
const BASE = process.env.IU_BASE || 'http://127.0.0.1:5263/game.html', WS = process.env.IU_WS || 'ws://127.0.0.1:8819';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (name, uid, vp = { width: 1280, height: 800 }, mobile = false) => {
    const ctx = await b.newContext({ viewport: vp, ...(mobile ? { hasTouch: true, isMobile: true } : {}) }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.st = null; p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { const j = JSON.parse(s); if (j.account) p.st = j; } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${encodeURIComponent(name)}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1000);
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500); return p;
  };
  const t = Date.now().toString(36);
  const A = await open('Проклятик', 'insA_' + t);
  const S = (o) => A.evaluate((x) => window.__game.debug.send(x), o);
  await S({ type: 'dev_grant', xp: 5000 });
  for (const id of ['night_bat_helmet@c', 'dew_slime_weapon@c', 'dew_slime_weapon']) await S({ type: 'dev_grant', item: id });
  await S({ type: 'meta_get' }); await sleep(1500);
  const inv = A.st.account.inv; const h = inv.find((i) => i.id === 'night_bat_helmet' && i.cursed), w = inv.find((i) => i.id === 'dew_slime_weapon' && i.cursed);
  await S({ type: 'dev_grant', setUp: { uid: h.uid, up: 24 } }); await S({ type: 'dev_grant', setUp: { uid: w.uid, up: 58 } });
  await S({ type: 'equip', uid: h.uid }); await S({ type: 'equip', uid: w.uid }); await S({ type: 'meta_get' }); await sleep(1500);
  const shot = async (p, tag) => {
    await p.waitForSelector('.mc-insp-slot', { timeout: 15000 }); await p.waitForTimeout(500);
    const cz = await p.$$eval('.mc-insp-slot.cursed', (x) => x.map((e) => e.querySelector('.mc-upb')?.innerText));
    ok(cz.length === 2 && cz.includes('+24') && cz.includes('+58'), `${tag}: проклятых слотов ${cz.length} (${cz})`);
    await p.mouse.move(3, 3); await p.screenshot({ path: `${OUT}/${tag}-01-card.png` });
    const s = await p.$('.mc-insp-slot.cursed'); await s.hover(); await p.waitForTimeout(400);
    const tip = await s.$eval('.tip', (e) => e.innerText); ok(/Проклят/.test(tip) && /☠ Проклятая/.test(tip), `${tag}: подсказка «${tip.split('\n')[0]}»`);
    await p.screenshot({ path: `${OUT}/${tag}-02-hover-tip.png` });
    await p.$('.mc-insp-gear').then((e) => e.screenshot({ path: `${OUT}/${tag}-03-gear-closeup.png` }));
  };
  // свой (C)
  await A.evaluate(() => window.__game.debug.charSheet()); await shot(A, 'self-C');
  await A.keyboard.press('Escape'); await A.evaluate(() => window.__game.debug.charSheet && document.querySelector('.mc-soc-x')?.click());
  // чужой — ПК и телефон
  const sid = await A.evaluate(() => window.__game.state().myId);
  for (const [tag, vp, mob] of [['other-pc', { width: 1280, height: 800 }, false], ['other-mobile', { width: 740, height: 360 }, true]]) {
    const B = await open('Зритель', 'insB_' + tag + t, vp, mob); await sleep(1500);
    await B.evaluate((x) => window.__game.debug.inspect(x), sid); await shot(B, tag);
    if (mob) { const s = await B.$('.mc-insp-slot.cursed'); await s.tap(); await B.waitForTimeout(300); await B.screenshot({ path: `${OUT}/${tag}-04-tap-tip.png` }); }
    ok(!B.errs.length, tag + ' без ошибок ' + B.errs.join(';'));
  }
  // Алтарь
  await A.evaluate(() => window.__game.debug.openAltar()); await A.waitForTimeout(1500);
  ok(await A.$$eval('.mc-altar-slot.cursed', (x) => x.length) === 2, 'Алтарь: проклятые слоты подсвечены');
  await A.screenshot({ path: `${OUT}/altar-01.png` });
  // книга (Снаряжение)
  await A.evaluate(() => window.__game.debug.openBook('gear')); await A.waitForTimeout(1000);
  ok(await A.$$eval('.mc-gslot.cursed', (x) => x.length) === 2, 'Книга: проклятые слоты'); await A.screenshot({ path: `${OUT}/book-gear-01.png` });
  ok(!A.errs.length, 'A без ошибок ' + A.errs.join(';'));
  await b.close(); console.log(fails ? fails + ' FAIL' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
