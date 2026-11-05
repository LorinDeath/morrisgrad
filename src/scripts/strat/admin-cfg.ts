// t1243: клиент админки «Правила игры» (src/pages/games/strategy-admin.astro). Сервер: /strat/admin/cfg (server/strat/admin-cfg-http.ts).
// Всё описание полей (разделы, типы, границы, подписи) приходит с сервера — данные дерева навыков и правила в бандл не попадают.
// Правки копятся в черновике (и в localStorage, чтобы не потерять при обновлении) → «Проверить» → разница → «Сохранить» (с версией-основой: 409 при чужом сохранении).
type F = { p: string; t: "int" | "num" | "bool" | "text" | "enum"; def: any; min?: number; max?: number; opts?: string[]; len?: number; ro?: string; sec: string; g: string; l: string; cur: any; pin?: number; hint?: string };
type D = { p: string; sec: string; g: string; l: string; before: any; after: any; def: any; reset?: boolean };
type St = { me: string; rev: number; sections: { id: string; name: string; hint: string }[]; fields: F[]; over: Record<string, any>; legacy: Record<string, any>; stale: string[];
  log: { id: number; key: string; before: any; after: any; by: string; at: number; rev: number | null }[]; revs: { rev: number; at: number; by: string; who: string | null; note: string | null; n: number }[] };

const PROD = "https://morris-multiplayer.alexseylyou.workers.dev";
const qs = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const HTTP = LOCAL ? (qs.get("ws") || "ws://127.0.0.1:8871").replace(/^ws/, "http") : PROD;
const DRAFT_KEY = "strat.admin.draft";
const MAIN = "__main"; // «Главное»: закреплённые поля (стартовые ОД по лигам и т. п.) — первый раздел
const AP_REC = 4; // t1243: стартовые ОД, принятые в игре (Алекс выставил 4 в проде вручную; код догонит в erafix-1242)
const TN: Record<string, string> = { int: "целое", num: "число", bool: "да/нет", text: "текст", enum: "выбор" };
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (v: any) => (v === undefined ? "—" : v === null ? "по умолчанию" : typeof v === "boolean" ? (v ? "да" : "нет") : typeof v === "string" ? `«${v}»` : String(v));
const when = (t: number) => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;

