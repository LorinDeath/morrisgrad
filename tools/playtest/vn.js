// Диалоги-новеллы квестов (локально): админ создаёт квест Петра + диалог из 4 окон (разные говорящие/эмоции) в админке,
// сервер отвергает чужие/неверные диалоги, игрок листает окна «Дальше»/Пробел/Enter → «Взять», затем диалог сдачи → «Сдать».
// Скриншоты → /workspace/morrisgrad-round3/vn/. Запуск из каталога server: NODE_PATH=<playwright-core> node ../tools/playtest/vn.js
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const { guardLocal } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/vn'; require('fs').mkdirSync(OUT, { recursive: true });
const d1 = (sql) => execSync(`npx wrangler d1 execute morrisgrad_db --local --json --command "${sql}"`).toString();
const QID = 'c_vn_' + (Date.now() % 1e7);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async (n, uid) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e).slice(0, 300)));
    const msgs = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"toast_error"') || s.includes('"admin_result"')) msgs.push(s.slice(0, 300)); }));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(2500);
    return [p, (fn, a) => p.evaluate(fn, a), msgs, blocked];
  };
  // 1. обычный игрок не может сохранить диалог
  const [U, GU, mu] = await open('Plain', 'test_vn_plain_' + Date.now());
  await GU(() => window.__game.debug.rawSend({ type: 'admin_dialogue_save', questId: 'l1_wind', dialogue: { offer: [{ who: 'leyr', emo: 'joy', text: 'взлом' }] } })); await U.waitForTimeout(1200);
  ok(mu.some((t) => t.includes('Недостаточно прав')) && !mu.some((t) => t.includes('"admin_result"')), 'не-админ: admin_dialogue_save отклонён сервером');
  ok(!/l1_wind/.test(d1("SELECT quest_id FROM quest_dialogues WHERE quest_id='l1_wind'")), 'D1: строки не появилось');
  await U.context().close();
  // 2. админ: квест Петра + диалог в редакторе
  const [A, G, ma, blocked] = await open('Алекс', 'test_admin_pt');
  await G(() => window.__game.debug.selectClass?.('mage')); await A.waitForTimeout(1500);
  await G((id) => window.__game.debug.rawSend({ type: 'admin_quest_save', quest: { id, npc: 'petr', title: 'Шёпот архивов', objectives: [{ type: 'talk', npc: 'petr', text: 'Поговорите с Петром ещё раз' }], rewards: { xp: 50 }, offer: ['Есть дело.'], progress: '…', done: ['Готово.'] } }), QID);
  await A.waitForTimeout(1200);
  ok(ma.some((t) => t.includes('"op":"quest"') && t.includes(QID)), 'квест ' + QID + ' создан');
  // неверные диалоги — отказ сервера
  for (const [bad, why] of [[{ offer: [{ who: 'ghost', emo: 'joy', text: 'x' }] }, 'неизвестный персонаж'], [{ offer: [{ who: 'petr', emo: 'rage', text: 'x' }] }, 'неизвестная эмоция'], [{ offer: [{ who: 'petr', emo: 'joy', text: 'я'.repeat(501) }] }, 'длиннее']]) {
    const n0 = ma.length; await G((a) => window.__game.debug.rawSend({ type: 'admin_dialogue_save', questId: a.q, dialogue: a.bad }), { q: QID, bad }); for (let k = 0; k < 30 && ma.length === n0; k++) await A.waitForTimeout(100); await A.waitForTimeout(400);
    ok(ma.slice(n0).some((t) => t.includes('"ok":false') && t.includes(why)), 'сервер отверг: ' + why + ' ' + ma.slice(n0).join(' ').slice(0, 200));
  }
  await G(() => document.querySelector('#ghud-admin-btn').click()); await A.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  await A.click('.mc-admin [data-tab="quest"]'); await A.waitForTimeout(300); await A.fill('.mc-admin aside input', QID); await A.click(`.mc-admin aside li[data-id="${QID}"]`); await A.waitForTimeout(400);
  ok(!!(await A.$('.mc-admin .vn-ed')), 'в форме квеста есть редактор «Диалог-новелла»');
  const W = [['petr', 'think', 'Хм… Ещё один Проклятый. Ты пахнешь пеплом Поляны.'], ['mage', 'shy', 'Я… просто хотела спросить, что за архивы вы распаковываете.'], ['petr', 'smirk', 'Архивы — это всё, что осталось от убитых Отголосков. Хочешь научиться?'], ['kyut', 'joy', 'Пётр, не пугай новичков! Соглашайся — потом приходи ко мне на арену.']];
  for (let i = 0; i < W.length; i++) {
    await A.click('.mc-admin [data-wadd]'); await A.waitForTimeout(150);
    const r = `.mc-admin [data-wi="${i}"]`;
    await A.selectOption(`${r} [data-wwho]`, W[i][0]); await A.waitForTimeout(150);
    await A.click(`${r} [data-pick="${W[i][1]}"]`); await A.waitForTimeout(150);
    await A.fill(`${r} [data-wtext]`, W[i][2]);
  }
  // переставить: добавить лишнее окно, поднять его и удалить — проверка ▲/✕
  await A.click('.mc-admin [data-wadd]'); await A.fill('.mc-admin [data-wi="4"] [data-wtext]', 'лишнее'); await A.click('.mc-admin [data-up="4"]'); await A.waitForTimeout(150);
  ok((await A.inputValue('.mc-admin [data-wi="3"] [data-wtext]')) === 'лишнее', '▲ переставляет окно');
  await A.click('.mc-admin [data-wrm="3"]'); await A.waitForTimeout(150);
  ok((await A.$$('.mc-admin .vnw')).length === 4, '✕ удаляет окно (осталось 4)');
  await A.screenshot({ path: `${OUT}/01-admin-editor-offer.png` });
  await A.click('.mc-admin [data-ph="done"]'); await A.waitForTimeout(150);
  const D = [['petr', 'joy', 'Вот видишь — разговор тоже работа. Держи опыт.'], ['hero', 'determined', 'Спасибо, Пётр. Я вернусь с архивами.']];
  for (let i = 0; i < D.length; i++) { await A.click('.mc-admin [data-wadd]'); const r = `.mc-admin [data-wi="${i}"]`; await A.selectOption(`${r} [data-wwho]`, D[i][0]); await A.click(`${r} [data-pick="${D[i][1]}"]`); await A.fill(`${r} [data-wtext]`, D[i][2]); }
  await A.screenshot({ path: `${OUT}/02-admin-editor-done.png` });
  await A.click('.mc-admin [data-vnsave]');
  await A.waitForFunction(() => /Сохранено|✖/.test(document.querySelector('.mc-admin .msg')?.textContent || ''), null, { timeout: 8000 });
  const m = await A.textContent('.mc-admin .msg'); ok(/Сохранено/.test(m), 'диалог сохранён: ' + m);
  const row = d1(`SELECT data FROM quest_dialogues WHERE quest_id='${QID}'`).replace(/\\/g, '');
  ok(/"who":"kyut","emo":"joy"/.test(row) && /"who":"hero","emo":"determined"/.test(row), 'D1 quest_dialogues: окна с говорящими и эмоциями');
  await A.screenshot({ path: `${OUT}/03-admin-saved.png` });
  await A.click('.mc-admin [data-x]');
  // 3. игра (свежий игрок, не админ): Пётр → окна новеллы
  const [P, GP] = await open('Мариэль', 'test_vn_player_' + Date.now());
  await GP(() => window.__game.debug.selectClass('mage')); await P.waitForTimeout(2500);
  await GP(() => window.__game.debug.tp(420, 800)); await P.waitForTimeout(1500);
  await P.screenshot({ path: `${OUT}/04-npc-icon-marker.png` });
  ok(await GP(() => !!document.querySelector('.mc3d-label .mc-npc-ic')), 'над NPC — портрет-иконка квестодателя');
  await GP(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'petr' })); await P.waitForSelector('.mc-vn', { timeout: 5000 });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const s = await GP(() => { const v = document.querySelector('.mc-vn'); const im = v.querySelector('.vn-av'); return { i: +v.dataset.vnI, who: v.dataset.who, emo: v.dataset.emo, name: v.querySelector('.who').textContent, img: im?.getAttribute('src'), loaded: im ? im.complete && im.naturalWidth > 0 : false, text: v.querySelector('p').textContent }; });
    await P.waitForTimeout(400); seen.push(s);
    ok(s.i === i && s.who === W[i][0] && s.emo === W[i][1] && s.img === `/mc-vn/${W[i][0]}/${W[i][1]}.webp` && s.text === W[i][2], `окно ${i + 1}: ${s.name} · ${s.emo} · аватар ${s.img}`);
    await P.screenshot({ path: `${OUT}/0${5 + i}-offer-window-${i + 1}.png` });
    if (i === 0) await P.click('#vn-next'); else if (i === 1) await P.keyboard.press('Space'); else if (i === 2) await P.keyboard.press('Enter');
    await P.waitForTimeout(350);
  }
  ok(seen.every((s) => s.loaded), 'все аватары загрузились');
  ok(!!(await P.$('#vn-accept')) && !(await P.$('#vn-next')), 'последнее окно: кнопка «Взять» вместо «Дальше»');
  ok(await GP(() => document.querySelector('.mc-ghud-chat input, #mc-chat-input') ? document.activeElement?.tagName !== 'INPUT' : true), 'Enter не открыл чат');
  await P.click('#vn-accept'); await P.waitForTimeout(1200);
  await GP(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'petr' })); await P.waitForSelector('.mc-vn', { timeout: 5000 });
  const d0 = await GP(() => { const v = document.querySelector('.mc-vn'); return { who: v.dataset.who, text: v.querySelector('p').textContent }; });
  ok(d0.who === 'petr' && d0.text === D[0][2], 'диалог сдачи: окно 1 (Пётр)');
  await P.screenshot({ path: `${OUT}/09-done-window-1.png` }); await P.keyboard.press('Space'); await P.waitForTimeout(400);
  const d1v = await GP(() => { const v = document.querySelector('.mc-vn'); return { who: v.dataset.who, name: v.querySelector('.who').textContent, img: v.querySelector('.vn-av')?.getAttribute('src') }; });
  ok(d1v.who === 'hero' && d1v.img === '/mc-vn/mage/determined.webp', 'говорящий «Герой игрока» = текущая оболочка (Мариэль): ' + JSON.stringify(d1v));
  await P.screenshot({ path: `${OUT}/10-done-window-2-hero.png` });
  ok(!!(await P.$('#vn-turnin')), 'последнее окно: «Сдать»');
  await P.click('#vn-turnin'); await P.waitForTimeout(1200);
  ok(!errs.length, 'без ошибок страницы ' + errs.slice(0, 3).join(' | '));
  ok(!blocked.length, 'запросов не на localhost нет');
  await P.screenshot({ path: `${OUT}/11-after-turnin.png` });
  await G((id) => window.__game.debug.rawSend({ type: 'admin_quest_delete', id }), QID); await A.waitForTimeout(500);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
