// Боевые шахматы — чистый движок. Без «шах»: только мат (убийство короля) и угроза королю.
export type Side = "w" | "b";
export type Kind = "P" | "R" | "N" | "B" | "Q" | "K";
export type Piece = { id: number; t: Kind; s: Side; x: number; y: number; hp: number; mh: number; cd: number };
export type Shield = { x: number; y: number; hp: number } | null;
export type Attack = { qId: number; dmg: number; to?: [number, number]; take?: boolean; ranged?: boolean };
export type AbilityTarget = { qId?: number; x?: number; y?: number; run: (G: Game) => "ok" | "no" };

export const STATS: Record<Kind, { hp: number; name: string }> = {
  P: { hp: 10, name: "Пешка" }, R: { hp: 100, name: "Ладья" }, N: { hp: 30, name: "Конь" },
  B: { hp: 5, name: "Слон" }, Q: { hp: 70, name: "Ферзь" }, K: { hp: 60, name: "Король" },
};
export const AP_START = 2, AP_EVERY = 15, N = 8;
/** Чебышёв-радиус щита ладьи: 1 → зона 3×3. */
export const SHIELD_R = 1;
export const FIG: Record<Kind, string> = { P: "pawn", R: "rook", N: "knight", B: "bishop", Q: "queen", K: "king" };

export type Game = {
  pieces: Piece[];
  side: Side | "x";
  winner: Side | null;
  ap: number;
  apMax: Record<Side, number>;
  turnsDone: Record<Side, number>; // сколько своих ходов завершил
  turn: number; // номер полухода (светлые+чёрные)
  shield: Record<Side, Shield>;
  log: string[];
  nextId: number;
};

const ORTH: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL = ORTH.concat(DIAG);
const KN: [number, number][] = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
export const at = (G: Game, x: number, y: number) => G.pieces.find((p) => p.x === x && p.y === y);
export const byId = (G: Game, id: number) => G.pieces.find((p) => p.id === id);
export const dir = (s: Side) => (s === "w" ? -1 : 1);
export const en = (a: Piece, b?: Piece | null) => !!b && a.s !== b.s;

function mk(G: Game, t: Kind, s: Side, x: number, y: number) {
  G.pieces.push({ id: G.nextId++, t, s, x, y, hp: STATS[t].hp, mh: STATS[t].hp, cd: 0 });
}

export function newGame(): Game {
  const G: Game = {
    pieces: [], side: "w", winner: null, ap: AP_START,
    apMax: { w: AP_START, b: AP_START }, turnsDone: { w: 0, b: 0 },
    turn: 1, shield: { w: null, b: null }, log: [], nextId: 1,
  };
  "RNBQKBNR".split("").forEach((t, x) => {
    mk(G, t as Kind, "b", x, 0); mk(G, "P", "b", x, 1);
    mk(G, "P", "w", x, 6); mk(G, t as Kind, "w", x, 7);
  });
  return G;
}

function ray(G: Game, p: Piece, dx: number, dy: number) {
  let x = p.x + dx, y = p.y + dy, n = 1;
  while (inb(x, y)) {
    const q = at(G, x, y);
    if (q) return { q, n, x, y };
    x += dx; y += dy; n++;
  }
  return null;
}

export function moves(G: Game, p: Piece): [number, number][] {
  const r: [number, number][] = [];
  const slide = (ds: [number, number][]) => ds.forEach(([dx, dy]) => {
    let x = p.x + dx, y = p.y + dy;
    while (inb(x, y) && !at(G, x, y)) { r.push([x, y]); x += dx; y += dy; }
  });
  if (p.t === "P") { const y = p.y + dir(p.s); if (inb(p.x, y) && !at(G, p.x, y)) r.push([p.x, y]); }
  if (p.t === "R") slide(ORTH);
  if (p.t === "B") slide(DIAG);
  if (p.t === "Q") slide(ALL);
  if (p.t === "N") KN.forEach(([a, b]) => { if (inb(p.x + a, p.y + b) && !at(G, p.x + a, p.y + b)) r.push([p.x + a, p.y + b]); });
  if (p.t === "K") ALL.forEach(([a, b]) => { if (inb(p.x + a, p.y + b) && !at(G, p.x + a, p.y + b)) r.push([p.x + a, p.y + b]); });
  return r;
}

