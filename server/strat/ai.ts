// «Партия Чёрных королей» — ИИ (общий модуль: сервер-бот, симулятор, арена). Чистые функции, без I/O.
// Оценка позиции (материал+HP, Вождь, угрозы, экономика, территория, Слава, давление) + политики-архетипы
// (раш / черепаха / экономика-технологии / экспансия) и адаптивный бот с перебором (альфа-бета по действиям, лучевой отбор).
import { type GameState, type Action, type Piece, type Kind, type StratCfg, apply, moveTargets, attackTargets, razeTargets, ultOf } from "./rules";
import { canUlt } from "./ult";
import { type BuildId, type Branch } from "./econ-cfg";
import { territory, canRecruit, recruitCells, canBuild, canResearch, canEra, canFound, pendingTalent, unitChoices, unitAct, sz, cityRadius, techList, chiefChoices, chiefNode, goalProgress, goalCfg, chiefBuildSite, bldHp, bldStat } from "./econ";

export type W = {
  mat: number; kingHp: number; kingDanger: number; hang: number; bank: number; know: number; bld: number; tech: number; era: number;
  city: number; terr: number; glory: number; adv: number; home: number; siege: number; raid: number; tal: number;
  goal?: number; pawnCap?: number; prog?: number; gpref?: Partial<Record<string, number>>; br?: Partial<Record<Branch, number>>;
  pref?: Partial<Record<BuildId, number>>; unit?: Partial<Record<Kind, number>>;
};
/** Сбалансированные веса (единица — 1 золото). Архетипы — сдвиги от них. */
export const W_BAL: W = { goal: 70, prog: 22, mat: 1, kingHp: 14, kingDanger: 3, hang: 0.45, bank: 0.5, know: 0.35, bld: 0.8, tech: 3.5, era: 6, city: 9, terr: 0.25, glory: 0.45, adv: 0.8, home: 0.3, siege: 10, raid: 0.8, tal: 3 };
/** Пять тактик (= ветви дерева) + bal. br — множитель ценности технологий ветви; gpref — к каким целям тянется тактика. */
export const ARCH: Record<string, Partial<W>> = {
  bal: {},
  rush: { adv: 2.2, siege: 18, hang: 0.25, bank: 0.3, bld: 0.25, tech: 2, era: 2, glory: 0.2, home: 0, city: 3, br: { rush: 2.5, fort: 0.3, trade: 0.4, expand: 0.4, arcana: 0.8 }, gpref: { chief: 1.8, hold: 1.4, treasury: 0.5, domain: 0.6, wonder: 0.4, glory: 1.1 }, pref: { barracks: 3, stable: 3, forge: 2 }, unit: { knight: 1.2, pawn: 1.05 } },
  fort: { adv: -0.2, home: 1.6, hang: 0.8, kingDanger: 6, bld: 1.0, tech: 4, glory: 0.7, terr: 0.5, raid: 0.4, br: { fort: 2.5, rush: 0.4, trade: 0.8, expand: 0.4, arcana: 0.6 }, gpref: { hold: 1.8, wonder: 1, chief: 0.8, treasury: 0.8, domain: 0.5, glory: 0.8 }, pref: { wall: 2.5, library: 1.3, barracks: 1.3 }, unit: { rook: 1.3, mage: 1.2 } },
  trade: { adv: 0.3, bld: 1.15, bank: 0.7, tech: 5, era: 9, glory: 0.6, home: 0.6, br: { trade: 2.5, arcana: 0.9, fort: 0.7, rush: 0.3, expand: 0.6 }, gpref: { treasury: 2, wonder: 1.4, hold: 0.7, chief: 0.6, domain: 0.7, glory: 1 }, pref: { market: 2, library: 1.2, granary: 1.3 }, unit: { rook: 1.1 } },
  expand: { pawnCap: 6, adv: 0.6, city: 22, terr: 0.7, glory: 0.55, raid: 1.2, br: { expand: 2.5, trade: 0.9, rush: 0.6, fort: 0.3, arcana: 0.4 }, gpref: { domain: 2, treasury: 1, hold: 0.9, chief: 0.7, wonder: 0.5, glory: 1 }, pref: { granary: 1.4, market: 1.2 }, unit: { pawn: 1.4, knight: 1.1 } },
  arcana: { adv: 0.5, bld: 1.0, know: 0.6, tech: 6, era: 10, glory: 0.8, home: 0.6, br: { arcana: 2.5, trade: 0.7, fort: 0.6, rush: 0.5, expand: 0.4 }, gpref: { wonder: 1.8, chief: 1.1, hold: 0.8, treasury: 0.7, domain: 0.5, glory: 1.3 }, pref: { library: 1.6, magetower: 2.5 }, unit: { mage: 1.4 } },
};
/** старые имена архетипов (этап 3) → тактики */
const ALIAS: Record<string, string> = { turtle: "fort", eco: "trade" };
export const TACTIC_IDS = ["rush", "fort", "trade", "expand", "arcana"] as const;
export const weights = (a = "bal"): W => ({ ...W_BAL, ...(ARCH[ALIAS[a] || a] || {}) });

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const val = (p: Piece, cfg: StratCfg) => (p.kind === "king" ? 0 : cfg.units[p.kind].cost);
const brOf = (cfg: StratCfg, id: string) => techList(cfg).find((t) => t.id === id)?.br;

