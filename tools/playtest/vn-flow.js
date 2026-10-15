// Единый поток квеста (локально): админ создаёт квест Петра в блоке «Поток квеста» (3 окна пояснения → окно получения с целями
// и наградой → «В процессе» → 2 окна сдачи) ОДНОЙ кнопкой; игрок проходит: пояснение → получение («Собрать: Ночная фиалка 0/2»,
// награда) → «В процессе» → сдача. Плюс: старые реплики сюжетного квеста видны как окна. Скрины → /workspace/morrisgrad-round3/vn/flow/
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const { guardLocal } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/vn/flow'; require('fs').mkdirSync(OUT, { recursive: true });
const d1 = (sql) => execSync(`npx wrangler d1 execute morrisgrad_db --local --json --command "${sql}"`).toString();
const QID = 'c_flow_' + (Date.now() % 1e7);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async (n, uid) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e).slice(0, 300)));
    const msgs = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"toast_error"') || s.includes('"admin_result"')) msgs.push(s.slice(0, 400)); }));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(2500);
    return [p, (fn, a) => p.evaluate(fn, a), msgs, blocked];
  };
  // ---- админ: новый квест в одном блоке
  const [A, G, ma] = await open('Алекс', 'test_admin_pt');
  await G(() => document.querySelector('#ghud-admin-btn').click()); await A.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  await A.click('.mc-admin [data-tab="quest"]'); await A.waitForTimeout(300); await A.click('.mc-admin aside li[data-id="__new"]'); await A.waitForTimeout(400);
  ok(!(await A.$('.mc-admin [data-q="offer"]')) && !(await A.$('.mc-admin [data-q="done"]')) && !(await A.$('.mc-admin [data-vnsave]')), 'старых «Реплик» и второй кнопки сохранения нет');
  const steps = await A.$$eval('.mc-admin .vn-stepbox h4', (x) => x.map((e) => e.textContent));
  ok(steps.length === 4 && /Пояснение/.test(steps[0]) && /получения/.test(steps[1]) && /процессе/.test(steps[2]) && /Сдача/.test(steps[3]), 'шаги по порядку: ' + steps.join(' → '));
  ok(!!(await A.$('.mc-admin [data-vnone="accept"] ~ .box .objs')) && !!(await A.$('.mc-admin .vn-stepbox [data-q="xp"]')) && !!(await A.$('.mc-admin .vn-stepbox [data-star="yellow"]')), 'цели и награда — внутри шага «Окно получения»');
  await A.fill('.mc-admin [data-q="id"]', QID); await A.fill('.mc-admin [data-q="title"]', 'Фиалки для Петра');
  await A.selectOption('.mc-admin [data-q="npc"]', 'petr');
  await A.selectOption('.mc-admin [data-oi="0"] [data-ot]', 'collect'); await A.waitForTimeout(300);
  await A.selectOption('.mc-admin [data-oi="0"] [data-or]', 'moonpetal'); await A.fill('.mc-admin [data-oi="0"] [data-ocnt]', '2'); await A.fill('.mc-admin [data-oi="0"] [data-otext]', '');
  await A.fill('.mc-admin [data-q="xp"]', '120'); await A.fill('.mc-admin [data-star="yellow"]', '1');
  const setWin = async (sel, who, emo, text) => { await A.selectOption(`${sel} [data-wwho]`, who); await A.waitForTimeout(120); await A.click(`${sel} [data-pick="${emo}"]`); await A.waitForTimeout(120); await A.fill(`${sel} [data-wtext]`, text); };
  // новый квест: окна пояснения из «пустых» реплик нет → добавляем 3
  const OFFER = [['petr', 'think', 'Ты ведь с Поляны? Там, на краю, светятся ночные фиалки.'], ['mage', 'shy', 'Фиалки? Зачем они распаковщику архивов?'], ['petr', 'smirk', 'Их запах будит архивы. Без него хитин не поддаётся.']];
  for (let i = 0; i < 3; i++) { await A.click('.mc-admin [data-wadd="offer"]'); await A.waitForTimeout(150); await setWin(`.mc-admin [data-ph="offer"][data-wi="${i}"]`, ...OFFER[i]); }
  await setWin('.mc-admin [data-ph="accept"]', 'petr', 'determined', 'Принеси две фиалки — и я покажу, как распаковывать по-настоящему.');
  await setWin('.mc-admin [data-ph="progress"]', 'petr', 'think', 'Ещё не нашёл? Они светятся в траве, ищи ночью.');
  const DONE = [['petr', 'joy', 'Пахнут! Архивы уже шевелятся.'], ['hero', 'determined', 'Тогда учи. Я готова.']];
  for (let i = 0; i < 2; i++) { await A.click('.mc-admin [data-wadd="done"]'); await A.waitForTimeout(150); await setWin(`.mc-admin [data-ph="done"][data-wi="${i}"]`, ...DONE[i]); }
  // смена типа цели перерисовывает форму — окна не теряются
  await A.selectOption('.mc-admin [data-oi="0"] [data-ot]', 'gather'); await A.waitForTimeout(250); await A.selectOption('.mc-admin [data-oi="0"] [data-ot]', 'collect'); await A.waitForTimeout(250);
  await A.selectOption('.mc-admin [data-oi="0"] [data-or]', 'moonpetal'); await A.fill('.mc-admin [data-oi="0"] [data-ocnt]', '2');
  ok((await A.$$('.mc-admin [data-ph="offer"].vnw')).length === 3 && (await A.inputValue('.mc-admin [data-ph="accept"] [data-wtext]')).startsWith('Принеси'), 'перерисовка формы сохраняет окна потока');
  await A.screenshot({ path: `${OUT}/01-admin-flow-top.png` });
  await A.$eval('.mc-admin [data-vnone="accept"]', (e) => e.scrollIntoView()); await A.screenshot({ path: `${OUT}/02-admin-flow-accept.png` });
  await A.$eval('.mc-admin [data-vnlist="done"]', (e) => e.scrollIntoView()); await A.screenshot({ path: `${OUT}/03-admin-flow-progress-done.png` });
  // неверное окно → отказ сервера, квест не сохранён
  const n0 = ma.length; await G((id) => window.__game.debug.rawSend({ type: 'admin_quest_save', quest: { id, npc: 'petr', title: 'x', objectives: [{ type: 'level', count: 2 }], rewards: {}, dialogue: { offer: [{ who: 'petr', emo: 'rage', text: 'x' }], done: [{ who: 'petr', emo: 'joy', text: 'y' }] } } }), QID + 'x');
  for (let k = 0; k < 30 && ma.length === n0; k++) await A.waitForTimeout(100);
  ok(ma.slice(n0).some((t) => t.includes('"ok":false') && t.includes('эмоция')), 'сервер отверг неизвестную эмоцию в потоке');
  ok(!new RegExp(QID + 'x').test(d1(`SELECT id FROM custom_quests WHERE id='${QID}x'`)), 'при ошибке окна квест не записан');
  await A.click('.mc-admin [data-qsave]');
  await A.waitForFunction(() => /Сохранено|✖/.test(document.querySelector('.mc-admin .msg')?.textContent || ''), null, { timeout: 8000 });
  const m = await A.textContent('.mc-admin .msg'); ok(/Сохранено/.test(m), 'одна кнопка: ' + m);
  const qrow = d1(`SELECT data FROM custom_quests WHERE id='${QID}'`).replace(/\\/g, ''), drow = d1(`SELECT data FROM quest_dialogues WHERE quest_id='${QID}'`).replace(/\\/g, '');
  ok(/Ты ведь с Поляны/.test(qrow) && /Пахнут/.test(qrow), 'D1 custom_quests: реплики = тексты окон (для Книги/трекера)');
  ok(/"accept":\{"who":"petr","emo":"determined"/.test(drow) && /"progress":\{"who":"petr","emo":"think"/.test(drow) && (drow.match(/"who":/g) || []).length === 7, 'D1 quest_dialogues: 3 пояснения + получение + в процессе + 2 сдачи');
  // старый сюжетный квест: реплики показываются в редакторе как окна (миграция на лету)
  await A.fill('.mc-admin aside input', 'l2_moths'); await A.click('.mc-admin aside li[data-id="l2_moths"]'); await A.waitForTimeout(400);
  const legacy = await A.$$eval('.mc-admin [data-ph="offer"].vnw', (x) => x.map((r) => [r.querySelector('[data-wwho]').value, r.querySelector('[data-wemo]').value, r.querySelector('[data-wtext]').value]));
  ok(legacy.length >= 1 && legacy[0][0] === 'leyr' && legacy[0][1] === 'calm' && /мотыльки/.test(legacy[0][2]), 'старые реплики l2_moths → окна Лэйр (calm): ' + JSON.stringify(legacy[0]));
  await A.screenshot({ path: `${OUT}/04-admin-legacy-quest.png` });
  // чистый старт для игрока: скрыть прочие квесты Петра из панели (остатки прошлых прогонов), чтобы Пётр открыл наш
  const others = () => [...d1(`SELECT id FROM custom_quests WHERE enabled=1 AND id <> '${QID}' AND data LIKE '%petr%'`).matchAll(/"id": "([^"]+)"/g)].map((x) => x[1]);
  for (const id of others()) { await G((q) => window.__game.debug.rawSend({ type: 'admin_quest_delete', id: q }), id); await A.waitForTimeout(700); }
  ok(!others().length, 'прочие квесты Петра скрыты');
  await A.click('.mc-admin [data-x]');
  // ---- игрок
  const [P, GP, mp, blocked] = await open('Мариэль', 'test_flow_player_' + Date.now());
  await GP(() => window.__game.debug.selectClass('mage')); await P.waitForTimeout(2500);
  await GP(() => window.__game.debug.tp(420, 800)); await P.waitForTimeout(1500);
  const talk = async () => { await GP(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'petr' })); await P.waitForSelector('.mc-vn', { timeout: 6000 }); await P.waitForTimeout(500); };
  const vn = () => GP(() => { const v = document.querySelector('.mc-vn'); return v && { i: +v.dataset.vnI, kind: v.dataset.kind, who: v.dataset.who, emo: v.dataset.emo, text: v.querySelector('.vn-box p')?.textContent || '', goals: [...v.querySelectorAll('.vn-goals li')].map((l) => l.textContent.trim()), rew: v.querySelector('.vn-rew')?.textContent || '', btns: [...document.querySelectorAll('.mc-vn-screen button')].map((x) => x.textContent) }; });
  await talk();
  for (let i = 0; i < 3; i++) {
    const s = await vn(); ok(s.kind === 'offer' && s.i === i && s.who === OFFER[i][0] && s.emo === OFFER[i][1] && s.text === OFFER[i][2], `пояснение ${i + 1}/3: ${s.who} · ${s.emo}`);
    await P.screenshot({ path: `${OUT}/1${i + 1}-intro-${i + 1}.png` });
    if (i < 2) await P.keyboard.press(i ? 'Enter' : 'Space'); else await P.click('#vn-next'); await P.waitForTimeout(450);
  }
  let s = await vn();
  ok(s.kind === 'accept' && s.who === 'petr' && s.emo === 'determined' && /Принеси/.test(s.text), 'после последнего «Дальше» — окно получения (Пётр, решимость)');
  ok(s.goals.some((g) => /Собрать: Ночная фиалка\s*0\/2/.test(g)), 'цели с реальным именем: ' + s.goals.join(' | '));
  ok(/120 опыта/.test(s.rew) && /1 жёлтая/.test(s.rew), 'награда в окне: ' + s.rew);
  ok(s.btns.some((t) => /^Взять/.test(t)) && s.btns.includes('Уйти'), 'кнопки «Взять» / «Уйти»: ' + s.btns.join(', '));
  await P.screenshot({ path: `${OUT}/14-accept-window.png` });
  await P.keyboard.press('Space'); await P.waitForTimeout(400); ok((await vn())?.kind === 'accept', 'Пробел не берёт квест случайно (только кнопкой)');
  await P.click('#vn-accept'); await P.waitForTimeout(1200);
  await talk(); s = await vn();
  ok(s.kind === 'progress' && s.who === 'petr' && /Ещё не нашёл/.test(s.text) && s.goals.some((g) => /0\/2/.test(g)), '«В процессе»: окно + прогресс ' + s.goals.join(' | '));
  await P.screenshot({ path: `${OUT}/15-in-progress.png` });
  await P.click('.mc-vn-screen button:has-text("Уйти")'); await P.waitForTimeout(300);
  await GP(() => window.__game.debug.rawSend({ type: 'dev_grant', res: { moonpetal: 2 } })); await P.waitForTimeout(1200);
  await talk();
  for (let i = 0; i < 2; i++) {
    s = await vn(); ok(s.kind === 'done' && s.i === i && s.who === DONE[i][0] && s.emo === DONE[i][1] && s.text === DONE[i][2], `сдача ${i + 1}/2: ${s.who} · ${s.emo}`);
    if (i === 1) { ok(/120 опыта/.test(s.rew) && s.btns.some((t) => /Сдать/.test(t)), 'последнее окно сдачи: награда + «Сдать»'); ok(!!(await P.$('.mc-vn .vn-av[src="/mc-vn/mage/determined.webp"]')), 'герой игрока = Мариэль'); }
    await P.screenshot({ path: `${OUT}/1${6 + i}-turnin-${i + 1}.png` });
    if (i === 0) { await P.keyboard.press('Space'); await P.waitForTimeout(450); }
  }
  await P.click('#vn-turnin'); await P.waitForTimeout(1500);
  await GP(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'petr' })); await P.waitForTimeout(1200);
  ok(!(await P.$('.mc-vn[data-kind="done"]')), 'после сдачи диалог сдачи не повторяется');
  await P.screenshot({ path: `${OUT}/18-after-turnin.png` });
  ok(!errs.length, 'без ошибок страницы ' + errs.slice(0, 3).join(' | ')); ok(!blocked.length, 'только localhost');
  await G((id) => window.__game.debug.rawSend({ type: 'admin_quest_delete', id }), QID); await A.waitForTimeout(500);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
