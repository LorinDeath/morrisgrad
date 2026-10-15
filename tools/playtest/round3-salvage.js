// Раунд 3: разбор — массовый по редкости (превью с сервера в игровом окне), одиночный — игровое окно вместо confirm браузера
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  let dialogs = 0; p.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await p.goto(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_salv_${Date.now() % 1e6}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(2500);
  const ids = (process.env.IDS || 'guard_axe,aezer_staff,melveldil_sandals,padded_coat,greenpoise_bow').split(','); // по умолчанию — 3 редких + обычный + необычный
  for (const id of ids) { await G((id) => window.__game.debug.rawSend({ type: 'dev_grant', item: id }), id); await p.waitForTimeout(150); }
  await p.waitForTimeout(1200);
  await p.keyboard.press('i'); await p.waitForTimeout(900);
  const btns = await p.$$eval('[data-act="salvage_r"]', (l) => l.map((x) => x.dataset.v));
  ok(btns.includes('rare'), 'в сумке есть кнопки «разобрать всё» по редкости: ' + btns.join(','));
  await p.screenshot({ path: `${OUT}/r3-salvage-bag.png` });
  const shards0 = await G(() => window.__game.meta?.account?.res?.soul_shard || 0).catch(() => 0);
  await p.click('[data-act="salvage_r"][data-v="rare"]'); await p.waitForSelector('.mc-ask-box', { timeout: 5000 }); await p.waitForTimeout(400);
  const txt = await p.$eval('.mc-ask-box', (e) => e.innerText);
  ok(/Разобрать всё/.test(txt) && /Вы получите/.test(txt), 'игровое окно превью: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: `${OUT}/r3-salvage-preview.png` });
  await p.click('[data-ask="ok"]'); await p.waitForTimeout(1500);
  const left = await p.$$eval('[data-act="salvage_r"][data-v="rare"]', (l) => l.length);
  ok(left === 0, 'после подтверждения редких в сумке не осталось');
  await p.screenshot({ path: `${OUT}/r3-salvage-done.png` });
  const any = await p.$('.mc-bag .mc-item');
  if (any) { await any.click(); await p.waitForTimeout(400); const sb = await p.$('[data-act="salvage"]'); if (sb) { await sb.click(); await p.waitForTimeout(400); ok(!!(await p.$('.mc-ask-box')), 'одиночный разбор — игровое окно'); await p.screenshot({ path: `${OUT}/r3-salvage-single.png` }); await p.click('[data-ask="no"]'); } }
  ok(dialogs === 0, 'нет браузерных confirm()');
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
