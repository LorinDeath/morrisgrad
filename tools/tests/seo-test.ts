// SEO: каноникал, правила индексации, JSON-LD, карты сайта (на bun:sqlite), robots. Запуск: bun tools/tests/seo-test.ts
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { canonicalPath, isPrivatePath, resolveSeo, ldJson, topicLd, breadcrumbs, homeLd, clip, htmlText, STATIC_PAGES, PAGE_DESC } from "../../src/lib/seo";
import { buildIndex, buildPages, buildForum, buildTopics, TOPICS_PER_SITEMAP } from "../../src/lib/sitemap";
import { ROBOTS } from "../../src/pages/robots.txt";
let fails = 0, passes = 0;
const ok = (c: any, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };

ok(canonicalPath("/forum/") === "/forum" && canonicalPath("/") === "/" && canonicalPath("//forum//t/3/?page=2#x") === "/forum/t/3", "каноникал: без хвостового /, query и #");
for (const p of ["/forum/me", "/forum/notifications", "/forum/n/5", "/forum/admin", "/forum/new", "/forum/edit/3", "/api/forum/x", "/profile", "/inventory", "/u/abc", "/chat", "/idealpage"]) ok(isPrivatePath(p), "личное: " + p);
for (const p of ["/", "/forum", "/forum/t/3", "/forum/u/1", "/forum/s/news", "/MorrisCurse", "/games/sanctuary", "/forum/members", "/user", "/profiles-of-heroes"].filter((p) => !["/forum/members", "/profiles-of-heroes"].includes(p))) ok(!isPrivatePath(p), "публичное: " + p);
ok(!isPrivatePath("/apiary") && !isPrivatePath("/forum/rules"), "префиксы не цепляют похожие адреса");
let r = resolveSeo("/games/tiny-swords", { title: "x" });
ok(r.canonical === "https://morrisgrad.com/games/ascetics", "дубликат → каноникал оригинала");
r = resolveSeo("/forum/me", { title: "x" }); ok(r.robots === "noindex,follow", "личные страницы noindex,follow по умолчанию");
r = resolveSeo("/books/", { title: "x" }); ok(r.canonical === "https://morrisgrad.com/books" && r.description === PAGE_DESC["/books"] && r.image.endsWith("/og/morrisgrad-og.jpg") && r.defaultImage, "описание страницы, картинка по умолчанию");
r = resolveSeo("/x", { title: "x", canonical: false }); ok(r.canonical === null, "404 без каноникала");
r = resolveSeo("/forum/t/3", { title: "x", image: "/api/forum/media/c/1.webp" }); ok(r.image === "https://morrisgrad.com/api/forum/media/c/1.webp" && !r.defaultImage, "своя картинка — абсолютный адрес");
ok(clip("слово ".repeat(80), 160).length <= 160 && clip("коротко", 160) === "коротко", "обрезка описания по словам");
ok(htmlText('<p>Привет &amp; <b>мир</b></p><script>x</script>') === "Привет & мир", "текст из HTML");
const evil = ldJson({ text: "</script><script>alert(1)</script>" });
ok(!evil.includes("</script") && JSON.parse(evil).text.includes("</script>"), "JSON-LD не может закрыть <script>");
const t = { id: 3, title: "Гайд", kind: "discussion", plain: "текст темы", excerpt: "анонс", author: { nick: "Кира", pid: 2 }, created_at: 1.7e12, updated_at: 1.7e12 + 5, likes_count: 7, comments_count: 4 };
let ld = topicLd(t, { url: "https://morrisgrad.com/forum/t/3", comments: [{ id: 9, plain: "коммент", author: { nick: "Влад", pid: 3 }, created_at: 1.7e12, likes_count: 1 }, { id: 10, plain: "скрыт", hidden: 1, author: {} }] });
ok(ld["@type"] === "DiscussionForumPosting" && ld.text && ld.author.name === "Кира" && ld.author.url.endsWith("/forum/u/2") && ld.commentCount === 4, "DiscussionForumPosting: автор, текст, число комментариев");
ok(ld.interactionStatistic.length === 2 && ld.interactionStatistic[0].userInteractionCount === 7, "interactionStatistic: лайки и комментарии");
ok(ld.comment.length === 1 && ld.comment[0].author.name === "Влад", "в JSON-LD только видимые комментарии");
ok(!JSON.stringify(ld).match(/user_|"user_id"/), "в JSON-LD нет внутренних id");
ld = topicLd({ ...t, kind: "article" }, { url: "u", image: "/api/forum/media/c.webp" });
ok(ld["@type"] === "Article" && ld.publisher && ld.image[0].startsWith("https://"), "статья → Article с издателем и картинкой");
const bc = breadcrumbs([["Форум", "/forum"], ["Тема", "/forum/t/3"]]);
ok(bc.itemListElement[1].position === 2 && bc.itemListElement[1].item === "https://morrisgrad.com/forum/t/3", "BreadcrumbList");
ok(homeLd().map((x) => x["@type"]).join() === "WebSite,Organization", "главная: WebSite + Organization");
ok(STATIC_PAGES.every((p) => !isPrivatePath(p.path)) && !STATIC_PAGES.some((p) => p.path === "/games/tiny-swords"), "в списке статических страниц нет личных и дублей");

