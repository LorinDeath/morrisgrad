// Игровой профиль: публичная статистика и личная вкладка (только владелец).
// Протокол (догадка до серверной части): hub {type:"profile_get", nick?} → {
//   nick, own:boolean (сервер сам решает, чей профиль — по сессии),
//   races:{<race>:{games, wins}}, leagues:{fast|normal|tactic: LStat},
//   priv?:{ techs:[{id,name,n}], chiefLv:{<lv>:n}, chiefsLeveled:n, recordChiefKills:{n, turn?, race?}, talents:[{name,n}], ults:[{kind,name,n}] }
// }. Поле priv сервер присылает только владельцу; клиент показывает вкладку, только если priv пришёл И own=true.
import { ic } from "./icons";
import { modal } from "./ui-kit";
import { LEAGUES, leagueBadge, type LeagueId, type LStat } from "./rating";

export type RStat = { games: number; wins: number };
export type Profile = {
  nick: string; own?: boolean; coins?: number; races?: Record<string, RStat>; leagues?: Partial<Record<LeagueId, LStat>>;
  priv?: { techs?: { id?: string; name: string; n: number }[]; chiefsLeveled?: number; chiefLv?: Record<string, number>; recordChiefKills?: { n: number; turn?: number; race?: string };
    talents?: { name: string; n: number }[]; ults?: { kind?: string; name: string; n: number }[] };
};
type Deps = { crest: (r: string) => string; raceName: Record<string, string>; raceCol: (r: string) => string;
  fav?: { get: () => string[]; html: () => string; bind: (el: HTMLElement) => void; guest: () => boolean };
  /** «Библиотека партий» (сохранённые + недавние) — history.ts. */
  lib?: { html: () => string; bind: (el: HTMLElement) => void } };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const num = (v: any) => (Number.isFinite(+v) ? +v : 0);

function tile(icon: string, val: string, label: string, cls = "") { return `<div class="pstat ${cls}"><span class="ps-ic">${ic(icon)}</span><b>${val}</b><small>${label}</small></div>`; }

function publicHtml(p: Profile, d: Deps): string {
  const rs = Object.entries(p.races || {}).filter(([r]) => d.raceName[r]).map(([r, s]) => [r, { games: num(s.games), wins: num(s.wins) }] as const);
  const games = rs.reduce((a, [, s]) => a + s.games, 0), wins = rs.reduce((a, [, s]) => a + s.wins, 0);
  const fav = [...rs].sort((a, b) => b[1].games - a[1].games)[0];
  const maxG = Math.max(1, ...rs.map(([, s]) => s.games));
  const rows = Object.keys(d.raceName).map((r) => {
    const s = rs.find(([k]) => k === r)?.[1] || { games: 0, wins: 0 }, wr = pct(s.wins, s.games);
    return `<div class="prace ${s.games ? "" : "none"}" style="--rc:${d.raceCol(r)}"><span class="pr-cr">${d.crest(r)}</span><b class="pr-n">${d.raceName[r]}</b>
      <span class="pr-bar" title="Партии"><i style="width:${(s.games / maxG) * 100}%"></i></span><span class="pr-g">${s.games}<small>парт.</small></span><span class="pr-w">${s.wins}<small>побед</small></span>
      <span class="pr-wr ${s.games ? (wr >= 50 ? "hi" : "lo") : ""}">${s.games ? wr + "%" : "—"}</span></div>`;
  }).join("");
  return `<div class="pstats">${tile("flag", String(games), "партий")}${tile("crown", String(wins), "побед", "gold")}${tile("glory", games ? pct(wins, games) + "%" : "—", "винрейт")}${fav && fav[1].games ? `<div class="pstat fav"><span class="ps-cr">${d.crest(fav[0])}</span><b>${d.raceName[fav[0]]}</b><small>любимая раса</small></div>` : tile("user", "—", "любимая раса")}</div>
    <h4 class="psec">${ic("sword")}<span>Расы</span></h4><div class="praces">${rows}</div>
    <h4 class="psec">${ic("glory")}<span>Рейтинг по лигам</span></h4><div class="lbadges">${LEAGUES.map((l) => leagueBadge(l.id, p.leagues?.[l.id])).join("")}</div>`;
}

function listHtml(title: string, icon: string, xs: { name: string; n: number }[] | undefined, unit: string): string {
  const L = (xs || []).filter((x) => x && x.name).sort((a, b) => num(b.n) - num(a.n)).slice(0, 5); const mx = Math.max(1, ...L.map((x) => num(x.n)));
  return `<div class="plist"><h5>${ic(icon)}<span>${title}</span></h5>${L.length ? L.map((x, i) => `<div class="pl-row"><span class="pl-i">${i + 1}</span><span class="pl-n" data-n="${i}"></span><span class="pl-bar"><i style="width:${(num(x.n) / mx) * 100}%"></i></span><b>${num(x.n)}<small>${unit}</small></b></div>`).join("") : `<div class="emptyrow">${ic("lock")}<span>Пока нет данных</span></div>`}</div>`;
}

