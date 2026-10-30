// «Партия Чёрных королей» — клиент (/games/strategy). Сервер авторитетен: клиент рисует снимок и подсвечивает ходы
// тем же движком (server/strat/rules.ts). Экран игры: доска с камерой (панорама/масштаб/мини-карта) для карт до 100×100,
// HUD вокруг, игровые окна вместо prompt/confirm, баннер хода, тосты, анимации.
import { loadArt, unitSprite, hitFx, spriteBox, type Pose } from "./art";
import { terrainLayer, drawStructIcon, GOLD, INK } from "./terrain-draw";
import { renderBar, renderCity, renderTech, pieceActs, bindPieceActs, boardClick, drawEcon, econFx, econToast, cfgOf, ui as eui, KIND_NAME, ECON_ERR, territoryCached, pieceLv, talName, unitArt, type Ctx } from "./econ-ui";
import { TERRAIN, STRUCT, TER_RULES, openMap, type MapData } from "../../../server/strat/terrain";
import { moveTargets, attackTargets, STRAT_CFG, SIZES, RACES, newGame, makeMap, view, type GameState, type Kind } from "../../../server/strat/rules";
import { injectIcons, ic, iconImg, RACE_ICON } from "./icons";
import { esc, modal, confirmDlg, choiceDlg, promptDlg, toast as uiToast, banner, showTip, hideTip, bindTips } from "./ui-kit";
import { GOALS, goalsOf, chiefOf, chiefTypes, chiefNodeState, normTree, type Goal, type CNode } from "./goals";
import { fogView, unveilCls, fogNode } from "./fog";
import { racePassives, talentPassive, terrainPassive, structPassive, pasIcon, regPassive, passiveTip, effLine, type Passive } from "./passives";
import { setTipResolver } from "./ui-kit";
import { parseUlt, addCast, ultBanner, zonesOf, resetUlt, drawZones, drawCasts, drawAim, ULT, ultRadius } from "./ult-fx";
import { chatInit, chatRecv, chatReset, chatShow, chatDemo } from "./chat";
import { renderPlayers, renderSlots, playerCol, isAway, teamOf, modeOf, allies } from "./players";
import { openProfile, demoProfile } from "./profile";
import { profileHtml, openLeaderboard, ratingDelta, leagueOf, leagueName, LEAGUES } from "./rating";
import { localFell, resetFell, blacklistOf } from "./goals";
import { drawLvBadge, abilityBar, bindAbilityBar, renderLvDock, pieceLevel, pendingTalent } from "./units";

const PROD_WS = "wss://morris-multiplayer.alexseylyou.workers.dev";
const qs = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const WS = LOCAL ? (qs.get("ws") || "ws://127.0.0.1:8871") : PROD_WS;
const HTTP = WS.replace(/^ws/, "http");
const DEV = LOCAL && !!qs.get("devUser");
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export const RACE_NAME: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
const GLYPH: Record<Kind, string> = { pawn: "♟", knight: "♞", mage: "♝", rook: "♜", hero: "♛", king: "♚" };
type PieceStyle = "figures" | "tokens";
let pieceStyle: PieceStyle = (localStorage.getItem("strat.pieceStyle") as PieceStyle) === "tokens" ? "tokens" : "figures";
let glyphBadge = localStorage.getItem("strat.glyphBadge") !== "0";
const RACE_COL: Record<string, [string, string]> = { fire: ["#ff7a3d", "#7a1d08"], ice: ["#7fd6ff", "#123d66"], water: ["#3fa7d6", "#0d3a5c"], stone: ["#c2a27a", "#4a3a2a"], nature: ["#7ccf5a", "#1f4d1a"], lightning: ["#ffe14d", "#4a3d8f"] };
const REASON: Record<string, string> = { glory: "Достигнут порог Славы", capital: "Столица взята", king: "Вождь пал", forfeit: "Соперник сдался", disconnect: "Соперник не вернулся", limit: "Лимит ходов — победа по очкам", goals: "Выполнены 3 цели из 5" };
const ERR: Record<string, string> = { ...ECON_ERR, quiet: "Сейчас нельзя", bad_action: "Неверное действие", guest: "Только для вошедших",
  not_your_turn: "Сейчас ход соперника", already_acted: "Эта фигура уже действовала", no_ap: "Очки действий кончились", bad_move: "Туда нельзя",
  bad_attack: "Эту цель не достать", bad_turn_limit: "Лимит ходов: от 5 до 200 или без лимита", not_host: "Настройки меняет хост", pick_race: "Сначала выберите расу", seat_taken: "Место занято",
  auth_bad: "Вход не подтверждён — обновите страницу", auth_expired: "Сессия истекла — обновите страницу", no_ident: "Нужно войти или играть гостем",
  map_not_approved: "Карта ещё не проверена — играть на ней может только автор", map_hidden: "Карта скрыта модератором", not_admin: "Только для админа",
  reason_required: "Укажите причину отказа", not_found: "Карта не найдена", bad_size: "Такой размер поля сервер пока не поддерживает",
  invite_rate: "Не чаще раза в 10 секунд", spectator: "Вы зритель", rate: "Слишком часто — подождите минуту",
};
const toast = (t: string, k: "info" | "good" | "bad" | "turn" = "info", i?: string) => uiToast(t, k, i);
/** Прицел ульты/способности: телеграф круга на доске до клика. */
let ultAim: { id: string; pid: number; r: number; race: string; chief: boolean } | null = null, aimCell: [number, number] | null = null;
/** Время на ход по размеру карты (если хост не задал): 4×4 — 1 мин … 50+ — 30 мин. */
const turnSecFor = (n: number) => (n <= 4 ? 60 : n <= 5 ? 90 : n <= 8 ? 180 : n <= 15 ? 300 : n <= 25 ? 600 : n <= 49 ? 1200 : 1800);
const fmtMin = (s: number) => (s >= 60 ? `${Math.round(s / 60)} мин` : `${s} с`);
const SMALL = 12; // до этого размера доска целиком, без камеры и мини-карты

// ---------- кто я ----------
async function helloMsg(): Promise<any> {
  const dev = qs.get("devUser"); if (LOCAL && dev) return { userId: dev };
  const C = (window as any).Clerk;
  try { if (C?.loaded === false && C.load) await C.load(); const t = await C?.session?.getToken?.(); if (t) return { token: t }; } catch {}
  let g = localStorage.getItem("strat_guest");
  if (!g) { g = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("strat_guest", g); }
  return { guest: g, nick: localStorage.getItem("strat_nick") || "" };
}

// ---------- хаб ----------
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
    if (m.type === "hello_ok") { $("#me").textContent = m.nick + (m.guest ? " · гость" : ""); isAdmin = !!m.admin; applyPrefs(m.prefs); mountAdmin(); loadResume(); }
    if (typeof m.type === "string" && m.type.endsWith("_r") && m.rq && hubWait.has(m.rq)) { hubWait.get(m.rq)!(m); hubWait.delete(m.rq); return; }
    if (m.type === "online") { online = m.list; renderOnline(); }
    if (m.type === "resume") { resumeInfo = m.game || null; renderResume(); }
    if (m.type === "invite") showInvite(m.from, m.code, m.ttl);
    if (m.type === "invite_sent") toast(m.ok ? "Приглашение отправлено" : "Игрок уже не в сети", m.ok ? "good" : "bad");
    if (m.type === "err") toast(ERR[m.err] || m.err, "bad");
  };
  hub.onclose = () => setTimeout(connectHub, 3000);
}
function renderOnline() {
  const box = $("#online"); if (!box) return; box.innerHTML = "";
  if (!online.length) { box.innerHTML = `<div class="empty">${ic("user")}<span>Пока никого — отправьте ссылку другу</span></div>`; return; }
  for (const o of online) {
    const row = document.createElement("div"); row.className = "orow";
    row.innerHTML = `${ic("user")}<span class="nm"></span><button class="btn sm">${ic("flag")}<span>Позвать</span></button>`;
    row.querySelector(".nm")!.textContent = o.nick;
    const b = row.querySelector("button")!; b.onclick = () => { if (!S?.code) return toast("Сначала создайте лобби"); hub?.send(JSON.stringify({ type: "invite", to: o.sid, code: S.code })); };
    b.toggleAttribute("disabled", !S || S.phase !== "lobby" || !!S.seats[1]); box.appendChild(row);
  }
}
function showInvite(from: string, code: string, ttl: number) {
  const d = document.createElement("div"); d.className = "toast invite in";
  d.innerHTML = `${ic("flag")}<span><b></b> зовёт в партию <code></code></span><button class="btn sm gold">Принять</button><button class="xbtn sm" aria-label="Отклонить">${ic("close")}</button>`;
  d.querySelector("b")!.textContent = from; d.querySelector("code")!.textContent = code;
  const [yes, no] = d.querySelectorAll("button");
  (yes as HTMLButtonElement).onclick = () => { d.remove(); joinCode(code); };
  (no as HTMLButtonElement).onclick = () => d.remove();
  $("#toasts").appendChild(d); setTimeout(() => d.remove(), ttl * 1000);
}

// ---------- матч ----------
let selCell: [number, number] | null = null;
let ws: WebSocket | null = null, S: any = null, curCode = "", sel: number | null = null, retry = 0, left = false, demo = false;
async function createLobby() {
  const size = +($<HTMLInputElement>("#size").value), pub = $<HTMLInputElement>("#pub").checked;
  const r = await fetch(HTTP + "/strat/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ size, pub }) }).catch(() => null);
  const j: any = r ? await r.json().catch(() => ({})) : {};
  if (!j.code) return toast(ERR[j.err] || "Сервер недоступен", "bad");
  joinCode(j.code);
}
function joinCode(code: string) {
  code = code.trim().toUpperCase(); if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return toast("Код — 6 символов", "bad");
  curCode = code; left = false; const u = new URL(location.href); u.searchParams.set("join", code); history.replaceState(null, "", u);
  openMatch();
}
function openMatch() {
  ws?.close(); ws = new WebSocket(WS + "/strat/m/" + curCode);
  ws.onopen = async () => { retry = 0; ws!.send(JSON.stringify({ type: "hello", ...(await helloMsg()) })); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "chat" || m.type === "chat_err") chatRecv(m);
    if (m.type === "st") { const prev = S; S = m; S.skew = Date.now() - m.now; onState(prev); }
    if (m.type === "err") toast(ERR[m.err] || m.err, "bad");
    if (m.type === "left") { left = true; S = null; curCode = ""; resetMatchUi(); const u = new URL(location.href); u.searchParams.delete("join"); history.replaceState(null, "", u); render(); }
  };
  ws.onclose = (e) => {
    if (left || !curCode) return;
    if (e.code === 1006 && !S && retry > 1) { toast("Лобби не найдено или закрыто", "bad"); curCode = ""; render(); return; }
    setStatus("Связь потеряна, переподключение…"); setTimeout(openMatch, Math.min(8000, 800 * 2 ** retry++));
  };
}
const send = (o: any) => { if (demo) return toast("Демо-доска: ходы не отправляются"); ws?.readyState === 1 && ws.send(JSON.stringify(o)); };
function setStatus(t: string) { for (const id of ["#status", "#lstatus"]) { const el = $(id); if (el) el.textContent = t; } }

// ---------- снимок → GameState ----------
let gsCache: { s: any; g: GameState | null } = { s: null, g: null };
function gs(): GameState | null {
  if (!S?.g) return null; if (gsCache.s === S.g) return gsCache.g; const g = S.g;
  const G = { ...g, nextId: 0, lastEv: [], pieces: g.pieces.map((p: any) => ({ id: p.id, owner: p.o, kind: p.k, x: p.x, y: p.y, hp: p.hp, maxHp: p.mh, atk: p.atk, arm: p.arm, acted: !!p.a, burn: p.b, chill: p.c, xp: p.xp, tal: p.tl, mv: !!p.mv, cm: p.cm, lv: p.lv, sk: p.sk })) };
  gsCache = { s: S.g, g: G }; return G;
}
const raceBase = (side: number) => (RACE_COL[S?.g?.races?.[side] ?? S?.seats?.[side]?.race] || [GOLD])[0];
const raceCol = (side: number) => playerCol(S, side, raceBase);
function ectx(): Ctx { return { S, G: gs()!, me: S.you, send, redraw: draw, toast, col: raceCol, refresh: () => { renderBar(ectx()); renderHint(); draw(); } } as any; }

