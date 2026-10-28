// LOCAL: админка квестов — подсказки, сундук квеста + улучшение, сюжетный квест с карточкой главы и выбором (черновик → публикация),
// ежедневный квест после ветки у того же NPC; игрок: карточка (ПК + телефон), выбор, окно с сундуком, NPC предлагает ежедневный.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/admin-quests-shots';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5397/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8997';
const PERSIST = process.env.PERSIST || '/workspace/mg-admin-quests/.wr';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-admin-quests/server && ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 600)); };
const stamp = Date.now().toString(36), ADMIN = 'qa_aq_admin_' + stamp, SQ = 'c_aqs_' + stamp, DQ = 'c_aqd_' + stamp;
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
async function open(b, uid, mob, cls = 'warrior') {
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA_IOS } : { viewport: { width: 1440, height: 860 } });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); p.errs = []; p.fr = []; p.on('pageerror', (e) => p.errs.push(String(e.stack || e).slice(0, 500)));
  p.on('dialog', (d) => d.accept());
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_result|"err|quest/.test(s)) p.fr.push(s.slice(0, 500)); }));
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await sleep(2500); await p.evaluate(() => window.__game.board?.tut?.('skip')); await sleep(400);
  return { ctx, p, G: (f, a) => p.evaluate(f, a) };
}
const clean = (p) => p.evaluate(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove()));
const shot = async (p, n, o = {}) => { await clean(p); await sleep(250); await p.screenshot({ path: `${OUT}/${n}.png`, ...o }); console.log('shot', n); };
const crop = async (p, n, sel, pad = 8) => { const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, sel); if (!r) return t('crop ' + sel, false);
  await sleep(200); const vp = p.viewportSize(); const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad); await shot(p, n, { clip: { x, y, width: Math.min(vp.width - x, r.w + pad * 2), height: Math.min(vp.height - y, r.h + pad * 2) } }); };
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(b, ADMIN, false); const { p: AP, G } = A; global.AP = AP;
  await AP.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 60000, polling: 2000 });
  // 1) обзор: «Сундуки наград» — разделы, поиск, подсказки
  await G(() => document.querySelector('.mc-admin [data-tab="bchest"]').click()); await sleep(900);
  await AP.waitForFunction(() => { if (document.querySelector('.mc-admin small.fh')) return true; document.querySelector('.mc-admin [data-tab="bchest"]')?.click(); document.querySelector('.mc-admin aside li')?.click(); return false; }, null, { timeout: 30000, polling: 1500 }); await sleep(600);
  const nh = await G(() => ({ hints: document.querySelectorAll('.mc-admin small.fh').length, secs: document.querySelectorAll('.mc-admin [data-hs]').length, find: !!document.querySelector('.mc-admin [data-ffind]') }));
  t('админка: подсказки у полей, разделы, поиск', nh.hints > 10 && nh.secs > 2 && nh.find, nh);
  await shot(AP, '01-admin-overview');
  await crop(AP, '02-field-hint', '.mc-admin label.fl:has(small.fh)');
  // поиск «улучш» → только поля улучшения яруса
  await G(() => { const i = document.querySelector('.mc-admin [data-ffind]'); i.value = 'улучшение'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(500);
  const cnt = await G(() => document.querySelector('.mc-admin [data-fcnt]')?.textContent || '');
  t('поиск по полям', /\d/.test(cnt), cnt);
  await G(() => document.querySelector('.mc-admin [data-fs*="тип" i], .mc-admin label.fl:not([hidden]):not([style*="none"])')?.scrollIntoView({ block: 'start' })); await sleep(300);
  await shot(AP, '03a-qdef-defaults-search');
  await G(() => { const i = document.querySelector('.mc-admin [data-ffind]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
  const openAll = async () => { await G(() => document.querySelectorAll('.mc-admin details.qsec').forEach((d) => { if (!d.open) { d.open = true; d.dispatchEvent(new Event('toggle')); } })); await sleep(150); };
  // 2) новый сюжетный квест
  await G(() => document.querySelector('.mc-admin [data-tab="quest"]').click()); await sleep(700);
  await AP.click('.mc-admin aside li[data-id="__new"]'); await sleep(600);
  await AP.fill('.mc-admin [data-q="id"]', SQ); await AP.fill('.mc-admin [data-q="title"]', 'Пленник у кузни');
  await AP.selectOption('.mc-admin [data-q="npc"]', 'petr'); await sleep(300); await openAll();
  await AP.fill('.mc-admin [data-q="chapter"]', 'Глава 1: Пленник'); await AP.check('.mc-admin [data-q="cardOn"]');
  await AP.fill('.mc-admin [data-q="cardT"]', 'Глава первая'); await AP.fill('.mc-admin [data-q="cardS"]', 'Пленник у кузни');
  await AP.selectOption('.mc-admin [data-oi="0"] [data-ot]', 'collect'); await sleep(300);
  await AP.selectOption('.mc-admin [data-oi="0"] [data-or]', 'moonpetal'); await AP.fill('.mc-admin [data-oi="0"] [data-ocnt]', '1');
  await AP.fill('.mc-admin [data-q="xp"]', '150');
  const setWin = async (sel, who, emo, text) => { await AP.selectOption(`${sel} [data-wwho]`, who); await sleep(100); await AP.click(`${sel} [data-pick="${emo}"]`).catch(() => {}); await sleep(100); await AP.fill(`${sel} [data-wtext]`, text); };
  const OW = (i) => `.mc-admin [data-ph="offer"][data-wi="${i}"]`;
  await AP.click('.mc-admin [data-wadd="offer"]'); await sleep(150); await setWin(OW(0), 'petr', 'think', 'У кузни сидит связанный бродяга. Говорит, что он не вор — просто голодал.');
  await AP.click('.mc-admin [data-wadd="offer"]'); await sleep(150); await setWin(OW(1), 'petr', 'determined', 'Решай ты, Проклятый. Отпустим — или сдадим страже?');
  await AP.click(`${OW(1)} [data-vchadd]`); await sleep(250);
  await AP.fill(`${OW(1)} [data-vct="0"]`, 'Отпустить его'); await AP.fill(`${OW(1)} [data-vcg="0"]`, 'spare'); await AP.fill(`${OW(1)} [data-vck="0"]`, 'spare');
  await AP.fill(`${OW(1)} [data-vct="1"]`, 'Сдать страже'); await AP.fill(`${OW(1)} [data-vcg="1"]`, 'guard'); await AP.fill(`${OW(1)} [data-vck="1"]`, 'guard');
  await AP.dispatchEvent(`${OW(1)} [data-vck="1"]`, 'change'); await sleep(300);
  await AP.click('.mc-admin [data-wadd="offer"]'); await sleep(150); await setWin(OW(2), 'petr', 'joy', 'Добро. Он обещал помогать мне в кузне — заходи потом, будет работа.');
  await AP.fill(`${OW(2)} [data-wid]`, 'spare'); await AP.fill(`${OW(2)} [data-wgo]`, 'end');
  await AP.click('.mc-admin [data-wadd="offer"]'); await sleep(150); await setWin(OW(3), 'petr', 'sad', 'Стража уведёт его. Закон есть закон.');
  await AP.fill(`${OW(3)} [data-wid]`, 'guard'); await AP.dispatchEvent(`${OW(3)} [data-wid]`, 'input');
  await setWin('.mc-admin [data-ph="accept"]', 'petr', 'determined', 'Принеси ночную фиалку — бродяге нужен отвар.');
  await AP.click('.mc-admin [data-wadd="done"]'); await sleep(150); await setWin('.mc-admin [data-ph="done"][data-wi="0"]', 'petr', 'joy', 'Спасибо. Ты сделал правильный выбор.');
  // награда ветки «spare»
  await AP.dispatchEvent(`${OW(1)} [data-vck="0"]`, 'change'); await sleep(400);
  const altRow = await AP.$('.mc-admin [data-qalt] [data-ak="spare"]'); t('редактор: строка награды ветки «spare»', !!altRow);
  if (altRow) { await AP.fill('.mc-admin [data-ak="spare"] [data-af="name"]', 'Милосердие'); await AP.fill('.mc-admin [data-ak="spare"] [data-af="xp"]', '300');
    await AP.selectOption('.mc-admin [data-ak="spare"] [data-af="ct"]', 'rare'); await AP.fill('.mc-admin [data-ak="spare"] [data-af="cu"]', '25'); }
  // сундук квеста: 1 × необычный, +1 ярус 20 %, +2 яруса 5 %
  await AP.click('.mc-admin [data-qch] [data-chadd]'); await sleep(300);
  const setc = async (s, v) => { await G(([s, v]) => { const e = document.querySelector(`.mc-admin [data-qch] [data-ch="${s}"]`); if (!e) throw new Error('нет ' + s); e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, [s, v]); await sleep(200); };
  await setc('0.t', 'uncommon'); await setc('0.u', 20); await setc('0.u2', 5);
  await crop(AP, '03b-quest-chest-upgrade', '.mc-admin details[data-qs="ch"]');
  // сохранить одно окно в черновик (середина работы)
  await AP.click(`${OW(1)} [data-wsave]`);
  await AP.waitForFunction(() => /✔|✖/.test(document.querySelector('.mc-admin [data-dst]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const dst = await G(() => document.querySelector('.mc-admin [data-dst]')?.textContent || ''); t('черновик: окно сохранено', /✔/.test(dst), dst);
  const dr = d1(`SELECT enabled FROM custom_quests WHERE id='draft:${SQ}' OR id='${SQ}'`); t('D1: черновик в custom_quests (enabled 2/3), живого квеста нет', dr.length && dr.every((r) => r.enabled >= 2), dr);
  await G(() => document.querySelector('.mc-admin [data-ph="offer"][data-wi="1"]')?.scrollIntoView({ block: 'center' })); await sleep(300);
  await shot(AP, '04a-story-editor-choice-save');
  await crop(AP, '04b-branch-rewards', '.mc-admin details[data-qs="alt"]');
  await AP.click('.mc-admin [data-dsave]'); await AP.waitForFunction(() => /в\. *\d|✔/.test(document.querySelector('.mc-admin [data-dst]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {}); await sleep(800);
  await AP.click('.mc-admin [data-dpub]'); await sleep(2500);
  const pub = d1(`SELECT enabled, data FROM custom_quests WHERE id='${SQ}' AND enabled=1`); t('публикация: квест живой в D1', pub.length === 1, d1(`SELECT id, enabled FROM custom_quests WHERE id LIKE 'c_aq%'`));
  const pq = pub[0] ? JSON.parse(pub[0].data) : {}; t('опубликовано: карточка, сундук, ветка', pq.card?.on && pq.rewards?.ch?.[0]?.t === 'uncommon' && pq.rewards?.alt?.spare?.xp === 300, { card: pq.card, ch: pq.rewards?.ch, alt: pq.rewards?.alt });
  const dl = d1(`SELECT data FROM quest_dialogues WHERE quest_id='${SQ}'`); t('диалог с выбором записан', dl.length && /"ch":\[/.test(dl[0].data) && /spare/.test(dl[0].data), dl[0]?.data?.slice(0, 300));
  // 3) ежедневный после ветки
  await AP.click('.mc-admin aside li[data-id="__new"]'); await sleep(600);
  await AP.fill('.mc-admin [data-q="id"]', DQ); await AP.fill('.mc-admin [data-q="title"]', 'Подмога в кузне: Мошкара');
  await AP.selectOption('.mc-admin [data-q="npc"]', 'petr'); await sleep(300); await openAll();
  await AP.selectOption('.mc-admin [data-q="repeat"]', 'daily'); await sleep(300); await openAll();
  await AP.selectOption('.mc-admin [data-q="requires"]', [SQ]); await sleep(200);
  await AP.click('.mc-admin [data-rbadd]'); await sleep(400); await openAll();
  await AP.selectOption('.mc-admin [data-rb="0"] [data-rbq]', SQ); await sleep(400);
  await AP.selectOption('.mc-admin [data-rb="0"] [data-rbk]', 'spare').catch((e) => t('ключ ветки в списке', false, String(e).slice(0, 200))); await sleep(200);
  await AP.selectOption('.mc-admin [data-oi="0"] [data-ot]', 'kill'); await sleep(300);
  await AP.selectOption('.mc-admin [data-oi="0"] [data-om]', 'blade_fly').catch(() => {}); await AP.fill('.mc-admin [data-oi="0"] [data-ocnt]', '5');
  await AP.fill('.mc-admin [data-q="xp"]', '80');
  await AP.click('.mc-admin [data-wadd="offer"]'); await sleep(150); await setWin(OW(0), 'petr', 'smirk', 'Бродяга теперь мой подмастерье. А мошкара опять лезет в горн — убей пятерых, а?');
  await setWin('.mc-admin [data-ph="accept"]', 'petr', 'determined', 'Пятеро Мошкар — и приходи за наградой. Завтра будет новая работа.');
  await AP.click('.mc-admin [data-wadd="done"]'); await sleep(150); await setWin('.mc-admin [data-ph="done"][data-wi="0"]', 'petr', 'joy', 'Горн чист. Приходи завтра — мошкара не дремлет.');
  await G(() => document.querySelector('.mc-admin details[data-qs="rep"]')?.scrollIntoView({ block: 'start' })); await sleep(300);
  await shot(AP, '05a-prereq-daily-editor');
  await crop(AP, '05b-prereq-daily-section', '.mc-admin details[data-qs="rep"]');
  await AP.click('.mc-admin [data-qsave]'); await AP.waitForFunction(() => /Сохранено|✖/.test(document.querySelector('.mc-admin .msg')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const m = await G(() => document.querySelector('.mc-admin .msg')?.textContent || ''); t('ежедневный сохранён', /Сохранено/.test(m), m);
  const dd = d1(`SELECT data FROM custom_quests WHERE id='${DQ}' AND enabled=1`); const dq = dd[0] ? JSON.parse(dd[0].data) : {};
  t('D1: repeat daily + reqBranch spare + requires', dq.repeat === 'daily' && dq.reqBranch?.[0]?.k === 'spare' && dq.requires?.includes(SQ), { repeat: dq.repeat, reqBranch: dq.reqBranch, requires: dq.requires });
  // скрыть прочие квесты Петра (остатки прошлых прогонов)
  for (const r of d1(`SELECT id FROM custom_quests WHERE enabled=1 AND id NOT IN ('${SQ}','${DQ}') AND data LIKE '%"npc":"petr"%'`)) { await G((q) => window.__game.debug.rawSend({ type: 'admin_quest_delete', id: q }), r.id); await sleep(500); }
  await G(() => document.querySelector('.mc-admin [data-x]')?.click()); await sleep(300);
  // 4) игрок ПК
  const P = await open(b, 'qa_aq_pl_' + stamp, false, 'mage'); const GP = P.G, PP = P.p;
  await GP(() => window.__game.debug.tp(420, 800)); await sleep(1500);
  const talk = async () => { await GP(() => { const d = window.__game.debug, q = d.npcAt('petr'); if (q) d.tp(q.x + 18, q.y + 6); }); await sleep(900); await GP(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'petr' })); await sleep(1200); };
  const toQuest = async (id) => { if (await PP.$(`.mc-vn`)) return; const all = await PP.$('#npc-all-quests'); if (all) { await all.click(); await sleep(400); await PP.click(`.qa-row[data-q="${id}"]`).catch(() => {}); await sleep(600); } };
  await talk(); await toQuest(SQ);
  await PP.waitForSelector('.mc-chcard', { timeout: 6000 }).catch(() => {}); await sleep(1600);
  t('ПК: карточка главы', !!(await PP.$('.mc-chcard')));
  await shot(PP, '06a-chapter-card-pc');
  if (await PP.$('.mc-chcard')) await PP.click('.mc-chcard .chc-skip', { timeout: 3000 }).catch(() => {}); /* карточка сама закрывается через 3,6 с */ await sleep(900);
  let v = await GP(() => document.querySelector('.mc-vn')?.dataset.vnI); t('после карточки — окна диалога', v !== undefined, v);
  await PP.keyboard.press('Space'); await sleep(500);
  const chs = await GP(() => [...document.querySelectorAll('.mc-vn .vn-ch')].map((b) => b.textContent)); t('окно с выбором (2 варианта)', chs.length === 2, chs);
  await shot(PP, '08-dialog-choice');
  await PP.click('.mc-vn .vn-ch[data-ci="0"]'); await sleep(600);
  const tx = await GP(() => document.querySelector('.mc-vn .vn-box p')?.textContent || ''); t('ветка «Отпустить» → своё окно', /Добро/.test(tx), tx);
  await PP.click('#vn-next'); await sleep(700);
  const rew = await GP(() => document.querySelector('.mc-vn .vn-rew')?.textContent.replace(/\s+/g, ' ') || ''); t('окно получения: сундук + шанс улучшиться', /сундук|Сундук/i.test(rew) && /улучшиться до/.test(rew), rew); t('ветка «Милосердие»: свой сундук (Редкий) сразу после выбора', /Редкий сундук/.test(rew.split('шанс')[0]), rew);
  await shot(PP, '09-quest-window-chest-upgrade');
  await PP.click('#vn-accept'); await sleep(1200);
  // ежедневный пока закрыт
  await talk(); if (await PP.$('#npc-all-quests')) { await PP.click('#npc-all-quests'); await sleep(500); }
  else if (await PP.$('.mc-vn')) { await GP(() => [...document.querySelectorAll('.mc-vn-screen button')].find((x) => /Все квесты/.test(x.textContent))?.click()); await sleep(500); }
  const lk = await GP((id) => document.querySelector(`.qa-row[data-q="${id}"]`)?.textContent || '', DQ); t('ежедневный — «Откроются позже» с причиной', /🔒/.test(lk), lk);
  await shot(PP, '10-daily-locked');
  await GP(() => window.__game.dialog?.close?.()); await PP.keyboard.press('Escape'); await sleep(300);
  await GP(() => window.__game.debug.rawSend({ type: 'dev_grant', res: { moonpetal: 1 } })); await sleep(1200);
  await talk(); await toQuest(SQ); await sleep(400);
  const tb = await PP.$('#vn-turnin'); t('сдача доступна', !!tb); if (tb) { PP.fr.length = 0; await tb.click(); await sleep(2000); }
  console.log('turnin frames', JSON.stringify(PP.fr.filter((s) => /quest|toast/.test(s)).slice(-4)).slice(0, 900));
  await talk(); await toQuest(DQ); await sleep(500);
  const dv = await GP(() => ({ who: document.querySelector('.mc-vn')?.dataset.who, t: document.querySelector('.mc-vn .vn-box p')?.textContent || '', q: document.querySelector('.mc-vn .qt')?.textContent || '' }));
  t('NPC предлагает ежедневный после ветки', /пятерых/.test(dv.t), dv);
  await shot(PP, '11a-npc-offers-daily');
  if (await PP.$('#vn-next')) { await PP.click('#vn-next'); await sleep(600); await shot(PP, '11b-daily-accept-window'); }
  t('ПК: без ошибок страницы', !PP.errs.length && !AP.errs.length, [...PP.errs, ...AP.errs].slice(0, 3));
  await P.ctx.close();
  // 5) телефон: карточка главы
  const M = await open(b, 'qa_aq_mob_' + stamp, true, 'rogue');
  await M.G(() => { const d = window.__game.debug, q = d.npcAt('petr'); if (q) d.tp(q.x + 18, q.y + 6); }); await sleep(1200);
  await M.G(() => window.__game.debug.rawSend({ type: 'npc_talk', npc: 'petr' })); await sleep(1200);
  if (!(await M.p.$('.mc-chcard'))) { const all = await M.p.$('#npc-all-quests'); if (all) { await all.click(); await sleep(400); await M.p.click(`.qa-row[data-q="${SQ}"]`).catch(() => {}); } }
  await M.p.waitForSelector('.mc-chcard', { timeout: 6000 }).catch(() => {}); await sleep(1600);
  t('телефон: карточка главы', !!(await M.p.$('.mc-chcard'))); await shot(M.p, '07-chapter-card-phone');
  await M.p.tap('.mc-chcard .chc-skip').catch(() => {}); await sleep(900); t('телефон: пропуск → диалог', !!(await M.p.$('.mc-vn')));
  await shot(M.p, '07b-phone-after-skip');
  t('телефон: без ошибок', !M.p.errs.length, M.p.errs.slice(0, 3)); await M.ctx.close();
  await A.ctx.close(); await b.close();
  console.log(`admin-quests: ${ok} ok, ${bad} fail`); process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.log('FAIL exception', String(e).slice(0, 800)); if (global.AP) { await global.AP.screenshot({ path: OUT + '/_fail.png' }).catch(() => {}); console.log(JSON.stringify(await global.AP.evaluate(() => ({ a: window.__game.debug.admin(), h: document.querySelector('.mc-admin')?.outerHTML.slice(0, 300) })).catch((x) => String(x))).slice(0, 700), global.AP.errs); } process.exit(1); });
