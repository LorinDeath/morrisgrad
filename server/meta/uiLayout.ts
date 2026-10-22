// Раскладка интерфейса игрока (перетаскивание блоков HUD и окон, ui/uiDrag.js) — хранится в аккаунте (accounts.data JSON → a.uiLay),
// отдельно для ПК и телефона: { pc?: Lay, mob?: Lay }, Lay = { off: { id: [dx, dy] }, lock?: 1, at }.
// dx/dy — сдвиг блока от его места по умолчанию в долях окна (−1…1): на другом размере экрана блок сдвигается пропорционально,
// а клиент всё равно держит блок целиком в окне. Сервер принимает только известные id и конечные числа; без миграции D1.
export const UI_LAY_IDS = [
  "pframe", "pfmob", "tracker", "abar", "xp", "party", "mm", "tgt", "chat", "toasts", "btns", "dps",
  "book", "char", "soc", "altar", "loot", "chest", "bchest", "upg", "board", "map",
] as const;
const IDS = new Set<string>(UI_LAY_IDS);
export const UI_LAY_DEVS = ["pc", "mob"] as const;
export const UI_LAY_MAX = 40;       // записей в одной раскладке
export const UI_LAY_BYTES = 2048;   // JSON одной раскладки
export const UI_LAY_RATE_MS = 700;  // не чаще раза в N мс на сессию (клиент шлёт по отпусканию блока)
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** разобрать присланную раскладку: null — отказ (не тот тип/слишком большая); неизвестные id и не-числа — молча выкинуть */
export function cleanLayout(dev: unknown, lay: unknown, lock?: unknown, now = Date.now()): { dev: "pc" | "mob"; lay: any } | null {
  if (dev !== "pc" && dev !== "mob") return null;
  if (!lay || typeof lay !== "object" || Array.isArray(lay)) return null;
  const keys = Object.keys(lay as any);
  if (keys.length > UI_LAY_MAX) return null;
  let raw = ""; try { raw = JSON.stringify(lay); } catch { return null; }
  if (raw.length > UI_LAY_BYTES) return null;
  const off: Record<string, [number, number]> = {};
  for (const k of keys) {
    if (!IDS.has(k)) continue;
    const v = (lay as any)[k];
    if (!Array.isArray(v) || v.length !== 2) continue;
    const [x, y] = v;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) continue;
    if (Math.abs(x) < 1e-4 && Math.abs(y) < 1e-4) continue; // на месте по умолчанию — не храним
    off[k] = [r4(x), r4(y)];
  }
  const out: any = { off, at: now };
  if (lock === true) out.lock = 1;
  return { dev, lay: out };
}
/** раскладка аккаунта для клиента (из хранилища — тоже через фильтр: старые/чужие данные не ломают интерфейс) */
export function layoutView(a: any): Record<string, any> | null {
  const L = a?.uiLay; if (!L || typeof L !== "object") return null;
  const out: any = {};
  for (const d of UI_LAY_DEVS) { const v = L[d]; if (!v || typeof v !== "object") continue; const c = cleanLayout(d, v.off || {}, v.lock === 1 || v.lock === true, Number(v.at) || 0); if (c) out[d] = c.lay; }
  return Object.keys(out).length ? out : null;
}