// ---------- имена Вождей (только текст: textContent, никогда innerHTML) ----------
const NAMES = ["Ратибор", "Велеслава", "Огнеяр", "Мстислава", "Борислав", "Ярогнева", "Тихомир", "Всеслава", "Будимир", "Радомира", "Святогор", "Милонега", "Гордеслав", "Зорислава", "Добрыня", "Светозара"];
const rndName = () => NAMES[Math.floor(Math.random() * NAMES.length)];
const cleanName = (s: string) => s.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
const nameKey = () => "strat.chief." + (S?.code || "demo");
function localNames(): string[] { try { return JSON.parse(localStorage.getItem(nameKey()) || "[]"); } catch { return []; } }
/** Имя Вождя стороны: с сервера (если пришло), иначе своё локальное (последнее поколение), иначе «Вождь». */
function chiefName(side: number): string {
  const srv = S?.chiefNames?.[side] ?? S?.g?.chief?.[side]?.name ?? S?.g?.ec?.chief?.[side]?.name;
  if (typeof srv === "string" && srv) return cleanName(srv);
  if (side === S?.you) { const l = localNames(); if (l.length) return l[l.length - 1]; }
  return "Вождь";
}
let nameDlgOpen = false;
function askChiefName(reborn: boolean) {
  if (nameDlgOpen || !S || S.you < 0) return; nameDlgOpen = true;
  const m = modal({ title: reborn ? "Родился новый Вождь" : "Как назовём вашего Вождя?", icon: "crown", cls: "small namedlg", dismiss: true,
    sub: reborn ? "Прежний Вождь пал. Новый начинает с 1-го уровня — опыт и навыки заново." : "Это только имя Вождя — на правила оно не влияет. Партия уже идёт, можно ответить позже.",
    body: `<label class="fld"><span>Имя Вождя</span><div class="namerow"><input id="chiefname" maxlength="20" autocomplete="off" spellcheck="false"><button class="btn sq" id="namedice" type="button" data-tip="Случайное имя">${ic("dice")}</button></div></label>`,
    acts: [{ label: "Позже", cls: "ghost", val: false }, { label: "Назвать", cls: "gold", val: true, id: "dlg-ok", icon: "check" }] } as any);
  const inp = m.el.querySelector<HTMLInputElement>("#chiefname")!; inp.value = rndName();
  m.el.querySelector<HTMLButtonElement>("#namedice")!.onclick = () => { inp.value = rndName(); inp.focus(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") m.close(true); };
  setTimeout(() => { inp.focus(); inp.select(); }, 60);
  const auto = inp.value;
  m.done.then((ok: any) => { nameDlgOpen = false; const v = cleanName(ok ? inp.value : "") || auto; // пропуск — авто-имя
    const l = localNames(); l.push(v); localStorage.setItem(nameKey(), JSON.stringify(l.slice(-8)));
    if (S?.chiefNames !== undefined) send({ type: "chief_name", name: v }); // сервер с поддержкой имён присылает chiefNames
    logAdd(reborn ? "Новый Вождь: " + v : "Ваш Вождь: " + v, "me"); renderHud(); });
}

// ---------- журнал (только textContent) ----------
function logAdd(t: string, cls = "") {
  const box = $("#log"); if (!box) return; const d = document.createElement("div"); d.className = "lg " + cls; d.textContent = t; box.prepend(d);
  while (box.children.length > 30) box.lastElementChild!.remove();
}

// ---------- события снимка ----------
let fx: { x: number; y: number; t: number; txt: string; col: string; big?: boolean }[] = [];
const poses = new Map<number, { pose: Pose; until: number }>();
const tweens = new Map<number, { fx: number; fy: number; t: number }>();
let ghosts: { p: any; race: string; t: number }[] = [], bursts: { x: number; y: number; race: string; t: number }[] = [];
const POSE_MS = 420, DEATH_MS = 750, FX_MS = 480, MOVE_MS = 280, NUM_MS = 1200;
const sticky: Set<string>[] = Array.from({ length: 8 }, () => new Set<string>()); const lastHit = new Map<number, number>(); // цели, отмеченные навсегда («Пал Вождь врага» — только первый)
let prevGoals: Goal[][] | null = null, prevChief: { alive: boolean; pend: number } | null = null, endShown = false, introShown = false;
const crest = (r: string) => `<img class="crestimg" src="/strat/ui/crests/crest_${r}.png" alt="">`;
function resetMatchUi() { resetUlt(); chatReset(); ultAim = null; aimCell = null; sticky.forEach((x) => x.clear()); lastHit.clear(); resetFell(); prevGoals = null; prevChief = null; endShown = false; introShown = false; cam.n = 0; document.getElementById("endscreen")?.remove(); const lg = $("#log"); if (lg) lg.innerHTML = ""; }
function onState(prev: any) {
  if (S.code !== prev?.code) resetMatchUi();
  if (S.phase !== "play") sel = null;
  if (S.g && prev?.g && S.g.cur !== prev.g.cur) sel = null;
  const now = performance.now(), g = S.g, me = S.you;
  if (g && prev?.g) for (const p of g.pieces) { const q = prev.g.pieces.find((z: any) => z.id === p.id); if (q && (q.x !== p.x || q.y !== p.y)) tweens.set(p.id, { fx: q.x, fy: q.y, t: now }); }
  for (const e of S.ev || []) {
    if (!g) break;
    { const u = parseUlt(e, g, now); if (u) { addCast(u, g.turn); ultBanner(u, u.side === me, S.seats[u.side]?.nick || ""); draw(); } }
    if (e.e === "timeout" || e.e === "skip") toast(e.side === me ? "Ход пропущен — время вышло" : `${S.seats[e.side]?.nick || "Соперник"}: ход пропущен — время вышло`, e.side === me ? "bad" : "info", "clock");
    if (e.e === "hit") {
      poses.set(e.id, { pose: "attack", until: now + POSE_MS });
      const t = g.pieces.find((q: any) => q.id === e.t) || prev?.g?.pieces.find((q: any) => q.id === e.t);
      if (t) { poses.set(e.t, { pose: "hit", until: now + POSE_MS }); const a = g.pieces.find((q: any) => q.id === e.id) || prev?.g?.pieces.find((q: any) => q.id === e.id); bursts.push({ x: t.x, y: t.y, race: a ? g.races[a.o] : "", t: now }); if (a) lastHit.set(e.t, a.o); if (a) { faceAt(e.id, t.x, t.y); faceAt(e.t, a.x, a.y); }
        fx.push({ x: t.x, y: t.y, t: now, txt: "−" + e.dmg, col: e.burn ? "#ff9d3d" : e.chill ? "#9fe0ff" : "#ff5040", big: true }); }
    }
    if (e.e === "kill") { const d = prev?.g?.pieces.find((q: any) => q.id === e.id); if (d) { ghosts.push({ p: d, race: g.races[d.o], t: now });
      if (d.k === "king") { if (!localFell[d.o]) localFell[d.o] = { turn: g.turn, by: typeof e.by === "number" ? e.by : lastHit.get(e.id), name: chiefName(d.o) }; logAdd((d.o === me ? "Пал ваш Вождь " : "Пал вражеский Вождь ") + chiefName(d.o), d.o === me ? "bad" : "good"); }
      else logAdd((d.o === me ? "Потеря: " : "Сражён: ") + KIND_NAME[d.k as Kind], d.o === me ? "bad" : ""); } }
    const p = g.pieces.find((q: any) => q.id === (e.t ?? e.id));
    if (e.e === "burn" && p) fx.push({ x: p.x, y: p.y, t: now, txt: "−" + e.dmg, col: "#ff9d3d", big: true });
    const ef = econFx(e); if (ef) { const c = e.city != null ? g.ec?.cities.find((q: any) => q.id === e.city) : null, at = c || p || (e.x != null ? e : null);
      if (at) fx.push({ x: at.x, y: at.y, t: now, txt: ef.txt, col: ef.col }); }
    if (e.e === "build") { const c = g.ec?.cities.find((q: any) => q.id === e.city); if (c) e.side = c.owner; }
    const tt = econToast(e, me, gs()!); if (tt) { toast(tt[0], tt[1], tt[2]); logAdd(tt[0], tt[1] === "bad" ? "bad" : tt[1] === "good" ? "good" : ""); }
    if (e.e === "capture" && e.cap) sticky[e.by]?.add("capital");
    if (e.e === "promote" && p) fx.push({ x: p.x, y: p.y, t: now, txt: KIND_NAME[e.kind as Kind], col: "#f3d27a" });
  }
  if (S.phase === "play" && g) {
    const started = prev?.phase !== "play" || prev?.code !== S.code;
    if (started && !introShown) { introShown = true; banner("Партия началась", `${RACE_NAME[g.races[0]]} против ${RACE_NAME[g.races[1]]}`, "start");
      if (me >= 0 && !localNames().length && !S.chiefNames?.[me]) setTimeout(() => askChiefName(false), 1500); }
    else if (prev?.g && prev.g.cur !== g.cur) { if (g.cur === me) { banner("Ваш ход", `Ход ${g.turn} · ${g.ap} ОД`, "mine"); toast("Ваш ход", "turn", "crown"); } else banner("Ход соперника", S.seats[g.cur]?.nick || "", "theirs"); }
  }
  if (g && S.phase !== "lobby") {
    const G = gs()!, cfg = cfgOf(S), gl = goalsWithSticky(G, cfg);
    if (prevGoals) for (const side of [0, 1]) gl.sides[side].forEach((q, i) => { if (q.done && !prevGoals![side][i].done) goalPopup(side, q, gl.sides[side].filter((z) => z.done).length, gl.need); });
    prevGoals = gl.sides.map((s) => s.map((q) => ({ ...q })));
    if (me >= 0) { const ch = chiefOf(S, G, me, cfg), alive = !!ch.p;
      if (prevChief && !prevChief.alive && alive && S.phase === "play") setTimeout(() => askChiefName(true), 400);
      if (alive && ch.pend && prevChief && ch.pend > prevChief.pend && g.cur === me && S.phase === "play") setTimeout(() => openChiefTree(true), 500);
      prevChief = { alive, pend: ch.pend }; }
  }
  if (S.phase === "over" && !endShown && g) { endShown = true; setTimeout(showEnd, prev?.phase === "play" ? 900 : 0); }
  if (S.phase !== "over") { endShown = false; document.getElementById("endscreen")?.remove(); }
  render();
}
function goalsWithSticky(G: GameState, cfg: any) {
  const gl = goalsOf(S, G, cfg);
  gl.sides.forEach((s, side) => s.forEach((q) => { if (sticky[side].has(q.id)) { q.done = true; q.v = q.max; } if (q.done) sticky[side].add(q.id); }));
  return gl;
}
function goalPopup(side: number, q: Goal, count: number, need: number) {
  const d = GOALS.find((x) => x.id === q.id)!, mine = side === S.you;
  logAdd((mine ? "Цель выполнена: " : "Соперник выполнил цель: ") + d.name + ` (${count}/${need})`, mine ? "good" : "bad");
  if (!mine) { toast(`Соперник: «${d.name}» — ${count} из ${need}`, "bad", d.icon); return; }
  const m = modal({ title: "Цель выполнена!", icon: d.icon, cls: "small goalpop", sub: `${count} из ${need} целей для победы`,
    body: `<div class="gp-medal"><img class="gp-sun" src="/strat/ui/ornaments/ornament_sunburst.png" alt="">${ic(d.icon)}</div><p class="gp-name"></p><div class="gp-pips">${Array.from({ length: need }, (_, i) => `<i class="${i < count ? "on" : ""}"></i>`).join("")}</div>`,
    acts: [{ label: "Дальше", cls: "gold", val: true }] });
  m.el.querySelector(".gp-name")!.textContent = d.name; setTimeout(() => m.close(true), 4200);
}

// ---------- экран конца партии ----------
function showEnd() {
  if (!S?.g || S.phase !== "over") return; const me = S.you, w = S.result?.winner, g = S.g;
  const win = me >= 0 && w === me, draw_ = w === 2 || w == null, title = draw_ ? "Ничья" : me < 0 ? `Победил ${S.seats[w]?.nick || "?"}` : win ? "Победа" : "Поражение";
  const race = g.races[draw_ ? Math.max(0, me) : w] || "fire", G = gs()!, cfg = cfgOf(S), gl = goalsWithSticky(G, cfg);
  const stat = (i: number) => `<div class="es-side ${i === me ? "me" : ""}">${crest(g.races[i])}
    <b class="nick"></b><small class="cname"></small><div class="es-goals">${gl.sides[i].map((q) => { const d = GOALS.find((z) => z.id === q.id)!; return `<i class="${q.done ? "on" : ""}" data-tip="${esc(d.name)}">${ic(d.icon)}</i>`; }).join("")}</div>
    <span class="es-n">${ic("glory")}${g.ec?.res?.[i]?.glory ?? 0} · ${ic("sword")}${g.pieces.filter((p: any) => p.o === i).length}</span></div>`;
  const m = modal({ id: "endscreen", title, icon: win ? "crown" : draw_ ? "scales" : "skull", cls: "endscreen " + (win || me < 0 ? "win" : draw_ ? "draw" : "lose"), dismiss: true,
    sub: esc(REASON[S.result?.reason] || S.result?.reason || ""),
    body: `<div class="es-hero"><img src="${unitArt(race, "king")}" alt="" onerror="this.remove()"></div>
      <p class="es-chief"></p><div class="es-sides">${stat(0)}<span class="vs">VS</span>${stat(1)}</div>
      <div class="es-foot"><div class="es-score" data-tip="Выполнено целей"><small>Цели</small><b>${gl.sides[Math.max(0, me)].filter((q) => q.done).length}–${gl.sides[me === 1 ? 0 : 1].filter((q) => q.done).length}</b></div>${me >= 0 ? ratingDelta(S.result?.rating?.[me]) : ""}${S.ranked ? "" : `<small class="muted">Партия без рейтинга</small>`}</div>`,
    acts: [{ label: "В меню", cls: "ghost", val: "menu", icon: "back" }, { label: "К доске", cls: "", val: "board", icon: "eye" }, ...(me >= 0 ? [{ label: S.seats[me]?.rematch ? "Ждём соперника…" : "Реванш", cls: "gold", val: "rematch", icon: "refresh", id: "es-rematch" }] : [])] });
  m.el.querySelectorAll<HTMLElement>(".es-side").forEach((el, i) => { el.querySelector(".nick")!.textContent = S.seats[i]?.nick || "?"; el.querySelector(".cname")!.textContent = "Вождь " + chiefName(i); });
  m.el.querySelector(".es-chief")!.textContent = draw_ ? "" : `Вождь ${chiefName(w)} ведёт ${RACE_NAME[g.races[w]] || ""} к победе`;
  m.done.then((v: any) => { if (v === "rematch") send({ type: "rematch" }); if (v === "menu") leaveMatch(); });
}
/** «Чёрный список»: первые Вожди соперников стороны side. */
function openBlacklist(side: number) {
  if (!S?.g) return; const g = S.g, rows = blacklistOf(S, g, side), mine = side === S.you, nm = (i: number) => S.seats[i]?.nick || "?";
  const m = modal({ id: "blacklist", title: "Чёрный список", icon: "skull", cls: "blacklist", sub: `${mine ? "Ваши цели" : "Цели: " + esc(nm(side))} · ${rows.filter((r) => r.dead).length}/${rows.length}`,
    body: `<div class="bl-list">${rows.map((r) => `<div class="bl-row ${r.dead ? "dead" : "alive"}" style="--pc:${raceCol(r.side)}"><span class="bl-port"><img src="${unitArt(g.races[r.side], "king")}" alt="" onerror="this.remove()"></span>
      <span class="bl-crest">${crest(g.races[r.side])}</span><div class="bl-b"><b class="bl-name"></b><small class="bl-who"></small><span class="bl-st"></span></div>${r.dead ? `<span class="bl-x" aria-hidden="true"></span>` : `<span class="bl-tag">${ic("eye")}В строю</span>`}</div>`).join("")}</div>
      <p class="bl-note">${ic("warn")}<span>В счёт идёт только <b>первый</b> Вождь каждого соперника. Вожди, возрождённые после гибели, в список не попадают.${modeOf(S) === "2v2" ? " Счёт общий у команды: убить может любой союзник." : ""}</span></p>` });
  m.el.querySelectorAll<HTMLElement>(".bl-row").forEach((el, k) => { const r = rows[k];
    { const cn = r.name || chiefName(r.side); el.querySelector(".bl-name")!.textContent = /^вожд/i.test(cn) ? cn : "Вождь " + cn; } el.querySelector(".bl-who")!.textContent = `${nm(r.side)} · ${RACE_NAME[g.races[r.side]] || ""}`;
    el.querySelector(".bl-st")!.textContent = r.dead ? `пал на ${r.turn ?? "?"}-м ходу${r.by === S.you && !r.byNick ? " — сражён вами" : r.by != null || r.byNick ? ", убил " + (r.byNick || nm(r.by!)) : ""}` : "жив — главная цель"; });
}
async function leaveMatch() {
  if (demo) { demo = false; S = null; render(); return; }
  if (S?.phase === "play" && S.you >= 0 && !(await confirmDlg("Выйти из партии?", "Выход во время партии засчитается как сдача.", "Выйти", { danger: true, icon: "back" }))) return;
  send({ type: "leave" });
}

// ---------- экраны ----------
function render() {
  const inMatch = !!S;
  document.body.dataset.screen = !S ? "home" : S.phase === "lobby" ? "lobby" : "game";
  $("#home").hidden = inMatch; $("#match").hidden = !inMatch; if (!inMatch) renderResume();
  renderOnline(); mountAdmin();
  if (!S) return;
  const me = S.you;
  document.body.dataset.race = (S.g?.races?.[Math.max(0, me)] || S.seats?.[Math.max(0, me)]?.race || "");
  $("#code").textContent = S.code || "ДЕМО";
  $("#lobby").hidden = S.phase !== "lobby"; $("#play").hidden = S.phase === "lobby";
  for (const id of ["#mapbadge", "#mapbadge2"]) { const b = $(id); if (b) b.hidden = !(S.mapInfo && S.mapInfo.xp === false); }
  if (S.phase === "lobby") { renderLobby(); return; }
  renderHud(); renderBar(ectx()); renderInfo(); renderHint();
  requestAnimationFrame(() => { fitCam(false); draw(); });
}

// ---------- лобби ----------
function seatHtml(i: number) {
  const s = S.seats[i], me = S.you;
  if (!s) return `<div class="seatcard empty"><span class="crest unk">${ic("user")}</span><div><b>Ждём соперника…</b><small>Отправьте код или ссылку</small></div></div>`;
  const race = s.race ? crest(s.race) : `<span class="crest unk">${ic(s.picked ? "check" : "user")}</span>`;
  return `<div class="seatcard ${i === me ? "me" : ""} ${s.ready ? "ready" : ""}">${race}<div><b class="nick"></b><small>${s.bot ? "бот" : s.guest ? "гость" : "игрок"}${i === 0 ? " · хост" : ""}${s.race ? " · " + RACE_NAME[s.race] : s.picked ? " · раса выбрана" : ""}</small>${isAway(s) ? `<span class="away">${ic("warn")}Игрок не за столом</span>` : ""}</div>
    <span class="rdy">${s.ready ? ic("check") + "Готов" : "Не готов"}</span></div>`;
}
/** Только числа и особые свойства — никаких подсказок «для какой тактики» раса. */
function raceTraits(r: string): string[] {
  const c: any = (cfgOf(S).race as any)[r] || {}, t: string[] = [];
  if (c.hpMul && c.hpMul !== 1) t.push(`Здоровье фигур ×${c.hpMul}`);
  if (c.atk) t.push(`Атака ${c.atk > 0 ? "+" : ""}${c.atk}`); if (c.arm) t.push(`Броня ${c.arm > 0 ? "+" : ""}${c.arm} всем`); if (c.rookAtk) t.push(`Страж: атака ${c.rookAtk > 0 ? "+" : ""}${c.rookAtk}`);
  if (c.burnTurns) t.push(`Поджог: −${c.burnDmg} HP, ${c.burnTurns} хода`); if (c.chillTurns) t.push(`Обморожение: цель ходит на ${c.chillMove}`); if (c.knowPen) t.push(`Знания −${c.knowPen} за ход`);
  if (r === "water") t.push("Проходит по воде"); if (r === "stone") t.push("Проходит через горы");
  return t.length ? t.slice(0, 3) : ["Без особых свойств"];
}
const sizeLabel = (n: number) => (n <= 5 ? "дуэль" : n <= 8 ? "быстрая" : n <= 15 ? "большая" : n <= 50 ? "кампания" : "эпос");
function renderLobby() {
  const me = S.you, host = me === 0, seats = S.seats;
  renderSlots($("#slots"), $("#modes"), S, { me, host, seatHtml, send, raceCol: raceBase });
  const rc = $("#races");
  if (!rc.dataset.built) { rc.dataset.built = "1"; rc.innerHTML = RACES.map((r) => `<button class="racecard r-${r}" data-race="${r}">
      <span class="rc-art"><img class="cr" src="/strat/ui/crests/crest_${r}.png" alt=""><img class="k" src="${unitArt(r, "king")}" alt="" onerror="this.remove()"><img class="a" src="${unitArt(r, "knight")}" alt="" onerror="this.remove()"><img class="b" src="${unitArt(r, "mage")}" alt="" onerror="this.remove()"></span>
      <span class="rc-name"><b>${RACE_NAME[r]}</b></span><ul class="rc-tr"></ul><span class="rc-pas pas-row">${racePassives(cfgOf(S), r).map(pasIcon).join("")}</span><span class="rc-pick">${ic("check")}Выбрано</span></button>`).join("");
    for (const b of rc.querySelectorAll<HTMLButtonElement>("[data-race]")) b.onclick = () => send({ type: "race", race: b.dataset.race }); }
  for (const b of rc.querySelectorAll<HTMLButtonElement>("[data-race]")) { b.classList.toggle("on", seats[me]?.race === b.dataset.race); b.disabled = me < 0;
    const ul = b.querySelector(".rc-tr")!, tr = raceTraits(b.dataset.race!); if (ul.textContent !== tr.join("")) { ul.innerHTML = ""; for (const t of tr) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); } } }
  // тип Вождя — только если у расы их больше одного
  const myRace = seats[me]?.race, types = myRace ? chiefTypes(cfgOf(S), myRace) : [], cp = $("#chiefpick");
  cp.hidden = types.length < 2;
  if (types.length > 1) { const cur = S.seats[me]?.chief || types[0].id;
    cp.innerHTML = `<h4 class="deco-h">${ic("crown")}<span>Тип Вождя</span></h4><div class="cp-row">${types.map((t) => `<button class="btn ${t.id === cur ? "gold" : ""}" data-chief="${esc(t.id)}"><span>${esc(t.name)}</span></button>`).join("")}</div>`;
    for (const b of cp.querySelectorAll<HTMLButtonElement>("[data-chief]")) b.onclick = () => send({ type: "chief", chief: b.dataset.chief }); }
  const st = $("#sizes"); if (!st.dataset.built) { st.dataset.built = "1"; st.innerHTML = SIZES.map((n) => `<button class="sizetile" data-size="${n}"><b>${n}×${n}</b><small>${sizeLabel(n)}</small></button>`).join("");
    for (const b of st.querySelectorAll<HTMLButtonElement>("[data-size]")) b.onclick = () => send({ type: "cfg", size: +b.dataset.size! }); }
  for (const b of st.querySelectorAll<HTMLButtonElement>("[data-size]")) { b.classList.toggle("on", +b.dataset.size! === S.size); b.disabled = !host; }
  const cs = $<HTMLInputElement>("#csize"); cs.disabled = !host; if (document.activeElement !== cs) cs.value = String(S.size);
  const sc: any = (STRAT_CFG.sizes as any)[S.size] || {}, tl = S.turnLimit ?? sc.turnLimit;
  const sel_ = $<HTMLSelectElement>("#tl"); sel_.disabled = !host;
  (sel_.options[0] as HTMLOptionElement).textContent = sc.turnLimit ? `по умолчанию (${sc.turnLimit})` : "по умолчанию";
  const want = S.turnLimit == null ? "" : String(S.turnLimit); sel_.value = want;
  if (sel_.value !== want) { const o = document.createElement("option"); o.value = o.textContent = want; sel_.appendChild(o); sel_.value = want; }
  const ts = $<HTMLSelectElement>("#tsec"); ts.disabled = !host; (ts.options[0] as HTMLOptionElement).textContent = `по размеру карты (${fmtMin(turnSecFor(S.size))})`;
  { const w = S.turnSec == null ? "" : String(S.turnSec); ts.value = w; if (ts.value !== w) { const o = document.createElement("option"); o.value = w; o.textContent = fmtMin(+w); ts.appendChild(o); ts.value = w; } }
  const tsec = S.turnSec ?? turnSecFor(S.size);
  $("#sizeinfo").innerHTML = [sc.ap ? `${ic("ap")}<b>${sc.ap}</b> ОД за ход` : "", `${ic("clock")}<b>${fmtMin(tsec)}</b> на ход`, sc.reserveSec ? `+ запас <b>${sc.reserveSec / 60}</b> мин` : "", tl ? `лимит <b>${tl}</b> ходов` : "без лимита ходов"].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
  const bot = $<HTMLButtonElement>("#bot"); bot.hidden = true; void host; bot.querySelector("span")!.textContent = seats[1]?.bot ? "Убрать бота" : "Играть с ботом"; bot.disabled = !!seats[1] && !seats[1].bot;
  renderLobbyMap(host);
  { const rk = $<HTMLInputElement>("#ranked"); rk.checked = !!S.ranked; rk.disabled = !host; const lg = $("#league"); lg.innerHTML = `${ic(LEAGUES.find((l) => l.id === leagueOf(S.size))!.icon)}<span>Лига: <b>${leagueName(S.size)}</b></span>${S.ranked ? `<em>рейтинговая</em>` : ""}`;
    const lock = !!S.ranked; for (const id of ["#csize", "#tl", "#tsec"]) { const el = $<HTMLInputElement>(id); el.disabled = !host || lock; el.closest(".fld")?.classList.toggle("locked", lock); }
    $("#hostpanel").classList.toggle("ranked", lock); for (const b of $("#maps").querySelectorAll<HTMLButtonElement>("[data-map]")) if (lock && b.dataset.map !== "") b.disabled = true; }
  const rd = $<HTMLButtonElement>("#ready"); rd.querySelector("span")!.textContent = seats[me]?.ready ? "Не готов" : "Готов к бою"; rd.classList.toggle("on", !!seats[me]?.ready);
  rd.disabled = me < 0 || !seats[me]?.race;
  $("#hostpanel").classList.toggle("ro", !host);
  setStatus(me < 0 ? "Лобби заполнено — вы зритель" : !seats[1] ? "Отправьте ссылку или код сопернику" : !seats[me]?.race ? "Выберите расу — соперник увидит её только на старте" : seats[me]?.ready ? "Ждём готовности соперника" : "Нажмите «Готов к бою»");
}
let mapListSize = 0, mapList: any[] = [];
const ST_NAME: Record<string, string> = { pending: "на проверке", rejected: "отклонена", hidden: "скрыта" };
async function renderLobbyMap(host: boolean) {
  const gal = $("#maps");
  if (mapListSize !== S.size) {
    mapListSize = S.size; gal.innerHTML = `<div class="empty">Загрузка карт…</div>`;
    const r = await hubReq("map_list", { size: S.size }); if (r.err) { mapListSize = 0; if (r.err === "offline") setTimeout(render, 700); return; } mapList = r.list || [];
    gal.innerHTML = "";
    for (const m of mapList) {
      const b = document.createElement("button"); b.className = "mapcard"; b.dataset.map = m.id;
      b.innerHTML = `<span class="mc-pv"></span><b></b><small></small>`;
      b.querySelector("b")!.textContent = m.name; b.querySelector("small")!.textContent = [`${S.size}×${S.size}`, m.author || (m.kind === "official" ? "официальная" : m.kind === "random" ? "новая каждый раз" : ""), m.kind === "mine" ? "моя" : "", ST_NAME[m.status] || ""].filter(Boolean).join(" · ");
      const pv = b.querySelector<HTMLElement>(".mc-pv")!;
      if (m.t && m.s) { const c = document.createElement("canvas"), w = 192; c.width = c.height = w; c.getContext("2d")!.drawImage(terrainLayer({ id: m.id, name: m.name, size: m.size || S.size, t: m.t, s: m.s } as any, w, false, [GOLD, "#b3261e"]), 0, 0); pv.appendChild(c); }
      else pv.innerHTML = ic(m.kind === "random" ? "dice" : "map");
      b.onclick = () => send({ type: "cfg", map: m.id }); gal.appendChild(b);
    }
  }
  const cur = S.mapInfo?.id || "", want = cur.startsWith("rnd:") ? "rnd" : cur;
  for (const b of gal.querySelectorAll<HTMLButtonElement>("[data-map]")) { b.classList.toggle("on", b.dataset.map === want); b.disabled = !host;
    if (b.dataset.map === want && S.lobbyMap && !b.querySelector("canvas")) { const c = document.createElement("canvas"); c.width = c.height = 192; c.getContext("2d")!.drawImage(terrainLayer(S.lobbyMap, 192, false, [GOLD, "#b3261e"]), 0, 0); const pv = b.querySelector(".mc-pv")!; pv.innerHTML = ""; pv.appendChild(c); } }
  const pv = $<HTMLCanvasElement>("#mappv"), m: MapData | undefined = S.lobbyMap;
  if (m) { const d = devicePixelRatio || 1, w = Math.min(300, pv.parentElement!.clientWidth || 300); pv.style.width = pv.style.height = w + "px"; pv.width = pv.height = Math.round(w * d);
    pv.getContext("2d")!.drawImage(terrainLayer(m, Math.min(pv.width, 2048), S.you === 1, [GOLD, "#b3261e"]), 0, 0, pv.width, pv.height); }
  $("#mapname0").textContent = (S.mapInfo?.name || m?.name || "Карта") + ` · ${S.size}×${S.size}`;
  const chips = $("#mapdesc"); chips.innerHTML = "";
  if (m) { const cnt: Record<string, number> = {}; for (const c of m.s) if (c !== ".") cnt[c] = (cnt[c] || 0) + 1;
    for (const [c, n] of Object.entries(cnt)) { const sp = document.createElement("span"); sp.className = "schip"; sp.textContent = ((STRUCT as any)[c]?.name || c) + (n > 1 ? " ×" + n : ""); sp.dataset.tip = esc((STRUCT as any)[c]?.eff || ""); chips.appendChild(sp); } }
}

