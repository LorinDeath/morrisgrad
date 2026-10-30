// История партии и повторы: просмотр прошлых ходов в партии, список ходов, плеер повтора, «Библиотека партий».
// Серверной части пока нет — формы терпимые (ТЗ §14.G: неизвестные поля игнорируются), всё на догадках:
//   в state:   S.hist? = [{turn, cur, g, ev}]          — если сервер когда-нибудь пришлёт историю сразу;
//   hub (ТЗ §14.I): {type:"lib_list"} → {type:"lib", recent:[ReplayMeta+saved], saved:[ReplayMeta+title], keepDays, saveMax}
//              {type:"lib_save", id, title?} / {type:"lib_unsave", id} → lib | err no_replay/live/lib_full/bad_id/guest
//   HTTP:      GET /strat/replay?id= → {meta, log, moves:{turns,list}, rulesChanged}; &i=N → {n,i,diverged,frame}; &from=A&to=B → {frames:[{i,diverged,frame}]}
//   Item = {id|code|matchId, at|endedAt|ended_at, races[], nicks[]|players[{nick}], winner, turns, league?, saved?}
//   Frame = {turn, cur, g|state|st:{g}, ev|events}
// Без сервера клиент сам пишет кадры текущей партии (каждое состояние = кадр) и хранит их в localStorage.
import { ic } from "./icons";
import { esc } from "./ui-kit";

export type Frame = { turn: number; cur: number; v?: number; g: any; ev: any[]; at: number };
export type LibItem = { id: string; code?: string; at: number; races: string[]; nicks: string[]; winner?: number | null; turns?: number; league?: string; saved?: boolean; local?: boolean; title?: string; rated?: boolean; srv?: boolean };
/** §14.I сервер повторов: idx[k] — номер действия для кадра k (конец полухода), list — действия с dt, div — первое расхождение. */
export type RpInfo = { id: string; n: number; idx: number[]; turns: { turn: number; side: number; from: number; to: number }[]; list: { i: number; side?: number; n?: string; dt?: number; auto?: number }[]; rulesChanged?: boolean; div?: number | null };
export type Rec = LibItem & { you?: number; map?: any; frames: Frame[]; rp?: RpInfo };

const num = (v: any, d = 0) => (Number.isFinite(+v) ? +v : d);
/** Кадры из любого из ожидаемых видов ответа. */
export function framesFrom(x: any): Frame[] {
  const arr = Array.isArray(x) ? x : x?.frames || x?.turns || x?.hist || x?.log || x?.replay?.frames || x?.replay?.turns || [];
  if (!Array.isArray(arr)) return [];
  return arr.map((f: any): Frame | null => { const g = f?.g || f?.frame?.g || f?.state?.g || f?.st?.g || f?.state || null; if (!g?.pieces) return null;
    const ev = f.ev ?? f.frame?.ev ?? f.events; return { turn: num(f.turn ?? g.turn, 1), cur: num(f.cur ?? g.cur), v: f.v ?? g.v, g, ev: Array.isArray(ev) ? ev : [], at: num(f.at ?? f.t, 0) }; }).filter(Boolean) as Frame[];
}
export function itemFrom(x: any, saved?: boolean): LibItem | null {
  const id = String(x?.id ?? x?.matchId ?? x?.match_id ?? x?.code ?? ""); if (!id) return null;
  const nicks = Array.isArray(x.nicks) ? x.nicks.map(String) : Array.isArray(x.players) ? x.players.map((p: any) => String(p?.nick ?? p ?? "?")) : [];
  return { id, code: x.code, at: num(x.at ?? x.endedAt ?? x.ended_at ?? x.startedAt, Date.now()), races: Array.isArray(x.races) ? x.races.map(String) : [], nicks,
    winner: x.winner ?? null, turns: x.turns != null ? num(x.turns) : undefined, league: x.league, saved: saved ?? !!x.saved, title: x.title ? String(x.title).slice(0, 60) : undefined, rated: !!x.rated, srv: true };
}
export function libFrom(x: any): { saved: LibItem[]; recent: LibItem[]; keepDays?: number; saveMax?: number } | null {
  if (!x || x.err) return null;
  // §14.I lib: {recent:[ReplayMeta+saved], saved:[ReplayMeta+title]} — «Недавние» остаются недавними, флаг saved лишь отмечает звёздочку
  const L = (a: any, sv?: boolean) => (Array.isArray(a) ? a : []).map((i: any) => itemFrom(i, sv)).filter(Boolean) as LibItem[];
  const list = L(x.list); return { saved: [...L(x.saved, true), ...list.filter((i) => i.saved)], recent: [...L(x.recent), ...list.filter((i) => !i.saved)], keepDays: num(x.keepDays) || undefined, saveMax: num(x.saveMax) || undefined };
}

