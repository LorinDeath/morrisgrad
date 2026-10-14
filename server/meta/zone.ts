// Открытые миры (Аринар — государство Мэлвелдил; Поляна хаба): общие для всех онлайн-игроков мобы и узлы ресурсов.
// Полностью серверный авторитет: позиции/HP мобов, урон по игрокам, сбор, дроп. Клиент лишь присылает
// намерения (атаковать / начать-закончить сбор / применить навык) — сервер проверяет дистанцию и кд.
// ИИ по ролям (bestiary.ts): melee, swarm, charger (замах → рывок), ranged (линия-телеграф → выстрел),
// caster (круг-телеграф под целью), tank (медленный, не отбрасывается). Крупные/боссы — набор
// телеграфируемых атак по фазам (60% / 30% ХП): круги, линии, кольцо, «волна» вокруг, призыв, ярость.
import { ZONE_MOBS, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, ZONE_ATTACK_CD_MS } from "./defs";
import "./zoneTables"; // заполняет таблицы мобов регионов (только сервер)
import { ZONE_GEN, rng, inSafe, isNight, genNodes, genOf, type Region, type WorldGen } from "./zoneGen";
import { WORLD_CHUNK } from "../worlds/sizes";

// Навыки боссов и проклятых (ids — базы навыков бестиария). Обычный босс — ровно 1 навык, проклятый — 2–5.
export const MOB_SKILLS: Record<string, { name: string; cd: number }> = {
  frost_nova: { name: "Ледяная звезда", cd: 9 }, meteor: { name: "Метеор", cd: 12 }, spear_rain: { name: "Дождь копий", cd: 10 },
  whirlwind: { name: "Вихрь", cd: 8 }, fly_blade_dash: { name: "Рывок клинка", cd: 7 }, shadow_step: { name: "Шаг тени", cd: 11 },
  fireball: { name: "Огненный шар", cd: 6 }, shield_wall: { name: "Стена щитов", cd: 15 }, smoke_bomb: { name: "Дымовая завеса", cd: 14 },
};
const SKILL_IDS = Object.keys(MOB_SKILLS);
const hashStr = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
/** навыки моба: детерминированно по типу (+соль для проклятых) */
export function skillsFor(type: string, n: number, salt = 0): string[] {
  const r = rng(hashStr(type) ^ salt), pool = [...SKILL_IDS], out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
const ck = (x: number, y: number) => Math.floor(x / WORLD_CHUNK) * 4096 + Math.floor(y / WORLD_CHUNK);

export interface ZCast { leap?: boolean; kind: "circle" | "line" | "ring" | "nova"; at: number; x: number; y: number; dx?: number; dy?: number; r?: number; r0?: number; len?: number; w?: number; dmg: number }
export interface ZMob { id: number; type: string; respawn: number; sx: number; sy: number; x: number; y: number; hp: number; maxHp: number; dead: boolean; respawnAt: number;
  targetSid: string | null; wanderX: number; wanderY: number; nextWander: number; atkCd: number; dmgBy: Map<string, number>; usedAbility: Set<string>;
  windup: number; dashX: number; dashY: number; dashT: number;
  // процедурный спавн: регион, элита, простой вне боя (для деспавна); fixed — классическая точка респавна
  fixed: boolean; region: string | null; elite: boolean; idle: number;
  // статусы от оружия игроков (сервер-авторитет): урон по времени, замедление, отбрасывание
  dot: { kind: string; dps: number; until: number; sid: string } | null; slowUntil: number; kbx: number; kby: number;
  // телеграфы в полёте, фаза босса, ярость, особый тип (boss/rare), время жизни редкого
  casts: ZCast[]; phase: number; enraged: boolean; special: "" | "boss" | "rare"; expireAt: number; patIdx: number;
  // раунд Аринара: проклятый (10%), навыки и их кд, «сброс» поводка, рывок агрессии, лагерь
  cursed: boolean; skills: string[]; skCd: Record<string, number>; reset: boolean; burstUntil: number; camp: number; leapCd: number; shieldUntil: number }
export interface ZNode { id: number; type: string; res: string; respawn: number; x: number; y: number; readyAt: number; qty: [number, number] }
export interface ZPlayer { sid: string; x: number; y: number; hp: number; maxHp: number; armorRed: number; alive: boolean; respawnAt: number }

const MOB_INDEX: Record<string, number> = Object.fromEntries(Object.keys(ZONE_MOBS).map((k, i) => [k, i]));
const KNOCK_IMMUNE = (d: any) => !!d.boss || d.size !== "s" || d.role === "tank";
const segDist = (px: number, py: number, x: number, y: number, dx: number, dy: number, len: number) => {
  const t = Math.max(0, Math.min(len, (px - x) * dx + (py - y) * dy));
  return Math.hypot(px - (x + dx * t), py - (y + dy * t));
};

export class Zone {
  mobs: ZMob[] = [];
  nodes: ZNode[] = [];
  events: any[] = [];
  world: string;
  gen: WorldGen;
  size: number;
  // процедурный режим
  proc: boolean;
  seed: number;
  rand: () => number;
  nextId = 1;
  tokens = ZONE_GEN.burst;
  dirAcc = 0;
  // мировые боссы и редкие: тип → время следующего появления / id живого
  bossAt: Record<string, number> = {};
  bossIds: Record<string, number> = {};
  rareAt: Record<string, number> = {};
  rareIds: Record<string, number> = {};
  stats = { spawned: 0, despawned: 0, rejected: 0, awake: 0, asleep: 0, resets: 0, cursed: 0 };
  byId = new Map<number, ZMob>();
  buckets = new Map<number, ZMob[]>(); // чанк WORLD_CHUNK → мобы (интерес/выборки)
  awake = new Set<number>();           // чанки рядом с игроками (остальные спят: без ИИ)
  camps: { id: number; region: string; x: number; y: number; types: string[] }[] = [];
  now = Date.now(); // время текущего такта (для телеграфов)

  constructor(world: string, spawns: { type: string; x: number; y: number; respawn: number }[], nodes: { type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[],
    opts: { proc?: boolean; seed?: number } = {}) {
    this.world = world;
    this.gen = genOf(world);
    this.size = this.gen.size;
    this.proc = !!opts.proc;
    this.seed = (opts.seed ?? this.gen.seed) >>> 0;
    this.rand = rng(this.seed);
    spawns.forEach((s) => this.addMob(s.type, s.x, s.y, { fixed: true, respawn: s.respawn }));
    const nodeList = this.proc ? genNodes(this.seed, world) : nodes.map((n, i) => ({ id: 1000 + i, ...n }));
    nodeList.forEach((n) => this.nodes.push({ id: n.id, type: n.type, res: n.res, respawn: n.respawn, x: n.x, y: n.y, readyAt: 0, qty: n.qty }));
    if (this.gen.camps) this.buildCamps();
    this.reindex();
  }

  // Лагеря: сетка с разбросом по регионам с таблицей; соседи дальше campMinDist (бой с одной пачкой не тянет соседей)
  buildCamps() {
    const G = ZONE_GEN, R = rng(this.seed ^ 0xc0ffee);
    for (const reg of this.gen.regions) {
      if (!reg.table.length) continue;
      for (let gx = reg.rect[0] + G.campStep / 2; gx < reg.rect[2]; gx += G.campStep)
        for (let gy = reg.rect[1] + G.campStep / 2; gy < reg.rect[3]; gy += G.campStep) {
          const x = Math.round(gx + (R() - 0.5) * 2 * G.campJitter), y = Math.round(gy + (R() - 0.5) * 2 * G.campJitter);
          if (x < reg.rect[0] + 60 || y < reg.rect[1] + 60 || x > reg.rect[2] - 60 || y > reg.rect[3] - 60) continue;
          if (inSafe(x, y, 300, this.world) || this.gen.bosses.some((b) => Math.hypot(b.x - x, b.y - y) < 700)) continue;
          if (this.camps.some((c) => Math.hypot(c.x - x, c.y - y) < G.campMinDist)) continue;
          let tw = reg.table.reduce((a, b) => a + b.w, 0) * R(), row = reg.table[0];
          for (const t of reg.table) { tw -= t.w; if (tw <= 0) { row = t; break; } }
          const n = row.pack[0] + Math.floor(R() * (row.pack[1] - row.pack[0] + 1));
          // смешанные пачки: к основному типу — дальнобойный/рывковый сосед из той же таблицы
          const alt = reg.table.filter((t) => t.type !== row.type && ["ranged", "charger", "caster"].includes(ZONE_MOBS[t.type]?.role));
          const types: string[] = [];
          for (let i = 0; i < n; i++) types.push(i === n - 1 && n >= 3 && alt.length ? alt[Math.floor(R() * alt.length)].type : row.type);
          const camp = { id: this.camps.length + 1, region: reg.id, x, y, types };
          this.camps.push(camp);
          types.forEach((t, i) => {
            const a = (i / types.length) * Math.PI * 2 + R(), rr = i ? 40 + R() * 40 : 0;
            const m = this.addMob(t, this.clamp(x + Math.cos(a) * rr), this.clamp(y + Math.sin(a) * rr), { fixed: true, respawn: G.campRespawn, region: reg.id, elite: R() < reg.elite });
            m.camp = camp.id;
          });
        }
    }
  }
  /** множитель ХП моба по его флагам */
  hpOf(m: ZMob, scale = 1) {
    const d = ZONE_MOBS[m.type];
    return Math.round(d.hp * (m.elite ? ZONE_GEN.eliteHp : 1) * (m.cursed ? ZONE_GEN.cursedHp : 1) * (d.boss ? 1 + ZONE_GEN.bossScalePerPlayer * (scale - 1) : 1));
  }
  rollCursed(m: ZMob) {
    const d = ZONE_MOBS[m.type];
    m.cursed = this.rand() * 100 < ZONE_GEN.cursedPct;
    m.skills = m.cursed ? skillsFor(m.type, 2 + Math.floor(this.rand() * 4), m.id) : d.boss ? skillsFor(m.type, 1) : [];
    m.skCd = Object.fromEntries(m.skills.map((k, i) => [k, 2 + i * 1.5]));
    if (m.cursed) this.stats.cursed++;
  }
  reindex() {
    this.buckets.clear();
    for (const m of this.mobs) {
      if (m.dead) continue;
      const k = ck(m.x, m.y);
      let b = this.buckets.get(k);
      if (!b) this.buckets.set(k, (b = []));
      b.push(m);
    }
  }
  /** живые мобы в квадрате (x±r, y±r) — по чанкам */
  near(x: number, y: number, r: number): ZMob[] {
    const out: ZMob[] = [];
    const c0 = Math.floor((x - r) / WORLD_CHUNK), c1 = Math.floor((x + r) / WORLD_CHUNK), r0 = Math.floor((y - r) / WORLD_CHUNK), r1 = Math.floor((y + r) / WORLD_CHUNK);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const b = this.buckets.get(cx * 4096 + cy);
      if (b) for (const m of b) if (!m.dead && Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r) out.push(m);
    }
    return out;
  }
  playersNear(grid: Map<number, ZPlayer[]>, x: number, y: number): ZPlayer[] {
    const cx = Math.floor(x / WORLD_CHUNK), cy = Math.floor(y / WORLD_CHUNK), out: ZPlayer[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const b = grid.get((cx + i) * 4096 + cy + j); if (b) for (const p of b) out.push(p); }
    return out;
  }
  computeAwake(players: Map<string, ZPlayer>) {
    this.awake.clear();
    const S = ZONE_GEN.sleepR;
    for (const p of players.values()) {
      const cx = Math.floor(p.x / WORLD_CHUNK), cy = Math.floor(p.y / WORLD_CHUNK);
      for (let i = -S; i <= S; i++) for (let j = -S; j <= S; j++) this.awake.add((cx + i) * 4096 + cy + j);
    }
  }

  get bossId(): number { return Object.values(this.bossIds)[0] || 0; } // совместимость (тесты/отладка)
  isSpecial(m: ZMob) { return m.special !== ""; }
  clamp(v: number) { return Math.max(20, Math.min(this.size - 20, v)); }

  addMob(type: string, x: number, y: number, o: { fixed?: boolean; respawn?: number; region?: string | null; elite?: boolean; hpMul?: number; special?: "" | "boss" | "rare" } = {}) {
    const d = ZONE_MOBS[type];
    const hp = Math.round(d.hp * (o.elite ? ZONE_GEN.eliteHp : 1) * (o.hpMul || 1));
    const m: ZMob = { cursed: false, skills: [], skCd: {}, reset: false, burstUntil: 0, camp: 0, leapCd: 0, shieldUntil: 0, id: this.nextId++, type, respawn: o.respawn || 0, sx: x, sy: y, x, y, hp, maxHp: hp, dead: false, respawnAt: 0, targetSid: null,
      wanderX: x, wanderY: y, nextWander: 0, atkCd: 0, dmgBy: new Map(), usedAbility: new Set(), windup: 0, dashX: 0, dashY: 0, dashT: 0,
      fixed: !!o.fixed, region: o.region || null, elite: !!o.elite, idle: 0, dot: null, slowUntil: 0, kbx: 0, kby: 0,
      casts: [], phase: 1, enraged: false, special: o.special || "", expireAt: 0, patIdx: 0 };
    this.rollCursed(m);
    if (m.cursed) { m.maxHp = m.hp = Math.round(hp * ZONE_GEN.cursedHp); }
    this.mobs.push(m);
    this.byId.set(m.id, m);
    const k = ck(x, y); const b = this.buckets.get(k); if (b) b.push(m); else this.buckets.set(k, [m]);
    return m;
  }

  // ---------- мировые боссы и редкие Отголоски ----------
  specials(now: number, players: Map<string, ZPlayer>) {
    const G = this.gen;
    const scale = Math.max(1, Math.min(4, players.size));
    for (const b of G.bosses) {
      if (!this.bossAt[b.type]) this.bossAt[b.type] = now + b.firstAfter * 1000;
      if (this.bossIds[b.type] || now < this.bossAt[b.type]) continue;
      const m = this.addMob(b.type, b.x, b.y, { region: null, hpMul: 1 + ZONE_GEN.bossScalePerPlayer * (scale - 1), special: "boss" });
      this.bossIds[b.type] = m.id; this.bossAt[b.type] = Number.MAX_SAFE_INTEGER;
      const d = ZONE_MOBS[b.type];
      this.events.push({ k: "announce", text: `${m.cursed ? "☠️ ПРОКЛЯТЫЙ м" : "🌙 М"}ировой босс «${d.name}» (ур. ${d.lvl}) пробуждается ${b.where}!`, color: "#c084fc", x: undefined });
    }
    for (const r of G.rares) {
      if (!this.rareAt[r.type]) this.rareAt[r.type] = now + (r.every[0] + this.rand() * (r.every[1] - r.every[0])) * 1000;
      const live = this.rareIds[r.type] ? this.mobs.find((m) => m.id === this.rareIds[r.type] && !m.dead) : null;
      if (live) {
        if (now > live.expireAt && !live.targetSid) { live.dead = true; live.respawnAt = -1; this.events.push({ k: "announce", text: `«${ZONE_MOBS[r.type].name}» ускользает…`, color: "#94a3b8" }); }
        continue;
      }
      if (this.rareIds[r.type]) { delete this.rareIds[r.type]; this.rareAt[r.type] = now + (r.every[0] + this.rand() * (r.every[1] - r.every[0])) * 1000; continue; }
      if (now < this.rareAt[r.type]) continue;
      const reg = G.regions.find((x) => x.id === r.region);
      if (!reg) continue;
      for (let t = 0; t < 12; t++) {
        const x = reg.rect[0] + 60 + this.rand() * (reg.rect[2] - reg.rect[0] - 120), y = reg.rect[1] + 60 + this.rand() * (reg.rect[3] - reg.rect[1] - 120);
        if (inSafe(x, y, 40, this.world) || [...players.values()].some((p) => Math.hypot(p.x - x, p.y - y) < 260)) continue;
        const m = this.addMob(r.type, x, y, { region: null, special: "rare" });
        m.expireAt = now + r.life * 1000;
        this.rareIds[r.type] = m.id; this.rareAt[r.type] = Number.MAX_SAFE_INTEGER;
        const d = ZONE_MOBS[r.type];
        this.events.push({ k: "announce", text: `✨ Редкий Отголосок «${d.name}» (ур. ${d.lvl}) замечен: ${reg.name}!`, color: "#fde68a" });
        break;
      }
    }
  }

  // ---------- режиссёр процедурного спавна ----------
  // Дёшево: такт раз в 0.5 с, O(мобы × игроки) с малыми числами (кап мобов на мир, AOI по регионам).
  director(dt: number, now: number, players: Map<string, ZPlayer>) {
    const G = ZONE_GEN, W = this.gen;
    this.tokens = Math.min(G.burst, this.tokens + G.ratePerSec * dt);
    const alive = [...players.values()].filter((p) => p.alive);
    // деспавн: далеко от всех и вне боя дольше despawnIdle (боссы и редкие — нет)
    for (const m of this.mobs) {
      if (m.dead || m.fixed || m.special) continue;
      let near = Infinity;
      for (const p of players.values()) near = Math.min(near, Math.hypot(p.x - m.x, p.y - m.y));
      if (near > G.despawnDist && !m.targetSid) m.idle += dt; else m.idle = 0;
      if (m.idle > G.despawnIdle) { m.dead = true; m.respawnAt = -1; this.stats.despawned++; }
    }
    if (!alive.length) return;
    this.specials(now, players);
    const living = this.mobs.filter((m) => !m.dead && !m.fixed && !m.special);
    if (living.length >= W.globalCap || this.tokens < 1) return;
    const night = isNight(now);
    // кандидаты-регионы: рядом хоть с одним игроком и не заполнены
    const regs: { r: Region; deficit: number }[] = [];
    for (const r of W.regions) {
      if (!r.table.length) continue;
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
        const lim = Math.min(W.nearMax, W.nearBase + W.nearPerPlayer * (group - 1));
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
      if (inSafe(x, y, 0, this.world)) continue;
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
    const room = Math.min(n, W.globalCap - living.length, reg.cap - living.filter((m) => m.region === reg.id).length);
    for (let i = 0; i < room; i++) {
      const a = R() * Math.PI * 2, rr = i ? 18 + R() * 26 : 0;
      const x = this.clamp(pos.x + Math.cos(a) * rr), y = this.clamp(pos.y + Math.sin(a) * rr);
      if (i && inSafe(x, y, 0, this.world)) continue; // член стаи не должен оказаться в безопасной зоне
      this.addMob(row.type, x, y, { region: reg.id, elite });
      this.stats.spawned++;
    }
    this.tokens -= 1;
  }

  // ---------- статусы от оружия игроков ----------
  applyStatus(m: ZMob, sid: string, st: { kind?: string; dps?: number; dur?: number; slow?: number | boolean; knock?: number }, fromX: number, fromY: number) {
    const now = Date.now();
    const d = ZONE_MOBS[m.type];
    if (st.kind && st.dps && st.dur) {
      if (!m.dot || m.dot.until < now || m.dot.dps <= st.dps) m.dot = { kind: st.kind, dps: st.dps, until: now + st.dur * 1000, sid };
    }
    if (st.slow) m.slowUntil = now + (d.boss ? 600 : 1200);
    if (st.knock && !KNOCK_IMMUNE(d)) {
      const dx = m.x - fromX, dy = m.y - fromY, dd = Math.hypot(dx, dy) || 1;
      const k = st.knock * (m.elite ? 0.5 : 1);
      m.kbx += (dx / dd) * k * 6; m.kby += (dy / dd) * k * 6;
    }
  }

  // ---------- телеграфы ----------
  cast(m: ZMob, c: ZCast) {
    m.casts.push(c);
    const t = Math.round(Math.max(0.2, (c.at - this.now) / 1000) * 100) / 100;
    if (c.kind === "circle") this.events.push({ k: "tele_circle", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, t });
    else if (c.kind === "line") this.events.push({ k: "tele_line", id: m.id, x: Math.round(c.x), y: Math.round(c.y), dx: +c.dx!.toFixed(3), dy: +c.dy!.toFixed(3), len: c.len, w: c.w, t });
    else if (c.kind === "ring") this.events.push({ k: "tele_ring", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r0: c.r0, r: c.r, t });
    else this.events.push({ k: "tele_circle", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, t, nova: 1 });
  }
  resolveCasts(m: ZMob, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string) => void) {
    for (let i = m.casts.length - 1; i >= 0; i--) {
      const c = m.casts[i];
      if (now < c.at) continue;
      m.casts.splice(i, 1);
      if (c.leap) { m.x = this.clamp(c.x); m.y = this.clamp(c.y); }
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dist = Math.hypot(p.x - c.x, p.y - c.y);
        const hit = c.kind === "circle" || c.kind === "nova" ? dist < c.r! + 8
          : c.kind === "ring" ? dist > c.r0! - 8 && dist < c.r! + 8
          : segDist(p.x, p.y, c.x, c.y, c.dx!, c.dy!, c.len!) < c.w! / 2 + 10;
        if (hit) onHit(p.sid, c.dmg, m.type);
      }
      if (c.kind === "line") this.events.push({ k: "mshot", id: m.id, x: Math.round(c.x), y: Math.round(c.y), tx: Math.round(c.x + c.dx! * c.len!), ty: Math.round(c.y + c.dy! * c.len!) });
      else this.events.push({ k: "slam", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, r0: c.r0 });
    }
  }

  // атаки крупных и боссов: по кругу набора, набор зависит от фазы
  bossPattern(m: ZMob, d: any, best: ZPlayer, players: Map<string, ZPlayer>, now: number) {
    const big = d.size === "huge" ? 1.35 : d.size === "boss" ? 1.15 : 1;
    const dmg = d.dmg * (m.elite ? ZONE_GEN.eliteDmg : 1);
    const tele = (m.enraged ? 0.8 : 1) * (d.size === "l" ? 1.1 : 1.25) * 1000;
    const pats = d.size === "l" ? ["circle", d.role === "charger" ? "dash" : d.role === "caster" ? "triple" : "nova"]
      : m.phase === 1 ? ["circle", "line", "nova"] : m.phase === 2 ? ["triple", "line3", "ring", "circle"] : ["triple", "ring", "line3", "nova", "circle"];
    const p = pats[m.patIdx++ % pats.length];
    const dx = best.x - m.x, dy = best.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    if (p === "circle") this.cast(m, { kind: "circle", at: now + tele, x: best.x, y: best.y, r: Math.round(85 * big), dmg: dmg * 1.6 });
    else if (p === "triple") {
      const targets = [...players.values()].filter((q) => q.alive && Math.hypot(q.x - m.x, q.y - m.y) < 420).slice(0, 3);
      for (let i = 0; i < 3; i++) {
        const t = targets[i] || best, a = i * 2.1 + this.rand();
        this.cast(m, { kind: "circle", at: now + tele + i * 180, x: t.x + (targets[i] ? 0 : Math.cos(a) * 90), y: t.y + (targets[i] ? 0 : Math.sin(a) * 90), r: Math.round(70 * big), dmg: dmg * 1.4 });
      }
    } else if (p === "line" || p === "line3") {
      const n = p === "line3" ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(uy, ux) + (i - (n - 1) / 2) * 0.45;
        this.cast(m, { kind: "line", at: now + tele, x: m.x, y: m.y, dx: Math.cos(a), dy: Math.sin(a), len: Math.round(360 * big), w: Math.round(36 * big), dmg: dmg * 1.7 });
      }
    } else if (p === "nova") this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(150 * big), dmg: dmg * 1.5 });
    else if (p === "ring") this.cast(m, { kind: "ring", at: now + tele * 1.1, x: m.x, y: m.y, r0: Math.round(90 * big), r: Math.round(260 * big), dmg: dmg * 1.6 });
    else if (p === "dash") { m.windup = 0.7; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 220, t: 0.7 }); }
    m.atkCd = (d.size === "l" ? 3.2 : 3.6) * (m.enraged ? 0.7 : 1);
  }

  // смена фазы босса: объявление + призыв помощников из окрестного региона
  checkPhase(m: ZMob, d: any) {
    if (!d.boss) return;
    const frac = m.hp / m.maxHp;
    const want = frac <= 0.3 ? 3 : frac <= 0.6 ? 2 : 1;
    if (want <= m.phase) return;
    m.phase = want;
    if (want === 3) m.enraged = true;
    this.events.push({ k: "phase", id: m.id, x: Math.round(m.x), y: Math.round(m.y), p: want, text: want === 3 ? `«${d.name}» в ярости!` : `«${d.name}» меняет тактику!` });
    const pool = Object.entries(ZONE_MOBS).filter(([, x]) => x.size === "s" && !x.rare && x.tier === d.tier && x.role !== "tank").map(([k]) => k);
    const n = d.size === "huge" ? 4 : 3;
    for (let i = 0; i < n && pool.length; i++) {
      const a = (i / n) * Math.PI * 2;
      const add = this.addMob(pool[Math.floor(this.rand() * pool.length)], this.clamp(m.x + Math.cos(a) * 70), this.clamp(m.y + Math.sin(a) * 70), { region: null });
      add.targetSid = m.targetSid;
    }
  }

  // players: sid → состояние игрока в мире. onHit(sid, dmg) — урон игроку; onKill(mob) — смерть моба.
  update(dt: number, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string) => void, onKill: (m: ZMob) => void) {
    this.now = now;
    const scale = Math.max(1, Math.min(4, players.size)); // ХП босса растёт с числом игроков (ограниченно)
    if (this.proc) {
      // убитые/исчезнувшие процедурные мобы удаляются (их место займёт режиссёр)
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (m.dead && !m.fixed) {
          if (m.special === "boss") {
            const b = this.gen.bosses.find((x) => x.type === m.type);
            delete this.bossIds[m.type]; this.bossAt[m.type] = now + (b?.every || 600) * 1000;
          }
          if (m.special === "rare" && this.rareIds[m.type] === m.id) {
            const r = this.gen.rares.find((x) => x.type === m.type)!;
            delete this.rareIds[m.type]; this.rareAt[m.type] = now + (r.every[0] + this.rand() * (r.every[1] - r.every[0])) * 1000;
          }
          this.byId.delete(m.id);
          this.mobs.splice(i, 1);
        }
      }
      this.dirAcc += dt;
      if (this.dirAcc >= ZONE_GEN.directorEvery) {
        if (this.gen.camps) { if ([...players.values()].some((p) => p.alive)) this.specials(now, players); } // лагеря вместо режиссёра
        else this.director(this.dirAcc, now, players);
        this.dirAcc = 0;
      }
    }
    const sleepy = !!this.gen.camps;
    if (sleepy) this.computeAwake(players);
    // сетка игроков по чанкам: поиск цели — только среди соседних чанков (O(мобы × игроки рядом))
    let pgrid: Map<number, ZPlayer[]> | null = null;
    if (sleepy && players.size > 4) { pgrid = new Map(); for (const p of players.values()) { const k = ck(p.x, p.y); const b = pgrid.get(k); if (b) b.push(p); else pgrid.set(k, [p]); } }
    let awake = 0, asleep = 0;
    for (const m of this.mobs) {
      const d = ZONE_MOBS[m.type];
      // сон: чанк без игроков рядом — без ИИ (мобы заморожены; поводок/лечение — мгновенно при засыпании)
      if (sleepy && !this.awake.has(ck(m.x, m.y))) {
        asleep++;
        if (!m.dead && (m.targetSid || m.reset || m.hp < m.maxHp)) { m.x = m.sx; m.y = m.sy; m.hp = m.maxHp; m.targetSid = null; m.reset = false; m.casts = []; m.dot = null; m.windup = 0; m.dashT = 0; }
        continue;
      }
      awake++;
      if (!m.dead && m.dot) {
        if (now >= m.dot.until) m.dot = null;
        else {
          const dmg = m.dot.dps * dt;
          m.hp -= dmg;
          m.dmgBy.set(m.dot.sid, (m.dmgBy.get(m.dot.sid) || 0) + dmg);
          if (m.hp <= 0) { this.kill(m, onKill); continue; }
          this.checkPhase(m, d);
        }
      }
      if (!m.dead && (m.kbx || m.kby)) {
        m.x += m.kbx * dt * 10; m.y += m.kby * dt * 10;
        m.kbx *= 0.75; m.kby *= 0.75;
        if (Math.abs(m.kbx) + Math.abs(m.kby) < 0.5) { m.kbx = 0; m.kby = 0; }
      }
      if (m.dead) {
        if (m.fixed && now >= m.respawnAt) {
          m.dead = false; m.x = m.sx; m.y = m.sy; m.reset = false;
          if (m.camp) { m.elite = this.rand() < (this.gen.regions.find((r) => r.id === m.region)?.elite || 0); }
          this.rollCursed(m); m.maxHp = this.hpOf(m, scale); m.hp = m.maxHp;
          m.dmgBy.clear(); m.usedAbility.clear(); m.targetSid = null; m.phase = 1; m.enraged = false; m.casts = [];
        }
        continue;
      }
      if (m.casts.length) this.resolveCasts(m, now, players, onHit);
      // цель
      // поводок MMO: утащили далеко от дома → «сброс»: домой бегом, быстро лечится до полного, игнорирует игроков
      const homeD = Math.hypot(m.x - m.sx, m.y - m.sy);
      if (!m.reset && m.targetSid && homeD > (m.special || d.boss ? ZONE_GEN.leashBoss : ZONE_GEN.leash)) {
        m.reset = true; m.targetSid = null; m.casts = []; m.windup = 0; m.dashT = 0; m.dot = null; m.burstUntil = 0; this.stats.resets++;
        this.events.push({ k: "evade", id: m.id, x: Math.round(m.x), y: Math.round(m.y) });
      }
      if (m.reset) {
        const dx = m.sx - m.x, dy = m.sy - m.y, dist = Math.hypot(dx, dy);
        const sp = d.speed * ZONE_GEN.resetSpeed * dt;
        if (dist > sp) { m.x += (dx / dist) * sp; m.y += (dy / dist) * sp; } else { m.x = m.sx; m.y = m.sy; }
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * ZONE_GEN.resetRegen * dt);
        if (dist <= sp && m.hp >= m.maxHp) { m.reset = false; m.dmgBy.clear(); m.usedAbility.clear(); m.phase = 1; m.enraged = false; }
        continue;
      }
      const aggro = d.aggro * (m.special ? 1.2 : 1) * (m.cursed ? 1.25 : 1);
      let best: ZPlayer | null = null, bd = aggro;
      if (m.targetSid) { const t = players.get(m.targetSid); if (t && t.alive) { const dd = Math.hypot(t.x - m.x, t.y - m.y); if (dd < aggro * (m.special ? 2.6 : 1.8)) { best = t; bd = dd; } } }
      if (!best) for (const p of (pgrid ? this.playersNear(pgrid, m.x, m.y) : players.values())) { if (!p.alive) continue; const dd = Math.hypot(p.x - m.x, p.y - m.y); if (dd < bd) { bd = dd; best = p; } }
      const fresh = !m.targetSid && best;
      m.targetSid = best ? best.sid : null;
      if (fresh) {
        m.burstUntil = now + 1200; // рывок агрессии: первые 1.2 с — быстрее (от пачки не уйти шагом)
        if (m.camp) for (const o of this.near(m.x, m.y, 360)) if (o.camp === m.camp && !o.targetSid && !o.reset) { o.targetSid = m.targetSid; o.burstUntil = now + 1200; } // пачка агрится вместе
      }
      m.atkCd = Math.max(0, m.atkCd - dt);
      m.leapCd = Math.max(0, m.leapCd - dt);
      for (const k of m.skills) m.skCd[k] = Math.max(0, (m.skCd[k] || 0) - dt);
      const eliteDmg = (m.elite ? ZONE_GEN.eliteDmg : 1) * (m.cursed ? ZONE_GEN.cursedDmg : 1);
      // рывок (charger и крупные): замах (телеграф) → рывок
      if (m.dashT > 0) {
        const dsp = d.size === "s" ? 330 : 420;
        m.dashT -= dt; m.x += m.dashX * dsp * dt; m.y += m.dashY * dsp * dt;
        for (const p of players.values()) if (p.alive && Math.hypot(p.x - m.x, p.y - m.y) < d.radius + 12 && !m.usedAbility.has("dash:" + p.sid)) { onHit(p.sid, d.dmg * 1.5 * eliteDmg, m.type); m.usedAbility.add("dash:" + p.sid); }
        if (m.dashT <= 0) for (const k of [...m.usedAbility]) if (k.startsWith("dash:")) m.usedAbility.delete(k);
        m.x = this.clamp(m.x); m.y = this.clamp(m.y);
        continue;
      }
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup <= 0) m.dashT = d.size === "s" ? 0.35 : 0.5;
        continue;
      }
      if (best) {
        const dx = best.x - m.x, dy = best.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
        const sp = d.speed * ((m as any).frozenUntil > now ? 0 : 1) * (m.slowUntil > now ? 0.55 : 1) * (m.elite ? 1.1 : 1) * (m.enraged ? 1.3 : 1) * (m.burstUntil > now ? 1.6 : 1);
        let want = d.radius + 14; // желаемая дистанция
        // навыки боссов/проклятых (свои кд)
        if (m.skills.length && dist < 420) {
          const k = m.skills.find((x) => m.skCd[x] <= 0);
          if (k) { this.useSkill(m, d, k, best, players, now, eliteDmg); m.skCd[k] = MOB_SKILLS[k].cd * (m.enraged ? 0.75 : 1); continue; }
        }
        if (d.size !== "s") {
          if (m.atkCd <= 0 && dist < 380) { this.bossPattern(m, d, best, players, now); continue; }
        } else if (d.role === "charger") {
          if (dist < 150 && dist > 50 && m.atkCd <= 0) {
            m.windup = 0.55; m.dashX = ux; m.dashY = uy; m.atkCd = 2.4;
            this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 115, t: 0.55 });
            continue;
          }
        } else if ((d.role === "melee" || d.role === "swarm") && d.lvl >= 3 && dist > 80 && dist < 210 && m.leapCd <= 0) {
          // прыжок: круг-телеграф под целью, через 0.65 с моб приземляется туда (уклоняемо)
          this.cast(m, { kind: "circle", at: now + 650, x: best.x, y: best.y, r: 52, dmg: d.dmg * 1.3 * eliteDmg, leap: true });
          m.leapCd = d.role === "swarm" ? 7 : 5; m.windup = 0.65; m.dashX = 0; m.dashY = 0;
          continue;
        } else if (d.role === "ranged") {
          want = 170;
          if (dist < 280 && m.atkCd <= 0) {
            this.cast(m, { kind: "line", at: now + 700, x: m.x, y: m.y, dx: ux, dy: uy, len: 290, w: 20, dmg: d.dmg * 1.2 * eliteDmg });
            m.atkCd = 2.2; m.windup = 0.45;
            continue;
          }
        } else if (d.role === "caster") {
          want = 190;
          if (dist < 300 && m.atkCd <= 0) {
            this.cast(m, { kind: "circle", at: now + 1000, x: best.x, y: best.y, r: 60, dmg: d.dmg * 1.4 * eliteDmg });
            m.atkCd = 2.8; m.windup = 0.4;
            continue;
          }
        }
        if (dist > want) { m.x += ux * sp * dt; m.y += uy * sp * dt; }
        else if (want > d.radius + 14 && dist < want - 50) { m.x -= ux * sp * 0.6 * dt; m.y -= uy * sp * 0.6 * dt; } // держит дистанцию
        if (dist <= d.radius + 16 && m.atkCd <= 0) {
          const tank = d.role === "tank";
          onHit(best.sid, d.dmg * eliteDmg * (tank ? 1.25 : d.role === "swarm" ? 0.9 : 1), m.type);
          m.atkCd = tank ? 1.4 : d.role === "swarm" ? 0.9 : 1.1;
        }
      } else {
        // возврат/брожение у точки спавна; регенерация вне боя
        if (now >= m.nextWander) { m.nextWander = now + 2500 + Math.random() * 3000; m.wanderX = m.sx + (Math.random() - 0.5) * 120; m.wanderY = m.sy + (Math.random() - 0.5) * 120; if (!m.fixed && inSafe(m.wanderX, m.wanderY, 0, this.world)) { m.wanderX = m.sx; m.wanderY = m.sy; } }
        const dx = m.wanderX - m.x, dy = m.wanderY - m.y, dist = Math.hypot(dx, dy);
        if (dist > 4) { m.x += (dx / dist) * d.speed * 0.4 * dt; m.y += (dy / dist) * d.speed * 0.4 * dt; }
        if (!m.dot) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt); // горящий/отравленный не лечится
        if (m.hp >= m.maxHp) { m.dmgBy.clear(); m.usedAbility.clear(); m.phase = 1; m.enraged = false; }
      }
      m.x = this.clamp(m.x); m.y = this.clamp(m.y);
    }
    this.stats.awake = awake; this.stats.asleep = asleep;
    this.reindex();
  }

  useSkill(m: ZMob, d: any, k: string, t: ZPlayer, players: Map<string, ZPlayer>, now: number, mul: number) {
    const big = d.size === "huge" ? 1.35 : d.size === "boss" ? 1.15 : d.size === "l" ? 1 : 0.7;
    const dmg = d.dmg * mul, tele = (m.enraged ? 800 : 1000);
    const dx = t.x - m.x, dy = t.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    this.events.push({ k: "mskill", id: m.id, x: Math.round(m.x), y: Math.round(m.y), name: MOB_SKILLS[k].name });
    if (k === "frost_nova") { this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(170 * big), dmg: dmg * 1.4 }); for (const p of players.values()) void p; }
    else if (k === "meteor") { const ts = [...players.values()].filter((q) => q.alive && Math.hypot(q.x - m.x, q.y - m.y) < 450).slice(0, 3); ts.forEach((q, i) => this.cast(m, { kind: "circle", at: now + tele * 1.3 + i * 200, x: q.x, y: q.y, r: Math.round(90 * big), dmg: dmg * 1.8 })); }
    else if (k === "spear_rain") { for (let i = 0; i < 5; i++) { const a = this.rand() * 6.283, r = 40 + this.rand() * 110; this.cast(m, { kind: "circle", at: now + tele + i * 120, x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, r: Math.round(50 * big), dmg: dmg * 1.2 }); } }
    else if (k === "whirlwind") this.cast(m, { kind: "ring", at: now + tele, x: m.x, y: m.y, r0: Math.round(30 * big), r: Math.round(210 * big), dmg: dmg * 1.5 });
    else if (k === "fly_blade_dash") { m.windup = 0.6; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 220, t: 0.6 }); }
    else if (k === "shadow_step") { m.x = this.clamp(t.x - ux * 60); m.y = this.clamp(t.y - uy * 60); this.cast(m, { kind: "circle", at: now + 600, x: t.x, y: t.y, r: Math.round(70 * big), dmg: dmg * 1.5 }); }
    else if (k === "fireball") this.cast(m, { kind: "line", at: now + 550, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(420 * Math.max(0.8, big)), w: Math.round(40 * big), dmg: dmg * 1.6 });
    else if (k === "shield_wall") m.shieldUntil = now + 4000;
    else if (k === "smoke_bomb") { this.cast(m, { kind: "circle", at: now + 700, x: m.x, y: m.y, r: Math.round(120 * big), dmg: dmg * 0.9 }); for (const p of players.values()) if (Math.hypot(p.x - m.x, p.y - m.y) < 140 * big) void p; }
    m.atkCd = Math.max(m.atkCd, 1.2);
  }

  // Атака игрока по мобу (авто-атака). Дистанция/кд проверяются; урон считает вызывающий по статам героя.
  attack(p: ZPlayer, mobId: number, now: number, lastAt: number): ZMob | null {
    if (now - lastAt < ZONE_ATTACK_CD_MS) return null;
    const m = this.byId.get(mobId);
    if (!m || m.dead || !p.alive) return null;
    if (Math.hypot(m.x - p.x, m.y - p.y) > ZONE_ATTACK_RANGE + ZONE_MOBS[m.type].radius) return null;
    return m;
  }
  // Удар по клику: цели вдоль направления (dx,dy — единичный вектор) по форме оружия, ближние первыми
  targetsInDir(p: ZPlayer, dx: number, dy: number, atk: { kind: string; range: number; width?: number; arc?: number; max?: number }): ZMob[] {
    if (!p.alive) return [];
    const out: { m: ZMob; d: number }[] = [];
    for (const m of this.near(p.x, p.y, atk.range + 80)) {
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
    return this.near(x, y, r + 60).filter((m) => Math.hypot(m.x - x, m.y - y) <= r + ZONE_MOBS[m.type].radius);
  }
  damage(m: ZMob, sid: string, dmg: number, onKill: (m: ZMob) => void) {
    if (m.dead) return;
    const d = ZONE_MOBS[m.type];
    if (m.reset) { this.events.push({ k: "hit", id: m.id, d: 0, evade: 1 }); return 0; } // «Уклонение»: сбрасывающийся моб неуязвим
    const armor = d.armor * (m.elite ? ZONE_GEN.eliteArmor : 1) * (m.cursed ? 1.3 : 1);
    const real = Math.max(1, Math.round(dmg * (1 - Math.min(0.65, armor / (armor + 60))) * (m.shieldUntil > Date.now() ? 0.5 : 1)));
    m.hp -= real;
    m.dmgBy.set(sid, (m.dmgBy.get(sid) || 0) + real);
    if (!m.targetSid) m.targetSid = sid;
    this.events.push({ k: "hit", id: m.id, d: real });
    if (m.hp <= 0) this.kill(m, onKill);
    else this.checkPhase(m, d);
    return real;
  }
  kill(m: ZMob, onKill: (m: ZMob) => void) {
    m.dead = true; m.hp = 0; m.windup = 0; m.dashT = 0; m.dot = null; m.casts = [];
    m.respawnAt = Date.now() + m.respawn * 1000;
    this.events.push({ k: "die", id: m.id, x: Math.round(m.x), y: Math.round(m.y), type: m.type });
    if (m.special === "boss") this.events.push({ k: "announce", text: `🏆 ${m.cursed ? "Проклятый м" : "М"}ировой босс «${ZONE_MOBS[m.type].name}» повержен!`, color: "#fde68a" });
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
    const now = Date.now();
    for (const x of (this.gen.camps ? this.near(px, py, aoi * 1.6) : this.mobs)) {
      if (x.dead) continue;
      const far = Math.abs(x.x - px) > aoi || Math.abs(x.y - py) > aoi;
      if (far && !(x.special && Math.abs(x.x - px) < aoi * 1.6 && Math.abs(x.y - py) < aoi * 1.6)) continue; // боссов видно дальше
      const st = x.dot ? (x.dot.kind === "burn" ? 8 : x.dot.kind === "poison" ? 16 : 32) : 0;
      m.push(x.id, MOB_INDEX[x.type], Math.round(x.x), Math.round(x.y), Math.round((x.hp / x.maxHp) * 100),
        (x.windup > 0 ? 1 : x.dashT > 0 ? 2 : 0) | (x.elite ? 4 : 0) | st | (x.slowUntil > now ? 64 : 0) | (x.enraged ? 128 : 0) | (x.special === "boss" ? 256 : x.special === "rare" ? 512 : 0) | (x.cursed ? 1024 : 0) | (x.reset ? 2048 : 0));
    }
    const nr = aoi * 2.2; // узлы — тоже по интересу (в Аринаре их сотни)
    const n = this.nodes.filter((x) => !this.gen.camps || (Math.abs(x.x - px) < nr && Math.abs(x.y - py) < nr)).map((x) => [x.id, now >= x.readyAt ? 1 : 0]);
    const near = ev.filter((e) => e.x === undefined || (Math.abs(e.x - px) <= aoi * 1.4 && Math.abs(e.y - py) <= aoi * 1.4));
    return { w: this.world, m, n, ev: near, sd: this.proc ? this.seed : undefined };
  }
}
