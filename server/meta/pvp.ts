// «Проклятые»: PvP-дуэли — полностью на сервере.
// Вызов (duel_challenge) → приглашение цели (15 с) → принятие (duel_respond) → отдельная арена 25×25 клеток
// (мир "arena", своя группа видимости arena:<id>) → полное лечение и сброс перезарядок → отсчёт 3 с
// (движение и урон заблокированы) → бой до 0 ОЗ / сдачи / отключения / 3 минут (тогда побеждает больший % ОЗ,
// равенство — ничья) → результат, оба — на безопасную точку Аринара с полным здоровьем. Наград нет.
// Урон считает сервер: статы героев (снаряжение, таланты) — с сервера, разброс/крит — криптографический ГСЧ,
// темп ударов и перезарядки — серверные, попадание — по позициям сервера и форме удара оружия.
// Клиентские числа урона и любые «duel_action» игнорируются. Счёт — в D1 (миграция 0005_duels.sql).
import { WEAPON_TYPES, ABILITY_BY_ID, ZONE_RESPAWN, volleyDirs } from "./defs";
import { traitsFor, applyTraits } from "./admin";
import { cryptoRand } from "./profile";
import { castShape, AUTO_SPRITE, shotAim } from "./abilityShapes";
import { PROJ_SPEED } from "./zone";
const W_ARENA = WORLD_SIZES.arena;
import { WORLD_SIZES, worldBounds } from "../worlds/sizes";

export const DUEL_INVITE_MS = 15_000;
export const DUEL_COUNTDOWN_MS = 3_000;
export const DUEL_FIGHT_MS = 180_000;
export const CHALLENGE_GAP_MS = 4_000;      // не чаще одного вызова в 4 с
export const CHALLENGE_PER_MIN = 6;          // и не больше 6 в минуту
export const SAME_TARGET_GAP_MS = 20_000;    // повторный вызов того же игрока после отказа/таймаута
export const PVP_ATK_MULT = 0.6;             // PvP-множители: бой длится десятки секунд, а не два удара
export const PVP_ABIL_MULT = 0.45;
export const HERO_R = 14;
const ARENA = WORLD_SIZES.arena;
export const ARENA_SPAWNS = [{ x: Math.round(ARENA * 0.28), y: Math.round(ARENA / 2) }, { x: Math.round(ARENA * 0.72), y: Math.round(ARENA / 2) }];
const DUEL_WORLDS = new Set(["hellfire", "arinar"]);

export type Invite = { from: string; to: string; at: number; world: string };
export type Duel = {
  id: string; sids: [string, string]; pkeys: [string, string]; heroes: [string, string]; names: [string, string];
  phase: "countdown" | "fight" | "over"; startAt: number; fightAt: number; endAt: number;
  ev: any[]; lastSent: number; hits: [number, number];
  projs?: DuelProj[]; projAt?: number; nextProj?: number;
};
/** снаряд дуэли: летит на сервере, попадает, если на пути окажется соперник (от него можно увернуться) */
export type DuelProj = { id: number; owner: 0 | 1; t: string; x: number; y: number; dx: number; dy: number; spd: number; range: number; flown: number; w: number; max: number; n: number; arc?: boolean;
  onHit?: (i: number) => void; onEnd?: (x: number, y: number, hit: boolean) => void };

export interface PvpHost {
  ms: Map<string, any>;
  ally?(a: string, b: string): boolean; // члены одного отряда — не бьют друг друга
  sessionLookup: ((sid: string) => [WebSocket, any] | null) | null;
  effective(session: any): any;
  rsAbilityOf?(session: any): any; // слот R (навык оружия — любой навык игры)
  send(ws: WebSocket, obj: any): void;
  displayName(session: any): string;
  recordDuel(d: Duel, winner: 0 | 1 | null, reason: string): Promise<void>;
  duelRecord(pkey: string): Promise<{ w: number; l: number; d: number }>;
  onWorldChange(ws: WebSocket, session: any): void;
  onPlayersChanged: (() => void) | null;
  duelBlock?(from: string, to: string): string | null; // настройки аккаунта цели: все / друзья / никто, «не беспокоить»
}

export class Pvp {
  host: PvpHost;
  invites = new Map<string, Invite>();          // по sid цели
  duels = new Map<string, Duel>();
  bySid = new Map<string, string>();            // sid → id дуэли
  rl = new Map<string, number[]>();             // sid → времена вызовов
  pairGap = new Map<string, number>();          // "from>to" → до какого момента нельзя снова
  constructor(host: PvpHost) { this.host = host; }