// ---------- модерация карт ----------
async function loadQueue() {
  const box = document.getElementById("modq"); if (!box || !isAdmin) return; box.textContent = "Загрузка…";
  const r = await hubReq("map_queue"); if (r.err) { box.textContent = ERR[r.err] || r.err; return; }
  box.innerHTML = r.list.length ? "" : '<div class="empty">Очередь пуста</div>';
  for (const q of r.list) {
    const row = document.createElement("div"); row.className = "modrow";
    const pv = document.createElement("canvas"); pv.width = pv.height = 150; pv.className = "framed sm";
    pv.getContext("2d")!.drawImage(terrainLayer({ id: q.id, name: q.name, size: q.size, t: q.t, s: q.s } as any, 150, false, [GOLD, "#b3261e"]), 0, 0);
    const info = document.createElement("div"); const ch = q.checks || { errors: [], warnings: [] };
    info.innerHTML = `<b class="nm"></b> <span class="muted">${q.size}×${q.size} · ${esc(q.status)}${q.flagged ? " · жалоб: " + q.flagged : ""}</span><div class="muted au"></div>
      <div class="${ch.errors.length ? "warn" : "ok"}">${ch.errors.length ? "ошибки: " + esc(ch.errors.join(", ")) : "проверки пройдены"}${ch.warnings.length ? " · предупреждения: " + esc(ch.warnings.join(", ")) : ""}</div>
      <div class="row"><button class="btn sm gold" data-a="approve"><span>Одобрить</span></button><button class="btn sm" data-a="reject"><span>Отклонить</span></button><button class="btn sm ghost" data-a="hide"><span>Скрыть</span></button>${q.flagged ? '<button class="btn sm ghost" data-a="clear_flag"><span>Снять жалобы</span></button>' : ""}</div>`;
    info.querySelector(".nm")!.textContent = q.name; info.querySelector(".au")!.textContent = "автор: " + (q.author_nick || q.author) + (q.flag_note ? " · жалоба: " + q.flag_note : "");
    for (const b of info.querySelectorAll<HTMLButtonElement>("[data-a]")) b.onclick = async () => {
      const act = b.dataset.a!; let reason: string | undefined;
      if (act === "reject") { reason = (await promptDlg("Отклонить карту", "Причина отказа (увидит автор)", "Отклонить")) || ""; if (!reason.trim()) return; }
      const x = await hubReq("map_mod", { id: q.id, act, reason }); toast(x.err ? ERR[x.err] || x.err : "Готово: " + x.status, x.err ? "bad" : "good"); loadQueue();
    };
    row.append(pv, info); box.appendChild(row);
  }
}

