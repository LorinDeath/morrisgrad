// «Партия Чёрных королей» — этап 2: экономика, города и территория, постройки, найм, технологии, таланты, Слава.
// Чистые функции поверх GameState (rules.ts вызывает хуки). Все числа — cfg.econ / cfg.build / cfg.talents (econ-cfg.ts).
import type { GameState, Piece, Kind, Race, Ev, StratCfg, Action } from "./rules";
import { passable, str as mapStr } from "./terrain";
import { TECHS, techById, techSibling, UNLOCK, PAWN_BARRACKS_COST, HERO_ERA, type BuildId, type Tech } from "./econ-cfg";

export type City = { id: number; owner: 0 | 1; x: number; y: number; cap: boolean; growth: number; lvl: number; bld: BuildId[]; forge: Kind[]; acted: boolean; sg: number; name: string };
export type Res = { gold: number; know: number; glory: number };
export type Econ = {
  res: [Res, Res]; cities: City[]; techs: [string[], string[]]; era: [number, number];
  rs: [number, number]; // исследований в этот ход
  ruins: number[]; quiet: number; nextCity: number;
  inc: [Res, Res]; // последний доход (для панели «+N»)
  kills: [number, number];
  trades: [number, number]; // хук 2 на 2: сделок за ход
};
export type EconAction =
  | { a: "recruit"; city: number; kind: Kind; x: number; y: number }
  | { a: "build"; city: number; b: BuildId; kind?: Kind }
  | { a: "research"; t: string }
  | { a: "era" }
  | { a: "talent"; id: number; t: string }
  | { a: "found"; id: number }
  | { a: "swap"; city: number; n: number }
  | { a: "trade"; to: number; give: Partial<Res>; get: Partial<Res> };
export const ECON_ACTS = ["recruit", "build", "research", "era", "talent", "found", "swap", "trade"];

const CAP_NAMES = ["Столица"], OUT_NAMES = ["Застава", "Дозор"];
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const pieceAt = (g: GameState, x: number, y: number) => g.pieces.find((p) => p.x === x && p.y === y);
export const sz = (g: GameState, cfg: StratCfg) => cfg.econ.sizes[g.size] || cfg.econ.sizes[8];
export const hasTech = (g: GameState, side: number, id: string) => !!g.ec?.techs[side]?.includes(id);
const other = (s: number) => (1 - s) as 0 | 1;

export function initEcon(g: GameState, cfg: StratCfg) {
  const E = cfg.econ;
  const g2 = (sd: number) => E.start.gold + (sd !== g.first ? (E.start as any).secondGold || 0 : 0);
  g.ec = { res: [{ gold: g2(0), know: E.start.know, glory: 0 }, { gold: g2(1), know: E.start.know, glory: 0 }], cities: [], techs: [[], []], era: [sz(g, cfg).eras > 0 ? 1 : 0, sz(g, cfg).eras > 0 ? 1 : 0],
    rs: [0, 0], ruins: [], quiet: 0, nextCity: 1, inc: [{ gold: 0, know: 0, glory: 0 }, { gold: 0, know: 0, glory: 0 }], kills: [0, 0], trades: [0, 0] };
  for (const s of [0, 1] as const) {
    const k = g.pieces.find((p) => p.owner === s && p.kind === "king");
    if (k) g.ec.cities.push(mkCity(g, s, k.x, k.y, true));
  }
}
function mkCity(g: GameState, owner: 0 | 1, x: number, y: number, cap: boolean): City {
  const n = g.ec.cities.filter((c) => c.owner === owner && !c.cap).length;
  return { id: g.ec.nextCity++, owner, x, y, cap, growth: 0, lvl: 0, bld: [], forge: [], acted: false, sg: 0, name: cap ? CAP_NAMES[0] : OUT_NAMES[n % OUT_NAMES.length] };
}
export const cityRadius = (g: GameState, c: City, cfg: StratCfg) => (c.cap ? cfg.econ.city.capRadius[Math.min(c.lvl, cfg.econ.city.capRadius.length - 1)] + (hasTech(g, c.owner, "empire") ? 1 : 0) : cfg.econ.city.outRadius);
export const citySlots = (g: GameState, c: City, cfg: StratCfg) => (c.cap ? sz(g, cfg).capSlots[Math.min(c.lvl, 2)] : g.size === 5 ? 1 : cfg.econ.city.outSlots);