/** Копия состояния для перебора (карта общая, только чтение). */
export function clone(g: GameState): GameState {
  // t1156: вложенные поля фигуры (cds — откаты, buffs и т.п.) копируются тоже: раньше перебор вариантов ботом
  // менял откаты/щиты настоящей фигуры (ульта бота перезаряжалась быстрее, повтор партии расходился с живой).
  const cp = (p: any) => { const o: any = { ...p }; for (const k in o) if (o[k] && typeof o[k] === "object") o[k] = Array.isArray(o[k]) ? o[k].map((v: any) => v && typeof v === "object" ? structuredClone(v) : v) : structuredClone(o[k]); if (!o.tal) o.tal = []; return o; };
  return { ...g, pieces: g.pieces.map(cp), ec: g.ec ? structuredClone(g.ec) : g.ec, lastEv: [] } as GameState;
}

/** Оценка с точки зрения side: f(side) − f(соперник). Победа/поражение — ±1e5. */
export function evaluate(g: GameState, side: 0 | 1, cfg: StratCfg, w: W = W_BAL): number {
  if (g.winner !== -1) return g.winner === 2 ? 0 : g.winner === side ? 1e5 - g.turn : -1e5 + g.turn;
  const n = g.size, T = territory(g, cfg);
  const att = [new Uint8Array(n * n), new Uint8Array(n * n)];
  for (const p of g.pieces) for (const [x, y] of attackTargets(g, p, cfg)) att[p.owner][y * n + x]++;
  const f = [0, 0];
  const thr = sz(g, cfg).glory, lim = g.turnLimit || 60, phase = 1 + 2 * Math.min(1, g.turn / lim);
  for (const s of [0, 1] as const) {
    const o = 1 - s, ec = g.ec;
    const ecap = ec?.cities.find((c) => c.owner === o && c.cap) || g.pieces.find((p) => p.owner === o && p.kind === "king");
    const mcap = ec?.cities.find((c) => c.owner === s && c.cap) || g.pieces.find((p) => p.owner === s && p.kind === "king");
    let v = 0, pawnN = 0; const ramp = 1 + Math.min(1, g.turn / lim);
    for (const p of g.pieces) {
      if (p.owner !== s) continue;
      if (p.kind === "pawn") pawnN++;
      const i = p.y * n + p.x, hpf = p.hp / p.maxHp;
      if ((p as any).sh) v += 0.5 * (p as any).sh; // щит купола
      if ((p as any).root) v -= 2 * (p as any).root; // корни
      if (p.kind === "king") {
        v += w.kingHp * hpf - w.kingDanger * att[o][i] * (1.5 - hpf);
        if (ec && T[i] === s) v += 1.5; // t1137: Вождь на своей земле может строить
        for (const q of g.pieces) if (q.owner === o && q.kind !== "pawn" && cheb(q, p) <= 2) v -= w.kingDanger * 0.35;
        continue;
      }
      const pv = val(p, cfg) * (w.unit?.[p.kind] ?? 1) * (p.kind === "pawn" && pawnN > (w.pawnCap ?? 4) ? 0.3 : 1); // лишние Ополченцы почти ничего не стоят
      v += w.mat * pv * (0.45 + 0.55 * hpf) + w.tal * (p.tal?.length || 0);
      if (att[o][i]) v -= w.hang * pv * (att[s][i] ? 0.45 : 1) * (g.cur === o ? 1 : 0.6);
      const vs = Math.min(2, pv / 4); // ценность фигуры масштабирует позиционные бонусы (иначе бот плодит Ополченцев)
      if (ecap) v += w.adv * ramp * vs * (1 - cheb(p, ecap) / n);
      if (mcap && cheb(p, mcap) <= 2) v += w.home * vs;
      if (T[i] === o) v += w.raid * vs;
    }
    if (ec) {
      for (const c of ec.cities) {
        if (c.owner === s) { if (!c.cap) v += w.city; for (const b of c.bld) v += w.bld * (cfg.build[b]?.cost || 0) * (w.pref?.[b] ?? 1) * (0.4 + 0.6 * bldHp(g, c, b, cfg) / Math.max(1, (cfg as any).bldHp?.type ? bldStat(cfg, b).hp : 1)); v += c.lvl * 4; }
        const occ = g.pieces.find((p) => p.x === c.x && p.y === c.y);
        if (occ && occ.owner === s && c.owner === o) v += w.siege * (c.cap ? 2.5 : 1);
      }
      const r = ec.res[s];
      v += w.bank * (Math.min(r.gold, 40) + 0.3 * Math.max(0, r.gold - 40)) + w.know * Math.min(r.know, 40) + w.era * ec.era[s];
      for (const id of ec.techs[s]) { const b = brOf(cfg, id); v += w.tech * (b ? w.br?.[b] ?? 1 : 1); }
      // цели: выполненные — крупно, прогресс — по склонности тактики; без Вождя — штраф (−ОД, риск)
      if (ec.goals) { const gp = goalProgress(g, s, cfg, T), GC = goalCfg(g, cfg), need = GC.need || 3;
        let done = 0; for (const k of GC.list as string[]) { const f = w.gpref?.[k] ?? 1; if (gp[k] >= 1) { done++; v += (w.goal || 0) * f; } else v += (w.prog || 0) * f * gp[k] * gp[k]; }
        if (done >= need - 1) v += (w.goal || 0) * 0.8;
        // Чудо доступно — копим золото/знания под него, а не тратим на мелочи
        if (gp.wonder >= 0.75 && gp.wonder < 1) v += (w.goal || 0) * 0.3 * (w.gpref?.wonder ?? 1) * (Math.min(1, r.gold / Math.max(1, GC.wonderGold)) + Math.min(1, r.know / Math.max(1, GC.wonderKnow)));
        // «Цареубийство»: прогресс — ранен первый вражеский Вождь
        const ek = g.pieces.find((q) => q.owner === o && q.kind === "king");
        if (GC.list.includes("chief") && gp.chief < 1 && ek && !(ec.chief?.[o]?.gen > 1)) v += (w.prog || 0) * (w.gpref?.chief ?? 1) * (1 - ek.hp / ek.maxHp); }
      if (ec.chief?.[s]?.dead) v -= w.kingHp * 1.2;
      let cells = 0; for (let i = 0; i < T.length; i++) if (T[i] === s) cells++;
      v += w.terr * cells;
      v += w.glory * phase * r.glory * (thr > 0 ? 1 + r.glory / thr : 1);
    }
    f[s] = v;
  }
  return f[side] - f[1 - side];
}

