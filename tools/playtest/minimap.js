// Мини-карта: в хабе/Аринаре видны все мобы зоны (боссы — ромб) и все игроки этого мира (голубые), в забеге/испытании — враги, боссы, сундуки, сердце, союзники; камни опыта скрыты.
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const open = async (n) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
    p.on('pageerror', (e) => errs.push(n + ' ' + String(e.stack || e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${n}&uid=test_r2_mm_${n}_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
    return p;
  };
  const A = await open('MmA'), B = await open('MmB');
  const G = (p, fn, a) => p.evaluate(fn, a);
  const mm = (p) => G(p, () => window.__game.debug.minimap());
  const shot = async (p, name) => { const el = p.locator('.hud-minimap-card canvas').first(); await el.screenshot({ path: `${OUT}/${name}` }); };
  await G(A, () => window.__game.debug.teleport(600, 640)); await G(B, () => window.__game.debug.teleport(640, 600));
  await A.waitForTimeout(2500);
  let s = await mm(A);
  ok(s?.mode === 'world' && s.world === 'hellfire' && s.players >= 1, 'hub: other player drawn ' + JSON.stringify(s));
  await shot(A, 'minimap-hub.png');
  // Аринар (открытая зона)
  for (const p of [A, B]) {
    for (let i = 0; i < 8 && (await G(p, () => window.__game.state().world)) !== 'arinar'; i++) {
      await G(p, () => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700);
      await G(p, () => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1200);
    }
  }
  await G(A, () => window.__game.debug.tp(12000, 13500)); await G(B, () => window.__game.debug.tp(12080, 13520)); // Аринар 24000: к лагерям Лугов фиалок
  await A.waitForTimeout(3000);
  s = await mm(A);
  const known = await G(A, () => { const z = window.__game.zone?.mobs; return z ? z.size : -1; });
  ok(s?.world === 'arinar' && s.mobs > 0, `arinar: zone mobs drawn ${JSON.stringify(s)} (zone knows ${known})`);
  ok(s?.players >= 1, 'arinar: other player drawn ' + JSON.stringify({ bw: await G(B, () => window.__game.state().world), oth: await G(A, () => window.__game.debug.othersInfo()) }));
  console.log('mobs', JSON.stringify(await G(A, () => window.__game.debug.zoneMobs())).slice(0, 600));
  // мировые боссы Аринара появляются по таймеру (2–6 мин) — для проверки маркера кладём босса в список зоны клиента
  const realBosses = s.bosses || 0; // на долго работающем сервере настоящий босс уже может быть рядом
  await G(A, () => { const p = window.__game.state().player; setInterval(() => window.__game.debug.fakeZoneMob('swarm_mother', p.x + 90, p.y - 40), 20); });
  await A.waitForTimeout(400);
  s = await mm(A);
  ok(s.bosses >= Math.max(1, realBosses), 'arinar: boss drawn as distinct diamond ' + JSON.stringify(s));
  await shot(A, 'minimap-arinar.png');
  // испытание (trial) — враги, сердце, сундук, союзников нет; камни скрыты
  await G(A, () => window.__game.startRun('trial'));
  await A.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 10000 });
  await A.waitForTimeout(6000);
  await G(A, () => { window.__game.debug.spawn('imp', 4, true); window.__game.debug.spawn('warden', 1); });
  await A.waitForTimeout(800);
  s = await mm(A);
  const rs = await G(A, () => { const r = window.__game.run; return { en: [...r.enemies.values()].filter((e) => !e.dead).length, gems: r.gems.size, chests: [...r.pickups.values()].filter((p) => p.kind === 'chest').length }; });
  ok(s?.mode === 'run' && Math.abs(s.mobs - rs.en) <= 3 && s.heart === 1 && s.bosses >= 1 && s.chests === rs.chests && s.gems === 0, `trial: all enemies + heart drawn, gems hidden ${JSON.stringify(s)} vs ${JSON.stringify(rs)}`);
  await shot(A, 'minimap-trial.png');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
