// Форум: форматирование для страниц (время по Киеву, склонения).
import { MEDIA_PREFIX } from "./md";
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
/** Настоящая отметка времени (мс)? 0/пусто/мусор (тихий профиль ещё не заходившего на форум — last_seen = 0) → false: такое поле не показываем вместо «1 янв. 1970». */
export const MIN_TS = Date.UTC(2020, 0, 1);
export function validTs(ms: unknown, nowMs = Date.now()): ms is number {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= MIN_TS && ms <= nowMs + 86_400_000;
}
export function ago(ms: number, nowMs = Date.now()) {
  const d = Math.max(0, nowMs - ms) / 1000;
  if (d < 60) return "только что";
  if (d < 3600) { const m = Math.floor(d / 60); return `${m} ${plural(m, "минуту", "минуты", "минут")} назад`; }
  if (d < 86400) { const h = Math.floor(d / 3600); return `${h} ${plural(h, "час", "часа", "часов")} назад`; }
  if (d < 86400 * 7) { const x = Math.floor(d / 86400); return `${x} ${plural(x, "день", "дня", "дней")} назад`; }
  return date(ms);
}
export function date(ms: number) {
  return new Date(ms).toLocaleDateString("ru-RU", { timeZone: "Europe/Kiev", day: "numeric", month: "short", year: "numeric" });
}
export function dateTime(ms: number) {
  return new Date(ms).toLocaleString("ru-RU", { timeZone: "Europe/Kiev", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export const media = (key: string | null | undefined) => (key ? MEDIA_PREFIX + key : "");
export const userUrl = (pid: number | string | null | undefined) => (pid == null ? "#" : "/forum/u/" + encodeURIComponent(String(pid)));
export const initial = (nick: string) => (Array.from(String(nick || "?").trim())[0] || "?").toUpperCase();
export function hue(id: string | number) { id = String(id ?? ""); let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
export const roleLabel = (r: string | null) => (r === "admin" ? "Админ" : r === "moderator" ? "Модератор" : "");
/** Сгенерированный аватар: симметричный узор 5×5 по номеру участника (путь для SVG viewBox 0 0 5 5). */
export function avaPattern(seed: string | number): string {
  let h = 2166136261; const str = "ava:" + String(seed ?? "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let d = "";
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if (((h >>> (y * 3 + x)) & 1) === 0) continue;
    d += `M${x} ${y}h1v1h-1z`;
    if (x < 2) d += `M${4 - x} ${y}h1v1h-1z`;
  }
  return d;
}
