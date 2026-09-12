import { DurableObject } from "cloudflare:workers";
import { WORLD_PORTALS, MINI_GAMES, CLASSES_CONFIG } from "./config";
import { processCombatAction } from "./combat";
import { KeytBoss } from "./boss";
import type { Session, DuelState } from "./types";

export class GameRoom extends DurableObject {
  sessions: Map<WebSocket, Session>;
  activeDuels: Map<string, DuelState>;
  boss: KeytBoss;
  lastTick = Date.now();

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Map();
    this.activeDuels = new Map();
    this.boss = new KeytBoss();

    setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;

      this.boss.update(
        dt,
        this.sessions,
        this.activeDuels,
        (targetSession, ws) => this.startBossBattle(targetSession, ws),
        (duel, log) => this.broadcastDuelUpdate(duel, log),
        (duel, winner) => this.endBossBattle(duel, winner)
      );

      this.broadcast();
    }, 100);
  }

  startBossBattle(initialPlayer: Session, initialWs: WebSocket) {
    if (!initialPlayer.stats.classId) return;

    const duelId = "boss_duel_" + crypto.randomUUID();
    initialPlayer.inDuel = true;
    initialPlayer.duelId = duelId;

    this.boss.inDuel = true;
    this.boss.duelId = duelId;
    this.boss.state = "combat";

    const p1Data = {
      id: initialPlayer.id,
      username: initialPlayer.username,
      classId: initialPlayer.stats.classId,
      hp: initialPlayer.stats.hp,
      maxHp: initialPlayer.stats.maxHp,
      armor: initialPlayer.stats.armor,
      ws: initialWs,
    };

    const p2Data = {
      id: this.boss.id,
      username: this.boss.name,
      classId: "boss",
      hp: this.boss.hp,
      maxHp: this.boss.maxHp,
      armor: this.boss.armor,
      isBoss: true,
    };

    const duelState: DuelState = {
      id: duelId,
      isBossFight: true,
      hunters: [p1Data],
      allies: [p2Data],
      p1: p1Data,
      p2: p2Data,
    };

    this.activeDuels.set(duelId, duelState);
    this.boss.recalcPassives(duelState);

    const payload = JSON.stringify({
      type: "duel_start",
      isBossFight: true,
      duel: {
        id: duelId,
        isBossFight: true,
        p1: { id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp, armor: p1Data.armor },
        p2: { id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, armor: p2Data.armor, isBoss: true },
        hunters: [{ id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp }],
        allies: [{ id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, isBoss: true }],
      },
    });

    initialWs.send(payload);
    this.broadcast();
  }

  broadcastDuelUpdate(duel: DuelState, log: string) {
    const payload = JSON.stringify({
      type: "duel_update",
      hunters: duel.hunters.map((h) => ({ id: h.id, username: h.username, hp: h.hp, maxHp: h.maxHp, armor: h.armor, classId: h.classId })),
      allies: duel.allies.map((a) => ({ id: a.id, username: a.username, hp: a.hp, maxHp: a.maxHp, armor: a.armor, classId: a.classId, isBoss: a.isBoss })),
      p1Hp: duel.hunters[0]?.hp || 0,
      p2Hp: duel.allies[0]?.hp || 0,
      log,
    });

    for (const p of [...duel.hunters, ...duel.allies]) {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        try { p.ws.send(payload); } catch (_) {}
      }
    }
  }

  endBossBattle(duel: DuelState, winnerName: string) {
    const payload = JSON.stringify({ type: "duel_end", winnerName });
    for (const p of [...duel.hunters, ...duel.allies]) {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        try { p.ws.send(payload); } catch (_) {}
      }
      for (const s of this.sessions.values()) {
        if (s.id === p.id) {
          s.inDuel = false;
          s.stats.hp = s.stats.maxHp;
          s.escapedUntil = Date.now() + 5000;
        }
      }
    }

    this.activeDuels.delete(duel.id);

    if (this.boss.duelId === duel.id) {
      this.boss.inDuel = false;
      this.boss.duelId = null;
      if (this.boss.state !== "dead") {
        this.boss.state = "wander";
        this.boss.nextWanderTime = Date.now() + 3000;
      }
    }

    this.broadcast();
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

        if (msg.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
          return;
        }

        const session = this.sessions.get(server);

        // 1. Вход
        if (msg.type === "join") {
          const cleanName = (msg.username || "Странник").trim();
          const lowerName = cleanName.toLowerCase();

          for (const [oldWs, s] of this.sessions.entries()) {
            if (oldWs !== server && s.username && s.username.toLowerCase() === lowerName) {
              try {
                oldWs.send(JSON.stringify({ type: "kicked", reason: "Вход с другой вкладки" }));
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
            opponentSession.inDuel = true;
            opponentSession.duelId = duelId;

            session.stats.hp = session.stats.maxHp;
            opponentSession.stats.hp = opponentSession.stats.maxHp;

            const p1 = { id: session.id, username: session.username, classId: session.stats.classId!, hp: session.stats.hp, maxHp: session.stats.maxHp, armor: session.stats.armor };
            const p2 = { id: opponentSession.id, username: opponentSession.username, classId: opponentSession.stats.classId!, hp: opponentSession.stats.hp, maxHp: opponentSession.stats.maxHp, armor: opponentSession.stats.armor };

            const duelState: DuelState = {
              id: duelId,
              isBossFight: false,
              hunters: [{ ...p1, ws: server }],
              allies: [{ ...p2, ws: opponentWs }],
              p1: { ...p1, ws: server },
              p2: { ...p2, ws: opponentWs },
            };

            this.activeDuels.set(duelId, duelState);

            const payload = JSON.stringify({
              type: "duel_start",
              isBossFight: false,
              duel: { id: duelId, p1, p2 },
            });

            server.send(payload);
            opponentWs.send(payload);
            this.broadcast();
          }
        }

        // 8. Присоединение к бою Кейт
        if (msg.type === "join_boss_fight" && session && session.stats.classId && !session.inDuel && this.boss.inDuel && this.boss.duelId) {
          const duel = this.activeDuels.get(this.boss.duelId);
          if (duel) {
            session.inDuel = true;
            session.duelId = duel.id;
            session.stats.hp = session.stats.maxHp;

            const participant = {
              id: session.id,
              username: session.username,
              classId: session.stats.classId,
              hp: session.stats.hp,
              maxHp: session.stats.maxHp,
              armor: session.stats.armor,
              ws: server,
            };

            if (msg.side === "kate") {
              duel.allies.push(participant);
              this.boss.recalcPassives(duel);
              this.broadcastDuelUpdate(duel, `<span style="color:#f472b6; font-weight:bold;">Кейт: «Мой прекрасный друг!»</span> — <b>${session.username}</b> встал на сторону Кейт!`);
            } else {
              duel.hunters.push(participant);
              this.boss.recalcPassives(duel);
              this.broadcastDuelUpdate(duel, `<span style="color:#f472b6; font-weight:bold;">Кейт: «Какое мерзкое создание!»</span> — <b>${session.username}</b> присоединился к охоте на Кейт!`);
            }

            server.send(JSON.stringify({
              type: "duel_start",
              isBossFight: true,
              duel: { id: duel.id, p1: duel.p1, p2: duel.p2 },
            }));

            this.broadcast();
          }
        }

        // 9. Действия боя (Атака / Навык / Побег)
        if (msg.type === "duel_action" && session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (!duel) return;

          const now = Date.now();

          if (msg.action === "escape") {
            const { logText } = processCombatAction("escape", 1, session, duel, this.boss);
            this.broadcastDuelUpdate(duel, logText);

            if (!duel.isBossFight) {
              const winner = duel.p1.id === session.id ? duel.p2.username : duel.p1.username;
              const endPayload = JSON.stringify({ type: "duel_end", winnerName: winner });
              if (duel.p1.ws) duel.p1.ws.send(endPayload);
              if (duel.p2.ws) duel.p2.ws.send(endPayload);
              this.activeDuels.delete(duel.id);
            } else {
              duel.hunters = duel.hunters.filter((h) => h.id !== session.id);
              duel.allies = duel.allies.filter((a) => a.id !== session.id);
              this.boss.recalcPassives(duel);

              if (duel.hunters.length === 0) {
                this.endBossBattle(duel, "Кейт");
              }
            }

            this.broadcast();
            return;
          }

          if (now - session.lastActionTime < 1900) return;
          session.lastActionTime = now;

          // Расчёт действия с учётом выбранного таргета
          const { logText, isDead } = processCombatAction(
            msg.action,
            msg.chargeMult,
            session,
            duel,
            this.boss,
            msg.targetId
          );
          this.broadcastDuelUpdate(duel, logText);

          if (isDead) {
            if (!duel.isBossFight) {
              const endPayload = JSON.stringify({ type: "duel_end", winnerName: session.username });
              if (duel.p1.ws) duel.p1.ws.send(endPayload);
              if (duel.p2.ws) duel.p2.ws.send(endPayload);
              session.inDuel = false;
              this.activeDuels.delete(duel.id);
            } else {
              if (this.boss.hp <= 0) {
                this.boss.state = "dead";
                this.boss.deathTime = Date.now();
                this.endBossBattle(duel, "Охотники");
              }
            }
          }
        }

        // 10. Чат
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
        console.error("Ошибка:", err);
      }
    });

    const closeHandler = () => {
      try {
        const session = this.sessions.get(server);
        if (session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (duel) {
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
            escapedUntil: s.escapedUntil || 0,
            stats: s.stats,
          });
        }
      }

      const payload = JSON.stringify({
        type: "players_state",
        players: Array.from(uniquePlayers.values()),
        boss: this.boss.getState(),
      });

      for (const ws of [...this.sessions.keys()]) {
        try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
      }
    } catch (err) {
      console.error("Ошибка в broadcast:", err);
    }
  }
}