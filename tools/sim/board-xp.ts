// Опыт доски по разделам: день / неделя / месяц (% опыта уровня) и прибавка к обычному темпу игры.
// Запуск: bun tools/sim/board-xp.ts [часов игры в день=1.5]. Темп без доски — tools/sim/progression.mjs (часов на уровень).
// Опыт задания — фиксированное число от уровня ЗАДАНИЯ (таблица «уровень × сложность» × множитель раздела), не от уровня героя.
// Модель «активного игрока»: каждый день — все случайные ежедневные (ступень 1), 3 заказа охоты (ступень 1), 1 личное задание
// персонажа, 3 ступени достижений; раз в неделю — все еженедельные (все ступени) и 2 тяжёлых; раз в месяц — все ежемесячные.
// Потолки (caps) — как на сервере (board.ts catCap); 0 = без потолка.
import { BTASKS, BOARD_CFG, boardRefresh, boardOf, tierXp, tiersOf, catCap, xpPct } from "../../server/meta/board";
import { newAccount, newHero } from "../../server/meta/profile";
import { heroXpNeed } from "../../server/meta/defs";
const H = Number(process.argv[2]) || 1.5;
const PER_LEVEL: Record<number, number> = { 5: 0.213, 10: 0.567, 15: 1.382, 20: 2.446, 24: 2.599 }; // часов на уровень (progression.mjs, 20 прогонов)
const L_LIST = [5, 10, 15, 20, 24], SEEDS = 60;
const avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const sumT = (t: any, L: number, all: boolean) => { const n = all ? tiersOf(t).length : 1; let s = 0; for (let i = 0; i < n; i++) s += tierXp(t, i, L); return s; };
const rows: any[] = [];
for (const L of L_LIST) {
  const need = heroXpNeed(L), pct = (x: number) => (x / need) * 100;
  const d: number[] = [], w: number[] = [], m: number[] = [], h: number[] = [];
  for (let s = 0; s < SEEDS; s++) {
    const a: any = newAccount(); a.hero = "warrior"; const hero: any = newHero("warrior"); hero.lvl = L;
    boardRefresh(a, hero, { pkey: "uid:sim" + s } as any); const b = boardOf(a);
    d.push(Math.min(catCap("daily", L) || 1e12, (b.sel.daily || []).reduce((x: number, id: string) => x + sumT(BTASKS[id], L, false), 0)));
    w.push(Math.min(catCap("weekly", L) || 1e12, (b.sel.weekly || []).reduce((x: number, id: string) => x + sumT(BTASKS[id], L, true), 0)));
    m.push(Math.min(catCap("monthly", L) || 1e12, (b.sel.monthly || []).reduce((x: number, id: string) => x + sumT(BTASKS[id], L, true), 0)));
    h.push(Math.min(catCap("hunt", L) || 1e12, (b.sel.hunt || []).slice(0, 3).reduce((x: number, id: string) => x + sumT(BTASKS[id], L, false), 0)));
  }
  const avail = (c: string) => Object.values(BTASKS).filter((t) => t.cat === c && t.on && t.minLvl <= L && (t.maxLvl || 30) >= L);
  const npc = Math.min(catCap("npc", L) || 1e12, avg(avail("npc").map((t) => tierXp(t, 0, L))));
  const hard = Math.min(catCap("hard", L) || 1e12, 2 * avg(avail("hard").map((t) => tierXp(t, 0, L))));
  const ach = Math.min(catCap("ach", L) || 1e12, 3 * avg(avail("ach").map((t) => tierXp(t, 0, L))));
  const day = { daily: pct(avg(d)), hunt: pct(avg(h)), npc: pct(npc), ach: pct(ach), weekly: pct(avg(w)) / 7, hard: pct(hard) / 7, monthly: pct(avg(m)) / 30 };
  const total = Object.values(day).reduce((s, x) => s + x, 0), base = (H / PER_LEVEL[L]) * 100;
  rows.push({ L, day, total, base, plus: (total / base) * 100 });
}
// Без потолка (решение Алекса): охота — фарм, пока есть заказы; тяжёлые, достижения, личные задания — разовые (запас на всю игру).
// Охота: опыт заказа на одно убийство (все ступени / убийств до последней ступени) × убийств в час (progression.mjs: ~425/ч).
const KPH = 425, farm: any[] = [];
for (const L of L_LIST) {
  const need = heroXpNeed(L), H0 = (1 / PER_LEVEL[L]) * 100; // % уровня в час без доски
  const hk = Object.values(BTASKS).filter((t) => t.cat === "hunt" && t.on && t.ev === "kill" && t.minLvl <= L && (t.lvl <= 0 || t.lvl <= L + 6));
  const perKill = avg(hk.map((t) => sumT(t, L, true) / tiersOf(t)[tiersOf(t).length - 1]));
  const one = (c: string) => Object.values(BTASKS).filter((t) => t.cat === c && t.on).reduce((s, t) => s + sumT(t, Math.max(L, t.minLvl), true), 0) / need * 100;
  farm.push({ L, base: H0, h1: (perKill * KPH / need) * 100, h6: (perKill * KPH * 6 / need) * 100, hard: one("hard"), ach: one("ach"), npc: one("npc"), hunt: one("hunt") });
}
const f = (x: number) => x.toFixed(1);
console.log(`Потолки (% уровня за период): ${JSON.stringify(BOARD_CFG.caps)} · множители: ${JSON.stringify(BOARD_CFG.xpMul)} · игра ${H} ч/день`);
console.log("| Ур. | Ежедн./день | Охота/день | Персонажи/день | Достиж./день | Еженед./неделя | Тяжёлые/неделя | Ежемес./месяц | Доска всего/день | Доска/неделя | Доска/месяц | Игра без доски/день | Прибавка |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.L} | ${f(r.day.daily)}% | ${f(r.day.hunt)}% | ${f(r.day.npc)}% | ${f(r.day.ach)}% | ${f(r.day.weekly * 7)}% | ${f(r.day.hard * 7)}% | ${f(r.day.monthly * 30)}% | ${f(r.total)}% | ${f(r.total * 7)}% | ${f(r.total * 30)}% | ${f(r.base)}% | +${f(r.plus)}% |`);
console.log("");
console.log("Фарм без потолка, % уровня в час игры (охота) и разовый запас (тяжёлые, достижения, персонажи — сумма всех ступеней, в уровнях героя данного уровня):");
console.log("| Ур. | Игра без доски, %/ч | Охота: 1 заказ на цель, %/ч | Охота: 6 заказов сразу (верхняя граница), %/ч | Прибавка охоты (1 / 6) | Охота, всего (заказ не повторяется после последней ступени) | Тяжёлые, всего | Достижения, всего | Персонажи, всего |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of farm) console.log(`| ${r.L} | ${f(r.base)}% | ${f(r.h1)}% | ${f(r.h6)}% | +${f(r.h1 / r.base * 100)}% / +${f(r.h6 / r.base * 100)}% | ${f(r.hunt)}% | ${f(r.hard)}% | ${f(r.ach)}% | ${f(r.npc)}% |`);

// Сколько опыта даёт задание каждого уровня и сколько таких нужно на уровень героя того же уровня
console.log("");
console.log("Опыт задания по уровню задания и сложности (без множителя раздела), и сколько заданий сложности 3 нужно на уровень героя того же уровня по разделам:");
const CATS2 = ["daily", "weekly", "monthly", "hunt", "npc", "hard", "ach"] as const;
console.log(`| Ур. задания | Опыт на уровень | сл.1 | сл.2 | сл.3 | сл.4 | сл.5 | ${CATS2.map((c) => `${c} ×${BOARD_CFG.xpMul[c]}: заданий/ур.`).join(" | ")} |`);
console.log("|" + "---|".repeat(7 + CATS2.length));
for (const L of [1, 3, 5, 8, 10, 12, 15, 18, 20, 22, 25]) {
  const need = heroXpNeed(L), x = [1, 2, 3, 4, 5].map((d) => Math.round(need * xpPct(L, d) / 100));
  console.log(`| ${L} | ${need} | ${x.join(" | ")} | ${CATS2.map((c) => { const v = x[2] * (BOARD_CFG.xpMul[c] ?? 1); return v > 0 ? (need / v).toFixed(1) : "—"; }).join(" | ")} |`);
}
console.log("");
console.log("Задания игры по уровню задания: количество и средний опыт ступени 1 (число):");
console.log("| Уровни задания | Ежедн. | Еженед. | Ежемес. | Охота | Персонажи | Тяжёлые | Достижения |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [a, b] of [[1, 4], [5, 9], [10, 14], [15, 19], [20, 24], [25, 30]]) {
  const cell = (c: string) => { const L = Object.values(BTASKS).filter((t) => t.cat === c && t.on && t.lvl >= a && t.lvl <= b); return L.length ? `${L.length} · ${Math.round(avg(L.map((t) => tierXp(t, 0))))}` : "—"; };
  console.log(`| ${a}–${b} | ${["daily", "weekly", "monthly", "hunt", "npc", "hard", "ach"].map(cell).join(" | ")} |`);
}
