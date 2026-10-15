// Аринар 48000: хаб, 4 биома (тайлсеты, перекрашенные мобы, свет/HUD биома), босс биома, проклятый, выбор цели кликом,
// мини-карта, стрим чанков, мобильная раскладка. Скриншоты → /workspace/morrisgrad-round2/arinar-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
// координаты — «семена» ближайших к хабу пятен каждого биома (zoneGen ARINAR_PATCHES, детерминированно)
// ближайшие к хабу лагеря каждого биома при текущем сиде (пересчитано 15.10.2026: раскладка мира менялась)
const BIO = [
  ['ice', 'Кровавые льды', 25154, 28989],
  ['fire', 'Синее пламя', 18261, 20917],
  ['stone', 'Железные каменоломни', 16222, 23693],
  ['air', 'Звёздная высь', 26175, 18540],
];
const PATCH2 = {"ice": [20300, 33560, 10], "fire": [31430, 7949, 7], "stone": [33910, 12726, 17], "air": [29031, 29285, 18]}; // второе пятно того же биома в другом месте карты
// ice: у лагеря из 13 ледяных мобов (центр ~20300,33300; лагеря детерминированы сидом мира) — раньше точка была пустой и тест зависел от бродячих мобов
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
    await G(A, ([x, y]) => window.__game.debug.tp(x, y), [x, y]); // у лагеря пятна (координаты из zone.camps)
    await A.waitForTimeout(5500);
    const mobs = await G(A, () => window.__game.debug.zoneMobs());
    let own = mobs.filter((m) => m.type.startsWith(id + '_'));
    if (own.length < 2) { await A.waitForTimeout(4000); own = (await G(A, () => window.__game.debug.zoneMobs())).filter((m) => m.type.startsWith(id + '_')); }
    // AOI сервера под камеру 45 клеток (~±900 px): если пачка дальше — обходим пятно шагами по 800 px
    for (const [dx, dy] of [[450, 0], [-450, 0], [0, 450], [0, -450], [450, 450], [-450, -450], [450, -450], [-450, 450], [900, 0], [-900, 0], [0, 900], [0, -900]]) {
      if (own.length >= 2) break;
      await G(A, ([x, y]) => window.__game.debug.tp(x, y), [x + dx, y + dy]); await A.waitForTimeout(3000);
      own = (await G(A, () => window.__game.debug.zoneMobs())).filter((m) => m.type.startsWith(id + '_'));
    }
    const atmo = await G(A, () => window.__game.debug.atmo());
    const vars = await G(A, () => window.__game.debug.biomeVars());
    ch = (await G(A, () => window.__game.debug.chunks())) || {};
    const near = own[0]; // кадр: встаём рядом с ближайшей пачкой биома
    if (near) { await G(A, ([x, y]) => window.__game.debug.tp(x - 170, y + 90), [near.x, near.y]); await A.waitForTimeout(2200); }
    ok(own.length >= 2, `${id}: ${own.length} tinted ${id}_* mobs nearby (${[...new Set(own.map((m) => m.type))].join(', ')})`);
    ok(atmo.mood === 'b_' + id && vars.biome === 'b_' + id && vars.col, `${id}: ambient mood + HUD theme ${JSON.stringify(vars)}`);
    ok(ch.live <= 42, `(cap 42, 8aabadf) ${id}: chunks live ${ch.live}, baked ${ch.baked}, evicted ${ch.evicted}, ~${ch.bakeMs}ms/chunk`);
    await A.screenshot({ path: `${OUT}/arinar-0${i++}-${id}.png` });
  }
  // Minecraft-подобная генерация: то же «Кровавые льды» в другом месте карты
  {
    const [x, y, n] = PATCH2.ice;
    await G(A, ([x, y]) => window.__game.debug.tp(x, y), [x, y]); await A.waitForTimeout(2500);
    // детерминированно: ждём (до 20 с) и копим id ледяных мобов в патче — мобы бродят, дерутся, спят и респавнятся,
    // а настроение биома ждём, пока стрим чанков и атмосфера не догонят телепорт
    let best = 0; let vars = {};
    for (let k = 0; k < 40 && (best < 2 || vars.biome !== 'b_ice'); k++) {
      best = Math.max(best, (await G(A, () => window.__game.debug.zoneMobs())).filter((m) => m.type.startsWith('ice_')).length); // максимум за опрос (у zoneMobs нет id)
      vars = await G(A, () => window.__game.debug.biomeVars());
      if (best < 2 && k % 8 === 7) await G(A, ([x, y]) => window.__game.debug.tp(x + 1, y), [x, y]); // повторная привязка к точке (AOI)
      await A.waitForTimeout(500);
    }
    const own = { length: best };
    if (best < 2) console.log('DBG ice2', JSON.stringify(await G(A, () => window.__game.debug.pos())), JSON.stringify((await G(A, () => window.__game.debug.zoneMobs())).slice(0, 8).map((m) => [m.type, m.x, m.y])));
    ok(own.length >= 2 && vars.biome === 'b_ice', `second ice patch #${n} at ${x},${y}: ${own.length} ice mobs, mood ${vars.biome}`);
    await A.screenshot({ path: `${OUT}/arinar-11-ice-patch2.png` });
    await A.mouse.click(1440 - 120, 120).catch(() => {});
  }
  // порядок слоёв: летун ПОЗАДИ игрока (выше по экрану) не должен рисоваться поверх героя; наземный моб спереди — поверх
  {
    const me = await G(A, () => window.__game.debug.pos());
    await G(A, ([x, y]) => { window.__game.debug.devSpawn('ice_night_bat', x + 6, y - 28); window.__game.debug.devSpawn('ice_dew_slime', x + 10, y + 34); }, [me.x, me.y]);
    await A.waitForTimeout(1500);
    for (let k = 0; k < 4; k++) { await A.mouse.wheel(0, -400); await A.waitForTimeout(150); } // приблизить
    await A.waitForTimeout(800);
    await A.screenshot({ path: `${OUT}/arinar-12-zorder.png` });
    for (let k = 0; k < 4; k++) { await A.mouse.wheel(0, 400); await A.waitForTimeout(150); }
  }
  // навык класса в открытом мире — направленный: моб впереди получает урон, позади — нет (сервер)
  {
    const me = await G(A, () => window.__game.debug.pos());
    void me; const X = 24000, Y = 25400; // вне безопасного круга хаба (1200), но ближе 1500 — лагерей тут нет
    await G(A, ([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.tp(x, y); }, [X, Y]); await A.waitForTimeout(1500); // и на сервере: навык летит из серверной позиции героя
    await G(A, () => window.__game.debug.rawSend({ type: 'move', x: window.__game.debug.pos().x, y: window.__game.debug.pos().y }));
    await G(A, ([x, y]) => { window.__game.debug.devSpawn('fire_imp', x + 200, y); window.__game.debug.devSpawn('fire_imp', x - 420, y); /* задний дальше: мобы идут на героя и раньше успевали войти в радиус взрыва 110 px */ }, [X, Y]);
    await A.waitForTimeout(350); // мобы ближе (±200): огненный шар — настоящий снаряд, взрывается на первом мобе на пути
    const before = (await G(A, () => window.__game.debug.zoneMobsFull())).filter((m) => m.type === 'fire_imp' && Math.hypot(m.x - X, m.y - Y) < 480);
    const ab = await G(A, () => window.__game.debug.abilities());
    const id = ab.includes('fireball') ? 'fireball' : ab[0];
    await G(A, (id) => window.__game.debug.rawSend({ type: 'zone_ability', id, dx: 1, dy: 0 }), id);
    await A.waitForTimeout(400);
    await A.screenshot({ path: `${OUT}/arinar-13-ability-dir.png` });
    await A.waitForTimeout(1200);
    const after = await G(A, () => window.__game.debug.zoneMobsFull());
    const hpOf = (m) => (after.find((a) => a.id === m.id) || { hp: 0 }).hp;
    if (!before.length) console.log('DBG ability', X, Y, JSON.stringify((await G(A, () => window.__game.debug.zoneMobsFull())).filter((m) => Math.hypot(m.x - X, m.y - Y) < 400)), JSON.stringify(await G(A, () => window.__game.debug.pos())));
    // ближайшие спереди/сзади (на dev-сервере копятся мобы прошлых прогонов на ±320/±200 — шар бьёт ПЕРВОГО на пути)
    const near1 = (side) => before.filter((m) => side * (m.x - X) > 0 && Math.abs(m.y - Y) < 40 && Math.abs(m.x - X) < 480).sort((p, q) => Math.abs(p.x - X) - Math.abs(q.x - X))[0];
    const front = near1(1), back = near1(-1);
    if (!(front && hpOf(front) < front.hp)) console.log('DBG fireball', JSON.stringify(await G(A, () => window.__game.debug.projs())), JSON.stringify(before), JSON.stringify(after.filter((m) => Math.hypot(m.x - X, m.y - Y) < 500).map((m) => [m.id, m.type, m.x, m.y, m.hp])), JSON.stringify(await G(A, () => window.__game.debug.pos())));
    ok(front && back && hpOf(front) < front.hp && hpOf(back) === back.hp, `ability «${id}» → east: front ${front?.hp}→${front && hpOf(front)}, back ${back?.hp}→${back && hpOf(back)}`);
  }
  // босс биома + проклятый: dev-спавн рядом
  await G(A, () => window.__game.book?.close?.()); await A.keyboard.press('Escape'); // книга с прошлого шага перекрывала канвас — клик не доходил до моба
  // босс и проклятый моб — прямо у героя (координаты старого пятна огня устарели)
  { const [bx, by] = [18261, 20917]; await G(A, ([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.tp(x, y); }, [bx, by]); await A.waitForTimeout(2500);
    await G(A, ([x, y]) => { window.__game.debug.devSpawn('fire_warden', x + 220, y - 70); window.__game.debug.devSpawn('fire_imp', x - 170, y + 50, true); }, [bx, by]); }
  await A.waitForTimeout(2500);
  const ms = await G(A, () => window.__game.debug.zoneMobsFull());
  const boss = ms.find((m) => m.type === 'fire_warden'), cur = ms.find((m) => m.cursed && m.type === 'fire_imp') || ms.find((m) => m.cursed && m.id !== boss?.id);
  ok(!!boss && !!cur, `biome boss fire_warden + cursed mob visible (${cur?.type})`);
  if (boss) {
    const sp = await G(A, ([x, y]) => window.__game.debug.screenOf(x, y), [boss.x, boss.y]);
    console.log('DBG click', JSON.stringify(sp), await G(A, ([x, y]) => { let e = document.elementFromPoint(x, y); const o = []; while (e && o.length < 5) { o.push(e.className + ':' + (e.textContent || '').slice(0, 30)); e = e.parentElement; } return o.join(' < '); }, [sp.x, sp.y]), JSON.stringify(await G(A, () => ({ pos: window.__game.debug.pos(), mode: window.__game.state().mode, book: !!window.__game.book?.isOpen }))));
    await A.mouse.click(sp.x, sp.y);
    await A.waitForTimeout(1200);
    // верхнюю панель цели убрали (r6): клик выделяет моба (кольцо), имя/уровень — на табличке над мобом
    { const sel = await G(A, () => window.__game.debug.selected()); const sm = (await G(A, () => window.__game.debug.zoneMobsFull())).find((m) => m.id === sel); // на dev-сервере рядом копятся мобы прошлых прогонов — клик выбирает ближайшего под курсором
      ok(sel === boss.id || (sm && Math.hypot(sm.x - boss.x, sm.y - boss.y) < 60), `click selects mob under cursor (ring): sel ${sel}, boss ${boss.id}`); }
    await A.screenshot({ path: `${OUT}/arinar-07-boss-target.png` });
  }
  if (cur) {
    const sp = await G(A, ([x, y]) => window.__game.debug.screenOf(x, y), [cur.x, cur.y]);
    await A.mouse.click(sp.x, sp.y); await A.waitForTimeout(1200);
    const sel = await G(A, () => window.__game.debug.selected()); const cm = (await G(A, () => window.__game.debug.zoneMobsFull())).find((m) => m.id === cur.id);
    const sm2 = (await G(A, () => window.__game.debug.zoneMobsFull())).find((m) => m.id === sel);
    ok((sel === cur.id && cm?.cursed) || (sm2 && Math.hypot(sm2.x - cur.x, sm2.y - cur.y) < 60), `click selects mob under cursor (sel ${sel}, cursed ${cm?.cursed})`);
    await A.screenshot({ path: `${OUT}/arinar-08-cursed.png` });
  }
  await G(A, () => window.__game.debug.tp(24000, 24150));
  await A.waitForTimeout(3000);
  const vars = await G(A, () => window.__game.debug.biomeVars());
  ok(!vars.biome, 'back in hub: HUD returns to default gold');
  await shotMM(A, 'arinar-09-minimap-hub.png');
  // залп кинжалов (разбойник): 2 снаряда веером на одно нажатие (сервер — shot ×2)
  {
    const R = await open('ArR');
    await G(R, () => window.__game.debug.selectClass('rogue')); await R.waitForTimeout(2500);
    await toArinar(R); await R.waitForTimeout(2500);
    await G(R, () => window.__game.debug.tp(24000, 26200)); await R.waitForTimeout(1500); // вне безопасного хаба (r 1200)
    await G(R, () => { window.__game.debug.devSpawn('dew_slime', 24230, 26170); window.__game.debug.devSpawn('dew_slime', 24230, 26240); }); await R.waitForTimeout(800);
    let shots = 0;
    R.on('websocket', () => {});
    await G(R, () => { window.__shots = 0; const z = window.__game.zone || null; });
    const sp = await G(R, () => { const p = window.__game.debug.pos(); return window.__game.debug.screenOf(p.x + 220, p.y); });
    void sp; await R.keyboard.press('v'); await R.waitForTimeout(300); // автоатака по ближайшему мобу
    await R.waitForTimeout(700); shots = await G(R, () => window.__game.debug.projs().spawned['p:auto_daggers'] || 0); // залп — снаряды сервера (шаг 9)
    await R.screenshot({ path: `${OUT}/arinar-14-daggers-volley.png` }); await R.keyboard.press('v');
    ok(shots >= 2, `daggers volley: ${shots} server projectiles from autoattack`);
  }
  // мобильный
  const M = await open('ArM', true);
  await G(M, () => window.__game.debug.selectClass('mage')); await M.waitForTimeout(2500);
  await toArinar(M);
  await G(M, () => window.__game.debug.tp(19677, 29480)); // у лагеря ледяного пятна
  await M.waitForTimeout(6000);
  await M.screenshot({ path: `${OUT}/arinar-10-mobile-ice.png` });
  ch = await G(M, () => window.__game.debug.chunks());
  ok(ch && ch.live <= 28, `mobile: chunk cap ${JSON.stringify(ch)}`);
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
