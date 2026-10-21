// Публичные адреса картинок из R2. Сейчас — служебные домены r2.dev (Cloudflare ограничивает их по частоте и не советует
// для прода); после подключения своих поддоменов в панели Cloudflare (docs/MEDIA_DOMAIN.md) адрес меняется переменными
// AVATARS_PUBLIC_BASE / ART_PUBLIC_BASE в wrangler.jsonc — без правки кода. Старые адреса (r2.dev) в базе продолжают работать,
// пока у бакета включён r2.dev; переписать их на новый домен — tools/r2/avatar-rekey.mjs.
export const R2DEV_AVATARS = "https://pub-c6960920bfb44496a89753f220db1147.r2.dev";
export const R2DEV_ART = "https://pub-becc7b2187614cf1bfb6cabab35271d2.r2.dev";
export const PLANNED_AVATARS = "https://media.morrisgrad.com"; // бакет morrisgrad-avatars
export const PLANNED_ART = "https://art.morrisgrad.com";        // бакет artcollection

const clean = (v: unknown) => { const t = typeof v === "string" ? v.trim().replace(/\/+$/, "") : ""; return /^https:\/\/[a-z0-9.-]+$/i.test(t) ? t : ""; };
export const avatarsBase = (env: any) => clean(env?.AVATARS_PUBLIC_BASE) || R2DEV_AVATARS;
export const artBase = (env: any) => clean(env?.ART_PUBLIC_BASE) || R2DEV_ART;

/** Ключ объекта в бакете аватаров по сохранённому адресу (старый r2.dev или текущий домен); чужой адрес — null. */
export function avatarKeyFromUrl(env: any, url: unknown): string | null {
  if (typeof url !== "string") return null;
  for (const b of new Set([avatarsBase(env), R2DEV_AVATARS, PLANNED_AVATARS])) {
    if (url.startsWith(b + "/")) { const k = url.slice(b.length + 1); return /^[A-Za-z0-9_\-./]{1,200}$/.test(k) && !k.includes("..") ? k : null; }
  }
  return null;
}

/** Новый ключ аватара: случайный, без id игрока (раньше «<id Clerk>-<время>» раскрывал внутренний id в адресе картинки). */
export function newAvatarKey(mime: string, now = new Date()): string {
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mime] || "img";
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  const r = Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `a/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${r}.${ext}`;
}