export function attacks(G: Game, p: Piece): Attack[] {
  const r: Attack[] = [];
  if (p.t === "P") {
    const d = dir(p.s);
    [-1, 1].forEach((a) => { const q = at(G, p.x + a, p.y + d); if (en(p, q)) r.push({ qId: q!.id, dmg: 20, take: true }); });
    const f = at(G, p.x, p.y + d); if (en(p, f)) r.push({ qId: f!.id, dmg: 2 });
  }
  if (p.t === "R") ORTH.forEach(([dx, dy]) => {
    const h = ray(G, p, dx, dy); if (h && en(p, h.q)) r.push(h.n === 1 ? { qId: h.q.id, dmg: 5 } : { qId: h.q.id, dmg: 5 * h.n, to: [h.x - dx, h.y - dy] });
  });
  if (p.t === "N") KN.forEach(([a, b]) => { const q = at(G, p.x + a, p.y + b); if (en(p, q)) r.push({ qId: q!.id, dmg: 30, ranged: true }); });
  if (p.t === "B") DIAG.forEach(([dx, dy]) => { const h = ray(G, p, dx, dy); if (h && en(p, h.q) && h.n > 1) r.push({ qId: h.q.id, dmg: 50, ranged: true }); });
  if (p.t === "Q") ALL.forEach(([dx, dy]) => {
    const h = ray(G, p, dx, dy); if (h && en(p, h.q)) r.push(h.n === 1 ? { qId: h.q.id, dmg: 40, take: true } : { qId: h.q.id, dmg: 70, ranged: true });
  });
  if (p.t === "K") ALL.forEach(([a, b]) => { const q = at(G, p.x + a, p.y + b); if (en(p, q)) r.push({ qId: q!.id, dmg: 15, take: true }); });
  return r;
}

function L(G: Game, m: string) { G.log.unshift(m); if (G.log.length > 80) G.log.length = 80; }

function trigShield(G: Game, att: Piece, tgt: Piece): "push" | void {
  const def = tgt.s; if (G.shield[def]) return;
  const R = G.pieces.find((r) => r.t === "R" && r.s === def && r.cd === 0 && Math.max(Math.abs(r.x - tgt.x), Math.abs(r.y - tgt.y)) <= SHIELD_R);
  if (!R) return;
  G.shield[def] = { x: R.x, y: R.y, hp: 100 }; R.cd = 5; L(G, "Щит ладьи 3×3");
  if (Math.max(Math.abs(att.x - R.x), Math.abs(att.y - R.y)) === 1) {
    const nx = att.x + Math.sign(att.x - R.x), ny = att.y + Math.sign(att.y - R.y);
    if (inb(nx, ny) && !at(G, nx, ny)) { att.x = nx; att.y = ny; L(G, "Отталкивание"); return "push"; }
  }
}

function inShield(G: Game, q: Piece) {
  const s = G.shield[q.s]; return !!(s && Math.abs(q.x - s.x) <= SHIELD_R && Math.abs(q.y - s.y) <= SHIELD_R);
}

/** true = цель погибла */
export function hit(G: Game, att: Piece, q: Piece, dmg: number, ranged?: boolean): boolean {
  const pushed = trigShield(G, att, q);
  if (inShield(G, q)) {
    const s = G.shield[q.s]!;
    if (ranged) { L(G, "Щит: снаряд сбит"); s.hp -= dmg; dmg = 0; }
    else { const a = Math.min(s.hp, dmg); s.hp -= a; dmg -= a; }
    if (s.hp <= 0) { G.shield[q.s] = null; L(G, "Щит разбит"); }
    if (ranged || pushed) return false;
  }
  if (pushed) return false;
  // Конь: добивание, если цель < 70% и CD готов — авто при обычном ударе
  if (att.t === "N" && att.cd === 0 && q.hp < 0.7 * q.mh) { dmg = 999; att.cd = 5; L(G, "★ Добивание!"); }
  q.hp -= dmg; L(G, `${STATS[att.t].name} → ${STATS[q.t].name}: ${dmg}`);
  if (q.hp <= 0) {
    G.pieces = G.pieces.filter((z) => z !== q);
    const fem = q.t === "P" || q.t === "R";
    L(G, `${STATS[q.t].name} ${fem ? "погибла" : "погиб"}`);
    if (q.t === "K") { G.winner = att.s; G.side = "x"; L(G, att.s === "w" ? "♛ Мат — светлые" : "♛ Мат — тёмные"); }
    return true;
  }
  return false;
}

export function spendAp(G: Game): boolean {
  if (G.side === "x" || G.ap <= 0) return false;
  G.ap--; return true;
}

export function doMove(G: Game, p: Piece, x: number, y: number): boolean {
  if (!spendAp(G)) return false;
  if (!moves(G, p).some(([mx, my]) => mx === x && my === y)) { G.ap++; return false; }
  p.x = x; p.y = y; L(G, `${STATS[p.t].name} ходит`);
  checkEndTurnAuto(G); return true;
}

