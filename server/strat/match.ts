// StratMatch — отдельный Durable Object на каждое лобби/партию «Партии Чёрных королей» (idFromName(код)).
// Не связан с GameRoom: партии не делят процессор и очередь с миром MorrisCurse и друг с другом.
// Hibernatable WebSocket (DO спит, пока игрок думает) + alarm() для таймера хода и возврата после обрыва.
import { DurableObject } from "cloudflare:workers";
import { admitMessage, originAllowed, isLocalRequest, isDevRequest, MSG_BURST } from "../limits";
import { identify, type Ident } from "./ident";
import { resolveLobbyMap, isStratAdmin, countPlay } from "./maps";
import { isMapSize, mapFits } from "./terrain";
import { MODES, isMode, teamsFor, teamOf, isOut, isDraw, seatWon, alliesOf, type ModeId } from "./seats";
import { showcaseAll } from "./showcase";
import { type MapData } from "./terrain";
import { newGame, makeMap, apply, view, botAction, inCheck, RACES, SIZES, STRAT_CFG, type GameState, type Race, type Action, type Ev, type Kind, type StratCfg } from "./rules";
import { loadStratCfg } from "./cfg";
import { ECON_ACTS, talentOpts, goalDetails, bldMaxHp, growEvery, claimCost, claimCells, raceAp, apFor } from "./econ";
import { redactHp, setTowerMax } from "./hidehp";
import { startLog, logAct, logEnd, moveList, FrameCache, redactX, type RLog } from "./replay";
import { putReplay, pruneReplays, replayCfg, revealFrame } from "./replay-db";
import { drawRaces, newSeed, commitOf, cleanFav, rollsFor } from "./racedraw";
import { treeView, publicPatch, hiddenTarget } from "./tree-view";
import { parseAct } from "./parse-act";
import { RATING_CFG, xpMul, earlyMul } from "./rating";
import { matchBot, BOT_LEVELS, TACTIC_IDS, type BotLevel } from "./ai";
import { chiefBlacklist, goalCfg, territory } from "./econ";
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
type Clock = { turnStart: number; reserve: number[] };
type L = {
  rid?: string; rn?: number; rlast?: number; // t1156: id повтора (код:старт), число кусков лога в storage, время последней записи в D1
  code: string; created: number; touched: number; size: number; pub: boolean;
  mapId?: string; mapName?: string; mapStatus?: string; xpMap?: boolean; // выбранная карта; xpMap=false — неодобренная карта (без опыта)
  map?: MapData; // предпросмотр в лобби и рельеф партии
  hiddenHp?: boolean; // «Скрытое здоровье»: точные ОЗ чужих фигур/построек не отдаются (в рейтинговой — выкл.)
  turnLimit?: number | null; // null/нет = по умолчанию для размера; 0 = без лимита; иначе TURN_LIMIT.min..max
  mode?: ModeId; // t1219: режим (нет = 1×1); места: 2×2 — [A1,B1,A2,B2], «Все» — по кругу
  phase: "lobby" | "play" | "over"; seats: (SeatS | null)[];
  game: GameState | null; clock: Clock | null; result?: { winner: number; reason: string };
  cfgPatch?: any; // правка админки (маленькая) — уходит клиенту, чтобы подсказки совпадали с сервером
  cfg?: StratCfg; // снимок правил (STRAT_CFG + правки админки) на момент старта партии
  st?: { start: number; ck: number[]; tal: string[][]; ult: string[][]; kl?: number[]; ls?: number[]; gi?: number[]; go?: number[] }; // для профиля (stats.ts); t1236: убито/потеряно фигур, золото получено/потрачено (по местам, до 8)
  mid?: string; // t1236: id партии (код:старт) — у каждого реванша свой (раньше код:создание лобби, и реванш затирал строки прошлой партии)
  sum?: any; // t1236: «Итоги партии» — считаются один раз на сервере в finish/recordRating
  chat?: ChatMsg[]; chatId?: number; mutes?: Record<string, string[]>; reports?: { at: number; by: string; msg: number; who: string; text: string }[];
  turnMin?: number | null; skips?: number[]; // лимит хода хоста (мин; null — по размеру) и подряд авто-пропусков (away.ts)
  activeMs?: number[]; // активное время своих ходов (для опыта Полководца; авто-пропуск = 0)
  rated?: boolean; // «Рейтинговая»: стандартные настройки; рейтинг — только на карте из пула (rating.ts)
  acts?: number[]; // действия игроков за партию (проигравший без действий → победителю ×0,25)
  rating?: any; // итог рейтинга для окна конца партии: {league, changes} или {unrated}
  draw?: { seed: string; commit: string; rolls?: any[]; order?: number[]; w?: [number, number] }; // t1144: рейтинговый жребий рас (seed скрыт до старта, commit — публично)
  devTurnMs?: number; // только локальные плейтесты (MC_DEV_TRUST_USERID=1 + localhost): короткий таймер хода без запаса
};
type Att = { pkey?: string; nick?: string; verified?: boolean; url: string; tk: number; at: number; st: number };