/** Панель модерации: в DOM только у админа (флаг из hello_ok, сервер проверяет роль по player_roles и каждую команду отдельно),
 *  и только в главном меню/лобби — внутри партии её нет вовсе. */
function mountAdmin() {
  const slot = document.getElementById("adminslot"), inGame = !!S && S.phase !== "lobby", want = isAdmin && !inGame;
  const cur = document.getElementById("admin");
  if (!want) { cur?.remove(); return; }
  if (cur || !slot) return;
  const tpl = document.getElementById("admintpl") as HTMLTemplateElement | null; if (!tpl) return;
  slot.appendChild(tpl.content.cloneNode(true)); const r = document.getElementById("modrefresh"); if (r) r.onclick = loadQueue; loadQueue();
}

// ---------- HUD ----------
const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
function racePas(side: number) { const g = S.g; return racePassives(cfgOf(S), g.races[side], gs(), side).map(pasIcon).join(""); }
function chiefSkillsOf(p: any): string[] { return (p?.sk || p?.tal || []) as string[]; }
function skillPassive(id: string, side: number): Passive | null {
  const cfg = cfgOf(S), types = chiefTypes(cfg, S.g.races[side]); for (const t of types) { const n = t.tree.find((x) => x.id === id); if (n) {
    const raw: any = ((cfg.talents as any).king || []).flat().find((x: any) => x.id === id); if (raw) return talentPassive(raw, "king");
    return { key: "chief." + id, name: n.name, icon: "xp", effs: Array.isArray((n as any).effects) ? (n as any).effects : [], note: n.eff }; } }
  return null;
}
function renderHud() {
  if (!S?.g) return; const g = S.g, me = S.you, myTurn = S.phase === "play" && g.cur === me, cfg = cfgOf(S), G = gs()!;
  $("#turnno").textContent = `${g.turn}${g.turnLimit ? " / " + g.turnLimit : ""}`;
  $("#appips").innerHTML = Array.from({ length: Math.max(g.apMax || 0, g.ap) }, (_, i) => `<i class="${i < g.ap ? "on" : ""}"></i>`).join("");
  $("#aptxt").textContent = `${g.ap}/${Math.max(g.apMax || 0, g.ap)}`;
  $("#turnbox").classList.toggle("mine", myTurn); $("#turnwho").textContent = S.phase === "over" ? "Партия окончена" : myTurn ? "Ваш ход" : me < 0 ? "Ходит " + (S.seats[g.cur]?.nick || "?") : "Ход соперника";
  const glP = goalsWithSticky(G, cfg);
  renderPlayers($("#score"), S, { me, col: raceCol, crest, raceName: RACE_NAME, glory: (i) => g.ec?.res?.[i]?.glory ?? 0, pas: racePas,
    goals: (i) => { const q = glP.sides?.[i]; return q ? { done: q.filter((x: any) => x.done).length, need: glP.need } : null; } });
  { const opp = S.seats.findIndex((s: any, i: number) => i !== me && !allies(S, me, i) && isAway(s) && (s.skips ?? s.missed ?? 0) >= 5); const cl = $("#claim");
    cl.hidden = !(me >= 0 && S.phase === "play" && opp >= 0); }
  renderLvDock(ectx(), $("#lvdock"), () => setTimeout(render, 0)); chatShow(me >= 0 && S.phase !== "lobby", modeOf(S) === "2v2");
  const gl = goalsWithSticky(G, cfg), gb = $("#goals");
  gb.innerHTML = `<div class="gl-h"><span>Цели</span><small>${gl.need} из 5 — победа</small></div>` + [me < 0 ? 0 : me, me < 0 ? 1 : 1 - me].map((side) => { const done = gl.sides[side].filter((q) => q.done).length;
    return `<div class="gl-row ${side === me ? "me" : ""}"><span class="gl-who">${me < 0 ? esc(S.seats[side]?.nick || "?") : side === me ? "Вы" : "Враг"}</span>${gl.sides[side].map((q) => { const d = GOALS.find((z) => z.id === q.id)!, pct = q.max ? Math.min(1, q.v / q.max) : 0;
      const tip = esc(`<b>${d.name}</b><br>${d.hint}${!q.done && q.max > 1 ? `<br>${q.v} / ${q.max}` : ""}${q.done ? "<br>Выполнено" : ""}`);
      if (q.id === "chief") return `<button type="button" class="goal bl ${q.done ? "done" : ""}" data-bl="${side}" style="--p:${q.done ? 1 : pct}" data-tip="${tip}" aria-label="Чёрный список">${ic(d.icon)}<em class="gprog">${q.v}/${q.max}</em></button>`;
      return `<span class="goal ${q.done ? "done" : ""}" style="--p:${q.done ? 1 : pct}" data-tip="${tip}">${ic(d.icon)}</span>`; }).join("")}<b class="gl-n">${done}/${gl.need}</b></div>`; }).join("");
  const cb = $("#chief");
  if (me < 0) { cb.hidden = true; } else { cb.hidden = false; const ch = chiefOf(S, G, me, cfg), race = g.races[me];
    if (!ch.p) { cb.className = "chief dead"; cb.innerHTML = `<span class="ch-port"><img src="${unitArt(race, "king")}" alt="" onerror="this.remove()">${ic("skull", "ch-skull")}</span>
        <div class="ch-b"><b>Вождь пал</b><small class="ch-rs">${ch.respawn ? `Новый Вождь через ${ch.respawn} ${plural(ch.respawn, "ход", "хода", "ходов")}` : "Ожидает возрождения"}</small><span class="ch-pen">${ic("apoff")}−1 ОД, пока нет Вождя</span></div>`; }
    else { cb.className = "chief" + (ch.pend ? " pend" : "") + (S.check?.[me] ? " danger" : ""); const pct = ch.next ? Math.min(100, ((ch.xp - ch.prev) / Math.max(1, ch.next - ch.prev)) * 100) : 100;
      const pas = chiefSkillsOf(G.pieces.find((q) => q.id === ch.p!.id)).map((id) => pasIcon(skillPassive(id, me))).join("");
      cb.innerHTML = `<span class="ch-port" data-tip="Переименовать Вождя"><img src="${unitArt(race, "king")}" alt="" onerror="this.remove()"><em class="ch-lv">${ch.lv}</em></span>
        <div class="ch-b"><b class="ch-name"></b><small>Ур. ${ch.lv} из ${ch.maxLv} · ${ic("heart")}${ch.p.hp}/${ch.p.maxHp}</small><div class="meter xp" data-tip="Опыт ${ch.xp}${ch.next ? " / " + ch.next : ""}"><i style="width:${pct}%"></i></div>${pas ? `<div class="pas-row">${pas}</div>` : ""}</div>
        <button class="btn sq ${ch.pend ? "gold pulse" : ""}" id="chieftree" data-tip="Навыки Вождя">${ic("xp")}</button>${chiefUltBtn(ch, me)}`;
      cb.querySelector(".ch-name")!.textContent = chiefName(me); cb.querySelector<HTMLButtonElement>("#chieftree")!.onclick = () => openChiefTree(false);
      const ub = cb.querySelector<HTMLButtonElement>("#chiefult"); if (ub) ub.onclick = () => startAim({ id: "ult", pid: ch.p!.id, r: ultRadius(cfg, race, false), race, chief: true });
      cb.querySelector<HTMLElement>(".ch-port")!.onclick = () => askChiefName(false); } }
  const end = $<HTMLButtonElement>("#end"); end.disabled = !myTurn; end.hidden = S.phase !== "play" || me < 0;
  $("#endsub").textContent = myTurn ? `осталось ${g.ap} ОД` : "";
  $<HTMLButtonElement>("#forfeit").hidden = S.phase !== "play" || me < 0;
  const rm = $<HTMLButtonElement>("#rematch"); rm.hidden = S.phase !== "over" || me < 0; rm.querySelector("span")!.textContent = S.seats[me]?.rematch ? "Ждём соперника…" : "Реванш";
  $("#mapname").textContent = S.mapInfo?.name ? `${S.mapInfo.name} · ${g.size}×${g.size}` : `${g.size}×${g.size}`;
  $("#checkwarn").hidden = !(S.phase === "play" && S.check?.[me]);
}

/** Древо навыков Вождя (как древо технологий, меньше). Уровни — строки, взаимоисключающие узлы через «или». */
function openChiefTree(auto: boolean) {
  if (!S?.g || S.you < 0) return; const me = S.you, cfg = cfgOf(S), G = gs()!, ch = chiefOf(S, G, me, cfg); if (!ch.p) return;
  const types = chiefTypes(cfg, G.races[me]), type = types.find((t) => t.id === S.seats[me]?.chief) || types[0];
  const srv: any = (G as any).ec?.chiefTree?.[me] ?? (S as any).chiefTree ?? null, tree: CNode[] = srv ? normTree(srv) : type?.tree || []; // урезанное древо с сервера — приоритет
  const have = chiefSkillsOf(G.pieces.find((q) => q.id === ch.p!.id)), points = Math.max(0, ch.lv - 1 - have.length), my = G.cur === me && S.phase === "play";
  const lvls = [...new Set([2, 3, 4, 5, ...tree.map((n) => n.lv)])].sort((a, b) => a - b);
  const body = `<div class="ctree">${lvls.map((l) => { const ns = tree.filter((n) => n.lv === l);
    return `<div class="ct-row ${l <= ch.lv ? "open" : ""}"><span class="ct-lv"><b>${l}</b><small>ур.</small></span><div class="ct-nodes">${ns.length ? ns.map((n, i) => { const s = chiefNodeState(n, tree, have, ch.lv, points), or = i && (n.excl.includes(ns[i - 1].id) || ns[i - 1].excl.includes(n.id)) ? '<span class="or"><i>или</i></span>' : "";
      const fv = fogView(s.st, n.req.every((r) => have.includes(r)), n.lv <= Math.max(2, ch.lv), !!(n as any).red), uv = unveilCls("c" + me, n.id, fv);
      if (fv !== "show") return or + fogNode(n.id, fv, "skill");
      const pk = regPassive(() => skillPassive(n.id, me), "chief." + n.id);
      return `${or}<button class="tnode ${s.st}${uv}" data-skill="${esc(n.id)}" data-pas="${esc(pk)}" ${!my || s.st !== "can" ? "aria-disabled=true" : ""}>
        <span class="tn-h">${ic(n.icon && /^[a-z]+$/.test(n.icon) ? n.icon : "xp")}<b>${esc(n.name)}</b>${s.st === "got" ? `<span class="stamp">${ic("check")}</span>` : s.st === "closed" ? `<span class="stamp x">${ic("close")}</span>` : ""}</span><small>${esc(n.eff)}</small>${s.why && s.st !== "got" ? `<em>${s.st === "closed" ? ic("close") : ic("lock")}${esc(s.why)}</em>` : ""}</button>`; }).join("") : `<span class="muted">Навыки этого уровня появятся позже</span>`}</div></div>`; }).join("")}</div>`;
  const m = modal({ id: "chiefdlg", title: `${type?.name || "Вождь"} · древо навыков`, icon: "crown", cls: "chiefdlg" + (auto ? " lvup" : ""),
    sub: (auto ? "Новый уровень! " : `Уровень ${ch.lv} из ${ch.maxLv}. `) + `Очков навыка: ${points}. Выбор навсегда закрывает соседний узел.`, body });
  const nm = document.createElement("p"); nm.className = "ct-name"; nm.textContent = "Вождь " + chiefName(me); m.el.querySelector(".dlg-h div")!.appendChild(nm);
  m.el.querySelectorAll<HTMLButtonElement>("[data-skill]").forEach((b) => (b.onclick = (e) => { if (b.getAttribute("aria-disabled")) return; e.stopPropagation(); const id = b.dataset.skill!;
    // сейчас сервер принимает выбор как талант Вождя; при появлении отдельного действия навыков (ТЗ §14) — «skill»
    send({ type: "act", act: (cfg as any).chiefs || (cfg as any).chiefTypes ? { a: "skill", id: ch.p!.id, s: id } : { a: "talent", id: ch.p!.id, t: id } }); m.close(true); }));
}

