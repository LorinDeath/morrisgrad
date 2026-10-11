// Вкладка «Герой» → дерево талантов для нескольких классов: изучение кликами, состояния, ключевой выбор, скриншоты.
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errs = []; let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Tree&uid=test_r2_tree_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', flags: { talents_open: 1 } }));
  const plan = {
    mage: ['ether', 'ether', 'ether', 'split', 'coat', 'coat', 'coat', 'frost_nova', 'deep', 'mind', 'mind', 'mind', 'pyro'],
    rogue: ['ember', 'ember', 'ember', 'venom', 'cold', 'cold', 'rhythm', 'agile', 'smoke_bomb', 'ghost'],
    warrior: ['vit', 'vit', 'vit', 'shield_wall', 'might', 'might', 'fan', 'ward'],
  };
  for (const [cls, keys] of Object.entries(plan)) {
    for (let i = 0; i < 6; i++) { await G((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1200); if (await G((c) => window.__game.meta?.hero?.cls === c, cls)) break; }
    await G(() => window.__game.debug.rawSend({ type: 'dev_grant', xp: 4000000, flags: { talents_open: 1 } }));
    await p.waitForTimeout(800);
    await G(() => { window.__game.book?.close?.(); });
    await G(() => window.__game.book ? window.__game.book.toggle('hero') : null);
    await p.waitForTimeout(500);
    if (!(await G(() => !!document.querySelector('.mc-tree')))) { await p.keyboard.press('KeyK'); await p.waitForTimeout(400); await p.click('[data-tab="hero"]').catch(() => {}); await p.waitForTimeout(400); }
    ok(await G(() => !!document.querySelector('.mc-tree')), `${cls}: tree rendered`);
    const nodeCount = await G(() => document.querySelectorAll('.mc-tree .mc-tn').length);
    ok(nodeCount >= 15, `${cls}: ${nodeCount} nodes`);
    ok(await G(() => document.querySelectorAll('.mc-tn.active .mc-sic').length >= 2), `${cls}: active nodes use pixel skill icons`);
    // кликами — по узлам
    for (const k of keys) {
      const sel = `.mc-tn[data-tid="${cls}.${k}"]`;
      const can = await G((s) => document.querySelector(s)?.classList.contains('avail'), sel);
      if (!can) { ok(false, `${cls}.${k} should be available`); continue; }
      await p.click(sel); await p.waitForTimeout(350);
    }
    const st = await G(() => window.__game.meta.hero);
    ok(keys.every((k) => (st.talents[`${cls}.${k}`] || 0) > 0), `${cls}: all clicked talents learned on server (${keys.length})`);
    const ks = keys[keys.length - 1];
    if (['pyro', 'ghost'].includes(ks)) {
      const other = await G((id) => document.querySelector(`.mc-tn[data-tid="${id}"]`)?.className, ks === 'pyro' ? 'mage.cryo' : 'rogue.cuts');
      ok(/excl/.test(other || ''), `${cls}: paired keystone shown closed after choice (${other})`);
      // подделка в обход UI
      await G((id) => window.__game.debug.rawSend({ type: 'talent_learn', id }), ks === 'pyro' ? 'mage.cryo' : 'rogue.cuts');
      await p.waitForTimeout(500);
      const st2 = await G(() => window.__game.meta.hero.talents);
      ok(!st2[ks === 'pyro' ? 'mage.cryo' : 'rogue.cuts'], `${cls}: forged second keystone rejected by server`);
    }
    // наведение — подсказка
    await p.hover(`.mc-tn[data-tid="${cls}.${keys[3]}"]`); await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/talent-tree-${cls}.png` });
    if (cls === 'mage') ok(st.unlocked.includes('frost_nova') && !st.unlocked.includes('meteor'), 'mage: frost_nova unlocked via tree, meteor still locked');
  }
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
