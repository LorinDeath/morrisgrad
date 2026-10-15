// Модератор в админ-панели: только бестиарий / оружие / предметы. Сервер — allowlist.
// Запуск: sed "s#require('./_local')#require('/tmp/_local.cjs')#" tools/playtest/mod-admin.cjs > /tmp/mod-admin.cjs
// NODE_PATH=... nice node /tmp/mod-admin.cjs   (wrangler :8787, game.html :5199, только localhost)
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const { guardLocal } = require('./_local');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/mod-admin';
const WR = process.env.WRANGLER || 'npx wrangler';
const ADMIN = 'test_admin_pt';
const MOD = 'test_mod_admin_' + Date.now();
const PLAIN = 'test_plain_admin_' + Date.now();
const d1 = (sql) => {
  const out = execSync(`cd /workspace/mg-push/server && ${WR} d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString();
  return JSON.parse(out)[0].results;
};
execSync(`mkdir -p ${OUT}`, { stdio: 'inherit' });
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  d1(`DELETE FROM player_roles WHERE pkey IN ('uid:${MOD}','uid:${PLAIN}')`);
  d1(`DELETE FROM game_overrides WHERE id IN ('ice_dew_slime','daggers','dew_slime_weapon')`);
  d1(`UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides'`);

  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n, uid) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
    await guardLocal(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e).slice(0, 300)));
    const frames = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => {
      const s = String(f.payload);
      if (s.includes('"toast_error"') || s.includes('"admin_') || s.includes('"my_role"') || s.includes('"role_changed"')) frames.push(s.slice(0, 500));
    }));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${encodeURIComponent(n)}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    await p.waitForTimeout(2000);
    return [p, (fn, a) => p.evaluate(fn, a), frames];
  };
  const waitFrame = async (frames, pred, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const hit = frames.find(pred); if (hit) return hit; await new Promise((r) => setTimeout(r, 80)); }
    return null;
  };

  // —— обычный игрок ——
  const [P, GP, fp] = await open('Plain', PLAIN);
  ok(!(await GP(() => window.__game.debug.admin())).btn, 'plain: нет кнопки 🛠');
  await GP((adminUid) => {
    window.__game.debug.rawSend({ type: 'admin_open' });
    window.__game.debug.rawSend({ type: 'admin_save', kind: 'mob', id: 'ice_dew_slime', patch: { hp: 1 } });
    window.__game.debug.rawSend({ type: 'admin_save', kind: 'weapon', id: 'daggers', patch: { 'atk.range': 1 }, role: 'admin', userId: adminUid });
  }, ADMIN);
  await P.waitForTimeout(1500);
  ok(fp.filter((t) => t.includes('Недостаточно прав')).length >= 2, `plain: сервер 403 admin_* (${fp.filter((t) => t.includes('Недостаточно прав')).length})`);
  ok(!fp.some((t) => t.includes('admin_catalog') || (t.includes('admin_result') && t.includes('"ok":true'))), 'plain: нет catalog/успешного save');
  await P.context().close();

  // —— админ выдаёт модерку (обновляет кэш DO) ——
  const [A0, GA0, fa0] = await open('Админ', ADMIN);
  const [M, GM, fm] = await open('Модер', MOD);
  await GA0(() => window.__game.debug.selectClass('spearman'));
  await GM(() => window.__game.debug.selectClass('mage'));
  await A0.waitForTimeout(1200);
  // выдать через online → профиль → кнопка, либо role_set по sid
  const modSid = await GM(() => window.__game.state().myId);
  await GA0((sid) => window.__game.debug.rawSend({ type: 'role_set', sid, moderator: true }), modSid);
  const granted = await waitFrame(fm, (t) => t.includes('my_role') && t.includes('"modAdmin":true'), 8000);
  ok(!!granted, 'admin role_set → mod gets my_role modAdmin');
  ok(d1(`SELECT role FROM player_roles WHERE pkey='uid:${MOD}'`)[0]?.role === 'moderator', 'D1: moderator row');
  await M.waitForTimeout(500);
  ok((await GM(() => window.__game.debug.admin())).btn, 'mod: кнопка 🛠 после выдачи');

  await GM(() => document.querySelector('#ghud-admin-btn').click());
  await M.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  const info = await GM(() => {
    const a = window.__game.debug.admin();
    const tabs = [...document.querySelectorAll('.mc-admin [data-tab]')].map((b) => b.dataset.tab);
    return { scope: a.scope, full: a.full, tabs, title: document.querySelector('.mc-admin header b')?.textContent };
  });
  ok(info.scope === 'moderator' && info.full === false, `mod catalog scope=${info.scope} full=${info.full}`);
  ok(JSON.stringify([...info.tabs].sort()) === JSON.stringify(['item', 'mob', 'weapon']), `mod tabs only three: ${info.tabs.join(',')}`);
  ok(/модератор/i.test(info.title || ''), `title: ${info.title}`);
  await M.screenshot({ path: `${OUT}/01-mod-panel-tabs.png` });

  // GET+save mob
  await M.click('.mc-admin [data-tab="mob"]'); await M.waitForTimeout(200);
  await M.fill('.mc-admin aside input', 'ice_dew_slime'); await M.waitForTimeout(200);
  await M.click('.mc-admin aside li[data-id="ice_dew_slime"]'); await M.waitForTimeout(300);
  await M.fill('.mc-admin [data-p="hp"]', '666');
  await M.click('.mc-admin [data-save]');
  await M.waitForFunction(() => /Сохранено|✖/.test(document.querySelector('.mc-admin .msg')?.textContent || ''), null, { timeout: 8000 });
  const mobMsg = await M.textContent('.mc-admin .msg');
  ok(/Сохранено/.test(mobMsg), 'mod save mob: ' + mobMsg);
  { const rows = d1(`SELECT data FROM game_overrides WHERE kind='mob' AND id='ice_dew_slime'`);
    const raw = JSON.stringify(rows);
    ok(/666/.test(raw) && /hp/.test(raw), 'D1 mob hp 666: ' + raw.slice(0, 180)); }
  await M.screenshot({ path: `${OUT}/02-mod-save-mob.png` });

  await M.click('.mc-admin [data-tab="weapon"]'); await M.waitForTimeout(300);
  await M.screenshot({ path: `${OUT}/03-mod-weapons-tab.png` });
  const n0 = fm.length;
  await GM(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'weapon', id: 'daggers', patch: { 'atk.range': 321 } }));
  ok(!!await waitFrame(fm.slice(n0), (t) => t.includes('admin_result') && t.includes('"ok":true') && t.includes('weapon'), 6000)
    || !!await waitFrame(fm, (t) => t.includes('admin_result') && t.includes('"ok":true') && t.includes('weapon'), 1000), 'mod save weapon ok');
  // waitFrame on slice doesn't work well — use full buffer from mark
  {
    const mark = fm.length;
    await GM(() => window.__game.debug.rawSend({ type: 'admin_save', kind: 'item', id: 'dew_slime_weapon', patch: { req: 2 } }));
    let hit = null; const t0 = Date.now();
    while (Date.now() - t0 < 6000) { hit = fm.slice(mark).find((t) => t.includes('admin_result') && t.includes('"ok":true') && t.includes('dew_slime_weapon')); if (hit) break; await new Promise((r) => setTimeout(r, 80)); }
    ok(!!hit, 'mod save item ok');
  }
  ok(/321/.test(JSON.stringify(d1(`SELECT data FROM game_overrides WHERE kind='weapon' AND id='daggers'`))), 'D1 weapon patch');

  // deny other kinds / ops
  const beforeDeny = fm.length;
  await GM(() => {
    window.__game.debug.rawSend({ type: 'admin_save', kind: 'skill', id: 'war_axe', patch: { cd: 1 } });
    window.__game.debug.rawSend({ type: 'admin_save', kind: 'loot', id: 'dew_slime', patch: {} });
    window.__game.debug.rawSend({ type: 'admin_save', kind: 'spawn', id: 'arinar_camps', patch: {} });
    window.__game.debug.rawSend({ type: 'admin_audit' });
    window.__game.debug.rawSend({ type: 'admin_quest_save', quest: { id: 'c_fake' } });
    window.__game.debug.rawSend({ type: 'admin_quest_delete', id: 'c_fake' });
    window.__game.debug.rawSend({ type: 'admin_quest_reset', id: 'p1_swarm' });
    window.__game.debug.rawSend({ type: 'admin_dialogue_save', questId: 'p1_swarm', dialogue: { offer: [], done: [] } });
    window.__game.debug.rawSend({ type: 'role_set', sid: 'x', moderator: true });
  });
  await M.waitForTimeout(2000);
  const denyN = fm.slice(beforeDeny).filter((t) => t.includes('Недостаточно прав')).length;
  ok(denyN >= 7, `mod denied other admin ops: ${denyN} toasts`);
  ok(!fm.slice(beforeDeny).some((t) => t.includes('"type":"admin_audit"') && t.includes('rows')), 'mod no audit rows');
  ok(!d1(`SELECT id FROM custom_quests WHERE id='c_fake'`).length, 'mod quest not created');

  {
    const mark = fm.length;
    await GM(() => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'mob', id: 'ice_dew_slime' }));
    let hit = null; const t0 = Date.now();
    while (Date.now() - t0 < 6000) { hit = fm.slice(mark).find((t) => t.includes('admin_result') && t.includes('ice_dew_slime')); if (hit) break; await new Promise((r) => setTimeout(r, 80)); }
    ok(!!hit && hit.includes('"ok":true'), 'mod reset mob ok');
  }

  await M.context().close();
  await A0.context().close();

  // —— админ без регрессии ——
  const [A, GA, fa] = await open('Админ', ADMIN);
  ok((await GA(() => window.__game.debug.admin())).btn, 'admin: кнопка 🛠');
  await GA(() => document.querySelector('#ghud-admin-btn').click());
  await A.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 15000 });
  const aInfo = await GA(() => {
    const a = window.__game.debug.admin();
    return { scope: a.scope, full: a.full, tabs: [...document.querySelectorAll('.mc-admin [data-tab]')].map((b) => b.dataset.tab) };
  });
  ok(aInfo.full === true && aInfo.tabs.includes('quest') && aInfo.tabs.includes('audit'), `admin all tabs: ${aInfo.tabs.join(',')}`);
  {
    const mark = fa.length;
    await GA(() => window.__game.debug.rawSend({ type: 'admin_audit' }));
    let hit = null; const t0 = Date.now();
    while (Date.now() - t0 < 6000) { hit = fa.slice(mark).find((t) => t.includes('"admin_audit"') && t.includes('rows')); if (hit) break; await new Promise((r) => setTimeout(r, 80)); }
    ok(!!hit, 'admin audit ok');
  }
  await A.screenshot({ path: `${OUT}/04-admin-full-tabs.png` });
  await A.context().close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  console.log(`${pass} passed, ${fail} failed`);
  console.log('MATRIX: plain=deny-all; mod=open+save/reset mob|weapon|item; mod=deny skill|loot|spawn|audit|quests|dialogue|role_set; admin=unchanged');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
