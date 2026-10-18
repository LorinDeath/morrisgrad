// «Чёрный маг» — уникальный моб-НПС Аринара (ТЗ Алекса: /workspace/black_mage_spec/TZ-black-mage.md). Всё — только сервер:
// клиент получает позиции/купола/розы для отрисовки, урон и попадания считает зона. Настройки — bmCfg.ts (админка «🌑 Чёрный маг»).
//
// Поведение: бессмертен (ОЗ нет), первым не нападает, бьёт только напавшего (удар по магу или по тому, кого защищает его купол).
// Рядом бой (≤ protectTiles) — медленно идёт туда, встаёт между игроком и мобом, ставит боевой купол (перерыв domeCdMin…Max,
// лимит мира не действует). Сам ставит случайные купола (не больше worldDomesMax). Купол: радиус domeTiles, живёт domeLifeSec
// (переживает телепорт и перезапуск), урон игроков внутрь/изнутри игнорирует, снаряды не пропускает (кроме стрел мага), всех,
// кто внутри и не нападал, делает неуязвимыми, напавшего выталкивает и не пускает обратно, пока маг его помнит.
// Выстрел чёрной магии: в куполе — сжатие пространства (compressTiles): умирает любой моб, даже босс, опыт/добычу не получает никто;
// очередь стрел в напавшего (вне купола 1 % / 10 в с, в куполе снаряд ×2, 2 % / 7 в с, 1–15 с); каждый выстрел — взрыв: цель не
// задевает, другим игрокам explPct % ОЗ и +explBlk % очернения надетым вещам. Смерть от мага: надетым вещам + столько %, сколько
// попаданий мага было по игроку (копится между смертями), на месте смерти — чёрная роза (растёт реальные дни, потом проклинает землю).
// Каждые tpEveryMin — телепорт в случайную свободную точку Аринара, кроме центральной площади.
// Хуки на будущее: onCursedEnter/onCursedLeave (проклятая земля), trail (след «заражает» на trailSec — пока визуал).
import { BM_CFG, BM_TILE, bmClock, roseCurseR, roseMaxR, roseStage } from "./bmCfg";
import { blockedWorld, resolveWorld } from "./propCollision";
import { ARINAR_HUB, worldBounds } from "../worlds/sizes";

export const BM_NPC = "black_mage";      // id НПС (квесты, разговор)
export const BM_LOCK = -7;               // «моб» -7 = цель «маг» в zone_attack (клиент выбирает мага как цель)
const R_BODY = 14;
const ROSE_CELL = 1024;

export interface BmPlayer { sid: string; x: number; y: number; hp: number; maxHp: number; alive: boolean }
export interface BmMob { id: number; type: string; x: number; y: number; dead: boolean; special?: string; dmgBy: Map<string, number> }
export interface BmZone {
  world: string; events: any[];
  near(x: number, y: number, r: number): any[];
  byId: Map<number, any>;
  fire(o: any): any;
  kill(m: any, onKill: (m: any) => void): void;
  pl?: Map<string, any> | null;
}
export interface Dome { id: number; x: number; y: number; r: number; born: number; exp: number; kind: "c" | "w" | "s"; att: Map<string, number> }
export interface Rose { id: number; x: number; y: number; born: number; pkey?: string | null }
export interface BmHost {
  /** урон игроку от мага: pct % макс. ОЗ (истинный), blkAdd — +% очернения надетым; хост сам решает смерть и зовёт onPlayerDeath */
  hurt(sid: string, pct: number, src: "arrow" | "expl", blkAdd: number): void;
  push(sid: string, x: number, y: number): void;
  pkeyOf?(sid: string): string | null;
  dirty?(): void;
  roseAdded?(r: Rose): void;
}
const rnd = (a: number, b: number) => a + Math.random() * (Math.max(a, b) - a);
const dirOf = (dx: number, dy: number, prev = 0) => (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? prev : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0);
const T = (n: number) => (Number(n) || 0) * BM_TILE;

