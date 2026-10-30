// Игроки: режимы 1×1 / 2×2 / все против всех (до 8), команды, цвета, список игроков в HUD и сетка мест в лобби.
// Сервер пока 1×1; поля читаются защитно (S.mode, S.maxSeats, S.spawns, seat.team, seat.col, seat.online/away).
// Ники — только textContent.
import { ic } from "./icons";
import { esc } from "./ui-kit";

/** Аудит M10: янтарь сдвинут в оранжевый, кость — в холодный жемчужно-серый, медь темнее: не сливаются с золотом #e0b04a и слоновой костью #f4ead2 рамок.
 * 8 различимых цветов игроков в палитре стиля C (без неона): кармин, кобальт, изумруд, янтарь, слива, бирюза, кость, медь. */
export const PCOL: { id: string; name: string; c: string; d: string }[] = [
  { id: "crimson", name: "Кармин", c: "#c8382b", d: "#5c120c" }, { id: "cobalt", name: "Кобальт", c: "#3c74c4", d: "#13284d" },
  { id: "emerald", name: "Изумруд", c: "#3e9a58", d: "#123a1e" }, { id: "amber", name: "Янтарь", c: "#e0782a", d: "#5a2a08" },
  { id: "plum", name: "Слива", c: "#8d4f9e", d: "#341a3c" }, { id: "teal", name: "Бирюза", c: "#2aa39b", d: "#0c3b38" },
  { id: "bone", name: "Кость", c: "#b9c6cf", d: "#3a4650" }, { id: "copper", name: "Медь", c: "#8e4a26", d: "#3a1806" },
];
export const TEAM_NAME = ["Золотые", "Алые", "Лазурные", "Изумрудные", "Пятые", "Шестые", "Седьмые", "Восьмые"];
export type Mode = "1v1" | "2v2" | "ffa";
export const modeOf = (S: any): Mode => (S?.mode === "2v2" || S?.mode === "ffa" ? S.mode : (S?.seats?.length || 2) > 2 ? "ffa" : "1v1");
export const seatCount = (S: any) => Math.max(2, Math.min(8, S?.maxSeats ?? S?.seats?.length ?? 2));
/** Сколько мест позволяет карта (точки появления). */
export const spawnLimit = (S: any) => Math.max(2, Math.min(8, S?.spawns ?? S?.mapSpawns ?? S?.map?.spawns ?? 2));
export const teamOf = (S: any, i: number): number => { const t = S?.seats?.[i]?.team; if (typeof t === "number") return t; return modeOf(S) === "2v2" ? i % 2 : i; };
export const allies = (S: any, a: number, b: number) => a !== b && modeOf(S) !== "ffa" && modeOf(S) !== "1v1" && teamOf(S, a) === teamOf(S, b);
/** Цвет игрока: сервер может назначить seat.col (индекс 0..7); иначе — по месту. В 1×1 с разными расами — цвет расы. */
export function playerCol(S: any, i: number, raceCol: (i: number) => string): string {
  const s = S?.seats?.[i], n = S?.seats?.length || 2, races = S?.g?.races || S?.seats?.map((x: any) => x?.race) || [];
  if (typeof s?.col === "number") return PCOL[s.col % 8].c;
  if (n <= 2 && races[0] && races[1] && races[0] !== races[1]) return raceCol(i);
  return PCOL[i % 8].c;
}
/** Боты не подсаживаются сами — хост добавляет их в слот и выбирает сложность. Протокол (догадка): {type:"bot", slot, on, lv:"easy"|"medium"|"hard"}; seat.bot, seat.botLv. */
export const BOT_LV: [string, string][] = [["easy", "Лёгкий"], ["medium", "Средний"], ["hard", "Сильный"]];
export const botLvName = (s: any) => (BOT_LV.find(([k]) => k === (s?.botLv ?? s?.lv ?? s?.diff)) || ["", "Бот"])[1];
export const isAway = (s: any) => !!s && !s.bot && (s.online === false || s.away === true || s.dc === true || s.conn === false);
const AWAY = `<span class="away" data-tip="Связь потеряна — ждём возвращения. Ход пройдёт по таймеру.">${ic("warn")}Игрок не за столом</span>`;

