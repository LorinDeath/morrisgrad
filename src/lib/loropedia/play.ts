// Данные для механик вовлечения и ментальной карты. Всё считается при сборке из тех же статей,
// что видит читатель; ничего не придумывается сверх текста статей.
import type { LpArticle } from "../loropedia";

export const BOOKS = [
  { id: "book:obitel-smerti", short: "Обитель смерти", label: "Летопись «Обитель смерти»" },
  { id: "book:pravednye-koty", short: "Праведные коты", label: "Праведные коты" },
  { id: "book:kill", short: "KILL", label: "KILL" },
  { id: "book:darg-sirrom", short: "Дарг Сирром", label: "Дарг Сирром: Страж пятого порядка" },
] as const;

/** Книга главы по слагу (главы летописи, отдельные тексты, новая книга). */
export function bookOfChapter(slug: string): string | null {
  if (/^(prolog|i1-|i2-|gl-|istoriya-|glavy-1-5)/.test(slug)) return "book:obitel-smerti";
  if (slug.startsWith("pravednye-koty-probuzhdenie")) return "book:pravednye-koty";
  if (slug.startsWith("kill-glava")) return "book:kill";
  if (slug.startsWith("ds-") || slug === "darg-sirrom") return "book:darg-sirrom";
  return null;
}

/** Книги статьи: по главам, на которые она ссылается или которые ссылаются на неё. */
export function booksOf(a: LpArticle & { books?: string[] }): string[] {
  const s = new Set<string>(a.books || []);
  const own = bookOfChapter(a.slug);
  if (own && a.cat === "glavy") s.add(own);
  for (const x of [...a.links, ...a.backlinks]) { const b = bookOfChapter(x); if (b) s.add(b); }
  return BOOKS.map((b) => b.id).filter((id) => s.has(id));
}

export type MapNode = { i: number; slug: string; title: string; cat: string; x: number; y: number; r: number; deg: number; ang: number; books: number; ex: string; st: string; img: string | null; lvl: 2 };
export type MapBranch = { cat: string; name: string; icon: string; color: string; x: number; y: number; ang: number; count: number };

/** Радиальная ментальная карта: центр → разделы → статьи (кольцами внутри сектора раздела). */
export function mindMap(articles: (LpArticle & { books?: string[] })[], cats: { slug: string; name: string; icon: string }[], colors: Record<string, string>) {
  const usedCats = cats.filter((c) => articles.some((a) => a.cat === c.slug));
  const weight = (c: { slug: string }) => Math.sqrt(articles.filter((a) => a.cat === c.slug).length) + 1.2;
  const total = usedCats.reduce((s, c) => s + weight(c), 0);
  const deg = new Map(articles.map((a) => [a.slug, new Set([...a.links, ...a.backlinks]).size]));
  const branches: MapBranch[] = []; const nodes: MapNode[] = [];
  let acc = -Math.PI / 2;
  const R1 = 300, R2 = 620, RING = 115;
  const bookIdx = BOOKS.map((b) => b.id);
  for (const c of usedCats) {
    const span = (weight(c) / total) * Math.PI * 2;
    const mid = acc + span / 2;
    const items = articles.filter((a) => a.cat === c.slug).sort((x, y) => (deg.get(y.slug)! - deg.get(x.slug)!) || x.title.localeCompare(y.title, "ru"));
    branches.push({ cat: c.slug, name: c.name, icon: c.icon, color: colors[c.slug] || "#c9a86c", x: Math.cos(mid) * R1, y: Math.sin(mid) * R1, ang: mid, count: items.length });
    // сколько точек влезает в дугу на каждом кольце (шаг ~34px), раскладываем змейкой
    const pad = Math.min(0.06, span * 0.08); const a0 = acc + pad, a1 = acc + span - pad;
    let k = 0, ring = 0;
    while (k < items.length) {
      const R = R2 + ring * RING;
      const cap = Math.max(1, Math.floor(((a1 - a0) * R) / 34));
      const take = items.slice(k, k + cap);
      take.forEach((a, j) => {
        const t = take.length === 1 ? 0.5 : j / (take.length - 1);
        const ang = a0 + (a1 - a0) * t + (ring % 2 ? (a1 - a0) / (2 * Math.max(cap, 2)) : 0);
        const d = deg.get(a.slug) || 0;
        const books = booksOf(a).reduce((m, b) => m | (1 << bookIdx.indexOf(b as any)), 0);
        nodes.push({ i: nodes.length, slug: a.slug, title: a.title, cat: a.cat, x: Math.cos(ang) * R, y: Math.sin(ang) * R, r: Math.min(15, 5 + Math.sqrt(d) * 1.5), deg: d, ang, books,
          ex: a.excerpt.slice(0, 220), st: a.invented ? "idea" : a.status, img: a.image?.thumb || null, lvl: 2 });
      });
      k += take.length; ring++;
    }
    acc += span;
  }
  const idx = new Map(nodes.map((n) => [n.slug, n.i]));
  const links: [number, number][] = []; const seen = new Set<string>();
  for (const a of articles) for (const t of a.links) {
    const i = idx.get(a.slug), j = idx.get(t); if (i == null || j == null || i === j) continue;
    const key = i < j ? i + "-" + j : j + "-" + i; if (seen.has(key)) continue; seen.add(key); links.push([i, j]);
  }
  const maxR = Math.max(...nodes.map((n) => Math.hypot(n.x, n.y))) + 160;
  return { branches, nodes, links, size: maxR };
}

