// Тесты t1139: рост земли (Civ), захват клеток, призыв на клетку столицы, поселения Вождём, эпоха IV (вершины, легендарные, Апофеоз, ульты).
//   nice bun server/strat/era4-test.ts
import { newGame, apply, STRAT_CFG, type GameState, type Piece } from "./rules";
import { territory, growEvery, claimCells, claimCost, captureTurns, foundTurns, recruitCells, canFound, canBuild, tfx, wonderEra, sz, canEra, citySlots, apFor, raceAp } from "./econ";
const pieceAtXY = (g: GameState, x: number, y: number) => g.pieces.some((p) => p.x === x && p.y === y);
import { TECHS } from "./tree-data";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG as any;
const cap = (g: GameState, s: number) => g.ec.cities.find((c) => c.owner === s && c.cap)!;
const king = (g: GameState, s: number) => g.pieces.find((p) => p.owner === s && p.kind === "king")!;
const fresh = (g: GameState) => { g.ap = 9; g.apMax = 9; for (const p of g.pieces) p.acted = false; };
const cnt = (T: Int8Array, s: number) => T.reduce((a, v) => a + (v === s ? 1 : 0), 0);
const endT = (g: GameState, ev: any[] = []) => { const r = apply(g, g.cur, { a: "end" } as any, C) as any; if (r.ok) ev.push(...(r.ev || [])); return ev; };
const ownTurns = (g: GameState, side: number, k: number, ev: any[] = []) => { let t = 0; while (t < k && g.winner === -1) { if (g.cur === side) t++; endT(g, ev); while (g.cur !== side && g.winner === -1) endT(g, ev); } return ev; };
// --- рост земли (t1140: интервал лиги → «Можно купить клетку» → покупка или бесплатно через autoAfter ходов)
{
  const g = newGame(15, ["stone", "nature"], 0); const c0 = cap(g, 0), c1 = cap(g, 1), L = C.econ.league.normal;
  ok(growEvery(g, c0, C) >= L.growMin && growEvery(g, c0, C) <= L.growMax && growEvery(g, c1, C) >= L.growMin, `Обычная лига: интервал в [${L.growMin}, ${L.growMax}]`);
  ok(growEvery(g, c1, C) < growEvery(g, c0, C), "раса влияет на интервал (скрытая поправка): Природа быстрее Камня");
  const before = growEvery(g, c0, C); c0.bld.push("granary"); ok(growEvery(g, c0, C) === before - 1, "Амбар ускоряет на 1");
  g.ec.techs[0].push("settlers"); ok(growEvery(g, c0, C) === before - 2, "технология Поселенцы ускоряет");
  g.ec.techs[0].push("empire", "colonies", "dominion"); ok(growEvery(g, c0, C) === L.growMin, "не быстрее минимума лиги");
  const q = newGame(8, ["stone", "nature"], 0); const LQ = C.econ.league.quick; ok(growEvery(q, cap(q, 0), C) >= LQ.growMin && growEvery(q, cap(q, 0), C) <= LQ.growMax, "Быстрая лига: 5–6 ходов");
  ok(growEvery(newGame(5, ["fire", "ice"], 0), cap(newGame(5, ["fire", "ice"], 0), 0), C) === 0, "5×5 — без роста");
  // цикл: интервал → tready → покупка
  const g2 = newGame(8, ["fire", "ice"], 0); const cc = cap(g2, 0), N = growEvery(g2, cc, C), ev = ownTurns(g2, 0, N + 1);
  const rd = ev.find((e) => e.e === "tready" && e.city === cc.id); ok(!!rd && cc.claims === 1 && cc.cw! >= 1 && cc.cw! <= C.econ.terr.grow.autoAfter, `через ${N} ходов — «Можно купить клетку» (окно ${C.econ.terr.grow.autoAfter} хода)`);
  if (g2.cur !== 0) endT(g2); const cells = claimCells(g2, cc, C), T = territory(g2, C);
  ok(cells.length > 0 && cells.every((i) => T[i] === -1), "кандидаты — нейтральные клетки рядом с землёй");
  g2.ec.res[0].gold = 50; const cost = claimCost(g2, cc, C), i0 = cells[cells.length - 1];
  ok(!(apply(g2, 0, { a: "claim", city: cc.id, x: 0, y: 0 } as any, C) as any).ok || cells.includes(0), "чужая/дальняя клетка — нельзя");
  const r = apply(g2, 0, { a: "claim", city: cc.id, x: i0 % 8, y: (i0 / 8) | 0 } as any, C) as any;
  ok(r.ok && territory(g2, C)[i0] === 0 && g2.ec.res[0].gold === 50 - cost && !cc.claims, "клетка куплена за золото, выбрана игроком");
  ok(!(apply(g2, 0, { a: "claim", city: cc.id, x: i0 % 8, y: (i0 / 8) | 0 } as any, C) as any).ok, "второй раз без нового интервала — нельзя");
  // не купил — бесплатно через autoAfter
  const g3 = newGame(8, ["fire", "ice"], 0); const c3 = cap(g3, 0), N3 = growEvery(g3, c3, C), base = cnt(territory(g3, C), 0), gold0 = () => g3.ec.res[0].gold;
  const ev3 = ownTurns(g3, 0, N3 + C.econ.terr.grow.autoAfter + 1);
  ok(ev3.some((e) => e.e === "tgrow" && e.auto) && cnt(territory(g3, C), 0) > base, "не купил за 4 хода — клетка присоединилась бесплатно (auto)");
  const off = JSON.parse(JSON.stringify(C)); off.econ.terr.grow.on = false; ok(growEvery(g3, c3, off) === 0, "рост выключается конфигом");
}
// --- захват клеток: 4 хода → клетка нейтральна (не переходит)
{
  const g = newGame(8, ["fire", "ice"], 0); const T = territory(g, C), n8 = g.size; const c1 = cap(g, 1);
  g.pieces = g.pieces.filter((p) => p.owner === 0 || p.kind === "king"); { const kk = king(g, 1); kk.x = c1.x; kk.y = c1.y; }
  let cell = -1; for (let i = 0; i < T.length; i++) if (T[i] === 1 && !(i % n8 === c1.x && Math.floor(i / n8) === c1.y) && !g.pieces.some((p) => p.y * n8 + p.x === i)) { cell = i; break; }
  const k = g.pieces.find((p) => p.owner === 0 && p.kind === "pawn")!; k.x = cell % n8; k.y = Math.floor(cell / n8);
  const need = captureTurns(g, C); const ev = ownTurns(g, 0, need + 1);
  ok(need === 4 && territory(g, C)[cell] === -1, "4 хода на чужой клетке — клетка стала нейтральной, а не своей");
  ok(ev.some((e) => e.e === "tcap" && e.owner === 1 && e.by === 0), "событие tcap (хозяину «Территория потеряна», захватчику «Отбито»)");
  const g3 = newGame(8, ["fire", "ice"], 0); const off = JSON.parse(JSON.stringify(C)); off.econ.terr.capture.on = false;
  g3.pieces = g3.pieces.filter((p) => p.owner === 0 || p.kind === "king"); { const kk = king(g3, 1); kk.x = c1.x; kk.y = c1.y; }
  const p3 = g3.pieces.find((p) => p.owner === 0 && p.kind === "pawn")!; p3.x = cell % n8; p3.y = Math.floor(cell / n8);
  for (let i = 0; i < 12; i++) apply(g3, g3.cur, { a: "end" } as any, off);
  ok(territory(g3, off)[cell] === 1, "захват выключается конфигом");
}
// --- призыв на клетку столицы
{
  const g = newGame(8, ["fire", "ice"], 0); const c = cap(g, 0), k = king(g, 0); const T = territory(g, C);
  k.x = c.x; k.y = c.y; let cells = recruitCells(g, c, "pawn", C);
  const d = cells.map(([x, y]) => Math.max(Math.abs(x - c.x), Math.abs(y - c.y)));
  ok(cells.every(([x, y]) => T[y * 8 + x] === 0) && d.every((v) => v === d[0] && v >= 1), "клетка столицы занята → ближайшие свободные клетки своей земли");
  k.x = 0; k.y = 3; g.pieces = g.pieces.filter((p) => p === k || !(p.x === 0 && p.y === 3));
  cells = recruitCells(g, c, "pawn", C); ok(cells.length === 1 && cells[0][0] === c.x && cells[0][1] === c.y, "клетка столицы свободна → призыв на неё");
}
// --- поселения: канал Вождя
{
  const g = newGame(15, ["fire", "ice"], 0); const k = king(g, 0), c = cap(g, 0); fresh(g);
  const pawn = g.pieces.find((p) => p.owner === 0 && p.kind === "pawn")!;
  ok(canFound(g, 0, pawn, C) === "chief_only", "поселение закладывает только Вождь");
  g.pieces = g.pieces.filter((p) => p.owner === 0 || p.kind === "king"); const e1 = king(g, 1); e1.x = 14 - c.x; e1.y = 14 - c.y;
  k.x = Math.min(14, c.x + 5); k.y = c.y; g.pieces = g.pieces.filter((p) => p === k || !(p.x === k.x && p.y === k.y));
  while (g.cur !== 0) endT(g); fresh(g); g.ec.res[0].gold = 20;
  const e = canFound(g, 0, k, C);
  if (e) ok(false, "canFound: " + e);
  else {
    const r = apply(g, 0, { a: "found", id: k.id } as any, C) as any, F = foundTurns(g, C);
    ok(r.ok && g.ec.fnd![0]?.left === F && g.ec.res[0].gold === 20 - C.econ.found.gold, `закладка: канал ${F} ходов, золото списано`);
    ok(!(apply(g, 0, { a: "move", id: k.id, x: k.x, y: k.y + 1 } as any, C) as any).ok, "Вождь в канале не двигается");
    const ev = ownTurns(g, 0, F); const nc = g.ec.cities.find((x) => x.owner === 0 && !x.cap);
    ok(!!nc && nc.set && citySlots(g, nc, C) === 0 && ev.some((x) => x.e === "found"), "через N ходов — поселение (без слотов)");
    ok(recruitCells(g, nc!, "pawn", C).length > 0 || pieceAtXY(g, nc!.x, nc!.y), "поселение — точка призыва");
  }
  // отмена — возврат половины
  const g2 = newGame(15, ["fire", "ice"], 0); const k2 = king(g2, 0), c2 = cap(g2, 0); g2.pieces = g2.pieces.filter((p) => p.owner === 0 || p.kind === "king");
  k2.x = Math.min(14, c2.x + 5); k2.y = c2.y; g2.pieces = g2.pieces.filter((p) => p === k2 || !(p.x === k2.x && p.y === k2.y)); while (g2.cur !== 0) endT(g2); fresh(g2); g2.ec.res[0].gold = 20;
  if (!canFound(g2, 0, k2, C)) { apply(g2, 0, { a: "found", id: k2.id } as any, C); const r2 = apply(g2, 0, { a: "found_cancel" } as any, C) as any;
    ok(r2.ok && !g2.ec.fnd![0] && g2.ec.res[0].gold === 20 - C.econ.found.gold + Math.floor(C.econ.found.gold * C.econ.found.refund), "отмена: возврат половины"); }
  const alt = JSON.parse(JSON.stringify(C)); alt.econ.found.by = "pawn"; ok(canFound(g, 0, k, alt) === "pawn_only" || canFound(g, 0, k, alt) === "already_founding", "конфиг by=pawn — прежнее правило");
}
// --- ОД по лигам
{
  const q = newGame(5, ["fire", "ice"], 0), nn = newGame(15, ["fire", "ice"], 0);
  ok(apFor(q, 0, C) === 1 && apFor(newGame(8, ["fire", "ice"], 0), 0, C) === 1 && apFor(nn, 0, C) === 2, "база ОД: Быстрая 1, Обычная 2");
  nn.ec.techs[0].push("drill"); ok(apFor(nn, 0, C) === 3, "ОД-технология +1 (Обычная)");
  cap(nn, 0).bld.push("warcouncil"); ok(apFor(nn, 0, C) === 6, "Военный совет +3 (Обычная)");
  ok(canBuild(nn, 0, cap(nn, 0), "warcouncil", C) === "once_max", "Военный совет — один на игрока");
  const g1 = newGame(8, ["fire", "ice"], 0); g1.pieces = g1.pieces.filter((p) => !(p.owner === 0 && p.kind === "king")); ok(apFor(g1, 0, C) >= 1, "без Вождя ОД не меньше 1");
  const f = newGame(15, ["fire", "ice"], 0); (f.ec as any).rap = [{ kills: 3 }, {}]; ok(raceAp(f, 0, C).n === C.econ.league.normal.raceCap, "Сила стихии огня: убийства → ОД, потолок лиги");
}
// --- эпоха IV
{
  const g = newGame(15, ["fire", "ice"], 0);
  ok(sz(g, C).eras === 4 && wonderEra(g, C) === 3, "15×15: 4 эпохи, Чудо — с эпохи III");
  const br = ["rush", "fort", "trade", "expand", "arcana"];
  ok(br.every((b) => TECHS.filter((t) => t.br === b && t.era === 4).length === 2), "в каждой тактике пара вершин эпохи IV");
  ok(["fire", "ice", "water", "stone", "nature", "lightning"].every((r) => TECHS.filter((t) => t.race === r && t.era === 4).length === 2), "у каждой расы стихийная пара эпохи IV");
  ok(TECHS.filter((t) => t.era === 4 && t.unlock?.length).length === 5, "5 легендарных построек открываются вершинами IV");
  ok((C.build.wonder.fx?.ultPow || 0) > 0 && TECHS.filter((t) => t.era === 4 && (t.fx as any).wonderUlt).length === 6, "Великое чудо усиливает ульту Вождя; «путь Чуда» у каждой расы");
  const c = cap(g, 0); g.ec.techs[0].push("goldenage"); g.ec.res[0].gold = 99;
  ok(canBuild(g, 0, c, "mint", C) === "need_era", "легендарная — только в эпохе IV");
  g.ec.era[0] = 4; ok(canBuild(g, 0, c, "mint", C) === null || canBuild(g, 0, c, "mint", C) === "no_slot", "в эпохе IV легендарная доступна");
  c.bld.push("mint"); ok(tfx(g, 0, "goldTurn", C) >= 6, "fx легендарной постройки работает как технология");
  g.ec.techs[0].push("omniscience"); ok(canBuild(g, 0, c, "observatory", C) === "legend_max", "одна легендарная на игрока");
  ok(canBuild(g, 0, c, "observatory", { ...C, econ: { ...C.econ, era4: { ...C.econ.era4, legendMax: 2 } } }) !== "legend_max", "лимит легендарных — в конфиге");
  // Апофеоз
  const g2 = newGame(15, ["fire", "ice"], 0); const k = king(g2, 0); g2.ec.era[0] = 3; k.hp = 3; k.cds = { u: 5 };
  for (const t of TECHS.filter((t) => t.era === 3 && (!t.race || t.race === "fire"))) g2.ec.techs[0].push(t.id);
  g2.ec.res[0].know = 99; fresh(g2);
  const ce = canEra(g2, 0, C); if (ce) ok(false, "canEra: " + ce);
  else { while (g2.cur !== 0) endT(g2); fresh(g2); k.hp = 3; k.cds = { u: 5 }; g2.ec.res[0].know = 99; const r = apply(g2, 0, { a: "era" } as any, C) as any; if (!r.ok) console.log("era err", r.err);
    ok(r.ok && g2.ec.era[0] === 4 && k.hp === k.maxHp && !k.cds.u && r.ev.some((e: any) => e.e === "apotheosis"), "«Апофеоз»: вход в эпоху IV лечит Вождя и сбрасывает перезарядки"); }
}
console.log(`\n${n - fails}/${n} PASS`); if (fails) process.exit(1);
