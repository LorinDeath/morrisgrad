// Чат партии. Всё — только текст (textContent), никакого innerHTML с пользовательскими данными.
// Протокол (уточняется в ТЗ §14, сервер — у балансового воркера):
//   → { type: "chat", ch: "all" | "team" | "w", to?: ник, text }      ← { type: "chat", ch, from, fromNick, to?, toNick?, text, ts, id? }
//   → { type: "chat_report", id?, user, text }                        ← { type: "chat_err", err }
// Мьют — локальный (список в localStorage), сервер ничего не узнаёт.
import { ic } from "./icons";

type Msg = { ch: string; from?: string; fromNick?: string; to?: string; toNick?: string; text: string; ts?: number; id?: string; mine?: boolean; sys?: boolean };
type Ctx = { send: (o: any) => void; me: () => { nick: string; id?: string } | null; players: () => { nick: string; id?: string; team?: number; you?: boolean }[]; team: () => boolean; toast: (t: string, k?: any, i?: string) => void };
const MAX = 200, LEN = 200;
let C: Ctx | null = null, tab: "all" | "team" | "w" = "all", unread = 0, open = false, list: Msg[] = [];
const muted = new Set<string>((() => { try { return JSON.parse(localStorage.getItem("strat.mute") || "[]"); } catch { return []; } })());
const saveMute = () => { try { localStorage.setItem("strat.mute", JSON.stringify([...muted])); } catch {} };
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s);
const clean = (s: string) => String(s ?? "").replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, LEN);
const key = (m: Msg) => m.from || m.fromNick || "";

