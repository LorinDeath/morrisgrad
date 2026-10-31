// Цели победы (t1208: все 5; на лимите ходов — по числу целей) и Вождь-герой (опыт, 5 уровней, навыки, возрождение).
// Формы данных ещё не зафиксированы (ТЗ §14) — читаем защитно: если сервер прислал готовые цели/поля Вождя, берём их;
// иначе выводим прогресс из текущего снимка. Чистый клиентский код, правил не меняет.
import type { GameState, Piece, StratCfg } from "../../../server/strat/rules";
import { TECHS } from "../../../server/strat/econ-cfg";
import { redacted } from "./fog";
import { allies } from "./players";

export type GoalId = "chief" | "capital" | "glory" | "wonder" | "tech";
export const GOALS: { id: GoalId; name: string; icon: string; hint: string }[] = [
  { id: "chief", name: "Чёрный список", icon: "skull", hint: "Сразить первого Вождя каждого соперника (в 2×2 — общий счёт команды). Возрождённые Вожди не в счёт. Нажмите, чтобы открыть список." },
  { id: "capital", name: "Столица взята", icon: "castle", hint: "Захватить вражескую столицу" },
  { id: "glory", name: "Порог Славы", icon: "glory", hint: "Набрать Славу до порога" },
  { id: "wonder", name: "Великое чудо", icon: "crown", hint: "Возвести Великое чудо" },
  { id: "tech", name: "Вершина знаний", icon: "tech", hint: "Изучить финальную технологию эпохи III" },
];
export type Goal = { id: GoalId; done: boolean; v: number; max: number; name?: string; icon?: string; desc?: string; text?: string; unit?: string; parts?: { label: string; cur: number; max: number }[]; turn?: number };
// id целей нового сервера (balance WIP): chief, hold, treasury, domain, wonder — значки и подсказки по умолчанию
const SRV_DEF: Record<string, { name: string; icon: string; hint: string }> = {
  hold: { name: "Твердыня", icon: "castle", hint: "Набрать очки опорных пунктов и держать их нужное число ходов подряд" },
  treasury: { name: "Казна", icon: "gold", hint: "Накопить золото до порога" },
  domain: { name: "Держава", icon: "flag", hint: "Владеть нужным числом клеток земли" },
};
/** Описание цели: из самой цели (сервер), иначе из локального списка. */
export function goalDef(q: { id: string; name?: string; icon?: string; desc?: string }) {
  const d: any = GOALS.find((x) => x.id === q.id) || SRV_DEF[q.id] || { name: q.id, icon: "star", hint: "" };
  return { name: q.name || d.name, icon: q.icon && !/[^a-z_0-9]/.test(q.icon) ? q.icon : d.icon, hint: q.desc || d.hint };
}
const num = (v: any, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);