/** Территория: -1 нейтраль, 0/1 — чья. Клетка принадлежит ближайшему (Чебышёв) городу в его радиусе; равенство разных хозяев — нейтраль. */
export function territory(g: GameState, cfg: StratCfg): Int8Array {
  const n = g.size, T = new Int8Array(n * n).fill(-1), D = new Int16Array(n * n).fill(999);
  if (!g.ec) return T;
  for (const c of g.ec.cities) {
    const r = cityRadius(g, c, cfg);
    for (let y = Math.max(0, c.y - r); y <= Math.min(n - 1, c.y + r); y++) for (let x = Math.max(0, c.x - r); x <= Math.min(n - 1, c.x + r); x++) {
      const i = y * n + x, d = cheb(c, { x, y });
      if (d < D[i]) { D[i] = d; T[i] = c.owner; } else if (d === D[i] && T[i] !== c.owner) T[i] = -2; // спор
    }
  }
  for (let i = 0; i < T.length; i++) if (T[i] === -2) T[i] = -1;
  return T;
}

// ---------- эффективные характеристики (технологии, Кузня, Стена, таланты)
export function talBonus(p: Piece, key: "atk" | "arm" | "hp" | "shot" | "ap", cfg: StratCfg): number {
  if (!p.tal?.length) return 0;
  const lv = cfg.talents[p.kind] || []; let s = 0;
  for (const id of p.tal) for (const pair of lv) for (const t of pair) if (t.id === id) s += (t as any)[key] || 0;
  return s;
}
export function forgeBonus(g: GameState, side: number, kind: Kind) {
  if (!g.ec) return 0; let n = 0;
  for (const c of g.ec.cities) if (c.owner === side) n += c.forge.filter((k) => k === kind).length;
  return n;
}
/** АТК фигуры (t — цель, для «Засады»/«Ярости»/«Инея»). Базовый p.atk уже включает таланты. */
const rAdj = (g: GameState, p: Piece, cfg: StratCfg) => (cfg.race as any)[g.races[p.owner]] || {};
export function effAtk(g: GameState, p: Piece, t: Piece | null, cfg: StratCfg): number {
  const R = rAdj(g, p, cfg), ra = (R.atk || 0) + (p.kind === "rook" ? R.rookAtk || 0 : 0);
  if (!g.ec) return p.atk + ra;
  const F = cfg.econ.fx; let a = p.atk + ra + forgeBonus(g, p.owner, p.kind);
  if (hasTech(g, p.owner, "steel")) a += F.steelAtk;
  if (t) {
    if (hasTech(g, p.owner, "ambush") && t.mv) a += F.ambushDmg;
    if (hasTech(g, p.owner, "fury") && t.burn > 0) a += F.furyDmg;
    if (hasTech(g, p.owner, "rime") && (t.chill > 0 || t.cm)) a += F.rimeDmg;
  }
  return a;
}
export function effArm(g: GameState, p: Piece, cfg: StratCfg, T?: Int8Array): number {
  const ra = rAdj(g, p, cfg).arm || 0;
  if (!g.ec) return p.arm + ra;
  const F = cfg.econ.fx; let a = p.arm + ra;
  if (p.kind === "pawn" && hasTech(g, p.owner, "formation") && g.pieces.some((q) => q !== p && q.owner === p.owner && q.kind === "pawn" && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1)) a += F.formationArm;
  if ((p.kind === "rook" || p.kind === "king") && hasTech(g, p.owner, "shields")) a += F.shieldsArm;
  if (p.kind === "rook" && hasTech(g, p.owner, "frostarmor")) a += F.frostArm;
  if (hasTech(g, p.owner, "bastion")) { const TT = T || territory(g, cfg); if (TT[p.y * g.size + p.x] === p.owner) a += F.bastionArm; }
  if (g.ec.cities.some((c) => c.owner === p.owner && c.bld.includes("wall") && cheb(c, p) <= 1)) a += F.wallArm;
  return a;
}
export function mageShot(g: GameState, p: Piece, cfg: StratCfg): number {
  let r = cfg.range.mageShot;
  if (hasTech(g, p.owner, "pyromancy") || hasTech(g, p.owner, "icelance")) r = Math.max(r, cfg.econ.fx.shot3);
  return r + talBonus(p, "shot", cfg);
}
export function apFor(g: GameState, side: number, cfg: StratCfg): number {
  let ap = cfg.sizes[g.size].ap;
  if (!g.ec) return ap;
  if (hasTech(g, side, "drill")) ap += cfg.econ.fx.drillAp;
  for (const p of g.pieces) if (p.owner === side) ap += talBonus(p, "ap", cfg);
  return ap;
}
export function burnTurns(g: GameState, burner: number, cfg: StratCfg) { return hasTech(g, burner, "wildfire") ? cfg.econ.fx.wildfireTurns : cfg.race.fire.burnTurns; }
export function burnDmg(g: GameState, victim: number, cfg: StratCfg) { return hasTech(g, other(victim), "embers") ? cfg.econ.fx.embersDmg : cfg.race.fire.burnDmg; }
export function chillTurns(g: GameState, chiller: number, cfg: StratCfg) { return hasTech(g, chiller, "deepfreeze") ? cfg.econ.fx.deepfreezeTurns : (cfg.race as any).ice.chillTurns ?? 1; }

