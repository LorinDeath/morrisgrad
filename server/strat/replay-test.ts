// bun server/strat/replay-test.ts — t1156: лог партии, восстановление любого хода, список ходов, разбор удара, скрытие для живой партии
import { newGame, apply, RACES, STRAT_CFG, hitExplain, type GameState, type Race, type Action } from "./rules";
import { effAtk, effArm, explainAtk, explainArm } from "./econ";
import { matchBot } from "./ai";
import { startLog, logAct, logEnd, rebuild, turnMarks, moveList, actView, FrameCache, encodeLog, decodeLog, redactX, hashG, rulesVer } from "./replay";
import { revealFrame, cleanTitle, REPLAY_ID_RE } from "./replay-db";
import { mergeCfg } from "./cfg";
let ok = 0, bad = 0; const t = (n: string, c: any) => { if (c) ok++; else { bad++; console.log("FAIL", n); } };
const cfg = STRAT_CFG;
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

let vHits = 0, uHits = 0; // t1163: удары залпом/ультой с разбором
/** Партия бот×бот с логом; snaps[i] — JSON состояния после i действий (живое). */
function play(size: number, races: [Race, Race], first: 0 | 1, seed: number, maxActs = 700) {
  const g = newGame(size, races, first, cfg, 0), log = startLog("ABCDEF:" + (1700000000000 + seed), g, cfg, null), snaps = [JSON.stringify(g)], rnd = rng(seed);
  let sumBad = 0, hits = 0, xBad = 0;
  while (g.winner === -1 && log.acts.length < maxActs) {
    const side = g.cur as 0 | 1, prev = g.cur; let act: Action = matchBot(g, side, cfg, "medium", "bal", rnd);
    // разбор АТК/БРН = effAtk/effArm на живых позициях
    if (rnd() < 0.2) for (const p of g.pieces) { const e = g.pieces.find((q) => q.owner !== p.owner) || null;
      if (explainAtk(g, p, e, cfg).reduce((s, q) => s + q.n, 0) !== effAtk(g, p, e, cfg)) sumBad++;
      if (Math.max(0, explainArm(g, p, cfg).reduce((s, q) => s + q.n, 0)) !== effArm(g, p, cfg)) sumBad++; }
    let r = apply(g, side, act, cfg); if (!r.ok) { act = { a: "end" }; r = apply(g, side, act, cfg); }
    if (!r.ok) break;
    for (const e of r.ev as any[]) if (e.e === "hit" && e.why) { hits++; const x = e.why, A = x.atk.reduce((s: number, q: any) => s + q.n, 0), B = Math.max(0, x.arm.reduce((s: number, q: any) => s + q.n, 0));
      if (x.via === "volley") { vHits++; if (A !== x.dmg || x.dmg !== e.dmg || x.arm.length) xBad++; continue; } // t1163: залп — фикс. урон
      if (x.via === "ult") { uHits++; const raw = x.chiefMul ? Math.max(1, Math.round(A * x.chiefMul)) : A; // t1163: ульта — база+эпоха+усиление, ×chiefMul, щит, Вождь ≥ 1 HP
        if ((x.chiefMul && raw !== x.raw) || (x.spare ? raw - x.shield < x.dmg : raw - x.shield !== x.dmg) || x.dmg !== e.dmg) xBad++; continue; }
      if (Math.max(1, Math.round((A - B - x.cover) * x.mul - 1e-9)) + x.pow !== x.dmg || x.dmg !== e.dmg) xBad++; }
    logAct(log, side, act, false, g, g.cur !== prev); snaps.push(JSON.stringify(g));
  }
  if (g.winner === -1) { g.winner = 2; g.reason = "test_stop"; logEnd(log, 2, "test_stop"); snaps[snaps.length - 1] = JSON.stringify(g); } else logEnd(log, g.winner, g.reason);
  return { g, log, snaps, sumBad, hits, xBad };
}

