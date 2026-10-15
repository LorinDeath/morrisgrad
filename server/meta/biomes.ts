// Биомы Аринара (48000×48000 px): центральный хаб + 4 стихийных края вокруг него.
// Мобы биомов — «варианты» существующих Отголосков бестиария: тот же спрайт (spr) с перекраской
// (tint — множитель RGB в SpriteBatch), уровень/статы пересчитаны кривыми balance.ts под уровень биома.
// Трофеи, запись бестиария и квесты считаются по базовому мобу (base) — у варианта нет своего комплекта.
// Клиентобезопасно (только balance + публичные данные). Порядок VARIANTS фиксирован: варианты
// дописываются в конец ZONE_MOBS (сервер) и MOB_INFO (клиент) — индекс типа в zone_state совпадает.
import { mobStats, tierOf } from "./balance";
import { MOBS_PUBLIC } from "./generated/public";

export type BiomeId = "ice" | "fire" | "stone" | "air";
export interface BiomeDef {
  id: BiomeId; name: string; theme: string; lvl: [number, number]; tint: [number, number, number];
  tiles: string; color: string; // тайлсет (src/assets/mc/tiles_<tiles>.png) и цвет на миникарте
}
export const BIOMES: Record<BiomeId, BiomeDef> = {
  ice:   { id: "ice",   name: "Кровавые льды",     theme: "кровь",        lvl: [3, 8],   tint: [1.35, 0.55, 0.6],  tiles: "ice",   color: "#b4485a" },
  fire:  { id: "fire",  name: "Синее пламя",       theme: "синий огонь",  lvl: [5, 12],  tint: [0.5, 0.78, 1.45],  tiles: "fire",  color: "#3b82f6" },
  stone: { id: "stone", name: "Железные каменоломни", theme: "металл",    lvl: [7, 14],  tint: [0.82, 0.9, 1.05],  tiles: "stone", color: "#94a3b8" },
  air:   { id: "air",   name: "Звёздная высь",     theme: "космос",       lvl: [9, 16],  tint: [0.78, 0.55, 1.4],  tiles: "air",   color: "#7c3aed" },
};

export interface VariantDef { id: string; base: string; biome: BiomeId; lvl: number; name: string; boss?: boolean }
const V = (biome: BiomeId, base: string, lvl: number, name: string, boss = false): VariantDef => ({ id: `${biome}_${base}`, base, biome, lvl, name, boss: boss || undefined });
// [inner — ближе к хабу, младшие уровни] … [outer — дальний край биома]
export const VARIANTS: VariantDef[] = [
  V("ice", "night_bat", 3, "Кровавая летучая мышь"), V("ice", "dew_slime", 4, "Кровяной слизень"), V("ice", "whisper_wisp", 5, "Алый ледяной огонёк"),
  V("ice", "crescent_wolf", 6, "Кровавый снежный волк"), V("ice", "shard_imp", 7, "Бес кровавого наста"), V("ice", "garden_golem", 8, "Голем алого льда"),
  V("fire", "blade_fly", 5, "Синепламенная муха"), V("fire", "rot_glitch", 6, "Тлеющий синий сбой"), V("fire", "dust_sprite", 7, "Дух синей искры"),
  V("fire", "star_hound", 8, "Гончая синего пламени"), V("fire", "spitter", 9, "Плевун синего огня"), V("fire", "imp", 10, "Бес синего пламени"),
  V("fire", "heat_golem", 11, "Голем синего жара"), V("fire", "lantern_ghost", 12, "Фонарный призрак синего огня"),
  V("stone", "star_scarab", 7, "Железный скарабей"), V("stone", "ore_slime", 8, "Ртутный слизень"), V("stone", "rot_spider", 9, "Стальной паук"),
  V("stone", "cave_crab", 10, "Латунный краб"), V("stone", "pick_skeleton", 11, "Скелет в кольчуге"), V("stone", "golem", 12, "Чугунный голем"),
  V("stone", "glitch_knight", 13, "Рыцарь-автоматон"), V("stone", "ridge_harpy", 14, "Гарпия с железными перьями"),
  V("air", "void_jelly", 9, "Медуза пустоты"), V("air", "dream_moth", 10, "Звёздный мотылёк"), V("air", "violet_pixie", 11, "Пикси туманности"),
  V("air", "ridge_eagle", 12, "Орёл верхних ветров"), V("air", "void_eye", 13, "Око пустоты"), V("air", "thin_wisp", 14, "Огонёк созвездий"),
  V("air", "moon_moth", 15, "Кометный мотылёк"), V("air", "star_knight", 16, "Рыцарь звёздного ветра"),
  // боссы биомов (по 2)
  V("ice", "swarm_mother", 6, "Кровавая Рой-матка", true), V("ice", "thorn_matron", 8, "Матрона Кровавого Наста", true),
  V("fire", "warden", 10, "Страж Синего Пламени", true), V("fire", "the_silencer", 12, "Безмолвный в синем огне", true),
  V("stone", "moon_sentinel", 12, "Железный Часовой", true), V("stone", "rust_baron", 14, "Барон Литейных Цехов", true),
  V("air", "moon_sentinel", 14, "Часовой Пустоты", true), V("air", "violet_queen", 16, "Звёздная Королева", true),
];
export const VARIANT_BY_ID: Record<string, VariantDef> = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
/** базовый моб бестиария (трофеи/бестиарий/квесты) */
export const baseOf = (type: string) => VARIANT_BY_ID[type]?.base || type;
/** ключ спрайта (атлас Отголосков) */
export const sprOf = (type: string) => VARIANT_BY_ID[type]?.base || type;
export const tintOf = (type: string): [number, number, number] | null => { const v = VARIANT_BY_ID[type]; return v ? BIOMES[v.biome].tint : null; };

