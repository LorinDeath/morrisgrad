// «Глубокая стужа»: Морозная звезда замораживает мобов на 3 с в мире (сервер) — мобы стоят, голубые. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3', UID = 'pt_frz_' + Date.now().toString(36);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=${UID}&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game.meta?.state, null, { timeout: 120000 }); await p.waitForTimeout(1500);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', flags: { talents_open: 1 }, xp: 5e6 })); await p.waitForTimeout(1200);
  for (const id of ['coat', 'coat', 'coat', 'frost_nova', 'ether', 'ether', 'ether', 'deep']) { await G((x) => window.__game.meta.talentLearn('mage.' + x), id); await p.waitForTimeout(250); }
  await G(() => window.__game.meta.setLoadout(['frost_nova', 'fireball'])); await p.waitForTimeout(1000);
  const t = await G(() => window.__game.meta.state.hero.talents); ok(t['mage.deep'] === 1, '«Глубокая стужа» изучена ' + JSON.stringify(t));
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 24000, y: 20500, god: true }); window.__game.debug.teleport(24000, 20500); }); await p.waitForTimeout(3500);
  const near = async () => (await G(() => window.__game.debug.zoneMobs())).map((m) => ({ ...m, d: 0 }));
  let ms = await near(); const me = await G(() => window.__game.state().player);
  ms.sort((a, z) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(z.x - me.x, z.y - me.y));
  // гарантированные живучие обычные мобы прямо перед героем (ближайшие у хаба — слабые и умирали от самой «Стужи» раньше проверки)
  await G(([x, y]) => { for (const dy of [-40, 0, 40]) window.__game.debug.rawSend({ type: 'dev_spawn_mob', mob: 'garden_golem', x: x + 70, y: y + dy, cursed: true }); }, [me.x, me.y]); await p.waitForTimeout(1500);
  const m0 = null; if (m0) { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [m0.x - 40, m0.y]); await p.waitForTimeout(1500); }
  await p.mouse.move(700, 380); await p.keyboard.press('KeyQ'); await p.waitForTimeout(700);
  const fr = await G(() => window.__game.debug.zoneFrozen());
  await p.screenshot({ path: `${OUT}/freeze-world.png` });
  const pos1 = await G(() => window.__game.debug.zoneFrozen(true)); await p.waitForTimeout(1000);
  const pos2 = await G(() => window.__game.debug.zoneFrozen(true));
  const still = pos1.filter((a) => { const b2 = pos2.find((x) => x.id === a.id); return b2 && Math.hypot(b2.x - a.x, b2.y - a.y) < 3; }).length;
  console.log('  frozen', JSON.stringify(pos1), '→', JSON.stringify(pos2.filter((x) => pos1.some((a) => a.id === x.id))));
  ok(fr > 0, `замороженных мобов рядом: ${fr}`);
  const alive = pos1.filter((a) => pos2.some((x) => x.id === a.id)).length; // погибшие от урона «Стужи» не считаем
  ok(still > 0 && still === alive, `замороженные стоят на месте (${still} неподвижных)`);
  await p.waitForTimeout(2500); const fr2 = await G(() => window.__game.debug.zoneFrozen?.()); ok(fr2 < fr, `через ~4 с заморозка спала (${fr} → ${fr2})`);
  ok(!errs.length, 'без ошибок ' + errs.join('|'));
  console.log(fails ? `FAILED ${fails}` : 'freeze ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
