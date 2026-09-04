import { DurableObject } from "cloudflare:workers";

export class GameRoom extends DurableObject {
  sessions: Map<WebSocket, any>;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Map();
  }

  async fetch(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Ожидался WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "join") {
          const cleanName = (msg.username || "Странник").trim();
          const lowerName = cleanName.toLowerCase();

          for (const [oldWs, session] of this.sessions.entries()) {
            if (oldWs !== server && session.username && session.username.toLowerCase() === lowerName) {
              try {
                oldWs.send(JSON.stringify({ type: "kicked", reason: "Вход с другой вкладки под этим ником" }));
                oldWs.close(1000, "Duplicate session");
              } catch (_) {}
              this.sessions.delete(oldWs);
            }
          }

          this.sessions.set(server, {
            id: crypto.randomUUID(),
            username: cleanName,
            x: msg.x || 600,
            y: msg.y || 600,
          });

          try {
            server.send(JSON.stringify({ type: "welcome", myId: this.sessions.get(server).id }));
          } catch (_) {}

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

        if (msg.type === "chat") {
          const session = this.sessions.get(server);
          if (session && msg.text) {
            const cleanText = String(msg.text).trim().slice(0, 45);
            if (cleanText.length > 0) {
              const chatPayload = JSON.stringify({
                type: "chat_bubble",
                playerId: session.id,
                username: session.username,
                text: cleanText,
              });

              for (const ws of [...this.sessions.keys()]) {
                try {
                  ws.send(chatPayload);
                } catch (_) {
                  this.sessions.delete(ws);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Ошибка сокета:", err);
      }
    });

    const closeHandler = () => {
      try {
        this.sessions.delete(server);
        this.broadcast();
      } catch (_) {}
    };

    server.addEventListener("close", closeHandler);
    server.addEventListener("error", closeHandler);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast() {
    try {
      const uniquePlayers = new Map();

      for (const [ws, session] of this.sessions.entries()) {
        if (session && session.username) {
          uniquePlayers.set(session.username.toLowerCase(), {
            id: session.id,
            username: session.username,
            x: session.x,
            y: session.y,
          });
        }
      }

      const payload = JSON.stringify({
        type: "players_state",
        players: Array.from(uniquePlayers.values()),
      });

      for (const ws of [...this.sessions.keys()]) {
        try {
          ws.send(payload);
        } catch (_) {
          this.sessions.delete(ws);
        }
      }
    } catch (err) {
      console.error("Ошибка в broadcast:", err);
    }
  }
}

export default {
  async fetch(request: Request, env: any) {
    try {
      const roomId = env.GAME_ROOM.idFromName("alkazak_v2");
      const room = env.GAME_ROOM.get(roomId);
      return room.fetch(request);
    } catch (err) {
      console.error("Ошибка роутинга DO:", err);
      return new Response("Внутренняя ошибка сервера", { status: 500 });
    }
  },
};