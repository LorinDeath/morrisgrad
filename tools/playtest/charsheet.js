// C — свой лист персонажа + дерево талантов рядом; изучение из листа, ключевой выбор (второй закрыт), Esc/C закрывают,
// сохранение после перезагрузки. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3', UID = 'pt_cs_' + Date.now().toString(36);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); await guardLocal(ctx);
  const open = async () => { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=${UID}&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game.meta?.state, null, { timeout: 120000 }); await p.waitForTimeout(1500); return p; };
  let p = await open(); const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', flags: { talents_open: 1 }, xp: 5e6 })); await p.waitForTimeout(1500);
  const hero = () => G(() => { const h = window.__game.meta.state.hero; return { lvl: h.lvl, pts: h.talentPoints, t: h.talents, dmg: h.effective?.dmgPct }; });
  let h = await hero(); console.log('  hero', JSON.stringify(h));
  await p.mouse.click(800, 450); await p.keyboard.press('KeyC'); await p.waitForSelector('.mc-charsheet', { timeout: 10000 }); await p.waitForTimeout(1500);
  const secs = await p.$$eval('.mc-charsheet .mc-insp-h', (e) => e.map((x) => x.textContent));
  ok(['Снаряжение', 'Параметры', 'Навыки'].every((s) => secs.includes(s)), 'C: карточка как у «Персонажа» — ' + secs.join(', '));
  ok(await p.isVisible('.mc-charsheet .mc-cs-tal .mc-tree'), 'C: дерево талантов рядом');
  const box = await p.evaluate(() => { const a = document.querySelector('.mc-cs-card').getBoundingClientRect(), t = document.querySelector('.mc-cs-tal').getBoundingClientRect(); return { side: t.left >= a.right - 2, a: Math.round(a.width), t: Math.round(t.width) }; });
  ok(box.side, 'карточка и дерево — бок о бок ' + JSON.stringify(box));
  await p.screenshot({ path: `${OUT}/charsheet-1-open.png` });
  // изучить из листа: клик по доступному узлу
  const dmg0 = await p.$eval('.mc-cs-card', (e) => (e.innerText.match(/Урон\s*\+?([\d.]+)%/) || [])[1]);
  for (let i = 0; i < 5; i++) { await p.click('.mc-cs-tal [data-tid="mage.ether"]'); await p.waitForTimeout(450); }
  await p.waitForTimeout(1500);
  h = await hero(); ok(h.t['mage.ether'] === 5, 'клики по узлу в листе: «Эфир Аезера» 5/5 (сервер)');
  const dmg1 = await p.$eval('.mc-cs-card', (e) => (e.innerText.match(/Урон\s*\+?([\d.]+)%/) || [])[1]);
  ok(Number(dmg1) > Number(dmg0 || 0), `параметры в листе обновились: урон +${dmg0}% → +${dmg1}%`);
  await p.screenshot({ path: `${OUT}/talents-1-learned.png` });
  // до яруса ключевых и выбор «Пиромант»
  for (const id of ['coat', 'coat', 'coat', 'coat', 'coat', 'mind', 'mind', 'mind']) { await G((x) => window.__game.meta.talentLearn('mage.' + x), id); await p.waitForTimeout(250); }
  await p.waitForTimeout(1200);
  await p.click('.mc-cs-tal [data-tid="mage.pyro"]'); await p.waitForTimeout(1500);
  h = await hero(); ok(h.t['mage.pyro'] === 1, 'ключевой «Пиромант» выбран');
  ok(await p.$eval('.mc-cs-tal [data-tid="mage.cryo"]', (e) => e.classList.contains('excl')), '«Криомант» закрыт навсегда (excl)');
  await G(() => window.__game.meta.talentLearn('mage.cryo')); await p.waitForTimeout(1200);
  h = await hero(); ok(!h.t['mage.cryo'], 'сервер не дал взять второй ключевой');
  await p.hover('.mc-cs-tal [data-tid="mage.cryo"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/talents-2-keystone.png` });
  // C и Esc закрывают
  await p.keyboard.press('KeyC'); await p.waitForTimeout(500); ok(!(await p.isVisible('.mc-charsheet')), 'C — закрыть');
  await p.keyboard.press('KeyC'); await p.waitForSelector('.mc-charsheet'); await p.keyboard.press('Escape'); await p.waitForTimeout(500); ok(!(await p.isVisible('.mc-charsheet')), 'Esc — закрыть');
  // перезагрузка: таланты на месте
  const errs = p.errs; await p.close(); p = await open();
  h = await p.evaluate(() => window.__game.meta.state.hero?.talents || {});
  ok(h['mage.ether'] === 5 && h['mage.pyro'] === 1 && !h['mage.cryo'], 'после перезагрузки таланты сохранены ' + JSON.stringify(h));
  await p.mouse.click(800, 450); await p.keyboard.press('KeyC'); await p.waitForSelector('.mc-charsheet'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/charsheet-2-after-reload.png` });
  ok(!errs.length && !p.errs.length, 'без ошибок страницы ' + [...errs, ...p.errs].join('|'));
  console.log(fails ? `FAILED ${fails}` : 'charsheet ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
