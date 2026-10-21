// Защита анонимных записей (рекорды, конкурс, чат): лимит запросов с одного IP + (по флагу) Cloudflare Turnstile.
//
// Лимиты: Workers Rate Limiting (привязки RL_SCORES / RL_KONKURS / RL_CHAT в wrangler.jsonc, счёт по IP на стороне Cloudflare,
// IP нигде не сохраняется). Если привязки нет (локальный astro dev, старая конфигурация) — запасной счётчик в памяти воркера
// с теми же лимитами (на один экземпляр; грубее, но лучше, чем ничего).
//
// Turnstile (капча Cloudflare): выключена по умолчанию. Включается переменной TURNSTILE_ENABLED="1" и требует
//   PUBLIC_TURNSTILE_SITE_KEY (var, публичный) и TURNSTILE_SECRET_KEY (secret). Если флаг включён, а ключа нет —
//   запись отклоняется (безопаснее, чем молча пропускать). Клиент получает 403 { turnstile: true, sitekey } и
//   показывает проверку (src/scripts/antiabuse.ts), затем повторяет запрос с заголовком X-Turnstile.

export type Bucket = "scores" | "konkurs" | "chat";
// запросов в минуту с одного IP (период привязок Cloudflare — 60 с; держите в синхроне с wrangler.jsonc)
export const LIMITS: Record<Bucket, number> = { scores: 6, konkurs: 2, chat: 20 };
const BINDING: Record<Bucket, string> = { scores: "RL_SCORES", konkurs: "RL_KONKURS", chat: "RL_CHAT" };

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "local";
}

const mem = new Map<string, number[]>();
export function memLimit(key: string, limit: number, now = Date.now(), windowMs = 60_000): boolean {
  const arr = (mem.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { mem.set(key, arr); return false; }
  arr.push(now); mem.set(key, arr);
  if (mem.size > 5000) { for (const [k, v] of mem) { if (!v.length || now - v[v.length - 1] >= windowMs) mem.delete(k); } }
  return true;
}
export function _resetMem() { mem.clear(); }

/** true — можно; false — лимит исчерпан. */
export async function rateLimit(env: any, bucket: Bucket, request: Request): Promise<boolean> {
  const ip = clientIp(request);
  const b = env?.[BINDING[bucket]];
  if (b && typeof b.limit === "function") {
    try { const { success } = await b.limit({ key: `${bucket}:${ip}` }); return !!success; } catch { /* сбой привязки — запасной счётчик */ }
  }
  return memLimit(`${bucket}:${ip}`, LIMITS[bucket]);
}

export function turnstileOn(env: any): boolean { return env?.TURNSTILE_ENABLED === "1"; }

/** null — проверка пройдена (или выключена); иначе готовый ответ-отказ. */
export async function checkTurnstile(env: any, request: Request, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  if (!turnstileOn(env)) return null;
  const sitekey = typeof env.PUBLIC_TURNSTILE_SITE_KEY === "string" ? env.PUBLIC_TURNSTILE_SITE_KEY : "";
  const secret = typeof env.TURNSTILE_SECRET_KEY === "string" ? env.TURNSTILE_SECRET_KEY : "";
  if (!sitekey || !secret) return json({ error: "Проверка временно недоступна. Попробуйте позже." }, 503);
  const token = request.headers.get("x-turnstile") || "";
  if (!token || token.length > 2048) return json({ error: "Подтвердите, что вы не робот.", turnstile: true, sitekey }, 403);
  try {
    const fd = new FormData();
    fd.append("secret", secret); fd.append("response", token);
    const ip = clientIp(request); if (ip !== "local") fd.append("remoteip", ip);
    const r = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd });
    const j: any = await r.json();
    if (j && j.success === true) return null;
  } catch { /* сеть — отказ */ }
  return json({ error: "Проверка не пройдена, попробуйте ещё раз.", turnstile: true, sitekey }, 403);
}

/** Лимит + Turnstile одной строкой. */
export async function guardAnonWrite(env: any, bucket: Bucket, request: Request): Promise<Response | null> {
  if (!(await rateLimit(env, bucket, request))) return json({ error: "Слишком часто. Подождите минуту и попробуйте снова." }, 429, { "retry-after": "60" });
  return checkTurnstile(env, request);
}

export function json(o: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}
export { envOf } from './cfEnv';
