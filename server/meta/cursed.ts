// Проклятие: все настройки — CURSE (правится в админке, вкладка «Проклятие», kind='curse' id='main' в game_overrides;
// значения ниже — только исходные из кода, наложение правки — overrides.applyOverride, живьём по версии конфига).
// Проклятые вещи — НЕ отдельные предметы, а флаг экземпляра (item_instances.cursed / InvItem.cursed).
// Статы считаются на лету от базового определения (с правками админки) × statMult — правка базы меняет и проклятую версию.
export const CURSE = {
  equipDropMult: 10,     // шанс дропа ЭКИПИРОВКИ ×N во всех таблицах (материалы не трогаются), кламп 100%
  mobDropMult: 10,       // проклятый моб/босс: множитель шанса ОБЫЧНЫХ вещей и материалов
  itemChanceMult: 1,     // проклятая версия вещи (только с проклятых боссов): шанс = базовый (после equipDropMult) × N, отдельный бросок
  bossOnly: true,        // проклятые вещи падают только с проклятых боссов (мировые/подземельные); false — с любых проклятых
  statMult: 1.5,         // статы проклятой вещи ×
  rsMult: 2,             // урон навыка R проклятого оружия ×
  mobHp: 4.5, mobDmg: 2.2, mobArmor: 1.45, mobXp: 2, // проклятый моб: ОЗ/урон/броня/опыт ×
  glow1: 0.3, glow2: 0.5, glow3: 0.65, glow4: 0.8, glow5: 1, // яркость свечения героя по числу надетых проклятых вещей (5 = полный комплект, пульсирует)
  tint: "#a855f7",       // цвет проклятия (рамка, свечение, шейдер навыка)
};
export const CURSED_TAG = "@c"; // пометка в броске/мешке: "item_id@c" (только сервер)
export const isCursedTag = (s: string) => typeof s === "string" && s.endsWith(CURSED_TAG);
export const untag = (s: string) => (isCursedTag(s) ? s.slice(0, -CURSED_TAG.length) : s);
/** Статы проклятой версии: все числовые строки × statMult (целые остаются целыми, доли — 1 знак). */
export function cursedStats<T extends Record<string, any>>(st: T | undefined | null): T {
  const o: any = {}, k0 = CURSE.statMult;
  for (const [k, v] of Object.entries(st || {})) o[k] = typeof v === "number" ? (Number.isInteger(v) ? Math.round(v * k0) : Math.round(v * k0 * 10) / 10) : v;
  return o;
}
export function instStats(def: any, inst?: { cursed?: any } | null) { return inst?.cursed ? cursedStats(def?.stats) : def?.stats || {}; }
export const FULL_SET = 5; // слотов экипировки (SLOTS)
/** Уровень свечения = число надетых проклятых (0..5); яркость — CURSE.glowN (клиент получает конфиг). */
export function glowLevel(nCursed: number): number { return Math.max(0, Math.min(FULL_SET, nCursed | 0)); }
export function curseClient() { return { ...CURSE }; }
