import type { Session, DuelState, BossState, DuelParticipant, FlowerState, FlowerType } from "./types";
import { calcArmorReduction } from "./combat";

const SIMPLE_QUOTES = [
  "Любофь спасёт мир!",
  "А нас рать!",
  "Случайности не случайны",
  "Миу-миу крошка",
  "Ходит тут дранная кошка",
  "Ходят тут всякие",
];

const DISMORALE_QUOTES = [
  "Попу надо мыть!",
  "Жопу мыть!",
  "Иди купайса!",
  "Уши мыл?",
];

export class DarBoss {
  id = "boss_dar";
  name = "Дар";
  x = 300;
  y = 300;
  dirX = 0;
  dirY = 1;

  state: "wander" | "stalk" | "chase" | "flee" | "rush_combat" | "water_flower" | "combat" | "dead" = "wander";
  targetPlayerId: string | null = null;
  targetFlowerId: string | null = null;
  rushTargetDuelId: string | null = null;
  rushSide: "npc" | "random" = "random";

  baseHp = 400;
  baseMaxHp = 400;
  baseArmor = 20;
  minAtk = 5;
  maxAtk = 25;

  hp = 400;
  maxHp = 400;
  armor = 20;

  inDuel = false;
  duelId: string | null = null;
  deathTime = 0;

  decisionTick = 0;
  oneSecTimer = 0;
  nextAttackTime = 0;
  attackInterval = 4.0;
  loveBuffUntil = 0;

  cdLove = 0;
  cdHouse = 0;
  cdHorror = 0;

  lastPlantTime = 0; // Кулдаун посадки 40 секунд
  fleeUntil = 0;
  wanderTargetX = 300;
  wanderTargetY = 300;

  SPEED_NORMAL = 160;
  SPEED_FAST = 280;

  constructor() {
    this.respawnRandom();
  }

  private clampPosition() {
    this.x = Math.max(40, Math.min(1160, this.x));
    this.y = Math.max(40, Math.min(1160, this.y));
  }

  respawnRandom() {
    this.x = Math.round(150 + Math.random() * 900);
    this.y = Math.round(150 + Math.random() * 900);
    this.clampPosition();
    this.wanderTargetX = this.x;
    this.wanderTargetY = this.y;
    this.hp = this.baseMaxHp;
    this.maxHp = this.baseMaxHp;
    this.armor = this.baseArmor;
    this.state = "wander";
    this.inDuel = false;
    this.duelId = null;
    this.targetPlayerId = null;
    this.targetFlowerId = null;
  }

  onPlayerEscaped(onSay: (text: string) => void) {
    onSay("ТРУС!");
  }

  getState(): BossState {
    return {
      id: this.id,
      name: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      dirX: this.dirX,
      dirY: this.dirY,
      state: this.state === "combat" ? "combat" : "wander",
      hp: this.hp,
      maxHp: this.maxHp,
      armor: this.armor,
      attack: Math.round((this.minAtk + this.maxAtk) / 2),
      inDuel: this.inDuel,
      duelId: this.duelId || undefined,
    };
  }

