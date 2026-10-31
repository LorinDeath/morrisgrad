// t1219: режимы 2×2 и «Все ×3/×4/×6/×8» — сценарные проверки без ИИ (без бот-матчей и симуляций).
//   nice bun server/strat/modes-test.ts
import { newGame, apply, view, limitWinner, STRAT_CFG, type GameState, type Race } from "./rules";
import { chiefGoalCheck, teamGoals, goalCfg, chiefBlacklist, validateTrade } from "./econ";
import { MODES, teamsFor, teamOf, foe, ally, isOut, nextSeat, drawCode, isDraw, seatWon, type ModeId } from "./seats";
import { mapFits, mapModes, validateMap, spawnsOf, seatSpawns } from "./terrain";
import { showcaseAll, showcaseMap } from "./showcase";
import { startLog, logAct, rebuild, turnMarks } from "./replay";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG, RS: Race[] = ["fire", "ice", "stone", "water", "nature", "lightning", "fire", "ice"];
const mk = (id: string, md: ModeId) => { const m = showcaseMap(id)!; return newGame(m.size, RS.slice(0, MODES[md].seats), 0, C, 0, m, { mode: md }); };
const end = (g: GameState) => apply(g, g.cur, { a: "end" });

// --- места, команды, очередь хода
{
  const g = mk("m01", "2v2");
  ok(g.np === 4 && JSON.stringify(g.tm) === "[0,1,0,1]", "2×2: 4 места, команды [A,B,A,B]");
  ok(JSON.stringify(teamsFor("2v2")) === "[0,1,0,1]" && JSON.stringify(teamsFor("ffa3")) === "[0,1,2]", "teamsFor по режиму");
  ok(ally(g, 0, 2) && foe(g, 0, 1) && foe(g, 0, 3) && !foe(g, 1, 3), "союзник/соперник по команде");
  const seq = [g.cur]; for (let i = 0; i < 4; i++) { end(g); seq.push(g.cur); }
  ok(JSON.stringify(seq) === "[0,1,2,3,0]", "очередь A1→B1→A2→B2→A1: " + seq);
  ok(g.turn === 2, "номер хода растёт, когда круг замкнулся");
  for (let s = 0; s < 4; s++) ok(g.pieces.some((p) => p.owner === s && p.kind === "king") && g.ec.cities.some((c) => c.owner === s), `место ${s}: Вождь и столица`);
}
// --- союзника бить нельзя
{
  const g = mk("m01", "2v2"), a = g.pieces.find((p) => p.owner === 0 && p.kind !== "king")!, b = g.pieces.find((p) => p.owner === 2 && p.kind !== "king")!;
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < g.size && y < g.size && !g.pieces.some((p) => p.x === x && p.y === y);
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [a.x + dx, a.y + dy]).find(([x, y]) => free(x, y));
  if (spot) { b.x = spot[0]; b.y = spot[1]; }
  ok(!!spot && !apply(g, 0, { a: "attack", id: a.id, x: b.x, y: b.y }).ok, "удар по союзнику отклонён");
}
// --- цель «Цареубийство»: первые Вожди ВСЕХ соперников; общая на команду
{
  const g = mk("m01", "2v2"), list = goalCfg(g, C).list, gid = list.find((x: string) => /chief|regic|king/.test(x));
  ok(!!gid, "в целях есть цель про Вождя: " + gid);
  const ev: any[] = [];
  g.ec.chief[1].hist[0].died = 3; g.ec.chief[1].hist[0].by = 0; chiefGoalCheck(g, ev, C);
  ok(!teamGoals(g, 0).includes(gid!), "один из двух соперников — цель ещё не выполнена");
  ok(chiefBlacklist(g, 0).length === 2 && chiefBlacklist(g, 0).filter((r) => !r.alive).length === 1, "«чёрный список»: 2 записи, 1 вычеркнут");
  g.ec.chief[3].hist[0].died = 4; g.ec.chief[3].hist[0].by = 2; chiefGoalCheck(g, ev, C);
  ok(teamGoals(g, 0).includes(gid!) && g.ec.goals[0].includes(gid!) && g.ec.goals[2].includes(gid!), "оба первых Вождя — цель у всей команды A");
  ok(!teamGoals(g, 1).includes(gid!), "у команды B цели нет");
  const g2 = mk("m05", "ffa4");
  for (const s of [1, 2]) { g2.ec.chief[s].hist[0].died = 2; g2.ec.chief[s].hist[0].by = 0; } chiefGoalCheck(g2, [], C);
  ok(!g2.ec.goals[0].includes(gid!), "«Все ×4»: 2 из 3 — не выполнена");
  g2.ec.chief[3].hist[0].died = 5; g2.ec.chief[3].hist[0].by = 1; chiefGoalCheck(g2, [], C);
  ok(g2.ec.goals[0].includes(gid!), "чужое убийство засчитывается (chiefAnyKiller), прогресс не сбрасывается");
}
// --- сдача: 2×2 — фигуры союзнику, партия идёт; «Все» — место снимается; осталась одна команда — победа
{
  const g = mk("m01", "2v2"), before = g.pieces.filter((p) => p.owner === 2 && p.kind !== "king").length, mine0 = g.pieces.filter((p) => p.owner === 0).length;
  const r = apply(g, 2, { a: "surrender" }); // не его ход — сдаться можно
  ok(r.ok && isOut(g, 2) && g.winner === -1, "2×2: сдача вне хода, партия продолжается");
  ok(!g.pieces.some((p) => p.owner === 2) && g.pieces.filter((p) => p.owner === 0).length === mine0 + before, "фигуры сдавшегося (кроме Вождя) — союзнику");
  ok(!g.ec.cities.some((c) => c.owner === 2) && g.ec.cities.filter((c) => c.owner === 0 && c.cap).length === 1, "города — союзнику, столица у него одна");
  end(g); end(g); ok(g.cur === 3, "выбывший пропускается в очереди (0→1→3)");
  apply(g, 0, { a: "surrender" }); ok(g.winner === 1 && g.reason === "forfeit", "сдалась вся команда — победа другой");
}
{
  const g = mk("m05", "ffa4"); end(g); ok(g.cur === 1, "FFA: ход у 1");
  apply(g, 1, { a: "surrender" }); ok(isOut(g, 1) && g.cur === 2 && !g.pieces.some((p) => p.owner === 1), "FFA: сдался ходящий — фигуры сняты, ход дальше");
  ok(nextSeat(g, 0) === 2 && nextSeat(g, 3) === 0, "FFA: круг обходит выбывших");
  apply(g, 3, { a: "surrender" }); ok(g.winner === -1, "двое осталось — партия идёт");
  apply(g, 2, { a: "surrender" }); ok(g.winner === 0 && JSON.stringify(g.place) === "[1,3,2]", "последний оставшийся победил; порядок выбывания в place");
  ok(!apply(g, 2, { a: "surrender" }).ok, "после конца — нельзя");
}
// --- итог на лимите ходов: больше целей; поровну — ничья (drawCode)
{
  const g = mk("m05", "ffa4"); ok(drawCode(g) === 100 && isDraw(g, 100) && !seatWon(g, 0, 100), "FFA: код ничьей 100");
  g.ec.goals[2].push("treasury"); ok(limitWinner(g, C) === 2, "у места 2 больше целей — оно впереди");
  const h = mk("m01", "2v2"); ok(drawCode(h) === 2, "2×2: ничья = 2 (как в 1×1)");
  h.ec.goals[1].push("treasury"); h.ec.goals[3].push("treasury"); ok(limitWinner(h, C) === 1 && seatWon(h, 3, 1) && !seatWon(h, 0, 1), "2×2: побеждает команда B — оба её места");
}
// --- обмен союзников: предложение → согласие; лимиты
{
  const g = mk("m01", "2v2"); g.ec.res[0].gold = 20; g.ec.res[0].know = 0; g.ec.res[2].gold = 0; g.ec.res[2].know = 20;
  ok(!apply(g, 0, { a: "trade", to: 1, give: { gold: 4 }, get: { know: 3 } } as any).ok, "обмен с соперником — нет");
  ok(!apply(g, 0, { a: "trade", to: 2, give: { gold: 3 }, get: {} } as any).ok, "передачи союзнику без встречной оплаты — нет");
  ok(!apply(g, 0, { a: "trade", to: 2, give: { gold: 6 }, get: { know: 2 } } as any).ok, "курс 3:1 — нет");
  ok(!apply(g, 0, { a: "trade", to: 2, give: { gold: 8 }, get: { know: 6 } } as any).ok, "больше 30% запаса — нет");
  const r = apply(g, 0, { a: "trade", to: 2, give: { gold: 4 }, get: { know: 3 } } as any);
  ok(r.ok && g.ec.offers?.length === 1 && g.ec.res[0].gold === 20, "предложение создано, ресурсы ещё не ушли");
  const id = g.ec.offers![0].id;
  ok(!apply(g, 1, { a: "trade_reply", id, ok: true }).ok, "чужой (соперник) принять не может");
  const a = apply(g, 2, { a: "trade_reply", id, ok: true });
  ok(a.ok && g.ec.res[0].gold === 16 && g.ec.res[0].know === 3 && g.ec.res[2].gold === 4 && g.ec.res[2].know === 17, "союзник принял вне своего хода — обмен прошёл");
  ok(validateTrade(g, 0, { to: 2, give: { gold: 2 }, get: { know: 1 } }, C, (x, y) => ally(g, x, y)) === "trade_done", "не больше 1 сделки за ход на пару");
  end(g); end(g); end(g); end(g);
  const r2 = apply(g, 0, { a: "trade", to: 2, give: { gold: 2 }, get: { know: 2 } } as any); ok(r2.ok, "в следующем ходу — снова можно");
  const g0 = g.ec.res[0].gold, id2 = g.ec.offers!.at(-1)!.id; ok(apply(g, 2, { a: "trade_reply", id: id2, ok: false }).ok && !g.ec.offers!.length && g.ec.res[0].gold === g0, "отказ — предложение снято, ресурсы на месте");
  const cfg2 = structuredClone(C) as any, g3 = mk("m01", "2v2"); g3.ec.res[0].gold = 20; g3.ec.res[2].know = 20; cfg2.econ.trade.maxShare = 0.5; cfg2.econ.trade.maxRatio = 3;
  ok(validateTrade(g3, 0, { to: 2, give: { gold: 9 }, get: { know: 3 } }, cfg2, (x, y) => ally(g3, x, y)) === null && validateTrade(g3, 0, { to: 2, give: { gold: 9 }, get: { know: 3 } }, C, (x, y) => ally(g3, x, y)) !== null, "лимиты (курс, доля запаса) — из админки econ.trade");
}
// --- вид клиенту: команды и выбывшие
{
  const g = mk("m01", "2v2"); apply(g, 3, { a: "surrender" }); const v: any = view(g, true, C);
  ok(v.np === 4 || v.tm || v.mode, "view отдаёт режим/команды");
}
// --- встроенные карты режимов (Лорендес)
{
  const want: Record<string, { mode: string; sizes: number[] }> = { m01: { mode: "2v2", sizes: [15] }, m02: { mode: "2v2", sizes: [35] }, m03: { mode: "2v2", sizes: [50] }, m04: { mode: "ffa3", sizes: [35, 50] }, m05: { mode: "ffa4", sizes: [35, 50] },
    m06: { mode: "ffa6", sizes: [75, 100] }, m07: { mode: "ffa8", sizes: [75, 100] }, m08: { mode: "ffa8", sizes: [75, 100] }, m09: { mode: "ffa6", sizes: [75, 100] } };
  for (const [id, w] of Object.entries(want)) {
    const m = showcaseMap(id)!; ok(!!m && m.mode === w.mode && w.sizes.includes(m.size), `${id} «${m?.name}»: ${w.mode}, ${m?.size}×${m?.size}`);
    const v = validateMap(m); ok(!v.errors.length, `${id}: карта корректна ${v.errors.join(",")}`);
    ok(spawnsOf(m).length === MODES[w.mode as ModeId].seats && !!seatSpawns(m, w.mode), `${id}: точек старта = мест`);
    const g = newGame(m.size, RS.slice(0, MODES[w.mode as ModeId].seats), 0, C, 0, m, { mode: w.mode as ModeId });
    const cnt = Array.from({ length: g.np! }, (_, s) => g.pieces.filter((p) => p.owner === s).length);
    ok(cnt.every((c) => c === cnt[0] && c > 0), `${id}: армии равны по местам (${cnt.join("/")})`);
    ok(!mapFits(m, "1v1") && mapFits(m, w.mode), `${id}: в лобби — только своего режима`);
  }
  ok(mapModes(showcaseMap("m01")!).includes("ffa4") && mapModes(showcaseMap("m05")!).includes("2v2"), "карта на 4 места подходит и 2×2, и «Все ×4»");
  for (const md of ["2v2", "ffa3", "ffa4", "ffa6", "ffa8"] as ModeId[]) ok(showcaseAll().filter((m) => mapFits(m, md)).length >= 1, `есть встроенная карта для ${md}`);
  ok(showcaseAll().filter((m) => /^s/.test(m.id)).every((m) => mapFits(m, "1v1")), "витрина 1×1 (s…) — по-прежнему 1×1");
}
// --- повтор: сдача и ответ на обмен идут через apply → повтор совпадает
{
  const m = showcaseMap("m01")!, g = mk("m01", "2v2"), log = startLog("t:1", g, C, m);
  const go = (s: number, a: any) => { const cur = g.cur, r = apply(g, s, a, C); if (r.ok) logAct(log, s, a, false, g, g.cur !== cur); return r.ok; };
  for (let i = 0; i < 12; i++) go(g.cur, { a: "end" }); // копим запасы (без ИИ — только «конец хода»)
  const gv = Math.floor(g.ec.res[0].gold * 0.3), kv = Math.min(g.ec.res[2].know, gv);
  ok(gv > 0 && kv > 0 && go(0, { a: "trade", to: 2, give: { gold: gv }, get: { know: Math.max(Math.ceil(gv / 2), kv) } }) && go(2, { a: "trade_reply", id: g.ec.offers!.at(-1)!.id, ok: true }), `обмен в логе (${gv} золота ↔ знания)`);
  go(0, { a: "end" }); go(1, { a: "end" }); go(3, { a: "surrender" }); go(2, { a: "end" }); go(1, { a: "end" });
  const R = rebuild(log, C, log.acts.length);
  ok(R.diverged < 0 && JSON.stringify(R.g.pieces) === JSON.stringify(g.pieces) && JSON.stringify(R.g.ec.res) === JSON.stringify(g.ec.res) && JSON.stringify(R.g.out) === JSON.stringify(g.out), "повтор 2×2 (обмен, сдача) совпадает с партией");
  const T = turnMarks(log); ok(T[0].from === 0 && T.at(-1)!.to === log.acts.length && T.every((t, i) => i === 0 || t.from === T[i - 1].to), "разметка ходов N мест непрерывна");
  ok(log.mode === "2v2" && log.races.length === 4, "в логе — режим и 4 расы");
}
console.log(fails ? `modes-test: ${fails} FAIL of ${n}` : `modes-test: ALL OK ${n}`);
if (fails) process.exit(1);
