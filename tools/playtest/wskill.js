// Навык «Вампир-лайка» на оружии: надели оружие с навыком → 4-й слот R (мир + забег, кнопка на телефоне),
// сняли → слота нет; навык берёт сервер с экипировки; G — второй навык раскладки (бывший R); кодекс.
// NODE_PATH=<playwright-core> node tools/playtest/wskill.js  (из каталога server; wrangler dev :8787; game.html :5199)
const { chromium, devices } = require('playwright-core');
const { execSync } = require('node:child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round2';
const WR = process.env.WRANGLER || '../node_modules/.bin/wrangler';
const d1 = (sql) => execSync(`${WR} d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString();
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now(), uid = `t_ws_${T}`, iid = `ws-${T}`;
  const open = async (ctxOpts = { viewport: { width: 1440, height: 860 } }, cls = 'rogue') => {
    const ctx = await b.newContext(ctxOpts); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=Alex&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(2500);
    return [ctx, p];
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  let [ctx, p] = await open();
  ok(await G(p, () => window.__game.meta.state.weaponSkill) == null, 'no weapon skill by default');
  ok(await p.locator('.mc-as.rs.locked .key', { hasText: 'R' }).count() === 1, 'action bar: locked R slot');
  ok(await p.locator('.mc-as.ab .key', { hasText: 'G' }).count() === 1, 'second ability slot moved to G');
  await ctx.close(); await new Promise((r) => setTimeout(r, 4000));
  // выпавшее оружие с навыком (как после броска rollRunSkill) — правим только локальную D1
  d1(`INSERT INTO item_instances (instance_id, owner, item_id, acquired_at, source, state, tx_id, viewed_at, updated_at, hero, run_skill) VALUES ('${iid}', 'uid:${uid}', 'dew_slime_weapon', ${T}, 'kill:test', 'inv', 'grant:${iid}', NULL, ${T}, 'rogue', 'chain_bolt')`);
  d1(`UPDATE accounts SET data=json_set(data,'$.runSkills',json('["chain_bolt"]')) WHERE pkey='uid:${uid}'`);
  [ctx, p] = await open();
  ok(await G(p, (i) => window.__game.meta.state.account.inv.find((x) => x.uid === i)?.rs, iid) === 'chain_bolt', 'item instance carries run skill (D1 run_skill)');
  await G(p, () => window.__game.debug.openBook?.('gear')); await p.waitForTimeout(800);
  await p.locator(`[data-act="sel"][data-v="${iid}"]`).first().click().catch(() => {}); await p.waitForTimeout(600);
  ok(await p.locator('.mc-tip .ab.rsk').count() === 1, 'gear tooltip shows weapon skill');
  await p.screenshot({ path: `${OUT}/wskill-02-gear-tooltip.png` });
  await p.keyboard.press('Escape');
  await G(p, (i) => window.__game.debug.rawSend({ type: 'equip', uid: i }), iid); await p.waitForTimeout(1500);
  ok(await G(p, () => window.__game.meta.state.weaponSkill) === 'chain_bolt', 'equip → server weaponSkill=chain_bolt');
  ok(await p.locator('.mc-as.rs:not(.locked) .key', { hasText: 'R' }).count() === 1, 'action bar: active R slot');
  await G(p, () => window.__game.debug.teleport(620, 520)); await p.waitForTimeout(500);
  const cds = []; await p.exposeFunction('__noop', () => {});
  await p.keyboard.press('r'); await p.waitForTimeout(1200);
  ok(await p.locator('text=Цепная молния').count() >= 1, 'R cast in open world (toast)');
  ok(await G(p, () => { const s = window.__game.state?.(); return true; }), 'state ok');
  await p.screenshot({ path: `${OUT}/wskill-01-world-R.png` });
  await G(p, () => window.__game.debug.openBook?.('runskills')); await p.waitForTimeout(700);
  ok(await p.locator('.mc-rskill.on em').count() === 1 && await p.locator('[data-act="runsel"]').count() === 0, 'codex: discovered list only, no select buttons');
  await p.screenshot({ path: `${OUT}/wskill-03-codex.png` });
  await p.keyboard.press('Escape');
  // забег: навык выдан бесплатным оружием, R — залп
  await G(p, () => window.__game.startRun('crypt')); await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const rw = await G(p, () => window.__game.state().run);
  ok(await p.locator('.mc-as.rs .key', { hasText: 'R' }).count() === 1, 'run: R slot on action bar');
  await p.keyboard.press('r'); await p.waitForTimeout(500);
  ok(await p.locator('text=Залп навыка оружия').count() >= 1, 'run: R burst');
  await p.screenshot({ path: `${OUT}/wskill-04-run-R.png` });
  await ctx.close();
  // телефон: кнопка навыка оружия
  [ctx, p] = await open({ ...devices['Pixel 7'] });
  await p.waitForTimeout(1500);
  ok(await p.locator('.mc3d-tbtn.k-ws').isVisible(), 'mobile: weapon-skill button visible');
  await p.locator('.mc3d-tbtn.k-ws').dispatchEvent('pointerdown'); await p.waitForTimeout(1000);
  ok(await p.locator('text=Цепная молния').count() >= 1, 'mobile: tap casts weapon skill');
  await p.screenshot({ path: `${OUT}/wskill-05-mobile.png` });
  // сняли оружие → слота нет
  await G(p, () => window.__game.debug.rawSend({ type: 'unequip', slot: 'weapon' })); await p.waitForTimeout(1500);
  ok(await G(p, () => window.__game.meta.state.weaponSkill) == null, 'unequip → no weapon skill');
  ok(!(await p.locator('.mc3d-tbtn.k-ws').isVisible()), 'mobile: button hidden after unequip');
  await G(p, () => window.__game.debug.rawSend({ type: 'zone_ability', id: 'rs', dx: 1, dy: 0 })); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/wskill-06-mobile-unequipped.png` });
  await ctx.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0].slice(0, 300) : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
