// Оверлей входа «Проклятых» для гостей (и «Сессия истекла» во время игры).
// Грузится ЛЕНИВО (import() из MorrisCurse/index.astro) — только когда вход нужен: вошедший игрок этот модуль,
// русскую локализацию Clerk и стили не скачивает вовсе. Форма — тот же компонент Clerk <SignIn/>/<SignUp/>, что
// в окне сайта (те же способы входа из панели Clerk), с нашим видом и языком (src/lib/clerkTheme.ts).
import { mcClerkAppearance } from "../lib/clerkTheme";
// коды ошибок — общий реестр (src/errors/codes.js): окно с кодом, «Скопировать код», «Повторить», журнал ошибок сервера
import { showError } from "../pages/MorrisCurse/_core/boot/errorBox.js";
import { codeInfo } from "../errors/codes.js";

export type GateMode = "start" | "expired" | "invalid" | "error";
export type GateResult = "signed-in" | "guest" | "later";
export type GateOpts = { host: HTMLElement; mode: GateMode; code?: string; tab?: "in" | "up"; name?: string };

const PENDING = "mc-auth-pending"; // вход через Google/Discord/Twitch уходит со страницы — по возвращении продолжаем игру
const DONE_HASH = "#mc-auth-done";
const clerk = () => (window as any).Clerk;

// В оверлее свои вкладки «Войти/Регистрация» — ссылку-переключатель в подвале формы прячем (иначе она уводит на страницу Clerk)
const appearance = {
  ...mcClerkAppearance,
  elements: { ...mcClerkAppearance.elements, rootBox: { width: "100%" }, cardBox: { ...mcClerkAppearance.elements.cardBox, width: "100%", maxWidth: "100%", boxShadow: "none" }, footerAction: { display: "none" } },
};

const inAppBrowser = () => /FBAN|FBAV|Instagram|Telegram|Line\/|VKClient|; wv\)|MicroMessenger|YaBrowser\/[\d.]+ \(lite\)/i.test(navigator.userAgent || "");

let root: HTMLElement | null = null;
let busy: Promise<GateResult> | null = null;
let finish: ((r: GateResult) => void) | null = null;
let unlisten: (() => void) | null = null;
let mountTimer = 0;

function esc(s: string) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

/** масштаб оверлея = «Размер интерфейса» игрока (ui-cursed-rework: --ui-s / localStorage mc_ui_scale_*), но не шире экрана */
function applyScale() {
  if (!root) return;
  const mob = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || matchMedia("(pointer: coarse)").matches;
  let s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-s")) || 0;
  if (!s) { try { const v = Number(localStorage.getItem(mob ? "mc_ui_scale_mob" : "mc_ui_scale_pc")); if (v > 0) s = v / 100; } catch (_) {} }
  if (!s) s = 1;
  const wide = innerWidth >= 860 && innerHeight >= 520;
  const baseW = wide ? 820 : 340; // узкий экран: панель сама сжимается до ширины (max-width 100%), масштаб — лишь бы ≥ 340 CSS px
  s = Math.max(0.7, Math.min(s, 1.5, (innerWidth - 16) / baseW));
  root.style.setProperty("--mc-auth-s", String(Math.round(s * 100) / 100));
  root.classList.toggle("wide", wide);
}

