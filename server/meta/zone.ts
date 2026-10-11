// Открытый мир Аринара (государство Мэлвелдил): общие для всех онлайн-игроков мобы и узлы ресурсов.
// Полностью серверный авторитет: позиции/HP мобов, урон по игрокам, сбор, дроп. Клиент лишь присылает
// намерения (атаковать моба / начать-закончить сбор / применить навык) — сервер проверяет дистанцию и кд.
import { ZONE_MOBS, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, ZONE_ATTACK_CD_MS } from "./defs";

export interface ZMob { id: number; type: string; respawn: number; sx: number; sy: number; x: number; y: number; hp: number; maxHp: number; dead: boolean; respawnAt: number;
  targetSid: string | null; wanderX: number; wanderY: number; nextWander: number; atkCd: number; dmgBy: Map<string, number>; usedAbility: Set<string>;
  windup: number; dashX: number; dashY: number; dashT: number; slamAt: number; slamX: number; slamY: number }
export interface ZNode { id: number; type: string; res: string; respawn: number; x: number; y: number; readyAt: number; qty: [number, number] }
export interface ZPlayer { sid: string; x: number; y: number; hp: number; maxHp: number; armorRed: number; alive: boolean; respawnAt: number }

export class Zone {
  mobs: ZMob[] = [];
  nodes: ZNode[] = [];
  events: any[] = [];
  world: string;
  constructor(world: string, spawns: { type: string; x: number; y: number; respawn: number }[], nodes: { type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[]) {
    this.world = world;
    spawns.forEach((s, i) => {
      const d = ZONE_MOBS[s.type];
      this.mobs.push({ id: i + 1, type: s.type, respawn: s.respawn, sx: s.x, sy: s.y, x: s.x, y: s.y, hp: d.hp, maxHp: d.hp, dead: false, respawnAt: 0, targetSid: null,
        wanderX: s.x, wanderY: s.y, nextWander: 0, atkCd: 0, dmgBy: new Map(), usedAbility: new Set(), windup: 0, dashX: 0, dashY: 0, dashT: 0, slamAt: 0, slamX: 0, slamY: 0 });
    });
    nodes.forEach((n, i) => this.nodes.push({ id: 1000 + i, type: n.type, res: n.res, respawn: n.respawn, x: n.x, y: n.y, readyAt: 0, qty: n.qty }));
  }

  // players: sid → состояние игрока в мире. onHit(sid, dmg) — урон игроку; onKill(mob) — смерть моба.
  update(dt: number, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string) => void, onKill: (m: ZMob) => void) {
    const scale = Math.max(1, Math.min(4, players.size)); // ХП босса растёт с числом игроков (ограниченно)
    for (const m of this.mobs) {
      const d = ZONE_MOBS[m.type];
      if (m.dead) {
        if (now >= m.respawnAt) {
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
        if (dist > d.radius + 14) { m.x += (dx / dist) * d.speed * dt; m.y += (dy / dist) * d.speed * dt; }
        else if (m.atkCd <= 0) { onHit(best.sid, d.dmg, m.type); m.atkCd = 1.1; }
      } else {
        // возврат/брожение у точки спавна; регенерация вне боя
        if (now >= m.nextWander) { m.nextWander = now + 2500 + Math.random() * 3000; m.wanderX = m.sx + (Math.random() - 0.5) * 120; m.wanderY = m.sy + (Math.random() - 0.5) * 120; }
        const dx = m.wanderX - m.x, dy = m.wanderY - m.y, dist = Math.hypot(dx, dy);
        if (dist > 4) { m.x += (dx / dist) * d.speed * 0.4 * dt; m.y += (dy / dist) * d.speed * 0.4 * dt; }
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt);
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
    if (m.hp <= 0) {
      m.dead = true; m.hp = 0; m.windup = 0; m.dashT = 0; m.slamAt = 0;
      m.respawnAt = Date.now() + m.respawn * 1000;
      this.events.push({ k: "die", id: m.id, x: m.x, y: m.y, type: m.type });
      onKill(m);
    }
    return real;
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
      m.push(x.id, Object.keys(ZONE_MOBS).indexOf(x.type), Math.round(x.x), Math.round(x.y), Math.round((x.hp / x.maxHp) * 100), x.windup > 0 ? 1 : x.dashT > 0 ? 2 : 0);
    }
    const now = Date.now();
    const n = this.nodes.map((x) => [x.id, now >= x.readyAt ? 1 : 0]);
    const near = ev.filter((e) => e.x === undefined || (Math.abs(e.x - px) <= aoi && Math.abs(e.y - py) <= aoi));
    return { w: this.world, m, n, ev: near };
  }
}
