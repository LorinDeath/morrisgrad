// Форум: HTTP-API (/api/forum/*). Тонкая обёртка над service.ts.
// Защита: запись только POST/PUT/DELETE с заголовком X-Forum: 1 и Origin своего сайта (CSRF);
// JSON-тело ограничено по размеру; права/лимиты проверяет service.ts.
import * as F from "./service";
import * as N from "./notify";
import { sniff, stripMeta, imageSize, EXT, type Mime } from "./media";
import { getSettings, NUM_SCHEMA } from "./settings";

export interface ForumEnv { PROFILES_DB: any; FORUM_MEDIA?: any }

const JSON_H = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };
/** Поля с внутренним Clerk userId — никогда не уходят наружу (снаружи участник — это pid и ник). */
const PRIVATE_KEYS = new Set(["user_id", "last_comment_user", "last_post_user", "deleted_by", "reporter", "by_user", "granted_by", "blocked_id", "uid", "owner"]);
export function scrub(x: any): any {
  if (Array.isArray(x)) return x.map(scrub);
  if (x && typeof x === "object") {
    const o: any = {};
    for (const [k, val] of Object.entries(x)) if (!PRIVATE_KEYS.has(k)) o[k] = scrub(val);
    return o;
  }
  return x;
}
export const json = (data: any, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(scrub(data)), { status, headers: { ...JSON_H, "cache-control": "no-store", ...extra } });

function sameOrigin(req: Request): boolean {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  if (origin) return origin === url.origin;
  const ref = req.headers.get("referer");
  if (ref) { try { return new URL(ref).origin === url.origin; } catch { return false; } }
  return false;
}

async function body(req: Request, max = 256 * 1024): Promise<any> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new F.ForumError(415, "Ожидается JSON");
  const txt = await req.text();
  if (txt.length > max) throw new F.ForumError(413, "Слишком большой запрос");
  try { return JSON.parse(txt || "{}"); } catch { throw new F.ForumError(400, "Неверный JSON"); }
}

/** Цель действия над участником: только публичный pid или ник (внутренний userId Clerk от клиента не принимается). */
const target = (b: any) => ({ pid: b?.pid, nick: b?.nick });

function randKey(n = 16) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/** Публичные списки для гостей можно кэшировать на краю (короткий TTL). */
const PUBLIC_CACHE = "public, max-age=10, s-maxage=20, stale-while-revalidate=30";

const pubUser = (u: any) => u && { pid: u.pid, nick: F.displayNick(u.nick, u.pid), avatar: u.avatar_key || null, signature: u.signature, topics_count: u.topics_count, posts_count: u.posts_count, karma: u.karma, first_seen: u.first_seen };

