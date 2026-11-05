// Админка кампаний / карт / главного экрана. Gate: /api/chess/admin-gate (Lorin Death).
import {
  loadCampaigns, saveCampaigns, loadHomeMenu, saveHomeMenu, DEFAULT_HOME,
  emptyMap, classicUnits, uid, KIND_LABEL,
  type Campaign, type Chapter, type ChessMap, type MapPayload, type ScenePayload,
  type HomeMenu, type MenuBtn, type MenuAction, type Kind, type Side, type Cond, type Unit,
} from "./storage";

const qs = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const LORIN_UID = "user_38QeREOr606p1c96P4f14YFsLp7";
const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Tab = "campaigns" | "map" | "vn" | "home";
let tab: Tab = "campaigns";
let camps: Campaign[] = [];
let campId: string | null = null;
let chapId: string | null = null;
let mapId: string | null = null;
let brush: { side: Side; type: Kind } | "erase" | null = { side: "w", type: "P" };
let menu: HomeMenu = loadHomeMenu();
let who = "";

let clerkP: Promise<any> | null = null;
const clerkReady = () => (clerkP ??= new Promise((res) => {
  const t0 = Date.now();
  const tick = () => {
    const C = (window as any).Clerk;
    if (C?.loaded) return res(C);
    if (Date.now() - t0 > 6000) { clerkP = null; return res(null); }
    setTimeout(tick, 50);
  };
  tick();
}));

async function authHeaders(): Promise<{ headers: Record<string, string>; q: string }> {
  const q = new URLSearchParams();
  const dev = qs.get("devUser");
  if (LOCAL && dev === LORIN_UID) { q.set("devUser", dev); return { headers: {}, q: q.toString() }; }
  try {
    const C = await clerkReady();
    const t = await C?.session?.getToken?.();
    if (t) return { headers: { Authorization: "Bearer " + t }, q: "" };
  } catch {}
  if (LOCAL && qs.get("devUser")) { q.set("devUser", qs.get("devUser")!); }
  return { headers: {}, q: q.toString() };
}

async function checkGate(): Promise<{ ok: boolean; who?: string; msg?: string }> {
  const a = await authHeaders();
  const u = "/api/chess/admin-gate" + (a.q ? "?" + a.q : "");
  try {
    const r = await fetch(u, { headers: a.headers, cache: "no-store" });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return { ok: true, who: j.who || "Lorin Death" };
    return { ok: false, msg: j.msg || (r.status === 401 ? "Нужен вход на сайт." : "Нет доступа.") };
  } catch {
    return { ok: false, msg: "Сервер не отвечает." };
  }
}

function curCamp(): Campaign | null { return camps.find((c) => c.id === campId) || null; }
function curChap(): Chapter | null {
  const c = curCamp(); if (!c) return null;
  return c.chapters.find((ch) => ch.id === chapId) || c.chapters[0] || null;
}
function curMap(): ChessMap | null {
  const ch = curChap(); if (!ch) return null;
  return ch.maps.find((m) => m.id === mapId) || ch.maps[0] || null;
}
function persist() { saveCampaigns(camps); }

function showDeny(msg: string) {
  const root = $("#cc-admin-root");
  if (!root) return;
  root.innerHTML = `<div class="cc-deny">
    <div class="cc-panel">
      <h2>Доступ закрыт</h2>
      <p>${esc(msg)}</p>
      <p class="muted">Админка «Боевые шахматы» — только для <b>Lorin Death</b> (роль admin + имя или сид-uid).</p>
      <a class="btn gold" href="/games/chess-combat">← К игре</a>
    </div>
  </div>`;
  document.body.dataset.gate = "deny";
}

function shell() {
  const root = $("#cc-admin-root");
  if (!root) return;
  root.innerHTML = `
  <div class="cc-admin-tabs" role="tablist">
    <button type="button" class="btn" data-tab="campaigns">Кампании</button>
    <button type="button" class="btn" data-tab="map">Карта</button>
    <button type="button" class="btn" data-tab="vn">Новелла</button>
    <button type="button" class="btn" data-tab="home">Главный экран</button>
  </div>
  <div id="cc-admin-body"></div>`;
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = (b as HTMLElement).dataset.tab as Tab; render();
  }));
  document.body.dataset.gate = "ok";
  const me = $("#me"); if (me) me.textContent = who;
}

