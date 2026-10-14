// Админ-панель: доступ только админу (сервер), редактор сущностей + черты (поджог…), дроп, квесты для NPC, журнал;
// диалог NPC «Все квесты» / «Уйти». Сохранение — в локальную D1. Скриншоты → /workspace/morrisgrad-round2/admin-*.png
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
const d1 = (sql) => execSync(`cd server && npx wrangler d1 execute morrisgrad_db --local --json --command "${sql}"`).toString();
// чистый старт: правки оружия/предметов от прошлых прогонов убрать (версия +1 — сервер перечитает)
d1("DELETE FROM game_overrides WHERE kind IN ('weapon','item'); UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides'");
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
  { // окно внутри игры: в игровом контейнере, рамка, игра рисуется позади, клавиши не уходят в игру, Esc закрывает
    const inf = await G(() => { const el = document.querySelector('.mc-admin'), cv = document.querySelector('canvas'); const r = el.getBoundingClientRect(), c = cv.parentElement.getBoundingClientRect();
      return { inGame: cv.parentElement.contains(el), parentIsBody: el.parentElement === document.body, inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1, border: getComputedStyle(el).borderTopColor }; });
    ok(inf.inGame && !inf.parentIsBody && inf.inside, 'админка — окно внутри игрового контейнера ' + JSON.stringify(inf));
    const p0 = await G(() => window.__game.state().player); await A.click('.mc-admin aside input'); await A.keyboard.type('dddddwwww'); await A.waitForTimeout(400);
    const p1 = await G(() => window.__game.state().player); ok(Math.hypot(p1.x - p0.x, p1.y - p0.y) < 2, `ввод в админке не двигает героя (${Math.round(p0.x)},${Math.round(p0.y)} → ${Math.round(p1.x)},${Math.round(p1.y)})`);
    await A.fill('.mc-admin aside input', '');
    const hd = await A.$('.mc-admin header b'); const hb = await hd.boundingBox(); await A.mouse.move(hb.x + 5, hb.y + 5); await A.mouse.down(); await A.mouse.move(hb.x + 65, hb.y + 45, { steps: 4 }); await A.mouse.up();
    const moved = await G(() => document.querySelector('.mc-admin').style.left); ok(!!moved, 'окно перетаскивается за шапку: left=' + moved);
    await A.screenshot({ path: `${OUT}/admin-ingame.png` });
    await A.keyboard.press('Escape'); await A.waitForTimeout(200); ok(!(await G(() => window.__game.debug.admin())).open, 'Esc закрывает админку');
    await A.click('#ghud-admin-btn'); await A.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  }
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
  await A.click('.mc-admin [data-tab="weapon"]'); await A.waitForTimeout(200); await A.click('.mc-admin aside li[data-id] >> nth=0'); await A.waitForTimeout(250);
  await A.selectOption('.mc-admin .addk', 'burn'); await A.click('.mc-admin [data-addt]');
  await A.fill('.mc-admin [data-tk="chance"]', '40');
  await A.click('.mc-admin [data-save]'); m = await saved(); ok(/Сохранено/.test(m), 'оружие: черта «Поджог» (шанс 40%) сохранена — ' + m);
  await A.screenshot({ path: `${OUT}/admin-weapon-traits.png` });
  // неверное значение — сервер отвергает
  await A.fill('.mc-admin [data-tk="chance"]', '400'); await A.click('.mc-admin [data-save]'); await A.waitForTimeout(700);
  ok(/✖/.test(await A.textContent('.mc-admin .msg')), 'шанс 400% → отказ сервера: ' + (await A.textContent('.mc-admin .msg')));
  // поиск по-русски (регистр, ё/е) + уровень в каждой строке
  const rows = () => A.$$eval('.mc-admin aside li[data-id]', (xs) => xs.filter((x) => !x.dataset.id.startsWith('__')).map((x) => ({ id: x.dataset.id, t: x.textContent, lv: !!x.querySelector('.lv') })));
  await A.click('.mc-admin [data-tab="mob"]'); await A.waitForTimeout(200);
  await A.fill('.mc-admin aside input', 'СЛИЗ'); await A.waitForTimeout(200); let r = await rows();
  ok(r.length >= 1 && r.every((x) => /слиз/i.test(x.t)) && r.every((x) => x.lv), `поиск «СЛИЗ» (рус., регистр): ${r.length} мобов, у всех уровень — ${r.slice(0, 3).map((x) => x.t).join(' / ')}`);
  await A.screenshot({ path: `${OUT}/admin-search-ru.png` });
  await A.fill('.mc-admin aside input', 'ice_dew'); await A.waitForTimeout(150); r = await rows(); ok(r.some((x) => x.id === 'ice_dew_slime'), 'поиск по id');
  // уровень оружия: существующее поле предмета req (треб. уровень надевания; itemReq = max(req, lvl))
  await A.click('.mc-admin [data-tab="weapon"]'); await A.waitForTimeout(200);
  await A.fill('.mc-admin aside input', 'секира'); await A.waitForTimeout(200); r = await rows();
  ok(r.some((x) => x.id === 'item:guard_axe' && /ур\. 6/.test(x.t)), 'оружие: «Секира Стража» найдена по-русски, в строке «ур. 6» ' + JSON.stringify(r.map((x) => x.t)));
  await A.click('.mc-admin aside li[data-id="item:guard_axe"]'); await A.waitForTimeout(250);
  await A.fill('.mc-admin [data-p="req"]', '9'); await A.click('.mc-admin [data-save]'); m = await saved();
  ok(/Сохранено/.test(m) && /"req":9/.test(d1("SELECT data FROM game_overrides WHERE kind='item' AND id='guard_axe'").replace(/\\/g, '')), 'оружие: треб. уровень 9 → D1 ' + m);
  r = await rows(); ok(r.some((x) => x.id === 'item:guard_axe' && /ур\. 9/.test(x.t)), 'строка списка обновилась: ур. 9');
  await A.fill('.mc-admin [data-p="req"]', '99'); await A.click('.mc-admin [data-save]'); await A.waitForTimeout(700);
  ok(/✖/.test(await A.textContent('.mc-admin .msg')), 'треб. уровень 99 → отказ сервера: ' + (await A.textContent('.mc-admin .msg')));
  await A.screenshot({ path: `${OUT}/admin-weapon-level.png` });
  await G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'item', id: 'guard_axe' })); await A.waitForTimeout(400);
  for (const [tab, shot] of [['item', 'admin-items'], ['skill', 'admin-skills'], ['loot', 'admin-loot-list']]) {
    await A.click(`.mc-admin [data-tab="${tab}"]`); await A.waitForTimeout(250); r = await rows();
    const lv = r.filter((x) => x.lv).length; ok(r.length > 3 && lv >= r.length * (tab === 'loot' ? 0.5 : 1), `${tab}: уровень в строках ${lv}/${r.length}`);
    await A.click('.mc-admin aside li[data-id] >> nth=1'); await A.waitForTimeout(250); await A.screenshot({ path: `${OUT}/${shot}.png` });
  }
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
  await A.fill('.mc-admin [data-star="yellow"]', '1');
  await A.click('.mc-admin [data-qsave]'); m = await saved(); ok(/Сохранено/.test(m), 'квест c_pt_slimes (1 ★) для Алзи сохранён — ' + m);
  await A.screenshot({ path: `${OUT}/admin-quest.png` });
  // продолжение: открывается после c_pt_slimes, 2 ★
  await A.click('.mc-admin aside li[data-id="__new"]'); await A.waitForTimeout(250);
  await A.fill('.mc-admin [data-q="id"]', 'c_pt_slimes2'); await A.fill('.mc-admin [data-q="title"]', 'Корни шпиля'); await A.selectOption('.mc-admin [data-q="npc"]', 'alzi');
  await A.selectOption('.mc-admin [data-q="requires"]', ['c_pt_slimes']); await A.fill('.mc-admin [data-star="yellow"]', '2');
  await A.fill('.mc-admin [data-otext]', 'Ещё 5 слизней'); await A.fill('.mc-admin [data-q="offer"]', 'Слизь вернулась.'); await A.fill('.mc-admin [data-q="done"]', 'Теперь точно чисто.');
  await A.click('.mc-admin [data-qsave]'); m = await saved(); ok(/Сохранено/.test(m), 'квест c_pt_slimes2 «открывается после c_pt_slimes» — ' + m);
  ok(/c_pt_slimes/.test(d1("SELECT data FROM custom_quests WHERE id='c_pt_slimes2'")), 'D1: предусловие сохранено');
  // цикл отвергается сервером
  await A.click('.mc-admin aside li[data-id="c_pt_slimes"]'); await A.waitForTimeout(250);
  await A.selectOption('.mc-admin [data-q="requires"]', ['c_pt_slimes2']); await A.click('.mc-admin [data-qsave]'); await A.waitForTimeout(700);
  ok(/цикл/.test(await A.textContent('.mc-admin .msg')), 'цикл в цепочке → отказ: ' + (await A.textContent('.mc-admin .msg')));
  // дерево
  await A.click('.mc-admin aside li[data-id="__tree"]'); await A.waitForTimeout(300);
  const nested = await A.$('.mc-admin .qtree details[data-node="c_pt_slimes"] [data-node="c_pt_slimes2"]');
  ok(!!nested, 'дерево: c_pt_slimes2 — ребёнок c_pt_slimes');
  const starTxt = await A.textContent('.mc-admin .qtree [data-go="c_pt_slimes2"]'); ok(/2 ★/.test(starTxt), 'дерево: «2 ★» у звёздного квеста — ' + starTxt);
  const nDet = (await A.$$('.mc-admin .qtree details')).length; ok(nDet >= 3, `дерево: ${nDet} раскрываемых узлов`);
  const lst = await A.textContent('.mc-admin aside li[data-id="c_pt_slimes2"]'); ok(/2 ★/.test(lst), 'список квестов: «2 ★» — ' + lst);
  await A.click('.mc-admin .qtree [data-node="c_pt_slimes"] > summary'); await A.waitForTimeout(150);
  ok(!(await A.$eval('.mc-admin .qtree details[data-node="c_pt_slimes"]', (d) => d.open)), 'узел сворачивается');
  await A.click('.mc-admin .qtree [data-node="c_pt_slimes"] > summary'); await A.waitForTimeout(150);
  await A.$eval('.mc-admin .qtree [data-node="c_pt_slimes"]', (d) => d.scrollIntoView({ block: 'center' }));
  await A.screenshot({ path: `${OUT}/admin-quest-tree.png` });
  await A.click('.mc-admin .qtree [data-go="c_pt_slimes2"] >> nth=0'); await A.waitForTimeout(250);
  ok((await A.inputValue('.mc-admin [data-q="id"]')) === 'c_pt_slimes2', 'клик по узлу открывает квест в редакторе');
  { // сюжетный квест sl_p1 — редактируется (правка в D1 поверх кода), «Вернуть исходное»
    await A.click('.mc-admin aside li[data-id="sl_p1"]'); await A.waitForTimeout(300);
    ok(!!(await A.$('.mc-admin [data-qsave]')) && (await A.inputValue('.mc-admin [data-q="id"]')) === 'sl_p1', 'сюжетный квест открыт в редакторе (не только просмотр)');
    const t0 = await A.inputValue('.mc-admin [data-q="title"]');
    await A.fill('.mc-admin [data-q="title"]', '★★★ Фиолетовая полоса (правка)'); await A.fill('.mc-admin [data-q="xp"]', '777');
    await A.click('.mc-admin [data-qsave]'); m = await saved(); ok(/Сохранено/.test(m), 'сюжетный квест сохранён — ' + m);
    ok(/правка/.test(d1("SELECT data FROM custom_quests WHERE id='sl_p1'")), 'D1: правка sl_p1 записана (id сохранён)');
    ok(/правка/.test(await A.textContent('.mc-admin aside li[data-id="sl_p1"]')), 'список: новое название');
    ok(!!(await A.$('.mc-admin [data-qreset]')), 'кнопка «Вернуть исходное»');
    await A.screenshot({ path: `${OUT}/admin-quest-edit-builtin.png` });
    A.once('dialog', (d) => d.accept()); await A.click('.mc-admin [data-qreset]'); m = await saved();
    ok((await A.textContent('.mc-admin aside li[data-id="sl_p1"]')).includes(t0) && !/sl_p1/.test(d1("SELECT id FROM custom_quests WHERE id='sl_p1'")), 'сброс: исходное название, строки в D1 нет — ' + m);
  }
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
  ok(groups.length >= 1 && (await A.$$('.mc-qall .qa-row')).length >= 1, 'список квестов по группам: ' + groups.join(' | '));
  ok(!(await A.$('.mc-qall .qa-locked')) && !groups.some((g) => /Заблок/.test(g)) && !(await A.$('.mc-qall [data-q="c_pt_slimes2"]')), 'заблокированные скрыты (нет группы, нет c_pt_slimes2)');
  await A.screenshot({ path: `${OUT}/npc-quests-no-locked.png` }); await A.screenshot({ path: `${OUT}/admin-npc-all-quests.png` });
  const av = await A.$('.mc-qall [data-q="c_pt_slimes"]'); ok(!!av, 'квест из панели виден у Алзи');
  ok(av && /1 ★/.test(await av.textContent()), 'звёздный квест в диалоге: «1 ★» — ' + (av ? await av.textContent() : ''));
  await A.screenshot({ path: `${OUT}/quest-stars.png` });
  if (av) { await av.click(); await A.waitForTimeout(300); ok(/1 ★/.test(await A.textContent('.mc-dialog .qt')), 'звёзды в карточке квеста'); await A.screenshot({ path: `${OUT}/admin-npc-quest.png` }); }
  // уборка: вернуть правки и скрыть тестовый квест
  await G(() => { const s = window.__game.debug.rawSend; s({ type: 'admin_reset', kind: 'mob', id: 'ice_dew_slime' }); });
  await A.waitForTimeout(400);
  const wid = await G(() => null);
  ok(!errs.length, 'без ошибок страницы ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
