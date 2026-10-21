// Переменные и привязки Cloudflare (D1, R2, KV, vars). Astro 6+ убрал Astro.locals.runtime.env (обращение бросает ошибку),
// теперь env берётся из "cloudflare:workers" — это делает middleware и кладёт в locals.cfEnv.
// Тесты (bun) передают свой locals.runtime.env — его читаем только если cfEnv нет (в рабочем коде cfEnv есть всегда).
export function envOf(locals: any): any {
  const e = locals?.cfEnv;
  if (e) return e;
  try { return locals?.runtime?.env || locals?.env || {}; } catch { return {}; }
}
