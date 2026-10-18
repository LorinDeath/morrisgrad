import { clerkMiddleware } from "@clerk/astro/server";
import { defineMiddleware } from "astro:middleware";
import { isPrivatePath } from "./lib/seo";
import { isCookielessPublicGet } from "./lib/guest";

const clerk = clerkMiddleware();

// Локальные плейтесты форума: только `astro dev` (import.meta.env.DEV) + FORUM_DEV_AUTH=1 в .dev.vars + dev-cookie.
// Тогда Clerk пропускается (локально нет секретного ключа). В production-сборке ветка вырезается целиком.
export const onRequest = defineMiddleware((ctx, next) => {
  if (import.meta.env.DEV && (ctx.locals as any)?.runtime?.env?.FORUM_DEV_AUTH === "1" && /(?:^|;\s*)mg_dev_(uid|noclerk)=/.test(ctx.request.headers.get("cookie") || "")) {
    (ctx.locals as any).auth = () => ({ userId: null });
    return withRobots(ctx.url.pathname, next());
  }
  return withRobots(ctx.url.pathname, clerk(guestWithoutHandshake(ctx), next));
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
async function withRobots(path: string, res: unknown): Promise<Response> {
  const r = (await res) as Response;
  if (r && isPrivatePath(path) && !path.startsWith("/api/forum/media/")) {
    try { r.headers.set("x-robots-tag", "noindex, follow"); } catch { /* неизменяемые заголовки (редирект) — пропускаем */ }
  }
  return r;
}
