// Выбор слоя страницы. Расширенный текст не подставляется вместо закрытой статьи.
import rawExpanded from "../../data/loropedia/expanded.json";
import { LP, type LpArticle, type LpCategory, type LpData } from "../loropedia";
import { applyLayers } from "./layers";
import { PROTECT_COOKIE, SPOIL_COOKIE, protectionOn, spoilOn } from "./guard";

export type ExpandedData = LpData & {
  layer: "expanded-editorial";
  factMarkup: false;
  search: { s: string; t: string; a: string[]; g: string[]; c: string; st: string; e: string; i: string | null }[];
};

export const EXPANDED = applyLayers(rawExpanded as unknown as ExpandedData);

type Cookies = { get(name: string): { value: string } | undefined };

export function pageMode(cookies: Cookies): "closed" | "spoil" | "public" {
  if (protectionOn(cookies.get(PROTECT_COOKIE)?.value)) return "closed";
  if (spoilOn(cookies.get(SPOIL_COOKIE)?.value)) return "spoil";
  return "public";
}

export function bind(data: LpData) {
  const bySlug = new Map(data.articles.map((a) => [a.slug, a]));
  const catBy = new Map(data.categories.map((c) => [c.slug, c]));
  return {
    data,
    article: (slug: string) => bySlug.get(slug) || null,
    category: (slug: string) => catBy.get(slug) || null,
    inCategory: (slug: string) => data.articles.filter((a) => a.cat === slug),
    tagBySlug: (slug: string) => data.tags.find((t) => t.slug === slug) || null,
  };
}

export function corpus(mode: "closed" | "spoil" | "public"): LpData {
  return mode === "spoil" ? EXPANDED : LP;
}

export function knownSlug(slug: string): boolean {
  return LP.articles.some((a) => a.slug === slug) || EXPANDED.articles.some((a) => a.slug === slug);
}

export type ViewArticle = LpArticle;
export type ViewCategory = LpCategory;
