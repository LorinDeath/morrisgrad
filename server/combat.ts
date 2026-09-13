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

  const classConfig = getClassConfig(session.stats.classId);
  const { minAtk, maxAtk } = classConfig.stats;
  const baseDmg = Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk;
  const chargeMult = Math.min(3.0, Math.max(0.2, Number(chargeMultRaw || 1)));

  const isHunter = duel.hunters.some((h) => h.id === session.id);
  const targetList = isHunter ? duel.allies : duel.hunters;

  let target = (targetId ? targetList.find((t) => t.id === targetId && t.hp > 0) : null) || targetList.find((t) => t.hp > 0);

  if (!target) {
    return { finalDmg: 0, logText: "Нет доступных целей", isDead: false };
  }

  const targetName = target.isBoss ? "Кейт" : target.username;
  let finalDmg = 0;
  let logText = "";

  if (action === "attack") {
    const rawDmg = baseDmg * chargeMult;
    const reduction = calcArmorReduction(target.armor);
    finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
    logText = `<b>${session.username}</b> нанёс <span style="color:#ef4444">${finalDmg}</span> урона по <b>${targetName}</b> [x${chargeMult}]!`;
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

    finalDmg = result.damage;
    logText = result.logText;

    if (result.heal > 0) {
      session.stats.hp = Math.min(session.stats.maxHp, session.stats.hp + result.heal);
    }
  }

  target.hp = Math.max(0, target.hp - finalDmg);

  if (target.isBoss && boss) {
    boss.hp = target.hp;
  }

  return {
    finalDmg,
    logText,
    isDead: target.hp <= 0,
    target,
  };
}