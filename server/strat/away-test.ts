// nice bun server/strat/away-test.ts
import { readFileSync } from "node:fs";
import { turnMinutes, validTurnMin, canClaim } from "./away";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const exp: [number, number][] = [[4, 1], [5, 2], [8, 3], [10, 5], [15, 15], [30, 20], [50, 30], [100, 30], [3, 1]];
for (const [n, m] of exp) ok(turnMinutes(n) === m, `лимит хода ${n}×${n} = ${m} мин (${turnMinutes(n)})`);
ok(turnMinutes(12) === 9 && turnMinutes(40) === 25 && turnMinutes(6) > 2 && turnMinutes(6) < 3, "между опорами — линейно");
let mono = true; for (let n = 4; n < 100; n++) if (turnMinutes(n + 1) < turnMinutes(n)) mono = false; ok(mono, "не убывает с размером");
ok(validTurnMin(null) === null && validTurnMin(7) === 7 && validTurnMin(0) === undefined && validTurnMin(61) === undefined && validTurnMin("x") === undefined, "ввод хоста");
ok(!canClaim(true, 4) && canClaim(true, 5) && !canClaim(false, 9), "«Забрать победу»: только не за столом и 5 пропусков подряд");
const m = readFileSync(new URL("./match.ts", import.meta.url), "utf8");
ok(!/"disconnect"\)/.test(m), "обрыв связи не заканчивает партию");
ok(/reserve: \[0, 0\]/.test(m), "запаса времени нет");
ok(/case "claim"/.test(m) && /\{ a: "end" \}, true\)/.test(m), "авто-пропуск по будильнику + claim");
console.log(`away: ${pass} ok, ${fail} fail`); if (fail) process.exit(1);
