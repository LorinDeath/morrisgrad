// Шаг ночи. Чистая симуляция, без DOM и localStorage.
import {
  ENEMY_BASE, RESIST, abilityCd, enemyArmor, enemyHp, extraFrom, hitsAir,
  interestGold, killGold, levelOf, mitigate, PATH_GAP, profileOf, releaseGap, rewardAmounts, seesShade, starCount,
  statsOf, tileBonus, waveGold, wavePlan,
} from "./combat.ts";
import { along, cellChar, mapById, tileBuildable, type MapDef } from "./maps.ts";
import { compile } from "./research.ts";
import {
  ABILITIES, TOWER_COLOR, TOWER_NAME, TOWERS, fail, ok,
  type Act, type Bonuses, type DmgType, type Enemy, type EnemyKind, type Extra, type Fx,
  type GlobalId, type Meta, type ModKind, type Proj, type Run, type Tower, type TowerKind,
} from "./types.ts";

const RANK_MAX = 6;
const STAMP_COST = 42;
const PROJ_SPEED = 8.5;

function rand(run: Run): number {
  let x = run.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  run.rng = x >>> 0;
  if (run.rng === 0) run.rng = 1;
  return (run.rng % 1_000_000) / 1_000_000;
}

function keyOf(x: number, y: number): string {
  return x + "," + y;
}

export function modAt(map: MapDef, run: Run, x: number, y: number): ModKind | null {
  const over = run.mods[keyOf(x, y)];
  if (over) return over;
  const ch = cellChar(map, x, y);
  if (ch === "+") return "dmg";
  if (ch === "*") return "range";
  if (ch === "~") return "rate";
  if (ch === "^") return "xp";
  if (ch === "$") return "bounty";
  return null;
}

export function enemyPos(map: MapDef, enemy: Enemy): { x: number; y: number } {
  const routes = enemy.air ? map.air : map.ground;
  const route = routes[Math.min(routes.length - 1, Math.max(0, enemy.route))];
  if (!route) return { x: 0.5, y: 0.5 };
  return along(route, enemy.progress);
}

function blankEnemy(run: Run, kind: EnemyKind, hp: number, armor: number, wave: number, route: number, air: boolean, progress: number): Enemy {
  return {
    id: run.nextId++, kind, hp, maxHp: hp,
    shield: kind === "shield" ? Math.floor(hp * 0.45) : 0,
    armor, shred: 0, shredUntil: 0, progress: Math.max(0, progress), route, air,
    slowUntil: 0, slowPct: 0, freezeUntil: 0, frostStacks: 0, frostLock: 0,
    poisonDps: 0, poisonUntil: 0, poisonStacks: 0, poisonFrom: 0,
    fireDps: 0, fireUntil: 0, fireFrom: 0, bleedDps: 0, bleedUntil: 0, bleedFrom: 0,
    revealedUntil: 0, muteUntil: 0, markUntil: 0, markAmp: 0, brittleUntil: 0,
    shatterArmed: false, phased2: false, phased3: false, fromSplit: false, parent: 0,
    healerCd: 2.4, callerCd: 4.2, stunUntil: 0, wave, alive: true,
  };
}

function pushFx(run: Run, fx: Fx): void {
  run.fx.push(fx);
  if (run.fx.length > 90) run.fx.splice(0, run.fx.length - 90);
}

export function syncOffers(run: Run): void {
  for (const tower of run.towers) checkOffers(tower);
}

function checkOffers(tower: Tower): void {
  const lv = levelOf(tower.xp);
  const want = [4, 8, 12].filter((t) => lv >= t).length;
  if (tower.abilities.length < want) {
    if (!tower.offer) {
      const owned = new Set(tower.abilities);
      const left = ABILITIES[tower.kind].filter((a) => !owned.has(a.id));
      const show = tower.abilities.length >= 2 ? 2 : 3;
      tower.offer = left.slice(0, Math.min(show, left.length)).map((a) => a.id);
    }
    return;
  }
  if (lv >= 16 && !tower.upgraded && tower.abilities.length > 0 && !tower.offer) {
    tower.offer = tower.abilities.map((id) => "up:" + id);
  }
}

function grantXp(tower: Tower, amount: number): void {
  if (!(amount > 0)) return;
  tower.xp += amount;
  checkOffers(tower);
}

function auraArmor(run: Run, map: MapDef, enemy: Enemy): number {
  if (enemy.kind === "boss") return 0;
  const q = enemyPos(map, enemy);
  for (const boss of run.enemies) {
    if (!boss.alive || boss.kind !== "boss" || !boss.phased3) continue;
    const p = enemyPos(map, boss);
    if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= 2.56) return 2;
  }
  return 0;
}

function spawnKind(run: Run, b: Bonuses, map: MapDef, kind: EnemyKind, route: number, wave: number, progress: number, air: boolean, parent = 0): Enemy {
  const hp = enemyHp(kind, wave, map.difficulty, run.endless, b.knowHp[kind]);
  const enemy = blankEnemy(run, kind, hp, enemyArmor(kind, wave, run.endless), wave, route, air, progress);
  enemy.parent = parent;
  run.enemies.push(enemy);
  return enemy;
}

