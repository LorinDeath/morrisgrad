// Клиент форума: лайки (оптимистично + склейка частых нажатий), ответы, жалобы, правка/удаление,
// модерация, переключатели вида. Обработчики делегированы на document — работают и после переходов
// (View Transitions), подключаются один раз.
export async function api(method: string, path: string, body?: any): Promise<any> {
  const res = await fetch("/api/forum/" + path, {
    method,
    headers: { "x-forum": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data: any = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || "Ошибка " + res.status), { status: res.status, code: data.code });
  return data;
}
export function toast(msg: string, err = false) {
  const t = document.getElementById("f-toast");
  if (!t) return;
  if (t.parentElement !== document.body) document.body.append(t); // вне контекста наложения контента — иначе подвал перекрывает
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.classList.add("show");
  clearTimeout((t as any)._h);
  (t as any)._h = setTimeout(() => t.classList.remove("show"), 3200);
}
const root = () => document.getElementById("forum-root");
const uid = () => root()?.dataset.uid || ""; // публичный номер участника (не Clerk id); пусто — гость
function needLogin(): boolean {
  if (uid()) return false;
  toast("Войдите в аккаунт МоррисГрада (кнопка «Войти» вверху), чтобы участвовать", true);
  return true;
}

// ---- лайки: мгновенный отклик, на сервер уходит только итоговое состояние через 350 мс ----
const pending = new Map<string, { want: boolean; server: boolean; timer: any; btns: HTMLElement[] }>();
function paintLike(key: string, on: boolean, delta: number) {
  document.querySelectorAll<HTMLElement>(`[data-like][data-key="${key}"]`).forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    const n = b.querySelector(".f-like-n");
    if (n) n.textContent = String(Math.max(0, Number(n.textContent || 0) + delta));
    if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
  });
}
function onLike(btn: HTMLElement) {
  if (needLogin()) return;
  if (btn.dataset.own === "1") { toast("Свои записи оценивать нельзя"); return; }
  const type = btn.dataset.like!, id = btn.dataset.id!;
  const key = type + id;
  document.querySelectorAll<HTMLElement>(`[data-like="${type}"][data-id="${id}"]`).forEach((b) => (b.dataset.key = key));
  let p = pending.get(key);
  const cur = btn.classList.contains("on");
  if (!p) { p = { want: cur, server: cur, timer: 0, btns: [] }; pending.set(key, p); }
  p.want = !cur;
  paintLike(key, p.want, p.want ? 1 : -1);
  clearTimeout(p.timer);
  p.timer = setTimeout(async () => {
    const st = pending.get(key)!;
    pending.delete(key);
    if (st.want === st.server) return;
    try {
      const r = await api("POST", "like", { type, id: Number(id) });
      if (r.liked !== st.want) paintLike(key, r.liked, r.liked ? 1 : -1);
    } catch (e: any) {
      paintLike(key, st.server, st.server ? 1 : -1);
      toast(e.message, true);
    }
  }, 350);
}

// ---- жалобы / бан через <dialog> ----
function ask(dialogId: string): Promise<FormData | null> {
  const d = document.getElementById(dialogId) as HTMLDialogElement | null;
  if (!d) return Promise.resolve(null);
  const form = d.querySelector("form")!;
  form.reset();
  d.showModal();
  return new Promise((res) => {
    d.addEventListener("close", () => res(d.returnValue === "ok" ? new FormData(form) : null), { once: true });
  });
}
async function onReport(el: HTMLElement) {
  if (needLogin()) return;
  const fd = await ask("f-report-dialog");
  if (!fd) return;
  const reason = [fd.get("reason"), fd.get("note")].filter(Boolean).join(": ");
  try {
    const r = await api("POST", "report", { type: el.dataset.report, id: Number(el.dataset.id), reason });
    toast(r.already ? "Вы уже жаловались на эту запись" : r.autoHidden ? "Спасибо! Запись скрыта до проверки модератором" : "Спасибо! Модераторы посмотрят");
  } catch (e: any) { toast(e.message, true); }
}
async function onBan(el: HTMLElement) {
  const fd = await ask("f-ban-dialog");
  if (!fd) return;
  try {
    await api("POST", "ban", { pid: Number(el.dataset.ban), minutes: Number(fd.get("minutes")), reason: String(fd.get("reason") || "") });
    toast("Ограничение установлено"); setTimeout(() => location.reload(), 600);
  } catch (e: any) { toast(e.message, true); }
}

