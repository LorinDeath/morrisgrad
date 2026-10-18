// Форум МоррисГрада: серверная логика (D1). Все проверки прав, лимитов и фильтров — здесь, на сервере.
// Роли: админ/модератор — из player_roles ('uid:<Clerk userId>'), как в админке игры.
import { renderMd, plainText, firstMediaKey, isMediaKey, MEDIA_PREFIX } from "./md";
import { compileWords, filterText } from "./profanity";
import { getSettings, validateSettings, clearSettingsCache, rankOf, type ForumSettings } from "./settings";
import { notify, purgeFor, extractMentions, setSub, isSub, subscribers, TOGGLABLE } from "./notify";

export class ForumError extends Error {
  constructor(public status: number, message: string, public code = "") { super(message); }
}
const fail = (status: number, msg: string, code = ""): never => { throw new ForumError(status, msg, code); };

export type Role = "admin" | "moderator" | null;
export interface Viewer {
  uid: string | null;
  role: Role;
  /** Зона модерации: "all" — весь форум, массив — id разделов (модератор раздела), null — не модератор. */
  scope?: "all" | number[] | null;
  gameRole?: Role; // роль из игры (player_roles)
  ban: { until: number; reason: string } | null;
  user: any | null; // строка forum_users
  unread?: number; // непрочитанные уведомления (ставит forumPage)
}
export const isMod = (v: Viewer) => v.role === "admin" || v.role === "moderator";
/** Может ли модерировать конкретный раздел (админ и модератор всего форума — везде). */
export const canMod = (v: Viewer, sectionId: number | null | undefined) =>
  v.role === "admin" || v.scope === "all" || (Array.isArray(v.scope) && sectionId != null && v.scope.includes(Number(sectionId)));
export const isAdmin = (v: Viewer) => v.role === "admin";

const now = () => Date.now();
const H = 3600_000;

// ---------- пользователи и роли ----------

export async function roleOf(db: any, uid: string | null): Promise<Role> {
  if (!uid) return null;
  try {
    const r = await db.prepare("SELECT role FROM player_roles WHERE pkey = ?").bind("uid:" + uid).first();
    return r?.role === "admin" || r?.role === "moderator" ? r.role : null;
  } catch { return null; }
}

const CLERKISH = /^user_[A-Za-z0-9]{6,}$/;
/** Ник допустим: формат, не похож на служебный/Clerk id, без мата и оскорблений (всегда, даже если фильтр текстов выключен). */
function nickProblem(n: string, s: ForumSettings): string | null {
  const e = validNick(n); if (e) return e;
  if (!filterText(n, compileWords(s.filter_words)).clean) return "Такой ник не подойдёт";
  return null;
}
const selUser = (db: any, uid: string) => db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(uid).first();

export interface EnsureOpts { name?: () => Promise<string | null | undefined>; seen?: boolean }
/**
 * Профиль форума. Ник по умолчанию: ник на сайте/в игре (users.username) → имя в Clerk (username/имя) → «Игрок #<pid>».
 * pid — публичный номер участника (адреса /forum/u/<pid>); Clerk userId наружу не отдаётся.
 */
export async function ensureUser(db: any, uid: string, opts: EnsureOpts = {}): Promise<any> {
  let u = await selUser(db, uid);
  const t = now();
  const seen = opts.seen === false ? 0 : t;
  if (!u) {
    const s = await getSettings(db);
    const cands: string[] = [];
    try { const g = await db.prepare("SELECT username FROM users WHERE id = ?").bind(uid).first(); if (g?.username) cands.push(String(g.username)); } catch {}
    if (opts.name) { try { const n = await opts.name(); if (n) cands.push(String(n)); } catch {} }
    const good = cands.map((n) => n.trim().replace(/\s+/g, " ")).filter((n) => n && n !== "Новичок" && !nickProblem(n, s));
    for (const nick of [...good, null]) {
      const r = await db.prepare(`INSERT OR IGNORE INTO forum_users (user_id, nick, nick_key, pid, first_seen, last_seen)
        SELECT ?, COALESCE(?, 'Игрок #' || n), COALESCE(?, 'игрок #' || n), n, ?, ? FROM (SELECT COALESCE(MAX(pid), 0) + 1 AS n FROM forum_users)`)
        .bind(uid, nick, nick ? nickKey(nick) : null, t, seen).run();
      if (r.meta?.changes) break;
      const again = await selUser(db, uid);
      if (again) { u = again; break; }
    }
    u = u || (await selUser(db, uid));
  } else if (opts.seen !== false && t - u.last_seen > 60_000) {
    await db.prepare("UPDATE forum_users SET last_seen = ? WHERE user_id = ?").bind(t, uid).run();
    u.last_seen = t;
  }
  if (u && u.pid == null) { // страховка для строк, созданных до миграции 0022
    await db.prepare("UPDATE forum_users SET pid = (SELECT COALESCE(MAX(pid), 0) + 1 FROM forum_users) WHERE user_id = ? AND pid IS NULL").bind(uid).run();
    u = await selUser(db, uid);
  }
  return u;
}

/** Найти участника по публичному номеру (pid), нику или (внутренне) userId. */
export async function resolveUser(db: any, x: { pid?: any; nick?: any; user_id?: any }): Promise<any | null> {
  if (x?.pid != null && /^\d+$/.test(String(x.pid))) return db.prepare("SELECT * FROM forum_users WHERE pid = ?").bind(Number(x.pid)).first();
  if (x?.nick) return db.prepare("SELECT * FROM forum_users WHERE nick_key = ?").bind(nickKey(String(x.nick))).first();
  if (x?.user_id) return db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(String(x.user_id)).first();
  return null;
}

export async function loadViewer(db: any, uid: string | null, opts: { touch?: boolean; name?: EnsureOpts["name"] } = {}): Promise<Viewer> {
  if (!uid) return { uid: null, role: null, ban: null, user: null, scope: null };
  const [gameRole, banRow, fm] = await Promise.all([
    roleOf(db, uid),
    db.prepare("SELECT until, reason FROM forum_bans WHERE user_id = ?").bind(uid).first().catch(() => null),
    db.prepare("SELECT section_id FROM forum_moderators WHERE user_id = ?").bind(uid).all().then((r: any) => r.results || []).catch(() => []),
  ]);
  let role: Role = gameRole, scope: Viewer["scope"] = gameRole ? "all" : null;
  if (!role && fm.length) { role = "moderator"; scope = fm.some((x: any) => x.section_id === 0) ? "all" : fm.map((x: any) => x.section_id); }
  const ban = banRow && (banRow.until === 0 || banRow.until > now()) ? { until: banRow.until, reason: banRow.reason } : null;
  const user = opts.touch === false ? await db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(uid).first() : await ensureUser(db, uid, { name: opts.name });
  return { uid, role, ban, user, scope, gameRole };
}

export const nickKey = (n: string) => String(n).trim().toLowerCase().replace(/ё/g, "е");
export function validNick(n: string): string | null {
  const s = String(n ?? "").trim();
  if (s.length < 3 || s.length > 24) return "Ник: от 3 до 24 символов";
  if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_\- .]+$/.test(s)) return "Ник: буквы, цифры, пробел, «_», «-», «.»";
  if (/^(админ|admin|модер|moder|система|system)/i.test(s) || /^игрок\s*#?\s*\d+$/i.test(s) || CLERKISH.test(s)) return "Такой ник занят системой";
  return null;
}

// ---------- проверки ----------

function needUser(v: Viewer) { if (!v.uid || !v.user) fail(401, "Войдите, чтобы писать на форуме", "auth"); }
function needNotBanned(v: Viewer) {
  if (v.ban) {
    const until = v.ban.until === 0 ? "бессрочно" : "до " + new Date(v.ban.until).toLocaleString("ru-RU", { timeZone: "Europe/Kiev" });
    fail(403, `Вы не можете писать на форуме (${until})${v.ban.reason ? ": " + v.ban.reason : ""}`, "banned");
  }
}
function needMod(v: Viewer) { needUser(v); if (!isMod(v)) fail(403, "Только для модераторов", "forbidden"); }
function needAdmin(v: Viewer) { needUser(v); if (!isAdmin(v)) fail(403, "Только для администратора", "forbidden"); }

async function needAge(db: any, v: Viewer, s: ForumSettings) {
  if (isMod(v) || !s.min_account_age_min) return;
  const left = v.user.first_seen + s.min_account_age_min * 60_000 - now();
  if (left > 0) fail(429, `Новичкам нужно немного осмотреться: писать можно через ${Math.ceil(left / 60_000)} мин.`, "age");
}

function str(x: any, max: number, name: string, min = 1): string {
  const s = String(x ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (s.length < min) fail(400, min > 1 ? `${name}: минимум ${min} символа` : `${name}: пусто`, "len");
  if (s.length > max) fail(400, `${name}: максимум ${max} символов (сейчас ${s.length})`, "len");
  return s;
}

/** Фильтр мата: block — ошибка, mask — заменить на «х***». */
async function moderateText(s: ForumSettings, text: string): Promise<string> {
  if (s.filter_mode === "off") return text;
  const r = filterText(text, compileWords(s.filter_words));
  if (r.clean) return text;
  if (s.filter_mode === "block") fail(400, "Кажется, в тексте есть грубые слова или оскорбления. Перефразируйте, пожалуйста — у нас форум для всех 🙂", "profanity");
  return r.text;
}

function countImages(body: string) { return (body.match(/!\[[^\]]*\]\([^)\s]+\)/g) || []).length; }

const hotScore = (likes: number, comments: number, created: number) => Math.log10(Math.max(1, likes + 2 * comments)) + created / 45_000_000;

