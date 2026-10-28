// «🎁 Сундуки наград» доски: за сданное задание с рангом (ежедневные/недельные/месячные/испытания/заказы) — сундук.
// Ранг → ярус сундука; ярус ограничивает редкость, зачарование и проклятие. Всё — BCHEST (админка «🎁 Сундуки наград»,
// kind='bchest' id='main' в game_overrides). Здесь — только исходные значения и чистые функции (их же видит клиент:
// шансы в окне сундуков и предпросмотр в админке). Бросок — только сервер (boardChest.ts, cryptoRand).
import { ITEMS, RARITIES as RAR_DEF, BALANCE } from "./defs";
import { CURSE } from "./cursed";
import { ENCH, ENCH_N } from "./enchant";

/** редкости по порядку: common … mythic */
export const BC_RARS: string[] = Object.keys(RAR_DEF).sort((a, b) => RAR_DEF[a].order - RAR_DEF[b].order);
// ярусы сундука 1:1 с ярусами зачарования (enchant.ts): простой — без чар, добротный — не выше «Необычный», … чёрный — до «Чёрный»
export const BC_TIERS = ["common", "uncommon", "rare", "strange", "legendary", "divine", "black"] as const;
export type BcTier = (typeof BC_TIERS)[number];
/** жёсткий потолок яруса зачарования для яруса сундука (номер яруса ENCH: 0 — без чар … 6 — «Чёрный»); enchMax админки — только ниже */
export const BC_ENCH_CAP: Record<BcTier, number> = { common: 0, uncommon: 1, rare: 2, strange: 3, legendary: 4, divine: 5, black: 6 };
export const BC_RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS"] as const;
export const BC_CATS = ["daily", "weekly", "monthly", "hard", "hunt"] as const;
/** жёсткий потолок шанса проклятого варианта сундука для любого ранга, % (сервер режет и сохранённые правки; админка не даёт больше) */
export const BC_CURSE_MAX = 30;
/** прежние значения rankCurse по умолчанию (до инверсии) — сохранённые с формой админки строки сбрасываются на новые значения */
export const BC_CURSE_OLD: Record<string, number> = { F: 0, E: 2, D: 4, C: 6, B: 9, A: 14, S: 25, SS: 100 };
/** миграция сохранённой правки «Сундуки» (D1 game_overrides) при загрузке: старое значение по умолчанию — убрать (действует новое),
 *  любое другое выше потолка — до BC_CURSE_MAX. Возвращает новую правку и список изменений (для журнала). */
export function migrateBchestPatch(patch: any): { patch: any; changed: string[] } {
  const changed: string[] = []; if (!patch || typeof patch !== "object") return { patch, changed };
  const out: any = { ...patch };
  for (const [k, v] of Object.entries(patch)) { const m = /^rankCurse\.(\w+)$/.exec(k); if (!m) continue; const n = Number(v);
    if (BC_CURSE_OLD[m[1]] === n && n !== BCHEST.rankCurse[m[1]]) { delete out[k]; changed.push(`${k}: ${n} → по умолчанию`); }
    else if (n > BC_CURSE_MAX) { out[k] = BC_CURSE_MAX; changed.push(`${k}: ${n} → ${BC_CURSE_MAX}`); } }
  return { patch: out, changed };
}
/** ключи анимации/иконок художника (/workspace/art/chests → public/mc/chests): редкость или cursed_<редкость> */
export const BC_ART = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "cursed_common", "cursed_uncommon", "cursed_rare", "cursed_epic", "cursed_legendary", "cursed_mythic"];
// ОСНОВА — ОБЩИЕ таблицы игры (не таблицы конкретных мобов):
//  • редкость: BALANCE.DROP_PCT — общий шанс дропа экипировки моба по редкости (обычный 5.5 % … мифический 0.12 %);
//    каждая вещь пула весит DROP_PCT[её редкость] × boost^(номер редкости) — ярус сундука сдвигает шансы вверх;
//  • проклятие: доля проклятых копий в дропе проклятого босса = itemChanceMult / (mobDropMult + itemChanceMult)
//    (админка «☠ Проклятие»), × curseMult яруса — множитель по «шансам» (odds), чтобы не упираться в 100 %;
//  • зачарование: шанс зачарованного моба Σ spawnPct ярусов (админка «✦ Зачарование») × enchMult (тоже по odds); ярус — по весам
//    spawnPct × enchBoost^(ярус−1), не выше enchMax (6 — «Чёрный»: проклятая + Чёрный = чёрная проклятая вещь);
//  • очернение (Чёрный маг) — свой слой: blkPct % вещей очернены на blkMin…blkMax %, распределение min+(max−min)·u^blkCurve.
// Пул вещей — ВСЯ экипировка игры с уровнем в окне L ± spread (любой моб/биом/ремесло), в пределах редкостей яруса.
// У КАЖДОГО яруса — обычный и ПРОКЛЯТЫЙ вариант (artC/nameC, проклятие × cCurseMult вместо curseMult); потолок чар — тот же.
// Проклят ли сундук — отдельный бросок по рангу (rankCurse, %). dark — тёмный тон рисунка (у «Чёрного»: своего листа у художника нет).
export type BcTierCfg = { art: string; name: string; color: string; minRar: string; maxRar: string; boost: number;
  enchMult: number; enchMax: number; enchBoost: number; curseMult: number; blkPct: number; blkMin: number; blkMax: number; blkCurve: number;
  artC: string; nameC: string; cCurseMult: number; dark: boolean };
