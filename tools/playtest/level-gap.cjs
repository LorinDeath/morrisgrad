// LOCAL: ребаланс мобов + правило разницы уровней. Админ применяет ВЕСЬ пакет (вещи защиты + бестиарий) тем же admin_save,
// что пойдёт на прод; герой ур.9 с копьём ур.9 бьёт моба своего уровня, +1 и +2 — урон ×1 / ×0.6 / ×0.08. Только 127.0.0.1 (guardLocal).
// LG_BASE=http://127.0.0.1:5313/game.html LG_WS=ws://127.0.0.1:8913 LG_WR=/workspace/mc-harness-enchant/wr node tools/playtest/level-gap.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs'), cp = require('child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/balance/playtest';
const BASE = process.env.LG_BASE || 'http://127.0.0.1:5313/game.html', WS = process.env.LG_WS || 'ws://127.0.0.1:8913', WR = process.env.LG_WR || '/workspace/mc-harness-enchant/wr';
const BAL = process.env.LG_BAL || '/workspace/morrisgrad-round3/balance';
const ITEMS = JSON.parse(fs.readFileSync(`${BAL}/item-fixes.admin_save.json`, 'utf8')), MOBS = JSON.parse(fs.readFileSync(`${BAL}/mob-overrides.admin_save.json`, 'utf8'));
const PROP = JSON.parse(fs.readFileSync(`${BAL}/mobs-proposal.json`, 'utf8'));
const ADMIN = 'lg_admin_' + Date.now().toString(36);
cp.execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'playtest', ${Date.now()})"`, { stdio: 'ignore' });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, vp, mobile) => {
    const ctx = await b.newContext(mobile ? { viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: vp }); const blocked = await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.blocked = blocked; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.adm = []; p.st = null;
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"admin_')) try { p.adm.push(JSON.parse(s)); } catch {} if (s.includes('"type":"zone_state"') && s.includes('"tg":{')) try { p.tg = JSON.parse(s).tg; } catch {} if (s.includes('"type":"meta_state"')) try { const j = JSON.parse(s); if (j.hero || j.account) p.st = j; } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
    return p;
  };
  // 1) админ: весь пакет — тем же путём, что на проде
  const A = await open(ADMIN, { width: 1280, height: 800 });
  const AS = (o) => A.evaluate((x) => window.__game.debug.rawSend(x), o);
  await AS({ type: 'admin_open' }); await sleep(1500);
  // сервер принимает правку не чаще раза в 300 мс — по одной, с ожиданием admin_result на каждую
  let saved = 0; const errs = [];
  for (const m of [...ITEMS, ...MOBS]) {
    const n0 = A.adm.length; await AS({ type: m.type, kind: m.kind, id: m.id, patch: m.patch });
    let r = null; for (let i = 0; i < 40 && !r; i++) { await sleep(50); r = A.adm.slice(n0).find((x) => x.type === 'admin_result' && x.id === m.id) || null; }
    if (r && r.ok !== false && !r.err) saved++; else errs.push({ id: m.id, r });
    await sleep(320);
  }
  ok(saved === ITEMS.length + MOBS.length, `сохранено ${saved} из ${ITEMS.length + MOBS.length}`);
  console.log('admin replies:', A.adm.length, [...new Set(A.adm.map((x) => x.type))].join(','));
  ok(errs.length === 0, `пакет: ${ITEMS.length} вещей + ${MOBS.length} мобов без ошибок ${errs.slice(0, 3).map((e) => JSON.stringify(e).slice(0, 160)).join(' | ')}`);
  // 2) герой ур.10, воин
  const H = await open('lg_hero_' + Date.now().toString(36), { width: 1440, height: 860 });
  const G = (fn, a) => H.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2000);
  const lvOf = () => { const s = H.st || {}; const h = s.hero || (s.account?.heroes || []).find?.((x) => x.active) || {}; return Number(h.level || h.lvl || 0); };
  for (let i = 0; i < 60; i++) { await S({ type: 'meta_get' }); await sleep(250); if (lvOf() >= 9) break; await S({ type: 'dev_grant', xp: 3000 }); await sleep(150); }
  console.log('meta keys', Object.keys(H.st || {}).join(','), 'hero keys', Object.keys(H.st?.hero || {}).slice(0, 20).join(','));
  await S({ type: 'meta_get' }); await sleep(1200);
  const heroL = lvOf();
  console.log('hero level', heroL);
  await S({ type: 'dev_grant', item: 'thorn_vine_weapon' }); await sleep(400); await S({ type: 'meta_get' }); await sleep(1200);
  const wpn = (H.st?.account?.inv || []).find((i) => i.id === 'thorn_vine_weapon'); ok(!!wpn, 'выдано копьё ур.9 (обычное, +0)');
  if (wpn) { await S({ type: 'equip', uid: wpn.uid }); await sleep(1000); }
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'герой в Аринаре');
  const L = Number(heroL) || 10;
  const pick = (lv) => PROP.find((r) => r.kind === 'mob' && r.lvl === lv && (r.role === 'melee' || r.role === 'caster')) || PROP.find((r) => r.kind === 'mob' && r.lvl === lv);
  const res = {};
  let X = 30000 + Math.floor(Math.random() * 3000); const Y = 8000 + Math.floor(Math.random() * 2000);
  for (const g of [0, 1, 2]) {
    const r = pick(L + g); if (!r) { console.log('нет моба ур.' + (L + g)); continue; }
    X += 700;
    await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X, Y]); await sleep(2000);
    const before = await G(() => window.__game.debug.zoneMobsFull().map((m) => m.id));
    await S({ type: 'dev_spawn_mob', mob: r.id, x: X + 60, y: Y, special: '', cursed: false, ench: 0 }); await sleep(1500);
    const mob = await G(([t, ids]) => window.__game.debug.zoneMobsFull().find((m) => m.type === t && !ids.includes(m.id)) || null, [r.id, before]);
    if (!mob) { ok(false, `моб ${r.id} появился`); continue; }
    await G((id) => window.__game.debug.selectMobId(id), mob.id); await S({ type: 'zone_target', id: mob.id }); H.tg = null; await sleep(1500);
    const tg0 = H.tg && H.tg.id === mob.id ? { ...H.tg } : null;
    ok(tg0 && Math.abs(tg0.maxHp - r.new.hp) <= 1 && Math.abs(tg0.dmg - r.new.dmg) < 0.05 && Math.abs(tg0.armor - r.new.armor) < 0.5, `+${g}: ${r.id} ур.${r.lvl} сервер: ОЗ ${tg0?.maxHp} урон ${tg0?.dmg} броня ${tg0?.armor} (новое ${r.new.hp}/${r.new.dmg}/${r.new.armor}, было ${r.cur.hp}/${r.cur.dmg}/${r.cur.armor})`);
    mob.maxHp = tg0?.maxHp; const hp0 = tg0?.hp; const t0 = Date.now();
    for (let i = 0; i < 16; i++) { await S({ type: 'zone_attack', mob: mob.id, x: X, y: Y, tx: X + 60, ty: Y }); await sleep(560); }
    await sleep(800);
    const m1 = H.tg && H.tg.id === mob.id ? H.tg : { hp: 0 };
    const dealt = hp0 - m1.hp, sec = (Date.now() - t0) / 1000;
    res[g] = { id: r.id, lvl: r.lvl, maxHp: mob.maxHp, dealt, dps: dealt / sec, ttk: mob.maxHp / (dealt / sec) };
    console.log(`+${g}: ${r.id} урон ${dealt.toFixed(0)} за ${sec.toFixed(1)} с → DPS ${(dealt / sec).toFixed(1)}, TTK ≈ ${(mob.maxHp / Math.max(1e-6, dealt / sec)).toFixed(0)} с`);
    await H.screenshot({ path: `${OUT}/pc-gap${g}-${r.id}.png` });
  }
  if (res[0] && res[2]) { const k = res[2].dps / res[0].dps; ok(k < 0.15, `+2 / свой уровень: ×${k.toFixed(3)} (правило ×0.08, плюс броня)`); ok(res[2].ttk > 300, `+2: TTK ${res[2].ttk.toFixed(0)} с — не убить`); }
  if (res[0] && res[1]) { const k = res[1].dps / res[0].dps; ok(k > 0.4 && k < 0.8, `+1 / свой уровень: ×${k.toFixed(2)} (правило ×0.6)`); }
  if (res[0]) ok(res[0].ttk > 15, `свой уровень: TTK ${res[0].ttk.toFixed(0)} с (было ~5–7 с)`);
  // 3) телефон: панель и мобы без ошибок
  const M = await open('lg_mob_' + Date.now().toString(36), { width: 844, height: 390 }, true);
  await M.evaluate(() => window.__game.debug.selectClass('rogue')); await sleep(2500); await M.screenshot({ path: `${OUT}/mobile-hub.png` });
  for (const p of [A, H, M]) { ok(!p.blocked.length, 'нет запросов наружу'); ok(!p.errs.length, 'без ошибок страницы ' + p.errs.join(' | ')); }
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify({ heroL: L, res }, null, 1));
  await b.close(); console.log(fails ? `FAILED ${fails}` : 'level-gap ok'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
