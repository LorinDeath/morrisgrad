// Коллизии пропсов v2 (локальный wrangler dev, MC_DEV_TRUST_USERID): сервер выталкивает игрока из твёрдых пропсов,
// проходимые (трава/цветы/центр портала) — не мешают, мобы Поляны не стоят в твёрдом. Запуск: node server/meta/collision-test.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
execFileSync(root + 'node_modules/.bin/esbuild', [root + 'server/meta/collision-lib.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=/tmp/mc-collision-lib.mjs', '--log-level=error']);
const L = await import('/tmp/mc-collision-lib.mjs?' + Date.now());
const WS_URL = process.env.MC_WS || 'ws://127.0.0.1:8787';
if (!/127\.0\.0\.1|localhost/.test(WS_URL)) throw new Error('local only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
function client(name, uid, x, y) {
  const ws = new WebSocket(WS_URL); const msgs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (/duel/.test(m.type)) (c.allDuel ||= []).push(m); };
  const c = { msgs, x, y, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close(),
    wait: async (t, ms = 4000, pred = () => true) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((mm) => mm.type === t && pred(mm)); if (m) return m; await sleep(40); } return null; },
    fixes: () => msgs.filter((m) => m.type === 'pos_fix') };
  // шаги ≤ 40 px с паузой (лимит скорости сервера); после pos_fix идём от исправленной точки, как клиент
  c.walk = async (tx, ty) => { for (let i = 0; i < 120; i++) { const f = c.fixes().at(-1); if (f && !f.used) { f.used = 1; c.x = f.x; c.y = f.y; } const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy); if (d < 1) break; const st = Math.min(d, 40); c.x += dx / d * st; c.y += dy / d * st; c.send({ type: 'move', x: Math.round(c.x), y: Math.round(c.y) }); await sleep(90); } await sleep(400); const me = [...msgs].reverse().find((m) => m.type === 'players_state')?.players.find((p) => p.username === name); if (me) { c.x = me.x; c.y = me.y; } c.fixes().forEach((f) => { f.used = 1; }); };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', userId: uid, username: name, x, y, stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 } }); res(c); }; });
}
const S = L.ZONE_SPAWN_HUB;
const A = await client('col_A', 'test_col_' + Date.now(), S.x, S.y);
await A.wait('meta_state');
A.send({ type: 'select_class', classId: 'spearman' }); await A.wait('meta_state', 4000, (m) => m.hero?.cls === 'spearman');
await sleep(300);
const boss = (await A.wait('players_state'))?.boss || { x: 478, y: 1040 };
console.log('boss Кейт at', boss.x, boss.y, '(avoid: proximity starts a boss duel)');
// 1. дерево/камень рядом с точкой входа
const t = L.nearestSolid('hellfire', S.x, S.y, ['tree'], boss) || L.nearestSolid('hellfire', S.x, S.y, ['rock', 'barrel', 'crate', 'well', 'ruin_pillar', 'obelisk'], boss);
ok(!!t, 'solid prop near hub spawn: ' + (t && `${t.k} @${t.x},${t.y} r=${t.rx.toFixed(1)}×${t.ry.toFixed(1)}`));
await A.walk(t.x, t.y + t.ry + 60);
A.msgs.length = 0;
await A.walk(t.x, t.y); // прямо в ствол
const f1 = A.fixes();
const inside = L.blockedWorld('hellfire', A.x, A.y, 9.5);
ok(f1.length > 0 && !inside, `walk into ${t.k}: server pushed out (pos_fix ×${f1.length}), final ${A.x},${A.y} not inside`);
ok(Math.hypot(A.x - t.x, (A.y - t.y) / 0.6) >= t.ry / 0.6, 'final position outside collider ellipse');
// 1b. за кроной дерева можно стоять (коллайдер только у основания)
if (t.k === 'tree') { A.msgs.length = 0; await A.walk(t.x, t.y - t.ry - 30); ok(A.fixes().length === 0 || !L.blockedWorld('hellfire', A.x, A.y, 9.5), 'walk behind tree crown (north of base) allowed'); }
// 2. проходимое: трава/цветы
const g = L.nearestProp('hellfire', S.x, S.y, ['violets', 'grass', 'flowers', 'mushroom', 'bush'], true, boss);
if (g) { await A.walk(g.x, g.y + 30); A.msgs.length = 0; await A.walk(g.x, g.y); ok(A.fixes().length === 0 && Math.hypot(A.x - g.x, A.y - g.y) < 2, `passable ${g.k}: walked onto it without push`); }
else ok(true, 'no passable decor near spawn (skip)');
// 3. портал: центр проходим/активируем, ноги твёрдые
const P = L.PORTALS.filter((p) => (p.world || 'hellfire') === 'hellfire' && p.id !== 'portal_class_select').sort((a, b) => Math.hypot(b.x - boss.x, b.y - boss.y) - Math.hypot(a.x - boss.x, a.y - boss.y))[0];
await A.walk(P.x, P.y + 70); A.msgs.length = 0; await A.walk(P.x, P.y + 4);
ok(A.fixes().length === 0 && Math.hypot(A.x - P.x, A.y - P.y) < 8, `portal ${P.id}: centre reachable (activation radius 85 kept)`);
const legs = L.portalLegs(P);
await A.walk(P.x, P.y + 70); await A.walk(legs[0].x, legs[0].y + 40); A.msgs.length = 0; await A.walk(legs[0].x, legs[0].y);
ok(A.fixes().length > 0 && !L.blockedWorld('hellfire', A.x, A.y, 9.5), 'portal leg (edge) is solid');
// 4. мобы Поляны не стоят в твёрдом
const zs = await A.wait('zone_state', 4000, (m) => Array.isArray(m.m) && m.m.length > 0);
let bad = 0, n = 0; if (zs) for (let j = 0; j < zs.m.length; j += 6) { n++; if (L.blockedWorld('hellfire', zs.m[j + 2], zs.m[j + 3], 11)) bad++; }
ok(zs && n > 0 && bad === 0, `hub mobs not inside solids (${n} checked, ${bad} inside)`);
// 5. Аринар: ключевые точки и мобы вокруг входа свободны (сетка строится лениво по чанкам)
ok(L.keyPointsFree().length === 0, 'respawn / portal targets / NPCs free of solids: ' + JSON.stringify(L.keyPointsFree()));
const tm = Date.now(); let blk = 0; for (let i = 0; i < 20000; i++) if (L.blockedWorld('arinar', 2000 + (i * 7919) % 44000, 2000 + (i * 104729) % 44000, 10)) blk++;
ok(Date.now() - tm < 3000, `arinar lazy grid: 20000 queries over the map in ${Date.now() - tm} ms, ${(blk / 200).toFixed(1)}% blocked`);
{ const c = {}; for (const m of A.msgs) c[m.type] = (c[m.type] || 0) + 1; console.log('msgs since last reset', JSON.stringify(c)); }
console.log('duels', JSON.stringify(A.allDuel));
A.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
