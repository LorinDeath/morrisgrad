// «Зачарованные»: ярусы 1…6 (Необычный … Чёрный). Все настройки — ENCH (админка «✦ Зачарование»,
// kind='ench' id='main' в game_overrides; здесь — только исходные значения, наложение — overrides.applyOverride, живьём).
// Как и проклятие — флаг экземпляра (item_instances.ench / InvItem.ench 0…6) и моба (ZMob.ench). Ставит только сервер.
// Статы считаются на лету: база (с правками админки) × проклятие × ярус → +улучшение.
export const ENCH_N = 6;
export type EnchTier = {
  name: string; color: string; stat: number;               // имя яруса, цвет, статы вещи ×
  spawnPct: number; boss: boolean;                         // шанс моба %, может ли быть боссом/мировым
  mobHp: number; mobDmg: number; mobArmor: number; mobXp: number; regen: number; // моб: ×, регенерация % макс. ОЗ/с
  dropMult: number; itemChance: number;                    // моб: обычные вещи/материалы ×; копия яруса: шанс строки ×
  skMin: number; skMax: number; killer: boolean;           // случайные навыки; «убийца» — скорость/рывок/агрессия как у проклятого
  upPct: number; matMult: number;                          // улучшение у Петра: +% ко всем статам за уровень; материалов ×
};
const T = (name: string, color: string, stat: number, spawnPct: number, hp: number, dmg: number, armor: number, xp: number, regen: number, dropMult: number, itemChance: number, skMin: number, skMax: number, upPct: number, matMult: number, killer = false): EnchTier =>
  ({ name, color, stat, spawnPct, boss: true, mobHp: hp, mobDmg: dmg, mobArmor: armor, mobXp: xp, regen, dropMult, itemChance, skMin, skMax, killer, upPct, matMult });
export const ENCH: { on: boolean; comboPct: number; cursedRegen: number; dropLower: boolean; tiers: EnchTier[] } = {
  on: true,
  comboPct: 0.1,      // проклятый моб / проклятая копия вещи: доп. шанс %, что она ещё и зачарована (ярус — по весам spawnPct)
  cursedRegen: 1,     // регенерация проклятого моба, % макс. ОЗ/с (в бою тоже; анти-кайт)
  dropLower: true,    // зачарованный моб роняет копии своего яруса И младших
  tiers: [
    //  имя            цвет       стат  шанс  ОЗ   урон бр.  опыт  реген дроп  копия нав.   ул.%  мат.
    T("Необычный",   "#4ade80", 1.5,  6,    1.5, 1.2, 1.2, 1.5,  0.1,  1.5,  1,    0, 0,   0.2,  2),
    T("Редкий",      "#3b82f6", 1.8,  3,    2.5, 1.5, 1.4, 2,    0.1,  2,    0.8,  0, 0,   0.4,  4),
    T("Странный",    "#ec4899", 2,    1.5,  4,   2,   2,   2.5,  0.1,  2.5,  0.6,  0, 1,   0.7,  8),
    T("Легендарный", "#facc15", 3,    0.6,  7,   3,   3,   3,    0.1,  3,    0.4,  1, 2,   1.2,  16),
    T("Божественный","#ef4444", 4,    0.2,  12,  6,   6,   3.5,  1,    4,    0.25, 2, 4,   2,    32),
    // Чёрный: ОЗ/урон/опыт = 2× живых проклятых (×20/×20/×4); броня — отдельно ×8 (броня режет каждый удар на N очков, ARMOR_SOAK=1:
    // ×40 у босса с бронёй 26 = 1040 → почти любой удар героя упирается в минимум 5%)
    T("Чёрный",      "#0a0a0a", 10,   0.05, 40,  40,  8,   8,    1,    8,    0.15, 3, 6,   5,    64, true),
  ],
};
export const tierOk = (n: any) => Number.isInteger(n) && n >= 1 && n <= ENCH_N;
export const tierDef = (n: any): EnchTier | null => (tierOk(n) ? ENCH.tiers[n - 1] : null);
// пометки броска/мешка (только сервер): "item@e3", "item@e3@c" (порядок суффиксов любой)
export function parseTag(s: string): { id: string; c: boolean; e: number } {
  let id = String(s), c = false, e = 0;
  for (;;) {
    if (id.endsWith("@c")) { c = true; id = id.slice(0, -2); continue; }
    const m = /@e([1-6])$/.exec(id); if (m) { e = +m[1]; id = id.slice(0, -3); continue; }
    break;
  }
  return { id, c, e };
}
export const tagOf = (id: string, c: boolean, e: number) => id + (tierOk(e) ? "@e" + e : "") + (c ? "@c" : "");
/** Статы яруса: числовые × stat (целые — целыми, доли — 1 знак), как cursedStats. */
export function enchStats<T extends Record<string, any>>(st: T | undefined | null, tier: number): T {
  const t = tierDef(tier); if (!t) return (st || {}) as T;
  const o: any = {}, k = Number(t.stat) || 1;
  for (const [key, v] of Object.entries(st || {})) o[key] = typeof v === "number" ? (Number.isInteger(v) ? Math.round(v * k) : Math.round(v * k * 10) / 10) : v;
  return o;
}
/** Ярус по весам spawnPct (для доп. шанса проклятых): r ∈ [0,1). boss — только ярусы, разрешённые боссам. */
export function weightedTier(r: number, boss = false): number {
  const ok = ENCH.tiers.map((t, i) => (boss && !t.boss ? 0 : Math.max(0, Number(t.spawnPct) || 0)) * 1).map((w, i) => [i + 1, w] as [number, number]).filter(([, w]) => w > 0);
  const sum = ok.reduce((s, [, w]) => s + w, 0); if (!sum) return 0;
  let x = r * sum; for (const [n, w] of ok) { if (x < w) return n; x -= w; }
  return ok[ok.length - 1][0];
}
/** Бросок яруса моба при появлении: от старшего к младшему, каждый — свой шанс %. rnd — ГСЧ зоны. */
export function rollMobTier(rnd: () => number, o: { boss?: boolean; cursed?: boolean } = {}): number {
  if (!ENCH.on) return 0;
  if (o.cursed) return rnd() * 100 < (Number(ENCH.comboPct) || 0) ? weightedTier(rnd(), !!o.boss) : 0;
  for (let n = ENCH_N; n >= 1; n--) { const t = ENCH.tiers[n - 1]; if (o.boss && !t.boss) continue; if (rnd() * 100 < (Number(t.spawnPct) || 0)) return n; }
  return 0;
}
/** Регенерация моба, % макс. ОЗ/с: проклятый — cursedRegen, ярус — свой; оба — большее. */
export function mobRegenPct(m: { cursed?: boolean; ench?: number }): number {
  const t = tierDef(m.ench); return Math.max(m.cursed ? Number(ENCH.cursedRegen) || 0 : 0, t ? Number(t.regen) || 0 : 0);
}
export function enchClient() { return JSON.parse(JSON.stringify(ENCH)); }
