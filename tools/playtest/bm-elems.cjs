// LOCAL: этап 2 — стихии вода/камень/природа/молния: кузня из кусочков своей стихии, большой взмах, типы снарядов дальних лезвий,
// чёрный лагерь стихии (бой, скорость мобов, дроп кусочков только своей стихии), админка. EL=water|stone|nature|lightning
// SEG=camp|forge|pure|admin|all. Только 127.0.0.1 (guardLocal). Светлый день (pin 12:00) — только в клиенте.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-el4/' + (process.env.EL || 'water');
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5417/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8417';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-el4/wr';
const VIDEO = process.env.VIDEO || '', SEG = process.env.SEG || 'all', ON = (s) => SEG === 'all' || SEG.split(',').includes(s);
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-el4/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const EL = process.env.EL || 'water';
const ADMIN = 'qa_el_' + EL.slice(0, 3) + '_' + Date.now().toString(36);
const walk = (o, out) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { for (const x of o) walk(x, out); return; } if (typeof o.k === 'string' || typeof o.t === 'string') out.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, out); };
const RES = { [`bp_${EL}_handle`]: 40, [`bp_${EL}_blade`]: 60, [`bp_${EL}_blade2`]: 30, [`bp_${EL}_blade3`]: 30, [`bp_${EL}_crystal`]: 40 };
const NM = { water: 'Вода', stone: 'Камень', nature: 'Природа', lightning: 'Молния' }[EL];
const MOB = { water: ['tide_warden', 'spray_archer', 'deep_seer', 'drowned_brute'], stone: ['rock_warden', 'shard_archer', 'mount_seer', 'cliff_brute'], nature: ['thorn_warden', 'burr_archer', 'trap_seer', 'root_brute'], lightning: ['storm_warden', 'volt_archer', 'tempest_seer', 'thunder_brute'] }[EL].map((x) => 'bmx_' + x);
const SHOTS = { water: { ricochet: 'water_blade_r', pierce: 'water_blade_2_r', explode: 'water_blade_3_r', split: 'water_blade_4_r' }, stone: { explode: 'stone_blade_r', split: 'stone_blade_2_r', pierce: 'stone_blade_4_r', ricochet: '' }, nature: { split: 'nature_blade_r', pierce: 'nature_blade_2_r', ricochet: 'nature_blade_3_r', explode: 'nature_blade_4_r' }, lightning: { ricochet: 'lightning_blade_r', pierce: 'lightning_blade_2_r', split: 'lightning_blade_3_r', explode: 'lightning_blade_5_r' } }[EL];
const ART_NAME = { water: 'Клинок прилива', stone: 'Скол горы', nature: 'Шип терний', lightning: 'Жало грозы' }[EL];
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {}
    addEventListener('DOMContentLoaded', () => { const cap = document.createElement('div'); cap.id = 'vcap'; cap.style.cssText = 'position:fixed;z-index:2147483647;left:10px;bottom:10px;padding:5px 12px;background:rgba(0,0,0,.78);color:#fff;font:600 15px system-ui;border-radius:5px;pointer-events:none;display:none'; document.body.append(cap); });
    window.__cap = (t) => { const e = document.getElementById('vcap'); if (e) { e.textContent = t; e.style.display = t ? 'block' : 'none'; } }; });
  const p = await ctx.newPage(); const errs = []; const fr = []; const ev = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_bmm|admin_bmf|bm_forge|admin_result|"dev_mob"/.test(s)) fr.push(s.slice(0, 2500));
    if (/"k":"/.test(s)) { try { const o = JSON.parse(s), out = []; walk(o, out); const at = Date.now(); for (const e of out) if (e.k && /^(shx|proj|marc|shot|hit|dmg|fslash)$/.test(e.k) || e.pe || e.pi || e.pf || e.el) { if (ev.length < 30000) ev.push({ ...e, at }); } } catch {} } }));
  const G = (f, a) => p.evaluate(f, a);
  const T0 = Date.now(), marks = []; const mark = (n) => marks.push([n, (Date.now() - T0) / 1000]);
  const cap = (x) => G((x) => window.__cap?.(x), x);
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
  const field = async () => { let P0 = null; for (const [x, y] of [[31000, 31000], [17000, 31000], [30500, 24150], [17500, 24150], [24000, 31000], [17000, 17000]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(2200); const n = await G(() => { const m = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((q) => Math.hypot(q.x - m.x, q.y - m.y) < 700).length; }); if (n <= 1) { const pr = await spawn('golem', 0, 420, true); await kill('golem'); if (pr && !pr.safe) { P0 = [x, y]; break; } } }
    if (!P0) { P0 = [30500, 24150]; await G(([x, y]) => window.__game.debug.tp(x, y, true), P0); await sleep(1500); } await clearNear(); await sleep(600); return P0; };
  const openAdmin = async () => p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
  const pieces = (s) => Object.fromEntries(Object.entries(s.account.res || {}).filter(([k]) => k.startsWith('bp_')));
  let ART = null;
  // ================= FORGE =================
  if (ON('forge')) {
    await cap(`Кузня Знахаря · ${NM}: детали только из кусочков своей стихии`);
    const z = await toZnahar();
    await G(() => window.__game.debug.send({ type: 'dev_grant', res: { bp_fire_blade: 30, bp_ice_blade: 30 } })); await sleep(700);
    fr.length = 0; await G((id) => window.__game.debug.send({ type: 'bm_forge_craft', part: id }), `${EL}_blade`); await sleep(1100);
    const s0 = await S(); const er = fr.find((x) => /toast_error|"err"|Не хватает/.test(x));
    t(`деталь «${NM}» без кусочков своей стихии — отказ (огонь/лёд не помогают)`, !(s0.bma?.parts?.[`${EL}_blade`] > 0) && /Не хватает/.test(er || ''), er?.slice(0, 160));
    await G((r) => window.__game.debug.send({ type: 'dev_grant', res: r }), RES); await sleep(900);
    await G((id) => window.__game.debug.rawSend({ type: 'npc_talk', npc: id }), z.id); await sleep(1500);
    await G(() => ([...document.querySelectorAll('button')].find((b) => b.textContent.includes('Кузня Знахаря')))?.click()); await sleep(1500);
    if (!(await G(() => window.__game.forgeWin?.isOpen))) await G(() => window.__game.forgeWin.open()); await sleep(1200);
    await G((el) => document.querySelector(`[data-f="elf"][data-v="${el}"]`)?.click(), EL); await sleep(900);
    const fl = await G((el) => ({ n: document.querySelectorAll('.bmf-part').length, own: [...document.querySelectorAll('.bmf-part')].filter((e) => e.dataset.elem === el).length, can: document.querySelectorAll('.bmf-part.can').length, shots: [...document.querySelectorAll('.bmf-shot')].map((e) => e.dataset.shot) }), EL);
    t(`кузня: фильтр «${NM}» — только свои детали, можно ковать, видны типы снарядов`, fl.n > 0 && fl.own === fl.n && fl.can > 0 && fl.shots.length >= 3, fl);
    await shot('f01-forge-filter');
    await G(() => document.querySelector('.bmf-shot')?.scrollIntoView({ block: 'center' })); await sleep(700); await shot('f02-forge-ranged-shot-types');
    for (const id of ['handle', 'blade', 'blade2', 'blade3', 'crystal'].map((x) => `${EL}_${x}`)) { await G((id) => { const e = document.querySelector(`.bmf-part[data-part="${id}"]`); e?.scrollIntoView({ block: 'center' }); e?.querySelector('[data-f="craft"]')?.click(); }, id); await sleep(VIDEO ? 700 : 400); }
    await sleep(800); let s = await S();
    t(`детали «${NM}» скованы из bp_${EL}_*`, ['handle', 'blade', 'crystal'].every((x) => (s.bma?.parts?.[`${EL}_${x}`] || 0) >= 1) && s.account.res[`bp_${EL}_blade`] < RES[`bp_${EL}_blade`], { parts: s.bma?.parts });
    await shot('f03-forge-crafted');
    await G(() => document.querySelector('[data-f="tab"][data-v="asm"]').click()); await sleep(600);
    for (const k of ['handle', 'blade', 'blade2', 'blade3', 'crystal']) { await G(([k, id]) => { const s = document.querySelector(`select[data-slot="${k}"]`); if (s) { s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); } }, [k, `${EL}_${k}`]); await sleep(VIDEO ? 600 : 300); }
    await sleep(1500);
    const asm = await G(() => document.querySelector('.bmf-stats')?.innerText || '');
    t(`сборка: стихия «${NM}»`, asm.includes(NM), asm.slice(0, 300));
    await shot('f04-forge-assembly'); await sleep(900); await shot('f04b-forge-assembly-swing');
    await p.fill('.bmf-name', ''); await p.type('.bmf-name', ART_NAME, { delay: VIDEO ? 45 : 0 }); await sleep(200);
    fr.length = 0; await G(() => document.querySelector('[data-f="build"]').click()); await sleep(2500);
    const bf = fr.find((x) => x.includes('"built"')); let bid = null; try { bid = JSON.parse(bf).built; } catch {}
    s = await S(); ART = s.account.inv.find((i) => i.id === bid);
    t(`выкован артефакт «${NM}»`, !!ART); await shot('f05-forge-built');
    await G(() => window.__game.forgeWin.close()); await sleep(500); await cap('');
  }
  const P0 = (ON('swing') || ON('shot') || ON('camp')) ? await field() : null; console.log('field', P0);
  const byId = (id) => G((id) => window.__game.debug.zoneMobsFull().find((m) => m.id === id), id);
  // ================= SWING: большой взмах + чистый урон стихии цветными цифрами =================
  if (ON('swing')) {
    if (!ART) { await G((el) => window.__game.debug.send({ type: 'bm_test_artifact', elem: el }), EL); await sleep(1500); ART = (await S()).account.inv.filter((i) => i.id.startsWith('art_')).pop(); }
    await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), ART.uid); await sleep(1300);
    await cap(`${NM}: большой взмах — лента следа в воздухе, чистый урон цифрами цвета стихии`);
    let tg = null; for (let k = 0; k < 4 && !tg; k++) { tg = await spawn(MOB[0], 100, 0, true); if (!tg) await sleep(1000); } const tg2 = await spawn(MOB[3], 110, 70, true);
    await sleep(900); ev.length = 0;
    for (let i = 0; i < 10; i++) { const q = (await byId(i % 2 ? tg2?.id : tg?.id)) || (await byId(tg?.id)); if (!q) break; await strike(q.x, q.y, 250); await sleep(160); if (i === 2) await shot('w01-swing-trail'); if (i === 6) await shot('w02-swing-trail-2'); await sleep(VIDEO ? 520 : 320); }
    const pe = ev.filter((e) => e.pe && e.pe[EL] > 0), sw = ev.filter((e) => e.stl !== undefined || e.slf !== undefined);
    t(`чистый урон «${NM}» в событиях удара (pe.${EL})`, pe.length > 0, pe.slice(0, 2));
    t('событие взмаха без лишних полей при умолчаниях (большой взмах включён)', sw.every((e) => e.stl !== 0), sw.slice(0, 2));
    const col = await G(() => [...document.querySelectorAll('.dmg-num, .mc-dmg, [class*="dmg"]')].slice(-12).map((e) => getComputedStyle(e).color));
    console.log('num colors', JSON.stringify(col));
    await shot('w03-pure-numbers'); await kill(MOB[0]); await kill(MOB[3]);
  }
  // ================= SHOT: типы снарядов дальних лезвий =================
  const SHX = {};
  if (ON('shot')) {
    for (const [ty, blade] of Object.entries(SHOTS)) { if (!blade) { console.log('нет лезвия', ty); continue; }
      const had = new Set((await S()).account.inv.map((i) => i.uid));
      await G(([el, b]) => window.__game.debug.send({ type: 'bm_test_artifact', elem: el, ranged: true, blade: b }), [EL, blade]); await sleep(1400);
      const A = (await S()).account.inv.find((i) => !had.has(i.uid)); if (!A) { t(`артефакт с ${blade}`, false); continue; }
      await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), A.uid); await sleep(1300);
      await cap(`${NM}: дальнее лезвие — снаряд «${{ explode: 'взрыв', ricochet: 'рикошет', pierce: 'насквозь', split: 'раскол' }[ty]}»`);
      const ms = []; for (const [dx, dy] of [[210, 0], [290, 10], [260, 80], [300, -70], [370, 0]]) { const m = await spawn(MOB[1], dx, dy, true); if (m) ms.push(m); }
      await sleep(900); ev.length = 0;
      for (let i = 0; i < 4; i++) { const q = await byId(ms[0]?.id) || await byId(ms[1]?.id); if (!q) break; await strike(q.x, q.y, 300); await sleep(260); if (i === 0) await shot(`s-${ty}-1`); await sleep(VIDEO ? 900 : 650); if (i === 1) await shot(`s-${ty}-2`); }
      const sx = ev.filter((e) => e.k === 'shx'), pr = ev.filter((e) => e.k === 'proj' && e.o === 'p');
      SHX[ty] = { shx: sx.map((e) => e.t), projEl: [...new Set(pr.map((e) => e.el || '-'))], projSt: [...new Set(pr.map((e) => e.st || '-'))] };
      const want = ty === 'pierce' ? null : ty === 'ricochet' ? 'ric' : ty;
      t(`снаряд «${ty}»: ${want ? 'событие shx ' + want : 'пробивает'} и цвет стихии`, (want ? sx.some((e) => e.t === want && e.el === EL) : pr.length > 0) && pr.some((e) => e.el === EL), SHX[ty]);
      for (const m of MOB.slice(1, 2)) await kill(m);
    }
    console.log('SHX', JSON.stringify(SHX));
  }
  // ================= CAMP: лагерь стихии, скорость мобов, дроп =================
  if (ON('camp')) {
    const M = await me(); await openAdmin(); fr.length = 0;
    await G(([x, y, el, M]) => window.__game.debug.send({ type: 'admin_bmm', op: 'save', kind: 'bmcamp', id: '', data: { name: `Лагерь (${el}, тест)`, world: 'arinar', x: Math.round(x + 360), y: Math.round(y), r: 120, mobs: [{ mob: M[0], n: 2 }, { mob: M[1], n: 2 }, { mob: M[2], n: 1 }], chief: M[3], respawnMin: 20, respawnMax: 25 } }), [M.x, M.y, EL, MOB]);
    const sv = await waitFr(/"op":"save"/, 8000); t(`лагерь «${NM}» сохранён`, !!sv && sv.includes('"ok":true'), sv?.slice(0, 160));
    await G(() => window.__game.debug.closeAdmin()); await sleep(600);
    await cap(`${NM}: чёрный лагерь стихии`);
    let bm = []; for (let i = 0; i < 25; i++) { bm = await blacks(); if (bm.length >= 5) break; await sleep(700); }
    t(`чёрные мобы «${NM}» лагеря в мире`, bm.length >= 5 && bm.every((m) => MOB.includes(m.type)), bm.slice(0, 6).map((m) => m.type));
    await shot('c01-camp');
    // скорость: подходим, мобы бегут к игроку — замер пути за 1.6 с
    const q0 = bm[0]; await G(([x, y]) => window.__game.debug.tp(x, y, true), [q0.x - 240, q0.y]); await sleep(150);
    const a0 = await blacks(); await sleep(1600); const a1 = await blacks();
    const sp = a0.map((m) => { const n = a1.find((x) => x.id === m.id); return n ? Math.round(Math.hypot(n.x - m.x, n.y - m.y) / 1.6) : null; }).filter((v) => v != null);
    const SPEED = { max: Math.max(0, ...sp), avg: sp.length ? Math.round(sp.reduce((a, b) => a + b, 0) / sp.length) : 0 }; console.log('SPEED', EL, JSON.stringify(SPEED));
    const res0 = pieces(await S()); ev.length = 0; fr.length = 0; await cap(`${NM}: бой с лагерем`);
    const tA = Date.now(); let n = 0;
    while (Date.now() - tA < 14000) { const bl = await blacks(); if (!bl.length) break; const q = bl[0]; if (q.d > 140) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [q.x - 90, q.y]); await sleep(250); } await strike(q.x, q.y, 250); await sleep(380); n++; if (n === 4 || n === 12) await shot(`c0${n === 4 ? 2 : 3}-camp-fight`); }
    const mp = ev.filter((e) => e.k === 'proj' && e.o !== 'p');
    t(`стрелки лагеря стреляют снарядами стихии (el=${EL})`, mp.some((e) => e.el === EL), mp.slice(0, 2).map((e) => ({ t: e.t, el: e.el, st: e.st })));
    for (let i = 0; i < 6 && (await blacks()).length; i++) { for (const m of MOB) await G((ty) => window.__game.debug.rawSend({ type: 'dev_grant', killNearAny: true, killType: ty }), m); await sleep(500); }
    await sleep(2500); await cap(`${NM}: награда лагеря — сундук, кусочки своей стихии`); await shot('c04-camp-after');
    const res1 = pieces(await S()); const gained = Object.keys(res1).filter((k) => (res1[k] || 0) > (res0[k] || 0));
    const seen = [...new Set(fr.join(' ').match(/bp_[a-z]+_[a-z0-9]+/g) || [])], chf = fr.filter((x) => /chest/i.test(x)).length;
    t('после лагеря: награда (кусочки/сундук) пришла', gained.length + seen.length + chf > 0, { gained, seen, chf });
    t(`кусочки только своей стихии (${EL})`, [...gained, ...seen].every((k) => k.startsWith(`bp_${EL}_`)), { gained, seen });
    const ch = chf, bags = seen.length;
    fs.writeFileSync(`${OUT}/camp-${EL}.json`, JSON.stringify({ SPEED, gained, ch, bags }));
  }
  // ================= ADMIN =================
  if (ON('admin')) {
    await openAdmin(); await cap(`Админка · ${NM}: конструктор деталей — тип снаряда`);
    await p.waitForFunction(() => { if (document.querySelectorAll('.bmfa .pl [data-p]').length >= 5) return true; document.querySelector('.mc-admin [data-tab="bmforge"]')?.click(); return false; }, null, { timeout: 20000, polling: 1500 }).catch(() => {}); await sleep(500);
    await G((el) => document.querySelector(`.bmfa [data-ef="${el}"]`)?.click(), EL); await sleep(900);
    const rid = Object.values(SHOTS).find(Boolean);
    await G((id) => document.querySelector(`.bmfa .pl [data-p="${id}"]`)?.click(), rid); await sleep(1300);
    const sel = await G(() => { const s = document.querySelector('.bmfa select[data-k="shot"]'); s?.scrollIntoView({ block: 'center' }); return s ? { v: s.value, o: [...s.options].map((o) => o.textContent) } : null; });
    t('конструктор: у дальнего лезвия поле «Тип снаряда»', !!sel && !!sel.v, sel); await sleep(500); await shot('a01-admin-part-shot');
    await G(() => document.querySelector('.bmfa [data-pva="attack"]')?.click()); await sleep(1000); await shot('a02-admin-part-preview-attack');
    await G(() => document.querySelector('.bmfa [data-pva="idle"]')?.click());
    await cap(`Админка · Чёрная магия: настройки снарядов и большого взмаха`);
    await p.waitForFunction(() => { const h = [...document.querySelectorAll('.mc-admin *')].find((e) => e.children.length === 0 && /Типы снарядов дальних лезвий/.test(e.textContent)); if (h) { h.scrollIntoView({ block: 'start' }); return true; } document.querySelector('.mc-admin [data-tab="bmagic"]')?.click(); return false; }, null, { timeout: 20000, polling: 1500 }).catch(() => {}); await sleep(700);
    await shot('a03-admin-bmagic-shots');
    await G(() => { const h = [...document.querySelectorAll('.mc-admin *')].find((e) => e.children.length === 0 && /Большой взмах ближнего/.test(e.textContent)); h?.scrollIntoView({ block: 'start' }); }); await sleep(600); await shot('a04-admin-bmagic-swing');
    await cap(`Админка · Чёрные мобы «${NM}»: движение`);
    await p.waitForFunction(() => { if (document.querySelectorAll('.bmma .pl [data-m]').length >= 3) return true; document.querySelector('.mc-admin [data-tab="bmmobs"]')?.click(); return false; }, null, { timeout: 25000, polling: 1500 }).catch(() => {}); await sleep(400);
    await G((el) => document.querySelector(`.bmma [data-ef="mef:${el}"]`)?.click(), EL); await sleep(800);
    const ml = await G(() => [...document.querySelectorAll('.bmma .pl [data-m]')].map((e) => e.dataset.elem));
    t(`админка мобов: фильтр «${NM}»`, ml.length >= 4 && ml.every((x) => x === EL), ml);
    await G((id) => document.querySelector(`.bmma .pl [data-m="${id}"]`)?.click(), MOB[0]); await sleep(1800); await shot('a05-admin-mob');
    const mv = await G(() => { const i = document.querySelector('.bmma [data-k="move.spd"]'); i?.scrollIntoView({ block: 'center' }); return i ? i.value || i.placeholder : null; }); console.log('move.spd', mv);
    t('конструктор мобов: параметры движения', mv !== null, mv); await sleep(500); await shot('a06-admin-mob-move');
    await G(() => document.querySelector('.bmma canvas')?.click()); await sleep(900); await shot('a07-admin-mob-attack');
    await G(() => document.querySelector('.bmma [data-bs="camps"]')?.click()); await sleep(1000);
    await G((el) => document.querySelector(`.bmma [data-ef="cef:${el}"]`)?.click(), EL); await sleep(800); await shot('a08-admin-camps');
    await cap('');
  }
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks-${SEG}.json`, JSON.stringify(marks));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
