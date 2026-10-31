// nice bun server/strat/rating-test.ts — рейтинг Glicko-2, лиги, допуск, множители
import { glicko2, leagueOf, unratedReason, earlyMul, marginMul, rateMatch, xpMul, provisional, mapHash, RATING_CFG as C, type RatedCtx } from "./rating";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };
const near = (a: number, b: number, e: number) => Math.abs(a - b) <= e;
// пример Глickman (2013): 1500/200/0.06 против 1400/30 (победа), 1550/100, 1700/300 (поражения) → 1464,06 / 151,52 / 0,05999
const r = glicko2({ rating: 1500, rd: 200, vol: 0.06, games: 0 }, [{ opp: { rating: 1400, rd: 30 }, score: 1 }, { opp: { rating: 1550, rd: 100 }, score: 0 }, { opp: { rating: 1700, rd: 300 }, score: 0 }]);
ok(near(r.rating, 1464.06, 0.1) && near(r.rd, 151.52, 0.1) && near(r.vol, 0.05999, 0.0001), `эталон Glicko-2: ${r.rating.toFixed(2)}/${r.rd.toFixed(2)}/${r.vol.toFixed(5)}`);
ok(leagueOf(4) === "quick" && leagueOf(9) === "quick" && leagueOf(10) === "normal" && leagueOf(29) === "normal" && leagueOf(30) === "tactical" && leagueOf(35) === "tactical" && leagueOf(100) === "tactical" && leagueOf(8, 40) === "tactical" && leagueOf(101) === null, "лиги: ≤9 / 10–35 / 36–100 по большей стороне");
const base: RatedCtx = { rated: true, standard: true, mapInPool: true, humans: 2, guests: 0, bots: 0, turns: 20, reason: "goals", pairToday: 0 };
ok(unratedReason(base) === null, "обычная партия — рейтинговая");
ok(unratedReason({ ...base, guests: 1 }) === "guests", "гости — без рейтинга");
ok(unratedReason({ ...base, bots: 1 }) === "bots", "боты — без рейтинга");
ok(unratedReason({ ...base, mapInPool: false }) === "map_not_in_pool", "карта не в пуле — без рейтинга");
ok(unratedReason({ ...base, standard: false }) === "nonstandard", "нестандартные настройки");
ok(unratedReason({ ...base, rated: false }) === "not_rated_mode", "не «Рейтинговая»");
ok(unratedReason({ ...base, creatorOnly: true }) === "test_match", "тестовая партия создателя");
ok(unratedReason({ ...base, reason: "forfeit", turns: 4 }) === "too_early" && unratedReason({ ...base, reason: "goals", turns: 4 }) === null, "сдача до 5-го хода — без рейтинга (победа по целям — считается)");
ok(unratedReason({ ...base, pairToday: 3 }) === "farm_limit" && unratedReason({ ...base, pairToday: 2 }) === null, "пара — максимум 3 в сутки");
ok(earlyMul(4, "away") === 0 && earlyMul(5, "away") === 0.25 && earlyMul(9, "forfeit") === 0.25 && earlyMul(10, "forfeit") === 1 && earlyMul(3, "goals") === 1, "множитель раннего конца 0 / ×0,25 / 1");
ok([1, 2, 3, 4, 5].map((d) => marginMul(true, d)).join() === "1.2,1,0.8,0.6,0.4" && [1, 2, 3, 4, 5].map((d) => marginMul(false, d)).join() === "0.65,0.9,1.15,1.4,1.65", "t1208: K по разнице целей d=1…5 (победа 1,2→0,4; поражение 0,65→1,65)");
ok(marginMul(true, 0) === 1.2 && marginMul(true, undefined) === 1, "d=0 (лимит, равные цели) — как d=1; без счёта — 1");
const R0 = () => ({ rating: 1500, rd: 350, vol: 0.06, games: 0 });
const one = (lg: number, turns = 20, reason = "goals", acts = 5) => rateMatch([{ uid: "a", team: 0, place: 1, goals: 5, actions: 10, r: R0() }, { uid: "b", team: 1, place: 2, goals: lg, actions: acts, r: R0() }], turns, reason);
const dd = [4, 3, 2, 1, 0].map((lg) => one(lg)), wins = dd.map((x) => x.a.delta), loss = dd.map((x) => x.b.delta);
console.log("t1208 d=1…5: победитель", wins.join("/"), "проигравший", loss.join("/"));
ok(wins.every((v, i) => v > 0 && (i === 0 || v < wins[i - 1])), "победителю: чем больше d, тем меньше");
ok(loss.every((v, i) => v < 0 && (i === 0 || v < loss[i - 1])), "проигравшему: чем больше d, тем больше потеря");
ok(Math.abs(loss[0]) < wins[0] && Math.abs(loss[4]) > wins[4], "близкая: победитель +много, проигравший −мало; разгром — наоборот");
const d31 = one(4).a.delta;
ok(one(4, 20, "surrender").b.delta === one(0).b.delta, "сдача — проигравшему максимум (как d=5)");
{ const st = rateMatch([{ uid: "a", team: 0, place: 1, goals: 5, actions: 10, r: { rating: 1800, rd: 60, vol: 0.06, games: 50 } }, { uid: "b", team: 1, place: 2, goals: 4, actions: 5, r: { rating: 1400, rd: 60, vol: 0.06, games: 50 } }], 20, "goals");
  ok(st.a.delta < wins[0] && st.a.delta > 0, "ожидание по рейтингу учитывается (сильный за слабого получает меньше)"); }
{ const dr = rateMatch([{ uid: "a", team: 0, place: 1, goals: 3, actions: 10, r: R0() }, { uid: "b", team: 1, place: 1, goals: 3, actions: 5, r: R0() }], 20, "limit"); ok(dr.a.delta === 0 && dr.b.delta === 0, "ничья равных — 0"); }
ok(Object.keys(one(1, 4, "forfeit")).length === 0, "сдача до 5-го хода — никаких изменений");
ok(near(one(4, 7, "forfeit").a.delta, d31 * 0.25, 2), "ходы 5–9 — ×0,25");
ok(near(one(4, 20, "goals", 0).a.delta, d31 * 0.25, 2), "проигравший без единого действия — победителю ×0,25");
// FFA: попарно по месту
const ffa = rateMatch([1, 2, 3, 4].map((pl) => ({ uid: "p" + pl, team: pl, place: pl, actions: 5, r: R0() })), 30, "goals");
ok(ffa.p1.delta > ffa.p2.delta && ffa.p2.delta > ffa.p3.delta && ffa.p3.delta > ffa.p4.delta && ffa.p1.delta > 0 && ffa.p4.delta < 0, "FFA: 1-е > 2-е > 3-е > 4-е");
ok(near(ffa.p2.delta, -ffa.p3.delta, 2), "FFA: симметрия середины");
// команды: средний против среднего, одинаковый сдвиг внутри команды при равных рейтингах
const tm = rateMatch([{ uid: "a", team: 0, place: 1, actions: 3, r: R0() }, { uid: "b", team: 0, place: 1, actions: 3, r: R0() }, { uid: "c", team: 1, place: 2, actions: 3, r: { rating: 1700, rd: 80, vol: 0.06, games: 30 } }, { uid: "d", team: 1, place: 2, actions: 3, r: { rating: 1300, rd: 80, vol: 0.06, games: 30 } }], 30, "goals");
ok(tm.a.delta === tm.b.delta && tm.a.delta > 0 && tm.c.delta < 0 && tm.d.delta < 0, "команды: средний рейтинг против среднего");
ok(provisional(R0()) && !provisional({ ...R0(), games: 10 }), "первые 10 партий — предварительный рейтинг");
ok(xpMul({ turns: 4, reason: "forfeit", bots: 0 }) === 0 && xpMul({ turns: 20, reason: "goals", bots: 1 }) === C.botXpMul && xpMul({ turns: 20, reason: "goals", bots: 1, botGamesToday: 3 }) === 0, "опыт: ранний конец 0; с ботами ×0,25 и не больше 3 в сутки");
const h1 = await mapHash({ size: 8, t: "aaa", s: "b" }), h2 = await mapHash({ size: 8, t: "aab", s: "b" });
ok(h1 !== h2 && h1.length === 24 && h1 === (await mapHash({ size: 8, t: "aaa", s: "b", name: "другое имя" })), "хэш карты меняется от правки клеток, не от имени");
console.log(`rating-test: ${n - fails} ok, ${fails} fail`); if (fails) process.exit(1);
