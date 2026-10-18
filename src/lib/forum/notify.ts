// Форум: уведомления на сайте (без почты и push). Создание, склейка однотипных, лимиты, чтение, очистка.
// Получатель — Clerk userId (внутри); наружу уходят только ники/номера участников.
const now = () => Date.now();
const H = 3600_000, DAY = 24 * H;

/** Типы, которые участник может выключить. Действия модераторов, ограничения и назначение — всегда. */
export const TOGGLABLE = ["reply", "comment", "like", "mention", "sub_topic", "sub_section"] as const;
export const NOTIF_TYPES: Record<string, string> = {
  reply: "Ответы на мои комментарии",
  comment: "Комментарии в моих темах",
  like: "Оценки моих тем и комментариев",
  mention: "Упоминания по нику (@ник)",
  sub_topic: "Новое в темах, за которыми слежу",
  sub_section: "Новые темы в разделах, за которыми слежу",
  mod: "Действия модераторов с моими записями",
  ban: "Ограничения на форуме",
  mod_assign: "Назначение модератором",
};
const MOD_TYPES = ["mod", "ban", "mod_assign"];
export const KEEP_READ_DAYS = 60;
const MAX_PER_USER = 400;
const PER_ACTOR_PER_HOUR = 30;

export interface NotifyEvent {
  to: string | null | undefined;
  type: string;
  actor?: string | null;      // кто вызвал (для «не себе», блокировок, лимита)
  showActor?: boolean;        // false — не показывать, кто (действия модераторов)
  topicId?: number | null;
  commentId?: number | null;
  text?: string;
  agg?: string | null;        // ключ склейки непрочитанных
}

