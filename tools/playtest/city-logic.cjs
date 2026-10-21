// LOCAL: логика города Альказак — двери/интерьеры (вход и выход), PK-кнопка и красные имена, купол не пускает убийц,
// PvP-убийство и счёт убийств (C и просмотр игрока), возврат позиции при переподключении (в доме), роза города.
// Только 127.0.0.1 (guardLocal). Сервер: wrangler dev --local (MC_DEV_TRUST_USERID=1), клиент: vite 5297.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/logic';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CX = 24624, CY = 3376; let R = 1280, INN, ELDER; // радиус и двери — с сервера (dev_city.city): раскладка растягивается по rTiles
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
    p.G = (f, a) => p.evaluate(f, a); p.ctx = ctx; p.uid = uid;
    return p;
  };
  const toArinar = async (p) => {
    if ((await p.G(() => window.__game.state().player?.stats?.classId)) == null) { await p.G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
    for (let i = 0; i < 8 && (await p.G(() => window.__game.state().world)) !== 'arinar'; i++) { await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await p.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  };
  const pos = (p) => p.G(() => { const s = window.__game.state(); return { x: Math.round(s.player.x), y: Math.round(s.player.y), w: s.world }; });
  const spos = async (p) => { const d = await dev(p, {}); return d ? { x: d.me.x, y: d.me.y, w: d.me.w } : await pos(p); }; // позиция на сервере (авторитет)
  const city = (p) => p.G(() => window.__game.debug.city());
  const dev = async (p, o) => { await p.G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 5000 }).catch(() => {}); return p.G(() => window.__devCity); };
  const walk = async (p, key, ms) => { await p.mouse.move(640, 380); await p.keyboard.down(key); await sleep(ms); await p.keyboard.up(key); await sleep(400); };
  const tp = async (p, x, y) => { await p.G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1500); };
  const shot = async (p, n, cells = 14) => { await p.G((c) => window.__game.debug.setCells(c), cells); await sleep(1800); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

  const A = await open('city_admin'); await toArinar(A); t('A в Аринаре', (await pos(A)).w === 'arinar');
  const d0 = await dev(A, { pk: false, clearKills: true }); R = d0.city.r;
  const bd = (id) => { const b = d0.city.b.find((x) => x[0] === id); return { door: { x: b[8], y: b[9] }, out: [b[8], b[9] + 40], ox: b[5] }; };
  INN = bd('tavern'); ELDER = bd('house_elder'); console.log('R', R, 'inn', JSON.stringify(INN), 'elder', JSON.stringify(ELDER));
  // ——— 1. дверь трактира: вход ———
  await tp(A, INN.door.x, INN.door.y + 70); await shot(A, '10-door-inn-outside', 12);
  await walk(A, 'w', 1600); await sleep(600);
  let c = await city(A), q = await pos(A);
  t('дверь: вошёл в трактир (сервер перенёс в комнату)', c.room?.id === 'tavern' && q.x < -10000 && q.y < -10000, { c, q });
  await sleep(1500); c = await city(A); t('интерьер построен из interiors_dark.json (пол + пропсы)', c.room?.built && c.room.props > 5, c.room);
  await shot(A, '11-inn-interior', 12);
  // ходьба внутри: стены держат
  await walk(A, 'a', 2500); const qa = await pos(A); t('в комнате: стена держит (не вышел за комнату)', qa.x >= INN.ox + 10 && qa.x <= INN.ox + 12 * 32 - 10 && qa.y > INN.ox && qa.y < INN.ox + 10 * 32 /* таверна 12×10 (interiors_dark.json) */, qa);
  await walk(A, 'd', 900);
  // ——— 2. выход: вниз через порог E ———
  for (let i = 0; i < 12 && (await pos(A)).x < -10000; i++) { const p0 = await pos(A); const tx = INN.ox + 6 * 32; /* выход таверны — колонки 5–6 */ await walk(A, p0.x < tx - 6 ? 'd' : p0.x > tx + 6 ? 'a' : 's', p0.x < tx - 6 || p0.x > tx + 6 ? Math.min(1200, Math.abs(p0.x - tx) * 5.5) : 450); }
  q = await pos(A); c = await city(A);
  t('выход: снова на улице у двери трактира', q.x > 20000 && Math.hypot(q.x - INN.out[0], q.y - INN.out[1]) < 80 && !c.room, { q, c });
  await shot(A, '12-inn-exit-outside', 12);
  await sleep(800); q = await pos(A); t('после выхода не затягивает обратно', q.x > 20000, q);
  // ——— 3. другой дом (староста) ———
  await tp(A, ELDER.door.x, ELDER.door.y + 70); await walk(A, 'w', 1600); await sleep(1500); c = await city(A);
  t('дом старосты: вход', c.room?.id === 'house_elder', c); await shot(A, '13-elder-interior', 12);
  // ——— 4. переподключение в доме: вернуло в комнату ———
  await dev(A, { posNow: true }); await A.reload(); await A.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(4000);
  q = await pos(A); c = await city(A);
  t('переподключение в доме: снова в комнате старосты', q.w === 'arinar' && c.room?.id === 'house_elder' && q.x < -10000, { q, c });
  await shot(A, '14-reconnect-in-house', 12);
  // выйти
  for (let i = 0; i < 6 && (await pos(A)).x < -10000; i++) { const p0 = await pos(A); const tx = ELDER.ox + 5 * 32; /* house_living 9×8: выход EE в колонках 4–5 */ await walk(A, p0.x < tx - 6 ? 'd' : p0.x > tx + 6 ? 'a' : 's', p0.x < tx - 6 || p0.x > tx + 6 ? Math.min(1200, Math.abs(p0.x - tx) * 5.5) : 1400); }
  t('из дома старосты вышел', (await pos(A)).x > 20000, await pos(A));

  // ——— 5. PK-кнопка: отсчёт 7 с, красное имя ———
  await tp(A, CX + R + 200, CY); // снаружи купола
  let h = (await city(A)).hud; t('PK-кнопка видна в Аринаре', h.shown && /PK/.test(h.label), h);
  await A.click('.ch-pk'); await sleep(1200); h = (await city(A)).hud; t('PK: идёт отсчёт включения', h.to === true && /PK через/.test(h.label), h);
  await shot(A, '20-pk-countdown', 12);
  await sleep(7000); h = (await city(A)).hud; t('PK включён через 7 с', h.pk === true, h);
  const lab = (await city(A)).labels; t('PK: имя красное с ⚔', lab.some((l) => /city_admin/.test(l.text) && /239, 68, 68|ef4444/i.test(l.color)), lab);
  await shot(A, '21-pk-on-red-name', 12);
  // ——— 6. убийца у купола: не пускает, плашка с причиной ———
  await tp(A, CX + R + 60, CY); await walk(A, 'a', 2200); await sleep(500); q = await spos(A); h = (await city(A)).hud;
  t('PK не пускает в купол: остался снаружи', Math.hypot(q.x - CX, q.y - CY) > R, q);
  t('плашка «купол не пускает»', /PK/.test(h.deny || ''), h); await sleep(200); await shot(A, '22-pk-denied-dome', 14);

  // ——— 7. PvP-убийство: B снаружи, A в PK ———
  const B = await open('city_b'); await toArinar(B); await dev(B, { pk: false, clearKills: true });
  const vx = CX + R + 360, vy = CY + 200; await tp(B, vx, vy); await B.G(() => window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true, hp: 6 } })); await sleep(600);
  await tp(A, vx - 50, vy); await A.G(() => window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true } })); await sleep(900);
  const lB = (await city(B)).labels; t('B видит A красным', lB.some((l) => /city_admin/.test(l.text)), lB);
  await shot(B, '23-victim-sees-red-pk', 12);
  const pk0 = (await dev(A, {}))?.kst?.pk || 0; let killed = false; // пожизненный счёт копится между прогонами — сравниваем с началом
  for (let i = 0; i < 30 && !killed; i++) { await A.G(([x, y]) => window.__game.debug.rawSend({ type: 'zone_attack', dx: 1, dy: 0, ox: x - 50, oy: y, tx: x, ty: y, cid: Date.now() % 1e6 }), [vx, vy]); await sleep(700); const d = await dev(A, {}); killed = (d?.kst?.pk || 0) > pk0; }
  { const dB0 = await dev(B, {}); console.log('pvp diag', JSON.stringify({ A: (await dev(A, {})).me, B: dB0.me, hpB: dB0.hp, pkA: (await dev(A, {})).pk, pk0 })); }
  const dA = await dev(A, {}); t('PvP: A убил B (пожизненно +1)', killed && dA.kst.pk >= pk0 + 1, dA?.kst);
  t('PvP: A теперь убийца по журналу', dA.killer?.killer && dA.p >= 1, dA?.killer);
  await shot(A, '24-pvp-kill', 12);
  // ——— 8. счёт убийств: C (свой) и просмотр игрока ———
  await A.keyboard.press('c'); await sleep(2500); await A.screenshot({ path: `${OUT}/25-c-window-kills.png` }); console.log('shot 25-c-window-kills');
  const kTxt = await A.G(() => document.querySelector('.mc-insp-kills')?.textContent || ''); t('C: «Счёт убийств» с игроками/мобами', /Игроков убито/.test(kTxt) && /Чудовищ/.test(kTxt), kTxt);
  await A.keyboard.press('c'); await sleep(500);
  await B.waitForTimeout(6000); const dB = await dev(B, {}); t('B: смерть от игрока засчитана', (dB?.kst?.pd || 0) >= 1, dB?.kst);
  // ——— 9. выключить PK: 30 с; убийца по журналу — купол всё равно не пускает (10 мин) ———
  await A.click('.ch-pk'); await sleep(1000); h = (await city(A)).hud; t('PK: отсчёт выключения 30 с', h.to === false && /Выход/.test(h.label), h);
  await shot(A, '26-pk-exit-countdown', 12);
  await dev(A, { pk: false }); await tp(A, CX + R + 60, CY); await walk(A, 'a', 2200); await sleep(500); q = await spos(A); h = (await city(A)).hud;
  t('убийца игрока (без PK) — купол не пускает', Math.hypot(q.x - CX, q.y - CY) > R && /убили игрока/.test(h.deny || ''), { q, h });
  await shot(A, '27-killer-denied', 14);
  // ——— 10. мобы: 5 за 10 мин ———
  await dev(A, { clearKills: true }); await dev(A, { mobKills: 5 }); await tp(A, CX + R + 60, CY); await walk(A, 'a', 2200); await sleep(500); q = await spos(A); h = (await city(A)).hud;
  t('5 мобов за 10 мин — купол не пускает', Math.hypot(q.x - CX, q.y - CY) > R && /мобов/.test(h.deny || ''), { q, h });
  await dev(A, { clearKills: true }); await walk(A, 'a', 2200); q = await spos(A); t('без убийств — пускает', Math.hypot(q.x - CX, q.y - CY) < R, q);
  // ——— 11. убийца внутри дома — выставляет наружу за купол ———
  await tp(A, INN.door.x, INN.door.y + 70); await walk(A, 'w', 1600); await sleep(900); t('снова в трактире', (await city(A)).room?.id === 'tavern');
  await dev(A, { mobKills: 5 }); await sleep(1500); q = await pos(A); c = await city(A);
  t('стал убийцей в доме — выставлен за купол', q.x > 20000 && Math.hypot(q.x - CX, q.y - CY) > R && !c.room, { q, c });
  await shot(A, '28-killer-kicked-from-house', 14);
  await dev(A, { clearKills: true });
  // ——— 12. роза города: раскрыта, без проклятой земли; соседняя роза под куполом тоже без земли ———
  await tp(A, 24630, 3330); await sleep(2500); await shot(A, '30-city-rose-bloomed', 12);
  const rs = await A.G(() => window.__game.debug.bm?.()?.roses || null).catch(() => null);
  console.log('roses', JSON.stringify(rs)?.slice(0, 600));
  if (rs) { const cr = rs.find((r) => String(r.id) === '1792366351175927'); t('роза города: стадия 6, земли нет (nc)', cr && cr.stage === 6 && cr.nc && !cr.curseR, cr);
    const inR = rs.find((r) => String(r.id) === '900000000000002'); t('другая роза под куполом — раскрыта по возрасту, земля не рисуется (сервер: не проклинает)', inR && inR.stage === 6, inR); }
  await tp(A, 26150, 3376); await sleep(2500); await shot(A, '31-rose-outside-normal-curse', 16);
  await tp(A, 24900, 3480); await sleep(2500); await shot(A, '32-rose-inside-dome-no-curse', 14);
  console.log('errors A', A.errs.slice(0, 5), 'B', B.errs.slice(0, 5));
  console.log(`\n${ok} ok, ${bad} fail`);
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
