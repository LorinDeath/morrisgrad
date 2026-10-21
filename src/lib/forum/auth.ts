import { envOf } from '../cfEnv';
// Форум: кто смотрит страницу. Вход — тот же Clerk, что у сайта и игры (middleware → locals.auth()).
// Локальная разработка: при `astro dev` (import.meta.env.DEV) и FORUM_DEV_AUTH=1 в .dev.vars можно
// представиться cookie mg_dev_uid. В production-сборке import.meta.env.DEV === false — ветка вырезается.
export function forumUid(locals: any, request: Request): string | null {
  const env = envOf(locals);
  if (import.meta.env.DEV && env.FORUM_DEV_AUTH === "1") {
    const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)mg_dev_uid=([A-Za-z0-9_\-]{3,64})/);
    if (m) return m[1];
  }
  try {
    const a = locals?.auth ? locals.auth() : null;
    return a?.userId || null;
  } catch { return null; }
}
export function forumEnv(locals: any) { return envOf(locals) as any; }
/** Имя из Clerk (username → имя) — только для ника по умолчанию при первом входе на форум. Никогда не id. */
export function clerkName(locals: any): () => Promise<string | null> {
  return async () => {
    try {
      const u = typeof locals?.currentUser === "function" ? await locals.currentUser() : null;
      return (u?.username || u?.firstName || null) as string | null;
    } catch { return null; }
  };
}
