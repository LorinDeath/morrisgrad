// Контракт Лоропедии и защита от спойлеров. Запуск: bun tools/tests/loropedia-contract-test.ts
import { readFileSync } from "node:fs";
import schema from "../../src/data/loropedia/contract/loropedia-contract.schema.json";
import fields from "../../src/data/loropedia/contract/fields.json";
import coverage from "../../src/data/loropedia/contract/coverage.json";
import example from "../../src/data/loropedia/contract/fixtures/example-corpus.json";
import rawData from "../../src/data/loropedia/data.json";
import { CONTRACT_VERSION, FORBIDDEN_GUESS_LABEL, HISTORIAN_GUESS_LABEL, SURFACE_KEYS, type Corpus } from "../../src/lib/loropedia/contract";
import { validateCorpus, validateReaderAction } from "../../src/lib/loropedia/validate";
import { addNote, applyAction, emptyState, exportForServer, loadState, reviseNote, setCursor, type ReaderState } from "../../src/lib/loropedia/progress";
import { buildShare, importShare, project, projectById, projectLegacy, renderView, searchView } from "../../src/lib/loropedia/project";
import { READER_BOOKS } from "../../src/lib/loropedia/guard";

let fails = 0, passes = 0;
const ok = (c: unknown, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };
const corpus = example as unknown as Corpus;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const at = (chapter: number | null, part: number | null, extra: Partial<ReaderState> = {}): ReaderState => ({
  ...emptyState(),
  protection: true,
  ...extra,
  books: chapter == null && part == null && !extra.books ? {} : { "book:example": { chapterNumber: chapter, partNumber: part }, ...(extra.books || {}) },
});

ok(schema["x-contractVersion"] === CONTRACT_VERSION && example.contractVersion === CONTRACT_VERSION, "версия контракта 1.0.0");
ok(JSON.stringify(schema["x-surfaces"]) === JSON.stringify(SURFACE_KEYS), "схема и проектор перечисляют одни и те же поверхности");
ok(schema["x-historianGuessLabel"] === HISTORIAN_GUESS_LABEL && fields.records.some((r) => r.record === "hypothesis" && r.note.includes(HISTORIAN_GUESS_LABEL)), "метка предположения Историка");
ok((schema["x-forbiddenGuessLabels"] as string[]).includes(FORBIDDEN_GUESS_LABEL), "Идея Алекса не является меткой гипотезы");
ok(schema["x-ux"].lockedSteps === false && schema["x-ux"].tutorial === "none" && schema["x-ux"].routes === "optional" && schema["x-ux"].hints === "on-request-only" && schema["x-ux"].fieldsRequiredBeforeFirstAction.length === 0 && schema["x-ux"].spoilerFilterOnFreeNavigation === true && schema["x-ux"].authorSpeculationIsNotReaderResult === true, "UX: свободный вход, без туториала и обязательного вывода");
ok(example.notice.includes("не канон") && example.example === true, "фикстура явно учебная");
ok(example.chapters[1].chapterNumber === 2 && example.parts[0].partNumber === 1 && example.chapters[1].partId === "part:example.1", "номер главы 2 и номер части 1 не смешаны");
ok(validateCorpus(example).length === 0, "учебный корпус проходит проверку: " + JSON.stringify(validateCorpus(example)));
ok(validateCorpus({ ...example, books: [], chapters: [], parts: [], fragments: [], entities: [], facts: [], events: [], relations: [], evidence: [], hypotheses: [], derived: [], images: [], example: false }).length === 0, "пустой корпус допустим");
ok(validateReaderAction({}).length === 0 && validateReaderAction({ bookId: "book:example" }).length === 0, "первое действие не требует полей");
ok(codes(validateReaderAction({ bookId: "book:example", mood: "sure" } as never)).includes("unknown-field"), "лишнее поле действия отвергается");

