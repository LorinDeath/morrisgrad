// t1243: «Итоги партии» и рейтинг в 2×2 и «Все ×4» — места по выбыванию, Elo по местам, союзники; без двойного начисления.
//   nice bun server/strat/results-multi-test.ts
import { plugin } from "bun";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "fs";
plugin({ name: "cf-stub", setup(b) { b.module("cloudflare:workers", () => ({ exports: { DurableObject: class { ctx: any; env: any; constructor(c: any, e: any) { this.ctx = c; this.env = e; } } }, loader: "object" })); } });
const { StratMatch } = await import("./match");
const { dropOverrideCache } = await import("./cfg");
const { rateMatch, RATING_CFG } = await import("./rating");
let n = 0, fails = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };

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
const q1 = (s: string, ...a: any[]) => sq.query(s).get(...a) as any, qa = (s: string, ...a: any[]) => sq.query(s).all(...a) as any[];
const { eliminate } = await import("./rules");
const { poolSet } = await import("./rating-db");
const U = ["u-rm-a", "u-rm-b", "u-rm-c", "u-rm-d"];
async function mk(code: string, mode: string) {
  const M: any = new StratMatch(ctx(), env);
  await M.fetch(new Request("https://internal/init", { method: "POST", body: JSON.stringify({ code, size: 35, pub: false }) }));
  const L = M.L; L.rated = true; L.mode = mode; await M.ensureDraw();
  L.seats = U.map((pk, i) => ({ pkey: pk, nick: "И" + i, verified: true, race: ["fire", "ice", "fire", "ice"][i], ready: true, goneAt: null }));
  M.botMaybe = () => {}; await M.start(); await flush();
  ok((await poolSet(env, "test", { ...L.map, status: "approved" }, true)).ok, `${mode}: витрина ${L.mapId} — в рейтинговый пул`); return M;
}
// ---- «Все ×4»: места по выбыванию, Elo по местам, итоги на 4 места
{ const X = await mk("RMFFAX", "ffa4"), g = X.L.game; ok(g.np === 4 && X.L.seats.length === 4, "ffa4: 4 места");
  g.turn = 30; X.L.acts = [20, 20, 20, 20]; X.L.activeMs = [6e5, 6e5, 6e5, 6e5];
  const ev: any[] = []; eliminate(g, 1, "forfeit", ev, X.cfg(), "remove"); eliminate(g, 3, "wipe", ev, X.cfg(), "remove"); eliminate(g, 0, "wipe", ev, X.cfg(), "remove");
  ok(!g.pieces.some((p: any) => p.owner === 1), "сдавшийся в «Все»: фигуры убраны");
  X.finish(g.winner === -1 ? 2 : g.winner, "wipe"); await X.save(); await flush();
  const s = X.stateFor(2, U[2]), sum = s.sum || X.L.sum;
  ok(sum?.sides?.length === 4, "итоги: 4 стороны");
  ok(sum?.sides?.map((x: any) => x.place).join() === "2,4,1,3", "места: победитель 1, позже выбыл — выше, сдавшийся первым — 4: " + sum?.sides?.map((x: any) => x.place).join());
  const R = s.rating; ok(R && !R.unrated && R.seats?.length === 4, "рейтинг посчитан на 4 места: " + (R?.unrated || ""));
  const d = R.seats.map((c: any) => c.delta); ok(d[2] > 0 && d[2] > d[0] && d[0] > d[3] && d[3] > d[1] && d[1] < 0, "Elo по местам: 1 > 2 > 3 > 4: " + d.join(" "));
  ok(qa("SELECT * FROM strat_rating_history").length === 4, "история рейтинга — 4 строки");
  await X.recordRating(); await flush(); ok(qa("SELECT * FROM strat_rating_history").length === 4, "повторный подсчёт — без второго начисления"); }
// ---- 2×2: команда, союзник, одинаковый знак у союзников
{ const X = await mk("RMTWVV", "2v2"), g = X.L.game; ok(g.np === 4 && g.tm?.join() === "0,1,0,1", "2v2: команды 0,1,0,1");
  g.turn = 30; X.L.acts = [20, 20, 20, 20]; X.L.activeMs = [6e5, 6e5, 6e5, 6e5];
  X.finish(1, "goals"); await X.save(); await flush();
  const sum = X.L.sum; ok(sum?.teams?.join() === "0,1,0,1" && sum.sides.length === 4, "итоги 2×2: команды на 4 места");
  ok(sum.sides.map((x: any) => x.place).join() === "2,1,2,1", "места 2×2: победившая команда — 1");
  const R = X.stateFor(0, U[0]).rating; const d = R.seats.map((c: any) => c.delta);
  ok(!R.unrated && d[1] > 0 && d[3] > 0 && d[0] < 0 && d[2] < 0, "2×2: союзники с одним знаком: " + d.join(" ")); }
console.log(`results-multi-test: ${n - fails} ok, ${fails} fail`); if (fails) process.exit(1);
