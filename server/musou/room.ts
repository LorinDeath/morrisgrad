// Комната до 4 игроков. Толпу считает хост, награду — сервер по времени забега и D1.
import { DurableObject } from "cloudflare:workers";
import { identify } from "../strat/ident";
import { admitMessage, originAllowed, isLocalRequest, MSG_BURST } from "../limits";
import { ordaKey } from "./http";
import { loadProfile, saveProfile } from "./db";
import { beginRun, chainAt, clampStrike, diffLock, finishRun, floorByN, makeScript, memberDiffLock, mulberry32, roomOutcome, sheet } from "../../src/scripts/musou/rules";
import { diffRow, eliteHp, eliteName, floorKit, getTune } from "../../src/scripts/musou/tune";

type Seat = { pkey: string; nick: string; hero: string; verified: boolean; dmg: number; lvl: number; passed?: boolean[]; chain?: number[] };
type Elite = { id: string; kind: "general" | "boss"; name: string; x: number; y: number; hp: number; maxHp: number; facing: number; wind: number; alive: boolean; spawned: boolean; cd: number; pat: number; tint: string; sig: string; row: number };
type Lob = {
  code: string; pub: boolean; phase: "lobby" | "fight" | "done"; seats: Seat[]; host: string; floor: number; diff: number; nonce: string; started: number;
  seed: number; elites: Elite[]; pos: Record<string, { x: number; y: number; aim: number; at: number }>; paid: boolean; reports: Record<string, any>;
  party?: any[];
};
type Att = { url: string; pkey?: string; tk: number; at: number; st: number };

