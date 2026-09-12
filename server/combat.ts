import { CLASSES_CONFIG } from "./config";
import type { Session, DuelState } from "./types";

export function calcArmorReduction(armor: number): number {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.9, pct / 100);
}

export function processCombatAction(
  action: "attack" | "ability",
  chargeMultRaw: number,
  session: Session,
  defSession: Session,
  duel: DuelState
): { finalDmg: number; logText: string; isDead: boolean } {
  const isP1 = duel.p1.id === session.id;
  const attacker = isP1 ? duel.p1 : duel.p2;
  const defender = isP1 ? duel.p2 : duel.p1;
  const attackerClass = CLASSES_CONFIG[attacker.classId];

  const baseDmg = Math.floor(Math.random() * (attackerClass.maxAtk - attackerClass.minAtk + 1)) + attackerClass.minAtk;
  let finalDmg = 0;
  let logText = "";

  const chargeMult = Math.min(3.0, Math.max(0.2, Number(chargeMultRaw || 1)));

  if (action === "attack") {
    const rawDmg = baseDmg * chargeMult;
    const reduction = calcArmorReduction(defSession.stats.armor);
    finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
    logText = `<b>${attacker.username}</b> совершил выпад [x${chargeMult}] на <span style="color:#ef4444">${finalDmg}</span> урона!`;
  } else if (action === "ability") {
    if (attacker.classId === "warrior") {
      const rawDmg = baseDmg * chargeMult * 1.5;
      const reduction = calcArmorReduction(defSession.stats.armor);
      finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      logText = `⚔️ <b>${attacker.username}</b> применил <i>Удар в спину</i> на <span style="color:#ef4444">${finalDmg}</span> урона!`;
    } else if (attacker.classId === "spearman") {
      finalDmg = Math.max(1, Math.round(baseDmg * chargeMult * 1.2));
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

  return {
    finalDmg,
    logText,
    isDead: defender.hp <= 0,
  };
}