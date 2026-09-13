import type { Session, DuelState, DuelParticipant } from "./types";
import type { KeytBoss } from "./boss";
import { calcArmorReduction } from "./combat";

export interface SkillContext {
  attacker: Session;
  target: DuelParticipant;
  baseDmg: number;
  chargeMult: number;
  duel: DuelState;
  boss?: KeytBoss;
}

export interface SkillResult {
  damage: number;
  heal: number;
  logText: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  cooldown: number; // в секундах
  execute: (ctx: SkillContext) => SkillResult;
}

export const SKILLS: Record<string, SkillDefinition> = {
  // 1. Удар в спину (Воин)
  backstab: {
    id: "backstab",
    name: "Удар в спину",
    description: "Урон 1.5x от текущего замаха. Не игнорирует броню.",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.isBoss ? "Кейт" : target.username;
      const rawDmg = baseDmg * chargeMult * 1.5;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));

      return {
        damage,
        heal: 0,
        logText: `⚔️ <b>${attacker.username}</b> применил <i>Удар в спину</i> по <b>${targetName}</b> на <span style="color:#ef4444">${damage}</span> урона!`,
      };
    },
  },

  // 2. Колющий удар (Копейщик)
  pierce: {
    id: "pierce",
    name: "Колющий удар",
    description: "Урон 1.2x от замаха. Полностью игнорирует броню!",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.isBoss ? "Кейт" : target.username;
      const damage = Math.max(1, Math.round(baseDmg * chargeMult * 1.2));

      return {
        damage,
        heal: 0,
        logText: `🗡️ <b>${attacker.username}</b> вонзил <i>Колющий удар</i> сквозь броню <b>${targetName}</b> на <span style="color:#ef4444">${damage}</span> урона!`,
      };
    },
  },
  
  fireball: {
    id: "fireball",
    name: "Огненный шар",
    description: "Взрыв пламени, наносящий 2.0x урона.",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.isBoss ? "Кейт" : target.username;
      const rawDmg = baseDmg * chargeMult * 2.0;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));

      return {
        damage,
        heal: 0,
        logText: `🔥 <b>${attacker.username}</b> запулил <i>Огненный шар</i> в <b>${targetName}</b> на <span style="color:#ef4444">${damage}</span> урона!`,
      };
    },
  },

  // 3. Коварный удар (Разбойник)
  trick_strike: {
    id: "trick_strike",
    name: "Коварный удар",
    description: "Урон 1.1x от замаха. Восстанавливает 10% от нанесённого урона.",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.isBoss ? "Кейт" : target.username;
      const rawDmg = baseDmg * chargeMult * 1.1;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      const heal = Math.max(1, Math.round(damage * 0.1));

      return {
        damage,
        heal,
        logText: `🩸 <b>${attacker.username}</b> нанёс <i>Коварный удар</i> по <b>${targetName}</b> на <span style="color:#ef4444">${damage}</span> урона и восстановил ${heal} HP!`,
      };
    },
  },
};

export function getSkill(skillId: string): SkillDefinition {
  return SKILLS[skillId] || SKILLS.backstab;
}