// ---------- карточка выбранного ----------
function renderInfo() {
  const box = $("#info"); const g = S?.g; const p = g && sel != null ? g.pieces.find((q: any) => q.id === sel) : null;
  const m: MapData | undefined = g?.map, at = p ? [p.x, p.y] : selCell;
  if (!p && !at) { box.className = "info idle"; box.innerHTML = `<div class="empty">${ic("target")}<span>Выберите фигуру: золото — ход, красное — атака. Пустая клетка — описание местности.</span></div>`; return; }
  let h = ""; const cfg = cfgOf(S);
  if (p) { const race = g.races[p.o], P = gs()!.pieces.find((q) => q.id === p.id)!, lv = pieceLv(ectx(), P);
    const nm = p.k === "king" ? "Вождь" : KIND_NAME[p.k as Kind];
    const pas = [...(P.tal || []).map((t) => { const raw = ((cfg.talents as any)[P.kind] || []).flat().find((x: any) => x.id === t); return raw ? pasIcon(talentPassive(raw, P.kind)) : ""; }), racePas(p.o)].join("");
    h += `<div class="uc-h"><span class="uc-port r-${race}"><img src="${unitArt(race, p.k)}" alt="" onerror="this.remove()"></span><div><b class="uc-name">${nm}</b><small class="uc-sub"></small>
        <div class="meter hp"><i style="width:${(p.hp / p.mh) * 100}%"></i><span>${p.hp} / ${p.mh}</span></div></div></div>
      <div class="uc-stats"><span data-tip="Атака с учётом бонусов">${ic("sword")}<b>${p.ea ?? p.atk}</b></span><span data-tip="Броня с учётом бонусов">${ic("shield")}<b>${p.er ?? p.arm}</b></span><span data-tip="Уровень">${ic("xp")}<b>${lv.lv}</b></span>${p.b ? `<span class="neg" data-tip="Горит ещё ${p.b} ${plural(p.b, "ход", "хода", "ходов")}">${ic("burn")}<b>${p.b}</b></span>` : ""}${p.c ? `<span class="cold" data-tip="Обморожен">${ic("chill")}</span>` : ""}${p.a ? `<span class="muted" data-tip="Уже действовал">${ic("check")}</span>` : ""}</div>
      ${lv.next ? `<div class="meter xp sm" data-tip="Опыт ${lv.xp} / ${lv.next}"><i style="width:${Math.min(100, ((lv.xp - lv.prev) / Math.max(1, lv.next - lv.prev)) * 100)}%"></i></div>` : ""}
      ${pas ? `<div class="pas-row">${pas}</div>` : ""}`;
    if (S.phase === "play" && p.k !== "king") { const a = pieceActs(ectx(), P); if (a) h += `<div class="uc-acts">${a}</div>`; h += abilityBar(ectx(), P, p); }
  }
  if (m && at) { const [x, y] = at, t = m.t[y * m.size + x], st = m.s[y * m.size + x], tn = (TERRAIN as any)[t]?.name || t;
    const tp = terrainPassive(t, tn), sp = st !== "." ? structPassive(st, (STRUCT as any)[st]) : null;
    h += `<div class="cellinfo"><span class="ci-t">${ic(t === "f" ? "leaf" : t === "w" ? "wave" : t === "m" ? "mountain" : t === "#" ? "wall" : "map")}<b>${esc(tn)}</b>${pasIcon(tp)}</span>${terrEff(t) ? `<small>${terrEff(t)}</small>` : ""}
      ${sp ? `<span class="ci-t">${ic("castle")}<b>${esc(sp.name)}</b>${pasIcon(sp)}</span><small>${esc((STRUCT as any)[st]?.eff || "")}</small>` : ""}</div>`; }
  box.className = "info"; box.innerHTML = h;
  if (p) { const sub = box.querySelector(".uc-sub"); if (sub) sub.textContent = (p.o === S.you ? "Ваш" : "Враг") + (p.k === "king" ? " · " + chiefName(p.o) : " · " + (RACE_NAME[g.races[p.o]] || ""));
    const P = gs()!.pieces.find((q) => q.id === p.id)!; bindPieceActs(ectx(), P, box);
    bindAbilityBar(ectx(), P, p, box, (a) => startAim({ id: a.id, pid: a.pid, r: a.r, race: g.races[p.o], chief: false })); }
}
const terrEff = (t: string) => (t === "f" ? `скольжение останавливается` : t === "g" ? `проход в стене` : t === "w" ? "не пройти (кроме расы Воды); стрелять через воду можно" : t === "m" ? "не пройти (кроме расы Камня); закрывает обстрел" : t === "#" ? "не пройти, закрывает обстрел" : t === "b" ? "переправа через реку" : "");
function renderHint() {
  const h = $("#hint"); if (!h) return;
  if (eui.recruit) { h.hidden = false; h.innerHTML = `${ic("recruit")}<span>Найм: ${KIND_NAME[eui.recruit.kind]} — выберите подсвеченную клетку</span><button class="btn sm ghost" id="hintx">${ic("close")}<span>Отмена</span></button>`;
    $("#hintx").onclick = () => { eui.recruit = null; renderHint(); draw(); }; return; }
  h.hidden = true;
}

/** Кнопка ульты Вождя: только с 5-го уровня (до этого не существует в интерфейсе), с кольцом перезарядки. */
function chiefUltBtn(ch: any, me: number): string {
  if ((ch.lv || 0) < 5 || !ch.p) return ""; const d = ULT[S.g.races[me]]; if (!d) return "";
  const pv = S.g.pieces.find((q: any) => q.id === ch.p.id), cd = +(pv?.ucd ?? pv?.cd?.ult ?? S.g.ec?.ultCd?.[me] ?? 0) || 0, max = +(cfgOf(S) as any).chiefUlt?.cd || 8;
  const my = S.g.cur === me && S.phase === "play" && S.g.ap > 0 && !cd;
  return `<button class="abil ult chiefult ${cd ? "cd" : ""}" id="chiefult" ${my ? "" : "disabled"} style="--p:${cd ? Math.round((cd / max) * 100) : 0}" data-tip="${esc(`Ульта «${d.title}»: ${d.sub}. ${cd ? `Готово через ${cd} х.` : "Выберите центр круга на доске."}`)}"><span class="ring"></span><span class="ab-ic">${ic("ult")}</span>${cd ? `<b class="ab-cd">${cd}</b>` : ""}</button>`;
}
function startAim(a: NonNullable<typeof ultAim>) { ultAim = a; aimCell = null; const p = S.g.pieces.find((q: any) => q.id === a.pid); if (p) aimCell = [p.x, p.y];
  const h = $("#hint"); h.hidden = false; h.textContent = matchMedia("(hover: hover)").matches ? "Наведите круг и нажмите — Esc отменит" : "Коснитесь клетки — круг покажется; второе касание — удар"; draw(); }
function stopAim() { ultAim = null; aimCell = null; renderHint(); draw(); }

// ---------- камера: карты до 100×100 ----------
// cx, cy — центр экрана в координатах вида (клетки, уже с разворотом для стороны 1), z — px на клетку.
const cam = { cx: 0, cy: 0, z: 40, n: 0, W: 0, H: 0, fit: 40 };
const cv = () => $<HTMLCanvasElement>("#board");
const big = () => (S?.g?.size || 0) > SMALL;
const flipped = () => S?.you === 1;
const vx = (x: number) => (flipped() ? cam.n - 1 - x : x), vy = (y: number) => (flipped() ? cam.n - 1 - y : y);
const scrX = (x: number) => cam.W / 2 + (vx(x) - cam.cx) * cam.z, scrY = (y: number) => cam.H / 2 + (vy(y) - cam.cy) * cam.z;
function fitCam(force: boolean) {
  const st = $("#stage"); if (!st || !S?.g) return; const W = st.clientWidth, H = st.clientHeight; if (!W || !H) return;
  const n = S.g.size, pad = big() ? 0 : 18, fit = Math.max(4, Math.min((W - pad * 2) / n, (H - pad * 2) / n));
  const sizeChanged = W !== cam.W || H !== cam.H, newMap = cam.n !== n;
  cam.W = W; cam.H = H; cam.fit = fit;
  if (newMap || force || !big()) { cam.n = n; cam.z = fit; cam.cx = n / 2; cam.cy = n / 2;
    if (big() && newMap) { cam.z = Math.max(fit, 44); const a = myAnchor(); if (a) centerOn(a[0], a[1]); } }
  else if (sizeChanged) clampCam();
  const c = cv(), dpr = devicePixelRatio || 1; c.style.width = W + "px"; c.style.height = H + "px";
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  $("#minimapbox").hidden = !big(); $("#camctl").hidden = !big();
}
function clampCam() {
  const n = cam.n; cam.z = Math.max(cam.fit, Math.min(120, cam.z));
  const hw = cam.W / 2 / cam.z, hh = cam.H / 2 / cam.z;
  cam.cx = hw * 2 >= n ? n / 2 : Math.max(hw, Math.min(n - hw, cam.cx)); cam.cy = hh * 2 >= n ? n / 2 : Math.max(hh, Math.min(n - hh, cam.cy));
}
function myAnchor(): [number, number] | null {
  const g = S?.g; if (!g) return null; const me = Math.max(0, S.you);
  const k = g.pieces.find((p: any) => p.o === me && p.k === "king"); if (k) return [k.x, k.y];
  const c = g.ec?.cities?.find((q: any) => q.owner === me && q.cap) || g.ec?.cities?.find((q: any) => q.owner === me); return c ? [c.x, c.y] : null;
}
function centerOn(x: number, y: number) { cam.cx = vx(x) + 0.5; cam.cy = vy(y) + 0.5; clampCam(); draw(); }
function zoomAt(k: number, px = cam.W / 2, py = cam.H / 2) {
  if (!big()) return; const bx = cam.cx + (px - cam.W / 2) / cam.z, by = cam.cy + (py - cam.H / 2) / cam.z;
  cam.z *= k; clampCam(); cam.cx = bx - (px - cam.W / 2) / cam.z; cam.cy = by - (py - cam.H / 2) / cam.z; clampCam(); draw();
}
function cellAt(px: number, py: number): [number, number] | null {
  const X = Math.floor(cam.cx + (px - cam.W / 2) / cam.z), Y = Math.floor(cam.cy + (py - cam.H / 2) / cam.z), n = cam.n;
  if (X < 0 || Y < 0 || X >= n || Y >= n) return null; return flipped() ? [n - 1 - X, n - 1 - Y] : [X, Y];
}

// ---------- взгляд фигур: никогда «в стену» ----------
// dir — куда смотреть (+1 вправо по экрану, −1 влево), cur — текущий scaleX (плавный поворот), hold — до когда держать направление события.
const facing = new Map<number, { dir: number; cur: number; hold: number; last: number }>();
const FLIP_MS = 160, HOLD_MS = 900;
function faceAt(id: number, tx: number, ty: number) {
  const p = S?.g?.pieces.find((q: any) => q.id === id) || ghosts.find((d) => d.p.id === id)?.p; if (!p) return;
  const dx = vx(tx) - vx(p.x); if (!dx) return; const f = faceState(p); f.dir = Math.sign(dx); f.hold = performance.now() + HOLD_MS;
}
/** Сторона врага по умолчанию: среднее положение вражеских фигур/столицы относительно своих (по горизонтали экрана).
 *  Если стороны разнесены по вертикали (верх/низ) — свои смотрят вправо, враг влево: фигуры обращены друг к другу. */
function enemySideDir(o: number): number {
  const g = S.g, team = (side: number) => (S.teams?.[side] ?? g.teams?.[side] ?? side), my = team(o); // 2 на 2: союзники — одна команда
  let ox = 0, on = 0, ex = 0, en = 0; for (const q of g.pieces) { if (team(q.o) === my) { ox += vx(q.x); on++; } else { ex += vx(q.x); en++; } }
  if (on && en && Math.abs(ex / en - ox / on) >= 1.5) return Math.sign(ex / en - ox / on);
  return my === team(Math.max(0, S.you)) ? 1 : -1; // спавны сверху/снизу: свои вправо, враги влево — лицом друг к другу
}
function faceState(p: any) { let f = facing.get(p.id); if (!f) { f = { dir: 0, cur: 0, hold: 0, last: performance.now() }; facing.set(p.id, f); } if (!f.dir) { f.dir = enemySideDir(p.o); f.cur = f.dir; } return f; }
/** Обновить направление и вернуть плавный scaleX. */
function faceOf(p: any, now: number, tw?: { fx: number; fy: number; t: number }): number {
  const f = faceState(p);
  if (tw && now - tw.t < MOVE_MS) { const d = vx(p.x) - vx(tw.fx); if (d) { f.dir = Math.sign(d); f.hold = now + 250; } }
  else if (now > f.hold) { // покой: ближайший видимый враг; тот же столбец — сторона врага; гистерезис — не дёргаться у границы
    let best: any = null, bd = 1e9; const tm = (side: number) => (S.teams?.[side] ?? S.g.teams?.[side] ?? side); for (const q of S.g.pieces) { if (tm(q.o) === tm(p.o)) continue; const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); if (d < bd) { bd = d; best = q; } }
    if (best) { const dx = vx(best.x) - vx(p.x); if (Math.abs(dx) >= 1) { if (Math.sign(dx) !== f.dir && (Math.abs(dx) >= 2 || bd <= 3)) f.dir = Math.sign(dx); } else if (bd > 3) f.dir = enemySideDir(p.o); }
    else f.dir = enemySideDir(p.o); }
  const dt = Math.min(64, now - f.last); f.last = now; const step = (2 * dt) / FLIP_MS;
  if (f.cur !== f.dir) { f.cur = f.dir > f.cur ? Math.min(f.dir, f.cur + step) : Math.max(f.dir, f.cur - step); flipping = true; }
  return f.cur;
}
let flipping = false;