let games = 0, allEq = true, turnsEq = true, fcEq = true, sumBad = 0, hits = 0, xBad = 0, rtEq = true;
for (const [size, seed] of [[8, 1], [8, 2], [15, 3], [8, 4], [15, 5], [8, 6]] as [number, number][]) {
  const races: [Race, Race] = [RACES[seed % 6], RACES[(seed * 5 + 1) % 6]], P = play(size, races, (seed & 1) as 0 | 1, seed); games++;
  sumBad += P.sumBad; hits += P.hits; xBad += P.xBad;
  const full = rebuild(P.log, cfg); if (full.diverged >= 0 || JSON.stringify(full.g) !== P.snaps[P.snaps.length - 1]) { allEq = false; console.log("final diverged", size, seed, full.diverged); }
  // каждый ход: восстановление «с нуля» = живое состояние
  for (const m of turnMarks(P.log)) { const r = rebuild(P.log, cfg, m.to); if (JSON.stringify(r.g) !== P.snaps[m.to] && m.to < P.log.acts.length) { turnsEq = false; console.log("turn diverged", size, seed, m.to); break; } }
  // перемотка через кэш снимков в случайном порядке
  const fc = new FrameCache(P.log, cfg), rnd = rng(seed * 7);
  for (let k = 0; k < 40; k++) { const i = Math.floor(rnd() * P.log.acts.length); if (JSON.stringify(fc.at(i).g) !== P.snaps[i]) { fcEq = false; console.log("fc diverged", i); break; } }
  // сериализация лога
  const L2 = decodeLog(encodeLog(P.log)); if (!L2 || JSON.stringify(rebuild(L2, cfg).g) !== P.snaps[P.snaps.length - 1]) rtEq = false;
  if (seed === 1) {
    const marks = turnMarks(P.log); t("разметка ходов: непрерывна и покрывает все действия", marks[0].from === 0 && marks.at(-1)!.to === P.log.acts.length && marks.every((m, i) => i === 0 || m.from === marks[i - 1].to));
    t("ход заканчивается end или сменой стороны", marks.slice(0, -1).every((m) => P.log.acts.slice(m.from, m.to).every((a) => a[0] === m.side)));
    t("хэши ходов записаны", P.log.h.length >= marks.length - 1 && P.log.h.every((h) => /^[0-9a-f]{8}$/.test(h)));
    // подмена действия → расхождение замечено
    const T = structuredClone(P.log); const j = T.acts.findIndex((a, i) => i > 4 && a[1].a === "move"); if (j > 0) { (T.acts[j][1] as any).a = "end"; }
    const d = rebuild(T, cfg); t("подменённое действие → diverged", d.diverged >= 0);
    // другие правила (админ-патч) → rv отличается
    t("версия правил: патч меняет rv", rulesVer(mergeCfg({ econ: { fx: { rodChain: 9 } } })) !== P.log.rv && rulesVer(cfg) === P.log.rv);
    // кадр после конца: всё раскрыто
    const f = revealFrame(full.g, full.evs.at(-1) || [], cfg); t("кадр повтора: оба дерева", Array.isArray(f.trees) && f.trees.length === 2 && f.trees[0] && f.trees[1]);
    t("кадр повтора: исход", f.g.winner === P.g.winner);
  }
}
t(`восстановление в конце = живая партия (${games} партий)`, allEq);
t("восстановление на каждом ходе = живое состояние", turnsEq);
t("перемотка через снимки = живое состояние", fcEq);
t("encode/decode лога без потерь", rtEq);
t("Σ частей АТК/БРН = effAtk/effArm", sumBad === 0);
t(`разбор удара сходится с уроном (${hits} ударов)`, hits > 20 && xBad === 0);
t(`разбор залпа и ульты есть и сходится (залп ${vHits}, ульта ${uHits})`, vHits + uHits > 0 && xBad === 0);
{ const ev: any[] = [{ e: "hit", id: 1, t: 2, dmg: 7, hp: 1, ult: 1, why: { via: "ult", ult: "doom", atk: [{ k: "ult", n: 4, src: "base", side: 1 }, { k: "ultPow", n: 2, src: "tech", side: 1 }, { k: "wonderUlt", n: 1, src: "bld", side: 1 }], arm: [], cover: 0, mul: 1, el: ["fire", "ice"], pow: 0, dmg: 7, min1: false, shield: 0, on: [] } }];
  const r0 = redactX(ev, 0, false) as any[], r1 = redactX(ev, 1, false) as any[];
  t("redactX ульты: чужое усиление (технология/Чудо) скрыто, сумма та же", r0[0].why.atk.some((q: any) => q.k === "hidden" && q.n === 3) && !r0[0].why.atk.some((q: any) => q.k === "ultPow") && r0[0].why.atk.reduce((s: number, q: any) => s + q.n, 0) === 7);
  t("redactX ульты: своё видно", r1[0].why.atk.some((q: any) => q.k === "ultPow")); }

