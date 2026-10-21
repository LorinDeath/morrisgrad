// LOCAL: купол Альказака в настоящем клиенте — оболочка (0.9 снаружи / 0.02 внутри, плавный переход), обод, отталкивание убийцы
// с плашкой и отсчётом, моб у края не наносит урона внутри, убийства из-под купола не считаются. Снимки + GIF.
// Только 127.0.0.1 (guardLocal). Сервер: wrangler dev --local (MC_DEV_TRUST_USERID=1), клиент: vite 5297.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/dome';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CX = 24624, CY = 3376; let R = 1280;
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const gif = (dir, name, fps = 10) => { try { execFileSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/f%03d.png`, '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', `${OUT}/${name}.gif`]); return fs.statSync(`${OUT}/${name}.gif`).size; } catch (e) { console.log('gif', String(e)); return 0; } };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(assertLocalUrl(`${BASE}?name=dome_t&uid=dome_t&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  const G = (f, a) => p.evaluate(f, a);
  if ((await G(() => window.__game.state().player?.stats?.classId)) == null) { await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  const dev = async (o) => { await G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 8000 }); return G(() => window.__devCity); };
  const dome = () => G(() => window.__game.debug.city().dome);
  const hud = () => G(() => window.__game.debug.city().hud);
  const tp = async (x, y) => { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1800); };
  const cells = (c) => G((c) => window.__game.debug.setCells(c), c);
  const d0 = await dev({ pk: false, clearKills: true }); R = d0.city.r; t('сервер: R = 40 клеток = 1280 px', R === 1280, R);
  // ——— 1. снаружи: оболочка 0.9 ———
  await tp(CX + R + 420, CY); await cells(30); await sleep(2500);
  let dm = await dome(); t('купол готов (листы Историка загружены)', dm?.ready, dm);
  t('снаружи оболочка ≈ 0.9', dm && dm.shellA > 0.85, dm);
  await p.screenshot({ path: `${OUT}/01-outside-shell-0.9.png` });
  await cells(46); await sleep(1500); await p.screenshot({ path: `${OUT}/02-outside-wide.png` }); await cells(30);
  // ——— 2. вход: переход 0.9 → 0.02 (GIF) ———
  const g1 = `${OUT}/walk`; fs.rmSync(g1, { recursive: true, force: true }); fs.mkdirSync(g1);
  await tp(CX + R + 140, CY); await sleep(1200);
  const trace = []; let fi = 0;
  await p.mouse.move(640, 380); await p.keyboard.down('a');
  for (let i = 0; i < 26; i++) { await sleep(110); const s = await G(() => ({ x: Math.round(window.__game.state().player.x), a: window.__game.debug.city().dome.shellA })); trace.push(s); await p.screenshot({ path: `${g1}/f${String(fi++).padStart(3, '0')}.png` }); }
  await p.keyboard.up('a'); await sleep(1200);
  for (let i = 0; i < 6; i++) { await sleep(150); await p.screenshot({ path: `${g1}/f${String(fi++).padStart(3, '0')}.png` }); }
  dm = await dome(); const me = (await dev({})).me; t('внутри оболочка ≈ 0.02', dm.shellA < 0.05 && Math.hypot(me.x - CX, me.y - CY) < R, { dm, me });
  const fIn = dm.fade; t('переход плавный 0.9 → 0.02 по времени (≈0.6–0.8 с + пересечение края, не мгновенный)', fIn && fIn.dir === 'in' && fIn.ms >= 450 && fIn.ms <= 1600 && trace.some((s) => s.a > 0.1 && s.a < 0.8), { fade: fIn, trace });
  await p.screenshot({ path: `${OUT}/03-inside-shell-0.02.png` });
  // выход наружу
  await p.keyboard.down('d'); for (let i = 0; i < 24; i++) { await sleep(110); await p.screenshot({ path: `${g1}/f${String(fi++).padStart(3, '0')}.png` }); } await p.keyboard.up('d'); await sleep(1200);
  for (let i = 0; i < 6; i++) { await sleep(150); await p.screenshot({ path: `${g1}/f${String(fi++).padStart(3, '0')}.png` }); }
  dm = await dome(); t('снова снаружи — оболочка вернулась к 0.9', dm.shellA > 0.85, dm);
  t('выход: переход 0.02 → 0.9 тоже плавный', dm.fade && dm.fade.dir === 'out' && dm.fade.ms >= 450 && dm.fade.ms <= 1600, dm.fade);
  t('GIF вход/выход', gif(g1, 'dome-walk-in-out', 9) > 20000);
  // ——— 3. убийца (5 мобов за 10 мин) — купол отталкивает, плашка с отсчётом (GIF) ———
  await dev({ clearKills: true }); await dev({ mobKills: 5 }); await sleep(600);
  await tp(CX + R + 90, CY); await cells(22); await sleep(1500);
  const g2 = `${OUT}/repel`; fs.rmSync(g2, { recursive: true, force: true }); fs.mkdirSync(g2); fi = 0;
  await p.keyboard.down('a'); let sawRep = 0, sawDeny = null;
  for (let i = 0; i < 26; i++) { await sleep(90); const s = await G(() => ({ d: window.__game.debug.city().dome, h: window.__game.debug.city().hud })); sawRep = Math.max(sawRep, s.d.repel); sawDeny = sawDeny || s.h.deny; await p.screenshot({ path: `${g2}/f${String(fi++).padStart(3, '0')}.png` }); if (i === 12) await p.screenshot({ path: `${OUT}/04-killer-repelled.png` }); }
  await p.keyboard.up('a'); await sleep(400);
  const kq = (await dev({})).me; const kh = await hud();
  t('убийца остался снаружи (позиция сервера)', Math.hypot(kq.x - CX, kq.y - CY) > R, kq);
  t('эффект отталкивания на ободе', sawRep > 0, sawRep);
  t('плашка «купол не пускает» с причиной', /мобов/.test(sawDeny || kh.deny || ''), { sawDeny, kh });
  const cd = await G(() => document.querySelector('.ch-deny-n')?.textContent || ''); t('отсчёт на плашке', /ещё/.test(cd) || /мин/.test(sawDeny || ''), cd);
  await p.screenshot({ path: `${OUT}/05-deny-banner-countdown.png` });
  for (let i = 0; i < 8; i++) { await sleep(120); await p.screenshot({ path: `${g2}/f${String(fi++).padStart(3, '0')}.png` }); }
  t('GIF отталкивания', gif(g2, 'dome-killer-repel', 12) > 20000);
  // PK-режим — тоже отталкивает
  await dev({ clearKills: true, pk: true }); await tp(CX + R + 90, CY); await p.keyboard.down('a'); await sleep(1800); await p.keyboard.up('a'); await sleep(500);
  const pq = (await dev({})).me, ph = await hud(); t('PK: купол не пускает', Math.hypot(pq.x - CX, pq.y - CY) > R, pq);
  t('PK: плашка про PK-режим', /PK/.test(ph.deny || ''), ph); await p.screenshot({ path: `${OUT}/06-pk-repelled.png` });
  await dev({ pk: false, clearKills: true });
  // ——— 4. моб атакует у края: внутри урон 0 ———
  const ex = CX + R - 30, ey = CY; await tp(ex, ey); await cells(18); await sleep(800);
  const mortal = async () => { await G(() => window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true } })); await sleep(500); }; // dev-телепорт даёт неуязвимость — снять, иначе «урон 0» ничего не доказывает
  await mortal();
  const hp0 = (await dev({})).hp, b0 = (await dev({})).blocked;
  let dd = await dev({ mobAt: [CX + R + 34, CY] }); for (let i = 0; i < 10; i++) { await sleep(700); dd = await dev({}); if (i === 4) await p.screenshot({ path: `${OUT}/07-mob-at-edge-no-damage.png` }); }
  const meIn = dd.me; t('игрок внутри у края', Math.hypot(meIn.x - CX, meIn.y - CY) < R, meIn);
  t('моб рядом (за краем, вытолкнут)', dd.mob && Math.hypot(dd.mob.x - CX, dd.mob.y - CY) >= R - 2, dd.mob);
  t('ОЗ не убыли (урон 0 внутри)', dd.hp >= hp0, { hp0, hp: dd.hp });
  console.log('mob natural swings blocked by dome:', dd.blocked - b0, 'mob', dd.mob);
  const hb = await dev({ domeHit: 5 }); t('5 ударов моба внутри (тот же путь, что ИИ) — урон 0, все заблокированы', hb.hp >= hp0 && hb.blocked - dd.blocked >= 5, { hp0, hp: hb.hp, blocked: hb.blocked - dd.blocked });
  // снаружи тот же моб бьёт (контроль)
  await tp(CX + R + 80, CY); await mortal(); await dev({ mobAt: [CX + R + 112, CY] }); let hpOut = null; for (let i = 0; i < 12; i++) { await sleep(700); const q = await dev({}); hpOut = q.hp; if (hpOut < hp0) break; }
  const natural = hpOut < hp0; if (!natural) hpOut = (await dev({ domeHit: 2 })).hp;
  t('контроль: снаружи моб бьёт (ОЗ убывают)', hpOut < hp0, { hp0, hpOut, natural }); await tp(CX, CY + 160); await sleep(1500);
  // ——— 4b. пустых клеток под куполом нет (карта + заливка очернённой землёй), кромка льда за R ———
  const emp = await G(() => window.__game.debug.cityEmpty?.()); t('пустых клеток внутри купола: 0', emp === 0, emp);
  for (const [n, x, y] of [['08-edge-west-filled', CX - R + 120, CY + 200], ['09-edge-north-filled', CX - 300, CY - R + 140], ['10-edge-se-filled', CX + 860, CY + 860]]) { await tp(x, y); await cells(30); await sleep(1500); await p.screenshot({ path: `${OUT}/${n}.png` }); }
  // ——— 5. убийство из-под купола не считается: чистая проверка журнала (dev pvp из купола) ———
  const k0 = await dev({ clearKills: true }); await tp(CX + 200, CY); const kd = await dev({ domeKill: true }); t('убийство из-под купола не засчитано', (kd.p || 0) === 0 && (kd.m || 0) === 0, kd);
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  console.log(`city-dome: ${ok} ok, ${bad} fail`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
