// Выполнимость бросков: каждое повторяющееся задание × каждый ранг × уровни героя 1,5,10,15,20,25.
// Проверяет: количество в пределах выполнимого, заголовок не противоречит n, окно уровня конкретного врага, опыт не убывает с рангом, S/SS с бонусами.
import { BTASK_LIST, makeRoll, RANKS, BOARD_CFG, noScale, feasCap, mobWindow, tiersOf } from "./board";
import { ZONE_MOBS } from "./defs";
let f = 0, pass = 0; const fails: string[] = [];
const ok = (c: any, m: string) => { if (c) pass++; else { f++; fails.push(m); } };
const W: Record<string, number> = { один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, сто: 100 };
const numIn = (s: string): number | null => {
  s = s.replace(/один удар|одним ударом|\d+\s*(минут|мин|волн|ур)\S*|[+]\d+/gi, ""); const d = s.match(/\d+/); if (d) return Number(d[0]);
  let v = 0, any = false; for (const w of s.toLowerCase().split(/[^а-яё]+/)) if (W[w] != null) { v += W[w]; any = true; }
  return any ? v : null;
};
const CATS = ["daily", "weekly", "monthly", "hard", "hunt"];
const LV = [1, 5, 10, 15, 20, 25];
let rolls = 0; const zeroBon: string[] = [];
for (const t of BTASK_LIST().filter((t) => CATS.includes(t.cat))) for (const lvl of LV) {
  if (lvl < (t.minLvl || 1) || lvl > (t.maxLvl || 30)) continue;
  if (!mobWindow(t, lvl)) continue; // в набор такого героя не попадает (это и проверяем ниже отдельно)
  const base = tiersOf(t)[0], multi = tiersOf(t).length > 1, mobL = t.ev === "kill" && t.m && !t.m.includes(":") ? (ZONE_MOBS as any)[t.m]?.lvl || 0 : 0;
  let prevX = -1;
  for (const r of RANKS) {
    const R = makeRoll(t, lvl, "seed|" + t.id + "|" + lvl, t.id, ["warrior"], r, "warrior"); rolls++;
    const tag = `${t.id} ур.${lvl} ${r}→${R.r} n=${R.n}`;
    if (!multi && R.f !== "wboss") {
      ok(R.n <= Math.max(base, feasCap(t)), `${tag}: n выше предела ${feasCap(t)}`);
      if (noScale(t)) ok(R.n === base, `${tag}: мета-задание не масштабируется (база ${base})`);
      const k = numIn(t.title); if (k != null && !/волн|\+|ур\./.test(t.title)) ok(k === R.n, `${tag}: заголовок «${t.title}» ≠ n`);
    }
    if (mobL) {
      ok(mobL >= lvl - (Number(BOARD_CFG.mobWin) || 3), `${tag}: враг ${mobL} ур. ниже окна`);
      const ri = RANKS.indexOf(R.r as any); if (ri >= 4) ok(mobL >= lvl + (Number(BOARD_CFG.ranks[R.r]?.plus) || 0), `${tag}: ранг ${R.r} за врага ${mobL} ур.`);
    }
    ok(R.x >= prevX, `${tag}: опыт ${R.x} < предыдущего ${prevX}`); prevX = R.x;
    if ((R.r === "S" || R.r === "SS") && !R.bon.length && t.ev !== "st") zeroBon.push(`${t.id}(${t.ev}) ${R.r}`);
  }
}
ok(!zeroBon.length, `S/SS без бонусов: ${zeroBon.length} — ${[...new Set(zeroBon)].join(", ")}`);
// окно: конкретный слабый враг не попадает в недельный/месячный набор
const low = BTASK_LIST().filter((t) => (t.cat === "weekly" || t.cat === "monthly") && t.ev === "kill" && t.m && !t.m.includes(":") && ((ZONE_MOBS as any)[t.m]?.lvl || 0) <= 5);
ok(low.length > 0 && low.every((t) => !mobWindow(t, 10)), `слабые враги (${low.length}) вне набора героя 10 ур.`);
for (const m of fails) console.log("FAIL " + m);
console.log(`бросков ${rolls}, проверок ${pass + f}, провалов ${f}`);
console.log(f ? "FAIL roll-feas" : "PASS roll-feas"); process.exit(f ? 1 : 0);
