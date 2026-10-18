import { isPrivatePath } from "./seo";

const CLERK_COOKIE = /(?:^|;\s*)__(?:session|client_uat|clerk|refresh)/;
export function isCookielessPublicGet(method: string, path: string, cookie: string | null, search: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (isPrivatePath(path)) return false;
  if (cookie && CLERK_COOKIE.test(cookie)) return false;
  if (/[?&]__clerk/.test(search)) return false;
  return true;
}
