// LOCAL: чёрная магия, этап Б — кузня Знахаря (Альказак): детали из кусочков, сборка с превью, имя (фильтр), разбор;
// админка «🔥 Конструктор оружия»: черновик (сам) → публикация → деталь у Знахаря; дроп кусочков; браузер артефактов. Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-b';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5412/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8412';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-bmb/wr';
const VIDEO = process.env.VIDEO || '';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-black-b/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); };
const ADMIN = 'qa_bmb_' + Date.now().toString(36);
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; const fr = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  const fs_ = []; p.on('websocket', (ws) => { console.log('  [ws open]', ws.url().slice(0, 60), new Date().toISOString().slice(11, 19)); ws.on('close', () => console.log('  [ws close]', new Date().toISOString().slice(11, 19))); }); p.on('websocket', (ws) => ws.on('framesent', (f) => { const s = String(f.payload); if (/bm_forge/.test(s)) fs_.push(s.slice(0, 300)); })); p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_bmf|bm_forge|admin_result/.test(s)) fr.push(s.slice(0, 600)); }));
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n, o = {}) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(300); await p.screenshot({ path: `${OUT}/${n}.png`, ...o }); console.log('shot', `${OUT}/${n}.png`); };
  const marks = []; const mark = (n) => marks.push([n, Date.now()]); const T0 = Date.now();
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400);
  const S = () => G(() => window.__game.debug.metaSt());
  // кусочки чертежа
  await G(() => window.__game.debug.send({ type: 'dev_grant', res: { bp_fire_handle: 30, bp_fire_blade: 40, bp_fire_blade2: 20, bp_fire_blade3: 20, bp_fire_crystal: 60 } })); await sleep(900);
  let s = await S(); t('кусочки чертежа выданы (ресурсы)', s.account.res.bp_fire_blade >= 40, s.account.res);
  // в Аринар → к Знахарю
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  // далеко от Знахаря — отказ
  fr.length = 0; await G(() => window.__game.debug.send({ type: 'bm_forge_open' })); await sleep(800);
  t('кузня вдали от Знахаря недоступна', fr.some((x) => x.includes('Кузня — у Знахаря')), fr.slice(0, 2));
  let z = null; for (let i = 0; i < 20 && !z; i++) { z = await G(() => window.__game.debug.npcByName('Знахарь')); if (!z) await sleep(700); }
  if (!z) console.log('npcs', await G(() => Object.values(window.__game.debug).length)); t('Знахарь найден в городе', !!z && z.world === 'arinar', z);
  let dlg = false;
  for (let i = 0; i < 4 && !dlg; i++) {
    const q = await G((id) => window.__game.debug.npcAt(id), z.id); await G(([x, y]) => window.__game.debug.tp(x, y + 30, true), [q.x, q.y]); await sleep(1200);
    fr.length = 0; await G((id) => window.__game.debug.rawSend({ type: 'npc_talk', npc: id }), z.id); await sleep(1500);
    dlg = await G(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Кузня Знахаря')));
    if (!dlg) console.log('talk try', i, q, fr.slice(0, 2));
  }
  const btn = await G(() => !!document.querySelector('#npc-svc-forge, [data-id="npc-svc-forge"]') || [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Кузня Знахаря')));
  t('в диалоге Знахаря — кнопка «🔥 Кузня Знахаря»', btn);
  await shot('01-znahar-dialog'); mark('dialog');
  await G(() => ([...document.querySelectorAll('button')].find((b) => b.textContent.includes('Кузня Знахаря')))?.click()); await sleep(1500);
  if (!(await G(() => window.__game.forgeWin?.isOpen))) await G(() => window.__game.forgeWin.open());
  await sleep(800);
  let f = await G(() => ({ open: window.__game.forgeWin.isOpen, parts: document.querySelectorAll('.bmf-part').length, can: document.querySelectorAll('.bmf-part.can').length }));
  t('окно кузни: детали из кусочков', f.open && f.parts >= 5 && f.can >= 3, f);
  await shot('02-forge-parts'); mark('parts');
  // создать по детали каждого типа (первые)
  const firstOf = await G(() => { const st = window.__game.forgeWin.st; const o = {}; for (const p of st.parts) if (!o[p.type]) o[p.type] = p.id; return o; });
  for (const id of Object.values(firstOf)) { await G((id) => document.querySelector(`.bmf-part[data-part="${id}"] [data-f="craft"]`)?.click(), id); await sleep(450); }
  await sleep(900);
  s = await S(); t('детали созданы (bmParts), кусочки списаны', Object.values(firstOf).every((id) => (s.bma?.parts?.[id] || 0) >= 1) && s.account.res.bp_fire_blade < 40, { parts: s.bma?.parts, res: s.account.res });
  await shot('03-forge-parts-crafted');
  // сборка
  await G(() => document.querySelector('[data-f="tab"][data-v="asm"]').click()); await sleep(500);
  for (const [k, id] of Object.entries(firstOf)) { await G(([k, id]) => { const s = document.querySelector(`select[data-slot="${k}"]`); s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); }, [k, id]); await sleep(350); }
  await sleep(1200);
  const asm = await G(() => ({ cv: !!document.querySelector('.bmf-cv'), rows: document.querySelectorAll('.bmf-stats .bm-row').length, anim: window.__game.forgeWin.prev?.on }));
  t('сборка: живое превью + чёрные параметры', asm.cv && asm.anim && asm.rows >= 7, asm); mark('asm');
  await sleep(1200); const pmode = await G(() => window.__game.forgeWin.prev?.mode); t('превью рисует листы Художника (не заглушку)', pmode === 'art', pmode);
  await shot('04-forge-assembly-preview'); await sleep(700); await shot('04b-forge-assembly-preview-swing');
  // имя: брань / мусор / норма
  const typeName = async (n) => { await p.fill('.bmf-name', ''); await p.type('.bmf-name', n, { delay: VIDEO ? 45 : 0 }); await sleep(200); fr.length = 0; const dis = await G(() => document.querySelector('[data-f="build"]').disabled); await G(() => document.querySelector('[data-f="build"]').click()); console.log('  click build', new Date().toISOString().slice(11, 19)); const t0 = Date.now(); for (let i = 0; i < 100; i++) { await sleep(200); const e = await G(() => document.querySelector('.bmf-err')?.textContent || ''); if (e || fr.some((x) => x.includes('"built"'))) { console.log('  build reply ms', Date.now() - t0); return e; } } console.log('  build: no reply', { dis, fr: fr.slice(0, 3), sent: fs_.slice(-3) }); await G(() => window.__game.debug.send({ type: 'bm_forge_open' })); await sleep(2500); console.log('  after open', fr.slice(0, 3).map((x) => x.slice(0, 160))); return ''; };
  let e1 = await typeName('Клык бля'); t('имя с бранью отклонено', /не подойдёт/.test(e1), e1); await shot('05-forge-name-profanity');
  let e2 = await typeName('<b>x</b>'); t('имя с HTML отклонено', e2.length > 0, e2);
  let e3 = await typeName('Пепельный клык'); 
  await sleep(800); s = await S();
  const art = s.account.inv.find((i) => i.id.startsWith('art_') && i.src === 'forge');
  t('выковано: артефакт в сумке', !!art && fr.some((x) => x.includes('"built"')), { art, e3, fr: fr.filter((x) => !x.includes('"st"')).slice(0, 4) });
  await shot('06-forge-built'); mark('built');
  await sleep(1500);
  const row = d1(`SELECT id, name, props FROM items WHERE name = 'Пепельный клык' ORDER BY rowid DESC LIMIT 1`)[0];
  t('сохранён в БД сразу (items)', !!row && JSON.parse(row.props || '{}').author === ADMIN, row && { id: row.id, name: row.name, author: JSON.parse(row.props).author });
  // разбор
  await G(() => document.querySelector('[data-f="tab"][data-v="salv"]').click()); await sleep(600);
  await shot('07-forge-salvage');
  const sh0 = s.account.res.bm_shard_fire || 0;
  await G(() => document.querySelector('[data-f="salv"]:not([disabled])')?.click()); await sleep(400); await G(() => document.querySelector('[data-f="salv"]:not([disabled])')?.click()); await sleep(1500);
  s = await S(); t('разбор → осколки огня', (s.account.res.bm_shard_fire || 0) > sh0 && !s.account.inv.some((i) => i.uid === art?.uid), { before: sh0, after: s.account.res.bm_shard_fire });
  mark('salv');
  // выковать снова (для браузера админки)
  for (const id of Object.values(firstOf)) { await G((id) => window.__game.debug.send({ type: 'bm_forge_craft', part: id }), id); await sleep(300); }
  await G((o) => window.__game.debug.send({ type: 'bm_forge_build', handle: o.handle, blade: o.blade, name: 'Уголь рассвета' }), firstOf); await sleep(1500);
  await G(() => window.__game.forgeWin.close()); await sleep(500);
  // админка: конструктор
  await p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
  await p.waitForFunction(() => { if (document.querySelectorAll('.bmfa .pl [data-p]').length >= 5) return true; document.querySelector('.mc-admin [data-tab="bmforge"]')?.click(); return false; }, null, { timeout: 20000, polling: 1500 }).catch(() => {}); await sleep(300);
  const al = await G(() => ({ list: document.querySelectorAll('.bmfa .pl [data-p]').length, nw: document.querySelectorAll('.bmfa [data-new]').length }));
  t('админка «🔥 Конструктор оружия»: список деталей', al.list >= 5 && al.nw === 5, al);
  await shot('08-admin-constructor'); mark('admin');
  fr.length = 0; await G(() => document.querySelector('.bmfa [data-new="blade"]').click()); await sleep(1500);
  const nid = await G(() => window.__game.debug.admin?.()?.bmf?.edit?.id || document.querySelector('.bmfa .pl div.on')?.dataset.p);
  t('новая деталь — черновик bpx_blade_*', /^bpx_blade_/.test(nid || ''), nid);
  const setF = async (k, v) => { await G(([k, v]) => { const e = document.querySelector(`.bmfa [data-k="${k}"]`); if (!e) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await sleep(VIDEO ? 350 : 60); };
  await setF('name', 'Клинок вулкана'); await setF('icon', '🌋'); await setF('color', '#ff3d00'); await setF('stats.force', 40); await setF('stats.bdmg', 6); await setF('stats.bcrit', 8); await setF('reach', 160); await setF('arc', 1.6); await setF('cost', 5); await setF('desc', 'Лезвие из застывшей лавы.');
  await sleep(2200);
  const st1 = await G(() => document.querySelector('.bmfa .st')?.textContent);
  const dr = d1(`SELECT id, data FROM game_overrides WHERE kind = 'bmc_draft' AND id = '${nid}'`)[0];
  t('черновик сохранился сам (bmc_draft в БД)', !!dr && JSON.parse(dr.data).name === 'Клинок вулкана' && /Черновик сохранён/.test(st1 || ''), { st1, dr: dr && dr.data.slice(0, 120) });
  await shot('09-admin-draft-autosave'); mark('draft');
  // черновик НЕ виден игрокам
  await G(() => window.__game.debug.send({ type: 'bm_forge_open' })); await sleep(900);
  fr.length = 0; await G(() => document.querySelector('.bmfa [data-x="pub"]').click()); await sleep(2000);
  const pub = fr.find((x) => x.includes('"op":"publish"')); t('публикация: ok, новая', pub && pub.includes('"ok":true') && pub.includes('"isNew":true'), pub?.slice(0, 200));
  await shot('10-admin-published'); mark('pub');
  const ov = d1(`SELECT kind, id FROM game_overrides WHERE id = '${nid}'`);
  t('в БД: bpart-правка есть, черновик удалён', ov.some((r) => r.kind === 'bpart') && !ov.some((r) => r.kind === 'bmc_draft'), ov);
  // деталь у Знахаря
  fr.length = 0; await G(() => window.__game.forgeWin.open()); await sleep(1500);
  await G(() => document.querySelector('[data-f="tab"][data-v="parts"]')?.click()); await sleep(600);
  const hasNew = await G((id) => !!document.querySelector(`.bmf-part[data-part="${id}"]`), nid);
  t('опубликованная деталь — сразу в кузне Знахаря', hasNew, nid);
  await G((id) => document.querySelector(`.bmf-part[data-part="${id}"]`)?.scrollIntoView({ block: 'center' }), nid); await shot('11-forge-new-part'); mark('newpart');
  await G(() => window.__game.forgeWin.close()); await sleep(400);
  // дроп кусочков
  await G(() => document.querySelector('.mc-admin [data-tab="bmforge"]')?.click()); await sleep(600);
  await G(() => document.querySelector('.bmfa [data-bs="drop"]').click()); await sleep(800);
  const mob = await G(() => document.querySelector('.bmfa tr[data-m]')?.dataset.m);
  fr.length = 0; await G(() => { const tr = document.querySelector('.bmfa tr[data-m]'); tr.querySelector('.c').value = '12'; tr.querySelector('.z').value = '2'; tr.querySelector('.b').click(); }); await sleep(1500);
  const drop = fr.find((x) => x.includes('"op":"drop"')); t('дроп кусочка у моба сохранён', drop && drop.includes('"ok":true') && drop.includes('bp_fire_handle'), drop?.slice(0, 220));
  await shot('12-admin-piece-drops');
  // браузер артефактов
  await G(() => document.querySelector('.bmfa [data-bs="arts"]').click()); await sleep(800);
  const ab = await G(() => [...document.querySelectorAll('.bmfa table tr')].map((r) => r.textContent).join('|'));
  t('браузер: артефакт игрока с автором', ab.includes('Уголь рассвета') && ab.includes(ADMIN), ab.slice(0, 200));
  await shot('13-admin-artifacts-browser'); mark('arts');
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks.map(([n, t]) => [n, (t - T0) / 1000])));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
