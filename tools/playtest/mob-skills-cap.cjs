// LOCAL: навыки боссов (обычный 1–3, мировой 5–10 — не проклятые тоже кастуют) + сила навыка выше ×4 (Огненный шар ×10 vs ×4).
// Только 127.0.0.1 (guardLocal). MS_BASE=http://127.0.0.1:5293/game.html MS_WS=ws://127.0.0.1:8893 MS_WR=/workspace/mc-harness-mobsk/wr node tools/playtest/mob-skills-cap.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/mob-skills';
const BASE = process.env.MS_BASE || 'http://127.0.0.1:5293/game.html', WS = process.env.MS_WS || 'ws://127.0.0.1:8893', WR = process.env.MS_WR || '/workspace/mc-harness-mobsk/wr';
const ADMIN = 'ms_admin_' + Date.now().toString(36);
require('child_process').execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}','admin','local-test',0)"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const frames = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/mskill|"k":"hit"|admin_result|ability_cd|zone_mobs|"spawned"/.test(s)) frames.push({ t: Date.now(), s }); }));
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (fn, a) => p.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('mage')); await sleep(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  const go = async (x, y) => { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await sleep(2500); };
  const X = 24000, Y = 20500;
  const evs = (since, re) => frames.filter((f) => f.t >= since).flatMap((f) => [...f.s.matchAll(re)]);
  // 1) мировой босс (не проклятый): 5–10 навыков, кастует
  const bossCast = async (special, label, file, X = 24000, Y = 20500) => {
    await go(X, Y);
    const t0 = Date.now();
    await S({ type: 'dev_spawn_mob', mob: 'moon_sentinel', x: X + 170, y: Y, cursed: false, special }); await sleep(800);
    const names = new Set(), ids = new Set(); let shots = 0;
    for (let i = 0; i < 40 && (names.size < 4 || shots < 2); i++) {
      await sleep(700);
      // только навыки заспавненного босса: событие mskill рядом с точкой появления (другие мобы далеко)
      for (const m of evs(t0, /"k":"mskill","id":(\d+),"x":(-?\d+),"y":(-?\d+),"name":"([^"]+)"/g)) if (Math.hypot(+m[2] - X, +m[3] - Y) < 500) { ids.add(m[1]); if (ids.size === 1 || m[1] === [...ids][0]) names.add(m[4]); }
      if (names.size >= 2 * (shots + 1) && shots < 2) { await sleep(300); await p.screenshot({ path: `${OUT}/${file}-${++shots}.png` }); }
      if (i % 8 === 7) await go(X + 20, Y);
    }
    return names;
  };
  const wn = await bossCast('boss', 'мировой', 'world-boss');
  ok(wn.size >= 3, `мировой Безветрие (не проклятый) применил навыков: ${wn.size} — ${[...wn].join(', ')}`);
  // 2) сила: Огненный шар ×4 vs ×10 по мобу с броней ≈ 0
  await go(30000, 9000); // подальше от прошлых
  const hitAt = async (power) => {
    await S({ type: 'admin_save', kind: 'skill', id: 'fireball', patch: { power } }); await sleep(3000);
    const me = await G(() => window.__game.state().me || null);
    const x0 = Math.round(me?.x || 30000), y0 = Math.round(me?.y || 9000);
    await S({ type: 'dev_spawn_mob', mob: 'dew_slime', x: x0 + 110, y: y0, cursed: false, special: '' }); await sleep(900);
    const t0 = Date.now();
    await S({ type: 'zone_ability', id: 'fireball', dx: 1, dy: 0, tx: x0 + 110, ty: y0 }); await sleep(2500);
    const cd = evs(t0, /"type":"ability_cd"[^}]*"id":"fireball"[^}]*"ok":(true|false)/g).map((m) => m[1]);
    const hits = evs(t0, /\{"k":"hit","id":(\d+),"d":(\d+)(,"[a-z]+":[^,}]+)*\}/g).filter((m) => !/mob|dot/.test(m[0])).map((m) => [+m[1], +m[2]]);
    await p.screenshot({ path: `${OUT}/fireball-x${power}.png` });
    await sleep(16500); // перезарядка 16 с
    return { cd, max: hits.reduce((a, h) => Math.max(a, h[1]), 0), hits };
  };
  const h4 = await hitAt(4), h10 = await hitAt(10);
  console.log('   x4', JSON.stringify(h4), '\n   x10', JSON.stringify(h10));
  ok(h4.cd[0] === 'true' && h10.cd[0] === 'true', 'Огненный шар применён оба раза');
  const r = h10.max / (h4.max || 1);
  ok(h4.max > 0 && r > 2.2 && r < 2.8, `Огненный шар: ×4 → ${h4.max}, ×10 → ${h10.max} (в ${r.toFixed(2)} раза; раньше 1.0)`);
  await S({ type: 'admin_reset', kind: 'skill', id: 'fireball' }); await sleep(1500);
  // 3) обычный босс (не мировой): 1–3 навыка, кастует
  const on = await bossCast('', 'обычный', 'boss', 27000, 15000);
  ok(on.size >= 1 && on.size <= 3, `обычный Безветрие (не мировой, не проклятый) применил: ${on.size} — ${[...on].join(', ')}`);
  ok(!blocked.length, 'ни одного не локального запроса ' + blocked.slice(0, 3).join(' '));
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `FAILED ${fails}` : 'mob-skills-cap playtest ok'); await b.close(); process.exit(fails ? 1 : 0);
})();
