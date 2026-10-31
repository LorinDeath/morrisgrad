// nice bun server/strat/coins-test.ts
import { coinsFor } from "./coins";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const b = { league: "quick", rated: true, won: true, reason: "goals", turns: 20, winnerGoals: 3, loserGoals: 0 };
ok(coinsFor({ ...b, loserGoals: 2 }) === 5 && coinsFor({ ...b, loserGoals: 1 }) === 4 && coinsFor(b) === 3, "3–2 → 5, 3–1 → 4, 3–0 → 3");
ok(coinsFor({ ...b, reason: "forfeit", winnerGoals: 1, loserGoals: 0 }) === 1 && coinsFor({ ...b, reason: "claim", winnerGoals: 2, loserGoals: 2 }) === 2 && coinsFor({ ...b, reason: "away", winnerGoals: 0 }) === 0, "сдача/забрать победу: 1 цель → 1, 2 → 2, 0 → 0");
ok(coinsFor({ ...b, rated: false }) === 0 && coinsFor({ ...b, won: false }) === 0, "только победитель рейтинговой");
ok(coinsFor({ ...b, reason: "forfeit", winnerGoals: 2, turns: 4 }) === 0, "сдача до 5-го хода → 0");
ok(coinsFor({ ...b, reason: "forfeit", winnerGoals: 2, turns: 7 }) === 0, "ходы 5–9: 2 × 0,25 = 0,5 → 0 (вниз)");
ok(coinsFor({ ...b, league: "normal" }) === 15 && coinsFor({ ...b, league: "tactical", loserGoals: 2 }) === 75, "лига ×5 / ×15");
ok(coinsFor({ ...b, league: "normal", reason: "forfeit", winnerGoals: 2, turns: 7 }) === 2, "Обычная, сдача на 7-м: 2×5=10 ×0,25 = 2,5 → 2 (лига до раннего множителя)");
ok(coinsFor({ ...b, league: "tactical", reason: "forfeit", winnerGoals: 1, turns: 9 }) === 3 && coinsFor({ ...b, league: "tactical", reason: "forfeit", winnerGoals: 1, turns: 10 }) === 15, "Тактическая: 15×0,25 → 3; с 10-го хода — 15");
console.log(`coins: ${pass} ok, ${fail} fail`); if (fail) process.exit(1);