function killEnemy(run: Run, b: Bonuses, map: MapDef, enemy: Enemy, tower: Tower | null, status: Extra | null, xpMul: number): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.hp = 0;
  run.kills++;
  if (enemy.kind === "boss") run.bossKilled = true;
  if (tower) {
    grantXp(tower, 6 * xpMul);
    tower.kills++;
    const bounty = modAt(map, run, tower.x, tower.y) === "bounty" ? tileBonus("bounty", b).bounty : 0;
    const gold = killGold(enemy.maxHp, b.gold, bounty);
    run.gold += gold;
    run.goldEarned += gold;
  }
    if (enemy.kind === "splitter") {
    const a = spawnKind(run, b, map, "mite", enemy.route, enemy.wave, enemy.progress - PATH_GAP, false);
    const c = spawnKind(run, b, map, "mite", enemy.route, enemy.wave, enemy.progress - PATH_GAP * 2, false);
    a.fromSplit = true;
    c.fromSplit = true;
  }
  if ((status?.shatter || enemy.shatterArmed) && enemy.freezeUntil > run.time) {
    const raw = enemy.maxHp * 0.25;
    const p0 = enemyPos(map, enemy);
    for (const o of run.enemies) {
      if (!o.alive || o.id === enemy.id) continue;
      const q = enemyPos(map, o);
      if ((q.x - p0.x) ** 2 + (q.y - p0.y) ** 2 <= 1) hurt(run, b, map, o, raw, "frost", b.knowPen[o.kind], false, tower, 1, null, xpMul);
    }
  }
  if (tower?.abilities.includes("burst")) {
    const p0 = enemyPos(map, enemy);
    for (const o of run.enemies) {
      if (!o.alive || o.id === enemy.id) continue;
      const q = enemyPos(map, o);
      if ((q.x - p0.x) ** 2 + (q.y - p0.y) ** 2 <= 1.21) {
        o.poisonDps = Math.max(o.poisonDps, 2.2);
        o.poisonUntil = Math.max(o.poisonUntil, run.time + 2.5);
        o.poisonFrom = tower.id;
        o.revealedUntil = Math.max(o.revealedUntil, run.time + 1);
      }
    }
  }
}

function phases(run: Run, b: Bonuses, map: MapDef, enemy: Enemy): void {
  if (enemy.kind !== "boss" || !enemy.alive) return;
  if (!enemy.phased2 && enemy.hp <= enemy.maxHp * 0.66) {
    enemy.phased2 = true;
    enemy.armor += 4;
    for (let i = 0; i < 3; i++) spawnKind(run, b, map, "walker", enemy.route, enemy.wave, enemy.progress - PATH_GAP * (i + 1), false);
  }
  if (!enemy.phased3 && enemy.hp <= enemy.maxHp * 0.33) {
    enemy.phased3 = true;
    enemy.shield += Math.floor(enemy.maxHp * 0.25);
    for (let i = 0; i < 2; i++) spawnKind(run, b, map, "knight", enemy.route, enemy.wave, enemy.progress - PATH_GAP * (i + 1), false);
  }
}

function applyStatus(run: Run, enemy: Enemy, status: Extra, tower: Tower | null): void {
  if (status.reveal > 0) enemy.revealedUntil = Math.max(enemy.revealedUntil, run.time + status.reveal);
  if (status.poison > 0) {
    if (enemy.poisonStacks < status.poisonStacks) enemy.poisonStacks++;
    enemy.poisonDps = status.poison * Math.max(1, enemy.poisonStacks);
    enemy.poisonUntil = run.time + status.poisonTime;
    if (tower) enemy.poisonFrom = tower.id;
    if (status.melt) {
      enemy.shred = Math.max(enemy.shred, enemy.poisonStacks);
      enemy.shredUntil = enemy.poisonUntil;
    }
    if (status.sticky) {
      enemy.slowPct = Math.max(enemy.slowPct, 0.12);
      enemy.slowUntil = Math.max(enemy.slowUntil, enemy.poisonUntil);
    }
  }
  if (status.fire > 0) {
    enemy.fireDps = Math.max(enemy.fireDps, status.fire);
    enemy.fireUntil = Math.max(enemy.fireUntil, run.time + status.fireTime);
    if (tower) enemy.fireFrom = tower.id;
  }
  if (status.bleed > 0) {
    enemy.bleedDps = Math.max(enemy.bleedDps, status.bleed);
    enemy.bleedUntil = Math.max(enemy.bleedUntil, run.time + 2.5);
    if (tower) enemy.bleedFrom = tower.id;
  }
  if (status.frost && run.time >= enemy.frostLock) {
    enemy.frostStacks++;
    if (enemy.frostStacks >= Math.max(2, status.freezeAt)) {
      enemy.freezeUntil = run.time + 0.7;
      enemy.frostStacks = 0;
      enemy.frostLock = run.time + 1.3;
    }
  }
  if (status.slow > 0) {
    enemy.slowPct = Math.max(enemy.slowPct, Math.min(0.8, status.slow));
    enemy.slowUntil = Math.max(enemy.slowUntil, run.time + status.slowTime);
  }
  if (status.brittle) enemy.brittleUntil = Math.max(enemy.brittleUntil, run.time + 2.2);
  if (status.shatter) enemy.shatterArmed = true;
  if (status.mute > 0) enemy.muteUntil = Math.max(enemy.muteUntil, run.time + status.mute);
  if (status.shred > 0) {
    enemy.shred = Math.max(enemy.shred, status.shred);
    enemy.shredUntil = Math.max(enemy.shredUntil, run.time + 3);
  }
  if (status.mark > 0) {
    enemy.markUntil = run.time + 3;
    enemy.markAmp = status.mark;
  }
  if (status.stun > 0 && rand(run) < status.stun) enemy.stunUntil = Math.max(enemy.stunUntil, run.time + 0.35);
  if (status.goldChance > 0 && tower && rand(run) < status.goldChance) {
    run.gold += 1;
    run.goldEarned += 1;
  }
}

