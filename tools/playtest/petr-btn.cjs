// LOCAL: услуги NPC (Пётр: Ремесло/Улучшение) во ВСЕХ состояниях диалога + NPC бродят (сервер), стоят во время разговора.
// Только 127.0.0.1 (guardLocal). PB_BASE=http://127.0.0.1:5291/game.html PB_WS=ws://127.0.0.1:8891 PB_WR=/workspace/mc-harness-petr/wr node tools/playtest/petr-btn.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/petr-btn';
const BASE = process.env.PB_BASE || 'http://127.0.0.1:5291/game.html', WS = process.env.PB_WS || 'ws://127.0.0.1:8891', WR = process.env.PB_WR || '/workspace/mc-harness-petr/wr';
const ADMIN = 'pb_admin_' + Date.now().toString(36);
require('child_process').execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}','admin','local-test',0)"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
require('child_process').execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "DELETE FROM custom_quests WHERE id LIKE 'c_pb%'"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } }); // хвосты прошлых прогонов
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const TAG = Date.now().toString(36).slice(-4);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, vp, mobile) => {
    const ctx = await b.newContext({ viewport: vp, ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.dlg = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"customQuests"')) try { const j = JSON.parse(s); if (Array.isArray(j.customQuests)) p.cq = j.customQuests.map((q) => q.id); } catch {} if (s.includes('"type":"npc_dialog"')) try { p.dlg.push(JSON.parse(s)); } catch {}
      if (s.includes('toast_error') || s.includes('"toast"')) try { const j = JSON.parse(s); const t = j.message || j.toast; if (t) { p.toasts = (p.toasts || []).concat(t); if (process.env.PB_V) console.log('   toast:', t); } } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(800);
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1200);
    p.S = (o) => p.evaluate((x) => window.__game.debug.send(x), o); p.G = (f, a) => p.evaluate(f, a);
    return p;
  };
  const btns = (p) => p.G(() => [...document.querySelectorAll('.mc-dialog-screen button.mc3d-btn')].map((e) => e.textContent.trim()));
  const svcOk = (L) => L.some((t) => /Улучшение/.test(t)) && L.some((t) => /Ремесло/.test(t));
  const closeAll = (p) => p.G(() => { document.querySelectorAll('.mc-dialog-screen button.ghost').forEach((x) => /Уйти/.test(x.textContent) && x.click()); });
  // подойти к Петру (где бы он ни гулял) и заговорить
  const talk = async (p) => {
    for (let i = 0; i < 4; i++) {
      const n = await p.G(() => window.__game.debug.npcPos('petr'));
      await p.G(([x, y]) => window.__game.debug.tp(x, y + 36, true), [n.x, n.y]); await sleep(700);
      const near = await p.G(() => window.__game.debug.nearestNpc());
      if (near !== 'petr') continue;
      const k = p.dlg.length; await p.G(() => window.__game.debug.interact());
      for (let j = 0; j < 20 && p.dlg.length === k; j++) await sleep(100);
      await sleep(500); if (p.dlg.length > k) return p.dlg[p.dlg.length - 1];
    }
    return null;
  };
  // пройти окна VN «Дальше» до последнего, собирая кнопки каждого окна
  const walkVN = async (p, tag, shot) => {
    const seen = []; for (let i = 0; i < 8; i++) {
      const L = await btns(p); seen.push(L); if (shot) await p.screenshot({ path: `${OUT}/${shot}-${i}.png` });
      ok(svcOk(L), `${tag} окно ${i + 1}: есть «Ремесло» и «Улучшение» — [${L.join(' | ')}]`);
      if (!L.some((t) => /Дальше/.test(t))) break;
      await p.click('#vn-next'); await sleep(350);
    }
    return seen;
  };

  const p = await open(ADMIN, { width: 1280, height: 760 }, false);
  await p.S({ type: 'dev_grant', xp: 20000 }); await p.S({ type: 'meta_get' }); await sleep(900);
  for (const id of (p.cq || []).filter((x) => /^c_pb/.test(x))) { await p.S({ type: 'admin_quest_delete', id }); await sleep(1300); } // хвосты прошлых прогонов (сервер держит квесты в памяти)
  console.log('  убраны старые тестовые квесты:', (p.cq || []).filter((x) => /^c_pb/.test(x)).length);
  await p.G(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'npc', id: 'main', patch: { pauseMin: 1.2, pauseMax: 2 } })); await sleep(800); // быстрее для теста
  // ---------- A. NPC бродят ----------
  const sp = await p.G(() => window.__game.debug.npcSpawn('petr'));
  const track = []; for (let i = 0; i < 16; i++) { track.push(await p.G(() => window.__game.debug.npcPos('petr'))); await sleep(500); }
  const dmax = Math.max(...track.map((q) => Math.hypot(q.x - sp.x, q.y - sp.y)));
  ok(dmax > 24, `Пётр отошёл от точки появления: до ${Math.round(dmax)} px`);
  ok(dmax <= 10 * 32 + 8, `и не дальше радиуса 10 клеток (320 px): ${Math.round(dmax)}`);
  ok(track.some((q) => q.moving) && track.some((q) => !q.moving), 'ходит и делает паузы');
  const far = track.reduce((a, q) => (Math.hypot(q.x - sp.x, q.y - sp.y) > Math.hypot(a.x - sp.x, a.y - sp.y) ? q : a));
  // кадр: Пётр вдали от точки появления — стоим в точке появления, камера на ней
  await p.G(([x, y]) => window.__game.debug.tp(x, y + 60, true), [sp.x, sp.y]); await sleep(300);
  for (let i = 0; i < 30; i++) { const q = await p.G(() => window.__game.debug.npcPos('petr')); if (Math.hypot(q.x - sp.x, q.y - sp.y) > 120) break; await sleep(400); }
  const pNow = await p.G(() => window.__game.debug.npcPos('petr'));
  await p.screenshot({ path: `${OUT}/01-petr-wandered-from-spawn.png` });
  console.log(`  кадр 01: точка появления (${sp.x},${sp.y}), Пётр сейчас (${Math.round(pNow.x)},${Math.round(pNow.y)}) — ${Math.round(Math.hypot(pNow.x - sp.x, pNow.y - sp.y))} px`);
  // второй игрок видит то же самое (сервер — источник правды)
  const p2 = await open('pb_watch_' + TAG, { width: 900, height: 600 }, false);
  await p2.G(([x, y]) => window.__game.debug.tp(x, y + 60, true), [sp.x, sp.y]); await sleep(1500);
  const a1 = await p.G(() => window.__game.debug.npcPos('petr')), a2 = await p2.G(() => window.__game.debug.npcPos('petr'));
  ok(Math.hypot(a1.x - a2.x, a1.y - a2.y) < 40, `два игрока видят Петра в одной точке (Δ ${Math.round(Math.hypot(a1.x - a2.x, a1.y - a2.y))} px)`);

  // ---------- B. idle (нет квестов у Петра) ----------
  let d = await talk(p);
  ok(!!d, 'диалог с Петром открыт (взаимодействие следует за ним): квестов ' + (d?.quests?.length ?? '-'));
  const hold0 = await p.G(() => window.__game.debug.npcServer('petr')); await sleep(3000); const hold1 = await p.G(() => window.__game.debug.npcServer('petr'));
  ok(Math.hypot(hold0.x - hold1.x, hold0.y - hold1.y) < 3 && !hold1.moving, `пока открыт диалог — Пётр стоит (сдвиг ${Math.hypot(hold0.x - hold1.x, hold0.y - hold1.y).toFixed(1)} px за 3 с)`);
  const busy = d?.quests?.some((q) => ['available', 'active', 'complete'].includes(q.state));
  if (!busy) { const L = await btns(p); ok(svcOk(L), 'нет квеста: «Ремесло» и «Улучшение» — ' + L.join(' | ')); await p.screenshot({ path: `${OUT}/02-idle.png` }); }
  await closeAll(p); await sleep(400);
  // ---------- C. квест предложен (offer → accept) ----------
  const QA = 'c_pba' + TAG, QB = 'c_pbb' + TAG;
  await p.S({ type: 'admin_quest_save', quest: { id: QA, npc: 'petr', turnin: 'petr', title: 'Опять безветрие', minLevel: 1, requires: [], track: true,
    objectives: [{ type: 'kill_boss', mob: 'moon_sentinel', text: 'Убить безветрие' }], rewards: { xp: 100 }, offer: ['Баги этот нормально)', 'Сходи, проверь.'], progress: 'Баги этот нормально)', done: ['Ура!'] } }); await sleep(1500);
  d = await talk(p); ok(d?.quests?.some((q) => q.id === QA && q.state === 'available'), 'квест предложен');
  await walkVN(p, 'Предложение', '03-offer');
  // Улучшение прямо из окна квеста → окно Кузни, Пётр стоит
  await p.click('#npc-svc-upgrade'); await sleep(700);
  ok(await p.G(() => !!window.__game.upgWin?.isOpen), '«🔨 Улучшение» из окна квеста открыло Кузню Петра');
  await p.screenshot({ path: `${OUT}/04-upgrade-from-offer.png` });
  const u0 = await p.G(() => window.__game.debug.npcServer('petr')); await sleep(2500); const u1 = await p.G(() => window.__game.debug.npcServer('petr'));
  ok(Math.hypot(u0.x - u1.x, u0.y - u1.y) < 3, 'пока открыта Кузня — Пётр стоит');
  await p.G(() => window.__game.upgWin.close()); await sleep(400);
  d = await talk(p); await walkVN(p, 'Предложение (2)');
  await p.click('#npc-svc-craft'); await sleep(700);
  ok(await p.G(() => !!window.__game.book?.isOpen && window.__game.book.tab === 'craft'), '«⚒️ Ремесло» из окна квеста открыло Ремесло');
  await p.screenshot({ path: `${OUT}/05-craft-from-offer.png` });
  await p.G(() => window.__game.book.close()); await sleep(400);
  d = await talk(p); await walkVN(p, 'Взятие'); await p.click('#vn-accept'); await sleep(900);
  // ---------- D. в процессе ----------
  d = await talk(p); ok(d?.quests?.some((q) => q.id === QA && q.state === 'active'), 'квест в процессе');
  await walkVN(p, 'В процессе', '06-progress');
  // «Все квесты» и карточка квеста
  await p.click('#npc-all-quests'); await sleep(400); { const L = await btns(p); ok(svcOk(L), '«Все квесты»: услуги на месте — ' + L.join(' | ')); }
  await p.screenshot({ path: `${OUT}/07-all-quests.png` });
  await closeAll(p); await sleep(300);
  // ---------- E. сдача (квест «поговорить с Петром» — выполняется разговором) ----------
  await p.S({ type: 'admin_quest_save', quest: { id: QB, npc: 'petr', turnin: 'petr', title: 'Зайди к Петру', minLevel: 1, requires: [], track: true,
    objectives: [{ type: 'talk', npc: 'petr', text: 'Поговорить с Петром' }], rewards: { xp: 50 }, offer: ['Зайди потом.'], progress: 'Ну?', done: ['Спасибо, что зашёл.', 'Держи награду.'] } }); await sleep(1500);
  d = await talk(p); await walkVN(p, 'Предложение B'); await p.click('#vn-accept'); await sleep(900);
  d = await talk(p); ok(d?.quests?.some((q) => q.id === QB && q.state === 'complete'), 'квест готов к сдаче: ' + JSON.stringify(d?.quests?.map((q) => q.id.slice(-6) + ':' + q.state)));
  await walkVN(p, 'Сдача', '08-turnin');
  await p.click('#npc-svc-upgrade'); await sleep(600); ok(await p.G(() => !!window.__game.upgWin?.isOpen), '«Улучшение» из окна сдачи открыло Кузню');
  await p.G(() => window.__game.upgWin.close()); await sleep(300);
  d = await talk(p); for (let i = 0; i < 6 && await p.$('#vn-next'); i++) { await p.click('#vn-next'); await sleep(300); }
  await p.click('#vn-turnin'); await sleep(900);
  // после закрытия — снова гуляет
  await sleep(2500); const r0 = await p.G(() => window.__game.debug.npcPos('petr')); await sleep(3500); const r1 = await p.G(() => window.__game.debug.npcPos('petr'));
  ok(Math.hypot(r0.x - r1.x, r0.y - r1.y) > 5, `после разговора Пётр снова гуляет (сдвиг ${Math.round(Math.hypot(r0.x - r1.x, r0.y - r1.y))} px)`);

  // ---------- F. телефон: окно квеста с услугами ----------
  const m = await open('pb_mob_' + TAG, { width: 390, height: 844 }, true);
  await m.S({ type: 'dev_grant', xp: 20000 }); await sleep(500);
  d = await talk(m); ok(d?.quests?.some((q) => q.id === QA && q.state === 'available'), 'телефон: квест предложен');
  const ML = await walkVN(m, 'Телефон', '09-mobile-offer');
  const fit = await m.G(() => [...document.querySelectorAll('.mc-dialog-screen button.mc3d-btn')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.height >= 30; }));
  ok(fit, 'телефон: все кнопки на экране и нажимаемого размера');
  await m.tap('#npc-svc-upgrade'); await sleep(700); ok(await m.G(() => !!window.__game.upgWin?.isOpen), 'телефон: тап «Улучшение» открыл Кузню');
  await m.screenshot({ path: `${OUT}/10-mobile-upgrade.png` });
  await m.G(() => window.__game.upgWin.close()); await sleep(300);
  // админка: вкладка «🚶 NPC»
  await p.G(() => window.__game.debug.openAdmin()); await sleep(1500);
  await p.G(() => document.querySelector('.mc-admin [data-tab="npc"]')?.click()); await sleep(500);
  await p.G(() => document.querySelector('.mc-admin aside li[data-id="main"]')?.click()); await sleep(700);
  const nF = await p.G(() => document.querySelectorAll('.mc-admin section [data-p]').length); ok(nF >= 6, `админка «🚶 NPC»: ${nF} полей`);
  await p.screenshot({ path: `${OUT}/11-admin-npc.png` });
  await p.G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'npc', id: 'main' })); await sleep(500);
  for (const q of [QA, QB]) { await p.S({ type: 'admin_quest_delete', id: q }); await sleep(1300); }
  ok(!p.errs.length && !p2.errs.length && !m.errs.length, 'без ошибок страницы ' + [...p.errs, ...p2.errs, ...m.errs].join(';'));
  console.log(`\n${fails} FAIL`);
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
