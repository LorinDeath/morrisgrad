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


// ── Круглая граница (GFX.arena3Shape 'round'): парапет по настоящему кругу из пикселей куска `h` Художника ──
// Кусок h (32×64): крышка — строки [8, 27) (вид сверху, 19 px), лицевая сторона — [27, 58) (31 px, низ = ground_y 57).
// Вид 3/4 как в арте и у спрайтов: стена — след (кольцо Rw…Ro на земле), поднятый на высоту лица «вверх экрана».
// Видна крышка (след + H) и лицо под ней со стороны камеры: на севере — внутреннее, на юге — внешнее, по бокам только крышка.
// Узор по дуге: u = ±θ·n/2π (n — целое чётное число кусков по кругу, без шва); на южной половине зеркально, чтобы свет арта
// (сверху-слева) и плющ не переворачивались; крышка юга перевёрнута по радиусу (дальний край — к центру). Стык половин — на В и З.
export const RW_CAP = [8, 27], RW_FACE = [27, 58], RW_PXM = 20;
/** кольцо парапета по радиусу арены R (м): Rw — линия земли у внутреннего лица (там же, где была у бордюра кромки, R + 0.35),
 *  Ro — внешний край следа (Rw + 19 px), H — высота лица (31 px), n — кусков по кругу (чётное) */
export function roundRing(R) {
  const Rw = R + 0.35, Ro = Rw + (RW_CAP[1] - RW_CAP[0]) / RW_PXM, H = (RW_FACE[1] - RW_FACE[0]) / RW_PXM;
  const n = 2 * Math.round((Math.PI * Rw) / TILE_M);
  return { Rw, Ro, H, n };
}
/** u куска по углу θ точки следа (z < 0 — север): в долях куска (0…1) */
export function ringU(theta, zSign, n) { const u = ((zSign < 0 ? theta : -theta) * n) / (2 * Math.PI); return u - Math.floor(u); }
/** строка крышки по доле радиуса d ∈ [0, 1) (0 — Rw): север — дальний край (строка 8) снаружи, юг — внутри */
export function capRow(d, north) { const k = Math.max(0, Math.min(RW_CAP[1] - RW_CAP[0] - 1, Math.floor(d * (RW_CAP[1] - RW_CAP[0])))); return north ? RW_CAP[1] - 1 - k : RW_CAP[0] + k; }
/**
 * Пиксель стены в виде 3/4 (запечённый режим, px пола): X, Z — центр пикселя относительно центра арены, px (Z растёт на юг).
 * P = { rw, ro, h } в px. Возвращает null или { cap, row, u } — строку куска h и u (0…1) по дуге.
 * Порядок как у художника «сверху вниз»: южный отрезок следа в столбце перекрывает северный.
 */
export function wallPixel(X, Z, P, n) {
  const ax = Math.abs(X); if (ax >= P.ro) return null;
  const zo = Math.sqrt(P.ro * P.ro - X * X), zi = ax < P.rw ? Math.sqrt(P.rw * P.rw - X * X) : -1;
  const segs = zi >= 0 ? [[zi, zo], [-zo, -zi]] : [[-zo, zo]];
  for (const [a, b] of segs) {
    if (Z < a - P.h || Z > b) continue;
    if (Z < b - P.h) { // крышка: точка следа (X, Z + h)
      const zf = Z + P.h, r = Math.hypot(X, zf), d = (r - P.rw) / (P.ro - P.rw);
      return { cap: true, row: capRow(d, zf < 0), u: ringU(Math.atan2(zf, X), zf, n) };
    }
    const k = Math.min(RW_FACE[1] - RW_FACE[0] - 1, Math.max(0, Math.floor(Z - (b - P.h)))); // лицо: k px от верха лица
    return { cap: false, row: RW_FACE[0] + k, u: ringU(Math.atan2(b, X), b, n) };
  }
  return null;
}
/** контактная тень на полу у ноги внутреннего лица (как в тайлах кромки: от северной и западной стен 4 px — 0.79, 0.79, 0.9, 0.9;
 *  от южной и восточной 1 px — 0.91); θ — угол точки, i — px от стены внутрь (0 — у стены). 1 — без тени */
