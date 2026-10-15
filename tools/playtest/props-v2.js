// Props v2 + коллизии (браузер, только локально): упираемся в дерево (клиентское предсказание = серверу, без рывков),
// стоим за кроной, проходим между ногами портала к центру; скриншоты в /workspace/morrisgrad-round3/props-v2.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/props-v2', URL = 'http://127.0.0.1:5199/game.html?name=Алекс&uid=test_props2&ws=ws://127.0.0.1:8787&fs=1&debug=1';
require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const root = '/workspace/mg-push/';
  execFileSync(root + 'node_modules/.bin/esbuild', [root + 'server/meta/collision-lib.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=/tmp/mc-collision-lib.mjs', '--log-level=error']);
  const L = await import('/tmp/mc-collision-lib.mjs?' + Date.now());
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(URL)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (f, a) => p.evaluate(f, a);
  const me = () => G(() => { const s = window.__game.state(); return { x: s.player.x, y: s.player.y, world: s.world }; });
  const tp = async (x, y) => { await G(([X, Y]) => window.__game.debug.tp(X, Y), [x, y]); await p.waitForTimeout(1200); };
  // держим клавишу по игровым часам: ждём, пока позиция перестанет меняться
  const track = async (key, ms) => { const pts = []; await p.keyboard.down(key); const t0 = Date.now(); while (Date.now() - t0 < ms) { pts.push(await me()); await p.waitForTimeout(120); } await p.keyboard.up(key); await p.waitForTimeout(400); return pts; };
  const hold = async (key, ms) => { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); await p.waitForTimeout(600); };
  const boss = { x: 478, y: 1040 };
  const t = L.nearestSolid('hellfire', 600, 640, ['tree'], boss);
  ok(!!t, `дерево для теста: ${t.x.toFixed(0)},${t.y.toFixed(0)} коллайдер ${t.rx.toFixed(0)}×${t.ry.toFixed(0)} px`);
  // 1. упор в дерево снизу (W = на север)
  await tp(Math.round(t.x), Math.round(t.y + t.ry + 70));
  const a0 = await me();
  await hold('w', 6000);
  const a1 = await me();
  await p.waitForTimeout(1200); const a2 = await me();
  ok(a1.y < a0.y - 20, `шли на север: ${a0.y.toFixed(0)} → ${a1.y.toFixed(0)}`);
  ok(!L.blockedWorld('hellfire', a1.x, a1.y, 9.5), `остановились/обтекли ствол, не внутри (${a1.x.toFixed(0)},${a1.y.toFixed(0)})`);
  ok(Math.hypot(a2.x - a1.x, a2.y - a1.y) < 3, 'без серверной коррекции (предсказание совпало): позиция стабильна после отпускания');
  // повторить упор и снять кадр в момент упора
  await tp(Math.round(t.x), Math.round(t.y + t.ry + 40)); console.log('tp03', JSON.stringify(await me())); await p.keyboard.down('w'); await p.waitForTimeout(800);
  console.log('shot03 at', JSON.stringify(await me())); await p.screenshot({ path: `${OUT}/03-collision-tree.png` }); await p.keyboard.up('w');
  // 2. за кроной (к северу от основания) — можно стоять, крона перекрывает героя
  await tp(Math.round(t.x), Math.round(t.y - t.ry - 22));
  const c1 = await me();
  ok(Math.abs(c1.y - (t.y - t.ry - 22)) < 3, 'за кроной дерева стоять можно (коллайдер только у основания)');
  await p.screenshot({ path: `${OUT}/04-behind-tree-crown.png` });
  // 3. портал: центр достижим между твёрдыми «ногами»
  const P = L.PORTALS.find((q) => q.id === 'portal_arinar');
  await tp(P.x, P.y + 80);
  const pc = await track('w', 5000);
  const dmin = Math.min(...pc.map((q) => Math.hypot(q.x - P.x, q.y - P.y)));
  ok(dmin < 12 && pc.every((q) => Math.abs(q.x - P.x) < 3), `центр портала проходим/активируем: прошли прямо через центр (мин. ${dmin.toFixed(0)} px)`);
  const leg = L.portalLegs(P)[0];
  await tp(Math.round(leg.x), Math.round(leg.y + 50));
  await p.keyboard.down('w'); await p.waitForTimeout(450); await p.keyboard.up('w'); await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/05-portal-legs-solid.png` });
  await tp(Math.round(leg.x), Math.round(leg.y + 50));
  const pl = await track('w', 4000);
  const inLeg = pl.filter((q) => L.blockedWorld('hellfire', q.x, q.y, 9.5)).length;
  const cross = pl.find((q) => q.y < leg.y);
  ok(inLeg === 0 && cross && Math.abs(cross.x - leg.x) >= leg.rx + 9, `нога портала твёрдая: обтекли сбоку (x ${leg.x.toFixed(0)} → ${cross ? cross.x.toFixed(0) : '?'}), внутри 0 из ${pl.length} точек`);
  ok(errs.length === 0, `нет ошибок страницы: ${JSON.stringify(errs)}`);
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
