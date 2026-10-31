// G (t1209): /strat/admin/goals — «Партия Чёрных королей → Цели и лиги». Только админ: сессия Clerk (Authorization: Bearer) + роль
// player_roles (isStratAdmin, как у модерации карт и cfg_get/cfg_set). Без сессии — 401, без роли — 403, ошибка проверки — 400 с объяснением.
// GET — умолчания, правки, итог по лигам и журнал; PUT ?size=N {поле: число | null} — правка (null — убрать поле); DELETE ?size=N — сброс к умолчанию.
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";
import { STRAT_CFG } from "./rules";
import { isStratAdmin } from "./maps";
import { loadOverrides, dropOverrideCache, loadStratCfg } from "./cfg";
import { OV_FIELDS, OV_SIZES, ovKey, validateOverride, leagueValues } from "./cfg-override";
import { leagueOf } from "./rating";

export async function adminGoalsHttp(request: Request, env: any): Promise<Response> {
  const local = isLocalRequest(request), origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return new Response("forbidden", { status: 403 });
  const cors: Record<string, string> = { ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}), "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, PUT, DELETE", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" } });
  const J = (o: any, status = 200) => Response.json(o, { status, headers: cors });
  let uid = "";
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (m) { const chk = await verifyClerkTokenEx(m[1], env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local)); uid = chk.uid || ""; }
  else { const dev = new URL(request.url).searchParams.get("devUser"); if (dev && isDevRequest(env, request)) uid = dev.slice(0, 64); } // только локальные плейтесты
  if (!uid) return J({ err: "auth", msg: "нужен вход" }, 401);
  if (!(await isStratAdmin(env, uid, true))) return J({ err: "forbidden", msg: "только для администратора" }, 403);
  const db = env.GAME_DB; if (!db) return J({ err: "db" }, 500);
  const url = new URL(request.url), size = Number(url.searchParams.get("size"));
  try {
    if (request.method === "GET") {
      const rows = await loadOverrides(env, true), cfg = (await loadStratCfg(env, true)).cfg; // итог = правка правил + правки лиг
      const log = ((await db.prepare("SELECT key, before, after, by, at FROM strat_cfg_log ORDER BY id DESC LIMIT 50").all())?.results || []) as any[];
      return J({ fields: Object.fromEntries(Object.entries(OV_FIELDS).map(([k, f]) => [k, { name: f.name, min: f.min, max: f.max, int: !!f.int }])),
        leagues: OV_SIZES.map((n) => ({ size: n, league: leagueOf(n), def: leagueValues(STRAT_CFG, n), over: rows[ovKey(n)] || {}, cur: leagueValues(cfg, n) })),
        log: log.map((r) => ({ key: r.key, before: safe(r.before), after: safe(r.after), by: r.by, at: r.at })) });
    }
    if (request.method !== "PUT" && request.method !== "DELETE") return J({ err: "method" }, 405);
    if (!(OV_SIZES as readonly number[]).includes(size)) return J({ err: "bad_size", errors: [`size: можно только ${OV_SIZES.join(", ")}`] }, 400);
    const key = ovKey(size), prev: any = await db.prepare("SELECT json FROM strat_cfg_override WHERE key = ?").bind(key).first(), before = prev?.json ? safe(prev.json) || {} : {};
    let after: Record<string, number> | null = null;
    if (request.method === "PUT") {
      let body: any; try { body = await request.json(); } catch { return J({ err: "bad_json", errors: ["тело — JSON {поле: число}"] }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return J({ err: "bad_body", errors: ["тело — объект {поле: число}"] }, 400);
      const drop = Object.keys(body).filter((k) => body[k] === null), set = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null));
      const unknown = drop.filter((k) => !OV_FIELDS[k]); if (unknown.length) return J({ err: "invalid", errors: unknown.map((k) => `${k}: неизвестное поле`) }, 400);
      const v = Object.keys(set).length ? validateOverride(size, set) : ({ ok: true, val: {} } as const);
      if (!v.ok) return J({ err: "invalid", errors: v.errors }, 400);
      after = { ...before, ...v.val }; for (const k of drop) delete after[k];
      if (!Object.keys(after).length) after = null;
    }
    const now = Date.now();
    const st = after ? db.prepare("INSERT INTO strat_cfg_override (key, json, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind(key, JSON.stringify(after), now, uid)
      : db.prepare("DELETE FROM strat_cfg_override WHERE key = ?").bind(key);
    await db.batch([st, db.prepare("INSERT INTO strat_cfg_log (key, before, after, by, at) VALUES (?,?,?,?,?)").bind(key, JSON.stringify(before), after ? JSON.stringify(after) : null, uid, now)]);
    dropOverrideCache(); return J({ ok: true, size, over: after || {} });
  } catch { return J({ err: "db" }, 500); }
}
const safe = (s: any) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
