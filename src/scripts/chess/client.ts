// Боевые шахматы — клиент. Лобби + бот + ОД. Слово «шах» не используем: только мат / угроза.
// Поле: чистовик B (board/) + волна 2 bg/props/ui из chess-combat-set-v1.
import {
  newGame, doMove, doAttack, doAbility, endTurn, view, moves, attacks, abilities, byId, at,
  STATS, FIG, type Game, type Piece, type Side, type Attack,
} from "../../../server/chess/rules";
import { localApply } from "../../../server/chess/rating";
import { anim, frame, frameAt, dirTo, type SheetSet, type Dir, type Rect } from "./sprites";
import { loadHomeMenu, loadCampaigns, DEFAULT_HOME, type HomeMenu, type MenuBtn } from "./storage";

const qs = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const HTTP = (import.meta as any).env?.PUBLIC_MP_HTTP
  || (LOCAL ? "http://127.0.0.1:8787" : "https://morris-multiplayer.alexseylyou.workers.dev");

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

/** Чистовик B: ассеты в /chess/board|bg|props|ui (не ранний B_artdeco/). */
const TILE = (light: boolean, i: number) =>
  `/chess/board/tiles/${light ? "light" : "dark"}_${String(i % 3).padStart(2, "0")}_64.png`;
const HL = (k: "move" | "attack" | "selected" | "threat") =>
  `/chess/board/highlights/highlight_${k}_64.png`;
const SPEC = (k: "danger" | "boost", ph: number) =>
  `/chess/board/special/${k}_ph${ph % 4}_64.png`;
const PROP = (name: string, ph = 0) => {
  const anim = PROP_FRAMES[name];
  if (anim) return `/chess/props/${name}_ph${ph % anim}_64.png`;
  return `/chess/props/${name}_64.png`;
};
const PROP_FRAMES: Record<string, number> = { portal: 8, lamp: 8, crystal: 4 };
const PROP_ANCHOR: [number, number] = [32, 60]; // manifest.anchor_prop @64

type Mode = "bot" | "host" | "join";
type MapProp = { prop: string; x: number; y: number };
type MapSpecial = { kind: "danger" | "boost"; x: number; y: number };
type MapDecor = { bg: "hall" | "terrace"; props: MapProp[]; special: MapSpecial[] };

/** Демо-карта для бота/скринов: пропы только если карта задаёт (здесь — демо). */
const DEMO_MAP: MapDecor = {
  bg: "hall",
  props: [
    { prop: "lamp", x: 0, y: 3 },
    { prop: "rock", x: 1, y: 4 },
    { prop: "crystal", x: 7, y: 3 },
    { prop: "portal", x: 6, y: 4 },
    { prop: "column_rubble", x: 3, y: 3 },
    { prop: "ruins_arch", x: 4, y: 4 },
  ],
  special: [
    { kind: "boost", x: 2, y: 3 },
    { kind: "danger", x: 5, y: 4 },
  ],
};

let playMode: Mode = "bot";
let G: Game | null = null;
let mySide: Side = "w";
let vsBot = true;
let sel: Piece | null = null;
let uiMode: "move" | "ab" = "move";
let screen: "home" | "wait" | "play" | "results" = "home";
let spr: Record<string, SheetSet> = {};
let tileIm: Record<string, HTMLImageElement> = {};
let hlIm: Record<string, HTMLImageElement> = {};
let specIm: Record<string, HTMLImageElement> = {};
let propIm: Record<string, HTMLImageElement> = {};
let mapDecor: MapDecor = { bg: "hall", props: [], special: [] };
let resultInfo: { winner: Side; delta: number | null } | null = null;

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(i);
    i.src = src;
  });
}

function setBg(name: "hall" | "terrace") {
  const app = document.querySelector(".cc-app") as HTMLElement | null;
  if (!app) return;
  const portrait = window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches;
  const file = portrait ? `${name}_portrait_hd.png` : `${name}_landscape_hd.png`;
  app.style.setProperty("--cc-scene", `url(/chess/bg/${file})`);
  app.dataset.bg = name;
}

function applyMap(m: MapDecor) {
  mapDecor = m;
  setBg(m.bg);
}

async function preload() {
  for (const s of ["w", "b"] as Side[]) for (const [t, f] of Object.entries(FIG)) {
    const base = `/chess/art/${s === "w" ? "light" : "dark"}/${f}/`;
    try {
      const j = await fetch(base + "sheet.json").then((r) => r.json());
      const im = await loadImg(base + (j.image || "sheet.png"));
      if (im.naturalWidth) spr[s + t] = { im, j, side: s, frames: new Map() };
    } catch { /* skip */ }
  }
  for (let i = 0; i < 3; i++) {
    tileIm["L" + i] = await loadImg(TILE(true, i));
    tileIm["D" + i] = await loadImg(TILE(false, i));
  }
  for (const k of ["move", "attack", "selected", "threat"] as const) hlIm[k] = await loadImg(HL(k));
  for (const k of ["danger", "boost"] as const) for (let ph = 0; ph < 4; ph++) {
    specIm[k + ph] = await loadImg(SPEC(k, ph));
  }
  const propNames = ["rock", "column_rubble", "ruins_arch", "portal", "lamp", "crystal"];
  for (const n of propNames) {
    const frames = PROP_FRAMES[n] || 1;
    for (let ph = 0; ph < frames; ph++) propIm[n + ph] = await loadImg(PROP(n, ph));
  }
}

function show(sc: typeof screen) {
  screen = sc;
  document.querySelectorAll(".cc-screen").forEach((el) => el.classList.toggle("on", el.id === "sc-" + sc));
  document.body.dataset.screen = sc;
}

let clerkUser: { id: string; name: string } | null = null;
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

async function identifyClerk() {
  if (LOCAL && qs.get("devUser")) {
    const id = qs.get("devUser")!;
    clerkUser = { id, name: id === "user_38QeREOr606p1c96P4f14YFsLp7" ? "Lorin Death" : ("Игрок-" + id.slice(-4)) };
    return;
  }
  try {
    const C = await clerkReady();
    const u = C?.user;
    if (u?.id) {
      const name = (u.username || u.firstName || u.fullName || "").trim() || ("Игрок-" + u.id.slice(-4));
      clerkUser = { id: u.id, name };
    }
  } catch { /* guest */ }
}

function nick(): string {
  if (clerkUser?.name) return clerkUser.name;
  const n = ($("#nick") as HTMLInputElement)?.value?.trim();
  return n || "Гость";
}

function playerKey(): string {
  if (clerkUser?.id) return clerkUser.id;
  if (LOCAL && qs.get("devUser")) return qs.get("devUser")!;
  let g = localStorage.getItem("chess_guest");
  if (!g) { g = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("chess_guest", g); }
  return "guest:" + g.slice(0, 16);
}

function setMode(m: Mode) {
  playMode = m;
  document.querySelectorAll(".cc-mode").forEach((el) => el.classList.toggle("on", (el as HTMLElement).dataset.pm === m));
  const join = $("#joinrow"); if (join) join.hidden = m !== "join";
  const pw = $("#lob-private-wrap"); if (pw) pw.hidden = m !== "host";
}

let homeMenu: HomeMenu = DEFAULT_HOME;
let pendingAction: MenuBtn | null = null;

function findMapById(id: string) {
  for (const c of loadCampaigns()) for (const ch of c.chapters) for (const m of ch.maps) if (m.id === id) return m;
  return null;
}

function startFromMenu(b: MenuBtn) {
  pendingAction = b;
  if (b.action === "bot") { setMode("bot"); startBot(false); return; }
  if (b.action === "host") { setMode("host"); createLobby(); return; }
  if (b.action === "join") { setMode("join"); const jr = $("#joinrow"); if (jr) jr.hidden = false; return; }
  if (b.action === "url" && b.targetId) { location.href = b.targetId; return; }
  if (b.action === "map" && b.targetId) {
    const m = findMapById(b.targetId);
    if (!m) { alert("Карта не найдена — открой админку и сохрани её."); return; }
    startBot(false);
    const units = m.payload?.units || [];
    // декор с карты (кампания может иметь пропы); классика меню — без
    applyMap({
      bg: (m.payload?.bg === "terrace" ? "terrace" : "hall"),
      props: m.payload?.props || [],
      special: m.payload?.special || [],
    });
    if (G && units.length) {
      // пересобрать фигуры с карты
      G.pieces = [];
      let nid = 1;
      for (const u of units) {
        const hp = u.hp != null ? u.hp : (STATS as any)[u.type]?.hp || 10;
        G.pieces.push({ id: nid++, t: u.type as any, s: u.side as Side, x: u.x, y: u.y, hp, mh: hp, cd: 0 });
      }
      G.nextId = nid;
      draw();
    }
    return;
  }
  if (b.action === "campaign" && b.targetId) {
    const c = loadCampaigns().find((x) => x.id === b.targetId);
    const m = c?.chapters[0]?.maps[0];
    if (!m) { alert("В кампании пока нет карт."); return; }
    startFromMenu({ ...b, action: "map", targetId: m.id });
    return;
  }
}

