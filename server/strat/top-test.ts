// t1170+: экран «Рейтинг» — топ N лиги, моё место, предварительный статус. D1 подменён bun:sqlite.
//   nice bun server/strat/top-test.ts
// @ts-ignore — модуль есть только в bun (тест запускается bun)
import { Database } from "bun:sqlite";
import { leaderboard, myPlace } from "./rating-db";
import { RATING_CFG } from "./rating";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const db = new Database(":memory:");
db.run("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT)");
db.run("CREATE TABLE strat_ratings (user_id TEXT, league TEXT, rating REAL, rd REAL, games INT, wins INT, losses INT, draws INT, peak REAL)");
const P = RATING_CFG.provisional;
const rows: [string, string, number, number][] = [["a", "quick", 1700, P + 5], ["b", "quick", 1600, P], ["c", "quick", 1650, P - 1], ["d", "quick", 1500, P + 1], ["e", "normal", 1900, P + 2], ["f", "quick", 1600, P + 3]];
for (const [u, l, r, g] of rows) { db.run("INSERT INTO users VALUES (?, ?)", [u, "nick_" + u]); db.run("INSERT INTO strat_ratings VALUES (?,?,?,?,?,?,?,?,?)", [u, l, r, 60, g, g, 0, 0, r]); }
const env = { GAME_DB: { prepare: (q: string) => { const st = db.query(q); const b = (...a: any[]) => ({ first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }) }); return { bind: b, ...b() }; } } };
const top = await leaderboard(env, "quick");
ok(top.map((x) => x.nick).join() === "nick_a,nick_b,nick_f,nick_d" || top.map((x) => x.nick).join() === "nick_a,nick_f,nick_b,nick_d", "топ лиги: по рейтингу, без предварительных");
ok(top.map((x) => x.place).join() === "1,2,2,4", "места: равный рейтинг — общее место (1,2,2,4)");
ok((await leaderboard(env, "quick", 2)).length === 2, "топ N ограничен");
ok((await leaderboard(env, "bogus")).length === 0, "неизвестная лига — пусто");
const ma = await myPlace(env, "a", "quick"), md = await myPlace(env, "d", "quick"), mb = await myPlace(env, "b", "quick");
ok(ma?.place === 1 && !ma.prov && ma.total === 4, "моё место: первый, всего 4");
ok(md?.place === 4, "моё место: четвёртый");
ok(mb?.place === 2 && (await myPlace(env, "f", "quick"))?.place === 2, "моё место при равенстве совпадает со списком (2)");
const mc = await myPlace(env, "c", "quick");
ok(mc?.place === null && mc.prov === true && mc.left === 1, "предварительный: без места, осталось 1 партия");
const mz = await myPlace(env, "zzz", "normal");
ok(mz?.place === null && mz.prov && mz.games === 0 && mz.left === P && mz.total === 1, "нет партий в лиге — предварительный, total лиги");
ok((await myPlace(env, "guest:x", "quick")) === null, "гость — без места");
console.log(`top-test: ${n - fails} ok, ${fails} fail`); process.exit(fails ? 1 : 0);
