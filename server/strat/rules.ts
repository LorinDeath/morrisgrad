// «Партия Чёрных королей» — движок правил (этап 1). Чистые функции без I/O: один модуль для сервера (StratMatch),
// клиента (подсветка ходов), бота и симулятора. Все числа — в STRAT_CFG (позже правятся в админке, game_overrides strat_*).

export type Race = "fire" | "ice";
export type Kind = "pawn" | "knight" | "mage" | "rook" | "hero" | "king";
export const RACES: Race[] = ["fire", "ice"];
export const KINDS: Kind[] = ["pawn", "knight", "mage", "rook", "hero", "king"];

export type UnitStats = { hp: number; atk: number; arm: number; cost: number };
export type SizeCfg = {
  size: number; turnLimit: number; turnSec: number; reserveSec: number; ap: number;
  army: Kind[][]; // ряды от задней линии вперёд, центрировано по ширине
};

export const STRAT_CFG = {
  version: 1,
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
    ice: { hpMul: 1.0, chillMove: 1 },
  },
  sizes: {
    5: { size: 5, turnLimit: 15, turnSec: 20, reserveSec: 60, ap: 1, army: [["knight", "king", "rook"]] },
    8: { size: 8, turnLimit: 25, turnSec: 40, reserveSec: 180, ap: 2, army: [["rook", "knight", "king", "mage", "rook"], ["pawn", "pawn", "pawn", "pawn"]] },
    15: { size: 15, turnLimit: 40, turnSec: 60, reserveSec: 300, ap: 3, army: [["rook", "mage", "knight", "king", "hero", "knight", "mage", "rook"], ["pawn", "pawn", "pawn", "pawn", "pawn", "pawn"]] },
  } as Record<number, SizeCfg>,
};
export type StratCfg = typeof STRAT_CFG;
export const SIZES = [5, 8, 15];

// круг стихий: BEATS[a] = кого a бьёт сильнее
const CYCLE = ["water", "fire", "ice", "nature", "stone", "lightning"];
export function elementMul(att: string, def: string, cfg: StratCfg = STRAT_CFG): number {
  const i = CYCLE.indexOf(att), j = CYCLE.indexOf(def);
  if (i < 0 || j < 0) return 1;
  return (i + 1) % CYCLE.length === j ? 1 + cfg.elementBonus : 1;
}

export type Piece = { id: number; owner: 0 | 1; kind: Kind; x: number; y: number; hp: number; maxHp: number; atk: number; arm: number; acted: boolean; burn: number; chill: number };
export type Seat = { race: Race };
export type GameState = {
  v: number; size: number; turn: number; first: 0 | 1; cur: 0 | 1; ap: number; apMax: number; turnLimit: number;
  races: [Race, Race]; pieces: Piece[]; nextId: number;
  winner: -1 | 0 | 1 | 2; // -1 идёт, 2 ничья
  reason: string; lastEv: Ev[];
};
export type Ev =
  | { e: "move"; id: number; x: number; y: number }
  | { e: "hit"; id: number; t: number; dmg: number; hp: number; burn?: boolean; chill?: boolean }
  | { e: "kill"; id: number; by: number }
  | { e: "burn"; id: number; dmg: number; hp: number }
  | { e: "promote"; id: number; kind: Kind }
  | { e: "turn"; cur: 0 | 1; turn: number }
  | { e: "end"; winner: number; reason: string };
export type Action =
  | { a: "move"; id: number; x: number; y: number; promo?: Kind }
  | { a: "attack"; id: number; x: number; y: number }
  | { a: "end" };

const PROMO_OK: Kind[] = ["knight", "mage", "rook"];

