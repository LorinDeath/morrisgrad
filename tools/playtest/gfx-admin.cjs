// LOCAL ONLY: админка «🖼 Графика» (kind gfx) — живые поля применяются сразу, всё переживает перезагрузку, ограничения, сброс.
// Снимки — OUT (по умолчанию /workspace/morrisgrad-round3/props3/admin).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.LF_BASE || 'http://127.0.0.1:5331/game.html', WS = process.env.LF_WS || 'ws://127.0.0.1:8931', WR = process.env.LF_WR || '/workspace/mc-harness-props/wr';
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/props3/admin';
assertLocalUrl(BASE); assertLocalUrl(WS);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const cp = require('child_process'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = (sql) => cp.execSync(`cd ${__dirname}/../../server && CI=1 nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "${sql}"`, { stdio: 'ignore' });
(async () => {
  const uid = 'gfxadm_' + Date.now().toString(36);
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${uid}','admin','local-test',0)`);
  const reset = () => d1("DELETE FROM game_overrides WHERE kind='gfx'"); reset(); process.on('exit', () => { try { reset(); } catch {} });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('dialog', (d) => d.accept());
  const boot = async () => { await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 180000 }); await sleep(3000); };
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`)); await boot();
  await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2000);
  const P = () => p.evaluate(() => window.__game.debug.props());
  const lantern = () => p.evaluate(() => window.__game.debug.lightSources().find((s) => s.k === 'lantern') || null);
  const open = async () => {
    // роль выдаётся записью в локальную D1 прямо перед входом, а сервер кэширует роли до 60 с (roles.ts) — admin_open может получить
    // «Недостаточно прав» (панель так и висит на «Загрузка данных…»). Только для харнесса: ждём каталог, переоткрываем до 75 с.
    for (let i = 0; i < 25 && !(await p.$('.mc-admin section [data-p="fpsMul"]')); i++) {
      if (i && !(await p.evaluate(() => window.__game.debug.admin().loaded))) { await p.evaluate(() => document.querySelector('.mc-admin [data-x]')?.click()); await sleep(1500); }
      if (!(await p.evaluate(() => document.querySelectorAll('.mc-admin [data-tab]').length))) await p.evaluate(() => window.__game.debug.openAdmin());
      await sleep(1500); await p.evaluate(() => document.querySelector('.mc-admin [data-tab="gfx"]')?.click()); await sleep(800);
      await p.evaluate(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside li, .mc-admin aside button')].find((e) => /main|Графика/.test(e.textContent)); r?.click(); }); await sleep(800);
    }
    return !!(await p.$('.mc-admin section [data-p="fpsMul"]'));
  };
  const close = () => p.evaluate(() => { document.querySelector('.mc-admin [data-close], .mc-admin .close')?.click(); document.querySelector('.mc-admin')?.remove?.(); });
  const save = async (vals) => { await p.evaluate((vals) => { for (const [k, v] of Object.entries(vals)) { const i = document.querySelector(`.mc-admin section [data-p="${k}"]`); if (!i) throw new Error('нет поля ' + k); if (i.type === 'checkbox') i.checked = !!v; else i.value = v; } document.querySelector('.mc-admin section [data-save]').click(); }, vals); await sleep(2500); };
  const s0 = await P(); const g0 = s0.gfx;
  ok(s0.set === 'v3' && g0.fpsMul === 1 && g0.glow === 1 && g0.arena3 === false && g0.pack16 === false && g0.packGlow === true, `по умолчанию (ПК): props3, ×1, арена v2, 5551 только свечение — ${JSON.stringify({ set: s0.set, fpsMul: g0.fpsMul, glow: g0.glow, arena3: g0.arena3, pack16: g0.pack16, packGlow: g0.packGlow })}`);
  const L0 = await lantern(); ok(!!L0, 'фонарь в кадре огней: ' + JSON.stringify(L0));
  if (L0) { await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [L0.px - 60, L0.py - 40]); await p.evaluate(() => window.__game.debug.setZoom(1.3)); await sleep(3000); await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/lantern-default.png` }); }
  ok(await open(), 'вкладка «🖼 Графика» открывается');
  await p.screenshot({ path: `${OUT}/admin-gfx-tab.png` });
  const labels = await p.evaluate(() => [...document.querySelectorAll('.mc-admin section label, .mc-admin section .lbl, .mc-admin section td, .mc-admin section h4')].map((e) => e.textContent.trim()).filter(Boolean));
  ok(labels.length > 20 && labels.filter((t) => /[a-z]{4,}/.test(t.replace(/props3|RGBA|glow|x64|px|v[23]/g, '')) && !/[а-я]/i.test(t)).length === 0, `подписи по-русски (${labels.length} шт.)`);
  await p.evaluate(() => { const s = document.querySelector('.mc-admin section'); s && (s.scrollTop = s.scrollHeight * 0.55); }); await sleep(400); await p.screenshot({ path: `${OUT}/admin-gfx-tab-lights.png` });
  await p.evaluate(() => { const s = document.querySelector('.mc-admin section'); s && (s.scrollTop = s.scrollHeight); }); await sleep(400); await p.screenshot({ path: `${OUT}/admin-gfx-tab-emitters.png` });
  // живые поля
  await save({ fpsMul: '2', glow: '1.5', 'lt.warm.haloS': '2.2', 'lt.warm.haloK': '1.8', 'lt.warm.poolS': '1.6', 'em.v3.lantern.x': '32', 'em.v3.lantern.y': '20', arena3: true, props3Pc: false });
  const s1 = await P(), g1 = s1.gfx;
  ok(g1.fpsMul === 2 && g1.glow === 1.5 && g1.lt.warm.haloS === 2.2 && g1.lt.warm.haloK === 1.8 && g1.lt.warm.poolS === 1.6 && g1.em.v3.lantern.x === 32 && g1.em.v3.lantern.y === 20 && g1.arena3 === true, 'правка применяется сразу: ' + JSON.stringify({ fpsMul: g1.fpsMul, glow: g1.glow, warm: g1.lt.warm, em: g1.em.v3.lantern, arena3: g1.arena3 }));
  ok(s1.set === 'v3' && s1.next?.props3Pc === false, 'props3 ПК выкл — со следующей загрузки (сейчас ещё v3), next=' + JSON.stringify(s1.next));
  await close(); await sleep(500);
  const L1 = await lantern(); ok(L0 && L1 && (Math.abs(L1.ex - L0.ex) > 0.05 || Math.abs(L1.ey - L0.ey) > 0.05), `ручная точка излучения фонаря сдвинула ореол: ${L0 && [L0.ex, L0.ey].map((v) => v.toFixed(2))} → ${L1 && [L1.ex, L1.ey].map((v) => v.toFixed(2))}`);
  if (L0) { for (let i = 0; i < 3; i++) { await p.evaluate(([x, y]) => window.__game.debug.tp(x, y, true), [L0.px - 60, L0.py - 40]); await sleep(1200); } await p.evaluate(() => window.__game.debug.setZoom(1.3)); await sleep(3000); await p.mouse.move(5, 5); const me = await p.evaluate(() => window.__game.state().player); console.log('INFO hero', me.x, me.y); await p.screenshot({ path: `${OUT}/lantern-admin-edited.png` }); }
  // ограничения: вне диапазона — отказ сервера, значение не меняется
  await p.evaluate(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'gfx', id: 'main', patch: { fpsMul: 99, 'lt.fire.haloS': -5 } })); await sleep(2000);
  const g2 = (await P()).gfx; ok(g2.fpsMul === 2 && g2.lt.fire.haloS === 1, `вне диапазона отклонено (fpsMul ${g2.fpsMul}, fire.haloS ${g2.lt.fire.haloS})`);
  // перезагрузка: всё из D1, props3 выкл → props2
  await p.reload(); await boot();
  const s3 = await P(), g3 = s3.gfx;
  ok(s3.set === 'v2' && g3.fpsMul === 2 && g3.glow === 1.5 && g3.lt.warm.haloS === 2.2 && g3.arena3 === true, `после перезагрузки — из D1, набор ${s3.set}`);
  ok(!Object.keys(s3.sheets).some((k) => k.startsWith('v3:')), 'props3 выкл: листы v3 не загружены ' + Object.keys(s3.sheets).join(','));
  await p.screenshot({ path: `${OUT}/hub-props3-off.png` });
  // сброс
  ok(await open(), 'вкладка снова открывается'); await p.evaluate(() => document.querySelector('.mc-admin section [data-reset]').click()); await sleep(2500);
  const g4 = (await P()).gfx; ok(g4.fpsMul === 1 && g4.glow === 1 && g4.lt.warm.haloS === 1 && g4.em.v3.lantern.x === -1 && g4.arena3 === false, '«↺ Вернуть исходное»: значения из кода сразу');
  await p.reload(); await boot(); const s5 = await P(); ok(s5.set === 'v3', 'после сброса и перезагрузки — снова props3');
  await p.screenshot({ path: `${OUT}/hub-after-reset.png` });
  ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `FAILED ${fails}` : 'gfx-admin ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