let clerkP: Promise<any> | null = null;
const clerkReady = () => (clerkP ??= new Promise((res) => { const t0 = Date.now(); const tick = () => { const C = (window as any).Clerk; if (C?.loaded) return res(C); if (Date.now() - t0 > 6000) { clerkP = null; return res(null); } setTimeout(tick, 50); }; tick(); }));
async function auth(): Promise<{ token?: string; dev?: string }> {
  const dev = qs.get("devUser"); if (LOCAL && dev) return { dev };
  try { const C = await clerkReady(); const t = await C?.session?.getToken?.(); if (t) return { token: t }; } catch {}
  return {};
}
async function api(method: "GET" | "POST", body?: any): Promise<{ status: number; j: any }> {
  const a = await auth(), u = new URL(HTTP + "/strat/admin/cfg"); if (a.dev) u.searchParams.set("devUser", a.dev);
  try {
    const r = await fetch(u, { method, headers: { ...(a.token ? { Authorization: "Bearer " + a.token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  } catch { return { status: 0, j: { msg: "Сервер игры не отвечает. Проверьте соединение и попробуйте ещё раз." } }; }
}
function toast(t: string, k: "good" | "bad" = "good") {
  const box = $("#sa-toasts"), d = document.createElement("div"); d.className = "sa-toast " + k; d.textContent = t; box.appendChild(d);
  setTimeout(() => d.remove(), k === "bad" ? 7000 : 3500);
}

// ---------- состояние ----------
let S: St; let byP = new Map<string, F>();
let draft: Record<string, any> = {}; // путь → новое значение (null = вернуть по умолчанию)
const openG = new Set<string>(), closedG = new Set<string>(); // какие группы админ раскрыл/свернул сам (переживает перерисовку)
let tab: "rules" | "log" | "revs" = "rules", sec = "", q = "", onlyMod = false, showRo = false, ftype = "", errs = new Map<string, string>();
const loadDraft = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); return d && typeof d === "object" ? d : {}; } catch { return {}; } };
const saveDraft = () => { try { Object.keys(draft).length ? localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) : localStorage.removeItem(DRAFT_KEY); } catch {} };
const isMod = (f: F) => f.p in S.over || f.p in S.legacy;
const shown = (f: F) => (f.p in draft ? (draft[f.p] === null ? f.def : draft[f.p]) : f.cur);
const inSec = (f: F, id: string) => (id === MAIN ? !!f.pin : f.sec === id);
const modCount = (id: string) => S.fields.filter((f) => inSec(f, id) && isMod(f)).length;
const draftCount = (id: string) => Object.keys(draft).filter((p) => { const f = byP.get(p); return f && inSec(f, id); }).length;

function parse(f: F, raw: string | boolean): { v?: any; e?: string } {
  if (f.t === "bool") return { v: !!raw };
  const s = String(raw);
  if (f.t === "int" || f.t === "num") {
    const t = s.trim().replace(",", "."); if (t === "") return { e: "пустое поле" };
    const n = Number(t); if (!Number.isFinite(n)) return { e: "нужно число" };
    if (f.t === "int" && !Number.isInteger(n)) return { e: "нужно целое число" };
    if (f.min != null && n < f.min) return { e: `не меньше ${f.min}` }; if (f.max != null && n > f.max) return { e: `не больше ${f.max}` };
    return { v: n };
  }
  if (f.t === "text") { const t = s.trim(); if (!t) return { e: "пустой текст" }; if (/[<>\u0000-\u001f]/.test(t)) return { e: "нельзя < > и служебные символы" }; if (f.len && t.length > f.len) return { e: `не длиннее ${f.len} знаков` }; return { v: t }; }
  if (f.t === "enum") { if (f.opts && !f.opts.includes(s)) return { e: "нет такого варианта" }; return { v: s }; }
  return { v: s };
}
function setDraft(f: F, v: any) {
  const base = f.cur;
  if (v !== null && JSON.stringify(v) === JSON.stringify(base)) delete draft[f.p]; else if (v === null && !isMod(f)) delete draft[f.p]; else draft[f.p] = v;
  saveDraft();
}

// ---------- отрисовка ----------
function inputOf(f: F) {
  const v = shown(f), dis = f.ro ? " disabled" : "", id = "fi-" + btoa(unescape(encodeURIComponent(f.p))).replace(/[^\w]/g, "");
  if (f.t === "bool") return `<label class="sa-sw"><input id="${id}" type="checkbox" data-p="${esc(f.p)}"${v ? " checked" : ""}${dis}><span>${v ? "да" : "нет"}</span></label>`;
  if (f.t === "enum") return `<select id="${id}" data-p="${esc(f.p)}"${dis}>${(f.opts || [String(v)]).map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (f.t === "text") return (f.len || 0) > 80 ? `<textarea id="${id}" data-p="${esc(f.p)}" rows="2" maxlength="${f.len}"${dis}>${esc(v)}</textarea>` : `<input id="${id}" type="text" data-p="${esc(f.p)}" maxlength="${f.len || 60}" value="${esc(v)}"${dis}>`;
  return `<input id="${id}" type="text" inputmode="decimal" data-p="${esc(f.p)}" value="${esc(v)}"${dis}>`;
}
function fieldRow(f: F) {
  const d = f.p in draft, m = isMod(f), lg = f.p in S.legacy && !(f.p in S.over), e = errs.get(f.p);
  const range = f.t === "int" || f.t === "num" ? `${f.min ?? "…"} … ${f.max ?? "…"}` : f.t === "text" ? `до ${f.len} зн.` : f.t === "enum" ? `${f.opts?.length || 0} вар.` : "";
  return `<div class="sa-f${d ? " dr" : ""}${m ? " mod" : ""}${f.ro ? " ro" : ""}${e ? " err" : ""}" data-row="${esc(f.p)}">
    <label class="sa-fl" for="fi-${btoa(unescape(encodeURIComponent(f.p))).replace(/[^\w]/g, "")}"><b>${esc(sec === MAIN && !q ? f.g : f.l)}</b><code title="путь в правилах">${esc(f.p)}</code></label>
    <div class="sa-fi">${inputOf(f)}</div>
    ${f.hint && !(sec === MAIN && !q) ? `<div class="sa-fh">${esc(f.hint)}</div>` : ""}<div class="sa-fm"><span class="sa-def" title="значение по умолчанию (в коде)">умолч.: ${esc(fmt(f.def))}</span><span class="sa-rng">${esc(TN[f.t])}${range ? " · " + esc(range) : ""}</span>
      ${f.ro ? `<span class="sa-tag">только чтение: ${esc(f.ro)}</span>` : ""}${m ? `<span class="sa-tag mod">${lg ? "изменено (старый раздел)" : "изменено"}</span>` : ""}${d ? `<span class="sa-tag dr">черновик: ${esc(fmt(draft[f.p]))}</span>` : ""}</div>
    <div class="sa-fa">${!f.ro && (m || d) ? `<button type="button" class="sa-ic" data-def="${esc(f.p)}" title="Вернуть по умолчанию">↺</button>` : ""}${d ? `<button type="button" class="sa-ic" data-undraft="${esc(f.p)}" title="Убрать из черновика">✕</button>` : ""}</div>
    ${e ? `<div class="sa-err">${esc(e)}</div>` : ""}</div>`;
}
function visible(): F[] {
  const ql = q.trim().toLowerCase();
  const L = S.fields.filter((f) => (ql ? (f.l + " " + f.g + " " + f.p).toLowerCase().includes(ql) : inSec(f, sec)) && (!onlyMod || isMod(f) || f.p in draft) && (showRo || !f.ro || ql) && (!ftype || f.t === ftype));
  return !ql && sec === MAIN ? L.sort((a, b) => a.pin! - b.pin!) : L;
}
function renderRules() {
  const list = visible(), LIM = 600, shownL = list.slice(0, LIM), groups = new Map<string, F[]>();
  for (const f of shownL) { const k = (q ? S.sections.find((s) => s.id === f.sec)?.name + " → " : "") + f.g; (groups.get(k) || groups.set(k, []).get(k)!).push(f); }
  if (!q && sec === MAIN) { groups.clear(); for (const f of shownL) { const k = f.l; (groups.get(k) || groups.set(k, []).get(k)!).push(f); } }
  const s = sec === MAIN ? { name: "Главное", hint: "Самые важные числа партии: стартовые ОД по лигам, потолок ОД, лимит ходов. Остальное — в других разделах." } : S.sections.find((x) => x.id === sec);
  const apLow = sec === MAIN && !q ? S.fields.filter((f) => /^econ\.league\.\w+\.apBase$/.test(f.p) && Number(shown(f)) !== AP_REC) : [];
  return `<div class="sa-head">${q ? `<h2>Поиск: «${esc(q)}»</h2><p class="sa-hint">Найдено полей: ${list.length}${list.length > LIM ? ` (показаны первые ${LIM} — уточните запрос)` : ""}.</p>` : `<h2>${esc(s?.name)}</h2><p class="sa-hint">${esc(s?.hint)}</p>`}
    ${!q ? `<div class="sa-hrow"><span>Изменено полей: <b>${modCount(sec)}</b></span><button type="button" class="btn ghost sm" data-openall="1"><span>Раскрыть все</span></button><button type="button" class="btn ghost sm" data-openall="0"><span>Свернуть все</span></button>${apLow.length ? `<button type="button" class="btn gold sm" data-ap4><span>Стартовые ОД = ${AP_REC} во всех лигах</span></button>` : ""}${modCount(sec) && sec !== MAIN ? `<button type="button" class="btn ghost sm" data-resetsec="${esc(sec)}"><span>Вернуть раздел по умолчанию</span></button>` : ""}</div>` : ""}</div>
    ${groups.size ? [...groups].map(([g, fs], i) => { const k = (q ? "q:" : sec + ":") + g, o = openG.has(k) || (!closedG.has(k) && (groups.size <= 12 || i < 2 || fs.some((f) => f.p in draft || errs.has(f.p)))); return `<details class="sa-g" data-g="${esc(k)}" ${o ? "open" : ""}><summary><span>${esc(g)}</span><small>${fs.length}${fs.some(isMod) ? ` · изм. ${fs.filter(isMod).length}` : ""}</small></summary>${sec === MAIN && !q && fs[0].hint ? `<div class="sa-fh sa-gh">${esc(fs[0].hint)}</div>` : ""}${o ? fs.map(fieldRow).join("") : ""}</details>`; }).join("") : `<div class="sa-msg">Ничего не найдено. Снимите фильтры или измените запрос.</div>`}`;
}
function renderLog() {
  if (!S.log.length) return `<div class="sa-msg">Журнал пока пуст.</div>`;
  return `<div class="sa-head"><h2>Журнал изменений</h2><p class="sa-hint">Последние ${S.log.length} записей: кто, когда, было → стало. «Откатить» вернёт полю значение «было» (через проверку и новую версию).</p></div>
    <div class="sa-log">${S.log.map((r) => { const p = r.key.startsWith("p:") ? r.key.slice(2) : "", f = byP.get(p);
      const bv = p ? r.before : r.before, av = r.after;
      return `<div class="sa-lr"><div class="sa-lw"><b>${when(r.at)}</b><span>${esc(r.by)}</span>${r.rev ? `<span class="sa-tag">версия ${r.rev}</span>` : ""}</div>
        <div class="sa-lk">${f ? `<b>${esc(f.g)} · ${esc(f.l)}</b><code>${esc(p)}</code>` : p ? `<b>${esc(p)}</b><span class="sa-tag">поля больше нет</span>` : `<b>${esc(r.key)}</b><span class="sa-tag">старый раздел</span>`}</div>
        <div class="sa-lv">${p ? `${esc(fmt(bv))} → ${esc(fmt(av))}` : `${esc(JSON.stringify(bv ?? {}))} → ${av ? esc(JSON.stringify(av)) : "по умолчанию"}`}</div>
        <div>${p && f && !f.ro ? `<button type="button" class="btn ghost sm" data-undo="${r.id}"><span>Откатить</span></button>` : ""}</div></div>`; }).join("")}</div>`;
}
function renderRevs() {
  return `<div class="sa-head"><h2>Версии правил</h2><p class="sa-hint">Каждое сохранение — новая версия (полный снимок правок). Новые значения действуют только на партии, созданные после сохранения (до 15 с кэша); идущие партии и повторы доигрываются со своими правилами.</p></div>
    <div class="sa-log">${S.revs.map((v) => `<div class="sa-lr${v.rev === S.rev ? " cur" : ""}"><div class="sa-lw"><b>Версия ${v.rev}</b><span>${when(v.at)}</span></div>
      <div class="sa-lk"><b>${esc(v.note || "без описания")}</b><span>${esc(v.who || v.by)} · изменений: ${v.n}</span></div><div class="sa-lv">${v.rev === S.rev ? '<span class="sa-tag mod">действует сейчас</span>' : ""}</div>
      <div>${v.rev !== S.rev ? `<button type="button" class="btn ghost sm" data-restore="${v.rev}"><span>Вернуть эту версию</span></button>` : ""}</div></div>`).join("")}
      <div class="sa-lr"><div class="sa-lw"><b>Версия 0</b><span>исходные правила</span></div><div class="sa-lk"><b>Все значения из кода, без правок</b></div><div></div>
      <div>${S.rev !== 0 ? `<button type="button" class="btn ghost sm" data-restore="0"><span>Вернуть исходные</span></button>` : ""}</div></div></div>`;
}
function render() {
  const root = $("#sa-root"), nd = Object.keys(draft).length, modAll = S.fields.filter(isMod).length;
  root.innerHTML = `
    <nav class="sa-tabs" role="tablist">${([["rules", "Правила"], ["log", "Журнал"], ["revs", "Версии"]] as const).map(([k, n]) => `<button type="button" role="tab" class="sa-tab${tab === k ? " on" : ""}" data-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join("")}
      <span class="sa-rev">Действует версия <b>${S.rev}</b> · изменено полей: <b>${modAll}</b></span></nav>
    ${S.stale.length ? `<div class="sa-warn">В базе есть правки полей, которых больше нет в коде (${S.stale.length}): ${S.stale.slice(0, 5).map(esc).join(", ")}${S.stale.length > 5 ? "…" : ""}. Они не действуют; уберутся при «Вернуть всё по умолчанию».</div>` : ""}
    ${Object.keys(S.legacy).length ? `<div class="sa-note">Часть значений задана в старом разделе «Цели и лиги» (метка «старый раздел»). Они учтены здесь и перейдут в новые правки при первом сохранении.</div>` : ""}
    <div class="sa-main${tab !== "rules" ? " wide" : ""}">
      ${tab === "rules" ? `<aside class="sa-side"><div class="sa-search"><input id="sa-q" type="search" placeholder="Поиск по всем полям: «хп», «стоимость», fire…" value="${esc(q)}" autocomplete="off"></div>
        <div class="sa-flt"><label><input type="checkbox" id="sa-mod"${onlyMod ? " checked" : ""}> только изменённые</label><label><input type="checkbox" id="sa-ro"${showRo ? " checked" : ""}> показывать служебные</label>
        <select id="sa-type"><option value="">все типы</option>${Object.entries(TN).map(([k, n]) => `<option value="${k}"${ftype === k ? " selected" : ""}>${n}</option>`).join("")}</select></div>
        <ul class="sa-secs">${[{ id: MAIN, name: "★ Главное" }, ...S.sections].map((s) => { const m = modCount(s.id), d = draftCount(s.id); return `<li><button type="button" class="sa-sec${s.id === sec && !q ? " on" : ""}" data-sec="${s.id}"><span>${esc(s.name)}</span>${m ? `<i class="m" title="изменено">${m}</i>` : ""}${d ? `<i class="d" title="в черновике">${d}</i>` : ""}</button></li>`; }).join("")}</ul>
        ${modAll ? `<button type="button" class="btn danger sm sa-all" data-resetall><span>Вернуть всё по умолчанию</span></button>` : ""}</aside>
        <section class="sa-body-col">${renderRules()}</section>` : `<section class="sa-body-col">${tab === "log" ? renderLog() : renderRevs()}</section>`}
    </div>
    <div class="sa-bar${nd ? " on" : ""}"><span>В черновике: <b>${nd}</b> ${nd === 1 ? "правка" : nd >= 2 && nd <= 4 ? "правки" : "правок"}</span>
      <button type="button" class="btn ghost sm" data-discard${nd ? "" : " disabled"}><span>Отбросить</span></button>
      <button type="button" class="btn gold" data-check${nd ? "" : " disabled"}><span>Проверить и сохранить</span></button></div>`;
}

// ---------- действия ----------
function modal(html: string) { const m = $("#sa-modal"); m.innerHTML = `<div class="sa-ov" data-close><div class="sa-dlg panel" role="dialog" aria-modal="true">${html}</div></div>`; return m; }
const closeModal = () => ($("#sa-modal").innerHTML = "");
function diffTable(diff: D[]) {
  return `<div class="sa-diff">${diff.map((d) => `<div class="sa-dr"><div><b>${esc(d.g)} · ${esc(d.l)}</b><code>${esc(d.p)}</code></div><div class="sa-dv"><s>${esc(fmt(d.before))}</s> → <b>${d.reset ? `${esc(fmt(d.after))} <small>(по умолчанию)</small>` : esc(fmt(d.after))}</b></div></div>`).join("")}</div>`;
}
function showErrors(list: { p: string; msg: string }[]) {
  errs = new Map(list.filter((e) => e.p).map((e) => [e.p, e.msg]));
  modal(`<h2 class="plate">Есть ошибки</h2><p>Ничего не сохранено. Исправьте поля:</p><ul class="sa-errs">${list.map((e) => { const f = byP.get(e.p); return `<li>${f ? `<a href="#" data-goto="${esc(e.p)}">${esc(f.g)} · ${esc(f.l)}</a>: ` : e.p ? `<code>${esc(e.p)}</code>: ` : ""}${esc(e.msg.replace(f ? `${f.g} · ${f.l}: ` : "", ""))}</li>`; }).join("")}</ul>
    <div class="sa-row"><button type="button" class="btn gold" data-close><span>Понятно</span></button></div>`);
  render();
}
/** Сохранение черновика: «проверить» на сервере → разница → подтвердить → сохранить. */
async function flow(op: any, title: string, okText: string) {
  const chk = await api("POST", { op: "check", set: op.set });
  if (chk.status === 400 && chk.j.errors) return showErrors(chk.j.errors);
  if (chk.status !== 200) return toast(chk.j.msg || "Не удалось проверить.", "bad");
  const diff: D[] = chk.j.diff;
  if (!diff.length) { toast("Изменений нет — всё уже так."); draft = {}; saveDraft(); errs.clear(); return render(); }
  modal(`<h2 class="plate">${esc(title)}</h2><p>Будет изменено полей: <b>${diff.length}</b>. Действует для новых партий; идущие партии и повторы не затронет.</p>${diffTable(diff)}
    <label class="fld sa-note-in"><span>Что и зачем (видно в версиях)</span><input id="sa-note" maxlength="200" placeholder="например: ослабил ульт Огня"></label>
    <div class="sa-row"><button type="button" class="btn ghost" data-close><span>Отмена</span></button><button type="button" class="btn gold" id="sa-go"><span>${esc(okText)}</span></button></div>`);
  ($("#sa-go") as HTMLButtonElement).onclick = async () => {
    const note = ($("#sa-note") as HTMLInputElement).value; ($("#sa-go") as HTMLButtonElement).disabled = true;
    const r = await api("POST", { ...op, note, base: S.rev, who: S.me });
    if (r.status === 200) { if (op.op === "save") { draft = {}; saveDraft(); } errs.clear(); closeModal(); toast(`Сохранено: версия ${r.j.rev}, изменений ${r.j.diff?.length ?? r.j.n}.`); return reload(); }
    if (r.status === 400 && r.j.errors) return showErrors(r.j.errors);
    if (r.status === 409) { closeModal(); toast(r.j.msg, "bad"); return reload(); }
    ($("#sa-go") as HTMLButtonElement).disabled = false; toast(r.j.msg || "Ошибка — ничего не сохранено.", "bad");
  };
}
/** Действия без черновика (откат, версия, сброс): сервер сам строит набор; разницу показываем после проверки на сервере. */
async function serverOp(op: any, title: string, okText: string, preview: D[]) {
  modal(`<h2 class="plate">${esc(title)}</h2>${preview.length ? `<p>Будет изменено полей: <b>${preview.length}</b>.</p>${diffTable(preview)}` : "<p>Изменений не будет — всё уже так.</p>"}
    <p class="sa-hint">Действует для новых партий; идущие партии и повторы не затронет. Это тоже новая версия — её можно откатить.</p>
    <label class="fld sa-note-in"><span>Комментарий (необязательно)</span><input id="sa-note" maxlength="200"></label>
    <div class="sa-row"><button type="button" class="btn ghost" data-close><span>Отмена</span></button><button type="button" class="btn gold" id="sa-go"${preview.length ? "" : " disabled"}><span>${esc(okText)}</span></button></div>`);
  ($("#sa-go") as HTMLButtonElement).onclick = async () => {
    ($("#sa-go") as HTMLButtonElement).disabled = true;
    const r = await api("POST", { ...op, note: ($("#sa-note") as HTMLInputElement).value, base: S.rev, who: S.me });
    if (r.status === 200) { closeModal(); toast(`Готово: версия ${r.j.rev}, изменений ${r.j.diff?.length ?? 0}.`); for (const d of r.j.diff || []) delete draft[d.p]; saveDraft(); return reload(); }
    if (r.status === 400 && r.j.errors) return showErrors(r.j.errors);
    closeModal(); toast(r.j.msg || "Не получилось.", "bad"); if (r.status === 409) reload();
  };
}
/** Предпросмотр отката/версии/сброса: тот же запрос с dry:true — сервер считает разницу и ничего не пишет. */
async function preview(op: any): Promise<D[] | null> {
  const r = await api("POST", { ...op, dry: true }); if (r.status === 200) return r.j.diff; if (r.status === 400 && r.j.errors) { showErrors(r.j.errors); return null; } toast(r.j.msg || "Не удалось проверить.", "bad"); return null;
}
const ask = async (op: any, title: string, ok: string) => { const pv = await preview(op); if (pv) serverOp(op, title, ok, pv); };

function wire() {
  const root = $("#sa-root");
  root.addEventListener("click", async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-ap4],[data-openall],[data-tab],[data-sec],[data-def],[data-undraft],[data-discard],[data-check],[data-undo],[data-restore],[data-resetsec],[data-resetall]"); if (!t) return;
    const d = t.dataset;
    if (d.openall) { for (const el of root.querySelectorAll<HTMLElement>("details.sa-g")) { const k = el.dataset.g!; if (d.openall === "1") { openG.add(k); closedG.delete(k); } else { openG.delete(k); closedG.add(k); } } render(); return; }
    if (d.tab) { tab = d.tab as any; render(); return; }
    if (d.ap4 !== undefined) { // черновик: стартовые ОД = 4 в каждой лиге (+потолок не ниже); сохранение — как обычно, через проверку и разницу
      for (const f of S.fields) if (/^econ\.league\.\w+\.apBase$/.test(f.p)) { setDraft(f, AP_REC); errs.delete(f.p); const mx = byP.get(f.p.replace(/apBase$/, "apMax")); if (mx && Number(shown(mx)) < AP_REC) setDraft(mx, AP_REC); }
      render(); toast(`В черновике: стартовые ОД = ${AP_REC} во всех лигах. Нажмите «Проверить и сохранить».`); return; }
    if (d.sec) { sec = d.sec; q = ""; render(); window.scrollTo({ top: 0 }); return; }
    if (d.def) { const f = byP.get(d.def)!; setDraft(f, null); errs.delete(f.p); render(); return; }
    if (d.undraft !== undefined) { delete draft[d.undraft]; errs.delete(d.undraft); saveDraft(); render(); return; }
    if (d.discard !== undefined) { if (confirm("Отбросить все правки из черновика?")) { draft = {}; errs.clear(); saveDraft(); render(); } return; }
    if (d.check !== undefined) { if (errs.size) return showErrors([...errs].map(([p, msg]) => ({ p, msg }))); return flow({ op: "save", set: draft }, "Проверка пройдена — сохранить?", "Сохранить"); }
    if (d.undo) return ask({ op: "undo", log: Number(d.undo) }, "Откатить запись журнала?", "Откатить");
    if (d.restore !== undefined) { const v = Number(d.restore); return ask({ op: "restore", rev: v }, v ? `Вернуть версию ${v}?` : "Вернуть исходные правила?", "Вернуть"); }
    if (d.resetsec) return ask({ op: "reset", sec: d.resetsec }, `Вернуть раздел «${S.sections.find((s) => s.id === d.resetsec)?.name}» по умолчанию?`, "Вернуть по умолчанию");
    if (d.resetall !== undefined) return ask({ op: "reset" }, "Вернуть ВСЕ правила по умолчанию?", "Вернуть всё");
  });
  root.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === "sa-mod") { onlyMod = el.checked; return render(); }
    if (el.id === "sa-ro") { showRo = el.checked; return render(); }
    if (el.id === "sa-type") { ftype = el.value; return render(); }
    const p = el.dataset.p; if (!p) return; const f = byP.get(p); if (!f || f.ro) return;
    const r = parse(f, f.t === "bool" ? el.checked : el.value);
    if (r.e) { errs.set(p, r.e); draft[p] = el.value; saveDraft(); }
    else { errs.delete(p); setDraft(f, r.v); }
    const y = window.scrollY; render(); window.scrollTo({ top: y });
    ($(`[data-row="${CSS.escape(p)}"] input, [data-row="${CSS.escape(p)}"] select, [data-row="${CSS.escape(p)}"] textarea`) as HTMLElement | null)?.focus({ preventScroll: true });
  });
  // раскрытие группы: запоминаем и дорисовываем её поля (свёрнутые группы не рисуются — 2500 полей на телефоне это тяжело)
  root.addEventListener("toggle", (e) => {
    const el = e.target as HTMLDetailsElement; if (!el.matches?.("details.sa-g")) return; const k = el.dataset.g!;
    if (el.open) { openG.add(k); closedG.delete(k); if (!el.querySelector(".sa-f")) { const y = window.scrollY; render(); window.scrollTo({ top: y }); } } else { openG.delete(k); closedG.add(k); }
  }, true);
  let tq: any; root.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement; if (el.id !== "sa-q") return;
    clearTimeout(tq); tq = setTimeout(() => { q = el.value; const pos = el.selectionStart; render(); const n = $("#sa-q") as HTMLInputElement; n.focus(); n.setSelectionRange(pos, pos); }, 250);
  });
  $("#sa-modal").addEventListener("click", (e) => {
    const t = e.target as HTMLElement, g = t.closest<HTMLElement>("[data-goto]");
    if (g) { e.preventDefault(); const f = byP.get(g.dataset.goto!)!; closeModal(); tab = "rules"; q = ""; sec = f.sec; showRo = showRo || !!f.ro; render(); const row = $(`[data-row="${CSS.escape(f.p)}"]`); row?.closest("details")?.setAttribute("open", ""); row?.scrollIntoView({ block: "center" }); return; }
    if (t.matches("[data-close]") || t.closest("button[data-close]")) closeModal();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

async function reload() {
  const { status, j } = await api("GET");
  if (status !== 200) { $("#sa-root").innerHTML = `<div class="sa-deny panel"><h2 class="plate">${status === 401 ? "Нужен вход" : status === 403 ? "Нет доступа" : "Ошибка"}</h2><p>${esc(j.msg || "Сервер игры не отвечает.")}</p>${status === 401 ? '<p class="sa-hint">Войдите на сайт под учётной записью администратора и обновите страницу.</p>' : ""}</div>`; return false; }
  S = j; byP = new Map(S.fields.map((f) => [f.p, f]));
  for (const p of Object.keys(draft)) if (!byP.has(p)) delete draft[p]; // поле пропало из кода — убираем черновик
  if (!sec) sec = MAIN;
  $("#sa-me").textContent = "админ: " + S.me;
  render(); return true;
}
export async function bootAdmin() {
  draft = loadDraft(); wire();
  if (await reload() && Object.keys(draft).length) toast(`Восстановлен черновик: ${Object.keys(draft).length} правок (не сохранён).`);
}
