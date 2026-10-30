// Тесты экономики этапа 2 (города, найм, постройки, технологии, таланты, Слава, хук обмена, черновые расы, админ-конфиг):
//   nice bun server/strat/econ-test.ts
import { newGame, apply, STRAT_CFG, type GameState, type Piece } from "./rules";
import { territory, citySlots, canRecruit, canResearch, canEra, canFound, pendingTalent, validateTrade, effArm, effAtk, recruitCells, sz } from "./econ";
import { techById } from "./econ-cfg";
import { mergeCfg, sanitizePatch } from "./cfg";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG;
const cap = (g: GameState, s: number) => g.ec.cities.find((c) => c.owner === s && c.cap)!;
const endTwice = (g: GameState) => { apply(g, g.cur, { a: "end" }); apply(g, g.cur, { a: "end" }); };

// --- старт
{
  const g = newGame(8, ["fire", "ice"], 0);
  ok(g.ec.cities.length === 2 && g.ec.cities.every((c) => c.cap), "8×8: у каждого столица на месте Вождя");
  ok(g.ec.res[0].gold === C.econ.start.gold + g.ec.inc[0].gold && g.ec.res[1].gold === C.econ.start.gold + C.econ.start.secondGold, "второй игрок получает +золото на старте (компенсация первого хода)");
  ok(g.ec.era[0] === 1 && sz(g, C).eras === 2, "8×8: эпоха I, всего 2 эпохи");
  const g5 = newGame(5, ["fire", "ice"], 0); ok(g5.ec.era[0] === 0 && canResearch(g5, 0, techById("formation"), C) === "no_tech", "5×5: без технологий");
}
// --- доход и территория
{
  const g = newGame(8, ["fire", "ice"], 0), T = territory(g, C), c = cap(g, 0);
  ok(T[c.y * 8 + c.x] === 0 && T[cap(g, 1).y * 8 + cap(g, 1).x] === 1, "территория вокруг столиц");
  const before = g.ec.res[1].gold; apply(g, 0, { a: "end" });
  ok(g.ec.res[1].gold === before + g.ec.inc[1].gold && g.ec.inc[1].gold >= C.econ.city.capGold, "доход начисляется в начале хода");
  ok(g.ec.inc[1].know >= Math.min(2, C.econ.city.capKnow), "Лёд: штраф знаний не опускает доход ниже 2 (knowFloor)");
}
// --- постройки и найм
{
  const g = newGame(8, ["fire", "ice"], 0), c = cap(g, 0); g.ec.res[0].gold = 100;
  ok(canRecruit(g, 0, c, "rook", C) === "locked", "Страж без Казармы — закрыт");
  ok(apply(g, 0, { a: "build", city: c.id, b: "barracks" } as any).ok && c.bld.includes("barracks") && g.ec.res[0].gold === 100 - C.build.barracks.cost, "Казарма построена, золото списано");
  ok(!apply(g, 0, { a: "build", city: c.id, b: "stable" } as any).ok, "город действует раз в ход");
  endTwice(g); g.pieces = g.pieces.filter((p) => p.kind === "king" || Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) > 1); // освободить клетки найма
  const cell = recruitCells(g, c, "rook", C)[0];
  ok(canRecruit(g, 0, c, "rook", C) === null && cell, "после Казармы Страж доступен");
  const r = apply(g, 0, { a: "recruit", city: c.id, kind: "rook", x: cell[0], y: cell[1] } as any);
  ok(r.ok && g.pieces.some((p) => p.owner === 0 && p.kind === "rook" && p.x === cell[0] && p.y === cell[1] && p.acted), "найм: фигура на клетке рядом с городом, ходит со следующего хода");
  endTwice(g); apply(g, 0, { a: "build", city: c.id, b: "library" } as any);
  ok(c.bld.length === citySlots(g, c, C) && citySlots(g, c, C) === 2, "8×8: в столице ур.1 — 2 места");
  endTwice(g); const e = apply(g, 0, { a: "build", city: c.id, b: "market" } as any);
  ok(!e.ok && (e as any).err === "no_slot", "мест нет — no_slot");
  ok(!apply(g, 0, { a: "build", city: c.id, b: "glacier" } as any).ok, "расовая постройка чужой расы недоступна");
  ok(canRecruit(g, 0, c, "hero", C) === "need_era", "Герой — с эпохи II");
}
// --- технологии
{
  const g = newGame(8, ["fire", "ice"], 0); g.ec.res[0].know = 100;
  ok(apply(g, 0, { a: "research", t: "formation" } as any).ok && g.ec.res[0].glory === C.econ.glory.tech, "исследование: +Слава");
  ok(canResearch(g, 0, techById("steel"), C) === "need_era", "технология II эпохи закрыта в эпохе I");
  ok(canResearch(g, 0, techById("trade") ?? techById("scribes"), C) === "research_done", "одно исследование за ход");
  endTwice(g);
  ok(canResearch(g, 0, techById("ambush"), C) === "locked", "пара «или-или»: вторая закрыта навсегда");
  ok(canEra(g, 0, C) === "need_techs", "эпоха: нужно 2 технологии текущей эпохи");
  ok(canResearch(g, 0, techById("frostarmor") ?? undefined, C) !== null, "стихийная ветвь чужой расы недоступна");
}
// --- таланты
{
  const g = newGame(8, ["fire", "ice"], 0), p = g.pieces.find((q) => q.owner === 0 && q.kind === "pawn")!;
  ok(!pendingTalent(p, C), "ур.1 — талантов нет");
  p.xp = C.econ.xp.lv[2]; ok(pendingTalent(p, C) === 2, "ур.2 — выбор таланта");
  const a0 = p.atk; ok(apply(g, 0, { a: "talent", id: p.id, t: "spear" } as any).ok && p.atk === a0 + 1, "талант Копьё: +1 АТК");
  ok(!apply(g, 0, { a: "talent", id: p.id, t: "shield" } as any).ok, "второй талант того же уровня нельзя");
  p.xp = C.econ.xp.lv[3]; ok(pendingTalent(p, C) === 3, "ур.3 — второй выбор");
}
// --- застава
{
  const g = newGame(8, ["fire", "ice"], 0), p = g.pieces.find((q) => q.owner === 0 && q.kind === "pawn")!;
  ok(canFound(g, 0, p, C) === "too_close", "застава: не вплотную к столице");
  p.x = 7; p.y = 4;
  const e = canFound(g, 0, p, C);
  if (e === null) { ok(apply(g, 0, { a: "found", id: p.id } as any).ok && g.ec.cities.length === 3, "застава основана, Ополченец ушёл"); ok(canFound(g, 0, { ...p, id: 999 } as Piece, C) !== null, "8×8: вторая застава нельзя / слишком близко"); }
  else ok(false, "застава: клетка (7,4) должна подходить, а ошибка " + e);
}
// --- победы
{
  const g = newGame(8, ["fire", "ice"], 0); g.ec.res[0].glory = sz(g, C).glory; apply(g, 0, { a: "end" }); apply(g, 1, { a: "end" });
  ok(g.winner === 0 && g.reason === "glory", "победа Славой на пороге");
  const g2 = newGame(8, ["fire", "ice"], 0), c1 = cap(g2, 1), k1 = g2.pieces.find((q) => q.owner === 1 && q.kind === "king")!;
  k1.x = 7 - k1.x || 3; k1.y = 1; const k0 = g2.pieces.find((q) => q.owner === 0 && q.kind === "knight")!; k0.x = c1.x; k0.y = c1.y;
  for (let i = 0; i < 6 && g2.winner === -1; i++) apply(g2, g2.cur, { a: "end" });
  ok(g2.winner === 0 && g2.reason === "capital", "осада столицы (враг простоял до своего хода) → победа");
}
// --- хук обмена 2 на 2
{
  const g = newGame(8, ["fire", "ice"], 0); g.ec.res[0].gold = 20; g.ec.res[0].know = 10;
  ok(validateTrade(g, 0, { to: 1, give: { gold: 2 }, get: { know: 2 } }, C) === "no_ally", "1 на 1: союзника нет");
  const al = () => true;
  ok(validateTrade(g, 0, { to: 2, give: { gold: 3 }, get: {} }, C, al) === "no_gift", "передачи «просто так» нет");
  ok(validateTrade(g, 0, { to: 2, give: { gold: 5 }, get: { know: 1 } }, C, al) === "bad_ratio", "курс вне 1:2…2:1");
  ok(validateTrade(g, 0, { to: 2, give: { gold: 10 }, get: { know: 6 } }, C, al) === "too_much", "больше 30% запаса нельзя");
  ok(validateTrade(g, 0, { to: 2, give: { gold: 4 }, get: { know: 3 } }, C, al) === null, "честная сделка допустима (ждёт согласия)");
  ok(!apply(g, 0, { a: "trade", to: 1, give: { gold: 1 }, get: { know: 1 } } as any).ok, "в 1 на 1 сервер отклоняет обмен");
}
// --- черновые расы
{
  for (const r of ["water", "stone", "nature", "lightning"] as const) { const g = newGame(8, [r, "fire"], 0); ok(g.pieces.filter((p) => p.owner === 0).length === g.pieces.filter((p) => p.owner === 1).length && g.ec.cities.length === 2, `раса ${r}: партия создаётся`); }
  const s = newGame(8, ["stone", "fire"], 0), sp = s.pieces.find((p) => p.owner === 0 && p.kind === "pawn")!; ok(effArm(s, sp, C) === sp.arm + 1, "Камень: +1 БРН");
  const l = newGame(8, ["lightning", "ice"], 0); ok(l.pieces.find((p) => p.owner === 0 && p.kind === "rook")!.maxHp === Math.round(C.units.rook.hp * 0.9), "Молния: −10% HP");
  const w = newGame(8, ["water", "ice"], 0), wr = w.pieces.find((p) => p.owner === 0 && p.kind === "rook")!; ok(effAtk(w, wr, null, C) === wr.atk - 1, "Вода: Страж −1 АТК");
}
// --- админ-конфиг
{
  const m = mergeCfg({ econ: { start: { gold: 9 } }, evil: { x: 1 } });
  ok(m.econ.start.gold === 9 && !(m as any).evil, "правка: известные ключи применяются, лишние отбрасываются");
  ok(mergeCfg({ econ: { start: { gold: 1e12 } } }).econ.start.gold <= 100000, "числа ограничены");
  ok(sanitizePatch({ a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } }) !== undefined, "глубокая правка обрезается, не падает");
  ok(STRAT_CFG.econ.start.gold === C.econ.start.gold && mergeCfg({}).econ.start.gold === C.econ.start.gold, "база не меняется");
}
console.log(fails ? `FAILED ${fails}/${n}` : `ALL OK ${n}`); if (fails) process.exit(1);
