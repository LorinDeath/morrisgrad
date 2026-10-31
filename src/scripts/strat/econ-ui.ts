// Этап 2 — интерфейс экономики в стиле игры: полоса ресурсов, окно города (найм + строительство), экран древа технологий,
// выбор таланта (2 карточки), «Основать заставу», территория и города на доске. Все проверки — тем же движком,
// что и на сервере (server/strat/econ.ts); сервер всё равно проверяет сам.
// Древо технологий строится по данным: узлы {era, br, req[], excl[], unlocks{b[],k[]}} — форма дерева любая.
import { STRAT_CFG, type GameState, type Piece, type Kind, type StratCfg } from "../../../server/strat/rules";
import { TECHS, BUILD, techSibling, UNLOCK, HERO_ERA, type BuildId, type Tech } from "../../../server/strat/econ-cfg";
import { citySlots, territory, canBuild, buildCost, recruitCost, canRecruit, recruitCells, canResearch, canEra, eraTechs, canFound, sz, techEra, rCost } from "../../../server/strat/econ";
import { leagueOf } from "../../../server/strat/rating";
import { mergeCfg } from "../../../server/strat/cfg";
import { ic, BUILD_ICON, BRANCH_ICON, iconImg } from "./icons";
import { TECH_ICON } from "./tech-icons";
import { esc, modal, choiceDlg, confirmDlg } from "./ui-kit";
import { pasIcon, buildPassive, techPassive, talentPassive, regPassive } from "./passives";
import { bCard, bSprite, bIcon64, isBig, wonderStage, bannerHtml, SLOT, RECRUIT_FRAME, WONDER_NAME, PH_NAME } from "./bldart";
import { cityBld, HS_NAME, W, terrCities, leagueCfg, type BRow } from "./world";
import { terrainImg } from "./art";
import { t2, t2Tint, edgeSet, sideD } from "./t2";
import { capPair } from "./world";
import { redacted, fogView, unveilCls, fogNode, type FogView } from "./fog";

export const KIND_NAME: Record<Kind, string> = { pawn: "Ополченец", knight: "Всадник", mage: "Маг", rook: "Страж", hero: "Герой", king: "Вождь" };
export const ECON_ERR: Record<string, string> = {
  no_gold: "Не хватает золота", no_know: "Не хватает знаний", no_slot: "Нет свободного места под постройку", built: "Уже построено", wrong_race: "Постройка другой расы",
  need_building: "Сначала нужна постройка", need_era: "Нужна следующая эпоха", hero_one: "Герой может быть только один", cell_busy: "Клетка занята", bad_cell: "Сюда не нанять",
  city_acted: "Город уже действовал в этот ход", no_tech: "На этом размере нет технологий", already: "Уже изучено", locked: "Закрыто: выбрана парная технология",
  research_done: "В этот ход уже было исследование", need_techs: "Нужно 2 технологии, изученные в текущей эпохе", max_era: "Последняя эпоха", pawn_only: "Заставу основывает только Ополченец",
  outpost_max: "Застав больше нельзя", too_close: "Слишком близко к другому городу", enemy_land: "Чужая территория", on_structure: "Здесь постройка", no_talent: "Талант пока недоступен",
  bad_talent: "Такого таланта нет", no_ally: "Обмен — только с союзником в режиме 2 на 2", forge_max: "Кузня — не больше 2", bad_city: "Город не найден", capital_only: "Только в столице",
  not_capital: "Только в столице", bad_tech: "Нет такой технологии", one_hero: "Герой может быть только один", pop_cap: "Достигнут предел армии",
  already_built: "Уже построено", bad_kind: "Нельзя для этого типа", need_market: "Нужен Рынок", bad_amount: "Неверное количество", bad_piece: "Фигура не найдена",
  bad_building: "Нет такой постройки", no_gift: "Передача без встречной оплаты запрещена", bad_ratio: "Курс обмена вне 1:2…2:1", too_much: "Больше 30% запаса нельзя", trade_done: "Сделка за ход уже была",
  need_tech: "Нужна технология", path_closed: "Путь закрыт выбором другой технологии",
};
const BR_NAME: Record<string, string> = { war: "Война", econ: "Хозяйство", elem: "Стихия" };
const ERA_ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
export const ERA_NAME = (e: number) => "Эпоха " + (ERA_ROMAN[e] || e);
const RECRUIT: Kind[] = ["pawn", "rook", "knight", "mage", "hero"];
const KIND_ICON: Record<string, string> = { pawn: "boot", rook: "shield", knight: "horse", mage: "spark", hero: "sword", king: "crown" };

export type Ctx = { S: any; G: GameState; me: number; send: (o: any) => void; redraw: () => void; toast: (t: string, k?: any, i?: string) => void; col: (side: number) => string; refresh: () => void };
export const ui = { city: null as number | null, recruit: null as { city: number; kind: Kind } | null, tech: false, cfgKey: "", cfg: STRAT_CFG as StratCfg, tree: null as any[] | null };
export function cfgOf(S: any): StratCfg { ui.tree = Array.isArray(S?.tree?.techs) ? S.tree.techs : null; // r3: урезанное древо сервера (state.tree, ТЗ §14.F) — в клиентской сборке TECHS пуст
  const k = S?.cfgPatch ? JSON.stringify(S.cfgPatch) : ""; if (k !== ui.cfgKey) { ui.cfgKey = k; ui.cfg = k ? mergeCfg(S.cfgPatch) : STRAT_CFG; } return ui.cfg; }
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const sg = (n: number) => (n > 0 ? "+" + n : n < 0 ? String(n) : "±0");
const sizeOf = (G: GameState, cfg: StratCfg) => { try { return sz(G, cfg) || ({} as any); } catch { return {} as any; } };
export const unitArt = (race: string, k: string) => `/strat/art/${race}/${k}_idle.png`;