function hurt(
  run: Run, b: Bonuses, map: MapDef, enemy: Enemy, raw: number, type: DmgType, pen: number,
  ignoreArmor: boolean, tower: Tower | null, resistMul: number, status: Extra | null, xpMul: number,
): number {
  if (!enemy.alive || enemy.hp <= 0 || raw <= 0) return 0;
  let amount = raw;
  if (status) {
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    if (ratio > 0.7) amount *= 1 + status.full70;
    if (ratio > 0.8) amount *= 1 + status.fullHp;
    if (enemy.kind === "boss") amount *= 1 + status.boss;
    if (enemy.kind === "knight" || enemy.kind === "shield") amount *= 1 + status.shieldBonus;
    if (enemy.air) amount *= 1 + status.airMul;
    if (enemy.kind === "shade") amount *= 1 + status.shadeBonus;
  }
  if (enemy.markUntil > run.time) amount *= 1 + enemy.markAmp;
  if (enemy.freezeUntil > run.time && enemy.brittleUntil > run.time) amount *= 1.2;
  const armor = Math.max(0, enemy.armor + auraArmor(run, map, enemy) - (enemy.shredUntil > run.time ? enemy.shred : 0));
  const dealt = mitigate(amount, (RESIST[enemy.kind][type] ?? 0) * resistMul, armor, pen, ignoreArmor);
  let left = dealt;
  if (enemy.shield > 0 && left > 0) {
    const mul = type === "shock" ? 1.4 : 1;
    const eat = Math.min(enemy.shield, left * mul);
    enemy.shield -= eat;
    left -= eat / mul;
    if (left < 0) left = 0;
  }
  enemy.hp -= left;
  if (tower) {
    tower.dealt += dealt;
    grantXp(tower, dealt * 0.1 * xpMul);
  }
  if (status || raw >= 1.2) {
    const p = enemyPos(map, enemy);
    pushFx(run, { x: p.x, y: p.y - 0.2, x2: p.x, y2: p.y, text: String(Math.max(1, Math.round(dealt))), ttl: 0.65, color: "#ffe9a8", kind: "num" });
  }
  if (status && enemy.alive) applyStatus(run, enemy, status, tower);
  if (status && enemy.alive && enemy.hp > 0 && status.execute > 0) {
    const cap = enemy.kind === "boss" ? Math.min(status.execute, 0.06) : status.execute;
    if (enemy.hp / enemy.maxHp <= cap) enemy.hp = 0;
  }
  if (enemy.hp <= 0) killEnemy(run, b, map, enemy, tower, status, xpMul);
  else phases(run, b, map, enemy);
  return dealt;
}

function inRange(map: MapDef, tower: Tower, enemy: Enemy, range: number): boolean {
  const p = enemyPos(map, enemy);
  const dx = p.x - (tower.x + 0.5);
  const dy = p.y - (tower.y + 0.5);
  return dx * dx + dy * dy <= range * range;
}

function listTargets(run: Run, map: MapDef, tower: Tower, b: Bonuses, range: number, airOk: boolean): Enemy[] {
  const out: Enemy[] = [];
  for (const e of run.enemies) {
    if (!e.alive || e.hp <= 0) continue;
    if (e.air && !airOk) continue;
    if (!seesShade(tower, e, b, run.time)) continue;
    if (inRange(map, tower, e, range)) out.push(e);
  }
  return out;
}

function pick(map: MapDef, list: Enemy[], mode: Tower["target"], ox: number, oy: number): Enemy | null {
  if (!list.length) return null;
  let best = list[0];
  let score = -Infinity;
  for (const e of list) {
    let s = 0;
    if (mode === "first") s = e.progress;
    else if (mode === "last") s = -e.progress;
    else if (mode === "strong") s = e.hp;
    else {
      const p = enemyPos(map, e);
      s = -((p.x - ox) ** 2 + (p.y - oy) ** 2);
    }
    if (s > score) { score = s; best = e; }
  }
  return best;
}

function launch(run: Run, tower: Tower, enemy: Enemy, map: MapDef, dmg: number, type: DmgType, extra: Extra, splash: number, air: boolean, homing: boolean): void {
  const p = enemyPos(map, enemy);
  const proj: Proj = {
    id: run.nextId++, towerId: tower.id, kind: tower.kind,
    x: tower.x + 0.5, y: tower.y + 0.5, destX: p.x, destY: p.y, enemyId: enemy.id,
    dmg, dmgType: type, splash, edge: extra ? 0.55 : 0.55, air, homing, extra, ttl: 3, color: TOWER_COLOR[tower.kind], bounced: false,
  };
  run.projs.push(proj);
}

function splashHurt(run: Run, b: Bonuses, map: MapDef, tower: Tower, x: number, y: number, dmg: number, type: DmgType, radius: number, edge: number, air: boolean, status: Extra | null, xpMul: number, pen: number): void {
  for (const e of run.enemies) {
    if (!e.alive) continue;
    if (e.air && !air) continue;
    const p = enemyPos(map, e);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > radius) continue;
    const fall = 1 - (1 - edge) * (radius > 0 ? d / radius : 0);
    const st = status ? { ...status, reveal: Math.max(status.reveal, 0.8) } : null;
    hurt(run, b, map, e, dmg * fall, type, pen, !!st?.ignoreArmor && type === "poison", tower, st?.resistMul ?? 1, st, xpMul);
  }
  pushFx(run, { x, y, x2: x, y2: y, text: "", ttl: 0.28, color: TOWER_COLOR[tower.kind], kind: "boom" });
}

function chain(run: Run, b: Bonuses, map: MapDef, tower: Tower, from: Enemy, dmg: number, jumps: number, keep: number, reach: number, type: DmgType, status: Extra, xpMul: number, seen: Set<number>): void {
  if (jumps <= 0) return;
  const p = enemyPos(map, from);
  let best: Enemy | null = null;
  let bestD = reach;
  for (const e of run.enemies) {
    if (!e.alive || seen.has(e.id)) continue;
    if (e.air && !hitsAir(tower.kind, b)) continue;
    const q = enemyPos(map, e);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) { best = e; bestD = d; }
  }
  if (!best) return;
  seen.add(best.id);
  const next = dmg * keep;
  hurt(run, b, map, best, next, type, status.pen, false, tower, 1, status, xpMul);
  if (best.alive) chain(run, b, map, tower, best, next, jumps - 1, keep, reach, type, status, xpMul, seen);
}