  update(
    dt: number,
    sessions: Map<WebSocket, Session>,
    activeDuels: Map<string, DuelState>,
    flowers: Map<string, FlowerState>,
    onSay: (text: string) => void,
    onSurpriseHit: (targetSession: Session, dmg: number) => void,
    onJoinDuel: (duel: DuelState, side: "hunters" | "allies", yell: string) => void,
    onDuelUpdate: (duel: DuelState, log: string) => void,
    onDuelEnd: (duel: DuelState, winner: string) => void,
    onPlantFlower: (x: number, y: number) => void,
    onWaterFlower: (flower: FlowerState) => void
  ) {
    const now = Date.now();

    // 1. Возрождение после смерти
    if (this.state === "dead") {
      if (now - this.deathTime >= 8000) {
        this.respawnRandom();
        onSay("Любофь спасёт мир!");
      }
      return;
    }

    // 2. Внутри боя
    if (this.state === "combat") {
      this.updateCombat(dt, sessions, activeDuels, onSay, onDuelUpdate, onDuelEnd);
      return;
    }

    // 3. Приоритет: Дар бежит поливать созревший цветок ("Манюня!!!")
    if (this.state === "water_flower") {
      const targetFl = this.targetFlowerId ? flowers.get(this.targetFlowerId) : null;
      if (!targetFl || targetFl.stage !== "mature") {
        this.state = "wander";
        this.targetFlowerId = null;
        return;
      }

      const fdx = targetFl.x - this.x;
      const fdy = targetFl.y - this.y;
      const fDist = Math.hypot(fdx, fdy);

      if (fDist > 35) {
        this.dirX = fdx / fDist;
        this.dirY = fdy / fDist;
        this.x += this.dirX * this.SPEED_FAST * dt;
        this.y += this.dirY * this.SPEED_FAST * dt;
        this.clampPosition();
      } else {
        onSay("Поливашки");
        onWaterFlower(targetFl);
        this.state = "wander";
        this.targetFlowerId = null;
      }
      return;
    }

    // Сканирование созревших цветков в радиусе 30 метров (600px)
    if (this.state !== "flee" && this.state !== "rush_combat") {
      let nearestMature: FlowerState | null = null;
      let minMatureDist = Infinity;

      for (const fl of flowers.values()) {
        if (fl.stage === "mature") {
          const d = Math.hypot(fl.x - this.x, fl.y - this.y);
          if (d <= 600 && d < minMatureDist) {
            minMatureDist = d;
            nearestMature = fl;
          }
        }
      }

      if (nearestMature) {
        this.state = "water_flower";
        this.targetFlowerId = nearestMature.id;
        onSay("Манюня!!!");
        return;
      }
    }

    // 4. Рывок к чужой драке ("СПАРТААА" / "Наших бьют!")
    if (this.state === "rush_combat") {
      const duel = this.rushTargetDuelId ? activeDuels.get(this.rushTargetDuelId) : null;
      if (!duel) {
        this.state = "wander";
        return;
      }

      const pTarget = duel.hunters[0] || duel.allies[0];
      const tSession = [...sessions.values()].find((s) => s.id === pTarget?.id);
      const targetX = tSession?.x || 600;
      const targetY = tSession?.y || 600;

      const rdx = targetX - this.x;
      const rdy = targetY - this.y;
      const dist = Math.hypot(rdx, rdy);

      if (dist > 35) {
        this.dirX = rdx / dist;
        this.dirY = rdy / dist;
        this.x += this.dirX * this.SPEED_FAST * dt;
        this.y += this.dirY * this.SPEED_FAST * dt;
        this.clampPosition();
      } else {
        this.inDuel = true;
        this.duelId = duel.id;
        this.state = "combat";
        this.nextAttackTime = now + 2000;

        const side = this.rushSide === "npc"
          ? (duel.allies.some((a) => a.isBoss || a.isFlower) ? "allies" : "hunters")
          : (Math.random() < 0.5 ? "hunters" : "allies");

        const yell = this.rushSide === "npc"
          ? `<span style="color:#34d399; font-weight:bold;">Дар: «Наших бьют!»</span> — ворвалась защищать союзника!`
          : `<span style="color:#34d399; font-weight:bold;">Дар: «СПАРТААА!»</span> — на полной скорости влетела в драку!`;

        onJoinDuel(duel, side, yell);
      }
      return;
    }

    // 5. Бегство
    if (this.state === "flee") {
      if (now >= this.fleeUntil) {
        this.state = "wander";
      } else {
        this.x += this.dirX * this.SPEED_FAST * dt;
        this.y += this.dirY * this.SPEED_FAST * dt;
        this.clampPosition();
      }
      return;
    }

    // 6. Мирные циклы (каждую 1 секунду)
    this.oneSecTimer += dt;
    if (this.oneSecTimer >= 1.0) {
      this.oneSecTimer = 0;
      this.handleOneSecondEvents(now, sessions, activeDuels, flowers, onSay, onSurpriseHit, onPlantFlower);
    }

    // 7. Выбор поведения каждые 4 тика (секунды)
    this.decisionTick += dt;
    if (this.decisionTick >= 4.0) {
      this.decisionTick = 0;
      this.makeBehaviorChoice(sessions, onSay);
    }

    // 8. Физическое перемещение
    this.movePeaceful(dt, sessions);
  }