function render() {
  document.querySelectorAll(".cc-admin-tabs .btn").forEach((b) =>
    (b as HTMLElement).classList.toggle("on", (b as HTMLElement).dataset.tab === tab));
  const body = $("#cc-admin-body"); if (!body) return;
  if (tab === "campaigns") renderCamps(body);
  else if (tab === "map") renderMap(body);
  else if (tab === "vn") renderVn(body);
  else renderHome(body);
}

function renderCamps(body: HTMLElement) {
  const c = curCamp();
  body.innerHTML = `<div class="cc-grid cc-admin-grid">
    <div class="cc-panel">
      <h2>Кампании</h2>
      <div class="list" id="camp-list"></div>
      <label class="fld"><span>Название</span><input id="camp-title" maxlength="48" placeholder="Глава проклятых" /></label>
      <button class="btn gold" id="camp-add" type="button">Создать кампанию</button>
    </div>
    <div class="cc-panel">
      <h2>Главы ${c ? "· " + esc(c.title) : ""}</h2>
      <div id="chap-box">${c ? "" : '<div class="empty">Выбери кампанию слева</div>'}</div>
    </div>
  </div>`;
  const list = $("#camp-list", body);
  list.innerHTML = camps.length
    ? camps.map((x) => `<div class="row ${x.id === campId ? "on" : ""}">
        <span><b>${esc(x.title)}</b> · ${x.chapters.length} гл. · ${x.chapters.reduce((n, ch) => n + ch.maps.length, 0)} карт</span>
        <span>
          <button class="btn ghost sm" data-sel="${x.id}">Открыть</button>
          <button class="btn ghost sm" data-del="${x.id}">Удалить</button>
        </span></div>`).join("")
    : `<div class="empty">Пока нет кампаний — создай первую</div>`;
  list.querySelectorAll("[data-sel]").forEach((b) => b.addEventListener("click", () => {
    campId = (b as HTMLElement).dataset.sel!;
    const cc = curCamp()!;
    chapId = cc.chapters[0]?.id || null;
    mapId = curChap()?.maps[0]?.id || null;
    render();
  }));
  list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const id = (b as HTMLElement).dataset.del!;
    if (!confirm("Удалить кампанию?")) return;
    camps = camps.filter((x) => x.id !== id);
    if (campId === id) { campId = null; chapId = null; mapId = null; }
    persist(); render();
  }));
  $("#camp-add", body).onclick = () => {
    const title = ($("#camp-title", body) as HTMLInputElement).value.trim() || "Новая кампания";
    const ch: Chapter = { id: uid(), title: "Глава 1", maps: [] };
    const camp: Campaign = { id: uid(), title, chapters: [ch], updated: Date.now() };
    camps.push(camp); campId = camp.id; chapId = ch.id; mapId = null;
    persist(); render();
  };
  if (!c) return;
  const box = $("#chap-box", body);
  box.innerHTML = `
    <div class="list" id="chap-list"></div>
    <label class="fld"><span>Новая глава</span><input id="chap-title" maxlength="48" placeholder="Глава 2" /></label>
    <div class="row-actions">
      <button class="btn" id="chap-add" type="button">Добавить главу</button>
      <button class="btn ghost" id="camp-rename" type="button">Переименовать кампанию</button>
    </div>
    <h3>Карты главы</h3>
    <div class="list" id="map-list"></div>
    <button class="btn gold" id="map-add" type="button">+ Карта (пустая 8×8)</button>
    <button class="btn" id="map-classic" type="button">+ Карта (классика)</button>`;
  const chapList = $("#chap-list", box);
  chapList.innerHTML = c.chapters.map((ch, i) => `<div class="row ${ch.id === chapId ? "on" : ""}">
    <span>${i + 1}. <b>${esc(ch.title)}</b> · ${ch.maps.length} карт</span>
    <span>
      <button class="btn ghost sm" data-ch="${ch.id}">Открыть</button>
      <button class="btn ghost sm" data-chup="${ch.id}">↑</button>
      <button class="btn ghost sm" data-chdn="${ch.id}">↓</button>
      <button class="btn ghost sm" data-chdel="${ch.id}">×</button>
    </span></div>`).join("");
  chapList.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    chapId = (b as HTMLElement).dataset.ch!; mapId = curChap()?.maps[0]?.id || null; render();
  }));
  const moveChap = (id: string, dir: -1 | 1) => {
    const i = c.chapters.findIndex((x) => x.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= c.chapters.length) return;
    const t = c.chapters[i]; c.chapters[i] = c.chapters[j]; c.chapters[j] = t;
    c.updated = Date.now(); persist(); render();
  };
  chapList.querySelectorAll("[data-chup]").forEach((b) => b.addEventListener("click", () => moveChap((b as HTMLElement).dataset.chup!, -1)));
  chapList.querySelectorAll("[data-chdn]").forEach((b) => b.addEventListener("click", () => moveChap((b as HTMLElement).dataset.chdn!, 1)));
  chapList.querySelectorAll("[data-chdel]").forEach((b) => b.addEventListener("click", () => {
    const id = (b as HTMLElement).dataset.chdel!;
    if (!confirm("Удалить главу?")) return;
    c.chapters = c.chapters.filter((x) => x.id !== id);
    if (chapId === id) { chapId = c.chapters[0]?.id || null; mapId = curChap()?.maps[0]?.id || null; }
    c.updated = Date.now(); persist(); render();
  }));
  $("#chap-add", box).onclick = () => {
    const title = ($("#chap-title", box) as HTMLInputElement).value.trim() || ("Глава " + (c.chapters.length + 1));
    const ch: Chapter = { id: uid(), title, maps: [] };
    c.chapters.push(ch); chapId = ch.id; mapId = null; c.updated = Date.now(); persist(); render();
  };
  $("#camp-rename", box).onclick = () => {
    const t = prompt("Название кампании", c.title); if (!t) return;
    c.title = t.trim().slice(0, 48); c.updated = Date.now(); persist(); render();
  };
  const ch = curChap();
  const mapList = $("#map-list", box);
  if (!ch) { mapList.innerHTML = `<div class="empty">Нет глав</div>`; return; }
  mapList.innerHTML = ch.maps.length
    ? ch.maps.map((m, i) => `<div class="row ${m.id === mapId ? "on" : ""}">
        <span>${i + 1}. <b>${esc(m.title)}</b> · фигур ${m.payload.units?.length || 0}</span>
        <span>
          <button class="btn ghost sm" data-medit="${m.id}">Править</button>
          <button class="btn ghost sm" data-mdel="${m.id}">×</button>
        </span></div>`).join("")
    : `<div class="empty">Карт пока нет</div>`;
  mapList.querySelectorAll("[data-medit]").forEach((b) => b.addEventListener("click", () => {
    mapId = (b as HTMLElement).dataset.medit!; tab = "map"; render();
  }));
  mapList.querySelectorAll("[data-mdel]").forEach((b) => b.addEventListener("click", () => {
    const id = (b as HTMLElement).dataset.mdel!;
    if (!confirm("Удалить карту?")) return;
    ch.maps = ch.maps.filter((x) => x.id !== id);
    if (mapId === id) mapId = ch.maps[0]?.id || null;
    c.updated = Date.now(); persist(); render();
  }));
  const addMap = (classic: boolean) => {
    const payload = emptyMap();
    if (classic) payload.units = classicUnits();
    const m: ChessMap = { id: uid(), title: "Карта " + (ch.maps.length + 1), payload };
    ch.maps.push(m); mapId = m.id; c.updated = Date.now(); persist(); tab = "map"; render();
  };
  $("#map-add", box).onclick = () => addMap(false);
  $("#map-classic", box).onclick = () => addMap(true);
}