/** Кандидаты: бесплатные действия (таланты, эпоха, технологии, город) и/или боевые (ход/удар/застава). */
export function candidates(g: GameState, side: 0 | 1, cfg: StratCfg, econ = true, mil = true): Action[] {
  const out: Action[] = [], ec = g.ec;
  if (econ && ec) {
    for (const p of g.pieces) if (p.owner === side) { const lv = pendingTalent(p, cfg, g); if (lv) for (const t of (p.kind === "king" ? chiefChoices(g, p, cfg) : unitChoices(p, lv, cfg))) out.push({ a: "talent", id: p.id, t: t.id } as any); }
    if (!canEra(g, side, cfg)) out.push({ a: "era" } as any);
    for (const t of techList(cfg)) if (!canResearch(g, side, t, cfg)) out.push({ a: "research", t: t.id } as any);
    const ecap = ec.cities.find((c) => c.owner !== side && c.cap);
    const mine = g.pieces.filter((p) => p.owner === side && p.kind !== "king");
    const fk = (["rook", "knight", "mage", "pawn", "hero"] as Kind[]).sort((a, b) => mine.filter((p) => p.kind === b).length - mine.filter((p) => p.kind === a).length)[0];
    for (const c of ec.cities) if (c.owner === side && !c.acted) {
      for (const k of ["pawn", "knight", "mage", "rook", "hero"] as Kind[]) if (!canRecruit(g, side, c, k, cfg)) {
        const cells = recruitCells(g, c, k, cfg); if (!cells.length) continue;
        const d = (a: number[]) => (ecap ? cheb({ x: a[0], y: a[1] }, ecap) : 0);
        cells.sort((a, b) => d(a) - d(b));
        out.push({ a: "recruit", city: c.id, kind: k, x: cells[0][0], y: cells[0][1] } as any);
        if (cells.length > 1) { const l = cells[cells.length - 1]; out.push({ a: "recruit", city: c.id, kind: k, x: l[0], y: l[1] } as any); }
      }
    }
    const site = chiefBuildSite(g, side, cfg); // t1137: строит Вождь
    if (site) for (const b of Object.keys(cfg.build) as BuildId[]) if (!canBuild(g, side, site.c, b, cfg, fk)) out.push({ a: "build", id: site.k.id, city: site.c.id, b, ...(b === "forge" ? { kind: fk } : {}) } as any);
  }
  if (mil && g.ap >= 1) for (const p of g.pieces) if (p.owner === side && !p.acted) {
    for (const [x, y] of attackTargets(g, p, cfg)) out.push({ a: "attack", id: p.id, x, y });
    for (const t of razeTargets(g, p, cfg)) for (const b of t.b) out.push({ a: "raze", id: p.id, city: t.city, b } as any); // t1136: удары по постройкам
    for (const [x, y] of moveTargets(g, p, cfg)) out.push({ a: "move", id: p.id, x, y });
    if (ec && (p.kind === "pawn" || p.kind === "king") && !canFound(g, side, p, cfg)) out.push({ a: "found", id: p.id } as any);
    if (ec && p.kind === "king") for (const id of p.tal || []) { const nd = chiefNode(cfg, g, side, id); if (nd?.kind === "active" && !nd.ult && !((p.cds?.[id] ?? 0) > 0)) out.push({ a: "ability", id: p.id, ab: id } as any); }
    const ua = ec && p.kind !== "king" ? unitAct(p, cfg) : null;
    if (ua && !((p.cds?.[ua.id] ?? 0) > 0) && g.ap >= ua.ap) {
      if (ua.type === "volley") { for (const q of g.pieces) if (q.owner !== side && Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) <= (ua.r || 3)) out.push({ a: "ability", id: p.id, ab: ua.id, x: q.x, y: q.y } as any); }
      else if (ua.type !== "mend" || p.hp < p.maxHp) out.push({ a: "ability", id: p.id, ab: ua.id } as any);
    }
    // ультимейт: цели — клетки врагов в дальности (купол — свои; волна — 8 соседних клеток-направлений)
    const ul = ec ? ultOf(g, p, cfg) : null;
    if (ul && !((p.cds?.[ul.key] ?? 0) > 0) && g.ap >= ul.u.ap) {
      const cells: [number, number][] = ul.u.shape === "line" ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => [p.x + dx, p.y + dy] as [number, number])
        : g.pieces.filter((q) => (ul.u.shield ? q.owner === side : q.owner !== side)).map((q) => [q.x, q.y] as [number, number]);
      for (const [x, y] of cells) if (!canUlt(g, side, p, ul.u, x, y)) out.push({ a: "ult", id: p.id, x, y } as any);
    }
  }
  return out;
}

