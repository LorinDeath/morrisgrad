// Прогресс и заметки читателя. На сервер уходит только признак защиты, не этот объект.
import { ID_RE, type Id, type ReaderAction } from "./contract";
import { validateReaderAction } from "./validate";

export const STORAGE_KEY = "lp-reader-v1";

export type BookCursor = { chapterNumber: number | null; partNumber: number | null };
export type Note = { id: string; bookId: Id; chapterNumber: number | null; text: string; createdAt: string; revisedFrom: string | null };
export type ReaderState = {
  v: 1;
  protection: boolean;
  hideHistorianHypotheses: boolean;
  books: Record<string, BookCursor>;
  notes: Note[];
};

export function emptyState(): ReaderState {
  return { v: 1, protection: false, hideHistorianHypotheses: false, books: {}, notes: [] };
}

function cursorOf(v: unknown): BookCursor | null {
  if (!v || typeof v !== "object") return null;
  const c = v as BookCursor;
  const ok = (n: unknown) => n == null || (typeof n === "number" && Number.isInteger(n) && n >= 0);
  if (!ok(c.chapterNumber) || !ok(c.partNumber)) return null;
  return { chapterNumber: c.chapterNumber ?? null, partNumber: c.partNumber ?? null };
}

export function loadState(raw: string | null): ReaderState {
  if (!raw) return emptyState();
  try {
    const v = JSON.parse(raw) as ReaderState;
    if (!v || v.v !== 1 || typeof v.books !== "object" || !Array.isArray(v.notes)) return emptyState();
    const books: ReaderState["books"] = {};
    for (const [id, c] of Object.entries(v.books || {})) {
      if (!ID_RE.test(id) || !id.startsWith("book:")) continue;
      const cur = cursorOf(c);
      if (cur) books[id] = cur;
    }
    const notes = v.notes.filter((n) => n && typeof n.id === "string" && typeof n.text === "string" && typeof n.bookId === "string");
    return {
      v: 1,
      protection: v.protection === true,
      hideHistorianHypotheses: v.hideHistorianHypotheses === true,
      books,
      notes,
    };
  } catch {
    return emptyState();
  }
}

export function serialize(state: ReaderState): string {
  return JSON.stringify(state);
}

/** Первое действие может не содержать ни одного поля. Чужие поля не принимаются. */
export function applyAction(state: ReaderState, action: ReaderAction): ReaderState {
  if (validateReaderAction(action).length) return state;
  if (!action.bookId) return state;
  const prev = state.books[action.bookId] || { chapterNumber: null, partNumber: null };
  const next: BookCursor = {
    chapterNumber: action.chapterNumber !== undefined ? action.chapterNumber : prev.chapterNumber,
    partNumber: action.partNumber !== undefined ? action.partNumber : prev.partNumber,
  };
  return { ...state, books: { ...state.books, [action.bookId]: next } };
}

export function setCursor(state: ReaderState, bookId: Id, cursor: BookCursor): ReaderState {
  return applyAction(state, { bookId, chapterNumber: cursor.chapterNumber, partNumber: cursor.partNumber });
}

export function addNote(state: ReaderState, note: Omit<Note, "revisedFrom"> & { revisedFrom?: string | null }): ReaderState {
  const row: Note = { ...note, revisedFrom: note.revisedFrom ?? null };
  return { ...state, notes: state.notes.concat(row) };
}

/** Старая запись не меняется. Правка — новая запись со ссылкой на прежнюю. */
export function reviseNote(state: ReaderState, id: string, text: string, createdAt: string): ReaderState {
  const prev = state.notes.find((n) => n.id === id);
  if (!prev) return state;
  return addNote(state, {
    id: id + ".r" + state.notes.length,
    bookId: prev.bookId,
    chapterNumber: prev.chapterNumber,
    text,
    createdAt,
    revisedFrom: prev.id,
  });
}

export type ServerFlag = { protection: boolean };

/** Всё, что допустимо отправить на сервер. Без заметок и без курсоров. */
export function exportForServer(state: ReaderState): ServerFlag {
  return { protection: state.protection === true };
}
