import { CLASSES_CONFIG } from "./config";
import type { Session, DuelState } from "./types";
import type { KeytBoss } from "./boss";

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
  boss?: KeytBoss
): { finalDmg: number; logText: string; isDead: boolean; isEscaped?: boolean } {
  // 1. Механика «Сбежать»
  if (action === "escape") {
    session.inDuel = false;
    session.escapedUntil = Date.now() + 5000; // 5 секунд неуязвимости

    return {
      finalDmg: 0,
      logText: `<span style="color:#facc15"><b>${session.username}</b> трусливо сбежал из битвы!</span>`,
      isDead: false,
      isEscaped: true,
    };
  }

  // 2. Стандартный расчёт урона игрока
  const attackerClass = CLASSES_CONFIG[session.stats.classId || "warrior"] || CLASSES_CONFIG.warrior;
  const baseDmg = Math.floor(Math.random() * (attackerClass.maxAtk - attackerClass.minAtk + 1)) + attackerClass.minAtk;
  let finalDmg = 0;
  let logText = "";
  const chargeMult = Math.min(3.0, Math.max(0.2, Number(chargeMultRaw || 1)));

  // Определение цели: если это бой с Кейт — бьём Кейт или вражескую команду
  let targetArmor = 0;
  let targetHp = 0;
  let targetName = "Противник";

  const isHunter = duel.hunters.some((h) => h.id === session.id);
  const targetList = isHunter ? duel.allies : duel.hunters;
  const target = targetList.find((t) => t.hp > 0);

  if (!target) {
    return { finalDmg: 0, logText: "Нет доступных целей", isDead: false };
  }

  targetArmor = target.armor;
  targetHp = target.hp;
  targetName = target.username;

  if (action === "attack") {
    const rawDmg = baseDmg * chargeMult;
    const reduction = calcArmorReduction(targetArmor);
    finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
    logText = `<b>${session.username}</b> совершил выпад [x${chargeMult}] на <span style="color:#ef4444">${finalDmg}</span> урона по <b>${targetName}</b>!`;
  } else if (action === "ability") {
    if (session.stats.classId === "warrior") {
      const rawDmg = baseDmg * chargeMult * 1.5;
      const reduction = calcArmorReduction(targetArmor);
      finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      logText = `⚔️ <b>${session.username}</b> применил <i>Удар в спину</i> на <span style="color:#ef4444">${finalDmg}</span> урона!`;
    } else if (session.stats.classId === "spearman") {
      finalDmg = Math.max(1, Math.round(baseDmg * chargeMult * 1.2));
      logText = `🗡️ <b>${session.username}</b> вонзил <i>Колющий удар</i> (сквозь броню!) на <span style="color:#ef4444">${finalDmg}</span> урона!`;
    } else if (session.stats.classId === "rogue") {
      const rawDmg = baseDmg * chargeMult * 1.1;
      const reduction = calcArmorReduction(targetArmor);
      finalDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      const heal = Math.max(1, Math.round(finalDmg * 0.1));
      session.stats.hp = Math.min(session.stats.maxHp, session.stats.hp + heal);
      logText = `🩸 <b>${session.username}</b> нанёс <i>Коварный удар</i> на <span style="color:#ef4444">${finalDmg}</span> урона и восстановил ${heal} HP!`;
    }
  }

  target.hp = Math.max(0, target.hp - finalDmg);

  // Синхронизация с Кейт или другим игроком
  if (target.isBoss && boss) {
    boss.hp = target.hp;
  }

  return {
    finalDmg,
    logText,
    isDead: target.hp <= 0,
  };
}