// «Партия Чёрных королей» — клиент (/games/strategy). Сервер авторитетен: клиент рисует снимок и подсвечивает ходы
// тем же движком (server/strat/rules.ts). Экран игры: доска с камерой (панорама/масштаб/мини-карта) для карт до 100×100,
// HUD вокруг, игровые окна вместо prompt/confirm, баннер хода, тосты, анимации.
import { mountAdminGoals } from "./admin-goals";
import { loadArt, unitSprite, hitFx, spriteBox, type Pose } from "./art";
import { terrainLayer, drawStructIcon, GOLD, INK } from "./terrain-draw";
import { renderBar, renderCity, renderTech, pieceActs, bindPieceActs, boardClick, drawEcon, econFx, econToast, cfgOf, ui as eui, KIND_NAME, ECON_ERR, territoryCached, pieceLv, talName, unitArt, type Ctx } from "./econ-ui";
import { TERRAIN, STRUCT, TER_RULES, openMap, type MapData } from "../../../server/strat/terrain";
import { moveTargets, attackTargets, STRAT_CFG, SIZES, RACES, newGame, makeMap, view, type GameState, type Kind } from "../../../server/strat/rules";
import { injectIcons, ic, iconImg, RACE_ICON } from "./icons";
import { esc, modal, confirmDlg, choiceDlg, promptDlg, toast as uiToast, banner, showTip, hideTip, bindTips, openSheet } from "./ui-kit";
import { GOALS, goalDef, goalsOf, chiefOf, chiefTypes, chiefNodeState, normTree, type Goal, type CNode } from "./goals";
import { fogView, unveilCls, fogNode } from "./fog";
import { t2, t2Tint, t2OnLoad } from "./t2";
import { racePassives, talentPassive, terrainPassive, structPassive, pasIcon, regPassive, passiveTip, effLine, type Passive } from "./passives";
import { setTipResolver } from "./ui-kit";
import { parseUlt, addCast, ultBanner, zonesOf, resetUlt, drawZones, drawCasts, drawAim, ULT, ultRadius, shake, placeBanner, BAN_MS } from "./ult-fx";
import { loadFx, fxImg, drawFx2, addArc, addShot, addAnim, addLunge, lungeOf, hitStop, inHitStop, hitStopLeft, resetFx2, fxUrl, fxMeta, drawEnt, drawStatusMarks, pruneMarks } from "./fx2";
import { chatInit, chatRecv, chatReset, chatShow, chatDemo } from "./chat";
import { renderPlayers, renderSlots, playerCol, isAway, teamOf, modeOf, allies } from "./players";
import { openProfile, demoProfile } from "./profile";
import { lobbyLeagueHtml, profileHtml, openLeaderboard, ratingDelta, leagueOf, leagueName, LEAGUES } from "./rating";
import { localFell, resetFell, blacklistOf } from "./goals";
import { favRaces, setFavLocal, lobbyDrawHtml, favPickerHtml, bindFavPicker, drumReveal } from "./racedraw";
import { wonderPopup } from "./bldart";
import { worldEvent, W, terrFull, drawWalls, drawBuildings, drawWorldOverlay, razeTargets, buildChoices, towerCells, claimable, cityName, apTip, HS_NAME, HS_COL, hsByHp, loadWalls, cityBld, towersOf, terrCities } from "./world";
import { bName } from "./econ-ui";
import { raceNums, raceEffects, describeEffects } from "../../../server/strat/effects";
import { TECHS } from "../../../server/strat/econ-cfg";
import { Recorder, framesFrom, itemFrom, libFrom, lsPut, lsList, lsGetRec, lsDel, evLine, evWhy, whyHtml, viewBarHtml, libHtml, type Frame, type Rec, type RpInfo, type EvCtx, type LibItem } from "./history";
import { codexGot, openCodex } from "./codex-ui";
import { hpBarArt, unitHpArt, HS_STEP } from "./ui2art";
import { drawLvBadge, abilityBar, bindAbilityBar, renderLvDock, pieceLevel, pendingTalent } from "./units";

const PROD_WS = "wss://morris-multiplayer.alexseylyou.workers.dev";
const qs = new URLSearchParams(location.search);
/** P2: одно слово-характер расы (на телефоне вместо списка свойств — макет ui_v2_phone_lobby). */
const RACE_WORD: Record<string, string> = { fire: "натиск", ice: "оборона", water: "манёвр", stone: "осада", nature: "рост", lightning: "цепь" };
/** dev: синтетическая раскладка для проверки walls-v2 — A(свой) | B(свой, общая стена) сверху, C(враг) снизу, дорога сквозь A и C. */
let wallTest: { x: number; y: number; front?: boolean; open?: boolean; shape?: string[] } | null = null;
function wallTestLayout(G0: any, T0: Int8Array, C0: Int16Array) {
  const n = G0.size, T = Int8Array.from(T0), C = Int16Array.from(C0), t = (G0.map?.t || "").split(""), { x, y } = wallTest!, foe = S.you === 0 ? 1 : 0;
  const blk = (x0: number, y0: number, w: number, h: number, id: number, o: number) => { for (let j = y0; j < y0 + h; j++) for (let i = x0; i < x0 + w; i++) if (i >= 0 && j >= 0 && i < n && j < n) { C[j * n + i] = id; T[j * n + i] = o; if (t[j * n + i] === "w") t[j * n + i] = "."; } };
  const sh = wallTest!.shape; // dev: произвольная форма — "#"/"2" свои города (9000/9001), "e" — враг, "." — пусто
  if (sh) sh.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#" || ch === "2") blk(x + i, y + j, 1, 1, ch === "#" ? 9000 : 9001, S.you); else if (ch === "e") blk(x + i, y + j, 1, 1, 9002, foe); }));
  else { blk(x - 4, y - 4, 4, 4, 9000, S.you); blk(x, y - 4, 4, 4, 9001, S.you); blk(x - 4, y, 5, 4, 9002, foe);
  for (let j = y - 6; j < y + 6; j++) if (j >= 0 && j < n) t[j * n + x - 2] = "r"; }
  return { G: { ...G0, map: { ...G0.map, t: t.join("") } }, T, C };
}
/** walls-v2: союзники — общая стена; враги — двойная стена (по умолчанию) или частокол+разделённая лента (cfg.ui.wallFront / ?wallFront=1 / localStorage strat.wallFront=1 — выбор Алекса);
 * ворота открыты, когда на клетке ворот или перед ней стоит фигура владельца. */
function wallOpts(G0: any, T: Int8Array) {
  const n = G0.size, ffa = modeOf(S) === "ffa" || modeOf(S) === "1v1";
  const front = !!((cfgOf(S) as any)?.ui?.wallFront ?? (qs.get("wallFront") === "1" || (() => { try { return localStorage.getItem("strat.wallFront") === "1"; } catch { return false; } })()));
  const occ = new Map<number, number>(); for (const q of G0.pieces || []) occ.set(q.y * n + q.x, q.owner);
  return { front, side: (o: number) => (ffa ? o : teamOf(S, o)),
    gateOpen: (x: number, y: number, X: number, Y: number) => { const o = T[y * n + x], a = occ.get(y * n + x), b = occ.get(Y * n + X); return a === o || b === o; } };
}
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
const REASON: Record<string, string> = { glory: "Достигнут порог Славы", capital: "Столица взята", king: "Вождь пал", forfeit: "Соперник сдался", disconnect: "Соперник не вернулся", limit: "Лимит ходов: больше целей (поровну — больше прогресс к остальным)", goals: "Выполнены все цели" };
const ERR: Record<string, string> = { ...ECON_ERR, quiet: "Сейчас нельзя", bad_action: "Неверное действие", guest: "Только для вошедших",
  not_your_turn: "Сейчас ход соперника", already_acted: "Эта фигура уже действовала", no_ap: "Очки действий кончились", bad_move: "Туда нельзя",
  bad_attack: "Эту цель не достать", bad_turn_limit: "Лимит ходов: от 5 до 200 или без лимита", not_host: "Настройки меняет хост", pick_race: "Сначала выберите расу", seat_taken: "Место занято", color_taken: "Этот цвет уже у соперника", bad_color: "Нет такого цвета",
  auth_bad: "Вход не подтверждён — обновите страницу", auth_expired: "Сессия истекла — обновите страницу", no_ident: "Нужно войти или играть гостем",
  map_not_approved: "Карта ещё не проверена — играть на ней может только автор", map_hidden: "Карта скрыта модератором", not_admin: "Только для админа",
  reason_required: "Укажите причину отказа", not_found: "Карта не найдена", bad_size: "Такой размер поля сервер пока не поддерживает",
  invite_rate: "Не чаще раза в 10 секунд", spectator: "Вы зритель", rate: "Слишком часто — подождите минуту",
};
Object.assign(ERR, { lib_full: "Библиотека заполнена — уберите старые партии", live: "Партия ещё идёт", no_replay: "Повтор недоступен", bad_id: "Неверная ссылка на повтор", ...(ERR.guest ? {} : { guest: "Нужно войти на сайт" }), need_login: "Нужно войти на сайт" });
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
  return new Promise((res) => { if (hub?.readyState !== 1) return res({ err: "offline" }); const rq = rqN++; hubWait.set(rq, res); hub.send(JSON.stringify({ type, rq, ...o })); setTimeout(() => { if (hubWait.delete(rq)) res({ err: "timeout" }); }, 5000); });
}
function connectHub() {
  hub = new WebSocket(WS + "/strat/hub");
  hub.onopen = async () => hub!.send(JSON.stringify({ type: "hello", ...(await helloMsg()) }));
  hub.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "hello_ok") { $("#me").textContent = m.nick + (m.guest ? " · гость" : ""); { const cn = document.querySelector("#cmdr .cm-nick"); if (cn) cn.textContent = m.nick; } isAdmin = !!m.admin; isGuest = !!m.guest; applyPrefs(m.prefs); if (Array.isArray(m.favRaces)) setFavLocal(m.favRaces); mountAdmin(); loadResume(); loadCommander(); }
    if (m.type === "fav_races_ok") { setFavLocal(m.favRaces); toast("Любимые расы сохранены", "good", "check"); if (S?.phase === "lobby") renderLobby(); }
    if (typeof m.type === "string" && (m.type.endsWith("_r") || m.type === "lib" || m.type === "err") && m.rq && hubWait.has(m.rq)) { hubWait.get(m.rq)!(m); hubWait.delete(m.rq); return; }
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
  (no as HTMLButtonElement).onclick = () => d.remove(); d.addEventListener("click", (e) => { if (!(e.target as HTMLElement).closest("button")) d.remove(); });
  $("#toasts").appendChild(d); setTimeout(() => d.remove(), ttl * 1000);
}

// ---------- матч ----------
let selCell: [number, number] | null = null;
let ws: WebSocket | null = null, S: any = null, curCode = "", sel: number | null = null, retry = 0, left = false, demo = false;
let playMode: "normal" | "ranked" | "bot" = ((m) => (m === "ranked" || m === "bot" ? m : "normal"))(localStorage.getItem("strat.playMode"));
let pendingIntent: { mode: string; size?: number } | null = null;
async function createLobby() {
  const want = +($<HTMLInputElement>("#size").value), size = want > 15 ? 15 : want, pub = playMode !== "bot" && $<HTMLInputElement>("#pub").checked; // /strat/new знает 5/8/15; больше — через cfg хоста
  const r = await fetch(HTTP + "/strat/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ size, pub }) }).catch(() => null);
  const j: any = r ? await r.json().catch(() => ({})) : {};
  if (!j.code) return toast(ERR[j.err] || "Сервер недоступен", "bad");
  pendingIntent = { mode: playMode, size: want !== size ? want : undefined }; joinCode(j.code);
}
/** Выбор в меню «Играть» (рейтинговая / с ботом / размер) применяется хостом к только что созданному лобби — обычными cfg/bot, сервер всё проверяет сам. */
function applyIntent() {
  if (!pendingIntent || !S || S.phase !== "lobby" || S.you !== 0) return; const it = pendingIntent; pendingIntent = null;
  if (it.size) send({ type: "cfg", size: it.size }); send({ type: "cfg", ranked: it.mode === "ranked" }); /* r3: у сервера ratedDefault=true — «Обычная» и «с ботом» явно без рейтинга */ if (it.mode === "bot") send({ type: "bot", slot: 1, on: true });
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
    if (rpMsg(m)) return;
    if (m.type === "codex") { codexGot(m.items); return; } // F: Библиотека — новые открытия
    if (m.type === "st") { m.skew = Date.now() - m.now; if (hv?.replay) { hv.back = m; rec.push(m.code, m.g, m.ev || []); return; }
      const viewing = !!hv, prev = liveS || S; S = m; onState(prev); applyIntent(); rec.push(S.code, S.g, S.ev || []); if (Array.isArray(S.hist)) rec.merge(S.code, framesFrom(S.hist));
      if (viewing && hv) { liveS = S; applyView(); } else renderMoves(); if (S.replay?.id && (!srvMv || hv || S.phase === "over")) askMoves(); }
    if (m.type === "err") toast(ERR[m.err] || m.err, "bad");
    if (m.type === "left") { left = true; S = null; curCode = ""; resetMatchUi(); const u = new URL(location.href); u.searchParams.delete("join"); history.replaceState(null, "", u); render(); }
  };
  ws.onclose = (e) => {
    if (left || !curCode) return;
    if (e.code === 1006 && !S && retry > 1) { toast("Лобби не найдено или закрыто", "bad"); curCode = ""; render(); return; }
    setStatus("Связь потеряна, переподключение…"); setTimeout(openMatch, Math.min(8000, 800 * 2 ** retry++));
  };
}
const send = (o: any) => { if (hv && /^(act|end|ult|surrender|claim)$/.test(o?.type)) return toast(hv.replay ? "Это повтор партии" : "Вы смотрите прошлый ход — нажмите «К игре»", "info", "hist");
  if (demo) return toast("Демо-доска: ходы не отправляются"); ws?.readyState === 1 && ws.send(JSON.stringify(o)); };
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
  const box = $("#log"); if (!box) return;
  // t1201: одинаковая строка подряд — не дублируем, а считаем «×N»
  const top = box.firstElementChild as HTMLElement | null;
  if (top && top.dataset.t === t) { const k = +(top.dataset.n || 1) + 1; top.dataset.n = String(k); top.textContent = `${t} ×${k}`; }
  else { const d = document.createElement("div"); d.className = "lg " + cls; d.dataset.t = t; d.textContent = t; box.prepend(d); }
  while (box.children.length > 30) box.lastElementChild!.remove();
  logPeek(box);
}
/** t1201: свёрнутый журнал на доске — всплывает на ~4 с при новой записи и прячется сам (или по тапу); весь журнал — кнопкой «журнал». */
let logT = 0;
function logPeek(box: HTMLElement) { box.classList.add("peek"); clearTimeout(logT); logT = window.setTimeout(() => box.classList.remove("peek"), 4000);
  if (!box.dataset.tap) { box.dataset.tap = "1"; box.addEventListener("click", () => { if (!box.classList.contains("open")) { clearTimeout(logT); box.classList.remove("peek"); } }); } }

// ---------- события снимка ----------
let fx: { x: number; y: number; t: number; txt: string; col: string; big?: boolean }[] = [];
const poses = new Map<number, { pose: Pose; until: number }>();
const tweens = new Map<number, { fx: number; fy: number; t: number }>();
let lastHitAt: [number, number] | null = null;
let ghosts: { p: any; race: string; t: number }[] = [], bursts: { x: number; y: number; race: string; t: number }[] = [];
const POSE_MS = 420, DEATH_MS = 750, FX_MS = 480, MOVE_MS = 280, NUM_MS = 1200;
const sticky: Set<string>[] = Array.from({ length: 8 }, () => new Set<string>()); const lastHit = new Map<number, number>(); // цели, отмеченные навсегда («Пал Вождь врага» — только первый)
let prevGoals: Goal[][] | null = null, prevChief: { alive: boolean; pend: number } | null = null, endShown = false, introShown = false;
const crest = (r: string) => `<img class="crestimg" src="/strat/ui/crests/crest_${r}.png" alt="">`;
function showWonder(c: any) { const g = S.g, race = g.races[c.owner] || "fire", cfg: any = cfgOf(S);
  wonderPopup({ race, title: bName("wonder", race), city: c.name || (c.cap ? "Столица" : "Город"), who: S.seats[c.owner]?.nick || "Игрок", mine: c.owner === S.you,
    eff: cfg.build?.wonder?.eff || "+2 Славы за ход; ультимейт Вождя сильнее (+3 силы, перезарядка −2)" }); }
function resetMatchUi() { resetUlt(); resetFx2(); chatReset(); ultAim = null; aimCell = null; sticky.forEach((x) => x.clear()); lastHit.clear(); resetFell(); prevGoals = null; prevChief = null; endShown = false; introShown = false; cam.n = 0; document.getElementById("endscreen")?.remove(); const lg = $("#log"); if (lg) lg.innerHTML = ""; }
/** «Вождь <имя> пал» — баннер всем игрокам. Есть арт fx-v1 (banner_chief_fallen_blank: «ВОЖДЬ … ПАЛ» нарисовано) —
 *  имя пишем кодом в его name_field (сжатие по ширине до scale_x_min, потом кегль до min_size); нет — стиль баннера ульты. */
/** Очередь баннеров у верхнего края доски (ульта отдельно): по одному, ~1,2 с; при переполнении старые выбрасываются. */
const banQ: (() => Promise<HTMLElement | null>)[] = []; let banBusy = false;
function queueBanner(mk: () => Promise<HTMLElement | null>) { if (banQ.length >= 3) banQ.shift(); banQ.push(mk); if (!banBusy) nextBanner(); }
async function nextBanner() { const mk = banQ.shift(); if (!mk) { banBusy = false; return; } banBusy = true;
  const el = await mk().catch(() => null); if (!el) { nextBanner(); return; }
  placeBanner(el); document.body.appendChild(el); setTimeout(() => el.classList.add("out"), BAN_MS - 300); setTimeout(() => { el.remove(); nextBanner(); }, BAN_MS); }
