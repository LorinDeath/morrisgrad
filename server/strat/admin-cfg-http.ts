// t1243: /strat/admin/cfg — полная админка правил «Партии Чёрных королей» (страница /games/strategy-admin).
// Доступ — только админ сайта (сессия Clerk + player_roles, как «Цели и лиги»); devUser — только на локальном стенде (isDevRequest).
// GET — схема, умолчания, правки, итог, журнал, версии. POST {op:"check"} — проверка и разница без сохранения.
// POST {op:"save", set:{путь: значение|null}, base, note} — сохранить (null — вернуть по умолчанию); base — номер версии, с которой
// начата правка: если кто-то успел сохранить раньше — 409. POST {op:"undo", log} — откатить одну запись журнала;
// {op:"restore", rev} — вернуть все правила к версии; {op:"reset", sec?} — сбросить раздел или всё.
// Каждое сохранение = новая версия (strat_cfg_rev, полный снимок) + строки журнала (кто, когда, было → стало).
// Идущие партии и повторы не меняются: партия берёт снимок правил при старте (match.ts, L.cfg/L.cfgPatch → повтор).
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";
import { STRAT_CFG } from "./rules";
import { isStratAdmin } from "./maps";
import { loadOverrides, dropOverrideCache, mergeCfg, pathRows, PATH_KEY } from "./cfg";
import { overridePatch, mergePatch } from "./cfg-override";
import { schema, SECTIONS, checkValue, pathsPatch, flatten, invariants, resolve, getAt, type FieldErr } from "./cfg-schema";

const MAX_SET = 3000, MAX_BODY = 400_000;
export type AdminAuth = { uid: string } | { res: Response };

/** Общая проверка доступа админ-эндпоинтов стратегии. */
export async function stratAdminAuth(request: Request, env: any, methods: string): Promise<{ uid: string; J: (o: any, s?: number) => Response } | { res: Response }> {
  const local = isLocalRequest(request), origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return { res: new Response("forbidden", { status: 403 }) };
  const cors: Record<string, string> = { ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}), "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return { res: new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": methods, "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" } }) };
  const J = (o: any, status = 200) => Response.json(o, { status, headers: cors });
  let uid = "";
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (m) { const chk = await verifyClerkTokenEx(m[1]!, env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local)); uid = chk.uid || ""; }
  else { const dev = new URL(request.url).searchParams.get("devUser"); if (dev && isDevRequest(env, request)) uid = dev.slice(0, 64); } // только локальные плейтесты
  if (!uid) return { res: J({ err: "auth", msg: "Нужен вход на сайт." }, 401) };
  if (!(await isStratAdmin(env, uid, true))) return { res: J({ err: "forbidden", msg: "Раздел только для администратора сайта." }, 403) };
  return { uid, J };
}

const safe = (s: any) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const clean = (v: any) => (typeof v === "string" ? v.trim() : v);

/** Текущее состояние слоёв правок. */
async function state(env: any) {
  const rows = await loadOverrides(env, true);
  let legacy: any = {};
  try { const r: any = await env.GAME_DB.prepare("SELECT data FROM game_overrides WHERE kind = 'strat_rules' AND id = 'main'").first(); if (r?.data) legacy = JSON.parse(r.data) || {}; } catch {}
  const league = overridePatch(rows), leagueKeys = Object.keys(rows).filter((k) => k.startsWith("league:"));
  const over = pathRows(rows); // {путь: значение}
  let rev = 0; try { const r: any = await env.GAME_DB.prepare("SELECT MAX(rev) AS rev FROM strat_cfg_rev").first(); rev = Number(r?.rev) || 0; } catch {}
  return { rows, legacy, league, leagueKeys, over, rev };
}
/** Итоговый конфиг для набора правок «путь → значение» поверх старых слоёв. */
function effective(legacy: any, league: any, over: Record<string, any>) { return mergeCfg(mergePatch(mergePatch(legacy, league), pathsPatch(over))); }

