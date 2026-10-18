import type { APIRoute } from "astro";
import { buildPages, xmlResponse } from "../lib/sitemap";
export const prerender = false;
export const GET: APIRoute = ({ request, locals }) => xmlResponse(request, 3600, () => buildPages((locals as any).runtime?.env?.PROFILES_DB));
