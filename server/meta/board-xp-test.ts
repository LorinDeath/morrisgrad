// 📋 Точность опыта доски: сервер начисляет ровно то, что показывает карточка/трекер (база + каждый выполненный бонус),
// по телу-владельцу, без двойного начисления и дрейфа округления; переходы уровней и перенос остатка — точные.
// Ранги F…SS × периоды daily/weekly/monthly/hard/hunt; еженедельные = ежемесячные / 3.
// Запуск: esbuild server/meta/board-xp-test.ts --bundle --platform=node --format=esm --loader:.png=empty --outfile=/tmp/bxp.mjs && node /tmp/bxp.mjs (карточка — клиентский BoardStore)
import { BOARD_CFG, BTASKS, boardRefresh, boardClaim, boardOf, boardClient, boardDefs, makeRoll, RANKS, lockReason, needsTake, effOf } from "./board";
import { newAccount, newHero } from "./profile";
import { heroXpNeed, HERO_MAX_LEVEL } from "./shared";
import { BCHEST } from "./boardChestCfg";
import { BoardStore } from "../../src/pages/MorrisCurse/_core/meta/boardStore.js";
let f = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { console.log("FAIL " + m); f++; } else if (!/^·/.test(m)) console.log("PASS " + m); };
const tot = (h: any) => { let s = h.xp; for (let l = 1; l < h.lvl; l++) s += heroXpNeed(l); return s; }; // весь опыт тела с 1-го уровня
const capsKeep = JSON.parse(JSON.stringify(BOARD_CFG.caps || {})); for (const k of Object.keys(BOARD_CFG.caps || {})) BOARD_CFG.caps[k] = 0; // потолок — отдельно ниже
BCHEST.maxStore = 1e6;
BOARD_CFG.tutVetReward = false; // награды обучения опытному игроку (выдаются разом при boardRefresh) — проверяются в board-test, здесь мешали бы сверке опыта
const CATS = ["daily", "weekly", "monthly", "hard", "hunt"];
/** то, что видит игрок: карточка доски и трекер (BoardStore — тот же класс, что в клиенте) */
function shown(a: any, h: any, id: string) {
  const S = new BoardStore(() => {}); S.apply({ boardDefs: boardDefs(), board: boardClient(a, h) });
  const t = S.def(id); const base = S.xpOf(t, 0), B = S.bonuses(t), bon = B.filter((o: any) => o.st === "ok").reduce((s: number, o: any) => s + o.xp, 0);
  const line = S.rewardList(t, 0).join(" · ");
  return { base, bon, sum: base + bon, line, B };
}
function pick(a: any, h: any, cat: string, ctx: any, used: Set<string>) {
  const b = boardOf(a); const pool = Object.values(BTASKS).filter((t: any) => t.cat === cat && t.on !== false && t.ev === "kill" && !used.has(t.id) && !lockReason(a, t as any, h.lvl));
  const t: any = pool.find((t: any) => (b.sel[cat] || []).includes(t.id)) || pool[0]; if (!t) return null;
  if (cat !== "hunt" && !(b.sel[cat] || []).includes(t.id)) b.sel[cat] = [t.id, ...(b.sel[cat] || [])];
  if (cat === "hunt") { b.sel.hunt = [t.id, ...(b.sel.hunt || [])]; if (needsTake(t) && !b.tk.includes(t.id)) b.tk.push(t.id); }
  return t;
}
let seed = 99; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
const rows: string[] = []; let mism = 0, cases = 0;
for (const cat of CATS) for (const rank of RANKS) for (const lvl0 of [5, 14, 27]) {
  const a: any = newAccount(); const W: any = newHero("warrior"); W.lvl = lvl0; W.xp = Math.floor(heroXpNeed(lvl0) * (0.5 + rnd() * 0.49)); // ближе к переходу уровня
  const M: any = newHero("mage"); M.lvl = 9; M.xp = 7; const ctx: any = { pkey: "uid:xp" + cat + rank + lvl0, heroes: { warrior: W, mage: M } }; a.hero = "warrior";
  boardRefresh(a, W, ctx); const t = pick(a, W, cat, ctx, new Set()); if (!t) { ok(false, `${cat} ${rank}: нет задания`); continue; }
  const b = boardOf(a); const R: any = makeRoll(t, W.lvl, "s|" + cat + rank + lvl0, t.id, ["warrior", "mage"], rank, "warrior", { warrior: W.lvl, mage: M.lvl });
  b.roll[t.id] = R; delete b.c[t.id]; b.p[t.id] = R.n; R.t1 = Date.now() - 1000; R.done = Date.now(); // выполнено (как bonusOnDone)
  R.bon.forEach((o: any, i: number) => { if (i === 1) o.ok = 0; }); // один бонус сорван — его опыт не идёт
  const s0 = shown(a, W, t.id), before = tot(W), lv0 = W.lvl, m0 = tot(M);
  const want = R.x + R.bon.filter((o: any) => o.ok).reduce((s: number, o: any) => s + o.xp, 0);
  const r: any = boardClaim(a, W, t.id, ctx); cases++;
  const got = tot(W) - before, maxed = W.lvl >= HERO_MAX_LEVEL;
  const good = r.ok && r.xp === s0.sum && r.xp === want && (maxed || got === s0.sum) && r.levelUps === W.lvl - lv0 && W.xp >= 0 && (maxed || W.xp < heroXpNeed(W.lvl)) && tot(M) === m0;
  if (!good) mism++;
  ok(good, `· ${cat} ${rank} L${lvl0}: карточка ${s0.base}+${s0.bon} = ${s0.sum}, сервер ${r.xp} (${r.err || ""}), тело +${got}, уровни +${r.levelUps}`);
  const t2 = tot(W), c2 = { ...boardOf(a).c }, r2: any = boardClaim(a, W, t.id, ctx);
  const other = Object.keys(boardOf(a).c).filter((k) => boardOf(a).c[k] !== c2[k]); // сдача обновляет доску: шаги обучения «уровень N» награждаются сами
  const tutXp = other.filter((k) => BTASKS[k]?.cat === "tut").reduce((s, k) => { let x = 0; for (let i = c2[k] || 0; i < boardOf(a).c[k]; i++) x += Number(BTASKS[k].x?.[i]) || 0; return s + x; }, 0);
  ok(!r2.ok && (boardOf(a).c[t.id] || 0) === (c2[t.id] || 0) && tot(W) - t2 === tutXp && other.every((k) => BTASKS[k]?.cat === "tut"), `· ${cat} ${rank} L${lvl0}: повтор — без начисления (${r2.err}; прочее +${tot(W) - t2} = обучение ${other.join(",") || "—"} +${tutXp})`);
  if (lvl0 === 14) rows.push(`${cat.padEnd(7)} ${rank.padEnd(2)} L${String(R.L).padStart(2)} d${R.d}: база ${String(s0.base).padStart(5)} + бонусы ${R.bon.filter((o: any) => o.ok).length}×${R.bon[0]?.xp ?? 0} = ${String(s0.sum).padStart(5)} → начислено ${String(r.xp).padStart(5)}, уровни +${r.levelUps} | «${s0.line}»`);
}
ok(mism === 0, `карточка = начисление = прирост опыта тела: ${cases - mism}/${cases} случаев (5 периодов × 8 рангов × 3 уровня), повтор не начисляет, другое тело не задето`);
// не выполнено: бонусы «до +N» не начисляются, пока задание не закрыто; закрыто — ровно их сумма
{ const a: any = newAccount(); const W: any = newHero("warrior"); W.lvl = 12; const ctx: any = { pkey: "uid:xpw", heroes: { warrior: W } }; a.hero = "warrior"; boardRefresh(a, W, ctx);
  const t = pick(a, W, "daily", ctx, new Set())!; const b = boardOf(a); const R: any = makeRoll(t, 12, "w", t.id, ["warrior"], "A", "warrior", { warrior: 12 }); b.roll[t.id] = R; b.p[t.id] = R.n - 1; delete b.c[t.id];
  const s = shown(a, W, t.id); ok(s.bon === 0 && s.B.every((o: any) => o.st === "wait") && /бонусы до \+/.test(s.line) === R.bon.length > 0, `в процессе: «${s.line}», бонусы ждут`);
  const e = effOf(b, t); ok(e.x[0] === R.x, `сервер до закрытия считает только базу ${e.x[0]} = ${R.x}`); }
