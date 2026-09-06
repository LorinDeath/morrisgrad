import { DurableObject } from "cloudflare:workers";

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
  {
    id: "portal_class_select",
    name: "Алтарь Перевоплощения",
    x: 565,
    y: 600,
    width: 32,
    height: 32,
    color: "#38bdf8", // Синий портал
  },
];

const MINI_GAMES = [
  { id: "shadow_world", title: "Тёмный мир BETA", desc: "Игровые механики этой игры будут в Проклятых", url: "/shadow-world/index.html", disabled: false },
  { id: "quiz", title: "Викторина", desc: "Тесты по лору", url: "/quiz_obitel_smerti.html", disabled: false },
  { id: "musicc", title: "Музыкальная карусель", desc: "Просто интересный плеер", url: "/lorin_death_carousel_final.html", disabled: false },
  { id: "Darkestt", title: "Тёмный мир ALFA", desc: "Можешь сломать если хочешь", url: "/Darks.html", disabled: false },
  { id: "World", title: "Это мы с тобой (Скоро)", desc: "На техобслуживании", url: "", disabled: true },
  { id: "protokol", title: "Неоновый протокол (Скоро)", desc: "На техобслуживании", url: "", disabled: true },
  { id: "Zaglush", title: "Заглушка (Скоро)", desc: "На техобслуживании", url: "", disabled: true },
];

const CLASSES_CONFIG: Record<string, any> = {
  warrior: { name: "Воин", color: "#38bdf8", hp: 20, maxHp: 20, armor: 10, minAtk: 1, maxAtk: 2 },
  spearman: { name: "Копейщик", color: "#ef4444", hp: 10, maxHp: 10, armor: 2, minAtk: 4, maxAtk: 10 },
  rogue: { name: "Разбойник", color: "#22c55e", hp: 13, maxHp: 13, armor: 5, minAtk: 1, maxAtk: 15 },
};

function calcArmorReduction(armor: number) {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.9, pct / 100);
}

export class GameRoom extends DurableObject {
  sessions: Map<WebSocket, any>;
  activeDuels: Map<string, any>;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Map();
    this.activeDuels = new Map();
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
        const session = this.sessions.get(server);

        // 1. Вход
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
            stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 },
          });

          server.send(JSON.stringify({ type: "welcome", myId, portals: WORLD_PORTALS }));
          this.broadcast();
        }

        // 2. Движение (блокируется во время дуэли)
        if (msg.type === "move" && session && !session.inDuel) {
          session.x = msg.x;
          session.y = msg.y;
          this.broadcast();
        }

        // 3. Портал
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

        // 5. Дуэли: Вызов
        if (msg.type === "duel_invite" && session && session.stats.classId && !session.inDuel) {
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId && s.stats.classId && !s.inDuel) {
              targetWs.send(JSON.stringify({ type: "duel_incoming", fromId: session.id, fromUsername: session.username }));
              break;
            }
          }
        }

        // 6. Дуэли: Отказ
        if (msg.type === "duel_decline") {
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId) {
              targetWs.send(JSON.stringify({ type: "duel_declined_notify", targetNick: session.username }));
              break;
            }
          }
        }

        // 7. Дуэли: Принятие
        if (msg.type === "duel_accept" && session && !session.inDuel) {
          let opponentWs: any = null;
          let opponentSession: any = null;

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

            // Восстанавливаем HP перед дуэлью
            session.stats.hp = session.stats.maxHp;
            opponentSession.stats.hp = opponentSession.stats.maxHp;

            const duelState = {
              id: duelId,
              p1: { id: session.id, username: session.username, classId: session.stats.classId, hp: session.stats.hp, maxHp: session.stats.maxHp, ws: server },
              p2: { id: opponentSession.id, username: opponentSession.username, classId: opponentSession.stats.classId, hp: opponentSession.stats.hp, maxHp: opponentSession.stats.maxHp, ws: opponentWs },
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

        // 8. Дуэли: Действия боя (Атака / Навык)
        if (msg.type === "duel_action" && session && session.inDuel) {
          const duel = this.activeDuels.get(session.duelId);
          if (!duel) return;

          const isP1 = duel.p1.id === session.id;
          const attacker = isP1 ? duel.p1 : duel.p2;
          const defender = isP1 ? duel.p2 : duel.p1;
          const attackerClass = CLASSES_CONFIG[attacker.classId];
          const defSession = isP1 ? this.sessions.get(duel.p2.ws) : this.sessions.get(duel.p1.ws);

          let baseDmg = Math.floor(Math.random() * (attackerClass.maxAtk - attackerClass.minAtk + 1)) + attackerClass.minAtk;
          let finalDmg = 0;
          let logText = "";

          const chargeMult = Math.min(3.0, Math.max(0.2, Number(msg.chargeMult || 1)));

          if (msg.action === "attack") {
            const rawDmg = baseDmg * chargeMult;
            const reduction = calcArmorReduction(defSession.stats.armor);
            finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
            logText = `<b>${attacker.username}</b> совершил выпад [x${chargeMult}] на <span style="color:#ef4444">${finalDmg}</span> урона!`;
          } else if (msg.action === "ability") {
            if (attacker.classId === "warrior") {
              const rawDmg = baseDmg * chargeMult * 1.5;
              const reduction = calcArmorReduction(defSession.stats.armor);
              finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
              logText = `⚔️ <b>${attacker.username}</b> применил <i>Удар в спину</i> на <span style="color:#ef4444">${finalDmg}</span> урона!`;
            } else if (attacker.classId === "spearman") {
              finalDmg = Math.max(1, Math.round(baseDmg * chargeMult * 1.2)); // Игнорирует броню!
              logText = `🗡️ <b>${attacker.username}</b> вонзил <i>Колющий удар</i> (сквозь броню!) на <span style="color:#ef4444">${finalDmg}</span> урона!`;
            } else if (attacker.classId === "rogue") {
              const rawDmg = baseDmg * chargeMult * 1.1;
              const reduction = calcArmorReduction(defSession.stats.armor);
              finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
              const heal = Math.max(1, Math.round(finalDmg * 0.1));
              attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
              session.stats.hp = attacker.hp;
              logText = `🩸 <b>${attacker.username}</b> нанёс <i>Коварный удар</i> на <span style="color:#ef4444">${finalDmg}</span> урона и восстановил ${heal} HP!`;
            }
          }

          defender.hp = Math.max(0, defender.hp - finalDmg);
          defSession.stats.hp = defender.hp;

          const updatePayload = JSON.stringify({
            type: "duel_update",
            p1Hp: duel.p1.hp,
            p2Hp: duel.p2.hp,
            log: logText,
          });

          duel.p1.ws.send(updatePayload);
          duel.p2.ws.send(updatePayload);

          // Проверка победы/поражения
          if (defender.hp <= 0) {
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

export default {
  async fetch(request: Request, env: any) {
    try {
      const roomId = env.GAME_ROOM.idFromName("alkazak_v3");
      const room = env.GAME_ROOM.get(roomId);
      return room.fetch(request);
    } catch (err) {
      return new Response("Внутренняя ошибка", { status: 500 });
    }
  },
};