/** Детерминированный «случайный» генератор (одинаковый на сервере и в браузере). */
export function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export type QuizQ = { q: string; options: string[]; answer: number; slug: string; book?: string; why?: string };

/** Вопросы квиза: из прозвищ, кланов и разделов статей + вопросы по новой книге. */
export function quizPool(articles: LpArticle[], clans: { name: string; slugs: string[] }[], cats: { slug: string; name: string }[], extra: QuizQ[]): QuizQ[] {
  const R = rng(7); const out: QuizQ[] = [];
  const pick = <T,>(arr: T[], n: number, not: (x: T) => boolean) => { const c = arr.filter((x) => !not(x)); const res: T[] = []; while (res.length < n && c.length) res.push(c.splice(Math.floor(R() * c.length), 1)[0]); return res; };
  const shuffle = (opts: string[], right: string) => { const all = [...opts, right].sort(() => R() - 0.5); return { options: all, answer: all.indexOf(right) }; };
  const people = articles.filter((a) => a.cat === "personazhi");
  for (const a of articles) {
    const al = a.aliases.find((x) => x.length > 3 && !a.title.toLowerCase().includes(x.toLowerCase().slice(0, 4)) && !/[a-z]/i.test(x) && !/\(/.test(x));
    if (!al) continue;
    const pool = articles.filter((b) => b.cat === a.cat && b.slug !== a.slug);
    if (pool.length < 3) continue;
    const wrong = pick(pool, 3, () => false).map((b) => b.title);
    out.push({ q: `Кого или что ещё называют «${al}»?`, ...shuffle(wrong, a.title), slug: a.slug, why: `«${al}» — другое имя статьи «${a.title}».` });
  }
  for (const c of clans) for (const s of c.slugs) {
    const a = articles.find((x) => x.slug === s); if (!a) continue;
    const others = clans.filter((x) => x.name !== c.name).map((x) => x.name);
    if (others.length < 3) continue;
    out.push({ q: `В каком клане состоит ${a.title}?`, ...shuffle(pick(others, 3, () => false), c.name), slug: a.slug, why: `${a.title} — клан «${c.name}».` });
  }
  for (const a of articles.filter((x) => x.cat !== "glavy" && x.cat !== "khronologiya-razdel").slice(0, 400)) {
    if (R() > 0.35) continue;
    const cat = cats.find((c) => c.slug === a.cat)!; const others = cats.filter((c) => c.slug !== a.cat && c.slug !== "khronologiya-razdel").map((c) => c.name);
    out.push({ q: `К какому разделу Лоропедии относится «${a.title}»?`, ...shuffle(pick(others, 3, () => false), cat.name), slug: a.slug, why: `«${a.title}» — раздел «${cat.name}».` });
  }
  void people;
  return [...out, ...extra];
}

/** Вопросы и цитаты по главе 1 «Дарг Сирром» — дословно по тексту главы. Показываются только тем, кто открыл спойлеры этой книги. */
export const DS_QUIZ: QuizQ[] = [
  { q: "Каким оружием Велес пытался выстрелить в начале «Дарг Сиррома»?", options: ["Чёрным пистолетом", "Ледяным кинжалом", "Рапирой", "Механической косой"], answer: 0, slug: "chyornye-pistolety", book: "book:darg-sirrom", why: "Чёрный пистолет — тот, что Велес принёс сам." },
  { q: "Что оказалось в обойме чёрного пистолета?", options: ["Ни одного патрона", "Три патрона", "Пули со скверной", "Один патрон"], answer: 0, slug: "chyornye-pistolety", book: "book:darg-sirrom", why: "«Пустая. Ни одного патрона»." },
  { q: "Как Ниро называет то, что она умеет?", options: ["Призыв", "Воскрешение", "Стазис", "Обнуление"], answer: 0, slug: "prizyv-niro", book: "book:darg-sirrom", why: "«Я призыватель. Это то, что я умею»." },
  { q: "Каким словом Велес проверяет, «дома» ли он?", options: ["Атьем", "Фэйей", "Альфа", "Икс"], answer: 0, slug: "atem-i-feyey", book: "book:darg-sirrom", why: "Для Морриса это больное слово — он фыркает." },
  { q: "Кого, по словам Ниро, она призывала раньше?", options: ["Ликёра", "Петра", "Кавегу", "Тифани"], answer: 0, slug: "likyor-vladollars", book: "book:darg-sirrom", why: "«Помню, когда я Ликёра призывала…»" },
  { q: "Какого цвета волосы у Ниро?", options: ["Совсем белые, до самых кончиков", "Белые с фиолетовыми кончиками", "Чёрные с красной прядью", "Розовые"], answer: 0, slug: "niro", book: "book:darg-sirrom", why: "«Волосы короткие и белые, совсем белые, до самых кончиков»." },
  { q: "На какую церемонию Моррис торопит Ниро?", options: ["Призыва трёх великих детей", "Коронации", "Суда над Нофордом", "Открытия Северных врат"], answer: 0, slug: "tseremoniya-prizyva-tryokh-velikikh-detey", book: "book:darg-sirrom", why: "«Сегодня церемония призыва трёх великих детей»." },
  { q: "Чьими глазами в финале главы смотрит инквизитор?", options: ["Морриса Дэмиурга", "Ниро", "Лорин", "Вайт"], answer: 0, slug: "morris-demiurg", book: "book:darg-sirrom", why: "Белки глаз Морриса заливает чернота." },
];

export type Quote = { text: string; who: string; slug: string; src: string; book?: string };
/** «Кто сказал?» — цитаты, сверенные с текстом статей Лоропедии и главы 1 «Дарг Сирром». */
export const QUOTES: Quote[] = [
  { text: "Вроде как... три.", who: "Лорин Дэс", slug: "lorin-des", src: "Гл.3 — о чёрных пистолетах" },
  { text: "Это было десять лет назад!", who: "Лорин Дэс", slug: "lorin-des", src: "Гл.3" },
  { text: "Я опять очнулся на фонтане Велеса и Вайт!", who: "Нофорд", slug: "noford", src: "И2.2" },
  { text: "Да ну. Нофорд? Наш?", who: "Пётр", slug: "pyotr", src: "И2.9" },
  { text: "Мне кажется, или мы все в опасности?", who: "Кавега", slug: "kavega", src: "И2.9" },
  { text: "Не надо будет нас любить. Просто жить.", who: "Мариэль", slug: "mariel", src: "И2.9" },
  { text: "Я не знаю, что произошло.", who: "Велес", slug: "veles", src: "И2.9" },
  { text: "Если я тебя не отпущу, ты опять полезешь обниматься.", who: "Велес", slug: "veles", src: "И2.7" },
  { text: "Каков шанс того, что Альфы больше нет?", who: "Моррис Дэмиург", slug: "morris-demiurg", src: "летопись" },
  { text: "Наконец-то я смогла тебя призвать!", who: "Ниро", slug: "niro", src: "ДС.1", book: "book:darg-sirrom" },
  { text: "Смерть — выдумка.", who: "Ниро", slug: "niro", src: "ДС.1", book: "book:darg-sirrom" },
  { text: "У каждого начала есть свой конец.", who: "Ниро", slug: "niro", src: "ДС.1", book: "book:darg-sirrom" },
  { text: "Потом поговорим. Сейчас не до этого.", who: "Моррис Дэмиург", slug: "morris-demiurg", src: "ДС.1", book: "book:darg-sirrom" },
  { text: "Я считал тебя другом.", who: "Велес", slug: "veles", src: "ДС.1 (мысль)", book: "book:darg-sirrom" },
];

/** Пасхалки: незаметные руны на страницах статей. */
export const EGGS: { id: string; slug: string; hint: string }[] = [
  { id: "egg-korona", slug: "chyornaya-korona", hint: "Корона отбрасывает тень" },
  { id: "egg-fontan", slug: "fontan-velesa-i-vayt", hint: "На дне чаши что-то блестит" },
  { id: "egg-gerb", slug: "gerb-demiurgov", hint: "Кристалл висит вопреки всему" },
  { id: "egg-stazis", slug: "stazis", hint: "Пылинка, застывшая в воздухе" },
  { id: "egg-lorin", slug: "lorin-des", hint: "Капля Адского пламени" },
  { id: "egg-veles", slug: "veles", hint: "Зелёный отблеск на кончиках волос" },
  { id: "egg-morris", slug: "morris-demiurg", hint: "Он смотрит в небо" },
  { id: "egg-niro", slug: "niro", hint: "Снежинка, которая не тает" },
  { id: "egg-kyut", slug: "kyut", hint: "Мур?" },
  { id: "egg-letopis", slug: "letopis-obitel-smerti", hint: "Перо, которое так и не обмакнули" },
];

export type Ach = { id: string; icon: string; title: string; desc: string };
export const ACHIEVEMENTS: Ach[] = [
  { id: "read-1", icon: "📜", title: "Первая страница", desc: "Прочитать первую статью" },
  { id: "read-10", icon: "📚", title: "Книжный червь", desc: "Прочитать 10 статей" },
  { id: "read-50", icon: "🕯", title: "Летописец", desc: "Прочитать 50 статей" },
  { id: "read-people", icon: "👤", title: "Знаток лиц", desc: "Прочитать все статьи о персонажах" },
  { id: "ds-all", icon: "🜂", title: "Страж пятого порядка", desc: "Прочитать все статьи книги «Дарг Сирром»" },
  { id: "map-15", icon: "✶", title: "Картограф", desc: "Открыть 15 статей с ментальной карты" },
  { id: "quiz-1", icon: "❓", title: "Первый экзамен", desc: "Пройти квиз по лору" },
  { id: "quiz-10", icon: "🏆", title: "Безупречно", desc: "Ответить в квизе на 10 из 10" },
  { id: "who-5", icon: "🗣", title: "Узнаю по голосу", desc: "5 верных ответов подряд в «Кто сказал?»" },
  { id: "tl-1", icon: "⏳", title: "Хронист", desc: "Верно расставить главы по порядку" },
  { id: "egg-1", icon: "👁", title: "Зоркий глаз", desc: "Найти первую пасхалку" },
  { id: "egg-all", icon: "🗝", title: "Охотник за пасхалками", desc: "Найти все пасхалки" },
  { id: "day-1", icon: "☀", title: "Статья дня", desc: "Прочитать статью дня" },
  { id: "streak-3", icon: "🔥", title: "Три вечера подряд", desc: "Заглядывать в Лоропедию три дня подряд" },
  { id: "rare-10", icon: "💎", title: "Коллекционер", desc: "Собрать 10 редких карточек" },
  { id: "cmp-5", icon: "⚖", title: "Сравнитель", desc: "Сравнить персонажей 5 раз" },
];

export const RANKS = [
  { xp: 0, title: "Новичок у фонтана" }, { xp: 100, title: "Ученик летописца" }, { xp: 300, title: "Хранитель свитков" },
  { xp: 700, title: "Инквизитор четвёртого порядка" }, { xp: 1200, title: "Страж пятого порядка" }, { xp: 2000, title: "Хранитель Чёрной Короны" },
];

/** Редкость карточки по числу связей и наличию арта. */
export const rarity = (deg: number, img: boolean) => (deg >= 20 ? "legend" : deg >= 10 || img ? "rare" : "common");