  inDuel(sid: string) { return this.bySid.has(sid); }
  frozen(session: any) { const id = this.bySid.get(session?.id); const d = id ? this.duels.get(id) : null; return !!d && d.phase !== "fight"; }

  private err(ws: WebSocket, message: string) { this.host.send(ws, { type: "duel_err", message }); }
  private pendingOf(sid: string) { for (const inv of this.invites.values()) if (inv.from === sid) return inv; return null; }

  // общие условия: оба онлайн, герой выбран, не в забеге / старом бою / другой дуэли, живы, в одном открытом мире
  private eligible(s: any): string | null {
    const ms = this.host.ms.get(s?.id);
    if (!ms || !ms.ready) return "профиль ещё загружается";
    if (!s.stats?.classId) return "сначала выберите героя";
    if (s.runRoom) return "в забеге";
    if (s.inDuel || this.bySid.has(s.id)) return "уже в бою";
    if (!DUEL_WORLDS.has(s.world || "hellfire")) return "здесь дуэли недоступны";
    if (!ms.zp.alive) return "повержен";
    return null;
  }

  challenge(ws: WebSocket, session: any, msg: any) {
    const now = Date.now();
    const toSid = String(msg.sid || "");
    const mine = this.eligible(session);
    if (mine) return this.err(ws, `Нельзя вызвать на дуэль: ${mine}`);
    const t = (this.rl.get(session.id) || []).filter((x) => now - x < 60_000);
    if ((t.length && now - t[t.length - 1] < CHALLENGE_GAP_MS) || t.length >= CHALLENGE_PER_MIN) return this.err(ws, "Слишком часто — подождите немного");
    if (!toSid || toSid === session.id) return this.err(ws, "Выберите другого игрока");
    if (this.host.ally?.(session.id, toSid)) return this.err(ws, "Это союзник по отряду — сначала выйдите из отряда");
    const e = this.host.sessionLookup?.(toSid);
    if (!e) return this.err(ws, "Игрок не в сети");
    const [tws, ts] = e;
    const tms = this.host.ms.get(ts.id), mms = this.host.ms.get(session.id);
    if (tms && mms && tms.pkey === mms.pkey) return this.err(ws, "Нельзя вызвать самого себя");
    const blocked = tms && mms ? this.host.duelBlock?.(mms.pkey, tms.pkey) : null;
    if (blocked) return this.err(ws, `Нельзя вызвать на дуэль: ${blocked}`);
    const theirs = this.eligible(ts);
    if (theirs) return this.err(ws, `Игрок недоступен: ${theirs}`);
    if ((ts.world || "hellfire") !== (session.world || "hellfire")) return this.err(ws, "Игрок в другом мире");
    if (this.invites.has(ts.id) || this.pendingOf(ts.id)) return this.err(ws, "Игрок уже решает другой вызов");
    if (this.pendingOf(session.id)) return this.err(ws, "Вы уже ждёте ответа на вызов");
    if (this.invites.has(session.id)) return this.err(ws, "Сначала ответьте на свой вызов");
    if ((this.pairGap.get(`${session.id}>${ts.id}`) || 0) > now) return this.err(ws, "Этот игрок недавно отказал — попробуйте позже");
    t.push(now); this.rl.set(session.id, t);
    const inv: Invite = { from: session.id, to: ts.id, at: now, world: session.world || "hellfire" };
    this.invites.set(ts.id, inv);
    const eff = this.host.effective(session);
    this.host.send(tws, { type: "pvp_invite", from: session.id, name: this.host.displayName(session), cls: session.stats.classId, lvl: eff.level || 1, ms: DUEL_INVITE_MS });
    this.host.send(ws, { type: "duel_pending", to: ts.id, name: this.host.displayName(ts), ms: DUEL_INVITE_MS });
  }

