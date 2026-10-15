// Баланс прогрессии «Проклятых» (уровни 1–25): единые кривые для мобов, предметов, опыта и шансов дропа.
// Всё здесь — чистые функции без зависимостей: их используют bestiary.ts (генерация статов), сервер и
// симуляция tools/sim/progression.mjs. Таблицы и обоснование — docs/MORRISCURSE-BALANCE.md («Кривые 1–25»).
//
// Модель «эталонного героя» уровня L: надеты 5 предметов уровня L (≈ необычные), ~40% очков талантов в урон,
// удар раз в ~0.45 с, навыки дают ещё ~25% к урону. Мобы уровня L подобраны так, что этот герой:
//   • убивает обычного моба своего уровня за TTK(L) ≈ 3.5 → 6 с (растёт с уровнем — бои весомее);
//   • сам умирает от ОДНОГО моба своего уровня за ~40 с непрерывного боя (от стаи из 3 — за ~13 с).
// Моб выше героя на 3+ уровня быстро становится опасным (урон ×1.1 за уровень, ХП тоже растёт по кривой).

export const MAX_CONTENT_LEVEL = 25;
export const TIERS = [
  { id: 1, name: "I", lvl: [1, 5] as [number, number] },
  { id: 2, name: "II", lvl: [6, 10] as [number, number] },
  { id: 3, name: "III", lvl: [11, 15] as [number, number] },
  { id: 4, name: "IV", lvl: [16, 20] as [number, number] },
  { id: 5, name: "V", lvl: [21, 25] as [number, number] },
];
export function tierOf(lvl: number): number { return Math.max(1, Math.min(5, Math.ceil(lvl / 5))); }

// ---------------- опыт ----------------
// Ребаланс 2026-10: опыт за убийство — доля xpNeed героя (не абсолютный mobXp).
//   моб своего уровня → 0.1%  |  моб ниже → 0.01%  |  моб на 1–3 ур. выше → 1%
//   моб на >3 ур. выше → тоже 1% (кап; дальше — только ради челленджа, не ради фарма)
//   босс: ×10 от этих долей (1% / 0.1% / 10%, кап 10% при >+3)
// Элита ×1.5, проклятый ×2 (мягко; элита+проклятый ≤ ×2.5). Поле o.xp больше не влияет на итог —
// оставлено в сигнатуре для совместимости вызовов/тестов.
// killsPerLevel / mobXp сохранены для xpNeed (кривая «сколько нужно до след. уровня») и забегов.
export const KPL = { base: 40, k: 110, p: 1.2 };
export function killsPerLevel(L: number): number { return KPL.base + KPL.k * Math.pow(Math.max(0, L - 1), KPL.p); }
export function xpNeed(L: number): number { return Math.round(mobXp(L) * killsPerLevel(L)); }
export function mobXp(L: number): number { return Math.round(5 + 2.4 * Math.pow(L, 1.42)); }
/** Доля xpNeed за одно убийство по разнице уровней (моб − герой). Босс — снаружи ×10. */
export function xpFrac(mobL: number, heroL: number): number {
  const d = mobL - heroL;
  if (d < 0) return 0.0001;       // ниже: 0.01%
  if (d === 0) return 0.001;      // равный: 0.1%
  return 0.01;                    // +1 и выше (в т.ч. >+3): 1%
}
export function xpLevelMult(mobL: number, heroL: number): number {
  // совместимость: относительный множитель к «равному» (для старых тестов/симов)
  return xpFrac(mobL, heroL) / 0.001;
}
export const KILL_XP = { elite: 1.5, cursed: 2, softMax: 2.5 };
export function killXp(o: { xp: number; mobL: number; heroL: number; elite?: boolean; cursed?: boolean; boss?: boolean }): number {
  let frac = xpFrac(o.mobL, o.heroL);
  if (o.boss) frac *= 10;
  let kind = (o.elite ? KILL_XP.elite : 1) * (o.cursed ? KILL_XP.cursed : 1);
  if (kind > KILL_XP.softMax) kind = KILL_XP.softMax;
  return Math.max(1, Math.round(xpNeed(o.heroL) * frac * kind));
}

