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
  // Модель изменилась: навык R живёт на самом оружии (item_instances.run_skill), выбора «run_skill_set» больше нет.
  // account.runSkills — кодекс: какие навыки уже встречались на добытом оружии.
  await ctx.close(); await new Promise((r) => setTimeout(r, 4000));
  d1(`UPDATE accounts SET data=json_set(data,'$.runSkills',json('["chain_bolt","ice_fan"]')) WHERE pkey='uid:${uid}'`);
  [ctx, p] = await open();
  const st = await p.evaluate(() => window.__game.meta.state.account);
  ok(JSON.stringify(st.runSkills) === '["chain_bolt","ice_fan"]', `codex pool loaded from D1: ${JSON.stringify(st.runSkills)}`);
  await p.evaluate(() => window.__game.book.toggle('runskills')); await p.waitForTimeout(1500);
  const open2 = await p.locator('.mc-rskill:not(.locked)').allInnerTexts(), locked = await p.locator('.mc-rskill.locked').count();
  ok(open2.some((t) => /Цепная молния/.test(t)) && open2.some((t) => /Ледяной веер/.test(t)), `codex: найденные навыки оружия открыты (${open2.length} открыто)`);
  ok(locked > 0 && await p.locator('.mc-rskill.locked', { hasText: '???' }).count() === locked, `codex: ненайденные — «???» (${locked})`);
  await p.screenshot({ path: `${OUT}/runskills-01-codex.png` });
  await ctx.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0].slice(0, 200) : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