/** баннер fx-v1 banner_<key> (ШАХ!/ВЗЯТИЕ!/LEVEL UP!/НОВАЯ ЭПОХА!/НИЧЬЯ — надпись нарисована); нет арта — текстом в стиле баннера ульты */
/** появление баннера: лист <key>_pop.webp (8 кадров, 24 fps, последний = статичный), грузится лениво при первом показе; не успел за 250 мс или «меньше движения» — статичный арт */
const popCache = new Map<string, Promise<string | null>>();
function popSheet(key: string): Promise<string | null> {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve(null);
  let p = popCache.get(key); if (!p) { const url = `/strat/art/fx/${key}_pop.webp`; p = new Promise((res) => { const i = new Image(); i.onload = () => res(url); i.onerror = () => res(null); i.src = url; }); popCache.set(key, p); }
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 250))]);
}
function artBanner(key: string, title: string, sub = "") {
  queueBanner(async () => { const im = await fxImg(key), el = document.createElement("div"); el.setAttribute("role", "status"); el.setAttribute("aria-label", sub ? `${title}. ${sub}` : title);
    const pop = im ? await popSheet(key) : null;
    if (im) { el.className = "chiefban fxban"; let i: HTMLElement;
      if (pop) { i = document.createElement("div"); i.className = "chief-art popsheet"; i.style.backgroundImage = `url("${pop}")`; } else { i = im.cloneNode() as HTMLImageElement; (i as HTMLImageElement).alt = ""; i.className = "chief-art"; }
      el.append(i); if (sub) el.append(Object.assign(document.createElement("div"), { className: "fxban-sub", textContent: sub })); }
    else { el.className = "ultban k-chief"; const t = document.createElement("div"); t.className = "ult-title"; t.textContent = title; t.dataset.text = title;
      el.append(Object.assign(document.createElement("i"), { className: "ult-rays" }), t); if (sub) el.append(Object.assign(document.createElement("div"), { className: "ult-sub", textContent: sub })); }
    return el; });
}
function chiefBanner(name: string, mine: boolean, who: string) { queueBanner(async () => { const im = await fxImg("chiefBanner"); return chiefBannerEl(name, mine, who, im); }); }
function chiefBannerEl(name: string, mine: boolean, who: string, img: HTMLImageElement | null): HTMLElement {
  const el = document.createElement("div"), m = img ? fxMeta("chiefBanner") : null, sub = mine ? "Ваш Вождь повержен" : who ? `${who}: Вождь повержен` : "Вождь повержен";
  el.setAttribute("role", "status"); el.setAttribute("aria-label", `Вождь ${name} пал. ${sub}`);
  if (m) {
    const nf = m.nameField || {}, c = document.createElement("canvas"); c.width = m.w; c.height = m.h; c.className = "chief-art";
    const x = c.getContext("2d")!; x.drawImage(img!, 0, 0);
    const txt = nf.case === "upper" ? name.toUpperCase() : name, maxW = nf.max_w || nf.w || 276; let fs = nf.size || 60, sc = 1;
    const font = () => `${nf.weight || 700} ${fs}px ${nf.font || "Oswald"}, Impact, sans-serif`; x.font = font();
    let w = x.measureText(txt).width; if (w > maxW) { sc = Math.max(nf.scale_x_min || 0.72, maxW / w); while (w * sc > maxW && fs > (nf.min_size || 38)) { fs -= 2; x.font = font(); w = x.measureText(txt).width; } }
    x.save(); x.translate((nf.x ?? 555) + (nf.w ?? 320) / 2, nf.baseline_y ?? 126); x.scale(sc, 1); x.textAlign = "center"; x.lineJoin = "round";
    if (nf.shadow) { x.fillStyle = nf.shadow; x.fillText(txt, (nf.shadow_offset?.[0] || 0) / sc, nf.shadow_offset?.[1] || 0); }
    if (nf.outline) { x.strokeStyle = nf.outline; x.lineWidth = (nf.outline_px || 6) * 2 / sc; x.strokeText(txt, 0, 0); }
    x.fillStyle = nf.color || "#f4ead2"; x.fillText(txt, 0, 0); x.restore();
    const sp = m.subPlate; if (sp) { x.font = `600 ${Math.round(sp.h * 0.62)}px Oswald, sans-serif`; x.fillStyle = "#f4ead2"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(sub.toUpperCase(), sp.x + sp.w / 2, sp.y + sp.h / 2 + 1, sp.w - 16); }
    el.className = "chiefban"; el.append(c);
  } else {
    el.className = "ultban k-chief";
    const t = document.createElement("div"), title = `Вождь ${name} пал`.toUpperCase(); t.className = "ult-title"; t.textContent = title; t.dataset.text = title;
    const s2 = document.createElement("div"); s2.className = "ult-sub"; s2.textContent = sub;
    el.append(Object.assign(document.createElement("i"), { className: "ult-rays" }), t, s2);
  }
  return el;
}
function onState(prev: any) {
  if (S.code !== prev?.code) resetMatchUi();
  if (S.phase !== "play") sel = null;
  if (S.g && prev?.g && S.g.cur !== prev.g.cur) sel = null;
  const now = performance.now(), g = S.g, me = S.you;
  if (g && prev?.g) for (const p of g.pieces) { const q = prev.g.pieces.find((z: any) => z.id === p.id); if (q && (q.x !== p.x || q.y !== p.y)) tweens.set(p.id, { fx: q.x, fy: q.y, t: now }); }
  if (g?.ec && prev?.g?.ec && !hv && S.code === prev.code) for (const c of g.ec.cities as any[]) { const pc = prev.g.ec.cities.find((q: any) => q.id === c.id);
    if ((c.bld || []).includes("wonder") && pc && !(pc.bld || []).includes("wonder")) showWonder(c); }
  lastHitAt = null; const hasChiefDown = (S.ev || []).some((e: any) => e.e === "chief_down");
  if (!hv && S.code === prev?.code && S.phase === "play") for (const sd of [0, 1]) if (S.check?.[sd] && !prev?.check?.[sd]) // ШАХ!: сервер шлёт check[side] (inCheck) — баннер при появлении угрозы Вождю
    artBanner("banner_shah", "ШАХ!", sd === me ? "Ваш Вождь под ударом" : `${S.seats[sd]?.nick || "Соперник"}: Вождь под ударом`);
  for (const e of S.ev || []) {
    if (!g) break;
    { const u = parseUlt(e, g, now, prev?.g); if (u) { addCast(u, g.turn); ultBanner(u, u.side === me, S.seats[u.side]?.nick || ""); draw(); } }
    if (e.e === "limitwarn") { const t = e.left === 1 ? "Последний ход партии" : `До конца партии ${e.left} ходов`; banner(t, `Лимит ${e.limit}: побеждает тот, у кого больше целей`, "theirs"); toast(t, "bad", "clock"); }
    if (e.e === "timeout" || e.e === "skip") toast(e.side === me ? "Ход пропущен — время вышло" : `${S.seats[e.side]?.nick || "Соперник"}: ход пропущен — время вышло`, e.side === me ? "bad" : "info", "clock");
    if (e.e === "hit") {
      poses.set(e.id, { pose: "attack", until: now + POSE_MS });
      const t = g.pieces.find((q: any) => q.id === e.t) || prev?.g?.pieces.find((q: any) => q.id === e.t);
      if (t) { poses.set(e.t, { pose: "hit", until: now + POSE_MS }); const a = g.pieces.find((q: any) => q.id === e.id) || prev?.g?.pieces.find((q: any) => q.id === e.id); lastHitAt = [t.x, t.y];
        // залп (способность) — снаряд от стрелка; обычный удар — выпад + хит-стоп 60 мс (не для ульты: у неё своя анимация)
        if (a && e.why?.via === "volley") addShot([a.x, a.y], [t.x, t.y], now, g.races?.[a.o]); else if (a && !e.ult) { addLunge(e.id, [a.x, a.y], [t.x, t.y], now); hitStop(now); }
        bursts.push({ x: t.x, y: t.y, race: a ? g.races[a.o] : "", t: now }); if (a) lastHit.set(e.t, a.o); if (a) { faceAt(e.id, t.x, t.y); faceAt(e.t, a.x, a.y); }
        fx.push({ x: t.x, y: t.y, t: now, txt: "−" + e.dmg, col: e.burn ? "#ff9d3d" : e.chill ? "#9fe0ff" : "#ff5040", big: true }); }
    }
    if (e.e === "zap") { const t = g.pieces.find((q: any) => q.id === e.t) || prev?.g?.pieces.find((q: any) => q.id === e.t), a = g.pieces.find((q: any) => q.id === e.id) || prev?.g?.pieces.find((q: any) => q.id === e.id);
      if (t) { addArc(lastHitAt || (a ? [a.x, a.y] : [t.x, t.y]), [t.x, t.y], now); poses.set(e.t, { pose: "hit", until: now + POSE_MS }); fx.push({ x: t.x, y: t.y, t: now, txt: "−" + e.dmg, col: "#c9b8ff", big: true }); } }
    if (e.e === "heal") { const t = g.pieces.find((q: any) => q.id === e.id); if (t && e.n > 0) { fx.push({ x: t.x, y: t.y, t: now, txt: "+" + e.n, col: "#7fe07a", big: true }); addAnim("heal", t.x, t.y, now); } }
    if (e.e === "shield") { const t = g.pieces.find((q: any) => q.id === e.id) || prev?.g?.pieces.find((q: any) => q.id === e.id);
      if (t) { if (e.n > 0) fx.push({ x: t.x, y: t.y, t: now, txt: "щит −" + e.n, col: "#cfe0ff" }); else fx.push({ x: t.x, y: t.y, t: now, txt: "Щит " + (e.left || ""), col: "#cfe0ff" }); } }
    if (!hv && S.code === prev?.code) { // баннеры fx-v1 — только на живые события (не при перемотке истории)
      if (e.e === "capture") artBanner("banner_capture", "ВЗЯТИЕ!", `${S.seats[e.by]?.nick || (e.by === me ? "Вы" : "Соперник")}: ${e.cap ? "столица взята" : "город взят"}`);
      if (e.e === "era") artBanner("banner_new_era", "НОВАЯ ЭПОХА!", `${e.side === me ? "Вы" : S.seats[e.side]?.nick || "Соперник"}: эпоха ${["", "I", "II", "III", "IV", "V"][e.era] || e.era}`);
      if (e.e === "lvl") { const t = g.pieces.find((q: any) => q.id === e.id); if (t) { addAnim("levelup", t.x, t.y, now, 1.5); if (t.o === me) artBanner("banner_levelup", "LEVEL UP!", `${KIND_NAME[t.k as Kind] || "Фигура"}: уровень ${e.lvl}`); } }
    }
    if (e.e === "tgrow") addAnim("cityGrow", e.x, e.y, now, 1.2);
    if (e.e === "recruit" && e.treant) { const t = g.pieces.find((q: any) => q.id === e.id); if (t) addAnim("spawn", t.x, t.y, now); }
    if (e.e === "chief_down") { chiefBanner(String(e.name || chiefName(e.side)), e.side === me, S.seats[e.side]?.nick || ""); shake(3); logAdd(`Вождь ${e.name || chiefName(e.side)} пал`, e.side === me ? "bad" : "good"); }
    if (e.e === "kill") { const d = prev?.g?.pieces.find((q: any) => q.id === e.id); if (d) { ghosts.push({ p: d, race: g.races[d.o], t: now }); if (d.k !== "king") shake(1);
      if (d.k === "king") { if (!localFell[d.o]) localFell[d.o] = { turn: g.turn, by: typeof e.by === "number" ? e.by : lastHit.get(e.id), name: chiefName(d.o) }; if (!hasChiefDown) logAdd((d.o === me ? "Пал ваш Вождь " : "Пал вражеский Вождь ") + chiefName(d.o), d.o === me ? "bad" : "good"); }
      else logAdd((d.o === me ? "Потеря: " : "Сражён: ") + KIND_NAME[d.k as Kind], d.o === me ? "bad" : ""); } }
    const p = g.pieces.find((q: any) => q.id === (e.t ?? e.id));
    if (e.e === "burn" && p) fx.push({ x: p.x, y: p.y, t: now, txt: "−" + e.dmg, col: "#ff9d3d", big: true });
    { const we = worldEvent(e, me, gs()!, (sd) => S.seats[sd]?.nick || "Соперник"); if (we) { if (we.fx) fx.push({ ...we.fx, t: now } as any); if (we.dust) rubble.push({ ...we.dust, t: now });
        if (we.toast) { toast(we.toast[0], we.toast[1], we.toast[2]); logAdd(we.toast[0], we.toast[1] === "bad" ? "bad" : we.toast[1] === "good" ? "good" : ""); } } }
    if (e.e === "found" && e.set) { /* поселение основано — тост ниже из econToast */ }
    const ef = ["bhit", "bdestroy", "tgrow", "tcap"].includes(e.e) ? null : econFx(e); if (ef) { const c = e.city != null ? g.ec?.cities.find((q: any) => q.id === e.city) : null, at = c || p || (e.x != null ? e : null);
      if (at) fx.push({ x: at.x, y: at.y, t: now, txt: ef.txt, col: ef.col }); }
    if (e.e === "build") { const c = g.ec?.cities.find((q: any) => q.id === e.city); if (c) e.side = c.owner; }
    const tt = econToast(e, me, gs()!); if (tt) { toast(tt[0], tt[1], tt[2]); logAdd(tt[0], tt[1] === "bad" ? "bad" : tt[1] === "good" ? "good" : ""); }
    if (e.e === "capture" && e.cap) sticky[e.by]?.add("capital");
    if (e.e === "promote" && p) fx.push({ x: p.x, y: p.y, t: now, txt: KIND_NAME[e.kind as Kind], col: "#f3d27a" });
  }
  if (S.phase === "play" && g) {
    const started = prev?.phase !== "play" || prev?.code !== S.code;
    const drumKey = "strat.drum." + S.code;
    if (started && S.raceDraw?.rolls?.length && g.turn <= 1 && !sessionStorage.getItem(drumKey)) { sessionStorage.setItem(drumKey, "1"); introShown = true;
      drumReveal(S, { ...raceD(), me, nick: (sd) => S.seats[sd]?.nick || "Игрок " + (sd + 1) }, () => { banner("Партия началась", `${RACE_NAME[g.races[0]]} против ${RACE_NAME[g.races[1]]}`, "start");
        if (me >= 0 && !localNames().length && !S.chiefNames?.[me]) setTimeout(() => askChiefName(false), 1200); }); }
    else if (started && !introShown) { introShown = true; banner("Партия началась", `${RACE_NAME[g.races[0]]} против ${RACE_NAME[g.races[1]]}`, "start");
      if (me >= 0 && !localNames().length && !S.chiefNames?.[me]) setTimeout(() => askChiefName(false), 1500); }
    else if (prev?.g && prev.g.cur !== g.cur) { if (g.cur === me) { banner("Ваш ход", `Ход ${g.turn} · ${g.ap} ОД`, "mine"); toast("Ваш ход", "turn", "crown"); } else banner("Ход соперника", S.seats[g.cur]?.nick || "", "theirs"); }
  }
  if (g && S.phase !== "lobby") {
    const G = gs()!, cfg = cfgOf(S), gl = goalsWithSticky(G, cfg);
    if (prevGoals) gl.sides.forEach((row, side) => row.forEach((q, i) => { if (q.done && prevGoals![side]?.[i] && !prevGoals![side][i].done) goalPopup(side, q, gl.sides[side].filter((z) => z.done).length, gl.need); }));
    prevGoals = gl.sides.map((s) => s.map((q) => ({ ...q })));
    if (me >= 0) { const ch = chiefOf(S, G, me, cfg), alive = !!ch.p;
      if (prevChief && !prevChief.alive && alive && S.phase === "play") setTimeout(() => askChiefName(true), 400);
      if (alive && ch.pend && prevChief && ch.pend > prevChief.pend && g.cur === me && S.phase === "play") setTimeout(() => openChiefTree(true), 500);
      prevChief = { alive, pend: ch.pend }; }
  }
  if (S.phase === "over" && !endShown && g) { endShown = true; setTimeout(showEnd, prev?.phase === "play" ? 900 : 0); }
  else if (S.phase === "over" && endShown) patchEndRating(); // r3: рейтинг сервер дописывает в st чуть позже конца партии
  if (S.phase !== "over") { endShown = false; document.getElementById("endscreen")?.remove(); }
  render();
}
function goalsWithSticky(G: GameState, cfg: any) {
  const gl = goalsOf(S, G, cfg);
  gl.sides.forEach((s, side) => s.forEach((q) => { if (sticky[side].has(q.id)) { q.done = true; q.v = q.max; } if (q.done) sticky[side].add(q.id); }));
  return gl;
}
function goalPopup(side: number, q: Goal, count: number, need: number) {
  const d = goalDef(q), mine = side === S.you;
  logAdd((mine ? "Цель выполнена: " : "Соперник выполнил цель: ") + d.name + ` (${count}/${need})`, mine ? "good" : "bad");
  if (!mine) { toast(`Соперник: «${d.name}» — ${count} из ${need}`, "bad", d.icon); return; }
  const m = modal({ title: "Цель выполнена!", icon: d.icon, cls: "small goalpop", sub: `${count} из ${need} целей для победы`,
    body: `<div class="gp-medal"><img class="gp-sun" src="/strat/ui/ornaments/ornament_sunburst.png" alt="">${ic(d.icon)}</div><p class="gp-name"></p><div class="gp-pips">${Array.from({ length: need }, (_, i) => `<i class="${i < count ? "on" : ""}"></i>`).join("")}</div>`,
    acts: [{ label: "Дальше", cls: "gold", val: true }] });
  m.el.querySelector(".gp-name")!.textContent = d.name; setTimeout(() => m.close(true), 4200);
}

// ---------- история ходов и повторы (history.ts) ----------
const rec = new Recorder();
type HV = { idx: number; replay: Rec | null; playing: boolean; speed: number; timer: number; saved: boolean; back: any; sub?: { i: number; f: Frame } | null; run?: number };
let hv: HV | null = null, liveS: any = null;
const hFrames = (): Frame[] => (hv?.replay ? hv.replay.frames : rec.frames);
const hMarks = (F: Frame[]) => F.map((f, i) => i).filter((i) => !F[i + 1] || F[i + 1].turn !== F[i].turn || F[i + 1].cur !== F[i].cur);
function evCtx(): EvCtx { const g = (liveS || S)?.g; return { me: (liveS || S)?.you ?? -1, nick: (i) => (hv?.replay?.nicks?.[i] ?? (liveS || S)?.seats?.[i]?.nick) || "Игрок " + (i + 1),
  pieceName: (p) => (p?.k === "king" || p?.kind === "king" ? "Вождь" : KIND_NAME[(p?.k || p?.kind) as Kind] || "фигура"), cityName: (id) => { const c = g?.ec?.cities?.find((q: any) => q.id === id); return c?.name || (id >= 10001 ? "Башня" : "Город"); },
  bName: (b, side) => (b === "watchtower" ? "Сторожевая башня" : bName(b, g?.races?.[side] || "")), techName: (id) => (TECHS as any[]).find((t) => t.id === id)?.name || id }; }
/** Открыть просмотр кадра idx (в партии — прошлый ход; в повторе — любой). */
function histOpen(idx: number, replay?: Rec | null) {
  if (replay !== undefined && replay) { stopPlay(); hv = { idx: 0, replay, playing: false, speed: 1, timer: 0, saved: !!replay.saved, back: hv?.back ?? liveS ?? S }; liveS = null; }
  const F = hFrames(); if (!F.length) return toast("История пока пуста — она появится после первого хода", "info", "hist");
  if (!hv?.replay && idx >= F.length - 1) return goLive();
  if (!hv) { liveS = S; hv = { idx, replay: null, playing: false, speed: 1, timer: 0, saved: false, back: null }; askMoves(); }
  hv.sub = null; hv.idx = Math.max(0, Math.min(F.length - 1, idx)); applyView();
}
function applyView() {
  if (!hv) return; const F = hFrames(), f = hv.sub?.f || F[hv.idx]; if (!f) return goLive();
  const base = hv.replay ? { code: "REPLAY", phase: "view", you: hv.replay.you ?? -1, size: f.g.size, seats: hv.replay.nicks.map((n) => ({ nick: n, race: null, online: true })), skew: 0, mapInfo: null } : liveS;
  S = { ...base, g: { ...f.g, map: f.g.map || hv.replay?.map || rec.map || liveS?.g?.map }, ev: [], phase: "view", clock: null, viewing: true };
  gsCache = { s: null, g: null } as any; sel = null; document.body.classList.add("hist-view"); render(); renderHistBar(); renderMoves();
}
function goLive() {
  stopPlay(); if (!hv) return; const back = hv.replay ? hv.back : liveS; hv = null; liveS = null; S = back || null;
  gsCache = { s: null, g: null } as any; document.body.classList.remove("hist-view"); const hb = $("#histbar"); if (hb) { hb.hidden = true; hb.innerHTML = ""; } render(); renderMoves();
}
function histStep(d: number) { askMoves(); const F = hFrames(), M = hMarks(F); if (!M.length) return; const cur = hv ? hv.idx : F.length - 1;
  const at = d < 0 ? [...M].reverse().find((i) => i < cur) : M.find((i) => i > cur); if (at == null) { if (d > 0 && !hv?.replay) goLive(); return; } histOpen(at); }
function stopPlay() { if (hv?.timer) { clearTimeout(hv.timer); hv.timer = 0; } if (hv) { hv.playing = false; hv.run = (hv.run || 0) + 1; } }
function togglePlay() { if (!hv?.replay) return; if (hv.playing) { stopPlay(); renderHistBar(); return; } const F = hFrames(); if (hv.idx >= F.length - 1) { hv.idx = 0; hv.sub = null; }
  hv.playing = true; const run = hv.run = (hv.run || 0) + 1; renderHistBar(); hv.timer = window.setTimeout(() => playTick(run), 250); }
