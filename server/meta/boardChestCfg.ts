// «🎁 Сундуки наград» доски: за сданное задание с рангом (ежедневные/недельные/месячные/испытания/заказы) — сундук.
// Ранг → ярус сундука; ярус ограничивает редкость, зачарование и проклятие. Всё — BCHEST (админка «🎁 Сундуки наград»,
// kind='bchest' id='main' в game_overrides). Здесь — только исходные значения и чистые функции (их же видит клиент:
// шансы в окне сундуков и предпросмотр в админке). Бросок — только сервер (boardChest.ts, cryptoRand).
import { ITEMS, RARITIES as RAR_DEF } from "./defs";
import { ENCH, ENCH_N } from "./enchant";

/** редкости по порядку: common … mythic */
export const BC_RARS: string[] = Object.keys(RAR_DEF).sort((a, b) => RAR_DEF[a].order - RAR_DEF[b].order);
export const BC_TIERS = ["common", "uncommon", "rare", "strange", "cursed", "black"] as const;
export type BcTier = (typeof BC_TIERS)[number];
export const BC_RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS"] as const;
export const BC_CATS = ["daily", "weekly", "monthly", "hard", "hunt"] as const;
/** ключи анимации/иконок художника (/workspace/art/chests → public/mc/chests): редкость или cursed_<редкость> */
export const BC_ART = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "cursed_common", "cursed_uncommon", "cursed_rare", "cursed_epic", "cursed_legendary", "cursed_mythic"];
export type BcTierCfg = { art: string; name: string; color: string; maxRar: string; w: Record<string, number>; enchPct: number; enchMax: number; cursePct: number };
const TC = (art: string, name: string, color: string, maxRar: string, w: Record<string, number>, enchPct: number, enchMax: number, cursePct: number): BcTierCfg =>
  ({ art, name, color, maxRar, w: Object.fromEntries(BC_RARS.map((r) => [r, w[r] || 0])), enchPct, enchMax, cursePct });
export const BCHEST: {
  on: boolean; spread: number; maxStore: number; maxItems: number;
  rankTier: Record<string, BcTier>; rankArt: Record<string, string>; tiers: Record<BcTier, BcTierCfg>; count: Record<string, { min: number; max: number }>;
} = {
  on: true,
  spread: 2,        // уровень вещи = уровень задания ± spread (1…25)
  maxStore: 100,    // сколько неоткрытых/недобранных сундуков хранится; полон — задание с рангом не сдаётся (награда не пропадает)
  maxItems: 60,     // потолок вещей в одном сундуке (страховка от правок «от/до»)
  rankTier: { F: "common", E: "common", D: "uncommon", C: "uncommon", B: "rare", A: "strange", S: "cursed", SS: "black" },
  // вид сундука по рангу (12 рисунков художника); "" — как у яруса (tiers.<ярус>.art). Только внешний вид: содержимое решает ярус
  rankArt: { F: "common", E: "uncommon", D: "rare", C: "epic", B: "legendary", A: "mythic", S: "cursed_legendary", SS: "cursed_mythic" },
  tiers: {
    //          имя                     цвет       макс. редкость  веса редкостей                                              зач.%  ярус≤ прокл.%
    common:   TC("common", "Простой сундук",       "#a8a29e", "uncommon",  { common: 70, uncommon: 30 },                                  0,  0, 0),
    uncommon: TC("uncommon", "Добротный сундук",     "#4ade80", "rare",      { common: 40, uncommon: 45, rare: 15 },                        8,  1, 0),
    rare:     TC("rare", "Редкий сундук",        "#3b82f6", "epic",      { common: 15, uncommon: 40, rare: 35, epic: 10 },              15, 2, 0),
    strange:  TC("epic", "Странный сундук",      "#ec4899", "legendary", { uncommon: 25, rare: 40, epic: 28, legendary: 7 },            25, 3, 3),
    cursed:   TC("cursed_legendary", "Проклятый сундук",     "#ef4444", "mythic",    { rare: 35, epic: 40, legendary: 18, mythic: 7 },              35, 5, 25),
    black:    TC("cursed_mythic", "Чёрный проклятый сундук", "#1c1917", "mythic", { rare: 15, epic: 40, legendary: 30, mythic: 15 },             50, 6, 60),
  },
  count: { daily: { min: 1, max: 3 }, weekly: { min: 3, max: 7 }, monthly: { min: 10, max: 30 }, hard: { min: 1, max: 5 }, hunt: { min: 1, max: 5 } },
};
export const BC_CAT_NAMES: Record<string, string> = { daily: "Ежедневное", weekly: "Недельное", monthly: "Месячное", hard: "Испытание", hunt: "Заказ" };
export const rarIdx = (r: string) => Math.max(0, BC_RARS.indexOf(r));
/** ключ рисунка сундука: по рангу (rankArt), иначе по ярусу */
export function artOf(tier: BcTier, rank?: string): string { const r = rank ? BCHEST.rankArt?.[rank] : ""; if (r && BC_ART.includes(r)) return r; const a = BCHEST.tiers[tier]?.art; return a && BC_ART.includes(a) ? a : "common"; }
export const tierOfRank = (rank: string): BcTier | null => { const t = BCHEST.rankTier[rank]; return t && BCHEST.tiers[t] ? t : null; };
export function countOf(cat: string): [number, number] {
  const c = BCHEST.count[cat] || BCHEST.count.daily, M = Math.max(1, BCHEST.maxItems | 0 || 60);
  const lo = Math.max(1, Math.min(M, c.min | 0)), hi = Math.max(lo, Math.min(M, c.max | 0));
  return [lo, hi];
}
const lvlOf = (L: number) => Math.max(1, Math.min(25, Math.round(L) || 1));
// пул: только трофеи монстров (как дроп в мире); ремесло/старт — нет
const POOL = () => ITEMS.filter((i) => i.monster && i.slot);
/** Вещи нужной редкости в окне уровней L ± s (строго). */
export function candidates(rar: string, L: number, s = BCHEST.spread): { ids: string[]; lo: number; hi: number } {
  const l = lvlOf(L), lo = Math.max(1, l - Math.max(0, s | 0)), hi = Math.min(25, l + Math.max(0, s | 0));
  return { ids: POOL().filter((i) => i.rarity === rar && (i.lvl || 1) >= lo && (i.lvl || 1) <= hi).map((i) => i.id), lo, hi };
}
/** Реальные шансы редкости для яруса и уровня. Нет вещей этой редкости в окне ±spread — её вес уходит на ближайшую
 *  младшую, где вещи есть (выше «макс. редкости» — никогда). Совсем пусто — окно расширяется на 1, пока не найдётся. */
