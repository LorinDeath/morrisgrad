// Тесты форума: права (гость / пользователь / модератор / админ), CSRF, валидация, лайки, жалобы,
// фильтр мата, XSS-безопасный рендер, загрузка картинок. Запуск: bun tools/tests/forum-test.ts
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { handleForumApi } from "../../src/lib/forum/api";
import { renderMd, plainText } from "../../src/lib/forum/md";
import { filterText, compileWords, DEFAULT_WORDS } from "../../src/lib/forum/profanity";
import { clearSettingsCache } from "../../src/lib/forum/settings";
import { sniff, stripMeta } from "../../src/lib/forum/media";

let fails = 0, passes = 0;
const ok = (c: any, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };

// --- D1-совместимая обёртка над bun:sqlite ---
class Stmt {
  constructor(private db: Database, private sql: string, private args: any[] = []) {}
  bind(...a: any[]) { return new Stmt(this.db, this.sql, a); }
  async first() { return (this.db.query(this.sql).get(...this.args) as any) ?? null; }
  async all() { return { results: this.db.query(this.sql).all(...this.args) as any[] }; }
  async run() { const r = this.db.query(this.sql).run(...this.args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; }
  runSync() { return this.db.query(this.sql).run(...this.args); }
}
function d1() {
  const db = new Database(":memory:");
  const root = import.meta.dir + "/../../server/migrations/";
  db.exec(readFileSync(root + "0008_roles.sql", "utf8"));
  db.exec(readFileSync(root + "0021_forum.sql", "utf8"));
  db.exec(readFileSync(root + "0022_forum_profiles.sql", "utf8"));
  db.exec(readFileSync(root + "0023_forum_notify_stats.sql", "utf8"));
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, avatar_url TEXT)");
  db.exec("INSERT INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:admin1','admin','t',0),('uid:mod1','moderator','t',0)");
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (st: Stmt[]) => { db.transaction(() => { for (const s of st) s.runSync(); })(); return st.map(() => ({ success: true })); },
  };
}
const r2 = () => { const m = new Map<string, any>(); return { m, put: async (k: string, v: Uint8Array, o: any) => { m.set(k, { v, o }); }, delete: async (k: string) => { m.delete(k); }, get: async (k: string) => { const x = m.get(k); return x ? { body: x.v, httpMetadata: x.o.httpMetadata, httpEtag: "e" } : null; } }; };

const ORIGIN = "https://morrisgrad.com";
let env: any;
async function call(uid: string | null, method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const h: any = { origin: ORIGIN, "x-forum": "1", ...headers };
  let b: any = undefined;
  if (body instanceof Uint8Array) { b = body; h["content-length"] = String(body.length); }
  else if (body !== undefined) { b = JSON.stringify(body); h["content-type"] = "application/json"; }
  const req = new Request(ORIGIN + "/api/forum/" + path, { method, headers: h, body: b });
  const res = await handleForumApi(req, env, uid, path.split("?")[0]);
  let data: any = null; try { data = await res.clone().json(); } catch {}
  return { status: res.status, data, res };
}
const pidOf = (uid: string) => env.PROFILES_DB.raw.query("SELECT pid FROM forum_users WHERE user_id = ?").get(uid)?.pid;
const fresh = async (settings: any = {}) => {
  clearSettingsCache();
  env = { PROFILES_DB: d1(), FORUM_MEDIA: r2() };
  const base = { topic_cooldown_sec: 0, comment_cooldown_sec: 0, ...settings };
  for (const [k, v] of Object.entries(base)) env.PROFILES_DB.raw.query("INSERT OR REPLACE INTO forum_settings (key, value) VALUES (?, ?)").run(k, JSON.stringify(v));
  clearSettingsCache();
};

// ===== 1. Рендер разметки: XSS =====
{
  const h = renderMd(`<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[клик](javascript:alert(1))\n![a](javascript:alert(1))\n[x](https://a.com/"onmouseover=alert(1))\n![b](http://insecure.example/x.png)`);
  ok(!/<script|<img src=x|href="javascript|<[^>]*\sonmouseover|<[^>]*\sonerror/i.test(h), "XSS: сырые теги/JS-ссылки/атрибуты не проходят");
  ok(h.includes("&lt;script&gt;"), "XSS: теги экранируются как текст");
  ok(!h.includes('src="http://insecure'), "картинки только по https");
  const l = renderMd("смотри https://example.com/a?b=1&c=2 и [сайт](https://morrisgrad.com)");
  ok(/rel="nofollow noopener noreferrer ugc"/.test(l) && l.includes('href="https://example.com/a?b=1&amp;c=2"'), "внешние ссылки: rel=nofollow ugc, & экранирован");
  const f = renderMd("# Заголовок\n**жирный** *курсив* ~~зачёркнут~~ `код`\n> цитата\n- раз\n- два\n1. один\n```\n<b>код</b>\n```\n||спойлер||");
  ok(f.includes("<h2>Заголовок</h2>") && f.includes("<strong>жирный</strong>") && f.includes("<em>курсив</em>") && f.includes("<s>зачёркнут</s>") && f.includes("<code>код</code>") && f.includes("<blockquote>") && f.includes("<ul><li>раз</li>") && f.includes("<ol>") && f.includes("&lt;b&gt;код&lt;/b&gt;") && f.includes("f-spoiler"), "разметка: заголовок, жирный, курсив, зачёркнутый, код, цитата, списки, спойлер");
  const y = renderMd("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  ok(y.includes('data-yt="dQw4w9WgXcQ"') && !y.includes("<iframe"), "YouTube: лёгкая заглушка без iframe до клика");
  ok(renderMd("![](/api/forum/media/u/202610/abcdefgh12345678.webp)").includes('<figure class="f-fig"><img src="/api/forum/media/u/202610/abcdefgh12345678.webp"'), "своя картинка → figure");
  ok(!renderMd("![](/api/forum/media/../../secret)").includes("<img"), "чужой путь в медиа отклоняется");
  ok(plainText("## Тема\n**жирно** [ссылка](https://x.y) ![](https://x/y.png)") === "Тема жирно ссылка", "анонс без разметки");
}

// ===== 2. Фильтр мата =====
{
  const R = compileWords(DEFAULT_WORDS);
  for (const w of ["хуй", "х.у.й", "х у й", "xyй", "хуууй", "пиздец", "3аебал", "cyka", "блять", "fuck", "f.u.c.k", "підор", "йобаний", "мудак", "дебил", "нахуй", "охуеть"]) ok(!filterText(w, R).clean, `фильтр ловит «${w}»`);
  for (const w of ["застрахуй", "колебаться", "оскорблять", "употреблять", "себе", "небо", "Хохлома", "Нигерия", "Херсон", "ебонит", "debut", "ebay", "потребитель", "страхуется", "sublime"]) ok(filterText(w, R).clean, `без ложного срабатывания: «${w}»`);
  ok(filterText("ну ты и мудак, бро", R).text === "ну ты и м∗∗∗∗, бро", "маска сохраняет остальной текст и пунктуацию");
  for (const w of ["бл*ть", "х*й", "п#здец"]) ok(!filterText(w, R).clean, `звёздочка вместо буквы: «${w}»`);
  ok(filterText("2*3=6 и *важно*", R).clean, "звёздочки разметки/арифметики не считаются матом");
  ok(!renderMd(filterText("ты мудак и х.у.й", R).text).includes("<em>"), "маска не ломает разметку (нет случайного курсива)");
}

// ===== 3. Картинки: сигнатуры и EXIF =====
{
  ok(sniff(new TextEncoder().encode("<svg onload=alert(1)></svg>   ")) === null, "SVG/текст под видом картинки — отклоняется");
  const exif = new TextEncoder().encode("Exif\0\0GPS-SECRET");
  const app1 = new Uint8Array([0xff, 0xe1, 0, exif.length + 2, ...exif]);
  const jpg = new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9]);
  ok(sniff(jpg) === "image/jpeg", "JPEG распознан по сигнатуре");
  const st = stripMeta(jpg, "image/jpeg");
  ok(!new TextDecoder().decode(st).includes("GPS-SECRET") && st[0] === 0xff && st[1] === 0xd8 && st.includes(0xda), "EXIF (APP1) вырезан из JPEG, данные остались");
}

