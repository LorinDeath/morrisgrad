import { DurableObject } from "cloudflare:workers";

export class MyDurableObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Map();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Ожидался WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    const playerId = crypto.randomUUID();

    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "join") {
          this.sessions.set(server, {
            id: playerId,
            username: msg.username || "Странник",
            x: msg.x || 600,
            y: msg.y || 600,
          });

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

export default {
  async fetch(request, env, ctx) {
    const stub = env.MY_DURABLE_OBJECT.getByName("alkazak_hub");
    return stub.fetch(request);
  },
};