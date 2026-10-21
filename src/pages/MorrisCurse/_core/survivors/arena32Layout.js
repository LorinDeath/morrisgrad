// Раскладка арены 32 (README arena_32 §4): маска круга, автотайл кромки, куски парапета, прореживание угловых столбов.
// Чистые функции без DOM/three — их проверяет tools/tests/arena32-test.mjs.
export const TILE_M = 1.6;
const WALL = { n: 'h', s: 'h', w: 'v', e: 'v' };
// угол без столба с теми же рукавами (прореживание столбов на диагоналях, GFX.arena3Posts)
export const NO_POST = { out_nw: 'in_se', out_ne: 'in_sw', out_sw: 'in_ne', out_se: 'in_nw' };
export const FLOOR_W = [3, 2, 2, 1.5, 2, 1.5]; // веса вариантов пола (README §3)

/** маска пола: клетка (x, y) в поле N×N с центром c входит в пол, если hypot(x−c, y−c) ≤ Rf/1.6 */
export function arenaMask(Rf) {
  const rT = Rf / TILE_M, N = 2 * Math.ceil(rT) + 3, c = (N - 1) / 2;
  const M = (x, y) => x >= 0 && y >= 0 && x < N && y < N && Math.hypot(x - c, y - c) <= rT;
  return { N, c, M };
}
/** README §4: n/s/w/e — соседи НЕ пол; nw/ne/sw/se — диагонали НЕ пол (порядок проверок важен) */
export function edgeKind(M, x, y) {
  const o = (dx, dy) => !M(x + dx, y + dy);
  const n = o(0, -1), s = o(0, 1), w = o(-1, 0), e = o(1, 0);
  if (n && w) return 'out_nw'; if (n && e) return 'out_ne'; if (s && w) return 'out_sw'; if (s && e) return 'out_se';
  if (n) return 'n'; if (s) return 's'; if (w) return 'w'; if (e) return 'e';
  if (o(-1, -1)) return 'in_nw'; if (o(1, -1)) return 'in_ne'; if (o(-1, 1)) return 'in_sw'; if (o(1, 1)) return 'in_se';
  return null;
}
/**
 * Раскладка (чистая функция, без DOM — тесты): клетки пола с вариантом/кромкой и куски парапета.
 * posts — каждый n-й угловой столб на диагоналях (столб «тесный», если рядом, в 2 клетках, есть другой внешний угол).
 */
export function layoutArena32(Rf, { seed = 7, glowW = 0.5, anim = [], posts = 1 } = {}) {
  const { N, c, M } = arenaMask(Rf);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const w = FLOOR_W.map((v, i) => (anim.includes(i) ? Math.min(v, glowW) : v)), wSum = w.reduce((a, b) => a + b, 0);
  const pickV = () => { let r = rnd() * wSum; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return 0; };
  const cells = [], wall = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!M(x, y)) continue;
    const k = edgeKind(M, x, y);
    if (k) { cells.push({ x, y, edge: k }); wall.push({ x, y, kind: k, piece: WALL[k] || k }); } else cells.push({ x, y, v: pickV() });
  }
  // прореживание тесных угловых столбов по кругу (по углу), каждый n-й остаётся
  const outs = wall.filter((q) => q.kind.startsWith('out_'));
  const near = (a) => outs.some((b) => b !== a && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 2);
  const tight = outs.filter(near).sort((a, b) => Math.atan2(a.y - c, a.x - c) - Math.atan2(b.y - c, b.x - c));
  let thinned = 0;
  if (posts > 1) tight.forEach((q, i) => { if (i % posts) { q.piece = NO_POST[q.kind]; thinned++; } });
  wall.sort((a, b) => a.y - b.y || a.x - b.x); // сверху вниз: свес нижнего куска ложится поверх верхнего
  return { N, c, cells, wall, posts: outs.length, tight: tight.length, thinned };
}

