// LOCAL: метки игрока на карте M — правый клик / ＋📍, имя, клик → «Удалить», скрыть/показать, зум +/−/колесо,
// хранение на героя (перезаход — на месте; другой герой и другой игрок — не видят). Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/map-biomes-v2', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', UID = 'mk_' + Date.now();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (n, uid, cls = 'warrior') => { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await guardLocal(ctx); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`${BASE}?name=${n}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.waitForTimeout(1000); await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(2000);
    for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) {
      await p.evaluate(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await p.waitForTimeout(700);
      await p.evaluate(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500); }
    await p.waitForTimeout(2000); return p; };
  const A = await open('MarkA', UID), G = (fn, a) => A.evaluate(fn, a), wm = () => G(() => window.__game.debug.worldMap());
  await A.keyboard.press('KeyM'); await A.waitForTimeout(500);
  const k0 = (await wm()).k; await A.keyboard.press('Equal'); await A.waitForTimeout(200); const k1 = (await wm()).k;
  await A.keyboard.press('Minus'); await A.keyboard.press('Minus'); await A.waitForTimeout(200); const k2 = (await wm()).k;
  await A.mouse.move(640, 400); await A.mouse.wheel(0, -300); await A.waitForTimeout(200); const k3 = (await wm()).k;
  ok(k1 > k0 && k2 < k1 && k3 > k2, `зум: + ${k0.toFixed(3)}→${k1.toFixed(3)}, − → ${k2.toFixed(3)}, колесо → ${k3.toFixed(3)}`);
  await A.mouse.click(760, 330, { button: 'right' }); await A.waitForSelector('.wm-pop input', { timeout: 3000 });
  await A.fill('.wm-pop input', 'Логово <b>Пругли</b> — проверить ночью, очень длинное название'); await A.screenshot({ path: `${OUT}/07-mark-add-popup.png` });
  await A.keyboard.press('Enter'); await A.waitForTimeout(800);
  let m = await G(() => window.__game.debug.marks()); ok(m.n === 1 && m.list[0].length <= 32 && !/[<>]/.test(m.list[0]), 'правый клик → метка, имя ≤ 32 и без <>: ' + JSON.stringify(m.list));
  await A.click('[data-mkadd]'); await A.mouse.click(520, 470); await A.waitForSelector('.wm-pop input', { timeout: 3000 }); await A.fill('.wm-pop input', 'Руда'); await A.click('.wm-pop [data-ok]'); await A.waitForTimeout(800);
  m = await G(() => window.__game.debug.marks()); ok(m.n === 2, 'кнопка ＋📍 + клик → вторая метка ' + JSON.stringify(m.list));
  await A.keyboard.press('KeyN'); await A.waitForTimeout(300); await A.screenshot({ path: `${OUT}/08-marks-with-biomes.png` });
  ok((await wm()).biome && (await wm()).marks === 2, 'метки видны и в режиме биомов');
  await A.mouse.click(520 + 6, 470 - 10); await A.waitForTimeout(300);
  ok(/Руда/.test(await A.textContent('.wm-pop').catch(() => '')) && !!(await A.$('.wm-pop [data-del]')), 'клик по метке → окошко с именем и «Удалить»');
  await A.screenshot({ path: `${OUT}/09-mark-popup-delete.png` });
  await A.click('.wm-pop [data-del]'); await A.waitForTimeout(800); m = await G(() => window.__game.debug.marks()); ok(m.n === 1 && !m.list.includes('Руда'), 'удалено ' + JSON.stringify(m.list));
  await A.click('[data-mk]'); await A.waitForTimeout(200); let s = await wm(); ok(!s.marksShown && s.marks === 0, 'кнопка 📍 скрыла метки');
  await A.screenshot({ path: `${OUT}/10-marks-hidden.png` }); await A.click('[data-mk]'); await A.waitForTimeout(200); ok((await wm()).marks === 1, 'и показала снова');
  ok(!A.errs.length, 'без ошибок страницы ' + A.errs.join('|'));
  // перезаход тем же героем — метка на месте; другой игрок и другой герой — пусто
  await A.context().close();
  const A2 = await open('MarkA', UID); const m2 = await A2.evaluate(() => window.__game.debug.marks()); ok(m2.n === 1, 'после перезахода метка сохранена (D1): ' + JSON.stringify(m2.list));
  await A2.context().close();
  const A3 = await open('MarkA', UID, 'mage'); const m3 = await A3.evaluate(() => window.__game.debug.marks()); ok(m3.n === 0, 'другой герой того же аккаунта — своих меток нет'); await A3.context().close();
  const B = await open('MarkB', 'mk_other_' + Date.now()); const mb = await B.evaluate(() => window.__game.debug.marks()); ok(mb.n === 0, 'другой игрок меток не видит');
  await B.evaluate(() => window.__game.debug.rawSend({ type: 'mark_add', x: 1e9, y: 5, n: 'x' })); await B.waitForTimeout(600); ok((await B.evaluate(() => window.__game.debug.marks())).n === 0, 'сервер отклонил метку вне карты');
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
