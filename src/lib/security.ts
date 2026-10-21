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
