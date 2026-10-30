// «Партия Чёрных королей» — клиент этапа 1 (/games/strategy). Сервер авторитетен: клиент только рисует снимок
// и подсвечивает ходы тем же движком (server/strat/rules.ts), что и сервер.
import { loadArt, unitSprite, hitFx, spriteBox, type Pose } from "./art";
import { terrainLayer, drawStruct, GOLD, INK } from "./terrain-draw";
import { TERRAIN, STRUCT, TER_RULES, openMap, type MapData } from "../../../server/strat/terrain";
import { moveTargets, attackTargets, STRAT_CFG, type GameState, type Piece, type Kind } from "../../../server/strat/rules";

const PROD_WS = "wss://morris-multiplayer.alexseylyou.workers.dev";
const qs = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const WS = LOCAL ? (qs.get("ws") || "ws://127.0.0.1:8871") : PROD_WS;
const HTTP = WS.replace(/^ws/, "http");
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

const RACE_NAME: Record<string, string> = { fire: "Огонь", ice: "Лёд" };
const KIND_NAME: Record<Kind, string> = { pawn: "Пешка", knight: "Конь", mage: "Маг", rook: "Ладья", hero: "Герой", king: "Вождь" };
const GLYPH: Record<Kind, string> = { pawn: "♟", knight: "♞", mage: "♝", rook: "♜", hero: "♛", king: "♚" };
// Стиль показа фигур: «фишки» (кружок с глифом) или «фигуры» (рисунки Художника). Хранится в localStorage.
type PieceStyle = "figures" | "tokens";
let pieceStyle: PieceStyle = (localStorage.getItem("strat.pieceStyle") as PieceStyle) === "tokens" ? "tokens" : "figures";
let glyphBadge = localStorage.getItem("strat.glyphBadge") !== "0";
const RACE_COL: Record<string, [string, string]> = { fire: ["#ff7a3d", "#7a1d08"], ice: ["#7fd6ff", "#123d66"] };
const REASON: Record<string, string> = { king: "Вождь пал", forfeit: "сдача", disconnect: "соперник не вернулся", limit: "лимит ходов (по очкам)" };
const ERR: Record<string, string> = {
  not_your_turn: "Сейчас ход соперника", already_acted: "Эта фигура уже действовала", no_ap: "Очки действий кончились", bad_move: "Туда нельзя",
  bad_attack: "Эту цель не достать", bad_turn_limit: "Лимит ходов: от 5 до 200 или без лимита", not_host: "Настройки меняет хост", pick_race: "Сначала выберите расу", seat_taken: "Место занято",
  auth_bad: "Вход не подтверждён — обновите страницу", auth_expired: "Сессия истекла — обновите страницу", no_ident: "Нужно войти или играть гостем",
  map_not_approved: "Карта ещё не проверена — играть на ней может только автор", map_hidden: "Карта скрыта модератором", not_admin: "Только для админа",
  reason_required: "Укажите причину отказа", not_found: "Карта не найдена",
  invite_rate: "Не чаще раза в 10 секунд", spectator: "Вы зритель", rate: "Слишком часто — подождите минуту",
};

// ---------- кто я ----------
async function helloMsg(): Promise<any> {
  const dev = qs.get("devUser"); if (LOCAL && dev) return { userId: dev }; // только локальный плейтест (MC_DEV_TRUST_USERID на сервере)
  const C = (window as any).Clerk;
  try { if (C?.loaded === false && C.load) await C.load(); const t = await C?.session?.getToken?.(); if (t) return { token: t }; } catch {}
  let g = localStorage.getItem("strat_guest");
  if (!g) { g = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("strat_guest", g); }
  return { guest: g, nick: localStorage.getItem("strat_nick") || "" };
}