function renderHomeMenu() {
  homeMenu = loadHomeMenu();
  const title = $("#home-title"); if (title) title.textContent = homeMenu.title;
  const tag = $("#home-tag"); if (tag) tag.textContent = homeMenu.tag;
  setBg(homeMenu.bg);
  const box = $("#home-buttons");
  if (box) {
    const btns = homeMenu.buttons.length ? homeMenu.buttons : DEFAULT_HOME.buttons;
    box.innerHTML = btns.map((b) => {
      const pm = b.action === "bot" || b.action === "host" || b.action === "join" ? ` data-pm="${b.action}"` : "";
      const cls = `btn cc-mode ${b.style === "gold" ? "gold" : ""} ${b.style === "ghost" ? "ghost" : ""}${b.action === playMode ? " on" : ""}`;
      return `<button type="button" class="${cls}" data-bid="${b.id}"${pm}><b>${b.label}</b><small>${
        b.action === "bot" ? "сразу за стол, рейтинг не считается"
        : b.action === "host" ? "код для друга · 8×8"
        : b.action === "join" ? "онлайн 1×1"
        : b.action === "campaign" ? "глава кампании"
        : b.action === "map" ? "карта из редактора"
        : b.action === "url" ? "ссылка"
        : ""
      }</small></button>`;
    }).join("");
    box.querySelectorAll("[data-bid]").forEach((el) => el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.bid!;
      const b = (homeMenu.buttons.length ? homeMenu.buttons : DEFAULT_HOME.buttons).find((x) => x.id === id);
      if (!b) return;
      if (b.action === "bot" || b.action === "host" || b.action === "join") setMode(b.action);
      else startFromMenu(b);
    }));
  }
  const campBox = $("#camp-play");
  if (campBox) {
    const camps = loadCampaigns();
    campBox.innerHTML = camps.length
      ? camps.map((c) => {
          const first = c.chapters[0]?.maps[0];
          return `<div class="row"><span><b>${c.title}</b> · ${c.chapters.reduce((n, ch) => n + ch.maps.length, 0)} карт</span>
            <button class="btn sm" data-camp="${c.id}" ${first ? "" : "disabled"}>Играть</button></div>`;
        }).join("")
      : `<div class="empty">Кампаний пока нет</div>`;
    campBox.querySelectorAll("[data-camp]").forEach((b) => b.addEventListener("click", () => {
      startFromMenu({ id: "c", label: "", style: "gold", action: "campaign", targetId: (b as HTMLElement).dataset.camp! });
    }));
  }
  const nickWrap = $("#nick-wrap");
  if (nickWrap) nickWrap.hidden = !!clerkUser;
}


async function refreshOpen() {
  const box = $("#open"); if (!box) return;
  try {
    const r = await fetch(HTTP + "/chess/open");
    const j: any = r.ok ? await r.json() : { list: [] };
    const list = j.list || [];
    box.innerHTML = list.length
      ? list.map((l: any) => `<div class="row"><span><b>${l.code}</b> · ${esc(l.host || "хост")}</span><button class="btn sm" data-join="${l.code}">Войти</button></div>`).join("")
      : `<div class="empty">Пока пусто — создай лобби или сыграй с ботом</div>`;
    box.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => {
      ($("#joincode") as HTMLInputElement).value = (b as HTMLElement).dataset.join || "";
      setMode("join"); joinLobby((b as HTMLElement).dataset.join);
    }));
  } catch {
    box.innerHTML = `<div class="empty">Сервер лобби недоступен — можно играть с ботом</div>`;
  }
}

// ───────────────────────── онлайн 1×1 (ChessMatch DO, ходы авторитетны на сервере) ─────────────────────────
const WSB = HTTP.replace(/^http/, "ws");
type SeatV = { nick: string; side: Side; rated: boolean; rating: number | null; online: boolean };
type ResV = { winner: Side; reason: "mate" | "resign" | "forfeit"; turns: number; ap: Record<Side, number>; unrated: string | null;
  seats: { nick: string; side: Side; rating: { before: number; after: number; delta: number; provisional: boolean } | null }[] };
let net: WebSocket | null = null;
let online = false;
let netCode = "";
let netSeats: SeatV[] = [];
let netRated = false;
let netRetry = 0;
let netClosedByMe = false;

async function helloIdent(): Promise<Record<string, string>> {
  if (LOCAL && qs.get("devUser")) return { userId: qs.get("devUser")!, nick: nick() };
  try { const C = await clerkReady(); const t = await C?.session?.getToken?.(); if (t) return { token: t, nick: nick() }; } catch { /* гость */ }
  let g = localStorage.getItem("chess_guest");
  if (!g) { g = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("chess_guest", g); }
  return { guest: g, nick: nick() };
}
async function authQuery(): Promise<{ q: string; h: Record<string, string> } | null> {
  if (LOCAL && qs.get("devUser")) return { q: "?devUser=" + encodeURIComponent(qs.get("devUser")!), h: {} };
  try { const C = await clerkReady(); const t = await C?.session?.getToken?.(); if (t) return { q: "", h: { Authorization: "Bearer " + t } }; } catch {}
  return null;
}

function waitScreen(code: string, msg: string) {
  show("wait");
  const c = $("#wait-code"); if (c) c.textContent = code || "······";
  const m = $("#wait-msg"); if (m) m.textContent = msg;
  renderSeats();
}
function renderSeats() {
  const box = $("#wait-seats"); if (!box) return;
  const seat = (s: Side) => netSeats.find((x) => x.side === s);
  box.innerHTML = (["w", "b"] as Side[]).map((sd) => {
    const x = seat(sd);
    return `<div class="seat ${sd}${x ? "" : " empty"}"><i class="lg ${sd}"></i><b>${x ? esc(x.nick) : "ждём соперника…"}</b>
      <small>${sd === "w" ? "светлые" : "тёмные"}${x ? (x.rated ? ` · ${x.rating ?? 1500}` : " · гость, без рейтинга") : ""}</small></div>`;
  }).join(`<span class="vs">против</span>`);
}
const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function netSend(o: any) { if (net && net.readyState === 1) net.send(JSON.stringify(o)); }
function netClose() { netClosedByMe = true; try { net?.close(); } catch {} net = null; online = false; }

async function connectOnline(code: string) {
  netClose(); netClosedByMe = false;
  netCode = code; online = true; netSeats = [];
  const ws = new WebSocket(`${WSB}/chess/m/${code}`); net = ws;
  const ident = await helloIdent();
  ws.addEventListener("open", () => { netRetry = 0; ws.send(JSON.stringify({ type: "hello", ...ident })); });
  ws.addEventListener("message", (e) => { if (net === ws) onNet(JSON.parse(String(e.data))); });
  ws.addEventListener("close", () => {
    if (net !== ws || netClosedByMe) return;
    if (G && !G.winner && netRetry < 6) { netRetry++; toast("Связь потеряна — переподключаюсь…"); setTimeout(() => { if (net === ws) reconnect(); }, 600 * netRetry); }
  });
}
async function reconnect() { const c = netCode; const keepG = G; await connectOnline(c); G = keepG; online = true; }

function onNet(m: any) {
  if (m.type === "err") {
    if (m.err === "full") { netClose(); toast("Лобби уже занято"); show("home"); refreshOpen(); }
    else if (m.err?.startsWith?.("auth")) toast("Сессия не подтвердилась — войди заново");
    else if (m.err !== "illegal") toast("Сервер: " + m.err);
    return;
  }
  if (m.type === "hello_ok") { mySide = m.you.side; netRated = !!m.you.rated; return; }
  if (m.type === "lobby") {
    netSeats = m.lobby.seats || [];
    if (screen === "wait") renderSeats();
    if (screen === "play") draw();
    return;
  }
  if (m.type === "state") {
    const st = m.state as Game;
    if (!G || m.start || screen !== "play") { beginOnline(st); return; }
    const before = G.pieces.map((q) => ({ ...q }));
    const shB = { w: G.shield.w ? { ...G.shield.w } : null, b: G.shield.b ? { ...G.shield.b } : null };
    G = { ...st, nextId: 0 } as Game;
    if (sel) sel = byId(G, sel.id) || null;
    const L = m.last;
    if (L && L.kind !== "end") juice(before, shB, L.kind, L.id, L.tgt, !!L.ranged);
    afterAct();
    return;
  }
  if (m.type === "result") {
    const r = m.result as ResV;
    setTimeout(() => finishOnline(r), screen === "play" ? Math.max(1700, busyUntil - now() + 1500) : 0);
  }
}

function beginOnline(st: Game) {
  vsBot = false; flipView = mySide === "b"; G = { ...st, nextId: 0 } as Game; sel = null; uiMode = "move"; resultInfo = null;
  tweens.clear(); atks.clear(); punches.clear(); hpView.clear(); fxs = [];
  applyMap({ bg: "hall", props: [], special: [] }); // онлайн-классика — только фигуры
  lastSide = G.side; lastAp = G.ap;
  show("play"); draw();
  const opp = netSeats.find((s) => s.side !== mySide);
  fxs.push({ k: "banner", t0: now() + 150, dur: 1300, text: G.side === mySide ? "Ваш ход" : "Ход соперника", sub: `вы — ${mySide === "w" ? "светлые" : "тёмные"}${opp ? " · против " + opp.nick : ""}` });
}