  respond(ws: WebSocket, session: any, msg: any) {
    const inv = this.invites.get(session.id);
    if (!inv || inv.from !== String(msg.from || "")) return this.err(ws, "Вызов уже недействителен");
    this.invites.delete(session.id);
    const e = this.host.sessionLookup?.(inv.from);
    const now = Date.now();
    if (!msg.accept) {
      this.pairGap.set(`${inv.from}>${session.id}`, now + SAME_TARGET_GAP_MS);
      if (e) this.host.send(e[0], { type: "duel_declined", name: this.host.displayName(session) });
      this.host.send(ws, { type: "duel_closed", from: inv.from });
      return;
    }
    if (!e) return this.err(ws, "Соперник ушёл");
    if (now - inv.at > DUEL_INVITE_MS) return this.err(ws, "Время на ответ истекло");
    const [cws, cs] = e;
    const why = this.eligible(cs) || this.eligible(session);
    if (why) { this.err(ws, `Дуэль не началась: ${why}`); this.host.send(cws, { type: "duel_err", message: `Дуэль не началась: ${why}` }); return; }
    if ((cs.world || "hellfire") !== (session.world || "hellfire")) { this.err(ws, "Соперник в другом мире"); return; }
    this.start([cws, cs], [ws, session], now);
  }

  cancel(ws: WebSocket, session: any) {
    const inv = this.pendingOf(session.id);
    if (!inv) return;
    this.invites.delete(inv.to);
    const e = this.host.sessionLookup?.(inv.to);
    if (e) this.host.send(e[0], { type: "duel_closed", from: session.id });
    this.host.send(ws, { type: "duel_closed", to: inv.to });
  }

  private start(a: [WebSocket, any], b: [WebSocket, any], now: number) {
    const id = crypto.randomUUID();
    const pair = [a, b];
    // приглашения обоих (входящие и исходящие) снимаются
    for (const [, s] of pair) { this.invites.delete(s.id); const p = this.pendingOf(s.id); if (p) this.invites.delete(p.to); }
    const d: Duel = {
      id, sids: [a[1].id, b[1].id], pkeys: [this.host.ms.get(a[1].id).pkey, this.host.ms.get(b[1].id).pkey],
      heroes: [a[1].stats.classId, b[1].stats.classId], names: [this.host.displayName(a[1]), this.host.displayName(b[1])],
      phase: "countdown", startAt: now, fightAt: now + DUEL_COUNTDOWN_MS, endAt: now + DUEL_COUNTDOWN_MS + DUEL_FIGHT_MS, ev: [], lastSent: 0, hits: [0, 0],
    };
    this.duels.set(id, d);
    pair.forEach(([ws, s], i) => {
      const ms = this.host.ms.get(s.id);
      this.bySid.set(s.id, id);
      s.pvp = id;
      s.world = "arena";
      s.x = ARENA_SPAWNS[i].x; s.y = ARENA_SPAWNS[i].y;
      ms.zp.x = s.x; ms.zp.y = s.y; ms.zp.alive = true; ms.zp.hp = ms.zp.maxHp;
      ms.abilCd = {}; ms.lastAtk = 0; ms.gather = null;
      const o = pair[1 - i][1];
      const oeff = this.host.effective(o);
      this.host.send(ws, { type: "world_switched", world: "arena", x: s.x, y: s.y });
      this.host.send(ws, { type: "pvp_start", id, side: i, me: s.id, opp: { sid: o.id, name: d.names[1 - i], cls: o.stats.classId, lvl: oeff.level || 1 },
        countdown: DUEL_COUNTDOWN_MS, dur: DUEL_FIGHT_MS, size: ARENA });
    });
    this.host.onPlayersChanged?.();
    this.sendState(d, now);
  }

  private sides(d: Duel) {
    return d.sids.map((sid) => { const e = this.host.sessionLookup?.(sid); return e ? { ws: e[0], s: e[1], ms: this.host.ms.get(sid) } : null; });
  }

  sendState(d: Duel, now: number) {
    const sd = this.sides(d);
    const hp = sd.map((x) => (x?.ms ? [Math.max(0, Math.round(x.ms.zp.hp)), x.ms.zp.maxHp] : [0, 1]));
    const st = { type: "pvp_state", id: d.id, ph: d.phase, cd: Math.max(0, d.fightAt - now), left: Math.max(0, d.endAt - Math.max(now, d.fightAt)),
      p: d.sids.map((sid, i) => ({ sid, name: d.names[i], hp: hp[i][0], maxHp: hp[i][1] })), ev: d.ev };
    for (const x of sd) if (x) this.host.send(x.ws, st);
    d.ev = []; d.lastSent = now;
  }

