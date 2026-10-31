// StratIndex — маленький общий DO (один экземпляр): реестр кодов лобби, публичные лобби, кто онлайн на странице игры,
// пересылка приглашений. Партий здесь нет — только справочные данные, нагрузка мала.
import { cleanFav } from "./racedraw";
import { ReplayServer, libList, libSave, libUnsave, libRename, REPLAY_ID_RE } from "./replay-db";
import { terrView } from "./match";
import { DurableObject } from "cloudflare:workers";
import { admitMessage, originAllowed, isLocalRequest, MSG_BURST } from "../limits";
import { identify } from "./ident";
import { CODE_ALPHABET, CODE_RE } from "./match";
import { SIZES, STRAT_CFG } from "./rules";
import { loadStratCfg, saveStratPatch } from "./cfg";
import { saveMap, listMaps, flagMap, modQueue, moderate, isStratAdmin, getMapRow, rowToMap } from "./maps";
import { getRatings, getProfile, leaderboard, myPlace, poolSet } from "./rating-db";
import { getPublicStats, getPrivateStats, privView } from "./stats";
import { getCoins } from "./coins";
const UI_LG: Record<string, string> = { quick: "fast", normal: "normal", tactical: "tactic" }, UI_LG_IN: Record<string, string> = { fast: "quick", normal: "normal", tactic: "tactical" };
const uiLeagues = (L: Record<string, any>) => Object.fromEntries(Object.entries(L).map(([k, v]) => [UI_LG[k] || k, { r: v.rating, rd: v.rd, games: v.games, w: v.wins, l: v.losses, d: v.draws, peak: v.peak, prov: v.provisional }]));

type Lob = { code: string; pub: boolean; phase: string; size: number; host: string; n: number; at: number };
type Att = { pkey?: string; nick?: string; verified?: boolean; mapAt?: number; sid?: string; url: string; tk: number; at: number; st: number; inv: number };
const NEW_PER_MIN = 6, INVITE_GAP_MS = 10_000, INVITE_TTL_S = 60, LOBBY_LIST_TTL = 2 * 3600_000;

