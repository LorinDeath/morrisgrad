// types.ts - Core TypeScript interfaces for Tiny Swords: Путь Аскетов

export type GamePhase = 'day' | 'night';

export type GameMode = 'campaign' | 'endless';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type UnitFaction = 'player' | 'enemy';

export type UnitRole = 
  | 'hero' 
  | 'pawn' 
  | 'warrior' 
  | 'archer' 
  | 'monk' 
  | 'lancer'
  | 'enemy_pawn'
  | 'enemy_warrior' 
  | 'enemy_archer' 
  | 'enemy_lancer' 
  | 'enemy_boss';

export type PawnActivity = 
  | 'idle' 
  | 'moving' 
  | 'chopping' 
  | 'mining' 
  | 'gathering' 
  | 'building' 
  | 'returning';

export type PawnTool = 'none' | 'axe' | 'pickaxe' | 'hammer' | 'knife';

export type PawnCargo = 'none' | 'wood' | 'gold' | 'meat';

export type BuildingType = 'castle' | 'barracks' | 'archery' | 'monastery' | 'tower' | 'house';

export type ArmyCommand = 'follow' | 'defend' | 'attack';

export interface Resources {
  wood: number;
  gold: number;
  food: number;
  pop: number;
  maxPop: number;
}

export interface BuildingCost {
  wood: number;
  gold: number;
  food: number;
}

export interface UnitCost {
  gold: number;
  food: number;
  wood?: number;
}

export interface UpgradeDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  level: number;
  maxLevel: number;
}

export interface FloatingTextItem {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  vy: number;
}

export interface ParticleItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spriteName?: string;
  frameIndex: number;
  totalFrames: number;
  frameTime: number;
  maxFrameTime: number;
  scale: number;
  life: number;
  maxLife: number;
  color?: string;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  arcHeight: number;
  damage: number;
  faction: UnitFaction;
  isFire?: boolean;
}

export interface GameSaveStats {
  highWave: number;
  highKills: number;
  gamesPlayed: number;
}
