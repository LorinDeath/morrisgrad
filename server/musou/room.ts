// Комната до 4 игроков. Толпу считает хост, награду — сервер по времени забега и D1.
import { DurableObject } from "cloudflare:workers";
import { identify } from "../strat/ident";
import { admitMessage, originAllowed, isLocalRequest, MSG_BURST } from "../limits";
import { ordaKey } from "./http";
import { loadProfile, saveProfile } from "./db";
import { beginRun, clampStrike, finishRun, floorOpen, makeScript, mulberry32, roomOutcome, sheet } from "../../src/scripts/musou/rules";

type Seat = { pkey: string; nick: string; hero: string; verified: boolean; dmg: number };
type Elite = { id: string; kind: "general" | "boss"; name: string; x: number; y: number; hp: number; maxHp: number; facing: number; wind: number; alive: boolean; spawned: boolean; cd: number; pat: number; tint: string };
type Lob = {
  code: string; pub: boolean; phase: "lobby" | "fight" | "done"; seats: Seat[]; host: string; floor: number; nonce: string; started: number;
  seed: number; elites: Elite[]; pos: Record<string, { x: number; y: number; aim: number; at: number }>; paid: boolean; reports: Record<string, any>;
};
type Att = { url: string; pkey?: string; tk: number; at: number; st: number };

