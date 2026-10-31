// «Партия Чёрных королей» — урезанные деревья для игрока (ТЗ §14.F).
// Игрок видит только то, что можно выбрать сейчас: все варианты текущей развилки (или единственный следующий узел)
// и уже изученное. Следующие узлы, а также навсегда закрытые ветки уходят клиенту заглушкой без имени/эффекта/открытий:
//   { id: "?<ветка>.<эпоха>.<слот>", br, era, slot, state: "hidden" | "closed" }  (Вождь: { id: "?c<ур>.<слот>", lvl, slot, state })
// Это чистая функция: её вызывает StratMatch.stateFor для каждого места отдельно (зритель дерева не получает).
// Админка, редактор и симулятор работают с полными данными (STRAT_CFG / tree-data.ts).
import type { GameState, StratCfg, Piece } from "./rules";
import type { Tech, BuildId, Branch } from "./econ-cfg";
import type { ChiefNode } from "./content-cfg";
import { techList, techView, techState, canResearch, techEra, rCost, sz, buildLocked, chiefDef, pieceLevel, chiefChoices } from "./econ";
import { fxToEffects, describeEffects, chiefEffects, unitActEffects, ultEffects, type Effect } from "./effects";

export type TechNodeView =
  | { id: string; br: Branch; era: number; slot: number; state: "got" | "open"; grp: string; req?: string[]; name: string; eff: string; tip: string; unlock?: BuildId[]; fx: Tech["fx"]; cost: number; err?: string }
  | { id: string; br: Branch; era: number; slot: number; state: "hidden" | "closed" };
export type ChiefNodeView =
  | { id: string; lvl: number; slot: number; state: "got" | "open"; grp: string; req?: string[]; kind: ChiefNode["kind"]; name: string; eff: string; tip: string; fx: ChiefNode["fx"]; err?: string; ult?: string; u?: any }
  | { id: string; lvl: number; slot: number; state: "hidden" | "closed" };
export type UnitTreeView = { act?: any[]; up?: { pow: number; cd: number; eff: string }; ult?: string; u?: any; hidden: number[] }; // hidden — уровни-заглушки (3/4/5)
export type TreeView = { v: 1; techs: TechNodeView[]; lockedBld: BuildId[]; units: Record<string, UnitTreeView>;
  chief: { type: string; name: string; base: { hp: number; atk: number; arm: number }; nodes: ChiefNodeView[] } | null };

/** технологии стороны: своя раса (чужие расовые ветки не уходят вовсе) */
export function techTreeView(g: GameState, side: number, cfg: StratCfg): TechNodeView[] {
  if (!g.ec || sz(g, cfg).eras <= 0) return [];
  const race = g.races[side], have = g.ec.techs[side], list = techList(cfg).filter((t) => !t.race || t.race === race);
  const slots = new Map<string, number>(), out: TechNodeView[] = [];
  for (const t of list) {
    // t1163: эпоха и цена — по лиге (techEra/rCost, как в canResearch): «Чаща» в Обычной — эпоха IV, и заглушка «?» тоже в IV
    const era = techEra(g, t, cfg), k = t.br + "." + era, slot = slots.get(k) || 0; slots.set(k, slot + 1);
    const ph = (state: "hidden" | "closed"): TechNodeView => ({ id: `?${t.br}.${era}.${slot}`, br: t.br, era, slot, state });
    const st = techState(g, side, t, cfg);
    if (st === "locked") { out.push(ph("closed")); continue; }
    const got = st === "got", reachable = got || t.grp === "root" || !t.req?.length || t.req.some((r) => have.includes(r));
    if (!reachable) { out.push(ph("hidden")); continue; }
    const v = techView(cfg, t, race), ef: Effect[] = fxToEffects(v.fx);
    if (t.id === "static") ef.push({ key: "chainDmg", trigger: "onHit", target: "enemy", mag: (cfg.econ.fx as any).staticChain, stack: "add" });
    const err = got ? undefined : canResearch(g, side, t, cfg) || undefined;
    out.push({ id: t.id, br: t.br, era, slot, state: got ? "got" : "open", grp: t.grp, ...(t.req ? { req: t.req } : {}), name: v.name, eff: v.eff,
      tip: describeEffects(ef) || v.eff, ...(t.unlock ? { unlock: t.unlock } : {}), fx: v.fx, cost: rCost(g, cfg, cfg.econ.research.cost[era]), ...(err ? { err } : {}) });
  }
  hideReq(out); // t1144: req видимого узла не выдаёт id скрытого («Боевой клич» ← ambush|drill, когда взят drill)
  return out;
}

