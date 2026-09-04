export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

interface PlayerSession {
  id: string;
  username: string;
  x: number;
  y: number;
}

export class GameRoom {
  state: DurableObjectState;
  sessions: Map<WebSocket, PlayerSession>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Ожидался WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    const playerId = crypto.randomUUID();

    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "join") {
          this.sessions.set(server, {
            id: playerId,
            username: msg.username || "Странник",
            x: msg.x || 600,
            y: msg.y || 600,
          });

          // Отправляем игроку его сетевой ID
          server.send(JSON.stringify({ type: "welcome", myId: playerId }));
          this.broadcast();
        }

        if (msg.type === "move") {
          const session = this.sessions.get(server);
          if (session) {
            session.x = msg.x;
            session.y = msg.y;
          }
          this.broadcast();
        }
      } catch (e) {}
    });

    const closeHandler = () => {
      this.sessions.delete(server);
      this.broadcast();
    };

    server.addEventListener("close", closeHandler);
    server.addEventListener("error", closeHandler);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast() {
    const players = Array.from(this.sessions.values());
    const payload = JSON.stringify({ type: "players_state", players });

    for (const [ws] of this.sessions) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

// Главный входной эндпоинт воркера
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Подключаемся к глобальной комнате 'alkazak_hub'
    const roomId = env.GAME_ROOM.idFromName("alkazak_hub");
    const room = env.GAME_ROOM.get(roomId);
    return room.fetch(request);
  },
};