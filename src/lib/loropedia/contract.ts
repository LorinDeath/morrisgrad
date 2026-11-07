// Контракт Лоропедии v1. Нормативный файл — JSON Schema рядом с данными.
// Учебные фикстуры не подключаются к страницам.

export const CONTRACT_VERSION = "1.0.0";
export const HISTORIAN_GUESS_LABEL = "Предположения Историка — не канон";
export const FORBIDDEN_GUESS_LABEL = "Идея Алекса";
export const EXAMPLE_BANNER = "Учебный пример — не текст летописи.";

export const SURFACE_KEYS = [
  "title", "aliases", "body", "infobox", "excerpts", "links", "images", "alt",
  "search", "snippets", "tags", "counts", "chronology", "graph", "previews",
  "sourceTitles", "metadata",
] as const;

export const ID_RE = /^(book|chapter|part|frag|ent|fact|event|rel|ev|hyp|route|img):[a-z0-9]+(?:\.[a-z0-9]+)*$/;

export type Id = string;
export type CanonStatus = "canon" | "disputed" | "ref";
export type ProvenanceMode = "direct" | "memory" | "retelling" | "unknown";
export type Provenance = { mode: ProvenanceMode; truthClaim: false };
export type SpoilerFrom = { bookId: Id; chapterNumber: number; partNumber: number | null };

export type Book = { id: Id; title: string };
export type Chapter = { id: Id; bookId: Id; chapterNumber: number; partId: Id | null };
export type Part = { id: Id; bookId: Id; partNumber: number };
export type Fragment = {
  id: Id; bookId: Id; chapterId: Id; partId: Id | null;
  quote: string; locator: string; spoilerFrom: SpoilerFrom; provenance: Provenance;
};
export type InfoboxRow = { label: string; text: string };
export type Entity = {
  id: Id; name: string; aliases: string[]; tags: string[]; infobox: InfoboxRow[];
  sourceIds: Id[]; spoilerFrom: SpoilerFrom; provenance: Provenance; status: CanonStatus;
};
export type Fact = {
  id: Id; text: string; sourceIds: Id[]; spoilerFrom: SpoilerFrom; provenance: Provenance; status: CanonStatus;
};
export type LoreEvent = Fact;
export type Relation = Fact & {
  kind: "knows" | "artifact-path" | "scene-comparison" | "pair-scene" | "other";
  fromId: Id; toId: Id; label: string;
};
export type Evidence = Fact & { stance: "for" | "against" | "gap" };
export type Hypothesis = {
  id: Id; kind: "historian-guess"; label: typeof HISTORIAN_GUESS_LABEL; claim: string;
  hideable: true; readerResult: false; sourceIds: Id[]; spoilerFrom: SpoilerFrom;
  provenance: Provenance; status: CanonStatus;
};
export type Derived = {
  id: Id; kind: "route" | "comparison" | "dossier" | "walk" | "graph" | "search-snippet" | "count";
  text: string; optional: true; sourceIds: Id[];
};
export type LoreImage = {
  id: Id; alt: string; reconstruction: boolean; generated: false;
  sourceIds: Id[]; spoilerFrom: SpoilerFrom; provenance: Provenance;
};

export type Corpus = {
  contractVersion: typeof CONTRACT_VERSION;
  example?: boolean;
  notice?: string;
  books: Book[];
  chapters: Chapter[];
  parts: Part[];
  fragments: Fragment[];
  entities: Entity[];
  facts: Fact[];
  events: LoreEvent[];
  relations: Relation[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  derived: Derived[];
  images: LoreImage[];
};

export type ReaderAction = {
  bookId?: Id;
  chapterNumber?: number | null;
  partNumber?: number | null;
};

export type Issue = { code: string; path: string; message: string };