function ensurePayload(m: ChessMap): MapPayload {
  if (!m.payload || typeof m.payload !== "object") m.payload = emptyMap();
  const p = m.payload;
  p.w = 8; p.h = 8;
  p.boardSkin = p.boardSkin || "B_artdeco";
  p.bg = p.bg === "terrace" ? "terrace" : "hall";
  p.units = Array.isArray(p.units) ? p.units : [];
  p.win = Array.isArray(p.win) && p.win.length ? p.win : [{ type: "kill_king", side: "b" }];
  p.lose = Array.isArray(p.lose) && p.lose.length ? p.lose : [{ type: "kill_king", side: "w" }];
  p.props = Array.isArray(p.props) ? p.props : [];
  p.special = Array.isArray(p.special) ? p.special : [];
  return p;
}

function renderMap(body: HTMLElement) {
  const m = curMap();
  if (!m) {
    body.innerHTML = `<div class="cc-panel"><h2>Карта</h2><div class="empty">Сначала создай карту во вкладке «Кампании».</div>
      <button class="btn" type="button" id="go-camps">К кампаниям</button></div>`;
    $("#go-camps", body).onclick = () => { tab = "campaigns"; render(); };
    return;
  }
  const p = ensurePayload(m);
  body.innerHTML = `<div class="cc-grid cc-admin-grid map-ed">
    <div class="cc-panel">
      <h2>Сетка 8×8 · ${esc(m.title)}</h2>
      <label class="fld"><span>Название карты</span><input id="map-title" value="${esc(m.title)}" maxlength="48" /></label>
      <div class="fld"><span>Фон</span>
        <select id="map-bg"><option value="hall"${p.bg === "hall" ? " selected" : ""}>Зал</option>
        <option value="terrace"${p.bg === "terrace" ? " selected" : ""}>Терраса</option></select>
      </div>
      <div class="cc-grid-board" id="grid" aria-label="Редактор поля"></div>
      <p class="hint">ЛКМ — поставить кисть · ПКМ / ластик — убрать · классика без пропов</p>
      <div class="row-actions">
        <button class="btn gold" id="map-save" type="button">Сохранить</button>
        <button class="btn" id="map-fill-classic" type="button">Классика</button>
        <button class="btn ghost" id="map-clear" type="button">Очистить</button>
      </div>
    </div>
    <div class="cc-panel">
      <h2>Палитра</h2>
      <div class="palette" id="palette"></div>
      <h3>Победа</h3>
      <div id="win-box"></div>
      <h3>Поражение</h3>
      <div id="lose-box"></div>
      <h3>JSON (ТЗ §6)</h3>
      <textarea id="map-json" spellcheck="false"></textarea>
      <button class="btn" id="map-from-json" type="button">Применить JSON</button>
    </div>
  </div>`;

  const kinds = Object.keys(KIND_LABEL) as Kind[];
  const pal = $("#palette", body);
  pal.innerHTML = `
    <button type="button" class="pal erase" data-erase="1">Ластик</button>
    ${(["w", "b"] as Side[]).map((s) => kinds.map((k) =>
      `<button type="button" class="pal ${s}" data-side="${s}" data-type="${k}" title="${KIND_LABEL[k]}">${s === "w" ? "♔"[0] && "" : ""}${esc(KIND_LABEL[k].slice(0, 1))}<small>${s === "w" ? "С" : "Т"}</small></button>`
    ).join("")).join("")}`;
  // nicer labels
  pal.innerHTML = `<button type="button" class="pal erase" data-erase="1">⌫</button>` +
    (["w", "b"] as Side[]).map((s) =>
      `<div class="pal-row"><span class="pal-lab">${s === "w" ? "Светлые" : "Тёмные"}</span>` +
      kinds.map((k) => `<button type="button" class="pal ${s}" data-side="${s}" data-type="${k}">${KIND_LABEL[k][0]}</button>`).join("") +
      `</div>`
    ).join("");

  const syncPal = () => {
    pal.querySelectorAll(".pal").forEach((b) => {
      const el = b as HTMLElement;
      const on = brush === "erase" ? !!el.dataset.erase
        : !!(brush && el.dataset.side === brush.side && el.dataset.type === brush.type);
      el.classList.toggle("on", on);
    });
  };
  pal.querySelectorAll(".pal").forEach((b) => b.addEventListener("click", () => {
    const el = b as HTMLElement;
    if (el.dataset.erase) brush = "erase";
    else brush = { side: el.dataset.side as Side, type: el.dataset.type as Kind };
    syncPal();
  }));
  syncPal();

  const grid = $("#grid", body);
  const paint = () => {
    const cells: string[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const u = p.units.find((q) => q.x === x && q.y === y);
      const light = (x + y) % 2 === 0;
      cells.push(`<button type="button" class="cell ${light ? "light" : "dark"} ${u ? "has " + u.side : ""}" data-x="${x}" data-y="${y}">${
        u ? `<span>${KIND_LABEL[u.type][0]}</span>` : ""
      }</button>`);
    }
    grid.innerHTML = cells.join("");
    grid.querySelectorAll(".cell").forEach((b) => {
      const put = (ev: Event) => {
        ev.preventDefault();
        const x = +(b as HTMLElement).dataset.x!, y = +(b as HTMLElement).dataset.y!;
        p.units = p.units.filter((q) => !(q.x === x && q.y === y));
        if (brush && brush !== "erase") {
          p.units.push({ id: uid(), side: brush.side, type: brush.type, x, y });
        }
        paint(); syncJson();
      };
      b.addEventListener("click", put);
      b.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        const x = +(b as HTMLElement).dataset.x!, y = +(b as HTMLElement).dataset.y!;
        p.units = p.units.filter((q) => !(q.x === x && q.y === y));
        paint(); syncJson();
      });
    });
  };

  const condHtml = (list: Cond[], which: "win" | "lose") => {
    const box = $(which === "win" ? "#win-box" : "#lose-box", body);
    box.innerHTML = list.map((c, i) => {
      const t = c.type;
      return `<div class="cond">
        <select data-ci="${i}" data-w="${which}" data-f="type">
          <option value="kill_king"${t === "kill_king" ? " selected" : ""}>Убить короля</option>
          <option value="destroy_n"${t === "destroy_n" ? " selected" : ""}>Уничтожить N</option>
          <option value="survive_turns"${t === "survive_turns" ? " selected" : ""}>Продержаться N ходов</option>
          <option value="reach_cell"${t === "reach_cell" ? " selected" : ""}>Дойти до клетки</option>
        </select>
        ${"side" in c ? `<select data-ci="${i}" data-w="${which}" data-f="side">
          <option value="w"${c.side === "w" ? " selected" : ""}>светлых</option>
          <option value="b"${c.side === "b" ? " selected" : ""}>тёмных</option>
        </select>` : ""}
        ${"n" in c ? `<input type="number" min="1" max="99" value="${(c as any).n}" data-ci="${i}" data-w="${which}" data-f="n" />` : ""}
        ${t === "reach_cell" ? `x<input type="number" min="0" max="7" value="${(c as any).x}" data-ci="${i}" data-w="${which}" data-f="x" style="width:3em"/>
          y<input type="number" min="0" max="7" value="${(c as any).y}" data-ci="${i}" data-w="${which}" data-f="y" style="width:3em"/>` : ""}
        <button type="button" class="btn ghost sm" data-rm="${which}:${i}">×</button>
      </div>`;
    }).join("") + `<button type="button" class="btn sm" data-add="${which}">+ условие</button>`;
    box.querySelectorAll("select,input").forEach((el) => el.addEventListener("change", () => {
      const e = el as HTMLInputElement;
      const i = +e.dataset.ci!, w = e.dataset.w as "win" | "lose", f = e.dataset.f!;
      const arr = w === "win" ? p.win : p.lose;
      const cur = { ...arr[i] } as any;
      if (f === "type") {
        if (e.value === "kill_king") arr[i] = { type: "kill_king", side: cur.side || "b" };
        else if (e.value === "destroy_n") arr[i] = { type: "destroy_n", side: cur.side || "b", n: cur.n || 3 };
        else if (e.value === "survive_turns") arr[i] = { type: "survive_turns", n: cur.n || 20 };
        else arr[i] = { type: "reach_cell", side: cur.side || "w", x: cur.x || 0, y: cur.y || 0, unit: "K" };
      } else if (f === "side") cur.side = e.value;
      else if (f === "n" || f === "x" || f === "y") cur[f] = +e.value;
      if (f !== "type") arr[i] = cur;
      condHtml(arr, w); syncJson();
    }));
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const [w, is] = (b as HTMLElement).dataset.rm!.split(":");
      const arr = w === "win" ? p.win : p.lose;
      arr.splice(+is, 1);
      if (!arr.length) arr.push(w === "win" ? { type: "kill_king", side: "b" } : { type: "kill_king", side: "w" });
      condHtml(arr, w as any); syncJson();
    }));
    box.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
      const w = (b as HTMLElement).dataset.add as "win" | "lose";
      const arr = w === "win" ? p.win : p.lose;
      arr.push({ type: "kill_king", side: w === "win" ? "b" : "w" });
      condHtml(arr, w); syncJson();
    }));
  };

  const syncJson = () => {
    ($("#map-json", body) as HTMLTextAreaElement).value = JSON.stringify(p, null, 2);
  };

  paint();
  condHtml(p.win, "win");
  condHtml(p.lose, "lose");
  syncJson();

  $("#map-save", body).onclick = () => {
    m.title = (($("#map-title", body) as HTMLInputElement).value || m.title).trim().slice(0, 48);
    p.bg = ($("#map-bg", body) as HTMLSelectElement).value as any;
    // classic editor: no props/special on these maps unless JSON added them intentionally — keep empty for cleanliness when units-only
    m.payload = p;
    const c = curCamp(); if (c) c.updated = Date.now();
    persist(); toast("Карта сохранена");
  };
  $("#map-fill-classic", body).onclick = () => {
    p.units = classicUnits(); p.props = []; p.special = [];
    paint(); syncJson();
  };
  $("#map-clear", body).onclick = () => {
    p.units = []; paint(); syncJson();
  };
  $("#map-from-json", body).onclick = () => {
    try {
      const j = JSON.parse(($("#map-json", body) as HTMLTextAreaElement).value);
      m.payload = { ...emptyMap(), ...j, w: 8, h: 8 };
      ensurePayload(m);
      render(); // full re-render
      toast("JSON применён");
    } catch { toast("Битый JSON", true); }
  };
}

