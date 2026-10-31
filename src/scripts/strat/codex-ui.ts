// F: «Библиотека» — всё, что есть в игре; запись открывается при первой встрече в партии.
// Данные записей приходят только с сервера (каталог строится из общих правил, деревья скрыты от клиента — ТЗ §14.F).
// Вошедшие: хранятся на сервере (GET /strat/codex по сессии Clerk). Гости: localStorage (strat.codex).
import { esc, modal, toast } from "./ui-kit";

export type CxEntry = { k: string; cat: string; name: string; icon?: string; race?: string; era?: number; type?: string; league?: string;
  cost?: string; eff: string; req?: string; opens?: string; stats?: string; at?: number };
type Group = { cat: string; race?: string; era?: number; type?: string; n: number };
const LS = "strat.codex", RACE_RU: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
const ERA = ["", "I", "II", "III", "IV", "V"];
const DEF_CATS: Record<string, string> = { race: "Расы", unit: "Фигуры", chief: "Вожди", skill: "Навыки", ult: "Ультимейты", status: "Состояния", terrain: "Местность",
  object: "Объекты карты", building: "Постройки", tech: "Технологии", wonder: "Чудеса", goal: "Цели победы", league: "Лиги" };

function lsGet(): Record<string, CxEntry> { try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch { return {}; } }
/** пришло с сервера во время партии: {type:"codex", items} — запомнить (гостю это и есть Библиотека) и сказать о новом */
export function codexGot(items: CxEntry[]) {
  if (!Array.isArray(items) || !items.length) return; const o = lsGet(), now = Date.now(), fresh: CxEntry[] = [];
  for (const e of items) { if (!e?.k) continue; if (!o[e.k]) fresh.push(e); o[e.k] = { ...e, at: o[e.k]?.at || now }; }
  try { localStorage.setItem(LS, JSON.stringify(o)); } catch {}
  const shown = fresh.filter((e) => !["race", "league", "goal", "terrain", "unit"].includes(e.cat)); // базовое открывается молча (первая партия)
  if (shown.length) toast(`Библиотека: ${shown.slice(0, 2).map((e) => e.name).join(", ")}${shown.length > 2 ? ` и ещё ${shown.length - 2}` : ""}`, "good", "book");
}