  // ——— снаряды дуэли ———
  fire(d: Duel, owner: 0 | 1, o: { t: string; x: number; y: number; dx: number; dy: number; range: number; w: number; max: number; spd?: number; arc?: boolean; cid?: number; onHit?: (i: number) => void; onEnd?: (x: number, y: number, hit: boolean) => void }) {
    d.projs ||= []; if (d.projs.length > 60) return null;
    const L = Math.hypot(o.dx, o.dy) || 1;
    const p: DuelProj = { id: (d.nextProj = (d.nextProj || 0) + 1), owner, n: 0, flown: 0, spd: o.spd || PROJ_SPEED[o.t] || PROJ_SPEED.default, ...o, dx: o.dx / L, dy: o.dy / L };
    d.projs.push(p);
    d.ev.push({ k: "proj", cid: (o as any).cid, id: p.id, o: "p", sid: d.sids[owner], t: p.t, x: Math.round(p.x), y: Math.round(p.y), dx: +p.dx.toFixed(3), dy: +p.dy.toFixed(3), s: p.spd, r: Math.round(p.range), arc: p.arc ? 1 : undefined });
    return p;
  }
  /** шаги не длиннее половины ширины снаряда: попадание по текущей позиции соперника */
  stepProjs(d: Duel, dt: number) {
    if (!d.projs?.length) return;
    for (let i = d.projs.length - 1; i >= 0; i--) {
      const p = d.projs[i];
      if (!this.duels.has(d.id) || d.phase !== "fight") { d.projs.length = 0; return; }
      const tgt = this.host.sessionLookup?.(d.sids[1 - p.owner])?.[1];
      let left = Math.min(p.range - p.flown, p.spd * dt), done = false;
      while (left > 0 && !done) {
        const st = p.arc ? left : Math.min(left, Math.max(6, p.w * 0.5)); left -= st;
        p.x += p.dx * st; p.y += p.dy * st; p.flown += st;
        if (!p.arc && p.max > 0 && tgt && p.n < 1 && Math.hypot(tgt.x - p.x, tgt.y - p.y) <= HERO_R + p.w / 2) { const k = p.n++; p.onHit?.(k); if (p.n >= p.max || p.n >= 1) done = true; }
        if (p.flown >= p.range - 0.5) done = true;
      }
      if (done) { d.projs.splice(i, 1); d.ev.push({ k: "pend", id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: p.n ? 1 : undefined, t: p.t }); p.onEnd?.(p.x, p.y, p.n > 0); }
    }
  }

  // ——— бой ———
  private ctx(session: any) {
    const id = this.bySid.get(session.id);
    const d = id ? this.duels.get(id) : null;
    if (!d || d.phase !== "fight") return null; // во время отсчёта урона нет
    const i = d.sids[0] === session.id ? 0 : 1;
    const e = this.host.sessionLookup?.(d.sids[1 - i]);
    if (!e) return null;
    const me = this.host.ms.get(session.id), op = this.host.ms.get(e[1].id);
    if (!me || !op) return null;
    return { d, i, os: e[1], me, op };
  }

  private hitTest(sx: number, sy: number, ox: number, oy: number, dx: number, dy: number, atk: any): boolean {
    const ex = ox - sx, ey = oy - sy, r = HERO_R;
    const along = ex * dx + ey * dy;
    if (along < -r || along > atk.range + r) return false;
    if (atk.kind === "arc") {
      const dist = Math.hypot(ex, ey);
      if (dist > atk.range + r) return false;
      const ang = Math.acos(Math.max(-1, Math.min(1, along / (dist || 1))));
      return !(dist > r + 10 && ang > (atk.arc || 1));
    }
    return Math.abs(ex * dy - ey * dx) <= (atk.width || 20) / 2 + r;
  }

  private deal(c: any, session: any, dmg: number, crit: boolean, eff: any) {
    if (this.host.ally?.(session.id, c.os.id)) return; // союзники по отряду не наносят друг другу урон
    const real = Math.max(1, Math.round(dmg * (1 - Math.min(0.75, c.op.zp.armorRed || 0))));
    c.op.zp.hp = Math.max(0, c.op.zp.hp - real);
    { const t = Date.now(); (c.op as any).hurtAt = t; (c.me as any).hitAt = t; } // бой → регенерация ×regenCombat
    c.d.hits[c.i] += real;
    if (eff.lifestealPct) c.me.zp.hp = Math.min(c.me.zp.maxHp, c.me.zp.hp + real * eff.lifestealPct / 100);
    c.d.ev.push({ k: "phit", by: session.id, to: c.os.id, d: real, crit: crit || undefined, x: Math.round(c.os.x), y: Math.round(c.os.y) });
    if (c.op.zp.hp <= 0) this.finish(c.d, c.i as 0 | 1, "ko");
    return real;
  }

