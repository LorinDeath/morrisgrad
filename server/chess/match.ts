// ChessMatch — одна онлайн-партия «Боевых шахмат» 1×1. Авторитет: server/chess/rules.ts (клиент только рисует).
// Личность — identify() как у сайта (Clerk JWT / devUser на localhost / гость). Рейтинг — chess_* (rating-db.ts).
import { DurableObject } from "cloudflare:workers";
import { newGame, doMove, doAttack, doAbility, endTurn, view, byId, attacks, abilities, type Game, type Side } from "./rules";
import { identify } from "../strat/ident";
import { admitMessage, originAllowed, isLocalRequest, MSG_BURST } from "../limits";
import { rateChess, getChessRating, isRatable, type ChessRateResult } from "./rating-db";

type Seat = { pkey: string; nick: string; side: Side; verified: boolean; rating: number | null };
type Result = { winner: Side; reason: "mate" | "resign" | "forfeit" | "timeout"; turns: number; ap: Record<Side, number>; rated: ChessRateResult | null };
type Lob = {
  code: string; pub: boolean; phase: "lobby" | "play" | "done"; seats: Seat[]; g: Game | null; host: string;
  result: Result | null; at: number; mm?: boolean;
  turnDeadline: number | null; matchDeadline: number | null;
};
type Att = { url: string; pkey?: string; tk: number; at: number; st: number };
type Last = { kind: "move" | "attack" | "ability" | "end"; id: number; tgt: [number, number] | null; ranged: boolean; side: Side };

const FORFEIT_MS = 90_000; // игрок без соединения дольше — поражение
const TURN_MS = 5 * 60_000; // макс 5 минут на ход
const MATCH_MS = 30 * 60_000; // макс 30 минут на партию
const EMPTY_LOBBY_MS = 5 * 60_000; // одиночное/пустое лобби без матча

export class ChessMatch extends DurableObject {
  env: any; L: Lob | null = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async load() { if (!this.L) this.L = (await this.ctx.storage.get("L")) || null; return this.L; }
  async save() { if (this.L) await this.ctx.storage.put("L", this.L); }
  async report() {
    if (!this.L || !this.env.CHESS_INDEX) return;
    const stub = this.env.CHESS_INDEX.get(this.env.CHESS_INDEX.idFromName("index"));
    const n = this.L.phase === "done" || this.L.phase === "lobby" && this.L.seats.length === 0 ? 0 : this.L.seats.length;
    const phase = this.L.seats.length === 0 && this.L.phase === "lobby" ? "gone" : this.L.phase;
    await stub.fetch("https://internal/report", {
      method: "POST",
      body: JSON.stringify({ code: this.L.code, pub: this.L.pub, phase, host: this.L.host, n }),
    }).catch(() => {});
  }
  send(ws: WebSocket, o: any) { try { ws.send(JSON.stringify(o)); } catch {} }
  broadcast(o: any) { const s = JSON.stringify(o); for (const ws of this.ctx.getWebSockets()) try { ws.send(s); } catch {} }
  online(pkey: string, skip?: WebSocket) { return this.ctx.getWebSockets().some((w: WebSocket) => w !== skip && (w.deserializeAttachment() as Att)?.pkey === pkey); }
  lobbyView(skip?: WebSocket) {
    const L = this.L!;
    return {
      code: L.code, phase: L.phase, pub: L.pub, mm: !!L.mm,
      turnDeadline: L.turnDeadline, matchDeadline: L.matchDeadline, now: Date.now(),
      seats: L.seats.map((s) => ({ nick: s.nick, side: s.side, rated: isRatable(s.pkey, s.verified), rating: s.rating, online: this.online(s.pkey, skip) })),
    };
  }
  clock() {
    const L = this.L!;
    return { turnDeadline: L.turnDeadline, matchDeadline: L.matchDeadline, now: Date.now() };
  }
  async armAlarm() {
    const L = this.L; if (!L) return;
    const now = Date.now();
    let next = Infinity;
    if (L.phase === "lobby") next = Math.min(next, L.at + EMPTY_LOBBY_MS);
    if (L.phase === "play") {
      if (L.turnDeadline) next = Math.min(next, L.turnDeadline);
      if (L.matchDeadline) next = Math.min(next, L.matchDeadline);
      // disconnect forfeit checked via separate alarm set in gone()
    }
    if (next < Infinity) await this.ctx.storage.setAlarm(Math.max(now + 250, next));
  }
  startClocks() {
    const L = this.L!;
    const now = Date.now();
    L.matchDeadline = now + MATCH_MS;
    L.turnDeadline = now + TURN_MS;
  }
  bumpTurnClock() {
    const L = this.L!;
    if (L.phase !== "play") return;
    L.turnDeadline = Date.now() + TURN_MS;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/init" && request.method === "POST") {
      if (await this.load()) return new Response("exists", { status: 409 });
      const b: any = await request.json().catch(() => ({}));
      const seats: Seat[] = Array.isArray(b.seats)
        ? b.seats.map((s: any) => ({
            pkey: String(s.pkey), nick: String(s.nick || "Игрок").slice(0, 16),
            side: s.side === "b" ? "b" : "w", verified: !!s.verified,
            rating: typeof s.rating === "number" ? s.rating : null,
          }))
        : [];
      this.L = {
        code: String(b.code), pub: !!b.pub, phase: "lobby", seats, g: null,
        host: seats[0]?.nick || "", result: null, at: Date.now(), mm: !!b.mm,
        turnDeadline: null, matchDeadline: null,
      };
      // матчмейкинг: оба места заранее — ждём WS, часы стартуют при первом state/обоих online
      await this.save();
      await this.armAlarm();
      return new Response("ok");
    }
    if (url.hostname === "internal" && url.pathname === "/phase") { const L = await this.load(); return Response.json({ phase: L?.phase || "gone" }); }

    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("ws only", { status: 426 });
    if (!(await this.load())) return new Response("no lobby", { status: 404 });

