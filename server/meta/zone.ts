// Открытый мир Аринара (государство Мэлвелдил): общие для всех онлайн-игроков мобы и узлы ресурсов.
// Полностью серверный авторитет: позиции/HP мобов, урон по игрокам, сбор, дроп. Клиент лишь присылает
// намерения (атаковать моба / начать-закончить сбор / применить навык) — сервер проверяет дистанцию и кд.
import { ZONE_MOBS, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, ZONE_ATTACK_CD_MS } from "./defs";
import { ZONE_GEN, REGIONS, rng, inSafe, regionAt, isNight, genNodes, type Region } from "./zoneGen";

export interface ZMob { id: number; type: string; respawn: number; sx: number; sy: number; x: number; y: number; hp: number; maxHp: number; dead: boolean; respawnAt: number;
  targetSid: string | null; wanderX: number; wanderY: number; nextWander: number; atkCd: number; dmgBy: Map<string, number>; usedAbility: Set<string>;
  windup: number; dashX: number; dashY: number; dashT: number; slamAt: number; slamX: number; slamY: number;
  // процедурный спавн: регион, элита, простой вне боя (для деспавна); fixed — классическая точка респавна
  fixed: boolean; region: string | null; elite: boolean; idle: number;
  // статусы от оружия игроков (сервер-авторитет): урон по времени, замедление, отбрасывание
  dot: { kind: string; dps: number; until: number; sid: string } | null; slowUntil: number; kbx: number; kby: number }
export interface ZNode { id: number; type: string; res: string; respawn: number; x: number; y: number; readyAt: number; qty: [number, number] }
export interface ZPlayer { sid: string; x: number; y: number; hp: number; maxHp: number; armorRed: number; alive: boolean; respawnAt: number }

export class Zone {
  mobs: ZMob[] = [];
  nodes: ZNode[] = [];
  events: any[] = [];
  world: string;
  // процедурный режим
  proc: boolean;
  seed: number;
  rand: () => number;
  nextId = 1;
  tokens = ZONE_GEN.burst;
  dirAcc = 0;
  bossAt = 0;            // когда появится мировой босс (0 — ещё не назначено)
  bossId = 0;
  stats = { spawned: 0, despawned: 0, rejected: 0 };

