// t1247: виды атаки — дальний бой (Конь, Маг), подход+удар (Ладья, Ферзь), вплотную (Пешка, Вождь).
//   nice bun server/strat/attack-test.ts
import { newGame, apply, attackTargets, attackLanding, attackLandings, attackKind, moveTargets, inCheck, botAction, at, STRAT_CFG, type GameState, type Piece } from "./rules";
import { parseAct } from "./parse-act";
import { fogAttackOk, visMask } from "./fog";
import { matchBot } from "./ai";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const has = (arr: [number, number][], x: number, y: number) => arr.some(([a, b]) => a === x && b === y);
function board(size: number, list: [0 | 1, Piece["kind"], number, number][], terr?: Record<string, string>): GameState {
  const g = newGame(size, ["stone", "ice"] as any); g.pieces = []; g.nextId = 1;
  const t = Array.from({ length: size * size }, () => "."); for (const [k, ch] of Object.entries(terr || {})) { const [x, y] = k.split(",").map(Number); t[y * size + x] = ch; }
  g.map = { ...(g.map as any), t: t.join(""), s: ".".repeat(size * size) };
  for (const [o, k, x, y] of list) { const u = STRAT_CFG.units[k]; g.pieces.push({ id: g.nextId++, owner: o, kind: k, x, y, hp: 99, maxHp: 99, atk: u.atk, arm: u.arm, acted: false, burn: 0, chill: 0 }); }
  if (g.ec) { g.ec.cities = []; } g.ap = 10; g.cur = 0; return g;
}
const P = (g: GameState, id: number) => g.pieces.find((p) => p.id === id)!;

ok(attackKind("knight") === "ranged" && attackKind("mage") === "ranged" && attackKind("rook") === "approach" && attackKind("hero") === "approach" && attackKind("pawn") === "melee" && attackKind("king") === "melee", "виды атаки: Конь/Маг — дальний, Ладья/Ферзь — подход, Пешка/Вождь — вплотную");

