// GET /chess/me — мой рейтинг (только проверенная сессия Clerk; devUser — только локальный стенд). GET /chess/top — топ пула.
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";
import { getChessRating, chessTop } from "./rating-db";

export async function chessHttp(request: Request, env: any, path: string): Promise<Response> {
  const local = isLocalRequest(request), origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return new Response("forbidden", { status: 403 });
  const cors: Record<string, string> = { ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" } });
  if (request.method !== "GET") return new Response("method", { status: 405, headers: cors });
  try {
    if (path === "/chess/top") return Response.json({ top: await chessTop(env) }, { headers: cors });
    let uid = "";
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
    if (m) { const chk = await verifyClerkTokenEx(m[1], env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local)); uid = chk.uid || ""; }
    else { const dev = new URL(request.url).searchParams.get("devUser"); if (dev && isDevRequest(env, request)) uid = dev.slice(0, 64); }
    if (!uid) return Response.json({ auth: false }, { status: 401, headers: cors });
    return Response.json({ auth: true, rating: await getChessRating(env, uid) }, { headers: cors });
  } catch (e: any) {
    return Response.json({ err: "db" }, { status: 503, headers: cors });
  }
}
