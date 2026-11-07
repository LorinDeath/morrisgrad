// Проекция корпуса на курсор читателя. Закрытое не попадает в текст, DOM, поиск и счётчики.
import {
  EXAMPLE_BANNER, HISTORIAN_GUESS_LABEL,
  type Corpus, type ProvenanceMode, type SpoilerFrom,
} from "./contract";
import type { ReaderState } from "./progress";

export type OpenFact = { id: string; text: string; provenance: string; status: string };
export type View = {
  protection: boolean;
  exampleBanner: string | null;
  readerConclusion: string[];
  titles: { id: string; text: string }[];
  aliases: { id: string; alias: string }[];
  bodies: { id: string; text: string }[];
  infobox: { id: string; label: string; text: string }[];
  excerpts: { id: string; text: string }[];
  links: { id: string; text: string }[];
  images: { id: string; alt: string; reconstruction: boolean }[];
  alt: { id: string; text: string }[];
  search: { id: string; title: string; snippet: string }[];
  snippets: { id: string; text: string }[];
  tags: string[];
  counts: { facts: number; events: number; entities: number; images: number };
  chronology: { id: string; text: string }[];
  graph: { id: string; label: string }[];
  previews: { id: string; text: string }[];
  sourceTitles: { id: string; title: string }[];
  metadata: { id: string; key: string; value: string }[];
  hypotheses: { id: string; label: string; claim: string }[];
  evidence: { id: string; stance: string; text: string }[];
  derived: { id: string; text: string }[];
};

const PROV: Record<ProvenanceMode, string> = {
  direct: "непосредственное",
  memory: "память",
  retelling: "пересказ",
  unknown: "происхождение не указано",
};

type Gate = { spoilerFrom?: SpoilerFrom; provenance?: { mode: ProvenanceMode; truthClaim: boolean }; sourceIds?: string[] };

function cursorAllows(state: ReaderState, gate: SpoilerFrom): boolean {
  const cur = state.books[gate.bookId];
  if (!cur || cur.chapterNumber == null) return false;
  if (cur.chapterNumber < gate.chapterNumber) return false;
  if (gate.partNumber != null && (cur.partNumber == null || cur.partNumber < gate.partNumber)) return false;
  return true;
}

/** Закрыто, если пометка неизвестна, курсор не дошёл или закрыт любой источник. */
export function isOpen(corpus: Corpus, state: ReaderState, id: string, stack: string[] = []): boolean {
  if (!state.protection) return true;
  if (stack.includes(id)) return false;
  const row = find(corpus, id);
  if (!row) return false;
  if (row.kind === "book" || row.kind === "chapter" || row.kind === "part") {
    return false;
  }
  const g = row.item as Gate & { kind?: string; hideable?: boolean };
  if (row.kind === "hypothesis" && state.hideHistorianHypotheses) return false;
  if (!g.provenance || g.provenance.mode === "unknown" || g.provenance.truthClaim !== false) return false;
  if (!g.spoilerFrom && row.kind !== "derived") return false;
  const sources = g.sourceIds || [];
  if (sources.some((s) => !isOpen(corpus, state, s, stack.concat(id)))) return false;
  if (row.kind === "derived") return sources.length > 0;
  return cursorAllows(state, g.spoilerFrom as SpoilerFrom);
}

type Found = { kind: string; item: Record<string, unknown> };

function find(corpus: Corpus, id: string): Found | null {
  const buckets: [string, { id: string }[]][] = [
    ["book", corpus.books], ["chapter", corpus.chapters], ["part", corpus.parts],
    ["fragment", corpus.fragments], ["entity", corpus.entities], ["fact", corpus.facts],
    ["event", corpus.events], ["relation", corpus.relations], ["evidence", corpus.evidence],
    ["hypothesis", corpus.hypotheses], ["derived", corpus.derived], ["image", corpus.images],
  ];
  for (const [kind, rows] of buckets) {
    const item = rows.find((r) => r.id === id);
    if (item) return { kind, item: item as unknown as Record<string, unknown> };
  }
  return null;
}

function provLabel(mode: ProvenanceMode): string {
  return PROV[mode] || PROV.unknown;
}

