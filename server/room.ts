import { admitMessage, isDevRequest, MSG_BURST } from "./limits";
import { DurableObject } from "cloudflare:workers";
import { RunLobbies, type RunInstance } from "./runs";
import { WORLD_PORTALS, MINI_GAMES, RUN_ROOMS, RUN_RELAY_MAX_BYTES } from "./config";
import { worldSize, worldBounds, WORLD_CHUNK, ARINAR_LAYOUT_VER, OPEN_AOI } from "./worlds/sizes";
import { ZONE_RESPAWN } from "./meta/shared";
import { ZONE_MOBS } from "./meta/defs";
import { skillsFor } from "./meta/zone";
import { processCombatAction, calcArmorReduction } from "./combat";
import { KeytBoss } from "./boss";
import type { Session, DuelState, FlowerState, FlowerType, GameWorldId } from "./types";
import { CHARACTER_CLASSES } from "./classes";
import { getSkill } from "./skills";
import { DarBoss } from "./dar";
import { MetaService } from "./meta/service";

export function getFlowerName(flower: FlowerState): string {
  switch (flower.flowerType) {
    case "fire": return "Огненный тюльпан";
    case "frost": return "Морозный тюльпан";
    case "hell": return "Адский тюльпан";
    default: return "Тюльпан-вампир";
  }
}

export class GameRoom extends DurableObject {
  sessions: Map<WebSocket, Session>;
  activeDuels: Map<string, DuelState>;
  boss: KeytBoss;
  dar: DarBoss;
  flowers: Map<string, FlowerState>;
  meta: MetaService;
  lobbies = new RunLobbies(RUN_ROOMS);

  lastTick = Date.now();
  lastHealTick = Date.now();

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Map();
    this.activeDuels = new Map();
    this.boss = new KeytBoss();
    this.dar = new DarBoss();
    this.flowers = new Map();
    // Мета-прогрессия «Проклятых» (SQLite Durable Object), квесты и открытый мир Аринара
    this.meta = new MetaService((ctx as any)?.storage?.sql, env);
    // после проверки токена: выбить прежние вкладки того же аккаунта (по проверенному uid, а не по присланному userId)
    this.meta.onVerified = (ws: any, s: any, uid: string) => {
      s.dupKey = `u:${uid}`;
      for (const [oldWs, o] of this.sessions.entries()) {
        if (oldWs === ws || (o as any).dupKey !== s.dupKey) continue;
        try { oldWs.send(JSON.stringify({ type: "kicked", reason: "Вход с другой вкладки" })); oldWs.close(1000, "Duplicate session"); } catch (_) {}
        this.meta.pvpGone(o); this.sessions.delete(oldWs);
      }
    };
    this.meta.sessionLookup = (sid: string) => {
      for (const [ws, s] of this.sessions.entries()) if (s.id === sid) return [ws, s];
      return null;
    };
    this.meta.onPlayersChanged = () => this.broadcast();

    setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;

      // Выделяем сессии только Адского Мира для ИИ боссов и костра
      const hellfireSessions = new Map<WebSocket, Session>();
      for (const [ws, s] of this.sessions.entries()) {
        // Игроки внутри co-op забега не видны ИИ хаба (Кейт/Дар/цветы не утащат их в бой)
        if ((s.world || "hellfire") === "hellfire" && !s.runRoom) {
          hellfireSessions.set(ws, s);
        }
      }

      // 1. Пассивное лечение у Алтаря Перевоплощения (только для Адского Мира)
      if (now - this.lastHealTick >= 1000) {
        this.lastHealTick = now;
        let anyHealed = false;

        for (const s of hellfireSessions.values()) {
          if (s.stats.classId && !s.inDuel) {
            const dist = Math.hypot(s.x - 565, s.y - 600);
            if (dist <= 80 && s.stats.hp < s.stats.maxHp) {
              s.stats.hp = Math.min(s.stats.maxHp, s.stats.hp + 1);
              anyHealed = true;
            }
          }
        }

        if (anyHealed) {
          this.broadcast();
        }
      }

      // 2. Обновление Кейт (видит только hellfireSessions)
      this.boss.update(
        dt,
        hellfireSessions,
        this.activeDuels,
        (targetSession, ws) => this.startBossBattle(targetSession, ws),
        (duel, log) => this.broadcastDuelUpdate(duel, log),
        (duel, winner) => this.endBossBattle(duel, winner),
        (quote) => this.broadcastBossSay(quote),
        (duel, action) => {
          const hasDar = duel.hunters.some((h) => h.id === "boss_dar") || duel.allies.some((a) => a.id === "boss_dar");
          if (hasDar) {
            const darSide = duel.allies.some((a) => a.id === "boss_dar") ? duel.allies : duel.hunters;
            const playerSide = darSide === duel.allies ? duel.hunters : duel.allies;
            playerSide.push({
              id: this.boss.id,
              username: this.boss.name,
              classId: "boss",
              hp: this.boss.hp,
              maxHp: this.boss.maxHp,
              armor: this.boss.armor,
              isBoss: true,
            });
            this.boss.inDuel = true;
            this.boss.duelId = duel.id;
            this.boss.state = "combat";
            this.boss.recalcPassives(duel);
            this.broadcastDuelUpdate(duel, `<span style="color:#f472b6; font-weight:bold;">Кейт: «Я с вами против этой козявки!»</span> — присоединилась к игрокам!`);
            return;
          }
          this.handleBossIntervention(duel, action);
        }
      );

      // 3. Обновление Дар (видит только hellfireSessions)
      this.dar.update(
        dt,
        hellfireSessions,
        this.activeDuels,
        this.flowers,
        (quote) => this.broadcastDarSay(quote),
        (targetSession, dmg) => this.triggerDarSurpriseHit(targetSession, dmg),
        (duel, side, yell) => {
          const p = {
            id: this.dar.id,
            username: this.dar.name,
            classId: "boss_dar",
            hp: this.dar.hp,
            maxHp: this.dar.maxHp,
            armor: this.dar.armor,
            isBoss: true,
          };
          duel[side].push(p);
          this.broadcastDuelUpdate(duel, yell);
        },
        (duel, log) => this.broadcastDuelUpdate(duel, log),
        (duel, winner) => this.endBossBattle(duel, winner),
        (x, y) => this.plantFlower(x, y),
        (flower) => this.waterFlower(flower)
      );

      // 4. Жизненный цикл и ИИ цветков-вампиров
      this.updateFlowers(dt, now, hellfireSessions);