// ---------------- прогрессия: что открывается с уровнем ----------------
// Чем выше уровень — тем больше опций (слоты, ярусы, сияние, стаки DoT) и тем тяжелее соло
// (множитель силы мобов относительно эталонного героя растёт с L — см. soloPressure).
export const PROGRESSION = {
  abilitySlot3: 5,          // 3-й слот навыка (F) с 5 ур.
  talentTierPts: { 1: 0, 2: 3, 3: 7, 4: 12, 5: 18 } as Record<number, number>,
  radianceOpenFlag: "radiance_open", // сюжетный флаг (не уровень)
  dotStackByLevel: [ // max стаков одного DoT: [minHeroLvl, stacks]
    [1, 2], [5, 3], [10, 4], [15, 5],
  ] as [number, number][],
  weaponSkillPower: [ // сила навыка оружия R: [minHeroLvl, powerMult]
    [1, 1], [8, 1.15], [15, 1.3], [22, 1.45],
  ] as [number, number][],
  setBonusMinPieces: 5,     // полный комплект — все 5 слотов (без изменения)
};
export function dotStackMax(heroL: number): number {
  let n = 2;
  for (const [L, s] of PROGRESSION.dotStackByLevel) if (heroL >= L) n = s;
  return n;
}
export function weaponSkillPowerMult(heroL: number): number {
  let m = 1;
  for (const [L, p] of PROGRESSION.weaponSkillPower) if (heroL >= L) m = p;
  return m;
}
/** Давление соло: во сколько раз « entтивный» урон/ХП моба растёт относительно эталона с уровнем.
 *  L1 ≈ 0.85 (легко соло), L10 ≈ 1.0, L20 ≈ 1.25, L25 ≈ 1.4 — группа всё нужнее. */
export function soloPressure(L: number): number {
  // L1 ≈ 0.92 (легко соло), L12 ≈ 1.0, L25 ≈ 1.18 — соло всё туже, но партия из 3 бьёт проклятого
  return 0.92 + 0.26 * Math.pow(Math.max(0, L - 1) / 24, 1.05);
}

// ---------------- предметы: ФИКСИРОВАННАЯ сила, зависит от уровня источника и редкости ----------------
export const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;
export type Rarity = (typeof RARITY_ORDER)[number];
// множитель бюджета статов
export const RARITY_BUDGET: Record<string, number> = { common: 1, uncommon: 1.15, rare: 1.35, epic: 1.6, legendary: 1.85, mythic: 2.1 };
// множитель урона оружия
export const RARITY_DMG: Record<string, number> = { common: 1, uncommon: 1.08, rare: 1.18, epic: 1.3, legendary: 1.42, mythic: 1.55 };
// Очки бюджета предмета уровня L (не оружие)
export function itemBudget(L: number, rarity: string): number { return (2 + 0.62 * L) * (RARITY_BUDGET[rarity] || 1); }
// Средний урон оружия уровня L (добавляется к базовым 6–9 героя); разброс ±15%
export function weaponAvg(L: number, rarity: string): number { return (4.5 + 0.85 * L) * (RARITY_DMG[rarity] || 1); }
// Цена статов в очках бюджета
export const STAT_COST: Record<string, number> = { armor: 1, hp: 0.4, critPct: 1.5, speedPct: 1.2, cdrPct: 1.5, regen: 10, lifestealPct: 3, atkSpeedPct: 1.4, magnetPct: 0.2 };
// Профиль слота: доли бюджета по статам (оружие тратит 30% бюджета на вторичный стат)
export const SLOT_PROFILE: Record<string, Record<string, number>[]> = {
  helmet: [{ hp: 0.6, critPct: 0.4 }, { hp: 0.5, cdrPct: 0.5 }, { armor: 0.4, hp: 0.6 }],
  armor: [{ armor: 0.6, hp: 0.4 }, { armor: 0.45, hp: 0.4, regen: 0.15 }, { armor: 0.7, hp: 0.3 }],
  legs: [{ speedPct: 0.5, armor: 0.5 }, { armor: 0.7, speedPct: 0.3 }, { speedPct: 0.6, regen: 0.4 }],
  hands: [{ atkSpeedPct: 0.6, critPct: 0.4 }, { armor: 0.5, lifestealPct: 0.5 }, { critPct: 0.6, magnetPct: 0.4 }],
  weapon: [{ critPct: 1 }, { atkSpeedPct: 1 }, { lifestealPct: 1 }, { cdrPct: 1 }],
};
// Требуемый уровень героя = уровень предмета − 1 (минимум 1): трофей своего уровня можно надеть сразу
// Предмет уровня N может надеть только герой уровня ≥ N (проверяет сервер при equip)
export function itemReqLevel(itemLevel: number): number { return Math.max(1, Math.floor(itemLevel || 1)); }

