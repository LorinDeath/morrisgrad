// Gate админки «Боевые шахматы»: только Lorin Death по Clerk user id.
// Ник «Lorin Death» / смена display name доступа не даёт. Клиент: /games/chess-combat-admin.
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";

/** Сид-админ из server/migrations/0008_roles.sql — единственный ключ доступа. */
export const LORIN_UID = "user_38QeREOr606p1c96P4f14YFsLp7";
/** Только для подписи в UI; НЕ используется в решении gate. */
export const LORIN_NAME = "Lorin Death";

export type GateOk = { ok: true; uid: string; who: string };
export type GateFail = { ok: false; status: number; err: string; msg: string };

/**
 * Доступ строго по Clerk uid === LORIN_UID.
 * Display name / nickHint игнорируются — нельзя войти, поставив ник «Lorin Death».
 * localSeedOnly — localhost без D1 (плейтесты).
 */
export async function decideChessAdminGate(opts: {
  env: any;
  uid: string;
  nickHint?: string; // игнорируется
  localSeedOnly?: boolean;
}): Promise<GateOk | GateFail> {
  const uid = String(opts.uid || "").slice(0, 64);
  if (!uid) return { ok: false, status: 401, err: "auth", msg: "Нужен вход на сайт." };
  if (uid !== LORIN_UID) {
    return {
      ok: false,
      status: 403,
      err: "forbidden",
      msg: "Админка «Боевые шахматы» — только для Lorin Death (по id аккаунта, не по нику).",
    };
  }
  return { ok: true, uid, who: LORIN_NAME };
}

/** HTTP handler для worker `/chess/admin/gate` (и OPTIONS). */
export async function chessAdminGateHttp(request: Request, env: any): Promise<Response> {
  const local = isLocalRequest(request);
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return new Response("forbidden", { status: 403 });
  const cors: Record<string, string> = {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Cache-Control": "no-store",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Max-Age": "600",
      },
    });
  }
  const J = (o: any, status = 200) => Response.json(o, { status, headers: cors });
  if (request.method !== "GET") return J({ err: "method" }, 405);

  let uid = "";
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (m) {
    const chk = await verifyClerkTokenEx(m[1]!, env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local));
    uid = chk.uid || "";
  } else {
    const dev = new URL(request.url).searchParams.get("devUser");
    if (dev && isDevRequest(env, request)) uid = dev.slice(0, 64);
  }
  const g = await decideChessAdminGate({ env, uid });
  if (!g.ok) return J({ ok: false, err: g.err, msg: g.msg }, g.status);
  return J({ ok: true, uid: g.uid, who: g.who });
}