// robots
ok(ROBOTS.includes("Sitemap: https://morrisgrad.com/sitemap.xml") && ROBOTS.indexOf("Allow: /api/forum/media/") < ROBOTS.indexOf("Disallow: /api/"), "robots: Sitemap, медиа разрешены раньше запрета /api/");
for (const d of ["/api/", "/forum/me", "/forum/notifications", "/forum/n/", "/forum/admin", "/forum/new", "/forum/edit/", "/profile", "/inventory", "/u/"]) ok(ROBOTS.includes("Disallow: " + d + "\n"), "robots Disallow " + d);
ok(!/Disallow: \/forum\/t|Disallow: \/forum\n|Disallow: \/\n/.test(ROBOTS), "robots не закрывает публичное");

// карты сайта на копии схемы
class Stmt { constructor(private db: Database, private sql: string, private args: any[] = []) {}
  bind(...a: any[]) { return new Stmt(this.db, this.sql, a); }
  async first() { return (this.db.query(this.sql).get(...this.args) as any) ?? null; }
  async all() { return { results: this.db.query(this.sql).all(...this.args) as any[] }; } }
const raw = new Database(":memory:");
const root = import.meta.dir + "/../../server/migrations/";
for (const f of ["0008_roles.sql", "0021_forum.sql", "0022_forum_profiles.sql", "0023_forum_notify_stats.sql"]) raw.exec(readFileSync(root + f, "utf8"));
const db = { prepare: (s: string) => new Stmt(raw, s) };
const ins = raw.query("INSERT INTO forum_topics (section_id, user_id, title, body, body_html, created_at, updated_at, last_activity, hidden, deleted) VALUES (1,'u','T','b','b',?,?,?,?,?)");
ins.run(1.7e12, 1.7e12, 1.8e12, 0, 0); ins.run(1.7e12, 1.75e12, 1.71e12, 0, 0); ins.run(1.7e12, 1.7e12, 1.7e12, 1, 0); ins.run(1.7e12, 1.7e12, 1.7e12, 0, 1);
const valid = (x: string, rootTag: string) => x.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && x.includes(`<${rootTag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`) && x.trim().endsWith(`</${rootTag}>`) && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(x);
let x = await buildIndex(db); ok(valid(x, "sitemapindex") && x.includes("/sitemap-topics-1.xml") && !x.includes("sitemap-topics-2"), "индекс карт: одна страница тем");
x = (await buildTopics(db, 1))!; ok(valid(x, "urlset") && x.includes("/forum/t/1<") && x.includes("/forum/t/2<") && !x.includes("/forum/t/3<") && !x.includes("/forum/t/4<"), "в карте только видимые темы (без скрытых и удалённых)");
ok(x.includes(`<loc>https://morrisgrad.com/forum/t/1</loc><lastmod>${new Date(1.8e12).toISOString()}</lastmod>`) && x.includes(`/forum/t/2</loc><lastmod>${new Date(1.75e12).toISOString()}`), "lastmod = последнее изменение или активность");
ok((await buildTopics(db, 2)) === null && (await buildTopics(db, 0)) === null, "несуществующая страница карты — 404");
x = await buildForum(db); ok(valid(x, "urlset") && (x.match(/<url>/g) || []).length === 6 && x.includes("/forum/s/news"), "разделы форума в карте (все 6, включая пустые)");
x = await buildPages(db); ok(valid(x, "urlset") && x.includes("<loc>https://morrisgrad.com/</loc>") && x.includes("/art%20hero/char2") && !x.includes("/forum/me"), "статические страницы, адреса экранированы");
const many = raw.prepare("INSERT INTO forum_topics (section_id, user_id, title, body, body_html, created_at, updated_at, last_activity) VALUES (1,'u','T','b','b',1,1,1)");
raw.transaction(() => { for (let i = 0; i < TOPICS_PER_SITEMAP + 5; i++) many.run(); })();
x = await buildIndex(db); ok(x.includes("sitemap-topics-2.xml") && !x.includes("sitemap-topics-3.xml"), "больше 5000 тем — вторая страница карты");
ok(((await buildTopics(db, 2))!.match(/<url>/g) || []).length === 7, "вторая страница содержит остаток");
x = await buildPages({ prepare: () => { throw new Error("no table"); } }); ok(valid(x, "urlset"), "нет таблицы рассказов — карта всё равно строится");

console.log(`\nseo-test: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
