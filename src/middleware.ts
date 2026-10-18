import { clerkMiddleware } from "@clerk/astro/server";
import { defineMiddleware } from "astro:middleware";

const clerk = clerkMiddleware();

// Локальные плейтесты форума: только `astro dev` (import.meta.env.DEV) + FORUM_DEV_AUTH=1 в .dev.vars + dev-cookie.
// Тогда Clerk пропускается (локально нет секретного ключа). В production-сборке ветка вырезается целиком.
export const onRequest = defineMiddleware((ctx, next) => {
  if (import.meta.env.DEV && (ctx.locals as any)?.runtime?.env?.FORUM_DEV_AUTH === "1" && /(?:^|;\s*)mg_dev_(uid|noclerk)=/.test(ctx.request.headers.get("cookie") || "")) {
    (ctx.locals as any).auth = () => ({ userId: null });
    return next();
  }
  return clerk(ctx, next);
});
