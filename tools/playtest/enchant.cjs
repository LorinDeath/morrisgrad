// LOCAL: зачарованные вещи и мобы — рамки ярусов, проклятая+зачарованная, Чёрная с глитчем, карточка, мешок, сундук,
// мобы ярусов (вкл. Чёрного), панель «Цель», вкладка «✦ Зачарование», окно Петра. ПК + телефон.
// Только 127.0.0.1 (guardLocal). EN_BASE=http://127.0.0.1:5313/game-panel.html EN_WS=ws://127.0.0.1:8913 EN_WR=/workspace/mc-harness-enchant/wr nice node tools/playtest/enchant.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs'), cp = require('child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/enchant';
const BASE = process.env.EN_BASE || 'http://127.0.0.1:5313/game-panel.html', WS = process.env.EN_WS || 'ws://127.0.0.1:8913', WR = process.env.EN_WR || '/workspace/mc-harness-enchant/wr';
assertLocalUrl(BASE); assertLocalUrl(WS.replace(/^ws/, 'http'));
const ADMIN = 'en_admin_' + Date.now().toString(36);
const d1 = (sql) => cp.execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "${sql}"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const S5 = ['dew_slime_weapon', 'dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands'];
const GRANT = ['dew_slime_weapon', 'dew_slime_weapon@e1', 'dew_slime_helmet@e2', 'dew_slime_armor@e3', 'dew_slime_legs@e4', 'dew_slime_hands@e5', 'dew_slime_weapon@e6', 'dew_slime_helmet@e4@c', 'dew_slime_armor@e6@c', 'dew_slime_legs@c'];
const run = async (b, label, ctxOpts, pc) => {
  const ctx = await b.newContext(ctxOpts); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const rx = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.length < 60000 && /"type":"(admin_result|chest_view|loot_bag|dev_mob)"/.test(s)) { try { rx.push(JSON.parse(s)); } catch {} } }));
  const uid = ADMIN + (pc ? '' : '_m'); d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${uid}','admin','local-test',0)`);
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (fn, a) => p.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  const shot = (f, sel) => (sel ? p.$(sel).then((e) => (e ? e.screenshot({ path: `${OUT}/${label}-${f}.png` }) : p.screenshot({ path: `${OUT}/${label}-${f}.png` }))) : p.screenshot({ path: `${OUT}/${label}-${f}.png` }));
  const esc = async () => { await p.keyboard.press('Escape'); await sleep(400); };
  // админка «✦ Зачарование»
  if (pc) {
    for (let i = 0; i < 6 && !(await G(() => document.querySelectorAll('.mc-admin [data-tab]').length)); i++) { await sleep(1500); await G(() => window.__game.debug.openAdmin()); await sleep(1500); } // роль приходит с сервера чуть позже входа
    const tabs = await G(() => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
    ok(tabs.includes('ench'), `${label}: вкладка «✦ Зачарование» есть`);
    await G(() => document.querySelector('.mc-admin [data-tab="ench"]')?.click()); await sleep(600);
    await G(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside [data-sel], .mc-admin aside li, .mc-admin aside button')].find((e) => /Зачаров/.test(e.textContent)); r?.click(); }); await sleep(800);
    const form = await G(() => ({ n: document.querySelectorAll('.mc-admin section [data-p]').length, txt: document.querySelector('.mc-admin section')?.innerText.slice(0, 400) || '' }));
    ok(form.n >= 90, `${label}: поля вкладки (${form.n})`);
    await shot('12-admin-ench');
    await G(() => { const s = document.querySelector('.mc-admin section'); if (s) s.scrollTop = s.scrollHeight * 0.75; }); await sleep(300); await shot('13-admin-ench-black');
    rx.length = 0; await S({ type: 'admin_save', kind: 'ench', id: 'main', patch: { 'tiers.0.skMin': 5, 'tiers.0.skMax': 1 } }); await sleep(900);
    ok(rx.some((m) => m.type === 'admin_result' && !m.ok), `${label}: сервер отклоняет skMin > skMax`);
    await G(() => document.querySelector('.mc-admin [data-tab="curse"]')?.click()); await sleep(500);
    await G(() => { const r = [...document.querySelectorAll('.mc-admin aside [data-id], .mc-admin aside [data-sel], .mc-admin aside li, .mc-admin aside button')].find((e) => /Проклят/.test(e.textContent)); r?.click(); }); await sleep(700);
    const cp2 = await G(() => !!document.querySelector('.mc-admin section [data-p="cursedPct"]'));
    ok(cp2, `${label}: в «☠ Проклятие» есть поле cursedPct`); await shot('14-admin-curse-cursedPct');
    await esc();
  }
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2000);
  // клиент не может сам назначить ярус: «item» с ярусом от не-dev сессии сервер отбросит; здесь dev-сессия локально
  for (const id of GRANT) { await S({ type: 'dev_grant', item: id }); await sleep(120); }
  await S({ type: 'dev_grant', res: { soul_shard: 9999, fly_wing: 9999, dew_gel: 9999, wisp_light: 9999, fly_chitin: 9999 } }); await sleep(1500);
  const inv = await G(() => window.__game.meta.account.inv.map((i) => ({ uid: i.uid, id: i.id, c: i.cursed | 0, e: i.ench | 0 })));
  const find = (id, e, c = 0) => inv.find((i) => i.id === id && i.e === e && i.c === c);
  ok([1, 2, 3, 4, 5, 6].every((e) => inv.some((i) => i.e === e)) && find('dew_slime_helmet', 4, 1) && find('dew_slime_armor', 6, 1), `${label}: сумка — ярусы 1…6, проклятые+зачарованные (${inv.length})`);
  // сервер: Чёрное оружие ×10 к урону
  const nW = find('dew_slime_weapon', 0), bW = find('dew_slime_weapon', 6);
  await G((u) => window.__game.meta.equip(u), nW.uid); await p.waitForFunction((u) => window.__game.meta.hero?.equip?.weapon === u, nW.uid, { timeout: 8000 }).catch(() => {}); await sleep(600);
  const eN = await G(() => window.__game.meta.hero.effective);
  await G((u) => window.__game.meta.equip(u), bW.uid); await p.waitForFunction((u) => window.__game.meta.hero?.equip?.weapon === u, bW.uid, { timeout: 8000 }).catch(() => {}); await sleep(600);
  const eB = await G(() => window.__game.meta.hero.effective);
  ok(eB.itemDmgMax >= eN.itemDmgMax * 9.5 && eB.itemDmgMax <= eN.itemDmgMax * 10.5, `${label}: сервер — урон оружия ${eN.itemDmgMin}-${eN.itemDmgMax} → Чёрное ${eB.itemDmgMin}-${eB.itemDmgMax} (×10)`);
  await G((u) => window.__game.meta.equip(u), find('dew_slime_helmet', 4, 1).uid); await sleep(500);
  // Книга: снаряжение и сумка
  await G(() => window.__game.debug.openBook('gear')); await sleep(900);
  const bag = await G(() => ({ ench: document.querySelectorAll('.mc-item.ench, .mc-gslot.ench').length, gems: document.querySelectorAll('.mc-eg').length, czen: document.querySelectorAll('.ench.czen').length, glitch: document.querySelectorAll('.ench.glitch').length }));
  ok(bag.ench >= 7 && bag.gems >= 7 && bag.czen >= 2 && bag.glitch >= 2, `${label}: рамки ярусов ${JSON.stringify(bag)}`);
  await shot('01-bag-tiers');
  const card = async (u, f) => { await G((x) => (document.querySelector(`.mc-item[data-v="${x}"]`) || document.querySelector(`.mc-gslot[data-v="${x}"]`))?.click(), u); await sleep(500); const t = await G(() => document.querySelector('.mc-detail .mc-tip')?.innerText || ''); await shot(f, '.mc-gear'); return t; };
  const tB = await card(bW.uid, '02-card-black');
  ok(/Чёрн/.test(tB) && /✦/.test(tB) && /×10/.test(tB), `${label}: карточка Чёрной — приставка, значок, ×10`);
  const tCE = await card(find('dew_slime_helmet', 4, 1).uid, '03-card-cursed-legendary');
  ok(/Проклятый легендарный/.test(tCE) && /☠ Проклятая/.test(tCE) && /✦ Легендарная/.test(tCE), `${label}: карточка проклятой+легендарной`);
  await card(find('dew_slime_armor', 6, 1).uid, '04-card-cursed-black');
  if (pc) { await card(find('dew_slime_hands', 5).uid, '05-card-divine'); await G((u) => document.querySelector(`.mc-item[data-v="${u}"]`)?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), find('dew_slime_legs', 4).uid); await sleep(400); }
  await esc(); await G(() => window.__game.debug.openBook?.(null)); await esc();
  // окно Петра: Божественная вещь (+2%/ур., материалы ×32)
  await G(() => window.__game.debug.openUpgrade()); await sleep(900);
  await G((u) => document.querySelector(`[data-u="sel"][data-v="${u}"]`)?.click(), find('dew_slime_hands', 5).uid); await sleep(500);
  const up = await G(() => document.querySelector('.mc-upg, .mc-upgrade, [class*="upg"]')?.innerText || document.body.innerText.slice(0, 3000));
  ok(/Божественн/.test(up) && /\+2% ко всем/.test(up) && /×32/.test(up), `${label}: окно Петра — ярус, +2%/ур., материалы ×32`);
  await shot('06-petr-upgrade');
  await G((u) => document.querySelector(`[data-u="sel"][data-v="${u}"]`)?.click(), find('dew_slime_helmet', 4, 1).uid); await sleep(500); await shot('07-petr-cursed-legendary');
  await esc();
  // мешок и сундук с зачарованными вещами
  await S({ type: 'dev_grant', bag: { items: ['dew_slime_weapon@e1', 'dew_slime_helmet@e3', 'dew_slime_armor@e5', 'dew_slime_legs@e6', 'dew_slime_hands@e2@c', 'dew_slime_weapon@c'] } }); await sleep(1200);
  for (let i = 0; i < 3 && !(await G(() => document.querySelectorAll('.mc-loot .cell').length)); i++) { await G(() => window.__game.debug.interact()); await sleep(1500); }
  const lw = await G(() => ({ n: document.querySelectorAll('.mc-loot .cell.ench').length, g: document.querySelectorAll('.mc-loot .cell.glitch').length, cz: document.querySelectorAll('.mc-loot .cell.czen').length }));
  ok(lw.n >= 5 && lw.g >= 1 && lw.cz >= 1, `${label}: мешок — ${JSON.stringify(lw)}`);
  await shot('08-loot-bag'); await esc();
  // мобы ярусов
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  ok((await G(() => window.__game.state().world)) === 'arinar', `${label}: в Аринаре (открытый снег — видно ярусы)`);
  const P = { x: pc ? 31000 : 31700, y: 9000 };
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [P.x, P.y]); await sleep(1500);
  const MOB = 'dew_slime';
  const spots = [[-240, -110, 1], [-120, -110, 2], [0, -110, 3], [120, -110, 4], [240, -110, 5], [-120, 70, 6], [-240, 70, 4, true], [0, 70, 6, true]];
  await G((z) => window.__game.debug.setZoom?.(z), pc ? 0.42 : 0.36); await sleep(1200);
  await G(([sp, x, y, m]) => { for (const [dx, dy, e, c] of sp) window.__game.debug.rawSend({ type: 'dev_spawn_mob', mob: m, x: x + dx, y: y + dy, ench: e, cursed: !!c, special: '', calm: true }); }, [spots, P.x, P.y, MOB]);
  await p.waitForFunction(([x, y]) => window.__game.debug.zoneMobsFull().filter((m) => m.ench && Math.hypot(m.x - x, m.y - y) < 450).length >= 8, [P.x, P.y], { timeout: 5000, polling: 30 }).catch(() => {}); await sleep(1500); await shot('09-mobs-tiers');
  const mobs = await G(([x, y]) => window.__game.debug.zoneMobsFull().filter((m) => m.ench && Math.hypot(m.x - x, m.y - y) < 400), [P.x, P.y]);
  ok([1, 2, 3, 4, 5, 6].every((e) => mobs.some((m) => m.ench === e)), `${label}: мобы ярусов 1…6 у клиента (флаг 23–25): ${mobs.map((m) => m.ench + (m.cursed ? 'c' : '')).join(' ')}`);
  const maxHpOf = async (id) => { if (!id) return 0; await G((x) => window.__game.debug.selectMobId(x), id); await sleep(1300); return +(/\/\s*(\d+)/.exec(await G(() => document.getElementById('ghud-target-hp')?.textContent || ''))?.[1] || 0); };
  const black = mobs.filter((m) => m.ench === 6 && !m.cursed && !m.boss).sort((m, n) => Math.hypot(m.x - P.x + 120, m.y - P.y - 70) - Math.hypot(n.x - P.x + 120, n.y - P.y - 70))[0];
  if (black) { await G((id) => window.__game.debug.selectMobId(id), black.id); await sleep(2200); }
  const panel = await G(() => { const t = (id) => document.getElementById(id)?.textContent || ''; const n = document.getElementById('ghud-target-name'); return { name: t('ghud-target-name'), cls: t('ghud-target-class'), hp: t('ghud-target-hp'), armor: t('ghud-target-armor'), atk: t('ghud-target-atk'), color: n?.style.color, glitch: n?.classList.contains('mc-glitch-txt'), shown: !!document.getElementById('ghud-target-armor')?.offsetParent }; });
  console.log(label, 'panel', JSON.stringify(panel));
  if (panel.shown) ok(/✦ Чёрный/.test(panel.cls) && panel.glitch, `${label}: панель «Цель» — «✦ Чёрный», глитч имени, броня ${panel.armor}, урон ${panel.atk}`);
  else console.log(`INFO ${label}: боковой панели «Цель» на этом экране нет`);
  await shot('10-target-black');
  // Чёрный босс: ×40 ОЗ
  await S({ type: 'dev_spawn_mob', mob: MOB, x: P.x + 120, y: P.y + 70, ench: 0, special: '', calm: true }); await S({ type: 'dev_spawn_mob', mob: MOB, x: P.x + 200, y: P.y + 90, ench: 6, special: 'boss', calm: true }); await sleep(1500);
  const all = await G(([x, y]) => window.__game.debug.zoneMobsFull().filter((m) => Math.hypot(m.x - x, m.y - y) < 500), [P.x, P.y]);
  const plain = all.find((m) => !m.ench && !m.cursed && !m.elite && !m.boss), t1 = mobs.find((m) => m.ench === 1 && !m.cursed), bb = all.find((m) => m.ench === 6 && m.boss);
  ok(!!bb, `${label}: Чёрный босс появился`);
  if (pc) { // ОЗ с сервера (tg) — через панель «Цель» (есть только на ПК); база одного уровня = ОЗ Необычного / 1.5
    const at = (dx, dy, e, c) => mobs.filter((m) => m.ench === e && !!m.cursed === !!c).sort((m, n) => Math.hypot(m.x - P.x - dx, m.y - P.y - dy) - Math.hypot(n.x - P.x - dx, n.y - P.y - dy))[0]?.id;
    const h1 = await maxHpOf(at(-240, -110, 1)), h6 = await maxHpOf(at(-120, 70, 6)), h4 = await maxHpOf(at(120, -110, 4)), h4c = await maxHpOf(at(-240, 70, 4, true));
    const base = h1 / 1.5; console.log('hp', { base, h1, h4, h4c, h6 });
    ok(h1 > 0 && Math.abs(h6 / base - 40) < 0.5 && Math.abs(h4 / base - 7) < 0.2, `${label}: ОЗ ярусов ×1.5 / ×7 / ×40 (база ${Math.round(base)}: ${h1} / ${h4} / ${h6})`);
    ok(h4c > h4 * 5, `${label}: проклятый+легендарный — множители складываются (${h4c} vs ${h4})`);
  }
  if (bb && pc) { await G((id) => window.__game.debug.selectMobId(id), bb.id); await sleep(2000); await shot('11-target-black-boss'); }
  ok(!blocked.length, `${label}: нет запросов наружу`); ok(!errs.length, `${label}: без ошибок страницы ${errs.join(' | ')}`);
  await ctx.close(); return { panel };
};
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pc = await run(b, 'pc', { viewport: { width: 1440, height: 860 } }, true);
  const mob = await run(b, 'mobile', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, false);
  fs.writeFileSync(`${OUT}/panel.json`, JSON.stringify({ pc, mob }, null, 1));
  await b.close();
  console.log(fails ? `FAILED ${fails}` : 'enchant ok'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
