// StratMatch — отдельный Durable Object на каждое лобби/партию «Партии Чёрных королей» (idFromName(код)).
// Не связан с GameRoom: партии не делят процессор и очередь с миром MorrisCurse и друг с другом.
// Hibernatable WebSocket (DO спит, пока игрок думает) + alarm() для таймера хода и возврата после обрыва.
import { DurableObject } from "cloudflare:workers";
import { admitMessage, originAllowed, isLocalRequest, isDevRequest, MSG_BURST } from "../limits";
import { identify, type Ident } from "./ident";
import { newGame, apply, view, botAction, inCheck, RACES, SIZES, STRAT_CFG, validTurnLimit, type GameState, type Race, type Action, type Ev, type Kind } from "./rules";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без O/0, I/1
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const GRACE_MS = 120_000; // на возврат после обрыва
const LOBBY_TTL_MS = 2 * 3600_000; // пустое лобби/законченная партия живут 2 часа
const BOT_STEP_MS = 450;

type SeatS = { pkey: string; nick: string; verified: boolean; race: Race | null; ready: boolean; bot?: boolean; goneAt: number | null };
type Clock = { turnStart: number; reserve: [number, number] };
type L = {
  code: string; created: number; touched: number; size: number; pub: boolean; fair: boolean;
  turnLimit?: number | null; // null/нет = по умолчанию для размера; 0 = без лимита; иначе TURN_LIMIT.min..max
  phase: "lobby" | "play" | "over"; seats: [SeatS | null, SeatS | null];
  game: GameState | null; clock: Clock | null; result?: { winner: number; reason: string };
  devTurnMs?: number; // только локальные плейтесты (MC_DEV_TRUST_USERID=1 + localhost): короткий таймер хода без запаса
};
type Att = { pkey?: string; nick?: string; verified?: boolean; url: string; tk: number; at: number; st: number };

