// Личный портал домой: открыть в Аринаре (кнопка 🌀 / H) → хаб; возвратный портал в хабе (клик мышью) → обратно на ту же точку;
// перезарядка, «один активный», «не в бою», только Аринар — проверяет сервер; запись в D1 heroes.home_portal. Скриншоты portal-*.png
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
const d1 = (sql) => execSync(`cd server && npx wrangler d1 execute morrisgrad_db --local --json --command "${sql}"`).toString();
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const errs = [];
  const open = async (n) => {
    const uid = `test_portal_${n}_${Date.now()}`;
    const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ' ' + String(e).slice(0, 200)));
    const perr = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('home_portal_err')) perr.push(JSON.parse(s).message); }));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(1500);
    const G = (fn, a) => p.evaluate(fn, a);
    await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
      await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
      await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
    }
    return [p, G, perr, uid];
  };
  const [P, G, perr, uid] = await open('Walker');
  const S = { x: 25400, y: 27900 };
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y }); window.__game.debug.teleport(x, y); }, [S.x, S.y]); await P.waitForTimeout(1500);
  ok(await P.isVisible('.mc-homebtn'), 'в Аринаре видна кнопка 🌀 «Портал домой»');
  await P.click('.mc-homebtn'); await P.waitForTimeout(2500);
  let st = await G(() => ({ w: window.__game.state().world, p: window.__game.state().player }));
  ok(st.w === 'hellfire' && Math.hypot(st.p.x - 770, st.p.y - 510) < 40, `клик по 🌀 → хаб (${st.w}, ${Math.round(st.p.x)},${Math.round(st.p.y)})`);
  const ps = await G(() => window.__game.debug.portals().filter((x) => x.personal).map((x) => x.id));
  ok(ps.includes('home_return') && ps.includes('home_field'), 'личные порталы: возвратный в хабе + точка в Аринаре ' + ps.join(','));
  await P.screenshot({ path: `${OUT}/portal-hub.png` });
  // D1: точка сохранена у героя
  let row = ''; for (let i = 0; i < 20 && !/25400/.test(row); i++) { await P.waitForTimeout(1500); row = d1(`SELECT h.home_portal FROM heroes h JOIN accounts a ON a.pkey = h.pkey WHERE h.hero = 'mage' AND h.home_portal IS NOT NULL ORDER BY h.updated_at DESC LIMIT 1`); }
  ok(/25400/.test(row) && /27900/.test(row), 'D1 heroes.home_portal хранит точку ' + (row.match(/home_portal[^}]*\}/) || [''])[0].slice(0, 90));
  // в хабе открыть второй — нельзя (только Аринар); H — тот же путь
  await P.keyboard.press('h'); await P.waitForTimeout(600);
  ok(!(await G(() => window.__game.state().world !== 'hellfire')), 'в хабе H не открывает портал');
  // вернуться: подойти к возвратному порталу и кликнуть мышью
  await G(() => window.__game.debug.teleport(700, 470)); await P.waitForTimeout(800);
  const sc = await G(() => window.__game.debug.screenOf(720, 470));
  await P.mouse.click(sc.x, sc.y); await P.waitForTimeout(2500);
  st = await G(() => ({ w: window.__game.state().world, p: window.__game.state().player }));
  ok(st.w === 'arinar' && Math.hypot(st.p.x - S.x, st.p.y - S.y) < 30, `клик по возвратному порталу → та же точка в Аринаре (${Math.round(st.p.x)},${Math.round(st.p.y)})`);
  await P.screenshot({ path: `${OUT}/portal-back.png` });
  ok(!(await G(() => window.__game.debug.portals().some((x) => x.personal))), 'портал одноразовый: после возврата закрыт');
  // перезарядка
  await P.keyboard.press('h'); await P.waitForTimeout(800);
  ok(perr.some((m) => /перезаряжается/.test(m)) && (await G(() => window.__game.state().world)) === 'arinar', 'сразу снова — «перезаряжается» (сервер): ' + perr.at(-1));
  // в бою — нельзя (второй игрок бьёт моба)
  const [Q, GQ, qerr] = await open('Fighter');
  await GQ(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [24746, 27120]); await Q.waitForTimeout(1500);
  for (let k = 0; k < 6; k++) {
    const t = await GQ(() => { const s = window.__game.state(); let best = null, bd = 1e9; for (const m of window.__game.debug.zoneMobs()) { const d = Math.hypot(m.x - s.player.x, m.y - s.player.y); if (d < bd) { bd = d; best = m; } } return best; });
    if (t) { await GQ(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x: x - 40, y, god: true }); window.__game.debug.teleport(x - 40, y); }, [t.x, t.y]); await Q.waitForTimeout(250); }
    for (let i = 0; i < 4; i++) { await GQ(() => window.__game.debug.rawSend({ type: 'zone_attack', dx: 1, dy: 0 })); await Q.waitForTimeout(350); }
  }
  await GQ(() => window.__game.debug.rawSend({ type: 'home_portal' })); await Q.waitForTimeout(800);
  ok(qerr.some((m) => /в бою/.test(m)) && (await GQ(() => window.__game.state().world)) === 'arinar', 'в бою портал не открывается (сервер): ' + qerr.at(-1));
  // подделка: «назад» без портала и издалека
  await GQ(() => window.__game.debug.rawSend({ type: 'home_portal_back' })); await Q.waitForTimeout(600);
  ok(qerr.length >= 2 && (await GQ(() => window.__game.state().world)) === 'arinar', 'home_portal_back без портала / не из хаба — отказ: ' + qerr.at(-1));
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
