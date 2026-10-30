// Этап 2 — панели экономики (вариант C, без лишнего): полоса ресурсов, замок/застава, древо технологий, таланты, «Основать заставу»,
// территория и города на доске. Все проверки — тем же движком, что и на сервере (server/strat/econ.ts); сервер всё равно проверяет сам.
import { STRAT_CFG, type GameState, type Piece, type Kind, type StratCfg } from "../../../server/strat/rules";
import { TECHS, BUILD, techSibling, UNLOCK, HERO_ERA, type BuildId, type Tech } from "../../../server/strat/econ-cfg";
import { citySlots, territory, canBuild, buildCost, recruitCost, canRecruit, recruitCells, canResearch, canEra, canFound, pendingTalent, pieceLevel, sz, type City } from "../../../server/strat/econ";
import { mergeCfg } from "../../../server/strat/cfg";

export const KIND_NAME: Record<Kind, string> = { pawn: "Ополченец", knight: "Всадник", mage: "Маг", rook: "Страж", hero: "Герой", king: "Вождь" };
export const ECON_ERR: Record<string, string> = {
  no_gold: "Не хватает золота", no_know: "Не хватает знаний", no_slot: "Нет свободного места под постройку", built: "Уже построено", wrong_race: "Постройка другой расы",
  need_building: "Сначала нужна постройка", need_era: "Нужна следующая эпоха", hero_one: "Герой может быть только один", cell_busy: "Клетка занята", bad_cell: "Сюда не нанять",
  city_acted: "Город уже действовал в этот ход", no_tech: "На этом размере нет технологий", already: "Уже изучено", locked: "Закрыто: выбрана парная технология",
  research_done: "В этот ход уже было исследование", need_techs: "Нужно 2 технологии текущей эпохи", max_era: "Последняя эпоха", pawn_only: "Заставу основывает только Ополченец",
  outpost_max: "Застав больше нельзя", too_close: "Слишком близко к другому городу", enemy_land: "Чужая территория", on_structure: "Здесь постройка", no_talent: "Талант пока недоступен",
  bad_talent: "Такого таланта нет", no_ally: "Обмен — только с союзником в режиме 2 на 2", forge_max: "Кузня — не больше 2", bad_city: "Город не найден", capital_only: "Только в столице",
  not_capital: "Только в столице", bad_tech: "Нет такой технологии", one_hero: "Герой может быть только один", pop_cap: "Достигнут предел армии",
  already_built: "Уже построено", bad_kind: "Нельзя для этого типа", need_market: "Нужен Рынок", bad_amount: "Неверное количество", bad_piece: "Фигура не найдена",
  bad_building: "Нет такой постройки", no_gift: "Передача без встречной оплаты запрещена", bad_ratio: "Курс обмена вне 1:2…2:1", too_much: "Больше 30% запаса нельзя", trade_done: "Сделка за ход уже была",
};
const BR_NAME: Record<string, string> = { war: "⚔ Война", econ: "⚖ Хозяйство", elem: "✦ Стихия" };
const ERA_NAME = ["", "Эпоха I", "Эпоха II", "Эпоха III"];
const RECRUIT: Kind[] = ["pawn", "rook", "knight", "mage", "hero"];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type Ctx = { S: any; G: GameState; me: number; send: (o: any) => void; redraw: () => void; toast: (t: string) => void; col: (side: number) => string };
export const ui = { city: null as number | null, recruit: null as { city: number; kind: Kind } | null, tech: false, cfgKey: "", cfg: STRAT_CFG as StratCfg };
export function cfgOf(S: any): StratCfg { const k = S?.cfgPatch ? JSON.stringify(S.cfgPatch) : ""; if (k !== ui.cfgKey) { ui.cfgKey = k; ui.cfg = k ? mergeCfg(S.cfgPatch) : STRAT_CFG; } return ui.cfg; }
const $ = (s: string) => document.querySelector(s) as HTMLElement;

