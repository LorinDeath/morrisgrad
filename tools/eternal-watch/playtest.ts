// Скриптовый игрок второй ночи. node --experimental-strip-types tools/eternal-watch/playtest.ts
import {
  MAPS, TOWERS, along, beginRun, buyNode, chooseAbility, compile, enemyHp, freshMeta, mapById,
  placeTower, researchCount, stepRun, upgradeTower, wavePlan,
  type EnemyKind, type Meta, type Run, type TowerKind,
} from "../../src/scripts/eternal-watch/logic.ts";

const PREF: Record<TowerKind, string[]> = {
  spark: ["sting", "twin", "mercy", "tempo", "sparkle"],
  needle: ["puncture", "headshot", "steady", "mark", "glass"],
  muzzle: ["crater", "napalm", "cluster", "quick", "heavy"],
  chill: ["deep", "spread", "brittle", "shatter", "longer"],
  venom: ["plague", "melt", "burst", "sticky", "cloud"],
  arc: ["fork", "silence", "overload", "livearc", "longarc"],
  beam: ["spear", "burn", "wide", "dawn", "focus"],
  bolt: ["breaker", "wideblast", "pair", "liquid", "farther"],
  blaze: ["reach", "inferno", "fan", "oil", "embers"],
  halo: ["eye", "pulse", "sanctuary", "ward", "storm"],
  awl: ["rail", "sunder", "bleed", "fast", "slug"],
  swarm: ["extra", "sky", "rapid", "bunch", "bounce"],
  miner: ["mdeep", "mstock", "mrich", "mhaste", "mspark"],
};

const BUY: [string, number][] = [
  ["muzzle.root", 1],
  ["econ.purse", 2],
  ["spark.dmg1", 3],
  ["muzzle.dmg1", 3],
  ["chill.root", 1],
  ["gate.hearts", 2],
  ["econ.gold", 2],
  ["bolt.root", 1],
  ["venom.root", 1],
  ["halo.root", 1],
  ["needle.root", 1],
  ["spark.rate1", 2],
  ["muzzle.rate1", 2],
  ["muzzle.special", 2],
  ["bolt.dmg1", 2],
  ["chill.dmg1", 2],
  ["venom.dmg1", 2],
  ["halo.dmg1", 2],
  ["swarm.root", 1],
  ["blaze.root", 1],
  ["arc.root", 1],
  ["miner.root", 1],
  ["econ.spark", 2],
  ["spark.dmg1", 5],
  ["muzzle.dmg1", 5],
  ["needle.dmg1", 3],
  ["codex.root", 1],
  ["codex.knight", 2],
  ["codex.flyer", 2],
  ["codex.shade", 2],
  ["beam.root", 1],
  ["awl.root", 1],
  ["econ.discount", 1],
  ["gate.hearts", 4],
  ["ab.fire", 1],
  ["ab.bliz", 1],
];

function spend(meta: Meta): string[] {
  const got: string[] = [];
  let guard = 0;
  while (guard++ < 40) {
    let bought = false;
    for (const [id, level] of BUY) {
      if ((meta.nodes[id] ?? 0) >= level) continue;
      const res = buyNode(meta, id);
      if (res.ok) { got.push(id); bought = true; break; }
    }
    if (!bought) break;
  }
  return got;
}

function cover(mapId: string, towers: Run["towers"], x: number, y: number, range: number, air: boolean): number {
  const map = mapById(mapId)!;
  const routes = air ? [...map.ground, ...map.air] : map.ground;
  let s = 0;
  for (const route of routes) {
    let fresh = 0;
    let hit = 0;
    for (let p = 0; p <= route.length; p += 0.8) {
      const q = along(route, p);
      const dx = q.x - (x + 0.5);
      const dy = q.y - (y + 0.5);
      if (dx * dx + dy * dy > range * range) continue;
      hit++;
      const taken = towers.some((t) => {
        if (t.kind === "miner") return false;
        const reach = t.kind === "needle" || t.kind === "beam" || t.kind === "awl" || t.kind === "bolt" ? 4.6 : t.kind === "halo" || t.kind === "blaze" ? 2.1 : 3.1;
        return (q.x - t.x - 0.5) ** 2 + (q.y - t.y - 0.5) ** 2 <= reach * reach;
      });
      if (!taken) fresh++;
    }
    s += fresh * 4 + hit;
  }
  return s;
}

function threats(mapId: string): Set<EnemyKind> {
  const map = mapById(mapId)!;
  const set = new Set<EnemyKind>();
  for (let n = 1; n <= map.waves; n++) for (const g of wavePlan(map.difficulty, n, false, map.waves)) set.add(g.kind);
  return set;
}

