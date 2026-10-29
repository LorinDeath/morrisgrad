// Динамические карты сайта: индекс + статические страницы + форум (разделы, темы постранично). Только публичное содержимое.
import { SITE, STATIC_PAGES, xmlEsc, iso } from "./seo";
import { loropediaPaths } from "./loropedia";

export const TOPICS_PER_SITEMAP = 5000;
const VISIBLE = "t.deleted = 0 AND t.hidden = 0";

type U = { loc: string; lastmod?: string; changefreq?: string; priority?: number };
export function urlset(urls: U[]) {
  const body = urls.map((u) => `<url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}${u.priority != null ? `<priority>${u.priority.toFixed(1)}</priority>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
export function sitemapIndex(items: { loc: string; lastmod?: string }[]) {
  const body = items.map((s) => `<sitemap><loc>${xmlEsc(s.loc)}</loc>${s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : ""}</sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

const safe = async <T>(f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch { return d; } };
const parseDate = (v: any): string | undefined => {
  if (v == null || v === "") return undefined;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z"));
  return isNaN(+d) ? undefined : d.toISOString();
};

export async function buildIndex(db: any) {
  const [cnt, lastTopic, lastSec] = await Promise.all([
    safe(async () => (await db.prepare(`SELECT COUNT(*) AS n FROM forum_topics t WHERE ${VISIBLE}`).first())?.n || 0, 0),
    safe(async () => (await db.prepare(`SELECT MAX(MAX(t.updated_at, t.last_activity)) AS m FROM forum_topics t WHERE ${VISIBLE}`).first())?.m || 0, 0),
    safe(async () => (await db.prepare("SELECT MAX(last_post_at) AS m FROM forum_sections").first())?.m || 0, 0),
  ]);
  const items = [{ loc: `${SITE}/sitemap-pages.xml` }, { loc: `${SITE}/sitemap-forum.xml`, lastmod: iso(Math.max(lastTopic, lastSec) || null) }];
  const pages = Math.max(1, Math.ceil(cnt / TOPICS_PER_SITEMAP));
  if (cnt > 0) for (let i = 1; i <= pages; i++) items.push({ loc: `${SITE}/sitemap-topics-${i}.xml`, lastmod: iso(lastTopic || null) });
  return sitemapIndex(items);
}

export async function buildPages(db: any) {
  const urls: U[] = STATIC_PAGES.map((p) => ({ loc: SITE + p.path, changefreq: p.changefreq, priority: p.priority }));
  const stories = await safe(async () => (await db.prepare("SELECT rowid AS id, created_at FROM konkurs ORDER BY rowid LIMIT 5000").all()).results || [], [] as any[]);
  for (const s of stories) urls.push({ loc: `${SITE}/allkonrass/${s.id}`, lastmod: parseDate(s.created_at), priority: 0.4 });
  // Лоропедия — адреса известны на этапе сборки (src/data/loropedia/data.json)
  for (const p of loropediaPaths()) urls.push({ loc: SITE + encodeURI(p.path), changefreq: "weekly", priority: p.priority });
  return urlset(urls);
}

export async function buildForum(db: any) {
  const secs = await safe(async () => (await db.prepare("SELECT slug, last_post_at, created_at FROM forum_sections ORDER BY sort, id").all()).results || [], [] as any[]);
  return urlset(secs.map((s: any) => ({ loc: `${SITE}/forum/s/${encodeURIComponent(s.slug)}`, lastmod: iso(s.last_post_at || s.created_at), changefreq: "daily", priority: 0.7 })));
}

/** null — такой страницы нет (404). */
export async function buildTopics(db: any, page: number) {
  if (!(page >= 1)) return null;
  const rows = await safe(async () => (await db.prepare(`SELECT t.id, MAX(t.updated_at, t.last_activity) AS m FROM forum_topics t WHERE ${VISIBLE} ORDER BY t.id LIMIT ? OFFSET ?`)
    .bind(TOPICS_PER_SITEMAP, (page - 1) * TOPICS_PER_SITEMAP).all()).results || [], [] as any[]);
  if (!rows.length && page > 1) return null;
  return urlset(rows.map((t: any) => ({ loc: `${SITE}/forum/t/${t.id}`, lastmod: iso(t.m), priority: 0.6 })));
}

/** Короткий кэш на краю (Cache API воркера) + Cache-Control. */
export async function xmlResponse(req: Request, ttl: number, build: () => Promise<string | null>): Promise<Response> {
  const cache = (globalThis as any).caches?.default;
  const key = new Request(new URL(req.url).origin + new URL(req.url).pathname, { method: "GET" });
  // ответ из кэша — с неизменяемыми заголовками; отдаём копию, чтобы middleware (Clerk) мог дописать свои
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) }); }
  const xml = await build();
  if (xml == null) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" } });
  const res = new Response(xml, { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": `public, max-age=${ttl}`, "x-robots-tag": "noindex" } });
  if (cache) await cache.put(key, res.clone()).catch(() => {});
  return res;
}