export function project(corpus: Corpus, state: ReaderState): View {
  const open = (id: string) => !state.protection || isOpen(corpus, state, id);
  const books = new Map(corpus.books.map((b) => [b.id, b]));
  const view: View = {
    protection: state.protection,
    exampleBanner: corpus.example ? EXAMPLE_BANNER : null,
    readerConclusion: [],
    titles: [], aliases: [], bodies: [], infobox: [], excerpts: [], links: [],
    images: [], alt: [], search: [], snippets: [], tags: [],
    counts: { facts: 0, events: 0, entities: 0, images: 0 },
    chronology: [], graph: [], previews: [], sourceTitles: [], metadata: [],
    hypotheses: [], evidence: [], derived: [],
  };
  if (!state.protection) {
    // Открытый архив размеченного корпуса: фильтр выключен, но истина по-прежнему не присваивается.
  }
  for (const e of corpus.entities) if (open(e.id)) {
    view.titles.push({ id: e.id, text: e.name });
    for (const a of e.aliases) view.aliases.push({ id: e.id, alias: a });
    for (const t of e.tags) view.tags.push(t);
    for (const row of e.infobox) view.infobox.push({ id: e.id, label: row.label, text: row.text });
    view.counts.entities++;
  }
  for (const f of corpus.facts) if (open(f.id)) {
    const text = `${f.text} (${provLabel(f.provenance.mode)})`;
    view.bodies.push({ id: f.id, text });
    view.excerpts.push({ id: f.id, text: f.text });
    view.snippets.push({ id: f.id, text: f.text });
    view.previews.push({ id: f.id, text: f.text });
    view.search.push({ id: f.id, title: f.id, snippet: f.text });
    view.counts.facts++;
  }
  for (const ev of corpus.events) if (open(ev.id)) {
    view.chronology.push({ id: ev.id, text: `${ev.text} (${provLabel(ev.provenance.mode)})` });
    view.counts.events++;
  }
  for (const r of corpus.relations) if (open(r.id) && open(r.fromId) && open(r.toId)) {
    view.graph.push({ id: r.id, label: r.label });
    view.links.push({ id: r.id, text: r.label });
  }
  for (const ev of corpus.evidence) if (open(ev.id)) view.evidence.push({ id: ev.id, stance: ev.stance, text: ev.text });
  for (const h of corpus.hypotheses) if (open(h.id)) {
    view.hypotheses.push({ id: h.id, label: HISTORIAN_GUESS_LABEL, claim: h.claim });
  }
  for (const d of corpus.derived) if (open(d.id)) view.derived.push({ id: d.id, text: d.text });
  for (const im of corpus.images) if (open(im.id)) {
    const alt = im.reconstruction && !im.alt.includes("реконструкция") ? `${im.alt} реконструкция` : im.alt;
    view.images.push({ id: im.id, alt, reconstruction: im.reconstruction });
    view.alt.push({ id: im.id, text: alt });
    view.counts.images++;
  }
  for (const fr of corpus.fragments) if (open(fr.id)) {
    const book = books.get(fr.bookId);
    if (book && state.protection) view.sourceTitles.push({ id: fr.id, title: book.title });
    if (!state.protection) view.sourceTitles.push({ id: fr.id, title: book?.title || fr.bookId });
    view.metadata.push({ id: fr.id, key: "locator", value: fr.locator });
    view.metadata.push({ id: fr.id, key: "quote", value: fr.quote });
    view.search.push({ id: fr.id, title: book?.title || fr.bookId, snippet: fr.quote });
    view.snippets.push({ id: fr.id, text: fr.quote });
  }
  return view;
}

export function projectById(corpus: Corpus, state: ReaderState, id: string): { open: boolean; text: string } {
  if (state.protection && !isOpen(corpus, state, id)) return { open: false, text: "" };
  const row = find(corpus, id);
  if (!row) return { open: false, text: "" };
  const item = row.item;
  const text = String(item.text || item.claim || item.quote || item.name || item.label || item.alt || item.title || "");
  return { open: true, text };
}

export function searchView(view: View, query: string): View["search"] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return view.search.filter((s) => s.snippet.toLowerCase().includes(q) || s.title.toLowerCase().includes(q));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** HTML только из открытых полей. Закрытые id и тексты сюда не входят. */
export function renderView(view: View): string {
  const lines = [
    view.exampleBanner || "",
    ...view.titles.map((t) => t.text),
    ...view.aliases.map((a) => a.alias),
    ...view.bodies.map((b) => b.text),
    ...view.infobox.map((r) => `${r.label} ${r.text}`),
    ...view.excerpts.map((e) => e.text),
    ...view.links.map((l) => l.text),
    ...view.alt.map((a) => a.text),
    ...view.snippets.map((s) => s.text),
    ...view.tags,
    ...view.chronology.map((c) => c.text),
    ...view.graph.map((g) => g.label),
    ...view.previews.map((p) => p.text),
    ...view.sourceTitles.map((s) => s.title),
    ...view.metadata.map((m) => `${m.key} ${m.value}`),
    ...view.hypotheses.map((h) => `${h.label} ${h.claim}`),
    ...view.evidence.map((e) => e.text),
    ...view.derived.map((d) => d.text),
    ...view.readerConclusion,
  ];
  return lines.filter(Boolean).map(esc).join("\n");
}

export type SharePayload = { v: 1; kind: "projection"; items: { id: string; text: string }[] };

export function buildShare(view: View): SharePayload {
  const items = [
    ...view.bodies.map((b) => ({ id: b.id, text: b.text })),
    ...view.titles.map((t) => ({ id: t.id, text: t.text })),
  ];
  return { v: 1, kind: "projection", items };
}

/** Импорт не меняет прогресс. Текст берётся заново из проекции, не из чужой ссылки. */
export function importShare(corpus: Corpus, state: ReaderState, payload: SharePayload): { state: ReaderState; html: string } {
  const view = project(corpus, state);
  const allowed = new Map<string, string>();
  for (const row of view.bodies) allowed.set(row.id, row.text);
  for (const row of view.titles) allowed.set(row.id, row.text);
  const html = payload.items.filter((item) => allowed.has(item.id)).map((item) => esc(allowed.get(item.id) || "")).join("\n");
  return { state, html };
}

export type LegacyArticle = { slug: string; title: string; html: string; excerpt: string; aliases: string[]; imageAlt: string };

/** Старый HTML без provenance в защите не показывается. При выключенной защите архив прежний. */
export function projectLegacy(article: LegacyArticle, state: ReaderState): { open: boolean; html: string } {
  if (!state.protection) {
    return { open: true, html: `${article.title}\n${article.aliases.join(" ")}\n${article.excerpt}\n${article.html}\n${article.imageAlt}` };
  }
  return { open: false, html: "" };
}
