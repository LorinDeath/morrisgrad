// LOCAL ONLY (локальный wrangler dev + vite, см. mc-harness): сбор ресурсов вплотную к узлу.
// Сценарии для каждого типа ресурса: A) стоим; B) позицию героя «дёрнуло» на 40 px (коррекция сервера, скольжение у пропса, лаг) —
// сбор НЕ должен прерываться, пока герой в радиусе сбора; C) герой реально ушёл на 160 px — сбор должен прерваться.
// Запуск: NODE_PATH=/workspace/mc-ui-tools/node_modules node tools/playtest/gather-range.cjs   (GR_SHOT=имя — скриншот)
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.GR_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.GR_WS || 'ws://127.0.0.1:8995';
const OUT = process.env.OUT || '/workspace/gather-fix';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const msgs = [];
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"gathered"')) msgs.push('gathered'); if (process.env.GR_DIAG && /zone_respawn|pos_fix|world_switched/.test(s)) console.log('  frame', s.slice(0, 140)); if (s.includes('toast_error')) msgs.push(s.slice(0, 160)); }));
  const uid = 'gr_' + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  const G = (f, a) => p.evaluate(f, a);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(2500); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  await sleep(2500);
  const tp = async (x, y) => { for (let k = 0; k < 4; k++) { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await sleep(900); const q = await G(() => window.__game.debug.pos()); if (Math.hypot(q.x - x, q.y - y) < 5) { await sleep(600); return true; } } return false; };
  const all = (await G(() => window.__game.debug.nodesAll())).filter((n) => n.ready && Math.hypot(n.x - 24000, n.y - 24150) < Number(process.env.GR_RADIUS || 3500));
  const byRes = {}; for (const n of all) (byRes[n.res] ||= []).push(n);
  console.log('ресурсы у хаба:', Object.entries(byRes).map(([k, v]) => k + '×' + v.length).join(' '));
  const cfg = await G(() => window.__game.debug.gatherCfg?.() || null); for (const id of [1000,1047,1048,1049,1065]) console.log('client node', id, JSON.stringify(all.find((n) => n.id === id) || null)); console.log('конфиг сбора на клиенте:', JSON.stringify(cfg));
  let tested = 0, shot = false;
  const run = async (n, scen) => {
    if (!(await tp(n.x, n.y + 12))) { console.log('teleport failed', n.res, n.id); return null; }
    msgs.length = 0; await G(() => { const b = document.querySelector('.mc3d-toasts'); if (b) b.innerHTML = ''; });
    await G(() => window.__game.debug.interact());
    await sleep(150);
    const started = !!(await G(() => window.__game.debug.gatherSt()));
    const s0 = await G(() => window.__game.debug.pos());
    if (scen === 'jolt') await G(([x, y]) => window.__game.debug.teleport(x, y), [s0.x + 40, s0.y]);       // «дёрнуло» на 40 px (узел остаётся в ≈ 42 px)
    if (scen === 'leave') await G(([x, y]) => window.__game.debug.teleport(x, y), [s0.x + 160, s0.y]);     // ушёл по-настоящему
    if (process.env.GR_SHOT && !shot && scen === 'jolt') { shot = true; await sleep(250); await p.screenshot({ path: `${OUT}/${process.env.GR_SHOT}.png` }); }
    let toast = ''; for (let k = 0; k < 24; k++) { await sleep(100); toast += '|' + await G(() => [...document.querySelectorAll('.mc3d-toast')].map((e) => e.textContent).join('|')); }
    return { started, interrupted: /Сбор прерван/.test(toast), gathered: /\+\d+/.test(toast) || msgs.includes('gathered'), err: (toast + ' ' + msgs.join(';')).slice(0, 110) };
  };
  for (const [res, list] of Object.entries(byRes)) {
    const used = list.slice(0, 3); if (process.env.GR_ONLY && !process.env.GR_ONLY.split(',').includes(res)) continue;
    for (const [scen, i] of [['stand', 0], ['jolt', 1], ['leave', 2]]) {
      const n = used[i]; if (!n) continue;
      const r = await run(n, scen); if (!r) continue; tested++;
      console.log(`${res} #${n.id} ${scen}: начат=${r.started} прерван=${r.interrupted} gathered=${r.gathered} ${r.err}`);
      ok(r.started, `${res}/${scen}: сбор начался`);
      if (scen === 'leave') ok(r.interrupted && !r.gathered, `${res}/leave: ушёл на 160 px — сбор прерван`);
      else ok(!r.interrupted && r.gathered, `${res}/${scen}: сбор дошёл до конца, не прерван`);
    }
  }
  ok(tested >= 6, 'сценариев проверено: ' + tested);
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(3); });