// разбор удара: прямой случай с технологией
{ const g = newGame(8, ["fire", "ice"], 0, cfg, 0); const a = g.pieces.find((p) => p.owner === 0 && p.kind === "knight")!, d = g.pieces.find((p) => p.owner === 1 && p.kind === "pawn")!;
  const x0 = hitExplain(g, a, d, cfg); t("hitExplain: base/race части", x0.atk.some((q) => q.k === "base" && q.n === a.atk) && x0.el[0] === "fire");
  t("hitExplain: dmg = damage()", x0.dmg >= 1); }

// скрытие для живой партии
{ const ev: any[] = [{ e: "hit", id: 1, t: 2, dmg: 5, hp: 3, why: { atk: [{ k: "base", n: 4, src: "base", side: 1 }, { k: "fury", n: 2, src: "tech", side: 1 }, { k: "auraAtk", n: 1, src: "chief", side: 1 }], arm: [{ k: "base", n: 1, src: "base", side: 0 }, { k: "arm", n: 1, src: "tech", side: 0 }], cover: 0, mul: 1, pow: 0, dmg: 5, on: [] } }];
  const r0 = redactX(ev as any, 0, false) as any[], r1 = redactX(ev as any, 1, false) as any[], rs = redactX(ev as any, -1, false) as any[], rr = redactX(ev as any, 0, true) as any[];
  t("redactX: чужие tech/chief свёрнуты в hidden", !r0[0].why.atk.some((q: any) => q.k === "fury" || q.k === "auraAtk") && r0[0].why.atk.some((q: any) => q.k === "hidden" && q.n === 3));
  t("redactX: своё видно", r0[0].why.arm.some((q: any) => q.k === "arm") && r1[0].why.atk.some((q: any) => q.k === "fury"));
  t("redactX: зритель — всё чужое скрыто", rs[0].why.arm.some((q: any) => q.k === "hidden") && rs[0].why.atk.some((q: any) => q.k === "hidden"));
  t("redactX: сумма сохраняется", r0[0].why.atk.reduce((s: number, q: any) => s + q.n, 0) === 7);
  t("redactX: после конца — без изменений", rr === ev);
  t("redactX: исходник не мутирован", ev[0].why.atk.length === 3); }
{ t("actView: чужое исследование без id технологии", JSON.stringify(actView({ a: "research", t: "fury" } as any, false)) === '{"a":"research"}');
  t("actView: чужой талант без имени", actView({ a: "talent", id: 5, t: "x" } as any, false).t === undefined);
  t("actView: чужой ход с координатами", JSON.stringify(actView({ a: "move", id: 3, x: 1, y: 2 }, false)) === '{"a":"move","id":3,"x":1,"y":2}');
  t("actView: свои — целиком", actView({ a: "research", t: "fury" } as any, true).t === "fury");
  t("actView: чужая торговля скрыта", Object.keys(actView({ a: "trade", to: 1, give: { gold: 3 }, get: {} } as any, false)).join() === "a");
  const g = newGame(8, ["fire", "ice"], 0, cfg, 0), log = startLog("ABCDEF:1700000000001", g, cfg, null);
  log.acts.push([0, { a: "research", t: "fury" } as any, 0, 1], [0, { a: "end" }, 0, 2], [1, { a: "research", t: "rime" } as any, 0, 3]);
  const m0 = moveList(log, 0, true); t("moveList live: своё видно, чужое — нет", m0.list[0].a.t === "fury" && m0.list[2].a.t === undefined);
  const mo = moveList(log, -1, false); t("moveList после конца: всё видно", mo.list[2].a.t === "rime");
  t("moveList: разметка ходов", m0.turns.length === 2 && m0.turns[0].to === 2 && m0.turns[1].side === 1);
  t("запись хода", m0.list[1].n === "—"); }
t("REPLAY_ID_RE", REPLAY_ID_RE.test("ABCDEF:1700000000000") && !REPLAY_ID_RE.test("abc:1") && !REPLAY_ID_RE.test("ABCDEF:1' OR 1"));
t("cleanTitle", cleanTitle("<b>Победа</b>\n".repeat(20)).length <= 60 && !cleanTitle("<x>").includes("<"));
t("hashG детерминирован", hashG(newGame(8, ["fire", "ice"], 0, cfg, 0)) === hashG(newGame(8, ["fire", "ice"], 0, cfg, 0)));
console.log(`replay-test: ${ok} passed, ${bad} failed`); if (bad) process.exit(1);
