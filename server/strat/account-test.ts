// Тест «Полководца»: кривая опыта и отсутствие игровых бонусов.  nice bun server/strat/account-test.ts
import { readFileSync } from "node:fs";
import { ACCOUNT_CFG as C, xpForLevel, levelOf, levelInfo, matchXp, LEVEL_XP } from "./account";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const act = (L: number) => xpForLevel(L) / C.perDayActive, cont = (L: number) => xpForLevel(L) / C.perDayContinuous;
ok(LEVEL_XP.length === 101 && xpForLevel(1) === 0, "100 уровней, L1 = 0");
let mono = true, steeper = true; for (let L = 2; L <= 100; L++) { if (xpForLevel(L) <= xpForLevel(L - 1)) mono = false; if (L > 2 && xpForLevel(L) - xpForLevel(L - 1) < xpForLevel(L - 1) - xpForLevel(L - 2)) steeper = false; }
ok(mono, "пороги строго растут"); ok(steeper, "каждый следующий уровень не дешевле предыдущего (плавно круче)");
ok(Math.abs(cont(100) / 365.25 - 15) < 0.01, `L100 = 15 лет непрерывной игры (${(cont(100) / 365.25).toFixed(2)})`);
const d65 = (xpForLevel(66) - xpForLevel(65)) / C.perDayActive;
ok(d65 > 28 && d65 < 32, `L65→66 у активного игрока ≈ месяц (${d65.toFixed(1)} дн.)`);
ok(act(5) <= 1.5 && act(10) <= 7, `первые уровни быстрые: L5 ${act(5).toFixed(1)} дн., L10 ${act(10).toFixed(1)} дн.`);
ok(xpForLevel(2) <= 15, "L2 — за одну короткую партию");
for (const L of [1, 2, 5, 10, 50, 99, 100]) { ok(levelOf(xpForLevel(L)) === L && (L === 1 || levelOf(xpForLevel(L) - 1) === L - 1), `levelOf(порог L${L})`); }
ok(levelOf(1e12) === 100 && levelInfo(1e12).frac === 1, "потолок 100");
ok(matchXp(30 * 60000, "win", 1) === 36 && matchXp(30 * 60000, "loss", 1) === 24 && matchXp(30 * 60000, "draw", 1) === 30, "XP = минуты × итог");
ok(matchXp(30 * 60000, "win", 0) === 0 && matchXp(30 * 60000, "win", 0.25) === 9, "xpMul (ранний конец/боты)");
ok(matchXp(1e10, "win", 1) === Math.floor(C.perMatchCap * 1.2), "потолок за партию");
// косметика: движок не знает про уровень аккаунта
for (const f of ["rules.ts", "econ.ts", "ai.ts", "ult.ts", "cfg.ts", "econ-cfg.ts", "content-cfg.ts", "terrain.ts", "tree-view.ts"]) {
  const src = readFileSync(new URL("./" + f, import.meta.url), "utf8");
  ok(!/from "\.\/account"|strat_profile|commander|acctLevel|accountLevel/.test(src), `${f}: нет зависимости от уровня Полководца`);
}
const m = readFileSync(new URL("./match.ts", import.meta.url), "utf8");
ok(!/fair/.test(m) && !/fair/.test(readFileSync(new URL("./rating.ts", import.meta.url), "utf8")), "«Честного боя» нет в match/rating");
console.log(`account: ${pass} ok, ${fail} fail`); if (fail) process.exit(1);
