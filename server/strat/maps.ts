// Карты игроков «Партии Чёрных королей»: D1 strat_maps (миграция 0025). Публичный список — ТОЛЬКО одобренные админом
// (ручная модерация, без автопубликации). До одобрения автор может играть на карте по коду/ссылке — без опыта.
import { validateMap, isMapSize, spawnsOf, mw, mh, SPAWN_MAX, mapFits, mapModes, MODE_SEATS, type MapData } from "./terrain";
import { armyCells, ensureSize, makeMap, officialMaps, STRAT_CFG, SIZES, type StratCfg } from "./rules";
import { Roles } from "../meta/roles";
import { showcaseMap, showcaseAll, SHOWCASE_AUTHOR, SHOWCASE_NICK } from "./showcase";
import { leagueOf } from "./rating";
import { cleanChat, CHAT_CFG } from "./chat";

export type MapStatus = "pending" | "approved" | "rejected" | "hidden";
export type MapRow = { id: string; author: string; author_nick: string; name: string; size: number; w?: number | null; h?: number | null; t: string; s: string; status: MapStatus; flagged: number; reject_reason: string | null; created_at: number; reviewed_by: string | null; reviewed_at: number | null; descr?: string; mode?: string };
export const MAP_ID_RE = /^u[0-9a-f]{10}$/, SHOW_ID_RE = /^[sm]\d{2}$/; // s — витрина 1×1, m — витрина 2×2/«Все» (t1219)
/** Проверки карты игрока: армия встаёт у точек спавна (правила размера — от шаблона лиги). */
export function checkMap(m: MapData, cfg: StratCfg = STRAT_CFG) {
  const sc = ensureSize(cfg, m.size), a = armyCells(m.size, cfg); const v = validateMap(m, { armyRows: a.rows, armyCols: a.cells, army: sc.army });
  return v;
}
/** Строгие проверки при сохранении: ≥2 точек спавна (одна снизу, одна сверху), не больше 8. */
export function checkSave(m: MapData) { const v = checkMap(m), n = spawnsOf(m).length; if (n < 2) v.errors.push("spawns_few");
  if (m.mode && m.mode !== "1v1" && n !== MODE_SEATS[m.mode]) v.errors.push("spawns_count"); // t1219: объявленный режим = число точек
  if (n > SPAWN_MAX && !v.errors.includes("spawns_many")) v.errors.push("spawns_many"); return v; }
const showRow = (id: string): MapRow | null => { const m = showcaseMap(id); return m ? { id: m.id, author: SHOWCASE_AUTHOR, author_nick: SHOWCASE_NICK, name: m.name, size: m.size, t: m.t, s: m.s, status: "approved", flagged: 0, reject_reason: null, created_at: 0, reviewed_by: SHOWCASE_AUTHOR, reviewed_at: 0, descr: m.descr, mode: m.mode } : null; };
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
  if (SHOW_ID_RE.test(id)) return showRow(id); // витрина — в коде, всегда одобрена
  if (!MAP_ID_RE.test(id) || !env.GAME_DB) return null;
  try { return (await env.GAME_DB.prepare("SELECT * FROM strat_maps WHERE id = ?").bind(id).first()) || null; } catch { return null; }
}
/** t1247: w/h из строки (миграция 0041) — только если карта прямоугольная */
export const dimsOf = (r: { size: number; w?: number | null; h?: number | null }) => (r.w && r.h && (r.w !== r.size || r.h !== r.size) ? { w: +r.w, h: +r.h } : {});
export const rowToMap = (r: MapRow): MapData => ({ id: r.id, name: r.name, size: r.size, ...dimsOf(r), t: r.t, s: r.s, ...(r.mode && MODE_SEATS[r.mode] ? { mode: r.mode } : {}) });
/** режим карты из формы редактора: "" — по числу точек; иначе один из режимов */
const cleanMode = (x: unknown) => (typeof x === "string" && MODE_SEATS[x] ? x : "");

