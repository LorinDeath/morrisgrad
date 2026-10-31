// Баланс-симулятор: бот против бота, Огонь против Льда. nice bun tools/strat/sim.ts [партий на размер=400] [размеры=8,15]
// Стороны и первый ход чередуются (каждая раса поровну играет снизу/сверху и первой/второй); карта меняется раз в 4 партии, чтобы не коррелировать с расой.
import { newGame, apply, botAction, makeMap, officialMaps, STRAT_CFG as BASE, type Race } from "../../server/strat/rules";
import { deepMerge } from "../../server/strat/econ-cfg";
// SIM_CFG='{"elementBonus":0}' — правки поверх конфига (как из админки)
const STRAT_CFG = deepMerge(BASE, process.env.SIM_CFG ? JSON.parse(process.env.SIM_CFG) : {});
const N = +(process.argv[2] || 400), sizes = (process.argv[3] || "8,15").split(",").map(Number);
const out: any = {};
for (const s of sizes) {
  const maps = officialMaps(s).map((o) => o.id);
  const st = { games: 0, fire: 0, ice: 0, draw: 0, first: 0, reasons: {} as Record<string, number>, turns: 0, glory: [0, 0], techs: 0, recruits: 0, outposts: 0, bad: 0, maxGlory: 0, unfinished: 0, claims: 0, autoGrow: 0, tcap: 0, foundStart: 0, towers: 0, razed: 0 };
  for (let i = 0; i < N; i++) {
    const races: [Race, Race] = i % 2 ? ["fire", "ice"] : ["ice", "fire"], first = (Math.floor(i / 2) % 2) as 0 | 1;
    const g = newGame(s, races, first, STRAT_CFG, null, makeMap(s, maps[Math.floor(i / 4) % maps.length]));
    for (let k = 0; k < 20000 && g.winner === -1; k++) {
      const a = botAction(g, g.cur, STRAT_CFG); const r = apply(g, g.cur, a, STRAT_CFG);
      if (r.ok) { for (const e of r.ev) { if (e.e === "recruit") st.recruits++; if (e.e === "tech") st.techs++; if (e.e === "found") st.outposts++; if (e.e === "tgrow") (e as any).auto ? st.autoGrow++ : st.claims++; if (e.e === "tcap") st.tcap++; if (e.e === "found_start") st.foundStart++; if (e.e === "build" && (e as any).tower) st.towers++; if (e.e === "bdestroy") st.razed++; } }
      else { st.bad++; apply(g, g.cur, { a: "end" }, STRAT_CFG); }
    }
    if (g.winner === -1) st.unfinished++;
    st.games++; st.turns += g.turn; st.reasons[g.reason] = (st.reasons[g.reason] || 0) + 1;
    if (g.winner === -1) {} else if (g.winner === 2) st.draw++; else { st[races[g.winner as 0 | 1]]++; if (g.winner === first) st.first++; }
    const fi = races.indexOf("fire"), ii = 1 - fi; st.glory[0] += g.ec.res[fi].glory; st.glory[1] += g.ec.res[ii].glory;
    st.maxGlory = Math.max(st.maxGlory, g.ec.res[0].glory, g.ec.res[1].glory);
  }
  const dec = st.fire + st.ice;
  out[s + "x" + s] = {
    games: st.games, fireWin: +(st.fire / st.games * 100).toFixed(1), iceWin: +(st.ice / st.games * 100).toFixed(1), draw: +(st.draw / st.games * 100).toFixed(1),
    fireOfDecisive: dec ? +(st.fire / dec * 100).toFixed(1) : 0, firstMoveWinOfDecisive: dec ? +(st.first / dec * 100).toFixed(1) : 0,
    reasons: st.reasons, avgTurns: +(st.turns / st.games).toFixed(1), avgGloryFire: +(st.glory[0] / st.games).toFixed(1), avgGloryIce: +(st.glory[1] / st.games).toFixed(1), maxGlory: st.maxGlory,
    perGame: { recruits: +(st.recruits / st.games).toFixed(1), techs: +(st.techs / st.games).toFixed(1), outposts: +(st.outposts / st.games).toFixed(2), foundStart: +(st.foundStart / st.games).toFixed(2), claims: +(st.claims / st.games).toFixed(2), autoGrow: +(st.autoGrow / st.games).toFixed(2), tcap: +(st.tcap / st.games).toFixed(2), towers: +(st.towers / st.games).toFixed(2), razed: +(st.razed / st.games).toFixed(2) }, badActions: st.bad, unfinished: st.unfinished,
  };
}
console.log(JSON.stringify(out, null, 1));