async function createLobby() {
  if (playMode === "bot") { startBot(false); return; }
  waitScreen("", "Создаю лобби…");
  try {
    const r = await fetch(HTTP + "/chess/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pub: !(($("#lob-private") as HTMLInputElement)?.checked) }) });
    const j: any = await r.json();
    if (!j.code) throw new Error(j.err || "fail");
    waitScreen(j.code, "Отправь код другу или жди — лобби видно в списке «Ждут соперника».");
    await connectOnline(j.code);
  } catch {
    show("home"); toast("Сервер лобби недоступен — можно сыграть с ботом");
  }
}

async function joinLobby(codeArg?: string) {
  const code = (codeArg || ($("#joincode") as HTMLInputElement)?.value || "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) { toast("Код — 6 символов, например K7QX2M"); return; }
  waitScreen(code, "Подключаюсь…");
  await connectOnline(code);
}

let toastT = 0;
function toast(t: string) {
  let el = $("#cc-toast");
  if (!el) { el = document.createElement("div"); el.id = "cc-toast"; el.className = "cc-toast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.add("on"); clearTimeout(toastT);
  toastT = window.setTimeout(() => el!.classList.remove("on"), 2600);
}

function finishOnline(r: ResV) {
  const won = r.winner === mySide;
  resultInfo = { winner: r.winner, delta: null };
  const why = r.reason === "mate" ? "ставят <b>мат</b> — король пал" : r.reason === "resign" ? "побеждают — соперник сдался" : "побеждают — соперник не вернулся";
  const unr: Record<string, string> = { guest: "гость в партии — рейтинг не считается", too_early: "слишком короткая партия — без рейтинга", self: "сам с собой — без рейтинга", no_db: "рейтинг недоступен", db_error: "ошибка записи рейтинга" };
  const rows = (["w", "b"] as Side[]).map((sd) => {
    const x = r.seats.find((q) => q.side === sd); if (!x) return "";
    const d = x.rating;
    return `<div class="rr ${sd}${sd === mySide ? " me" : ""}"><i class="lg ${sd}"></i><b>${esc(x.nick)}${sd === mySide ? " (вы)" : ""}</b>
      <span class="ap">ОД ${r.ap[sd]}</span>
      ${d ? `<span class="rt">${d.before} → <b>${d.after}</b> <em class="${d.delta >= 0 ? "up" : "down"}">${d.delta >= 0 ? "+" : ""}${d.delta}</em>${d.provisional ? ' <small title="меньше 10 партий">пред.</small>' : ""}</span>` : `<span class="rt muted">—</span>`}</div>`;
  }).join("");
  const box = $("#res-body");
  if (box) box.innerHTML = `<p class="big">${won ? "Победа!" : "Поражение."}</p>
    <p>${r.winner === "w" ? "Светлые" : "Тёмные"} ${why}. Ходов: ${r.turns}.</p>
    <div class="cc-rtable">${rows}</div>
    ${r.unrated ? `<p class="cc-note">${unr[r.unrated] || "без рейтинга"}</p>` : `<p class="cc-note">Рейтинг «Боевых шахмат» · Glicko-2 · отдельный пул</p>`}`;
  const panel = document.querySelector(".cc-results");
  panel?.classList.toggle("win", won); panel?.classList.toggle("lose", !won);
  const again = $("#btn-again"); if (again) again.textContent = "Новое онлайн-лобби";
  netClose(); online = false; resultInfo = { winner: r.winner, delta: null };
  show("results");
  refreshMe();
}

async function refreshMe() {
  const box = $("#my-rating"); if (!box) return;
  const a = await authQuery();
  if (!a) { box.innerHTML = `<div class="empty">Войди на сайт, чтобы попасть в рейтинг. Гости и бот не рейтингуются.</div>`; return; }
  try {
    const [me, top]: any[] = await Promise.all([
      fetch(HTTP + "/chess/me" + a.q, { headers: a.h }).then((r) => r.json()),
      fetch(HTTP + "/chess/top").then((r) => r.json()).catch(() => ({ top: [] })),
    ]);
    const R = me?.rating;
    box.innerHTML = R ? `<div class="me-r"><b>${R.rating}</b><span>${R.provisional ? "предварительный · " : ""}партий ${R.games} · ${R.wins}П / ${R.losses}П·</span></div>`
      .replace("П·", "П") + (top.top?.length ? `<div class="top">${top.top.slice(0, 5).map((x: any) => `<div class="row"><span>${x.place}. ${esc(x.nick || "Игрок")}</span><b>${x.rating}</b></div>`).join("")}</div>` : `<div class="empty">Топ появится после 10 партий у игроков</div>`)
      : `<div class="empty">Рейтинг недоступен</div>`;
  } catch { box.innerHTML = `<div class="empty">Сервер рейтинга недоступен</div>`; }
}

// ───────────────────────── партия: состояние анимаций / «сок» ─────────────────────────
const now = () => performance.now();
const ATK_SPEED = 1.5;          // ускорение анимации удара относительно fps из sheet.json
const MOVE_MS = 170;            // короткий lerp фигуры к цели
type Tween = { fx: number; fy: number; t0: number; dur: number; hop: number };
type AtkAnim = { t0: number; d: Dir; name: string; lunge: [number, number]; impactMs: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string };
type Fx = { k: string; t0: number; dur: number; [key: string]: any };
const tweens = new Map<number, Tween>();
const atks = new Map<number, AtkAnim>();
const punches = new Map<number, number>();
const hpView = new Map<number, { v: number; hold: number }>();
let fxs: Fx[] = [];
let shake = { t0: 0, dur: 0, mag: 0 };
let hover: [number, number] | null = null;
let busyUntil = 0;
let lastSide: Side | "x" = "w";
let lastAp = 0;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
// переворот доски: онлайн за чёрных — своя армия снизу. fc — клетка/левый край, fp — точка (центр = x+0.5)
let flipView = false;
const fc = (c: number) => (flipView ? 7 - c : c);
const fp = (c: number) => (flipView ? 8 - c : c);
const idleDir = (s: Side): Dir => ((s === "w") !== flipView ? "up" : "down");

function sparks(cx: number, cy: number, n: number, colors: string[], speed = 1, up = 0.6): Spark[] {
  return Array.from({ length: n }, () => {
    const a = rnd(0, Math.PI * 2), v = rnd(0.6, 1.6) * speed;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: rnd(0.55, 1), size: rnd(1, 2.4), color: colors[(Math.random() * colors.length) | 0] };
  });
}
function addShake(at: number, mag: number, dur = 260) {
  if (at + dur > shake.t0 + shake.dur || mag > shake.mag) shake = { t0: at, dur, mag };
}

/** Сравнивает доску до/после действия и запускает эффекты: ход, удар, урон, гибель, щит, мат. */
function juice(before: Piece[], shieldBefore: Game["shield"], kind: "move" | "attack" | "ability", actorId: number, tgt: [number, number] | null, ranged: boolean) {
  if (!G) return;
  const t = now();
  const actorB = before.find((q) => q.id === actorId);
  const actorA = byId(G, actorId);
  if (!actorB) return;
  const key = actorB.s + actorB.t;
  let delay = 0;

  if (kind === "move" && actorA) {
    tweens.set(actorId, { fx: actorB.x, fy: actorB.y, t0: t, dur: MOVE_MS, hop: 0.16 });
    fxs.push({ k: "flash", t0: t, dur: 380, x: actorB.x, y: actorB.y, color: "255,214,130", a: 0.28 });
    fxs.push({ k: "flash", t0: t + MOVE_MS * 0.6, dur: 520, x: actorA.x, y: actorA.y, color: "255,214,130", a: 0.5 });
    fxs.push({ k: "ring", t0: t + MOVE_MS, dur: 420, x: actorA.x, y: actorA.y, color: "255,220,150", r0: 0.15, r1: 0.55, w: 2 });
    fxs.push({ k: "spark", t0: t + MOVE_MS, dur: 520, cx: actorA.x + 0.5, cy: actorA.y + 0.86, ps: sparks(0, 0, 8, ["#e9d6a4", "#cbb27a", "#fff3d0"], 0.35, 0.25), g: 0.6 });
    busyUntil = t + MOVE_MS + 120;
    return;
  }

  // ─ удар / способность
  if (tgt) {
    const dx = tgt[0] - actorB.x, dy = tgt[1] - actorB.y;
    const d = dirTo(flipView ? -dx : dx, flipView ? -dy : dy, idleDir(actorB.s));
    const sheet = spr[key];
    const aname = actorB.t === "Q" ? (ranged ? "attack_ranged" : "attack_melee") : "attack";
    const a = sheet ? anim(sheet, aname, d) : null;
    const impactMs = a ? ((a.impact ?? 4) / (a.fps * ATK_SPEED)) * 1000 : 140;
    atks.set(actorId, { t0: t, d, name: aname, lunge: ranged ? [0, 0] : [Math.sign(dx), Math.sign(dy)], impactMs });
    delay = impactMs;
    if (ranged) {
      const travel = Math.min(340, 60 * Math.hypot(dx, dy) + 70);
      fxs.push({ k: "proj", t0: t + impactMs, dur: travel, key, d, from: [actorB.x, actorB.y], to: tgt });
      delay = impactMs + travel;
    }
  }
  if (kind === "ability") {
    fxs.push({ k: "ring", t0: t, dur: 520, x: actorB.x, y: actorB.y, color: "190,140,255", r0: 0.2, r1: actorB.t === "B" ? 1.6 : 0.8, w: 3 });
    fxs.push({ k: "flash", t0: t, dur: 480, x: actorB.x, y: actorB.y, color: "170,110,255", a: 0.55 });
    if (actorB.t === "B") for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++)
      fxs.push({ k: "flash", t0: t + delay, dur: 520, x: actorB.x + xx, y: actorB.y + yy, color: "220,170,255", a: 0.45 });
  }
  // перемещения после удара: взятие — шаг на клетку после удара; рывок/толчок — сразу
  if (actorA && (actorA.x !== actorB.x || actorA.y !== actorB.y)) {
    const take = tgt && actorA.x === tgt[0] && actorA.y === tgt[1];
    if (take) tweens.set(actorId, { fx: actorB.x, fy: actorB.y, t0: t + delay + 120, dur: MOVE_MS, hop: 0.1 });
    else { tweens.set(actorId, { fx: actorB.x, fy: actorB.y, t0: t, dur: MOVE_MS, hop: 0.04 }); delay = Math.max(delay, MOVE_MS); }
  }

  const hitKey = (q: Piece) => (actorB.t === "Q" && !ranged && kind !== "ability" ? "hit_melee" : "hit");
  let anyHit = false;
  for (const q of before) {
    if (q.id === actorId && kind !== "ability") continue;
    const a = byId(G, q.id);
    const at0 = t + delay;
    if (!a) {
      anyHit = true;
      fxs.push({ k: "ghost", t0: t, dur: delay + 560, die: at0, p: { ...q } });
      fxs.push({ k: "flash", t0: at0, dur: 520, x: q.x, y: q.y, color: "255,70,50", a: 0.7 });
      fxs.push({ k: "sheet", t0: at0, dur: 460, key, name: hitKey(q), x: q.x, y: q.y });
      fxs.push({ k: "spark", t0: at0, dur: 760, cx: q.x + 0.5, cy: q.y + 0.6, ps: sparks(0, 0, 22, ["#ffcf6a", "#ff7a3a", "#ff3b3b", "#fff2c0"], 1.2, 0.7), g: 2.2 });
      fxs.push({ k: "ring", t0: at0, dur: 460, x: q.x, y: q.y, color: "255,120,80", r0: 0.1, r1: 0.9, w: 3 });
      fxs.push({ k: "float", t0: at0, dur: 1000, x: q.x, y: q.y, text: "−" + Math.max(1, q.hp), color: "#ffd66a", big: true });
      addShake(at0, q.t === "K" ? 9 : 5, q.t === "K" ? 520 : 280);
      if (q.t === "K") {
        fxs.push({ k: "burst", t0: at0, dur: 1300, x: q.x, y: q.y });
        fxs.push({ k: "spark", t0: at0, dur: 1300, cx: q.x + 0.5, cy: q.y + 0.5, ps: sparks(0, 0, 46, ["#fff6d8", "#ffd66a", "#e0b050"], 2.2, 0.4), g: 1.2 });
        fxs.push({ k: "banner", t0: at0 + 250, dur: 1400, text: "МАТ", sub: "король пал", gold: true });
      }
    } else if (a.hp < q.hp) {
      anyHit = true;
      const dmg = q.hp - a.hp;
      hpView.set(q.id, { v: q.hp, hold: at0 + 140 });
      punches.set(q.id, at0);
      fxs.push({ k: "flash", t0: at0, dur: 420, x: a.x, y: a.y, color: "255,60,40", a: 0.55 });
      fxs.push({ k: "sheet", t0: at0, dur: 460, key, name: hitKey(q), x: a.x, y: a.y });
      fxs.push({ k: "spark", t0: at0, dur: 560, cx: a.x + 0.5, cy: a.y + 0.55, ps: sparks(0, 0, 12, ["#ffcf6a", "#ff7a3a", "#fff2c0"], 1, 0.6), g: 2 });
      fxs.push({ k: "float", t0: at0, dur: 900, x: a.x, y: a.y, text: "−" + dmg, color: "#ff5a4a" });
      addShake(at0, Math.min(5, 2 + dmg / 25));
    }
  }
  if (!anyHit && tgt && kind !== "ability") {
    fxs.push({ k: "ring", t0: t + delay, dur: 500, x: tgt[0], y: tgt[1], color: "140,200,255", r0: 0.3, r1: 0.7, w: 3 });
    fxs.push({ k: "float", t0: t + delay, dur: 900, x: tgt[0], y: tgt[1], text: "блок", color: "#9fd4ff" });
  }
  (["w", "b"] as Side[]).forEach((s) => {
    const sh = G!.shield[s];
    if (sh && !shieldBefore[s]) fxs.push({ k: "shieldup", t0: t + delay * 0.6, dur: 700, x: sh.x, y: sh.y, s });
  });
  busyUntil = t + delay + 420;
}

/** Действие игрока или бота с эффектами. */
function act(kind: "move" | "attack" | "ability", p: Piece, run: () => boolean, tgt: [number, number] | null, ranged = false) {
  if (!G) return false;
  if (online) { netAct?.(kind, p, tgt); return true; }
  const before = G.pieces.map((q) => ({ ...q }));
  const shB = { w: G.shield.w ? { ...G.shield.w } : null, b: G.shield.b ? { ...G.shield.b } : null };
  const ok = run();
  if (ok) juice(before, shB, kind, p.id, tgt, ranged);
  afterAct();
  return ok;
}
let netAct: ((kind: string, p: Piece, tgt: [number, number] | null) => void) | null = null;
let pendingNet: any = null;
const actMove = (p: Piece, x: number, y: number) => { pendingNet = { act: "move", id: p.id, x, y }; return act("move", p, () => doMove(G!, p, x, y), [x, y]); };
const actAttack = (p: Piece, a: Attack) => { pendingNet = { act: "attack", id: p.id, qId: a.qId }; const q = byId(G!, a.qId); return act("attack", p, () => doAttack(G!, p, a), q ? [q.x, q.y] : null, !!a.ranged); };
const actAbility = (p: Piece, t: { qId?: number; x?: number; y?: number; run: any }) => {
  pendingNet = t.qId != null ? { act: "ability", id: p.id, qId: t.qId } : { act: "ability", id: p.id, x: t.x, y: t.y };
  const q = t.qId != null ? byId(G!, t.qId) : null;
  return act("ability", p, () => doAbility(G!, p, t as any), q ? [q.x, q.y] : (t.x != null ? [t.x, t.y!] : null), false);
};

netAct = () => { if (pendingNet) netSend({ type: "act", ...pendingNet }); pendingNet = null; };

function startBot(withDemo = false) {
  netClose();
  const again = $("#btn-again"); if (again) again.textContent = "Ещё раз с ботом";
  vsBot = true; mySide = "w"; flipView = false;
  G = newGame(); sel = null; uiMode = "move"; resultInfo = null;
  tweens.clear(); atks.clear(); punches.clear(); hpView.clear(); fxs = [];
  // Классика с ботом — только фигуры (без пропов/порталов/башен). DEMO_MAP — для кампаний/превью.
  applyMap(withDemo ? DEMO_MAP : { bg: "hall", props: [], special: [] });
  lastSide = G.side; lastAp = G.ap;
  show("play"); draw();
  fxs.push({ k: "banner", t0: now() + 150, dur: 1100, text: "Ваш ход", sub: "светлые начинают" });
}

function botAct() {
  if (!G || G.side === "x" || G.side === mySide) return;
  if (now() < busyUntil) { setTimeout(botAct, busyUntil - now() + 30); return; }
  const side = G.side;
  const mine = G.pieces.filter((p) => p.s === side);
  for (const p of mine) {
    for (const a of attacks(G, p)) {
      const q = byId(G, a.qId); if (q?.t === "K") { actAttack(p, a); return; }
    }
  }
  let best: { p: Piece; a: Attack; score: number } | null = null;
  for (const p of mine) for (const a of attacks(G, p)) {
    const q = byId(G, a.qId)!; const score = a.dmg + (q.t === "Q" ? 20 : 0) + (q.hp <= a.dmg ? 50 : 0);
    if (!best || score > best.score) best = { p, a, score };
  }
  if (best && G.ap > 0) { actAttack(best.p, best.a); return; }
  const opts: { p: Piece; x: number; y: number }[] = [];
  for (const p of mine) for (const [x, y] of moves(G, p)) opts.push({ p, x, y });
  if (opts.length && G.ap > 0) {
    const o = opts[(Math.random() * opts.length) | 0];
    actMove(o.p, o.x, o.y); return;
  }
  endTurn(G); afterAct();
}

function afterAct() {
  if (!G) return;
  if (G.side !== lastSide && G.side !== "x") {
    const mine = G.side === mySide;
    fxs.push({ k: "banner", t0: Math.max(now(), busyUntil - 200), dur: 1000, text: mine ? "Ваш ход" : "Ход соперника", sub: `ход ${G.turn} · ОД ${G.ap}` });
  }
  if (G.side !== "x" && G.ap < lastAp && G.side === lastSide) bumpAp();
  lastSide = G.side; lastAp = G.ap;
  draw();
  if (G.winner) { if (online) return; const w = G.winner; setTimeout(() => finish(w), Math.max(1700, busyUntil - now() + 1500)); return; }
  if (vsBot && G.side !== mySide && G.side !== "x") setTimeout(botAct, Math.max(520, busyUntil - now() + 260));
}

function bumpAp() {
  const el = $("#ap-pips"); if (!el) return;
  el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
}

function finish(winner: Side) {
  const won = winner === mySide;
  const delta = (!vsBot) ? localApply(playerKey(), won, "opp") : null;
  resultInfo = { winner, delta: delta ? delta.delta : null };
  const box = $("#res-body");
  if (box) {
    box.innerHTML = `<p>${winner === "w" ? "Светлые" : "Тёмные"} ставят <b>мат</b> — король пал.</p>
      <p>${won ? "Победа!" : "Поражение."}${vsBot ? " (против бота, рейтинг не считается)" : ""}</p>
      ${delta ? `<p class="delta">Рейтинг ${delta.before.toFixed(0)} → ${delta.after.toFixed(0)} (${delta.delta >= 0 ? "+" : ""}${delta.delta.toFixed(0)})</p>` : ""}`;
  }
  const panel = document.querySelector(".cc-results");
  panel?.classList.toggle("win", won);
  panel?.classList.toggle("lose", !won);
  show("results");
}

// ───────────────────────── HUD (DOM) ─────────────────────────
function draw() {
  if (!G) return;
  const v = view(G);
  const apMax = G.side === "x" ? 0 : G.apMax[G.side as Side];
  const ap = G.side === "x" ? 0 : G.ap;
  const pips = $("#ap-pips");
  if (pips) pips.innerHTML = Array.from({ length: Math.max(apMax, 1) }, (_, i) => `<i class="${i < ap ? "on" : ""}"></i>`).join("");
  const apn = $("#ap-num"); if (apn) apn.textContent = G.side === "x" ? "—" : `${ap} / ${apMax}`;
  const nextGrow = 15 - (G.turnsDone[mySide] % 15);
  const apHint = $("#ap-hint"); if (apHint) apHint.textContent = `+1 ОД через ${nextGrow} ${nextGrow === 1 ? "ход" : nextGrow < 5 ? "хода" : "ходов"}`;
  const turnEl = $("#turn-label");
  if (turnEl) {
    if (G.winner) turnEl.innerHTML = `<span class="me">Мат</span>`;
    else turnEl.innerHTML = G.side === mySide
      ? `<span class="me">Ваш ход</span><small>ход ${G.turn}</small>`
      : `<span class="opp">Ход ${G.side === "w" ? "светлых" : "тёмных"}</span><small>ход ${G.turn}</small>`;
    turnEl.classList.toggle("mine", G.side === mySide);
  }
  const leg = $("#legend");
  if (leg) {
    if (vsBot) leg.innerHTML = `<span><i class="lg w"></i>светлые — вы</span><span><i class="lg b"></i>тёмные — бот</span>`;
    else {
      const me = netSeats.find((x) => x.side === mySide), op = netSeats.find((x) => x.side !== mySide);
      const tag = (x?: SeatV) => x ? `${esc(x.nick)}${x.rated ? ` · ${x.rating ?? 1500}` : " · гость"}${x.online ? "" : ' <em class="off">нет связи</em>'}` : "—";
      leg.innerHTML = `<span><i class="lg ${mySide}"></i>вы: ${tag(me)}</span><span><i class="lg ${mySide === "w" ? "b" : "w"}"></i>${tag(op)}</span>`;
    }
  }
  const rs = $("#btn-resign") as HTMLButtonElement | null; if (rs) { rs.hidden = vsBot; rs.disabled = !!G.winner; }
  const th = $("#threat");
  if (th) th.textContent = v.threat[mySide] ? "⚠ Король под угрозой — защити его" : "";
  const info = $("#info");
  if (info) {
    if (sel) {
      const st = STATS[sel.t]; const f = Math.max(0, sel.hp) / sel.mh;
      const nm = attacks(G, sel).length, mv = moves(G, sel).length;
      info.innerHTML = `<div class="pc-name">${st.name}<span class="side ${sel.s}">${sel.s === "w" ? "светлые" : "тёмные"}</span></div>
        <div class="pc-hp"><i style="width:${(f * 100).toFixed(0)}%"></i></div>
        <div class="pc-meta">HP ${sel.hp}/${sel.mh}${sel.cd ? ` · перезарядка ${sel.cd}` : ""} · ходов ${mv} · целей ${nm}</div>`;
    } else info.innerHTML = `<div class="pc-name">Выбери фигуру</div><div class="pc-meta">1 ОД — ход, удар или способность. Убей короля — это мат.</div>`;
  }
  const abs = sel ? abilities(G, sel) : [];
  const abBtn = $("#btn-ab") as HTMLButtonElement;
  if (abBtn) { abBtn.disabled = !sel || !abs.length || G.side !== mySide; abBtn.textContent = uiMode === "ab" ? "Отмена способности" : "Способность"; }
  const endBtn = $("#btn-end") as HTMLButtonElement;
  if (endBtn) endBtn.disabled = G.side !== mySide || !!G.winner;
  const log = $("#log"); if (log) log.innerHTML = G.log.slice(0, 24).map((l) => `<div>${l}</div>`).join("");
}

// ───────────────────────── рендер доски (canvas, rAF) ─────────────────────────
let cvW = 0, cvDpr = 0;
function sizeCanvas(cv: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = Math.max(240, Math.min(600, Math.floor(cv.parentElement?.clientWidth || 560)));
  if (css !== cvW || dpr !== cvDpr) {
    cvW = css; cvDpr = dpr;
    cv.style.width = css + "px"; cv.style.height = css + "px";
    cv.width = Math.floor(css * dpr); cv.height = Math.floor(css * dpr);
  }
  return { css, dpr };
}

type RP = { p: Piece; rx: number; ry: number; lift: number };
function piecePos(p: Piece, t: number): RP {
  const tw = tweens.get(p.id);
  let rx = p.x, ry = p.y, lift = 0;
  if (tw) {
    const k = clamp01((t - tw.t0) / tw.dur);
    if (k >= 1) tweens.delete(p.id);
    else { const e = easeOut(k); rx = tw.fx + (p.x - tw.fx) * e; ry = tw.fy + (p.y - tw.fy) * e; lift = Math.sin(Math.PI * k) * tw.hop; }
  }
  const at = atks.get(p.id);
  if (at && (at.lunge[0] || at.lunge[1])) {
    const k = clamp01((t - at.t0) / (at.impactMs * 2));
    const o = Math.sin(Math.PI * k) * 0.24;
    rx += at.lunge[0] * o; ry += at.lunge[1] * o;
  }
  return { p, rx: fc(rx), ry: fc(ry), lift };
}

function drawPiece(g: CanvasRenderingContext2D, S: number, rp: RP, t: number, opts: { alpha?: number; whiteK?: number; scale?: number; selected?: boolean } = {}) {
  const { p } = rp;
  const sheet = spr[p.s + p.t];
  const cx = (rp.rx + 0.5) * S;
  const foot = (rp.ry + 0.84) * S;
  const bob = opts.selected ? (Math.sin(t / 160) * 0.5 + 0.5) * S * 0.04 : 0;
  const yLift = rp.lift * S + bob;
  // основание: тень + командное кольцо
  g.save();
  g.globalAlpha = opts.alpha ?? 1;
  g.fillStyle = "rgba(0,0,0,.42)";
  g.beginPath(); g.ellipse(cx, foot, S * 0.3 * (1 - rp.lift), S * 0.1 * (1 - rp.lift), 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = opts.selected ? 2.4 : 1.4;
  g.strokeStyle = p.s === "w" ? "rgba(246,220,150,.9)" : "rgba(235,70,90,.9)";
  if (opts.selected) { g.shadowColor = "#ffd76a"; g.shadowBlur = 10; g.strokeStyle = "#ffe08a"; }
  g.beginPath(); g.ellipse(cx, foot, S * 0.31, S * 0.105, 0, 0, Math.PI * 2); g.stroke();
  g.restore();

  if (!sheet) { // запасной вариант без арта
    g.fillStyle = p.s === "w" ? "#eee" : "#222"; g.beginPath(); g.arc(cx, foot - S * 0.3 - yLift, S * 0.26, 0, 7); g.fill();
    g.fillStyle = p.s === "w" ? "#111" : "#eee"; g.font = `bold ${S * 0.28}px Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(p.t, cx, foot - S * 0.3 - yLift); return;
  }
  let rect: Rect | null = null;
  let anchor: [number, number] = sheet.j.anchor || [32, 60];
  const at = atks.get(p.id);
  if (at) {
    const a = anim(sheet, at.name, at.d);
    rect = a ? frameAt(a, t - at.t0, ATK_SPEED) : null;
    if (a) anchor = a.anchor;
    if (!rect) atks.delete(p.id);
  }
  if (!rect) {
    const a = anim(sheet, "idle", idleDir(p.s));
    if (!a) return;
    rect = frameAt(a, t + p.id * 173)!; anchor = a.anchor;
  }
  const f = frame(sheet, rect);
  let sc = (S / 64) * (opts.scale ?? 1.0);
  const pt = punches.get(p.id);
  let whiteK = opts.whiteK ?? 0;
  if (pt != null && t >= pt) {
    const k = (t - pt) / 260;
    if (k >= 1) punches.delete(p.id);
    else { sc *= 1 + Math.sin(Math.PI * k) * 0.14; whiteK = Math.max(whiteK, 1 - k); }
  }
  const w = f.c.width * sc, h = f.c.height * sc;
  const dx = cx - (anchor[0] + f.pad) * sc, dy = foot - yLift - (anchor[1] + f.pad) * sc;
  g.save();
  g.globalAlpha = opts.alpha ?? 1;
  g.drawImage(f.c, dx, dy, w, h);
  if (whiteK > 0 && f.white) { g.globalAlpha = (opts.alpha ?? 1) * whiteK * 0.85; g.drawImage(f.white, dx, dy, w, h); }
  g.restore();
}

function hpBar(g: CanvasRenderingContext2D, S: number, rp: RP, t: number, force: boolean) {
  const p = rp.p;
  let hv = hpView.get(p.id);
  if (!hv) { hv = { v: p.hp, hold: 0 }; hpView.set(p.id, hv); }
  if (t > hv.hold) hv.v += (p.hp - hv.v) * 0.12;
  if (Math.abs(hv.v - p.hp) < 0.3) hv.v = p.hp;
  if (!force && p.hp >= p.mh && hv.v >= p.mh) return;
  const bw = S * 0.62, bh = Math.max(3, Math.round(S * 0.065));
  const x = (rp.rx + 0.5) * S - bw / 2, y = (rp.ry + 0.91) * S;
  const f = clamp01(p.hp / p.mh), fv = clamp01(hv.v / p.mh);
  g.fillStyle = "rgba(0,0,0,.75)"; g.fillRect(x - 1, y - 1, bw + 2, bh + 2);
  g.fillStyle = "#2a1414"; g.fillRect(x, y, bw, bh);
  g.fillStyle = "#f7e2b0"; g.fillRect(x, y, bw * fv, bh);
  g.fillStyle = f > 0.6 ? "#5bd16a" : f > 0.3 ? "#e8c040" : "#e5433a"; g.fillRect(x, y, bw * f, bh);
  g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x, y, bw * f, 1);
}

function drawFx(g: CanvasRenderingContext2D, S: number, t: number, layer: "under" | "over") {
  for (const e of fxs) {
    const k = (t - e.t0) / e.dur;
    if (k < 0 || k > 1) continue;
    if (layer === "under") {
      if (e.k === "flash") {
        const a = e.a * (1 - k) * (1 - k);
        g.fillStyle = `rgba(${e.color},${a})`; g.fillRect(fc(e.x) * S, fc(e.y) * S, S, S);
        g.strokeStyle = `rgba(${e.color},${Math.min(1, a * 1.6)})`; g.lineWidth = 2; g.strokeRect(fc(e.x) * S + 1.5, fc(e.y) * S + 1.5, S - 3, S - 3);
      } else if (e.k === "shieldup") {
        const a = 0.55 * (1 - k); const col = e.s === "w" ? "120,190,255" : "255,110,110";
        g.fillStyle = `rgba(${col},${a * 0.5})`; g.fillRect((fc(e.x) - 2) * S, (fc(e.y) - 2) * S, 5 * S, 5 * S);
        g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = 3; g.strokeRect((fc(e.x) - 2) * S + 2, (fc(e.y) - 2) * S + 2, 5 * S - 4, 5 * S - 4);
      }
      continue;
    }
    if (e.k === "ring") {
      const r = (e.r0 + (e.r1 - e.r0) * easeOut(k)) * S;
      g.strokeStyle = `rgba(${e.color},${1 - k})`; g.lineWidth = e.w * (1 - k * 0.6);
      g.beginPath(); g.ellipse((fc(e.x) + 0.5) * S, (fc(e.y) + 0.6) * S, r, r * 0.62, 0, 0, Math.PI * 2); g.stroke();
    } else if (e.k === "spark") {
      const tt = (t - e.t0) / 1000;
      for (const s of e.ps as Spark[]) {
        if (k > s.life) continue;
        const px = (fp(e.cx) + (s.vx * tt) ) * S, py = (fp(e.cy) + s.vy * tt + 0.5 * e.g * tt * tt) * S;
        g.globalAlpha = 1 - k / s.life; g.fillStyle = s.color;
        const z = s.size * (S / 64) * 1.6; g.fillRect(px - z / 2, py - z / 2, z, z);
      }
      g.globalAlpha = 1;
    } else if (e.k === "sheet") {
      const sh = spr[e.key]; const a = sh && (anim(sh, e.name, "any") || anim(sh, "hit", "any"));
      if (!a) continue;
      const r = frameAt({ ...a, loop: false }, t - e.t0, 1.3); if (!r) continue;
      const f = frame(sh, r, false); const sc = (S / 64) * 1.15;
      g.drawImage(f.c, (fc(e.x) + 0.5) * S - a.anchor[0] * sc, (fc(e.y) + 0.84) * S - a.anchor[1] * sc, f.w * sc, f.h * sc);
    } else if (e.k === "proj") {
      const sh = spr[e.key]; const a = sh && anim(sh, "projectile", e.d);
      const ex = fc(e.from[0] + (e.to[0] - e.from[0]) * k), ey = fc(e.from[1] + (e.to[1] - e.from[1]) * k);
      const px = (ex + 0.5) * S, py = (ey + 0.5) * S - S * 0.08;
      g.save(); g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(px, py, 0, px, py, S * 0.35);
      gr.addColorStop(0, "rgba(255,240,200,.85)"); gr.addColorStop(1, "rgba(255,180,80,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, S * 0.35, 0, 7); g.fill(); g.restore();
      if (a) {
        const r = frameAt({ ...a, loop: true }, t - e.t0)!; const f = frame(sh, r, false); const sc = (S / 64) * 1.5;
        g.drawImage(f.c, px - a.anchor[0] * sc, py - a.anchor[1] * sc, f.w * sc, f.h * sc);
      }
    } else if (e.k === "float") {
      const rise = easeOut(k) * S * 0.55;
      const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.5 : 1;
      const fs = Math.round(S * (e.big ? 0.38 : 0.31) * pop);
      g.save(); g.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      g.font = `900 ${fs}px Georgia, "Times New Roman", serif`; g.textAlign = "center"; g.textBaseline = "middle";
      const x = (fc(e.x) + 0.5) * S, y = (fc(e.y) + 0.2) * S - rise;
      g.lineWidth = Math.max(3, fs * 0.16); g.strokeStyle = "rgba(10,6,8,.95)"; g.lineJoin = "round"; g.strokeText(e.text, x, y);
      g.fillStyle = e.color; g.fillText(e.text, x, y); g.restore();
    } else if (e.k === "burst") {
      const cx = (fc(e.x) + 0.5) * S, cy = (fc(e.y) + 0.55) * S, r = S * (0.4 + easeOut(k) * 3.2);
      g.save(); g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(255,250,220,${0.95 * (1 - k)})`); gr.addColorStop(0.35, `rgba(255,200,90,${0.6 * (1 - k)})`); gr.addColorStop(1, "rgba(255,160,40,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.strokeStyle = `rgba(255,230,150,${0.8 * (1 - k)})`; g.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + k; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
      g.restore();
    }
  }
}

function drawBanner(g: CanvasRenderingContext2D, W: number, t: number) {
  for (const e of fxs) {
    if (e.k !== "banner") continue;
    const k = (t - e.t0) / e.dur; if (k < 0 || k > 1) continue;
    const a = k < 0.18 ? k / 0.18 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const slide = (1 - easeOut(Math.min(1, k / 0.18))) * W * 0.08;
    const h = e.gold ? W * 0.22 : W * 0.15, y = W / 2 - h / 2;
    g.save(); g.globalAlpha = a;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(10,8,14,0)"); gr.addColorStop(0.2, "rgba(14,10,18,.86)"); gr.addColorStop(0.8, "rgba(14,10,18,.86)"); gr.addColorStop(1, "rgba(10,8,14,0)");
    g.fillStyle = gr; g.fillRect(0, y, W, h);
    g.strokeStyle = "rgba(212,175,90,.85)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W * 0.12, y + h * 0.2); g.lineTo(W * 0.88, y + h * 0.2); g.moveTo(W * 0.12, y + h * 0.8); g.lineTo(W * 0.88, y + h * 0.8); g.stroke();
    // ромбы арт-деко
    for (const x of [W * 0.12, W * 0.88]) for (const yy of [y + h * 0.2, y + h * 0.8]) { g.fillStyle = "#d4af5a"; g.beginPath(); g.moveTo(x, yy - 4); g.lineTo(x + 4, yy); g.lineTo(x, yy + 4); g.lineTo(x - 4, yy); g.fill(); }
    const fs = Math.round(e.gold ? W * 0.11 : W * 0.065);
    g.font = `700 ${fs}px Georgia, "Times New Roman", serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const tg = g.createLinearGradient(0, W / 2 - fs / 2, 0, W / 2 + fs / 2);
    tg.addColorStop(0, "#fff3c4"); tg.addColorStop(0.55, "#e2b65a"); tg.addColorStop(1, "#a7792e");
    g.shadowColor = "rgba(0,0,0,.8)"; g.shadowBlur = 8; g.fillStyle = tg;
    g.fillText(e.text, W / 2 + slide, W / 2 - (e.sub ? fs * 0.18 : 0));
    if (e.sub) { g.shadowBlur = 4; g.font = `600 ${Math.round(fs * 0.34)}px Georgia, serif`; g.fillStyle = "#cbbd9e"; g.fillText(e.sub, W / 2 - slide, W / 2 + fs * 0.5); }
    g.restore();
  }
}

function renderBoard(t: number) {
  const cv = $("#board") as HTMLCanvasElement; if (!cv || !G) return;
  const { css, dpr } = sizeCanvas(cv);
  const g = cv.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, css, css);
  const S = css / 8;
  const tick = (t / 125) | 0;
  // тряска
  const sk = (t - shake.t0) / shake.dur;
  if (sk >= 0 && sk < 1) { const m = shake.mag * (1 - sk); g.translate(rnd(-m, m), rnd(-m, m)); }

  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const light = (x + y) % 2 === 0;
    const im = tileIm[(light ? "L" : "D") + ((x * 3 + y) % 3)];
    if (im?.complete && im.naturalWidth) g.drawImage(im, x * S, y * S, S, S);
    else { g.fillStyle = light ? "#3a3428" : "#1a1620"; g.fillRect(x * S, y * S, S, S); }
  }
  // лёгкая виньетка, чтобы края доски не спорили с фигурами
  const vg = g.createRadialGradient(css / 2, css / 2, css * 0.3, css / 2, css / 2, css * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.28)");
  g.fillStyle = vg; g.fillRect(0, 0, css, css);

  for (const c of mapDecor.special) {
    if (c.y < 2 || c.y > 5) continue;
    const im = specIm[c.kind + (tick % 4)];
    if (im?.complete && im.naturalWidth) g.drawImage(im, fc(c.x) * S, fc(c.y) * S, S, S);
  }
  // пропы — только центр (ряды 2–5), чтобы не перекрывать стартовые армии
  for (const p of mapDecor.props) {
    if (p.y < 2 || p.y > 5) continue;
    const frames = PROP_FRAMES[p.prop] || 1;
    const im = propIm[p.prop + (tick % frames)];
    if (!im?.complete || !im.naturalWidth) continue;
    const sc = S / 64; const [ax, ay] = PROP_ANCHOR;
    g.drawImage(im, fc(p.x) * S + S / 2 - ax * sc, fc(p.y) * S + S * 0.92 - ay * sc, 64 * sc, 64 * sc);
  }

  const v = view(G);
  (["w", "b"] as Side[]).forEach((s) => {
    const sh = v.shield[s]; if (!sh) return;
    const pul = 0.18 + Math.sin(t / 300) * 0.05;
    g.fillStyle = s === "w" ? `rgba(120,180,255,${pul})` : `rgba(220,70,70,${pul})`;
    g.fillRect((fc(sh.x) - 2) * S, (fc(sh.y) - 2) * S, 5 * S, 5 * S);
    g.save(); g.setLineDash([6, 4]); g.lineDashOffset = -t / 60;
    g.strokeStyle = s === "w" ? "rgba(170,215,255,.8)" : "rgba(255,120,120,.8)"; g.lineWidth = 2;
    g.strokeRect((fc(sh.x) - 2) * S + 1, (fc(sh.y) - 2) * S + 1, 5 * S - 2, 5 * S - 2); g.restore();
    // запас щита (HUD): видно, сколько ещё поглотит
    { const fs = Math.max(10, Math.round(S * 0.2)); const lx = (fc(sh.x) - 2) * S + 6, ly = (fc(sh.y) - 2) * S + 5;
      g.font = `700 ${fs}px system-ui, sans-serif`; g.textAlign = "left"; g.textBaseline = "top";
      const txt = `щит ${Math.max(0, sh.hp)}`; const tw = g.measureText(txt).width;
      g.fillStyle = "rgba(8,10,20,.78)"; g.fillRect(lx - 3, ly - 2, tw + 6, fs + 4);
      g.fillStyle = s === "w" ? "#bfe0ff" : "#ffc0c0"; g.fillText(txt, lx, ly); }
  });
  if (v.threat[mySide]) {
    const k = G.pieces.find((p) => p.t === "K" && p.s === mySide);
    if (k) {
      g.globalAlpha = 0.6 + Math.sin(t / 140) * 0.4;
      if (hlIm.threat?.complete) g.drawImage(hlIm.threat, fc(k.x) * S, fc(k.y) * S, S, S);
      g.globalAlpha = 1;
    }
  }
  drawFx(g, S, t, "under");

  // подсветки выбора
  const pulse = 0.65 + Math.sin(t / 220) * 0.35;
  let preview: { x: number; y: number; dmg: number; kill: boolean } | null = null;
  if (sel && G.side === mySide) {
    if (hlIm.selected?.complete) g.drawImage(hlIm.selected, fc(sel.x) * S, fc(sel.y) * S, S, S);
    if (uiMode === "move") {
      moves(G, sel).forEach(([bx, by]) => {
        const x = fc(bx), y = fc(by);
        g.globalAlpha = 0.55 + pulse * 0.45;
        if (hlIm.move?.complete) g.drawImage(hlIm.move, x * S, y * S, S, S);
        g.globalAlpha = 1;
        const hv = hover && hover[0] === bx && hover[1] === by;
        g.fillStyle = hv ? "#fff1b8" : "rgba(240,205,120,.9)";
        const r = S * (hv ? 0.1 : 0.07);
        g.beginPath(); g.moveTo(x * S + S / 2, y * S + S / 2 - r); g.lineTo(x * S + S / 2 + r, y * S + S / 2); g.lineTo(x * S + S / 2, y * S + S / 2 + r); g.lineTo(x * S + S / 2 - r, y * S + S / 2); g.fill();
      });
      attacks(G, sel).forEach((a) => {
        const q = byId(G!, a.qId); if (!q) return;
        if (hlIm.attack?.complete) g.drawImage(hlIm.attack, fc(q.x) * S, fc(q.y) * S, S, S);
        // прицел-уголки
        const m = S * (0.06 + (1 - pulse) * 0.05), L = S * 0.22;
        g.strokeStyle = "#ff5a48"; g.lineWidth = 2.5;
        const x0 = fc(q.x) * S + m, y0 = fc(q.y) * S + m, x1 = (fc(q.x) + 1) * S - m, y1 = (fc(q.y) + 1) * S - m;
        g.beginPath();
        g.moveTo(x0, y0 + L); g.lineTo(x0, y0); g.lineTo(x0 + L, y0);
        g.moveTo(x1 - L, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + L);
        g.moveTo(x1, y1 - L); g.lineTo(x1, y1); g.lineTo(x1 - L, y1);
        g.moveTo(x0 + L, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - L);
        g.stroke();
        if (hover && hover[0] === q.x && hover[1] === q.y) preview = { x: q.x, y: q.y, dmg: a.dmg, kill: a.dmg >= q.hp };
      });
    } else {
      abilities(G, sel).forEach((a) => {
        const q = a.qId != null ? byId(G!, a.qId) : null;
        const x = fc(q ? q.x : a.x!), y = fc(q ? q.y : a.y!);
        g.fillStyle = `rgba(160,110,240,${0.18 + pulse * 0.15})`; g.fillRect(x * S, y * S, S, S);
        g.strokeStyle = "#b88cff"; g.lineWidth = 3; g.strokeRect(x * S + 3, y * S + 3, S - 6, S - 6);
      });
    }
  }
  if (hover && G.side === mySide) {
    g.strokeStyle = "rgba(255,245,215,.45)"; g.lineWidth = 1.5;
    g.strokeRect(fc(hover[0]) * S + 1, fc(hover[1]) * S + 1, S - 2, S - 2);
  }

  // фигуры: сортировка по глубине (y), призраки погибших
  const rps: (RP & { ghost?: Fx })[] = G.pieces.map((p) => piecePos(p, t));
  for (const e of fxs) if (e.k === "ghost" && t >= e.t0 && t <= e.t0 + e.dur) rps.push({ p: e.p, rx: fc(e.p.x), ry: fc(e.p.y), lift: 0, ghost: e });
  rps.sort((a, b) => a.ry - b.ry);
  for (const rp of rps) {
    if (rp.ghost) {
      const e = rp.ghost;
      if (t < e.die) drawPiece(g, S, rp, t);
      else {
        const k = clamp01((t - e.die) / (e.t0 + e.dur - e.die));
        drawPiece(g, S, { ...rp, lift: k * 0.25 }, t, { alpha: 1 - k, whiteK: 1 - k * 0.5, scale: 1 + k * 0.25 });
      }
      continue;
    }
    const hv = hover && hover[0] === rp.p.x && hover[1] === rp.p.y && G.side === mySide && rp.p.s === mySide && !sel;
    drawPiece(g, S, rp, t, { selected: sel?.id === rp.p.id, scale: hv ? 1.05 : 1 });
  }
  for (const rp of rps) {
    if (rp.ghost) continue;
    const force = sel?.id === rp.p.id || (!!hover && hover[0] === rp.p.x && hover[1] === rp.p.y);
    hpBar(g, S, rp, t, force);
    if (rp.p.cd) {
      const x = (rp.rx + 0.84) * S, y = (rp.ry + 0.16) * S, r = Math.max(7, S * 0.12);
      g.fillStyle = "rgba(40,20,70,.92)"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = "#b88cff"; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = "#e8dbff"; g.font = `700 ${Math.round(r * 1.2)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(rp.p.cd), x, y + 0.5);
    }
  }
  drawFx(g, S, t, "over");
  if (preview) {
    const pv = preview as { x: number; y: number; dmg: number; kill: boolean };
    const fs = Math.round(S * 0.24);
    g.font = `800 ${fs}px Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const txt = pv.kill ? `−${pv.dmg} ✦ добить` : `−${pv.dmg}`;
    const x = (fc(pv.x) + 0.5) * S, y = fc(pv.y) * S + fs * 0.35;
    g.lineWidth = 3; g.strokeStyle = "#0a0608"; g.strokeText(txt, x, y);
    g.fillStyle = pv.kill ? "#ffd66a" : "#ffb0a0"; g.fillText(txt, x, y);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBanner(g, css, t);
  fxs = fxs.filter((e) => t <= e.t0 + e.dur + 50);
}

// ───────────────────────── лобби: живая армия в шапке ─────────────────────────
function renderHero(t: number) {
  const cv = $("#hero-army") as HTMLCanvasElement | null; if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.min(720, cv.parentElement?.clientWidth || 720), H = Math.round(W * 0.16);
  if (cv.width !== Math.floor(W * dpr)) { cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
  const g = cv.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
  const order = ["R", "N", "B", "Q", "K", "P"];
  const cell = W / 13.2, sc = (cell / 64) * 1.35;
  const draw1 = (key: string, i: number, cx: number) => {
    const sh = spr[key]; if (!sh) return;
    const a = anim(sh, "idle", "down"); if (!a) return;
    const f = frame(sh, frameAt(a, t + i * 211)!);
    const foot = H * 0.92;
    g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.ellipse(cx, foot, cell * 0.34, cell * 0.1, 0, 0, 7); g.fill();
    g.drawImage(f.c, cx - (a.anchor[0] + f.pad) * sc, foot - (a.anchor[1] + f.pad) * sc, f.c.width * sc, f.c.height * sc);
  };
  order.forEach((k, i) => draw1("w" + k, i, cell * (0.8 + i)));
  order.slice().reverse().forEach((k, i) => draw1("b" + k, i + 6, W - cell * (0.8 + i)));
  // центральный ромб
  g.fillStyle = "#d4af5a"; const cx = W / 2, cy = H * 0.72;
  g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 8, cy); g.lineTo(cx, cy + 8); g.lineTo(cx - 8, cy); g.fill();
  g.font = `italic 600 ${Math.round(H * 0.15)}px Georgia, serif`; g.textAlign = "center"; g.fillStyle = "#cbb27a"; g.fillText("против", cx, H * 0.42);
}

function loop() {
  const t = now();
  if (screen === "play") renderBoard(t);
  else if (screen === "home") renderHero(t);
  requestAnimationFrame(loop);
}

function cellFromEvent(e: MouseEvent): [number, number] | null {
  const cv = $("#board") as HTMLCanvasElement;
  const r = cv.getBoundingClientRect();
  const S = r.width / 8;
  const x = Math.floor((e.clientX - r.left) / S), y = Math.floor((e.clientY - r.top) / S);
  if (x < 0 || y < 0 || x > 7 || y > 7) return null;
  return [fc(x), fc(y)]; // экран → доска (инволюция)
}

function onBoardClick(e: MouseEvent) {
  if (!G || G.side === "x" || G.side !== mySide) return;
  const c = cellFromEvent(e); if (!c) return;
  const [x, y] = c;
  const q = at(G, x, y);

  if (sel && uiMode === "ab") {
    const t = abilities(G, sel).find((a) => (a.qId != null && a.qId === q?.id) || (a.x === x && a.y === y) || (a.qId == null && a.x === sel!.x && a.y === sel!.y && q === sel));
    if (t) { const p = sel; sel = null; uiMode = "move"; actAbility(p, t); return; }
  }
  if (sel && uiMode === "move") {
    const a = attacks(G, sel).find((a) => byId(G!, a.qId)?.x === x && byId(G!, a.qId)?.y === y);
    if (a) { const p = sel; sel = null; actAttack(p, a); return; }
    if (!q && moves(G, sel).some(([mx, my]) => mx === x && my === y)) { const p = sel; sel = null; actMove(p, x, y); return; }
  }
  const prev = sel;
  sel = q && q.s === mySide ? q : null; uiMode = "move";
  if (sel && sel !== prev) fxs.push({ k: "ring", t0: now(), dur: 360, x: sel.x, y: sel.y, color: "255,215,120", r0: 0.2, r1: 0.5, w: 2 });
  draw();
}

function bind() {
  // режимы кнопками меню биндятся в renderHomeMenu
  $("#create")?.addEventListener("click", () => {
    if (playMode === "bot") startBot(false);
    else if (playMode === "join") joinLobby();
    else createLobby();
  });
  $("#joinbtn")?.addEventListener("click", () => joinLobby());
  $("#joincode")?.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") joinLobby(); });
  $("#wait-cancel")?.addEventListener("click", () => { netClose(); show("home"); refreshOpen(); });
  $("#wait-copy")?.addEventListener("click", () => { navigator.clipboard?.writeText(netCode).then(() => toast("Код скопирован"), () => {}); });
  $("#btn-resign")?.addEventListener("click", () => { if (online && G && !G.winner && confirm("Сдаться? Соперник получит победу.")) netSend({ type: "resign" }); });
  $("#refresh")?.addEventListener("click", refreshOpen);
  const board = $("#board");
  board?.addEventListener("click", onBoardClick);
  board?.addEventListener("mousemove", (e) => { hover = cellFromEvent(e as MouseEvent); });
  board?.addEventListener("mouseleave", () => { hover = null; });
  $("#btn-ab")?.addEventListener("click", () => { if (!sel) return; uiMode = uiMode === "ab" ? "move" : "ab"; draw(); });
  $("#btn-end")?.addEventListener("click", () => { if (!G || G.side !== mySide) return; sel = null; if (online) { netSend({ type: "act", act: "end" }); return; } endTurn(G); afterAct(); });
  $("#btn-home")?.addEventListener("click", () => { netClose(); G = null; show("home"); renderHomeMenu(); refreshOpen(); refreshMe(); });
  $("#btn-again")?.addEventListener("click", () => { if (resultInfo && !vsBot) { setMode("host"); createLobby(); } else startBot(false); });
  window.addEventListener("resize", () => setBg(mapDecor.bg));
  requestAnimationFrame(loop);
}

(async () => {
  await preload();
  await identifyClerk();
  bind();
  setMode("bot");
  show("home");
  renderHomeMenu();
  refreshOpen(); refreshMe();
  setInterval(() => { if (screen === "home") refreshOpen(); }, 5000);
  const qj = qs.get("join"); if (qj) joinLobby(qj);
  const me = $("#me"); if (me) me.textContent = nick();
  if (qs.get("bot") === "1" || qs.get("play") === "bot") startBot(qs.get("demo") === "1");
  else if (qs.get("demo") === "1") startBot(true);
  if (qs.get("bg") === "terrace") setBg("terrace");
})();

if (LOCAL) {
  (window as any).__chessG = () => G;
  (window as any).__chessStartBot = startBot;
  (window as any).__chessView = () => G && view(G);
  (window as any).__chessMap = () => mapDecor;
  (window as any).__chessApplyMap = applyMap;
  (window as any).__chessSel = (x: number, y: number) => { if (G) { sel = at(G, x, y) || null; draw(); } };
  (window as any).__chessHover = (x: number, y: number) => { hover = [x, y]; };
  (window as any).__chessFlip = () => flipView;
  (window as any).__chessAct = { move: actMove, attack: actAttack, ability: actAbility, attacks: (p: Piece) => attacks(G!, p), moves: (p: Piece) => moves(G!, p), abilities: (p: Piece) => abilities(G!, p), at: (x: number, y: number) => G && at(G, x, y) };
  (window as any).__chessBotOff = () => { vsBot = false; };
  (window as any).__chessNet = { create: () => { setMode("host"); return createLobby(); }, join: (c: string) => joinLobby(c), code: () => netCode, side: () => mySide, online: () => online, send: netSend };
}
