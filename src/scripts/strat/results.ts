// t1236: «Итоги партии» — блок окна конца партии (и повтора из библиотеки): за что и как посчитан рейтинг, опыт, статистика сторон.
// Данные считает сервер один раз (match.ts summary + recordRating → st.sum / лог повтора .sum); здесь только разметка.
import { esc } from "./ui-kit";
import { ic } from "./icons";
import { goalDef, GOALS } from "./goals";
import { LEAGUES } from "./rating";

/** коды причин «без рейтинга» (server/strat/rating.ts unratedReason) → по-русски: что случилось и что сделать, чтобы рейтинг шёл */
export const UNRATED: Record<string, [string, string]> = {
  not_rated_mode: ["Обычная партия", "Рейтинг идёт только в режиме «Рейтинговая» — выберите его при создании партии."],
  bots: ["Партия с ботом", "Против бота рейтинг не меняется; опыт — с понижением и не больше 3 партий в сутки."],
  guests: ["Играл гость", "Рейтинг — только для вошедших в аккаунт у обоих игроков."],
  test_match: ["Тестовая партия", "Партии с тестовыми настройками в рейтинг не идут."],
  map_not_in_pool: ["Карта не в рейтинговом пуле", "Рейтинг — на официальных картах и картах, одобренных модераторами."],
  nonstandard: ["Нестандартное время хода", "В рейтинговой партии время хода — по правилам лиги."],
  solo: ["Нет соперника", "Для рейтинга нужен живой соперник."],
  too_early: ["Партия закончилась слишком рано", "Сдача или неявка до 5-го хода рейтинг не меняют."],
  farm_limit: ["Лимит партий с этим соперником", "С одним соперником в рейтинг идут не больше 3 партий за сутки."],
  size: ["Поле вне лиг", "Для этого размера поля нет рейтинговой лиги."],
};
const LG: Record<string, string> = { quick: "fast", normal: "normal", tactical: "tactic" };
const lgName = (id: string) => LEAGUES.find((l) => l.id === (LG[id] || id))?.name || "";
const num = (v: any, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const f = (v: number, k = 2) => String(Math.round(v * 10 ** k) / 10 ** k).replace(".", ",").replace("-", "−");
const sg = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(Math.round(v));
const minTxt = (m: number) => `${m} мин`;

export type SumSide = { goals: string[]; kills: number; lost: number; chiefKills?: number; cities: number; cells: number; goldIn: number; goldOut: number; techs: number; wonders: number; glory: number; ults: number; units?: number; acts?: number; activeMin?: number; team?: number; place?: number | null; out?: boolean };
export type Sum = { mid?: string; winner: number; reason: string; turns: number; turnLimit?: number; size: number; need?: number; list?: string[] | null; mode?: string; nicks?: string[]; bots?: boolean[]; durMs?: number; sides: SumSide[]; rating?: any; gmode?: string; teams?: number[] };
/** t1243: команды/ничья в итогах (winner — номер команды; ничья: ≤2 команд — 2, «Все» — 100, как server/strat/seats drawCode) */
export const sumTeam = (s: Sum, i: number) => s.teams?.[i] ?? s.sides[i]?.team ?? i;
export const sumDraw = (s: Sum, w = s.winner) => w == null || w === (new Set(s.sides.map((_, i) => sumTeam(s, i))).size > 2 ? 100 : 2);
export const sumWon = (s: Sum, i: number, w = s.winner) => !sumDraw(s, w) && w >= 0 && sumTeam(s, i) === w;
const isFfa = (s: Sum) => new Set(s.sides.map((_, i) => sumTeam(s, i))).size > 2;

/** Разбор изменения рейтинга одного игрока: base × K × ранний × бездействие = итог. */
function rateCard(R: any, me: number, s: Sum): string {
  const T = (i: number) => sumTeam(s, i), mine = s.sides.map((_, i) => i).filter((i) => T(i) === T(me)), foes = s.sides.map((_, i) => i).filter((i) => T(i) !== T(me));
  const gN = (L: number[]) => Math.max(0, ...L.map((i) => s.sides[i]?.goals.length ?? 0)), ffa = isFfa(s), nT = new Set(s.sides.map((_, i) => T(i))).size;
  if (!R || (!R.league && !R.unrated)) return `<div class="rs-card rs-rate wait"><h5>${ic("scales")}Рейтинг</h5><p class="rs-note">Считаем рейтинг…</p></div>`;
  if (R.unrated || !R.league) { const [t, h] = UNRATED[R.unrated] || ["Без рейтинга", ""];
    return `<div class="rs-card rs-rate off"><h5>${ic("scales")}Рейтинг</h5><div class="rs-big none"><b>—</b><span>Без рейтинга</span></div><p class="rs-why"><b>${esc(t)}.</b> ${esc(h)}</p></div>`; }
  const c = R.seats?.[me]; if (!c || c.delta == null) return `<div class="rs-card rs-rate off"><h5>${ic("scales")}Рейтинг</h5><p class="rs-note">Наблюдатель — рейтинг игроков в таблице ниже.</p></div>`;
  const b = c.bd || {}, d = num(c.delta), before = num(c.before, num(c.rating) - d), after = num(c.rating), myG = gN(mine), opG = gN(foes), pl = s.sides[me]?.place;
  const won = b.score > 0.5, lost = b.score < 0.5, rows: [string, string, string?][] = [];
  if (b.exp != null) rows.push([ffa ? "Ожидание по рейтингам (в среднем по соперникам)" : "Ожидание по рейтингам", `${Math.round(b.exp * 100)}% на победу`, ffa ? "«Все»: Elo по местам — с каждым соперником как отдельная партия (выше место — победа, ниже — поражение), среднее по парам" : "Glicko-2: чем сильнее соперник, тем больше даёт победа и меньше отнимает поражение"]);
  if (ffa && pl) rows.push(["Место в партии", `${pl} из ${nT}`, "Победитель — 1; дальше — по порядку выбывания (позже выбыл — выше), сдавшийся — последний"]);
  if (b.base != null) rows.push([won ? "Победа — базовый сдвиг" : lost ? "Поражение — базовый сдвиг" : "Ничья — базовый сдвиг", sg(b.base), "Сдвиг Glicko-2 без множителей: результат против ожидания"]);
  if (b.K != null && b.score !== 0.5) { const dTxt = b.abandon ? `сдача/неявка — как d=${b.d}` : `цели ${myG}–${opG}${mine.length > 1 ? " у команд" : ""}, d=${b.d ?? "?"}`;
    rows.push([`Разница целей (${dTxt})`, `× ${f(b.K)}`, won ? `K = ${f(b.a)} − ${f(b.b)}·d: чем крупнее победа, тем меньше прибавка (разгром слабого не накручивает рейтинг)` : `K = ${f(b.a)} + ${f(b.b)}·d: чем крупнее поражение, тем больше потеря`]); }
  if (b.early != null && b.early !== 1) rows.push(["Ранний конец (до 10-го хода)", `× ${f(b.early)}`]);
  if (b.idle != null && b.idle !== 1) rows.push(["Соперник ничего не делал", `× ${f(b.idle)}`]);
  rows.push(["Итог", sg(d)]);
  const place = c.place ? `Место в лиге: <b>${c.place}</b>${c.total ? ` из ${c.total}` : ""}` : c.left ? `Калибровка: ещё ${c.left} ${c.left === 1 ? "партия" : c.left < 5 ? "партии" : "партий"} до места в таблице` : "";
  return `<div class="rs-card rs-rate"><h5>${ic("scales")}Рейтинг · ${esc(lgName(R.league))} лига</h5>
    <div class="rs-big ${d > 0 ? "up" : d < 0 ? "down" : ""}"><b>${sg(d)}</b><span>${Math.round(before)} → ${Math.round(after)}</span></div>
    <table class="rs-calc">${rows.map(([l, v, t]) => `<tr ${t ? `data-tip="${esc(t)}"` : ""}><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    ${b.base != null && b.K != null ? `<p class="rs-f">${sg(b.base)} × ${f(b.K)}${b.early !== 1 && b.early != null ? ` × ${f(b.early)}` : ""}${b.idle !== 1 && b.idle != null ? ` × ${f(b.idle)}` : ""} = <b>${sg(d)}</b></p>` : ""}
    ${place ? `<p class="rs-note">${place}</p>` : ""}${b.prov ? `<p class="rs-note">Пока идёт калибровка, рейтинг меняется сильнее.</p>` : ""}${R.cfgRev ? `<p class="rs-note" data-tip="Партия считалась по снимку правил на её старте: версия ${+R.cfgRev} из админки">Правила партии: версия ${+R.cfgRev}</p>` : ""}</div>`;
}
const XP_WHY: Record<string, string> = { guest: "Опыт копится только у вошедших в аккаунт.", map: "Карта не официальная и не одобрена — опыта нет.", idle: "Нет активного времени за ходом — опыта нет.", too_early: "Партия закончилась до 5-го хода — опыта нет.", bot_limit: "Лимит партий с ботом на сегодня исчерпан (3 в сутки)." };
function xpCard(R: any, me: number): string {
  const c = R?.seats?.[me], x = c?.xpd; if (!x && c?.xp == null) return "";
  const got = num(x?.got ?? c?.xp), coins = num(c?.coins, 0);
  const parts = x && got > 0 ? [`${x.min} ${x.min === 1 ? "минута" : x.min < 5 && x.min > 1 ? "минуты" : "минут"} за ходом`, `× ${f(x.res)} (${x.res > 1 ? "победа" : x.res < 1 ? "поражение" : "ничья"})`, ...(x.mul != null && x.mul !== 1 ? [`× ${f(x.mul)} (${x.bot ? "партия с ботом" : "ранний конец"})`] : [])] : [];
  return `<div class="rs-card rs-xp"><h5>${ic("xp")}Опыт Полководца</h5><div class="rs-big ${got > 0 ? "up" : "none"}"><b>${got > 0 ? "+" + got : "0"}</b><span>опыта</span></div>
    ${parts.length ? `<p class="rs-f">${parts.map(esc).join(" ")} = <b>+${got}</b></p><p class="rs-note">Опыт — за активное время (до 600 мин), не за рейтинг.</p>` : `<p class="rs-why">${esc(XP_WHY[x?.why] || "Опыта за эту партию нет.")}</p>`}
    ${x?.bot && x.botLeft != null ? `<p class="rs-note">С ботом сегодня ещё ${x.botLeft} ${x.botLeft === 1 ? "партия" : "партии"} с опытом.</p>` : ""}
    ${coins > 0 ? `<p class="rs-coins">${ic("gold")}<b>+${coins}</b> монет за победу в рейтинговой</p>` : ""}</div>`;
}
/** Таблица сторон: строки — показатели, столбцы — игроки (влезает и на телефон). */
function statTable(s: Sum, me: number, nick: (i: number) => string): string {
  const list = s.list?.length ? s.list : GOALS.map((g) => g.id), need = num(s.need, 6);
  const dia = (i: number) => `<span class="rs-gl">${list.map((id) => { const d = goalDef({ id }), on = s.sides[i]?.goals.includes(id); return `<i class="${on ? "on" : ""}" data-tip="${esc(d.name + (on ? " — выполнена" : ""))}">${ic(d.icon)}</i>`; }).join("")}</span><small>${s.sides[i]?.goals.length ?? 0}/${need}</small>`;
  const R: [string, string, (x: SumSide) => string, ((a: SumSide, b: SumSide) => number)?][] = [
    ["Убито фигур", "sword", (x) => String(x.kills), (a, b) => a.kills - b.kills],
    ["Потеряно фигур", "skull", (x) => String(x.lost), (a, b) => b.lost - a.lost],
    ["Городов", "castle", (x) => String(x.cities), (a, b) => a.cities - b.cities],
    ["Клеток земли", "flag", (x) => String(x.cells), (a, b) => a.cells - b.cells],
    ["Золото получено", "gold", (x) => String(Math.round(x.goldIn)), (a, b) => a.goldIn - b.goldIn],
    ["Золото потрачено", "gold", (x) => String(Math.round(x.goldOut))],
    ["Технологий", "tech", (x) => String(x.techs), (a, b) => a.techs - b.techs],
    ["Чудес", "crown", (x) => String(x.wonders), (a, b) => a.wonders - b.wonders],
    ["Слава", "glory", (x) => String(Math.round(x.glory)), (a, b) => a.glory - b.glory],
    ["Ультимейтов", "ult", (x) => String(x.ults)],
    ["Действий", "ap", (x) => String(x.acts ?? 0)],
  ];
  // t1243: все места (2×2 / «Все ×3…×8»): сначала вы, потом союзник, потом соперники (в «Все» — по месту); «лучший» — строго лучше всех остальных
  const T = (i: number) => sumTeam(s, i), ffa = isFfa(s), team = !ffa && s.sides.length > 2, me0 = me >= 0 ? me : 0;
  const cols = s.sides.map((_, i) => i).sort((x, y) => (x === me ? -1 : y === me ? 1 : (T(x) === T(me0)) !== (T(y) === T(me0)) ? (T(x) === T(me0) ? -1 : 1) : ffa ? (s.sides[x]?.place ?? 99) - (s.sides[y]?.place ?? 99) || x - y : T(x) - T(y) || x - y));
  const cls = (i: number, cmp?: (a: SumSide, b: SumSide) => number) => { const A = s.sides[i]; if (!cmp || !A || cols.length < 2) return ""; return cols.every((j) => j === i || !s.sides[j] || cmp(A, s.sides[j]) > 0) ? "best" : ""; };
  const won = (i: number) => sumWon(s, i), td = (i: number, h: string, c = "") => `<td class="${i === me ? "me" : ""} ${team && T(i) === T(me0) && i !== me ? "ally" : ""} ${c}">${h}</td>`;
  const tag = (i: number) => (team ? `<small class="rs-team">${me >= 0 && i !== me && T(i) === T(me) ? "союзник" : `команда ${T(i) + 1}`}</small>` : "");
  const th = (i: number) => `<th class="${i === me ? "me" : ""} ${won(i) ? "win" : ""}">${won(i) ? ic("crown") : ""}<span>${esc(nick(i))}</span>${tag(i)}</th>`;
  const place = ffa ? `<tr class="rs-place"><td>${ic("flag")}Место</td>${cols.map((i) => td(i, s.sides[i]?.place ? `${s.sides[i]!.place}${s.sides[i]!.out ? " · выбыл" : ""}` : "—")).join("")}</tr>` : "";
  return `<div class="rs-scroll"><table class="rs-tab ${cols.length > 2 ? "many" : ""}"><thead><tr><th></th>${cols.map(th).join("")}</tr></thead><tbody>${place}
    <tr class="rs-goals"><td>${ic("target")}Цели</td>${cols.map((i) => td(i, dia(i))).join("")}</tr>
    ${R.map(([l, icon, v, cmp]) => `<tr><td>${ic(icon)}${esc(l)}</td>${cols.map((i) => td(i, esc(s.sides[i] ? v(s.sides[i]) : "—"), cls(i, cmp))).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function resultsHtml(s: Sum, o: { me: number; reason: string; nick: (i: number) => string; rating?: any }): string {
  const R = o.rating ?? s.rating, me = o.me >= 0 ? o.me : 0, mins = s.durMs ? Math.max(1, Math.round(s.durMs / 60000)) : 0;
  const lim = s.turnLimit ? ` из ${s.turnLimit}` : "";
  return `<section class="rs" aria-label="Итоги партии"><h4 class="deco-h rs-h">Итоги партии</h4>
    <p class="rs-out">${ic(sumDraw(s) ? "scales" : "flag")}<span><b>${esc(o.reason)}</b> · ход ${s.turns}${lim}${mins ? ` · ${minTxt(mins)}` : ""}${s.mode === "ranked" ? " · рейтинговая" : " · обычная"}${s.sides.length > 2 ? ` · ${isFfa(s) ? `все против всех ×${s.sides.length}` : "2×2"}` : ""}</span></p>
    <div class="rs-cards">${o.me >= 0 ? rateCard(R, me, s) + xpCard(R, me) : rateCard(R, -1, s)}</div>
    ${statTable(s, o.me, o.nick)}</section>`;
}
