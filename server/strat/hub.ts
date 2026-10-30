// StratIndex — маленький общий DO (один экземпляр): реестр кодов лобби, публичные лобби, кто онлайн на странице игры,
// пересылка приглашений. Партий здесь нет — только справочные данные, нагрузка мала.
import { DurableObject } from "cloudflare:workers";
import { admitMessage, originAllowed, isLocalRequest, MSG_BURST } from "../limits";
import { identify } from "./ident";
import { CODE_ALPHABET, CODE_RE } from "./match";
import { SIZES } from "./rules";

type Lob = { code: string; pub: boolean; phase: string; size: number; host: string; n: number; at: number };
type Att = { pkey?: string; nick?: string; sid?: string; url: string; tk: number; at: number; st: number; inv: number };
const NEW_PER_MIN = 6, INVITE_GAP_MS = 10_000, INVITE_TTL_S = 60, LOBBY_LIST_TTL = 2 * 3600_000;

export class StratIndex extends DurableObject {
  env: any; lobbies: Map<string, Lob> | null = null; newRate = new Map<string, number[]>();
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async lobs() { if (!this.lobbies) this.lobbies = new Map(Object.entries((await this.ctx.storage.get("lobs")) || {})); return this.lobbies; }
  async saveLobs() { const m = await this.lobs(), now = Date.now(); for (const [k, v] of m) if (now - v.at > LOBBY_LIST_TTL) m.delete(k); await this.ctx.storage.put("lobs", Object.fromEntries(m)); }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/report") {
      const b: any = await request.json().catch(() => null); if (!b || !CODE_RE.test(b.code)) return new Response("bad", { status: 400 });
      const m = await this.lobs(); m.set(b.code, { code: b.code, pub: !!b.pub, phase: String(b.phase), size: b.size | 0, host: String(b.host).slice(0, 16), n: b.n | 0, at: Date.now() });
      await this.saveLobs(); return new Response("ok");
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
      a.pkey = id.pkey; a.nick = id.nick; a.sid = prev ? prev[1].sid : [...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, "0")).join("");
      ws.serializeAttachment(a); this.send(ws, { type: "hello_ok", nick: id.nick, guest: !id.verified, sid: a.sid }); this.pushOnline(); return;
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
    if (m?.type === "decline" && typeof m.to === "string") return; // этап 1: отказ просто закрывает плашку у приглашённого
  }
  async webSocketClose() { this.pushOnline(); }
  async webSocketError() { this.pushOnline(); }
}