/** Автопроигрывание. Серверный повтор — по действиям: кадры между концами полуходов пакетами from/to (§14.I, до 40 за запрос), пауза — dt действия («как было») или по скорости. */
async function playTick(run: number) {
  const h = hv; if (!h?.playing || h.run !== run || !h.replay) return; const R = h.replay, F = R.frames, rp = R.rp;
  const later = (ms: number) => { if (hv === h && h.playing && h.run === run) h.timer = window.setTimeout(() => playTick(run), ms); };
  if (h.idx >= F.length - 1 && !h.sub) { stopPlay(); renderHistBar(); return; }
  if (rp && rp.idx.length === F.length) {
    const b = rp.idx[h.idx + 1], ni = (h.sub?.i ?? rp.idx[h.idx]) + 1;
    if (b != null && ni < b) { const f = await rpFrame(R, ni, b - 1); if (hv !== h || !h.playing || h.run !== run) return;
      if (f) { h.sub = { i: ni, f }; applyView(); return later(rpDelay(R, ni)); } }
    h.sub = null; h.idx++; applyView(); return later(rpDelay(R, b ?? 0));
  }
  const at0 = F[h.idx]?.at || 0; h.idx++; applyView(); later(h.speed === 0 ? Math.max(250, Math.min(3000, (F[h.idx]?.at || 0) - at0 || 900)) : 900 / h.speed);
}
const rpDelay = (R: Rec, i: number) => { const sp = hv?.speed ?? 1; if (sp !== 0) return 450 / sp; const a = R.rp?.list.find((x) => +x.i === i - 1); return Math.max(150, Math.min(3000, +(a?.dt ?? 600) || 600)); };
const rpCache = new Map<string, Frame>(), rpLoading = new Map<string, Promise<void>>();
/** Кадр i серверного повтора; при промахе — пакет from=i&to=min(i+39, b). */
async function rpFrame(R: Rec, i: number, b: number): Promise<Frame | null> {
  const id = R.rp!.id, key = (k: number) => id + "#" + k; if (rpCache.has(key(i))) return rpCache.get(key(i))!;
  const to = Math.min(b, i + 39), lk = id + "@" + i;
  if (!rpLoading.has(lk)) rpLoading.set(lk, (async () => {
    const j: any = await fetch(HTTP + "/strat/replay?id=" + encodeURIComponent(id) + "&from=" + i + "&to=" + to).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    for (const x of Array.isArray(j?.frames) ? j.frames : []) { const [f] = framesFrom([{ frame: x.frame }]); if (f && Number.isFinite(+x.i)) rpCache.set(key(+x.i), f); rpDiv(R, x.diverged); }
    while (rpCache.size > 160) rpCache.delete(rpCache.keys().next().value!);
  })());
  await rpLoading.get(lk); rpLoading.delete(lk); return rpCache.get(key(i)) || null;
}
/** diverged: индекс первого расходящегося действия (null/−1/false — совпадает). */
function rpDiv(R: Rec, d: any) { const v = d === true ? 0 : Number.isFinite(+d) && d !== null && d !== false && +d >= 0 ? +d : null; if (v != null && R.rp && (R.rp.div == null || v < R.rp.div)) R.rp.div = v; }
// ---------- §14.I в партии: WS {type:"moves"} → список ходов; {type:"frame", i} → кадры до первого своего ----------
type SrvMoves = { id: string; live: boolean; n: number; turns: { turn: number; side: number; from: number; to: number }[]; list: any[] };
let srvMv: SrvMoves | null = null, srvAskAt = 0, srvDiv: number | null = null, srvOff = false, srvT = 0;
const srvWant = new Set<number>(), srvGot = new Map<number, Frame>();
/** В демо запросы уходят в подменный канал (для скриншотов), иначе — в WS партии. */
function sendRp(o: any) { if (demo) return void (window as any).__stratRpOut?.(o); if (ws?.readyState === 1) ws.send(JSON.stringify(o)); }
function askMoves() { const r = (liveS || S)?.replay; if (srvOff || !r?.id || hv?.replay) return; if (srvMv?.id === String(r.id) && srvMv.n === +r.n) return; if (Date.now() - srvAskAt < 1200) return; srvAskAt = Date.now(); sendRp({ type: "moves" }); }
function onSrvMoves(m: any) {
  if (!Array.isArray(m?.turns)) return; const id = String(m.id ?? ""); if (srvMv && srvMv.id !== id) { srvGot.clear(); srvWant.clear(); srvDiv = null; }
  srvMv = { id, live: !!m.live, n: +m.n || 0, turns: m.turns.filter((t: any) => Number.isFinite(+t?.to)).map((t: any) => ({ turn: +t.turn, side: +t.side, from: +t.from, to: +t.to })), list: Array.isArray(m.list) ? m.list : [] };
  const own = rec.frames.slice(rec.preN), first = own[0]; let k0 = srvMv.turns.length;
  if (first) { k0 = srvMv.turns.findIndex((t) => t.turn > first.turn || (t.turn === first.turn && t.side === first.cur)); if (k0 < 0) k0 = srvMv.turns.length; }
  const want = [0, ...srvMv.turns.slice(0, k0).map((t) => t.to)].filter((i, k, a) => a.indexOf(i) === k && !srvGot.has(i) && !srvWant.has(i)).slice(-80);
  for (const i of want) { srvWant.add(i); sendRp({ type: "frame", i }); }
  renderMoves(); if (hv) renderHistBar();
}
function onSrvFrame(m: any) {
  const i = +m?.i; if (!Number.isFinite(i) || !m.frame) return; srvWant.delete(i);
  const d = m.diverged, v = d === true ? 0 : d != null && d !== false && Number.isFinite(+d) && +d >= 0 ? +d : null; if (v != null && (srvDiv == null || v < srvDiv)) srvDiv = v;
  const t = srvMv?.turns.find((x) => x.to === i), [f] = framesFrom([{ frame: m.frame, turn: t?.turn }]); if (!f) return; srvGot.set(i, f);
  clearTimeout(srvT); srvT = window.setTimeout(() => { const P = [...srvGot.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]), sh = rec.setPre((liveS || S)?.code, P);
    if (hv && !hv.replay) { hv.idx = Math.max(0, hv.idx + sh); applyView(); } else renderMoves(); }, 120);
}
/** Ответы сервера повторов в WS партии; true — сообщение обработано. */
function rpMsg(m: any): boolean {
  if (m?.type === "moves") { onSrvMoves(m); return true; } if (m?.type === "frame") { onSrvFrame(m); return true; }
  if (m?.type === "err" && m.err === "no_replay") { srvOff = true; return true; } return false;
}
function histWarn(): string[] {
  const R = hv?.replay, w: string[] = [], dv = R ? R.rp?.div : srvDiv;
  if (R?.rp?.rulesChanged) w.push("Правила с тех пор изменились"); if (dv != null) w.push(`Расходится с партией с действия ${dv + 1}`); return w;
}
function renderHistBar() {
  const hb = $("#histbar"); if (!hb || !hv) return; const F = hFrames(), f = F[hv.idx], live = liveS?.g;
  const side = f ? evCtx().nick(f.cur) : ""; hb.hidden = false;
  const canSave = !!(hv.replay ? !hv.replay.saved : rec.frames.length), h = viewBarHtml({ turn: (hv.sub?.f || f)?.turn ?? 1, side, live: !hv, replay: !!hv.replay, idx: hv.idx, max: F.length - 1, playing: hv.playing, speed: hv.speed, canSave, saved: hv.saved, warn: histWarn() });
  if (hb.dataset.h !== h) { hb.dataset.h = h; hb.innerHTML = h; bindHistBar(hb); }
  hb.querySelector(".hv-s")!.textContent = `ходит ${side}` + (hv.replay ? ` · ${hv.idx + 1}/${F.length}` + (hv.sub ? ` · действие ${hv.sub.i}` : "") : live ? ` · идёт ход ${live.turn}` : "");
  (hb.querySelector(".hv-scrub") as HTMLInputElement).value = String(hv.idx);
}
function bindHistBar(hb: HTMLElement) {
  hb.querySelectorAll<HTMLButtonElement>("[data-hv]").forEach((b) => (b.onclick = () => { const k = b.dataset.hv, F = hFrames();
    if (k !== "play") { stopPlay(); if (hv) hv.sub = null; } if (k === "first") histOpen(0); if (k === "prev") histStep(-1); if (k === "next") histStep(1); if (k === "play") togglePlay(); if (k === "save") saveReplay();
    if (k === "last") hv?.replay ? histOpen(F.length - 1) : goLive(); if (k === "live" || k === "close") goLive(); }));
  hb.querySelectorAll<HTMLButtonElement>("[data-sp]").forEach((b) => (b.onclick = () => { if (!hv) return; hv.speed = Number.isFinite(+b.dataset.sp!) ? +b.dataset.sp! : 1; const was = hv.playing; stopPlay(); hb.dataset.h = ""; if (was) togglePlay(); else renderHistBar(); }));
  const sc = hb.querySelector<HTMLInputElement>(".hv-scrub")!; sc.oninput = () => { stopPlay(); if (hv) hv.sub = null; const i = +sc.value; if (!hv?.replay && i >= hFrames().length - 1) return goLive(); histOpen(i); };
}
/** Список ходов: по полуходам, события с разбором «почему» во всплывающей подсказке. */
function renderMoves() {
  const box = $("#mvlist"); if (!box) return; const F = hFrames(), M = hMarks(F), c = evCtx(), cur = hv ? hv.idx : -1;
  const pv = $<HTMLButtonElement>("#hprev"), nx = $<HTMLButtonElement>("#hnext"); if (pv) pv.disabled = M.length < 2 && !hv; if (nx) nx.disabled = !hv;
  if (!M.length) { box.innerHTML = `<div class="mv-empty">История появится после первого хода</div>`; return; }
  const rows: string[] = []; let from = 0;
  for (const mi of M) { const f = F[mi], evs: string[] = [];
    for (let i = from; i <= mi; i++) { const before = F[i - 1]?.g || F[i].g; for (const e of F[i].ev) { const l = evLine(e, before, F[i].g, c); if (!l) continue; const w = l.why ? evWhy(e, before, c, passOf) : null;
      evs.push(`<li class="mv-e" style="${l.side != null && l.side >= 0 ? `--pc:${raceCol(l.side)}` : ""}" ${w ? `data-tip="${esc(whyHtml(w))}" tabindex="0"` : ""} data-f="${i}">${ic(l.icon)}<span>${esc(l.txt)}</span>${w ? `<i class="mv-why" aria-hidden="true">?</i>` : ""}</li>`); } }
    // кадры с сервера (§14.I) без событий — короткая запись действий из moves.list: «→e4», «×d5», «★c3», «—»
    const L = hv?.replay?.rp || srvMv; if (!evs.length && L) { const t = L.turns.find((x) => x.turn === f.turn && x.side === f.cur);
      if (t) for (const a of L.list.filter((x: any) => +x.i >= t.from && +x.i < t.to).slice(-8)) evs.push(`<li class="mv-e mv-n" style="--pc:${raceCol(f.cur)}" data-f="${mi}">${ic(a.auto ? "clock" : "arrow")}<span>${esc(String(a.n ?? a.a?.type ?? "—"))}</span></li>`); }
    rows.push(`<div class="mv-t ${mi === cur || (cur >= from && cur <= mi) ? "on" : ""}" role="listitem"><button type="button" class="mv-jump" data-f="${mi}" style="--pc:${raceCol(f.cur)}"><b>${f.turn}</b><span class="mv-nk"></span><small>${evs.length ? evs.length + " соб." : "—"}</small></button>${evs.length ? `<ul>${evs.slice(-8).join("")}</ul>` : ""}</div>`);
    from = mi + 1; }
  const h = rows.reverse().join(""); if (box.dataset.h === h) return; box.dataset.h = h; box.innerHTML = h;
  box.querySelectorAll<HTMLElement>(".mv-jump").forEach((b, k) => { b.querySelector(".mv-nk")!.textContent = c.nick(F[+b.dataset.f!].cur); b.onclick = () => histOpen(+b.dataset.f!); });
  box.querySelectorAll<HTMLElement>(".mv-e").forEach((el) => (el.onclick = () => histOpen(+el.dataset.f!)));
  const on = box.querySelector<HTMLElement>(".mv-t.on"); if (on) box.scrollTop = Math.max(0, on.offsetTop - 4);
}
const passOf = (p: any): string[] => { const ps: any[] = (p?.pas || p?.passives || []) as any[]; const own = ps.map((x) => (typeof x === "string" ? x : x?.name || "")).filter(Boolean);
  if (own.length) return own.slice(0, 3); const g = (liveS || S)?.g, r = g?.races?.[p?.o]; if (!r) return [];
  try { return racePassives(cfgOf(S), r, null, p.o).filter((q) => q.effs?.some((f: any) => /atk|arm|dmg/.test(JSON.stringify(f)))).map((q) => q.name).slice(0, 2); } catch { return []; } };
function curRec(saved: boolean): Rec | null {
  const L = hv?.replay || null; if (L) return { ...L, saved };
  const base = liveS || S, F = rec.frames; if (!F.length || !base) return null; const g = F[F.length - 1].g;
  return { id: "loc-" + (base.code || "demo") + "-" + (F[0].at || Date.now()), code: base.code, at: Date.now(), races: g.races || [], nicks: (base.seats || []).map((x: any) => x?.nick || "?"), winner: base.result?.winner ?? null,
    turns: g.turn, you: base.you, map: rec.map, frames: F, saved };
}
/** §14.I lib_save {id, title?}: название до 60 символов; пустое — без названия, «Отмена» — не сохранять. */
function askTitle(def: string, ren = false): Promise<string | null> {
  const m = modal({ title: ren ? "Переименовать партию" : "Сохранить партию", icon: ren ? "pen" : "rp_save", cls: "small rptitle", sub: "Название увидите в «Библиотеке партий»",
    body: `<label class="fld"><span>Название (необязательно)</span><input type="text" maxlength="60" autocomplete="off" enterkeyhint="done"></label>`,
    acts: [{ label: "Отмена", cls: "ghost", val: false }, { label: "Сохранить", cls: "gold", val: true, icon: "rp_save" }] });
  const inp = m.el.querySelector("input")!; inp.value = def.slice(0, 60); inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); m.close(true); } }; setTimeout(() => { inp.focus(); inp.select(); }, 50);
  return m.done.then((v) => (v === true ? inp.value.trim().slice(0, 60) : null));
}
const defTitle = (r: { nicks?: string[]; turns?: number }) => `${(r.nicks || []).filter(Boolean).join(" — ") || "Партия"}${r.turns ? `, ${r.turns} ход.` : ""}`;
async function saveReplay() {
  const r0 = curRec(true); if (!r0) return; const title = await askTitle(r0.title || defTitle(r0)); if (title === null) return; const r = { ...r0, title: title || undefined };
  const rid = hv?.replay?.srv ? hv.replay.id : (liveS || S)?.replay?.id; // §14.I: id повтора = st.replay.id («КОД:старт_мс»)
  const sv = !demo && rid ? await hubReq("lib_save", { id: rid, ...(title ? { title } : {}) }) : { err: "local" };
  const okLocal = lsPut(r); if (hv) hv.saved = true; if (hv?.replay) hv.replay.saved = true; $("#histbar") && ($("#histbar")!.dataset.h = ""); renderHistBar();
  toast(!sv?.err ? "Партия сохранена в библиотеку" : sv.err === "lib_full" ? "Библиотека заполнена — уберите старые партии" : sv.err === "live" && okLocal ? "Партия ещё идёт — сохранено на этом устройстве" : okLocal ? "Сохранено на этом устройстве" : "Не удалось сохранить — мало места", !sv?.err || okLocal ? "good" : "bad", "save");
}
/** Партия кончилась — автоматически кладём в «Недавние» (локально). */
function keepRecent() { const r = curRec(false); if (r && r.frames.length > 1) lsPut(r); }
async function openReplay(id: string) {
  let r: Rec | null = lsGetRec(id);
  if (!r) r = await fetchReplay(id);
  if (!r) return toast("Повтор недоступен", "bad", "warn");
  document.getElementById("profdlg")?.remove(); document.getElementById("endscreen")?.remove(); document.getElementById("libdlg")?.remove(); histOpen(0, r);
}
/** §14.I HTTP: GET /strat/replay?id= → {meta, log, moves:{turns:[{turn,side,from,to}], list:[{i,…,dt}]}, rulesChanged}; кадры на конец каждого полухода (&i=turns[k].to, по 6 параллельно) —
 *  для шагов и перемотки; между ними при автопроигрывании — пакеты &from=&to= (rpFrame). */
async function fetchReplay(id: string): Promise<Rec | null> {
  const get = (q: string) => fetch(HTTP + "/strat/replay?id=" + encodeURIComponent(id) + q).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const j: any = await get(""); if (!j?.meta) return null; const meta = j.meta, turns: any[] = (Array.isArray(j.moves?.turns) ? j.moves.turns : []).filter((t: any) => Number.isFinite(+t?.to)).slice(0, 400);
  const idx = [0, ...turns.map((t) => +t.to)], out: any[] = new Array(idx.length); let div: number | null = null;
  for (let k = 0; k < idx.length; k += 6) await Promise.all(idx.slice(k, k + 6).map(async (i, o) => { const f: any = await get("&i=" + i); if (f?.frame) out[k + o] = { frame: f.frame, turn: turns[k + o - 1]?.turn, i };
    const d = f?.diverged; if (d != null && d !== false && Number.isFinite(+d) && +d >= 0 && (div == null || +d < div)) div = +d; }));
  const ok = out.filter(Boolean), F = framesFrom(ok); if (!F.length || F.length !== ok.length) return null; const it = itemFrom(meta, !!meta.saved)!;
  const rp: RpInfo = { id, n: +(j.log?.n ?? j.moves?.list?.length ?? 0), idx: ok.map((x) => +x.i), turns: turns.map((t) => ({ turn: +t.turn, side: +t.side, from: +t.from, to: +t.to })),
    list: (Array.isArray(j.moves?.list) ? j.moves.list : []).map((a: any) => ({ i: +a.i, side: a.side, n: a.n, dt: a.dt, auto: a.auto })), rulesChanged: !!j.rulesChanged, div };
  return { ...it, frames: F, rp, map: j.log?.map ?? F[0].g.map, nicks: it.nicks.length ? it.nicks : (F[0].g.races || []).map((_: any, i: number) => "Игрок " + (i + 1)) };
}
function libDeps() { return { html: () => libHtml(null, { crest, loading: true }), bind: (el: HTMLElement) => { loadLib(el); } }; }
/** ?menudemo: ответ lib_list в форме рабочей ветки сервера (ReplayMeta), только для скриншотов меню. */
function demoLib() { const now = Date.now(), H = 3600e3, m = (id: string, ago: number, races: string[], nicks: string[], winner: number | null, turns: number, size: number, rated: boolean, saved: boolean, title?: string) => ({ id, code: id.slice(-4).toUpperCase(), at: now - ago, end: now - ago, races, nicks, winner, turns, size, league: size <= 9 ? "fast" : "normal", rated, saved, title });
  return { type: "lib", recent: [m("r_demo_a1", 2 * H, ["fire", "ice"], ["Алекс", "Мира"], 0, 41, 8, true, false), m("r_demo_a2", 26 * H, ["water", "stone", "nature", "lightning"], ["Алекс", "Горн", "Ласка", "Бот"], 2, 77, 15, false, false), m("r_demo_a3", 50 * H, ["lightning", "fire"], ["Алекс", "Сайфер"], 1, 29, 5, true, false)],
    saved: [m("r_demo_s1", 9 * 24 * H, ["nature", "ice"], ["Алекс", "Тень"], 0, 63, 15, true, true, "Камбэк через Великое чудо")], keepDays: 7, saveMax: 20 }; }
async function loadLib(el: HTMLElement) {
  const local = lsList(); const j = menuDemo ? demoLib() : demo ? { err: "demo" } : await hubReq("lib_list"); const srv = libFrom(j);
  const merge = (a: LibItem[], b: LibItem[]) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))].sort((x, y) => y.at - x.at);
  // сервер ответил → только его списки (r3: локальная копия — лишь когда сервера нет: демо/офлайн/гость)
  const lib = srv ? { saved: srv.saved, recent: srv.recent, keepDays: srv.keepDays, saveMax: srv.saveMax, recentMax: srv.recentMax } : { saved: merge([], local.filter((x) => x.saved)), recent: merge([], local.filter((x) => !x.saved)) };
  el.innerHTML = libHtml(lib, { crest, offline: !srv }); const all = [...lib.saved, ...lib.recent];
  el.querySelectorAll<HTMLElement>(".lib-n").forEach((n) => { const it = all.find((x) => x.id === n.dataset.i); n.textContent = it?.title ? it.title + " — " + it.nicks.join(" · ") : it ? (it.nicks.length ? it.nicks.join(" · ") : "Партия") + (it.winner != null && it.nicks[it.winner] ? ` — победа: ${it.nicks[it.winner]}` : "") : "Партия"; });
  el.querySelectorAll<HTMLButtonElement>("[data-lib]").forEach((b) => (b.onclick = async () => { const id = b.dataset.id!, k = b.dataset.lib;
    if (k === "open") return openReplay(id);
    if (k === "del") { lsDel(id); if (!demo && !menuDemo && !id.startsWith("loc-")) { const e: any = await hubReq("lib_unsave", { id }); if (e?.err) toast(ERR[e.err] || "Не удалось убрать", "bad", "warn"); } }
    if (k === "ren") { const it = all.find((x) => x.id === id); const title = await askTitle(it?.title || defTitle(it || {}), true); if (title === null) return;
      const r = lsGetRec(id); if (r) lsPut({ ...r, saved: true, title: title || undefined });
      if (!demo && !menuDemo && !id.startsWith("loc-")) { const e: any = await hubReq("lib_rename", { id, title }); if (e?.err) toast(ERR[e.err] || "Не удалось переименовать", "bad", "warn"); } }
    if (k === "save") { const r = lsGetRec(id), it = all.find((x) => x.id === id); const title = await askTitle(it?.title || defTitle(it || r || {})); if (title === null) return;
      if (r) lsPut({ ...r, saved: true, title: title || undefined }); if (!demo && !menuDemo && !id.startsWith("loc-")) { const e: any = await hubReq("lib_save", { id, ...(title ? { title } : {}) }); if (e?.err) toast(ERR[e.err] || "Не удалось сохранить", "bad", "warn"); } }
    loadLib(el); }));
}

