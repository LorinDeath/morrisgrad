// Проверка личности игрока для серверного профиля.
// Клиент присылает в join токен сессии Clerk (JWT, RS256). Сервер проверяет подпись по публичным
// ключам JWKS издателя, срок действия и издателя; userId = sub. Без валидного токена игрок — гость:
// его прогресс хранится под ключом «guest:<ник>» и помечается как непроверенный.
// Локальная разработка: MC_DEV_TRUST_USERID=1 (только .dev.vars) — доверять userId из join без токена.

export const DEFAULT_CLERK_ISSUER = "https://mighty-starling-68.clerk.accounts.dev";

let jwksCache: { at: number; keys: any[] } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getJwks(issuer: string): Promise<any[]> {
  if (jwksCache && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new Error("jwks " + res.status);
  const j: any = await res.json();
  jwksCache = { at: Date.now(), keys: j.keys || [] };
  return jwksCache.keys;
}

export async function verifyClerkToken(token: string, issuer = DEFAULT_CLERK_ISSUER): Promise<string | null> {
  return (await verifyClerkTokenEx(token, issuer)).uid;
}

/** как verifyClerkToken, но с причиной отказа: expired — истёк, invalid — подпись/издатель/формат, jwks — не смогли получить ключи (сбой у нас/сети, не вина игрока) */
export type TokenCheck = { uid: string | null; reason?: "expired" | "invalid" | "jwks" };
export async function verifyClerkTokenEx(token: string, issuer = DEFAULT_CLERK_ISSUER): Promise<TokenCheck> {
  let header: any, payload: any, h: string, p: string, s: string;
  try {
    [h, p, s] = String(token || "").split(".");
    if (!h || !p || !s) return { uid: null, reason: "invalid" };
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch (_) { return { uid: null, reason: "invalid" }; }
  if (header.alg !== "RS256" || payload.iss !== issuer) return { uid: null, reason: "invalid" };
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now - 5) return { uid: null, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now + 5) return { uid: null, reason: "invalid" };
  let keys: any[];
  try { keys = await getJwks(issuer); } catch (_) { return { uid: null, reason: "jwks" }; }
  try {
    const jwk = keys.find((k) => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
    if (!jwk) return { uid: null, reason: "invalid" };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s) as any, new TextEncoder().encode(`${h}.${p}`) as any);
    return ok && typeof payload.sub === "string" ? { uid: payload.sub } : { uid: null, reason: "invalid" };
  } catch (_) { return { uid: null, reason: "invalid" }; }
}
