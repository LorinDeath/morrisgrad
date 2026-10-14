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
