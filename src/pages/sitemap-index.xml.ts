// Старый адрес карты сайта (@astrojs/sitemap) → новый динамический индекс.
import type { APIRoute } from "astro";
export const prerender = false;
export const GET: APIRoute = () => new Response(null, { status: 301, headers: { location: "/sitemap.xml" } });