function lineTargets(map: MapDef, run: Run, tower: Tower, aim: Enemy, range: number, width: number, maxN: number, airOk: boolean, b: Bonuses): Enemy[] {
  const ox = tower.x + 0.5;
  const oy = tower.y + 0.5;
  const tp = enemyPos(map, aim);
  const dx = tp.x - ox;
  const dy = tp.y - oy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hits: { e: Enemy; t: number }[] = [];
  for (const e of run.enemies) {
    if (!e.alive) continue;
    if (e.air && !airOk) continue;
    if (!seesShade(tower, e, b, run.time) && e.id !== aim.id) continue;
    const p = enemyPos(map, e);
    const vx = p.x - ox;
    const vy = p.y - oy;
    const t = vx * ux + vy * uy;
    if (t < 0 || t > range) continue;
    const px = ox + ux * t;
    const py = oy + uy * t;
    if (Math.hypot(p.x - px, p.y - py) <= width) hits.push({ e, t });
  }
  hits.sort((a, c) => a.t - c.t);
  return hits.slice(0, Math.max(1, maxN)).map((h) => h.e);
}

function fireTower(run: Run, b: Bonuses, map: MapDef, tower: Tower, sanct: number): boolean {
  if (tower.kind === "miner") return false;
  const mod = modAt(map, run, tower.x, tower.y);
  const prof = profileOf(tower, b);
  const st = statsOf(tower, mod, b, sanct);
  const airOk = hitsAir(tower.kind, b);
  const list = listTargets(run, map, tower, b, st.range, airOk);
  if (!list.length && tower.kind !== "halo") return false;
  const origin = { x: tower.x + 0.5, y: tower.y + 0.5 };
  const aim = pick(map, list, tower.target, origin.x, origin.y);
  const status = extraFrom(prof, b, aim?.kind ?? "walker");
  const type = st.type;

  if (tower.kind === "halo") {
    const victims = run.enemies.filter((e) => e.alive && inRange(map, tower, e, st.range) && (!e.air || airOk));
    if (!victims.length) return false;
    for (const e of victims) {
      const stt = extraFrom(prof, b, e.kind);
      stt.reveal = Math.max(stt.reveal, 1.4);
      hurt(run, b, map, e, st.dmg, type, stt.pen, false, tower, 1, stt, st.xpMul);
    }
    pushFx(run, { x: origin.x, y: origin.y, x2: origin.x, y2: origin.y, text: "", ttl: 0.18, color: TOWER_COLOR.halo, kind: "ring" });
    return true;
  }
  if (!aim) return false;

  if (tower.kind === "blaze") {
    let victims = list;
    if (!prof.coneAll) {
      const tp = enemyPos(map, aim);
      const ax = tp.x - origin.x;
      const ay = tp.y - origin.y;
      const al = Math.hypot(ax, ay) || 1;
      victims = list.filter((e) => {
        const p = enemyPos(map, e);
        const vx = p.x - origin.x;
        const vy = p.y - origin.y;
        const vl = Math.hypot(vx, vy) || 1;
        const dot = (ax / al) * (vx / vl) + (ay / al) * (vy / vl);
        return dot >= 0.64;
      });
    }
    const burning = victims.filter((e) => e.fireUntil > run.time).length;
    const emb = prof.embers ? 1 + Math.min(0.4, 0.1 * burning) : 1;
    for (const e of victims) hurt(run, b, map, e, st.dmg * emb, type, status.pen, false, tower, 1, extraFrom(prof, b, e.kind), st.xpMul);
    const tp = enemyPos(map, aim);
    pushFx(run, { x: origin.x, y: origin.y, x2: tp.x, y2: tp.y, text: "", ttl: 0.12, color: TOWER_COLOR.blaze, kind: "beam" });
    return true;
  }

  if (tower.kind === "beam" || tower.kind === "awl") {
    const hits = lineTargets(map, run, tower, aim, st.range, prof.width, prof.maxTargets, airOk, b);
    hits.forEach((e, i) => {
      const mul = i === 0 ? prof.firstMul : 1;
      hurt(run, b, map, e, st.dmg * mul, type, status.pen, false, tower, 1, extraFrom(prof, b, e.kind), st.xpMul);
    });
    const far = hits.length ? enemyPos(map, hits[hits.length - 1]) : enemyPos(map, aim);
    pushFx(run, { x: origin.x, y: origin.y, x2: far.x, y2: far.y, text: "", ttl: 0.1, color: TOWER_COLOR[tower.kind], kind: "beam" });
    return true;
  }

  if (tower.kind === "arc") {
    const seen = new Set<number>([aim.id]);
    const first = st.dmg * prof.firstMul;
    hurt(run, b, map, aim, first, type, status.pen, false, tower, 1, status, st.xpMul);
    chain(run, b, map, tower, aim, first, prof.jumps, prof.jumpKeep, prof.jumpRange, type, status, st.xpMul, seen);
    return true;
  }

  if (tower.kind === "chill") {
    hurt(run, b, map, aim, st.dmg, type, status.pen, false, tower, 1, status, st.xpMul);
    if (prof.spread > 0) {
      const p = enemyPos(map, aim);
      for (const e of run.enemies) {
        if (!e.alive || e.id === aim.id) continue;
        const q = enemyPos(map, e);
        if (Math.hypot(q.x - p.x, q.y - p.y) <= prof.spread) {
          const stt = extraFrom(prof, b, e.kind);
          hurt(run, b, map, e, st.dmg * 0.6, type, stt.pen, false, tower, 1, stt, st.xpMul);
        }
      }
    }
    return true;
  }

  if (tower.kind === "venom") {
    hurt(run, b, map, aim, st.dmg, type, status.pen, true, tower, 1, status, st.xpMul);
    if (prof.cloud) {
      const p = enemyPos(map, aim);
      for (const e of run.enemies) {
        if (!e.alive || e.id === aim.id) continue;
        const q = enemyPos(map, e);
        if (Math.hypot(q.x - p.x, q.y - p.y) <= 0.6) {
          const stt = extraFrom(prof, b, e.kind);
          stt.poison *= 0.5;
          hurt(run, b, map, e, st.dmg * 0.4, type, stt.pen, true, tower, 1, stt, st.xpMul);
        }
      }
    }
    return true;
  }

  const shot = (enemy: Enemy, mul: number) => {
    const ex = extraFrom(prof, b, enemy.kind);
    launch(run, tower, enemy, map, st.dmg * mul, type, ex, prof.splash, airOk, tower.kind === "bolt" || tower.kind === "needle");
  };
  shot(aim, prof.firstMul);
  if (prof.twinChance > 0 && rand(run) < prof.twinChance) shot(aim, 0.7);
  if (prof.pair) {
    const other = list.find((e) => e.id !== aim.id);
    if (other) shot(other, 0.8);
  }
  if (tower.kind === "swarm") {
    const n = Math.max(1, prof.shots);
    if (prof.bunch) {
      for (let i = 1; i < n; i++) shot(aim, 0.8);
    } else {
      const falls = [1, 0.75, 0.55, 0.45, 0.4, 0.35];
      for (let i = 1; i < n; i++) {
        const e = list[i % list.length];
        shot(e, falls[Math.min(falls.length - 1, i)]);
      }
    }
  }
  return true;
}