// ---------- экран конца партии ----------
// r3: сервер (match.ts ratingView) шлёт в st.rating = {league: quick|normal|tactical, unrated, seats:[{rating, delta, xp, coins}]}
const LG_UI: Record<string, string> = { quick: "fast", normal: "normal", tactical: "tactic" };
function myRating(me: number) {
  const old = S.result?.rating?.[me]; if (old) return old; const R = S.rating, c = R?.seats?.[me];
  if (!c || typeof c.delta !== "number") return null; return { league: LG_UI[R.league] || R.league, delta: c.delta, after: c.rating, before: (c.rating ?? 0) - c.delta };
}
function patchEndRating() {
  const f = document.querySelector("#endscreen .es-foot"), me = S?.you; if (!f || !(me >= 0) || f.querySelector(".rdelta")) return; const h = ratingDelta(myRating(me)); if (!h) return;
  const sc = f.querySelector(".es-score"); if (sc) sc.insertAdjacentHTML("afterend", h); else f.insertAdjacentHTML("afterbegin", h);
}
const endReason = (win: boolean, draw_: boolean, me: number) => { const r = S.result?.reason; if (me >= 0 && !win && !draw_ && r === "forfeit") return "Вы сдались"; if (me >= 0 && !win && !draw_ && r === "disconnect") return "Вы не вернулись вовремя"; return REASON[r] || r || ""; };
function showEnd() {
  if (!S?.g || S.phase !== "over") return; const me = S.you, w = S.result?.winner, g = S.g;
  const win = me >= 0 && w === me, draw_ = w === 2 || w == null, title = draw_ ? "Ничья" : me < 0 ? `Победил ${S.seats[w]?.nick || "?"}` : win ? "Победа" : "Поражение";
  const race = g.races[draw_ ? Math.max(0, me) : w] || "fire", G = gs()!, cfg = cfgOf(S), gl = goalsWithSticky(G, cfg);
  const stat = (i: number) => `<div class="es-side ${i === me ? "me" : ""}">${crest(g.races[i])}
    <b class="nick"></b><small class="cname"></small><div class="es-goals">${gl.sides[i].map((q) => { const d = goalDef(q); return `<i class="${q.done ? "on" : ""}" data-tip="${esc(d.name)}">${ic(d.icon)}</i>`; }).join("")}</div>
    <span class="es-n">${ic("glory")}${g.ec?.res?.[i]?.glory ?? 0} · ${ic("sword")}${g.pieces.filter((p: any) => p.o === i).length}</span></div>`;
  const m = modal({ id: "endscreen", title, icon: win ? "crown" : draw_ ? "scales" : "skull", cls: "endscreen " + (win || me < 0 ? "win" : draw_ ? "draw" : "lose"), dismiss: true,
    sub: esc(endReason(win, draw_, me)),
    body: `<div class="es-hero"><img src="${unitArt(race, "king")}" alt="" data-rmerr></div>
      <p class="es-chief"></p><div class="es-sides">${stat(0)}<span class="vs">VS</span>${stat(1)}</div>
      <div class="es-foot"><div class="es-score" data-tip="Выполнено целей"><small>Цели</small><b>${gl.sides[Math.max(0, me)].filter((q) => q.done).length}–${gl.sides[me === 1 ? 0 : 1].filter((q) => q.done).length}</b></div>${me >= 0 ? ratingDelta(myRating(me)) : ""}${S.ranked ? "" : `<small class="muted">Партия без рейтинга</small>`}</div>`,
    acts: [{ label: "В меню", cls: "ghost", val: "menu", icon: "back" }, { label: "К доске", cls: "", val: "board", icon: "eye" }, ...(rec.frames.length > 1 ? [{ label: "Повтор", cls: "", val: "replay", icon: "hist" }] : []), ...(me >= 0 ? [{ label: S.seats[me]?.rematch ? "Ждём соперника…" : "Реванш", cls: "gold", val: "rematch", icon: "refresh", id: "es-rematch" }] : [])] });
  m.el.querySelectorAll<HTMLElement>(".es-side").forEach((el, i) => { el.querySelector(".nick")!.textContent = S.seats[i]?.nick || "?"; el.querySelector(".cname")!.textContent = "Вождь " + chiefName(i); });
  m.el.querySelector(".es-chief")!.textContent = draw_ ? "" : `Вождь ${chiefName(w)} ведёт ${RACE_NAME[g.races[w]] || ""} к победе`;
  keepRecent();
  m.done.then((v: any) => { if (v === "rematch") send({ type: "rematch" }); if (v === "menu") leaveMatch(); if (v === "replay") { const r = curRec(false); if (r) histOpen(0, r); } });
}
/** «Чёрный список»: первые Вожди соперников стороны side. */
function openBlacklist(side: number) {
  if (!S?.g) return; const g = S.g, rows = blacklistOf(S, g, side), mine = side === S.you, nm = (i: number) => S.seats[i]?.nick || "?";
  const m = modal({ id: "blacklist", title: "Чёрный список", icon: "skull", cls: "blacklist", sub: `${mine ? "Ваши цели" : "Цели: " + esc(nm(side))} · ${rows.filter((r) => r.dead).length}/${rows.length}`,
    body: `<div class="bl-list">${rows.map((r) => `<div class="bl-row ${r.dead ? "dead" : "alive"}" style="--pc:${raceCol(r.side)}"><span class="bl-port"><img src="${unitArt(g.races[r.side], "king")}" alt="" data-rmerr></span>
      <span class="bl-crest">${crest(g.races[r.side])}</span><div class="bl-b"><b class="bl-name"></b><small class="bl-who"></small><span class="bl-st"></span></div>${r.dead ? `<span class="bl-x" aria-hidden="true"></span>` : `<span class="bl-tag">${ic("eye")}В строю</span>`}</div>`).join("")}</div>
      <p class="bl-note">${ic("warn")}<span>В счёт идёт только <b>первый</b> Вождь каждого соперника. Вожди, возрождённые после гибели, в список не попадают.${modeOf(S) === "2v2" ? " Счёт общий у команды: убить может любой союзник." : ""}</span></p>` });
  m.el.querySelectorAll<HTMLElement>(".bl-row").forEach((el, k) => { const r = rows[k];
    { const cn = r.name || chiefName(r.side); el.querySelector(".bl-name")!.textContent = /^вожд/i.test(cn) ? cn : "Вождь " + cn; } el.querySelector(".bl-who")!.textContent = `${nm(r.side)} · ${RACE_NAME[g.races[r.side]] || ""}`;
    el.querySelector(".bl-st")!.textContent = r.dead ? `пал на ${r.turn ?? "?"}-м ходу${r.by === S.you && !r.byNick ? " — сражён вами" : r.by != null || r.byNick ? ", убил " + (r.byNick || nm(r.by!)) : ""}` : "жив — главная цель"; });
}
async function leaveMatch() {
  if (hv?.replay) return goLive(); if (hv) goLive();
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
/** Рейтинг места в лиге карты (догадка: seat.rating | seat.r, seat.prov). Боты/гости — без рейтинга. */
function seatRating(s: any) { const r = s?.rating ?? s?.r; if (s?.bot || r == null || !isFinite(+r)) return "";
  const L = leagueOf(S.size); return `<span class="srat l-${L}" data-tip="Рейтинг: ${esc(leagueName(S.size))} лига"><img src="/strat/ui2/leagues/league_${L}_64.png" alt=""><b>${Math.round(+r)}</b>${s.prov ? '<img class="prov" src="/strat/ui2/badges/provisional_mark.png" alt="временный">' : ""}</span>`; }
function seatHtml(i: number) {
  const s = S.seats[i], me = S.you;
  if (!s) return `<div class="seatcard empty"><span class="crest unk">${ic("user")}</span><div><b>Ждём соперника…</b><small>Отправьте код или ссылку</small></div></div>`;
  const race = s.race ? crest(s.race) : `<span class="crest unk">${ic(s.picked ? "check" : "user")}</span>`;
  return `<div class="seatcard ${i === me ? "me" : ""} ${s.ready ? "ready" : ""}">${race}<div><b class="nick"></b><small>${s.bot ? "бот" : s.guest ? "гость" : "игрок"}${i === 0 ? " · хост" : ""}${s.race ? " · " + RACE_NAME[s.race] : s.picked ? " · раса выбрана" : ""}</small>${isAway(s) ? `<span class="away">${ic("warn")}Игрок не за столом</span>` : ""}</div>
    <span class="rdy">${s.ready ? ic("check") + "Готов" : "Не готов"}</span>${seatRating(s)}</div>`;
}
/** Только числа и особые свойства — никаких подсказок «для какой тактики» раса. */
/** Размер поля для чисел расы: партия → лобби → 8. */
const raceSize = () => +(S?.g?.size || S?.size || 8);
/** Подсказка расы с числами лиги этого поля (как tipRace сервера: describeEffects(raceEffects(cfg, race, size))). */
export const tipRace = (r: string, size = raceSize()) => { try { return describeEffects(raceEffects(cfgOf(S), r, size)); } catch { return ""; } };
function raceTraits(r: string): string[] {
  const c: any = raceNums(cfgOf(S), r, raceSize()), t: string[] = [];
  if (c.hpMul && c.hpMul !== 1) t.push(`Здоровье фигур ×${c.hpMul}`);
  if (c.atk) t.push(`Атака ${c.atk > 0 ? "+" : ""}${c.atk}`); if (c.arm) t.push(`Броня ${c.arm > 0 ? "+" : ""}${c.arm} всем`); if (c.rookAtk) t.push(`Страж: атака ${c.rookAtk > 0 ? "+" : ""}${c.rookAtk}`);
  if (c.burnTurns) t.push(`Поджог: −${c.burnDmg} HP, ${c.burnTurns} хода`); if (c.chillTurns) t.push(`Обморожение: цель ходит на ${c.chillMove}`); if (c.knowPen) t.push(`Знания −${c.knowPen} за ход`);
  if (r === "water") t.push("Проходит по воде"); if (r === "stone") t.push("Проходит через горы");
  return t.length ? t.slice(0, 3) : ["Без особых свойств"];
}
const sizeLabel = (n: number) => (n <= 5 ? "дуэль" : n <= 8 ? "быстрая" : n <= 15 ? "большая" : n <= 40 ? "тактическая" : "эпос");
function renderLobby() {
  const me = S.you, host = me === 0, seats = S.seats;
  renderSlots($("#slots"), $("#modes"), S, { me, host, seatHtml, send, raceCol: raceBase });
  renderLobbyLeague();
  const rc = $("#races"), drawL = !!S.ranked, rdv = $("#racedraw");
  rc.hidden = drawL; rdv.hidden = !drawL; $("#racehdr").textContent = drawL ? "Раса — жребием" : "Выберите расу";
  $("#racesub").textContent = drawL ? "Рейтинговая партия: выбора расы нет, жребий у всех одновременно на старте." : "Соперник увидит вашу расу только на старте партии.";
  if (drawL) { const h = lobbyDrawHtml(S, raceD(), isGuest); if (rdv.dataset.h !== h) { rdv.dataset.h = h; rdv.innerHTML = h; const fe = rdv.querySelector<HTMLButtonElement>("[data-favedit]"); if (fe) fe.onclick = () => openFavDlg(); } }
  if (rc.dataset.built !== String(raceSize())) { rc.dataset.built = String(raceSize()); rc.innerHTML = RACES.map((r) => `<button class="racecard r-${r}" data-race="${r}">
      <span class="rc-art"><img class="cr" src="/strat/ui/crests/crest_${r}.png" alt=""><img class="k" src="${unitArt(r, "king")}" alt="" data-rmerr><img class="a" src="${unitArt(r, "knight")}" alt="" data-rmerr><img class="b" src="${unitArt(r, "mage")}" alt="" data-rmerr></span>
      <span class="rc-name"><b>${RACE_NAME[r]}</b></span><span class="rc-word">${RACE_WORD[r] || ""}</span><ul class="rc-tr"></ul><span class="rc-pas pas-row">${racePassives(cfgOf(S), r, null, 0, raceSize()).map(pasIcon).join("")}</span><span class="rc-pick">${ic("check")}Выбрано</span></button>`).join("");
    for (const b of rc.querySelectorAll<HTMLButtonElement>("[data-race]")) b.onclick = () => send({ type: "race", race: b.dataset.race }); }
  for (const b of rc.querySelectorAll<HTMLButtonElement>("[data-race]")) { b.classList.toggle("on", seats[me]?.race === b.dataset.race); b.disabled = me < 0;
    const ul = b.querySelector(".rc-tr")!, tr = raceTraits(b.dataset.race!), tp = tipRace(b.dataset.race!); if (b.dataset.tip !== tp) b.dataset.tip = tp; if (ul.textContent !== tr.join("")) { ul.innerHTML = ""; for (const t of tr) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); } } }
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
    { const hh = $<HTMLInputElement>("#hhp"); hh.checked = !!S.hiddenHp && !lock; hh.disabled = !host || lock; $("#hhpwrap").classList.toggle("locked", lock); }
    $("#hostpanel").classList.toggle("ranked", lock); for (const b of $("#maps").querySelectorAll<HTMLButtonElement>("[data-map]")) if (lock && b.dataset.map !== "") b.disabled = true; }
  const rd = $<HTMLButtonElement>("#ready"); rd.querySelector("span")!.textContent = seats[me]?.ready ? "Не готов" : "Готов к бою"; rd.classList.toggle("on", !!seats[me]?.ready);
  rd.disabled = me < 0 || (!S.ranked && !seats[me]?.race);
  $("#hostpanel").classList.toggle("ro", !host);
  setStatus(me < 0 ? "Лобби заполнено — вы зритель" : !seats[1] ? "Отправьте ссылку или код сопернику" : !S.ranked && !seats[me]?.race ? "Выберите расу — соперник увидит её только на старте" : seats[me]?.ready ? "Ждём готовности соперника" : "Нажмите «Готов к бою»");
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
      b.innerHTML = `<span class="mc-fr"><span class="mc-pv"></span><b></b></span><small></small>`; // P2: map_card_frame — окно 208×136, табличка имени
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
  { const ag = document.getElementById("admgoals"); if (ag) mountAdminGoals(ag, { http: HTTP, auth: async () => { const h = await helloMsg(); return h.token ? { token: h.token } : h.userId ? { dev: h.userId } : {}; }, toast: (t, k) => toast(t, k as any) }); } // G (t1209)
}

// ---------- HUD ----------
const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
function racePas(side: number) { const g = S.g; return racePassives(cfgOf(S), g.races[side], gs(), side).map(pasIcon).join(""); }
/** Аудит п.2: узел Вождя → icon_chief_* / icon_skill_* (по id, иначе по эффекту). */
const SKILL_IC = new Set(["shieldwall", "trample", "fireball", "quake", "heroic"]);
const CHIEF_IC = new Set(["aura", "inspire", "rally", "tough", "zeal", "command", "levy", "banner", "slayer", "ult"]);
function chiefIc(n: any): string {
  const id = String(n?.id || ""); if (CHIEF_IC.has(id)) return "chief_" + id; if (SKILL_IC.has(id)) return "skill_" + id;
  const f = n?.hp ? "tough" : n?.ap ? "inspire" : n?.atk ? "command" : n?.arm ? "aura" : n?.ult ? "ult" : /HP|ОЗ/.test(n?.eff || "") ? "tough" : /ОД/.test(n?.eff || "") ? "inspire" : /АТК/.test(n?.eff || "") ? "command" : /БРН/.test(n?.eff || "") ? "aura" : "";
  return f ? "chief_" + f : n?.icon && /^[a-z_]+$/.test(n.icon) ? n.icon : "xp";
}
function chiefSkillsOf(p: any): string[] { return (p?.sk || p?.tal || []) as string[]; }
function skillPassive(id: string, side: number): Passive | null {
  const cfg = cfgOf(S), types = chiefTypes(cfg, S.g.races[side]); for (const t of types) { const n = t.tree.find((x) => x.id === id); if (n) {
    const raw: any = ((cfg.talents as any).king || []).flat().find((x: any) => x.id === id); if (raw) return talentPassive(raw, "king");
    return { key: "chief." + id, name: n.name, icon: "xp", effs: Array.isArray((n as any).effects) ? (n as any).effects : [], note: n.eff }; } }
  return null;
}
/** ОД не влезают в свою ячейку панели (узкая панель, много ОД) — уменьшаем значки, а не налезаем на соседние кнопки */
function fitPips(pe: HTMLElement) {
  const box = pe.closest<HTMLElement>(".apbox"); if (!box || !pe.offsetParent) return; pe.style.removeProperty("--pip");
  const eb = box.parentElement?.querySelector<HTMLElement>(":scope > .ecbar"), over = Math.max(box.scrollWidth - box.clientWidth, eb ? eb.scrollWidth - eb.clientWidth : 0);
  if (over <= 1) return; // соседняя полоса ресурсов (телефон-ландшафт) тоже считается: она не должна уезжать под ОД
  const n = pe.children.length, cols = getComputedStyle(pe).display === "grid" ? Math.ceil(n / 2) : n, gap = parseFloat(getComputedStyle(pe).columnGap) || 0;
  pe.style.setProperty("--pip", Math.max(6, Math.min(20, Math.floor((pe.offsetWidth - over - 2) / cols - gap))) + "px");
}
addEventListener("resize", () => document.querySelectorAll<HTMLElement>(".appips").forEach(fitPips));
function renderHud() {
  if (!S?.g) return; const g = S.g, me = S.you, myTurn = S.phase === "play" && g.cur === me, cfg = cfgOf(S), G = gs()!;
  const tnTxt = g.turnLimit > 0 ? `${g.turn}/${g.turnLimit}` : String(g.turn); $("#turnno").textContent = tnTxt; { const tn2 = $("#turnno2"); if (tn2) tn2.textContent = tnTxt; } // t1208: «ход N/лимит»
  { const mx = Math.max(g.apMax || 0, g.ap), pips = Array.from({ length: mx }, (_, i) => `<i class="${i < g.ap ? "on" : ""}"></i>`).join(""), tip = apTip(S, G, me);
    for (const [pid, tid] of [["#appips", "#aptxt"], ["#appips2", "#aptxt2"]]) { const pe = document.querySelector<HTMLElement>(pid); if (!pe) continue;
      pe.innerHTML = pips; pe.dataset.n = String(mx); pe.className = "appips" + (mx >= 7 ? " two" : mx >= 5 ? " two-narrow" : ""); pe.style.setProperty("--cols", String(Math.ceil(mx / 2))); const te = document.querySelector<HTMLElement>(tid); if (te) te.textContent = `${g.ap}/${mx}`;
      pe.closest<HTMLElement>(".apbox")?.setAttribute("data-tip", tip); fitPips(pe); } }
  $("#turnbox").classList.toggle("mine", myTurn); $("#turnwho").textContent = S.phase === "over" ? "Партия окончена" : myTurn ? "Ваш ход" : me < 0 ? "Ходит " + (S.seats[g.cur]?.nick || "?") : "Ход соперника";
  { const w2 = document.getElementById("turnwho2"); if (w2) { w2.textContent = $("#turnwho").textContent; w2.classList.toggle("mine", myTurn); } }
  const glP = goalsWithSticky(G, cfg);
  renderPlayers($("#score"), S, { me, col: raceCol, crest, raceName: RACE_NAME, glory: (i) => g.ec?.res?.[i]?.glory ?? 0, pas: racePas,
    goals: (i) => { const q = glP.sides?.[i]; return q ? { done: q.filter((x: any) => x.done).length, need: glP.need } : null; } });
  { const opp = S.seats.findIndex((s: any, i: number) => i !== me && !allies(S, me, i) && isAway(s) && (s.skips ?? s.missed ?? 0) >= 5); const cl = $("#claim");
    cl.hidden = !(me >= 0 && S.phase === "play" && opp >= 0); }
  renderLvDock(ectx(), $("#lvdock"), () => setTimeout(render, 0)); chatShow(me >= 0 && S.phase !== "lobby", modeOf(S) === "2v2");
  const gl = goalsWithSticky(G, cfg), gb = $("#goals");
  { const order = [...gl.sides.keys()].filter((i) => S.seats[i]).sort((x, y) => (x === me ? -1 : y === me ? 1 : allies(S, me, x) === allies(S, me, y) ? x - y : allies(S, me, x) ? -1 : 1));
    const many = order.length > 2, total = Math.max(...gl.sides.map((r) => r.length), 1);
    gb.className = "goals" + (many ? " many" : "");
    gb.innerHTML = `<div class="gl-h"><span>Цели</span><small>${gl.need} из ${total} — победа</small></div>` + order.map((side) => { const done = gl.sides[side].filter((q) => q.done).length;
      const who = side === me ? "Вы" : S.seats[side]?.nick || (me >= 0 && !allies(S, me, side) ? "Враг" : "Союзник");
      return `<div class="gl-row ${side === me ? "me" : ""}" style="--pc:${raceCol(side)}"><span class="gl-who" title="${esc(who)}"><i class="gl-sw"></i>${esc(who)}</span>${gl.sides[side].map((q) => { const d = goalDef(q), pct = q.max ? Math.min(1, q.v / q.max) : 0;
        const prog = q.text ? esc(q.text) : !q.done && q.max > 1 ? `${q.v} / ${q.max}${q.unit ? " " + esc(q.unit) : ""}` : "";
        const parts = (q.parts || []).map((r) => `<br>· ${esc(r.label)}: ${r.cur}/${r.max}`).join("");
        const tip = esc(`<b>${esc(d.name)}</b><br>${esc(d.hint)}${prog ? `<br><span class="tipv">${prog}</span>` : ""}${parts}${q.done ? `<br><span class="tipv good">Выполнено${q.turn ? " на ходу " + q.turn : ""}</span>` : ""}`);
        if (q.id === "chief") return `<button type="button" class="goal bl ${q.done ? "done" : ""}" data-bl="${side}" style="--p:${q.done ? 1 : pct}" data-tip="${tip}" aria-label="${esc(d.name)}">${ic(d.icon)}<em class="gprog">${q.v}/${q.max}</em></button>`;
        return `<button type="button" class="goal ${q.done ? "done" : ""}" style="--p:${q.done ? 1 : pct}" data-tip="${tip}" aria-label="${esc(d.name)}">${ic(d.icon)}</button>`; }).join("")}<b class="gl-n">${done}/${gl.need}</b></div>`; }).join(""); }
  const cb = $("#chief");
  if (me < 0) { cb.hidden = true; } else { cb.hidden = false; const ch = chiefOf(S, G, me, cfg), race = g.races[me];
    if (!ch.p) { cb.className = "chief dead"; cb.innerHTML = `<span class="ch-port"><img src="${unitArt(race, "king")}" alt="" data-rmerr>${ic("skull", "ch-skull")}</span>
        <div class="ch-b"><b>Вождь пал</b><small class="ch-rs">${ch.respawn ? `Новый Вождь через ${ch.respawn} ${plural(ch.respawn, "ход", "хода", "ходов")}` : "Ожидает возрождения"}</small><span class="ch-pen">${ic("apoff")}−1 ОД, пока нет Вождя</span></div>`; }
    else { cb.className = "chief" + (ch.pend ? " pend" : "") + (S.check?.[me] ? " danger" : ""); const pct = ch.next ? Math.min(100, ((ch.xp - ch.prev) / Math.max(1, ch.next - ch.prev)) * 100) : 100;
      const pas = chiefSkillsOf(G.pieces.find((q) => q.id === ch.p!.id)).map((id) => pasIcon(skillPassive(id, me))).join("");
      cb.innerHTML = `<span class="ch-port" data-tip="Переименовать Вождя"><img src="${unitArt(race, "king")}" alt="" data-rmerr><em class="ch-lv">${ch.lv}</em></span>
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
        <span class="tn-h">${ic(chiefIc(n))}<b>${esc(n.name)}</b>${s.st === "got" ? `<span class="stamp">${ic("check")}</span>` : s.st === "closed" ? `<span class="stamp x">${ic("close")}</span>` : ""}</span><small>${esc(n.eff)}</small>${s.why && s.st !== "got" ? `<em>${s.st === "closed" ? ic("close") : ic("lock")}${esc(s.why)}</em>` : ""}</button>`; }).join("") : `<span class="muted">Навыки этого уровня появятся позже</span>`}</div></div>`; }).join("")}</div>`;
  const m = modal({ id: "chiefdlg", title: `${type?.name || "Вождь"} · древо навыков`, icon: "crown", cls: "chiefdlg" + (auto ? " lvup" : ""),
    sub: (auto ? "Новый уровень! " : `Уровень ${ch.lv} из ${ch.maxLv}. `) + `Очков навыка: ${points}. Выбор навсегда закрывает соседний узел.`, body });
  const nm = document.createElement("p"); nm.className = "ct-name"; nm.textContent = "Вождь " + chiefName(me); m.el.querySelector(".dlg-h div")!.appendChild(nm);
  m.el.querySelectorAll<HTMLButtonElement>("[data-skill]").forEach((b) => (b.onclick = (e) => { if (b.getAttribute("aria-disabled")) return; e.stopPropagation(); const id = b.dataset.skill!;
    // сейчас сервер принимает выбор как талант Вождя; при появлении отдельного действия навыков (ТЗ §14) — «skill»
    send({ type: "act", act: (cfg as any).chiefs || (cfg as any).chiefTypes ? { a: "skill", id: ch.p!.id, s: id } : { a: "talent", id: ch.p!.id, t: id } }); m.close(true); }));
}

/** t1202: доход постройки карты — из правил (econ.struct / ruins / obelisk), не из текста. */
function structInc(st: string) { const E: any = (cfgOf(S) as any).econ || {}, r = E.struct?.[st], parts: string[] = [];
  const add = (o: any, tail = "") => { if (!o) return; if (o.gold) parts.push(`+${o.gold} золота`); if (o.know) parts.push(`+${o.know} знаний`); if (o.glory) parts.push(`+${o.glory} Славы`); if (o.growth) parts.push(`+${o.growth} роста`); if (parts.length && tail) parts[parts.length - 1] += tail; };
  if (r) add(r, " за ход на своей земле"); else if (st === "R" && E.ruins) add(E.ruins, " разово первому вошедшему"); else if (st === "X" && E.obelisk) add(E.obelisk, " за ход, пока стоит своя фигура");
  return parts.length ? ` · ${esc(parts.join(", "))}` : ""; }
/** t1202: чья клетка, город на ней (уровень, постройки, рост) и можно ли её купить — из состояния партии. */
function cellOwnerInfo(x: number, y: number) {
  const g = S?.g, G = gs(); if (!g || !G?.ec) return ""; const n = g.size, T = worldT(), o = T[y * n + x], me = S.you, cfg: any = cfgOf(S);
  const who = (sd: number) => (sd === me ? "ваша" : `соперника (${RACE_NAME[g.races[sd]] || "?"})`);
  let h = `<span class="ci-t">${ic("flag")}<b>${o >= 0 ? "Земля: " + who(o) : "Нейтральная земля"}</b></span>`;
  const ct: any = G.ec.cities.find((c) => c.x === x && c.y === y);
  if (ct) { const thr: number[] = cfg.econ?.city?.growthThr || [], nx = thr[ct.lvl], C0 = cfg.econ?.city || {};
    const inc = ct.cap ? `+${C0.capGold ?? 0} золота, +${C0.capKnow ?? 0} знаний` : `+${C0.outGold ?? 0} золота`;
    const bl = (ct.bld || []).map((b: string) => bName(b, g.races[ct.owner] || "")).join(", ");
    h += `<span class="ci-t">${ic("castle")}<b>${esc(cityName(G, ct.id))} · ${ct.cap ? "столица" : "застава"} ${ct.owner === me ? "(ваша)" : "(соперника)"}</b></span>
      <small>Уровень ${(ct.lvl ?? 0) + 1}${ct.cap && nx != null ? ` · рост ${ct.growth ?? 0}/${nx} до ур. ${(ct.lvl ?? 0) + 2}` : ""} · доход ${esc(inc)} за ход${bl ? ` · постройки: ${esc(bl)}` : " · построек нет"}</small>`; }
  const buy = me >= 0 && S.phase === "play" ? (S.terr?.cities || []).find((q: any) => q.ready && q.cells?.some(([a, b]: number[]) => a === x && b === y)) : null;
  if (buy) h += `<small class="ci-buy">${ic("coin")}Можно купить для «${esc(cityName(G, buy.city))}» · ${buy.cost ?? "?"} золота${buy.left ? ` (бесплатно через ${buy.left} х.)` : ""}</small>`;
  else if (o < 0) h += `<small>Не куплена: свои клетки покупают у границы своей земли, когда городу доступна покупка</small>`;
  return h; }