// ---------- опыт, Слава
export function pieceLevel(p: Piece, cfg: StratCfg) { const L = cfg.econ.xp.lv, x = p.xp || 0; return x >= L[3] ? 3 : x >= L[2] ? 2 : 1; }
/** уровень, на котором ждёт выбор таланта (0 — нет) */
export function pendingTalent(p: Piece, cfg: StratCfg) { const lv = pieceLevel(p, cfg), n = p.tal?.length || 0; return n + 2 <= lv && (cfg.talents[p.kind] || [])[n] ? n + 2 : 0; }
export function onHit(g: GameState, a: Piece, t: Piece, killed: boolean, ev: Ev[], cfg: StratCfg) {
  if (!g.ec) return;
  g.ec.quiet = 0;
  const before = pieceLevel(a, cfg);
  a.xp = (a.xp || 0) + (killed ? cfg.econ.xp.kill : cfg.econ.xp.hit);
  const after = pieceLevel(a, cfg); if (after > before) ev.push({ e: "lvl", id: a.id, lvl: after });
  if (killed) {
    g.ec.kills[a.owner]++;
    let gl = cfg.econ.glory.kill; if (hasTech(g, a.owner, "blaze") || hasTech(g, a.owner, "avalanche")) gl += cfg.econ.fx.killGlory;
    addGlory(g, a.owner, gl, "kill", ev);
  }
}
export function addGlory(g: GameState, side: number, n: number, why: string, ev: Ev[]) {
  if (!g.ec || n <= 0) return; g.ec.res[side].glory += n; ev.push({ e: "glory", side, n, why });
}
/** Победа Славой: порог из размера поля (5×5 — нет). Сразу, как только набран. */
export function checkGlory(g: GameState, cfg: StratCfg): 0 | 1 | -1 {
  const thr = sz(g, cfg).glory; if (!g.ec || thr <= 0) return -1;
  const a = g.ec.res[0].glory >= thr, b = g.ec.res[1].glory >= thr;
  if (a && b) return g.ec.res[0].glory >= g.ec.res[1].glory ? 0 : 1;
  return a ? 0 : b ? 1 : -1;
}

/** Переход фигуры на клетку: руины (разовая награда), захват города. */
export function onEnter(g: GameState, p: Piece, ev: Ev[], cfg: StratCfg) {
  if (!g.ec) return;
  p.mv = true;
  const i = p.y * g.size + p.x;
  if (mapStr(g.map, p.x, p.y) === "R" && !g.ec.ruins.includes(i)) {
    g.ec.ruins.push(i); const R = cfg.econ.ruins, r = g.ec.res[p.owner];
    r.gold += R.gold; r.know += R.know; ev.push({ e: "ruin", id: p.id, gold: R.gold, know: R.know }); addGlory(g, p.owner, R.glory, "ruin", ev);
  }
  const c = g.ec.cities.find((c) => c.x === p.x && c.y === p.y && c.owner !== p.owner);
  if (c) ev.push({ e: "siege", city: c.id, by: p.id });
}

