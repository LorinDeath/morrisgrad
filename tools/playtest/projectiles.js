// Настоящие снаряды (шаг 9): сервер ведёт снаряд, урон — при касании; клиент рисует атлас projectiles.png.
// Проверки: автоатака посоха → {proj} auto_staff в полёте, без локального прогноза; навыки Q/G/F; снаряды мобов (стрелки лагеря);
// витрина атласа (все виды). Скриншоты projectiles-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:5199/game.html?name=Proj&uid=test_proj_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
    await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
  }
  const CX = 24746, CY = 26870;
  const X = CX, Y = CY + 260;
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X, Y]); await p.waitForTimeout(4000);
  await G(() => window.__game.debug.setCells(16)); await p.waitForTimeout(800);
  ok(await G(() => window.__game.debug.projs().ready), 'атлас projectiles.png загружен');
  // автоатака вверх, к лагерю: снаряд приходит событием сервера и летит
  let seen = new Set(), maxLive = 0, shotAt = 0;
  for (let i = 0; i < 14; i++) {
    await G(() => window.__game.debug.rawSend({ type: 'zone_attack', dx: 0, dy: -1 }));
    if (i === 6) await p.screenshot({ path: `${OUT}/projectiles-staff.png` });
    for (let k = 0; k < 4; k++) { const s = await G(() => window.__game.debug.projs()); s.kinds.forEach((t) => seen.add(t)); Object.keys(s.spawned).forEach((t) => seen.add(t)); maxLive = Math.max(maxLive, s.live); await p.waitForTimeout(110); }
  }
  ok(seen.has('p:auto_staff'), `автоатака посоха: снаряд сервера auto_staff в полёте (виды: ${[...seen].join(', ')}, max ${maxLive})`);
  // навыки
  const before = new Set(seen);
  await p.mouse.move(720, 200);
  const abl = await G(() => window.__game.debug.abilities()); console.log('навыки:', JSON.stringify(abl));
  for (const id of [...(abl || []).map((x) => x.id || x), 'rs']) { await G((id) => window.__game.debug.rawSend({ type: 'zone_ability', id, dx: 0, dy: -1 }), id); await p.waitForTimeout(350); for (let k = 0; k < 5; k++) { { const s = await G(() => window.__game.debug.projs()); s.kinds.forEach((t) => seen.add(t)); Object.keys(s.spawned).forEach((t) => seen.add(t)); } await p.waitForTimeout(80); } }
  await p.screenshot({ path: `${OUT}/projectiles-skills.png` });
  ok(seen.has('p:fireball'), `навык Q «Огненный шар» — снаряд героя с сервера (виды: ${[...seen].join(', ')})`);
  // мобы стреляют в героя (бессмертие dev_teleport god)
  const mobKinds = new Set(['ice_fan', 'fire_spark', 'spear', 'chain_bolt', 'thorn_bow', 'fireball']);
  let mobShot = false;
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [CX + 40, CY + 150]);
  for (let i = 0; i < 40 && !mobShot; i++) { const s = await G(() => window.__game.debug.projs()); if (s.kinds.some((t) => t.startsWith('m:') && mobKinds.has(t.slice(2)))) { mobShot = true; await p.screenshot({ path: `${OUT}/projectiles-mobs.png` }); } await p.waitForTimeout(150); }
  ok(mobShot || [...seen].some((t) => t.startsWith('m:')), 'снаряды мобов приходят с сервера и рисуются');
  // витрина: все виды атласа
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X + 1400, Y + 1400]); await p.waitForTimeout(2500);
  const n = await G(() => window.__game.debug.projDemo()); await p.waitForTimeout(450);
  const s = await G(() => window.__game.debug.projs());
  ok(n >= 22 && s.live >= 22, `витрина атласа: ${s.live} снарядов, ${s.fx} эффектов`);
  await p.screenshot({ path: `${OUT}/projectiles-atlas.png` });
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