// ---------- карточка выбранного ----------
function renderInfo() {
  const box = $("#info"); const g = S?.g; const p = g && sel != null ? g.pieces.find((q: any) => q.id === sel) : null;
  const m: MapData | undefined = g?.map, at = p ? [p.x, p.y] : selCell;
  document.body.classList.toggle("selinfo", !!(p || at) && !(hv && hv.replay));
  if (!p && !at) { box.className = "info idle"; box.innerHTML = `<div class="empty">${ic("target")}<span>Выберите фигуру: золото — ход, красное — атака. Пустая клетка — описание местности.</span></div>`; return; }
  let h = ""; const cfg = cfgOf(S);
  if (p) { const race = g.races[p.o], P = gs()!.pieces.find((q) => q.id === p.id)!, lv = pieceLv(ectx(), P);
    const nm = p.k === "king" ? "Вождь" : KIND_NAME[p.k as Kind];
    const pas = [...(P.tal || []).map((t) => { const raw = ((cfg.talents as any)[P.kind] || []).flat().find((x: any) => x.id === t); return raw ? pasIcon(talentPassive(raw, P.kind)) : ""; }), racePas(p.o)].join("");
    h += `<div class="uc-h"><span class="uc-port r-${race}"><img src="${unitArt(race, p.k)}" alt="" data-rmerr></span><div><b class="uc-name">${nm}</b><small class="uc-sub"></small>
        ${p.hp == null && p.hs ? `<div class="hsbar hs-${p.hs}" data-tip="Скрытое здоровье: видна только ступень">${ic("hs_" + p.hs)}<img src="/strat/ui2/frames/hp_bar_enemy_${esc(p.hs)}.png" alt=""><span>${HS_NAME[p.hs] || "?"}</span></div>` : `<div class="meter hp"><i style="width:${(p.hp / p.mh) * 100}%"></i><span>${p.hp} / ${p.mh}</span></div>`}</div></div>
      <div class="uc-stats"><span data-tip="Атака с учётом бонусов">${ic("sword")}<b>${p.ea ?? p.atk}</b></span><span data-tip="Броня с учётом бонусов">${ic("shield")}<b>${p.er ?? p.arm}</b></span><span data-tip="Уровень">${ic("xp")}<b>${lv.lv}</b></span>${p.b ? `<span class="neg" data-tip="Горит ещё ${p.b} ${plural(p.b, "ход", "хода", "ходов")}">${ic("burn")}<b>${p.b}</b></span>` : ""}${p.c ? `<span class="cold" data-tip="Обморожен">${ic("chill")}</span>` : ""}${p.a ? `<span class="muted" data-tip="Уже действовал">${ic("check")}</span>` : ""}</div>
      ${lv.next ? `<div class="meter xp sm" data-tip="Опыт ${lv.xp} / ${lv.next}"><i style="width:${Math.min(100, ((lv.xp - lv.prev) / Math.max(1, lv.next - lv.prev)) * 100)}%"></i></div>` : ""}
      ${pas ? `<div class="pas-row">${pas}</div>` : ""}`;
    if (S.phase === "play" && p.k !== "king") { const a = pieceActs(ectx(), P); if (a) h += `<div class="uc-acts">${a}</div>`; h += abilityBar(ectx(), P, p); }
    if (S.phase === "play" && p.k === "king" && p.o === S.you) h += chiefActs(P);
    if (S.phase === "play" && p.o === S.you && !p.a) { const rz = razeTargets(S, gs()!, P); if (rz.length) h += `<div class="uc-acts raze"><small>${ic("target")}Удар по постройке</small>${rz.flatMap((t) => t.b.map((b) => `<button class="btn sm red" data-raze="${t.city}" data-b="${esc(b)}">${ic("sword")}<span>${esc(b === "watchtower" ? "Башня" : bName(b, g.races[1 - S.you] || ""))}${t.tower ? "" : " · " + esc(cityName(gs()!, t.city))}</span></button>`)).join("")}</div>`; }
  }
  if (m && at) { const [x, y] = at, t = m.t[y * m.size + x], st = m.s[y * m.size + x], tn = (TERRAIN as any)[t]?.name || t;
    const tp = terrainPassive(t, tn), sp = st !== "." ? structPassive(st, (STRUCT as any)[st]) : null;
    h += `<div class="cellinfo"><span class="ci-t">${ic(t === "f" ? "leaf" : t === "w" ? "wave" : t === "m" ? "mountain" : t === "#" ? "wall" : "map")}<b>${esc(tn)}</b>${pasIcon(tp)}</span>${terrEff(t) ? `<small>${terrEff(t)}</small>` : ""}
      ${sp ? `<span class="ci-t">${ic("castle")}<b>${esc(sp.name)}</b>${pasIcon(sp)}</span><small>${structInc(st) ? structInc(st).slice(3) : esc(String((STRUCT as any)[st]?.eff || "").replace(/\s*\(этап \d+\)/g, ""))}</small>` : ""}${cellOwnerInfo(x, y)}</div>`; }
  h = `<button type="button" class="info-x" data-infox aria-label="Снять выбор">${ic("close")}</button><button type="button" class="info-min" data-infomin aria-label="Свернуть карточку" aria-pressed="${document.body.classList.contains("infomin")}">${ic("chevron")}</button>` + h;
  box.className = "info" + (p && S.phase === "play" && p.o === S.you ? " mine" : ""); box.innerHTML = h;
  box.querySelector<HTMLElement>("[data-infox]")!.onclick = () => { sel = null; selCell = null; renderInfo(); draw(); };
  if (!box.dataset.swipe) { box.dataset.swipe = "1"; let y0 = -1; // t1202: смахнуть шторку вниз — закрыть
    box.addEventListener("touchstart", (e) => { y0 = box.scrollTop <= 0 ? e.touches[0].clientY : -1; }, { passive: true });
    box.addEventListener("touchend", (e) => { if (y0 >= 0 && e.changedTouches[0].clientY - y0 > 60 && sheetMode()) { sel = null; selCell = null; renderInfo(); draw(); } y0 = -1; }, { passive: true }); }
  box.querySelector<HTMLElement>("[data-infomin]")!.onclick = (e) => { const on = document.body.classList.toggle("infomin"); localStorage.setItem("strat.infomin", on ? "1" : ""); (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(on)); requestAnimationFrame(liftForSheet); };
  requestAnimationFrame(liftForSheet);
  if (p) { const sub = box.querySelector(".uc-sub"); if (sub) sub.textContent = (p.o === S.you ? "Ваш" : "Враг") + (p.k === "king" ? " · " + chiefName(p.o) : " · " + (RACE_NAME[g.races[p.o]] || ""));
    const P = gs()!.pieces.find((q) => q.id === p.id)!; bindPieceActs(ectx(), P, box); bindChiefActs(P, box);
    box.querySelectorAll<HTMLButtonElement>("[data-raze]").forEach((b) => (b.onclick = () => send({ type: "act", act: { a: "raze", id: P.id, city: +b.dataset.raze!, b: b.dataset.b } })));
    bindAbilityBar(ectx(), P, p, box, (a) => startAim({ id: a.id, pid: a.pid, r: a.r, race: g.races[p.o], chief: false })); }
}
/** Действия Вождя: «Построить» (выбор постройки → клетка для башни) и «Основать поселение» (многоходовое). */
function chiefActs(P: any): string {
  const G = gs()!, me = S.you, my = G.cur === me && !P.acted && G.ap > 0, ec: any = G.ec; if (!ec) return "";
  const f = Array.isArray(ec.fnd) ? ec.fnd[me] : S.terr?.fnd, total = S.league?.found ?? (cfgOf(S) as any).econ?.found?.turns ?? 10;
  const found = f && f.left != null ? `<div class="fnd"><span class="fring" style="--p:${Math.round((1 - f.left / total) * 100)}"></span><span>Поселение: ещё ${f.left} ${plural(f.left, "ход", "хода", "ходов")}</span><button class="btn sm ghost" data-ca="found_cancel">${ic("close")}<span>Отменить</span></button></div>`
    : `<button class="btn sm" data-ca="found" ${my ? "" : "disabled"} data-tip="${esc(`Вождь остаётся на клетке ${total} ${plural(total, "ход", "хода", "ходов")} и основывает поселение. Уход или гибель — отмена.`)}">${ic("outpost")}<span>Основать поселение</span></button>`;
  return `<div class="uc-acts chiefacts"><button class="btn sm gold" data-ca="build" ${my ? "" : "disabled"}>${ic("build")}<span>Построить</span></button>${found}</div>`;
}
function bindChiefActs(P: any, box: HTMLElement) {
  box.querySelectorAll<HTMLButtonElement>("[data-ca]").forEach((b) => (b.onclick = async () => { const k = b.dataset.ca!;
    if (k === "found") return send({ type: "act", act: { a: "found", id: P.id } });
    if (k === "found_cancel") return send({ type: "act", act: { a: "found_cancel", id: P.id } });
    const G = gs()!, T = worldT(), list = buildChoices(ectx(), P, T);
    const pick = await choiceDlg("Построить", "Вождь строит на своей земле — постройка достаётся ближайшему городу. Башню — рядом с Вождём, в том числе за границей.", list.map((o) => ({ id: o.id, title: o.title, text: o.text, icon: o.icon, img: o.img, foot: o.foot, disabled: o.off, attrs: o.img ? 'data-art="1"' : 'data-ph="1"' })), "builds");
    if (!pick) return;
    if (pick === "watchtower") { W.mode = { k: "build", b: pick, tower: true }; renderHint(); draw(); return; }
    let kind: string | undefined; if (pick === "forge") { const kk = await choiceDlg("Кузня", "Какому типу фигур дать +1 АТК?", (Object.keys(KIND_NAME) as Kind[]).map((q) => ({ id: q, title: KIND_NAME[q], img: unitArt(G.races[S.you], q), text: "+1 АТК" })), "kinds"); if (!kk) return; kind = kk; }
    send({ type: "act", act: { a: "build", b: pick, id: P.id, ...(kind ? { kind } : {}) } }); }));
}
function worldT(): Int8Array { const G0 = gs()!, base = territoryCached(G0, cfgOf(S), S.g); return terrFull(G0, base, S.g).T; }
const terrEff = (t: string) => (t === "f" ? `скольжение останавливается` : t === "g" ? `проход в стене` : t === "w" ? "не пройти (кроме расы Воды); стрелять через воду можно" : t === "m" ? "не пройти (кроме расы Камня); закрывает обстрел" : t === "#" ? "не пройти, закрывает обстрел" : t === "b" ? "переправа через реку" : "");
const me0 = () => (S?.you ?? -1);
const hintOff = new Set<number>();
function renderHint() {
  const h = $("#hint"); if (!h) return;
  if (eui.recruit) { h.hidden = false; h.innerHTML = `${ic("recruit")}<span>Найм: ${KIND_NAME[eui.recruit.kind]} — выберите подсвеченную клетку</span><button class="btn sm ghost" id="hintx">${ic("close")}<span>Отмена</span></button>`;
    $("#hintx").onclick = () => { eui.recruit = null; renderHint(); draw(); }; return; }
  if (W.mode) { h.hidden = false; const tc = W.mode.k === "claim" ? S?.terr?.cities?.find((q: any) => q.city === (W.mode as any).city) : null;
    h.innerHTML = `${ic(W.mode.k === "claim" ? "flag" : "tower")}<span>${W.mode.k === "claim" ? `Покупка клетки${tc ? ` за ${tc.cost ?? "?"} золота` : ""} — выберите подсвеченную клетку` : "Сторожевая башня — выберите клетку рядом с Вождём"}</span><button class="btn sm ghost" id="hintx">${ic("close")}<span>Отмена</span></button>`;
    $("#hintx").onclick = () => { W.mode = null; renderHint(); draw(); }; return; }
  // t1198: подсказку «можно купить клетку» можно закрыть (×) — до следующего окна покупки этого города; клетку видно и на доске
  { const all = me0() >= 0 && S?.phase === "play" ? claimable(S) : []; for (const k of [...hintOff]) if (!all.some((q: any) => q.city === k)) hintOff.delete(k);
    const cl = all.filter((q: any) => !hintOff.has(q.city)); if (cl.length) { h.hidden = false; const t = cl[0];
    h.innerHTML = `${ic("flag")}<span>Можно купить клетку для «${esc(cityName(gs()!, t.city))}» · ${t.cost ?? "?"} золота · ${t.left ? `бесплатно через ${t.left} х.` : "бесплатная клетка — в конце хода"}</span><button class="btn sm gold" id="hintclaim">${ic("plus")}<span>Выбрать</span></button><button class="xbtn sm" id="hintoff" aria-label="Скрыть" title="Скрыть">${ic("close")}</button>`;
    $("#hintclaim").onclick = () => { W.mode = { k: "claim", city: t.city }; renderHint(); draw(); }; $("#hintoff").onclick = () => { hintOff.add(t.city); renderHint(); }; return; } }
  h.hidden = true;
}

/** Кнопка ульты Вождя: только с 5-го уровня (до этого не существует в интерфейсе), с кольцом перезарядки. */
function chiefUltBtn(ch: any, me: number): string {
  if ((ch.lv || 0) < 5 || !ch.p) return ""; const d = ULT[S.g.races[me]]; if (!d) return "";
  const pv = S.g.pieces.find((q: any) => q.id === ch.p.id), cd = +(pv?.ucd ?? pv?.cd?.ult ?? S.g.ec?.ultCd?.[me] ?? 0) || 0, max = +(cfgOf(S) as any).chiefUlt?.cd || 8;
  const my = S.g.cur === me && S.phase === "play" && S.g.ap > 0 && !cd;
  return `<button class="abil ult chiefult ${cd ? "cd" : ""}" id="chiefult" ${my ? "" : "disabled"} style="--p:${cd ? Math.round((cd / max) * 100) : 0}" data-tip="${esc(`Ульта «${d.title}»: ${d.sub}. ${cd ? `Готово через ${cd} х.` : "Выберите центр круга на доске."}`)}"><span class="ring"></span><span class="ab-ic">${ultIconArt(S.g.races[me])}</span>${cd ? `<b class="ab-cd">${cd}</b>` : ""}</button>`;
}
/** Арт иконки ульты (ui2/ult/ult_icon_<вид>.png) по расе. */
const ULT_ART: Record<string, string> = { fire: "doom", lightning: "blink", stone: "dome", ice: "blizzard", water: "tide", nature: "grove" }; // аудит п.3: серверные ключи
function ultIconArt(race: string) { const k = ULT_ART[race]; return k ? `<img class="ult-art" src="/strat/ui2/ult/ult_icon_${k}.png" alt="">` : ic("ult"); }
function startAim(a: NonNullable<typeof ultAim>) { ultAim = a; aimCell = null; const p = S.g.pieces.find((q: any) => q.id === a.pid); if (p) aimCell = [p.x, p.y];
  const h = $("#hint"); h.hidden = false; h.textContent = matchMedia("(hover: hover)").matches ? "Наведите область и нажмите — Esc отменит" : "Коснитесь клетки — область покажется; второе касание — удар"; draw(); }
function stopAim() { ultAim = null; aimCell = null; renderHint(); draw(); }

// ---------- камера: карты до 100×100 ----------
// cx, cy — центр экрана в координатах вида (клетки, уже с разворотом для стороны 1), z — px на клетку.
const cam = { cx: 0, cy: 0, z: 40, n: 0, W: 0, H: 0, fit: 40 };
// t1195: телефон (портрет) — карточка выбранного внизу шторкой; камера приподнимается на camLift клеток, чтобы фигура и её цели были над шторкой
let camLift = 0;
const sheetMode = () => matchMedia("(max-width: 820px) and (orientation: portrait)").matches;
function liftForSheet() {
  if (camLift) { cam.cy -= camLift; camLift = 0; clampCam(); }
  const box = document.getElementById("info"), st = document.getElementById("stage"), G = S?.g ? gs() : null;
  const P = G && sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && G && box && st && sheetMode() && document.body.classList.contains("selinfo") && !box.classList.contains("idle") && cam.W) {
    const top = innerHeight - (parseFloat(getComputedStyle(box).bottom) || 0) - box.offsetHeight - st.getBoundingClientRect().top - 8; // верх шторки в координатах сцены (без transform анимации появления)
    const cells: number[][] = [[P.x, P.y]]; if (S.phase === "play" && G.cur === S.you && !P.acted && G.ap > 0) cells.push(...moveTargets(G, P), ...attackTargets(G, P));
    // журнал (последняя запись) и кнопка истории лежат поверх низа доски — клетки под ними тоже считаем закрытыми
    const sr = st.getBoundingClientRect(); let lim = top; const lg = document.getElementById("log");
    if (lg && lg.offsetParent && lg.offsetHeight) { const r = lg.getBoundingClientRect(); if (cells.some(([x]) => scrX(x) + cam.z > r.left - sr.left && scrX(x) < r.right - sr.left)) lim = Math.min(lim, r.top - sr.top - 4); }
    const bot = Math.max(...cells.map(([, y]) => scrY(y) + cam.z)), room = scrY(P.y) - cam.z * 0.7; // фигура выше клетки на ~0.7 — её голову не прячем под шапку
    const d = Math.min(bot - lim, room); if (d > 1) { camLift = d / cam.z; cam.cy += camLift; clampCam(); }
  }
  draw();
}
const TAP_SLOP = 8, PINCH_GUARD = 250, ZMAX = 120;
// инерция прокрутки после броска пальцем; касание во время неё — только остановка, не ход
let inert = 0;
function stopInertia(): boolean { if (!inert) return false; cancelAnimationFrame(inert); inert = 0; return true; }
function startInertia(vx0: number, vy0: number) { stopInertia(); let vx1 = vx0, vy1 = vy0, t0 = performance.now();
  if (Math.hypot(vx1, vy1) < 0.25) return;
  const step = (t: number) => { const dt = Math.min(40, t - t0); t0 = t; const ox = cam.cx, oy = cam.cy; cam.cx -= (vx1 * dt) / cam.z; cam.cy -= (vy1 * dt) / cam.z; clampCam(); drawNow();
    const k = Math.pow(0.0035, dt / 1000); vx1 *= k; vy1 *= k; if (Math.hypot(vx1, vy1) < 0.03 || (ox === cam.cx && oy === cam.cy)) { inert = 0; return; } inert = requestAnimationFrame(step); };
  inert = requestAnimationFrame(step); }
