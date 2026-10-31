// «Партия Чёрных королей» — движок правил (этап 1). Чистые функции без I/O: один модуль для сервера (StratMatch),
// клиента (подсветка ходов), бота и симулятора. Все числа — в STRAT_CFG (позже правятся в админке, game_overrides strat_*).

import { type MapData, openMap, generateMap, passable, stopsSlide, blocksShot, coverArm, str as mapStr, TER_RULES } from "./terrain";
export type { MapData } from "./terrain";
import { ECON, BUILD, TALENTS, TECHS } from "./econ-cfg";
import { ULTS, UNIT_TREE, UNIT_ULTS, UNIT_RACE_NAMES } from "./content-cfg";
import { castUlt, canUlt, ultTurnStart, absorb } from "./ult";
import { BUILD_HP } from "./content-cfg";
import { GOALS, CHIEF, CHIEFS, CHIEF_NAMES, BUILD_TPL, BUILD_RACE, TECH_NODE_ORDER, TECH_RACE_NAMES, TECH_RACE_FX } from "./content-cfg";
import { bldStat, bldMaxHp, addGlory, gainXp } from "./econ";
import { type Econ, type EconAction, ECON_ACTS, initEcon, startTurn, applyEcon, effAtk, effArm, explainAtk, explainArm, mageShot, apFor, burnTurns, burnDmg, chillTurns, onHit, onEnter, hasFree, botEcon, botPawnGoal, botChiefHome, talBonus, chiefDown, chiefBase, chiefFx, goalWinner, territory, tfx, chiefNode, pieceLevel, raceCfg } from "./econ";

export type Race = "fire" | "ice" | "water" | "stone" | "nature" | "lightning";
export type Kind = "pawn" | "knight" | "mage" | "rook" | "hero" | "king";
export const RACES: Race[] = ["fire", "ice", "water", "stone", "nature", "lightning"]; // этап 2: 4 новые расы — заглушки (арт + простые числа), полные правила позже
export const FULL_RACES: Race[] = ["fire", "ice"];
export const KINDS: Kind[] = ["pawn", "knight", "mage", "rook", "hero", "king"];

export type UnitStats = { hp: number; atk: number; arm: number; cost: number };
export type SizeCfg = {
  size: number; turnLimit: number; turnSec: number; reserveSec: number; ap: number;
  army: Kind[][]; // ряды от задней линии вперёд, центрировано по ширине
};

export const STRAT_CFG = {
  version: 2,
  units: {
    pawn: { hp: 10, atk: 4, arm: 0, cost: 3 },
    knight: { hp: 14, atk: 6, arm: 1, cost: 7 },
    mage: { hp: 9, atk: 6, arm: 0, cost: 8 },
    rook: { hp: 22, atk: 5, arm: 3, cost: 8 },
    hero: { hp: 26, atk: 8, arm: 2, cost: 16 },
    king: { hp: 30, atk: 5, arm: 2, cost: 0 },
  } as Record<Kind, UnitStats>,
  range: { mageMove: 4, mageShot: 2, rookMove: 4, heroMove: 3 },
  elementBonus: 0.10, // мягкий круг: Вода→Огонь→Лёд→Природа→Камень→Молния→Вода
  race: {
    fire: { hpMul: 0.9, burnTurns: 2, burnDmg: 1 },
    ice: { hpMul: 1.0, chillMove: 1, chillTurns: 1, knowPen: 0, knowFloor: 2 }, // t1163: knowPen 1→0 (баланс-сим: Лёд 34→43% на 8×8, sims/summary.md; минус Льда сейчас выключен — вопрос Алексу); knowFloor: штраф «−1 знание» не опускает доход ниже 2 (баланс-сим)
    // заглушки этапа 2 (только числа из ТЗ, без особых механик): Вода — Страж АТК −1; Камень — +1 БРН всем; Молния — −10% HP; Природа — пока без пассивки
    // этап 3–4: полные пассивки (TZ §14). Вода — лечение на своей земле, Страж −1 АТК; Камень — +1 БРН, Маг ходит на 1 меньше;
    // Природа — рост ×1.5, +1 знание за лес (макс. 3), −1 БРН вне своей земли; Молния — −10% HP, первый удар хода бьёт разрядом соседнего врага.
    water: { hpMul: 1.0, atk: 0, arm: 0, rookAtk: -1, healOwnT: 1 }, stone: { hpMul: 1.0, atk: 0, arm: 1, rookAtk: 0, mageMove: -1 },
    nature: { hpMul: 1.0, atk: 0, arm: 0, rookAtk: 0, growthMul: 1.5, forestKnow: 1, forestKnowMax: 3, armOutside: -1 }, lightning: { hpMul: 0.9, atk: 0, arm: 0, rookAtk: 0, chain: 2 },
  },
  sizes: {
    5: { size: 5, turnLimit: 0, turnSec: 20, reserveSec: 60, ap: 1, army: [["knight", "king", "rook"]] },
    8: { size: 8, turnLimit: 0, turnSec: 40, reserveSec: 180, ap: 2, army: [["rook", "knight", "king", "mage", "rook"], ["pawn", "pawn", "pawn", "pawn"]] },
    15: { size: 15, turnLimit: 0, turnSec: 60, reserveSec: 300, ap: 3, army: [["rook", "mage", "knight", "king", "hero", "knight", "mage", "rook"], ["pawn", "pawn", "pawn", "pawn", "pawn", "pawn"]] },
    35: { size: 35, turnLimit: 0, turnSec: 90, reserveSec: 600, ap: 4, army: [["rook", "knight", "mage", "knight", "hero", "king", "hero", "knight", "mage", "knight", "rook"], ["pawn", "pawn", "pawn", "pawn", "pawn", "pawn", "pawn", "pawn", "pawn"]] }, // t1201: Тактическая
  } as Record<number, SizeCfg>,
  econ: ECON, build: BUILD, talents: TALENTS, // этап 2 (econ-cfg.ts)
  techs: TECHS, // этап 3: дерево тактик (econ-cfg.ts)
  // этап 4 (content-cfg.ts): цели, Вожди, расовые варианты построек и технологий
  bldHp: BUILD_HP, goals: GOALS, chief: CHIEF, chiefs: CHIEFS, ults: ULTS, unitTree: UNIT_TREE, unitUlts: UNIT_ULTS, unitRaceNames: UNIT_RACE_NAMES, chiefNames: CHIEF_NAMES, buildTpl: BUILD_TPL, buildRace: BUILD_RACE,
  techRace: { order: TECH_NODE_ORDER, names: TECH_RACE_NAMES, fx: TECH_RACE_FX },
};
export type StratCfg = typeof STRAT_CFG;
export const SIZES = [5, 8, 15, 35]; // t1201: 35×35 — Тактическая лига
/** Лимит ходов задаёт хост в лобби: по умолчанию — из размера поля; 0 = без лимита (партия до гибели Вождя / сдачи / таймаута). */
export const TURN_LIMIT = { min: 5, max: 200, none: 0 };
/** null — «по умолчанию»; число — допустимый лимит; undefined — неверное значение (сервер отвечает bad_turn_limit). */
export function validTurnLimit(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v)) return undefined;
  return v === TURN_LIMIT.none || (v >= TURN_LIMIT.min && v <= TURN_LIMIT.max) ? v : undefined;
}

