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
// MMORPG-темп обычного режима (открытый мир, квесты, хаб): уровень — это долгий гринд.
// Сколько убийств моба СВОЕГО уровня нужно на переход L → L+1: 40 на 1→2, дальше круто растёт.
// Уровни забегов (Vampire Like) — отдельные и быстрые (survivors/data.js), в профиль не пишутся.
export const KPL = { base: 40, k: 110, p: 1.2 };
export function killsPerLevel(L: number): number { return KPL.base + KPL.k * Math.pow(Math.max(0, L - 1), KPL.p); }
export function xpNeed(L: number): number { return Math.round(mobXp(L) * killsPerLevel(L)); } // подобрано симуляцией (tools/sim/progression.mjs)
// Опыт за обычного моба уровня L
export function mobXp(L: number): number { return Math.round(5 + 2.4 * Math.pow(L, 1.42)); }
// Поправка опыта за разницу уровней (моб − герой): серые мобы почти ничего не дают, «красные» — бонус
const BELOW_MULT = [1, 0.8, 0.55, 0.3, 0.1, 0];
export function xpLevelMult(mobL: number, heroL: number): number {
  const d = mobL - heroL;
  // сильнее героя — больше опыта, но с убывающей отдачей: +1 → ×1.14, +3 → ×1.32, +5 → ×1.41, потолок ×1.5
  if (d >= 0) return 1 + 0.5 * (1 - Math.exp(-d / 3));
  return BELOW_MULT[Math.min(BELOW_MULT.length - 1, -d)]; // −1 → 80%, −2 → 55%, −3 → 30%, −4 → 10%, ≤ −5 → 0
}
// Опыт за убийство (открытый мир). Старое: xp = d.xp × (элита ? 2.5 : 1) × xpLevelMult (потолок ×1.25 при +5).
// Новое: множители «силы» (элита ×2.5, проклятый ×3) перемножаются и мягко ограничиваются (≤ ×6),
// а итог одного убийства не больше доли опыта до следующего уровня героя (обычный ≤ 6%, босс ≤ 30%) —
// сильные враги ценнее, но не «перекачивают»; серые мобы (≤ −5 ур.) по-прежнему 0.
export const KILL_XP = { elite: 2.5, cursed: 3, softFrom: 2, softMax: 6, capMob: 0.06, capBoss: 0.3 };
export function killXp(o: { xp: number; mobL: number; heroL: number; elite?: boolean; cursed?: boolean; boss?: boolean }): number {
  const raw = (o.elite ? KILL_XP.elite : 1) * (o.cursed ? KILL_XP.cursed : 1);
  const K = KILL_XP, kind = raw <= K.softFrom ? raw : K.softFrom + (K.softMax - K.softFrom) * (1 - Math.exp(-(raw - K.softFrom) / (K.softMax - K.softFrom)));
  const xp = o.xp * kind * xpLevelMult(o.mobL, o.heroL);
  const cap = xpNeed(o.heroL) * (o.boss ? K.capBoss : K.capMob);
  return Math.round(Math.min(xp, cap));
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
export const DROP_PCT: Record<string, number> = { common: 4, uncommon: 2.5, rare: 0.7, epic: 0.2, legendary: 0.12, mythic: 0.1 };
// Боссы (большие/огромные): шансы выше — их убивают редко и группой; уникальная мифическая вещь — 0.1%
export const BOSS_DROP_PCT: Record<string, number> = { common: 40, uncommon: 25, rare: 10, epic: 3, legendary: 0.8, mythic: 0.1 };
// Редкие мобы (rare spawn): между обычными и боссами
export const RARE_DROP_PCT: Record<string, number> = { common: 20, uncommon: 12, rare: 5, epic: 1.2, legendary: 0.4, mythic: 0.1 };
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
