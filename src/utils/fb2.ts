import obitelRaw from '../pages/_books/letopis_obitel_smerti.fb2?raw';
import kotyRaw from '../pages/_books/letopis_pravednye_koty.fb2?raw';
import killRaw from '../pages/_books/kill__boevaya_arena.fb2?raw';
import nachaloRaw from '../pages/_books/nachalo.fb2?raw';
import strazhRaw from '../pages/_books/strazh_pyatogo_poryadka.fb2?raw';
import { parseFB2, type BookData } from './fb2-parse';

export type { BookData, Chapter } from './fb2-parse';
export { parseFB2 } from './fb2-parse';

const BOOK_CONFIGS = [
  { id: 'obitel-smerti', file: 'letopis_obitel_smerti.fb2', raw: obitelRaw },
  { id: 'pravednye-koty', file: 'letopis_pravednye_koty.fb2', raw: kotyRaw },
  { id: 'kill', file: 'kill__boevaya_arena.fb2', raw: killRaw },
  { id: 'nachalo', file: 'nachalo.fb2', raw: nachaloRaw },
  { id: 'strazh-pyatogo-poryadka', file: 'strazh_pyatogo_poryadka.fb2', raw: strazhRaw },
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
