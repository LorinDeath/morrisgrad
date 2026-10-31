// Пассивки: структурные описания эффектов → подсказки с живыми числами из конфига (правки админки, технологии, уровни).
// Текст подсказки собирается из полей эффекта (стат, величина, когда, кому, длительность, складывание), а не пишется руками.
import type { GameState, StratCfg } from "../../../server/strat/rules";
import { TECHS } from "../../../server/strat/econ-cfg";
import { burnTurns, burnDmg, chillTurns, mageShot } from "../../../server/strat/econ";
import { TER_RULES } from "../../../server/strat/terrain";
import { raceNums } from "../../../server/strat/effects";
import { esc } from "./ui-kit";
import { ic } from "./icons";

export type When = "always" | "turn_start" | "on_hit" | "on_attack" | "on_kill" | "on_enter" | "aura" | "per_turn" | "on_research";
export type Eff = { stat: string; v: number; pct?: boolean; mul?: boolean; when: When; who: string; radius?: number; dur?: number; cd?: number; stack?: "add" | "max" | "none" | "refresh"; cond?: string; src?: string };
export type Passive = { key: string; name: string; icon: string; effs: Eff[]; note?: string };

const STAT: Record<string, [string, string]> = { // [название, иконка]
  atk: ["АТК", "sword"], arm: ["БРН", "shield"], hp: ["HP", "heart"], hpMul: ["Здоровье", "heart"], ap: ["ОД за ход", "ap"], shot: ["Дальность выстрела", "target"],
  dmg: ["урон", "sword"], burn: ["Поджог: урон в начале хода", "burn"], chill: ["Обморожение: ход не дальше", "chill"], know: ["знания за ход", "know"], gold: ["золото за ход", "gold"],
  growth: ["рост за ход", "wheat"], glory: ["Слава", "glory"], heal: ["лечение", "heart"], elem: ["урон по стихии-жертве", "spark"], cost: ["стоимость построек", "gold"], radius: ["радиус столицы", "castle"],
  pass_water: ["проходит по воде", "wave"], pass_mount: ["проходит через горы", "mountain"],
};
const WHEN: Record<When, string> = { always: "постоянно", turn_start: "в начале своего хода", on_hit: "при попадании по цели", on_attack: "при атаке", on_kill: "за каждое убийство",
  on_enter: "при входе на клетку", aura: "аура", per_turn: "каждый ход", on_research: "сразу после изучения" };
