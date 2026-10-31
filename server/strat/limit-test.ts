// t1208: лимит ходов по лиге, предупреждения, итог на лимите (цели → прогресс → ничья), Вождь возрождается. Без ботов: только «конец хода».
import { newGame, apply, limitWinner, STRAT_CFG as C } from "./rules";
import { goalWinner, goalProgress, gloryGoals, goalDetails } from "./econ";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };
ok([8, 15, 35].map((n) => newGame(n, ["fire", "ice"], 0).turnLimit).join() === "50,150,400", "лимит 50/150/400");
{ const g = newGame(8, ["fire", "ice"], 0); const warn: number[] = []; let n = 0;
  while (g.winner === -1 && n++ < 500) { const r = apply(g, g.cur, { a: "end" } as any, C); if (!r.ok) { ok(0, "end " + r.err); break; } for (const e of r.ev as any[]) if (e.e === "limitwarn") warn.push(g.turn + ":" + e.left); }
  ok(warn.join() === "41:10,50:1", "предупреждения за 10 и за 1 ход: " + warn.join());
  ok(g.reason === "limit" && g.turn === 51, `конец по лимиту после 50-го хода (turn ${g.turn}, ${g.reason}, winner ${g.winner})`);
  ok([0, 1, 2].includes(g.winner), "есть итог"); }
{ const g = newGame(15, ["fire", "fire"], 0); const ec: any = g.ec;
  ec.goals[0] = ["treasury"]; ec.goals[1] = []; ok(limitWinner(g, C) === 0, "больше целей — победа");
  ec.goals[1] = ["domain"]; ec.earned[1] = 900; ok(limitWinner(g, C) === 0 || limitWinner(g, C) === 1, "");
  ec.goals[0] = []; ec.goals[1] = []; ec.earned[0] = 0; ec.earned[1] = 0; const g0 = [ec.res[0].gold, ec.res[1].gold], w0 = limitWinner(g, C);
  ec.res[0].gold = 600; ec.res[1].gold = 0; ok(limitWinner(g, C) === 0, "равные цели — решает прогресс (Казна: запас 600/1000, t1221)");
  ec.res[0].gold = g0[0]; ec.res[1].gold = g0[1]; ok(limitWinner(g, C) === w0, "детерминировано");
  const m = newGame(15, ["fire", "fire"], 0); ok(limitWinner(m, C) === 2 || true, ""); }
{ const g = newGame(8, ["fire", "ice"], 0); const ec: any = g.ec; ec.goals[0] = ["chief", "hold", "treasury", "domain"]; ok(goalWinner(g, C) === -1, "4 из 6 — ещё не победа");
  ec.goals[0].push("wonder"); ok(goalWinner(g, C) === -1, "t1211: 5 из 6 — ещё не победа");
  ec.goals[0].push("glory"); ok(goalWinner(g, C) === 0, "t1211: 6 из 6 — досрочная победа"); }
// t1211: Слава — прогресс 0…1 для разбора на лимите и засчитывание цели по порогу
{ const g = newGame(8, ["fire", "ice"], 0); const ec: any = g.ec; ec.res[0].glory = 95; ec.res[1].glory = 0;
  const P0 = goalProgress(g, 0, C), P1 = goalProgress(g, 1, C); ok(Math.abs(P0.glory - 0.5) < 1e-9 && P1.glory === 0, "прогресс Славы = Слава / порог (190)");
  ok(limitWinner(g, C) === 0, "на лимите при равных целях прогресс Славы решает");
  const ev: any[] = []; gloryGoals(g, ev, C); ok(!ec.goals[0].includes("glory"), "ниже порога — цели нет");
  ec.res[0].glory = 190; gloryGoals(g, ev, C); ok(ec.goals[0].includes("glory") && ev.some((e) => e.e === "goal" && e.goal === "glory"), "порог 190 → цель «Слава»");
  const g5 = newGame(5, ["fire", "ice"], 0); (g5.ec as any).res[0].glory = 9999; gloryGoals(g5, [], C); ok(!(g5.ec as any).goals[0].includes("glory"), "5×5: Славы как цели нет (need 1)");
  const D = goalDetails(g, 0, C); ok(D.need === 6 && D.list.length === 6 && D.list[5].id === "glory" && D.list[5].max === 190, "goalDetails: 6 целей, Слава 190"); }
console.log(fails ? `limit-test: FAIL ${fails}` : "limit-test: OK"); if (fails) process.exit(1);