/** Начало хода стороны side: осада, доход, рост, Слава за территорию и обелиски, сброс действий городов. */
export function startTurn(g: GameState, side: 0 | 1, ev: Ev[], cfg: StratCfg): -1 | 0 | 1 {
  if (!g.ec) return -1;
  let capWin: -1 | 0 | 1 = -1;
  const E = cfg.econ, ec = g.ec, F = E.fx;
  for (const p of g.pieces) if (p.owner === side) p.mv = false;
  ec.rs[side] = 0; ec.trades[side] = 0;
  // осада: враг простоял на клетке города до начала своего следующего хода
  for (const c of [...ec.cities]) {
    const o = pieceAt(g, c.x, c.y);
    if (!o || o.owner === c.owner) { c.sg = 0; continue; }
    if (o.owner !== side) continue;
    c.sg++;
    if (c.sg >= E.city.siegeTurns) {
      if (c.cap) { ev.push({ e: "capture", city: c.id, by: o.owner, cap: true }); capWin = o.owner; continue; }
      c.owner = o.owner; c.sg = 0; c.acted = true; c.forge = []; ev.push({ e: "capture", city: c.id, by: o.owner, cap: false });
      addGlory(g, o.owner, E.glory.capture, "capture", ev);
    }
  }
  const T = territory(g, cfg), inc: Res = { gold: 0, know: 0, glory: 0 }; let growthAdd = 0;
  const mine = ec.cities.filter((c) => c.owner === side);
  for (const c of mine) {
    c.acted = false;
    inc.gold += c.cap ? E.city.capGold : E.city.outGold; inc.know += c.cap ? E.city.capKnow : E.city.outKnow;
    for (const b of c.bld) { const B = cfg.build[b]; inc.gold += B?.gold || 0; inc.know += B?.know || 0; }
    if (hasTech(g, side, "scribes")) inc.know += F.scribesKnow;
  }
  let cells = 0;
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
    if (T[y * g.size + x] !== side) continue; cells++;
    const s = mapStr(g.map, x, y), S = E.struct[s]; if (!S) continue;
    const o = pieceAt(g, x, y); if (o && o.owner !== side) continue; // набег: вражеская фигура на клетке
    inc.gold += (S.gold || 0) + (hasTech(g, side, "trade") && (s === "M" || s === "V") ? F.tradeGold : 0);
    inc.know += S.know || 0; inc.glory += S.glory || 0; growthAdd += S.growth || 0;
  }
  if (hasTech(g, side, "treasury")) inc.gold += F.treasuryGold;
  inc.glory += Math.floor(cells / Math.max(1, E.glory.perTerr));
  for (const p of g.pieces) if (p.owner === side && mapStr(g.map, p.x, p.y) === "X") inc.glory += E.obelisk.glory;
  if (g.races[side] === "ice") { const R = cfg.race as any; const fl = Math.min(inc.know, R.ice.knowFloor ?? 0); inc.know = Math.max(fl, inc.know - (R.ice.knowPen ?? 1)); } // Лёд: −1 знание (не ниже knowFloor)
  const r = ec.res[side];
  if (mine.some((c) => c.bld.includes("glacier")) && g.turn % E.glacier.every === 0) inc.gold += Math.min(E.glacier.max, Math.floor((r.gold + inc.gold) * E.glacier.share));
  r.gold += inc.gold; r.know = Math.max(0, r.know + inc.know); r.glory += inc.glory;
  ec.inc[side] = inc;
  ev.push({ e: "inc", side, gold: inc.gold, know: inc.know, glory: inc.glory });
  // рост столицы
  for (const c of mine) if (c.cap) {
    c.growth += E.city.growthBase + growthAdd + (c.bld.includes("granary") ? cfg.build.granary.growth || 1 : 0) + (hasTech(g, side, "farming") ? F.farmingGrowth : 0);
    while (c.lvl < E.city.growthThr.length && c.growth >= E.city.growthThr[c.lvl]) { c.lvl++; ev.push({ e: "grow", city: c.id, lvl: c.lvl }); }
  }
  return capWin;
}