// ---------- хаб: онлайн и приглашения ----------
let hub: WebSocket | null = null, online: { sid: string; nick: string }[] = [], isAdmin = false;
const hubWait = new Map<number, (m: any) => void>(); let rqN = 1;
function hubReq(type: string, o: any = {}): Promise<any> {
  return new Promise((res) => { if (hub?.readyState !== 1) return res({ err: "offline" }); const rq = rqN++; hubWait.set(rq, res); hub.send(JSON.stringify({ type, rq, ...o })); setTimeout(() => { if (hubWait.delete(rq)) res({ err: "timeout" }); }, 8000); });
}
function connectHub() {
  hub = new WebSocket(WS + "/strat/hub");
  hub.onopen = async () => hub!.send(JSON.stringify({ type: "hello", ...(await helloMsg()) }));
  hub.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "hello_ok") { $("#me").textContent = m.nick + (m.guest ? " (гость)" : ""); isAdmin = !!m.admin; $("#admin").hidden = !isAdmin; if (isAdmin) loadQueue(); }
    if (typeof m.type === "string" && m.type.endsWith("_r") && m.rq && hubWait.has(m.rq)) { hubWait.get(m.rq)!(m); hubWait.delete(m.rq); return; }
    if (m.type === "online") { online = m.list; renderOnline(); }
    if (m.type === "invite") showInvite(m.from, m.code, m.ttl);
    if (m.type === "invite_sent") toast(m.ok ? "Приглашение отправлено" : "Игрок уже не в сети");
    if (m.type === "err") toast(ERR[m.err] || m.err);
  };
  hub.onclose = () => setTimeout(connectHub, 3000);
}
function renderOnline() {
  const box = $("#online"); box.innerHTML = "";
  if (!online.length) { box.innerHTML = '<div class="muted">Пока никого — отправьте ссылку другу</div>'; return; }
  for (const o of online) {
    const row = document.createElement("div"); row.className = "orow";
    row.innerHTML = `<span></span><button class="btn sm">Позвать</button>`;
    row.querySelector("span")!.textContent = o.nick;
    row.querySelector("button")!.onclick = () => { if (!S?.code) return toast("Сначала создайте лобби"); hub?.send(JSON.stringify({ type: "invite", to: o.sid, code: S.code })); };
    row.querySelector("button")!.toggleAttribute("disabled", !S || S.phase !== "lobby" || !!S.seats[1]);
    box.appendChild(row);
  }
}
function showInvite(from: string, code: string, ttl: number) {
  const d = document.createElement("div"); d.className = "invite";
  d.innerHTML = `<b></b> зовёт в партию <code>${code}</code> <button class="btn sm">Принять</button><button class="btn sm ghost">✕</button>`;
  d.querySelector("b")!.textContent = from;
  const [yes, no] = d.querySelectorAll("button");
  (yes as HTMLButtonElement).onclick = () => { d.remove(); joinCode(code); };
  (no as HTMLButtonElement).onclick = () => d.remove();
  $("#toasts").appendChild(d); setTimeout(() => d.remove(), ttl * 1000);
}

// ---------- матч ----------
let selCell: [number, number] | null = null;
let ws: WebSocket | null = null, S: any = null, curCode = "", sel: number | null = null, retry = 0, left = false;
async function createLobby() {
  const size = +($<HTMLSelectElement>("#size").value), pub = $<HTMLInputElement>("#pub").checked;
  const r = await fetch(HTTP + "/strat/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ size, pub }) }).catch(() => null);
  const j: any = r ? await r.json().catch(() => ({})) : {};
  if (!j.code) return toast(ERR[j.err] || "Сервер недоступен");
  joinCode(j.code);
}
function joinCode(code: string) {
  code = code.trim().toUpperCase(); if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return toast("Код — 6 символов");
  curCode = code; left = false; const u = new URL(location.href); u.searchParams.set("join", code); history.replaceState(null, "", u);
  openMatch();
}
function openMatch() {
  ws?.close(); ws = new WebSocket(WS + "/strat/m/" + curCode);
  ws.onopen = async () => { retry = 0; ws!.send(JSON.stringify({ type: "hello", ...(await helloMsg()) })); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "st") { const prev = S; S = m; S.skew = Date.now() - m.now; onState(prev); }
    if (m.type === "err") toast(ERR[m.err] || m.err);
    if (m.type === "left") { left = true; S = null; curCode = ""; history.replaceState(null, "", location.pathname + (LOCAL && qs.get("devUser") ? location.search.replace(/[?&]join=[^&]*/, "") : "")); render(); }
  };
  ws.onclose = (e) => {
    if (left || !curCode) return;
    if (e.code === 1006 && !S && retry > 1) { toast("Лобби не найдено или закрыто"); curCode = ""; render(); return; }
    $("#status").textContent = "Связь потеряна, переподключение…"; setTimeout(openMatch, Math.min(8000, 800 * 2 ** retry++));
  };
}
const send = (o: any) => ws?.readyState === 1 && ws.send(JSON.stringify(o));

// ---------- снимок → GameState для подсветки ----------
function gs(): GameState | null {
  if (!S?.g) return null; const g = S.g;
  return { ...g, nextId: 0, lastEv: [], pieces: g.pieces.map((p: any) => ({ id: p.id, owner: p.o, kind: p.k, x: p.x, y: p.y, hp: p.hp, maxHp: p.mh, atk: p.atk, arm: p.arm, acted: !!p.a, burn: p.b, chill: p.c })) };
}