const CSS = `
.mc-auth{position:fixed;inset:0;z-index:200000;display:flex;align-items:center;justify-content:center;overflow:auto;-webkit-overflow-scrolling:touch;
  background:radial-gradient(ellipse at 50% 30%,rgba(46,22,64,.55),rgba(5,4,10,.96) 70%),#05040a;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-sizing:border-box;
  font-family:'Exo 2',system-ui,sans-serif;color:#dcd3e6;animation:mcAuthIn .25s ease-out}
@keyframes mcAuthIn{from{opacity:0}to{opacity:1}}
.mc-auth[hidden]{display:none}
.mc-auth-panel{zoom:var(--mc-auth-s,1);width:400px;max-width:100%;margin:auto;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;
  border:14px solid transparent;border-image:url(/mc-ui/frame_window.png) 16 fill / 32px stretch;background:url(/mc-ui/bg_dark.png) 0 0/128px 128px repeat,#120e1c;background-clip:padding-box;image-rendering:pixelated;
  box-shadow:0 0 0 2px #000,0 12px 40px rgba(0,0,0,.75);padding:10px}
.mc-auth.wide .mc-auth-panel{width:800px;flex-direction:row;align-items:stretch}
.mc-auth-art{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;padding:6px 4px}
.mc-auth.wide .mc-auth-art{flex:1 1 0;padding:10px 18px;border-right:2px solid #2e1640}
.mc-auth-logo{font-family:'Shket','Cinzel',serif;font-size:34px;letter-spacing:.08em;color:#e2b6ee;text-shadow:0 0 18px rgba(196,106,216,.55),0 2px 0 #000;margin:0;line-height:1}
.mc-auth.wide .mc-auth-logo{font-size:46px}
.mc-auth-sub{font-size:11px;letter-spacing:.25em;color:#7d7090;text-transform:uppercase}
.mc-auth-pitch{font-size:13px;line-height:1.45;color:#a99cb8;margin:0;max-width:340px}
.mc-auth-heroes{display:flex;gap:6px;justify-content:center}
.mc-auth-heroes img{width:48px;height:48px;image-rendering:pixelated;border:2px solid #2e1640;background:#0b0a12}
.mc-auth.wide .mc-auth-heroes img{width:64px;height:64px}
.mc-auth:not(.wide) .mc-auth-heroes,.mc-auth:not(.wide) .mc-auth-pitch.long{display:none}
.mc-auth-formcol{flex:1 1 0;display:flex;flex-direction:column;gap:8px;min-width:0}
.mc-auth-note{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;padding:8px 10px;border:1px solid #7a2e8a;background:rgba(46,22,64,.45);color:#e2b6ee;font-size:13px;text-align:center}
.mc-auth-note.bad{border-color:#f08a8a;background:rgba(80,20,30,.35);color:#f8c4c4}
.mc-auth-note[hidden],.mc-auth-hint[hidden]{display:none}
.mc-auth-code{font:12px ui-monospace,monospace;padding:2px 6px;border:1px solid currentColor;background:#0b0a12;color:inherit;cursor:pointer;border-radius:2px;min-height:28px}
.mc-auth-tabs{display:flex;gap:4px}
.mc-auth-tab{flex:1;min-height:40px;font:600 14px 'Exo 2',system-ui,sans-serif;color:#a99cb8;background:#0b0a12;border:1px solid #2e1640;border-bottom:2px solid #2e1640;cursor:pointer;border-radius:2px}
.mc-auth-tab[aria-selected=true]{color:#fff;background:linear-gradient(180deg,#2e1640,#1b1529);border-color:#7a2e8a;border-bottom-color:#c46ad8}
.mc-auth-tab:focus-visible,.mc-auth-guest:focus-visible,.mc-auth-code:focus-visible{outline:2px solid #c46ad8;outline-offset:2px}
.mc-auth-pane{min-height:120px}
.mc-auth-pane[hidden]{display:none}
.mc-auth-pane .cl-rootBox,.mc-auth-pane .cl-cardBox{width:100%;max-width:100%}
.mc-auth-loading{display:flex;align-items:center;justify-content:center;gap:8px;min-height:120px;color:#7d7090;font-size:13px}
.mc-auth-loading i{width:14px;height:14px;border:2px solid #2e1640;border-top-color:#c46ad8;border-radius:50%;animation:mcAuthSpin .8s linear infinite}
@keyframes mcAuthSpin{to{transform:rotate(360deg)}}
.mc-auth-guest{min-height:40px;background:transparent;border:1px dashed #5a4d6e;color:#a99cb8;font:13px 'Exo 2',system-ui,sans-serif;cursor:pointer;border-radius:2px}
.mc-auth-guest:hover{color:#e2b6ee;border-color:#c46ad8}
.mc-auth-hint{font-size:11px;color:#7d7090;text-align:center;line-height:1.4}
@media (pointer:coarse){.mc-auth-tab,.mc-auth-guest,.mc-auth-code{min-height:max(44px,calc(44px / var(--mc-auth-s,1)))}} /* палец: ≥ 44 px при любом масштабе (как тач-кнопки игры) */
@media (prefers-reduced-motion:reduce){.mc-auth{animation:none}.mc-auth-loading i{animation:none}}
`;

