// SEO: адреса, каноникал, правила индексации, описания страниц, JSON-LD. Без зависимостей — используется и в Layout, и в эндпоинтах.
export const SITE = "https://morrisgrad.com";
export const SITE_NAME = "МоррисГрад";
export const DEFAULT_DESC = "МоррисГрад — интерактивная вселенная тёмного фэнтези Lorin Death и Alex Seylor: онлайн-игра «Проклятые», книги и летописи, герои, мини-игры, музыка и форум сообщества.";
export const DEFAULT_IMAGE = "/og/morrisgrad-og.jpg"; // 1200×630
export const LOGO_IMAGE = "/og/morrisgrad-logo-512.png";

/** Канонический путь: без query, без завершающего «/» (кроме корня), без двойных слэшей. */
export function canonicalPath(pathname: string): string {
  let p = String(pathname || "/").split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}
export const abs = (p: string) => (/^https?:\/\//.test(p) ? p : SITE + (p.startsWith("/") ? p : "/" + p));

/** Служебные и личные страницы: noindex,follow (и в robots.txt — Disallow). */
export const PRIVATE_PREFIXES = [
  "/api/", "/forum/me", "/forum/notifications", "/forum/n/", "/forum/admin", "/forum/new", "/forum/edit/",
  "/profile", "/inventory", "/chat", "/idealpage", "/u/",
];
export const isPrivatePath = (p: string) => {
  const c = canonicalPath(p);
  return PRIVATE_PREFIXES.some((x) => (x.endsWith("/") ? c.startsWith(x) || c + "/" === x : c === x || c.startsWith(x + "/")));
};

/** Дубликаты: страница → её канонический адрес. */
export const DUPLICATES: Record<string, string> = {
  "/games/tiny-swords": "/games/ascetics", // одинаковые файлы
};

/** Описания статических страниц (иначе — общее описание сайта). */
export const PAGE_DESC: Record<string, string> = {
  "/": DEFAULT_DESC,
  "/books": "Библиотека МоррисГрада: книги и летописи Lorin Death онлайн. Виртуальная реальность, боги умыли руки, а система мутирует и гниёт заживо — выживать любой ценой.",
  "/loropedia": "Лоропедия МоррисГрада — энциклопедия летописи «Обитель смерти»: персонажи, кланы, локации, магия, события, хронология и карта связей.",
  "/loropedia/poisk": "Поиск по Лоропедии МоррисГрада: персонажи, прозвища, локации, предметы и термины летописи.",
  "/loropedia/karta": "Карта связей Лоропедии МоррисГрада: как связаны герои, кланы, места и события летописи.",
  "/loropedia/galereya": "Галерея Лоропедии МоррисГрада: арты персонажей, локаций и обложки глав летописи.",
  "/arts": "Галерея персонажей МоррисГрада: арты героев и злодеев вселенной тёмного фэнтези.",
  "/heroes": "Персонажи и герои МоррисГрада: Лорин Дэс, Велес, Хронос, Вайт Фокс, Айтрейн, Листаф Элфдид и другие — истории и образы.",
  "/cities": "География МоррисГрада: города и локации — от сердца города с небоскрёбами до старого порта и садов Эдема.",
  "/worlds": "Мультивселенная МоррисГрада: измерения и миры, связанные с городом.",
  "/stories": "Короткие истории вселенной МоррисГрада — рассказы о героях, программистах и тенях прошлого.",
  "/music": "Музыкальный зал МоррисГрада: треки и саундтреки Alex Seylor.",
  "/games": "Мини-игры МоррисГрада: роглайты, 3D-кликер «Ящик», «Заповедный лес», «Путь аскетов», «Катакомбы склепа» и другие — играйте прямо в браузере.",
  "/MorrisCurse": "«Проклятые» — онлайн-RPG МоррисГрада в браузере: боссы, проклятые и зачарованные вещи, улучшение снаряжения до +58, задания и дуэли.",
  "/konkurs": "Литературный конкурс МоррисГрада: условия, темы и как принять участие.",
  "/zayavka": "Подача заявки на литературный конкурс МоррисГрада «Тени и Шестерни».",
  "/allkonrass": "Рассказы участников литературного конкурса МоррисГрада.",
  "/changelog-site": "Хроники обновлений МоррисГрада: что нового в игре «Проклятые», на сайте и на форуме.",
  "/forum": "Форум МоррисГрада: гайды по игре «Проклятые», новости, лор, творчество и общение игроков.",
  "/forum/sections": "Разделы форума МоррисГрада: новости, «Проклятые», летописи и лор, творчество, таверна, помощь и идеи.",
  "/forum/rules": "Правила форума МоррисГрада: как общаться, что запрещено, как работают жалобы и модерация, и кто входит в команду форума.",
  "/games/sanctuary": "«Заповедный лес» — спокойная 3D-игра МоррисГрада в браузере: древние сказания и таинственные находки.",
  "/games/ascetics": "«Путь аскетов: Осада цитадели» — стратегия МоррисГрада: укрепляйте армию и королевство силой молитв и ратного мастерства.",
  "/games/crate": "Ящик — 3D инкрементальная RPG Моррис Града: бей ящики, нанимай помощников, собирай лут и скины, побеждай боссов и перерождайся.",
  "/games/dungeon": "Dungeon Gathering: Катакомбы склепа — экшен-роглайт МоррисГрада: монстры эволюционируют, золото и синие души, тактический Чёрный щит.",
  "/games/roguelike": "«Неоновый протокол» — роглайт МоррисГрада в браузере.",
  "/games/geometry-rogue": "«Геометрия хаоса» — экшен-роглайт МоррисГрада: выбирайте фигуру-героя, улучшения и ульты.",
  "/games/echo": "«Это мы с тобой!» — мини-игра МоррисГрада.",
  "/games/cherta": "«Черта купола» — мини-игра МоррисГрада.",
  "/games/zaglushka": "«Заглушка» — экспериментальная мини-игра МоррисГрада.",
  "/games/strategy": "«Партия Чёрных королей» — пошаговая стратегия МоррисГрада: доска 8×8 или 15×15, расы и Вожди, игра с другом или с ботом.",
};
const HERO = (n: string) => `${n} — персонаж вселенной МоррисГрада: образ, история и место в мире тёмного фэнтези Lorin Death.`;
for (const [p, n] of Object.entries({
  "/heroes/veles": "Велес", "/heroes/chronos": "Хронос", "/heroes/lorin-death": "Лорин Дэс", "/heroes/white-fox": "Вайт Фокс",
  "/heroes/itrain": "Айтрейн", "/heroes/crazy-alex-seylor": "Поехавший Алекс Сэйлор", "/heroes/lorelin-seylor": "Лорелин Сэйлор", "/heroes/listaf-elfdid": "Листаф Элфдид",
  "/art%20hero/char2": "Лорелин", "/art%20hero/char3": "Мариэль", "/art%20hero/char4": "Алекс Сэйлор", "/art%20hero/char5": "Листаф Элфдид",
  "/art%20hero/char6": "Лист", "/art%20hero/char7": "Дар", "/art%20hero/char8": "Гарри", "/art%20hero/elfdid": "Lorin Death",
})) PAGE_DESC[p] = HERO(n);
for (const [p, n] of Object.entries({ "/changelog-crate": "«Ящик»", "/changelog-dungeon": "Dungeon Gathering", "/changelog-echo": "«Это мы с тобой!»", "/changelog-geometria": "«Геометрия хаоса»", "/changelog-roguelike": "«Рогалик»", "/changelog-zaglushka": "«Заглушка»" }))
  PAGE_DESC[p] = `История обновлений мини-игры ${n} на сайте МоррисГрада: что изменилось в каждой версии.`;

/** Публичные статические страницы для sitemap (без личных, служебных и дубликатов). */
export const STATIC_PAGES: { path: string; priority?: number; changefreq?: string }[] = [
  { path: "/", priority: 1, changefreq: "daily" },
  { path: "/MorrisCurse", priority: 0.9, changefreq: "weekly" },
  { path: "/forum", priority: 0.9, changefreq: "hourly" },
  { path: "/forum/sections", priority: 0.6, changefreq: "daily" },
  { path: "/forum/rules", priority: 0.3, changefreq: "monthly" },
  { path: "/changelog-site", priority: 0.7, changefreq: "weekly" },
  ...["/books", "/heroes", "/arts", "/cities", "/worlds", "/stories", "/music", "/games"].map((path) => ({ path, priority: 0.7 })),
  ...["/konkurs", "/zayavka", "/allkonrass"].map((path) => ({ path, priority: 0.4 })),
  ...["veles", "chronos", "lorin-death", "white-fox", "itrain", "crazy-alex-seylor", "lorelin-seylor", "listaf-elfdid"].map((h) => ({ path: "/heroes/" + h, priority: 0.6 })),
  ...["char2", "char3", "char4", "char5", "char6", "char7", "char8", "elfdid"].map((h) => ({ path: "/art%20hero/" + h, priority: 0.4 })),
  ...["sanctuary", "ascetics", "crate", "dungeon", "roguelike", "geometry-rogue", "echo", "cherta", "zaglushka", "strategy"].map((g) => ({ path: "/games/" + g, priority: 0.6 })),
  ...["crate", "dungeon", "echo", "geometria", "roguelike", "zaglushka"].map((g) => ({ path: "/changelog-" + g, priority: 0.3 })),
];

export interface SeoInput {
  title: string;
  description?: string | null;
  /** Путь или абсолютный URL; null — вычислить из текущего адреса (без query). */
  canonical?: string | null | false; // false — без каноникала (страница 404)
  image?: string | null;
  imageAlt?: string | null;
  type?: "website" | "article" | "profile";
  robots?: string | null; // например "noindex,follow"
  publishedTime?: number | null;
  modifiedTime?: number | null;
  jsonLd?: any[] | null;
}

export function resolveSeo(pathname: string, x: SeoInput) {
  const path = canonicalPath(pathname);
  const canonical = x.canonical === false ? null : abs(x.canonical ? x.canonical : DUPLICATES[path] || path);
  const robots = x.robots || (isPrivatePath(path) ? "noindex,follow" : "index,follow,max-image-preview:large");
  const description = clip(x.description || PAGE_DESC[path] || DEFAULT_DESC, 200);
  return { canonical, robots, description, image: abs(x.image || DEFAULT_IMAGE), defaultImage: !x.image, imageAlt: x.imageAlt || x.title, type: x.type || "website" };
}

export function clip(s: string, n: number) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 30)).replace(/[\s,.;:—-]+$/, "") + "…";
}
/** Текст из безопасного HTML (для JSON-LD комментариев). */
export const htmlText = (h: string) => String(h || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|li|h\d|blockquote|div)>/gi, " ").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : undefined);

