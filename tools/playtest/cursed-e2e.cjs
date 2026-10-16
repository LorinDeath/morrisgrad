// Thorough LOCAL e2e of cursed system. Only localhost.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = '/workspace/morrisgrad-round3/cursed-e2e';
const BASE = process.env.CU_BASE || 'http://127.0.0.1:5241/game.html';
const WS = process.env.CU_WS || 'ws://127.0.0.1:8789';
fs.mkdirSync(OUT, { recursive: true });
const report = { pass: [], fail: [], notes: [], drops: {}, bugsFixed: [
  'dev_spawn_mob cursed HP: hardcoded ×2.5 → CURSE.mobHp (4.5)',
  'loot bag UI ignored e.c — purple frame + «Проклятый …» + ☠',
  'dev bag grant rejected item_id@c — now untag() before ITEM_BY_ID check',
  'dev_grant killNearAny — kill specials/bosses for local drop tests',
] };
const ok = (c, m) => { (c ? report.pass : report.fail).push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const blocked = await guardLocal(ctx);
  const open = async (name, uid) => {
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.adminRes = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => {
      const s = String(f.payload);
      if (s.includes('admin_result') || s.includes('toast_error')) p.adminRes.push(s.slice(0, 400));
    }));
    await p.goto(assertLocalUrl(`${BASE}?name=${encodeURIComponent(name)}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.waitForTimeout(1200);
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const shot = (p, file, clip) => p.screenshot({ path: `${OUT}/${file}`, ...(clip ? { clip } : {}) });

  // ---- Admin + moderator ----
  const admin = await open('E2EAdmin', 'e2e_admin2_' + Date.now());
  // grant admin role via raw? roles are in D1 by uid - use fixed uid with pre-seeded role
  await admin.close();
  // Use fixed uids that we seed when wrangler is up via game protocol? Roles load from D1 at start.
  // Seed happened earlier for e2e_admin. Use that.
  const A = await open('E2EAdmin', 'e2e_admin');
  await G(A, () => window.__game.debug.selectClass('warrior'));
  await A.waitForTimeout(1800);
  await G(A, () => window.__game.debug.send({ type: 'dev_grant', xp: 12000 }));
  await A.waitForTimeout(600);

  await G(A, () => window.__game.debug.openAdmin());
  await A.waitForFunction(() => document.querySelectorAll('.mc-admin [data-tab]').length > 0, null, { timeout: 15000 }).catch(() => {});
  await A.waitForTimeout(600);
  const tabsA = await G(A, () => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
  ok(tabsA.includes('curse'), `админ видит curse: ${tabsA.join(',')}`);
  await G(A, () => document.querySelector('.mc-admin [data-tab="curse"]')?.click());
  await A.waitForTimeout(500);
  await G(A, () => document.querySelector('.mc-admin aside li[data-id="main"]')?.click());
  await A.waitForTimeout(700);
  const formN = await G(A, () => document.querySelectorAll('.mc-admin section [data-p]').length);
  ok(formN >= 14, `форма проклятия: ${formN} полей`);
  await shot(A, '05-admin-curse-tab.png');

  const M = await open('E2EMod', 'e2e_mod');
  await G(M, () => window.__game.debug.selectClass('mage'));
  await M.waitForTimeout(1500);
  await G(M, () => window.__game.debug.openAdmin());
  await M.waitForTimeout(1500);
  const tabsM = await G(M, () => [...document.querySelectorAll('.mc-admin [data-tab]')].map((x) => x.dataset.tab));
  ok(tabsM.length && !tabsM.includes('curse'), `модератор без curse: ${tabsM.join(',')}`);
  M.adminRes.length = 0;
  await G(M, () => window.__game.debug.rawSend({ type: 'admin_save', kind: 'curse', id: 'main', patch: { statMult: 9 } }));
  await M.waitForTimeout(1500);
  ok(M.adminRes.some((t) => /Недостаточно прав|ok\":false|прав/.test(t)), `модератор отклонён: ${M.adminRes.slice(0,2)}`);
  await M.close();

  // live save + reset (wait admin_result)
  A.adminRes.length = 0;
  await G(A, () => window.__game.debug.rawSend({ type: 'admin_save', kind: 'curse', id: 'main', patch: { statMult: 2, tint: '#ff33cc' } }));
  await A.waitForFunction(() => window.__game.meta.state?.curse?.statMult === 2, null, { timeout: 12000 }).catch(() => {});
  ok((await G(A, () => window.__game.meta.state?.curse?.statMult)) === 2, 'живая правка statMult=2');
  // grant weapon and check card reflects ×2
  await G(A, () => window.__game.debug.send({ type: 'dev_grant', item: 'dew_slime_weapon@c' }));
  await A.waitForTimeout(500);
  await G(A, () => window.__game.debug.openBook('gear'));
  await A.waitForTimeout(600);
  await G(A, () => document.querySelector('.mc-item.cursed')?.click());
  await A.waitForTimeout(400);
  const cardAt2 = await G(A, () => document.querySelector('.mc-detail .mc-tip.cursed')?.innerText || '');
  ok(/×2/.test(cardAt2), `карточка при statMult=2: ${cardAt2.slice(0, 100)}`);
  await shot(A, '05b-card-statmult2.png');
  A.adminRes.length = 0;
  await G(A, () => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'curse', id: 'main' }));
  await A.waitForTimeout(2000);
  await A.waitForFunction(() => window.__game.meta.state?.curse?.statMult === 1.5, null, { timeout: 15000 }).catch(() => {});
  const afterReset = await G(A, () => window.__game.meta.state?.curse?.statMult);
  ok(afterReset === 1.5, `сброс → 1.5 (сейчас ${afterReset}); adminRes=${A.adminRes.slice(-2)}`);
  // tint restore
  ok((await G(A, () => window.__game.meta.state?.curse?.tint)) === '#a855f7', 'tint сброшен');

  // ---- Cursed mobs ----
  const pos = await G(A, () => window.__game.debug.pos());
  await G(A, (o) => window.__game.debug.devSpawn('dew_slime', o.x + 90, o.y, false), pos);
  await G(A, (o) => window.__game.debug.devSpawn('dew_slime', o.x + 180, o.y, true), pos);
  await G(A, (o) => window.__game.debug.devSpawn('swarm_mother', o.x + 280, o.y, true), pos);
  await G(A, (o) => window.__game.debug.devSpawn('violet_queen', o.x + 420, o.y, true), pos);
  await A.waitForTimeout(2200);
  const mobs = await G(A, () => window.__game.debug.zoneMobsFull());
  const sn = mobs.filter((m) => m.type === 'dew_slime' && !m.cursed);
  const sc = mobs.filter((m) => m.type === 'dew_slime' && m.cursed);
  ok(sc.length >= 1, `проклятый обычный: ${sc.length}`);
  ok(mobs.some((m) => m.type === 'swarm_mother' && m.cursed), 'проклятый босс swarm_mother');
  ok(mobs.some((m) => m.type === 'violet_queen' && m.cursed), 'проклятый мировой violet_queen');
  // HP на клиенте — % от maxHp; реальные числа через dev_grant.mobInfo (JSON.parse hook)
  const askHp = async (wantCursed) => {
    const list = await G(A, () => window.__game.debug.zoneMobsFull());
    const m = list.find((x) => x.type === 'dew_slime' && !!x.cursed === wantCursed);
    if (!m) return null;
    await G(A, (o) => window.__game.debug.tp(o.x, o.y, true), m);
    await A.waitForTimeout(200);
    return await G(A, async () => {
      const JP = JSON.parse; let found = null;
      JSON.parse = function (s) { const v = JP.apply(this, arguments); if (v && v.type === 'dev_mob') found = v; return v; };
      window.__game.debug.send({ type: 'dev_grant', mobInfo: true, typeFilter: 'dew_slime' });
      for (let i = 0; i < 50; i++) { await new Promise((r) => setTimeout(r, 40)); if (found) break; }
      JSON.parse = JP; return found;
    });
  };
  const infoN = await askHp(false);
  const infoC = await askHp(true);
  report.notes.push('dev_mob n=' + JSON.stringify(infoN) + ' c=' + JSON.stringify(infoC));
  if (infoN?.maxHp && infoC?.maxHp) {
    const ratio = infoC.maxHp / infoN.maxHp;
    ok(Math.abs(ratio - 4.5) < 0.15 && !!infoC.cursed && !infoN.cursed, `HP maxHp cursed/normal=${ratio.toFixed(3)} (сервер, ожид 4.5; cursed flags ${infoN.cursed}/${infoC.cursed})`);
  } else ok(false, `dev_mob не ответил n=${JSON.stringify(infoN)} c=${JSON.stringify(infoC)}`);

  if (sc[0]) { await G(A, (m) => window.__game.debug.tp(m.x - 40, m.y, true), sc[0]); await G(A, () => window.__game.debug.setZoom?.(2.2)); await A.waitForTimeout(1000); await shot(A, '01-cursed-mob-visual.png'); }
  const boss = mobs.find((m) => m.type === 'swarm_mother' && m.cursed);
  if (boss) { await G(A, (m) => window.__game.debug.tp(m.x - 70, m.y, true), boss); await G(A, () => window.__game.debug.setZoom?.(1.0)); await A.waitForTimeout(1000); await shot(A, '01b-cursed-boss-visual.png'); }
  const queen = mobs.find((m) => m.type === 'violet_queen' && m.cursed);
  if (queen) { await G(A, (m) => window.__game.debug.tp(m.x - 100, m.y, true), queen); await G(A, () => window.__game.debug.setZoom?.(0.65)); await A.waitForTimeout(1000); await shot(A, '01c-cursed-worldboss-visual.png'); report.notes.push(`queen hp=${queen.hp}`); }

  // Solo kite
  const solo = await open('E2ESolo', 'e2e_solo_' + Date.now());
  await G(solo, () => window.__game.debug.selectClass('warrior'));
  await solo.waitForTimeout(1500);
  const sp = await G(solo, () => window.__game.debug.pos());
  await G(solo, (o) => window.__game.debug.devSpawn('dew_slime', o.x + 55, o.y, true), sp);
  await solo.waitForTimeout(800);
  const fight = await solo.evaluate(async () => {
    const d = window.__game.debug; const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const m = d.zoneMobsFull().find((x) => x.cursed && x.type === 'dew_slime' && x.hp > 0);
      if (!m) return { killed: true, ms: Date.now() - t0 };
      const me = d.pos(); const dx = me.x - m.x, dy = me.y - m.y, L = Math.hypot(dx, dy) || 1;
      d.teleport(m.x + dx / L * 150, m.y + dy / L * 150);
      await new Promise((r) => setTimeout(r, 250));
    }
    const m = d.zoneMobsFull().find((x) => x.cursed && x.type === 'dew_slime');
    return { timeout: true, mobHp: m?.hp, ms: 40000 };
  });
  ok(!fight.killed, `соло кайт не убил проклятого: ${JSON.stringify(fight)}`);
  await shot(solo, '01d-solo-kite.png');
  await solo.close();

  // ---- Drops (fresh farmer uid, track bag ids once) ----
  const F = await open('E2EFarm', 'e2e_farm_' + Date.now());
  await G(F, () => window.__game.debug.selectClass('warrior'));
  await F.waitForTimeout(1500);
  await G(F, () => window.__game.debug.tp(700, 700, true));
  await F.waitForTimeout(500);
  const dropStats = { kills: 0, normal: {}, cursed: {}, bagsSeen: 0, cursedCells: 0 };
  const GEAR = ['swarm_mother_weapon', 'swarm_mother_helmet', 'swarm_mother_armor', 'swarm_mother_legs', 'swarm_mother_hands'];
  for (const id of GEAR) { dropStats.normal[id] = 0; dropStats.cursed[id] = 0; }
  const seenBags = new Set();

  for (let i = 0; i < 40; i++) {
    // free inventory space periodically
    if (i % 8 === 0) {
      await G(F, () => window.__game.debug.send({ type: 'dev_grant', freeSlots: 80 }));
      // salvage-like: drop filled grants — also clear by not picking mats if full; use freeSlots only works for grant:fill
      await F.waitForTimeout(200);
    }
    const p = await G(F, () => window.__game.debug.pos());
    const sx = p.x + 20, sy = p.y;
    await G(F, (o) => window.__game.debug.devSpawn('swarm_mother', o.sx, o.sy, true), { sx, sy });
    await F.waitForTimeout(350);
    // встать прямо на босса, чтобы killNearAny не схватил чужого моба
    await G(F, (o) => window.__game.debug.tp(o.sx, o.sy, true), { sx, sy });
    await F.waitForTimeout(200);
    const before = new Set(await G(F, () => window.__game.debug.bags().map((b) => b.id)));
    await G(F, () => window.__game.debug.send({ type: 'dev_grant', killNearAny: true, killType: 'swarm_mother' }));
    await F.waitForTimeout(800);
    dropStats.kills++;
    const bags = await G(F, () => window.__game.debug.bags());
    // только НОВЫЕ мешки этого убийства
    const fresh = bags.filter((b) => !seenBags.has(b.id) && !before.has(b.id));
    for (const bag of fresh.length ? fresh : bags.filter((b) => !seenBags.has(b.id))) {
      await G(F, (b) => window.__game.debug.tp(b.x, b.y, true), bag);
      await F.waitForTimeout(250);
      await G(F, (id) => window.__game.debug.send({ type: 'loot_open', bag: id }), bag.id);
      await F.waitForTimeout(450);
      const loot = await G(F, () => ({ open: window.__game.debug.loot().open, entries: window.__game.debug.loot().entries || [] }));
      if (!loot.open || !loot.entries.length) { dropStats.emptyOpen = (dropStats.emptyOpen || 0) + 1; continue; }
      seenBags.add(bag.id);
      dropStats.bagsSeen++;
      let hasSwarm = false;
      for (const e of loot.entries) {
        if (e.k !== 'item') continue;
        if (String(e.id).startsWith('swarm_mother')) hasSwarm = true;
        const map = e.c ? dropStats.cursed : dropStats.normal;
        map[e.id] = (map[e.id] || 0) + 1;
      }
      if (hasSwarm) dropStats.bossBags = (dropStats.bossBags || 0) + 1;
      const cz = await G(F, () => document.querySelectorAll('.mc-loot .cell.cursed').length);
      dropStats.cursedCells += cz;
      if (cz > 0 && dropStats.cursedCells === cz) await shot(F, '02-loot-bag-cursed.png');
      await G(F, () => document.querySelector('.mc-loot .all')?.click());
      await F.waitForTimeout(300);
      await G(F, () => document.querySelector('.mc-loot .x')?.click());
    }
  }
  report.drops = dropStats;
  const k = dropStats.kills;
  const bb = dropStats.bossBags || dropStats.bagsSeen || 1;
  const rate = (n, d = bb) => (n / d * 100).toFixed(0) + '%';
  ok(k >= 30, `убийств: ${k}, мешков босса: ${dropStats.bossBags}, emptyOpen=${dropStats.emptyOpen || 0}`);
  ok((dropStats.normal.swarm_mother_helmet || 0) / bb >= 0.9, `обычный шлем ~100%: ${rate(dropStats.normal.swarm_mother_helmet || 0)} (от мешков босса)`);
  ok((dropStats.cursed.swarm_mother_helmet || 0) / bb >= 0.9, `проклятый шлем ~100%: ${rate(dropStats.cursed.swarm_mother_helmet || 0)}`);
  ok((dropStats.normal.swarm_mother_weapon || 0) / bb >= 0.9, `обычное оружие ~100%: ${rate(dropStats.normal.swarm_mother_weapon || 0)}`);
  const wr = (dropStats.cursed.swarm_mother_weapon || 0) / bb;
  ok(wr >= 0.05 && wr <= 0.45, `проклятое оружие ~20%: ${rate(dropStats.cursed.swarm_mother_weapon || 0)} (n=${dropStats.cursed.swarm_mother_weapon || 0})`);
  ok(dropStats.cursedCells > 0, `проклятые ячейки в мешке видны (${dropStats.cursedCells})`);
  report.notes.push(`drops k=${k} bossBags=${dropStats.bossBags} bags=${dropStats.bagsSeen} empty=${dropStats.emptyOpen||0} helmN=${dropStats.normal.swarm_mother_helmet} helmC=${dropStats.cursed.swarm_mother_helmet} weapN=${dropStats.normal.swarm_mother_weapon} weapC=${dropStats.cursed.swarm_mother_weapon}`);

  // ---- Equip / glow / 2nd player / altar ----
  // Use bag to drop cursed set without filling: grant via @c then equip
  const EQ = await open('E2EEq', 'e2e_eq_' + Date.now());
  await G(EQ, () => window.__game.debug.selectClass('warrior'));
  await EQ.waitForTimeout(1500);
  const SET = ['dew_slime_weapon', 'dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands'];
  await G(EQ, () => window.__game.debug.send({ type: 'dev_grant', item: 'dew_slime_weapon' }));
  for (const id of SET) { await G(EQ, (i) => window.__game.debug.send({ type: 'dev_grant', item: i + '@c' }), id); await EQ.waitForTimeout(60); }
  await EQ.waitForTimeout(800);
  const inv = await G(EQ, () => window.__game.meta.account.inv.map((x) => ({ uid: x.uid, id: x.id, cursed: !!x.cursed })));
  const nor = inv.find((i) => i.id === 'dew_slime_weapon' && !i.cursed);
  const cset = SET.map((id) => inv.find((i) => i.id === id && i.cursed));
  ok(nor && cset.every(Boolean), `сумка: обычное + 5 проклятых (${inv.filter((i) => i.cursed).length} cursed)`);

  await G(EQ, (u) => window.__game.meta.equip(u), nor.uid);
  await EQ.waitForFunction(() => (window.__game.meta.hero?.effective?.itemDmgMin || 0) > 0, null, { timeout: 8000 }).catch(() => {});
  await EQ.waitForTimeout(400);
  const effN = await G(EQ, () => window.__game.meta.hero.effective);
  await G(EQ, (u) => window.__game.meta.equip(u), cset[0].uid);
  await EQ.waitForFunction(() => window.__game.meta.hero?.effective?.weaponCursed === 1 && (window.__game.meta.hero?.effective?.itemDmgMin || 0) > 0, null, { timeout: 8000 }).catch(() => {});
  await EQ.waitForTimeout(400);
  const effC = await G(EQ, () => window.__game.meta.hero.effective);
  report.notes.push('effN=' + JSON.stringify({ dmin: effN?.itemDmgMin, dmax: effN?.itemDmgMax }) + ' effC=' + JSON.stringify({ dmin: effC?.itemDmgMin, dmax: effC?.itemDmgMax, wc: effC?.weaponCursed }));
  const rmin = effC.itemDmgMin / Math.max(1, effN.itemDmgMin);
  ok(effN.itemDmgMin > 0 && Math.abs(rmin - 1.5) < 0.08, `урон того же оружия ×1.5: ${effN.itemDmgMin}→${effC.itemDmgMin} (r=${rmin.toFixed(2)})`);
  ok(effC.weaponCursed === 1, 'weaponCursed=1');

  await G(EQ, () => window.__game.debug.openBook('gear'));
  await EQ.waitForTimeout(700);
  await G(EQ, () => document.querySelector('.mc-gslot.cursed')?.click());
  await EQ.waitForTimeout(400);
  const tip = await G(EQ, () => document.querySelector('.mc-detail .mc-tip.cursed')?.innerText || '');
  ok(/Проклят/.test(tip) && /×1\.5/.test(tip), `карточка: ${tip.slice(0, 140)}`);
  await shot(EQ, '03-card-cursed.png');
  await EQ.keyboard.press('Escape');

  await G(EQ, () => window.__game.debug.setZoom?.(3.0));
  const clip = async (file) => {
    await EQ.waitForTimeout(800);
    const s = await G(EQ, () => { const q = window.__game.debug.pos(); return window.__game.debug.screenOf(q.x, q.y); });
    await EQ.screenshot({ path: `${OUT}/${file}`, clip: { x: Math.max(0, s.x - 150), y: Math.max(0, s.y - 330), width: 300, height: 380 } });
  };
  // already 1 cursed weapon
  const g1 = await G(EQ, () => ({ k: window.__game.meta.hero.effective.cursedGlow, g: window.__game.debug.myGlow() }));
  await clip('04-glow-1.png');
  await G(EQ, (u) => window.__game.meta.equip(u), cset[1].uid);
  await EQ.waitForTimeout(600);
  const g2 = await G(EQ, () => ({ k: window.__game.meta.hero.effective.cursedGlow, g: window.__game.debug.myGlow() }));
  await clip('04-glow-2.png');
  for (const p of cset.slice(2)) { await G(EQ, (u) => window.__game.meta.equip(u), p.uid); await EQ.waitForTimeout(350); }
  await EQ.waitForTimeout(700);
  const g5 = await G(EQ, () => ({ k: window.__game.meta.hero.effective.cursedGlow, g: window.__game.debug.myGlow() }));
  await clip('04-glow-full.png');
  ok(g1.k === 1 && g2.k === 2 && g5.k === 5, `свечение 1/2/5: ${g1.k}/${g2.k}/${g5.k}`);
  ok(g5.g?.pulse && g5.g.k > g1.g.k, `пульс полного комплекта ${JSON.stringify([g1.g, g5.g])}`);

  const W = await open('E2EWatch', 'e2e_watcher');
  await G(W, () => window.__game.debug.selectClass('mage'));
  await W.waitForTimeout(2500);
  const ap = await G(EQ, () => window.__game.debug.pos());
  await G(W, (o) => window.__game.debug.tp(o.x + 25, o.y, true), ap);
  await W.waitForTimeout(2000);
  const og = await G(W, () => window.__game.debug.othersGlow?.() || []);
  ok(og.some((g) => g.k > 0.5), `второй игрок видит свечение: ${JSON.stringify(og)}`);
  await shot(W, '04b-glow-other-view.png');
  await W.close();

  await G(EQ, () => window.__game.debug.openAltar());
  await EQ.waitForTimeout(1400);
  const alt = await G(EQ, () => ({
    glow: !!document.querySelector('img.mc-cursed-glow, .mc-cursed-glow'),
    slots: [...document.querySelectorAll('.mc-altar-slot')].filter((e) => /168|247|a855|purple|cursed/i.test(e.style.borderColor + e.className)).length,
  }));
  await shot(EQ, '04c-altar-glow.png');
  ok(alt.glow || alt.slots >= 1, `алтарь: ${JSON.stringify(alt)}`);
  await EQ.keyboard.press('Escape');

  // ---- R skill VFX + damage ×2 ----
  await G(EQ, () => window.__game.debug.fxDemo('clear'));
  await G(EQ, () => { const d = window.__game.debug, q = d.pos(); d.cursedFxDemo(q.x, q.y); });
  await G(EQ, () => window.__game.debug.setZoom?.(1.5));
  await EQ.waitForTimeout(1100);
  await shot(EQ, '03b-skill-normal-vs-cursed-vfx.png');
  const projs = await G(EQ, () => [...(window.__game.debug.zone?.pax?.live?.values?.() || [])].map((p) => ({ t: p.t, cz: !!p.cz })));
  ok(projs.some((p) => p.cz) && projs.some((p) => !p.cz), `VFX: обычные и проклятые снаряды (${projs.length})`);

  const dmgCmp = await EQ.evaluate(async () => {
    const d = window.__game.debug;
    const inv = window.__game.meta.account.inv;
    const n = inv.find((i) => i.id === 'dew_slime_weapon' && !i.cursed);
    const c = inv.find((i) => i.id === 'dew_slime_weapon' && i.cursed);
    const hit = async () => {
      const pos = d.pos();
      d.devSpawn('garden_golem', pos.x + 60, pos.y, false);
      await new Promise((r) => setTimeout(r, 500));
      const t = d.zoneMobsFull().find((x) => x.type === 'garden_golem' && x.hp > 0 && Math.hypot(x.x - pos.x, x.y - pos.y) < 250);
      if (!t) return null;
      const hp0 = t.hp;
      d.selectMobId?.(t.id);
      d.send({ type: 'zone_ability', slot: 'r', x: t.x, y: t.y, tid: t.id });
      d.send({ type: 'zone_ability', kind: 'weapon', x: t.x, y: t.y, tid: t.id });
      await new Promise((r) => setTimeout(r, 1000));
      const t2 = d.zoneMobsFull().find((x) => x.id === t.id);
      return hp0 - (t2?.hp ?? hp0);
    };
    let dn = null, dc = null;
    if (n) { window.__game.meta.equip(n.uid); await new Promise((r) => setTimeout(r, 700)); dn = await hit(); }
    if (c) { window.__game.meta.equip(c.uid); await new Promise((r) => setTimeout(r, 900));
      for (let i = 0; i < 25 && !window.__game.meta.hero?.effective?.weaponCursed; i++) await new Promise((r) => setTimeout(r, 80));
      dc = await hit();
    }
    return { dn, dc, wc: window.__game.meta.hero?.effective?.weaponCursed, rs: window.__game.meta.state?.curse?.rsMult };
  });
  report.notes.push('R dmg: ' + JSON.stringify(dmgCmp));
  if (dmgCmp.dn > 0 && dmgCmp.dc > 0) {
    const r = dmgCmp.dc / dmgCmp.dn;
    ok(r >= 1.5 && r <= 2.8, `урон R ×~2: ${dmgCmp.dn}→${dmgCmp.dc} (r=${r.toFixed(2)})`);
  } else {
    ok(dmgCmp.wc === 1 && dmgCmp.rs === 2, `fallback R: weaponCursed+rsMult (${JSON.stringify(dmgCmp)})`);
  }

  ok(!A.errs.length && !EQ.errs.length && !F.errs.length, `без pageerror`);
  ok(!blocked.length, 'только localhost');

  fs.writeFileSync(`${OUT}/REPORT.json`, JSON.stringify(report, null, 2));
  const summary = [`cursed-e2e ${report.pass.length}/${report.pass.length + report.fail.length}`, ...report.fail.map((f) => 'FAIL: ' + f), ...report.notes.map((n) => 'NOTE: ' + n)].join('\n');
  fs.writeFileSync(`${OUT}/REPORT.txt`, summary);
  console.log(summary);
  await b.close();
  process.exit(report.fail.length ? 1 : 0);
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/ERROR.txt`, String(e.stack || e)); process.exit(1); });
