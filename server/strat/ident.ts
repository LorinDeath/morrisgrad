// Кто подключился к «Партии Чёрных королей»: тот же аккаунт сайта (Clerk JWT, verifyClerkTokenEx + azp), гость — без опыта.
// MC_DEV_TRUST_USERID=1 (только .dev.vars) + localhost — доверять userId без токена (плейтесты); на проде не активируется.
import { verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { isDevRequest, isLocalRequest, originAllowed } from "../limits";

export type Ident = { pkey: string; nick: string; verified: boolean };

const NICK_RE = /^[\p{L}\p{N}_\- ]{2,16}$/u;
export function cleanNick(s: unknown): string {
  const t = typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
  return NICK_RE.test(t) ? t : "";
}
async function sha16(s: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...b.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function siteNick(env: any, uid: string): Promise<string> {
  try { const r: any = await env.GAME_DB?.prepare("SELECT username FROM users WHERE id = ?").bind(uid).first(); return cleanNick(r?.username) || ""; } catch { return ""; }
}

/** reqUrl — URL исходного WS-запроса (для dev-проверки и azp localhost). */
export async function identify(env: any, reqUrl: string, msg: any): Promise<Ident | { err: string }> {
  const local = isLocalRequest({ url: reqUrl });
  if (typeof msg?.token === "string" && msg.token) {
    const chk = await verifyClerkTokenEx(msg.token, env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(env, azp, local));
    if (!chk.uid) return { err: "auth_" + (chk.reason || "invalid") };
    return { pkey: chk.uid, nick: (await siteNick(env, chk.uid)) || cleanNick(msg.nick) || "Полководец", verified: true };
  }
  if (typeof msg?.userId === "string" && msg.userId && isDevRequest(env, { url: reqUrl })) {
    const uid = msg.userId.slice(0, 64);
    return { pkey: uid, nick: (await siteNick(env, uid)) || cleanNick(msg.nick) || "Игрок-" + uid.slice(-4), verified: true };
  }
  if (typeof msg?.guest === "string" && msg.guest.length >= 16 && msg.guest.length <= 64) {
    const h = await sha16(msg.guest);
    return { pkey: "guest:" + h, nick: cleanNick(msg.nick) || "Гость-" + h.slice(0, 4), verified: false };
  }
  return { err: "no_ident" };
}
