import { clerkMiddleware } from "@clerk/astro/server";
import { defineMiddleware } from "astro:middleware";
import { isPrivatePath } from "./lib/seo";
import { isCookielessPublicGet } from "./lib/guest";
import { isCrossSiteWrite, withSecurityHeaders } from "./lib/security";

const clerk = clerkMiddleware();

// Локальные плейтесты форума: только `astro dev` (import.meta.env.DEV) + FORUM_DEV_AUTH=1 в .dev.vars + dev-cookie.
// Тогда Clerk пропускается (локально нет секретного ключа). В production-сборке ветка вырезается целиком.
export const onRequest = defineMiddleware((ctx, next) => {
  // CSRF: запись (POST/PUT/PATCH/DELETE) только со своего сайта — для всех API и форм страниц (профиль и т.п.)
  if (isCrossSiteWrite(ctx.request.method, ctx.request.url, ctx.request.headers)) {
    return new Response(JSON.stringify({ error: "Запрос отклонён (CSRF)" }), { status: 403, headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" } });
  }
  if (import.meta.env.DEV && (ctx.locals as any)?.runtime?.env?.FORUM_DEV_AUTH === "1" && /(?:^|;\s*)mg_dev_(uid|noclerk)=/.test(ctx.request.headers.get("cookie") || "")) {
    (ctx.locals as any).auth = () => ({ userId: null });
    return withRobots(ctx.url.pathname, next(), ctx.url.protocol === "https:");
  }
  return withRobots(ctx.url.pathname, clerk(guestWithoutHandshake(ctx), next), ctx.url.protocol === "https:");
});

// Поисковые роботы и первый заход без cookie: у dev-инстанса Clerk каждый «документный» запрос без cookie
// уходит в 307-рукопожатие через clerk.accounts.dev, а роботы cookie не хранят — получается петля.
// Для публичных GET/HEAD без единой cookie/параметра Clerk отдаём Clerk тот же запрос, но без признаков
// «документа» (Accept/Sec-Fetch-Dest) — Clerk сам честно признаёт его гостем (signedOut) без рукопожатия.
// Это не обход входа: авторизация по-прежнему решается Clerk, а без cookie сессии и так нет.
// Содержимое одинаковое для любого гостя (не клоакинг). Личные адреса, API и запросы с cookie Clerk — как раньше.
function guestWithoutHandshake<T extends { request: Request; url: URL }>(ctx: T): T {
  const req = ctx.request;
  if (!isCookielessPublicGet(req.method, ctx.url.pathname, req.headers.get("cookie"), ctx.url.search)) return ctx;
  const h = new Headers(req.headers);
  h.set("accept", "*/*");
  h.delete("sec-fetch-dest");
  const guestReq = new Request(req.url, { method: req.method, headers: h });
  return new Proxy(ctx, {
    get(t, prop) {
      if (prop === "request") return guestReq;
      const v = Reflect.get(t, prop, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

// Личные и служебные адреса: X-Robots-Tag (работает и для редиректов, и для не-HTML ответов)
// + заголовки безопасности (CSP frame-ancestors, nosniff, HSTS, Referrer/Permissions-Policy) — src/lib/security.ts
async function withRobots(path: string, res: unknown, isHttps = true): Promise<Response> {
  const r = (await res) as Response;
  if (r && isPrivatePath(path) && !path.startsWith("/api/forum/media/")) {
    try { r.headers.set("x-robots-tag", "noindex, follow"); } catch { /* неизменяемые заголовки (редирект) — пропускаем */ }
  }
  return r ? withSecurityHeaders(r, isHttps) : r;
}