/** ZoneMobDef-совместимая запись варианта по записи базы (сервер — из CONTENT.zoneMobs, клиент — из MOBS_PUBLIC) */
export function variantDef<T extends Record<string, any>>(v: VariantDef, base: T): T & { base: string; biome: BiomeId; tint: [number, number, number]; variant: true } {
  const size = v.boss ? (base.size === "huge" ? "huge" : "boss") : base.size;
  const st = mobStats(v.lvl, base.role, size);
  const out: any = { ...base, name: v.name, lvl: v.lvl, tier: tierOf(v.lvl), hp: st.hp, dmg: st.dmg, armor: st.armor, xp: st.xp,
    size, boss: v.boss ? true : base.boss, base: v.base, biome: v.biome, tint: BIOMES[v.biome].tint, variant: true, color: BIOMES[v.biome].color };
  if (v.boss) { out.rare = typeof base.rare === "boolean" ? false : undefined; out.phases = base.phases || (size === "huge" ? 3 : 2); if (size === "boss") out.radius = Math.max(base.radius, 32); }
  return out;
}
// Пересбор опасности (раунд Аринара): мобы старше 4 ур. бьют и держат удар сильнее, с потолком.
// dmg ×(1 + 0.02·(L−4)) ≤ ×1.35; armor ×(1 + 0.03·(L−4)) ≤ ×1.5. Одинаково на сервере и в клиенте.
export const dangerDmg = (L: number) => Math.min(1.35, 1 + 0.02 * Math.max(0, L - 4));
export const dangerArmor = (L: number) => Math.min(1.5, 1 + 0.03 * Math.max(0, L - 4));
function danger(d: any) { d.dmg = Math.round(d.dmg * dangerDmg(d.lvl) * 10) / 10; d.armor = Math.round(d.armor * dangerArmor(d.lvl)); return d; }
export function withVariants<T extends Record<string, any>>(table: Record<string, T>): Record<string, T> {
  for (const k of Object.keys(table)) (table as any)[k] = danger({ ...table[k] });
  for (const v of VARIANTS) {
    const base = table[v.base];
    if (!base) throw new Error(`biomes: нет базового моба ${v.base}`);
    (table as any)[v.id] = danger(variantDef(v, base));
  }
  return table;
}
// публичные данные (клиент): база + варианты, порядок = ZONE_MOBS сервера
export const MOBS_PUBLIC_ALL = withVariants({ ...MOBS_PUBLIC } as Record<string, any>);
