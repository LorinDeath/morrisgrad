export type GameWorldId = "hellfire" | "arinar";

export type FlowerStage = "bud" | "mature" | "active";
export type FlowerType = "normal" | "fire" | "frost" | "hell";

export interface FlowerStats {
  hp: number;
  maxHp: number;
  armor: number;
  atk: number;
}

export interface FlowerState {
  id: string;
  x: number;
  y: number;
  stage: FlowerStage;
  flowerType: FlowerType;
  plantedAt: number;
  stats: FlowerStats;
  fearDistance: number;
  inDuel: boolean;
  duelId?: string;
  dirX?: number;
  dirY?: number;
  targetPlayerId?: string | null;
  wanderTargetX?: number;
  wanderTargetY?: number;
  nextWanderTime?: number;
  nextScreamTime?: number;
}

export interface PlayerStats {
  classId: string | null;
  hp: number;
  maxHp: number;
  armor: number;
  attack?: number;
  minAtk?: number;
  maxAtk?: number;
}

export interface Session {
  id: string;
  username: string;
  world: GameWorldId; // Текущий мир игрока
  x: number;
  y: number;
  color: string;
  inDuel: boolean;
  duelId?: string;
  lastActionTime: number;
  escapedUntil?: number;
  rejoinBlockedUntil?: number;
  dismoraleUntil?: number;
  stats: PlayerStats;
}

export interface WorldPortalDef {
  id: string;
  name: string;
  world: GameWorldId;
  targetWorld?: GameWorldId;
  targetX?: number;
  targetY?: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
}

export interface DuelParticipant {
  id: string;
  username: string;
  classId: string;
  hp: number;
  maxHp: number;
  armor: number;
  attack?: number;
  shield?: number;
  isBoss?: boolean;
  isFlower?: boolean;
  flowerType?: FlowerType;
  burnTicks?: number;
  burnDmg?: number;
  frostUntil?: number;
  atkSpeedBuffUntil?: number;
  atkBuffUntil?: number;
  atkBuffPct?: number;
  dmgDebuffUntil?: number;
  dmgDebuffPct?: number;
  ws?: WebSocket;
}

export interface DuelState {
  id: string;
  isBossFight?: boolean;
  hunters: DuelParticipant[];
  allies: DuelParticipant[];
  p1: DuelParticipant & { ws?: WebSocket };
  p2: DuelParticipant & { ws?: WebSocket };
}

export interface BossState {
  id: string;
  name: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  state: "wander" | "chase" | "combat" | "dead";
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  inDuel: boolean;
  duelId?: string;
}