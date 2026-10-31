// «Партия Чёрных королей» — этап 2: экономика, города и территория, постройки, найм, технологии, таланты, Слава.
// Чистые функции поверх GameState (rules.ts вызывает хуки). Все числа — cfg.econ / cfg.build / cfg.talents (econ-cfg.ts).
import type { GameState, Piece, Kind, Race, Ev, StratCfg, Action } from "./rules";
import { passable, str as mapStr, ter } from "./terrain";
import { UNLOCK, PAWN_BARRACKS_COST, HERO_ERA, buildGate, type BuildId, type Tech, type TechFx } from "./econ-cfg";
import type { ChiefDef, ChiefNode } from "./content-cfg";
import { checkChiefName } from "./names";
import { leagueOf } from "./rating";
import { raceNums } from "./effects";

export type City = { id: number; owner: 0 | 1; x: number; y: number; cap: boolean; growth: number; lvl: number; bld: BuildId[]; forge: Kind[]; acted: boolean; sg: number; name: string;
  bhp?: Partial<Record<BuildId, number>>; ruin?: BuildId[];
  tg?: number; grow?: number[]; claims?: number; cw?: number; set?: boolean; rg?: number }; // rg — t1194: сколько шагов радиуса уже выдано клетками // cw — своих ходов до бесплатного автоприсоединения // claims — готовые права на клетку; set — поселение (t1140: только точка призыва + земля) // t1139: ходов до роста земли и присоединённые клетки (индексы y*size+x) // t1136: текущее HP построек (нет ключа — целая) и руины
export type Res = { gold: number; know: number; glory: number };
export type Econ = {
  res: [Res, Res]; cities: City[]; techs: [string[], string[]]; era: [number, number];
  rs: [number, number]; // исследований в этот ход
  ruins: number[]; quiet: number; nextCity: number;
  lost?: Record<number, 1>; ct?: Record<number, { o: 0 | 1; n: number }>; // t1140: клетки, ставшие нейтральными после захвата
  fnd?: ({ id: number; x: number; y: number; left: number; gold: number } | null)[]; // t1140: канал поселения Вождя по сторонам
  towers?: { id: number; owner: 0 | 1; x: number; y: number }[]; tbhp?: Record<number, number>; // t1140: Сторожевые башни (поле) и их HP // t1139: захваченные клетки земли и таймеры захвата
  inc: [Res, Res]; // последний доход (для панели «+N»)
  kills: [number, number];
  trades: [number, number]; // хук 2 на 2: сделок за ход
  // этап 4: цели и Вожди
  goals: [string[], string[]]; gt: [Record<string, number>, Record<string, number>]; // выполненные цели и ход выполнения
  earned: [number, number]; hold: [number, number]; // заработано золота за партию; ходов подряд с Твердыней
  chief: [ChiefState, ChiefState];
};
/** Вождь стороны: тип (реестр cfg.chiefs), имя от игрока, поколение, таймер возрождения, история */
export type ChiefState = { type: string; name: string; gen: number; dead: number; renames: number; nameUntil: number; surv: number;
  hist: { gen: number; name: string; born: number; died?: number; by?: number; lvl?: number }[] };
export type EconAction =
  | { a: "recruit"; city: number; kind: Kind; x: number; y: number }
  | { a: "build"; city?: number; b: BuildId; kind?: Kind; id?: number; x?: number; y?: number } // t1137: строит Вождь (id — фигура Вождя; city — проверка/подсказка)
  | { a: "research"; t: string }
  | { a: "era" }
  | { a: "talent"; id: number; t: string }
  | { a: "found"; id: number }
  | { a: "repair"; city: number; b: BuildId }
  | { a: "claim"; city: number; x: number; y: number } // t1140: «Расширить» — потратить готовое право города на выбранную клетку
  | { a: "found_cancel" } // t1140: прервать закладку поселения Вождём
  | { a: "swap"; city: number; n: number }
  | { a: "trade"; to: number; give: Partial<Res>; get: Partial<Res> }
  | { a: "ability"; id: number; ab: string; x?: number; y?: number }
  | { a: "name"; name: string };
export const ECON_ACTS = ["recruit", "build", "repair", "claim", "found_cancel", "research", "era", "talent", "found", "swap", "trade", "ability", "name"];

const CAP_NAMES = ["Столица"], OUT_NAMES = ["Застава", "Дозор"];
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const pieceAt = (g: GameState, x: number, y: number) => g.pieces.find((p) => p.x === x && p.y === y);
export const sz = (g: GameState, cfg: StratCfg) => cfg.econ.sizes[g.size] || cfg.econ.sizes[8];
export const hasTech = (g: GameState, side: number, id: string) => !!g.ec?.techs[side]?.includes(id);
const other = (s: number) => (1 - s) as 0 | 1;
export const techList = (cfg: StratCfg): Tech[] => (cfg as any).techs;
export const techOf = (cfg: StratCfg, id: string) => techList(cfg).find((t) => t.id === id);
/** сумма эффекта key по изученным технологиям стороны (shot — максимум) */
export function tfx(g: GameState, side: number, key: keyof TechFx, cfg: StratCfg): number {
  const ids = g.ec?.techs[side] || []; let s = 0;
  const race = g.races[side];
  for (const id of ids) { const v = (techFx(cfg, id, race) as any)?.[key]; if (typeof v === "number") s = key === "shot" ? Math.max(s, v) : s + v; }
  return s + bfx(g, side, key, cfg);
}
/** t1139: fx легендарных построек стороны (cfg.build[b].fx), как у технологий */
export function bfx(g: GameState, side: number, key: string, cfg: StratCfg): number {
  let s = 0; if (!g.ec) return 0;
  for (const c of g.ec.cities) if (c.owner === side) for (const b of c.bld) { const v = (cfg.build as any)[b]?.fx?.[key]; if (typeof v === "number") s += v; }
  return s;
}
/** t1139: эпоха, с которой доступно Великое чудо (на 15×15 с эпохой IV — по-прежнему III) */
/** t1140/t1141: правила лиги партии (null — лиговые правила выключены) */
/** t1163: числа расы стороны с учётом лиги (econ.league[л].race[раса] поверх cfg.race[раса]) */
export function raceCfg(g: GameState, side: number, cfg: StratCfg): any { return raceNums(cfg, g.races[side], g.size); }
/** t1163: +радиус столицы от технологий/легенд; fx.capRLvl — бонус этой технологии действует только с уровня столицы N («Чаща» — с ур. 2) */
export function capRBonus(g: GameState, c: City, cfg: StratCfg): number {
  let s = bfx(g, c.owner, "capR", cfg); const race = g.races[c.owner];
  for (const id of g.ec?.techs[c.owner] || []) { const f: any = techFx(cfg, id, race); if (typeof f?.capR === "number" && c.lvl >= (f.capRLvl || 0)) s += f.capR; }
  return s;
}
export function lg(g: GameState, cfg: StratCfg) { const E = cfg.econ as any; if (!E.leagueRules || !E.league) return null; return E.league[leagueOf(g.size) || "tactical"] || null; }
/** t1143: «Сила стихии» — ситуативный прирост ОД расы: { n — ОД (с потолком лиги), have — величина условия, per, cap, label } */
export function raceAp(g: GameState, side: number, cfg: StratCfg): { n: number; have: number; per: number; cap: number; label: string; kind: string } {
  const L = lg(g, cfg), R = (cfg.econ as any).raceAp?.[g.races[side]]; if (!L || !R || !g.ec) return { n: 0, have: 0, per: 1, cap: 0, label: "", kind: "" };
  const ec = g.ec as any, n = g.size; let h = 0;
  if (R.kind === "kills") h = ec.rap?.[side]?.kills || 0;
  else if (R.kind === "fullAp") h = ec.rap?.[side]?.full ? 1 : 0;
  else if (R.kind === "chilled") h = g.pieces.filter((p) => p.owner !== side && (p as any).chill > 0).length;
  else if (R.kind === "walls") h = ec.cities.filter((c: City) => c.owner === side && c.bld.includes("wall")).length + (ec.towers || []).filter((t: any) => t.owner === side).length;
  else if (R.kind === "grown") h = ec.cities.filter((c: City) => c.owner === side).reduce((s: number, c: City) => s + (c.grow?.length || 0), 0);
  else if (R.kind === "shore") { const T = territory(g, cfg); for (const p of g.pieces) if (p.owner === side && T[p.y * n + p.x] === side) {
    let w = false; for (let dy = -1; dy <= 1 && !w; dy++) for (let dx = -1; dx <= 1; dx++) { const x = p.x + dx, y = p.y + dy; if (x >= 0 && y >= 0 && x < n && y < n && g.map && ter(g.map, x, y) === "w") { w = true; break; } }
    if (w) h++; } }
  return { n: Math.min(L.raceCap, Math.floor(h / (R.per || 1))), have: h, per: R.per || 1, cap: L.raceCap, label: R.label, kind: R.kind };
}
/** t1141: темп эпох — цена технологий и эпох × research лиги */
export const rCost = (g: GameState, cfg: StratCfg, v: number) => Math.round(v * (lg(g, cfg)?.research ?? 1));
export const wonderEra = (g: GameState, cfg: StratCfg) => Math.min(sz(g, cfg).eras, (cfg.econ as any).era4?.wonderEra ?? 99);
export function tfxK(g: GameState, side: number, key: "atkK" | "armK", kind: Kind, cfg: StratCfg): number {
  const ids = g.ec?.techs[side]; if (!ids?.length) return 0; let s = 0;
  const race = g.races[side];
  for (const id of ids) s += (techFx(cfg, id, race) as any)?.[key]?.[kind] || 0;
  return s;
}
/** узел дерева в варианте расы: имя/эффект/fx (шаблон + cfg.techRace) */
export function techView(cfg: StratCfg, t: Tech, race: string): Tech {
  const TR = (cfg as any).techRace; if (!TR || t.br === "elem") return t;
  const i = TR.order.indexOf(t.id), nm = i >= 0 ? TR.names[race]?.[i] : undefined, v = TR.fx[race]?.[t.id];
  return nm || v ? { ...t, name: nm || t.name, ...(v ? { eff: v.eff, fx: v.fx } : {}) } : t;
}
const fxCache = new WeakMap<object, Map<string, TechFx>>();
function techFx(cfg: StratCfg, id: string, race: string): TechFx | undefined {
  let m = fxCache.get(cfg as any); if (!m) { m = new Map(); fxCache.set(cfg as any, m); }
  const k = race + ":" + id; if (m.has(k)) return m.get(k);
  const t = techOf(cfg, id); const fx = t ? techView(cfg, t, race).fx : undefined; m.set(k, fx as any); return fx;
}
// ---------- постройки: шаблон + расовый вариант
export const tplOf = (b: string, cfg: StratCfg) => ((cfg as any).buildTpl?.[b] ? b : "special");
export function bp(g: GameState, side: number, b: string, key: string, cfg: StratCfg): number {
  const t = tplOf(b, cfg), v = (cfg as any).buildRace?.[g.races[side]]?.[t]?.p?.[key];
  if (typeof v === "number") return v;
  const d = (cfg as any).buildTpl?.[t]?.p?.[key]; if (typeof d === "number") return d;
  return (cfg.build as any)[b]?.[key] || 0;
}
/** имя/иконка/эффект постройки для расы (для UI и журнала) */
export function buildView(cfg: StratCfg, race: string, b: string) {
  const B: any = (cfg.build as any)[b] || {}, v = (cfg as any).buildRace?.[race]?.[tplOf(b, cfg)] || {};
  return { id: b, tpl: tplOf(b, cfg), type: (cfg as any).buildTpl?.[tplOf(b, cfg)]?.type || "special", name: v.name || B.name, icon: v.icon || B.icon, eff: v.eff || B.eff, cost: B.cost };
}
/** параметры расы (пассивки) */
export const raceOf = (g: GameState, side: number, cfg: StratCfg): any => (cfg.race as any)[g.races[side]] || {};
export const maxOutposts = (g: GameState, side: number, cfg: StratCfg) => sz(g, cfg).outposts > 0 ? sz(g, cfg).outposts + tfx(g, side, "outposts", cfg) : 0;