const ACTIVE_TTL = 14 * 86400_000; // партия без событий 2 недели выпадает из «Мои партии»
export class StratIndex extends DurableObject {
  replays = new ReplayServer(terrView as any); // t1156: кэш кадров для перемотки (8 повторов)
  env: any; lobbies: Map<string, Lob> | null = null; newRate = new Map<string, number[]>();
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async lobs() { if (!this.lobbies) this.lobbies = new Map(Object.entries((await this.ctx.storage.get("lobs")) || {})); return this.lobbies; }
  async saveLobs() { const m = await this.lobs(), now = Date.now(); for (const [k, v] of m) if (now - v.at > LOBBY_LIST_TTL) m.delete(k); await this.ctx.storage.put("lobs", Object.fromEntries(m)); }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/report") {
      const b: any = await request.json().catch(() => null); if (!b || !CODE_RE.test(b.code)) return new Response("bad", { status: 400 });
      const m = await this.lobs(); m.set(b.code, { code: b.code, pub: !!b.pub, phase: String(b.phase), size: b.size | 0, host: String(b.host).slice(0, 16), n: b.n | 0, at: Date.now() });
      await this.saveLobs();
      // активные партии игрока («Продолжить»): play — добавить, иначе убрать
      if (Array.isArray(b.uids)) { const act: Record<string, Record<string, { size: number; at: number }>> = (await this.ctx.storage.get("act")) || {}, now = Date.now();
        for (const u of b.uids.slice(0, 8).map(String)) { const o = (act[u] ||= {}); if (b.phase === "play") o[b.code] = { size: b.size | 0, at: now }; else delete o[b.code];
          for (const [c, v] of Object.entries(o)) if (now - v.at > ACTIVE_TTL) delete o[c]; if (!Object.keys(o).length) delete act[u]; }
        await this.ctx.storage.put("act", act); }
      return new Response("ok");
    }
    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    const cors = origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type" } });
    if (url.pathname === "/strat/new" && request.method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "local", now = Date.now();
      const r = (this.newRate.get(ip) || []).filter((t) => now - t < 60_000);
      if (r.length >= NEW_PER_MIN) return Response.json({ err: "rate" }, { status: 429, headers: cors });
      r.push(now); this.newRate.set(ip, r);
      const b: any = await request.json().catch(() => ({}));
      const size = SIZES.includes(b.size) ? b.size : 8;
      const m = await this.lobs();
      for (let i = 0; i < 8; i++) {
        const rnd = crypto.getRandomValues(new Uint8Array(6));
        const code = [...rnd].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
        if (m.has(code)) continue;
        const stub = this.env.STRAT_MATCH.get(this.env.STRAT_MATCH.idFromName(code));
        const res = await stub.fetch("https://internal/init", { method: "POST", body: JSON.stringify({ code, size, pub: !!b.pub }) });
        if (res.status === 409) continue;
        m.set(code, { code, pub: !!b.pub, phase: "lobby", size, host: "", n: 0, at: now }); await this.saveLobs();
        return Response.json({ code }, { headers: cors });
      }
      return Response.json({ err: "busy" }, { status: 503, headers: cors });
    }
    if (url.pathname === "/strat/open") {
      const list = [...(await this.lobs()).values()].filter((l) => l.pub && l.phase === "lobby" && l.n === 1).slice(0, 30)
        .map(({ code, size, host }) => ({ code, size, host }));
      return Response.json({ list }, { headers: cors });
    }
    // публичный рейтинг: профиль/форум (3 лиги) и таблицы лидеров (топ-100). Только чтение, без личных данных кроме ника.
    if (url.pathname === "/strat/stats" && request.method === "GET") { // публичная часть профиля
      const uid = (url.searchParams.get("uid") || "").slice(0, 64); if (!/^[A-Za-z0-9_:-]{3,64}$/.test(uid) || uid.startsWith("guest:")) return Response.json({ err: "bad_uid" }, { status: 400, headers: cors });
      try { return Response.json({ uid, ...(await getPublicStats(this.env, uid)), leagues: await getRatings(this.env, uid), commander: await getProfile(this.env, uid), coins: await getCoins(this.env, uid) }, { headers: { ...cors, "Cache-Control": "public, max-age=60" } }); } catch { return Response.json({ err: "db" }, { status: 503, headers: cors }); }
    }
    if (url.pathname === "/strat/replay" && request.method === "GET") { // t1156: повтор законченной партии (всё раскрыто); живые партии — только через свой DO
      try { const r = await this.replays.http(this.env.GAME_DB, url); return Response.json(r.body, { status: r.status, headers: { ...cors, ...(r.status === 200 ? { "Cache-Control": "public, max-age=300" } : {}) } }); }
      catch { return Response.json({ err: "replay_failed" }, { status: 500, headers: cors }); }
    }
    if (url.pathname === "/strat/rating" && request.method === "GET") {
      const uid = (url.searchParams.get("uid") || "").slice(0, 64); if (!/^[A-Za-z0-9_:-]{3,64}$/.test(uid)) return Response.json({ err: "bad_uid" }, { status: 400, headers: cors });
      try { return Response.json({ uid, leagues: await getRatings(this.env, uid), commander: await getProfile(this.env, uid) }, { headers: { ...cors, "Cache-Control": "public, max-age=60" } }); } catch { return Response.json({ err: "db" }, { status: 503, headers: cors }); }
    }
    if (url.pathname === "/strat/top" && request.method === "GET") {
      try { return Response.json({ league: url.searchParams.get("league"), list: (await leaderboard(this.env, url.searchParams.get("league") || "", Math.max(1, Math.min(100, +(url.searchParams.get("n") || 100) || 100)))).map(({ uid, ...x }: any) => ({ ...x, prov: false })) }, { headers: { ...cors, "Cache-Control": "public, max-age=120" } }); } catch { return Response.json({ err: "db" }, { status: 503, headers: cors }); }
    }
    if (url.pathname === "/strat/hub" && request.headers.get("Upgrade") === "websocket") {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ url: request.url, tk: MSG_BURST, at: Date.now(), st: 0, inv: 0 } as Att);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404, headers: cors });
  }

  send(ws: WebSocket, o: any) { try { ws.send(JSON.stringify(o)); } catch {} }
  online() {
    const seen = new Map<string, { sid: string; nick: string }>();
    for (const w of this.ctx.getWebSockets()) { const a = w.deserializeAttachment() as Att; if (a?.pkey && !seen.has(a.pkey)) seen.set(a.pkey, { sid: a.sid!, nick: a.nick! }); }
    return [...seen.entries()];
  }
  pushOnline() {
    const all = this.online();
    for (const w of this.ctx.getWebSockets()) { const a = w.deserializeAttachment() as Att; if (!a?.pkey) continue;
      this.send(w, { type: "online", list: all.filter(([pk]) => pk !== a.pkey).slice(0, 100).map(([, v]) => v) }); }
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Att;
    const lim = { tokens: a.tk, at: a.at, strikes: a.st }; const vr = admitMessage(lim, raw, Date.now());
    a.tk = lim.tokens; a.at = lim.at; a.st = lim.strikes; ws.serializeAttachment(a);
    if (vr !== "ok" || (raw as string).length > 4096) return;
    let m: any; try { m = JSON.parse(raw as string); } catch { return; }
    if (m?.type === "ping") return this.send(ws, { type: "pong" });
    if (m?.type === "hello" && !a.pkey) {
      const id = await identify(this.env, a.url, m); if ("err" in id) return this.send(ws, { type: "err", err: id.err });
      const prev = this.online().find(([pk]) => pk === id.pkey);
      a.pkey = id.pkey; a.nick = id.nick; a.verified = id.verified; a.sid = prev ? prev[1].sid : [...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const prefs = id.verified ? ((await this.ctx.storage.get("pref:" + id.pkey)) as any) || null : null; // вид фигур — в профиле вошедшего; гость — только localStorage
      let favRaces: string[] = []; if (id.verified && this.env.GAME_DB) try { const r: any = await this.env.GAME_DB.prepare("SELECT races FROM strat_fav_races WHERE user_id = ?").bind(id.pkey).first(); favRaces = cleanFav(String(r?.races || "").split(",")); } catch {} // t1144
      ws.serializeAttachment(a); this.send(ws, { type: "hello_ok", nick: id.nick, guest: !id.verified, sid: a.sid, admin: await isStratAdmin(this.env, id.pkey, id.verified), prefs, favRaces }); this.pushOnline(); return;
    }
    if (!a.pkey) return;
    if (m?.type === "invite" && typeof m.to === "string" && CODE_RE.test(m.code)) {
      const now = Date.now(); if (now - (a.inv || 0) < INVITE_GAP_MS) return this.send(ws, { type: "err", err: "invite_rate" });
      a.inv = now; ws.serializeAttachment(a);
      let n = 0;
      for (const w of this.ctx.getWebSockets()) { const b = w.deserializeAttachment() as Att; if (b?.sid === m.to && b.pkey !== a.pkey) { this.send(w, { type: "invite", from: a.nick, code: m.code, ttl: INVITE_TTL_S }); n++; } }
      this.send(ws, { type: "invite_sent", ok: n > 0 });
      return;
    }
    if (m?.type === "lib_list" || m?.type === "lib_save" || m?.type === "lib_unsave" || m?.type === "lib_rename") { // t1156: «Библиотека партий» (только вошедшим)
      if (!a.pkey) return this.send(ws, { type: "err", err: "hello_first", rq: m.rq });
      if (!a.verified) return this.send(ws, { type: "err", err: "guest", rq: m.rq });
      const db = this.env.GAME_DB; if (!db) return this.send(ws, { type: "err", err: "no_db", rq: m.rq });
      const C = (await loadStratCfg(this.env)).cfg;
      if (m.type !== "lib_list") { const id = String(m.id || ""); if (!REPLAY_ID_RE.test(id)) return this.send(ws, { type: "err", err: "bad_id", rq: m.rq });
        const e = m.type === "lib_save" ? await libSave(db, a.pkey, id, m.title, C) : m.type === "lib_rename" ? await libRename(db, a.pkey, id, m.title) : (await libUnsave(db, a.pkey, id), ""); if (e) return this.send(ws, { type: "err", err: e, rq: m.rq }); }
      return this.send(ws, { type: "lib", rq: m.rq, ...(await libList(db, a.pkey, C)) });
    }
    if (m?.type === "fav_races_set") { // t1144: «Любимые расы» (до 3) для рейтингового жребия; только вошедшим, D1 strat_fav_races
      if (!a.verified) return this.send(ws, { type: "err", err: "guest" });
      const C = await loadStratCfg(this.env), races = cleanFav(m.races, (C.cfg.econ as any).raceDraw?.favMax ?? 3);
      if (!this.env.GAME_DB) return this.send(ws, { type: "err", err: "no_db" });
      await this.env.GAME_DB.prepare("INSERT INTO strat_fav_races (user_id, races, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET races = excluded.races, updated_at = excluded.updated_at").bind(a.pkey, races.join(","), Date.now()).run();
      return this.send(ws, { type: "fav_races_ok", favRaces: races });
    }
    if (m?.type === "pref_set") {
      if (!a.verified) return this.send(ws, { type: "err", err: "guest" });
      const pr = { pieceStyle: m.pieceStyle === "tok" ? "tok" : "fig", glyphBadge: m.glyphBadge !== false };
      await this.ctx.storage.put("pref:" + a.pkey, pr); return this.send(ws, { type: "pref_ok", prefs: pr });
    }
    if (m?.type === "cfg_get" || m?.type === "cfg_set") { // настройки экономики (админка): база + правка из game_overrides
      const reply = (o: any) => this.send(ws, { type: m.type + "_r", rq: m.rq, ...o });
      if (!(await isStratAdmin(this.env, a.pkey, !!a.verified))) return reply({ err: "not_admin" });
      try {
        if (m.type === "cfg_get") { const c = await loadStratCfg(this.env, true); return reply({ base: STRAT_CFG, patch: c.patch, cfg: c.cfg }); }
        return reply(await saveStratPatch(this.env, a.pkey, m.patch));
      } catch { return reply({ err: "db" }); }
    }
    if (typeof m?.type === "string" && (m.type.startsWith("map") || ["my_stats", "my_active", "rating_get", "top_get", "profile_get", "resume_get"].includes(m.type))) return this.mapMsg(ws, a, m);
    if (m?.type === "decline" && typeof m.to === "string") return; // этап 1: отказ просто закрывает плашку у приглашённого
  }
  /** Карты игроков и модерация (админ проверяется на сервере по player_roles). */
  async mapMsg(ws: WebSocket, a: Att, m: any) {
    const who = { pkey: a.pkey!, nick: a.nick || "", verified: !!a.verified }, rq = m.rq;
    const reply = (o: any) => this.send(ws, { type: m.type + "_r", rq, ...o });
    try {
      if (m.type === "map_list") return reply({ size: m.size, list: await listMaps(this.env, who.pkey, SIZES.includes(m.size) ? m.size : 8) });
      if (m.type === "map_get") { const r = await getMapRow(this.env, String(m.id || "")); const admin = await isStratAdmin(this.env, who.pkey, who.verified);
        if (!r || (r.status !== "approved" && r.author !== who.pkey && !admin)) return reply({ err: "not_found" }); return reply({ map: rowToMap(r), status: r.status }); }
      if (m.type === "map_save") { const now = Date.now(); if (now - (a.mapAt || 0) < 5000) return reply({ err: "rate" }); a.mapAt = now; ws.serializeAttachment(a); return reply(await saveMap(this.env, who, m.map)); }
      if (m.type === "map_flag") return reply(await flagMap(this.env, who, String(m.id || ""), String(m.why || "")));
      if (m.type === "my_active") { // «Мои партии»: незавершённые, куда можно вернуться (код → /strat/m/CODE)
        if (!who.verified) return reply({ list: [] });
        const act: any = (await this.ctx.storage.get("act")) || {}; return reply({ list: Object.entries(act[who.pkey] || {}).map(([code, v]: any) => ({ code, size: v.size, at: v.at })) });
      }
      // ---- формы, которые ждёт клиент UI-воркера (ветка strategy-ui): лиги fast|normal|tactic, поля r/rd/w/l/d/prov
      if (m.type === "rating_get") return reply({ leagues: uiLeagues(await getRatings(this.env, who.verified ? who.pkey : "")), commander: who.verified ? await getProfile(this.env, who.pkey) : null });
      if (m.type === "top_get") { const lg = UI_LG_IN[String(m.league || "")] || String(m.league || "");
        const me = who.verified ? await myPlace(this.env, who.pkey, lg) : null, N = Math.max(1, Math.min(100, +m.n || 100)); // t1170+: экран «Рейтинг» — топ N, моё место
        return reply({ league: m.league, list: (await leaderboard(this.env, lg, N)).map((x: any) => ({ place: x.place, nick: x.nick, r: x.rating, rd: x.rd, games: x.games, w: x.wins, l: x.losses, d: x.draws, prov: false, ...(who.verified && x.uid === who.pkey ? { me: true } : {}) })),
          me: me && { place: me.place, r: me.rating, rd: me.rd, games: me.games, w: me.wins, l: me.losses, d: me.draws, prov: me.prov, left: me.left }, total: me?.total ?? null }); }
      if (m.type === "resume_get") { if (!who.verified) return reply({ game: null });
        const act: any = (await this.ctx.storage.get("act")) || {}; const e = Object.entries(act[who.pkey] || {}).sort((x: any, y: any) => y[1].at - x[1].at)[0] as any;
        return reply({ game: e ? { code: e[0], size: e[1].size, at: e[1].at } : null }); }
      if (m.type === "profile_get") { // чужой профиль — по нику (только публичная часть); свой — + priv (владелец определяется сервером по сессии)
        let uid = who.verified ? who.pkey : "", own = !!uid;
        if (typeof m.nick === "string" && m.nick && m.nick !== who.nick) { const r: any = await this.env.GAME_DB.prepare("SELECT id FROM users WHERE username = ? LIMIT 1").bind(m.nick.slice(0, 32)).first(); uid = r?.id || ""; own = false; }
        if (!uid) return reply({ err: who.verified ? "not_found" : "need_login" });
        const pub: any = await getPublicStats(this.env, uid), out: any = { nick: own ? who.nick : m.nick, own, matches: pub.matches, wins: pub.wins, winrate: pub.winrate, favouriteRace: pub.favouriteRace,
          races: Object.fromEntries(Object.entries(pub.races || {}).map(([k, v]: any) => [k, { games: v.matches, wins: v.wins, winrate: v.winrate }])),
          leagues: uiLeagues(await getRatings(this.env, uid)), commander: await getProfile(this.env, uid), coins: own ? await getCoins(this.env, uid) : undefined };
        if (own) out.priv = privView(await getPrivateStats(this.env, uid), (await loadStratCfg(this.env)).cfg); // t1163: названия из cfg, вид ульты chief|unit
        return reply(out); }
      if (m.type === "my_stats") { // приватная часть профиля: только своя (личность — из hello/Clerk), гостю — нет
        if (!a.verified) return reply({ err: "need_login" });
        try { return reply({ stats: await getPrivateStats(this.env, who.pkey) }); } catch { return reply({ err: "db" }); }
      }
      if (m.type === "map_pool") { // рейтинговый пул: только админ (проверка на сервере)
        if (!(await isStratAdmin(this.env, who.pkey, who.verified))) return reply({ err: "not_admin" });
        return reply(await poolSet(this.env, who.pkey, await getMapRow(this.env, String(m.id || "")), !!m.on));
      }
      if (m.type === "map_queue" || m.type === "map_mod") {
        if (!(await isStratAdmin(this.env, who.pkey, who.verified))) return reply({ err: "not_admin" });
        if (m.type === "map_queue") return reply({ list: await modQueue(this.env) });
        return reply(await moderate(this.env, who.pkey, String(m.id || ""), String(m.act || ""), m.reason));
      }
    } catch (e: any) { return reply({ err: "db" }); }
    return reply({ err: "bad_type" });
  }
  async webSocketClose() { this.pushOnline(); }
  async webSocketError() { this.pushOnline(); }
}