export function newGame(size: number, races: [Race, Race], first: 0 | 1 = 0, cfg: StratCfg = STRAT_CFG): GameState {
  const sc = cfg.sizes[size]; if (!sc) throw new Error("bad size");
  const g: GameState = { v: 0, size, turn: 1, first, cur: first, ap: sc.ap, apMax: sc.ap, turnLimit: sc.turnLimit, races, pieces: [], nextId: 1, winner: -1, reason: "", lastEv: [] };
  for (const owner of [0, 1] as const) {
    sc.army.forEach((row, r) => {
      const x0 = Math.floor((size - row.length) / 2);
      row.forEach((k, i) => {
        const y = owner === 0 ? size - 1 - r : r; // игрок 0 снизу
        g.pieces.push(mkPiece(g, owner, k, x0 + i, y, cfg));
      });
    });
  }
  return g;
}
function mkPiece(g: GameState, owner: 0 | 1, kind: Kind, x: number, y: number, cfg: StratCfg): Piece {
  const u = cfg.units[kind], hp = Math.max(1, Math.round(u.hp * (cfg.race as any)[g.races[owner]].hpMul));
  return { id: g.nextId++, owner, kind, x, y, hp, maxHp: hp, atk: u.atk, arm: u.arm, acted: false, burn: 0, chill: 0 };
}

