// Рейтинговый жребий рас (t1144): в рейтинговой партии расу назначает сервер при старте.
// Протокол (из WIP сервера): st.raceDraw = { commit, seed?, rolls?:[{seat, race, fromFav, roll, pool, favPool}], order?, w?:[fav, other] };
//   hub hello_ok.favRaces: string[]; hub {type:"fav_races_set", races} → {type:"fav_races_ok", favRaces}.
// «Барабан»: у всех мест одновременно крутятся гербы и останавливаются по очереди жребия (order).
import { ic } from "./icons";
import { esc } from "./ui-kit";

export const FAV_MAX = 3;
let fav: string[] = (() => { try { return JSON.parse(localStorage.getItem("strat.favRaces") || "[]").slice(0, FAV_MAX); } catch { return []; } })();
export const favRaces = () => fav.slice();
export function setFavLocal(xs: any) { fav = (Array.isArray(xs) ? xs : []).map(String).slice(0, FAV_MAX); try { localStorage.setItem("strat.favRaces", JSON.stringify(fav)); } catch {} }

type D = { races: string[]; name: Record<string, string>; crest: (r: string) => string; col: (r: string) => string };

/** Блок вместо выбора расы в рейтинговом лобби. */
export function lobbyDrawHtml(S: any, d: D, guest: boolean): string {
  const w = S.raceDraw?.w || [85, 15], f = fav.filter((r) => d.name[r]);
  return `<div class="rd-box"><div class="rd-dice">${ic("dice", "dice")}</div>
    <div class="rd-txt"><b>Раса — жребием</b><p>В рейтинговой партии расу назначает сервер на старте. С вероятностью <b>${w[0]}%</b> выпадет одна из ваших любимых, иначе — любая другая.</p>
      <div class="rd-fav"><small>Любимые расы</small>${f.length ? f.map((r) => `<span class="rd-cr" style="--rc:${d.col(r)}" data-tip="${esc(d.name[r])}">${d.crest(r)}</span>`).join("") : `<span class="muted">${guest ? "доступно после входа" : "не выбраны — жребий из всех рас"}</span>`}
        ${guest ? "" : `<button class="btn sm ghost" data-favedit>${ic("user")}<span>Изменить</span></button>`}</div>
      ${S.raceDraw?.commit ? `<small class="rd-commit" data-tip="Хэш семени жребия опубликован заранее; семя раскрывается на старте — результат можно проверить">${ic("lock")}жребий заверен · ${esc(String(S.raceDraw.commit).slice(0, 10))}…</small>` : ""}</div></div>`;
}

/** Выбор любимых рас (до 3). onSave получает новый список. */
export function favPickerHtml(d: D, cur: string[]): string {
  return `<div class="favpick"><p class="muted">Выберите до ${FAV_MAX} рас: в рейтинговых партиях жребий чаще выдаёт их.</p><div class="fp-grid">${d.races.map((r) =>
    `<button class="fp-r ${cur.includes(r) ? "on" : ""}" data-fr="${r}" style="--rc:${d.col(r)}"><span class="fp-cr">${d.crest(r)}</span><b>${esc(d.name[r])}</b><i class="fp-n">${cur.includes(r) ? cur.indexOf(r) + 1 : ""}</i></button>`).join("")}</div>
    <div class="fp-f"><small class="fp-c">${cur.length}/${FAV_MAX}</small><button class="btn gold sm" data-fsave>${ic("check")}<span>Сохранить</span></button></div></div>`;
}
export function bindFavPicker(root: HTMLElement, d: D, start: string[], save: (xs: string[]) => void) {
  let cur = start.filter((r) => d.name[r]).slice(0, FAV_MAX);
  const paint = () => { root.querySelectorAll<HTMLElement>("[data-fr]").forEach((b) => { const i = cur.indexOf(b.dataset.fr!); b.classList.toggle("on", i >= 0); b.querySelector(".fp-n")!.textContent = i >= 0 ? String(i + 1) : "";
    (b as HTMLButtonElement).disabled = i < 0 && cur.length >= FAV_MAX; }); root.querySelector(".fp-c")!.textContent = `${cur.length}/${FAV_MAX}`; };
  root.querySelectorAll<HTMLButtonElement>("[data-fr]").forEach((b) => (b.onclick = () => { const r = b.dataset.fr!; cur = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r].slice(0, FAV_MAX); paint(); }));
  const sv = root.querySelector<HTMLButtonElement>("[data-fsave]"); if (sv) sv.onclick = () => save(cur.slice());
  paint();
}

