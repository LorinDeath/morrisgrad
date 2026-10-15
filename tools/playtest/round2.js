// Раунд 2 (14.10): вылет снарядов в движении + прицел, автоатака по выбранной цели, бродячие мобы, мировые боссы на картах,
// админка «⏱ Спавн», составные навыки (Коварный удар — вихрь кинжалов). Скриншоты → /workspace/morrisgrad-round2/r2-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const sent = [], got = [];
  p.on('websocket', (ws) => { ws.on('framesent', (f) => { const s = String(f.payload); if (s.includes('zone_attack') || s.includes('zone_ability')) sent.push(JSON.parse(s)); });
    ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"proj"')) try { const d = JSON.parse(s); for (const e of d.ev || []) if (e.k === 'proj') got.push(e); } catch (_) {} }); });
  await p.goto(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (fn, a) => p.evaluate(fn, a);
  const cls = process.env.CLS || 'mage';
  await G((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(2500);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800);
  }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  const tp = async (x, y, w = 3500) => { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await p.waitForTimeout(w); };
  const stats = async () => { await G(() => { window.__devStats = null; window.__game.debug.rawSend({ type: 'dev_grant', devStats: 1 }); }); await p.waitForFunction(() => window.__devStats, null, { timeout: 8000 }); return G(() => window.__devStats); };
  await G(() => window.__game.debug.setCells(20)); await p.waitForTimeout(600);

  // ---------- 1. снаряды в движении: вылет из центра героя, прямо в курсор ----------
  await tp(24746, 26870 + 260);
  sent.length = 0; got.length = 0;
  await p.mouse.move(1100, 250); // курсор вверх-вправо
  await p.keyboard.down('d');
  await p.waitForTimeout(500);
  await p.mouse.down(); // зажатая ЛКМ — удар к курсору
  let shot = false, offs = [];
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(90);
    const L = await G(() => window.__game.debug.projList());
    for (const q of L.list) if (q.age < 0.15) offs.push(Math.max(0, Math.hypot(q.x0 - L.me.x, q.y0 - L.me.y) - 260 * q.age)); // герой ушёл вперёд за age (скорость ≤ 260)
    if (!shot && L.list.some((q) => q.age > 0.08 && q.age < 0.25)) { shot = true; await p.screenshot({ path: `${OUT}/r2-shot-moving.png` }); }
  }
  await p.mouse.up(); await p.keyboard.up('d'); await p.waitForTimeout(800);
  const atk = sent.filter((m) => m.type === 'zone_attack');
  ok(atk.length >= 2 && atk.every((m) => Number.isFinite(m.ox) && Number.isFinite(m.tx)), `выстрел шлёт точку героя и курсора (${atk.length}): ${JSON.stringify(atk[0])}`);
  const pairs = atk.map((m) => [m, got.find((e) => e.cid === m.cid)]).filter((x) => x[1]);
  const dO = pairs.map(([m, e]) => Math.hypot(e.x - m.ox, e.y - m.oy));
  ok(pairs.length >= 2 && Math.max(...dO) <= 1, `сервер выпускает снаряд из той же точки, что клиент (расхождение ≤ ${Math.max(...dO, 0).toFixed(1)} px, ${pairs.length} выстрелов)`);
  // залп из нескольких снарядов (кинжалы ×2, разброс) веером вокруг курсора: сравниваем СРЕДНЕЕ направление залпа
  const mean = (cid) => { const es = got.filter((e) => e.cid === cid); const sx = es.reduce((a, e) => a + e.dx, 0), sy = es.reduce((a, e) => a + e.dy, 0), L = Math.hypot(sx, sy) || 1; return { dx: sx / L, dy: sy / L }; };
  const dA = pairs.map(([m, e0]) => { const e = mean(m.cid); const L = Math.hypot(m.tx - m.ox, m.ty - m.oy); return Math.abs(Math.acos(Math.max(-1, Math.min(1, ((m.tx - m.ox) * e.dx + (m.ty - m.oy) * e.dy) / L))) * 180 / Math.PI); });
  ok(dA.length && Math.max(...dA) < 1.5, `снаряд летит точно в курсор (отклонение ≤ ${Math.max(...dA, 0).toFixed(2)}°)`);
  ok(offs.length && Math.max(...offs) < 12, `свой снаряд появляется у центра героя в движении (смещение ≤ ${Math.max(...offs, 0).toFixed(1)} px)`);
  ok((await G(() => window.__game.debug.projList())).confirmed >= 2, 'прогноз подтверждён сервером по cid (без двойных снарядов)');
  { const before = got.length; await G(() => window.__game.debug.rawSend({ type: 'zone_attack', dx: 1, dy: 0, ox: window.__game.debug.projList().me.x + 400, oy: window.__game.debug.projList().me.y, cid: 999999 })); await p.waitForTimeout(700);
    const e = got.slice(before).find((x) => x.cid === 999999), me = (await G(() => window.__game.debug.projList())).me;
    ok(!e || Math.hypot(e.x - me.x, e.y - me.y) < 120, `подделка точки вылета (+400 px) не принята сервером (${e ? Math.round(Math.hypot(e.x - me.x, e.y - me.y)) + ' px' : 'нет снаряда'})`); }

  // ---------- 2. автоатака по выбранной цели ----------
  let mobs = await G(() => window.__game.debug.mobsNear(420));
  if (!mobs.length) { await tp(24746, 26870, 3000); mobs = await G(() => window.__game.debug.mobsNear(520)); }
  if (mobs.length) {
    const m = mobs[0]; await G((id) => window.__game.debug.selectMobId(id), m.id);
    await p.mouse.move(200, 780); // курсор в другую сторону
    sent.length = 0; got.length = 0;
    await p.keyboard.press('v'); await p.waitForTimeout(1600);
    await p.screenshot({ path: `${OUT}/r2-autoattack-target.png` });
    await p.keyboard.press('v'); await p.waitForTimeout(300);
    const a2 = sent.filter((x) => x.type === 'zone_attack');
    ok(a2.length && a2.every((x) => x.mob === m.id), `автоатака с выбранной целью шлёт mob=${m.id} (${a2.length} ударов)`);
    const mp = (await G(() => window.__game.debug.mobsNear(900))).find((x) => x.id === m.id) || m;
    const dirs = got.filter((e) => a2.some((x) => x.cid === e.cid));
    ok(dirs.length && dirs.every((e) => { const dx = mp.x - e.x, dy = mp.y - e.y, L = Math.hypot(dx, dy) || 1; return (dx * e.dx + dy * e.dy) / L > 0.9; }), `снаряды летят в цель, а не в курсор (${dirs.length})`);
  } else ok(false, 'нет моба рядом для теста цели');

  // ---------- 3. админка «⏱ Спавн» + бродячие мобы ----------
  await G(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'spawn', id: 'arinar', patch: { ambientChance: 100, ambientEvery: 3 } })); await p.waitForTimeout(800);
  // пустошь (замер: между лагерями) — ищем точку без мобов вокруг
  let empty = null;
  for (const [x, y] of [[30500, 20500], [17000, 31000], [33000, 33000], [12000, 15000], [36000, 12000], [20500, 38000], [9000, 26000]]) { await tp(x, y, 2500); const n = await G(() => window.__game.debug.mobsNear(450)); if (!n.length) { empty = [x, y]; break; } }
  ok(!!empty, 'нашлась пустошь ' + JSON.stringify(empty));
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', ambientNow: 1 })); await p.waitForTimeout(1500);
  let st = await stats(); let shotA = false;
  for (let i = 0; i < 10 && !shotA; i++) { await p.waitForTimeout(500); st = await stats(); const near = st.ambient.filter((a) => a.tgt); if (near.length) { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/r2-ambient.png` }); shotA = true; } }
  ok(st.ambient.length && st.ambient.every((a) => a.tgt), `бродячий моб появился у края экрана и идёт на игрока: ${JSON.stringify(st.ambient.slice(0, 3))}`);
  await G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'spawn', id: 'arinar' })); await p.waitForTimeout(600);
  await G(() => window.__game.debug.openAdmin()); await p.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  await p.click('.mc-admin [data-tab="spawn"]'); await p.waitForTimeout(400);
  await p.click('.mc-admin aside li[data-id="spawn:arinar"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/r2-admin-spawn.png` });
  const bossLi = await p.$('.mc-admin aside li[data-id^="boss:"]'); if (bossLi) { await bossLi.click(); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/r2-admin-boss.png` }); }
  ok(!!bossLi && (await p.$$('.mc-admin aside li[data-id^="boss:"]')).length >= 10, 'вкладка «⏱ Спавн»: лагеря/бродячие + таймеры боссов');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---------- 4. мировые боссы на карте и мини-карте ----------
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', spawnBosses: 1 })); await p.waitForTimeout(2500);
  st = await stats();
  const live = st.bosses.filter((x) => x[1]); ok(live.length >= 2, `боссы появились: ${live.length}/${st.bosses.length}`);
  const [k1, , , , x1, y1] = live[0], [k2, , , , x2, y2] = live[1];
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', killBoss: '__none' }));
  await G((k) => window.__game.debug.rawSend({ type: 'dev_grant', killBoss: k }), k2); await p.waitForTimeout(800);
  // разведать оба логова (туман) — пройти рядом
  await tp(x2 + 600, y2, 2500); await tp(x1 + 120, y1 + 60, 4000);
  await G(() => { const c = document.querySelector('.hud-minimap-card'); if (c) { document.body.appendChild(c); Object.assign(c.style, { position: 'fixed', right: '12px', top: '12px', zIndex: 99, display: 'block', width: '300px' }); } }); // в стенде боковые панели скрыты
  await G(() => window.__game.debug.setCells(30)); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/r2-boss-minimap.png` });
  { const el = await p.$('.hud-minimap-card'); if (el) await el.screenshot({ path: `${OUT}/r2-boss-minimap-zoom.png` }); }
  const bs = await G(() => window.__game.debug.bossState());
  ok(bs.some(([id, s]) => id === 'boss:' + k1 && s.alive) && bs.some(([id, s]) => id === 'boss:' + k2 && !s.alive && s.at > Date.now() + 60000), `клиент знает: ${k1} жив, ${k2} убит + таймер`);
  await p.keyboard.press('m'); await p.waitForTimeout(1200);
  await G(([x, y]) => { const wm = document.querySelector('canvas.wm-cv') ? null : null; }, [x1, y1]);
  await p.screenshot({ path: `${OUT}/r2-boss-worldmap.png` });
  ok((await G(() => window.__game.debug.worldMap())).open, 'карта M открыта');
  await p.keyboard.press('m'); await p.waitForTimeout(300);

  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
