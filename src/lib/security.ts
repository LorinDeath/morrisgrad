// Общие проверки безопасности сайта (middleware). Чистые функции — покрыты tools/tests/security-site-test.ts.

/**
 * CSRF: запрос, меняющий данные (не GET/HEAD/OPTIONS), отклоняется, если браузер прислал его с чужого сайта.
 * Вход — cookie Clerk (__session), поэтому чужая страница могла бы отправить форму/fetch от имени игрока.
 * Правило: есть Origin → он обязан совпасть с адресом сайта; Origin нет → смотрим Sec-Fetch-Site (cross-site → отказ).
 * Ни того ни другого (старый браузер, curl, сервер-сервер) — пропускаем: такие клиенты не несут cookie жертвы.
 */
export function isCrossSiteWrite(method: string, url: string, headers: Headers): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  const origin = headers.get("origin");
  if (origin) {
    if (origin === "null") return true;
    try { return new URL(origin).origin !== new URL(url).origin; } catch { return true; }
  }
  const sfs = headers.get("sec-fetch-site");
  return sfs === "cross-site" || sfs === "same-site";
}

/**
 * Заголовки безопасности для всех ответов воркера сайта (SSR-страницы, API, редиректы).
 * Статика из dist отдаётся без воркера — для неё те же значения в public/_headers.
 * CSP здесь намеренно узкая (только то, что не ломает Clerk/игру/YouTube/внешние картинки):
 *  frame-ancestors — сайт нельзя встроить в чужой iframe (кликджекинг), свои iframe (игры) работают;
 *  base-uri / object-src — закрывают <base>-подмену и плагины. Полная CSP со script-src — отдельное решение.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
  "cross-origin-opener-policy": "same-origin-allow-popups",
};

/** Ставит недостающие заголовки (свои заголовки ответа, например CSP картинок форума, не перетираются). */
export function withSecurityHeaders(res: Response, isHttps: boolean): Response {
  let r = res;
  const apply = (h: Headers) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (k === "strict-transport-security" && !isHttps) continue;
      if (!h.has(k)) h.set(k, v);
    }
  };
  try { apply(r.headers); }
  catch { r = new Response(r.body, r); apply(r.headers); } // неизменяемые заголовки (Response.redirect / fetch) — копия
  return r;
}

/** Ник сайта (users.username): виден в чате, игре и профилях. Те же символы, что у ника форума. null — ник годится. */
export function siteNickProblem(n: string): string | null {
  const s = String(n ?? "");
  if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_\- .]+$/.test(s)) return "Никнейм: буквы, цифры, пробел, «_», «-», «.»";
  return null;
}
