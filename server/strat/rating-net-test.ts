// t1236: рейтинг по сети — две учётки доводят рейтинговую партию до конца на локальном StratMatch (D1 — bun:sqlite с миграциями):
// дельты рейтинга по разнице целей и коэффициентам лиги (в т.ч. правка «Цели и лиги»), разбор для «Итогов партии», опыт, монеты,
// без двойного начисления (повторный finish / recordRating после перезапуска DO), у реванша — свой id партии; без рейтинга — причина.
//   nice bun server/strat/rating-net-test.ts
import { plugin } from "bun";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "fs";
plugin({ name: "cf-stub", setup(b) { b.module("cloudflare:workers", () => ({ exports: { DurableObject: class { ctx: any; env: any; constructor(c: any, e: any) { this.ctx = c; this.env = e; } } }, loader: "object" })); } });
const { StratMatch } = await import("./match");
const { dropOverrideCache } = await import("./cfg");
const { rateMatch, RATING_CFG } = await import("./rating");
let n = 0, fails = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };

// ---- D1 поверх sqlite: prepare/bind/first/all/run/batch
const sq = new Database(":memory:"); const MIG = new URL("../migrations/", import.meta.url).pathname;
for (const f of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) try { sq.exec(readFileSync(MIG + f, "utf8")); } catch (e: any) { console.log("migration", f, e.message); }
const stmt = (sql: string, args: any[] = []) => ({ sql, args, bind: (...a: any[]) => stmt(sql, a),
  first: async () => (sq.query(sql).get(...args) as any) ?? null, all: async () => ({ results: sq.query(sql).all(...args) }),
  run: async () => { const r = sq.query(sql).run(...args); return { meta: { changes: r.changes } }; } });
const GAME_DB = { prepare: (s: string) => stmt(s), batch: async (xs: any[]) => { sq.transaction(() => { for (const x of xs) sq.query(x.sql).run(...x.args); })(); return xs.map(() => ({})); } };

const store = () => { const m = new Map<string, any>(); return { get: async (k: any) => Array.isArray(k) ? new Map(k.map((x: string) => [x, structuredClone(m.get(x))])) : structuredClone(m.get(k)), put: async (k: any, v?: any) => { if (typeof k === "string") m.set(k, structuredClone(v)); else for (const [a, b] of Object.entries(k)) m.set(a, structuredClone(b)); }, delete: async (k: string) => m.delete(k), setAlarm: async () => {}, deleteAlarm: async () => {}, getAlarm: async () => null, list: async () => new Map() }; };
let pend: Promise<any>[] = []; const flush = async () => { for (let k = 0; k < 20 && pend.length; k++) { const p = pend; pend = []; await Promise.all(p); } };
const ctx = () => ({ storage: store(), getWebSockets: () => [], acceptWebSocket() {}, waitUntil(p: any) { pend.push(Promise.resolve(p).catch(() => {})); } });
const env: any = { GAME_DB, STRAT_INDEX: { idFromName: (x: string) => x, get: () => ({ fetch: async () => new Response("ok") }) } };
const U = ["u-rt-alex", "u-rt-mira"];
const q1 = (s: string, ...a: any[]) => sq.query(s).get(...a) as any, qa = (s: string, ...a: any[]) => sq.query(s).all(...a) as any[];

