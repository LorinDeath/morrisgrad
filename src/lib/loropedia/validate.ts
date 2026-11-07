// Проверка корпуса и первого действия читателя. Совпадает с loropedia-contract.schema.json v1.
import {
  CONTRACT_VERSION, FORBIDDEN_GUESS_LABEL, HISTORIAN_GUESS_LABEL, ID_RE,
  type Corpus, type Issue, type ReaderAction, type SpoilerFrom, type Provenance,
} from "./contract";

const TOP_KEYS = ["contractVersion", "example", "notice", "books", "chapters", "parts", "fragments", "entities", "facts", "events", "relations", "evidence", "hypotheses", "derived", "images"];
const PREFIX: Record<string, string> = {
  books: "book", chapters: "chapter", parts: "part", fragments: "frag", entities: "ent",
  facts: "fact", events: "event", relations: "rel", evidence: "ev", hypotheses: "hyp",
  derived: "route", images: "img",
};
const MODES = new Set(["direct", "memory", "retelling", "unknown"]);
const STATUSES = new Set(["canon", "disputed", "ref"]);
const REL_KINDS = new Set(["knows", "artifact-path", "scene-comparison", "pair-scene", "other"]);
const DERIVED_KINDS = new Set(["route", "comparison", "dossier", "walk", "graph", "search-snippet", "count"]);
const STANCES = new Set(["for", "against", "gap"]);

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function extra(path: string, obj: Record<string, unknown>, allow: string[], issues: Issue[]) {
  for (const k of Object.keys(obj)) if (!allow.includes(k)) issues.push({ code: "unknown-field", path: `${path}.${k}`, message: `Лишнее поле ${k}` });
}

export function validateReaderAction(raw: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isObj(raw)) return [{ code: "not-object", path: "", message: "Действие читателя — объект" }];
  extra("", raw, ["bookId", "chapterNumber", "partNumber"], issues);
  if ("bookId" in raw && raw.bookId != null) {
    if (typeof raw.bookId !== "string" || !ID_RE.test(raw.bookId) || !raw.bookId.startsWith("book:")) {
      issues.push({ code: "bad-id", path: "bookId", message: "bookId — id книги" });
    }
  }
  for (const key of ["chapterNumber", "partNumber"] as const) {
    if (!(key in raw) || raw[key] == null) continue;
    if (typeof raw[key] !== "number" || !Number.isInteger(raw[key]) || (raw[key] as number) < 0) {
      issues.push({ code: "bad-number", path: key, message: `${key} — целое от 0 или null` });
    }
  }
  return issues;
}