/** Проверить набор изменений. Возвращает новую карту правок, разницу и ошибки (по-русски). */
export function checkSet(st: { legacy: any; league: any; over: Record<string, any> }, set: Record<string, any>) {
  const S = schema(), errors: FieldErr[] = [], next: Record<string, any> = { ...st.over };
  if (!set || typeof set !== "object" || Array.isArray(set)) return { errors: [{ p: "", msg: "изменения — объект {поле: значение}" }], next, diff: [] as any[] };
  const before = effective(st.legacy, st.league, st.over), under = mergeCfg(st.legacy); // under — что будет без правки (код + старая правка)
  for (const [p, raw] of Object.entries(set)) {
    const f = S.byPath.get(p);
    if (raw === null) { if (!f && !(p in next)) errors.push({ p, msg: `поля «${p}» нет в правилах` }); delete next[p]; continue; }
    const v = clean(raw), e = checkValue(f, v, p); if (e) { errors.push({ p, msg: (f ? `${f.g} · ${f.l}: ` : "") + e }); continue; }
    if (same(v, getAt(under, resolve(STRAT_CFG, p)!))) delete next[p]; else next[p] = v; // значение = умолчанию → правки нет
  }
  const after = effective(st.legacy, st.league, next);
  if (!errors.length) for (const e of invariants(after)) errors.push(e);
  const diff: { p: string; sec: string; g: string; l: string; before: any; after: any; def: any; reset: boolean }[] = [];
  for (const p of new Set([...Object.keys(st.over), ...Object.keys(next), ...Object.keys(set)])) {
    const k = resolve(STRAT_CFG, p), f = S.byPath.get(p); if (!k || !f) continue;
    const b = getAt(before, k), a = getAt(after, k);
    if (!same(b, a) || st.over[p] !== next[p]) diff.push({ p, sec: f.sec, g: f.g, l: f.l, before: b, after: a, def: f.def, reset: !(p in next) && p in st.over });
  }
  return { errors, next, diff: diff.filter((d) => !same(d.before, d.after) || d.reset) };
}