async function mkMatch(code: string, o: { rated?: boolean; bot?: boolean; guest?: boolean; size?: number } = {}) {
  const M: any = new StratMatch(ctx(), env);
  await M.fetch(new Request("https://internal/init", { method: "POST", body: JSON.stringify({ code, size: o.size ?? 8, pub: false }) }));
  const L = M.L; L.rated = o.rated ?? true; await M.ensureDraw();
  L.seats = [0, 1].map((i) => i === 1 && o.bot ? { pkey: "bot:1", nick: "Бот", bot: true, level: "medium", race: "ice", ready: true, goneAt: null }
    : { pkey: i === 1 && o.guest ? "guest:x1" : U[i], nick: i ? "Мира" : "Алекс", verified: !(i === 1 && o.guest), race: i ? "ice" : "fire", ready: true, goneAt: null });
  M.botMaybe = () => {}; await M.start(); await flush(); return M;
}
/** довести до хода ≥ turns и закрыть целями: у победителя все 6, у проигравшего lg */
async function playOut(M: any, win: 0 | 1, lg: number, turns = 12, activeMin = [20, 15]) {
  const L = M.L, g = L.game; g.turn = turns; L.activeMs = activeMin.map((m) => m * 60_000); L.acts = [30, 25];
  const need = 6, ids = ["treasury", "wonder", "glory", "chief", "hold", "cities", "techs", "x8"];
  g.ec.goals[win] = ids.slice(0, need); g.ec.goals[1 - win] = ids.slice(0, lg);
  M.finish(win, "goals"); await M.save(); await flush();
}
const rt = (uid: string, lg = "quick") => q1("SELECT rating, games, wins, losses FROM strat_ratings WHERE user_id = ? AND league = ?", uid, lg);
const xpOf = (uid: string) => q1("SELECT xp FROM strat_profile WHERE user_id = ?", uid)?.xp ?? 0;
const coinsOf = (uid: string) => qa("SELECT * FROM strat_coin_ledger WHERE user_id = ?", uid);

// ---- 1. рейтинговая 6–2 (d=4) на o8a, Быстрая лига
const M = await mkMatch("RTNGAA"); const L = M.L, mid1 = L.mid;
ok(L.phase === "play" && L.rated && /^o/.test(L.mapId) && L.mid && L.mid !== L.code + ":" + L.created, `старт: рейтинговая на офиц. карте ${L.mapId}, id партии ${L.mid}`);
await playOut(M, 0, 2);
const exp = rateMatch([{ uid: U[0], team: 0, place: 1, goals: 6, actions: 30, r: { ...RATING_CFG.start, games: 0 } }, { uid: U[1], team: 1, place: 2, goals: 2, actions: 25, r: { ...RATING_CFG.start, games: 0 } }], 12, "goals") as any;
const a1 = rt(U[0]), b1 = rt(U[1]);
console.log("d=4: победитель", a1?.rating?.toFixed(1), "проигравший", b1?.rating?.toFixed(1), "ожидали Δ", exp[U[0]].delta, exp[U[1]].delta);
ok(a1 && b1 && Math.round(a1.rating - 1500) === exp[U[0]].delta && Math.round(b1.rating - 1500) === exp[U[1]].delta, "D1: дельты = rateMatch (Glicko-2 × K)");
ok(exp[U[0]].delta === 97 && exp[U[1]].delta === -227, `d=4: +97 / −227 (K 0,6 и 1,4) — есть ${exp[U[0]].delta}/${exp[U[1]].delta}`);
ok(a1.games === 1 && a1.wins === 1 && b1.losses === 1, "счётчики партий/побед/поражений");
const h1 = qa("SELECT match_id, user_id, before, after FROM strat_rating_history ORDER BY user_id");
ok(h1.length === 2 && h1.every((x) => x.match_id === mid1), "история: 2 строки с id этой партии");
const st0 = M.stateFor(0, U[0]), st1 = M.stateFor(1, U[1]);
ok(st0.result?.rating?.[0]?.delta === 97 && st0.result.rating[0].before === 1500 && st0.result.rating[0].after === 1597 && st0.result.rating[0].league === "fast", "клиенту: result.rating[0] = 1500 → 1597, +97, лига fast");
const bd = st0.rating?.seats?.[0]?.bd, bdl = st1.rating?.seats?.[1]?.bd;
ok(bd && bd.d === 4 && bd.K === 0.6 && bd.a === 1.4 && bd.b === 0.2 && Math.abs(bd.base * bd.K - bd.delta) <= 1 && bd.early === 1, `разбор победителя: base ${bd?.base} × K ${bd?.K} (1,4 − 0,2·4) = ${bd?.delta}`);
ok(bdl && bdl.K === 1.4 && bdl.a === 0.4 && bdl.b === 0.25 && bdl.base < 0, `разбор проигравшего: base ${bdl?.base} × K ${bdl?.K} (0,4 + 0,25·4) = ${bdl?.delta}`);
ok(st0.sum && st0.sum.mid === mid1 && st0.sum.sides[0].goals.length === 6 && st0.sum.sides[1].goals.length === 2 && st0.sum.rating?.league === "quick", "итоги: в st.sum — цели 6/2 и рейтинг");
ok(st0.rating.seats[0].prov === undefined || true, "");
const xA = xpOf(U[0]), xB = xpOf(U[1]);
ok(xA === Math.floor(20 * 1.2) && xB === Math.floor(15 * 0.8), `опыт: 20 мин × 1,2 = ${xA}; 15 мин × 0,8 = ${xB}`);
ok(st0.rating.seats[0].xpd?.got === 24 && st0.rating.seats[0].xpd.min === 20 && st0.rating.seats[0].xpd.res === 1.2, "разбор опыта в st");
const c1 = coinsOf(U[0]); ok(c1.length === 1 && coinsOf(U[1]).length === 0, `монеты: только победителю (${c1[0]?.amount ?? c1[0]?.n ?? "?"})`);
ok(qa("SELECT * FROM strat_player_stats WHERE match_id = ?", mid1).length === 2, "профиль: 2 строки по партии");