  /** черты админ-панели (поджог/яд/кровотечение/заморозка/замедление/отбрасывание/вампиризм) в дуэли — сервер */
  private traits(c: any, session: any, real: number, wt: string | null, skill?: string) {
    if (!real || !this.duels.has(c.d.id)) return;
    const tr = traitsFor(wt, this.host.equippedOf?.(session) || [], skill); if (!tr.length) return;
    const d = c.d, live = () => this.duels.has(d.id) && c.op.zp.hp > 0;
    applyTraits(tr, real, cryptoRand, {
      dot: (kind, dps, dur) => { for (let t = 1; t <= Math.min(10, Math.round(dur)); t++) setTimeout(() => { if (!live()) return; const v = Math.max(1, Math.round(dps)); c.op.zp.hp = Math.max(0, c.op.zp.hp - v); d.hits[c.i] += v; d.ev.push({ k: "phit", by: session.id, to: c.os.id, d: v, dot: kind, x: Math.round(c.os.x), y: Math.round(c.os.y) }); if (c.op.zp.hp <= 0) this.finish(d, c.i as 0 | 1, "ko"); }, t * 1000); },
      slow: () => { c.op.slowUntil = Date.now() + 2000; d.ev.push({ k: "pstatus", to: c.os.id, s: "slow" }); },
      knock: (p) => { const dx = c.os.x - session.x, dy = c.os.y - session.y, L = Math.hypot(dx, dy) || 1, S = W_ARENA; const k = 40 * Math.min(3, p || 1);
        c.os.x = Math.max(46, Math.min(S - 46, c.os.x + dx / L * k)); c.os.y = Math.max(46, Math.min(S - 46, c.os.y + dy / L * k)); c.op.zp.x = c.os.x; c.op.zp.y = c.os.y;
        const e = this.host.sessionLookup?.(c.os.id); if (e) this.host.send(e[0], { type: "ability_move", x: Math.round(c.os.x), y: Math.round(c.os.y) }); },
      freeze: (t) => { c.op.frozenUntil = Date.now() + Math.min(1500, t); d.ev.push({ k: "pstatus", to: c.os.id, s: "freeze", ms: Math.min(1500, t) }); },
      heal: (hp) => { c.me.zp.hp = Math.min(c.me.zp.maxHp, c.me.zp.hp + hp); },
    });
  }

  /** статус оружия при попадании (как в мире): поджог/яд/кровь по % урона, замедление, отбрасывание; не чаще раза в 1.5 с */
  private weaponStatus(c: any, session: any, W: any, real: number) {
    if (!real || !W?.status) return; const now = Date.now(); if ((c.op.wstAt || 0) > now) return; c.op.wstAt = now + 1500;
    this.status(c, session, { kind: W.status.kind, dps: W.status.dpsPct ? real * W.status.dpsPct / 100 : 0, dur: W.status.dur, slow: W.status.slow, knock: W.status.knock });
  }
  /** статусы как в открытом мире (zone.applyStatus): замедление, отбрасывание, заморозка (≤1.5 с), DoT оружия */
  private status(c: any, session: any, st: { slow?: boolean; knock?: number; freeze?: number; kind?: string; dps?: number; dur?: number }) {
    const d = c.d; if (!this.duels.has(d.id) || c.op.zp.hp <= 0) return;
    const now = Date.now();
    if (st.slow) { c.op.slowUntil = now + 2000; d.ev.push({ k: "pstatus", to: c.os.id, s: "slow", ms: 2000 }); }
    if (st.freeze) { const t = Math.min(1500, st.freeze); c.op.frozenUntil = now + t; d.ev.push({ k: "pstatus", to: c.os.id, s: "freeze", ms: t }); }
    if (st.knock) { const dx = c.os.x - session.x, dy = c.os.y - session.y, L = Math.hypot(dx, dy) || 1, S = W_ARENA, k = 40 * Math.min(3, st.knock);
      c.os.x = Math.max(46, Math.min(S - 46, c.os.x + dx / L * k)); c.os.y = Math.max(46, Math.min(S - 46, c.os.y + dy / L * k)); c.op.zp.x = c.os.x; c.op.zp.y = c.os.y;
      const e = this.host.sessionLookup?.(c.os.id); if (e) this.host.send(e[0], { type: "ability_move", x: Math.round(c.os.x), y: Math.round(c.os.y) }); }
    if (st.kind && st.dps && st.dur) {
      // стаки как в открытом мире: один статус от разных попаданий складывается (до 5 одновременно), разные — независимо
      const S2 = (c.op.dotStacks ||= {}) as Record<string, number[]>, live = (S2[st.kind] = (S2[st.kind] || []).filter((u) => u > now));
      if (live.length >= 5) return;
      live.push(now + st.dur * 1000);
      d.ev.push({ k: "pstatus", to: c.os.id, s: st.kind, ms: st.dur * 1000, n: live.length });
      for (let t = 1; t <= Math.min(10, Math.round(st.dur)); t++) setTimeout(() => { if (!this.duels.has(d.id) || c.op.zp.hp <= 0) return; const v = Math.max(1, Math.round(st.dps!)); c.op.zp.hp = Math.max(0, c.op.zp.hp - v); d.hits[c.i] += v;
        d.ev.push({ k: "phit", by: session.id, to: c.os.id, d: v, dot: st.kind, x: Math.round(c.os.x), y: Math.round(c.os.y) }); if (c.op.zp.hp <= 0) this.finish(d, c.i as 0 | 1, "ko"); }, t * 1000);
    }
  }