// ---------------- шансы дропа (в процентах за убийство) ----------------
// Обычные мобы: шанс на КАЖДЫЙ предмет комплекта. Части облика/с навыком — в 2 раза реже.
export const DROP_PCT: Record<string, number> = { common: 5.5, uncommon: 3.5, rare: 1.0, epic: 0.3, legendary: 0.16, mythic: 0.12 }; // +~35% шансы (что падает — без изменений)
// Боссы (большие/огромные): шансы выше — их убивают редко и группой; уникальная мифическая вещь — 0.1%
export const BOSS_DROP_PCT: Record<string, number> = { common: 48, uncommon: 32, rare: 13, epic: 4, legendary: 1.1, mythic: 0.14 };
// Редкие мобы (rare spawn): между обычными и боссами
export const RARE_DROP_PCT: Record<string, number> = { common: 26, uncommon: 16, rare: 7, epic: 1.6, legendary: 0.55, mythic: 0.12 };
export const SET_PIECE_MULT = 0.5;

// ---------------- эталонный герой ----------------
export function refHero(L: number) {
  const baseHp = 118, baseArmor = 4;                     // среднее по 4 героям (heroBase)
  const b = itemBudget(L, "uncommon");
  const gearHp = (0.55 * b + 0.4 * b) / 0.4 * 0.5;       // шлем+броня (половина бюджета в ХП)
  const gearArmor = 0.6 * b + 0.5 * b + 0.15 * b;        // броня, ноги, руки
  const talentHp = Math.min(30, 6 * 0.12 * (L - 1));
  const hp = baseHp + 2 * (L - 1) + gearHp + talentHp;
  const armor = baseArmor + gearArmor + Math.min(10, 0.08 * (L - 1) * 2);
  const red = Math.min(0.6, armor / (armor + 60));
  const dmgPct = Math.min(40, 0.9 * (L - 1));
  const crit = Math.min(30, 5 + 0.45 * (L - 1)) / 100;
  const hit = (7.5 + weaponAvg(L, "uncommon")) * (1 + dmgPct / 100) * (1 + 0.75 * crit);
  const atkPerSec = 1 / 0.45 * (1 + Math.min(20, 0.3 * L) / 100);
  const dps = hit * atkPerSec * 1.25;                     // навыки ≈ +25%
  return { hp: Math.round(hp), armor: Math.round(armor), red, ehp: hp / (1 - red), hit, dps };
}

// ---------------- мобы ----------------
export function ttkTarget(L: number): number { return 3.5 + 2.5 * (L - 1) / 24; }
export function mobArmor(L: number): number { return Math.round(L * 0.9); }
export const ROLE_MULT: Record<string, { hp: number; dmg: number; speed: number; xp: number }> = {
  melee: { hp: 1, dmg: 1, speed: 1, xp: 1 },
  swarm: { hp: 0.45, dmg: 0.6, speed: 1.3, xp: 0.45 },
  charger: { hp: 0.85, dmg: 1.2, speed: 1.15, xp: 1 },
  ranged: { hp: 0.75, dmg: 1.05, speed: 0.85, xp: 1 },
  caster: { hp: 0.8, dmg: 1.25, speed: 0.8, xp: 1.1 },
  tank: { hp: 1.9, dmg: 0.9, speed: 0.7, xp: 1.5 },
};
export const SIZE_MULT: Record<string, { hp: number; dmg: number; xp: number }> = {
  s: { hp: 1, dmg: 1, xp: 1 },
  l: { hp: 3.2, dmg: 1.3, xp: 3 },        // крупный (32×32/32×40) — мини-боссы, редкие
  boss: { hp: 26, dmg: 1.7, xp: 22 },     // крупный босс
  huge: { hp: 60, dmg: 2.1, xp: 50 },     // огромный (64×64+), многофазный мировой босс
};
export function mobStats(L: number, role = "melee", size = "s") {
  const h = refHero(L), R = ROLE_MULT[role] || ROLE_MULT.melee, S = SIZE_MULT[size] || SIZE_MULT.s;
  const armor = mobArmor(L) * (role === "tank" || size !== "s" ? 1.5 : 1);
  const armorRed = Math.min(0.6, armor / (armor + 60));
  const hp = h.dps * ttkTarget(L) / (1 - armorRed) * R.hp * S.hp;
  const dmgHit = h.ehp / 40 * 1.1 * R.dmg * S.dmg;        // удар раз в 1.1 с: один моб убивает эталонного героя за ~40 с
  return { hp: Math.round(hp), dmg: Math.round(dmgHit * 10) / 10, armor: Math.round(armor), xp: Math.round(mobXp(L) * R.xp * S.xp), speedMult: R.speed };
}