// ---------- отрисовка ----------
let raf = 0;
function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawNow(); }); }
function drawNow() {
  const c = cv(); if (!S?.g || !c || c.offsetParent === null) return; if (!cam.W || cam.n !== S.g.size) fitCam(false); if (!cam.W) return;
  const dpr = devicePixelRatio || 1, ctx = c.getContext("2d")!, g = S.g, n = g.size, z = cam.z;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cam.W, cam.H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const map: MapData = g.map || openMap(n), G0 = gs()!, cfg = cfgOf(S), T = G0.ec ? territoryCached(G0, cfg, g) : null;
  const L = Math.min(n > 60 ? 3072 : 4096, Math.max(512, Math.ceil(n * Math.min(64, Math.max(cam.fit, 24)) * dpr)));
  ctx.drawImage(terrainLayer(map, L, flipped(), [raceCol(0), raceCol(1)], T ? (x, y) => T[y * n + x] : undefined), scrX(flipped() ? n - 1 : 0), scrY(flipped() ? n - 1 : 0), n * z, n * z);
  // видимая область (в координатах карты) — рисуем только её
  const m = 1, vis = (x: number, y: number) => { const X = scrX(x), Y = scrY(y); return X > -z * m && Y > -z * m && X < cam.W + z * (m - 1) + z && Y < cam.H + z * (m - 1) + z; };
  const sx = scrX, sy = scrY;
  if (T) drawEcon(ctx, ectx(), z, sx, sy, T, vis);
  const zs = zonesOf(g); if (zs.length) drawZones(ctx, zs, n, sx, sy, z, performance.now());
  const GP = new Map(G0.pieces.map((q) => [q.id, q]));
  if (selCell) { ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = Math.max(2, z * 0.05); ctx.setLineDash([z * 0.12, z * 0.08]); ctx.strokeRect(sx(selCell[0]) + 2, sy(selCell[1]) + 2, z - 4, z - 4); ctx.setLineDash([]); }
  const G = gs()!, P = sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && S.phase === "play" && G.cur === S.you && !P.acted && G.ap > 0) {
    for (const [x, y] of moveTargets(G, P)) { if (!vis(x, y)) continue; ctx.fillStyle = "rgba(243,210,122,.28)"; ctx.fillRect(sx(x) + 2, sy(y) + 2, z - 4, z - 4); ctx.fillStyle = "#f3d27a"; ctx.beginPath(); ctx.arc(sx(x) + z / 2, sy(y) + z / 2, Math.max(2, z * 0.08), 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#e6623f"; ctx.lineWidth = Math.max(2, z * 0.07); for (const [x, y] of attackTargets(G, P)) if (vis(x, y)) ctx.strokeRect(sx(x) + 3, sy(y) + 3, z - 6, z - 6);
  }
  const now = performance.now(); flipping = false;
  ghosts = ghosts.filter((d) => now - d.t < DEATH_MS);
  for (const d of ghosts) if (vis(d.p.x, d.p.y)) { ctx.globalAlpha = 1 - (now - d.t) / DEATH_MS; drawUnit(ctx, d.p, d.race, "death", sx(d.p.x), sy(d.p.y), z, false, faceState(d.p).cur); ctx.globalAlpha = 1; }
  const dots = z < 16, ps = [...g.pieces].sort((a: any, b: any) => vy(a.y) - vy(b.y));
  for (const p of ps) {
    const tw = tweens.get(p.id); let X = sx(p.x), Y = sy(p.y), hop = 0;
    if (tw) { const k = Math.min(1, (now - tw.t) / MOVE_MS), e = 1 - Math.pow(1 - k, 3); X = sx(tw.fx) + (X - sx(tw.fx)) * e; Y = sy(tw.fy) + (Y - sy(tw.fy)) * e; hop = Math.sin(k * Math.PI) * z * 0.12; if (k >= 1) tweens.delete(p.id); }
    if (X < -z || Y < -z || X > cam.W + z || Y > cam.H + z) continue;
    if (dots) { ctx.fillStyle = raceCol(p.o); ctx.strokeStyle = p.o === S.you ? "#f4ead2" : INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X + z / 2, Y + z / 2, Math.max(2.5, z * (p.k === "king" ? 0.45 : 0.32)), 0, 7); ctx.fill(); ctx.stroke(); continue; }
    const pz = poses.get(p.id), pose: Pose = pz && pz.until > now ? pz.pose : "idle";
    const face = pieceStyle === "figures" ? faceOf(p, now, tw) : 1;
    ctx.globalAlpha = p.a && p.o === g.cur ? 0.62 : 1;
    drawUnit(ctx, p, g.races[p.o], pose, X, Y - hop, z, true, face);
    const cx = X + z / 2, cy = Y + z / 2;
    if (p.id === sel) { ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = Math.max(2, z * 0.05); ctx.strokeRect(X + 3, Y + 3, z - 6, z - 6); }
    if (p.k === "king" && S.check?.[p.o]) { ctx.strokeStyle = "#e6623f"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cx, cy, z * 0.46, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    // полоса здоровья: чернильная рамка, заливка по доле
    const bw = z * 0.66, bx = cx - bw / 2, by = Y + z * 0.9, bh = Math.max(3, z * 0.07), fr = Math.max(0, p.hp / p.mh);
    ctx.fillStyle = INK; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = fr > 0.5 ? "#7fc25a" : fr > 0.25 ? "#e0b04a" : "#c23a2a"; ctx.fillRect(bx, by, bw * fr, bh);
    const badge = (name: string, i: number) => { const im = iconImg(name, draw); if (im) { const s = z * 0.24; ctx.drawImage(im, X + z * 0.74, Y + z * 0.04 + i * s, s, s); } };
    { const Q = GP.get(p.id); if (Q) drawLvBadge(ctx, X, Y - hop, z, pieceLevel(Q, cfg), p.o === S.you && !!pendingTalent(Q, cfg)); }
    let bi = 0; if (p.b) badge("burn", bi++); if (p.c) badge("chill", bi++);
    const st = map.s[p.y * n + p.x]; if (st && st !== ".") drawStructIcon(ctx, st, X + z * 0.14, Y + z * 0.72, z * 0.26);
    ctx.globalAlpha = 1;
  }
  bursts = bursts.filter((b) => now - b.t < FX_MS);
  for (const b of bursts) { const frs = hitFx(b.race); if (!frs.length) continue; const i = Math.min(frs.length - 1, Math.floor(((now - b.t) / FX_MS) * frs.length)), s2 = z * 1.3; ctx.drawImage(frs[i], sx(b.x) + z / 2 - s2 / 2, sy(b.y) + z / 2 - s2 / 2, s2, s2); }
  const castBusy = drawCasts(ctx, n, sx, sy, z, now);
  if (ultAim && aimCell) drawAim(ctx, ultAim.race, aimCell[0], aimCell[1], ultAim.r, n, sx, sy, z, now);
  // числа урона: всплывают, «пружинят», Oswald с чернильной обводкой
  fx = fx.filter((f) => now - f.t < NUM_MS); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const f of fx) { const k = (now - f.t) / NUM_MS, pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
    const fs = Math.max(13, Math.round(z * (f.big ? 0.42 : 0.26) * pop)); ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    ctx.font = `700 ${fs}px Oswald, sans-serif`; ctx.lineWidth = Math.max(3, fs * 0.18); ctx.strokeStyle = INK; ctx.lineJoin = "round";
    const X = sx(f.x) + z / 2, Y = sy(f.y) + z * (0.25 - k * 0.55); ctx.strokeText(f.txt, X, Y); ctx.fillStyle = f.col; ctx.fillText(f.txt, X, Y); }
  ctx.globalAlpha = 1;
  if (big()) drawMinimap();
  const busy = castBusy || ultAim || fx.length || bursts.length || ghosts.length || tweens.size || flipping || eui.recruit || [...poses.values()].some((q) => q.until > now);
  if (busy) draw(); else if (zs.length && !zoneT) zoneT = setTimeout(() => { zoneT = 0; draw(); }, 110) as any;
}
let zoneT = 0;
/** Фигура. «Фигуры»: спрайт (по умолчанию смотрит вправо), отражается по face (−1…1, плавный поворот). «Фишки» — без поворота. */
function drawUnit(ctx: CanvasRenderingContext2D, p: any, race: string, pose: Pose, x0: number, y0: number, cell: number, withGlyph: boolean, face = 1) {
  const [hi, lo] = RACE_COL[race] || ["#ccc", "#333"], cx = x0 + cell / 2, cy = y0 + cell / 2, r = cell * 0.4;
  const own = p.o === S.you, lw = Math.max(1.5, cell * 0.04);
  if (pieceStyle === "figures") {
    const gy = y0 + cell * 0.84;
    ctx.fillStyle = hi + "55"; ctx.strokeStyle = own ? "#f4ead2" : INK; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(cx, gy, cell * 0.34, cell * 0.1, 0, 0, 7); ctx.fill(); ctx.stroke();
    const spr = unitSprite(race, p.k, pose) || unitSprite(race, p.k, "idle"), sxs = Math.abs(face) < 0.08 ? 0.08 * Math.sign(face || 1) : face;
    ctx.save(); ctx.translate(cx, 0); ctx.scale(sxs, 1); ctx.translate(-cx, 0);
    if (spr) {
      const bb = spriteBox(spr) || [0, 0, spr.naturalWidth, spr.naturalHeight, spr.naturalWidth];
      const bw = bb[2] - bb[0], bh = bb[3] - bb[1], k = Math.min((cell * 0.8) / bh, (cell * 0.9) / bw);
      const dx = cx - (bb[0] + bw / 2) * k, dy = gy + cell * 0.02 - bb[3] * k;
      ctx.drawImage(spr, dx, dy, spr.naturalWidth * k, spr.naturalHeight * k);
    } else codeFigure(ctx, p.k, hi, lo, cx, gy, cell);
    ctx.restore();
    if (pose === "hit") { ctx.fillStyle = "#ffffff33"; ctx.fillRect(x0, y0, cell, cell); }
    if (withGlyph && glyphBadge) { const bx = x0 + cell * 0.16, by = y0 + cell * 0.16, br = cell * 0.13;
      ctx.fillStyle = lo; ctx.strokeStyle = own ? GOLD : INK; ctx.lineWidth = Math.max(1, cell * 0.025); ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = `${Math.round(cell * 0.19)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(GLYPH[p.k as Kind], bx, by + 1); }
    return;
  }
  ctx.fillStyle = lo; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(1.5, cell * 0.05); ctx.strokeStyle = own ? "#f4ead2" : INK; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  if (pose === "hit") { ctx.fillStyle = "#ffffff55"; ctx.fill(); }
  ctx.fillStyle = INK; ctx.font = `${Math.round(cell * 0.46)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(GLYPH[p.k as Kind], cx, cy + 1);
}
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
/** Мини-карта: рельеф + территория + фигуры точками, рамка видимой области; клик/перетаскивание — прыжок. */
let mmKey = "", mmBase: HTMLCanvasElement | null = null;
function drawMinimap() {
  const c = $<HTMLCanvasElement>("#minimap"); if (!c || !S?.g) return; const n = S.g.size, D = c.width, k = D / n, g = S.g;
  const key = `${g.map?.id}|${n}|${flipped()}|${g.turn}|${g.cur}`;
  if (key !== mmKey || !mmBase) { mmKey = key; const map: MapData = g.map || openMap(n); mmBase = document.createElement("canvas"); mmBase.width = mmBase.height = D; const x2 = mmBase.getContext("2d")!;
    x2.drawImage(terrainLayer(map, Math.min(1024, Math.max(256, n * 8)), flipped(), [raceCol(0), raceCol(1)]), 0, 0, D, D);
    const G0 = gs()!, T = G0.ec ? territoryCached(G0, cfgOf(S), g) : null;
    if (T) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = T[y * n + x]; if (o >= 0) { x2.fillStyle = raceCol(o) + "55"; x2.fillRect(vx(x) * k, vy(y) * k, k, k); } } }
  const ctx = c.getContext("2d")!; ctx.drawImage(mmBase, 0, 0);
  for (const p of g.pieces) { ctx.fillStyle = raceCol(p.o); ctx.strokeStyle = INK; ctx.lineWidth = 1; const s = Math.max(3, k * (p.k === "king" ? 1.6 : 1)); ctx.fillRect(vx(p.x) * k + k / 2 - s / 2, vy(p.y) * k + k / 2 - s / 2, s, s); ctx.strokeRect(vx(p.x) * k + k / 2 - s / 2, vy(p.y) * k + k / 2 - s / 2, s, s); }
  const w = (cam.W / cam.z) * k, h = (cam.H / cam.z) * k; ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = 2; ctx.strokeRect((cam.cx * k) - w / 2, (cam.cy * k) - h / 2, w, h);
}
function bindMinimap() {
  const c = $<HTMLCanvasElement>("#minimap"); if (!c) return; let down = false;
  const go = (e: PointerEvent) => { const r = c.getBoundingClientRect(); cam.cx = ((e.clientX - r.left) / r.width) * cam.n; cam.cy = ((e.clientY - r.top) / r.height) * cam.n; clampCam(); draw(); };
  c.onpointerdown = (e) => { down = true; c.setPointerCapture(e.pointerId); go(e); }; c.onpointermove = (e) => down && go(e); c.onpointerup = () => (down = false);
}

// ---------- ввод: клик, перетаскивание, щипок, колесо ----------
function bindBoard() {
  const c = cv(), pts = new Map<number, { x: number; y: number }>(); let moved = false, start: { x: number; y: number } | null = null, pinch0 = 0, z0 = 0;
  const local = (e: { clientX: number; clientY: number }) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = false; start = local(e);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = cam.z; } });
  c.addEventListener("pointermove", (e) => {
    const p = local(e);
    if (!pts.has(e.pointerId)) { if (ultAim) { const at = cellAt(p.x, p.y); if (at && (at[0] !== aimCell?.[0] || at[1] !== aimCell?.[1])) { aimCell = at; draw(); } return; } hoverTip(p.x, p.y, e.clientX, e.clientY); return; }
    const prev = pts.get(e.pointerId)!; pts.set(e.pointerId, p);
    if (pts.size === 2 && big()) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); moved = true; zoomAt((z0 * d) / Math.max(1, pinch0) / cam.z, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
    if (start && Math.hypot(p.x - start.x, p.y - start.y) > 6) moved = true;
    if (moved && big()) { cam.cx -= (p.x - prev.x) / cam.z; cam.cy -= (p.y - prev.y) / cam.z; clampCam(); draw(); hideTip(); }
  });
  const up = (e: PointerEvent) => { const was = pts.has(e.pointerId); pts.delete(e.pointerId); if (pts.size) return; if (was && !moved) { const p = local(e); onBoard(p.x, p.y); } start = null; };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); start = null; });
  c.addEventListener("pointerleave", () => hideTip());
  c.addEventListener("wheel", (e) => { if (!big()) return; e.preventDefault(); const p = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
  $("#zin").onclick = () => zoomAt(1.3); $("#zout").onclick = () => zoomAt(1 / 1.3); $("#zfit").onclick = () => { cam.z = cam.fit; clampCam(); draw(); };
  $("#cenking").onclick = () => { const k = S?.g?.pieces.find((p: any) => p.o === Math.max(0, S.you) && p.k === "king"); if (k) { if (cam.z < 40) cam.z = Math.max(cam.fit, 48); centerOn(k.x, k.y); } else toast("Вождя сейчас нет", "bad", "skull"); };
  $("#cencity").onclick = () => { const cs = (S?.g?.ec?.cities || []).filter((q: any) => q.owner === Math.max(0, S.you)); if (!cs.length) return toast("Городов нет", "bad", "castle");
    cityIdx = (cityIdx + 1) % cs.length; if (cam.z < 40) cam.z = Math.max(cam.fit, 48); centerOn(cs[cityIdx].x, cs[cityIdx].y); };
  bindMinimap();
}
let cityIdx = -1, hoverKey = "";
/** Наведение на доску (мышь): короткая подсказка о фигуре или клетке. */
function hoverTip(px: number, py: number, cx: number, cy: number) {
  if (!matchMedia("(hover: hover)").matches || !S?.g) return; const at = cellAt(px, py); if (!at) { hideTip(); hoverKey = ""; return; }
  const [x, y] = at, g = S.g, p = g.pieces.find((q: any) => q.x === x && q.y === y), m: MapData = g.map || openMap(g.size), t = m.t[y * g.size + x], st = m.s[y * g.size + x];
  const key = `${x},${y},${p?.id},${p?.hp}`; if (key === hoverKey) return; hoverKey = key;
  let h = "";
  if (p) h = `<b>${p.k === "king" ? "Вождь " + esc(chiefName(p.o)) : KIND_NAME[p.k as Kind]}</b> · ${p.o === S.you ? "ваш" : "враг"}<br>${ic("heart")}${p.hp}/${p.mh} ${ic("sword")}${p.ea ?? p.atk} ${ic("shield")}${p.er ?? p.arm}`;
  const tp = terrainPassive(t, (TERRAIN as any)[t]?.name || t); h += `${h ? "<br>" : ""}<small>${esc((TERRAIN as any)[t]?.name || t)}${tp ? " · " + tp.effs.map((e) => esc(effLine(e))).join(", ") : ""}${st !== "." ? " · " + esc((STRUCT as any)[st]?.name || "") : ""}</small>`;
  showTip(`<div class="tip-b">${h}</div>`, cx + 14, cy + 14);
}
function onBoard(px: number, py: number) {
  if (!S?.g) return; const at = cellAt(px, py); if (!at) return; const [x, y] = at;
  if (ultAim) { const touch = !matchMedia("(hover: hover)").matches;
    if (touch && (aimCell?.[0] !== x || aimCell?.[1] !== y)) { aimCell = [x, y]; return draw(); }
    if (demo) { const u = parseUlt({ e: ultAim.chief ? "ult" : "uult", id: ultAim.pid, x, y, r: ultAim.r, race: ultAim.race }, S.g, performance.now()); if (u) { addCast(u, S.g.turn); ultBanner(u, true, ""); } }
    else send({ type: "act", act: ultAim.chief || ultAim.id === "ult" ? { a: "ult", id: ultAim.pid, x, y } : { a: "ability", id: ultAim.pid, ab: ultAim.id, x, y } });
    stopAim(); return; }
  const G = gs()!, here = G.pieces.find((p) => p.x === x && p.y === y);
  if (S.phase !== "play") { selCell = here ? null : [x, y]; sel = here ? here.id : null; renderInfo(); return draw(); }
  if (G.ec && !demo && boardClick(ectx(), x, y, !here)) { selCell = null; sel = null; renderInfo(); renderHint(); return draw(); }
  selCell = here ? null : [x, y];
  if (here && here.owner === S.you) { sel = here.id === sel ? null : here.id; renderInfo(); return draw(); }
  const P = sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && G.cur === S.you) {
    if (here && attackTargets(G, P).some(([a, b]) => a === x && b === y)) { faceAt(P.id, x, y); send({ type: "act", act: { a: "attack", id: P.id, x, y } }); }
    else if (!here && moveTargets(G, P).some(([a, b]) => a === x && b === y)) {
      const last = P.owner === 0 ? 0 : G.size - 1;
      if (P.kind === "pawn" && y === last) { choiceDlg("Повышение", "Ополченец дошёл до края поля. Кем он станет?",
          (["knight", "mage", "rook"] as Kind[]).map((k) => ({ id: k, title: KIND_NAME[k], img: unitArt(S.g.races[P.owner], k), foot: `${ic("heart")}${cfgOf(S).units[k].hp} ${ic("sword")}${cfgOf(S).units[k].atk} ${ic("shield")}${cfgOf(S).units[k].arm}` })), "promo")
        .then((k: any) => { if (k) send({ type: "act", act: { a: "move", id: P.id, x, y, promo: k } }); }); }
      else send({ type: "act", act: { a: "move", id: P.id, x, y } });
    } else { sel = here ? here.id : null; renderInfo(); return draw(); }
    sel = null;
  } else { sel = here ? here.id : null; renderInfo(); draw(); }
}

