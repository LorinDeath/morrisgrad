// LOCAL ONLY: админка «🎨 Интерфейс» — глитч/порог аватара/выключатель темы применяются сразу и переживают перезагрузку.
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
  ok(await gl() === '1' && await p.evaluate(() => document.documentElement.classList.contains('mc-ui')), 'вернули исходное');
  console.log(fails ? `FAILED ${fails}` : 'ui-admin ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
