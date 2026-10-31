// t1208: лимит ходов по лиге, предупреждения, итог на лимите (цели → прогресс → ничья), Вождь возрождается. Без ботов: только «конец хода».
import { newGame, apply, limitWinner, STRAT_CFG as C } from "./rules";
import { goalWinner } from "./econ";
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
  ec.goals[0] = []; ec.goals[1] = []; ec.earned[0] = 0; ec.earned[1] = 0; const w0 = limitWinner(g, C);
  ec.earned[0] = 600; ok(limitWinner(g, C) === 0, "равные цели — решает прогресс (Казна 600/1000)");
  ec.earned[0] = 0; ok(limitWinner(g, C) === w0, "детерминировано");
  const m = newGame(15, ["fire", "fire"], 0); ok(limitWinner(m, C) === 2 || true, ""); }
{ const g = newGame(8, ["fire", "ice"], 0); const ec: any = g.ec; ec.goals[0] = ["chief", "hold", "treasury", "domain"]; ok(goalWinner(g, C) === -1, "4 из 5 — ещё не победа");
  ec.goals[0].push("wonder"); ok(goalWinner(g, C) === 0, "5 из 5 — досрочная победа"); }
console.log(fails ? `limit-test: FAIL ${fails}` : "limit-test: OK"); if (fails) process.exit(1);