function emptyScene(): ScenePayload {
  return { bg: "", beats: [{ speaker: "Рассказчик", portrait: null, text: "…", side: "center" }] };
}

function renderVn(body: HTMLElement) {
  const m = curMap();
  if (!m) {
    body.innerHTML = `<div class="cc-panel"><h2>Новелла</h2><div class="empty">Выбери карту.</div></div>`;
    return;
  }
  if (!m.sceneBefore) m.sceneBefore = emptyScene();
  if (!m.sceneAfter) m.sceneAfter = emptyScene();
  body.innerHTML = `<div class="cc-grid cc-admin-grid">
    <div class="cc-panel">
      <h2>До боя · ${esc(m.title)}</h2>
      <div id="vn-before"></div>
    </div>
    <div class="cc-panel">
      <h2>После боя</h2>
      <div id="vn-after"></div>
    </div>
  </div>
  <div class="cc-panel" style="margin-top:12px">
    <button class="btn gold" id="vn-save" type="button">Сохранить новеллу</button>
  </div>`;

  const drawScene = (el: HTMLElement, sc: ScenePayload, key: "before" | "after") => {
    el.innerHTML = `<label class="fld"><span>Фон</span><input data-bg="${key}" value="${esc(sc.bg)}" placeholder="/chess/vn/bg1.png" /></label>
      <div class="vn-beats"></div>
      <button type="button" class="btn sm" data-addbeat="${key}">+ реплика</button>`;
    const box = el.querySelector(".vn-beats")!;
    box.innerHTML = sc.beats.map((b, i) => `<div class="vn-beat">
      <input data-k="${key}" data-i="${i}" data-f="speaker" value="${esc(b.speaker)}" placeholder="Кто" />
      <select data-k="${key}" data-i="${i}" data-f="side">
        <option value="left"${b.side === "left" ? " selected" : ""}>слева</option>
        <option value="center"${b.side === "center" ? " selected" : ""}>центр</option>
        <option value="right"${b.side === "right" ? " selected" : ""}>справа</option>
      </select>
      <textarea data-k="${key}" data-i="${i}" data-f="text" rows="2">${esc(b.text)}</textarea>
      <button type="button" class="btn ghost sm" data-rmbeat="${key}:${i}">×</button>
    </div>`).join("");
    const scOf = (k: string) => (k === "before" ? m.sceneBefore! : m.sceneAfter!);
    el.querySelectorAll("input,select,textarea").forEach((node) => {
      node.addEventListener("change", () => {
        const e = node as HTMLInputElement;
        if (e.dataset.bg) { scOf(e.dataset.bg).bg = e.value; return; }
        const beat = scOf(e.dataset.k!)!.beats[+e.dataset.i!];
        (beat as any)[e.dataset.f!] = e.value;
      });
    });
    el.querySelectorAll("[data-rmbeat]").forEach((b) => b.addEventListener("click", () => {
      const [k, is] = (b as HTMLElement).dataset.rmbeat!.split(":");
      const s = scOf(k); s.beats.splice(+is, 1);
      if (!s.beats.length) s.beats.push({ speaker: "Рассказчик", portrait: null, text: "…", side: "center" });
      drawScene(el, s, k as any);
    }));
    el.querySelectorAll("[data-addbeat]").forEach((b) => b.addEventListener("click", () => {
      const k = (b as HTMLElement).dataset.addbeat!;
      scOf(k).beats.push({ speaker: "", portrait: null, text: "", side: "left" });
      drawScene(el, scOf(k), k as any);
    }));
  };
  drawScene($("#vn-before", body), m.sceneBefore, "before");
  drawScene($("#vn-after", body), m.sceneAfter, "after");
  $("#vn-save", body).onclick = () => {
    const c = curCamp(); if (c) c.updated = Date.now();
    persist(); toast("Новелла сохранена");
  };
}

