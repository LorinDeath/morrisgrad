import { DurableObject } from "cloudflare:workers";

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Map(); // ws -> { id, userId, username, x, y }
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Ожидался WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "join") {
          const effectiveUserId = msg.userId || msg.username || crypto.randomUUID();

          // Выбиваем старую вкладку этого же пользователя
          for (const [oldWs, session] of this.sessions.entries()) {
            if (session.userId === effectiveUserId && oldWs !== server) {
              try {
                oldWs.send(JSON.stringify({ 
                  type: "kicked", 
                  reason: "Сессия открыта в другой вкладке" 
                }));
                oldWs.close();
              } catch (_) {}
              this.sessions.delete(oldWs);
            }
          }

          this.sessions.set(server, {
            id: crypto.randomUUID(),
            userId: effectiveUserId,
            username: msg.username || "Странник",
            x: msg.x || 600,
            y: msg.y || 600,
          });

          server.send(JSON.stringify({ 
            type: "welcome", 
            myId: this.sessions.get(server).id 
          }));
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
    const players = Array.from(this.sessions.values()).map(p => ({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y
    }));

    const payload = JSON.stringify({ type: "players_state", players });

    for (const [ws] of this.sessions.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const roomId = env.GAME_ROOM.idFromName("alkazak_hub");
    const room = env.GAME_ROOM.get(roomId);
    return room.fetch(request);
  },
};