// Арена 32 (arena32Layout.js + атлас Художника): у каждой клетки кромки есть тайл и кусок парапета во всех темах,
// рукава парапета замыкаются в кольцо (и после прореживания столбов), замена столба — с теми же рукавами, канвас ≤ 4096.
// Запуск: node tools/tests/arena32-test.mjs
import { readFileSync } from 'fs';
import { layoutArena32, arenaMask, NO_POST, TILE_M, roundRing, layoutRound, wallPixel, footShade, roundWallGeo, ringU, RW_CAP, RW_FACE } from '../../src/pages/MorrisCurse/_core/survivors/arena32Layout.js';
const A = JSON.parse(readFileSync(new URL('../../src/assets/mc/arena32/arena32_atlas.json', import.meta.url)));
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL ' + m); } };
const R = 60, Rf = R + TILE_M; // ARENA_RADIUS (survivors/data.js) + 1 тайл — README §4
const DIR = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }, OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
ok(arenaMask(Rf).N === 81, `поле 81×81 клеток (README §4), а не ${arenaMask(Rf).N}`);
for (const posts of [1, 2, 3, 4]) {
  const L = layoutArena32(Rf, { posts, anim: [5] });
  ok(L.N * 32 <= 4096, `канвас пола ${L.N * 32} px ≤ 4096`);
  const at = new Map(L.wall.map((q) => [q.x + ',' + q.y, q]));
  for (const th of Object.keys(A.themes)) for (const q of L.wall) {
    ok(A.keys[`arena_edge_${th}_${q.kind}`], `${th}: тайл кромки ${q.kind}`);
    ok(A.keys[`arena_parapet_${th}_${q.piece}`], `${th}: кусок парапета ${q.piece}`);
  }
  let open = 0;
  for (const q of L.wall) { const arms = A.keys[`arena_parapet_crypt_${q.piece}`].arms;
    for (const a of arms) { const [dx, dy] = DIR[a], nb = at.get(q.x + dx + ',' + (q.y + dy)); if (!nb || !A.keys[`arena_parapet_crypt_${nb.piece}`].arms.includes(OPP[a])) open++; } }
  ok(open === 0, `posts=${posts}: рукава парапета замкнуты (разрывов ${open})`);
  for (const q of L.wall) if (q.piece !== (q.kind.length === 1 ? ({ n: 'h', s: 'h', w: 'v', e: 'v' })[q.kind] : q.kind)) ok(NO_POST[q.kind] === q.piece, `замена столба ${q.kind} → ${q.piece}`);
  ok(posts === 1 ? L.thinned === 0 : L.thinned > 0 && L.thinned < L.tight, `posts=${posts}: прорежено ${L.thinned} из ${L.tight} тесных столбов (всего внешних углов ${L.posts})`);
  if (posts === 1) console.log(`клеток пола ${L.cells.length}, парапет ${L.wall.length} кусков, внешних углов ${L.posts}, «тесных» ${L.tight}`);
}
for (const [o, n] of Object.entries(NO_POST)) ok([...A.keys[`arena_parapet_crypt_${o}`].arms].sort().join('') === [...A.keys[`arena_parapet_crypt_${n}`].arms].sort().join(''), `${o} и ${n}: одни рукава`);
const L0 = layoutArena32(Rf, { seed: 3 }), L1 = layoutArena32(Rf, { seed: 3 });
ok(JSON.stringify(L0) === JSON.stringify(L1), 'раскладка детерминирована по seed');
// ── круглая граница (arena3Shape round) ──
{
  const ring = roundRing(R), P = { rw: ring.Rw * 20, ro: ring.Ro * 20, h: ring.H * 20 };
  ok(ring.n % 2 === 0 && Math.abs((2 * Math.PI * ring.Rw) / ring.n - TILE_M) < 0.02, `круг: ${ring.n} кусков по ${((2 * Math.PI * ring.Rw) / ring.n).toFixed(3)} м (чётно, ≈ тайлу)`);
  ok(Math.abs(ring.Rw - (R + 0.35)) < 1e-9 && Math.abs(ring.Ro - ring.Rw - 0.95) < 1e-9 && Math.abs(ring.H - 1.55) < 1e-9, 'круг: Rw = R + 0.35 (линия земли бордюра), след 19 px, лицо 31 px');
  // каждый столбец: на севере и юге ровно крышка 19 px + лицо 31 px подряд, без дыр; строки куска h — в пределах крышки/лица
  let bad = 0, rows = 0;
  for (let X = -P.ro + 0.5; X < P.ro; X += 7) {
    let run = 0, runs = [], prev = false;
    for (let Z = -P.ro - P.h - 2; Z < P.ro + 2; Z++) { const w = wallPixel(X, Z + 0.5, P, ring.n); if (w) { run++; rows++; if (w.cap ? (w.row < RW_CAP[0] || w.row >= RW_CAP[1]) : (w.row < RW_FACE[0] || w.row >= RW_FACE[1])) bad++; if (!(w.u >= 0 && w.u < 1)) bad++; } else if (prev) { runs.push(run); run = 0; } prev = !!w; }
    const want = Math.sqrt(P.ro * P.ro - X * X) - Math.sqrt(P.rw * P.rw - X * X) + P.h; // след в столбце + лицо
    if (Math.abs(X) < P.rw - 60) ok(runs.length === 2 && runs.every((n) => Math.abs(n - want) <= 1.5), `круг: столбец X=${X.toFixed(1)} — 2 куска по ${want.toFixed(1)} px (${runs.join(',')})`);
    else ok(runs.length >= 1 && runs.length <= 2, `круг: столбец X=${X.toFixed(1)} у боков — стена без дыр (${runs.join(',')})`);
  }
  ok(bad === 0 && rows > 0, `круг: строки/u пикселей стены в пределах куска h (ошибок ${bad})`);
  // u непрерывен вдоль дуги (соседние пиксели — не дальше ~1 px куска, кроме переноса 1→0 и стыка половин на В/З)
  let jumps = 0;
  for (let i = 0; i < 4000; i++) { const t = -Math.PI + (i / 4000) * 2 * Math.PI, t2 = t + 0.5 / P.rw, s1 = Math.sin(t), s2 = Math.sin(t2);
    if (Math.sign(s1) !== Math.sign(s2)) continue; const d = Math.abs(ringU(t, s1, ring.n) - ringU(t2, s2, ring.n)); if (d > 0.05 && d < 0.95) jumps++; }
  ok(jumps === 0, `круг: узор по дуге без разрывов (${jumps})`);
  ok(Math.abs(ringU(-1e-9, -1, ring.n) - ringU(1e-9, 1, ring.n)) % 1 < 1e-6 || Math.abs(ringU(-1e-9, -1, ring.n) - ringU(1e-9, 1, ring.n)) > 0.999999, 'круг: на востоке половины сходятся в одной точке узора');
  ok(footShade(-Math.PI / 2, 0) === 0.79 && footShade(-Math.PI / 2, 3) === 0.9 && footShade(-Math.PI / 2, 4) === 1 && footShade(Math.PI / 2, 0) === 0.91 && footShade(Math.PI / 2, 1) === 1, 'круг: контактная тень как у тайлов кромки (север 4 px, юг 1 px)');
  const G = roundWallGeo(ring, { F: 8 });
  ok(G.tris === 2 * 3 * ring.n * 2 && G.pos.length / 3 === 2 * 3 * (ring.n + 1) * 2, `круг: меш ${G.tris} треугольников (2 половины × 3 поверхности × ${ring.n * 2})`);
  ok(G.uv.every((v, i) => (i % 2 ? v > 1 - 64 / 512 && v < 1 : Number.isFinite(v))), 'круг: v меша — в кадре 0 листа-полосы');
  const LR = layoutRound(R, Rf, { seed: 3 }), LR2 = layoutRound(R, Rf, { seed: 3 });
  ok(JSON.stringify(LR) === JSON.stringify(LR2) && LR.N === 81 && LR.N * 32 <= 4096, 'круг: раскладка пола детерминирована, поле 81×81');
  const has = new Set(LR.cells.map((q) => q.x + ',' + q.y)); let holes = 0;
  for (let i = 0; i < 20000; i++) { const a = (i / 20000) * 2 * Math.PI, r = ring.Ro * Math.sqrt((i * 0.6180339) % 1); const x = Math.floor(Math.cos(a) * r / TILE_M + LR.c + 0.5), y = Math.floor(Math.sin(a) * r / TILE_M + LR.c + 0.5); if (!has.has(x + ',' + y)) holes++; }
  ok(holes === 0, `круг: пол покрывает весь круг Ro (дыр ${holes})`);
  ok(LR.cells.every((q) => !q.inner || Math.hypot(Math.abs(q.x - LR.c) + 0.5, Math.abs(q.y - LR.c) + 0.5) * TILE_M <= ring.Rw), 'круг: свечение пола — только на клетках целиком внутри стены');
}
console.log(`${fails ? 'FAIL' : 'PASS'} arena32: ${passes} проверок, ошибок ${fails}`); process.exit(fails ? 1 : 0);
