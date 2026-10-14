// Открытые миры (Аринар — государство Мэлвелдил; Поляна хаба): общие для всех онлайн-игроков мобы и узлы ресурсов.
// Полностью серверный авторитет: позиции/HP мобов, урон по игрокам, сбор, дроп. Клиент лишь присылает
// намерения (атаковать / начать-закончить сбор / применить навык) — сервер проверяет дистанцию и кд.
// ИИ по ролям (bestiary.ts): melee, swarm, charger (замах → рывок), ranged (линия-телеграф → выстрел),
// caster (круг-телеграф под целью), tank (медленный, не отбрасывается). Крупные/боссы — набор
// телеграфируемых атак по фазам (60% / 30% ХП): круги, линии, кольцо, «волна» вокруг, призыв, ярость.
import { ZONE_MOBS, ABILITY_BY_ID, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, ZONE_ATTACK_CD_MS } from "./defs";
import "./zoneTables"; // заполняет таблицы мобов регионов (только сервер)
import { ZONE_GEN, BOSS_TIMERS, rng, inSafe, isNight, genNodes, genOf, type Region, type WorldGen } from "./zoneGen";
import { WORLD_CHUNK } from "../worlds/sizes";

// Навыки боссов и проклятых (ids — базы навыков бестиария). Обычный босс — ровно 1 навык, проклятый — 2–5.
import { MOB_SKILLS, MOB_NATIVE } from "./mobSkills";
import { shapeOf } from "./abilityShapes";
export { MOB_SKILLS };
const SKILL_IDS = Object.keys(MOB_SKILLS);
const hashStr = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
/** навыки моба: детерминированно по типу (+соль для проклятых) */
export function skillsFor(type: string, n: number, salt = 0): string[] {
  const r = rng(hashStr(type) ^ salt), pool = [...SKILL_IDS], out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
const ck = (x: number, y: number) => Math.floor(x / WORLD_CHUNK) * 4096 + Math.floor(y / WORLD_CHUNK);
// ячейка сна мельче чанка интереса: камера 30 клеток (AOI ±607 px) — бодрствует 3×3 ячейки по 1000 px вокруг игрока (≥1000 px во все стороны)
const SLEEP_CELL = 1000;
const sk = (x: number, y: number) => Math.floor(x / SLEEP_CELL) * 4096 + Math.floor(y / SLEEP_CELL);

export interface ZCast { proj?: string; fx?: string; leap?: boolean; kind: "circle" | "line" | "ring" | "nova"; at: number; x: number; y: number; dx?: number; dy?: number; r?: number; r0?: number; len?: number; w?: number; dmg: number }
export interface ZMob { id: number; type: string; respawn: number; sx: number; sy: number; x: number; y: number; hp: number; maxHp: number; dead: boolean; respawnAt: number;
  targetSid: string | null; wanderX: number; wanderY: number; nextWander: number; atkCd: number; dmgBy: Map<string, number>; usedAbility: Set<string>;
  windup: number; dashX: number; dashY: number; dashT: number;
  // процедурный спавн: регион, элита, простой вне боя (для деспавна); fixed — классическая точка респавна
  fixed: boolean; region: string | null; elite: boolean; idle: number; chief?: boolean;
  // статусы от оружия игроков (сервер-авторитет): урон по времени, замедление, отбрасывание
  dot: { kind: string; dps: number; until: number; sid: string } | null; dots?: { kind: string; dps: number; until: number; sid: string }[]; slowUntil: number; kbx: number; kby: number;
  // телеграфы в полёте, фаза босса, ярость, особый тип (boss/rare), время жизни редкого
  casts: ZCast[]; phase: number; enraged: boolean; special: "" | "boss" | "rare"; expireAt: number; patIdx: number;
  // раунд Аринара: проклятый (10%), навыки и их кд, «сброс» поводка, рывок агрессии, лагерь
  cursed: boolean; skills: string[]; skCd: Record<string, number>; reset: boolean; burstUntil: number; camp: number; leapCd: number; shieldUntil: number;
  // бой моб↔моб (кочевники и враждебные фракции): цель-моб, время следующего осмотра; маршрут кочевника
  mobTarget: number; scanAt: number; roam: { pts: [number, number][]; i: number; home: [number, number]; waitUntil: number } | null;
  // бродячий моб (ambient): sid игрока-«хозяина», охота до huntUntil, множитель респавна лагеря (rk × campRespawn — живая правка)
  ambient?: string; huntUntil?: number; bornAt?: number; rk?: number }
export interface ZNode { id: number; type: string; res: string; respawn: number; x: number; y: number; readyAt: number; qty: [number, number] }
export interface ZPlayer { sid: string; x: number; y: number; hp: number; maxHp: number; armorRed: number; alive: boolean; respawnAt: number }

// ---------- фракции (бой моб↔моб) ----------
// Фракция — тема биома варианта (ice_/fire_/stone_/air_) или «дикие» (старые ярусы). Таблица враждебности
// симметрична: стихии воюют по кругу соседей, дикие — со всеми стихиями. Своя фракция не враждует.
export const HOSTILITY: Record<string, string[]> = {
  ice: ["fire", "air", "wild"], fire: ["ice", "stone", "wild"], stone: ["fire", "air", "wild"], air: ["stone", "ice", "wild"],
  wild: ["ice", "fire", "stone", "air"],
};
export const factionOf = (type: string) => { const k = type.split("_")[0]; return HOSTILITY[k] && k !== "wild" ? k : "wild"; };
export const hostile = (a: string, b: string) => HOSTILITY[factionOf(a)].includes(factionOf(b));
/** гладкий шум 0..1 (значения в узлах решётки step, билинейно) — плотность лагерей «пятнами» */
function valueNoise(seed: number, step: number) {
  const h = (i: number, j: number) => { let x = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  return (x: number, y: number) => {
    const gx = x / step, gy = y / step, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx, b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}
export const regSig = (r: any) => JSON.stringify([r.dens, r.packs, r.pack, r.elite, r.eliteMax, r.bossOn]);
export const DOT_STACK_MAX = 5; // стаков одного статуса на цели
const MOB_INDEX: Record<string, number> = Object.fromEntries(Object.keys(ZONE_MOBS).map((k, i) => [k, i]));
// выстрел дальнобойного моба: спрайт по стихии
const MOB_SHOT: Record<string, string> = { ice: "ice_fan", fire: "fire_spark", stone: "spear", air: "chain_bolt", wild: "thorn_bow" };
const KNOCK_IMMUNE = (d: any) => !!d.boss || d.size !== "s" || d.role === "tank";
const segDist = (px: number, py: number, x: number, y: number, dx: number, dy: number, len: number) => {
  const t = Math.max(0, Math.min(len, (px - x) * dx + (py - y) * dy));
  return Math.hypot(px - (x + dx * t), py - (y + dy * t));
};

// Снаряды — сущности сервера: летят со скоростью, урон в момент попадания (не мгновенно), столкновения считает сервер.
// owner "p" — снаряд игрока (бьёт мобов), "m" — снаряд моба (бьёт игроков, от него можно увернуться).
export interface Proj {
  id: number; o: "p" | "m"; sid?: string; mob?: number; t: string; x: number; y: number; dx: number; dy: number; spd: number; range: number; w: number;
  max: number; flown: number; hit: Set<number | string>; n: number; arc?: boolean; delay?: number; born: number;
  onHit?: (target: any, i: number) => void; onEnd?: (x: number, y: number, hit: boolean) => void;
}
export const PROJ_SPEED: Record<string, number> = { default: 640, auto_bow: 900, thorn_bow: 900, spear: 820, pierce: 820, auto_daggers: 760, daggers: 760, fireball: 560, fire_spark: 760, moon_orb: 520, split_shard: 620, war_axe: 600, ice_fan: 720, auto_staff: 620, auto_claws: 700, chain_bolt: 1100, mob: 420 };

export class Zone {
  projs: Proj[] = []; private nextProj = 1;
  /** выпустить снаряд (сервер); событие proj — клиентам для отрисовки (траектория детерминирована) */
  fire(o: Partial<Proj> & { o: "p" | "m"; t: string; x: number; y: number; dx: number; dy: number; range: number; w: number; max: number }) {
    if (this.projs.length > 600) return null; // предохранитель
    const L = Math.hypot(o.dx, o.dy) || 1;
    const p: Proj = { spd: PROJ_SPEED[o.t] || PROJ_SPEED.default, flown: 0, hit: new Set(), n: 0, born: this.now || Date.now(), id: this.nextProj++, ...o, dx: o.dx / L, dy: o.dy / L } as Proj;
    this.projs.push(p);
    this.events.push({ k: "proj", _b: p.born, cid: (p as any).cid, id: p.id, o: p.o, sid: p.sid, t: p.t, x: Math.round(p.x), y: Math.round(p.y), dx: +p.dx.toFixed(3), dy: +p.dy.toFixed(3), s: p.spd, r: Math.round(p.range), arc: p.arc ? 1 : undefined });
    return p;
  }
  /** движение и столкновения снарядов: шаги не длиннее ширины снаряда (быстрый снаряд не «перепрыгивает» моба) */
  updateProjs(dt: number, players: Map<string, ZPlayer>) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      let left = Math.min(p.range - p.flown, p.spd * dt), done = false;
      if (p.arc) { // навесной (фляга): летит над головами, урон — по месту падения
        p.flown += left; p.x += p.dx * left; p.y += p.dy * left;
        if (p.flown >= p.range - 0.5) done = true;
      } else while (left > 0 && !done) {
        const st = Math.min(left, Math.max(6, p.w * 0.5)); left -= st;
        p.x += p.dx * st; p.y += p.dy * st; p.flown += st;
        if (p.o === "p") {
          for (const m of this.near(p.x, p.y, p.w + 60)) {
            if (m.dead || p.hit.has(m.id)) continue;
            if (Math.hypot(m.x - p.x, m.y - p.y) > ZONE_MOBS[m.type].radius + p.w / 2) continue;
            p.hit.add(m.id); const k = p.n++; p.onHit?.(m, k); // n считаем и без onHit (взрыв в onEnd)
            if (p.n >= p.max) { done = true; break; }
          }
        } else {
          for (const pl of players.values()) {
            if (!pl.alive || p.hit.has(pl.sid)) continue;
            if (Math.hypot(pl.x - p.x, pl.y - p.y) > 14 + p.w / 2) continue;
            p.hit.add(pl.sid); const k = p.n++; p.onHit?.(pl, k);
            if (p.n >= p.max) { done = true; break; }
          }
        }
        if (p.flown >= p.range - 0.5) done = true;
      }
      if (done) {
        this.projs.splice(i, 1);
        this.events.push({ k: "pend", id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: p.n > 0 ? 1 : undefined, t: p.t });
        p.onEnd?.(p.x, p.y, p.n > 0);
      }
    }
  }
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
  stats = { spawned: 0, despawned: 0, rejected: 0, awake: 0, asleep: 0, resets: 0, cursed: 0, roamers: 0, mobHits: 0, mobKills: 0 };
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

  // Лагеря (органично): «дротики» Пуассона с ПЕРЕМЕННЫМ минимумом (campMinDist…×2.3) и плотностью по гладкому шуму —
  // где-то лагеря кучно (но не ближе campMinDist: бой с одной пачкой не тянет соседей), где-то пустоши.
  // Форма пачки: клякса / цепочка / две кучки / полумесяц; размер пачки плавает. Затем кочевники (roamPct).
  buildCamps() {
    const G = ZONE_GEN, R = rng(this.seed ^ 0xc0ffee);
    const dens = valueNoise(this.seed ^ 0x51ed, 3200), dens2 = valueNoise(this.seed ^ 0x9a1, 900);
    const CELL = 1000, grid = new Map<number, { x: number; y: number }[]>();
    const gk = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
    const tooClose = (x: number, y: number, d: number) => {
      const r = Math.ceil(d / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const c of grid.get((cx + i) * 4096 + cy + j) || []) if (Math.hypot(c.x - x, c.y - y) < d) return true;
      return false;
    };
    for (const reg of this.gen.regions) this.buildRegionCamps(reg, R, dens, dens2, grid, gk, tooClose);
    this.buildRoamers(R);
  }
  /** лагеря одной локации (и при старте, и при правке плотности в админке — тогда старые лагеря локации убираются) */
  buildRegionCamps(reg: any, R: () => number, dens: (x: number, y: number) => number, dens2: (x: number, y: number) => number, grid: Map<number, any[]>, gk: (x: number, y: number) => number, tooClose: (x: number, y: number, d: number) => boolean) {
    const G = ZONE_GEN;
    this.regBuilt[reg.id] = regSig(reg); // с какими настройками построены лагеря (пересборка — только при изменении)
    {
      if (!reg.table.length || reg.dens === 0) return;
      const w = reg.rect[2] - reg.rect[0], h = reg.rect[3] - reg.rect[1];
      const want = Math.max(1, Math.round((w * h) / (G.campStep * G.campStep) * G.campFill * (reg.dens ?? 1)));
      const minMul = 1 / Math.sqrt(Math.max(0.25, reg.dens ?? 1)); // гуще — лагеря ближе (но не ближе 0.5×)
      let made = 0;
      for (let t = 0; t < want * 14 && made < want; t++) {
        const x = Math.round(reg.rect[0] + 60 + R() * (w - 120)), y = Math.round(reg.rect[1] + 60 + R() * (h - 120));
        const dn = 0.65 * dens(x, y) + 0.35 * dens2(x, y);                  // 0..1: густо/пусто
        if (R() > G.campAccept + dn * dn * 1.3) continue;
        const minD = G.campMinDist * Math.max(0.5, minMul) * (1 + (1 - dn) * 1.8 * R() + (R() < 0.15 ? 0.6 : 0));       // в густых пятнах — ближе (но ≥ campMinDist)
        if (inSafe(x, y, 300, this.world) || this.gen.bosses.some((b) => Math.hypot(b.x - x, b.y - y) < 700)) continue;
        if (tooClose(x, y, minD)) continue;
        let tw = reg.table.reduce((a, b) => a + b.w, 0) * R(), row = reg.table[0];
        for (const tr of reg.table) { tw -= tr.w; if (tw <= 0) { row = tr; break; } }
        // БОЛЬШОЙ лагерь: 2–3 пачки по кругу (радиус campRing) + вожак в центре (иногда два вожака)
        const alt = reg.table.filter((tr) => tr.type !== row.type && ["ranged", "charger", "caster"].includes(ZONE_MOBS[tr.type]?.role));
        const nPacks = reg.packs ? reg.packs[0] + Math.floor(R() * (reg.packs[1] - reg.packs[0] + 1)) : R() < G.campPacks3 ? 3 : 2, a0 = R() * Math.PI * 2;
        let elites = 0; const eliteMax = reg.eliteMax ?? 99;
        const placed: [number, number][] = [];
        const spot = (x0: number, y0: number): [number, number] => { // не ближе 24 px к любому мобу лагеря (спираль наружу)
          for (let t = 0; t < 40; t++) { const a = t * 2.4, rr = t ? 10 + t * 5 : 0; const qx = this.clamp(x0 + Math.cos(a) * rr), qy = this.clamp(y0 + Math.sin(a) * rr);
            if (placed.every((o) => Math.hypot(o[0] - qx, o[1] - qy) >= 24)) { placed.push([qx, qy]); return [qx, qy]; } }
          const q: [number, number] = [this.clamp(x0), this.clamp(y0)]; placed.push(q); return q; };
        const camp = { id: ++this.campSeq, region: reg.id, x, y, types: [] as string[], packs: nPacks, chiefs: 0 };
        this.camps.push(camp); made++;
        const k = gk(x, y); const gb = grid.get(k); if (gb) gb.push(camp); else grid.set(k, [camp]);
        for (let pk = 0; pk < nPacks; pk++) {
          let n = row.pack[0] + Math.floor(R() * (row.pack[1] - row.pack[0] + 1));
          const roll = R(); if (roll < 0.18) n = Math.min(6, n + 1); else if (roll < 0.3) n = Math.max(2, n - 1);
          if (reg.pack) n = reg.pack[0] + Math.floor(R() * (reg.pack[1] - reg.pack[0] + 1)); // админка: мобов в пачке
          const eliteThis = R() < reg.elite && elites < eliteMax; if (eliteThis) elites++; // шанс элиты — на пачку, не больше eliteMax в лагере
          const prow = pk > 0 && R() < 0.35 ? reg.table[Math.floor(R() * reg.table.length)] : row; // соседняя пачка бывает другого вида
          const types: string[] = [];
          for (let i = 0; i < n; i++) types.push(i === n - 1 && n >= 3 && alt.length ? alt[Math.floor(R() * alt.length)].type : prow.type);
          const a = a0 + (pk / nPacks) * Math.PI * 2 + (R() - 0.5) * 0.6, rr = G.campRing * (0.8 + R() * 0.4);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          for (const [i, p] of this.formation(n, R).entries()) {
            const [qx, qy] = spot(px + p[0] * 0.7, py + p[1] * 0.7);
            const m = this.addMob(types[i], qx, qy, { fixed: true, respawn: G.campRespawn, region: reg.id, elite: reg.eliteMax == null ? R() < reg.elite : eliteThis && i === 0 }); // без правки — как раньше (шанс на моба); с лимитом из админки — шанс на пачку, ≤ eliteMax в лагере
            m.rk = 1; m.camp = camp.id; camp.types.push(types[i]);
          }
        }
        // вожак: самый сильный вид региона, элита, ×chiefHp ОЗ, ×chiefDmg урон; в части лагерей — двое
        const strong = [...reg.table].sort((p, q) => (ZONE_MOBS[q.type]?.lvl || 0) - (ZONE_MOBS[p.type]?.lvl || 0) || (ZONE_MOBS[q.type]?.hp || 0) - (ZONE_MOBS[p.type]?.hp || 0))[0].type;
        const nChief = R() < G.campTwoChiefs ? 2 : 1;
        for (let c = 0; c < nChief; c++) {
          const [qx, qy] = spot(x + (nChief > 1 ? (c ? 26 : -26) : 0), y);
          const m = this.addMob(strong, qx, qy, { fixed: true, respawn: G.campRespawn * 2, region: reg.id, elite: true });
          m.chief = true; m.rk = 2; m.camp = camp.id; m.maxHp = m.hp = this.hpOf(m, 1); camp.types.push(strong); camp.chiefs++;
        }
      }
    }
  }
  campSeq = 0; regBuilt: Record<string, string> = {};
  /** Админка поменяла плотность локации: убрать её лагеря (мобы снимаются обычным путём «мёртв без респавна» — без дублей,
   *  мешки добычи живут отдельно и не теряются) и построить заново по новым правилам. Мобы в бою с игроком — тоже убираются. */
  regenRegion(id: string) {
    const reg = this.gen.regions.find((r) => r.id === id); if (!reg || !this.gen.camps) return 0;
    const old = new Set(this.camps.filter((c) => c.region === id).map((c) => c.id));
    let removed = 0;
    for (const m of this.mobs) if (m.camp && old.has(m.camp)) { m.dead = true; m.respawnAt = -1; m.camp = 0; removed++; }
    this.camps = this.camps.filter((c) => !old.has(c.id));
    const CELL = 1000, grid = new Map<number, any[]>(), gk = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
    for (const c of this.camps) { const k = gk(c.x, c.y); const g = grid.get(k); if (g) g.push(c); else grid.set(k, [c]); }
    const tooClose = (x: number, y: number, d: number) => { const r = Math.ceil(d / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const c of grid.get((cx + i) * 4096 + cy + j) || []) if (Math.hypot(c.x - x, c.y - y) < d) return true; return false; };
    const R = rng(this.seed ^ 0xc0ffee ^ (Date.now() & 0xffff));
    this.buildRegionCamps(reg, R, valueNoise(this.seed ^ 0x51ed, 3200), valueNoise(this.seed ^ 0x9a1, 900), grid, gk, tooClose);
    this.campCache.at = 0;
    return removed;
  }
  /** смещения членов пачки: неровные формы, минимум 24 px между мобами */
  formation(n: number, R: () => number): [number, number][] {
    const shape = R(), ang = R() * Math.PI * 2, spread = 34 + R() * 70, out: [number, number][] = [];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < n; i++) {
      let best: [number, number] = [0, 0];
      for (let t = 0; t < 12; t++) {
        let u: number, v: number;
        if (shape < 0.45) { const r = spread * Math.sqrt(R()) * (0.6 + R() * 0.6), a = R() * 6.283; u = Math.cos(a) * r; v = Math.sin(a) * r * (0.5 + R() * 0.7); } // клякса
        else if (shape < 0.7) { u = (i - (n - 1) / 2) * (30 + R() * 22) + (R() - 0.5) * 18; v = (R() - 0.5) * 30 + Math.sin(i * 1.3) * 14; } // цепочка
        else if (shape < 0.9) { const side = i % 2 ? 1 : -1; u = side * spread * (0.7 + R() * 0.5) + (R() - 0.5) * 30; v = (R() - 0.5) * 40; } // две кучки
        else { const a = -1.2 + (n > 1 ? (i / (n - 1)) * 2.4 : 0) + (R() - 0.5) * 0.4, r = spread * (0.8 + R() * 0.4); u = Math.cos(a) * r - spread * 0.5; v = Math.sin(a) * r; } // полумесяц
        const x = u * ca - v * sa, y = u * sa + v * ca;
        best = [Math.round(x), Math.round(y)];
        if (out.every((o) => Math.hypot(o[0] - x, o[1] - y) >= 24)) break;
        if (t === 11) { const a = R() * 6.283; for (let r = 30; r < 200; r += 12) { const bx = Math.round(Math.cos(a) * r), by = Math.round(Math.sin(a) * r); if (out.every((o) => Math.hypot(o[0] - bx, o[1] - by) >= 24)) { best = [bx, by]; break; } } }
      }
      out.push(best);
    }
    return out;
  }
  /** кочевники: roamPct от мобов региона, 1–2 в группе; маршрут — петля по 3–4 соседним лагерям (часто — враждебной фракции) */
  buildRoamers(R: () => number) {
    const G = ZONE_GEN;
    const byReg = new Map<string, typeof this.camps>();
    for (const c of this.camps) { const l = byReg.get(c.region); if (l) l.push(c); else byReg.set(c.region, [c]); }
    for (const reg of this.gen.regions) {
      const own = byReg.get(reg.id); if (!own || !reg.table.length) continue;
      const mobsIn = own.reduce((a, c) => a + c.types.length, 0);
      let quota = Math.floor(mobsIn * G.roamPct + R());
      for (let g = 0; quota > 0 && g < 200; g++) {
        const start = own[Math.floor(R() * own.length)];
        const row = reg.table[Math.floor(R() * reg.table.length)];
        if (ZONE_MOBS[row.type]?.role === "tank") continue;
        const cand = this.camps.filter((c) => c !== start && Math.hypot(c.x - start.x, c.y - start.y) < G.roamRange);
        if (cand.length < 2) continue;
        const foe = cand.filter((c) => hostile(row.type, c.types[0])), pick: typeof cand = [];
        for (let k = 0, n = 2 + Math.floor(R() * 2); k < n; k++) { const pool = foe.length && R() < 0.5 ? foe : cand; const c = pool[Math.floor(R() * pool.length)]; if (!pick.includes(c)) pick.push(c); }
        // точка у лагеря, не в центре (кочевник проходит мимо — агрится/агрит, если враждебны)
        const pts: [number, number][] = [[start.x, start.y], ...pick].map((c: any) => { const a = R() * 6.283, r = 140 + R() * 120; return [this.clamp(Math.round((c.x ?? c[0]) + Math.cos(a) * r)), this.clamp(Math.round((c.y ?? c[1]) + Math.sin(a) * r))] as [number, number]; })
          .filter((p) => !inSafe(p[0], p[1], 120, this.world));
        if (pts.length < 2) continue;
        const k = Math.min(quota, R() < 0.55 ? 1 : 2);
        for (let i = 0; i < k; i++) {
          const m = this.addMob(row.type, pts[0][0] + i * 28, pts[0][1] + i * 18, { fixed: true, respawn: G.campRespawn * 1.5, region: reg.id, elite: R() < reg.elite });
          m.roam = { pts, i: 1, home: [m.x, m.y], waitUntil: 0 }; m.rk = 1.5;
          this.stats.roamers++;
        }
        quota -= k;
      }
    }
  }
  // ---------- бой моб↔моб ----------
  /** ближайший враждебный живой моб в радиусе r (не сбрасывающийся) */
  findFoe(m: ZMob, r: number): ZMob | null {
    let best: ZMob | null = null, bd = r;
    for (const o of this.near(m.x, m.y, r)) {
      if (o === m || o.reset || o.special || !hostile(m.type, o.type)) continue;
      if (!m.roam && !o.roam) continue; // лагеря не воюют друг с другом — только с проходящими кочевниками
      const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /** удар моба по мобу (броня цели учитывается); вклад копится в dmgBy под ключом "mob:<id>" — игрок без ≥15% вклада награды не получит */
  mobHit(src: ZMob, t: ZMob, dmg: number, onKill: (m: ZMob) => void) {
    if (t.dead || t.reset) return 0;
    const d = ZONE_MOBS[t.type];
    const armor = d.armor * (t.elite ? ZONE_GEN.eliteArmor : 1) * (t.cursed ? 1.3 : 1);
    const real = Math.max(1, Math.round(dmg * (1 - Math.min(0.65, armor / (armor + 60))) * (t.shieldUntil > this.now ? 0.5 : 1)));
    t.hp -= real; t.dmgBy.set("mob:" + src.id, (t.dmgBy.get("mob:" + src.id) || 0) + real);
    if (!t.targetSid && !t.mobTarget) { t.mobTarget = src.id; this.rally(t, src.id); }
    this.events.push({ k: "hit", id: t.id, d: real, mob: 1 });
    this.stats.mobHits++;
    if (t.hp <= 0) { this.stats.mobKills++; (t as any).killer = "mob:" + src.id; this.kill(t, onKill); }
    return real;
  }
  /** пачка лагеря поднимается на защиту (против моба) */
  /** Лагеря для мини-карты/трекера: [id, x, y, живых, всего, состояние 0 спит/1 бой/2 пуст, радиус агро, типы]. Кэш ~1 с. */
  private campCache: { at: number; list: any[] } = { at: 0, list: [] };
  campSummary(now = Date.now()) {
    if (now - this.campCache.at < 1000) return this.campCache.list;
    const by = new Map<number, ZMob[]>();
    for (const m of this.mobs) if (m.camp) { const l = by.get(m.camp); if (l) l.push(m); else by.set(m.camp, [m]); }
    this.campCache = { at: now, list: this.camps.map((c) => {
      const ms = by.get(c.id) || [], alive = ms.filter((m) => !m.dead);
      const fight = alive.some((m) => m.targetSid || m.mobTarget);
      const aggro = Math.max(0, ...[...new Set(c.types)].map((t) => ZONE_MOBS[t]?.aggro || 0));
      const spread = Math.max(0, ...ms.map((m) => Math.hypot(m.sx - c.x, m.sy - c.y)));
      return [c.id, Math.round(c.x), Math.round(c.y), alive.length, ms.length, fight ? 1 : alive.length ? 0 : 2, Math.round(spread + aggro), [...new Set(c.types)]];
    }) };
    return this.campCache.list;
  }
  rally(m: ZMob, foe: number) { if (m.camp) for (const o of this.near(m.x, m.y, 360)) if (o.camp === m.camp && !o.targetSid && !o.mobTarget && !o.reset) o.mobTarget = foe; }
  /** такт драки с мобом: true — моб занят боем */
  mobFight(m: ZMob, d: any, dt: number, onKill: (m: ZMob) => void, mul: number): boolean {
    const t = m.mobTarget ? this.byId.get(m.mobTarget) : null;
    if (!t || t.dead || t.reset || Math.hypot(t.x - m.x, t.y - m.y) > d.aggro * 2.2) { m.mobTarget = 0; return false; }
    const dx = t.x - m.x, dy = t.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    const td = ZONE_MOBS[t.type];
    const ranged = d.role === "ranged" || d.role === "caster", want = ranged ? 160 : d.radius + td.radius + 6;
    if (dist > want) { const sp = d.speed * (m.slowUntil > this.now ? 0.55 : 1) * dt; m.x += ux * sp; m.y += uy * sp; }
    if (dist <= want + 12 && m.atkCd <= 0) {
      if (ranged) this.events.push({ k: "mshot", id: m.id, x: Math.round(m.x), y: Math.round(m.y), tx: Math.round(t.x), ty: Math.round(t.y) });
      this.mobHit(m, t, d.dmg * mul * (d.role === "tank" ? 1.25 : 1), onKill);
      m.atkCd = ranged ? 2.2 : d.role === "swarm" ? 0.9 : 1.2;
    }
    return true;
  }
  /** множитель ХП моба по его флагам */
  hpOf(m: ZMob, scale = 1) {
    const d = ZONE_MOBS[m.type];
    return Math.round(d.hp * (m.chief ? ZONE_GEN.chiefHp : 1) * (m.elite ? ZONE_GEN.eliteHp : 1) * (m.cursed ? ZONE_GEN.cursedHp : 1) * (d.boss ? 1 + ZONE_GEN.bossScalePerPlayer * (scale - 1) : 1));
  }
  /** Правка навыков моба в админке — сразу у живых мобов этого вида (без ожидания респавна). Возвращает число обновлённых. */
  syncMobSkills(): number {
    let n = 0;
    for (const m of this.mobs) { if (m.dead) continue;
      const own = (ZONE_MOBS[m.type] as any)?.skills as string[] | undefined, sig = JSON.stringify(own || null);
      if ((m as any).skSig === undefined || (m as any).skSig === sig) continue;
      const d: any = ZONE_MOBS[m.type], extra = m.cursed ? m.skills.filter((k) => !JSON.parse((m as any).skSig || "[]")?.includes?.(k)) : [];
      m.skills = m.cursed ? [...new Set([...(own || []), ...extra])].slice(0, 5) : own ? [...own] : d.boss ? skillsFor(m.type, 1) : [];
      for (const k of m.skills) if (m.skCd[k] == null) m.skCd[k] = 1.5;
      (m as any).skSig = sig; n++;
    }
    return n;
  }
  rollCursed(m: ZMob) {
    const d = ZONE_MOBS[m.type];
    m.cursed = this.rand() * 100 < ZONE_GEN.cursedPct;
    const own = (d as any).skills as string[] | undefined; // навыки из админ-панели
    m.skills = m.cursed ? [...new Set([...(own || []), ...skillsFor(m.type, 2 + Math.floor(this.rand() * 4), m.id)])].slice(0, 5) : own ? [...own] : d.boss ? skillsFor(m.type, 1) : [];
    m.skCd = Object.fromEntries(m.skills.map((k, i) => [k, 2 + i * 1.5]));
    (m as any).skSig = JSON.stringify(own || null);
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
      const cx = Math.floor(p.x / SLEEP_CELL), cy = Math.floor(p.y / SLEEP_CELL);
      for (let i = -S; i <= S; i++) for (let j = -S; j <= S; j++) this.awake.add((cx + i) * 4096 + cy + j);
    }
  }

  get bossId(): number { return Object.values(this.bossIds)[0] || 0; } // совместимость (тесты/отладка)
  isSpecial(m: ZMob) { return m.special !== ""; }
  clamp(v: number) { return Math.max(20, Math.min(this.size - 20, v)); }

  addMob(type: string, x: number, y: number, o: { fixed?: boolean; respawn?: number; region?: string | null; elite?: boolean; hpMul?: number; special?: "" | "boss" | "rare" } = {}) {
    const d = ZONE_MOBS[type];
    const hp = Math.round(d.hp * (o.elite ? ZONE_GEN.eliteHp : 1) * (o.hpMul || 1));
    const m: ZMob = { mobTarget: 0, scanAt: 0, roam: null, cursed: false, skills: [], skCd: {}, reset: false, burstUntil: 0, camp: 0, leapCd: 0, shieldUntil: 0, id: this.nextId++, type, respawn: o.respawn || 0, sx: x, sy: y, x, y, hp, maxHp: hp, dead: false, respawnAt: 0, targetSid: null,
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


  // ---------- бродячие мобы у игрока (Аринар): добавка к лагерям, чтобы между ними не было пусто ----------
  ambNext = new Map<string, number>();
  ambStats = { checks: 0, singles: 0, groups: 0, despawned: 0 };
  regionAt(x: number, y: number): Region | null {
    let best: Region | null = null;
    for (const r of this.gen.regions) if (r.table.length && x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]) { if (!best || (r.rect[2] - r.rect[0]) < (best.rect[2] - best.rect[0])) best = r; }
    return best;
  }
  ambient(now: number, players: Map<string, ZPlayer>) {
    const G = ZONE_GEN;
    // уход: хозяин вышел/далеко, или без боя дольше ambientLife — исчезает (не копится, не фармится «вагонами»)
    const own = new Map<string, number>();
    for (const m of this.mobs) {
      if (!m.ambient || m.dead) continue;
      const p = players.get(m.ambient);
      const far = !p || Math.hypot(p.x - m.x, p.y - m.y) > G.ambientDespawnDist;
      const idle = !m.targetSid && now - (m.bornAt || now) > G.ambientLife * 1000;
      if ((far && !m.targetSid) || idle || (far && now - (m.bornAt || now) > G.ambientLife * 3000)) { m.dead = true; m.respawnAt = -1; this.ambStats.despawned++; continue; }
      own.set(m.ambient, (own.get(m.ambient) || 0) + 1);
    }
    if (!G.ambientOn) return;
    for (const p of players.values()) {
      if (!p.alive) continue;
      const due = this.ambNext.get(p.sid);
      if (due === undefined) { this.ambNext.set(p.sid, now + G.ambientEvery * 1000); continue; }
      if (now < due) continue;
      this.ambNext.set(p.sid, now + Math.max(2, G.ambientEvery) * 1000);
      this.ambStats.checks++;
      if ((own.get(p.sid) || 0) >= G.ambientCap || inSafe(p.x, p.y, 200, this.world)) continue;
      if (this.near(p.x, p.y, G.ambientNear).some((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < G.ambientNear)) continue;
      const roll = this.rand() * 100;
      const group = roll < G.ambientGroupChance, single = !group && roll < G.ambientGroupChance + G.ambientChance;
      if (!group && !single) continue;
      const reg = this.regionAt(p.x, p.y); if (!reg) continue;
      const rows = reg.table.filter((r) => { const d = ZONE_MOBS[r.type]; return d && !d.boss && d.size !== "boss" && d.size !== "huge"; });
      if (!rows.length) continue;
      let tw = rows.reduce((a, b) => a + b.w, 0) * this.rand(), row = rows[0];
      for (const r of rows) { tw -= r.w; if (tw <= 0) { row = r; break; } }
      let pos: [number, number] | null = null;
      for (let t = 0; t < 10 && !pos; t++) {
        const a = this.rand() * Math.PI * 2, x = this.clamp(p.x + Math.cos(a) * G.ambientEdge), y = this.clamp(p.y + Math.sin(a) * G.ambientEdge);
        if (!inSafe(x, y, 60, this.world) && Math.hypot(x - p.x, y - p.y) > G.ambientEdge * 0.7) pos = [x, y];
      }
      if (!pos) continue;
      const n = group ? Math.min(G.ambientCap - (own.get(p.sid) || 0), Math.max(1, Math.round(G.ambientGroup)) + 1) : 1;
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2, rr = i ? 22 + this.rand() * 30 : 0;
        const elite = group && i === 0;
        const m = this.addMob(row.type, this.clamp(pos[0] + Math.cos(a) * rr), this.clamp(pos[1] + Math.sin(a) * rr), { region: null, elite });
        m.ambient = p.sid; m.bornAt = now; m.huntUntil = now + G.ambientHunt * 1000; m.targetSid = p.sid; m.burstUntil = now + 1200;
        this.stats.spawned++;
      }
      own.set(p.sid, (own.get(p.sid) || 0) + n);
      if (group) this.ambStats.groups++; else this.ambStats.singles++;
    }
    for (const sid of this.ambNext.keys()) if (!players.has(sid)) this.ambNext.delete(sid);
  }

  /** состояние логов мировых боссов для карты: [ключ, жив, секунд до появления, тип] */
  bossStatus(now: number): [string, number, number, string][] {
    return this.gen.bosses.map((b) => { const bk = b.key || b.type, id = this.bossIds[bk], m = id ? this.byId.get(id) : null;
      const alive = !!(m && !m.dead), at = this.bossAt[bk];
      const left = alive ? 0 : at && at < Number.MAX_SAFE_INTEGER ? Math.ceil((at - now) / 1000) : (BOSS_TIMERS[b.type]?.firstAfter ?? b.firstAfter) + ((b as any).stagger || 0);
      return [bk, alive ? 1 : 0, Math.max(0, left), b.type]; });
  }

  // ---------- мировые боссы и редкие Отголоски ----------
  specials(now: number, players: Map<string, ZPlayer>) {
    const G = this.gen;
    const scale = Math.max(1, Math.min(4, players.size));
    for (const b of G.bosses) {
      const bk = b.key || b.type; // несколько боссов одного типа в разных пятнах — свои таймеры
      if (!this.bossAt[bk]) this.bossAt[bk] = now + (BOSS_TIMERS[b.type] ? BOSS_TIMERS[b.type].firstAfter + ((b as any).stagger || 0) : b.firstAfter) * 1000; // таймер — из админки
      const breg = this.gen.regions.find((r) => b.x >= r.rect[0] && b.x < r.rect[2] && b.y >= r.rect[1] && b.y < r.rect[3]);
      if (breg?.bossOn === false) { const id = this.bossIds[bk], bm = id && this.byId.get(id); if (bm && !bm.dead && !bm.targetSid) { bm.dead = true; bm.respawnAt = -1; } continue; } // админка: босс в локации выключен
      if (this.bossIds[bk] || now < this.bossAt[bk]) continue;
      const m = this.addMob(b.type, b.x, b.y, { region: null, hpMul: 1 + ZONE_GEN.bossScalePerPlayer * (scale - 1), special: "boss" });
      (m as any).bossKey = bk; this.bossIds[bk] = m.id; this.bossAt[bk] = Number.MAX_SAFE_INTEGER;
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
      const cand = G.regions.filter((x) => x.id === r.region || (x as any).kind === r.region); // пятна одного биома
      const reg = cand.length ? cand[Math.floor(this.rand() * cand.length)] : null;
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
      // стаки: один и тот же статус от разных попаданий/источников складывается (каждый стак — свой урон/с и срок),
      // до DOT_STACK_MAX на вид (самый старый уходит); разные статусы (поджог + кровотечение + яд) действуют одновременно
      const L = (m.dots = (m.dots || []).filter((x) => x.until > now));
      const same = L.filter((x) => x.kind === st.kind);
      if (same.length >= DOT_STACK_MAX) L.splice(L.indexOf(same.reduce((a, b) => (a.until < b.until ? a : b))), 1);
      L.push({ kind: st.kind, dps: st.dps, until: now + st.dur * 1000, sid });
      m.dot = L[L.length - 1];
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
    if (c.kind === "circle") this.events.push({ k: "tele_circle", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, t, fx: c.fx, fdx: c.fx === "meteor" ? (c.x < m.x ? -1 : 1) : undefined });
    else if (c.kind === "line") this.events.push({ k: "tele_line", id: m.id, x: Math.round(c.x), y: Math.round(c.y), dx: +c.dx!.toFixed(3), dy: +c.dy!.toFixed(3), len: c.len, w: c.w, t });
    else if (c.kind === "ring") this.events.push({ k: "tele_ring", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r0: c.r0, r: c.r, t, fx: c.fx });
    else this.events.push({ k: "tele_circle", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, t, nova: 1, fx: c.fx });
  }
  resolveCasts(m: ZMob, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string) => void) {
    for (let i = m.casts.length - 1; i >= 0; i--) {
      const c = m.casts[i];
      if (now < c.at) continue;
      m.casts.splice(i, 1);
      if (c.leap) { m.x = this.clamp(c.x); m.y = this.clamp(c.y); }
      if (c.kind === "line" && c.proj) { // настоящий снаряд моба: летит от моба, от него можно отойти
        this.fire({ o: "m", mob: m.id, t: c.proj, x: m.x, y: m.y, dx: c.dx!, dy: c.dy!, range: c.len!, w: c.w!, max: 1, spd: c.proj === "fireball" ? 480 : PROJ_SPEED.mob,
          onHit: (pl: ZPlayer) => onHit(pl.sid, c.dmg, m.type) });
        continue;
      }
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dist = Math.hypot(p.x - c.x, p.y - c.y);
        const hit = c.kind === "circle" || c.kind === "nova" ? dist < c.r! + 8
          : c.kind === "ring" ? dist > c.r0! - 8 && dist < c.r! + 8
          : segDist(p.x, p.y, c.x, c.y, c.dx!, c.dy!, c.len!) < c.w! / 2 + 10;
        if (hit) onHit(p.sid, c.dmg, m.type);
      }
      if (c.kind === "line") this.events.push({ k: "mshot", id: m.id, x: Math.round(c.x), y: Math.round(c.y), tx: Math.round(c.x + c.dx! * c.len!), ty: Math.round(c.y + c.dy! * c.len!) });
      else this.events.push({ k: "slam", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, r0: c.r0, fx: c.fx }); // fx — спрайт атласа снарядов (метеор, копья, осколки…)
    }
  }

  // атаки крупных и боссов: по кругу набора, набор зависит от фазы
  bossPattern(m: ZMob, d: any, best: ZPlayer, players: Map<string, ZPlayer>, now: number) {
    const big = d.size === "huge" ? 1.35 : d.size === "boss" ? 1.15 : 1;
    const dmg = d.dmg * (m.elite ? ZONE_GEN.eliteDmg : 1) * (m.chief ? ZONE_GEN.chiefDmg : 1);
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
        this.cast(m, { kind: "circle", at: now + tele + i * 180, x: t.x + (targets[i] ? 0 : Math.cos(a) * 90), y: t.y + (targets[i] ? 0 : Math.sin(a) * 90), r: Math.round(70 * big), fx: "meteor", dmg: dmg * 1.4 });
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
    if (this.projs.length) this.updateProjs(dt, players);
    const scale = Math.max(1, Math.min(4, players.size)); // ХП босса растёт с числом игроков (ограниченно)
    if (this.proc) {
      // убитые/исчезнувшие процедурные мобы удаляются (их место займёт режиссёр)
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (m.dead && !m.fixed) {
          if (m.special === "boss") {
            const bk = (m as any).bossKey || m.type;
            const b = this.gen.bosses.find((x) => (x.key || x.type) === bk);
            delete this.bossIds[bk]; this.bossAt[bk] = now + ((b && BOSS_TIMERS[b.type]?.every) || b?.every || 600) * 1000; // таймер — из админки
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
        if (this.gen.camps) { if ([...players.values()].some((p) => p.alive)) this.specials(now, players); this.ambient(now, players); } // лагеря вместо режиссёра + бродячие
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
      if (sleepy && !this.awake.has(sk(m.x, m.y))) {
        asleep++;
        if (!m.dead && (m.targetSid || m.mobTarget || m.reset || m.hp < m.maxHp)) { m.x = m.sx; m.y = m.sy; m.hp = m.maxHp; m.targetSid = null; m.mobTarget = 0; m.reset = false; m.casts = []; m.dot = null; m.dots = []; m.windup = 0; m.dashT = 0; }
        continue;
      }
      awake++;
      if (!m.dead && m.dots?.length) {
        m.dots = m.dots.filter((x) => x.until > now);
        if (!m.dots.length) m.dot = null;
        else {
          let killer = "";
          for (const x of m.dots) { // каждый стак тикает сам: урон идёт своему источнику (счётчик DPS, вклад в награду)
            const dmg = x.dps * dt;
            m.hp -= dmg; killer = x.sid;
            m.dmgBy.set(x.sid, (m.dmgBy.get(x.sid) || 0) + dmg);
            const acc = ((m as any).dotAcc ||= {}); acc[x.sid] = (acc[x.sid] || 0) + dmg; // урон по времени — событием раз в ~1 с
            if (acc[x.sid] >= Math.max(1, x.dps)) { this.events.push({ k: "hit", id: m.id, d: Math.round(acc[x.sid]), by: x.sid, dot: 1 }); acc[x.sid] = 0; }
          }
          if (m.hp <= 0) { (m as any).killer = killer; this.kill(m, onKill); continue; }
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
          if (m.roam) { m.sx = m.roam.home[0]; m.sy = m.roam.home[1]; m.roam.i = 1; }
          m.dead = false; m.x = m.sx; m.y = m.sy; m.reset = false; m.mobTarget = 0;
          if (m.camp && !m.chief) { m.elite = this.rand() < (this.gen.regions.find((r) => r.id === m.region)?.elite || 0); }
          this.rollCursed(m); m.maxHp = this.hpOf(m, scale); m.hp = m.maxHp;
          m.dmgBy.clear(); m.usedAbility.clear(); m.targetSid = null; m.phase = 1; m.enraged = false; m.casts = [];
        }
        continue;
      }
      if (m.casts.length) this.resolveCasts(m, now, players, onHit);
      // цель
      // поводок MMO: утащили далеко от дома → «сброс»: домой бегом, быстро лечится до полного, игнорирует игроков
      const homeD = Math.hypot(m.x - m.sx, m.y - m.sy);
      if (!m.reset && (m.targetSid || m.mobTarget) && homeD > (m.special || d.boss ? ZONE_GEN.leashBoss : ZONE_GEN.leash)) {
        m.reset = true; m.targetSid = null; m.mobTarget = 0; m.casts = []; m.windup = 0; m.dashT = 0; m.dot = null; m.dots = []; m.burstUntil = 0; this.stats.resets++;
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
      if (m.targetSid) { const t = players.get(m.targetSid); if (t && t.alive) { const dd = Math.hypot(t.x - m.x, t.y - m.y); if (dd < aggro * (m.special ? 2.6 : 1.8) || (m.huntUntil && now < m.huntUntil && dd < ZONE_GEN.ambientDespawnDist)) { best = t; bd = dd; } } }
      if (!best) for (const p of (pgrid ? this.playersNear(pgrid, m.x, m.y) : players.values())) { if (!p.alive) continue; const dd = Math.hypot(p.x - m.x, p.y - m.y); if (dd < bd) { bd = dd; best = p; } }
      const fresh = !m.targetSid && best;
      m.targetSid = best ? best.sid : null;
      if (best) m.mobTarget = 0; // игроки важнее драки с мобом
      if (fresh) {
        m.burstUntil = now + 1200; // рывок агрессии: первые 1.2 с — быстрее (от пачки не уйти шагом)
        if (m.camp) for (const o of this.near(m.x, m.y, 360)) if (o.camp === m.camp && !o.targetSid && !o.reset) { o.targetSid = m.targetSid; o.burstUntil = now + 1200; } // пачка агрится вместе
      }
      m.atkCd = Math.max(0, m.atkCd - dt);
      m.leapCd = Math.max(0, m.leapCd - dt);
      for (const k of m.skills) m.skCd[k] = Math.max(0, (m.skCd[k] || 0) - dt);
      const eliteDmg = (m.elite ? ZONE_GEN.eliteDmg : 1) * (m.chief ? ZONE_GEN.chiefDmg : 1) * (m.cursed ? ZONE_GEN.cursedDmg : 1);
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
      if ((m as any).frozenUntil > now) continue; // заморожен: ни шага, ни удара, ни навыка
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
            this.cast(m, { kind: "line", at: now + 700, x: m.x, y: m.y, dx: ux, dy: uy, len: 290, w: 20, dmg: d.dmg * 1.2 * eliteDmg, proj: MOB_SHOT[factionOf(m.type)] || "thorn_bow" });
            m.atkCd = 2.2; m.windup = 0.45;
            continue;
          }
        } else if (d.role === "caster") {
          want = 190;
          if (dist < 300 && m.atkCd <= 0) {
            this.cast(m, { kind: "circle", at: now + 1000, x: best.x, y: best.y, r: 60, dmg: d.dmg * 1.4 * eliteDmg, fx: "glyph_mine" });
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
        // бой моб↔моб: кочевник ↔ враждебный лагерь (осмотр раз в 0.4 с; только в бодрствующих чанках — сюда спящие не доходят)
        if (!m.mobTarget && now >= m.scanAt) { m.scanAt = now + 400; const f = this.findFoe(m, d.aggro); if (f) { m.mobTarget = f.id; this.rally(m, f.id); } }
        if (m.mobTarget && this.mobFight(m, d, dt, onKill, eliteDmg)) { m.x = this.clamp(m.x); m.y = this.clamp(m.y); continue; }
        if (m.roam) { // кочевник: идёт по петле маршрута; «дом» для поводка — где он сейчас
          const [tx, ty] = m.roam.pts[m.roam.i], dx = tx - m.x, dy = ty - m.y, dist = Math.hypot(dx, dy);
          if (now >= m.roam.waitUntil) {
            if (dist < 20) { m.roam.i = (m.roam.i + 1) % m.roam.pts.length; m.roam.waitUntil = now + 1500 + Math.random() * 4000; }
            else { const sp = d.speed * 0.55 * dt; m.x += (dx / dist) * sp; m.y += (dy / dist) * sp; }
          }
          m.sx = m.x; m.sy = m.y;
          if (!m.dots?.length) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt);
          if (m.hp >= m.maxHp) m.dmgBy.clear();
          m.x = this.clamp(m.x); m.y = this.clamp(m.y);
          continue;
        }
        // возврат/брожение у точки спавна; регенерация вне боя
        if (now >= m.nextWander) { m.nextWander = now + 2500 + Math.random() * 3000; m.wanderX = m.sx + (Math.random() - 0.5) * 120; m.wanderY = m.sy + (Math.random() - 0.5) * 120; if (!m.fixed && inSafe(m.wanderX, m.wanderY, 0, this.world)) { m.wanderX = m.sx; m.wanderY = m.sy; } }
        const dx = m.wanderX - m.x, dy = m.wanderY - m.y, dist = Math.hypot(dx, dy);
        if (dist > 4) { m.x += (dx / dist) * d.speed * 0.4 * dt; m.y += (dy / dist) * d.speed * 0.4 * dt; }
        if (!m.dots?.length) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt); // горящий/отравленный не лечится
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
    if (k === "frost_nova") { this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(170 * big), dmg: dmg * 1.4, fx: "ice_fan" }); for (const p of players.values()) void p; }
    else if (k === "meteor") { const ts = [...players.values()].filter((q) => q.alive && Math.hypot(q.x - m.x, q.y - m.y) < 450).slice(0, 3); ts.forEach((q, i) => this.cast(m, { kind: "circle", at: now + tele * 1.3 + i * 200, x: q.x, y: q.y, r: Math.round(90 * big), dmg: dmg * 1.8, fx: "meteor" })); }
    else if (k === "spear_rain") { for (let i = 0; i < 5; i++) { const a = this.rand() * 6.283, r = 40 + this.rand() * 110; this.cast(m, { kind: "circle", at: now + tele + i * 120, x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, r: Math.round(50 * big), dmg: dmg * 1.2, fx: "spear_rain" }); } }
    else if (k === "whirlwind") this.cast(m, { kind: "ring", at: now + tele, x: m.x, y: m.y, r0: Math.round(30 * big), r: Math.round(210 * big), dmg: dmg * 1.5, fx: "war_axe" });
    else if (k === "fly_blade_dash") { m.windup = 0.6; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 220, t: 0.6 }); }
    else if (k === "shadow_step") { m.x = this.clamp(t.x - ux * 60); m.y = this.clamp(t.y - uy * 60); this.cast(m, { kind: "circle", at: now + 600, x: t.x, y: t.y, r: Math.round(70 * big), dmg: dmg * 1.5, fx: "auto_daggers" }); }
    else if (k === "fireball") this.cast(m, { kind: "line", at: now + 550, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(420 * Math.max(0.8, big)), w: Math.round(40 * big), dmg: dmg * 1.6, proj: "fireball" });
    else if (!MOB_NATIVE.has(k)) this.heroCast(m, d, k, t, players, now, dmg, big, tele, ux, uy);
    else if (k === "smoke_bomb") { this.cast(m, { kind: "circle", at: now + 700, x: m.x, y: m.y, r: Math.round(120 * big), dmg: dmg * 0.9, fx: "plague_puddle" }); for (const p of players.values()) if (Math.hypot(p.x - m.x, p.y - m.y) < 140 * big) void p; }
    m.atkCd = Math.max(m.atkCd, 1.2);
  }

  /** Навык героя в руках моба: та же форма (abilityShapes.shapeOf), но по игрокам и с телеграфом (от удара можно уйти).
   *  Урон — урон моба × сила навыка (не больше ×1.8). */
  heroCast(m: ZMob, d: any, id: string, t: ZPlayer, players: Map<string, ZPlayer>, now: number, dmg: number, big: number, tele: number, ux: number, uy: number) {
    const s: any = shapeOf(id), pw = Math.min(1.8, Math.max(0.8, (ABILITY_BY_ID as any)[id]?.power || 1)), D = dmg * pw, k = Math.max(0.8, big);
    switch (s.k) {
      case "line": this.cast(m, { kind: "line", at: now + tele, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(s.len * k), w: Math.round((s.w || 44) * k), dmg: D }); break;
      case "proj": this.cast(m, { kind: "line", at: now + 550, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(s.len * k), w: Math.round(40 * k), dmg: D, proj: id === "fireball" ? "fireball" : "fire_spark" }); break;
      case "dash": m.windup = 0.6; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: Math.round(s.len * k), t: 0.6 }); break;
      case "leap": this.cast(m, { kind: "circle", at: now + tele, x: t.x, y: t.y, r: Math.round(s.r * k), dmg: D, leap: true }); break;
      case "meteor": this.cast(m, { kind: "circle", at: now + tele + (s.delay || 600), x: t.x, y: t.y, r: Math.round(s.r * k), dmg: D * 1.2, fx: "meteor" }); break;
      case "rain": for (let i = 0; i < Math.min(8, s.n); i++) { const a = this.rand() * 6.283, r = this.rand() * s.area; this.cast(m, { kind: "circle", at: now + tele + i * 110, x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, r: Math.round(s.r * k), dmg: D * 0.6 }); } break;
      case "cone": for (const off of [-s.arc / 3, 0, s.arc / 3]) { const c = Math.cos(off), sn = Math.sin(off); this.cast(m, { kind: "line", at: now + tele, x: m.x, y: m.y, dx: ux * c - uy * sn, dy: ux * sn + uy * c, len: Math.round(s.len * k), w: 40, dmg: D * 0.7 }); } break;
      case "nova": this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(s.r * k * 1.2), dmg: D }); if (s.dr) m.shieldUntil = now + Math.min(4000, s.dr); break;
      case "ring": this.cast(m, { kind: "ring", at: now + tele, x: m.x, y: m.y, r0: Math.round(30 * k), r: Math.round(200 * k), dmg: D }); break;
      case "cloud": this.cast(m, { kind: "circle", at: now + 700, x: m.x, y: m.y, r: Math.round(s.r * k), dmg: D * 0.8, fx: "plague_puddle" }); m.shieldUntil = now + Math.min(2500, s.invuln || 1500); break;
      default: this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(150 * k), dmg: D });
    }
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
    this.events.push({ k: "hit", id: m.id, d: real, by: sid }); // by — для счётчика DPS у клиента
    if (m.hp <= 0) { (m as any).killer = sid; this.kill(m, onKill); } // добивший — для правила мешка (10%)
    else this.checkPhase(m, d);
    return real;
  }
  kill(m: ZMob, onKill: (m: ZMob) => void) {
    m.dead = true; m.hp = 0; m.windup = 0; m.dashT = 0; m.dot = null; m.dots = []; m.casts = [];
    m.respawnAt = Date.now() + (m.rk ? ZONE_GEN.campRespawn * m.rk : m.respawn) * 1000; // лагеря — живая правка админки
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
  takeEvents() { // снаряд: a — сколько мс он уже летит на сервере (события уходят пачкой 5 Гц; клиент догоняет позицию)
    const ev = this.events.splice(0, 80), now = Date.now();
    for (const e of ev) if (e.k === "proj" && e._b) { e.a = Math.max(0, Math.min(400, now - e._b)); delete e._b; }
    return ev;
  }
  state(px: number, py: number, ev: any[], aoi = 700) {
    const m: number[] = [];
    const now = Date.now();
    for (const x of (this.gen.camps ? this.near(px, py, aoi * 1.15) : this.mobs)) {
      if (x.dead) continue;
      const far = Math.abs(x.x - px) > aoi || Math.abs(x.y - py) > aoi;
      if (far && !(x.special && Math.abs(x.x - px) < aoi * 1.15 && Math.abs(x.y - py) < aoi * 1.15)) continue; // боссов видно дальше
      // статусы — битами (могут быть одновременно) + число стаков каждого (по 3 бита: поджог 13–15, яд 16–18, кровотечение 19–21)
      let st = 0;
      if (x.dots?.length) for (const dd of x.dots) if (dd.until > now) { const i = dd.kind === "burn" ? 0 : dd.kind === "poison" ? 1 : 2; st |= 8 << i; const sh = 13 + i * 3, c = (st >> sh) & 7; if (c < 7) st = (st & ~(7 << sh)) | ((c + 1) << sh); }
      m.push(x.id, MOB_INDEX[x.type], Math.round(x.x), Math.round(x.y), Math.round((x.hp / x.maxHp) * 100),
        (x.windup > 0 ? 1 : x.dashT > 0 ? 2 : 0) | (x.elite ? 4 : 0) | st | (x.slowUntil > now ? 64 : 0) | (x.enraged ? 128 : 0) | (x.special === "boss" ? 256 : x.special === "rare" ? 512 : 0) | (x.cursed ? 1024 : 0) | (x.reset ? 2048 : 0) | (x.chief ? 4096 : 0) | ((x as any).frozenUntil > now ? 1 << 22 : 0));
    }
    const nr = aoi * 2.2; // узлы — тоже по интересу (в Аринаре их сотни)
    const n = this.nodes.filter((x) => !this.gen.camps || (Math.abs(x.x - px) < nr && Math.abs(x.y - py) < nr)).map((x) => [x.id, now >= x.readyAt ? 1 : 0]);
    const near = ev.filter((e) => e.x === undefined || (Math.abs(e.x - px) <= aoi * 1.4 && Math.abs(e.y - py) <= aoi * 1.4));
    return { w: this.world, m, n, ev: near, sd: this.proc ? this.seed : undefined };
  }
}