function renderHome(body: HTMLElement) {
  menu = loadHomeMenu();
  body.innerHTML = `<div class="cc-grid cc-admin-grid">
    <div class="cc-panel">
      <h2>Главный экран</h2>
      <label class="fld"><span>Заголовок</span><input id="hm-title" maxlength="64" value="${esc(menu.title)}" /></label>
      <label class="fld"><span>Подзаголовок</span><input id="hm-tag" maxlength="200" value="${esc(menu.tag)}" /></label>
      <div class="fld"><span>Фон</span>
        <select id="hm-bg"><option value="hall"${menu.bg === "hall" ? " selected" : ""}>Зал</option>
        <option value="terrace"${menu.bg === "terrace" ? " selected" : ""}>Терраса</option></select>
      </div>
      <h3>Кнопки</h3>
      <div id="hm-btns"></div>
      <button class="btn" id="hm-add" type="button">+ Кнопка</button>
      <div class="row-actions" style="margin-top:12px">
        <button class="btn gold" id="hm-save" type="button">Сохранить меню</button>
        <button class="btn ghost" id="hm-reset" type="button">Сброс</button>
      </div>
    </div>
    <div class="cc-panel">
      <h2>Превью лобби</h2>
      <div class="hm-preview" id="hm-prev"></div>
      <p class="hint">Клиент читает это меню из localStorage (${esc("chess_home_menu_v1")}). Действия: bot / host / join / campaign / map / url.</p>
    </div>
  </div>`;

  const campOpts = () => camps.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("");
  const mapOpts = () => {
    const o: string[] = [];
    for (const c of camps) for (const ch of c.chapters) for (const m of ch.maps)
      o.push(`<option value="${m.id}">${esc(c.title)} / ${esc(m.title)}</option>`);
    return o.join("");
  };

  const drawBtns = () => {
    const box = $("#hm-btns", body);
    box.innerHTML = menu.buttons.map((b, i) => `<div class="hm-btn-ed">
      <input data-i="${i}" data-f="label" value="${esc(b.label)}" maxlength="40" />
      <select data-i="${i}" data-f="style">
        <option value="gold"${b.style === "gold" ? " selected" : ""}>gold</option>
        <option value="normal"${b.style === "normal" ? " selected" : ""}>normal</option>
        <option value="ghost"${b.style === "ghost" ? " selected" : ""}>ghost</option>
      </select>
      <select data-i="${i}" data-f="action">
        ${(["bot", "host", "join", "campaign", "map", "url", "none"] as MenuAction[]).map((a) =>
          `<option value="${a}"${b.action === a ? " selected" : ""}>${a}</option>`).join("")}
      </select>
      <input data-i="${i}" data-f="targetId" value="${esc(b.targetId)}" placeholder="id / url" list="hm-targets-${i}" />
      <datalist id="hm-targets-${i}">${b.action === "campaign" ? campOpts() : b.action === "map" ? mapOpts() : ""}</datalist>
      <button type="button" class="btn ghost sm" data-up="${i}">↑</button>
      <button type="button" class="btn ghost sm" data-dn="${i}">↓</button>
      <button type="button" class="btn ghost sm" data-rm="${i}">×</button>
    </div>`).join("");
    box.querySelectorAll("input,select").forEach((node) => {
      node.addEventListener("change", () => {
        const e = node as HTMLInputElement;
        const i = +e.dataset.i!, f = e.dataset.f as keyof MenuBtn;
        (menu.buttons[i] as any)[f] = e.value;
        if (f === "action") drawBtns();
        preview();
      });
    });
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      menu.buttons.splice(+(b as HTMLElement).dataset.rm!, 1); drawBtns(); preview();
    }));
    box.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => {
      const i = +(b as HTMLElement).dataset.up!; if (i <= 0) return;
      const t = menu.buttons[i]; menu.buttons[i] = menu.buttons[i - 1]; menu.buttons[i - 1] = t;
      drawBtns(); preview();
    }));
    box.querySelectorAll("[data-dn]").forEach((b) => b.addEventListener("click", () => {
      const i = +(b as HTMLElement).dataset.dn!; if (i >= menu.buttons.length - 1) return;
      const t = menu.buttons[i]; menu.buttons[i] = menu.buttons[i + 1]; menu.buttons[i + 1] = t;
      drawBtns(); preview();
    }));
  };

  const preview = () => {
    menu.title = ($("#hm-title", body) as HTMLInputElement).value;
    menu.tag = ($("#hm-tag", body) as HTMLInputElement).value;
    menu.bg = ($("#hm-bg", body) as HTMLSelectElement).value as any;
    const prev = $("#hm-prev", body);
    prev.innerHTML = `<div class="cc-title"><span class="dia"></span><h2>${esc(menu.title)}</h2><span class="dia"></span></div>
      <p class="tag">${esc(menu.tag)}</p>
      <div class="cc-modes">${menu.buttons.map((b) =>
        `<div class="btn cc-mode ${b.style === "gold" ? "gold" : ""} ${b.style === "ghost" ? "ghost" : ""}"><b>${esc(b.label)}</b><small>${esc(b.action)}${b.targetId ? " → " + esc(b.targetId) : ""}</small></div>`
      ).join("")}</div>
      <div class="hm-bg-tag">bg: ${esc(menu.bg)}</div>`;
  };

  drawBtns();
  preview();
  ["hm-title", "hm-tag", "hm-bg"].forEach((id) => $( "#" + id, body).addEventListener("input", preview));
  $("#hm-add", body).onclick = () => {
    if (menu.buttons.length >= 12) return;
    menu.buttons.push({ id: uid(), label: "Кнопка", style: "normal", action: "none", targetId: "" });
    drawBtns(); preview();
  };
  $("#hm-save", body).onclick = () => {
    preview();
    saveHomeMenu(menu);
    toast("Меню главного экрана сохранено");
  };
  $("#hm-reset", body).onclick = () => {
    menu = { ...DEFAULT_HOME, buttons: DEFAULT_HOME.buttons.map((b) => ({ ...b })) };
    saveHomeMenu(menu);
    render();
  };
}

