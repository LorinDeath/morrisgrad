// «Партия Чёрных королей» — ультимейты Вождей и фигур (сервер-авторитетно). Данные — tree-data.ts (ULTS / UNIT_ULTS).
// Событие { e: "ult", side, by, ult, name, banner?, x, y, cells } уходит ВСЕМ (баннер на весь экран у обоих игроков и зрителей).
import type { GameState, Piece, StratCfg, Ev, Kind } from "./rules";
import type { UltDef } from "./content-cfg";
import { passable } from "./terrain";

export type UltHooks = { kill: (t: Piece, by: Piece) => void; onHit: (a: Piece, t: Piece, killed: boolean) => void; mk?: (o: 0 | 1, k: Kind, x: number, y: number) => Piece; pop: number };
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const at = (g: GameState, x: number, y: number) => g.pieces.find((p) => p.x === x && p.y === y);
const inb = (g: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < g.size && y < g.size;
const late = (g: GameState, side: number) => (g.ec?.era[side] || 0) >= 3;

/** клетки области: круг — центр клетки в пределах r от центра цели (⌀5 при r = 2.5: 21 клетка, не ромб); квадрат size×size */
export function ultCells(g: GameState, side: number, u: UltDef, from: Piece, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  if (u.shape === "circle") { const r = u.r || 2.5, R = Math.ceil(r); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 1e-9 && inb(g, x + dx, y + dy)) out.push([x + dx, y + dy]); }
  else if (u.shape === "square") { const s = late(g, side) && u.eraSize ? u.eraSize : u.size || 3, h = (s - 1) >> 1; for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) if (inb(g, x + dx, y + dy)) out.push([x + dx, y + dy]); }
  else if (u.shape === "line") { // волна: от Вождя в сторону цели (8 направлений), ширина 3, длина len
    const sx = Math.sign(x - from.x), sy = Math.sign(y - from.y); if (!sx && !sy) return out;
    const px = -sy, py = sx; // поперёк
    for (let i = 1; i <= (u.len || 5); i++) for (const w of [-1, 0, 1]) { const cx = from.x + sx * i + px * w, cy = from.y + sy * i + py * w; if (inb(g, cx, cy) && !out.some(([a, b]) => a === cx && b === cy)) out.push([cx, cy]); }
  }
  return out;
}
export function ultDmg(g: GameState, side: number, u: UltDef): number { return (u.dmg || 0) + (late(g, side) ? u.eraDmg || 0 : 0) + ((g.ec?.era[side] || 1) >= 2 && !late(g, side) ? Math.floor((u.eraDmg || 0) / 2) : 0); }

/** t1163: разбор урона ульты (hit.why) в формате HitX: база ульты + эпоха + усиление (технология ultPow / Чудо) → ×chiefMul по Вождю → щит → Вождь не ниже 1 HP.
 *  Броня/укрытие/стихии на ульту не действуют (arm: [], cover 0, mul 1). Части src "tech"/"bld" для чужого зрителя скрывает replay.redactX. */