function miners(run: Run, b: Bonuses, map: MapDef, dt: number): void {
  for (const tower of run.towers) {
    if (tower.kind !== "miner") continue;
    const prof = profileOf(tower, b);
    const st = statsOf(tower, null, b, 0);
    const every = (6 / (1 + b.miner)) * prof.intervalMul;
    tower.cd -= dt;
    if (tower.cd > 0) continue;
    let amount = (1 + b.minerAbyss) * prof.extractMul + prof.flatVein;
    if (prof.veinChance > 0 && rand(run) < prof.veinChance) amount += 1;
    const whole = Math.max(1, Math.round(amount));
    run.mined += whole;
    grantXp(tower, 8 * whole * st.xpMul);
    if (prof.sparkChance > 0 && run.time >= tower.sparkLock && rand(run) < prof.sparkChance) {
      run.pendingSparks += 1;
      tower.sparkLock = run.time + 20;
    }
    tower.cd += every;
    pushFx(run, { x: tower.x + 0.5, y: tower.y + 0.2, x2: 0, y2: 0, text: `+${whole}`, ttl: 0.8, color: "#d8b15a", kind: "num" });
  }
}

function moveEnemies(run: Run, b: Bonuses, map: MapDef, dt: number): void {
  for (const e of run.enemies) {
    if (!e.alive) continue;
    const xpMul = 1;
    if (e.poisonUntil > run.time && e.poisonDps > 0) {
      const src = run.towers.find((t) => t.id === e.poisonFrom) ?? null;
      hurt(run, b, map, e, e.poisonDps * dt, "poison", b.knowPen[e.kind], true, src, 1, null, src ? statsOf(src, modAt(map, run, src.x, src.y), b, 0).xpMul : xpMul);
    }
    if (!e.alive) continue;
    if (e.fireUntil > run.time && e.fireDps > 0) {
      const src = run.towers.find((t) => t.id === e.fireFrom) ?? null;
      hurt(run, b, map, e, e.fireDps * dt, "fire", b.knowPen[e.kind], false, src, 1, null, src ? statsOf(src, modAt(map, run, src.x, src.y), b, 0).xpMul : 1);
    }
    if (!e.alive) continue;
    if (e.bleedUntil > run.time && e.bleedDps > 0) {
      const src = run.towers.find((t) => t.id === e.bleedFrom) ?? null;
      hurt(run, b, map, e, e.bleedDps * dt, "phys", b.knowPen[e.kind], true, src, 1, null, src ? statsOf(src, modAt(map, run, src.x, src.y), b, 0).xpMul : 1);
    }
    if (!e.alive) continue;
    if (e.kind === "healer" && run.time >= e.muteUntil) {
      e.healerCd -= dt;
      if (e.healerCd <= 0) {
        e.healerCd = 2.4;
        let best: Enemy | null = null;
        let ratio = 1;
        const p = enemyPos(map, e);
        for (const o of run.enemies) {
          if (!o.alive || o.id === e.id || o.hp >= o.maxHp) continue;
          const q = enemyPos(map, o);
          if (Math.hypot(q.x - p.x, q.y - p.y) > 1.7) continue;
          const r = o.hp / o.maxHp;
          if (r < ratio) { ratio = r; best = o; }
        }
        if (best) best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.07);
      }
    }
    if (e.kind === "caller") {
      e.callerCd -= dt;
      if (e.callerCd <= 0) {
        e.callerCd = 4.2;
        let kids = 0;
        for (const o of run.enemies) if (o.alive && o.parent === e.id) kids++;
        if (kids < 4) spawnKind(run, b, map, "thrall", e.route, e.wave, e.progress - 0.55, false, e.id);
      }
    }
    let speed = ENEMY_BASE[e.kind].speed;
    if (e.kind === "boss" && e.phased2) speed *= 1.22;
    if (run.time < e.stunUntil || run.time < e.freezeUntil) speed = 0;
    else if (run.time < e.slowUntil) speed *= 1 - Math.min(0.85, e.slowPct);
    e.progress += speed * dt;
    const route = (e.air ? map.air : map.ground)[e.route];
    if (route && e.progress >= route.length) {
      e.alive = false;
      run.leaks++;
      run.hearts -= ENEMY_BASE[e.kind].leak;
      const p = enemyPos(map, e);
      pushFx(run, { x: p.x, y: p.y, x2: p.x, y2: p.y, text: `−${ENEMY_BASE[e.kind].leak}`, ttl: 0.8, color: "#ff6a8a", kind: "num" });
    }
  }
}