/** Цели обеих сторон: [side][5]. need — сколько нужно для победы (по умолчанию 3). */
export function goalsOf(S: any, G: GameState, cfg: StratCfg): { need: number; sides: Goal[][] } {
  const g: any = G, srv = g.goals ?? S?.goals ?? g.ec?.goals; let need = num(g.goalsNeed ?? S?.goalsNeed ?? (cfg as any).goals?.need, 3);
  // новый сервер: S.goals[side] = { need, done, list:[{id,name,icon,desc,done,turn,p,cur,max,unit,text,parts}] }
  if (Array.isArray(srv) && srv.some((r: any) => Array.isArray(r?.list))) {
    const n = Math.max(srv.length, S?.seats?.length || 2);
    const sides: Goal[][] = Array.from({ length: n }, (_, side) => (srv[side]?.list || []).map((r: any) => ({ id: r.id, done: !!r.done, v: num(r.cur, r.done ? 1 : 0), max: num(r.max, 1), name: r.name, icon: r.icon, desc: r.desc, text: r.text, unit: r.unit, parts: r.parts, turn: r.turn })));
    need = num(srv.find((r: any) => r?.need != null)?.need, need); return { need, sides };
  }
  const sides: Goal[][] = Array.from({ length: Math.max(2, S?.seats?.length || 2) }, (_, side) => GOALS.map((d) => {
    const raw = srv?.[side]?.[d.id] ?? (Array.isArray(srv?.[side]) ? srv[side].find((x: any) => x?.id === d.id) : undefined);
    if (raw != null) { if (typeof raw === "boolean" || typeof raw === "number" && raw <= 1 && !raw.toString().includes(".")) return { id: d.id, done: !!raw, v: raw ? 1 : 0, max: 1 };
      return { id: d.id, done: !!(raw.done ?? raw.ok), v: num(raw.v ?? raw.prog ?? raw.cur, raw.done ? 1 : 0), max: num(raw.max ?? raw.need, 1) }; }
    return derive(S, G, side, d.id);
  }));
  return { need, sides };
}
function derive(S: any, G: GameState, side: number, id: GoalId): Goal {
  const ec: any = G.ec, foe = 1 - side;
  switch (id) {
    case "glory": { const thr = num(S?.g?.glory, 0), v = num(ec?.res?.[side]?.glory); return { id, done: thr > 0 && v >= thr, v, max: thr || 1 }; }
    case "chief": { const rows = blacklistOf(S, G, side), v = rows.filter((r) => r.dead).length; return { id, done: rows.length > 0 && v >= rows.length, v, max: Math.max(1, rows.length) }; }
    case "capital": { const c = (ec?.cities || []).some((q: any) => q.cap && q.owner === side && q.orig != null && q.orig === foe) || (S?.result?.reason === "capital" && S.result.winner === side); return { id, done: !!c, v: c ? 1 : 0, max: 1 }; }
    case "wonder": { const w = (ec?.cities || []).some((q: any) => q.owner === side && (q.bld || []).some((b: string) => /wonder|chudo/i.test(b))); return { id, done: w, v: w ? 1 : 0, max: 1 }; }
    case "tech": { const have: string[] = ec?.techs?.[side] || [], T = TECHS as any[], anyFinal = T.some((t) => t.final);
      const got = have.some((h) => { const t = T.find((x) => x.id === h); return !!t && (anyFinal ? !!t.final : t.era >= 3); });
      return { id, done: got, v: got ? 3 : Math.min(num(ec?.era?.[side], 1), 3) - 1, max: 3 }; }
  }
}

// ---------- Вождь ----------
export type ChiefInfo = { p: Piece | null; lv: number; maxLv: number; xp: number; prev: number; next?: number; pend: number; skills: any[][]; respawn: number };
export function chiefOf(S: any, G: GameState, side: number, cfg: StratCfg): ChiefInfo {
  const p = G.pieces.find((q) => q.owner === side && q.kind === "king") || null, c: any = (cfg as any).chief || {};
  // cfg.chief.lv — опыт до ур. 2…5 по индексам 1…4 (как pieceLevel на сервере: ур. = i + 1 при xp ≥ L[i])
  const CL: number[] | null = Array.isArray(c.lv) ? c.lv : null, L: number[] = CL ? [0, ...CL] : c.xp || [0, 0, 3, 7, 12, 18], maxLv = num(c.maxLv, Math.max(1, L.length - 1));
  const xp = num((p as any)?.xp ?? (G as any).chief?.[side]?.xp), lv = num((p as any)?.lv, (() => { let l = 1; for (let i = 2; i <= maxLv; i++) if (xp >= (L[i] ?? Infinity)) l = i; return l; })());
  const skills: any[][] = c.skills || (cfg as any).chiefSkills || (cfg.talents as any).king || [];
  const took = ((p as any)?.tal || []).length, pend = p && took + 2 <= lv && skills[took] ? took + 2 : 0;
  const ec: any = G.ec, rs = num(ec?.chiefRespawn?.[side] ?? (G as any).respawn?.[side] ?? (G as any).chief?.[side]?.respawn, 0);
  return { p, lv, maxLv, xp, prev: L[lv] ?? 0, next: lv < maxLv ? L[lv + 1] : undefined, pend, skills, respawn: p ? 0 : rs };
}

