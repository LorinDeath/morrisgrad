// Индекс карт сайта (динамический). Старые адреса @astrojs/sitemap (/sitemap-index.xml, /sitemap-0.xml) перенаправляются сюда.
import type { APIRoute } from "astro";
import { buildIndex, xmlResponse } from "../lib/sitemap";
export const prerender = false;
export const GET: APIRoute = ({ request, locals }) => xmlResponse(request, 600, () => buildIndex((locals as any).runtime?.env?.PROFILES_DB));
