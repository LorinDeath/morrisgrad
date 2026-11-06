// Админка «Орды»: тот же Clerk uid, что у «Боевых шахмат» (LORIN_UID).
// Ник и тело запроса uid не подменяют. Запись — проверенный JSON набора, без SQL из полей.
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";
import { decideChessAdminGate, LORIN_UID } from "../chess/admin-gate";
import { DEFAULT_TUNE, cleanNote, validateTune, type OrdaTune } from "../../src/scripts/musou/tune";

export type TuneRow = { rev: number; tune: OrdaTune; note: string; actor: string; at: number };

export interface TuneRepo {
  current(): Promise<TuneRow | null>;
  history(limit: number): Promise<TuneRow[]>;
  commit(tune: OrdaTune, actor: string, note: string, base: number): Promise<{ rev: number } | { err: "conflict"; rev: number }>;
}

const SELECT_ONE = "SELECT rev, data, note, actor, created_at FROM orda_tune WHERE id = 1";
const SELECT_HIST = "SELECT rev, data, note, actor, created_at FROM orda_tune_rev ORDER BY rev DESC LIMIT ?";
const INSERT_REV = "INSERT INTO orda_tune_rev (rev, data, note, actor, created_at) VALUES (?, ?, ?, ?, ?)";
const UPSERT = "INSERT INTO orda_tune (id, rev, data, note, actor, created_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, data = excluded.data, note = excluded.note, actor = excluded.actor, created_at = excluded.created_at";

function rowOf(r: any): TuneRow | null {
  if (!r) return null;
  const checked = validateTune(safeJson(r.data));
  if (!checked.ok) return null;
  return { rev: Number(r.rev) || 0, tune: checked.tune, note: String(r.note || ""), actor: String(r.actor || ""), at: Number(r.created_at) || 0 };
}

function safeJson(s: unknown) {
  try { return JSON.parse(String(s || "")); } catch { return null; }
}

export function d1TuneRepo(db: any): TuneRepo {
  return {
    async current() {
      const r = await db.prepare(SELECT_ONE).bind().first();
      return rowOf(r);
    },
    async history(limit: number) {
      const r = await db.prepare(SELECT_HIST).bind(Math.max(1, Math.min(20, limit | 0))).all();
      const rows = Array.isArray(r?.results) ? r.results : [];
      return rows.map(rowOf).filter((x: TuneRow | null): x is TuneRow => !!x);
    },
    async commit(tune, actor, note, base) {
      const cur = await this.current();
      const revNow = cur?.rev || 0;
      if ((base | 0) !== revNow) return { err: "conflict", rev: revNow };
      const rev = revNow + 1;
      const data = JSON.stringify(tune);
      const at = Date.now();
      await db.prepare(INSERT_REV).bind(rev, data, note, actor, at).run();
      await db.prepare(UPSERT).bind(rev, data, note, actor, at).run();
      return { rev };
    },
  };
}

async function published(env: any, repo?: TuneRepo | null): Promise<TuneRow> {
  const store = repo || (env?.GAME_DB ? d1TuneRepo(env.GAME_DB) : null);
  if (!store) return { rev: 0, tune: DEFAULT_TUNE, note: "", actor: "", at: 0 };
  try {
    const cur = await store.current();
    return cur || { rev: 0, tune: DEFAULT_TUNE, note: "", actor: "", at: 0 };
  } catch {
    return { rev: 0, tune: DEFAULT_TUNE, note: "", actor: "", at: 0 };
  }
}

export async function readPublishedTune(env: any): Promise<OrdaTune> {
  return (await published(env)).tune;
}

async function uidOf(request: Request, env: any): Promise<string> {
  const local = isLocalRequest(request);
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (m) {
    const chk = await verifyClerkTokenEx(m[1]!, env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local));
    return chk.uid || "";
  }
  const dev = new URL(request.url).searchParams.get("devUser");
  if (dev && isDevRequest(env, request)) return dev.slice(0, 64);
  return "";
}

export async function musouAdminHttp(request: Request, env: any, repo?: TuneRepo | null): Promise<Response> {
  const local = isLocalRequest(request);
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return new Response("forbidden", { status: 403 });
  const cors: Record<string, string> = {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Cache-Control": "no-store",
  };
  const path = new URL(request.url).pathname;
  const methods = path === "/musou/tune" ? "GET, OPTIONS" : "GET, POST, OPTIONS";
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": methods,
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Max-Age": "600",
      },
    });
  }
  const J = (o: unknown, status = 200) => Response.json(o, { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

  if (path === "/musou/tune") {
    if (request.method !== "GET") return J({ err: "method" }, 405);
    const row = await published(env, repo);
    return J({ rev: row.rev, tune: row.tune });
  }

  if (request.method !== "GET" && request.method !== "POST") return J({ err: "method" }, 405);
  const uid = await uidOf(request, env);
  const gate = await decideChessAdminGate({ env, uid });
  if (!gate.ok) return J({ ok: false, err: gate.err, msg: "Админка «Орды» — только для Lorin Death (Clerk uid, не ник)." }, gate.status);

  const store = repo || (env?.GAME_DB ? d1TuneRepo(env.GAME_DB) : null);
  if (!store) return J({ err: "no_db", msg: "Локальная D1 не подключена. Запись не выполнена." }, 503);

  if (request.method === "GET") {
    const cur = await store.current();
    const history = await store.history(8);
    return J({ ok: true, uid: gate.uid, who: gate.who, rev: cur?.rev || 0, tune: cur?.tune || DEFAULT_TUNE, history });
  }

  const ctype = request.headers.get("content-type") || "";
  if (!ctype.toLowerCase().includes("application/json")) return J({ err: "type", msg: "Нужен application/json" }, 415);
  const text = await request.text();
  if (text.length > 80_000) return J({ err: "size" }, 413);
  let body: any;
  try { body = JSON.parse(text); } catch { return J({ err: "json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return J({ err: "json" }, 400);

  if (path === "/musou/admin/rollback") {
    const want = body.rev | 0;
    const history = await store.history(20);
    const prev = history.find((h) => h.rev === want);
    if (!prev) return J({ err: "rev", msg: "Такой версии нет" }, 404);
    const cur = await store.current();
    const saved = await store.commit(prev.tune, LORIN_UID, cleanNote(`откат к ${want}`), cur?.rev || 0);
    if ("err" in saved) return J({ err: "conflict", rev: saved.rev }, 409);
    return J({ ok: true, rev: saved.rev, tune: prev.tune });
  }

  if (path !== "/musou/admin/tune") return J({ err: "path" }, 404);
  const checked = validateTune(body.tune);
  if (!checked.ok) return J({ err: "range", msg: checked.err }, 400);
  const cur = await store.current();
  const saved = await store.commit(checked.tune, LORIN_UID, cleanNote(body.note), body.base | 0);
  if ("err" in saved) return J({ err: "conflict", rev: saved.rev, msg: "Набор уже изменён. Обновите страницу." }, 409);
  return J({ ok: true, rev: saved.rev, tune: checked.tune });
}
