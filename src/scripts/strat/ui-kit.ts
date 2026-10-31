// Игровые окна «Партии Чёрных королей»: модальные окна с анимацией, подтверждения, выбор из карточек,
// тосты, баннер смены хода, всплывающие подсказки. Только DOM, без зависимостей от правил.
import { ic } from "./icons";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const root = () => document.getElementById("modals")!;

export type Act = { label: string; cls?: string; id?: string; icon?: string; val?: any; disabled?: boolean };
export type ModalOpts = { title: string; sub?: string; icon?: string; body?: string; cls?: string; acts?: Act[]; dismiss?: boolean; id?: string };

/** Открыть модальное окно. Возвращает элемент и промис с выбранным значением (null — закрыто). */
export function modal(o: ModalOpts): { el: HTMLElement; done: Promise<any>; close: (v?: any) => void } {
  if (o.id) document.getElementById(o.id)?.remove();
  const el = document.createElement("div"); el.className = "ovl " + (o.cls || ""); if (o.id) el.id = o.id;
  el.innerHTML = `<div class="dlg deco" role="dialog" aria-modal="true">
    <div class="dlg-h">${o.icon ? `<span class="dlg-ic">${ic(o.icon)}</span>` : ""}<div><h3>${esc(o.title)}</h3>${o.sub ? `<p class="dlg-sub">${o.sub}</p>` : ""}</div>
      ${o.dismiss !== false ? `<button class="xbtn" data-x aria-label="Закрыть">${ic("close")}</button>` : ""}</div>
    <div class="dlg-b">${o.body || ""}</div>
    ${o.acts?.length ? `<div class="dlg-f">${o.acts.map((a, i) => `<button class="btn ${a.cls || ""}" data-act="${i}" ${a.id ? `id="${a.id}"` : ""} ${a.disabled ? "disabled" : ""}>${a.icon ? ic(a.icon) : ""}<span>${esc(a.label)}</span></button>`).join("")}</div>` : ""}
  </div>`;
  let res!: (v: any) => void; const done = new Promise<any>((r) => (res = r));
  let closed = false;
  const close = (v: any = null) => { if (closed) return; closed = true; el.classList.add("out"); res(v); setTimeout(() => el.remove(), 220); document.removeEventListener("keydown", key); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape" && o.dismiss !== false) close(null); };
  document.addEventListener("keydown", key);
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === el && o.dismiss !== false) return close(null);
    if (t.closest("[data-x]")) return close(null);
    const a = t.closest<HTMLElement>("[data-act]"); if (a && o.acts) { const A = o.acts[+a.dataset.act!]; close(A.val !== undefined ? A.val : true); }
  });
  root().appendChild(el); requestAnimationFrame(() => el.classList.add("in"));
  return { el, done, close };
}
/** Подтверждение: true/false. */
export function confirmDlg(title: string, text: string, ok = "Да", opts: { danger?: boolean; icon?: string; cancel?: string } = {}): Promise<boolean> {
  return modal({ title, icon: opts.icon || (opts.danger ? "flag" : "crown"), body: `<p class="dlg-text">${text}</p>`, cls: "small" + (opts.danger ? " danger" : ""),
    acts: [{ label: opts.cancel || "Отмена", cls: "ghost", val: false }, { label: ok, cls: opts.danger ? "red" : "gold", val: true, id: "dlg-ok" }] }).done.then((v) => v === true);
}
export type Choice = { id: string; title: string; text?: string; img?: string; icon?: string; foot?: string; disabled?: boolean; attrs?: string };
/** Выбор из крупных карточек (превращение, Кузня, таланты). */
export function choiceDlg(title: string, sub: string, items: Choice[], cls = ""): Promise<string | null> {
  const body = `<div class="choices n${items.length}">${items.map((c) => `<button class="choice" data-choice="${esc(c.id)}" ${c.disabled ? "disabled" : ""} ${c.attrs || ""}>
    <span class="ch-art">${c.img ? `<img src="${c.img}" alt="">` : c.icon ? ic(c.icon) : ""}</span><b>${esc(c.title)}</b>${c.text ? `<small>${esc(c.text)}</small>` : ""}${c.foot ? `<em>${c.foot}</em>` : ""}</button>`).join("")}</div>`;
  const m = modal({ title, sub, body, cls: "choose " + cls, icon: "crown" });
  m.el.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((b) => (b.onclick = () => m.close(b.dataset.choice)));
  return m.done;
}
/** Ввод строки (причина отказа карты и т. п.). */
export function promptDlg(title: string, label: string, ok = "Готово"): Promise<string | null> {
  const m = modal({ title, icon: "know", cls: "small", body: `<label class="fld"><span>${esc(label)}</span><textarea rows="3" maxlength="300"></textarea></label>`,
    acts: [{ label: "Отмена", cls: "ghost", val: false }, { label: ok, cls: "gold", val: true }] });
  const ta = m.el.querySelector("textarea")!; setTimeout(() => ta.focus(), 50);
  return m.done.then((v) => (v === true ? ta.value : null));
}

