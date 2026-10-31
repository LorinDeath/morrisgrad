// t1156: хранение повторов в D1 (миграция 0031) и «Библиотека партий». Без cloudflare:workers — тестируется в node.
import { view, inCheck, type GameState, type Ev, type StratCfg } from "./rules";
import { goalDetails, bldMaxHp } from "./econ";
import { treeView } from "./tree-view";
import { mergeCfg } from "./cfg";
import { decodeLog, encodeLog, rulesVer, moveList, FrameCache, redactX, type RLog } from "./replay";

export type ReplayMeta = { id: string; size: number; nicks: [string, string]; races: [string, string]; winner: number; reason: string | null; turns: number; acts: number; rated: boolean; mapId: string | null; startedAt: number; endedAt: number; title?: string; saved?: boolean };
const RCFG = (cfg: StratCfg) => ({ on: true, keepDays: 90, recent: 50, saveMax: 100, rollMs: 30000, maxBytes: 900000, ...((cfg.econ as any).replay || {}) });
export const replayCfg = RCFG;

export type ReplayRow = { log: RLog; status: "live" | "over"; uids: [string, string]; nicks: [string, string]; winner: number; reason: string | null; turns: number; rated: boolean; mapId: string | null };
/** Записать/обновить повтор (живой — по ходу партии, over — в конце). Лог больше maxBytes не пишется (вернёт "too_big"). */
export async function putReplay(db: any, r: ReplayRow, cfg: StratCfg): Promise<string> {
  if (!db) return "no_db"; const s = encodeLog(r.log); if (s.length > RCFG(cfg).maxBytes) return "too_big";
  await db.prepare("INSERT OR REPLACE INTO strat_replays (id, status, log, size, p0, p1, nick0, nick1, race0, race1, winner, reason, turns, acts, rated, map_id, rv, started_at, ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(r.log.id, r.status, s, r.log.size, r.uids[0], r.uids[1], r.nicks[0], r.nicks[1], r.log.races[0], r.log.races[1], r.winner, r.reason, r.turns, r.log.acts.length, r.rated ? 1 : 0, r.mapId, r.log.rv, r.log.t0, r.status === "over" ? Date.now() : 0).run();
  return "";
}
/** Хранение: законченные партии старше keepDays удаляются, если их никто не сохранил; «живые» брошенные (DO умер) — тоже через keepDays. */
export async function pruneReplays(db: any, cfg: StratCfg, now = Date.now()) {
  if (!db) return; const cut = now - RCFG(cfg).keepDays * 86400_000;
  await db.prepare("DELETE FROM strat_replays WHERE id IN (SELECT id FROM strat_replays WHERE ((status = 'over' AND ended_at < ?) OR (status = 'live' AND started_at < ?)) AND id NOT IN (SELECT replay_id FROM strat_replay_saves) LIMIT 200)").bind(cut, cut).run();
}
const META_COLS = "id, size, nick0, nick1, race0, race1, winner, reason, turns, acts, rated, map_id, started_at, ended_at";
const meta = (r: any): ReplayMeta => ({ id: r.id, size: r.size, nicks: [r.nick0 || "", r.nick1 || ""], races: [r.race0, r.race1], winner: r.winner, reason: r.reason, turns: r.turns, acts: r.acts, rated: !!r.rated, mapId: r.map_id || null, startedAt: r.started_at, endedAt: r.ended_at, ...(r.title !== undefined ? { title: r.title, saved: true } : {}) });
/** «Библиотека партий»: recent — последние законченные партии игрока (до recent штук, не старше keepDays); saved — его закладки. */
export async function libList(db: any, uid: string, cfg: StratCfg) {
  const C = RCFG(cfg), cut = Date.now() - C.keepDays * 86400_000;
  const rec = await db.prepare(`SELECT ${META_COLS} FROM strat_replays WHERE status = 'over' AND (p0 = ? OR p1 = ?) AND ended_at >= ? ORDER BY ended_at DESC LIMIT ?`).bind(uid, uid, cut, C.recent).all();
  const sav = await db.prepare(`SELECT ${META_COLS.split(", ").map((c) => "r." + c).join(", ")}, s.title FROM strat_replay_saves s JOIN strat_replays r ON r.id = s.replay_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ?`).bind(uid, C.saveMax).all();
  const savedIds = new Set((sav.results || []).map((r: any) => r.id));
  return { recent: (rec.results || []).map((r: any) => ({ ...meta(r), saved: savedIds.has(r.id) })), saved: (sav.results || []).map(meta), keepDays: C.keepDays, saveMax: C.saveMax };
}
export const cleanTitle = (t: any) => String(t ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
/** Сохранить партию в избранное. Можно сохранить любую законченную партию (свою или чужую, по ссылке). */
export async function libSave(db: any, uid: string, id: string, title: any, cfg: StratCfg): Promise<string> {
  const r: any = await db.prepare("SELECT status FROM strat_replays WHERE id = ?").bind(id).first(); if (!r) return "no_replay"; if (r.status !== "over") return "live";
  const n: any = await db.prepare("SELECT COUNT(*) AS n FROM strat_replay_saves WHERE user_id = ?").bind(uid).first();
  const had: any = await db.prepare("SELECT 1 AS x FROM strat_replay_saves WHERE user_id = ? AND replay_id = ?").bind(uid, id).first();
  if (!had && (n?.n || 0) >= RCFG(cfg).saveMax) return "lib_full";
  await db.prepare("INSERT INTO strat_replay_saves (user_id, replay_id, title, created_at) VALUES (?,?,?,?) ON CONFLICT(user_id, replay_id) DO UPDATE SET title = excluded.title").bind(uid, id, cleanTitle(title), Date.now()).run();
  return "";
}
/** t1163: переименовать сохранённую партию (только свою и уже сохранённую; пустое название — без названия) */
export async function libRename(db: any, uid: string, id: string, title: any): Promise<string> {
  const had: any = await db.prepare("SELECT 1 AS x FROM strat_replay_saves WHERE user_id = ? AND replay_id = ?").bind(uid, id).first(); if (!had) return "not_saved";
  await db.prepare("UPDATE strat_replay_saves SET title = ? WHERE user_id = ? AND replay_id = ?").bind(cleanTitle(title), uid, id).run(); return "";
}
export async function libUnsave(db: any, uid: string, id: string) { await db.prepare("DELETE FROM strat_replay_saves WHERE user_id = ? AND replay_id = ?").bind(uid, id).run(); }
export const REPLAY_ID_RE = /^[A-HJ-NP-Z2-9]{6}:\d{10,15}$/;

/** Кадр законченной партии: всё раскрыто (оба дерева, территории, точные HP, полный разбор ударов). */
export function revealFrame(g: GameState, ev: Ev[], cfg: StratCfg, terr?: (g: GameState, s: 0 | 1, C: StratCfg) => any) {
  const out: any = { g: view(g, true, cfg), ev, check: [inCheck(g, 0), inCheck(g, 1)], trees: [treeView(g, 0, cfg), treeView(g, 1, cfg)] };
  if (g.ec) { out.goals = [goalDetails(g, 0, cfg), goalDetails(g, 1, cfg)]; out.towers = (g.ec.towers || []).map((t: any) => ({ ...t }));
    out.bhp = g.ec.cities.map((c) => ({ city: c.id, b: c.bld.map((b) => ({ b, hp: c.bhp?.[b] ?? bldMaxHp(g, c, b, cfg), max: bldMaxHp(g, c, b, cfg) })), ruin: c.ruin || [] }));
    if (terr) out.terrs = [terr(g, 0, cfg), terr(g, 1, cfg)]; }
  return out;
}

/** HTTP повторов (только законченные партии): GET /strat/replay?id=…            → { meta, log, moves, rulesChanged }
 *                                              GET /strat/replay?id=…&i=N        → { i, n, frame }
 *                                              GET /strat/replay?id=…&from=A&to=B → { frames: [{ i, frame }] } (≤ 40, для автопроигрывания) */
export class ReplayServer {
  cache = new Map<string, { fc: FrameCache; log: RLog; meta: ReplayMeta; changed: boolean; at: number }>();
  constructor(public terr?: (g: GameState, s: 0 | 1, C: StratCfg) => any) {}
  async get(db: any, id: string) {
    const c = this.cache.get(id); if (c) { c.at = Date.now(); return c; }
    const r: any = await db.prepare(`SELECT ${META_COLS}, status, log FROM strat_replays WHERE id = ?`).bind(id).first(); if (!r || r.status !== "over") return null;
    const log = decodeLog(r.log); if (!log) return null; const cfg = mergeCfg(log.patch || {});
    const e = { fc: new FrameCache(log, cfg), log, meta: meta(r), changed: rulesVer(cfg) !== log.rv, at: Date.now() };
    this.cache.set(id, e); if (this.cache.size > 8) { const old = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]; this.cache.delete(old[0]); }
    return e;
  }
  async http(db: any, url: URL): Promise<{ status: number; body: any }> {
    const id = url.searchParams.get("id") || ""; if (!REPLAY_ID_RE.test(id)) return { status: 400, body: { err: "bad_id" } };
    if (!db) return { status: 503, body: { err: "no_db" } };
    const e = await this.get(db, id); if (!e) return { status: 404, body: { err: "no_replay" } };
    const fr = (i: number) => { const f = e.fc.at(i); return { i, diverged: f.diverged, frame: revealFrame(f.g, redactX(f.ev, -1, true), e.fc.cfg, this.terr) }; };
    const n = e.log.acts.length, I = url.searchParams.get("i"), A = url.searchParams.get("from");
    if (I !== null) return { status: 200, body: { n, ...fr(Math.max(0, Math.min(n, +I | 0))) } };
    if (A !== null) { const a = Math.max(0, Math.min(n, +A | 0)), b = Math.max(a, Math.min(n, +(url.searchParams.get("to") ?? a) | 0, a + 39)); const frames = []; for (let i = a; i <= b; i++) frames.push(fr(i)); return { status: 200, body: { n, frames } }; }
    const { acts, h, map, ...head } = e.log;
    return { status: 200, body: { meta: e.meta, log: { ...head, n, map }, moves: moveList(e.log, -1, false), rulesChanged: e.changed } };
  }
}