function privHtml(p: Profile, d: Deps): string {
  const v = p.priv || {}, rk = v.recordChiefKills;
  const lv = v.chiefLv || {}, lvRow = [1, 2, 3, 4, 5].map((k) => `<span class="plv lv${k}"><em>${k}</em><b>${num(lv[k])}</b></span>`).join("");
  return `<p class="ppriv-note">${ic("lock")}<span>Эту вкладку видите только вы.</span></p>
    <div class="pstats">${tile("xp", String(num(v.chiefsLeveled)), "Вождей прокачано")}<div class="pstat rec"><span class="ps-ic">${ic("skull")}</span><b>${num(rk?.n)}</b><small>рекорд убийств Вождём${rk?.turn ? ` · к ${rk.turn}-му ходу` : ""}</small>${rk?.race && d.raceName[rk.race] ? `<span class="ps-cr sm">${d.crest(rk.race)}</span>` : ""}</div></div>
    <div class="plvrow"><small>Уровни ваших Вождей</small>${lvRow}</div>
    <div class="plists">${listHtml("Любимые технологии", "tech", v.techs, "раз")}${listHtml("Любимые таланты", "spark", v.talents, "раз")}${listHtml("Ульты", "ult", v.ults, "каст.")}</div>`;
}

/** Окно профиля. Личная вкладка — только если сервер подтвердил владельца (own) и прислал priv. */
export async function openProfile(get: () => Promise<any>, d: Deps) {
  const m = modal({ id: "profdlg", title: "Профиль", icon: "user", cls: "profdlg", body: `<div class="emptyrow">${ic("clock")}<span>Загрузка…</span></div>` });
  const p: Profile | null = await get().catch(() => null); const b = m.el.querySelector<HTMLElement>(".dlg-b")!;
  if (!p || !p.nick) { b.innerHTML = `<div class="emptyrow">${ic("warn")}<span>Профиль недоступен — нет связи с сервером</span></div>`; return m; }
  const priv = !!(p.own && p.priv);
  const coins = p.own && p.coins != null ? `<span class="pcoins" data-tip="Монеты: за победы в рейтинговых партиях">${ic("gold")}<b>${num(p.coins)}</b><small>монет</small></span>` : "";
  const sets = !!(p.own && d.fav && !d.fav.guest()), lib = !!(p.own && d.lib);
  b.innerHTML = `<div class="phead"><span class="ph-cr">${ic("user")}</span><div><b class="ph-nick"></b><small>игровой профиль</small></div>${coins}</div>
    ${priv || sets || lib ? `<div class="ptabs" role="tablist"><button class="ptab on" data-t="pub" role="tab">${ic("eye")}<span>Публичный</span></button>${priv ? `<button class="ptab" data-t="priv" role="tab">${ic("lock")}<span>Личное</span></button>` : ""}${sets ? `<button class="ptab" data-t="set" role="tab">${ic("crown")}<span>Любимые расы</span></button>` : ""}${lib ? `<button class="ptab" data-t="lib" role="tab">${ic("book")}<span>Библиотека партий</span></button>` : ""}</div>` : ""}
    <div class="ppane" data-p="pub">${publicHtml(p, d)}</div>${priv ? `<div class="ppane" data-p="priv" hidden>${privHtml(p, d)}</div>` : ""}${sets ? `<div class="ppane" data-p="set" hidden>${d.fav!.html()}</div>` : ""}${lib ? `<div class="ppane" data-p="lib" hidden>${d.lib!.html()}</div>` : ""}`;
  if (lib) d.lib!.bind(b.querySelector<HTMLElement>('.ppane[data-p="lib"]')!);
  if (sets) d.fav!.bind(b.querySelector<HTMLElement>('.ppane[data-p="set"]')!);
  b.querySelector(".ph-nick")!.textContent = String(p.nick).slice(0, 24);
  const lists = [p.priv?.techs, p.priv?.talents, p.priv?.ults];
  b.querySelectorAll<HTMLElement>(".plist").forEach((el, li) => { const L = (lists[li] || []).filter((x: any) => x && x.name).sort((a: any, c: any) => num(c.n) - num(a.n)).slice(0, 5); el.querySelectorAll<HTMLElement>(".pl-n").forEach((n, i) => (n.textContent = String(L[i]?.name || "").slice(0, 40))); });
  b.querySelectorAll<HTMLButtonElement>(".ptab").forEach((t) => (t.onclick = () => { b.querySelectorAll(".ptab").forEach((x) => x.classList.toggle("on", x === t)); b.querySelectorAll<HTMLElement>(".ppane").forEach((pn) => (pn.hidden = pn.dataset.p !== t.dataset.t)); }));
  return m;
}

/** Демо-данные для локального просмотра (только ?demo). */
export function demoProfile(nick: string): Profile {
  return { nick, own: true, coins: 145, races: { fire: { games: 31, wins: 19 }, ice: { games: 12, wins: 5 }, water: { games: 6, wins: 4 }, lightning: { games: 9, wins: 3 }, stone: { games: 2, wins: 1 } },
    leagues: { fast: { r: 1612, rd: 64, games: 38, w: 22, l: 14, d: 2, peak: 1655 }, normal: { r: 1488, rd: 120, games: 7, w: 3, l: 4, d: 0 } },
    priv: { chiefsLeveled: 14, chiefLv: { 1: 60, 2: 41, 3: 25, 4: 14, 5: 6 }, recordChiefKills: { n: 7, turn: 23, race: "fire" },
      techs: [{ name: "Сталь", n: 28 }, { name: "Торговля", n: 22 }, { name: "Пожар", n: 17 }, { name: "Муштра", n: 11 }, { name: "Писцы", n: 6 }],
      talents: [{ name: "Закалка", n: 19 }, { name: "Боевой клич", n: 12 }, { name: "Хозяин земли", n: 8 }],
      ults: [{ kind: "doom", name: "DOOM", n: 9 }, { kind: "blizzard", name: "Великая вьюга", n: 3 }] } };
}