// ---- быстрый ответ ----
function quickForm(): HTMLFormElement | null { return document.querySelector("form[data-quick]"); }
function onReply(el: HTMLElement) {
  if (needLogin()) return;
  const f = quickForm(); if (!f) return;
  (f.elements.namedItem("reply_to") as HTMLInputElement).value = el.dataset.reply!;
  const note = f.querySelector(".f-replying") as HTMLElement;
  note.hidden = false;
  note.querySelector("b")!.textContent = el.dataset.nick || "";
  const cm = el.closest(".f-cm");
  if (cm) cm.after(f);
  const ta = f.querySelector("textarea")!;
  ta.focus();
}
async function submitQuick(f: HTMLFormElement) {
  if (needLogin()) return;
  const ta = f.querySelector("textarea")!;
  const btn = f.querySelector("button[type=submit]") as HTMLButtonElement;
  const body = ta.value.trim();
  if (!body) { ta.focus(); return; }
  btn.disabled = true;
  try {
    const reply_to = Number((f.elements.namedItem("reply_to") as HTMLInputElement).value) || undefined;
    const r = await api("POST", `topic/${f.dataset.quick}/comments`, { body, reply_to });
    try { localStorage.removeItem("forum_quick_" + f.dataset.quick); } catch {}
    ta.value = "";
    const u = new URL(location.href);
    u.hash = "c" + r.id;
    if (f.dataset.lastpage) u.searchParams.set("page", f.dataset.lastpage);
    location.href = u.toString();
    if (u.pathname === location.pathname) location.reload();
  } catch (e: any) { toast(e.message, true); btn.disabled = false; }
}

// ---- правка комментария на месте ----
function onEditComment(el: HTMLElement) {
  const cm = el.closest(".f-cm") as HTMLElement;
  const bodyEl = cm.querySelector(":scope > div > .f-cm-body") as HTMLElement;
  const src = cm.querySelector(":scope > div > template[data-src]") as HTMLTemplateElement;
  if (!bodyEl || !src || cm.querySelector(".f-inline-edit")) return;
  const box = document.createElement("div");
  box.className = "f-inline-edit";
  const ta = document.createElement("textarea");
  ta.rows = 4; ta.value = src.content.textContent || ""; ta.dataset.ctrlEnter = "1";
  const save = document.createElement("button"); save.className = "f-btn f-btn-s f-btn-primary"; save.textContent = "Сохранить"; save.type = "button";
  const cancel = document.createElement("button"); cancel.className = "f-btn f-btn-s"; cancel.textContent = "Отмена"; cancel.type = "button";
  const bar = document.createElement("div"); bar.className = "f-quick-bar"; bar.append(save, cancel);
  box.append(ta, bar);
  bodyEl.hidden = true; bodyEl.after(box); ta.focus();
  cancel.onclick = () => { box.remove(); bodyEl.hidden = false; };
  save.onclick = async () => {
    save.disabled = true;
    try { const r = await api("PUT", "comment/" + el.dataset.edit, { body: ta.value }); bodyEl.innerHTML = r.html; src.content.textContent = ta.value; box.remove(); bodyEl.hidden = false; toast("Сохранено"); }
    catch (e: any) { toast(e.message, true); save.disabled = false; }
  };
  (ta as any)._submit = () => save.click();
}

async function onDelete(el: HTMLElement) {
  const what = el.dataset.del!, id = el.dataset.id!;
  let q = "";
  if (el.dataset.askReason) {
    const r = prompt(`${what === "topic" ? "Удалить тему" : "Удалить комментарий"}? Причина (попадёт в журнал модерации):`, "Нарушение правил");
    if (r === null) return;
    q = "?reason=" + encodeURIComponent(r.slice(0, 200));
  } else if (!confirm(what === "topic" ? "Удалить тему целиком?" : "Удалить комментарий?")) return;
  try {
    await api("DELETE", `${what}/${id}${q}`);
    toast("Удалено");
    setTimeout(() => { if (what === "topic") location.href = el.dataset.back || "/forum"; else location.reload(); }, 500);
  } catch (e: any) { toast(e.message, true); }
}

async function simple(fn: () => Promise<any>, ok: string, reload = true) {
  try { await fn(); toast(ok); if (reload) setTimeout(() => location.reload(), 500); } catch (e: any) { toast(e.message, true); }
}

function applyToggles() {
  const r = root(); if (!r) return;
  document.querySelectorAll<HTMLElement>("[data-toggle]").forEach((b) => b.classList.toggle("on", r.classList.contains("f-" + b.dataset.toggle)));
  // черновик быстрого ответа
  const f = quickForm();
  if (f && !f.dataset.bound) {
    f.dataset.bound = "1";
    const ta = f.querySelector("textarea")!, cnt = f.querySelector("[data-count]");
    const key = "forum_quick_" + f.dataset.quick;
    try { const d = localStorage.getItem(key); if (d && !ta.value) ta.value = d; } catch {}
    const upd = () => { if (cnt) cnt.textContent = `${ta.value.length}/${ta.maxLength}`; };
    upd();
    let t: any;
    ta.addEventListener("input", () => { upd(); clearTimeout(t); t = setTimeout(() => { try { ta.value ? localStorage.setItem(key, ta.value) : localStorage.removeItem(key); } catch {} }, 400); });
  }
  if (location.hash.startsWith("#c")) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
}

