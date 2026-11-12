// Гостевой прогресс Лоропедии: всё хранится только в этом браузере (localStorage), на сервер не уходит.
import { ACHIEVEMENTS, EGGS, RANKS } from "../../lib/loropedia/play";
import { STORAGE_KEY as READER_KEY, loadState } from "../../lib/loropedia/progress";

export const PLAY_KEY = "lp-play-v1";
export type PlayState = {
  v: 1; xp: number; read: Record<string, number>; days: string[]; eggs: string[]; ach: Record<string, number>;
  mapOpens: string[]; quiz: { played: number; best: number }; who: { streak: number; best: number }; tl: number; cmp: number; dayRead: string; dsQuiz: boolean;
};
const empty = (): PlayState => ({ v: 1, xp: 0, read: {}, days: [], eggs: [], ach: {}, mapOpens: [], quiz: { played: 0, best: 0 }, who: { streak: 0, best: 0 }, tl: 0, cmp: 0, dayRead: "", dsQuiz: false });

export function load(): PlayState {
  try { const v = JSON.parse(localStorage.getItem(PLAY_KEY) || "null"); if (v && v.v === 1) return { ...empty(), ...v }; } catch { /* пусто */ }
  return empty();
}
export function save(s: PlayState) { try { localStorage.setItem(PLAY_KEY, JSON.stringify(s)); } catch { /* приватный режим */ } }
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const rankOf = (xp: number) => { let r = RANKS[0], next: (typeof RANKS)[number] | null = null; for (const x of RANKS) { if (xp >= x.xp) r = x; else { next = x; break; } } return { r, next }; };

type Ctx = { slugs?: { people: string[]; ds: string[]; rare: string[]; day: string[] } };
let ctx: Ctx = {};
export function setContext(c: Ctx) { ctx = { ...ctx, ...c }; }
function readCtx(): Ctx {
  if (ctx.slugs) return ctx;
  const el = document.getElementById("lp-play-ctx");
  if (el?.textContent) try { ctx.slugs = JSON.parse(el.textContent); } catch { /* нет */ }
  return ctx;
}

/** Начислить опыт и проверить достижения. Возвращает новое состояние. */
export function award(s: PlayState, xp: number, why?: string): PlayState {
  s.xp += xp;
  if (why && xp > 0) toast(`+${xp} опыта · ${why}`);
  return checkAch(s);
}
export function checkAch(s: PlayState): PlayState {
  const c = readCtx().slugs; const read = Object.keys(s.read);
  const has = (arr: string[] | undefined) => !!arr?.length && arr.every((x) => s.read[x]);
  const streak = (() => { const d = [...s.days].sort(); let best = 1, cur = 1; for (let i = 1; i < d.length; i++) { const gap = (Date.parse(d[i]) - Date.parse(d[i - 1])) / 864e5; cur = gap === 1 ? cur + 1 : 1; best = Math.max(best, cur); } return d.length ? best : 0; })();
  const rules: Record<string, boolean> = {
    "read-1": read.length >= 1, "read-10": read.length >= 10, "read-50": read.length >= 50, "read-people": has(c?.people), "ds-all": has(c?.ds),
    "map-15": s.mapOpens.length >= 15, "quiz-1": s.quiz.played >= 1, "quiz-10": s.quiz.best >= 10, "who-5": s.who.best >= 5, "tl-1": s.tl >= 1,
    "egg-1": s.eggs.length >= 1, "egg-all": s.eggs.length >= EGGS.length, "day-1": !!s.dayRead, "streak-3": streak >= 3,
    "rare-10": (c?.rare || []).filter((x) => s.read[x]).length >= 10, "cmp-5": s.cmp >= 5,
  };
  for (const a of ACHIEVEMENTS) if (rules[a.id] && !s.ach[a.id]) { s.ach[a.id] = Date.now(); s.xp += 30; toast(`${a.icon} Достижение: «${a.title}» · +30 опыта`, true); }
  return s;
}