function tryApply(g: GameState, side: 0 | 1, a: Action, cfg: StratCfg): GameState | null {
  const c = clone(g); const r = apply(c, side, a, cfg); return r.ok ? c : null;
}

export type BotOpts = { arch?: string; depth?: number; beam?: number; noise?: number; rnd?: () => number; stats?: { turns: number; legal: number; good: number } };

/** 1 шаг политики. depth 1 — жадный по оценке; depth ≥ 2 — альфа-бета по боевым действиям (бесплатные — жадно). */
export function aiAction(g: GameState, side: 0 | 1, cfg: StratCfg, o: BotOpts = {}): Action {
  const w = weights(o.arch), rnd = o.rnd || Math.random, noise = o.noise ?? 0.25;
  const base = evaluate(g, side, cfg, w);
  // 1) бесплатные действия — жадно, если улучшают оценку
  let bestE: { s: number; a: Action } | null = null;
  for (const a of candidates(g, side, cfg, true, false)) {
    const c = tryApply(g, side, a, cfg); if (!c) continue;
    const s = evaluate(c, side, cfg, w) + rnd() * noise;
    if (!bestE || s > bestE.s) bestE = { s, a };
  }
  if (bestE && bestE.s > base + 0.05) return bestE.a;
  if (g.ap < 1) return { a: "end" };
  // 2) боевые действия
  const kids: { s: number; a: Action; c: GameState }[] = [];
  for (const a of candidates(g, side, cfg, false, true)) {
    const c = tryApply(g, side, a, cfg); if (!c) continue;
    kids.push({ s: evaluate(c, side, cfg, w) + rnd() * noise, a, c });
  }
  if (o.stats) { o.stats.turns++; o.stats.legal += kids.length; const top = kids.reduce((m, k) => Math.max(m, k.s), -1e9); o.stats.good += kids.filter((k) => k.s >= top - 1.5 && k.s > base).length; }
  if (!kids.length) return { a: "end" };
  const depth = o.depth ?? 1;
  if (depth <= 1) { kids.sort((a, b) => b.s - a.s); return kids[0].s > base + 0.05 ? kids[0].a : { a: "end" }; }
  // перебор: «закончить ход» — тоже вариант
  const ce = tryApply(g, side, { a: "end" }, cfg); if (ce) kids.push({ s: evaluate(ce, side, cfg, w), a: { a: "end" }, c: ce });
  kids.sort((a, b) => b.s - a.s);
  const beam = o.beam ?? 6;
  let best = kids[0], alpha = -Infinity;
  for (const k of kids.slice(0, beam + 1)) {
    const s = ab(k.c, side, depth - 1, alpha, Infinity, cfg, w, beam);
    if (s > alpha) { alpha = s; best = k; }
  }
  return best.a;
}

