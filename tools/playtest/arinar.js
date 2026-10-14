// Аринар 48000: хаб, 4 биома (тайлсеты, перекрашенные мобы, свет/HUD биома), босс биома, проклятый, выбор цели кликом,
// мини-карта, стрим чанков, мобильная раскладка. Скриншоты → /workspace/morrisgrad-round2/arinar-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
const BIO = [
  ['ice', 'Кровавые льды', 16000, 16000], ['fire', 'Синее пламя', 32800, 14000], ['stone', 'Железные каменоломни', 24000, 34000], ['air', 'Звёздная высь', 14800, 24000],
];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n, mobile) => {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' } : { viewport: { width: 1440, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e).slice(0, 300)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=test_r2_ar_${n}_${Date.now()}&ws=ws://127.0.0.1:8787${mobile ? '' : '&fs=1'}&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const toArinar = async (p) => {
    for (let i = 0; i < 8 && (await G(p, () => window.__game.state().world)) !== 'arinar'; i++) {
      await G(p, () => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
      await G(p, () => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1500);
    }
  };
  const A = await open('ArA');
  await G(A, () => window.__game.debug.selectClass('mage')); await A.waitForTimeout(2500);
  await toArinar(A);
  await A.waitForTimeout(4000);
  await A.mouse.move(700, 400); for (let k = 0; k < 3; k++) { await A.mouse.wheel(0, 400); await A.waitForTimeout(150); } // отдалить камеру
  let pos = await G(A, () => window.__game.debug.pos());
  ok((await G(A, () => window.__game.state().world)) === 'arinar' && Math.hypot(pos.x - 24000, pos.y - 24150) < 200, `portal → central hub ${JSON.stringify(pos)}`);
  let ch = await G(A, () => window.__game.debug.chunks());
  ok(ch && ch.live >= 9 && ch.live <= 30, `chunk streaming: ${JSON.stringify(ch)}`);
  await A.screenshot({ path: `${OUT}/arinar-01-hub.png` });
  const shotMM = async (p, name) => p.locator('.hud-minimap-card canvas').first().screenshot({ path: `${OUT}/${name}` }).catch(() => {});
  await shotMM(A, 'arinar-02-minimap-world.png');
  let i = 3;
  for (const [id, name, x, y] of BIO) {
    await G(A, ([x, y]) => window.__game.debug.tp(x, y), [x, y]);
    await A.waitForTimeout(5500);
    const mobs = await G(A, () => window.__game.debug.zoneMobs());
    const own = mobs.filter((m) => m.type.startsWith(id + '_'));
    const atmo = await G(A, () => window.__game.debug.atmo());
    const vars = await G(A, () => window.__game.debug.biomeVars());
    ch = (await G(A, () => window.__game.debug.chunks())) || {};
    const near = own[0]; // кадр: встаём рядом с ближайшей пачкой биома
    if (near) { await G(A, ([x, y]) => window.__game.debug.tp(x - 170, y + 90), [near.x, near.y]); await A.waitForTimeout(2200); }
    ok(own.length >= 2, `${id}: ${own.length} tinted ${id}_* mobs nearby (${[...new Set(own.map((m) => m.type))].join(', ')})`);
    ok(atmo.mood === 'b_' + id && vars.biome === 'b_' + id && vars.col, `${id}: ambient mood + HUD theme ${JSON.stringify(vars)}`);
    ok(ch.live <= 30, `${id}: chunks live ${ch.live}, baked ${ch.baked}, evicted ${ch.evicted}, ~${ch.bakeMs}ms/chunk`);
    await A.screenshot({ path: `${OUT}/arinar-0${i++}-${id}.png` });
  }
  // босс биома + проклятый: dev-спавн рядом
  await G(A, () => window.__game.debug.tp(32800, 14000)); await A.waitForTimeout(800);
  await G(A, () => { window.__game.debug.devSpawn('fire_warden', 33020, 13930); window.__game.debug.devSpawn('fire_imp', 32630, 14050, true); });
  await A.waitForTimeout(2500);
  const ms = await G(A, () => window.__game.debug.zoneMobsFull());
  const boss = ms.find((m) => m.type === 'fire_warden'), cur = ms.find((m) => m.cursed && m.type === 'fire_imp') || ms.find((m) => m.cursed && m.id !== boss?.id);
  ok(!!boss && !!cur, `biome boss fire_warden + cursed mob visible (${cur?.type})`);
  if (boss) {
    const sp = await G(A, ([x, y]) => window.__game.debug.screenOf(x, y), [boss.x, boss.y]);
    await A.mouse.click(sp.x, sp.y);
    await A.waitForTimeout(1200);
    const t = await G(A, () => window.__game.debug.target());
    ok(t?.kind === 'mob' && /Страж Синего Пламени/.test(t.name) && /ур\. 10/.test(t.typeLabel) && /^\d+ \/ \d+$/.test(t.hp), `click → target panel ${JSON.stringify(t)}`);
    ok((await G(A, () => window.__game.debug.selected())) === boss.id, 'selected mob highlighted (ring)');
    await A.screenshot({ path: `${OUT}/arinar-07-boss-target.png` });
  }
  if (cur) {
    const sp = await G(A, ([x, y]) => window.__game.debug.screenOf(x, y), [cur.x, cur.y]);
    await A.mouse.click(sp.x, sp.y); await A.waitForTimeout(1200);
    const t = await G(A, () => window.__game.debug.target());
    ok(t?.kind === 'mob' && /Проклятый/.test(t.typeLabel) && /✦/.test(t.typeLabel), `cursed target shows tag + skills ${JSON.stringify(t)}`);
    await A.screenshot({ path: `${OUT}/arinar-08-cursed.png` });
  }
  await G(A, () => window.__game.debug.tp(24000, 24150));
  await A.waitForTimeout(3000);
  const vars = await G(A, () => window.__game.debug.biomeVars());
  ok(!vars.biome, 'back in hub: HUD returns to default gold');
  await shotMM(A, 'arinar-09-minimap-hub.png');
  // мобильный
  const M = await open('ArM', true);
  await G(M, () => window.__game.debug.selectClass('mage')); await M.waitForTimeout(2500);
  await toArinar(M);
  await G(M, () => window.__game.debug.tp(16000, 16000));
  await M.waitForTimeout(6000);
  await M.screenshot({ path: `${OUT}/arinar-10-mobile-ice.png` });
  ch = await G(M, () => window.__game.debug.chunks());
  ok(ch && ch.live <= 20, `mobile: chunk cap ${JSON.stringify(ch)}`);
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