const noQuote = structuredClone(example);
noQuote.fragments[0].quote = " ";
ok(codes(validateCorpus(noQuote)).includes("empty-quote"), "без точной цитаты нельзя");
const truth = structuredClone(example);
(truth.facts[0].provenance as { truthClaim: boolean }).truthClaim = true;
ok(codes(validateCorpus(truth)).includes("provenance"), "truthClaim true отвергается");
const wrongLabel = structuredClone(example);
wrongLabel.hypotheses[0].label = FORBIDDEN_GUESS_LABEL as typeof wrongLabel.hypotheses[0]["label"];
ok(codes(validateCorpus(wrongLabel)).includes("hypothesis-label"), "чужая метка гипотезы отвергается");
const forcedRoute = structuredClone(example);
(forcedRoute.derived[0] as { optional: boolean }).optional = false;
ok(codes(validateCorpus(forcedRoute)).includes("route-required"), "обязательный маршрут отвергается");
const generated = structuredClone(example);
(generated.images[0] as { generated: boolean }).generated = true;
ok(codes(validateCorpus(generated)).includes("generated-image"), "сгенерированный арт отвергается");
const earlyQuote = structuredClone(example);
earlyQuote.fragments[1].spoilerFrom = { bookId: "book:example", chapterNumber: 1, partNumber: 1 };
ok(codes(validateCorpus(earlyQuote)).includes("spoiler-before-source"), "цитату главы 2 нельзя открыть на главе 1");
const mixed = structuredClone(example) as unknown as { chapters: Record<string, unknown>[] };
mixed.chapters[0] = { ...example.chapters[0], partNumber: 9 };
ok(codes(validateCorpus(mixed)).includes("unknown-field"), "номер части не записывается в главу");

const none = at(null, null);
const early = at(1, 1);
const late = at(2, 1);
const chapterOnly = at(2, null);
const otherBook = at(null, null, { books: { "book:kill": { chapterNumber: 9, partNumber: 9 } } });
const secrets = ["LATESECRET", "LATENAME", "LATEALIAS", "LATEBOX", "LATEFACT", "LATEEVENT", "LATEREL", "LATEAGAINST", "LATEGAP", "LATEALT", "LATEROUTE", "late-tag"];
const dumped = (state: ReaderState) => JSON.stringify(project(corpus, state)) + "\n" + renderView(project(corpus, state));

ok(secrets.every((s) => !dumped(none).includes(s)) && !dumped(early).includes("LATEFACT") && dumped(early).includes("EARLYQUOTE") && dumped(early).includes("Ранний учебный факт"), "без курсора и после главы 1 поздний текст закрыт, ранний открыт");
ok(dumped(late).includes("LATEFACT") && dumped(late).includes("LATESECRET") && !dumped(chapterOnly).includes("LATEFACT"), "глава 2 открывает позднее только вместе с частью 1");
ok(!dumped(otherBook).includes("LATEFACT"), "прогресс другой книги не открывает эту");
ok(project(corpus, early).counts.facts === 1 && project(corpus, late).counts.facts === 2 && !("closed" in project(corpus, early).counts), "счётчик считает только открытые факты");
ok(!dumped(late).includes("LATEGAP"), "unknown provenance остаётся закрытым даже после курсора");
ok(project(corpus, early).readerConclusion.length === 0 && dumped(early).includes(HISTORIAN_GUESS_LABEL) && dumped(early).includes("GUESSCLAIM"), "гипотеза не попадает в вывод читателя");
const hidden = project(corpus, { ...early, hideHistorianHypotheses: true });
ok(hidden.hypotheses.length === 0 && !renderView(hidden).includes("GUESSCLAIM"), "гипотезу Историка можно скрыть");
ok(projectById(corpus, early, "fact:example.late").open === false && projectById(corpus, early, "fact:example.late").text === "" && projectById(corpus, early, "route:example.late").text === "", "свободный переход к позднему факту и маршруту ничего не показывает");
ok(searchView(project(corpus, early), "latesecret").length === 0 && searchView(project(corpus, late), "latesecret").length === 1, "поиск не возвращает закрытую выдержку");
ok(!renderView(project(corpus, early)).includes("LATEALT") && renderView(project(corpus, early)).includes("EARLYALT"), "alt закрытой картинки не попадает в DOM");
ok(renderView(project(corpus, late)).includes("реконструкция") && !renderView(project(corpus, late)).includes("установлен"), "реконструкция помечена, истина не присвоена");
const lowered = setCursor(late, "book:example", { chapterNumber: 1, partNumber: 1 });
ok(!dumped(lowered).includes("LATEFACT") && lowered.books["book:example"].chapterNumber === 1, "понижение прогресса снова закрывает позднее");