// круг стихий: BEATS[a] = кого a бьёт сильнее
const CYCLE = ["water", "fire", "ice", "nature", "stone", "lightning"];
export function elementMul(att: string, def: string, cfg: StratCfg = STRAT_CFG): number {
  const i = CYCLE.indexOf(att), j = CYCLE.indexOf(def);
  if (i < 0 || j < 0) return 1;
  return (i + 1) % CYCLE.length === j ? 1 + cfg.elementBonus : 1;
}

export type Piece = { id: number; owner: 0 | 1; kind: Kind; x: number; y: number; hp: number; maxHp: number; atk: number; arm: number; acted: boolean; burn: number; chill: number;
  xp?: number; tal?: string[]; mv?: boolean; cm?: number; cds?: Record<string, number> }; // cds: перезарядка активных навыков Вождя // этап 2: опыт, выбранные таланты, «ходила в прошлый ход»
export type Seat = { race: Race };
export type GameState = {
  v: number; size: number; turn: number; first: 0 | 1; cur: 0 | 1; ap: number; apMax: number; turnLimit: number;
  races: [Race, Race]; pieces: Piece[]; nextId: number;
  map: MapData; // рельеф и постройки (terrain.ts)
  winner: -1 | 0 | 1 | 2; // -1 идёт, 2 ничья
  reason: string; lastEv: Ev[];
  ec: Econ; // этап 2: ресурсы, города, технологии (econ.ts)
};
export type Ev =
  | { e: "move"; id: number; x: number; y: number }
  | { e: "hit"; id: number; t: number; dmg: number; hp: number; burn?: boolean; chill?: boolean }
  | { e: "kill"; id: number; by: number; o?: number }
  | { e: "burn"; id: number; dmg: number; hp: number }
  | { e: "heal"; id: number; hp: number; n: number }
  | { e: "promote"; id: number; kind: Kind }
  | { e: "turn"; cur: 0 | 1; turn: number }
  | { e: "end"; winner: number; reason: string }
  // этап 4: цели и Вожди
  | { e: "goal"; side: number; goal: string; n: number; turn: number }
  | { e: "chief_down"; side: number; name: string; gen: number; turn: number; by: number }
  | { e: "chief_up"; side: number; id: number; name: string; gen: number; city: number }
  | { e: "chief_name"; side: number; name: string; gen: number }
  | { e: "ability"; id: number; ab: string }
  | { e: "zap"; id: number; t: number; dmg: number; hp: number }
  | { e: "inc" | "glory" | "lvl" | "ruin" | "siege" | "capture" | "grow" | "recruit" | "build" | "tech" | "era" | "talent" | "found" | "swap" | "repair" | "bhit" | "bdestroy" | "bcounter" | "tgrow" | "tcap" | "apotheosis" | "tready" | "found_fail" | "founding" | "found_start"; [k: string]: any };
export type Action =
  | { a: "move"; id: number; x: number; y: number; promo?: Kind }
  | { a: "attack"; id: number; x: number; y: number }
  | { a: "end" }
  | { a: "raze"; id: number; city: number; b: string } // удар по постройке вражеского города (t1136)
  | { a: "ult"; id: number; x: number; y: number } // ультимейт (Вождь ур. 5 / фигура ур. 5), ult.ts
  | EconAction;

const PROMO_OK: Kind[] = ["knight", "mage", "rook"];

/** Клетки стартовой армии игрока 0 (игрок 1 — центрально-симметрично) и колонка Вождя. */
export function armyCells(size: number, cfg: StratCfg = STRAT_CFG): { cells: [number, number][]; kingCol: number; rows: number } {
  const sc = cfg.sizes[size]; const cells: [number, number][] = []; let kingCol = Math.floor(size / 2);
  sc.army.forEach((row, r) => { const x0 = Math.floor((size - row.length) / 2); row.forEach((k, i) => { cells.push([x0 + i, size - 1 - r]); if (k === "king") kingCol = x0 + i; }); });
  return { cells, kingCol, rows: sc.army.length };
}
/** Официальные карты (генерируются детерминированно, симметричны; позже — из админки). */
const OFFICIAL: Record<number, { id: string; name: string; seed: number }[]> = {
  5: [{ id: "o5a", name: "Колодец", seed: 51 }, { id: "o5b", name: "Опушка", seed: 77 }],
  8: [{ id: "o8a", name: "Две переправы", seed: 801 }, { id: "o8b", name: "Горный брод", seed: 813 }],
  15: [{ id: "o15a", name: "Река Чёрных королей", seed: 1501 }, { id: "o15b", name: "Стена и рудники", seed: 1544 }],
  35: [{ id: "o35a", name: "Великая равнина", seed: 3501 }, { id: "o35b", name: "Три переправы", seed: 3533 }],
};
const mapCache = new Map<string, MapData>();
export function officialMaps(size: number) { return (OFFICIAL[size] || []).map((o) => ({ id: o.id, name: o.name })); }
export function makeMap(size: number, id: string | null | undefined, cfg: StratCfg = STRAT_CFG): MapData {
  if (id === "open") return openMap(size);
  const list = OFFICIAL[size] || []; const off = list.find((o) => o.id === id) || (!id ? list[0] : undefined); // без id — первая официальная
  const seed = off ? off.seed : id && /^rnd:\d+$/.test(id) ? +id.slice(4) : list[0]?.seed ?? 1;
  const key = size + ":" + seed; const hit = mapCache.get(key); if (hit && off) return hit;
  const a = armyCells(size, cfg);
  const m = generateMap({ size, seed, armyRows: a.rows, armyCols: a.cells, kingCol: a.kingCol, id: off ? off.id : "rnd:" + seed, name: off ? off.name : "Случайная" });
  if (off) mapCache.set(key, m);
  return m;
}

