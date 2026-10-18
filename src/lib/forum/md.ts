// Форум: безопасная «лёгкая разметка» (markdown-lite) → HTML. Общий код для сервера (рендер при записи)
// и клиента (живой предпросмотр в редакторе). Сырой HTML не поддерживается: весь текст сначала экранируется,
// затем узнаются только разрешённые конструкции. Ссылки — только https/http и внутренние «/…»,
// картинки — только https или свои загрузки (/api/forum/media/…). Внешним ссылкам — rel="nofollow noopener ugc".

export const MEDIA_PREFIX = "/api/forum/media/";

export function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}
function unesc(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const MEDIA_KEY_RE = /^[a-z0-9][a-z0-9/_-]{5,80}\.(webp|png|jpg|gif)$/;

/** Проверка URL ссылки. Возвращает безопасный URL или null. */
export function safeLinkUrl(raw: string): string | null {
  const u = unesc(raw).trim();
  if (u.length > 500 || /[\s"'<>\\`]/.test(u)) return null;
  if (/^\/(?!\/)[\w\-./?=&%#~+]*$/.test(u)) return u; // внутренняя
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" && p.protocol !== "http:") return null;
    if (p.username || p.password) return null;
    return p.toString();
  } catch { return null; }
}
/** Картинка: своя загрузка или https. */
export function safeImageUrl(raw: string): string | null {
  const u = unesc(raw).trim();
  if (u.startsWith(MEDIA_PREFIX)) return MEDIA_KEY_RE.test(u.slice(MEDIA_PREFIX.length)) ? u : null;
  if (u.length > 500 || /[\s"'<>\\`]/.test(u)) return null;
  try { const p = new URL(u); return p.protocol === "https:" && !p.username && !p.password ? p.toString() : null; } catch { return null; }
}
export function youtubeId(raw: string): string | null {
  const u = unesc(raw).trim();
  const m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#][^\s]*)?$/);
  return m ? m[1] : null;
}

function isInternal(u: string) { return u.startsWith("/"); }

function inline(text: string): string {
  // text — уже экранирован
  const ph: string[] = [];
  const keep = (html: string) => { ph.push(html); return `\u0000${ph.length - 1}\u0000`; };
  let s = text;
  s = s.replace(/`([^`\n]{1,300})`/g, (_, c) => keep(`<code>${c}</code>`));
  s = s.replace(/!\[([^\]\n]{0,120})\]\(([^)\s]{1,500})\)/g, (m, alt, url) => {
    const u = safeImageUrl(url);
    return u ? keep(`<img src="${esc(u)}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`) : m;
  });
  s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, (m, label, url) => {
    const u = safeLinkUrl(url);
    if (!u) return m;
    const attrs = isInternal(u) ? "" : ' target="_blank" rel="nofollow noopener noreferrer ugc"';
    return keep(`<a href="${esc(u)}"${attrs}>${fmt(label)}</a>`);
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]{3,300})/g, (m, pre, url) => {
    let tail = "";
    let raw = url;
    const t = raw.match(/[.,!?;:)]+$/); if (t) { tail = t[0]; raw = raw.slice(0, -tail.length); }
    const u = safeLinkUrl(raw);
    if (!u) return m;
    const label = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
    return pre + keep(`<a href="${esc(u)}" target="_blank" rel="nofollow noopener noreferrer ugc">${label}</a>`) + tail;
  });
  s = fmt(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => ph[+i]);
}
function fmt(s: string): string {
  return s
    .replace(/\*\*(?=\S)([^*\n]{1,500}?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\p{L}\p{N}])\*(?=\S)([^*\n]{1,500}?)(?<=\S)\*(?![\p{L}\p{N}])/gu, "$1<em>$2</em>")
    .replace(/~~([^~\n]{1,500}?)~~/g, "<s>$1</s>")
    .replace(/\|\|([^|\n]{1,500}?)\|\|/g, '<span class="f-spoiler" tabindex="0">$1</span>');
}

export interface RenderOpts { headings?: boolean; media?: boolean }

export function renderMd(src: string, opts: RenderOpts = {}): string {
  const headings = opts.headings !== false, media = opts.media !== false;
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map((l) => inline(esc(l))).join("<br>")}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i++; }
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!t) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if (headings && (m = t.match(/^(#{1,3})\s+(.{1,200})$/))) { flush(); const lv = m[1].length + 1; out.push(`<h${lv}>${inline(esc(m[2]))}</h${lv}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { flush(); out.push("<hr>"); continue; }
    if (media) {
      const yt = youtubeId(t);
      if (yt) { flush(); out.push(`<div class="f-yt" data-yt="${yt}"><img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="Видео YouTube" loading="lazy" referrerpolicy="no-referrer"><button type="button" class="f-yt-play" aria-label="Смотреть видео">▶</button></div>`); continue; }
      if ((m = t.match(/^!\[([^\]\n]{0,120})\]\(([^)\s]{1,500})\)$/))) {
        const u = safeImageUrl(m[2]);
        if (u) { flush(); out.push(`<figure class="f-fig"><img src="${esc(u)}" alt="${esc(m[1])}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ""}</figure>`); continue; }
      }
    }
    if (t.startsWith(">")) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { q.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      i--;
      out.push(`<blockquote>${q.map((l) => inline(esc(l))).join("<br>")}</blockquote>`);
      continue;
    }
    if (/^[-*•]\s+/.test(t) || /^\d{1,3}[.)]\s+/.test(t)) {
      flush();
      const ordered = /^\d/.test(t);
      const re = ordered ? /^\d{1,3}[.)]\s+/ : /^[-*•]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i].trim())) { items.push(lines[i].trim().replace(re, "")); i++; }
      i--;
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((x) => `<li>${inline(esc(x))}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join("\n");
}

/** Простой текст для анонса карточки. */
export function plainText(src: string, max = 220): string {
  const s = String(src ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*~`|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/** Первая своя картинка в тексте (для превью карточки). */
export function firstMediaKey(src: string): string | null {
  const re = /!\[[^\]]*\]\((\/api\/forum\/media\/([^)\s]+))\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(src ?? "")))) if (MEDIA_KEY_RE.test(m[2])) return m[2];
  return null;
}
export function isMediaKey(k: string) { return MEDIA_KEY_RE.test(k); }