const STACK: Record<string, string> = { add: "складывается с другими бонусами", max: "не складывается: действует наибольший", none: "не складывается", refresh: "повторное наложение обновляет длительность" };
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
const turns = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "ход" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "хода" : "ходов"}`;

/** Одна строка механики из структуры эффекта. */
export function effLine(e: Eff): string {
  const [nm] = STAT[e.stat] || [e.stat];
  if (!e.v && e.dur) return `${nm.split(":")[0]} длится ${turns(e.dur)}`;
  if (e.stat === "pass_water" || e.stat === "pass_mount") return nm[0].toUpperCase() + nm.slice(1);
  if (e.stat === "hpMul") return `Здоровье фигур ×${e.v}`;
  if (e.stat === "burn") return `Поджог: ${e.v} урона в начале хода цели`;
  if (e.stat === "chill") return `Обморожение: цель ходит не дальше чем на ${e.v} клетку`;
  if (e.stat === "elem") return `+${Math.round(e.v * 100)}% урона`;
  if (e.pct) return `${sgn(Math.round(e.v * 100))}% — ${nm}`;
  return `${sgn(e.v)} ${nm}`;
}
export function passiveHtml(p: Passive): string {
  const rows = p.effs.map((e) => {
    const meta = [`<span>${ic("turn")}Когда: ${WHEN[e.when]}${e.radius ? `, радиус ${e.radius}` : ""}</span>`, `<span>${ic("target")}Кому: ${esc(e.who)}</span>`,
      e.cond ? `<span>${ic("lock")}Условие: ${esc(e.cond)}</span>` : "", e.dur ? `<span>${ic("refresh")}Длительность: ${turns(e.dur)}</span>` : "", e.cd ? `<span>${ic("refresh")}Перезарядка: ${turns(e.cd)}</span>` : "",
      e.stack ? `<span>${ic("plus")}${STACK[e.stack]}</span>` : "", e.src ? `<span class="src">${esc(e.src)}</span>` : ""].filter(Boolean).join("");
    return `<div class="pv-e"><b>${ic((STAT[e.stat] || ["", "spark"])[1])}${esc(effLine(e))}</b><div class="pv-m">${meta}</div></div>`; }).join("");
  return `<div class="pv"><div class="pv-h">${ic(p.icon)}<b>${esc(p.name)}</b></div>${rows}${p.note ? `<div class="pv-n">${esc(p.note)}</div>` : ""}</div>`;
}

// ---------- источники ----------
const hasT = (G: GameState | null, side: number, t: string) => !!G?.ec?.techs?.[side]?.includes(t);
const CYCLE = ["water", "fire", "ice", "nature", "stone", "lightning"];
const RN: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
/** Пассивки расы (живые числа: правки конфига и изученные технологии стороны). */
/** size — размер поля партии/лобби: числа расы берутся по лиге (econ.league[лига].race поверх cfg.race, как в партии на сервере). */
export function racePassives(cfg: StratCfg, race: string, G: GameState | null = null, side = 0, size?: number): Passive[] {
  const c: any = raceNums(cfg, race, size ?? (G as any)?.size), out: Passive[] = [], fakeG: any = G || { ec: { techs: [[], []], cities: [], res: [{}, {}], chief: [null, null] }, pieces: [], races: [race, race], size: size ?? 8 }; // r3: tfx сервера читает g.races[side]
  if (c.hpMul != null && c.hpMul !== 1) out.push({ key: `race.${race}.hp`, name: "Хрупкость", icon: "heart", effs: [{ stat: "hpMul", v: c.hpMul, when: "always", who: "все свои фигуры при появлении", stack: "none", src: "раса" }] });
  if (race === "fire") out.push({ key: "race.fire.burn", name: "Поджог", icon: "burn", effs: [{ stat: "burn", v: burnDmg(fakeG, 1 - side, cfg), when: "on_hit", who: "вражеская фигура, по которой попали", dur: burnTurns(fakeG, side, cfg), stack: "refresh", src: hasT(G, side, "wildfire") || hasT(G, side, "embers") ? "раса + технология" : "раса" }] });
  if (race === "ice") { out.push({ key: "race.ice.chill", name: "Обморожение", icon: "chill", effs: [{ stat: "chill", v: c.chillMove ?? 1, when: "on_hit", who: "вражеская фигура, по которой попали", dur: chillTurns(fakeG, side, cfg), stack: "refresh", src: hasT(G, side, "deepfreeze") ? "раса + технология" : "раса" }] });
    if (c.knowPen) out.push({ key: "race.ice.know", name: "Долгая зима", icon: "know", effs: [{ stat: "know", v: -c.knowPen, when: "turn_start", who: "ваш доход знаний", cond: c.knowFloor ? `доход не опускается ниже ${c.knowFloor}` : undefined, stack: "none", src: "раса" }] }); }
  if (c.atk) out.push({ key: `race.${race}.atk`, name: "Натиск расы", icon: "sword", effs: [{ stat: "atk", v: c.atk, when: "always", who: "все свои фигуры", stack: "add", src: "раса" }] });
  if (c.arm) out.push({ key: `race.${race}.arm`, name: "Каменная кожа", icon: "shield", effs: [{ stat: "arm", v: c.arm, when: "always", who: "все свои фигуры", stack: "add", src: "раса" }] });
  if (c.rookAtk) out.push({ key: `race.${race}.rook`, name: "Тяжёлые Стражи", icon: "tower", effs: [{ stat: "atk", v: c.rookAtk, when: "always", who: "свои Стражи", stack: "add", src: "раса" }] });
  if (race === "water") out.push({ key: "race.water.pass", name: "Дети реки", icon: "wave", effs: [{ stat: "pass_water", v: 1, when: "always", who: "все свои фигуры", src: "раса" }] });
  if (race === "stone") out.push({ key: "race.stone.pass", name: "Горная тропа", icon: "mountain", effs: [{ stat: "pass_mount", v: 1, when: "always", who: "все свои фигуры", src: "раса" }] });
  const i = CYCLE.indexOf(race); if (i >= 0 && cfg.elementBonus) out.push({ key: `race.${race}.elem`, name: "Круг стихий", icon: "spark", effs: [{ stat: "elem", v: cfg.elementBonus, when: "on_attack", who: `фигуры расы «${RN[CYCLE[(i + 1) % CYCLE.length]]}»`, stack: "add", src: "раса" }] });
  return out;
}
/** Таланты: поля atk/arm/hp/ap/shot таланта. */
export function talentPassive(t: any, kind: string): Passive {
  const effs: Eff[] = [];
  for (const k of ["atk", "arm", "hp", "ap", "shot"]) if (t[k]) effs.push({ stat: k, v: t[k], when: "always", who: k === "ap" ? "ваш запас ОД, пока фигура жива" : "эта фигура", stack: "add", src: "талант" });
  return { key: `tal.${kind}.${t.id}`, name: t.name, icon: t.ap ? "ap" : t.shot ? "target" : t.hp ? "heart" : t.arm ? "shield" : "sword", effs, note: effs.length ? undefined : t.eff };
}
/** Технологии: спецификация эффекта → числа из cfg.econ.fx (если в данных технологии есть fx/effects — берём их). */
const TECH_FX: Record<string, (F: any, cfg: StratCfg) => Eff[]> = {
  formation: (F) => [{ stat: "arm", v: F.formationArm, when: "aura", radius: 1, who: "Ополченец", cond: "рядом (по стороне) другой свой Ополченец", stack: "none" }],
  ambush: (F) => [{ stat: "dmg", v: F.ambushDmg, when: "on_attack", who: "ваши атакующие фигуры", cond: "цель ходила в прошлый ход", stack: "add" }],
  steel: (F) => [{ stat: "atk", v: F.steelAtk, when: "always", who: "все свои фигуры", stack: "add" }],
  shields: (F) => [{ stat: "arm", v: F.shieldsArm, when: "always", who: "Стражи и Вождь", stack: "add" }],
  drill: (F) => [{ stat: "ap", v: F.drillAp, when: "turn_start", who: "ваш запас ОД", stack: "add" }],
  bastion: (F) => [{ stat: "arm", v: F.bastionArm, when: "always", who: "свои фигуры", cond: "на своей территории", stack: "add" }],
  trade: (F) => [{ stat: "gold", v: F.tradeGold, when: "per_turn", who: "каждый ваш Рудник и Деревня", stack: "add" }],
  farming: (F) => [{ stat: "growth", v: F.farmingGrowth, when: "per_turn", who: "каждый ваш город", stack: "add" }],
  masons: (F) => [{ stat: "cost", v: -F.masonsDisc, pct: true, when: "always", who: "все ваши постройки", stack: "none" }],
  scribes: (F) => [{ stat: "know", v: F.scribesKnow, when: "per_turn", who: "каждый ваш город", stack: "add" }],
  treasury: (F) => [{ stat: "gold", v: F.treasuryGold, when: "per_turn", who: "ваша казна", stack: "add" }],
  empire: () => [{ stat: "radius", v: 1, when: "always", who: "ваша столица", stack: "none" }],
  wildfire: (F) => [{ stat: "burn", v: 0, when: "on_hit", who: "подожжённые враги", dur: F.wildfireTurns, stack: "refresh" }],
  embers: (F) => [{ stat: "burn", v: F.embersDmg, when: "turn_start", who: "подожжённые враги", stack: "max" }],
  pyromancy: (F) => [{ stat: "shot", v: F.shot3, when: "always", who: "ваши Маги (дальность становится)", stack: "max" }],
  icelance: (F) => [{ stat: "shot", v: F.shot3, when: "always", who: "ваши Маги (дальность становится)", stack: "max" }],
  fury: (F) => [{ stat: "dmg", v: F.furyDmg, when: "on_attack", who: "ваши атакующие фигуры", cond: "цель горит", stack: "add" }],
  phoenix: (F) => [{ stat: "hp", v: F.kingHp, when: "on_research", who: "ваш Вождь", stack: "add" }],
  winterking: (F) => [{ stat: "hp", v: F.kingHp, when: "on_research", who: "ваш Вождь", stack: "add" }],
  blaze: (F) => [{ stat: "glory", v: F.killGlory, when: "on_kill", who: "вы", stack: "add" }],
  avalanche: (F) => [{ stat: "glory", v: F.killGlory, when: "on_kill", who: "вы", stack: "add" }],
  deepfreeze: (F) => [{ stat: "chill", v: 0, when: "on_hit", who: "обмороженные враги", dur: F.deepfreezeTurns, stack: "refresh" }],
  frostarmor: (F) => [{ stat: "arm", v: F.frostArm, when: "always", who: "ваши Стражи", stack: "add" }],
  rime: (F) => [{ stat: "dmg", v: F.rimeDmg, when: "on_attack", who: "ваши атакующие фигуры", cond: "цель обморожена (и ещё ход спустя)", stack: "add" }],
};
export function techPassive(id: string, cfg: StratCfg, race?: string): Passive | null {
  const t: any = (TECHS as any[]).find((x) => x.id === id); if (!t) return null; const v = (race && (t.races?.[race] || t.byRace?.[race])) || {};
  const data = v.effects ?? t.effects ?? v.fx ?? t.fx; // данные ТЗ §14 (если придут) важнее встроенной спецификации
  const effs: Eff[] = Array.isArray(data) ? data : TECH_FX[id] ? TECH_FX[id]((cfg.econ as any).fx, cfg) : [];
  for (const e of effs) e.src ||= "технология";
  return { key: `tech.${id}`, name: v.name || t.name, icon: "tech", effs, note: effs.length ? undefined : v.eff || t.eff };
}
/** Постройки: поля gold/know/growth и известные механики. */
export function buildPassive(id: string, b: any, cfg: StratCfg): Passive {
  const F: any = (cfg.econ as any).fx, effs: Eff[] = [];
  for (const k of ["gold", "know", "growth"]) if (b[k]) effs.push({ stat: k, v: b[k], when: "per_turn", who: "город с постройкой", stack: "add", src: "постройка" });
  if (id === "wall") effs.push({ stat: "arm", v: F.wallArm, when: "aura", radius: 1, who: "свои фигуры у города", stack: "none", src: "постройка" });
  return { key: `bld.${id}`, name: b.name, icon: "build", effs, note: b.eff };
}
/** Рельеф и места на карте. */
export function terrainPassive(t: string, name: string): Passive | null {
  const R: any = TER_RULES;
  if (t === "f") return { key: "ter.f", name, icon: "leaf", effs: [{ stat: "arm", v: R.forestArm, when: "always", who: "фигура в лесу", stack: "add", src: "рельеф" }], note: "Скольжение останавливается на опушке." };
  if (t === "g") return { key: "ter.g", name, icon: "wall", effs: [{ stat: "arm", v: R.gateArm, when: "always", who: "фигура в воротах", stack: "add", src: "рельеф" }] };
  return null;
}
export function structPassive(s: string, st: any): Passive | null {
  const R: any = TER_RULES;
  if (s === "T") return { key: "st.T", name: st.name, icon: "tower", effs: [{ stat: "arm", v: R.towerArm, when: "always", who: "фигура в башне", stack: "add", src: "место" }] };
  if (s === "W") return { key: "st.W", name: st.name, icon: "heart", effs: [{ stat: "heal", v: R.wellHeal, when: "turn_start", who: "своя раненая фигура на колодце", stack: "none", src: "место" }] };
  return st ? { key: "st." + s, name: st.name, icon: "castle", effs: [], note: st.eff } : null;
}
export { mageShot };

// ---------- реестр: элементы с data-pas="ключ" получают подсказку при наведении / долгом нажатии ----------
const REG = new Map<string, () => Passive | null>();
export function regPassive(p: Passive | null | (() => Passive | null), key?: string): string {
  if (!p) return ""; const f = typeof p === "function" ? p : () => p; const k = key || (f() as Passive)?.key; if (!k) return ""; REG.set(k, f); return k;
}
export const passiveTip = (key: string) => { const p = REG.get(key)?.(); return p ? passiveHtml(p) : ""; };
/** Значок пассивки (иконка + подсказка). */
export function pasIcon(p: Passive | null): string { if (!p) return ""; const k = regPassive(p); return `<span class="pas" tabindex="0" role="img" data-pas="${esc(k)}" aria-label="${esc(p.name)}">${ic(p.icon)}</span>`; }
