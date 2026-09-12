import { DurableObject } from "cloudflare:workers";
import { WORLD_PORTALS, MINI_GAMES, CLASSES_CONFIG } from "./config";
import { processCombatAction } from "./combat";
import type { Session, DuelState } from "./types";

export class GameRoom extends DurableObject {
  sessions: Map<WebSocket, Session>;
  activeDuels: Map<string, DuelState>;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Map();
    this.activeDuels = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Ожидался WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        // 0. Замер пинга (быстрый ответ)
        if (msg.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
          return;
        }

        const session = this.sessions.get(server);

        // 1. Вход игрока
        if (msg.type === "join") {
          const cleanName = (msg.username || "Странник").trim();
          const lowerName = cleanName.toLowerCase();

          for (const [oldWs, s] of this.sessions.entries()) {
            if (oldWs !== server && s.username && s.username.toLowerCase() === lowerName) {
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
            color: "#ffffff",
            inDuel: false,
            lastActionTime: 0,
            stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 },
          });

          server.send(JSON.stringify({ type: "welcome", myId, portals: WORLD_PORTALS }));
          this.broadcast();
        }

        // 2. Движение
        if (msg.type === "move" && session && !session.inDuel) {
          session.x = msg.x;
          session.y = msg.y;
          this.broadcast();
        }

        // 3. Порталы
        if (msg.type === "use_portal" && session && !session.inDuel) {
          const portal = WORLD_PORTALS.find((p) => p.id === msg.portalId);
          if (portal && Math.hypot(session.x - portal.x, session.y - portal.y) <= 65) {
            if (portal.id === "portal_class_select") {
              server.send(JSON.stringify({ type: "open_class_selection" }));
            } else if (portal.id === "portal_arcade") {
              server.send(JSON.stringify({ type: "open_minigames_menu", portalName: portal.name, games: MINI_GAMES }));
            }
          }
        }

        // 4. Выбор класса
        if (msg.type === "select_class" && session) {
          const c = CLASSES_CONFIG[msg.classId];
          if (c) {
            session.color = c.color;
            session.stats = {
              classId: msg.classId,
              hp: c.hp,
              maxHp: c.maxHp,
              armor: c.armor,
              minAtk: c.minAtk,
              maxAtk: c.maxAtk,
            };
            server.send(JSON.stringify({ type: "class_updated", stats: session.stats, color: session.color }));
            this.broadcast();
          }
        }

        // 5. Дуэль: вызов
        if (msg.type === "duel_invite" && session && session.stats.classId && !session.inDuel) {
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId && s.stats.classId && !s.inDuel) {
              targetWs.send(JSON.stringify({ type: "duel_incoming", fromId: session.id, fromUsername: session.username }));
              break;
            }
          }
        }

        // 6. Дуэль: отказ
        if (msg.type === "duel_decline") {
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId) {
              targetWs.send(JSON.stringify({ type: "duel_declined_notify", targetNick: session.username }));
              break;
            }
          }
        }

        // 7. Дуэль: принятие
        if (msg.type === "duel_accept" && session && !session.inDuel) {
          let opponentWs: WebSocket | null = null;
          let opponentSession: Session | null = null;

          for (const [ws, s] of this.sessions.entries()) {
            if (s.id === msg.targetId && !s.inDuel) {
              opponentWs = ws;
              opponentSession = s;
              break;
            }
          }

          if (opponentWs && opponentSession) {
            const duelId = crypto.randomUUID();
            session.inDuel = true;
            session.duelId = duelId;
            session.lastActionTime = 0;

            opponentSession.inDuel = true;
            opponentSession.duelId = duelId;
            opponentSession.lastActionTime = 0;

            session.stats.hp = session.stats.maxHp;
            opponentSession.stats.hp = opponentSession.stats.maxHp;

            const duelState: DuelState = {
              id: duelId,
              p1: { id: session.id, username: session.username, classId: session.stats.classId!, hp: session.stats.hp, maxHp: session.stats.maxHp, ws: server },
              p2: { id: opponentSession.id, username: opponentSession.username, classId: opponentSession.stats.classId!, hp: opponentSession.stats.hp, maxHp: opponentSession.stats.maxHp, ws: opponentWs },
            };

            this.activeDuels.set(duelId, duelState);

            const payload = JSON.stringify({
              type: "duel_start",
              duel: {
                id: duelId,
                p1: { id: session.id, username: session.username, classId: session.stats.classId, hp: session.stats.hp, maxHp: session.stats.maxHp },
                p2: { id: opponentSession.id, username: opponentSession.username, classId: opponentSession.stats.classId, hp: opponentSession.stats.hp, maxHp: opponentSession.stats.maxHp },
              },
            });

            server.send(payload);
            opponentWs.send(payload);
            this.broadcast();
          }
        }

        // 8. Дуэль: действия боя
        if (msg.type === "duel_action" && session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (!duel) return;

          const now = Date.now();
          session.lastActionTime = session.lastActionTime || 0;

          if (now - session.lastActionTime < 1900) return;
          session.lastActionTime = now;

          const isP1 = duel.p1.id === session.id;
          const attacker = isP1 ? duel.p1 : duel.p2;
          const defSession = isP1 ? this.sessions.get(duel.p2.ws) : this.sessions.get(duel.p1.ws);

          if (!defSession) return;

          const { logText, isDead } = processCombatAction(msg.action, msg.chargeMult, session, defSession, duel);

          const updatePayload = JSON.stringify({
            type: "duel_update",
            p1Hp: duel.p1.hp,
            p2Hp: duel.p2.hp,
            log: logText,
          });

          duel.p1.ws.send(updatePayload);
          duel.p2.ws.send(updatePayload);

          if (isDead) {
            const endPayload = JSON.stringify({ type: "duel_end", winnerName: attacker.username });
            duel.p1.ws.send(endPayload);
            duel.p2.ws.send(endPayload);

            session.inDuel = false;
            defSession.inDuel = false;
            session.stats.hp = session.stats.maxHp;
            defSession.stats.hp = defSession.stats.maxHp;

            this.activeDuels.delete(duel.id);
            this.broadcast();
          }
        }

        // 9. Чат
        if (msg.type === "chat" && session && msg.text) {
          const cleanText = String(msg.text).trim().slice(0, 45);
          if (cleanText.length > 0) {
            const chatPayload = JSON.stringify({
              type: "chat_bubble",
              playerId: session.id,
              username: session.username,
              text: cleanText,
            });
            for (const ws of [...this.sessions.keys()]) {
              try { ws.send(chatPayload); } catch (_) { this.sessions.delete(ws); }
            }
          }
        }
      } catch (err) {
        console.error("Ошибка обработки:", err);
      }
    });

    const closeHandler = () => {
      try {
        const session = this.sessions.get(server);
        if (session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (duel) {
            const oppWs = duel.p1.id === session.id ? duel.p2.ws : duel.p1.ws;
            try {
              oppWs.send(JSON.stringify({ type: "duel_end", winnerName: "Противник сбежал" }));
            } catch (_) {}
            this.activeDuels.delete(session.duelId);
          }
        }
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
      for (const [_, s] of this.sessions.entries()) {
        if (s && s.username) {
          uniquePlayers.set(s.username.toLowerCase(), {
            id: s.id,
            username: s.username,
            x: s.x,
            y: s.y,
            color: s.color || "#ffffff",
            inDuel: Boolean(s.inDuel),
            stats: s.stats,
          });
        }
      }

      const payload = JSON.stringify({
        type: "players_state",
        players: Array.from(uniquePlayers.values()),
      });

      for (const ws of [...this.sessions.keys()]) {
        try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
      }
    } catch (err) {
      console.error("Ошибка в broadcast:", err);
    }
  }
}