/** дерево навыков своего Вождя: изученное + текущая развилка (наименьший уровень с незанятой группой) */
export function chiefTreeView(g: GameState, side: number, cfg: StratCfg): TreeView["chief"] {
  if (!g.ec) return null;
  const type = g.ec.chief[side]?.type, d = type ? chiefDef(cfg, type) : undefined; if (!d) return null;
  const king: Piece | undefined = g.pieces.find((p) => p.owner === side && p.kind === "king");
  const have = king?.tal || [], lv = king ? pieceLevel(king, cfg) : 1;
  const takenGrp = new Set(have.map((id) => d.tree.find((n) => n.id === id)?.grp));
  const free = d.tree.filter((n) => !takenGrp.has(n.grp)), fork = free.length ? Math.min(...free.map((n) => n.lvl)) : 99;
  // открыто = что можно взять прямо сейчас (те же правила, что на сервере); нет очка — ближайшая развилка
  const can = king ? new Set(chiefChoices(g, king, cfg).map((n) => n.id)) : new Set<string>();
  const slots = new Map<number, number>(), nodes: ChiefNodeView[] = [];
  for (const n of d.tree) {
    const slot = slots.get(n.lvl) || 0; slots.set(n.lvl, slot + 1);
    const ph = (state: "hidden" | "closed"): ChiefNodeView => ({ id: `?c${n.lvl}.${slot}`, lvl: n.lvl, slot, state });
    const got = have.includes(n.id);
    const reqOk = !n.req?.length || n.req.some((r) => have.includes(r));
    const reqDead = !!n.req?.length && n.req.every((r) => !have.includes(r) && takenGrp.has(d.tree.find((x) => x.id === r)?.grp));
    if (!got && (takenGrp.has(n.grp) || reqDead)) { nodes.push(ph("closed")); continue; }
    if (!got && !(can.size ? can.has(n.id) : n.lvl === fork && reqOk)) { nodes.push(ph("hidden")); continue; }
    const err = got ? undefined : !king ? "no_chief" : n.lvl > lv ? "need_lvl" : have.length >= lv - 1 ? "no_point" : undefined;
    nodes.push({ id: n.id, lvl: n.lvl, slot, state: got ? "got" : "open", grp: n.grp, ...(n.req ? { req: n.req } : {}), kind: n.kind, name: n.name, eff: n.eff,
      tip: describeEffects(chiefEffects(cfg, n)) || n.eff, fx: n.fx, ...(err ? { err } : {}), ...(n.ult ? { ult: n.ult, u: (cfg as any).ults?.[n.ult] } : {}) });
  }
  hideReq(nodes as any);
  return { type: d.id, name: d.name, base: d.base, nodes };
}

/** прогрессия фигур по ролям: ур. 3 видно, когда у своей фигуры этой роли взят ур. 2; ур. 4 — после выбора умения; ур. 5 — когда фигура дошла до 5 */
export function unitTreeView(g: GameState, side: number, cfg: StratCfg): Record<string, UnitTreeView> {
  const UT = (cfg as any).unitTree || {}, out: Record<string, UnitTreeView> = {};
  for (const kind of Object.keys(UT)) {
    const T = UT[kind], mine = g.pieces.filter((p) => p.owner === side && p.kind === kind);
    const l3 = mine.some((p) => (p.tal?.length || 0) >= 1 || pieceLevel(p, cfg) >= 3), l4 = mine.some((p) => (p.tal?.length || 0) >= 2), l5 = mine.some((p) => pieceLevel(p, cfg) >= 5);
    const v: UnitTreeView = { hidden: [] };
    if (l3) v.act = T.act.map((a: any) => ({ ...a, tip: describeEffects(unitActEffects(a)) })); else v.hidden.push(3);
    if (l4) v.up = T.up; else v.hidden.push(4);
    if (l5) { const u = (cfg as any).unitUlts?.[T.ult]; v.ult = T.ult; v.u = { ...u, name: (cfg as any).unitRaceNames?.[g.races[side]]?.[T.ult] || u?.name, tip: describeEffects(ultEffects(cfg, T.ult, true)) }; } else v.hidden.push(5);
    out[kind] = v;
  }
  return out;
}
export function treeView(g: GameState, side: number, cfg: StratCfg): TreeView {
  const lockedBld = g.ec ? (Object.keys(cfg.build) as BuildId[]).filter((b) => buildLocked(g, side, b, cfg)) : [];
  return { v: 1, techs: techTreeView(g, side, cfg), lockedBld, units: unitTreeView(g, side, cfg), chief: chiefTreeView(g, side, cfg) };
}

