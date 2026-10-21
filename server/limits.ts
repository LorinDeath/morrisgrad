// Ограничения входящих WebSocket-сообщений (общие для всех типов) и проверка dev-режима.
export const MSG_MAX_CHARS = 64 * 1024; // крупнейшее легитимное — ретрансляция забега/админ-правка (< 24 КБ)
export const MSG_RATE = 60; // сообщений/с в среднем (движение ~20/с + действия)
export const MSG_BURST = 120;
export const MSG_STRIKES_CLOSE = 200; // столько отброшенных сообщений подряд по флуду/размеру — закрыть сокет

export type Lim = { tokens: number; at: number; strikes: number };
export function admitMessage(l: Lim, raw: unknown, now: number): "ok" | "drop" | "close" {
  l.tokens = Math.min(MSG_BURST, l.tokens + ((now - l.at) / 1000) * MSG_RATE); l.at = now;
  const bad = typeof raw !== "string" || raw.length > MSG_MAX_CHARS || l.tokens < 1;
  if (bad) { l.strikes++; return l.strikes >= MSG_STRIKES_CLOSE ? "close" : "drop"; }
  l.tokens -= 1; if (l.strikes > 0) l.strikes--;
  return "ok";
}
const DEV_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
export function isDevRequest(env: any, request: { url: string }): boolean {
  if (env?.MC_DEV_TRUST_USERID !== "1") return false;
  try { return DEV_HOSTS.has(new URL(request.url).hostname); } catch { return false; }
}

// Откуда разрешено подключаться к игре (WebSocket) и для какого сайта выпущен токен Clerk (JWT azp).
// Единственный домен — morrisgrad.com (+ www на будущее). Переопределение: env MC_ALLOWED_ORIGINS="https://a,https://b".
// localhost/127.0.0.1 разрешены только когда и сам игровой сервер локальный (wrangler dev) — плейтесты не ломаются,
// а прод сайты с localhost не принимает.
export const DEFAULT_ALLOWED_ORIGINS = ["https://morrisgrad.com", "https://www.morrisgrad.com"];
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
export function isLocalRequest(request: { url: string }): boolean {
  try { return DEV_HOSTS.has(new URL(request.url).hostname); } catch { return false; }
}
export function allowedOrigins(env: any): string[] {
  const raw = typeof env?.MC_ALLOWED_ORIGINS === "string" && env.MC_ALLOWED_ORIGINS.trim() ? env.MC_ALLOWED_ORIGINS : "";
  return raw ? raw.split(",").map((x: string) => x.trim().replace(/\/+$/, "")).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
}
export function originAllowed(env: any, origin: string | null | undefined, local: boolean): boolean {
  if (!origin) return local; // браузер всегда шлёт Origin; без него — только локальные тесты (node ws)
  const o = String(origin).replace(/\/+$/, "");
  if (allowedOrigins(env).includes(o)) return true;
  return local && LOCAL_ORIGIN.test(o);
}