/** Полоса ресурсов над доской: золото/знания (+доход), Слава обеих сторон к порогу, эпоха, кнопки «Технологии» и городов. */
export function renderBar(c: Ctx) {
  const bar = $("#ecbar"); const { G, S, me } = c; const ec = G.ec; if (!bar) return;
  if (!ec || S.phase === "lobby") { bar.hidden = true; return; } bar.hidden = false;
  const cfg = cfgOf(S), side = me < 0 ? G.cur : me, R = ec.res[side], I = ec.inc[side] || { gold: 0, know: 0, glory: 0 }, eras = sz(G, cfg).eras, thr = S.g.glory || 0;
  const sg = (n: number) => (n > 0 ? "+" + n : n < 0 ? String(n) : "±0");
  const gl = [0, 1].map((i) => { const v = ec.res[i].glory, pct = thr ? Math.min(100, (v / thr) * 100) : 0;
    return `<div class="gl ${i === me ? "mine" : ""}" title="Слава: ${v}${thr ? " из " + thr : ""}"><span>${i === me ? "Вы" : "Соп."}</span><em><i style="width:${pct}%;background:${c.col(i)}"></i></em><b>${v}${thr ? "/" + thr : ""}</b></div>`; }).join("");
  const cities = ec.cities.filter((x) => x.owner === side).map((x) => `<button class="btn sm ghost ecity ${ui.city === x.id ? "on" : ""}" data-city="${x.id}">${x.cap ? "🏰" : "⛺"} ${esc(x.name)}</button>`).join("");
  bar.innerHTML = `<div class="res"><span title="Золото (доход за ход)">🪙 <b>${R.gold}</b> <small>${sg(I.gold)}</small></span>
    <span title="Знания (доход за ход)">📜 <b>${R.know}</b> <small>${sg(I.know)}</small></span>
    ${eras ? `<span class="era" title="Эпоха">${ERA_NAME[ec.era[side]] || ""}</span>` : ""}</div>
    ${thr ? `<div class="glory"><span class="gs" title="Слава — победа при достижении порога">⭐</span>${gl}</div>` : ""}
    <div class="ebtns">${cities}${eras ? `<button class="btn sm ghost" id="techbtn">📜 Технологии</button>` : ""}</div>`;
  for (const b of bar.querySelectorAll<HTMLButtonElement>("[data-city]")) b.onclick = () => { ui.city = ui.city === +b.dataset.city! ? null : +b.dataset.city!; ui.recruit = null; renderCity(c); renderBar(c); c.redraw(); };
  const tb = bar.querySelector<HTMLButtonElement>("#techbtn"); if (tb) tb.onclick = () => { ui.tech = true; renderTech(c); };
  renderCity(c); if (ui.tech) renderTech(c);
}

/** Карточка города: рост, места под постройки, карточки построек, найм (фишка → клетка на доске). */
export function renderCity(c: Ctx) {
  const box = $("#citycard"); if (!box) return; const { G, S, me } = c, cfg = cfgOf(S);
  const city = G.ec?.cities.find((x) => x.id === ui.city && x.owner === me);
  if (!city || S.phase !== "play") { box.hidden = true; ui.city = null; return; } box.hidden = false;
  const my = G.cur === me, slots = citySlots(G, city, cfg), used = city.bld.length, thr = cfg.econ.city.growthThr;
  const next = city.cap ? thr[city.lvl] : 0, grow = city.cap ? (next ? `рост ${city.growth}/${next} → ур. ${city.lvl + 2}` : "макс. уровень") : "застава";
  const cards = (Object.keys(BUILD) as BuildId[]).filter((b) => !BUILD[b].race || BUILD[b].race === G.races[me]).map((b) => {
    const B = BUILD[b], has = city.bld.includes(b) && b !== "forge", err = has ? "built" : canBuild(G, me, city, b, cfg, b === "forge" ? "rook" : undefined), cost = buildCost(G, me, b, cfg);
    return `<button class="bcard ${has ? "have" : ""}" data-b="${b}" ${!my || err ? "disabled" : ""} title="${esc(err && !has ? ECON_ERR[err] || err : B.eff)}">
      <span class="ic">${B.icon}</span><b>${B.name}</b><small>${esc(B.eff)}</small><em>${has ? "✓" : "🪙 " + cost}</em></button>`; }).join("");
  const chips = RECRUIT.filter((k) => k !== "hero" || city.cap).map((k) => {
    const err = canRecruit(G, me, city, k, cfg), need = UNLOCK[k];
    const why = err === "locked" && need ? "Нужна постройка: " + BUILD[need as BuildId].name : err ? ECON_ERR[err] || err : "";
    const lock = k === "hero" && err === "need_era" ? ` · с эпохи ${HERO_ERA}` : "";
    return `<button class="chip ${ui.recruit?.kind === k && ui.recruit.city === city.id ? "on" : ""}" data-k="${k}" ${!my || err ? "disabled" : ""} title="${esc(why + lock)}">${err === "locked" ? "🔒 " : ""}${KIND_NAME[k]} <small>🪙${recruitCost(G, city, k, cfg)}</small></button>`; }).join("");
  const forge = city.forge.length ? ` · Кузня: ${city.forge.map((k) => KIND_NAME[k]).join(", ")}` : "";
  box.innerHTML = `<div class="ch"><b>${city.cap ? "🏰" : "⛺"} ${esc(city.name)}</b> <span class="muted">${city.cap ? "ур. " + (city.lvl + 1) + " · " : ""}${grow}</span><button class="btn sm ghost x" data-close>✕</button></div>
    ${city.cap && next ? `<div class="bar"><i style="width:${Math.min(100, (city.growth / next) * 100)}%"></i></div>` : ""}
    <div class="muted">Постройки ${used}/${slots}${city.bld.length ? ": " + city.bld.map((b) => BUILD[b].icon + " " + BUILD[b].name).join(", ") : ""}${forge}${city.acted ? " · <span class=warn>город уже действовал в этот ход</span>" : ""}</div>
    <div class="sub">Найм <span class="muted">— выберите фигуру, затем клетку рядом с городом</span></div><div class="chips">${chips}</div>
    <div class="sub">Строительство</div><div class="bcards">${cards}</div>`;
  box.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () => { ui.city = null; ui.recruit = null; renderCity(c); renderBar(c); c.redraw(); };
  for (const b of box.querySelectorAll<HTMLButtonElement>("[data-k]")) b.onclick = () => { const k = b.dataset.k as Kind; ui.recruit = ui.recruit?.kind === k ? null : { city: city.id, kind: k }; renderCity(c); c.redraw(); };
  for (const b of box.querySelectorAll<HTMLButtonElement>("[data-b]")) b.onclick = () => {
    const id = b.dataset.b as BuildId; let kind: Kind | undefined;
    if (id === "forge") { const a = prompt("Кузня: какому типу +1 АТК? (ополченец / страж / всадник / маг / герой / вождь)", "страж") || ""; if (!a) return;
      kind = (Object.keys(KIND_NAME) as Kind[]).find((k) => KIND_NAME[k].toLowerCase().startsWith(a.trim().toLowerCase().slice(0, 3))) || "rook"; }
    c.send({ type: "act", act: { a: "build", city: city.id, b: id, ...(kind ? { kind } : {}) } });
  };
}

