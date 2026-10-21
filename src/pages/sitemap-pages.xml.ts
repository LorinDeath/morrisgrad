import type { APIRoute } from "astro";
import { buildPages, xmlResponse } from "../lib/sitemap";
import { envOf } from '../lib/cfEnv';
export const prerender = false;
export const GET: APIRoute = ({ request, locals }) => xmlResponse(request, 3600, () => buildPages(envOf(locals)?.PROFILES_DB));
