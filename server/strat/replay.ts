// t1156: история ходов и повторы партий (как в шахматах).
// Движок детерминирован: apply() не использует случайность (жребии — до старта: первый ход, расы; боты — это просто логируемые действия).
// Поэтому лог = стартовые параметры + список принятых действий; любой ход восстанавливается повтором apply() с того же cfg.
// Контроль: hash снимка в конце каждого хода (h[]) — при смене правил после партии повтор помечается diverged и обрывается на первом расхождении.
import { newGame, apply, type GameState, type Action, type Ev, type StratCfg, type Race } from "./rules";

export type LAct = [side: 0 | 1, act: Action, auto: 0 | 1, dt: number]; // dt — мс от старта (для автопроигрывания «как было»)
export type RLog = {
  v: 1; id: string; size: number; races: [Race, Race]; first: 0 | 1; map: any | null; patch?: any; rv: string; t0: number; hiddenHp?: boolean;
  acts: LAct[]; h: string[]; // h[k] — хэш состояния после k-го хода (смены cur)
  end?: { w: number; r: string; n: number };
};
export type TurnMark = { turn: number; side: 0 | 1; from: number; to: number }; // действия [from, to) — один ход стороны

/** FNV-1a 32 → hex. Не криптография: только сверка «повтор = живая партия». */
export function fnv(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
export const rulesVer = (cfg: StratCfg) => fnv(JSON.stringify(cfg));
export const hashG = (g: GameState) => fnv(JSON.stringify(g));

export function startLog(id: string, g: GameState, cfg: StratCfg, map: any, patch?: any, hiddenHp = false): RLog {
  return { v: 1, id, size: g.size, races: [...g.races] as [Race, Race], first: g.first, map: map || null, ...(patch ? { patch } : {}), rv: rulesVer(cfg), t0: Date.now(), ...(hiddenHp ? { hiddenHp } : {}), acts: [], h: [] };
}
/** Записать принятое действие; turned — после него сменился ход (тогда же запоминаем хэш). */
export function logAct(log: RLog, side: 0 | 1, act: Action, auto: boolean, g: GameState, turned: boolean) {
  log.acts.push([side, act, auto ? 1 : 0, Date.now() - log.t0]); if (turned || g.winner !== -1) log.h.push(hashG(g));
}
export function logEnd(log: RLog, w: number, r: string) { if (!log.end) log.end = { w, r, n: log.acts.length }; }

/** Восстановить партию до действия upto (не включая). keep — сохранить события каждого действия. */
export function rebuild(log: RLog, cfg: StratCfg, upto = log.acts.length, from?: { g: GameState; i: number }) {
  const g: GameState = from ? structuredClone(from.g) : newGame(log.size, log.races, log.first, cfg, 0, log.map || undefined);
  const evs: Ev[][] = []; let diverged = -1, k = 0;
  for (let i = from ? from.i : 0; i < Math.min(upto, log.acts.length); i++) {
    const [side, act] = log.acts[i], cur = g.cur, r = apply(g, side, structuredClone(act), cfg);
    if (!r.ok) { diverged = i; break; }
    evs.push(r.ev);
    if (!from && (g.cur !== cur || g.winner !== -1)) { if (log.h[k] && log.h[k] !== hashG(g)) { diverged = i; break; } k++; }
  }
  if (diverged < 0 && log.end && upto >= log.end.n && g.winner === -1) { g.winner = log.end.w as any; g.reason = log.end.r; } // сдача / тайм-аут — вне apply()
  return { g, evs, diverged };
}
/** Разметка ходов: какие действия относятся к какому ходу. */
export function turnMarks(log: RLog): TurnMark[] {
  const out: TurnMark[] = []; let turn = 1, from = 0, side = log.first;
  for (let i = 0; i < log.acts.length; i++) {
    const a = log.acts[i];
    if (a[0] !== side) { out.push({ turn, side, from, to: i }); if (side !== log.first) turn++; side = a[0]; from = i; }
    if (a[1].a === "end") { out.push({ turn, side, from, to: i + 1 }); if (side !== log.first) turn++; side = (1 - side) as 0 | 1; from = i + 1; }
  }
  if (from < log.acts.length) out.push({ turn, side, from, to: log.acts.length });
  return out;
}
/** Публичные поля действия: свои и после конца — всё; чужие в живой партии — только то, что и так видно на доске
 *  (ходы/удары/ульты/снос — координаты; экономика — только вид действия и город: какая технология/талант — видно лишь по событиям). */
const PUB: Record<string, string[]> = {
  move: ["id", "x", "y", "promo"], attack: ["id", "x", "y"], ult: ["id", "x", "y"], raze: ["id", "city", "b"], end: [], era: [],
  recruit: ["city", "kind", "x", "y"], build: ["city", "b", "id", "x", "y"], repair: ["city", "b"], claim: ["city", "x", "y"], found: ["id"], found_cancel: [],
  ability: ["id", "ab", "x", "y"], talent: ["id"], research: [], swap: [], trade: [],
};
export function actView(act: Action, mine: boolean): any {
  if (mine) return act; const keep = PUB[act.a] || ["city"], o: any = { a: act.a };
  for (const k of keep) if ((act as any)[k] !== undefined) o[k] = (act as any)[k];
  return o;
}
/** Короткая запись хода для списка (как «e2–e4»): буквы — столбцы a.., цифры — ряды снизу. */
export function note(size: number, act: Action): string {
  const c = (x: number, y: number) => (x < 26 ? String.fromCharCode(97 + x) : "z" + (x - 25)) + (size - y);
  const a: any = act;
  if (a.a === "move") return `→${c(a.x, a.y)}${a.promo ? "=" + a.promo : ""}`;
  if (a.a === "attack") return `×${c(a.x, a.y)}`;
  if (a.a === "ult") return `★${c(a.x, a.y)}`;
  if (a.a === "end") return "—";
  return a.a;
}
/** Список ходов для клиента. seat — кто смотрит (−1 — зритель); live — партия идёт (чужие действия урезаны). */
export function moveList(log: RLog, seat: number, live: boolean, upto = log.acts.length) {
  const list = log.acts.slice(0, upto).map(([side, act, auto, dt], i) => ({ i, side, a: actView(act, !live || side === seat), n: note(log.size, act), auto: !!auto, dt }));
  return { n: upto, turns: turnMarks({ ...log, acts: log.acts.slice(0, upto) }), list };
}
export const encodeLog = (log: RLog) => JSON.stringify(log);
export function decodeLog(s: string): RLog | null { try { const o = JSON.parse(s); return o && o.v === 1 && Array.isArray(o.acts) ? o : null; } catch { return null; } }

/** Кэш снимков для перемотки: снимок каждые EVERY действий; кадр i строится от ближайшего снимка ≤ i. */
export class FrameCache {
  key: { g: GameState; i: number }[] = []; constructor(public log: RLog, public cfg: StratCfg, public every = 20) {}
  at(i: number): { g: GameState; ev: Ev[]; diverged: number } {
    i = Math.max(0, Math.min(i, this.log.acts.length));
    let base = this.key.filter((k) => k.i <= i).pop();
    if (!base) { const r = rebuild(this.log, this.cfg, 0); base = { g: r.g, i: 0 }; this.key.push(base); }
    let g = structuredClone(base.g), ev: Ev[] = [], d = -1;
    for (let j = base.i; j < i; j++) {
      const [side, act] = this.log.acts[j], r = apply(g, side, structuredClone(act), this.cfg); if (!r.ok) { d = j; break; }
      ev = r.ev; if ((j + 1) % this.every === 0 && !this.key.some((k) => k.i === j + 1)) { this.key.push({ g: structuredClone(g), i: j + 1 }); this.key.sort((a, b) => a.i - b.i); }
    }
    if (d < 0 && this.log.end && i >= this.log.end.n && g.winner === -1) { g.winner = this.log.end.w as any; g.reason = this.log.end.r; }
    return { g, ev, diverged: d };
  }
}

/** Разбор удара (hit.why) для конкретного зрителя: чужие технологии/таланты Вождя/постройки не раскрываются —
 *  складываются в одну часть { k: "hidden", src: "hidden" } (сумма сохраняется). reveal — после конца партии (всё видно). */
export function redactX(ev: Ev[], seat: number, reveal: boolean): Ev[] {
  if (reveal || !ev?.some((e: any) => e.why)) return ev;
  const fold = (P: any[]) => { const out: any[] = [], h = new Map<number, number>();
    for (const q of P) if (q.side !== seat && (q.src === "tech" || q.src === "chief" || q.src === "bld")) h.set(q.side, (h.get(q.side) || 0) + q.n); else out.push(q);
    for (const [side, n] of h) if (n) out.push({ k: "hidden", n, src: "hidden", side }); return out; };
  return ev.map((e: any) => e.why ? { ...e, why: { ...e.why, atk: fold(e.why.atk), arm: fold(e.why.arm) } } : e);
}
