// Публичный номер игрока вместо id Clerk: pidFor/pidsFor/uidForPid (src/lib/publicId.ts). bun tools/tests/public-id-test.ts
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { pidFor, pidsFor, uidForPid, defaultAvatar, PID_RE, CLERK_ID_RE } from "../../src/lib/publicId";
import { clearSettingsCache } from "../../src/lib/forum/settings";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
class Stmt { args: any[] = []; constructor(public db: Database, public sql: string) {} bind(...a: any[]) { this.args = a; return this; }
  async first() { return this.db.query(this.sql).get(...this.args) ?? null; } async all() { return { results: this.db.query(this.sql).all(...this.args) }; }
  async run() { const r = this.db.query(this.sql).run(...this.args); return { success: true, meta: { changes: r.changes } }; } }
const raw = new Database(":memory:"); const root = import.meta.dir + "/../../server/migrations/";
for (const f of ["0008_roles.sql", "0021_forum.sql", "0022_forum_profiles.sql", "0023_forum_notify_stats.sql"]) raw.exec(readFileSync(root + f, "utf8"));
raw.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, avatar_url TEXT)");
raw.exec("INSERT INTO users VALUES ('user_aaaaaaaaaaaa','Алиса',NULL),('user_bbbbbbbbbbbb','Боб',NULL)");
raw.exec("INSERT INTO forum_users (user_id, nick, nick_key, pid, first_seen, last_seen) VALUES ('user_ffffffffffff','Форумчанин','форумчанин',1,1,1)");
const db = { prepare: (sql: string) => new Stmt(raw, sql) };
clearSettingsCache();

ok(await pidFor(db, "user_ffffffffffff") === 1, "у участника форума — его номер с форума");
const a = await pidFor(db, "user_aaaaaaaaaaaa");
ok(a === 2, "игроку без профиля форума номер выдаётся (следующий)");
const row: any = raw.query("SELECT nick, last_seen FROM forum_users WHERE user_id = 'user_aaaaaaaaaaaa'").get();
ok(row.nick === "Алиса" && row.last_seen === 0, "тихий профиль форума: ник с сайта, не «в сети»");
ok(await pidFor(db, "user_aaaaaaaaaaaa") === 2, "номер постоянный");
const m = await pidsFor(db, ["user_aaaaaaaaaaaa", "user_bbbbbbbbbbbb", "user_aaaaaaaaaaaa", "user_ffffffffffff"]);
ok(m.get("user_aaaaaaaaaaaa") === 2 && m.get("user_bbbbbbbbbbbb") === 3 && m.get("user_ffffffffffff") === 1, "пачка для чата: все номера, недостающие созданы");
ok(await uidForPid(db, 3) === "user_bbbbbbbbbbbb" && await uidForPid(db, "99") === null, "номер → игрок");
ok(await uidForPid(db, "1 OR 1=1") === null && await uidForPid(db, "0") === null && await uidForPid(db, "01") === null, "мусор вместо номера — не найдено");
ok(PID_RE.test("12") && !PID_RE.test("user_x") && CLERK_ID_RE.test("user_3DXwtZDrVvY5qUFE09zD0z6fhtY") && !CLERK_ID_RE.test("user_<x>"), "форматы номера и старого id");
ok(defaultAvatar(5) === "/api/avatar/5", "аватар по умолчанию — /api/avatar/<номер>, без id Clerk");
{
  const { safeSvg } = await import("../../src/lib/defaultAvatar");
  const good = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><metadata><dc:source>https://x</dc:source></metadata><rect width="9" height="9" fill="#fff"/></svg>';
  ok(!!safeSvg(good), "SVG DiceBear (фигуры + metadata) проходит");
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><image href="https://evil/x.png"/></svg>', '<svg><a href="javascript:alert(1)">x</a></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>', '<svg><use href="//evil/s.svg#a"/></svg>', '<html><svg></svg></html>', '<svg><style>@import "https://evil";</style></svg>', '<svg>' + "x".repeat(200000) + '</svg>'])
    ok(safeSvg(bad) === null, "SVG отклоняется: " + bad.slice(0, 40));
}
// исходники: id Clerk не попадает в публичные ответы/страницы
const chatApi = readFileSync(import.meta.dir + "/../../src/pages/api/chat.ts", "utf8");
ok(/messages = results\.map\(\(m: any\) => \(\{ id: m\.id, message: m\.message, created_at: m\.created_at, pid:/.test(chatApi) && !/user_id: m\.user_id/.test(chatApi), "чат: наружу номер автора, без user_id");
const chatPage = readFileSync(import.meta.dir + "/../../src/pages/chat.astro", "utf8");
ok(!/m\.user_id/.test(chatPage), "страница чата не использует user_id");
const uPage = readFileSync(import.meta.dir + "/../../src/pages/u/[id].astro", "utf8");
ok(/status: 301/.test(uPage) && /publicItem\(row\)/.test(uPage) && !/seed=\$\{id\}/.test(uPage), "/u/: 301 со старого адреса, предметы без служебных полей, аватар без id");
{
  const { validTs } = await import("../../src/lib/forum/fmt");
  const n = Date.UTC(2026, 9, 21);
  ok(validTs(n - 1000, n) && !validTs(0, n) && !validTs(null, n) && !validTs(undefined, n) && !validTs(NaN, n) && !validTs("1792607869000", n) && !validTs(86_400_000, n) && !validTs(n + 3 * 86_400_000, n), "отметка времени: 0/пусто/мусор/будущее → не показывать (вместо 1970)");
}
console.log(`public-id-test: ${pass} PASS, ${fail} FAIL`); if (fail) process.exit(1);
