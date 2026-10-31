// Чат партии (ТЗ §14.L): всем / команде / шёпот. Только текст: сервер чистит и маскирует мат, клиент выводит textContent.
// ≤200 символов, ≤5 сообщений за 10 с на человека, история 200 в DO, «Заглушить» (у себя), «Пожаловаться» (в D1/лог DO).
import { DEFAULT_WORDS, compileWords, filterText } from "../../src/lib/forum/profanity";
export const CHAT_CFG = { max: 200, rate: 5, per: 10_000, history: 200, reportsMax: 100 };
let RULES = compileWords(DEFAULT_WORDS);
export function setChatWords(words: string[]) { RULES = compileWords(words && words.length ? words : DEFAULT_WORDS); }
const INVIS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u115F\u1160\u3164\uFFA0\u2800\u180E\u034F]/gu;
const ZALGO = /(\p{M}{3,})/gu;
/** null — пусто; иначе чистый текст (мат замаскирован) */
export function cleanChat(raw: unknown, C = CHAT_CFG): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.normalize("NFKC").replace(INVIS, " ").replace(ZALGO, "").replace(/\s+/g, " ").trim();
  s = Array.from(s).slice(0, C.max).join(""); if (!s) return null;
  return filterText(s, RULES).text; // режим маски: «х∗∗∗»
}
export type ChatTo = "all" | "team" | number; // number — место адресата (шёпот)
export type ChatMsg = { id: number; at: number; from: number; nick: string; to: ChatTo; text: string };
/** окно лимита: метки времени отправки; true — можно */
export function chatAllowed(stamps: number[], now: number, C = CHAT_CFG): boolean {
  while (stamps.length && now - stamps[0] >= C.per) stamps.shift();
  if (stamps.length >= C.rate) return false; stamps.push(now); return true;
}
/** кто видит сообщение: место viewer (−1 — зритель), team(seat) — номер команды места */
export function canSee(m: ChatMsg, viewer: number, team: (s: number) => number): boolean {
  if (m.to === "all") return true;
  if (viewer < 0) return false; if (viewer === m.from) return true;
  if (m.to === "team") return team(viewer) === team(m.from);
  return m.to === viewer;
}
export function parseTo(v: unknown, seats: number): ChatTo | null {
  if (v === undefined || v === "all") return "all"; if (v === "team") return "team";
  const n = Number(v); return Number.isInteger(n) && n >= 0 && n < seats ? n : null;
}
