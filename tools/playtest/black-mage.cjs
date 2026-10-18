// LOCAL: Чёрный маг — покой, купол, стрелы, сжатие (босс в куполе), взрыв, очернение вещей, розы (перемотка dev), проклятая земля,
// награда квеста «очищение снаряжения», вкладка админки. Только 127.0.0.1 (guardLocal), wrangler dev --local с MC_DEV_TRUST_USERID=1.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/black-mage';
const BASE = process.env.BM_BASE || 'http://127.0.0.1:5293/game.html', WS = process.env.BM_WS || 'ws://127.0.0.1:8879';
const PERSIST = process.env.BM_PERSIST || '/workspace/mc-harness-bm/wr';
assertLocalUrl(BASE); assertLocalUrl(WS);
const ADMIN = 'bm_admin_' + Date.now().toString(36);
require('child_process').execSync(`cd /workspace/mg-blackmage/server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${PERSIST} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}','admin','local-test',0)"`, { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, vp, cls = 'warrior') => {
    const ctx = await b.newContext({ viewport: vp }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.st = null; p.errs = []; p.log = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/"type":"(npc_dialog|toast_error|quest_[a-z_]+)"/.test(s) && p.log) p.log.push(s.slice(0, 300)); if (s.includes('"type":"meta_state"')) try { const j = JSON.parse(s); if (j.account) p.st = j; } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(800);
    await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await p.waitForTimeout(1200);
    p.S = (o) => p.evaluate((x) => window.__game.debug.send(x), o); p.G = (f, a) => p.evaluate(f, a);
    for (let i = 0; i < 8 && (await p.G(() => window.__game.state().world)) !== 'arinar'; i++) { await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await p.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(1500); }
    ok((await p.G(() => window.__game.state().world)) === 'arinar', `${uid}: в Аринаре`);
    p.bm = async (o) => { await p.G(() => { window.__devBm = null; }); await p.S({ type: 'dev_grant', bm: o }); for (let i = 0; i < 30; i++) { const d = await p.G(() => window.__devBm); if (d) return d; await sleep(100); } return null; };
    p.tp = async (x, y, god = true) => { await p.G(([a, c, g]) => window.__game.debug.tp(a, c, g), [x, y, god]); await sleep(900); };
    return { ctx, p };
  };
  const { p } = await open(ADMIN, { width: 1280, height: 760 });
  await p.S({ type: 'dev_grant', xp: 60000 }); await sleep(500);
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) await p.S({ type: 'dev_grant', item: id });
  await p.S({ type: 'meta_get' }); await sleep(1200);
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) { const it = (p.st?.account?.inv || []).find((i) => i.id === id); if (it) await p.S({ type: 'equip', uid: it.uid }); await sleep(250); }
  await p.S({ type: 'meta_get' }); await sleep(900);
  ok(Object.keys(p.st?.hero?.equip || {}).length >= 4, 'надето 4 вещи: ' + JSON.stringify(p.st?.hero?.equip));
  // маг — в случайную допустимую точку Аринара (как по таймеру 50 мин), игрок — рядом
  let d = await p.bm({ tp: 1, calm: 1, clearDomes: 1, resetClock: 1 }); ok(d && d.info, 'dev_bm отвечает: ' + JSON.stringify(d?.info));
  ok(Math.hypot(d.info.x - 24000, d.info.y - 24000) > 1200, `телепорт мага не на центральную площадь (${d.info.x}, ${d.info.y})`);
  // дальше всё — на открытом месте (окрестность 1000 px проходима, мобов нет), чтобы сцены не упирались в стены/воду
  const SP = (await p.bm({ openSpot: 900 })).spot; ok(SP, 'открытое место для сцен: ' + JSON.stringify(SP));
  const MX = SP.x, MY = SP.y; await p.bm({ at: { x: MX, y: MY } });
  await p.tp(MX - 150, MY + 40); await p.G(() => window.__game.debug.setCells(16)); await sleep(2500);
  d = await p.bm({ here: 1, dx: 150, dy: -40 }); await sleep(2500);
  const v0 = await p.G(() => window.__game.debug.bm()); ok(v0?.mage, 'клиент видит мага: ' + JSON.stringify(v0?.mage));
  await p.screenshot({ path: `${OUT}/01-mage-idle.png` });
  // ходьба (глитч-лист 48×60), потом снова стоит (idle_wind)
  await p.bm({ walk: { dx: -100, dy: 80 } }); await sleep(1100);
  { const w = await p.G(() => window.__game.debug.bm().mage); ok(w?.moving, 'маг идёт: ' + JSON.stringify(w)); }
  await p.screenshot({ path: `${OUT}/01b-mage-walk.png` });
  await p.bm({ here: 1, dx: 150, dy: -40 }); await sleep(1500);
  // клик по магу → цель «? / ?»
  { await p.addStyleTag({ content: '.game-hud-panel.hud-right{display:block!important;position:fixed;right:8px;top:200px;width:230px;z-index:50}.hud-right .hud-card:not(#ghud-target-card),#ghud-minimap-slot{display:none}' });
    const s = await p.G(([x, y]) => window.__game.debug.screenOf(x, y), [v0.mage.x, v0.mage.y]); await p.mouse.click(s.x, s.y - 4); await sleep(800);
    const tg = await p.G(() => window.__game.debug.target()); const t = JSON.stringify(tg) + ' ' + (await p.G(() => document.getElementById('ghud-target-details')?.textContent || '')).replace(/\s+/g, ' ').slice(0, 80); ok(/Чёрный маг/.test(t) && /\?/.test(t), 'цель — Чёрный маг, ХП/атака «?»: ' + t.replace(/\s+/g, ' ').slice(0, 120));
    await p.screenshot({ path: `${OUT}/02-mage-target-unknown.png` }); await p.addStyleTag({ content: '.game-hud-panel.hud-right{display:none!important}' }); }
  // купол
  d = await p.bm({ dome: 'mage', kind: 'w' }); await sleep(700);
  ok(d.info.domes >= 1, 'купол поставлен: ' + d.info.domes);
  await p.screenshot({ path: `${OUT}/03a-dome-spawn.png` }); await sleep(2200);
  await p.screenshot({ path: `${OUT}/03-dome-inside.png` }); // свой герой внутри — купол 0.5
  await p.tp(MX - 470, MY + 40); await sleep(900);
  await p.screenshot({ path: `${OUT}/03c-dome-outside.png` }); // снаружи — 0.9
  // второй игрок рядом (для взрыва), первый — нападает на мага; стрелы
  const { p: p2, ctx: c2 } = await open('bm_other_' + Date.now().toString(36), { width: 900, height: 560 }, 'mage');
  await p.tp(MX - 330, MY + 30, false); await p2.tp(MX - 352, MY + 52, false); await sleep(1200);
  await p.bm({ clearDomes: 1, mortal: 1 }); await p2.bm({ mortal: 1 }); await p.bm({ aggro: 1 }); await sleep(900);
  await p.screenshot({ path: `${OUT}/04-arrows.png` }); await sleep(250); await p.screenshot({ path: `${OUT}/04b-arrows.png` });
  await p2.screenshot({ path: `${OUT}/05-explosion-other-player.png` });
  await sleep(1200);
  const st2 = await p2.G(() => window.__game.debug.bm()); ok(st2.stats.proj > 0, `стрелы долетают до клиента (${st2.stats.proj}), взрывов ${st2.stats.boom}`);
  d = await p.bm({ calm: 1 }); ok(d.info.arrows > 0 && d.info.expl >= 0, 'сервер: стрел ' + d.info.arrows + ', взрывов ' + d.info.expl);
  const hp2 = await p2.G(() => window.__game.debug.zone.me); console.log('   второй игрок после взрывов:', JSON.stringify(hp2));
  // малая сфера Ø5: игрок ближе 5 клеток бьёт мага → сфера вокруг мага; напавший вытолкнут, второй игрок внутри — под защитой
  await p.tp(MX - 110, MY + 10, true); await p.bm({ calm: 1, clearDomes: 1, at: { x: MX, y: MY } }); { const i = (await p.bm({})).info; await p.tp(i.x - 110, i.y + 10, false); await p2.tp(i.x + 30, i.y + 25, false); await sleep(1200);
    const s0 = i.small || 0; await p.bm({ smallCd: 0, mortal: 1 }); await p2.bm({ mortal: 1 }); d = await p.bm({ aggro: 1 }); await sleep(250);
    ok((d.info.small || 0) === s0 + 1, `малая сфера поставлена (${s0} → ${d.info.small})`);
    await p.bm({ calm: 1 }); await sleep(500);
    const me = (await p.bm({})).me; ok(Math.hypot(me.x - i.x, me.y - i.y) >= 80, 'напавший вытолкнут за край малой сферы: ' + JSON.stringify(me));
    await p.screenshot({ path: `${OUT}/13a-small-dome-spawn-outside.png` }); await sleep(2200);
    const sv = await p.G(() => window.__game.debug.bm().domes.filter((x) => x.small)); ok(sv.length === 1 && sv[0].r === 80, 'клиент: малая сфера R=80 px: ' + JSON.stringify(sv));
    await p.screenshot({ path: `${OUT}/13-small-dome-outside.png` }); await p2.screenshot({ path: `${OUT}/13b-small-dome-inside.png` }); }
  // защита по дистанции (правила пользователя): маг ~10 клеток от моба → БОЛЬШОЙ купол с магом в центре (подходит до ~7); 2–5 клеток → МАЛАЯ сфера на мобе (подходит до ~4)
  const guardCase = async (tag, distTiles, kind) => {
    await p.G((c) => window.__game.debug.setCells(c), kind === 's' ? 16 : 24);
    await p2.tp(1000, 1000, true).catch(() => {}); // второй — в сторону
    await p.tp(MX - 150, MY + 20, true); await p.bm({ clearMobs: 900, clearBoss: 1 }); await p.bm({ calm: 1, clearDomes: 1, at: { x: MX, y: MY }, domeCd: 0, smallCd: 0 }); const i = (await p.bm({})).info;
    let mx = i.x - distTiles * 32, my = i.y + 6;
    await p.tp(mx - 44, my, false); await sleep(600);
    await p.S({ type: 'dev_spawn_mob', mob: 'moon_sentinel', special: 'boss', x: mx, y: my, calm: true }); await sleep(900);
    const n00 = await p.bm({ mortal: 1 }), n0 = n00.info; { const mb = (n00.mobs || []).filter((q) => q[1] === 'moon_sentinel').sort((a, c) => Math.hypot(a[2] - mx, a[3] - my) - Math.hypot(c[2] - mx, c[3] - my))[0]; if (mb) { mx = mb[2]; my = mb[3]; } }
    let shot = false, d1 = null;
    for (let k = 0; k < 40; k++) { if (k % 2 === 0) await p.S({ type: 'zone_attack', tx: mx, ty: my }); await sleep(200);
      if (!shot && k === 4) { await p.screenshot({ path: `${OUT}/${tag}a-approach.png` }); shot = true; }
      d1 = (await p.bm({})).info; if ((kind === 's' ? (d1.small || 0) > (n0.small || 0) : d1.domes > 0)) break; }
    await sleep(500); await p.screenshot({ path: `${OUT}/${tag}b-cast.png` });
    const me = (await p.bm({})).me, dv = await p.G(() => window.__game.debug.bm());
    const dm = dv.domes.find((q) => (kind === 's') === !!q.small);
    ok(!!dm, `${tag}: ${kind === 's' ? 'малая' : 'большая'} сфера поставлена (моб в ${distTiles} клетках): ` + JSON.stringify(dm));
    const lc = (await p.bm({})).info['cast_' + kind] || {}; console.log('   ' + tag + ' lastCast', JSON.stringify(lc), 'моб', mx, my);
    if (dm) { const dMob = Math.hypot(dm.x - mx, dm.y - my) / 32, dMage = Math.hypot(dm.x - lc.mx, dm.y - lc.my) / 32;
      if (kind === 's') ok(dMob < 1 && dm.r === 80, `${tag}: малая — центр на мобе (${dMob.toFixed(2)} кл.), маг в ${(Math.hypot(d1.x - mx, d1.y - my) / 32).toFixed(1)} кл. от моба`);
      else ok(dMage < 1.5 && dMob <= 7.3 && dm.r === 256, `${tag}: большая — центр на маге (${dMage.toFixed(2)} кл.), моб в ${dMob.toFixed(1)} кл. от центра (маг подошёл до ~7)`);
      ok(Math.hypot(me.x - dm.x, me.y - dm.y) >= dm.r, `${tag}: напавший вытолкнут за барьер (${Math.round(Math.hypot(me.x - dm.x, me.y - dm.y))} ≥ ${dm.r})`); }
    await sleep(2000); await p.screenshot({ path: `${OUT}/${tag}c-formed.png` });
    await p.S({ type: 'dev_grant', killNear: 1 }).catch(() => {});
  };
  await guardCase('16-big', 8.8, 'c');
  await guardCase('17-small', 4.2, 's'); await p.G(() => window.__game.debug.setCells(16));
  // PvP из купола: выстрел второго игрока (посох) изнутри наружу — летит, чернеет, бьёт первого игрока как стрела мага
  await p.bm({ calm: 1, clearDomes: 1, at: { x: MX, y: MY } }); { const SX = MX + 500, SY = MY + 300;
    await p2.tp(SX, SY, false); await sleep(800); await p2.bm({ dome: 'me', kind: 'w' }); await p2.tp(SX - 205, SY, false); await p.tp(SX - 335, SY + 4, false); await sleep(2500);
    await p.bm({ mortal: 1 }); const b0 = (await p.bm({})).info.blackShots || 0, hp0 = (await p.G(() => window.__game.debug.zone.me))?.hp;
    await p2.S({ type: 'zone_attack', tx: SX - 335, ty: SY + 4 }); await sleep(140);
    await p2.screenshot({ path: `${OUT}/14-black-shot-from-dome.png` }); await p.screenshot({ path: `${OUT}/14b-black-shot-hit.png` }); await sleep(900);
    const i2 = (await p.bm({})).info; ok((i2.blackShots || 0) > b0 && (i2.blackHits || 0) > 0, `выстрел из купола почернел и попал (чёрных ${i2.blackShots}, попаданий ${i2.blackHits})`);
    const cs = await p.G(() => window.__game.debug.bm().stats); ok((cs.black || 0) > 0, 'клиент: выстрел перерисован чёрной стрелой (' + cs.black + ')');
    console.log('   ОЗ цели до/после:', hp0, JSON.stringify(await p.G(() => window.__game.debug.zone.me))); }
  await c2.close();
  // сжатие пространства: босс в куполе у мага
  await p.tp(MX - 400, MY, true); await p.bm({ clearMobs: 900, clearBoss: 1 }); await sleep(600);
  await p.bm({ here: 1, dx: 400, dy: 0, calm: 1, clearDomes: 1 });
  await p.S({ type: 'dev_spawn_mob', mob: 'moon_sentinel', special: 'boss', x: MX + 30, y: MY + 10, calm: true }); await sleep(800);
  await p.S({ type: 'dev_grant', mobInfo: 1, typeFilter: 'moon_sentinel' }); await sleep(400);
  await p.bm({ dome: 'mage', kind: 'c' }); await sleep(1200);
  await p.screenshot({ path: `${OUT}/06a-boss-in-dome.png` });
  const k0 = (await p.bm({})).info.compressKills || 0;
  await p.tp(MX - 220, MY, false); await p.bm({ aggro: 1 }); await sleep(450);
  await p.screenshot({ path: `${OUT}/06b-compress.png` }); await sleep(900);
  d = await p.bm({ calm: 1 }); ok((d.info.compressKills || 0) > k0, `сжатие убило моба/босса в куполе (убийств сжатием ${d.info.compressKills})`);
  await p.screenshot({ path: `${OUT}/06c-compress-after.png` });
  // смерть от мага → очернение надетого + роза
  const r0 = (await p.bm({})).info.roses;
  await p.tp(MX - 220, MY, false); await p.bm({ clearDomes: 1, mortal: 1 }); await p.bm({ hits: 12, hp: 12, aggro: 1 }); await sleep(9000);
  d = await p.bm({ calm: 1 }); console.log('   смерть: info', JSON.stringify({ arrows: d.info.arrows, deaths: d.info.deaths, me: d.me, aggro: d.info.aggro, x: d.info.x, y: d.info.y }), 'zone.me', JSON.stringify(await p.G(() => window.__game.debug.zone.me)));
  ok(d.info.roses === r0 + 1, `роза посажена на месте смерти от мага (роз ${r0} → ${d.info.roses})`);
  await sleep(6000);
  const eq = p.st?.hero?.equip || {}; const inv = p.st?.account?.inv || [];
  const worn = Object.values(eq).map((u) => inv.find((i) => i.uid === u)).filter(Boolean);
  ok(worn.some((i) => i.blk > 0), 'надетые вещи очернены после смерти: ' + worn.map((i) => `${i.id}:${i.blk || 0}%`).join(', '));
  // очернение разных уровней (5 кадров оверлея)
  const lv = [12, 45, 80, 100]; for (let i = 0; i < worn.length && i < lv.length; i++) await p.bm({ blkUid: { uid: worn[i].uid, v: lv[i] } });
  await p.S({ type: 'meta_get' }); await sleep(900);
  await p.G(() => window.__game.debug.openBook('gear')); await sleep(1500);
  await p.screenshot({ path: `${OUT}/07-blackened-items.png` });
  { const sl = await p.$('.mc-book [data-slot] .mc-ic, .mc-book .mc-slot .mc-ic'); if (sl) { await sl.hover(); await sleep(700); } await p.screenshot({ path: `${OUT}/07b-blackened-tooltip.png` }); }
  const ov = await p.$$eval('.mc-blk', (x) => x.map((e) => e.dataset.blk)); ok(ov.length > 0, 'оверлей очернения на значках: ' + ov.join(','));
  await p.keyboard.press('Escape'); await sleep(400);
  // розы: все стадии + перемотка времени (dev)
  const RX = MX - 700, RY = MY + 200; await p.tp(RX, RY + 120); await p.G(() => window.__game.debug.setCells(14)); await sleep(1500);
  const ages = [0.2, 1.2, 1.9, 2.7, 4, 7, 10.5]; for (let i = 0; i < ages.length; i++) await p.bm({ rose: { dx: (i - 3) * 48, dy: -120, ageDays: ages[i] } });
  await sleep(2600);
  const rs = await p.G(() => window.__game.debug.bm().roses); ok(new Set(rs.map((r) => r.stage)).size >= 6, 'стадии роз: ' + rs.map((r) => r.stage).join(','));
  await p.screenshot({ path: `${OUT}/08-rose-stages.png` });
  await p.bm({ days: 4 }); await sleep(2600);
  await p.screenshot({ path: `${OUT}/09-rose-stages-plus4days.png` });
  await p.bm({ days: 6 }); await sleep(2600);
  const rs2 = await p.G(() => window.__game.debug.bm()); ok(rs2.ground > 0, 'проклятая земля вокруг раскрытых роз: ' + rs2.ground + ' мешей; радиусы ' + rs2.roses.map((r) => r.curseR).join(','));
  await p.G(() => window.__game.debug.setCells(26)); await sleep(1500);
  await p.screenshot({ path: `${OUT}/10-cursed-ground.png` });
  // статы на проклятой земле: только очернённая часть вещей
  const open1 = rs2.roses.sort((a, c) => c.curseR - a.curseR)[0];
  await p.tp(open1.x + 10, open1.y + 10); await sleep(1400); const on = await p.bm({});
  await p.tp(open1.x + open1.curseR + 400, open1.y); await sleep(1400); const off = await p.bm({});
  ok(on.cursed && on.dark && !off.dark, `проклятая земля: dark=${on.dark} / вне ${off.dark}`);
  console.log('   статы вне земли:', JSON.stringify({ hp: off.eff.maxHp, armor: off.eff.armor, dmg: [off.eff.weaponMin, off.eff.weaponMax] }), ' на земле:', JSON.stringify({ hp: on.eff.maxHp, armor: on.eff.armor, dmg: [on.eff.weaponMin, on.eff.weaponMax] }));
  ok(on.eff.maxHp !== off.eff.maxHp || on.eff.armor !== off.eff.armor, 'на проклятой земле действуют другие (очернённые) статы');
  await p.bm({ resetClock: 1 });
  // квест: Чёрный маг — и квестодатель, и сдача (обычная система квестов; находится по id — живая позиция)
  const quest = { id: 'c_bmfix', npc: 'black_mage', turnin: 'black_mage', title: 'Тень на доспехах', minLevel: 1, requires: [], track: true,
    objectives: [{ type: 'talk', npc: 'black_mage', text: 'Найти Чёрного мага ещё раз (он не стоит на месте)' }], rewards: { xp: 10, blkFix: 50 }, offer: ['…'], progress: '…', done: ['…'],
    dialogue: { offer: [{ who: 'black_mage', emo: 'smirk', text: 'Ты носишь мою тьму на плечах. Чувствуешь, как она тянет?' }, { who: 'black_mage', emo: 'think', text: 'Найди меня снова — где бы я ни оказался. Тогда я сниму часть черноты.' }],
      accept: { who: 'black_mage', emo: 'calm', text: 'Я не жду на одном месте. Ищи.' }, done: [{ who: 'black_mage', emo: 'joy', text: 'Нашёл. Держи — половина тьмы уходит.' }] } };
  await p.S({ type: 'admin_quest_save', quest }); await sleep(1500);
  await p.tp(MX - 60, MY + 10); await p.bm({ calm: 1, clearDomes: 1, at: { x: MX, y: MY }, clearMobs: 900 }); await sleep(1500);
  const before = (p.st?.account?.inv || []).filter((i) => Object.values(p.st?.hero?.equip || {}).includes(i.uid)).map((i) => i.blk || 0);
  const vnOpen = () => p.G(() => !!document.querySelector('.vn-box'));
  // напавший на мага не может с ним говорить (остальные — могут); после «забыл» — снова можно
  await p.bm({ aggro: 1 }); await p.G(() => window.__game.debug.interact()); await sleep(900); ok(!(await vnOpen()), 'напавший — маг не говорит');
  await p.bm({ calm: 1, mortal: 1, clearDomes: 1 }); await p.tp(MX - 60, MY + 10); await p.bm({ at: { x: MX, y: MY } }); await sleep(1500); // удар по магу вблизи поставил малую сферу и вытолкнул — вернуться
  const clickId = async (id) => { const el = await p.$('#' + id); if (!el) return false; await el.click(); await sleep(500); return true; };
  await p.G(() => window.__game.debug.interact()); await p.waitForSelector('.vn-box', { timeout: 8000 }).catch(() => {});
  ok(await vnOpen(), 'диалог с Чёрным магом (VN) открыт'); await sleep(600); console.log('   ws:', p.log.slice(-4).join(' || '));
  await p.screenshot({ path: `${OUT}/15a-quest-offer.png` });
  for (let k = 0; k < 6 && !(await p.$('#vn-accept')); k++) if (!(await clickId('vn-next'))) break;
  await sleep(400); await p.screenshot({ path: `${OUT}/15b-quest-accept.png` });
  ok(await clickId('vn-accept'), 'кнопка «Взять» у мага'); await sleep(900); await p.S({ type: 'meta_get' }); await sleep(800);
  ok(!!p.st?.account?.quests?.active?.c_bmfix, 'квест взят у Чёрного мага (active.c_bmfix)');
  // маг телепортируется — метка квеста идёт за ним
  d = await p.bm({ tp: 1, calm: 1 }); await sleep(2500);
  const np = await p.G(() => window.__game.debug.npcPos('black_mage')); ok(np && Math.hypot(np.x - d.info.x, np.y - d.info.y) < 140, `метка/позиция NPC идёт за магом после телепорта: ${JSON.stringify(np)} ≈ (${d.info.x}, ${d.info.y})`);
  console.log('   трекер:', JSON.stringify(await p.G(() => window.__game.debug.track())));
  await p.tp(d.info.x - 60, d.info.y + 10); await p.bm({ at: { x: d.info.x, y: d.info.y } }); await sleep(2000); // «at» — только остановить прогулку для кадра (позиция та же, после телепорта)
  await p.screenshot({ path: `${OUT}/15c-quest-mage-after-teleport.png` });
  for (let k = 0; k < 3 && !(await p.$('#vn-turnin')); k++) { await p.keyboard.press('Escape'); await sleep(300); await p.G(() => window.__game.debug.interact()); await sleep(1200); for (let j = 0; j < 6 && !(await p.$('#vn-turnin')); j++) if (!(await clickId('vn-next'))) break; }
  await p.screenshot({ path: `${OUT}/15d-quest-turnin.png` });
  ok(await clickId('vn-turnin'), 'кнопка «Сдать» у Чёрного мага (сдача там, где он сейчас)'); await sleep(1200); await p.S({ type: 'meta_get' }); await sleep(900);
  const after = (p.st?.account?.inv || []).filter((i) => Object.values(p.st?.hero?.equip || {}).includes(i.uid)).map((i) => i.blk || 0);
  ok(after.reduce((a, c) => a + c, 0) < before.reduce((a, c) => a + c, 0), `награда квеста очистила надетое на 50%: ${before.join(',')} → ${after.join(',')}`);
  await p.screenshot({ path: `${OUT}/15e-quest-done.png` });
  await p.S({ type: 'npc_talk_end', npc: 'black_mage' });
  // админка: награда квеста + вкладка «Чёрный маг»
  await p.G(() => window.__game.debug.openAdmin()); await p.waitForSelector('.mc-admin [data-tab="quest"]', { timeout: 20000 });
  await p.click('.mc-admin [data-tab="quest"]'); await sleep(700);
  { const li = await p.$('.mc-admin aside li:has-text("Тень на доспехах")'); if (li) await li.click(); await sleep(900);
    const f = await p.$('.mc-admin [data-q="blkFix"]'); ok(!!f, 'админка квеста: поле «Очищение снаряжения, %»'); if (f) { await f.scrollIntoViewIfNeeded(); await sleep(300); }
    await p.screenshot({ path: `${OUT}/11-quest-admin-blkfix.png` });
    const fl = await p.$('.mc-admin .vn-flow'); if (fl) { await fl.scrollIntoViewIfNeeded(); await sleep(600); } ok(await p.$('.mc-admin .vnw img[src*="black_mage"]'), 'админка: портреты Чёрного мага в окнах диалога');
    await p.screenshot({ path: `${OUT}/11b-quest-admin-mage-portraits.png` }); }
  { const t = await p.$('.mc-admin [data-tab="bmage"]'); ok(!!t, 'админка: вкладка «🌑 Чёрный маг»'); if (t) { await t.click(); await sleep(700); const li = await p.$('.mc-admin aside li'); if (li) await li.click(); await sleep(900); }
    await p.screenshot({ path: `${OUT}/12-admin-bmage.png`, fullPage: false }); }
  ok(!p.errs.length, 'нет ошибок страницы: ' + p.errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} FAIL` : '\nВСЁ PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
