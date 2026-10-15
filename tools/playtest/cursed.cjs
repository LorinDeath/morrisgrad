// Проклятые вещи: карточка (обычная vs проклятая), фиолетовый навык R, свечение 1/2/полный комплект (своё и у другого игрока), алтарь.
// Только localhost (tools/playtest/_local.cjs). BASE/WS — env CU_BASE/CU_WS.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/cursed-items';
const BASE = process.env.CU_BASE || 'http://127.0.0.1:5241/game.html';
const WS = process.env.CU_WS || 'ws://127.0.0.1:8789';
require('fs').mkdirSync(OUT, { recursive: true });
const SET = ['dew_slime_weapon', 'dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands'];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const blocked = await guardLocal(ctx);
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (name) => {
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`${BASE}?name=${name}&uid=test_cursed_${name}_${Date.now()}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1500);
    p.errs = errs; return p;
  };
  const p = await open('Cursed'); const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
  await G(() => window.__game.debug.send({ type: 'dev_grant', item: 'dew_slime_weapon' }));
  for (const id of SET) { await G((i) => window.__game.debug.send({ type: 'dev_grant', item: i + '@c' }), id); await p.waitForTimeout(150); }
  await p.waitForTimeout(1200);
  const inv = await G(() => window.__game.meta.account.inv.map((i) => ({ uid: i.uid, id: i.id, cursed: i.cursed || 0 })));
  const cur = (id) => inv.find((i) => i.id === id && i.cursed), nor = inv.find((i) => i.id === 'dew_slime_weapon' && !i.cursed);
  ok(SET.every((id) => cur(id)) && nor, `сумка: 5 проклятых + обычное оружие (${inv.length})`);
  // обычное оружие: статы
  await G((u) => window.__game.meta.equip(u), nor.uid); await p.waitForFunction((u) => window.__game.meta.hero?.equip?.weapon === u && window.__game.meta.hero.effective.itemDmgMin > 0, nor.uid, { timeout: 8000 }).catch(() => {});
  const effN = await G(() => window.__game.meta.hero.effective);
  await G((u) => window.__game.meta.equip(u), cur('dew_slime_weapon').uid); await p.waitForFunction(() => window.__game.meta.hero.effective.weaponCursed === 1, null, { timeout: 8000 }).catch(() => {});
  const effC = await G(() => window.__game.meta.hero.effective);
  ok(effC.itemDmgMin === Math.round(effN.itemDmgMin * 1.5) && effC.itemDmgMax === Math.round(effN.itemDmgMax * 1.5), `сервер: урон оружия ${effN.itemDmgMin}-${effN.itemDmgMax} → проклятое ${effC.itemDmgMin}-${effC.itemDmgMax}`);
  ok(effC.weaponCursed === 1 && effC.cursedGlow === 1, 'сервер: weaponCursed=1, свечение 1');
  // карточки
  await G(() => window.__game.debug.openBook('gear')); await p.waitForTimeout(700);
  await G((u) => document.querySelector(`.mc-item[data-v="${u}"]`)?.click(), nor.uid); await p.waitForTimeout(400);
  const cardN = await G(() => document.querySelector('.mc-detail .mc-tip')?.innerText || '');
  await (await p.$('.mc-gear')).screenshot({ path: `${OUT}/01-card-normal.png` });
  await G(() => document.querySelector('.mc-gslot.cursed')?.click()); await p.waitForTimeout(400);
  const cardC = await G(() => ({ t: document.querySelector('.mc-detail .mc-tip.cursed')?.innerText || '', slot: !!document.querySelector('.mc-gslot.cursed') }));
  await (await p.$('.mc-gear')).screenshot({ path: `${OUT}/02-card-cursed.png` });
  ok(/Проклят/.test(cardC.t) && /×1\.5/.test(cardC.t) && cardC.slot && !/Проклят/.test(cardN), 'карточка: приставка, фиолетовая рамка, строка проклятия');
  await G(() => window.__game.debug.openBook?.(null)); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // свечение 1 / 2 / полный (крупный план героя)
  await G(() => window.__game.debug.setZoom?.(3.2)); await p.waitForTimeout(1200);
  const shot = async (f) => { await p.waitForTimeout(900); const s = await G(() => { const q = window.__game.debug.pos(); return window.__game.debug.screenOf(q.x, q.y); }); await p.screenshot({ path: `${OUT}/${f}`, clip: { x: Math.max(0, s.x - 150), y: Math.max(0, s.y - 330), width: 300, height: 380 } }); };
  const glowOn = () => G(() => window.__game.debug.myGlow?.() ?? null);
  const k1 = await G(() => window.__game.meta.hero.effective.cursedGlow); await shot('04-glow-1.png'); const g1 = await glowOn();
  await G((u) => window.__game.meta.equip(u), cur('dew_slime_helmet').uid); await p.waitForTimeout(900);
  const k2 = await G(() => window.__game.meta.hero.effective.cursedGlow); await shot('05-glow-2.png'); const g2 = await glowOn();
  for (const id of SET.slice(2)) { await G((u) => window.__game.meta.equip(u), cur(id).uid); await p.waitForTimeout(500); }
  await p.waitForTimeout(900);
  const k5 = await G(() => window.__game.meta.hero.effective.cursedGlow); await shot('06-glow-full.png'); const g5 = await glowOn();
  ok(k1 === 1 && k2 === 2 && k5 === 5, `сервер: уровни свечения 1/2/5: ${k1}/${k2}/${k5}`);
  ok(g1 && g2 && g5 && g1.k < g2.k && g2.k < g5.k && g5.pulse && !g1.pulse, `клиент: яркость растёт, комплект пульсирует ${JSON.stringify([g1, g2, g5])}`);
  // второй игрок видит свечение (сервер шлёт players_state.stats.cg)
  const q = await open('Watcher');
  await q.evaluate(() => window.__game.debug.selectClass('mage')); await q.waitForTimeout(3000);
  const other = await q.evaluate(() => (window.__game.debug.othersInfo?.() || []).map((o) => ({ name: o.name || o.username, cg: o.stats?.cg })));
  const glowOther = await q.evaluate(() => window.__game.debug.othersGlow?.() || []);
  ok(glowOther.some((g) => g.k > 0.9 && g.pulse), `другой игрок видит свечение: ${JSON.stringify(other)} ${JSON.stringify(glowOther)}`);
  await q.close();
  // навык R проклятого оружия: сервер помечает события cz, клиент рисует фиолетовым. Реальный каст R + витрина (обычный / проклятый)
  const evs = [];
  await G(() => { window.__cuEv = []; const z = window.__game.debug; });
  await G(() => window.__game.debug.fxDemo('clear'));
    await G(() => { const d = window.__game.debug, q = d.pos(); d.cursedFxDemo(q.x, q.y); });
  await G(() => window.__game.debug.setZoom?.(1.6)); await p.waitForTimeout(1500);
  { const s0 = await G(() => { const q = window.__game.debug.pos(); return window.__game.debug.screenOf(q.x + 60, q.y - 60); }); console.log('s0', JSON.stringify(s0)); await p.screenshot({ path: `${OUT}/03-skill-normal-vs-cursed.png` }); }
  console.log('projs', JSON.stringify(await G(() => window.__game.debug.projList?.().list?.slice(0, 6) || window.__game.debug.projs())));
  ok(await G(() => window.__game.debug.projs().live > 0), 'витрина навыка: обычный (слева) и проклятый фиолетовый (справа)');
  // altar
  await G(() => window.__game.debug.openAltar()); await p.waitForTimeout(1500);
  const alt = await G(() => ({ glow: !!document.querySelector('.mc-altar-portrait img.mc-cursed-glow.pulse'), slot: [...document.querySelectorAll('.mc-altar-slot')].filter((e) => e.style.borderColor.includes('168, 85, 247')).length }));
  await p.screenshot({ path: `${OUT}/07-altar-glow.png` });
  ok(alt.glow && alt.slot === 5, `алтарь: свечение портрета + 5 фиолетовых слотов ${JSON.stringify(alt)}`);
  console.log('pageerrors', p.errs.slice(0, 5));
  ok(!p.errs.length, 'без ошибок страницы');
  ok(!blocked.length, 'только localhost');
  console.log(`cursed-ui ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