export function footShade(theta, i) {
  const L = Math.round(1 + 3 * Math.max(0, -Math.sin(theta), -Math.cos(theta)));
  if (i >= L) return 1; if (L === 1) return 0.91;
  return i < L / 2 ? 0.79 : 0.9;
}
/**
 * Геометрия круглого парапета (сцена, м): внутреннее и внешнее лицо + крышка, по половинам (север θ ∈ [−π, 0], юг [0, π]).
 * Подъём лица — вдоль «верха» камеры (0, cos p, −sin p)·H: как у спрайтов-билбордов, высота на экране = полная высота арта.
 * UV: u — в кусках (повтор по S), v — строки кадра 0 листа-полосы высотой 64·F px. Возвращает { pos, uv, index, tris }.
 */
export function roundWallGeo(ring, { pitch = 1.02, seg = 2, F = 1 } = {}) {
  const { Rw, Ro, H, n } = ring, uy = Math.cos(pitch) * H, uz = -Math.sin(pitch) * H, Hpx = 64 * F, e = 0.02;
  const V = (row) => 1 - row / Hpx, pos = [], uv = [], index = [];
  const strip = (pts) => { // pts[j] = [[x,y,z,u,v] низ, [x,y,z,u,v] верх]
    const b = pos.length / 3;
    for (const [lo, hi] of pts) for (const p of [lo, hi]) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
    for (let j = 0; j + 1 < pts.length; j++) { const a = b + 2 * j; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  const S = (n / 2) * seg;
  for (const north of [true, false]) {
    const inner = [], outer = [], cap = [];
    for (let j = 0; j <= S; j++) {
      const t = (north ? -Math.PI : 0) + (j / S) * Math.PI, c = Math.cos(t), s = Math.sin(t);
      const u = ((north ? t : -t) * n) / (2 * Math.PI);
      const xi = c * Rw, zi = s * Rw, xo = c * Ro, zo = s * Ro;
      inner.push([[xi, 0, zi, u, V(RW_FACE[1] - e)], [xi + 0, uy, zi + uz, u, V(RW_FACE[0] + e)]]);
      outer.push([[xo, 0, zo, u, V(RW_FACE[1] - e)], [xo, uy, zo + uz, u, V(RW_FACE[0] + e)]]);
      cap.push([[xi, uy, zi + uz, u, V(north ? RW_CAP[1] - e : RW_CAP[0] + e)], [xo, uy, zo + uz, u, V(north ? RW_CAP[0] + e : RW_CAP[1] - e)]]);
    }
    strip(inner); strip(outer); strip(cap);
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index, tris: index.length / 3 };
}
/** пол круглой арены: все клетки поля N×N (как arenaMask(Rf)), которые задевают круг Ro (м); вариант — те же веса и ГСЧ, что в layoutArena32.
 *  inner — клетка целиком внутри Rw (на ней можно свечение пола) */
export function layoutRound(R, Rf, { seed = 7, glowW = 0.5, anim = [] } = {}) {
  const { N, c } = arenaMask(Rf), ring = roundRing(R), ro = ring.Ro / TILE_M, rw = ring.Rw / TILE_M;
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const w = FLOOR_W.map((v, i) => (anim.includes(i) ? Math.min(v, glowW) : v)), wSum = w.reduce((a, b) => a + b, 0);
  const pickV = () => { let r = rnd() * wSum; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return 0; };
  const cells = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ax = Math.abs(x - c), ay = Math.abs(y - c);
    if (Math.hypot(Math.max(0, ax - 0.5), Math.max(0, ay - 0.5)) > ro) continue;
    cells.push({ x, y, v: pickV(), inner: Math.hypot(ax + 0.5, ay + 0.5) <= rw });
  }
  return { N, c, cells, wall: [], ring, posts: 0, tight: 0, thinned: 0 };
}
