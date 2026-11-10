// Скриптовый игрок «Вечной стражи». node --experimental-strip-types tools/eternal-watch/playtest.ts
import {
  PATH_LEN,
  bankDawn,
  bankDefeat,
  beginNight,
  buyShop,
  canDawn,
  chooseGlyph,
  dawnMin,
  ensureLawOffer,
  freshMeta,
  lawSpec,
  padsFor,
  pathPose,
  placeTower,
  socketRune,
  stepRun,
  upgradeTower,
  type GlyphId,
  type LawId,
  type Meta,
  type Run,
  type TowerKind,
} from "../../src/scripts/eternal-watch/logic.ts";

const GLYPH: Partial<Record<TowerKind, GlyphId>> = {
  beam: "split", mortar: "crater", frost: "blizzard", spike: "saw", beacon: "bounty", chain: "surge", well: "tribute",
};
const LAW_RANK: LawId[] = ["narrow", "coldNight", "echoShot", "goldThirst", "generous", "freeBeacon", "secondRow", "quietBoss", "swarmFlame", "transfusion", "critSpark", "merge", "doubleSparks", "worldArmor", "endless"];

function think(run: Run, meta: Meta): void {
  for (const t of run.towers) {
    const g = GLYPH[t.kind];
    if (g && ((t.level >= 3 && t.glyphs.length === 0) || (t.awakened && t.glyphs.length < 2 && !t.glyphs.includes(g)))) chooseGlyph(run, t.id, g);
  }
  const open = padsFor(meta.extraPads, run.laws).filter((p) => !run.towers.some((t) => t.x === p.x && t.y === p.y));
  const cover = (x: number, y: number, range: number) => {
    let s = 0;
    for (let p = 0; p <= PATH_LEN; p += 0.5) {
      const q = pathPose(p);
      const dx = q.x - (x + 0.5);
      const dy = q.y - (y + 0.5);
      if (dx * dx + dy * dy <= range * range) s++;
    }
    return s;
  };
  for (let n = 0; n < 3 && run.towers.length < 26; n++) {
    const mortars = run.towers.filter((t) => t.kind === "mortar").length;
    const frosts = run.towers.filter((t) => t.kind === "frost").length;
    const beams = run.towers.filter((t) => t.kind === "beam").length;
    let kind: TowerKind | null = null;
    if (meta.chain && run.gold >= 90 && run.towers.filter((t) => t.kind === "chain").length < 2) kind = "chain";
    else if (run.gold >= 55 && mortars < 18) kind = "mortar";
    else if (run.gold >= 40 && beams < 4) kind = "beam";
    else if (run.gold >= 45 && frosts < Math.max(2, Math.floor(mortars / 4))) kind = "frost";
    else if (run.gold >= 70 && !run.towers.some((t) => t.kind === "beacon")) kind = "beacon";
    else if (meta.well && run.gold >= 80 && !run.towers.some((t) => t.kind === "well")) kind = "well";
    if (!kind) break;
    const range = kind === "mortar" ? 4 : kind === "beam" ? 3.2 : kind === "frost" ? 2.8 : kind === "beacon" ? 1.5 : 3;
    let best: { x: number; y: number; s: number } | null = null;
    for (const p of open) {
      if (run.towers.some((t) => t.x === p.x && t.y === p.y)) continue;
      let s = kind === "beacon"
        ? run.towers.filter((t) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y) === 1).length * 4
        : cover(p.x, p.y, range);
      for (const t of run.towers) if (t.kind === kind && Math.abs(t.x - p.x) + Math.abs(t.y - p.y) === 1) s += 5;
      if (!best || s > best.s) best = { x: p.x, y: p.y, s };
    }
    if (!best || best.s <= 0) break;
    if (!placeTower(run, meta, best.x, best.y, kind).ok) break;
  }
  if (run.gold > 90) {
    const ups = run.towers.filter((t) => t.level < 6 && (t.level < 3 || t.glyphs.length > 0) && (t.kind === "mortar" || t.kind === "beam" || t.kind === "chain"));
    ups.sort((a, b) => a.level - b.level);
    if (ups[0]) upgradeTower(run, ups[0].id);
  }
  if (run.bag.length) {
    const host = run.towers.filter((t) => t.runes.length < run.slots && t.kind !== "beacon").sort((a, b) => b.level - a.level)[0];
    if (host) {
      const order = ["pierce", "crit", "bossSlayer", "speed", "greed", "execute", "firstStrike"];
      let idx = 0;
      for (const id of order) {
        const at = run.bag.indexOf(id as never);
        if (at >= 0) { idx = at; break; }
      }
      socketRune(run, host.id, idx);
    }
  }
}

function shop(meta: Meta): void {
  const order = ["gold", "hearts", "discount", "rune2", "interest", "chain", "pads", "well", "rune3"] as const;
  for (let i = 0; i < 8; i++) {
    let did = false;
    for (const id of order) if (buyShop(meta, id, null).ok) { did = true; break; }
    if (!did) break;
  }
}

const meta = freshMeta();
for (let n = 1; n <= 3; n++) {
  const run = beginNight(meta, 4000 + n * 91);
  const t0 = Date.now();
  let last = -1;
  const cap = 55;
  let steps = 0;
  while (!run.defeated && run.cleared < cap && steps < 80000) {
    if (run.time - last > 0.3) { think(run, meta); last = run.time; }
    stepRun(run, meta, 0.05);
    steps++;
  }
  const reached = run.defeated ? run.wave : run.cleared;
  console.log(`Ночь ${n}: волна ${reached}${run.defeated ? ", поражение" : ", останов"}, золото ${Math.floor(run.gold)}, искры ночи ${run.sparksNight}, сердца ${run.hearts}, башни ${run.towers.length}, ${Date.now() - t0} мс`);
  if (canDawn(run) && run.cleared >= dawnMin(run.laws)) {
    const offer = ensureLawOffer(meta, run);
    const pick = LAW_RANK.find((id) => offer.includes(id)) ?? offer[0] ?? null;
    console.log(`  Рассвет → ${pick ? lawSpec(pick).name : "15 искр"} (из ${offer.map((id) => lawSpec(id).name).join(", ") || "—"})`);
    bankDawn(meta, run, pick);
  } else bankDefeat(meta, run);
  const before = meta.sparks;
  shop(meta);
  console.log(`  после лавки: искры ${before}→${meta.sparks}, законы [${meta.laws.join(", ")}], старт+${meta.startGoldRanks * 25}, сердца+${meta.heartRanks * 5}`);
}
