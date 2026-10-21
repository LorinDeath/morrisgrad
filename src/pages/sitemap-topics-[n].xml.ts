import type { APIRoute } from "astro";
import { buildTopics, xmlResponse } from "../lib/sitemap";
import { envOf } from '../lib/cfEnv';
export const prerender = false;
export const GET: APIRoute = ({ request, locals, params }) => {
  const n = /^\d{1,4}$/.test(String(params.n)) ? Number(params.n) : 0;
  return xmlResponse(request, 600, () => buildTopics(envOf(locals)?.PROFILES_DB, n));
};
