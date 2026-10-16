// LOCAL: размер сундука рядом с героем, ореол проклятия 1/3/5 рядом с героем в проклятом (1/3/5), закрыт/открыт, тень. Только localhost.
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/chest-style-v2', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(assertLocalUrl(`${BASE}?name=Style&uid=ch_v2_${Date.now()}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
  const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
  const SET = ['dew_slime_weapon', 'dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands'];
  for (const id of SET) { await S({ type: 'dev_grant', item: id + '@c' }); await p.waitForTimeout(80); }
  await p.waitForTimeout(800);
  const cset = await p.evaluate((SET) => { const inv = window.__game.meta.account.inv; return SET.map((id) => inv.find((i) => i.id === id && i.cursed)?.uid); }, SET);
  const P0 = await p.evaluate(() => window.__game.debug.pos()); const X = Math.round(P0.x) + 150, Y = Math.round(P0.y) + 60;
  const tp = (x, y) => p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]);
  const W = 'dew_slime_weapon', mk = (n) => [...Array(n)].map(() => W + '@c').concat([W]);
  // 1) размер: обычный сундук рядом с героем
  await tp(X, Y); await p.waitForTimeout(600);
  await S({ type: 'dev_grant', chestSpawn: { dx: 55, dy: 0, by: { me: [W] } } }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__game.debug.setZoom?.(1.0)); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/01-size-next-to-player-closed.png` });
  // 2) открыт (своё личное окно скрываем)
  const c0 = await p.evaluate(() => window.__game.debug.chests().sort((a, b) => b.id - a.id)[0]);
  await S({ type: 'chest_open', chest: c0.id }); await p.waitForTimeout(2500);
  await p.evaluate(() => { const w = document.getElementById('mc-chest'); if (w) w.style.visibility = 'hidden'; }); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/02-opened.png` });
  await p.keyboard.press('Escape'); await p.evaluate(() => { const w = document.getElementById('mc-chest'); if (w) w.style.visibility = ''; });
  // 3) ореол 1/3/5: герой в n проклятых рядом с сундуком с n проклятыми
  let eq = 0; const lv = {};
  for (const [i, n] of [[0, 1], [1, 3], [2, 5]]) {
    while (eq < n) { await p.evaluate((u) => window.__game.meta.equip(u), cset[eq]); eq++; await p.waitForTimeout(400); }
    await tp(X + 260, Y - 60 + 140 * i); await p.evaluate(() => window.__game.debug.setZoom?.(1.7)); await p.waitForTimeout(600);
    await S({ type: 'dev_grant', chestSpawn: { dx: 60, dy: -5, by: { me: mk(n) } } }); await p.waitForTimeout(2200);
    lv[n] = await p.evaluate(() => ({ me: window.__game.debug.myGlow?.(), ch: window.__game.debug.chests().sort((a, b) => b.id - a.id)[0]?.cz }));
    await p.screenshot({ path: `${OUT}/0${3 + i}-glow-${n}-chest-vs-player.png` });
  }
  console.log(JSON.stringify(lv));
  // 4) тень крупно
  await tp(X, Y + 30); await p.evaluate(() => window.__game.debug.setZoom?.(1.8)); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/06-shadow-closeup.png` });
  console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
