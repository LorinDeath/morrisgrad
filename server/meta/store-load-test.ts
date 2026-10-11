// Юнит-тест устойчивости загрузки профиля (без сети): зависший D1 не блокирует вход навсегда.
// Запуск: esbuild server/meta/store-load-test.ts --bundle --platform=node --outfile=/tmp/slt.js && node /tmp/slt.js
import { ProfileStore } from "./store";
import { libraryHash } from "./library";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
ProfileStore.LOAD_TIMEOUT_MS = 300;
ProfileStore.LIB_TIMEOUT_MS = 150;

// Поддельная D1: режим hang — запросы не завершаются никогда; иначе — пустые результаты (новый игрок)
function fakeDb() {
  const st = { hangLib: false, hangBatch: false, batches: 0, libCalls: 0 };
  const never = () => new Promise<any>(() => {});
  const stmt = (sql: string) => ({
    sql,
    bind: (..._a: any[]) => stmt(sql),
    first: async () => { st.libCalls++; if (st.hangLib) return never(); return { value: libraryHash() }; },
  });
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (q: any[]) => { st.batches++; if (st.hangBatch) return never(); return q.map(() => ({ results: [] })); },
  };
  return { db, st };
}

(async () => {
  // 1) зависла сверка библиотеки (как в проде после деплоя) — профиль всё равно грузится, сверка перезапускается
  {
    const { db, st } = fakeDb();
    st.hangLib = true;
    const s = new ProfileStore(null, db);
    s.ensureLibrary();
    const t0 = Date.now();
    await s.load("guest:a");
    ok(s.accounts.has("guest:a") && Date.now() - t0 < 1000, `stuck library check does not block profile load (${Date.now() - t0} ms)`);
    ok(s.libReady === null, "stuck library promise discarded after timeout");
    st.hangLib = false;
    await s.ensureLibrary();
    ok(st.libCalls >= 2, "library check retried on next call");
  }
  // 2) зависла загрузка профиля — reject по тайм-ауту, повтор начинается заново и успешен
  {
    const { db, st } = fakeDb();
    const s = new ProfileStore(null, db);
    st.hangBatch = true;
    let err = "";
    const t0 = Date.now();
    await s.load("uid:x").catch((e) => { err = String(e?.message || e); });
    ok(/timeout/.test(err) && Date.now() - t0 < 1000, `stuck profile load rejects with timeout (${err})`);
    ok(!s.loading.has("uid:x"), "stuck promise removed from cache");
    st.hangBatch = false;
    await s.load("uid:x");
    ok(s.accounts.has("uid:x"), "retry after timeout loads the profile");
  }
  // 3) параллельные входы делят одну попытку; старая зависшая (старше тайм-аута) не переиспользуется
  {
    const { db, st } = fakeDb();
    const s = new ProfileStore(null, db);
    st.hangBatch = true;
    const p1 = s.load("uid:y").catch(() => "e1");
    const p2 = s.load("uid:y").catch(() => "e2");
    await sleep(20);
    ok(st.batches === 1, "concurrent loads share one in-flight attempt");
    // имитация «застрявшей» записи в кэше: время старта в прошлом
    s.loading.get("uid:y")!.at = Date.now() - 10_000;
    st.hangBatch = false;
    await s.load("uid:y");
    ok(s.accounts.has("uid:y") && st.batches === 2, "stale cached attempt discarded, fresh attempt succeeds");
    await Promise.all([p1, p2]);
  }
  // 4) поздний результат устаревшей попытки не перезаписывает уже загруженный профиль
  {
    const { db } = fakeDb();
    let release: (v: any) => void = () => {};
    let first = true;
    (db as any).batch = (q: any[]) => {
      if (first) { first = false; return new Promise((r) => { release = () => r(q.map(() => ({ results: [] }))); }); }
      return Promise.resolve(q.map(() => ({ results: [] })));
    };
    const s = new ProfileStore(null, db);
    await s.load("uid:z").catch(() => {});
    await s.load("uid:z");
    const acc = s.accounts.get("uid:z");
    acc!.creation = 42;
    release(null); await sleep(20);
    ok(s.accounts.get("uid:z") === acc && acc!.creation === 42, "late result of timed-out attempt ignored");
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