/** Сохранить новую карту (или правку своей): статус всегда pending — даже правка одобренной уходит на модерацию. */
export async function saveMap(env: any, who: { pkey: string; nick: string; verified: boolean }, b: any): Promise<{ id?: string; err?: string; warnings?: string[] }> {
  if (!who.verified) return { err: "login_required" };
  if (!env.GAME_DB) return { err: "no_db" };
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  const W = b?.w ?? b?.size, H = b?.h ?? b?.size; // t1247: ширина × высота (квадрат — только size)
  if (!isMapSize(W) || !isMapSize(H) || (b?.size != null && b.size !== Math.max(W, H))) return { err: "bad_size" };
  const size = Math.max(W, H), rect = W !== H;
  if (!NAME_RE.test(name)) return { err: "bad_name" };
  const descr = typeof b?.descr === "string" ? cleanChat(b.descr, { ...CHAT_CFG, max: 300 }) || "" : "";
  const mode = cleanMode(b?.mode);
  const m: MapData = { id: "u", name, size, ...(rect ? { w: W, h: H } : {}), t: String(b.t || ""), s: String(b.s || ""), ...(mode ? { mode } : {}) };
  const v = checkSave(m);
  if (v.errors.length) return { err: "invalid:" + v.errors.join(",") };
  const now = Date.now();
  if (b.id) {
    const r = await getMapRow(env, String(b.id)); if (!r || r.author !== who.pkey) return { err: "not_found" };
    if (r.status !== "approved") { // черновик/отклонённая/на рассмотрении — правится на месте и снова ждёт проверки
      await env.GAME_DB.prepare("UPDATE strat_maps SET name=?, size=?, t=?, s=?, descr=?, status='pending', reject_reason=NULL, updated_at=? WHERE id=?").bind(name, size, m.t, m.s, descr, now, r.id).run();
      await setMode(env, r.id, mode); if (!(await setDims(env, r.id, m)) && rect) return { err: "no_rect" };
      return { id: r.id, warnings: v.warnings };
    } // ТЗ §15: правка одобренной — новая версия на модерацию, старая остаётся в хабе
  }
  const cnt: any = await env.GAME_DB.prepare("SELECT COUNT(*) AS n FROM strat_maps WHERE author = ?").bind(who.pkey).first();
  if ((cnt?.n || 0) >= MAX_MAPS_PER_AUTHOR) return { err: "too_many" };
  const id = "u" + [...crypto.getRandomValues(new Uint8Array(5))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.GAME_DB.prepare("INSERT INTO strat_maps (id, author, author_nick, name, size, t, s, descr, status, flagged, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'pending',0,?,?)")
    .bind(id, who.pkey, who.nick.slice(0, 16), name, size, m.t, m.s, descr, now, now).run();
  await setMode(env, id, mode);
  if (!(await setDims(env, id, m)) && rect) { await env.GAME_DB.prepare("DELETE FROM strat_maps WHERE id=? AND author=?").bind(id, who.pkey).run(); return { err: "no_rect" }; } // до миграции 0041 прямоугольную не храним
  return { id, warnings: v.warnings };
}
/** t1247: ширина/высота — миграция 0041; квадрат — NULL. false — колонок ещё нет. */
async function setDims(env: any, id: string, m: MapData) { const r = m.w && m.h && m.w !== m.h; try { await env.GAME_DB.prepare("UPDATE strat_maps SET w=?, h=? WHERE id=?").bind(r ? m.w : null, r ? m.h : null, id).run(); return true; } catch { return false; } }
/** колонка mode — миграция 0035; до неё режим выводится из числа точек (тихо пропускаем) */
async function setMode(env: any, id: string, mode: string) { try { await env.GAME_DB.prepare("UPDATE strat_maps SET mode=? WHERE id=?").bind(mode, id).run(); } catch {} }

/** Список для лобби: официальные + одобренные (публично) + свои (с бейджем статуса). */
export async function listMaps(env: any, pkey: string | null, size: number, mode = "1v1") {
  // t1219: лобби предлагает только карты, подходящие режиму (официальные и «Случайная» — без точек старта — только 1×1)
  const fit = (r: any) => mapFits({ id: r.id, name: r.name, size: r.size, t: "", s: r.s, ...(r.mode && MODE_SEATS[r.mode] ? { mode: r.mode } : {}) } as MapData, mode);
  const duel = mode === "1v1";
  const off = [...(duel ? officialMaps(size).map((o) => ({ ...o, kind: "official", status: "official" })) : []), ...showcaseAll().filter((m) => m.size === size && mapFits(m, mode)).map((m) => ({ id: m.id, name: m.name, author: SHOWCASE_NICK, kind: "user", status: "approved" }))];
  let pub: any[] = [], mine: any[] = [];
  if (env.GAME_DB) try {
    const sel = async (q: string, ...a: any[]) => { for (const M of [", mode, w, h", ", mode"]) try { return ((await env.GAME_DB.prepare(q.replace("{M}", M)).bind(...a).all()).results || []) as any[]; } catch {} return ((await env.GAME_DB.prepare(q.replace("{M}", "")).bind(...a).all()).results || []) as any[]; }; // w/h — 0041, mode — 0035
    pub = (await sel("SELECT id, name, author_nick, size, s{M} FROM strat_maps WHERE status='approved' AND size=? ORDER BY reviewed_at DESC LIMIT 50", size)).filter(fit).map((r: any) => ({ id: r.id, name: r.name, author: r.author_nick, kind: "user", status: "approved", ...dimsOf(r) }));
    if (pkey && !pkey.startsWith("guest:")) mine = (await sel("SELECT id, name, status, reject_reason, size, s{M} FROM strat_maps WHERE author=? AND size=? AND status!='hidden' ORDER BY updated_at DESC", pkey, size)).filter(fit).map((r: any) => ({ id: r.id, name: r.name, kind: "mine", ...dimsOf(r), status: r.status, reason: r.reject_reason || undefined }));
  } catch {}
  return [...off, ...(duel ? [{ id: "rnd", name: "Случайная", kind: "random", status: "official" }] : []), ...pub, ...mine.filter((m) => !pub.some((p) => p.id === m.id))];
}

/**
 * Карта для лобби. Официальные/случайная/одобренные — все, опыт есть. Неодобренная (pending/rejected) — только если
 * хост лобби — её автор (или игра по его коду/ссылке): опыт выключен на сервере. Скрытая — никому.
 */
export async function resolveLobbyMap(env: any, id: string, size: number, hostPkey: string, hostAdmin = false, mode = "1v1"): Promise<{ map?: MapData; xp: boolean; status: string; err?: string }> {
  const r0 = await resolveLobbyMap0(env, id, size, hostPkey, hostAdmin);
  if (r0.map && !mapFits(r0.map, mode)) return { xp: false, status: "", err: "map_mode" }; // t1219: карта не под этот режим
  return r0;
}
async function resolveLobbyMap0(env: any, id: string, size: number, hostPkey: string, hostAdmin: boolean): Promise<{ map?: MapData; xp: boolean; status: string; err?: string }> {
  if (id === "rnd") { const seed = 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000); return { map: makeMap(size, "rnd:" + seed), xp: true, status: "official" }; }
  if (officialMaps(size).some((o) => o.id === id) || id === "open") return { map: makeMap(size, id), xp: true, status: "official" };
  const r = await getMapRow(env, id);
  if (!r) return { xp: false, status: "", err: "map_not_found" };
  if (size && r.size !== size) return { xp: false, status: "", err: "map_size" }; // size=0 — карта задаёт размер сама
  if (r.status === "approved") return { map: rowToMap(r), xp: true, status: "approved" };
  if (r.status === "hidden") return { xp: false, status: "", err: "map_hidden" };
  if (r.author !== hostPkey && !hostAdmin) return { xp: false, status: "", err: "map_not_approved" };
  return { map: rowToMap(r), xp: false, status: r.status }; // тест автора / «Проверить в игре» у админа: без опыта и рейтинга для ВСЕХ мест
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
  const rated = new Set<string>(); try { for (const x of ((await env.GAME_DB.prepare("SELECT map_id FROM strat_rated_maps").all()).results || []) as any[]) rated.add(x.map_id); } catch {}
  let comments: any[] = []; try { comments = ((await env.GAME_DB.prepare("SELECT id, map_id, nick, text, at, reports FROM strat_map_comments WHERE reports>0 AND hidden=0 ORDER BY reports DESC LIMIT 50").all()).results || []) as any[]; } catch {}
  return { list: (r.results || []).map((m: any) => ({ ...m, rated: rated.has(m.id), checks: checkMap({ id: m.id, name: m.name, size: m.size, ...dimsOf(m), t: m.t, s: m.s }) })), comments };
}
/** Одобренные карты для админки (переключатель «Рейтинговая»). */
export async function modApproved(env: any) {
  const rated = new Set<string>(); try { for (const x of ((await env.GAME_DB.prepare("SELECT map_id FROM strat_rated_maps").all()).results || []) as any[]) rated.add(x.map_id); } catch {}
  let rows: any[] = []; try { rows = ((await env.GAME_DB.prepare("SELECT id, author_nick, name, size, t, s, status FROM strat_maps WHERE status='approved' ORDER BY reviewed_at DESC LIMIT 100").all()).results || []) as any[]; } catch {}
  return [...showcaseAll().map((m) => ({ id: m.id, author_nick: SHOWCASE_NICK, name: m.name, size: m.size, status: "approved" })), ...rows.map(({ t, s, ...x }) => x)].map((x: any) => ({ ...x, rated: rated.has(x.id), league: leagueOf(x.size) }));
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

// ---------- хаб карт (миграция 0034): лайки, избранное, комментарии, счётчик партий
/** Миниатюра: до 48×48 выборкой клеток (полную карту 100×100 грузим только при открытии). */
export function thumb(m: { size: number; w?: number | null; h?: number | null; t: string; s: string }, max = 48) {
  const W = mw(m as any), H = mh(m as any), dim = W !== H ? { pw: W, ph: H } : {}; // t1247: прямоугольная — pw×ph (pn — большая сторона)
  if (m.size <= max) return { pn: m.size, ...dim, pt: m.t, ps: m.s };
  const k = m.size / max, tw = Math.max(1, Math.round(W / k)), th = Math.max(1, Math.round(H / k)); let t = "", s = "";
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const i = Math.min(H - 1, Math.floor(y * k)) * W + Math.min(W - 1, Math.floor(x * k)); t += m.t[i]; s += m.s[i] === "." ? "." : m.s[i]; }
  return { pn: max, ...(W !== H ? { pw: tw, ph: th } : {}), pt: t, ps: s };
}
const LG: Record<string, [number, number]> = { quick: [4, 9], normal: [10, 35], tactic: [36, 100] }; // фильтр хаба — как просил Алекс (t1217); лига рейтинга — rating.leagueOf
export type HubQ = { sort?: string; league?: string; size?: number; q?: string; tab?: string; mode?: string; shape?: string };
export async function hubList(env: any, pkey: string | null, o: HubQ) {
  const me = pkey && !pkey.startsWith("guest:") ? pkey : null;
  let rows: any[] = [];
  try { rows = ((await env.GAME_DB.prepare("SELECT id, author, author_nick, name, size, w, h, t, s, descr, mode, reviewed_at, created_at, status FROM strat_maps WHERE status='approved' OR (author=? AND status!='hidden') ORDER BY reviewed_at DESC LIMIT 300").bind(me || "-").all()).results || []) as any[]; } catch {} // t1247: w/h — миграция 0041
  if (!rows.length) try { rows = ((await env.GAME_DB.prepare("SELECT id, author, author_nick, name, size, t, s, descr, mode, reviewed_at, created_at, status FROM strat_maps WHERE status='approved' OR (author=? AND status!='hidden') ORDER BY reviewed_at DESC LIMIT 300").bind(me || "-").all()).results || []) as any[]; }
  catch { try { rows = ((await env.GAME_DB.prepare("SELECT id, author, author_nick, name, size, t, s, descr, reviewed_at, created_at, status FROM strat_maps WHERE status='approved' OR (author=? AND status!='hidden') ORDER BY reviewed_at DESC LIMIT 300").bind(me || "-").all()).results || []) as any[]; } catch {} }
  if (!rows.length) try { rows = ((await env.GAME_DB.prepare("SELECT id, author, author_nick, name, size, t, s, reviewed_at, created_at, status FROM strat_maps WHERE status='approved' OR (author=? AND status!='hidden') ORDER BY reviewed_at DESC LIMIT 300").bind(me || "-").all()).results || []) as any[]; } catch {}
  const all = [...showcaseAll().map((m) => ({ id: m.id, author: SHOWCASE_AUTHOR, author_nick: SHOWCASE_NICK, name: m.name, size: m.size, t: m.t, s: m.s, descr: m.descr, mode: m.mode, reviewed_at: 0, created_at: 0, status: "approved", showcase: true })), ...rows];
  const st = new Map<string, any>(), liked = new Set<string>(), faved = new Set<string>(), rated = new Set<string>();
  try { for (const x of ((await env.GAME_DB.prepare("SELECT * FROM strat_map_stats").all()).results || []) as any[]) st.set(x.map_id, x); } catch {}
  try { for (const x of ((await env.GAME_DB.prepare("SELECT map_id FROM strat_rated_maps").all()).results || []) as any[]) rated.add(x.map_id); } catch {}
  if (me) { try { for (const x of ((await env.GAME_DB.prepare("SELECT map_id FROM strat_map_likes WHERE pkey=?").bind(me).all()).results || []) as any[]) liked.add(x.map_id); } catch {}
    try { for (const x of ((await env.GAME_DB.prepare("SELECT map_id FROM strat_map_favs WHERE pkey=?").bind(me).all()).results || []) as any[]) faved.add(x.map_id); } catch {} }
  let list = all.map((r) => { const z = st.get(r.id) || {}; return { id: r.id, name: r.name, author: r.author_nick, size: r.size, ...dimsOf(r), descr: r.descr || "", status: r.status, mine: !!me && r.author === me, showcase: !!r.showcase,
    plays: z.plays || 0, likes: z.likes || 0, favs: z.favs || 0, comments: z.comments || 0, liked: liked.has(r.id), faved: faved.has(r.id), rated: rated.has(r.id), league: leagueOf(r.size), modes: mapModes({ ...r, t: r.t || "", ...(r.mode && MODE_SEATS[r.mode] ? { mode: r.mode } : { mode: undefined }) } as MapData), at: r.reviewed_at || r.created_at || 0, ...thumb(r) }; });
  const tab = o.tab || "all";
  if (tab === "mine") list = list.filter((x) => x.mine); else list = list.filter((x) => x.status === "approved"); // чужие — только одобренные Алексом
  if (tab === "fav") list = list.filter((x) => x.faved);
  if (o.league && LG[o.league]) { const [a, b] = LG[o.league]; list = list.filter((x) => x.size >= a && x.size <= b); }
  if (isMapSize(o.size)) list = list.filter((x) => x.size === o.size);
  if (o.shape === "rect") list = list.filter((x: any) => x.w && x.w !== x.h); else if (o.shape === "square") list = list.filter((x: any) => !x.w || x.w === x.h); // t1247: форма поля
  if (o.mode && MODE_SEATS[o.mode]) list = list.filter((x) => x.modes.includes(o.mode!) || (o.mode === "1v1" && !x.modes.length));
  const q = String(o.q || "").trim().toLowerCase().slice(0, 40); if (q) list = list.filter((x) => x.name.toLowerCase().includes(q) || String(x.author || "").toLowerCase().includes(q));
  const sort = o.sort || "plays";
  list.sort(sort === "likes" ? (a, b) => b.likes - a.likes || b.plays - a.plays : sort === "new" ? (a, b) => b.at - a.at : (a, b) => b.plays - a.plays || b.likes - a.likes);
  return list.slice(0, 80);
}
async function bump(env: any, id: string, col: "plays" | "likes" | "favs" | "comments", d: number) {
  await env.GAME_DB.prepare(`INSERT INTO strat_map_stats (map_id, ${col}, updated_at) VALUES (?, ?, ?) ON CONFLICT(map_id) DO UPDATE SET ${col} = MAX(0, ${col} + ?), updated_at = excluded.updated_at`).bind(id, Math.max(0, d), Date.now(), d).run();
}
const pub = async (env: any, id: string) => { const r = await getMapRow(env, id); return r && r.status === "approved" ? r : null; };
/** Лайк: 1 на аккаунт, гостю нельзя, можно снять; только после сыгранной на карте партии (ТЗ §15). */
export async function likeMap(env: any, who: { pkey: string; verified: boolean }, id: string, on: boolean) {
  if (!who.verified) return { err: "login_required" };
  const r = await pub(env, id); if (!r) return { err: "not_found" };
  if (on) { const played: any = await env.GAME_DB.prepare("SELECT 1 AS x FROM strat_player_stats WHERE user_id=? AND map_id=? LIMIT 1").bind(who.pkey, id).first().catch(() => null);
    if (!played && r.author !== who.pkey) return { err: "play_first" };
    const x = await env.GAME_DB.prepare("INSERT OR IGNORE INTO strat_map_likes (map_id, pkey, at) VALUES (?,?,?)").bind(id, who.pkey, Date.now()).run(); if (x.meta?.changes) await bump(env, id, "likes", 1); }
  else { const x = await env.GAME_DB.prepare("DELETE FROM strat_map_likes WHERE map_id=? AND pkey=?").bind(id, who.pkey).run(); if (x.meta?.changes) await bump(env, id, "likes", -1); }
  return { ok: true, on };
}
export async function favMap(env: any, who: { pkey: string; verified: boolean }, id: string, on: boolean) {
  if (!who.verified) return { err: "login_required" };
  if (!(await pub(env, id))) return { err: "not_found" };
  if (on) { const x = await env.GAME_DB.prepare("INSERT OR IGNORE INTO strat_map_favs (map_id, pkey, at) VALUES (?,?,?)").bind(id, who.pkey, Date.now()).run(); if (x.meta?.changes) await bump(env, id, "favs", 1); }
  else { const x = await env.GAME_DB.prepare("DELETE FROM strat_map_favs WHERE map_id=? AND pkey=?").bind(id, who.pkey).run(); if (x.meta?.changes) await bump(env, id, "favs", -1); }
  return { ok: true, on };
}
export const COMMENT_MAX = 500, COMMENT_GAP_MS = 20_000;
/** Текст комментария: фильтр мата форума (как в чате), ≤500, только текст, ссылки вырезаны. */
export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = cleanChat(raw.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[ссылка]"), { ...CHAT_CFG, max: COMMENT_MAX }); return t;
}
export async function listComments(env: any, id: string, admin = false) {
  try { return ((await env.GAME_DB.prepare(`SELECT id, nick, text, at, reports${admin ? ", pkey" : ""} FROM strat_map_comments WHERE map_id=? AND hidden=0 ORDER BY at DESC LIMIT 100`).bind(id).all()).results || []) as any[]; } catch { return []; }
}
export async function addComment(env: any, who: { pkey: string; nick: string; verified: boolean }, id: string, raw: unknown) {
  if (!who.verified) return { err: "login_required" };
  if (!(await pub(env, id))) return { err: "not_found" };
  const text = cleanComment(raw); if (!text) return { err: "empty" };
  const ban: any = await env.GAME_DB.prepare("SELECT 1 AS x FROM strat_map_comment_bans WHERE pkey=?").bind(who.pkey).first(); if (ban) return { err: "banned" };
  const last: any = await env.GAME_DB.prepare("SELECT MAX(at) AS at FROM strat_map_comments WHERE pkey=?").bind(who.pkey).first(); const now = Date.now();
  if (last?.at && now - last.at < COMMENT_GAP_MS) return { err: "rate" };
  await env.GAME_DB.prepare("INSERT INTO strat_map_comments (map_id, pkey, nick, text, at) VALUES (?,?,?,?,?)").bind(id, who.pkey, who.nick.slice(0, 16), text, now).run();
  await bump(env, id, "comments", 1); return { ok: true };
}
export async function reportComment(env: any, who: { pkey: string; verified: boolean }, cid: number) {
  if (!who.verified) return { err: "login_required" };
  const x = await env.GAME_DB.prepare("INSERT OR IGNORE INTO strat_map_comment_reports (comment_id, pkey, at) VALUES (?,?,?)").bind(cid | 0, who.pkey, Date.now()).run();
  if (x.meta?.changes) await env.GAME_DB.prepare("UPDATE strat_map_comments SET reports = reports + 1 WHERE id=?").bind(cid | 0).run();
  return { ok: true }; // жалоба только ставит в очередь админа
}
/** Админ: скрыть комментарий / запретить автору комментарии. */
export async function modComment(env: any, admin: string, cid: number, act: string) {
  const c: any = await env.GAME_DB.prepare("SELECT id, map_id, pkey, hidden FROM strat_map_comments WHERE id=?").bind(cid | 0).first(); if (!c) return { err: "not_found" };
  if (act === "del" || act === "ban") { if (!c.hidden) { await env.GAME_DB.prepare("UPDATE strat_map_comments SET hidden=1 WHERE id=?").bind(c.id).run(); await bump(env, c.map_id, "comments", -1); } }
  if (act === "ban") await env.GAME_DB.prepare("INSERT OR REPLACE INTO strat_map_comment_bans (pkey, by_pkey, at) VALUES (?,?,?)").bind(c.pkey, admin, Date.now()).run();
  if (act === "keep") await env.GAME_DB.prepare("UPDATE strat_map_comments SET reports=0 WHERE id=?").bind(c.id).run();
  if (!["del", "ban", "keep"].includes(act)) return { err: "bad_act" };
  return { ok: true };
}
/** Сыгранная партия: только завершённая, с опытом (одобренная карта, не тест), автор карты в ней не играл. */
export async function countPlay(env: any, mapId: string | undefined, seatPkeys: string[]) {
  if (!mapId || !(MAP_ID_RE.test(mapId) || SHOW_ID_RE.test(mapId)) || !env.GAME_DB) return false;
  const r = await getMapRow(env, mapId); if (!r || r.status !== "approved" || seatPkeys.includes(r.author)) return false;
  try { await bump(env, mapId, "plays", 1); return true; } catch { return false; }
}
