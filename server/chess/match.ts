// ChessMatch — одна партия «Боевых шахмат». Авторитет: server/chess/rules.ts.
import { DurableObject } from "cloudflare:workers";
import { newGame, doMove, doAttack, doAbility, endTurn, view, byId, attacks, abilities, moves, type Game, type Side } from "./rules";
import { identify } from "../strat/ident";
import { originAllowed, isLocalRequest } from "../limits";

type Seat = { pkey: string; nick: string; side: Side; verified: boolean };
type Lob = { code: string; pub: boolean; phase: "lobby" | "play" | "done"; seats: Seat[]; g: Game | null; host: string };

export class ChessMatch extends DurableObject {
  env: any; L: Lob | null = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async load() { if (!this.L) this.L = (await this.ctx.storage.get("L")) || null; return this.L; }
  async save() { if (this.L) await this.ctx.storage.put("L", this.L); }
  async report() {
    if (!this.L || !this.env.CHESS_INDEX) return;
    const stub = this.env.CHESS_INDEX.get(this.env.CHESS_INDEX.idFromName("index"));
    await stub.fetch("https://internal/report", { method: "POST", body: JSON.stringify({ code: this.L.code, pub: this.L.pub, phase: this.L.phase, host: this.L.host, n: this.L.seats.length }) }).catch(() => {});
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/init" && request.method === "POST") {
      if (await this.load()) return new Response("exists", { status: 409 });
      const b: any = await request.json().catch(() => ({}));
      this.L = { code: String(b.code), pub: !!b.pub, phase: "lobby", seats: [], g: null, host: "" };
      await this.save(); return new Response("ok");
    }
    if (url.pathname === "/phase") { const L = await this.load(); return Response.json({ phase: L?.phase || "gone" }); }

    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("ws only", { status: 426 });

    const pair = new WebSocketPair(); const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const L = await this.load(); if (!L) { ws.close(4000, "gone"); return; }
    let m: any; try { m = JSON.parse(typeof msg === "string" ? msg : new TextDecoder().decode(msg)); } catch { return; }
    if (m.type === "hello") {
      const id = await identify(this.env, (ws as any).deserializeAttachment?.()?.url || "http://127.0.0.1/", m);
      if ("err" in id) { ws.send(JSON.stringify({ type: "err", err: id.err })); return; }
      let seat = L.seats.find((s) => s.pkey === id.pkey);
      if (!seat && L.phase === "lobby" && L.seats.length < 2) {
        const side: Side = L.seats.length === 0 ? "w" : "b";
        seat = { pkey: id.pkey, nick: id.nick, side, verified: id.verified };
        L.seats.push(seat);
        if (!L.host) L.host = id.nick;
        (ws as any).serializeAttachment?.({ pkey: id.pkey, side });
      }
      await this.save(); await this.report();
      ws.send(JSON.stringify({ type: "hello_ok", you: seat || null, lobby: { code: L.code, phase: L.phase, seats: L.seats.map((s) => ({ nick: s.nick, side: s.side })) } }));
      return;
    }
    const att = (ws as any).deserializeAttachment?.() || {};
    const seat = L.seats.find((s) => s.pkey === att.pkey);
    if (!seat) return;

    if (m.type === "start" && L.phase === "lobby" && seat.pkey === L.seats[0]?.pkey && L.seats.length >= 1) {
      // хост может стартовать 1v1 или vs пустого (бот на клиенте) — при 2 игроках online
      L.g = newGame(); L.phase = "play"; await this.save(); await this.report();
      this.broadcast({ type: "state", state: view(L.g) }); return;
    }
    if (m.type === "act" && L.phase === "play" && L.g && L.g.side === seat.side) {
      const G = L.g, p = byId(G, m.id); if (!p || p.s !== seat.side) return;
      if (m.act === "move") doMove(G, p, m.x | 0, m.y | 0);
      else if (m.act === "attack") { const a = attacks(G, p).find((x) => x.qId === m.qId); if (a) doAttack(G, p, a); }
      else if (m.act === "ability") { const abs = abilities(G, p); const t = abs.find((x) => x.qId === m.qId || (x.x === m.x && x.y === m.y)); if (t) doAbility(G, p, t); }
      else if (m.act === "end") endTurn(G);
      if (G.winner) L.phase = "done";
      await this.save(); if (L.phase === "done") await this.report();
      this.broadcast({ type: "state", state: view(G) });
    }
  }

  broadcast(o: any) {
    const s = JSON.stringify(o);
    for (const ws of this.ctx.getWebSockets()) try { ws.send(s); } catch {}
  }
}