export function doAttack(G: Game, p: Piece, a: Attack): boolean {
  if (!spendAp(G)) return false;
  const q = byId(G, a.qId); if (!q) { G.ap++; return false; }
  const ox = q.x, oy = q.y;
  if (a.to) { p.x = a.to[0]; p.y = a.to[1]; }
  const killed = hit(G, p, q, a.dmg, a.ranged);
  if (killed && a.take) { p.x = ox; p.y = oy; }
  checkEndTurnAuto(G); return true;
}

export function abilities(G: Game, p: Piece): AbilityTarget[] {
  if (p.cd > 0) return [];
  if (p.t === "P") {
    const d = -dir(p.s);
    return [-1, 1].map((a) => at(G, p.x + a, p.y + d)).filter((q) => en(p, q)).map((q) => ({
      qId: q!.id, run: (g) => { hit(g, p, q!, 30, false); p.cd = 4; return "ok" as const; },
    }));
  }
  if (p.t === "B") {
    const es = G.pieces.filter((q) => en(p, q) && Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1);
    return es.length > 2 ? [{ x: p.x, y: p.y, run: (g) => { L(g, "★ Вспышка 3×3"); es.forEach((q) => hit(g, p, q, 100, false)); p.cd = 4; return "ok"; } }] : [];
  }
  if (p.t === "Q") {
    return ALL.map(([dx, dy]) => {
      const h = ray(G, p, dx, dy); if (!h || !en(p, h.q)) return null;
      return {
        qId: h.q.id, run: (g: Game) => {
          if (inShield(g, h.q)) {
            p.hp -= 45; const s = g.shield[h.q.s]!; s.hp -= 45;
            if (s.hp <= 0) g.shield[h.q.s] = null;
            L(g, "★ Прорыв в щит −45/−45");
            if (p.hp <= 0) { g.pieces = g.pieces.filter((z) => z !== p); if (p.t === "K") { g.winner = h.q.s; g.side = "x"; } }
            p.cd = 4; return "ok";
          }
          let x = h.x + dx, y = h.y + dy; const second = inb(x, y) ? at(g, x, y) : null;
          let lx = x, ly = y; if (second) { lx = x + dx; ly = y + dy; }
          if (!inb(lx, ly) || at(g, lx, ly)) { L(g, "Прорыв: стена"); return "no"; }
          L(g, "★ Прорыв");
          hit(g, p, h.q, 90, false);
          if (second && en(p, second)) hit(g, p, second, 45, false);
          p.x = lx; p.y = ly; p.cd = 4; return "ok";
        },
      };
    }).filter(Boolean) as AbilityTarget[];
  }
  return [];
}

export function doAbility(G: Game, p: Piece, t: AbilityTarget): boolean {
  if (!spendAp(G)) return false;
  if (t.run(G) === "no") { G.ap++; return false; }
  checkEndTurnAuto(G); return true;
}

function checkEndTurnAuto(G: Game) {
  if (G.side !== "x" && G.ap <= 0) endTurn(G);
}

/** Завершить ход стороны: CD−1, рост ОД каждые 15 своих ходов, передача хода. */
export function endTurn(G: Game) {
  if (G.side === "x") return;
  const s = G.side;
  G.pieces.filter((p) => p.s === s && p.cd > 0).forEach((p) => p.cd--);
  G.turnsDone[s]++;
  if (G.turnsDone[s] % AP_EVERY === 0) { G.apMax[s]++; L(G, `ОД → ${G.apMax[s]}`); }
  const next: Side = s === "w" ? "b" : "w";
  if (G.shield[next]) G.shield[next] = null; // щит живёт до начала своего хода
  G.side = next;
  G.ap = G.apMax[next];
  if (next === "w") G.turn++;
}

/** Король стороны под ударом? (для UI «угроза», не «шах») */
export function kingThreatened(G: Game, s: Side): boolean {
  const k = G.pieces.find((p) => p.t === "K" && p.s === s); if (!k) return false;
  return G.pieces.some((p) => p.s !== s && attacks(G, p).some((a) => a.qId === k.id));
}

export function view(G: Game) {
  return {
    pieces: G.pieces.map((p) => ({ ...p })),
    side: G.side, winner: G.winner, ap: G.ap, apMax: G.apMax, turnsDone: G.turnsDone,
    turn: G.turn, shield: G.shield, log: G.log.slice(0, 40),
    threat: { w: kingThreatened(G, "w"), b: kingThreatened(G, "b") },
  };
}