function build(host: HTMLElement) {
  if (root && root.isConnected && root.parentElement === host) return root;
  if (!document.getElementById("mc-auth-css")) { const st = document.createElement("style"); st.id = "mc-auth-css"; st.textContent = CSS; document.head.appendChild(st); }
  root?.remove();
  root = document.createElement("div");
  root.className = "mc-auth"; root.hidden = true;
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "mc-auth-title");
  root.innerHTML = `<div class="mc-auth-panel">
    <div class="mc-auth-art">
      <h2 class="mc-auth-logo" id="mc-auth-title">ПРОКЛЯТЫЕ</h2>
      <div class="mc-auth-sub">МоррисГрад · Обитель Смерти</div>
      <div class="mc-auth-heroes" aria-hidden="true"><img src="/mc-ui/avatars/alzi_cursed_128.png" alt="" loading="lazy"><img src="/mc-ui/avatars/kyut_cursed_128.png" alt="" loading="lazy"><img src="/mc-ui/avatars/leyr_cursed_128.png" alt="" loading="lazy"></div>
      <p class="mc-auth-pitch">Войдите в аккаунт МоррисГрада — герой, добыча и задания сохранятся и будут с вами на любом устройстве.</p>
      <p class="mc-auth-pitch long">Тот же вход, что на сайте и форуме.</p>
    </div>
    <div class="mc-auth-formcol">
      <div class="mc-auth-note" data-note hidden></div>
      <div class="mc-auth-tabs" role="tablist">
        <button class="mc-auth-tab" role="tab" id="mc-auth-tab-in" aria-controls="mc-auth-in" data-tab="in">Войти</button>
        <button class="mc-auth-tab" role="tab" id="mc-auth-tab-up" aria-controls="mc-auth-up" data-tab="up">Регистрация</button>
      </div>
      <div class="mc-auth-pane" role="tabpanel" id="mc-auth-in" aria-labelledby="mc-auth-tab-in"><div class="mc-auth-loading"><i></i>Загружаем форму входа…</div></div>
      <div class="mc-auth-pane" role="tabpanel" id="mc-auth-up" aria-labelledby="mc-auth-tab-up" hidden><div class="mc-auth-loading"><i></i>Загружаем форму…</div></div>
      <div class="mc-auth-hint" data-inapp hidden>Похоже, это встроенный браузер приложения: вход через Google здесь может не работать. Откройте страницу в Chrome или Safari — или войдите через Discord, Twitch или почту.</div>
      <button class="mc-auth-guest" data-guest>Играть как гость</button>
      <div class="mc-auth-hint" data-guest-hint>Гостем можно играть сразу, но прогресс сохранится только в этом браузере.</div>
    </div>
  </div>`;
  host.appendChild(root);
  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab as "in" | "up")));
  root.addEventListener("keydown", (e) => { e.stopPropagation(); }); // клавиши формы не уходят в игру (WASD, пробел, хоткеи)
  root.addEventListener("keyup", (e) => e.stopPropagation());
  return root;
}