export function rarOdds(tier: BcTier, L: number): { odds: Record<string, number>; s: number } {
  const T = BCHEST.tiers[tier]; if (!T) return { odds: {}, s: 0 };
  const cap = rarIdx(T.maxRar || "common");
  for (let s = Math.max(0, BCHEST.spread | 0); s <= 24; s++) {
    const out: Record<string, number> = {}; let sum = 0;
    for (let i = 0; i <= cap; i++) {
      const w = Math.max(0, Number(T.w[BC_RARS[i]]) || 0); if (!w) continue;
      let j = i; while (j >= 0 && !candidates(BC_RARS[j], L, s).ids.length) j--;
      if (j < 0) continue;
      out[BC_RARS[j]] = (out[BC_RARS[j]] || 0) + w; sum += w;
    }
    if (!sum) continue;
    for (const k of Object.keys(out)) out[k] = Math.round((out[k] / sum) * 1000) / 10;
    return { odds: out, s };
  }
  return { odds: {}, s: 0 };
}
/** Ярусы зачарования, доступные сундуку (1…enchMax), с весами ENCH.spawnPct → % от «зачарована». */
export function enchOdds(tier: BcTier): Record<number, number> {
  const T = BCHEST.tiers[tier], mx = Math.max(0, Math.min(ENCH_N, (T?.enchMax | 0) || 0)), out: Record<number, number> = {};
  if (!T || !mx || !(T.enchPct > 0) || ENCH.on === false) return out;
  const ws = ENCH.tiers.slice(0, mx).map((t) => Math.max(0, Number(t.spawnPct) || 0)), sum = ws.reduce((s, w) => s + w, 0) || 1;
  ws.forEach((w, i) => { if (w > 0) out[i + 1] = Math.round((w / sum) * 1000) / 10; });
  return out;
}
/** Сводка шансов для окна и админки. */
export function chestOdds(tier: BcTier, L: number, cat: string) {
  const T = BCHEST.tiers[tier]; const [cmin, cmax] = countOf(cat), l = lvlOf(L), ro = rarOdds(tier, L), s = ro.s;
  return { tier, art: BC_ART.includes(T?.art) ? T.art : "common", name: T?.name || tier, color: T?.color || "#999", L: l, lo: Math.max(1, l - s), hi: Math.min(25, l + s), cmin, cmax,
    rar: ro.odds, enchPct: ENCH.on === false ? 0 : Math.max(0, Math.min(100, Number(T?.enchPct) || 0)), ench: enchOdds(tier),
    cursePct: Math.max(0, Math.min(100, Number(T?.cursePct) || 0)) };
}
/** Бросок содержимого (rnd — ГСЧ; сервер передаёт cryptoRand). Возвращает [{id,c?,e?}]. */
export function rollItems(tier: BcTier, L: number, cat: string, rnd: () => number): { id: string; c?: 1; e?: number }[] {
  const T = BCHEST.tiers[tier]; if (!T) return [];
  const [lo, hi] = countOf(cat), n = lo + Math.floor(rnd() * (hi - lo + 1));
  const { odds, s } = rarOdds(tier, L), keys = Object.keys(odds), sum = keys.reduce((s, k) => s + odds[k], 0);
  const eo = enchOdds(tier), ek = Object.keys(eo).map(Number), es = ek.reduce((s, k) => s + eo[k], 0);
  const out: { id: string; c?: 1; e?: number }[] = [];
  for (let k = 0; k < n && keys.length && sum > 0; k++) {
    let x = rnd() * sum, rar = keys[keys.length - 1];
    for (const r of keys) { if (x < odds[r]) { rar = r; break; } x -= odds[r]; }
    const ids = candidates(rar, L, s).ids; if (!ids.length) continue;
    const id = ids[Math.floor(rnd() * ids.length)], o: { id: string; c?: 1; e?: number } = { id };
    if (ek.length && rnd() * 100 < (Number(T.enchPct) || 0)) { let y = rnd() * es; o.e = ek[ek.length - 1]; for (const t of ek) { if (y < eo[t]) { o.e = t; break; } y -= eo[t]; } }
    if (rnd() * 100 < (Number(T.cursePct) || 0)) o.c = 1;
    out.push(o);
  }
  return out;
}
/** Проверка правки админки (после наложения): ошибки «от > до», макс. редкость ниже всех весов и т.п. */
export function bchestErr(get: (p: string) => any): string | null {
  for (const c of BC_CATS) { const lo = Number(get(`count.${c}.min`)), hi = Number(get(`count.${c}.max`)); if (lo > hi) return `${BC_CAT_NAMES[c]}: «вещей от» больше «до»`; }
  for (const t of BC_TIERS) {
    const cap = rarIdx(String(get(`tiers.${t}.maxRar`))); let any = false;
    for (let i = 0; i <= cap; i++) if ((Number(get(`tiers.${t}.w.${BC_RARS[i]}`)) || 0) > 0) any = true;
    if (!any) return `${BCHEST.tiers[t].name}: нужен хотя бы один вес редкости не выше «макс. редкости»`;
  }
  return null;
}
// ---- админка: предпросмотр шансов с НЕсохранёнными значениями формы (считает сервер — у клиента нет таблиц предметов) ----
const BAD_KEY = /(^|\.)(__proto__|constructor|prototype)(\.|$)/;
const getP0 = (o: any, p: string) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
function setP0(o: any, p: string, v: any) { const ks = p.split("."); let x = o; for (let i = 0; i < ks.length - 1; i++) { if (x[ks[i]] == null || typeof x[ks[i]] !== "object") return; x = x[ks[i]]; } if (ks[ks.length - 1] in x) x[ks[ks.length - 1]] = v; }
function restoreInto(t: any, s: any) { for (const k of Object.keys(t)) if (!(k in s)) delete t[k]; for (const [k, v] of Object.entries(s)) { if (v && typeof v === "object" && t[k] && typeof t[k] === "object") restoreInto(t[k], v); else t[k] = v; } }
/** Шансы и пример содержимого всех ярусов для уровня L и раздела cat; patch — значения формы поверх текущих (не сохраняются). */
export function bchestPreview(patch: Record<string, any>, L: number, cat: string, rnd: () => number = Math.random) {
  L = Math.max(1, Math.min(25, Math.round(Number(L)) || 1)); if (!(BC_CATS as readonly string[]).includes(cat)) cat = "daily";
  const save = JSON.parse(JSON.stringify(BCHEST));
  try {
    for (const [p, v] of Object.entries(patch || {}).slice(0, 400)) if (/^[\w.]{1,60}$/.test(p) && !BAD_KEY.test(p) && ["number", "string", "boolean"].includes(typeof v) && getP0(BCHEST, p) !== undefined) setP0(BCHEST, p, v);
    const err = bchestErr((p) => getP0(BCHEST, p)); if (err) return { ok: false, err };
    const rank: Record<string, string[]> = {}; for (const [r, t] of Object.entries(BCHEST.rankTier)) (rank[t] ||= []).push(r);
    return { ok: true, L, cat, tiers: BC_TIERS.map((t) => { const o = chestOdds(t, L, cat);
      const sample = rollItems(t, L, cat, rnd).map((x) => { const d: any = ITEMS.find((i: any) => i.id === x.id) || {}; return { id: x.id, name: d.name || x.id, rarity: d.rarity, lvl: d.lvl || 1, c: x.c, e: x.e }; });
      return { ...o, ranks: rank[t] || [], sample }; }) };
  } finally { restoreInto(BCHEST, save); }
}
