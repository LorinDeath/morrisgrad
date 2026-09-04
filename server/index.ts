import { DurableObject } from "cloudflare:workers";

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Map(); // ws -> { id, username, x, y }
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
          const cleanName = (msg.username || "Странник").trim();
          const lowerName = cleanName.toLowerCase();

          for (const [oldWs, session] of this.sessions.entries()) {
            if (oldWs !== server && session.username && session.username.toLowerCase() === lowerName) {
              try {
                oldWs.send(JSON.stringify({ type: "kicked", reason: "Вход с другой вкладки" }));
                oldWs.close();
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

          server.send(JSON.stringify({ type: "welcome", myId: this.sessions.get(server).id }));
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

        // Пересылка реплики всем подключенным игрокам
        if (msg.type === "chat") {
          const session = this.sessions.get(server);
          if (session && msg.text) {
            const cleanText = String(msg.text).trim().slice(0, 35);
            if (cleanText.length > 0) {
              const chatPayload = JSON.stringify({
                type: "chat_bubble",
                username: session.username,
                text: cleanText,
              });

              for (const ws of this.sessions.keys()) {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(chatPayload);
                  } catch (_) {}
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Ошибка обработки сокета:", e);
      }
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
    const uniquePlayers = new Map();

    for (const [ws, session] of this.sessions.entries()) {
      if (ws.readyState === WebSocket.OPEN && session.username) {
        uniquePlayers.set(session.username.toLowerCase(), {
          id: session.id,
          username: session.username,
          x: session.x,
          y: session.y,
        });
      } else {
        this.sessions.delete(ws);
      }
    }

    const payload = JSON.stringify({
      type: "players_state",
      players: Array.from(uniquePlayers.values()),
    });

    for (const ws of this.sessions.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch (_) {
          this.sessions.delete(ws);
        }
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const roomId = env.GAME_ROOM.idFromName("alkazak_v2");
    const room = env.GAME_ROOM.get(roomId);
    return room.fetch(request);
  },
};