  handleOneSecondEvents(
    now: number,
    sessions: Map<WebSocket, Session>,
    activeDuels: Map<string, DuelState>,
    flowers: Map<string, FlowerState>,
    onSay: (text: string) => void,
    onSurpriseHit: (targetSession: Session, dmg: number) => void,
    onPlantFlower: (x: number, y: number) => void
  ) {
    // 6.1. Посадка цветка Дар (каждые 40 сек, шанс 5%, макс 22 цветка на карте)
    if (now - this.lastPlantTime >= 40000 && flowers.size < 22) {
      if (Math.random() < 0.05) {
        this.lastPlantTime = now;
        onSay("И так сойдёт");
        onPlantFlower(Math.round(this.x), Math.round(this.y));
      }
    }

    // 6.2. Вмешательство в чужие драки в радиусе 50 метров (1000 px)
    if (activeDuels.size > 0 && Math.random() < 0.10) {
      for (const [dId, duel] of activeDuels.entries()) {
        const p1 = duel.hunters[0];
        const s1 = [...sessions.values()].find((s) => s.id === p1?.id);
        if (s1 && Math.hypot(s1.x - this.x, s1.y - this.y) <= 1000) {
          const hasNPC = duel.hunters.some((h) => h.isBoss || h.isFlower) || duel.allies.some((a) => a.isBoss || a.isFlower);
          this.state = "rush_combat";
          this.rushTargetDuelId = dId;
          this.rushSide = hasNPC ? "npc" : "random";
          onSay(hasNPC ? "Наших бьют!" : "СПАРТААА");
          return;
        }
      }
    }

    // 6.3. Дебаф "Дизмораль" на игрока в радиусе 10 метров (200 px)
    const playersIn10m: Session[] = [];
    for (const s of sessions.values()) {
      if (s.stats.classId && Math.hypot(s.x - this.x, s.y - this.y) <= 200) {
        playersIn10m.push(s);
      }
    }

    if (playersIn10m.length > 0 && Math.random() < 0.05) {
      const lucky = playersIn10m[Math.floor(Math.random() * playersIn10m.length)];
      lucky.dismoraleUntil = now + 60000;
      const quote = DISMORALE_QUOTES[Math.floor(Math.random() * DISMORALE_QUOTES.length)];
      onSay(quote);
    }

    // 6.4. Сюрприз во время преследования
    if (this.state === "chase" && this.targetPlayerId) {
      const target = [...sessions.values()].find((s) => s.id === this.targetPlayerId);
      if (target && Math.hypot(target.x - this.x, target.y - this.y) <= 80) {
        if (Math.random() < 0.05) {
          onSay("У меня для тебя сюрприз");
          const dmg = Math.max(2, Math.round((Math.random() * (this.maxAtk - this.minAtk) + this.minAtk) * 0.5));
          onSurpriseHit(target, dmg);

          this.state = "flee";
          this.fleeUntil = now + 4500;
          this.dirX = -(target.x - this.x);
          this.dirY = -(target.y - this.y);
          const len = Math.hypot(this.dirX, this.dirY) || 1;
          this.dirX /= len;
          this.dirY /= len;
          setTimeout(() => onSay("ХИ-ХИ Не догонишь!"), 500);
        }
      }
    }
  }

