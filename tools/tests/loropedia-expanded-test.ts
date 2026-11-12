// Расширенный текст и сверка фактов: поздний слой не публичный, факты не допущены.
import fs from "node:fs";
import { HIDDEN_TERMS } from "../loropedia/config.mjs";
import { HISTORIAN_GUESS_LABEL, FORBIDDEN_GUESS_LABEL } from "../../src/lib/loropedia/contract";
import { validateCorpus } from "../../src/lib/loropedia/validate";
import { isOpen, project } from "../../src/lib/loropedia/project";
import { emptyState, setCursor } from "../../src/lib/loropedia/progress";
import type { Corpus } from "../../src/lib/loropedia/contract";
import rawPublic from "../../src/data/loropedia/data.json";
import rawExpanded from "../../src/data/loropedia/expanded.json";
import rawCorpus from "../../src/data/loropedia/contract/final/corpus.json";

const pub = rawPublic as { articles: { slug: string; title: string; order: number | null }[] };
const exp = rawExpanded as {
  factMarkup: boolean;
  articles: { slug: string; title: string; order: number | null; aliases: string[]; excerpt: string; html: string; statusLabel: string; historianGuess?: boolean }[];
  search: { s: string; e: string }[];
};
const corpus = rawCorpus as Corpus;

const NEW = ["i2-9-razbitaya-dusha", "perchatka-sily", "runa-vyzova", "lozhnaya-runa-zashchity", "ubiystvo-vozlyublennykh-noforda", "zabroshennyy-dom-u-kraya-lesa", "kareta-velesa", "predpolozheniya-istorika"];
let failed = 0;
const ok = (c: unknown, m: string) => { if (!c) { failed++; console.error("FAIL " + m); } };
const pubSlugs = new Set(pub.articles.map((a) => a.slug));
const expBy = new Map(exp.articles.map((a) => [a.slug, a]));

ok(exp.articles.length === pub.articles.length + NEW.length, "статей " + exp.articles.length);
ok(exp.factMarkup === false, "слой не размечен фактами");
ok([...pubSlugs].every((s) => expBy.has(s)), "прежние адреса сохранены");
ok(NEW.every((s) => expBy.has(s)), "восемь новых адресов");
ok(exp.articles.every((a) => pubSlugs.has(a.slug) || NEW.includes(a.slug)), "лишних статей нет");

const i29 = expBy.get("i2-9-razbitaya-dusha")!;
const g2 = expBy.get("gl-2-tyoplyy-vecher")!;
ok(i29?.order === 21 && i29.aliases.includes("Дорога назад") && i29.title === "И2.9 Разбитая душа", "И2.9: Разбитая душа, Дорога назад, порядок 21");
ok(g2?.order === 9 && g2.title === "Гл.2 Тёплый вечер", "глобальный №9 остаётся у Тёплого вечера");
ok(!exp.articles.some((a) => a.order === 21 && a.slug !== i29.slug), "порядок 21 только у И2.9");

for (const a of exp.articles) {
  const label = a.html.match(/class="lp-guess-label"[^>]*>([^<]+)/);
  ok(label?.[1] === HISTORIAN_GUESS_LABEL, a.slug + " без плашки");
  ok(!a.html.slice(a.html.indexOf("lp-guess-label"), a.html.indexOf("lp-guess-label") + 180).includes(FORBIDDEN_GUESS_LABEL), a.slug + " плашка подписана запретной меткой");
  ok(!/Основание:|Ограничение:/.test(a.excerpt), a.slug + " выдержка берёт гипотезу");
  ok(!a.html.includes('<details class="lp-mentions" open'), a.slug + " указатель раскрыт");
}
ok(!exp.search.some((r) => /Основание:|Ограничение:/.test(r.e)), "поиск расширенного слоя индексирует гипотезы");
ok(expBy.get("predpolozheniya-istorika")?.statusLabel === HISTORIAN_GUESS_LABEL, "свод гипотез подписан меткой Историка");

