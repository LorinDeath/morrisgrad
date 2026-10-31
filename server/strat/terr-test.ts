// t1170: города не нарастают друг на друга. Рост, бесплатная клетка и покупка берут только НИЧЬИ клетки; поселение не закладывается
// на чужую землю и не перекрывает её радиусом; нет свободной соседней клетки — рост ждёт; отбитая клетка нейтральна и её можно занять.
//   nice bun server/strat/terr-test.ts
import { newGame, apply, STRAT_CFG, type GameState } from "./rules";
import { territory, claimCells, growPick, canFound, cityRadius, captureTurns, type City } from "./econ";
import { aiAction } from "./ai";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG;
let seed = 1170; Math.random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296); // детерминированно
const cap = (g: GameState, s: number) => g.ec.cities.find((c) => c.owner === s && c.cap)!;
const king = (g: GameState, s: number) => g.pieces.find((p) => p.owner === s && p.kind === "king")!;
const idx = (g: GameState, x: number, y: number) => y * g.size + x;
const xy = (g: GameState, i: number) => ({ x: i % g.size, y: (i / g.size) | 0 });
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// 1) бот×бот: ни одна клетка не переходит от стороны к стороне напрямую (только вместе со взятием города), tgrow — только из ничьей
for (const [size, games] of (process.env.FAST ? [] : [[8, 8], [15, 3]]) as [number, number][]) {
  let flips = 0, badGrow = 0, grows = 0, fin = 0;
  for (let gi = 0; gi < games; gi++) {
    const races = (["fire", "ice", "water", "stone", "nature", "lightning"] as const);
    const g = newGame(size, [races[gi % 6], races[(gi + 2) % 6]], (gi % 2) as 0 | 1);
    for (let k = 0; k < 20000 && g.winner === -1; k++) {
      const side = g.cur, T0 = territory(g, C), own0 = g.ec.cities.map((c) => c.owner);
      const r: any = apply(g, side, aiAction(g, side, C, {}), C);
      if (!r.ok) { apply(g, side, { a: "end" } as any, C); continue; }
      const T1 = territory(g, C), took = g.ec.cities.some((c, i) => own0[i] !== undefined && own0[i] !== c.owner);
      for (const e of r.ev) if (e.e === "tgrow") { grows++; if (!took && T0[idx(g, e.x, e.y)] !== -1) { badGrow++; /* при взятии города в том же действии земля пересчитана — T0 устарел */ if (badGrow <= 3) console.log("  !", size, gi, k, JSON.stringify(e), "T0=", T0[idx(g, e.x, e.y)], "took=", took, r.ev.map((x: any) => x.e).join(",")); } }
      if (!took) for (let i = 0; i < T0.length; i++) if (T0[i] >= 0 && T1[i] >= 0 && T0[i] !== T1[i]) flips++;
    }
    if (g.winner >= 0) fin++;
  }
  ok(grows > 0 && badGrow === 0, `${size}×${size}: рост берёт только ничьи клетки (${grows} приростов, чужих ${badGrow})`);
  ok(flips === 0, `${size}×${size}: клетка не переходит к другой стороне без взятия города (переходов ${flips}; доиграно ${fin}/${games})`);
}

// 2) расширение радиуса столицы не забирает чужую приросшую клетку
{
  const g = newGame(15, ["fire", "ice"], 0), c0 = cap(g, 0), c1 = cap(g, 1), T = territory(g, C);
  c0.lvl = 0; // радиус 1
  let cell = -1; for (let i = 0; i < T.length; i++) if (T[i] === -1 && cheb(xy(g, i), c0) === 2) { cell = i; break; }
  (c1.grow ||= []).push(cell); // враг «прирос» к ничьей клетке у нашей столицы
  ok(territory(g, C)[cell] === 1, "чужая приросшая клетка — чужая");
  c0.lvl = 2; ok(cityRadius(g, c0, C) >= 2, "столица выросла (радиус ≥ 2)");
  const T2 = territory(g, C);
  ok(T2[cell] === 1, "рост радиуса столицы не забирает чужую приросшую клетку");
  ok(!claimCells(g, c0, C, T2).includes(cell) && !claimCells(g, c0, C, T2).some((i) => T2[i] !== -1), "покупка: только ничьи клетки");
  const p = growPick(g, c0, C, T2); ok(p >= 0 && T2[p] === -1, "бесплатная клетка: ничья");
}