      // 5. Автоматические атаки цветков в активных дуэлях
      for (const flower of this.flowers.values()) {
        if (flower.inDuel && flower.duelId) {
          const duel = this.activeDuels.get(flower.duelId);
          if (!duel) {
            flower.inDuel = false;
            flower.duelId = undefined;
            continue;
          }

          if (!flower.nextActionTime) flower.nextActionTime = now + 3000;

          if (now >= flower.nextActionTime) {
            flower.nextActionTime = now + 3500;

            const mySide = duel.allies.some((a) => a.id === flower.id) ? duel.allies : duel.hunters;
            const enemySide = mySide === duel.allies ? duel.hunters : duel.allies;
            const livingEnemies = enemySide.filter((e) => e.hp > 0);

            if (livingEnemies.length === 0) continue;

            const target = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
            const targetSession = [...this.sessions.values()].find((s) => s.id === target.id);

            const baseAtk = flower.stats.atk || 15;
            const ignoreArmor = flower.flowerType === "hell";
            const reduction = ignoreArmor ? 0 : calcArmorReduction(target.armor);
            const dmg = Math.max(1, Math.round(baseAtk * (1 - reduction)));

            let log = `🌸 <b>${getFlowerName(flower)}</b> атаковал <b>${target.username}</b> на <span style="color:#ef4444">${dmg}</span> урона!`;

            if (flower.flowerType === "fire") {
              target.burnTicks = 10;
              target.burnDmg = 10;
              target.armor = Math.max(0, Math.round(target.armor * 0.9));
              log = `🔥 <b>${getFlowerName(flower)}</b> опалил <b>${target.username}</b> на <span style="color:#f97316">${dmg}</span> урона!`;
            } else if (flower.flowerType === "frost") {
              target.frostUntil = now + 8000;
              log = `❄️ <b>${getFlowerName(flower)}</b> заморозил <b>${target.username}</b> на <span style="color:#38bdf8">${dmg}</span> урона!`;
            } else if (flower.flowerType === "hell") {
              log = `🌌 <b>${getFlowerName(flower)}</b> провёл тёмный удар сквозь броню <b>${target.username}</b> на <span style="color:#c084fc">${dmg}</span> урона!`;
            }

            target.hp = Math.max(0, target.hp - dmg);
            if (targetSession) targetSession.stats.hp = target.hp;

            if (target.hp <= 0) {
              log += `<br><b>${target.username}</b> повержен цветком!`;
              if (targetSession) {
                targetSession.inDuel = false;
                targetSession.stats.hp = targetSession.stats.maxHp;
                targetSession.rejoinBlockedUntil = now + 30000;
              }
            }

            this.broadcastDuelUpdate(duel, log);

            const aliveLeft = enemySide.filter((e) => e.hp > 0).length;
            if (aliveLeft === 0) {
              this.endBossBattle(duel, `${getFlowerName(flower)} и союзники`);
            }
          }
        }
      }

      try { this.meta.tick(dt, this.sessions); } catch (err) { console.error("meta tick", err); }

