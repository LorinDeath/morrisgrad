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
  db.exec("INSERT INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:admin1','admin','t',0),('uid:mod1','moderator','t',0)");
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (st: Stmt[]) => { db.transaction(() => { for (const s of st) s.runSync(); })(); return st.map(() => ({ success: true })); },
  };
}
const r2 = () => { const m = new Map<string, any>(); return { m, put: async (k: string, v: Uint8Array, o: any) => { m.set(k, { v, o }); }, get: async (k: string) => { const x = m.get(k); return x ? { body: x.v, httpMetadata: x.o.httpMetadata, httpEtag: "e" } : null; } }; };

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
  ok(r.data.topic.author.nick.startsWith("Житель-") && !("email" in r.data.topic.author), "автор: ник без персональных данных");
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
  r = await call("u2", "GET", "feed?tab=new"); ok(!r.data.items.some((x: any) => x.user_id === "u1"), "скрытый автор пропал из ленты у того, кто скрыл");
  r = await call("u3", "GET", "feed?tab=new"); ok(r.data.items.some((x: any) => x.user_id === "u1"), "у остальных автор виден");

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
  r = await call("fm_sec", "POST", "comment/" + cA + "/hide", { value: true }); ok(r.status === 200, "модератор раздела скрывает комментарий в своём разделе");
  r = await call("fm_sec", "POST", "comment/" + cA + "/hide", { value: false }); ok(r.status === 200, "…и возвращает его");
  r = await call("fm_sec", "DELETE", "comment/" + cA + "?reason=" + encodeURIComponent("оффтоп")); ok(r.status === 200, "модератор раздела удаляет комментарий в своём разделе");
  r = await call("fm_all", "DELETE", "topic/" + tB + "?reason=" + encodeURIComponent("спам")); ok(r.status === 200, "модератор форума удаляет тему в любом разделе");
  r = await call("mod1", "DELETE", "comment/" + cB); ok(r.status === 404 || r.status === 200, "модератор игры тоже модерирует форум");
  r = await call("fm_all", "POST", "sections", { slug: "zz", title: "Нельзя" }); ok(r.status === 403, "модератор форума не управляет разделами");
  r = await call("fm_all", "PUT", "settings", { filter_mode: "off" }); ok(r.status === 403, "модератор форума не меняет фильтр/лимиты");
  r = await call("admin1", "GET", "modlog");
  const del = r.data.log.find((x: any) => x.action === "topic_delete" && x.target_id === String(tB));
  ok(del && del.actor === "fm_all" && del.details.includes("спам") && del.created_at > 0, "удаление в журнале: кто, что, когда, причина");
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
  r = await call("admin1", "GET", "moderators"); ok(r.data.forum.length === 1 && r.data.forum[0].user_id === "fm_all", "список модераторов форума");
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

console.log(`\nforum-test: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