  attack(ws: WebSocket, session: any, msg: any) {
    const c = this.ctx(session);
    if (!c) return;
    if ((c.me.frozenUntil || 0) > Date.now()) return; // заморожен чертой соперника
    const eff = this.host.effective(session);
    const now = Date.now();
    const wt = eff.wtype || "book";
    const W = WEAPON_TYPES[wt] || WEAPON_TYPES.book;
    const atkCd = W.cd / (1 + Math.max(0, eff.atkSpeedPct || 0) / 100);
    if (now < c.me.lastAtk - atkCd * 0.15) return;
    // вылет из отрисованного центра героя (допуск SHOT_TOL), прицел — курсор; автоатака по сопернику (mob = -1) — точно в него
    const [blo, bhi] = worldBounds("arena"), A = shotAim(session.x, session.y, msg, blo, bhi), ox = A.x, oy = A.y;
    let dx = A.dx, dy = A.dy;
    if (Number(msg.mob) === -1 || Math.hypot(dx, dy) < 0.01) { dx = c.os.x - ox; dy = c.os.y - oy; }
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    c.me.lastAtk = Math.max(now, c.me.lastAtk) + atkCd;
    const reach = W.atk.kind === "arc" ? W.atk.range * 0.8 : W.atk.range;
    const per = (W.atk.count || 1) > 1 ? W.atk.per || 1 / (W.atk.count || 1) : 1;
    if (W.atk.kind !== "arc") { // стрелковое оружие: настоящие снаряды, урон при касании (можно увернуться)
      const c0 = c, d0 = c.d;
      for (const [vx, vy] of volleyDirs(W.atk, dx, dy))
        this.fire(d0, c.i as 0 | 1, { t: AUTO_SPRITE[wt] || "auto_staff", x: ox, y: oy, cid: Number(msg.cid) || undefined, dx: vx, dy: vy, range: W.atk.range, w: W.atk.width || 20, max: 1,
          onHit: () => { if (!this.duels.has(d0.id) || c0.op.zp.hp <= 0) return; const crit = cryptoRand() * 100 < eff.critPct; const raw = eff.weaponMin + cryptoRand() * (eff.weaponMax - eff.weaponMin);
            const real = this.deal(c0, session, raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * PVP_ATK_MULT * per, crit, eff); this.traits(c0, session, real, wt); this.weaponStatus(c0, session, W, real); } });
      return;
    }
    let n = 0; // залп: сколько снарядов попало в соперника
    for (const [vx, vy] of volleyDirs(W.atk, dx, dy)) {
      const hit = this.hitTest(session.x, session.y, c.os.x, c.os.y, vx, vy, W.atk);
      if (hit) n++;
      const tx = hit && W.atk.kind === "proj" ? c.os.x : session.x + vx * reach, ty = hit && W.atk.kind === "proj" ? c.os.y : session.y + vy * reach;
      c.d.ev.push({ k: "shot", sid: session.id, x: Math.round(session.x), y: Math.round(session.y), tx: Math.round(tx), ty: Math.round(ty), w: wt });
    }
    if (!n) return;
    const crit = cryptoRand() * 100 < eff.critPct;
    const raw = eff.weaponMin + cryptoRand() * (eff.weaponMax - eff.weaponMin);
    const real = this.deal(c, session, raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * PVP_ATK_MULT * per * n, crit, eff);
    this.traits(c, session, real, wt);
    this.weaponStatus(c, session, W, real);
  }