const TC = (art: string, name: string, color: string, minRar: string, maxRar: string, boost: number, enchMult: number, enchMax: number, enchBoost: number,
  curseMult: number, blkPct: number, blkMin: number, blkMax: number, artC: string, nameC: string, cCurseMult: number, dark = false, blkCurve = 2.5): BcTierCfg =>
  ({ art, name, color, minRar, maxRar, boost, enchMult, enchMax, enchBoost, curseMult, blkPct, blkMin, blkMax, blkCurve, artC, nameC, cCurseMult, dark });
export const BCHEST: {
  on: boolean; spread: number; maxStore: number; maxItems: number;
  rankTier: Record<string, BcTier>; rankCurse: Record<string, number>; rankArt: Record<string, string>; tiers: Record<BcTier, BcTierCfg>; count: Record<string, { min: number; max: number }>;
  rankChest: Record<string, boolean>; rankUp: Record<string, number>; rankUp2: Record<string, number>; qdef: Record<string, QDef>;
} = {
  on: true,
  spread: 2,        // уровень вещи = уровень сундука (= уровень задания) ± spread, в пределах существующих уровней вещей
  maxStore: 100,    // сколько неоткрытых/недобранных сундуков хранится; полон — задание с рангом не сдаётся (награда не пропадает)
  maxItems: 60,     // потолок вещей в одном сундуке (страховка от правок «от/до»)
  rankTier: { F: "common", E: "common", D: "uncommon", C: "rare", B: "strange", A: "legendary", S: "divine", SS: "black" },
  // шанс, что сундук ранга — проклятый вариант своего яруса, %: чем ниже ранг, тем чаще проклятие (жёсткий потолок BC_CURSE_MAX,
  // 100 % не бывает ни у какого ранга); SS — обычно обычный «Чёрный сундук», «Чёрный проклятый» — 2 %
  rankCurse: { F: 30, E: 25, D: 20, C: 15, B: 12, A: 10, S: 5, SS: 2 },
  // вид сундука по рангу; "" — как у яруса (tiers.<ярус>.art) — по умолчанию у всех, чтобы вид всегда совпадал с содержимым
  rankArt: { F: "", E: "", D: "", C: "", B: "", A: "", S: "", SS: "" },
  tiers: {
    //           вид          имя                    цвет       мин.редк. макс.редк.  boost зач.× ярус≤ зач.boost прокл.× очерн.% от до | проклятый: вид, имя, прокл.×
    common:    TC("common",    "Простой сундук",      "#a8a29e", "common", "uncommon",  1,   0,    0, 1,   0,    0,  0, 0,  "cursed_common",    "Проклятый простой сундук",      0.5),
    uncommon:  TC("uncommon",  "Добротный сундук",    "#4ade80", "common", "rare",      1.5, 0.68, 1, 1,   0.05, 1,  1, 10, "cursed_uncommon",  "Проклятый добротный сундук",    1),
    rare:      TC("rare",      "Редкий сундук",       "#3b82f6", "common", "epic",      2,   1.38, 2, 1.2, 0.14, 2,  1, 15, "cursed_rare",      "Проклятый редкий сундук",       1.6),
    strange:   TC("epic",      "Странный сундук",     "#ec4899", "common", "legendary", 2.6, 2.6,  3, 1.5, 0.33, 4,  1, 25, "cursed_epic",      "Проклятый странный сундук",     2.4),
    legendary: TC("legendary", "Легендарный сундук",  "#facc15", "common", "mythic",    3,   3.4,  4, 1.8, 0.8,  6,  2, 35, "cursed_legendary", "Проклятый легендарный сундук",  3.33),
    divine:    TC("mythic",    "Божественный сундук", "#ef4444", "common", "mythic",    3.4, 4.2,  5, 2,   1.5,  8,  2, 50, "cursed_mythic",    "Проклятый божественный сундук", 6),
    black:     TC("mythic",    "Чёрный сундук",       "#1c1917", "common", "mythic",    4,   7.8,  6, 3.5, 3.33, 12, 5, 80, "cursed_mythic",    "Чёрный проклятый сундук",       15, true),
  },
  count: { daily: { min: 1, max: 3 }, weekly: { min: 3, max: 7 }, monthly: { min: 10, max: 30 }, hard: { min: 1, max: 5 }, hunt: { min: 1, max: 5 }, quest: { min: 1, max: 3 } },
  // сундук ЗА РАНГ по разделам доски: заказы (охота) — выключен, вместо случайного сундука ранга — сундук задания (qdef.hunt / своё поле «Сундуки»)
  rankChest: { daily: true, weekly: true, monthly: true, hard: true, hunt: false },
  // шанс, что сундук ранга при выдаче улучшится на 1 ярус (rankUp) / сразу на 2 (rankUp2), %
  rankUp: { F: 15, E: 15, D: 12, C: 10, B: 8, A: 6, S: 4, SS: 0 },
  rankUp2: { F: 3, E: 3, D: 2, C: 2, B: 1, A: 1, S: 0, SS: 0 },
  // сундук по умолчанию по ТИПУ квеста/задания (если у квеста нет своего поля «Сундуки» и не стоит «без сундука»): n — сколько (0 — нет),
  // t — ярус, u — шанс улучшиться на 1 ярус, %, u2 — шанс сразу на 2 яруса, %
  qdef: {
    prologue: { n: 1, t: "common", u: 10, u2: 0 }, story: { n: 1, t: "uncommon", u: 15, u2: 3 }, joint: { n: 1, t: "rare", u: 15, u2: 4 },
    star_yellow: { n: 1, t: "rare", u: 12, u2: 3 }, star_red: { n: 1, t: "strange", u: 12, u2: 3 }, star_purple: { n: 1, t: "legendary", u: 10, u2: 2 },
    exam: { n: 1, t: "legendary", u: 15, u2: 3 }, black: { n: 1, t: "divine", u: 10, u2: 0 }, custom: { n: 1, t: "uncommon", u: 15, u2: 3 },
    rep_daily: { n: 1, t: "common", u: 15, u2: 3 }, rep_weekly: { n: 1, t: "rare", u: 12, u2: 3 },
    npc: { n: 1, t: "common", u: 15, u2: 3 }, hunt: { n: 1, t: "uncommon", u: 12, u2: 3 }, hunt_boss: { n: 1, t: "rare", u: 15, u2: 4 },
    daily: { n: 0, t: "common", u: 15, u2: 3 }, weekly: { n: 0, t: "uncommon", u: 12, u2: 3 }, monthly: { n: 0, t: "rare", u: 10, u2: 2 }, hard: { n: 0, t: "rare", u: 10, u2: 2 }, tut: { n: 0, t: "common", u: 0, u2: 0 },
  },
};
export type QDef = { n: number; t: BcTier; u: number; u2: number };
/** типы квестов/заданий для сундука по умолчанию (админка «🎁 Сундуки наград» → «Сундук по типу квеста») */
export const QDEF_NAMES: Record<string, string> = {
  prologue: "Пролог (сюжет)", story: "Сюжет: главы Лэйр/Алзи", joint: "Совместный сюжет", star_yellow: "Звёздный ★ жёлтый", star_red: "Звёздный ★ красный", star_purple: "Звёздный ★ фиолетовый",
  exam: "Экзамен", black: "Чёрный маг", custom: "Свой квест (c_…)", rep_daily: "Повторяемый квест: ежедневный", rep_weekly: "Повторяемый квест: еженедельный",
  npc: "Доска: личное задание NPC", hunt: "Доска: заказ (охота)", hunt_boss: "Доска: заказ на босса/редкого", daily: "Доска: ежедневное", weekly: "Доска: недельное", monthly: "Доска: месячное", hard: "Доска: испытание", tut: "Доска: обучение",
};
export const BC_UP_MAX = 100;
/** бросок улучшения яруса: сначала «сразу на 2» (u2 %), потом «на 1» (u %); выше «Чёрного» не бывает */
export function upTier(t: BcTier, u: number, u2: number, rnd: () => number): BcTier {
  const i = BC_TIERS.indexOf(t); if (i < 0) return t;
  const r = rnd() * 100, a = Math.max(0, Math.min(100, Number(u2) || 0)), b = Math.max(0, Math.min(100, Number(u) || 0));
  const top = BC_TIERS.length - 1;
  if (a > 0 && r < a && i + 2 <= top) return BC_TIERS[i + 2];
  if (r < a + b && i + 1 <= top) return BC_TIERS[i + 1];
  return t;
}
/** «шанс улучшиться до …»: список {ярус, имя, %} для показа игроку (учитывает потолок «Чёрного») */
export function upView(t: BcTier, u: number, u2: number): { t: BcTier; n: string; c: string; p: number }[] {
  const i = BC_TIERS.indexOf(t), top = BC_TIERS.length - 1, out: { t: BcTier; n: string; c: string; p: number }[] = [];
  const a = Math.max(0, Math.min(100, Number(u2) || 0)), b = Math.max(0, Math.min(100, Number(u) || 0));
  if (i < 0) return out;
  if (i + 1 <= top && (b > 0 || (a > 0 && i + 2 > top))) out.push({ t: BC_TIERS[i + 1], n: BCHEST.tiers[BC_TIERS[i + 1]].name, c: BCHEST.tiers[BC_TIERS[i + 1]].color, p: Math.round((i + 2 <= top ? b : a + b) * 10) / 10 });
  if (a > 0 && i + 2 <= top) out.push({ t: BC_TIERS[i + 2], n: BCHEST.tiers[BC_TIERS[i + 2]].name, c: BCHEST.tiers[BC_TIERS[i + 2]].color, p: Math.round(a * 10) / 10 });
  return out.filter((x) => x.p > 0);
}
/** сундуки по умолчанию для типа квеста (n=0 — нет) */
export function qdefSpec(type: string): BcSpec[] {
  const d = BCHEST.qdef?.[type]; if (!d || !(d.n > 0) || !BCHEST.tiers[d.t]) return [];
  return [{ n: Math.min(BC_SPEC_N, Math.round(d.n)), t: d.t, c: "no", ...(d.u > 0 ? { u: d.u } : {}), ...(d.u2 > 0 ? { u2: d.u2 } : {}) }];
}
/** итоговые сундуки квеста: свои (поле «Сундуки») → иначе по типу; off — «без сундука» */
export function effSpec(own: any, off: any, type: string): BcSpec[] {
  if (off) return [];
  if (Array.isArray(own) && own.length) return own;
  return qdefSpec(type);
}
/** вид сундуков для окна квеста/доски: имя, цвет, сколько, уровень, чары, проклятость и «шанс улучшиться до …» */
export function specView(L: BcSpec[]): any[] {
  if (BCHEST.on === false) return [];
  return L.filter((x) => BCHEST.tiers[x.t]).map((x) => { const T = BCHEST.tiers[x.t], cur = x.c === "yes" ? 100 : typeof x.c === "number" ? Math.min(BC_CURSE_MAX, x.c) : 0;
    return { k: x.n, n: cur === 100 ? T.nameC : T.name, c: T.color, nc: T.nameC, L: x.L || 0, L2: x.L2 || 0, e: Number.isInteger(x.e) ? x.e : -1, cp: cur, up: upView(x.t, x.u || 0, x.u2 || 0) }; });
}
export const BC_CAT_NAMES: Record<string, string> = { daily: "Ежедневное", weekly: "Недельное", monthly: "Месячное", hard: "Испытание", hunt: "Заказ" };
export const rarIdx = (r: string) => Math.max(0, BC_RARS.indexOf(r));
/** ключ рисунка сундука: по рангу (rankArt, если задан), иначе по ярусу и варианту (cur — проклятый: artC) */
export function artOf(tier: BcTier, rank?: string, cur = false): string { const r = rank ? BCHEST.rankArt?.[rank] : ""; if (r && BC_ART.includes(r)) return r; const T = BCHEST.tiers[tier]; const a = cur ? T?.artC : T?.art; return a && BC_ART.includes(a) ? a : T?.art && BC_ART.includes(T.art) ? T.art : "common"; }
/** потолок яруса зачарования: min(админка enchMax, жёсткий BC_ENCH_CAP) */
export const enchCapOf = (tier: BcTier) => Math.max(0, Math.min(BC_ENCH_CAP[tier] ?? 0, ENCH_N, (BCHEST.tiers[tier]?.enchMax | 0) || 0));
/** шанс проклятого варианта для ранга, % */
export const rankCursePct = (rank: string) => Math.min(BC_CURSE_MAX, pct(BCHEST.rankCurse?.[rank] ?? 0));
function pct(v: number) { return Math.max(0, Math.min(100, Number(v) || 0)); }
export const tierOfRank = (rank: string): BcTier | null => { const t0 = BCHEST.rankTier[rank] as string, t = (t0 === "cursed" ? "divine" : t0) as BcTier; /* старое значение админки «cursed» */ return t && BCHEST.tiers[t] ? t : null; };
export function countOf(cat: string): [number, number] {
  const c = BCHEST.count[cat] || BCHEST.count.daily, M = Math.max(1, BCHEST.maxItems | 0 || 60);
  const lo = Math.max(1, Math.min(M, c.min | 0)), hi = Math.max(lo, Math.min(M, c.max | 0));
  return [lo, hi];
}
// пул: ВСЯ экипировка игры (трофеи любых мобов, ремесло, стартовые) — без привязки к мобу/биому
const POOL = () => ITEMS.filter((i) => i.slot);
const ilvl = (i: any) => Math.max(1, Math.round(i.lvl || 1));
export const itemLvlRange = (): [number, number] => { let lo = 99, hi = 1; for (const i of POOL()) { const l = ilvl(i); if (l < lo) lo = l; if (l > hi) hi = l; } return [Math.min(lo, hi), hi]; };
const lvlOf = (L: number) => { const [a, b] = itemLvlRange(); return Math.max(a, Math.min(b, Math.round(L) || 1)); };
/** окно уровней сундука уровня L: L ± spread, обрезанное по существующим уровням вещей */
export function lvlWindow(L: number): { L: number; lo: number; hi: number } {
  const [a, b] = itemLvlRange(), l = lvlOf(L), s = Math.max(0, BCHEST.spread | 0);
  return { L: l, lo: Math.max(a, l - s), hi: Math.min(b, l + s) };
}
/** Общая таблица редкости (BALANCE.DROP_PCT) — основа. */
export const baseRarPct = (): Record<string, number> => Object.fromEntries(BC_RARS.map((r) => [r, Math.max(0, Number((BALANCE.DROP_PCT as any)[r]) || 0)]));
/** Общая доля проклятых: проклятый босс роняет обычные × mobDropMult и проклятые копии × itemChanceMult → доля проклятых, %. */
export const baseCursePct = () => { const m = Math.max(0, Number(CURSE.mobDropMult) || 0), c = Math.max(0, Number(CURSE.itemChanceMult) || 0); return m + c > 0 ? (c / (m + c)) * 100 : 0; };
/** Общий шанс зачарования: шанс, что моб зачарован (Σ spawnPct ярусов), %. */
export const baseEnchPct = () => (ENCH.on === false ? 0 : Math.min(100, ENCH.tiers.reduce((s, t) => s + Math.max(0, Number(t.spawnPct) || 0), 0)));
/** Пул сундука: вещи окна уровней с весами. Нет ни одной вещи в редкостях яруса — нижняя граница редкости опускается
 *  Выше «макс. редкости» — только если в окне ниже ничего нет (тогда — самая низкая редкость окна). Уровень — всегда строго в окне. */
