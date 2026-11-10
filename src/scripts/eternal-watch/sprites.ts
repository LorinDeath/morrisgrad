// Имена спрайтов ночи. Файлы лежат в /games/eternal-watch/sprites-v3/.
import type { EnemyKind, TowerKind } from "./types.ts";

export const SPRITE_ROOT = "/games/eternal-watch/sprites-v3/";

export function spriteUrl(name: string): string {
  return SPRITE_ROOT + name + ".png";
}

export const TOWER_SPRITE: Record<TowerKind, string> = {
  spark: "tower_ballista",
  needle: "tower_sniper",
  muzzle: "tower_cannon",
  chill: "tower_frost",
  venom: "tower_poison",
  arc: "tower_lightning",
  beam: "tower_laser",
  bolt: "tower_mortar",
  blaze: "tower_flame",
  halo: "tower_beacon",
  awl: "tower_splash",
  swarm: "tower_well",
  miner: "tower_miner",
};

export const ENEMY_SPRITE: Record<EnemyKind, string> = {
  walker: "enemy_walker",
  runner: "enemy_runner",
  knight: "enemy_tank",
  healer: "enemy_healer",
  splitter: "enemy_splitter",
  shield: "enemy_shield",
  flyer: "enemy_flyer",
  shade: "enemy_ghost",
  caller: "enemy_regen",
  boss: "boss_lich",
  mite: "enemy_swarm",
  thrall: "enemy_swarm",
};

export const BOSS_SPRITES = [
  "boss_lich", "boss_demon", "boss_skeleton_king", "boss_minotaur", "boss_dragon", "boss_warlord",
] as const;

export const BOSS_NAMES = ["Лич", "Демон", "Костяной король", "Минотавр", "Дракон", "Воевода"] as const;

export function bossVisual(wave: number, id: number): { sprite: string; name: string } {
  const i = Math.abs((wave + id) % BOSS_SPRITES.length);
  return { sprite: BOSS_SPRITES[i], name: BOSS_NAMES[i] };
}

export const PROJ_SPRITE: Record<TowerKind, string> = {
  spark: "proj_arrow",
  needle: "proj_arrow",
  muzzle: "proj_cannonball",
  chill: "proj_ice_shard",
  venom: "proj_poison",
  arc: "proj_bolt",
  beam: "proj_beam",
  bolt: "proj_fireball",
  blaze: "proj_fireball",
  halo: "fx_spark",
  awl: "proj_arrow",
  swarm: "proj_arrow",
  miner: "tile_ore",
};

export const ABILITY_ICON = { fire: "ability_fire", bliz: "ability_blizzard", dawn: "ability_dawn" } as const;

export function towerFrame(kind: TowerKind, upgraded: boolean): string {
  return TOWER_SPRITE[kind] + (upgraded ? "_b" : "_a");
}

export function enemyFrame(kind: EnemyKind, wave: number, id: number, tick: number): string {
  if (kind === "boss") return bossVisual(wave, id).sprite;
  if (kind === "mite" || kind === "thrall") return (tick + id) % 2 === 0 ? "enemy_swarm_a" : "enemy_swarm_b";
  const base = ENEMY_SPRITE[kind];
  return base + ((tick + id) % 2 === 0 ? "_a" : "_b");
}
