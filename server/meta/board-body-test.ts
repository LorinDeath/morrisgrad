// Задания тел: достижения — на профиль (тело считается по своим данным, пока играете другим), повторяющиеся — у каждого тела свои,
// задание «Выполнить на: X» считается только на X, сдаётся и награждает тело-владельца.
import { BTASKS, boardEvent, boardRefresh, boardOf, boardClaim, makeRoll, BOARD_CFG } from "./board";
import { newAccount, newHero } from "./profile";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const T0 = Date.now() - 10000; // boardClaim сверяет период по текущему времени
const a: any = newAccount(); const W: any = newHero("warrior"), M: any = newHero("mage"); W.lvl = 4; M.lvl = 3;
const heroes = { warrior: W, mage: M }; const ctx = { pkey: "uid:body1", heroes };
a.hero = "warrior"; boardRefresh(a, W, ctx, T0); a.hero = "mage"; boardRefresh(a, M, ctx, T0);
// 1) достижение тела — на профиль: Велес (warrior) растёт, пока играем Мариэль (mage)
{ const id = "ach_cls_lvl_warrior"; ok(BTASKS[id], "есть достижение тела"); const c0 = boardOf(a).c[id] || 0;
  W.lvl = 10; a.hero = "mage"; boardRefresh(a, M, ctx);
  const b = boardOf(a); ok(b.cur === "mage", "сейчас тело mage"); ok((b.p[id] || 0) >= 10, `прогресс достижения warrior виден на mage: ${b.p[id]}`);
  const r = boardClaim(a, M, id, ctx); ok(r.ok && (boardOf(a).c[id] || 0) > c0, "ступени достижения warrior сданы, играя mage: " + (r.err || r.tiers)); }
{ const id = "ach_cls_kill_warrior"; a.hero = "warrior"; for (let i = 0; i < 3; i++) boardEvent(a, W, { type: "kill", mob: "bat", kind: "bat", lvl: 10, cls: "warrior" }, ctx);
  const p = boardOf(a).p[id]; a.hero = "mage"; for (let i = 0; i < 5; i++) boardEvent(a, M, { type: "kill", mob: "bat", kind: "bat", lvl: 10, cls: "mage" }, ctx);
  ok(p === 3 && boardOf(a).p[id] === 3, `победы warrior (${p}) не меняются от побед mage и видны на mage`); }
// 2) у каждого тела свой набор и свой сброс
{ a.hero = "warrior"; const sw = JSON.stringify(boardOf(a).sel); a.hero = "mage"; const sm = JSON.stringify(boardOf(a).sel);
  ok(sw !== sm, "наборы warrior и mage разные"); ok(boardOf(a).bod?.warrior && !boardOf(a).bod?.mage, "набор warrior отложен, mage — текущий");
  // сдвигаем период ежедневных только у warrior
  a.hero = "warrior"; const bw = boardOf(a); const dW = [...bw.sel.daily]; bw.per.daily = "old"; bw.p[dW[0]] = 1;
  a.hero = "mage"; const dM = [...boardOf(a).sel.daily], pM = boardOf(a).per.daily;
  a.hero = "warrior"; boardRefresh(a, W, ctx); const bw2 = boardOf(a);
  ok(bw2.per.daily !== "old" && !(bw2.p[dW[0]] > 0), "warrior: ежедневные сброшены (новый период, прогресс обнулён)");
  a.hero = "mage"; ok(JSON.stringify(boardOf(a).sel.daily) === JSON.stringify(dM) && boardOf(a).per.daily === pM, "mage: набор и период не тронуты"); }
// 3) «Выполнить на: mage» у задания warrior
{ a.hero = "warrior"; const b = boardOf(a); const id = b.sel.daily.find((x: string) => BTASKS[x].ev === "kill" && !BTASKS[x].f && !BTASKS[x].m && W.lvl <= BTASKS[x].maxLvl) || "d_kill_b";
  if (!b.sel.daily.includes(id)) b.sel.daily.push(id);
  b.roll[id] = makeRoll(BTASKS[id], W.lvl, "x|" + id, id, ["warrior", "mage"], "D", "warrior", { warrior: W.lvl, mage: M.lvl }, "mage"); b.p[id] = 0;
  const R = b.roll[id]; ok(R.rb === "mage", "у задания warrior условие на mage"); const need = R.n, lv = R.minL || 1;
  boardEvent(a, W, { type: "kill", mob: "bat", kind: "bat", lvl: lv + 5, cls: "warrior" }, ctx); ok(!(boardOf(a).p[id] > 0), "победа warrior не засчитана");
  a.hero = "mage"; for (let i = 0; i < need; i++) boardEvent(a, M, { type: "kill", mob: "bat", kind: "bat", lvl: lv + 5, cls: "mage" }, ctx);
  ok(boardOf(a).bod?.warrior?.p[id] === need, `победы mage засчитаны заданию warrior: ${boardOf(a).bod?.warrior?.p[id]}/${need}`);
  ok(!boardClaim(a, M, id, ctx, T0 + 7000).ok, "сдать на mage нельзя (задание warrior)");
  const mx = M.xp, ml = M.lvl; a.hero = "warrior";  const wx = W.xp, wl = W.lvl; const r = boardClaim(a, W, id, ctx);
  ok(r.ok, "сдано на warrior: " + (r.err || "")); ok(W.xp !== wx || W.lvl !== wl, "опыт — warrior"); ok(M.xp === mx && M.lvl === ml, "у mage опыт не изменился"); }
console.log(f ? `FAILED ${f}` : "board-body ok"); process.exit(f ? 1 : 0);
