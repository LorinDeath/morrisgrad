// Добыча на земле: мешок у трупа (настоящее убийство) + тестовый мешок; клик мышью по мешку → окно; клик — взять один,
// Shift + проводка — много, «Забрать всё»; чужой мешок не виден; далеко — сервер отказывает. Скриншоты loot-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const errs = [];
  const open = async (n) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ' ' + String(e).slice(0, 200)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=test_loot_${n}_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(1500);
    const G = (fn, a) => p.evaluate(fn, a);
    await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
      await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
      await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
    }
    return [p, G];
  };
  const [P, G] = await open('Looter');
  const X = 24746, Y = 27120; // у большого лагеря (см. bigcamp.js)
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X, Y]); await P.waitForTimeout(2500);
  // 1. настоящее убийство: добыча НЕ в сумку, а мешком у трупа (бьём, пока не выпадет мешок)
  const inv0 = await G(() => window.__game.debug.meta?.()?.inv?.length ?? null);
  let bag = null;
  for (let k = 0; k < 12 && !bag; k++) { // убийство «по-настоящему» (dev: убить ближайшего; проклятый — шансы дропа ×10), награда обычным путём
    const t = await G(() => { const s = window.__game.state(); let best = null, bd = 1e9; for (const m of window.__game.debug.zoneMobs()) { const d = Math.hypot(m.x - s.player.x, m.y - s.player.y); if (d < bd) { bd = d; best = m; } } return best; });
    if (t) { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x: x - 50, y, god: true }); window.__game.debug.teleport(x - 50, y); }, [t.x, t.y]); await P.waitForTimeout(500); }
    await G(() => window.__game.debug.rawSend({ type: 'dev_grant', killNear: true, cursed: true })); await P.waitForTimeout(900);
    bag = (await G(() => window.__game.debug.bags()))[0] || null;
  }
  ok(!!bag, 'после убийства у трупа лежит мешок ' + JSON.stringify(bag));
  // 2. тестовый мешок с 8 предметами + материалы (дев-команда) — открыть настоящим кликом мыши
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', bag: { items: ['dew_slime_weapon', 'fly_legs', 'dew_slime_weapon', 'fly_legs', 'dew_slime_weapon', 'fly_legs', 'dew_slime_weapon', 'fly_legs'], res: { fly_wing: 3, moonpetal: 2 } } }));
  await P.waitForTimeout(800);
  const bags = await G(() => window.__game.debug.bags()); const big = bags.find((x) => x.n === 10);
  ok(!!big, `тестовый мешок на земле (позиций ${big?.n})`);
  await P.screenshot({ path: `${OUT}/loot-bag.png` });
  const me = await G(() => window.__game.state().player);
  await G(([x, y]) => window.__game.debug.teleport(x - 40, y), [big.x, big.y]); await P.waitForTimeout(600);
  const sc = await G(([x, y]) => window.__game.debug.screenOf(x, y), [big.x, big.y]);
  await P.mouse.click(sc.x, sc.y); await P.waitForTimeout(800);
  ok((await G(() => window.__game.debug.loot())).open, 'клик мышью по мешку открывает окно добычи');
  await P.screenshot({ path: `${OUT}/loot-window.png` });
  // клик по одной клетке — взять один предмет
  const n0 = (await G(() => window.__game.debug.loot())).entries.length;
  await P.click('#mc-loot .cell[data-lid] >> nth=0'); await P.waitForTimeout(900);
  const n1 = (await G(() => window.__game.debug.loot())).entries.length;
  ok(n1 === n0 - 1, `клик — взят один (${n0}→${n1})`);
  // Shift + провести курсором по 4 клеткам
  const cells = await P.$$('#mc-loot .cell[data-lid]'); const bx = [];
  for (const c of cells.slice(0, 4)) bx.push(await c.boundingBox());
  await P.keyboard.down('Shift');
  await P.mouse.move(bx[0].x - 30, bx[0].y + bx[0].height / 2);
  for (const r of bx) await P.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 6 });
  await P.screenshot({ path: `${OUT}/loot-shift-sweep.png` });
  await P.keyboard.up('Shift'); await P.waitForTimeout(1000);
  const n2 = (await G(() => window.__game.debug.loot())).entries.length;
  ok(n2 <= n1 - 4, `Shift-проводка забрала всё, над чем прошёл курсор (${n1}→${n2}, ≥4)`);
  await P.click('#mc-loot .all'); await P.waitForTimeout(1000);
  ok(!(await G(() => window.__game.debug.loot())).open && !(await G(() => window.__game.debug.bags())).some((x) => x.id === big.id), '«Забрать всё» — мешок пуст и исчез');
  // 3. сервер: чужой мешок и издалека — отказ
  const [Q, GQ] = await open('Thief');
  const seen = await GQ(() => window.__game.debug.bags()); ok(!seen.length, 'чужие мешки не видны другому игроку');
  const errsQ = []; Q.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('loot_err')) errsQ.push(s); }));
  if (bag) { await GQ(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [bag.x, bag.y]); await Q.waitForTimeout(1200);
    await GQ((id) => { window.__game.debug.rawSend({ type: 'loot_take', bag: id, all: true }); }, bag.id); await Q.waitForTimeout(800); }
  ok(!bag || (await G(() => window.__game.debug.bags())).some((x) => x.id === bag.id), 'чужой «забрать всё» не трогает мешок владельца');
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X + 2000, Y]); await P.waitForTimeout(1000);
  const fr = []; P.on('websocket', () => {});
  const far = await G((id) => new Promise((res) => { const h = (e) => {}; window.__game.debug.rawSend({ type: 'loot_open', bag: id }); setTimeout(() => res(window.__game.debug.loot().open), 800); }), bag?.id || 0);
  ok(!far, 'издалека мешок не открывается (сервер)');
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