export type GameOpts = { chiefs?: [string | undefined, string | undefined] }; // тип Вождя из лобби (виден, только если у расы > 1 доступного типа)
export function newGame(size: number, races: [Race, Race], first: 0 | 1 = 0, cfg: StratCfg = STRAT_CFG, turnLimit?: number | null, map?: MapData, opts?: GameOpts): GameState {
  const sc = cfg.sizes[size]; if (!sc) throw new Error("bad size");
  if (map && map.size !== size) throw new Error("map size");
  const g = { v: 0, size, turn: 1, first, cur: first, ap: sc.ap, apMax: sc.ap, turnLimit: 0, races, pieces: [], nextId: 1, winner: -1, reason: "", lastEv: [], map: map || openMap(size) } as unknown as GameState;
  for (const owner of [0, 1] as const) {
    sc.army.forEach((row, r) => {
      const x0 = Math.floor((size - row.length) / 2);
      row.forEach((k, i) => {
        const y = owner === 0 ? size - 1 - r : r; // игрок 0 снизу
        g.pieces.push(mkPiece(g, owner, k, x0 + i, y, cfg));
      });
    });
  }
  if (opts?.chiefs) (g as any).chiefPick = opts.chiefs;
  initEcon(g, cfg); delete (g as any).chiefPick;
  for (const k of g.pieces) if (k.kind === "king") { const b = chiefBase(g, k.owner, cfg); k.hp = k.maxHp = b.hp; k.atk = b.atk; k.arm = b.arm; }
  startTurn(g, first, [], cfg, (o, k, x, y) => mkPiece(g, o, k, x, y, cfg)); g.ap = g.apMax = apFor(g, first, cfg);
  const fa = (cfg.econ.start as any).firstAp1 || 0; if (fa > 0) g.ap = g.apMax = Math.min(g.apMax, fa); // смягчение преимущества первого хода
  return g;
}
function mkPiece(g: GameState, owner: 0 | 1, kind: Kind, x: number, y: number, cfg: StratCfg): Piece {
  if (kind === "king" && g.ec) { const b = chiefBase(g, owner, cfg); return { id: g.nextId++, owner, kind, x, y, hp: b.hp, maxHp: b.hp, atk: b.atk, arm: b.arm, acted: false, burn: 0, chill: 0, xp: 0, tal: [] }; }
  const u = cfg.units[kind], hp = Math.max(1, Math.round(u.hp * raceCfg(g, owner, cfg).hpMul));
  return { id: g.nextId++, owner, kind, x, y, hp, maxHp: hp, atk: u.atk, arm: u.arm, acted: false, burn: 0, chill: 0, xp: 0, tal: [] };
}

