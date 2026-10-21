// LOCAL ONLY: админка «🎨 Интерфейс» — глитч/порог аватара/выключатель темы применяются сразу и переживают перезагрузку.
// + новые настройки ветки (HUD в поле, атмосфера, звуки, окна, экран загрузки, текстуры по умолчанию): сразу, после
// перезагрузки (D1), вне диапазона — отказ сервера, «↺ Вернуть исходное» — значения из кода. Скриншоты вкладки: ADM_OUT.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911', WR = process.env.UI_WR || '/workspace/mc-harness-ui/wr';
assertLocalUrl(BASE); assertLocalUrl(WS);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const cp = require('child_process'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const uid = 'uiadm_' + Date.now().toString(36);
  cp.execSync(`cd ${__dirname}/../../server && CI=1 nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${uid}','admin','local-test',0)"`, { stdio: 'ignore' });
  // локальная D1 харнесса: убрать оставшийся от прерванного прогона оверрайд ui (только --local)
  const resetUi = () => cp.execSync(`cd ${__dirname}/../../server && CI=1 nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "DELETE FROM game_overrides WHERE kind='ui'"`, { stdio: 'ignore' });
  resetUi(); process.on('exit', () => { try { resetUi(); } catch {} });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const rx = [];
  p.on('websocket', (ws) => { ws.on('framereceived', (f) => { const s = String(f.payload); if (/admin_result|"ui":/.test(s)) { const m = s.match(/"ui":\{[^}]*\}/); rx.push((s.match(/"type":"\w+"/) || [''])[0] + ' ' + (m ? m[0] : s.slice(0, 160))); } }); ws.on('framesent', (f) => { const s = String(f.payload); if (/admin/.test(s)) rx.push('SENT ' + s.slice(0, 200)); }); });
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(3000);
  const openUi = async () => {
    for (let i = 0; i < 10 && !(await p.$('.mc-admin section [data-p="on"]')); i++) {
      if (!(await p.evaluate(() => document.querySelectorAll('.mc-admin [data-tab]').length))) await p.evaluate(() => window.__game.debug.openAdmin());
      await sleep(1500); await p.evaluate(() => document.querySelector('.mc-admin [data-tab="ui"]')?.click()); await sleep(800);
      await p.evaluate(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside li, .mc-admin aside button')].find((e) => /main/.test(e.textContent)); r?.click(); }); await sleep(800);
    }
    if (!(await p.$('.mc-admin section [data-p="on"]'))) { await p.screenshot({ path: '/tmp/ui-admin-fail.png' }); console.log('admin state', JSON.stringify(await p.evaluate(() => window.__game.debug.admin())), await p.evaluate(() => document.querySelector('.mc-admin aside')?.innerText.slice(0, 200))); } };
  const setSave = async (k, v) => { await p.evaluate(([k, v]) => { const i = document.querySelector(`.mc-admin section [data-p="${k}"]`); i.value = v; }, [k, v]); await p.evaluate(() => document.querySelector('.mc-admin section [data-save]').click()); await sleep(3000); };
  const gl = () => p.evaluate(() => document.documentElement.dataset.uiGlitch);
  await openUi(); ok(await gl() === '1', 'по умолчанию глитч 1');
  await setSave('glitch', '2'); ok(await gl() === '2', 'админка «Интерфейс»: глитч 2 применяется сразу (meta_state)');
  await setSave('avatarCursedAt', '90'); 
  await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(3000);
  ok(await gl() === '2', 'после перезагрузки — из D1');
  await openUi();
  await p.evaluate(() => { document.querySelector('.mc-admin section [data-p="on"]').checked = false; document.querySelector('.mc-admin section [data-save]').click(); }); await sleep(3000);
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('mc-ui'))), 'выключатель «Новый стиль» — у всех прежний вид');
  await p.evaluate(() => { document.querySelector('.mc-admin section [data-p="on"]').checked = true; document.querySelector('.mc-admin section [data-save]').click(); }); await sleep(3000);
  await setSave('glitch', '1'); await setSave('avatarCursedAt', '25');
  // ——— новые настройки ———
  const ADM = process.env.ADM_OUT || '/workspace/morrisgrad-round3/ui-rework/admin'; require('fs').mkdirSync(ADM, { recursive: true });
  p.on('dialog', (d) => d.accept().catch(() => {}));
  const shots = async (tag) => { // вся секция по заголовкам (длинная — прокручиваем)
    const hs = await p.evaluate(() => [...document.querySelectorAll('.mc-admin section .hdr, .mc-admin section h4, .mc-admin section [data-hdr]')].length);
    const n = await p.evaluate(() => { const sec = document.querySelector('.mc-admin section'); return Math.ceil(sec.scrollHeight / Math.max(1, sec.clientHeight)); });
    for (let i = 0; i < Math.min(8, n); i++) { await p.evaluate((i) => { const sec = document.querySelector('.mc-admin section'); sec.scrollTop = i * sec.clientHeight * 0.9; }, i); await sleep(250); await p.screenshot({ path: `${ADM}/ui-${tag}-${i + 1}.png` }); }
    await p.evaluate(() => { document.querySelector('.mc-admin section').scrollTop = 0; }); return hs; };
  await openUi(); await shots('defaults');
  const labels = await p.evaluate(() => [...document.querySelectorAll('.mc-admin section [data-p]')].map((i) => i.dataset.p));
  const NEWF = ['mmX', 'mmY', 'mmZoom', 'mmRound', 'tgtSide', 'tgtTop', 'tgtHide', 'atmo', 'vig', 'grade', 'parts', 'atmoMobile', 'partsMobile', 'loc.hub.vig', 'loc.ice.grade', 'loc.air.parts', 'loc.arinar.vig', 'sfx', 'sfxVol', 'trans', 'transMs', 'loadScreen', 'texPc', 'texMobile', 'hudIngame', 'hudOldDefault', 'mmSize'];
  const miss = NEWF.filter((f) => !labels.includes(f)); ok(!miss.length, `в админке есть все новые поля (${NEWF.length})${miss.length ? ': нет ' + miss.join(', ') : ''}`);
  const ru = await p.evaluate(() => [...document.querySelectorAll('.mc-admin section [data-p]')].map((i) => (i.closest('label, tr, .row, div')?.textContent || '').trim()).filter((t) => !/[а-яё]/i.test(t)));
  ok(!ru.length, `подписи полей по-русски${ru.length ? ': ' + ru.slice(0, 3).join(' | ') : ''}`);
  const setMany = async (o) => { await p.evaluate((o) => { for (const [k, v] of Object.entries(o)) { const i = document.querySelector(`.mc-admin section [data-p="${k}"]`); if (!i) continue; if (i.type === 'checkbox') i.checked = !!v; else i.value = String(v); } document.querySelector('.mc-admin section [data-save]').click(); }, o); await sleep(3500); };
  const SET = { mmSize: 200, mmX: 40, mmY: 30, mmZoom: 2, mmRound: false, tgtSide: 'right', tgtTop: 150, tgtHide: 5, vig: 80, grade: 60, parts: 90, atmoMobile: 20, partsMobile: 30, 'loc.hub.vig': 150, 'loc.hub.parts': 50, sfxVol: 70, transMs: 300, loadScreen: false, texPc: '16', texMobile: '32' };
  await setMany(SET);
  const live = () => p.evaluate(() => { const r = document.documentElement, cs = getComputedStyle(r), L = (c) => document.querySelector('.mc-atmo-ui.' + c);
    return { mm: cs.getPropertyValue('--ig-mm').trim(), x: cs.getPropertyValue('--ig-mm-x').trim(), y: cs.getPropertyValue('--ig-mm-y').trim(), tt: cs.getPropertyValue('--ig-tgt-top').trim(), sq: r.classList.contains('mc-ig-sq'), side: r.dataset.igTgt,
      tr: cs.getPropertyValue('--mc-tr').trim(), zoom: document.getElementById('mm-zoom-text')?.textContent, load: localStorage.getItem('mc_ui_load'), tex: localStorage.getItem('mc_tex_def'),
      vig: L('vig') ? +getComputedStyle(L('vig')).opacity : -1, tone: L('tone') ? +getComputedStyle(L('tone')).opacity : -1 }; });
  await sleep(1600); // переход тона/виньетки 1.4 с
  let v = await live();
  const want = (v) => v.mm === '200px' && v.x === '40px' && v.y === '30px' && v.tt === '150px' && v.sq && v.side === 'right' && v.tr === '300ms';
  ok(want(v), `HUD сразу: мини-карта ${v.mm}, отступы ${v.x}/${v.y}, квадратная ${v.sq}, «Цель» ${v.side} ${v.tt}, переход окна ${v.tr}`);
  ok(v.zoom === '2x', `зум мини-карты по умолчанию → ${v.zoom}`);
  ok(Math.abs(v.vig - 1) < 0.02 && Math.abs(v.tone - 0.36) < 0.02, `атмосфера сразу (Поляна: виньетка 80%×150% → ${v.vig.toFixed(2)}, тон 60% → ${v.tone.toFixed(2)})`);
  ok(v.load === '0' && v.tex === JSON.stringify({ pc: '16', mob: '32' }), `экран загрузки выкл и текстуры по умолчанию запомнены на следующую загрузку (${v.load}, ${v.tex})`);
  await p.screenshot({ path: `${ADM}/live-after-save.png` });
  // звуки: громкость по умолчанию видна в Настройках у игрока без своего выбора
  await p.evaluate(() => { localStorage.removeItem('mc_ui_sfx'); localStorage.removeItem('mc_tex'); document.querySelector('.mc-admin')?.querySelector('[data-close], .x, .mc-adm-x')?.click(); });
  // вне диапазона — сервер отказывает, значение не меняется
  await openUi(); await setMany({ mmSize: 999 });
  const msg = await p.evaluate(() => document.querySelector('.mc-admin')?.innerText.match(/Диаметр[^\n]*120…240|120…240/)?.[0] || '');
  v = await live(); ok(v.mm === '200px' && !!msg, `вне диапазона (999) — отказ «${msg}», мини-карта осталась ${v.mm}`);
  await setMany({ mmSize: 200, 'loc.ice.vig': 500 }); const msg2 = await p.evaluate(() => /лёд: виньетка[^\n]*0…200/.test(document.querySelector('.mc-admin')?.innerText || '')); await setMany({ 'loc.ice.vig': 100 }); ok(msg2, 'сила локации 500% — отказ (0…200)');
  // перезагрузка: из D1
  await p.reload(); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(3500);
  v = await live(); ok(want(v) && v.zoom === '2x', `после перезагрузки — из D1 (${v.mm}, ${v.side}, ${v.tr}, зум ${v.zoom})`);
  const tex = await p.evaluate(() => window.__game.debug.tex?.().mode); ok(tex === '16', `ПК без своего выбора — текстуры по умолчанию из админки: ${tex}`);
  const ld = await p.evaluate(() => !!document.querySelector('.mc-load')); ok(!ld, 'экран загрузки выключен — нового экрана нет');
  await p.keyboard.press('Escape'); await sleep(400); for (let i = 0; i < 3 && !(await p.$('[data-sfx]')); i++) { await p.click('.mc-setbtn').catch(() => {}); await sleep(1000); }
  const sv = await p.evaluate(() => document.querySelector('[data-sfx]')?.value); ok(sv === '70', `Настройки: громкость звуков по умолчанию из админки — ${sv}%`);
  await p.keyboard.press('Escape'); await sleep(500);
  await openUi(); await shots('edited');
  // «↺ Вернуть исходное» — значения из кода
  await p.evaluate(() => document.querySelector('.mc-admin section [data-reset]').click()); await sleep(3500); await sleep(1600);
  v = await live(); ok(v.mm === '176px' && v.x === '10px' && v.y === '10px' && v.tt === '100px' && !v.sq && v.side === 'left' && v.tr === '160ms' && v.load === '1' && v.tex === JSON.stringify({ pc: '32', mob: '16' }),
    `«Вернуть исходное»: ${v.mm}, ${v.x}/${v.y}, квадратная ${v.sq}, «Цель» ${v.side} ${v.tt}, переход ${v.tr}, загрузка ${v.load}, текстуры ${v.tex}`);
  ok(Math.abs(v.vig - 0.45) < 0.02 && Math.abs(v.tone - 0.18) < 0.02, `атмосфера по умолчанию (${v.vig.toFixed(2)}, ${v.tone.toFixed(2)})`);
  await p.evaluate(() => { localStorage.removeItem('mc_tex_def'); localStorage.removeItem('mc_ui_load'); });
  await openUi(); await setMany({ glitch: 1 });
  ok(await gl() === '1' && await p.evaluate(() => document.documentElement.classList.contains('mc-ui')), 'вернули исходное');
  console.log(fails ? `FAILED ${fails}` : 'ui-admin ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
