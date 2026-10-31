// F: GET /strat/codex — своя Библиотека. user_id ТОЛЬКО из проверенной сессии (Authorization: Bearer <Clerk JWT>);
// клиентскому user_id не верим. Без сессии — 401 и пустой список (+ счётчики групп для силуэтов, без id/имён закрытого).
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";
import { STRAT_CFG } from "./rules";
import { codexGroups, codexPick, CODEX_CATS } from "./codex";
import { loadStratCfg } from "./cfg";

export async function codexHttp(request: Request, env: any): Promise<Response> {
  const local = isLocalRequest(request), origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return new Response("forbidden", { status: 403 });
  const cors: Record<string, string> = { ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}), "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" } });
  if (request.method !== "GET") return new Response("method", { status: 405, headers: cors });
  const C = (await loadStratCfg(env)).cfg; // G: пороги целей/лиг — с правками админки
  const base = { cats: CODEX_CATS, groups: codexGroups(C) };
  let uid = "";
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (m) { const chk = await verifyClerkTokenEx(m[1], env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local)); uid = chk.uid || ""; }
  else { const dev = new URL(request.url).searchParams.get("devUser"); if (dev && isDevRequest(env, request)) uid = dev.slice(0, 64); } // только локальные плейтесты
  if (!uid) return Response.json({ err: "auth", auth: false, items: [], ...base }, { status: 401, headers: cors });
  let rows: any[] = [];
  try { rows = ((await env.GAME_DB?.prepare("SELECT kind, item_id, first_at FROM strat_codex WHERE user_id = ?").bind(uid).all())?.results) || []; } catch {}
  const at: Record<string, number> = {}; for (const r of rows) at[r.kind + ":" + r.item_id] = r.first_at;
  const items = codexPick(C, Object.keys(at)).map((e) => ({ ...e, at: at[e.k] }));
  return Response.json({ auth: true, items, ...base }, { headers: cors });
}
