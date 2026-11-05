// Боевые шахматы — клиент. Лобби + бот + ОД. Слово «шах» не используем: только мат / угроза.
// Поле: чистовик B (board/) + волна 2 bg/props/ui из chess-combat-set-v1.
import {
  newGame, doMove, doAttack, doAbility, endTurn, view, moves, attacks, abilities, byId, at,
  STATS, FIG, type Game, type Piece, type Side, type Attack,
} from "../../../server/chess/rules";
import { localApply } from "../../../server/chess/rating";

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
let screen: "home" | "play" | "results" = "home";
let spr: Record<string, { im: HTMLImageElement; j: any }> = {};
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
      spr[s + t] = { im, j };
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

function nick(): string {
  const n = ($("#nick") as HTMLInputElement)?.value?.trim();
  return n || (LOCAL && qs.get("devUser") ? "Игрок-" + qs.get("devUser")!.slice(-4) : "Гость");
}

function playerKey(): string {
  if (LOCAL && qs.get("devUser")) return qs.get("devUser")!;
  let g = localStorage.getItem("chess_guest");
  if (!g) { g = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("chess_guest", g); }
  return "guest:" + g.slice(0, 16);
}

function setMode(m: Mode) {
  playMode = m;
  document.querySelectorAll(".cc-mode").forEach((el) => el.classList.toggle("on", (el as HTMLElement).dataset.pm === m));
}

async function refreshOpen() {
  const box = $("#open"); if (!box) return;
  try {
    const r = await fetch(HTTP + "/chess/open");
    const j: any = r.ok ? await r.json() : { list: [] };
    const list = j.list || [];
    box.innerHTML = list.length
      ? list.map((l: any) => `<div class="row"><span><b>${l.code}</b> · ${l.host || "хост"}</span><button class="btn sm" data-join="${l.code}">Войти</button></div>`).join("")
      : `<div class="empty">Пока пусто — создай лобби или сыграй с ботом</div>`;
    box.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => {
      ($("#joincode") as HTMLInputElement).value = (b as HTMLElement).dataset.join || "";
      setMode("join"); joinLobby();
    }));
  } catch {
    box.innerHTML = `<div class="empty">Сервер лобби недоступен — можно играть с ботом</div>`;
  }
}

