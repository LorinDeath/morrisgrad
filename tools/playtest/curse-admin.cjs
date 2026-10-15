// Вкладка «☠ Проклятие» в админке: видит и правит только админ; модератор — нет вкладки и отказ сервера; правка живьём.
// Только localhost. CU_BASE / CU_WS (по умолчанию :5241 / :8789).
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/cursed-items';
const BASE = process.env.CU_BASE || 'http://127.0.0.1:5241/game.html', WS = process.env.CU_WS || 'ws://127.0.0.1:8789';
const ADMIN = 'test_admin_curse', MOD = 'test_mod_curse';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-push/server && ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0), ('uid:${MOD}', 'moderator', 'local-test', 0)`);
  d1(`DELETE FROM game_overrides WHERE kind = 'curse'`); d1(`UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides'`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n, uid) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await guardLocal(ctx);
    const p = await ctx.newPage(); const fr = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('toast_error') || s.includes('"admin_')) fr.push(s.slice(0, 400)); }));
    await p.goto(assertLocalUrl(`${BASE}?name=${n}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
    return [p, (fn, a) => p.evaluate(fn, a), fr];
  };
  // модератор
  const [M, GM, fm] = await open('ModC', MOD);
  await GM(() => window.__game.debug.openAdmin()); await M.waitForFunction(() => document.querySelectorAll('.mc-admin [data-tab]').length > 0, null, { timeout: 10000 }).catch(() => {});
  const mtabs = await GM(() => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
  ok(mtabs.length && !mtabs.includes('curse'), `модератор: вкладки ${mtabs.join(',')} — без «Проклятие»`);
  await GM(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'curse', id: 'main', patch: { statMult: 9 } })); await M.waitForTimeout(1500);
  ok(fm.some((t) => t.includes('Недостаточно прав')) && !fm.some((t) => t.includes('"op":"save"') && t.includes('"ok":true')), 'модератор: сервер отклоняет admin_save curse (нет прав)');
  ok(!d1(`SELECT 1 FROM game_overrides WHERE kind='curse'`).length, 'D1: правки модератора нет');
  await M.context().close();
  // админ
  const [A, GA, fa] = await open('AdmC', ADMIN);
  await GA(() => window.__game.debug.selectClass('warrior')); await A.waitForTimeout(1500);
  await GA(() => window.__game.debug.openAdmin()); await A.waitForTimeout(2500);
  await GA(() => document.querySelector('.mc-admin [data-tab="curse"]')?.click()); await A.waitForTimeout(500);
  await GA(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside [data-sel], .mc-admin aside li, .mc-admin aside button')].find((e) => /Проклятие/.test(e.textContent)); r?.click(); }); await A.waitForTimeout(700);
  const form = await GA(() => ({ n: document.querySelectorAll('.mc-admin section [data-p]').length, color: !!document.querySelector('.mc-admin section input[type=color]') }));
  ok(form.n >= 16 && form.color, `админ: форма проклятия ${JSON.stringify(form)}`);
  await A.screenshot({ path: `${OUT}/08-admin-curse-tab.png` });
  // правка живьём: statMult 2 → карточки cstats / meta curse
  await GA(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'curse', id: 'main', patch: { statMult: 2, tint: '#ff33cc' } }));
  await A.waitForFunction(() => window.__game.meta.state?.curse?.statMult === 2, null, { timeout: 10000 }).catch(() => {});
  const live = await GA(() => ({ c: window.__game.meta.state?.curse, cs: window.__game.debug.card?.('dew_slime_weapon')?.cstats }));
  ok(live.c?.statMult === 2 && live.c?.tint === '#ff33cc', `правка применилась живьём: ${JSON.stringify(live.c && { statMult: live.c.statMult, tint: live.c.tint })}`);
  ok(d1(`SELECT data FROM game_overrides WHERE kind='curse' AND id='main'`)[0]?.data.includes('"statMult":2'), 'D1: game_overrides curse/main');
  await GA(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'curse', id: 'main' }));
  await A.waitForFunction(() => window.__game.meta.state?.curse?.statMult === 1.5, null, { timeout: 10000 }).catch(() => {});
  ok(await GA(() => window.__game.meta.state?.curse?.statMult === 1.5), 'сброс → 1.5');
  console.log(`curse-admin ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
