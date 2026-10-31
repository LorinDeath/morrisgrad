// StratMatch — отдельный Durable Object на каждое лобби/партию «Партии Чёрных королей» (idFromName(код)).
// Не связан с GameRoom: партии не делят процессор и очередь с миром MorrisCurse и друг с другом.
// Hibernatable WebSocket (DO спит, пока игрок думает) + alarm() для таймера хода и возврата после обрыва.
import { DurableObject } from "cloudflare:workers";
import { admitMessage, originAllowed, isLocalRequest, isDevRequest, MSG_BURST } from "../limits";
import { identify, type Ident } from "./ident";
import { resolveLobbyMap } from "./maps";
import { type MapData } from "./terrain";
import { newGame, makeMap, apply, view, botAction, inCheck, RACES, SIZES, STRAT_CFG, type GameState, type Race, type Action, type Ev, type Kind, type StratCfg } from "./rules";
import { loadStratCfg } from "./cfg";
import { ECON_ACTS, goalDetails, bldMaxHp, growEvery, claimCost, claimCells, raceAp, apFor } from "./econ";
import { redactHp, setTowerMax } from "./hidehp";
import { startLog, logAct, logEnd, moveList, FrameCache, redactX, type RLog } from "./replay";
import { putReplay, pruneReplays, replayCfg, revealFrame } from "./replay-db";
import { drawRaces, newSeed, commitOf, cleanFav, rollsFor } from "./racedraw";
import { treeView, publicPatch, hiddenTarget } from "./tree-view";
import { RATING_CFG, xpMul } from "./rating";
import { matchBot, BOT_LEVELS, TACTIC_IDS, type BotLevel } from "./ai";
import { chiefBlacklist, goalCfg } from "./econ";
import { rateFinished, mapInPool, addXp, botXpToday } from "./rating-db";
import { matchXp } from "./account";
import { turnMinutes, validTurnMin, canClaim } from "./away";
import { cleanChat, chatAllowed, canSee, parseTo, CHAT_CFG, type ChatMsg } from "./chat";
import { addStats, type StatRow } from "./stats";
import { coinsFor, grantCoins } from "./coins";
import { pieceLevel } from "./econ";
import { codexSeen, codexPick } from "./codex";
import { leagueOf, isAbandon as isAbandonR } from "./rating";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без O/0, I/1
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const RCH = 256; // t1156: действий в одном куске лога
const GRACE_MS = 120_000; // на возврат после обрыва
const LOBBY_TTL_MS = 2 * 3600_000; // пустое лобби/законченная партия живут 2 часа
const BOT_STEP_MS = 450;

type SeatS = { pkey: string; nick: string; verified: boolean; race: Race | null; ready: boolean; bot?: boolean; level?: BotLevel; arch?: string; goneAt: number | null; col?: number }; // col — t1194: цвет игрока 0..7 (лобби)
type Clock = { turnStart: number; reserve: [number, number] };
type L = {
  rid?: string; rn?: number; rlast?: number; // t1156: id повтора (код:старт), число кусков лога в storage, время последней записи в D1
  code: string; created: number; touched: number; size: number; pub: boolean;
  mapId?: string; mapName?: string; mapStatus?: string; xpMap?: boolean; // выбранная карта; xpMap=false — неодобренная карта (без опыта)
  map?: MapData; // предпросмотр в лобби и рельеф партии
  hiddenHp?: boolean; // «Скрытое здоровье»: точные ОЗ чужих фигур/построек не отдаются (в рейтинговой — выкл.)
  turnLimit?: number | null; // null/нет = по умолчанию для размера; 0 = без лимита; иначе TURN_LIMIT.min..max
  phase: "lobby" | "play" | "over"; seats: [SeatS | null, SeatS | null];
  game: GameState | null; clock: Clock | null; result?: { winner: number; reason: string };
  cfgPatch?: any; // правка админки (маленькая) — уходит клиенту, чтобы подсказки совпадали с сервером
  cfg?: StratCfg; // снимок правил (STRAT_CFG + правки админки) на момент старта партии
  st?: { start: number; ck: [number, number]; tal: [string[], string[]]; ult: [string[], string[]] }; // для профиля (stats.ts)
  chat?: ChatMsg[]; chatId?: number; mutes?: Record<string, string[]>; reports?: { at: number; by: string; msg: number; who: string; text: string }[];
  turnMin?: number | null; skips?: [number, number]; // лимит хода хоста (мин; null — по размеру) и подряд авто-пропусков (away.ts)
  activeMs?: [number, number]; // активное время своих ходов (для опыта Полководца; авто-пропуск = 0)
  rated?: boolean; // «Рейтинговая»: стандартные настройки; рейтинг — только на карте из пула (rating.ts)
  acts?: [number, number]; // действия игроков за партию (проигравший без действий → победителю ×0,25)
  rating?: any; // итог рейтинга для окна конца партии: {league, changes} или {unrated}
  draw?: { seed: string; commit: string; rolls?: any[]; order?: number[]; w?: [number, number] }; // t1144: рейтинговый жребий рас (seed скрыт до старта, commit — публично)
  devTurnMs?: number; // только локальные плейтесты (MC_DEV_TRUST_USERID=1 + localhost): короткий таймер хода без запаса
};
type Att = { pkey?: string; nick?: string; verified?: boolean; url: string; tk: number; at: number; st: number };