function ultWhy(g: GameState, by: Piece, t: Piece, dmg: number, u: UltDef, raw: number, shield: number, spare: boolean, d: number) {
  const side = by.owner, X = (u as any)._x || {}, px: any[] = X.px || [];
  const boost = px.reduce((s2, q) => s2 + q.n, 0), base = Math.max(0, (u.dmg || 0) - boost), era = dmg - (u.dmg || 0);
  const atk = [{ k: "ult", n: base, src: "base", side }, ...(era ? [{ k: "era", n: era, src: "base", side }] : []), ...px];
  return { via: "ult", ult: X.id ?? null, atk, arm: [], cover: 0, mul: 1, el: [g.races[side], g.races[t.owner]], pow: 0, dmg: d, min1: false, shield, on: [],
    ...(t.kind === "king" ? { chiefMul: u.chiefMul, raw } : {}), ...(spare ? { spare: true } : {}) };
}
/** урон ультимейтом: щит поглощает; Вождь — chiefMul и не ниже 1 HP */
function hurt(g: GameState, by: Piece, t: Piece, dmg: number, u: UltDef, ev: Ev[], H: UltHooks) {
  const raw = t.kind === "king" ? Math.max(1, Math.round(dmg * u.chiefMul)) : dmg;
  let d = absorb(t, raw, ev); const shield = raw - d;
  const spare = t.kind === "king" && d > t.hp - 1; if (t.kind === "king") d = Math.min(d, t.hp - 1);
  if (d <= 0) return;
  t.hp -= d; ev.push({ e: "hit", id: by.id, t: t.id, dmg: d, hp: Math.max(0, t.hp), ult: 1, why: ultWhy(g, by, t, dmg, u, raw, shield, spare, d) } as any);
  H.onHit(by, t, t.hp <= 0); if (t.hp <= 0) H.kill(t, by);
}
/** щит «Каменного купола» и т. п.: съедает урон первым */
export function absorb(t: Piece, d: number, ev?: Ev[]): number {
  const sh = (t as any).sh || 0; if (sh <= 0 || d <= 0) return d;
  const a = Math.min(sh, d); (t as any).sh = sh - a; if (!(t as any).sh) delete (t as any).sh, delete (t as any).sht;
  ev?.push({ e: "shield", id: t.id, n: a, left: (t as any).sh || 0 } as any); return d - a;
}

export function canUlt(g: GameState, side: number, p: Piece, u: UltDef, x: number, y: number): string | null {
  if (g.ap < u.ap) return "no_ap"; if (p.acted) return "already_acted";
  if (!inb(g, x, y)) return "bad_cell";
  if (u.shape !== "line" && u.shape !== "chain" && cheb(p, { x, y }) > u.range) return "out_of_range";
  if (u.shape === "line" && (cheb(p, { x, y }) < 1)) return "bad_cell";
  if (u.shape === "chain") { const t = at(g, x, y); if (!t || t.owner === side || cheb(p, t) > u.range) return "bad_target"; }
  return null;
}

