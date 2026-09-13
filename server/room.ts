import { DurableObject } from "cloudflare:workers";
import { WORLD_PORTALS, MINI_GAMES, CLASSES_CONFIG } from "./config";
import { processCombatAction, calcArmorReduction } from "./combat";
import { KeytBoss } from "./boss";
import type { Session, DuelState, FlowerState, FlowerType } from "./types";
import { CHARACTER_CLASSES } from "./classes";
import { getSkill } from "./skills";
import { DarBoss } from "./dar";

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

  lastTick = Date.now();
  lastHealTick = Date.now();

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Map();
    this.activeDuels = new Map();
    this.boss = new KeytBoss();
    this.dar = new DarBoss();
    this.flowers = new Map();

    setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;

      // 1. Пассивное лечение у Алтаря Перевоплощения
      if (now - this.lastHealTick >= 1000) {
        this.lastHealTick = now;
        let anyHealed = false;

        for (const s of this.sessions.values()) {
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

      // 2. Обновление Кейт
      this.boss.update(
        dt,
        this.sessions,
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

      // 3. Обновление Дар (с цветками и поливом)
      this.dar.update(
        dt,
        this.sessions,
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
      this.updateFlowers(dt, now);

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

  updateFlowers(dt: number, now: number) {
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

        // 2. Помощь союзникам в пределах 10м (200px)
        let helped = false;
        for (const duel of this.activeDuels.values()) {
          const hasDar = duel.hunters.some((h) => h.id === this.dar.id) || duel.allies.some((a) => a.id === this.dar.id);
          const hasOtherFlower = duel.hunters.some((h) => h.isFlower) || duel.allies.some((a) => a.isFlower);

          if (hasDar || hasOtherFlower) {
            let inRange = false;
            for (const p of [...duel.hunters, ...duel.allies]) {
              const s = [...this.sessions.values()].find((sess) => sess.id === p.id);
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

        // 3. Агр на игроков в радиусе 3 метров (60px)
        let targetSession: Session | null = null;
        let targetWs: WebSocket | null = null;
        let minDist = 60;

        for (const [ws, s] of this.sessions.entries()) {
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
    for (const ws of [...this.sessions.keys()]) {
      try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
    }
  }

  broadcastDarSay(text: string) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: "boss_dar",
      username: "Дар",
      text,
    });
    for (const ws of [...this.sessions.keys()]) {
      try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
    }
  }

  broadcastFlowerSay(flowerId: string, name: string, text: string) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: flowerId,
      username: name,
      text,
    });
    for (const ws of [...this.sessions.keys()]) {
      try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
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
    for (const ws of [...this.sessions.keys()]) {
      try { ws.send(payload); } catch (_) {}
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
              portals: WORLD_PORTALS,
              classes: classesPayload,
            })
          );
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

        // 5. Взаимодействие с цветком: Тронуть (Стадия 1 - Бутон)
        if (msg.type === "touch_flower" && session && !session.inDuel) {
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
              for (const ws of [...this.sessions.keys()]) {
                try { ws.send(touchPayload); } catch (_) {}
              }
              this.broadcast();
            }
          }
          return;
        }

        // 6. Взаимодействие с цветком: Сорвать (Стадия 2 - Созревший стебель)
        if (msg.type === "pick_flower" && session && !session.inDuel) {
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
              for (const ws of [...this.sessions.keys()]) {
                try { ws.send(pickPayload); } catch (_) {}
              }
              this.broadcast();
            }
          }
          return;
        }

        // 7. Дуэль: вызов
        if (msg.type === "duel_invite" && session && session.stats.classId && !session.inDuel) {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1000);
            server.send(JSON.stringify({ type: "toast_error", message: `Восстановление после гибели: ${leftSec}с` }));
            return;
          }

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

          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId && s.stats.classId && !s.inDuel) {
              targetWs.send(JSON.stringify({ type: "duel_incoming", fromId: session.id, fromUsername: session.username }));
              break;
            }
          }
        }

        // 8. Дуэль: отказ
        if (msg.type === "duel_decline") {
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId) {
              targetWs.send(JSON.stringify({ type: "duel_declined_notify", targetNick: session.username }));
              break;
            }
          }
        }

        // 9. Дуэль: принятие
        if (msg.type === "duel_accept" && session && !session.inDuel) {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1000);
            server.send(JSON.stringify({ type: "toast_error", message: `Восстановление после гибели: ${leftSec}с` }));
            return;
          }

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
              duel: {
                id: duelId,
                isBossFight: false,
                hunters: [p1],
                allies: [p2],
                p1,
                p2,
              },
            });

            server.send(payload);
            opponentWs.send(payload);
            this.broadcast();
          }
        }

        // 10. Присоединение к бою босса
        if (msg.type === "join_boss_fight" && session && session.stats.classId && !session.inDuel) {
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

        // 12. Чат
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
            rejoinBlockedUntil: s.rejoinBlockedUntil || 0,
            dismoraleUntil: s.dismoraleUntil || 0,
            shield: s.shield || 0,
            stats: s.stats,
          });
        }
      }

      const payload = JSON.stringify({
        type: "players_state",
        players: Array.from(uniquePlayers.values()),
        boss: this.boss.getState(),
        dar: this.dar.getState(),
        flowers: Array.from(this.flowers.values()),
      });

      for (const ws of [...this.sessions.keys()]) {
        try { ws.send(payload); } catch (_) { this.sessions.delete(ws); }
      }
    } catch (err) {
      console.error("Ошибка в broadcast:", err);
    }
  }
}