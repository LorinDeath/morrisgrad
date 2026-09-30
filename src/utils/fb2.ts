import obitelRaw from '../pages/_books/letopis_obitel_smerti.fb2?raw';
import kotyRaw from '../pages/_books/letopis_pravednye_koty.fb2?raw';
import killRaw from '../pages/_books/kill__boevaya_arena.fb2?raw';

export interface Chapter {
  id: number;
  slug: string;
  title: string;
  paragraphs: string[];
  paragraphsCount: number;
  wordCount: number;
  readingTimeMinutes: number;
  snippet: string;
}

export interface BookData {
  id: string;
  filename: string;
  title: string;
  author: string;
  annotation: string;
  annotationHtml: string;
  series: string;
  seriesNumber: string;
  chapters: Chapter[];
  totalChapters: number;
  totalWords: number;
  totalReadingTimeMinutes: number;
  coverImage: string;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function cleanText(str: string): string {
  return decodeXmlEntities(str.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTagContent(str: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = str.match(regex);
  return match ? match[1].trim() : '';
}

export function parseFB2(rawXml: string, bookId: string, filename: string): BookData {
  // Extract cover from <binary id="cover.jpg"> inside the FB2
  let coverImage = `/images/books/covers/${bookId}.jpg`;
  const coverBinaryMatch = rawXml.match(/<binary[^>]*id=["']cover\.jpg["'][^>]*>([\s\S]*?)<\/binary>/i)
    || rawXml.match(/<binary[^>]*content-type=["']image\/(?:jpg|jpeg|png)["'][^>]*>([\s\S]*?)<\/binary>/i);

  if (coverBinaryMatch) {
    const base64Data = coverBinaryMatch[1].replace(/\s+/g, '');
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        import('node:fs').then(fs => {
          import('node:path').then(path => {
            const coversDir = path.resolve('public/images/books/covers');
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
            const filePath = path.join(coversDir, `${bookId}.jpg`);
            if (!fs.existsSync(filePath)) {
              fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            }
          });
        }).catch(() => {});
      }
    } catch {
      // In Edge runtime, fallback to data URI if file not available
      if (!coverImage) {
        coverImage = `data:image/jpeg;base64,${base64Data}`;
      }
    }
  }

  // Strip binary tags for text parsing performance
  const xml = rawXml.replace(/<binary[\s\S]*?<\/binary>/gi, '');

  // Book title
  const rawTitle = extractTagContent(xml, 'book-title');
  const title = cleanText(rawTitle) || 'Без названия';

  // Author
  const authorXml = extractTagContent(xml, 'author');
  let author = 'Lorin Death';
  if (authorXml) {
    const fn = cleanText(extractTagContent(authorXml, 'first-name'));
    const ln = cleanText(extractTagContent(authorXml, 'last-name'));
    if (fn || ln) {
      author = [fn, ln].filter(Boolean).join(' ');
    }
  }

  // Annotation
  const annotationXml = extractTagContent(xml, 'annotation');
  const annotation = cleanText(annotationXml);
  const annotationParagraphs = (annotationXml.match(/<p>([\s\S]*?)<\/p>/gi) || [])
    .map(p => cleanText(p))
    .filter(Boolean);
  const annotationHtml = annotationParagraphs.length > 0
    ? annotationParagraphs.map(p => `<p>${p}</p>`).join('')
    : (annotation ? `<p>${annotation}</p>` : '');

  // Sequence
  const seqMatch = xml.match(/<sequence[^>]*name=["']([^"']+)["'][^>]*?(?:number=["']?([^"'\s/>]+)?)?/i);
  const series = seqMatch && seqMatch[1]
    ? decodeXmlEntities(seqMatch[1])
    : 'Альказак: «Ледяной клинок»';
  const seriesNumber = seqMatch && seqMatch[2] ? seqMatch[2] : '1';

  // Body and chapters
  const bodyXml = extractTagContent(xml, 'body') || xml;
  const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/gi;
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = sectionRegex.exec(bodyXml)) !== null) {
    const secContent = match[1];

    // Chapter title
    let chapterTitle = '';
    const titleMatch = secContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      const titleLines = (titleMatch[1].match(/<p>([\s\S]*?)<\/p>/gi) || [])
        .map(t => cleanText(t))
        .filter(Boolean);
      chapterTitle = titleLines.join(' // ') || cleanText(titleMatch[1]);
    }

    if (!chapterTitle) {
      chapterTitle = `Глава ${idx + 1}`;
    }

    const content = titleMatch ? secContent.replace(titleMatch[0], '') : secContent;
    const nodeRegex = /<(p|empty-line|v|subtitle|epigraph)[^>]*>([\s\S]*?)<\/\1>|<empty-line\s*\/?>/gi;
    let nodeMatch: RegExpExecArray | null;
    const paragraphs: string[] = [];
    let wordCount = 0;

    while ((nodeMatch = nodeRegex.exec(content)) !== null) {
      const fullTag = nodeMatch[0];
      const tagName = nodeMatch[1]?.toLowerCase();
      const innerContent = nodeMatch[2] || '';

      if (/<empty-line/i.test(fullTag)) {
        paragraphs.push('<div class="book-divider"><span>❖ ❖ ❖</span></div>');
        continue;
      }

      if (tagName === 'epigraph') {
        const epigraphText = cleanText(innerContent);
        if (epigraphText) {
          paragraphs.push(`<blockquote class="book-epigraph">«${epigraphText}»</blockquote>`);
        }
        continue;
      }

      if (tagName === 'subtitle') {
        const sub = cleanText(innerContent);
        if (sub) {
          paragraphs.push(`<h4 class="book-subtitle">${sub}</h4>`);
        }
        continue;
      }

      let formatted = innerContent
        .replace(/<emphasis>/gi, '<em>')
        .replace(/<\/emphasis>/gi, '</em>')
        .replace(/<strong>/gi, '<strong>')
        .replace(/<\/strong>/gi, '</strong>')
        .replace(/<style[^>]*>/gi, '')
        .replace(/<\/style>/gi, '')
        .trim();

      const textOnly = cleanText(formatted);
      if (textOnly.length > 0) {
        wordCount += textOnly.split(/\s+/).length;
        if (tagName === 'v') {
          paragraphs.push(`<p class="poem-line">${decodeXmlEntities(formatted)}</p>`);
        } else {
          paragraphs.push(`<p>${decodeXmlEntities(formatted)}</p>`);
        }
      }
    }

    const firstValidP = paragraphs.find(p => p.startsWith('<p>') && !p.includes('book-divider'));
    const snippet = firstValidP
      ? cleanText(firstValidP).substring(0, 160) + (cleanText(firstValidP).length > 160 ? '...' : '')
      : '';

    chapters.push({
      id: idx,
      slug: `chapter-${idx + 1}`,
      title: chapterTitle,
      paragraphs,
      paragraphsCount: paragraphs.filter(p => p.startsWith('<p>')).length,
      wordCount,
      readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 180)),
      snippet,
    });

    idx++;
  }

  // If no sections were found (monolithic body), treat whole body as single chapter
  if (chapters.length === 0) {
    const rawParagraphs = (bodyXml.match(/<p>([\s\S]*?)<\/p>/gi) || [])
      .map(p => `<p>${cleanText(p)}</p>`)
      .filter(Boolean);
    const words = rawParagraphs.reduce((acc, p) => acc + cleanText(p).split(/\s+/).length, 0);

    chapters.push({
      id: 0,
      slug: 'chapter-1',
      title: title,
      paragraphs: rawParagraphs,
      paragraphsCount: rawParagraphs.length,
      wordCount: words,
      readingTimeMinutes: Math.max(1, Math.ceil(words / 180)),
      snippet: rawParagraphs[0] ? cleanText(rawParagraphs[0]).substring(0, 160) + '...' : '',
    });
  }

  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const totalReadingTimeMinutes = chapters.reduce((sum, c) => sum + c.readingTimeMinutes, 0);

  return {
    id: bookId,
    filename,
    title,
    author,
    annotation,
    annotationHtml,
    series,
    seriesNumber,
    chapters,
    totalChapters: chapters.length,
    totalWords,
    totalReadingTimeMinutes,
    coverImage,
  };
}

const BOOK_CONFIGS = [
  { id: 'obitel-smerti', file: 'letopis_obitel_smerti.fb2', raw: obitelRaw },
  { id: 'pravednye-koty', file: 'letopis_pravednye_koty.fb2', raw: kotyRaw },
  { id: 'kill', file: 'kill__boevaya_arena.fb2', raw: killRaw },
];

const bookCache = new Map<string, { book: BookData; mtime: number }>();

export async function getBookById(id: string): Promise<BookData> {
  const config = BOOK_CONFIGS.find(b => b.id === id) || BOOK_CONFIGS[0];

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    
    // Check possible book paths (_books or books)
    const pathsToTry = [
      path.resolve(`src/pages/_books/${config.file}`),
      path.resolve(`src/pages/books/${config.file}`),
    ];

    for (const filePath of pathsToTry) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const cached = bookCache.get(config.id);
        if (!cached || stats.mtimeMs > cached.mtime) {
          const text = fs.readFileSync(filePath, 'utf-8');
          const parsed = parseFB2(text, config.id, config.file);
          bookCache.set(config.id, { book: parsed, mtime: stats.mtimeMs });
          return parsed;
        }
        return cached.book;
      }
    }
  } catch {
    // Edge runtime
  }

  const cached = bookCache.get(config.id);
  if (!cached) {
    const parsed = parseFB2(config.raw, config.id, config.file);
    bookCache.set(config.id, { book: parsed, mtime: 0 });
    return parsed;
  }
  return cached.book;
}

export async function getAllBooks(): Promise<BookData[]> {
  const books: BookData[] = [];
  for (const config of BOOK_CONFIGS) {
    const b = await getBookById(config.id);
    books.push(b);
  }
  return books;
}

export async function getBookData(): Promise<BookData> {
  return getBookById('obitel-smerti');
}