  ability(ws: WebSocket, session: any, msg: any) {
    const c = this.ctx(session);
    if (!c) return;
    if ((c.me.frozenUntil || 0) > Date.now()) return;
    const eff = this.host.effective(session);
    let ab = eff.abilities.find((x: any) => x.id === msg.id);
    if (!ab && msg.id === "rs") ab = this.host.rsAbilityOf?.(session);
    if (!ab) return;
    const now = Date.now(), cdKey = ab.rsSlot ? "rs" : ab.id;
    if ((c.me.abilCd[cdKey] || 0) > now) { this.host.send(ws, { type: "ability_cd", id: ab.id, left: c.me.abilCd[cdKey] - now, cd: ab.cd, ok: false }); return; }
    c.me.abilCd[cdKey] = now + ab.cd * 1000;
    this.host.send(ws, { type: "ability_cd", id: ab.id, left: ab.cd * 1000, cd: ab.cd, ok: true });
    const def = ABILITY_BY_ID[ab.id];
    const tmods = ab.props.filter((p: string) => p.startsWith("t_")).length;
    // те же формы, что в открытом мире (abilityShapes.ts): соперник — единственная «цель»; направление от клиента
    const [blo, bhi] = worldBounds("arena"), A = shotAim(session.x, session.y, msg, blo, bhi);
    if (A.client) { session.x = A.x; session.y = A.y; c.me.zp.x = A.x; c.me.zp.y = A.y; }
    let dx = A.dx, dy = A.dy;
    if (Math.hypot(dx, dy) < 0.01) { dx = c.os.x - session.x; dy = c.os.y - session.y; }
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const avg = (eff.weaponMin + eff.weaponMax) / 2;
    const dmg = avg * Math.max(0.6, Math.min(4, ab.power)) * 2.2 * (1 + eff.dmgPct / 100) * (1 + 0.15 * tmods) * PVP_ABIL_MULT;
    const d = c.d, opp = { id: -1, get x() { return c.os.x; }, get y() { return c.os.y; }, hp: 1, dead: false, usedAbility: new Set() };
    const live = () => this.duels.has(d.id) && c.op.zp.hp > 0;
    const zone = { mobsAround: (x: number, y: number, r: number) => (live() && Math.hypot(c.os.x - x, c.os.y - y) <= r + HERO_R ? [opp] : []) };
    const S = W_ARENA;
    const dealt = castShape(ab.cast || ab.id, {
      zone, sid: session.id, x: session.x, y: session.y, dx, dy, now, dmg, radiusMult: (ab.props.includes("extend") ? 200 / 140 : 1) * (1 + 0.15 * tmods), props: ab.props, here: () => [session.x, session.y],
      hit: (_m, mult) => { if (!live()) return 0; const real = this.deal(c, session, dmg * mult, false, { lifestealPct: 0 }) || 0; this.traits(c, session, real, null, ab.id); return real; },
      status: (_m, st) => this.status(c, session, { slow: !!st.slow, knock: st.knock, freeze: st.freeze }), // навыки: замедление/отбрасывание/заморозка — как в мире
      move: (x, y) => { session.x = x; session.y = y; c.me.zp.x = x; c.me.zp.y = y; this.host.send(ws, { type: "ability_move", x: Math.round(x), y: Math.round(y) }); },
      bounds: (x, y) => [Math.max(46, Math.min(S - 46, x)), Math.max(46, Math.min(S - 46, y))],
      buff: (b) => { if (b.heal) c.me.zp.hp = Math.min(c.me.zp.maxHp, c.me.zp.hp + b.heal); },
      later: (ms2, fn) => { setTimeout(() => { if (live()) fn(); }, ms2); },
      ev: (e) => d.ev.push(e),
      fire: (o) => this.fire(d, c.i as 0 | 1, { ...o, onHit: o.onHit ? () => { if (live()) o.onHit!(opp, 0); } : undefined, onEnd: o.onEnd ? (x, y, h) => { if (live()) o.onEnd!(x, y, h); } : undefined }),
    });
    if ((ab.props.includes("vamp") || def?.id === "trick_strike") && this.duels.has(d.id)) c.me.zp.hp = Math.min(c.me.zp.maxHp, c.me.zp.hp + dealt * 0.08);
  }

