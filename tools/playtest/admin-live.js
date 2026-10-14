// Правки админ-панели доходят СРАЗУ до уже подключённых игроков (без переподключения): оружие, карточка предмета,
// сюжетный квест; сервер применяет те же значения в мире/дуэлях (общая память DO). Скриншот admin-live.png.
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const OUT = '/workspace/morrisgrad-round2';
const d1 = (sql) => execSync(`cd server && npx wrangler d1 execute morrisgrad_db --local --json --command "${sql}"`).toString();
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n, uid) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e).slice(0, 200)));
    const reconnects = { n: 0 }; p.on('websocket', () => reconnects.n++);
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    await p.waitForTimeout(2500);
    return [p, (fn, a) => p.evaluate(fn, a), reconnects];
  };
  const [A, G] = await open('Админ', 'test_admin_pt');
  const [B, GB, rB] = await open('Игрок', 'test_live_' + Date.now());
  const ws0 = rB.n;
  const wait = async (fn, arg, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await GB(fn, arg)) return Date.now() - t; await B.waitForTimeout(150); } return -1; };
  // 1. оружие (тип daggers): дальность удара
  const r0 = await GB(() => window.__game.debug.admin().weapon('daggers').atk.range);
  const nr = r0 === 333 ? 334 : 333;
  await G((v) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'weapon', id: 'daggers', patch: { 'atk.range': v } }), nr);
  let t = await wait((v) => window.__game.debug.admin().weapon('daggers').atk.range === v, nr);
  ok(t >= 0, `оружие: второй игрок видит дальность ${r0}→${nr} через ${t} мс`);
  // 2. карточка предмета, который у второго игрока уже открыт
  const ids = await GB(() => window.__game.debug.admin().cardIds());
  const it = ids[0];
  if (it) {
    const l0 = (await GB((id) => window.__game.debug.admin().card(id), it))?.lvl || 1, nl = l0 >= 59 ? l0 - 1 : l0 + 1;
    await G(([id, v]) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'item', id, patch: { lvl: v } }), [it, nl]);
    t = await wait(([id, v]) => window.__game.debug.admin().card(id)?.lvl === v, [it, nl]);
    ok(t >= 0, `предмет ${it}: карточка у второго игрока обновилась (ур. ${l0}→${nl}) через ${t} мс`);
    await A.waitForTimeout(400); await G((id) => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'item', id }), it); await A.waitForTimeout(400);
  } else ok(false, 'у второго игрока нет карточек предметов');
  // 3. сюжетный квест: новое название
  const q0 = await GB(() => window.__game.debug.admin().quest('sl_p1'));
  await G(() => { const q = JSON.parse(JSON.stringify(window.__game.debug.admin().questDef('sl_p1'))); q.title = '★★★ Живая правка'; window.__game.debug.rawSend({ type: 'admin_quest_save', quest: q }); });
  t = await wait(() => window.__game.debug.admin().quest('sl_p1')?.title === '★★★ Живая правка');
  ok(t >= 0, `квест sl_p1: второй игрок видит новое название через ${t} мс (было «${q0?.title}»)`);
  ok(rB.n === ws0, 'без переподключения (новых WebSocket нет)');
  await B.screenshot({ path: `${OUT}/admin-live.png` });
  // сброс
  await G(() => window.__game.debug.rawSend({ type: 'admin_quest_reset', id: 'sl_p1' })); await A.waitForTimeout(400); // лимит админ-запросов 300 мс
  await G(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'weapon', id: 'daggers' }));
  t = await wait((v) => window.__game.debug.admin().weapon('daggers').atk.range === v && window.__game.debug.admin().quest('sl_p1')?.title !== '★★★ Живая правка', r0);
  ok(t >= 0, `сброс тоже доходит сразу (${t} мс) ` + JSON.stringify(await GB(() => [window.__game.debug.admin().weapon('daggers').atk.range, window.__game.debug.admin().quest('sl_p1')?.title])));
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
