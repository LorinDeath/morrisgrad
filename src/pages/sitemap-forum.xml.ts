import type { APIRoute } from "astro";
import { buildForum, xmlResponse } from "../lib/sitemap";
import { envOf } from '../lib/cfEnv';
export const prerender = false;
export const GET: APIRoute = ({ request, locals }) => xmlResponse(request, 600, () => buildForum(envOf(locals)?.PROFILES_DB));
