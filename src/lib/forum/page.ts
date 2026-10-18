// Форум: общий вход для SSR-страниц — база, текущий пользователь (роль/бан — с сервера).
import { forumUid, forumEnv, clerkName } from "./auth";
import { loadViewer, type Viewer } from "./service";
import { unreadCount } from "./notify";
export async function forumPage(Astro: any): Promise<{ db: any; v: Viewer; env: any }> {
  const env = forumEnv(Astro.locals);
  const db = env.PROFILES_DB;
  const uid = forumUid(Astro.locals, Astro.request);
  const v = await loadViewer(db, uid, { name: clerkName(Astro.locals) });
  if (v.uid && v.user) v.unread = await unreadCount(db, v.uid);
  Astro.response.headers.set("cache-control", uid ? "private, no-store" : "public, max-age=0, s-maxage=15, stale-while-revalidate=30");
  return { db, v, env };
}
