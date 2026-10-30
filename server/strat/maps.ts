// Карты игроков «Партии Чёрных королей»: D1 strat_maps (миграция 0025). Публичный список — ТОЛЬКО одобренные админом
// (ручная модерация, без автопубликации). До одобрения автор может играть на карте по коду/ссылке — без опыта.
import { validateMap, type MapData } from "./terrain";
import { armyCells, makeMap, officialMaps, SIZES } from "./rules";
import { Roles } from "../meta/roles";

export type MapStatus = "pending" | "approved" | "rejected" | "hidden";
export type MapRow = { id: string; author: string; author_nick: string; name: string; size: number; t: string; s: string; status: MapStatus; flagged: number; reject_reason: string | null; created_at: number; reviewed_by: string | null; reviewed_at: number | null };
export const MAP_ID_RE = /^u[0-9a-f]{10}$/;
const NAME_RE = /^[\p{L}\p{N} _\-«»".,!?]{2,32}$/u;
export const MAX_MAPS_PER_AUTHOR = 20;

let roles: Roles | null = null;
/** Админ сайта (player_roles, pkey "uid:<clerk id>"), только проверенный вход. */
export async function isStratAdmin(env: any, pkey: string, verified: boolean): Promise<boolean> {
  if (!verified || !env.GAME_DB || pkey.startsWith("guest:")) return false;
  roles = roles || new Roles(env.GAME_DB); await roles.ensure();
  return roles.isAdmin({ pkey: "uid:" + pkey, verified });
}

export async function getMapRow(env: any, id: string): Promise<MapRow | null> {
  if (!MAP_ID_RE.test(id) || !env.GAME_DB) return null;
  try { return (await env.GAME_DB.prepare("SELECT * FROM strat_maps WHERE id = ?").bind(id).first()) || null; } catch { return null; }
}
export const rowToMap = (r: MapRow): MapData => ({ id: r.id, name: r.name, size: r.size, t: r.t, s: r.s });

/** Сохранить новую карту (или правку своей): статус всегда pending — даже правка одобренной уходит на модерацию. */
export async function saveMap(env: any, who: { pkey: string; nick: string; verified: boolean }, b: any): Promise<{ id?: string; err?: string; warnings?: string[] }> {
  if (!who.verified) return { err: "login_required" };
  if (!env.GAME_DB) return { err: "no_db" };
  const size = b?.size, name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!SIZES.includes(size)) return { err: "bad_size" };
  if (!NAME_RE.test(name)) return { err: "bad_name" };
  const m: MapData = { id: "", name, size, t: String(b.t || ""), s: String(b.s || "") };
  const a = armyCells(size); const v = validateMap(m, { armyRows: a.rows, armyCols: a.cells });
  if (v.errors.length) return { err: "invalid:" + v.errors.join(",") };
  const now = Date.now();
  if (b.id) {
    const r = await getMapRow(env, String(b.id)); if (!r || r.author !== who.pkey) return { err: "not_found" };
    await env.GAME_DB.prepare("UPDATE strat_maps SET name=?, size=?, t=?, s=?, status='pending', reject_reason=NULL, updated_at=? WHERE id=?").bind(name, size, m.t, m.s, now, r.id).run();
    return { id: r.id, warnings: v.warnings };
  }
  const cnt: any = await env.GAME_DB.prepare("SELECT COUNT(*) AS n FROM strat_maps WHERE author = ?").bind(who.pkey).first();
  if ((cnt?.n || 0) >= MAX_MAPS_PER_AUTHOR) return { err: "too_many" };
  const id = "u" + [...crypto.getRandomValues(new Uint8Array(5))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.GAME_DB.prepare("INSERT INTO strat_maps (id, author, author_nick, name, size, t, s, status, flagged, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'pending',0,?,?)")
    .bind(id, who.pkey, who.nick.slice(0, 16), name, size, m.t, m.s, now, now).run();
  return { id, warnings: v.warnings };
}

/** Список для лобби: официальные + одобренные (публично) + свои (с бейджем статуса). */
export async function listMaps(env: any, pkey: string | null, size: number) {
  const off = officialMaps(size).map((o) => ({ ...o, kind: "official", status: "official" }));
  let pub: any[] = [], mine: any[] = [];
  if (env.GAME_DB) try {
    pub = ((await env.GAME_DB.prepare("SELECT id, name, author_nick FROM strat_maps WHERE status='approved' AND size=? ORDER BY reviewed_at DESC LIMIT 50").bind(size).all()).results || []).map((r: any) => ({ id: r.id, name: r.name, author: r.author_nick, kind: "user", status: "approved" }));
    if (pkey && !pkey.startsWith("guest:")) mine = ((await env.GAME_DB.prepare("SELECT id, name, status, reject_reason FROM strat_maps WHERE author=? AND size=? AND status!='hidden' ORDER BY updated_at DESC").bind(pkey, size).all()).results || []).map((r: any) => ({ id: r.id, name: r.name, kind: "mine", status: r.status, reason: r.reject_reason || undefined }));
  } catch {}
  return [...off, { id: "rnd", name: "Случайная", kind: "random", status: "official" }, ...pub, ...mine.filter((m) => !pub.some((p) => p.id === m.id))];
}

/**
 * Карта для лобби. Официальные/случайная/одобренные — все, опыт есть. Неодобренная (pending/rejected) — только если
 * хост лобби — её автор (или игра по его коду/ссылке): опыт выключен на сервере. Скрытая — никому.
 */
export async function resolveLobbyMap(env: any, id: string, size: number, hostPkey: string): Promise<{ map?: MapData; xp: boolean; status: string; err?: string }> {
  if (id === "rnd") { const seed = 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000); return { map: makeMap(size, "rnd:" + seed), xp: true, status: "official" }; }
  if (officialMaps(size).some((o) => o.id === id) || id === "open") return { map: makeMap(size, id), xp: true, status: "official" };
  const r = await getMapRow(env, id);
  if (!r) return { xp: false, status: "", err: "map_not_found" };
  if (r.size !== size) return { xp: false, status: "", err: "map_size" };
  if (r.status === "approved") return { map: rowToMap(r), xp: true, status: "approved" };
  if (r.status === "hidden") return { xp: false, status: "", err: "map_hidden" };
  if (r.author !== hostPkey) return { xp: false, status: "", err: "map_not_approved" };
  return { map: rowToMap(r), xp: false, status: r.status }; // тест автора: «карта не проверена — без опыта»
}