const leaked = HIDDEN_TERMS.test(JSON.stringify({ articles: exp.articles.map((a) => ({ excerpt: a.excerpt, html: a.html, aliases: a.aliases, title: a.title })), search: exp.search }));
ok(!leaked, "скрытая тема в расширенном слое");

ok(validateCorpus(corpus).length === 0, "финальный корпус не проходит схему");
ok(corpus.facts.length === 43 && corpus.events.length === 44 && corpus.fragments.length === 89, "счётчик фактов");
ok(corpus.hypotheses.length === 6 && corpus.relations.length === 19 && corpus.derived.length === 3, "счётчик гипотез и seed");
ok(corpus.chapters.some((ch) => ch.id === "chapter:obitel.c01" && ch.chapterNumber === 1), "Пролог — глава 1 книги");
ok(corpus.fragments.some((f) => f.locator.includes("Гл.4") && f.spoilerFrom.chapterNumber === 12), "Гл.4 — глава 12 книги");
ok(corpus.fragments.some((f) => f.locator.includes("И2.9") && f.spoilerFrom.chapterNumber === 22), "И2.9 — глава 22 книги, не порядок статьи");
const blade = corpus.events.find((e) => e.id === "event:obitel.blade.03");
ok(blade?.spoilerFrom.chapterNumber === 12 && blade.text.includes("Кэйджа"), "blade.03 открывается с Гл.4");
ok(corpus.facts.some((f) => f.id === "fact:pravednye.pk.04" && !f.text.includes("отец")), "родство Листафа не стало фактом");
const ent = new Set(corpus.entities.map((e) => e.id));
ok(ent.has("ent:obitel.ledyanoyklinok") && ent.has("ent:pravednye.kinzhal") && ent.has("ent:kill.klinok"), "клинки трёх книг разведены");
ok(!JSON.stringify(corpus).includes(FORBIDDEN_GUESS_LABEL), "в корпусе запретная метка");
const at = (chapter: number, book = "book:obitel") => setCursor({ ...emptyState(), protection: true }, book, { chapterNumber: chapter, partNumber: null });
const late = "был ли это вообще Нофорд";
const closed = project(corpus, at(1));
ok(closed.bodies.length === 0 && closed.chronology.length === 0 && closed.derived.length === 0 && !JSON.stringify(closed).includes("Кэйджа"), "глава 1 не открывает поздние факты и seed");
const at12 = project(corpus, at(12));
ok(at12.chronology.some((b) => b.id === "event:obitel.blade.03") && !JSON.stringify(at12).includes(late), "на главе 12 есть Кэйдж и нет цитаты И2.9");
ok(isOpen(corpus, at(22), "event:obitel.blade.03") && JSON.stringify(project(corpus, at(22))).includes(late), "глава 22 держит порог Гл.4 и открывает свою цитату");
ok(!isOpen(corpus, at(22, "book:pravednye"), "event:obitel.blade.03"), "курсор другой книги не открывает летопись");
ok(corpus.derived.every((d) => d.optional === true && !isOpen(corpus, at(1), d.id)), "seed необязательны и закрыты в начале");
const wired = ["src/pages/loropedia", "src/components/loropedia", "src/lib/loropedia/select.ts"].flatMap((dir) => {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const name of fs.readdirSync(p)) {
      const full = `${p}/${name}`;
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (fs.readFileSync(full, "utf8").includes("contract/final/corpus")) out.push(full);
    }
  };
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walk(dir);
  else if (fs.existsSync(dir) && fs.readFileSync(dir, "utf8").includes("contract/final/corpus")) out.push(dir);
  return out;
});
ok(wired.length === 0, "корпус подключён к страницам: " + wired.join(","));
ok(!fs.readFileSync("public/loropedia/search.json", "utf8").includes("i2-9-razbitaya-dusha"), "новый адрес попал в публичный поиск");
ok(!fs.readFileSync("src/data/loropedia/data.json", "utf8").includes("Дорога назад"), "псевдоним нового текста попал в прежний корпус");

if (failed) { console.error(failed + " провалов"); process.exit(1); }
console.log("расширение и сверка: проверки прошли");