// еженедельные = ежемесячные / 3 (тот же шаблон, уровень и ранг)
{ let worst = 0, m3 = ""; for (const t of Object.values(BTASKS).filter((t: any) => t.cat === "weekly" && t.ev === "kill").slice(0, 40) as any[]) for (const rank of RANKS) for (const L of [3, 12, 25]) {
    const w = makeRoll(t, L, "k", t.id, ["warrior"], rank, "warrior", { warrior: L }), m = makeRoll({ ...t, cat: "monthly" }, L, "k", t.id, ["warrior"], rank, "warrior", { warrior: L });
    if (w.L !== m.L || w.d !== m.d) continue; const dlt = Math.abs(w.x - m.x / 3); if (dlt > worst) { worst = dlt; m3 = `${t.id} ${rank} L${L}: неделя ${w.x}, месяц ${m.x} / 3 = ${(m.x / 3).toFixed(2)}`; } }
  ok(worst <= 1, `еженедельные = ежемесячные / 3 с точностью ≤ 1 опыта (наибольшее отличие ${worst.toFixed(2)}: ${m3}); множитель ${BOARD_CFG.xpMul.weekly}`); }
// потолок периода: сколько не вошло — сообщается, сумма = показанному
{ BOARD_CFG.caps.daily = 5; const a: any = newAccount(); const W: any = newHero("warrior"); W.lvl = 20; W.xp = 0; const tc0 = tot(W); const ctx: any = { pkey: "uid:xpc", heroes: { warrior: W } }; a.hero = "warrior"; boardRefresh(a, W, ctx);
  const t = pick(a, W, "daily", ctx, new Set())!; const b = boardOf(a); const R: any = makeRoll(t, 20, "c", t.id, ["warrior"], "SS", "warrior", { warrior: 20 }); b.roll[t.id] = R; b.p[t.id] = R.n; R.done = Date.now(); delete b.c[t.id];
  const s = shown(a, W, t.id), r: any = boardClaim(a, W, t.id, ctx); ok(r.ok && r.xp + r.cappedXp === s.sum && tot(W) - tc0 === r.xp, `потолок дня 5 %: показано ${s.sum} = начислено ${r.xp} + сверх потолка ${r.cappedXp}`); BOARD_CFG.caps.daily = 0; }
