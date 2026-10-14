// Задачи 6–8: пул навыков забега + кодекс в Книге, выбор навыка (сервер), навык в забеге бесплатный
// NODE_PATH=<playwright-core> node tools/playtest/runskills.js  (локально: wrangler dev :8787, game.html :5199, из каталога server)
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round2';
const WR = process.env.WRANGLER || '../node_modules/.bin/wrangler';
const d1 = (sql) => execSync(`${WR} d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString();
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const uid = `t_rs_${Date.now()}`;
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=Alex&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(2500);
    return [ctx, p];
  };
  let [ctx, p] = await open();
  ok(await p.evaluate(() => Array.isArray(window.__game.meta.state?.account?.runSkills)), 'snapshot carries account.runSkills');
  await p.evaluate(() => window.__game.debug.rawSend({ type: 'run_skill_set', id: 'chain_bolt' })); await p.waitForTimeout(900);
  ok(await p.locator('text=Навык ещё не открыт').count() >= 1, 'server refuses selecting a locked skill');
  await ctx.close(); await new Promise((r) => setTimeout(r, 4000));
  // имитируем два трофея (как после бросков rollRunSkill): правим только локальную D1
  d1(`UPDATE accounts SET data=json_set(data,'$.runSkills',json('["chain_bolt","ice_fan"]'),'$.runSkillSel','chain_bolt') WHERE pkey='uid:${uid}'`);
  [ctx, p] = await open();
  const st = await p.evaluate(() => window.__game.meta.state.account);
  ok(st.runSkills.length === 2 && st.runSkillSel === 'chain_bolt', `pool loaded from D1: ${JSON.stringify([st.runSkills, st.runSkillSel])}`);
  await p.evaluate(() => window.__game.debug.openBook?.('runskills')); await p.waitForTimeout(900);
  if (!(await p.locator('.mc-rs-grid').count())) { await p.keyboard.press('j'); await p.waitForTimeout(600); await p.click('[data-act="tab"][data-v="runskills"]'); await p.waitForTimeout(800); }
  ok(await p.locator('.mc-rskill:not(.locked)').count() === 2 && await p.locator('.mc-rskill.locked').count() === 12, 'codex: 2 открыто, 12 скрыто');
  ok(await p.locator('.mc-rskill.on', { hasText: 'Цепная молния' }).count() === 1, 'selected skill highlighted');
  await p.screenshot({ path: `${OUT}/runskills-01-codex.png` });
  await p.locator('.mc-rskill', { hasText: 'Ледяной веер' }).locator('[data-act="runsel"]').click(); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.__game.meta.state.account.runSkillSel) === 'ice_fan', 'select via server → ice_fan');
  ok(await p.locator('.mc-rskill.on', { hasText: 'Ледяной веер' }).count() === 1, 'UI updated after select');
  await p.screenshot({ path: `${OUT}/runskills-02-selected.png` });
  await ctx.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0].slice(0, 200) : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
