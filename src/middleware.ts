import { clerkMiddleware } from "@clerk/astro/server";
import { defineMiddleware } from "astro:middleware";
import { isPrivatePath } from "./lib/seo";

const clerk = clerkMiddleware();

// Локальные плейтесты форума: только `astro dev` (import.meta.env.DEV) + FORUM_DEV_AUTH=1 в .dev.vars + dev-cookie.
// Тогда Clerk пропускается (локально нет секретного ключа). В production-сборке ветка вырезается целиком.
export const onRequest = defineMiddleware((ctx, next) => {
  if (import.meta.env.DEV && (ctx.locals as any)?.runtime?.env?.FORUM_DEV_AUTH === "1" && /(?:^|;\s*)mg_dev_(uid|noclerk)=/.test(ctx.request.headers.get("cookie") || "")) {
    (ctx.locals as any).auth = () => ({ userId: null });
    return withRobots(ctx.url.pathname, next());
  }
  return withRobots(ctx.url.pathname, clerk(ctx, next));
});

// Личные и служебные адреса: X-Robots-Tag (работает и для редиректов, и для не-HTML ответов)
async function withRobots(path: string, res: unknown): Promise<Response> {
  const r = (await res) as Response;
  if (r && isPrivatePath(path) && !path.startsWith("/api/forum/media/")) {
    try { r.headers.set("x-robots-tag", "noindex, follow"); } catch { /* неизменяемые заголовки (редирект) — пропускаем */ }
  }
  return r;
}
