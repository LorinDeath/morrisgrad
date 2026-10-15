import { CURSE } from "./cursed";
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
  let kind = (o.elite ? KILL_XP.elite : 1) * (o.cursed ? CURSE.mobXp : 1);
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

// ---------------- предметы: ФИКСИРОВАННАЯ сила (rebalance-v2 — крупная шкала) ----------------
export const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;
export type Rarity = (typeof RARITY_ORDER)[number];
export const RARITY_BUDGET: Record<string, number> = { common: 1, uncommon: 1.2, rare: 1.45, epic: 1.75, legendary: 2.05, mythic: 2.4 };
export const RARITY_DMG: Record<string, number> = { common: 1, uncommon: 1.12, rare: 1.28, epic: 1.5, legendary: 1.7, mythic: 2.0 };
/** Бюджет не-оружия: L25 uncommon ≈ 700 → шлем ~1000 HP или ~100 брони. */
export function itemBudget(L: number, rarity: string): number {
  return (18 + 10 * L + 0.72 * L * L) * (RARITY_BUDGET[rarity] || 1);
}
/** Средний урон оружия: L25 epic ≈ 320 → min~160 max~480 (широкий разброс в gen). */
export function weaponAvg(L: number, rarity: string): number {
  return (12 + 5.2 * L + 0.2 * L * L) * (RARITY_DMG[rarity] || 1);
}
/** Оружие: DPS-бюджет равен на уровне; медленное — крупный удар, быстрое — мелкий.
 *  hit = weaponAvg × (cd / WEAPON_REF_CD) / (сумма долей залпа). */
export const WEAPON_REF_CD = 480;
export const WEAPON_VOLLEY: Record<string, number> = { daggers: 1.12, fly_blades: 1.2 };
export const WEAPON_CD: Record<string, number> = { spear: 520, daggers: 340, book: 450, staff: 560, sword: 480, bow: 560, axe: 640, fly_blades: 360, moon_blade: 480 };
export function weaponHitMult(wtype?: string): number {
  if (!wtype) return 1;
  return (WEAPON_CD[wtype] || WEAPON_REF_CD) / WEAPON_REF_CD / (WEAPON_VOLLEY[wtype] || 1);
}

/** Аффиксы (ядро ARPG): предмет = список типизированных строк с бюджетом уровня/редкости.
 *  Хуки на будущее: upgrade (заточка) и set (комплект) — множители/доп. строки поверх бюджета. */
export type AffixKind = "implicit" | "prefix" | "suffix" | "upgrade" | "enchant" | "set";
export interface AffixLine { stat: string; value: number; kind: AffixKind; budget: number }
/** Заточка +N: +6% к каждой строке за уровень, кап +10 (пока не включено в игру). */
export const UPGRADE_STEP = 0.06, UPGRADE_MAX = 10;
export function upgradeMult(lvl = 0): number { return 1 + UPGRADE_STEP * Math.max(0, Math.min(UPGRADE_MAX, lvl)); }
/** Комплекты: 2/4 предмета → бонусы (реестр пуст; заполнит админка/будущая фича). */
export const SET_BONUSES: Record<string, { pieces: number; stats: Record<string, number> }[]> = {};
/** Один предмет не больше этой доли бюджета в одну строку (запрет «перегруза»). */
export const AFFIX_MAX_SHARE = 0.75;
/** Кап одной строки на одном предмете (итог героя дополнительно режут STAT_CAPS + softCap). */
export const ITEM_LINE_CAP: Record<string, number> = { critPct: 9, lifestealPct: 4, atkSpeedPct: 10, cdrPct: 10, speedPct: 10, regen: 3, magnetPct: 30, armorPen: 22, armorPenPct: 10 };
export const STAT_COST: Record<string, number> = { armor: 1, hp: 0.4, critPct: 1.5, speedPct: 1.2, cdrPct: 1.5, regen: 10, lifestealPct: 3, atkSpeedPct: 1.4, magnetPct: 0.2, dmgMin: 1, dmgMax: 1, armorPen: 1.2, armorPenPct: 2.5 };

