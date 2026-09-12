import type { Session, DuelState, BossState } from "./types";
import { calcArmorReduction } from "./combat";

export class KeytBoss {
  id = "boss_keyt";
  name = "Кейт";
  x = 700;
  y = 700;
  spawnX = 700;
  spawnY = 700;
  dirX = 0;
  dirY = 1;

  state: "wander" | "chase" | "combat" | "dead" = "wander";
  targetPlayerId: string | null = null;

  baseHp = 100;
  baseMaxHp = 100;
  baseArmor = 10;
  baseAtk = 5;

  hp = 100;
  maxHp = 100;
  armor = 10;
  attack = 5;

  inDuel = false;
  duelId: string | null = null;
  deathTime = 0;

  nextAttackTime = 0;
  nextWanderTime = 0;
  wanderTargetX = 700;
  wanderTargetY = 700;

  // Радиусы: агр в упор (4.5м = 90px), контакт хитбоксов = 35px
  AGGRO_RADIUS = 90;
  HITBOX_RADIUS = 35;
  SPEED = 185; // Быстрый рывок при обнаружении

  getState(): BossState {
    return {
      id: this.id,
      name: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      dirX: this.dirX,
      dirY: this.dirY,
      state: this.state,
      hp: this.hp,
      maxHp: this.maxHp,
      armor: this.armor,
      attack: this.attack,
      inDuel: this.inDuel,
      duelId: this.duelId || undefined,
    };
  }

  recalcPassives(duel: DuelState | null): string[] {
    const yells: string[] = [];
    if (!duel) {
      this.maxHp = this.baseMaxHp;
      this.armor = this.baseArmor;
      this.attack = this.baseAtk;
      return yells;
    }

    const livingAllies = duel.allies.filter((a) => !a.isBoss && a.hp > 0).length;
    const livingEnemies = duel.hunters.filter((h) => h.hp > 0).length;

    const allyBonusAtk = livingAllies * 10;
    const allyBonusHp = livingAllies * 100;
    const allyBonusArmor = livingAllies * 30;

    const enemyBonusAtk = livingEnemies * 3;
    const enemyBonusHp = livingEnemies * 20;
    const enemyBonusArmor = livingEnemies * 10;

    const oldMaxHp = this.maxHp;
    this.attack = this.baseAtk + allyBonusAtk + enemyBonusAtk;
    this.armor = this.baseArmor + allyBonusArmor + enemyBonusArmor;
    this.maxHp = this.baseMaxHp + allyBonusHp + enemyBonusHp;

    if (this.maxHp > oldMaxHp) {
      this.hp += this.maxHp - oldMaxHp;
    }
    this.hp = Math.min(this.hp, this.maxHp);

    return yells;
  }

  onEnemyKilled(): string {
    this.hp = Math.min(this.maxHp, this.hp + 30);
    return `<span style="color:#f472b6; font-weight:bold;">Кейт: «Ням!»</span> — восстановила себе <b style="color:#4ade80">30 HP</b>!`;
  }

