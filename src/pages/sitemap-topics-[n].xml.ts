import type { APIRoute } from "astro";
import { buildTopics, xmlResponse } from "../lib/sitemap";
export const prerender = false;
export const GET: APIRoute = ({ request, locals, params }) => {
  const n = /^\d{1,4}$/.test(String(params.n)) ? Number(params.n) : 0;
  return xmlResponse(request, 600, () => buildTopics((locals as any).runtime?.env?.PROFILES_DB, n));
};