/** Архетипы шмота (роль от экипа, не от класса). Любой класс носит любой предмет. */
export type GearArchetype = "tank" | "bruiser" | "assassin" | "caster" | "balanced";
export const ARCHETYPE_SLOT: Record<GearArchetype, Record<string, Record<string, number>[]>> = {
  tank: {
    helmet: [{ hp: 0.7, armor: 0.25, armorPen: 0.05 }, { armor: 0.55, hp: 0.4, armorPenPct: 0.05 }],
    armor: [{ armor: 0.65, hp: 0.3, armorPen: 0.05 }, { armor: 0.5, hp: 0.4, regen: 0.1 }],
    legs: [{ armor: 0.6, hp: 0.35, armorPen: 0.05 }, { armor: 0.5, speedPct: 0.2, hp: 0.3 }],
    hands: [{ armor: 0.4, armorPen: 0.3, lifestealPct: 0.15, hp: 0.15 }, { armor: 0.35, lifestealPct: 0.25, armorPenPct: 0.25, hp: 0.15 }],
    weapon: [{ armorPen: 0.7, armorPenPct: 0.3 }, { armorPenPct: 1 }, { lifestealPct: 1 }],
  },
  bruiser: {
    helmet: [{ hp: 0.35, armor: 0.2, critPct: 0.35, armorPen: 0.1 }, { hp: 0.4, armor: 0.4, armorPenPct: 0.2 }],
    armor: [{ armor: 0.35, hp: 0.3, critPct: 0.2, regen: 0.15 }, { armor: 0.4, hp: 0.35, armorPen: 0.25 }],
    legs: [{ speedPct: 0.3, armor: 0.25, critPct: 0.25, hp: 0.2 }, { armor: 0.4, speedPct: 0.4, armorPenPct: 0.2 }],
    hands: [{ atkSpeedPct: 0.25, critPct: 0.35, armorPen: 0.25, armor: 0.15 }, { lifestealPct: 0.25, armorPenPct: 0.25, critPct: 0.25, armor: 0.25 }],
    weapon: [{ critPct: 0.65, armorPenPct: 0.35 }, { armorPen: 1 }, { lifestealPct: 1 }, { atkSpeedPct: 1 }],
  },
  assassin: {
    helmet: [{ critPct: 0.55, speedPct: 0.25, hp: 0.2 }, { critPct: 0.45, atkSpeedPct: 0.35, hp: 0.2 }],
    armor: [{ speedPct: 0.4, critPct: 0.35, hp: 0.25 }, { hp: 0.35, speedPct: 0.35, cdrPct: 0.3 }],
    legs: [{ speedPct: 0.7, critPct: 0.3 }, { speedPct: 0.55, atkSpeedPct: 0.45 }],
    hands: [{ critPct: 0.45, atkSpeedPct: 0.4, lifestealPct: 0.15 }, { atkSpeedPct: 0.5, critPct: 0.35, lifestealPct: 0.15 }],
    weapon: [{ critPct: 1 }, { atkSpeedPct: 1 }, { lifestealPct: 1 }],
  },
  caster: {
    helmet: [{ cdrPct: 0.45, critPct: 0.35, hp: 0.2 }, { cdrPct: 0.5, magnetPct: 0.2, critPct: 0.3 }],
    armor: [{ cdrPct: 0.4, hp: 0.35, critPct: 0.25 }, { hp: 0.4, cdrPct: 0.4, regen: 0.2 }],
    legs: [{ speedPct: 0.4, cdrPct: 0.4, hp: 0.2 }, { cdrPct: 0.5, speedPct: 0.5 }],
    hands: [{ critPct: 0.4, cdrPct: 0.4, atkSpeedPct: 0.2 }, { cdrPct: 0.45, critPct: 0.35, magnetPct: 0.2 }],
    weapon: [{ cdrPct: 1 }, { critPct: 1 }, { atkSpeedPct: 1 }],
  },
  balanced: {
    helmet: [{ hp: 0.6, critPct: 0.4 }, { hp: 0.5, cdrPct: 0.5 }, { armor: 0.4, hp: 0.6 }],
    armor: [{ armor: 0.6, hp: 0.4 }, { armor: 0.45, hp: 0.4, regen: 0.15 }, { armor: 0.7, hp: 0.3 }],
    legs: [{ speedPct: 0.5, armor: 0.5 }, { armor: 0.7, speedPct: 0.3 }, { speedPct: 0.6, regen: 0.4 }],
    hands: [{ atkSpeedPct: 0.6, critPct: 0.4 }, { armor: 0.5, lifestealPct: 0.5 }, { critPct: 0.6, magnetPct: 0.4 }],
    weapon: [{ critPct: 1 }, { atkSpeedPct: 1 }, { lifestealPct: 1 }, { cdrPct: 1 }],
  },
};
/** Совместимость: старый SLOT_PROFILE = balanced. */
export const SLOT_PROFILE: Record<string, Record<string, number>[]> = ARCHETYPE_SLOT.balanced;

