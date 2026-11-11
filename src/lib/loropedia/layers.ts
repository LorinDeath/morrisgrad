// Слои книг поверх собранных данных Лоропедии. Базовые data.json / expanded.json не меняются:
// новая книга кладётся отдельным файлом и подмешивается при сборке страницы.
import darg from "../../data/loropedia/books/darg-sirrom.json";

type AnyData = any;
export type BookLayer = {
  id: string; title: string; short: string;
  chapters: { n: number; slug: string; title: string }[];
  articles: any[]; appends: Record<string, string>; renames?: Record<string, { title?: string; aliases?: string[] }>;
  extraLinks: Record<string, string[]>; timeline: { era: string; html: string; disputed: boolean }[];
  events: { slug: string; title: string; when: string; status: string; statusLabel: string }[];
};
export const BOOK_LAYERS: BookLayer[] = [darg as unknown as BookLayer];

const tocOf = (html: string) => [...html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((m) => ({ id: m[1], text: m[2], level: 2 }));
const STATUS: Record<string, [string, string]> = { canon: ["Канон", "✅"], idea: ["Не канон", "💡"], disputed: ["Спорно", "⚠️"], ref: ["Справка", "📎"] };

/** Возвращает новую копию данных с подмешанными слоями. Слаги, картинки и старые статьи не трогаются. */
export function applyLayers<T>(baseIn: T, layers: BookLayer[] = BOOK_LAYERS): T {
  const base = baseIn as AnyData;
  const data: AnyData = { ...base, articles: base.articles.map((a: any) => ({ ...a, links: [...a.links], backlinks: [...a.backlinks], toc: [...a.toc], aliases: [...a.aliases] })) };
  const by = new Map<string, any>(data.articles.map((a: any) => [a.slug, a]));
  for (const L of layers) {
    for (const n of L.articles) {
      if (by.has(n.slug)) continue;
      const [label, icon] = STATUS[n.status] || STATUS.canon;
      const a = { slug: n.slug, title: n.title, cat: n.cat, type: n.type, status: n.status, statusLabel: label, statusIcon: icon, invented: false,
        aliases: n.aliases || [], tags: n.tags || [], fields: n.fields || [], image: null, gallery: [], html: n.html, toc: tocOf(n.html), excerpt: n.excerpt,
        links: [], backlinks: [], clan: n.clan || "", role: n.role || "", when: n.when || "", order: n.order ?? null, redacted: false, books: n.books || [L.id], layer: L.id };
      data.articles.push(a); by.set(a.slug, a);
    }
    for (const [slug, r] of Object.entries(L.renames || {})) {
      const a = by.get(slug); if (!a) continue;
      if (r.title) a.title = r.title;
      for (const al of r.aliases || []) if (!a.aliases.includes(al)) a.aliases.push(al);
    }
    for (const [slug, html] of Object.entries(L.appends)) {
      const a = by.get(slug); if (!a || !html) continue;
      // дополнение встаёт перед служебным указателем и «Появлениями», если они есть
      const cut = a.html.search(/<details class="lp-mentions"|<h2 id="poyavleniya">/);
      a.html = cut >= 0 ? a.html.slice(0, cut) + html + a.html.slice(cut) : a.html + html;
      a.toc = tocOf(a.html).length ? mergeToc(a.toc, tocOf(html), a.html) : a.toc;
      a.books = [...new Set([...(a.books || []), L.id])];
    }
    for (const [slug, links] of Object.entries(L.extraLinks)) {
      const a = by.get(slug); if (!a) continue;
      for (const t of links) {
        const b = by.get(t); if (!b || t === slug) continue;
        if (!a.links.includes(t)) a.links.push(t);
        if (!b.backlinks.includes(slug)) b.backlinks.push(slug);
      }
    }
    // главы новой книги — в общий порядок глав (после отдельных текстов)
    data.chapters = [...data.chapters, ...L.chapters.map((c) => c.slug).filter((s) => by.has(s) && !data.chapters.includes(s))];
    data.events = [...data.events, ...L.events.filter((e) => !data.events.some((x: any) => x.slug === e.slug))].sort((x: any, y: any) => x.title.localeCompare(y.title, "ru"));
    data.timeline = data.timeline.map((era: any) => ({ ...era, items: [...era.items, ...L.timeline.filter((t) => t.era === era.title).map((t) => ({ html: t.html, disputed: t.disputed }))] }));
  }
  // разделы, теги, граф, статистика — пересчёт по итоговому списку
  data.categories = data.categories.map((c: any) => ({ ...c, count: data.articles.filter((a: any) => a.cat === c.slug).length }));
  const tagMap = new Map<string, any>(data.tags.map((t: any) => [t.name, { ...t, slugs: [...t.slugs] }]));
  for (const a of data.articles) for (const t of a.tags) {
    if (!tagMap.has(t)) tagMap.set(t, { name: t, slug: translit(t), slugs: [] });
    const row = tagMap.get(t); if (!row.slugs.includes(a.slug)) row.slugs.push(a.slug);
  }
  data.tags = [...tagMap.values()];
  const idx = new Map<string, number>(data.articles.map((a: any, i: number) => [a.slug, i]));
  const old = new Map<string, any>((base.graph?.nodes || []).map((n: any) => [n.slug, n]));
  const edges: [number, number][] = []; const seen = new Set<string>();
  for (const a of data.articles) for (const t of a.links) {
    const i = idx.get(a.slug)!, j = idx.get(t); if (j == null || i === j) continue;
    const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (seen.has(k)) continue; seen.add(k); edges.push([i, j]);
  }
  const deg = new Array(data.articles.length).fill(0); edges.forEach(([i, j]) => { deg[i]++; deg[j]++; });
  const w = base.graph?.w || 1000, h = base.graph?.h || 700;
  data.graph = { w, h, edges, nodes: data.articles.map((a: any, i: number) => {
    const o = old.get(a.slug);
    if (o) return { ...o, title: a.title, deg: deg[i] };
    // новая точка — рядом с центром масс соседей
    const nb = a.links.concat(a.backlinks).map((s: string) => old.get(s)).filter(Boolean);
    const x = nb.length ? nb.reduce((s: number, n: any) => s + n.x, 0) / nb.length : w / 2;
    const y = nb.length ? nb.reduce((s: number, n: any) => s + n.y, 0) / nb.length : h / 2;
    const ang = (i * 2.399) % (Math.PI * 2);
    return { slug: a.slug, title: a.title, cat: a.cat, x: Math.round(x + Math.cos(ang) * 40), y: Math.round(y + Math.sin(ang) * 40), deg: deg[i] };
  }) };
  data.stats = { ...data.stats, articles: data.articles.length, links: data.articles.reduce((s: number, a: any) => s + a.links.length, 0) };
  if (Array.isArray(base.search)) {
    const rows = [...base.search];
    for (const a of data.articles) {
      const r = rows.find((x: any) => x.s === a.slug);
      if (r) { r.t = a.title; r.a = a.aliases; continue; }
      rows.push(searchRow(a));
    }
    data.search = rows;
  }
  return data as T;
}

function mergeToc(oldToc: any[], add: any[], html: string) {
  const ids = new Set(oldToc.map((t) => t.id));
  const merged = [...oldToc, ...add.filter((t) => !ids.has(t.id))];
  return merged.sort((a, b) => html.indexOf(`id="${a.id}"`) - html.indexOf(`id="${b.id}"`));
}

export function searchRow(a: any) {
  return { s: a.slug, t: a.title, a: a.aliases, g: a.tags, c: a.cat, st: a.status, e: a.excerpt, i: a.image?.thumb ?? null };
}

const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
export const translit = (s: string) => s.toLowerCase().split("").map((c) => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
