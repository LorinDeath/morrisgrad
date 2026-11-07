// Жёсткие потолки шанса. Их нет в наборе админки: поле caps набор отвергает.
// Рейтинг сжимается кривой. Обычная сборка остаётся далеко от потолка.
// Поток достигается только огромным рейтингом (все слоты, чёрные чары и кузница).

export const HARD_CAP = { crit: 0.4, dodge: 0.4, ls: 0.1 } as const;
export type CapKind = keyof typeof HARD_CAP;

const HALF: Record<CapKind, number> = { crit: 140, dodge: 180, ls: 36 };
const REACH: Record<CapKind, number> = { crit: 1500, dodge: 1700, ls: 480 };

export function cleanRating(raw: number) {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 0;
  return raw;
}

/** Эффективный шанс. Выше половины рейтинга каждый следующий пункт почти ничего не даёт. */
export function rateChance(raw: number, kind: CapKind) {
  const cap = HARD_CAP[kind];
  const rating = cleanRating(raw);
  if (rating <= 0) return 0;
  if (rating >= REACH[kind]) return cap;
  return Math.min(cap, cap * rating / (rating + HALF[kind]));
}

export function capLabel(kind: CapKind, raw: number) {
  const eff = rateChance(raw, kind);
  const pct = Math.round(eff * 1000) / 10;
  const max = Math.round(HARD_CAP[kind] * 100);
  const past = cleanRating(raw) - HALF[kind];
  const tail = past > 0 ? `, выше середины на ${Math.round(past)}` : "";
  return `${pct}% из ${max}%${tail}`;
}

/** Броня гасит удар с убыванием и не закрывает больше 60% урона. */
export function mitigate(raw: number, armor: number) {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 0;
  const a = typeof armor === "number" && Number.isFinite(armor) && armor > 0 ? armor : 0;
  const dr = Math.min(0.6, a / (a + 220));
  return raw * (1 - dr);
}