/** применить ультимейт u фигурой p в клетку (x, y). Проверки canUlt — до вызова. */
export function castUlt(g: GameState, side: 0 | 1, p: Piece, id: string, u: UltDef, x: number, y: number, ev: Ev[], H: UltHooks) {
  const dmg = ultDmg(g, side, u); let cells: [number, number][] = [];
  const foesIn = (cs: [number, number][]) => g.pieces.filter((q) => q.owner !== side && cs.some(([a, b]) => a === q.x && b === q.y));
  if (u.shape === "chain") { // перескоки: каждый следующий — ближайший непобитый враг в радиусе hop от предыдущего
    const hops = (u.hops || 3) + (late(g, side) ? u.eraHops || 0 : 0), hit = new Set<number>(); let cur: Piece | undefined = at(g, x, y);
    for (let i = 0; i < hops && cur; i++) { hit.add(cur.id); cells.push([cur.x, cur.y]); const last: Piece = cur; hurt(g, p, cur, dmg, u, ev, H);
      cur = g.pieces.filter((q) => q.owner !== side && !hit.has(q.id) && q.hp > 0 && cheb(q, last) <= (u.hop || 3)).sort((a, b) => cheb(a, last) - cheb(b, last) || a.hp - b.hp)[0];
      if (!cur) { // встать рядом с последней целью
        const lx = last.x, ly = last.y; let best: [number, number] | null = null;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = lx + dx, cy = ly + dy; if ((dx || dy) && inb(g, cx, cy) && (!at(g, cx, cy) || at(g, cx, cy) === p) && passable(g.map, cx, cy, g.races[side]) && !best) best = [cx, cy]; }
        if (best) { p.x = best[0]; p.y = best[1]; ev.push({ e: "move", id: p.id, x: p.x, y: p.y, blink: 1 } as any); }
      } }
  } else {
    cells = ultCells(g, side, u, p, x, y);
    if (u.shield) for (const q of g.pieces) if (q.owner === side && cells.some(([a, b]) => a === q.x && b === q.y)) { (q as any).sh = Math.max((q as any).sh || 0, u.shield); (q as any).sht = u.shieldTurns || 3; ev.push({ e: "shield", id: q.id, n: 0, left: u.shield } as any); }
    if (u.heal) for (const q of g.pieces) if (q.owner === side && q.hp < q.maxHp && cells.some(([a, b]) => a === q.x && b === q.y)) { const h = Math.min(u.heal, q.maxHp - q.hp); q.hp += h; ev.push({ e: "heal", id: q.id, hp: q.hp, n: h }); }
    for (const t of foesIn(cells)) {
      if (dmg) hurt(g, p, t, dmg, u, ev, H); if (t.hp <= 0 || !g.pieces.includes(t)) continue;
      if (u.chill) t.chill = Math.max(t.chill, u.chill);
      if (u.root) (t as any).root = Math.max((t as any).root || 0, u.root);
      if (u.push && u.shape === "line") { const sx = Math.sign(x - p.x), sy = Math.sign(y - p.y), nx = t.x + sx * u.push, ny = t.y + sy * u.push;
        if (inb(g, nx, ny) && !at(g, nx, ny) && passable(g.map, nx, ny, g.races[t.owner])) { t.x = nx; t.y = ny; ev.push({ e: "move", id: t.id, x: nx, y: ny, push: 1 } as any); } }
    }
    if (u.burnCells && g.ec) { const F = ((g.ec as any).fire ||= []) as { x: number; y: number; t: number; s: number }[]; for (const [a, b] of cells) { const f = F.find((o) => o.x === a && o.y === b); if (f) { f.t = u.burnCells; f.s = side; } else F.push({ x: a, y: b, t: u.burnCells, s: side }); } }
    if (u.spawn && H.mk) { let n = u.spawn + (late(g, side) ? u.eraSpawn || 0 : 0);
      for (const [a, b] of cells) { if (n <= 0 || g.pieces.filter((q) => q.owner === side).length >= H.pop) break; if (!at(g, a, b) && passable(g.map, a, b, g.races[side])) { const q = H.mk(side, "rook", a, b); q.acted = true; (q as any).treant = 1; g.pieces.push(q); ev.push({ e: "recruit", id: q.id, city: 0, kind: "rook", treant: 1 } as any); n--; } } }
  }
  ev.push({ e: "ult", side, by: p.id, ult: id, name: u.name, ...(u.banner ? { banner: u.banner } : {}), x, y, cells } as any);
}

/** начало хода стороны side: горящая земля (чужая) поджигает её фигуры; таймеры щитов/корней; сама земля гаснет на ходу поджигателя */
export function ultTurnStart(g: GameState, side: number, ev: Ev[]) {
  const F = (g.ec as any)?.fire as { x: number; y: number; t: number; s: number }[] | undefined;
  if (F?.length) {
    for (const p of g.pieces) if (p.owner === side && F.some((f) => f.s !== side && f.x === p.x && f.y === p.y)) p.burn = Math.max(p.burn, 1);
    for (const f of F) if (f.s === side) f.t--; (g.ec as any).fire = F.filter((f) => f.t > 0);
  }
  for (const p of g.pieces) if (p.owner === side) {
    if ((p as any).sht > 0 && --(p as any).sht <= 0) { delete (p as any).sh; delete (p as any).sht; }
    if ((p as any).grdt > 0 && --(p as any).grdt <= 0) { delete (p as any).grd; delete (p as any).grdt; } // «Стойка»/«Барьер»
  }
  for (const p of g.pieces) if (p.owner !== side && (p as any).root > 0) (p as any).root--; // корни: тикают на ходу наложившего → root = числу ходов жертвы
}
