// /api/public-profile?pid=<номер> — публичный профиль ЛЮБОГО игрока без входа: только поля из PUBLIC_* (profileFields.ts),
// с ограничением частоты (60/мин на IP) и коротким публичным кэшем. Страница /u/<номер> показывает то же самое.
// Ключ — только публичный номер игрока (общий с форумом); внутренний id Clerk не принимается и не отдаётся.
import { findDb } from "./currentUser";
import { publicUser, publicItem, rateLimited } from "./profileFields";
import { PID_RE, uidForPid } from "../publicId";

const H = (extra: Record<string, string> = {}) => ({ "Content-Type": "application/json; charset=utf-8", ...extra });
export async function publicProfileResponse(request: Request, locals: any): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (rateLimited(ip)) return new Response(JSON.stringify({ error: "too many requests" }), { status: 429, headers: H({ "Retry-After": "60" }) });
  const q = new URL(request.url).searchParams;
  const pid = q.get("pid") || q.get("id") || "";
  if (!PID_RE.test(pid)) return new Response(JSON.stringify({ error: "bad pid" }), { status: 400, headers: H() });
  const db = findDb(locals);
  if (!db) return new Response(JSON.stringify({ error: "db unavailable" }), { status: 503, headers: H() });
  try {
    const id = await uidForPid(db, pid);
    const row = id ? await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first() : null;
    if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: H({ "Cache-Control": "public, max-age=60" }) });
    let items: any[] = [];
    try { items = ((await db.prepare("SELECT * FROM user_items WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").bind(id).all())?.results || []).map(publicItem); } catch { /* таблицы предметов может не быть */ }
    return new Response(JSON.stringify({ user: { pid: Number(pid), ...publicUser(row) }, items }), { status: 200, headers: H({ "Cache-Control": "public, max-age=60" }) });
  } catch (e) {
    console.error("[public-profile]", (e as any)?.message || e);
    return new Response(JSON.stringify({ error: "lookup failed" }), { status: 500, headers: H() });
  }
}