export async function flagMap(env: any, who: { pkey: string; verified: boolean }, id: string, why: string) {
  if (!who.verified) return { err: "login_required" };
  const r = await getMapRow(env, id); if (!r || r.status !== "approved") return { err: "not_found" };
  await env.GAME_DB.prepare("UPDATE strat_maps SET flagged = flagged + 1, flag_note = ? WHERE id = ?").bind(String(why || "").slice(0, 200), id).run();
  return { ok: true }; // жалоба только помечает карту на проверку — сама ничего не снимает
}

// ---------- админка: очередь модерации
export async function modQueue(env: any) {
  const r = await env.GAME_DB.prepare("SELECT id, author, author_nick, name, size, t, s, status, flagged, flag_note, reject_reason, created_at, updated_at FROM strat_maps WHERE status='pending' OR flagged>0 ORDER BY (status='pending') DESC, updated_at ASC LIMIT 100").all();
  return (r.results || []).map((m: any) => { const a = armyCells(m.size); const v = validateMap({ id: m.id, name: m.name, size: m.size, t: m.t, s: m.s }, { armyRows: a.rows, armyCols: a.cells }); return { ...m, checks: v }; });
}
export async function moderate(env: any, admin: string, id: string, act: string, reason?: string) {
  const r = await getMapRow(env, id); if (!r) return { err: "not_found" };
  const st = act === "approve" ? "approved" : act === "reject" ? "rejected" : act === "hide" ? "hidden" : act === "clear_flag" ? r.status : "";
  if (!st) return { err: "bad_act" };
  if (act === "reject" && !String(reason || "").trim()) return { err: "reason_required" };
  await env.GAME_DB.prepare("UPDATE strat_maps SET status=?, flagged=0, reject_reason=?, reviewed_by=?, reviewed_at=? WHERE id=?")
    .bind(st, act === "reject" ? String(reason).slice(0, 200) : null, admin, Date.now(), id).run();
  return { ok: true, status: st };
}