/** JSON-LD безопасно для <script>: экранируем «<», чтобы текст не мог закрыть тег. */
export const ldJson = (o: any) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");

export const breadcrumbs = (items: [string, string][]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
});

export const homeLd = () => [
  { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#website", url: SITE + "/", name: SITE_NAME, alternateName: ["MorrisGrad", "Моррис Град"], inLanguage: "ru-RU", publisher: { "@id": SITE + "/#org" } },
  { "@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", name: SITE_NAME, url: SITE + "/", logo: abs(LOGO_IMAGE),
    sameAs: ["https://author.today/u/alex_seylor/works/", "https://t.me/LorinDeath", "https://www.youtube.com/@Lorin_Death", "https://boosty.to/alexseylormusic"] },
];

/** Тема форума: DiscussionForumPosting (обсуждение) или Article (статья) + первые комментарии. */
export function topicLd(t: any, opts: { url: string; image?: string | null; comments?: any[] }) {
  const author = (a: any) => ({ "@type": "Person", name: a?.nick || "Участник", ...(a?.pid != null ? { url: abs(`/forum/u/${a.pid}`) } : {}) });
  const stats = (likes: number, comments?: number) => [
    { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: likes | 0 },
    ...(comments != null ? [{ "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: comments | 0 }] : []),
  ];
  const isArticle = t.kind === "article";
  const base: any = {
    "@context": "https://schema.org",
    "@type": isArticle ? "Article" : "DiscussionForumPosting",
    "@id": opts.url + "#post",
    mainEntityOfPage: opts.url, url: opts.url,
    headline: clip(t.title, 110),
    ...(isArticle ? {} : { text: clip(t.plain || t.excerpt || "", 4000) }),
    description: clip(t.excerpt || t.plain || "", 300),
    author: author(t.author),
    datePublished: iso(t.created_at), dateModified: iso(Math.max(t.updated_at || 0, t.created_at || 0)),
    commentCount: t.comments_count | 0,
    interactionStatistic: stats(t.likes_count, t.comments_count),
    inLanguage: "ru-RU",
    isPartOf: { "@type": "WebSite", "@id": SITE + "/#website" },
    ...(opts.image ? { image: [abs(opts.image)] } : {}),
    ...(isArticle ? { publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: abs(LOGO_IMAGE) } } } : {}),
  };
  const cm = (opts.comments || []).filter((c) => !c.deleted && !c.hidden && c.plain).slice(0, 20);
  if (cm.length) base.comment = cm.map((c) => ({
    "@type": "Comment", "@id": `${opts.url}#c${c.id}`, url: `${opts.url}#c${c.id}`, text: clip(c.plain, 1000), author: author(c.author),
    datePublished: iso(c.created_at), interactionStatistic: stats(c.likes_count),
  }));
  return base;
}

export const xmlEsc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