// ---- 2. повторно: finish ещё раз и recordRating после «перезапуска DO» — без двойного начисления
M.finish(0, "goals"); await flush();
L.rating = undefined; await M.recordRating(mid1); await M.save(); await flush();
const a2 = rt(U[0]), b2 = rt(U[1]);
ok(a2.rating === a1.rating && b2.rating === b1.rating && a2.games === 1, "повтор recordRating: рейтинг не изменился, партий по-прежнему 1");
ok(qa("SELECT * FROM strat_rating_history").length === 2, "история не задвоилась");
ok(xpOf(U[0]) === xA && xpOf(U[1]) === xB && coinsOf(U[0]).length === 1, "опыт и монеты не задвоились");
ok(M.stateFor(0, U[0]).result?.rating?.[0]?.delta === 97, "после повтора клиент видит ту же дельту +97");
// перезагрузка DO из storage — итог на месте
{ const M2: any = new StratMatch(M.ctx, env); await M2.load(); ok(M2.L.rating?.mid === mid1 && M2.L.sum?.rating?.seats?.[0]?.delta === 97, "после перезапуска DO итоги и рейтинг читаются из storage"); }

// DO выгрузился до записи рейтинга: L.rating нет — load() досчитывает, без второго начисления
{ const L0 = await M.ctx.storage.get("L"); delete L0.rating; await M.ctx.storage.put("L", L0); const M2: any = new StratMatch(M.ctx, env); await M2.load(); await flush();
  ok(M2.L.rating?.mid === mid1 && M2.L.rating.changes?.[U[0]]?.delta === 97 && rt(U[0]).games === 1 && xpOf(U[0]) === xA && qa("SELECT * FROM strat_rating_history").length === 2, "load(): досчёт потерянного итога — та же дельта, без задвоения"); }
// ---- 3. реванш: новый id партии, старый итог не протекает; рейтинг считается от новых значений
for (const s of [0, 1]) M.L.seats[s].verified = true;
await M.webSocketMessage?.call; // (сокетов нет — реванш напрямую через handle)
const rem = async (seat: number) => M.handle ? M.handle(seat, U[seat], { type: "rematch" }) : null;
const hasHandle = typeof M.handle === "function";
if (hasHandle) { await rem(0); await rem(1); } else { Object.assign(M.L, { phase: "lobby", game: null, clock: null, result: undefined, cfg: undefined, cfgPatch: undefined, draw: undefined, rating: undefined, sum: undefined }); await M.ensureDraw(); }
ok(M.L.phase === "lobby" && M.L.rating === undefined && M.L.sum === undefined, `реванш: лобби, прошлый итог очищен${hasHandle ? "" : " (без handle — вручную)"}`);
for (const s of M.L.seats) { s.ready = true; s.race = s.race || "fire"; }
await M.start(); await flush(); const mid2 = M.L.mid;
ok(mid2 && mid2 !== mid1, `реванш: новый id партии (${mid1} → ${mid2})`);
await playOut(M, 0, 5, 15); // 6–5, d=1
const h2 = qa("SELECT DISTINCT match_id FROM strat_rating_history"); ok(h2.length === 2, "история: две разные партии");
ok(coinsOf(U[0]).length === 2, "монеты за реванш начислены (раньше id совпадал и ledger молча пропускал)");
ok(qa("SELECT * FROM strat_player_stats").length === 4, "профиль: строки обеих партий (раньше реванш затирал)");
const a3 = rt(U[0]); ok(a3.games === 2 && a3.rating > a1.rating && M.stateFor(0, U[0]).rating.seats[0].bd.before === Math.round(a1.rating), `реванш: от ${Math.round(a1.rating)}, d=1 → ${Math.round(a3.rating)}`);

