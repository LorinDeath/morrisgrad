// Лоропедия: данные собираются заранее скриптом tools/loropedia/import.mjs из Obsidian-летописи
// и лежат в src/data/loropedia/data.json. Во время запроса — только чтение этого файла (без БД и игрового сервера).
import raw from "../data/loropedia/data.json";

export interface LpImage { id: string; w: number; h: number; src: string; thumb: string; srcset: string; jpg: string; caption?: string; notes?: { slug: string; title: string; caption?: string }[] }
export interface LpArticle {
  slug: string; title: string; cat: string; type: string; status: "canon" | "idea" | "disputed" | "ref";
  statusLabel: string; statusIcon: string; invented: boolean; aliases: string[]; tags: string[];
  fields: { label: string; html: string }[]; image: LpImage | null; gallery: LpImage[]; html: string;
  toc: { id: string; text: string; level: number }[]; excerpt: string; links: string[]; backlinks: string[];
  clan: string; role: string; when: string; order: number | null; redacted: boolean;
}
export interface LpCategory { folder: string; slug: string; icon: string; desc: string; name: string; count: number }
interface LpData {
  generatedAt: string; stats: { articles: number; images: number; links: number };
  categories: LpCategory[]; tags: { name: string; slug: string; slugs: string[] }[];
  clans: { name: string; slug: string | null; slugs: string[] }[]; chapters: string[];
  timeline: { title: string; items: { html: string; disputed: boolean }[] }[];
  events: { slug: string; title: string; when: string; status: string; statusLabel: string }[];
  graph: { w: number; h: number; nodes: { slug: string; title: string; cat: string; x: number; y: number; deg: number }[]; edges: [number, number][] };
  images: LpImage[]; articles: LpArticle[];
}
export const LP = raw as unknown as LpData;
export const LP_BASE = "/loropedia";

const bySlug = new Map(LP.articles.map((a) => [a.slug, a]));
const catBySlug = new Map(LP.categories.map((c) => [c.slug, c]));
export const article = (slug: string) => bySlug.get(slug) || null;
export const category = (slug: string) => catBySlug.get(slug) || null;
export const inCategory = (slug: string) => LP.articles.filter((a) => a.cat === slug);
export const tagBySlug = (slug: string) => LP.tags.find((t) => t.slug === slug) || null;
export const href = (slug: string) => `${LP_BASE}/${slug}`;

/** Цвета категорий (карта связей, акценты карточек) — в палитре сайта. */
export const CAT_COLORS: Record<string, string> = {
  personazhi: "#d4b483", klany: "#e11d48", lokatsii: "#5eead4", predmety: "#f59e0b", magiya: "#c084fc",
  sobytiya: "#fb7185", glavy: "#93c5fd", "khronologiya-razdel": "#a3e635", yazyk: "#fcd34d", spravka: "#a89a92",
};

/** Все публичные адреса Лоропедии — для sitemap. */
export function loropediaPaths(): { path: string; priority: number }[] {
  return [
    { path: LP_BASE, priority: 0.8 },
    ...["poisk", "karta", "galereya"].map((p) => ({ path: `${LP_BASE}/${p}`, priority: 0.5 })),
    ...LP.categories.map((c) => ({ path: `${LP_BASE}/c/${c.slug}`, priority: 0.6 })),
    ...LP.tags.map((t) => ({ path: `${LP_BASE}/tag/${t.slug}`, priority: 0.3 })),
    ...LP.articles.map((a) => ({ path: `${LP_BASE}/${a.slug}`, priority: a.status === "canon" ? 0.6 : 0.4 })),
  ];
}