// ---------- отрисовка ----------
const cv = () => $<HTMLCanvasElement>("#board");
let fx: { x: number; y: number; t: number; txt: string; col: string }[] = [];
// анимации поверх снимка: позы (attack/hit), «призраки» павших (death), кадры эффекта удара
const poses = new Map<number, { pose: Pose; until: number }>();
let ghosts: { p: any; race: string; t: number }[] = [], bursts: { x: number; y: number; race: string; t: number }[] = [];
const POSE_MS = 420, DEATH_MS = 750, FX_MS = 480;
function onState(prev: any) {
  if (S.phase !== "play") sel = null;
  if (S.g && prev?.g && S.g.cur !== prev.g.cur) sel = null;
  const now = performance.now();
  for (const e of S.ev || []) {
    const g = S.g; if (!g) break;
    if (e.e === "hit") {
      poses.set(e.id, { pose: "attack", until: now + POSE_MS });
      const t = g.pieces.find((q: any) => q.id === e.t) || prev?.g?.pieces.find((q: any) => q.id === e.t);
      if (t) { poses.set(e.t, { pose: "hit", until: now + POSE_MS }); const a = g.pieces.find((q: any) => q.id === e.id) || prev?.g?.pieces.find((q: any) => q.id === e.id); bursts.push({ x: t.x, y: t.y, race: a ? g.races[a.o] : "", t: now }); }
    }
    if (e.e === "kill") { const d = prev?.g?.pieces.find((q: any) => q.id === e.id); if (d) ghosts.push({ p: d, race: g.races[d.o], t: now }); }
    const p = g.pieces.find((q: any) => q.id === (e.t ?? e.id));
    if (e.e === "hit" && p) fx.push({ x: p.x, y: p.y, t: performance.now(), txt: "-" + e.dmg + (e.burn ? "🔥" : e.chill ? "❄" : ""), col: "#ff5b5b" });
    if (e.e === "burn" && p) fx.push({ x: p.x, y: p.y, t: performance.now(), txt: "-" + e.dmg + "🔥", col: "#ffa03d" });
    if (e.e === "promote" && p) fx.push({ x: p.x, y: p.y, t: performance.now(), txt: "↑ " + KIND_NAME[e.kind as Kind], col: "#ffd76a" });
  }
  render();
}
function render() {
  const inMatch = !!S;
  $("#home").hidden = inMatch; $("#match").hidden = !inMatch;
  renderOnline();
  if (!S) return;
  const me = S.you, seats = S.seats;
  $("#code").textContent = S.code;
  $("#lobby").hidden = S.phase !== "lobby"; $("#play").hidden = S.phase === "lobby";
  // места
  const seatHtml = (i: number) => {
    const s = seats[i]; if (!s) return `<div class="seat empty">Ждём соперника…</div>`;
    const race = s.race ? `<span class="race ${s.race}">${RACE_NAME[s.race]}</span>` : s.picked ? `<span class="race">выбрана</span>` : `<span class="race">—</span>`;
    return `<div class="seat ${i === me ? "me" : ""}"><span class="nick"></span>${s.bot ? " 🤖" : s.guest ? " <small>гость</small>" : ""}${i === 0 ? " <small>хост</small>" : ""} ${race}
      ${S.phase === "lobby" ? (s.ready ? '<span class="ok">готов</span>' : '<span class="muted">не готов</span>') : ""}${s.online ? "" : ' <span class="warn">не в сети</span>'}</div>`;
  };
  for (const i of [0, 1]) { const el = $("#seat" + i); el.innerHTML = seatHtml(i); const n = el.querySelector(".nick"); if (n) n.textContent = seats[i].nick; }
  if (S.phase === "lobby") {
    const host = me === 0;
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-size]")) { b.classList.toggle("on", +b.dataset.size! === S.size); b.disabled = !host; }
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-race]")) b.classList.toggle("on", seats[me]?.race === b.dataset.race);
    const sc = STRAT_CFG.sizes[S.size], tl = S.turnLimit ?? sc.turnLimit;
    const sel_ = $<HTMLSelectElement>("#tl"); sel_.disabled = !host;
    (sel_.options[0] as HTMLOptionElement).textContent = `по умолчанию (${sc.turnLimit})`;
    sel_.value = S.turnLimit == null ? "" : String(S.turnLimit);
    if (sel_.value !== (S.turnLimit == null ? "" : String(S.turnLimit))) { const o = document.createElement("option"); o.value = o.textContent = String(S.turnLimit); sel_.appendChild(o); sel_.value = o.value; }
    $("#sizeinfo").textContent = `${S.size}×${S.size}: ${sc.ap} ОД за ход, ${sc.turnSec} с на ход + запас ${sc.reserveSec / 60} мин, ${tl ? "лимит " + tl + " ходов" : "без лимита ходов"}`;
    $<HTMLButtonElement>("#bot").hidden = !host; $("#bot").textContent = seats[1]?.bot ? "Убрать бота" : "Играть с ботом";
    $<HTMLButtonElement>("#bot").disabled = !!seats[1] && !seats[1].bot;
    renderLobbyMap(host);
    $("#ready").textContent = seats[me]?.ready ? "Не готов" : "Готов!";
    $<HTMLButtonElement>("#ready").disabled = me < 0 || !seats[me]?.race;
    $("#status").textContent = me < 0 ? "Лобби заполнено — вы зритель" : !seats[1] ? "Отправьте ссылку или код сопернику" : "Выберите расу и нажмите «Готов» — расы откроются на старте";
  } else {
    const g = S.g; const myTurn = S.phase === "play" && g.cur === me;
    const name = (i: number) => (i === me ? "Вы" : seats[i]?.nick || "?");
    $("#status").textContent = S.phase === "over"
      ? (S.result.winner === 2 ? "Ничья" : S.result.winner === me ? "Победа!" : me < 0 ? `Победил ${seats[S.result.winner].nick}` : "Поражение") + " — " + (REASON[S.result.reason] || S.result.reason)
      : `Ход ${g.turn}/${g.turnLimit || "∞"} · ${myTurn ? "ваш ход" : "ходит " + name(g.cur)} · ОД ${g.ap}/${g.apMax}` + (S.check?.[me] ? " · ШАХ вашему Вождю!" : "");
    $("#status").classList.toggle("myturn", myTurn);
    $("#mapname").textContent = S.mapInfo?.name ? "Карта: " + S.mapInfo.name : "";
    $<HTMLButtonElement>("#end").disabled = !myTurn; $<HTMLButtonElement>("#end").hidden = S.phase !== "play"; $<HTMLButtonElement>("#forfeit").hidden = S.phase !== "play" || me < 0;
    $<HTMLButtonElement>("#rematch").hidden = S.phase !== "over" || me < 0;
    $("#rematch").textContent = seats[me]?.rematch ? "Ждём соперника…" : "Реванш";
    $("#score").innerHTML = [0, 1].map((i) => `<span class="race ${g.races[i]}">${RACE_NAME[g.races[i]]}</span> ${i === me ? "вы" : ""} · фигур: ${g.pieces.filter((p: any) => p.o === i).length}`).join("<br>");
    renderInfo();
  }
  for (const id of ["#mapbadge", "#mapbadge2"]) $(id).hidden = !(S.mapInfo && S.mapInfo.xp === false);
  draw();
}
// ---------- карта в лобби ----------
let mapListSize = 0, mapList: any[] = [];
const ST_NAME: Record<string, string> = { official: "", approved: "", pending: " · на проверке", rejected: " · отклонена", hidden: " · скрыта" };
async function renderLobbyMap(host: boolean) {
  const sel_ = $<HTMLSelectElement>("#mapsel"); sel_.disabled = !host;
  if (mapListSize !== S.size) {
    mapListSize = S.size; const r = await hubReq("map_list", { size: S.size }); if (r.err) { mapListSize = 0; if (r.err === "offline") setTimeout(render, 700); return; } mapList = r.list || [];
    sel_.innerHTML = ""; for (const m of mapList) { const o = document.createElement("option"); o.value = m.id; o.textContent = m.name + (m.author ? " — " + m.author : "") + (m.kind === "mine" ? " (моя)" : "") + (ST_NAME[m.status] || ""); sel_.appendChild(o); }
  }
  const cur = S.mapInfo?.id || ""; const want = cur.startsWith("rnd:") ? "rnd" : cur;
  if (want && ![...sel_.options].some((o) => o.value === want)) { const o = document.createElement("option"); o.value = want; o.textContent = S.mapInfo.name; sel_.appendChild(o); }
  if (want) sel_.value = want;
  const pv = $<HTMLCanvasElement>("#mappv"), m: MapData | undefined = S.lobbyMap;
  if (m) { const d = devicePixelRatio || 1, w = 220; pv.style.width = pv.style.height = w + "px"; pv.width = pv.height = Math.round(w * d);
    pv.getContext("2d")!.drawImage(terrainLayer(m, pv.width, S.you === 1, [GOLD, "#b3261e"]), 0, 0); }
  $("#mapdesc").textContent = m ? mapSummary(m) : "";
}
function mapSummary(m: MapData) {
  const cnt: Record<string, number> = {}; for (const c of m.s) if (c !== ".") cnt[c] = (cnt[c] || 0) + 1;
  return Object.entries(cnt).map(([c, n]) => (STRUCT as any)[c]?.name + (n > 1 ? " ×" + n : "")).join(", ");
}
// ---------- модерация карт (только админ; сервер проверяет права сам) ----------
async function loadQueue() {
  const box = $("#modq"); box.textContent = "Загрузка…";
  const r = await hubReq("map_queue"); if (r.err) { box.textContent = ERR[r.err] || r.err; return; }
  box.innerHTML = r.list.length ? "" : '<div class="muted">Очередь пуста</div>';
  for (const q of r.list) {
    const row = document.createElement("div"); row.className = "modrow";
    const pv = document.createElement("canvas"); pv.width = pv.height = 150; pv.style.width = pv.style.height = "150px";
    pv.getContext("2d")!.drawImage(terrainLayer({ id: q.id, name: q.name, size: q.size, t: q.t, s: q.s }, 150, false, [GOLD, "#b3261e"]), 0, 0);
    const info = document.createElement("div");
    const ch = q.checks || { errors: [], warnings: [] };
    info.innerHTML = `<b></b> <span class="muted">${q.size}×${q.size} · ${q.status}${q.flagged ? " · жалоб: " + q.flagged : ""}</span><div class="muted au"></div>
      <div class="${ch.errors.length ? "warn" : "ok"}">${ch.errors.length ? "ошибки: " + ch.errors.join(", ") : "проверки пройдены"}${ch.warnings.length ? " · предупреждения: " + ch.warnings.join(", ") : ""}</div>
      <div class="row"><button class="btn sm gold" data-a="approve">Одобрить</button><button class="btn sm" data-a="reject">Отклонить</button><button class="btn sm ghost" data-a="hide">Скрыть</button>${q.flagged ? '<button class="btn sm ghost" data-a="clear_flag">Снять жалобы</button>' : ""}</div>`;
    info.querySelector("b")!.textContent = q.name; info.querySelector(".au")!.textContent = "автор: " + (q.author_nick || q.author) + (q.flag_note ? " · жалоба: " + q.flag_note : "");
    for (const b of info.querySelectorAll<HTMLButtonElement>("[data-a]")) b.onclick = async () => {
      const act = b.dataset.a!; let reason: string | undefined;
      if (act === "reject") { reason = prompt("Причина отказа (увидит автор):") || ""; if (!reason.trim()) return; }
      const x = await hubReq("map_mod", { id: q.id, act, reason }); toast(x.err ? ERR[x.err] || x.err : "Готово: " + x.status); loadQueue();
    };
    row.append(pv, info); box.appendChild(row);
  }
}
function renderInfo() {
  const g = S?.g; const p = g && sel != null ? g.pieces.find((q: any) => q.id === sel) : null;
  $("#info").innerHTML = p ? `<b>${KIND_NAME[p.k as Kind]}</b> · HP ${p.hp}/${p.mh} · АТК ${p.atk} · БРН ${p.arm}${p.b ? ` · горит ${p.b}` : ""}${p.c ? " · обморожен" : ""}${p.a ? " · уже ходил" : ""}`
    : selCell ? "" : '<span class="muted">Нажмите на свою фигуру: зелёные клетки — ход, красные — атака. Клетка без фигуры — описание рельефа</span>';
  const m: MapData | undefined = g?.map, at = p ? [p.x, p.y] : selCell;
  if (m && at) { const [x, y] = at, t = m.t[y * m.size + x], st = m.s[y * m.size + x];
    const eff = t === "f" ? `укрытие +${TER_RULES.forestArm} БРН, скольжение останавливается` : t === "g" ? `проход в стене, укрытие +${TER_RULES.gateArm} БРН` : t === "w" ? "не пройти (кроме расы Воды); стрелять через воду можно" : t === "m" ? "не пройти (кроме расы Камня); закрывает обстрел" : t === "#" ? "не пройти, закрывает обстрел" : t === "b" ? "переправа через реку" : "";
    $("#info").innerHTML += `<div class="cellinfo"><b>${(TERRAIN as any)[t]?.name || t}</b>${eff ? " — " + eff : ""}${st !== "." ? `<br><b>${(STRUCT as any)[st]?.name}</b> — ${(STRUCT as any)[st]?.eff}` : ""}</div>`; }
}
function geom() { const c = cv(), n = S.g.size, side = c.width, cell = side / n; return { c, n, cell, flip: S.you === 1 }; }
function draw() {
  const c = cv(); if (!S?.g || c.offsetParent === null) return;
  const dpr = devicePixelRatio || 1, w = Math.min(c.parentElement!.clientWidth, 640); c.style.width = c.style.height = w + "px";
  if (c.width !== Math.round(w * dpr)) c.width = c.height = Math.round(w * dpr);
  const ctx = c.getContext("2d")!, { n, cell, flip } = geom(), g = S.g;
  const sx = (x: number) => (flip ? n - 1 - x : x) * cell, sy = (y: number) => (flip ? n - 1 - y : y) * cell;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  // рельеф и постройки — пререндер (не шахматка); цвет точек спавна — цвет расы стороны
  const map: MapData = g.map || openMap(n);
  ctx.drawImage(terrainLayer(map, c.width, flip, [(RACE_COL[g.races[0]] || [GOLD])[0], (RACE_COL[g.races[1]] || [GOLD])[0]]), 0, 0);
  if (selCell) { ctx.strokeStyle = "#f3cf68"; ctx.lineWidth = Math.max(2, cell * 0.05); ctx.setLineDash([cell * 0.12, cell * 0.08]); ctx.strokeRect(sx(selCell[0]) + 2, sy(selCell[1]) + 2, cell - 4, cell - 4); ctx.setLineDash([]); }
  const G = gs()!; const P = sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && S.phase === "play" && G.cur === S.you && !P.acted && G.ap > 0) {
    ctx.fillStyle = "rgba(90,220,120,.35)"; for (const [x, y] of moveTargets(G, P)) ctx.fillRect(sx(x), sy(y), cell, cell);
    ctx.strokeStyle = "rgba(255,80,80,.9)"; ctx.lineWidth = Math.max(2, cell * 0.08); for (const [x, y] of attackTargets(G, P)) ctx.strokeRect(sx(x) + 2, sy(y) + 2, cell - 4, cell - 4);
  }
  const now0 = performance.now();
  ghosts = ghosts.filter((d) => now0 - d.t < DEATH_MS);
  for (const d of ghosts) { ctx.globalAlpha = 1 - (now0 - d.t) / DEATH_MS; drawUnit(ctx, d.p, d.race, "death", sx(d.p.x), sy(d.p.y), cell, false); ctx.globalAlpha = 1; }
  for (const p of g.pieces) {
    const cx = sx(p.x) + cell / 2, cy = sy(p.y) + cell / 2, r = cell * 0.4;
    const ps = poses.get(p.id), pose: Pose = ps && ps.until > now0 ? ps.pose : "idle";
    ctx.globalAlpha = p.a && p.o === g.cur ? 0.6 : 1;
    drawUnit(ctx, p, g.races[p.o], pose, sx(p.x), sy(p.y), cell, true);
    if (p.id === sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; if (pieceStyle === "tokens") { ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, 7); ctx.stroke(); } else ctx.strokeRect(sx(p.x) + 3, sy(p.y) + 3, cell - 6, cell - 6); }
    if (p.k === "king" && S.check?.[p.o]) { ctx.strokeStyle = "#ff3030"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, 7); ctx.stroke(); }
    const bw = cell * 0.7, bx = cx - bw / 2, by = sy(p.y) + cell * 0.88; ctx.fillStyle = "#000a"; ctx.fillRect(bx, by, bw, cell * 0.08);
    ctx.fillStyle = p.hp / p.mh > 0.5 ? "#6be36b" : p.hp / p.mh > 0.25 ? "#e3c16b" : "#e36b6b"; ctx.fillRect(bx, by, bw * Math.max(0, p.hp / p.mh), cell * 0.08);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (p.b) { ctx.font = `${Math.round(cell * 0.2)}px sans-serif`; ctx.fillText("🔥", sx(p.x) + cell * 0.85, sy(p.y) + cell * 0.15); }
    if (p.c) { ctx.font = `${Math.round(cell * 0.2)}px sans-serif`; ctx.fillText("❄", sx(p.x) + cell * 0.85, sy(p.y) + cell * (p.b ? 0.36 : 0.15)); }
    const st = map.s[p.y * n + p.x]; if (st && st !== ".") drawStruct(ctx, st, sx(p.x) + cell * 0.14, sy(p.y) + cell * 0.72, cell * 0.26, GOLD); // постройка под фигурой — значком в углу
    ctx.globalAlpha = 1;
  }
  const now = performance.now(); fx = fx.filter((f) => now - f.t < 1100);
  bursts = bursts.filter((b) => now - b.t < FX_MS);
  for (const b of bursts) { const fr = hitFx(b.race); if (!fr.length) continue; const i = Math.min(fr.length - 1, Math.floor(((now - b.t) / FX_MS) * fr.length)), s2 = cell * 1.25; ctx.drawImage(fr[i], sx(b.x) + cell / 2 - s2 / 2, sy(b.y) + cell / 2 - s2 / 2, s2, s2); }
  for (const f of fx) { const k = (now - f.t) / 1100; ctx.globalAlpha = 1 - k; ctx.fillStyle = f.col; ctx.font = `bold ${Math.round(cell * 0.3)}px sans-serif`; ctx.fillText(f.txt, sx(f.x) + cell / 2, sy(f.y) + cell * (0.3 - k * 0.4)); }
  ctx.globalAlpha = 1;
  const busy = fx.length || bursts.length || ghosts.length || [...poses.values()].some((q) => q.until > now);
  if (busy) requestAnimationFrame(draw);
}
/** Фигура. «Фигуры»: спрайт Художника (поза → idle), центрированный по непрозрачной области и вписанный в клетку;
 *  нет спрайта у расы — рисованная кодом фигурка. «Фишки»: кружок с глифом. Свои смотрят вправо, чужие — влево. */