// --- Ладья: подход по прямой (до 4) и удар; цель жива — остаётся на месте; Ладья стоит рядом
{ const g = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(has(attackTargets(g, P(g, 1)), 2, 4), "Ладья видит цель в 4 клетках (подход 3 + удар)");
  ok(JSON.stringify(attackLanding(g, P(g, 1), 2, 4)) === "[2,5]", "Ладья: клетка подхода по умолчанию — ближайшая рядом с целью (2,5)");
  const ap0 = g.ap, r = apply(g, 0, { a: "attack", id: 1, x: 2, y: 4 });
  ok(r.ok && P(g, 1).x === 2 && P(g, 1).y === 5 && P(g, 2).x === 2 && P(g, 2).y === 4 && P(g, 2).hp < 99, "Ладья подошла на (2,5) и ударила; цель на месте");
  ok(g.ap === ap0 - 1, "подход+удар — одно действие, 1 ОД");
  ok(r.ok && r.ev[0].e === "move" && (r.ev[0] as any).approach === 1 && r.ev.some((e) => e.e === "hit"), "события: move(approach) → hit");
}
// --- Ладья: выбор клетки подхода (lx/ly) и неверная клетка → по умолчанию
{ const g = board(12, [[0, "rook", 2, 5], [1, "pawn", 4, 5], [1, "king", 11, 0], [0, "king", 0, 11]]);
  const L = attackLandings(g, P(g, 1), 4, 5).map((c) => c.join(","));
  ok(L.includes("3,5") && !L.includes("2,5"), "Ладья: подход только своим ходом (по прямой) — (3,5)");
  const g2 = board(12, [[0, "rook", 4, 8], [1, "pawn", 4, 4], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(attackLandings(g2, P(g2, 1), 4, 4).map(String).join(";") === "4,5", "Ладья не заходит сбоку: ход по прямой — единственная клетка (4,5)");
  const g3 = board(12, [[0, "hero", 3, 7], [1, "pawn", 6, 5], [1, "king", 11, 0], [0, "king", 0, 11]]);
  const L3 = attackLandings(g3, P(g3, 1), 6, 5).map(String); ok(L3.length >= 2, `Ферзь: несколько клеток подхода (${L3.join(" ")})`);
  const pick = L3[L3.length - 1]!.split(",").map(Number); const r3 = apply(g3, 0, { a: "attack", id: 1, x: 6, y: 5, lx: pick[0], ly: pick[1] });
  ok(r3.ok && P(g3, 1).x === pick[0] && P(g3, 1).y === pick[1], "Ферзь: встал на выбранную клетку подхода (lx/ly)");
  const g4 = board(12, [[0, "hero", 3, 7], [1, "pawn", 6, 5], [1, "king", 11, 0], [0, "king", 0, 11]]);
  const d4 = attackLanding(g4, P(g4, 1), 6, 5); const r4 = apply(g4, 0, { a: "attack", id: 1, x: 6, y: 5, lx: 0, ly: 0 });
  ok(r4.ok && P(g4, 1).x === d4![0] && P(g4, 1).y === d4![1], "неверная клетка подхода → клетка по умолчанию");
  ok(JSON.stringify(parseAct({ a: "attack", id: 1, x: 5, y: 5, lx: 4, ly: 6 })) === JSON.stringify({ a: "attack", id: 1, x: 5, y: 5, lx: 4, ly: 6 }) && !("lx" in (parseAct({ a: "attack", id: 1, x: 5, y: 5, lx: -1, ly: 2 }) as any)), "parseAct пропускает lx/ly (0…127)");
}
// --- путь закрыт: стена / своя фигура / лес останавливает
{ const g = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]], { "2,6": "#" });
  ok(!has(attackTargets(g, P(g, 1)), 2, 4) && !apply(g, 0, { a: "attack", id: 1, x: 2, y: 4 }).ok, "стена на пути — подход невозможен (bad_attack)");
  const g2 = board(12, [[0, "rook", 2, 8], [0, "pawn", 2, 7], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(!has(attackTargets(g2, P(g2, 1)), 2, 4), "своя фигура на пути — подход невозможен");
  const g3 = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]], { "2,7": "f" });
  ok(!has(attackTargets(g3, P(g3, 1)), 2, 4), "лес останавливает подход (как обычный ход)");
  const g4 = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 2], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(!has(attackTargets(g4, P(g4, 1)), 2, 2) && has(moveTargets(g4, P(g4, 1)), 2, 4), "дальше хода (4) + 1 — не достать");
}
// --- нет свободной клетки рядом
{ const g = board(12, [[0, "rook", 5, 9], [1, "pawn", 5, 5], [1, "rook", 5, 6], [1, "rook", 4, 5], [1, "rook", 6, 5], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(!has(attackTargets(g, P(g, 1)), 5, 5), "цель окружена — с подходом не достать");
  ok(has(attackTargets(g, P(g, 1)), 5, 6), "но ближнего соседа (5,6) — можно");
}
// --- обморозка: подход максимум на 1 клетку; корни — без подхода
{ const g = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 5], [1, "king", 11, 0], [0, "king", 0, 11]]); P(g, 1).chill = 2;
  ok(!has(attackTargets(g, P(g, 1)), 2, 5), "обморожена: подход не дальше 1 клетки");
  const g2 = board(12, [[0, "rook", 2, 7], [1, "pawn", 2, 5], [1, "king", 11, 0], [0, "king", 0, 11]]); (P(g2, 1) as any).root = 1;
  ok(!has(attackTargets(g2, P(g2, 1)), 2, 5), "корни: без подхода");
}
// --- убийство с подходом: Ладья остаётся на клетке подхода
{ const g = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]]); P(g, 2).hp = 1; // добивание — у бота приоритет 100+ P(g, 2).hp = 1;
  const r = apply(g, 0, { a: "attack", id: 1, x: 2, y: 4 });
  ok(r.ok && !g.pieces.some((p) => p.id === 2) && P(g, 1).x === 2 && P(g, 1).y === 5, "Ладья убила с подходом — стоит рядом (2,5), на клетку цели не встаёт");
}
// --- Конь: дальний удар буквой Г, остаётся на месте (и при убийстве)
{ const g = board(12, [[0, "knight", 4, 6], [1, "pawn", 5, 4], [1, "pawn", 4, 5], [1, "king", 11, 0], [0, "king", 0, 11]]);
  const T = attackTargets(g, P(g, 1)); ok(has(T, 5, 4) && !has(T, 4, 5), "Конь бьёт только буквой Г (соседа — нет)");
  P(g, 2).hp = 1; const r = apply(g, 0, { a: "attack", id: 1, x: 5, y: 4 });
  ok(r.ok && P(g, 1).x === 4 && P(g, 1).y === 6 && !at(g, 5, 4), "Конь убил издалека и остался на месте");
  const g2 = board(12, [[0, "knight", 4, 6], [1, "pawn", 6, 3], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(!has(attackTargets(g2, P(g2, 1)), 6, 3), "Конь не подходит (дальше Г — не достать)");
}
// --- Маг: дальний по диагонали, остаётся; стена закрывает
{ const g = board(12, [[0, "mage", 4, 8], [1, "pawn", 6, 6], [1, "king", 11, 0], [0, "king", 0, 11]]);
  const r = apply(g, 0, { a: "attack", id: 1, x: 6, y: 6 }); ok(r.ok && P(g, 1).x === 4 && P(g, 1).y === 8, "Маг бьёт по диагонали на 2 и остаётся");
  const g2 = board(12, [[0, "mage", 4, 8], [1, "pawn", 6, 6], [1, "king", 11, 0], [0, "king", 0, 11]], { "5,7": "#" });
  ok(!has(attackTargets(g2, P(g2, 1)), 6, 6), "Маг: стена закрывает обстрел");
  const g3 = board(12, [[0, "mage", 4, 8], [1, "pawn", 4, 4], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(!has(attackTargets(g3, P(g3, 1)), 4, 4), "Маг не подходит");
}
// --- Пешка: без подхода, бьёт соседа по диагонали вперёд
{ const g = board(12, [[0, "pawn", 4, 8], [1, "pawn", 5, 6], [1, "king", 11, 0], [0, "king", 0, 11]]);
  ok(!has(attackTargets(g, P(g, 1)), 5, 6) && !apply(g, 0, { a: "attack", id: 1, x: 5, y: 6 }).ok, "Пешка не подходит и не бьёт за 1 действие");
  ok(apply(g, 0, { a: "move", id: 1, x: 4, y: 7 }).ok, "Пешка сначала ходит");
  P(g, 1).acted = false; ok(has(attackTargets(g, P(g, 1)), 5, 6) && apply(g, 0, { a: "attack", id: 1, x: 5, y: 6 }).ok, "…потом бьёт соседа по диагонали вперёд");
}
// --- Вождь: вплотную (решение: без подхода)
{ const g = board(12, [[0, "king", 4, 8], [1, "pawn", 4, 6], [1, "king", 11, 0]]);
  ok(!has(attackTargets(g, P(g, 1)), 4, 6), "Вождь бьёт только вплотную (без подхода)");
}
// --- шах учитывает подход Ладьи
{ const g = board(12, [[1, "rook", 0, 2], [0, "king", 0, 6], [1, "king", 11, 0]]);
  ok(inCheck(g, 0), "шах: Ладья врага с подходом достаёт Вождя");
}
// --- туман: бить можно только видимую цель
{ const g = newGame(35, ["stone", "ice"] as any); const same = (a: number, b: number) => a === b;
  const V = visMask(g, 0, same, STRAT_CFG); const enemy = g.pieces.find((p) => p.owner === 1)!, mine = g.pieces.find((p) => p.owner === 0)!;
  ok(V[enemy.y * g.size + enemy.x] === 0 && !fogAttackOk(g, 0, { a: "attack", x: enemy.x, y: enemy.y }, same, STRAT_CFG), "туман: удар по невидимой цели — отказ");
  ok(fogAttackOk(g, 0, { a: "attack", x: mine.x, y: mine.y }, same, STRAT_CFG) && fogAttackOk(g, 0, { a: "move", x: 0, y: 0 } as any, same, STRAT_CFG), "туман: видимая клетка и не-атака — пропускаются");
}
// --- боты пользуются подходом
{ const g = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]]); P(g, 2).hp = 1; // добивание — у бота приоритет 100+
  P(g, 2).hp = 1; (g as any).ec = undefined; const a1 = botAction(g, 0); /* без экономики: botEcon иначе иногда первым тратит ход */ ok(a1.a === "attack" && (a1 as any).x === 2 && (a1 as any).y === 4, "простой бот бьёт с подходом");
  const g2 = board(12, [[0, "rook", 2, 8], [1, "pawn", 2, 4], [1, "king", 11, 0], [0, "king", 0, 11]]); let a2: any = null; try { a2 = matchBot(g2, 0, STRAT_CFG, "hard" as any, "bal", () => 0.5); } catch (e) { a2 = { err: String(e) }; }
  ok(a2 && (a2.a === "attack" || a2.a === "move" || a2.a === "end"), `ИИ отвечает допустимым действием (${JSON.stringify(a2)?.slice(0, 80)})`);
}
console.log(fails ? `attack-test: FAIL ${fails}/${n}` : `attack-test: ${n} ok, 0 fail`); if (fails) process.exit(1);