export const at = (g: GameState, x: number, y: number) => g.pieces.find((p) => p.x === x && p.y === y);
const inB = (g: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < g.size && y < g.size;
const fwd = (owner: number) => (owner === 0 ? -1 : 1);
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const D4 = D8.slice(0, 4), DD = D8.slice(4);
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

function slide(g: GameState, p: Piece, dirs: number[][], max: number, out: [number, number][]) {
  for (const [dx, dy] of dirs) for (let s = 1; s <= max; s++) {
    const x = p.x + dx * s, y = p.y + dy * s;
    if (!inB(g, x, y) || at(g, x, y)) break;
    out.push([x, y]);
  }
}

/** Клетки, куда фигура может ПЕРЕЙТИ (только пустые). Обморозка: максимум 1 клетка (конь не прыгает). */
export function moveTargets(g: GameState, p: Piece, cfg: StratCfg = STRAT_CFG): [number, number][] {
  const out: [number, number][] = [], r = cfg.range;
  const cap = p.chill > 0 ? 1 : 99;
  switch (p.kind) {
    case "pawn": {
      for (const [dx, dy] of [[0, fwd(p.owner)], [1, 0], [-1, 0]]) { const x = p.x + dx, y = p.y + dy; if (inB(g, x, y) && !at(g, x, y)) out.push([x, y]); }
      break;
    }
    case "knight": if (cap >= 2) for (const [dx, dy] of KN) { const x = p.x + dx, y = p.y + dy; if (inB(g, x, y) && !at(g, x, y)) out.push([x, y]); } break;
    case "mage": slide(g, p, DD, Math.min(cap, r.mageMove), out); break;
    case "rook": slide(g, p, D4, Math.min(cap, r.rookMove), out); break;
    case "hero": slide(g, p, D8, Math.min(cap, r.heroMove), out); break;
    case "king": slide(g, p, D8, 1, out); break;
  }
  return out;
}

/** Клетки с вражескими фигурами, которые можно атаковать. */
export function attackTargets(g: GameState, p: Piece, cfg: StratCfg = STRAT_CFG): [number, number][] {
  const cells: [number, number][] = [];
  switch (p.kind) {
    case "pawn": cells.push([p.x + 1, p.y + fwd(p.owner)], [p.x - 1, p.y + fwd(p.owner)]); break;
    case "knight": for (const [dx, dy] of KN) cells.push([p.x + dx, p.y + dy]); break;
    case "mage": for (const [dx, dy] of DD) for (let s = 1; s <= cfg.range.mageShot; s++) cells.push([p.x + dx * s, p.y + dy * s]); break;
    case "rook": for (const [dx, dy] of D4) cells.push([p.x + dx, p.y + dy]); break;
    case "hero": case "king": for (const [dx, dy] of D8) cells.push([p.x + dx, p.y + dy]); break;
  }
  return cells.filter(([x, y]) => { const t = inB(g, x, y) && at(g, x, y); return !!t && t.owner !== p.owner; });
}

export function damage(g: GameState, a: Piece, t: Piece, cfg: StratCfg = STRAT_CFG): number {
  const mul = elementMul(g.races[a.owner], g.races[t.owner], cfg);
  return Math.max(1, Math.round((a.atk - t.arm) * mul));
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
  const ev: Ev[] = [];
  if (act.a === "end") { endTurn(g, ev, cfg); return done(g, ev); }
  const p = g.pieces.find((q) => q.id === act.id);
  if (!p || p.owner !== side) return { ok: false, err: "bad_piece" };
  if (p.acted) return { ok: false, err: "already_acted" };
  if (g.ap < 1) return { ok: false, err: "no_ap" };
  const x = act.x | 0, y = act.y | 0;
  if (act.a === "move") {
    if (!moveTargets(g, p, cfg).some(([a, b]) => a === x && b === y)) return { ok: false, err: "bad_move" };
    p.x = x; p.y = y; ev.push({ e: "move", id: p.id, x, y });
    promote(g, p, act.promo, ev, cfg);
  } else if (act.a === "attack") {
    if (!attackTargets(g, p, cfg).some(([a, b]) => a === x && b === y)) return { ok: false, err: "bad_attack" };
    const t = at(g, x, y)!;
    const dmg = damage(g, p, t, cfg);
    t.hp -= dmg;
    const race = g.races[side];
    const burn = race === "fire" && t.hp > 0, chill = race === "ice" && t.hp > 0;
    if (burn) t.burn = cfg.race.fire.burnTurns;
    if (chill) t.chill = 1;
    ev.push({ e: "hit", id: p.id, t: t.id, dmg, hp: Math.max(0, t.hp), ...(burn ? { burn } : {}), ...(chill ? { chill } : {}) });
    if (t.hp <= 0) {
      kill(g, t, p.id, ev);
      if (p.kind !== "mage") { p.x = x; p.y = y; ev.push({ e: "move", id: p.id, x, y }); promote(g, p, undefined, ev, cfg); } // ближний встаёт на клетку
    }
  } else return { ok: false, err: "bad_action" };
  p.acted = true; g.ap -= 1;
  checkWin(g, ev);
  if (g.winner === -1 && g.ap <= 0) endTurn(g, ev, cfg); // ОД кончились — ход передаётся сам
  return done(g, ev);
}
function done(g: GameState, ev: Ev[]): Result { g.v++; g.lastEv = ev; return { ok: true, ev }; }

function promote(g: GameState, p: Piece, to: Kind | undefined, ev: Ev[], cfg: StratCfg) {
  if (p.kind !== "pawn") return;
  const last = p.owner === 0 ? 0 : g.size - 1;
  if (p.y !== last) return;
  const kind: Kind = to && PROMO_OK.includes(to) ? to : "rook";
  const u = cfg.units[kind], mul = (cfg.race as any)[g.races[p.owner]].hpMul;
  const maxHp = Math.max(1, Math.round(u.hp * mul));
  p.kind = kind; p.atk = u.atk; p.arm = u.arm; p.hp = Math.max(1, Math.round(maxHp * (p.hp / p.maxHp))); p.maxHp = maxHp;
  ev.push({ e: "promote", id: p.id, kind });
}
function kill(g: GameState, t: Piece, by: number, ev: Ev[]) {
  g.pieces = g.pieces.filter((q) => q !== t);
  ev.push({ e: "kill", id: t.id, by });
}
function checkWin(g: GameState, ev: Ev[]) {
  for (const s of [0, 1] as const) if (!g.pieces.some((p) => p.owner === s && p.kind === "king")) {
    finish(g, (1 - s) as 0 | 1, "king", ev); return;
  }
}
export function finish(g: GameState, winner: 0 | 1 | 2, reason: string, ev: Ev[]) {
  if (g.winner !== -1) return;
  g.winner = winner; g.reason = reason; ev.push({ e: "end", winner, reason });
}
/** Очки на лимите ходов (этап 1: материал = сумма цен живых фигур + доля HP; Вождь = 10). */
export function score(g: GameState, side: 0 | 1, cfg: StratCfg = STRAT_CFG): number {
  return g.pieces.filter((p) => p.owner === side).reduce((s, p) => s + (p.kind === "king" ? 10 : cfg.units[p.kind].cost) * (p.hp / p.maxHp), 0);
}

function endTurn(g: GameState, ev: Ev[], cfg: StratCfg) {
  const prev = g.cur;
  for (const p of g.pieces) if (p.owner === prev) { p.acted = false; if (p.chill > 0) p.chill--; }
  const next = (1 - prev) as 0 | 1;
  if (next === g.first) g.turn++; // номер хода растёт, когда круг вернулся к первому игроку
  if (g.turn > g.turnLimit) {
    const a = score(g, 0, cfg), b = score(g, 1, cfg);
    finish(g, Math.abs(a - b) < 0.5 ? 2 : a > b ? 0 : 1, "limit", ev); return;
  }
  g.cur = next; g.ap = g.apMax;
  // поджог: урон в начале хода владельца горящей фигуры
  for (const p of [...g.pieces]) if (p.owner === next && p.burn > 0) {
    p.burn--; p.hp -= cfg.race.fire.burnDmg; ev.push({ e: "burn", id: p.id, dmg: cfg.race.fire.burnDmg, hp: Math.max(0, p.hp) });
    if (p.hp <= 0) kill(g, p, 0, ev);
  }
  checkWin(g, ev);
  if (g.winner === -1) ev.push({ e: "turn", cur: next, turn: g.turn });
}

/** Простой бот (этап 1, для «Играть с ботом» и самопроверки): жадно — убийство > выгодный удар > ход к Вождю. */
export function botAction(g: GameState, side: 0 | 1, cfg: StratCfg = STRAT_CFG): Action {
  const mine = g.pieces.filter((p) => p.owner === side && !p.acted);
  let best: { s: number; act: Action } | null = null;
  const ek = g.pieces.find((p) => p.owner !== side && p.kind === "king");
  for (const p of mine) {
    for (const [x, y] of attackTargets(g, p, cfg)) {
      const t = at(g, x, y)!; const d = damage(g, p, t, cfg);
      const s = (d >= t.hp ? 100 + (t.kind === "king" ? 1000 : cfg.units[t.kind].cost) : d * 2) + (t.kind === "king" ? 20 : 0);
      if (!best || s > best.s) best = { s, act: { a: "attack", id: p.id, x, y } };
    }
    if (p.kind === "king") continue;
    for (const [x, y] of moveTargets(g, p, cfg)) {
      const dist = ek ? Math.max(Math.abs(ek.x - x), Math.abs(ek.y - y)) : 0;
      const s = 10 - dist * 0.5 + Math.random() * 0.1;
      if (!best || s > best.s) best = { s, act: { a: "move", id: p.id, x, y } };
    }
  }
  return best ? best.act : { a: "end" };
}

/** Снимок для клиента (этап 1 — без тумана: всё видно обоим). */
export function view(g: GameState) {
  return { v: g.v, size: g.size, turn: g.turn, cur: g.cur, ap: g.ap, apMax: g.apMax, turnLimit: g.turnLimit, races: g.races, winner: g.winner, reason: g.reason, first: g.first,
    pieces: g.pieces.map((p) => ({ id: p.id, o: p.owner, k: p.kind, x: p.x, y: p.y, hp: p.hp, mh: p.maxHp, atk: p.atk, arm: p.arm, a: p.acted ? 1 : 0, b: p.burn, c: p.chill })) };
}
