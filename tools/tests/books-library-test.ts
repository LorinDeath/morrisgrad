// Библиотека: пять книг, обложки из FB2, «Начало» и «Страж» не тома «Ледяного клинка».
// Запуск: npx tsx tools/tests/books-library-test.ts
import { readFileSync } from "node:fs";
import { parseFB2 } from "../../src/utils/fb2-parse";

let fails = 0, passes = 0;
const ok = (c: unknown, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");

const fb2 = read("src/utils/fb2.ts");
for (const id of ["obitel-smerti", "pravednye-koty", "kill", "nachalo", "strazh-pyatogo-poryadka"]) {
  ok(fb2.includes(`id: '${id}'`), "BOOK_CONFIGS: " + id);
}
ok(fb2.includes("nachalo.fb2?raw") && fb2.includes("strazh_pyatogo_poryadka.fb2?raw"), "сырые импорты новых FB2");
const order = ["obitel-smerti", "pravednye-koty", "kill", "nachalo", "strazh-pyatogo-poryadka"];
ok(order.every((id, i) => i === 0 || fb2.indexOf(`id: '${order[i - 1]}'`) < fb2.indexOf(`id: '${id}'`)), "порядок: три тома Ледяного клинка, затем Начало и Страж");

const page = read("src/pages/books.astro");
ok(page.includes("byId('nachalo')") && page.includes("byId('strazh-pyatogo-poryadka')"), "страница берёт новые книги по id");
ok(page.includes("byId('obitel-smerti')") && page.includes("'pravednye-koty'") && page.includes("'kill'"), "три тома Ледяного клинка на месте");
ok(!page.includes("allBooks.slice") && !page.includes("leadBook"), "новые книги не становятся следующими томами одного списка");
ok(page.includes("Чёрная корона") && page.includes("Дарг Сирром") && page.includes("Ледяной клинок"), "шапка называет три цикла");
ok(page.includes('Продолжение цикла: «Ледяной клинок»') && page.includes("ТОМ {idx + 2}"), "блок Ледяного клинка: Обитель и тома 2–3");
ok(page.includes("data-book-id={nachalo.id}") && page.includes("data-book-id={strazh.id}") && page.includes("data-book-mode=\"toc\""), "кнопки чтения и оглавления у новых книг");
ok(page.includes("<BookReader books={allBooks} />"), "ридер получает все книги");
const visible = page.split("---").slice(2).join("---");
ok(!/Pixel Art Atlas|Hugging Face|(^|[^A-Za-z])Krea([^A-Za-z]|$)|сюрприз/i.test(visible), "служебные пометки не попадают в текст библиотеки");

const api = read("src/pages/api/book.ts");
ok(api.includes("getBookById") && api.includes("getAllBooks"), "API отдаёт книгу по id и весь список");

function jpeg(rel: string) {
  const buf = readFileSync(new URL(rel, root));
  return buf.length > 10000 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
}
ok(jpeg("public/images/books/covers/nachalo.jpg"), "обложка Начала — jpeg");
ok(jpeg("public/images/books/covers/strazh-pyatogo-poryadka.jpg"), "обложка Стража — jpeg");

const nachalo = parseFB2(read("src/pages/_books/nachalo.fb2"), "nachalo", "nachalo.fb2");
ok(nachalo.title === "Начало", "название Начала");
ok(nachalo.author.includes("Lorin Death") && nachalo.author.includes("Alex Seylor"), "два автора Начала: " + nachalo.author);
ok(nachalo.series.includes("Чёрная Корона") && nachalo.seriesNumber === "1", "серия Чёрная Корона: " + nachalo.series);
ok(nachalo.coverImage === "/images/books/covers/nachalo.jpg", "путь обложки Начала");
ok(nachalo.chapters.length >= 60 && /Пролог/.test(nachalo.chapters[0].title), "оглавление Начала, глав: " + nachalo.chapters.length + ", первая: " + nachalo.chapters[0].title);
ok(nachalo.chapters[0].paragraphs.some((p) => p.includes("Велес")), "первая глава Начала читается");

const strazh = parseFB2(read("src/pages/_books/strazh_pyatogo_poryadka.fb2"), "strazh-pyatogo-poryadka", "strazh_pyatogo_poryadka.fb2");
ok(strazh.title === "Страж пятого порядка", "название Стража");
ok(strazh.series === "Дарг Сирром" && strazh.seriesNumber === "1", "серия Дарг Сирром");
ok(strazh.coverImage === "/images/books/covers/strazh-pyatogo-poryadka.jpg", "путь обложки Стража");
ok(strazh.chapters.length >= 1 && strazh.chapters[0].title.includes("Глава первая"), "оглавление Стража: " + strazh.chapters[0]?.title);
ok(strazh.chapters[0].paragraphs.some((p) => p.includes("Умирать")), "глава Стража читается");
ok(page.includes("preview(strazh.annotation"), "карточка Стража показывает очищенный текст аннотации");

const obitel = parseFB2(read("src/pages/_books/letopis_obitel_smerti.fb2"), "obitel-smerti", "letopis_obitel_smerti.fb2");
ok(obitel.title.includes("Обитель смерти") && obitel.author === "Lorin Death" && obitel.chapters.length === 23, "Обитель смерти: один автор и прежние 23 главы");

console.log(`\nbooks-library-test: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