export class StratMatch extends DurableObject {
  env: any; L: L | null = null; loaded = false; botTimer: any = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }

  async load(): Promise<L | null> { if (!this.loaded) { this.L = (await this.ctx.storage.get("L")) || null; this.loaded = true; await this.rload(); } return this.L; }
  async save() { if (this.L) { this.L.touched = Date.now(); await this.ctx.storage.put({ L: this.L, ...this.rdirty() }); } await this.rearm(); this.report(); }
  // ---------- t1156: лог партии (replay.ts). Хранится кусками по RCH действий (лимит значения DO storage — 128 КБ) ----------
  R: RLog | null = null; rSaved = 0; fc: FrameCache | null = null;
  async rload() { const L = this.L; if (!L?.rid) return; const meta: any = await this.ctx.storage.get("rmeta"); if (!meta || meta.id !== L.rid) return;
    const keys = Array.from({ length: L.rn || 0 }, (_, k) => "ra:" + k), m: Map<string, any> = keys.length ? await this.ctx.storage.get(keys) : new Map();
    this.R = { ...meta, acts: keys.flatMap((k) => m.get(k) || []) }; this.rSaved = this.R!.acts.length; }
  rdirty(): Record<string, any> { const R = this.R, L = this.L; if (!R || !L || L.rid !== R.id) return {};
    const out: Record<string, any> = {}, n = R.acts.length; if (n === this.rSaved && L.rn !== undefined && !(R as any)._m) return out;
    const { acts, ...meta } = R; out.rmeta = meta; delete (R as any)._m;
    for (let k = Math.floor(this.rSaved / RCH); k * RCH < Math.max(n, 1); k++) out["ra:" + k] = acts.slice(k * RCH, (k + 1) * RCH);
    L.rn = Math.ceil(n / RCH); this.rSaved = n; return out; }
  /** Повтор в D1: status live — по ходу (не чаще rollMs), over — в конце. Ошибки D1 партию не ломают. */
  async rdb(status: "live" | "over") { const L = this.L, R = this.R, db = this.env.GAME_DB; if (!L || !R || !db || L.rid !== R.id) return;
    const C = this.cfg(), g = L.game!, S = L.seats; L.rlast = Date.now();
    try { await putReplay(db, { log: R, status, uids: [S[0]?.pkey || "", S[1]?.pkey || ""], nicks: [S[0]?.nick || "", S[1]?.nick || ""], winner: g.winner, reason: g.reason || null, turns: g.turn, rated: !!L.rated, mapId: L.mapId || null }, C);
      if (status === "over") await pruneReplays(db, C); } catch {} }
  lastReport = "";
  /** Сводка лобби → StratIndex (список «Ждут соперника»); только при изменении. */
  report() {
    const L = this.L; if (!L || !this.env.STRAT_INDEX) return;
    const sum = { code: L.code, pub: L.pub && L.xpMap !== false, map: L.mapName || "", phase: L.phase, size: L.size, host: L.seats[0]?.nick || "", n: L.seats.filter(Boolean).length,
      uids: L.seats.filter((x) => x && x.verified && !x.bot).map((x) => x!.pkey) }; // для «Мои партии → Продолжить»
    const k = JSON.stringify(sum); if (k === this.lastReport) return; this.lastReport = k;
    const stub = this.env.STRAT_INDEX.get(this.env.STRAT_INDEX.idFromName("index"));
    this.ctx.waitUntil?.(stub.fetch("https://internal/report", { method: "POST", body: k }).catch(() => {}));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/init") { // только из StratIndex (stub.fetch, мимо роутера воркера)
      const b: any = await request.json().catch(() => ({}));
      if (await this.load()) return new Response("exists", { status: 409 });
      if (!CODE_RE.test(String(b.code))) return new Response("bad", { status: 400 });
      const size = SIZES.includes(b.size) ? b.size : 8;
      this.L = { code: b.code, created: Date.now(), touched: Date.now(), size, pub: !!b.pub, rated: RATING_CFG.ratedDefault, phase: "lobby", seats: [null, null], game: null, clock: null };
      this.setMap(null); await this.ensureDraw();
      await this.save(); return Response.json({ ok: true });
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Ожидался WebSocket", { status: 426 });
    if (!originAllowed(this.env, request.headers.get("Origin"), isLocalRequest(request))) return new Response("Подключение с этого сайта запрещено", { status: 403 });
    if (!(await this.load())) return new Response("Лобби не найдено", { status: 404 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ url: request.url, tk: MSG_BURST, at: Date.now(), st: 0 } as Att);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- сокеты ----------
  socketsOf(pkey: string) { return this.ctx.getWebSockets().filter((w: WebSocket) => (w.deserializeAttachment() as Att)?.pkey === pkey); }
  seatOf(pkey: string | undefined): 0 | 1 | -1 { const s = this.L!.seats; return !pkey ? -1 : s[0]?.pkey === pkey ? 0 : s[1]?.pkey === pkey ? 1 : -1; }
  send(ws: WebSocket, o: any) { try { ws.send(JSON.stringify(o)); } catch {} }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Att;
    const lim = { tokens: a.tk, at: a.at, strikes: a.st };
    const vr = admitMessage(lim, raw, Date.now());
    a.tk = lim.tokens; a.at = lim.at; a.st = lim.strikes; ws.serializeAttachment(a);
    if (vr !== "ok") { if (vr === "close") try { ws.close(1008, "flood"); } catch {} return; }
    if ((raw as string).length > 4096) return;
    let msg: any; try { msg = JSON.parse(raw as string); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "ping") return this.send(ws, { type: "pong" });
    const L = await this.load(); if (!L) return;
    if (msg.type === "hello") {
      if (a.pkey) return;
      const id = await identify(this.env, a.url, msg);
      if ("err" in id) { this.send(ws, { type: "err", err: id.err }); return; }
      a.pkey = id.pkey; a.nick = id.nick; a.verified = id.verified; ws.serializeAttachment(a);
      await this.join(id);
      return;
    }
    if (!a.pkey) return this.send(ws, { type: "err", err: "hello_first" });
    const seat = this.seatOf(a.pkey);
    if (msg.type === "dev_clock") { // проверка таймера alarm() в тестах; на проде не активируется
      if (!isDevRequest(this.env, { url: a.url }) || seat !== 0 || L.phase !== "lobby") return this.send(ws, { type: "err", err: "dev_only" });
      L.devTurnMs = Math.max(500, Math.min(60000, msg.ms | 0)); await this.save(); return this.broadcast();
    }
    if (msg.type === "moves" || msg.type === "frame") return this.replayMsg(ws, seat, msg);
    if (msg.type.startsWith("chat")) { const e = await this.chatMsg(ws, a, seat, msg); if (e) { this.send(ws, { type: "err", err: e, rq: msg.rq }); this.send(ws, { type: "chat_err", err: e }); } return; }
    const err = await this.handle(seat, a.pkey, msg);
    if (err) this.send(ws, { type: "err", err, rq: msg.rq });
  }
  async webSocketClose(ws: WebSocket) { await this.gone(ws); }
  async webSocketError(ws: WebSocket) { await this.gone(ws); }
  async gone(ws: WebSocket) {
    const L = await this.load(); if (!L) return;
    const pk = (ws.deserializeAttachment() as Att)?.pkey; const seat = this.seatOf(pk);
    if (seat < 0 || this.socketsOf(pk!).some((w: WebSocket) => w !== ws)) return;
    const s = L.seats[seat]!;
    if (L.phase === "lobby" && seat === 1) L.seats[1] = null; // гость лобби ушёл — место свободно
    else s.goneAt = Date.now();
    await this.save(); this.broadcast();
  }

  async join(id: Ident) {
    const L = this.L!;
    let seat = this.seatOf(id.pkey);
    if (seat >= 0) { L.seats[seat]!.goneAt = null; L.seats[seat]!.nick = id.nick; } // переподключение
    else if (L.phase === "lobby") {
      const free = L.seats[0] ? (L.seats[1] ? -1 : 1) : 0;
      if (free >= 0) { L.seats[free] = { pkey: id.pkey, nick: id.nick, verified: id.verified, race: null, ready: false, goneAt: null }; seat = free as 0 | 1; }
    }
    await this.save(); this.broadcast();
  }

  /** итог рейтинга по местам (без user_id наружу): league/unrated, [{rating, delta, xp, coins}] */
  ratingView() { const R: any = this.L!.rating; if (!R) return null;
    return { league: R.league || null, unrated: R.unrated || null, seats: [0, 1].map((i) => { const pk = this.L!.seats[i]?.pkey, c = pk ? R.changes?.[pk] : null;
      return { rating: c?.rating ?? null, delta: c?.delta ?? null, xp: R.xp?.[i] ?? null, coins: R.coins?.[i] ?? null }; }) }; }
  // ---------- чат (chat.ts) ----------
  chatRate = new Map<string, number[]>();
  team(s: number) { return s; } // 1×1: команда = место (в командах — номер команды места)
  async chatMsg(ws: WebSocket, a: Att, seat: number, m: any): Promise<string> {
    const L = this.L!, pk = a.pkey!;
    // форма клиента UI-воркера: { ch: "all"|"team"|"w", to?: ник } → наш { to: "all"|"team"|место }
    if (m.type === "chat" && typeof m.ch === "string") m.to = m.ch === "w" ? L.seats.findIndex((x) => x?.nick === m.to) : m.ch;
    if (m.type === "chat_report" && m.id == null && typeof m.text === "string") { const f = [...(L.chat || [])].reverse().find((x) => x.text === m.text && (!m.user || L.seats[x.from]?.nick === m.user)); if (f) m.id = f.id; }
    if (m.type === "chat_hist") { this.send(ws, { type: "chat_hist", list: this.chatFor(seat, pk) }); return ""; }
    if (seat < 0) return "spectator"; // зрители читают «всем», но не пишут
    if (m.type === "chat_mute") { const mu = ((L.mutes ||= {})[pk] ||= []); const who = String(m.who ?? ""); const i = mu.indexOf(who);
      if (m.on === false) { if (i >= 0) mu.splice(i, 1); } else if (i < 0 && mu.length < 16 && /^[01]$/.test(who)) mu.push(who); await this.save(); this.send(ws, { type: "chat_mute_r", mutes: mu }); return ""; }
    if (m.type === "chat_report") { const msg = (L.chat || []).find((x) => x.id === (m.id | 0)); if (!msg || msg.from === seat) return "bad_msg";
      const R = (L.reports ||= []); if (R.filter((r) => r.by === pk).length >= 10) return "rate"; R.push({ at: Date.now(), by: pk, msg: msg.id, who: L.seats[msg.from]?.pkey || "", text: msg.text });
      if (R.length > CHAT_CFG.reportsMax) R.shift(); await this.save(); this.send(ws, { type: "chat_report_r", ok: true }); return ""; }
    if (m.type !== "chat") return "bad_type";
    const to = parseTo(m.to, L.seats.length); if (to === null || to === seat) return "bad_to";
    if (typeof to === "number" && !L.seats[to]) return "bad_to";
    const text = cleanChat(m.text); if (!text) return "empty";
    const st = this.chatRate.get(pk) || []; this.chatRate.set(pk, st); if (!chatAllowed(st, Date.now())) return "chat_rate";
    const msg: ChatMsg = { id: (L.chatId = (L.chatId || 0) + 1), at: Date.now(), from: seat, nick: L.seats[seat]!.nick, to, text };
    const H = (L.chat ||= []); H.push(msg); if (H.length > CHAT_CFG.history) H.splice(0, H.length - CHAT_CFG.history);
    await this.save();
    for (const w of this.ctx.getWebSockets()) { const p = (w.deserializeAttachment() as Att)?.pkey; if (!p) continue; const vs = this.seatOf(p);
      if (canSee(msg, vs, (s) => this.team(s)) && !(L.mutes?.[p] || []).includes(String(msg.from))) this.send(w, { type: "chat", msg, ...this.chatFlat(msg) }); }
    return "";
  }
  /** плоские поля для клиента UI-воркера: ch, from, fromNick, to?, toNick?, text, ts, id */
  chatFlat(x: ChatMsg) { const w = typeof x.to === "number"; return { ch: w ? "w" : x.to, from: x.from, fromNick: x.nick, to: w ? this.L!.seats[x.to as number]?.nick : undefined, toNick: w ? this.L!.seats[x.to as number]?.nick : undefined, text: x.text, ts: x.at, id: x.id }; }
  chatFor(seat: number, pk: string): ChatMsg[] { const L = this.L!, mu = L.mutes?.[pk] || [];
    return (L.chat || []).filter((x) => canSee(x, seat, (s) => this.team(s)) && !mu.includes(String(x.from))); }

  /** t1156: «Предыдущие ходы» в партии и повтор сразу после неё (тот же DO, пока лобби живо).
   *  moves → список действий (чужие экономические детали в живой партии урезаны); frame {i} → состояние после i действий.
   *  Живая партия: кадр собирается тем же stateFor(), что и живой экран (скрытые HP, только своё дерево/территория) — утечки нет.
   *  После конца: всё раскрыто (оба дерева, обе территории, точные HP). */
  replayMsg(ws: WebSocket, seat: number, m: any) {
    const L = this.L!, R = this.R; if (!R || L.rid !== R.id || !L.game) return this.send(ws, { type: "err", err: "no_replay", rq: m.rq });
    const live = L.phase === "play", n = R.acts.length;
    if (m.type === "moves") return this.send(ws, { type: "moves", rq: m.rq, id: R.id, live, ...moveList(R, seat, live) });
    const i = Number.isInteger(m.i) ? Math.max(0, Math.min(n, m.i)) : n;
    const fc = this.fc && this.fc.log === R ? this.fc : (this.fc = new FrameCache(R, this.cfg())), f = fc.at(i);
    let frame: any;
    if (live) { const keep = L.game, kp = L.phase; try { L.game = f.g; frame = this.stateFor(seat, f.ev); } finally { L.game = keep; L.phase = kp; }
      for (const k of ["clock", "away", "canClaim", "result", "rating", "raceDraw", "lobbyMap", "seats", "chat", "now"]) delete frame[k]; frame.type = undefined; }
    else frame = revealFrame(f.g, f.ev, this.cfg(), terrView as any);
    this.send(ws, { type: "frame", rq: m.rq, id: R.id, i, n, live, diverged: f.diverged, frame });
  }
  /** Команда игрока; возвращает код ошибки или "" */
  async handle(seat: 0 | 1 | -1, pkey: string, m: any): Promise<string> {
    const L = this.L!;
    if (seat < 0) return "spectator";
    const me = L.seats[seat]!;
    switch (m.type) {
      case "cfg": {
        if (seat !== 0) return "not_host"; if (L.phase !== "lobby") return "bad_phase";
        if (m.size !== undefined) { if (!SIZES.includes(m.size)) return "bad_size"; if (m.size !== L.size) { L.size = m.size; this.setMap(null); } }
        if (m.map !== undefined) { const e = await this.pickMap(String(m.map).slice(0, 24), pkey); if (e) return e; }
        if (m.pub !== undefined) L.pub = !!m.pub;
        if (m.ranked !== undefined && m.rated === undefined) m.rated = m.ranked; // имя поля у клиента UI-воркера
        if (m.turnSec !== undefined && m.turnMin === undefined) m.turnMin = m.turnSec == null ? null : Math.round(+m.turnSec / 60);
        if (m.rated !== undefined) { L.rated = !!m.rated; if (L.rated) { L.turnMin = null; L.hiddenHp = false; for (const s of L.seats) if (s && !s.bot) { s.race = null; s.ready = false; } await this.ensureDraw(); } } // «Рейтинговая» форсирует стандарт; раса — жребием
        if (m.turnMin !== undefined) { const t = validTurnMin(m.turnMin); if (t === undefined) return "bad_turn_min"; if (L.rated && t !== null) return "rated_fixed"; L.turnMin = t; }
        if (m.hiddenHp !== undefined) { if (L.rated && m.hiddenHp) return "rated_fixed"; L.hiddenHp = !!m.hiddenHp; }
        if (m.turnLimit !== undefined && m.turnLimit !== null && m.turnLimit !== 0) return "no_turn_limit"; // t1135: лимита ходов нет; null/0 — совместимость со старым клиентом
        for (const s of L.seats) if (s && !s.bot) s.ready = false; // настройки поменялись — «Готов» сбрасывается
        break;
      }
      case "bot": {
        if (m.lv !== undefined && m.level === undefined) m.level = m.lv; if (m.slot !== undefined && m.slot !== 1) return "bad_slot"; // 1×1: бот только на месте 1
        if (seat !== 0) return "not_host"; if (L.phase !== "lobby") return "bad_phase";
        if (m.on) { if (L.seats[1] && !L.seats[1].bot) return "seat_taken"; L.seats[1] = { pkey: "bot", nick: "Бот · " + ((BOT_LEVELS as any)[m.level]?.name || "Средний"), verified: false, race: RACES[Math.floor(Math.random() * RACES.length)], ready: true, bot: true, level: (BOT_LEVELS as any)[m.level] ? m.level : "medium", arch: TACTIC_IDS[Math.floor(Math.random() * TACTIC_IDS.length)], goneAt: null }; }
        else if (L.seats[1]?.bot) L.seats[1] = null;
        break;
      }
      case "race": {
        if (L.phase !== "lobby") return "bad_phase"; if (!RACES.includes(m.race)) return "bad_race";
        if (this.drawOn()) return "rated_random"; // t1144: в рейтинговой расу назначает сервер при старте
        me.race = m.race; me.ready = false; break;
      }
      case "color": { // t1194: выбор цвета в лобби (раньше сервер отвечал bad_type); занятый соперником — нельзя
        if (L.phase !== "lobby") return "bad_phase"; const c = m.col;
        if (!Number.isInteger(c) || c < 0 || c > 7) return "bad_color";
        if (L.seats.some((x, k) => k !== seat && x?.col === c)) return "color_taken";
        me.col = c; break;
      }
      case "ready": {
        if (L.phase !== "lobby") return "bad_phase"; if (!me.race && !this.drawOn()) return "pick_race";
        me.ready = !!m.on;
        if (L.seats[0]?.ready && L.seats[1]?.ready) await this.start();
        break;
      }
      case "act": {
        if (L.phase !== "play" || !L.game) return "bad_phase";
        const act = parseAct(m.act); if (!act) return "bad_action";
        const r = this.doAct(seat, act); if (r) return r;
        break;
      }
      case "forfeit": {
        if (L.phase !== "play") return "bad_phase";
        this.finish((1 - seat) as 0 | 1, "forfeit"); break;
      }
      case "claim_away": case "claim": {
        if (L.phase !== "play") return "bad_phase";
        const opp = (1 - seat) as 0 | 1, os = L.seats[opp];
        if (!os || os.bot || !canClaim(os.goneAt != null, L.skips?.[opp] || 0)) return "cant_claim";
        this.finish(seat as 0 | 1, "claim"); break;
      }
      case "rematch": {
        if (L.phase !== "over") return "bad_phase";
        (me as any).rematch = true;
        if (L.seats.every((s) => s && (s.bot || (s as any).rematch))) {
          for (const s of L.seats) if (s) { (s as any).rematch = false; s.ready = !!s.bot; if (!s.bot) s.race = null; }
          L.phase = "lobby"; L.game = null; L.clock = null; L.result = undefined; L.cfg = undefined; L.cfgPatch = undefined; L.draw = undefined; await this.ensureDraw();
        }
        break;
      }
      case "leave": {
        if (L.phase === "play") this.finish((1 - seat) as 0 | 1, "forfeit");
        if (L.phase === "lobby") { if (seat === 1) L.seats[1] = null; else { L.seats[0] = L.seats[1]?.bot ? null : L.seats[1]; L.seats[1] = null; } } // хост ушёл — хостом становится второй
        for (const w of this.socketsOf(pkey)) { this.send(w, { type: "left" }); try { w.close(1000, "leave"); } catch {} }
        break;
      }
      default: return "bad_type";
    }
    await this.save(); this.broadcast();
    return "";
  }

  setMap(map: { map: MapData; xp: boolean; status: string } | null) {
    const L = this.L!; const d = map || { map: makeMap(L.size, null), xp: true, status: "official" };
    L.map = d.map; L.mapId = d.map.id; L.mapName = d.map.name; L.mapStatus = d.status; L.xpMap = d.xp;
  }
  async pickMap(id: string, hostPkey: string): Promise<string> {
    const L = this.L!; const r = await resolveLobbyMap(this.env, id, L.size, hostPkey);
    if (r.err || !r.map) return r.err || "bad_map";
    this.setMap({ map: r.map, xp: r.xp, status: r.status }); return "";
  }
  async start() {
    const L = this.L!;
    if (!L.map || L.map.size !== L.size) this.setMap(null);
    if (L.mapId && /^u/.test(L.mapId)) { // статус могли поменять в админке, пока ждали соперника
      const r = await resolveLobbyMap(this.env, L.mapId, L.size, L.seats[0]!.pkey);
      if (r.err || !r.map) { this.setMap(null); } else this.setMap({ map: r.map, xp: r.xp, status: r.status });
    }
    const first = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) as 0 | 1; // кто ходит первым — случайно
    { const c = await loadStratCfg(this.env, true); L.cfg = c.cfg; L.cfgPatch = c.patch && Object.keys(c.patch).length ? c.patch : undefined; }
    if (this.drawOn()) await this.runDraw(); // t1144: рейтинговая — расы жребием, всем сразу (одним st после старта)
    if (L.phase !== "lobby" || !L.seats[0]?.race || !L.seats[1]?.race || !L.seats.every((s) => s?.ready)) { for (const s of L.seats) if (s && !s.bot) s.ready = false; return; } // пока ждали конфиг, место освободилось
    L.game = newGame(L.size, [L.seats[0]!.race!, L.seats[1]!.race!], first, L.cfg, 0, L.map);
    L.clock = { turnStart: Date.now(), reserve: [0, 0] }; L.skips = [0, 0]; // запаса больше нет: только лимит хода
    L.st = { start: Date.now(), ck: [0, 0], tal: [[], []], ult: [[], []] }; L.activeMs = [0, 0];
    L.phase = "play"; this.lastEv = [{ e: "turn", cur: first, turn: 1 }];
    if ((L.cfg.econ as any).replay?.on !== false) { L.rid = L.code + ":" + L.st.start; L.rn = 0; this.R = startLog(L.rid, L.game, L.cfg, L.map, L.cfgPatch, !!L.hiddenHp); this.rSaved = 0; this.fc = null; (this.R as any)._m = 1; }
    else { L.rid = undefined; this.R = null; }
    this.botMaybe();
  }
  lastEv: Ev[] = [];
  /** t1144: жребий рас включён — рейтинговая партия и econ.raceDraw.on (конфиг админки) */
  drawOn() { const L = this.L!; return !!L.rated && ((L.cfg || STRAT_CFG).econ as any).raceDraw?.on !== false; }
  /** seed на следующий жребий: commit = SHA-256 публикуется в лобби заранее, seed — только при старте */
  async ensureDraw() { const L = this.L!; if (!L.rated || (L.draw && !L.draw.rolls)) return; const seed = newSeed(); L.draw = { seed, commit: await commitOf(seed) }; }
  async runDraw() {
    const L = this.L!; await this.ensureDraw(); const D = L.draw!, RD = ((L.cfg || STRAT_CFG).econ as any).raceDraw || {};
    const favs = await Promise.all(L.seats.map(async (s) => { if (!s || s.bot || !s.verified || !this.env.GAME_DB) return [];
      try { const r: any = await this.env.GAME_DB.prepare("SELECT races FROM strat_fav_races WHERE user_id = ?").bind(s.pkey).first(); return cleanFav(String(r?.races || "").split(","), RD.favMax ?? 3); } catch { return []; } }));
    const seats = L.seats.map((_, i) => ({ fav: favs[i], team: i })); // 1×1/FFA: каждый — своя команда (2×2: team из места)
    const r = await drawRaces(D.seed, seats, RD); L.seats.forEach((s, i) => { if (s) s.race = r.races[i]; });
    D.rolls = r.rolls; D.order = r.order; D.w = [RD.fav ?? 85, RD.other ?? 15];
    if (this.env.GAME_DB) try { await this.env.GAME_DB.prepare("INSERT OR REPLACE INTO strat_race_draws (match_id, commit_hash, seed, seats, races, created_at) VALUES (?,?,?,?,?,?)")
      .bind(this.matchId(), D.commit, D.seed, JSON.stringify(seats), JSON.stringify(r.races), Date.now()).run(); } catch {}
  }

  doAct(seat: 0 | 1, act: Action, auto = false): string {
    const L = this.L!, g = L.game!, prevCur = g.cur;
    const hid = hiddenTarget(g, seat, act, this.cfg()); if (hid) return hid; // скрытый узел дерева — как несуществующий
    const kingId = g.pieces.find((p) => p.owner === seat && p.kind === "king")?.id;
    const r = apply(g, seat, act, this.cfg()); if (!r.ok) return r.err;
    if (L.st) { for (const e of r.ev as any[]) { if (e.e === "kill" && kingId && e.by === kingId) L.st.ck[seat]++; if (e.e === "ult" && (e.side === 0 || e.side === 1)) L.st.ult[e.side].push(String(e.ult)); }
      if (act.a === "talent") { const p = g.pieces.find((q) => q.id === (act as any).id); const t = p?.tal?.[p.tal.length - 1]; if (t) L.st.tal[seat].push(t); } }
    if (this.R && L.rid === this.R.id) logAct(this.R, seat, act, auto, g, g.cur !== prevCur);
    this.lastEv = r.ev; if (act.a !== "end") { const A = (L.acts ||= [0, 0]); A[seat]++; }
    if (!auto) { (L.skips ||= [0, 0])[seat] = 0; } else if (g.cur !== prevCur) (L.skips ||= [0, 0])[prevCur]++;
    if (g.cur !== prevCur || g.winner !== -1) this.turnPassed(prevCur, auto);
    if (g.winner !== -1) this.finish(g.winner as any, g.reason);
    this.botMaybe();
    return "";
  }
  /** Ход сменился: списать перерасход из запаса, запустить часы следующего. */
  turnPassed(prev: 0 | 1, auto = false) {
    const c = this.L!.clock!;
    if (!auto) { const A = (this.L!.activeMs ||= [0, 0]); A[prev] += Math.max(0, Math.min(Date.now() - c.turnStart, this.turnMs())); }
    const over = Date.now() - c.turnStart - this.turnMs();
    if (over > 0) c.reserve[prev] = Math.max(0, c.reserve[prev] - over);
    c.turnStart = Date.now();
    const L = this.L!; if (this.R && L.phase === "play" && Date.now() - (L.rlast || 0) >= replayCfg(this.cfg()).rollMs) this.ctx.waitUntil?.(this.rdb("live"));
  }
  cfg(): StratCfg { return this.L?.cfg || STRAT_CFG; }
  turnMs(): number { const L = this.L!; const tm = (this.cfg() as any).turnMinutes; return L.devTurnMs || (L.turnMin ?? (tm ? turnMinutes(L.size, tm) : turnMinutes(L.size))) * 60_000; }
  deadline(): number { const L = this.L!, c = L.clock!; return c.turnStart + this.turnMs() + c.reserve[L.game!.cur]; }

  finish(winner: 0 | 1 | 2, reason: string) {
    const L = this.L!; if (L.phase !== "play") return;
    const g = L.game!; if (g.winner === -1) { g.winner = winner; g.reason = reason; this.lastEv = [...this.lastEv, { e: "end", winner, reason }]; }
    L.phase = "over"; L.result = { winner, reason };
    if (this.R && L.rid === this.R.id) { logEnd(this.R, g.winner, g.reason); (this.R as any)._m = 1; this.rdb("over").catch(() => {}); }
    this.record().catch(() => {}); this.recordRating().catch(() => {});
  }
  /** Итог партии в D1 (strat_matches; миграция 0025). Опыт Полководца — этап 7. */
  async record() {
    const L = this.L!, g = L.game!, db = this.env.GAME_DB; if (!db) return;
    await db.prepare("INSERT OR REPLACE INTO strat_matches (id, code, size, p0, p1, race0, race1, first, winner, reason, turns, turn_limit, map_id, xp, cfg_version, started_at, ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(this.matchId(), L.code, L.size, L.seats[0]!.pkey, L.seats[1]!.pkey, g.races[0], g.races[1], g.first, g.winner, g.reason, g.turn, g.turnLimit, L.mapId || "", this.xpAllowed() ? 1 : 0, this.cfg().version, L.created, Date.now()).run();
  }
  matchId() { const L = this.L!; return L.code + ":" + L.created; }
  /** Рейтинг (1×1 сейчас; команды/FFA — через rateMatch по местам). Гости/боты/не пул/нестандарт — без рейтинга. */
  async recordRating() {
    const L = this.L!, g = L.game!, env = this.env; if (!env.GAME_DB) return;
    const seats = L.seats as SeatS[], bots = seats.filter((s) => s?.bot).length, guests = seats.filter((s) => s && !s.bot && !s.verified).length;
    const ctx = { rated: !!L.rated, standard: L.turnMin == null && !L.devTurnMs, mapInPool: await mapInPool(env, L.map as any, L.mapStatus || (L.mapId && /^o/.test(L.mapId) ? "official" : "")),
      humans: seats.filter((s) => s && !s.bot).length, guests, bots, turns: g.turn, reason: g.reason };
    const goals = g.ec?.goals ? [g.ec.goals[0].length, g.ec.goals[1].length] : [undefined, undefined];
    const players = [0, 1].map((i) => ({ uid: seats[i].pkey, team: i, place: g.winner === 2 ? 1 : g.winner === i ? 1 : 2, goals: goals[i], actions: L.acts?.[i] || 0 }));
    L.rating = await rateFinished(env, this.matchId(), L.size, ctx, players, (goalCfg(g, this.cfg()) as any).rate);
    // опыт Полководца (косметика): активные минуты × итог × xpMul; гостям — никогда; карта не офиц./одобренная — 0
    const xp: (number | null)[] = [null, null];
    for (const i of [0, 1] as const) { const s = seats[i]; if (!s || s.bot || !s.verified || !this.xpAllowed()) continue;
      const mul = xpMul({ turns: g.turn, reason: g.reason, bots, botGamesToday: bots ? await botXpToday(env, s.pkey) : 0 });
      const res = g.winner === 2 ? "draw" : g.winner === i ? "win" : "loss";
      const got = matchXp(L.activeMs?.[i] || 0, res, mul); xp[i] = got; if (got > 0) await addXp(env, s.pkey, got, bots > 0); }
    L.rating.xp = xp;
    // монеты: только победителю рейтинговой партии
    const coins: (number | null)[] = [null, null];
    if ((L.rating as any).league) for (const i of [0, 1] as const) { const s = seats[i]; if (!s || s.bot || !s.verified || g.winner !== i) continue;
      const n = coinsFor({ league: (L.rating as any).league, rated: true, won: true, reason: g.reason, turns: g.turn, winnerGoals: goals[i] ?? 0, loserGoals: goals[1 - i] ?? 0 });
      try { coins[i] = await grantCoins(env, s.pkey, this.matchId(), n, isAbandonR(g.reason) ? "win_abandon" : "win_goals"); } catch { coins[i] = 0; } }
    (L.rating as any).coins = coins;
    // игровой профиль: строка на каждого зарегистрированного игрока
    const rows: StatRow[] = [];
    for (const i of [0, 1] as const) { const s = seats[i]; if (!s || s.bot || !s.verified) continue;
      const k = g.pieces.find((p) => p.owner === i && p.kind === "king"), ch: any = (g.ec as any)?.chief?.[i];
      rows.push({ match_id: this.matchId(), user_id: s.pkey, race: g.races[i], result: g.winner === 2 ? "draw" : g.winner === i ? "win" : "loss", rated: (L.rating as any).league ? 1 : 0,
        league: leagueOf(L.size, L.size), size: L.size, map_id: L.mapId || null, turns: g.turn, duration_ms: Date.now() - (L.st?.start || L.created),
        techs: JSON.stringify(g.ec?.techs[i] || []), chief_type: ch?.type || null, chief_level: k ? pieceLevel(k, this.cfg()) : (ch?.hist?.at(-1)?.lvl ?? null),
        chief_kills: L.st?.ck[i] || 0, talents: JSON.stringify(L.st?.tal[i] || []), ults: JSON.stringify(L.st?.ult[i] || []), created_at: Date.now() }); }
    try { await addStats(env, rows); } catch {}
    await this.save(); this.broadcast();
  }
  /** Опыт за партию (сервер решает сам): только на официальных/одобренных картах. Гостям опыт не начисляется никогда. */
  xpAllowed(): boolean { return this.L!.xpMap !== false;
  }

  // ---------- бот ----------
  botMaybe() {
    const L = this.L!; if (L.phase !== "play" || this.botTimer) return;
    const s = L.seats[L.game!.cur]; if (!s?.bot) return;
    this.botTimer = setTimeout(async () => {
      this.botTimer = null; const L2 = await this.load(); if (!L2 || L2.phase !== "play") return;
      const side = L2.game!.cur; if (!L2.seats[side]?.bot) return;
      const bs = L2.seats[side]!, err = this.doAct(side, matchBot(L2.game!, side, this.cfg(), bs.level || "medium", bs.arch || "bal"));
      if (err) this.doAct(side, { a: "end" });
      await this.save(); this.broadcast();
    }, BOT_STEP_MS);
  }

  // ---------- таймер ----------
  async rearm() {
    const L = this.L; if (!L) return;
    let t = L.touched + LOBBY_TTL_MS;
    if (L.phase === "play" && L.clock) {
      t = Math.min(t, this.deadline());
    }
    if (L.phase === "lobby" && L.seats[0]?.goneAt) t = Math.min(t, L.seats[0].goneAt + GRACE_MS);
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, t));
  }
  async alarm() {
    const L = await this.load(); if (!L) return;
    const now = Date.now();
    if (now >= L.touched + LOBBY_TTL_MS && this.ctx.getWebSockets().length === 0) { await this.ctx.storage.deleteAll(); this.L = null; return; }
    if (L.phase === "play" && L.game) {
      // обрыв связи партию не заканчивает: «Игрок не за столом», ходы пропускаются по лимиту, через 5 — «Забрать победу»
      if (L.phase === "play" && now >= this.deadline() - 20) { // время хода и запас вышли — ход передаётся сам
        const cur = L.game.cur; L.clock!.reserve[cur] = 0;
        this.doAct(cur, { a: "end" }, true);
      }
    }
    if (L.phase === "lobby" && L.seats[0]?.goneAt && now >= L.seats[0].goneAt + GRACE_MS) { L.seats[0] = L.seats[1]?.bot ? null : L.seats[1]; L.seats[1] = null; }
    await this.save(); this.broadcast();
  }

  // ---------- рассылка ----------
  broadcast() {
    const L = this.L; if (!L) return;
    const ev = this.lastEv; this.lastEv = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Att; if (!a?.pkey) continue;
      this.send(ws, this.stateFor(this.seatOf(a.pkey), ev));
    }
    this.codexTick(ev);
  }
  // ---------- Библиотека (F): открытия при первой встрече; в D1 — только проверенные игроки, не боты, user_id — из сессии места ----------
  cx: [Set<string>, Set<string>] = [new Set(), new Set()];
  codexTick(ev: Ev[]) {
    const L = this.L, g = L?.game; if (!L || !g) return;
    for (const side of [0, 1] as const) { const s = L.seats[side]; if (!s || s.bot) continue;
      try { const seen = codexSeen(g, side, this.cfg(), ev as any[]), fresh = [...seen].filter((k) => !this.cx[side].has(k)); if (!fresh.length) continue;
        const items = codexPick(this.cfg(), fresh); let n = 0;
        for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment() as Att; if (a?.pkey === s.pkey) { this.send(ws, { type: "codex", items }); n++; } }
        const db = (this.env as any).GAME_DB, real = s.verified && !!db && !!s.pkey && !String(s.pkey).startsWith("guest:");
        if (n || real) fresh.forEach((k) => this.cx[side].add(k)); // гость без сокета — пришлём при возвращении
        if (real && items.length) { const now = Date.now();
          const st = db.prepare("INSERT OR IGNORE INTO strat_codex (user_id, kind, item_id, first_at) VALUES (?, ?, ?, ?)");
          void db.batch(items.map((e) => { const i = e.k.indexOf(":"); return st.bind(s.pkey, e.k.slice(0, i), e.k.slice(i + 1), now); })).catch(() => {}); }
      } catch {} }
  }
  stateFor(seat: number, ev: Ev[]) {
    const L = this.L!;
    const hideRace = L.phase === "lobby"; // выбор вслепую: чужую расу не видно до старта
    const seats = L.seats.map((s, i) => s && { nick: s.nick, guest: !s.verified && !s.bot, bot: !!s.bot, ready: s.ready, picked: !!s.race,
      race: hideRace && i !== seat ? null : s.race, online: !s.goneAt, rematch: !!(s as any).rematch,
      botLv: s.bot ? s.level || "medium" : undefined, away: L.phase === "play" && s.goneAt != null, skips: L.skips?.[i] || 0, col: typeof s.col === "number" ? s.col : undefined });
    const D = L.draw, raceDraw = this.drawOn() && D ? { commit: D.commit, ...(D.rolls && L.phase !== "lobby" ? { seed: D.seed, rolls: rollsFor(D.rolls, seat), order: D.order, w: D.w } : {}) } : null; // seed — только после старта; чужие любимые расы не уходят (t1175)
    const out: any = { type: "st", raceDraw, code: L.code, phase: L.phase, size: L.size, pub: L.pub, rated: !!L.rated, ranked: !!L.rated, hiddenHp: !!L.hiddenHp, mode: "1v1", maxSeats: 2, turnSec: L.turnMin != null ? L.turnMin * 60 : null, rating: this.ratingView(), turnLimit: L.game?.turnLimit ?? null, you: seat, seats, ev, now: Date.now(),
      mapInfo: { id: L.mapId || "", name: L.mapName || "", status: L.mapStatus || "official", xp: L.xpMap !== false } };
    if (L.phase === "lobby" && L.map) out.lobbyMap = L.map; // предпросмотр
    if (L.game) {
      const g = L.game; out.g = view(g, true, this.cfg()); const pp = publicPatch(L.cfgPatch); if (pp) out.cfgPatch = pp; // без деревьев
      if (seat === 0 || seat === 1) out.tree = treeView(g, seat, this.cfg()); // своё дерево, урезанное (ТЗ §14.F); зрителю — нет
      if (g.ec) { out.blacklist = chiefBlacklist(g, seat === 1 ? 1 : 0);
        // форма клиента UI-воркера: ec.firstChief[side] = { dead, turn, by (место убийцы), name }
        if (out.g?.ec) out.g.ec = { ...out.g.ec, firstChief: [0, 1].map((o) => { const r = chiefBlacklist(g, 1 - o)[0]; return r ? { dead: !r.alive, turn: r.turn, by: r.alive ? null : 1 - o, byKind: r.killedBy, name: r.name, type: r.type } : null; }) }; } // копия: g.ec не трогаем // «чёрный список» первых Вождей соперников: имя/тип/статус, без координат
      out.check = [inCheck(g, 0), inCheck(g, 1)]; out.ev = redactX(out.ev, seat, L.phase === "over"); // t1156: чужие технологии/таланты в разборе удара — «скрытые бонусы»
      if (this.R && L.rid === this.R.id) out.replay = { id: L.rid, n: this.R.acts.length }; // для «Предыдущие ходы» / ссылки на повтор
      if (g.ec) { const C = this.cfg(); out.goals = [goalDetails(g, 0, C), goalDetails(g, 1, C)]; // t1135: описание + живой прогресс целей для подсказок
        if (seat === 0 || seat === 1) out.terr = terrView(g, seat, C); // t1140–t1143: своё окно покупки, канал поселения, скрытая расовая ОД (только себе)
        out.towers = (g.ec.towers || []).map((t: any) => ({ ...t })); { const lid = leagueOf(g.size) || "tactical"; out.league = { id: lid, ...(C.econ as any).league[lid] }; }
        out.bhp = g.ec.cities.map((c) => ({ city: c.id, b: c.bld.map((b) => ({ b, hp: c.bhp?.[b] ?? bldMaxHp(g, c, b, C), max: bldMaxHp(g, c, b, C) })), ruin: c.ruin || [] })); } // t1136
      if (L.hiddenHp) { setTowerMax(((this.cfg().econ as any).tower?.hp) || 16); const R = redactHp(out.g, out.ev, out.bhp, seat === 0 || seat === 1 ? seat : -1); out.g = R.g; out.ev = R.ev; if (out.bhp) out.bhp = R.bhp; }
      if (L.clock && L.phase === "play") out.clock = { deadline: this.deadline(), turnEnds: L.clock.turnStart + this.turnMs(), turnMs: this.turnMs(), reserve: L.clock.reserve };
      if (L.phase === "play") { const sk = L.skips || [0, 0]; out.away = [0, 1].map((i) => ({ away: L.seats[i]?.goneAt != null, label: L.seats[i]?.goneAt != null ? "Игрок не за столом" : "", skips: sk[i] }));
        out.canClaim = (seat === 0 || seat === 1) && !!L.seats[1 - seat] && !L.seats[1 - seat]!.bot && canClaim(L.seats[1 - seat]!.goneAt != null, sk[1 - seat]); out.turnMin = this.turnMs() / 60000; }
    }
    if (L.result) { out.result = { ...L.result }; const R = this.ratingView(); // клиент UI: result.rating[side] = {league, before, after, delta}
      if (R?.league) out.result.rating = Object.fromEntries(R.seats.map((x: any, i: number) => [i, x.delta == null ? null : { league: ({ quick: "fast", normal: "normal", tactical: "tactic" } as any)[R.league], before: x.rating - x.delta, after: x.rating, delta: x.delta, xp: x.xp, coins: x.coins }])); }
    return out;
  }
}