export async function openCodex(o: { http: string; auth: () => Promise<{ token?: string; dev?: string }> }) {
  const m = modal({ id: "codexdlg", title: "Библиотека", sub: "Всё об игре. Запись открывается, когда встретите её в партии.", icon: "book", cls: "codexdlg",
    body: `<div class="cx-load">Загрузка…</div>` });
  let items: CxEntry[] = [], groups: Group[] = [], cats = DEF_CATS, signed = false;
  try { const a = await o.auth(), u = new URL(o.http + "/strat/codex"); if (a.dev) u.searchParams.set("devUser", a.dev);
    const r = await fetch(u, { headers: a.token ? { Authorization: "Bearer " + a.token } : {} }), j = await r.json().catch(() => ({}));
    groups = j.groups || []; cats = j.cats || DEF_CATS; signed = r.ok && j.auth === true; if (signed) items = j.items || []; } catch {}
  if (!signed) items = Object.values(lsGet());
  const have = new Set(items.map((e) => e.k)), gk = (e: { cat: string; race?: string; era?: number; type?: string }) => [e.cat, e.race || "", e.era || "", e.type || ""].join("|");
  const got: Record<string, number> = {}; for (const e of items) got[gk(e)] = (got[gk(e)] || 0) + 1;
  const locked: Group[] = groups.map((g) => ({ ...g, n: Math.max(0, g.n - (got[gk(g)] || 0)) })).filter((g) => g.n > 0);
  const total = items.length + locked.reduce((s, g) => s + g.n, 0);
  const all = [...items, ...locked.map((g) => ({ ...g, k: "" } as any))];
  const uniq = (f: (x: any) => any) => [...new Set(all.map(f).filter((x) => x != null && x !== ""))];
  const opt = (id: string, label: string, vals: any[], name: (v: any) => string) => `<label class="cx-f"><span>${label}</span><select id="${id}"><option value="">все</option>${vals.map((v) => `<option value="${esc(v)}">${esc(name(v))}</option>`).join("")}</select></label>`;
  m.el.querySelector(".dlg-b")!.innerHTML = `<div class="cx">
    <div class="cx-top"><input id="cx-q" type="search" placeholder="Поиск по названию и описанию" autocomplete="off" /><span class="cx-cnt">Открыто <b>${items.length}</b> из ${total || items.length}</span></div>
    <div class="cx-cats" role="tablist"><button class="cx-cat on" data-c="">Всё</button>${Object.keys(cats).filter((c) => all.some((e) => e.cat === c)).map((c) => `<button class="cx-cat" data-c="${c}">${esc(cats[c])}</button>`).join("")}</div>
    <div class="cx-fl">${opt("cx-race", "Раса", uniq((e) => e.race), (r) => RACE_RU[r] || r)}${opt("cx-era", "Эпоха", uniq((e) => e.era).sort(), (n) => "эпоха " + (ERA[n] || n))}${opt("cx-type", "Тип", uniq((e) => e.type), (t) => t)}
      <label class="cx-f cx-chk"><input type="checkbox" id="cx-open" /><span>только открытые</span></label></div>
    ${signed ? "" : `<p class="cx-note">Вы играете гостем — Библиотека хранится в этом браузере. Войдите, чтобы она сохранялась в аккаунте.</p>`}
    <div class="cx-grid" id="cx-grid"></div></div>`;
  const $ = <T extends HTMLElement>(s: string) => m.el.querySelector(s) as T;
  let cat = "";
  const card = (e: CxEntry) => `<button class="cx-card" data-k="${esc(e.k)}"><span class="cx-ic">${esc(e.icon || "◆")}</span><span class="cx-nm"><b>${esc(e.name)}</b><small>${esc([cats[e.cat], e.race && RACE_RU[e.race], e.era && "эп. " + ERA[e.era]].filter(Boolean).join(" · "))}</small></span></button>`;
  const ghost = (g: Group) => `<div class="cx-card cx-lock" aria-label="закрыто"><span class="cx-ic">?</span><span class="cx-nm"><b>???</b><small>${esc([cats[g.cat], g.race && RACE_RU[g.race], g.era && "эп. " + ERA[g.era]].filter(Boolean).join(" · "))}</small></span></div>`;
  const draw = () => {
    const q = ($<HTMLInputElement>("#cx-q").value || "").trim().toLowerCase(), r = $<HTMLSelectElement>("#cx-race").value, er = $<HTMLSelectElement>("#cx-era").value, ty = $<HTMLSelectElement>("#cx-type").value, only = $<HTMLInputElement>("#cx-open").checked;
    const ok = (e: any) => (!cat || e.cat === cat) && (!r || e.race === r) && (!er || String(e.era) === er) && (!ty || e.type === ty);
    const A = items.filter((e) => ok(e) && (!q || (e.name + " " + e.eff + " " + (e.req || "") + " " + (e.opens || "")).toLowerCase().includes(q)));
    const B = only || q ? [] : locked.filter(ok);
    const order = Object.keys(cats), sort = (x: any, y: any) => order.indexOf(x.cat) - order.indexOf(y.cat) || (x.era || 0) - (y.era || 0) || String(x.name || "").localeCompare(String(y.name || ""), "ru");
    $("#cx-grid").innerHTML = A.sort(sort).map(card).join("") + B.sort(sort).flatMap((g) => Array.from({ length: g.n }, () => ghost(g))).join("") || `<p class="cx-empty">${items.length ? "Ничего не найдено" : "Пока пусто — сыграйте партию, и здесь появится всё, что встретите."}</p>`;
  };
  $("#cx-q").addEventListener("input", draw); for (const s of ["#cx-race", "#cx-era", "#cx-type", "#cx-open"]) $(s).addEventListener("change", draw);
  m.el.querySelector(".cx-cats")!.addEventListener("click", (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-c]"); if (!b) return; cat = b.dataset.c || "";
    m.el.querySelectorAll(".cx-cat").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
  $("#cx-grid").addEventListener("click", (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-k]"); const e = b && items.find((x) => x.k === b.dataset.k); if (!e) return;
    const row = (l: string, v?: string) => (v ? `<div class="cx-row"><span>${l}</span><b>${esc(v)}</b></div>` : "");
    modal({ id: "codexitem", title: e.name, sub: esc(cats[e.cat] || e.cat), cls: "small codexitem", body: `<div class="cx-det"><div class="cx-big">${esc(e.icon || "◆")}</div>
      ${row("Раса", e.race && RACE_RU[e.race])}${row("Эпоха", e.era ? ERA[e.era] : "")}${row("Лига", e.league)}${row("Тип", e.type && e.cat !== "unit" ? e.type : "")}${row("Цена", e.cost)}${row("Параметры", e.stats)}
      <p class="cx-eff">${esc(e.eff)}</p>${row("Требуется", e.req)}${row("Открывает", e.opens)}${row("Впервые", e.at ? new Date(e.at).toLocaleDateString("ru-RU") : "")}</div>` }); });
  draw(); void have;
}
