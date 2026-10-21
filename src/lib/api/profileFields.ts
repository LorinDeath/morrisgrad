// Какие поля профиля видят другие, а какие — только владелец. Источник истины для /api/public-profile, /api/get-user, /api/profile.
// ПУБЛИЧНЫЕ — всё, что уже показывает другим публичный профиль /u/<id> (src/pages/u/[id].astro) и чат (ник/аватар → /u/<id>):
// номер игрока pid (адрес /u/<номер>, общий с форумом; внутренний id Clerk наружу не отдаётся), ник, аватар, описание, «Адский огонь», даты регистрации и
// последнего визита, последние 10 предметов. Форум (/forum/u/<номер>) и игра (осмотр игрока по WebSocket) берут свои данные сами.
// ЛИЧНЫЕ — только владельцу по проверенной сессии: отметки времени смены ника/аватара (кулдауны) и всё, чего нет в списке публичных.
// Почта, токены, роли/права в таблице users не хранятся и не отдаются ни одним из этих адресов.
export const PUBLIC_USER_FIELDS = ["username", "description", "avatar_url", "hellfire", "created_at", "last_seen"] as const;
export const PRIVATE_USER_FIELDS = ["last_username_update", "last_avatar_update"] as const;
export const PUBLIC_ITEM_FIELDS = ["uuid", "item_id", "name", "description", "source", "type", "rarity", "icon", "stats", "set_id", "set_stats", "is_corrupted", "created_at"] as const;

const pick = (row: any, keys: readonly string[]) => { const o: Record<string, unknown> = {}; if (row) for (const k of keys) if (k in row) o[k] = row[k]; return o; };
const parse = (v: unknown) => { if (typeof v !== "string") return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };
export const publicUser = (row: any) => pick(row, PUBLIC_USER_FIELDS);
export const ownUser = (row: any) => pick(row, ["id", ...PUBLIC_USER_FIELDS, ...PRIVATE_USER_FIELDS]); // владельцу — и свой id
export const publicItem = (row: any) => { const o: any = pick(row, PUBLIC_ITEM_FIELDS); if ("stats" in o) o.stats = parse(o.stats); if ("set_stats" in o) o.set_stats = parse(o.set_stats); if ("is_corrupted" in o) o.is_corrupted = !!o.is_corrupted; return o; };

// Ограничение частоты для публичного чтения (на изолят воркера; от перебора/скрейпа, не точный счётчик): N запросов в минуту на IP
const hits = new Map<string, { t: number; n: number }>();
export function rateLimited(ip: string, perMin = 60, now = Date.now()): boolean {
  const k = ip || "?"; const e = hits.get(k);
  if (!e || now - e.t > 60_000) { hits.set(k, { t: now, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  e.n++; return e.n > perMin;
}