function flyProjs(run: Run, b: Bonuses, map: MapDef, dt: number): void {
  const next: Proj[] = [];
  for (const proj of run.projs) {
    const tower = run.towers.find((t) => t.id === proj.towerId) ?? null;
    const xpMul = tower ? statsOf(tower, modAt(map, run, tower.x, tower.y), b, 0).xpMul : 1;
    if (proj.homing) {
      const e = run.enemies.find((x) => x.id === proj.enemyId && x.alive);
      if (e) {
        const q = enemyPos(map, e);
        proj.destX = q.x;
        proj.destY = q.y;
      }
    }
    const dx = proj.destX - proj.x;
    const dy = proj.destY - proj.y;
    const dist = Math.hypot(dx, dy);
    const step = PROJ_SPEED * dt;
    proj.ttl -= dt;
    if (dist <= step || proj.ttl <= 0) {
      if (!tower) continue;
      if (proj.splash > 0) {
        splashHurt(run, b, map, tower, proj.destX, proj.destY, proj.dmg, proj.dmgType, proj.splash, proj.edge, proj.air, proj.extra, xpMul, proj.extra.pen);
        if (proj.extra.cluster) {
          const near = run.enemies.filter((e) => e.alive).map((e) => ({ e, d: Math.hypot(enemyPos(map, e).x - proj.destX, enemyPos(map, e).y - proj.destY) }))
            .filter((x) => x.d > 0.05 && x.d < proj.extra.jumpRange + 2)
            .sort((a, c) => a.d - c.d)
            .slice(0, 2);
          for (const n of near) hurt(run, b, map, n.e, proj.dmg * 0.4, proj.dmgType, proj.extra.pen, false, tower, 1, proj.extra, xpMul);
        }
      } else {
        const e = run.enemies.find((x) => x.id === proj.enemyId && x.alive);
        if (e) hurt(run, b, map, e, proj.dmg, proj.dmgType, proj.extra.pen, proj.dmgType === "poison", tower, 1, proj.extra, xpMul);
      }
      if (proj.extra.bounce && !proj.bounced && tower) {
        const near = run.enemies.filter((e) => e.alive && e.id !== proj.enemyId);
        let best: Enemy | null = null;
        let bd = 1.5;
        for (const e of near) {
          const q = enemyPos(map, e);
          const d = Math.hypot(q.x - proj.destX, q.y - proj.destY);
          if (d <= bd && (!e.air || proj.air)) { bd = d; best = e; }
        }
        if (best) hurt(run, b, map, best, proj.dmg * 0.6, proj.dmgType, proj.extra.pen, false, tower, 1, proj.extra, xpMul);
      }
      continue;
    }
    proj.x += (dx / dist) * step;
    proj.y += (dy / dist) * step;
    next.push(proj);
  }
  run.projs = next;
}

export function callWave(run: Run): Act {
  if (run.outcome !== "play") return fail("Ночь уже кончилась.");
  const map = mapById(run.mapId);
  if (!map) return fail("Нет такой ночи.");
  const goal = run.endless ? 1_000_000 : map.waves;
  if (run.scheduled >= goal) return fail("Волны этой ночи уже вышли.");
  if (run.queue.length) return fail("Волна ещё выходит из портала.");
  run.nextWaveAt = run.time;
  return ok();
}

function enqueue(run: Run, map: MapDef): void {
  const goal = run.endless ? 1_000_000 : map.waves;
  if (run.scheduled >= goal || run.time < run.nextWaveAt || run.queue.length) return;
  const wave = run.scheduled + 1;
  const plan = wavePlan(map.difficulty, wave, run.endless, map.waves);
  let at = run.time;
  let i = 0;
  for (const g of plan) {
    for (let n = 0; n < g.count; n++) {
      run.queue.push({ kind: g.kind, spawn: map.spawns.length ? i % map.spawns.length : 0, at, wave });
      at += releaseGap(g.kind, wave);
      i++;
    }
  }
  run.scheduled = wave;
  run.nextWaveAt = at + 3.2;
}

function routeCrowded(run: Run, route: number, air: boolean): boolean {
  return run.enemies.some((e) => e.alive && e.route === route && e.air === air && e.progress < PATH_GAP);
}

function drainQueue(run: Run, b: Bonuses, map: MapDef): void {
  const keep: Run["queue"] = [];
  for (const q of run.queue) {
    if (q.at > run.time) { keep.push(q); continue; }
    const air = q.kind === "flyer";
    if (routeCrowded(run, q.spawn, air)) {
      q.at = run.time + 0.12;
      keep.push(q);
      continue;
    }
    spawnKind(run, b, map, q.kind, q.spawn, q.wave, 0, air);
  }
  keep.sort((a, c) => a.at - c.at);
  run.queue = keep;
}

function bank(run: Run, meta: Meta, b: Bonuses, map: MapDef): void {
  if (run.rewarded) return;
  const stars = starCount(run.outcome, run.endless, Math.max(0, run.hearts), run.maxHearts, run.leaks);
  const reward = rewardAmounts(run.outcome, run.endless, map.difficulty, stars, run.wavesCleared, run.bossKilled, run.mined, b);
  reward.sparks += run.pendingSparks;
  run.reward = { ...reward, stars };
  run.rewarded = true;
  meta.sparks += reward.sparks;
  meta.ash += reward.ash;
  meta.vein += reward.vein;
  if (!run.endless && run.outcome === "win") meta.stars[map.id] = Math.max(meta.stars[map.id] ?? 0, stars);
  if (run.endless) meta.endlessBest[map.id] = Math.max(meta.endlessBest[map.id] ?? 0, run.wavesCleared);
}

function noteClears(run: Run, meta: Meta, b: Bonuses): void {
  let c = 0;
  for (let w = 1; w <= run.scheduled; w++) {
    const pending = run.queue.some((q) => q.wave === w) || run.enemies.some((e) => e.alive && e.wave === w);
    if (pending) break;
    c = w;
  }
  while (run.wavesCleared < c && run.outcome === "play") {
    run.wavesCleared++;
    const g = waveGold(run.wavesCleared, b.gold) + interestGold(run.gold, b.interest);
    run.gold += g;
    run.goldEarned += g;
  }
  if (run.endless) meta.endlessBest[run.mapId] = Math.max(meta.endlessBest[run.mapId] ?? 0, run.wavesCleared);
}

