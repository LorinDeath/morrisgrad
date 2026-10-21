// Арена 32 (arena32Layout.js + атлас Художника): у каждой клетки кромки есть тайл и кусок парапета во всех темах,
// рукава парапета замыкаются в кольцо (и после прореживания столбов), замена столба — с теми же рукавами, канвас ≤ 4096.
// Запуск: node tools/tests/arena32-test.mjs
import { readFileSync } from 'fs';
import { layoutArena32, arenaMask, NO_POST, TILE_M } from '../../src/pages/MorrisCurse/_core/survivors/arena32Layout.js';
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
console.log(`${fails ? 'FAIL' : 'PASS'} arena32: ${passes} проверок, ошибок ${fails}`); process.exit(fails ? 1 : 0);