// ---------- древо навыков Вождя (по данным; тип Вождя — по расе, позже несколько на расу) ----------
export type CNode = { id: string; name: string; eff: string; lv: number; req: string[]; excl: string[]; icon?: string; red?: boolean };
export type CType = { id: string; race?: string; name: string; tree: CNode[] };
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
/** Типы Вождя расы. Источник: cfg.chiefs / cfg.chiefTypes / cfg.econ.chiefs; иначе — один тип из талантов Вождя (пары по уровням). */
export function chiefTypes(cfg: StratCfg, race: string): CType[] {
  const src: any = (cfg as any).chiefs ?? (cfg as any).chiefTypes ?? (cfg as any).econ?.chiefs;
  const list: any[] = Array.isArray(src) ? src : src && typeof src === "object" ? Object.entries(src).map(([id, v]: any) => ({ id, ...v })) : [];
  const mine = list.filter((t) => !t.race || t.race === race || (Array.isArray(t.races) && t.races.includes(race)));
  if (mine.length) return mine.map((t) => ({ id: String(t.id), race: t.race, name: t.name || "Вождь", tree: normTree(t.tree ?? t.skills ?? t.nodes ?? []) }));
  const tal: any[][] = ((cfg.talents as any)?.king || []) as any[][];
  const tree: CNode[] = []; tal.forEach((pair, i) => (pair || []).forEach((o: any) => tree.push({ id: o.id, name: o.name, eff: o.eff || "", lv: i + 2, req: [], excl: (pair || []).filter((x: any) => x !== o).map((x: any) => x.id) })));
  return [{ id: "default", name: "Вождь", tree }];
}
export function normTree(t: any): CNode[] {
  const a: any[] = Array.isArray(t) ? t.flat ? t.flat(2) : t : Object.entries(t).map(([id, v]: any) => ({ id, ...v }));
  return a.filter(Boolean).map((n: any) => ({ id: String(n.id), red: redacted(n), name: redacted(n) ? "" : n.name, eff: redacted(n) ? "" : n.eff || n.desc || "", lv: +(n.lv ?? n.level ?? n.tier ?? 2), req: arr(n.req ?? n.prereq ?? n.requires), excl: arr(n.excl ?? n.excludes ?? n.locks), icon: n.icon }));
}
export type CState = "got" | "can" | "later" | "closed";
export function chiefNodeState(n: CNode, tree: CNode[], have: string[], lv: number, points: number): { st: CState; why: string } {
  if (have.includes(n.id)) return { st: "got", why: "Взято" };
  const by = new Map(tree.map((x) => [x.id, x]));
  for (const e of n.excl) if (have.includes(e)) return { st: "closed", why: `Закрыто: выбрано «${by.get(e)?.name || e}»` };
  for (const o of tree) if (have.includes(o.id) && o.excl.includes(n.id)) return { st: "closed", why: `Закрыто: выбрано «${o.name}»` };
  const miss = n.req.filter((r) => !have.includes(r)); if (miss.length) return { st: "later", why: "Сначала: " + miss.map((r) => by.get(r)?.name || r).join(", ") };
  if (n.lv > lv) return { st: "later", why: `Откроется на ур. ${n.lv}` };
  if (points <= 0) return { st: "later", why: "Нет очков навыка" };
  return { st: "can", why: "" };
}

// ---------- «Чёрный список»: первые Вожди соперников ----------
// Цель засчитывается за гибель ПЕРВОГО Вождя каждого соперника; в 2×2 счёт общий у команды. Возрождённые Вожди не в счёт.
// Данные (догадка до ТЗ §14): G.ec.firstChief[side] = { dead, turn, by, name } (by — номер места убийцы); запасной путь для 1×1 — ec.chiefKills.
/** Запасной путь: клиент сам запоминает первую гибель Вождя из событий kill, если сервер не прислал ec.firstChief. */
export const localFell: Record<number, { turn: number; by?: number; name?: string }> = {};
export const resetFell = () => { for (const k in localFell) delete localFell[k]; };
export type BLRow = { side: number; dead: boolean; turn?: number; by?: number; byNick?: string; name?: string };
export function blacklistOf(S: any, G: GameState, side: number): BLRow[] {
  const ec: any = G.ec, n = Math.max(2, S?.seats?.length || 2), out: BLRow[] = [];
  for (let o = 0; o < n; o++) {
    if (o === side || allies(S, side, o)) continue;
    const f = ec?.firstChief?.[o] ?? ec?.chiefFell?.[o] ?? (G as any).firstChief?.[o];
    if (f) { out.push({ side: o, dead: !!(f.dead ?? f.turn != null), turn: typeof f.turn === "number" ? f.turn : undefined, by: typeof f.by === "number" ? f.by : undefined, byNick: typeof f.byNick === "string" ? f.byNick : undefined, name: typeof f.name === "string" ? f.name : undefined }); continue; }
    const lf = localFell[o]; if (lf) { out.push({ side: o, dead: true, turn: lf.turn, by: lf.by, name: lf.name }); continue; }
    const legacy = n === 2 && num(ec?.chiefKills?.[side] ?? ec?.kills?.[side]?.king, 0) > 0;
    out.push({ side: o, dead: legacy });
  }
  return out;
}
