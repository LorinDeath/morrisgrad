// LOCAL: чёрная магия, этап А — вкладка «Артефакты» (глушение обычных/раскрытие чёрных), блок слотов, навыки артефакта,
// Библиотека «🔥 Навыки артефактов», огненная заглушка у руки, заряд, админка «Пересчитать все».
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-a';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5411/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8411';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-bma/wr';
const VIDEO = process.env.VIDEO || '';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-black-a/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); };
const ADMIN = 'qa_bma_' + Date.now().toString(36);
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const marks = []; globalThis.__T0 = Date.now();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; const fr = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_result/.test(s)) fr.push(s.slice(0, 300)); }));
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n, o = {}) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(300); await p.screenshot({ path: `${OUT}/${n}.png`, ...o }); console.log('shot', `${OUT}/${n}.png`); marks.push([n, +((Date.now() - globalThis.__T0) / 1000).toFixed(3)]); };
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400); if (process.env.DAY || VIDEO) { const dn = await G((h) => { try { return window.__game.dn?.({ pin: h }) || null; } catch (e) { return String(e); } }, process.env.DAY || '12:00'); console.log('  day pin', JSON.stringify(dn)?.slice(0, 160)); await sleep(600); } // светлый день для записи (только локально в клиенте)
  const S = () => G(() => { const s = window.__game.debug.metaSt(); return s && { inv: s.account.inv.map((i) => ({ id: i.id, uid: i.uid })), equip: s.hero?.equip, eff: s.hero?.effective && { art: s.hero.effective.art, bm: s.hero.effective.bm, crit: s.hero.effective.critPct, spd: s.hero.effective.speedPct, hp: s.hero.effective.maxHp }, bma: s.bma, artAb: s.hero?.artAbilities, inHand: s.hero?.artInHand, loadout: s.hero?.loadout }; });
  // обычное снаряжение — надеть
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands', 'dew_slime_weapon']) { await G((i) => window.__game.debug.send({ type: 'dev_grant', item: i }), id); await sleep(250); }
  await sleep(800);
  let s = await S();
  for (const it of s.inv.filter((i) => i.id.startsWith('dew_slime_'))) { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), it.uid); await sleep(250); }
  await sleep(800); const before = await S();
  t('обычное снаряжение надето', Object.keys(before.equip || {}).length >= 5, before.equip);
  // тестовые артефакты (админ): ближний и дальний
  await G(() => window.__game.debug.send({ type: 'bm_test_artifact', ranged: false })); await sleep(1300);
  await G(() => window.__game.debug.send({ type: 'bm_test_artifact', ranged: true })); await sleep(1300);
  s = await S(); const arts = s.inv.filter((i) => i.id.startsWith('art_'));
  t('2 тестовых артефакта в сумке', arts.length === 2, arts);
  t('bma в снимке (лимит 30)', s.bma?.maxArtifacts === 30 && s.bma.have === 2, s.bma);
  await G(() => window.__game.debug.openBook('artifacts')); await sleep(1500);
  const tab = await G(() => ({ cards: document.querySelectorAll('.bm-card').length, sup: document.querySelectorAll('.bm-sup .bm-row').length, unl: document.querySelectorAll('.bm-unl .bm-row').length, test: document.querySelectorAll('[data-act="bmtest"]').length, txt: document.querySelector('.bm-cnt')?.textContent }));
  t('вкладка «Артефакты»: карточки, глушение, раскрытие, кнопки теста', tab.cards === 2 && tab.sup >= 4 && tab.unl === 7 && tab.test === 2, tab);
  const tab2 = await G(() => ({ sk: document.querySelectorAll('.bm-wrap .bm-skill').length, link: !!document.querySelector('.bm-sklink [data-act="codexart"]'), force: [...document.querySelectorAll('.bm-unl .bm-row')].find((r) => r.textContent.includes('Сила атаки'))?.textContent }));
  t('«Артефакты»: навыков списком нет — только ссылка на Кодекс; «Сила атаки +N%»', tab2.sk === 0 && tab2.link && /\+\d+%/.test(tab2.force || ''), tab2);
  await sleep(200); await shot('01-artifacts-tab-anim-start');
  await sleep(1800); await shot('02-artifacts-tab-preview');
  // ссылка → Кодекс навыков, раздел «Навыки артефактов»
  await G(() => document.querySelector('.bm-sklink [data-act="codexart"]')?.click()); await sleep(1500);
  const cx = await G(() => ({ tab: !!document.querySelector('[data-act="cfilter"][data-v="artifact"].gold'), n: document.querySelectorAll('.mc-rs-grid .mc-rskill').length, f: document.querySelectorAll('.mc-rs-grid .bmf').length, open: document.querySelectorAll('.mc-rs-grid .mc-rskill.locked').length }));
  t('Кодекс навыков → «🔥 Навыки артефактов»: 5 открытых карточек с формулой', cx.tab && cx.n === 5 && cx.f === 5 && cx.open === 0, cx);
  await shot('10-codex-artifact-skills');
  await G(() => window.__game.debug.openBook('artifacts')); await sleep(800);
  // взять в руку
  await G(() => document.querySelector('[data-act="equip"]')?.click()); await sleep(1500);
  const inHand = await S();
  t('артефакт в руке: eff.art + чёрные статы', !!inHand.eff?.art && inHand.eff.bm?.bdmg > 0, inHand.eff);
  t('снаряжение заглушено (крит/скорость не от предметов)', inHand.eff.crit < before.eff.crit, { before: before.eff.crit, after: inHand.eff.crit });
  t('5 навыков артефакта доступны', (inHand.artAb || []).length === 5, inHand.artAb);
  await sleep(1800); await shot('03-artifacts-in-hand');
  // слот заблокирован
  fr.length = 0; await G(() => window.__game.debug.send({ type: 'unequip', slot: 'helmet' })); await sleep(800);
  t('слоты кроме оружия заблокированы', fr.some((x) => x.includes('остальные слоты заблокированы')), fr);
  // навыки → поставить артефактный навык
  await G(() => window.__game.debug.openBook('skills')); await sleep(800);
  const sk = await G(() => ({ h: [...document.querySelectorAll('h3')].some((h) => h.textContent.includes('Навыки артефакта')), n: document.querySelectorAll('.mc-abil').length }));
  t('«Навыки» → секция «Навыки артефакта»', sk.h, sk);
  await G(() => { const id = window.__game.debug.metaSt().hero.artAbilities[1]; document.querySelector(`[data-act="slot"][data-v="${id}|0"]`)?.click(); }); await sleep(1000);
  const lo = await S(); t('артефактный навык в слоте Q', String(lo.loadout?.[0] || '').startsWith('bmf_'), lo.loadout);
  await G(() => [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('Навыки артефакта'))?.scrollIntoView({ block: 'start' })); await sleep(400);
  await shot('04-skills-artifact-section');
  // Библиотека → «Навыки артефактов»
  await G(() => window.__game.debug.openBook('library')); await sleep(1500);
  await G(() => document.querySelector('[data-act="lfilter"][data-v="bmskills"]')?.click()); await sleep(800);
  const lib = await G(() => document.querySelectorAll('.bm-skill').length);
  t('Библиотека: 5 навыков артефактов', lib === 5, lib);
  await shot('05-library-artifact-skills');
  // заглушка у руки + заряд
  await G(() => window.__game.debug.openBook?.(null)); await G(() => document.querySelector('.mc-book [data-x], .mc-book .close')?.click()); await p.keyboard.press('Escape'); await sleep(1000);
  const hand = await G(() => { const e = document.querySelector('.bm-hand'); return e && { vis: e.style.display !== 'none', txt: e.textContent, x: e.style.left, y: e.style.top }; });
  t('огненная заглушка «ЗАГЛУШКА» у руки героя', hand?.vis && hand.txt.includes('ЗАГЛУШКА'), hand);
  await shot('06-hand-placeholder');
  { const r = await G(() => { const e = document.querySelector('.bm-hand'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top }; }); await shot('07-hand-placeholder-zoom', { clip: { x: Math.max(0, r.x - 150), y: Math.max(0, r.y - 150), width: 300, height: 300 } }); }
  // заряд: зажать ЛКМ ~1.2 с
  const vp = p.viewportSize(); await p.mouse.move(vp.width / 2 + 260, vp.height / 2 + 120); await p.mouse.down(); await sleep(300);
  console.log('diag', JSON.stringify(await G(() => ({ aim: window.__game.debug.aim(), el: document.elementFromPoint(innerWidth / 2 + 260, innerHeight / 2 + 120)?.tagName, book: document.querySelector('.mc-book')?.offsetParent != null }))));
  await sleep(600);
  const chg = await G(() => { const e = document.querySelector('.bm-hand'); return { chg: e?.classList.contains('chg'), full: e?.classList.contains('full') }; }); t('зажатая атака — заряд идёт, ещё не полный', chg.chg && !chg.full, chg);
  await shot('08-charging'); await sleep(1400);
  const full = await G(() => document.querySelector('.bm-hand')?.classList.contains('full')); t('заряд полный через «Скорость заряда» (1.6 с)', !!full, full);
  await shot('08b-charge-full'); await p.mouse.up(); await sleep(600);
  // админка: «Пересчитать все»
  await p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
  await p.waitForFunction(() => { if (document.querySelector('[data-bmrecalc]')) return true; const li = document.querySelector('.mc-admin aside li[data-id]'); if (li && document.querySelector('.mc-admin [data-tab="bmagic"].on, .mc-admin [data-tab="bmagic"].active')) li.click(); else document.querySelector('.mc-admin [data-tab="bmagic"]')?.click(); return false; }, null, { timeout: 20000, polling: 1000 }).catch(() => {});
  const rb = await G(() => !!document.querySelector('[data-bmrecalc]'));
  fr.length = 0; await G(() => document.querySelector('[data-bmrecalc]')?.click()); await sleep(1500);
  t('админка: «Пересчитать все артефакты»', rb && fr.some((x) => x.includes('bm_recalc')), { rb, fr: fr.slice(0, 3) });
  await shot('09-admin-recalc');
  if (VIDEO) { // только для видео: бой артефактом в Аринаре днём — заряд + криты (числа ✦ на мобах)
    const T0 = globalThis.__T0 || Date.now(); const mk = (n) => { marks.push([n, +((Date.now() - T0) / 1000).toFixed(3)]); };
    await G(() => { try { window.__game.debug.closeAdmin(); } catch {} }); await sleep(500);
    for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
    await G(() => window.__game.dn?.({ pin: '12:00' })); let tgt = null;
    for (const [dx, dy] of [[0, 0], [3000, 0], [-3000, 0], [0, 3000], [0, -3000], [6000, 0], [0, 6000]]) {
      await G(([x, y]) => window.__game.debug.tp(x, y, true), [24000 + dx, 24150 + dy]); await sleep(2500);
      const ms = await G(() => { const me = window.__game.state().player || {}; return { me, ms: window.__game.debug.zoneMobsFull().filter((m) => m.hp > 0 && !m.boss) }; });
      if (ms.ms.length) { const me = ms.me; ms.ms.sort((a, b) => Math.hypot(a.x - (me.x || 0), a.y - (me.y || 0)) - Math.hypot(b.x - (me.x || 0), b.y - (me.y || 0))); tgt = ms.ms[0]; break; } }
    console.log('crit target', JSON.stringify(tgt));
    if (tgt) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [Math.round(tgt.x - 70), Math.round(tgt.y)]); await sleep(1200); mk('fight');
      for (let i = 0; i < 7; i++) { const t2 = await G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id) || window.__game.debug.zoneMobsFull().filter((m) => m.hp > 0 && !m.boss)[0], tgt.id); if (t2 && t2.id !== tgt.id) { tgt = t2; await G(([x, y]) => window.__game.debug.tp(x, y, true), [Math.round(tgt.x - 70), Math.round(tgt.y)]); await sleep(500); }
        await p.mouse.move(vp.width / 2 + 110, vp.height / 2); await p.mouse.down(); await sleep(1750); await p.mouse.up(); await sleep(450); if (i === 3) await shot('11-crit-fight'); }
      mk('fightEnd'); }
    await sleep(800); }
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  try { require('fs').writeFileSync(require('path').join(OUT, 'marks.json'), JSON.stringify(marks)); } catch {}
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