export class MusouRoom extends DurableObject {
  env: any;
  L: Lob | null = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async load() { if (!this.L) this.L = (await this.ctx.storage.get("L")) || null; return this.L; }
  async save() { if (this.L) await this.ctx.storage.put("L", this.L); }
  send(ws: WebSocket, o: any) { try { ws.send(JSON.stringify(o)); } catch { /* closed */ } }
  broadcast(o: any, skip?: WebSocket) {
    const s = JSON.stringify(o);
    for (const ws of this.ctx.getWebSockets()) if (ws !== skip) try { ws.send(s); } catch { /* */ }
  }
  async report() {
    if (!this.L || !this.env.MUSOU_INDEX) return;
    const stub = this.env.MUSOU_INDEX.get(this.env.MUSOU_INDEX.idFromName("index"));
    const n = this.L.phase === "lobby" ? this.L.seats.length : this.L.seats.length;
    const phase = this.L.seats.length === 0 && this.L.phase !== "fight" ? "gone" : this.L.phase;
    await stub.fetch("https://internal/report", { method: "POST", body: JSON.stringify({ code: this.L.code, pub: this.L.pub, phase, host: this.L.host, n: phase === "gone" ? 0 : n }) }).catch(() => {});
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "internal" && url.pathname === "/init" && request.method === "POST") {
      if (await this.load()) return new Response("exists", { status: 409 });
      const b: any = await request.json().catch(() => ({}));
      this.L = { code: String(b.code), pub: !!b.pub, phase: "lobby", seats: [], host: "", floor: 1, nonce: "", started: 0, seed: 1, elites: [], pos: {}, paid: false, reports: {} };
      await this.save();
      return new Response("ok");
    }
    const local = isLocalRequest(request);
    const origin = request.headers.get("Origin");
    if (!originAllowed(this.env, origin, local)) return new Response("forbidden", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("ws only", { status: 426 });
    if (!(await this.load())) return new Response("no lobby", { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ url: request.url, tk: MSG_BURST, at: Date.now(), st: 0 } satisfies Att);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  seatView(skip?: WebSocket) {
    const L = this.L!;
    return {
      type: "lobby", code: L.code, pub: L.pub, phase: L.phase, floor: L.floor, hostId: L.host,
      seats: L.seats.map((s) => ({ id: s.pkey, nick: s.nick, hero: s.hero, online: this.ctx.getWebSockets().some((w) => w !== skip && (w.deserializeAttachment() as Att)?.pkey === s.pkey) })),
    };
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Att;
    const lim = { tokens: a.tk, at: a.at, strikes: a.st };
    const vr = admitMessage(lim, raw, Date.now());
    a.tk = lim.tokens; a.at = lim.at; a.st = lim.strikes;
    ws.serializeAttachment(a);
    if (vr !== "ok") { if (vr === "close") try { ws.close(1008, "flood"); } catch { /* */ } return; }
    let m: any; try { m = JSON.parse(raw as string); } catch { return; }
    const L = await this.load(); if (!L) return;

    if (m.type === "hello") {
      const id = await identify(this.env, a.url, m);
      if ("err" in id) return this.send(ws, { type: "err", err: id.err });
      const key = ordaKey(id.pkey, id.verified);
      let seat = L.seats.find((s) => s.pkey === key);
      if (!seat) {
        if (L.phase !== "lobby" || L.seats.length >= 4) return this.send(ws, { type: "err", err: "Комната полна или бой уже идёт" });
        const prof = await loadProfile(this.env.GAME_DB, key);
        if (!prof.hero) return this.send(ws, { type: "err", err: "Сначала выбери героя" });
        seat = { pkey: key, nick: id.nick, hero: prof.hero, verified: id.verified, dmg: 8 };
        L.seats.push(seat);
        if (!L.host) L.host = key;
      } else seat.nick = id.nick || seat.nick;
      a.pkey = key;
      ws.serializeAttachment(a);
      await this.save();
      await this.report();
      this.send(ws, { type: "you", id: key, nick: seat.nick, host: L.host === key });
      this.broadcast(this.seatView());
      return;
    }
    const seat = L.seats.find((s) => s.pkey === a.pkey);
    if (!seat) return;
    if (m.type === "floor" && L.host === seat.pkey && L.phase === "lobby") {
      const n = m.floor | 0;
      if (n >= 1 && n <= 13) { L.floor = n; await this.save(); this.broadcast(this.seatView()); }
      return;
    }
    if (m.type === "start" && L.host === seat.pkey && L.phase === "lobby") return this.startFight();
    if (m.type === "pos" && L.phase === "fight") {
      const x = Number(m.x), y = Number(m.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        L.pos[seat.pkey] = { x: Math.max(0, Math.min(2400, x)), y: Math.max(0, Math.min(1560, y)), aim: Number(m.aim) || 0, at: Date.now() };
        this.broadcast({ type: "who", id: seat.pkey, x: L.pos[seat.pkey].x, y: L.pos[seat.pkey].y, aim: L.pos[seat.pkey].aim }, ws);
      }
      this.pump();
      return;
    }
    if (m.type === "hit" && L.phase === "fight") {
      this.pump();
      this.strikeElite(seat, String(m.id || ""), String(m.kind || "light"));
      return;
    }
    if (m.type === "end" && L.phase === "fight") return this.finish();
    if (m.type === "leave" && L.phase === "lobby") {
      L.seats = L.seats.filter((s) => s.pkey !== seat.pkey);
      if (L.host === seat.pkey) L.host = L.seats[0]?.pkey || "";
      await this.save(); await this.report();
      this.broadcast(this.seatView());
    }
  }

  async startFight() {
    const L = this.L!;
    const now = Date.now();
    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const party: any[] = [];
    for (const s of L.seats) {
      const p = await loadProfile(this.env.GAME_DB, s.pkey);
      if (s.pkey === L.host && !floorOpen(p, L.floor)) return this.broadcast({ type: "err", err: "У хоста закрыт этот этаж" });
      const sh = sheet(p);
      const opened = beginRun(p, L.floor, now, nonce, s.pkey !== L.host);
      if ("err" in opened) return this.broadcast({ type: "err", err: opened.err });
      await saveProfile(this.env.GAME_DB, s.pkey, p);
      s.dmg = sh.dmg;
      party.push({ id: s.pkey, nick: s.nick, hero: p.hero, sheet: sh });
    }
    L.phase = "fight";
    L.nonce = nonce;
    L.started = now;
    L.seed = (now % 100000) + L.floor;
    L.elites = [];
    L.pos = {};
    L.paid = false;
    L.reports = {};
    await this.save();
    await this.report();
    this.broadcast({ type: "go", floor: L.floor, nonce, seed: L.seed, hostId: L.host, party });
  }

  pump() {
    const L = this.L;
    if (!L || L.phase !== "fight") return;
    L.elites = L.elites || [];
    L.pos = L.pos || {};
    L.reports = L.reports || {};
    const elapsed = Date.now() - L.started;
    const script = makeScript(L.floor, L.seed);
    const plan = [
      { id: "g0", at: script.genAt[0], kind: "general" as const },
      { id: "g1", at: script.genAt[1], kind: "general" as const },
      { id: "g2", at: script.genAt[2], kind: "general" as const },
      { id: "boss", at: script.bossAt, kind: "boss" as const },
    ];
    const names = ["Страж волны", "Страж волны", "Страж волны", "Хозяин этажа"];
    let changed = false;
    plan.forEach((s, i) => {
      if (elapsed < s.at || L.elites.some((e) => e.id === s.id)) return;
      const hp = s.kind === "boss" ? 1500 + L.floor * 620 : 680 + L.floor * 300;
      L.elites.push({ id: s.id, kind: s.kind, name: names[i], x: 1200, y: 700, hp, maxHp: hp, facing: 0, wind: 0, alive: true, spawned: true, cd: 0.8, pat: 0, tint: s.kind === "boss" ? "#ffd76a" : "#ff6a4a" });
      changed = true;
    });
    const pts = Object.values(L.pos);
    const ax = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 1200;
    const ay = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : 780;
    for (const e of L.elites) {
      if (!e.alive) continue;
      const dx = ax - e.x, dy = ay - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.x += (dx / len) * 18;
      e.y += (dy / len) * 18;
      e.facing = Math.atan2(dy, dx);
      e.cd -= 0.1;
      if (e.wind > 0) {
        e.wind -= 0.1;
        if (e.wind <= 0) { e.wind = 0; e.pat++; changed = true; this.broadcast({ type: "boom", id: e.id, x: e.x, y: e.y, r: e.kind === "boss" ? 150 : 110 }); }
      } else if (e.cd <= 0) {
        e.wind = 0.5;
        e.cd = e.kind === "boss" ? 2.4 : 1.8;
        changed = true;
      }
    }
    if (changed || L.elites.length) this.broadcast({ type: "elite", elites: L.elites.map((e) => ({ id: e.id, kind: e.kind, name: e.name, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, facing: e.facing, wind: e.wind, alive: e.alive, tint: e.tint })) });
  }

  strikeElite(seat: Seat, id: string, kind: string) {
    const L = this.L!;
    const e = L.elites.find((x) => x.id === id && x.alive);
    const pos = L.pos[seat.pkey];
    if (!e || !pos) return;
    if (Math.hypot(e.x - pos.x, e.y - pos.y) > 320) return;
    const now = Date.now();
    const prev = (L.reports["hit:" + seat.pkey] as number) || 0;
    if (now - prev < 220) return;
    L.reports["hit:" + seat.pkey] = now;
    e.hp -= clampStrike(seat.dmg || 8, kind);
    if (e.hp <= 0) { e.hp = 0; e.alive = false; }
    this.broadcast({ type: "elite", elites: L.elites.map((x) => ({ id: x.id, kind: x.kind, name: x.name, x: x.x, y: x.y, hp: x.hp, maxHp: x.maxHp, facing: x.facing, wind: x.wind, alive: x.alive, tint: x.tint })) });
  }

  async finish() {
    const L = this.L!;
    if (L.paid) {
      for (const s of L.seats) this.sendTo(s.pkey, { type: "loot", report: L.reports[s.pkey] || null, profile: null });
      return;
    }
    L.paid = true;
    const script = makeScript(L.floor, L.seed);
    const outcome = roomOutcome(script, Date.now() - L.started, L.elites);
    const rngBase = (Date.now() ^ L.started) >>> 0;
    for (const s of L.seats) {
      const p = await loadProfile(this.env.GAME_DB, s.pkey);
      const r = finishRun(p, { nonce: L.nonce, party: L.seats.length }, Date.now(), mulberry32((rngBase + s.pkey.length * 13) >>> 0), outcome);
      if (!("err" in r)) await saveProfile(this.env.GAME_DB, s.pkey, p);
      L.reports[s.pkey] = "err" in r ? null : r;
      this.sendTo(s.pkey, { type: "loot", report: L.reports[s.pkey], profile: p, err: "err" in r ? r.err : null });
    }
    L.phase = "done";
    await this.save();
    await this.report();
  }

  sendTo(pkey: string, o: any) {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Att)?.pkey === pkey) this.send(ws, o);
    }
  }

  async webSocketClose(ws: WebSocket) { await this.gone(ws); }
  async webSocketError(ws: WebSocket) { await this.gone(ws); }
  async gone(ws: WebSocket) {
    const L = await this.load(); if (!L) return;
    const pk = (ws.deserializeAttachment() as Att)?.pkey;
    if (!pk || L.phase !== "lobby") return;
    L.seats = L.seats.filter((s) => s.pkey !== pk);
    if (L.host === pk) L.host = L.seats[0]?.pkey || "";
    await this.save(); await this.report();
    this.broadcast(this.seatView(ws));
  }
}