export async function handleForumApi(req: Request, env: ForumEnv, uid: string | null, path: string, opts: { name?: () => Promise<string | null | undefined> } = {}): Promise<Response> {
  const db = env.PROFILES_DB;
  if (!db) return json({ error: "База недоступна" }, 500);
  const method = req.method.toUpperCase();
  const parts = path.split("/").filter(Boolean);
  try {
    // --- картинки: GET /media/<key> (без авторизации) ---
    if (parts[0] === "media" && method === "GET") {
      const key = parts.slice(1).join("/");
      if (!/^[a-z0-9][a-z0-9/_-]{5,80}\.(webp|png|jpg|gif)$/.test(key) || !env.FORUM_MEDIA) return new Response("Not found", { status: 404 });
      const obj = await env.FORUM_MEDIA.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, { headers: {
        "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "content-disposition": "inline",
        etag: obj.httpEtag || "",
      } });
    }

    if (method !== "GET") {
      if (!sameOrigin(req) || req.headers.get("x-forum") !== "1") return json({ error: "Запрос отклонён (CSRF)" }, 403);
    }
    // --- счётчик непрочитанных: самый частый запрос (опрос раз в минуту) — без загрузки профиля ---
    if (method === "GET" && parts[0] === "notifs" && parts[1] === "count") {
      return json({ n: uid ? await N.unreadCount(db, uid) : null }, 200, { "cache-control": "private, no-store" });
    }
    const v = await F.loadViewer(db, uid, { touch: method !== "GET", name: opts.name });
    const u = new URL(req.url);
    const page = Number(u.searchParams.get("page") || 1) | 0 || 1;
    const guest = !uid;
    const cacheH = guest ? { "cache-control": PUBLIC_CACHE } : {};

    // --- чтение ---
    if (method === "GET") {
      switch (parts[0]) {
        case "me": return json({ pid: v.user?.pid ?? null, role: v.role, ban: v.ban, user: pubUser(v.user) });
        case "sections": return json({ sections: await F.listSections(db) }, 200, cacheH);
        case "feed": {
          const tab = (["rec", "new", "top"].includes(u.searchParams.get("tab") || "") ? u.searchParams.get("tab") : "rec") as F.FeedTab;
          return json(await F.feed(db, v, tab, page), 200, cacheH);
        }
        case "section": {
          const sec = await F.getSection(db, parts[1] || "");
          if (!sec) return json({ error: "Раздел не найден" }, 404);
          return json({ section: sec, ...(await F.sectionTopics(db, v, sec.id, u.searchParams.get("sort") === "top" ? "top" : "new", page)) }, 200, cacheH);
        }
        case "topic": {
          const t = await F.getTopic(db, v, Number(parts[1]));
          if (!t) return json({ error: "Тема не найдена" }, 404);
          if (!(t.mine || F.isMod(v))) delete t.body;
          return json({ topic: t, comments: await F.getComments(db, v, t.id, page) }, 200, cacheH);
        }
        case "comments": return json(await F.getComments(db, v, Number(parts[1]), page), 200, cacheH);
        case "user": {
          const key = decodeURIComponent(parts[1] || "");
          // только публичный номер; по id Clerk API не ищет (иначе по нему можно узнать номер и связать аккаунты)
          const a = /^[1-9]\d{0,8}$/.test(key) ? await F.getAuthor(db, v, Number(key), page) : null;
          return a ? json(a) : json({ error: "Пользователь не найден" }, 404);
        }
        case "online": return json({ online: await F.online(db) });
        case "notifs": {
          if (!v.uid || !v.user) return json({ error: "Войдите, чтобы видеть уведомления", code: "auth" }, 401);
          return json(await N.listNotifs(db, v.uid, page));
        }
        case "team": return json({ team: await F.forumTeam(db) }, 200, cacheH);
        case "users": return json({ users: await F.searchUsers(db, v, u.searchParams.get("q")) });
        case "reports": return json({ reports: await F.listReports(db, v, u.searchParams.get("status") === "resolved" ? "resolved" : "open") });
        case "bans": return json({ bans: await F.listBans(db, v) });
        case "modlog": return json({ log: await F.modlog(db, v) });
        case "blocks": return json({ blocks: await F.listBlocks(db, v) });
        case "moderators": return json(await F.listModerators(db, v));
        case "settings": {
          if (!F.isAdmin(v)) return json({ error: "Только для администратора" }, 403);
          return json({ settings: await getSettings(db), schema: NUM_SCHEMA });
        }
      }
      return json({ error: "Не найдено" }, 404);
    }

    // --- загрузка картинки: сырое тело ---
    if (parts[0] === "upload" && method === "POST") {
      const len = Number(req.headers.get("content-length") || 0);
      await F.checkUploadAllowed(db, v, len);
      if (!env.FORUM_MEDIA) return json({ error: "Хранилище картинок не подключено" }, 503);
      const s = await getSettings(db);
      const buf = new Uint8Array(await req.arrayBuffer());
      if (buf.length > s.upload_max_mb * 1024 * 1024) return json({ error: `Картинка больше ${s.upload_max_mb} МБ` }, 413);
      const mime = sniff(buf);
      if (!mime) return json({ error: "Поддерживаются только JPEG, PNG, WebP и GIF" }, 415);
      const clean = stripMeta(buf, mime as Mime);
      const d = new Date();
      const key = `u/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randKey()}.${EXT[mime as Mime]}`;
      await env.FORUM_MEDIA.put(key, clean, { httpMetadata: { contentType: mime, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { owner: v.uid! } });
      await F.recordUpload(db, v, key, mime, clean.length);
      return json({ key, url: `/api/forum/media/${key}`, size: clean.length, mime });
    }

    // --- аватар: сырое тело (квадрат, уже ужат в браузере до ~256px WebP) ---
    if (parts[0] === "avatar" && method === "POST") {
      const len = Number(req.headers.get("content-length") || 0);
      const s = await F.checkAvatarAllowed(db, v, len);
      if (!env.FORUM_MEDIA) return json({ error: "Хранилище картинок не подключено" }, 503);
      const buf = new Uint8Array(await req.arrayBuffer());
      if (buf.length > s.avatar_max_kb * 1024) return json({ error: `Аватар больше ${s.avatar_max_kb} КБ` }, 413);
      const mime = sniff(buf);
      if (!mime || mime === "image/gif") return json({ error: "Аватар: только WebP, PNG или JPEG" }, 415);
      const dim = imageSize(buf, mime as Mime);
      if (!dim || dim.w < 32 || dim.h < 32 || dim.w > 1024 || dim.h > 1024) return json({ error: "Аватар: от 32 до 1024 пикселей по стороне" }, 400);
      if (Math.abs(dim.w - dim.h) > Math.max(dim.w, dim.h) * 0.1) return json({ error: "Аватар должен быть квадратным" }, 400);
      const clean = stripMeta(buf, mime as Mime);
      const d = new Date();
      const key = `a/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randKey()}.${EXT[mime as Mime]}`;
      await env.FORUM_MEDIA.put(key, clean, { httpMetadata: { contentType: mime, cacheControl: "public, max-age=31536000, immutable" } });
      const { old } = await F.setAvatar(db, v, key, mime, clean.length);
      if (old) { try { await env.FORUM_MEDIA.delete?.(old); } catch {} }
      return json({ ok: true, avatar: key, url: `/api/forum/media/${key}` });
    }

    const b = method === "DELETE" ? {} : await body(req);
    const id = Number(parts[1]);
    const numeric = /^\d+$/.test(parts[1] || "");
    const route = numeric ? `${parts[0]}${parts[2] ? "/" + parts[2] : ""}` : `${parts[0]}${parts[1] ? "/" + parts[1] : ""}`;
    switch (`${method} ${route}`) {
      case "POST topics": return json(await F.createTopic(db, v, b));
      case "PUT topic": return json(await F.updateTopic(db, v, id, b));
      case "DELETE topic": return json(await F.deleteTopic(db, v, id, u.searchParams.get("reason")));
      case "POST topic/restore": return json(await F.restoreTopic(db, v, id));
      case "POST comment/restore": return json(await F.restoreComment(db, v, id));
      case "POST moderators": return json(await F.addModerator(db, v, { nick: b.nick, pid: b.pid }, b.section_id));
      case "POST moderators/remove": return json(await F.removeModerator(db, v, target(b), b.section_id));
      case "DELETE me/avatar": {
        const r = await F.removeAvatar(db, v, null);
        if (r.old) { try { await env.FORUM_MEDIA?.delete?.(r.old); } catch {} }
        return json({ ok: true });
      }
      case "POST user/avatar-remove": return json(await F.removeAvatar(db, v, { pid: id }, b.reason));
      case "POST topic/comments": return json(await F.createComment(db, v, id, b));
      case "POST topic/flag": return json(await F.setTopicFlag(db, v, id, String(b.flag), !!b.value));
      case "PUT comment": return json(await F.updateComment(db, v, id, b));
      case "DELETE comment": return json(await F.deleteComment(db, v, id, u.searchParams.get("reason")));
      case "POST comment/hide": return json(await F.setCommentHidden(db, v, id, !!b.value));
      case "POST like": return json(await F.toggleLike(db, v, b.type, Number(b.id)));
      case "POST report": return json(await F.report(db, v, b.type, Number(b.id), b.reason));
      case "POST reports/resolve": return json(await F.resolveReport(db, v, b.type, Number(b.id), String(b.action), b.reason));
      case "POST ban": return json(await F.banUser(db, v, target(b), Number(b.minutes), b.reason));
      case "POST unban": return json(await F.unbanUser(db, v, target(b)));
      case "POST sections": return json(await F.createSection(db, v, b));
      case "PUT section": return json(await F.updateSection(db, v, id, b));
      case "DELETE section": return json(await F.deleteSection(db, v, id, u.searchParams.get("move_to")));
      case "POST sections/order": return json(await F.reorderSections(db, v, b.ids));
      case "PUT settings": return json(await F.updateSettings(db, v, b));
      case "PUT me": return json(await F.updateMe(db, v, b));
      case "POST notifs/read": {
        if (!v.uid || !v.user) return json({ error: "Войдите", code: "auth" }, 401);
        await N.markRead(db, v.uid, b.ids, b.all === true);
        return json({ ok: true, n: await N.unreadCount(db, v.uid) });
      }
      case "POST sub": return json(await F.subscribe(db, v, b.kind, b.id, b.value !== false));
      case "POST block": return json(await F.setBlock(db, v, target(b), b.value !== false));
    }
    return json({ error: "Не найдено" }, 404);
  } catch (e: any) {
    if (e instanceof F.ForumError) return json({ error: e.message, code: e.code }, e.status);
    console.error("forum api", e);
    return json({ error: "Ошибка сервера" }, 500);
  }
}