// ===== 4. API: права, CSRF, валидация =====
await fresh();
{
  let r = await call(null, "GET", "sections");
  ok(r.status === 200 && r.data.sections.length === 6, "гость видит разделы (6 стартовых)");
  ok((r.res.headers.get("cache-control") || "").includes("s-maxage"), "гостевые списки кэшируются на краю");
  r = await call(null, "POST", "topics", { section_id: 2, title: "Гость", body: "текст" });
  ok(r.status === 401, "гость не может создать тему → 401");
  r = await call("u1", "POST", "topics", { section_id: 2, title: "Без заголовка", body: "x" }, { "x-forum": "" });
  ok(r.status === 403, "без заголовка X-Forum → 403 (CSRF)");
  r = await call("u1", "POST", "topics", { section_id: 2, title: "Чужой сайт", body: "текст" }, { origin: "https://evil.example" });
  ok(r.status === 403, "чужой Origin → 403 (CSRF)");
  r = await call("u1", "POST", "topics", { section_id: 1, title: "В новости", body: "текст" });
  ok(r.status === 403, "в раздел «Новости» (только админы) пользователь не пишет → 403");
  r = await call("u1", "POST", "topics", { section_id: 2, title: "x".repeat(141), body: "текст" });
  ok(r.status === 400, "заголовок длиннее лимита → 400");
  r = await call("u1", "POST", "topics", { section_id: 2, title: "Норм", body: "" });
  ok(r.status === 400, "пустой текст → 400");
  r = await call("u1", "POST", "topics", { section_id: 2, title: "Первая тема <b>", body: "Привет <script>alert(1)</script> **мир**", kind: "article" });
  ok(r.status === 200 && r.data.id > 0, "пользователь создаёт тему");
  const tid = r.data.id;
  r = await call(null, "GET", "topic/" + tid);
  ok(r.status === 200 && !r.data.topic.body_html.includes("<script") && r.data.topic.body_html.includes("<strong>мир</strong>") && r.data.topic.body === undefined, "тема отдаётся с безопасным HTML, исходник гостю не отдаётся");
  ok(/^Игрок #\d+$/.test(r.data.topic.author.nick) && !("email" in r.data.topic.author), "автор: ник без персональных данных");
  const sec = env.PROFILES_DB.raw.query("SELECT topics_count, posts_count FROM forum_sections WHERE id = 2").get();
  ok(sec.topics_count === 1 && sec.posts_count === 1, "счётчики раздела обновлены (денормализация)");

  // админ-только
  for (const who of ["u1", "mod1"]) {
    r = await call(who, "POST", "sections", { slug: "x-sec", title: "Новый раздел" });
    ok(r.status === 403, `${who}: создать раздел нельзя → 403`);
    r = await call(who, "PUT", "settings", { comment_max: 500 });
    ok(r.status === 403, `${who}: менять настройки нельзя → 403`);
  }
  r = await call("u1", "GET", "reports"); ok(r.status === 403, "пользователь не видит очередь жалоб");
  r = await call("u1", "POST", "topic/" + tid + "/flag", { flag: "featured", value: true }); ok(r.status === 403, "пользователь не может закрепить/выбрать тему");
  r = await call("admin1", "POST", "sections", { slug: "guilds", title: "Гильдии", icon: "🛡" });
  ok(r.status === 200, "админ создаёт раздел");
  const gid = r.data.id;
  r = await call("admin1", "POST", "sections", { slug: "guilds", title: "Дубль" }); ok(r.status === 400, "дубль адреса раздела → 400");
  r = await call("admin1", "POST", "sections", { slug: "Плохой адрес", title: "X" }); ok(r.status === 400, "адрес раздела валидируется");
  r = await call("admin1", "PUT", "section/" + gid, { slug: "guilds", title: "Гильдии и кланы", icon: "🛡" }); ok(r.status === 200, "админ переименовывает раздел");
  r = await call("admin1", "POST", "sections/order", { ids: [gid, 1, 2, 3, 4, 5, 6] }); ok(r.status === 200, "админ меняет порядок");
  r = await call(null, "GET", "sections"); ok(r.data.sections[0].id === gid && r.data.sections[0].title === "Гильдии и кланы", "порядок и название применились");
  r = await call("admin1", "DELETE", "section/2"); ok(r.status === 400, "раздел с темами без переноса не удаляется");
  r = await call("admin1", "DELETE", "section/2?move_to=" + gid); ok(r.status === 200, "удаление раздела с переносом тем");
  r = await call(null, "GET", "topic/" + tid); ok(r.data.topic.section_id === gid, "тема перенесена в другой раздел");
  r = await call("mod1", "POST", "topic/" + tid + "/flag", { flag: "featured", value: true }); ok(r.status === 200, "модератор отмечает тему как рекомендованную");
  r = await call("admin1", "PUT", "settings", { comment_max: 5 }); ok(r.status === 400, "настройка вне диапазона → 400");
  r = await call("admin1", "PUT", "settings", { bogus: 1 }); ok(r.status === 400, "неизвестная настройка → 400");

  // лайки
  r = await call("u1", "POST", "like", { type: "t", id: tid }); ok(r.status === 400, "свою тему лайкнуть нельзя");
  r = await call("u2", "POST", "like", { type: "t", id: tid }); ok(r.status === 200 && r.data.liked && r.data.likes === 1, "лайк ставится");
  r = await call("u3", "POST", "like", { type: "t", id: tid }); ok(r.data.likes === 2, "второй пользователь — 2 лайка");
  r = await call("u2", "POST", "like", { type: "t", id: tid }); ok(r.data.liked === false && r.data.likes === 1, "повторный лайк снимает (переключатель)");
  r = await call("u2", "POST", "like", { type: "t", id: tid });
  const n = env.PROFILES_DB.raw.query("SELECT COUNT(*) AS n FROM forum_likes WHERE user_id='u2' AND target_type='t' AND target_id=?").get(tid).n;
  ok(n === 1, "один лайк на пользователя (уникальность в БД)");
  let dup = false; try { env.PROFILES_DB.raw.query("INSERT INTO forum_likes VALUES ('u2','t',?,1)").run(tid); } catch { dup = true; }
  ok(dup, "дубль лайка отвергается первичным ключом");
  const karma = env.PROFILES_DB.raw.query("SELECT karma FROM forum_users WHERE user_id='u1'").get().karma;
  ok(karma === 2, "карма автора = полученные лайки");
  r = await call("u2", "GET", "feed?tab=rec"); ok(r.data.items[0].id === tid && r.data.items[0].liked === true && r.data.items[0].featured === 1, "лента «Рекомендованное»: выбранная тема сверху, отмечен свой лайк");

  // комментарии, ответы, правка/удаление
  r = await call("u2", "POST", "topic/" + tid + "/comments", { body: "Отличная тема!" }); const c1 = r.data.id; ok(r.status === 200, "комментарий");
  r = await call("u3", "POST", "topic/" + tid + "/comments", { body: "Согласен", reply_to: c1 }); const c2 = r.data.id;
  r = await call("u1", "POST", "topic/" + tid + "/comments", { body: "Ответ на ответ", reply_to: c2 });
  r = await call(null, "GET", "comments/" + tid);
  ok(r.data.items.length === 1 && r.data.items[0].replies.length === 2 && r.data.items[0].replies[1].reply_nick, "ветка: ответы собраны под корнем (1 уровень), видно кому ответ");
  r = await call("u3", "PUT", "comment/" + c1, { body: "взлом" }); ok(r.status === 403, "чужой комментарий править нельзя");
  r = await call("u3", "DELETE", "comment/" + c1); ok(r.status === 403, "чужой комментарий удалить нельзя");
  r = await call("u2", "PUT", "comment/" + c1, { body: "Отличная тема, правда!" }); ok(r.status === 200, "свой комментарий правится");
  r = await call("mod1", "DELETE", "comment/" + c2); ok(r.status === 200, "модератор удаляет любой комментарий");
  r = await call(null, "GET", "topic/" + tid); ok(r.data.topic.comments_count === 2, "счётчик комментариев уменьшился");
  r = await call("mod1", "GET", "modlog"); ok(r.data.log.some((x: any) => x.action === "comment_delete"), "действие модератора записано в журнал");

  // закрытая тема
  await call("mod1", "POST", "topic/" + tid + "/flag", { flag: "locked", value: true });
  r = await call("u2", "POST", "topic/" + tid + "/comments", { body: "ещё" }); ok(r.status === 403, "в закрытую тему писать нельзя");
  await call("mod1", "POST", "topic/" + tid + "/flag", { flag: "locked", value: false });

  // жалобы → автоскрытие → очередь
  r = await call("u4", "POST", "topics", { section_id: 3, title: "Спам-тема", body: "купи-продай" }); const spam = r.data.id;
  for (const who of ["u1", "u2"]) await call(who, "POST", "report", { type: "t", id: spam, reason: "спам" });
  r = await call("u2", "POST", "report", { type: "t", id: spam }); ok(r.data.already, "повторная жалоба того же пользователя не считается");
  r = await call(null, "GET", "topic/" + spam); ok(r.status === 200, "после 2 жалоб тема ещё видна");
  r = await call("u3", "POST", "report", { type: "t", id: spam, reason: "реклама" }); ok(r.data.autoHidden, "3-я жалоба → автоскрытие");
  r = await call(null, "GET", "topic/" + spam); ok(r.status === 404, "скрытая тема не видна гостям");
  r = await call("u4", "GET", "topic/" + spam); ok(r.status === 200 && r.data.topic.hidden === 1, "автор видит свою скрытую тему (с пометкой)");
  r = await call("mod1", "GET", "reports"); ok(r.data.reports[0]?.target_id === spam && r.data.reports[0].n === 3, "тема в очереди жалоб с числом жалоб");
  r = await call("mod1", "POST", "reports/resolve", { type: "t", id: spam, action: "delete" }); ok(r.status === 200, "модератор удаляет по жалобе");
  r = await call("mod1", "GET", "reports"); ok(r.data.reports.length === 0, "очередь пуста после решения");

  // бан
  r = await call("u4", "POST", "ban", { user_id: "u1", minutes: 60 }); ok(r.status === 403, "пользователь не может банить");
  r = await call("mod1", "POST", "ban", { user_id: "admin1", minutes: 60 }); ok(r.status === 403, "модератор не может забанить админа");
  r = await call("mod1", "POST", "ban", { user_id: "u4", minutes: 60, reason: "спам" }); ok(r.status === 200, "модератор ограничивает пользователя на 60 мин");
  r = await call("u4", "POST", "topic/" + tid + "/comments", { body: "я снова тут" }); ok(r.status === 403 && r.data.code === "banned", "забаненный не пишет");
  r = await call("u4", "POST", "like", { type: "t", id: tid }); ok(r.status === 403, "забаненный не лайкает");
  r = await call(null, "GET", "topic/" + tid); ok(r.status === 200, "читать форум забаненный/гость может");
  await call("mod1", "POST", "unban", { user_id: "u4" });
  r = await call("u4", "POST", "topic/" + tid + "/comments", { body: "спасибо" }); ok(r.status === 200, "после снятия ограничения снова пишет");

  // блокировка автора для себя
  await call("u2", "POST", "block", { user_id: "u1" });
  r = await call("u2", "GET", "feed?tab=new"); ok(!r.data.items.some((x: any) => x.author.pid === pidOf("u1")), "скрытый автор пропал из ленты у того, кто скрыл");
  r = await call("u3", "GET", "feed?tab=new"); ok(r.data.items.some((x: any) => x.author.pid === pidOf("u1")), "у остальных автор виден");

  // ник
  r = await call("u2", "PUT", "me", { nick: "Админ" }); ok(r.status === 400, "системный ник запрещён");
  r = await call("u2", "PUT", "me", { nick: "Лорин" }); ok(r.status === 200, "ник меняется");
  r = await call("u3", "PUT", "me", { nick: "лорин" }); ok(r.status === 400, "ник уникален без учёта регистра");
}

// ===== 4б. Модераторы форума: назначение админом, зона раздела, мягкое удаление и восстановление =====
await fresh();
{
  for (const u of ["fm_all", "fm_sec", "w1", "w2"]) await call(u, "GET", "me", undefined); // GET не создаёт профиль
  for (const u of ["fm_all", "fm_sec", "w1", "w2"]) await call(u, "PUT", "me", { nick: "Ник_" + u });
  let r = await call("u1", "POST", "moderators", { nick: "Ник_fm_all", section_id: 0 }); ok(r.status === 403, "пользователь не назначает модераторов");
  r = await call("mod1", "POST", "moderators", { nick: "Ник_fm_all", section_id: 0 }); ok(r.status === 403, "модератор не назначает модераторов (только админ)");
  r = await call("admin1", "POST", "moderators", { nick: "Ник_fm_all", section_id: 0 }); ok(r.status === 200, "админ назначает модератора всего форума");
  r = await call("admin1", "POST", "moderators", { nick: "Ник_fm_sec", section_id: 3 }); ok(r.status === 200, "админ назначает модератора раздела");
  const tA = (await call("w1", "POST", "topics", { section_id: 3, title: "Тема в лоре", body: "текст" })).data.id;
  const tB = (await call("w1", "POST", "topics", { section_id: 5, title: "Тема в таверне", body: "текст" })).data.id;
  const cA = (await call("w2", "POST", "topic/" + tA + "/comments", { body: "коммент A" })).data.id;
  const cB = (await call("w2", "POST", "topic/" + tB + "/comments", { body: "коммент B" })).data.id;
  r = await call("w2", "DELETE", "topic/" + tA); ok(r.status === 403, "обычный пользователь не удаляет чужую тему");
  r = await call("fm_sec", "DELETE", "comment/" + cB); ok(r.status === 403, "модератор раздела не трогает другой раздел");
  r = await call("fm_sec", "PUT", "comment/" + cA, { body: "правка модератора" }); ok(r.status === 403, "модератор не правит чужой комментарий");
  r = await call("fm_all", "PUT", "topic/" + tA, { title: "Правка модератора", body: "текст" }); ok(r.status === 403, "модератор форума не правит чужую тему");
  r = await call("mod1", "PUT", "comment/" + cA, { body: "правка" }); ok(r.status === 403, "модератор игры не правит чужой комментарий");
  r = await call("w2", "PUT", "comment/" + cA, { body: "коммент A" }); ok(r.status === 200, "автор правит свой комментарий");
  r = await call("admin1", "PUT", "topic/" + tA, { title: "Тема в лоре", body: "текст" }); ok(r.status === 200, "админ по-прежнему может править");
  r = await call("fm_sec", "POST", "comment/" + cA + "/hide", { value: true }); ok(r.status === 200, "модератор раздела скрывает комментарий в своём разделе");
  r = await call("fm_sec", "POST", "comment/" + cA + "/hide", { value: false }); ok(r.status === 200, "…и возвращает его");
  r = await call("fm_sec", "DELETE", "comment/" + cA + "?reason=" + encodeURIComponent("оффтоп")); ok(r.status === 200, "модератор раздела удаляет комментарий в своём разделе");
  r = await call("fm_all", "DELETE", "topic/" + tB + "?reason=" + encodeURIComponent("спам")); ok(r.status === 200, "модератор форума удаляет тему в любом разделе");
  r = await call("mod1", "DELETE", "comment/" + cB); ok(r.status === 404 || r.status === 200, "модератор игры тоже модерирует форум");
  r = await call("fm_all", "POST", "sections", { slug: "zz", title: "Нельзя" }); ok(r.status === 403, "модератор форума не управляет разделами");
  r = await call("fm_all", "PUT", "settings", { filter_mode: "off" }); ok(r.status === 403, "модератор форума не меняет фильтр/лимиты");
  r = await call("admin1", "GET", "modlog");
  const del = r.data.log.find((x: any) => x.action === "topic_delete" && x.target_id === String(tB));
  ok(del && del.actor_pid === pidOf("fm_all") && del.details.includes("спам") && del.created_at > 0, "удаление в журнале: кто, что, когда, причина");
  ok(r.data.log.some((x: any) => x.action === "comment_delete" && x.details.includes("оффтоп")), "удаление комментария записано с причиной");
  const row = env.PROFILES_DB.raw.query("SELECT deleted, body, deleted_by FROM forum_topics WHERE id = ?").get(tB);
  ok(row.deleted === 1 && row.body === "текст" && row.deleted_by === "fm_all", "удаление мягкое: текст сохранён");
  r = await call(null, "GET", "topic/" + tB); ok(r.status === 404, "удалённая тема скрыта от всех");
  r = await call("fm_all", "POST", "topic/" + tB + "/restore", {}); ok(r.status === 403, "восстанавливает только админ");
  r = await call("admin1", "POST", "topic/" + tB + "/restore", {}); ok(r.status === 200, "админ восстанавливает тему");
  r = await call(null, "GET", "topic/" + tB); ok(r.status === 200 && r.data.topic.comments_count >= 0, "тема снова видна");
  r = await call("admin1", "POST", "comment/" + cA + "/restore", {}); ok(r.status === 200, "админ восстанавливает комментарий");
  r = await call(null, "GET", "comments/" + tA); ok(r.data.items[0].body_html.includes("коммент A"), "комментарий снова виден");
  r = await call("fm_sec", "GET", "reports"); ok(r.status === 200, "модератор раздела видит очередь жалоб (своих разделов)");
  r = await call("fm_sec", "POST", "ban", { user_id: "fm_all", minutes: 10 }); ok(r.status === 403, "модератор не может ограничить другого модератора");
  r = await call("fm_sec", "POST", "ban", { user_id: "w2", minutes: 10 }); ok(r.status === 200, "модератор ограничивает участника");
  r = await call("admin1", "POST", "moderators/remove", { user_id: "fm_sec", section_id: 3 }); ok(r.status === 200, "админ снимает модератора");
  r = await call("fm_sec", "POST", "comment/" + cA + "/hide", { value: true }); ok(r.status === 403, "после снятия права пропали");
  r = await call(null, "GET", "topic/" + tA); ok(r.status === 200, "чтение работает");
  const t2 = await call(null, "GET", "topic/" + tB); ok(t2.data.topic.author.nick === "Ник_w1", "автор не меняется при восстановлении");
  r = await call("admin1", "GET", "moderators"); ok(r.data.forum.length === 1 && r.data.forum[0].pid === pidOf("fm_all") && r.data.forum[0].nick === "Ник_fm_all", "список модераторов форума");
}

// ===== 5. Фильтр в API: маска и блок =====
await fresh({ filter_mode: "mask" });
{
  let r = await call("u1", "POST", "topics", { section_id: 2, title: "Тест фильтра", body: "Ну ты и мудак, х.у.й тебе" });
  const t = await call(null, "GET", "topic/" + r.data.id);
  ok(!/мудак|х\.у\.й/.test(t.data.topic.body_html) && t.data.topic.body_html.includes("м∗∗"), "режим mask: мат заменён звёздочками");
  await call("admin1", "PUT", "settings", { filter_mode: "block" });
  r = await call("u2", "POST", "topic/" + t.data.topic.id + "/comments", { body: "сука" });
  ok(r.status === 400 && r.data.code === "profanity", "режим block: запись с матом отклоняется с дружелюбным текстом");
  await call("admin1", "PUT", "settings", { filter_words: ["капуст"] });
  r = await call("u2", "POST", "topic/" + t.data.topic.id + "/comments", { body: "люблю капусту" });
  ok(r.status === 400, "словарь редактируется админом (своё слово ловится)");
}

// ===== 6. Лимиты (анти-спам) =====
await fresh({ topic_cooldown_sec: 60, comment_cooldown_sec: 10, min_account_age_min: 0 });
{
  let r = await call("u1", "POST", "topics", { section_id: 2, title: "Раз", body: "текст" });
  r = await call("u1", "POST", "topics", { section_id: 2, title: "Два", body: "текст" }); ok(r.status === 429, "пауза между темами → 429");
  r = await call("admin1", "POST", "topics", { section_id: 2, title: "Админ 1", body: "т" + "екст" });
  r = await call("admin1", "POST", "topics", { section_id: 2, title: "Админ 2", body: "текст" }); ok(r.status === 200, "админа лимит паузы не касается");
}
await fresh({ min_account_age_min: 10 });
{
  const r = await call("newbie", "POST", "topics", { section_id: 2, title: "Я новенький", body: "текст" }); ok(r.status === 429 && r.data.code === "age", "минимальный «возраст» на форуме");
}

// ===== 7. Загрузка картинок =====
await fresh();
{
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  let r = await call(null, "POST", "upload", png, { "content-type": "image/png" }); ok(r.status === 401, "гость не загружает картинки");
  r = await call("u1", "POST", "upload", new TextEncoder().encode("<html><script>alert(1)</script></html>"), { "content-type": "image/png" });
  ok(r.status === 415, "HTML под видом PNG отклоняется по сигнатуре");
  r = await call("u1", "POST", "upload", png, { "content-type": "image/png" }); ok(r.status === 200 && /^u\/\d{6}\/[a-z0-9]{16}\.png$/.test(r.data.key), "PNG загружен, ключ случайный");
  const g = await call(null, "GET", "media/" + r.data.key);
  ok(g.status === 200 && g.res.headers.get("content-type") === "image/png" && (g.res.headers.get("cache-control") || "").includes("immutable") && g.res.headers.get("x-content-type-options") === "nosniff", "картинка отдаётся с верным типом, долгим кэшем и nosniff");
  r = await call("u1", "POST", "upload", new Uint8Array(6 * 1024 * 1024), { "content-type": "image/png" }); ok(r.status === 413, "больше 5 МБ → 413");
  r = await call("u1", "POST", "topics", { section_id: 2, title: "С обложкой", body: "текст", cover: "u/202601/zzzzzzzzzzzzzzzz.png" }); ok(r.status === 400, "обложка — только своя загруженная картинка");
}

// ===== 8. Публичные профили: никаких Clerk id наружу, адреса по номеру, ники =====
await fresh();
{
  const CLERK = "user_3DXwtZDrVvY5qUFE09zD0z6fhtY", MOD = "user_2ModeratorGameAbCdEf123";
  env.PROFILES_DB.raw.exec(`INSERT INTO users (id, username) VALUES ('${CLERK}', 'Тёмный_Рыцарь'), ('${MOD}', NULL), ('u_bad', 'хуйло'), ('u_cl', 'user_abcdefgh12')`);
  env.PROFILES_DB.raw.exec(`INSERT INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${MOD}', 'moderator', 't', 0)`);
  let r = await call(CLERK, "POST", "topics", { section_id: 2, title: "Тема от игрока", body: "текст" });
  const tid = r.data.id;
  await call("u2", "POST", "topic/" + tid + "/comments", { body: "ответ" });
  await call(CLERK, "POST", "topic/" + tid + "/comments", { body: "и я" });
  r = await call(CLERK, "GET", "me");
  ok(r.data.pid > 0 && r.data.user.nick === "Тёмный_Рыцарь" && !JSON.stringify(r.data).includes(CLERK), "ник берётся из игры, /me без Clerk id");
  const p = r.data.pid;
  r = await call("u_bad", "GET", "me"); await call("u_bad", "PUT", "me", { signature: "" });
  ok(/^Игрок #\d+$/.test((await call("u_bad", "GET", "me")).data.user.nick), "грубый ник из игры не берётся → «Игрок #N»");
  await call("u_cl", "PUT", "me", { signature: "" });
  ok(/^Игрок #\d+$/.test((await call("u_cl", "GET", "me")).data.user.nick), "ник, похожий на Clerk id, не берётся");
  r = await call("u2", "PUT", "me", { nick: "user_abcdef1234" }); ok(r.status === 400, "ник в виде Clerk id запрещён");
  r = await call("u2", "PUT", "me", { nick: "Игрок #1" }); ok(r.status === 400, "ник «Игрок #N» занят системой");
  r = await call("u2", "PUT", "me", { nick: "Мудила" }); ok(r.status === 400, "ник с оскорблением запрещён");
  await call("admin1", "PUT", "settings", { filter_mode: "off" });
  r = await call("u2", "PUT", "me", { nick: "Мудила" }); ok(r.status === 400, "ник проверяется даже при выключенном фильтре текстов");
  await call("admin1", "PUT", "settings", { filter_mode: "mask" });
  await call("mod1", "POST", "ban", { pid: pidOf("u_bad"), minutes: 5, reason: "тест" });
  await call("admin1", "POST", "moderators", { nick: "Тёмный_Рыцарь", section_id: 2 });
  await call(MOD, "POST", "topic/" + tid + "/flag", { flag: "pinned", value: true }); // игровой модератор действует → журнал
  await call(CLERK, "POST", "report", { type: "c", id: 1, reason: "x" });
  const pub = ["feed?tab=new", "feed?tab=rec", "sections", "section/curse", "topic/" + tid, "comments/" + tid, "user/" + p, "online", "team"];
  let leaks: string[] = [];
  for (const path of pub) for (const who of [null, "u2", CLERK]) {
    const x = await call(who, "GET", path);
    const txt = JSON.stringify(x.data);
    if (x.status !== 200) leaks.push(path + ":" + x.status);
    for (const id of [CLERK, MOD, "u2", "admin1", "mod1"]) if (txt.includes(`"${id}"`)) leaks.push(path + "→" + id);
    if (/"user_id"|"last_post_user"|"last_comment_user"|"deleted_by"/.test(txt)) leaks.push(path + "→field");
  }
  for (const path of ["bans", "modlog", "reports", "moderators", "users?q=т", "blocks"]) {
    const x = await call("admin1", "GET", path);
    const txt = JSON.stringify(x.data);
    for (const id of [CLERK, MOD, "u2", "u_bad", "admin1", "mod1"]) if (txt.includes(`"${id}"`)) leaks.push("admin " + path + "→" + id);
  }
  ok(leaks.length === 0, "публичные и админские ответы API не содержат Clerk id: " + leaks.slice(0, 5).join(", "));
  r = await call(null, "GET", "team");
  ok(r.data.team.some((m: any) => m.role === "moderator" && /^Игрок #\d+$/.test(m.nick) && m.pid > 0), "команда: игровой модератор без профиля показан как «Игрок #N», не id");
  ok(r.data.team.some((m: any) => m.nick === "Тёмный_Рыцарь" && m.scope.includes("Проклятые")), "команда: модератор раздела с зоной");
  r = await call(null, "GET", "user/" + p); ok(r.status === 200 && r.data.user.pid === p && r.data.user.nick === "Тёмный_Рыцарь", "профиль по номеру");
  r = await call(null, "GET", "user/" + encodeURIComponent(CLERK)); ok(r.status === 200 && r.data.user.pid === p, "старый адрес по userId находит профиль (для редиректа)");
  r = await call("admin1", "GET", "modlog");
  ok(r.data.log.some((l: any) => l.action === "ban" && l.target_id === String(pidOf("u_bad")) && l.target_nick), "журнал: цель — номер и ник участника");
  r = await call("u2", "GET", "users?q=т"); ok(r.status === 403, "поиск участников — только модераторам");
  r = await call("admin1", "GET", "users?q=тём"); ok(r.data.users.length === 1 && r.data.users[0].nick === "Тёмный_Рыцарь" && r.data.users[0].pid === p, "поиск по началу ника");
  r = await call("u2", "POST", "block", { pid: p }); ok(r.status === 200, "скрыть автора по номеру");
  r = await call("u2", "GET", "blocks"); ok(r.data.blocks[0].pid === p && !JSON.stringify(r.data).includes(CLERK), "список скрытых — без id");
  r = await call("admin1", "POST", "moderators/remove", { pid: p, section_id: 2 }); ok(r.status === 200, "снять модератора по номеру");
}

// ===== 9. Аватары =====
await fresh();
{
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: number[]) => [...be32(data.length), ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const png = (w: number, h: number, meta = false) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be32(w), ...be32(h), 8, 6, 0, 0, 0]),
    ...(meta ? chunk("tEXt", Array.from("GPS\u000050.45,30.52", (c) => c.charCodeAt(0))) : []),
    ...chunk("IDAT", [1, 2, 3]), ...chunk("IEND", [])]);
  const H = { "content-type": "image/png" };
  let r = await call(null, "POST", "avatar", png(256, 256), H); ok(r.status === 401, "гость не ставит аватар");
  r = await call("u1", "POST", "avatar", new TextEncoder().encode("<svg onload=alert(1)>"), H); ok(r.status === 415, "аватар: проверка сигнатуры");
  r = await call("u1", "POST", "avatar", new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 1, 1, 1, 0, 0, 0]), { "content-type": "image/gif" }); ok(r.status === 415, "аватар: GIF не принимается");
  r = await call("u1", "POST", "avatar", png(400, 200), H); ok(r.status === 400, "аватар: только квадрат");
  r = await call("u1", "POST", "avatar", png(4000, 4000), H); ok(r.status === 400, "аватар: не больше 1024px");
  r = await call("u1", "POST", "avatar", new Uint8Array(500 * 1024), H); ok(r.status === 413, "аватар: лимит размера");
  r = await call("u1", "POST", "avatar", png(256, 256, true), H);
  ok(r.status === 200 && /^a\/\d{6}\/[a-z0-9]{16}\.png$/.test(r.data.avatar), "аватар загружен, ключ случайный и без id");
  const k1 = r.data.avatar;
  const stored = env.FORUM_MEDIA.m.get(k1).v as Uint8Array;
  ok(!new TextDecoder().decode(stored).includes("GPS"), "метаданные из аватара удалены");
  r = await call(null, "GET", "media/" + k1); ok(r.status === 200 && (r.res.headers.get("cache-control") || "").includes("immutable"), "аватар отдаётся с долгим кэшем");
  const tid = (await call("u1", "POST", "topics", { section_id: 2, title: "С аватаром", body: "текст" })).data.id;
  await call("u1", "POST", "topic/" + tid + "/comments", { body: "коммент" });
  r = await call(null, "GET", "topic/" + tid);
  ok(r.data.topic.author.avatar === k1 && r.data.comments.items[0].author.avatar === k1, "аватар у темы и комментария");
  r = await call(null, "GET", "feed?tab=new"); ok(r.data.items[0].author.avatar === k1, "аватар в ленте");
  r = await call(null, "GET", "online"); ok(r.data.online.some((x: any) => x.avatar === k1), "аватар в «Кто на форуме»");
  r = await call("u1", "POST", "avatar", png(128, 128), H); const k2 = r.data.avatar;
  ok(r.status === 200 && k2 !== k1 && !env.FORUM_MEDIA.m.has(k1), "замена аватара удаляет старый файл");
  r = await call("u2", "POST", "user/" + pidOf("u1") + "/avatar-remove", { reason: "x" }); ok(r.status === 403, "обычный участник не убирает чужой аватар");
  await call("admin1", "GET", "me");
  await call("admin1", "POST", "avatar", png(64, 64), H);
  r = await call("mod1", "POST", "user/" + pidOf("admin1") + "/avatar-remove", { reason: "x" }); ok(r.status === 403, "модератор не убирает аватар админа");
  r = await call("mod1", "POST", "user/" + pidOf("u1") + "/avatar-remove", { reason: "неуместно" }); ok(r.status === 200, "модератор убирает неуместный аватар");
  r = await call(null, "GET", "user/" + pidOf("u1")); ok(r.data.user.avatar === null, "аватар убран — показывается сгенерированный");
  r = await call("admin1", "GET", "modlog"); ok(r.data.log.some((l: any) => l.action === "avatar_remove" && l.details.includes("неуместно") && l.target_id === String(pidOf("u1"))), "удаление аватара в журнале");
  r = await call("admin1", "DELETE", "me/avatar"); ok(r.status === 200 && (await call("admin1", "GET", "me")).data.user.avatar === null, "свой аватар можно удалить");
  await fresh({ avatars_per_day: 2 });
  await call("u5", "POST", "avatar", png(64, 64), H); await call("u5", "POST", "avatar", png(64, 64), H);
  r = await call("u5", "POST", "avatar", png(64, 64), H); ok(r.status === 429, "лимит смен аватара в сутки");
  r = await call("u5", "POST", "upload", png(64, 64), H); ok(r.status === 200, "лимит аватаров не трогает загрузку картинок в посты");
}

