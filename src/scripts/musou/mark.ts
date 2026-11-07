// Зачарованный генерал и босс. Ярусы — шесть цветов Проклятых (server/meta/enchant.ts).
// Седьмого цвета нет. На Чёрном шаг вверх — плюс Петра (upPct яруса), не новый ярус.
// Ось этажа (diff) и редкий шаг вверх — разные. Числа ОЗ/урона яруса взяты из ENCH,
// но в удар входит только отношение к уже гарантированному ярусу, с потолком:
// иначе Чёрный ×40 поверх кривой этажа становится нечитаемым ударом.

import { mulberry32 } from "./rules";
import { getTune } from "./tune";
import { MODE_LIST, type ModeId } from "./modes";

export type EliteMark = { tier: number; up: number; cursed: 0 | 1 };
export type MarkBook = { g0: EliteMark; g1: EliteMark; g2: EliteMark; boss: EliteMark };

const NAMES = ["Необычный", "Редкий", "Странный", "Легендарный", "Божественный", "Чёрный"];
const COLORS = ["#4ade80", "#3b82f6", "#ec4899", "#facc15", "#ef4444", "#f4f4f5"];
/** mobHp / mobDmg из ENCH.tiers. Индекс 0 — без чар. */
const MOB_HP = [1, 1.5, 2.5, 4, 7, 12, 40];
const MOB_DMG = [1, 1.2, 1.5, 2, 3, 6, 40];
/** upPct яруса, как «+N% за уровень» в чарах. Чёрный — 5%. */
const UP_PCT = [0, 0.002, 0.004, 0.007, 0.012, 0.02, 0.05];

export function markSeed(nonce: string, floor: number, diff: number): number {
  let h = (Math.imul(floor | 0, 131) ^ Math.imul(diff | 0, 17)) >>> 0;
  const s = String(nonce || "");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

function mix(seed: number, id: string): number {
  let h = (seed >>> 0) || 1;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

export function markAnchor(diff: number, mode?: string, step = 0): number {
  const tune = getTune().elite;
  const d = Math.max(1, Math.min(7, diff | 0));
  let tier = tune.minTier[d - 1] | 0;
  if (mode) {
    const ix = MODE_LIST.findIndex((m) => m.id === mode);
    const base = ix >= 0 ? (tune.modeTier[ix] | 0) : 0;
    const climb = mode === "abyss" ? Math.min(3, Math.max(0, step | 0))
      : mode === "bossrush" ? Math.min(2, Math.floor(Math.max(0, step | 0) / 4))
      : 0;
    tier = Math.max(tier, Math.min(6, base + climb));
  }
  return Math.max(0, Math.min(6, tier));
}

export function rollMark(seed: number, id: string, diff: number, mode?: ModeId | "", step = 0): EliteMark {
  const rng = mulberry32(mix(seed, id || "e"));
  const chance = getTune().elite.up[Math.max(0, Math.min(6, (diff | 0) - 1))];
  let tier = markAnchor(diff, mode, step);
  let up = 0;
  if (tier < 6 && rng() < chance) tier += 1;
  else if (tier >= 6 && rng() < chance) up = 1 + Math.floor(rng() * 3);
  const cursed: 0 | 1 = tier > 0 && rng() < 0.1 ? 1 : 0;
  return { tier, up, cursed };
}

export function rollBook(seed: number, diff: number, mode?: ModeId | "", step = 0): MarkBook {
  return {
    g0: rollMark(seed, "g0", diff, mode, step),
    g1: rollMark(seed, "g1", diff, mode, step),
    g2: rollMark(seed, "g2", diff, mode, step),
    boss: rollMark(seed, "boss", diff, mode, step),
  };
}

export function markMul(mark: EliteMark, anchor: number): { hp: number; dmg: number } {
  const from = Math.max(0, Math.min(6, anchor | 0));
  const to = Math.max(0, Math.min(6, mark.tier | 0));
  let hp = MOB_HP[to] / MOB_HP[from];
  let dmg = MOB_DMG[to] / MOB_DMG[from];
  if ((mark.up | 0) > 0) {
    const pct = UP_PCT[to] || 0.05;
    const grown = 1 + (mark.up | 0) * pct;
    hp *= grown;
    dmg *= grown;
  }
  return {
    hp: Math.min(1.85, Math.max(1, hp)),
    dmg: Math.min(1.45, Math.max(1, dmg)),
  };
}

export function markTitle(base: string, mark: EliteMark): string {
  if ((mark.tier | 0) <= 0 && !mark.cursed && !(mark.up | 0)) return base;
  const name = mark.tier > 0 ? NAMES[mark.tier - 1] : "Проклятый";
  const plus = mark.up ? ` +${mark.up}` : "";
  const curse = mark.cursed && mark.tier > 0 ? " · проклят" : "";
  return `${name}${plus}${curse} · ${base}`;
}

export function markColor(mark: EliteMark, fallback: string): string {
  if ((mark.tier | 0) <= 0) return fallback;
  return COLORS[mark.tier - 1] || fallback;
}

export function markPay(marks: EliteMark[] | undefined, anchor: number, slice: number): number {
  if (!marks?.length || slice <= 0) return 0;
  let extra = 0;
  for (const m of marks) {
    const steps = Math.max(0, (m.tier | 0) - anchor) + ((m.up | 0) > 0 ? 1 : 0);
    if (steps > 0) extra += Math.max(1, Math.round(slice * 0.12 * steps));
  }
  return Math.min(slice, extra);
}

export function markGold(bonusXp: number): number {
  return bonusXp > 0 ? Math.round(bonusXp * 0.35) : 0;
}

export function readMark(raw: unknown): EliteMark {
  const m = raw && typeof raw === "object" ? raw as { tier?: unknown; up?: unknown; cursed?: unknown } : {};
  const tier = Math.max(0, Math.min(6, m.tier | 0));
  const up = tier >= 6 ? Math.max(0, Math.min(3, m.up | 0)) : 0;
  return { tier, up, cursed: m.cursed ? 1 : 0 };
}

export function readBook(raw: unknown): MarkBook | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  return {
    g0: readMark(src.g0),
    g1: readMark(src.g1),
    g2: readMark(src.g2),
    boss: readMark(src.boss),
  };
}