let mounted = { in: false, up: false };
let curTab: "in" | "up" = "in";
function returnUrl() { return location.origin + location.pathname + location.search + DONE_HASH; }
function compProps() {
  const back = returnUrl();
  return { appearance, routing: "virtual", oauthFlow: "redirect", forceRedirectUrl: back, signUpForceRedirectUrl: back, signInForceRedirectUrl: back, fallbackRedirectUrl: back, signUpFallbackRedirectUrl: back, signInFallbackRedirectUrl: back } as any;
}
function mountTab(t: "in" | "up") {
  const c = clerk(); if (!c || !root || mounted[t]) return;
  const el = root.querySelector<HTMLElement>(t === "in" ? "#mc-auth-in" : "#mc-auth-up")!;
  try {
    // помечаем «ушли на вход» — если Google/Discord/Twitch уведут со страницы, по возвращении продолжим игру
    el.addEventListener("click", () => { try { sessionStorage.setItem(PENDING, String(Date.now())); } catch (_) {} }, { capture: true });
    el.innerHTML = "";
    if (t === "in") c.mountSignIn(el, compProps()); else c.mountSignUp(el, compProps());
    mounted[t] = true;
    clearTimeout(mountTimer);
    mountTimer = window.setTimeout(() => { if (root && !el.querySelector(".cl-rootBox, .cl-card, [class*='cl-']")) showNote("MC-A05", true); }, 9000);
  } catch (e) { console.warn("[mc-auth] mount", e); showNote("MC-A05", true); }
}
function selectTab(t: "in" | "up") {
  if (!root) return; curTab = t;
  selectTabUi(t);
  mountTab(t);
}
function showNote(code: string | null, bad = false, text?: string) {
  const n = root?.querySelector<HTMLElement>("[data-note]"); if (!n) return;
  if (!code && !text) { n.hidden = true; return; }
  n.hidden = false; n.classList.toggle("bad", bad);
  const retry = code === "MC-A01" || code === "MC-A05";
  // текст — из общего реестра кодов (src/errors/codes.js), код виден в самой форме и копируется
  n.innerHTML = `<span>${esc(text || (code ? codeInfo(code).msg : ""))}</span>${code ? `<button class="mc-auth-code" title="Скопировать код ошибки">${esc(code)} · копировать</button>` : ""}${retry ? `<button class="mc-auth-code" data-retry>Повторить</button>` : ""}`;
  n.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => location.reload());
  n.querySelector<HTMLButtonElement>(".mc-auth-code:not([data-retry])")?.addEventListener("click", async (ev) => {
    const b = ev.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(code!); b.textContent = code + " · скопировано"; } catch (_) { b.textContent = code!; }
  });
  // сбой формы (A01 — Clerk не загрузился, A05 — форма не открылась): окно реестра с кодом, «Повторить» и записью в журнал ошибок сервера.
  // A02/A03 — штатные состояния оверлея («Сессия истекла», «Сервер не принял вход»): только строка в форме
  if (retry) showError(code!, { host: root!, soft: true, autoClose: 10000, detail: text || "", onRetry: () => location.reload() });
}

function teardown() {
  clearTimeout(mountTimer);
  const c = clerk();
  try { if (mounted.in) c?.unmountSignIn(root!.querySelector("#mc-auth-in")); } catch (_) {}
  try { if (mounted.up) c?.unmountSignUp(root!.querySelector("#mc-auth-up")); } catch (_) {}
  mounted = { in: false, up: false };
  unlisten?.(); unlisten = null;
  window.removeEventListener("resize", applyScale);
  window.removeEventListener("mc-ui-scale", applyScale);
  if (location.hash === DONE_HASH) history.replaceState(history.state, "", location.pathname + location.search);
  if (root) { root.hidden = true; root.querySelectorAll(".mc-auth-pane").forEach((p, i) => { p.innerHTML = `<div class="mc-auth-loading"><i></i>${i ? "Загружаем форму…" : "Загружаем форму входа…"}</div>`; }); }
}

/** вход обнаружен (сессия Clerk появилась) — закрываем */
function done(r: GateResult) {
  if (r === "signed-in") { try { sessionStorage.removeItem(PENDING); } catch (_) {} }
  teardown();
  const f = finish; finish = null; busy = null; f?.(r);
}