// последний уровень: опыт сверх — не копится (как и у боевого опыта)
{ const W: any = newHero("warrior"); W.lvl = HERO_MAX_LEVEL - 1; W.xp = heroXpNeed(W.lvl) - 3; const a: any = newAccount(); const ctx: any = { pkey: "uid:xpm", heroes: { warrior: W } }; a.hero = "warrior"; boardRefresh(a, W, ctx);
  const t = pick(a, W, "monthly", ctx, new Set())!; const b = boardOf(a); const R: any = makeRoll(t, W.lvl, "m", t.id, ["warrior"], "SS", "warrior", { warrior: W.lvl }); b.roll[t.id] = R; b.p[t.id] = R.n; R.done = Date.now(); delete b.c[t.id];
  const r: any = boardClaim(a, W, t.id, ctx); ok(r.ok && W.lvl === HERO_MAX_LEVEL && W.xp === 0 && r.levelUps === 1, `${HERO_MAX_LEVEL - 1}→${HERO_MAX_LEVEL}: +${r.xp}, уровень ${W.lvl}, остаток ${W.xp} (на последнем уровне опыт не копится)`); }
// задания с прогрессом «по состоянию» (уровень/состояние/авто) в периодах: бонусы у них не закрываются событием
{ const st = Object.values(BTASKS).filter((t: any) => ["daily", "weekly", "monthly", "hard", "hunt"].includes(t.cat) && (t.ev === "st" || t.ev === "lvl" || t.auto)).map((t: any) => t.id);
  const withBon = st.filter((id) => RANKS.some((r) => makeRoll(BTASKS[id], 20, "q" + r, id, ["warrior", "mage"], r, "warrior", { warrior: 20, mage: 10 }).bon.length));
  ok(!withBon.length, `периодические «по состоянию» (${st.join(", ") || "—"}) без бонусов — «бонусы до +N» у них не висят невыполнимо${withBon.length ? ": " + withBon : ""}`); }
for (const [k, v] of Object.entries(capsKeep)) BOARD_CFG.caps[k] = v;
console.log("\nТаблица (герой ур. 14):\n" + rows.join("\n"));
console.log(f ? `FAILED ${f}` : `board-xp ok (${n} проверок)`); process.exit(f ? 1 : 0);