export function toast(text: string, big = false) {
  let box = document.querySelector<HTMLElement>(".lp-toasts");
  if (!box) { box = document.createElement("div"); box.className = "lp-toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const t = document.createElement("div"); t.className = "lp-toast" + (big ? " big" : ""); t.textContent = text; box.appendChild(t);
  setTimeout(() => t.classList.add("out"), big ? 3600 : 2200); setTimeout(() => t.remove(), big ? 4200 : 2800);
}

/** Сколько глав книги отмечено в «Ходе чтения» (хранится тем же браузером). */
export function chaptersRead(book: string): number {
  try {
    const cur = loadState(localStorage.getItem(READER_KEY)).books[book];
    return cur && cur.chapterNumber != null ? cur.chapterNumber : -1;
  } catch { return -1; }
}
export const spoilAll = () => document.cookie.split(";").some((p) => p.trim() === "lp_spoil=1");

/** Статья дня: одна на всех в этот день, выбирается по дате. */
export function dayPick(list: string[], date = today()): string {
  if (!list.length) return "";
  let h = 2166136261; for (const c of date) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return list[(h >>> 0) % list.length];
}

// ---------- подсказки: наведение на компьютере, долгое нажатие на телефоне ----------
let readTimer = 0;
document.addEventListener("astro:before-swap", () => { clearTimeout(readTimer); });
let tipEl: HTMLElement | null = null; let lpTimer = 0; let suppressClick = false;
function tipText(el: Element): string {
  const t = el.getAttribute("data-tip") || el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim();
  return t.replace(/\s+/g, " ").slice(0, 220);
}
function showTip(el: Element) {
  const text = tipText(el); if (!text) return;
  if (!tipEl || !tipEl.isConnected) { tipEl = document.createElement("div"); tipEl.className = "lp-tip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
  tipEl.textContent = text; tipEl.classList.add("on");
  const r = el.getBoundingClientRect(); const w = Math.min(280, window.innerWidth - 16);
  tipEl.style.maxWidth = w + "px";
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2; x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  let y = r.top - th - 8; if (y < 8) y = r.bottom + 8;
  tipEl.style.left = x + "px"; tipEl.style.top = y + window.scrollY + "px";
}
const hideTip = () => tipEl?.classList.remove("on");
const TIP_SEL = ".lp button, .lp summary, .lp [data-tip], .lp-tipzone button, .lp-tipzone [data-tip]";
export function initTips() {
  if ((document as any).__lpTips) return; (document as any).__lpTips = 1;
  // у каждой кнопки должна быть подсказка: если автор не задал, берём подпись
  const fill = () => document.querySelectorAll(TIP_SEL).forEach((el) => { if (!el.getAttribute("data-tip")) el.setAttribute("data-tip", tipText(el)); el.removeAttribute("title"); });
  fill(); new MutationObserver(() => fill()).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("pointerover", (e) => { if ((e as PointerEvent).pointerType !== "mouse") return; const el = (e.target as Element).closest?.(TIP_SEL); if (el) showTip(el); });
  document.addEventListener("pointerout", (e) => { if ((e as PointerEvent).pointerType === "mouse" && (e.target as Element).closest?.(TIP_SEL)) hideTip(); });
  document.addEventListener("focusin", (e) => { const el = (e.target as Element).closest?.(TIP_SEL); if (el && (el as HTMLElement).matches(":focus-visible")) showTip(el); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("pointerdown", (e) => {
    if ((e as PointerEvent).pointerType === "mouse") return;
    const el = (e.target as Element).closest?.(TIP_SEL); if (!el) { hideTip(); return; }
    clearTimeout(lpTimer); lpTimer = window.setTimeout(() => { showTip(el); suppressClick = true; navigator.vibrate?.(15); }, 450);
  }, { passive: true });
  const cancel = () => { clearTimeout(lpTimer); if (tipEl?.classList.contains("on")) setTimeout(hideTip, 1600); };
  document.addEventListener("pointerup", cancel); document.addEventListener("pointercancel", cancel);
  document.addEventListener("contextmenu", (e) => { if ((e.target as Element).closest?.(TIP_SEL) && matchMedia("(pointer: coarse)").matches) e.preventDefault(); });
  document.addEventListener("click", (e) => { if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  window.addEventListener("scroll", hideTip, { passive: true });
}

// ---------- спойлер-шторки ----------
export function initShutters() {
  const all = spoilAll();
  document.querySelectorAll<HTMLDetailsElement>("details.lp-shutter").forEach((d) => {
    if (d.dataset.ready) return; d.dataset.ready = "1";
    const book = d.dataset.spoilerBook || ""; const ch = Number(d.dataset.spoilerCh || 1);
    const ok = ch < 99 && chaptersRead(book) >= ch;
    if (ok || (all && ch < 99)) { d.open = true; d.classList.add("auto"); }
  });
}

// ---------- шапка: ранг и опыт ----------
export function paintChip(s: PlayState) {
  const el = document.querySelector<HTMLElement>("[data-lp-xp]"); if (!el) return;
  const { r, next } = rankOf(s.xp);
  const pct = next ? Math.round(((s.xp - r.xp) / (next.xp - r.xp)) * 100) : 100;
  el.querySelector<HTMLElement>("[data-rank]")!.textContent = r.title;
  el.querySelector<HTMLElement>("[data-xpnum]")!.textContent = String(s.xp);
  el.querySelector<HTMLElement>("[data-bar]")!.style.width = pct + "%";
  el.setAttribute("data-tip", `Ваш ранг читателя: ${r.title}. Опыт: ${s.xp}${next ? `, до ранга «${next.title}» — ${next.xp - s.xp}` : ""}. Прочитано статей: ${Object.keys(s.read).length}. Прогресс хранится только в этом браузере.`);
}

// ---------- статья: отметка «прочитано», пасхалки ----------
export function initArticle(s: PlayState): PlayState {
  const art = document.querySelector<HTMLElement>("[data-lp-slug]"); if (!art) return s;
  const slug = art.dataset.lpSlug!; const day = dayPick(readCtx().slugs?.day || []) === slug;
  const mark = () => {
    if (s.read[slug]) return;
    s.read[slug] = Date.now();
    s = award(s, 10, "статья прочитана");
    if (day && s.dayRead !== today()) { s.dayRead = today(); s = award(s, 25, "статья дня"); }
    save(s); paintChip(s); paintRead(s);
  };
  const ref = new URLSearchParams(location.search).get("from");
  if (ref === "map" && !s.mapOpens.includes(slug)) { s.mapOpens.push(slug); s = checkAch(s); save(s); }
  // «прочитано» — после 12 секунд на странице или прокрутки до конца статьи
  clearTimeout(readTimer); const t = readTimer = window.setTimeout(mark, 12000);
  const end = document.querySelector(".lp-backlinks");
  if (end && "IntersectionObserver" in window) new IntersectionObserver((es, o) => { if (es.some((x) => x.isIntersecting)) { clearTimeout(t); mark(); o.disconnect(); } }).observe(end);
  paintRead(s);
  document.querySelectorAll<HTMLButtonElement>("[data-egg]").forEach((b) => {
    const id = b.dataset.egg!; if (s.eggs.includes(id)) b.classList.add("found");
    b.addEventListener("click", () => {
      if (s.eggs.includes(id)) { toast("Эта пасхалка уже в коллекции"); return; }
      s.eggs.push(id); b.classList.add("found"); s = award(s, 15, `пасхалка найдена (${s.eggs.length} из ${EGGS.length})`); save(s); paintChip(s);
    });
  });
  return s;
}
function paintRead(s: PlayState) {
  const art = document.querySelector<HTMLElement>("[data-lp-slug]"); if (!art) return;
  const badge = document.querySelector<HTMLElement>("[data-lp-readmark]");
  if (badge) { const r = !!s.read[art.dataset.lpSlug!]; badge.hidden = !r; }
}

export function boot() {
  initTips();
  let s = load();
  const d = today(); if (!s.days.includes(d)) { s.days = [...s.days, d].slice(-60); s = checkAch(s); save(s); }
  initShutters();
  s = initArticle(s);
  paintChip(s);
  document.querySelectorAll<HTMLElement>("[data-lp-readdot]").forEach((el) => el.classList.toggle("read", !!s.read[el.dataset.lpReaddot!]));
  return s;
}