export function beginRun(meta: Meta, mapId: string, endless: boolean, seed = 1): Run | null {
  const map = mapById(mapId);
  if (!map) return null;
  const b = compile(meta);
  const rng = (seed >>> 0) || 1;
  const run: Run = {
    mapId, endless, seed: rng, rng, time: 0,
    gold: 90 + b.startGold + map.goldBonus,
    goldEarned: 0,
    hearts: 20 + b.hearts + map.heartBonus,
    maxHearts: 20 + b.hearts + map.heartBonus,
    towers: [], enemies: [], projs: [], mods: {}, stamps: 0, nextId: 1,
    scheduled: 0, nextWaveAt: 0.35, queue: [], mined: 0, pendingSparks: 0,
    leaks: 0, kills: 0, bossKilled: false, outcome: "play", wavesCleared: 0,
    rewarded: false, reward: null, fx: [], placedCombat: false,
    abilityCd: { fire: 0, bliz: 0, dawn: 0 }, aim: null,
  };
  run.goldEarned = 0;
  return run;
}

export function placeTower(run: Run, meta: Meta, x: number, y: number, kind: TowerKind): Act {
  if (run.outcome !== "play") return fail("Ночь уже кончилась.");
  const map = mapById(run.mapId);
  if (!map) return fail("Нет такой ночи.");
  const b = compile(meta);
  if (!b.unlocked[kind]) return fail(`${TOWER_NAME[kind]} ещё не открыта в древе.`);
  const ch = cellChar(map, x, y);
  if (kind === "miner") {
    if (ch !== "v") return fail("Жильник ставится только на жилу.");
  } else if (!tileBuildable(ch, "tower")) return fail("Здесь нельзя строить.");
  if (run.towers.some((t) => t.x === x && t.y === y)) return fail("Клетка занята.");
  let cost = TOWERS[kind].cost;
  if (kind !== "miner" && !run.placedCombat) cost = Math.max(1, Math.ceil(cost * (1 - b.discount)));
  if (run.gold < cost) return fail("Не хватает золота.");
  run.gold -= cost;
  if (kind !== "miner") run.placedCombat = true;
  const prof = profileOf({ abilities: [], upgraded: null, kind } as unknown as Tower, b);
  const every = kind === "miner" ? (6 / (1 + b.miner)) * prof.intervalMul : 0.2;
  run.towers.push({
    id: run.nextId++, kind, x, y, xp: 0, spent: cost, ranks: { dmg: 0, rate: 0, range: 0 },
    abilities: [], offer: null, upgraded: null, cd: every, target: "first", sparkLock: 0, kills: 0, dealt: 0,
  });
  return ok();
}

export function upgradeTower(run: Run, meta: Meta, id: number, stat: "dmg" | "rate" | "range"): Act {
  if (run.outcome !== "play") return fail("Ночь уже кончилась.");
  const tower = run.towers.find((t) => t.id === id);
  if (!tower) return fail("Башня не найдена.");
  if (tower.kind === "miner") return fail("У жильника нет боевых рангов. Его растят опытом и древом.");
  if (tower.ranks[stat] >= RANK_MAX) return fail("Ранг максимальный.");
  const cost = Math.ceil(TOWERS[tower.kind].cost * 1.5 ** tower.ranks[stat]);
  if (run.gold < cost) return fail("Не хватает золота.");
  run.gold -= cost;
  tower.spent += cost;
  tower.ranks[stat]++;
  void meta;
  return ok();
}

export function sellTower(run: Run, meta: Meta, id: number): Act {
  if (run.outcome !== "play") return fail("Ночь уже кончилась.");
  const i = run.towers.findIndex((t) => t.id === id);
  if (i < 0) return fail("Башня не найдена.");
  const b = compile(meta);
  const tower = run.towers[i];
  const refund = Math.min(tower.spent, Math.floor(tower.spent * Math.min(0.9, 0.7 + b.sell)));
  run.gold += refund;
  run.towers.splice(i, 1);
  return ok();
}

export function cycleTarget(run: Run, id: number): Act {
  const tower = run.towers.find((t) => t.id === id);
  if (!tower) return fail("Башня не найдена.");
  const order: Tower["target"][] = ["first", "last", "strong", "near"];
  tower.target = order[(order.indexOf(tower.target) + 1) % order.length];
  return ok();
}

export function chooseAbility(run: Run, id: number, pick: string): Act {
  const tower = run.towers.find((t) => t.id === id);
  if (!tower) return fail("Башня не найдена.");
  if (!tower.offer || !tower.offer.includes(pick)) return fail("Этого умения нет в выборе.");
  if (pick.startsWith("up:")) {
    const aid = pick.slice(3);
    if (!tower.abilities.includes(aid)) return fail("Сначала возьмите умение.");
    tower.upgraded = aid;
  } else {
    if (tower.abilities.includes(pick)) return fail("Умение уже взято.");
    tower.abilities.push(pick);
  }
  tower.offer = null;
  checkOffers(tower);
  return ok();
}

export function placeStamp(run: Run, meta: Meta, x: number, y: number, mod: ModKind): Act {
  if (run.outcome !== "play") return fail("Ночь уже кончилась.");
  const map = mapById(run.mapId);
  if (!map) return fail("Нет такой ночи.");
  const b = compile(meta);
  if (run.stamps >= b.stamps) return fail("Клейма на эту ночь кончились. Их открывает древо.");
  if (cellChar(map, x, y) !== ".") return fail("Клеймо ложится только на пустырь.");
  if (run.mods[keyOf(x, y)] || modAt(map, run, x, y)) return fail("На клетке уже есть плитка.");
  if (run.gold < STAMP_COST) return fail("Не хватает золота.");
  run.gold -= STAMP_COST;
  run.mods[keyOf(x, y)] = mod;
  run.stamps++;
  return ok();
}