/** открыть оверлей. Промис: signed-in — вошли (сессия есть), guest — «Играть как гость», later — «Продолжить» (истёкшая сессия, связь остаётся) */
export function openAuthGate(opts: GateOpts): Promise<GateResult> {
  const el = build(opts.host);
  if (busy) { applyMode(opts); return busy; }
  busy = new Promise<GateResult>((res) => { finish = res; });
  applyMode(opts);
  el.hidden = false;
  applyScale();
  window.addEventListener("resize", applyScale);
  window.addEventListener("mc-ui-scale", applyScale);
  const c = clerk();
  if (!c?.loaded) { showNote("MC-A01", true); }
  else {
    // русский язык и вид — общие для сайта и игры: clerk({ appearance, localization }) в astro.config.mjs
    // invalid при живой сессии Clerk: сервер не принял её токен (тихий повтор уже был) — та же сессия не поможет,
    // нужен выход и новый вход; до этого присутствие user не считаем «вошёл»
    let stale = opts.mode === "invalid" && !!c.user;
    const off = c.addListener?.(({ user }: any) => { if (!user) stale = false; else if (!stale && finish) done("signed-in"); });
    unlisten = typeof off === "function" ? off : null;
    if (stale) showRelogin(c);
    else if (c.user) { queueMicrotask(() => done("signed-in")); return busy; }
    else selectTab(opts.tab || (opts.mode === "start" ? curTab : "in")); // «Сессия истекла» — сразу «Войти»
  }
  (el.querySelector("[data-inapp]") as HTMLElement).hidden = !inAppBrowser();
  setTimeout(() => el.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }), 50);
  return busy;
}

function showRelogin(c: any) {
  const el = root!.querySelector<HTMLElement>("#mc-auth-in")!;
  selectTabUi("in");
  el.innerHTML = `<div class="mc-auth-loading" style="flex-direction:column"><span>Вход нужно обновить</span><button class="mc-auth-tab" data-relogin style="flex:none;padding:0 18px" aria-selected="true">Войти заново</button></div>`;
  el.querySelector<HTMLButtonElement>("[data-relogin]")!.onclick = async () => {
    const back = location.origin + location.pathname + location.search + "#mc-auth-out";
    try { await c.signOut({ redirectUrl: back }); } catch (e) { console.warn("[mc-auth] signOut", e); }
    if (location.hash === "#mc-auth-out") history.replaceState(history.state, "", location.pathname + location.search);
    mounted.in = false; selectTab("in");
  };
}
function selectTabUi(t: "in" | "up") {
  root!.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  (root!.querySelector("#mc-auth-in") as HTMLElement).hidden = t !== "in";
  (root!.querySelector("#mc-auth-up") as HTMLElement).hidden = t !== "up";
}

function applyMode(o: GateOpts) {
  if (!root) return;
  const guest = root.querySelector<HTMLButtonElement>("[data-guest]")!;
  const hint = root.querySelector<HTMLElement>("[data-guest-hint]")!;
  guest.onclick = null;
  if (o.mode === "expired") {
    showNote(o.code || "MC-A02", true, `Сессия истекла${o.name ? ` (${o.name})` : ""} — войдите снова, игра продолжится с того же места`);
    guest.textContent = "Продолжить без входа"; hint.textContent = "Связь с игрой сохранится до перезахода; войти можно позже кнопкой «Войти» вверху.";
    guest.onclick = () => done("later");
  } else if (o.mode === "invalid") {
    showNote(o.code || "MC-A03", true, "Сервер не принял вход — войдите снова");
    guest.textContent = "Играть как гость"; hint.textContent = "Прогресс гостя хранится только в этом браузере.";
    guest.onclick = () => done("guest");
  } else if (o.mode === "error") {
    showNote(o.code || "MC-A01", true);
    guest.textContent = "Играть как гость"; hint.textContent = "Гостем можно играть сразу, но прогресс сохранится только в этом браузере.";
    guest.onclick = () => done("guest");
  } else {
    showNote(null);
    guest.textContent = "Играть как гость"; hint.textContent = "Гостем можно играть сразу, но прогресс сохранится только в этом браузере.";
    guest.onclick = () => done("guest");
  }
}

export function closeAuthGate() { if (finish) done("later"); }
export const authPendingKey = PENDING;
