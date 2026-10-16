// LOCAL: проклятые копии с проклятого босса → мешок → сумка → item_instances.cursed=1. Конфиг «Проклятие» как на проде (+ форсированный шанс для проверки пути).
const { chromium } = require('playwright-core'); const { execSync } = require('node:child_process'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', ADMIN = 'test_admin_perf';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = (q) => JSON.parse(execSync(`cd /workspace/mg-push/server && node --no-warnings ../node_modules/wrangler/wrangler-dist/cli.js d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-chests/wr --json --command "${q}"`, { encoding: 'utf8' }))[0].results;
const PROD = { equipDropMult: 0.1, mobDropMult: 3, itemChanceMult: 4, bossOnly: true, statMult: 1.5, rsMult: 2, mobHp: 4.5, mobDmg: 2.2, mobArmor: 1.45, mobXp: 2 };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx); const p = await ctx.newPage(); const rx = [];
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"loot":{') || /"type":"(admin_result|loot_)/.test(s)) { try { rx.push(JSON.parse(s)); } catch (_) {} } }));
  await p.goto(assertLocalUrl(`${BASE}?name=CurseT&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(2000);
  const G = (fn, a) => p.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.send(x), o), RAW = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await RAW({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1500); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре'); await G(() => window.__game.debug.tp(30500, 30500, true)); await sleep(2000);
  const run = async (label, patch, n) => {
    rx.length = 0; await RAW({ type: 'admin_save', kind: 'curse', id: 'main', patch }); await sleep(1000); ok(rx.some((m) => m.type === 'admin_result' && m.ok), `${label}: конфиг сохранён ${JSON.stringify(patch).slice(0, 90)}`);
    let got = 0, kills = 0;
    for (let i = 0; i < n; i++) {
      const P = await G(() => window.__game.debug.pos()); await G(([x, y]) => window.__game.debug.devSpawn('swarm_mother', x + 50, y, true), [P.x, P.y]); await sleep(500);
      let lo = null; for (let k = 0; k < 6 && !(lo && lo.mob === 'swarm_mother'); k++) { rx.length = 0; await S({ type: 'dev_grant', killNearAny: true, killType: 'swarm_mother', cursed: true }); await sleep(800); lo = rx.map((m) => m.loot || m.push?.loot).find((l) => l && l.mob); } console.log('  kill', String(JSON.stringify(lo)).slice(0, 300)); if (!lo) continue; kills++;
      if (lo.bag) { rx.length = 0; await RAW({ type: 'loot_take', bag: lo.bag.id, all: true }); await sleep(700); const t = rx.map((m) => m.loot || m.push?.loot).find((l) => l && l.fromBag); got += (t?.items || []).filter((it) => it.cursed).length; }
      if (lo.enc !== undefined) console.log('  в сундук (enc)', lo.enc);
      await G(([x, y]) => window.__game.debug.tp(x + 300, y, true), [P.x, P.y]); await sleep(300);
    }
    return { kills, got };
  };
  const r1 = await run('прод-конфиг', PROD, 6); console.log('  прод-конфиг:', JSON.stringify(r1));
  const r2 = await run('форс (itemChanceMult 1000 → 100%)', { ...PROD, itemChanceMult: 100, equipDropMult: 100 }, 3); ok(r2.got > 0, `проклятые копии в сумке: ${r2.got} за ${r2.kills} убийств`);
  await sleep(12000); // сохранение профиля в D1
  const rows = d1(`SELECT item_id, cursed, source FROM item_instances WHERE owner='uid:${ADMIN}' AND source LIKE 'boss:swarm_mother' ORDER BY acquired_at DESC LIMIT 40`);
  const nc = rows.filter((r) => r.cursed === 1).length; ok(nc >= r2.got && nc > 0, `D1 item_instances: cursed=1 строк ${nc} (из ${rows.length} с босса)`);
  await RAW({ type: 'admin_save', kind: 'curse', id: 'main', patch: PROD }); await sleep(800);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
