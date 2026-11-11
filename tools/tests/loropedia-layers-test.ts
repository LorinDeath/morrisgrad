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
// две Ниро — одна героиня (авторская связь): одна статья niro, старый слаг — редирект
for (const d of [pub, exp]) {
  const n = by(d, "niro"), h = n.html;
  ok(n && n.title === "Ниро" && !by(d, "niro-darg-sirrom"), "одна статья Ниро, отдельной «Ниро (Дарг Сирром)» нет");
  ok(h.indexOf('id="v-letopisi"') >= 0 && h.indexOf('id="v-letopisi"') < h.indexOf('id="v-darg-sirrome"') && /id="svyaz-istoriy"/.test(h), "Ниро: разделы «И1.4» и «Дарг Сирром» и связь между ними");
  ok(/Сестра возлюбленной|сестра возлюбленной/.test(h) && /Та же душа/.test(h) && /совсем белые/.test(h), "Ниро: обе части на месте");
  const th = (h.match(/<section class="lp-ds-block lp-ds-theories[\s\S]*?<\/section>/) || [""])[0];
  const pl = (h.match(/<section class="lp-ds-block lp-ds-plans[\s\S]*?<\/section>/) || [""])[0];
  ok(th && !/одна героиня/.test(th), "теория «одна героиня» убрана из «Теорий — от Историка»");
  ok(/Одна Ниро в двух историях/.test(pl) && /<details class="lp-shutter lp-ds-item"[^>]*><summary[^>]*>[\s\S]*?<\/summary><div class="lp-shutter-body"><p class="lp-ds-item-t"><b>Одна Ниро в двух историях/.test(pl), "связь — в авторском блоке, под шторкой");
  ok(n.toc.some((t: any) => t.id === "v-letopisi") && n.toc.some((t: any) => t.id === "svyaz-istoriy"), "оглавление Ниро обновлено");
  ok(n.books.includes("book:darg-sirrom"), "Ниро в книге «Дарг Сирром»");
}
ok(!JSON.stringify(layer.articles).includes("niro-darg-sirrom") && !JSON.stringify(layer.appends).includes("niro-darg-sirrom") && !JSON.stringify(layer.extraLinks).includes("niro-darg-sirrom"), "ссылок на старый слаг не осталось");
ok((layer as any).redirects["niro-darg-sirrom"] === "niro", "редирект niro-darg-sirrom → niro");
ok(/Чёрные склеры/.test(by(pub, "inkvizitory-smerti").html) && /lp-shutter/.test(by(pub, "inkvizitory-smerti").html), "теория о склерах (И2.6) опубликована под шторкой");
ok(!/тайна на потом|Раскрывать постепенно/i.test(JSON.stringify(layer)), "служебные пометки автора не публикуются");
// «Тайна на потом» (Кавега/Нофорд — носители инквизитора) — по решению Алекс опубликована, но только под шторкой в авторском блоке
for (const s of ["inkvizitory-smerti", "noford", "kavega"]) {
  const pl = (by(pub, s).html.match(/<section class="lp-ds-block lp-ds-plans[\s\S]*?<\/section>/) || [""])[0];
  ok(/Секрет:/.test(pl) && /вселя|вселение/.test(pl), s + ": секретный план в авторском блоке");
  ok(!/Секрет:/.test(by(pub, s).html.replace(pl, "")) && !/Секрет:/.test(by(pub, s).excerpt), s + ": секрет только в авторском блоке");
  ok(/data-spoiler-ch="99"><summary[^>]*>[\s\S]{0,400}?<\/summary><div class="lp-shutter-body"><p class="lp-ds-item-t"><b>Секрет:/.test(pl), s + ": секрет под шторкой будущих глав");
}
ok(!HIDDEN_TERMS.test(JSON.stringify({ a: pub.articles.map((a: any) => [a.title, a.html, a.excerpt, a.aliases]), s: exp.search })), "скрытые темы");
const search = JSON.parse(fs.readFileSync("public/loropedia/search.json", "utf8"));
ok(NEW.every((s: string) => search.some((r: any) => r.s === s)) && search.find((r: any) => r.s === "dark-sirom").t === "Дарг Сирром", "поиск знает новые статьи и новое имя");
ok(!search.some((r: any) => r.s === "niro-darg-sirrom") && search.find((r: any) => r.s === "niro").a.includes("Ниро (Дарг Сирром)") && /Дарг Сирром/.test(search.find((r: any) => r.s === "niro").e), "поиск: одна Ниро, старый слаг снят");
ok(!mindMapSlugs().includes("niro-darg-sirrom"), "на карте нет старой точки");
ok(!HIDDEN_TERMS.test(JSON.stringify(search)), "скрытые темы в поиске");
for (const a of (layer as any).articles) ok(!/уби[лт]|мёртв|смерть Велеса|инквизитор в/i.test(a.excerpt), a.slug + ": выдержка без спойлера");
ok(pub.articles.filter((a: any) => /lp-ds-theories/.test(a.html)).every((a: any) => !/Основание:/.test(a.excerpt)), "теории не в выдержках");
// каждая запись плана/теории — под шторкой
for (const a of pub.articles) {
  const blocks = a.html.match(/<section class="lp-ds-block[\s\S]*?<\/section>/g) || [];
  for (const b of blocks) ok((b.match(/<details class="lp-shutter/g) || []).length === (b.match(/lp-ds-item-t/g) || []).length, a.slug + ": запись плана/теории без шторки");
}
function mindMapSlugs() { return mindMap(pub.articles, pub.categories, {}).nodes.map((n: any) => n.slug); }
// граф и карта
ok(pub.graph.nodes.length === pub.articles.length && pub.graph.edges.every(([i, j]: number[]) => pub.graph.nodes[i] && pub.graph.nodes[j]), "граф пересчитан");
const mm = mindMap(pub.articles, pub.categories, {});
ok(mm.nodes.length === pub.articles.length && mm.branches.length >= 9 && mm.links.length > 500, "ментальная карта: все статьи и связи");
ok(new Set(mm.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size === mm.nodes.length, "точки карты не совпадают");
// механики
const pool = quizPool(pub.articles, pub.clans, pub.categories, DS_QUIZ);
ok(pool.length >= 40 && pool.every((q) => q.options.length >= 3 && q.options[q.answer] && new Set(q.options).size === q.options.length), "квиз: варианты корректны");
ok(![...QUOTES, ...EGGS, ...DS_QUIZ].some((x: any) => x.slug === "niro-darg-sirrom"), "квиз, цитаты, пасхалки — без старого слага");
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