  update(
    dt: number,
    sessions: Map<WebSocket, Session>,
    activeDuels: Map<string, DuelState>,
    onTriggerCombat: (targetSession: Session, ws: WebSocket) => void,
    onDuelUpdate: (duel: DuelState, log: string) => void,
    onDuelEnd: (duel: DuelState, winnerName: string) => void
  ) {
    const now = Date.now();

    // 1. Возрождение через 5 секунд
    if (this.state === "dead") {
      if (now - this.deathTime >= 5000) {
        this.state = "wander";
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.hp = this.baseMaxHp;
        this.maxHp = this.baseMaxHp;
        this.armor = this.baseArmor;
        this.attack = this.baseAtk;
        this.inDuel = false;
        this.duelId = null;
      }
      return;
    }

    // 2. В бою: стоит неподвижно и атакует по таймеру
    if (this.state === "combat") {
      if (!this.duelId || !activeDuels.has(this.duelId)) {
        this.state = "wander";
        this.inDuel = false;
        this.duelId = null;
        return;
      }

      const duel = activeDuels.get(this.duelId)!;

      if (now >= this.nextAttackTime) {
        this.nextAttackTime = now + (1500 + Math.random() * 3500);

        const livingHunters = duel.hunters.filter((h) => h.hp > 0);
        if (livingHunters.length > 0) {
          const target = livingHunters[Math.floor(Math.random() * livingHunters.length)];
          let targetSession: Session | null = null;
          for (const s of sessions.values()) {
            if (s.id === target.id) {
              targetSession = s;
              break;
            }
          }

          if (targetSession) {
            const rawDmg = this.attack;
            const red = calcArmorReduction(targetSession.stats.armor);
            const finalDmg = Math.max(1, Math.round(rawDmg * (1 - red)));

            target.hp = Math.max(0, target.hp - finalDmg);
            targetSession.stats.hp = target.hp;

            let logText = `<span style="color:#f472b6">Кейт</span> атаковала <b>${target.username}</b> на <span style="color:#ef4444">${finalDmg}</span> урона!`;

            if (target.hp <= 0) {
              logText += `<br>${this.onEnemyKilled()}`;
            }

            onDuelUpdate(duel, logText);

            if (duel.hunters.every((h) => h.hp <= 0)) {
              onDuelEnd(duel, "Кейт и её союзники");
            }
          }
        }
      }
      return;
    }

    // 3. Блуждание на спокойной скорости (0.35x)
    if (this.state === "wander") {
      if (now >= this.nextWanderTime) {
        this.nextWanderTime = now + (2500 + Math.random() * 3000);
        this.wanderTargetX = Math.max(100, Math.min(1100, this.x + (Math.random() * 260 - 130)));
        this.wanderTargetY = Math.max(100, Math.min(1100, this.y + (Math.random() * 260 - 130)));
      }

      const wdx = this.wanderTargetX - this.x;
      const wdy = this.wanderTargetY - this.y;
      const wDist = Math.hypot(wdx, wdy);

      if (wDist > 5) {
        this.dirX = wdx / wDist;
        this.dirY = wdy / wDist;
        this.x += this.dirX * (this.SPEED * 0.35) * dt;
        this.y += this.dirY * (this.SPEED * 0.35) * dt;
      }

      // Сканирование: среагирует, только если подойти ближе 90 px (~4.5 метра)
      for (const [ws, s] of sessions.entries()) {
        if (!s.inDuel && s.stats.classId && (!s.escapedUntil || now >= s.escapedUntil)) {
          const dist = Math.hypot(s.x - this.x, s.y - this.y);
          if (dist <= this.AGGRO_RADIUS) {
            this.state = "chase";
            this.targetPlayerId = s.id;
            break;
          }
        }
      }
      return;
    }

    // 4. Внезапный скример-рывок
    if (this.state === "chase") {
      let targetSession: Session | null = null;
      let targetWs: WebSocket | null = null;

      for (const [ws, s] of sessions.entries()) {
        if (s.id === this.targetPlayerId) {
          targetSession = s;
          targetWs = ws;
          break;
        }
      }

      if (!targetSession || targetSession.inDuel || !targetSession.stats.classId || (targetSession.escapedUntil && now < targetSession.escapedUntil)) {
        this.state = "wander";
        this.targetPlayerId = null;
        return;
      }

      const cdx = targetSession.x - this.x;
      const cdy = targetSession.y - this.y;
      const dist = Math.hypot(cdx, cdy);

      // Если игрок вовремя сделал рывок/убежал дальше 180 px — погоня прекращается
      if (dist > this.AGGRO_RADIUS + 90) {
        this.state = "wander";
        this.targetPlayerId = null;
        return;
      }

      this.dirX = cdx / dist;
      this.dirY = cdy / dist;
      this.x += this.dirX * this.SPEED * dt;
      this.y += this.dirY * this.SPEED * dt;

      if (dist <= this.HITBOX_RADIUS && targetWs) {
        this.state = "combat";
        this.targetPlayerId = null;
        this.nextAttackTime = now + (1500 + Math.random() * 2500);
        onTriggerCombat(targetSession, targetWs);
      }
    }
  }
}