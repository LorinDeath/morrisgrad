// LOCAL: админка → «Задания доски» → награда сундуками (кол-во, ярус, уровень, зачарование, проклятость), сохранение в локальную D1,
// строки сундуков на карточке задания и в трекере (ПК 1280×800 + iPhone 13), сдача — сундуки в 🎁. Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-qol/shots/post1022/chest-reward';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8995';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-post1022/wr';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mg-integ/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-post1022/server && ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500))) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 900))); };
const stamp = Date.now().toString(36), ADMIN = 'qa_p22_admin_' + stamp, TASK = process.env.TASK || 'd_kill_b';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
async function open(b, uid, mob) {
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA_IOS } : { viewport: { width: 1280, height: 800 } });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); p.errs = []; p.fr = []; p.on('pageerror', (e) => p.errs.push(String(e.stack || e).replace(/\n\s*/g, ' | ').slice(0, 700)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|"admin_|bchest|board_res|"err/.test(s)) p.fr.push(s.slice(0, 600)); }));
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await p.evaluate(() => window.__game.board?.tut?.('skip')); await sleep(500);
  return { ctx, p };
}
const clean = (p) => p.evaluate(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove()));
const shot = async (p, n, o = {}) => { await clean(p); await sleep(250); await p.screenshot({ path: `${OUT}/${n}.png`, ...o }); console.log('shot', n); };
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  d1(`DELETE FROM game_overrides WHERE kind = 'btask' AND id = '${TASK}'`); d1(`UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides'`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { ctx, p } = await open(b, ADMIN, false); const G = (f, a) => p.evaluate(f, a);
  await G(() => window.__game.debug.openAdmin()); await p.waitForFunction(() => document.querySelectorAll('.mc-admin [data-tab]').length > 0, null, { timeout: 15000 });
  await G(() => document.querySelector('.mc-admin [data-tab="btask"]').click()); await sleep(700);
  await G((id) => { const i = document.querySelector('.mc-admin aside input'); i.value = id; i.dispatchEvent(new Event('input', { bubbles: true })); }, TASK); await sleep(500);
  await p.waitForFunction((id) => !!document.querySelector(`.mc-admin aside li[data-id="${id}"]`) || (() => { const i = document.querySelector('.mc-admin aside input'); if (i && document.querySelector('.mc-admin aside li') && i.value !== id) { i.value = id; i.dispatchEvent(new Event('input', { bubbles: true })); } return false; })(), TASK, { timeout: 20000, polling: 500 }).catch(() => {});
  const found = await G((id) => { const li = document.querySelector(`.mc-admin aside li[data-id="${id}"]`); li?.click(); return !!li; }, TASK); await sleep(900);
  t('админка: задание найдено в списке', found);
  const sec = await G(() => { const s = document.querySelector('.mc-admin .bt-ch'); s?.scrollIntoView({ block: 'center' }); return s ? s.textContent.replace(/\s+/g, ' ').slice(0, 300) : null; });
  t('форма: раздел наград-сундуков', !!sec, sec);
  const set = async (sel, v) => { await G(([s, v]) => { const e = document.querySelector(`.mc-admin [data-ch="${s}"]`); if (!e) throw new Error('нет ' + s); e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, [sel, v]); await sleep(250); };
  const add = () => G(() => document.querySelector('.mc-admin [data-chadd]').click()).then(() => sleep(300));
  // 1) 2 × редкий, по уровню задания, чары ровно 1, без проклятия
  await add(); await set('0.n', 2); await set('0.t', 'rare'); await set('0.e', 1); await set('0.cm', 'no');
  // 2) 1 × легендарный, уровень 14…16, чары по ярусу, шанс проклятого 20 %
  await add(); await set('1.t', 'legendary'); await set('1.lm', 'range'); await set('1.L', 14); await set('1.L2', 16); await set('1.cm', 'pct'); await set('1.c', 20);
  // 3) 1 × чёрный, ровно 20, чары 6, проклятый всегда
  await add(); await set('2.t', 'black'); await set('2.lm', 'fix'); await set('2.L', 20); await set('2.e', 6); await set('2.cm', 'yes');
  await G(() => document.querySelector('.mc-admin .bt-ch')?.scrollIntoView({ block: 'center' })); await sleep(300);
  const box = await G(() => { const r = document.querySelector('.mc-admin .bt-ch').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await shot(p, 'pc-11a-admin-chest-rows');
  await shot(p, 'pc-11a-admin-chest-rows-crop', { clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: Math.min(1280 - Math.max(0, box.x - 10), box.w + 20), height: Math.min(800 - Math.max(0, box.y - 10), box.h + 20) } });
  // неверное значение: 11 сундуков в строке (максимум 10) и 40 % проклятия (максимум 30) — сохранение не уходит
  await set('0.n', 11); await set('1.c', 40); await G(() => document.querySelector('.mc-admin [data-bt-save]').click()); await sleep(900);
  const errs = await G(() => document.querySelector('.mc-admin .errs')?.textContent.replace(/\s+/g, ' ').trim() || '');
  t('форма: 11 сундуков — ошибка «сколько 1…10», сохранение не отправлено', /1…10/.test(errs), errs);
  await shot(p, 'pc-11b-admin-validation-count');
  await set('0.n', 2); await G(() => document.querySelector('.mc-admin [data-bt-save]').click()); await sleep(900);
  const errs1 = await G(() => document.querySelector('.mc-admin .errs')?.textContent.replace(/\s+/g, ' ').trim() || '');
  t('форма: проклятие 40 % — ошибка «0…30 %», сохранение не отправлено', /30/.test(errs1), errs1);
  await G(() => document.querySelector('.mc-admin .errs')?.scrollIntoView({ block: 'center' })); await shot(p, 'pc-11b-admin-validation');
  t('в D1 ничего не записано при ошибке', !d1(`SELECT id FROM game_overrides WHERE kind='btask' AND id='${TASK}'`).length);
  await set('0.n', 2); await set('1.c', 20); p.fr.length = 0;
  await G(() => document.querySelector('.mc-admin [data-bt-save]').click()); await sleep(2500);
  const errs2 = await G(() => document.querySelector('.mc-admin .errs')?.textContent.trim() || '');
  t('сохранение без ошибок', !errs2 && !p.fr.some((s) => s.includes('toast_error')), { errs2, fr: p.fr.slice(-3) });
  const row = d1(`SELECT data FROM game_overrides WHERE kind='btask' AND id='${TASK}'`)[0]; const data = row ? JSON.parse(row.data) : null;
  t('локальная D1: в правке задания поле ch с тремя строками', data && Array.isArray(data.ch) && data.ch.length === 3, data && data.ch);
  // карточка задания у игрока: ранг C + три строки сундуков
  await G((id) => window.__game.debug.rawSend({ type: 'dev_grant', boardRoll: { id, r: 'C', n: 3 } }), TASK); await sleep(1500);
  await G(() => document.querySelector('.mc-admin .x, .mc-admin [data-x], .mc-admin [data-close]')?.click()); await p.keyboard.press('Escape'); await sleep(500);
  await G(() => { const a = document.querySelector('.mc-admin'); if (a) a.style.display = 'none'; });
  await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.board?.defs, null, { timeout: 120000 }); await sleep(3000);
  for (const [tag, pp, mob] of [['pc', p, false]]) await card(tag, pp, mob);
  async function card(tag, pp, mob) {
    const g = (f, a) => pp.evaluate(f, a);
    await g((id) => window.__game.board.pin(id, true), TASK); await sleep(800);
    await g(() => window.__game.boardWin.open('all', 'daily')); await sleep(1000);
    const lines = await g((id) => { const r = document.querySelector(`.mc-bd-row[data-id="${id}"]`); r?.scrollIntoView({ block: 'center' }); return r ? [...r.querySelectorAll('.mc-bd-chest')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()) : null; }, TASK);
    t(`${tag}: карточка — сундук ранга + 3 строки наград`, lines && lines.length === 4 && lines.filter((l) => /^\+/.test(l)).length >= 4, lines);
    t(`${tag}: в строках виден ярус, уровень, чары, проклятость`, lines && lines.some((l) => /2 ×|×\s*2|2 сундук/.test(l)) && lines.some((l) => /14.?–.?16|14…16/.test(l)) && lines.some((l) => /20 %|20%/.test(l)), lines);
    await shot(pp, `${tag}-11c-task-card-chests`);
    await g(() => window.__game.boardWin.close()); await sleep(600);
    const tr = await g(() => document.querySelector('.mc-tracker, .mc-trk')?.textContent.replace(/\s+/g, ' ').slice(0, 400) || '');
    t(`${tag}: в трекере закреплённое задание`, /сундук|Мошкар|убей|Убей/i.test(tr), tr);
    await shot(pp, `${tag}-11d-tracker`);
  }
  await ctx.close();
  // iPhone 13: тот же аккаунт-администратор недоступен второй сессией — новый игрок, задание у него из общих данных
  { const U = 'qa_p22_mob_' + stamp; const o = await open(b, U, true); await o.p.evaluate((id) => window.__game.debug.rawSend({ type: 'dev_grant', boardRoll: { id, r: 'C', n: 3 } }), TASK); await sleep(1500); await card('iphone13', o.p, true);
    // сдать: прогресс n=3 (dev) → «Сдать» → сундуки в 🎁
    // задание «Разминка» сдаётся с 10 уровня — герою теста сначала опыт (только локальный dev_grant)
    await o.p.evaluate(() => window.__game.debug.rawSend({ type: 'dev_grant', xp: 400000 })); await sleep(1500);
    await o.p.evaluate((id) => window.__game.debug.rawSend({ type: 'dev_grant', boardRoll: { id, r: 'C', n: 3, p: 3 } }), TASK); await sleep(1500);
    await o.p.evaluate(() => window.__game.boardWin.open('all', 'daily')); await sleep(900);
    const cl = await o.p.evaluate((id) => { const b = document.querySelector(`.mc-bd-row[data-id="${id}"] [data-b="claim"]`); b?.scrollIntoView({ block: 'center' }); return !!b; }, TASK);
    t('iphone13: задание готово к сдаче', cl); await shot(o.p, 'iphone13-11e-ready');
    if (cl) { o.p.fr.length = 0; await o.p.evaluate((id) => document.querySelector(`.mc-bd-row[data-id="${id}"] [data-b="claim"]`).click(), TASK); await sleep(2500); console.log('claim-frames', JSON.stringify(o.p.fr.slice(-6)).slice(0, 1500)); }
    await o.p.evaluate(() => window.__game.boardWin.close()); await sleep(400);
    await o.p.evaluate(() => document.querySelector('.mc-bchestbtn')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))); await sleep(1500);
    const L = await o.p.evaluate(() => [...document.querySelectorAll('.mc-bchest [data-id], .mc-bchest .bc-row, .mc-bchest li')].map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)));
    t('iphone13: после сдачи в 🎁 сундук ранга + 4 сундука награды', L.length >= 5, L);
    await shot(o.p, 'iphone13-11f-chests-after-claim');
    t('без ошибок страницы', !o.p.errs.length && !p.errs.length, [...o.p.errs, ...p.errs].slice(0, 3));
    await o.ctx.close(); }
  await b.close();
  d1(`DELETE FROM game_overrides WHERE kind = 'btask' AND id = '${TASK}'`); d1(`UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides'`); // локальная правка — убрать
  console.log(`chest-reward-admin: ${ok} ok, ${bad} fail`); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL exception', String(e).slice(0, 500)); process.exit(1); });
