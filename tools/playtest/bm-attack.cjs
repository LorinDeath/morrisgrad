// LOCAL: атака артефакта — ближний огненный взмах (дуга = хитбокс), дальний снаряд (попадание/промах),
// тройной выстрел посохов Художника (из дула каждого), режим посоха, превью кузни (число снарядов), чёрные мобы (дуга/снаряд/уклонение, против мобов).
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-atk';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5413/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8413';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-bmc/wr';
const VIDEO = process.env.VIDEO || '';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-black-c/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const ADMIN = 'qa_bmatk_' + Date.now().toString(36);
const walk = (o, out) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { for (const x of o) walk(x, out); return; } if (typeof o.k === 'string') out.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, out); };
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const T0 = Date.now(); const marks = []; const mark = (n) => { marks.push([n, (Date.now() - T0) / 1000]); };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; const fr = []; const ev = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|"dev_mob"|admin_result/.test(s)) fr.push(s.slice(0, 1500) + ' ' + ((s.match(/"toast":"[^"]*"/) || [''])[0]));
    if (s.includes('"k":"')) { try { const o = JSON.parse(s), out = []; walk(o, out); const at = Date.now(); for (const e of out) ev.push({ ...e, at }); } catch {} } }));
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', `${OUT}/${n}.png`); mark(n); };
  const waitFr = async (re, ms = 6000) => { for (let i = 0; i < ms / 150; i++) { const x = fr.find((y) => re.test(y)); if (x) return x; await sleep(150); } return null; };
  const S = () => G(() => window.__game.debug.metaSt());
  const me = () => G(() => window.__game.debug.me());
  const spawn = async (type, dx, dy, calm = false) => { fr.length = 0; await G((m) => window.__game.debug.rawSend({ type: 'dev_grant', spawnMob: m }), { type, dx, dy, calm }); const x = await waitFr(/"dev_mob"/, 4000); let r = null; try { r = JSON.parse(x.slice(0, x.lastIndexOf('}') + 1)); } catch {} console.log('spawn', type, dx, dy, x ? x.slice(0, 200) : null); return r; };
  const kill = async (ty) => { for (let i = 0; i < 6; i++) { await G((ty) => window.__game.debug.rawSend({ type: 'dev_grant', killNearAny: true, killType: ty }), ty); await sleep(120); } };
  const clearNear = async () => { const ms = await G(() => window.__game.debug.zoneMobsFull().map((m) => m.type)); for (const ty of [...new Set(ms)]) await kill(ty); };
  const mobPos = (id) => G((id) => { const m = window.__game.debug.zoneMobsFull().find((x) => x.id === id); return m && { x: m.x, y: m.y, hp: m.hp }; }, id);
  const aimAt = async (wx, wy) => { const q = await G(([x, y]) => window.__game.debug.w2s(x, y), [wx, wy]); if (q) await p.mouse.move(q.x, q.y); return q; };
  // удар мышью по-настоящему: зажать ЛКМ (заряд), отпустить
  const strike = async (wx, wy, holdMs = 2000, onRelease, live) => { await aimAt(wx, wy); await p.mouse.down(); const t0 = Date.now(); while (Date.now() - t0 < holdMs) { if (live) { const q = await live(); if (q) { wx = q.x; wy = q.y; } } await aimAt(wx, wy); await sleep(120); } const at = Date.now(); await p.mouse.up(); if (onRelease) await onRelease(); return at; };
  const equipArt = async (pred) => { const s = await S(); const it = s.account.inv.filter((i) => i.id.startsWith('art_')).find(pred); if (!it) return null; await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), it.uid); await sleep(1200); return it; };
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400);
  const dn = await G(() => { try { return window.__game.dn?.({ pin: '12:00' }) || null; } catch (e) { return String(e); } }); console.log('day', JSON.stringify(dn)?.slice(0, 100));
  await G(() => window.__game.debug.send({ type: 'dev_grant', xp: 5000000, res: { bp_fire_handle: 60, bp_fire_blade: 300, bp_fire_blade2: 80, bp_fire_blade3: 80, bp_fire_crystal: 80 } })); await sleep(900);
  // три тестовых артефакта: ближний, дальний, три посоха Художника
  for (const m of [{ ranged: false }, { ranged: true }, { staff: true }]) { await G((m) => window.__game.debug.send({ type: 'bm_test_artifact', ...m }), m); await sleep(1300); }
  let s = await S(); const arts = s.account.inv.filter((i) => i.id.startsWith('art_')); t('3 тестовых артефакта', arts.length === 3, arts.map((a) => a.id));
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar'); const ARR = await me(); console.log('arrive', JSON.stringify(ARR));
  // пустошь вне города: ищем место без мобов рядом
  let P0 = null; for (const [x, y] of [[31000, 31000], [17000, 31000], [30500, 24150], [17500, 24150], [24000, 31000], [17000, 17000]]) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(2200); const n = await G(() => { const m = window.__game.debug.me(); return window.__game.debug.zoneMobsFull().filter((q) => Math.hypot(q.x - m.x, q.y - m.y) < 700).length; }); if (n <= 1) { const pr = await spawn('golem', 0, 420, true); await kill('golem'); console.log('probe', x, y, pr && pr.safe); if (pr && !pr.safe) { P0 = [x, y]; break; } } }
  if (!P0) { P0 = [30500, 24150]; await G(([x, y]) => window.__game.debug.tp(x, y, true), P0); await sleep(1500); }
  await clearNear(); await sleep(600); console.log('spot', P0);
  const hp = async () => { const s = await S(); return s.hero?.zp?.hp ?? null; };
  // ── 1. ближний: огненная дуга = хитбокс; урон всем в дуге, сзади — нет
  const KIND = {}; for (const it of arts) { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), it.uid); await sleep(1200); const e = (await S()).hero?.effective?.art; KIND[e?.staff ? 'staff' : e?.ranged ? 'ranged' : 'melee'] = it.uid; }
  console.log('kinds', KIND); const wear = async (k) => { await G((u) => window.__game.debug.send({ type: 'equip', uid: u }), KIND[k]); await sleep(1200); return (await S()).hero?.effective?.art; };
  const effA = await wear('melee');
  t('в руке ближний артефакт', effA && !effA.ranged, effA && { ranged: effA.ranged });
  let M = await me(); const f1 = await spawn('golem', 70, -30, true), f2 = await spawn('golem', 80, 35, true), bk = await spawn('golem', -75, 0, true); await sleep(900);
  t('мишени заспавнены (2 спереди, 1 сзади)', f1 && f2 && bk, [f1?.id, f2?.id, bk?.id]);
  M = await me(); ev.length = 0;
  const relA = await strike(M.x + 60, M.y, 2000, async () => { await sleep(110); await shot('01-melee-fire-arc'); await sleep(140); await shot('02-melee-fire-arc-trail'); });
  await sleep(900); await shot('03-melee-hit-numbers');
  const arcEv = ev.filter((e) => e.k === 'shot' && e.bm && e.r); const hits = ev.filter((e) => e.k === 'hit' && e.d > 0);
  t('сервер: огненная дуга игрока (shot bm, r, a, fr≈1 полный заряд)', arcEv.length >= 1 && arcEv[0].fr >= 0.99, arcEv[0]);
  t('урон обоим в дуге', [f1?.id, f2?.id].every((id) => hits.some((h) => h.id === id)), hits.map((h) => [h.id, h.d]));
  t('сзади — без урона', !hits.some((h) => h.id === bk?.id));
  t('каждый в дуге — ровно один раз за взмах', [f1?.id, f2?.id].every((id) => hits.filter((h) => h.id === id && !h.dot).length === 1));
  await clearNear(); await sleep(400);
  // ── 2. дальний: снаряд из дула, попадание и промах (цель ушла)
  let A = await wear('ranged');
  t('в руке дальний артефакт', A?.ranged, A && { ranged: A.ranged, staff: A.staff, range: A.atk?.range });
  M = await me(); const tg = await spawn('golem', 220, 0, true); await sleep(700); ev.length = 0; mark('ranged-hit');
  const tp = await mobPos(tg.id);
  await strike(tp.x, tp.y, 1900, async () => { await sleep(160); await shot('04-ranged-projectile-flight'); }, () => mobPos(tg.id));
  await sleep(900); await shot('05-ranged-hit'); console.log('ranged hits', JSON.stringify(ev.filter((e) => e.k === 'hit' || e.k === 'pend' || e.k === 'proj').map((e) => [e.k, e.id, e.d, e.x, e.y])).slice(0, 400), JSON.stringify(await mobPos(tg.id)));
  let pr = ev.filter((e) => e.k === 'proj' || (e.t && e.o === 'p')); let h1 = ev.filter((e) => e.k === 'hit' && e.id === tg.id && e.d > 0);
  t('снаряд-событие от сервера', ev.some((e) => e.bm && (e.k === 'shot' || e.k === 'proj')), ev.filter((e) => e.bm).slice(0, 3));
  t('попадание: урон по цели ровно 1 раз', h1.length === 1, h1);
  await clearNear(); await sleep(300);
  M = await me(); const tm = await spawn('golem', 230, 0, true); await sleep(600); ev.length = 0; mark('ranged-miss');
  const tmp = await mobPos(tm.id);
  await strike(tmp.x, tmp.y, 1900, async () => { await G((id) => window.__game.debug.rawSend({ type: 'dev_grant', moveMob: { id, dx: 0, dy: 200 } }), tm.id); await sleep(160); await shot('06-ranged-miss-flight'); });
  await sleep(1300); await shot('07-ranged-miss');
  const h2 = ev.filter((e) => e.k === 'hit' && e.id === tm.id && e.d > 0);
  t('промах: цель ушла — урона нет', h2.length === 0, h2);
  await clearNear(); await sleep(300);
  // ── 3. три посоха Художника: 3 снаряда веером из 3 разных дул
  await wear('staff');
  A = (await S()).hero?.effective?.art; t('в руке тройной посох (staff, shots=3, дальний)', A?.staff && A.shots === 3 && A.ranged, A && { staff: A.staff, shots: A.shots, ranged: A.ranged });
  M = await me(); const s1 = await spawn('golem', 220, -55, true), s2 = await spawn('golem', 230, 0, true), s3 = await spawn('golem', 220, 55, true); await sleep(800); ev.length = 0; mark('triple');
  await strike(M.x + 290, M.y, 1900, async () => { await sleep(120); await shot('08-triple-staff-shot'); await sleep(180); await shot('09-triple-staff-fan'); }, async () => s2 && { x: s2.x + 60, y: s2.y }); // серверные координаты мишени (dev_mob)
  await sleep(1000); await shot('10-triple-staff-hits');
  const sh3 = ev.filter((e) => e.bm && (e.k === 'shot' || e.k === 'proj')); const orig = new Set(sh3.map((e) => `${e.x},${e.y}`));
  console.log('triple ev', JSON.stringify(sh3).slice(0, 600));
  t('тройной выстрел: ≥3 снаряда от сервера', sh3.length >= 3, sh3.length);
  t('из разных дул (3 разные точки вылета)', orig.size >= 3, [...orig]);
  const h3 = ev.filter((e) => e.k === 'hit' && [s1?.id, s2?.id, s3?.id].includes(e.id) && e.d > 0);
  t('веер задел ≥2 цели', new Set(h3.map((h) => h.id)).size >= 2, h3.map((h) => [h.id, h.d]));
  await clearNear(); await sleep(300);
  // ── 4. режим посоха: переключить на ближний → дуга; назад на дальний
  await G(() => window.__game.debug.openBook('artifacts')); await sleep(1500);
  const mb = await G(() => !!document.querySelector('[data-act="bmmode"]')); t('вкладка «Артефакты»: переключатель режима посоха', mb);
  await shot('11-staff-mode-toggle-ranged');
  fr.length = 0; await G(() => document.querySelector('[data-act="bmmode"][data-v="1"]')?.click()); const tt = await waitFr(/Посох: ближний/); t('сервер: «Посох: ближний бой»', !!tt); await sleep(900);
  await shot('12-staff-mode-toggle-melee');
  await G(() => window.__game.debug.closeBook?.() || document.querySelector('.mc-book-x')?.click()); await sleep(600);
  A = (await S()).hero?.effective?.art; t('посох в ближнем режиме: ranged=false', A && !A.ranged, A && { ranged: A.ranged, mode: A.mode });
  M = await me(); const mm = await spawn('golem', 70, 0, true); await sleep(600); ev.length = 0;
  await strike(M.x + 60, M.y, 1900, async () => { await sleep(110); await shot('13-staff-melee-arc'); });
  await sleep(700); t('посох-ближний: огненная дуга + урон', ev.some((e) => e.k === 'shot' && e.bm && e.r) && ev.some((e) => e.k === 'hit' && e.id === mm?.id && e.d > 0));
  fr.length = 0; await G(() => window.__game.debug.send({ type: 'bm_mode', melee: false })); await waitFr(/Посох: дальний/); await sleep(500);
  await clearNear(); await sleep(300);
  // ── 5. чёрные мобы: страж (дуга по игроку), стрелок (снаряд + уклонение), жрец с тремя посохами, драка с обычными
  await G(([x, y]) => window.__game.debug.tp(x, y, true), [31000, 31000]); await sleep(2200); await clearNear(); await sleep(400); // свежее место для чёрных мобов
  await G(() => window.__game.debug.send({ type: 'unequip', slot: 'weapon' })); await sleep(1200);
  const mortal = async () => { await G(() => window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true } })); await sleep(400); }; await mortal(); // dev-телепорт даёт неуязвимость — снять console.log('unequipped art', JSON.stringify((await S()).hero?.effective?.art || null).slice(0, 80));
  M = await me(); ev.length = 0; mark('bm-warden');
  const wd = await spawn('bmx_ash_warden', 90, 0); await sleep(300);
  let marc = null; for (let i = 0; i < 30 && !marc; i++) { marc = ev.find((e) => e.k === 'marc' && e.id === wd?.id); await sleep(200); }
  await sleep(60); await shot('14-black-warden-fire-arc'); await sleep(200); await shot('15-black-warden-arc-trail');
  t('чёрный страж: огненная дуга (marc r/a)', !!marc && marc.r > 0 && marc.a > 0, marc);
  await sleep(700); console.log('phits', JSON.stringify(ev.filter((e) => e.k === 'phit')).slice(0, 300)); const ph = ev.filter((e) => e.k === 'phit' && e.d > 0); t('страж ранит игрока в дуге', ph.length >= 1, ph.slice(0, 2));
  await kill('bmx_ash_warden'); await sleep(500);
  await mortal(); M = await me(); ev.length = 0; mark('bm-archer');
  const ar = await spawn('bmx_ember_archer', 170, 0); let pa = null; for (let i = 0; i < 50 && !pa; i++) { pa = ev.find((e) => e.bm && e.k === 'proj' && e.o === 'm' && e.mob === ar?.id); await sleep(150); }
  await sleep(150); await shot('16-black-archer-projectile'); console.log('arch', JSON.stringify(await mobPos(ar?.id)), JSON.stringify(await me()), JSON.stringify(ev.filter((e) => e.k !== 'mv').slice(-4)).slice(0, 400));
  t('чёрный стрелок: настоящий снаряд', !!pa, pa);
  await sleep(1200); await shot('17-black-archer-hit'); const pha = ev.filter((e) => e.k === 'phit' && e.d > 0); t('снаряд стрелка попал (phit)', pha.length >= 1, pha.slice(0, 2));
  // уклонение: дождаться следующего выстрела и отпрыгнуть
  await mortal(); ev.length = 0; let tl = null; for (let i = 0; i < 80 && !tl; i++) { tl = ev.find((e) => e.k === 'tele_line' && e.id === ar?.id); if (!tl) await sleep(40); }
  const dodgeAt = Date.now(); M = await me(); await G(([x, y]) => { window.__game.debug.tp(x, y, true); window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true } }); }, [M.x - 40, M.y + 260]); await sleep(250); await shot('18-black-archer-dodge');
  await sleep(700); const pb = ev.find((e) => e.k === 'proj' && e.o === 'm' && e.mob === ar?.id && e.at >= tl?.at); const phd = ev.filter((e) => e.k === 'phit' && e.d > 0 && e.at > dodgeAt && e.at < dodgeAt + 750);
  console.log('dodge', JSON.stringify({ tl, dodgeMs: dodgeAt - (tl?.at || 0) }));
  t('уклонение от снаряда стрелка: без урона', !!pb && phd.length === 0, { pb: !!pb, phd });
  await kill('bmx_ember_archer'); await sleep(400);
  await mortal(); M = await me(); ev.length = 0; mark('bm-seer');
  const se = await spawn('bmx_staff_seer', 170, 0); let ps = []; for (let i = 0; i < 60; i++) { ps = ev.filter((e) => e.bm && e.k === 'proj' && e.o === 'm'); if (ps.length >= 3) break; await sleep(120); }
  await sleep(100); await shot('19-black-seer-triple-staff');  await sleep(250); await shot('20-black-seer-triple-fan');
  const so = new Set(ps.slice(0, 3).map((e) => `${e.x},${e.y}`));
  t('чёрный жрец (3 посоха): 3 снаряда из 3 дул', ps.length >= 3 && so.size >= 3, ps.slice(0, 3));
  await kill('bmx_staff_seer'); await sleep(400);
  // чёрные против обычных: игрок-зритель в ~11 клетках
  M = await me(); mark('bm-vs-mobs');
  const w2 = await spawn('bmx_ash_warden', 0, -330), nm = await spawn('golem', 50, -330), a2 = await spawn('bmx_ember_archer', -200, -330), nm2 = await spawn('golem', -60, -330); ev.length = 0;
  let vs = { arc: 0, mh: 0, proj: 0 }; for (let i = 0; i < 40; i++) { vs = { arc: ev.filter((e) => e.k === 'marc' && e.id === w2?.id).length, mh: ev.filter((e) => e.k === 'hit' && [nm?.id, nm2?.id].includes(e.id) && e.d > 0).length, proj: ev.filter((e) => e.bm && e.k === 'proj').length }; if (vs.arc && vs.mh && vs.proj) break; await sleep(250); if (i === 6) await shot('21-black-vs-mobs'); }
  await shot('22-black-vs-mobs-2');
  t('чёрные бьют обычных мобов (дуга + снаряд + урон)', vs.arc > 0 && vs.mh > 0, vs);
  await clearNear(); await sleep(300);
  // ── 6. кузня: превью с тремя посохами — «Снарядов за выстрел: 3»
  await mortal(); await G(() => window.__game.debug.rawSend({ type: 'dev_grant', city: { clearKills: true } })); await sleep(300); // тест убил много мобов — купол не пустил бы «убийцу»
  await G(([x, y]) => window.__game.debug.tp(x, y, true), [ARR.x, ARR.y]); await sleep(2500); console.log('at city', JSON.stringify(await me())); // к городу: живые позиции NPC приходят только рядом
  let z = null; for (let i = 0; i < 20 && !z; i++) { z = await G(() => window.__game.debug.npcByName('Знахарь')); if (!z) await sleep(700); }
  if (z) { let dlg = false, stOk = false;
    for (let i = 0; i < 8 && !stOk; i++) { const q = await G((id) => window.__game.debug.npcAt(id), z.id); await G(([x, y]) => window.__game.debug.tp(x, y + 20, true), [q.x, q.y]); await sleep(900);
      if (!dlg) { await G((id) => window.__game.debug.rawSend({ type: 'npc_talk', npc: id }), z.id); await sleep(1200); dlg = await G(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Кузня Знахаря'))); if (dlg) { await G(() => ([...document.querySelectorAll('button')].find((b) => b.textContent.includes('Кузня Знахаря')))?.click()); await sleep(1200); } }
      if (!(await G(() => window.__game.forgeWin?.isOpen))) await G(() => window.__game.forgeWin.open()); else await G(() => window.__game.debug.send({ type: 'bm_forge_open' }));
      await sleep(1200); stOk = await G(() => !!window.__game.forgeWin?.st); console.log('forge try', i, 'dlg', dlg, 'st', stOk, JSON.stringify(q), JSON.stringify(await me()), await G(() => window.__game.state().world), fr.map((x) => x.slice(0, 160)).slice(-3)); fr.length = 0; }
    // знахарь ходит по городу — каждая операция у него рядом
    for (const id of ['fire_handle', 'fire_staff_arch', 'fire_b2staff_1', 'fire_b3staff_1', 'fire_crystal']) { const q = await G((id) => window.__game.debug.npcAt(id), z.id); await G(([x, y]) => window.__game.debug.tp(x, y + 20, true), [q.x, q.y]); await sleep(500); await G((id) => window.__game.debug.send({ type: 'bm_forge_craft', part: id }), id); await sleep(500); }
    await G(() => window.__game.debug.send({ type: 'bm_forge_open' })); await sleep(1200);
    await G(() => document.querySelector('[data-f="tab"][data-v="asm"]')?.click()); await sleep(600);
    for (const [k, id] of Object.entries({ handle: 'fire_handle', blade: 'fire_staff_arch', blade2: 'fire_b2staff_1', blade3: 'fire_b3staff_1', crystal: 'fire_crystal' })) { await G(([k, id]) => { const s = document.querySelector(`select[data-slot="${k}"]`); if (s) { s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); } }, [k, id]); await sleep(350); }
    await sleep(1500); const sh = await G(() => document.querySelector('[data-shots]')?.dataset.shots); await shot('23-forge-preview-3-projectiles');
    await sleep(500); await shot('24-forge-preview-3-projectiles-b');
    t('кузня: «Снарядов за выстрел: 3» + превью-выстрел', sh === '3', sh);
  } else t('Знахарь найден', false);
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