/** «Барабан»: оверлей на старте рейтинговой партии, все места крутятся одновременно. */
export function drumReveal(S: any, d: D & { nick: (s: number) => string; me: number }, done: () => void) {
  const R = S.raceDraw, rolls: any[] = R?.rolls || []; if (!rolls.length) { done(); return; }
  const order: number[] = R.order?.length ? R.order : rolls.map((r) => r.seat);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, CELL = 84, SPIN = reduce ? 300 : 1500, STEP = reduce ? 150 : 650;
  const ov = document.createElement("div"); ov.className = "drumov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Жребий рас");
  const seats = rolls.slice().sort((a, b) => a.seat - b.seat);
  ov.innerHTML = `<div class="drum-panel"><h3>${ic("dice", "dice")}<span>Жребий рас</span></h3><div class="drum-row">${seats.map((r) => {
    const strip = Array.from({ length: 18 }, (_, i) => d.races[(i * 5 + r.seat * 3) % d.races.length]).concat([r.race]);
    return `<div class="drum ${r.seat === d.me ? "me" : ""}" data-seat="${r.seat}" style="--pc:${d.col(r.race)}"><small class="dn"></small><div class="drum-fr"><div class="drum-win"><div class="drum-strip" style="--n:${strip.length - 1}">${strip.map((x) => `<span class="dc"><img class="crestimg" src="/strat/ui2/crests/crest_${x}_nocrown_96.png" alt=""></span>`).join("")}</div></div></div>
      <b class="dr">${esc(d.name[r.race] || r.race)}</b><em class="df">${r.fromFav ? "из любимых" : ""}</em></div>`; }).join("")}</div>
    <small class="drum-v">${R.seed ? `${ic("lock")}семя ${esc(String(R.seed).slice(0, 10))}… совпадает с заверенным хэшем` : ""}</small><button class="btn gold" data-dok hidden>${ic("check")}<span>В бой</span></button></div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll<HTMLElement>(".drum").forEach((el) => (el.querySelector(".dn")!.textContent = d.nick(+el.dataset.seat!)));
  requestAnimationFrame(() => ov.classList.add("on"));
  ov.querySelectorAll<HTMLElement>(".drum-strip").forEach((s) => { s.style.transition = "none"; s.style.transform = "translateY(0)"; });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    order.forEach((seat, k) => { const el = ov.querySelector<HTMLElement>(`.drum[data-seat="${seat}"]`); if (!el) return; const s = el.querySelector<HTMLElement>(".drum-strip")!, n = +getComputedStyle(s).getPropertyValue("--n");
      el.classList.add("spin"); s.style.transition = `transform ${SPIN + k * STEP}ms cubic-bezier(.12,.7,.2,1.02)`; s.style.transform = `translateY(${-n * CELL}px)`;
      setTimeout(() => { el.classList.remove("spin"); el.classList.add("stop"); }, SPIN + k * STEP); });
    const total = SPIN + (order.length - 1) * STEP + 500, ok = ov.querySelector<HTMLButtonElement>("[data-dok]")!;
    const close = () => { if (!ov.isConnected) return; ov.classList.remove("on"); setTimeout(() => ov.remove(), 250); done(); };
    setTimeout(() => { ok.hidden = false; ok.focus(); }, total); ok.onclick = close; setTimeout(close, total + 4000);
  }));
}
