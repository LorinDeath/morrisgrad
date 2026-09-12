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
  escapedUntil?: number; // Время неуязвимости после побега (мс)
  stats: PlayerStats;
}

export interface DuelParticipant {
  id: string;
  username: string;
  classId: string;
  hp: number;
  maxHp: number;
  armor: number;
  isBoss?: boolean;
  ws?: WebSocket;
}

export interface DuelState {
  id: string;
  isBossFight?: boolean;
  hunters: DuelParticipant[]; // Противники Кейт / Игрок 1
  allies: DuelParticipant[];  // Кейт + её союзники / Игрок 2
  // Совместимость со старыми дуэлями 1v1
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
  respawnTime?: number;
}

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}