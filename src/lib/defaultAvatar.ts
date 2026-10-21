// Картинка по умолчанию (робот DiceBear) — та же, что была всегда (сид = внутренний id игрока),
// но id наружу не уходит: браузер видит только /api/avatar/<номер>, а DiceBear запрашивает сервер.
// Ответ DiceBear проверяется (только SVG без скриптов/обработчиков/внешних ссылок) и отдаётся с жёсткой CSP.
export const DICEBEAR_BASE = "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=";
export const MAX_SVG = 100_000;

export const avatarPath = (pid: number | string | null | undefined) => `/api/avatar/${encodeURIComponent(String(pid ?? 0))}`;

/** null — если ответ не похож на безопасный SVG. */
export function safeSvg(text: string): string | null {
  if (typeof text !== "string" || !text || text.length > MAX_SVG) return null;
  const t = text.trim();
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t) || !/<\/svg>\s*$/i.test(t)) return null;
  if (/<\s*(script|foreignObject|iframe|object|embed|use|image|a)\b/i.test(t)) return null;
  if (/\son[a-z]+\s*=/i.test(t) || /javascript:|data:text\/html|@import/i.test(t)) return null;
  if (/(href|src)\s*=\s*["']?\s*(https?:)?\/\//i.test(t) || /url\(\s*["']?\s*(https?:)?\/\//i.test(t)) return null;
  return t;
}

/** Нейтральная картинка, если DiceBear недоступен (без id, без внешних ресурсов). */
export const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#2a1f3d"/><circle cx="32" cy="26" r="11" fill="#8b5cf6"/><rect x="14" y="42" width="36" height="14" rx="7" fill="#8b5cf6"/></svg>`;

export const SVG_HEADERS = (maxAge: number): Record<string, string> => ({
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": `public, max-age=${maxAge}`,
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
});