// ---------- запись кадров (клиент) ----------
const MAX_FRAMES = 1500;
export class Recorder {
  code = ""; frames: Frame[] = []; map: any = null; preN = 0; private src: any = null;
  reset(code: string) { this.code = code; this.frames = []; this.map = null; this.src = null; this.preN = 0; }
  /** Кадр без карты (она одна на партию) — память не растёт от карты в каждом кадре. */
  push(code: string, g: any, ev: any[]) {
    if (!g?.pieces) return; if (code && code !== this.code) this.reset(code); if (g === this.src) return; this.src = g;
    if (g.map) this.map = g.map;
    const last = this.frames[this.frames.length - 1], f: Frame = { turn: num(g.turn, 1), cur: num(g.cur), v: g.v, g: { ...g, map: undefined }, ev: ev || [], at: Date.now() };
    if (last && g.v != null && last.v === g.v) { this.frames[this.frames.length - 1] = { ...f, ev: [...last.ev, ...f.ev] }; return; }
    this.frames.push(f); const cut = this.frames.length - MAX_FRAMES; if (cut > 0) { this.frames.splice(1, cut); if (this.preN > 1) this.preN = Math.max(1, this.preN - cut); }
  }
  /** Кадры от сервера (S.hist, при входе в идущую партию) — дополняем начало, своё не трогаем. */
  merge(code: string, F: Frame[]) {
    if (!F.length) return; if (code && code !== this.code) this.reset(code);
    const first = this.frames[0], older = first ? F.filter((f) => f.turn < first.turn || (f.turn === first.turn && f.cur < first.cur)) : F;
    if (older.length) this.frames = [...older.map((f) => ({ ...f, g: { ...f.g, map: undefined } })), ...this.frames];
    if (!this.map) this.map = F.find((f) => f.g?.map)?.g.map || null;
  }
  /** §14.I WS frame: кадры с сервера до первого своего (вход в идущую партию, переподключение), по номеру действия. Возвращает сдвиг индексов. */
  setPre(code: string, P: Frame[]): number {
    if (code && code !== this.code) this.reset(code); const own = this.frames.slice(this.preN), d = P.length - this.preN;
    this.frames = [...P.map((f) => ({ ...f, g: { ...f.g, map: undefined } })), ...own]; this.preN = P.length; if (!this.map) this.map = P.find((f) => f.g?.map)?.g.map || null; return d;
  }
  /** Последний кадр каждого полухода (ход N, сторона) — шаги «назад/вперёд» идут по ним. */
  turnMarks(): number[] { const out: number[] = []; this.frames.forEach((f, i) => { const nx = this.frames[i + 1]; if (!nx || nx.turn !== f.turn || nx.cur !== f.cur) out.push(i); }); return out; }
}

// ---------- локальная библиотека ----------
const LS = "strat.lib.v1", MAX_SAVED = 12, MAX_RECENT = 6;
type LsLib = { recs: Rec[] };
function lsGet(): LsLib { try { const j = JSON.parse(localStorage.getItem(LS) || "{}"); return { recs: Array.isArray(j.recs) ? j.recs : [] }; } catch { return { recs: [] }; } }
/** Без карты в каждом кадре (она одна на партию) — иначе localStorage не вместит. */
function pack(r: Rec): Rec { const map = r.map || r.frames[0]?.g?.map; return { ...r, map, frames: r.frames.map((f) => ({ ...f, g: { ...f.g, map: undefined } })) }; }
export function unpack(r: Rec): Rec { return { ...r, frames: r.frames.map((f) => ({ ...f, g: { ...f.g, map: f.g.map || r.map } })) }; }
export function lsPut(r: Rec): boolean {
  const L = lsGet(); L.recs = L.recs.filter((x) => x.id !== r.id); L.recs.unshift(pack(r));
  const saved = L.recs.filter((x) => x.saved).slice(0, MAX_SAVED), recent = L.recs.filter((x) => !x.saved).slice(0, MAX_RECENT); L.recs = [...saved, ...recent];
  for (let k = 0; k < 6; k++) { try { localStorage.setItem(LS, JSON.stringify(L)); return true; } catch { const i = L.recs.map((x) => !!x.saved).lastIndexOf(false); if (i >= 0 && L.recs[i].id !== r.id) L.recs.splice(i, 1); else L.recs.pop(); } }
  return false;
}
export const lsList = (): LibItem[] => lsGet().recs.map(({ frames, map, ...it }) => ({ ...it, turns: it.turns ?? frames[frames.length - 1]?.turn, local: true }));
export const lsGetRec = (id: string): Rec | null => { const r = lsGet().recs.find((x) => x.id === id); return r ? unpack(r) : null; };
export function lsDel(id: string) { const L = lsGet(); L.recs = L.recs.filter((x) => x.id !== id); try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} }