// ---------- действия этапа 2
const ok = (ev: Ev[]) => ({ ok: true as const, ev });
const no = (err: string) => ({ ok: false as const, err });
export function buildCost(g: GameState, side: number, b: BuildId, cfg: StratCfg): number {
  let c = cfg.build[b].cost;
  if (b === "forge" && g.ec.cities.some((x) => x.owner === side && x.bld.includes("crucible"))) c = Math.ceil(c / 2);
  if (hasTech(g, side, "masons")) c = Math.ceil(c * (1 - cfg.econ.fx.masonsDisc));
  return c;
}
export function recruitCost(g: GameState, c: City, kind: Kind, cfg: StratCfg) { return kind === "pawn" && c.bld.includes("barracks") ? PAWN_BARRACKS_COST : cfg.units[kind].cost; }
export function canBuild(g: GameState, side: number, c: City, b: BuildId, cfg: StratCfg, kind?: Kind): string | null {
  const B = cfg.build[b]; if (!B) return "bad_building";
  if (B.race && B.race !== g.races[side]) return "wrong_race";
  if (c.bld.length >= citySlots(g, c, cfg)) return "no_slot";
  if (b === "forge") {
    if (!kind || kind === "king" || !cfg.units[kind]) return "bad_kind";
    const n = g.ec.cities.filter((x) => x.owner === side).reduce((s, x) => s + x.forge.length, 0);
    if (n >= cfg.econ.forgeMax) return "forge_max";
  } else if (c.bld.includes(b)) return "already_built";
  if (g.ec.res[side].gold < buildCost(g, side, b, cfg)) return "no_gold";
  return null;
}
export function recruitCells(g: GameState, c: City, kind: Kind, cfg: StratCfg): [number, number][] {
  const out: [number, number][] = [], r = cfg.econ.city.recruitRadius, race = g.races[c.owner];
  for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
    if (x < 0 || y < 0 || x >= g.size || y >= g.size || pieceAt(g, x, y)) continue;
    if (!passable(g.map, x, y, race)) continue;
    out.push([x, y]);
  }
  return out;
}
export function canRecruit(g: GameState, side: number, c: City, kind: Kind, cfg: StratCfg): string | null {
  if (!cfg.units[kind] || kind === "king") return "bad_kind";
  const u = UNLOCK[kind];
  if (u && !c.bld.includes(u as BuildId)) return "locked";
  if (kind === "hero") { if (!c.cap) return "capital_only"; if (g.ec.era[side] < HERO_ERA) return "need_era"; if (g.pieces.some((p) => p.owner === side && p.kind === "hero")) return "one_hero"; }
  if (g.pieces.filter((p) => p.owner === side).length >= sz(g, cfg).pop) return "pop_cap";
  if (g.ec.res[side].gold < recruitCost(g, c, kind, cfg)) return "no_gold";
  return null;
}
export function canResearch(g: GameState, side: number, t: Tech | undefined, cfg: StratCfg): string | null {
  if (!t) return "bad_tech";
  const ec = g.ec, eras = sz(g, cfg).eras;
  if (eras <= 0) return "no_tech";
  if (t.race && t.race !== g.races[side]) return "wrong_race";
  if (t.era > ec.era[side] || t.era > eras) return "need_era";
  if (ec.techs[side].includes(t.id)) return "already";
  const sib = techSibling(t); if (sib && ec.techs[side].includes(sib.id)) return "locked";
  if (ec.rs[side] >= cfg.econ.research.perTurn) return "research_done";
  if (ec.res[side].know < cfg.econ.research.cost[t.era]) return "no_know";
  return null;
}
export function canEra(g: GameState, side: number, cfg: StratCfg): string | null {
  const ec = g.ec, e = ec.era[side];
  if (e >= sz(g, cfg).eras) return "max_era";
  const n = ec.techs[side].filter((id) => techById(id)?.era === e).length;
  if (n < cfg.econ.research.need) return "need_techs";
  if (ec.res[side].know < cfg.econ.research.eraCost[e + 1]) return "no_know";
  return null;
}
export function canFound(g: GameState, side: number, p: Piece, cfg: StratCfg): string | null {
  if (p.kind !== "pawn") return "pawn_only";
  if (g.ec.cities.filter((c) => c.owner === side && !c.cap).length >= sz(g, cfg).outposts) return "outpost_max";
  if (g.ec.cities.some((c) => cheb(c, p) < cfg.econ.city.outMinDist)) return "too_close";
  const T = territory(g, cfg); if (T[p.y * g.size + p.x] === other(side)) return "enemy_land";
  if (mapStr(g.map, p.x, p.y) !== "." && mapStr(g.map, p.x, p.y) !== "P") return "on_structure";
  return null;
}

