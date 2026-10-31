// t1163: «Библиотека партий» — lib_save / lib_rename / lib_unsave (D1 подменён bun:sqlite).
//   nice bun server/strat/lib-test.ts
// @ts-ignore — модуль есть только в bun
import { Database } from "bun:sqlite";
import { libSave, libRename, libUnsave, libList, pruneReplays } from "./replay-db";
import { readFileSync } from "node:fs";
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
// t1175: хранение 90 дн., «Недавние» — последние 50, библиотека — до 100, чужие партии сохранять можно
{ const q = new Database(":memory:"); q.exec(readFileSync(new URL("../migrations/0031_strat_replays.sql", import.meta.url), "utf8"));
  const D2 = { prepare: (x: string) => { const st = q.query(x); const b = (...a: any[]) => ({ first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => st.run(...a) }); return { bind: b, ...b() }; } };
  const now = Date.now(), DAY = 86400_000, ins = q.query("INSERT INTO strat_replays (id, status, log, p0, p1, nick0, nick1, race0, race1, ended_at, started_at) VALUES (?, 'over', '{}', ?, ?, 'a', 'b', 'fire', 'ice', ?, ?)");
  const id = (k: number) => "P" + String(k).padStart(5, "0") + ":1700000000000";
  for (let k = 0; k < 60; k++) ins.run(id(k), "me", "foe", now - k * 3600_000, now - k * 3600_000 - 600_000);      // 60 свежих партий «me»
  ins.run("OLD000:1700000000000", "me", "foe", now - 91 * DAY, now - 91 * DAY); ins.run("OLDSAV:1700000000000", "x", "y", now - 120 * DAY, now - 120 * DAY);
  for (let k = 0; k < 110; k++) ins.run("Q" + String(k).padStart(5, "0") + ":1700000000000", "x", "y", now - DAY, now - DAY); // чужие партии
  const L = await libList(D2, "me", STRAT_CFG);
  ok(L.recent.length === 50 && L.recentMax === 50 && L.keepDays === 90 && L.saveMax === 100, `libList: недавние — последние 50, 90 дн., до 100 (${L.recent.length})`);
  ok(L.recent[0].id === id(0) && !L.recent.some((r: any) => r.id === "OLD000:1700000000000"), "libList: свежие сверху, старше 90 дн. не показываются");
  ok((await libSave(D2, "me", "Q00000:1700000000000", "чужая", STRAT_CFG)) === "", "save: чужую партию (не участник) — можно");
  ok((await libSave(D2, "me", "OLDSAV:1700000000000", "", STRAT_CFG)) === "", "save: старую чужую — можно (пока не удалена)");
  let full = ""; for (let k = 1; k < 110 && !full; k++) full = await libSave(D2, "me", "Q" + String(k).padStart(5, "0") + ":1700000000000", "", STRAT_CFG);
  const nSaved = (q.query("SELECT COUNT(*) AS n FROM strat_replay_saves WHERE user_id = 'me'").get() as any).n;
  ok(full === "lib_full" && nSaved === 100, `библиотека: до 100, 101-я — lib_full (${nSaved})`);
  ok((await libSave(D2, "me", "Q00000:1700000000000", "новое имя", STRAT_CFG)) === "", "переименование сохранённой при полной библиотеке — можно");
  await pruneReplays(D2, STRAT_CFG, now);
  const has = (x: string) => !!q.query("SELECT 1 FROM strat_replays WHERE id = ?").get(x);
  ok(!has("OLD000:1700000000000") && has("OLDSAV:1700000000000") && has(id(59)), "prune: старше 90 дн. удаляется, сохранённая в библиотеку — остаётся, свежие — на месте"); }
console.log(`lib-test: ${n - fails} ok, ${fails} fail`); process.exit(fails ? 1 : 0);
