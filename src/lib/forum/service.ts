// Форум МоррисГрада: серверная логика (D1). Все проверки прав, лимитов и фильтров — здесь, на сервере.
// Роли: админ/модератор — из player_roles ('uid:<Clerk userId>'), как в админке игры.
import { renderMd, plainText, firstMediaKey, isMediaKey, MEDIA_PREFIX } from "./md";
import { compileWords, filterText } from "./profanity";
import { getSettings, validateSettings, clearSettingsCache, rankOf, type ForumSettings } from "./settings";

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

function hashTag(uid: string) {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) { h ^= uid.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(-4).toUpperCase();
}

export async function ensureUser(db: any, uid: string): Promise<any> {
  let u = await db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(uid).first();
  const t = now();
  if (!u) {
    let nick = "";
    try {
      const s = await db.prepare("SELECT username FROM users WHERE id = ?").bind(uid).first();
      const n = String(s?.username || "").trim();
      if (n && n !== "Новичок" && validNick(n) === null) nick = n;
    } catch {}
    if (!nick) nick = "Житель-" + hashTag(uid);
    for (let i = 0; i < 5; i++) {
      const tryNick = i === 0 ? nick : `${nick.slice(0, 18)}-${hashTag(uid + i)}`;
      const r = await db.prepare("INSERT OR IGNORE INTO forum_users (user_id, nick, nick_key, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)").bind(uid, tryNick, nickKey(tryNick), t, t).run();
      if (r.meta?.changes) break;
      const again = await db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(uid).first();
      if (again) return again;
    }
    u = await db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(uid).first();
  } else if (t - u.last_seen > 60_000) {
    await db.prepare("UPDATE forum_users SET last_seen = ? WHERE user_id = ?").bind(t, uid).run();
    u.last_seen = t;
  }
  return u;
}

export async function loadViewer(db: any, uid: string | null, opts: { touch?: boolean } = {}): Promise<Viewer> {
  if (!uid) return { uid: null, role: null, ban: null, user: null, scope: null };
  const [gameRole, banRow, fm] = await Promise.all([
    roleOf(db, uid),
    db.prepare("SELECT until, reason FROM forum_bans WHERE user_id = ?").bind(uid).first().catch(() => null),
    db.prepare("SELECT section_id FROM forum_moderators WHERE user_id = ?").bind(uid).all().then((r: any) => r.results || []).catch(() => []),
  ]);
  let role: Role = gameRole, scope: Viewer["scope"] = gameRole ? "all" : null;
  if (!role && fm.length) { role = "moderator"; scope = fm.some((x: any) => x.section_id === 0) ? "all" : fm.map((x: any) => x.section_id); }
  const ban = banRow && (banRow.until === 0 || banRow.until > now()) ? { until: banRow.until, reason: banRow.reason } : null;
  const user = opts.touch === false ? await db.prepare("SELECT * FROM forum_users WHERE user_id = ?").bind(uid).first() : await ensureUser(db, uid);
  return { uid, role, ban, user, scope, gameRole };
}

export const nickKey = (n: string) => String(n).trim().toLowerCase().replace(/ё/g, "е");
export function validNick(n: string): string | null {
  const s = String(n ?? "").trim();
  if (s.length < 3 || s.length > 24) return "Ник: от 3 до 24 символов";
  if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_\- .]+$/.test(s)) return "Ник: буквы, цифры, пробел, «_», «-», «.»";
  if (/^(админ|admin|модер|moder|система|system)/i.test(s)) return "Такой ник занят системой";
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

const AUTHOR_COLS = `u.nick AS a_nick, u.posts_count AS a_posts, u.karma AS a_karma, u.signature AS a_sig, COALESCE(r.role, CASE WHEN fm.user_id IS NOT NULL THEN 'moderator' END) AS a_role`;
const AUTHOR_JOIN = (alias: string) => `LEFT JOIN forum_users u ON u.user_id = ${alias}.user_id LEFT JOIN player_roles r ON r.pkey = 'uid:' || ${alias}.user_id LEFT JOIN forum_moderators fm ON fm.user_id = ${alias}.user_id AND fm.section_id = 0`;
const TOPIC_CARD = `t.id, t.section_id, t.user_id, t.kind, t.title, t.excerpt, t.cover_key, t.likes_count, t.comments_count, t.pinned, t.featured, t.locked, t.hidden, t.created_at, t.last_activity, t.last_comment_user, s.slug AS s_slug, s.title AS s_title, s.icon AS s_icon`;