async function log(db: any, actor: string, action: string, type: string | null, id: any, details = "") {
  await db.prepare("INSERT INTO forum_modlog (actor, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(actor, action, type, id == null ? null : String(id), details.slice(0, 500), now()).run();
}

// ---------- чтение ----------

const AUTHOR_COLS = `u.pid AS a_pid, u.avatar_key AS a_ava, u.nick AS a_nick, u.posts_count AS a_posts, u.karma AS a_karma, u.signature AS a_sig, COALESCE(r.role, CASE WHEN fm.user_id IS NOT NULL THEN 'moderator' END) AS a_role`;
const AUTHOR_JOIN = (alias: string) => `LEFT JOIN forum_users u ON u.user_id = ${alias}.user_id LEFT JOIN player_roles r ON r.pkey = 'uid:' || ${alias}.user_id LEFT JOIN forum_moderators fm ON fm.user_id = ${alias}.user_id AND fm.section_id = 0`;
const TOPIC_CARD = `t.id, t.section_id, t.user_id, t.kind, t.title, t.excerpt, t.cover_key, t.likes_count, t.comments_count, t.pinned, t.featured, t.locked, t.hidden, t.created_at, t.last_activity, t.last_comment_user, s.slug AS s_slug, s.title AS s_title, s.icon AS s_icon`;

export const displayNick = (nick: any, pid: any) => (nick ? String(nick) : pid != null ? `Игрок #${pid}` : "Участник");
function decorate(rows: any[], s: ForumSettings, v?: Viewer) {
  for (const x of rows) {
    x.mine = !!(v?.uid && x.user_id === v.uid);
    x.author = { pid: x.a_pid ?? null, nick: displayNick(x.a_nick, x.a_pid), avatar: x.a_ava || null, posts: x.a_posts || 0, karma: x.a_karma || 0, role: x.a_role || null, rank: rankOf(x.a_posts || 0, s.ranks), sig: x.a_sig || "" };
    delete x.a_pid; delete x.a_ava; delete x.a_nick; delete x.a_posts; delete x.a_karma; delete x.a_role; delete x.a_sig;
  }
  return rows;
}
const blockFilter = (alias: string, v: Viewer) => (v.uid ? ` AND ${alias}.user_id NOT IN (SELECT blocked_id FROM forum_blocks WHERE user_id = ?)` : "");

export async function listSections(db: any) {
  const r = await db.prepare(`SELECT s.*, lt.title AS last_title, lu.nick AS last_nick FROM forum_sections s
    LEFT JOIN forum_topics lt ON lt.id = s.last_topic_id LEFT JOIN forum_users lu ON lu.user_id = s.last_post_user ORDER BY s.sort, s.id`).all();
  const rows = r.results || [];
  for (const x of rows) delete x.last_post_user;
  return rows;
}
export async function getSection(db: any, slug: string) {
  return db.prepare("SELECT * FROM forum_sections WHERE slug = ?").bind(String(slug)).first();
}

export type FeedTab = "rec" | "new" | "top";
export async function feed(db: any, v: Viewer, tab: FeedTab, page = 1, sectionId: number | null = null) {
  const s = await getSettings(db);
  const size = s.page_size, off = (Math.max(1, Math.min(500, page | 0)) - 1) * size;
  const where = ["t.deleted = 0", "t.hidden = 0"]; const args: any[] = [];
  if (sectionId != null) { where.push("t.section_id = ?"); args.push(sectionId); }
  if (tab === "top") { where.push("t.created_at > ?"); args.push(now() - 30 * 24 * H); }
  let sql = `SELECT ${TOPIC_CARD}, ${AUTHOR_COLS} FROM forum_topics t JOIN forum_sections s ON s.id = t.section_id ${AUTHOR_JOIN("t")} WHERE ${where.join(" AND ")}${blockFilter("t", v)}`;
  if (v.uid) args.push(v.uid);
  sql += tab === "rec" ? " ORDER BY t.featured DESC, t.hot DESC" : tab === "top" ? " ORDER BY t.likes_count DESC, t.comments_count DESC, t.id DESC" : " ORDER BY t.created_at DESC";
  sql += " LIMIT ? OFFSET ?"; args.push(size + 1, off);
  const rows = (await db.prepare(sql).bind(...args).all()).results || [];
  const more = rows.length > size;
  const items = decorate(rows.slice(0, size), s, v);
  await attachLiked(db, v, "t", items);
  return { items, more, page: Math.floor(off / size) + 1 };
}

export async function sectionTopics(db: any, v: Viewer, sectionId: number, sort: "new" | "top", page = 1) {
  const s = await getSettings(db);
  const size = s.page_size, off = (Math.max(1, Math.min(500, page | 0)) - 1) * size;
  const args: any[] = [sectionId];
  let sql = `SELECT ${TOPIC_CARD}, ${AUTHOR_COLS}, lu.nick AS last_nick FROM forum_topics t JOIN forum_sections s ON s.id = t.section_id ${AUTHOR_JOIN("t")} LEFT JOIN forum_users lu ON lu.user_id = t.last_comment_user
    WHERE t.section_id = ? AND t.deleted = 0${canMod(v, sectionId) ? "" : " AND t.hidden = 0"}${blockFilter("t", v)}`;
  if (v.uid) args.push(v.uid);
  sql += sort === "top" ? " ORDER BY t.likes_count DESC, t.id DESC" : " ORDER BY t.pinned DESC, t.last_activity DESC";
  sql += " LIMIT ? OFFSET ?"; args.push(size + 1, off);
  const rows = (await db.prepare(sql).bind(...args).all()).results || [];
  const items = decorate(rows.slice(0, size), s, v);
  await attachLiked(db, v, "t", items);
  return { items, more: rows.length > size, page: Math.floor(off / size) + 1 };
}

async function attachLiked(db: any, v: Viewer, type: "t" | "c", items: any[]) {
  for (const x of items) x.liked = false;
  if (!v.uid || !items.length) return;
  const ids = items.map((x) => x.id);
  const r = await db.prepare(`SELECT target_id FROM forum_likes WHERE user_id = ? AND target_type = ? AND target_id IN (${ids.map(() => "?").join(",")})`).bind(v.uid, type, ...ids).all();
  const set = new Set((r.results || []).map((x: any) => x.target_id));
  for (const x of items) x.liked = set.has(x.id);
}

export async function getTopic(db: any, v: Viewer, id: number) {
  const s = await getSettings(db);
  const t = await db.prepare(`SELECT t.*, s.slug AS s_slug, s.title AS s_title, s.icon AS s_icon, ${AUTHOR_COLS} FROM forum_topics t JOIN forum_sections s ON s.id = t.section_id ${AUTHOR_JOIN("t")} WHERE t.id = ?`).bind(id | 0).first();
  if (!t || (t.deleted && !canMod(v, t.section_id))) return null;
  if (t.hidden && !canMod(v, t.section_id) && t.user_id !== v.uid) return null;
  t.can_mod = canMod(v, t.section_id);
  decorate([t], s, v);
  await attachLiked(db, v, "t", [t]);
  t.blocked = v.uid ? !!(await db.prepare("SELECT 1 AS x FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(v.uid, t.user_id).first()) : false;
  t.subscribed = await isSub(db, v.uid, "t", t.id);
  return t;
}

export async function getComments(db: any, v: Viewer, topicId: number, page = 1) {
  const s = await getSettings(db);
  const sec = await db.prepare("SELECT section_id FROM forum_topics WHERE id = ?").bind(topicId | 0).first();
  const cm = canMod(v, sec?.section_id), adm = isAdmin(v);
  const size = s.comments_page_size, off = (Math.max(1, Math.min(1000, page | 0)) - 1) * size;
  const cols = `c.id, c.topic_id, c.user_id, c.parent_id, c.reply_to_id, c.body_html, c.body, c.likes_count, c.hidden, c.deleted, c.deleted_reason, c.created_at, c.updated_at, ${AUTHOR_COLS}`;
  const roots = (await db.prepare(`SELECT ${cols} FROM forum_comments c ${AUTHOR_JOIN("c")} WHERE c.topic_id = ? AND c.parent_id IS NULL ORDER BY c.id LIMIT ? OFFSET ?`).bind(topicId, size + 1, off).all()).results || [];
  const more = roots.length > size;
  const list = roots.slice(0, size);
  let replies: any[] = [];
  if (list.length) {
    const ids = list.map((x: any) => x.id);
    replies = (await db.prepare(`SELECT ${cols}, ru.nick AS reply_nick FROM forum_comments c ${AUTHOR_JOIN("c")} LEFT JOIN forum_comments rc ON rc.id = c.reply_to_id LEFT JOIN forum_users ru ON ru.user_id = rc.user_id WHERE c.parent_id IN (${ids.map(() => "?").join(",")}) ORDER BY c.id LIMIT 1000`).bind(...ids).all()).results || [];
  }
  const all = decorate([...list, ...replies], s, v);
  await attachLiked(db, v, "c", all);
  let blocked = new Set<string>();
  if (v.uid) blocked = new Set(((await db.prepare("SELECT blocked_id FROM forum_blocks WHERE user_id = ?").bind(v.uid).all()).results || []).map((x: any) => x.blocked_id));
  for (const c of all) {
    c.mine = c.user_id === v.uid;
    c.blocked = blocked.has(c.user_id);
    c.can_mod = cm;
    if (c.deleted && !adm) { c.body_html = ""; c.body = ""; c.deleted_reason = null; } // удалённое видит только админ (для восстановления)
    else if (c.hidden && !cm && !c.mine) { c.body_html = ""; c.body = ""; }
    if (!c.mine && !cm) delete c.body; // исходник нужен только для правки
  }
  const byRoot = new Map<number, any[]>();
  for (const r of replies) { if (!byRoot.has(r.parent_id)) byRoot.set(r.parent_id, []); byRoot.get(r.parent_id)!.push(r); }
  for (const r of list) r.replies = byRoot.get(r.id) || [];
  return { items: list, more, page: Math.floor(off / size) + 1, pages: null as any };
}

/** Страница автора по публичному номеру (pid). Строковый ключ — старый адрес с userId (для редиректа). */
export async function getAuthor(db: any, v: Viewer, key: number | string, page = 1) {
  const s = await getSettings(db);
  const byPid = typeof key === "number" || /^\d+$/.test(String(key));
  const u = await db.prepare(`SELECT u.user_id, u.pid, u.nick, u.avatar_key, u.signature, u.topics_count, u.posts_count, u.karma, u.first_seen, u.last_seen, r.role FROM forum_users u LEFT JOIN player_roles r ON r.pkey = 'uid:' || u.user_id WHERE ${byPid ? "u.pid = ?" : "u.user_id = ?"}`).bind(byPid ? Number(key) : String(key)).first();
  if (!u) return null;
  const uid = u.user_id;
  if (!u.role && (await db.prepare("SELECT 1 AS x FROM forum_moderators WHERE user_id = ? AND section_id = 0").bind(uid).first())) u.role = "moderator";
  u.rank = rankOf(u.posts_count, s.ranks);
  u.nick = displayNick(u.nick, u.pid);
  u.avatar = u.avatar_key || null;
  delete u.avatar_key;
  const self = !!v.uid && v.uid === uid;
  const size = s.page_size, off = (Math.max(1, page | 0) - 1) * size;
  const rows = (await db.prepare(`SELECT ${TOPIC_CARD}, ${AUTHOR_COLS} FROM forum_topics t JOIN forum_sections s ON s.id = t.section_id ${AUTHOR_JOIN("t")} WHERE t.user_id = ? AND t.deleted = 0${isMod(v) || self ? "" : " AND t.hidden = 0"} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).bind(uid, size + 1, off).all()).results || [];
  const items = decorate(rows.slice(0, size), s, v);
  await attachLiked(db, v, "t", items);
  const ban = isMod(v) ? await db.prepare("SELECT until, reason FROM forum_bans WHERE user_id = ?").bind(uid).first() : null;
  const blocked = v.uid ? !!(await db.prepare("SELECT 1 AS x FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(v.uid, uid).first()) : false;
  const stats = await authorStats(db, uid, s);
  delete u.user_id;
  return { user: u, stats, self, items, more: rows.length > size, ban: ban && (ban.until === 0 || ban.until > now()) ? ban : null, blocked };
}

export async function online(db: any) {
  const s = await getSettings(db);
  const since = now() - s.online_minutes * 60_000;
  const r = await db.prepare("SELECT u.pid, u.nick, u.avatar_key AS avatar, COALESCE(r.role, CASE WHEN fm.user_id IS NOT NULL THEN 'moderator' END) AS role FROM forum_users u LEFT JOIN player_roles r ON r.pkey = 'uid:' || u.user_id LEFT JOIN forum_moderators fm ON fm.user_id = u.user_id AND fm.section_id = 0 WHERE u.last_seen > ? ORDER BY u.last_seen DESC LIMIT 40").bind(since).all();
  return r.results || [];
}

export async function stats(db: any) {
  const r = await db.prepare("SELECT (SELECT COALESCE(SUM(topics_count),0) FROM forum_sections) AS topics, (SELECT COALESCE(SUM(posts_count),0) FROM forum_sections) AS posts, (SELECT COUNT(*) FROM forum_users) AS users").first();
  return r || { topics: 0, posts: 0, users: 0 };
}

// ---------- уведомления: упоминания ----------

async function notifyMentions(db: any, actor: string, text: string, topicId: number, commentId: number | null, skip: Set<string>) {
  const keys = extractMentions(text);
  if (!keys.length) return;
  const r = await db.prepare(`SELECT user_id FROM forum_users WHERE nick_key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all();
  for (const u of r.results || []) {
    if (skip.has(u.user_id)) continue;
    skip.add(u.user_id);
    await notify(db, { to: u.user_id, type: "mention", actor, topicId, commentId, text: plainText(text, 140) });
  }
}

// ---------- запись: темы ----------

async function checkCover(db: any, v: Viewer, key: any): Promise<string | null> {
  if (key == null || key === "") return null;
  const k = String(key).startsWith(MEDIA_PREFIX) ? String(key).slice(MEDIA_PREFIX.length) : String(key);
  if (!isMediaKey(k)) fail(400, "Обложка: неверная картинка");
  const m = await db.prepare("SELECT user_id FROM forum_media WHERE key = ?").bind(k).first();
  if (!m || (m.user_id !== v.uid && !isMod(v))) fail(400, "Обложка: загрузите картинку заново");
  return k;
}

export async function createTopic(db: any, v: Viewer, input: any) {
  needUser(v); needNotBanned(v);
  const s = await getSettings(db);
  await needAge(db, v, s);
  const sec = await db.prepare("SELECT * FROM forum_sections WHERE id = ?").bind(Number(input?.section_id) | 0).first();
  if (!sec) fail(400, "Выберите раздел");
  if (sec.admin_only && !canMod(v, sec.id)) fail(403, "В этом разделе темы создают только администраторы");
  const kind = input?.kind === "article" ? "article" : "discussion";
  let title = str(input?.title, s.topic_title_max, "Заголовок", 3);
  let body = str(input?.body, s.topic_body_max, "Текст", 2);
  if (countImages(body) > s.images_per_post) fail(400, `Не больше ${s.images_per_post} картинок в одной записи`);
  if (!isMod(v)) {
    const t = now();
    const last = await db.prepare("SELECT created_at FROM forum_topics WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").bind(v.uid).first();
    if (last && t - last.created_at < s.topic_cooldown_sec * 1000) fail(429, `Новую тему можно создать через ${Math.ceil((s.topic_cooldown_sec * 1000 - (t - last.created_at)) / 1000)} с`, "rate");
    const day = await db.prepare("SELECT COUNT(*) AS n FROM forum_topics WHERE user_id = ? AND created_at > ?").bind(v.uid, t - 24 * H).first();
    if ((day?.n || 0) >= s.topics_per_day) fail(429, `Лимит: ${s.topics_per_day} тем в сутки`, "rate");
  }
  title = await moderateText(s, title);
  body = await moderateText(s, body);
  const cover = (await checkCover(db, v, input?.cover)) || firstMediaKey(body);
  const t = now();
  const html = renderMd(body);
  const r = await db.prepare(`INSERT INTO forum_topics (section_id, user_id, kind, title, body, body_html, excerpt, cover_key, hot, created_at, updated_at, last_activity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(sec.id, v.uid, kind, title, body, html, plainText(body, kind === "article" ? 260 : 200), cover, hotScore(0, 0, t), t, t, t).run();
  const id = r.meta?.last_row_id;
  await db.batch([
    db.prepare("UPDATE forum_sections SET topics_count = topics_count + 1, posts_count = posts_count + 1, last_topic_id = ?, last_post_at = ?, last_post_user = ? WHERE id = ?").bind(id, t, v.uid, sec.id),
    db.prepare("UPDATE forum_users SET topics_count = topics_count + 1, posts_count = posts_count + 1, last_post_at = ? WHERE user_id = ?").bind(t, v.uid),
    db.prepare("INSERT OR IGNORE INTO forum_subs (user_id, kind, target_id, created_at) VALUES (?, 't', ?, ?)").bind(v.uid, id, t), // автор следит за своей темой
  ]);
  const told = new Set<string>([v.uid!]);
  await notifyMentions(db, v.uid!, `${title}\n${body}`, id, null, told);
  for (const to of await subscribers(db, "s", sec.id)) {
    if (told.has(to)) continue; told.add(to);
    await notify(db, { to, type: "sub_section", actor: v.uid, topicId: id, text: `${sec.title}: ${title}`, agg: `sec:${sec.id}` });
  }
  return { id };
}

async function ownTopic(db: any, v: Viewer, id: number) {
  needUser(v);
  const t = await db.prepare("SELECT * FROM forum_topics WHERE id = ?").bind(id | 0).first();
  if (!t || t.deleted) fail(404, "Тема не найдена");
  if (t.user_id !== v.uid && !canMod(v, t.section_id)) fail(403, "Это не ваша тема");
  return t;
}

/** Править запись может только автор (и админ). Модераторы — только удаляют/скрывают. */
const canEdit = (v: Viewer, authorId: string) => authorId === v.uid || isAdmin(v);

export async function updateTopic(db: any, v: Viewer, id: number, input: any) {
  const t = await ownTopic(db, v, id);
  if (!canEdit(v, t.user_id)) fail(403, "Модераторы не правят чужие записи — можно скрыть или удалить");
  if (t.user_id === v.uid) needNotBanned(v);
  if (t.locked && !canMod(v, t.section_id)) fail(403, "Тема закрыта");
  const s = await getSettings(db);
  let title = await moderateText(s, str(input?.title, s.topic_title_max, "Заголовок", 3));
  let body = str(input?.body, s.topic_body_max, "Текст", 2);
  if (countImages(body) > s.images_per_post) fail(400, `Не больше ${s.images_per_post} картинок в одной записи`);
  body = await moderateText(s, body);
  const kind = input?.kind === "article" ? "article" : input?.kind === "discussion" ? "discussion" : t.kind;
  let sectionId = t.section_id;
  if (input?.section_id != null && Number(input.section_id) !== t.section_id) {
    const sec = await db.prepare("SELECT * FROM forum_sections WHERE id = ?").bind(Number(input.section_id) | 0).first();
    if (!sec) fail(400, "Раздел не найден");
    if (sec.admin_only && !canMod(v, sec.id)) fail(403, "В этом разделе темы создают только администраторы");
    if (t.user_id !== v.uid && !canMod(v, sec.id)) fail(403, "Нет прав на этот раздел");
    sectionId = sec.id;
  }
  const cover = (await checkCover(db, v, input?.cover)) || firstMediaKey(body);
  await db.prepare("UPDATE forum_topics SET title = ?, body = ?, body_html = ?, excerpt = ?, cover_key = ?, kind = ?, section_id = ?, updated_at = ? WHERE id = ?")
    .bind(title, body, renderMd(body), plainText(body, kind === "article" ? 260 : 200), cover, kind, sectionId, now(), t.id).run();
  if (sectionId !== t.section_id) {
    const n = 1 + t.comments_count;
    await db.batch([
      db.prepare("UPDATE forum_sections SET topics_count = MAX(0, topics_count - 1), posts_count = MAX(0, posts_count - ?) WHERE id = ?").bind(n, t.section_id),
      db.prepare("UPDATE forum_sections SET topics_count = topics_count + 1, posts_count = posts_count + ? WHERE id = ?").bind(n, sectionId),
    ]);
  }
  if (t.user_id !== v.uid) await log(db, v.uid!, "topic_edit", "t", t.id, title);
  return { id: t.id };
}

export async function deleteTopic(db: any, v: Viewer, id: number, reason: any = "") {
  const t = await ownTopic(db, v, id);
  const why = String(reason ?? "").trim().slice(0, 200);
  const tm = now();
  await db.batch([
    db.prepare("UPDATE forum_topics SET deleted = 1, deleted_by = ?, deleted_at = ?, deleted_reason = ? WHERE id = ?").bind(v.uid, tm, why, t.id),
    db.prepare("UPDATE forum_sections SET topics_count = MAX(0, topics_count - 1), posts_count = MAX(0, posts_count - ?) WHERE id = ?").bind(1 + t.comments_count, t.section_id),
    db.prepare("UPDATE forum_users SET topics_count = MAX(0, topics_count - 1), posts_count = MAX(0, posts_count - 1) WHERE user_id = ?").bind(t.user_id),
    db.prepare("UPDATE forum_reports SET status = 'resolved' WHERE target_type = 't' AND target_id = ?").bind(t.id),
  ]);
  await log(db, v.uid!, t.user_id === v.uid ? "topic_delete_own" : "topic_delete", "t", t.id, `«${t.title}»${why ? " · причина: " + why : ""}`);
  await purgeFor(db, { topicId: t.id });
  if (t.user_id !== v.uid) await notify(db, { to: t.user_id, type: "mod", actor: v.uid, showActor: false, topicId: t.id, text: `Модератор удалил вашу тему «${t.title}»${why ? ". Причина: " + why : ""}` });
  return { ok: true, section: t.section_id };
}
/** Восстановление мягко удалённой темы — только админ. */
export async function restoreTopic(db: any, v: Viewer, id: number) {
  needAdmin(v);
  const t = await db.prepare("SELECT * FROM forum_topics WHERE id = ?").bind(id | 0).first();
  if (!t || !t.deleted) fail(404, "Удалённая тема не найдена");
  const sec = await db.prepare("SELECT id FROM forum_sections WHERE id = ?").bind(t.section_id).first();
  if (!sec) fail(400, "Раздел темы удалён — сначала создайте раздел или перенесите тему");
  await db.batch([
    db.prepare("UPDATE forum_topics SET deleted = 0, deleted_by = NULL, deleted_at = NULL, deleted_reason = NULL WHERE id = ?").bind(t.id),
    db.prepare("UPDATE forum_sections SET topics_count = topics_count + 1, posts_count = posts_count + ? WHERE id = ?").bind(1 + t.comments_count, t.section_id),
    db.prepare("UPDATE forum_users SET topics_count = topics_count + 1, posts_count = posts_count + 1 WHERE user_id = ?").bind(t.user_id),
  ]);
  await log(db, v.uid!, "topic_restore", "t", t.id, `«${t.title}»`);
  return { ok: true };
}

// ---------- комментарии ----------

export async function createComment(db: any, v: Viewer, topicId: number, input: any) {
  needUser(v); needNotBanned(v);
  const s = await getSettings(db);
  await needAge(db, v, s);
  const t = await db.prepare("SELECT * FROM forum_topics WHERE id = ?").bind(topicId | 0).first();
  if (!t || t.deleted || (t.hidden && !canMod(v, t.section_id))) fail(404, "Тема не найдена");
  if (t.locked && !canMod(v, t.section_id)) fail(403, "Тема закрыта для комментариев");
  let body = str(input?.body, s.comment_max, "Комментарий", 1);
  if (countImages(body) > Math.min(s.images_per_post, 10)) fail(400, "Слишком много картинок в комментарии");
  let parent: number | null = null, replyTo: number | null = null;
  if (input?.reply_to) {
    const p = await db.prepare("SELECT id, parent_id, topic_id, deleted FROM forum_comments WHERE id = ?").bind(Number(input.reply_to) | 0).first();
    if (!p || p.topic_id !== t.id) fail(400, "Комментарий для ответа не найден");
    parent = p.parent_id || p.id; replyTo = p.id;
  }
  if (!isMod(v)) {
    const tm = now();
    const last = await db.prepare("SELECT created_at FROM forum_comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").bind(v.uid).first();
    if (last && tm - last.created_at < s.comment_cooldown_sec * 1000) fail(429, `Слишком быстро — подождите ${Math.ceil((s.comment_cooldown_sec * 1000 - (tm - last.created_at)) / 1000)} с`, "rate");
    const hr = await db.prepare("SELECT COUNT(*) AS n FROM forum_comments WHERE user_id = ? AND created_at > ?").bind(v.uid, tm - H).first();
    if ((hr?.n || 0) >= s.comments_per_hour) fail(429, `Лимит: ${s.comments_per_hour} комментариев в час`, "rate");
  }
  body = await moderateText(s, body);
  const tm = now();
  const r = await db.prepare("INSERT INTO forum_comments (topic_id, user_id, parent_id, reply_to_id, body, body_html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(t.id, v.uid, parent, replyTo, body, renderMd(body, { headings: false }), tm, tm).run();
  const cc = t.comments_count + 1;
  await db.batch([
    db.prepare("UPDATE forum_topics SET comments_count = comments_count + 1, last_activity = ?, last_comment_user = ?, hot = ? WHERE id = ?").bind(tm, v.uid, hotScore(t.likes_count, cc, t.created_at), t.id),
    db.prepare("UPDATE forum_sections SET posts_count = posts_count + 1, last_topic_id = ?, last_post_at = ?, last_post_user = ? WHERE id = ?").bind(t.id, tm, v.uid, t.section_id),
    db.prepare("UPDATE forum_users SET posts_count = posts_count + 1, comments_count = comments_count + 1, last_post_at = ? WHERE user_id = ?").bind(tm, v.uid),
  ]);
  const cid = r.meta?.last_row_id;
  const told = new Set<string>([v.uid!]);
  const snippet = plainText(body, 140);
  if (replyTo) {
    const rc = await db.prepare("SELECT user_id, deleted, hidden FROM forum_comments WHERE id = ?").bind(replyTo).first();
    if (rc && !rc.deleted && !rc.hidden && !told.has(rc.user_id)) { told.add(rc.user_id); await notify(db, { to: rc.user_id, type: "reply", actor: v.uid, topicId: t.id, commentId: cid, text: snippet }); }
  }
  if (!told.has(t.user_id)) { told.add(t.user_id); await notify(db, { to: t.user_id, type: "comment", actor: v.uid, topicId: t.id, commentId: cid, text: snippet, agg: `com:${t.id}` }); }
  await notifyMentions(db, v.uid!, body, t.id, cid, told);
  for (const to of await subscribers(db, "t", t.id)) {
    if (told.has(to)) continue; told.add(to);
    await notify(db, { to, type: "sub_topic", actor: v.uid, topicId: t.id, commentId: cid, text: snippet, agg: `sub:${t.id}` });
  }
  return { id: cid };
}

async function ownComment(db: any, v: Viewer, id: number) {
  needUser(v);
  const c = await db.prepare("SELECT c.*, t.section_id FROM forum_comments c LEFT JOIN forum_topics t ON t.id = c.topic_id WHERE c.id = ?").bind(id | 0).first();
  if (!c || c.deleted) fail(404, "Комментарий не найден");
  if (c.user_id !== v.uid && !canMod(v, c.section_id)) fail(403, "Это не ваш комментарий");
  return c;
}
export async function updateComment(db: any, v: Viewer, id: number, input: any) {
  const c = await ownComment(db, v, id);
  if (!canEdit(v, c.user_id)) fail(403, "Модераторы не правят чужие комментарии — можно скрыть или удалить");
  if (c.user_id === v.uid) needNotBanned(v);
  const s = await getSettings(db);
  const body = await moderateText(s, str(input?.body, s.comment_max, "Комментарий", 1));
  await db.prepare("UPDATE forum_comments SET body = ?, body_html = ?, updated_at = ? WHERE id = ?").bind(body, renderMd(body, { headings: false }), now(), c.id).run();
  if (c.user_id !== v.uid) await log(db, v.uid!, "comment_edit", "c", c.id);
  return { id: c.id, html: renderMd(body, { headings: false }) };
}
export async function deleteComment(db: any, v: Viewer, id: number, reason: any = "") {
  const c = await ownComment(db, v, id);
  const why = String(reason ?? "").trim().slice(0, 200);
  await countComment(db, c.topic_id, c.user_id, -1, [
    db.prepare("UPDATE forum_comments SET deleted = 1, deleted_by = ?, deleted_at = ?, deleted_reason = ? WHERE id = ?").bind(v.uid, now(), why, c.id),
    db.prepare("UPDATE forum_reports SET status = 'resolved' WHERE target_type = 'c' AND target_id = ?").bind(c.id),
  ]);
  await log(db, v.uid!, c.user_id === v.uid ? "comment_delete_own" : "comment_delete", "c", c.id, `${String(c.body).slice(0, 120)}${why ? " · причина: " + why : ""}`);
  await purgeFor(db, { commentId: c.id });
  if (c.user_id !== v.uid) await notify(db, { to: c.user_id, type: "mod", actor: v.uid, showActor: false, topicId: c.topic_id, text: `Модератор удалил ваш комментарий «${plainText(c.body, 60)}»${why ? ". Причина: " + why : ""}` });
  return { ok: true };
}
/** Восстановление комментария — только админ. */
export async function restoreComment(db: any, v: Viewer, id: number) {
  needAdmin(v);
  const c = await db.prepare("SELECT * FROM forum_comments WHERE id = ?").bind(id | 0).first();
  if (!c || !c.deleted) fail(404, "Удалённый комментарий не найден");
  await countComment(db, c.topic_id, c.user_id, 1, [db.prepare("UPDATE forum_comments SET deleted = 0, deleted_by = NULL, deleted_at = NULL, deleted_reason = NULL WHERE id = ?").bind(c.id)]);
  await log(db, v.uid!, "comment_restore", "c", c.id, String(c.body).slice(0, 120));
  return { ok: true };
}
async function countComment(db: any, topicId: number, userId: string, d: number, extra: any[]) {
  const t = await db.prepare("SELECT section_id, likes_count, comments_count, created_at FROM forum_topics WHERE id = ?").bind(topicId).first();
  const cc = Math.max(0, (t?.comments_count || 0) + d);
  await db.batch([
    ...extra,
    db.prepare("UPDATE forum_topics SET comments_count = ?, hot = ? WHERE id = ?").bind(cc, hotScore(t?.likes_count || 0, cc, t?.created_at || 0), topicId),
    db.prepare("UPDATE forum_sections SET posts_count = MAX(0, posts_count + ?) WHERE id = ?").bind(d, t?.section_id ?? -1),
    db.prepare("UPDATE forum_users SET posts_count = MAX(0, posts_count + ?), comments_count = MAX(0, comments_count + ?) WHERE user_id = ?").bind(d, d, userId),
  ]);
}

// ---------- лайки ----------

const likeBurst = new Map<string, number[]>(); // в памяти воркера: защита от «пулемёта» вкл/выкл
export async function toggleLike(db: any, v: Viewer, type: "t" | "c", id: number) {
  needUser(v); needNotBanned(v);
  if (type !== "t" && type !== "c") fail(400, "Неверная цель");
  const s = await getSettings(db);
  const tm = now();
  const arr = (likeBurst.get(v.uid!) || []).filter((x) => tm - x < 60_000);
  if (arr.length >= s.likes_per_min * 2) fail(429, "Слишком много оценок — передохните минутку", "rate");
  arr.push(tm); likeBurst.set(v.uid!, arr);
  if (likeBurst.size > 5000) likeBurst.clear();
  const table = type === "t" ? "forum_topics" : "forum_comments";
  const row = await db.prepare(`SELECT id, user_id, likes_count, deleted, hidden${type === "t" ? ", comments_count, created_at, title" : ", topic_id, body"} FROM ${table} WHERE id = ?`).bind(id | 0).first();
  if (!row || row.deleted || row.hidden) fail(404, "Запись не найдена");
  if (row.user_id === v.uid) fail(400, "Свои записи оценивать нельзя");
  const ins = await db.prepare("INSERT OR IGNORE INTO forum_likes (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)").bind(v.uid, type, row.id, tm).run();
  let liked: boolean, delta: number;
  if (ins.meta?.changes) {
    const recent = await db.prepare("SELECT COUNT(*) AS n FROM forum_likes WHERE user_id = ? AND created_at > ?").bind(v.uid, tm - 60_000).first();
    if ((recent?.n || 0) > s.likes_per_min) {
      await db.prepare("DELETE FROM forum_likes WHERE user_id = ? AND target_type = ? AND target_id = ?").bind(v.uid, type, row.id).run();
      fail(429, "Слишком много оценок — передохните минутку", "rate");
    }
    liked = true; delta = 1;
  } else {
    await db.prepare("DELETE FROM forum_likes WHERE user_id = ? AND target_type = ? AND target_id = ?").bind(v.uid, type, row.id).run();
    liked = false; delta = -1;
  }
  const likes = Math.max(0, row.likes_count + delta);
  const stmts = [
    type === "t"
      ? db.prepare("UPDATE forum_topics SET likes_count = MAX(0, likes_count + ?), hot = ? WHERE id = ?").bind(delta, hotScore(likes, row.comments_count, row.created_at), row.id)
      : db.prepare("UPDATE forum_comments SET likes_count = MAX(0, likes_count + ?) WHERE id = ?").bind(delta, row.id),
    db.prepare("UPDATE forum_users SET karma = karma + ? WHERE user_id = ?").bind(delta, row.user_id),
    db.prepare("UPDATE forum_users SET likes_given = MAX(0, likes_given + ?) WHERE user_id = ?").bind(delta, v.uid),
  ];
  await db.batch(stmts);
  if (liked) await notify(db, { to: row.user_id, type: "like", actor: v.uid, topicId: type === "t" ? row.id : row.topic_id, commentId: type === "c" ? row.id : null,
    text: type === "t" ? row.title : plainText(row.body || "", 80), agg: `like:${type}:${row.id}` });
  return { liked, likes };
}

// ---------- жалобы и модерация ----------

export async function report(db: any, v: Viewer, type: "t" | "c", id: number, reason: any) {
  needUser(v); needNotBanned(v);
  if (type !== "t" && type !== "c") fail(400, "Неверная цель");
  const s = await getSettings(db);
  const table = type === "t" ? "forum_topics" : "forum_comments";
  const row = await db.prepare(`SELECT id, user_id, hidden, deleted FROM ${table} WHERE id = ?`).bind(id | 0).first();
  if (!row || row.deleted) fail(404, "Запись не найдена");
  if (row.user_id === v.uid) fail(400, "Нельзя пожаловаться на себя");
  const hr = await db.prepare("SELECT COUNT(*) AS n FROM forum_reports WHERE reporter = ? AND created_at > ?").bind(v.uid, now() - H).first();
  if ((hr?.n || 0) >= s.reports_per_hour) fail(429, "Слишком много жалоб за час", "rate");
  const why = String(reason ?? "").trim().slice(0, 300);
  const ins = await db.prepare("INSERT OR IGNORE INTO forum_reports (target_type, target_id, reporter, reason, created_at) VALUES (?, ?, ?, ?, ?)").bind(type, row.id, v.uid, why, now()).run();
  if (!ins.meta?.changes) return { ok: true, already: true };
  await db.prepare(`UPDATE ${table} SET reports_count = reports_count + 1 WHERE id = ?`).bind(row.id).run();
  const open = await db.prepare("SELECT COUNT(*) AS n FROM forum_reports WHERE target_type = ? AND target_id = ? AND status = 'open'").bind(type, row.id).first();
  let autoHidden = false;
  if (!row.hidden && (open?.n || 0) >= s.reports_autohide) {
    await db.prepare(`UPDATE ${table} SET hidden = 1 WHERE id = ?`).bind(row.id).run();
    await log(db, "system", "auto_hide", type, row.id, `жалоб: ${open?.n}`);
    autoHidden = true;
    await purgeFor(db, type === "t" ? { topicId: row.id } : { commentId: row.id });
    await notify(db, { to: row.user_id, type: "mod", showActor: false, topicId: (await targetRefs(db, type, row.id)).topicId, commentId: type === "c" ? row.id : null, text: `Ваш${type === "t" ? "а тема скрыта" : " комментарий скрыт"} до проверки модератором (несколько жалоб)` });
  }
  return { ok: true, autoHidden };
}

async function targetRefs(db: any, type: string, id: number): Promise<{ topicId: number | null; commentId: number | null; author: string | null; label: string }> {
  if (type === "t") { const t = await db.prepare("SELECT id, user_id, title FROM forum_topics WHERE id = ?").bind(id | 0).first(); return { topicId: t?.id ?? null, commentId: null, author: t?.user_id ?? null, label: `вашу тему «${t?.title ?? ""}»` }; }
  const c = await db.prepare("SELECT id, topic_id, user_id, body FROM forum_comments WHERE id = ?").bind(id | 0).first();
  return { topicId: c?.topic_id ?? null, commentId: c?.id ?? null, author: c?.user_id ?? null, label: `ваш комментарий «${plainText(c?.body || "", 60)}»` };
}
async function notifyHidden(db: any, v: Viewer, type: string, id: number, reason = "") {
  const r = await targetRefs(db, type, id);
  await purgeFor(db, type === "t" ? { topicId: id } : { commentId: id });
  if (r.author && r.author !== v.uid) await notify(db, { to: r.author, type: "mod", actor: v.uid, showActor: false, topicId: r.topicId, commentId: r.commentId, text: `Модератор скрыл ${r.label}${reason ? ". Причина: " + reason : ""}` });
}
async function sectionOfTarget(db: any, type: string, id: number): Promise<number | null> {
  const r = type === "t"
    ? await db.prepare("SELECT section_id FROM forum_topics WHERE id = ?").bind(id | 0).first()
    : await db.prepare("SELECT t.section_id FROM forum_comments c JOIN forum_topics t ON t.id = c.topic_id WHERE c.id = ?").bind(id | 0).first();
  return r ? r.section_id : null;
}
export async function listReports(db: any, v: Viewer, status: "open" | "resolved" = "open") {
  needMod(v);
  const r = await db.prepare(`SELECT rp.target_type, rp.target_id, COUNT(*) AS n, MAX(rp.created_at) AS last_at, GROUP_CONCAT(NULLIF(rp.reason, ''), ' · ') AS reasons
    FROM forum_reports rp WHERE rp.status = ? GROUP BY rp.target_type, rp.target_id ORDER BY last_at DESC LIMIT 100`).bind(status).all();
  const items = r.results || [];
  for (const it of items) {
    if (it.target_type === "t") {
      const t = await db.prepare("SELECT t.id, t.title, t.excerpt AS text, t.hidden, t.deleted, u.pid, u.nick, u.avatar_key AS avatar FROM forum_topics t LEFT JOIN forum_users u ON u.user_id = t.user_id WHERE t.id = ?").bind(it.target_id).first();
      it.target = t;
    } else {
      const c = await db.prepare("SELECT c.id, c.topic_id, substr(c.body, 1, 300) AS text, c.hidden, c.deleted, u.pid, u.nick, u.avatar_key AS avatar, t.title FROM forum_comments c LEFT JOIN forum_users u ON u.user_id = c.user_id LEFT JOIN forum_topics t ON t.id = c.topic_id WHERE c.id = ?").bind(it.target_id).first();
      it.target = c;
    }
    it.section_id = await sectionOfTarget(db, it.target_type, it.target_id);
  }
  return items.filter((it: any) => canMod(v, it.section_id));
}

/** Решение по жалобе: hide | unhide | delete | dismiss. */
export async function resolveReport(db: any, v: Viewer, type: "t" | "c", id: number, action: string, reason: any = "") {
  needMod(v);
  if (type !== "t" && type !== "c") fail(400, "Неверная цель");
  if (!canMod(v, await sectionOfTarget(db, type, id))) fail(403, "Этот раздел вне вашей зоны модерации");
  const table = type === "t" ? "forum_topics" : "forum_comments";
  if (action === "hide" || action === "unhide") {
    await db.prepare(`UPDATE ${table} SET hidden = ? WHERE id = ?`).bind(action === "hide" ? 1 : 0, id | 0).run();
    if (action === "hide") await notifyHidden(db, v, type, id, String(reason ?? "").trim().slice(0, 200));
  } else if (action === "delete") {
    if (type === "t") await deleteTopic(db, v, id, reason || "по жалобе"); else await deleteComment(db, v, id, reason || "по жалобе");
  } else if (action !== "dismiss") fail(400, "Неизвестное действие");
  await db.prepare("UPDATE forum_reports SET status = 'resolved' WHERE target_type = ? AND target_id = ?").bind(type, id | 0).run();
  if (action !== "delete") await log(db, v.uid!, "report_" + action, type, id);
  return { ok: true };
}

export async function setTopicFlag(db: any, v: Viewer, id: number, flag: string, value: boolean) {
  needMod(v);
  if (!canMod(v, await sectionOfTarget(db, "t", id))) fail(403, "Этот раздел вне вашей зоны модерации");
  if (!["pinned", "featured", "locked", "hidden"].includes(flag)) fail(400, "Неизвестный флаг");
  const r = await db.prepare(`UPDATE forum_topics SET ${flag} = ? WHERE id = ? AND deleted = 0`).bind(value ? 1 : 0, id | 0).run();
  if (!r.meta?.changes) fail(404, "Тема не найдена");
  await log(db, v.uid!, `${flag}_${value ? "on" : "off"}`, "t", id);
  if (value && flag === "hidden") await notifyHidden(db, v, "t", id);
  else if (value && (flag === "featured" || flag === "locked")) {
    const r = await targetRefs(db, "t", id);
    if (r.author !== v.uid) await notify(db, { to: r.author, type: "mod", actor: v.uid, showActor: false, topicId: id, text: flag === "featured" ? `Модератор добавил ${r.label} в «Рекомендованное» ✦` : `Модератор закрыл ${r.label} для новых комментариев` });
  }
  return { ok: true };
}
export async function setCommentHidden(db: any, v: Viewer, id: number, value: boolean) {
  needMod(v);
  if (!canMod(v, await sectionOfTarget(db, "c", id))) fail(403, "Этот раздел вне вашей зоны модерации");
  await db.prepare("UPDATE forum_comments SET hidden = ? WHERE id = ?").bind(value ? 1 : 0, id | 0).run();
  await log(db, v.uid!, value ? "comment_hide" : "comment_unhide", "c", id);
  if (value) await notifyHidden(db, v, "c", id);
  return { ok: true };
}

export async function banUser(db: any, v: Viewer, target: any, minutes: number, reason: any) {
  needMod(v);
  const tu = await resolveUser(db, target || {});
  if (!tu) fail(404, "Участник не найден");
  const uid = tu.user_id;
  if (uid === v.uid) fail(400, "Неверный пользователь");
  const tv = await loadViewer(db, uid, { touch: false });
  if (tv.role === "admin" || (tv.role === "moderator" && !isAdmin(v))) fail(403, "Нельзя ограничить администратора или модератора");
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0 || m > 60 * 24 * 3650) fail(400, "Срок: от 1 минуты до 10 лет, 0 — бессрочно");
  const until = m === 0 ? 0 : now() + Math.round(m) * 60_000;
  const why = String(reason ?? "").trim().slice(0, 200);
  await db.prepare("INSERT INTO forum_bans (user_id, until, reason, by_user, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET until = excluded.until, reason = excluded.reason, by_user = excluded.by_user, created_at = excluded.created_at").bind(uid, until, why, v.uid, now()).run();
  await log(db, v.uid!, "ban", "u", uid, `${tu.nick} · ${m === 0 ? "бессрочно" : m + " мин"}${why ? " · " + why : ""}`);
  await notify(db, { to: uid, type: "ban", actor: v.uid, showActor: false, text: `Модератор ограничил вам возможность писать на форуме ${m === 0 ? "бессрочно" : "до " + new Date(until).toLocaleString("ru-RU", { timeZone: "Europe/Kiev", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${why ? ". Причина: " + why : ""}` });
  return { ok: true, until };
}
export async function unbanUser(db: any, v: Viewer, target: any) {
  needMod(v);
  const tu = await resolveUser(db, target || {});
  if (!tu) fail(404, "Участник не найден");
  await db.prepare("DELETE FROM forum_bans WHERE user_id = ?").bind(tu.user_id).run();
  await log(db, v.uid!, "unban", "u", tu.user_id, tu.nick);
  await notify(db, { to: tu.user_id, type: "ban", actor: v.uid, showActor: false, text: "Ограничение на форуме снято — снова можно писать" });
  return { ok: true };
}
export async function listBans(db: any, v: Viewer) {
  needMod(v);
  const r = await db.prepare("SELECT b.until, b.reason, b.created_at, u.pid, u.nick, bu.nick AS by_nick FROM forum_bans b LEFT JOIN forum_users u ON u.user_id = b.user_id LEFT JOIN forum_users bu ON bu.user_id = b.by_user WHERE b.until = 0 OR b.until > ? ORDER BY b.created_at DESC LIMIT 200").bind(now()).all();
  return r.results || [];
}
export async function modlog(db: any, v: Viewer) {
  needMod(v);
  const r = await db.prepare(`SELECT l.id, l.action, l.target_type, CASE WHEN l.target_type = 'u' THEN CAST(tu.pid AS TEXT) ELSE l.target_id END AS target_id, tu.nick AS target_nick,
    l.details, l.created_at, CASE WHEN l.actor = 'system' THEN 'system' END AS actor, u.pid AS actor_pid, u.nick AS actor_nick
    FROM forum_modlog l LEFT JOIN forum_users u ON u.user_id = l.actor LEFT JOIN forum_users tu ON l.target_type = 'u' AND tu.user_id = l.target_id ORDER BY l.id DESC LIMIT 200`).all();
  return r.results || [];
}

// ---------- разделы (админ) ----------

function sectionInput(x: any) {
  const title = str(x?.title, 60, "Название раздела", 2);
  const description = String(x?.description ?? "").trim().slice(0, 200);
  const icon = Array.from(String(x?.icon ?? "❖").trim()).slice(0, 2).join("") || "❖";
  let slug = String(x?.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,32}$/.test(slug)) fail(400, "Адрес раздела: латиница, цифры и «-», 2–32 символа");
  return { title, description, icon, slug, admin_only: x?.admin_only ? 1 : 0 };
}
export async function createSection(db: any, v: Viewer, x: any) {
  needAdmin(v);
  const s = sectionInput(x);
  const max = await db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM forum_sections").first();
  try {
    const r = await db.prepare("INSERT INTO forum_sections (slug, title, description, icon, sort, admin_only, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(s.slug, s.title, s.description, s.icon, (max?.m || 0) + 10, s.admin_only, now()).run();
    await log(db, v.uid!, "section_create", "s", r.meta?.last_row_id, s.title);
    return { id: r.meta?.last_row_id };
  } catch (e: any) { if (String(e?.message || e).includes("UNIQUE")) fail(400, "Раздел с таким адресом уже есть"); throw e; }
}
export async function updateSection(db: any, v: Viewer, id: number, x: any) {
  needAdmin(v);
  const s = sectionInput(x);
  try {
    const r = await db.prepare("UPDATE forum_sections SET slug = ?, title = ?, description = ?, icon = ?, admin_only = ? WHERE id = ?").bind(s.slug, s.title, s.description, s.icon, s.admin_only, id | 0).run();
    if (!r.meta?.changes) fail(404, "Раздел не найден");
  } catch (e: any) { if (String(e?.message || e).includes("UNIQUE")) fail(400, "Раздел с таким адресом уже есть"); throw e; }
  await log(db, v.uid!, "section_edit", "s", id, s.title);
  return { ok: true };
}
export async function reorderSections(db: any, v: Viewer, ids: any) {
  needAdmin(v);
  if (!Array.isArray(ids) || ids.length > 200) fail(400, "Неверный порядок");
  await db.batch(ids.map((id: any, i: number) => db.prepare("UPDATE forum_sections SET sort = ? WHERE id = ?").bind((i + 1) * 10, Number(id) | 0)));
  await log(db, v.uid!, "section_reorder", "s", null, ids.join(","));
  return { ok: true };
}
/** Удаление раздела: пустой — сразу; с темами — только с переносом тем в другой раздел (ничего не теряется). */
export async function deleteSection(db: any, v: Viewer, id: number, moveTo: any) {
  needAdmin(v);
  const sec = await db.prepare("SELECT * FROM forum_sections WHERE id = ?").bind(id | 0).first();
  if (!sec) fail(404, "Раздел не найден");
  const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_topics WHERE section_id = ?").bind(sec.id).first();
  const stmts: any[] = [];
  if ((n?.n || 0) > 0) {
    const to = await db.prepare("SELECT id FROM forum_sections WHERE id = ?").bind(Number(moveTo) | 0).first();
    if (!to || to.id === sec.id) fail(400, `В разделе ${n.n} тем — выберите раздел, куда их перенести`);
    stmts.push(db.prepare("UPDATE forum_topics SET section_id = ? WHERE section_id = ?").bind(to.id, sec.id));
    stmts.push(db.prepare("UPDATE forum_sections SET topics_count = topics_count + ?, posts_count = posts_count + ? WHERE id = ?").bind(sec.topics_count, sec.posts_count, to.id));
  }
  stmts.push(db.prepare("DELETE FROM forum_sections WHERE id = ?").bind(sec.id));
  await db.batch(stmts);
  await log(db, v.uid!, "section_delete", "s", sec.id, `${sec.title}${n?.n ? ` → перенос ${n.n} тем в #${moveTo}` : ""}`);
  return { ok: true };
}

// ---------- настройки (админ) ----------

export async function updateSettings(db: any, v: Viewer, patch: any) {
  needAdmin(v);
  const p = validateSettings(patch);
  if (typeof p === "string") fail(400, p);
  const entries = Object.entries(p as any);
  if (!entries.length) return { ok: true };
  await db.batch(entries.map(([k, val]) => db.prepare("INSERT INTO forum_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, JSON.stringify(val))));
  clearSettingsCache();
  await log(db, v.uid!, "settings", null, null, entries.map(([k]) => k).join(", "));
  return { ok: true };
}

// ---------- свой профиль, блокировки ----------

export async function updateMe(db: any, v: Viewer, x: any) {
  needUser(v);
  // настройки уведомлений можно менять и при ограничении на форуме
  if (Array.isArray(x?.notif_off)) {
    const off = [...new Set(x.notif_off.map(String).filter((k: string) => (TOGGLABLE as readonly string[]).includes(k)))].join(",");
    await db.prepare("UPDATE forum_users SET notif_off = ? WHERE user_id = ?").bind(off, v.uid).run();
    if (x?.nick == null && x?.signature == null) return { ok: true };
  }
  needNotBanned(v);
  const s = await getSettings(db);
  const out: any = {};
  if (x?.nick != null) {
    const nick = String(x.nick).trim().replace(/\s+/g, " ");
    const e = nickProblem(nick, s); if (e) fail(400, e);
    out.nick = nick;
  }
  if (x?.signature != null) {
    const sig = String(x.signature).replace(/[\r\n]+/g, " ").trim();
    if (sig.length > s.signature_max) fail(400, `Подпись: до ${s.signature_max} символов`);
    out.signature = await moderateText(s, sig);
  }
  try {
    if (out.nick != null) await db.prepare("UPDATE forum_users SET nick = ?, nick_key = ? WHERE user_id = ?").bind(out.nick, nickKey(out.nick), v.uid).run();
  } catch (e: any) { if (String(e?.message || e).includes("UNIQUE")) fail(400, "Этот ник уже занят"); throw e; }
  if (out.signature != null) await db.prepare("UPDATE forum_users SET signature = ? WHERE user_id = ?").bind(out.signature, v.uid).run();
  return { ok: true };
}
export async function setBlock(db: any, v: Viewer, target: any, on: boolean) {
  needUser(v);
  const tu = await resolveUser(db, target || {});
  if (!tu || tu.user_id === v.uid) fail(400, "Неверный пользователь");
  if (on) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_blocks WHERE user_id = ?").bind(v.uid).first();
    if ((n?.n || 0) >= 500) fail(400, "Слишком длинный список скрытых");
    await db.prepare("INSERT OR IGNORE INTO forum_blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)").bind(v.uid, tu.user_id, now()).run();
  } else await db.prepare("DELETE FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(v.uid, tu.user_id).run();
  return { ok: true, blocked: on };
}
export async function listBlocks(db: any, v: Viewer) {
  needUser(v);
  const r = await db.prepare("SELECT u.pid, u.nick, u.avatar_key AS avatar FROM forum_blocks b JOIN forum_users u ON u.user_id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC").bind(v.uid).all();
  return r.results || [];
}
/** Поиск участников по началу ника (для модераторов: назначение, ограничения). */
export async function searchUsers(db: any, v: Viewer, q: any) {
  needMod(v);
  const k = nickKey(String(q ?? "")).replace(/[%_\\]/g, "");
  if (k.length < 1) return [];
  const r = await db.prepare("SELECT pid, nick, avatar_key AS avatar FROM forum_users WHERE nick_key LIKE ? ORDER BY posts_count DESC, nick_key LIMIT 10").bind(k + "%").all();
  return r.results || [];
}

// ---------- картинки ----------

export async function checkUploadAllowed(db: any, v: Viewer, size: number) {
  needUser(v); needNotBanned(v);
  const s = await getSettings(db);
  await needAge(db, v, s);
  if (size > s.upload_max_mb * 1024 * 1024) fail(413, `Картинка больше ${s.upload_max_mb} МБ`);
  if (!isMod(v)) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_media WHERE user_id = ? AND kind = 'post' AND created_at > ?").bind(v.uid, now() - H).first();
    if ((n?.n || 0) >= s.uploads_per_hour) fail(429, `Лимит: ${s.uploads_per_hour} картинок в час`, "rate");
  }
  return s;
}
export async function recordUpload(db: any, v: Viewer, key: string, mime: string, size: number) {
  await db.prepare("INSERT INTO forum_media (key, user_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)").bind(key, v.uid, mime, size, now()).run();
}

// ---------- модераторы форума (назначает админ) ----------

/** Профили для ролей из игры, которые ещё не заходили на форум (чтобы показывать ник/аватар, а не id). */
async function ensureStaffProfiles(db: any) {
  const miss = (await db.prepare("SELECT substr(r.pkey, 5) AS uid FROM player_roles r LEFT JOIN forum_users u ON u.user_id = substr(r.pkey, 5) WHERE r.pkey LIKE 'uid:%' AND u.user_id IS NULL LIMIT 50").all()).results || [];
  for (const m of miss) await ensureUser(db, m.uid, { seen: false });
}
/** Команда форума (публично): админы и модераторы игры + модераторы форума. Только ник, аватар, роль, зона. */
export async function forumTeam(db: any) {
  await ensureStaffProfiles(db);
  const game = (await db.prepare("SELECT u.pid, u.nick, u.avatar_key AS avatar, r.role FROM player_roles r JOIN forum_users u ON u.user_id = substr(r.pkey, 5) WHERE r.pkey LIKE 'uid:%' ORDER BY r.role, u.nick_key").all()).results || [];
  const fm = (await db.prepare("SELECT u.pid, u.nick, u.avatar_key AS avatar, m.section_id, s.title AS s_title, s.icon AS s_icon FROM forum_moderators m JOIN forum_users u ON u.user_id = m.user_id LEFT JOIN forum_sections s ON s.id = m.section_id ORDER BY u.nick_key").all()).results || [];
  const out: any[] = game.map((g: any) => ({ pid: g.pid, nick: displayNick(g.nick, g.pid), avatar: g.avatar || null, role: g.role, scope: "весь форум", source: "game" }));
  const seen = new Set(out.map((x) => x.pid));
  const byPid = new Map<number, any>();
  for (const m of fm) {
    if (seen.has(m.pid)) continue;
    let x = byPid.get(m.pid);
    if (!x) { x = { pid: m.pid, nick: displayNick(m.nick, m.pid), avatar: m.avatar || null, role: "moderator", scopes: [] as string[], source: "forum" }; byPid.set(m.pid, x); out.push(x); }
    x.scopes.push(m.section_id === 0 ? "весь форум" : `${m.s_icon || ""} ${m.s_title || "раздел #" + m.section_id}`.trim());
  }
  for (const x of out) if (x.scopes) { x.scope = x.scopes.includes("весь форум") ? "весь форум" : x.scopes.join(", "); delete x.scopes; }
  return out;
}
export async function listModerators(db: any, v: Viewer) {
  needAdmin(v);
  await ensureStaffProfiles(db);
  const forum = (await db.prepare("SELECT u.pid, u.nick, u.avatar_key AS avatar, m.section_id, m.granted_at, s.title AS s_title, g.nick AS by_nick FROM forum_moderators m JOIN forum_users u ON u.user_id = m.user_id LEFT JOIN forum_sections s ON s.id = m.section_id LEFT JOIN forum_users g ON g.user_id = m.granted_by ORDER BY m.granted_at DESC").all()).results || [];
  const game = (await db.prepare("SELECT u.pid, u.nick, u.avatar_key AS avatar, r.role FROM player_roles r JOIN forum_users u ON u.user_id = substr(r.pkey, 5) WHERE r.pkey LIKE 'uid:%' ORDER BY r.role, u.nick_key").all()).results || [];
  for (const x of [...forum, ...game]) x.nick = displayNick(x.nick, x.pid);
  return { forum, game };
}
export async function addModerator(db: any, v: Viewer, target: any, sectionId: any) {
  needAdmin(v);
  if (!target?.nick && target?.pid == null) fail(400, "Укажите ник участника");
  const u = await resolveUser(db, { pid: target.pid, nick: target.nick });
  if (!u) fail(404, "Участник не найден (он должен хотя бы раз зайти на форум)");
  const sid = Number(sectionId) | 0;
  if (sid) { const sec = await db.prepare("SELECT id FROM forum_sections WHERE id = ?").bind(sid).first(); if (!sec) fail(400, "Раздел не найден"); }
  await db.prepare("INSERT OR IGNORE INTO forum_moderators (user_id, section_id, granted_by, granted_at) VALUES (?, ?, ?, ?)").bind(u.user_id, sid, v.uid, now()).run();
  await log(db, v.uid!, "mod_add", "u", u.user_id, `${u.nick}${sid ? " · раздел #" + sid : " · весь форум"}`);
  const secT = sid ? await db.prepare("SELECT title FROM forum_sections WHERE id = ?").bind(sid).first() : null;
  await notify(db, { to: u.user_id, type: "mod_assign", actor: v.uid, showActor: false, text: `Вас назначили модератором форума: ${sid ? "раздел «" + (secT?.title || "#" + sid) + "»" : "весь форум"}` });
  return { ok: true };
}
export async function removeModerator(db: any, v: Viewer, target: any, sectionId: any) {
  needAdmin(v);
  const sid = Number(sectionId) | 0;
  const tu = await resolveUser(db, target || {});
  if (!tu) fail(404, "Участник не найден");
  const r = await db.prepare("DELETE FROM forum_moderators WHERE user_id = ? AND section_id = ?").bind(tu.user_id, sid).run();
  if (!r.meta?.changes) fail(404, "Такого назначения нет");
  await log(db, v.uid!, "mod_remove", "u", tu.user_id, `${tu.nick} · ${sid ? "раздел #" + sid : "весь форум"}`);
  return { ok: true };
}

// ---------- аватары ----------

export async function checkAvatarAllowed(db: any, v: Viewer, size: number) {
  needUser(v); needNotBanned(v);
  const s = await getSettings(db);
  if (size > s.avatar_max_kb * 1024) fail(413, `Аватар больше ${s.avatar_max_kb} КБ`);
  if (!isAdmin(v)) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_media WHERE user_id = ? AND kind = 'avatar' AND created_at > ?").bind(v.uid, now() - 24 * H).first();
    if ((n?.n || 0) >= s.avatars_per_day) fail(429, `Аватар можно менять не чаще ${s.avatars_per_day} раз в сутки`, "rate");
  }
  return s;
}
/** Новый аватар; возвращает ключ старого (его файл можно удалить из хранилища). */
export async function setAvatar(db: any, v: Viewer, key: string, mime: string, size: number) {
  const old = v.user?.avatar_key || null;
  const t = now();
  await db.batch([
    db.prepare("INSERT INTO forum_media (key, user_id, mime, size, created_at, kind) VALUES (?, ?, ?, ?, ?, 'avatar')").bind(key, v.uid, mime, size, t),
    db.prepare("UPDATE forum_users SET avatar_key = ?, avatar_at = ? WHERE user_id = ?").bind(key, t, v.uid),
  ]);
  if (v.user) v.user.avatar_key = key;
  return { old };
}
/** Убрать аватар: свой — всегда; чужой — модератор/админ (модератор не трогает админов и других модераторов), с записью в журнал. */
export async function removeAvatar(db: any, v: Viewer, target: any | null, reason: any = "") {
  needUser(v);
  if (!target) {
    const old = v.user?.avatar_key || null;
    if (!old) return { ok: true, old: null };
    await db.prepare("UPDATE forum_users SET avatar_key = NULL, avatar_at = ? WHERE user_id = ?").bind(now(), v.uid).run();
    return { ok: true, old };
  }
  needMod(v);
  const tu = await resolveUser(db, target);
  if (!tu) fail(404, "Участник не найден");
  if (tu.user_id === v.uid) return removeAvatar(db, v, null);
  const tv = await loadViewer(db, tu.user_id, { touch: false });
  if (tv.role === "admin" || (tv.role === "moderator" && !isAdmin(v))) fail(403, "Аватар администратора или модератора может убрать только админ");
  if (!tu.avatar_key) fail(404, "У участника нет своего аватара");
  await db.prepare("UPDATE forum_users SET avatar_key = NULL, avatar_at = ? WHERE user_id = ?").bind(now(), tu.user_id).run();
  const why = String(reason ?? "").trim().slice(0, 200);
  await log(db, v.uid!, "avatar_remove", "u", tu.user_id, `${tu.nick} · файл ${tu.avatar_key}${why ? " · причина: " + why : ""}`);
  await notify(db, { to: tu.user_id, type: "mod", actor: v.uid, showActor: false, text: `Модератор убрал ваш аватар${why ? ". Причина: " + why : ""}` });
  return { ok: true, old: null }; // файл оставляем в хранилище — для разбора по журналу
}

// ---------- подписки ----------

export async function subscribe(db: any, v: Viewer, kind: any, id: any, on: boolean) {
  needUser(v);
  if (kind !== "t" && kind !== "s") fail(400, "Неверная подписка");
  const exists = kind === "t"
    ? await db.prepare("SELECT id FROM forum_topics WHERE id = ? AND deleted = 0").bind(Number(id) | 0).first()
    : await db.prepare("SELECT id FROM forum_sections WHERE id = ?").bind(Number(id) | 0).first();
  if (!exists) fail(404, kind === "t" ? "Тема не найдена" : "Раздел не найден");
  if (on) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_subs WHERE user_id = ?").bind(v.uid).first();
    if ((n?.n || 0) >= 1000) fail(400, "Слишком много подписок");
  }
  await setSub(db, v.uid!, kind, exists.id, on);
  return { ok: true, subscribed: on };
}
export const sectionSubscribed = (db: any, v: Viewer, sectionId: number) => isSub(db, v.uid, "s", sectionId);

// ---------- статистика участника ----------

const ACHIEVEMENTS: { id: string; icon: string; title: string; test: (s: any) => boolean }[] = [
  { id: "first_topic", icon: "✍", title: "Первая тема", test: (s) => s.topics >= 1 },
  { id: "talker", icon: "💬", title: "Собеседник — 50 комментариев", test: (s) => s.comments >= 50 },
  { id: "liked10", icon: "♥", title: "10 оценок от других", test: (s) => s.karma >= 10 },
  { id: "liked100", icon: "❤", title: "Любимец публики — 100 оценок", test: (s) => s.karma >= 100 },
  { id: "kind", icon: "🤝", title: "Щедрая душа — поставил(а) 50 оценок", test: (s) => s.given >= 50 },
  { id: "hit", icon: "🔥", title: "Хит — тема с 10+ оценками", test: (s) => s.bestLikes >= 10 },
  { id: "author", icon: "📚", title: "Летописец — 10 тем", test: (s) => s.topics >= 10 },
  { id: "old", icon: "🕯", title: "Старожил — месяц на форуме", test: (s) => s.days >= 30 },
];

/** Статистика для страницы автора: счётчики из forum_users + несколько дешёвых запросов по индексам user_id. */
export async function authorStats(db: any, uid: string, s: ForumSettings) {
  const u = await db.prepare("SELECT topics_count, comments_count, posts_count, karma, likes_given, first_seen, last_seen FROM forum_users WHERE user_id = ?").bind(uid).first();
  if (!u) return null;
  const since = now() - 30 * 24 * H;
  const [best, sec, acts] = await Promise.all([
    db.prepare("SELECT id, title, likes_count, comments_count FROM forum_topics WHERE user_id = ? AND deleted = 0 AND hidden = 0 ORDER BY likes_count DESC, comments_count DESC, id DESC LIMIT 1").bind(uid).first(),
    db.prepare(`SELECT s.slug, s.title, s.icon, COUNT(*) AS n FROM (SELECT section_id FROM forum_topics WHERE user_id = ? AND deleted = 0
        UNION ALL SELECT t.section_id FROM forum_comments c JOIN forum_topics t ON t.id = c.topic_id WHERE c.user_id = ? AND c.deleted = 0) x
      JOIN forum_sections s ON s.id = x.section_id GROUP BY s.id ORDER BY n DESC LIMIT 1`).bind(uid, uid).first(),
    db.prepare("SELECT created_at FROM forum_topics WHERE user_id = ? AND created_at > ? AND deleted = 0 UNION ALL SELECT created_at FROM forum_comments WHERE user_id = ? AND created_at > ? AND deleted = 0 LIMIT 5000").bind(uid, since, uid, since).all(),
  ]);
  // активность по дням (киевское время), последние 30 дней
  const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Kiev" });
  const days: { d: string; n: number }[] = [];
  for (let i = 29; i >= 0; i--) days.push({ d: dayKey(now() - i * 24 * H), n: 0 });
  const idx = new Map(days.map((x, i) => [x.d, i]));
  for (const r of acts.results || []) { const i = idx.get(dayKey(r.created_at)); if (i != null) days[i].n++; }
  // звание и прогресс до следующего
  const ranks = [...s.ranks].sort((a, b) => a[0] - b[0]);
  let cur = ranks[0], next: any = null;
  for (let i = 0; i < ranks.length; i++) if (u.posts_count >= ranks[i][0]) { cur = ranks[i]; next = ranks[i + 1] || null; }
  const pct = next ? Math.max(0, Math.min(100, Math.round(((u.posts_count - cur[0]) / (next[0] - cur[0])) * 100))) : 100;
  const base = { topics: u.topics_count, comments: u.comments_count, karma: u.karma, given: u.likes_given, bestLikes: best?.likes_count || 0, days: Math.floor((now() - u.first_seen) / (24 * H)) };
  return {
    topics: u.topics_count, comments: u.comments_count, posts: u.posts_count, likes_received: u.karma, likes_given: u.likes_given, karma: u.karma,
    first_seen: u.first_seen, last_seen: u.last_seen,
    rank: { name: cur?.[1] || "", next: next ? { name: next[1], at: next[0], left: next[0] - u.posts_count } : null, pct },
    best_topic: best ? { id: best.id, title: best.title, likes: best.likes_count, comments: best.comments_count } : null,
    top_section: sec ? { slug: sec.slug, title: sec.title, icon: sec.icon, n: sec.n } : null,
    activity: days, activity_total: days.reduce((a, x) => a + x.n, 0),
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, title: a.title, got: a.test(base) })),
  };
}