export function applyEcon(g: GameState, side: 0 | 1, act: EconAction, cfg: StratCfg, mk: (o: 0 | 1, k: Kind, x: number, y: number) => Piece): { ok: true; ev: Ev[] } | { ok: false; err: string } {
  if (!g.ec) return no("bad_action");
  const ec = g.ec, r = ec.res[side], ev: Ev[] = [];
  const city = (id: any) => ec.cities.find((c) => c.id === id && c.owner === side);
  switch (act.a) {
    case "recruit": {
      const c = city(act.city); if (!c) return no("bad_city"); if (c.acted) return no("city_acted");
      const e = canRecruit(g, side, c, act.kind, cfg); if (e) return no(e);
      if (!recruitCells(g, c, act.kind, cfg).some(([x, y]) => x === act.x && y === act.y)) return no("bad_cell");
      r.gold -= recruitCost(g, c, act.kind, cfg);
      const p = mk(side, act.kind, act.x, act.y); p.acted = true; p.xp = 0; p.tal = [];
      if (c.bld.includes("crucible")) p.atk += 1;
      g.pieces.push(p); c.acted = true;
      ev.push({ e: "recruit", id: p.id, city: c.id, kind: act.kind }); return ok(ev);
    }
    case "build": {
      const c = city(act.city); if (!c) return no("bad_city"); if (c.acted) return no("city_acted");
      const e = canBuild(g, side, c, act.b, cfg, act.kind); if (e) return no(e);
      r.gold -= buildCost(g, side, act.b, cfg);
      if (act.b === "forge") c.forge.push(act.kind!);
      c.bld.push(act.b); // Кузня может стоять дважды (два слота, два типа фигур)
      c.acted = true; ev.push({ e: "build", city: c.id, b: act.b }); return ok(ev);
    }
    case "research": {
      const t = techById(String(act.t)); const e = canResearch(g, side, t, cfg); if (e) return no(e);
      r.know -= cfg.econ.research.cost[t!.era]; ec.techs[side].push(t!.id); ec.rs[side]++;
      if (t!.id === "phoenix" || t!.id === "winterking") for (const p of g.pieces) if (p.owner === side && p.kind === "king") { p.maxHp += cfg.econ.fx.kingHp; p.hp += cfg.econ.fx.kingHp; }
      ev.push({ e: "tech", side, t: t!.id }); addGlory(g, side, cfg.econ.glory.tech, "tech", ev); return ok(ev);
    }
    case "era": {
      const e = canEra(g, side, cfg); if (e) return no(e);
      r.know -= cfg.econ.research.eraCost[ec.era[side] + 1]; ec.era[side]++;
      ev.push({ e: "era", side, era: ec.era[side] }); addGlory(g, side, cfg.econ.glory.era, "era", ev); return ok(ev);
    }
    case "talent": {
      const p = g.pieces.find((q) => q.id === act.id && q.owner === side); if (!p) return no("bad_piece");
      const lv = pendingTalent(p, cfg); if (!lv) return no("no_talent");
      const pair = cfg.talents[p.kind][lv - 2], t = pair.find((x) => x.id === act.t); if (!t) return no("bad_talent");
      p.tal = [...(p.tal || []), t.id];
      p.atk += t.atk || 0; p.arm += t.arm || 0; if (t.hp) { p.maxHp += t.hp; p.hp += t.hp; }
      ev.push({ e: "talent", id: p.id, t: t.id }); return ok(ev);
    }
    case "found": {
      const p = g.pieces.find((q) => q.id === act.id && q.owner === side); if (!p) return no("bad_piece");
      if (p.acted) return no("already_acted"); if (g.ap < 1) return no("no_ap");
      const e = canFound(g, side, p, cfg); if (e) return no(e);
      g.pieces = g.pieces.filter((q) => q !== p);
      const c = mkCity(g, side, p.x, p.y, false); c.acted = true; ec.cities.push(c); g.ap -= 1;
      ev.push({ e: "found", city: c.id, x: c.x, y: c.y }); addGlory(g, side, cfg.econ.glory.found, "found", ev); return ok(ev);
    }
    case "swap": {
      const c = city(act.city); if (!c) return no("bad_city"); if (c.acted) return no("city_acted");
      if (!c.bld.includes("market")) return no("need_market");
      const n = act.n | 0; if (n < 1 || n > cfg.econ.market.max) return no("bad_amount"); if (r.know < n) return no("no_know");
      r.know -= n; r.gold += n * cfg.econ.market.rate; c.acted = true;
      ev.push({ e: "swap", city: c.id, n }); return ok(ev);
    }
    case "trade": { const e = validateTrade(g, side, act, cfg); return no(e || "no_ally"); }
  }
  return no("bad_action");
}

