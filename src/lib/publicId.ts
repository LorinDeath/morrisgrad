// Публичный номер игрока (pid) вместо внутреннего id Clerk — во всех адресах и ответах для других игроков:
// /u/<номер>, ссылки чата, форум (/forum/u/<номер>), /api/public-profile?pid=<номер>.
// Номер общий с форумом (forum_users.pid): один игрок — один номер на сайте и форуме.
// У игрока, который ещё не заходил на форум, профиль форума создаётся тихо (seen: false — не «в сети», ник с сайта).
import { ensureUser } from "./forum/service";

export const PID_RE = /^[1-9]\d{0,8}$/;
export const CLERK_ID_RE = /^user_[A-Za-z0-9]{8,64}$/;

export async function pidFor(db: any, uid: string): Promise<number | null> {
  if (!uid) return null;
  try {
    const r = await db.prepare("SELECT pid FROM forum_users WHERE user_id = ?").bind(uid).first();
    if (r?.pid != null) return Number(r.pid);
    const u = await ensureUser(db, uid, { seen: false });
    return u?.pid != null ? Number(u.pid) : null;
  } catch (e) { console.error("[pid]", (e as any)?.message || e); return null; }
}

/** Номера для списка id (чат). Недостающие профили создаются по одному (бывает один раз на игрока). */
export async function pidsFor(db: any, uids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(uids.filter((x) => typeof x === "string" && x))].slice(0, 200);
  if (!uniq.length) return out;
  try {
    const rows = (await db.prepare(`SELECT user_id, pid FROM forum_users WHERE user_id IN (${uniq.map(() => "?").join(",")})`).bind(...uniq).all()).results || [];
    for (const r of rows) if (r.pid != null) out.set(r.user_id, Number(r.pid));
  } catch { /* таблицы форума нет — ниже по одному */ }
  for (const uid of uniq) if (!out.has(uid)) { const p = await pidFor(db, uid); if (p != null) out.set(uid, p); }
  return out;
}

export async function uidForPid(db: any, pid: string | number): Promise<string | null> {
  if (!PID_RE.test(String(pid))) return null;
  try { const r = await db.prepare("SELECT user_id FROM forum_users WHERE pid = ?").bind(Number(pid)).first(); return r?.user_id || null; } catch { return null; }
}

/** Картинка по умолчанию без внутреннего id (сид — номер игрока). */
export const defaultAvatar = (pid: number | string | null) => `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=mg${encodeURIComponent(String(pid ?? "0"))}`;