export function validateCorpus(raw: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isObj(raw)) return [{ code: "not-object", path: "", message: "Корпус — объект" }];
  extra("", raw, TOP_KEYS, issues);
  if (raw.contractVersion !== CONTRACT_VERSION) issues.push({ code: "version", path: "contractVersion", message: `Нужна версия ${CONTRACT_VERSION}` });
  if (raw.example === true && (typeof raw.notice !== "string" || raw.notice.trim().length < 8)) {
    issues.push({ code: "example-notice", path: "notice", message: "Учебный корпус подписывается, что это не канон" });
  }
  for (const key of Object.keys(PREFIX)) {
    if (!Array.isArray(raw[key])) issues.push({ code: "not-array", path: key, message: `${key} — массив` });
  }
  if (issues.some((i) => i.code === "not-array" || i.code === "not-object")) return issues;

  const corpus = raw as unknown as Corpus;
  const ids = new Map<string, string>();
  const take = (bucket: string, id: unknown, path: string) => {
    if (typeof id !== "string" || !ID_RE.test(id) || !id.startsWith(PREFIX[bucket] + ":")) {
      issues.push({ code: "bad-id", path, message: `id с префиксом ${PREFIX[bucket]}:` });
      return;
    }
    if (ids.has(id)) issues.push({ code: "duplicate-id", path, message: `Повтор id ${id}` });
    ids.set(id, bucket);
  };

  corpus.books.forEach((b, i) => {
    const p = `books.${i}`;
    if (!isObj(b)) return issues.push({ code: "not-object", path: p, message: "книга" });
    extra(p, b as unknown as Record<string, unknown>, ["id", "title"], issues);
    take("books", b.id, `${p}.id`);
    if (typeof b.title !== "string" || !b.title.trim()) issues.push({ code: "empty", path: `${p}.title`, message: "Нужно название книги" });
  });
  corpus.parts.forEach((b, i) => {
    const p = `parts.${i}`;
    if (!isObj(b)) return issues.push({ code: "not-object", path: p, message: "часть" });
    extra(p, b as unknown as Record<string, unknown>, ["id", "bookId", "partNumber"], issues);
    take("parts", b.id, `${p}.id`);
    if (!Number.isInteger(b.partNumber) || b.partNumber < 1) issues.push({ code: "bad-number", path: `${p}.partNumber`, message: "Номер части — целое от 1" });
  });
  corpus.chapters.forEach((b, i) => {
    const p = `chapters.${i}`;
    if (!isObj(b)) return issues.push({ code: "not-object", path: p, message: "глава" });
    extra(p, b as unknown as Record<string, unknown>, ["id", "bookId", "chapterNumber", "partId"], issues);
    take("chapters", b.id, `${p}.id`);
    if ("partNumber" in (b as object)) issues.push({ code: "part-as-chapter", path: p, message: "У главы нет partNumber: часть задаётся отдельно" });
    if (!Number.isInteger(b.chapterNumber) || b.chapterNumber < 1) issues.push({ code: "bad-number", path: `${p}.chapterNumber`, message: "Номер главы — целое от 1" });
    if (b.partId != null && typeof b.partId !== "string") issues.push({ code: "bad-id", path: `${p}.partId`, message: "partId — id или null" });
  });

  const checkProv = (path: string, prov: Provenance | undefined) => {
    if (!prov || !MODES.has(prov.mode) || prov.truthClaim !== false) {
      issues.push({ code: "provenance", path, message: "provenance.mode известен, truthClaim только false" });
    }
  };
  const checkSpoil = (path: string, s: SpoilerFrom | undefined) => {
    if (!s || typeof s.bookId !== "string" || !Number.isInteger(s.chapterNumber) || s.chapterNumber < 0) {
      issues.push({ code: "spoiler", path, message: "spoilerFrom: книга и номер главы" });
      return;
    }
    if (!("partNumber" in s) || (s.partNumber != null && (!Number.isInteger(s.partNumber) || s.partNumber < 0))) {
      issues.push({ code: "spoiler", path: `${path}.partNumber`, message: "partNumber — число или null, это не номер главы" });
    }
  };

  corpus.fragments.forEach((f, i) => {
    const p = `fragments.${i}`;
    if (!isObj(f)) return issues.push({ code: "not-object", path: p, message: "фрагмент" });
    extra(p, f as unknown as Record<string, unknown>, ["id", "bookId", "chapterId", "partId", "quote", "locator", "spoilerFrom", "provenance"], issues);
    take("fragments", f.id, `${p}.id`);
    if (typeof f.quote !== "string" || !f.quote.trim()) issues.push({ code: "empty-quote", path: `${p}.quote`, message: "Нужна точная цитата" });
    if (typeof f.locator !== "string" || !f.locator.trim()) issues.push({ code: "empty", path: `${p}.locator`, message: "Нужен locator" });
    checkProv(`${p}.provenance`, f.provenance);
    checkSpoil(`${p}.spoilerFrom`, f.spoilerFrom);
  });

  const sourced = (bucket: string, rows: { id: string; sourceIds?: string[]; spoilerFrom?: SpoilerFrom; provenance?: Provenance; status?: string }[], allow: string[], iName: string) => {
    rows.forEach((row, i) => {
      const p = `${bucket}.${i}`;
      if (!isObj(row)) return issues.push({ code: "not-object", path: p, message: iName });
      extra(p, row as unknown as Record<string, unknown>, allow, issues);
      take(bucket, row.id, `${p}.id`);
      if (!Array.isArray(row.sourceIds) || row.sourceIds.length < 1) issues.push({ code: "missing-source", path: `${p}.sourceIds`, message: "Нужен хотя бы один источник" });
      checkProv(`${p}.provenance`, row.provenance);
      checkSpoil(`${p}.spoilerFrom`, row.spoilerFrom);
      if (row.status != null && !STATUSES.has(row.status)) issues.push({ code: "status", path: `${p}.status`, message: "status: canon, disputed или ref" });
    });
  };

  sourced("entities", corpus.entities, ["id", "name", "aliases", "tags", "infobox", "sourceIds", "spoilerFrom", "provenance", "status"], "сущность");
  corpus.entities.forEach((e, i) => {
    if (typeof e.name !== "string" || !e.name.trim()) issues.push({ code: "empty", path: `entities.${i}.name`, message: "Нужно имя" });
  });
  sourced("facts", corpus.facts, ["id", "text", "sourceIds", "spoilerFrom", "provenance", "status"], "факт");
  sourced("events", corpus.events, ["id", "text", "sourceIds", "spoilerFrom", "provenance", "status"], "событие");
  corpus.facts.concat(corpus.events).forEach((row, i) => {
    if (typeof row.text !== "string" || !row.text.trim()) issues.push({ code: "empty", path: `text.${i}`, message: "Нужен текст" });
  });
  sourced("relations", corpus.relations, ["id", "kind", "fromId", "toId", "label", "sourceIds", "spoilerFrom", "provenance", "status"], "связь");
  corpus.relations.forEach((r, i) => {
    if (!REL_KINDS.has(r.kind)) issues.push({ code: "kind", path: `relations.${i}.kind`, message: "Неизвестный kind связи" });
  });
  sourced("evidence", corpus.evidence, ["id", "stance", "text", "sourceIds", "spoilerFrom", "provenance", "status"], "свидетельство");
  corpus.evidence.forEach((e, i) => {
    if (!STANCES.has(e.stance)) issues.push({ code: "stance", path: `evidence.${i}.stance`, message: "stance: for, against или gap" });
  });
  sourced("hypotheses", corpus.hypotheses, ["id", "kind", "label", "claim", "hideable", "readerResult", "sourceIds", "spoilerFrom", "provenance", "status"], "гипотеза");
  corpus.hypotheses.forEach((h, i) => {
    const p = `hypotheses.${i}`;
    if (h.kind !== "historian-guess") issues.push({ code: "hypothesis-kind", path: `${p}.kind`, message: "В корпусе только предположение Историка" });
    if (h.label !== HISTORIAN_GUESS_LABEL) issues.push({ code: "hypothesis-label", path: `${p}.label`, message: `Метка ровно «${HISTORIAN_GUESS_LABEL}»` });
    if (String(h.label) === FORBIDDEN_GUESS_LABEL || (typeof h.claim === "string" && h.claim.includes(FORBIDDEN_GUESS_LABEL))) {
      issues.push({ code: "forbidden-label", path: p, message: "«Идея Алекса» не подменяет предположение Историка" });
    }
    if (h.hideable !== true || h.readerResult !== false) issues.push({ code: "hypothesis-role", path: p, message: "Гипотезу можно скрыть, и она не результат читателя" });
  });
  corpus.derived.forEach((d, i) => {
    const p = `derived.${i}`;
    if (!isObj(d)) return issues.push({ code: "not-object", path: p, message: "производное" });
    extra(p, d as unknown as Record<string, unknown>, ["id", "kind", "text", "optional", "sourceIds"], issues);
    take("derived", d.id, `${p}.id`);
    if (!DERIVED_KINDS.has(d.kind)) issues.push({ code: "kind", path: `${p}.kind`, message: "Неизвестный kind" });
    if (d.optional !== true) issues.push({ code: "route-required", path: `${p}.optional`, message: "Маршрут и прочие производные только необязательны" });
    if (!Array.isArray(d.sourceIds) || d.sourceIds.length < 1) issues.push({ code: "missing-source", path: `${p}.sourceIds`, message: "Производное указывает источники" });
  });
  corpus.images.forEach((im, i) => {
    const p = `images.${i}`;
    if (!isObj(im)) return issues.push({ code: "not-object", path: p, message: "изображение" });
    extra(p, im as unknown as Record<string, unknown>, ["id", "alt", "reconstruction", "generated", "sourceIds", "spoilerFrom", "provenance"], issues);
    take("images", im.id, `${p}.id`);
    if (im.generated !== false) issues.push({ code: "generated-image", path: `${p}.generated`, message: "Сгенерированный арт не принимается" });
    if (im.reconstruction === true && (typeof im.alt !== "string" || !im.alt.includes("реконструкция"))) {
      issues.push({ code: "reconstruction-label", path: `${p}.alt`, message: "Реконструкция помечается в подписи" });
    }
    if (!Array.isArray(im.sourceIds) || !im.sourceIds.length) issues.push({ code: "missing-source", path: `${p}.sourceIds`, message: "У арта есть источник" });
    checkProv(`${p}.provenance`, im.provenance);
    checkSpoil(`${p}.spoilerFrom`, im.spoilerFrom);
  });

  const bookIds = new Set(corpus.books.map((b) => b.id));
  const chapterById = new Map(corpus.chapters.map((c) => [c.id, c]));
  const partById = new Map(corpus.parts.map((c) => [c.id, c]));
  for (const c of corpus.chapters) {
    if (!bookIds.has(c.bookId)) issues.push({ code: "dangling", path: c.id, message: "Глава ссылается на неизвестную книгу" });
    if (c.partId != null && !partById.has(c.partId)) issues.push({ code: "dangling", path: c.id, message: "Глава ссылается на неизвестную часть" });
  }
  for (const c of corpus.parts) if (!bookIds.has(c.bookId)) issues.push({ code: "dangling", path: c.id, message: "Часть ссылается на неизвестную книгу" });
  for (const f of corpus.fragments) {
    const ch = chapterById.get(f.chapterId);
    if (!bookIds.has(f.bookId) || !ch || ch.bookId !== f.bookId) issues.push({ code: "dangling", path: f.id, message: "Фрагмент не сходится с книгой и главой" });
    if (f.partId != null && !partById.has(f.partId)) issues.push({ code: "dangling", path: f.id, message: "Фрагмент ссылается на неизвестную часть" });
    if (ch && f.spoilerFrom && f.spoilerFrom.chapterNumber < ch.chapterNumber) {
      issues.push({ code: "spoiler-before-source", path: f.id, message: "Цитату нельзя открыть раньше её главы" });
    }
    if (ch && f.spoilerFrom && f.spoilerFrom.bookId !== f.bookId) issues.push({ code: "spoiler-book", path: f.id, message: "spoilerFrom.bookId совпадает с книгой фрагмента" });
  }

  const reach = new Map<string, string[]>();
  const link = (id: string, sources: string[] | undefined) => { if (id && sources) reach.set(id, sources); };
  for (const row of [...corpus.entities, ...corpus.facts, ...corpus.events, ...corpus.relations, ...corpus.evidence, ...corpus.hypotheses, ...corpus.derived, ...corpus.images]) link(row.id, row.sourceIds);
  const seenFrag = (id: string, stack: string[]): boolean => {
    if (stack.includes(id)) return false;
    if (ids.get(id) === "fragments") return true;
    const next = reach.get(id);
    if (!next) return false;
    return next.every((n) => ids.has(n) && seenFrag(n, stack.concat(id)));
  };
  for (const [id, sources] of reach) {
    for (const s of sources) if (!ids.has(s)) issues.push({ code: "dangling", path: id, message: `Неизвестный источник ${s}` });
    if (sources.every((s) => ids.has(s)) && !seenFrag(id, [])) issues.push({ code: "missing-fragment", path: id, message: "Цепочка источников не доходит до цитаты" });
  }
  return issues;
}
