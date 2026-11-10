// Сохранение меты. Ключ v1 не перезаписывается. Битый JSON не роняет игру.
import { MAPS, mapById } from "./maps.ts";
import { nodeById } from "./research.ts";
import { ABILITY_BY_ID, TOWER_KINDS, freshMeta, type EnemyKind, type Meta, type ModKind, type Run, type TargetMode, type TowerKind } from "./types.ts";

const MODS = new Set<ModKind>(["dmg", "range", "rate", "xp", "bounty"]);
const TARGETS = new Set<TargetMode>(["first", "last", "strong", "near"]);
const KINDS = new Set<string>(TOWER_KINDS);
const ENEMIES = new Set<string>([
  "walker", "runner", "knight", "healer", "splitter", "shield", "flyer", "shade", "caller", "boss", "mite", "thrall",
]);

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function v1Sparks(raw: string | null): number {
  if (!raw) return 0;
  try {
    const data = JSON.parse(raw) as { sparks?: unknown };
    const n = num(data?.sparks, NaN);
    if (!Number.isFinite(n) || n <= 0 || n > 1e9) return 0;
    return Math.floor(n);
  } catch {
    return 0;
  }
}

function applyV1(meta: Meta, v1raw: string | null): void {
  if (meta.v1Bonus) return;
  const sparks = v1Sparks(v1raw);
  meta.v1Bonus = true;
  if (sparks > 0) meta.sparks += Math.min(80, Math.floor(sparks * 0.5));
}

function sanitizeRun(value: unknown): Run | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<Run>;
  const map = typeof r.mapId === "string" ? mapById(r.mapId) : null;
  if (!map) return null;
  const run = r as Run;
  run.mapId = map.id;
  run.endless = !!r.endless;
  run.seed = Math.max(1, Math.floor(num(r.seed, 1)));
  run.rng = Math.max(1, Math.floor(num(r.rng, run.seed)));
  run.time = Math.max(0, num(r.time));
  run.gold = Math.max(0, num(r.gold));
  run.goldEarned = Math.max(0, num(r.goldEarned));
  run.maxHearts = Math.max(1, num(r.maxHearts, 20));
  run.hearts = Math.max(0, Math.min(run.maxHearts, num(r.hearts, run.maxHearts)));
  run.towers = Array.isArray(r.towers) ? r.towers.filter((t) => {
    if (!t || typeof t !== "object") return false;
    if (!KINDS.has(t.kind)) return false;
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) return false;
    if (t.x < 0 || t.y < 0 || t.x >= map.cols || t.y >= map.rows) return false;
    t.xp = Math.max(0, num(t.xp));
    t.spent = Math.max(0, num(t.spent));
    t.ranks = {
      dmg: Math.max(0, Math.min(6, Math.floor(num(t.ranks?.dmg)))),
      rate: Math.max(0, Math.min(6, Math.floor(num(t.ranks?.rate)))),
      range: Math.max(0, Math.min(6, Math.floor(num(t.ranks?.range)))),
    };
    t.abilities = Array.isArray(t.abilities) ? t.abilities.filter((id) => typeof id === "string" && !!ABILITY_BY_ID[id]) : [];
    t.offer = Array.isArray(t.offer) ? t.offer.filter((id) => typeof id === "string").slice(0, 4) : null;
    t.upgraded = typeof t.upgraded === "string" ? t.upgraded : null;
    t.cd = num(t.cd);
    t.target = TARGETS.has(t.target) ? t.target : "first";
    t.sparkLock = Math.max(0, num(t.sparkLock));
    t.kills = Math.max(0, Math.floor(num(t.kills)));
    t.dealt = Math.max(0, num(t.dealt));
    t.id = Math.floor(num(t.id, 1));
    return true;
  }) : [];
  const cleanEnemy = (e: Run["enemies"][number] | undefined): e is Run["enemies"][number] => {
    if (!e || typeof e !== "object") return false;
    if (!ENEMIES.has(e.kind)) return false;
    e.hp = num(e.hp);
    e.maxHp = Math.max(1, num(e.maxHp, 1));
    e.shield = Math.max(0, num(e.shield));
    e.armor = Math.max(0, num(e.armor));
    e.shred = Math.max(0, num(e.shred));
    e.shredUntil = Math.max(0, num(e.shredUntil));
    e.progress = Math.max(0, num(e.progress));
    e.route = Math.max(0, Math.min(map.ground.length - 1, Math.floor(num(e.route))));
    e.wave = Math.max(1, Math.floor(num(e.wave, 1)));
    e.alive = e.hp > 0 && e.alive !== false;
    e.id = Math.floor(num(e.id, 1));
    e.air = !!e.air;
    e.slowUntil = Math.max(0, num(e.slowUntil));
    e.slowPct = Math.max(0, num(e.slowPct));
    e.freezeUntil = Math.max(0, num(e.freezeUntil));
    e.frostStacks = Math.max(0, num(e.frostStacks));
    e.frostLock = Math.max(0, num(e.frostLock));
    e.poisonDps = Math.max(0, num(e.poisonDps));
    e.poisonUntil = Math.max(0, num(e.poisonUntil));
    e.poisonStacks = Math.max(0, num(e.poisonStacks));
    e.poisonFrom = Math.floor(num(e.poisonFrom));
    e.fireDps = Math.max(0, num(e.fireDps));
    e.fireUntil = Math.max(0, num(e.fireUntil));
    e.fireFrom = Math.floor(num(e.fireFrom));
    e.bleedDps = Math.max(0, num(e.bleedDps));
    e.bleedUntil = Math.max(0, num(e.bleedUntil));
    e.bleedFrom = Math.floor(num(e.bleedFrom));
    e.revealedUntil = Math.max(0, num(e.revealedUntil));
    e.muteUntil = Math.max(0, num(e.muteUntil));
    e.markUntil = Math.max(0, num(e.markUntil));
    e.markAmp = Math.max(0, num(e.markAmp));
    e.brittleUntil = Math.max(0, num(e.brittleUntil));
    e.shatterArmed = !!e.shatterArmed;
    e.phased2 = !!e.phased2;
    e.phased3 = !!e.phased3;
    e.fromSplit = !!e.fromSplit;
    e.parent = Math.floor(num(e.parent));
    e.healerCd = num(e.healerCd, 2.4);
    e.callerCd = num(e.callerCd, 4.2);
    e.stunUntil = Math.max(0, num(e.stunUntil));
    return Number.isFinite(e.hp);
  };
  run.enemies = Array.isArray(r.enemies) ? r.enemies.filter(cleanEnemy) : [];
  run.projs = [];
  run.fx = [];
  run.queue = Array.isArray(r.queue) ? r.queue.filter((q) => q && ENEMIES.has(q.kind) && Number.isFinite(q.at)).map((q) => ({
    kind: q.kind, spawn: Math.max(0, Math.floor(num(q.spawn))), at: Math.max(0, num(q.at)), wave: Math.max(1, Math.floor(num(q.wave, 1))),
  })) : [];
  run.mods = {};
  if (r.mods && typeof r.mods === "object") {
    for (const [k, v] of Object.entries(r.mods)) {
      if (MODS.has(v as ModKind)) run.mods[k] = v as ModKind;
    }
  }
  run.stamps = Math.max(0, Math.floor(num(r.stamps)));
  run.nextId = Math.max(1, Math.floor(num(r.nextId, 1)));
  run.scheduled = Math.max(0, Math.floor(num(r.scheduled)));
  run.nextWaveAt = Math.max(0, num(r.nextWaveAt));
  run.mined = Math.max(0, num(r.mined));
  run.pendingSparks = Math.max(0, Math.floor(num(r.pendingSparks)));
  run.leaks = Math.max(0, Math.floor(num(r.leaks)));
  run.kills = Math.max(0, Math.floor(num(r.kills)));
  run.bossKilled = !!r.bossKilled;
  run.outcome = r.outcome === "win" || r.outcome === "lose" ? r.outcome : "play";
  run.wavesCleared = Math.max(0, Math.floor(num(r.wavesCleared)));
  run.rewarded = !!r.rewarded;
  run.reward = null;
  run.placedCombat = !!r.placedCombat;
  run.abilityCd = {
    fire: Math.max(0, num(r.abilityCd?.fire)),
    bliz: Math.max(0, num(r.abilityCd?.bliz)),
    dawn: Math.max(0, num(r.abilityCd?.dawn)),
  };
  run.aim = r.aim === "fire" || r.aim === "bliz" || r.aim === "dawn" ? r.aim : null;
  return run;
}

