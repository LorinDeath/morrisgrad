// Реестр комнат «Орды», присутствие и приглашения. Сумки здесь нет — они в D1.
import { DurableObject } from "cloudflare:workers";
import { originAllowed, isLocalRequest, admitMessage, MSG_BURST } from "../limits";
import { identify } from "../strat/ident";
import { ordaKey } from "./http";
import { loadProfile } from "./db";
import { PLAZA_CAP, PLAZA_SHARDS, pickShard, plazaName } from "./plaza";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

type Lob = { code: string; pub: boolean; phase: string; host: string; n: number; at: number };
type Pres = { nick: string; at: number };
type Inv = { from: string; code: string; at: number };

function newCode() {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return [...rnd].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export class MusouIndex extends DurableObject {
  env: any;
  lobs: Map<string, Lob> | null = null;
  pres: Map<string, Pres> | null = null;
  invites: Map<string, Inv> | null = null;
  yard = new Map<string, { nick: string; hero: string; lvl: number; say: string; tag: string }>();
  plazaCounts: Record<string, number> | null = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }

  async lobbies() {
    if (!this.lobs) this.lobs = new Map(Object.entries((await this.ctx.storage.get("lobs")) || {}));
    return this.lobs;
  }
  async presence() {
    if (!this.pres) this.pres = new Map(Object.entries((await this.ctx.storage.get("pres")) || {}));
    return this.pres;
  }
  async invs() {
    if (!this.invites) this.invites = new Map(Object.entries((await this.ctx.storage.get("inv")) || {}));
    return this.invites;
  }

  cors(origin: string | null) {
    return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } as Record<string, string> : {};
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/musou/p/")) return this.openPlaza(request, url);
    if (url.hostname === "internal" && url.pathname === "/plaza") {
      const b: any = await request.json().catch(() => ({}));
      const counts = await this.shards();
      const name = String(b.shard || "");
      if (/^plaza-[0-7]$/.test(name)) counts[name] = Math.max(0, b.n | 0);
      await this.ctx.storage.put("plazaCounts", counts);
      return new Response("ok");
    }
    if (url.hostname === "internal" && url.pathname === "/report") {
      const b: any = await request.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code)) return new Response("bad", { status: 400 });
      const m = await this.lobbies();
      if (b.phase === "gone" || (b.n | 0) <= 0) m.delete(b.code);
      else m.set(b.code, { code: b.code, pub: !!b.pub, phase: String(b.phase), host: String(b.host || "").slice(0, 24), n: b.n | 0, at: Date.now() });
      await this.ctx.storage.put("lobs", Object.fromEntries(m));
      return new Response("ok");
    }
    if (url.hostname === "internal" && url.pathname === "/presence") {
      const b: any = await request.json().catch(() => ({}));
      const keys: string[] = Array.isArray(b.keys) ? b.keys : [];
      const p = await this.presence();
      const now = Date.now();
      const online = keys.filter((k) => { const v = p.get(k); return v && now - v.at < 25_000; });
      return Response.json({ online });
    }
    if (url.hostname === "internal" && url.pathname === "/invite") {
      const b: any = await request.json().catch(() => ({}));
      const inv = await this.invs();
      inv.set(String(b.to), { from: String(b.from || ""), code: String(b.code || ""), at: Date.now() });
      await this.ctx.storage.put("inv", Object.fromEntries(inv));
      return new Response("ok");
    }

    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    const cors = this.cors(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Max-Age": "600" } });
    }

    if (url.pathname === "/musou/new" && request.method === "POST") {
      const b: any = await request.json().catch(() => ({}));
      const m = await this.lobbies();
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        if (m.has(code)) continue;
        if (!this.env.MUSOU_ROOM) return Response.json({ err: "no_room" }, { status: 503, headers: cors });
        const stub = this.env.MUSOU_ROOM.get(this.env.MUSOU_ROOM.idFromName(code));
        const res = await stub.fetch("https://internal/init", { method: "POST", body: JSON.stringify({ code, pub: b.pub !== false }) });
        if (res.status === 409) continue;
        m.set(code, { code, pub: b.pub !== false, phase: "lobby", host: "", n: 0, at: Date.now() });
        await this.ctx.storage.put("lobs", Object.fromEntries(m));
        return Response.json({ code }, { headers: cors });
      }
      return Response.json({ err: "busy" }, { status: 503, headers: cors });
    }

    if (url.pathname === "/musou/plaza") {
      const counts = await this.shards();
      const nums = Array.from({ length: PLAZA_SHARDS }, (_, i) => counts[plazaName(i)] | 0);
      const pick = pickShard(nums);
      if ("err" in pick) return Response.json({ err: pick.err, cap: PLAZA_CAP, shards: PLAZA_SHARDS }, { status: 503, headers: cors });
      return Response.json({ shard: plazaName(pick.shard), n: pick.n, cap: PLAZA_CAP, shards: PLAZA_SHARDS }, { headers: cors });
    }

    if (url.pathname === "/musou/open") {
      const m = await this.lobbies();
      const now = Date.now();
      for (const [k, v] of m) if (now - v.at > 15 * 60_000) m.delete(k);
      const list = [...m.values()].filter((l) => l.pub && l.phase === "lobby" && l.n < 4).slice(0, 20);
      return Response.json({ list }, { headers: cors });
    }

    if (url.pathname === "/musou/ping" && request.method === "POST") {
      const b: any = await request.json().catch(() => ({}));
      const id = await identify(this.env, request.url, b);
      if ("err" in id) return Response.json({ err: id.err }, { status: 401, headers: cors });
      const key = ordaKey(id.pkey, id.verified);
      const p = await this.presence();
      const now = Date.now();
      p.set(key, { nick: id.nick, at: now });
      for (const [k, v] of p) if (now - v.at > 60_000) p.delete(k);
      await this.ctx.storage.put("pres", Object.fromEntries(p));
      const inv = await this.invs();
      const mine = inv.get(key);
      if (mine && now - mine.at > 60_000) { inv.delete(key); await this.ctx.storage.put("inv", Object.fromEntries(inv)); }
      return Response.json({ invite: mine && now - mine.at < 60_000 ? mine : null }, { headers: cors });
    }

    return new Response("not found", { status: 404, headers: cors });
  }

  async shards() {
    if (!this.plazaCounts) this.plazaCounts = (await this.ctx.storage.get("plazaCounts")) || {};
    return this.plazaCounts!;
  }

  yardView(self?: string) {
    return {
      type: "yard",
      cap: PLAZA_CAP,
      shards: PLAZA_SHARDS,
      you: self || "",
      people: [...this.yard.values()].map((p) => ({ tag: p.tag, nick: p.nick, hero: p.hero, lvl: p.lvl, say: p.say })),
    };
  }

  yardSend(ws: WebSocket, o: unknown) { try { ws.send(JSON.stringify(o)); } catch { /* closed */ } }

  yardBroadcast() {
    const body = JSON.stringify(this.yardView());
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as { kind?: string; tag?: string };
      if (a?.kind !== "plaza") continue;
      try { ws.send(JSON.stringify(this.yardView(a.tag))); } catch { /* */ }
    }
    void body;
  }

  async yardReport(url: URL) {
    const shard = url.pathname.split("/").pop() || "";
    if (!this.env.MUSOU_INDEX) return;
    const stub = this.env.MUSOU_INDEX.get(this.env.MUSOU_INDEX.idFromName("index"));
    await stub.fetch("https://internal/plaza", { method: "POST", body: JSON.stringify({ shard, n: this.yard.size }) }).catch(() => {});
  }

  openPlaza(request: Request, url: URL) {
    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ n: this.yard.size, cap: PLAZA_CAP });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ kind: "plaza", url: request.url, tk: MSG_BURST, at: Date.now(), st: 0, said: 0 });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as { kind?: string; url?: string; tk: number; at: number; st: number; pkey?: string; tag?: string; said?: number };
    if (a?.kind !== "plaza") return;
    const lim = { tokens: a.tk, at: a.at, strikes: a.st };
    const vr = admitMessage(lim, raw, Date.now());
    a.tk = lim.tokens; a.at = lim.at; a.st = lim.strikes;
    ws.serializeAttachment(a);
    if (vr !== "ok") { if (vr === "close") try { ws.close(1008, "flood"); } catch { /* */ } return; }
    let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === "hello") {
      const id = await identify(this.env, a.url || "", m);
      if ("err" in id) return this.yardSend(ws, { type: "err", err: id.err });
      const key = ordaKey(id.pkey, id.verified);
      if (!this.yard.has(key) && this.yard.size >= PLAZA_CAP) {
        this.yardSend(ws, { type: "err", err: "Этот осколок двора полон" });
        try { ws.close(1013, "full"); } catch { /* */ }
        return;
      }
      const prof = await loadProfile(this.env.GAME_DB, key);
      const tag = key.slice(-4);
      this.yard.set(key, { nick: id.nick, hero: prof.hero || "lorin", lvl: prof.lvl | 0 || 1, say: this.yard.get(key)?.say || "", tag });
      a.pkey = key; a.tag = tag;
      ws.serializeAttachment(a);
      this.yardSend(ws, { type: "you", tag });
      this.yardBroadcast();
      await this.yardReport(new URL(a.url || "https://internal/musou/p/plaza-0"));
      return;
    }
    const me = a.pkey ? this.yard.get(a.pkey) : undefined;
    if (!me) return;
    if (m.type === "say") {
      const now = Date.now();
      if (now - (a.said || 0) < 2000) return;
      const text = String(m.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (text.length < 1) return;
      a.said = now;
      ws.serializeAttachment(a);
      me.say = text;
      this.yardBroadcast();
    }
  }

  async webSocketClose(ws: WebSocket) {
    const a = ws.deserializeAttachment() as { kind?: string; pkey?: string; url?: string };
    if (a?.kind !== "plaza" || !a.pkey) return;
    this.yard.delete(a.pkey);
    this.yardBroadcast();
    if (a.url) await this.yardReport(new URL(a.url));
  }
}
