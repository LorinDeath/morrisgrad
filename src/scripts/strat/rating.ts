// Рейтинг: три лиги по размеру карты, Glicko-подобный рейтинг в каждой. Только отображение — расчёт на сервере (балансовый воркер).
// Протокол (догадка до ТЗ §14): hub → {type:"rating_get", rq} ← {type:"rating_get_r", leagues:{fast|normal|tactic:{r, rd, games, w, l, d, peak, prov}}}
//   hub {type:"top_get", league:"fast"} → {list:[{nick, r, rd, games, w, l, d, prov}]}; итог партии: S.result.rating[side] = {league, before, after, delta}; S.ranked.
import { ic } from "./icons";
import { esc, modal } from "./ui-kit";

export type LeagueId = "fast" | "normal" | "tactic";
export const LEAGUES: { id: LeagueId; name: string; sizes: string; icon: string }[] = [
  { id: "fast", name: "Быстрая", sizes: "до 8×8", icon: "clock" },
  { id: "normal", name: "Обычная", sizes: "9×9 — 15×15", icon: "sword" },
  { id: "tactic", name: "Тактическая", sizes: "больше 15×15", icon: "scales" },
];
export const leagueOf = (n: number): LeagueId => (n <= 8 ? "fast" : n <= 15 ? "normal" : "tactic");
export const leagueName = (n: number) => LEAGUES.find((l) => l.id === leagueOf(n))!.name;
export type LStat = { r: number; rd?: number; games: number; w: number; l: number; d: number; peak?: number; prov?: boolean };
const fmtR = (r: number) => String(Math.round(r));
/** Временная оценка: мало партий или большое RD. */
const isProv = (s: LStat) => s.prov ?? (s.games < 10 || (s.rd ?? 0) > 110);

/** Бейдж лиги: рамка-ромб, рейтинг, партии, W/L/D, пик, «?» временного рейтинга. */
export function leagueBadge(id: LeagueId, s: LStat | null | undefined): string {
  const L = LEAGUES.find((x) => x.id === id)!;
  if (!s || !s.games) return `<div class="lbadge empty l-${id}"><span class="lb-ic">${ic(L.icon)}</span><b>${L.name}</b><span class="lb-r">—</span><small>нет партий</small></div>`;
  const prov = isProv(s);
  return `<div class="lbadge l-${id} ${prov ? "prov" : ""}" data-tip="${esc(`${L.name} лига (${L.sizes}). ${prov ? "Рейтинг временный: сыграйте ещё партий, чтобы он устоялся." : `Точность ±${Math.round((s.rd ?? 50) * 2)}.`}`)}">
    <span class="lb-ic">${ic(L.icon)}</span><b>${L.name}</b><span class="lb-r">${fmtR(s.r)}${prov ? "<em>?</em>" : ""}</span>
    <small>${s.games} парт. · <span class="w">${s.w}</span>/<span class="l">${s.l}</span>/<span class="d">${s.d}</span></small>${s.peak ? `<small class="pk">пик ${fmtR(s.peak)}</small>` : ""}</div>`;
}
export function profileHtml(ls: Partial<Record<LeagueId, LStat>> | null): string {
  return `<div class="profile"><div class="pf-h">${ic("user")}<b class="pf-nick"></b><button class="btn sm ghost" data-prof>${ic("user")}<span>Профиль</span></button><button class="btn sm ghost" data-top>${ic("glory")}<span>Таблицы лиг</span></button></div>
    <div class="lbadges">${LEAGUES.map((l) => leagueBadge(l.id, ls?.[l.id])).join("")}</div>${ls ? "" : `<small class="muted">Рейтинг появится после первой рейтинговой партии.</small>`}</div>`;
}
/** Экран таблиц лиг. */
export async function openLeaderboard(get: (league: LeagueId) => Promise<any>, myNick: string, start: LeagueId = "fast") {
  const m = modal({ id: "topdlg", title: "Таблицы лиг", icon: "glory", cls: "topdlg", body: `<div class="ltabs">${LEAGUES.map((l) => `<button class="ltab" data-l="${l.id}">${ic(l.icon)}<span>${l.name}</span><small>${l.sizes}</small></button>`).join("")}</div><div class="ltable"></div>` });
  const tbl = m.el.querySelector<HTMLElement>(".ltable")!;
  const load = async (id: LeagueId) => {
    m.el.querySelectorAll<HTMLElement>(".ltab").forEach((b) => b.classList.toggle("on", b.dataset.l === id)); tbl.innerHTML = `<div class="emptyrow">${ic("clock")}<span>Загрузка…</span></div>`;
    const j: any = await get(id).catch(() => null);
    const list: any[] = j?.list || []; if (!list.length) { tbl.innerHTML = `<div class="emptyrow">${ic("glory")}<span>В этой лиге пока нет рейтинговых партий</span></div>`; return; }
    tbl.innerHTML = `<div class="lrow h"><span>#</span><span>Игрок</span><span>Рейтинг</span><span>Партии</span><span>П/П/Н</span></div>` + list.slice(0, 100).map((p, i) =>
      `<div class="lrow ${i < 3 ? "top" + (i + 1) : ""}"><span class="pos">${i + 1}</span><span class="nk"></span><span class="rt">${fmtR(p.r)}${isProv(p) ? "<em>?</em>" : ""}</span><span>${+p.games || 0}</span><span><i class="w">${+p.w || 0}</i>/<i class="l">${+p.l || 0}</i>/<i class="d">${+p.d || 0}</i></span></div>`).join("");
    tbl.querySelectorAll<HTMLElement>(".lrow:not(.h)").forEach((el, i) => { el.querySelector(".nk")!.textContent = String(list[i].nick || "?").slice(0, 24); if (list[i].nick === myNick) el.classList.add("me"); });
  };
  m.el.querySelectorAll<HTMLButtonElement>(".ltab").forEach((b) => (b.onclick = () => load(b.dataset.l as LeagueId))); load(start);
  return m;
}
/** Строка изменения рейтинга на экране итогов: «+18», «−12». */
export function ratingDelta(rt: any): string {
  if (!rt || typeof rt.delta !== "number") return ""; const d = Math.round(rt.delta), L = LEAGUES.find((l) => l.id === rt.league);
  return `<div class="rdelta ${d > 0 ? "up" : d < 0 ? "down" : ""}"><small>${L ? L.name + " лига" : "Рейтинг"}</small><b>${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</b><span>${fmtR(rt.before ?? 0)} → ${fmtR(rt.after ?? 0)}</span></div>`;
}