function drawUnit(ctx: CanvasRenderingContext2D, p: any, race: string, pose: Pose, x0: number, y0: number, cell: number, withGlyph: boolean) {
  const [hi, lo] = RACE_COL[race] || ["#ccc", "#333"], cx = x0 + cell / 2, cy = y0 + cell / 2, r = cell * 0.4;
  const own = p.o === S.you, lw = Math.max(1.5, cell * 0.04);
  if (pieceStyle === "figures") {
    // подставка: цвет расы, обводка «свой» (слоновая кость) / «чужой» (чёрная)
    const gy = y0 + cell * 0.84;
    ctx.fillStyle = hi + "66"; ctx.strokeStyle = own ? "#f5e6a8" : INK; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(cx, gy, cell * 0.34, cell * 0.1, 0, 0, 7); ctx.fill(); ctx.stroke();
    const spr = unitSprite(race, p.k, pose), mirror = p.o !== (S.you < 0 ? 0 : S.you);
    ctx.save(); if (mirror) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); }
    if (spr) {
      const bb = spriteBox(spr) || [0, 0, spr.naturalWidth, spr.naturalHeight, spr.naturalWidth];
      const bw = bb[2] - bb[0], bh = bb[3] - bb[1], k = Math.min((cell * 0.8) / bh, (cell * 0.9) / bw);
      const dx = cx - (bb[0] + bw / 2) * k, dy = gy + cell * 0.02 - bb[3] * k; // низ фигуры — на подставке, по центру клетки
      ctx.drawImage(spr, dx, dy, spr.naturalWidth * k, spr.naturalHeight * k);
    } else codeFigure(ctx, p.k, hi, lo, cx, gy, cell);
    ctx.restore();
    if (pose === "hit") { ctx.fillStyle = "#ffffff33"; ctx.fillRect(x0, y0, cell, cell); }
    if (withGlyph && glyphBadge) { // значок типа хода в углу
      const bx = x0 + cell * 0.16, by = y0 + cell * 0.16, br = cell * 0.13;
      ctx.fillStyle = lo; ctx.strokeStyle = own ? GOLD : INK; ctx.lineWidth = Math.max(1, cell * 0.025);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = `${Math.round(cell * 0.19)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(GLYPH[p.k as Kind], bx, by + 1);
    }
    return;
  }
  const grd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); grd.addColorStop(0, hi); grd.addColorStop(1, lo);
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(1.5, cell * 0.05); ctx.strokeStyle = own ? "#f5e6a8" : INK; ctx.stroke();
  if (pose === "hit") { ctx.fillStyle = "#ffffff55"; ctx.fill(); }
  ctx.fillStyle = "#fff"; ctx.font = `${Math.round(cell * 0.46)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(GLYPH[p.k as Kind], cx, cy + 1);
}
/** Запасная фигурка, нарисованная кодом в стиле C (для рас без арта): подставка-корпус-голова + эмблема типа. */
function codeFigure(ctx: CanvasRenderingContext2D, k: string, hi: string, lo: string, cx: number, gy: number, c: number) {
  const s = c * 0.78, w = Math.max(1.4, c * 0.04); ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = "round";
  const P = (pts: number[][], f: string) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(cx + a * s, gy - b * s) : ctx.moveTo(cx + a * s, gy - b * s))); ctx.closePath(); ctx.fillStyle = f; ctx.fill(); ctx.stroke(); };
  const O = (a: number, b: number, r: number, f: string) => { ctx.beginPath(); ctx.arc(cx + a * s, gy - b * s, r * s, 0, 7); ctx.fillStyle = f; ctx.fill(); ctx.stroke(); };
  const tall = k === "king" || k === "hero" ? 1.1 : k === "pawn" ? 0.85 : 1;
  P([[-0.26, 0], [0.26, 0], [0.18, 0.5 * tall], [-0.18, 0.5 * tall]], lo); P([[-0.12, 0.08], [0.12, 0.08], [0.08, 0.46 * tall], [-0.08, 0.46 * tall]], hi);
  O(0, 0.62 * tall, 0.13, "#efe6cf");
  if (k === "king") P([[-0.14, 0.72 * tall], [-0.14, 0.9 * tall], [-0.07, 0.8 * tall], [0, 0.94 * tall], [0.07, 0.8 * tall], [0.14, 0.9 * tall], [0.14, 0.72 * tall]], GOLD);
  if (k === "mage") P([[-0.15, 0.7], [0, 1.0], [0.15, 0.7]], lo);
  if (k === "rook") P([[0.18, 0.12], [0.36, 0.12], [0.36, 0.42], [0.27, 0.5], [0.18, 0.42]], GOLD);
  if (k === "hero") { ctx.beginPath(); ctx.moveTo(cx + 0.24 * s, gy - 0.1 * s); ctx.lineTo(cx + 0.36 * s, gy - 0.9 * s); ctx.lineWidth = w * 1.6; ctx.strokeStyle = GOLD; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = INK; }
  if (k === "pawn") { ctx.beginPath(); ctx.moveTo(cx + 0.24 * s, gy); ctx.lineTo(cx + 0.24 * s, gy - 0.95 * s); ctx.stroke(); P([[0.24, 0.95], [0.3, 0.82], [0.18, 0.82]], "#c9c2cc"); }
  if (k === "knight") P([[0.1, 0.5], [0.42, 0.62], [0.46, 0.5], [0.3, 0.42], [0.22, 0.2]], hi);
}
function onBoard(ev: MouseEvent) {
  if (!S?.g || S.phase !== "play") return;
  const c = cv(), r = c.getBoundingClientRect(), n = S.g.size, cell = r.width / n;
  let x = Math.floor((ev.clientX - r.left) / cell), y = Math.floor((ev.clientY - r.top) / cell);
  if (S.you === 1) { x = n - 1 - x; y = n - 1 - y; }
  const G = gs()!, here = G.pieces.find((p) => p.x === x && p.y === y);
  selCell = here ? null : [x, y];
  if (here && here.owner === S.you) { sel = here.id === sel ? null : here.id; renderInfo(); return draw(); }
  const P = sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && G.cur === S.you) {
    if (here && attackTargets(G, P).some(([a, b]) => a === x && b === y)) send({ type: "act", act: { a: "attack", id: P.id, x, y } });
    else if (!here && moveTargets(G, P).some(([a, b]) => a === x && b === y)) {
      const last = P.owner === 0 ? 0 : G.size - 1, promo = P.kind === "pawn" && y === last ? pickPromo() : undefined;
      send({ type: "act", act: { a: "move", id: P.id, x, y, ...(promo ? { promo } : {}) } });
    } else { sel = here ? here.id : null; renderInfo(); return draw(); }
    sel = null;
  } else { sel = here ? here.id : null; renderInfo(); draw(); }
}
function pickPromo(): Kind { const a = prompt("Пешка дошла до края. В кого превратить? (конь / маг / ладья)", "ладья") || ""; return /кон/i.test(a) ? "knight" : /маг/i.test(a) ? "mage" : "rook"; }

