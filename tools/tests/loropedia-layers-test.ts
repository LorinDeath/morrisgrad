// Слой книги «Дарг Сирром», ментальная карта и механики. Запуск: npx tsx tools/tests/loropedia-layers-test.ts
import fs from "node:fs";
import { HIDDEN_TERMS } from "../loropedia/config.mjs";
import rawPublic from "../../src/data/loropedia/data.json";
import rawExpanded from "../../src/data/loropedia/expanded.json";
import layer from "../../src/data/loropedia/books/darg-sirrom.json";
import { applyLayers } from "../../src/lib/loropedia/layers";
import { mindMap, quizPool, DS_QUIZ, QUOTES, EGGS, ACHIEVEMENTS } from "../../src/lib/loropedia/play";

let failed = 0;
const ok = (c: unknown, m: string) => { if (!c) { failed++; console.error("FAIL " + m); } };
const pub = applyLayers(rawPublic as any) as any, exp = applyLayers(rawExpanded as any) as any;
const by = (d: any, s: string) => d.articles.find((a: any) => a.slug === s);
const NEW = (layer as any).articles.map((a: any) => a.slug);

ok(pub.articles.length === (rawPublic as any).articles.length + NEW.length, "публичный слой: +" + NEW.length);
ok(exp.articles.length === (rawExpanded as any).articles.length + NEW.length, "расширенный слой: +" + NEW.length);
for (const d of [rawPublic, rawExpanded] as any[]) ok(d.articles.every((a: any) => by(d === rawPublic ? pub : exp, a.slug)), "прежние адреса сохранены");
ok((rawPublic as any).articles.every((a: any) => { const n = by(pub, a.slug); return JSON.stringify(n.image) === JSON.stringify(a.image) && JSON.stringify(n.gallery) === JSON.stringify(a.gallery); }), "картинки статей не тронуты");
ok(by(pub, "dark-sirom").title === "Дарг Сирром" && by(pub, "dark-sirom").aliases.includes("Дарк Сиром"), "dark-sirom переименована в «Дарг Сирром», slug сохранён");
ok(by(pub, "niro") && by(pub, "niro-darg-sirrom") && by(pub, "niro").title === "Ниро", "две Ниро, не слиты");
ok(/Теории — от Историка/.test(by(pub, "niro").html) && /одна героиня/.test(by(pub, "niro").html), "на странице Ниро (И1.4) связь — только теория");
ok(!/Та же душа/.test(by(pub, "niro").html), "планы о Ниро из «Дарг Сиррома» не попали на страницу Ниро из И1.4");
ok(/Чёрные склеры/.test(by(pub, "inkvizitory-smerti").html) && /lp-shutter/.test(by(pub, "inkvizitory-smerti").html), "теория о склерах (И2.6) опубликована под шторкой");
ok(!/тайна на потом|Раскрывать постепенно/i.test(JSON.stringify(layer)), "«тайна на потом» не публикуется");
ok(!HIDDEN_TERMS.test(JSON.stringify({ a: pub.articles.map((a: any) => [a.title, a.html, a.excerpt, a.aliases]), s: exp.search })), "скрытые темы");
const search = JSON.parse(fs.readFileSync("public/loropedia/search.json", "utf8"));
ok(NEW.every((s: string) => search.some((r: any) => r.s === s)) && search.find((r: any) => r.s === "dark-sirom").t === "Дарг Сирром", "поиск знает новые статьи и новое имя");
ok(!HIDDEN_TERMS.test(JSON.stringify(search)), "скрытые темы в поиске");
for (const a of (layer as any).articles) ok(!/уби[лт]|мёртв|смерть Велеса|инквизитор в/i.test(a.excerpt), a.slug + ": выдержка без спойлера");
ok(pub.articles.filter((a: any) => /lp-ds-theories/.test(a.html)).every((a: any) => !/Основание:/.test(a.excerpt)), "теории не в выдержках");
// каждая запись плана/теории — под шторкой
for (const a of pub.articles) {
  const blocks = a.html.match(/<section class="lp-ds-block[\s\S]*?<\/section>/g) || [];
  for (const b of blocks) ok((b.match(/<details class="lp-shutter/g) || []).length === (b.match(/lp-ds-item-t/g) || []).length, a.slug + ": запись плана/теории без шторки");
}
// граф и карта
ok(pub.graph.nodes.length === pub.articles.length && pub.graph.edges.every(([i, j]: number[]) => pub.graph.nodes[i] && pub.graph.nodes[j]), "граф пересчитан");
const mm = mindMap(pub.articles, pub.categories, {});
ok(mm.nodes.length === pub.articles.length && mm.branches.length >= 9 && mm.links.length > 500, "ментальная карта: все статьи и связи");
ok(new Set(mm.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size === mm.nodes.length, "точки карты не совпадают");
// механики
const pool = quizPool(pub.articles, pub.clans, pub.categories, DS_QUIZ);
ok(pool.length >= 40 && pool.every((q) => q.options.length >= 3 && q.options[q.answer] && new Set(q.options).size === q.options.length), "квиз: варианты корректны");
ok(QUOTES.every((q) => by(pub, q.slug)) && EGGS.every((e) => by(pub, e.slug)) && ACHIEVEMENTS.length >= 10, "цитаты, пасхалки, достижения ссылаются на живые статьи");
// у каждой кнопки есть подсказка
for (const f of ["src/pages/loropedia/karta.astro", "src/pages/loropedia/igry.astro", "src/pages/loropedia/[slug].astro", "src/components/loropedia/LpShell.astro"]) {
  const src = fs.readFileSync(f, "utf8"); const btns = src.match(/<button\b[^>]*>/g) || [];
  ok(btns.every((b) => /data-tip=/.test(b)), f + ": кнопка без подсказки");
}
const banned = /Pixel Art Atlas|Hugging ?Face|Krea|сюрприз/i;
ok(!banned.test(JSON.stringify(layer)) && !["karta", "igry", "index"].some((p) => banned.test(fs.readFileSync(`src/pages/loropedia/${p}.astro`, "utf8"))), "запрещённые слова в тексте сайта");
if (failed) { console.error(`loropedia layers: ${failed} fail`); process.exit(1); }
console.log("loropedia layers: проверки прошли");