// ---------- расовые варианты (шаблон + вариант расы: имя/эффект/иконка) ----------
/** Данные с расовым вариантом: obj.races[race] / obj.byRace[race] / obj.variants[race] поверх общего шаблона. */
export function rv<T extends Record<string, any>>(o: T | undefined, race: string): T & { name?: string; eff?: string; icon?: string } {
  if (!o) return {} as any; const v = o.races?.[race] ?? o.byRace?.[race] ?? o.variants?.[race] ?? o.race_?.[race];
  return v && typeof v === "object" ? { ...o, ...v } : o as any;
}
/** Иконка из данных: имя из набора SVG, путь к картинке (арт Художника) или запасная. */
/** Иконка узла технологии: tech_icon_map Художника (96 id) → иконка стихии расы для ветки elem → серверная иконка → ветка. */
export function techIc(n: { id: string; br: string; icon?: any }, race: string): string {
  const t = TECH_ICON[n.id]; if (t) return ic(t);
  if (n.br === "elem" && race) return ic("elem_" + race);
  return dataIcon(n.icon || BRANCH_ICON[n.br] || "spark", BRANCH_ICON[n.br] || "spark");
}
export function dataIcon(icon: any, fallback: string): string {
  if (typeof icon === "string" && /^(\/|https?:)/.test(icon)) return `<img class="ic img" src="${esc(icon)}" alt="">`;
  if (typeof icon === "string" && /^[a-z0-9_]+$/.test(icon)) return ic(icon);
  return ic(fallback);
}
export const bName = (b: string, race: string) => rv((BUILD as any)[b], race).name || (b === "wonder" ? WONDER_NAME[race] || "Великое чудо" : PH_NAME[b] || b);
const bIcon = (b: string, race: string) => { const a = bIcon64(b); if (a) return `<img class="ic img bico" src="${a}" alt="">`; const B = rv((BUILD as any)[b], race); return dataIcon(B.svg ?? (/^[a-z0-9_]+$/.test(B.icon || "") || /^\//.test(B.icon || "") ? B.icon : null), BUILD_ICON[b] || "build"); };

// ---------- модель древа технологий (по данным; новые поля баланса подхватываются, если есть) ----------
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
export type TNode = { id: string; name: string; eff: string; era: number; br: string; req: string[]; excl: string[]; unB: string[]; unK: string[]; icon?: string; raw: Tech; red?: boolean };
/** Источник узлов: урезанное древо с сервера (G.ec.tree[me] / techTree), иначе общий конфиг. */
export function techNodes(race: string, srv?: any[] | null, eraOf?: (t: { id: string; era: number }) => number): TNode[] {
  const E = (id: string, era: any) => { const e = +era || 1; try { return eraOf ? eraOf({ id, era: e }) || e : e; } catch { return e; } };
  if (Array.isArray(srv)) { const L = srv.filter(Boolean);
    return L.map((t: any) => { const u = t.unlocks || {}, red = redacted(t);
    // соперники по группе (TreeView.grp): взял один — остальные закрыты (как techRivals на сервере)
    const rivals = !red && t.grp && t.grp !== "root" ? L.filter((o: any) => o !== t && o.grp === t.grp).map((o: any) => String(o.id)) : [];
    return { id: String(t.id), name: red ? "" : String(t.name), eff: red ? "" : t.eff || "", era: +t.era || 1, br: t.br || "war", req: arr(t.req ?? t.prereq ?? t.requires), // сервер уже отдаёт эпоху лиги (tree-view: techEra)
      excl: [...new Set([...arr(t.excl ?? t.excludes ?? t.locks), ...rivals])], unB: red ? [] : arr(u.b ?? u.buildings ?? t.builds ?? t.unlock), unK: red ? [] : arr(u.k ?? u.units), icon: red ? undefined : t.icon, raw: t, red } as TNode; }); }
  return (TECHS as any[]).filter((t0) => !t0.race || t0.race === race).map((t0) => {
    const sib = (() => { try { return techSibling(t0); } catch { return undefined; } })(), t: any = rv(t0, race), u = t.unlocks || {};
    const excl = new Set([...arr(t.excl ?? t.excludes ?? t.locks), ...(sib && !(t.excl || t.excludes) ? [sib.id] : [])]);
    return { id: t.id, name: t.name, eff: t.eff || "", era: E(t.id, t.era), br: t.br || "war", req: arr(t.req ?? t.prereq ?? t.requires),
      excl: [...excl], unB: arr(u.b ?? u.buildings ?? t.builds), unK: arr(u.k ?? u.units), icon: t.icon, raw: t0 } as TNode;
  });
}
export type TState = "got" | "can" | "later" | "closed";
const srvTree = (G: GameState, me: number): any[] | null => { const ec: any = G.ec; const t = ec?.tree?.[me] ?? ec?.techTree?.[me] ?? ec?.tree ?? ui.tree ?? null; return Array.isArray(t) ? t : null; };
/** t1163: эпоха технологии с поправкой лиги (econ.league[л].techEra — «Чаща» в Обычной с эпохи IV) */
export const leagueEra = (G: GameState, cfg: StratCfg) => (t: { id: string; era: number }) => techEra(G, t as any, cfg);
const LG_NAME: Record<string, string> = { quick: "Быстрая", normal: "Обычная", tactical: "Тактическая" };
/** стоимость узла в знаниях: по эпохе лиги и множителю лиги (как canResearch/applyEcon на сервере) */
const techCost = (G: GameState, cfg: StratCfg, era: number): number | "?" => { const v = cfg.econ.research.cost?.[era]; return v == null ? "?" : rCost(G, cfg, v); };
/** цена узла: с сервера (state.tree уже по лиге — rCost), иначе свой расчёт */
const nodeCost = (G: GameState, cfg: StratCfg, n: TNode): number | "?" => { const c = (n.raw as any)?.cost; return typeof c === "number" && (n.raw as any)?.state ? c : techCost(G, cfg, n.era); };
/** подсказка узла (HTML): эффект + эпоха (с пометкой лиги, если она сдвинута) + цена */
export function techTip(G: GameState, cfg: StratCfg, n: TNode): string {
  // эпоха уже по лиге; пометка — если лига сдвигает этот узел (econ.league[л].techEra); базовую эпоху знаем только без сервера (полное древо)
  const lid = leagueOf(G.size) || "tactical", shifted = (cfg.econ as any).league?.[lid]?.techEra?.[n.id] != null, base = (n.raw as any)?.state ? 0 : +(n.raw as any)?.era || 0;
  const era = `Эпоха ${ERA_ROMAN[n.era] || n.era}` + (shifted ? ` — в лиге «${LG_NAME[lid] || lid}»` + (base && base !== n.era ? ` (обычно эпоха ${ERA_ROMAN[base] || base})` : "") : "");
  const t = String((n.raw as any)?.tip || n.eff || ""); // подсказка вставляется как HTML (ui-kit tipOf) — текст экранируем
  const xs = (n.excl || []).map((id) => xName(id)).filter(Boolean);
  return (t ? esc(t) + "<br>" : "") + `<b>${esc(era)}</b> · ${nodeCost(G, cfg, n)} знаний` + (xs.length ? `<br>⚔ Взаимоисключается с «${xs.map(esc).join("», «")}»: изучите одну — другая закроется навсегда` : "");
}
/** t1221: имена узлов для подсказок «или» (заполняется при отрисовке древа) */
const XN = new Map<string, string>(); const xName = (id: string) => XN.get(id) || "";
/** Видимость узла древа технологий для игрока (туман знаний). */
export function techFog(G: GameState, me: number, n: TNode, st: TState): FogView {
  const have: string[] = (G.ec?.techs?.[me] || []) as any;
  return fogView(st, n.req.every((r) => have.includes(r)), n.era <= (G.ec?.era?.[me] ?? 1), !!(n as any).red);
}
/** состояние узла для стороны: изучено / можно / пока нельзя / закрыто навсегда (+ причина) */
export function techState(G: GameState, me: number, n: TNode, all: TNode[], cfg: StratCfg): { st: TState; why: string } {
  const have: string[] = (G.ec?.techs?.[me] || []) as any; if (have.includes(n.id)) return { st: "got", why: "Изучено" };
  const byId = new Map(all.map((x) => [x.id, x]));
  const closedBy = (x: TNode, seen = new Set<string>()): string | null => {
    if (seen.has(x.id)) return null; seen.add(x.id);
    for (const e of x.excl) if (have.includes(e)) return `выбрано «${byId.get(e)?.name || e}»`;
    for (const o of all) if (have.includes(o.id) && o.excl.includes(x.id)) return `выбрано «${o.name}»`;
    for (const r of x.req) { const R = byId.get(r); if (R && !have.includes(r)) { const w = closedBy(R, seen); if (w) return w; } }
    return null;
  };
  const cl = closedBy(n); if (cl) return { st: "closed", why: "Путь закрыт: " + cl };
  const R: any = n.raw; let err: string | null = null;
  if (R && typeof R.state === "string") { // узел из state.tree: решение сервера (в клиентской сборке нет полного дерева для canResearch)
    if (R.state === "closed") return { st: "closed", why: "Путь закрыт навсегда" };
    err = R.state === "hidden" ? "need_req" : R.err || null;
  } else { try { err = canResearch(G, me, n.raw, cfg); } catch { err = "bad_tech"; } }
  if (!err) return { st: "can", why: "" };
  if (err === "need_era") return { st: "later", why: `Нужна эпоха ${ERA_ROMAN[n.era] || n.era}` };
  const miss = n.req.filter((r) => !have.includes(r)).map((r) => byId.get(r)?.name || r);
  return { st: "later", why: miss.length ? "Сначала: " + miss.join(", ") : ECON_ERR[err] || err };
}
/** Технология, открывающая постройку/фигуру (если баланс так задал), и изучена ли она. */
function gateOf(G: GameState, me: number, kind: "b" | "k", id: string, cfg: StratCfg): { name: string; closed: boolean } | null {
  const nodes = techNodes(G.races[me], srvTree(G, me), leagueEra(G, cfg)); const direct = kind === "b" ? (BUILD as any)[id]?.tech ?? (BUILD as any)[id]?.req : null;
  const n = nodes.find((x) => x.id === direct) || nodes.find((x) => (kind === "b" ? x.unB : x.unK).includes(id)); if (!n) return null;
  const s = techState(G, me, n, nodes, cfg); if (s.st === "got") return null;
  return { name: techFog(G, me, n, s.st) === "show" ? n.name : "?", closed: s.st === "closed" };
}

// ---------- полоса ресурсов ----------
/** Полоса шире места (телефон): справа мягкое затухание — видно, что её можно прокрутить вбок; у правого края затухание убирается. */
function barFade(bar: HTMLElement) {
  const f = () => bar.classList.toggle("ovf", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2);
  bar.onscroll = f; requestAnimationFrame(f);
  if (!bar.dataset.fadeRo) { bar.dataset.fadeRo = "1"; new ResizeObserver(f).observe(bar); }
}
/** Верхняя полоса: золото/знания (+доход), эпоха, кнопки «Технологии» и городов. */
export function renderBar(c: Ctx) {
  const bar = $("#ecbar"); const { G, S, me } = c; const ec = G.ec; if (!bar) return;
  if (!ec || S.phase === "lobby") { bar.innerHTML = ""; bar.hidden = true; return; } bar.hidden = false;
  const cfg = cfgOf(S), side = me < 0 ? G.cur : me, R = ec.res[side], I = ec.inc[side] || { gold: 0, know: 0, glory: 0 }, eras = sizeOf(G, cfg).eras;
  const cnt = (icon: string, v: number, inc: number, tip: string, cls: string) => `<div class="ctr ${cls}" data-tip="${esc(tip)}">${ic(icon)}<b>${v}</b><small class="${inc < 0 ? "neg" : ""}">${sg(inc)}</small></div>`;
  const cities = ec.cities.filter((x) => x.owner === side).map((x) => `<button class="hbtn city ${ui.city === x.id ? "on" : ""}" data-city="${x.id}" data-tip="${esc((x.cap ? "Столица " : "Застава ") + x.name)}">${ic(x.cap ? "castle" : "outpost")}<span>${esc(x.name)}</span></button>`).join("");
  bar.innerHTML = `${cnt("gold", R.gold, I.gold, "Золото — доход за ход " + sg(I.gold), "gold")}${cnt("know", R.know, I.know, "Знания — доход за ход " + sg(I.know), "know")}
    ${eras ? `<div class="era" data-tip="Текущая эпоха">${ic("era")}<span><i class="era-w">Эпоха </i>${ERA_ROMAN[ec.era[side]] || ec.era[side]}</span></div>` : ""}
    <div class="hsep"></div>${cities}${eras ? `<button class="hbtn tech" id="techbtn" data-tip="Древо технологий">${ic("tech")}<span>Технологии</span></button>` : ""}`;
  barFade(bar);
  for (const b of bar.querySelectorAll<HTMLButtonElement>("[data-city]")) b.onclick = () => { ui.city = +b.dataset.city!; ui.recruit = null; c.refresh(); };
  const tb = bar.querySelector<HTMLButtonElement>("#techbtn"); if (tb) tb.onclick = () => { ui.tech = true; renderTech(c); };
  renderCity(c); renderTech(c);
}

// ---------- окно города ----------
/** Постоянное окно (перерисовывается при каждом снимке, пока открыто). */
function persist(id: string, show: boolean, cls: string): HTMLElement | null {
  let el = document.getElementById(id);
  if (!show) { if (el && !el.classList.contains("out")) { el.classList.add("out"); el.classList.remove("in"); setTimeout(() => el!.remove(), 220); } return null; }
  if (!el || el.classList.contains("out")) { el?.remove(); el = document.createElement("div"); el.id = id; el.className = "ovl " + cls; document.getElementById("modals")!.appendChild(el); requestAnimationFrame(() => el!.classList.add("in")); }
  return el;
}
export function renderCity(c: Ctx) {
  const { G, S, me } = c, cfg = cfgOf(S);
  const city = G.ec?.cities.find((x) => x.id === ui.city && x.owner === me);
  if (!city || S.phase !== "play") { ui.city = null; persist("citydlg", false, ""); return; }
  const box = persist("citydlg", true, "citydlg wide")!;
  const my = G.cur === me, slots = citySlots(G, city, cfg), used = city.bld.length, thr = cfg.econ.city.growthThr, race = G.races[me];
  const next = city.cap ? thr[city.lvl] : 0, R = G.ec.res[me];
  const lock = (why: string) => `<span class="lockn">${ic("lock")}${esc(why)}</span>`;
  const units = RECRUIT.filter((k) => k !== "hero" || city.cap).map((k) => {
    let err: string | null = canRecruit(G, me, city, k, cfg); const need = UNLOCK[k], gate = gateOf(G, me, "k", k, cfg);
    let why = err ? ECON_ERR[err] || err : "";
    if (gate) why = gate.name === "?" ? (gate.closed ? "Путь к этой фигуре закрыт" : "Нужна ещё не открытая технология") : gate.closed ? "Путь закрыт: «" + gate.name + "» недоступна" : "Нужна технология «" + gate.name + "»";
    else if (err === "locked" && need) why = (BUILD as any)[need] ? "Нужна постройка: " + bName(need, race) : TECHS.find((t) => t.id === need) ? "Нужна технология «" + TECHS.find((t) => t.id === need)!.name + "»" : why;
    if (k === "hero" && err === "need_era") why = "Откроется в " + ERA_NAME(HERO_ERA);
    const cost = recruitCost(G, city, k, cfg), u = cfg.units[k];
    const st = err === "locked" || gate ? "locked" : err ? "off" : "can";
    return `<button class="ucard rframe ${st} ${ui.recruit?.kind === k ? "on" : ""}" data-k="${k}" ${!my || err ? 'aria-disabled="true"' : ""} style="--rf:url('${RECRUIT_FRAME}')">
      <span class="u-art"><img src="${unitArt(race, k)}" alt="" data-rmerr></span>
      <span class="u-st">${ic("heart")}${u?.hp ?? "?"} ${ic("sword")}${u?.atk ?? "?"} ${ic("shield")}${u?.arm ?? "?"}</span>
      <b>${KIND_NAME[k]}</b>${why ? lock(why) : ""}<em class="${R.gold < cost ? "neg" : ""}">${cost}</em></button>`;
  }).join("");
  const hpRows = cityBld(S, G, city, cfg), hpOf = (b: string) => hpRows.find((r) => r.b === b && !r.ruin);
  const hpTxt = (r?: BRow) => (!r ? "" : r.hp != null ? `<i class="bhp"><u style="width:${Math.min(100, Math.round((r.hp / Math.max(1, r.max || 1)) * 100))}%"></u></i><small>${r.hp}/${r.max}</small>` : r.hs ? `<i class="bhp st3 hs-${r.hs}"><u style="width:${Math.round(((({ ok: 3, hurt: 2, low: 1 } as any)[r.hs] ?? 0) / 3) * 100)}%"></u></i><small class="hs hs-${r.hs}">${HS_NAME[r.hs]}</small>` : ""); // M4: 3 деления
  const lv2 = city.bld.filter((b) => b === "forge").length >= 2, stg = wonderStage(city);
  const card = (b: string) => { const src = bCard(b, race), sp = b === "forge" && lv2 ? bSprite("forge", race, { lv2: true }) : null;
    return src ? `<img class="bs-art ${isBig(b) ? "big" : ""}" src="${sp || src}" alt="">` : `<span class="bs-ph">${bIcon(b, race)}<small>арт позже</small></span>`; };
  const capAll: number[] = city.cap ? (sizeOf(G, cfg).capSlots || []) : [], maxSlots = city.cap ? Math.max(slots, capAll[capAll.length - 1] ?? slots) : slots;
  const lockLv = (i: number) => { const l = capAll.findIndex((v) => v > i); return l >= 0 ? l + 1 : 0; };
  const bl = [...new Set(city.bld)].map((b) => `<span class="bslot on ${isBig(b) ? "wonder" : ""}" data-tip="${esc(rv(BUILD[b] as any, race).eff || "")}">${card(b)}<b>${esc(bName(b, race))}${b === "forge" && lv2 ? " II" : ""}</b>${hpTxt(hpOf(b))}</span>`).join("")
    + (stg && stg < 4 ? `<span class="bslot on wonder build" data-tip="Великое чудо строится"><img class="bs-art big" src="${bSprite("wonder", race, { stage: stg })}" alt=""><b>${esc(bName("wonder", race))}</b><small>стройка ${stg}/3</small></span>` : "")
    + hpRows.filter((r) => r.ruin).map((r) => `<span class="bslot ruin" data-tip="Разрушено — можно восстановить">${card(r.b)}<b>${esc(bName(r.b, race))}</b><small>${ic("burn")}руины</small></span>`).join("")
    + Array.from({ length: Math.max(0, slots - used) }, () => `<span class="bslot empty"><img class="bs-slot" src="${SLOT.empty}" alt=""><small>свободно</small></span>`).join("")
    + Array.from({ length: Math.max(0, maxSlots - Math.max(slots, used)) }, (_, i) => `<span class="bslot locked"><img class="bs-slot" src="${SLOT.locked}" alt=""><small>${lockLv(slots + i) ? "откроется на ур. " + lockLv(slots + i) : "закрыто"}</small></span>`).join("");
  box.innerHTML = `<div class="dlg deco city">
    <div class="dlg-h"><span class="dlg-ic">${ic(city.cap ? "castle" : "outpost")}</span><div><h3 class="cityttl">${bannerHtml(race, city.name || (city.cap ? "Столица" : "Застава"))}</h3>
      <p class="dlg-sub">${city.cap ? (/столиц/i.test(city.name || "") ? "" : "Столица · ") + "уровень " + (city.lvl + 1) : (city as any).set ? "Поселение" : "Застава"} · постройки ${used}/${slots}${city.forge.length ? " · Кузня: " + city.forge.map((k) => KIND_NAME[k]).join(", ") : ""}</p></div>
      <div class="dlg-res"><span>${ic("gold")}<b>${R.gold}</b></span><span>${ic("know")}<b>${R.know}</b></span></div>
      <button class="xbtn" data-x aria-label="Закрыть">${ic("close")}</button></div>
    ${city.cap ? `<div class="growth"><span>Рост</span><div class="meter"><i style="width:${next ? Math.min(100, (city.growth / next) * 100) : 100}%"></i></div><b>${next ? city.growth + "/" + next : "макс."}</b></div>` : ""}
    ${city.acted ? `<div class="warnline">${ic("turn")} Город уже действовал в этот ход — найм и стройка снова на следующем ходу</div>` : !my ? `<div class="warnline">${ic("turn")} Сейчас ход соперника</div>` : ""}
    ${landRow(S, city)}
    <div class="bslots">${bl}</div>
    <p class="cityhint">${ic("build")} Строит Вождь: выберите его на доске и нажмите «Построить».</p>
    <div class="dlg-b">
      <section><h4 class="deco-h">${ic("recruit")}Найм <small>фигура появится на клетке ${city.cap ? "столицы" : "города"}${G.pieces.some((q) => q.x === city.x && q.y === city.y) ? " — она занята, выберите клетку рядом" : ""}</small></h4><div class="ucards">${units}</div></section>
    </div></div>`;
  const close = () => { ui.city = null; ui.recruit = null; c.refresh(); };
  box.querySelector<HTMLElement>("[data-x]")!.onclick = close; box.onclick = (e) => { if (e.target === box) close(); };
  for (const b of box.querySelectorAll<HTMLButtonElement>("[data-k]")) b.onclick = () => { if (b.getAttribute("aria-disabled")) return; const kind = b.dataset.k as Kind;
    // найм — на клетку города; занята — выбор соседней клетки как раньше
    if (!G.pieces.some((q) => q.x === city.x && q.y === city.y)) { c.send({ type: "act", act: { a: "recruit", city: city.id, kind, x: city.x, y: city.y } }); ui.city = null; c.refresh(); return; }
    ui.recruit = { city: city.id, kind }; ui.city = null; c.refresh(); };
  box.querySelector<HTMLElement>("[data-claim]")?.addEventListener("click", () => { W.mode = { k: "claim", city: city.id }; ui.city = null; c.refresh(); });
}

/** Строка прироста земли города (S.terr): таймер до бесплатной клетки и покупка за золото. */
function landRow(S: any, city: any): string {
  const t = terrCities(S).find((q) => q.city === city.id); if (!t) return "";
  const every = t.every || leagueCfg(S).grow || 4, left = t.left ?? Math.max(0, every - (t.tg ?? 0)), fr = Math.min(100, Math.round(((every - left) / Math.max(1, every)) * 100));
  return `<div class="growth land"><span>Земля</span><div class="meter"><i style="width:${fr}%"></i></div><b>${t.ready ? "клетка готова" : "через " + left + " х."}</b>
    ${t.ready && (t.cells || []).length ? `<button class="btn mini gold" data-claim>${ic("plus")}Купить клетку · ${ic("gold")}${t.cost ?? "?"}</button>` : ""}</div>
    ${t.ready ? `<p class="cityhint">${ic("turn")} Не купите — через ${left} х. клетка присоединится бесплатно.</p>` : ""}`;
}

// ---------- древо технологий ----------
export function renderTech(c: Ctx) {
  const { G, S, me } = c, cfg = cfgOf(S), ec = G.ec;
  if (!ui.tech || !ec || S.phase !== "play" || me < 0) { ui.tech = false; persist("techdlg", false, ""); return; }
  const dlg = persist("techdlg", true, "techdlg full")!;
  const eras = sizeOf(G, cfg).eras || 3, my = G.cur === me, race = G.races[me], nodes = techNodes(race, srvTree(G, me), leagueEra(G, cfg));
  const brs = [...new Set(["war", "econ", "elem", ...nodes.map((n) => n.br)])].filter((b) => nodes.some((n) => n.br === b) || b === "elem");
  const maxEra = Math.max(4, eras, ...nodes.map((n) => n.era)); // эпоха IV видна всегда: её узлы скрыты «?», пока сервер их не раскроет
  for (const n of nodes) XN.set(n.id, n.name);
  const card = (n: TNode) => { const { st, why } = techState(G, me, n, nodes, cfg), fv = techFog(G, me, n, st), uv = unveilCls("t" + me, n.id, fv);
    if (fv !== "show") return fogNode(n.id, fv, "tech");
    const un = [...n.unB.map((b) => `<span class="un">${bIcon(b, race)}${esc(bName(b, race))}</span>`), ...n.unK.map((k) => `<span class="un">${ic(KIND_ICON[k] || "recruit")}${esc((KIND_NAME as any)[k] || k)}</span>`)].join("");
    return `<button class="tnode ${st}${uv}" data-t="${n.id}" data-node="${n.id}" data-tip="${esc(techTip(G, cfg, n))}" ${!my || st !== "can" ? 'aria-disabled="true"' : ""}>
      <span class="tn-h">${n.era >= 4 ? `<span class="e4fr ${st === "got" ? "active" : st === "can" ? "" : "locked"}">${techIc(n, race)}</span>` : `<span class="tn-ic">${techIc(n, race)}</span>`}<b>${esc(n.name)}</b>${st === "got" ? `<span class="stamp">${ic("check")}</span>` : st === "closed" ? `<span class="stamp x">${ic("close")}</span>` : ""}</span>
      <small>${esc(n.eff)}</small>${un ? `<span class="uns">${un}</span>` : ""}<span class="pas-row">${pasIcon(techPassive(n.id, cfg, race))}</span>${n.excl?.length ? `<span class="xor" data-xor="${esc(n.excl.join(" "))}">${ic("close")}${st === "closed" ? "закрыто выбором" : st === "got" ? "закрыло" : "закроет"} «${esc(n.excl.map(xName).filter(Boolean).join("», «"))}»</span>` : ""}
      <em>${st === "got" ? "Изучено" : st === "closed" ? esc(why) : st === "later" ? ic("lock") + esc(why) : ic("know") + nodeCost(G, cfg, n)}</em></button>`; };
  const cell = (br: string, era: number) => {
    const ns = nodes.filter((n) => n.br === br && n.era === era);
    if (!ns.length && era >= 4) return `<div class="tcell e4">${[0, 1].map((i) => `${i ? '<span class="and"></span>' : ""}<span class="tnode fog e4q" data-tip="Эпоха IV: узел откроется позже"><span class="e4fr locked"><span class="fogq">?</span></span><small>Эпоха IV</small></span>`).join("")}</div>`;
    if (!ns.length) return `<div class="tcell empty">${br === "elem" && era === 1 ? "Ветвь расы — скоро" : ""}</div>`;
    // узлы, исключающие друг друга, — рядом через «или»
    let h = ""; ns.forEach((n, i) => { if (i) h += ns[i - 1].excl.includes(n.id) || n.excl.includes(ns[i - 1].id) ? `<span class="or"><i>или</i></span>` : `<span class="and"></span>`; h += card(n); });
    return `<div class="tcell">${h}</div>`;
  };
  const eraErr = canEra(G, me, cfg), nextEra = ec.era[me] + 1, eraCost = cfg.econ.research.eraCost?.[nextEra];
  const body = `<div class="tgrid" style="--cols:${brs.length}">
      <div class="tcorner"></div>${brs.map((b) => `<div class="th">${ic(BRANCH_ICON[b] || "spark")}<span>${esc(BR_NAME[b] || b)}</span></div>`).join("")}
      ${Array.from({ length: maxEra }, (_, i) => i + 1).map((e) => `<div class="te ${e <= ec.era[me] ? "now" : ""} ${e > eras ? "hidden-era" : ""}"><span>${ERA_ROMAN[e] || e}</span><small>эпоха</small></div>${brs.map((b) => cell(b, e)).join("")}`).join("")}
      <svg class="tlinks" aria-hidden="true"></svg></div>`;
  const legend = `<div class="tlegend"><span class="lg can"></span>можно изучить<span class="lg got"></span>изучено<span class="lg later"></span>пока недоступно<span class="lg closed"></span>путь закрыт навсегда<span class="lg fog">?</span>ещё не открыто</div>`;
  const keepScroll = dlg.querySelector(".tscroll")?.scrollTop || 0;
  dlg.innerHTML = `<div class="dlg deco techscreen">
    <div class="dlg-h"><span class="dlg-ic">${ic("tech")}</span><div><h3>Древо технологий</h3><p class="dlg-sub">Одно исследование за ход. Выбор навсегда закрывает альтернативный путь.</p></div>
      <div class="dlg-res"><span data-tip="Знания">${ic("know")}<b>${ec.res[me].know}</b></span><span>${ic("era")}<b>${ERA_NAME(ec.era[me])}</b></span></div>
      <button class="xbtn" data-x aria-label="Закрыть">${ic("close")}</button></div>
    <div class="tscroll">${body}</div>
    <div class="dlg-f">${legend}${nextEra <= eras ? `<button class="btn gold big" id="erabtn" ${!my || eraErr ? "disabled" : ""}>${ic("era")}<span>Новая эпоха: ${ERA_ROMAN[nextEra]} · ${ic("know")}${eraCost ?? "?"}</span></button><span class="muted">${eraErr === "need_techs" ? `Технологий эпохи ${ERA_ROMAN[ec.era[me]] || ec.era[me]}: ${eraTechs(G, me, cfg)} из ${cfg.econ.research.need}` : eraErr ? esc(ECON_ERR[eraErr] || eraErr) : `Технологий эпохи: ${eraTechs(G, me, cfg)} из ${cfg.econ.research.need} ✓ · +` + cfg.econ.glory.era + " Славы"}</span>` : ""}</div></div>`;
  const sc = dlg.querySelector<HTMLElement>(".tscroll")!; sc.scrollTop = keepScroll;
  const close = () => { ui.tech = false; persist("techdlg", false, ""); };
  dlg.querySelector<HTMLElement>("[data-x]")!.onclick = close; dlg.onclick = (e) => { if (e.target === dlg) close(); };
  for (const b of dlg.querySelectorAll<HTMLButtonElement>("[data-t]")) b.onclick = () => { if (!b.getAttribute("aria-disabled")) c.send({ type: "act", act: { a: "research", t: b.dataset.t } }); };
  // t1221: наведение/касание узла «или» подсвечивает, какой узел он закроет (и наоборот)
  const xHi = (b: HTMLElement | null) => { dlg.querySelectorAll(".xpart,.xsel").forEach((x) => x.classList.remove("xpart", "xsel")); if (!b) return;
    const ids = (b.querySelector<HTMLElement>("[data-xor]")?.dataset.xor || "").split(" ").filter(Boolean); if (!ids.length) return;
    b.classList.add("xsel"); for (const id of ids) dlg.querySelector(`[data-node="${CSS.escape(id)}"]`)?.classList.add("xpart"); };
  for (const b of dlg.querySelectorAll<HTMLElement>(".tnode[data-node]")) { b.addEventListener("mouseenter", () => xHi(b)); b.addEventListener("mouseleave", () => xHi(null)); b.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") xHi(b); }); b.addEventListener("focus", () => xHi(b)); }
  const eb = dlg.querySelector<HTMLButtonElement>("#erabtn"); if (eb) eb.onclick = () => c.send({ type: "act", act: { a: "era" } });
  requestAnimationFrame(() => { techFit(dlg); techLinks(dlg, nodes); });
}
/** Телефон в ландшафте: древо (ветви — строки) ужимается по высоте, чтобы карточки не резались; не мельче 0.72. */
const techShort = typeof matchMedia === "function" ? matchMedia("(orientation: landscape) and (max-height: 500px)") : null;
function techFit(dlg: HTMLElement) {
  const sc = dlg.querySelector<HTMLElement>(".tscroll"), grid = dlg.querySelector<HTMLElement>(".tgrid"); if (!sc || !grid) return;
  grid.style.zoom = ""; if (!techShort?.matches) return;
  const need = grid.scrollHeight, have = sc.clientHeight; if (need > have + 1) grid.style.zoom = String(Math.max(0.72, Math.floor((have - 4) / need * 100) / 100));
}
/** Линии «требует» между узлами (только если в данных есть req). */
function techLinks(dlg: HTMLElement, nodes: TNode[]) {
  const svg = dlg.querySelector<SVGSVGElement>(".tlinks"), grid = dlg.querySelector<HTMLElement>(".tgrid"); if (!svg || !grid) return;
  const g = grid.getBoundingClientRect(); svg.setAttribute("viewBox", `0 0 ${g.width} ${g.height}`); const z = parseFloat(grid.style.zoom) || 1; svg.style.width = g.width / z + "px"; svg.style.height = g.height / z + "px";
  let h = "";
  for (const n of nodes) for (const r of n.req) {
    const a = grid.querySelector<HTMLElement>(`[data-node="${r}"]`), b = grid.querySelector<HTMLElement>(`[data-node="${n.id}"]`); if (!a || !b) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const x1 = A.left + A.width / 2 - g.left, y1 = A.bottom - g.top, x2 = B.left + B.width / 2 - g.left, y2 = B.top - g.top, my = (y1 + y2) / 2;
    const cls = b.classList.contains("closed") ? "closed" : b.classList.contains("got") ? "got" : "";
    h += `<path class="${cls}" d="M${x1} ${y1} V${my} H${x2} V${y2}"/>`;
  }
  svg.innerHTML = h;
}

// ---------- фигура: уровень, таланты, застава ----------
/** Уровень фигуры 1..5: сервер может прислать p.lv; иначе — по порогам cfg.econ.xp.lv (длина массива задаёт максимум). */
export function pieceLevel(p: Piece, cfg: StratCfg): number { const v = (p as any).lv; if (typeof v === "number") return Math.max(1, Math.min(5, v)); const L = cfg.econ.xp.lv || [], x = p.xp || 0; let lv = 1; for (let i = 2; i < Math.min(L.length, 6); i++) if (x >= L[i]) lv = i; return lv; }
/** Уровень, на котором ждёт выбор (0 — нет). L2 талант, L3 способность, L4 (TBD), L5 ульта — всё карточки «1 из 2». */
export function pendingTalent(p: Piece, cfg: StratCfg): number { const sv = (p as any).pend; if (typeof sv === "number") return sv; const lv = pieceLevel(p, cfg), n = p.tal?.length || 0;
  if (p.kind === "king") return 0; // t1221: у Вождя навыки — из его древа (сервер присылает pend/popts); cfg.talents.king сервер не примет
  return n + 2 <= lv && n + 2 <= 3 && talentOptions(p, cfg, n + 2).length ? n + 2 : 0; }
/** t1221: карты выбора на уровне lv — сервер присылает ровно те, что примет (popts); без сервера — ур. 2 пассивки, ур. 3 умения. */
export function talentOptions(p: Piece, cfg: StratCfg, lv = pendingTalent(p, cfg)): any[] { const so = (p as any).popts; if (Array.isArray(so) && (p as any).pend === lv) return so;
  if (p.kind === "king") return []; return lv === 2 ? ((cfg.talents as any)[p.kind]?.[0] || []) : lv === 3 ? ((cfg as any).unitTree?.[p.kind]?.act || []) : []; }
/** Вид карты таланта: пассив / активная способность / ультимейт. */
export const talKind = (o: any): "pas" | "act" | "ult" => (o?.type === "ult" || o?.ult ? "ult" : o?.type === "active" || o?.active || o?.cd != null ? "act" : "pas");
export const TAL_KIND_NAME = { pas: "Талант", act: "Способность", ult: "Ультимейт" };
export function talName(cfg: StratCfg, k: Kind, id: string) { for (const lv of cfg.talents[k] || []) for (const o of lv as any[]) if (o.id === id) return o.name; return id; }
export function pieceLv(c: Ctx, p: Piece) { const cfg = cfgOf(c.S), lv = pieceLevel(p, cfg), L = cfg.econ.xp.lv; return { lv, xp: p.xp || 0, next: L[lv + 1] as number | undefined, prev: (L[lv] || 0) as number }; }
/** Кнопки действий фигуры для карточки (талант, застава). */
export function pieceActs(c: Ctx, p: Piece): string {
  const { G, S, me } = c, cfg = cfgOf(S); if (!G.ec || p.owner !== me || G.cur !== me) return "";
  let h = ""; const pend = pendingTalent(p, cfg);
  if (pend) h += `<button class="btn gold pulse" data-taldlg>${ic("xp")}<span>Новый уровень ${pend} · выбрать</span></button>`;
  if (p.kind === "pawn" && sizeOf(G, cfg).outposts > 0) { const err = canFound(G, me, p, cfg);
    h += `<button class="btn" data-found ${err || p.acted ? "disabled" : ""} data-tip="${esc(err ? ECON_ERR[err] || err : p.acted ? "Фигура уже действовала" : "Ополченец станет заставой")}">${ic("outpost")}<span>Основать заставу</span></button>`; }
  return h;
}
export function bindPieceActs(c: Ctx, p: Piece, root: HTMLElement) {
  const t = root.querySelector<HTMLButtonElement>("[data-taldlg]"); if (t) t.onclick = () => openTalent(c, p);
  const f = root.querySelector<HTMLButtonElement>("[data-found]"); if (f) f.onclick = async () => { if (await confirmDlg("Основать заставу?", "Ополченец уйдёт с доски, а на его клетке встанет новая застава с собственной территорией.", "Основать", { icon: "outpost" })) c.send({ type: "act", act: { a: "found", id: p.id } }); };
}
export const TAL_ICON = (o: any) => (talKind(o) === "ult" ? "ult" : talKind(o) === "act" ? "zap" : o.ap ? "ap" : o.shot ? "target" : o.hp ? "heart" : o.arm ? "shield" : "sword");
export async function openTalent(c: Ctx, p: Piece) {
  const cfg = cfgOf(c.S), pend = pendingTalent(p, cfg); if (!pend) return;
  if (p.kind === "king") return (window as any).__stratChiefTree?.(); // t1221: Вождь — выбор в его древе
  const opts = talentOptions(p, cfg, pend), tk = talKind(opts[0]);
  const id = await choiceDlg(`${TAL_KIND_NAME[tk]} · ${KIND_NAME[p.kind]} ур. ${pend}`, "Выберите одну из двух карт — вторая сгорит.", opts.map((o) => ({ id: o.id, title: o.name, text: o.eff + (o.cd ? ` · перезарядка ${o.cd} х.` : ""), icon: TAL_ICON(o), attrs: `data-tal="${o.id}" data-pas="${regPassive(talentPassive(o, p.kind))}"` })), "talents");
  if (id) c.send({ type: "act", act: { a: "talent", id: p.id, t: id } });
}

/** Клик по доске в режиме найма: true — клик обработан. Клик по своему городу без фигуры открывает его окно. */
export function boardClick(c: Ctx, x: number, y: number, empty: boolean): boolean {
  const { G, me } = c, cfg = cfgOf(c.S);
  if (ui.recruit) {
    const city = G.ec.cities.find((q) => q.id === ui.recruit!.city);
    if (city && empty && recruitCells(G, city, ui.recruit.kind, cfg).some(([a, b]) => a === x && b === y)) {
      c.send({ type: "act", act: { a: "recruit", city: city.id, kind: ui.recruit.kind, x, y } }); ui.recruit = null; c.refresh(); return true; }
    ui.recruit = null; c.refresh(); if (!empty) return false; return true;
  }
  const city = G.ec?.cities.find((q) => q.x === x && q.y === y && q.owner === me);
  if (city && empty) { ui.city = city.id; c.refresh(); return true; }
  return false;
}

/** Территория, города, клетки найма — только видимая часть доски (v0..v1 — видимые клетки в экранных координатах). */
let terrKey: any = null, terrVal: Int8Array | number[] = [];
export function territoryCached(G: GameState, cfg: StratCfg, key: any) { if (key !== terrKey) { terrKey = key; terrVal = territory(G, cfg) as any; } return terrVal; }
export function drawEcon(ctx: CanvasRenderingContext2D, c: Ctx, cell: number, sx: (x: number) => number, sy: (y: number) => number, T: ArrayLike<number>, vis: (x: number, y: number) => boolean, walls?: () => void) {
  const { G } = c, cfg = cfgOf(c.S); if (!G.ec) return; const n = G.size;
  ctx.save();
  // лёгкая заливка земли; сама граница — стены по городам (world.drawWalls через walls())
  // terrain-v2: territory_fill (штриховка, тон под стеной) + border_* по-«береговому» (только без стен), белые → цвет владельца умножением; нет арта — прежняя заливка
  const px = cell * (devicePixelRatio || 1), flip = sx(1) < sx(0), own = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? -9 : T[y * n + x]);
  const B = (nm: string, o: number, X: number, Y: number) => { const im = t2Tint(nm, c.col(o), px); if (im) ctx.drawImage(im, X, Y, cell + 0.5, cell + 0.5); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = T[y * n + x]; if (o < 0 || !vis(x, y)) continue; const X = sx(x), Y = sy(y);
    const fill = t2Tint("territory_fill", c.col(o), px);
    // t1199: сплошная полупрозрачная заливка цветом владельца (~25%) — сразу видно, какие клетки городские; штриховка поверх — слабее
    ctx.fillStyle = c.col(o) + "40"; ctx.fillRect(X, Y, cell + 0.5, cell + 0.5);
    if (fill) { ctx.globalAlpha = 0.3; ctx.drawImage(fill, X, Y, cell + 0.5, cell + 0.5); ctx.globalAlpha = 1; }
    if (walls) continue; // граница — тонкие стены на гранях (world.drawWalls); border_* внутри клетки не рисуем
    // M6 аудита: где есть стены города (walls-v1), видимая граница — сама стена; border_* — только без стен (нет walls / дальний план)
    // S6b: при стенах border_* тоже рисуется — бледным тоном под стеной (стены ложатся сверху), чтобы край земли читался и между башнями
    if (cell < 7) continue;
    const es = edgeSet((dx, dy) => own(x + dx, y + dy) !== o, flip); if (walls) ctx.globalAlpha = 0.38;
    for (const k of es.corners) B("border_corner_" + k, o, X, Y);
    for (const d of es.sides) if (!es.corners.some((k) => k.includes(d))) B("border_" + d, o, X, Y);
    for (const k of es.inner) B("border_inner_" + k, o, X, Y); ctx.globalAlpha = 1; }
  walls?.();
  // города terrain-v2: столица city_capital_<раса>_lv1..3 (512×256 = 2 клетки, якорь (256,230)) + city_owned_mask в цвет владельца;
  // застава city_outpost_<раса> (256, якорь (128,230)) + флажок terrain-v1 flag_mask; захваченный город — city_captured_overlay
  const races: string[] = (c.S?.g?.races || []);
  for (const ct of [...G.ec.cities].sort((a, b) => sy(a.y) - sy(b.y))) { if (!vis(ct.x, ct.y)) continue; const race = races[ct.owner] || "fire";
    if (ct.cap) { const ox = capPair(G, ct), X0 = (sx(ct.x) + sx(ox)) / 2 + cell / 2, Yb = sy(ct.y) + cell * 0.94, w = cell * 2, k = w / 512;
      const im = t2(`city_capital_${race}_lv${Math.min(3, (ct.lvl || 0) + 1)}`, px * 2);
      if (im) { const L = X0 - 256 * k; ctx.drawImage(im, L, Yb - 230 * k, w, 256 * k);
        const m = t2Tint("city_owned_mask", c.col(ct.owner), px * 2); if (m) ctx.drawImage(m, L, Yb - 230 * k, w, 256 * k);
        if (captured.has(ct.id)) { const ov = t2("city_captured_overlay", px); if (ov) ctx.drawImage(ov, sx(ct.x), sy(ct.y), cell, cell); } } }
    else { const im = t2(`city_outpost_${race}`, px), k = cell / 256, L = sx(ct.x), Tp = sy(ct.y) + cell * 0.94 - 230 * k;
      if (im) { ctx.drawImage(im, L, Tp, cell, cell); const fm = flagMask(c.col(ct.owner)); if (fm) ctx.drawImage(fm, L, Tp, cell, cell);
        if (captured.has(ct.id)) { const ov = t2("city_captured_overlay", px); if (ov) ctx.drawImage(ov, L, sy(ct.y), cell, cell); } } }
  }
  for (const ct of G.ec.cities) { if (!vis(ct.x, ct.y)) continue; // герб города в верхнем правом углу клетки
    const X = sx(ct.x) + cell * 0.7, Y = sy(ct.y) + cell * 0.03, w = cell * 0.27;
    ctx.fillStyle = "#1a1420"; ctx.strokeStyle = c.col(ct.owner); ctx.lineWidth = Math.max(1.5, cell * 0.03);
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + w, Y); ctx.lineTo(X + w, Y + w * 0.8); ctx.lineTo(X + w / 2, Y + w * 1.1); ctx.lineTo(X, Y + w * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    const im = iconImg(ct.cap ? "castle" : "outpost", c.redraw); if (im) ctx.drawImage(im, X + w * 0.14, Y + w * 0.1, w * 0.72, w * 0.72);
    if (ui.city === ct.id) { ctx.strokeStyle = "#f3d27a"; ctx.setLineDash([cell * 0.1, cell * 0.06]); ctx.strokeRect(sx(ct.x) + 2, sy(ct.y) + 2, cell - 4, cell - 4); ctx.setLineDash([]); }
  }
  if (ui.recruit) { const city = G.ec.cities.find((q) => q.id === ui.recruit!.city), t = performance.now() / 300;
    if (city) for (const [x, y] of recruitCells(G, city, ui.recruit.kind, cfg)) { ctx.fillStyle = `rgba(243,210,122,${0.22 + 0.12 * Math.sin(t)})`; ctx.fillRect(sx(x) + 3, sy(y) + 3, cell - 6, cell - 6);
      ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = Math.max(1.5, cell * 0.04); ctx.strokeRect(sx(x) + 3, sy(y) + 3, cell - 6, cell - 6);
      const im = iconImg("plus", c.redraw); if (im) ctx.drawImage(im, sx(x) + cell * 0.3, sy(y) + cell * 0.3, cell * 0.4, cell * 0.4); } }
  ctx.restore();
}

/** Всплывашки событий экономики (поверх доски) — короткий текст для клетки. */
/** города, взятые у противника за эту сессию (сервер не хранит «бывшего владельца») — для city_captured_overlay */
export const captured = new Set<number>();
const fmC = new Map<string, HTMLCanvasElement>();
function flagMask(col: string): HTMLCanvasElement | null { const hit = fmC.get(col); if (hit) return hit; const im = terrainImg("flag_mask"); if (!im) return null;
  const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const x = cv.getContext("2d")!;
  x.drawImage(im, 0, 0); x.globalCompositeOperation = "multiply"; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height); x.globalCompositeOperation = "destination-in"; x.drawImage(im, 0, 0); fmC.set(col, cv); return cv; }
export function econFx(e: any): { txt: string; col: string } | null {
  if (e?.e === "capture" && !e.cap && e.city != null) captured.add(e.city);
  switch (e.e) {
    case "recruit": return { txt: "+ " + (KIND_NAME[e.kind as Kind] || ""), col: "#f3d27a" };
    case "found": return { txt: "Застава!", col: "#f3d27a" };
    case "capture": return { txt: "Город взят", col: "#ff8f6b" };
    case "siege": return { txt: "Осада", col: "#ff8f6b" };
    case "ruin": return { txt: "Добыча", col: "#f3d27a" };
    case "lvl": return { txt: "Ур. " + e.lvl, col: "#f3d27a" };
    case "talent": return { txt: "Талант", col: "#f3d27a" };
  }
  return null;
}
/** Тосты экономики: [текст, вид, иконка]. */
export function econToast(e: any, me: number, G?: GameState): [string, "info" | "good" | "bad" | "turn", string] | null {
  const own = (id: number) => G?.ec?.cities.find((q) => q.id === id)?.owner;
  const race = G?.races?.[me] || "";
  if (e.e === "tech" && e.side === me) return ["Изучено: " + (rv(TECHS.find((t) => t.id === e.t) as any, race).name || e.t), "good", "tech"];
  if (e.e === "era" && e.side === me) return ["Новая эпоха: " + ERA_NAME(e.era), "good", "era"];
  if (e.e === "build" && e.side === me) return ["Построено: " + bName(e.b, race), "good", BUILD_ICON[e.b] || "build"];
  if (e.e === "grow" && own(e.city) === me) return ["Столица выросла: ур. " + ((e.lvl ?? 0) + 1), "good", "castle"];
  if (e.e === "found" && own(e.city) === me) return ["Основана застава", "good", "outpost"];
  if (e.e === "capture" && !e.cap) return [e.by === me ? "Захвачена застава!" : "Соперник захватил вашу заставу", e.by === me ? "good" : "bad", "outpost"];
  return null;
}
