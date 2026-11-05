// Каркас админки кампаний — localStorage. Схема = ТЗ §6.
type Camp = { id: string; title: string; maps: { id: string; title: string; payload: any; sceneBefore?: any }[]; updated: number };
const KEY = "chess_campaigns_v1";
const load = (): Camp[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const save = (a: Camp[]) => localStorage.setItem(KEY, JSON.stringify(a));
let sel: string | null = null;

function render() {
  const list = document.getElementById("list")!;
  const all = load();
  list.innerHTML = all.length ? all.map((c) =>
    `<div class="row"><span><b>${c.title}</b> · карт ${c.maps.length}</span>
      <span><button class="btn ghost" data-sel="${c.id}">Выбрать</button>
      <button class="btn ghost" data-del="${c.id}">Удалить</button></span></div>`
  ).join("") : `<div class="empty">Пока нет кампаний</div>`;
  list.querySelectorAll("[data-sel]").forEach((b) => b.addEventListener("click", () => { sel = (b as HTMLElement).dataset.sel!; alert("Выбрано: " + sel); }));
  list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    save(load().filter((c) => c.id !== (b as HTMLElement).dataset.del)); render();
  }));
}
document.getElementById("add")!.onclick = () => {
  const title = (document.getElementById("title") as HTMLInputElement).value.trim() || "Новая кампания";
  const all = load();
  all.push({ id: crypto.randomUUID().slice(0, 8), title, maps: [], updated: Date.now() });
  save(all); render();
};
document.getElementById("save-map")!.onclick = () => {
  if (!sel) { alert("Сначала выбери кампанию"); return; }
  let payload: any; try { payload = JSON.parse((document.getElementById("payload") as HTMLTextAreaElement).value); }
  catch { alert("JSON карты битый"); return; }
  const all = load(); const c = all.find((x) => x.id === sel)!;
  c.maps.push({ id: crypto.randomUUID().slice(0, 8), title: "Карта " + (c.maps.length + 1), payload });
  c.updated = Date.now(); save(all); render(); alert("Карта сохранена локально");
};
document.getElementById("save-scene")!.onclick = () => {
  if (!sel) { alert("Сначала выбери кампанию"); return; }
  let scene: any; try { scene = JSON.parse((document.getElementById("scene") as HTMLTextAreaElement).value); }
  catch { alert("JSON сцены битый"); return; }
  const all = load(); const c = all.find((x) => x.id === sel)!;
  if (!c.maps.length) { alert("Сначала сохрани карту"); return; }
  c.maps[c.maps.length - 1].sceneBefore = scene; save(all); alert("Сцена before на последней карте");
};
render();
