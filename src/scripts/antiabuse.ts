// Клиент: отправка анонимной записи с поддержкой Turnstile. Пока флаг TURNSTILE_ENABLED выключен, сервер не просит
// проверку и это обычный fetch. Если сервер ответил 403 { turnstile: true, sitekey } — показываем окно проверки
// Cloudflare и повторяем запрос с заголовком X-Turnstile.
let scriptP: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if ((window as any).turnstile) return Promise.resolve();
  if (!scriptP) scriptP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => res(); s.onerror = () => { scriptP = null; rej(new Error("turnstile")); };
    document.head.append(s);
  });
  return scriptP;
}
function askToken(sitekey: string): Promise<string | null> {
  return loadScript().then(() => new Promise<string | null>((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("style", "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#ddd;font:15px system-ui");
    const t = document.createElement("div"); t.textContent = "Подтвердите, что вы не робот";
    const box = document.createElement("div");
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Отмена";
    cancel.setAttribute("style", "background:#222;color:#ddd;border:1px solid #555;padding:6px 14px;border-radius:6px;cursor:pointer");
    wrap.append(t, box, cancel); document.body.append(wrap);
    const done = (v: string | null) => { wrap.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    (window as any).turnstile.render(box, { sitekey, theme: "dark", language: "ru", callback: (tok: string) => done(tok), "error-callback": () => done(null) });
  })).catch(() => null);
}
export async function anonPost(url: string, body: unknown): Promise<Response> {
  const init = (tok?: string): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { "X-Turnstile": tok } : {}) }, body: JSON.stringify(body) });
  const res = await fetch(url, init());
  if (res.status !== 403) return res;
  let j: any = null; try { j = await res.clone().json(); } catch { return res; }
  if (!j?.turnstile || typeof j.sitekey !== "string") return res;
  const tok = await askToken(j.sitekey);
  return tok ? fetch(url, init(tok)) : res;
}