/** Окно технологий: 3 ветви × эпохи, в ячейке пара «или-или». */
export function renderTech(c: Ctx) {
  const dlg = $("#techdlg"); if (!dlg) return; const { G, S, me } = c, cfg = cfgOf(S), ec = G.ec;
  if (!ui.tech || !ec) { dlg.hidden = true; return; } dlg.hidden = false;
  const eras = sz(G, cfg).eras, my = G.cur === me, race = G.races[me], have = ec.techs[me] || [];
  const cell = (br: string, era: number) => {
    const pair = TECHS.filter((t) => t.br === br && t.era === era && (!t.race || t.race === race));
    if (!pair.length) return `<div class="tcell empty muted">${br === "elem" ? "ветвь расы — позже" : ""}</div>`;
    return `<div class="tcell">${pair.map((t) => { const got = have.includes(t.id), sib = techSibling(t), lock = !!sib && have.includes(sib.id), err = canResearch(G, me, t, cfg);
      const st = got ? "got" : lock ? "lock" : err ? "off" : "can";
      return `<button class="tech ${st}" data-t="${t.id}" ${!my || err ? "disabled" : ""} title="${esc(got ? "изучено" : err ? ECON_ERR[err] || err : "изучить за 📜 " + cfg.econ.research.cost[t.era])}"><b>${t.name}</b><small>${esc(t.eff)}</small>${got ? "<em>✓</em>" : lock ? "<em>✕</em>" : `<em>📜${cfg.econ.research.cost[t.era]}</em>`}</button>`; }).join('<span class="or">или</span>')}</div>`;
  };
  const eraErr = canEra(G, me, cfg), nextEra = ec.era[me] + 1;
  dlg.innerHTML = `<div class="tdlg card"><div class="ch"><b>Технологии</b> <span class="muted">📜 ${ec.res[me].know} · ${ERA_NAME[ec.era[me]]} · одно исследование за ход; из пары можно взять только одну</span><button class="btn sm ghost x" data-close>✕</button></div>
    <div class="tgrid" style="grid-template-columns: 70px repeat(3, 1fr)"><div></div>${["war", "econ", "elem"].map((b) => `<div class="th">${BR_NAME[b]}</div>`).join("")}
    ${[1, 2, 3].filter((e) => e <= eras).map((e) => `<div class="te ${e <= ec.era[me] ? "" : "muted"}">${ERA_NAME[e]}</div>${["war", "econ", "elem"].map((b) => cell(b, e)).join("")}`).join("")}</div>
    ${nextEra <= eras ? `<div class="row"><button class="btn sm gold" id="erabtn" ${!my || eraErr ? "disabled" : ""}>Новая эпоха: ${ERA_NAME[nextEra]} · 📜${cfg.econ.research.eraCost[nextEra]}</button><span class="muted">${eraErr ? ECON_ERR[eraErr] || eraErr : "+" + cfg.econ.glory.era + " Славы"}</span></div>` : ""}</div>`;
  dlg.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () => { ui.tech = false; dlg.hidden = true; };
  dlg.onclick = (e) => { if (e.target === dlg) { ui.tech = false; dlg.hidden = true; } };
  for (const b of dlg.querySelectorAll<HTMLButtonElement>("[data-t]")) b.onclick = () => c.send({ type: "act", act: { a: "research", t: b.dataset.t } });
  const eb = dlg.querySelector<HTMLButtonElement>("#erabtn"); if (eb) eb.onclick = () => c.send({ type: "act", act: { a: "era" } });
}

