// npx tsx server/meta/perf-test.ts — «📊 Нагрузка»: кольцевые буферы, счётчики, D1-обёртка, суточная статистика
import { Series, PERF, perfTick, perfServer, wrapDb, wrapSend, perfMsgIn } from "./perf";
import { Stats, dayOf, hourOf, anonId } from "./stats";
let fail = 0; const ok = (c: any, m: string) => { if (!c) { fail++; console.log("✖", m); } else console.log("✔", m); };
// Series
const s = new Series(); const t0 = Date.now(); for (let i = 1; i <= 100; i++) s.push(t0 + i, i);
const st = s.stats(t0); ok(st.n === 100 && st.max === 100 && st.p50 === 51 && Math.abs(st.avg - 50.5) < 1e-6, "Series.stats: n/max/p50/avg");
for (let i = 0; i < 20000; i++) s.push(t0 + 200 + i, 1); ok(s.len === 9000, "Series: кольцо не растёт");
ok(s.stats(t0 + 200).n === 9000 && s.stats(t0 + 200).max === 1, "Series: старые точки вытеснены");
// перф-такт и снимок
for (let i = 0; i < 50; i++) perfTick(0, 2);
const j = perfServer(); ok(j.target.tickMs === 100 && j.tickMs.m1.n >= 50 && j.tickMs.m1.avg === 2, "perfServer: цель 100 мс, длительность такта");
ok(JSON.stringify(j).length < 60000, "perfServer: компактный JSON");
// сеть
const ws: any = { sent: 0, send(d: any) { this.sent++; } }; wrapSend(ws); const before = PERF.sec.tot.msgOut; ws.send("abcd"); ok(ws.sent === 1 && PERF.sec.tot.msgOut === before + 1 && PERF.sec.tot.bytesOut >= 4, "wrapSend считает и пропускает");
perfMsgIn("move", 30); ok(PERF.msgTypes.get("move") === 1, "perfMsgIn по типам");
// D1-обёртка
const calls: string[] = []; const fake = { prepare: (q: string) => ({ bind: (...a: any[]) => ({ first: async () => (calls.push(q), { n: 1 }), run: async () => calls.push(q), all: async () => ({ results: [] }), raw: async () => [] }), first: async () => ({ n: 2 }), all: async () => ({ results: [] }), run: async () => 0, raw: async () => [] }), batch: async (l: any[]) => (calls.push("batch" + l.length), []), exec: async () => 0 };
const db = wrapDb(fake); ok(wrapDb(db) === db, "wrapDb не оборачивает дважды");
const q0 = PERF.sec.tot.dbq;
(async () => {
  ok((await db.prepare("SELECT 1").bind(1).first())?.n === 1, "wrapDb: bind().first()");
  await db.batch([db.prepare("X").bind(1), db.prepare("Y").bind(2)]); ok(calls.includes("batch2") && PERF.sec.tot.dbq === q0 + 2, "wrapDb: batch + счёт запросов");
  // Stats
  ok(/^\d{4}-\d\d-\d\d$/.test(dayOf(Date.now())) && hourOf(Date.UTC(2026, 6, 1, 21, 30)) === 0, "Киевские сутки (UTC+3 летом)");
  ok(anonId("uid:abc") === anonId("uid:abc") && anonId("uid:abc") !== anonId("uid:abd") && !anonId("uid:abc").includes("abc"), "анонимный id");
  const S = new Stats(); const flushed: any[] = [];
  S.db = { prepare: (q: string) => ({ bind: (...a: any[]) => ({ q, a }) }), batch: async (l: any[]) => { flushed.push(...l); return []; } };
  const now = Date.now();
  S.join("s1", "uid:a", true, now); S.join("s2", "guest:g", false, now); S.join("s3", "uid:a", true, now); // тот же игрок дважды
  ok(S.seenQ.length === 2, "уникальные за день — без дублей");
  S.inc("kills", 3); S.hero("s1", 12, "mage"); S.hero("s3", 13, "mage"); ok(S.todaySummary().heroes === 1 && S.todaySummary().levels["11-20"] === 1, "активные сегодня — по анонимному id");
  ok(S.clientStats("s1", { fps: 1e9, ping: -5, br: "<script>", mobile: 1 }) && S.client.get("s1")!.fps === 500 && S.client.get("s1")!.ping === 0 && S.client.get("s1")!.br === "other", "client_stats: обрезка и белый список");
  ok(!S.clientStats("s2", { fps: "x" }), "client_stats: мусор отклонён");
  S.leave("s2", now + 120_000); ok(S.sum.get("sl1") === 1 && S.sum.get("sess_done") === 1, "длина сессии → корзина 1–5 мин");
  S.leave("nope"); S.tick(now, 2, 0); ok(S.max.get("peak") === 2, "пик онлайна");
  await S.flush(now); ok(flushed.length >= 5 && S.sum.size === 0 && flushed.every((x) => !String(x.a).includes("uid:")), "flush: один batch, без pkey");
  const sql = flushed.map((x) => x.q).join(" "); ok(/MAX\(v, excluded.v\)/.test(sql) && /v = v \+ excluded.v/.test(sql), "upsert: сумма и максимум");
  console.log(fail ? `\n✖ ошибок: ${fail}` : "\n✔ perf-test: всё ок"); process.exit(fail ? 1 : 0);
})();
