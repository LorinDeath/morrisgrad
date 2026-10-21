// /api/get-user — данные ТЕКУЩЕГО игрока. Кто он — решает только проверенная сессия Clerk (middleware → locals.auth().userId),
// строка берётся из таблицы users по этому id. Любой id от клиента (?userId=, ?id=, тело) игнорируется.
// Без входа — 401. Чужие профили — /api/public-profile?id= (только публичные поля, profileFields.ts) и страница /u/<id>.
import { ownUser } from "./profileFields";
import { envOf } from '../cfEnv';

const NO_STORE = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: NO_STORE });

export function sessionUserId(locals: any): string | null {
  try { const a = locals?.auth?.(); return a && typeof a.userId === "string" && a.userId ? a.userId : null; } catch { return null; }
}
export function findDb(locals: any): any {
  const env = envOf(locals);
  // Только явная привязка D1: перебор env с проверкой .prepare ловил RPC-привязки (RL_*), у которых «есть» любое свойство
  return env.PROFILES_DB || env.morrisgrad_db || env.DB || null;
}

export async function currentUserResponse(locals: any): Promise<Response> {
  const uid = sessionUserId(locals);
  if (!uid) return json({ error: "unauthorized" }, 401);
  const db = findDb(locals);
  if (!db) return json({ error: "db unavailable" }, 503);
  try {
    const row: any = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(uid).first();
    // вошёл, но профиля на сайте ещё нет (создаётся на /profile) — это не ошибка: имя по умолчанию
    return json({ registered: !!row, username: row?.username || null, avatar: row?.avatar_url || null, user: row ? ownUser(row) : null });
  } catch (e) {
    console.error("[get-user]", (e as any)?.message || e);
    return json({ error: "lookup failed" }, 500);
  }
}