export function chatInit(ctx: Ctx) {
  C = ctx; const box = $("#chat"), inp = $<HTMLInputElement>("#chatin"); if (!box || !inp) return;
  $("#chathead")!.onclick = () => chatToggle(); $("#chatfab")!.onclick = () => chatToggle(true);
  box.querySelectorAll<HTMLButtonElement>("[data-ctab]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); tab = b.dataset.ctab as any; renderList(); }));
  $("#chatform")!.onsubmit = (e) => { e.preventDefault(); submit(); };
  inp.oninput = () => suggest(); inp.onkeydown = (e) => {
    if (e.key === "Tab" && $("#chatac")!.childElementCount) { e.preventDefault(); ($("#chatac")!.firstElementChild as HTMLElement).click(); }
    if (e.key === "Escape") { $("#chatac")!.replaceChildren(); inp.blur(); } e.stopPropagation(); };
  inp.maxLength = LEN + 40;
}
export function chatReset() { list = []; unread = 0; renderList(); badge(); }
export function chatShow(on: boolean, team: boolean) {
  const box = $("#chat"), fab = $("#chatfab"); if (!box || !fab) return; box.hidden = !on; fab.hidden = !on;
  const tt = box.querySelector<HTMLElement>('[data-ctab="team"]'); if (tt) tt.hidden = !team; if (!team && tab === "team") tab = "all";
}
export function chatToggle(force?: boolean) {
  open = force ?? !open; document.body.classList.toggle("chat-open", open); $("#chat")?.classList.toggle("open", open);
  if (open) { unread = 0; badge(); renderList(); setTimeout(() => $<HTMLInputElement>("#chatin")?.focus({ preventScroll: true }), 50); }
}
/** Входящее сообщение от сервера. */
export function chatRecv(m: any) {
  if (m.type === "chat_err") { sys(m.err === "muted" ? "Вы временно не можете писать" : m.err === "rate" ? "Слишком часто — подождите немного" : m.err === "no_user" ? "Такого игрока нет в партии" : "Сообщение не отправлено"); return; }
  const me = C?.me(); const msg: Msg = { ch: m.ch || "all", from: m.from, fromNick: clean(m.fromNick || m.nick || "?").slice(0, 24), to: m.to, toNick: clean(m.toNick || "").slice(0, 24), text: clean(m.text), ts: m.ts, id: m.id };
  msg.mine = !!me && (m.from ? m.from === me.id : msg.fromNick === me.nick); if (!msg.mine && muted.has(key(msg))) return;
  push(msg); if (!open && !msg.mine) { unread++; badge(); }
}
function sys(text: string) { push({ ch: "sys", text, sys: true }); }
function push(m: Msg) { list.push(m); if (list.length > MAX) list.shift(); renderList(); }
function badge() { for (const el of document.querySelectorAll<HTMLElement>(".chat-unread")) { el.textContent = unread > 9 ? "9+" : String(unread); el.hidden = !unread; } }

function submit() {
  const inp = $<HTMLInputElement>("#chatin")!, raw = inp.value.trim(); if (!raw || !C) return; $("#chatac")!.replaceChildren();
  const w = raw.match(/^\/(?:w|ш|whisper|msg|tell)\s+(\S+)\s+([\s\S]+)$/i);
  if (/^\/(w|ш|whisper|msg|tell)\b/i.test(raw) && !w) { sys("Шёпот: /w Имя текст"); return; }
  if (/^\/(mute|unmute)\s+\S+/i.test(raw)) { const [, cmd, nick] = raw.match(/^\/(\w+)\s+(\S+)/)!; const p = C.players().find((x) => x.nick.toLowerCase() === nick.toLowerCase());
    if (!p) { sys("Нет такого игрока: " + nick); } else { setMute(p.id || p.nick, cmd.toLowerCase() === "mute"); sys((cmd.toLowerCase() === "mute" ? "Скрыт: " : "Снова видно: ") + p.nick); } inp.value = ""; return; }
  if (w) { const p = C.players().find((x) => x.nick.toLowerCase() === w[1].toLowerCase() && !x.you); if (!p) { sys("Нет такого игрока: " + w[1]); return; }
    C.send({ type: "chat", ch: "w", to: p.id || p.nick, toNick: p.nick, text: clean(w[2]) }); }
  else if (tab === "w") { sys("Шёпот: /w Имя текст"); return; } else C.send({ type: "chat", ch: tab === "team" && C.team() ? "team" : "all", text: clean(raw) });
  inp.value = "";
}
/** Автодополнение имён после «/w ». */
function suggest() {
  const inp = $<HTMLInputElement>("#chatin")!, ac = $("#chatac")!; ac.replaceChildren(); if (!C) return;
  const m = inp.value.match(/^\/(w|ш|whisper|msg|tell|mute|unmute)\s+(\S*)$/i); if (!m) return;
  for (const p of C.players().filter((x) => !x.you && x.nick.toLowerCase().startsWith(m[2].toLowerCase())).slice(0, 5)) {
    const b = document.createElement("button"); b.type = "button"; b.className = "ac"; b.textContent = p.nick;
    b.onclick = () => { inp.value = `/${m[1]} ${p.nick} `; ac.replaceChildren(); inp.focus(); }; ac.appendChild(b); }
}
export function setMute(k: string, on: boolean) { if (on) muted.add(k); else muted.delete(k); saveMute(); renderList(); }
function renderList() {
  const box = $("#chatlog"); if (!box) return; const me = C?.me(); box.replaceChildren();
  for (const m of list.filter((x) => tab === "all" || x.sys || (tab === "team" ? x.ch === "team" || x.ch === "w" : x.ch === "w"))) {
    if (!m.mine && !m.sys && muted.has(key(m))) continue;
    const row = document.createElement("div"); row.className = "cm " + (m.sys ? "sys" : m.ch === "w" ? "w" : m.ch === "team" ? "team" : "") + (m.mine ? " mine" : "");
    if (m.sys) { row.textContent = m.text; box.appendChild(row); continue; }
    const who = document.createElement("b");
    who.textContent = m.ch === "w" ? (m.mine ? `Вы шепчете ${m.toNick || m.to || "?"}` : `${m.fromNick} шепчет вам`) : (m.ch === "team" ? "[союз] " : "") + (m.mine ? me?.nick || "Вы" : m.fromNick || "?");
    const tx = document.createElement("span"); tx.textContent = m.text; row.append(who, document.createTextNode(": "), tx);
    if (!m.mine) { const more = document.createElement("span"); more.className = "cm-acts";
      const mu = document.createElement("button"); mu.type = "button"; mu.title = "Скрыть сообщения игрока"; mu.innerHTML = ic("mute"); mu.onclick = () => { setMute(key(m), true); sys("Скрыт: " + m.fromNick + " (вернуть: /unmute " + m.fromNick + ")"); };
      const rp = document.createElement("button"); rp.type = "button"; rp.title = "Пожаловаться"; rp.innerHTML = ic("flag"); rp.onclick = () => { C?.send({ type: "chat_report", id: m.id, user: m.from || m.fromNick, text: m.text }); C?.toast("Жалоба отправлена модераторам", "info", "flag"); rp.disabled = true; };
      const wh = document.createElement("button"); wh.type = "button"; wh.title = "Ответить шёпотом"; wh.innerHTML = ic("chat"); wh.onclick = () => { const i = $<HTMLInputElement>("#chatin")!; i.value = `/w ${m.fromNick} `; i.focus(); };
      more.append(wh, mu, rp); row.appendChild(more); }
    box.appendChild(row);
  }
  box.scrollTop = box.scrollHeight;
  $("#chat")?.querySelectorAll<HTMLElement>("[data-ctab]").forEach((b) => b.classList.toggle("on", b.dataset.ctab === tab));
}
/** Для демо/скриншотов. */
export function chatDemo() { chatRecv({ type: "chat", ch: "all", fromNick: "Соперник", from: "u2", text: "Хорошая партия. Посмотрим, как вы справитесь с вьюгой" }); chatRecv({ type: "chat", ch: "w", fromNick: "Соперник", from: "u2", text: "ваш Вождь открыт слева" }); chatRecv({ type: "chat", ch: "all", fromNick: C?.me()?.nick || "Вы", text: "gg, удачи!" }); }
