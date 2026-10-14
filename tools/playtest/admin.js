// Админ-панель: доступ только админу (сервер), редактор сущностей + черты (поджог…), дроп, квесты для NPC, журнал;
// диалог NPC «Все квесты» / «Уйти». Сохранение — в локальную D1. Скриншоты → /workspace/morrisgrad-round2/admin-*.png
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
const d1 = (sql) => execSync(`cd server && npx wrangler d1 execute morrisgrad_db --local --json --command "${sql}"`).toString();
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n, uid) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e).slice(0, 300)));
    const toasts = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"toast_error"') || s.includes('"admin_')) toasts.push(s.slice(0, 160)); }));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    await p.waitForTimeout(2500);
    return [p, (fn, a) => p.evaluate(fn, a), toasts];
  };
  // 1. обычный игрок: нет кнопки, запросы отклоняет сервер
  const [U, GU, tu] = await open('Plain', 'test_admin_plain_' + Date.now());
  ok(!(await GU(() => window.__game.debug.admin())).btn, 'обычный игрок: кнопки 🛠 нет');
  await GU(() => { window.__game.debug.rawSend({ type: 'admin_save', kind: 'mob', id: 'dew_slime', patch: { hp: 1 } }); window.__game.debug.rawSend({ type: 'admin_open' }); window.__game.debug.rawSend({ type: 'admin_save', kind: 'mob', id: 'dew_slime', patch: { hp: 1 }, userId: 'test_admin_pt', role: 'admin' }); });
  await U.waitForTimeout(1500);
  ok(tu.filter((t) => t.includes('Недостаточно прав')).length >= 2 && !tu.some((t) => t.includes('admin_catalog') || t.includes('admin_result')), `сервер отклоняет admin_* (в т.ч. с поддельными userId/role): ${tu.length} ответов`);
  ok(!/dew_slime/.test(d1("SELECT id FROM game_overrides WHERE id='dew_slime'")), 'в D1 правка не появилась');
  await U.context().close();
  // 2. админ
  const [A, G] = await open('Админ', 'test_admin_pt');
  ok((await G(() => window.__game.debug.admin())).btn, 'админ: кнопка 🛠 в HUD');
  await A.click('#ghud-admin-btn'); await A.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  ok(true, 'панель открыта, каталог загружен с сервера');
  const pick = async (tab, id) => { await A.click(`.mc-admin [data-tab="${tab}"]`); await A.waitForTimeout(200); if (id) { await A.fill('.mc-admin aside input', id); await A.click(`.mc-admin aside li[data-id="${id}"]`); await A.waitForTimeout(250); } };
  const saved = async () => { await A.waitForFunction(() => /Сохранено|✖/.test(document.querySelector('.mc-admin .msg')?.textContent || ''), null, { timeout: 8000 }); return A.textContent('.mc-admin .msg'); };
  await pick('mob', 'ice_dew_slime');
  await A.fill('.mc-admin [data-p="hp"]', '777'); await A.click('.mc-admin [data-sk="frost_nova"]');
  await A.click('.mc-admin [data-save]'); let m = await saved();
  ok(/Сохранено/.test(m), 'моб: ОЗ + навык моба сохранены — ' + m);
  ok(/"hp":777/.test(d1("SELECT data FROM game_overrides WHERE kind='mob' AND id='ice_dew_slime'").replace(/\\/g, '')), 'D1 game_overrides: hp 777');
  await A.screenshot({ path: `${OUT}/admin-mob.png` });
  // оружие: черта «Поджог» (RPG Maker MZ-стиль)
  const wt = await G(() => Object.keys(window.__game.debug.admin && {}).length || null);
  await A.click('.mc-admin [data-tab="weapon"]'); await A.waitForTimeout(200); await A.click('.mc-admin aside li >> nth=0'); await A.waitForTimeout(250);
  await A.selectOption('.mc-admin .addk', 'burn'); await A.click('.mc-admin [data-addt]');
  await A.fill('.mc-admin [data-tk="chance"]', '40');
  await A.click('.mc-admin [data-save]'); m = await saved(); ok(/Сохранено/.test(m), 'оружие: черта «Поджог» (шанс 40%) сохранена — ' + m);
  await A.screenshot({ path: `${OUT}/admin-weapon-traits.png` });
  // неверное значение — сервер отвергает
  await A.fill('.mc-admin [data-tk="chance"]', '400'); await A.click('.mc-admin [data-save]'); await A.waitForTimeout(700);
  ok(/✖/.test(await A.textContent('.mc-admin .msg')), 'шанс 400% → отказ сервера: ' + (await A.textContent('.mc-admin .msg')));
  // предмет со значками характеристик
  await A.click('.mc-admin [data-tab="item"]'); await A.waitForTimeout(200); await A.click('.mc-admin aside li >> nth=3'); await A.waitForTimeout(250);
  ok((await A.$$('.mc-admin .mc-sti')).length >= 5, `предмет: значки характеристик в полях (${(await A.$$('.mc-admin .mc-sti')).length})`);
  await A.screenshot({ path: `${OUT}/admin-item.png` });
  await A.click('.mc-admin [data-tab="loot"]'); await A.waitForTimeout(200); await A.click('.mc-admin aside li >> nth=0'); await A.waitForTimeout(250);
  await A.screenshot({ path: `${OUT}/admin-loot.png` });
  // квест для NPC
  await A.click('.mc-admin [data-tab="quest"]'); await A.waitForTimeout(200); await A.click('.mc-admin aside li[data-id="__new"]'); await A.waitForTimeout(250);
  await A.fill('.mc-admin [data-q="id"]', 'c_pt_slimes'); await A.fill('.mc-admin [data-q="title"]', 'Слизь у шпиля');
  await A.selectOption('.mc-admin [data-q="npc"]', 'alzi');
  await A.fill('.mc-admin [data-otext]', 'Развейте 3 слизней'); await A.fill('.mc-admin [data-q="offer"]', 'Слизь липнет к опоре. Поможете?');
  await A.fill('.mc-admin [data-q="done"]', 'Чисто. Спасибо.'); await A.fill('.mc-admin [data-q="lore"]', 'Опоры Мэлвелдила помнят каждого, кто их чистил.');
  await A.click('.mc-admin [data-qsave]'); m = await saved(); ok(/Сохранено/.test(m), 'квест c_pt_slimes для Алзи сохранён — ' + m);
  await A.screenshot({ path: `${OUT}/admin-quest.png` });
  ok(/c_pt_slimes/.test(d1("SELECT id FROM custom_quests WHERE id='c_pt_slimes' AND enabled=1")), 'D1 custom_quests: квест есть');
  await A.click('.mc-admin [data-tab="audit"]'); await A.waitForTimeout(1200);
  ok((await A.$$('.mc-admin table tr')).length >= 4, 'журнал правок: записи есть');
  await A.screenshot({ path: `${OUT}/admin-audit.png` });
  await A.click('.mc-admin [data-x]');
  // 3. диалог NPC «Все квесты»
  await G(() => window.__game.debug.selectClass('mage')); await A.waitForTimeout(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await A.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await A.waitForTimeout(1500); }
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 24160, y: 23940 }); window.__game.debug.teleport(24160, 23940); }); await A.waitForTimeout(1500);
  await G(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'alzi' })); await A.waitForTimeout(1200);
  ok(!!(await A.$('#npc-all-quests')), 'диалог Алзи: кнопка «Все квесты»');
  await A.click('#npc-all-quests'); await A.waitForTimeout(400);
  const groups = await A.$$eval('.mc-qall .qa-grp > b', (x) => x.map((e) => e.textContent));
  ok(groups.length >= 1 && (await A.$$('.mc-qall .qa-row')).length >= 2, 'список квестов по группам: ' + groups.join(' | '));
  await A.screenshot({ path: `${OUT}/admin-npc-all-quests.png` });
  const lockBtn = await A.$('.mc-qall .qa-locked'); if (lockBtn) { await lockBtn.click(); await A.waitForTimeout(300); ok(!(await A.$('#npc-take')) && !!(await A.$('.qa-lock')), 'заблокированный: только просмотр (нет «Взять»)'); await A.screenshot({ path: `${OUT}/admin-npc-locked.png` }); await A.click('text=← Все квесты'); await A.waitForTimeout(300); }
  const av = await A.$('.mc-qall [data-q="c_pt_slimes"]'); ok(!!av, 'квест из панели виден у Алзи');
  if (av) { await av.click(); await A.waitForTimeout(300); await A.screenshot({ path: `${OUT}/admin-npc-quest.png` }); }
  // уборка: вернуть правки и скрыть тестовый квест
  await G(() => { const s = window.__game.debug.rawSend; s({ type: 'admin_reset', kind: 'mob', id: 'ice_dew_slime' }); });
  await A.waitForTimeout(400);
  const wid = await G(() => null);
  ok(!errs.length, 'без ошибок страницы ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