export function castAbility(run: Run, meta: Meta, id: GlobalId, x: number, y: number): Act {
  if (run.outcome !== "play") return fail("Ночь уже кончилась.");
  const map = mapById(run.mapId);
  if (!map) return fail("Нет такой ночи.");
  const b = compile(meta);
  if (id === "fire" && !b.abFire) return fail("Пожар ещё не открыт в древе.");
  if (id === "bliz" && !b.abBliz) return fail("Буран ещё не открыт в древе.");
  if (id === "dawn" && !b.abDawn) return fail("Удар зари ещё не открыт в древе.");
  if (run.abilityCd[id] > 0) return fail(`Перезарядка: ${run.abilityCd[id].toFixed(1)} с.`);
  const radMul = 1.12 ** Math.min(3, b.radiusSteps);
  if (id === "bliz") {
    const dur = 4.2 + b.blizTime;
    for (const e of run.enemies) {
      if (!e.alive) continue;
      e.slowPct = Math.max(e.slowPct, 0.4);
      e.slowUntil = Math.max(e.slowUntil, run.time + dur);
    }
    run.abilityCd.bliz = abilityCd(46, b.cdSteps);
    return ok();
  }
  const radius = (id === "fire" ? 2.2 : 1.9) * radMul;
  const dmg = id === "fire" ? 36 * (1 + b.firePower) : 120 * (1 + b.dawnPower);
  const type: DmgType = id === "fire" ? "fire" : "blast";
  const resistMul = id === "dawn" ? 0.6 : 1;
  let hit = 0;
  for (const e of run.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(map, e);
    if (Math.hypot(p.x - x, p.y - y) > radius) continue;
    e.revealedUntil = Math.max(e.revealedUntil, run.time + 1.5);
    hurt(run, b, map, e, dmg, type, b.knowPen[e.kind], false, null, resistMul, null, 1);
    hit++;
  }
  pushFx(run, { x, y, x2: x, y2: y, text: "", ttl: 0.45, color: id === "fire" ? "#ff6a1a" : "#ffe9a8", kind: "boom" });
  run.abilityCd[id] = abilityCd(id === "fire" ? 42 : 78, b.cdSteps);
  if (!hit) return ok();
  return ok();
}

export function endRun(run: Run, meta: Meta): void {
  if (run.outcome !== "play") return;
  const map = mapById(run.mapId);
  if (!map) return;
  run.outcome = "lose";
  bank(run, meta, compile(meta), map);
}

export function stepRun(run: Run, meta: Meta, dt: number): void {
  if (run.outcome !== "play" || !(dt > 0)) return;
  const map = mapById(run.mapId);
  if (!map) return;
  const b = compile(meta);
  run.time += dt;
  run.abilityCd.fire = Math.max(0, run.abilityCd.fire - dt);
  run.abilityCd.bliz = Math.max(0, run.abilityCd.bliz - dt);
  run.abilityCd.dawn = Math.max(0, run.abilityCd.dawn - dt);
  for (const f of run.fx) f.ttl -= dt;
  run.fx = run.fx.filter((f) => f.ttl > 0);
  miners(run, b, map, dt);
  moveEnemies(run, b, map, dt);
  if (run.hearts <= 0) {
    run.hearts = 0;
    run.outcome = "lose";
    noteClears(run, meta, b);
    bank(run, meta, b, map);
    return;
  }
  enqueue(run, map);
  drainQueue(run, b, map);
  const sanct = new Map<number, number>();
  const halos = run.towers.filter((t) => t.kind === "halo" && t.abilities.includes("sanctuary"));
  if (halos.length) {
    for (const t of run.towers) {
      let best = 0;
      for (const h of halos) {
        if (h.id === t.id) continue;
        const range = statsOf(h, modAt(map, run, h.x, h.y), b, 0).range;
        const dx = h.x - t.x;
        const dy = h.y - t.y;
        if (dx * dx + dy * dy <= range * range) best = Math.max(best, profileOf(h, b).sanctuary);
      }
      if (best > 0) sanct.set(t.id, best);
    }
  }
  for (const tower of run.towers) {
    if (tower.kind === "miner") continue;
    const mod = modAt(map, run, tower.x, tower.y);
    const rate = statsOf(tower, mod, b, sanct.get(tower.id) ?? 0).rate;
    tower.cd -= dt;
    let guard = 0;
    while (tower.cd <= 0 && guard++ < 6) {
      const fired = fireTower(run, b, map, tower, sanct.get(tower.id) ?? 0);
      if (!fired) { tower.cd = 0.12; break; }
      tower.cd += 1 / Math.max(0.05, rate);
    }
  }
  flyProjs(run, b, map, dt);
  run.enemies = run.enemies.filter((e) => e.alive);
  noteClears(run, meta, b);
  if (run.hearts <= 0) {
    run.hearts = 0;
    run.outcome = "lose";
    bank(run, meta, b, map);
    return;
  }
  if (!run.endless && run.scheduled >= map.waves && run.queue.length === 0 && run.enemies.length === 0) {
    run.outcome = "win";
    bank(run, meta, b, map);
  }
}

export function simulate(run: Run, meta: Meta, seconds: number, dt = 0.1): void {
  let left = seconds;
  while (left > 0 && run.outcome === "play") {
    const step = Math.min(dt, left);
    stepRun(run, meta, step);
    left -= step;
  }
}

export function debugSpawn(run: Run, meta: Meta, kind: EnemyKind, progress = 0): Enemy | null {
  const map = mapById(run.mapId);
  if (!map) return null;
  const b = compile(meta);
  return spawnKind(run, b, map, kind, 0, Math.max(1, run.scheduled || 1), Math.max(0, progress), kind === "flyer");
}
