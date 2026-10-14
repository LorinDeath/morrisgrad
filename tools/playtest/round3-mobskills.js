// Раунд 3, задача 14: монстры применяют навыки героев по игроку (телеграф на земле → удар). Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local');
const OUT = '/workspace/morrisgrad-round3';
const SK = ['meteor', 'leap_strike', 'spear_rain', 'pierce', 'frost_nova'];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const ev = { tele: 0, names: new Set(), kinds: new Set(), admin: [] }; let shotReq = 0;
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload);
    if (s.includes('admin_result')) ev.admin.push(s.slice(0, 160));
    for (const m of s.matchAll(/"k":"(tele_\w+|tele)"/g)) { ev.tele++; ev.kinds.add(m[1]); shotReq++; }
    for (const m of s.matchAll(/"k":"mskill"[^}]*"name":"([^"]+)"/g)) ev.names.add(m[1]); }));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  const go = async (x, y, god = true) => { await G(([x, y, god]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god }); window.__game.debug.teleport(x, y); }, [x, y, god]); await p.waitForTimeout(3500); };
  await go(24000, 20500);
  const me = await G(() => window.__game.state().me || null);
  const mobs = await G(() => window.__game.debug.zoneMobs());
  const c = mobs.filter((m) => !m.elite && !m.chief).sort((a, z) => Math.hypot(a.x - 24000, a.y - 20500) - Math.hypot(z.x - 24000, z.y - 20500))[0];
  ok(!!c, 'рядом есть моб: ' + (c && c.type));
  await G(([t, sk]) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'mob', id: t, patch: { skills: sk } }), [c.type, SK]); await p.waitForTimeout(4500);
  ok(ev.admin.some((s) => s.includes('"ok":true')), 'админка: навыки героя назначены мобу ' + c.type);
  let shots = 0, lastShot = 0;
  for (let i = 0; i < 40 && shots < 4; i++) {
    const cur = (await G(() => window.__game.debug.zoneMobs())).filter((m) => m.type === c.type).sort((a, z) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(z.x - c.x, z.y - c.y))[0] || c;
    if (i % 5 === 0) await go(cur.x + 160, cur.y, true);
    else await p.waitForTimeout(500);
    if (shotReq > lastShot) { lastShot = shotReq; await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/r3-mob-heroskill-${++shots}.png` }); }
  }
  ok(ev.tele > 0, `телеграфы на земле: ${ev.tele} (${[...ev.kinds].join(', ')})`);
  ok([...ev.names].length > 0, 'названия навыков над мобом: ' + [...ev.names].join(', '));
  ok(shots > 0, `скриншоты: ${shots}`);
  await G((t) => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'mob', id: t }), c.type); await p.waitForTimeout(1500);
  ok(!blocked.length, 'ни одного не локального запроса ' + blocked.slice(0, 3).join(' '));
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