// ---------- события: строка списка ходов и «почему» ----------
export type EvCtx = { nick: (side: number) => string; pieceName: (p: any) => string; cityName: (id: number) => string; bName: (b: string, side: number) => string; techName: (id: string) => string; me: number };
const pc = (g: any, id: number) => g?.pieces?.find((p: any) => p.id === id);
/** Короткая строка события (null — не показывать в списке). side — чьё действие (для цвета). */
export function evLine(e: any, before: any, after: any, c: EvCtx): { txt: string; icon: string; side?: number; x?: number; y?: number; why?: boolean } | null {
  const P = (id: number) => pc(before, id) || pc(after, id), nm = (id: number) => { const p = P(id); return p ? c.pieceName(p) : "фигура"; };
  const side = (id: number) => P(id)?.o;
  switch (e?.e) {
    case "move": { const p = P(e.id); return { txt: `${nm(e.id)} → ${colName(e.x)}${(after?.size || before?.size || 8) - e.y}`, icon: "boot", side: p?.o, x: e.x, y: e.y }; }
    case "hit": case "zap": { const t = P(e.t); return { txt: `${nm(e.id)} бьёт ${t ? c.pieceName(t) : "цель"}: −${e.dmg}`, icon: e.e === "zap" ? "bolt" : "sword", side: side(e.id), x: t?.x, y: t?.y, why: true }; }
    case "kill": return { txt: `${nm(e.id)} пал`, icon: "skull", side: e.by != null ? side(e.by) : undefined, why: false };
    case "burn": return { txt: `${nm(e.id)} горит: −${e.dmg}`, icon: "burn", side: undefined, why: true };
    case "heal": return { txt: `${nm(e.id)} лечится: +${e.n}`, icon: "heart", side: side(e.id) };
    case "bhit": return { txt: `Удар по постройке «${c.bName(e.b, -1)}»: −${e.dmg}`, icon: "anvil", side: side(e.id), why: true };
    case "bcounter": return { txt: `Ответный удар постройки: −${e.dmg}`, icon: "shield", why: true };
    case "bdestroy": return { txt: `Разрушено: ${c.bName(e.b, e.owner)}`, icon: "burn", side: e.by };
    case "build": return { txt: e.tower ? "Вождь ставит сторожевую башню" : `Постройка: ${c.bName(e.b, -1)}`, icon: "build", side: e.side ?? side(e.by) };
    case "recruit": return { txt: `Найм: ${c.pieceName({ k: e.kind, kind: e.kind, o: P(e.id)?.o })} в «${c.cityName(e.city)}»`, icon: "recruit", side: P(e.id)?.o };
    case "tech": return { txt: `${c.nick(e.side)} изучает «${c.techName(e.t)}»`, icon: "tech", side: e.side };
    case "capture": return { txt: `Город «${c.cityName(e.city)}» захвачен`, icon: "flag", side: e.by };
    case "found": return { txt: "Основано поселение", icon: "outpost", x: e.x, y: e.y };
    case "tcap": return { txt: "Захвачена клетка земли", icon: "flag", side: e.by, x: e.x, y: e.y };
    case "tgrow": return { txt: `«${c.cityName(e.city)}»: +клетка земли`, icon: "flag", side: e.owner, x: e.x, y: e.y };
    case "ult": return { txt: `${c.nick(e.side)}: ${e.name || "ульта"}`, icon: "ult", side: e.side, x: e.x, y: e.y };
    case "goal": return { txt: `${c.nick(e.side)} выполняет цель (${e.n})`, icon: "check", side: e.side };
    case "chief_down": return { txt: `Пал Вождь ${e.name || ""}`.trim(), icon: "skull", side: e.side };
    case "lvl": return { txt: `${nm(e.id)}: уровень ${e.lvl}`, icon: "xp", side: side(e.id) };
    case "promote": return { txt: `${nm(e.id)} превращается`, icon: "crown", side: side(e.id) };
    case "era": return { txt: `${c.nick(e.side)}: эпоха ${e.era}`, icon: "era", side: e.side };
    case "timeout": case "skip": return { txt: `${c.nick(e.side)}: ход пропущен`, icon: "clock", side: e.side };
    case "end": return { txt: "Партия окончена", icon: "crown", side: e.winner };
    default: return null;
  }
}
const colName = (x: number) => "abcdefghijklmnopqrstuvwxyz"[x] || String(x + 1);