function ab(g: GameState, root: 0 | 1, depth: number, alpha: number, beta: number, cfg: StratCfg, w: W, beam: number): number {
  if (g.winner !== -1 || depth <= 0) return evaluate(g, root, cfg, w);
  const me = g.cur, max = me === root;
  if (g.ap < 1) { const c = tryApply(g, me, { a: "end" }, cfg); return c ? ab(c, root, depth, alpha, beta, cfg, w, beam) : evaluate(g, root, cfg, w); }
  const kids: { s: number; c: GameState }[] = [];
  for (const a of [...candidates(g, me, cfg, false, true), { a: "end" } as Action]) {
    const c = tryApply(g, me, a, cfg); if (!c) continue; kids.push({ s: evaluate(c, root, cfg, w), c });
  }
  if (!kids.length) return evaluate(g, root, cfg, w);
  kids.sort((a, b) => (max ? b.s - a.s : a.s - b.s));
  const K = Math.max(2, beam - 2);
  if (depth === 1) return kids[0].s;
  let v = max ? -Infinity : Infinity;
  for (const k of kids.slice(0, K)) {
    const s = ab(k.c, root, depth - 1, alpha, beta, cfg, w, beam);
    if (max) { v = Math.max(v, s); alpha = Math.max(alpha, v); } else { v = Math.min(v, s); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return v;
}

// ---------- боты в партии (StratMatch): уровни сложности. Боты играют всеми системами, как люди: опыт, таланты/умения/ульты,
// ветки технологий, постройки, цели (через evaluate/candidates). Слоты заполняет только хост (без автодобавления).
export type BotLevel = "easy" | "medium" | "hard";
export const BOT_LEVELS: Record<BotLevel, { depth: number; noise: number; beam?: number; blunder: number; name: string }> = {
  easy: { depth: 1, noise: 30, blunder: 0.5, name: "Лёгкий" },     // шумная оценка + четверть ходов — случайное допустимое действие
  medium: { depth: 1, noise: 0.25, blunder: 0, name: "Средний" },   // жадный по полной оценке
  hard: { depth: 2, noise: 0.1, beam: 5, blunder: 0, name: "Сильный" }, // поиск альфа-бета
};
export function matchBot(g: GameState, side: 0 | 1, cfg: StratCfg, level: BotLevel = "medium", arch = "bal", rnd: () => number = Math.random): Action {
  const L = BOT_LEVELS[level] || BOT_LEVELS.medium;
  if (L.blunder && rnd() < L.blunder && g.ap >= 1) {
    const c = candidates(g, side, cfg, true, true).filter((a) => tryApply(g, side, a, cfg)); if (c.length) return c[Math.floor(rnd() * c.length)];
  }
  return aiAction(g, side, cfg, { arch, depth: L.depth, noise: L.noise, beam: L.beam, rnd });
}