// ---------- таймер ----------
function tick() {
  if (S?.phase === "play" && S.clock) {
    const now = Date.now() - S.skew, g = S.g, c = S.clock;
    const turnLeft = Math.max(0, c.turnEnds - now), res = Math.max(0, c.reserve[g.cur] - Math.max(0, now - c.turnEnds));
    const f = (ms: number) => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    $("#clock").textContent = `⏳ ${f(turnLeft)}  · запас ${f(res)}`;
    $("#clock").classList.toggle("low", turnLeft < 10000);
  } else $("#clock").textContent = "";
}

// ---------- мелочи ----------
function toast(t: string) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; $("#toasts").appendChild(d); setTimeout(() => d.remove(), 3500); }
async function loadOpen() {
  const r = await fetch(HTTP + "/strat/open").catch(() => null); const j: any = r ? await r.json().catch(() => ({})) : {};
  const box = $("#open"); box.innerHTML = "";
  if (!j.list?.length) { box.innerHTML = '<div class="muted">Открытых лобби нет — создайте своё</div>'; return; }
  for (const l of j.list) { const b = document.createElement("button"); b.className = "btn sm"; b.textContent = `${l.code} · ${l.size}×${l.size} · ${l.host || ""}`; b.onclick = () => joinCode(l.code); box.appendChild(b); }
}