export function itemReqLevel(itemLevel: number): number { return Math.max(1, Math.floor(itemLevel || 1)); }

// ---------------- шансы дропа ----------------
export const DROP_PCT: Record<string, number> = { common: 5.5, uncommon: 3.5, rare: 1.0, epic: 0.3, legendary: 0.16, mythic: 0.12 };
export const BOSS_DROP_PCT: Record<string, number> = { common: 48, uncommon: 32, rare: 13, epic: 4, legendary: 1.1, mythic: 0.14 };
export const RARE_DROP_PCT: Record<string, number> = { common: 26, uncommon: 16, rare: 7, epic: 1.6, legendary: 0.55, mythic: 0.12 };
export const SET_PIECE_MULT = 0.5;

/** Плоская броня мобов: урон = max(5% raw, raw − armor). Низкий уровень vs высокий — почти 0. */
export const ARMOR_SOAK = 1;
/** Эффективная броня после пробития: % сначала, затем плоское. */
export function effectiveArmor(armor: number, penFlat = 0, penPct = 0): number {
  const a = Math.max(0, armor || 0);
  return Math.max(0, a * (1 - Math.min(0.75, Math.max(0, penPct) / 100)) - Math.max(0, penFlat));
}
export function mitigateDamage(raw: number, armor: number, penFlat = 0, penPct = 0): number {
  if (!(raw > 0)) return 0;
  const a = effectiveArmor(armor, penFlat, penPct);
  return Math.max(1, Math.round(Math.max(raw * 0.05, raw - a * ARMOR_SOAK)));
}

// ---------------- эталонный герой (средняя сборка bruiser) ----------------
export function refHero(L: number) {
  const baseHp = 120, baseArmor = 8;
  const b = itemBudget(L, "uncommon");
  // 5 слотов: шлем+броня ≈ hp, броня/ноги/руки ≈ armor, оружие ≈ dmg
  const gearHp = (0.55 * b) / 0.4 + (0.35 * b) / 0.4; // ~2 слота в HP
  const gearArmor = 0.55 * b + 0.45 * b + 0.25 * b;
  const talentHp = Math.min(80, 4 * (L - 1));
  const hp = baseHp + 8 * (L - 1) + gearHp + talentHp;
  const armor = baseArmor + gearArmor + 2 * (L - 1);
  const red = Math.min(0.7, armor / (armor + 250));
  const dmgPct = Math.min(50, 1.2 * (L - 1));
  const crit = Math.min(40, 6 + 0.6 * (L - 1)) / 100;
  const hit = (10 + weaponAvg(L, "uncommon")) * (1 + dmgPct / 100) * (1 + 0.75 * crit);
  const atkPerSec = 1 / 0.45 * (1 + Math.min(35, 0.5 * L) / 100);
  const dps = hit * atkPerSec * 1.3; // навыки + DoT
  return { hp: Math.round(hp), armor: Math.round(armor), red, ehp: hp / (1 - red), hit, dps };
}