export async function notify(db: any, e: NotifyEvent): Promise<boolean> {
  try {
    if (!e.to || (e.actor && e.to === e.actor)) return false;
    const u = await db.prepare("SELECT notif_off FROM forum_users WHERE user_id = ?").bind(e.to).first();
    if (!u) return false;
    if ((TOGGLABLE as readonly string[]).includes(e.type) && String(u.notif_off || "").split(",").includes(e.type)) return false;
    const mod = MOD_TYPES.includes(e.type);
    const t = now();
    if (e.actor && !mod) {
      const bl = await db.prepare("SELECT 1 AS x FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(e.to, e.actor).first();
      if (bl) return false;
      const rc = await db.prepare("SELECT COUNT(*) AS n FROM forum_notifs WHERE user_id = ? AND updated_at > ? AND actor_id = ?").bind(e.to, t - H, e.actor).first();
      if ((rc?.n || 0) >= PER_ACTOR_PER_HOUR) return false;
    }
    const actorStored = e.showActor === false ? null : e.actor || null;
    const text = String(e.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (e.agg) {
      if (e.type === "like" && e.actor) { // повторный лайк того же участника (снял/поставил) — не дублируем сутки
        const dup = await db.prepare("SELECT 1 AS x FROM forum_notifs WHERE user_id = ? AND agg_key = ? AND updated_at > ? AND actor_ids LIKE ? LIMIT 1").bind(e.to, e.agg, t - DAY, `%${JSON.stringify(e.actor)}%`).first();
        if (dup) return false;
      }
      const ex = await db.prepare("SELECT id, actor_ids FROM forum_notifs WHERE user_id = ? AND agg_key = ? AND read = 0 LIMIT 1").bind(e.to, e.agg).first();
      if (ex) {
        let ids: string[] = []; try { ids = JSON.parse(ex.actor_ids || "[]"); } catch {}
        if (actorStored && !ids.includes(actorStored)) ids.push(actorStored);
        ids = ids.slice(-50);
        await db.prepare("UPDATE forum_notifs SET actor_id = COALESCE(?, actor_id), actor_ids = ?, actors = ?, comment_id = COALESCE(?, comment_id), text = ?, updated_at = ? WHERE id = ?")
          .bind(actorStored, JSON.stringify(ids), Math.max(1, ids.length), e.commentId ?? null, text, t, ex.id).run();
        return true;
      }
    }
    await db.prepare("INSERT INTO forum_notifs (user_id, type, topic_id, comment_id, actor_id, actor_ids, actors, text, agg_key, read, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)")
      .bind(e.to, e.type, e.topicId ?? null, e.commentId ?? null, actorStored, JSON.stringify(actorStored ? [actorStored] : []), text, e.agg ?? null, t, t).run();
    if (Math.random() < 0.05) await cleanup(db, e.to);
    return true;
  } catch (err) {
    console.error("forum notify", err); // уведомление не должно ломать основное действие
    return false;
  }
}

export async function cleanup(db: any, uid: string) {
  await db.batch([
    db.prepare("DELETE FROM forum_notifs WHERE user_id = ? AND read = 1 AND updated_at < ?").bind(uid, now() - KEEP_READ_DAYS * DAY),
    db.prepare("DELETE FROM forum_notifs WHERE user_id = ? AND id NOT IN (SELECT id FROM forum_notifs WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?)").bind(uid, uid, MAX_PER_USER),
  ]);
}

/** Запись удалена/скрыта — убираем связанные уведомления (кроме сообщений модерации). */
export async function purgeFor(db: any, what: { topicId?: number; commentId?: number }) {
  try {
    if (what.commentId) await db.prepare("DELETE FROM forum_notifs WHERE comment_id = ? AND type NOT IN ('mod', 'ban', 'mod_assign')").bind(what.commentId).run();
    if (what.topicId) await db.prepare("DELETE FROM forum_notifs WHERE topic_id = ? AND type NOT IN ('mod', 'ban', 'mod_assign')").bind(what.topicId).run();
  } catch {}
}

export async function unreadCount(db: any, uid: string | null): Promise<number> {
  if (!uid) return 0;
  const r = await db.prepare("SELECT COUNT(*) AS n FROM (SELECT 1 FROM forum_notifs WHERE user_id = ? AND read = 0 LIMIT 100)").bind(uid).first().catch(() => null);
  return r?.n || 0;
}

export async function listNotifs(db: any, uid: string, page = 1, size = 30) {
  if (page === 1) await cleanup(db, uid).catch(() => {});
  const off = (Math.max(1, Math.min(200, page | 0)) - 1) * size;
  const rows = (await db.prepare(`SELECT n.id, n.type, n.topic_id, n.comment_id, n.actors, n.text, n.read, n.created_at, n.updated_at,
      a.nick AS actor_nick, a.pid AS actor_pid, a.avatar_key AS actor_avatar, t.title AS topic_title, t.deleted AS t_del, t.hidden AS t_hid, c.deleted AS c_del, c.hidden AS c_hid
    FROM forum_notifs n LEFT JOIN forum_users a ON a.user_id = n.actor_id LEFT JOIN forum_topics t ON t.id = n.topic_id LEFT JOIN forum_comments c ON c.id = n.comment_id
    WHERE n.user_id = ? ORDER BY n.updated_at DESC LIMIT ? OFFSET ?`).bind(uid, size + 1, off).all()).results || [];
  const items = rows.slice(0, size).filter((x: any) => MOD_TYPES.includes(x.type) || !(x.t_del || x.t_hid || x.c_del || x.c_hid));
  for (const x of items) {
    x.actor = x.actor_nick || x.actor_pid != null ? { nick: x.actor_nick || `Игрок #${x.actor_pid}`, pid: x.actor_pid, avatar: x.actor_avatar || null } : null;
    for (const k of ["actor_nick", "actor_pid", "actor_avatar", "t_del", "t_hid", "c_del", "c_hid"]) delete x[k];
  }
  return { items, more: rows.length > size, page: Math.floor(off / size) + 1 };
}

export async function markRead(db: any, uid: string, ids: any, all = false) {
  if (all) { await db.prepare("UPDATE forum_notifs SET read = 1 WHERE user_id = ? AND read = 0").bind(uid).run(); return; }
  const list = (Array.isArray(ids) ? ids : []).map((x: any) => Number(x) | 0).filter((x: number) => x > 0).slice(0, 100);
  if (!list.length) return;
  await db.prepare(`UPDATE forum_notifs SET read = 1 WHERE user_id = ? AND id IN (${list.map(() => "?").join(",")})`).bind(uid, ...list).run();
}

/** Переход по уведомлению: отметить прочитанным и вернуть адрес (страница комментариев + якорь). */
export async function notifTarget(db: any, uid: string, id: number, commentsPage: number): Promise<string> {
  const n = await db.prepare("SELECT * FROM forum_notifs WHERE id = ? AND user_id = ?").bind(id | 0, uid).first();
  if (!n) return "/forum/notifications";
  if (!n.read) await db.prepare("UPDATE forum_notifs SET read = 1 WHERE id = ?").bind(n.id).run();
  if (n.type === "mod_assign") return "/forum/admin";
  if (n.type === "ban") return "/forum/rules";
  if (n.type === "mod" && n.topic_id) { // запись удалена или скрыта — смотреть некуда, ведём к правилам
    const t = await db.prepare("SELECT deleted, hidden FROM forum_topics WHERE id = ?").bind(n.topic_id).first();
    const c = n.comment_id ? await db.prepare("SELECT deleted FROM forum_comments WHERE id = ?").bind(n.comment_id).first() : null;
    if (!t || t.deleted || c?.deleted) return "/forum/rules";
  }
  if (n.type === "mod" && !n.topic_id) return "/forum/me";
  if (n.comment_id) {
    const c = await db.prepare("SELECT id, topic_id, parent_id FROM forum_comments WHERE id = ?").bind(n.comment_id).first();
    if (c) {
      const root = c.parent_id || c.id;
      const before = await db.prepare("SELECT COUNT(*) AS n FROM forum_comments WHERE topic_id = ? AND parent_id IS NULL AND id < ?").bind(c.topic_id, root).first();
      const page = Math.floor((before?.n || 0) / commentsPage) + 1;
      return `/forum/t/${c.topic_id}${page > 1 ? "?page=" + page : ""}#c${c.id}`;
    }
  }
  if (n.topic_id) return `/forum/t/${n.topic_id}`;
  return "/forum/notifications";
}

/** @упоминания: ники без пробелов, до 5 на запись. */
export function extractMentions(body: string): string[] {
  const out = new Set<string>();
  const re = /(^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_\-.]{3,24})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(body || ""))) && out.size < 5) out.add(m[2].replace(/[.\-]+$/, "").toLowerCase().replace(/ё/g, "е"));
  return [...out].filter((x) => x.length >= 3);
}

export async function setSub(db: any, uid: string, kind: "t" | "s", id: number, on: boolean) {
  if (on) await db.prepare("INSERT OR IGNORE INTO forum_subs (user_id, kind, target_id, created_at) VALUES (?, ?, ?, ?)").bind(uid, kind, id, now()).run();
  else await db.prepare("DELETE FROM forum_subs WHERE user_id = ? AND kind = ? AND target_id = ?").bind(uid, kind, id).run();
}
export async function isSub(db: any, uid: string | null, kind: "t" | "s", id: number): Promise<boolean> {
  if (!uid) return false;
  return !!(await db.prepare("SELECT 1 AS x FROM forum_subs WHERE user_id = ? AND kind = ? AND target_id = ?").bind(uid, kind, id).first());
}
export async function subscribers(db: any, kind: "t" | "s", id: number, limit = 200): Promise<string[]> {
  const r = await db.prepare("SELECT user_id FROM forum_subs WHERE kind = ? AND target_id = ? LIMIT ?").bind(kind, id, limit).all();
  return (r.results || []).map((x: any) => x.user_id);
}
