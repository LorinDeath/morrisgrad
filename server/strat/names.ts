// Имена Вождей: серверная проверка (единая для сервера/бота/теста; клиент показывает имя только через textContent).
// Порядок: NFKC → апострофы к ' → убрать управляющие/невидимые/комбинирующие → схлопнуть пробелы → trim →
// длина 2…20 (в символах) → только кириллица/латиница/цифры/пробел/дефис/апостроф → без «script»/URL → фильтр мата форума.
import { DEFAULT_WORDS, compileWords, filterText } from "../../src/lib/forum/profanity";

let RULES = compileWords(DEFAULT_WORDS);
/** сервер может подставить словарь админки форума (настройка filter_words) */
export function setNameWords(words: string[]) { RULES = compileWords(words && words.length ? words : DEFAULT_WORDS); }

const INVIS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u115F\u1160\u3164\uFFA0\u2800\u180E\u034F]/gu; // управляющие, zero-width, bidi, private use, хангыль-филлеры, braille blank
const MARKS = /\p{M}/u; // «залго» и прочие комбинирующие (й/ё после NFKC уже собраны)
const ALLOWED = /^[\p{Script=Cyrillic}\p{Script=Latin}0-9 '\-]+$/u;
const LETTER = /[\p{Script=Cyrillic}\p{Script=Latin}]/u;
const BAD = /(script|javascript|https?|www|onerror|onload|\bxn--)/i;

export type NameCheck = { ok: boolean; name?: string; err?: string };
export function cleanName(raw: string): string {
  let s = String(raw ?? "").slice(0, 200).normalize("NFKC");
  s = s.replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'").replace(/[\u2010-\u2015\u2212]/g, "-");
  // комбинирующие знаки убираем все, кроме одного бреве/диерезиса после и/е (й, ё); остальное («залго», акценты) — прочь
  s = s.replace(INVIS, "").normalize("NFD");
  let o = ""; for (const ch of s) { if (MARKS.test(ch)) { MARKS.lastIndex = 0; const prev = o.slice(-1); if ((ch === "\u0306" || ch === "\u0308") && /[иИеЕ]/.test(prev)) o += ch; continue; } o += ch; }
  s = o.normalize("NFC");
  s = s.replace(/\s+/g, " ").replace(/-{2,}/g, "-").replace(/'{2,}/g, "'").trim().replace(/^[-' ]+|[-' ]+$/g, "");
  return s;
}
export function checkChiefName(raw: string, C: { min: number; max: number } = { min: 2, max: 20 }): NameCheck {
  if (typeof raw !== "string") return { ok: false, err: "name_bad" };
  if (raw.length > 200) return { ok: false, err: "name_long" };
  const s = cleanName(raw), n = Array.from(s).length;
  if (n < C.min) return { ok: false, err: "name_short" };
  if (n > C.max) return { ok: false, err: "name_long" };
  if (!ALLOWED.test(s) || !LETTER.test(s)) return { ok: false, err: "name_chars" };
  if (BAD.test(s.replace(/[ '\-]/g, ""))) return { ok: false, err: "name_banned" };
  if (!filterText(s, RULES).clean) return { ok: false, err: "name_profanity" };
  return { ok: true, name: s };
}