/** Тост: kind — info/good/bad/turn. */
export function toast(t: string, kind: "info" | "good" | "bad" | "turn" = "info", icon?: string) {
  const box = document.getElementById("toasts"); if (!box) return;
  const d = document.createElement("div"); d.className = "toast " + kind;
  d.innerHTML = `${ic(icon || (kind === "bad" ? "skull" : kind === "good" ? "check" : kind === "turn" ? "crown" : "spark"))}<span></span>`;
  d.querySelector("span")!.textContent = t; box.appendChild(d);
  while (box.children.length > 4) box.firstElementChild!.remove();
  requestAnimationFrame(() => d.classList.add("in"));
  // t1198: любой тост закрывается тапом/кликом по нему; иначе — сам через 3,2 с
  const kill = () => { if (d.classList.contains("out")) return; d.classList.add("out"); d.style.pointerEvents = "none"; setTimeout(() => d.remove(), 300); };
  d.title = "Скрыть"; d.addEventListener("click", kill); setTimeout(kill, 3200);
}
/** Баннер на всю ширину доски: «ВАШ ХОД» и т. п. */
export function banner(title: string, sub = "", kind: "mine" | "theirs" | "start" = "mine") {
  const b = document.getElementById("turnbanner"); if (!b) return;
  b.className = "turnbanner " + kind; b.innerHTML = `<div class="tb-in"><span class="tb-rule"></span><b></b><small></small><span class="tb-rule"></span></div>`;
  b.querySelector("b")!.textContent = title; b.querySelector("small")!.textContent = sub;
  void b.offsetWidth; b.classList.add("show"); clearTimeout((b as any)._t); (b as any)._t = setTimeout(() => b.classList.remove("show"), 1500);
  (b as any)._x ||= (b.addEventListener("click", () => { clearTimeout((b as any)._t); b.classList.remove("show"); }), 1);
}

// ---------- подсказки ----------
let tipEl: HTMLElement | null = null;
export function showTip(html: string, x: number, y: number) {
  tipEl ||= document.getElementById("tip"); if (!tipEl) return;
  if (tipEl.dataset.h !== html) { tipEl.innerHTML = html; tipEl.dataset.h = html; }
  tipEl.classList.add("on");
  const r = tipEl.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  let L = x + 16, T = y + 18; if (L + r.width > W - 8) L = x - r.width - 12; if (T + r.height > H - 8) T = y - r.height - 12;
  tipEl.style.transform = `translate(${Math.max(6, L)}px, ${Math.max(6, T)}px)`;
}
export function hideTip() { tipEl ||= document.getElementById("tip"); tipEl?.classList.remove("on"); }
let resolver: (key: string) => string = () => "";
/** Подсказки по ключу пассивки (data-pas) — генерируются из данных эффекта в момент показа. */
export function setTipResolver(f: (key: string) => string) { resolver = f; }
const tipOf = (t: HTMLElement) => (t.dataset.pas ? resolver(t.dataset.pas) : `<div class="tip-b">${t.dataset.tip}</div>`);
/** Подсказки: мышь — наведение; касание — долгое нажатие открывает ту же подсказку маленькой шторкой снизу. */
export function bindTips() {
  const sel = "[data-tip],[data-pas]";
  if (matchMedia("(hover: hover)").matches) {
    document.addEventListener("mouseover", (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>(sel); if (!t) return;
      const h = tipOf(t); if (!h) return; const r = t.getBoundingClientRect(); tipEl ||= document.getElementById("tip"); tipEl?.classList.remove("sheet"); showTip(h, r.left + r.width / 2 - 20, r.bottom - 10); });
    document.addEventListener("mouseout", (e) => { const t = (e.target as HTMLElement).closest(sel); if (t && !t.contains(e.relatedTarget as Node)) hideTip(); });
  }
  let lp = 0, sx = 0, sy = 0, fired = false;
  document.addEventListener("touchstart", (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>(sel); fired = false; if (!t) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    clearTimeout(lp); lp = window.setTimeout(() => { const h = tipOf(t); if (!h) return; fired = true; openSheet(h); }, 450); }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 10) clearTimeout(lp); }, { passive: true });
  document.addEventListener("touchend", (e) => { clearTimeout(lp); if (fired) { e.preventDefault(); fired = false; } });
  document.addEventListener("contextmenu", (e) => { if ((e.target as HTMLElement).closest(sel) && matchMedia("(pointer: coarse)").matches) e.preventDefault(); });
  // короткий тап по значку пассивки на касании — тоже шторка
  document.addEventListener("click", (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-pas]"); if (t && matchMedia("(pointer: coarse)").matches) { const h = tipOf(t); if (h) openSheet(h); } });
}
export function openSheet(html: string) {
  tipEl ||= document.getElementById("tip"); if (!tipEl) return; tipEl.innerHTML = html + `<button class="btn sm ghost tip-x" type="button"><span>Закрыть</span></button>`; tipEl.dataset.h = "";
  tipEl.classList.add("sheet", "on"); tipEl.style.transform = "";
  const close = () => { tipEl!.classList.remove("on", "sheet"); document.removeEventListener("pointerdown", out, true); };
  const out = (ev: Event) => { if (!tipEl!.contains(ev.target as Node) || (ev.target as HTMLElement).closest(".tip-x")) setTimeout(close, 0); };
  setTimeout(() => document.addEventListener("pointerdown", out, true), 0);
}