export class StratMatch extends DurableObject {
  env: any; L: L | null = null; loaded = false; botTimer: any = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }

  async load(): Promise<L | null> { if (!this.loaded) { this.L = (await this.ctx.storage.get("L")) || null; this.loaded = true; } return this.L; }
  async save() { if (this.L) { this.L.touched = Date.now(); await this.ctx.storage.put("L", this.L); } await this.rearm(); this.report(); }
  lastReport = "";
  /** Сводка лобби → StratIndex (список «Ждут соперника»); только при изменении. */
  report() {
    const L = this.L; if (!L || !this.env.STRAT_INDEX) return;
    const sum = { code: L.code, pub: L.pub, phase: L.phase, size: L.size, host: L.seats[0]?.nick || "", n: L.seats.filter(Boolean).length };
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
      this.L = { code: b.code, created: Date.now(), touched: Date.now(), size, pub: !!b.pub, fair: false, phase: "lobby", seats: [null, null], game: null, clock: null };
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

  /** Команда игрока; возвращает код ошибки или "" */
  async handle(seat: 0 | 1 | -1, pkey: string, m: any): Promise<string> {
    const L = this.L!;
    if (seat < 0) return "spectator";
    const me = L.seats[seat]!;
    switch (m.type) {
      case "cfg": {
        if (seat !== 0) return "not_host"; if (L.phase !== "lobby") return "bad_phase";
        if (m.size !== undefined) { if (!SIZES.includes(m.size)) return "bad_size"; L.size = m.size; }
        if (m.pub !== undefined) L.pub = !!m.pub;
        if (m.fair !== undefined) L.fair = !!m.fair;
        if (m.turnLimit !== undefined) { const t = validTurnLimit(m.turnLimit); if (t === undefined) return "bad_turn_limit"; L.turnLimit = t; }
        for (const s of L.seats) if (s && !s.bot) s.ready = false; // настройки поменялись — «Готов» сбрасывается
        break;
      }
      case "bot": {
        if (seat !== 0) return "not_host"; if (L.phase !== "lobby") return "bad_phase";
        if (m.on) { if (L.seats[1] && !L.seats[1].bot) return "seat_taken"; L.seats[1] = { pkey: "bot", nick: "Бот", verified: false, race: RACES[Math.floor(Math.random() * RACES.length)], ready: true, bot: true, goneAt: null }; }
        else if (L.seats[1]?.bot) L.seats[1] = null;
        break;
      }
      case "race": {
        if (L.phase !== "lobby") return "bad_phase"; if (!RACES.includes(m.race)) return "bad_race";
        me.race = m.race; me.ready = false; break;
      }
      case "ready": {
        if (L.phase !== "lobby") return "bad_phase"; if (!me.race) return "pick_race";
        me.ready = !!m.on;
        if (L.seats[0]?.ready && L.seats[1]?.ready) this.start();
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
      case "rematch": {
        if (L.phase !== "over") return "bad_phase";
        (me as any).rematch = true;
        if (L.seats.every((s) => s && (s.bot || (s as any).rematch))) {
          for (const s of L.seats) if (s) { (s as any).rematch = false; s.ready = !!s.bot; if (!s.bot) s.race = null; }
          L.phase = "lobby"; L.game = null; L.clock = null; L.result = undefined;
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

  start() {
    const L = this.L!;
    const first = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) as 0 | 1; // кто ходит первым — случайно
    L.game = newGame(L.size, [L.seats[0]!.race!, L.seats[1]!.race!], first, STRAT_CFG, L.turnLimit);
    const sc = STRAT_CFG.sizes[L.size], res = L.devTurnMs ? 0 : sc.reserveSec * 1000;
    L.clock = { turnStart: Date.now(), reserve: [res, res] };
    L.phase = "play"; this.lastEv = [{ e: "turn", cur: first, turn: 1 }];
    this.botMaybe();
  }
  lastEv: Ev[] = [];

  doAct(seat: 0 | 1, act: Action): string {
    const L = this.L!, g = L.game!, prevCur = g.cur;
    const r = apply(g, seat, act); if (!r.ok) return r.err;
    this.lastEv = r.ev;
    if (g.cur !== prevCur || g.winner !== -1) this.turnPassed(prevCur);
    if (g.winner !== -1) this.finish(g.winner as any, g.reason);
    this.botMaybe();
    return "";
  }
  /** Ход сменился: списать перерасход из запаса, запустить часы следующего. */
  turnPassed(prev: 0 | 1) {
    const c = this.L!.clock!;
    const over = Date.now() - c.turnStart - this.turnMs();
    if (over > 0) c.reserve[prev] = Math.max(0, c.reserve[prev] - over);
    c.turnStart = Date.now();
  }
  turnMs(): number { const L = this.L!; return L.devTurnMs || STRAT_CFG.sizes[L.size].turnSec * 1000; }
  deadline(): number { const L = this.L!, c = L.clock!; return c.turnStart + this.turnMs() + c.reserve[L.game!.cur]; }

  finish(winner: 0 | 1 | 2, reason: string) {
    const L = this.L!; if (L.phase !== "play") return;
    const g = L.game!; if (g.winner === -1) { g.winner = winner; g.reason = reason; this.lastEv = [...this.lastEv, { e: "end", winner, reason }]; }
    L.phase = "over"; L.result = { winner, reason };
    this.record().catch(() => {});
  }
  /** Итог партии в D1 (strat_matches; миграция 0025). Опыт Полководца — этап 7. */
  async record() {
    const L = this.L!, g = L.game!, db = this.env.GAME_DB; if (!db) return;
    await db.prepare("INSERT OR REPLACE INTO strat_matches (id, code, size, p0, p1, race0, race1, first, winner, reason, turns, turn_limit, cfg_version, started_at, ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(L.code + ":" + L.created + ":" + (L.clock?.turnStart || 0), L.code, L.size, L.seats[0]!.pkey, L.seats[1]!.pkey, g.races[0], g.races[1], g.first, g.winner, g.reason, g.turn, g.turnLimit, STRAT_CFG.version, L.created, Date.now()).run();
  }

  // ---------- бот ----------
  botMaybe() {
    const L = this.L!; if (L.phase !== "play" || this.botTimer) return;
    const s = L.seats[L.game!.cur]; if (!s?.bot) return;
    this.botTimer = setTimeout(async () => {
      this.botTimer = null; const L2 = await this.load(); if (!L2 || L2.phase !== "play") return;
      const side = L2.game!.cur; if (!L2.seats[side]?.bot) return;
      const err = this.doAct(side, botAction(L2.game!, side));
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
      for (const s of L.seats) if (s?.goneAt) t = Math.min(t, s.goneAt + GRACE_MS);
    }
    if (L.phase === "lobby" && L.seats[0]?.goneAt) t = Math.min(t, L.seats[0].goneAt + GRACE_MS);
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, t));
  }
  async alarm() {
    const L = await this.load(); if (!L) return;
    const now = Date.now();
    if (now >= L.touched + LOBBY_TTL_MS && this.ctx.getWebSockets().length === 0) { await this.ctx.storage.deleteAll(); this.L = null; return; }
    if (L.phase === "play" && L.game) {
      for (const side of [0, 1] as const) { const s = L.seats[side]; if (s?.goneAt && now >= s.goneAt + GRACE_MS) { this.finish((1 - side) as 0 | 1, "disconnect"); break; } }
      if (L.phase === "play" && now >= this.deadline() - 20) { // время хода и запас вышли — ход передаётся сам
        const cur = L.game.cur; L.clock!.reserve[cur] = 0;
        this.doAct(cur, { a: "end" });
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
  }
  stateFor(seat: number, ev: Ev[]) {
    const L = this.L!;
    const hideRace = L.phase === "lobby"; // выбор вслепую: чужую расу не видно до старта
    const seats = L.seats.map((s, i) => s && { nick: s.nick, guest: !s.verified && !s.bot, bot: !!s.bot, ready: s.ready, picked: !!s.race,
      race: hideRace && i !== seat ? null : s.race, online: !s.goneAt, rematch: !!(s as any).rematch });
    const out: any = { type: "st", code: L.code, phase: L.phase, size: L.size, pub: L.pub, fair: L.fair, turnLimit: L.turnLimit ?? null, you: seat, seats, ev, now: Date.now() };
    if (L.game) {
      const g = L.game; out.g = view(g); out.check = [inCheck(g, 0), inCheck(g, 1)];
      if (L.clock && L.phase === "play") out.clock = { deadline: this.deadline(), turnEnds: L.clock.turnStart + this.turnMs(), reserve: L.clock.reserve };
    }
    if (L.result) out.result = L.result;
    return out;
  }
}

function parseAct(a: any): Action | null {
  if (!a || typeof a !== "object") return null;
  if (a.a === "end") return { a: "end" };
  const int = (v: any) => Number.isInteger(v) && v >= 0 && v < 64;
  if ((a.a === "move" || a.a === "attack") && Number.isInteger(a.id) && int(a.x) && int(a.y)) {
    const o: any = { a: a.a, id: a.id, x: a.x, y: a.y };
    if (a.a === "move" && ["knight", "mage", "rook"].includes(a.promo)) o.promo = a.promo as Kind;
    return o;
  }
  return null;
}