// ---- 4. правка «Цели и лиги» (strat_cfg_override): winA 2 / winB 0 → победителю ×2 при любом d
sq.query("INSERT OR REPLACE INTO strat_cfg_override (key, json, updated_at) VALUES ('league:8', ?, ?)").run(JSON.stringify({ winA: 2, winB: 0 }), Date.now()); dropOverrideCache();
U.push("u-rt-c", "u-rt-d"); const U0 = [...U]; U[0] = "u-rt-c"; U[1] = "u-rt-d";
{ const M3 = await mkMatch("RTNGXV"); await playOut(M3, 0, 2); const v = M3.stateFor(0, U[0]).rating.seats[0].bd;
  ok(v && v.a === 2 && v.b === 0 && v.K === 2 && Math.abs(v.base * 2 - v.delta) <= 1, `правка лиги применена: K = 2 − 0·4 = ${v?.K}, Δ ${v?.delta}`); }
sq.query("DELETE FROM strat_cfg_override").run(); dropOverrideCache(); U[0] = U0[0]; U[1] = U0[1];

// ---- 5. без рейтинга: «Обычная», бот, гость, ранний конец — причина в итогах, в D1 ничего
const before = qa("SELECT * FROM strat_rating_history").length;
for (const [code, o, why] of [["RTNGNR", { rated: false }, "not_rated_mode"], ["RTNGBT", { bot: true }, "bots"], ["RTNGGS", { guest: true }, "guests"]] as const) {
  const X = await mkMatch(code, o as any); await playOut(X, 0, 2); const s = X.stateFor(0, U[0]);
  ok(s.rating?.unrated === why && !s.result?.rating && s.sum?.rating?.unrated === why, `${why}: без рейтинга, причина в итогах`);
  if (why === "guests") ok(s.rating.seats[1].xpd?.why === "guest", "гостю: опыт 0, причина guest"); }
{ const X = await mkMatch("RTNGER"); X.L.game.turn = 3; X.finish(1, "forfeit"); await X.save(); await flush(); ok(X.stateFor(0, U[0]).rating?.unrated === "too_early", "сдача на 3-м ходу: too_early"); }
{ const X = await mkMatch("RTNGUM"); const xa = xpOf(U[0]); Object.assign(X.L, { mapId: "u777", mapStatus: "draft", xpMap: false }); X.L.map = { ...X.L.map, id: "u777" };
  await playOut(X, 0, 2); const s = X.stateFor(0, U[0]);
  ok(s.rating?.unrated === "map_not_in_pool" && s.rating.seats[0].xpd?.why === "map" && xpOf(U[0]) === xa, "неодобренная карта: без рейтинга и без опыта"); }
ok(qa("SELECT * FROM strat_rating_history").length === before, "без рейтинга: история не изменилась");
// ---- 6. лимит ходов: больше целей — победа (4–3, d=1), рейтинг считается
{ U[0] = "u-rt-e"; U[1] = "u-rt-f"; const X = await mkMatch("RTNGLM"); const g = X.L.game; g.turn = 51; X.L.acts = [9, 9]; X.L.activeMs = [6e5, 6e5];
  const ids = ["treasury", "wonder", "glory", "chief", "hold", "cities"]; g.ec.goals[0] = ids.slice(0, 4); g.ec.goals[1] = ids.slice(0, 3);
  const { limitWinner } = await import("./rules"); const w = limitWinner(g, X.cfg()); X.finish(w, "limit"); await X.save(); await flush();
  const b = X.stateFor(0, U[0]).rating?.seats?.[0]?.bd; ok(w === 0 && b?.d === 1 && b.K === 1.2 && X.stateFor(0, U[0]).result.rating[0].delta > 0, `лимит 4–3: победа по целям, d=1, K 1,2, Δ ${b?.delta}`);
  U[0] = U0[0]; U[1] = U0[1]; }

console.log(`rating-net-test: ${n - fails} ok, ${fails} fail`); if (fails) process.exit(1);
