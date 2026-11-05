// ChessIndex — реестр лобби «Боевых шахмат». Не трогает StratIndex.
import { DurableObject } from "cloudflare:workers";
import { originAllowed, isLocalRequest } from "../limits";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
type Lob = { code: string; pub: boolean; phase: string; host: string; n: number; at: number };

export class ChessIndex extends DurableObject {
  env: any; lobbies: Map<string, Lob> | null = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async lobs() { if (!this.lobbies) this.lobbies = new Map(Object.entries((await this.ctx.storage.get("lobs")) || {})); return this.lobbies; }
  async saveLobs() { const m = await this.lobs(), now = Date.now(); for (const [k, v] of m) if (now - v.at > 2 * 3600_000) m.delete(k); await this.ctx.storage.put("lobs", Object.fromEntries(m)); }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/report") {
      const b: any = await request.json().catch(() => null); if (!b || !CODE_RE.test(b.code)) return new Response("bad", { status: 400 });
      const m = await this.lobs(); m.set(b.code, { code: b.code, pub: !!b.pub, phase: String(b.phase), host: String(b.host || "").slice(0, 16), n: b.n | 0, at: Date.now() });
      await this.saveLobs(); return new Response("ok");
    }
    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    const cors: Record<string, string> = origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type" } });

    if (url.pathname === "/chess/new" && request.method === "POST") {
      const b: any = await request.json().catch(() => ({}));
      const m = await this.lobs();
      for (let i = 0; i < 8; i++) {
        const rnd = crypto.getRandomValues(new Uint8Array(6));
        const code = [...rnd].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
        if (m.has(code)) continue;
        if (!this.env.CHESS_MATCH) return Response.json({ err: "no_match_binding" }, { status: 503, headers: cors });
        const stub = this.env.CHESS_MATCH.get(this.env.CHESS_MATCH.idFromName(code));
        const res = await stub.fetch("https://internal/init", { method: "POST", body: JSON.stringify({ code, pub: !!b.pub }) });
        if (res.status === 409) continue;
        m.set(code, { code, pub: !!b.pub, phase: "lobby", host: "", n: 0, at: Date.now() }); await this.saveLobs();
        return Response.json({ code }, { headers: cors });
      }
      return Response.json({ err: "busy" }, { status: 503, headers: cors });
    }
    if (url.pathname === "/chess/open") {
      const list = [...(await this.lobs()).values()].filter((l) => l.pub && l.phase === "lobby" && l.n <= 1).slice(0, 30)
        .map(({ code, host, n }) => ({ code, host, n }));
      return Response.json({ list }, { headers: cors });
    }
    return new Response("not found", { status: 404, headers: cors });
  }
}