// 3) поселение: не на чужой земле и без перекрытия радиусом (чужую землю у места кладём искусственно — у столицы закладывать нельзя по outMinDist)
{
  const g = newGame(15, ["fire", "ice"], 0), k = king(g, 0), T = territory(g, C), R = C.econ.city.outRadius, c1 = cap(g, 1);
  g.ec.res[0].gold = 99;
  let clear = -1;
  for (let i = 0; i < T.length && clear < 0; i++) { if (T[i] !== -1 || g.pieces.some((q) => q !== k && idx(g, q.x, q.y) === i)) continue; Object.assign(k, xy(g, i)); if (canFound(g, 0, k, C) === null) clear = i; }
  ok(clear >= 0, "вдали от врага поселение можно заложить");
  const s0 = xy(g, clear);
  let edge = -1; for (let i = 0; i < T.length; i++) if (T[i] === -1 && cheb(xy(g, i), s0) === R && i !== clear) { edge = i; break; }
  ok(edge >= 0, "есть ничья клетка на границе будущей земли");
  (c1.grow ||= []).push(edge); Object.assign(k, s0);
  ok(canFound(g, 0, k, C) === "enemy_land", "поселение, чья земля зашла бы на чужую, — enemy_land");
  c1.grow = c1.grow.filter((i) => i !== edge); ok(canFound(g, 0, k, C) === null, "чужую клетку убрали — снова можно");
  c1.grow.push(clear); ok(canFound(g, 0, k, C) === "enemy_land", "на чужой земле — enemy_land");
  c1.grow = c1.grow.filter((i) => i !== clear);
  // поселение, заложенное рядом с ничьей клеткой, которую враг прирастил во время канала, — эту клетку не забирает
  let side = -1; for (let i = 0; i < T.length; i++) if (T[i] === -1 && cheb(xy(g, i), s0) === 1) { side = i; break; }
  c1.grow.push(side);
  g.ec.cities.push({ ...cap(g, 0), id: 777, cap: false, set: true, x: s0.x, y: s0.y, bld: [], grow: [], lvl: 0 } as City);
  ok(territory(g, C)[side] === 1, "новое поселение не забирает чужую приросшую клетку");
  ok(territory(g, C)[clear] === 0, "клетка поселения — своя");
}

// 4) нет свободной соседней клетки — право на клетку ждёт и тратится, когда клетка появится
{
  const g = newGame(8, ["fire", "ice"], 0), c0 = cap(g, 0), c1 = cap(g, 1);
  const T = territory(g, C), held: number[] = []; for (let i = 0; i < T.length; i++) if (T[i] === -1) { held.push(i); (c1.grow ||= []).push(i); }
  c0.claims = 1; c0.cw = 1; const before = (c0.grow || []).length; let gotEv = false;
  for (let t = 0; t < 2 * (captureTurns(g, C) - 1); t++) { /* меньше, чем нужно на отбитие: свои фигуры стоят на «чужой» земле */ const r: any = apply(g, g.cur, { a: "end" } as any, C); if (r.ok && r.ev.some((e: any) => e.e === "tgrow" && e.city === c0.id)) gotEv = true; }
  ok(!gotEv && (c0.grow || []).length === before && (c0.claims || 0) > 0, "нет свободной клетки — рост ждёт, право не сгорает");
  const free = claimCellsFree(g, c0, held); c1.grow = c1.grow!.filter((i) => i !== free);
  for (let t = 0; t < 4 && !gotEv; t++) { const r: any = apply(g, g.cur, { a: "end" } as any, C); if (r.ok && r.ev.some((e: any) => e.e === "tgrow" && e.city === c0.id && idx(g, e.x, e.y) === free)) gotEv = true; }
  ok(gotEv, "клетка освободилась — право тратится на неё");
}
function claimCellsFree(g: GameState, c: City, held: number[]) { for (const i of held) { const p = xy(g, i); for (let j = 0; j < g.size * g.size; j++) if (territory(g, C)[j] === c.owner && cheb(xy(g, j), p) === 1) return i; } return -1; }

// 5) отбитая клетка нейтральна, её можно занять (и своей, и чужой стороне)
{
  const g = newGame(8, ["fire", "ice"], 0), c0 = cap(g, 0), T = territory(g, C);
  const mine = T.findIndex((t, i) => t === 0 && cheb(xy(g, i), c0) === 1);
  (g.ec.lost ||= {})[mine] = 1;
  const T2 = territory(g, C); ok(T2[mine] === -1, "отбитая клетка — ничья");
  ok(claimCells(g, c0, C, T2).includes(mine), "отбитую клетку можно снова купить");
  c0.claims = 1; g.ec.res[0].gold = 99; const { x, y } = xy(g, mine);
  const r: any = apply(g, 0, { a: "claim", city: c0.id, x, y } as any, C);
  ok(r.ok && territory(g, C)[mine] === 0 && !g.ec.lost?.[mine], "купленная обратно клетка снова своя");
}
console.log(`terr-test: ${n - fails} ok, ${fails} fail`); process.exit(fails ? 1 : 0);
