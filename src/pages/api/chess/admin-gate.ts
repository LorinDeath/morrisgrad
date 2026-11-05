// Same-origin gate для /games/chess-combat-admin.
// Clerk-сессия Astro + PROFILES_DB; на localhost — ?devUser= Lorin seed.
import type { APIRoute } from "astro";
import { decideChessAdminGate, LORIN_UID, LORIN_NAME } from "../../../../server/chess/admin-gate";
import { envOf } from "../../../lib/cfEnv";
import { sessionUserId } from "../../../lib/api/currentUser";

export const prerender = false;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const host = (request.headers.get("host") || "").split(":")[0];
  const isLocal = LOCAL_HOST.test(host);
  const hdrs = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };

  let uid = sessionUserId(locals) || "";
  const qDev = url.searchParams.get("devUser") || "";
  // localhost: любой ?devUser=… имитирует Clerk uid (для плейтеста allow/deny по id).
  // На проде sessionUserId — единственный источник; query игнорируется.
  if (!uid && isLocal && qDev) uid = qDev.slice(0, 64);

  if (!uid) {
    return Response.json({ ok: false, err: "auth", msg: "Нужен вход на сайт." }, { status: 401, headers: hdrs });
  }

  const env = envOf(locals) || {};
  const db = env.GAME_DB || env.PROFILES_DB || env.morrisgrad_db || null;

  // astro dev без D1-биндингов: пускаем только точный Lorin seed на localhost.
  if (!db) {
    if (!(isLocal && uid === LORIN_UID)) {
      return Response.json(
        { ok: false, err: "forbidden", msg: "Админка «Боевые шахматы» — только для Lorin Death (по id аккаунта, не по нику)." },
        { status: 403, headers: hdrs },
      );
    }
    return Response.json({ ok: true, uid, who: LORIN_NAME }, { headers: hdrs });
  }

  // nick из query намеренно не читаем — доступ только по Clerk uid.
  const g = await decideChessAdminGate({
    env: { ...env, GAME_DB: db, PROFILES_DB: db },
    uid,
  });
  // Локальный seed без роли в пустой D1: если DB есть, но роли нет — всё равно пустить seed на localhost.
  if (!g.ok && isLocal && uid === LORIN_UID) {
    return Response.json({ ok: true, uid, who: LORIN_NAME }, { headers: hdrs });
  }
  if (!g.ok) {
    return Response.json({ ok: false, err: g.err, msg: g.msg }, { status: g.status, headers: hdrs });
  }
  return Response.json({ ok: true, uid: g.uid, who: g.who }, { headers: hdrs });
};