/**
 * Хук обмена между союзниками (2 на 2, этап 5). Передачи «просто так» нет: сделка = встречные ресурсы, принимает союзник.
 * Ограничения из cfg.econ.trade: курс 1:2…2:1, 1 сделка за ход на пару, ≤30% запаса предлагающего, с соперником нельзя.
 * В 1 на 1 союзника нет → всегда отказ «no_ally». Возвращает ошибку или null (сделка допустима, ждёт согласия).
 */
export function validateTrade(g: GameState, side: number, act: { to: number; give: Partial<Res>; get: Partial<Res> }, cfg: StratCfg, allies?: (a: number, b: number) => boolean): string | null {
  if (!allies || !allies(side, act.to)) return "no_ally";
  const T = cfg.econ.trade, sum = (o: Partial<Res>) => (o.gold || 0) + (o.know || 0);
  const give = sum(act.give || {}), get = sum(act.get || {});
  if (give <= 0 || get <= 0) return "no_gift"; // без встречной оплаты нельзя
  const ratio = give / get; if (ratio < T.minRatio || ratio > T.maxRatio) return "bad_ratio";
  const r = g.ec.res[side] as any;
  for (const k of ["gold", "know"] as const) { const v = (act.give as any)[k] || 0; if (v < 0 || v > Math.floor(r[k] * T.maxShare)) return "too_much"; }
  if (g.ec.trades[side] >= T.perTurn) return "trade_done";
  return null;
}

/** Есть ли у стороны «бесплатные» действия (город/исследование/эпоха/талант) — тогда ход сам не передаётся при 0 ОД. */
export function hasFree(g: GameState, side: 0 | 1, cfg: StratCfg): boolean {
  if (!g.ec) return false;
  if (g.pieces.some((p) => p.owner === side && pendingTalent(p, cfg))) return true;
  if (!canEra(g, side, cfg)) return true;
  if (TECHS.some((t) => !canResearch(g, side, t, cfg))) return true;
  for (const c of g.ec.cities) if (c.owner === side && !c.acted) {
    for (const k of ["pawn", "knight", "mage", "rook", "hero"] as Kind[]) if (!canRecruit(g, side, c, k, cfg) && recruitCells(g, c, k, cfg).length) return true;
    for (const b of Object.keys(cfg.build) as BuildId[]) if (!canBuild(g, side, c, b, cfg, "rook")) return true;
  }
  return false;
}

/** Финальный счёт на лимите ходов: Слава (TZ: больше Славы — победа, равно — ничья). */
export function limitScore(g: GameState, side: number) { return g.ec ? g.ec.res[side].glory : 0; }

