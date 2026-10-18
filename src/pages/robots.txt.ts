// robots.txt: публичное — можно, личное и служебное — нет. Картинки форума (/api/forum/media/) разрешены для превью и поиска по картинкам.
// Cloudflare (Managed robots.txt / Content Signals) может дописать свой блок сверху — наши правила при этом сохраняются.
import type { APIRoute } from "astro";
import { SITE } from "../lib/seo";
export const prerender = false;
export const ROBOTS = `User-agent: *
Allow: /api/forum/media/
Disallow: /api/
Disallow: /forum/me
Disallow: /forum/notifications
Disallow: /forum/n/
Disallow: /forum/admin
Disallow: /forum/new
Disallow: /forum/edit/
Disallow: /profile
Disallow: /inventory
Disallow: /chat
Disallow: /idealpage
Disallow: /u/
Disallow: /cdn-cgi/

Sitemap: ${SITE}/sitemap.xml
`;
export const GET: APIRoute = () => new Response(ROBOTS, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
