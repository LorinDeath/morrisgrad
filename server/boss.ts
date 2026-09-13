import type { Session, DuelState, BossState } from "./types";
import { calcArmorReduction } from "./combat";

const WANDER_QUOTES = [
  "А где Нофорд?",
  "Мне хочется спать...",
  "Не ходите по помытому, мря)",
  "Не хочу чтобы Мэл злилась(",
  "Кьют хорошая...",
  "Китти плохая...",
  "Милое местечко...",
  "Бау бау)))",
  "Кто не спрятался, я не виновата",
  "Тили тили тесто, жених и невеста, мря!",
];

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

  nextWanderSayTime = Date.now() + 5000;
  nextCombatSayTime = 0;
  lastAltarSayTime = 0;
  lastGreetLorinTime = 0;
  lastGreetNo4dTime = 0;
  lastDuelCommentTime = 0;
  intervenedDuels = new Set<string>();

  AGGRO_RADIUS = 90;
  HITBOX_RADIUS = 35;
  SPEED = 185;

  private clampPosition() {
    this.x = Math.max(40, Math.min(1160, this.x));
    this.y = Math.max(40, Math.min(1160, this.y));
  }

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
      this.hp = Math.min(this.hp, this.maxHp);
      return yells;
    }

    // Динамическое определение сторон
    const isKateInAllies = duel.allies.some((a) => a.id === this.id);
    const myTeam = isKateInAllies ? duel.allies : duel.hunters;
    const enemyTeam = isKateInAllies ? duel.hunters : duel.allies;

    const livingAllies = myTeam.filter((a) => a.id !== this.id && a.hp > 0).length;
    const livingEnemies = enemyTeam.filter((e) => e.hp > 0).length;

    const oldMaxHp = this.maxHp;
    this.attack = this.baseAtk + livingAllies * 10 + livingEnemies * 3;
    this.armor = this.baseArmor + livingAllies * 30 + livingEnemies * 10;
    this.maxHp = this.baseMaxHp + livingAllies * 100 + livingEnemies * 20;

    if (this.maxHp > oldMaxHp) {
      this.hp += this.maxHp - oldMaxHp;
    }
    this.hp = Math.min(this.hp, this.maxHp);

    // Прямая синхронизация объекта Кейт в дуэли
    const bossParticipant = myTeam.find((p) => p.id === this.id);
    if (bossParticipant) {
      bossParticipant.maxHp = this.maxHp;
      bossParticipant.hp = this.hp;
      bossParticipant.armor = this.armor;
    }

    return yells;
  }

  onEnemyKilled(): string {
    this.hp = Math.min(this.maxHp, this.hp + 30);
    return `<span style="color:#f472b6; font-weight:bold;">Кейт: «Ням!»</span> — восстановила себе <b style="color:#4ade80">30 HP</b>!`;
  }

  onPlayerDuelFinished(winnerName: string, onBossSay: (text: string) => void) {
    const isNo4d = (winnerName || "").trim().toLowerCase() === "no4d";
    if (isNo4d) {
      onBossSay("О! Мой любимый Нофорд!");
    } else {
      onBossSay("А Нофорд бы победил!");
    }
  }

  update(
    dt: number,
    sessions: Map<WebSocket, Session>,
    activeDuels: Map<string, DuelState>,
    onTriggerCombat: (targetSession: Session, ws: WebSocket) => void,
    onDuelUpdate: (duel: DuelState, log: string) => void,
    onDuelEnd: (duel: DuelState, winnerName: string) => void,
    onBossSay: (text: string) => void,
    onBossIntervene: (duel: DuelState, action: "join" | "kiss") => void
  ) {
    const now = Date.now();

    // 1. Возрождение
    if (this.state === "dead") {
      if (now - this.deathTime >= 5000) {
        this.state = "wander";
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.clampPosition();
        this.hp = this.baseMaxHp;
        this.maxHp = this.baseMaxHp;
        this.armor = this.baseArmor;
        this.attack = this.baseAtk;
        this.inDuel = false;
        this.duelId = null;
        this.nextWanderSayTime = now + 4000;
      }
      return;
    }

    // 2. В бою
    if (this.state === "combat") {
      if (!this.duelId || !activeDuels.has(this.duelId)) {
        this.state = "wander";
        this.inDuel = false;
        this.duelId = null;
        this.recalcPassives(null);
        return;
      }

      const duel = activeDuels.get(this.duelId)!;

      // Синхронизируем здоровье Кейт с дуэлью (если её ударил игрок или Дар)
      const isKateInAllies = duel.allies.some((a) => a.id === this.id);
      const myTeam = isKateInAllies ? duel.allies : duel.hunters;
      const enemyTeam = isKateInAllies ? duel.hunters : duel.allies;
      const bossPart = myTeam.find((p) => p.id === this.id);
      if (bossPart) {
        this.hp = bossPart.hp;
      }

      if (now >= this.nextCombatSayTime) {
        this.nextCombatSayTime = now + (4500 + Math.random() * 4500);
        onBossSay("ПОМОГИТЕ!");
      }

      if (now >= this.nextAttackTime) {
        this.nextAttackTime = now + (1500 + Math.random() * 3500);

        const livingEnemies = enemyTeam.filter((e) => e.hp > 0);
        if (livingEnemies.length > 0) {
          const target = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
          let targetSession: Session | null = null;
          let targetWs: WebSocket | null = null;

          for (const [ws, s] of sessions.entries()) {
            if (s.id === target.id) {
              targetSession = s;
              targetWs = ws;
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
              targetSession.inDuel = false;
              targetSession.stats.hp = targetSession.stats.maxHp;
              targetSession.rejoinBlockedUntil = Date.now() + 30000;

              if (targetWs) {
                try {
                  targetWs.send(JSON.stringify({ type: "combat_death", lockDuration: 30, winnerName: "Кейт" }));
                } catch (_) {}
              }

              if (isKateInAllies) {
                duel.hunters = duel.hunters.filter((h) => h.id !== target.id);
              } else {
                duel.allies = duel.allies.filter((a) => a.id !== target.id);
              }
              this.recalcPassives(duel);
            }

            onDuelUpdate(duel, logText);

            const aliveLeft = (isKateInAllies ? duel.hunters : duel.allies).filter((e) => e.hp > 0).length;
            if (aliveLeft === 0) {
              onDuelEnd(duel, "Кейт и её союзники");
            }
          }
        }
      }
      return;
    }

    // 3. Блуждание
    if (this.state === "wander") {
      const distToAltar = Math.hypot(this.x - 565, this.y - 600);
      if (distToAltar <= 70 && now - this.lastAltarSayTime > 25000) {
        this.lastAltarSayTime = now;
        onBossSay("Адское пламя?");
      }

      let nearbyLorin = false;
      let nearbyNo4d = false;

      for (const s of sessions.values()) {
        const d = Math.hypot(s.x - this.x, s.y - this.y);
        if (d <= 160) {
          const lower = (s.username || "").trim().toLowerCase();
          if (lower === "lorin death") nearbyLorin = true;
          if (lower === "no4d") nearbyNo4d = true;
        }
      }

      if (nearbyLorin && now - this.lastGreetLorinTime > 40000) {
        this.lastGreetLorinTime = now;
        onBossSay("Приветствую Госпожа!");
      } else if (nearbyNo4d && now - this.lastGreetNo4dTime > 40000) {
        this.lastGreetNo4dTime = now;
        onBossSay("Привет, дорогой!");
      }

      for (const duel of activeDuels.values()) {
        if (!duel.isBossFight && duel.p1 && duel.p2) {
          let p1Dist = 999;
          let p2Dist = 999;

          for (const s of sessions.values()) {
            if (s.id === duel.p1.id) p1Dist = Math.hypot(s.x - this.x, s.y - this.y);
            if (s.id === duel.p2.id) p2Dist = Math.hypot(s.x - this.x, s.y - this.y);
          }

          if (p1Dist <= 80 || p2Dist <= 80) {
            if (!this.intervenedDuels.has(duel.id)) {
              this.intervenedDuels.add(duel.id);
              const roll = Math.random();

              if (roll < 0.20) {
                onBossSay("Пора кромсать!!!");
                onBossIntervene(duel, "join");
                return;
              } else if (roll < 0.40) {
                onBossSay("Чмок!");
                onBossIntervene(duel, "kiss");
                return;
              }
            }

            if (now - this.lastDuelCommentTime > 15000) {
              this.lastDuelCommentTime = now;
              onBossSay("Дурачки");
            }
          }
        }
      }

      if (now >= this.nextWanderSayTime) {
        this.nextWanderSayTime = now + (10000 + Math.random() * 8000);
        const quote = WANDER_QUOTES[Math.floor(Math.random() * WANDER_QUOTES.length)];
        onBossSay(quote);
      }

      if (now >= this.nextWanderTime) {
        this.nextWanderTime = now + (3500 + Math.random() * 4000);
        this.wanderTargetX = Math.max(40, Math.min(1160, this.x + (Math.random() * 260 - 130)));
        this.wanderTargetY = Math.max(40, Math.min(1160, this.y + (Math.random() * 260 - 130)));
      }

      const wdx = this.wanderTargetX - this.x;
      const wdy = this.wanderTargetY - this.y;
      const wDist = Math.hypot(wdx, wdy);

      if (wDist > 6) {
        this.dirX = wdx / wDist;
        this.dirY = wdy / wDist;
        this.x += this.dirX * (this.SPEED * 0.35) * dt;
        this.y += this.dirY * (this.SPEED * 0.35) * dt;
        this.clampPosition();
      }

      for (const [ws, s] of sessions.entries()) {
        const lower = (s.username || "").trim().toLowerCase();
        const isImmune = lower === "lorin death" || lower === "no4d";

        if (!isImmune && !s.inDuel && s.stats.classId && (!s.escapedUntil || now >= s.escapedUntil) && (!s.rejoinBlockedUntil || now >= s.rejoinBlockedUntil)) {
          const dist = Math.hypot(s.x - this.x, s.y - this.y);
          if (dist <= this.AGGRO_RADIUS) {
            this.state = "chase";
            this.targetPlayerId = s.id;
            this.nextCombatSayTime = now + 2500;
            onBossSay("ЖЕРТВА!");
            break;
          }
        }
      }
      return;
    }

    // 4. Погоня
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

      const isTargetInvalid =
        !targetSession ||
        targetSession.inDuel ||
        !targetSession.stats.classId ||
        (targetSession.escapedUntil && now < targetSession.escapedUntil) ||
        (targetSession.rejoinBlockedUntil && now < targetSession.rejoinBlockedUntil);

      const cdx = targetSession ? targetSession.x - this.x : 0;
      const cdy = targetSession ? targetSession.y - this.y : 0;
      const dist = Math.hypot(cdx, cdy);

      if (isTargetInvalid || dist > this.AGGRO_RADIUS + 90) {
        this.state = "wander";
        this.targetPlayerId = null;
        this.nextWanderSayTime = now + 4000;
        onBossSay("Убежал(");
        return;
      }

      this.dirX = cdx / dist;
      this.dirY = cdy / dist;
      this.x += this.dirX * this.SPEED * dt;
      this.y += this.dirY * this.SPEED * dt;
      this.clampPosition();

      if (dist <= this.HITBOX_RADIUS && targetWs && targetSession) {
        this.state = "combat";
        this.targetPlayerId = null;
        this.nextAttackTime = now + (1500 + Math.random() * 2500);
        this.nextCombatSayTime = now + 2500;
        onTriggerCombat(targetSession, targetWs);
      }
    }
  }
}