/** Компактный список игроков в HUD: герб, цвет, команда, чей ход, «не за столом», прогресс целей. */
export function renderPlayers(root: HTMLElement, S: any, o: { me: number; col: (i: number) => string; crest: (r: string) => string; raceName: Record<string, string>; goals: (i: number) => { done: number; need: number } | null; glory: (i: number) => number; pas: (i: number) => string }) {
  const g = S.g, n = S.seats.length, mode = modeOf(S), compact = n > 2;
  root.classList.toggle("many", compact);
  root.innerHTML = S.seats.map((s: any, i: number) => {
    const gq = o.goals(i), cur = g.cur === i && S.phase === "play", dead = s?.out || s?.lost, cnt = g.pieces.filter((p: any) => p.o === i).length;
    const pips = gq ? Array.from({ length: 5 }, (_, k) => `<i class="${k < gq.done ? "on" : ""} ${k === gq.need - 1 ? "need" : ""}"></i>`).join("") : "";
    return `<div class="plaque r-${g.races[i]} ${cur ? "active" : ""} ${i === o.me ? "me" : ""} ${dead ? "out" : ""} ${isAway(s) ? "is-away" : ""}" style="--pc:${o.col(i)}">
      <span class="pc-sw"></span>${o.crest(g.races[i])}
      <div class="pl-b"><b class="nick"></b>${s?.bot ? `<span class="botmark sm" data-tip="Бот · ${esc(botLvName(s))}">${ic("bot")}${esc(botLvName(s))}</span>` : ""}<small>${mode !== "1v1" && mode !== "ffa" ? `<span class="team t${teamOf(S, i)}">${esc(TEAM_NAME[teamOf(S, i)] || "")}</span> · ` : ""}${o.raceName[g.races[i]] || ""}${compact ? "" : ` · ${cnt} фиг.`}</small>
      ${isAway(s) ? AWAY : ""}${gq ? `<div class="gpips" data-tip="Цели: ${gq.done} из ${gq.need}">${pips}</div>` : ""}${compact ? "" : `<div class="pas-row">${o.pas(i)}</div>`}</div>
      ${cur ? `<span class="turnarrow" aria-label="ходит">${ic("play")}</span>` : ""}<span class="pl-g">${ic("glory")}${o.glory(i)}</span></div>`; }).join("");
  root.querySelectorAll<HTMLElement>(".plaque").forEach((el, i) => (el.querySelector(".nick")!.textContent = (i === o.me ? "Вы · " : "") + (S.seats[i]?.nick || "?")));
}