const TLOG_A = new Set(["move", "attack", "ability", "ult", "build", "raze", "tower", "claim", "recruit"]);
export class StratMatch extends DurableObject {
  env: any; L: L | null = null; loaded = false; botTimer: any = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }

  async load(): Promise<L | null> { if (!this.loaded) { this.L = (await this.ctx.storage.get("L")) || null; this.loaded = true; await this.rload();
      const L = this.L; if (L?.phase === "over" && L.mid && L.game && L.result && !L.rating && this.env.GAME_DB) { const q = this.recordRating(L.mid).catch(() => {}); this.ctx.waitUntil?.(q); } } // t1236: DO выгрузился до записи рейтинга — досчитать (recordRating идемпотентен)
    return this.L; }
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
  // 2×2/«Все»: в строке D1 — первые два места (A1, B1); все места — в логе (races/mode)
  async rdb(status: "live" | "over") { const L = this.L, R = this.R, db = this.env.GAME_DB; if (!L || !R || !db || L.rid !== R.id) return;
    const C = this.cfg(), g = L.game!, S = L.seats; L.rlast = Date.now();
    try { await putReplay(db, { log: R, status, uids: [S[0]?.pkey || "", S[1]?.pkey || ""], nicks: [S[0]?.nick || "", S[1]?.nick || ""], winner: g.winner, reason: g.reason || null, turns: g.turn, rated: !!L.rated, mapId: L.mapId || null }, C);
      if (status === "over") await pruneReplays(db, C); } catch {} }
  lastReport = "";
  /** Сводка лобби → StratIndex (список «Ждут соперника»); только при изменении. */
  report() {
    const L = this.L; if (!L || !this.env.STRAT_INDEX) return;
    const sum = { code: L.code, pub: L.pub && L.xpMap !== false, map: L.mapName || "", phase: L.phase, size: L.size, mode: L.mode || "1v1", max: L.seats.length, host: L.seats[0]?.nick || "", n: L.seats.filter(Boolean).length,
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
    if (url.hostname === "internal" && url.pathname === "/phase") { // t1231: только из StratIndex — «незавершённая ли партия» для карточки «Продолжить»
      const L = await this.load(); if (!L) return new Response("gone", { status: 404 }); return Response.json({ phase: L.phase }); }
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
  seatOf(pkey: string | undefined): number { return !pkey || pkey === "bot" ? -1 : this.L!.seats.findIndex((x) => x?.pkey === pkey && !x.bot); }
  mode(): ModeId { return this.L?.mode || "1v1"; }
  multi() { return this.mode() !== "1v1"; }
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
    if (L.phase === "lobby" && seat > 0) L.seats[seat] = null; // гость лобби ушёл — место свободно
    else s.goneAt = Date.now();
    await this.save(); this.broadcast();
  }

  async join(id: Ident) {
    const L = this.L!;
    let seat = this.seatOf(id.pkey);
    if (seat >= 0) { L.seats[seat]!.goneAt = null; L.seats[seat]!.nick = id.nick; } // переподключение
    else if (L.phase === "lobby") {
      const free = L.seats.findIndex((x) => !x); // t1219: первое свободное место (боты места занимают)
      if (free >= 0) { L.seats[free] = { pkey: id.pkey, nick: id.nick, verified: id.verified, race: null, ready: false, goneAt: null }; seat = free; }
    }
    await this.save(); this.broadcast();
  }

  /** итог рейтинга по местам (без user_id наружу): league/unrated, [{rating, delta, xp, coins}] */
  ratingView() { const R: any = this.L!.rating; if (!R) return null;
    return { league: R.league || null, unrated: R.unrated || null, seats: L0seats(this.L!).map((i) => { const pk = this.L!.seats[i]?.pkey, c = pk ? R.changes?.[pk] : null;
      return { rating: c?.rating ?? null, delta: c?.delta ?? null, xp: R.xp?.[i] ?? null, coins: R.coins?.[i] ?? null, before: c?.before ?? (c ? c.rating - c.delta : null), bd: c?.bd ?? null,
        place: c?.place ?? null, total: c?.total ?? null, left: c?.left ?? null, xpd: R.xpd?.[i] ?? null }; }) }; }
  // ---------- чат (chat.ts) ----------
  chatRate = new Map<string, number[]>();
  team(s: number) { const g = this.L?.game; return g ? teamOf(g, s) : teamsFor(this.mode())[s] ?? s; } // команда места (1×1/«Все» — само место)
  async chatMsg(ws: WebSocket, a: Att, seat: number, m: any): Promise<string> {
    const L = this.L!, pk = a.pkey!;
    // форма клиента UI-воркера: { ch: "all"|"team"|"w", to?: ник } → наш { to: "all"|"team"|место }
    if (m.type === "chat" && typeof m.ch === "string") m.to = m.ch === "w" ? L.seats.findIndex((x) => x?.nick === m.to) : m.ch;
    if (m.type === "chat_report" && m.id == null && typeof m.text === "string") { const f = [...(L.chat || [])].reverse().find((x) => x.text === m.text && (!m.user || L.seats[x.from]?.nick === m.user)); if (f) m.id = f.id; }
    if (m.type === "chat_hist") { this.send(ws, { type: "chat_hist", list: this.chatFor(seat, pk) }); return ""; }
    if (seat < 0) return "spectator"; // зрители читают «всем», но не пишут
    if (m.type === "chat_mute") { const mu = ((L.mutes ||= {})[pk] ||= []); const who = String(m.who ?? ""); const i = mu.indexOf(who);
      if (m.on === false) { if (i >= 0) mu.splice(i, 1); } else if (i < 0 && mu.length < 16 && /^[0-7]$/.test(who)) mu.push(who); await this.save(); this.send(ws, { type: "chat_mute_r", mutes: mu }); return ""; }
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
  async handle(seat: number, pkey: string, m: any): Promise<string> {
    const L = this.L!;
    if (seat < 0) return "spectator";
    const me = L.seats[seat]!;
    switch (m.type) {
      case "cfg": {
        if (seat !== 0) return "not_host"; if (L.phase !== "lobby") return "bad_phase";
        if (m.mode === "ffa" && typeof m.seats === "number") m.mode = "ffa" + m.seats; // клиентские вкладки «Все ×N»
        if (m.mode !== undefined && m.mode !== this.mode()) { if (!isMode(m.mode)) return "bad_mode"; this.setMode(m.mode); } // t1219: вкладки режимов лобби
        if (m.size !== undefined) { if (!SIZES.includes(m.size) && !isMapSize(m.size)) return "bad_size"; /* t1217: 4…100 (случайная карта или карта игрока) */ if (m.size !== L.size) { if (this.multi() && m.map === undefined) { const d = this.modeMap(this.mode(), m.size); if (!d) return "no_mode_map"; L.size = m.size; this.setMap({ map: d, xp: true, status: "approved" }); } else { L.size = m.size; this.setMap(null); } } }
        if (m.map !== undefined) { const e = await this.pickMap(String(m.map).slice(0, 24), pkey); if (e) return e; }
        if (m.pub !== undefined) L.pub = !!m.pub;
        if (m.ranked !== undefined && m.rated === undefined) m.rated = m.ranked; // имя поля у клиента UI-воркера
        if (m.turnSec !== undefined && m.turnMin === undefined) m.turnMin = m.turnSec == null ? null : Math.round(+m.turnSec / 60);
        if (m.rated && L.xpMap === false) return "map_unrated"; // неодобренная карта: без опыта и рейтинга для всех (t1218)
        if (m.rated !== undefined) { L.rated = !!m.rated; if (L.rated) { L.turnMin = null; L.hiddenHp = false; for (const s of L.seats) if (s && !s.bot) { s.race = null; s.ready = false; } await this.ensureDraw(); } } // «Рейтинговая» форсирует стандарт; раса — жребием
        if (m.turnMin !== undefined) { const t = validTurnMin(m.turnMin); if (t === undefined) return "bad_turn_min"; if (L.rated && t !== null) return "rated_fixed"; L.turnMin = t; }
        if (m.hiddenHp !== undefined) { if (L.rated && m.hiddenHp) return "rated_fixed"; L.hiddenHp = !!m.hiddenHp; }
        if (m.turnLimit !== undefined && m.turnLimit !== null && m.turnLimit !== 0) return "no_turn_limit"; // t1135: лимита ходов нет; null/0 — совместимость со старым клиентом
        for (const s of L.seats) if (s && !s.bot) s.ready = false; // настройки поменялись — «Готов» сбрасывается
        break;
      }
      case "bot": {
        if (m.lv !== undefined && m.level === undefined) m.level = m.lv;
        if (seat !== 0) return "not_host"; if (L.phase !== "lobby") return "bad_phase"; // t1219: ботов добавляет только хост, в любое пустое место
        const slot = m.slot === undefined ? (m.on ? L.seats.findIndex((x, i) => i > 0 && (!x || x.bot)) : L.seats.map((x, i) => (x?.bot ? i : -1)).filter((i) => i > 0).pop() ?? -1) : m.slot;
        if (!Number.isInteger(slot) || slot < 1 || slot >= L.seats.length) return "bad_slot";
        if (m.on) { if (L.seats[slot] && !L.seats[slot]!.bot) return "seat_taken"; L.seats[slot] = { pkey: "bot", nick: "Бот · " + ((BOT_LEVELS as any)[m.level]?.name || "Средний"), verified: false, race: RACES[Math.floor(Math.random() * RACES.length)], ready: true, bot: true, level: (BOT_LEVELS as any)[m.level] ? m.level : "medium", arch: TACTIC_IDS[Math.floor(Math.random() * TACTIC_IDS.length)], goneAt: null }; }
        else if (L.seats[slot]?.bot) L.seats[slot] = null;
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
        if (L.seats.every((x) => x?.ready)) await this.start(); // все места заняты и «Готов»
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
        this.surrender(seat, "forfeit"); break;
      }
      case "claim_away": case "claim": {
        if (L.phase !== "play") return "bad_phase";
        if (this.multi()) return "cant_claim"; // 2×2/«Все»: ушедший выбывает сам (alarm: econ.team.awayOutSkips)
        const opp = 1 - seat, os = L.seats[opp];
        if (!os || os.bot || !canClaim(os.goneAt != null, L.skips?.[opp] || 0)) return "cant_claim";
        this.finish(seat, "claim"); break;
      }
      case "rematch": {
        if (L.phase !== "over") return "bad_phase";
        (me as any).rematch = true;
        if (L.seats.every((s) => s && (s.bot || (s as any).rematch))) {
          for (const s of L.seats) if (s) { (s as any).rematch = false; s.ready = !!s.bot; if (!s.bot) s.race = null; }
          L.phase = "lobby"; L.game = null; L.clock = null; L.result = undefined; L.cfg = undefined; L.cfgPatch = undefined; L.draw = undefined; L.rating = undefined; L.sum = undefined; (L as any).tlog = undefined; await this.ensureDraw(); // t1236: итог прошлой партии не протекает в реванш
        }
        break;
      }
      case "leave": {
        if (L.phase === "play" && !isOut(L.game!, seat)) this.surrender(seat, "forfeit");
        if (L.phase === "lobby") { if (seat > 0) L.seats[seat] = null; else this.hostGone(); } // хост ушёл — хостом становится следующий человек
        for (const w of this.socketsOf(pkey)) { this.send(w, { type: "left" }); try { w.close(1000, "leave"); } catch {} }
        break;
      }
      case "trade_reply": { // t1219: 2×2 — ответ союзника на обмен (вне очереди)
        if (L.phase !== "play" || !L.game) return "bad_phase"; if (!Number.isInteger(m.id)) return "bad_action";
        const r = this.doAct(seat, { a: "trade_reply", id: m.id, ok: !!(m.accept ?? m.ok) }); if (r) return r; break;
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
  /** t1219: встроенная карта режима (Лорендес) — нужного размера, иначе первая подходящая */
  modeMap(md: ModeId, size?: number): MapData | null { const all = showcaseAll().filter((m) => mapFits(m, md)).sort((x, y) => +(y.mode === md) - +(x.mode === md)); /* своя карта режима — первой (4 места годятся и 2×2, и ×4) */ return (size ? all.find((m) => m.size === size) : all[0]) || null; }
  /** t1219: смена режима в лобби: места перекладываются по порядку (лишние — в зрители), карта — подходящая режиму */
  setMode(md: ModeId) {
    const L = this.L!, n = MODES[md].seats, old = L.seats.filter(Boolean) as SeatS[];
    L.mode = md === "1v1" ? undefined : md; L.seats = Array.from({ length: n }, (_, i) => old[i] || null);
    for (const s of L.seats) if (s && !s.bot) s.ready = false;
    if (md === "1v1") { if (!L.map || !mapFits(L.map, "1v1")) { if (!SIZES.includes(L.size)) L.size = 15; this.setMap(null); } return; }
    if (L.map && mapFits(L.map, md)) return;
    const d = this.modeMap(md, L.size) || this.modeMap(md)!; L.size = d.size; this.setMap({ map: d, xp: true, status: "approved" });
  }
  /** лобби: хост ушёл — хостом становится следующий человек (боты без хоста не остаются) */
  hostGone() { const L = this.L!, h = L.seats.slice(1).find((x) => x && !x.bot) || null;
    L.seats = L.seats.map((x, i) => (i === 0 ? h : x === h ? null : x)); if (!h) L.seats = L.seats.map(() => null); }
  /** сдача/уход: 1×1 — поражение; 2×2 — фигуры союзнику; «Все» — место снимается (econ.team). Через apply — повтор восстановит. */
  surrender(seat: number, why: "forfeit" | "away") { const L = this.L!, g = L.game; if (!g || L.phase !== "play") return;
    if (!this.multi()) { this.finish(1 - seat, why === "away" ? "claim" : "forfeit"); return; }
    this.doAct(seat, { a: "surrender", why }); }
  async hostAdmin(): Promise<boolean> { const h = this.L!.seats[0]; return !!h && !h.bot && (await isStratAdmin(this.env, h.pkey, !!h.verified).catch(() => false)); }
  async pickMap(id: string, hostPkey: string): Promise<string> {
    const L = this.L!, own = /^[usm]/.test(id); // карта игрока/витрина задаёт размер поля сама
    const r = await resolveLobbyMap(this.env, id, own ? 0 : L.size, hostPkey, own && (await this.hostAdmin()), this.mode());
    if (r.err || !r.map) return r.err || "bad_map";
    if (own) L.size = r.map.size;
    this.setMap({ map: r.map, xp: r.xp, status: r.status });
    if (!r.xp) L.rated = false; // на неодобренной — ни опыта, ни рейтинга (ни автору, ни приглашённым)
    return "";
  }
  async start() {
    const L = this.L!;
    const md = this.mode(), dflt = () => { if (md === "1v1") this.setMap(null); else { const d = this.modeMap(md, L.size) || this.modeMap(md)!; L.size = d.size; this.setMap({ map: d, xp: true, status: "approved" }); } };
    if (!L.map || L.map.size !== L.size || !mapFits(L.map, md)) dflt();
    if (L.mapId && /^[usm]/.test(L.mapId)) { // статус могли поменять в админке, пока ждали соперника
      const r = await resolveLobbyMap(this.env, L.mapId, L.size, L.seats[0]!.pkey, await this.hostAdmin(), md);
      if (r.err || !r.map) dflt(); else this.setMap({ map: r.map, xp: r.xp, status: r.status });
      if (L.xpMap === false) L.rated = false;
    }
    L.mid = L.code + ":" + Date.now(); L.rating = undefined; L.sum = undefined; // t1236: новая партия — новый id (жребий, рейтинг, монеты, профиль) и чистые итоги
    const N = L.seats.length, rnd = crypto.getRandomValues(new Uint8Array(1))[0];
    const first = md === "2v2" ? rnd & 1 : rnd % N; // кто ходит первым — случайно (2×2: первая команда; порядок A1→B1→A2→B2 — от места)
    { const c = await loadStratCfg(this.env, true); L.cfg = c.cfg; L.cfgPatch = c.patch && Object.keys(c.patch).length ? c.patch : undefined; }
    if (this.drawOn()) await this.runDraw(); // t1144: рейтинговая — расы жребием, всем сразу (одним st после старта)
    if (L.phase !== "lobby" || !L.seats.every((s) => s?.race && s.ready)) { for (const s of L.seats) if (s && !s.bot) s.ready = false; return; } // пока ждали конфиг, место освободилось
    L.game = newGame(L.size, L.seats.map((s) => s!.race!), first, L.cfg, 0, L.map, md === "1v1" ? undefined : { mode: md });
    const z = () => L.seats.map(() => 0);
    L.clock = { turnStart: Date.now(), reserve: z() }; L.skips = z(); L.acts = z(); // запаса больше нет: только лимит хода
    L.st = { start: Date.now(), ck: z(), tal: L.seats.map(() => []), ult: L.seats.map(() => []), kl: z(), ls: z(), gi: z(), go: z() }; L.activeMs = z(); this.cx = L.seats.map(() => new Set());
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
    const tms = teamsFor(this.mode()), seats = L.seats.map((_, i) => ({ fav: favs[i], team: tms[i] ?? i })); // 1×1/FFA: каждый — своя команда (2×2: team из места)
    const r = await drawRaces(D.seed, seats, RD); L.seats.forEach((s, i) => { if (s) s.race = r.races[i]; });
    D.rolls = r.rolls; D.order = r.order; D.w = [RD.fav ?? 85, RD.other ?? 15];
    if (this.env.GAME_DB) try { await this.env.GAME_DB.prepare("INSERT OR REPLACE INTO strat_race_draws (match_id, commit_hash, seed, seats, races, created_at) VALUES (?,?,?,?,?,?)")
      .bind(this.matchId(), D.commit, D.seed, JSON.stringify(seats), JSON.stringify(r.races), Date.now()).run(); } catch {}
  }

  doAct(seat: number, act: Action, auto = false): string {
    const L = this.L!, g = L.game!, prevCur = g.cur;
    const hid = hiddenTarget(g, seat, act, this.cfg()); if (hid) return hid; // скрытый узел дерева — как несуществующий
    const kingId = g.pieces.find((p) => p.owner === seat && p.kind === "king")?.id;
    const gold0 = g.ec ? g.ec.res.map((r) => r.gold) : null;
    const A0: any = act, P0 = A0.id != null ? g.pieces.find((p) => p.id === A0.id && p.owner === seat) : null, f0 = P0 ? [P0.x, P0.y] : null, ap0 = g.ap, t0 = g.turn;
    const r = apply(g, seat, act, this.cfg()); if (!r.ok) return r.err;
    if (TLOG_A.has(act.a) && (A0.x != null || f0)) { // t1221: «мои ходы за этот ход» — путь, цель, действие, потраченные ОД; хранится по месту, отдаётся только владельцу
      const T = ((L as any).tlog ||= []); if (!T[seat] || T[seat].turn !== t0) T[seat] = { turn: t0, items: [] };
      const P1 = P0 ? g.pieces.find((p) => p.id === P0.id) : null;
      T[seat].items.push({ a: act.a, id: A0.id ?? null, k: P0?.kind ?? null, fx: f0?.[0] ?? null, fy: f0?.[1] ?? null, x: A0.x ?? P1?.x ?? f0?.[0], y: A0.y ?? P1?.y ?? f0?.[1], ap: g.cur === prevCur && g.turn === t0 ? Math.max(0, ap0 - g.ap) : ap0 > 0 ? ap0 : null });
      if (T[seat].items.length > 40) T[seat].items.shift(); }
    if (L.st) { const S = L.st, z = () => L.seats.map(() => 0); S.kl ||= z(); S.ls ||= z(); S.gi ||= z(); S.go ||= z();
      for (const e of r.ev as any[]) { if (e.e === "kill" && kingId && e.by === kingId) S.ck[seat]++; if (e.e === "ult" && Number.isInteger(e.side) && S.ult[e.side]) S.ult[e.side].push(String(e.ult));
        if (e.e === "kill" && Number.isInteger(e.o) && e.o >= 0 && e.o < L.seats.length) { const kp = g.pieces.find((q) => q.id === e.by), ko = kp ? kp.owner : seat; S.ls[e.o] = (S.ls[e.o] || 0) + 1; if (ko !== e.o) S.kl[ko] = (S.kl[ko] || 0) + 1; } }
      if (gold0 && g.ec) gold0.forEach((v0, i) => { const d = g.ec!.res[i].gold - v0; if (d > 0) S.gi[i] = (S.gi[i] || 0) + d; else if (d < 0) S.go[i] = (S.go[i] || 0) - d; });
      if (act.a === "talent") { const p = g.pieces.find((q) => q.id === (act as any).id); const t = p?.tal?.[p.tal.length - 1]; if (t) L.st.tal[seat].push(t); } }
    if (this.R && L.rid === this.R.id) logAct(this.R, seat, act, auto, g, g.cur !== prevCur);
    this.lastEv = r.ev; if (act.a !== "end" && act.a !== "trade_reply" && act.a !== "surrender") { const A = (L.acts ||= L.seats.map(() => 0)); A[seat] = (A[seat] || 0) + 1; }
    const SK = (L.skips ||= L.seats.map(() => 0)); if (!auto) { if (act.a !== "surrender") SK[seat] = 0; } else if (g.cur !== prevCur) SK[prevCur] = (SK[prevCur] || 0) + 1;
    if (g.cur !== prevCur || g.winner !== -1) this.turnPassed(prevCur, auto);
    if (g.winner !== -1) this.finish(g.winner, g.reason);
    this.botMaybe();
    return "";
  }
  /** Ход сменился: списать перерасход из запаса, запустить часы следующего. */
  turnPassed(prev: number, auto = false) {
    const c = this.L!.clock!;
    if (!auto) { const A = (this.L!.activeMs ||= this.L!.seats.map(() => 0)); A[prev] += Math.max(0, Math.min(Date.now() - c.turnStart, this.turnMs())); }
    const over = Date.now() - c.turnStart - this.turnMs();
    if (over > 0) c.reserve[prev] = Math.max(0, c.reserve[prev] - over);
    c.turnStart = Date.now();
    const L = this.L!; if (this.R && L.phase === "play" && Date.now() - (L.rlast || 0) >= replayCfg(this.cfg()).rollMs) this.ctx.waitUntil?.(this.rdb("live"));
  }
  cfg(): StratCfg { return this.L?.cfg || STRAT_CFG; }
  turnMs(): number { const L = this.L!; const tm = (this.cfg() as any).turnMinutes; return L.devTurnMs || (L.turnMin ?? (tm ? turnMinutes(L.size, tm) : turnMinutes(L.size))) * 60_000; }
  deadline(): number { const L = this.L!, c = L.clock!; return c.turnStart + this.turnMs() + (c.reserve[L.game!.cur] || 0); }
  /** t1219: 2×2/«Все» — ход ушедшего (дольше econ.team.awayGraceSec) пропускается сразу, не дожидаясь лимита хода */
  awayDeadline(): number { const L = this.L!, g = L.game!, s = L.seats[g.cur]; if (!this.multi() || !s || s.bot || s.goneAt == null) return Infinity;
    return Math.max(s.goneAt + this.teamCfg().awayGraceSec * 1000, L.clock!.turnStart); }
  teamCfg() { const T = (this.cfg().econ as any).team || {}; return { awayGraceSec: T.awayGraceSec ?? 120, awayOutSkips: T.awayOutSkips ?? 5 }; }

  finish(winner: number, reason: string) {
    const L = this.L!; if (L.phase !== "play") return;
    const g = L.game!; if (g.winner === -1) { g.winner = winner; g.reason = reason; this.lastEv = [...this.lastEv, { e: "end", winner, reason }]; }
    L.phase = "over"; L.result = { winner, reason };
    if (this.R && L.rid === this.R.id) { logEnd(this.R, g.winner, g.reason); (this.R as any)._m = 1; this.rdb("over").catch(() => {}); }
    try { L.sum = this.summary(); } catch { L.sum = undefined; }
    const mid = this.matchId(), bg = (p: Promise<any>) => { const q = p.catch(() => {}); this.ctx.waitUntil?.(q); }; // t1236: запись итога/рейтинга — в waitUntil (раньше «висячие» промисы)
    bg(this.record()); bg(this.recordRating(mid));
    this.lastReport = ""; this.report(); // t1231: сразу снять партию из «Продолжить» (не ждать save)
  }
  /** Итог партии в D1 (strat_matches; миграция 0025). Опыт Полководца — этап 7. */
  async record() {
    const L = this.L!, g = L.game!, db = this.env.GAME_DB; if (!db) return;
    await db.prepare("INSERT OR REPLACE INTO strat_matches (id, code, size, p0, p1, race0, race1, first, winner, reason, turns, turn_limit, map_id, xp, cfg_version, started_at, ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(this.matchId(), L.code, L.size, L.seats[0]!.pkey, L.seats[1]!.pkey, g.races[0], g.races[1], g.first, g.winner, g.reason, g.turn, g.turnLimit, L.mapId || "", this.xpAllowed() ? 1 : 0, this.cfg().version, L.created, Date.now()).run();
  }
  matchId() { const L = this.L!; return L.mid || L.code + ":" + L.created; }
  /** t1236: статистика сторон для «Итогов партии» (без рейтинга — его добавляет recordRating). */
  summary() {
    const L = this.L!, g = L.game!, C = this.cfg(), ec: any = g.ec, G: any = goalCfg(g, C), T = ec ? territory(g, C) : null, St: any = L.st || {};
    const wonderB = (b: string) => b === "wonder" || (C as any).buildTpl?.[b]?.type === "wonder";
    const side = (i: number) => ({ team: teamOf(g, i), place: g.winner === -1 ? null : placeOf(g, i, L.mode), out: isOut(g, i), goals: ec ? [...ec.goals[i]] : [], gt: ec ? { ...(ec.gt?.[i] || {}) } : {}, kills: St.kl?.[i] ?? 0, lost: St.ls?.[i] ?? 0, chiefKills: St.ck?.[i] ?? 0,
      cities: ec ? ec.cities.filter((c: any) => c.owner === i).length : 0, cells: T ? T.reduce((n: number, v: number) => n + (v === i ? 1 : 0), 0) : 0,
      goldIn: St.gi?.[i] ?? ec?.earned?.[i] ?? 0, goldOut: St.go?.[i] ?? 0, gold: ec ? Math.round(ec.res[i].gold) : 0, techs: ec ? ec.techs[i].length : 0,
      wonders: ec ? ec.cities.filter((c: any) => c.owner === i).reduce((n: number, c: any) => n + c.bld.filter(wonderB).length, 0) : 0,
      glory: ec ? Math.round(ec.res[i].glory) : 0, ults: St.ult?.[i]?.length ?? 0, units: g.pieces.filter((p) => p.owner === i).length, acts: L.acts?.[i] ?? 0,
      activeMin: Math.round((L.activeMs?.[i] || 0) / 6e4) });
    return { v: 1, mid: this.matchId(), winner: g.winner, reason: g.reason, turns: g.turn, turnLimit: g.turnLimit, size: L.size, need: G?.need ?? 6, list: G?.list ? [...G.list] : null,
      mode: L.rated ? "ranked" : "normal", races: [...g.races], nicks: L.seats.map((s) => s?.nick || ""), bots: L.seats.map((s) => !!s?.bot), durMs: Date.now() - (St.start || L.created),
      gmode: this.mode(), teams: L.seats.map((_, i) => teamOf(g, i)), sides: L.seats.map((_, i) => side(i)) }; // t1243: все места (2×2/«Все»), команда и место
  }
  /** Рейтинг (1×1 сейчас; команды/FFA — через rateMatch по местам). Гости/боты/не пул/нестандарт — без рейтинга. */
  async recordRating(mid = this.matchId()) {
    const L = this.L!, g = L.game!, env = this.env; if (!env.GAME_DB) return;
    if (L.rating?.mid === mid) return; // t1236: по этой партии уже посчитано (повторный вызов — без второго начисления)
    const seats = L.seats as SeatS[], bots = seats.filter((s) => s?.bot).length, guests = seats.filter((s) => s && !s.bot && !s.verified).length;
    const ctx = { rated: !!L.rated && this.xpAllowed(), standard: L.turnMin == null && !L.devTurnMs, mapInPool: this.xpAllowed() && (await mapInPool(env, L.map as any, L.mapStatus || (L.mapId && /^o/.test(L.mapId) ? "official" : ""))),
      humans: seats.filter((s) => s && !s.bot).length, guests, bots, turns: g.turn, reason: g.reason };
    const N = seats.length, IX = seats.map((_, i) => i), goals = IX.map((i) => g.ec?.goals?.[i]?.length);
    const res = (i: number) => (isDraw(g) ? "draw" : seatWon(g, i) ? "win" : "loss") as "draw" | "win" | "loss";
    // t1219: места — победившая команда 1; в «Все» остальные по порядку выбывания (позже выбыл — выше); 2×2 — 2
    const place = (i: number) => placeOf(g, i, L.mode);
    const players = IX.map((i) => ({ uid: seats[i].pkey, team: teamOf(g, i), place: place(i), goals: goals[i], actions: L.acts?.[i] || 0 }));
    const R0: any = await rateFinished(env, mid, L.size, ctx, players, (goalCfg(g, this.cfg()) as any).rate);
    if (this.matchId() !== mid) return; // пока ждали D1, начался реванш — итог старой партии в новую не пишем
    L.rating = { ...R0, mid }; const dup = !!R0.dup;
    // опыт Полководца (косметика): активные минуты × итог × xpMul; гостям — никогда; карта не офиц./одобренная — 0
    const xp: (number | null)[] = IX.map(() => null);
    const xpd: any[] = IX.map(() => null); // t1236: за что опыт — минуты × итог × множитель (или почему 0)
    for (const i of IX) { const s = seats[i]; if (!s || s.bot) continue;
      const rs = res(i), min = Math.min(600, Math.floor((L.activeMs?.[i] || 0) / 60_000)), rm = rs === "win" ? 1.2 : rs === "draw" ? 1 : 0.8;
      if (!s.verified) { xpd[i] = { got: 0, why: "guest", min, res: rm }; continue; }
      if (!this.xpAllowed()) { xpd[i] = { got: 0, why: "map", min, res: rm }; continue; }
      const btd = bots ? await botXpToday(env, s.pkey) : 0, mul = xpMul({ turns: g.turn, reason: g.reason, bots, botGamesToday: btd });
      const got = matchXp(L.activeMs?.[i] || 0, rs, mul); xp[i] = got; if (got > 0 && !dup) await addXp(env, s.pkey, got, bots > 0);
      xpd[i] = { got, min, res: rm, mul, why: got > 0 ? null : mul === 0 ? (earlyMul(g.turn, g.reason) === 0 ? "too_early" : "bot_limit") : "idle", bot: bots > 0, early: earlyMul(g.turn, g.reason), botLeft: bots ? Math.max(0, RATING_CFG.botXpPerDay - btd - 1) : null }; }
    L.rating.xp = xp; L.rating.xpd = xpd;
    // монеты: только победителю рейтинговой партии
    const coins: (number | null)[] = IX.map(() => null);
    if ((L.rating as any).league) for (const i of IX) { const s = seats[i]; if (!s || s.bot || !s.verified || !seatWon(g, i)) continue;
      const lg = Math.max(0, ...IX.filter((j) => !seatWon(g, j)).map((j) => goals[j] ?? 0));
      const n = coinsFor({ league: (L.rating as any).league, rated: true, won: true, reason: g.reason, turns: g.turn, winnerGoals: goals[i] ?? 0, loserGoals: lg });
      try { coins[i] = await grantCoins(env, s.pkey, this.matchId(), n, isAbandonR(g.reason) ? "win_abandon" : "win_goals"); } catch { coins[i] = 0; } }
    (L.rating as any).coins = coins;
    // игровой профиль: строка на каждого зарегистрированного игрока
    const rows: StatRow[] = [];
    for (const i of IX) { const s = seats[i]; if (!s || s.bot || !s.verified) continue;
      const k = g.pieces.find((p) => p.owner === i && p.kind === "king"), ch: any = (g.ec as any)?.chief?.[i];
      rows.push({ match_id: this.matchId(), user_id: s.pkey, race: g.races[i], result: res(i), rated: (L.rating as any).league ? 1 : 0,
        league: leagueOf(L.size, L.size), size: L.size, map_id: L.mapId || null, turns: g.turn, duration_ms: Date.now() - (L.st?.start || L.created),
        techs: JSON.stringify(g.ec?.techs[i] || []), chief_type: ch?.type || null, chief_level: k ? pieceLevel(k, this.cfg()) : (ch?.hist?.at(-1)?.lvl ?? null),
        chief_kills: L.st?.ck[i] || 0, talents: JSON.stringify(L.st?.tal[i] || []), ults: JSON.stringify(L.st?.ult[i] || []), created_at: Date.now() }); }
    if (!dup) try { await addStats(env, rows); } catch {}
    if (!dup) await countPlay(env, L.mapId, seats.filter((s) => s && !s.bot).map((s) => s.pkey)).catch(() => false); // хаб: «сыграно» (и право лайкать) — один раз на партию
    if (L.sum && L.sum.mid === mid) { L.sum.rating = this.ratingView();
      if (this.R && L.rid === this.R.id) { (this.R as any).sum = L.sum; (this.R as any)._m = 1; await this.rdb("over"); } } // в лог повтора — «Итоги» видны и в библиотеке
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
      t = Math.min(t, this.deadline(), this.awayDeadline());
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
      if (L.phase === "play" && (now >= this.deadline() - 20 || now >= this.awayDeadline() - 20)) { // время хода вышло (или ушедший в командах) — ход передаётся сам
        const cur = L.game.cur; L.clock!.reserve[cur] = 0;
        this.doAct(cur, { a: "end" }, true);
        // t1219: 2×2/«Все» — ушедший после awayOutSkips пропусков подряд выбывает (2×2 — фигуры союзнику, «Все» — снимаются)
        const s = L.seats[cur]; if (L.phase === "play" && this.multi() && s && !s.bot && s.goneAt != null && (L.skips?.[cur] || 0) >= this.teamCfg().awayOutSkips) this.surrender(cur, "away");
      }
    }
    if (L.phase === "lobby" && L.seats[0]?.goneAt && now >= L.seats[0].goneAt + GRACE_MS) this.hostGone();
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
  cx: Set<string>[] = [new Set(), new Set()];
  codexTick(ev: Ev[]) {
    const L = this.L, g = L?.game; if (!L || !g) return;
    for (let side = 0; side < L.seats.length; side++) { const s = L.seats[side]; if (!s || s.bot) continue; const cx = (this.cx[side] ||= new Set());
      try { const seen = codexSeen(g, side, this.cfg(), ev as any[]), fresh = [...seen].filter((k) => !cx.has(k)); if (!fresh.length) continue;
        const items = codexPick(this.cfg(), fresh); let n = 0;
        for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment() as Att; if (a?.pkey === s.pkey) { this.send(ws, { type: "codex", items }); n++; } }
        const db = (this.env as any).GAME_DB, real = s.verified && !!db && !!s.pkey && !String(s.pkey).startsWith("guest:");
        if (n || real) fresh.forEach((k) => cx.add(k)); // гость без сокета — пришлём при возвращении
        if (real && items.length) { const now = Date.now();
          const st = db.prepare("INSERT OR IGNORE INTO strat_codex (user_id, kind, item_id, first_at) VALUES (?, ?, ?, ?)");
          void db.batch(items.map((e) => { const i = e.k.indexOf(":"); return st.bind(s.pkey, e.k.slice(0, i), e.k.slice(i + 1), now); })).catch(() => {}); }
      } catch {} }
  }
  stateFor(seat: number, ev: Ev[]) {
    const L = this.L!;
    const hideRace = L.phase === "lobby"; // выбор вслепую: чужую расу не видно до старта
    const tms = teamsFor(this.mode()), seats = L.seats.map((s, i) => s && { nick: s.nick, guest: !s.verified && !s.bot, bot: !!s.bot, ready: s.ready, picked: !!s.race,
      race: hideRace && i !== seat ? null : s.race, online: !s.goneAt, rematch: !!(s as any).rematch,
      botLv: s.bot ? s.level || "medium" : undefined, away: L.phase === "play" && s.goneAt != null, skips: L.skips?.[i] || 0, col: typeof s.col === "number" ? s.col : undefined, team: tms[i], out: !!L.game?.out?.includes(i) });
    const D = L.draw, raceDraw = this.drawOn() && D ? { commit: D.commit, ...(D.rolls && L.phase !== "lobby" ? { seed: D.seed, rolls: rollsFor(D.rolls, seat), order: D.order, w: D.w } : {}) } : null; // seed — только после старта; чужие любимые расы не уходят (t1175)
    const out: any = { type: "st", raceDraw, code: L.code, phase: L.phase, size: L.size, pub: L.pub, rated: !!L.rated, ranked: !!L.rated, hiddenHp: !!L.hiddenHp, mode: this.mode(), maxSeats: L.seats.length, teams: teamsFor(this.mode()), turnSec: L.turnMin != null ? L.turnMin * 60 : null, rating: this.ratingView(), turnLimit: L.game?.turnLimit ?? null, you: seat, seats, ev, now: Date.now(),
      mapInfo: { id: L.mapId || "", name: L.mapName || "", status: L.mapStatus || "official", xp: L.xpMap !== false } };
    if (L.phase === "lobby" && L.map) out.lobbyMap = L.map; // предпросмотр
    if (L.phase === "lobby" && this.multi()) out.modeSizes = [...new Set(showcaseAll().filter((m) => mapFits(m, this.mode())).map((m) => m.size))].sort((a, b) => a - b);
    if (L.game) {
      const g = L.game; out.g = view(g, true, this.cfg()); if (out.g?.pieces) for (const q of out.g.pieces) if (q.o !== seat && !(seat >= 0 && seat < L.seats.length && teamOf(g, q.o) === teamOf(g, seat))) delete (q as any).cd; /* t1225: откаты видны своим (и союзнику) */ const pp = publicPatch(L.cfgPatch); if (pp) out.cfgPatch = pp; // без деревьев
      const mine = seat >= 0 && seat < L.seats.length;
      if (mine) out.tree = treeView(g, seat, this.cfg()); // своё дерево, урезанное (ТЗ §14.F); зрителю — нет
      if (g.ec && this.mode() === "2v2") out.tradeCfg = this.cfg().econ.trade; // лимиты обмена — из админки
      if (g.ec) { out.blacklist = chiefBlacklist(g, mine ? seat : 0); // t1219: по записи на каждого соперника (2×2/«Все»), клик по цели «Цареубийство»
        if (g.ec.offers?.length) out.offers = mine ? g.ec.offers.filter((o) => o.from === seat || o.to === seat) : [];
        // форма клиента UI-воркера: ec.firstChief[side] = { dead, turn, by (место убийцы), name }
        if (out.g?.ec) out.g.ec = { ...out.g.ec, firstChief: L.seats.map((_, o) => { const v = L.seats.findIndex((_, k) => teamOf(g, k) !== teamOf(g, o)), r = v < 0 ? undefined : chiefBlacklist(g, v).find((x) => x.owner === o);
          return r ? { dead: !r.alive, turn: r.turn, by: r.alive ? null : L.seats.length === 2 ? 1 - o : r.killedBy, byKind: r.killedBy, name: r.name, type: r.type, out: r.out } : null; }) }; } // копия: g.ec не трогаем // «чёрный список» первых Вождей соперников: имя/тип/статус, без координат
      out.check = L.seats.map((_, i) => inCheck(g, i)); out.ev = redactX(out.ev, seat, L.phase === "over"); // t1156: чужие технологии/таланты в разборе удара — «скрытые бонусы»
      if (this.R && L.rid === this.R.id) out.replay = { id: L.rid, n: this.R.acts.length }; // для «Предыдущие ходы» / ссылки на повтор
      if (g.ec) { const C = this.cfg(); out.goals = L.seats.map((_, i) => goalDetails(g, i, C)); // t1135: описание + живой прогресс целей для подсказок
        if (mine) out.terr = terrView(g, seat, C); // t1140–t1143: своё окно покупки, канал поселения, скрытая расовая ОД (только себе)
        out.towers = (g.ec.towers || []).map((t: any) => ({ ...t })); { const lid = leagueOf(g.size) || "tactical"; out.league = { id: lid, ...(C.econ as any).league[lid] }; }
        out.bhp = g.ec.cities.map((c) => ({ city: c.id, b: c.bld.map((b) => ({ b, hp: c.bhp?.[b] ?? bldMaxHp(g, c, b, C), max: bldMaxHp(g, c, b, C) })), ruin: c.ruin || [] })); } // t1136
      if (L.hiddenHp) { setTowerMax(((this.cfg().econ as any).tower?.hp) || 16); const R = redactHp(out.g, out.ev, out.bhp, mine ? seat : -1, (a, b) => teamOf(g, a) === teamOf(g, b)); out.g = R.g; out.ev = R.ev; if (out.bhp) out.bhp = R.bhp; }
      if (L.clock && L.phase === "play") out.clock = { deadline: this.deadline(), turnEnds: L.clock.turnStart + this.turnMs(), turnMs: this.turnMs(), reserve: L.clock.reserve };
      if (L.phase === "play") { const sk = L.skips || []; out.away = L.seats.map((_, i) => ({ away: L.seats[i]?.goneAt != null, label: L.seats[i]?.goneAt != null ? "Игрок не за столом" : "", skips: sk[i] || 0, out: isOut(g, i) }));
        out.canClaim = !this.multi() && (seat === 0 || seat === 1) && !!L.seats[1 - seat] && !L.seats[1 - seat]!.bot && canClaim(L.seats[1 - seat]!.goneAt != null, sk[1 - seat] || 0); out.turnMin = this.turnMs() / 60000; }
    }
    if (L.result && L.sum) out.sum = L.sum; // t1236: «Итоги партии»
    if (L.result) { out.result = { ...L.result }; const R = this.ratingView(); // клиент UI: result.rating[side] = {league, before, after, delta}
      if (R?.league) out.result.rating = Object.fromEntries(R.seats.map((x: any, i: number) => [i, x.delta == null ? null : { league: ({ quick: "fast", normal: "normal", tactical: "tactic" } as any)[R.league], before: x.rating - x.delta, after: x.rating, delta: x.delta, xp: x.xp, coins: x.coins }])); }
    if (L.game && out.g?.pieces && (seat === 0 || seat === 1) && L.phase === "play") { const g = L.game, C = this.cfg(); out.g.pdv = 1; // t1221: ждущий уровень и карты — только по своим фигурам
      { const T = (L as any).tlog?.[seat]; if (T) out.tlog = T; } // t1221: только свои действия
      out.g.pieces = out.g.pieces.map((q: any) => { if (q.o !== seat) return q; const P = g.pieces.find((z) => z.id === q.id); const T = P && talentOpts(g, P, C); return T ? { ...q, pd: T.lv, po: T.o } : q; }); }
    return out;
  }
}

/** t1140–t1143: что видит своя сторона о земле: по каждому своему городу — таймер роста, окно «Можно купить клетку» (осталось ходов до бесплатного автоприсоединения), цена и клетки; канал поселения; живые числа расовой ОД для подсказки. */
/** места для итога рейтинга (все места лобби) */
const L0seats = (L: { seats: unknown[] }) => L.seats.map((_, i) => i);
/** t1219/t1243: место в итоге: победившая команда — 1; 1×1/2×2 — 2; «Все» — по порядку выбывания (позже выбыл — выше), невыбывшие проигравшие (лимит ходов) — сразу за победителем */
export function placeOf(g: GameState, i: number, mode?: string): number {
  const N = g.races.length; if (isDraw(g) || seatWon(g, i)) return 1; if (N <= 2 || mode === "2v2") return 2;
  const P = g.place || [], k = P.indexOf(i); return k < 0 ? 2 : N - k;
}
export function terrView(g: any, side: number, C: any) {
  const cities = g.ec.cities.filter((c: any) => c.owner === side).map((c: any) => {
    const every = growEvery(g, c, C), ready = (c.claims || 0) > 0;
    return { city: c.id, every, tg: c.tg || 0, ready, left: ready ? c.cw ?? null : null, cost: ready ? claimCost(g, c, C) : null, cells: ready ? claimCells(g, c, C).map((i: number) => [i % g.size, (i / g.size) | 0]) : [] };
  });
  return { cities, fnd: g.ec.fnd?.[side] || null, ap: apFor(g, side, C), raceAp: raceAp(g, side, C) };
}
