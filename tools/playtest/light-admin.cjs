// LOCAL ONLY: админка «💡 Свет» — значения применяются сразу (meta_state.light → engine/pixColor.js), переживают перезагрузку, сброс.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.LF_BASE || 'http://127.0.0.1:5321/game.html', WS = process.env.LF_WS || 'ws://127.0.0.1:8921', WR = process.env.LF_WR || '/workspace/mc-harness-light/wr';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/light-fix';
assertLocalUrl(BASE); assertLocalUrl(WS);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const cp = require('child_process'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = (sql) => cp.execSync(`cd ${__dirname}/../../server && CI=1 nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "${sql}"`, { stdio: 'ignore' });
(async () => {
  const uid = 'lfadm_' + Date.now().toString(36);
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${uid}','admin','local-test',0)`);
  const reset = () => d1("DELETE FROM game_overrides WHERE kind='light'"); reset(); process.on('exit', () => { try { reset(); } catch {} });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const boot = async () => { await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(3000); };
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await boot();
  const L = () => p.evaluate(() => window.__game.debug.light());
  const open = async () => {
    for (let i = 0; i < 10 && !(await p.$('.mc-admin section [data-p="pool"]')); i++) {
      if (!(await p.evaluate(() => document.querySelectorAll('.mc-admin [data-tab]').length))) await p.evaluate(() => window.__game.debug.openAdmin());
      await sleep(1500); await p.evaluate(() => document.querySelector('.mc-admin [data-tab="light"]')?.click()); await sleep(800);
      await p.evaluate(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside li, .mc-admin aside button')].find((e) => /main|Свет/.test(e.textContent)); r?.click(); }); await sleep(800);
    }
    return !!(await p.$('.mc-admin section [data-p="pool"]'));
  };
  const save = async (vals) => { await p.evaluate((vals) => { for (const [k, v] of Object.entries(vals)) { const i = document.querySelector(`.mc-admin section [data-p="${k}"]`); if (i.type === 'checkbox') i.checked = !!v; else i.value = v; } document.querySelector('.mc-admin section [data-save]').click(); }, vals); await sleep(2500); };
  const l0 = await L(); ok(l0.ground === 0.84 && l0.pool === 1 && l0.haloBehind === true, 'по умолчанию: ' + JSON.stringify(l0));
  ok(await open(), 'вкладка «💡 Свет» открывается');
  await p.screenshot({ path: `${OUT}/admin-light-tab.png` });
  await save({ pool: '1.6', ground: '0.95', haloBehind: false });
  const l1 = await L(); ok(l1.pool === 1.6 && l1.ground === 0.95 && l1.haloBehind === false, 'правка применяется сразу: ' + JSON.stringify(l1));
  await p.reload(); await boot(); const l2 = await L(); ok(l2.pool === 1.6 && l2.ground === 0.95 && l2.haloBehind === false, 'после перезагрузки — из D1');
  await open(); await save({ pool: '1', ground: '0.84', haloBehind: true });
  const l3 = await L(); ok(l3.pool === 1 && l3.ground === 0.84 && l3.haloBehind === true, 'вернули исходное');
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `FAILED ${fails}` : 'light-admin ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