function sanitize(data: unknown, v1raw: string | null): Meta {
  const meta = freshMeta();
  if (!data || typeof data !== "object") {
    applyV1(meta, v1raw);
    return meta;
  }
  const d = data as Partial<Meta>;
  meta.sparks = Math.max(0, Math.floor(num(d.sparks)));
  meta.ash = Math.max(0, Math.floor(num(d.ash)));
  meta.vein = Math.max(0, num(d.vein));
  meta.damageNumbers = d.damageNumbers !== false;
  meta.v1Bonus = !!d.v1Bonus;
  if (d.nodes && typeof d.nodes === "object") {
    for (const [id, lv] of Object.entries(d.nodes)) {
      const node = nodeById(id);
      if (!node) continue;
      const n = Math.floor(num(lv));
      if (n > 0) meta.nodes[id] = Math.min(node.max, n);
    }
  }
  const ids = new Set(MAPS.map((m) => m.id));
  if (d.stars && typeof d.stars === "object") {
    for (const [id, lv] of Object.entries(d.stars)) {
      if (!ids.has(id)) continue;
      meta.stars[id] = Math.max(0, Math.min(3, Math.floor(num(lv))));
    }
  }
  if (d.endlessBest && typeof d.endlessBest === "object") {
    for (const [id, lv] of Object.entries(d.endlessBest)) {
      if (!ids.has(id)) continue;
      meta.endlessBest[id] = Math.max(0, Math.floor(num(lv)));
    }
  }
  applyV1(meta, v1raw);
  meta.run = sanitizeRun(d.run);
  return meta;
}

export interface LoadResult { meta: Meta; persist: boolean }

export function loadMeta(v2raw: string | null, v1raw: string | null): LoadResult {
  if (v2raw == null || v2raw.trim() === "") return { meta: sanitize(null, v1raw), persist: true };
  try {
    const data = JSON.parse(v2raw) as { v?: unknown };
    if (!data || typeof data !== "object") return { meta: sanitize(null, v1raw), persist: true };
    if (data.v === 2) return { meta: sanitize(data, v1raw), persist: true };
    if (typeof data.v === "number") return { meta: sanitize(null, v1raw), persist: false };
    return { meta: sanitize(null, v1raw), persist: true };
  } catch {
    return { meta: sanitize(null, v1raw), persist: true };
  }
}

export function serializeMeta(meta: Meta): string {
  return JSON.stringify({ ...meta, v: 2 });
}

void (0 as unknown as EnemyKind);
