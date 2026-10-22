// Опыт доски по разделам: день / неделя / месяц (% опыта уровня) и прибавка к обычному темпу игры.
// Запуск: bun tools/sim/board-xp.ts [часов игры в день=1.5]. Темп без доски — tools/sim/progression.mjs (часов на уровень).
// Модель «активного игрока»: каждый день — все случайные ежедневные (ступень 1), 3 заказа охоты (ступень 1), 1 личное задание
// персонажа, 3 ступени достижений; раз в неделю — все еженедельные (все ступени) и 2 тяжёлых; раз в месяц — все ежемесячные.
// Всё режется потолками разделов (caps, % уровня за период) — как на сервере (board.ts catCap).
import { BTASKS, BOARD_CFG, boardRefresh, boardOf, tierXp, tiersOf, catCap } from "../../server/meta/board";
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
const f = (x: number) => x.toFixed(1);
console.log(`Потолки (% уровня за период): ${JSON.stringify(BOARD_CFG.caps)} · множители: ${JSON.stringify(BOARD_CFG.xpMul)} · игра ${H} ч/день`);
console.log("| Ур. | Ежедн./день | Охота/день | Персонажи/день | Достиж./день | Еженед./неделя | Тяжёлые/неделя | Ежемес./месяц | Доска всего/день | Доска/неделя | Доска/месяц | Игра без доски/день | Прибавка |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.L} | ${f(r.day.daily)}% | ${f(r.day.hunt)}% | ${f(r.day.npc)}% | ${f(r.day.ach)}% | ${f(r.day.weekly * 7)}% | ${f(r.day.hard * 7)}% | ${f(r.day.monthly * 30)}% | ${f(r.total)}% | ${f(r.total * 7)}% | ${f(r.total * 30)}% | ${f(r.base)}% | +${f(r.plus)}% |`);