export function chestPool(tier: BcTier, L: number): { items: { id: string; rar: string; w: number }[]; lo: number; hi: number; L: number } {
  const T = BCHEST.tiers[tier], W = lvlWindow(L); if (!T) return { items: [], ...W };
  const base = baseRarPct(), b = Math.max(0.01, Number(T.boost) || 1), cap = rarIdx(T.maxRar || "mythic");
  const inWin: any[] = POOL().filter((i) => ilvl(i) >= W.lo && ilvl(i) <= W.hi && rarIdx(i.rarity) <= cap);
  if (!inWin.length) { // в окне нет вещей не выше «макс. редкости» (L23–25 у простого) — берётся самая низкая редкость окна; уровень не расширяется
    const all = POOL().filter((i) => ilvl(i) >= W.lo && ilvl(i) <= W.hi), lo = Math.min(...all.map((i) => rarIdx(i.rarity)));
    inWin.push(...all.filter((i) => rarIdx(i.rarity) === lo));
  }
  for (let mn = rarIdx(T.minRar || "common"); mn >= 0; mn--) {
    const items = inWin.filter((i) => rarIdx(i.rarity) >= mn).map((i) => ({ id: i.id, rar: i.rarity, w: (base[i.rarity] || 0) * Math.pow(b, rarIdx(i.rarity)) })).filter((x) => x.w > 0);
    if (items.length) return { items, ...W };
  }
  return { items: [], ...W };
}
/** Совместимость: вещи нужной редкости в окне сундука. */
export function candidates(rar: string, L: number): { ids: string[]; lo: number; hi: number } {
  const W = lvlWindow(L); return { ids: POOL().filter((i) => i.rarity === rar && ilvl(i) >= W.lo && ilvl(i) <= W.hi).map((i) => i.id), lo: W.lo, hi: W.hi };
}
/** Реальные шансы редкости для яруса и уровня (сумма весов вещей пула по редкостям), %. s — использованный разброс. */
export function rarOdds(tier: BcTier, L: number): { odds: Record<string, number>; s: number } {
  const P = chestPool(tier, L), sum = P.items.reduce((s, x) => s + x.w, 0), out: Record<string, number> = {};
  if (!sum) return { odds: {}, s: Math.max(0, BCHEST.spread | 0) };
  for (const x of P.items) out[x.rar] = (out[x.rar] || 0) + x.w;
  for (const k of Object.keys(out)) out[k] = Math.round((out[k] / sum) * 1000) / 10;
  return { odds: out, s: Math.max(0, BCHEST.spread | 0) };
}
/** Ярусы зачарования, доступные сундуку (1…enchMax): веса spawnPct × enchBoost^(ярус−1) → % от «зачарована». */
export function enchOdds(tier: BcTier): Record<number, number> {
  const T = BCHEST.tiers[tier], mx = enchCapOf(tier), out: Record<number, number> = {};
  if (!T || !mx || !(enchPctOf(tier) > 0)) return out;
  const eb = Math.max(0.01, Number(T.enchBoost) || 1);
  const ws = ENCH.tiers.slice(0, mx).map((t, i) => Math.max(0, Number(t.spawnPct) || 0) * Math.pow(eb, i)), sum = ws.reduce((s, w) => s + w, 0) || 1;
  ws.forEach((w, i) => { if (w > 0) out[i + 1] = Math.round((w / sum) * 1000) / 10; });
  return out;
}
/** множитель шанса — по «шансам» (odds), чтобы не упираться в 100 %: p' = o·m / (1 + o·m), o = p / (100 − p) */
const oddsMul = (p: number, m: number) => { p = pct(p); m = Math.max(0, Number(m) || 0); if (!m || !p) return 0; if (p >= 100) return 100; const o = (p / (100 - p)) * m; return (o / (1 + o)) * 100; };
export const enchPctOf = (tier: BcTier) => { const T = BCHEST.tiers[tier]; return !T || ENCH.on === false || !(enchCapOf(tier) > 0) ? 0 : oddsMul(baseEnchPct(), T.enchMult); };
/** доля проклятых вещей, %: обычный вариант — curseMult, проклятый — cCurseMult */
export const cursePctOf = (tier: BcTier, cur = false) => { const T = BCHEST.tiers[tier]; return T ? oddsMul(baseCursePct(), cur ? T.cCurseMult : T.curseMult) : 0; };
const blkRange = (T: BcTierCfg): [number, number] => { const a = Math.max(1, Math.min(99, Number(T.blkMin) || 1)), b = Math.max(a, Math.min(99, Number(T.blkMax) || a)); return [a, b]; };
/** Сводка шансов для окна и админки. */
export function chestOdds(tier: BcTier, L: number, cat: string, cur = false) {
  const T = BCHEST.tiers[tier]; const [cmin, cmax] = countOf(cat), W = lvlWindow(L), ro = rarOdds(tier, L);
  const eo = enchOdds(tier), ep = enchPctOf(tier), cp = cursePctOf(tier, cur), [b0, b1] = T ? blkRange(T) : [0, 0];
  // чёрная проклятая (проклятая + ярус «Чёрный»): доля от всех вещей
  const blackCursed = cur ? Math.round(cp / 100 * ep / 100 * (eo[ENCH_N] || 0) * 100) / 100 : 0; // только проклятый вариант
  return { tier, cur: !!cur, art: artOf(tier, undefined, cur), dark: !!T?.dark, name: (cur ? T?.nameC : T?.name) || T?.name || tier, color: T?.color || "#999", enchCap: enchCapOf(tier), enchCapName: enchCapOf(tier) ? ENCH.tiers[enchCapOf(tier) - 1]?.name || "" : "", enchCapColor: enchCapOf(tier) ? ENCH.tiers[enchCapOf(tier) - 1]?.color || "" : "", L: W.L, lo: W.lo, hi: W.hi, cmin, cmax,
    rar: ro.odds, enchPct: Math.round(ep * 10) / 10, ench: eo, cursePct: Math.round((cur ? cp : cp * (1 - ep / 100 * (eo[ENCH_N] || 0) / 100)) * 10) / 10, blackCursed, // обычный вариант: без ☠ у вещей с чарами «Чёрный»
    blkPct: pct(T?.blkPct || 0), blkMin: b0, blkMax: b1,
    base: { rar: baseRarPct(), cursePct: Math.round(baseCursePct() * 100) / 100, enchPct: Math.round(baseEnchPct() * 100) / 100, boost: T?.boost || 1, curseMult: (cur ? T?.cCurseMult : T?.curseMult) || 0, enchMult: T?.enchMult || 0 } };
}
export type BcRoll = { id: string; c?: 1; e?: number; b?: number };
/** Бросок содержимого (rnd — ГСЧ; сервер передаёт cryptoRand). b — очернение %, целое 1…99. */
export function rollItems(tier: BcTier, L: number, cat: string, rnd: () => number, cur = false, emax = -1): BcRoll[] {
  const T = BCHEST.tiers[tier]; if (!T) return [];
  const [lo, hi] = countOf(cat), n = lo + Math.floor(rnd() * (hi - lo + 1));
  const P = chestPool(tier, L).items, sum = P.reduce((s, x) => s + x.w, 0);
  const eo = enchOdds(tier), ek = Object.keys(eo).map(Number), es = ek.reduce((s, k) => s + eo[k], 0), ep = enchPctOf(tier), cp = cursePctOf(tier, cur), cap = emax >= 0 ? Math.min(enchCapOf(tier), emax | 0) : enchCapOf(tier); // emax — потолок чар из награды задания (админка)
  const bp = pct(T.blkPct), [b0, b1] = blkRange(T), bc = Math.max(0.1, Number(T.blkCurve) || 1);
  const out: BcRoll[] = [];
  for (let k = 0; k < n && P.length && sum > 0; k++) {
    let x = rnd() * sum, id = P[P.length - 1].id;
    for (const it of P) { if (x < it.w) { id = it.id; break; } x -= it.w; }
    const o: BcRoll = { id };
    if (ek.length && rnd() * 100 < ep) { let y = rnd() * es; o.e = ek[ek.length - 1]; for (const t of ek) { if (y < eo[t]) { o.e = t; break; } y -= eo[t]; } }
    if (o.e && o.e > cap) o.e = cap; // страховка: ярус чар не выше яруса сундука (у простого — нет вовсе)
    if (!o.e) delete o.e;
    if (rnd() * 100 < cp) o.c = 1;
    if (o.c && !cur && o.e === ENCH_N) delete o.c; // «чёрная проклятая» (☠ + ярус «Чёрный») — только в проклятом варианте; обычный сундук — чары «Чёрный» без проклятия
    if (bp > 0 && rnd() * 100 < bp) o.b = Math.max(1, Math.round(b0 + (b1 - b0) * Math.pow(rnd(), bc)));
    out.push(o);
  }
  return out;
}
/** Награда задания «Сундуки» (админка, поле ch): [{ n, t, L, L2, e, c }] — сколько, ярус, уровень вещей (0 — уровень задания ±spread;
 *  L2 > 0 — случайный в L…L2), потолок чар (-1 — по ярусу; не выше яруса сундука, у простого — 0), проклятый вариант: "no" | "yes" | шанс 1…30 %. */
