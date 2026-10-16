// LOCAL: сундук зачищенного лагеря. Лагерные убийства — без мешков (копятся); весь лагерь → ОДИН сундук в центре; одиночка — мешок; админка «📦 Сундуки» → «Лагерь».
const { chromium } = require('playwright-core'); const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/camp-loot', BASE = 'http://127.0.0.1:5243/game.html', WS = 'ws://127.0.0.1:8799', ADMIN = 'test_admin_perf';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await guardLocal(ctx); const p = await ctx.newPage(); const rx = [];
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/"type":"(chest_|dev_chests|admin_result|toast)/.test(s) || s.includes('"loot":{')) { try { rx.push(JSON.parse(s)); } catch (_) {} } }));
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=CampA&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(2500);
  const G = (fn, a) => p.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.send(x), o), RAW = (o) => G((x) => window.__game.debug.rawSend(x), o);
  // админка → Сундуки → main: раздел «Лагерь»
  await G(() => window.__game.debug.openAdmin()); await p.waitForSelector('.mc-admin [data-tab="chest"]', { timeout: 15000 });
  await p.click('.mc-admin [data-tab="chest"]'); await sleep(500); await p.click('.mc-admin aside li[data-id="main"]').catch(() => {}); await sleep(2000);
  const labels = await G(() => document.querySelector('.mc-admin section').textContent);
ok(/Лагерь/.test(labels) && /как в таблице/.test(labels) && /второго сундука/.test(labels) && /даже если пустой/.test(labels) && /материалов в открытом мире/.test(labels), 'админка: раздел «Лагерь» со всеми настройками');
  await p.locator('.mc-admin section').screenshot({ path: `${OUT}/01-admin-chests-camp.png` });
  rx.length = 0; await RAW({ type: 'admin_save', kind: 'chest', id: 'main', patch: { on: true, campRaw: true, matDropMult: 0.1, campSecondPct: 0, campSpawnEmpty: true, personalSec: 120, guard: false } }); await sleep(1200);
  ok(rx.some((m) => m.type === 'admin_result' && m.ok), 'сохранено: matDropMult 0.1, сырые шансы, пустой — ставить');
  rx.length = 0; await RAW({ type: 'admin_save', kind: 'chest', id: 'main', patch: { matDropMult: -2 } }); await sleep(800); ok(rx.some((m) => m.type === 'admin_result' && !m.ok), 'matDropMult −2 отклонён сервером');
  await G(() => window.__game.debug.close?.()); await p.keyboard.press('Escape');
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) {
    await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700);
    await RAW({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1500);
  }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре');
  await G(() => window.__game.debug.tp(24000, 20700, true)); await sleep(4500);
  let camps = []; for (let i = 0; i < 10 && !camps.length; i++) { await sleep(1000); camps = await G(() => window.__game.debug.campsRaw() || []); }
  console.log('лагерей рядом:', camps.length, JSON.stringify(camps.slice(0, 4).map((c) => c.slice(0, 6))));
  const P = await G(() => window.__game.debug.pos());
  const camp = camps.filter((c) => c[3] === c[4] && c[4] >= 2 && c[4] <= 12).sort((a, z) => Math.hypot(a[1] - P.x, a[2] - P.y) - Math.hypot(z[1] - P.x, z[2] - P.y))[0];
  ok(!!camp, `лагерь для зачистки: ${JSON.stringify(camp)}`); if (!camp) throw new Error('нет лагеря');
  await G(([x, y]) => window.__game.debug.tp(x, y, true), [camp[1], camp[2]]); await sleep(1500);
  const cnt = async () => { rx.length = 0; await S({ type: 'dev_grant', chestInfo: true }); await sleep(600); const d = rx.filter((m) => m.type === 'dev_chests').pop(); return (d?.list || []).filter((c) => Math.hypot(c.x - camp[1], c.y - camp[2]) < 5).length; };
  const pre = await cnt();
  rx.length = 0; let bags = 0, encMsgs = 0, spawned = null;
  for (let i = 0; i < 40 && !spawned; i++) {
    const before = rx.length; await S({ type: 'dev_grant', killNear: true }); await sleep(450);
    for (const m of rx.slice(before)) { const lo = m.loot || m.push?.loot; if (lo) { if (lo.bag) bags++; if (lo.enc !== undefined) encMsgs++; } if (m.type === 'chest_spawn') spawned = m; }
    const cs = await G((id) => (window.__game.debug.campsRaw() || []).find((c) => c[0] === id), camp[0]); if (i % 3 === 0) console.log('  лагерь', JSON.stringify(cs?.slice(0, 6)), 'enc', encMsgs, 'bags', bags);
  }
  ok(encMsgs >= camp[4] - 1, `лагерные убийства копятся (enc): ${encMsgs}`);
  ok(bags === 0, `мешков с лагерных мобов нет (без двойного броска): ${bags}`);
  ok(!!spawned, `весь лагерь → сундук: ${JSON.stringify(spawned)}`);
  ok(spawned && Math.hypot(spawned.x - camp[1], spawned.y - camp[2]) < 5, 'сундук в центре лагеря');
  const post = await cnt(); ok(post - pre === 1, `зачистка дала ровно один сундук (${pre} → ${post})`);
  await G(() => window.__game.debug.setZoom?.(1.3)); await sleep(1200); await p.screenshot({ path: `${OUT}/02-camp-chest.png` });
  // открыть: личная фаза → окно
  rx.length = 0; await S({ type: 'chest_open', chest: spawned.id }); await sleep(900); const v = rx.find((m) => m.type === 'chest_view');
  ok(v && Number.isFinite(v.now), `окно сундука лагеря (${v?.entries?.length} поз.), сервер шлёт now для таймеров`);
  await p.screenshot({ path: `${OUT}/03-camp-chest-window.png` });
  await p.keyboard.press('Escape');
  // одиночный моб вне лагеря → мешок
  await G(([x, y]) => window.__game.debug.tp(x, y, true), [camp[1] + 2500, camp[2] + 2500]); await sleep(1200); const Q = await G(() => window.__game.debug.pos());
  await G(([x, y]) => window.__game.debug.devSpawn('dew_slime', x, y, false), [Q.x + 60, Q.y]); await sleep(700);
  rx.length = 0; await S({ type: 'dev_grant', killNear: true }); await sleep(900);
  const lo = rx.map((m) => m.loot || m.push?.loot).find(Boolean); ok(lo && lo.enc === undefined, `одиночка — не в сундук (enc нет), мешок: ${JSON.stringify(lo?.bag || null)}`);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
