// ChessIndex — реестр + очередь матчмейкинга «Боевых шахмат». Не трогает StratIndex.
import { DurableObject } from "cloudflare:workers";
import { originAllowed, isLocalRequest } from "../limits";
import { identify } from "../strat/ident";
import { getChessRating, isRatable } from "./rating-db";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const LOBBY_STALE_MS = 5 * 60_000; // пустые/одиночные лобби в индексе
const QUEUE_STALE_MS = 10 * 60_000;

type Lob = { code: string; pub: boolean; phase: string; host: string; n: number; at: number };
type Seek = { ticket: string; pkey: string; nick: string; verified: boolean; rating: number; at: number };
type Ticket = {
  ticket: string; pkey: string; nick: string; verified: boolean; rating: number;
  status: "searching" | "matched" | "cancelled"; code?: string; side?: "w" | "b"; at: number;
};

function newCode(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return [...rnd].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}
function newTicket(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(12));
  return [...rnd].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export class ChessIndex extends DurableObject {
  env: any;
  lobbies: Map<string, Lob> | null = null;
  queue: Map<string, Seek> | null = null; // by pkey
  tickets: Map<string, Ticket> | null = null;

  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }

  async lobs() {
    if (!this.lobbies) this.lobbies = new Map(Object.entries((await this.ctx.storage.get("lobs")) || {}));
    return this.lobbies;
  }
  async qmap() {
    if (!this.queue) this.queue = new Map(Object.entries((await this.ctx.storage.get("queue")) || {}));
    return this.queue;
  }
  async tmap() {
    if (!this.tickets) this.tickets = new Map(Object.entries((await this.ctx.storage.get("tickets")) || {}));
    return this.tickets;
  }
  async saveLobs() {
    const m = await this.lobs(), now = Date.now();
    for (const [k, v] of m) {
      const staleLobby = v.phase === "lobby" && now - v.at > LOBBY_STALE_MS;
      const staleDone = (v.phase === "done" || v.phase === "gone") && now - v.at > 30 * 60_000;
      const staleAny = now - v.at > 2 * 3600_000;
      // n=0 у только что созданной комнаты — не выкидывать, пока не TTL / phase gone
      if (staleLobby || staleDone || staleAny || v.phase === "gone") m.delete(k);
    }
    await this.ctx.storage.put("lobs", Object.fromEntries(m));
  }
  async saveQueue() {
    const q = await this.qmap(), t = await this.tmap(), now = Date.now();
    for (const [k, v] of q) if (now - v.at > QUEUE_STALE_MS) q.delete(k);
    for (const [k, v] of t) if (now - v.at > QUEUE_STALE_MS || v.status === "cancelled") {
      if (v.status === "cancelled" || now - v.at > QUEUE_STALE_MS) t.delete(k);
    }
    await this.ctx.storage.put("queue", Object.fromEntries(q));
    await this.ctx.storage.put("tickets", Object.fromEntries(t));
  }

  cors(origin: string | null) {
    return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } as Record<string, string> : {};
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/report") {
      const b: any = await request.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code)) return new Response("bad", { status: 400 });
      const m = await this.lobs();
      if (b.phase === "gone" || (b.n | 0) <= 0) m.delete(b.code);
      else m.set(b.code, { code: b.code, pub: !!b.pub, phase: String(b.phase), host: String(b.host || "").slice(0, 16), n: b.n | 0, at: Date.now() });
      await this.saveLobs();
      return new Response("ok");
    }

    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    const cors = this.cors(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Max-Age": "600" },
      });
    }

    if (url.pathname === "/chess/new" && request.method === "POST") {
      const b: any = await request.json().catch(() => ({}));
      const m = await this.lobs();
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        if (m.has(code)) continue;
        if (!this.env.CHESS_MATCH) return Response.json({ err: "no_match_binding" }, { status: 503, headers: cors });
        const stub = this.env.CHESS_MATCH.get(this.env.CHESS_MATCH.idFromName(code));
        const res = await stub.fetch("https://internal/init", { method: "POST", body: JSON.stringify({ code, pub: !!b.pub }) });
        if (res.status === 409) continue;
        m.set(code, { code, pub: !!b.pub, phase: "lobby", host: "", n: 0, at: Date.now() });
        await this.saveLobs();
        return Response.json({ code }, { headers: cors });
      }
      return Response.json({ err: "busy" }, { status: 503, headers: cors });
    }

    if (url.pathname === "/chess/open") {
      await this.saveLobs();
      const list = [...(await this.lobs()).values()]
        .filter((l) => l.pub && l.phase === "lobby" && l.n <= 1)
        .slice(0, 30)
        .map(({ code, host, n }) => ({ code, host, n }));
      return Response.json({ list }, { headers: cors });
    }

    // ─── matchmaking queue ───
    if (url.pathname === "/chess/mm/join" && request.method === "POST") {
      const b: any = await request.json().catch(() => ({}));
      const id = await identify(this.env, request.url, b);
      if ("err" in id) return Response.json({ err: id.err }, { status: 401, headers: cors });
      const q = await this.qmap(), t = await this.tmap();
      // уже ищет — вернуть тот же ticket
      const prev = q.get(id.pkey);
      if (prev) {
        const tk = t.get(prev.ticket);
        if (tk && tk.status === "matched" && tk.code) {
          return Response.json({ ticket: tk.ticket, status: "matched", code: tk.code, side: tk.side }, { headers: cors });
        }
        if (tk && tk.status === "searching") {
          return Response.json({ ticket: tk.ticket, status: "searching" }, { headers: cors });
        }
      }
      // уже matched ticket leftover
      for (const tk of t.values()) {
        if (tk.pkey === id.pkey && tk.status === "matched" && tk.code && Date.now() - tk.at < 60_000) {
          return Response.json({ ticket: tk.ticket, status: "matched", code: tk.code, side: tk.side }, { headers: cors });
        }
      }
      const rating = isRatable(id.pkey, id.verified)
        ? ((await getChessRating(this.env, id.pkey).catch(() => null))?.rating ?? 1500)
        : 1500;
      const ticket = newTicket();
      const seek: Seek = { ticket, pkey: id.pkey, nick: id.nick, verified: id.verified, rating, at: Date.now() };
      q.set(id.pkey, seek);
      t.set(ticket, { ...seek, status: "searching" });
      await this.saveQueue();
      const matched = await this.tryMatch();
      if (matched?.has(id.pkey)) {
        const tk = t.get(ticket)!;
        return Response.json({ ticket, status: "matched", code: tk.code, side: tk.side }, { headers: cors });
      }
      return Response.json({ ticket, status: "searching" }, { headers: cors });
    }

    if (url.pathname === "/chess/mm/leave" && request.method === "POST") {
      const b: any = await request.json().catch(() => ({}));
      const ticket = String(b.ticket || "");
      const q = await this.qmap(), t = await this.tmap();
      const tk = t.get(ticket);
      if (tk) {
        q.delete(tk.pkey);
        tk.status = "cancelled";
        t.set(ticket, tk);
        await this.saveQueue();
      }
      return Response.json({ ok: true }, { headers: cors });
    }

    if (url.pathname === "/chess/mm/status" && request.method === "GET") {
      const ticket = url.searchParams.get("ticket") || "";
      const t = await this.tmap();
      const tk = t.get(ticket);
      if (!tk) return Response.json({ status: "gone" }, { headers: cors });
      if (tk.status === "matched" && tk.code) {
        return Response.json({ ticket: tk.ticket, status: "matched", code: tk.code, side: tk.side }, { headers: cors });
      }
      if (tk.status === "cancelled") return Response.json({ status: "cancelled" }, { headers: cors });
      // still searching — maybe we can match now
      await this.tryMatch();
      const fresh = t.get(ticket);
      if (fresh?.status === "matched" && fresh.code) {
        return Response.json({ ticket: fresh.ticket, status: "matched", code: fresh.code, side: fresh.side }, { headers: cors });
      }
      return Response.json({ ticket, status: "searching" }, { headers: cors });
    }

    return new Response("not found", { status: 404, headers: cors });
  }

  /** Pair seekers: oldest first, closest Glicko among remaining; if only two — they play. */
  async tryMatch(): Promise<Set<string> | null> {
    const q = await this.qmap(), t = await this.tmap();
    const matched = new Set<string>();
    const list = [...q.values()].sort((a, b) => a.at - b.at);
    while (list.length >= 2) {
      const a = list.shift()!;
      if (!q.has(a.pkey)) continue;
      let bi = 0, best = Infinity;
      for (let i = 0; i < list.length; i++) {
        const d = Math.abs(list[i].rating - a.rating);
        if (d < best) { best = d; bi = i; }
      }
      const b = list.splice(bi, 1)[0];
      if (!q.has(b.pkey)) { list.unshift(a); continue; }
      const sideA: "w" | "b" = Math.random() < 0.5 ? "w" : "b";
      const sideB: "w" | "b" = sideA === "w" ? "b" : "w";
      const code = await this.spawnMatch(a, b, sideA, sideB);
      if (!code) { list.unshift(b); list.unshift(a); break; }
      q.delete(a.pkey); q.delete(b.pkey);
      const ta = t.get(a.ticket), tb = t.get(b.ticket);
      if (ta) { ta.status = "matched"; ta.code = code; ta.side = sideA; ta.at = Date.now(); t.set(a.ticket, ta); }
      if (tb) { tb.status = "matched"; tb.code = code; tb.side = sideB; tb.at = Date.now(); t.set(b.ticket, tb); }
      matched.add(a.pkey); matched.add(b.pkey);
    }
    if (matched.size) await this.saveQueue();
    return matched.size ? matched : null;
  }

  async spawnMatch(a: Seek, b: Seek, sideA: "w" | "b", sideB: "w" | "b"): Promise<string | null> {
    if (!this.env.CHESS_MATCH) return null;
    const m = await this.lobs();
    for (let i = 0; i < 8; i++) {
      const code = newCode();
      if (m.has(code)) continue;
      const stub = this.env.CHESS_MATCH.get(this.env.CHESS_MATCH.idFromName(code));
      const res = await stub.fetch("https://internal/init", {
        method: "POST",
        body: JSON.stringify({
          code,
          pub: false,
          mm: true,
          seats: [
            { pkey: a.pkey, nick: a.nick, verified: a.verified, rating: a.rating, side: sideA },
            { pkey: b.pkey, nick: b.nick, verified: b.verified, rating: b.rating, side: sideB },
          ],
        }),
      });
      if (res.status === 409) continue;
      m.set(code, { code, pub: false, phase: "lobby", host: a.nick, n: 2, at: Date.now() });
      await this.saveLobs();
      return code;
    }
    return null;
  }
}