/** Доп. строка в карточке выбранной фигуры: уровень, таланты (выбор), «Основать заставу». */
export function pieceExtra(c: Ctx, p: Piece): string {
  const { G, S, me } = c, cfg = cfgOf(S); if (!G.ec) return "";
  const lv = pieceLevel(p, cfg), L = cfg.econ.xp.lv, nx = L[lv + 1];
  let h = `<div class="pext">Ур. ${lv}${nx ? ` · опыт ${p.xp || 0}/${nx}` : ""}${p.tal?.length ? " · " + p.tal.map((t) => talName(cfg, p.kind, t)).join(", ") : ""}</div>`;
  if (p.owner !== me || G.cur !== me) return h;
  const pend = pendingTalent(p, cfg);
  if (pend) { const opts = cfg.talents[p.kind]?.[pend - 2] || [];
    h += `<div class="tal">⭐ Талант ур. ${pend}: ${opts.map((o: any) => `<button class="btn sm gold" data-tal="${o.id}" title="${esc(o.eff)}">${o.name} <small>${esc(o.eff)}</small></button>`).join(" или ")}</div>`; }
  if (p.kind === "pawn" && sz(G, cfg).outposts > 0) { const err = canFound(G, me, p, cfg);
    h += `<div class="row"><button class="btn sm" data-found ${err || p.acted ? "disabled" : ""}>⛺ Основать заставу</button><span class="muted">${err ? ECON_ERR[err] || err : p.acted ? "фигура уже действовала" : "Ополченец станет заставой"}</span></div>`; }
  return h;
}
function talName(cfg: StratCfg, k: Kind, id: string) { for (const lv of cfg.talents[k] || []) for (const o of lv as any[]) if (o.id === id) return o.name; return id; }
export function bindPieceExtra(c: Ctx, p: Piece) {
  for (const b of document.querySelectorAll<HTMLButtonElement>("#info [data-tal]")) b.onclick = () => c.send({ type: "act", act: { a: "talent", id: p.id, t: b.dataset.tal } });
  const f = document.querySelector<HTMLButtonElement>("#info [data-found]"); if (f) f.onclick = () => confirm("Основать заставу? Ополченец уйдёт с доски.") && c.send({ type: "act", act: { a: "found", id: p.id } });
}

/** Клик по доске в режиме найма: true — клик обработан. Клик по своему городу без фигуры открывает его карточку. */
export function boardClick(c: Ctx, x: number, y: number, empty: boolean): boolean {
  const { G, me } = c, cfg = cfgOf(c.S);
  if (ui.recruit) {
    const city = G.ec.cities.find((q) => q.id === ui.recruit!.city);
    if (city && empty && recruitCells(G, city, ui.recruit.kind, cfg).some(([a, b]) => a === x && b === y)) {
      c.send({ type: "act", act: { a: "recruit", city: city.id, kind: ui.recruit.kind, x, y } }); ui.recruit = null; return true; }
    ui.recruit = null; renderCity(c); c.redraw(); if (!empty) return false; return true;
  }
  const city = G.ec?.cities.find((q) => q.x === x && q.y === y && q.owner === me);
  if (city && empty) { ui.city = city.id; renderBar(c); c.redraw(); return true; }
  return false;
}