// ---------- бот: экономика (вызывается до боевых действий)
const BOT_BUILD: BuildId[] = ["barracks", "library", "market", "granary", "stable", "crucible", "glacier", "forge", "magetower", "wall"];
const BOT_UNIT: Kind[] = ["hero", "rook", "knight", "mage", "pawn"];
export function botEcon(g: GameState, side: 0 | 1, cfg: StratCfg, rnd = Math.random): Action | null {
  if (!g.ec) return null;
  const ec = g.ec, r = ec.res[side];
  for (const p of g.pieces) if (p.owner === side) { const lv = pendingTalent(p, cfg); if (lv) { const pair = cfg.talents[p.kind][lv - 2]; return { a: "talent", id: p.id, t: pair[rnd() < 0.5 ? 0 : 1].id } as any; } }
  if (!canEra(g, side, cfg)) return { a: "era" } as any;
  const techs = TECHS.filter((t) => !canResearch(g, side, t, cfg));
  // копим на переход эпохи, если две технологии эпохи уже есть
  const curN = ec.techs[side].filter((id) => techById(id)?.era === ec.era[side]).length;
  if (techs.length && !(curN >= cfg.econ.research.need && ec.era[side] < sz(g, cfg).eras)) return { a: "research", t: techs[Math.floor(rnd() * techs.length)].id } as any;
  const ek = g.pieces.find((p) => p.owner !== side && p.kind === "king");
  const enemyCap = ec.cities.find((c) => c.owner !== side && c.cap) || ek;
  const mine = g.pieces.filter((p) => p.owner === side);
  for (const c of ec.cities) if (c.owner === side && !c.acted) {
    const threat = g.pieces.some((p) => p.owner !== side && cheb(p, c) <= 3);
    const units = BOT_UNIT.filter((k) => !canRecruit(g, side, c, k, cfg) && recruitCells(g, c, k, cfg).length);
    const pawns = mine.filter((p) => p.kind === "pawn").length;
    const wantPawn = sz(g, cfg).outposts > ec.cities.filter((x) => x.owner === side && !x.cap).length && pawns < 2 && units.includes("pawn");
    const builds = BOT_BUILD.filter((b) => !canBuild(g, side, c, b, cfg, "rook") && !(b === "wall" && !threat));
    const doBuild = builds.length && !threat && (rnd() < 0.55 || !units.length) && !(units.includes("hero"));
    if (doBuild) { const b = builds[0]; return { a: "build", city: c.id, b, ...(b === "forge" ? { kind: mine.some((p) => p.kind === "rook") ? "rook" : "knight" } : {}) } as any; }
    if (units.length) {
      const k = wantPawn ? "pawn" : units.filter((u) => u !== "pawn" || units.length === 1)[0];
      if (k) {
        const cells = recruitCells(g, c, k, cfg).sort((a, b) => (enemyCap ? cheb({ x: a[0], y: a[1] }, enemyCap) - cheb({ x: b[0], y: b[1] }, enemyCap) : 0));
        if (r.gold >= recruitCost(g, c, k, cfg) + (k === "pawn" ? 0 : 0)) return { a: "recruit", city: c.id, kind: k, x: cells[0][0], y: cells[0][1] } as any;
      }
    }
  }
  if (g.ap >= 1) for (const p of mine) if (!p.acted && !canFound(g, side, p, cfg)) {
    let resN = 0; for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (cfg.econ.struct[mapStr(g.map, x, y)]) resN++;
    if (resN > 0 || rnd() < 0.3) return { a: "found", id: p.id } as any;
  }
  return null;
}
/** Куда тянуть Ополченца-бота: ближайшая доходная клетка/руины без своей фигуры. */
export function botPawnGoal(g: GameState, p: Piece, cfg: StratCfg): { x: number; y: number } | null {
  if (!g.ec) return null; let best: { x: number; y: number } | null = null, bd = 99;
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
    const s = mapStr(g.map, x, y);
    const want = (s === "R" && !g.ec.ruins.includes(y * g.size + x)) || s === "X" || (sz(g, cfg).outposts > 0 && cfg.econ.struct[s]);
    if (!want) continue; const o = pieceAt(g, x, y); if (o && o.owner === p.owner && o !== p) continue;
    const d = cheb(p, { x, y }); if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}
