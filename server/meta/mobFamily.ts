// Семейство снаряда монстра (FX atlas v2: enemy_acid, enemy_bone, enemy_fire, enemy_frost, enemy_shadow, enemy_arcane,
// enemy_blood, enemy_rock, enemy_lightning, enemy_web, enemy_water + enemy_boss) — по стихии/виду моба.
// Раздаётся на сервере (снаряд мира несёт ключ t) и в забеге (тип врага → ключ). Варианты биомов Аринара —
// по стихии биома (лёд/кровавый наст → frost/blood, синий огонь → fire, железо → rock, звёзды/пустота → arcane/lightning).
export type MobFamily = "acid" | "bone" | "fire" | "frost" | "shadow" | "arcane" | "blood" | "rock" | "lightning" | "web" | "water";
export const BASE_FAMILY: Record<string, MobFamily> = {
  dew_slime: "water", whisper_wisp: "arcane", night_bat: "blood", blade_fly: "acid", mirage_hare: "arcane", rot_glitch: "acid", grass_imp: "acid",
  dream_moth: "arcane", violet_pixie: "arcane", pome_beetle: "rock", rootling: "acid", dew_king: "water", swarm_mother: "acid", dust_sprite: "arcane",
  dream_fox: "arcane", star_scarab: "rock", thorn_mantis: "acid", shard_imp: "frost", garden_golem: "rock", thorn_vine: "acid", crescent_wolf: "shadow",
  void_jelly: "shadow", lantern_ghost: "fire", white_stag: "arcane", thorn_matron: "acid", bat: "blood", imp: "fire", ore_slime: "acid",
  ghoul: "bone", spitter: "acid", rot_spider: "web", pick_skeleton: "bone", golem: "rock", ridge_harpy: "rock", glitch_knight: "lightning",
  rust_baron: "rock", warden: "shadow", moon_sentinel: "arcane", miner_mite: "rock", fan_spirit: "lightning", cable_serpent: "lightning",
  pixel_wraith: "lightning", heat_golem: "fire", moon_wolf: "shadow", memory_shade: "shadow", silence_weaver: "web", spark_imp: "lightning",
  cooler_maw: "frost", the_silencer: "shadow", crater_crab: "rock", moon_moth: "arcane", void_eye: "shadow", thin_one: "shadow", moon_jelly: "water",
  star_knight: "arcane", crystal_drake: "frost", echo_warden: "shadow", faceless_choir: "shadow", fallen_star: "fire", violet_queen: "arcane",
  puff_mushroom: "acid", pome_sprout: "acid", star_hound: "arcane", cave_crab: "water", ridge_eagle: "rock", glitch_hound: "lightning",
  thin_wisp: "shadow", lunar_golem: "rock",
};
const BIOME_FAMILY: Record<string, MobFamily> = { ice: "frost", fire: "fire", stone: "rock", air: "arcane" };
// у ледяного биома часть мобов — «кровавые» (алый наст): кровь; у звёздного — грозовые (огоньки/рыцарь ветра): молния
const VARIANT_FAMILY: Record<string, MobFamily> = { ice_night_bat: "blood", ice_dew_slime: "blood", ice_swarm_mother: "blood", ice_thorn_matron: "blood", ice_crescent_wolf: "blood",
  air_thin_wisp: "lightning", air_star_knight: "lightning", air_ridge_eagle: "lightning", stone_rot_spider: "web" };
export function mobFamily(type: string): MobFamily {
  if (VARIANT_FAMILY[type]) return VARIANT_FAMILY[type];
  if (BASE_FAMILY[type]) return BASE_FAMILY[type];
  const i = type.indexOf("_"), biome = type.slice(0, i), base = type.slice(i + 1);
  if (BIOME_FAMILY[biome]) return BIOME_FAMILY[biome];
  return BASE_FAMILY[base] || "acid";
}
export const mobShot = (type: string, boss = false) => (boss ? "enemy_boss" : "enemy_" + mobFamily(type));
export const ENEMY_SPRITES = ["acid", "bone", "fire", "frost", "shadow", "arcane", "blood", "rock", "lightning", "web", "water"].map((f) => "enemy_" + f).concat("enemy_boss");