/** Панель «Лиги сезона» в лобби: три медальона (текущая лига подсвечена) и топ-5 лиги карты с вашим местом. */
export function lobbyLeagueHtml(cur: LeagueId, list: any[] | null, myNick: string): string {
  const L = LEAGUES.find((l) => l.id === cur)!;
  const meds = LEAGUES.map((l) => `<div class="llmed ${l.id === cur ? "on" : ""}"><img src="/strat/ui2/leagues/league_${l.id}.png" alt=""><b>${l.name}</b><small>${l.sizes}</small></div>`).join("");
  let rows = "";
  if (!list) rows = `<div class="emptyrow">${ic("clock")}<span>Загрузка…</span></div>`;
  else if (!list.length) rows = `<div class="emptyrow">${ic("glory")}<span>В этой лиге пока нет рейтинговых партий</span></div>`;
  else { const top = list.slice(0, 5), mi = list.findIndex((p) => p.nick === myNick), show = mi >= 5 ? [...top.slice(0, 4), list[mi]] : top;
    rows = show.map((p) => { const i = list.indexOf(p), d = Math.round(+p.delta || 0);
      return `<div class="llrow ${i < 3 ? "top" + (i + 1) : ""} ${p.nick === myNick ? "me" : ""}"><span class="pos">${i + 1}</span><span class="nk" data-i="${i}"></span><b>${fmtR(p.r)}${isProv(p) ? "<em>?</em>" : ""}</b>${d ? `<span class="dl ${d > 0 ? "up" : "down"}"><img src="/strat/ui2/leagues/rating_${d > 0 ? "up" : "down"}.png" alt="">${d > 0 ? "+" : "−"}${Math.abs(d)}</span>` : "<span></span>"}</div>`; }).join(""); }
  return `<h3 class="llh">Лиги сезона</h3><div class="llmeds">${meds}</div><h4 class="llsub">Топ · ${L.name.toLowerCase()} лига</h4><div class="lltab">${rows}</div>`;
}