const cv = () => $<HTMLCanvasElement>("#board");
const big = () => (S?.g?.size || 0) > SMALL;
const flipped = () => S?.you === 1;
const vx = (x: number) => (flipped() ? cam.n - 1 - x : x), vy = (y: number) => (flipped() ? cam.n - 1 - y : y);
const scrX = (x: number) => cam.W / 2 + (vx(x) - cam.cx) * cam.z, scrY = (y: number) => cam.H / 2 + (vy(y) - cam.cy) * cam.z;
function fitCam(force: boolean) {
  const st = $("#stage"); if (!st || !S?.g) return; const W = st.clientWidth, H = st.clientHeight; if (!W || !H) return;
  const n = S.g.size, pad = big() ? 0 : 18, fit = Math.max(4, Math.min((W - pad * 2) / n, (H - pad * 2) / n));
  const sizeChanged = W !== cam.W || H !== cam.H, newMap = cam.n !== n, wasFit = cam.z <= cam.fit * 1.001;
  cam.W = W; cam.H = H; cam.fit = fit;
  // t1204: зум на любой карте — малую карту подгоняем заново, только если её не приближали
  if (newMap || force || (!big() && wasFit)) { cam.n = n; cam.z = fit; cam.cx = n / 2; cam.cy = n / 2 + (newMap ? (camLift = 0) : camLift);
    if (big() && newMap) { cam.z = Math.max(fit, 44); const a = myAnchor(); if (a) centerOn(a[0], a[1]); } }
  else if (sizeChanged) clampCam();
  const c = cv(), dpr = devicePixelRatio || 1; c.style.width = W + "px"; c.style.height = H + "px";
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  $("#camctl").hidden = false; syncMinimap(); document.body.classList.toggle("bigmap", big());
}
function clampCam() {
  const n = cam.n; cam.z = Math.max(cam.fit, Math.min(ZMAX, cam.z));
  const hw = cam.W / 2 / cam.z, hh = cam.H / 2 / cam.z;
  // запас под оверлеи (мини-карта/кнопки камеры справа, журнал слева, мини-карта снизу): крайние клетки можно вытащить из-под них и нажать
  const ov = (id: string, k: "offsetWidth" | "offsetHeight") => { const e = document.getElementById(id); return e && !e.hidden && e.offsetParent ? (e as any)[k] + 14 : 0; };
  const mR = big() ? Math.max(ov("minimapbox", "offsetWidth"), ov("camctl", "offsetWidth")) / cam.z : 0, mB = big() ? Math.max(ov("minimapbox", "offsetHeight"), ov("log", "offsetHeight")) / cam.z : 0;
  const lx = Math.min(hw, n / 2), ux = Math.max(n - hw, n / 2) + mR, ly = Math.min(hh, n / 2), uy = Math.max(n - hh, n / 2) + mB + camLift;
  cam.cx = Math.max(lx, Math.min(ux, cam.cx)); cam.cy = Math.max(ly, Math.min(uy, cam.cy));
}
function myAnchor(): [number, number] | null {
  const g = S?.g; if (!g) return null; const me = Math.max(0, S.you);
  const k = g.pieces.find((p: any) => p.o === me && p.k === "king"); if (k) return [k.x, k.y];
  const c = g.ec?.cities?.find((q: any) => q.owner === me && q.cap) || g.ec?.cities?.find((q: any) => q.owner === me); return c ? [c.x, c.y] : null;
}
function centerOn(x: number, y: number) { cam.cx = vx(x) + 0.5; cam.cy = vy(y) + 0.5; clampCam(); draw(); }
/** t1204: карта не помещается целиком (приближена) — мини-карта с рамкой видимой области; вся карта видна — мини-карту прячем. */
const zoomed = () => cam.n > 0 && (cam.W / cam.z < cam.n - 0.05 || cam.H / cam.z < cam.n - 0.05);
function syncMinimap() { const b = document.getElementById("minimapbox"); if (b) { const on = zoomed(); if (b.hidden === on) { b.hidden = !on; document.body.classList.toggle("zoomed", on); } } }
function zoomAt(k: number, px = cam.W / 2, py = cam.H / 2) { const bx = cam.cx + (px - cam.W / 2) / cam.z, by = cam.cy + (py - cam.H / 2) / cam.z;
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
  if (inHitStop(performance.now())) { setTimeout(draw, hitStopLeft(performance.now())); return; } // хит-стоп: кадр удара держится 60 мс
  const c = cv(); if (!S?.g || !c || c.offsetParent === null) return; if (!cam.W || cam.n !== S.g.size) fitCam(false); if (!cam.W) return;
  const dpr = devicePixelRatio || 1, ctx = c.getContext("2d")!, g = S.g, n = g.size, z = cam.z;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cam.W, cam.H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const map: MapData = g.map || openMap(n), G0 = gs()!, cfg = cfgOf(S), T0 = G0.ec ? territoryCached(G0, cfg, g) : null, WT = T0 ? terrFull(G0, T0, g) : null, T = WT ? WT.T : null;
  const L = Math.min(n > 60 ? 3072 : 4096, Math.max(512, Math.ceil(n * Math.min(64, Math.max(cam.fit, 24)) * dpr)));
  { // рельеф: только видимый кусок слоя (на больших картах не масштабируем весь слой каждый кадр)
    const lay = terrainLayer(map, L, flipped(), [raceCol(0), raceCol(1)], T ? (x, y) => T[y * n + x] : undefined, z < 20), ox = cam.W / 2 - cam.cx * z, oy = cam.H / 2 - cam.cy * z, k = lay.width / n;
    const c0 = Math.max(0, Math.floor(-ox / z)), r0 = Math.max(0, Math.floor(-oy / z)), c1 = Math.min(n, Math.ceil((cam.W - ox) / z)), r1 = Math.min(n, Math.ceil((cam.H - oy) / z));
    if (c1 > c0 && r1 > r0) ctx.drawImage(lay, c0 * k, r0 * k, (c1 - c0) * k, (r1 - r0) * k, ox + c0 * z, oy + r0 * z, (c1 - c0) * z, (r1 - r0) * z); }
  // видимая область (в координатах карты) — рисуем только её
  const m = 1, vis = (x: number, y: number) => { const X = scrX(x), Y = scrY(y); return X > -z * m && Y > -z * m && X < cam.W + z * (m - 1) + z && Y < cam.H + z * (m - 1) + z; };
  const sx = scrX, sy = scrY;
  if (T && WT) { const ec0 = ectx(), w = wallTest ? wallTestLayout(G0, WT.T, WT.C) : { G: G0, T: WT.T, C: WT.C }; drawEcon(ctx, ec0, z, sx, sy, wallTest ? w.T : T, vis, () => { drawWalls(ctx, w.G, w.T, w.C, z, sx, sy, vis, raceCol, { ...wallOpts(w.G, w.T), ...(wallTest?.front != null ? { front: wallTest.front } : {}), ...(wallTest?.open ? { gateOpen: () => true } : {}) }); }); drawBuildings(ctx, ec0, z, sx, sy, vis, hideHp, WT.C); drawWorldOverlay(ctx, ec0, z, sx, sy, vis, WT.T, WT.C, performance.now()); }
  const zs = zonesOf(g); if (zs.length) drawZones(ctx, zs, n, sx, sy, z, performance.now());
  const GP = new Map(G0.pieces.map((q) => [q.id, q]));
  // метки terrain-v2: mark_select (#f3d27a), mark_move/hover (белые → тон), mark_attack (#b3261e); нет арта — прежние линии
  const mpx = z * (devicePixelRatio || 1), mark = (nm: string, x: number, y: number, col?: string) => { const im = col ? t2Tint(nm, col, mpx) : t2(nm, mpx); if (!im) return false; ctx.drawImage(im, sx(x), sy(y), z, z); return true; };
  if (hoverCell && S.phase === "play" && !(selCell && selCell[0] === hoverCell[0] && selCell[1] === hoverCell[1]) && vis(hoverCell[0], hoverCell[1])) mark("mark_hover", hoverCell[0], hoverCell[1], "#f4ead2");
  if (selCell && !mark("mark_select", selCell[0], selCell[1])) { ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = Math.max(2, z * 0.05); ctx.setLineDash([z * 0.12, z * 0.08]); ctx.strokeRect(sx(selCell[0]) + 2, sy(selCell[1]) + 2, z - 4, z - 4); ctx.setLineDash([]); }
  if (pendAct && sel != null && vis(pendAct[0], pendAct[1])) { const X = sx(pendAct[0]), Y = sy(pendAct[1]); ctx.save(); ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = Math.max(3, z * 0.08); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4; ctx.strokeRect(X + 2, Y + 2, z - 4, z - 4);
    const fs = Math.max(10, Math.min(15, z * 0.26)); ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; const tw = ctx.measureText("ещё раз").width + 10;
    ctx.fillStyle = "rgba(20,14,8,.88)"; ctx.fillRect(X + z / 2 - tw / 2, Y - fs - 4, tw, fs + 6); ctx.fillStyle = "#f3d27a"; ctx.fillText("ещё раз", X + z / 2, Y - fs / 2 - 1); ctx.restore(); }
  const G = gs()!, P = sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && S.phase === "play" && G.cur === S.you && !P.acted && G.ap > 0) {
    for (const [x, y] of moveTargets(G, P)) { if (!vis(x, y)) continue; if (mark("mark_move", x, y, "#f3d27a")) continue; ctx.fillStyle = "rgba(243,210,122,.28)"; ctx.fillRect(sx(x) + 2, sy(y) + 2, z - 4, z - 4); ctx.fillStyle = "#f3d27a"; ctx.beginPath(); ctx.arc(sx(x) + z / 2, sy(y) + z / 2, Math.max(2, z * 0.08), 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#e6623f"; ctx.lineWidth = Math.max(2, z * 0.07); for (const [x, y] of attackTargets(G, P)) if (vis(x, y) && !mark("mark_attack", x, y)) ctx.strokeRect(sx(x) + 3, sy(y) + 3, z - 6, z - 6);
    if (P.owner === S.you) { ctx.setLineDash([z * 0.1, z * 0.06]); for (const t of razeTargets(S, G, P)) if (vis(t.x, t.y)) { ctx.strokeRect(sx(t.x) + 5, sy(t.y) + 5, z - 10, z - 10); const im = iconImg("target", draw); if (im) ctx.drawImage(im, sx(t.x) + z * 0.36, sy(t.y) + z * 0.36, z * 0.28, z * 0.28); } ctx.setLineDash([]); }
  }
  const now = performance.now(); flipping = false;
  ghosts = ghosts.filter((d) => now - d.t < DEATH_MS);
  for (const d of ghosts) if (vis(d.p.x, d.p.y)) { ctx.globalAlpha = 1 - (now - d.t) / DEATH_MS; drawUnit(ctx, d.p, d.race, "death", sx(d.p.x), sy(d.p.y), z, false, faceState(d.p).cur); ctx.globalAlpha = 1; }
  const liveMarks = new Set<string>(); let marksOn = false;
  const dots = z < 16, ps = [...g.pieces].sort((a: any, b: any) => vy(a.y) - vy(b.y));
  for (const p of ps) {
    const tw = tweens.get(p.id), lo = lungeOf(p.id, now); let X = sx(p.x + lo[0]), Y = sy(p.y + lo[1]), hop = 0;
    if (tw) { const k = Math.min(1, (now - tw.t) / MOVE_MS), e = 1 - Math.pow(1 - k, 3); X = sx(tw.fx) + (X - sx(tw.fx)) * e; Y = sy(tw.fy) + (Y - sy(tw.fy)) * e; hop = Math.sin(k * Math.PI) * z * 0.12; if (k >= 1) tweens.delete(p.id); }
    if (X < -z || Y < -z || X > cam.W + z || Y > cam.H + z) continue;
    if (dots) { ctx.fillStyle = raceCol(p.o); ctx.strokeStyle = p.o === S.you ? "#f4ead2" : INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X + z / 2, Y + z / 2, Math.max(2.5, z * (p.k === "king" ? 0.45 : 0.32)), 0, 7); ctx.fill(); ctx.stroke(); continue; }
    const pz = poses.get(p.id), pose: Pose = pz && pz.until > now ? pz.pose : "idle";
    const face = pieceStyle === "figures" ? faceOf(p, now, tw) : 1;
    ctx.globalAlpha = p.a && p.o === g.cur ? 0.62 : 1;
    drawUnit(ctx, p, g.races[p.o], pose, X, Y - hop, z, true, face);
    const cx = X + z / 2, cy = Y + z / 2;
    if (p.id === sel) { const im = t2("mark_select", mpx); if (im) ctx.drawImage(im, X, Y, z, z); else { ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = Math.max(2, z * 0.05); ctx.strokeRect(X + 3, Y + 3, z - 6, z - 6); } }
    if (p.k === "king" && S.check?.[p.o]) { ctx.strokeStyle = "#e6623f"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cx, cy, z * 0.46, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    // полоса здоровья: чернильная рамка, заливка по доле
    // «Скрывать ОЗ» (настройка): полоса только у выбранной/наведённой; скрытое здоровье лобби: у врага только grade (hs)
    if (!hideHp || p.id === sel || p.id === hoverPid) { const bw = z * 0.6, bx = cx - bw / 2, by = Y + z * 0.86, bh = Math.max(4, z * 0.075), hs = p.hp == null ? p.hs : null, fr = hs ? (HS_STEP[hs] ?? 0) / 3 : Math.max(0, p.hp / p.mh); // M4: 3 ступени
      const ufill = hs ? HS_COL[hs] || "#888" : fr > 0.5 ? "#7fc25a" : fr > 0.25 ? "#e0b04a" : "#c23a2a", uH = bh * 2.5; // аудит п.5: unit_hp_bar_frame(_enemy) 64×10 / unit_hp_bar_enemy_<hs>
      if (!unitHpArt(ctx, bx - bh * 1.5, by - bh * 0.75, bw + bh * 3, uH, fr, ufill, p.owner !== S.you, hs || null, draw)) hpBarArt(ctx, bx - bh * 1.25, by, bw + bh * 2.5, bh, fr, ufill, p.owner !== S.you, draw, hs ? 3 : 0);
      if (hs && z >= 30) { ctx.font = `700 ${Math.round(z * 0.15)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText(HS_NAME[hs] || "", cx, by - 1); ctx.fillStyle = HS_COL[hs] || "#ccc"; ctx.fillText(HS_NAME[hs] || "", cx, by - 1); } }
    const badge = (name: string, i: number) => { const im = iconImg(name, draw); if (im) { const s = z * 0.24; ctx.drawImage(im, X + z * 0.74, Y + z * 0.04 + i * s, s, s); } };
    { const Q = GP.get(p.id); if (Q) drawLvBadge(ctx, X, Y - hop, z, pieceLevel(Q, cfg), p.o === S.you && !!pendingTalent(Q, cfg)); }
    let bi = 0; if (p.b) badge("burn", bi++); if (p.c) badge("chill", bi++);
    { const st: string[] = []; if (p.b) st.push("burn"); if (p.c) st.push("chill"); if (p.sh > 0) st.push("shield"); if (p.rt > 0) st.push("roots"); if (p.tr) marksOn = true; // энт idle — анимация // метки статусов — арт fx-v1, пока статус висит
      for (const k of st) liveMarks.add(p.id + ":" + k); if (drawStatusMarks(ctx, p.id, st, X, Y - hop, z, now)) marksOn = true; }
    const st = map.s[p.y * n + p.x]; if (st && st !== ".") drawStructIcon(ctx, st, X + z * 0.14, Y + z * 0.72, z * 0.26);
    ctx.globalAlpha = 1;
  }
  pruneMarks(liveMarks);
  rubble = rubble.filter((r) => now - r.t < 1200);
  for (const r of rubble) { const k = (now - r.t) / 1200, X = sx(r.x) + z / 2, Y = sy(r.y) + z / 2; ctx.globalAlpha = 1 - k;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + i, d = z * (0.15 + k * 0.55) * (0.6 + (i % 3) * 0.2); ctx.fillStyle = i % 3 ? "#6b5a48" : "#a89070";
      ctx.beginPath(); ctx.arc(X + Math.cos(a) * d, Y + Math.sin(a) * d * 0.7 + k * z * 0.2, z * (0.12 - k * 0.07) * (1 + (i % 2) * 0.4), 0, 7); ctx.fill(); }
    ctx.fillStyle = "#2a2018"; for (let i = 0; i < 5; i++) { const a = i * 1.3, d = z * k * 0.6; ctx.fillRect(X + Math.cos(a) * d, Y - z * 0.2 + Math.sin(a) * d + k * k * z * 0.5, z * 0.06, z * 0.06); } }
  ctx.globalAlpha = 1;
  bursts = bursts.filter((b) => now - b.t < FX_MS);
  for (const b of bursts) { const frs = hitFx(b.race); if (!frs.length) continue; const i = Math.min(frs.length - 1, Math.floor(((now - b.t) / FX_MS) * frs.length)), s2 = z * 1.3; ctx.drawImage(frs[i], sx(b.x) + z / 2 - s2 / 2, sy(b.y) + z / 2 - s2 / 2, s2, s2); }
  const castBusy = drawCasts(ctx, n, sx, sy, z, now), fx2Busy = drawFx2(ctx, sx, sy, z, now) || marksOn;
  if (ultAim && aimCell) { const cp = ultAim.chief ? g.pieces.find((q: any) => q.id === ultAim!.pid) : null, side = cp ? cp.o : S.you;
    drawAim(ctx, ultAim.race, aimCell[0], aimCell[1], ultAim.r, n, sx, sy, z, now, true, ultAim.chief ? { from: cp ? [cp.x, cp.y] : aimCell, era: g.ec?.era?.[side] || 1, side, pieces: g.pieces } : undefined); }
  // числа урона: всплывают, «пружинят», Oswald с чернильной обводкой
  fx = fx.filter((f) => now - f.t < NUM_MS); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const f of fx) { const k = (now - f.t) / NUM_MS, pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
    const fs = Math.max(13, Math.round(z * (f.big ? 0.42 : 0.26) * pop)); ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    ctx.font = `700 ${fs}px Oswald, sans-serif`; ctx.lineWidth = Math.max(3, fs * 0.18); ctx.strokeStyle = INK; ctx.lineJoin = "round";
    const X = sx(f.x) + z / 2, Y = sy(f.y) + z * (0.25 - k * 0.55); ctx.strokeText(f.txt, X, Y); ctx.fillStyle = f.col; ctx.fillText(f.txt, X, Y); }
  ctx.globalAlpha = 1;
  syncMinimap(); if (zoomed()) drawMinimap();
  const busy = castBusy || fx2Busy || W.mode || rubble.length || ultAim || fx.length || bursts.length || ghosts.length || tweens.size || flipping || eui.recruit || [...poses.values()].some((q) => q.until > now);
  if (busy) draw(); else if (zs.length && !zoneT) zoneT = setTimeout(() => { zoneT = 0; draw(); }, 110) as any;
}
let isGuest = false;
if (localStorage.getItem("strat.infomin")) document.body.classList.add("infomin");
// CSP (script-src-attr 'none') режет inline onerror — битые картинки с data-rmerr снимаем одним делегированным слушателем.
document.addEventListener("error", (e) => { const t = e.target as HTMLElement; if (t instanceof HTMLImageElement && t.hasAttribute("data-rmerr")) t.remove(); }, true);
let rubble: { x: number; y: number; t: number }[] = [];
let zoneT = 0, hoverPid = -1, hideHp = localStorage.getItem("strat.hideHp") === "1";
/** Фигура. «Фигуры»: спрайт (по умолчанию смотрит вправо), отражается по face (−1…1, плавный поворот). «Фишки» — без поворота. */
function drawUnit(ctx: CanvasRenderingContext2D, p: any, race: string, pose: Pose, x0: number, y0: number, cell: number, withGlyph: boolean, face = 1) {
  const [hi, lo] = RACE_COL[race] || ["#ccc", "#333"], cx = x0 + cell / 2, cy = y0 + cell / 2, r = cell * 0.4;
  const own = p.o === S.you, lw = Math.max(1.5, cell * 0.04);
  if (pieceStyle === "figures") {
    const gy = y0 + cell * 0.84;
    ctx.fillStyle = hi + "55"; ctx.strokeStyle = own ? "#f4ead2" : INK; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(cx, gy, cell * 0.34, cell * 0.1, 0, 0, 7); ctx.fill(); ctx.stroke();
    const ak = p.tr ? "knight" : p.k; // нет арта энта — рыцарь природы (не голая ладья)
    const spr = unitSprite(race, ak, pose) || unitSprite(race, ak, "idle"), sxs = Math.abs(face) < 0.08 ? 0.08 * Math.sign(face || 1) : face;
    ctx.save(); ctx.translate(cx, 0); ctx.scale(sxs, 1); ctx.translate(-cx, 0);
    if (p.tr && drawEnt(ctx, pose, cx, gy + cell * 0.02, cell, performance.now())) { /* энт: арт fx-v1 ent_nature_* */ }
    else if (spr) {
      const bb = spriteBox(spr) || [0, 0, spr.naturalWidth, spr.naturalHeight, spr.naturalWidth];
      const bw = bb[2] - bb[0], bh = bb[3] - bb[1], k = Math.min((cell * 0.8) / bh, (cell * 0.9) / bw);
      const dx = cx - (bb[0] + bw / 2) * k, dy = gy + cell * 0.02 - bb[3] * k;
      ctx.drawImage(spr, dx, dy, spr.naturalWidth * k, spr.naturalHeight * k);
    } else codeFigure(ctx, p.tr ? "knight" : p.k, hi, lo, cx, gy, cell);
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
    // terrain-v2 mini_* (8×8 на клетку): рельеф, постройки карты; нет набора — уменьшенный пререндер рельефа
    const MT: Record<string, string> = { ".": "plain", ",": "meadow", f: "forest", m: "mountain", w: "water", r: "road", b: "bridge", "#": "wall", g: "wall" };
    const mi = (nm: string) => t2(nm, 8), okMini = !!mi("mini_plain") && !!mi("mini_forest") && !!mi("mini_water");
    if (okMini) { x2.imageSmoothingEnabled = false; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, X = vx(x) * k, Y = vy(y) * k;
      const im = mi("mini_" + (MT[map.t[i]] || "plain")) || mi("mini_plain"); if (im) x2.drawImage(im, X, Y, k + 0.3, k + 0.3);
      const st = map.s[i]; if (st && st !== ".") { const si = mi("mini_" + st); if (si) x2.drawImage(si, X, Y, k + 0.3, k + 0.3); } } }
    else x2.drawImage(terrainLayer(map, Math.min(1024, Math.max(256, n * 8)), flipped(), [raceCol(0), raceCol(1)]), 0, 0, D, D);
    const G0 = gs()!, T = G0.ec ? territoryCached(G0, cfgOf(S), g) : null;
    if (T) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = T[y * n + x]; if (o >= 0) { x2.fillStyle = raceCol(o) + "55"; x2.fillRect(vx(x) * k, vy(y) * k, k, k); } }
    const mc = mi("mini_city"); if (mc && G0.ec) for (const ct of G0.ec.cities) { const s2 = k * (ct.cap ? 1.8 : 1.3); x2.drawImage(mc, vx(ct.x) * k + k / 2 - s2 / 2, vy(ct.y) * k + k / 2 - s2 / 2, s2, s2); } }
  const ctx = c.getContext("2d")!; ctx.drawImage(mmBase, 0, 0);
  for (const p of g.pieces) { ctx.fillStyle = raceCol(p.o); ctx.strokeStyle = INK; ctx.lineWidth = 1; const s = Math.max(3, k * (p.k === "king" ? 1.6 : 1)); ctx.fillRect(vx(p.x) * k + k / 2 - s / 2, vy(p.y) * k + k / 2 - s / 2, s, s); ctx.strokeRect(vx(p.x) * k + k / 2 - s / 2, vy(p.y) * k + k / 2 - s / 2, s, s); }
  const w = (cam.W / cam.z) * k, h = (cam.H / cam.z) * k; ctx.strokeStyle = "#f3d27a"; ctx.lineWidth = 2; ctx.strokeRect((cam.cx * k) - w / 2, (cam.cy * k) - h / 2, w, h);
}
function bindMinimap() {
  const c = $<HTMLCanvasElement>("#minimap"); if (!c) return; let down = false;
  const go = (e: PointerEvent) => { const r = c.getBoundingClientRect(); cam.cx = ((e.clientX - r.left) / r.width) * cam.n; cam.cy = ((e.clientY - r.top) / r.height) * cam.n; clampCam(); draw(); };
  c.onpointerdown = (e) => { down = true; c.setPointerCapture(e.pointerId); go(e); }; c.onpointermove = (e) => down && go(e); c.onpointerup = () => (down = false);
}

// ---------- телефон (портрет): нижние вкладки-шторки ----------
function setMSheet(k: string) {
  document.body.dataset.msheet = k;
  document.querySelectorAll<HTMLElement>("#mtabs [data-ms]").forEach((b) => { const on = b.dataset.ms === k; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
}
const lcolNarrow = matchMedia("(orientation: landscape) and (max-height: 500px) and (max-width: 740px)");
function initMobileTabs() {
  document.querySelectorAll<HTMLElement>("#mtabs [data-ms]").forEach((b) => (b.onclick = () => setMSheet(document.body.dataset.msheet === b.dataset.ms ? "" : b.dataset.ms!)));
  $("#stage").addEventListener("pointerdown", () => { if (document.body.dataset.msheet) setMSheet(""); if (lcolNarrow.matches) document.body.classList.remove("lcol-x"); });
  // телефон-ландшафт: левая колонка (игроки, ходы, чат) сворачивается; на узком экране (≤740px) свёрнута по умолчанию
  const lb = document.querySelector<HTMLElement>("#lcolbtn");
  if (lb) lb.onclick = () => { const on = document.body.classList.toggle("lcol-x"); lb.setAttribute("aria-pressed", String(lcolNarrow.matches ? on : !on)); };
  // телефон-ландшафт: правая колонка (Вождь, цели, вид) сворачивается в узкую полосу с «Концом хода»; доска забирает место
  const rb = document.querySelector<HTMLElement>("#rcolbtn");
  if (rb) rb.onclick = () => { const on = document.body.classList.toggle("rcol-x"); rb.setAttribute("aria-pressed", String(!on)); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.dataset.msheet) setMSheet(""); });
}

// ---------- ввод: клик, перетаскивание, щипок, колесо ----------
function bindBoard() {
  const c = cv(), pts = new Map<number, { x: number; y: number }>(); let moved = false, start: { x: number; y: number } | null = null;
  const local = (e: { clientX: number; clientY: number }) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  // щипок: точка карты под серединой пальцев остаётся под серединой (зум + сдвиг одновременно)
  let pz: { d: number; z: number; wx: number; wy: number } | null = null;
  const pinchStart = () => { const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pz = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z: cam.z, wx: cam.cx + (mx - cam.W / 2) / cam.z, wy: cam.cy + (my - cam.H / 2) / cam.z }; };
  // защита от случайных действий: сдвиг > TAP_SLOP — это прокрутка; после щипка PINCH_GUARD мс касания не считаются; касание во время инерции только останавливает её
  let guardTill = 0, swallow = false, btn = 0;
  const vel: { t: number; x: number; y: number }[] = [];
  // долгое нажатие на касании — подсказка по клетке шторкой (вместо наведения), без хода
  let lpT = 0, lpFired = false;
  c.addEventListener("contextmenu", (e) => { if (big()) e.preventDefault(); });
  c.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); }); // средняя кнопка — перетаскивание, не автопрокрутка
  c.addEventListener("pointerdown", (e) => { try { c.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, local(e)); moved = false; start = local(e); btn = e.button;
    swallow = stopInertia() || performance.now() < guardTill; vel.length = 0;
    clearTimeout(lpT); lpFired = false;
    if (e.pointerType !== "mouse" && pts.size === 1) { const p0 = local(e); lpT = window.setTimeout(() => { if (moved || pts.size !== 1) return; lpFired = true; hoverTip(p0.x, p0.y, 0, 0, true); }, 450); }
    if (pts.size >= 2) { clearTimeout(lpT); moved = true; swallow = true; pinchStart(); } });
  c.addEventListener("pointermove", (e) => {
    const p = local(e);
    if (!pts.has(e.pointerId)) { if (ultAim) { const at = cellAt(p.x, p.y); if (at && (at[0] !== aimCell?.[0] || at[1] !== aimCell?.[1])) { aimCell = at; draw(); } return; } hoverTip(p.x, p.y, e.clientX, e.clientY); return; }
    const prev = pts.get(e.pointerId)!; pts.set(e.pointerId, p);
    if (pts.size >= 2) { if (pz) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cam.z = pz.z * d / pz.d; clampCam(); cam.cx = pz.wx - (mx - cam.W / 2) / cam.z; cam.cy = pz.wy - (my - cam.H / 2) / cam.z; clampCam(); draw(); hideTip(); } return; }
    if (start && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) { moved = true; clearTimeout(lpT); }
    if (moved && (big() || zoomed())) { cam.cx -= (p.x - prev.x) / cam.z; cam.cy -= (p.y - prev.y) / cam.z; clampCam(); draw(); hideTip();
      vel.push({ t: e.timeStamp, x: p.x, y: p.y }); while (vel.length > 2 && e.timeStamp - vel[0].t > 90) vel.shift(); }
  });
  const up = (e: PointerEvent) => { clearTimeout(lpT); const was = pts.has(e.pointerId), n0 = pts.size; pts.delete(e.pointerId);
    if (n0 >= 2) { guardTill = performance.now() + PINCH_GUARD; pz = null; if (pts.size >= 2) pinchStart(); vel.length = 0; return; } // щипок кончился: оставшийся палец только двигает карту
    if (pts.size) return;
    if (lpFired) { lpFired = false; start = null; return; }
    if (was && moved && (big() || zoomed()) && e.pointerType !== "mouse" && vel.length >= 2 && e.timeStamp - vel[vel.length - 1].t < 60) { const a = vel[0], b = vel[vel.length - 1], dt = Math.max(1, b.t - a.t); startInertia((b.x - a.x) / dt, (b.y - a.y) / dt); }
    if (was && !moved && !swallow && btn === 0 && performance.now() >= guardTill) { const p = local(e); onBoard(p.x, p.y); }
    start = null; swallow = false; };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); if (pts.size < 2) pz = null; start = null; });
  c.addEventListener("pointerleave", () => hideTip());
  // колесо/тачпад: плавный зум к точке курсора (deltaY в пикселях или строках)
  c.addEventListener("wheel", (e) => { e.preventDefault(); stopInertia(); const p = local(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(-Math.max(-240, Math.min(240, dy)) * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y); }, { passive: false });
  { const lb = $("#logbtn"); if (lb) lb.onclick = () => { const lg = $("#log"), o = !lg.classList.contains("open"); lg.classList.toggle("open", o); lb.setAttribute("aria-expanded", String(o)); lb.setAttribute("aria-label", o ? "Свернуть журнал" : "Развернуть журнал"); if (!o) lg.scrollTop = 0; }; }
  bindFullscreen();
  $("#zin").onclick = () => zoomAt(1.3); $("#zout").onclick = () => zoomAt(1 / 1.3); $("#zfit").onclick = () => { cam.z = cam.fit; clampCam(); draw(); };
  $("#cenking").onclick = () => { const k = S?.g?.pieces.find((p: any) => p.o === Math.max(0, S.you) && p.k === "king"); if (k) { if (cam.z < 40) cam.z = Math.max(cam.fit, 48); centerOn(k.x, k.y); } else toast("Вождя сейчас нет", "bad", "skull"); };
  $("#cencity").onclick = () => { const cs = (S?.g?.ec?.cities || []).filter((q: any) => q.owner === Math.max(0, S.you)); if (!cs.length) return toast("Городов нет", "bad", "castle");
    cityIdx = (cityIdx + 1) % cs.length; if (cam.z < 40) cam.z = Math.max(cam.fit, 48); centerOn(cs[cityIdx].x, cs[cityIdx].y); };
  bindMinimap();
}
/** t1204: «Во весь экран» — Fullscreen API (с webkit-вариантом) для страницы игры; где API нет (iOS Safari) — псевдо-режим:
 *  #play фиксирован на 100dvh поверх сайта (body.strat-fs). Выход — та же кнопка или Esc; значок меняется. */
function bindFullscreen() {
  const b = document.getElementById("fsbtn"); if (!b) return; const de: any = document.documentElement, d: any = document;
  const native = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
  const sync = () => { const on = native() || document.body.classList.contains("strat-fs-pseudo"); document.body.classList.toggle("strat-fs", on); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Выйти из полноэкранного режима" : "Во весь экран"); requestAnimationFrame(() => { fitCam(false); draw(); }); };
  const exit = () => { if (native()) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d); document.body.classList.remove("strat-fs-pseudo"); sync(); };
  b.onclick = async () => { if (document.body.classList.contains("strat-fs")) return exit();
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    try { if (req) { await req.call(de, { navigationUI: "hide" }); } else throw 0; } catch { document.body.classList.add("strat-fs-pseudo"); scrollTo(0, 0); }
    sync(); };
  document.addEventListener("fullscreenchange", sync); document.addEventListener("webkitfullscreenchange", sync);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("strat-fs-pseudo")) exit(); });
}
let cityIdx = -1, hoverKey = "", hoverCell: [number, number] | null = null;
/** Наведение на доску (мышь): короткая подсказка о фигуре или клетке. */
function hoverTip(px: number, py: number, cx: number, cy: number, sheet = false) {
  if ((!sheet && !matchMedia("(hover: hover)").matches) || !S?.g) return; if (sheet) hoverKey = ""; const at = cellAt(px, py); if (!at) { hideTip(); hoverKey = ""; if (hoverCell) { hoverCell = null; draw(); } return; }
  const [x, y] = at, g = S.g, p = g.pieces.find((q: any) => q.x === x && q.y === y), m: MapData = g.map || openMap(g.size), t = m.t[y * g.size + x], st = m.s[y * g.size + x];
  const key = `${x},${y},${p?.id},${p?.hp},${S.g.v ?? S.g.turn}`; if (key === hoverKey) return; hoverKey = key; if (!hoverCell || hoverCell[0] !== x || hoverCell[1] !== y) { hoverCell = [x, y]; draw(); } { const hp0 = p?.id ?? -1; if (hp0 !== hoverPid) { hoverPid = hp0; if (hideHp) draw(); } }
  let h = "";
  if (p) h = `<b>${p.k === "king" ? "Вождь " + esc(chiefName(p.o)) : KIND_NAME[p.k as Kind]}</b> · ${p.o === S.you ? "ваш" : "враг"}<br>${p.hp == null && p.hs ? `<span class="hsb hs-${p.hs}">${HS_NAME[p.hs] || "?"}</span>` : `${ic("heart")}${p.hp}/${p.mh}`} ${ic("sword")}${p.ea ?? p.atk} ${ic("shield")}${p.er ?? p.arm}`;
  if (g.ec) { const G0 = gs()!, base = territoryCached(G0, cfgOf(S), g), W0 = terrFull(G0, base, g), i = y * g.size + x, cid = W0.C[i];
    if (cid >= 0) { const o = W0.T[i]; h += `${h ? "<br>" : ""}<span class="tipland" style="--pc:${raceCol(o)}">Земли ${esc(cityName(G0, cid))} (${esc(o === S.you ? "вы" : S.seats[o]?.nick || "?")})</span>`; }
    const ctv = g.ec.ct?.[i]; if (ctv) h += `<br><small>Захват: ${esc(S.seats[ctv.o]?.nick || "?")} · ${ctv.n}/${S.league?.capture ?? 4} х.</small>`;
    const city = G0.ec.cities.find((c) => c.x === x && c.y === y); if (city) { const rows = cityBld(S, G0, city, cfgOf(S)); if (rows.length) h += "<br><small>" + rows.map((r) => `${esc(bName(r.b, G0.races[city.owner]))}: ${r.ruin ? "руины" : r.hp != null ? r.hp + "/" + r.max : HS_NAME[r.hs || ""] || "?"}`).join(" · ") + "</small>"; }
    const tw = towersOf(G0).find((t) => t.x === x && t.y === y); if (tw) { const hp = g.ec.tbhp?.[tw.id], hs = g.ec.tbhs?.[tw.id]; h += `${h ? "<br>" : ""}<b>Сторожевая башня</b> · ${esc(tw.owner === S.you ? "ваша" : S.seats[tw.owner]?.nick || "?")}<br><small>${hp != null ? "Прочность " + hp + "/" + ((cfgOf(S) as any).econ?.tower?.hp ?? 16) : hs ? HS_NAME[hs] : ""}</small>`; } }
  const tp = terrainPassive(t, (TERRAIN as any)[t]?.name || t); h += `${h ? "<br>" : ""}<small>${esc((TERRAIN as any)[t]?.name || t)}${tp ? " · " + tp.effs.map((e) => esc(effLine(e))).join(", ") : ""}${st !== "." ? " · " + esc((STRUCT as any)[st]?.name || "") : ""}</small>`;
  if (sheet) { openSheet(`<div class="tip-b">${h}</div>`); return; }
  showTip(`<div class="tip-b">${h}</div>`, cx + 14, cy + 14);
}
const await0 = <T,>(p: Promise<T>) => p;
// подтверждение хода/удара вторым касанием (телефон; настройка, по умолчанию вкл. на сенсорных экранах)
const coarsePtr = matchMedia("(pointer: coarse)").matches;
let confirmTap = (localStorage.getItem("strat.confirmTap") ?? (coarsePtr ? "1" : "0")) === "1";
let pendAct: [number, number] | null = null;
let tapN = 0;
function onBoard(px: number, py: number) {
  tapN++;
  if (!S?.g) return; const at = cellAt(px, py); if (!at) return; const [x, y] = at;
  const pend0 = pendAct; if (pendAct) { pendAct = null; draw(); }
  const confirmed = () => { if (!confirmTap || (pend0 && pend0[0] === x && pend0[1] === y)) return true; pendAct = [x, y]; draw(); return false; };
  if (ultAim) { const touch = !matchMedia("(hover: hover)").matches;
    if (touch && (aimCell?.[0] !== x || aimCell?.[1] !== y)) { aimCell = [x, y]; return draw(); }
    if (demo) { const u = parseUlt({ e: ultAim.chief ? "ult" : "uult", id: ultAim.pid, x, y, r: ultAim.r, race: ultAim.race }, S.g, performance.now()); if (u) { addCast(u, S.g.turn); ultBanner(u, true, ""); } }
    else send({ type: "act", act: ultAim.chief || ultAim.id === "ult" ? { a: "ult", id: ultAim.pid, x, y } : { a: "ability", id: ultAim.pid, ab: ultAim.id, x, y } });
    stopAim(); return; }
  if (W.mode && S.phase === "play") { const G1 = gs()!, md = W.mode;
    if (md.k === "claim") { const tc = S.terr?.cities?.find((q: any) => q.city === md.city);
      if (tc?.cells?.some(([a, b]: number[]) => a === x && b === y)) { send({ type: "act", act: { a: "claim", city: md.city, x, y } }); W.mode = null; renderHint(); return draw(); } }
    else { const k = G1.pieces.find((q) => q.owner === S.you && q.kind === "king");
      if (k && towerCells(G1, worldT(), S.you, k, cfgOf(S)).some(([a, b]) => a === x && b === y)) { send({ type: "act", act: { a: "build", b: md.b, id: k.id, x, y } }); W.mode = null; renderHint(); return draw(); } }
    toast("Эта клетка не подходит — выберите подсвеченную", "bad"); return; }
  const G = gs()!, here = G.pieces.find((p) => p.x === x && p.y === y);
  { const P0 = sel != null ? G.pieces.find((q) => q.id === sel) : null;
    if (P0 && P0.owner === S.you && S.phase === "play" && G.cur === S.you && !P0.acted) { const rt = razeTargets(S, G, P0).find((t) => t.x === x && t.y === y);
      if (rt && !(here && attackTargets(G, P0).some(([a, b]) => a === x && b === y))) { if (!confirmed()) return;
        const pick = rt.b.length === 1 ? rt.b[0] : await0(choiceDlg("Удар по постройке", `${rt.tower ? "Сторожевая башня" : cityName(G, rt.city)}: что разрушать?`, rt.b.map((b) => ({ id: b, title: bName(b, G.races[1 - S.you] || ""), icon: "target" })), "builds"));
        Promise.resolve(pick).then((b) => { if (b) { faceAt(P0.id, x, y); send({ type: "act", act: { a: "raze", id: P0.id, city: rt.city, b } }); } }); return; } } }
  if (S.phase !== "play") { selCell = here ? null : [x, y]; sel = here ? here.id : null; renderInfo(); return draw(); }
  if (G.ec && !demo && boardClick(ectx(), x, y, !here)) { selCell = null; sel = null; renderInfo(); renderHint(); return draw(); }
  if (!here && sel == null && selCell && selCell[0] === x && selCell[1] === y) { selCell = null; renderInfo(); return draw(); } // t1202: повторный тап — закрыть карточку клетки
  selCell = here ? null : [x, y];
  if (here && here.owner === S.you) { sel = here.id === sel ? null : here.id; renderInfo(); return draw(); }
  const P = sel != null ? G.pieces.find((q) => q.id === sel) : null;
  if (P && G.cur === S.you) {
    if (here && attackTargets(G, P).some(([a, b]) => a === x && b === y)) { if (!confirmed()) return; faceAt(P.id, x, y); send({ type: "act", act: { a: "attack", id: P.id, x, y } }); }
    else if (!here && moveTargets(G, P).some(([a, b]) => a === x && b === y)) { if (!confirmed()) return;
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
  const el = $("#clock"), bc = document.getElementById("bigclock"); if (!el) return;
  if (S?.phase === "play" && S.clock && isFinite(+(S.clock.turnEnds ?? S.clock.deadline))) {
    const now = Date.now() - (S.skew || 0), g = S.g, c = S.clock, turnLeft = Math.max(0, +(c.turnEnds ?? c.deadline) - now), res = Math.max(0, (c.reserve?.[g.cur] ?? 0) - Math.max(0, now - c.turnEnds));
    const total = c.turnMs ?? (S.turnSec ?? (STRAT_CFG.sizes as any)[g.size]?.turnSec ?? turnSecFor(g.size)) * 1000, fr = Math.max(0, Math.min(1, turnLeft / Math.max(1, total)));
    const f = (ms: number) => { const s = Math.ceil(ms / 1000); return s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    const mine = g.cur === S.you, warn = fr <= 0.1;
    if (!el.querySelector(".tring")) el.innerHTML = `<svg class="tring" viewBox="0 0 36 36" aria-hidden="true"><circle class="tr-bg" cx="18" cy="18" r="15.5"/><circle class="tr-fg" cx="18" cy="18" r="15.5" pathLength="100"/></svg><b></b><small></small>`;
    (el.querySelector(".tr-fg") as SVGCircleElement).style.strokeDashoffset = String(100 - fr * 100);
    el.querySelector("b")!.textContent = f(turnLeft); el.querySelector("small")!.textContent = turnLeft > 0 ? (mine ? "ваш ход" : "ход соперника") : "запас " + f(res);
    el.classList.toggle("low", warn); el.classList.toggle("mine", mine); el.dataset.tip = `Время на ход: ${fmtMin(Math.round(total / 1000))}. Когда оно и запас кончатся, ход будет пропущен.`;
    if (bc) { // большое кольцо в правой колонке (арт timer_ring_frame, дуга и цифры — игрой; <10% — красное)
      if (!bc.querySelector(".bc-arc")) bc.innerHTML = `<svg class="bc-svg" viewBox="0 0 128 128" aria-hidden="true"><circle class="bc-bg" cx="64" cy="70" r="40"/><circle class="bc-arc" cx="64" cy="70" r="40" pathLength="100"/></svg><b class="bc-t"></b><small class="bc-s"></small>`;
      (bc.querySelector(".bc-arc") as SVGCircleElement).style.strokeDashoffset = String(100 - fr * 100); bc.querySelector(".bc-t")!.textContent = f(turnLeft);
      bc.querySelector(".bc-s")!.textContent = turnLeft > 0 ? "" : "запас " + f(res); bc.classList.toggle("low", warn); bc.dataset.tip = el.dataset.tip; }
  } else { el.innerHTML = ""; if (bc) bc.innerHTML = ""; }
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
const llCache: Record<string, { at: number; list: any[] | null }> = {};
function renderLobbyLeague() {
  const el = document.getElementById("lleague"); if (!el) return; const lg = leagueOf(S.size), c = llCache[lg], my = S.seats?.[S.you]?.nick || "";
  if (!c || Date.now() - c.at > 60000) { llCache[lg] = { at: Date.now(), list: c?.list ?? null }; topGet(lg).then((j: any) => { llCache[lg] = { at: Date.now(), list: Array.isArray(j?.list) ? j.list : [] }; if (S?.phase === "lobby") renderLobbyLeague(); }).catch(() => {}); }
  const list = llCache[lg].list, h = lobbyLeagueHtml(lg, list, my); if (el.dataset.h === h) return; el.dataset.h = h; el.innerHTML = h;
  el.querySelectorAll<HTMLElement>(".nk").forEach((n) => (n.textContent = String(list?.[+n.dataset.i!]?.nick || "?").slice(0, 20)));
}
/** Таблица лиги: hub {type:"top_get", league} → {list}; в демо — локальные данные. */
function topGet(league: string): Promise<any> { return demo || menuDemo ? Promise.resolve(((window as any).__stratTopDemo?.(league) || {}) as any).then((j: any) => (menuDemo && j.list ? { ...j, list: j.list.map((x: any) => (x.nick === "Алекс" ? { ...x, me: true } : x)), me: { place: 2, r: j.list[1]?.r, rd: 60, games: 74, w: 46, l: 24, d: 4, prov: league === "tactic", left: league === "tactic" ? 7 : 0 }, total: 312 } : j)) : hubReq("top_get", { league }); }
const raceD = () => ({ races: RACES as string[], name: RACE_NAME as Record<string, string>, crest, col: (r: string) => (RACE_COL[r] || [GOLD])[0] });
function saveFav(xs: string[]) { setFavLocal(xs); if (demo || hub?.readyState !== 1) { toast("Любимые расы сохранены", "good", "check"); if (S?.phase === "lobby") renderLobby(); return; } hub.send(JSON.stringify({ type: "fav_races_set", races: xs })); }
function openFavDlg() { const m = modal({ id: "favdlg", title: "Любимые расы", icon: "crown", cls: "favdlg", body: favPickerHtml(raceD(), favRaces()) });
  bindFavPicker(m.el, raceD(), favRaces(), (xs) => { saveFav(xs); m.close(); }); }
/** Игровой профиль: hub {type:"profile_get"}; личная вкладка — только если сервер подтвердил владельца. */
/** nick — чужой профиль (публичная часть; сервер сам решает own по сессии). */
function showProfile(nick?: string) { return openProfile(() => (demo || menuDemo ? Promise.resolve(demoProfile(nick || S?.seats?.[S.you]?.nick || $("#me").textContent || "Гость")) : hubReq("profile_get", nick ? { nick } : {})), { crest, raceName: RACE_NAME, raceCol: (r) => (RACE_COL[r] || [GOLD])[0], lib: libDeps(), fav: { get: favRaces, html: () => favPickerHtml(raceD(), favRaces()), bind: (el: HTMLElement) => bindFavPicker(el, raceD(), favRaces(), saveFav), guest: () => isGuest } }); }
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
// t1194: гость — вид фигур хранится только локально (localStorage); сервер на pref_set отвечает err:"guest", и тост «Только для вошедших» выглядел так, будто гостям не дают фигуры.
function savePrefs() { if (isGuest) return; hub?.readyState === 1 && hub.send(JSON.stringify({ type: "pref_set", pieceStyle: pieceStyle === "tokens" ? "tok" : "fig", glyphBadge })); }

// ---------- меню партии (свои кнопки, без data-act) ----------
function openMenu() {
  const m = modal({ id: "menudlg", title: "Пауза", icon: "menu", cls: "small menudlg", body: `${profileHtml(null)}<div class="menulist">
    <button class="btn gold" id="m-cont">${ic("play")}<span>Продолжить</span></button>
    <button class="btn" id="m-style">${ic("eye")}<span>${pieceStyle === "figures" ? "Вид: фигуры ⇄ фишки" : "Вид: фишки ⇄ фигуры"}</span></button>
    <button class="btn" id="m-hp" aria-pressed="${hideHp}" data-tip="Только отображение: полосы здоровья видны у выбранной и наведённой фигуры">${ic("heart")}<span>Скрывать ОЗ: ${hideHp ? "вкл" : "выкл"}</span></button>
    <button class="btn" id="m-rules">${ic("book")}<span>Правила</span></button>
    ${S?.phase === "play" && S.you >= 0 && !demo ? `<button class="btn danger" id="m-surr">${ic("flag")}<span>Сдаться</span></button>` : ""}
    <button class="btn ghost" id="leave2">${ic("back")}<span>В главное меню</span></button></div>` });
  const q = (id: string) => m.el.querySelector<HTMLButtonElement>("#" + id);
  q("m-cont")!.onclick = () => m.close(null);
  m.el.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-prof]")) showProfile(); });
  const pf = m.el.querySelector<HTMLElement>(".profile")!; pf.querySelector(".pf-nick")!.textContent = S?.seats?.[S.you]?.nick || ($("#me").textContent || "Гость");
  pf.querySelector<HTMLButtonElement>("[data-top]")!.onclick = () => openLeaderboard(topGet, S?.seats?.[S.you]?.nick || "", leagueOf(S?.g?.size || S?.size || 8), showProfile);
  (demo ? Promise.resolve((window as any).__stratRatingDemo?.() || {}) : hubReq("rating_get")).then((r: any) => { if (!r?.leagues || !pf.isConnected) return; const nk = pf.querySelector(".pf-nick")!.textContent; pf.outerHTML = profileHtml(r.leagues);
    const pf2 = m.el.querySelector<HTMLElement>(".profile")!; pf2.querySelector(".pf-nick")!.textContent = nk; pf2.querySelector<HTMLButtonElement>("[data-top]")!.onclick = () => openLeaderboard(topGet, nk || "", leagueOf(S?.g?.size || S?.size || 8), showProfile); });
  q("m-style")!.onclick = () => { togglePieceStyle(); q("m-style")!.querySelector("span")!.textContent = pieceStyle === "figures" ? "Вид: фигуры ⇄ фишки" : "Вид: фишки ⇄ фигуры"; };
  q("m-hp")!.onclick = () => { hideHp = !hideHp; localStorage.setItem("strat.hideHp", hideHp ? "1" : "0"); const b = q("m-hp")!; b.setAttribute("aria-pressed", String(hideHp)); b.querySelector("span")!.textContent = "Скрывать ОЗ: " + (hideHp ? "вкл" : "выкл"); draw(); };
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

// ---------- главное меню: Полководец, разделы, настройки ----------
const menuDemo = LOCAL && !!qs.get("menudemo");
const myNick = () => ($("#me").textContent || "").replace(/ · гость$/, "");
export const emblemTier = (lv: number) => Math.max(1, Math.min(10, Math.ceil((+lv || 1) / 10)));
async function loadCommander() {
  const el = document.getElementById("cmdr"); if (!el) return;
  const r: any = menuDemo ? { leagues: (window as any).__stratRatingDemo?.().leagues, commander: { level: 37, xp: 2310, next: 2460, frac: 0.42 } } : await hubReq("rating_get");
  const c = r?.commander, L = r?.leagues || null, lv = +c?.level || 0, tier = emblemTier(lv);
  const lg = LEAGUES.map((l) => { const s: any = L?.[l.id]; const prov = s && (s.prov ?? (s.games < 10 || (s.rd ?? 0) > 110));
    return `<button type="button" class="cm-lg" data-lg="${l.id}" data-tip="${l.name} лига · ${l.sizes}"><img src="/strat/ui2/leagues/league_${l.id}_64.png" alt=""><b>${s?.games ? Math.round(s.r) : "—"}</b>${prov && s?.games ? `<img class="prov-m" src="/strat/ui2/badges/provisional_mark.png" alt="?">` : ""}<small>${l.name}</small></button>`; }).join("");
  const off = !r || r.err;
  el.innerHTML = `<span class="cm-em">${lv ? `<img src="/strat/ui2/badges/warlord_emblem_${tier}.png" alt="">` : ic("user")}</span>
    <div class="cm-b"><b class="cm-nick"></b><small>${lv ? `Полководец · ур. <b>${lv}</b> из 100` : off ? "Уровень Полководца появится, когда сервер его отдаст" : isGuest ? "Войдите на сайт — уровень Полководца и рейтинг копятся только у аккаунта" : "Полководец · ур. 1"}</small>
      ${lv ? `<div class="meter xp cm-xp" data-tip="Опыт ${+c.xp || 0}${c.next ? " / " + c.next : ""} · 1 XP ≈ минута своих ходов; уровень — только косметика"><i style="width:${Math.round(Math.max(0, Math.min(1, +c.frac || 0)) * 100)}%"></i></div>` : ""}</div>
    <div class="cm-lgs">${lg}</div>`;
  el.querySelector(".cm-nick")!.textContent = myNick() || "…";
  el.querySelectorAll<HTMLButtonElement>(".cm-lg").forEach((b) => (b.onclick = () => openLeaderboard(topGet, myNick(), b.dataset.lg as any, showProfile)));
  const pe = document.getElementById("profem"); if (pe && lv) pe.innerHTML = `<img src="/strat/ui2/badges/warlord_emblem_${tier}.png" alt="">`;
}
function openLibDlg() { const m = modal({ id: "libdlg", title: "Библиотека партий", icon: "book", cls: "libdlg", body: `<div class="ppane">${libHtml(null, { crest, loading: true })}</div>` }); loadLib(m.el.querySelector<HTMLElement>(".ppane")!); }
function openMapsHub() {
  modal({ id: "mapsdlg", title: "Карты игроков", icon: "map", cls: "mapsdlg", body: `<div class="mh-tabs" aria-disabled="true">${["Популярные", "Рейтинг", "Новые", "Избранное"].map((t, i) => `<span class="mh-tab ${i ? "" : "on"}">${t}</span>`).join("")}</div>
    <div class="emptyrow ph"><img src="/strat/ui2/icons/icon_map_64.png" alt="" width="48" height="48"><span>Хаб карт игроков скоро откроется: лайки, комментарии, избранное и сортировка. Карты на рассмотрении публикуются только после проверки.</span></div>
    <ul class="mh-now"><li>${ic("glory")}<span><b>Рейтинговые партии</b> идут на картах из рейтингового пула — карту выбирает сервер.</span></li><li>${ic("map")}<span>В обычной партии хост выбирает карту в лобби: «Настройки партии» → «Карта».</span></li><li>${ic("build")}<span>Свою карту можно нарисовать в редакторе и отправить на проверку.</span></li></ul>` });
}
function openSettings() {
  const snd = localStorage.getItem("strat.sound") === "1";
  const m = modal({ id: "setdlg", title: "Настройки", icon: "gear", cls: "small setdlg", body: `<div class="setlist">
    <div class="setrow"><span>${ic("eye")}<b>Вид фигур</b><small>фигуры или плоские фишки</small></span><button class="btn sm" id="s-style">${pieceStyle === "figures" ? "Фигуры ⇄ фишки" : "Фишки ⇄ фигуры"}</button></div>
    <label class="setrow"><span>${ic("crown")}<b>Значки на фигурах</b><small>символ фигуры в углу (вид «фигуры»)</small></span><input type="checkbox" id="s-badge" ${glyphBadge ? "checked" : ""}></label>
    <label class="setrow"><span>${ic("target")}<b>Подтверждать ход касанием</b><small>ход и удар — вторым касанием той же клетки</small></span><input type="checkbox" id="s-conf" ${confirmTap ? "checked" : ""}></label>
    <label class="setrow"><span>${ic("heart")}<b>Скрывать полосы ОЗ</b><small>видны только у выбранной и наведённой фигуры</small></span><input type="checkbox" id="s-hp" ${hideHp ? "checked" : ""}></label>
    <label class="setrow dis" data-tip="Звуков в игре пока нет — настройка сохранится на будущее"><span>${ic("sound")}<b>Звук</b><small>пока без звуков</small></span><input type="checkbox" id="s-snd" ${snd ? "checked" : ""}></label>
    <div class="setrow"><span>${ic("crown")}<b>Любимые расы</b><small>до 3 — для жребия рейтинговой партии</small></span><button class="btn sm" id="s-fav">Выбрать</button></div></div>` });
  const q = (id: string) => m.el.querySelector<HTMLInputElement>("#" + id)!;
  q("s-style").onclick = () => { togglePieceStyle(); q("s-style").textContent = pieceStyle === "figures" ? "Фигуры ⇄ фишки" : "Фишки ⇄ фигуры"; };
  q("s-badge").onchange = () => { glyphBadge = q("s-badge").checked; localStorage.setItem("strat.glyphBadge", glyphBadge ? "1" : "0"); (window as any).__syncPs?.(); savePrefs(); draw(); };
  q("s-hp").onchange = () => { hideHp = q("s-hp").checked; localStorage.setItem("strat.hideHp", hideHp ? "1" : "0"); draw(); };
  q("s-conf").onchange = () => { confirmTap = q("s-conf").checked; localStorage.setItem("strat.confirmTap", confirmTap ? "1" : "0"); pendAct = null; draw(); };
  q("s-snd").onchange = () => localStorage.setItem("strat.sound", q("s-snd").checked ? "1" : "0");
  q("s-fav").onclick = () => { if (isGuest && !menuDemo) return toast("Любимые расы — только для вошедших на сайт", "info", "user"); openFavDlg(); };
}
function initMenu() {
  const pm = document.querySelectorAll<HTMLButtonElement>(".pmode"), cb = $("#create").querySelector("span")!;
  const sync = () => { pm.forEach((b) => { const on = b.dataset.pm === playMode; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
    cb.textContent = playMode === "bot" ? "Играть с ботом" : playMode === "ranked" ? "Создать рейтинговое лобби" : "Создать лобби"; $<HTMLInputElement>("#pub").closest("label")!.hidden = playMode === "bot"; };
  pm.forEach((b) => (b.onclick = () => { playMode = b.dataset.pm as any; localStorage.setItem("strat.playMode", playMode); sync(); })); sync();
  for (const o of Array.from($<HTMLSelectElement>("#size").options)) o.textContent = `${o.value}×${o.value}${+o.value === 5 ? " — дуэль" : ""} · ${leagueName(+o.value)} лига`;
  const on = (id: string, f: () => void) => { const b = document.getElementById(id); if (b) b.onclick = f; };
  on("libbtn", openLibDlg); on("codexbtn", () => openCodex({ http: HTTP, auth: async () => { const h = await helloMsg(); return h.token ? { token: h.token } : h.userId ? { dev: h.userId } : {}; } })); on("mapsbtn", openMapsHub); on("setbtn", openSettings); loadCommander();
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
  $<HTMLInputElement>("#hhp").onchange = (e) => send({ type: "cfg", hiddenHp: (e.target as HTMLInputElement).checked });
  $<HTMLInputElement>("#ranked").onchange = (e) => send({ type: "cfg", ranked: (e.target as HTMLInputElement).checked });
  { const pb = document.getElementById("profbtn"); if (pb) pb.onclick = () => showProfile(); }
  { const tb = document.getElementById("topbtn"); if (tb) tb.onclick = () => openLeaderboard(topGet, myNick(), "fast", showProfile); }
  initMenu(); initMobileTabs();
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
  $("#hprev").onclick = () => histStep(-1); $("#hnext").onclick = () => histStep(1);
  $("#leave").onclick = leaveMatch;
  const rb = document.getElementById("rulesbtn"); if (rb) rb.onclick = showRules;
  $("#nick").oninput = (e) => localStorage.setItem("strat_nick", (e.target as HTMLInputElement).value.slice(0, 24));
  $<HTMLInputElement>("#nick").value = localStorage.getItem("strat_nick") || "";
  const ps = $<HTMLButtonElement>("#pstyle"), pb = $<HTMLInputElement>("#pbadge");
  const syncPs = () => { ps.querySelector("span")!.textContent = pieceStyle === "figures" ? "Фигуры ⇄ фишки" : "Фишки ⇄ фигуры"; ps.dataset.style = pieceStyle; pb.checked = glyphBadge; pb.closest("label")!.hidden = pieceStyle !== "figures"; };
  ps.onclick = togglePieceStyle;
  pb.onchange = () => { glyphBadge = pb.checked; localStorage.setItem("strat.glyphBadge", glyphBadge ? "1" : "0"); draw(); savePrefs(); };
  (window as any).__syncPs = syncPs; syncPs();
  addEventListener("keydown", (e) => { const tg = e.target as HTMLElement;
    if (S?.g && !document.querySelector("#modals .dlg") && !/INPUT|TEXTAREA|SELECT/.test(tg?.tagName || "") && (e.key === "ArrowLeft" || e.key === "ArrowRight" || (e.key === " " && hv?.replay) || (e.key === "Escape" && hv))) {
      if (e.key === "ArrowLeft") { e.preventDefault(); histStep(-1); return; } if (e.key === "ArrowRight" && hv) { e.preventDefault(); histStep(1); return; }
      if (e.key === " ") { e.preventDefault(); togglePlay(); return; } if (e.key === "Escape") { goLive(); return; } }
if (e.key === "Escape" && ultAim) { stopAim(); return; } if (e.key === "Escape" && !document.querySelector("#modals .dlg")) { eui.recruit = null; sel = null; renderHint(); renderInfo(); draw(); }
    if (e.key === " " && S?.phase === "play" && !(e.target as HTMLElement).closest("input,textarea") && !document.querySelector("#modals .dlg")) { e.preventDefault(); endTurn(); } });
  bindBoard(); bindTips();
  new ResizeObserver(() => { if (S?.g) { fitCam(false); draw(); } }).observe($("#stage"));
  setInterval(tick, 250);
  connectHub(); loadOpen(); render(); loadArt(draw); loadFx(draw); loadWalls(draw); t2OnLoad(() => { mmKey = ""; draw(); }); injectIcons();
  const d = LOCAL ? qs.get("demo") : null; if (d) startDemo(+d);
  const j = qs.get("join"); if (j && !d) joinCode(j);
}

// Хуки только для локального плейтеста (localhost + ?devUser): снимок состояния, камера и клик-план «как игрок».
if (LOCAL && (qs.get("devUser") || qs.get("demo"))) { (window as any).__stratS = () => S; (window as any).__stratCam = () => ({ ...cam }); (window as any).__stratPerf = (k = 60) => { const t0 = performance.now(); for (let i = 0; i < k; i++) drawNow(); return (performance.now() - t0) / k; }; (window as any).__stratPend = () => pendAct; (window as any).__stratSel = () => ({ sel, selCell, taps: tapN }); (window as any).__stratFace = () => [...facing.entries()].map(([id, f]) => ({ id, dir: f.dir })); }
// Тест эффектов: подать события сервера в onState (как пришли бы с сокетом). Только dev-сборка (vite вырезает в prod) + localhost + ?fxtest=1.
if (import.meta.env.DEV && LOCAL && qs.get("fxtest") === "1") (window as any).__stratAim = (race: string | null, x = 0, y = 0) => { // тест: прицел ульты своего Вождя (null — снять)
  if (!race) { stopAim(); return; } const ch = S.g.pieces.find((q: any) => q.o === S.you && q.k === "king"); ultAim = { id: "ult", pid: ch?.id ?? -1, r: 2, race, chief: true }; aimCell = [x, y]; draw(); };
if (import.meta.env.DEV && LOCAL && qs.get("fxtest") === "1") (window as any).__stratEvInj = (evs: any[], patch?: (g: any) => void) => {
  const prev = { ...S, g: JSON.parse(JSON.stringify(S.g)) }; if (patch) patch(S.g); S.ev = evs; onState(prev); draw(); return true; };
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
  // ---- s5: мир партии (формы из WIP сервера; S.apSrc/S.raze — догадки) ----
  s5: (o: any = {}) => { const g = S.g, ec = g.ec, me = S.you, en = 1 - me, n = g.size, idx = (x: number, y: number) => y * n + x;
    g.turn = o.turn ?? 14; g.apMax = o.apMax ?? 14; g.ap = o.ap ?? 11;
    S.league = { id: "normal", apBase: 6, apTech: 1, apBld: 1, onceMax: 1, apMax: 14, raceCap: 3, grow: 4, capture: 4, found: 6 };
    const myC = ec.cities.find((c: any) => c.owner === me), enC = ec.cities.find((c: any) => c.owner === en);
    myC.bld = ["barracks", "wall", "forge"]; myC.bhp = { barracks: 14, wall: 9, forge: 20 }; myC.grow = [idx(myC.x - 2, myC.y - 1)];
    enC.bld = ["barracks", "magetower"]; enC.bhp = { barracks: 6, magetower: 18 }; enC.ruin = ["wall"];
    ec.techs[me] = [...new Set([...(ec.techs[me] || [])])];
    ec.towers = [{ id: 10001, owner: me, x: myC.x - 3, y: myC.y - 2 }]; ec.tbhp = { 10001: 7 };
    ec.ct = { [idx(myC.x + 1, myC.y - 1)]: { o: en, n: 2 } }; ec.lost = {};
    const k = g.pieces.find((p: any) => p.o === me && p.k === "king");
    S.terr = { cities: [{ city: myC.id, every: 4, tg: 1, ready: true, left: 0, cost: 12, cells: [[myC.x - 2, myC.y], [myC.x + 2, myC.y], [myC.x + 2, myC.y - 1]] }],
      fnd: o.found === false ? null : k && { id: k.id, x: k.x, y: k.y, left: 2, gold: 20 }, raceAp: { n: 2, have: 7, per: 3, cap: 3, label: "Сила огня", kind: "fire" } };
    ec.res[me].gold = Math.max(ec.res[me].gold || 0, 64);
    if (o.hidden) { S.hiddenHp = true; g.pieces.forEach((p: any, i: number) => { if (p.o !== me) p.hs = ["ok", "hurt", "low"][i % 3]; });
      enC.bhs = { barracks: "hurt", magetower: "ok" }; }
    S.clock = { turnEnds: Date.now() - (S.skew || 0) + (o.left ?? 47000), turnMs: o.total ?? 90000, reserve: [60000, 60000] };
    gsCache = { s: null, g: null } as any; render(); tick(); },
  // ---- s6: арт построек; стадии чуда — догадка city.wonder{stage} ----
  s6: (o: any = {}) => { const g = S.g, ec = g.ec, me = S.you, en = 1 - me; const myC = ec.cities.find((c: any) => c.owner === me && c.cap) || ec.cities.find((c: any) => c.owner === me), enC = ec.cities.find((c: any) => c.owner === en);
    const rb: Record<string, string> = { fire: "crucible", ice: "glacier", water: "harbor", stone: "quarry", nature: "sacredgrove", lightning: "lightningrod" };
    myC.lvl = o.lvl ?? 1; myC.bld = o.bld || ["barracks", "magetower", "forge", "library", "market", rb[g.races[me]] || "granary"]; myC.bhp = { barracks: 7, magetower: 9, forge: 10, library: 4, market: 10 };
    if (o.lv2) myC.bld.push("forge"); if (o.ph) myC.bld.push(...o.ph);
    enC.bld = o.enBld || ["barracks", "stable", "granary", rb[g.races[en]] || "wall"]; enC.bhp = { barracks: 6, stable: 12, granary: 10 }; enC.ruin = ["wall"];
    delete myC.wonder; if (o.stage) { if (o.stage >= 4) myC.bld.push("wonder"); else myC.wonder = { stage: o.stage }; }
    ec.res[me].gold = Math.max(ec.res[me].gold || 0, 80); gsCache = { s: null, g: null } as any; render(); },
  dbg: () => ({ S, G: gs() }),
  wpop: (mine = true) => { const c = S.g.ec.cities.find((q: any) => (mine ? q.owner === S.you : q.owner !== S.you)); showWonder(c); },
  cam: (x: number, y: number, z?: number) => { if (z) cam.z = z; centerOn(x, y); },
  wmode: (m: any) => { W.mode = m; draw(); }, wtest: (v: any) => { wallTest = v; draw(); }, capt: (id: number) => { econFx({ e: "capture", city: id, by: S.you, cap: false }); draw(); },
  fx: (e: any) => { const r: any = worldEvent(e, S.you, gs()!, (i: number) => S.seats[i]?.nick || "?"); const now = performance.now(); if (r?.fx) fx.push({ ...r.fx, t: now }); if (r?.dust) rubble.push({ ...r.dust, t: now }); if (r?.toast) toast(r.toast[0], r.toast[1], r.toast[2]); draw(); return r; },
  apTip: () => { const el = document.querySelector<HTMLElement>(".apbox2"); el?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); el?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true })); },
  ratedLobby: () => { (window as any).__stratDev.lobby8("ffa", 6); S.ranked = true; S.rated = true; S.seats.forEach((x: any) => x && (x.race = null, x.picked = false, x.rating = 1400 + ((x.nick.length * 97) % 400), x.col = undefined));
    S.seats[0].col = 0; S.seats[1].col = 1; S.seats[3].col = 3; S.seats[2].prov = true; S.raceDraw = { commit: "9f3ac1e07b5d42aa", w: [85, 15] }; renderLobby(); },
  drum: (n = 6) => { const races = ["fire", "ice", "water", "stone", "nature", "lightning"];
    S.raceDraw = { commit: "9f3ac1e07b5d42aa", seed: "5be2c09d1f7e", rolls: Array.from({ length: n }, (_, i) => ({ seat: i, race: races[(i * 4 + 1) % 6], fromFav: i % 3 !== 2, roll: 0.3, pool: 6, favPool: 3 })), order: Array.from({ length: n }, (_, i) => i) };
    if (S.seats.length < n) S.seats = Array.from({ length: n }, (_, i) => S.seats[i] || { nick: ["Алекс", "Сайфер", "Мира", "Горн", "Ласка", "Вихрь", "Тень", "Бот"][i] });
    drumReveal(S, { ...raceD(), nick: (i: number) => S.seats[i]?.nick || "?", me: S.you }, () => {}); },
  fav: () => openFavDlg(),
  /** Демо-история: n полуходов с событиями (ход, удар с разбором, постройка, техно, захват земли). */
  hist: (n = 8) => { const G0 = S.g, me = S.you ?? 0, N = G0.races.length; rec.reset(S.code || "demo"); const t0 = Math.max(1, G0.turn - Math.ceil(n / N));
    for (let k = 0; k < n; k++) { const g = structuredClone({ ...G0, map: undefined }); g.map = G0.map; g.turn = t0 + Math.floor(k / N); g.cur = k % N; g.v = 1000 + k; const side = g.cur;
      const mine = g.pieces.filter((p: any) => p.o === side && p.k !== "king"), foe = g.pieces.find((p: any) => p.o !== side), a = mine[k % Math.max(1, mine.length)], ev: any[] = [];
      if (a) { ev.push({ e: "move", id: a.id, x: a.x, y: a.y }); if (foe && k % 2 === 0) ev.push({ e: "hit", id: a.id, t: foe.id, dmg: 2 + (k % 3), hp: Math.max(1, (foe.hp ?? 6) - 2), ...(k % 4 === 0 ? { why: [{ label: "Атака: " + (KIND_NAME[a.k as Kind] || "фигура"), n: 4 }, { label: "Высота (холм)", n: 1 }, { label: "Броня цели", n: -2 }, { label: "Пассивка «Ярость»", n: 1 }] } : {}) }); }
      if (k % 3 === 1) ev.push({ e: "build", b: "barracks", city: g.ec?.cities?.find((c: any) => c.o === side)?.id, side });
      if (k % 4 === 2) ev.push({ e: "tech", side, t: (TECHS as any[])[k % TECHS.length]?.id });
      if (k % 5 === 3) ev.push({ e: "tcap", x: 7, y: 13, owner: (side + 1) % N, by: side });
      if (k === n - 1) { g.pieces = G0.pieces; g.turn = G0.turn; g.cur = G0.cur; g.v = G0.v; }
      rec.push(S.code || "demo", k === n - 1 ? G0 : g, ev); }
    renderMoves(); return rec.frames.length; },
  view: (i: number) => histOpen(i), live: () => goLive(), hv: () => (hv ? { idx: hv.idx, replay: !!hv.replay, playing: hv.playing, speed: hv.speed } : null),
  replay: () => { const r = curRec(false); if (r) histOpen(0, r); return !!r; },
  /** §14.I для скриншотов: ответы WS повторов (moves/frame) и кадры записи. */
  rpMsg: (m: any) => rpMsg(m), stReplay: (id: string, n: number) => { S.replay = { id, n }; }, recFrames: () => rec.frames.map((f) => ({ turn: f.turn, cur: f.cur, g: { ...f.g, map: undefined }, ev: f.ev })),
  recKeep: (n: number) => { rec.frames = rec.frames.slice(-n); rec.preN = 0; renderMoves(); return rec.frames.length; }, recLen: () => rec.frames.length, openRp: (id: string) => openReplay(id),
  hvSub: () => hv?.sub?.i ?? null, saveRec: (saved = true) => { const r = curRec(saved); return r ? lsPut(r) : false; },
  ffa: (n: number) => { S.seats = Array.from({ length: n }, (_, i) => S.seats[i] || { nick: ["Алекс", "Сайфер", "Мира", "Горн", "Ласка", "Вихрь", "Тень", "Бот"][i], online: i !== 3 }); S.g.races = Array.from({ length: n }, (_, i) => S.g.races[i] || ["water", "stone", "nature", "lightning", "fire", "ice"][i % 6]); S.mode = "ffa"; render(); } };
(window as any).__stratFocus = (id: number) => { const p = S?.g?.pieces?.find((q: any) => q.id === id); if (!p) return; sel = id; centerOn(p.x, p.y); renderInfo(); draw(); };
if (LOCAL && (qs.get("demo") || qs.get("menudemo"))) { (window as any).__stratRatingDemo = () => ({ leagues: { fast: { r: 1612, rd: 48, games: 41, w: 25, l: 14, d: 2, peak: 1660 }, normal: { r: 1532, rd: 72, games: 17, w: 9, l: 7, d: 1, peak: 1561 }, tactic: { r: 1500, rd: 190, games: 3, w: 2, l: 1, d: 0, peak: 1514 } } });
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