  constructor(world: string, spawns: { type: string; x: number; y: number; respawn: number }[], nodes: { type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[],
    opts: { proc?: boolean; seed?: number } = {}) {
    this.world = world;
    this.proc = !!opts.proc;
    this.seed = (opts.seed ?? ZONE_GEN.seed) >>> 0;
    this.rand = rng(this.seed);
    spawns.forEach((s) => this.addMob(s.type, s.x, s.y, { fixed: true, respawn: s.respawn }));
    const nodeList = this.proc ? genNodes(this.seed) : nodes.map((n, i) => ({ id: 1000 + i, ...n }));
    nodeList.forEach((n) => this.nodes.push({ id: n.id, type: n.type, res: n.res, respawn: n.respawn, x: n.x, y: n.y, readyAt: 0, qty: n.qty }));
  }

  addMob(type: string, x: number, y: number, o: { fixed?: boolean; respawn?: number; region?: string | null; elite?: boolean; hpMul?: number } = {}) {
    const d = ZONE_MOBS[type];
    const hp = Math.round(d.hp * (o.elite ? ZONE_GEN.eliteHp : 1) * (o.hpMul || 1));
    const m: ZMob = { id: this.nextId++, type, respawn: o.respawn || 0, sx: x, sy: y, x, y, hp, maxHp: hp, dead: false, respawnAt: 0, targetSid: null,
      wanderX: x, wanderY: y, nextWander: 0, atkCd: 0, dmgBy: new Map(), usedAbility: new Set(), windup: 0, dashX: 0, dashY: 0, dashT: 0, slamAt: 0, slamX: 0, slamY: 0,
      fixed: !!o.fixed, region: o.region || null, elite: !!o.elite, idle: 0, dot: null, slowUntil: 0, kbx: 0, kby: 0 };
    this.mobs.push(m);
    return m;
  }

  // ---------- режиссёр процедурного спавна ----------
  // Дёшево: такт раз в 0.5 с, O(мобы × игроки) с малыми числами (кап 34 моба, AOI по регионам).
  director(dt: number, now: number, players: Map<string, ZPlayer>) {
    const G = ZONE_GEN;
    this.tokens = Math.min(G.burst, this.tokens + G.ratePerSec * dt);
    const alive = [...players.values()].filter((p) => p.alive);
    // деспавн: далеко от всех и вне боя дольше despawnIdle
    for (const m of this.mobs) {
      if (m.dead || m.fixed || m.id === this.bossId) continue;
      let near = Infinity;
      for (const p of players.values()) near = Math.min(near, Math.hypot(p.x - m.x, p.y - m.y));
      if (near > G.despawnDist && !m.targetSid) m.idle += dt; else m.idle = 0;
      if (m.idle > G.despawnIdle) { m.dead = true; m.respawnAt = -1; this.stats.despawned++; }
    }
    if (!alive.length) return;
    // мировой босс: длинный таймер + объявление
    if (!this.bossAt) this.bossAt = now + G.boss.firstAfter * 1000;
    const boss = this.mobs.find((m) => m.id === this.bossId && !m.dead);
    if (!boss && now >= this.bossAt) {
      const scale = Math.max(1, Math.min(4, players.size));
      const b = this.addMob(G.boss.type, G.boss.x, G.boss.y, { region: "crater", hpMul: 1 + 0.5 * (scale - 1) });
      this.bossId = b.id; this.bossAt = Number.MAX_SAFE_INTEGER;
      this.events.push({ k: "announce", text: `🌙 Мировой босс «${ZONE_MOBS[G.boss.type].name}» пробуждается в Лунном кратере!`, color: "#c084fc" });
    }
    const living = this.mobs.filter((m) => !m.dead && !m.fixed && m.id !== this.bossId);
    if (living.length >= G.globalCap || this.tokens < 1) return;
    const night = isNight(now);
    // кандидаты-регионы: рядом хоть с одним игроком и не заполнены
    const regs: { r: Region; deficit: number }[] = [];
    for (const r of REGIONS) {
      const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2;
      const halfDiag = Math.hypot(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) / 2;
      if (!alive.some((p) => Math.hypot(p.x - cx, p.y - cy) < G.spawnMaxDist + halfDiag * 0.5)) continue;
      const n = living.filter((m) => m.region === r.id).length;
      if (n < r.cap) regs.push({ r, deficit: r.cap - n });
    }
    if (!regs.length) return;
    // плотность вокруг игроков: потолок растёт с числом игроков поблизости
    const crowded = (x: number, y: number) => {
      for (const p of alive) {
        if (Math.hypot(p.x - x, p.y - y) > G.nearR * 1.6) continue;
        const group = alive.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < G.nearR).length;
        const lim = Math.min(G.nearMax, G.nearBase + G.nearPerPlayer * (group - 1));
        const around = living.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) < G.nearR).length;
        if (around >= lim) return true;
      }
      return false;
    };
    const R = this.rand;
    const total = regs.reduce((a, b) => a + b.deficit, 0);
    let pick = R() * total, reg = regs[0].r;
    for (const x of regs) { pick -= x.deficit; if (pick <= 0) { reg = x.r; break; } }
    // позиция: несколько случайных кандидатов в прямоугольнике региона
    let pos: { x: number; y: number } | null = null;
    for (let t = 0; t < G.tries && !pos; t++) {
      const x = reg.rect[0] + R() * (reg.rect[2] - reg.rect[0]), y = reg.rect[1] + R() * (reg.rect[3] - reg.rect[1]);
      if (inSafe(x, y)) continue;
      let dmin = Infinity;
      for (const p of players.values()) dmin = Math.min(dmin, Math.hypot(p.x - x, p.y - y));
      if (dmin < (t < G.tries / 2 ? G.spawnMinDist : G.spawnMinDistCrowded) || dmin > G.spawnMaxDist) continue;
      if (living.some((m) => Math.hypot(m.x - x, m.y - y) < G.mobMinDist)) continue;
      if (crowded(x, y)) continue;
      pos = { x, y };
    }
    if (!pos) { this.stats.rejected++; return; }
    // моб из таблицы региона (ночью — свои веса)
    const tbl = reg.table.map((row) => ({ row, w: row.w * (night && reg.night?.[row.type] ? reg.night[row.type] : 1) }));
    let tw = tbl.reduce((a, b) => a + b.w, 0) * R();
    let row = tbl[0].row;
    for (const x of tbl) { tw -= x.w; if (tw <= 0) { row = x.row; break; } }
    const elite = R() < reg.elite * (night ? 1.5 : 1);
    const n = elite ? 1 : row.pack[0] + Math.floor(R() * (row.pack[1] - row.pack[0] + 1));
    const room = Math.min(n, G.globalCap - living.length, reg.cap - living.filter((m) => m.region === reg.id).length);
    for (let i = 0; i < room; i++) {
      const a = R() * Math.PI * 2, rr = i ? 18 + R() * 26 : 0;
      const x = Math.max(20, Math.min(1180, pos.x + Math.cos(a) * rr)), y = Math.max(20, Math.min(1180, pos.y + Math.sin(a) * rr));
      if (i && inSafe(x, y)) continue; // член стаи не должен оказаться в безопасной зоне
      this.addMob(row.type, x, y, { region: reg.id, elite });
      this.stats.spawned++;
    }
    this.tokens -= 1;
  }

  // ---------- статусы от оружия игроков ----------
  applyStatus(m: ZMob, sid: string, st: { kind?: string; dps?: number; dur?: number; slow?: number; knock?: number }, fromX: number, fromY: number) {
    const now = Date.now();
    if (st.kind && st.dps && st.dur) {
      if (!m.dot || m.dot.until < now || m.dot.dps <= st.dps) m.dot = { kind: st.kind, dps: st.dps, until: now + st.dur * 1000, sid };
    }
    if (st.slow) m.slowUntil = now + 1200;
    if (st.knock && !ZONE_MOBS[m.type].boss) {
      const dx = m.x - fromX, dy = m.y - fromY, d = Math.hypot(dx, dy) || 1;
      const k = st.knock * (m.elite ? 0.5 : 1);
      m.kbx += (dx / d) * k * 6; m.kby += (dy / d) * k * 6;
    }
  }

  // players: sid → состояние игрока в мире. onHit(sid, dmg) — урон игроку; onKill(mob) — смерть моба.
  update(dt: number, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string) => void, onKill: (m: ZMob) => void) {
    const scale = Math.max(1, Math.min(4, players.size)); // ХП босса растёт с числом игроков (ограниченно)
    if (this.proc) {
      // убитые/исчезнувшие процедурные мобы удаляются (их место займёт режиссёр)
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (m.dead && !m.fixed) {
          if (m.id === this.bossId) { this.bossId = 0; this.bossAt = now + ZONE_GEN.boss.every * 1000; }
          this.mobs.splice(i, 1);
        }
      }
      this.dirAcc += dt;
      if (this.dirAcc >= ZONE_GEN.directorEvery) { this.director(this.dirAcc, now, players); this.dirAcc = 0; }
    }
    for (const m of this.mobs) {
      const d = ZONE_MOBS[m.type];
      if (!m.dead && m.dot) {
        if (now >= m.dot.until) m.dot = null;
        else {
          const dmg = m.dot.dps * dt;
          m.hp -= dmg;
          m.dmgBy.set(m.dot.sid, (m.dmgBy.get(m.dot.sid) || 0) + dmg);
          if (m.hp <= 0) { this.kill(m, onKill); continue; }
        }
      }
      if (!m.dead && (m.kbx || m.kby)) {
        m.x += m.kbx * dt * 10; m.y += m.kby * dt * 10;
        m.kbx *= 0.75; m.kby *= 0.75;
        if (Math.abs(m.kbx) + Math.abs(m.kby) < 0.5) { m.kbx = 0; m.kby = 0; }
      }
      if (m.dead) {
        if (m.fixed && now >= m.respawnAt) {
          m.dead = false; m.x = m.sx; m.y = m.sy; m.maxHp = d.boss ? d.hp * (1 + 0.5 * (scale - 1)) : d.hp; m.hp = m.maxHp;
          m.dmgBy.clear(); m.usedAbility.clear(); m.targetSid = null;
        }
        continue;
      }
      // цель
      let best: ZPlayer | null = null, bd = d.aggro;
      if (m.targetSid) { const t = players.get(m.targetSid); if (t && t.alive) { const dd = Math.hypot(t.x - m.x, t.y - m.y); if (dd < d.aggro * 1.8) { best = t; bd = dd; } } }
      if (!best) for (const p of players.values()) { if (!p.alive) continue; const dd = Math.hypot(p.x - m.x, p.y - m.y); if (dd < bd) { bd = dd; best = p; } }
      m.targetSid = best ? best.sid : null;
      m.atkCd = Math.max(0, m.atkCd - dt);
      // лезвийная мошка: замах (телеграф) → рывок
      if (m.type === "blade_fly" && m.dashT > 0) {
        m.dashT -= dt; m.x += m.dashX * 330 * dt; m.y += m.dashY * 330 * dt;
        for (const p of players.values()) if (p.alive && Math.hypot(p.x - m.x, p.y - m.y) < d.radius + 12 && m.atkCd <= 0) { onHit(p.sid, d.dmg * 1.5, m.type); m.atkCd = 0.8; }
        continue;
      }
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup <= 0 && m.type === "blade_fly") { m.dashT = 0.35; }
        continue;
      }
      if (d.boss && m.slamAt && now >= m.slamAt) {
        m.slamAt = 0;
        for (const p of players.values()) if (p.alive && Math.hypot(p.x - m.slamX, p.y - m.slamY) < 90) onHit(p.sid, d.dmg * 1.6, m.type);
        this.events.push({ k: "slam", id: m.id, x: m.slamX, y: m.slamY, r: 90 });
      }
      if (best) {
        const dx = best.x - m.x, dy = best.y - m.y, dist = Math.hypot(dx, dy) || 1;
        if (m.type === "blade_fly" && dist < 150 && dist > 50 && m.atkCd <= 0) {
          m.windup = 0.55; m.dashX = dx / dist; m.dashY = dy / dist; m.atkCd = 2.4;
          this.events.push({ k: "tele", id: m.id, x: m.x, y: m.y, dx: m.dashX, dy: m.dashY, len: 115, t: 0.55 });
          continue;
        }
        if (d.boss && !m.slamAt && m.atkCd <= 0 && dist < 160) {
          m.slamAt = now + 1200; m.slamX = best.x; m.slamY = best.y; m.atkCd = 4.5;
          this.events.push({ k: "tele_circle", id: m.id, x: best.x, y: best.y, r: 90, t: 1.2 });
        }
        const sp = d.speed * (m.slowUntil > now ? 0.55 : 1) * (m.elite ? 1.1 : 1);
        if (dist > d.radius + 14) { m.x += (dx / dist) * sp * dt; m.y += (dy / dist) * sp * dt; }
        else if (m.atkCd <= 0) { onHit(best.sid, d.dmg * (m.elite ? ZONE_GEN.eliteDmg : 1), m.type); m.atkCd = 1.1; }
      } else {
        // возврат/брожение у точки спавна; регенерация вне боя
        if (now >= m.nextWander) { m.nextWander = now + 2500 + Math.random() * 3000; m.wanderX = m.sx + (Math.random() - 0.5) * 120; m.wanderY = m.sy + (Math.random() - 0.5) * 120; if (!m.fixed && inSafe(m.wanderX, m.wanderY)) { m.wanderX = m.sx; m.wanderY = m.sy; } }
        const dx = m.wanderX - m.x, dy = m.wanderY - m.y, dist = Math.hypot(dx, dy);
        if (dist > 4) { m.x += (dx / dist) * d.speed * 0.4 * dt; m.y += (dy / dist) * d.speed * 0.4 * dt; }
        if (!m.dot) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt); // горящий/отравленный не лечится
        if (m.hp >= m.maxHp) { m.dmgBy.clear(); m.usedAbility.clear(); }
      }
      m.x = Math.max(20, Math.min(1180, m.x)); m.y = Math.max(20, Math.min(1180, m.y));
    }
  }

  // Атака игрока по мобу (авто-атака). Дистанция/кд проверяются; урон считает вызывающий по статам героя.
  attack(p: ZPlayer, mobId: number, now: number, lastAt: number): ZMob | null {
    if (now - lastAt < ZONE_ATTACK_CD_MS) return null;
    const m = this.mobs.find((x) => x.id === mobId);
    if (!m || m.dead || !p.alive) return null;
    if (Math.hypot(m.x - p.x, m.y - p.y) > ZONE_ATTACK_RANGE + ZONE_MOBS[m.type].radius) return null;
    return m;
  }
  // Удар по клику: цели вдоль направления (dx,dy — единичный вектор) по форме оружия, ближние первыми
  targetsInDir(p: ZPlayer, dx: number, dy: number, atk: { kind: string; range: number; width?: number; arc?: number; max?: number }): ZMob[] {
    if (!p.alive) return [];
    const out: { m: ZMob; d: number }[] = [];
    for (const m of this.mobs) {
      if (m.dead) continue;
      const r = ZONE_MOBS[m.type].radius;
      const ex = m.x - p.x, ey = m.y - p.y;
      const along = ex * dx + ey * dy;
      if (along < -r || along > atk.range + r) continue;
      if (atk.kind === "arc") {
        const dist = Math.hypot(ex, ey);
        if (dist > atk.range + r) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, along / (dist || 1))));
        if (dist > r + 10 && ang > (atk.arc || 1)) continue;
        out.push({ m, d: dist });
      } else {
        const perp = Math.abs(ex * dy - ey * dx);
        if (perp > (atk.width || 20) + r) continue;
        out.push({ m, d: along });
      }
    }
    out.sort((a, b) => a.d - b.d);
    const max = atk.kind === "proj" ? 1 : (atk.max || 1);
    return out.slice(0, max).map((x) => x.m);
  }
  mobsAround(x: number, y: number, r: number): ZMob[] {
    return this.mobs.filter((m) => !m.dead && Math.hypot(m.x - x, m.y - y) <= r + ZONE_MOBS[m.type].radius);
  }
  damage(m: ZMob, sid: string, dmg: number, onKill: (m: ZMob) => void) {
    if (m.dead) return;
    const d = ZONE_MOBS[m.type];
    const real = Math.max(1, Math.round(dmg * (1 - Math.min(0.6, d.armor / (d.armor + 60)))));
    m.hp -= real;
    m.dmgBy.set(sid, (m.dmgBy.get(sid) || 0) + real);
    if (!m.targetSid) m.targetSid = sid;
    this.events.push({ k: "hit", id: m.id, d: real });
    if (m.hp <= 0) this.kill(m, onKill);
    return real;
  }
  kill(m: ZMob, onKill: (m: ZMob) => void) {
    m.dead = true; m.hp = 0; m.windup = 0; m.dashT = 0; m.slamAt = 0; m.dot = null;
    m.respawnAt = Date.now() + m.respawn * 1000;
    this.events.push({ k: "die", id: m.id, x: m.x, y: m.y, type: m.type });
    onKill(m);
  }
  gatherCheck(p: ZPlayer, nodeId: number, startedAt: number, now: number): ZNode | null {
    const n = this.nodes.find((x) => x.id === nodeId);
    if (!n || now < n.readyAt || !p.alive) return null;
    if (Math.hypot(n.x - p.x, n.y - p.y) > GATHER_RANGE) return null;
    if (now - startedAt < GATHER_TIME_MS) return null;
    return n;
  }
  // AOI: клиент получает только мобов/события в радиусе видимости
  takeEvents() { return this.events.splice(0, 80); }
  state(px: number, py: number, ev: any[], aoi = 700) {
    const m: number[] = [];
    for (const x of this.mobs) {
      if (x.dead || Math.abs(x.x - px) > aoi || Math.abs(x.y - py) > aoi) continue;
      const st = x.dot ? (x.dot.kind === "burn" ? 8 : x.dot.kind === "poison" ? 16 : 32) : 0;
      m.push(x.id, Object.keys(ZONE_MOBS).indexOf(x.type), Math.round(x.x), Math.round(x.y), Math.round((x.hp / x.maxHp) * 100),
        (x.windup > 0 ? 1 : x.dashT > 0 ? 2 : 0) | (x.elite ? 4 : 0) | st | (x.slowUntil > Date.now() ? 64 : 0));
    }
    const now = Date.now();
    const n = this.nodes.map((x) => [x.id, now >= x.readyAt ? 1 : 0]);
    const near = ev.filter((e) => e.x === undefined || (Math.abs(e.x - px) <= aoi && Math.abs(e.y - py) <= aoi));
    return { w: this.world, m, n, ev: near, sd: this.proc ? this.seed : undefined };
  }
}