    const pair = new WebSocketPair(); const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ url: request.url, tk: MSG_BURST, at: Date.now(), st: 0 } as Att);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Att;
    const lim = { tokens: a.tk, at: a.at, strikes: a.st };
    const vr = admitMessage(lim, raw, Date.now());
    a.tk = lim.tokens; a.at = lim.at; a.st = lim.strikes; ws.serializeAttachment(a);
    if (vr !== "ok") { if (vr === "close") try { ws.close(1008, "flood"); } catch {} return; }
    if ((raw as string).length > 4096) return;
    let m: any; try { m = JSON.parse(raw as string); } catch { return; }
    const L = await this.load(); if (!L) { try { ws.close(4000, "gone"); } catch {} return; }

    if (m.type === "hello") {
      const id = await identify(this.env, a.url, m);
      if ("err" in id) return this.send(ws, { type: "err", err: id.err });
      let seat = L.seats.find((s) => s.pkey === id.pkey);
      if (!seat) {
        if (L.mm) return this.send(ws, { type: "err", err: "not_in_match" }); // места только из очереди
        if (L.phase !== "lobby" || L.seats.length >= 2) return this.send(ws, { type: "err", err: "full" });
        const side: Side = L.seats.length === 0 ? "w" : "b";
        const r = isRatable(id.pkey, id.verified) ? await getChessRating(this.env, id.pkey).catch(() => null) : null;
        seat = { pkey: id.pkey, nick: id.nick, side, verified: id.verified, rating: r ? r.rating : null };
        L.seats.push(seat);
        if (!L.host) L.host = id.nick;
      } else {
        // обновить ник при reconnect
        seat.nick = id.nick || seat.nick;
      }
      a.pkey = id.pkey; ws.serializeAttachment(a);
      let started = false;
      if (L.phase === "lobby" && L.seats.length === 2) {
        L.g = newGame(); L.phase = "play"; this.startClocks(); started = true;
      }
      await this.save(); await this.report(); await this.armAlarm();
      this.send(ws, { type: "hello_ok", you: { nick: seat.nick, side: seat.side, rated: isRatable(seat.pkey, seat.verified) } });
      this.broadcast({ type: "lobby", lobby: this.lobbyView() });
      if (L.g) {
        const st = { type: "state", state: view(L.g), last: null, start: started, clock: this.clock() };
        if (started) this.broadcast(st); else this.send(ws, st);
      }
      if (L.result) this.send(ws, { type: "result", result: this.resultView() });
      return;
    }
    const seat = L.seats.find((s) => s.pkey === a.pkey);
    if (!seat) return;
    if (m.type === "ping") return this.send(ws, { type: "pong", clock: this.clock() });

    // отмена поиска / выход из лобби до старта
    if (m.type === "leave" && L.phase === "lobby") {
      L.seats = L.seats.filter((s) => s.pkey !== seat.pkey);
      if (!L.seats.length) L.host = "";
      await this.save(); await this.report();
      this.send(ws, { type: "left" });
      try { ws.close(1000, "left"); } catch {}
      this.broadcast({ type: "lobby", lobby: this.lobbyView() });
      return;
    }

    if (m.type === "resign" && L.phase === "play" && L.g) {
      return this.finish(seat.side === "w" ? "b" : "w", "resign");
    }
    if (m.type === "act" && L.phase === "play" && L.g && L.g.side === seat.side) {
      const G = L.g; let ok = false, last: Last | null = null;
      const sideBefore = G.side;
      if (m.act === "end") { endTurn(G); ok = true; last = { kind: "end", id: 0, tgt: null, ranged: false, side: seat.side }; }
      else {
        const p = byId(G, m.id | 0); if (!p || p.s !== seat.side) return this.send(ws, { type: "err", err: "bad_piece" });
        if (m.act === "move") { ok = doMove(G, p, m.x | 0, m.y | 0); last = { kind: "move", id: p.id, tgt: [m.x | 0, m.y | 0], ranged: false, side: seat.side }; }
        else if (m.act === "attack") {
          const at = attacks(G, p).find((x) => x.qId === (m.qId | 0)); const q = at ? byId(G, at.qId) : null;
          if (at && q) { const tgt: [number, number] = [q.x, q.y]; ok = doAttack(G, p, at); last = { kind: "attack", id: p.id, tgt, ranged: !!at.ranged, side: seat.side }; }
        } else if (m.act === "ability") {
          const t = abilities(G, p).find((x) => (m.qId != null && x.qId === m.qId) || (m.qId == null && x.x === m.x && x.y === m.y));
          if (t) { const q = t.qId != null ? byId(G, t.qId) : null; const tgt: [number, number] | null = q ? [q.x, q.y] : t.x != null ? [t.x, t.y!] : null; ok = doAbility(G, p, t); last = { kind: "ability", id: p.id, tgt, ranged: false, side: seat.side }; }
        }
      }
      if (!ok) { this.send(ws, { type: "err", err: "illegal" }); this.send(ws, { type: "state", state: view(G), last: null, clock: this.clock() }); return; }
      if (G.side !== sideBefore) this.bumpTurnClock();
      await this.save(); await this.armAlarm();
      this.broadcast({ type: "state", state: view(G), last, clock: this.clock() });
      if (G.winner) await this.finish(G.winner, "mate");
    }
  }

  resultView() {
    const L = this.L!, R = L.result!; if (!R) return null;
    const ch = R.rated && "changes" in R.rated ? R.rated.changes : null;
    return {
      winner: R.winner, reason: R.reason, turns: R.turns, ap: R.ap,
      unrated: R.rated && "unrated" in R.rated ? R.rated.unrated : (ch ? null : "guest"),
      seats: L.seats.map((s) => ({ nick: s.nick, side: s.side, rating: ch?.[s.pkey] || null })),
    };
  }

  async finish(winner: Side, reason: Result["reason"]) {
    const L = this.L!; if (L.phase === "done" || !L.g) return;
    const G = L.g; G.winner = winner; G.side = "x";
    L.phase = "done";
    L.turnDeadline = null; L.matchDeadline = null;
    const w = L.seats.find((s) => s.side === "w"), b = L.seats.find((s) => s.side === "b");
    let rated: ChessRateResult | null = null;
    if (w && b) {
      const win = winner === "w" ? w : b;
      try { rated = await rateChess(this.env, L.code + ":" + L.at, { uid: w.pkey, verified: w.verified }, { uid: b.pkey, verified: b.verified }, win.pkey, G.turnsDone.w + G.turnsDone.b); }
      catch (e: any) { rated = { unrated: "db_error" }; console.error("[chess] rate", e?.message || e); }
      if (rated && "changes" in rated) for (const s of L.seats) { const c = rated.changes[s.pkey]; if (c) s.rating = c.after; }
    }
    L.result = { winner, reason, turns: G.turn, ap: { w: G.apMax.w, b: G.apMax.b }, rated };
    await this.save(); await this.report();
    this.broadcast({ type: "state", state: view(G), last: null, clock: this.clock() });
    this.broadcast({ type: "result", result: this.resultView() });
  }

  async webSocketClose(ws: WebSocket) { await this.gone(ws); }
  async webSocketError(ws: WebSocket) { await this.gone(ws); }
  async gone(ws: WebSocket) {
    const L = await this.load(); if (!L) return;
    const pk = (ws.deserializeAttachment() as Att)?.pkey; if (!pk) return;
    try { ws.close(1000, "bye"); } catch {}
    // в лобби (не mm-префил) при обрыве убираем место — не висит «жду соперника»
    if (L.phase === "lobby" && !L.mm) {
      L.seats = L.seats.filter((s) => s.pkey !== pk);
      if (!L.seats.length) L.host = "";
      await this.save(); await this.report();
      this.broadcast({ type: "lobby", lobby: this.lobbyView(ws) });
      return;
    }
    this.broadcast({ type: "lobby", lobby: this.lobbyView(ws) });
    if (L.phase === "play") await this.ctx.storage.setAlarm(Date.now() + FORFEIT_MS);
  }

  async alarm() {
    const L = await this.load(); if (!L) return;
    const now = Date.now();

    if (L.phase === "lobby") {
      // mm: ждём обоих WS до EMPTY_LOBBY_MS; обычное — тоже
      if (now - L.at >= EMPTY_LOBBY_MS) {
        L.phase = "done";
        L.seats = [];
        await this.save(); await this.report();
        this.broadcast({ type: "err", err: "lobby_expired" });
        for (const ws of this.ctx.getWebSockets()) try { ws.close(4001, "expired"); } catch {}
      } else await this.armAlarm();
      return;
    }

    if (L.phase !== "play" || !L.g) return;

    if (L.matchDeadline && now >= L.matchDeadline) {
      await this.finish(L.g.side === "w" ? "b" : "w", "timeout");
      return;
    }
    if (L.turnDeadline && now >= L.turnDeadline) {
      await this.finish(L.g.side === "w" ? "b" : "w", "timeout");
      return;
    }

    const off = L.seats.filter((s) => !this.online(s.pkey));
    if (off.length === 1) await this.finish(off[0].side === "w" ? "b" : "w", "forfeit");
    else if (off.length === 2) { L.phase = "done"; L.turnDeadline = null; L.matchDeadline = null; await this.save(); await this.report(); }
    else await this.armAlarm();
  }
}
