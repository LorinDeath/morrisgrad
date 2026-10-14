// «Проклятые»: PvP-дуэли — полностью на сервере.
// Вызов (duel_challenge) → приглашение цели (15 с) → принятие (duel_respond) → отдельная арена 25×25 клеток
// (мир "arena", своя группа видимости arena:<id>) → полное лечение и сброс перезарядок → отсчёт 3 с
// (движение и урон заблокированы) → бой до 0 ОЗ / сдачи / отключения / 3 минут (тогда побеждает больший % ОЗ,
// равенство — ничья) → результат, оба — на безопасную точку Аринара с полным здоровьем. Наград нет.
// Урон считает сервер: статы героев (снаряжение, таланты) — с сервера, разброс/крит — криптографический ГСЧ,
// темп ударов и перезарядки — серверные, попадание — по позициям сервера и форме удара оружия.
// Клиентские числа урона и любые «duel_action» игнорируются. Счёт — в D1 (миграция 0005_duels.sql).
import { WEAPON_TYPES, ABILITY_BY_ID, ZONE_RESPAWN, volleyDirs } from "./defs";
import { cryptoRand } from "./profile";
import { WORLD_SIZES } from "../worlds/sizes";

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
};

export interface PvpHost {
  ms: Map<string, any>;
  sessionLookup: ((sid: string) => [WebSocket, any] | null) | null;
  effective(session: any): any;
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
    const real = Math.max(1, Math.round(dmg * (1 - Math.min(0.75, c.op.zp.armorRed || 0))));
    c.op.zp.hp = Math.max(0, c.op.zp.hp - real);
    c.d.hits[c.i] += real;
    if (eff.lifestealPct) c.me.zp.hp = Math.min(c.me.zp.maxHp, c.me.zp.hp + real * eff.lifestealPct / 100);
    c.d.ev.push({ k: "phit", by: session.id, to: c.os.id, d: real, crit: crit || undefined, x: Math.round(c.os.x), y: Math.round(c.os.y) });
    if (c.op.zp.hp <= 0) this.finish(c.d, c.i as 0 | 1, "ko");
    return real;
  }

  attack(ws: WebSocket, session: any, msg: any) {
    const c = this.ctx(session);
    if (!c) return;
    const eff = this.host.effective(session);
    const now = Date.now();
    const wt = eff.wtype || "book";
    const W = WEAPON_TYPES[wt] || WEAPON_TYPES.book;
    const atkCd = W.cd / (1 + Math.max(0, eff.atkSpeedPct || 0) / 100);
    if (now < c.me.lastAtk - atkCd * 0.15) return;
    let dx = Number(msg.dx), dy = Number(msg.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) { dx = c.os.x - session.x; dy = c.os.y - session.y; }
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    c.me.lastAtk = Math.max(now, c.me.lastAtk) + atkCd;
    const reach = W.atk.kind === "arc" ? W.atk.range * 0.8 : W.atk.range;
    const per = (W.atk.count || 1) > 1 ? W.atk.per || 1 / (W.atk.count || 1) : 1;
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
    this.deal(c, session, raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * PVP_ATK_MULT * per * n, crit, eff);
  }

  ability(ws: WebSocket, session: any, msg: any) {
    const c = this.ctx(session);
    if (!c) return;
    const eff = this.host.effective(session);
    const ab = eff.abilities.find((x: any) => x.id === msg.id);
    if (!ab) return;
    const now = Date.now();
    if ((c.me.abilCd[ab.id] || 0) > now) { this.host.send(ws, { type: "ability_cd", id: ab.id, left: c.me.abilCd[ab.id] - now, cd: ab.cd, ok: false }); return; }
    c.me.abilCd[ab.id] = now + ab.cd * 1000;
    this.host.send(ws, { type: "ability_cd", id: ab.id, left: ab.cd * 1000, cd: ab.cd, ok: true });
    const def = ABILITY_BY_ID[ab.id];
    const tmods = ab.props.filter((p: string) => p.startsWith("t_")).length;
    const radius = (ab.props.includes("extend") ? 200 : 140) * (1 + 0.15 * tmods);
    c.d.ev.push({ k: "ability", sid: session.id, id: ab.id, x: Math.round(session.x), y: Math.round(session.y), r: radius });
    if (Math.hypot(c.os.x - session.x, c.os.y - session.y) > radius + HERO_R) return;
    const avg = (eff.weaponMin + eff.weaponMax) / 2;
    const dmg = avg * Math.max(0.6, Math.min(4, ab.power)) * 2.2 * (1 + eff.dmgPct / 100) * (1 + 0.15 * tmods) * PVP_ABIL_MULT;
    const real = this.deal(c, session, dmg, false, { lifestealPct: 0 });
    if ((ab.props.includes("vamp") || def?.id === "trick_strike") && this.duels.has(c.d.id)) c.me.zp.hp = Math.min(c.me.zp.maxHp, c.me.zp.hp + real * 0.08);
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
