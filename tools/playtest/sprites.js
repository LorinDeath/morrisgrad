// Новые спрайты (утверждены 2026-10): герои 48×60 (heroes_atlas), NPC 48×60, мобы (bestiary_atlas v3), Кейт/Дар.
// Скриншоты на полной странице: ПК + телефон. NODE_PATH=<playwright-core> node tools/playtest/sprites.js
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [], warns = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const T = Date.now();
  const open = async (n, uid, ctxOpts = { viewport: { width: 1440, height: 860 } }) => {
    const p = await (await b.newContext(ctxOpts)).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    p.on('console', (m) => { if (/\[pix\]|атлас/.test(m.text())) warns.push(m.text()); });
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=${uid}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 90000 });
    return p;
  };
  const G = (p, fn, a) => p.evaluate(fn, a);
  const cls = ['spearman', 'rogue', 'mage', 'warrior'];
  const ps = [];
  for (let i = 0; i < 4; i++) { const p = await open(['Нофорд', 'Кавега', 'Мариэль', 'Велес'][i], `t_spr_${i}_${T}`); await G(p, (c) => window.__game.debug.selectClass(c), cls[i]); ps.push(p); }
  for (let i = 0; i < 4; i++) await G(ps[i], (k) => window.__game.debug.teleport(560 + k * 45, 620), i);
  await ps[0].waitForTimeout(3000);
  ok(await G(ps[0], () => !!document.querySelector('canvas')), 'canvas');
  await ps[0].screenshot({ path: `${OUT}/sprites-01-heroes-desktop.png` });
  // атака/ходьба — кадры замах/удар и шаги
  await ps[1].keyboard.down('KeyD'); await ps[1].waitForTimeout(500); await ps[0].screenshot({ path: `${OUT}/sprites-02-heroes-walk.png` }); await ps[1].keyboard.up('KeyD');
  // Кейт (босс хаба) и NPC Петр/Кьют
  await G(ps[0], () => window.__game.debug.teleport(700, 640)); await ps[0].waitForTimeout(2500);
  await ps[0].screenshot({ path: `${OUT}/sprites-03-boss-keyt.png` });
  await G(ps[0], () => window.__game.debug.teleport(600, 740)); await ps[0].waitForTimeout(2500);
  await ps[0].screenshot({ path: `${OUT}/sprites-04-npc-petr-kyut.png` });
  // Аринар: мобы + NPC Алзи/Лэйр
  const p = ps[0];
  for (let i = 0; i < 8 && (await G(p, () => window.__game.state().world)) !== 'arinar'; i++) {
    await G(p, () => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
    await G(p, () => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1200);
  }
  ok(await G(p, () => window.__game.state().world) === 'arinar', 'in Arinar');
  await G(p, () => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 24000, y: 27000 }); window.__game.debug.tp(24000, 27000); }); await p.waitForTimeout(3000); // и на сервере: мобы приходят только в зоне видимости героя // Аринар 24000: Луга фиалок
  await p.screenshot({ path: `${OUT}/sprites-05-npc-alzi-leyr.png` });
  const mobs = await G(p, () => window.__game.debug.zoneMobs());
  ok(mobs.length > 0, `zone mobs: ${mobs.length}`);
  if (mobs.length) { const m = mobs[Math.floor(mobs.length / 2)]; await G(p, (q) => window.__game.debug.tp(q.x - 60, q.y), m); await p.waitForTimeout(3000); }
  await p.screenshot({ path: `${OUT}/sprites-06-mobs.png` });
  const far = mobs.filter((m) => m.type && m.type.includes('king') || m.type.includes('boss'))[0] || mobs[mobs.length - 1];
  if (far) { await G(p, (q) => window.__game.debug.teleport(q.x - 60, q.y), far); await p.waitForTimeout(3000); }
  await p.screenshot({ path: `${OUT}/sprites-07-mobs-2.png` });
  // телефон
  const M = await open('Мобила', `t_spr_m_${T}`, { ...devices['Pixel 7'] });
  await G(M, () => window.__game.debug.selectClass('mage')); await G(M, () => window.__game.debug.teleport(600, 650)); await M.waitForTimeout(3500);
  await M.screenshot({ path: `${OUT}/sprites-08-mobile-heroes.png` });
  await G(M, () => window.__game.debug.teleport(640, 760)); await M.waitForTimeout(2500);
  await M.screenshot({ path: `${OUT}/sprites-09-mobile-npc-boss.png` });
  // забег: орда из bestiary_atlas
  await G(ps[2], () => window.__game.startRun('crypt')); await ps[2].waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 30000 }).catch(() => {});
  await ps[2].waitForTimeout(12000);
  ok(await G(ps[2], () => window.__game.state().mode) === 'run', 'run started');
  await ps[2].screenshot({ path: `${OUT}/sprites-10-run-horde.png` });
  ok(warns.length === 0, 'no atlas load warnings' + (warns[0] ? ': ' + warns[0] : ''));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0].slice(0, 300) : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
