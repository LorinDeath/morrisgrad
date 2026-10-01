// types.ts - Core types for Dungeon Gathering Roguelite

import type { Weapon, GroundWeapon, GroundScroll } from './weapons';

export type HeroClass = 'zombie' | 'paladin' | 'sorcerer' | 'berserker' | 'assassin';
export type GameMode = 'campaign' | 'endless' | 'boss_rush' | 'tutorial';
export type DifficultyLevel = 'easy' | 'normal' | 'nightmare' | 'inferno';

export type RoomType =
  | 'spawn'
  | 'normal'
  | 'horde'
  | 'elite'
  | 'treasure'
  | 'shrine'
  | 'shop'
  | 'challenge'
  | 'exit'
  | 'boss'
  | 'rest'
  | 'tutorial_step';

export type BiomeType = 'crypt' | 'sunken' | 'toxic' | 'magma' | 'abyss' | 'void' | 'sanctum';

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: RoomType;
  biome: BiomeType;
  cx: number;
  cy: number;
  connected: number[];
  visited: boolean;
  cleared: boolean;
  titleBanner?: string;
  tutorialMessage?: string;
}

export const enum Tile {
  VOID = 0,
  FLOOR = 1,
  FLOOR_ALT = 2,
  FLOOR_CRACK = 3,
  WALL_TOP = 10,
  WALL_FRONT = 11,
  WALL_SIDE_L = 12,
  WALL_SIDE_R = 13,
  WALL_CORNER_L = 14,
  WALL_CORNER_R = 15,
  WATER = 20,
  STAIRS_DOWN = 30,
  SHRINE = 40,
  SHOP_CARPET = 50,
  TRAP_SPIKES = 60,
  FOUNTAIN = 70,
  CHEST = 80,
}

export interface Torch {
  x: number;
  y: number;
  type: 'wall' | 'left' | 'right';
  frame: number;
  animTimer: number;
  lightIntensity: number;
}

export interface DestructibleCrate {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  broken: boolean;
}

export interface Vase {
  id: number;
  x: number;
  y: number;
  frame: number;
  animTimer: number;
  broken: boolean;
  contents: 'coins' | 'potion' | 'blue_coin' | 'empty';
}

export interface Chest {
  id: number;
  x: number;
  y: number;
  opened: boolean;
  type: 'gold' | 'abyssal';
}

export interface Shrine {
  id: number;
  x: number;
  y: number;
  used: boolean;
  blessingType: 'might' | 'vitality' | 'haste' | 'greed';
}

export interface Fountain {
  id: number;
  x: number;
  y: number;
  used: boolean;
}

export interface SpikeTrap {
  id: number;
  tileX: number;
  tileY: number;
  state: 'dormant' | 'warning' | 'active';
  timer: number;
}

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  currency: 'gold' | 'blue';
  icon: string;
  category: 'potion' | 'stat' | 'perk';
}

export interface ShopKeeper {
  x: number;
  y: number;
  roomIndex: number;
  items: ShopItem[];
}

export interface ChallengeEvent {
  roomIndex: number;
  active: boolean;
  cleared: boolean;
  wave: number;
  maxWaves: number;
  enemiesRemaining: number;
  totemX: number;
  totemY: number;
}

export interface Decal {
  x: number;
  y: number;
  type: 'blood' | 'shard' | 'scorch';
  color: string;
  size: number;
  angle: number;
}

// -------------------------------------------------------------------
// Binding of Isaac Relics System & Ground Relic
// -------------------------------------------------------------------
export type RelicRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Relic {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: RelicRarity;
  effectType:
    | 'isaac_tear'
    | 'brimstone_beam'
    | 'sacred_heart'
    | 'black_hole'
    | 'meat_cube'
    | 'occult_eye'
    | 'doomsday_watch'
    | 'blood_crown'
    | 'unholy_triquetra'
    | 'chaos_d6'
    | 'godhead_core'
    | 'void_seal';
  stats?: {
    bonusDamage?: number;
    bonusHp?: number;
    bonusSpeed?: number;
    bonusCrit?: number;
    bonusLifesteal?: number;
  };
}

export interface GroundRelic {
  id: number;
  relic: Relic;
  x: number;
  y: number;
  bobTimer: number;
}

export interface BlackHoleEntity {
  id: number;
  x: number;
  y: number;
  radius: number;
  duration: number;
  maxDuration: number;
  pullForce: number;
  damage: number;
  damageInterval: number;
  damageTimer: number;
}

export interface MeatCubeOrbit {
  angle: number;
  distance: number;
  damage: number;
}

export interface DungeonMap {
  width: number;
  height: number;
  tiles: number[][];
  discovered: boolean[][];
  rooms: Room[];
  spawnPoint: { x: number; y: number };
  stairsPoint: { x: number; y: number };
  torches: Torch[];
  vases: Vase[];
  crates: DestructibleCrate[];
  chests: Chest[];
  shrines: Shrine[];
  fountains: Fountain[];
  traps: SpikeTrap[];
  shop?: ShopKeeper;
  challenge?: ChallengeEvent;
  decals: Decal[];
  biome: BiomeType;
  groundWeapons: GroundWeapon[];
  groundScrolls: GroundScroll[];
  groundRelics: GroundRelic[];
}

export interface KillerInfo {
  name: string;
  attackName: string;
  damage: number;
  icon: string;
  biomeName: string;
  x: number;
  y: number;
  enemyId?: number;
}