export function boot() {
  $("#create").onclick = createLobby;
  $("#joinbtn").onclick = () => joinCode($<HTMLInputElement>("#joincode").value);
  $<HTMLInputElement>("#joincode").onkeydown = (e) => { if (e.key === "Enter") joinCode((e.target as HTMLInputElement).value); };
  $("#refresh").onclick = loadOpen;
  $("#copy").onclick = async () => { const u = location.origin + location.pathname + "?join=" + S.code; try { await navigator.clipboard.writeText(u); toast("Ссылка скопирована"); } catch { prompt("Ссылка на лобби:", u); } };
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-size]")) b.onclick = () => send({ type: "cfg", size: +b.dataset.size! });
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-race]")) b.onclick = () => send({ type: "race", race: b.dataset.race });
  $<HTMLSelectElement>("#tl").onchange = (e) => { const v = (e.target as HTMLSelectElement).value; send({ type: "cfg", turnLimit: v === "" ? null : +v }); };
  $("#bot").onclick = () => send({ type: "bot", on: !S.seats[1]?.bot });
  $("#ready").onclick = () => send({ type: "ready", on: !S.seats[S.you]?.ready });
  $("#end").onclick = () => send({ type: "act", act: { a: "end" } });
  $("#forfeit").onclick = () => confirm("Сдаться? Победа уйдёт сопернику.") && send({ type: "forfeit" });
  $("#rematch").onclick = () => send({ type: "rematch" });
  $("#leave").onclick = () => { if (S?.phase === "play" && !confirm("Выйти? Это засчитается как сдача.")) return; send({ type: "leave" }); };
  $("#nick").oninput = (e) => localStorage.setItem("strat_nick", (e.target as HTMLInputElement).value.slice(0, 24));
  $<HTMLInputElement>("#nick").value = localStorage.getItem("strat_nick") || "";
  const ps = $<HTMLButtonElement>("#pstyle"), pb = $<HTMLInputElement>("#pbadge");
  const syncPs = () => { ps.textContent = pieceStyle === "figures" ? "Вид: фигуры ⇄ фишки" : "Вид: фишки ⇄ фигуры"; ps.dataset.style = pieceStyle; pb.checked = glyphBadge; pb.parentElement!.hidden = pieceStyle !== "figures"; };
  ps.onclick = () => { pieceStyle = pieceStyle === "figures" ? "tokens" : "figures"; localStorage.setItem("strat.pieceStyle", pieceStyle); syncPs(); draw(); };
  pb.onchange = () => { glyphBadge = pb.checked; localStorage.setItem("strat.glyphBadge", glyphBadge ? "1" : "0"); draw(); };
  syncPs();
  $<HTMLSelectElement>("#mapsel").onchange = (e) => send({ type: "cfg", map: (e.target as HTMLSelectElement).value });
  $("#modrefresh").onclick = loadQueue;
  cv().onclick = onBoard; addEventListener("resize", draw);
  setInterval(tick, 250);
  connectHub(); loadOpen(); render(); loadArt(draw);
  const j = qs.get("join"); if (j) joinCode(j);
}