async function createLobby() {
  if (playMode === "bot") { startBot(); return; }
  try {
    const r = await fetch(HTTP + "/chess/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pub: true }) });
    const j: any = await r.json();
    if (!j.code) throw new Error(j.err || "fail");
    alert("Код лобби: " + j.code + "\nОнлайн-матч через WS — в следующей итерации; сейчас вертикаль — бот.");
    startBot();
  } catch {
    startBot();
  }
}

async function joinLobby() {
  const code = (($("#joincode") as HTMLInputElement).value || "").trim().toUpperCase();
  if (!code) { alert("Введи код"); return; }
  alert("Вход по коду " + code + " — онлайн подключится после выкладки worker. Сейчас — партия с ботом.");
  startBot();
}

function startBot(withDemo = true) {
  vsBot = true; mySide = "w";
  G = newGame(); sel = null; uiMode = "move"; resultInfo = null;
  applyMap(withDemo ? DEMO_MAP : { bg: "hall", props: [], special: [] });
  show("play"); draw();
}

function botAct() {
  if (!G || G.side === "x" || G.side === mySide) return;
  const side = G.side;
  const mine = G.pieces.filter((p) => p.s === side);
  for (const p of mine) {
    for (const a of attacks(G, p)) {
      const q = byId(G, a.qId); if (q?.t === "K") { doAttack(G, p, a); afterAct(); return; }
    }
  }
  let best: { p: Piece; a: Attack; score: number } | null = null;
  for (const p of mine) for (const a of attacks(G, p)) {
    const q = byId(G, a.qId)!; const score = a.dmg + (q.t === "Q" ? 20 : 0) + (q.hp <= a.dmg ? 50 : 0);
    if (!best || score > best.score) best = { p, a, score };
  }
  if (best && G.ap > 0) { doAttack(G, best.p, best.a); afterAct(); return; }
  const opts: { p: Piece; x: number; y: number }[] = [];
  for (const p of mine) for (const [x, y] of moves(G, p)) opts.push({ p, x, y });
  if (opts.length && G.ap > 0) {
    const o = opts[(Math.random() * opts.length) | 0];
    doMove(G, o.p, o.x, o.y); afterAct(); return;
  }
  endTurn(G); afterAct();
}

function afterAct() {
  draw();
  if (!G) return;
  if (G.winner) { finish(G.winner); return; }
  if (vsBot && G.side !== mySide && G.side !== "x") setTimeout(botAct, 280);
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

function draw() {
  const cv = $("#board") as HTMLCanvasElement; if (!cv || !G) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = Math.min(560, Math.floor((cv.parentElement?.clientWidth || 560)));
  cv.style.width = css + "px"; cv.style.height = css + "px";
  cv.width = Math.floor(css * dpr); cv.height = Math.floor(css * dpr);
  const g = cv.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = css / 8;
  const v = view(G);
  const tick = Date.now() / 125 | 0;

  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const light = (x + y) % 2 === 0;
    const im = tileIm[(light ? "L" : "D") + ((x * 3 + y) % 3)];
    if (im?.complete && im.naturalWidth) g.drawImage(im, x * S, y * S, S, S);
    else { g.fillStyle = light ? "#3a3428" : "#1a1620"; g.fillRect(x * S, y * S, S, S); }
  }

  // special cells (boost/danger) under props
  for (const c of mapDecor.special) {
    const im = specIm[c.kind + (tick % 4)];
    if (im?.complete && im.naturalWidth) g.drawImage(im, c.x * S, c.y * S, S, S);
  }

  // props from map
  for (const p of mapDecor.props) {
    const frames = PROP_FRAMES[p.prop] || 1;
    const im = propIm[p.prop + (tick % frames)];
    if (!im?.complete || !im.naturalWidth) continue;
    const sc = S / 64;
    const [ax, ay] = PROP_ANCHOR;
    g.drawImage(im, p.x * S + S / 2 - ax * sc, p.y * S + S * 0.92 - ay * sc, 64 * sc, 64 * sc);
  }

  (["w", "b"] as Side[]).forEach((s) => {
    const sh = v.shield[s]; if (!sh) return;
    g.fillStyle = s === "w" ? "rgba(120,180,255,.22)" : "rgba(200,60,60,.22)";
    g.fillRect((sh.x - 2) * S, (sh.y - 2) * S, 5 * S, 5 * S);
  });
  if (v.threat[mySide]) {
    const k = G.pieces.find((p) => p.t === "K" && p.s === mySide);
    if (k && hlIm.threat?.complete) g.drawImage(hlIm.threat, k.x * S, k.y * S, S, S);
  }
  if (sel) {
    if (hlIm.selected?.complete) g.drawImage(hlIm.selected, sel.x * S, sel.y * S, S, S);
    if (uiMode === "move") {
      moves(G, sel).forEach(([x, y]) => { if (hlIm.move?.complete) g.drawImage(hlIm.move, x * S, y * S, S, S); });
      attacks(G, sel).forEach((a) => {
        const q = byId(G, a.qId); if (q && hlIm.attack?.complete) g.drawImage(hlIm.attack, q.x * S, q.y * S, S, S);
      });
    } else {
      abilities(G, sel).forEach((a) => {
        const q = a.qId != null ? byId(G, a.qId) : null;
        const x = q ? q.x : a.x!, y = q ? q.y : a.y!;
        g.strokeStyle = "#a070f0"; g.lineWidth = 3; g.strokeRect(x * S + 3, y * S + 3, S - 6, S - 6);
      });
    }
  }
  for (const p of G.pieces) {
    const o = spr[p.s + p.t];
    if (o?.im?.complete) {
      const d = p.s === "w" ? "up" : "down";
      const row = o.j.rows?.find((r: any) => r.anim === "idle" && r.dir === d) || o.j.rows?.[0];
      if (row) {
        const fr = tick % row.frames;
        const [w, h] = row.cell; const sc = S / 64 * 1.15;
        const ax = (o.j.anchor?.[0] ?? 32) * sc, ay = (o.j.anchor?.[1] ?? 60) * sc;
        g.drawImage(o.im, fr * w, row.y, w, h, p.x * S + S / 2 - ax, p.y * S + S * 0.92 - ay, w * sc, h * sc);
      }
    } else {
      g.fillStyle = p.s === "w" ? "#eee" : "#222"; g.beginPath(); g.arc(p.x * S + S / 2, p.y * S + S / 2, S * 0.3, 0, 7); g.fill();
      g.fillStyle = p.s === "w" ? "#111" : "#eee"; g.font = `bold ${S * 0.28}px sans-serif`; g.textAlign = "center";
      g.fillText(p.t, p.x * S + S / 2, p.y * S + S / 2 + S * 0.1);
    }
    const f = Math.max(0, p.hp) / p.mh;
    g.fillStyle = "#400"; g.fillRect(p.x * S + S * 0.12, p.y * S + S * 0.88, S * 0.76, 5);
    g.fillStyle = f > 0.3 ? "#2c2" : "#e22"; g.fillRect(p.x * S + S * 0.12, p.y * S + S * 0.88, S * 0.76 * f, 5);
    if (p.cd) { g.fillStyle = "#a0f"; g.font = `${Math.max(10, S * 0.14)}px sans-serif`; g.textAlign = "right"; g.fillText("CD" + p.cd, p.x * S + S - 4, p.y * S + 12); }
  }

  const apMax = G.side === "x" ? 0 : G.apMax[G.side as Side];
  const ap = G.side === "x" ? 0 : G.ap;
  const pips = $("#ap-pips");
  if (pips) pips.innerHTML = Array.from({ length: Math.max(apMax, 1) }, (_, i) => `<i class="${i < ap ? "on" : ""}"></i>`).join("");
  const apn = $("#ap-num"); if (apn) apn.textContent = G.side === "x" ? "—" : `${ap} / ${apMax}`;
  const turnEl = $("#turn-label");
  if (turnEl) {
    if (G.winner) turnEl.textContent = "Мат";
    else turnEl.innerHTML = G.side === mySide
      ? `<span class="me">Ваш ход</span> · ход ${G.turn}`
      : `Ход ${G.side === "w" ? "светлых" : "тёмных"} · ${G.turn}`;
  }
  const th = $("#threat");
  if (th) th.textContent = v.threat[mySide] ? "⚠ Король под ударом" : "";
  const info = $("#info");
  if (info) info.textContent = sel ? `${STATS[sel.t].name} · HP ${sel.hp}/${sel.mh}${sel.cd ? " · CD " + sel.cd : ""}` : "Выбери фигуру";
  const abs = sel ? abilities(G, sel) : [];
  const abBtn = $("#btn-ab") as HTMLButtonElement;
  if (abBtn) { abBtn.disabled = !sel || !abs.length || G.side !== mySide; abBtn.textContent = uiMode === "ab" ? "Отмена способности" : "Способность"; }
  const endBtn = $("#btn-end") as HTMLButtonElement;
  if (endBtn) endBtn.disabled = G.side !== mySide || !!G.winner;
  const log = $("#log"); if (log) log.innerHTML = G.log.slice(0, 24).map((l) => `<div>${l}</div>`).join("");
}

function onBoardClick(e: MouseEvent) {
  if (!G || G.side === "x" || G.side !== mySide) return;
  const cv = $("#board") as HTMLCanvasElement;
  const r = cv.getBoundingClientRect();
  const S = r.width / 8;
  const x = Math.floor((e.clientX - r.left) / S);
  const y = Math.floor((e.clientY - r.top) / S);
  if (x < 0 || y < 0 || x > 7 || y > 7) return;
  const q = at(G, x, y);

  if (sel && uiMode === "ab") {
    const t = abilities(G, sel).find((a) => (a.qId != null && a.qId === q?.id) || (a.x === x && a.y === y) || (a.qId == null && a.x === sel!.x && a.y === sel!.y && q === sel));
    if (t) { doAbility(G, sel, t); sel = null; uiMode = "move"; afterAct(); return; }
  }
  if (sel && uiMode === "move") {
    const a = attacks(G, sel).find((a) => byId(G, a.qId)?.x === x && byId(G, a.qId)?.y === y);
    if (a) { doAttack(G, sel, a); sel = null; afterAct(); return; }
    if (!q && moves(G, sel).some(([mx, my]) => mx === x && my === y)) { doMove(G, sel, x, y); sel = null; afterAct(); return; }
  }
  sel = q && q.s === mySide ? q : null; uiMode = "move"; draw();
}

function bind() {
  document.querySelectorAll(".cc-mode").forEach((el) => el.addEventListener("click", () => setMode((el as HTMLElement).dataset.pm as Mode)));
  $("#create")?.addEventListener("click", createLobby);
  $("#joinbtn")?.addEventListener("click", joinLobby);
  $("#refresh")?.addEventListener("click", refreshOpen);
  $("#board")?.addEventListener("click", onBoardClick);
  $("#btn-ab")?.addEventListener("click", () => { if (!sel) return; uiMode = uiMode === "ab" ? "move" : "ab"; draw(); });
  $("#btn-end")?.addEventListener("click", () => { if (!G || G.side !== mySide) return; endTurn(G); sel = null; afterAct(); });
  $("#btn-home")?.addEventListener("click", () => { G = null; setBg("hall"); show("home"); refreshOpen(); });
  $("#btn-again")?.addEventListener("click", () => startBot(true));
  window.addEventListener("resize", () => setBg(mapDecor.bg));
  setInterval(() => { if (screen === "play" && G) draw(); }, 125);
}

(async () => {
  await preload();
  bind();
  setMode("bot");
  setBg("hall");
  show("home");
  refreshOpen();
  const me = $("#me"); if (me) me.textContent = nick();
  if (qs.get("bot") === "1" || qs.get("play") === "bot") startBot(true);
  if (qs.get("bg") === "terrace") setBg("terrace");
})();

if (LOCAL) {
  (window as any).__chessG = () => G;
  (window as any).__chessStartBot = startBot;
  (window as any).__chessView = () => G && view(G);
  (window as any).__chessMap = () => mapDecor;
  (window as any).__chessApplyMap = applyMap;
}