export type EnemyType =
  | 'zombie_walker'
  | 'zombie_spitter'
  | 'zombie_runner'
  | 'zombie_brute'
  | 'zombie_witch'
  | 'zombie_pyro'
  | 'zombie_boss';

export interface EnemyRangedAttack {
  name: string;
  cooldown: number;
  speed: number;
  damage: number;
  range: number;
  color: string;
  trailColor: string;
  isOrb: boolean;
  radius: number;
  spreadCount?: number;
  homing?: boolean;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  armor?: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  state: 'idle' | 'walk' | 'hurt' | 'attack' | 'death';
  dir: 0 | 1 | 2 | 3;
  frame: number;
  animTimer: number;
  hurtTimer: number;
  deathTimer: number;
  isDead: boolean;
  isBoss: boolean;
  scale: number;
  tint?: string;
  roomIndex: number;
  isElite?: boolean;
  eliteAffix?: 'fire' | 'frost' | 'vampiric';

  // Smart combat & ranged weaponry for all zombies
  rangedAttack?: EnemyRangedAttack;
  dodgeCooldown?: number;
  dodgeTimer?: number;
  preferredDistance?: number;
  telegraphTimer?: number;

  // Progressive Evolution & Black Shield mechanics
  hasDarkShield?: boolean;
  darkShieldHp?: number;
  maxDarkShieldHp?: number;
  isEvolved?: boolean;
  evolutionTier?: number;
  darkGlitchSeed?: number;
  isDarkInfused?: boolean;
  lodLevel?: 0 | 1 | 2;
  biome?: BiomeType;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  fromPlayer: boolean;
  color: string;
  trailColor: string;
  life: number;
  maxLife: number;
  piercing?: boolean;
  pierceCount?: number;
  hitEnemyIds?: Set<number>;
  homing?: boolean;
  isMagicOrb?: boolean;
  orbType?: 'arcane' | 'plasma' | 'solar' | 'void' | 'frost' | 'storm';
  explosive?: boolean;
  pulseRadius?: number;

  // Isaac Relic modifiers
  isSplitTear?: boolean;
  isBrimstone?: boolean;
  isSacredHeart?: boolean;
  isUnholyTriquetra?: boolean;

  // Dark Magic modifier
  isDarkMagic?: boolean;
  darkMagicDamage?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity?: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  vy: number;
}

export type ItemDropType =
  | 'coin'
  | 'blue_coin'
  | 'potion_hp'
  | 'potion_speed'
  | 'potion_power'
  | 'xp_gem';

export interface ItemDrop {
  id: number;
  type: ItemDropType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  frame: number;
  animTimer: number;
  magnetized: boolean;
}

export interface Perk {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'offense' | 'defense' | 'utility' | 'magic';
}

export interface MetaUpgrades {
  extraHearts: number;
  extraDamage: number;
  extraGold: number;
  extraLight: number;
  extraPotions: number;
  vampireMastery: number;
  critMastery: number;
  greedMastery: number;
  spectralDiscount: number;
  soulMagnet: number;
  lootLuck?: number;
  starAffinity?: number;
}

export type StartingLoadoutWeapon =
  | 'default'
  | 'plasma_wand'
  | 'claymore'
  | 'shadow_staff'
  | 'daggers'
  | 'astral_blaster';

export type StartingPack =
  | 'none'
  | 'traveler_purse'
  | 'medic_kit'
  | 'sharpening_scroll'
  | 'light_amulet'
  | 'orb_resonator';

export interface MetaProfile {
  blueCoins: number;
  upgrades: MetaUpgrades;
  unlockedWeapons: StartingLoadoutWeapon[];
  selectedWeapon: StartingLoadoutWeapon;
  selectedPack: StartingPack;
}

export interface PlayerStats {
  heroClass: HeroClass;
  gameMode: GameMode;
  difficulty: DifficultyLevel;
  maxHp: number;
  hp: number;
  speed: number;
  damage: number;
  attackCooldown: number;
  attackTimer: number;
  attackRange: number;
  comboStep: number;
  comboResetTimer: number;
  critChance: number;
  critMult: number;
  armor: number;
  lifestealChance: number;

  dashCooldown: number;
  dashTimer: number;
  dashDuration: number;
  isDashing: boolean;

  specialSkillCooldown: number;
  specialSkillTimer: number;

  invulnerableTimer: number;

  gold: number;
  blueCoins: number;
  xp: number;
  level: number;
  nextLevelXp: number;
  floor: number;
  score: number;

  potions: {
    hp: number;
    speed: number;
    power: number;
  };

  buffSpeedTimer: number;
  buffPowerTimer: number;

  cleaveBonus: number;
  toxicRupture: boolean;
  flameAura: boolean;
  soulBoltReadyCounter: number;
  chainLightning: boolean;
  freezeDash: boolean;
  aegisShieldTimer: number;
  hasAegisShield: boolean;
  perks: string[];

  // Diablo Weapon Slot
  equippedWeapon: Weapon;
  bonusLightRadius: number;
  bonusDarkMagicPct?: number;

  // Relic system (Isaac-style)
  relicSlotsCount: number;
  relics: (Relic | null)[];
  activeSynergy: string | null;
  ultimateCharge: number;
  ultimateMax: number;
  isUltimateActive: boolean;
  ultimateTimer: number;
  startingPack?: StartingPack;

  // Mode-specific progression trackers
  tutorialStep?: number;
  bossRushWave?: number;
  bossRushTime?: number;
  currentBiome?: BiomeType;
}