/** Сетка мест в лобби: до 8, команды, «добавить бота», пресеты режима. */
export function renderSlots(root: HTMLElement, modesEl: HTMLElement, S: any, o: { me: number; host: boolean; seatHtml: (i: number) => string; send: (m: any) => void; raceCol: (i: number) => string }) {
  const lim = spawnLimit(S), mode = modeOf(S), cnt = seatCount(S);
  const preset = (id: string, label: string, need: number, m: Mode, seats: number) => `<button class="mode ${mode === m && cnt === seats ? "on" : ""}" data-mode="${m}" data-seats="${seats}" ${!o.host || need > lim ? "disabled" : ""} data-tip="${need > lim ? `Карта рассчитана на ${lim} игроков` : esc(label)}">${esc(id)}</button>`;
  modesEl.innerHTML = `<span class="lbl">Режим</span>` + preset("1×1", "Дуэль", 2, "1v1", 2) + preset("2×2", "Две команды по двое; союзники ходят по очереди и видят ходы друг друга", 4, "2v2", 4)
    + [3, 4, 6, 8].map((k) => preset(`Все ×${k}`, `Каждый сам за себя, ${k} игроков`, k, "ffa", k)).join("") + `<small class="muted">мест на карте: ${lim}</small>`;
  modesEl.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => (b.onclick = () => o.send({ type: "cfg", mode: b.dataset.mode, seats: +b.dataset.seats! })));
  root.classList.toggle("many", cnt > 2); root.dataset.n = String(cnt);
  let h = ""; for (let i = 0; i < cnt; i++) {
    const s = S.seats[i], t = teamOf(S, i), col = s ? playerCol(S, i, o.raceCol) : PCOL[i % 8].c;
    h += `<div class="slot ${s ? (s.ready ? "is-ready" : "is-filled") : "is-empty"} ${mode === "2v2" ? "team-" + t : ""}" style="--pc:${col}" data-slot="${i}"><span class="slotno">${i + 1}</span>${o.seatHtml(i)}
      <div class="slot-f">${mode === "2v2" ? `<button class="tchip t${t}" data-team="${i}" ${o.host ? "" : "disabled"} data-tip="Сменить команду">${esc(TEAM_NAME[t])}</button>` : ""}
      ${o.host && i > 0 && !s ? `<div class="botadd" role="group" aria-label="Добавить бота"><span class="ba-l">${ic("bot")}Бот</span>${BOT_LV.map(([lv, nm]) => `<button type="button" class="ba-b" data-bot="${i}" data-lv="${lv}">${nm}</button>`).join("")}</div>` : ""}
      ${s?.bot ? `<span class="botmark">${ic("bot")}${esc(botLvName(s))}</span>${o.host ? `<button class="btn sm ghost" data-bot="${i}" data-off="1">${ic("close")}<span>Убрать</span></button>` : ""}` : ""}</div></div>`;
    if (cnt === 2 && i === 0) h += `<span class="vs">VS</span>`;
  }
  // цвет игрока (арт swatch_1..8): занятые чужими — недоступны. Протокол (догадка): {type:"color", col:0..7} → seat.col
  if (o.me >= 0 && S.seats[o.me]) { const mine = S.seats[o.me].col, taken = new Set(S.seats.map((x: any, k: number) => (k !== o.me && typeof x?.col === "number" ? x.col : -1)));
    h += `<div class="colrow"><span class="lbl">Цвет</span>${PCOL.map((c, k) => `<button type="button" class="swb ${mine === k ? "on" : ""}" data-col="${k}" ${taken.has(k) ? "disabled" : ""} aria-label="${c.name}" data-tip="${c.name}${taken.has(k) ? " — занят" : ""}"><img src="/strat/ui2/players/swatch_${k + 1}${k === 3 || k === 6 ? "_dark" : ""}.png" alt=""></button>`).join("")}</div>`; }
  root.innerHTML = h;
  root.querySelectorAll<HTMLButtonElement>("[data-col]").forEach((b) => (b.onclick = () => o.send({ type: "color", col: +b.dataset.col! })));
  root.querySelectorAll<HTMLElement>(".slot").forEach((el) => { const i = +el.dataset.slot!, nk = el.querySelector(".nick"); if (nk && S.seats[i]) nk.textContent = S.seats[i].nick; });
  root.querySelectorAll<HTMLButtonElement>("[data-bot]").forEach((b) => (b.onclick = () => { const i = +b.dataset.bot!; b.dataset.off ? o.send({ type: "bot", slot: i, on: false }) : o.send({ type: "bot", slot: i, on: true, lv: b.dataset.lv }); }));
  root.querySelectorAll<HTMLButtonElement>("[data-team]").forEach((b) => (b.onclick = () => { const i = +b.dataset.team!; o.send({ type: "cfg", team: { slot: i, team: teamOf(S, i) === 0 ? 1 : 0 } }); }));
}
