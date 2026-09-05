import { DurableObject } from "cloudflare:workers";

// 1. Координаты портала и список доступных мини-игр
const WORLD_PORTALS = [
  {
    id: "portal_arcade",
    name: "Разлом Мини-игр",
    x: 12,
    y: 1188,
    width: 32,
    height: 32,
    color: "#a855f7",
  },
];

const MINI_GAMES = [
  {
    id: "shadow_world",
    title: "Мир Теней",
    desc: "Хроники Пустоты",
    url: "/shadow-world/index.html",
  },
  {
    id: "quiz",
    title: "Обитель Смерти",
    desc: "Текстовое испытание",
    url: "/quiz_obiter_smerti.html",
  },
];

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

        // 1. Вход игрока
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

          const myId = crypto.randomUUID();
          this.sessions.set(server, {
            id: myId,
            username: cleanName,
            x: msg.x || 600,
            y: msg.y || 600,
          });

          // Отправляем игроку его ID и список порталов на карте
          try {
            server.send(
              JSON.stringify({
                type: "welcome",
                myId: myId,
                portals: WORLD_PORTALS,
              })
            );
          } catch (_) {}

          this.broadcast();
        }

        // 2. Движение
        if (msg.type === "move") {
          const session = this.sessions.get(server);
          if (session) {
            session.x = msg.x;
            session.y = msg.y;
          }
          this.broadcast();
        }

        // 3. Чат
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

        // 4. Взаимодействие с порталом
        if (msg.type === "use_portal") {
          const session = this.sessions.get(server);
          const portal = WORLD_PORTALS.find((p) => p.id === msg.portalId);

          if (session && portal) {
            // Проверяем расстояние между игроком и порталом
            const dist = Math.hypot(session.x - portal.x, session.y - portal.y);
            if (dist <= 65) {
              try {
                server.send(
                  JSON.stringify({
                    type: "open_minigames_menu",
                    portalName: portal.name,
                    games: MINI_GAMES,
                  })
                );
              } catch (_) {}
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
      const roomId = env.GAME_ROOM.idFromName("alkazak_v3");
      const room = env.GAME_ROOM.get(roomId);
      return room.fetch(request);
    } catch (err) {
      console.error("Ошибка роутинга DO:", err);
      return new Response("Внутренняя ошибка сервера", { status: 500 });
    }
  },
};