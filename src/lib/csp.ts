// Content-Security-Policy со script-src (защита от внедрённых скриптов: даже если где-то пропустим XSS,
// браузер не выполнит чужой <script>, обработчик onerror=… или javascript:-ссылку).
//
// Режим — переменная CSP_MODE в wrangler.jsonc:
//   "report-only" (по умолчанию) — заголовок Content-Security-Policy-Report-Only: браузер ничего не блокирует,
//                                   только сообщает о нарушениях в /api/csp-report (смотреть в Workers Logs: «[csp]»);
//   "enforce"                    — Content-Security-Policy: нарушения блокируются (включать после недели без нарушений);
//   "off"                        — без script-src (как раньше).
//
// Как устроено: на каждый HTML-ответ — случайный nonce; middleware добавляет его всем <script> страницы,
// которую собрал сервер (весь пользовательский текст на сайте экранируется — тег <script> в нём невозможен).
// 'strict-dynamic' — скрипты, загруженные доверенными (Clerk, модули игры, Turnstile), тоже доверенные.
// https: и 'unsafe-inline' — только запасной вариант для старых браузеров без nonce (современные их игнорируют).

export type CspMode = "report-only" | "enforce" | "off";
export const cspMode = (env: any): CspMode => (env?.CSP_MODE === "enforce" || env?.CSP_MODE === "off" ? env.CSP_MODE : "report-only");

export function newNonce(): string {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  let s = ""; for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "");
}

/** Полная политика для HTML-страниц. */
export function cspPolicy(nonce: string): string {
  return [
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' https: 'unsafe-inline'`,
    "script-src-attr 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self' https://*.clerk.accounts.dev https://clerk.morrisgrad.com https://accounts.morrisgrad.com",
    "report-uri /api/csp-report",
  ].join("; ");
}

/** Добавляет nonce всем открывающим <script …> без nonce. */
export function addNonce(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\snonce=)(?=[\s>])/gi, (m) => `${m} nonce="${nonce}"`);
}

const DIRECTIVE_RE = /^[a-z-]{3,40}$/;
/** Разбор отчёта о нарушении (application/csp-report или application/reports+json) → короткие безопасные записи для журнала. */
export function parseCspReports(body: unknown): Array<{ dir: string; blocked: string; page: string; src: string }> {
  const list: any[] = Array.isArray(body) ? body.map((r: any) => r?.body).filter(Boolean) : body && typeof body === "object" && (body as any)["csp-report"] ? [(body as any)["csp-report"]] : [];
  const clip = (v: any, n = 200) => String(v ?? "").replace(/[\r\n\t]/g, " ").slice(0, n);
  const path = (u: any) => { const s = clip(u, 500); try { const x = new URL(s); return x.origin + x.pathname; } catch { return clip(s, 60); } }; // без ?query (там могут быть токены)
  return list.slice(0, 20).map((r: any) => {
    const dir = clip(r.effectiveDirective || r["effective-directive"] || r.violatedDirective || r["violated-directive"], 40).split(" ")[0];
    return { dir: DIRECTIVE_RE.test(dir) ? dir : "?", blocked: path(r.blockedURL || r["blocked-uri"]), page: path(r.documentURL || r["document-uri"]), src: clip(r.sourceFile || r["source-file"], 120) + (r.lineNumber || r["line-number"] ? ":" + (r.lineNumber || r["line-number"]) : "") };
  });
}
