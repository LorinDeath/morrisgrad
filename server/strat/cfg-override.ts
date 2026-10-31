// G (t1209): «Партия Чёрных королей → Цели и лиги» — правки по лиге из админки (D1 strat_cfg_override, key "league:<size>").
// Правка превращается в обычный deepMerge-патч поверх STRAT_CFG и уходит в L.cfgPatch → снимок партии, лог повтора (log.patch) и клиент
// (подсказки целей, Библиотека в партии) берут числа из состояния партии, а не из клиентского cfg. Идущие партии не меняются.
import { leagueOf } from "./rating";

export const OV_SIZES = [8, 15, 35] as const;
export type OvSize = (typeof OV_SIZES)[number];
type F = { name: string; min: number; max: number; int?: boolean; get: (c: any, n: number) => number; put: (p: any, n: number, v: number) => void };
const G = (n: number, f: string) => (p: any) => (((p.goals ??= {}).sizes ??= {})[n] ??= {});
const lg = (n: number) => leagueOf(n) || "quick";
/** Поля и границы (t1209): золото 1…100000, доля 0,05…0,9, лимит 10…1000, need 1…5, множители 0,05…5. */
export const OV_FIELDS: Record<string, F> = {
  need: { name: "Целей для победы", min: 1, max: 6, int: true, get: (c, n) => c.goals.sizes[n].need, put: (p, n, v) => { G(n, "")(p).need = v; } },
  turnLimit: { name: "Лимит ходов", min: 10, max: 1000, int: true, get: (c, n) => c.sizes[n].turnLimit, put: (p, n, v) => { ((p.sizes ??= {})[n] ??= {}).turnLimit = v; } },
  holdK: { name: "Твердыня: очков", min: 1, max: 100, int: true, get: (c, n) => c.goals.sizes[n].holdK, put: (p, n, v) => { G(n, "")(p).holdK = v; } },
  holdTurns: { name: "Твердыня: ходов подряд", min: 1, max: 1000, int: true, get: (c, n) => c.goals.sizes[n].holdTurns, put: (p, n, v) => { G(n, "")(p).holdTurns = v; } },
  gold: { name: "Казна: запас золота", min: 1, max: 100000, int: true, get: (c, n) => c.goals.sizes[n].gold, put: (p, n, v) => { G(n, "")(p).gold = v; } },
  share: { name: "Держава: доля земли", min: 0.05, max: 0.9, get: (c, n) => c.goals.sizes[n].share, put: (p, n, v) => { G(n, "")(p).share = v; } },
  wonderGold: { name: "Чудо: золото", min: 1, max: 100000, int: true, get: (c, n) => c.goals.sizes[n].wonderGold, put: (p, n, v) => { G(n, "")(p).wonderGold = v; } },
  wonderKnow: { name: "Чудо: знания", min: 1, max: 100000, int: true, get: (c, n) => c.goals.sizes[n].wonderKnow, put: (p, n, v) => { G(n, "")(p).wonderKnow = v; } },
  glory: { name: "Слава: порог (6-я цель)", min: 1, max: 100000, int: true, get: (c, n) => c.econ.sizes[n].glory, put: (p, n, v) => { (((p.econ ??= {}).sizes ??= {})[n] ??= {}).glory = v; } },
  xp: { name: "Опыт ×", min: 0.05, max: 5, get: (c, n) => c.econ.league[lg(n)].xp, put: (p, n, v) => { (((p.econ ??= {}).league ??= {})[lg(n)] ??= {}).xp = v; } },
  winA: { name: "Рейтинг победителю: a (K·(a−b·d))", min: 0.05, max: 5, get: (c, n) => c.goals.sizes[n].rate.winA, put: (p, n, v) => { (G(n, "")(p).rate ??= {}).winA = v; } },
  winB: { name: "Рейтинг победителю: b", min: 0, max: 1, get: (c, n) => c.goals.sizes[n].rate.winB, put: (p, n, v) => { (G(n, "")(p).rate ??= {}).winB = v; } },
  loseA: { name: "Рейтинг проигравшему: a (K·(a+b·d))", min: 0.05, max: 5, get: (c, n) => c.goals.sizes[n].rate.loseA, put: (p, n, v) => { (G(n, "")(p).rate ??= {}).loseA = v; } },
  loseB: { name: "Рейтинг проигравшему: b", min: 0, max: 1, get: (c, n) => c.goals.sizes[n].rate.loseB, put: (p, n, v) => { (G(n, "")(p).rate ??= {}).loseB = v; } },
};
export const ovKey = (n: number) => "league:" + n;
export const isOvSize = (n: any): n is OvSize => (OV_SIZES as readonly number[]).includes(n);

/** Проверка правки одной лиги. Неизвестное поле, не число, вне границ, дробное там, где нужно целое — ошибка с объяснением. */
export function validateOverride(size: any, body: any): { ok: true; val: Record<string, number> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isOvSize(size)) return { ok: false, errors: [`размер ${size}: можно только ${OV_SIZES.join(", ")}`] };
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: ["тело — объект {поле: число}"] };
  const val: Record<string, number> = {};
  for (const [k, v] of Object.entries(body)) {
    const f = OV_FIELDS[k]; if (!f) { errors.push(`${k}: неизвестное поле (можно: ${Object.keys(OV_FIELDS).join(", ")})`); continue; }
    if (typeof v !== "number" || !Number.isFinite(v)) { errors.push(`${k} (${f.name}): нужно число`); continue; }
    if (v < f.min || v > f.max) { errors.push(`${k} (${f.name}): ${v} вне границ ${f.min}…${f.max}`); continue; }
    if (f.int && !Number.isInteger(v)) { errors.push(`${k} (${f.name}): нужно целое`); continue; }
    val[k] = v;
  }
  if (!errors.length && !Object.keys(val).length) errors.push("нет полей для сохранения");
  return errors.length ? { ok: false, errors } : { ok: true, val };
}
/** Правки всех лиг → deepMerge-патч. rows: { "league:8": {gold: 200}, … } */
export function overridePatch(rows: Record<string, Record<string, number>>): any {
  const p: any = {};
  for (const n of OV_SIZES) { const r = rows[ovKey(n)]; if (!r) continue;
    for (const [k, v] of Object.entries(r)) { const f = OV_FIELDS[k]; if (f && typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max) f.put(p, n, v); } }
  return p;
}
/** Текущие значения лиги (для админки). */
export function leagueValues(cfg: any, n: number): Record<string, number> { const o: Record<string, number> = {}; for (const [k, f] of Object.entries(OV_FIELDS)) try { o[k] = f.get(cfg, n); } catch {} return o; }
/** Слить два патча (правка правил админки + правки лиг; лиги поверх). */
export function mergePatch(a: any, b: any): any {
  if (!b || typeof b !== "object") return a; if (!a || typeof a !== "object") return b;
  const o: any = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object" ? mergePatch(o[k], v) : v; return o;
}
