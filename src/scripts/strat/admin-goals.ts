// G (t1209): админка «Партия Чёрных королей → Цели и лиги». Сервер: /strat/admin/goals (роль проверяется на сервере, 401/403).
// Правка действует на партии, созданные ПОСЛЕ сохранения (≤15 с кэша); идущие партии и повторы — со своим снимком.
type Auth = () => Promise<{ token?: string; dev?: string }>;
const LG: Record<string, string> = { quick: "Быстрая", normal: "Обычная", tactical: "Тактическая" };
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function mountAdminGoals(box: HTMLElement, o: { http: string; auth: Auth; toast?: (t: string, k: string) => void }) {
  const req = async (method: string, size?: number, body?: any) => {
    const a = await o.auth(), u = new URL(o.http + "/strat/admin/goals"); if (a.dev) u.searchParams.set("devUser", a.dev); if (size) u.searchParams.set("size", String(size));
    const r = await fetch(u, { method, headers: { ...(a.token ? { Authorization: "Bearer " + a.token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  const load = async () => {
    box.innerHTML = '<div class="muted">Загрузка…</div>';
    const { status, j } = await req("GET"); if (status !== 200) { box.innerHTML = `<div class="warn">${esc(j.msg || j.err || status)}</div>`; return; }
    const F = j.fields as Record<string, { name: string; min: number; max: number; int: boolean }>;
    box.innerHTML = `<p class="muted">Числа по лигам. Действуют на партии, созданные после сохранения; идущие партии и повторы — со своими числами. Опыт × общий для лиги (5×5 и 8×8 — Быстрая).</p>
      <div class="ag-grid">${j.leagues.map((L: any) => `<form class="ag-lg" data-size="${L.size}"><h4>${L.size}×${L.size} · ${esc(LG[L.league] || L.league)}${Object.keys(L.over).length ? ' <span class="ag-mod">изменено</span>' : ""}</h4>
        ${Object.entries(F).map(([k, f]) => `<label class="${k in L.over ? "ov" : ""}"><span>${esc(f.name)}</span><input name="${k}" type="number" step="${f.int ? 1 : "any"}" min="${f.min}" max="${f.max}" value="${L.cur[k] ?? ""}" data-def="${L.def[k] ?? ""}" title="по умолчанию ${L.def[k] ?? "—"}; ${f.min}…${f.max}"></label>`).join("")}
        <div class="row"><button class="btn sm gold" type="submit"><span>Сохранить</span></button><button class="btn sm ghost" type="button" data-reset><span>Сбросить к умолчанию</span></button></div><div class="ag-err warn"></div></form>`).join("")}</div>
      <h4>Журнал изменений</h4><div class="ag-log">${j.log.length ? j.log.map((r: any) => `<div><b>${new Date(r.at).toLocaleString("ru-RU")}</b> · ${esc(r.key)} · ${esc(r.by)}: ${esc(JSON.stringify(r.before || {}))} → ${r.after ? esc(JSON.stringify(r.after)) : "по умолчанию"}</div>`).join("") : '<div class="muted">пока пусто</div>'}</div>`;
    for (const f of box.querySelectorAll<HTMLFormElement>("form.ag-lg")) {
      const size = Number(f.dataset.size), err = f.querySelector(".ag-err") as HTMLElement;
      f.onsubmit = async (e) => { e.preventDefault(); const body: any = {};
        for (const i of f.querySelectorAll<HTMLInputElement>("input")) { const v = i.value.trim(); body[i.name] = v === "" || Number(v) === Number(i.dataset.def) ? null : Number(v); }
        const r = await req("PUT", size, body); if (r.status !== 200) { err.textContent = (r.j.errors || [r.j.msg || r.j.err]).join("; "); return; } o.toast?.(`Сохранено: ${size}×${size}`, "good"); load(); };
      (f.querySelector("[data-reset]") as HTMLButtonElement).onclick = async () => { const r = await req("DELETE", size); if (r.status !== 200) { err.textContent = r.j.msg || r.j.err; return; } o.toast?.(`Сброшено: ${size}×${size}`, "good"); load(); };
    }
  };
  await load();
}
