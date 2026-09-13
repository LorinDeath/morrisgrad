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
  fearDistance: number; // 40–120м от Алтаря
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

export interface DuelParticipant {
  id: string;
  username: string;
  classId: string;
  hp: number;
  maxHp: number;
  armor: number;
  attack?: number;
  shield?: number; // Прочность щита
  isBoss?: boolean;
  isFlower?: boolean;
  flowerType?: FlowerType;
  burnTicks?: number; // Тики периодического урона от огня
  burnDmg?: number;
  frostUntil?: number; // Замедление замаха от мороза
  atkSpeedBuffUntil?: number; // Бафф "Вселенская любовь"
  atkBuffUntil?: number; // Бафф урона (Адский цветок)
  atkBuffPct?: number;
  dmgDebuffUntil?: number; // Дебафф урона цели (Пространственный разрез)
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