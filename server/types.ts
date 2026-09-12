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
  stats: PlayerStats;
}

export interface DuelParticipant {
  id: string;
  username: string;
  classId: string;
  hp: number;
  maxHp: number;
  ws?: WebSocket;
}

export interface DuelState {
  id: string;
  p1: DuelParticipant & { ws: WebSocket };
  p2: DuelParticipant & { ws: WebSocket };
}

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}