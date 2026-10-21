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

/** isParty(azp) — для какого сайта выпущен токен (claim azp = Origin страницы, где Clerk выдал токен).
 *  Если передана — токен без azp или с чужим azp не принимается (токен, украденный/выпущенный на другом сайте). */
export async function verifyClerkToken(token: string, issuer = DEFAULT_CLERK_ISSUER, isParty?: (azp: string) => boolean): Promise<string | null> {
  try {
    const [h, p, s] = String(token || "").split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    if (header.alg !== "RS256") return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now - 5) return null; // без exp — отказ (вечный токен не принимаем)
    if (typeof payload.nbf === "number" && payload.nbf > now + 5) return null;
    if (payload.iss !== issuer) return null;
    if (isParty && (typeof payload.azp !== "string" || !isParty(payload.azp))) return null;
    const keys = await getJwks(issuer);
    const jwk = keys.find((k) => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s) as any, new TextEncoder().encode(`${h}.${p}`) as any);
    return ok && typeof payload.sub === "string" ? payload.sub : null;
  } catch (_) {
    return null;
  }
}
