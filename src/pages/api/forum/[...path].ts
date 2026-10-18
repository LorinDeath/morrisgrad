import type { APIRoute } from "astro";
import { handleForumApi } from "../../../lib/forum/api";
import { forumUid, forumEnv, clerkName } from "../../../lib/forum/auth";

export const prerender = false;

export const ALL: APIRoute = async ({ locals, request, params }) =>
  handleForumApi(request, forumEnv(locals), forumUid(locals, request), String(params.path || ""), { name: clerkName(locals) });