export function initEcon(g: GameState, cfg: StratCfg) {
  const E = cfg.econ;
  const g2 = (sd: number) => E.start.gold + (sd !== g.first ? (lg(g, cfg)?.secondGold ?? (E.start as any).secondGold) || 0 : 0);
  g.ec = { res: [{ gold: g2(0), know: E.start.know, glory: 0 }, { gold: g2(1), know: E.start.know, glory: 0 }], cities: [], techs: [[], []], era: [sz(g, cfg).eras > 0 ? 1 : 0, sz(g, cfg).eras > 0 ? 1 : 0],
    rs: [0, 0], ruins: [], quiet: 0, nextCity: 1, inc: [{ gold: 0, know: 0, glory: 0 }, { gold: 0, know: 0, glory: 0 }], kills: [0, 0], trades: [0, 0],
    goals: [[], []], gt: [{}, {}], earned: [0, 0], hold: [0, 0], chief: [newChiefState(g, 0, cfg), newChiefState(g, 1, cfg)] };
  for (const s of [0, 1] as const) {
    const k = g.pieces.find((p) => p.owner === s && p.kind === "king");
    if (k) g.ec.cities.push(mkCity(g, s, k.x, k.y, true));
  }
}
function mkCity(g: GameState, owner: 0 | 1, x: number, y: number, cap: boolean): City {
  const n = g.ec.cities.filter((c) => c.owner === owner && !c.cap).length;
  return { id: g.ec.nextCity++, owner, x, y, cap, growth: 0, lvl: 0, bld: [], forge: [], acted: false, sg: 0, name: cap ? CAP_NAMES[0] : OUT_NAMES[n % OUT_NAMES.length] };
}
// ---------- Вожди
export const chiefDefs = (cfg: StratCfg): ChiefDef[] => (cfg as any).chiefs || [];
/** типы Вождей, доступные расе (unlock "free" — всем; прочие — для будущей мета-прогрессии) */
export const chiefTypesFor = (cfg: StratCfg, race: string, unlocked: string[] = []) => chiefDefs(cfg).filter((d) => (d.race === race || d.race === "any") && (d.unlock === "free" || unlocked.includes(d.unlock)));
export const chiefDef = (cfg: StratCfg, id: string) => chiefDefs(cfg).find((d) => d.id === id);
export function autoChiefName(g: GameState, side: number, gen: number, cfg: StratCfg): string {
  const L = (cfg as any).chiefNames?.[g.races[side]] || ["Вождь"]; return L[(gen - 1 + side * 3) % L.length];
}
function newChiefState(g: GameState, side: 0 | 1, cfg: StratCfg): ChiefState {
  const want = (g as any).chiefPick?.[side], ok = want && chiefTypesFor(cfg, g.races[side]).some((d) => d.id === want);
  const type = ok ? want : chiefTypesFor(cfg, g.races[side])[0]?.id || "";
  const name = autoChiefName(g, side, 1, cfg);
  return { type, name, gen: 1, dead: 0, renames: 0, nameUntil: (cfg as any).chief.name.window, surv: 0, hist: [{ gen: 1, name, born: 1 }] };
}
/** базовые характеристики Вождя по типу (вместо units.king; hpMul расы не применяется — бюджет в типе) */
export function chiefBase(g: GameState, side: number, cfg: StratCfg) {
  const d = g.ec ? chiefDef(cfg, g.ec.chief[side].type) : undefined; return d?.base || cfg.units.king;
}
export function chiefNode(cfg: StratCfg, g: GameState, side: number, id: string): ChiefNode | undefined {
  return chiefDef(cfg, g.ec?.chief[side]?.type || "")?.tree.find((n) => n.id === id);
}
export function chiefFx(g: GameState, p: Piece, key: string, cfg: StratCfg): number {
  if (p.kind !== "king" || !p.tal?.length || !g.ec) return 0; let s = 0;
  for (const id of p.tal) s += (chiefNode(cfg, g, p.owner, id)?.fx as any)?.[key] || 0;
  return s;
}
/** доступные навыки дерева: уровень открыт, группа не занята, требование выполнено, есть очко навыка */
export function chiefChoices(g: GameState, p: Piece, cfg: StratCfg): ChiefNode[] {
  if (p.kind !== "king" || !g.ec) return [];
  const d = chiefDef(cfg, g.ec.chief[p.owner].type); if (!d) return [];
  const lv = pieceLevel(p, cfg), have = p.tal || []; if (have.length >= lv - 1) return [];
  const taken = new Set(have.map((id) => d.tree.find((n) => n.id === id)?.grp));
  return d.tree.filter((n) => n.lvl <= lv && !have.includes(n.id) && !taken.has(n.grp) && (!n.req?.length || n.req.some((r) => have.includes(r))));
}
export function chiefDown(g: GameState, t: Piece, by: Piece | undefined, ev: Ev[], cfg: StratCfg) {
  if (!g.ec) return; const C = (cfg as any).chief, ch = g.ec.chief[t.owner], k = other(t.owner);
  ch.dead = lg(g, cfg)?.respawn ?? C.respawn; const h = ch.hist[ch.hist.length - 1]; if (h) { h.died = g.turn; h.by = k; h.lvl = pieceLevel(t, cfg); }
  ev.push({ e: "chief_down", side: t.owner, name: ch.name, gen: ch.gen, turn: g.turn, by: by?.id || 0 });
  if (ch.gen === 1) { addGlory(g, k, C.killGlory, "chief", ev); setGoal(g, k, "chief", ev, cfg); } else addGlory(g, k, C.lateKillGlory, "chief", ev);
}
function respawnChief(g: GameState, side: 0 | 1, ev: Ev[], cfg: StratCfg, mk: MkPiece) {
  const ch = g.ec.chief[side]; if (ch.dead > 1) { ch.dead--; return; }
  const cs = g.ec.cities.filter((c) => c.owner === side).sort((a, b) => (b.cap ? 1 : 0) - (a.cap ? 1 : 0) || b.lvl - a.lvl);
  for (const c of cs) {
    const cells: [number, number][] = pieceAt(g, c.x, c.y) ? recruitCells(g, c, "king", cfg) : [[c.x, c.y]]; if (!cells.length) continue;
    ch.dead = 0; ch.gen++; ch.renames = 0; ch.nameUntil = g.turn + (cfg as any).chief.name.window; ch.surv = 0; ch.name = autoChiefName(g, side, ch.gen, cfg);
    if (!(cfg as any).chief.sameTypeOnRespawn) { /* хук: выбор другого типа при возрождении (по умолчанию — тот же тип) */ }
    const p = mk(side, "king", cells[0][0], cells[0][1]); g.pieces.push(p);
    ch.hist.push({ gen: ch.gen, name: ch.name, born: g.turn });
    ev.push({ e: "chief_up", side, id: p.id, name: ch.name, gen: ch.gen, city: c.id }); return;
  }
  // городов нет (или все заняты): Вождь приходит «из изгнания» на свою заднюю линию — ближайшая к центру свободная клетка
  const y0 = side === 0 ? g.size - 1 : 0, mid = (g.size - 1) / 2;
  for (const dy of [0, 1, 2]) {
    const y = side === 0 ? y0 - dy : y0 + dy;
    const xs = [...Array(g.size).keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const x = xs.find((x) => !pieceAt(g, x, y) && passable(g.map, x, y, g.races[side]));
    if (x === undefined) continue;
    ch.dead = 0; ch.gen++; ch.renames = 0; ch.nameUntil = g.turn + (cfg as any).chief.name.window; ch.surv = 0; ch.name = autoChiefName(g, side, ch.gen, cfg);
    const p = mk(side, "king", x, y); g.pieces.push(p); ch.hist.push({ gen: ch.gen, name: ch.name, born: g.turn });
    ev.push({ e: "chief_up", side, id: p.id, name: ch.name, gen: ch.gen, city: 0 }); return;
  }
  ch.dead = 1; // места нет — ждём следующего хода
}
export type MkPiece = (o: 0 | 1, k: Kind, x: number, y: number) => Piece;
// ---------- цели
export const goalCfg = (g: GameState, cfg: StratCfg) => { const S = (cfg as any).goals.sizes; const k = Object.keys(S).map(Number).filter((n) => n <= g.size).sort((a, b) => b - a)[0] ?? 8; return S[k]; };
export const goalOn = (g: GameState, id: string, cfg: StratCfg) => goalCfg(g, cfg).list.includes(id);
export function setGoal(g: GameState, side: number, id: string, ev: Ev[], cfg: StratCfg) {
  if (!g.ec || !goalOn(g, id, cfg) || g.ec.goals[side].includes(id)) return;
  g.ec.goals[side].push(id); g.ec.gt[side][id] = g.turn; ev.push({ e: "goal", side, goal: id, n: g.ec.goals[side].length, turn: g.turn });
}
/** «Чёрный список» цели «Цареубийство»: ПЕРВЫЕ Вожди всех соперников (возрождённые не в счёт; прогресс навсегда).
 *  Только имя/тип/статус — без координат (туман войны). В 1×1 — одна запись; в командах/FFA — по записи на соперника (ТЗ §14.G). */
export function chiefBlacklist(g: GameState, side: number) {
  if (!g.ec?.chief) return [];
  return [0, 1].filter((s) => s !== side).map((s) => { const ch = (g.ec as any).chief[s], h = ch?.hist?.[0];
    return { owner: s, name: h?.name || ch?.name || "", type: ch?.type || "", alive: !h?.died, killedBy: h?.died ? (h.by ?? null) : null, turn: h?.died ?? null }; });
}
/** победитель по целям (-1 — пока нет) */
export function goalWinner(g: GameState, cfg: StratCfg): -1 | 0 | 1 {
  if (!g.ec) return -1; const need = goalCfg(g, cfg).need, a = g.ec.goals[0].length, b = g.ec.goals[1].length;
  if (a >= need && b >= need) return a !== b ? (a > b ? 0 : 1) : g.ec.res[0].glory >= g.ec.res[1].glory ? 0 : 1;
  return a >= need ? 0 : b >= need ? 1 : -1;
}
/** очки Твердыни: свои города (+Стена), взятая столица соперника, свои фигуры на Обелиске/Башне/Месте чуда */
export function holdScore(g: GameState, side: number, cfg: StratCfg): number {
  const H = (cfg as any).goals.hold; let s = 0;
  for (const c of g.ec.cities) if (c.owner === side) { s += H.city + (c.bld.includes("wall") ? H.walled : 0) + ((c as any).oc !== undefined && (c as any).oc !== side ? H.enemyCap : 0); }
  for (const p of g.pieces) if (p.owner === side && H.points.includes(mapStr(g.map, p.x, p.y))) s += H.point;
  return s;
}
export function passableCells(g: GameState): number { let n = 0; for (let i = 0; i < g.size * g.size; i++) { const t = g.map ? g.map.t[i] : "."; if (t !== "#" && t !== "m" && t !== "w") n++; } return Math.max(1, n); }
/** прогресс целей (для панели и бота): 0…1 */
export function goalProgress(g: GameState, side: number, cfg: StratCfg, T?: Int8Array): Record<string, number> {
  const G = goalCfg(g, cfg), ec = g.ec, out: Record<string, number> = {};
  const has = (id: string) => ec.goals[side].includes(id);
  out.chief = has("chief") ? 1 : 0;
  out.hold = has("hold") ? 1 : Math.min(0.99, (Math.min(1, holdScore(g, side, cfg) / G.holdK) * 0.6 + 0.4 * ec.hold[side] / G.holdTurns));
  out.treasury = has("treasury") ? 1 : G.gold ? Math.min(0.99, ec.earned[side] / G.gold) : 0;
  if (G.share) { const TT = T || territory(g, cfg); let c = 0; for (let i = 0; i < TT.length; i++) if (TT[i] === side) c++; out.domain = has("domain") ? 1 : Math.min(0.99, c / passableCells(g) / G.share); } else out.domain = 0;
  if (G.list.includes("wonder") && !has("wonder")) {
    const E = wonderEra(g, cfg), era = ec.era[side];
    const cap = G.wonderCap === false || ec.techs[side].some((id) => { const t = techOf(cfg, id); return t && t.era === E && t.br !== "elem"; });
    out.wonder = Math.min(0.95, 0.45 * Math.min(1, (era - 1) / Math.max(1, E - 1)) + (cap ? 0.3 + 0.1 * Math.min(1, ec.res[side].know / Math.max(1, G.wonderKnow)) + 0.1 * Math.min(1, ec.res[side].gold / Math.max(1, G.wonderGold)) : 0)); // знания копятся под Чудо только после «вершины»
  } else out.wonder = has("wonder") ? 1 : 0;
  return out;
}
export const cityRadius = (g: GameState, c: City, cfg: StratCfg) => (c.cap ? cfg.econ.city.capRadius[Math.min(c.lvl, cfg.econ.city.capRadius.length - 1)] + capRBonus(g, c, cfg) : cfg.econ.city.outRadius + tfx(g, c.owner, "outR", cfg));
export const citySlots = (g: GameState, c: City, cfg: StratCfg) => c.set ? 0 : (c.cap ? sz(g, cfg).capSlots[Math.min(c.lvl, 2)] : g.size === 5 ? 1 : cfg.econ.city.outSlots);

/** Территория: -1 нейтраль, 0/1 — чья. t1170: города не нарастают друг на друга — кто взял клетку раньше, того и клетка:
 *  1) приросшие клетки (`grow`; брались только нейтральными) — за хозяином, чужой радиус их не забирает;
 *  2) ядро города (радиус ≤1) — ближайшему (Чебышёв), равенство разных хозяев — нейтраль;
 *  3) расширение радиуса столицы (уровень, технологии) — только в ещё ничьи клетки, так же по близости;
 *  4) отбитые клетки (`ec.lost`) — нейтральны (кроме клетки города), их можно снова занять. */
export function territory(g: GameState, cfg: StratCfg): Int8Array {
  const n = g.size, T = new Int8Array(n * n).fill(-1);
  if (!g.ec) return T;
  for (const c of g.ec.cities) if (c.grow) for (const i of c.grow) if (T[i] === -1) T[i] = c.owner;
  const noRing = cellGrowth(g, cfg); // t1194: рост радиуса (уровень, технологии) не даёт кольцо — только по 1 клетке (radGrant)
  for (const core of [true, false]) {
    const D = new Int16Array(n * n).fill(999), R = new Int8Array(n * n).fill(-1);
    for (const c of g.ec.cities) {
      const r = cityRadius(g, c, cfg), lo = core ? 0 : Math.min(r, 1) + 1, hi = core ? Math.min(r, 1) : noRing ? 0 : r; if (hi < lo) continue;
      for (let y = Math.max(0, c.y - hi); y <= Math.min(n - 1, c.y + hi); y++) for (let x = Math.max(0, c.x - hi); x <= Math.min(n - 1, c.x + hi); x++) {
        const i = y * n + x, d = cheb(c, { x, y }); if (d < lo || T[i] !== -1) continue;
        if (d < D[i]) { D[i] = d; R[i] = c.owner; } else if (d === D[i] && R[i] !== c.owner) R[i] = -2; // спор
      }
    }
    for (let i = 0; i < T.length; i++) if (T[i] === -1 && R[i] >= 0) T[i] = R[i];
  }
  if (g.ec.lost) for (const k in g.ec.lost) { const i = +k; if (!g.ec.cities.some((c) => c.y * n + c.x === i)) T[i] = -1; } // t1140: захваченные клетки нейтральны
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
export function effAtk(g: GameState, p: Piece, t: Piece | null, cfg: StratCfg, T?: Int8Array): number {
  const R = rAdj(g, p, cfg), ra = (R.atk || 0) + (p.kind === "rook" ? R.rookAtk || 0 : 0);
  if (!g.ec) return p.atk + ra;
  const s = p.owner; let a = p.atk + ra + forgeBonus(g, s, p.kind) + tfx(g, s, "atk", cfg) + tfxK(g, s, "atkK", p.kind, cfg);
  const et = tfx(g, s, "atkEnemyT", cfg); if (et) { const TT = T || territory(g, cfg); if (TT[p.y * g.size + p.x] === other(s)) a += et; }
  a += chiefAura(g, p, "auraAtk", cfg);
  if (t) {
    if (p.kind === "king" && (t.kind === "king" || t.kind === "hero")) a += chiefFx(g, p, "slayer", cfg);
    if (t.mv) a += tfx(g, s, "ambush", cfg);
    if (t.burn > 0) a += tfx(g, s, "fury", cfg);
    if (t.chill > 0 || t.cm) a += tfx(g, s, "rime", cfg);
  }
  return a;
}
/** t1156: разбор АТК/БРН по источникам для подсказок событий (сумма частей = effAtk / effArm до max 0).
 *  src: base | race | tech | chief | bld | buff | terr; side — чей источник (для скрытия чужих технологий/талантов). */
export type Part = { k: string; n: number; src: "base" | "race" | "tech" | "chief" | "bld" | "buff" | "terr"; side: number };
export function explainAtk(g: GameState, p: Piece, t: Piece | null, cfg: StratCfg, T?: Int8Array): Part[] {
  const s = p.owner, R = rAdj(g, p, cfg), P: Part[] = [], add = (k: string, n: number, src: Part["src"]) => { if (n) P.push({ k, n, src, side: s }); };
  add("base", p.atk, "base"); add("race", (R.atk || 0) + (p.kind === "rook" ? R.rookAtk || 0 : 0), "race");
  if (!g.ec) return P;
  add("forge", forgeBonus(g, s, p.kind), "bld"); add("atk", tfx(g, s, "atk", cfg), "tech"); add("atkK", tfxK(g, s, "atkK", p.kind, cfg), "tech");
  const et = tfx(g, s, "atkEnemyT", cfg); if (et) { const TT = T || territory(g, cfg); if (TT[p.y * g.size + p.x] === other(s)) add("atkEnemyT", et, "tech"); }
  add("auraAtk", chiefAura(g, p, "auraAtk", cfg), "chief");
  if (t) {
    if (p.kind === "king" && (t.kind === "king" || t.kind === "hero")) add("slayer", chiefFx(g, p, "slayer", cfg), "chief");
    if (t.mv) add("ambush", tfx(g, s, "ambush", cfg), "tech");
    if (t.burn > 0) add("fury", tfx(g, s, "fury", cfg), "tech");
    if (t.chill > 0 || t.cm) add("rime", tfx(g, s, "rime", cfg), "tech");
  }
  return P;
}
export function explainArm(g: GameState, p: Piece, cfg: StratCfg, T?: Int8Array): Part[] {
  const s = p.owner, R = rAdj(g, p, cfg), P: Part[] = [], add = (k: string, n: number, src: Part["src"]) => { if (n) P.push({ k, n, src, side: s }); };
  add("base", p.arm, "base"); add("race", R.arm || 0, "race");
  if (!g.ec) return P;
  add("guard", (p as any).grd || 0, "buff"); add("arm", tfx(g, s, "arm", cfg), "tech"); add("armK", tfxK(g, s, "armK", p.kind, cfg), "tech");
  add("auraArm", chiefAura(g, p, "auraArm", cfg), "chief");
  if (p.kind === "king" && founding(g, p)) add("founding", -((cfg.econ as any).found?.armPen || 0), "buff");
  if (g.ec.towers?.some((t) => t.owner === s && cheb(t, p) <= 1)) add("watchtower", (cfg.econ as any).tower?.arm || 0, "bld");
  const fo = tfx(g, s, "formation", cfg);
  if (fo && p.kind === "pawn" && g.pieces.some((q) => q !== p && q.owner === s && q.kind === "pawn" && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1)) add("formation", fo, "tech");
  const k2 = tfx(g, s, "armKing2", cfg);
  if (k2 && p.kind !== "king") { const k = g.pieces.find((q) => q.owner === s && q.kind === "king"); if (k && cheb(k, p) <= 2) add("armKing2", k2, "tech"); }
  const own = tfx(g, s, "armOwnT", cfg), out = R.armOutside || 0;
  if (own || out) { const TT = T || territory(g, cfg); const mine = TT[p.y * g.size + p.x] === s; if (mine) add("armOwnT", own, "tech"); else add("armOutside", out, "race"); }
  for (const c of g.ec.cities) if (c.owner === s && c.bld.includes("wall") && cheb(c, p) <= bp(g, s, "wall", "r", cfg)) { add("wall", bp(g, s, "wall", "arm", cfg) + (c.bld.includes("quarry") ? cfg.econ.fx.quarryWallArm : 0), "bld"); break; }
  return P;
}
export function effArm(g: GameState, p: Piece, cfg: StratCfg, T?: Int8Array): number {
  const R = rAdj(g, p, cfg), ra = R.arm || 0;
  if (!g.ec) return p.arm + ra;
  const s = p.owner; let a = p.arm + ra + ((p as any).grd || 0) + tfx(g, s, "arm", cfg) + tfxK(g, s, "armK", p.kind, cfg);
  a += chiefAura(g, p, "auraArm", cfg);
  if (p.kind === "king" && founding(g, p)) a -= (cfg.econ as any).found?.armPen || 0; // t1140: закладывающий поселение Вождь уязвим
  if (g.ec.towers?.some((t) => t.owner === s && cheb(t, p) <= 1)) a += (cfg.econ as any).tower?.arm || 0; // Сторожевая башня рядом
  const fo = tfx(g, s, "formation", cfg);
  if (fo && p.kind === "pawn" && g.pieces.some((q) => q !== p && q.owner === s && q.kind === "pawn" && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1)) a += fo;
  const k2 = tfx(g, s, "armKing2", cfg);
  if (k2 && p.kind !== "king") { const k = g.pieces.find((q) => q.owner === s && q.kind === "king"); if (k && cheb(k, p) <= 2) a += k2; }
  const own = tfx(g, s, "armOwnT", cfg), out = R.armOutside || 0;
  if (own || out) { const TT = T || territory(g, cfg); const mine = TT[p.y * g.size + p.x] === s; if (mine) a += own; else a += out; }
  for (const c of g.ec.cities) if (c.owner === s && c.bld.includes("wall") && cheb(c, p) <= bp(g, s, "wall", "r", cfg)) { a += bp(g, s, "wall", "arm", cfg) + (c.bld.includes("quarry") ? cfg.econ.fx.quarryWallArm : 0); break; }
  return Math.max(0, a);
}
/** аура Вождя своим фигурам рядом (не себе) */
function chiefAura(g: GameState, p: Piece, key: string, cfg: StratCfg): number {
  if (p.kind === "king") return 0;
  const k = g.pieces.find((q) => q.owner === p.owner && q.kind === "king"); if (!k?.tal?.length) return 0;
  const v = chiefFx(g, k, key, cfg); if (!v) return 0;
  return cheb(k, p) <= Math.max(1, chiefFx(g, k, "r", cfg) ? Math.max(...k.tal.map((id) => { const n = chiefNode(cfg, g, k.owner, id); return (n?.fx as any)?.[key] ? n!.fx.r || 1 : 0; })) : 1) ? v : 0;
}
export function mageShot(g: GameState, p: Piece, cfg: StratCfg): number {
  let r = Math.max(cfg.range.mageShot, tfx(g, p.owner, "shot", cfg));
  return r + talBonus(p, "shot", cfg);
}
export function apFor(g: GameState, side: number, cfg: StratCfg): number {
  const L = lg(g, cfg); let ap = L ? L.apBase : cfg.sizes[g.size].ap;
  if (!g.ec) return ap;
  if (L) { // ОД-технологии и «Военный совет» — по правилам лиги
    for (const id of g.ec.techs[side]) if ((techFx(cfg, id, g.races[side]) as any)?.ap > 0) ap += L.apTech;
    let wc = 0; for (const c of g.ec.cities) if (c.owner === side) wc += c.bld.filter((b) => (cfg.build as any)[b]?.once && b === "warcouncil").length;
    ap += Math.min(wc, L.onceMax) * L.apBld; ap = Math.min(ap, L.apMax);
    ap += raceAp(g, side, cfg).n;
  } else ap += tfx(g, side, "ap", cfg);
  let king = false;
  for (const p of g.pieces) if (p.owner === side) { ap += p.kind === "king" ? chiefFx(g, p, "ap", cfg) : talBonus(p, "ap", cfg); if (p.kind === "king") king = true; }
  if (!king && g.ec.chief) ap -= (cfg as any).chief.noChiefAp;
  return Math.max(1, ap);
}
export function burnTurns(g: GameState, burner: number, cfg: StratCfg) { return cfg.race.fire.burnTurns + tfx(g, burner, "burnT", cfg); }
export function burnDmg(g: GameState, victim: number, cfg: StratCfg) { return cfg.race.fire.burnDmg + tfx(g, other(victim), "burnD", cfg); }
export function chillTurns(g: GameState, chiller: number, cfg: StratCfg) { return ((cfg.race as any).ice.chillTurns ?? 1) + tfx(g, chiller, "chillT", cfg); }

// ---------- опыт, Слава
export function pieceLevel(p: Piece, cfg: StratCfg) {
  const x = p.xp || 0;
  if (p.kind === "king") { const L: number[] = (cfg as any).chief.lv; let l = 1; for (let i = 1; i < L.length; i++) if (x >= L[i]) l = i + 1; return l; }
  const L: number[] = cfg.econ.xp.lv; let l = 1; for (let i = 2; i < L.length; i++) if (x >= L[i]) l = i; return l;
}
/** варианты выбора фигуры на уровне lv: 2 — пассивки (TALENTS), 3 — активные умения (UNIT_TREE); 4–5 — без выбора */
export function unitChoices(p: Piece, lv: number, cfg: StratCfg): { id: string; name: string; eff: string }[] {
  if (lv === 2) return (cfg.talents[p.kind] || [])[0] || [];
  if (lv === 3) return (cfg as any).unitTree?.[p.kind]?.act || [];
  return [];
}
/** активное умение фигуры (ур. 3) с усилением ур. 4 */
export function unitAct(p: Piece, cfg: StratCfg): any | null {
  const T = (cfg as any).unitTree?.[p.kind]; if (!T || p.kind === "king") return null;
  const a = T.act.find((x: any) => p.tal?.includes(x.id)); if (!a) return null;
  return pieceLevel(p, cfg) >= 4 ? { ...a, mag: Math.ceil(a.mag * T.up.pow), cd: Math.max(1, a.cd - T.up.cd), up: 1 } : a;
}
/** опыт + рост Вождя по уровням */
export function gainXp(g: GameState, p: Piece, n: number, ev: Ev[], cfg: StratCfg) {
  if (n <= 0) return; { const m = lg(g, cfg)?.xp ?? 1; if (m !== 1) { const acc = ((p as any).xpf || 0) + n * m; n = Math.floor(acc); (p as any).xpf = acc - n; if (n <= 0) return; } } // t1141: опыт по лиге
  const before = pieceLevel(p, cfg); p.xp = (p.xp || 0) + n; const after = pieceLevel(p, cfg);
  if (after <= before) return;
  if (p.kind === "king") { const Gr = (cfg as any).chief.grow, d = (k: string) => (Gr[k][after - 1] || 0) - (Gr[k][before - 1] || 0);
    p.maxHp += d("hp"); p.hp += d("hp"); p.atk += d("atk"); p.arm += d("arm"); }
  else { const Gr = (cfg.econ.xp as any).grow; if (Gr) { const d = (k: string) => (Gr[k]?.[after] || 0) - (Gr[k]?.[before] || 0); p.maxHp += d("hp"); p.hp += d("hp"); p.atk += d("atk"); } }
  ev.push({ e: "lvl", id: p.id, lvl: after });
}
/** активное умение фигуры: ОД тратится, фигура НЕ считается походившей (может ударить после «Выпада»); volley — по клетке x,y.
 *  check=true — только проверка (возвращает ошибку или null); иначе применяет и возвращает null/ошибку. */
export function unitAbility(g: GameState, side: number, p: Piece, act: { ab: string; x?: number; y?: number }, ev: Ev[], cfg: StratCfg, check = false): string | null {
  const a = unitAct(p, cfg); if (!a || a.id !== act.ab) return "no_ability";
  if ((p.cds?.[a.id] || 0) > 0) return "cooldown"; if (g.ap < a.ap) return "no_ap"; if (p.acted) return "already_acted";
  let t: Piece | undefined;
  if (a.type === "volley") { t = g.pieces.find((q) => q.x === act.x && q.y === act.y && q.owner !== side); if (!t || cheb(t, p) > (a.r || 3)) return "bad_target"; }
  if (a.type === "mend" && p.hp >= p.maxHp) return "nothing_to_heal";
  if (check) return null;
  if (a.type === "strike") (p as any).pow = a.mag;
  else if (a.type === "guard") { (p as any).grd = a.mag; (p as any).grdt = a.dur || 2; }
  else if (a.type === "mend") { const h = Math.min(a.mag, p.maxHp - p.hp); p.hp += h; ev.push({ e: "heal", id: p.id, hp: p.hp, n: h }); }
  else if (a.type === "volley" && t) { t.hp -= a.mag; ev.push({ e: "hit", id: p.id, t: t.id, dmg: a.mag, hp: Math.max(0, t.hp), why: { via: "volley", ab: a.id, atk: [{ k: "volley", n: a.mag, src: "base", side }], arm: [], cover: 0, mul: 1, el: [g.races[side], g.races[t.owner]], pow: 0, dmg: a.mag, min1: false, shield: 0, on: [] } } as any); onHit(g, p, t, t.hp <= 0, ev, cfg); if (t.hp <= 0) (g as any)._killQ = [...((g as any)._killQ || []), [t.id, p.id]]; } // t1163: залп — фиксированный урон, броня/укрытие/щит не действуют
  p.cds = { ...(p.cds || {}), [a.id]: a.cd }; g.ap -= a.ap;
  ev.push({ e: "ability", id: p.id, ab: a.id }); return null;
}
/** уровень, на котором ждёт выбор таланта (0 — нет) */
export function pendingTalent(p: Piece, cfg: StratCfg, g?: GameState) {
  const lv = pieceLevel(p, cfg), n = p.tal?.length || 0;
  if (p.kind === "king") return g && n + 2 <= lv && chiefChoices(g, p, cfg).length ? n + 2 : 0;
  return n + 2 <= lv && n + 2 <= 3 && unitChoices(p, n + 2, cfg).length ? n + 2 : 0;
}
export function onHit(g: GameState, a: Piece, t: Piece, killed: boolean, ev: Ev[], cfg: StratCfg) {
  if (!g.ec) return;
  g.ec.quiet = 0;
  const CX = (cfg as any).chief.xp;
  gainXp(g, a, a.kind === "king" ? (killed ? (t.kind === "king" ? CX.chiefKill : CX.kill) : CX.hit) : killed ? cfg.econ.xp.kill : cfg.econ.xp.hit, ev, cfg);
  if (killed) {
    g.ec.kills[a.owner]++;
    const gl = cfg.econ.glory.kill + tfx(g, a.owner, "killGlory", cfg);
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
export function startTurn(g: GameState, side: 0 | 1, ev: Ev[], cfg: StratCfg, mk?: MkPiece): -1 | 0 | 1 {
  if (!g.ec) return -1;
  let capWin: -1 | 0 | 1 = -1; const inc0: Res = { gold: 0, know: 0, glory: 0 };
  const E = cfg.econ, ec = g.ec, F = E.fx;
  for (const p of g.pieces) if (p.owner === side) { p.mv = false; if (p.cds) for (const k in p.cds) if (p.cds[k] > 0) p.cds[k]--; }
  ec.rs[side] = 0; ec.trades[side] = 0;
  // осада: враг простоял на клетке города до начала своего следующего хода
  for (const c of [...ec.cities]) {
    const o = pieceAt(g, c.x, c.y);
    if (!o || o.owner === c.owner) { c.sg = 0; continue; }
    if (o.owner !== side) continue;
    c.sg++;
    if (c.sg >= E.city.siegeTurns + tfx(g, c.owner, "siege", cfg)) {
      const lost = c.owner, wasCap = c.cap;
      if (c.cap) { (c as any).oc = lost; c.cap = false; c.lvl = Math.min(c.lvl, 1); const nc = ec.cities.find((x) => x.owner === lost && x !== c); if (nc) { nc.cap = true; nc.name = "Столица"; } }
      c.owner = o.owner; c.sg = 0; c.acted = true; c.forge = []; ev.push({ e: "capture", city: c.id, by: o.owner, cap: wasCap });
      addGlory(g, o.owner, E.glory.capture, "capture", ev);
      // своя бывшая столица отбита — снова столица (если другой нет)
      if ((c as any).oc === c.owner && !ec.cities.some((x) => x.owner === c.owner && x.cap)) { c.cap = true; delete (c as any).oc; }
    }
  }
  // у стороны есть города, но нет столицы (взяли единственную, потом заложила/отбила) — старший город становится столицей
  for (const s2 of [0, 1]) if (!ec.cities.some((x) => x.owner === s2 && x.cap)) {
    const nc = ec.cities.filter((x) => x.owner === s2 && ((x as any).oc === undefined || (x as any).oc === s2)).sort((a, b) => b.lvl - a.lvl)[0];
    if (nc) { nc.cap = true; delete (nc as any).oc; } // взятые чужие столицы (oc = прежний хозяин) остаются трофеями «Твердыни»
  }
  // Вождь: возрождение / опыт за выживание и удержание
  const king = g.pieces.find((p) => p.owner === side && p.kind === "king"), CH = (cfg as any).chief, chs = ec.chief[side];
  if (!king && mk) respawnChief(g, side, ev, cfg, mk);
  else if (king) {
    chs.surv++; if (chs.surv % CH.xp.surviveEvery === 0) gainXp(g, king, CH.xp.survive, ev, cfg);
    const st = mapStr(g.map, king.x, king.y); if (ec.cities.some((c) => c.x === king.x && c.y === king.y) || (st !== "." && st)) gainXp(g, king, CH.xp.hold, ev, cfg);
    inc0.glory += chiefFx(g, king, "glory", cfg);
  }
  terrTick(g, side, ev, cfg, mk);
  const T = territory(g, cfg), inc: Res = inc0; let growthAdd = 0;
  const mine = ec.cities.filter((c) => c.owner === side);
  for (const c of mine) {
    c.acted = false;
    if (!c.set) { inc.gold += c.cap ? E.city.capGold : E.city.outGold; inc.know += c.cap ? E.city.capKnow : E.city.outKnow; }
    for (const b of c.bld) { inc.gold += bp(g, side, b, "gold", cfg); inc.know += bp(g, side, b, "know", cfg); if (b === "wonder") inc.glory += (cfg as any).goals.wonderGlory; }
    inc.know += tfx(g, side, "knowCity", cfg); inc.gold += tfx(g, side, "goldCity", cfg);
  }
  let cells = 0, water = 0, forest = 0; const goldMV = tfx(g, side, "goldMV", cfg), hasQuarry = mine.some((c) => c.bld.includes("quarry")), RC = raceOf(g, side, cfg);
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
    if (T[y * g.size + x] !== side) continue; cells++;
    const tc = g.map ? g.map.t[y * g.size + x] : "."; if (tc === "w") water++; else if (tc === "f") forest++;
    const s = mapStr(g.map, x, y), S = E.struct[s]; if (!S) continue;
    const o = pieceAt(g, x, y); if (o && o.owner !== side) continue; // набег: вражеская фигура на клетке
    inc.gold += (S.gold || 0) + (s === "M" || s === "V" ? goldMV : 0) + (s === "Q" && hasQuarry ? F.quarryGold : 0);
    inc.know += S.know || 0; inc.glory += S.glory || 0; growthAdd += S.growth || 0;
  }
  inc.gold += tfx(g, side, "goldTurn", cfg);
  if (mine.some((c) => c.bld.includes("harbor"))) inc.gold += Math.min(F.harborMax, water);
  if (RC.forestKnow) inc.know += Math.min(RC.forestKnowMax ?? 3, forest * RC.forestKnow);
  inc.glory += Math.floor(cells * (1 + tfx(g, side, "terrGlory", cfg) / 2) / Math.max(1, E.glory.perTerr)); // terrGlory 2 → вдвое быстрее
  for (const p of g.pieces) if (p.owner === side && mapStr(g.map, p.x, p.y) === "X") inc.glory += E.obelisk.glory;
  if (g.races[side] === "ice") { const R = cfg.race as any; const fl = Math.min(inc.know, R.ice.knowFloor ?? 0); inc.know = Math.max(fl, inc.know - (R.ice.knowPen ?? 1)); } // Лёд: −1 знание (не ниже knowFloor)
  const r = ec.res[side];
  if (mine.some((c) => c.bld.includes("glacier")) && g.turn % E.glacier.every === 0) inc.gold += Math.min(E.glacier.max, Math.floor((r.gold + inc.gold) * E.glacier.share));
  r.gold += inc.gold; r.know = Math.max(0, r.know + inc.know); r.glory += inc.glory;
  // цели: Казна, Держава, Твердыня
  const GC = goalCfg(g, cfg);
  ec.earned[side] += Math.max(0, inc.gold);
  if (GC.gold && ec.earned[side] >= GC.gold) setGoal(g, side, "treasury", ev, cfg);
  if (GC.share && cells / passableCells(g) >= GC.share) setGoal(g, side, "domain", ev, cfg);
  if (holdScore(g, side, cfg) >= GC.holdK) { ec.hold[side]++; if (ec.hold[side] >= GC.holdTurns) setGoal(g, side, "hold", ev, cfg); } else ec.hold[side] = 0;
  ec.inc[side] = inc;
  ev.push({ e: "inc", side, gold: inc.gold, know: inc.know, glory: inc.glory });
  // рост столицы
  for (const c of mine) if (c.cap) {
    c.growth += Math.round((E.city.growthBase + growthAdd + mine.reduce((n, x) => n + x.bld.reduce((m, b) => m + bp(g, side, b, "growth", cfg), 0), 0) + tfx(g, side, "growth", cfg) * mine.length) * (RC.growthMul || 1));
    while (c.lvl < E.city.growthThr.length && c.growth >= E.city.growthThr[c.lvl]) { c.lvl++; ev.push({ e: "grow", city: c.id, lvl: c.lvl }); }
  }
  return capWin;
}

// ---------- действия этапа 2
const ok = (ev: Ev[]) => ({ ok: true as const, ev });
const no = (err: string) => ({ ok: false as const, err });
/** t1137: город, на земле которого стоит клетка (x, y) стороны side: клетка своей территории, ближайший свой город в радиусе. */
export function buildCityAt(g: GameState, side: number, x: number, y: number, cfg: StratCfg): City | null {
  if (!g.ec || territory(g, cfg)[y * g.size + x] !== side) return null;
  let best: City | null = null, bd = 1e9;
  // t1140: любая клетка своей земли (в т. ч. приросшая); постройка уходит ближайшему своему городу-не-поселению
  for (const c of g.ec.cities) if (c.owner === side && !c.set) { const d = cheb(c, { x, y }) * 2 + (c.cap ? 0 : 1); if (d < bd) { bd = d; best = c; } }
  return best;
}
/** t1137: может ли Вождь стороны сейчас строить: { chief, city } или null */
export function chiefBuildSite(g: GameState, side: number, cfg: StratCfg): { k: Piece; c: City } | null {
  const k = g.pieces.find((q) => q.owner === side && q.kind === "king"); if (!k || k.acted || g.ap < 1) return null;
  const c = buildCityAt(g, side, k.x, k.y, cfg); return c ? { k, c } : null;
}
/** t1139/t1140: ходов между правами на клетку у города: интервал лиги + скрытая поправка расы − постройки − технологии, в [growMin, growMax] лиги.
 *  0 — рост выключен (5×5, поселения). */
export function growEvery(g: GameState, c: City, cfg: StratCfg): number {
  const G = (cfg.econ as any).terr?.grow; if (!G?.on || c.set || G.sizeOff?.includes(g.size)) return 0;
  const L = lg(g, cfg); let n = (L ? L.grow : 10) + (G.race[g.races[c.owner]] || 0);
  for (const b of c.bld) n -= G.bld[b] || 0;
  for (const id of g.ec.techs[c.owner]) n -= G.tech[id] || 0;
  n -= tfx(g, c.owner, "terrGrow", cfg);
  return L ? Math.min(L.growMax, Math.max(L.growMin, n)) : Math.max(G.min || 2, n);
}
/** t1140: цена «Расширить» (режим claim) */
export const claimCost = (g: GameState, c: City, cfg: StratCfg) => { const G = (cfg.econ as any).terr.grow; return G.mode === "auto" ? 0 : (G.gold || 0) + (G.perCell || 0) * (c.grow?.length || 0); };
/** t1140: клетки, которые можно купить: нейтральные, проходимые для расы, рядом (8 соседей) с любой своей землёй */
export function claimCells(g: GameState, c: City, cfg: StratCfg, T = territory(g, cfg)): number[] {
  const n = g.size, race = g.races[c.owner], out: number[] = []; // t1140: любая клетка, соседняя со своей землёй (reach не ограничивает)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x; if (T[i] !== -1 || !passable(g.map, x, y, race)) continue;
    let adj = false; for (let dy = -1; dy <= 1 && !adj; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && yy >= 0 && xx < n && yy < n && T[yy * n + xx] === c.owner) { adj = true; break; } }
    if (adj) out.push(i);
  }
  return out;
}
/** t1139: клетка по правилу (авторост и боты): структура карты (доход) → рядом со структурами → ближе к городу → меньший индекс */
export function growPick(g: GameState, c: City, cfg: StratCfg, T = territory(g, cfg)): number {
  let best = -1, bs = -1e9; const n = g.size;
  for (const i of claimCells(g, c, cfg, T)) { const x = i % n, y = (i / n) | 0; let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < n && yy < n && cfg.econ.struct[mapStr(g.map, xx, yy)]) near++; }
    const sc = (cfg.econ.struct[mapStr(g.map, x, y)] ? 100 : 0) + near * 10 - cheb(c, { x, y }) * 2; if (sc > bs) { bs = sc; best = i; } }
  return best;
}
/** t1194: земля растёт только по клетке — радиус сверх ядра (1) не рисует кольцо, а превращается в клетки (по одной за ход) */
export const cellGrowth = (g: GameState, cfg: StratCfg) => { const G = (cfg.econ as any).terr?.grow; return !!G?.on && !G.sizeOff?.includes(g.size); };
/** t1194: детерминированная «случайная» соседняя ничья клетка (повтор apply() даёт ту же): хеш карты, хода, города, числа приростов */
export function growRand(g: GameState, c: City, cfg: StratCfg, T = territory(g, cfg)): number {
  const L = claimCells(g, c, cfg, T); if (!L.length) return -1;
  let h = 2166136261; const k = `${g.map?.id ?? ""}|${g.turn}|${c.id}|${c.grow?.length || 0}|${c.rg || 0}`;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return L[(h >>> 0) % L.length];
}
function joinCell(g: GameState, c: City, i: number, ev: Ev[]) { (c.grow ||= []).push(i); if (g.ec.lost) delete g.ec.lost[i]; ev.push({ e: "tgrow", city: c.id, x: i % g.size, y: (i / g.size) | 0, owner: c.owner }); }
/** t1140: ходов до потери клетки под вражеской фигурой */
export const captureTurns = (g: GameState, cfg: StratCfg) => lg(g, cfg)?.capture ?? (cfg.econ as any).terr?.capture?.turns ?? 4;
export const foundTurns = (g: GameState, cfg: StratCfg) => lg(g, cfg)?.found ?? (cfg.econ as any).found?.turns ?? 10;
/** t1139/t1140: в начале хода стороны — права на клетки, захват (клетка → нейтральная), канал поселения Вождя */
function terrTick(g: GameState, side: 0 | 1, ev: Ev[], cfg: StratCfg, mk?: MkPiece) {
  const TC = (cfg.econ as any).terr; if (!g.ec) return; const ec = g.ec, n = g.size;
  if (cellGrowth(g, cfg)) for (const c of ec.cities) if (c.owner === side && !c.set) { // t1194: +радиус (уровень/технология) → 1 случайная соседняя клетка за ход
    const due = Math.max(0, cityRadius(g, c, cfg) - 1) - (c.rg || 0); if (due <= 0) continue;
    const i = growRand(g, c, cfg); if (i < 0) continue; c.rg = (c.rg || 0) + 1; joinCell(g, c, i, ev); Object.assign(ev[ev.length - 1] as any, { auto: true, rad: true });
  }
  if (TC?.grow?.on) for (const c of ec.cities) if (c.owner === side) {
    const N = growEvery(g, c, cfg); if (!N) continue;
    if ((c.claims || 0) > 0) { // t1140 (итог): право ждёт покупки autoAfter своих ходов, затем клетка присоединяется бесплатно (growPick)
      c.cw = (c.cw ?? TC.grow.autoAfter ?? 4) - 1;
      if (c.cw <= 0) { const i = growRand(g, c, cfg); if (i < 0) { c.cw = 1; continue; } c.claims = 0; delete c.cw; joinCell(g, c, i, ev); (ev[ev.length - 1] as any).auto = true; } // t1170: нет свободной соседней клетки — право ждёт
      else ev.push({ e: "tready", city: c.id, owner: side, gold: claimCost(g, c, cfg), left: c.cw });
      continue;
    }
    c.tg = (c.tg || 0) + 1; if (c.tg < N) continue;
    if (TC.grow.mode === "auto") { const i = growPick(g, c, cfg); if (i < 0) continue; c.tg = 0; joinCell(g, c, i, ev); }
    else { c.tg = 0; c.claims = 1; c.cw = TC.grow.autoAfter ?? 4; ev.push({ e: "tready", city: c.id, owner: side, gold: claimCost(g, c, cfg), left: c.cw }); } // клиент: «Можно купить клетку»
  }
  if (TC?.capture?.on) {
    const T = territory(g, cfg), ct = (ec.ct ||= {}), seen = new Set<number>(), need = captureTurns(g, cfg);
    for (const p of g.pieces) if (p.owner === side) {
      const i = p.y * n + p.x; if (T[i] !== (1 - side) || ec.cities.some((c) => c.x === p.x && c.y === p.y)) continue;
      seen.add(i); const cur = ct[i]?.o === side ? ct[i].n + 1 : 1; ct[i] = { o: side, n: cur };
      if (cur >= need) { (ec.lost ||= {})[i] = 1; delete ct[i]; for (const c of ec.cities) if (c.grow) c.grow = c.grow.filter((q) => q !== i);
        ev.push({ e: "tcap", x: p.x, y: p.y, by: side, owner: 1 - side, id: p.id }); } // клиент: хозяину «Территория потеряна», захватчику «Отбито»
    }
    for (const k in ct) if (ct[k].o === side && !seen.has(+k)) delete ct[k];
  }
  const f = ec.fnd?.[side]; if (f) {
    const k = g.pieces.find((q) => q.id === f.id && q.owner === side);
    if (!k || k.x !== f.x || k.y !== f.y) { ec.fnd![side] = null; ev.push({ e: "found_fail", side, x: f.x, y: f.y }); }
    else if (--f.left <= 0) {
      ec.fnd![side] = null; const c = mkCity(g, side, f.x, f.y, false); c.set = !!(cfg.econ as any).found?.bare; ec.cities.push(c);
      ev.push({ e: "found", city: c.id, x: c.x, y: c.y, set: c.set }); if (!c.set) addGlory(g, side, cfg.econ.glory.found, "found", ev);
    } else ev.push({ e: "founding", side, id: k.id, left: f.left });
  }
}
/** t1140: Вождь стороны закладывает поселение (канал) — стоит, не действует */
export const founding = (g: GameState, p: Piece) => !!g.ec?.fnd?.[p.owner] && g.ec.fnd![p.owner]!.id === p.id;
/** t1140: может ли Вождь поставить Сторожевую башню на (x, y): соседняя с ним свободная проходимая клетка не дальше outDist от своей земли */
export function canTower(g: GameState, side: number, k: Piece, x: number, y: number, cfg: StratCfg): string | null {
  const TW = (cfg.econ as any).tower; if (!TW?.on) return "no_tower";
  if (x < 0 || y < 0 || x >= g.size || y >= g.size || cheb(k, { x, y }) > 1) return "bad_cell";
  if (pieceAt(g, x, y) && !(k.x === x && k.y === y)) return "occupied";
  if (!passable(g.map, x, y, g.races[side]) || mapStr(g.map, x, y) !== "." && mapStr(g.map, x, y) !== "P") return "bad_cell";
  if (g.ec.cities.some((c) => c.x === x && c.y === y) || g.ec.towers?.some((t) => t.x === x && t.y === y)) return "occupied";
  if ((g.ec.towers || []).filter((t) => t.owner === side).length >= (TW.max ?? 3)) return "tower_max";
  const T = territory(g, cfg), n = g.size, R = TW.outDist ?? 2; let d = 99;
  for (let yy = Math.max(0, y - R); yy <= Math.min(n - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(n - 1, x + R); xx++) if (T[yy * n + xx] === side) d = Math.min(d, cheb({ x, y }, { x: xx, y: yy }));
  if (d > R) return "too_far"; if (T[y * n + x] === 1 - side) return "enemy_land";
  if (g.ec.res[side].gold < (TW.cost ?? 8)) return "no_gold";
  return null;
}
/** HP/БРН постройки по типу шаблона (BUILD_HP); расовая особая — тип special */
export function bldStat(cfg: StratCfg, b: BuildId | string): { hp: number; arm: number; counter?: number } {
  const H = (cfg as any).bldHp, t = (cfg as any).buildTpl?.[b]?.type || (b === "wonder" ? "wonder" : "special");
  return H?.type?.[t] || { hp: 10, arm: 0 };
}
export const bldMaxHp = (g: GameState, c: City, b: BuildId | string, cfg: StratCfg) => bldStat(cfg, b).hp;
export const bldHp = (g: GameState, c: City, b: BuildId, cfg: StratCfg) => c.bhp?.[b] ?? bldMaxHp(g, c, b, cfg);
/** цена ремонта до полного HP */
export function repairCost(g: GameState, c: City, b: BuildId, cfg: StratCfg): number {
  const miss = bldMaxHp(g, c, b, cfg) - bldHp(g, c, b, cfg); return miss <= 0 ? 0 : Math.ceil(miss / ((cfg as any).bldHp?.repairHpPerGold || 2));
}
/** стоимость постройки; в руинах — rebuild × цены (округление вверх) */
export function buildCostAt(g: GameState, side: number, c: City | undefined, b: BuildId, cfg: StratCfg): number {
  const v = buildCost(g, side, b, cfg); return c?.ruin?.includes(b) && b !== "wonder" ? Math.ceil(v * ((cfg as any).bldHp?.rebuild ?? 0.5)) : v;
}
export function buildCost(g: GameState, side: number, b: BuildId, cfg: StratCfg): number {
  if (b === "wonder") return goalCfg(g, cfg).wonderGold;
  let c = cfg.build[b].cost;
  if (b === "forge" && g.ec.cities.some((x) => x.owner === side && x.bld.includes("crucible"))) c = Math.ceil(c / 2);
  const d = Math.min(0.6, tfx(g, side, "bldDisc", cfg)); if (d > 0) c = Math.ceil(c * (1 - d));
  return c;
}
export function recruitCost(g: GameState, c: City, kind: Kind, cfg: StratCfg) {
  if (kind === "pawn" && c.bld.includes("barracks")) return bp(g, c.owner, "barracks", "pawnCost", cfg) || PAWN_BARRACKS_COST;
  return Math.max(1, cfg.units[kind].cost - (kind === "knight" ? tfx(g, c.owner, "knightDisc", cfg) : 0));
}
/** постройка закрыта деревом технологий? (в блице без технологий — всё открыто) */
export function buildLocked(g: GameState, side: number, b: BuildId, cfg: StratCfg): string[] | null {
  if (sz(g, cfg).eras <= 0) return null;
  const gate = buildGate(b, techList(cfg)); if (!gate.length) return null;
  return gate.some((id) => hasTech(g, side, id)) ? null : gate;
}
export function canBuild(g: GameState, side: number, c: City, b: BuildId, cfg: StratCfg, kind?: Kind): string | null {
  const B = cfg.build[b]; if (!B) return "bad_building";
  if (B.race && B.race !== g.races[side]) return "wrong_race";
  if (buildLocked(g, side, b, cfg)) return "need_tech";
  if ((B as any).field) return "field_only"; // Сторожевая башня ставится Вождём в поле (действие tower)
  if ((B as any).once) { const L = lg(g, cfg), n = g.ec.cities.filter((x) => x.owner === side).reduce((s, x) => s + x.bld.filter((y) => y === b).length, 0);
    if (n >= (L?.onceMax ?? 1)) return "once_max"; }
  if (c.set) return "settlement";
  if ((B as any).legend) { // t1139: легендарные — эпоха IV, столица, не больше legendMax на игрока
    if (g.ec.era[side] < 4) return "need_era"; if (!c.cap) return "capital_only";
    const n = g.ec.cities.filter((x) => x.owner === side).reduce((s, x) => s + x.bld.filter((y) => (cfg.build as any)[y]?.legend).length, 0);
    if (n >= ((cfg.econ as any).era4?.legendMax ?? 1)) return "legend_max";
  }
  if (b === "wonder") {
    if (!goalOn(g, "wonder", cfg)) return "no_wonder"; if (!c.cap) return "capital_only";
    if (g.ec.cities.some((x) => x.owner === side && x.bld.includes("wonder")) || g.ec.goals[side].includes("wonder")) return "already_built";
    const E = wonderEra(g, cfg); if (g.ec.era[side] < E) return "need_era";
    if (goalCfg(g, cfg).wonderCap !== false && !g.ec.techs[side].some((id) => { const t = techOf(cfg, id); return t && t.era === E && t.br !== "elem"; })) return "need_capstone";
    if (g.ec.res[side].know < goalCfg(g, cfg).wonderKnow) return "no_know";
  }
  if (b !== "wonder" && c.bld.filter((x) => x !== "wonder").length >= citySlots(g, c, cfg)) return "no_slot"; // Чудо не занимает слот
  if (b === "forge") {
    if (!kind || kind === "king" || !cfg.units[kind]) return "bad_kind";
    const n = g.ec.cities.filter((x) => x.owner === side).reduce((s, x) => s + x.forge.length, 0);
    if (n >= cfg.econ.forgeMax) return "forge_max";
  } else if (c.bld.includes(b)) return "already_built";
  if (g.ec.res[side].gold < buildCostAt(g, side, c, b, cfg)) return "no_gold";
  return null;
}
export function recruitCells(g: GameState, c: City, kind: Kind, cfg: StratCfg): [number, number][] {
  if ((cfg.econ as any).spawnOnCity) { // t1139: призыв — на клетку города; занята — ближайшие свободные клетки своей земли
    const race = g.races[c.owner];
    if (!pieceAt(g, c.x, c.y) && passable(g.map, c.x, c.y, race)) return [[c.x, c.y]];
    const T = territory(g, cfg), n = g.size; let bd = 1e9; let out: [number, number][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (T[y * n + x] !== c.owner || pieceAt(g, x, y) || !passable(g.map, x, y, race)) continue;
      const d = cheb(c, { x, y }); if (d > bd) continue; if (d < bd) { bd = d; out = []; } out.push([x, y]); }
    return out;
  }
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
/** состояние узла для стороны: got | locked (закрыт навсегда) | null (открыт по дереву) */
export function techState(g: GameState, side: number, t: Tech, cfg: StratCfg): "got" | "locked" | null {
  const have = g.ec.techs[side];
  if (have.includes(t.id)) return "got";
  if (t.race && t.race !== g.races[side]) return "locked";
  if (t.grp === "root") { if (have.filter((id) => techOf(cfg, id)?.grp === "root").length >= (cfg.econ.research as any).maxPaths) return "locked"; }
  else if (techList(cfg).some((o) => o !== t && o.grp === t.grp && have.includes(o.id))) return "locked";
  if (t.req?.length && t.req.every((r) => { const rt = techOf(cfg, r); return !rt || techState(g, side, rt, cfg) === "locked"; })) return "locked"; // родитель закрыт → и ветка ниже
  return null;
}
/** t1163: эра технологии с поправкой лиги (econ.league[л].techEra) */
export function techEra(g: GameState, t: Tech, cfg: StratCfg): number { return (lg(g, cfg) as any)?.techEra?.[t.id] ?? t.era; }
export function canResearch(g: GameState, side: number, t: Tech | undefined, cfg: StratCfg): string | null {
  if (!t) return "bad_tech";
  const ec = g.ec, eras = sz(g, cfg).eras;
  if (eras <= 0) return "no_tech";
  if (t.race && t.race !== g.races[side]) return "wrong_race";
  const st = techState(g, side, t, cfg); if (st === "got") return "already"; if (st === "locked") return "locked";
  const te = techEra(g, t, cfg); if (te > ec.era[side] || te > eras) return "need_era";
  if (t.req?.length && !t.req.some((r) => ec.techs[side].includes(r))) return "need_req";
  if (ec.rs[side] >= cfg.econ.research.perTurn + tfx(g, side, "research", cfg)) return "research_done";
  if (ec.res[side].know < rCost(g, cfg, cfg.econ.research.cost[te])) return "no_know";
  return null;
}
export function canEra(g: GameState, side: number, cfg: StratCfg): string | null {
  const ec = g.ec, e = ec.era[side];
  if (e >= sz(g, cfg).eras) return "max_era";
  const n = ec.techs[side].filter((id) => techOf(cfg, id)?.era === e).length;
  if (n < cfg.econ.research.need) return "need_techs";
  if (ec.res[side].know < rCost(g, cfg, cfg.econ.research.eraCost[e + 1])) return "no_know";
  return null;
}
export function canFound(g: GameState, side: number, p: Piece, cfg: StratCfg): string | null {
  const F = (cfg.econ as any).found || { on: true, by: "pawn", gold: 0 }; if (!F.on) return "no_found";
  if (F.by === "king" ? p.kind !== "king" : F.by === "pawn" ? p.kind !== "pawn" : p.kind !== "king" && p.kind !== "pawn") return F.by === "king" ? "chief_only" : "pawn_only";
  if (p.kind === "king" && g.ec.res[side].gold < (F.gold || 0)) return "no_gold";
  if (g.ec.fnd?.[side]) return "already_founding";
  if (g.ec.cities.some((c) => c.x === p.x && c.y === p.y)) return "too_close";
  if (g.ec.cities.filter((c) => c.owner === side && !c.cap).length + (g.ec.fnd?.[side] ? 1 : 0) >= maxOutposts(g, side, cfg)) return "outpost_max";
  if (g.ec.cities.some((c) => cheb(c, p) < cfg.econ.city.outMinDist - tfx(g, side, "outDist", cfg))) return "too_close";
  const T = territory(g, cfg), R = cfg.econ.city.outRadius + tfx(g, side, "outR", cfg); // t1170: ни клетка, ни земля нового поселения (радиус) не заходят на чужую
  for (let y = Math.max(0, p.y - R); y <= Math.min(g.size - 1, p.y + R); y++) for (let x = Math.max(0, p.x - R); x <= Math.min(g.size - 1, p.x + R); x++) if (T[y * g.size + x] === other(side)) return "enemy_land";
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
    case "build": { // t1137: строит Вождь, стоя на земле своего города; тратит 1 ОД и действие Вождя, действие города не тратит
      const k = act.id != null ? g.pieces.find((q) => q.id === act.id && q.owner === side) : g.pieces.find((q) => q.owner === side && q.kind === "king");
      if (!k || k.kind !== "king") return no("no_chief"); if (k.acted) return no("already_acted"); if (g.ap < 1) return no("no_ap");
      if (founding(g, k)) return no("channeling");
      if ((cfg.build as any)[act.b]?.field) { // t1140: Сторожевая башня — в поле, на соседнюю с Вождём клетку (x, y)
        const x = (act as any).x ?? k.x, y = (act as any).y ?? k.y, e = canTower(g, side, k, x, y, cfg); if (e) return no(e);
        const TW = (cfg.econ as any).tower; r.gold -= TW.cost ?? 8; k.acted = true; g.ap -= 1;
        const id = 10001 + (ec.towers?.length ? Math.max(...ec.towers.map((t) => t.id)) - 10000 : 0); (ec.towers ||= []).push({ id, owner: side, x, y });
        ev.push({ e: "build", tower: id, b: act.b, x, y, by: k.id }); return ok(ev);
      }
      const c = buildCityAt(g, side, k.x, k.y, cfg); if (!c) return no("not_own_land"); if (act.city != null && act.city !== c.id) return no("bad_city");
      const e = canBuild(g, side, c, act.b, cfg, act.kind); if (e) return no(e);
      k.acted = true; g.ap -= 1;
      r.gold -= buildCostAt(g, side, c, act.b, cfg); if (c.ruin?.includes(act.b)) c.ruin = c.ruin.filter((x) => x !== act.b);
      if (act.b === "wonder") { r.know -= goalCfg(g, cfg).wonderKnow; setGoal(g, side, "wonder", ev, cfg); }
      if (act.b === "forge") c.forge.push(act.kind!);
      c.bld.push(act.b); // Кузня может стоять дважды (два слота, два типа фигур)
      ev.push({ e: "build", city: c.id, b: act.b, by: k.id }); return ok(ev);
    }
    case "found_cancel": { // t1140: отмена закладки — возврат refund от цены
      const f = ec.fnd?.[side]; if (!f) return no("not_founding");
      const back = Math.floor(f.gold * ((cfg.econ as any).found?.refund ?? 0.5)); r.gold += back; ec.fnd![side] = null;
      ev.push({ e: "found_fail", side, x: f.x, y: f.y, cancel: true, gold: back }); return ok(ev);
    }
    case "claim": { // t1140: «Расширить за N з» — потратить готовое право города на выбранную клетку
      const c = city(act.city); if (!c) return no("bad_city"); if (!(c.claims! > 0)) return no("not_ready");
      const i = (act.y | 0) * g.size + (act.x | 0); if (!claimCells(g, c, cfg).includes(i)) return no("bad_cell");
      const cost = claimCost(g, c, cfg); if (r.gold < cost) return no("no_gold");
      r.gold -= cost; c.claims = 0; delete c.cw; joinCell(g, c, i, ev); return ok(ev);
    }
    case "repair": { // ремонт постройки (действие города): repairCost золота → полное HP
      const c = city(act.city); if (!c) return no("bad_city"); if (c.acted) return no("city_acted");
      if (!c.bld.includes(act.b)) return no("bad_building"); const o = pieceAt(g, c.x, c.y); if (o && o.owner !== side) return no("under_siege");
      const cost = repairCost(g, c, act.b, cfg); if (cost <= 0) return no("full_hp"); if (r.gold < cost) return no("no_gold");
      r.gold -= cost; delete c.bhp![act.b]; c.acted = true; ev.push({ e: "repair", city: c.id, b: act.b, gold: cost }); return ok(ev);
    }
    case "research": {
      const t = techOf(cfg, String(act.t)); const e = canResearch(g, side, t, cfg); if (e) return no(e);
      const extraGlory = tfx(g, side, "research", cfg) > 0 ? (cfg.econ.research as any).techGlory || 0 : 0;
      r.know -= rCost(g, cfg, cfg.econ.research.cost[techEra(g, t!, cfg)]); ec.techs[side].push(t!.id); ec.rs[side]++;
      const kh = t!.fx?.kingHp || 0; if (kh) for (const p of g.pieces) if (p.owner === side && p.kind === "king") { p.maxHp += kh; p.hp += kh; }
      ev.push({ e: "tech", side, t: t!.id }); addGlory(g, side, cfg.econ.glory.tech + extraGlory, "tech", ev); return ok(ev);
    }
    case "era": {
      const e = canEra(g, side, cfg); if (e) return no(e);
      r.know -= rCost(g, cfg, cfg.econ.research.eraCost[ec.era[side] + 1]); ec.era[side]++;
      ev.push({ e: "era", side, era: ec.era[side] }); addGlory(g, side, cfg.econ.glory.era, "era", ev);
      if (ec.era[side] === 4) { const k = g.pieces.find((q) => q.owner === side && q.kind === "king"), A = (cfg.econ as any).era4 || {}; // «Апофеоз» эпохи IV
        if (k) { k.hp = k.maxHp; if (k.cds) for (const key in k.cds) k.cds[key] = 0; }
        if (A.apoGlory) addGlory(g, side, A.apoGlory, "apotheosis", ev); ev.push({ e: "apotheosis", side, id: k?.id ?? 0 }); }
      return ok(ev);
    }
    case "talent": {
      const p = g.pieces.find((q) => q.id === act.id && q.owner === side); if (!p) return no("bad_piece");
      if (p.kind === "king") {
        const cc = chiefChoices(g, p, cfg), n = act.t === "auto" ? cc[0] : cc.find((x) => x.id === act.t); if (!n) return no(pendingTalent(p, cfg, g) ? "bad_talent" : "no_talent");
        p.tal = [...(p.tal || []), n.id]; p.atk += n.fx.atk || 0; p.arm += n.fx.arm || 0; if (n.fx.hp) { p.maxHp += n.fx.hp; p.hp += n.fx.hp; }
        if (n.fx.ap && g.cur === side) { g.ap += n.fx.ap; g.apMax += n.fx.ap; }
        ev.push({ e: "talent", id: p.id, t: n.id }); return ok(ev);
      }
      const lv = pendingTalent(p, cfg); if (!lv) return no("no_talent");
      const pair: any[] = unitChoices(p, lv, cfg), t = act.t === "auto" ? pair[0] : pair.find((x) => x.id === act.t); if (!t) return no("bad_talent"); // "auto" — быстрый выбор
      p.tal = [...(p.tal || []), t.id];
      if (lv === 2) { p.atk += t.atk || 0; p.arm += t.arm || 0; if (t.hp) { p.maxHp += t.hp; p.hp += t.hp; } }
      ev.push({ e: "talent", id: p.id, t: t.id }); return ok(ev);
    }
    case "found": {
      const p = g.pieces.find((q) => q.id === act.id && q.owner === side); if (!p) return no("bad_piece");
      if (p.acted) return no("already_acted"); if (g.ap < 1) return no("no_ap");
      const e = canFound(g, side, p, cfg); if (e) return no(e);
      if (p.kind === "king") { // t1140: Вождь начинает канал — поселение появится через foundTurns своих ходов
        const gold = (cfg.econ as any).found?.gold || 0; r.gold -= gold; p.acted = true; g.ap -= 1;
        (ec.fnd ||= [null, null])[side] = { id: p.id, x: p.x, y: p.y, left: foundTurns(g, cfg), gold };
        ev.push({ e: "found_start", side, id: p.id, x: p.x, y: p.y, left: foundTurns(g, cfg) }); return ok(ev);
      }
      g.pieces = g.pieces.filter((q) => q !== p);
      const c = mkCity(g, side, p.x, p.y, false); c.acted = true; ec.cities.push(c); g.ap -= 1;
      ev.push({ e: "found", city: c.id, x: c.x, y: c.y }); addGlory(g, side, cfg.econ.glory.found, "found", ev); return ok(ev);
    }
    case "swap": {
      const c = city(act.city); if (!c) return no("bad_city"); if (c.acted) return no("city_acted");
      if (!c.bld.includes("market")) return no("need_market");
      const n = act.n | 0; if (n < 1 || n > cfg.econ.market.max) return no("bad_amount"); if (r.know < n) return no("no_know");
      r.know -= n; r.gold += n * (bp(g, side, "market", "rate", cfg) || cfg.econ.market.rate); c.acted = true;
      ev.push({ e: "swap", city: c.id, n }); return ok(ev);
    }
    case "trade": { const e = validateTrade(g, side, act, cfg); return no(e || "no_ally"); }
    case "ability": {
      const p = g.pieces.find((q) => q.id === act.id && q.owner === side); if (!p) return no("bad_piece");
      if (p.kind !== "king") return unitAbility(g, side, p, act as any, ev, cfg) ? no(unitAbility(g, side, p, act as any, ev, cfg, true)!) : ok(ev);
      if (p.acted) return no("already_acted"); if (g.ap < 1) return no("no_ap");
      const n = (p.tal || []).map((id) => chiefNode(cfg, g, side, id)).find((x) => x && x.kind === "active" && x.id === act.ab); if (!n) return no("no_ability");
      if (n.ult) return no("use_ult"); // ультимейт — отдельное действие { a: "ult", id, x, y }
      if ((p.cds?.[n.id] || 0) > 0) return no("cooldown");
      if (n.fx.heal) {
        let any = false;
        for (const q of g.pieces) if (q.owner === side && q !== p && q.hp < q.maxHp && cheb(q, p) <= (n.fx.r || 2)) { const h = Math.min(n.fx.heal, q.maxHp - q.hp); q.hp += h; any = true; ev.push({ e: "heal", id: q.id, hp: q.hp, n: h }); }
        if (!any) return no("nothing_to_heal");
      } else if (n.fx.summon) {
        if (g.pieces.filter((q) => q.owner === side).length >= sz(g, cfg).pop) return no("pop_cap");
        let cell: [number, number] | null = null;
        for (let y = p.y - 1; y <= p.y + 1 && !cell; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (x >= 0 && y >= 0 && x < g.size && y < g.size && !pieceAt(g, x, y) && passable(g.map, x, y, g.races[side])) { cell = [x, y]; break; }
        if (!cell || !mk) return no("no_cell");
        const q = mk(side, "pawn", cell[0], cell[1]); q.acted = true; g.pieces.push(q); ev.push({ e: "recruit", id: q.id, city: 0, kind: "pawn" });
      }
      p.cds = { ...(p.cds || {}), [n.id]: n.fx.cd || 3 }; p.acted = true; g.ap -= 1;
      ev.push({ e: "ability", id: p.id, ab: n.id }); return ok(ev);
    }
    case "name": {
      const ch = ec.chief[side], C = (cfg as any).chief.name;
      if (ch.renames >= C.renames) return no("rename_limit");
      if (g.turn > ch.nameUntil) return no("name_window");
      const v = checkChiefName(String((act as any).name ?? ""), C);
      if (!v.ok) return no(v.err!);
      ch.name = v.name!; ch.renames++; const h = ch.hist[ch.hist.length - 1]; if (h && h.gen === ch.gen) h.name = v.name!;
      ev.push({ e: "chief_name", side, name: v.name!, gen: ch.gen }); return ok(ev);
    }
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
  if (techList(cfg).some((t) => !canResearch(g, side, t, cfg))) return true;
  for (const c of g.ec.cities) if (c.owner === side && !c.acted) {
    for (const k of ["pawn", "knight", "mage", "rook", "hero"] as Kind[]) if (!canRecruit(g, side, c, k, cfg) && recruitCells(g, c, k, cfg).length) return true;
  }
  { const s = chiefBuildSite(g, side, cfg); if (s) for (const b of Object.keys(cfg.build) as BuildId[]) if (!canBuild(g, side, s.c, b, cfg, "rook")) return true; }
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
  for (const p of g.pieces) if (p.owner === side) { const lv = pendingTalent(p, cfg, g); if (lv) { const pair: { id: string }[] = p.kind === "king" ? chiefChoices(g, p, cfg) : unitChoices(p, lv, cfg); if (!pair.length) continue; return { a: "talent", id: p.id, t: pair[Math.floor(rnd() * pair.length)].id } as any; } }
  if (!canEra(g, side, cfg)) return { a: "era" } as any;
  const techs = techList(cfg).filter((t) => !canResearch(g, side, t, cfg));
  // копим на переход эпохи, если две технологии эпохи уже есть
  const curN = ec.techs[side].filter((id) => techOf(cfg, id)?.era === ec.era[side]).length;
  if (techs.length && !(curN >= cfg.econ.research.need && ec.era[side] < sz(g, cfg).eras)) return { a: "research", t: techs[Math.floor(rnd() * techs.length)].id } as any;
  const ek = g.pieces.find((p) => p.owner !== side && p.kind === "king");
  const enemyCap = ec.cities.find((c) => c.owner !== side && c.cap) || ek;
  const mine = g.pieces.filter((p) => p.owner === side);
  { const site = chiefBuildSite(g, side, cfg); // t1137: строит Вождь на земле своего города
    // анти-застой: Чудо — цель партии; доступно (эпоха/вершина/знания/золото) — строим сразу, без оглядки на угрозу
    if (site && !canBuild(g, side, site.c, "wonder", cfg)) return { a: "build", id: site.k.id, city: site.c.id, b: "wonder" } as any;
    if (site) { const c = site.c, threat = g.pieces.some((p) => p.owner !== side && cheb(p, c) <= 3);
      const units = BOT_UNIT.filter((k) => !canRecruit(g, side, c, k, cfg) && recruitCells(g, c, k, cfg).length);
      const builds = BOT_BUILD.filter((b) => !canBuild(g, side, c, b, cfg, "rook") && !(b === "wall" && !threat));
      if (builds.length && !threat && (rnd() < 0.55 || !units.length) && !units.includes("hero")) { const b = builds[0]; return { a: "build", id: site.k.id, city: c.id, b, ...(b === "forge" ? { kind: mine.some((p) => p.kind === "rook") ? "rook" : "knight" } : {}) } as any; } } }
  for (const c of ec.cities) if (c.owner === side && !c.acted) {
    const units = BOT_UNIT.filter((k) => !canRecruit(g, side, c, k, cfg) && recruitCells(g, c, k, cfg).length);
    const pawns = mine.filter((p) => p.kind === "pawn").length;
    const wantPawn = maxOutposts(g, side, cfg) > ec.cities.filter((x) => x.owner === side && !x.cap).length && pawns < 2 && units.includes("pawn");
    if (units.length) {
      const k = wantPawn ? "pawn" : units.filter((u) => u !== "pawn" || units.length === 1)[0];
      if (k) {
        const cells = recruitCells(g, c, k, cfg).sort((a, b) => (enemyCap ? cheb({ x: a[0], y: a[1] }, enemyCap) - cheb({ x: b[0], y: b[1] }, enemyCap) : 0));
        if (r.gold >= recruitCost(g, c, k, cfg) + (k === "pawn" ? 0 : 0)) return { a: "recruit", city: c.id, kind: k, x: cells[0][0], y: cells[0][1] } as any;
      }
    }
  }
  for (const c of g.ec.cities) if (c.owner === side && (c.claims || 0) > 0 && g.ec.res[side].gold >= claimCost(g, c, cfg) + 2) { // t1140: «Расширить»
    const i = growPick(g, c, cfg); if (i >= 0) return { a: "claim", city: c.id, x: i % g.size, y: (i / g.size) | 0 } as any;
  }
  if (g.ap >= 1) for (const p of mine) if (!p.acted && !canFound(g, side, p, cfg)) {
    if (p.kind === "king" && g.pieces.some((q) => q.owner !== side && cheb(q, p) <= 5)) continue; // закладывать поселение под ударом — нет
    let resN = 0; for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (cfg.econ.struct[mapStr(g.map, x, y)]) resN++;
    if (resN > 0 || rnd() < 0.3) return { a: "found", id: p.id } as any;
  }
  return null;
}
/** Бот: куда вести Вождя — в столицу, если Чудо там уже можно строить, а Вождь стоит не на её земле (null — не нужно). */
export function botChiefHome(g: GameState, side: number, cfg: StratCfg): City | null {
  if (!g.ec) return null; const cap = g.ec.cities.find((c) => c.owner === side && c.cap); if (!cap || canBuild(g, side, cap, "wonder", cfg)) return null;
  const k = g.pieces.find((q) => q.owner === side && q.kind === "king"); if (!k) return null;
  return buildCityAt(g, side, k.x, k.y, cfg) === cap ? null : cap;
}
/** Куда тянуть Ополченца-бота: ближайшая доходная клетка/руины без своей фигуры. */
export function botPawnGoal(g: GameState, p: Piece, cfg: StratCfg): { x: number; y: number } | null {
  if (!g.ec) return null; let best: { x: number; y: number } | null = null, bd = 99;
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
    const s = mapStr(g.map, x, y);
    const want = (s === "R" && !g.ec.ruins.includes(y * g.size + x)) || s === "X" || (maxOutposts(g, p.owner, cfg) > 0 && cfg.econ.struct[s]);
    if (!want) continue; const o = pieceAt(g, x, y); if (o && o.owner === p.owner && o !== p) continue;
    const d = cheb(p, { x, y }); if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

/** Проверка описания типа Вождя (реестр cfg.chiefs; админка и будущие Вожди). Пустой массив — всё верно. */
export function validateChiefDef(d: ChiefDef, races: string[]): string[] {
  const e: string[] = [], ids = new Set<string>();
  if (!d || typeof d.id !== "string" || !/^[a-z0-9_]{2,32}$/.test(d.id)) e.push("id");
  if (!(d.race === "any" || races.includes(d.race))) e.push("race");
  if (!(d.v >= 1)) e.push("v");
  if (!d.base || !(d.base.hp >= 10 && d.base.hp <= 60) || !(d.base.atk >= 1 && d.base.atk <= 12) || !(d.base.arm >= 0 && d.base.arm <= 6)) e.push("base");
  if (!Array.isArray(d.tree) || !d.tree.length) { e.push("tree"); return e; }
  for (const n of d.tree) {
    if (ids.has(n.id)) e.push("dup:" + n.id); ids.add(n.id);
    if (!(n.lvl >= 2 && n.lvl <= 5)) e.push("lvl:" + n.id);
    if (n.kind === "active" && !(n.fx.cd! >= 1)) e.push("cd:" + n.id);
  }
  for (const n of d.tree) for (const r of n.req || []) { const q = d.tree.find((x) => x.id === r); if (!q || q.lvl >= n.lvl) e.push("req:" + n.id); }
  for (let l = 2; l <= 5; l++) if (!d.tree.some((n) => n.lvl === l)) e.push("empty_lvl:" + l);
  return e;
}
/** «бюджет» узла (для проверки равенства деревьев разных типов): HP 1, АТК 3, БРН 4, ОД 8, аура 4/шт, лечение 1.5, призыв 6, Слава 2 */
export function chiefNodeBudget(n: ChiefNode): number {
  const f: any = n.fx; return (f.hp || 0) + 3 * (f.atk || 0) + 4 * (f.arm || 0) + 8 * (f.ap || 0) + 4 * ((f.auraArm || 0) + (f.auraAtk || 0)) * (f.r || 1) + 1.5 * (f.heal || 0) * 4 / (f.cd || 4) + 6 * (f.summon || 0) * 5 / (f.cd || 5) + 4 * (f.glory || 0) + 1.5 * (f.slayer || 0) + 3 * (f.burn || 0);
}

/** Цели для подсказок (ТЗ §14.H): структурное описание + живой прогресс стороны side. Без координат и чужих скрытых данных:
 *  всё, что тут есть, игрок и так видит на доске/в своей панели. need — сколько целей нужно для победы. */
export type GoalDetail = { id: string; name: string; icon: string; desc: string; done: boolean; turn: number | null; p: number;
  cur: number; max: number; unit: string; text: string; parts?: { label: string; cur: number; max: number }[] };
export function goalDetails(g: GameState, side: number, cfg: StratCfg): { need: number; done: number; list: GoalDetail[] } {
  if (!g.ec) return { need: 0, done: 0, list: [] };
  const G = goalCfg(g, cfg), ec = g.ec, info = (cfg as any).goals.info, P = goalProgress(g, side, cfg), out: GoalDetail[] = [];
  const has = (id: string) => ec.goals[side].includes(id), tn = (id: string) => ec.gt[side][id] ?? null;
  for (const id of G.list) {
    const I = info[id] || { name: id, icon: "", eff: "" }, d: GoalDetail = { id, name: I.name, icon: I.icon, desc: "", done: has(id), turn: tn(id), p: P[id] ?? 0, cur: 0, max: 1, unit: "", text: "" };
    if (id === "chief") { const bl = chiefBlacklist(g, side), dead = bl.filter((r) => !r.alive).length;
      d.desc = "Сразить ПЕРВОГО Вождя каждого соперника (возрождённые Вожди не в счёт)"; d.cur = has(id) ? bl.length || 1 : dead; d.max = Math.max(1, bl.length); d.unit = "Вождей"; }
    else if (id === "hold") { const hs = holdScore(g, side, cfg), H = (cfg as any).goals.hold;
      d.desc = `Набрать ${G.holdK} очк. опоры и держать ${G.holdTurns} ход(а) подряд. Опора: свой город +${H.city}, со Стеной ещё +${H.walled}, взятая столица соперника +${H.enemyCap}, своя фигура на Обелиске/Башне/Месте чуда +${H.point}`;
      d.parts = [{ label: "очки опоры", cur: hs, max: G.holdK }, { label: "ходов подряд", cur: has(id) ? G.holdTurns : ec.hold[side], max: G.holdTurns }];
      d.cur = has(id) ? G.holdTurns : ec.hold[side]; d.max = G.holdTurns; d.unit = "ходов"; }
    else if (id === "treasury") { d.desc = `Заработать за партию ${G.gold} золота (считается весь доход, траты не уменьшают)`; d.cur = Math.min(G.gold, ec.earned[side]); d.max = G.gold; d.unit = "золота"; }
    else if (id === "domain") { const T = territory(g, cfg); let c = 0; for (let i = 0; i < T.length; i++) if (T[i] === side) c++; const all = passableCells(g), need = Math.ceil(all * G.share);
      d.desc = `Владеть ${Math.round(G.share * 100)}% проходимых клеток карты (${need} из ${all})`; d.cur = has(id) ? need : Math.min(need, c); d.max = need; d.unit = "клеток"; }
    else if (id === "wonder") { const E = wonderEra(g, cfg), era = ec.era[side];
      const cap = G.wonderCap === false || ec.techs[side].some((t) => { const x = techOf(cfg, t); return x && x.era === E && x.br !== "elem"; });
      d.desc = `Возвести Чудо своей расы в столице: эпоха ${E}${G.wonderCap === false ? "" : ", вершина ветки последней эпохи"}, ${G.wonderGold} золота и ${G.wonderKnow} знаний. Чудо даёт +${(cfg as any).goals.wonderGlory} Славы за ход`;
      d.parts = [{ label: "эпоха", cur: Math.min(era, E), max: E }, ...(G.wonderCap === false ? [] : [{ label: "вершина ветки", cur: cap ? 1 : 0, max: 1 }]),
        { label: "золото", cur: Math.min(G.wonderGold, ec.res[side].gold), max: G.wonderGold }, { label: "знания", cur: Math.min(G.wonderKnow, ec.res[side].know), max: G.wonderKnow }];
      d.cur = has(id) ? 1 : 0; d.max = 1; d.unit = "Чудо"; }
    if (d.done) d.p = 1;
    d.text = d.done ? `выполнено на ходу ${d.turn}` : d.parts ? d.parts.map((x) => `${x.label} ${x.cur}/${x.max}`).join(" · ") : `${d.cur}/${d.max} ${d.unit}`;
    out.push(d);
  }
  return { need: G.need, done: ec.goals[side].length, list: out };
}
