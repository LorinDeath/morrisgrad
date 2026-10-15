// Раунд 3: лагеря на мини-карте (агро/активность), отслеживание мобов квеста (кольцо + компас), сдача другому NPC, DPS-метр, ОЗ карточки
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const adm = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('admin_result')) adm.push(s.slice(0, 300)); }));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500); await p.evaluate(() => window.__game.meta.setMobTrack(null)); await p.waitForTimeout(1200); // охота из Бестиария от прошлых тестов (общий аккаунт) перебивает компас
  await p.addStyleTag({ content: '.game-hud-panel{display:block!important;visibility:visible!important}' });
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2500);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800);
  }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  const tp = async (x, y, w = 3500) => { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await p.waitForTimeout(w); };
  await tp(24160, 23950, 3500);
  const t0 = await G(() => window.__game.debug.track());
  ok(t0.camps > 0, `сервер прислал лагеря рядом: ${t0.camps}`);
  const camps = await G(() => window.__game.debug.track && window.__game.debug.zoneCamps ? 0 : 0);
  const cp = await G(() => (window.__game.debug.track(), window.__lastCamps = null));
  const list = await p.evaluate(() => { const g = window.__game; return g.debug.campsRaw ? g.debug.campsRaw() : null; });
  // квест: убить тип мобов ближайшего лагеря, сдать — Лейру (выдаёт Альзи)
  const near = await G(() => { const me = window.__game.debug.projList().me; return (window.__game.debug.campsRaw() || []).filter((c) => c[3] > 0).sort((a, b) => Math.hypot(a[1] - me.x, a[2] - me.y) - Math.hypot(b[1] - me.x, b[2] - me.y))[0]; });
  ok(!!near, 'ближайший живой лагерь: ' + JSON.stringify(near).slice(0, 120));
  const mob = near[7][0], qid = 'c_r3_track_' + (Date.now() % 1e5);
  await G((q) => window.__game.debug.rawSend({ type: 'admin_quest_save', quest: q }), { id: qid, npc: 'alzi', turnin: 'leyr', title: 'Тест: охота (раунд 3)', objectives: [{ type: 'kill', mob, count: 3, text: 'Убить 3 целей' }], rewards: { xp: 10 }, offer: ['Охота.'], progress: '…', done: ['Спасибо.'], track: true });
  await p.waitForTimeout(1500); ok(adm.some((s) => s.includes('"ok":true')), 'админка сохранила квест с отслеживанием: ' + (adm[adm.length - 1] || '').slice(0, 120));
  await G((id) => window.__game.debug.rawSend({ type: 'quest_accept', id }), qid); await p.waitForTimeout(1500);
  await G((id) => window.__game.debug.forceQuest(id), qid); await p.waitForTimeout(800);
  const t1 = await G(() => window.__game.debug.track());
  ok(t1.types.includes(mob), `отслеживаются: ${t1.types}`);
  ok(t1.target && t1.target.mob && Math.hypot(t1.target.x - near[1], t1.target.y - near[2]) < 2500, `компас ведёт к цели: ${JSON.stringify(t1.target)}`);
  const trk = await p.$eval('.mc-tracker, [class*="tracker"]', (e) => e.innerText).catch(() => '');
  ok(/Сдать: \S+ \(не /.test(trk), 'подсказка: сдать другому NPC — ' + trk.replace(/\s+/g, ' ').slice(0, 120));
  await p.screenshot({ path: `${OUT}/r3-track-compass.png` });
  await tp(near[1] + 150, near[2] + 150, 4000);
  const t2 = await G(() => window.__game.debug.track());
  await p.screenshot({ path: `${OUT}/r3-track-camp.png` });
  // мини-карта крупно: сам холст (в стенде панель HUD скрыта — показываем только слот мини-карты поверх игры)
  await p.addStyleTag({ content: '#ghud-minimap-slot{position:fixed!important;right:10px;top:10px;z-index:99999;width:300px;height:300px;display:block!important}#ghud-minimap-slot canvas{width:300px!important;height:300px!important}' });
  await p.waitForTimeout(1500);
  const t3 = await G(() => window.__game.debug.track());
  console.log("MM", JSON.stringify(t3.mm)); ok((t3.mm?.track || 0) > 0 && (t3.mm?.camps || 0) > 0, `мини-карта: лагерей ${t3.mm?.camps}, целей подсвечено ${t3.mm?.track}, canvas ${await p.$eval('#ghud-minimap-slot canvas', (c) => c.width + 'x' + c.height).catch(() => '?')}`);
  const mm = await p.$('#ghud-minimap-slot'); if (mm) await mm.screenshot({ path: `${OUT}/r3-minimap-camps.png` });
  // DPS-метр: бьём ближайших
  { const me = await G(() => window.__game.state().player); await G(([x, y]) => window.__game.debug.rawSend({ type: 'dev_spawn_mob', mob: 'violet_pixie', x: x + 120, y }), [me.x, me.y]); await p.waitForTimeout(1500); } // гарантированная цель рядом
  const ms = await G(() => window.__game.debug.mobsNear(500));
  if (ms.length) { await G((id) => window.__game.debug.selectMobId(id), ms[0].id); await p.mouse.move(720, 430); await p.mouse.down(); await p.waitForTimeout(4500); await p.mouse.up(); }
  const d = await G(() => window.__game.debug.dps());
  ok(d.fight > 0 && d.dps >= 0, `DPS-метр: ${JSON.stringify(d)}`);
  const hpTxt = await p.$eval('#ghud-my-hp-val', (e) => e.textContent).catch(() => '');
  ok(/ОЗ$/.test(hpTxt.trim()) && !/брон/.test(hpTxt), 'карточка: ' + hpTxt);
  await p.screenshot({ path: `${OUT}/r3-dps-hud.png` });
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
