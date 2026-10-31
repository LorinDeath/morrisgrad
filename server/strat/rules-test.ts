// Тесты движка «Партии Чёрных королей» (этап 1): bun server/strat/rules-test.ts
import { makeMap, officialMaps, armyCells, newGame, apply, moveTargets, attackTargets, damage, elementMul, inCheck, botAction, view, at, STRAT_CFG, validTurnLimit, TURN_LIMIT, type GameState, type Piece } from "./rules";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const has = (arr: [number, number][], x: number, y: number) => arr.some(([a, b]) => a === x && b === y);
// пустая доска с выбранными фигурами
function board(size: number, races: any, list: [0 | 1, Piece["kind"], number, number][]): GameState {
  const g = newGame(size, races); g.pieces = []; g.nextId = 1;
  for (const [o, k, x, y] of list) { const u = STRAT_CFG.units[k]; const mul = (STRAT_CFG.race as any)[races[o]].hpMul; const hp = Math.round(u.hp * mul);
    g.pieces.push({ id: g.nextId++, owner: o, kind: k, x, y, hp, maxHp: hp, atk: u.atk, arm: u.arm, acted: false, burn: 0, chill: 0 }); }
  return g;
}
// --- расстановка
for (const s of [5, 8, 15]) {
  const g = newGame(s, ["fire", "ice"]);
  const k0 = g.pieces.filter((p) => p.owner === 0 && p.kind === "king"), k1 = g.pieces.filter((p) => p.owner === 1 && p.kind === "king");
  ok(k0.length === 1 && k1.length === 1, `${s}×${s}: по одному Вождю`);
  ok(g.pieces.every((p) => p.x >= 0 && p.x < s && p.y >= 0 && p.y < s), `${s}×${s}: все фигуры на доске`);
  ok(new Set(g.pieces.map((p) => p.x + ":" + p.y)).size === g.pieces.length, `${s}×${s}: клетки не пересекаются`);
  const mirror = g.pieces.filter((p) => p.owner === 0).every((p) => g.pieces.some((q) => q.owner === 1 && q.kind === p.kind && q.x === p.x && q.y === s - 1 - p.y));
  ok(mirror, `${s}×${s}: армии зеркальны (честный старт)`);
  ok(g.apMax === ({ 5: 1, 8: 1, 15: 2 } as any)[s] && g.turnLimit === 0, `${s}×${s}: ОД по лиге (Быстрая 1, Обычная 2), без лимита ходов`);
}
ok(newGame(15, ["fire", "ice"]).pieces.find((p) => p.owner === 0 && p.kind === "rook")!.maxHp === 20, "Огонь: −10% HP (Страж 22 → 20)");
ok(newGame(8, ["fire", "ice"]).pieces.find((p) => p.owner === 0 && p.kind === "rook")!.maxHp === 24, "t1175: Огонь на 8×8 — лига quick +10% HP (Страж 24)");
ok(newGame(15, ["lightning", "ice"]).pieces.find((p) => p.owner === 0 && p.kind === "rook")!.maxHp === 24 && newGame(8, ["lightning", "ice"]).pieces.find((p) => p.owner === 0 && p.kind === "rook")!.maxHp === 18, "t1175: Молния — +10% HP в лиге normal (15×15, Страж 24), −20% в quick (8×8, Страж 18)");
ok(newGame(8, ["fire", "ice"]).pieces.find((p) => p.owner === 1 && p.kind === "rook")!.maxHp === 22, "Лёд: HP без штрафа");
// --- ходы скелета
{
  const g = board(8, ["fire", "ice"], [[0, "rook", 3, 3], [0, "pawn", 3, 1], [1, "king", 7, 0], [0, "king", 0, 7]]);
  const r = g.pieces[0], mt = moveTargets(g, r);
  ok(has(mt, 3, 2) && !has(mt, 3, 1) && !has(mt, 3, 0), "Страж: блокируется своей фигурой");
  ok(has(mt, 7, 3) && !has(mt, 0, 3) === false && has(mt, 3, 7), "Страж: прямые до 4");
  ok(!has(mt, 4, 4), "Страж: не ходит по диагонали");
  const g2 = board(15, ["fire", "ice"], [[0, "rook", 0, 7], [1, "king", 14, 0], [0, "king", 14, 14]]);
  ok(has(moveTargets(g2, g2.pieces[0]), 4, 7) && !has(moveTargets(g2, g2.pieces[0]), 5, 7), "Страж: дальность 4 на 15×15");
}
{
  const g = board(8, ["fire", "ice"], [[0, "knight", 1, 7], [0, "pawn", 1, 6], [1, "king", 7, 0], [0, "king", 4, 7]]);
  const mt = moveTargets(g, g.pieces[0]);
  ok(has(mt, 0, 5) && has(mt, 2, 5) && has(mt, 3, 6) && mt.length === 3, "Всадник: «Г» с прыжком через фигуры");
}
{
  const g = board(8, ["fire", "ice"], [[0, "pawn", 3, 4], [1, "pawn", 4, 3], [1, "pawn", 3, 3], [1, "king", 7, 0], [0, "king", 0, 7]]);
  const p = g.pieces[0];
  ok(!has(moveTargets(g, p), 3, 3) && has(moveTargets(g, p), 2, 4) && has(moveTargets(g, p), 4, 4) && !has(moveTargets(g, p), 3, 5), "Ополченец: вперёд/вбок, не назад, не в занятую");
  ok(has(attackTargets(g, p), 4, 3) && !has(attackTargets(g, p), 3, 3), "Ополченец: бьёт по диагонали вперёд, не прямо");
}
{
  const g = board(8, ["fire", "ice"], [[0, "mage", 2, 5], [1, "rook", 4, 3], [1, "king", 7, 0], [0, "king", 0, 7]]);
  ok(has(attackTargets(g, g.pieces[0]), 4, 3), "Маг: дальний удар по диагонали на 2");
  apply(g, 0, { a: "attack", id: 1, x: 4, y: 3 });
  ok(g.pieces[0].x === 2 && g.pieces[0].y === 5, "Маг: не двигается при ударе");
}
// --- урон, круг стихий
ok(elementMul("fire", "ice") === 1.1 && elementMul("ice", "fire") === 1 && elementMul("water", "fire") === 1.1 && elementMul("lightning", "water") === 1.1, "круг стихий: +10% только по «слабой»");
{
  const g = board(8, ["fire", "ice"], [[0, "knight", 3, 4], [1, "rook", 4, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  ok(damage(g, g.pieces[0], g.pieces[1]) === 3, "урон = (АТК−БРН)×круг: (6−3)×1.1 → 3");
  const g2 = board(8, ["ice", "ice"], [[0, "pawn", 3, 4], [1, "hero", 4, 3], [1, "king", 7, 0], [0, "king", 0, 7]]);
  g2.pieces[1].arm = 9; ok(damage(g2, g2.pieces[0], g2.pieces[1]) === 1, "урон минимум 1");
}
// --- взятие: ближний встаёт на клетку
{
  const g = board(8, ["fire", "ice"], [[0, "knight", 3, 4], [1, "pawn", 4, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  g.pieces[1].hp = 2;
  const r = apply(g, 0, { a: "attack", id: 1, x: 4, y: 2 });
  ok(r.ok && !g.pieces.some((p) => p.id === 2) && at(g, 4, 2)?.id === 1, "убийство ближним: фигура встаёт на клетку");
}
// --- очередь, ОД, повтор фигуры
{
  const g = newGame(8, ["fire", "ice"]);
  const p1 = g.pieces.find((p) => p.owner === 1)!;
  ok(!apply(g, 1, { a: "end" }).ok, "чужой ход отклонён");
  const pawn = g.pieces.find((p) => p.owner === 0 && p.kind === "pawn")!;
  g.ec.res[0].gold = 0; g.ec.res[0].know = 0; // нечего делать в городе → ход передастся сам
  ok(apply(g, 0, { a: "move", id: pawn.id, x: pawn.x, y: pawn.y - 1 }).ok, "ход Ополченцем");
  ok(!apply(g, 0, { a: "move", id: pawn.id, x: pawn.x, y: pawn.y - 1 }).ok, "после траты ОД ходить нельзя");
  ok(!apply(g, 0, { a: "move", id: p1.id, x: p1.x, y: p1.y + 1 }).ok, "чужая фигура отклонена");
  ok(!apply(g, 0, { a: "move", id: 999, x: 0, y: 0 }).ok, "несуществующая фигура отклонена");
  const v0 = g.v; // t1141: на 8×8 (Быстрая лига) 1 ОД — первый ход Ополченцем уже передал ход
  ok(g.cur === 1 && g.ap === g.apMax, "1 ОД на 8×8 кончилось → ход сопернику");
  apply(g, 1, { a: "end" }); ok(g.v === v0 + 1, "версия растёт на каждое действие");
  g.ec.res[0].gold = 0; g.ec.res[0].know = 0;
  ok(g.pieces.filter((p) => p.owner === 0).every((p) => !p.acted), "в новом ходе флаги сброшены");
  ok(!apply(g, 0, { a: "move", id: 999, x: 1.5 as any, y: 0 }).ok, "мусор в координатах отклонён");
}
// --- поджог и обморозка
{
  const g = board(8, ["fire", "ice"], [[0, "knight", 3, 4], [1, "rook", 4, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  apply(g, 0, { a: "attack", id: 1, x: 4, y: 2 });
  const t = g.pieces[1]; const hpAfterHit = t.hp;
  ok(t.burn === 2, "Огонь: удар поджигает на 2 хода");
  apply(g, 0, { a: "end" });
  ok(t.hp === hpAfterHit - 1 && t.burn === 1, "поджог: −1 HP в начале хода владельца");
}
{
  const g = board(8, ["ice", "fire"], [[0, "knight", 3, 4], [1, "rook", 4, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  apply(g, 0, { a: "attack", id: 1, x: 4, y: 2 }); apply(g, 0, { a: "end" });
  const r = g.pieces[1];
  ok(r.chill === 1 && moveTargets(g, r).every(([x, y]) => Math.abs(x - r.x) + Math.abs(y - r.y) === 1), "Лёд: обмороженный ходит максимум на 1 клетку");
  apply(g, 1, { a: "end" });
  ok(r.chill === 0, "обморозка спадает после хода владельца");
  const g2 = board(8, ["ice", "fire"], [[0, "knight", 3, 4], [1, "knight", 4, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  apply(g2, 0, { a: "attack", id: 1, x: 4, y: 2 }); apply(g2, 0, { a: "end" });
  ok(moveTargets(g2, g2.pieces[1]).length === 0, "обмороженный Всадник не прыгает");
}
// --- превращение
{
  const g = board(8, ["fire", "ice"], [[0, "pawn", 2, 1], [1, "king", 7, 0], [0, "king", 0, 7]]);
  apply(g, 0, { a: "move", id: 1, x: 2, y: 0, promo: "knight" });
  ok(g.pieces[0].kind === "knight", "превращение Ополченца на последней линии");
  const g2 = board(8, ["fire", "ice"], [[0, "pawn", 2, 1], [1, "king", 7, 0], [0, "king", 0, 7]]);
  apply(g2, 0, { a: "move", id: 1, x: 2, y: 0, promo: "hero" as any });
  ok(g2.pieces[0].kind === "rook", "в Героя/Вождя превращаться нельзя (по умолчанию Страж)");
}
// --- шах и победа
{
  const g = board(8, ["fire", "ice"], [[0, "hero", 5, 1], [1, "king", 6, 0], [0, "king", 0, 7]]);
  ok(inCheck(g, 1) && !inCheck(g, 0), "шах подсвечивается");
  g.pieces[1].hp = 1; apply(g, 0, { a: "attack", id: 1, x: 6, y: 0 });
  ok(g.winner === -1 && g.ec.goals[0].includes("chief") && g.ec.chief[1].dead > 0, "убит Вождь → цель «Цареубийство», партия продолжается (8×8)");
  g.ec.goals[0].push("treasury", "domain"); apply(g, 0, { a: "end" });
  ok(g.winner === 0 && g.reason === "goals", "3 цели из 5 → победа");
  ok(!apply(g, 1, { a: "end" }).ok, "после конца партии действия отклоняются");
}
// --- t1135: лимита ходов нет, автоничьи нет
{
  const g = board(5, ["fire", "fire"], [[0, "king", 2, 4], [1, "king", 2, 0]]);
  for (let i = 0; i < 400 && g.winner === -1; i++) apply(g, g.cur, { a: "end" });
  ok(g.winner === -1 && g.turnLimit === 0, "200 кругов: партия не кончается по ходам и не уходит в автоничью");
  ok(newGame(8, ["fire", "ice"], 0, STRAT_CFG, 12).turnLimit === 0, "лимит из лобби игнорируется (no_turn_limit)");
  ok(validTurnLimit(null) === null && [4, 201, -1, 2.5, "10", true].every((v) => validTurnLimit(v) === undefined), "валидатор лимита (совместимость) — отклоняет мусор");
}
// --- самопроверка: бот против бота всегда доигрывает, правила не ломаются
{
  let fin = 0, bad = 0; const wins = [0, 0, 0];
  const stall: Record<number, number> = {}; const NG = 60; // без лимита ходов партии длиннее — меньше прогонов, полный баланс — в симуляциях
  for (let i = 0; i < NG; i++) {
    const s = [5, 8, 15][i % 3]; const g = newGame(s, i % 2 ? ["fire", "ice"] : ["ice", "fire"], (i % 4 < 2 ? 0 : 1) as 0 | 1);
    for (let k = 0; k < 6000 && g.winner === -1; k++) { const r = apply(g, g.cur, botAction(g, g.cur)); if (!r.ok) { bad++; apply(g, g.cur, { a: "end" }); } }
    if (g.winner !== -1) { fin++; wins[g.winner]++; } else stall[s] = (stall[s] || 0) + 1;
    if (new Set(g.pieces.map((p) => p.x + ":" + p.y)).size !== g.pieces.length) bad++;
  }
  ok(fin >= NG * 0.7 && bad === 0, `бот×бот: ${fin}/${NG} партий доиграны за 6000 действий (без лимита ходов; не доиграны по размерам ${JSON.stringify(stall)}), ${bad} недопустимых действий (П0 ${wins[0]}, П1 ${wins[1]}, ничьи ${wins[2]})`);
}
// --- Ополченец: отступление на 1 по диагонали назад (только ход, без атаки)
{
  const g = board(8, ["fire", "ice"], [[0, "pawn", 3, 4], [1, "pawn", 4, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  const p0 = g.pieces[0], mt = moveTargets(g, p0);
  ok(has(mt, 2, 5) && has(mt, 4, 5) && has(mt, 3, 3) && has(mt, 2, 4) && has(mt, 4, 4) && !has(mt, 3, 5) && !has(mt, 2, 3), "Ополченец (низ): вперёд, вбок и 2 диагонали назад; прямо назад и диагональ вперёд — нет");
  const p1 = g.pieces[1], m1 = moveTargets(g, p1);
  ok(has(m1, 3, 1) && has(m1, 5, 1) && !has(m1, 4, 1), "Ополченец (верх): отступление — по диагонали к своему краю");
  ok(apply(g, 0, { a: "move", id: p0.id, x: 4, y: 5 }).ok && p0.x === 4 && p0.y === 5, "отступление на пустую клетку разрешено");
  const g2 = board(8, ["fire", "ice"], [[0, "pawn", 3, 4], [1, "pawn", 2, 5], [0, "rook", 4, 5], [1, "king", 7, 0], [0, "king", 0, 7]]);
  const q = g2.pieces[0];
  ok(!has(attackTargets(g2, q), 2, 5) && !has(moveTargets(g2, q), 2, 5), "назад по диагонали нельзя бить (враг сзади не цель)");
  ok(!apply(g2, 0, { a: "attack", id: q.id, x: 2, y: 5 }).ok && g2.pieces.length === 5, "атака назад отклонена сервером");
  ok(!has(moveTargets(g2, q), 4, 5), "своя фигура сзади по диагонали блокирует отступление");
  const g3 = withMap(board(8, ["fire", "ice"], [[0, "pawn", 3, 4], [1, "king", 7, 0], [0, "king", 0, 7]]), ["........", "........", "........", "........", "........", "..#.w...", "........", "........"]);
  const m3 = moveTargets(g3, g3.pieces[0]);
  ok(!has(m3, 2, 5) && !has(m3, 4, 5), "стена и вода блокируют отступление");
}
ok(JSON.stringify(view(newGame(15, ["fire", "ice"]))).length < 6000, "снимок 15×15 < 6 КБ");
// --- рельеф и карты
import { validateMap, passable, type MapData } from "./terrain";
function withMap(g: GameState, rows: string[], st?: string[]): GameState { const n = g.size; g.map = { id: "t", name: "t", size: n, t: rows.join("").replace(/ /g, ""), s: (st || rows.map((r) => ".".repeat(r.replace(/ /g, "").length))).join("") }; return g; }
for (const s of [5, 8, 15]) for (const o of officialMaps(s)) {
  const m = makeMap(s, o.id), a = armyCells(s), v = validateMap(m, { armyRows: a.rows, armyCols: a.cells });
  ok(v.errors.length === 0, `${s}×${s} «${o.name}»: карта валидна (${v.errors.join(",") || "ok"})`);
  ok(!v.warnings.includes("not_symmetric"), `${s}×${s} «${o.name}»: симметрична`);
  const kinds = new Set(m.t); ok(s < 8 || (kinds.has("w") && kinds.has("b")), `${s}×${s} «${o.name}»: есть река и мост`);
  if (s >= 15) ok(["m", "f", "#", "g", "r"].every((c) => kinds.has(c)) && new Set(m.s.replace(/\./g, "")).size >= 8, `15×15 «${o.name}»: горы, лес, стена, ворота, дорога, ≥8 видов построек`);
  const g = newGame(s, ["fire", "ice"], 0, STRAT_CFG, null, m);
  ok(g.pieces.every((p) => passable(m, p.x, p.y)), `${s}×${s} «${o.name}»: армии стоят на проходимых клетках`);
}
for (let seed = 1; seed <= 40; seed++) { const m = makeMap(15, "rnd:" + seed), a = armyCells(15); if (validateMap(m, { armyRows: a.rows, armyCols: a.cells }).errors.length) { ok(false, "rnd:" + seed + " невалидна"); break; } if (seed === 40) ok(true, "40 случайных карт 15×15 валидны"); }
{
  const g = withMap(board(8, ["fire", "ice"], [[0, "rook", 0, 4], [0, "pawn", 4, 6], [0, "knight", 6, 6], [1, "king", 7, 0], [0, "king", 0, 7]]), [
    "........", "........", "........", "........", "..f.#...", "....w...", "....m...", "........"]);
  const r = g.pieces[0], mt = moveTargets(g, r);
  ok(has(mt, 2, 4) && !has(mt, 3, 4), "Лес: скольжение Стража останавливается на опушке");
  const g2 = withMap(board(8, ["fire", "ice"], [[0, "rook", 6, 4], [1, "king", 7, 0], [0, "king", 0, 7]]), ["........", "........", "........", "........", "....#...", "........", "........", "........"]);
  ok(has(moveTargets(g2, g2.pieces[0]), 5, 4) && !has(moveTargets(g2, g2.pieces[0]), 4, 4) && !has(moveTargets(g2, g2.pieces[0]), 3, 4), "Стена: блокирует ход");
  const p = g.pieces[1]; ok(!has(moveTargets(g, p), 4, 5), "Река: Ополченец не входит в воду");
  const kn = g.pieces[2]; ok(!has(moveTargets(g, kn), 4, 5) && has(moveTargets(g, kn), 5, 4), "Всадник: не приземляется на воду/горы, прыгает через рельеф");
}
{
  const g = withMap(board(8, ["fire", "ice"], [[0, "mage", 2, 6], [1, "pawn", 4, 4], [1, "king", 7, 0], [0, "king", 0, 7]]), ["........", "........", "........", "........", "........", "...m....", "........", "........"]);
  ok(attackTargets(g, g.pieces[0]).length === 0, "Горы: закрывают обстрел Мага");
  g.map = { ...g.map, t: ".".repeat(64) }; ok(attackTargets(g, g.pieces[0]).length === 1, "Без гор — Маг стреляет");
}
{
  const g = board(8, ["ice", "ice"], [[0, "rook", 3, 3], [1, "rook", 3, 2], [1, "king", 7, 0], [0, "king", 0, 7]]);
  const d0 = damage(g, g.pieces[0], g.pieces[1]);
  const t = ".".repeat(64).split(""); t[2 * 8 + 3] = "f"; g.map = { ...g.map, t: t.join("") };
  const d1 = damage(g, g.pieces[0], g.pieces[1]);
  const st = ".".repeat(64).split(""); st[2 * 8 + 3] = "T"; g.map = { ...g.map, t: ".".repeat(64), s: st.join("") };
  const d2 = damage(g, g.pieces[0], g.pieces[1]);
  ok(d1 === Math.max(1, d0 - 1) && d2 === Math.max(1, d0 - 2), `Укрытие: лес −1, башня −2 урона (${d0}/${d1}/${d2})`);
}
{
  const g = board(8, ["ice", "ice"], [[0, "rook", 3, 3], [1, "king", 7, 0], [0, "king", 0, 7]]);
  const st = ".".repeat(64).split(""); st[3 * 8 + 3] = "W"; g.map = { ...g.map, s: st.join("") };
  g.pieces[0].hp = 10; g.cur = 1; apply(g, 1, { a: "end" } as any);
  ok(g.pieces[0].hp === 11, "Колодец: +1 HP своей фигуре в начале хода");
}
ok(JSON.stringify(view(newGame(15, ["fire", "ice"], 0, STRAT_CFG, null, makeMap(15, "o15a")))).length < 6500, "снимок 15×15 с картой < 6.5 КБ");

console.log(fails ? `FAILED ${fails}/${n}` : `ALL OK ${n}`); if (fails) process.exit(1);