/** Сборка архетипа для сима: итоговые hp/armor/hit как будто надет полный сет. */
export function refBuild(L: number, arch: GearArchetype, rarity = "uncommon") {
  const b = itemBudget(L, rarity);
  const wa = weaponAvg(L, rarity);
  const slots = ["helmet", "armor", "legs", "hands"] as const;
  let hp = 120 + 8 * (L - 1), armor = 8 + 2 * (L - 1), crit = 5, atkSp = 0, life = 0, cdr = 0, penFlat = 0, penPct = 0;
  const profiles = ARCHETYPE_SLOT[arch];
  const addLine = (k: string, raw: number) => {
    const cap = ITEM_LINE_CAP[k];
    const v = cap != null ? Math.min(cap, raw) : raw;
    if (k === "hp") hp += v; else if (k === "armor") armor += v; else if (k === "critPct") crit += v;
    else if (k === "atkSpeedPct") atkSp += v; else if (k === "lifestealPct") life += v; else if (k === "cdrPct") cdr += v;
    else if (k === "armorPen") penFlat += v; else if (k === "armorPenPct") penPct += v;
  };
  for (const slot of slots) {
    const prof = profiles[slot][0];
    for (const [k, f] of Object.entries(prof)) addLine(k, (b * Math.min(AFFIX_MAX_SHARE, f)) / (STAT_COST[k] || 1));
  }
  const wp = profiles.weapon[0];
  for (const [k, f] of Object.entries(wp)) addLine(k, (b * 0.35 * Math.min(AFFIX_MAX_SHARE, f)) / (STAT_COST[k] || 1));
  const dmgMult = arch === "caster" ? 1.25 : arch === "assassin" ? 1.15 : arch === "tank" ? 1.0 : 1;
  const hpMult = arch === "tank" ? 1.35 : arch === "caster" ? 0.7 : arch === "assassin" ? 0.8 : 1;
  const armMult = arch === "tank" ? 1.4 : arch === "caster" ? 0.55 : arch === "assassin" ? 0.65 : 1;
  hp *= hpMult; armor *= armMult;
  // ITEM_LINE_CAP уже применён; softCap/STAT_CAPS — на герое (profile / sim)
  penFlat = Math.min(90, penFlat); penPct = Math.min(40, penPct);
  const hit = (10 + wa * dmgMult) * (1 + Math.min(0.5, (L - 1) * 0.012));
  const atkPerSec = (1 / 0.45) * (1 + Math.min(50, atkSp) / 100);
  const skill = arch === "caster" ? 1.55 : arch === "assassin" ? 1.35 : 1.25;
  const dps = hit * (1 + 0.75 * Math.min(0.55, crit / 100)) * atkPerSec * skill;
  const red = Math.min(0.7, armor / (armor + 250));
  return { hp: Math.round(hp), armor: Math.round(armor), red, ehp: hp / (1 - red), hit, dps, crit, atkSp, life, penFlat: Math.round(penFlat), penPct: Math.round(penPct * 10) / 10, arch, wMin: Math.round(wa * dmgMult * 0.55), wMax: Math.round(wa * dmgMult * 1.45) };
}