/** Разбор «почему столько»: сервер (догадка) e.why|e.parts|e.src = [{label|name|src, n|v}]; иначе — по статам фигур до удара. */
export function evWhy(e: any, before: any, c: EvCtx, passives?: (p: any) => string[]): { title: string; rows: [string, string][]; foot?: string } | null {
  const W = e?.why; if (W && typeof W === "object" && !Array.isArray(W) && (Array.isArray(W.atk) || Array.isArray(W.arm))) return whyObj(e, W, c);
  const srv = e?.why || e?.parts || e?.src;
  if (Array.isArray(srv) && srv.length) return { title: whyTitle(e), rows: srv.map((r: any) => [String(r.label ?? r.name ?? r.src ?? "?"), sgn(r.n ?? r.v ?? r.dmg)] as [string, string]), foot: e.dmg != null ? `Итог: −${e.dmg}` : undefined };
  const a = pc(before, e.id), t = pc(before, e.t);
  if ((e.e === "hit" || e.e === "zap") && a) { const rows: [string, string][] = [];
    const atk = num(a.atk), ea = num(a.ea, atk); rows.push([`Атака: ${c.pieceName(a)}`, String(atk)]); if (ea !== atk) rows.push(["Бонусы атаки (пассивки, техно, постройки)", sgn(ea - atk)]);
    if (t) { const arm = num(t.arm), er = num(t.er, arm); rows.push([`Броня: ${c.pieceName(t)}`, "−" + arm]); if (er !== arm) rows.push(["Бонусы брони (рельеф, стена, аура)", er > arm ? "−" + (er - arm) : "+" + (arm - er)]); }
    for (const s of passives?.(a) || []) rows.push(["Пассивка атакующего", s]); for (const s of (t && passives?.(t)) || []) rows.push(["Пассивка цели", s]);
    return { title: whyTitle(e), rows, foot: `Итог: −${e.dmg}${e.hp != null ? ` · осталось ${e.hp} ОЗ` : ""}` }; }
  if (e.e === "burn") return { title: "Поджог", rows: [["Горение (раса Огня)", "−" + e.dmg]], foot: e.hp != null ? `Осталось ${e.hp} ОЗ` : undefined };
  if (e.e === "bhit") return { title: "Удар по постройке", rows: [["Атака фигуры", "−" + e.dmg], ...(e.max ? [["Прочность", `${e.hp}/${e.max}`] as [string, string]] : [])] };
  if (e.e === "bcounter") return { title: "Ответный удар", rows: [["Стена/башня бьёт в ответ", "−" + e.dmg]], foot: e.hp != null ? `Осталось ${e.hp} ОЗ` : undefined };
  return null;
}
// ТЗ §14.I: why = {atk:[Part], arm:[Part], cover, mul, el, pow, dmg, min1, shield, on, via?, ult?, chiefMul?, raw?, spare?}; Part = {k, n, src, side}
const ATK_K: Record<string, string> = { base: "Атака фигуры", race: "Раса", forge: "Кузница", atk: "Технология: атака", atkK: "Атака Вождя", atkEnemyT: "На чужой земле", auraAtk: "Аура атаки", slayer: "Убийца", ambush: "Засада", fury: "Ярость", rime: "Иней",
  volley: "Залп", ult: "Ульта", era: "Рост с эпохой", ultPow: "Сила ульты (техн.)", wonderUlt: "Чудо: ульта", hidden: "Скрытые бонусы" };
