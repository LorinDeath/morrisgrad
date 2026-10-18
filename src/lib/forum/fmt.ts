// Форум: форматирование для страниц (время по Киеву, склонения).
import { MEDIA_PREFIX } from "./md";
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
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
export const userUrl = (id: string) => "/forum/u/" + encodeURIComponent(id);
export const initial = (nick: string) => (Array.from(String(nick || "?").trim())[0] || "?").toUpperCase();
export function hue(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
export const roleLabel = (r: string | null) => (r === "admin" ? "Админ" : r === "moderator" ? "Модератор" : "");
