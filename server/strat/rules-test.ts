// Тесты движка «Партии Чёрных королей» (этап 1): bun server/strat/rules-test.ts
import { newGame, apply, moveTargets, attackTargets, damage, elementMul, inCheck, botAction, view, at, STRAT_CFG, validTurnLimit, TURN_LIMIT, type GameState, type Piece } from "./rules";
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
  ok(g.apMax === STRAT_CFG.sizes[s].ap && g.turnLimit === STRAT_CFG.sizes[s].turnLimit, `${s}×${s}: ОД и лимит из конфига`);
}
ok(newGame(8, ["fire", "ice"]).pieces.find((p) => p.owner === 0 && p.kind === "rook")!.maxHp === 20, "Огонь: −10% HP (Страж 22 → 20)");
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
  ok(apply(g, 0, { a: "move", id: pawn.id, x: pawn.x, y: pawn.y - 1 }).ok, "ход Ополченцем");
  ok(!apply(g, 0, { a: "move", id: pawn.id, x: pawn.x, y: pawn.y - 1 }).ok, "фигура не действует дважды за ход");
  ok(!apply(g, 0, { a: "move", id: p1.id, x: p1.x, y: p1.y + 1 }).ok, "чужая фигура отклонена");
  ok(!apply(g, 0, { a: "move", id: 999, x: 0, y: 0 }).ok, "несуществующая фигура отклонена");
  const pawn2 = g.pieces.find((p) => p.owner === 0 && p.kind === "pawn" && !p.acted)!;
  const v0 = g.v;
  ok(apply(g, 0, { a: "move", id: pawn2.id, x: pawn2.x, y: pawn2.y - 1 }).ok && g.cur === 1 && g.ap === g.apMax, "2 ОД на 8×8 кончились → ход сопернику");
  ok(g.v === v0 + 1, "версия растёт на каждое действие");
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
  ok(g.winner === 0 && g.reason === "king", "убит Вождь → победа");
  ok(!apply(g, 1, { a: "end" }).ok, "после конца партии действия отклоняются");
}
// --- лимит ходов → очки
{
  const g = board(5, ["fire", "ice"], [[0, "rook", 0, 4], [0, "king", 2, 4], [1, "king", 2, 0]]);
  for (let i = 0; i < 100 && g.winner === -1; i++) apply(g, g.cur, { a: "end" });
  ok(g.winner === 0 && g.reason === "limit", "лимит ходов: побеждает тот, у кого больше очков");
  const g2 = board(5, ["fire", "fire"], [[0, "king", 2, 4], [1, "king", 2, 0]]);
  for (let i = 0; i < 100 && g2.winner === -1; i++) apply(g2, g2.cur, { a: "end" });
  ok(g2.winner === 2, "равные очки → ничья");
  ok(g2.turn === STRAT_CFG.sizes[5].turnLimit + 1, "лимит считает полные круги");
}
// --- лимит ходов из лобби
{
  ok(validTurnLimit(null) === null && validTurnLimit(0) === 0 && validTurnLimit(5) === 5 && validTurnLimit(200) === 200, "лимит ходов: null/0/5/200 допустимы");
  ok([4, 201, -1, 2.5, "10", true].every((v) => validTurnLimit(v) === undefined), "лимит ходов: 4, 201, −1, дробь, строка — отклоняются");
  ok(newGame(8, ["fire", "ice"], 0, STRAT_CFG, 12).turnLimit === 12 && newGame(8, ["fire", "ice"], 0, STRAT_CFG, null).turnLimit === 25, "свой лимит / по умолчанию для размера");
  const g = newGame(5, ["fire", "fire"], 0, STRAT_CFG, 0); g.pieces = g.pieces.filter((p) => p.kind === "king");
  for (let i = 0; i < 2 * TURN_LIMIT.max + 50; i++) apply(g, g.cur, { a: "end" });
  ok(g.winner === -1 && g.turn > TURN_LIMIT.max, "без лимита: партия не кончается по ходам");
  const g3 = newGame(5, ["fire", "ice"], 1, STRAT_CFG, 5); g3.pieces = g3.pieces.filter((p) => p.kind === "king");
  for (let i = 0; i < 30 && g3.winner === -1; i++) apply(g3, g3.cur, { a: "end" });
  ok(g3.reason === "limit" && g3.turn === 6, "свой лимит 5 срабатывает после 5 полных кругов");
}
// --- самопроверка: бот против бота всегда доигрывает, правила не ломаются
{
  let fin = 0, bad = 0; const wins = [0, 0, 0];
  for (let i = 0; i < 300; i++) {
    const s = [5, 8, 15][i % 3]; const g = newGame(s, i % 2 ? ["fire", "ice"] : ["ice", "fire"], (i % 4 < 2 ? 0 : 1) as 0 | 1);
    for (let k = 0; k < 5000 && g.winner === -1; k++) { const r = apply(g, g.cur, botAction(g, g.cur)); if (!r.ok) { bad++; apply(g, g.cur, { a: "end" }); } }
    if (g.winner !== -1) { fin++; wins[g.winner]++; }
    if (new Set(g.pieces.map((p) => p.x + ":" + p.y)).size !== g.pieces.length) bad++;
  }
  ok(fin === 300 && bad === 0, `бот×бот: 300/300 партий доиграны, ${bad} недопустимых действий (П0 ${wins[0]}, П1 ${wins[1]}, ничьи ${wins[2]})`);
}
ok(JSON.stringify(view(newGame(15, ["fire", "ice"]))).length < 4000, "снимок 15×15 < 4 КБ");
console.log(fails ? `FAILED ${fails}/${n}` : `ALL OK ${n}`); if (fails) process.exit(1);