// Хуки только для локального плейтеста (localhost + ?devUser): снимок состояния и клик-план «как игрок».
if (LOCAL && qs.get("devUser")) (window as any).__stratS = () => S;
if (LOCAL && qs.get("devUser")) (window as any).__stratPlan = () => {
  if (!S?.g) return "wait"; if (S.phase === "over") return "over"; if (S.g.cur !== S.you) return "wait";
  const G = gs()!, mine = G.pieces.filter((p) => p.owner === S.you && !p.acted);
  const r = cv().getBoundingClientRect(), n = G.size, cell = r.width / n;
  const px = (x: number, y: number) => { if (S.you === 1) { x = n - 1 - x; y = n - 1 - y; } return [r.left + (x + 0.5) * cell, r.top + (y + 0.5) * cell]; };
  for (const p of mine) { const t = attackTargets(G, p)[0]; if (t) return { from: px(p.x, p.y), to: px(t[0], t[1]), atk: true, kind: p.kind }; }
  const opts = mine.flatMap((p) => moveTargets(G, p).map((t) => ({ p, t, d: (S.you === 0 ? t[1] - p.y : p.y - t[1]) })));
  opts.sort((a, b) => a.d - b.d || Math.random() - 0.5);
  const o = opts[0]; return o ? { from: px(o.p.x, o.p.y), to: px(o.t[0], o.t[1]) } : "end";
};