function toast(t: string, bad = false) {
  let box = document.getElementById("cc-toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "cc-toasts";
    box.className = "cc-toasts";
    document.body.appendChild(box);
  }
  const d = document.createElement("div");
  d.className = "cc-toast " + (bad ? "bad" : "good");
  d.textContent = t;
  box.appendChild(d);
  setTimeout(() => d.remove(), bad ? 5000 : 2800);
}

export async function bootAdmin() {
  camps = loadCampaigns();
  // migrate v1 flat maps → chapter
  try {
    const raw = localStorage.getItem("chess_campaigns_v1");
    if (raw && !camps.length) {
      const old = JSON.parse(raw);
      if (Array.isArray(old)) {
        for (const o of old) {
          camps.push({
            id: o.id || uid(), title: o.title || "Кампания", updated: o.updated || Date.now(),
            chapters: [{ id: uid(), title: "Глава 1", maps: (o.maps || []).map((m: any) => ({
              id: m.id || uid(), title: m.title || "Карта", payload: m.payload || emptyMap(),
              sceneBefore: m.sceneBefore || null, sceneAfter: null,
            })) }],
          });
        }
        persist();
      }
    }
  } catch {}

  const g = await checkGate();
  if (!g.ok) { showDeny(g.msg || "Нет доступа"); return; }
  who = g.who || "Lorin Death";
  shell();
  if (camps[0]) {
    campId = camps[0].id;
    chapId = camps[0].chapters[0]?.id || null;
    mapId = curChap()?.maps[0]?.id || null;
  }
  render();
}

// Автозапуск на странице админки
if (document.getElementById("cc-admin-root")) {
  bootAdmin();
}

export { loadHomeMenu, loadCampaigns, DEFAULT_HOME };