export class BlackMage {
  world: string;
  x: number; y: number; dir = 0; moving = false; state = 0; // 0 гуляет/стоит, 1 идёт на бой, 2 стреляет, 3 разговор
  homeX: number; homeY: number; tx: number; ty: number; pauseUntil = 0; smallCdAt = 0; lastBD: number | undefined;
  tpAt = 0; wDomeAt = 0; domeCdAt = 0;
  aggro = new Map<string, number>();                    // напавший → до какого момента помнит
  fights = new Map<string, { mob: number; pl?: string; at: number }>(); // кто кого бьёт (из зоны: удачный удар по мобу)
  volley: { sid: string; until: number; acc: number } | null = null; gapUntil = 0; compressFxAt = 0;
  hits = new Map<string, { n: number; at: number }>();  // попадания мага по игроку с последней смерти
  lastHurt = new Map<string, number>();                 // когда маг (стрела/взрыв) бил игрока — смерть «от мага»
  talk = new Map<string, number>();                     // разговаривают (стоит и смотрит)
  domes: Dome[] = []; nextDome = 1;
  roses: Rose[] = []; roseGrid = new Map<number, Rose[]>(); roseVer = 0;
  host: BmHost | null = null;
  loaded = false;
  stats: any = { arrows: 0, expl: 0, compressKills: 0, tps: 0, domes: 0, deaths: 0 };
  blocked: (w: string, x: number, y: number, r: number) => boolean;
  constructor(world = "arinar", blocked = blockedWorld) {
    this.world = world; this.blocked = blocked;
    const now = bmClock.now();
    // до первой загрузки из D1 — на случайной точке (как после телепорта)
    const [x, y] = this.pickSpot() || [ARINAR_HUB.x + ARINAR_HUB.r + T(BM_CFG.hubPadTiles) + 400, ARINAR_HUB.y];
    this.x = this.homeX = this.tx = x; this.y = this.homeY = this.ty = y;
    this.tpAt = now + BM_CFG.tpEveryMin * 60000; this.wDomeAt = now + rnd(BM_CFG.worldDomeEveryMin, BM_CFG.worldDomeEveryMax) * 60000;
  }

