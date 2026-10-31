// t1219: обмен 2×2 — только взаимный, только с союзником. Курс 1:2…2:1, ≤1 сделки за ход на пару, ≤30% запаса (числа — cfg.econ.trade, правятся в админке).
// Предложение — act {a:"trade", to, give, get} в свой ход; ответ союзника — {type:"trade_reply", id, accept} в любой момент. Подарков нет.
import { ic } from "./icons";
import { esc, modal, toast } from "./ui-kit";
import { allies, modeOf } from "./players";

type Res = { gold: number; know: number };
const T0 = { minRatio: 0.5, maxRatio: 2, perTurn: 1, maxShare: 0.3 };
const lim = (S: any) => ({ ...T0, ...(S?.cfgPatch?.econ?.trade || {}), ...(S?.tradeCfg || {}) });
const resTxt = (r: Partial<Res>) => [r.gold ? `${ic("gold")}<b>${r.gold}</b>` : "", r.know ? `${ic("know")}<b>${r.know}</b>` : ""].filter(Boolean).join(" ") || "—";
const allyOf = (S: any, me: number) => (S?.seats || []).findIndex((_: any, i: number) => allies(S, me, i));

/** Проверка на клиенте (те же правила, что validateTrade на сервере; сервер всё равно проверит ещё раз). */
export function tradeErr(S: any, me: number, to: number, give: Res, get: Res): string | null {
  const T = lim(S), r = S?.g?.ec?.res?.[me], r2 = S?.g?.ec?.res?.[to]; if (!r) return "нет данных";
  const a = give.gold + give.know, b = get.gold + get.know;
  if (a <= 0 || b <= 0) return "Подарков нет: обе стороны что-то отдают";
  if (a / b < T.minRatio || a / b > T.maxRatio) return `Курс вне ${fmt(T.minRatio)}…${fmt(T.maxRatio)}`;
  for (const k of ["gold", "know"] as const) if (give[k] > Math.floor(r[k] * T.maxShare)) return `Не больше ${Math.round(T.maxShare * 100)}% своего запаса (${k === "gold" ? "золото" : "знания"} ≤ ${Math.floor(r[k] * T.maxShare)})`;
  for (const k of ["gold", "know"] as const) if (r2 && get[k] > (r2[k] || 0)) return "У союзника столько нет";
  return null;
}
const fmt = (x: number) => (x >= 1 ? `${x}:1` : `1:${Math.round(1 / x)}`);

export function openTradeDlg(S: any, me: number, to: number, send: (m: any) => void) {
  const T = lim(S), r = S.g.ec.res[me], nick = esc(S.seats[to]?.nick || "Союзник");
  const inp = (id: string, max: number, icon: string) => `<label class="tr-in">${ic(icon)}<input type="number" inputmode="numeric" min="0" max="${max}" value="0" id="${id}"><small>≤ ${max}</small></label>`;
  const m = modal({ id: "trade", title: "Обмен с союзником", icon: "gold", cls: "trade small", sub: `${nick} · курс ${fmt(T.minRatio)}…${fmt(T.maxRatio)} · ${T.perTurn} сделка за ход · до ${Math.round(T.maxShare * 100)}% запаса`,
    body: `<div class="tr-grid"><div><span class="lbl">Отдаю</span>${inp("tr-gg", Math.floor(r.gold * T.maxShare), "gold")}${inp("tr-gk", Math.floor(r.know * T.maxShare), "know")}</div>
      <div><span class="lbl">Получаю</span>${inp("tr-tg", S.g.ec.res[to]?.gold ?? 0, "gold")}${inp("tr-tk", S.g.ec.res[to]?.know ?? 0, "know")}</div></div>
      <p class="tr-err muted" id="tr-err">Подарков нет — обмен только встречный.</p>`,
    acts: [{ label: "Отмена", cls: "ghost", val: false }, { label: "Предложить", cls: "gold", val: true, id: "tr-ok", icon: "check" }] });
  const v = (id: string) => Math.max(0, Math.floor(+(m.el.querySelector<HTMLInputElement>("#" + id)!.value || 0)));
  const read = () => ({ give: { gold: v("tr-gg"), know: v("tr-gk") }, get: { gold: v("tr-tg"), know: v("tr-tk") } });
  const upd = () => { const q = read(), e = tradeErr(S, me, to, q.give, q.get), el = m.el.querySelector<HTMLElement>("#tr-err")!; el.textContent = e || "Союзник получит предложение и решит сам."; el.classList.toggle("bad", !!e); m.el.querySelector<HTMLButtonElement>("#tr-ok")!.disabled = !!e; };
  m.el.addEventListener("input", upd); upd();
  m.done.then((ok) => { if (!ok) return; const q = read(); if (tradeErr(S, me, to, q.give, q.get)) return; send({ type: "act", act: { a: "trade", to, give: q.give, get: q.get } }); });
}

const seen = new Set<number>();
/** Панель обмена (2×2): кнопка «Обмен» и входящие/исходящие предложения. */
export function renderTrade(host: HTMLElement, S: any, send: (m: any) => void) {
  let el = document.getElementById("tradedock"); const me = S?.you ?? -1, to = allyOf(S, me);
  const on = modeOf(S) === "2v2" && S?.phase === "play" && me >= 0 && to >= 0 && !S.seats[me]?.out;
  if (!on) { el?.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "tradedock"; el.className = "tradedock"; host.after(el); }
  const offers: any[] = S.offers || [], myTurn = S.g.cur === me, allyOut = !!S.seats[to]?.out, T = lim(S), P = S.g.ec?.tp?.[me < to ? `${me}-${to}` : `${to}-${me}`], done = !!P && P.t === S.g.turn && P.n >= T.perTurn; // лимит сделок пары за ход (econ.ts pairKey)
  for (const o of offers) if (!seen.has(o.id) && o.to === me) { seen.add(o.id); toast(`${S.seats[o.from]?.nick || "Союзник"} предлагает обмен`, "info", "gold"); }
  el.innerHTML = `<div class="td-h">${ic("gold")}<span>Обмен с союзником</span>
      <button class="btn mini gold" id="td-new" ${!myTurn || allyOut || done || offers.some((o) => o.from === me) ? "disabled" : ""} data-tip="${allyOut ? "Союзник выбыл" : done ? "Сделка в этот ход уже была" : myTurn ? "Взаимный обмен: курс и лимиты — в окне" : "Предложить можно в свой ход"}">${ic("plus")}<span>Предложить</span></button></div>`
    + offers.map((o) => `<div class="td-o ${o.to === me ? "in" : "outg"}"><span>${o.to === me ? `${esc(S.seats[o.from]?.nick || "?")} даёт ${resTxt(o.give)} за ${resTxt(o.get)}` : `Вы даёте ${resTxt(o.give)} за ${resTxt(o.get)} — ждём ответа`}</span>
      ${o.to === me ? `<button class="btn mini gold" data-tr="${o.id}" data-ok="1">${ic("check")}<span>Принять</span></button><button class="btn mini ghost" data-tr="${o.id}">${ic("close")}<span>Отказать</span></button>` : `<button class="btn mini ghost" data-tr="${o.id}">${ic("close")}<span>Отозвать</span></button>`}</div>`).join("");
  el.querySelector<HTMLButtonElement>("#td-new")!.onclick = () => openTradeDlg(S, me, to, send);
  el.querySelectorAll<HTMLButtonElement>("[data-tr]").forEach((b) => (b.onclick = () => send({ type: "trade_reply", id: +b.dataset.tr!, accept: !!b.dataset.ok })));
}