const ARM_K: Record<string, string> = { base: "Броня цели", race: "Раса", guard: "Стража", arm: "Технология: броня", armK: "Броня Вождя", auraArm: "Аура брони", founding: "Основание города", watchtower: "Сторожевая башня", formation: "Строй",
  armKing2: "Рядом с Вождём", armOwnT: "На своей земле", armOutside: "Вне своей земли", wall: "Стена", hidden: "Скрытые бонусы" };
const ON_K: Record<string, string> = { burn: "поджог", chill: "обморожение", chain: "цепная молния", lvl: "новый уровень", kill: "убийство", heal: "лечение" };
function whyObj(e: any, W: any, _c: EvCtx): { title: string; rows: [string, string][]; foot?: string } {
  const rows: [string, string][] = [], pn = (p: any) => num(p?.n);
  for (const p of W.atk || []) if (pn(p) || p.k === "base") rows.push([ATK_K[p.k] || String(p.k), p.k === "base" || p.k === "ult" || p.k === "volley" ? String(pn(p)) : sgn(pn(p))]);
  for (const p of W.arm || []) if (pn(p) || p.k === "base") rows.push([ARM_K[p.k] || String(p.k), pn(p) > 0 ? "−" + pn(p) : "+" + Math.abs(pn(p))]);
  if (num(W.cover)) rows.push(["Укрытие (рельеф)", "−" + num(W.cover)]);
  if (W.mul != null && num(W.mul, 1) !== 1) rows.push([`Стихии${Array.isArray(W.el) ? "" : ""}`, "×" + num(W.mul, 1)]);
  if (num(W.pow)) rows.push(["Мощь", sgn(num(W.pow))]);
  if (W.chiefMul != null) rows.push(["Множитель по Вождю", "×" + num(W.chiefMul, 1)]);
  if (num(W.shield)) rows.push(["Щит поглотил", "+" + num(W.shield)]);
  const notes = [W.min1 ? "сработал минимум 1" : "", W.spare ? "Вождь оставлен с 1 ОЗ" : "", ...(Array.isArray(W.on) ? W.on.map((k: any) => ON_K[String(k)] || String(k)) : [])].filter(Boolean);
  const dmg = W.dmg ?? e.dmg, title = W.via === "volley" ? "Залп" : W.via === "ult" || e.ult ? "Ульта" : whyTitle(e);
  return { title, rows, foot: `Итог: −${num(dmg)}${e.hp != null ? ` · осталось ${e.hp} ОЗ` : ""}${notes.length ? " · " + notes.join(", ") : ""}` };
}
const sgn = (v: any) => { const n = +v; return Number.isFinite(n) ? (n > 0 ? "+" + n : String(n)) : String(v ?? ""); };
const whyTitle = (e: any) => (e.e === "zap" ? "Разряд" : e.e === "hit" ? "Удар" : e.e === "bhit" ? "Удар по постройке" : "Почему так");
export function whyHtml(w: { title: string; rows: [string, string][]; foot?: string }): string {
  return `<b>${esc(w.title)}</b><table class="whytab">${w.rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="${/^[+]/.test(v) ? "up" : /^[−-]/.test(v) ? "down" : ""}">${esc(v)}</td></tr>`).join("")}</table>${w.foot ? `<small>${esc(w.foot)}</small>` : ""}`;
}

// ---------- разметка ----------
export function viewBarHtml(o: { turn: number; side: string; live: boolean; replay: boolean; idx: number; max: number; playing: boolean; speed: number; canSave: boolean; saved: boolean; warn?: string[] }): string {
  const sp = [0, 0.5, 1, 2, 4]; // 0 — «как было» (по dt действий)
  return `<div class="hv-l">${ic("rp_hist")}<span class="hv-t">${o.replay ? "Повтор" : "Просмотр"} · ход <b>${o.turn}</b></span><small class="hv-s"></small></div>${o.warn?.length ? `<span class="hv-w" role="note">${ic("warn")}<span>${o.warn.map(esc).join(" · ")}</span></span>` : ""}
    <div class="hv-c"><button class="hv-b" data-hv="first" aria-label="В начало" data-tip="В начало">${ic("rp_start")}</button><button class="hv-b" data-hv="prev" aria-label="Ход назад" data-tip="Назад (←)">${ic("rp_back")}</button>
    ${o.replay ? `<button class="hv-b play" data-hv="play" aria-label="${o.playing ? "Пауза" : "Воспроизвести"}" data-tip="${o.playing ? "Пауза" : "Воспроизвести"} (пробел)">${ic(o.playing ? "rp_pause" : "rp_play")}</button>` : ""}
    <button class="hv-b" data-hv="next" aria-label="Ход вперёд" data-tip="Вперёд (→)">${ic("rp_fwd")}</button><button class="hv-b" data-hv="last" aria-label="${o.replay ? "В конец" : "К игре"}" data-tip="${o.replay ? "В конец" : "К текущему ходу"}">${ic("rp_end")}</button></div>
    <input class="hv-scrub" type="range" min="0" max="${Math.max(0, o.max)}" value="${o.idx}" aria-label="Ход партии">
    ${o.replay ? `<div class="hv-sp" role="group" aria-label="Скорость">${sp.map((s) => `<button class="hv-spb ${s === o.speed ? "on" : ""}" data-sp="${s}" ${s ? "" : `data-tip="Скорость как в партии — по времени каждого действия"`}>${s ? s + "×" : "как было"}</button>`).join("")}</div>` : ""}
    ${o.canSave ? `<button class="btn sm ${o.saved ? "" : "gold"}" data-hv="save" ${o.saved ? "disabled" : ""}>${ic("rp_save")}<span>${o.saved ? "Сохранено" : "Сохранить"}</span></button>` : ""}
    ${o.replay ? `<button class="btn sm ghost" data-hv="close">${ic("close")}<span>Закрыть</span></button>` : `<button class="btn sm gold" data-hv="live">${ic("arrow")}<span>К игре</span></button>`}`;
}
export function libHtml(lib: { saved: LibItem[]; recent: LibItem[]; keepDays?: number; saveMax?: number } | null, d: { crest: (r: string) => string; loading?: boolean; offline?: boolean }): string {
  if (d.loading) return `<div class="emptyrow">${ic("clock")}<span>Загрузка партий…</span></div>`;
  const row = (it: LibItem) => { const dt = new Date(it.at), when = `${dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    return `<div class="lib-row ${it.saved ? "saved" : ""}" data-id="${esc(it.id)}"><span class="lib-cr">${it.races.slice(0, 4).map((r) => d.crest(r)).join("")}</span>
      <div class="lib-b"><b class="lib-n" data-i="${esc(it.id)}"></b><small>${esc(when)}${it.turns ? ` · ${it.turns} ход.` : ""}${it.local ? " · на этом устройстве" : ""}</small></div>
      <button class="btn sm" data-lib="open" data-id="${esc(it.id)}">${ic("rp_play")}<span>Смотреть</span></button>${it.saved ? `<button class="btn sm ghost" data-lib="del" data-id="${esc(it.id)}" aria-label="Удалить" data-tip="Убрать из сохранённых">${ic("close")}</button>` : `<button class="btn sm ghost" data-lib="save" data-id="${esc(it.id)}" aria-label="Сохранить" data-tip="Сохранить в библиотеку">${ic("rp_save")}</button>`}</div>`; };
  const sec = (t: string, L: LibItem[], empty: string) => `<div class="lib-h">${esc(t)} <small>${L.length}</small></div>${L.length ? L.map(row).join("") : `<div class="emptyrow">${ic("book")}<span>${esc(empty)}</span></div>`}`;
  return `<div class="lib">${d.offline ? `<p class="lib-note">${ic("warn")}<span>Сервер повторов пока не отвечает — показаны партии, записанные на этом устройстве.</span></p>` : ""}
    ${sec("Сохранённые" + (lib?.saveMax ? ` · до ${lib.saveMax}` : ""), lib?.saved || [], "Нажмите «Сохранить» в конце партии или в просмотре ходов")}${sec("Недавние" + (lib?.keepDays ? ` · хранятся ${lib.keepDays} дн.` : ""), lib?.recent || [], "Сыгранные партии появятся здесь")}</div>`;
}
