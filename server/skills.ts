import type { Session, DuelState, DuelParticipant } from "./types";
import type { KeytBoss } from "./boss";
import { calcArmorReduction } from "./combat";

export interface SkillAttacker {
  id: string;
  username: string;
  stats?: any;
  hp?: number;
  maxHp?: number;
  armor?: number;
  attack?: number;
  shield?: number;
  [key: string]: any;
}

export interface SkillContext {
  attacker: SkillAttacker | Session;
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
  resetCharge?: boolean;
  frostUntil?: number;
  shieldApplied?: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  cooldown: number; // в секундах
  execute: (ctx: SkillContext) => SkillResult;
}

export const SKILLS: Record<string, SkillDefinition> = {
  // --- БАЗОВЫЕ КЛАССЫ ИГРОКОВ ---

  backstab: {
    id: "backstab",
    name: "Удар в спину",
    description: "Урон 1.5x от текущего замаха. Не игнорирует броню.",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
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

  pierce: {
    id: "pierce",
    name: "Колющий удар",
    description: "Урон 1.2x от замаха. Полностью игнорирует броню!",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
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
      const targetName = target.username;
      const rawDmg = baseDmg * chargeMult * 2.0;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));

      return {
        damage,
        heal: 0,
        logText: `🔥 <b>${attacker.username}</b> запустил <i>Огненный шар</i> в <b>${targetName}</b> на <span style="color:#ef4444">${damage}</span> урона!`,
      };
    },
  },

  trick_strike: {
    id: "trick_strike",
    name: "Коварный удар",
    description: "Урон 1.1x от замаха. Восстанавливает 10% от нанесённого урона.",
    cooldown: 14,
    execute: ({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
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

  // --- СПОСОБНОСТИ ДАР ---

  dar_love: {
    id: "dar_love",
    name: "Вселенская любовь",
    description: "Ускоряет автоатаки команды в 1.5 раза на 10 секунд.",
    cooldown: 20,
    execute: ({ attacker, duel }) => {
      const isAllies = duel.allies.some((a) => a.id === attacker.id);
      const myTeam = isAllies ? duel.allies : duel.hunters;
      const now = Date.now();

      myTeam.forEach((member) => {
        member.atkSpeedBuffUntil = now + 10000;
      });

      return {
        damage: 0,
        heal: 0,
        logText: `<span style="color:#34d399; font-weight:bold;">Дар: «Любофь спасёт мир!»</span> — скорость атак команды увеличена в 1.5 раза на 10 сек!`,
      };
    },
  },

  dar_house: {
    id: "dar_house",
    name: "Я в домике",
    description: "Накладывает щит 10–100% от текущего HP, распределяя его поровну между союзниками.",
    cooldown: 44,
    execute: ({ attacker, duel }) => {
      const isAllies = duel.allies.some((a) => a.id === attacker.id);
      const myTeam = isAllies ? duel.allies : duel.hunters;
      const livingAllies = myTeam.filter((a) => a.hp > 0);

      const curHp = attacker.hp ?? attacker.stats?.hp ?? 400;
      const shieldPct = (1 + Math.random() * 90) / 10;
      const totalShield = Math.round(curHp * shieldPct);
      const perAlly = Math.max(1, Math.round(totalShield / Math.max(1, livingAllies.length)));

      livingAllies.forEach((a) => {
        a.shield = (a.shield || 0) + perAlly;
      });

      return {
        damage: 0,
        heal: 0,
        shieldApplied: totalShield,
        logText: `<span style="color:#38bdf8; font-weight:bold;">Дар: «Я в домике!»</span> Общий щит <b style="color:#38bdf8">+${totalShield}</b> распределён поровну (+${perAlly} каждому)!`,
      };
    },
  },

  dar_horror: {
    id: "dar_horror",
    name: "Я ужас летящий на крыльях ночи",
    description: "Быстрый двойной удар крыльями.",
    cooldown: 15,
    execute: ({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const red = calcArmorReduction(target.armor);
      const hit1 = Math.max(1, Math.round(baseDmg * (1 - red)));
      const hit2 = Math.max(1, Math.round(baseDmg * (1 - red)));
      const totalDmg = hit1 + hit2;

      return {
        damage: totalDmg,
        heal: 0,
        logText: `<span style="color:#34d399; font-weight:bold;">Дар: «Я ужас летящий на крыльях ночи!»</span> — обрушила двойной удар по <b>${targetName}</b> на <span style="color:#ef4444">${totalDmg}</span> урона!`,
      };
    },
  },

  // --- СПОСОБНОСТИ ЦВЕТКОВ-ВАМПИРОВ ---

  flower_burn: {
    id: "flower_burn",
    name: "Огненное дыхание",
    description: "Поджигает цель (1–20 HP/сек на 10 сек) и ослабляет её броню на 10%.",
    cooldown: 30,
    execute: ({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const red = calcArmorReduction(target.armor);
      const directDmg = Math.max(1, Math.round(baseDmg * 1.2 * (1 - red)));

      const burnDmgPerSec = Math.floor(Math.random() * 20) + 1;
      target.burnTicks = 10;
      target.burnDmg = burnDmgPerSec;
      const oldArmor = target.armor;
      target.armor = Math.max(0, Math.round(target.armor * 0.9));
      const armorLost = oldArmor - target.armor;

      return {
        damage: directDmg,
        heal: 0,
        logText: `🔥 <b>${attacker.username}</b> опалил <b>${targetName}</b> на <span style="color:#f97316">${directDmg}</span> урона! Цель охвачена огнём (-${burnDmgPerSec} HP/сек, броня -${armorLost}) на 10 сек!`,
      };
    },
  },

  flower_frost: {
    id: "flower_frost",
    name: "Морозное касание",
    description: "Сбрасывает замах игрока до 0 и замедляет скорость замаха на 50% на 8 секунд.",
    cooldown: 40,
    execute: ({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const red = calcArmorReduction(target.armor);
      const directDmg = Math.max(1, Math.round(baseDmg * 0.8 * (1 - red)));
      target.frostUntil = Date.now() + 8000;

      return {
        damage: directDmg,
        heal: 0,
        resetCharge: true,
        frostUntil: target.frostUntil,
        logText: `❄️ <b>${attacker.username}</b> сковал холодом <b>${targetName}</b> на <span style="color:#38bdf8">${directDmg}</span> урона! Замах сброшен до 0, скорость замаха снижена на 50%!`,
      };
    },
  },

  flower_void_slash: {
    id: "flower_void_slash",
    name: "Пространственный разрез",
    description: "Игнорирует броню, снижает урон игрока на 30%, а урон цветка повышает на 60% на 10 сек.",
    cooldown: 60,
    execute: ({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const now = Date.now();
      const damage = Math.max(1, Math.round(baseDmg * 1.5)); // Полный игнор брони

      target.dmgDebuffUntil = now + 10000;
      target.dmgDebuffPct = 0.30;
      attacker.atkBuffUntil = now + 10000;
      attacker.atkBuffPct = 0.60;

      return {
        damage,
        heal: 0,
        logText: `🌌 <span style="color:#c084fc; font-weight:bold;">${attacker.username}</span> рассёк пространство сквозь броню <b>${targetName}</b> на <span style="color:#c084fc; font-weight:bold;">${damage}</span> урона! Урон цели ослаблен на 30%, урон цветка усилен на 60%!`,
      };
    },
  },

  flower_devour: {
    id: "flower_devour",
    name: "Поглощение родича",
    description: "Поглощает другой союзный цветок в дуэли (+50% HP, +30% атаки, отхил на 100% от поглощённого).",
    cooldown: 25,
    execute: ({ attacker, duel }) => {
      const isAllies = duel.allies.some((a) => a.id === attacker.id);
      const myTeam = isAllies ? duel.allies : duel.hunters;

      const victim = myTeam.find((p) => p.id !== attacker.id && p.isFlower && p.hp > 0);
      if (!victim) {
        return {
          damage: 0,
          heal: 0,
          logText: `🌱 <b>${attacker.username}</b> огляделся в поисках цветка для поглощения, но рядом никого не оказалось!`,
        };
      }

      const victimHp = victim.hp;
      victim.hp = 0;

      const bonusMaxHp = Math.round(victim.maxHp * 0.5);
      attacker.maxHp = (attacker.maxHp || 100) + bonusMaxHp;
      attacker.hp = Math.min(attacker.maxHp, (attacker.hp || 0) + victimHp);
      attacker.attack = Math.round((attacker.attack || 10) * 1.3);

      return {
        damage: 0,
        heal: victimHp,
        logText: `💀 <span style="color:#c084fc; font-weight:bold;">${attacker.username}</span> заживо поглотил <b>${victim.username}</b>! <b style="color:#4ade80">+${victimHp} HP</b>, максимальное HP +${bonusMaxHp}, атака +30%!`,
      };
    },
  },
};

export function getSkill(skillId: string): SkillDefinition {
  return SKILLS[skillId] || SKILLS.backstab;
}