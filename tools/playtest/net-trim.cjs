// LOCAL: сетевой трафик клиента — move ≤ 10 Гц и только при движении, ping раз в 5 с, в скрытой вкладке — пауза. Только localhost (guardLocal).
// NT_BASE=http://127.0.0.1:5283/game.html NT_WS=ws://127.0.0.1:8839 node tools/playtest/net-trim.cjs
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.NT_BASE || 'http://127.0.0.1:5283/game.html', WS = process.env.NT_WS || 'ws://127.0.0.1:8839';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (ctx, uid) => {
    const p = await ctx.newPage(); p.tx = []; p.rx = []; p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => { if (!ws.url().startsWith(WS)) return; /* только игровой сокет, не HMR vite */ ws.on('framesent', (f) => { try { p.tx.push([Date.now(), JSON.parse(String(f.payload)).type]); } catch (_) {} });
      ws.on('framereceived', (f) => { const s = String(f.payload); const m = /^\{"type":"([a-z_]+)"/.exec(s); if (m && !/^(zone_state|players_state|meta_state)$/.test(m[1])) p.rx.push([Date.now(), m[1], s.slice(0, 160)]); }); });
    await p.goto(assertLocalUrl(`${BASE}?name=Net&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    for (let i = 0; i < 4 && !(await p.evaluate(() => !!window.__game.meta?.hero)); i++) { await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1300); }
    await sleep(3000); return p;
  };
  const cnt = (p, t0, t1, ty) => p.tx.filter(([t, x]) => t >= t0 && t < t1 && x === ty).length;
  const fps = (p) => p.evaluate(() => window.__game.perf?.().fps || 0);
  // ---------- ПК ----------
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  // журнал отправок в самой странице (время и document.hidden в момент send — события CDP на медленной машине приходят с опозданием)
  await ctx.addInitScript(() => { const o = WebSocket.prototype.send; window.__sent = []; WebSocket.prototype.send = function (d) { try { if (!new RegExp(':' + new URL(new URLSearchParams(location.search).get('ws') || 'ws://x:0').port + '(/|$)').test(this.url)) return o.call(this, d); const j = JSON.parse(d); window.__sent.push([Date.now(), j.type, document.hidden, j.ping, j.type === 'ping' && document.hidden ? new Error().stack.split('\n').slice(1, 6).join(' / ') : '']); } catch (_) {} return o.call(this, d); }; });
  const A = await open(ctx, 'nettrim_' + Date.now().toString(36));
  await A.mouse.click(640, 380);
  let t0 = Date.now(); await sleep(16000); let t1 = Date.now();
  const idleMove = cnt(A, t0, t1, 'move'), pings = A.tx.filter(([t, x]) => x === 'ping' && t >= t0 && t < t1).map(([t]) => t);
  ok(idleMove === 0, `стоим 16 с: move = ${idleMove}`);
  const gaps = pings.slice(1).map((t, i) => t - pings[i]); ok(pings.length >= 2 && pings.length <= 4 && gaps.every((g) => g > 4500 && g < 5600), `ping раз в 5 с: ${pings.length} за 16 с, интервалы ${gaps.join(', ')} мс`);
  const cs = await A.evaluate(() => window.__sent.find(([, ty]) => ty === 'client_stats')); ok(cs && cs[3] > 0, `задержка считается (client_stats.ping = ${cs && cs[3]} мс; HUD-панель в стенде скрыта)`);
  // ходьба: D 6 с
  const f0 = await fps(A); A.rx.length = 0; await A.keyboard.down('KeyD'); t0 = Date.now(); await sleep(6000); t1 = Date.now(); await A.keyboard.up('KeyD');
  const mv = cnt(A, t0, t1, 'move'), hz = mv / ((t1 - t0) / 1000);
  ok(mv > 0 && hz <= 10.5, `идём 6 с: move ${mv} (${hz.toFixed(1)} Гц, fps ${f0}; было бы до 15 Гц)`);
  const duel = A.rx.filter(([, ty]) => /duel/.test(ty)); console.log('NOTE входящие duel* при ходьбе:', JSON.stringify(duel.map((d) => d[2])));
  const fix = A.rx.filter(([, ty]) => ty === 'pos_fix').length; ok(fix <= 2, `коррекций позиции сервером: ${fix}`);
  const posC = await A.evaluate(() => window.__game.debug.pos()); await sleep(800);
  // скрытая вкладка: пинги на паузе, после возврата — сразу
  const th0 = await A.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); return Date.now(); });
  await sleep(12000); const hidPings = await A.evaluate((t) => window.__sent.filter(([ts, ty]) => ty === 'ping' && ts >= t).length, th0); ok(hidPings === 0, `скрытая вкладка 12 с: ping = ${hidPings}`);
  const tv = await A.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); return Date.now(); });
  await sleep(600);
  const back = await A.evaluate((t) => window.__sent.find(([ts, ty]) => ty === 'ping' && ts >= t), tv); ok(!!back && back[0] - tv < 200, `вернулись — ping сразу (${back ? back[0] - tv : '—'} мс)`);
  ok(await A.evaluate(() => window.__game.state().net.open && !window.__game.state().net.offline), 'соединение живо после паузы');
  // ---------- телефон: джойстик ----------
  const mctx = await b.newContext({ ...devices['Pixel 7'] }); await guardLocal(mctx);
  const M = await open(mctx, 'nettrim_m_' + Date.now().toString(36));
  const joy = await M.locator('.mc3d-joy').first().boundingBox().catch(() => null);
  if (joy) {
    const cx = joy.x + joy.width / 2, cy = joy.y + joy.height / 2; const cdp = await mctx.newCDPSession(M);
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await T('touchStart', cx, cy); await T('touchMove', cx + 30, cy); t0 = Date.now();
    for (let i = 0; i < 20; i++) { await T('touchMove', cx + 30 + (i % 2), cy + (i % 3)); await sleep(200); }
    t1 = Date.now(); await T('touchEnd'); const mm = cnt(M, t0, t1, 'move'), mhz = mm / ((t1 - t0) / 1000);
    ok(mm > 0 && mhz <= 10.5, `телефон, джойстик ${((t1 - t0) / 1000).toFixed(1)} с: move ${mm} (${mhz.toFixed(1)} Гц, fps ${await fps(M)})`);
    await sleep(800); t0 = Date.now(); await sleep(3000); const after = cnt(M, t0, Date.now(), 'move'); ok(after === 0, `телефон: отпустили джойстик — move не идут (${after})`);
  } else ok(false, 'джойстик не найден');
  const errs = [...A.errs, ...M.errs]; ok(!errs.length, `ошибок страницы нет ${errs.join(' | ')}`);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
