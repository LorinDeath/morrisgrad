// types.ts - Full type definitions for Geometria Action Roguelite
export type DifficultyMultiplier = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface DifficultyConfig {
  multiplier: DifficultyMultiplier;
  name: string;
  subtitle: string;
  badgeColor: string;
  enemyHpMult: number;
  enemySpeedMult: number;
  enemyCountMult: number;
  eliteChance: number;
  shardMultiplier: number;
  scoreMultiplier: number;
  description: string;
  mechanics: string[];
}

export type PlayerCoreType = 'delta' | 'tetra' | 'hexa' | 'octa';

export interface PlayerCore {
  id: PlayerCoreType;
  name: string;
  title: string;
  shapeName: string;
  color: string;
  glowColor: string;
  sides: number;
  baseHp: number;
  baseSpeed: number;
  baseDamage: number;
  description: string;
  specialAbility: string;
  specialAbilityDesc: string;
  abilityCooldown: number; // in seconds
}

// 20 Standard Weapons
export type WeaponId =
  | 'pulse_needle'
  | 'orbital_gliders'
  | 'void_seekers'
  | 'fractal_mines'
  | 'singularity_nova'
  | 'tesla_polygon'
  | 'prism_beam'
  | 'bouncing_shuriken'
  | 'vortex_gravity'
  | 'plasma_mortar'
  | 'hex_drone'
  | 'sonic_rings'
  | 'mirror_boomerang'
  | 'toxic_matrix'
  | 'meteor_swarm'
  | 'orbital_laser_satellite'
  | 'cryo_spikes'
  | 'saw_blade'
  | 'cluster_dodecahedron'
  | 'chaos_spark';

// 10 Evolutions (Requires Level 5 Weapon + Specific Passive)
export type EvolutionWeaponId =
  | 'hyper_rail'              // pulse_needle + quantum_overclock
  | 'event_horizon'          // orbital_gliders + crystalline_armor
  | 'quantum_swarm'          // void_seekers + gravity_grip
  | 'supernova_tetra'        // fractal_mines + fractal_scale
  | 'entropy_tsunami'        // singularity_nova + kinetic_vector
  | 'thunder_god_matrix'     // tesla_polygon + overcharge_battery
  | 'death_star_prism'       // prism_beam + prism_focus
  | 'infinite_ricochet'      // bouncing_shuriken + kinetic_momentum
  | 'black_hole_singularity' // vortex_gravity + dimensional_flux
  | 'orbital_cataclysm';     // plasma_mortar + volatile_fuel

// 20 Passive Items
export type PassiveId =
  | 'kinetic_vector'
  | 'crystalline_armor'
  | 'gravity_grip'
  | 'quantum_overclock'
  | 'fractal_scale'
  | 'prism_focus'
  | 'nano_repair'
  | 'overcharge_battery'
  | 'kinetic_momentum'
  | 'dimensional_flux'
  | 'volatile_fuel'
  | 'vampiric_matrix'
  | 'energy_shield_generator'
  | 'chrono_dilation'
  | 'luck_algorithm'
  | 'greed_prism'
  | 'berserk_resonator'
  | 'thorns_reflector'
  | 'pierce_accelerator'
  | 'multi_fork';

export type UpgradeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'evolution';

export interface UpgradeCard {
  id: string;
  type: 'weapon' | 'passive' | 'evolution';
  weaponId?: WeaponId | EvolutionWeaponId;
  passiveId?: PassiveId;
  name: string;
  titleRu: string;
  description: string;
  rarity: UpgradeRarity;
  level: number;
  maxLevel: number;
  iconSvg: string;
  color: string;
}

// Dimension Pacts (Mutation System after Bosses)
export interface DimensionPact {
  id: string;
  title: string;
  description: string;
  boon: string;
  curse: string;
  icon: string;
  color: string;
}

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: string;
  currentLevel: number;
  maxLevel: number;
  costBase: number;
  costMultiplier: number;
  icon: string;
  valuePerLevel: number;
  formatValue: (lvl: number) => string;
}

export interface PlayerStats {
  maxHp: number;
  currentHp: number;
  shield: number;
  maxShield: number;
  moveSpeed: number;
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  critChance: number;
  critMultiplier: number;
  pickupRadius: number;
  armorReduction: number;
  regenRate: number; // HP per second
  bulletSizeMultiplier: number;
  projectileSpeedMultiplier: number;
  abilityCooldownReduction: number;
  shardsMultiplier: number;
  revivesLeft: number;
  // New Passives Stats
  extraProjectiles: number;
  extraPierce: number;
  vampirismChance: number;
  thornsReflectPct: number;
  berserkActive: boolean;
  slowAuraRadius: number;
  luckBonus: number;
}

export interface Enemy {
  id: number;
  type: 'dot' | 'triangle' | 'square' | 'pentagon' | 'diamond' | 'hexagon' | 'boss';
  bossType?: 'penta_colossus' | 'octa_leviathan' | 'void_icosahedron' | 'hyper_fractal_prime';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  color: string;
  strokeColor: string;
  sides: number;
  rotation: number;
  rotationSpeed: number;
  speed: number;
  damage: number;
  xpValue: number;
  shardValue: number;
  isElite: boolean;
  eliteAffix?: 'shielded' | 'hyperspeed' | 'explosive' | 'pulsar' | 'vortex';
  shieldHp?: number;
  shootCooldown?: number;
  specialTimer?: number;
  frozenTimer?: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: string;
  isPlayer: boolean;
  pierce: number;
  lifeTime: number;
  maxLifeTime: number;
  isHoming?: boolean;
  targetId?: number;
  shape?: 'laser' | 'circle' | 'polygon' | 'blade' | 'star' | 'saw' | 'spark';
  rotation?: number;
  vRot?: number;
  crit?: boolean;
  bounces?: number;
  isBoomerang?: boolean;
  boomerangState?: 'forward' | 'returning';
  originX?: number;
  originY?: number;
  hitList?: Set<number>;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  life: number;
  maxLife: number;
  sides?: number;
  rotation?: number;
  vRot?: number;
  shape?: 'polygon' | 'spark' | 'ring' | 'vortex' | 'toxic';
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  opacity: number;
  life: number;
  vy: number;
}

export interface DropGem {
  id: number;
  x: number;
  y: number;
  value: number;
  type: 'xp' | 'shard' | 'heal' | 'magnet' | 'nuke' | 'chest';
  radius: number;
  color: string;
  sides: number;
  rotation: number;
}

export interface GameSaveData {
  quantumShards: number;
  unlockedCores: PlayerCoreType[];
  metaUpgrades: Record<string, number>;
  reactorTree: Record<string, boolean>; // New 4th mechanic: Quantum Reactor Mastery Tree
  highScores: Record<DifficultyMultiplier, number>;
  bestWaves: Record<DifficultyMultiplier, number>;
  totalRuns: number;
  totalKills: number;
}