// ===== Уведомления и статистика (0023) =====
{
  await fresh({ comments_page_size: 10 });
  const raw = env.PROFILES_DB.raw;
  raw.query("INSERT INTO users (id, username) VALUES ('n1','Алиса'),('n2','Борис'),('n3','Вера'),('n4','Глеб')").run();
  for (const u of ["n1", "n2", "n3", "n4", "mod1", "admin1"]) await call(u, "PUT", "me", {});
  const cnt = async (u: string) => (await call(u, "GET", "notifs/count")).data.n;
  const list = async (u: string) => (await call(u, "GET", "notifs")).data.items;
  let r: any = await call(null, "GET", "notifs/count");
  ok(r.status === 200 && r.data.n === null && (r.res.headers.get("cache-control") || "").includes("no-store"), "счётчик для гостя: null, no-store");
  r = await call(null, "GET", "notifs"); ok(r.status === 401, "список уведомлений гостю не отдаётся");
  const tid = (await call("n1", "POST", "topics", { section_id: 2, title: "Тема Алисы", body: "привет" })).data.id;
  ok(raw.query("SELECT COUNT(*) AS n FROM forum_subs WHERE user_id='n1' AND kind='t' AND target_id=?").get(tid).n === 1, "автор автоматически следит за своей темой");
  ok(await cnt("n1") === 0, "своя тема не даёт уведомлений себе");
  // комментарий в теме → автору
  const c1 = (await call("n2", "POST", "topic/" + tid + "/comments", { body: "первый коммент" })).data.id;
  ok(await cnt("n1") === 1, "комментарий в моей теме → уведомление");
  await call("n3", "POST", "topic/" + tid + "/comments", { body: "второй коммент" });
  let L = await list("n1");
  ok(L.length === 1 && L[0].type === "comment" && L[0].actors === 2, "комментарии в теме агрегируются (X и ещё N)");
  // ответ на комментарий → автору комментария (type reply), автор темы получает comment
  const c3 = (await call("n1", "POST", "topic/" + tid + "/comments", { body: "отвечаю Борису", reply_to: c1 })).data.id;
  L = await list("n2");
  ok(L.some((x: any) => x.type === "reply" && x.comment_id === c3), "ответ на мой комментарий → уведомление reply");
  ok(!L.some((x: any) => x.type === "sub_topic"), "без подписки на тему — нет sub_topic");
  ok((await list("n1")).length === 1, "свой ответ в своей теме — не уведомляет себя");
  // упоминание
  await call("n2", "POST", "topic/" + tid + "/comments", { body: "@Глеб посмотри, и @Борис тоже (это я)" });
  L = await list("n4");
  ok(L.length === 1 && L[0].type === "mention", "упоминание по нику → уведомление");
  ok(!(await list("n2")).some((x: any) => x.type === "mention"), "упоминание себя не уведомляет");
  // подписка на тему
  r = await call("n4", "POST", "sub", { kind: "t", id: tid, value: true }); ok(r.status === 200 && r.data.subscribed, "подписка на тему");
  r = await call("n4", "GET", "topic/" + tid); ok(r.data.topic.subscribed === true, "тема показывает, что я подписан");
  await call("n3", "POST", "topic/" + tid + "/comments", { body: "новость для подписчиков" });
  await call("n2", "POST", "topic/" + tid + "/comments", { body: "и ещё" });
  L = await list("n4");
  const st = L.find((x: any) => x.type === "sub_topic");
  ok(st && st.actors === 2, "активность в теме → подписчику, агрегировано");
  await call("n4", "POST", "sub", { kind: "t", id: tid, value: false });
  r = await call("n4", "GET", "topic/" + tid); ok(r.data.topic.subscribed === false, "отписка от темы");
  r = await call("n4", "POST", "sub", { kind: "t", id: 99999, value: true }); ok(r.status === 404, "подписка на несуществующую тему — 404");
  r = await call(null, "POST", "sub", { kind: "t", id: tid, value: true }); ok(r.status === 401, "гость не подписывается");
  // подписка на раздел
  await call("n4", "POST", "sub", { kind: "s", id: 2, value: true });
  const tid2 = (await call("n3", "POST", "topics", { section_id: 2, title: "Новая тема Веры", body: "текст" })).data.id;
  ok((await list("n4")).some((x: any) => x.type === "sub_section" && x.topic_id === tid2), "новая тема в разделе → подписчику раздела");
  ok(!(await list("n3")).some((x: any) => x.type === "sub_section"), "автор новой темы не получает её же уведомление");
  // лайки
  const before = await cnt("n1");
  await call("n2", "POST", "like", { type: "t", id: tid });
  await call("n3", "POST", "like", { type: "t", id: tid });
  await call("n4", "POST", "like", { type: "t", id: tid });
  L = await list("n1");
  const lk = L.filter((x: any) => x.type === "like");
  ok(lk.length === 1 && lk[0].actors === 3 && lk[0].actor && !("actor_id" in lk[0]), "лайки агрегируются: «X и ещё 2 оценили»");
  await call("n2", "POST", "like", { type: "t", id: tid }); await call("n2", "POST", "like", { type: "t", id: tid });
  ok((await list("n1")).filter((x: any) => x.type === "like")[0].actors === 3, "снял и снова поставил лайк — без дубля");
  ok(await cnt("n1") === before + 1, "три лайка — одно непрочитанное");
  await call("n1", "POST", "like", { type: "c", id: c1 });
  ok((await list("n2")).some((x: any) => x.type === "like" && x.comment_id === c1), "лайк комментария → его автору");
  // нет утечки id
  r = await call("n1", "GET", "notifs");
  ok(!/user_id|actor_id|actor_ids|agg_key|"n[1-4]"/.test(JSON.stringify(r.data)), "в API уведомлений нет внутренних id");
  // отметка прочитанного
  const one = r.data.items[0].id;
  r = await call("n1", "POST", "notifs/read", { ids: [one] }); ok(r.status === 200 && r.data.n === (await cnt("n1")), "отметить одно прочитанным");
  r = await call("n2", "POST", "notifs/read", { ids: [one] });
  ok(raw.query("SELECT read FROM forum_notifs WHERE id=?").get(one).read === 1, "чужое уведомление отметить нельзя (и не нужно)");
  r = await call("n1", "POST", "notifs/read", { all: true }); ok(r.data.n === 0 && await cnt("n1") === 0, "прочитать все");
  r = await call("n1", "POST", "notifs/read", { all: true }, { "x-forum": "" }); ok(r.status === 403, "отметка прочитанного требует CSRF-заголовок");
  // после прочтения — новая строка, а не агрегация в прочитанную
  await call("n4", "POST", "topic/" + tid + "/comments", { body: "после прочтения" });
  ok(await cnt("n1") === 1, "после прочтения новое уведомление снова непрочитанное");
  // блокировка
  await call("n1", "POST", "block", { pid: pidOf("n4"), value: true });
  await call("n1", "POST", "notifs/read", { all: true });
  await call("n4", "POST", "topic/" + tid + "/comments", { body: "@Алиса ты меня скрыла" });
  ok(await cnt("n1") === 0, "от скрытого автора уведомлений нет");
  // настройки
  r = await call("n1", "PUT", "me", { notif_off: ["comment", "like", "mod", "bogus"] }); ok(r.status === 200, "сохранение настроек уведомлений");
  ok(raw.query("SELECT notif_off FROM forum_users WHERE user_id='n1'").get().notif_off === "comment,like", "в настройках только отключаемые типы");
  await call("n2", "POST", "topic/" + tid + "/comments", { body: "отключено" });
  ok(await cnt("n1") === 0, "выключенный тип не приходит");
  await call("n1", "PUT", "me", { notif_off: [] });
  // удалённое/скрытое содержимое
  await call("n1", "POST", "block", { pid: pidOf("n4"), value: false });
  const cx = (await call("n3", "POST", "topic/" + tid + "/comments", { body: "@Алиса будет удалено" })).data.id;
  ok((await list("n1")).some((x: any) => x.comment_id === cx), "уведомление о комментарии есть");
  r = await call("mod1", "DELETE", "comment/" + cx + "?reason=" + encodeURIComponent("флуд"));
  ok(!(await list("n1")).some((x: any) => x.comment_id === cx && x.type !== "mod"), "комментарий удалён — уведомления о нём убраны");
  L = await list("n3");
  ok(L.some((x: any) => x.type === "mod" && x.text.includes("флуд") && !x.actor), "автору: модератор удалил с причиной, модератор не раскрыт");
  // скрытие комментария модератором
  const cy = (await call("n2", "POST", "topic/" + tid + "/comments", { body: "спорное" })).data.id;
  await call("mod1", "POST", "comment/" + cy + "/hide", { value: true });
  ok((await list("n2")).some((x: any) => x.type === "mod" && x.text.includes("скрыл")), "автору: модератор скрыл комментарий");
  // свои действия модератора с собственным — без уведомлений
  const cm = (await call("mod1", "POST", "topic/" + tid + "/comments", { body: "мой" })).data.id;
  await call("mod1", "DELETE", "comment/" + cm);
  ok(!(await list("mod1")).some((x: any) => x.type === "mod"), "удаление своего — без уведомления о модерации");
  // бан / разбан / назначение модератором
  await call("mod1", "POST", "ban", { pid: pidOf("n3"), minutes: 60, reason: "спам" });
  ok((await list("n3")).some((x: any) => x.type === "ban" && x.text.includes("спам")), "ограничение → уведомление с причиной");
  await call("mod1", "POST", "unban", { pid: pidOf("n3") });
  ok((await list("n3")).filter((x: any) => x.type === "ban").length === 2, "снятие ограничения → уведомление");
  r = await call("admin1", "POST", "moderators", { nick: "Борис", section_id: 0 });
  ok(r.status === 200 && (await list("n2")).some((x: any) => x.type === "mod_assign"), "назначение модератором → уведомление");
  // модерация не отключается и игнорирует блок
  await call("n2", "PUT", "me", { notif_off: ["reply", "comment", "like", "mention", "sub_topic", "sub_section"] });
  await call("n2", "POST", "block", { pid: pidOf("admin1"), value: true });
  const tz = (await call("n2", "POST", "topics", { section_id: 2, title: "Тема Бориса", body: "текст темы" })).data.id;
  await call("admin1", "POST", "topic/" + tz + "/flag", { flag: "locked", value: true });
  ok((await list("n2")).some((x: any) => x.type === "mod" && x.text.includes("закрыл")), "сообщения модерации приходят всегда");
  // скрытие темы → уведомления о ней убираются
  await call("n1", "POST", "like", { type: "t", id: tz });
  await call("admin1", "POST", "topic/" + tz + "/flag", { flag: "hidden", value: true });
  ok(!raw.query("SELECT COUNT(*) AS n FROM forum_notifs WHERE topic_id=? AND type='like'").get(tz).n, "тема скрыта — уведомления-оценки о ней удалены");
  // переход к комментарию: страница + якорь
  const tp = (await call("n1", "POST", "topics", { section_id: 2, title: "Длинная тема", body: "текст темы" })).data.id;
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await call("n4", "POST", "topic/" + tp + "/comments", { body: "к " + i })).data.id;
  const { notifTarget, cleanup, extractMentions } = await import("../../src/lib/forum/notify");
  const nid = raw.query("SELECT id FROM forum_notifs WHERE user_id='n1' AND topic_id=? ORDER BY id DESC").get(tp).id;
  const url = await notifTarget(env.PROFILES_DB, "n1", nid, 10);
  ok(url === `/forum/t/${tp}?page=2#c${last}`, "переход: нужная страница комментариев и якорь (" + url + ")");
  ok(raw.query("SELECT read FROM forum_notifs WHERE id=?").get(nid).read === 1, "переход отмечает прочитанным");
  ok(await notifTarget(env.PROFILES_DB, "n2", nid, 10) === "/forum/notifications", "чужое уведомление — без перехода");
  // лимит частоты
  const tq = (await call("n1", "POST", "topics", { section_id: 2, title: "Флуд-тест", body: "текст темы" })).data.id;
  await call("n1", "PUT", "me", { notif_off: ["comment"] });
  for (let i = 0; i < 35; i++) await call("n3", "POST", "topic/" + tq + "/comments", { body: "@Алиса " + i });
  const fromN3 = raw.query("SELECT COUNT(*) AS n FROM forum_notifs WHERE user_id='n1' AND actor_id='n3' AND updated_at > ?").get(Date.now() - 3600_000).n;
  ok(fromN3 <= 30, "лимит: не больше 30 уведомлений от одного участника в час (" + fromN3 + ")");
  // очистка старых прочитанных
  raw.query("UPDATE forum_notifs SET read=1, updated_at=? WHERE user_id='n1' AND topic_id=?").run(Date.now() - 61 * 86400_000, tq);
  await cleanup(env.PROFILES_DB, "n1");
  ok(!raw.query("SELECT COUNT(*) AS n FROM forum_notifs WHERE user_id='n1' AND topic_id=?").get(tq).n, "прочитанные старше 60 дней удаляются");
  ok(extractMentions("email a@b.ru и @Ёжик, @ab, (@Вася.)").join() === "ежик,вася", "разбор упоминаний: e-mail и короткие не считаются");
  // статистика
  r = await call(null, "GET", "user/" + pidOf("n1"));
  const S = r.data.stats;
  const real = raw.query("SELECT COUNT(*) AS n FROM forum_comments WHERE user_id='n1' AND deleted=0").get().n;
  ok(S && S.comments === real && S.topics === 3 && S.likes_given === 2, "статистика: темы, комментарии, оценки поставлены (" + JSON.stringify([S?.topics, S?.comments, S?.likes_given]) + ")");
  ok(S.likes_received === 3 && S.best_topic?.id === tid && S.top_section?.slug, "статистика: карма, лучшая тема, любимый раздел");
  ok(S.activity.length === 30 && S.activity_total >= 4 && S.activity[29].n >= 4, "график активности за 30 дней");
  ok(S.rank.name && typeof S.rank.pct === "number" && S.rank.next && S.rank.next.left > 0, "звание и прогресс до следующего");
  ok(S.achievements.find((a: any) => a.id === "first_topic").got && !S.achievements.find((a: any) => a.id === "liked100").got, "достижения");
  ok(!/"n[1-4]"|user_id/.test(JSON.stringify(r.data)), "в профиле со статистикой нет внутренних id");
  // счётчики при удалении/восстановлении
  const cc0 = raw.query("SELECT comments_count FROM forum_users WHERE user_id='n2'").get().comments_count;
  const cz = (await call("n2", "POST", "topic/" + tid + "/comments", { body: "счётчик" })).data.id;
  ok(raw.query("SELECT comments_count FROM forum_users WHERE user_id='n2'").get().comments_count === cc0 + 1, "comments_count растёт");
  await call("n2", "DELETE", "comment/" + cz);
  ok(raw.query("SELECT comments_count FROM forum_users WHERE user_id='n2'").get().comments_count === cc0, "comments_count уменьшается при удалении");
  await call("n2", "POST", "like", { type: "t", id: tid });
  ok(raw.query("SELECT likes_given FROM forum_users WHERE user_id='n2'").get().likes_given === 0, "likes_given уменьшается при снятии оценки");
  // бэкфилл миграции на «старых» данных
  const db2 = new (await import("bun:sqlite")).Database(":memory:");
  const root = import.meta.dir + "/../../server/migrations/";
  for (const f of ["0008_roles.sql", "0021_forum.sql", "0022_forum_profiles.sql"]) db2.exec(readFileSync(root + f, "utf8"));
  db2.exec("INSERT INTO forum_users (user_id, nick, nick_key, first_seen, last_seen, pid) VALUES ('a','A','a',0,0,1),('b','B','b',0,0,2)");
  db2.exec("INSERT INTO forum_topics (id, section_id, user_id, title, body, body_html, created_at, updated_at, last_activity) VALUES (1,1,'a','t','b','b',5,5,5),(2,1,'a','t2','b','b',6,6,6)");
  db2.exec("UPDATE forum_topics SET deleted=1 WHERE id=2");
  db2.exec("INSERT INTO forum_comments (topic_id, user_id, body, body_html, created_at, updated_at) VALUES (1,'b','x','x',7,7),(1,'b','y','y',8,8),(1,'a','z','z',9,9)");
  db2.exec("UPDATE forum_comments SET deleted=1 WHERE body='y'");
  db2.exec("INSERT INTO forum_likes (user_id, target_type, target_id, created_at) VALUES ('b','t',1,1),('b','c',3,1)");
  const secBefore = db2.query("SELECT COUNT(*) AS n FROM forum_sections").get() as any;
  db2.exec(readFileSync(root + "0023_forum_notify_stats.sql", "utf8"));
  const q = (sql: string) => db2.query(sql).get() as any;
  ok(q("SELECT comments_count FROM forum_users WHERE user_id='b'").comments_count === 1 && q("SELECT comments_count FROM forum_users WHERE user_id='a'").comments_count === 1, "бэкфилл comments_count (без удалённых)");
  ok(q("SELECT likes_given FROM forum_users WHERE user_id='b'").likes_given === 2, "бэкфилл likes_given");
  ok(q("SELECT COUNT(*) AS n FROM forum_subs").n === 1, "бэкфилл подписок авторов (только неудалённые темы)");
  ok(q("SELECT COUNT(*) AS n FROM forum_sections").n === secBefore.n && q("SELECT COUNT(*) AS n FROM forum_topics").n === 2, "миграция не трогает разделы и темы");
}

// маркер подстановки \u0000 из текста пользователя не подставляет чужие фрагменты
{ const h = renderMd("[a](https://x.example) \u00000\u0000 \u00009\u0000"); ok(!h.includes("undefined") && (h.match(/<a /g) || []).length === 1, "NUL-маркеры в тексте игнорируются"); }
console.log(`\nforum-test: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
