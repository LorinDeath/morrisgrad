// Свежий вход Орды. Подпись JWT здесь не проверяется: сервер по-прежнему решает, чей это аккаунт.
// Клиент только смотрит срок, чтобы спросить новый токен до зачёта, и не подменяет аккаунт гостем.

export function jwtExp(token: string): number | null {
  const part = String(token || "").split(".")[1];
  if (!part) return null;
  try {
    const pad = part.length % 4 ? "=".repeat(4 - (part.length % 4)) : "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/** Пора обновить токен, если срока нет или до exp меньше lead секунд. */
export function tokenStale(token: string, nowSec: number, lead = 20): boolean {
  if (!token) return true;
  const exp = jwtExp(token);
  if (exp == null) return true;
  return exp < nowSec + lead;
}

export function authKind(err: unknown): "" | "expired" | "invalid" | "jwks" | "out" {
  if (err === "auth_expired") return "expired";
  if (err === "auth_invalid") return "invalid";
  if (err === "auth_jwks") return "jwks";
  if (err === "logged_out") return "out";
  return "";
}

/** Одна повторная попытка со свежим токеном. Пустой токен после обновления — выход, не гость. */
export function planAuthRetry(err: unknown, attempt: number, fresh: boolean): "ok" | "retry" | "logout" {
  const kind = authKind(err);
  if (!kind) return "ok";
  if (kind === "out" || !fresh) return "logout";
  if (attempt >= 1) return "ok";
  return "retry";
}

export function authText(err: string): string {
  if (err === "auth_expired" || err === "auth_invalid") return "Сессия входа истекла. Награда остаётся на аккаунте и в гостя не переписывается. Входим снова.";
  if (err === "auth_jwks") return "Сервер не достал ключи входа. Это не выход из аккаунта. Повторите через секунду.";
  if (err === "logged_out") return "Вы вышли из аккаунта. Забег не записан на гостя. Войдите снова и повторите зачёт.";
  return err;
}
