// LOCAL: 🛠 конструктор навыков — админка (пресеты, новый, копия, шаблоны, модификаторы, живое превью, ошибки), свои навыки на деталях,
// артефакт из них, каст каждой траектории в мире (урон по мишеням), удаление. SEG=admin|game|all. Только 127.0.0.1 (guardLocal). Светлый день (pin 12:00) — только в клиенте.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-skc';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5414/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8414';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-ice/wr';
const VIDEO = process.env.VIDEO || '', SEG = process.env.SEG || 'all', ON = (s) => SEG === 'all' || SEG.split(',').includes(s);
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-ice/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const ADMIN = 'qa_skc_' + Date.now().toString(36);
const walk = (o, out) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { for (const x of o) walk(x, out); return; } if (typeof o.k === 'string' || typeof o.t === 'string') out.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, out); };
const ICE_RES = { bp_ice_handle: 40, bp_ice_blade: 60, bp_ice_blade2: 30, bp_ice_blade3: 30, bp_ice_crystal: 40 };
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; const fr = []; const ev = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_skc|admin_bmm|admin_bmf|bm_forge|admin_result|ability_cd|"dev_mob"/.test(s)) fr.push(/"admin_skc"/.test(s) ? s : s.slice(0, 2500));
    if (/"pi"|"pf"|"hit"|ice_bolt|"z":1|"z":true/.test(s)) { try { const o = JSON.parse(s), out = []; walk(o, out); const at = Date.now(); for (const e of out) if (e.pi || e.pf || e.k === 'hit' || e.t === 'ice_bolt' || e.z) ev.push({ ...e, at }); } catch {} } }));
  const G = (f, a) => p.evaluate(f, a);
  const T0 = Date.now(), marks = []; const mark = (n) => marks.push([n, (Date.now() - T0) / 1000]);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(250); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); mark(n); };
  const waitFr = async (re, ms = 6000) => { for (let i = 0; i < ms / 150; i++) { const x = fr.find((y) => re.test(y)); if (x) return x; await sleep(150); } return null; };
  const S = () => G(() => window.__game.debug.metaSt());
  const me = () => G(() => window.__game.debug.me());
  const spawn = async (type, dx, dy, calm = false) => { fr.length = 0; await G((m) => window.__game.debug.rawSend({ type: 'dev_grant', spawnMob: m }), { type, dx, dy, calm }); const x = await waitFr(/"dev_mob"/, 4000); let r = null; try { r = JSON.parse(x.slice(0, x.lastIndexOf('}') + 1)); } catch {} return r; };
  const kill = async (ty) => { for (let i = 0; i < 6; i++) { await G((ty) => window.__game.debug.rawSend({ type: 'dev_grant', killNearAny: true, killType: ty }), ty); await sleep(120); } };
  const clearNear = async () => { const ms = await G(() => window.__game.debug.zoneMobsFull().map((m) => m.type)); for (const ty of [...new Set(ms)]) await kill(ty); };
  const aimAt = async (wx, wy) => { const q = await G(([x, y]) => window.__game.debug.w2s(x, y), [wx, wy]); if (q) await p.mouse.move(q.x, q.y); return q; };
  const strike = async (wx, wy, holdMs = 300) => { await aimAt(wx, wy); await p.mouse.down(); const t0 = Date.now(); while (Date.now() - t0 < holdMs) { await sleep(80); } await p.mouse.up(); };
  const blacks = () => G(() => { const m0 = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((m) => window.__game.debug.mobDef(m.type)?.black).map((m) => ({ id: m.id, type: m.type, hp: m.hp, x: Math.round(m.x), y: Math.round(m.y), d: Math.hypot(m.x - m0.x, m.y - m0.y) })).sort((a, b) => a.d - b.d); });
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400);
  const dn = await G(() => { try { return window.__game.dn?.({ pin: '12:00' }) || null; } catch (e) { return String(e); } }); console.log('day', JSON.stringify(dn)?.slice(0, 80));
  await G(() => { clearInterval(window.__icePin); window.__icePin = setInterval(() => { try { window.__game.dn?.({ pin: '12:00' }); } catch {} }, 1500); }); // сервер может сбросить pin — держим светлый день
  await G(() => window.__game.debug.send({ type: 'dev_grant', xp: 5000000 })); await sleep(900);
  // в Аринар
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  const toZnahar = async () => { let z = null; for (let i = 0; i < 20 && !z; i++) { z = await G(() => window.__game.debug.npcByName('Знахарь')); if (!z) await sleep(700); }
    const q = await G((id) => window.__game.debug.npcAt(id), z.id); await G(([x, y]) => window.__game.debug.tp(x, y + 30, true), [q.x, q.y]); await sleep(1300); return z; };
  const iceArt = async (name) => { // ледяные детали из ледяных кусочков → артефакт (сообщения сервера, как кнопки кузни)
    for (const id of ['ice_handle', 'ice_blade', 'ice_blade2', 'ice_blade3', 'ice_crystal']) { await G((id) => window.__game.debug.send({ type: 'bm_forge_craft', part: id }), id); await sleep(350); }
    fr.length = 0; await G((n) => window.__game.debug.send({ type: 'bm_forge_build', handle: 'ice_handle', blade: 'ice_blade', blade2: 'ice_blade2', blade3: 'ice_blade3', crystal: 'ice_crystal', name: n }), name); await sleep(1800);
    const bf = fr.find((x) => x.includes('"built"')); let bid = null; try { bid = JSON.parse(bf).built; } catch {}
    const s = await S(); return s.account.inv.find((i) => i.id === bid) || null; };
  let ART = null;

  const openAdmin = async () => { await p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
    await p.waitForFunction(() => { if (document.querySelectorAll('.skca .pl [data-sid]').length >= 10) return true; document.querySelector('.mc-admin [data-tab="skillcraft"]')?.click(); return false; }, null, { timeout: 25000, polling: 1500 }).catch(() => {}); await sleep(500); };
  const click = async (sel) => { const r = await G((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); if (!r) return false; await p.mouse.move(r.x, r.y, { steps: 6 }); await p.mouse.click(r.x, r.y); await sleep(VIDEO ? 700 : 350); return true; };
  const setF = async (path, v) => { const ok = await G(([path, v]) => { const e = document.querySelector(`.skca [data-f="${path}"]`); if (!e) return false; e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; }, [path, v]); await sleep(VIDEO ? 500 : 200); return ok; };
  const saveSk = async () => { fr.length = 0; await click('.skca [data-x="save"]'); const x = await waitFr(/"admin_skc".*"op":"save"/, 8000); let r = null; try { r = JSON.parse(x); } catch {} return r; };
  const made = {};
  if (ON('admin') || ON('game')) {
    await openAdmin();
    const n0 = await G(() => document.querySelectorAll('.skca .pl [data-sid]').length);
    t('вкладка конструктора: пресеты в списке', n0 >= 10, n0); await shot('k01-list');
    await click('.skca [data-sid="bmf_cinder_bolt"]'); await sleep(1500);
    const pv = await G(() => { const c = document.querySelector('.skca canvas[data-pv]'); if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, 360, 360).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return { n, inf: document.querySelector('.skca [data-inf]')?.textContent }; });
    t('живое превью пресета рисует (холст не пустой, сводка)', pv && pv.n > 50 && /Дальность/.test(pv.inf || ''), pv); await shot('k02-preset-preview');
    // копия пресета + шаблон «Веер синусоид»
    await click('.skca [data-x="dup"]'); await click('.skca [data-tpl="0"]'); await setF('name', 'Веер волн (тест)'); await setF('elem', 'ice'); await sleep(900);
    await shot('k03-dup-sine-fan');
    await click('.skca [data-qm="0"]'); await click('.skca [data-qm="1"]'); await sleep(500); await shot('k04-quick-mods');
    let r = await saveSk(); t('копия сохранена как свой навык skx_', r?.ok && /^skx_/.test(r.id), r && { ok: r.ok, id: r.id, err: r.err }); made.sine = r?.id;
    // ошибка: снаряд без урона → кнопка выключена
    await setF('hitMul', 0); await setF('boom', 0); await sleep(400);
    const er = await G(() => ({ st: document.querySelector('.skca [data-st]')?.textContent, dis: document.querySelector('.skca [data-x="save"]')?.disabled }));
    t('проверка: снаряд без урона — понятная ошибка, сохранение выключено', /без урона/.test(er.st || '') && er.dis, er); await shot('k05-validation');
    await click('.skca [data-x="undo"]');
    // новые: самонаведение, бумеранг, Безье, кольцо 3 удара, рывок
    const mk = async (key, form, elem, tpl, name) => { await G(([f, e]) => { const a = document.querySelector('.skca [data-nf]'), b = document.querySelector('.skca [data-ne]'); a.value = f; a.dispatchEvent(new Event('change')); b.value = e; b.dispatchEvent(new Event('change')); }, [form, elem]);
      await click('.skca [data-x="new"]'); await click(`.skca [data-tpl="${tpl}"]`); await setF('name', name); await sleep(VIDEO ? 1400 : 900); await shot(`k06-new-${key}`); const r = await saveSk(); t(`новый «${name}» сохранён`, r?.ok, r && { id: r.id, err: r.err }); made[key] = r?.id; };
    await mk('homing', 'proj', 'fire', 1, 'Искра-охотник (тест)');
    await mk('boomerang', 'proj', 'ice', 2, 'Ледяной бумеранг (тест)');
    await mk('bezier', 'proj', 'fire', 3, 'Кривая пламени (тест)');
    await mk('nova', 'nova', 'ice', 5, 'Тройное кольцо (тест)');
    await G(() => { const e = document.querySelector('.skca [data-ef="ice"]'); e?.click(); }); await sleep(800);
    const fl = await G(() => [...document.querySelectorAll('.skca .pl [data-sid]')].length); t('фильтр «лёд»', fl >= 5, fl); await shot('k07-filter-ice');
    await G(() => document.querySelector('.skca [data-ef=""]')?.click()); await sleep(500);
    // живая рассылка клиенту
    await sleep(1200); const live = await G((ids) => ids.map((id) => window.__game.debug.skfSlot(id)), Object.values(made));
    t('свои навыки сразу у клиента (config_update.skd)', live.every((x) => x), live);
    console.log('MADE', JSON.stringify(made));
  }
  if (ON('game')) {
    // назначение: детали льда → свои навыки (сначала артефакты), ковка, каст в мире
    const PARTS = { ice_crystal: made.sine, ice_blade3: made.homing, ice_blade2: made.boomerang, ice_handle: made.bezier };
    for (const [pid, sk] of Object.entries(PARTS)) { fr.length = 0; await G(([pid, sk]) => window.__game.debug.send({ type: 'admin_bmf', op: 'publish', id: pid, data: { skill: sk } }), [pid, sk]); const x = await waitFr(/"admin_bmf".*"op":"publish"/, 6000); t(`деталь ${pid} → ${sk}`, /"ok":true/.test(x || ''), x?.slice(0, 160)); await sleep(300); }
    await G(() => window.__game.debug.closeAdmin()); await sleep(500);
    await G((r) => window.__game.debug.send({ type: 'dev_grant', res: r }), ICE_RES); await sleep(900);
    const z = await toZnahar(); await G((id) => window.__game.debug.rawSend({ type: 'npc_talk', npc: id }), z.id); await sleep(1200);
    ART = await iceArt('Тест конструктора'); t('артефакт из деталей со своими навыками', !!ART, ART?.id);
    await G(() => { try { window.__game.forgeWin?.close?.(); } catch {} document.querySelectorAll('.mc-overlay .close, .mc-close').forEach((b) => b.click()); [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Уйти')?.click(); }); await sleep(500); await p.keyboard.press('Escape'); await sleep(500);
    let ids = []; for (let k = 0; k < 4 && !ids.includes(made.sine); k++) { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), ART.uid); await sleep(1500 + 700 * k); ids = (await S()).hero.artAbilities || []; }
    t('навыки артефакта — свои skx_', Object.values(PARTS).every((id) => ids.includes(id)), ids);
    const field = async () => { for (const [x, y] of [[31000, 31000], [17000, 31000], [30500, 24150], [17500, 24150]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(2200); const n = await G(() => { const m = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((q) => Math.hypot(q.x - m.x, q.y - m.y) < 700).length; }); if (n <= 1) return; } };
        await field(); await clearNear(); await sleep(500); const Mf = await me(); console.log('FIELD', Math.round(Mf.x), Math.round(Mf.y));
    for (const [key, id] of [['sine', made.sine], ['homing', made.homing], ['boomerang', made.boomerang], ['bezier', made.bezier]]) {
      await clearNear(); await sleep(400);
      const ms = key === 'homing' ? [[260, -150], [330, 120]] : key === 'boomerang' ? [[260, 70], [260, -70], [70, 0]] : [[220, -30], [300, 40], [360, 0]];
      const sr = []; for (const [dx, dy] of ms) sr.push(await spawn('golem', dx, dy, true)); console.log('SPAWN', key, JSON.stringify(sr).slice(0, 300)); await sleep(900); // бумеранг: петля шириной 2×amp — мишени на вершине петли
      const hp0 = (await G(() => window.__game.debug.zoneMobsFull().filter((m) => m.type === 'golem').map((m) => m.hp))).reduce((a, b) => a + b, 0);
      fr.length = 0; await G((id) => window.__game.debug.send({ type: 'loadout_set', ids: [id] }), id); await sleep(800); const M = await me(); await aimAt(M.x + 300, M.y); ev.length = 0;
      await G(([id, M]) => window.__game.debug.rawSend({ type: 'dev_grant', stressCast: { id, dx: 1, dy: 0, ox: Math.round(M.x), oy: Math.round(M.y), tx: Math.round(M.x + 400), ty: Math.round(M.y), cid: Date.now() % 1e6 } }), [id, M]);
      await sleep(key === 'homing' ? 450 : 300); console.log('DBG', key, JSON.stringify(await G(() => window.__game.debug.projs())).slice(0, 300), fr.filter((x) => /ability_cd|toast/.test(x)).slice(-3).join(' | ').slice(0, 400), JSON.stringify(await G(() => window.__game.debug.zoneMobsFull().filter((m) => m.type === 'golem').map((m) => [Math.round(m.x), Math.round(m.y), m.hp]))), JSON.stringify(await me()).slice(0, 120)); await shot(`g-${key}-flight`); await sleep(1600);
      const hp1 = (await G(() => window.__game.debug.zoneMobsFull().filter((m) => m.type === 'golem').map((m) => m.hp))).reduce((a, b) => a + b, 0);
      const sids = new Set(sr.filter(Boolean).map((x) => x.id)); const hits = ev.filter((e) => e.k === 'hit' && e.d > 0 && !e.dot && sids.has(e.id)); console.log('HITK', key, JSON.stringify(ev.filter((e) => e.k === 'hit').slice(0, 4))); console.log('EV', key, ev.length, JSON.stringify(ev.slice(0, 3)).slice(0, 400));
      t(`каст «${key}» бьёт мишени`, hp1 < hp0 || hits.length > 0, { hp0, hp1, hits: hits.length });
    }
    // восстановить детали (локальная БД), удалить один свой навык через админку
    const ORIG = { ice_crystal: 'bmi_shard_bolt', ice_blade3: 'bmi_icicle_hail', ice_blade2: 'bmi_rime_ring', ice_handle: 'bmi_blizzard_dash' };
    await openAdmin();
    for (const [pid, sk] of Object.entries(ORIG)) { await G(([pid, sk]) => window.__game.debug.send({ type: 'admin_bmf', op: 'publish', id: pid, data: { skill: sk } }), [pid, sk]); await sleep(400); }
    await openAdmin(); await click(`.skca [data-sid="${made.nova}"]`); await sleep(500);
    p.once('dialog', (d) => d.accept()); fr.length = 0; await click('.skca [data-x="del"]'); const dx = await waitFr(/"admin_skc".*"op":"reset"/, 6000);
    await sleep(1200); const gone = await G((id) => ({ list: !!document.querySelector(`.skca [data-sid="${id}"]`), cli: window.__game.debug.skfSlot(id) }), made.nova);
    t('удаление своего навыка: из списка и у клиента', !!made.nova && /"ok":true/.test(dx || '') && !gone.list && !gone.cli, gone); await shot('k08-deleted');
  }
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks-${SEG}.json`, JSON.stringify(marks));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