// ---------- таймер ----------
function tick() {
  const el = $("#clock"); if (!el) return;
  if (S?.phase === "play" && S.clock) {
    const now = Date.now() - S.skew, g = S.g, c = S.clock, turnLeft = Math.max(0, c.turnEnds - now), res = Math.max(0, (c.reserve?.[g.cur] ?? 0) - Math.max(0, now - c.turnEnds));
    const total = c.turnMs ?? (S.turnSec ?? (STRAT_CFG.sizes as any)[g.size]?.turnSec ?? turnSecFor(g.size)) * 1000, fr = Math.max(0, Math.min(1, turnLeft / Math.max(1, total)));
    const f = (ms: number) => { const s = Math.ceil(ms / 1000); return s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    const mine = g.cur === S.you, warn = fr <= 0.1;
    if (!el.querySelector(".tring")) el.innerHTML = `<svg class="tring" viewBox="0 0 36 36" aria-hidden="true"><circle class="tr-bg" cx="18" cy="18" r="15.5"/><circle class="tr-fg" cx="18" cy="18" r="15.5" pathLength="100"/></svg><b></b><small></small>`;
    (el.querySelector(".tr-fg") as SVGCircleElement).style.strokeDashoffset = String(100 - fr * 100);
    el.querySelector("b")!.textContent = f(turnLeft); el.querySelector("small")!.textContent = turnLeft > 0 ? (mine ? "ваш ход" : "ход соперника") : "запас " + f(res);
    el.classList.toggle("low", warn); el.classList.toggle("mine", mine); el.dataset.tip = `Время на ход: ${fmtMin(Math.round(total / 1000))}. Когда оно и запас кончатся, ход будет пропущен.`;
  } else el.innerHTML = "";
}
/** Карточка «У вас есть незавершённая партия» в главном меню. Источник: hub-сообщение {type:"resume"} или hub {type:"resume_get"} (протокол уточняется балансовым воркером). */
let resumeInfo: any = null;
function renderResume() {
  const box = $("#resume"); if (!box) return; const r = resumeInfo; if (!r?.code || S) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="rs-crest">${r.oppRace ? crest(r.oppRace) : ic("crown")}</div><div class="rs-b"><small class="plate-sm">У вас есть незавершённая партия</small>
    <b class="rs-opp"></b><span class="rs-meta">${ic("map")}<span class="rs-map"></span> · ${ic("turn")}ход <b>${+r.turn || 1}</b>${r.myTurn ? ` · <em class="rs-my">ваш ход</em>` : ""}</span></div>
    <button class="btn gold big" id="rsgo">${ic("play")}<span>Продолжить</span></button>`;
  box.querySelector(".rs-opp")!.textContent = "против " + (r.opp || "соперника"); box.querySelector(".rs-map")!.textContent = (r.map || "Открытое поле") + (r.size ? ` · ${r.size}×${r.size}` : "");
  box.querySelector<HTMLButtonElement>("#rsgo")!.onclick = () => joinCode(r.code);
}
/** Таблица лиги: hub {type:"top_get", league} → {list}; в демо — локальные данные. */
function topGet(league: string): Promise<any> { return demo ? Promise.resolve((window as any).__stratTopDemo?.(league) || {}) : hubReq("top_get", { league }); }
/** Игровой профиль: hub {type:"profile_get"}; личная вкладка — только если сервер подтвердил владельца. */
function showProfile() { return openProfile(() => (demo ? Promise.resolve(demoProfile(S?.seats?.[S.you]?.nick || $("#me").textContent || "Гость")) : hubReq("profile_get")), { crest, raceName: RACE_NAME, raceCol: (r) => (RACE_COL[r] || [GOLD])[0] }); }
async function loadResume() {
  const j: any = await hubReq("resume_get");
  if (j?.game || j?.code) { resumeInfo = j.game || j; renderResume(); }
}
async function loadOpen() {
  const r = await fetch(HTTP + "/strat/open").catch(() => null); const j: any = r ? await r.json().catch(() => ({})) : {};
  const box = $("#open"); box.innerHTML = "";
  if (!j.list?.length) { box.innerHTML = `<div class="emptyrow">${ic("flag")}<span>Открытых лобби нет — создайте своё</span></div>`; return; }
  for (const l of j.list) { const b = document.createElement("button"); b.className = "lobbyrow";
    b.innerHTML = `<b class="code"></b><span>${l.size}×${l.size}</span><small class="host"></small>${ic("chevron")}`;
    b.querySelector(".code")!.textContent = l.code; b.querySelector(".host")!.textContent = l.host || ""; b.onclick = () => joinCode(l.code); box.appendChild(b); }
}
function applyPrefs(pr: any) {
  if (!pr) return; if (pr.pieceStyle === "fig" || pr.pieceStyle === "tok") { pieceStyle = pr.pieceStyle === "tok" ? "tokens" : "figures"; localStorage.setItem("strat.pieceStyle", pieceStyle); }
  if (typeof pr.glyphBadge === "boolean") { glyphBadge = pr.glyphBadge; localStorage.setItem("strat.glyphBadge", glyphBadge ? "1" : "0"); }
  (window as any).__syncPs?.(); draw();
}
function savePrefs() { hub?.readyState === 1 && hub.send(JSON.stringify({ type: "pref_set", pieceStyle: pieceStyle === "tokens" ? "tok" : "fig", glyphBadge })); }

// ---------- меню партии (свои кнопки, без data-act) ----------
function openMenu() {
  const m = modal({ id: "menudlg", title: "Пауза", icon: "menu", cls: "small menudlg", body: `${profileHtml(null)}<div class="menulist">
    <button class="btn gold" id="m-cont">${ic("play")}<span>Продолжить</span></button>
    <button class="btn" id="m-style">${ic("eye")}<span>${pieceStyle === "figures" ? "Вид: фигуры ⇄ фишки" : "Вид: фишки ⇄ фигуры"}</span></button>
    <button class="btn" id="m-rules">${ic("book")}<span>Правила</span></button>
    ${S?.phase === "play" && S.you >= 0 && !demo ? `<button class="btn danger" id="m-surr">${ic("flag")}<span>Сдаться</span></button>` : ""}
    <button class="btn ghost" id="leave2">${ic("back")}<span>В главное меню</span></button></div>` });
  const q = (id: string) => m.el.querySelector<HTMLButtonElement>("#" + id);
  q("m-cont")!.onclick = () => m.close(null);
  m.el.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-prof]")) showProfile(); });
  const pf = m.el.querySelector<HTMLElement>(".profile")!; pf.querySelector(".pf-nick")!.textContent = S?.seats?.[S.you]?.nick || ($("#me").textContent || "Гость");
  pf.querySelector<HTMLButtonElement>("[data-top]")!.onclick = () => openLeaderboard(topGet, S?.seats?.[S.you]?.nick || "", leagueOf(S?.g?.size || S?.size || 8));
  (demo ? Promise.resolve((window as any).__stratRatingDemo?.() || {}) : hubReq("rating_get")).then((r: any) => { if (!r?.leagues || !pf.isConnected) return; const nk = pf.querySelector(".pf-nick")!.textContent; pf.outerHTML = profileHtml(r.leagues);
    const pf2 = m.el.querySelector<HTMLElement>(".profile")!; pf2.querySelector(".pf-nick")!.textContent = nk; pf2.querySelector<HTMLButtonElement>("[data-top]")!.onclick = () => openLeaderboard(topGet, nk || "", leagueOf(S?.g?.size || S?.size || 8)); });
  q("m-style")!.onclick = () => { togglePieceStyle(); q("m-style")!.querySelector("span")!.textContent = pieceStyle === "figures" ? "Вид: фигуры ⇄ фишки" : "Вид: фишки ⇄ фигуры"; };
  q("m-rules")!.onclick = () => { m.close(null); showRules(); };
  const sb = q("m-surr"); if (sb) sb.onclick = () => { m.close(null); surrender(); };
  q("leave2")!.onclick = () => { m.close(null); leaveMatch(); };
}
function showRules() { const src = document.getElementById("rulestext"); modal({ id: "rulesdlg", title: "Правила", icon: "book", cls: "rulesdlg", body: src ? src.innerHTML : "" }); }
async function surrender() { if (await confirmDlg("Сдаться?", "Победа уйдёт сопернику. Это нельзя отменить.", "Сдаться", { danger: true, icon: "flag" })) send({ type: "forfeit" }); }
async function endTurn() {
  if (!S?.g || S.g.cur !== S.you) return; const G = gs()!;
  if (S.check?.[S.you] && !(await confirmDlg("Вождь в опасности!", "Вражеские фигуры могут ударить вашего Вождя в следующем ходу. Всё равно завершить ход?", "Завершить ход", { danger: true, icon: "warn" }))) return;
  const idle = G.ap > 0 && G.pieces.some((p) => p.owner === S.you && !p.acted);
  if (idle && G.ap >= 2 && !(await confirmDlg("Остались очки действий", `У вас ещё ${G.ap} ОД. Завершить ход?`, "Завершить", { icon: "ap" }))) return;
  send({ type: "act", act: { a: "end" } });
}
function togglePieceStyle() { pieceStyle = pieceStyle === "figures" ? "tokens" : "figures"; localStorage.setItem("strat.pieceStyle", pieceStyle); (window as any).__syncPs?.(); draw(); savePrefs(); }

// ---------- демо-доска (локально): большие карты без сервера ----------
function startDemo(n: number) {
  n = Math.max(4, Math.min(100, n | 0)); const cfg: any = structuredClone(STRAT_CFG), b = cfg.sizes[n] ? null : cfg.sizes[n >= 15 ? 15 : n >= 8 ? 8 : 5];
  if (b) { const w = Math.min(n - 2, Math.max(3, Math.min(9, Math.round(n * 0.5)))), row = (k: string[]) => Array.from({ length: w }, (_, i) => k[i % k.length]);
    cfg.sizes[n] = { ...b, size: n, army: n < 6 ? [["knight", "king", "rook"].slice(0, Math.min(3, n))] : [row(["rook", "mage", "knight", "hero", "knight", "mage", "rook"]).map((k, i, a) => (i === a.length >> 1 ? "king" : k)), row(["pawn"])] };
    if (cfg.econ?.sizes && !cfg.econ.sizes[n]) cfg.econ.sizes[n] = cfg.econ.sizes[n >= 15 ? 15 : n >= 8 ? 8 : 5]; }
  const races: any = [qs.get("r0") || "fire", qs.get("r1") || "ice"], seed = +(qs.get("seed") || 7); let map = makeMap(n, "rnd:" + seed, cfg);
  if (map.id === "open" && n > 15) { // генератор рассчитан на 5–15: для демо большой карты мостим рельеф из 15×15 (только местность, без построек)
    const m15 = makeMap(15, "rnd:" + seed), t = map.t.split(""), keep = (cfg.sizes[n].army.length || 2) + 1;
    for (let y = keep; y < n - keep; y++) for (let x = 0; x < n; x++) { const sy = 3 + ((y - keep) % 9), sx = (x + Math.floor((y - keep) / 9) * 5) % 15; t[y * n + x] = m15.t[sy * 15 + sx]; }
    map = { ...map, id: "rnd:" + seed, name: "Демо-карта", t: t.join("") }; }
  const g: any = newGame(n, races, 0, cfg, null, map);
  if (qs.get("skirm")) { // стычка в центре: стороны слева и справа на одних рядах — проверка взгляда фигур
    const mid = n >> 1; let i0 = 0, i1 = 0; const keepP = new Set<number>();
    for (const p of g.pieces) { const k = p.owner === 0 ? i0++ : i1++; if (k > 5) continue; keepP.add(p.id); const row = mid - 1 + (k % 3), col = Math.floor(k / 3);
      p.x = p.owner === 0 ? Math.max(0, mid - 2 - col) : Math.min(n - 1, mid + 1 + col); p.y = row; }
    g.pieces = g.pieces.filter((p: any) => keepP.has(p.id) || p.kind === "king");
    for (const p of g.pieces) if (p.kind === "king" && !keepP.has(p.id)) { p.x = p.owner === 0 ? 0 : n - 1; p.y = mid; }
    const tt = map.t.split(""); for (let y = mid - 2; y <= mid + 2; y++) for (let x = 0; x < n; x++) if (y >= 0 && y < n && !/[.fg]/.test(tt[y * n + x])) tt[y * n + x] = "."; map = { ...map, t: tt.join("") }; g.map = map; }
  const you = +(qs.get("demoyou") || 0);
  demo = true; S = { code: "", you, phase: "play", seats: [{ nick: "Алекс", race: races[0] }, { nick: "Соперник", race: races[1] }], mapInfo: { name: map.name || "Демо" }, g: view(g, true, cfg), size: n, ev: [], demoCfg: cfg };
  render(); requestAnimationFrame(() => { fitCam(true); if (big()) { cam.z = Math.max(cam.fit, 44); const a = myAnchor(); if (a) centerOn(a[0], a[1]); } draw(); });
}

// ---------- запуск ----------
export function boot() {
  setTipResolver(passiveTip);
  $("#create").onclick = createLobby;
  $("#joinbtn").onclick = () => joinCode($<HTMLInputElement>("#joincode").value);
  $<HTMLInputElement>("#joincode").onkeydown = (e) => { if (e.key === "Enter") joinCode((e.target as HTMLInputElement).value); };
  $("#refresh").onclick = loadOpen;
  $("#copy").onclick = async () => { const u = location.origin + location.pathname + "?join=" + S.code; try { await navigator.clipboard.writeText(u); toast("Ссылка скопирована", "good", "copy"); } catch { toast("Код лобби: " + S.code, "info", "copy"); } };
  $("#goals").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-bl]"); if (b) openBlacklist(+b.dataset.bl!); });
  $<HTMLInputElement>("#ranked").onchange = (e) => send({ type: "cfg", ranked: (e.target as HTMLInputElement).checked });
  { const pb = document.getElementById("profbtn"); if (pb) pb.onclick = () => showProfile(); }
  { const tb = document.getElementById("topbtn"); if (tb) tb.onclick = () => openLeaderboard(topGet, "", "fast"); }
  $("#claim").onclick = async () => { if (await confirmDlg("Завершить партию?", "Соперник не за столом и пропустил 5 ходов подряд. Партия завершится вашей победой — решение проверит сервер.", "Завершить", { icon: "flag" })) send({ type: "claim_away" }); };
  $<HTMLSelectElement>("#tsec").onchange = (e) => { const v = (e.target as HTMLSelectElement).value; send({ type: "cfg", turnSec: v === "" ? null : +v }); };
  $<HTMLSelectElement>("#tl").onchange = (e) => { const v = (e.target as HTMLSelectElement).value; send({ type: "cfg", turnLimit: v === "" ? null : +v }); };
  const cs = $<HTMLInputElement>("#csize"); cs.onchange = () => { const v = Math.max(4, Math.min(100, +cs.value | 0)); cs.value = String(v); send({ type: "cfg", size: v }); };
  $("#bot").onclick = () => send({ type: "bot", slot: 1, on: !S.seats[1]?.bot });
  chatInit({ send: (o) => { if (demo) { chatRecv({ type: "chat", ch: o.ch, fromNick: S?.seats?.[S.you]?.nick || "Вы", from: "me", to: o.to, toNick: o.toNick, text: o.text, mine: true }); return; } send(o); },
    me: () => (S && S.you >= 0 ? { nick: S.seats[S.you]?.nick || "", id: S.seats[S.you]?.uid } : null),
    players: () => (S?.seats || []).map((s: any, i: number) => ({ nick: s?.nick || "", id: s?.uid, team: teamOf(S, i), you: i === S.you })).filter((p: any) => p.nick),
    team: () => modeOf(S) === "2v2", toast });
  $("#ready").onclick = () => send({ type: "ready", on: !S.seats[S.you]?.ready });
  $("#end").onclick = endTurn;
  $("#forfeit").onclick = surrender;
  $("#menubtn").onclick = openMenu;
  $("#rematch").onclick = () => send({ type: "rematch" });
  $("#leave").onclick = leaveMatch;
  const rb = document.getElementById("rulesbtn"); if (rb) rb.onclick = showRules;
  $("#nick").oninput = (e) => localStorage.setItem("strat_nick", (e.target as HTMLInputElement).value.slice(0, 24));
  $<HTMLInputElement>("#nick").value = localStorage.getItem("strat_nick") || "";
  const ps = $<HTMLButtonElement>("#pstyle"), pb = $<HTMLInputElement>("#pbadge");
  const syncPs = () => { ps.querySelector("span")!.textContent = pieceStyle === "figures" ? "Фигуры ⇄ фишки" : "Фишки ⇄ фигуры"; ps.dataset.style = pieceStyle; pb.checked = glyphBadge; pb.closest("label")!.hidden = pieceStyle !== "figures"; };
  ps.onclick = togglePieceStyle;
  pb.onchange = () => { glyphBadge = pb.checked; localStorage.setItem("strat.glyphBadge", glyphBadge ? "1" : "0"); draw(); savePrefs(); };
  (window as any).__syncPs = syncPs; syncPs();
  addEventListener("keydown", (e) => { if (e.key === "Escape" && ultAim) { stopAim(); return; } if (e.key === "Escape" && !document.querySelector("#modals .dlg")) { eui.recruit = null; sel = null; renderHint(); renderInfo(); draw(); }
    if (e.key === " " && S?.phase === "play" && !(e.target as HTMLElement).closest("input,textarea") && !document.querySelector("#modals .dlg")) { e.preventDefault(); endTurn(); } });
  bindBoard(); bindTips();
  new ResizeObserver(() => { if (S?.g) { fitCam(false); draw(); } }).observe($("#stage"));
  setInterval(tick, 250);
  connectHub(); loadOpen(); render(); loadArt(draw); injectIcons();
  const d = LOCAL ? qs.get("demo") : null; if (d) startDemo(+d);
  const j = qs.get("join"); if (j && !d) joinCode(j);
}

// Хуки только для локального плейтеста (localhost + ?devUser): снимок состояния, камера и клик-план «как игрок».
if (LOCAL && (qs.get("devUser") || qs.get("demo"))) { (window as any).__stratS = () => S; (window as any).__stratCam = () => ({ ...cam }); (window as any).__stratFace = () => [...facing.entries()].map(([id, f]) => ({ id, dir: f.dir })); }
// только локально и только в демо-доске: открыть окна для скриншотов (в бою с сервером не существует)
if (LOCAL && qs.get("demo")) (window as any).__stratDev = {
  render: () => { gsCache = { s: null, g: null } as any; render(); }, chief: () => openChiefTree(true), name: (r: boolean) => askChiefName(r), menu: () => openMenu(), surr: () => surrender(), end: () => endTurn(),
  tech: () => { eui.tech = true; renderTech(ectx()); }, city: (id: number) => { eui.city = id; renderCity(ectx()); },
  goal: (i: number) => { const gl = goalsOf(S, gs()!, cfgOf(S)); goalPopup(S.you, gl.sides[S.you][i], 2, 3); },
  over: (w: number) => { S.phase = "over"; S.ranked = true; S.result = { winner: w, reason: "goals", rating: { [S.you]: w === S.you ? { league: "normal", before: 1532, after: 1550, delta: 18 } : { league: "normal", before: 1532, after: 1520, delta: -12 } } }; render(); showEnd(); },
  prof: () => showProfile(),
  bl: (k = 1) => { localFell[k] = { turn: 7, by: S.you }; render(); openBlacklist(S.you); },
  bots: () => { S.seats[1] = { nick: "Бот", race: "ice", bot: true, botLv: "hard", ready: true }; S.seats.length > 2 && (S.seats[2] = null); render(); },
  claim: () => { S.seats[1].online = false; S.seats[1].skips = 5; render(); }, toast: (t: string, k: string, i: string) => toast(t, k as any, i),
  ult: (race: string, x: number, y: number, small = false) => { const k = S.g.pieces.find((p: any) => p.o === S.you && p.k === "king"); const u = parseUlt({ e: small ? "uult" : "ult", id: k?.id, x, y, race, side: S.you }, S.g, performance.now()); if (u) { addCast(u, S.g.turn); ultBanner(u, false, S.seats[1 - S.you]?.nick || "Соперник"); draw(); } },
  aim: (race: string, x: number, y: number, r = 2) => { ultAim = { id: "ult", pid: -1, r, race, chief: true }; aimCell = [x, y]; draw(); },
  lvl: (id: number, lv: number) => { const p = S.g.pieces.find((q: any) => q.id === id); if (p) { p.lv = lv; p.xp = 99; } gsCache = { s: null, g: null } as any; render(); },
  chief5: () => { const k = S.g.pieces.find((p: any) => p.o === S.you && p.k === "king"); if (k) { k.lv = 5; k.xp = 999; } gsCache = { s: null, g: null } as any; render(); },
  sel: (id: number) => { sel = id; renderInfo(); draw(); },
  chat: () => { chatDemo(); }, away: (i: number, on = true) => { S.seats[i].online = !on; render(); },
  timer: (left: number, total: number) => { S.clock = { turnEnds: Date.now() - S.skew + left, turnMs: total, reserve: [60000, 60000] }; tick(); },
  resume: () => { resumeInfo = { code: "K7QX2M", opp: "Сайфер", oppRace: "lightning", map: "Перевал у Чёрной реки", size: 15, turn: 14, myTurn: true }; S = null; demo = false; render(); renderResume(); },
  lobby8: (mode: string, n: number) => { const races = ["fire", "ice", "water", "stone", "nature", "lightning", "fire", "ice"], nick = ["Алекс", "Сайфер", "Мира", "Горн", "Ласка", "Вихрь", "Тень", "Бот"];
    S = { code: "DEMO8", phase: "lobby", you: 0, size: 15, mode, maxSeats: n, spawns: 8, seats: Array.from({ length: Math.min(n, 6) }, (_, i) => ({ nick: nick[i], race: i % 3 ? races[i] : null, picked: true, ready: i % 2 === 0, bot: i === 5, botLv: "hard", team: mode === "2v2" ? i % 2 : undefined, online: i !== 2 })), skew: 0 }; demo = true; render(); },
  ffa: (n: number) => { S.seats = Array.from({ length: n }, (_, i) => S.seats[i] || { nick: ["Алекс", "Сайфер", "Мира", "Горн", "Ласка", "Вихрь", "Тень", "Бот"][i], online: i !== 3 }); S.g.races = Array.from({ length: n }, (_, i) => S.g.races[i] || ["water", "stone", "nature", "lightning", "fire", "ice"][i % 6]); S.mode = "ffa"; render(); } };
(window as any).__stratFocus = (id: number) => { const p = S?.g?.pieces?.find((q: any) => q.id === id); if (!p) return; sel = id; centerOn(p.x, p.y); renderInfo(); draw(); };
if (LOCAL && qs.get("demo")) { (window as any).__stratRatingDemo = () => ({ leagues: { fast: { r: 1612, rd: 48, games: 41, w: 25, l: 14, d: 2, peak: 1660 }, normal: { r: 1532, rd: 72, games: 17, w: 9, l: 7, d: 1, peak: 1561 }, tactic: { r: 1500, rd: 190, games: 3, w: 2, l: 1, d: 0, peak: 1514 } } });
  (window as any).__stratTopDemo = (id: string) => ({ list: ["Сайфер", "Алекс", "Мира", "Горн", "Ласка", "Вихрь", "Тень", "Кобальт", "Пепел", "Руна"].map((nick, i) => ({ nick, r: (id === "fast" ? 1840 : id === "normal" ? 1760 : 1690) - i * 37, rd: i > 7 ? 160 : 50, games: 80 - i * 6, w: 50 - i * 4, l: 25 - i, d: i % 3 })) }); }
if (LOCAL && qs.get("devUser")) (window as any).__stratPlan = () => {
  if (!S?.g) return "wait"; if (S.phase === "over") return "over"; if (S.g.cur !== S.you) return "wait";
  const G = gs()!; if (G.ap < 1) return "end";
  const mine = G.pieces.filter((p) => p.owner === S.you && !p.acted), r = cv().getBoundingClientRect();
  const px = (x: number, y: number) => [r.left + scrX(x) + cam.z / 2, r.top + scrY(y) + cam.z / 2];
  for (const p of mine) { const t = attackTargets(G, p)[0]; if (t) return { from: px(p.x, p.y), to: px(t[0], t[1]), atk: true, kind: p.kind }; }
  const opts = mine.flatMap((p) => moveTargets(G, p).map((t) => ({ p, t, d: (S.you === 0 ? t[1] - p.y : p.y - t[1]) }))); opts.sort((a, b) => a.d - b.d || Math.random() - 0.5);
  const o = opts[0]; if (o) { centerOn(o.p.x, o.p.y); drawNow(); return { from: px(o.p.x, o.p.y), to: px(o.t[0], o.t[1]) }; } return "end";
};