function decorate(rows: any[], s: ForumSettings) {
  for (const x of rows) {
    x.author = { id: x.user_id, nick: x.a_nick || "Житель", posts: x.a_posts || 0, karma: x.a_karma || 0, role: x.a_role || null, rank: rankOf(x.a_posts || 0, s.ranks), sig: x.a_sig || "" };
    delete x.a_nick; delete x.a_posts; delete x.a_karma; delete x.a_role; delete x.a_sig;
  }
  return rows;
}
const blockFilter = (alias: string, v: Viewer) => (v.uid ? ` AND ${alias}.user_id NOT IN (SELECT blocked_id FROM forum_blocks WHERE user_id = ?)` : "");

export async function listSections(db: any) {
  const r = await db.prepare(`SELECT s.*, lt.title AS last_title, lu.nick AS last_nick FROM forum_sections s
    LEFT JOIN forum_topics lt ON lt.id = s.last_topic_id LEFT JOIN forum_users lu ON lu.user_id = s.last_post_user ORDER BY s.sort, s.id`).all();
  return r.results || [];
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
  const items = decorate(rows.slice(0, size), s);
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
  const items = decorate(rows.slice(0, size), s);
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
  decorate([t], s);
  await attachLiked(db, v, "t", [t]);
  t.blocked = v.uid ? !!(await db.prepare("SELECT 1 AS x FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(v.uid, t.user_id).first()) : false;
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
  const all = decorate([...list, ...replies], s);
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

export async function getAuthor(db: any, v: Viewer, uid: string, page = 1) {
  const s = await getSettings(db);
  const u = await db.prepare("SELECT u.user_id, u.nick, u.signature, u.topics_count, u.posts_count, u.karma, u.first_seen, u.last_seen, r.role FROM forum_users u LEFT JOIN player_roles r ON r.pkey = 'uid:' || u.user_id WHERE u.user_id = ?").bind(uid).first();
  if (!u) return null;
  if (!u.role && (await db.prepare("SELECT 1 AS x FROM forum_moderators WHERE user_id = ? AND section_id = 0").bind(uid).first())) u.role = "moderator";
  u.rank = rankOf(u.posts_count, s.ranks);
  const size = s.page_size, off = (Math.max(1, page | 0) - 1) * size;
  const rows = (await db.prepare(`SELECT ${TOPIC_CARD}, ${AUTHOR_COLS} FROM forum_topics t JOIN forum_sections s ON s.id = t.section_id ${AUTHOR_JOIN("t")} WHERE t.user_id = ? AND t.deleted = 0${isMod(v) || v.uid === uid ? "" : " AND t.hidden = 0"} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).bind(uid, size + 1, off).all()).results || [];
  const items = decorate(rows.slice(0, size), s);
  await attachLiked(db, v, "t", items);
  const ban = isMod(v) ? await db.prepare("SELECT until, reason FROM forum_bans WHERE user_id = ?").bind(uid).first() : null;
  const blocked = v.uid ? !!(await db.prepare("SELECT 1 AS x FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(v.uid, uid).first()) : false;
  return { user: u, items, more: rows.length > size, ban: ban && (ban.until === 0 || ban.until > now()) ? ban : null, blocked };
}

export async function online(db: any) {
  const s = await getSettings(db);
  const since = now() - s.online_minutes * 60_000;
  const r = await db.prepare("SELECT u.user_id, u.nick, COALESCE(r.role, CASE WHEN fm.user_id IS NOT NULL THEN 'moderator' END) AS role FROM forum_users u LEFT JOIN player_roles r ON r.pkey = 'uid:' || u.user_id LEFT JOIN forum_moderators fm ON fm.user_id = u.user_id AND fm.section_id = 0 WHERE u.last_seen > ? ORDER BY u.last_seen DESC LIMIT 40").bind(since).all();
  return r.results || [];
}

export async function stats(db: any) {
  const r = await db.prepare("SELECT (SELECT COALESCE(SUM(topics_count),0) FROM forum_sections) AS topics, (SELECT COALESCE(SUM(posts_count),0) FROM forum_sections) AS posts, (SELECT COUNT(*) FROM forum_users) AS users").first();
  return r || { topics: 0, posts: 0, users: 0 };
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
  ]);
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
    db.prepare("UPDATE forum_users SET posts_count = posts_count + 1, last_post_at = ? WHERE user_id = ?").bind(tm, v.uid),
  ]);
  return { id: r.meta?.last_row_id };
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
    db.prepare("UPDATE forum_users SET posts_count = MAX(0, posts_count + ?) WHERE user_id = ?").bind(d, userId),
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
  const row = await db.prepare(`SELECT id, user_id, likes_count, deleted, hidden${type === "t" ? ", comments_count, created_at" : ""} FROM ${table} WHERE id = ?`).bind(id | 0).first();
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
  ];
  await db.batch(stmts);
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
  }
  return { ok: true, autoHidden };
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
      const t = await db.prepare("SELECT t.id, t.title, t.excerpt AS text, t.hidden, t.deleted, t.user_id, u.nick FROM forum_topics t LEFT JOIN forum_users u ON u.user_id = t.user_id WHERE t.id = ?").bind(it.target_id).first();
      it.target = t;
    } else {
      const c = await db.prepare("SELECT c.id, c.topic_id, substr(c.body, 1, 300) AS text, c.hidden, c.deleted, c.user_id, u.nick, t.title FROM forum_comments c LEFT JOIN forum_users u ON u.user_id = c.user_id LEFT JOIN forum_topics t ON t.id = c.topic_id WHERE c.id = ?").bind(it.target_id).first();
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
  return { ok: true };
}
export async function setCommentHidden(db: any, v: Viewer, id: number, value: boolean) {
  needMod(v);
  if (!canMod(v, await sectionOfTarget(db, "c", id))) fail(403, "Этот раздел вне вашей зоны модерации");
  await db.prepare("UPDATE forum_comments SET hidden = ? WHERE id = ?").bind(value ? 1 : 0, id | 0).run();
  await log(db, v.uid!, value ? "comment_hide" : "comment_unhide", "c", id);
  return { ok: true };
}

export async function banUser(db: any, v: Viewer, uid: string, minutes: number, reason: any, nick?: any) {
  needMod(v);
  uid = String(uid || "");
  if (!uid && nick) {
    const u = await db.prepare("SELECT user_id FROM forum_users WHERE nick_key = ?").bind(nickKey(String(nick))).first();
    if (!u) fail(404, "Участник с таким ником не найден");
    uid = u.user_id;
  }
  if (!uid || uid === v.uid) fail(400, "Неверный пользователь");
  const tv = await loadViewer(db, uid, { touch: false });
  if (tv.role === "admin" || (tv.role === "moderator" && !isAdmin(v))) fail(403, "Нельзя ограничить администратора или модератора");
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0 || m > 60 * 24 * 3650) fail(400, "Срок: от 1 минуты до 10 лет, 0 — бессрочно");
  const until = m === 0 ? 0 : now() + Math.round(m) * 60_000;
  const why = String(reason ?? "").trim().slice(0, 200);
  await db.prepare("INSERT INTO forum_bans (user_id, until, reason, by_user, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET until = excluded.until, reason = excluded.reason, by_user = excluded.by_user, created_at = excluded.created_at").bind(uid, until, why, v.uid, now()).run();
  await log(db, v.uid!, "ban", "u", uid, `${m === 0 ? "бессрочно" : m + " мин"}${why ? " · " + why : ""}`);
  return { ok: true, until };
}
export async function unbanUser(db: any, v: Viewer, uid: string) {
  needMod(v);
  await db.prepare("DELETE FROM forum_bans WHERE user_id = ?").bind(String(uid)).run();
  await log(db, v.uid!, "unban", "u", uid);
  return { ok: true };
}
export async function listBans(db: any, v: Viewer) {
  needMod(v);
  const r = await db.prepare("SELECT b.*, u.nick, bu.nick AS by_nick FROM forum_bans b LEFT JOIN forum_users u ON u.user_id = b.user_id LEFT JOIN forum_users bu ON bu.user_id = b.by_user WHERE b.until = 0 OR b.until > ? ORDER BY b.created_at DESC LIMIT 200").bind(now()).all();
  return r.results || [];
}
export async function modlog(db: any, v: Viewer) {
  needMod(v);
  const r = await db.prepare("SELECT l.*, u.nick AS actor_nick FROM forum_modlog l LEFT JOIN forum_users u ON u.user_id = l.actor ORDER BY l.id DESC LIMIT 200").all();
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
  needUser(v); needNotBanned(v);
  const s = await getSettings(db);
  const out: any = {};
  if (x?.nick != null) {
    const nick = String(x.nick).trim().replace(/\s+/g, " ");
    const e = validNick(nick); if (e) fail(400, e);
    if (s.filter_mode !== "off" && !filterText(nick, compileWords(s.filter_words)).clean) fail(400, "Такой ник не подойдёт");
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
export async function setBlock(db: any, v: Viewer, uid: string, on: boolean) {
  needUser(v);
  uid = String(uid || "");
  if (!uid || uid === v.uid) fail(400, "Неверный пользователь");
  if (on) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_blocks WHERE user_id = ?").bind(v.uid).first();
    if ((n?.n || 0) >= 500) fail(400, "Слишком длинный список скрытых");
    await db.prepare("INSERT OR IGNORE INTO forum_blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)").bind(v.uid, uid, now()).run();
  } else await db.prepare("DELETE FROM forum_blocks WHERE user_id = ? AND blocked_id = ?").bind(v.uid, uid).run();
  return { ok: true, blocked: on };
}
export async function listBlocks(db: any, v: Viewer) {
  needUser(v);
  const r = await db.prepare("SELECT b.blocked_id, u.nick FROM forum_blocks b LEFT JOIN forum_users u ON u.user_id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC").bind(v.uid).all();
  return r.results || [];
}

// ---------- картинки ----------

export async function checkUploadAllowed(db: any, v: Viewer, size: number) {
  needUser(v); needNotBanned(v);
  const s = await getSettings(db);
  await needAge(db, v, s);
  if (size > s.upload_max_mb * 1024 * 1024) fail(413, `Картинка больше ${s.upload_max_mb} МБ`);
  if (!isMod(v)) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM forum_media WHERE user_id = ? AND created_at > ?").bind(v.uid, now() - H).first();
    if ((n?.n || 0) >= s.uploads_per_hour) fail(429, `Лимит: ${s.uploads_per_hour} картинок в час`, "rate");
  }
  return s;
}
export async function recordUpload(db: any, v: Viewer, key: string, mime: string, size: number) {
  await db.prepare("INSERT INTO forum_media (key, user_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)").bind(key, v.uid, mime, size, now()).run();
}

// ---------- модераторы форума (назначает админ) ----------

export async function listModerators(db: any, v: Viewer) {
  needAdmin(v);
  const forum = (await db.prepare("SELECT m.user_id, m.section_id, m.granted_at, u.nick, s.title AS s_title, g.nick AS by_nick FROM forum_moderators m LEFT JOIN forum_users u ON u.user_id = m.user_id LEFT JOIN forum_sections s ON s.id = m.section_id LEFT JOIN forum_users g ON g.user_id = m.granted_by ORDER BY m.granted_at DESC").all()).results || [];
  const game = (await db.prepare("SELECT substr(r.pkey, 5) AS user_id, r.role, u.nick FROM player_roles r LEFT JOIN forum_users u ON u.user_id = substr(r.pkey, 5) WHERE r.pkey LIKE 'uid:%'").all()).results || [];
  return { forum, game };
}
export async function addModerator(db: any, v: Viewer, nickOrId: any, sectionId: any) {
  needAdmin(v);
  const q = String(nickOrId ?? "").trim();
  if (!q) fail(400, "Укажите ник участника");
  const u = await db.prepare("SELECT user_id, nick FROM forum_users WHERE nick_key = ? OR user_id = ?").bind(nickKey(q), q).first();
  if (!u) fail(404, "Участник не найден (он должен хотя бы раз зайти на форум)");
  const sid = Number(sectionId) | 0;
  if (sid) { const sec = await db.prepare("SELECT id FROM forum_sections WHERE id = ?").bind(sid).first(); if (!sec) fail(400, "Раздел не найден"); }
  await db.prepare("INSERT OR IGNORE INTO forum_moderators (user_id, section_id, granted_by, granted_at) VALUES (?, ?, ?, ?)").bind(u.user_id, sid, v.uid, now()).run();
  await log(db, v.uid!, "mod_add", "u", u.user_id, `${u.nick}${sid ? " · раздел #" + sid : " · весь форум"}`);
  return { ok: true };
}
export async function removeModerator(db: any, v: Viewer, uid: any, sectionId: any) {
  needAdmin(v);
  const sid = Number(sectionId) | 0;
  const r = await db.prepare("DELETE FROM forum_moderators WHERE user_id = ? AND section_id = ?").bind(String(uid), sid).run();
  if (!r.meta?.changes) fail(404, "Такого назначения нет");
  await log(db, v.uid!, "mod_remove", "u", String(uid), sid ? "раздел #" + sid : "весь форум");
  return { ok: true };
}