  leave(session: any, reason: "forfeit" | "disconnect") {
    // приглашения с участием ушедшего
    const inc = this.invites.get(session.id);
    if (inc) { this.invites.delete(session.id); const e = this.host.sessionLookup?.(inc.from); if (e) this.host.send(e[0], { type: "duel_declined", name: this.host.displayName(session), gone: true }); }
    const out = this.pendingOf(session.id);
    if (out) { this.invites.delete(out.to); const e = this.host.sessionLookup?.(out.to); if (e) this.host.send(e[0], { type: "duel_closed", from: session.id }); }
    const id = this.bySid.get(session.id);
    const d = id ? this.duels.get(id) : null;
    if (!d || d.phase === "over") return;
    const i = d.sids[0] === session.id ? 0 : 1;
    this.finish(d, (1 - i) as 0 | 1, reason, session.id);
  }

  tick(now: number) {
    for (const [to, inv] of this.invites) {
      if (now - inv.at <= DUEL_INVITE_MS) continue;
      this.invites.delete(to);
      this.pairGap.set(`${inv.from}>${to}`, now + SAME_TARGET_GAP_MS);
      const a = this.host.sessionLookup?.(inv.from), b = this.host.sessionLookup?.(to);
      if (a) this.host.send(a[0], { type: "duel_expired", to });
      if (b) this.host.send(b[0], { type: "duel_closed", from: inv.from, expired: true });
    }
    for (const d of this.duels.values()) {
      if (d.phase === "fight") { const dt = Math.min(0.25, (now - (d.projAt || now)) / 1000); d.projAt = now; if (dt > 0) this.stepProjs(d, dt); }
      if (!this.duels.has(d.id)) continue;
      if (d.phase === "countdown" && now >= d.fightAt) { d.phase = "fight"; d.ev.push({ k: "go" }); }
      if (d.phase === "fight" && now >= d.endAt) {
        const sd = this.sides(d);
        const pct = sd.map((x) => (x?.ms ? x.ms.zp.hp / Math.max(1, x.ms.zp.maxHp) : 0));
        const diff = pct[0] - pct[1];
        this.finish(d, Math.abs(diff) < 0.005 ? null : diff > 0 ? 0 : 1, "timeout");
        continue;
      }
      if (d.phase !== "over" && (d.ev.length || now - d.lastSent >= 250)) this.sendState(d, now);
    }
  }

  // Конец дуэли: результат обоим, запись в D1, оба — в Аринар (безопасная точка) с полным здоровьем
  finish(d: Duel, winner: 0 | 1 | null, reason: string, goneSid?: string) {
    if (d.phase === "over") return;
    const now = Date.now();
    this.sendState(d, now); // последний удар/полоски — до экрана результата
    d.phase = "over";
    this.duels.delete(d.id);
    const sd = this.sides(d);
    const hpPct = sd.map((x) => (x?.ms ? Math.round((Math.max(0, x.ms.zp.hp) / Math.max(1, x.ms.zp.maxHp)) * 100) : 0));
    const rec = this.host.recordDuel(d, winner, reason).catch((e) => console.error("[mc] duel record", e?.message || e));
    sd.forEach((x, i) => {
      this.bySid.delete(d.sids[i]);
      if (!x) return;
      const { ws, s, ms } = x;
      delete s.pvp;
      if (ms) { ms.zp.hp = ms.zp.maxHp; ms.zp.alive = true; ms.abilCd = {}; ms.lastAtk = 0; }
      const result = winner === null ? "draw" : winner === i ? "win" : "loss";
      const msg: any = { type: "pvp_end", id: d.id, result, reason, opp: d.names[1 - i], hp: hpPct[i], oppHp: hpPct[1 - i], dealt: d.hits[i], taken: d.hits[1 - i] };
      if (reason === "disconnect" && d.sids[i] === goneSid) return; // отключившийся — сообщать некому, состояние очищено
      s.world = "arinar"; s.x = ZONE_RESPAWN.x; s.y = ZONE_RESPAWN.y; (s as any).arVer = 3; // ARINAR_LAYOUT_VER
      if (ms) { ms.zp.x = s.x; ms.zp.y = s.y; }
      this.host.send(ws, { type: "world_switched", world: "arinar", x: s.x, y: s.y });
      this.host.onWorldChange(ws, s);
      rec.then(() => this.host.duelRecord(d.pkeys[i])).then((r) => this.host.send(ws, { ...msg, record: r })).catch(() => this.host.send(ws, msg));
    });
    this.host.onPlayersChanged?.();
  }
}