function desired(run: Run, meta: Meta): TowerKind[] {
  const b = compile(meta);
  const th = threats(run.mapId);
  const have = (k: TowerKind) => run.towers.filter((t) => t.kind === k).length;
  const out: TowerKind[] = [];
  const push = (k: TowerKind, n: number) => { if (b.unlocked[k] && have(k) < n) out.push(k); };
  push("muzzle", 2);
  push("spark", 2);
  if (th.has("flyer")) push("bolt", 3);
  if (th.has("shade")) push("halo", 2);
  if (th.has("knight") || th.has("boss")) push("needle", 2);
  if (th.has("healer")) push("arc", 1);
  push("muzzle", 6);
  push("chill", 2);
  if (th.has("knight") || th.has("boss")) push("venom", 2);
  push("spark", 4);
  push("swarm", 2);
  push("blaze", 2);
  push("beam", 2);
  if (th.has("flyer")) push("bolt", 5);
  push("awl", 1);
  if (b.unlocked.miner) push("miner", 3);
  return out;
}

function think(run: Run, meta: Meta): void {
  for (const t of run.towers) {
    if (!t.offer?.length) continue;
    const want = PREF[t.kind];
    const pick = t.offer.find((id) => want.includes(id.startsWith("up:") ? id.slice(3) : id)) ?? t.offer[0];
    chooseAbility(run, t.id, pick);
  }
  const map = mapById(run.mapId)!;
  const order = desired(run, meta);
  let placed = 0;
  for (const kind of order) {
    if (run.gold < TOWERS[kind].cost) continue;
    let best: { x: number; y: number; s: number } | null = null;
    const range = kind === "needle" ? 5 : kind === "halo" ? 1.8 : kind === "miner" ? 0 : kind === "blaze" ? 2.2 : 3.3;
    const air = kind === "bolt" || kind === "halo" || kind === "beam" || kind === "swarm";
    const buildable = new Set([".", "+", "*", "~", "^", "$"]);
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
      if (run.towers.some((t) => t.x === x && t.y === y)) continue;
      const ch = map.grid[y][x];
      if (kind === "miner") { if (ch !== "v") continue; }
      else if (!buildable.has(ch)) continue;
      const s = kind === "miner" ? 5 : cover(run.mapId, run.towers, x, y, range, air);
      if (s <= 0) continue;
      if (!best || s > best.s) best = { x, y, s };
    }
    if (!best) continue;
    if (placeTower(run, meta, best.x, best.y, kind).ok) placed++;
  }
  let open = 0;
  const combat = new Set([".", "+", "*", "~", "^", "$"]);
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    if (!combat.has(map.grid[y][x])) continue;
    if (!run.towers.some((t) => t.x === x && t.y === y)) open++;
  }
  if ((open === 0 || run.gold > 240) && run.gold > 40) {
    const ups = run.towers.filter((t) => t.kind !== "miner" && t.ranks.dmg < 6);
    ups.sort((a, c) => a.ranks.dmg - c.ranks.dmg);
    if (ups[0]) upgradeTower(run, meta, ups[0].id, "dmg");
  }
}

function play(meta: Meta, mapId: string, endlessCap = 0): Run {
  const run = beginRun(meta, mapId, endlessCap > 0, 7 + mapId.length)!;
  let guard = 0;
  while (run.outcome === "play" && guard++ < 20000) {
    if (Math.floor(run.time * 2) !== Math.floor((run.time - 0.5) * 2)) think(run, meta);
    stepRun(run, meta, 0.5);
    if (endlessCap && run.wavesCleared >= endlessCap) break;
  }
  return run;
}

function report(label: string, run: Run): void {
  console.log(
    `${label} ${run.mapId} ${run.outcome} волны ${run.wavesCleared}/${run.scheduled} сердца ${Math.max(0, run.hearts)}/${run.maxHearts} прорывы ${run.leaks} башни ${run.towers.length} золото ${Math.floor(run.gold)}`,
  );
}

const meta = freshMeta();
console.log("узлов в древе", researchCount());
let stars = 0;
let lostAt = "";
for (const map of MAPS) {
  const got = spend(meta);
  const run = play(meta, map.id);
  report(got.length ? `покупки ${got.length}` : "без покупок", run);
  if (run.outcome !== "win") { lostAt = map.id; break; }
  stars += run.reward?.stars ?? 0;
}
console.log("кампания", lostAt ? `стоп на ${lostAt}` : "все 24", "звёзды", stars, "искры", meta.sparks, "пепел", meta.ash, "руда", meta.vein);

const bare = freshMeta();
const late = play(bare, "sky");
report("без древа", late);

const rich = freshMeta();
rich.sparks = 400;
rich.ash = 20;
rich.vein = 40;
spend(rich);
const endRich = play(rich, "spark-path", 28);
const endBare = play(freshMeta(), "spark-path", 28);
console.log("бесконечная с древом", endRich.wavesCleared, "без древа", endBare.wavesCleared);
const hp = [1, 5, 10, 15, 20, 25, 30].map((n) => Math.round(enemyHp("walker", n, 1, true, 0)));
console.log("здоровье пехоты бесконечной", hp.join(" → "));
const ratios = hp.slice(1).map((v, i) => (v / hp[i]).toFixed(2));
console.log("отношение соседних отметок", ratios.join(" "));
