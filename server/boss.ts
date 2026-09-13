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

  // Таймеры диалогов и событий
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

    const oldMaxHp = this.maxHp;
    this.attack = this.baseAtk + livingAllies * 10 + livingEnemies * 3;
    this.armor = this.baseArmor + livingAllies * 30 + livingEnemies * 10;
    this.maxHp = this.baseMaxHp + livingAllies * 100 + livingEnemies * 20;

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

  // Реакция на финал дуэли игроков
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
        return;
      }

      if (now >= this.nextCombatSayTime) {
        this.nextCombatSayTime = now + (4500 + Math.random() * 4500);
        onBossSay("ПОМОГИТЕ!");
      }

      const duel = activeDuels.get(this.duelId)!;

      if (now >= this.nextAttackTime) {
        this.nextAttackTime = now + (1500 + Math.random() * 3500);

        const livingHunters = duel.hunters.filter((h) => h.hp > 0);
        if (livingHunters.length > 0) {
          const target = livingHunters[Math.floor(Math.random() * livingHunters.length)];
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

            // Обработка гибели игрока от удара Кейт
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

              duel.hunters = duel.hunters.filter((h) => h.id !== target.id);
            }

            onDuelUpdate(duel, logText);

            if (duel.hunters.length === 0) {
              onDuelEnd(duel, "Кейт и её союзники");
            }
          }
        }
      }
      return;
    }

    // 3. Блуждание
    if (this.state === "wander") {
      // 3.1. Проверка Алтаря (x: 565, y: 600, радиус ~70px)
      const distToAltar = Math.hypot(this.x - 565, this.y - 600);
      if (distToAltar <= 70 && now - this.lastAltarSayTime > 25000) {
        this.lastAltarSayTime = now;
        onBossSay("Адское пламя?");
      }

      // 3.2. Проверка персонажей рядом (4 метра = 80 px)
      let nearbyLorin = false;
      let nearbyNo4d = false;

      for (const s of sessions.values()) {
        const d = Math.hypot(s.x - this.x, s.y - this.y);
        if (d <= 80) {
          const lower = (s.username || "").trim().toLowerCase();
          if (lower === "lorin death") nearbyLorin = true;
          if (lower === "no4d") nearbyNo4d = true;
        }
      }

      // Приоритет приветствия Lorin Death
      if (nearbyLorin && now - this.lastGreetLorinTime > 40000) {
        this.lastGreetLorinTime = now;
        onBossSay("Приветствую Госпожа!");
      } else if (nearbyNo4d && now - this.lastGreetNo4dTime > 40000) {
        this.lastGreetNo4dTime = now;
        onBossSay("Привет, дорогой!");
      }

      // 3.3. Проверка дерущихся дуэлянтов рядом (в пределах 4 метров / 80 px)
      for (const duel of activeDuels.values()) {
        if (!duel.isBossFight && duel.p1 && duel.p2) {
          let p1Dist = 999;
          let p2Dist = 999;

          for (const s of sessions.values()) {
            if (s.id === duel.p1.id) p1Dist = Math.hypot(s.x - this.x, s.y - this.y);
            if (s.id === duel.p2.id) p2Dist = Math.hypot(s.x - this.x, s.y - this.y);
          }

          if (p1Dist <= 80 || p2Dist <= 80) {
            // Шанс вмешательства (только 1 раз за дуэль)
            if (!this.intervenedDuels.has(duel.id)) {
              this.intervenedDuels.add(duel.id);
              const roll = Math.random();

              if (roll < 0.20) {
                // 20% шанс: врыв в битву
                onBossSay("Пора кромсать!!!");
                onBossIntervene(duel, "join");
                return;
              } else if (roll < 0.40) {
                // 20% шанс: поцелуй и исцеление на 30%
                onBossSay("Чмок!");
                onBossIntervene(duel, "kiss");
                return;
              }
            }

            // Фраза «Дурачки», если Кейт подошла к драке
            if (now - this.lastDuelCommentTime > 15000) {
              this.lastDuelCommentTime = now;
              onBossSay("Дурачки");
            }
          }
        }
      }

      // 3.4. Обычные случайные фразы блуждания
      if (now >= this.nextWanderSayTime) {
        this.nextWanderSayTime = now + (10000 + Math.random() * 8000);
        const quote = WANDER_QUOTES[Math.floor(Math.random() * WANDER_QUOTES.length)];
        onBossSay(quote);
      }

      // 3.5. Передвижение
      if (now >= this.nextWanderTime) {
        this.nextWanderTime = now + (3500 + Math.random() * 4000);
        this.wanderTargetX = Math.max(100, Math.min(1100, this.x + (Math.random() * 260 - 130)));
        this.wanderTargetY = Math.max(100, Math.min(1100, this.y + (Math.random() * 260 - 130)));
      }

      const wdx = this.wanderTargetX - this.x;
      const wdy = this.wanderTargetY - this.y;
      const wDist = Math.hypot(wdx, wdy);

      if (wDist > 6) {
        this.dirX = wdx / wDist;
        this.dirY = wdy / wDist;
        this.x += this.dirX * (this.SPEED * 0.35) * dt;
        this.y += this.dirY * (this.SPEED * 0.35) * dt;
      }

      // Проверка агра на живых игроков с телом
      for (const [ws, s] of sessions.entries()) {
        if (!s.inDuel && s.stats.classId && (!s.escapedUntil || now >= s.escapedUntil) && (!s.rejoinBlockedUntil || now >= s.rejoinBlockedUntil)) {
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

      if (dist <= this.HITBOX_RADIUS && targetWs) {
        this.state = "combat";
        this.targetPlayerId = null;
        this.nextAttackTime = now + (1500 + Math.random() * 2500);
        this.nextCombatSayTime = now + 2500;
        onTriggerCombat(targetSession, targetWs);
      }
    }
  }
}