function parseAct(a: any): Action | null {
  if (!a || typeof a !== "object") return null;
  if (a.a === "end") return { a: "end" };
  const int = (v: any) => Number.isInteger(v) && v >= 0 && v < 128; // до 100×100
  if ((a.a === "move" || a.a === "attack") && Number.isInteger(a.id) && int(a.x) && int(a.y)) {
    const o: any = { a: a.a, id: a.id, x: a.x, y: a.y };
    if (a.a === "move" && ["knight", "mage", "rook"].includes(a.promo)) o.promo = a.promo as Kind;
    return o;
  }
  if (a.a === "ult") return Number.isInteger(a.id) && int(a.x) && int(a.y) ? { a: "ult", id: a.id, x: a.x, y: a.y } as any : null; // t1223: ульты Вождя и фигур — раньше не проходили разбор → bad_action
  if (a.a === "raze") return Number.isInteger(a.id) && Number.isInteger(a.city) && a.city >= 0 && typeof a.b === "string" && /^[a-z0-9_]{1,16}$/.test(a.b) ? { a: "raze", id: a.id, city: a.city, b: a.b } as any : null; // t1136
  return parseEcon(a);
}
/** Экономика (этап 2): только целые id/координаты и строки из белого списка; остальное проверяет движок. */
function parseEcon(a: any): Action | null {
  if (!ECON_ACTS.includes(a.a)) return null;
  const id = (v: any) => Number.isInteger(v) && v >= 0 && v < 1e6, int = (v: any) => Number.isInteger(v) && v >= 0 && v < 64;
  const word = (v: any) => typeof v === "string" && /^[a-z0-9_]{1,16}$/.test(v);
  const KINDS = ["pawn", "knight", "mage", "rook", "hero"];
  switch (a.a) {
    case "recruit": return id(a.city) && KINDS.includes(a.kind) && int(a.x) && int(a.y) ? { a: "recruit", city: a.city, kind: a.kind, x: a.x, y: a.y } : null;
    case "build": return word(a.b) && (a.city == null || id(a.city)) && (a.id == null || id(a.id)) && (a.x == null || int(a.x)) && (a.y == null || int(a.y)) ? { a: "build", b: a.b, ...(a.x != null && a.y != null ? { x: a.x, y: a.y } : {}), ...(a.city != null ? { city: a.city } : {}), ...(a.id != null ? { id: a.id } : {}), ...(KINDS.includes(a.kind) ? { kind: a.kind } : {}) } as any : null;
    case "repair": return id(a.city) && word(a.b) ? { a: "repair", city: a.city, b: a.b } as any : null;
    case "research": return word(a.t) ? { a: "research", t: a.t } : null;
    case "era": return { a: "era" };
    case "claim": return id(a.city) && int(a.x) && int(a.y) ? { a: "claim", city: a.city, x: a.x, y: a.y } as any : null; // t1140: покупка клетки
    case "found_cancel": return { a: "found_cancel" } as any;
    case "talent": return id(a.id) && word(a.t) ? { a: "talent", id: a.id, t: a.t } : null;
    case "found": return id(a.id) ? { a: "found", id: a.id } : null;
    case "swap": return id(a.city) && Number.isInteger(a.n) && a.n >= 0 && a.n < 8 ? { a: "swap", city: a.city, n: a.n } : null;
    case "trade": { // 2×2: союзный обмен (крюк; в 1×1 движок ответит no_ally)
      const res = (o: any) => { const r: any = {}; if (!o || typeof o !== "object") return r; for (const k of ["gold", "know"]) if (Number.isInteger(o[k]) && o[k] > 0 && o[k] < 1000) r[k] = o[k]; return r; };
      return Number.isInteger(a.to) && a.to >= 0 && a.to < 4 ? { a: "trade", to: a.to, give: res(a.give), get: res(a.get) } : null;
    }
  }
  return null;
}

/** t1140–t1143: что видит своя сторона о земле: по каждому своему городу — таймер роста, окно «Можно купить клетку» (осталось ходов до бесплатного автоприсоединения), цена и клетки; канал поселения; живые числа расовой ОД для подсказки. */
export function terrView(g: any, side: 0 | 1, C: any) {
  const cities = g.ec.cities.filter((c: any) => c.owner === side).map((c: any) => {
    const every = growEvery(g, c, C), ready = (c.claims || 0) > 0;
    return { city: c.id, every, tg: c.tg || 0, ready, left: ready ? c.cw ?? null : null, cost: ready ? claimCost(g, c, C) : null, cells: ready ? claimCells(g, c, C).map((i: number) => [i % g.size, (i / g.size) | 0]) : [] };
  });
  return { cities, fnd: g.ec.fnd?.[side] || null, ap: apFor(g, side, C), raceAp: raceAp(g, side, C) };
}