      this.broadcast();
    }, 100);
  }

  plantFlower(x: number, y: number) {
    if (this.flowers.size >= 22) return;
    const fId = "flower_" + crypto.randomUUID();

    const flower: FlowerState = {
      id: fId,
      x: Math.max(40, Math.min(1160, x)),
      y: Math.max(40, Math.min(1160, y)),
      stage: "bud",
      flowerType: "normal",
      plantedAt: Date.now(),
      stats: { hp: 10, maxHp: 10, armor: 0, atk: 0 },
      fearDistance: Math.round(180 + Math.random() * 180),
      inDuel: false,
    };

    this.flowers.set(fId, flower);
  }

  waterFlower(flower: FlowerState) {
    const randHp = Math.floor(Math.random() * (40 - 5 + 1)) + 5;
    const randAtk = Math.floor(Math.random() * (10 - 1 + 1)) + 1;
    const randDef = Math.floor(Math.random() * (4 - 1 + 1)) + 1;

    let fType: FlowerType = "normal";
    const roll = Math.random();
    if (roll < 0.50) {
      fType = "fire";
    } else if (roll < 0.80) {
      fType = "frost";
    } else if (roll < 0.90) {
      fType = "hell";
    } else {
      fType = "normal";
    }

    flower.stage = "active";
    flower.flowerType = fType;
    flower.stats = {
      hp: randHp,
      maxHp: randHp,
      atk: randAtk,
      armor: randDef,
    };
  }

  updateFlowers(dt: number, now: number, hellfireSessions: Map<WebSocket, Session>) {
    const ALTAR_X = 565;
    const ALTAR_Y = 600;

    for (const flower of this.flowers.values()) {
      if (flower.stage === "bud") {
        if (now - flower.plantedAt >= 900000) {
          flower.stage = "mature";
        }
        continue;
      }

      if (flower.stage === "mature") {
        continue;
      }

      if (flower.stage === "active") {
        if (flower.inDuel) {
          if (flower.duelId && !this.activeDuels.has(flower.duelId)) {
            flower.inDuel = false;
            flower.duelId = undefined;
          }
          continue;
        }

        // 1. Страх огня Алтаря
        const distToAltar = Math.hypot(flower.x - ALTAR_X, flower.y - ALTAR_Y);
        if (distToAltar < flower.fearDistance) {
          const awayX = flower.x - ALTAR_X || (Math.random() - 0.5);
          const awayY = flower.y - ALTAR_Y || (Math.random() - 0.5);
          const awayLen = Math.hypot(awayX, awayY) || 1;

          flower.dirX = awayX / awayLen;
          flower.dirY = awayY / awayLen;
          flower.x += flower.dirX * 120 * dt;
          flower.y += flower.dirY * 120 * dt;
          this.clampEntity(flower);

          if (!flower.nextScreamTime || now >= flower.nextScreamTime) {
            flower.nextScreamTime = now + (10000 + Math.random() * 8000);
            this.broadcastFlowerSay(flower.id, getFlowerName(flower), "РРРР");
          }
          continue;
        }

        // 2. Помощь союзникам (только внутри сессий Ада)
        let helped = false;
        for (const duel of this.activeDuels.values()) {
          const hasDar = duel.hunters.some((h) => h.id === this.dar.id) || duel.allies.some((a) => a.id === this.dar.id);
          const hasOtherFlower = duel.hunters.some((h) => h.isFlower) || duel.allies.some((a) => a.isFlower);

          if (hasDar || hasOtherFlower) {
            let inRange = false;
            for (const p of [...duel.hunters, ...duel.allies]) {
              const s = [...hellfireSessions.values()].find((sess) => sess.id === p.id);
              if (s && Math.hypot(s.x - flower.x, s.y - flower.y) <= 200) {
                inRange = true;
                break;
              }
            }
            if (!inRange && Math.hypot(this.dar.x - flower.x, this.dar.y - flower.y) <= 200) {
              inRange = true;
            }

            if (inRange) {
              const isDarOrFlowerInAllies = duel.allies.some((a) => a.id === this.dar.id || a.isFlower);
              const side = isDarOrFlowerInAllies ? "allies" : "hunters";
              this.addFlowerToDuel(flower, duel, side);
              helped = true;
              break;
            }
          }
        }
        if (helped) continue;

        // 3. Агр строго на игроков в Мире Адского Пламени
        let targetSession: Session | null = null;
        let targetWs: WebSocket | null = null;
        let minDist = 60;

        for (const [ws, s] of hellfireSessions.entries()) {
          if (s.stats.classId && !s.inDuel && (!s.escapedUntil || now >= s.escapedUntil) && (!s.rejoinBlockedUntil || now >= s.rejoinBlockedUntil)) {
            const d = Math.hypot(s.x - flower.x, s.y - flower.y);
            if (d <= minDist) {
              minDist = d;
              targetSession = s;
              targetWs = ws;
            }
          }
        }

        if (targetSession && targetWs) {
          const pdx = targetSession.x - flower.x;
          const pdy = targetSession.y - flower.y;
          const pDist = Math.hypot(pdx, pdy) || 1;

          if (pDist > 35) {
            flower.dirX = pdx / pDist;
            flower.dirY = pdy / pDist;
            flower.x += flower.dirX * 135 * dt;
            flower.y += flower.dirY * 135 * dt;
            this.clampEntity(flower);
          } else {
            this.startFlowerBattle(targetSession, targetWs, flower);
          }
          continue;
        }

        // 4. Блуждание цветка
        if (!flower.wanderTargetX || now >= (flower.nextWanderTime || 0)) {
          flower.nextWanderTime = now + (3500 + Math.random() * 4000);
          flower.wanderTargetX = Math.max(40, Math.min(1160, flower.x + (Math.random() * 200 - 100)));
          flower.wanderTargetY = Math.max(40, Math.min(1160, flower.y + (Math.random() * 200 - 100)));
        }

        const wdx = (flower.wanderTargetX || flower.x) - flower.x;
        const wdy = (flower.wanderTargetY || flower.y) - flower.y;
        const wDist = Math.hypot(wdx, wdy);
        if (wDist > 8) {
          flower.dirX = wdx / wDist;
          flower.dirY = wdy / wDist;
          flower.x += flower.dirX * 55 * dt;
          flower.y += flower.dirY * 55 * dt;
          this.clampEntity(flower);
        }
      }
    }
  }

  addFlowerToDuel(flower: FlowerState, duel: DuelState, side: "hunters" | "allies") {
    flower.inDuel = true;
    flower.duelId = duel.id;

    const p = {
      id: flower.id,
      username: getFlowerName(flower),
      classId: "flower_" + flower.flowerType,
      hp: flower.stats.hp,
      maxHp: flower.stats.maxHp,
      armor: flower.stats.armor,
      attack: flower.stats.atk,
      isBoss: true,
      isFlower: true,
      flowerType: flower.flowerType,
    };

    duel[side].push(p);
    this.broadcastDuelUpdate(duel, `🌸 <b>${p.username}</b> присоединился к сражению!`);
  }

  startFlowerBattle(initialPlayer: Session, initialWs: WebSocket, flower: FlowerState) {
    if (!initialPlayer.stats.classId) return;

    const duelId = "flower_duel_" + crypto.randomUUID();
    initialPlayer.inDuel = true;
    initialPlayer.duelId = duelId;
    flower.inDuel = true;
    flower.duelId = duelId;

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
      id: flower.id,
      username: getFlowerName(flower),
      classId: "flower_" + flower.flowerType,
      hp: flower.stats.hp,
      maxHp: flower.stats.maxHp,
      armor: flower.stats.armor,
      attack: flower.stats.atk,
      isBoss: true,
      isFlower: true,
      flowerType: flower.flowerType,
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

  private clampEntity(ent: { x: number; y: number }) {
    ent.x = Math.max(40, Math.min(1160, ent.x));
    ent.y = Math.max(40, Math.min(1160, ent.y));
  }

  broadcastBossSay(text: string) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: "boss_keyt",
      username: "Кейт",
      text,
    });
    for (const [ws, s] of this.sessions.entries()) {
      if ((s.world || "hellfire") === "hellfire") {
        try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
      }
    }
  }

  broadcastDarSay(text: string) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: "boss_dar",
      username: "Дар",
      text,
    });
    for (const [ws, s] of this.sessions.entries()) {
      if ((s.world || "hellfire") === "hellfire") {
        try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
      }
    }
  }

  broadcastFlowerSay(flowerId: string, name: string, text: string) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: flowerId,
      username: name,
      text,
    });
    for (const [ws, s] of this.sessions.entries()) {
      if ((s.world || "hellfire") === "hellfire") {
        try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
      }
    }
  }

  triggerDarSurpriseHit(targetSession: Session, dmg: number) {
    targetSession.stats.hp = Math.max(1, targetSession.stats.hp - dmg);
    const payload = JSON.stringify({
      type: "dar_surprise_hit",
      targetId: targetSession.id,
      damage: dmg,
      hp: targetSession.stats.hp,
      maxHp: targetSession.stats.maxHp,
    });
    for (const [ws, s] of this.sessions.entries()) {
      if ((s.world || "hellfire") === "hellfire") {
        try { ws.send(payload); } catch (_) {}
      }
    }
    this.broadcast();
  }

  handleBossIntervention(duel: DuelState, action: "join" | "kiss") {
    if (action === "join") {
      duel.isBossFight = true;
      this.boss.inDuel = true;
      this.boss.duelId = duel.id;
      this.boss.state = "combat";

      const bossParticipant = {
        id: this.boss.id,
        username: this.boss.name,
        classId: "boss",
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        armor: this.boss.armor,
        isBoss: true,
      };

      if (Math.random() < 0.5) {
        duel.allies.push(bossParticipant);
      } else {
        duel.hunters.push(bossParticipant);
      }

      this.boss.recalcPassives(duel);

      const log = `<span style="color:#f472b6; font-weight:bold;">Кейт: «Пора кромсать!!!»</span> — ворвалась в дуэль!`;
      this.broadcastDuelUpdate(duel, log);
    } else if (action === "kiss") {
      const lucky = Math.random() < 0.5 ? duel.hunters[0] : duel.allies[0];
      if (lucky) {
        const healAmt = Math.round((lucky.maxHp || 100) * 0.3);
        lucky.hp = Math.min(lucky.maxHp, lucky.hp + healAmt);

        for (const s of this.sessions.values()) {
          if (s.id === lucky.id) s.stats.hp = lucky.hp;
        }

        const log = `<span style="color:#f472b6; font-weight:bold;">Кейт: «Хи-хи»</span> — поцеловала <b>${lucky.username}</b> и восстановила <b style="color:#4ade80">+${healAmt} HP</b>!`;
        this.broadcastDuelUpdate(duel, log);
      }
    }
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
      hp: this.boss.baseMaxHp,
      maxHp: this.boss.baseMaxHp,
      armor: this.boss.baseArmor,
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
        hunters: duelState.hunters.map((h) => ({ id: h.id, username: h.username, classId: h.classId, hp: h.hp, maxHp: h.maxHp, armor: h.armor })),
        allies: duelState.allies.map((a) => ({ id: a.id, username: a.username, classId: a.classId, hp: a.hp, maxHp: a.maxHp, armor: a.armor, isBoss: a.isBoss })),
      },
    });

    initialWs.send(payload);
    this.broadcast();
  }

  startDarDuel(initialPlayer: Session, initialWs: WebSocket) {
    if (!initialPlayer.stats.classId) return;

    const duelId = "dar_duel_" + crypto.randomUUID();
    initialPlayer.inDuel = true;
    initialPlayer.duelId = duelId;

    this.dar.inDuel = true;
    this.dar.duelId = duelId;
    this.dar.state = "combat";

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
      id: this.dar.id,
      username: this.dar.name,
      classId: "boss_dar",
      hp: this.dar.hp,
      maxHp: this.dar.maxHp,
      armor: this.dar.armor,
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
      isBossFight: Boolean(duel.isBossFight),
      hunters: duel.hunters.map((h) => ({ id: h.id, username: h.username, hp: h.hp, maxHp: h.maxHp, armor: h.armor, classId: h.classId, shield: h.shield || 0 })),
      allies: duel.allies.map((a) => ({ id: a.id, username: a.username, hp: a.hp, maxHp: a.maxHp, armor: a.armor, classId: a.classId, isBoss: a.isBoss, shield: a.shield || 0 })),
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
        this.boss.nextWanderSayTime = Date.now() + 4000;
      }
      this.boss.recalcPassives(null);
    }

    if (this.dar.duelId === duel.id) {
      this.dar.inDuel = false;
      this.dar.duelId = null;
      if (this.dar.state !== "dead") {
        this.dar.state = "wander";
      }
    }

    for (const flower of this.flowers.values()) {
      if (flower.duelId === duel.id) {
        flower.inDuel = false;
        flower.duelId = undefined;
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
    // dev-доверие (userId без токена, dev_* команды) — только при MC_DEV_TRUST_USERID=1 И подключении к localhost:
    // даже если переменную по ошибке включат в проде, публичный домен её не активирует.
    const devOk = isDevRequest(this.env, request);
    const lim = { tokens: MSG_BURST, at: Date.now(), strikes: 0 };

    server.addEventListener("message", (event) => {
      try {
        // защита от мусора/флуда: размер до разбора JSON, токен-бакет на сокет; злостный флуд — закрыть сокет
        const raw = event.data;
        const verdict = admitMessage(lim, raw, Date.now());
        if (verdict !== "ok") { if (verdict === "close") { try { server.close(1008, "flood"); } catch (_) {} } return; }
        const msg = JSON.parse(raw as string);
        if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.type !== "string" || msg.type.length > 40) return;

        if (msg.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
          return;
        }

        const session = this.sessions.get(server);

        // 1. Вход игрока в игру
        if (msg.type === "join") {
          const cleanName = (typeof msg.username === "string" ? msg.username : "").trim().slice(0, 32) || "Странник";
          const lowerName = cleanName.toLowerCase();

          // Вытеснение «второй вкладки» — только того же профиля (тот же вход или тот же guestId браузера), а не по нику:
          // иначе все гости «Странник» выбивали друг друга. Имя гостя («Гость» Имя) назначает мета-сервис после загрузки.
          // u:<userId> из join не проверен (токен проверяет мета-сервис позже) — по нему выбивать нельзя, иначе любой выбьет чужую сессию,
          // зная userId. Выбивание по проверенному uid — в meta.onVerified; без dev-режима до проверки ключ только по guestId.
          const dupKey = devOk && msg.userId ? `u:${String(msg.userId).slice(0, 128)}` : (typeof msg.guestId === "string" && msg.guestId ? `g:${msg.guestId.slice(0, 128)}` : null);
          void lowerName;
          for (const [oldWs, s] of this.sessions.entries()) {
            if (oldWs !== server && dupKey && (s as any).dupKey === dupKey) {
              try {
                oldWs.send(JSON.stringify({ type: "kicked", reason: "Вход с другой вкладки" }));
                oldWs.close(1000, "Duplicate session");
              } catch (_) {}
              this.meta.pvpGone(s); // дуэль вытесненной вкладки — поражение (сокет закрыт)
              this.sessions.delete(oldWs);
            }
          }
          const prev = this.sessions.get(server);
          if (prev) this.meta.pvpGone(prev); // повторный join на том же сокете

          const myId = crypto.randomUUID();
          this.sessions.set(server, {
            id: myId,
            dupKey,
            dev: devOk,
            userId: devOk ? String(msg.userId || "").slice(0, 128) : "", // реальный uid выставит мета-сервис после проверки токена
            username: cleanName,
            world: "hellfire",
            x: msg.x || 600,
            y: msg.y || 600,
            color: "#ffffff",
            inDuel: false,
            lastActionTime: 0,
            stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 },
          });

          const classesPayload = Object.fromEntries(
            Object.values(CHARACTER_CLASSES).map((c) => {
              const skill = getSkill(c.abilityId);
              return [
                c.id,
                {
                  id: c.id,
                  name: c.name,
                  color: c.color,
                  ...c.stats,
                  ability: {
                    id: skill.id,
                    name: skill.name,
                    desc: skill.description,
                    cooldown: skill.cooldown,
                  },
                },
              ];
            })
          );


          server.send(
            JSON.stringify({
              type: "welcome",
              myId,
              world: "hellfire",
              portals: WORLD_PORTALS,
              classes: classesPayload,
            })
          );
          this.broadcast();
          const joined = this.sessions.get(server);
          if (joined) this.meta.onJoin(server, joined, msg).catch((err) => console.error("meta join", err));
        }

        // 2. Движение
        if (msg.type === "move" && session && !session.inDuel && !this.meta.pvpFrozen(session)) {
          let nx = Number(msg.x), ny = Number(msg.y);
          if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
          // Миграция раскладки Аринара (2400 → 24000 → 48000 px): позиция без версии раскладки (старый клиент/сессия
          // до обновления) — безопасно в хаб, без «телепорта» в случайный биом. Позиции в D1 не хранятся.
          if (session.world === "arinar" && (session as any).arVer !== ARINAR_LAYOUT_VER) {
            (session as any).arVer = ARINAR_LAYOUT_VER;
            session.x = ZONE_RESPAWN.x; session.y = ZONE_RESPAWN.y;
            server.send(JSON.stringify({ type: "world_switched", world: "arinar", x: session.x, y: session.y, migrated: 1 }));
            this.meta.onWorldChange(server, session);
            return;
          }
          // В открытых мирах (Аринар и Поляна с мобами) позиция влияет на бой/сбор — ограничиваем скорость перемещения
          {
            const now = Date.now();
            const last = (session as any).lastMoveAt || now - 100;
            const maxStep = 60 + (now - last) * 0.7;
            const dx = nx - session.x, dy = ny - session.y, d = Math.hypot(dx, dy);
            if (d > maxStep) { nx = session.x + (dx / d) * maxStep; ny = session.y + (dy / d) * maxStep; }
            (session as any).lastMoveAt = now;
          }
          const [lo, hi] = worldBounds(session.world);
          session.x = Math.max(lo, Math.min(hi, nx));
          session.y = Math.max(lo, Math.min(hi, ny));
          this.broadcast();
        }

        // 3. Порталы (переходы между комнатами и мирами)
        if (msg.type === "use_portal" && session && !session.inDuel && !(session as any).pvp) {
          const curWorld = session.world || "hellfire";
          const portal = WORLD_PORTALS.find((p) => p.id === msg.portalId && (p.world || "hellfire") === curWorld);

          if (portal && Math.hypot(session.x - portal.x, session.y - portal.y) <= 85) {
            // Переход между мирами
            if (portal.targetWorld) {
              session.world = portal.targetWorld;
              session.x = portal.targetX || 300;
              session.y = portal.targetY || 600;
              if (session.world === "arinar") (session as any).arVer = ARINAR_LAYOUT_VER;

              // Полное снятие временных дебаффов и блокировок прошлого мира
              session.dismoraleUntil = 0;
              session.escapedUntil = 0;

              server.send(JSON.stringify({
                type: "world_switched",
                world: session.world,
                x: session.x,
                y: session.y,
              }));
              this.meta.onWorldChange(server, session);
              this.broadcast();
              return;
            }

            if (portal.id === "portal_class_select") {
              server.send(JSON.stringify({ type: "open_class_selection" }));
            } else if (portal.id === "portal_arcade") {
              server.send(JSON.stringify({ type: "open_minigames_menu", portalName: portal.name, games: MINI_GAMES }));
            }
          }
        }

        // 4. Выбор класса
        if (msg.type === "select_class" && session && !(session as any).pvp) {
          const c = CHARACTER_CLASSES[msg.classId];
          if (c) {
            session.color = c.color;
            session.stats = {
              classId: msg.classId,
              hp: c.stats.hp,
              maxHp: c.stats.maxHp,
              armor: c.stats.armor,
              minAtk: c.stats.minAtk,
              maxAtk: c.stats.maxAtk,
            };
            server.send(JSON.stringify({ type: "class_updated", stats: session.stats, color: session.color }));
            this.meta.onSelectHero(server, session);
            this.broadcast();
          }
        }

        // Только локальные тесты (MC_DEV_TRUST_USERID=1): посадить бутон рядом с игроком
        // только dev: моб/босс рядом (скриншоты боссов биомов без ожидания таймеров)
        if (msg.type === "dev_spawn_mob" && session && session.dev === true) {
          const z = (this.meta as any).zones?.[session.world || "hellfire"];
          if (z && ZONE_MOBS[String(msg.mob)]) {
            const m = z.addMob(String(msg.mob), Number(msg.x) || session.x + 120, Number(msg.y) || session.y, { special: ZONE_MOBS[String(msg.mob)].boss ? "boss" : "" });
            if (msg.cursed && !m.cursed) { m.cursed = true; m.maxHp = m.hp = Math.round(m.hp * 2.5); m.skills = skillsFor(m.type, 3, m.id); m.skCd = Object.fromEntries(m.skills.map((k: string) => [k, 3])); }
          }
          return;
        }
        // только dev (MC_DEV_TRUST_USERID=1): мгновенный перенос по миру — скриншоты/плейтесты Аринара 24000 px
        if (msg.type === "dev_teleport" && session && session.dev === true) {
          const [lo, hi] = worldBounds(session.world);
          session.x = Math.max(lo, Math.min(hi, Number(msg.x) || session.x)); session.y = Math.max(lo, Math.min(hi, Number(msg.y) || session.y));
          (session as any).lastMoveAt = Date.now(); if (session.world === "arinar") (session as any).arVer = ARINAR_LAYOUT_VER;
          if (msg.god) { const ms = (this.meta as any).ms?.get(session.id); if (ms) { ms.invulnUntil = Date.now() + 10 * 60000; ms.zp.alive = true; ms.zp.hp = ms.zp.maxHp; } } // dev: неуязвимость для скриншотов
          this.meta.onWorldChange(server, session);
          server.send(JSON.stringify({ type: "zone_respawn", x: session.x, y: session.y }));
          return;
        }
        if (msg.type === "dev_plant_flower" && session && session.dev === true && (session.world || "hellfire") === "hellfire") {
          this.plantFlower(Math.round(Number(msg.x ?? session.x)), Math.round(Number(msg.y ?? session.y)));
          const f = [...this.flowers.values()].pop();
          if (f && (msg.stage === "mature" || msg.stage === "active")) f.stage = msg.stage; // только dev: показать все стадии
          this.broadcast();
          return;
        }

        // 5. Взаимодействие с цветком: Тронуть
        if (msg.type === "touch_flower" && session && !session.inDuel && (session.world || "hellfire") === "hellfire") {
          const flower = this.flowers.get(msg.flowerId);
          if (flower && flower.stage === "bud") {
            const dist = Math.hypot(session.x - flower.x, session.y - flower.y);
            if (dist <= 120) {
              session.stats.hp = Math.max(1, session.stats.hp - 1);
              const touchPayload = JSON.stringify({
                type: "flower_touched_notify",
                targetId: session.id,
                damage: 1,
                hp: session.stats.hp,
                maxHp: session.stats.maxHp
              });
              for (const [ws, s] of this.sessions.entries()) {
                if ((s.world || "hellfire") === "hellfire") {
                  try { ws.send(touchPayload); } catch (_) {}
                }
              }
              this.broadcast();
            }
          }
          return;
        }

        // 6. Взаимодействие с цветком: Сорвать
        if (msg.type === "pick_flower" && session && !session.inDuel && (session.world || "hellfire") === "hellfire") {
          const flower = this.flowers.get(msg.flowerId);
          if (flower && flower.stage === "mature") {
            const dist = Math.hypot(session.x - flower.x, session.y - flower.y);
            if (dist <= 120) {
              this.flowers.delete(flower.id);
              session.shield = (session.shield || 0) + 20;
              const pickPayload = JSON.stringify({
                type: "flower_picked_notify",
                playerId: session.id,
                flowerId: flower.id,
                shield: session.shield
              });
              for (const [ws, s] of this.sessions.entries()) {
                if ((s.world || "hellfire") === "hellfire") {
                  try { ws.send(pickPayload); } catch (_) {}
                }
              }
              this.broadcast();
            }
          }
          return;
        }

        // 7. Дуэль: вызов (только внутри одного мира)
        if (msg.type === "duel_invite" && session && session.stats.classId && !session.inDuel && !(session as any).pvp) {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1000);
            server.send(JSON.stringify({ type: "toast_error", message: `Восстановление после гибели: ${leftSec}с` }));
            return;
          }

          if ((session.world || "hellfire") === "hellfire") {
            if (msg.targetId === "boss_dar") {
              const roll = Math.random();
              if (roll < 0.2) {
                this.broadcastDarSay("Ладно уговорил");
                this.startDarDuel(session, server);
              } else {
                const declineQuotes = ["Я пацифист", "Идите нафиг"];
                this.broadcastDarSay(declineQuotes[Math.floor(Math.random() * declineQuotes.length)]);
                server.send(JSON.stringify({ type: "duel_declined_notify", targetNick: "Дар" }));
              }
              return;
            }

            if (msg.targetId && this.flowers.has(msg.targetId)) {
              const flower = this.flowers.get(msg.targetId)!;
              if (flower.stage === "active" && !flower.inDuel) {
                this.startFlowerBattle(session, server, flower);
              }
              return;
            }
          }

          // Старые PvP-дуэли (без проверки приглашения на сервере) удалены — вызов игрока идёт через
          // сервер-авторитетные дуэли MetaService (duel_challenge / duel_respond, см. meta/pvp.ts).
        }

        // 10. Присоединение к бою босса (только в Аду)
        if (msg.type === "join_boss_fight" && session && session.stats.classId && !session.inDuel && !(session as any).pvp && (session.world || "hellfire") === "hellfire") {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1000);
            server.send(JSON.stringify({ type: "toast_error", message: `Восстановление после гибели: ${leftSec}с` }));
            return;
          }

          const targetDuelId = this.boss.duelId || this.dar.duelId;
          const duel = targetDuelId ? this.activeDuels.get(targetDuelId) : null;
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

            let yellLog = "";
            if (msg.side === "kate" || msg.side === "allies") {
              duel.allies.push(participant);
              this.boss.recalcPassives(duel);
              yellLog = `<b>${session.username}</b> встал на сторону защитников!`;
            } else {
              duel.hunters.push(participant);
              this.boss.recalcPassives(duel);
              yellLog = `<b>${session.username}</b> присоединился к охотникам!`;
            }

            const payload = JSON.stringify({
              type: "duel_start",
              isBossFight: true,
              duel: {
                id: duel.id,
                isBossFight: true,
                hunters: duel.hunters.map((h) => ({ id: h.id, username: h.username, hp: h.hp, maxHp: h.maxHp, armor: h.armor, classId: h.classId })),
                allies: duel.allies.map((a) => ({ id: a.id, username: a.username, hp: a.hp, maxHp: a.maxHp, armor: a.armor, classId: a.classId, isBoss: a.isBoss })),
                p1: duel.p1,
                p2: duel.p2,
              },
            });
            server.send(payload);

            this.broadcastDuelUpdate(duel, yellLog);
            this.broadcast();
          }
        }

        // 11. Действия боя
        if (msg.type === "duel_action" && session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (!duel) return;

          const now = Date.now();

          if (msg.action === "escape") {
            const { logText } = processCombatAction("escape", 1, session, duel, this.boss, msg.targetId);
            this.broadcastDuelUpdate(duel, logText);

            const hasDar = duel.hunters.some((h) => h.id === this.dar.id) || duel.allies.some((a) => a.id === this.dar.id);
            if (hasDar) {
              this.dar.onPlayerEscaped((q) => this.broadcastDarSay(q));
            } else if (duel.isBossFight) {
              this.broadcastBossSay("Убежал(");
            }

            if (!duel.isBossFight) {
              const isP1 = duel.p1.id === session.id;
              const otherParticipant = isP1 ? duel.p2 : duel.p1;
              const otherSession = [...this.sessions.values()].find((s) => s.id === otherParticipant.id);

              session.inDuel = false;
              if (otherSession) {
                otherSession.inDuel = false;
                otherSession.stats.hp = otherSession.stats.maxHp;
              }

              const endPayload = JSON.stringify({ type: "duel_end", winnerName: otherParticipant.username });
              if (duel.p1.ws) duel.p1.ws.send(endPayload);
              if (duel.p2.ws) duel.p2.ws.send(endPayload);

              this.activeDuels.delete(duel.id);
              this.boss.onPlayerDuelFinished(otherParticipant.username, (q) => this.broadcastBossSay(q));
            } else {
              duel.hunters = duel.hunters.filter((h) => h.id !== session.id);
              duel.allies = duel.allies.filter((a) => a.id !== session.id);
              this.boss.recalcPassives(duel);

              if (duel.hunters.length === 0) {
                this.endBossBattle(duel, "Защитники");
              }
            }

            this.broadcast();
            return;
          }

          if (now - session.lastActionTime < 1900) return;
          session.lastActionTime = now;

          const { logText, isDead, target } = processCombatAction(
            msg.action,
            msg.chargeMult,
            session,
            duel,
            this.boss,
            msg.targetId
          );
          this.broadcastDuelUpdate(duel, logText);

          if (isDead && target) {
            let targetSession: Session | null = null;
            let targetWs: WebSocket | null = null;

            for (const [ws, s] of this.sessions.entries()) {
              if (s.id === target.id) {
                targetSession = s;
                targetWs = ws;
                break;
              }
            }

            if (targetSession) {
              targetSession.inDuel = false;
              targetSession.stats.hp = targetSession.stats.maxHp;
              targetSession.rejoinBlockedUntil = Date.now() + 30000;
            }

            if (targetWs) {
              try {
                targetWs.send(JSON.stringify({ type: "combat_death", lockDuration: 30, winnerName: session.username }));
              } catch (_) {}
            }

            if (!duel.isBossFight) {
              session.inDuel = false;
              session.stats.hp = session.stats.maxHp;

              const endPayload = JSON.stringify({ type: "duel_end", winnerName: session.username });
              if (duel.p1.ws) duel.p1.ws.send(endPayload);
              if (duel.p2.ws) duel.p2.ws.send(endPayload);

              this.activeDuels.delete(duel.id);
              this.boss.onPlayerDuelFinished(session.username, (q) => this.broadcastBossSay(q));
            } else {
              if (target.id === this.boss.id) {
                this.boss.state = "dead";
                this.boss.deathTime = Date.now();
                this.endBossBattle(duel, "Охотники");
              } else if (target.id === this.dar.id) {
                this.dar.state = "dead";
                this.dar.deathTime = Date.now();
                this.endBossBattle(duel, "Охотники");
              } else if (target.isFlower) {
                this.flowers.delete(target.id);
                this.broadcastDarSay("Вы мои умнички!");

                duel.hunters = duel.hunters.filter((h) => h.id !== target.id);
                duel.allies = duel.allies.filter((a) => a.id !== target.id);

                if (duel.allies.length === 0 || duel.hunters.length === 0) {
                  this.endBossBattle(duel, "Победители");
                }
              } else {
                duel.hunters = duel.hunters.filter((h) => h.id !== target.id);
                duel.allies = duel.allies.filter((a) => a.id !== target.id);
                this.boss.recalcPassives(duel);

                if (duel.hunters.length === 0) {
                  this.endBossBattle(duel, "Защитники");
                }
              }
            }
            this.broadcast();
          }
        }

        // 13. Co-op забеги: вход / выход / ретрансляция внутри комнаты
        // Лобби и экземпляры забегов (server/runs.ts): создать / список / войти / готов / старт / гибель / выход
        // во время PvP-дуэли — никаких забегов/лобби (иначе можно «сбежать» с арены без поражения)
        if (session && (session as any).pvp && typeof msg.type === "string" && (msg.type.startsWith("lobby_") || msg.type.startsWith("run_"))) {
          server.send(JSON.stringify({ type: "toast_error", message: "Сначала завершите дуэль" }));
          return;
        }
        if (session && typeof msg.type === "string" && (msg.type.startsWith("lobby_") || msg.type === "run_join" || msg.type === "run_leave" || msg.type === "run_dead" || msg.type === "run_giveup" || msg.type === "run_finish" || msg.type === "run_relay")) {
          this.handleRunMsg(server, session, msg);
          return;
        }

        // 14. Мета-прогрессия, квесты, инвентарь, открытый мир (server/meta/service.ts)
        if (session && typeof msg.type === "string" && this.meta.handle(server, session, msg, {
          runMembers: (_room: string) => (session.runId ? this.runMembers(session.runId) : []),
          broadcast: () => this.broadcast(),
        })) return;

        // 12. Локальный чат (только игрокам того же мира)
        if (msg.type === "chat" && session && msg.text) {
          const cleanText = String(msg.text).trim().slice(0, 45);
          if (cleanText.length > 0) {
            const chatPayload = JSON.stringify({
              type: "chat_bubble",
              playerId: session.id,
              username: session.username,
              role: this.meta.roleOfSid(session.id),
              text: cleanText,
            });
            for (const [ws, s] of this.sessions.entries()) {
              if ((s.world || "hellfire") === (session.world || "hellfire")) {
                try { ws.send(chatPayload); } catch (_) { this.sessions.delete(ws); }
              }
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
            if (!duel.isBossFight) {
              const isP1 = duel.p1.id === session.id;
              const remainingPart = isP1 ? duel.p2 : duel.p1;
              const remSession = [...this.sessions.values()].find((s) => s.id === remainingPart.id);

              if (remSession) {
                remSession.inDuel = false;
                remSession.stats.hp = remSession.stats.maxHp;
              }

              const endPayload = JSON.stringify({ type: "duel_end", winnerName: "Противник отключился" });
              if (remainingPart.ws) {
                try { remainingPart.ws.send(endPayload); } catch (_) {}
              }
            }
            this.activeDuels.delete(session.duelId);
          }
        }
        if (session) this.leaveRun(session, null);
        if (session) this.meta.onClose(session);
        this.sessions.delete(server);
        this.broadcast();
      } catch (_) {}
    };

    server.addEventListener("close", closeHandler);
    server.addEventListener("error", closeHandler);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------------- забеги: лобби и экземпляры ----------------
  sessionsById(): Map<string, Session> {
    const m = new Map<string, Session>();
    for (const s of this.sessions.values()) m.set(s.id, s);
    return m;
  }
  wsOf(sid: string): WebSocket | null {
    for (const [ws, s] of this.sessions.entries()) if (s.id === sid) return ws;
    return null;
  }
  runMembers(runId: string): Session[] {
    const inst = this.lobbies.get(runId);
    if (!inst) return [];
    const byId = this.sessionsById();
    return inst.members.map((id) => byId.get(id)).filter(Boolean) as Session[];
  }
  sendRun(runId: string, payload: any) {
    const inst = this.lobbies.get(runId);
    if (!inst) return;
    const txt = JSON.stringify(payload);
    for (const [ws, s] of this.sessions.entries()) if (s.runId === runId) { try { ws.send(txt); } catch (_) {} }
  }
  // Состав экземпляра. Хост симуляции орды = лидер лобби.
  broadcastRunMembers(runId: string) {
    const inst = this.lobbies.get(runId);
    if (!inst) return;
    const byId = this.sessionsById();
    // members — участники симуляции (без «сдавшихся»), lobby — весь состав экземпляра
    const members = this.lobbies.active(inst).map((id) => byId.get(id)).filter(Boolean) as Session[];
    this.meta.onRunMembers(inst.room, members);
    const info = this.lobbies.info(inst, byId);
    this.sendRun(runId, {
      type: "run_members", room: inst.room, runId, epoch: inst.epoch, state: inst.state, hostId: this.lobbies.hostId(inst), leaderId: inst.leaderId, lobby: info,
      members: members.map((s) => ({ id: s.id, username: s.username, color: s.color || "#ffffff", classId: s.stats?.classId || null })),
    });
  }
  portalOk(session: Session, room: string, portalId: unknown): boolean {
    if (!portalId) return true; // отладочный/глубокая ссылка: без портала (сервер всё равно ведёт состав и эпохи)
    const portal = WORLD_PORTALS.find((p) => p.id === portalId && p.runRoom === room);
    return !!portal && (portal.world || "hellfire") === (session.world || "hellfire") && Math.hypot(session.x - portal.x, session.y - portal.y) <= 85;
  }
  enterRun(ws: WebSocket, session: Session, inst: RunInstance) {
    if (session.runId && session.runId !== inst.id) this.leaveRun(session, null);
    this.lobbies.join(inst, session.id);
    session.runId = inst.id;
    session.runRoom = inst.room;
    session.runJoinedAt = Date.now();
    ws.send(JSON.stringify({ type: "run_joined", room: inst.room, runId: inst.id, name: inst.name, myId: session.id, epoch: inst.epoch, state: inst.state, lobby: this.lobbies.info(inst, this.sessionsById()) }));
    this.broadcastRunMembers(inst.id);
    this.broadcast();
  }
  startRun(inst: RunInstance) {
    for (const s of this.runMembers(inst.id)) this.meta.onRunJoin(s, inst.room, inst.members.length);
    this.sendRun(inst.id, { type: "run_start", room: inst.room, runId: inst.id, epoch: inst.epoch, hostId: this.lobbies.hostId(inst) });
    this.broadcastRunMembers(inst.id);
  }
  resetRun(inst: RunInstance, reason: string) {
    this.sendRun(inst.id, { type: "run_reset", room: inst.room, runId: inst.id, epoch: inst.epoch, reason });
    this.broadcastRunMembers(inst.id);
  }
  // Выход из экземпляра (по запросу, при разрыве связи, при переходе в другое лобби)
  leaveRun(session: Session, ws: WebSocket | null) {
    const inst = this.lobbies.get(session.runId);
    const room = session.runRoom;
    session.runId = undefined;
    session.runRoom = undefined;
    session.runJoinedAt = undefined;
    if (ws && room) { try { ws.send(JSON.stringify({ type: "run_left", room })); } catch (_) {} }
    if (!inst) return;
    const r = this.lobbies.leave(inst, session.id);
    if (r === "wipe") this.resetRun(inst, "wipe");
    else if (r === "left") this.broadcastRunMembers(inst.id);
  }

  handleRunMsg(ws: WebSocket, session: Session, msg: any) {
    const err = (message: string) => ws.send(JSON.stringify({ type: "toast_error", message }));
    const inst = this.lobbies.get(session.runId);
    switch (msg.type) {
      case "lobby_list": {
        const room = String(msg.room || "");
        if (!RUN_ROOMS[room]) return err("Комната забега не найдена");
        ws.send(JSON.stringify({ type: "lobby_list", room, lobbies: this.lobbies.list(room, this.sessionsById()) }));
        return;
      }
      case "run_join": // старые клиенты: сразу отдельный экземпляр и старт (общих комнат больше нет)
      case "lobby_create": {
        const room = String(msg.room || "");
        if (!RUN_ROOMS[room]) return err("Комната забега не найдена");
        if (session.inDuel) return err("Сначала завершите бой");
        if (!this.portalOk(session, room, msg.portalId)) return err("Подойдите ближе к входу");
        const created = this.lobbies.create(room, session, { name: msg.name, isPublic: msg.type === "run_join" ? false : msg.isPublic !== false });
        this.enterRun(ws, session, created);
        if (msg.type === "run_join" || msg.autoStart) { this.lobbies.start(created, session.id, true); this.startRun(created); }
        this.broadcast();
        return;
      }
      case "lobby_join": {
        const target = this.lobbies.get(String(msg.runId || ""));
        if (session.inDuel) return err("Сначала завершите бой");
        const e = this.lobbies.canJoin(target, session.id);
        if (e) return err(e);
        if (!this.portalOk(session, target!.room, msg.portalId)) return err("Подойдите ближе к входу");
        this.enterRun(ws, session, target!);
        return;
      }
      case "lobby_ready": {
        if (!inst) return;
        this.lobbies.setReady(inst, session.id, !!msg.ready);
        this.broadcastRunMembers(inst.id);
        return;
      }
      case "lobby_start": {
        if (!inst) return err("Вы не в лобби");
        const e = this.lobbies.start(inst, session.id);
        if (e) return err(e);
        this.startRun(inst);
        this.broadcast();
        return;
      }
      case "run_dead": {
        if (!inst) return;
        if (this.lobbies.setDead(inst, session.id, !!msg.dead, Number(msg.epoch))) this.resetRun(inst, "wipe");
        return;
      }
      case "run_giveup": { // «Сдаться» после гибели: в лобби экземпляра; последний живой → сброс
        if (!inst) return;
        const wiped = this.lobbies.giveUp(inst, session.id, Number(msg.epoch));
        ws.send(JSON.stringify({ type: "run_gaveup", runId: inst.id, epoch: inst.epoch, state: inst.state }));
        if (wiped) this.resetRun(inst, "wipe"); else this.broadcastRunMembers(inst.id);
        return;
      }
      case "run_finish": { // завершение (победа в мини-игре и т.п.) — только хост/лидер текущей эпохи
        if (!inst || this.lobbies.hostId(inst) !== session.id || inst.state !== "running" || Number(msg.epoch) !== inst.epoch) return;
        this.lobbies.reset(inst);
        this.resetRun(inst, "finish");
        return;
      }
      case "run_leave": {
        this.leaveRun(session, ws);
        this.broadcast();
        return;
      }
      case "run_relay": {
        if (!this.lobbies.relayAllowed(inst, session.id, msg.epoch)) return; // чужая/старая эпоха или забег не идёт
        const payload = JSON.stringify({ type: "run_relay", room: inst!.room, runId: inst!.id, epoch: inst!.epoch, from: session.id, data: msg.data ?? null });
        if (payload.length > RUN_RELAY_MAX_BYTES) return;
        const to = typeof msg.to === "string" ? msg.to : null;
        for (const [w, s] of this.sessions.entries()) {
          if (w === ws || s.runId !== inst!.id) continue;
          if (to && s.id !== to) continue;
          try { w.send(payload); } catch (_) {}
        }
        return;
      }
    }
  }

  broadcast() {
    try {
      // Группы видимости: Поляна, Аринар и отдельная арена каждой PvP-дуэли (arena:<id>).
      // Clerk userId наружу не отдаётся: игроков различают по id сессии (случайный UUID на подключение).
      const groupOf = (s: any) => { const w = s.world || "hellfire"; return w === "arena" ? `arena:${s.pvp || ""}` : w === "arinar" ? "arinar" : "hellfire"; };
      const groups = new Map<string, any[]>();
      const seen = new Set<string>();
      for (const s of this.sessions.values()) {
        if (!s || !s.username) continue;
        const w = s.world || "hellfire";
        const g = groupOf(s);
        const key = g + "|" + s.username.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const pData = {
          id: s.id,
          world: w,
          username: s.username,
          role: this.meta.roleOfSid(s.id), // «Админ» / «Модератор» (D1 player_roles, только проверенный вход)
          x: s.x,
          y: s.y,
          color: s.color || "#ffffff",
          inDuel: Boolean(s.inDuel || (s as any).pvp),
          escapedUntil: s.escapedUntil || 0,
          rejoinBlockedUntil: s.rejoinBlockedUntil || 0,
          dismoraleUntil: s.dismoraleUntil || 0,
          shield: s.shield || 0,
          stats: s.stats,
          sv: this.meta.publicStats(s.id), // статы героя, посчитанные сервером (панель «ЦЕЛЬ»)
          runRoom: s.runRoom || null,
        };
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(pData);
      }
      const payloads = new Map<string, string>();
      const payloadFor = (g: string) => {
        let p = payloads.get(g);
        if (p) return p;
        const hf = g === "hellfire";
        p = JSON.stringify({
          type: "players_state",
          world: g.startsWith("arena:") ? "arena" : g,
          players: groups.get(g) || [],
          boss: hf ? this.boss.getState() : null,
          dar: hf ? this.dar.getState() : null,
          flowers: hf ? Array.from(this.flowers.values()) : [],
        });
        payloads.set(g, p);
        return p;
      };
      // Интерес в Аринаре (48000 px): получатель видит игроков своего и соседних чанков (WORLD_CHUNK) —
      // общий payload на чанк, а не на игрока; тот, кто вне соседних чанков, просто не приходит.
      const arin = groups.get("arinar") || [];
      const chunkOf = (x: number, y: number) => [Math.floor(x / WORLD_CHUNK), Math.floor(y / WORLD_CHUNK)];
      // ячейка 400 px: общий payload на ячейку; виден квадрат ±OPEN_AOI от центра ячейки (самый дальний зум камеры, не больше)
      const AC = 400;
      const arinFor = (s: any) => {
        const cx = Math.floor((s.x || 0) / AC), cy = Math.floor((s.y || 0) / AC);
        const key = `arinar@${cx},${cy}`;
        let p = payloads.get(key);
        if (p) return p;
        const mx = (cx + 0.5) * AC, my = (cy + 0.5) * AC;
        const vis = arin.filter((o) => o === s || (Math.abs((o.x || 0) - mx) <= OPEN_AOI && Math.abs((o.y || 0) - my) <= OPEN_AOI));
        p = JSON.stringify({ type: "players_state", world: "arinar", players: vis, boss: null, dar: null, flowers: [], aoi: 1 });
        payloads.set(key, p);
        return p;
      };
      for (const [ws, s] of this.sessions.entries()) {
        try { ws.send(groupOf(s) === "arinar" ? arinFor(s) : payloadFor(groupOf(s))); } catch (_) { this.sessions.delete(ws); }
      }
    } catch (err) {
      console.error("Ошибка в broadcast:", err);
    }
  }
}