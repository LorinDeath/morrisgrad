// Навык R — любой навык игры: Кодекс «закреплён за», каст R, админка (группы/поиск: предмет, моб, «Навыки»). Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const rx = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/admin_result|ability_cd/.test(s)) rx.push(s.slice(0, 240)); }));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2500);
  const curW = () => G(() => { const st = window.__game.meta?.state; const u = st?.hero?.equip?.weapon; return u ? st.account.inv.find((i) => i.uid === u)?.id : null; });
  let wid = await curW();
  if (!wid) { // надеть любое оружие из сумки (или выдать тестовое — dev_grant, только локально)
    const pick = () => G(() => { const st = window.__game.meta?.state; const W = window.__game.debug.items?.() || null; return (st?.account?.inv || []).map((i) => i.uid + '|' + i.id); });
    let inv = await pick();
    const wpn = await G((ids) => ids.find((x) => /weapon|staff|sword|bow|dagger|spear|axe|book|orb/i.test(x)) || null, inv);
    if (!wpn) { await G(() => window.__game.debug.rawSend({ type: 'dev_grant', item: 'dew_slime_weapon' })); await p.waitForTimeout(1500); inv = await pick(); }
    for (const x of inv) { await G((u) => window.__game.debug.rawSend({ type: 'equip', uid: u }), x.split('|')[0]); await p.waitForTimeout(500); if ((wid = await curW())) break; }
  }
  ok(!!wid, 'надето оружие: ' + wid);
  const book = async (tab) => { await G((t) => window.__game.debug.openBook?.(t), tab); await p.evaluate((t) => document.querySelector(`[data-act="tab"][data-v="${t}"]`)?.click(), tab); await p.waitForTimeout(2000); };
  await G((id) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'item', id, patch: { rs: 'fly_blades' } }), wid); await p.waitForTimeout(2500);
  await book('runskills');
  const card = await p.evaluate(() => [...document.querySelectorAll('.mc-rskill')].find((c) => /Летучие клинки/.test(c.textContent))?.textContent || '');
  ok(/закреплён за/.test(card), 'Кодекс: «Летучие клинки» открыт и закреплён: ' + card.slice(0, 140));
  const empty = await p.evaluate(() => [...document.querySelectorAll('.mc-rskill.locked small')].filter((s) => /^: /.test(s.textContent)).length);
  ok(empty === 0, `закрытые карточки без пустого источника (${empty})`);
  const hid = await p.evaluate(() => [...document.querySelectorAll('.mc-rskill.locked')].filter((c) => /есть у \?\?\? оружия/.test(c.textContent)).length);
  ok(true, `закрытых с подсказкой «есть у ??? оружия»: ${hid}`);
  await p.evaluate(() => [...document.querySelectorAll('.mc-rskill')].find((c) => /Летучие клинки/.test(c.textContent))?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/rs-codex-bound.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await G((id) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'item', id, patch: { rs: 'ab:meteor' } }), wid); await p.waitForTimeout(2500);
  rx.length = 0; await p.mouse.move(900, 300); await p.keyboard.press('r'); await p.waitForTimeout(1500);
  const cd = rx.find((s) => s.includes('ability_cd')) || '';
  ok(/"id":"rs:ab:meteor"/.test(cd) && /"ok":true/.test(cd), 'R = «Метеор»: сервер принял ' + cd.slice(0, 140));
  await p.screenshot({ path: `${OUT}/rs-cast-meteor.png` });
  await G(() => window.__game.debug.openAdmin()); await p.waitForTimeout(2500);
  const tab = async (k) => { await p.evaluate((k) => document.querySelector(`.mc-admin [data-tab="${k}"]`)?.click(), k); await p.waitForTimeout(900); };
  await tab('item'); await p.fill('.mc-admin aside input', wid).catch(() => {}); await p.waitForTimeout(700);
  await p.evaluate((id) => document.querySelector(`.mc-admin aside li[data-id="${id}"]`)?.click(), wid); await p.waitForTimeout(900);
  if (!(await p.$('.mc-adm-skpick'))) { await tab('weapon'); await p.evaluate(() => document.querySelector('.mc-admin aside li[data-id]')?.click()); await p.waitForTimeout(900); }
  const grp = await p.evaluate(() => [...document.querySelectorAll('.mc-adm-skpick optgroup')].map((g) => g.label + ':' + g.children.length));
  ok(grp.length >= 3, 'админка предмета, навык R: ' + grp.join(', '));
  await p.fill('.mc-adm-sksearch', 'метеор').catch(() => {}); await p.evaluate(() => document.querySelector('.mc-adm-skpick')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/rs-admin-item.png` });
  await tab('mob'); await p.evaluate(() => document.querySelector('.mc-admin aside li[data-id]')?.click()); await p.waitForTimeout(900);
  const chips = await p.evaluate(() => [...document.querySelectorAll('.mc-admin .chips[data-g]')].map((c) => c.dataset.g + ':' + c.querySelectorAll('label').length));
  ok(chips.length >= 3, 'админка моба, навыки: ' + chips.join(', '));
  await p.fill('.mc-adm-chipsearch', 'клинк').catch(() => {}); await p.evaluate(() => document.querySelector('.mc-adm-chipsearch')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/rs-admin-mob.png` });
  await tab('skill'); const n = await p.evaluate(() => document.querySelectorAll('.mc-admin aside li[data-id]').length);
  ok(n >= 38, `админка «Навыки»: ${n} навыков`);
  await p.evaluate(() => document.querySelector('.mc-admin aside li[data-id^="rs:"]')?.click()); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/rs-admin-skills.png` });
  await G((id) => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'item', id }), wid); await p.waitForTimeout(1200);
  ok(!blocked.length, 'только локально'); ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close();
})();