/** Записать новую версию: строки правок, журнал, снимок — одним пакетом. */
async function commit(env: any, st: Awaited<ReturnType<typeof state>>, next: Record<string, any>, uid: string, who: string, note: string, base: number) {
  const db = env.GAME_DB, now = Date.now(), rev = st.rev + 1, stmts: any[] = [];
  const ch: [string, any, any][] = [];
  for (const p of new Set([...Object.keys(st.over), ...Object.keys(next)])) if (!same(st.over[p], next[p])) ch.push([p, p in st.over ? st.over[p] : null, p in next ? next[p] : null]);
  // «Цели и лиги» (league:N) переносятся в полную админку при первом сохранении, чтобы был один слой правок
  for (const k of st.leagueKeys) stmts.push(db.prepare("DELETE FROM strat_cfg_override WHERE key = ?").bind(k), db.prepare("INSERT INTO strat_cfg_log (key, before, after, by, at, rev) VALUES (?,?,?,?,?,?)").bind(k, JSON.stringify(st.rows[k]), null, uid, now, rev));
  if (!ch.length && !st.leagueKeys.length) return { rev: st.rev, n: 0 };
  for (const [p, b, a] of ch) {
    stmts.push(a === null ? db.prepare("DELETE FROM strat_cfg_override WHERE key = ?").bind(PATH_KEY + p)
      : db.prepare("INSERT INTO strat_cfg_override (key, json, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind(PATH_KEY + p, JSON.stringify({ v: a }), now, uid));
    stmts.push(db.prepare("INSERT INTO strat_cfg_log (key, before, after, by, at, rev) VALUES (?,?,?,?,?,?)").bind(PATH_KEY + p, b === null ? null : JSON.stringify(b), a === null ? null : JSON.stringify(a), uid, now, rev));
  }
  // PRIMARY KEY rev: если кто-то сохранил одновременно — пакет целиком откатится (конфликт версий)
  stmts.unshift(db.prepare("INSERT INTO strat_cfg_rev (rev, at, by, who, note, n, json) VALUES (?,?,?,?,?,?,?)").bind(rev, now, uid, who || null, note || null, ch.length, JSON.stringify(next)));
  if (base !== st.rev) throw Object.assign(new Error("conflict"), { conflict: true });
  await db.batch(stmts);
  dropOverrideCache(); return { rev, n: ch.length };
}

export async function adminCfgHttp(request: Request, env: any): Promise<Response> {
  const a = await stratAdminAuth(request, env, "GET, POST"); if ("res" in a) return a.res;
  const { uid, J } = a, db = env.GAME_DB; if (!db) return J({ err: "db", msg: "База недоступна." }, 500);
  try {
    if (request.method === "GET") {
      const st = await state(env), S = schema(), cur = effective(st.legacy, st.league, st.over);
      const log = ((await db.prepare("SELECT id, key, before, after, by, at, rev FROM strat_cfg_log ORDER BY id DESC LIMIT 300").all().catch(() => db.prepare("SELECT id, key, before, after, by, at FROM strat_cfg_log ORDER BY id DESC LIMIT 300").all()))?.results || []) as any[];
      const revs = ((await db.prepare("SELECT rev, at, by, who, note, n FROM strat_cfg_rev ORDER BY rev DESC LIMIT 100").all().catch(() => null))?.results || []) as any[];
      const legacyFlat = flatten(mergePatch(st.legacy, st.league));
      const stale = Object.keys(st.over).filter((p) => !S.byPath.has(p)); // путь пропал из кода — правка не действует
      return J({ me: uid, rev: st.rev, sections: SECTIONS,
        fields: S.fields.map((f) => ({ ...f, cur: getAt(cur, resolve(STRAT_CFG, f.p)!) })),
        over: st.over, legacy: legacyFlat, stale,
        log: log.map((r) => ({ id: r.id, key: r.key, before: safe(r.before), after: safe(r.after), by: r.by, at: r.at, rev: r.rev ?? null })), revs });
    }
    if (request.method !== "POST") return J({ err: "method" }, 405);
    const txt = await request.text(); if (txt.length > MAX_BODY) return J({ err: "too_big", msg: "Слишком большой запрос." }, 413);
    const body = safe(txt); if (!body || typeof body !== "object") return J({ err: "bad_json", msg: "Тело запроса — JSON." }, 400);
    const st = await state(env), S = schema();
    const note = typeof body.note === "string" ? body.note.trim().replace(/[\u0000-\u001f<>]/g, "").slice(0, 200) : "";
    const who = typeof body.who === "string" ? body.who.trim().replace(/[\u0000-\u001f<>]/g, "").slice(0, 40) : "";
    let set: Record<string, any> = {};
    if (body.op === "check" || body.op === "save") set = body.set;
    else if (body.op === "undo") {
      const r: any = await db.prepare("SELECT key, before FROM strat_cfg_log WHERE id = ?").bind(Number(body.log) || 0).first();
      if (!r) return J({ err: "not_found", msg: "Запись журнала не найдена." }, 404);
      if (!String(r.key).startsWith(PATH_KEY)) return J({ err: "legacy", msg: "Это запись старого раздела «Цели и лиги» — её откат недоступен; поправьте поле вручную." }, 400);
      set = { [String(r.key).slice(PATH_KEY.length)]: safe(r.before) };
    } else if (body.op === "restore") {
      const r: any = await db.prepare("SELECT json FROM strat_cfg_rev WHERE rev = ?").bind(Number(body.rev) || 0).first().catch(() => null);
      const snap = Number(body.rev) === 0 ? {} : r ? safe(r.json) : null; if (!snap) return J({ err: "not_found", msg: "Версия не найдена." }, 404);
      for (const p of new Set([...Object.keys(st.over), ...Object.keys(snap)])) if (S.byPath.has(p) || p in st.over) set[p] = p in snap && S.byPath.has(p) ? snap[p] : null; // поля, которых больше нет в коде, пропускаются
    } else if (body.op === "reset") {
      const sec = typeof body.sec === "string" ? body.sec : "";
      if (sec && !SECTIONS.some((s) => s.id === sec)) return J({ err: "bad_sec", msg: "Нет такого раздела." }, 400);
      for (const p of Object.keys(st.over)) if (!sec || S.byPath.get(p)?.sec === sec) set[p] = null;
      if (!sec) for (const p of Object.keys(flatten(st.league))) set[p] = null; // и правки старого раздела «Цели и лиги»
    } else return J({ err: "bad_op", msg: "Неизвестное действие." }, 400);
    if (!set || typeof set !== "object" || Array.isArray(set) || Object.keys(set).length > MAX_SET) return J({ err: "bad_set", msg: "Изменения — объект {поле: значение}, не больше 3000 полей." }, 400);
    // старые «Цели и лиги» переносим в карту правок (чтобы их можно было видеть и откатывать как обычные поля)
    const base = { ...st, over: { ...flatten(st.league), ...st.over } };
    const r = checkSet(base, set);
    if (r.errors.length) return J({ err: "invalid", msg: "Есть ошибки — ничего не сохранено.", errors: r.errors, diff: r.diff }, 400);
    if (body.op === "check" || body.dry === true) return J({ ok: true, diff: r.diff, rev: st.rev }); // dry: разница для откатов/версий/сброса без записи
    const baseRev = body.base !== undefined ? Number(body.base) : body.op === "save" ? NaN : st.rev; // откаты/сброс тоже сверяют версию, если её прислали (предпросмотр устарел → 409)
    if (!Number.isFinite(baseRev)) return J({ err: "bad_base", msg: "Не указана версия, с которой начата правка." }, 400);
    const autoNote = note || (body.op === "undo" ? `откат записи журнала №${Number(body.log)}` : body.op === "restore" ? `возврат к версии ${Number(body.rev)}` : body.op === "reset" ? (body.sec ? `сброс раздела «${SECTIONS.find((s) => s.id === body.sec)!.name}»` : "сброс всех правил к умолчанию") : "");
    try { const c = await commit(env, { ...st, over: st.over }, r.next, uid, who, autoNote, baseRev); return J({ ok: true, rev: c.rev, n: c.n, diff: r.diff }); }
    catch (e: any) { if (e?.conflict || /constraint|UNIQUE/i.test(String(e?.message))) return J({ err: "conflict", msg: "Пока вы правили, правила сохранил кто-то ещё. Обновите страницу — ваши черновики останутся." }, 409); throw e; }
  } catch (e) { return J({ err: "db", msg: "Ошибка базы — ничего не сохранено." }, 500); }
}