export const at = (g: GameState, x: number, y: number) => g.pieces.find((p) => p.x === x && p.y === y);
const inB = (g: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < g.size && y < g.size;
const fwd = (owner: number) => (owner === 0 ? -1 : 1);
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const D4 = D8.slice(0, 4), DD = D8.slice(4);
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

const canStand = (g: GameState, p: Piece, x: number, y: number) => inB(g, x, y) && !at(g, x, y) && passable(g.map, x, y, g.races[p.owner]);
function slide(g: GameState, p: Piece, dirs: number[][], max: number, out: [number, number][]) {
  for (const [dx, dy] of dirs) for (let s = 1; s <= max; s++) {
    const x = p.x + dx * s, y = p.y + dy * s;
    if (!canStand(g, p, x, y)) break;
    out.push([x, y]);
    if (stopsSlide(g.map, x, y)) break; // лес: дальше в этот ход нельзя
  }
}

/** Клетки, куда фигура может ПЕРЕЙТИ (только пустые). Обморозка: максимум 1 клетка (конь не прыгает). */
export function moveTargets(g: GameState, p: Piece, cfg: StratCfg = STRAT_CFG): [number, number][] {
  const out: [number, number][] = [], r = cfg.range;
  if ((p as any).root > 0) return out; // корни «Пробуждения леса»
  const cap = p.chill > 0 ? 1 : 99;
  switch (p.kind) {
    case "pawn": { // 1 вперёд или вбок + отступление на 1 по диагонали назад (только ход, без атаки)
      for (const [dx, dy] of [[0, fwd(p.owner)], [1, 0], [-1, 0], [1, -fwd(p.owner)], [-1, -fwd(p.owner)]]) { const x = p.x + dx, y = p.y + dy; if (canStand(g, p, x, y)) out.push([x, y]); }
      break;
    }
    case "knight": if (cap >= 2) for (const [dx, dy] of KN) { const x = p.x + dx, y = p.y + dy; if (canStand(g, p, x, y)) out.push([x, y]); } break; // прыжок через рельеф, но приземляется на проходимую
    case "mage": slide(g, p, DD, Math.min(cap, Math.max(1, r.mageMove + ((cfg.race as any)[g.races[p.owner]].mageMove || 0))), out); break;
    case "rook": slide(g, p, D4, Math.min(cap, r.rookMove), out); break;
    case "hero": slide(g, p, D8, Math.min(cap, r.heroMove), out); break;
    case "king": slide(g, p, D8, 1, out); break;
  }
  return out;
}

/** Клетки с вражескими фигурами, которые можно атаковать. */
export function attackTargets(g: GameState, p: Piece, cfg: StratCfg = STRAT_CFG): [number, number][] {
  return hitCells(g, p, cfg).filter(([x, y]) => { const t = inB(g, x, y) && at(g, x, y); return !!t && t.owner !== p.owner; });
}
/** Клетки, по которым фигура может ударить (геометрия удара без учёта цели). */
export function hitCells(g: GameState, p: Piece, cfg: StratCfg = STRAT_CFG): [number, number][] {
  const cells: [number, number][] = [];
  switch (p.kind) {
    case "pawn": cells.push([p.x + 1, p.y + fwd(p.owner)], [p.x - 1, p.y + fwd(p.owner)]); break;
    case "knight": for (const [dx, dy] of KN) cells.push([p.x + dx, p.y + dy]); break;
    case "mage": for (const [dx, dy] of DD) for (let s = 1, R = mageShot(g, p, cfg); s <= R; s++) {
      const x = p.x + dx * s, y = p.y + dy * s; cells.push([x, y]);
      if (!inB(g, x, y) || blocksShot(g.map, x, y)) break; // обстрел закрывают стены и горы
    } break;
    case "rook": for (const [dx, dy] of D4) cells.push([p.x + dx, p.y + dy]); break;
    case "hero": case "king": for (const [dx, dy] of D8) cells.push([p.x + dx, p.y + dy]); break;
  }
  return cells.filter(([x, y]) => inB(g, x, y));
}
/** Вражеские города в зоне удара фигуры, где можно бить постройки: на клетке города нет защитника (сначала гарнизон). */
export function razeTargets(g: GameState, p: Piece, cfg: StratCfg = STRAT_CFG): { city: number; b: string[] }[] {
  if (!g.ec) return []; const H = hitCells(g, p, cfg), out: { city: number; b: string[] }[] = [];
  for (const c of g.ec.cities) { if (c.owner === p.owner || !c.bld.length || !H.some(([x, y]) => x === c.x && y === c.y)) continue;
    const d = at(g, c.x, c.y); if (d && d.owner === c.owner) continue; out.push({ city: c.id, b: [...new Set(c.bld)] }); }
  for (const t of g.ec.towers || []) { if (t.owner === p.owner || !H.some(([x, y]) => x === t.x && y === t.y)) continue; // t1140: Сторожевые башни
    const d = at(g, t.x, t.y); if (d && d.owner === t.owner) continue; out.push({ city: t.id, b: ["watchtower"] }); }
  return out;
}

export function damage(g: GameState, a: Piece, t: Piece, cfg: StratCfg = STRAT_CFG): number {
  const mul = elementMul(g.races[a.owner], g.races[t.owner], cfg);
  return Math.max(1, Math.round((effAtk(g, a, t, cfg) - effArm(g, t, cfg) - coverArm(g.map, t.x, t.y)) * mul - 1e-9)); // ровно .5 округляем вниз: иначе +10% превращается в +20% на малом уроне // лес/ворота/башня — укрытие; технологии/Кузня/Стена
}

/** t1156: структурный разбор удара: части АТК и БРН по источникам, укрытие, множитель стихий, бонус «Выпада», итог.
 *  dmg = max(1, round((Σatk − Σarm − cover) × mul)) + pow. Пассивки, сработавшие после удара, — в on[] (burn/chill/chain/…). */
export type HitX = { atk: import("./econ").Part[]; arm: import("./econ").Part[]; cover: number; mul: number; el: [Race, Race]; pow: number; dmg: number; min1: boolean; shield: number; on: string[] };
export function hitExplain(g: GameState, a: Piece, t: Piece, cfg: StratCfg, pow = 0, dmg?: number): HitX {
  const atk = explainAtk(g, a, t, cfg), arm = explainArm(g, t, cfg), cover = coverArm(g.map, t.x, t.y), mul = elementMul(g.races[a.owner], g.races[t.owner], cfg);
  const raw = (atk.reduce((s, q) => s + q.n, 0) - Math.max(0, arm.reduce((s, q) => s + q.n, 0)) - cover) * mul;
  return { atk, arm, cover, mul, el: [g.races[a.owner], g.races[t.owner]], pow, dmg: dmg ?? damage(g, a, t, cfg) + pow, min1: Math.round(raw - 1e-9) < 1, shield: 0, on: [] };
}

/** Шах: Вождь игрока side под ударом хотя бы одной вражеской фигуры. */
export function inCheck(g: GameState, side: 0 | 1, cfg: StratCfg = STRAT_CFG): boolean {
  const k = g.pieces.find((p) => p.owner === side && p.kind === "king"); if (!k) return false;
  return g.pieces.some((p) => p.owner !== side && attackTargets(g, p, cfg).some(([x, y]) => x === k.x && y === k.y));
}

export type Result = { ok: true; ev: Ev[] } | { ok: false; err: string };

/** Применить действие игрока side. Мутирует g только при ok. */
export function apply(g: GameState, side: 0 | 1, act: Action, cfg: StratCfg = STRAT_CFG): Result {
  if (g.winner !== -1) return { ok: false, err: "game_over" };
  if (side !== g.cur) return { ok: false, err: "not_your_turn" };
  { const id = (act as any).id; const f = g.ec?.fnd?.[side]; if (f && id === f.id && (act.a as string) !== "found_cancel" && act.a !== "end") return { ok: false, err: "channeling" }; } // t1140: Вождь закладывает поселение
  const ev: Ev[] = [];
  if (act.a === "end") { endTurn(g, ev, cfg); return done(g, ev); }
  if (ECON_ACTS.includes(act.a)) {
    const r = applyEcon(g, side, act as EconAction, cfg, (o, k, x, y) => mkPiece(g, o, k, x, y, cfg));
    const kq: [number, number][] = (g as any)._killQ || []; delete (g as any)._killQ;
    if (!r.ok) return r;
    for (const [tid, bid] of kq) { const t = g.pieces.find((q) => q.id === tid), b = g.pieces.find((q) => q.id === bid); if (t && t.hp <= 0) kill(g, t, b, r.ev, cfg); } // выстрел умения добил
    ev.push(...r.ev); checkWin(g, ev, cfg);
    if (act.a === "found" && g.winner === -1 && g.ap <= 0 && !hasFree(g, side, cfg)) endTurn(g, ev, cfg);
    return done(g, ev);
  }
  if (act.a === "ult") {
    const p = g.pieces.find((q) => q.id === (act as any).id && q.owner === side); if (!p) return { ok: false, err: "bad_piece" };
    const ul = ultOf(g, p, cfg); if (!ul) return { ok: false, err: "no_ult" };
    if ((p.cds?.[ul.key] || 0) > 0) return { ok: false, err: "cooldown" };
    const x = (act as any).x | 0, y = (act as any).y | 0, e = canUlt(g, side, p, ul.u, x, y); if (e) return { ok: false, err: e };
    const hasW = g.ec?.cities.some((c) => c.owner === side && c.bld.includes("wonder")), pw = tfx(g, side, "ultPow", cfg) + (hasW ? tfx(g, side, "wonderUlt", cfg) : 0), uu = pw && (ul.u.dmg || ul.u.heal || ul.u.shield) ? { ...ul.u, dmg: ul.u.dmg ? ul.u.dmg + pw : ul.u.dmg, heal: ul.u.heal ? ul.u.heal + pw : ul.u.heal, shield: ul.u.shield ? ul.u.shield + pw : ul.u.shield } : ul.u; // t1139: эпоха IV усиливает ульты
    const tp = tfx(g, side, "ultPow", cfg), wp = hasW ? tfx(g, side, "wonderUlt", cfg) : 0; // t1163: части усиления для hit.why
    const ux = { ...uu, _x: { id: ul.id, px: ul.u.dmg ? [...(tp ? [{ k: "ultPow", n: tp, src: "tech", side }] : []), ...(wp ? [{ k: "wonderUlt", n: wp, src: "bld", side }] : [])] : [] } } as typeof uu;
    castUlt(g, side, p, ul.id, ux, x, y, ev, { kill: (t, by) => kill(g, t, by, ev, cfg), onHit: (a, t, k) => onHit(g, a, t, k, ev, cfg), mk: (o, k, xx, yy) => mkPiece(g, o, k, xx, yy, cfg), pop: (cfg.econ.sizes as any)[g.size]?.pop || 99 });
    p.cds = { ...(p.cds || {}), [ul.key]: Math.max(1, ul.u.cd - tfx(g, side, "ultCd", cfg) - (g.ec?.cities.some((c) => c.owner === side && c.bld.includes("wonder")) ? tfx(g, side, "wonderCd", cfg) : 0)) }; p.acted = true; g.ap -= ul.u.ap;
    checkWin(g, ev, cfg);
    if (g.winner === -1 && g.ap <= 0 && !hasFree(g, side, cfg)) endTurn(g, ev, cfg);
    return done(g, ev);
  }
  if (act.a === "raze") return raze(g, side, act, ev, cfg);
  if (act.a !== "move" && act.a !== "attack") return { ok: false, err: "bad_action" };
  const p = g.pieces.find((q) => q.id === act.id);
  if (!p || p.owner !== side) return { ok: false, err: "bad_piece" };
  if (p.acted) return { ok: false, err: "already_acted" };
  if (g.ap < 1) return { ok: false, err: "no_ap" };
  const x = act.x | 0, y = act.y | 0;
  if (act.a === "move") {
    if (!moveTargets(g, p, cfg).some(([a, b]) => a === x && b === y)) return { ok: false, err: "bad_move" };
    p.x = x; p.y = y; ev.push({ e: "move", id: p.id, x, y });
    promote(g, p, act.promo, ev, cfg); onEnter(g, p, ev, cfg);
  } else if (act.a === "attack") {
    if (!attackTargets(g, p, cfg).some(([a, b]) => a === x && b === y)) return { ok: false, err: "bad_attack" };
    const t = at(g, x, y)!;
    const pow = (p as any).pow || 0, dmg = damage(g, p, t, cfg) + pow; delete (p as any).pow; // «Выпад»/«Сшибка»: следующий удар сильнее
    const xp = hitExplain(g, p, t, cfg, pow, dmg); // t1156: разбор урона для подсказки (до изменения состояния)
    const dealt = absorb(t, dmg, ev); t.hp -= dealt; xp.shield = dmg - dealt; // щит (купол) съедает урон первым
    const race = g.races[side];
    const burn = (race === "fire" || chiefFx(g, p, "burn", cfg) > 0) && t.hp > 0, chill = race === "ice" && t.hp > 0;
    if (burn) t.burn = burnTurns(g, side, cfg);
    if (chill) t.chill = Math.max(t.chill, chillTurns(g, side, cfg));
    if (burn) xp.on.push("burn"); if (chill) xp.on.push("chill");
    ev.push({ e: "hit", id: p.id, t: t.id, dmg, hp: Math.max(0, t.hp), ...(burn ? { burn } : {}), ...(chill ? { chill } : {}), why: xp } as any);
    { const k0 = ev.length; onHit(g, p, t, t.hp <= 0, ev, cfg); for (const e of ev.slice(k0)) if (!xp.on.includes(e.e)) xp.on.push(e.e); } // сработавшие пассивки
    // Молния: первый удар хода — разряд по одному соседнему с целью врагу (Громоотвод / «Статика» +1)
    const ch = raceCfg(g, p.owner, cfg).chain || 0; // t1163: по лиге
    if (ch > 0 && g.ec && !(g as any).zap) {
      (g as any).zap = 1;
      const n = g.pieces.filter((q) => q.owner !== side && q !== t && Math.max(Math.abs(q.x - t.x), Math.abs(q.y - t.y)) <= 1).sort((a, b) => a.hp - b.hp)[0];
      if (n) { xp.on.push("chain");
        const zd = ch + (g.ec.cities.some((c) => c.owner === side && c.bld.includes("lightningrod")) ? cfg.econ.fx.rodChain : 0) + (g.ec.techs[side].includes("static") ? cfg.econ.fx.staticChain : 0);
        n.hp -= absorb(n, zd, ev); ev.push({ e: "zap", id: p.id, t: n.id, dmg: zd, hp: Math.max(0, n.hp) });
        if (n.hp <= 0) { onHit(g, p, n, true, ev, cfg); kill(g, n, p, ev, cfg); }
      }
    }
    if (t.hp <= 0) {
      kill(g, t, p, ev, cfg);
      if (p.kind !== "mage") { p.x = x; p.y = y; ev.push({ e: "move", id: p.id, x, y }); promote(g, p, undefined, ev, cfg); onEnter(g, p, ev, cfg); } // ближний встаёт на клетку
    }
  } else return { ok: false, err: "bad_action" };
  p.acted = true; g.ap -= 1;
  checkWin(g, ev, cfg);
  if (g.winner === -1 && g.ap <= 0 && !hasFree(g, side, cfg)) endTurn(g, ev, cfg); // ОД кончились и делать в городах нечего — ход передаётся сам
  return done(g, ev);
}
/** Удар по постройке (t1136): 1 ОД, фигура действует; урон = max(1, АТК − БРН постройки) × круг стихий; у Стены — ответный удар вплотную. */
function raze(g: GameState, side: 0 | 1, act: { id: number; city: number; b: string }, ev: Ev[], cfg: StratCfg): Result {
  const p = g.pieces.find((q) => q.id === act.id);
  if (!p || p.owner !== side) return { ok: false, err: "bad_piece" }; if (p.acted) return { ok: false, err: "already_acted" }; if (g.ap < 1) return { ok: false, err: "no_ap" };
  const T = razeTargets(g, p, cfg).find((t) => t.city === act.city); if (!T || !T.b.includes(act.b)) return { ok: false, err: "bad_raze" };
  if (act.b === "watchtower") { // t1140: удар по Сторожевой башне (HP в ec.tbhp)
    const tw = g.ec!.towers!.find((t) => t.id === act.city)!, st = bldStat(cfg, "watchtower" as any), max = st.hp, mul = elementMul(g.races[side], g.races[tw.owner], cfg);
    const dmg = Math.max(1, Math.round((effAtk(g, p, null, cfg) - st.arm) * mul - 1e-9)), bh = (g.ec!.tbhp ||= {}), hp = Math.max(0, (bh[tw.id] ?? max) - dmg); bh[tw.id] = hp;
    ev.push({ e: "bhit", id: p.id, city: tw.id, tower: true, owner: tw.owner, b: "watchtower", dmg, hp, max, x: tw.x, y: tw.y });
    const H = (cfg as any).bldHp;
    if (hp <= 0) { g.ec!.towers = g.ec!.towers!.filter((t) => t !== tw); delete bh[tw.id]; ev.push({ e: "bdestroy", id: p.id, city: tw.id, tower: true, b: "watchtower", by: side, owner: tw.owner, x: tw.x, y: tw.y });
      if (H.razeGlory) addGlory(g, side, H.razeGlory, "raze", ev); }
    if (H.razeXp) gainXp(g, p, H.razeXp, ev, cfg);
    if (st.counter && hp > 0 && Math.max(Math.abs(p.x - tw.x), Math.abs(p.y - tw.y)) <= 1) {
      const cd = Math.max(1, st.counter - effArm(g, p, cfg) + 1); p.hp -= cd; ev.push({ e: "bcounter", city: tw.id, tower: true, b: "watchtower", t: p.id, dmg: cd, hp: Math.max(0, p.hp) });
      if (p.hp <= 0) kill(g, p, undefined, ev, cfg); }
    p.acted = true; g.ap -= 1; checkWin(g, ev, cfg);
    if (g.winner === -1 && g.ap <= 0 && !hasFree(g, side, cfg)) endTurn(g, ev, cfg);
    return done(g, ev);
  }
  const c = g.ec!.cities.find((x) => x.id === act.city)!, b = act.b as any, st = bldStat(cfg, b), max = bldMaxHp(g, c, b, cfg);
  const mul = elementMul(g.races[side], g.races[c.owner], cfg);
  const dmg = Math.max(1, Math.round((effAtk(g, p, null, cfg) - st.arm) * mul - 1e-9));
  const bh = (c.bhp ||= {}) as Record<string, number>; const hp = Math.max(0, (bh[b] ?? max) - dmg); bh[b] = hp;
  ev.push({ e: "bhit", id: p.id, city: c.id, b, dmg, hp, max });
  const H = (cfg as any).bldHp;
  if (hp <= 0) { // разрушена: эффекты пропадают (все бонусы читаются из c.bld), слот свободен, остаются руины
    const i = c.bld.indexOf(b); c.bld.splice(i, 1); delete bh[b];
    if (b === "forge") c.forge.splice(Math.max(0, c.forge.length - 1), 1);
    if (!c.bld.includes(b)) (c.ruin ||= []).includes(b) || c.ruin!.push(b);
    ev.push({ e: "bdestroy", id: p.id, city: c.id, b, by: side, owner: c.owner });
    if (H.razeGlory) addGlory(g, side, H.razeGlory, "raze", ev);
  }
  if (H.razeXp) gainXp(g, p, H.razeXp, ev, cfg);
  if (st.counter && Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 1) { // Стена бьёт в ответ вплотную стоящих
    const cd = Math.max(1, st.counter - effArm(g, p, cfg) + 1); p.hp -= cd; ev.push({ e: "bcounter", city: c.id, b, t: p.id, dmg: cd, hp: Math.max(0, p.hp) });
    if (p.hp <= 0) kill(g, p, undefined, ev, cfg);
  }
  p.acted = true; g.ap -= 1;
  checkWin(g, ev, cfg);
  if (g.winner === -1 && g.ap <= 0 && !hasFree(g, side, cfg)) endTurn(g, ev, cfg);
  return done(g, ev);
}
function done(g: GameState, ev: Ev[]): Result { g.v++; g.lastEv = ev; return { ok: true, ev }; }

function promote(g: GameState, p: Piece, to: Kind | undefined, ev: Ev[], cfg: StratCfg) {
  if (p.kind !== "pawn") return;
  const last = p.owner === 0 ? 0 : g.size - 1;
  if (p.y !== last) return;
  const kind: Kind = to && PROMO_OK.includes(to) ? to : "rook";
  const u = cfg.units[kind], mul = raceCfg(g, p.owner, cfg).hpMul;
  const maxHp = Math.max(1, Math.round(u.hp * mul));
  p.kind = kind; p.tal = []; p.atk = u.atk; p.arm = u.arm; p.hp = Math.max(1, Math.round(maxHp * (p.hp / p.maxHp))); p.maxHp = maxHp;
  ev.push({ e: "promote", id: p.id, kind });
}
/** ультимейт фигуры: Вождь — узел дерева с ult; обычная фигура — UNIT_ULTS (если взят ур. 5) */
export function ultOf(g: GameState, p: Piece, cfg: StratCfg): { id: string; key: string; u: any } | null {
  const U = (cfg as any).ults || {};
  if (p.kind === "king") { const id = (p.tal || []).map((t) => chiefNode(cfg, g, p.owner, t)).find((n) => n?.ult)?.ult; return id && U[id] ? { id, key: "ult", u: U[id] } : null; }
  if (pieceLevel(p, cfg) < 5) return null; const uid = (cfg as any).unitTree?.[p.kind]?.ult as string | undefined, UU = (cfg as any).unitUlts || {};
  return uid && UU[uid] ? { id: uid, key: "ult", u: { ...UU[uid], name: (cfg as any).unitRaceNames?.[g.races[p.owner]]?.[uid] || UU[uid].name } } : null;
}
function kill(g: GameState, t: Piece, by: Piece | undefined, ev: Ev[], cfg: StratCfg) {
  g.pieces = g.pieces.filter((q) => q !== t);
  ev.push({ e: "kill", id: t.id, o: t.owner, by: by?.id || 0 });
  if (g.ec && by && by.owner !== t.owner) { const ec = g.ec as any; (ec.kt ||= [0, 0])[by.owner]++; }
  if (t.kind === "king") chiefDown(g, t, by, ev, cfg); // партия продолжается: новый Вождь через cfg.chief.respawn ходов
}
/** Победа: первый, кто выполнил need целей (TZ §14 «Цели»). Поражение без фигур и городов («разгром»). */
function checkWin(g: GameState, ev: Ev[], cfg: StratCfg = STRAT_CFG) {
  if (!g.ec) { for (const s of [0, 1] as const) if (!g.pieces.some((p) => p.owner === s && p.kind === "king")) { finish(g, (1 - s) as 0 | 1, "king", ev); return; } return; }
  const gw = goalWinner(g, cfg); if (gw >= 0) { finish(g, gw as 0 | 1, "goals", ev); return; }
  for (const s of [0, 1] as const) if (!g.pieces.some((p) => p.owner === s) && !g.ec.cities.some((c) => c.owner === s)) { finish(g, (1 - s) as 0 | 1, "wipe", ev); return; }
}
/** Итог на лимите ходов: больше целей → больше Славы → больше материала; иначе ничья. */
export function limitRank(g: GameState, side: 0 | 1, cfg: StratCfg = STRAT_CFG): number[] {
  return [g.ec ? g.ec.goals[side].length : 0, g.ec ? g.ec.res[side].glory : 0, Math.round(score(g, side, cfg) * 10)];
}
export function finish(g: GameState, winner: 0 | 1 | 2, reason: string, ev: Ev[]) {
  if (g.winner !== -1) return;
  g.winner = winner; g.reason = reason; ev.push({ e: "end", winner, reason });
}
/** Материал (сумма цен живых фигур × доля HP; Вождь = 10) — справочно и для бота; на лимите решает Слава (limitScore). */
export function score(g: GameState, side: 0 | 1, cfg: StratCfg = STRAT_CFG): number {
  return g.pieces.filter((p) => p.owner === side).reduce((s, p) => s + (p.kind === "king" ? 10 : cfg.units[p.kind].cost) * (p.hp / p.maxHp), 0);
}

function endTurn(g: GameState, ev: Ev[], cfg: StratCfg) {
  const prev = g.cur;
  if (g.ec) { const ec = g.ec as any; (ec.rap ||= [{}, {}])[prev] = { kills: ec.kt?.[prev] || 0, full: g.ap <= 0 }; if (ec.kt) ec.kt[prev] = 0; } // t1143: условия «Силы стихии»
  for (const p of g.pieces) if (p.owner === prev) { p.acted = false; if (p.chill > 0) { p.chill--; if (!p.chill) p.cm = 1; } else if (p.cm) p.cm = 0; } // cm: «была обморожена» до конца следующего хода (для «Инея»)
  const next = (1 - prev) as 0 | 1;
  if (next === g.first) g.turn++; // номер хода растёт, когда круг вернулся к первому игроку
  // Лимита ходов НЕТ (решение Алекса, t1135): партия кончается только целями (need из 5), сдачей, «забрать победу» или разгромом.
  // Ни ничьей по лимиту, ни подсчёта очков, ни автоничьей «тихих» ходов. Страховочный потолок есть только в симуляторах.
  if (g.ec) g.ec.quiet++;
  g.cur = next; (g as any).zap = 0;
  // Вода: лечение своих фигур на своей земле
  const hw = raceCfg(g, next, cfg).healOwnT || 0, hn = tfx(g, next, "heal" as any, cfg);
  if ((hw || hn) && g.ec) { const T = territory(g, cfg); for (const p of g.pieces) if (p.owner === next && p.hp < p.maxHp && T[p.y * g.size + p.x] === next) { const h = Math.min(hw + hn, p.maxHp - p.hp); p.hp += h; ev.push({ e: "heal", id: p.id, hp: p.hp, n: h }); } }
  // колодец: лечит свою фигуру, стоящую на нём, в начале её хода
  for (const p of g.pieces) if (p.owner === next && p.hp < p.maxHp && mapStr(g.map, p.x, p.y) === "W") { const h = Math.min(TER_RULES.wellHeal, p.maxHp - p.hp); p.hp += h; ev.push({ e: "heal", id: p.id, hp: p.hp, n: h }); }
  ultTurnStart(g, next, ev); // горящая земля DOOM, щиты, корни
  // поджог: урон в начале хода владельца горящей фигуры
  for (const p of [...g.pieces]) if (p.owner === next && p.burn > 0) {
    const bd = burnDmg(g, next, cfg); p.burn--; p.hp -= bd; ev.push({ e: "burn", id: p.id, dmg: bd, hp: Math.max(0, p.hp) });
    if (p.hp <= 0) kill(g, p, undefined, ev, cfg);
  }
  checkWin(g, ev, cfg); if (g.winner !== -1) return;
  startTurn(g, next, ev, cfg, (o, k, x, y) => mkPiece(g, o, k, x, y, cfg)); g.ap = g.apMax = apFor(g, next, cfg);
  checkWin(g, ev, cfg);
  if (g.winner === -1) ev.push({ e: "turn", cur: next, turn: g.turn });
}

/** Бот: сначала экономика (таланты → эпоха → исследование → города → застава), затем жадно — убийство > выгодный удар > ход к цели. */
export function botAction(g: GameState, side: 0 | 1, cfg: StratCfg = STRAT_CFG): Action {
  const e = botEcon(g, side, cfg); if (e) return e;
  if (g.ap < 1) return { a: "end" };
  const mine = g.pieces.filter((p) => p.owner === side && !p.acted && p.id !== g.ec?.fnd?.[side]?.id); // закладывающий поселение (channeling) не ходит и не бьёт — раньше бот пытался и ловил недопустимое действие
  let best: { s: number; act: Action } | null = null;
  const ek = g.pieces.find((p) => p.owner !== side && p.kind === "king");
  const ecap = g.ec?.cities.find((c) => c.owner !== side && c.cap);
  const myCities = g.ec?.cities.filter((c) => c.owner === side) || [];
  const sieging = new Set(g.pieces.filter((p) => p.owner !== side && myCities.some((c) => c.x === p.x && c.y === p.y)).map((p) => p.id));
  for (const p of mine) {
    for (const [x, y] of attackTargets(g, p, cfg)) {
      const t = at(g, x, y)!; const d = damage(g, p, t, cfg);
      const s = (d >= t.hp ? 100 + (t.kind === "king" ? 1000 : cfg.units[t.kind].cost) : d * 2) + (t.kind === "king" ? 20 : 0) + (sieging.has(t.id) ? 300 : 0);
      if (!best || s > best.s) best = { s, act: { a: "attack", id: p.id, x, y } };
    }
    const home = p.kind === "king" ? botChiefHome(g, side, cfg) : null;
    if (p.kind === "king" && !home) continue;
    // цель фигуры устойчива (по id), а не монетка на каждом действии — раньше фигуры дрожали между столицей и Вождём и не доходили
    const goal = home || (p.kind === "pawn" && botPawnGoal(g, p, cfg)) || (ecap && ek ? (p.id % 2 ? ecap : ek) : ecap || ek);
    for (const [x, y] of moveTargets(g, p, cfg)) {
      const dist = goal ? Math.max(Math.abs(goal.x - x), Math.abs(goal.y - y)) : 0;
      const cur = goal ? Math.max(Math.abs(goal.x - p.x), Math.abs(goal.y - p.y)) : 0;
      let s = 10 - dist * 0.5 + (dist < cur ? 1 : 0) + Math.random() * 0.1 + (home ? 40 : 0);
      if (ecap && ecap.x === x && ecap.y === y) s += 60; // осада столицы
      if (!best || s > best.s) best = { s, act: { a: "move", id: p.id, x, y } };
    }
  }
  return best ? best.act : { a: "end" };
}

/** Снимок для клиента (этап 1 — без тумана: всё видно обоим). */
export function view(g: GameState, withMap = true, cfg: StratCfg = STRAT_CFG) {
  return { v: g.v, ...(withMap ? { map: g.map } : {}), size: g.size, turn: g.turn, cur: g.cur, ap: g.ap, apMax: g.apMax, turnLimit: g.turnLimit, races: g.races, winner: g.winner, reason: g.reason, first: g.first,
    pieces: g.pieces.map((p) => ({ id: p.id, o: p.owner, k: p.kind, x: p.x, y: p.y, hp: p.hp, mh: p.maxHp, atk: p.atk, arm: p.arm, a: p.acted ? 1 : 0, b: p.burn, c: p.chill,
      ...(p.xp ? { xp: p.xp } : {}), ...(p.tal?.length ? { tl: p.tal } : {}), ...(p.mv ? { mv: 1 } : {}), ...(p.cm ? { cm: 1 } : {}), ...((p as any).sh > 0 ? { sh: (p as any).sh } : {}), ...((p as any).root > 0 ? { rt: (p as any).root } : {}), ...((p as any).treant ? { tr: 1 } : {}), ea: effAtk(g, p, null, cfg), er: effArm(g, p, cfg) })),
    ec: g.ec, glory: cfg.econ.sizes[g.size]?.glory || 0 };
}
