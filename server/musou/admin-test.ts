// Доступ админки «Орды»: только Clerk uid Lorin Death, как в шахматах.
import { LORIN_UID } from "../chess/admin-gate";
import { musouAdminHttp, d1TuneRepo, type TuneRepo, type TuneRow } from "./admin";
import { DEFAULT_TUNE, mobHp, resetTune, setTune, validateTune } from "../../src/scripts/musou/tune";

let fails = 0, n = 0;
const ok = (c: unknown, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };

function mem(): TuneRepo {
  let cur: TuneRow | null = null;
  const hist: TuneRow[] = [];
  return {
    async current() { return cur; },
    async history(limit) { return hist.slice().reverse().slice(0, limit); },
    async commit(tune, actor, note, base) {
      const revNow = cur?.rev || 0;
      if (base !== revNow) return { err: "conflict", rev: revNow };
      const row = { rev: revNow + 1, tune, note, actor, at: Date.now() };
      hist.push(row);
      cur = row;
      return { rev: row.rev };
    },
  };
}

function sqlDb() {
  let cur: any = null;
  const revs: any[] = [];
  const sqls: string[] = [];
  const binds: any[][] = [];
  return {
    sqls, binds,
    prepare(sql: string) {
      sqls.push(sql);
      let args: any[] = [];
      const api = {
        bind(...a: any[]) { args = a; binds.push(a); return api; },
        async first() { return sql.includes("FROM orda_tune WHERE") ? cur : null; },
        async all() { return { results: revs.slice().reverse().slice(0, args[0] || 8) }; },
        async run() {
          const row = { rev: args[0], data: args[1], note: args[2], actor: args[3], created_at: args[4] };
          if (sql.startsWith("INSERT INTO orda_tune_rev")) revs.push(row);
          if (sql.startsWith("INSERT INTO orda_tune ")) cur = row;
        },
      };
      return api;
    },
  };
}

const dev = { MC_DEV_TRUST_USERID: "1" };
function call(path: string, env: any, repo: TuneRepo | null, init: RequestInit = {}) {
  return musouAdminHttp(new Request("http://127.0.0.1:8787" + path, init), env, repo);
}

const repo = mem();
const anon = await call("/musou/admin/tune", dev, repo);
ok((await anon.json()).err === "auth" && anon.status === 401, "без uid админка закрыта");

const nick = await call("/musou/admin/tune", dev, repo, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nick: "Lorin Death", userId: LORIN_UID, tune: DEFAULT_TUNE, base: 0 }),
});
ok(nick.status === 401, "ник и userId в теле не открывают админку");

const other = await call("/musou/admin/tune?devUser=user_someone_else", dev, repo);
ok(other.status === 403, "чужой uid получает 403");

const closed = await call("/musou/admin/tune?devUser=" + LORIN_UID, {}, repo);
ok(closed.status === 401, "локальный devUser молчит, пока флаг стенда выключен");

const bearer = await call("/musou/admin/tune", dev, repo, { headers: { authorization: "Bearer abc.def.ghi" } });
ok(bearer.status === 401, "битый токен Clerk не проходит");

const plain = await call("/musou/admin/tune?devUser=" + LORIN_UID, dev, repo, {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: "{}",
});
ok(plain.status === 415, "не-JSON тело отклоняется");

const next = JSON.parse(JSON.stringify(DEFAULT_TUNE));
next.combat.mobHp = [30, 5, 16];
next.sql = "DROP TABLE orda_saves";
const bad = await call("/musou/admin/tune?devUser=" + LORIN_UID, dev, repo, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tune: next, note: "'; DROP TABLE orda_saves;--", base: 0 }),
});
ok(bad.status === 400, "лишнее поле и сырой SQL не записываются");

delete next.sql;
const saved = await call("/musou/admin/tune?devUser=" + LORIN_UID, dev, repo, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tune: next, note: "толще ближняя тварь", base: 0 }),
});
const body = await saved.json();
ok(saved.status === 200 && body.rev === 1 && body.tune.combat.mobHp[0] === 30, "Lorin записывает набор");
const checked = validateTune(body.tune);
if (checked.ok) setTune(checked.tune);
ok(mobHp(0, 1) === 32, "записанное здоровье видно следующему бою");
resetTune();

const clash = await call("/musou/admin/tune?devUser=" + LORIN_UID, dev, repo, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tune: DEFAULT_TUNE, note: "поверх", base: 0 }),
});
ok(clash.status === 409, "устаревшая версия не затирает чужую запись");

const back = await call("/musou/admin/rollback?devUser=" + LORIN_UID, dev, repo, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ rev: 1 }),
});
const backBody = await back.json();
ok(back.status === 200 && backBody.rev === 2 && backBody.tune.combat.mobHp[0] === 30, "откат пишет новую версию, не стирая журнал");

const db = sqlDb();
const via = await musouAdminHttp(new Request("http://127.0.0.1:8787/musou/admin/tune?devUser=" + LORIN_UID, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tune: DEFAULT_TUNE, note: "'; DROP TABLE orda_saves;--", base: 0 }),
}), { ...dev, GAME_DB: db });
ok(via.status === 200, "запись через SQL-репозиторий проходит");
ok(db.sqls.every((s) => !s.includes("DROP")) && db.binds.some((a) => a.includes("'; DROP TABLE orda_saves;--")), "текст заметки — параметр, не кусок запроса");
ok(d1TuneRepo(db) instanceof Object, "репозиторий D1 собран");

const pub = await call("/musou/tune", {}, null);
const pubBody = await pub.json();
ok(pub.status === 200 && pubBody.rev === 0 && pubBody.tune.economy.startGold === 150, "публичное чтение без базы отдаёт числа кода");

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}`);
process.exit(fails ? 1 : 0);