const noted = addNote(early, { id: "n1", bookId: "book:example", chapterNumber: 1, text: "NOTESECRET", createdAt: "2026-11-07T00:00:00Z" });
const revised = reviseNote(noted, "n1", "NEWNOTE", "2026-11-07T01:00:00Z");
ok(revised.notes[0].text === "NOTESECRET" && revised.notes[1].revisedFrom === "n1" && revised.notes[1].text === "NEWNOTE", "старая заметка не переписывается");
const share = buildShare(project(corpus, noted));
ok(!JSON.stringify(share).includes("NOTESECRET") && !JSON.stringify(exportForServer(noted)).includes("NOTESECRET") && exportForServer(noted).protection === true && !("books" in exportForServer(noted)), "заметки и курсор не уходят на сервер и в ссылку");
const poisoned = importShare(corpus, early, { v: 1, kind: "projection", items: [{ id: "fact:example.early", text: "POISON" }, { id: "fact:example.late", text: "LATEFACT" }, { id: "n1", text: "NOTESECRET" }] });
ok(poisoned.state === early && poisoned.html.includes("Ранний учебный факт") && !poisoned.html.includes("POISON") && !poisoned.html.includes("LATEFACT") && !poisoned.html.includes("NOTESECRET"), "импорт ссылки не повышает доступ и не подменяет текст");
ok(applyAction(emptyState(), {}).books && Object.keys(applyAction(emptyState(), { bookId: "book:example" }).books["book:example"] ? applyAction(emptyState(), { bookId: "book:example" }).books : {}).length === 1 && project(corpus, { ...emptyState(), protection: true, books: applyAction(emptyState(), { bookId: "book:example" }).books }).counts.facts === 0, "одна книга без номера главы ничего не открывает");

const legacy = projectLegacy({ slug: "x", title: "SECRETITLE", html: "<p>SECRETHTML</p>", excerpt: "SECRETEXCERPT", aliases: ["SECRETALIAS"], imageAlt: "SECRETALT" }, emptyState());
const legacyClosed = projectLegacy({ slug: "x", title: "SECRETITLE", html: "<p>SECRETHTML</p>", excerpt: "SECRETEXCERPT", aliases: ["SECRETALIAS"], imageAlt: "SECRETALT" }, { ...emptyState(), protection: true });
ok(legacy.open && legacy.html.includes("SECRETHTML") && !legacyClosed.open && legacyClosed.html === "", "сырой HTML без provenance в защите пустой, в открытом архиве прежний");
ok(!renderView(project(corpus, early)).includes("</script") && renderView(project({ ...corpus, facts: corpus.facts.map((f) => f.id === "fact:example.early" ? { ...f, text: "</script><script>alert(1)</script>" } : f) }, early)).includes("&lt;/script&gt;"), "проекция экранирует HTML");

ok(coverage.status === "blocked-no-provenance" && coverage.annotatedFacts === 0 && coverage.liveArticles === (rawData as { stats: { articles: number } }).stats.articles && coverage.surfaces.length === SURFACE_KEYS.length, "покрытие 161 статей закрыто: разметки фактов нет");
ok(new Set(READER_BOOKS.map((b) => b.id)).size === 3 && READER_BOOKS.every((b) => b.id.startsWith("book:")), "три книги ведут отдельный прогресс");

const pages = [
  "src/pages/loropedia/index.astro",
  "src/pages/loropedia/[slug].astro",
  "src/pages/loropedia/poisk.astro",
  "src/pages/loropedia/karta.astro",
  "src/pages/loropedia/galereya.astro",
  "src/pages/loropedia/c/[cat].astro",
  "src/pages/loropedia/tag/[tag].astro",
];
for (const p of pages) {
  const src = readFileSync(new URL("../../" + p, import.meta.url), "utf8");
  ok(src.includes("protectionOn") && src.includes("LpClosed") && src.includes("noindex"), p + " закрывает сырой текст");
}
const search = readFileSync(new URL("../../src/pages/loropedia/poisk.astro", import.meta.url), "utf8");
ok(search.indexOf("search.json") > search.indexOf("LpClosed") && search.includes("data-lp-protect"), "поиск сырого индекса не в защищённой ветке и проверяет признак");
ok(loadState("{\"v\":1,\"protection\":false,\"hideHistorianHypotheses\":false,\"books\":{},\"notes\":[{\"id\":\"n\",\"bookId\":\"book:example\",\"text\":\"LOCAL\"}]}").notes[0].text === "LOCAL", "заметка читается только из локальной строки");

console.log(`loropedia contract: ${passes} ok, ${fails} fail`);
if (fails) process.exit(1);
