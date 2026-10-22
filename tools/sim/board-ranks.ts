// Ранги F…SS: таблица (вес, +уровней, опыт, примеры), бонусные условия, счётчики по разделам, опыт за период у героя 5/10/20.
// Запуск: bun tools/sim/board-ranks.ts > ranks.md
import { BOARD_CFG, BTASKS, RANKS, BONUS_NAMES, makeRoll, boardRefresh, boardOf } from "../../server/meta/board";
import { newAccount, newHero } from "../../server/meta/profile";
import { heroXpNeed } from "../../server/meta/defs";
const R = BOARD_CFG.ranks, W = RANKS.reduce((a, r) => a + R[r].w, 0);
const ex = (id: string, lvl: number) => { const o: any = {}; for (let i = 0; i < 60000 && Object.keys(o).length < 8; i++) { const x = makeRoll(BTASKS[id], lvl, "s" + i, "k", ["warrior", "mage"]); if (!o[x.r]) o[x.r] = x; } return o; };
const e10 = ex("w_kill_b", 10), d10 = ex("d_kill_b", 10), e20 = ex("w_kill_c", 20);
const desc = (x: any) => !x ? "—" : `${x.f === "wboss" ? "мировые боссы ×" + x.n : x.n + " врагов " + x.minL + "+ ур."} · ${x.x} оп.${x.bon.length ? ` · бонусы ${x.bon.length}×${x.bon[0].xp}` : ""}`;
console.log("## Ранги\n\n| Ранг | Вес | Шанс | +уровней врагов | × опыта | × количества | Бонусов | Ежедневное «Разминка», герой 10 | Еженедельное «Неделя охоты», герой 10 | Еженедельное, герой 20 |\n|---|---|---|---|---|---|---|---|---|---|");
for (const r of RANKS) console.log(`| ${r} | ${R[r].w} | ${(R[r].w / W * 100).toFixed(1)}% | ${R[r].plus >= 0 ? "+" : ""}${R[r].plus} | ×${R[r].mul} | ×${R[r].cnt} | ${R[r].bon} | ${desc(d10[r])} | ${desc(e10[r])} | ${desc(e20[r])} |`);
console.log(`\nСверх ранга по разделам (+уровней): ${Object.entries(BOARD_CFG.catPlus).map(([c, v]) => c + " " + v).join(", ")}. Бонус: ${BOARD_CFG.bonusXp}% опыта ранга за каждое выполненное.`);
console.log("\nОпыт на уровень героя: " + [5, 10, 15, 20, 25].map((l) => `${l} → ${heroXpNeed(l)}`).join(", "));
console.log("\n## Бонусные условия (проверяет только сервер)\n");
for (const [k, n] of Object.entries(BONUS_NAMES)) console.log(`- **${k}** — ${n}${k === "fast" ? ` (мин.: ${Object.entries(BOARD_CFG.bonus.fast).filter(([c]) => c !== "on").map(([c, v]) => c + " " + v).join(", ")})` : k === "higher" ? ` (N = ${BOARD_CFG.bonus.higher.n})` : ""}`);
console.log("\n## Заданий по разделам\n\n| Раздел | Всего | Повторяющиеся (случайный пул) |\n|---|---|---|");
const C: any = {}; for (const t of Object.values(BTASKS)) C[t.cat] = (C[t.cat] || 0) + 1;
let tot = 0, rep = 0; for (const [c, n] of Object.entries(C) as [string, number][]) { const rp = ["daily", "weekly", "monthly", "hard", "hunt"].includes(c); tot += n; if (rp) rep += n; console.log(`| ${c} | ${n} | ${rp ? "да" : "нет"} |`); }
console.log(`| **итого** | **${tot}** | **${rep}** |`);
// опыт за период: 400 игроков, герой L, все выпавшие выполнены (без бонусов / со всеми бонусами)
console.log("\n## Опыт за набор периода (если выполнить всё выпавшее), среднее по 400 игрокам\n\n| Герой | Раздел | Заданий | Опыт (основное) | + все бонусы | % уровня (осн.) |\n|---|---|---|---|---|---|");
for (const L of [5, 10, 20]) { const acc: any = {};
  for (let i = 0; i < 400; i++) { const a: any = newAccount(); a.hero = "warrior"; const h: any = newHero("warrior"); h.lvl = L; boardRefresh(a, h, { pkey: "uid:sim" + L + "_" + i } as any); const b = boardOf(a);
    for (const c of ["daily", "weekly", "monthly", "hard"]) { const s = acc[c] || (acc[c] = { n: 0, x: 0, bx: 0 }); for (const id of b.sel[c] || []) { const r = b.roll[id]; if (!r) continue; s.n++; s.x += r.x; s.bx += r.bon.reduce((q, o) => q + o.xp, 0); } } }
  for (const c of ["daily", "weekly", "monthly", "hard"]) { const s = acc[c]; console.log(`| ${L} | ${c} | ${(s.n / 400).toFixed(1)} | ${Math.round(s.x / 400)} | ${Math.round(s.bx / 400)} | ${(s.x / 400 / heroXpNeed(L) * 100).toFixed(0)}% |`); } }
