import type { Session, DuelState, DuelParticipant } from "./types";
import type { KeytBoss } from "./boss";
import { getClassConfig } from "./classes";
import { getSkill } from "./skills";

export function calcArmorReduction(armor: number): number {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.9, pct / 100);
}

export function processCombatAction(
  action: "attack" | "ability" | "escape",
  chargeMultRaw: number,
  session: Session,
  duel: DuelState,
  boss?: KeytBoss,
  targetId?: string
): { finalDmg: number; logText: string; isDead: boolean; isEscaped?: boolean; target?: DuelParticipant } {
  if (action === "escape") {
    session.inDuel = false;
    session.escapedUntil = Date.now() + 5000;

    return {
      finalDmg: 0,
      logText: `<span style="color:#facc15"><b>${session.username}</b> трусливо сбежал из битвы!</span>`,
      isDead: false,
      isEscaped: true,
    };
  }

  const isFlowerAttacker = session.stats?.classId?.startsWith("flower_");
  const now = Date.now();

  const isHunter = duel.hunters.some((h) => h.id === session.id);
  const targetList = isHunter ? duel.allies : duel.hunters;
  let target = (targetId ? targetList.find((t) => t.id === targetId && t.hp > 0) : null) || targetList.find((t) => t.hp > 0);

  if (!target) {
    return { finalDmg: 0, logText: "Нет доступных целей", isDead: false };
  }

  const targetName = target.isBoss ? target.username : target.username;
  let rawIncomingDmg = 0;
  let logText = "";
  let extraLog = "";

  // Если атакует цветок (у него свой ИИ и ротация навыков в дуэли)
  if (isFlowerAttacker) {
    const fType = session.stats.classId.replace("flower_", "");
    let baseAtk = session.stats.attack || 20;

    // Бафф от пространственного разреза
    if (session.atkBuffUntil && now < session.atkBuffUntil) {
      baseAtk = Math.round(baseAtk * (1 + (session.atkBuffPct || 0.6)));
    }

    // Адский цветок проверяем на поглощение (если есть другие живые союзники-цветки в дуэли)
    const myTeam = isHunter ? duel.hunters : duel.allies;
    if (fType === "hell" && Math.random() < 0.35) {
      const victim = myTeam.find((p) => p.id !== session.id && p.isFlower && p.hp > 0);
      if (victim) {
        const vHp = victim.hp;
        victim.hp = 0;
        const bonusHp = Math.round(vHp * 0.5);
        session.maxHp = (session.maxHp || 100) + bonusHp;
        session.hp = Math.min(session.maxHp, (session.hp || 0) + vHp);
        baseAtk = Math.round(baseAtk * 1.3);
        extraLog += `<br>💀 <b>${session.username}</b> поглотил союзника! <b style="color:#4ade80">+${vHp} HP</b>, атака усилена!`;
      }
    }

    // Проверка типа атаки / навыков
    if (fType === "hell" && Math.random() < 0.3) {
      // Навык: Пространственный разрез (игнор брони, срез урона цели на 30%)
      const red = 0; // Игнорирует броню
      rawIncomingDmg = Math.max(1, Math.round(baseAtk * 1.5));
      target.dmgDebuffUntil = now + 10000;
      target.dmgDebuffPct = 0.30;
      logText = `🌌 <span style="color:#c084fc; font-weight:bold;">${session.username}</span> применил <i>Пространственный разрез</i> сквозь броню <b>${targetName}</b> на <span style="color:#ef4444">${rawIncomingDmg}</span> урона!`;
    } else {
      // Обычная атака цветка
      const ignoreArmor = fType === "hell";
      const reduction = ignoreArmor ? 0 : calcArmorReduction(target.armor);
      rawIncomingDmg = Math.max(1, Math.round(baseAtk * (1 - reduction)));

      if (fType === "fire") {
        // Огненный: вешает горение и срез брони
        target.burnTicks = 10;
        target.burnDmg = Math.floor(Math.random() * 15) + 5;
        target.armor = Math.max(0, Math.round(target.armor * 0.9));
        logText = `🔥 <b>${session.username}</b> опалил <b>${targetName}</b> на <span style="color:#f97316">${rawIncomingDmg}</span> урона! Огонь и плавление брони!`;
      } else if (fType === "frost") {
        // Морозный: накладывает заморозку
        target.frostUntil = now + 8000;
        logText = `❄️ <b>${session.username}</b> заморозил <b>${targetName}</b> на <span style="color:#38bdf8">${rawIncomingDmg}</span> урона! Замах сброшен!`;
      } else {
        logText = `🌸 <b>${session.username}</b> атаковал <b>${targetName}</b> на <span style="color:#ef4444">${rawIncomingDmg}</span> урона!`;
      }
    }

    logText += extraLog;
  } else {
    // Обычный игрок
    const classConfig = getClassConfig(session.stats.classId);
    const { minAtk, maxAtk } = classConfig.stats;
    let baseDmg = Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk;

    const isDismoraled = Boolean(session.dismoraleUntil && Date.now() < session.dismoraleUntil);
    if (isDismoraled) {
      baseDmg = Math.max(1, Math.round(baseDmg * 0.65));
    }

    // Дебафф от Пространственного разреза
    if (session.dmgDebuffUntil && now < session.dmgDebuffUntil) {
      baseDmg = Math.max(1, Math.round(baseDmg * (1 - (session.dmgDebuffPct || 0.3))));
    }

    const chargeMult = Math.min(3.0, Math.max(0.2, Number(chargeMultRaw || 1)));

    if (action === "attack") {
      const rawDmg = baseDmg * chargeMult;
      const reduction = calcArmorReduction(target.armor);
      rawIncomingDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      logText = `<b>${session.username}</b> нанёс <span style="color:#ef4444">${rawIncomingDmg}</span> урона по <b>${targetName}</b> [x${chargeMult}]!`;
    } else if (action === "ability") {
      const skill = getSkill(classConfig.abilityId);
      const result = skill.execute({
        attacker: session,
        target,
        baseDmg,
        chargeMult,
        duel,
        boss,
      });

      rawIncomingDmg = result.damage;
      logText = result.logText;

      if (result.heal > 0) {
        session.stats.hp = Math.min(session.stats.maxHp, session.stats.hp + result.heal);
      }
    }
  }

  // Поглощение урона щитом
  const targetShield = target.shield || 0;
  let hpDmg = rawIncomingDmg;
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
    logText += ` <span style="color:#38bdf8; font-weight:bold;">[🛡️ Щит поглотил: ${shieldAbsorbed}]</span>`;
  }

  target.hp = Math.max(0, target.hp - hpDmg);

  if (target.isBoss && boss && target.id === boss.id) {
    boss.hp = target.hp;
  }

  return {
    finalDmg: hpDmg,
    logText,
    isDead: target.hp <= 0,
    target,
  };
}