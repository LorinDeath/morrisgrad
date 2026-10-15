// Панель действий: мир (навыки Q/R/F + рывок + атака, серверная перезарядка, подсказки, закрытый 3-й слот) и забег (навыки + рывок + ряд оружия/пассивок).
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  const errs = []; let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.stack || e)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Abar&uid=test_r2_abar_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
  const G = (fn, a) => p.evaluate(fn, a);
  await p.waitForTimeout(1200);
  const slots = () => G(() => [...document.querySelectorAll('.mc-abar-main .mc-as')].map((e) => ({ kind: e.dataset.kind, id: e.dataset.id, key: e.querySelector('.key')?.textContent, cd: e.querySelector('.cd')?.textContent, locked: e.classList.contains('locked'), empty: e.classList.contains('empty'), oncd: e.classList.contains('oncd'), pend: e.classList.contains('pending'), rc: e.style.getPropertyValue('--rc') })));
  let s0 = await slots();
  ok(s0.length === 6 && s0.filter((x) => ['ab', 'rs', 'atk'].includes(x.kind)).every((x) => x.locked) && s0.some((x) => x.kind === 'dash' && !x.locked), 'soul (no hero): Q/G/F + R + attack locked (герой на Алтаре), dash open — ' + s0.map((x) => x.kind + (x.locked ? '🔒' : '')).join(','));
  // герой
  for (let i = 0; i < 6; i++) { await G(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500); if (await G(() => !!window.__game.meta?.hero)) break; }
  await p.waitForFunction(() => document.querySelector('.mc-abar-main .mc-as.ab:not(.locked):not(.empty)'), null, { timeout: 8000 }).catch(() => {});
  s0 = await slots();
  const q = s0[0];
  ok(q.kind === 'ab' && q.id === 'backstab' && q.key === 'Q' && !q.locked, 'hero: Q = backstab with pixel icon — ' + JSON.stringify(q));
  ok(s0[2].locked, 'hero lvl 1: 3rd slot locked (opens at lvl 5)');
  ok(s0.some((x) => x.kind === 'dash' && x.key === 'Space') && s0.some((x) => x.kind === 'atk'), 'dash (Space) and attack (ЛКМ) slots present');
  ok(await G(() => !!document.querySelector('.mc-abar-main .mc-as .mc-sic')?.style.backgroundImage), 'slots use the skill icon atlas');
  // наведение → подсказка
  const qEl = p.locator('.mc-abar-main .mc-as').first();
  await qEl.hover(); await p.waitForTimeout(200);
  ok(await G(() => getComputedStyle(document.querySelector('.mc-abar-main .mc-as .tip')).display === 'block'), 'hover shows tooltip');
  await p.mouse.move(700, 300);
  // Q → серверная перезарядка
  await p.keyboard.press('KeyQ'); await p.waitForTimeout(60);
  const sPend = await slots();
  await p.waitForTimeout(900);
  const s1 = await slots();
  ok(s1[0].oncd && Number(s1[0].cd) > 5, 'after Q: server-confirmed cooldown shown (' + s1[0].cd + ' s, pending was ' + sPend[0].pend + ')');
  await p.screenshot({ path: `${OUT}/desktop-actionbar-hub.png` });
  // подделка: повторный zone_ability в обход клиента — сервер отвечает «ещё перезарядка», панель остаётся на серверной перезарядке
  await G(() => window.__game.debug.rawSend?.({ type: 'zone_ability', id: 'backstab' }));
  await p.waitForTimeout(500);
  const s2 = await slots();
  ok(s2[0].oncd && Number(s2[0].cd) <= Number(s1[0].cd), 'forged re-cast rejected by server, cooldown keeps counting (' + s2[0].cd + ')');
  // клик по слоту = тот же навык (на перезарядке ничего не ломает)
  await qEl.click(); await p.waitForTimeout(200);
  ok((await slots())[0].oncd, 'click on slot during cooldown keeps cooldown');
  // рывок
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok((await slots()).find((x) => x.kind === 'dash').oncd, 'dash slot shows cooldown after Space');
  // забег
  await G(() => window.__game.startRun('crypt'));
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 });
  await p.waitForTimeout(2500);
  const r = await slots();
  ok(r.some((x) => x.kind === 'ab' && x.id === 'backstab') && r.some((x) => x.kind === 'dash'), 'run: loadout skill + dash on the bar — ' + r.map((x) => x.id).join(','));
  const rs = await G(() => [...document.querySelectorAll('.mc-abar-run .mc-rs')].map((e) => e.textContent.trim()));
  ok(rs.length >= 1 && rs.every((t) => /\d/.test(t)), 'run: weapons/passives row with levels — ' + rs.join(' '));
  ok(await G(() => getComputedStyle(document.querySelector('.mc3d-abilities')).display === 'none'), 'old bottom-right Q button replaced');
  await G(() => { const run = window.__game.run; if (run?.me?.abilities?.[0]) run.me.abilities[0].cdLeft = 0; });
  await p.keyboard.press('KeyQ'); await p.waitForTimeout(400);
  ok((await slots()).find((x) => x.id === 'backstab').oncd, 'run: Q puts skill on cooldown with sweep');
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `${OUT}/desktop-actionbar-run.png` });
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