// ---------------- мобы ----------------
export function ttkTarget(L: number): number { return 5.5 + 2.5 * (L - 1) / 24; }
/** Броня моба ≈ 0.85× средний удар эталона — ниже уровнем почти не пробивает (flat soak). */
export function mobArmor(L: number): number { return Math.round(weaponAvg(L, "uncommon") * 0.58); }
export const ROLE_MULT: Record<string, { hp: number; dmg: number; speed: number; xp: number }> = {
  melee: { hp: 1, dmg: 1, speed: 1, xp: 1 },
  swarm: { hp: 0.45, dmg: 0.6, speed: 1.35, xp: 0.45 },
  charger: { hp: 0.85, dmg: 1.2, speed: 1.2, xp: 1 },
  ranged: { hp: 0.75, dmg: 1.1, speed: 0.9, xp: 1 },
  caster: { hp: 0.8, dmg: 1.3, speed: 0.85, xp: 1.1 },
  tank: { hp: 2.0, dmg: 0.9, speed: 0.7, xp: 1.5 },
};
export const SIZE_MULT: Record<string, { hp: number; dmg: number; xp: number }> = {
  s: { hp: 1, dmg: 1, xp: 1 },
  l: { hp: 3.5, dmg: 1.4, xp: 3 },
  // Мировые боссы: расчёт под рейд 5 игроков ~4–5 мин на своём уровне (миллионы HP к 20–25)
  boss: { hp: 180, dmg: 1.55, xp: 40 },
  huge: { hp: 420, dmg: 1.65, xp: 80 },
};
/** Соло vs мировой босс: нужно опережать уровень на OUTLEVEL_SOLO_BOSS (kite/пробитие). */
export const OUTLEVEL_SOLO_BOSS = 9;
/** Урон моба по герою от разницы уровней: герой выше — ×0.8/ур. (мин 0.1), ниже — ×1.12/ур. (макс 2.5). */
/** Урон героя по мобу выше уровнем: −18%/ур. (мин 0.35) — gap hard. */
export function levelGapHitMult(mobL: number, heroL: number): number {
  const g = (mobL || 1) - (heroL || 1);
  if (g <= 0) return 1;
  // ранние уровни: сильнее режет удар (длинный gap-бой); к 25 — мягче
  const per = 0.65 + 0.32 * Math.max(0, (heroL || 1) - 1) / 24;
  return Math.max(0.35, Math.pow(per, g));
}
export function levelGapDmgMult(mobL: number, heroL: number): number {
  const g = (heroL || 1) - (mobL || 1);
  if (g >= 0) return Math.max(0.1, Math.pow(0.82, g));
  const under = -g;
  // ранние уровни: моб бьёт больнее vs underlevel (gap drain); к 25 — мягче
  const per = 1.92 - 0.78 * Math.max(0, (heroL || 1) - 1) / 24;
  return Math.min(2.6, Math.pow(per, Math.min(2, under)) * Math.pow(1.1, Math.max(0, under - 2)));
}
/** Целевой TTK рейда из 5 на боссе своего уровня (сек). */
export const BOSS_RAID_TTK = 220;
export function mobStats(L: number, role = "melee", size = "s") {
  const h = refHero(L), R = ROLE_MULT[role] || ROLE_MULT.melee, S = SIZE_MULT[size] || SIZE_MULT.s;
  const press = soloPressure(L);
  const isWorld = size === "boss" || size === "huge";
  // мировой босс: броня ниже обычной (рейд пробивает), но героя ниже уровнем — гасит
  const armor = Math.round(mobArmor(L) * (isWorld ? 0.55 : role === "tank" || size !== "s" ? 1.4 : 1) * press);
  const effHit = Math.max(h.hit * 0.05, h.hit - armor);
  const effDps = h.dps * (effHit / Math.max(1, h.hit));
  let hp: number;
  if (isWorld) {
    // Рейд из 5 на своём уровне ~4.5 мин; huge чуть толще. Соло своего уровня — не успевает до enrage.
    // сырой DPS рейда (5 сборок своего уровня + навыки/DoT) × ~4.5 мин → миллионы HP
    let raid = 0; // эффективный DPS рейда из 5 архетипов своего уровня (с учётом брони босса)
    for (const a of ["tank", "caster", "assassin", "bruiser", "balanced"] as GearArchetype[]) { const rb = refBuild(L, a); const eh = mitigateDamage(rb.hit, armor, rb.penFlat || 0, rb.penPct || 0); raid += eh / Math.max(1, rb.hit) * rb.dps; }
    hp = raid * BOSS_RAID_TTK;
  } else {
    hp = effDps * ttkTarget(L) * R.hp * S.hp * press;
  }
  const deathT = isWorld ? 140 : (36 - 6 * (L - 1) / 24); // мировой босс: фокус танка ~25–40 с
  const dmgHit = (h.ehp / deathT) * 1.1 * R.dmg * S.dmg * press;
  return { hp: Math.round(hp), dmg: Math.round(dmgHit * 10) / 10, armor: Math.round(armor), xp: Math.round(mobXp(L) * R.xp * S.xp * (isWorld ? 1 : 1)), speedMult: R.speed };
}