export type BcSpec = { n: number; t: BcTier; L?: number; L2?: number; e?: number; c?: "no" | "yes" | number; u?: number; u2?: number }; // u/u2 — шанс улучшиться на 1/2 яруса, %
export const BC_SPEC_MAX = 5, BC_SPEC_N = 10;
export function bcSpecErr(v: any): string | null {
  if (v == null || v === "") return null;
  if (!Array.isArray(v)) return "Сундуки: нужен список";
  if (v.length > BC_SPEC_MAX) return `Сундуки: не больше ${BC_SPEC_MAX} строк`;
  for (const [i, x] of v.entries()) {
    const w = `Сундуки, строка ${i + 1}`;
    if (!x || typeof x !== "object") return `${w}: пусто`;
    if (!BC_TIERS.includes(x.t)) return `${w}: ярус — выберите из списка`;
    const n = Number(x.n); if (!Number.isInteger(n) || n < 1 || n > BC_SPEC_N) return `${w}: сколько 1…${BC_SPEC_N}`;
    const L = Number(x.L ?? 0), L2 = Number(x.L2 ?? 0);
    if (!Number.isInteger(L) || L < 0 || L > 25) return `${w}: уровень 0 (по заданию) или 1…25`;
    if (!Number.isInteger(L2) || L2 < 0 || L2 > 25 || (L2 && (!L || L2 < L))) return `${w}: уровень «до» — 0 или от «от» до 25`;
    const e = Number(x.e ?? -1), cap = BC_ENCH_CAP[x.t as BcTier];
    if (!Number.isInteger(e) || e < -1 || e > cap) return `${w}: потолок зачарования — по ярусу или 0…${cap}${cap ? "" : " (простой сундук без чар)"}`;
    const c = x.c ?? "no"; if (!(c === "no" || c === "yes" || (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= BC_CURSE_MAX))) return `${w}: проклятый — нет, да или шанс 0…${BC_CURSE_MAX} %`;
    const u = Number(x.u ?? 0), u2 = Number(x.u2 ?? 0);
    if (!Number.isFinite(u) || u < 0 || u > 100 || !Number.isFinite(u2) || u2 < 0 || u2 > 100) return `${w}: шанс улучшения 0…100 %`;
    if (u + u2 > 100) return `${w}: шансы улучшения вместе не больше 100 %`;
  }
  return null;
}
export function bcSpecNorm(v: any): BcSpec[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) => { const o: BcSpec = { n: Math.round(Number(x.n)), t: x.t };
    if (Number(x.L) > 0) o.L = Math.round(Number(x.L)); if (Number(x.L2) > 0) o.L2 = Math.round(Number(x.L2));
    if (Number(x.e ?? -1) >= 0) o.e = Math.round(Number(x.e)); o.c = x.c === "yes" ? "yes" : typeof x.c === "number" && x.c > 0 ? Math.round(x.c * 10) / 10 : "no";
    if (Number(x.u) > 0) o.u = Math.round(Number(x.u) * 10) / 10; if (Number(x.u2) > 0) o.u2 = Math.round(Number(x.u2) * 10) / 10; return o; });
}
export const bcSpecCount = (v: any) => (Array.isArray(v) ? v.reduce((s: number, x: any) => s + (Number(x?.n) | 0), 0) : 0);
/** Проверка правки админки (после наложения). */
export function bchestErr(get: (p: string) => any): string | null {
  for (const r of BC_RANKS) { const v = Number(get(`rankCurse.${r}`)); if (v > BC_CURSE_MAX) return `Ранг ${r}: проклятый сундук не больше ${BC_CURSE_MAX} %`; }
  for (const r of BC_RANKS) { const a = Number(get(`rankUp.${r}`)) || 0, b = Number(get(`rankUp2.${r}`)) || 0; if (a + b > 100) return `Ранг ${r}: шансы улучшения вместе не больше 100 %`; }
  for (const k of Object.keys(BCHEST.qdef)) { const a = Number(get(`qdef.${k}.u`)) || 0, b = Number(get(`qdef.${k}.u2`)) || 0; if (a + b > 100) return `${QDEF_NAMES[k] || k}: шансы улучшения вместе не больше 100 %`; }
  for (const c of BC_CATS) { const lo = Number(get(`count.${c}.min`)), hi = Number(get(`count.${c}.max`)); if (lo > hi) return `${BC_CAT_NAMES[c]}: «вещей от» больше «до»`; }
  for (const t of BC_TIERS) {
    if (rarIdx(String(get(`tiers.${t}.minRar`))) > rarIdx(String(get(`tiers.${t}.maxRar`)))) return `${BCHEST.tiers[t].name}: мин. редкость выше макс.`;
    if (Number(get(`tiers.${t}.blkMin`)) > Number(get(`tiers.${t}.blkMax`))) return `${BCHEST.tiers[t].name}: очернение «от» больше «до»`;
    if (Number(get(`tiers.${t}.enchMax`)) > BC_ENCH_CAP[t]) return `${BCHEST.tiers[t].name}: ярус зачарования не выше ${BC_ENCH_CAP[t] ? `«${ENCH.tiers[BC_ENCH_CAP[t] - 1]?.name}» (${BC_ENCH_CAP[t]})` : "0 — простой сундук без чар"}`;
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
    const rc: Record<string, string[]> = {}; for (const [r, t] of Object.entries(BCHEST.rankTier)) if (rankCursePct(r) > 0) (rc[t] ||= []).push(`${r} ${Math.round(rankCursePct(r) * 10) / 10}%`);
    return { ok: true, L, cat, tiers: BC_TIERS.flatMap((t) => [false, true].map((cur) => { const o = chestOdds(t, L, cat, cur);
      const sample = rollItems(t, L, cat, rnd, cur).map((x) => { const d: any = ITEMS.find((i: any) => i.id === x.id) || {}; return { id: x.id, name: d.name || x.id, rarity: d.rarity, lvl: d.lvl || 1, c: x.c, e: x.e, b: x.b }; });
      return { ...o, ranks: cur ? rc[t] || [] : rank[t] || [], sample }; })) };
  } finally { restoreInto(BCHEST, save); }
}
