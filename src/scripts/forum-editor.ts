// Редактор форума (клиент). Предпросмотр рендерится тем же кодом, что и на сервере (md.ts);
// сервер всё равно рендерит заново при сохранении — клиенту не доверяем.
import { renderMd } from "../lib/forum/md";
import { api, toast } from "./forum";

const MAX_SIDE = 1920;

/** Сжатие в WebP на клиенте: уменьшает трафик и заодно убирает EXIF (геопозицию и т. п.). GIF — как есть (анимация). */
async function prepareImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/webp", 0.86));
    if (blob && blob.type === "image/webp" && (blob.size < file.size || k < 1 || file.type !== "image/webp")) return blob;
  } catch {}
  return file;
}
async function upload(file: File, maxMb: number): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Только JPEG, PNG, WebP или GIF");
  const blob = await prepareImage(file);
  if (blob.size > maxMb * 1024 * 1024) throw new Error(`Картинка больше ${maxMb} МБ даже после сжатия`);
  const res = await fetch("/api/forum/upload", { method: "POST", headers: { "x-forum": "1", "content-type": blob.type || "application/octet-stream" }, body: blob, credentials: "same-origin" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Не удалось загрузить");
  return d.url;
}

function init() {
  const form = document.querySelector<HTMLFormElement>("form[data-editor]");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "1";
  const ta = form.querySelector<HTMLTextAreaElement>("textarea[name=body]")!;
  const title = form.querySelector<HTMLInputElement>("input[name=title]")!;
  const prev = form.querySelector<HTMLElement>(".f-ed-preview")!;
  const cnt = form.querySelector<HTMLElement>("[data-count]")!;
  const draftEl = form.querySelector<HTMLElement>("[data-draft]")!;
  const ed = form.querySelector<HTMLElement>(".f-ed")!;
  const fileIn = form.querySelector<HTMLInputElement>("[data-file]")!;
  const coverIn = form.querySelector<HTMLInputElement>("[data-cover-file]")!;
  const coverBox = form.querySelector<HTMLElement>("[data-cover-box]")!;
  const coverDrop = form.querySelector<HTMLElement>("[data-cover-drop]")!;
  const coverVal = form.querySelector<HTMLInputElement>("input[name=cover]")!;
  const maxMb = Number(form.dataset.maxmb) || 5;
  const key = "forum_draft_" + (form.dataset.topic || "new");

  // черновик
  try {
    const d = JSON.parse(localStorage.getItem(key) || "null");
    if (d && (d.body || d.title) && (!form.dataset.topic || d.body !== ta.value)) {
      if (!form.dataset.topic || confirm("Найден несохранённый черновик правки. Восстановить?")) {
        ta.value = d.body || ta.value; title.value = d.title || title.value;
        if (d.kind) (form.querySelector(`input[name=kind][value=${d.kind}]`) as HTMLInputElement | null)?.click();
        if (d.cover) coverVal.value = d.cover;
        draftEl.textContent = "черновик восстановлен";
      }
    }
  } catch {}

  let rt: any, st: any;
  const render = () => { prev.innerHTML = renderMd(ta.value); cnt.textContent = String(ta.value.length); };
  const save = () => {
    clearTimeout(st);
    st = setTimeout(() => {
      try {
        const kind = (form.querySelector("input[name=kind]:checked") as HTMLInputElement)?.value;
        localStorage.setItem(key, JSON.stringify({ title: title.value, body: ta.value, kind, cover: coverVal.value, at: Date.now() }));
        draftEl.textContent = "черновик сохранён " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      } catch {}
    }, 600);
  };
  const changed = () => { clearTimeout(rt); rt = setTimeout(render, 120); save(); };
  ta.addEventListener("input", changed);
  title.addEventListener("input", save);
  render();

  // тип записи
  form.querySelectorAll<HTMLInputElement>("input[name=kind]").forEach((r) => r.addEventListener("change", () => {
    form.querySelectorAll(".f-ed-kind label").forEach((l) => l.classList.toggle("on", (l.querySelector("input") as HTMLInputElement).checked));
    coverBox.hidden = (form.querySelector("input[name=kind]:checked") as HTMLInputElement).value !== "article";
    save();
  }));

  // вставка разметки
  const wrap = (a: string, b = a, ph = "текст") => {
    const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
    ta.setRangeText(a + sel + b, s, e, "end");
    ta.selectionStart = s + a.length; ta.selectionEnd = s + a.length + sel.length;
    ta.focus(); changed();
  };
  const linePrefix = (p: string | ((i: number) => string)) => {
    const s = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    let e = ta.value.indexOf("\n", ta.selectionEnd); if (e < 0) e = ta.value.length;
    const lines = ta.value.slice(s, e).split("\n").map((l, i) => (typeof p === "function" ? p(i) : p) + l.replace(/^(#{1,3} |> |- |\d+\. )/, ""));
    ta.setRangeText(lines.join("\n"), s, e, "end"); ta.focus(); changed();
  };
  const insertBlock = (txt: string) => {
    const s = ta.selectionStart;
    const before = ta.value.slice(0, s);
    const pre = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    ta.setRangeText(pre + txt + "\n", s, ta.selectionEnd, "end"); ta.focus(); changed();
  };
  const placeholderFor = (name: string) => `![Загрузка ${name}…]()`;
  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const maxImg = Number(form!.dataset.maximg) || 20;
    const have = (ta.value.match(/!\[[^\]]*\]\([^)\s]+\)/g) || []).length;
    if (have + list.length > maxImg) { toast(`Не больше ${maxImg} картинок в записи`, true); return; }
    for (const f of list) {
      const ph = placeholderFor(f.name.slice(0, 30).replace(/[\[\]()]/g, ""));
      insertBlock(ph);
      try {
        const url = await upload(f, maxMb);
        ta.value = ta.value.replace(ph, `![](${url})`);
      } catch (e: any) { ta.value = ta.value.replace(ph + "\n", "").replace(ph, ""); toast(e.message, true); }
      changed();
    }
  }
  form.querySelector(".f-ed-bar")!.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.mode) {
      const m = ed.dataset.mode === b.dataset.mode ? "" : b.dataset.mode;
      ed.dataset.mode = m!;
      form.querySelectorAll(".f-ed-mode").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.mode === m));
      return;
    }
    switch (b.dataset.md) {
      case "b": return wrap("**");
      case "i": return wrap("*");
      case "s": return wrap("~~");
      case "spoiler": return wrap("||", "||", "спойлер");
      case "code": return ta.value.slice(ta.selectionStart, ta.selectionEnd).includes("\n") ? wrap("```\n", "\n```", "код") : wrap("`", "`", "код");
      case "h2": return linePrefix("# ");
      case "h3": return linePrefix("## ");
      case "ul": return linePrefix("- ");
      case "ol": return linePrefix((i) => `${i + 1}. `);
      case "quote": return linePrefix("> ");
      case "hr": return insertBlock("---");
      case "link": {
        const url = prompt("Адрес ссылки (https://…)", "https://");
        if (url && /^https?:\/\/\S+$/.test(url)) wrap("[", `](${url})`, "текст ссылки");
        return;
      }
      case "yt": {
        const url = prompt("Ссылка на видео YouTube", "https://www.youtube.com/watch?v=");
        if (url && /youtu/.test(url)) insertBlock(url.trim());
        return;
      }
      case "img": fileIn.click(); return;
    }
  });
  ta.addEventListener("keydown", (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    if (k === "b" || k === "и") { ev.preventDefault(); wrap("**"); }
    else if (k === "i" || k === "ш") { ev.preventDefault(); wrap("*"); }
    else if (k === "k" || k === "л") { ev.preventDefault(); (form.querySelector('[data-md=link]') as HTMLElement).click(); }
  });
  fileIn.addEventListener("change", () => { if (fileIn.files?.length) addFiles(fileIn.files); fileIn.value = ""; });
  ta.addEventListener("paste", (ev) => { const fs = ev.clipboardData?.files; if (fs && fs.length) { ev.preventDefault(); addFiles(fs); } });
  ta.addEventListener("dragover", (ev) => { ev.preventDefault(); ta.classList.add("drag"); });
  ta.addEventListener("dragleave", () => ta.classList.remove("drag"));
  ta.addEventListener("drop", (ev) => { ev.preventDefault(); ta.classList.remove("drag"); if (ev.dataTransfer?.files.length) addFiles(ev.dataTransfer.files); });

  // обложка
  const setCover = (url: string) => {
    coverVal.value = url ? url.replace("/api/forum/media/", "") : "";
    coverDrop.innerHTML = "";
    if (url) { const img = document.createElement("img"); img.src = url; img.alt = ""; coverDrop.append(img); }
    else { const s = document.createElement("span"); s.textContent = "🖼 Нажмите или перетащите картинку для обложки"; coverDrop.append(s); }
    save();
  };
  if (coverVal.value && !coverDrop.querySelector("img")) setCover("/api/forum/media/" + coverVal.value);
  const coverUpload = async (f: File) => {
    coverDrop.classList.add("busy");
    try { setCover(await upload(f, maxMb)); } catch (e: any) { toast(e.message, true); }
    coverDrop.classList.remove("busy");
  };
  coverDrop.addEventListener("click", () => coverIn.click());
  coverDrop.addEventListener("dragover", (ev) => ev.preventDefault());
  coverDrop.addEventListener("drop", (ev) => { ev.preventDefault(); const f = ev.dataTransfer?.files[0]; if (f) coverUpload(f); });
  coverIn.addEventListener("change", () => { const f = coverIn.files?.[0]; if (f) coverUpload(f); coverIn.value = ""; });
  form.querySelector("[data-cover-clear]")!.addEventListener("click", () => setCover(""));

  // отправка
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    if (/!\[Загрузка [^\]]*…\]\(\)/.test(ta.value)) { toast("Дождитесь загрузки картинок"); return; }
    const fd = new FormData(form);
    const data = { title: String(fd.get("title") || ""), body: ta.value, section_id: Number(fd.get("section_id")), kind: String(fd.get("kind") || "discussion"), cover: String(fd.get("cover") || "") || null };
    btn.disabled = true;
    try {
      const r = form.dataset.topic ? await api("PUT", "topic/" + form.dataset.topic, data) : await api("POST", "topics", data);
      try { localStorage.removeItem(key); } catch {}
      location.href = "/forum/t/" + r.id;
    } catch (e: any) { toast(e.message, true); btn.disabled = false; }
  });
}
document.addEventListener("astro:page-load", init);
init();