/** правка админки уходит клиенту без деревьев (иначе их можно прочитать из JSON) */
export const TREE_PATCH_KEYS = ["techs", "techRace", "chiefs", "ults", "unitUlts", "unitTree"];
export function publicPatch(patch: any): any {
  if (!patch || typeof patch !== "object") return patch;
  const o: any = {}; for (const k of Object.keys(patch)) if (!TREE_PATCH_KEYS.includes(k)) o[k] = patch[k];
  return Object.keys(o).length ? o : undefined;
}

/** Клиент: собрать «видимый» конфиг из урезанного дерева (заглушки не выбираются: своя группа, эпоха/уровень 99 не нужны —
 *  у них нет req/unlock/fx; для замков построек добавляются псевдоузлы без имён). */
export function cfgWithTree(cfg: StratCfg, tv: TreeView | undefined | null): StratCfg {
  if (!tv) return cfg;
  const techs: Tech[] = tv.techs.map((n) => "name" in n
    ? { id: n.id, br: n.br, era: n.era, grp: n.grp, ...(n.req ? { req: n.req } : {}), name: n.name, eff: n.tip || n.eff, ...(n.unlock ? { unlock: n.unlock } : {}), fx: n.fx }
    : { id: n.id, br: n.br, era: n.era, grp: n.id, req: ["?"], name: "?", eff: "", fx: {} });
  for (const b of tv.lockedBld) if (!techs.some((t) => "unlock" in t && t.unlock?.includes(b) && !tv.techs.find((x) => x.id === t.id && x.state === "got")))
    techs.push({ id: "?lock." + b, br: "rush", era: 99, grp: "?lock." + b, req: ["?"], name: "?", eff: "", unlock: [b], fx: {} });
  const chiefs = tv.chief ? [{ id: tv.chief.type, v: 1, race: "any", name: tv.chief.name, sprite: "", unlock: "free", base: tv.chief.base,
    tree: tv.chief.nodes.map((n) => "name" in n ? { id: n.id, lvl: n.lvl, grp: n.grp, ...(n.req ? { req: n.req } : {}), kind: n.kind, name: n.name, eff: n.eff, fx: n.fx, ...(n.ult ? { ult: n.ult } : {}) }
      : { id: n.id, lvl: 99, grp: n.id, kind: "passive" as const, name: "?", eff: "", fx: {} }) }] : [];
  const ults: Record<string, any> = {}; for (const n of tv.chief?.nodes || []) if ("ult" in n && n.ult && n.u) ults[n.ult] = n.u;
  const unitTree: Record<string, any> = {}, unitUlts: Record<string, any> = {};
  for (const [k, v] of Object.entries(tv.units || {})) { unitTree[k] = { act: v.act || [], up: v.up || { pow: 1, cd: 0, eff: "" }, ult: v.ult || "" }; if (v.ult && v.u) unitUlts[v.ult] = v.u; }
  return { ...cfg, techs, chiefs, ults, unitTree, unitUlts, unitRaceNames: {}, techRace: undefined } as any;
}

/** Ход игрока целится в узел, которого он не видит → тот же ответ, что и на несуществующий id (нет «оракула» по ошибкам). */
export function hiddenTarget(g: GameState, side: number, act: any, cfg: StratCfg): string | null {
  if (!act || !g.ec) return null;
  if (act.a === "research") { const n = techTreeView(g, side, cfg).find((x) => x.id === act.t); return n && n.state !== "hidden" && n.state !== "closed" ? null : "bad_tech"; }
  if (act.a === "talent") { const p = g.pieces.find((q) => q.id === act.id && q.owner === side); if (!p || p.kind !== "king" || act.t === "auto") return null;
    const n = chiefTreeView(g, side, cfg)?.nodes.find((x) => x.id === act.t); return n && n.state !== "hidden" && n.state !== "closed" ? null : "bad_talent"; }
  return null;
}

/** оставить в req только id узлов, видимых этой стороне (остальные — скрыты: их id не должен утечь) */
function hideReq(list: any[]) {
  const vis = new Set(list.filter((x) => "name" in x).map((x) => x.id));
  for (const x of list) if (Array.isArray(x.req)) { const r = x.req.filter((id: string) => vis.has(id)); if (r.length !== x.req.length) x.req = r.length ? r : ["?"]; }
}