if (!(window as any).__forumBound) {
  (window as any).__forumBound = true;
  document.addEventListener("astro:page-load", applyToggles);
  document.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    const el = t.closest<HTMLElement>("[data-like],[data-report],[data-reply],[data-edit],[data-del],[data-restore],[data-flag],[data-hide-c],[data-block],[data-ban],[data-unban],[data-ava-remove],[data-toggle],.f-spoiler,.f-yt,[data-show-blocked],[data-cancel-reply]");
    if (!el || !root()?.contains(el)) return;
    if (el.matches("[data-like]")) { ev.preventDefault(); onLike(el); }
    else if (el.matches("[data-report]")) onReport(el);
    else if (el.matches("[data-reply]")) onReply(el);
    else if (el.matches("[data-cancel-reply]")) { const f = quickForm()!; (f.elements.namedItem("reply_to") as HTMLInputElement).value = ""; (f.querySelector(".f-replying") as HTMLElement).hidden = true; document.getElementById("f-quick-home")?.append(f); }
    else if (el.matches("[data-edit]")) onEditComment(el);
    else if (el.matches("[data-del]")) onDelete(el);
    else if (el.matches("[data-restore]")) simple(() => api("POST", `${el.dataset.restore}/${el.dataset.id}/restore`, {}), "Восстановлено");
    else if (el.matches("[data-flag]")) simple(() => api("POST", `topic/${el.dataset.id}/flag`, { flag: el.dataset.flag, value: el.dataset.value === "1" }), "Готово");
    else if (el.matches("[data-hide-c]")) simple(() => api("POST", `comment/${el.dataset.hideC}/hide`, { value: el.dataset.value === "1" }), "Готово");
    else if (el.matches("[data-block]")) { if (!needLogin()) simple(() => api("POST", "block", { pid: Number(el.dataset.block), value: el.dataset.value === "1" }), el.dataset.value === "1" ? "Записи автора скрыты для вас" : "Автор снова виден"); }
    else if (el.matches("[data-ban]")) onBan(el);
    else if (el.matches("[data-ava-remove]")) {
      const reason = prompt("Убрать аватар участника. Причина (видна в журнале):", "неуместная картинка");
      if (reason !== null) simple(() => api("POST", `user/${el.dataset.avaRemove}/avatar-remove`, { reason }), "Аватар убран");
    }
    else if (el.matches("[data-unban]")) simple(() => api("POST", "unban", { pid: Number(el.dataset.unban) }), "Ограничение снято");
    else if (el.matches("[data-show-blocked]")) { const c = el.closest(".f-cm, .f-post"); c?.querySelectorAll<HTMLElement>("[data-blocked-content]").forEach((x) => (x.hidden = false)); el.parentElement!.remove(); }
    else if (el.matches("[data-toggle]")) {
      const cls = "f-" + el.dataset.toggle;
      const on = !root()!.classList.contains(cls);
      root()!.classList.toggle(cls, on);
      try { localStorage.setItem("forum_" + el.dataset.toggle, on ? "1" : "0"); } catch {}
      el.classList.toggle("on", on);
    }
    else if (el.matches(".f-spoiler")) el.classList.toggle("open");
    else if (el.matches(".f-yt") && !el.querySelector("iframe")) {
      const id = el.dataset.yt || "";
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      f.setAttribute("allowfullscreen", "");
      el.replaceChildren(f);
    }
  });
  document.addEventListener("submit", (ev) => {
    const f = ev.target as HTMLFormElement;
    if (f.matches("form[data-quick]")) { ev.preventDefault(); ev.stopPropagation(); submitQuick(f); }
  }, true); // фаза перехвата: раньше роутера Astro (View Transitions), чтобы форма не ушла обычным GET
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || !(ev.ctrlKey || ev.metaKey)) return;
    const ta = ev.target as HTMLElement;
    if (!(ta instanceof HTMLTextAreaElement)) return;
    if ((ta as any)._submit) { ev.preventDefault(); (ta as any)._submit(); return; }
    const f = ta.closest("form");
    if (f && (f.matches("form[data-quick]") || f.matches("form[data-editor]"))) { ev.preventDefault(); f.requestSubmit(); }
  });
}