  makeBehaviorChoice(sessions: Map<WebSocket, Session>, onSay: (text: string) => void) {
    let nearest: Session | null = null;
    let minDist = Infinity;

    for (const s of sessions.values()) {
      if (!s.inDuel && s.stats.classId) {
        const d = Math.hypot(s.x - this.x, s.y - this.y);
        if (d < minDist) {
          minDist = d;
          nearest = s;
        }
      }
    }

    if (nearest && minDist <= 100) {
      this.state = "chase";
      this.targetPlayerId = nearest.id;
      onSay("А я с тобой!");
      return;
    }

    const roll = Math.random();
    if (roll < 0.20) {
      const quote = SIMPLE_QUOTES[Math.floor(Math.random() * SIMPLE_QUOTES.length)];
      onSay(quote);
      if (quote === "А нас рать!") {
        this.state = "flee";
        this.fleeUntil = Date.now() + 4000;
        this.dirX = -this.dirX || 1;
        this.dirY = -this.dirY || 0;
        return;
      }
    }

    if (nearest && minDist <= 350 && roll < 0.65) {
      this.state = "stalk";
      this.targetPlayerId = nearest.id;
    } else {
      this.state = "wander";
      this.targetPlayerId = null;
      this.wanderTargetX = Math.max(40, Math.min(1160, this.x + (Math.random() * 300 - 150)));
      this.wanderTargetY = Math.max(40, Math.min(1160, this.y + (Math.random() * 300 - 150)));
    }
  }