  // ——— купола ———
  inDome(x: number, y: number, now = bmClock.now()): Dome | null { for (const d of this.domes) if (d.exp > now && (x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) return d; return null; }
  domesAt(x: number, y: number, now = bmClock.now()): Dome[] { return this.domes.filter((d) => d.exp > now && (x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r); }
  isAttacker(d: Dome, sid: string, now = bmClock.now()) { const u = d.att.get(sid); return u !== undefined && u > now; }
  /** игрок неуязвим: стоит в куполе и не нападал на него */
  playerSafe(sid: string, x: number, y: number, now = bmClock.now()) { for (const d of this.domesAt(x, y, now)) if (!this.isAttacker(d, sid, now)) return true; return false; }
  castDome(x: number, y: number, kind: "c" | "w" | "s", players: Map<string, BmPlayer>, now = bmClock.now()): Dome | null {
    if (this.domes.length >= Math.max(1, BM_CFG.domesHardCap)) return null;
    const small = kind === "s", r = Math.round(T(small ? BM_CFG.smallDomeTiles : BM_CFG.domeTiles)), life = small ? BM_CFG.smallDomeLifeSec : BM_CFG.domeLifeSec;
    const d: Dome = { id: this.nextDome++, x: Math.round(x), y: Math.round(y), r, born: now, exp: now + Math.max(2, life) * 1000, kind, att: new Map() };
    this.domes.push(d); this.stats.domes++; this.stats.lastCast = this.stats["cast_" + kind] = { kind, x: d.x, y: d.y, mx: Math.round(this.x), my: Math.round(this.y) };
    // кто в этот момент бил кого-то внутри (или изнутри) — напавший: вытолкнуть; остальные внутри — под защитой
    for (const p of players.values()) {
      if (!p.alive || (p.x - d.x) ** 2 + (p.y - d.y) ** 2 > (r + 40) ** 2) continue;
      const f = this.fights.get(p.sid);
      if (f && now - f.at < 4000) this.markAttack(d, p.sid, p.x, p.y, now, false);
    }
    this.ev({ k: "bmdome", id: d.id, x: d.x, y: d.y, r, life: Math.round((d.exp - now) / 1000), kind });
    this.host?.dirty?.();
    return d;
  }
  /** нападение на купол: запомнить, вытолкнуть за край, маг помнит (domeAggro) */
  markAttack(d: Dome, sid: string, px: number, py: number, now = bmClock.now(), aggro = !!BM_CFG.domeAggro) {
    const until = now + Math.max(5, BM_CFG.aggroForgetSec) * 1000;
    d.att.set(sid, until);
    if (aggro) this.aggro.set(sid, until);
    const dx = px - d.x, dy = py - d.y, L = Math.hypot(dx, dy) || 1, k = d.r + 28;
    if (L < k) { const nx = d.x + (L > 1 ? dx / L : 1) * k, ny = d.y + (L > 1 ? dy / L : 0) * k; this.host?.push(sid, nx, ny); this.ev({ k: "bmpush", sid, x: Math.round(nx), y: Math.round(ny), dx: Math.round(d.x), dy: Math.round(d.y) }); }
  }
  /** движение игрока: напавший не может войти в купол, пока маг его помнит → точка за краем (или null — можно) */
  clampMove(sid: string, x: number, y: number, now = bmClock.now()): [number, number] | null {
    for (const d of this.domes) {
      if (d.exp <= now || !this.isAttacker(d, sid, now)) continue;
      const dx = x - d.x, dy = y - d.y, L = Math.hypot(dx, dy), k = d.r + 24;
      if (L < k) { const ux = L > 1 ? dx / L : 1, uy = L > 1 ? dy / L : 0; x = d.x + ux * k; y = d.y + uy * k; return [x, y]; }
    }
    return null;
  }

  // ——— хуки зоны: урон игроков ———
  /** удар игрока sid (стоит в ax, ay) по мобу m: true — урон отменён (моб или игрок в куполе) */
  guardMobHit(m: { x: number; y: number }, sid: string, ax: number, ay: number): boolean {
    if (!this.domes.length || !sid || sid.startsWith("mob:")) return false;
    const now = bmClock.now();
    const a = this.domesAt(m.x, m.y, now), b = Number.isFinite(ax) ? this.domesAt(ax, ay, now) : [];
    if (!a.length && !b.length) return false;
    for (const d of new Set([...a, ...b])) this.markAttack(d, sid, ax, ay, now, a.includes(d) ? undefined : false);
    return a.length > 0; // моб в куполе — урона нет; удар ИЗ купола по мобу снаружи проходит, но стрелок теряет защиту и вытолкнут
  }
  /** удачный удар игрока по мобу — «идёт бой» (маг идёт туда и ставит купол) */
  noteFight(m: { id: number }, sid: string) { if (sid && !sid.startsWith("mob:")) this.fights.set(sid, { mob: m.id, at: bmClock.now() }); }
  /** МАЛАЯ сфера (Ø5 клеток) вокруг мага: игрок ближе smallTriggerTiles бьёт мага или моба рядом с ним.
   *  Правила — как у большого купола: кто внутри и не нападал — неуязвим, снаряды снаружи гаснут, напавший вытолкнут и не войдёт. */
  smallDome(sid: string, now = bmClock.now(), cx = this.x, cy = this.y) {
    if (BM_CFG.smallDomeOn === false || BM_CFG.on === false || now < this.smallCdAt) return null;
    const p = this.zone?.pl?.get(sid), R = T(BM_CFG.smallTriggerTiles); if (!p || !p.alive || (p.x - this.x) ** 2 + (p.y - this.y) ** 2 > R * R) return null;
    if (Math.hypot(cx - ARINAR_HUB.x, cy - ARINAR_HUB.y) < ARINAR_HUB.r) return null;
    const d = this.castDome(cx, cy, "s", this.zone?.pl || new Map(), now); if (!d) return null;
    this.smallCdAt = now + Math.max(0, BM_CFG.smallDomeCdSec) * 1000; this.stats.small = (this.stats.small || 0) + 1;
    this.markAttack(d, sid, p.x, p.y, now, false); return d;
  }
  /** удар по самому магу (автоатака/снаряд) — нападение. Урона нет: маг бессмертен */
  hitMage(sid: string) {
    if (!sid || sid.startsWith("mob:")) return;
    this.aggro.set(sid, bmClock.now() + Math.max(5, BM_CFG.aggroForgetSec) * 1000);
    this.ev({ k: "bmimm", x: Math.round(this.x), y: Math.round(this.y) });
    this.smallDome(sid);
  }
  /** снаряд на отрезке (x0,y0)→(x1,y1): true — погас (купол/тело мага). Стрелы мага (p.bm) проходят */
  guardProj(p: any, x0: number, y0: number, x1: number, y1: number): boolean {
    if (p.bm) return false;
    const now = bmClock.now();
    if (p.o === "p" && p.sid && BM_CFG.on !== false && this.segDist(this.x, this.y, x0, y0, x1, y1) <= R_BODY + (p.w || 10) / 2) { this.hitMage(p.sid); return true; }
    for (const d of this.domes) {
      if (d.exp <= now) continue;
      if (Math.abs(x1 - d.x) > d.r + 80 && Math.abs(x0 - d.x) > d.r + 80) continue;
      const i0 = (x0 - d.x) ** 2 + (y0 - d.y) ** 2 <= d.r * d.r, i1 = (x1 - d.x) ** 2 + (y1 - d.y) ** 2 <= d.r * d.r;
      if (i0 !== i1) {
        // выстрел игрока ИЗНУТРИ наружу купол не гасит: летит дальше и становится «чёрным» (как стрела мага) — blackShot
        if (i0 && p.o === "p") { if (!p.blk && BM_CFG.pvpShot !== false) this.blackShot(p, x1, y1); if (p.sid) this.markAttack(d, p.sid, x0, y0, now, false); continue; } // стрелок теряет защиту купола и вытолкнут (иначе купол — неуязвимая башня)
        if (p.o === "p" && p.sid) this.markAttack(d, p.sid, x0, y0, now); this.ev({ k: "bmblock", x: Math.round(x1), y: Math.round(y1) }); return true; }
    }
    return false;
  }
  /** выстрел игрока покинул купол → «чёрный»: чёрная стрела на клиенте, попадание по другому игроку — как стрела мага
   *  (pvpShotPct % макс. ОЗ, счёт попаданий → очернение и роза при смерти), в конце — чёрный взрыв (pvpExplPct / pvpExplBlk). Урон по мобам — обычный. */
  blackShot(p: any, x: number, y: number) {
    p.blk = 1; this.stats.blackShots = (this.stats.blackShots || 0) + 1;
    this.ev({ k: "bmblk", id: p.id, sid: p.sid, x: Math.round(x), y: Math.round(y), dx: +p.dx.toFixed(3), dy: +p.dy.toFixed(3), s: p.spd, r: Math.round(Math.max(0, p.range - p.flown)), b: (p.w || 0) >= 14 ? 1 : undefined });
    const end = p.onEnd; p.onEnd = (ex: number, ey: number, hit: boolean) => { end?.(ex, ey, hit); this.blackBoom(ex, ey, p.sid); };
  }
  blackSafe(sid: string, x: number, y: number, now: number) { return this.playerSafe(sid, x, y, now) || Math.hypot(x - ARINAR_HUB.x, y - ARINAR_HUB.y) < ARINAR_HUB.r; }
  blackHit(p: any, pl: BmPlayer): boolean {
    const now = bmClock.now(); if (!pl.alive || pl.sid === p.sid || this.blackSafe(pl.sid, pl.x, pl.y, now)) return false;
    const h = this.hits.get(pl.sid) || { n: 0, at: now }; h.n++; h.at = now; this.hits.set(pl.sid, h);
    if (p.sid) this.fights.set(p.sid, { mob: 0, pl: pl.sid, at: now }); // маг защищает и игрока, по которому бьют чёрным
    this.lastHurt.set(pl.sid, now); this.stats.blackHits = (this.stats.blackHits || 0) + 1; this.host?.hurt(pl.sid, BM_CFG.pvpShotPct, "arrow", 0); return true;
  }
  blackBoom(x: number, y: number, shooter?: string) {
    const R = T(BM_CFG.explTiles), now = bmClock.now(); this.ev({ k: "bmx", x: Math.round(x), y: Math.round(y) });
    const pl = this.zone?.pl; if (!(R > 0) || !pl) return;
    for (const q of pl.values() as Iterable<BmPlayer>) {
      if (q.sid === shooter || !q.alive || (q.x - x) ** 2 + (q.y - y) ** 2 > R * R || this.blackSafe(q.sid, q.x, q.y, now)) continue;
      this.lastHurt.set(q.sid, now); this.host?.hurt(q.sid, BM_CFG.pvpExplPct, "expl", BM_CFG.pvpExplBlk);
    }
  }
  segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy; let t = L2 ? ((px - x0) * dx + (py - y0) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  }
  /** ближний удар (дуга/линия) игрока: задевает ли мага */
  meleeHits(ox: number, oy: number, dx: number, dy: number, range: number, arc = 1, width = 20, kind = "arc") {
    if (BM_CFG.on === false) return false;
    const ex = this.x - ox, ey = this.y - oy, dist = Math.hypot(ex, ey), along = ex * dx + ey * dy;
    if (dist > range + R_BODY || along < -R_BODY) return false;
    if (kind === "arc") return dist < R_BODY + 10 || Math.acos(Math.max(-1, Math.min(1, along / (dist || 1)))) <= arc;
    return Math.abs(ex * dy - ey * dx) <= width + R_BODY;
  }

  // ——— розы и проклятая земля ———
  rk(x: number, y: number) { return Math.floor(x / ROSE_CELL) * 65536 + Math.floor(y / ROSE_CELL); }
  addRose(r: Rose, fresh = false) {
    this.roses.push(r); const k = this.rk(r.x, r.y); const b = this.roseGrid.get(k); if (b) b.push(r); else this.roseGrid.set(k, [r]);
    this.roseVer++;
    if (fresh) { this.ev({ k: "bmrose", id: r.id, x: r.x, y: r.y }); this.host?.roseAdded?.(r); }
  }
  /** розы в квадрате ±R (по сетке) */
  rosesNear(x: number, y: number, R: number): Rose[] {
    const out: Rose[] = [], c0 = Math.floor((x - R) / ROSE_CELL), c1 = Math.floor((x + R) / ROSE_CELL), r0 = Math.floor((y - R) / ROSE_CELL), r1 = Math.floor((y + R) / ROSE_CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) { const b = this.roseGrid.get(cx * 65536 + cy); if (b) for (const r of b) if (Math.abs(r.x - x) <= R && Math.abs(r.y - y) <= R) out.push(r); }
    return out;
  }
  /** проклятая земля в точке: раскрытая роза, радиус растёт по дням (без строк на клетку — от списка роз и времени) */
  cursedAt(x: number, y: number, now = bmClock.now()): boolean {
    const M = roseMaxR(); if (!(M > 0) || !this.roses.length) return false;
    for (const r of this.rosesNear(x, y, M)) { const cr = roseCurseR(now - r.born); if (cr > 0 && (x - r.x) ** 2 + (y - r.y) ** 2 <= cr * cr) return true; }
    return false;
  }
  /** смерть игрока от мага: роза на месте смерти (кроме центральной площади), счётчик попаданий → хосту (очернение) */
  onPlayerDeath(sid: string, x: number, y: number): number {
    const n = this.hits.get(sid)?.n || 0, now = bmClock.now();
    this.hits.delete(sid); this.aggro.delete(sid); if (this.volley?.sid === sid) this.volley = null;
    this.stats.deaths++;
    if (Math.hypot(x - ARINAR_HUB.x, y - ARINAR_HUB.y) > ARINAR_HUB.r) {
      const id = now * 1000 + Math.floor(Math.random() * 1000);
      this.addRose({ id, x: Math.round(x), y: Math.round(y), born: now, pkey: this.host?.pkeyOf?.(sid) || null }, true);
    }
    return n;
  }
  /** «от мага»: маг бил игрока последним (≤ 3 с) */
  killedByMage(sid: string, now = bmClock.now()) { const t = this.lastHurt.get(sid); return t !== undefined && now - t < 3000; }

  // ——— телепорт ———
  pickSpot(): [number, number] | null {
    const [lo, hi] = worldBounds(this.world), pad = 400, hubR = ARINAR_HUB.r + T(BM_CFG.hubPadTiles);
    for (let i = 0; i < 80; i++) {
      const x = rnd(lo + pad, hi - pad), y = rnd(lo + pad, hi - pad);
      if (Math.hypot(x - ARINAR_HUB.x, y - ARINAR_HUB.y) < hubR) continue;
      try { if (this.blocked(this.world, x, y, R_BODY + 4)) continue; } catch { continue; }
      return [Math.round(x), Math.round(y)];
    }
    return null;
  }
  teleport(now = bmClock.now()) {
    const p = this.pickSpot(); this.tpAt = now + Math.max(1, BM_CFG.tpEveryMin) * 60000;
    if (!p) return false;
    this.ev({ k: "bmtp", x: Math.round(this.x), y: Math.round(this.y), o: 1 });
    this.x = this.homeX = this.tx = p[0]; this.y = this.homeY = this.ty = p[1];
    this.aggro.clear(); this.fights.clear(); this.volley = null; this.moving = false; this.talk.clear(); this.stats.tps++;
    this.ev({ k: "bmtp", x: p[0], y: p[1], i: 1 });
    this.host?.dirty?.();
    return true;
  }

  ev(e: any) { this.zone?.events.push(e); }
  zone: BmZone | null = null;

  step(tx: number, ty: number, dt: number, speedMul = 1) {
    const dx = tx - this.x, dy = ty - this.y, L = Math.hypot(dx, dy), st = Math.max(1, BM_CFG.speed) * speedMul * dt;
    this.dir = dirOf(dx, dy, this.dir);
    if (L <= st) { this.x = tx; this.y = ty; this.moving = false; return true; }
    let nx = this.x + (dx / L) * st, ny = this.y + (dy / L) * st;
    try { [nx, ny] = resolveWorld(this.world, nx, ny, R_BODY); } catch {}
    const [lo, hi] = worldBounds(this.world); nx = Math.max(lo + 20, Math.min(hi - 20, nx)); ny = Math.max(lo + 20, Math.min(hi - 20, ny));
    if (Math.hypot(ARINAR_HUB.x - nx, ARINAR_HUB.y - ny) < ARINAR_HUB.r) { this.moving = false; return true; } // на центральную площадь не заходит
    this.moving = Math.hypot(nx - this.x, ny - this.y) > 0.2; this.x = nx; this.y = ny;
    return false;
  }

  /** такт мира (Аринар): dt — с, players — герои мира */
  tick(dt: number, zone: BmZone, players: Map<string, BmPlayer>) {
    this.zone = zone;
    const now = bmClock.now();
    // купола: истёкшие — прочь (переживают телепорт мага)
    if (this.domes.length) { const before = this.domes.length; this.domes = this.domes.filter((d) => { if (d.exp > now) { for (const [k, u] of d.att) if (u <= now) d.att.delete(k); return true; } this.ev({ k: "bmdome_end", id: d.id, x: d.x, y: d.y }); return false; }); if (this.domes.length !== before) this.host?.dirty?.(); }
    for (const [k, u] of this.aggro) if (u <= now || !players.get(k)?.alive) this.aggro.delete(k);
    for (const [k, f] of this.fights) if (now - f.at > 6000) this.fights.delete(k);
    for (const [k, h] of this.hits) if (now - h.at > Math.max(30, BM_CFG.hitsForgetSec) * 1000) this.hits.delete(k);
    for (const [k, t] of this.lastHurt) if (now - t > 10000) this.lastHurt.delete(k);
    for (const [k, u] of this.talk) if (u <= now || !players.has(k)) this.talk.delete(k);
    if (BM_CFG.on === false) { this.volley = null; this.moving = false; return; }
    if (now >= this.tpAt) { this.teleport(now); return; }
    // напавший: ближайший из помнящих, в пределах поводка; в центральной площади — не стреляет
    let foe: BmPlayer | null = null, fd = T(BM_CFG.leashTiles);
    for (const sid of this.aggro.keys()) { const p = players.get(sid); if (!p || !p.alive) continue; if (Math.hypot(p.x - ARINAR_HUB.x, p.y - ARINAR_HUB.y) < ARINAR_HUB.r) continue; const d = Math.hypot(p.x - this.x, p.y - this.y); if (d < fd) { fd = d; foe = p; } }
    if (foe) { this.talk.clear(); this.fightFoe(foe, fd, dt, now, players); return; }
    this.volley = null;
    if (this.talk.size) { this.moving = false; this.state = 3; const p = players.get([...this.talk.keys()][0]); if (p) this.dir = dirOf(p.x - this.x, p.y - this.y, this.dir); return; }
    // бой рядом: игрок бьёт моба (или чёрным выстрелом — игрока) в protectTiles — маг защищает цель. Выбор купола по дистанции маг→цель:
    //  • ближе smallTriggerTiles (5): МАЛАЯ сфера на ЦЕЛИ — подходит до smallCastTiles (4) и ставит (позиция мага неважна);
    //  • дальше (до protectTiles 10): БОЛЬШОЙ купол с МАГОМ в центре — подходит до bigCastTiles (7; если цель отходит — до bigCastMinTiles 5), чтобы цель точно была внутри.
    //  Напавший в обоих случаях — нападающий купола: вытолкнут сразу при постановке и не войдёт, пока маг помнит. Пока купол на перезарядке — встаёт между.
    const PR = T(BM_CFG.protectTiles);
    let best: { p: BmPlayer; m: any; d: number; sid: string } | null = null;
    for (const [sid, f] of this.fights) {
      if (now - f.at > 3000) continue;
      const p = players.get(sid), m = f.pl ? players.get(f.pl) : zone.byId.get(f.mob);
      if (!p || !p.alive || !m || m.dead || m.alive === false) continue;
      const d = Math.hypot(m.x - this.x, m.y - this.y);
      if (d <= PR && (!best || d < best.d)) best = { p, m, d, sid };
    }
    if (best) {
      this.state = 1;
      const { p, m, d: D, sid } = best, ex = p.x - m.x, ey = p.y - m.y, L = Math.hypot(ex, ey) || 1;
      const covered = this.inDome(m.x, m.y, now);
      const small = D <= T(BM_CFG.smallTriggerTiles) && BM_CFG.smallDomeOn !== false;
      if (!covered && small && now >= this.smallCdAt) {
        if (D > T(BM_CFG.smallCastTiles) + 4) { this.step(m.x, m.y, dt); return; }
        this.moving = false; const sd = this.castDome(m.x, m.y, "s", players, now);
        if (sd) { this.smallCdAt = now + Math.max(0, BM_CFG.smallDomeCdSec) * 1000; this.stats.small = (this.stats.small || 0) + 1; this.markAttack(sd, sid, p.x, p.y, now, false); }
        return;
      }
      if (!covered && !small && now >= this.domeCdAt) {
        const goal = T(Math.min(BM_CFG.bigCastTiles, BM_CFG.domeTiles - 0.5)), min = T(Math.min(BM_CFG.bigCastMinTiles, BM_CFG.bigCastTiles));
        const away = this.lastBD !== undefined && D > this.lastBD + 0.5; this.lastBD = D;
        if (D > (away ? min : goal)) { this.step(m.x, m.y, dt); return; } // подходит до 7; цель отходит — догоняет до 5 (купол только когда цель точно внутри)
        this.moving = false; this.lastBD = undefined;
        const bd = this.castDome(this.x, this.y, "c", players, now);
        if (bd) { this.domeCdAt = now + rnd(BM_CFG.domeCdMin, BM_CFG.domeCdMax) * 1000; this.markAttack(bd, sid, p.x, p.y, now, false); }
        return;
      }
      // купол уже стоит / перезарядка — встаёт между: на отрезке цель → игрок, у цели
      const k = BM_CFG.stepBetween !== false ? Math.min(L * 0.5, 46) : 0;
      this.step(m.x + (ex / L) * k, m.y + (ey / L) * k, dt);
      return;
    }
    this.state = 0;
    // случайный купол по миру (сам маг; лимит worldDomesMax)
    if (now >= this.wDomeAt) {
      this.wDomeAt = now + rnd(BM_CFG.worldDomeEveryMin, BM_CFG.worldDomeEveryMax) * 60000;
      const nW = this.domes.filter((d) => d.kind === "w").length;
      if (nW < Math.max(0, BM_CFG.worldDomesMax) && !this.inDome(this.x, this.y, now)) this.castDome(this.x, this.y, "w", players, now);
    }
    // прогулка вокруг точки телепорта
    if (!this.moving && now < this.pauseUntil) return;
    if (!this.moving) {
      const R = T(BM_CFG.wanderTiles), a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
      this.tx = this.homeX + Math.cos(a) * d; this.ty = this.homeY + Math.sin(a) * d; this.moving = true;
    }
    if (this.step(this.tx, this.ty, dt, 0.8)) this.pauseUntil = now + rnd(3, 9) * 1000;
  }

  fightFoe(foe: BmPlayer, dist: number, dt: number, now: number, players: Map<string, BmPlayer>) {
    const range = T(BM_CFG.rangeTiles);
    this.dir = dirOf(foe.x - this.x, foe.y - this.y, this.dir);
    if (!this.volley && now >= this.gapUntil && dist <= range) this.volley = { sid: foe.sid, until: now + rnd(BM_CFG.volleyMin, BM_CFG.volleyMax) * 1000, acc: 1 };
    if (this.volley && (this.volley.sid !== foe.sid || now >= this.volley.until)) { this.volley = null; this.gapUntil = now + rnd(BM_CFG.volleyGapMin, BM_CFG.volleyGapMax) * 1000; }
    if (!this.volley) { this.state = 1; if (dist > range * 0.75) this.step(foe.x, foe.y, dt); else this.moving = false; return; }
    this.state = 2; this.moving = false;
    const inD = !!this.inDome(this.x, this.y, now);
    const rate = Math.max(0.5, inD ? BM_CFG.arrowDomeRate : BM_CFG.arrowRate);
    this.volley.acc += dt * rate;
    let n = 0;
    while (this.volley.acc >= 1 && n < 4) { this.volley.acc -= 1; n++; this.shoot(foe, inD, now, players); }
  }
  /** выстрел чёрной магии: сжатие пространства (в куполе) + стрела + взрыв в конце полёта */
  shoot(foe: BmPlayer, inD: boolean, now: number, players: Map<string, BmPlayer>) {
    const z = this.zone; if (!z) return;
    if (inD) this.compress(now);
    const pct = inD ? BM_CFG.arrowDomePct : BM_CFG.arrowPct, w = T(inD ? BM_CFG.arrowDomeTiles : BM_CFG.arrowTiles), sid = foe.sid;
    this.stats.arrows++;
    z.fire({ o: "m", t: inD ? "bm_arrow_big" : "bm_arrow_small", x: this.x, y: this.y, dx: foe.x - this.x, dy: foe.y - this.y, range: T(BM_CFG.rangeTiles) + 40, w: Math.max(4, w), max: 1, spd: Math.max(100, BM_CFG.arrowSpeed), bm: 1, only: sid,
      onHit: (pl: BmPlayer) => {
        if (!pl.alive) return; const h = this.hits.get(pl.sid) || { n: 0, at: now }; h.n++; h.at = bmClock.now(); this.hits.set(pl.sid, h);
        this.lastHurt.set(pl.sid, bmClock.now()); this.host?.hurt(pl.sid, pct, "arrow", 0);
      },
      onEnd: (x: number, y: number) => this.explode(x, y, sid, inD, players) });
  }
  explode(x: number, y: number, target: string, big: boolean, players: Map<string, BmPlayer>) {
    const R = T(BM_CFG.explTiles), now = bmClock.now();
    this.stats.expl++;
    this.ev({ k: "bmx", x: Math.round(x), y: Math.round(y), b: big ? 1 : undefined });
    if (!(R > 0)) return;
    for (const p of players.values()) {
      if (p.sid === target || !p.alive || (p.x - x) ** 2 + (p.y - y) ** 2 > R * R) continue;
      if (this.playerSafe(p.sid, p.x, p.y, now) || Math.hypot(p.x - ARINAR_HUB.x, p.y - ARINAR_HUB.y) < ARINAR_HUB.r) continue;
      this.lastHurt.set(p.sid, now); this.host?.hurt(p.sid, BM_CFG.explPct, "expl", BM_CFG.explBlk);
    }
  }
  /** сжатие пространства: в куполе — любой моб в compressTiles от мага умирает (даже босс), опыт и добыча — никому */
  compress(now: number) {
    const z = this.zone; if (!z) return; const R = T(BM_CFG.compressTiles); let k = 0;
    for (const m of z.near(this.x, this.y, R + 60)) {
      if (m.dead || (m.x - this.x) ** 2 + (m.y - this.y) ** 2 > R * R || !this.inDome(m.x, m.y, now)) continue;
      m.dmgBy?.clear?.(); m.qf?.clear?.(); (m as any).killer = "bm"; (m as any).bmKilled = 1;
      z.kill(m, () => {}); k++; // без onMobKilled: ни опыта, ни мешка, ни сундука, ни засчитанного убийства
    }
    this.stats.compressKills += k;
    if (k || now - this.compressFxAt > 900) { this.compressFxAt = now; this.ev({ k: "bmc", x: Math.round(this.x), y: Math.round(this.y), r: R, n: k || undefined }); }
  }
  talkStart(sid: string) { this.talk.set(sid, bmClock.now() + 90000); this.moving = false; }
  talkEnd(sid: string | null) { if (sid) this.talk.delete(sid); else this.talk.clear(); }

  // ——— снимки для клиентов ———
  /** маг: [x, y, dir, moving, state] — если рядом (интерес), иначе null */
  mageNear(px: number, py: number, R = 2600) { return BM_CFG.on !== false && Math.abs(this.x - px) < R && Math.abs(this.y - py) < R ? [Math.round(this.x), Math.round(this.y), this.dir, this.moving ? 1 : 0, this.state] : null; }
  domesNear(px: number, py: number, R = 3000) { const now = bmClock.now(); return this.domes.filter((d) => d.exp > now && Math.abs(d.x - px) < R + d.r && Math.abs(d.y - py) < R + d.r).map((d) => [d.id, d.x, d.y, d.r, Math.round((d.exp - now) / 1000), d.kind === "w" ? 1 : d.kind === "s" ? 2 : 0]); }
  /** розы рядом: [id, x, y, возраст мс] — клиент сам считает стадию и проклятую землю */
  rosesSnap(px: number, py: number, R = 2600) { const now = bmClock.now(); return this.rosesNear(px, py, R + roseMaxR()).map((r) => [r.id, r.x, r.y, Math.max(0, now - r.born)]); }
  npcEntry(): [string, number, number, number, number] | null { return BM_CFG.on !== false ? [BM_NPC, Math.round(this.x), Math.round(this.y), this.dir, this.moving ? 1 : 0] : null; }

  // ——— сохранение (D1 bm_state / black_roses) ———
  serialize() { const now = bmClock.now(); return { x: Math.round(this.x), y: Math.round(this.y), hx: Math.round(this.homeX), hy: Math.round(this.homeY), tpAt: this.tpAt, wDomeAt: this.wDomeAt, domeCdAt: this.domeCdAt, nextDome: this.nextDome, off: bmClock.offset || undefined,
    domes: this.domes.filter((d) => d.exp > now).map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r, born: d.born, exp: d.exp, kind: d.kind })) }; }
  restore(o: any) {
    if (!o || typeof o !== "object") return;
    const ok = (v: any) => Number.isFinite(Number(v));
    if (ok(o.x) && ok(o.y)) { this.x = this.tx = Number(o.x); this.y = this.ty = Number(o.y); this.homeX = ok(o.hx) ? Number(o.hx) : this.x; this.homeY = ok(o.hy) ? Number(o.hy) : this.y; }
    if (ok(o.tpAt)) this.tpAt = Number(o.tpAt); if (ok(o.wDomeAt)) this.wDomeAt = Number(o.wDomeAt); if (ok(o.domeCdAt)) this.domeCdAt = Number(o.domeCdAt);
    if (ok(o.nextDome)) this.nextDome = Math.max(this.nextDome, Number(o.nextDome));
    const now = bmClock.now();
    if (Array.isArray(o.domes)) for (const d of o.domes) if (d && ok(d.x) && ok(d.y) && Number(d.exp) > now && !this.domes.some((q) => q.id === d.id)) this.domes.push({ id: Number(d.id) || this.nextDome++, x: Number(d.x), y: Number(d.y), r: Number(d.r) || T(BM_CFG.domeTiles), born: Number(d.born) || now, exp: Number(d.exp), kind: d.kind === "w" ? "w" : d.kind === "s" ? "s" : "c", att: new Map() });
  }
  /** «📊 Нагрузка»/отладка */
  info() { const now = bmClock.now(); return { x: Math.round(this.x), y: Math.round(this.y), state: this.state, aggro: this.aggro.size, domes: this.domes.length, worldDomes: this.domes.filter((d) => d.kind === "w").length, roses: this.roses.length, open: this.roses.filter((r) => roseStage(now - r.born) === 6).length, tpIn: Math.round((this.tpAt - now) / 1000), ...this.stats }; }
}
