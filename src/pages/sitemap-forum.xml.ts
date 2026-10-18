import type { APIRoute } from "astro";
import { buildForum, xmlResponse } from "../lib/sitemap";
export const prerender = false;
export const GET: APIRoute = ({ request, locals }) => xmlResponse(request, 600, () => buildForum((locals as any).runtime?.env?.PROFILES_DB));