  movePeaceful(dt: number, sessions: Map<WebSocket, Session>) {
    if (this.state === "chase" && this.targetPlayerId) {
      const target = [...sessions.values()].find((s) => s.id === this.targetPlayerId);
      if (!target || target.inDuel) {
        this.state = "wander";
        return;
      }
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 30) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
        this.x += this.dirX * this.SPEED_NORMAL * dt;
        this.y += this.dirY * this.SPEED_NORMAL * dt;
        this.clampPosition();
      }
      return;
    }

    if (this.state === "stalk" && this.targetPlayerId) {
      const target = [...sessions.values()].find((s) => s.id === this.targetPlayerId);
      if (!target || target.inDuel) {
        this.state = "wander";
        return;
      }
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const idealDist = 200;

      if (Math.abs(dist - idealDist) > 25) {
        const sign = dist > idealDist ? 1 : -1;
        this.dirX = (dx / dist) * sign;
        this.dirY = (dy / dist) * sign;
        this.x += this.dirX * (this.SPEED_NORMAL * 0.8) * dt;
        this.y += this.dirY * (this.SPEED_NORMAL * 0.8) * dt;
        this.clampPosition();
      }
      return;
    }

    if (this.state === "wander") {
      const dx = this.wanderTargetX - this.x;
      const dy = this.wanderTargetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
        this.x += this.dirX * (this.SPEED_NORMAL * 0.5) * dt;
        this.y += this.dirY * (this.SPEED_NORMAL * 0.5) * dt;
        this.clampPosition();
      }
    }
  }

  updateCombat(
    dt: number,
    sessions: Map<WebSocket, Session>,
    activeDuels: Map<string, DuelState>,
    onSay: (text: string) => void,
    onDuelUpdate: (duel: DuelState, log: string) => void,
    onDuelEnd: (duel: DuelState, winner: string) => void
  ) {
    const now = Date.now();
    const duel = this.duelId ? activeDuels.get(this.duelId) : null;
    if (!duel) {
      this.state = "wander";
      this.inDuel = false;
      this.duelId = null;
      return;
    }

    if (this.cdLove > 0) this.cdLove = Math.max(0, this.cdLove - dt);
    if (this.cdHouse > 0) this.cdHouse = Math.max(0, this.cdHouse - dt);
    if (this.cdHorror > 0) this.cdHorror = Math.max(0, this.cdHorror - dt);

    const isSpeedBuffed = now < this.loveBuffUntil;
    const currentAtkSpeed = isSpeedBuffed ? (this.attackInterval / 1.5) : this.attackInterval;

    if (now >= this.nextAttackTime) {
      this.nextAttackTime = now + currentAtkSpeed * 1000;

      const mySide = duel.allies.some((a) => a.id === this.id) ? duel.allies : duel.hunters;
      const enemySide = mySide === duel.allies ? duel.hunters : duel.allies;
      const livingEnemies = enemySide.filter((e) => e.hp > 0);

      if (livingEnemies.length === 0) {
        onDuelEnd(duel, "Дар и её союзники");
        return;
      }

      // 1. "Вселенская любовь"
      if (this.cdLove <= 0 && Math.random() < 0.35) {
        this.cdLove = 20;
        this.loveBuffUntil = now + 10000;
        onSay("Любофь спасёт мир!");
        const log = `<span style="color:#34d399; font-weight:bold;">Дар применила «Вселенскую любовь»!</span> Скорость атак команды увеличена в 1.5 раза на 10 сек!`;
        onDuelUpdate(duel, log);
        return;
      }

      // 2. "Я в домике"
      if (this.cdHouse <= 0 && Math.random() < 0.35) {
        this.cdHouse = 24;
        onSay("Я в домике!");
        const livingAllies = mySide.filter((a) => a.hp > 0);
        const shieldPct = (10 + Math.random() * 90) / 100;
        const totalShield = Math.round(this.hp * shieldPct);
        const perAlly = Math.max(10, Math.round(totalShield / livingAllies.length));

        livingAllies.forEach((a) => {
          a.shield = (a.shield || 0) + perAlly;
        });

        const log = `<span style="color:#38bdf8; font-weight:bold;">Дар: «Я в домике!»</span> Общий щит <b style="color:#38bdf8">+${totalShield}</b> распределён поровну (+${perAlly} каждому)!`;
        onDuelUpdate(duel, log);
        return;
      }

      // 3. "Я ужас летящий на крыльях ночи"
      const isHorror = this.cdHorror <= 0 && Math.random() < 0.4;
      const hitsCount = isHorror ? 2 : 1;
      if (isHorror) {
        this.cdHorror = 15;
        onSay("Я ужас летящий на крыльях ночи!");
      }

      const target = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
      const targetSession = [...sessions.values()].find((s) => s.id === target.id);

      let totalDmgDone = 0;
      for (let i = 0; i < hitsCount; i++) {
        const raw = Math.floor(Math.random() * (this.maxAtk - this.minAtk + 1)) + this.minAtk;
        const red = calcArmorReduction(target.armor);
        const dmg = Math.max(1, Math.round(raw * (1 - red)));
        totalDmgDone += dmg;
      }

      const targetShield = target.shield || 0;
      let hpDmg = totalDmgDone;
      let shieldAbsorbed = 0;

      if (targetShield > 0) {
        if (targetShield >= hpDmg) {
          shieldAbsorbed = hpDmg;
          target.shield = targetShield - hpDmg;
          hpDmg = 0;
        } else {
          shieldAbsorbed = targetShield;
          hpDmg -= targetShield;
          target.shield = 0;
        }
      }

      target.hp = Math.max(0, target.hp - hpDmg);
      if (targetSession) targetSession.stats.hp = target.hp;

      let log = isHorror
        ? `<span style="color:#34d399">Дар</span> обрушила <i>двойной удар крыльями</i> по <b>${target.username}</b> на <span style="color:#ef4444">${totalDmgDone}</span> урона!`
        : `<span style="color:#34d399">Дар</span> атаковала <b>${target.username}</b> на <span style="color:#ef4444">${totalDmgDone}</span> урона!`;

      if (shieldAbsorbed > 0) {
        log += ` <span style="color:#38bdf8; font-weight:bold;">[🛡️ Щит поглотил: ${shieldAbsorbed}]</span>`;
      }

      if (target.hp <= 0) {
        log += `<br><b>${target.username}</b> повержен!`;
        if (targetSession) {
          targetSession.inDuel = false;
          targetSession.stats.hp = targetSession.stats.maxHp;
          targetSession.rejoinBlockedUntil = now + 30000;
        }
      }

      onDuelUpdate(duel, log);

      const aliveLeft = enemySide.filter((e) => e.hp > 0).length;
      if (aliveLeft === 0) {
        onDuelEnd(duel, "Дар и её союзники");
      }
    }
  }
}