/** Территория (лёгкая заливка + граница), города, клетки найма. sx/sy — экранные координаты клетки. */
export function drawEcon(ctx: CanvasRenderingContext2D, c: Ctx, cell: number, sx: (x: number) => number, sy: (y: number) => number) {
  const { G } = c, cfg = cfgOf(c.S); if (!G.ec) return; const n = G.size, T = territory(G, cfg);
  ctx.save();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = T[y * n + x]; if (o < 0) continue;
    ctx.fillStyle = c.col(o) + "30"; ctx.fillRect(sx(x), sy(y), cell, cell);
    ctx.strokeStyle = c.col(o) + "cc"; ctx.lineWidth = Math.max(1.5, cell * 0.035); ctx.beginPath();
    const edge = (dx: number, dy: number) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= n || Y >= n || T[Y * n + X] !== o; };
    const X0 = sx(x), Y0 = sy(y), fl = c.S.you === 1; // при перевороте доски стороны клетки меняются местами
    const L = fl ? edge(1, 0) : edge(-1, 0), Rr = fl ? edge(-1, 0) : edge(1, 0), U = fl ? edge(0, 1) : edge(0, -1), D = fl ? edge(0, -1) : edge(0, 1);
    if (L) { ctx.moveTo(X0, Y0); ctx.lineTo(X0, Y0 + cell); } if (Rr) { ctx.moveTo(X0 + cell, Y0); ctx.lineTo(X0 + cell, Y0 + cell); }
    if (U) { ctx.moveTo(X0, Y0); ctx.lineTo(X0 + cell, Y0); } if (D) { ctx.moveTo(X0, Y0 + cell); ctx.lineTo(X0 + cell, Y0 + cell); }
    ctx.stroke(); }
  for (const ct of G.ec.cities) { // знамя города в верхнем правом углу клетки
    const X = sx(ct.x) + cell * 0.72, Y = sy(ct.y) + cell * 0.04, w = cell * 0.24;
    ctx.fillStyle = "#1a1014cc"; ctx.strokeStyle = c.col(ct.owner); ctx.lineWidth = Math.max(1.5, cell * 0.03);
    ctx.beginPath(); ctx.roundRect?.(X, Y, w, w, w * 0.2); ctx.fill(); ctx.stroke();
    ctx.font = `${Math.round(w * 0.72)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(ct.cap ? "🏰" : "⛺", X + w / 2, Y + w / 2 + 1);
    if (ui.city === ct.id) { ctx.strokeStyle = "#ffd76a"; ctx.setLineDash([cell * 0.1, cell * 0.06]); ctx.strokeRect(sx(ct.x) + 2, sy(ct.y) + 2, cell - 4, cell - 4); ctx.setLineDash([]); }
  }
  if (ui.recruit) { const city = G.ec.cities.find((q) => q.id === ui.recruit!.city);
    if (city) for (const [x, y] of recruitCells(G, city, ui.recruit.kind, cfg)) { ctx.fillStyle = "#ffd76a40"; ctx.fillRect(sx(x) + 3, sy(y) + 3, cell - 6, cell - 6);
      ctx.fillStyle = "#ffd76a"; ctx.font = `${Math.round(cell * 0.3)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("+", sx(x) + cell / 2, sy(y) + cell / 2); } }
  ctx.restore();
}

/** Всплывашки событий экономики (поверх доски) — короткий текст для клетки. */
export function econFx(e: any): { txt: string; col: string } | null {
  switch (e.e) {
    case "recruit": return { txt: "+ " + (KIND_NAME[e.kind as Kind] || ""), col: "#ffd76a" };
    case "found": return { txt: "⛺ застава", col: "#ffd76a" };
    case "capture": return { txt: "🏳 город взят", col: "#ff8f6b" };
    case "siege": return { txt: "⚔ осада", col: "#ff8f6b" };
    case "ruin": return { txt: "руины: добыча", col: "#ffd76a" };
    case "lvl": return { txt: "★ ур. " + e.lvl, col: "#ffd76a" };
    case "talent": return { txt: "⭐ талант", col: "#ffd76a" };
  }
  return null;
}
export function econToast(e: any, me: number): string | null {
  if (e.e === "tech" && e.side === me) return "Изучено: " + (TECHS.find((t) => t.id === e.t)?.name || e.t);
  if (e.e === "era" && e.side === me) return "Новая эпоха: " + ERA_NAME[e.era];
  if (e.e === "build" && e.side === me) return "Построено: " + (BUILD[e.b as BuildId]?.name || e.b);
  if (e.e === "grow" && e.side === me) return "Столица выросла: ур. " + ((e.lvl ?? 0) + 1);
  return null;
}
