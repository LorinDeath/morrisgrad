// t1163: «Библиотека партий» — lib_save / lib_rename / lib_unsave (D1 подменён bun:sqlite).
//   nice bun server/strat/lib-test.ts
// @ts-ignore — модуль есть только в bun
import { Database } from "bun:sqlite";
import { libSave, libRename, libUnsave } from "./replay-db";
import { STRAT_CFG } from "./rules";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const sq = new Database(":memory:");
sq.run("CREATE TABLE strat_replays (id TEXT PRIMARY KEY, status TEXT)");
sq.run("CREATE TABLE strat_replay_saves (user_id TEXT, replay_id TEXT, title TEXT, created_at INT, PRIMARY KEY (user_id, replay_id))");
sq.run("INSERT INTO strat_replays VALUES ('ABCDEF:1700000000000','over'), ('LIVEXX:1700000000000','live')");
const db = { prepare: (q: string) => { const st = sq.query(q); const b = (...a: any[]) => ({ first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => st.run(...a) }); return { bind: b, ...b() }; } };
const title = (u: string, id: string) => (sq.query("SELECT title FROM strat_replay_saves WHERE user_id = ? AND replay_id = ?").get(u, id) as any)?.title;
const R = "ABCDEF:1700000000000";
ok((await libRename(db, "u1", R, "x")) === "not_saved", "rename несохранённой — not_saved");
ok((await libSave(db, "u1", R, "Первая", STRAT_CFG)) === "" && title("u1", R) === "Первая", "save с названием");
ok((await libSave(db, "u1", "LIVEXX:1700000000000", "", STRAT_CFG)) === "live" && (await libSave(db, "u1", "NOPE00:1700000000000", "", STRAT_CFG)) === "no_replay", "save: идёт / нет повтора");
ok((await libRename(db, "u1", R, "Новая " + "я".repeat(80))) === "" && title("u1", R).length <= 60 && title("u1", R).startsWith("Новая"), "rename: обрезка до 60");
ok((await libRename(db, "u2", R, "чужая")) === "not_saved" && title("u1", R).startsWith("Новая"), "rename чужой записи не трогает её");
await libUnsave(db, "u1", R); ok(title("u1", R) === undefined, "unsave удаляет");
console.log(`lib-test: ${n - fails} ok, ${fails} fail`); process.exit(fails ? 1 : 0);