export class MusouRoom extends DurableObject {
  env: any;
  L: Lob | null = null;
  constructor(ctx: any, env: any) { super(ctx, env); this.env = env; }
  async load() {
    if (!this.L) this.L = (await this.ctx.storage.get("L")) || null;
    if (this.L && !(this.L.diff >= 1)) this.L.diff = 1;
    return this.L;
  }
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
      this.L = { code: String(b.code), pub: !!b.pub, phase: "lobby", seats: [], host: "", floor: 1, diff: 1, nonce: "", started: 0, seed: 1, elites: [], pos: {}, paid: false, reports: {} };
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
      type: "lobby", code: L.code, pub: L.pub, phase: L.phase, floor: L.floor, diff: L.diff || 1, hostId: L.host,
      seats: L.seats.map((s) => ({
        id: s.pkey, nick: s.nick, hero: s.hero, lvl: s.lvl | 0,
        passed: !!(s.passed && s.passed[(L.floor | 0) - 1]),
        chain: chainAt({ chain: s.chain, clears: (s.passed || []).map((x) => x ? 1 : 0) }, L.floor),
        online: this.ctx.getWebSockets().some((w) => w !== skip && (w.deserializeAttachment() as Att)?.pkey === s.pkey),
      })),
      need: floorNeed(L.floor),
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
        seat = { pkey: key, nick: id.nick, hero: prof.hero, verified: id.verified, dmg: 8, lvl: prof.lvl | 0, passed: prof.clears.map((c) => c > 0), chain: prof.chain };
        L.seats.push(seat);
        if (!L.host) L.host = key;
      } else {
        seat.nick = id.nick || seat.nick;
        const prof = await loadProfile(this.env.GAME_DB, key);
        seat.hero = prof.hero || seat.hero;
        seat.lvl = prof.lvl | 0;
        seat.passed = prof.clears.map((c) => c > 0);
        seat.chain = prof.chain;
      }
      a.pkey = key;
      ws.serializeAttachment(a);
      await this.save();
      await this.report();
      this.send(ws, { type: "you", id: key, nick: seat.nick, host: L.host === key });
      this.broadcast(this.seatView());
      if (L.phase === "fight" && L.party) {
        this.send(ws, { type: "go", floor: L.floor, diff: L.diff || 1, nonce: L.nonce, seed: L.seed, hostId: L.host, party: L.party });
        this.send(ws, { type: "elite", elites: L.elites || [] });
      }
      return;
    }
    const seat = L.seats.find((s) => s.pkey === a.pkey);
    if (!seat) return;
    if (m.type === "floor" && L.host === seat.pkey && L.phase === "lobby") {
      const n = m.floor | 0;
      if (n < 1 || n > 13) return;
      const prof = await loadProfile(this.env.GAME_DB, seat.pkey);
      seat.lvl = prof.lvl | 0;
      seat.passed = prof.clears.map((c) => c > 0);
      seat.chain = prof.chain;
      const lock = floorLock(prof, n);
      if (lock) return this.send(ws, { type: "err", err: lock });
      L.floor = n;
      const keep = diffLock(prof, n, L.diff || 1);
      if (keep) L.diff = 1;
      await this.save();
      this.broadcast(this.seatView());
      return;
    }
    if (m.type === "diff" && L.host === seat.pkey && L.phase === "lobby") {
      const d = m.diff | 0;
      if (d < 1 || d > 4) return;
      const prof = await loadProfile(this.env.GAME_DB, seat.pkey);
      seat.lvl = prof.lvl | 0;
      seat.passed = prof.clears.map((c) => c > 0);
      seat.chain = prof.chain;
      const lock = diffLock(prof, L.floor, d);
      if (lock) return this.send(ws, { type: "err", err: lock });
      L.diff = diffRow(d).id;
      await this.save();
      this.broadcast(this.seatView());
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
    if (m.type === "end" && L.phase === "fight") return this.finish(typeof m.reason === "string" ? m.reason : "");
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
    const short: string[] = [];
    const loaded: { s: Seat; p: Awaited<ReturnType<typeof loadProfile>> }[] = [];
    for (const s of L.seats) {
      const p = await loadProfile(this.env.GAME_DB, s.pkey);
      s.hero = p.hero || s.hero;
      s.lvl = p.lvl | 0;
      s.passed = p.clears.map((c) => c > 0);
      s.chain = p.chain;
      loaded.push({ s, p });
      const why = memberDiffLock(p.lvl | 0, (p.clears[L.floor - 1] || 0) > 0, L.floor, L.diff || 1, chainAt(p, L.floor));
      if (why) short.push(`${s.nick}: ${why}`);
    }
    if (short.length) {
      const f = floorByN(L.floor);
      const row = diffRow(L.diff || 1);
      return this.broadcast({ type: "err", err: `«${f.name}», «${row.name}» не для всей группы. ${short.join(" ")}` });
    }
    for (const { s, p } of loaded) {
      const opened = beginRun(p, L.floor, now, nonce, s.pkey !== L.host, L.diff || 1);
      if ("err" in opened) return this.broadcast({ type: "err", err: opened.err });
      const sh = sheet(p);
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
    L.party = party;
    await this.save();
    await this.report();
    this.broadcast({ type: "go", floor: L.floor, diff: L.diff || 1, nonce, seed: L.seed, hostId: L.host, party });
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
    const kit = floorKit(L.floor);
    const art = floorByN(L.floor);
    let changed = false;
    plan.forEach((s) => {
      if (elapsed < s.at || L.elites.some((e) => e.id === s.id)) return;
      const hp = eliteHp(s.kind, L.floor, L.seats.length, getTune(), L.diff || 1);
      const boss = s.kind === "boss";
      const sig = boss ? kit.bSig : kit.gSig;
      L.elites.push({
        id: s.id, kind: s.kind, name: eliteName(s.kind, L.floor), x: 1200, y: 700, hp, maxHp: hp,
        facing: 0, wind: 0, alive: true, spawned: true, cd: 0.8, pat: 0,
        tint: sig === "curse" ? "#c9b6ff" : boss ? "#ffd76a" : "#ff6a4a",
        sig, row: boss ? art.bRow : art.gRow,
      });
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
        if (e.wind <= 0) { e.wind = 0; e.pat++; changed = true; this.broadcast({ type: "boom", id: e.id, x: e.x, y: e.y, facing: e.facing, sig: e.sig, r: e.sig === "line" || e.sig === "cone" ? 168 : e.kind === "boss" ? 118 : 96 }); }
      } else if (e.cd <= 0) {
        e.wind = 0.5;
        e.cd = e.kind === "boss" ? 2.4 : 1.8;
        changed = true;
      }
    }
    if (changed || L.elites.length) this.broadcast({ type: "elite", elites: L.elites.map((e) => ({ id: e.id, kind: e.kind, name: e.name, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, facing: e.facing, wind: e.wind, alive: e.alive, tint: e.tint, sig: e.sig, row: e.row })) });
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
    this.broadcast({ type: "elite", elites: L.elites.map((x) => ({ id: x.id, kind: x.kind, name: x.name, x: x.x, y: x.y, hp: x.hp, maxHp: x.maxHp, facing: x.facing, wind: x.wind, alive: x.alive, tint: x.tint, sig: x.sig, row: x.row })) });
  }

  async finish(asked = "") {
    const L = this.L!;
    if (L.paid) {
      for (const s of L.seats) this.sendTo(s.pkey, { type: "loot", report: L.reports[s.pkey] || null, profile: null });
      return;
    }
    L.paid = true;
    const script = makeScript(L.floor, L.seed);
    const outcome = roomOutcome(script, Date.now() - L.started, L.elites);
    const reason = outcome.boss ? "win" : asked === "surrender" ? "surrender" : "dead";
    const rngBase = (Date.now() ^ L.started) >>> 0;
    for (const s of L.seats) {
      const p = await loadProfile(this.env.GAME_DB, s.pkey);
      let salt = 2166136261;
      for (let i = 0; i < s.pkey.length; i++) salt = Math.imul(salt ^ s.pkey.charCodeAt(i), 16777619);
      const r = finishRun(p, { nonce: L.nonce, party: L.seats.length, reason, boss: reason === "win" }, Date.now(), mulberry32((rngBase ^ salt) >>> 0), outcome);
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
