var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// room.ts
import { DurableObject } from "cloudflare:workers";

// classes.ts
var CHARACTER_CLASSES = {
  warrior: {
    id: "warrior",
    name: "\u0412\u043E\u0438\u043D",
    color: "#38bdf8",
    abilityId: "backstab",
    stats: {
      hp: 200,
      maxHp: 200,
      armor: 50,
      minAtk: 2,
      maxAtk: 5
    }
  },
  spearman: {
    id: "spearman",
    name: "\u041A\u043E\u043F\u0435\u0439\u0449\u0438\u043A",
    color: "#ef4444",
    abilityId: "pierce",
    stats: {
      hp: 80,
      maxHp: 80,
      armor: 15,
      minAtk: 5,
      maxAtk: 10
    }
  },
  rogue: {
    id: "rogue",
    name: "\u0420\u0430\u0437\u0431\u043E\u0439\u043D\u0438\u043A",
    color: "#22c55e",
    abilityId: "trick_strike",
    stats: {
      hp: 150,
      maxHp: 150,
      armor: 8,
      minAtk: 1,
      maxAtk: 7
    }
  },
  mage: {
    id: "mage",
    name: "\u041C\u0430\u0433",
    color: "#a855f7",
    abilityId: "fireball",
    stats: { hp: 30, maxHp: 30, armor: 1, minAtk: 1, maxAtk: 2 }
  }
};
function getClassConfig(classId) {
  if (!classId || !CHARACTER_CLASSES[classId]) {
    return CHARACTER_CLASSES.warrior;
  }
  return CHARACTER_CLASSES[classId];
}
__name(getClassConfig, "getClassConfig");

// config.ts
var WORLD_PORTALS = [
  {
    id: "portal_arcade",
    name: "\u0420\u0430\u0437\u043B\u043E\u043C \u041C\u0438\u043D\u0438-\u0438\u0433\u0440",
    x: 12,
    y: 1188,
    width: 32,
    height: 32,
    color: "#a855f7"
  },
  {
    id: "portal_class_select",
    name: "\u0410\u043B\u0442\u0430\u0440\u044C \u041F\u0435\u0440\u0435\u0432\u043E\u043F\u043B\u043E\u0449\u0435\u043D\u0438\u044F",
    x: 565,
    y: 600,
    width: 32,
    height: 32,
    color: "#38bdf8"
  }
];
var MINI_GAMES = [
  { id: "shadow_world", title: "\u0422\u0451\u043C\u043D\u044B\u0439 \u043C\u0438\u0440 BETA", desc: "\u0418\u0433\u0440\u043E\u0432\u044B\u0435 \u043C\u0435\u0445\u0430\u043D\u0438\u043A\u0438 \u044D\u0442\u043E\u0439 \u0438\u0433\u0440\u044B \u0431\u0443\u0434\u0443\u0442 \u0432 \u041F\u0440\u043E\u043A\u043B\u044F\u0442\u044B\u0445", url: "/shadow-world/index.html", disabled: false },
  { id: "quiz", title: "\u0412\u0438\u043A\u0442\u043E\u0440\u0438\u043D\u0430", desc: "\u0422\u0435\u0441\u0442\u044B \u043F\u043E \u043B\u043E\u0440\u0443", url: "/quiz_obitel_smerti.html", disabled: false },
  { id: "musicc", title: "\u041C\u0443\u0437\u044B\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u043A\u0430\u0440\u0443\u0441\u0435\u043B\u044C", desc: "\u041F\u0440\u043E\u0441\u0442\u043E \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u044B\u0439 \u043F\u043B\u0435\u0435\u0440", url: "/lorin_death_carousel_final.html", disabled: false },
  { id: "Darkestt", title: "\u0422\u0451\u043C\u043D\u044B\u0439 \u043C\u0438\u0440 ALFA", desc: "\u041C\u043E\u0436\u0435\u0448\u044C \u0441\u043B\u043E\u043C\u0430\u0442\u044C \u0435\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0448\u044C", url: "/Darks.html", disabled: false },
  { id: "World", title: "\u042D\u0442\u043E \u043C\u044B \u0441 \u0442\u043E\u0431\u043E\u0439 (\u0421\u043A\u043E\u0440\u043E)", desc: "\u041D\u0430 \u0442\u0435\u0445\u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0438", url: "", disabled: true },
  { id: "protokol", title: "\u041D\u0435\u043E\u043D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B (\u0421\u043A\u043E\u0440\u043E)", desc: "\u041D\u0430 \u0442\u0435\u0445\u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0438", url: "", disabled: true },
  { id: "Zaglush", title: "\u0417\u0430\u0433\u043B\u0443\u0448\u043A\u0430 (\u0421\u043A\u043E\u0440\u043E)", desc: "\u041D\u0430 \u0442\u0435\u0445\u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0438", url: "", disabled: true }
];
var CLASSES_CONFIG = Object.fromEntries(
  Object.values(CHARACTER_CLASSES).map((c) => [
    c.id,
    {
      name: c.name,
      color: c.color,
      ...c.stats
    }
  ])
);

// skills.ts
var SKILLS = {
  // --- БАЗОВЫЕ КЛАССЫ ИГРОКОВ ---
  backstab: {
    id: "backstab",
    name: "\u0423\u0434\u0430\u0440 \u0432 \u0441\u043F\u0438\u043D\u0443",
    description: "\u0423\u0440\u043E\u043D 1.5x \u043E\u0442 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0437\u0430\u043C\u0430\u0445\u0430. \u041D\u0435 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442 \u0431\u0440\u043E\u043D\u044E.",
    cooldown: 30,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
      const rawDmg = baseDmg * chargeMult * 1.5;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      return {
        damage,
        heal: 0,
        logText: `\u2694\uFE0F <b>${attacker.username}</b> \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043B <i>\u0423\u0434\u0430\u0440 \u0432 \u0441\u043F\u0438\u043D\u0443</i> \u043F\u043E <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${damage}</span> \u0443\u0440\u043E\u043D\u0430!`
      };
    }, "execute")
  },
  pierce: {
    id: "pierce",
    name: "\u041A\u043E\u043B\u044E\u0449\u0438\u0439 \u0443\u0434\u0430\u0440",
    description: "\u0423\u0440\u043E\u043D 1.2x \u043E\u0442 \u0437\u0430\u043C\u0430\u0445\u0430. \u041F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442 \u0431\u0440\u043E\u043D\u044E!",
    cooldown: 20,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
      const damage = Math.max(1, Math.round(baseDmg * chargeMult * 1.2));
      return {
        damage,
        heal: 0,
        logText: `\u{1F5E1}\uFE0F <b>${attacker.username}</b> \u0432\u043E\u043D\u0437\u0438\u043B <i>\u041A\u043E\u043B\u044E\u0449\u0438\u0439 \u0443\u0434\u0430\u0440</i> \u0441\u043A\u0432\u043E\u0437\u044C \u0431\u0440\u043E\u043D\u044E <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${damage}</span> \u0443\u0440\u043E\u043D\u0430!`
      };
    }, "execute")
  },
  fireball: {
    id: "fireball",
    name: "\u041E\u0433\u043D\u0435\u043D\u043D\u044B\u0439 \u0448\u0430\u0440",
    description: "\u0412\u0437\u0440\u044B\u0432 \u043F\u043B\u0430\u043C\u0435\u043D\u0438, \u043D\u0430\u043D\u043E\u0441\u044F\u0449\u0438\u0439 10.0x \u0443\u0440\u043E\u043D\u0430.",
    cooldown: 40,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
      const rawDmg = baseDmg * chargeMult * 10;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      return {
        damage,
        heal: 0,
        logText: `\u{1F525} <b>${attacker.username}</b> \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u043B <i>\u041E\u0433\u043D\u0435\u043D\u043D\u044B\u0439 \u0448\u0430\u0440</i> \u0432 <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${damage}</span> \u0443\u0440\u043E\u043D\u0430!`
      };
    }, "execute")
  },
  trick_strike: {
    id: "trick_strike",
    name: "\u041A\u043E\u0432\u0430\u0440\u043D\u044B\u0439 \u0443\u0434\u0430\u0440",
    description: "\u0423\u0440\u043E\u043D 1.1x \u043E\u0442 \u0437\u0430\u043C\u0430\u0445\u0430. \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442 10% \u043E\u0442 \u043D\u0430\u043D\u0435\u0441\u0451\u043D\u043D\u043E\u0433\u043E \u0443\u0440\u043E\u043D\u0430.",
    cooldown: 30,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg, chargeMult }) => {
      const targetName = target.username;
      const rawDmg = baseDmg * chargeMult * 1.1;
      const reduction = calcArmorReduction(target.armor);
      const damage = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      const heal = Math.max(1, Math.round(damage * 0.1));
      return {
        damage,
        heal,
        logText: `\u{1FA78} <b>${attacker.username}</b> \u043D\u0430\u043D\u0451\u0441 <i>\u041A\u043E\u0432\u0430\u0440\u043D\u044B\u0439 \u0443\u0434\u0430\u0440</i> \u043F\u043E <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${damage}</span> \u0443\u0440\u043E\u043D\u0430 \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043B ${heal} HP!`
      };
    }, "execute")
  },
  // --- СПОСОБНОСТИ ДАР ---
  dar_love: {
    id: "dar_love",
    name: "\u0412\u0441\u0435\u043B\u0435\u043D\u0441\u043A\u0430\u044F \u043B\u044E\u0431\u043E\u0432\u044C",
    description: "\u0423\u0441\u043A\u043E\u0440\u044F\u0435\u0442 \u0430\u0432\u0442\u043E\u0430\u0442\u0430\u043A\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0432 1.5 \u0440\u0430\u0437\u0430 \u043D\u0430 10 \u0441\u0435\u043A\u0443\u043D\u0434.",
    cooldown: 40,
    execute: /* @__PURE__ */ __name(({ attacker, duel }) => {
      const isAllies = duel.allies.some((a) => a.id === attacker.id);
      const myTeam = isAllies ? duel.allies : duel.hunters;
      const now = Date.now();
      myTeam.forEach((member) => {
        member.atkSpeedBuffUntil = now + 1e4;
      });
      return {
        damage: 0,
        heal: 0,
        logText: `<span style="color:#34d399; font-weight:bold;">\u0414\u0430\u0440: \xAB\u041B\u044E\u0431\u043E\u0444\u044C \u0441\u043F\u0430\u0441\u0451\u0442 \u043C\u0438\u0440!\xBB</span> \u2014 \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0430\u0442\u0430\u043A \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0443\u0432\u0435\u043B\u0438\u0447\u0435\u043D\u0430 \u0432 1.5 \u0440\u0430\u0437\u0430 \u043D\u0430 10 \u0441\u0435\u043A!`
      };
    }, "execute")
  },
  dar_house: {
    id: "dar_house",
    name: "\u042F \u0432 \u0434\u043E\u043C\u0438\u043A\u0435",
    description: "\u041D\u0430\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0435\u0442 \u0449\u0438\u0442 10\u2013100% \u043E\u0442 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E HP, \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u044F \u0435\u0433\u043E \u043F\u043E\u0440\u043E\u0432\u043D\u0443 \u043C\u0435\u0436\u0434\u0443 \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0430\u043C\u0438.",
    cooldown: 44,
    execute: /* @__PURE__ */ __name(({ attacker, duel }) => {
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
        logText: `<span style="color:#38bdf8; font-weight:bold;">\u0414\u0430\u0440: \xAB\u042F \u0432 \u0434\u043E\u043C\u0438\u043A\u0435!\xBB</span> \u041E\u0431\u0449\u0438\u0439 \u0449\u0438\u0442 <b style="color:#38bdf8">+${totalShield}</b> \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u043F\u043E\u0440\u043E\u0432\u043D\u0443 (+${perAlly} \u043A\u0430\u0436\u0434\u043E\u043C\u0443)!`
      };
    }, "execute")
  },
  dar_horror: {
    id: "dar_horror",
    name: "\u042F \u0443\u0436\u0430\u0441 \u043B\u0435\u0442\u044F\u0449\u0438\u0439 \u043D\u0430 \u043A\u0440\u044B\u043B\u044C\u044F\u0445 \u043D\u043E\u0447\u0438",
    description: "\u0411\u044B\u0441\u0442\u0440\u044B\u0439 \u0434\u0432\u043E\u0439\u043D\u043E\u0439 \u0443\u0434\u0430\u0440 \u043A\u0440\u044B\u043B\u044C\u044F\u043C\u0438.",
    cooldown: 15,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const red = calcArmorReduction(target.armor);
      const hit1 = Math.max(1, Math.round(baseDmg * (1 - red)));
      const hit2 = Math.max(1, Math.round(baseDmg * (1 - red)));
      const totalDmg = hit1 + hit2;
      return {
        damage: totalDmg,
        heal: 0,
        logText: `<span style="color:#34d399; font-weight:bold;">\u0414\u0430\u0440: \xAB\u042F \u0443\u0436\u0430\u0441 \u043B\u0435\u0442\u044F\u0449\u0438\u0439 \u043D\u0430 \u043A\u0440\u044B\u043B\u044C\u044F\u0445 \u043D\u043E\u0447\u0438!\xBB</span> \u2014 \u043E\u0431\u0440\u0443\u0448\u0438\u043B\u0430 \u0434\u0432\u043E\u0439\u043D\u043E\u0439 \u0443\u0434\u0430\u0440 \u043F\u043E <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${totalDmg}</span> \u0443\u0440\u043E\u043D\u0430!`
      };
    }, "execute")
  },
  // --- СПОСОБНОСТИ ЦВЕТКОВ-ВАМПИРОВ ---
  flower_burn: {
    id: "flower_burn",
    name: "\u041E\u0433\u043D\u0435\u043D\u043D\u043E\u0435 \u0434\u044B\u0445\u0430\u043D\u0438\u0435",
    description: "\u041F\u043E\u0434\u0436\u0438\u0433\u0430\u0435\u0442 \u0446\u0435\u043B\u044C (1\u201320 HP/\u0441\u0435\u043A \u043D\u0430 10 \u0441\u0435\u043A) \u0438 \u043E\u0441\u043B\u0430\u0431\u043B\u044F\u0435\u0442 \u0435\u0451 \u0431\u0440\u043E\u043D\u044E \u043D\u0430 10%.",
    cooldown: 30,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg }) => {
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
        logText: `\u{1F525} <b>${attacker.username}</b> \u043E\u043F\u0430\u043B\u0438\u043B <b>${targetName}</b> \u043D\u0430 <span style="color:#f97316">${directDmg}</span> \u0443\u0440\u043E\u043D\u0430! \u0426\u0435\u043B\u044C \u043E\u0445\u0432\u0430\u0447\u0435\u043D\u0430 \u043E\u0433\u043D\u0451\u043C (-${burnDmgPerSec} HP/\u0441\u0435\u043A, \u0431\u0440\u043E\u043D\u044F -${armorLost}) \u043D\u0430 10 \u0441\u0435\u043A!`
      };
    }, "execute")
  },
  flower_frost: {
    id: "flower_frost",
    name: "\u041C\u043E\u0440\u043E\u0437\u043D\u043E\u0435 \u043A\u0430\u0441\u0430\u043D\u0438\u0435",
    description: "\u0421\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u0435\u0442 \u0437\u0430\u043C\u0430\u0445 \u0438\u0433\u0440\u043E\u043A\u0430 \u0434\u043E 0 \u0438 \u0437\u0430\u043C\u0435\u0434\u043B\u044F\u0435\u0442 \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0437\u0430\u043C\u0430\u0445\u0430 \u043D\u0430 50% \u043D\u0430 8 \u0441\u0435\u043A\u0443\u043D\u0434.",
    cooldown: 40,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const red = calcArmorReduction(target.armor);
      const directDmg = Math.max(1, Math.round(baseDmg * 0.8 * (1 - red)));
      target.frostUntil = Date.now() + 8e3;
      return {
        damage: directDmg,
        heal: 0,
        resetCharge: true,
        frostUntil: target.frostUntil,
        logText: `\u2744\uFE0F <b>${attacker.username}</b> \u0441\u043A\u043E\u0432\u0430\u043B \u0445\u043E\u043B\u043E\u0434\u043E\u043C <b>${targetName}</b> \u043D\u0430 <span style="color:#38bdf8">${directDmg}</span> \u0443\u0440\u043E\u043D\u0430! \u0417\u0430\u043C\u0430\u0445 \u0441\u0431\u0440\u043E\u0448\u0435\u043D \u0434\u043E 0, \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0437\u0430\u043C\u0430\u0445\u0430 \u0441\u043D\u0438\u0436\u0435\u043D\u0430 \u043D\u0430 50%!`
      };
    }, "execute")
  },
  flower_void_slash: {
    id: "flower_void_slash",
    name: "\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0440\u0430\u0437\u0440\u0435\u0437",
    description: "\u0418\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442 \u0431\u0440\u043E\u043D\u044E, \u0441\u043D\u0438\u0436\u0430\u0435\u0442 \u0443\u0440\u043E\u043D \u0438\u0433\u0440\u043E\u043A\u0430 \u043D\u0430 30%, \u0430 \u0443\u0440\u043E\u043D \u0446\u0432\u0435\u0442\u043A\u0430 \u043F\u043E\u0432\u044B\u0448\u0430\u0435\u0442 \u043D\u0430 60% \u043D\u0430 10 \u0441\u0435\u043A.",
    cooldown: 60,
    execute: /* @__PURE__ */ __name(({ attacker, target, baseDmg }) => {
      const targetName = target.username;
      const now = Date.now();
      const damage = Math.max(1, Math.round(baseDmg * 1.5));
      target.dmgDebuffUntil = now + 1e4;
      target.dmgDebuffPct = 0.3;
      attacker.atkBuffUntil = now + 1e4;
      attacker.atkBuffPct = 0.6;
      return {
        damage,
        heal: 0,
        logText: `\u{1F30C} <span style="color:#c084fc; font-weight:bold;">${attacker.username}</span> \u0440\u0430\u0441\u0441\u0451\u043A \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u043E \u0441\u043A\u0432\u043E\u0437\u044C \u0431\u0440\u043E\u043D\u044E <b>${targetName}</b> \u043D\u0430 <span style="color:#c084fc; font-weight:bold;">${damage}</span> \u0443\u0440\u043E\u043D\u0430! \u0423\u0440\u043E\u043D \u0446\u0435\u043B\u0438 \u043E\u0441\u043B\u0430\u0431\u043B\u0435\u043D \u043D\u0430 30%, \u0443\u0440\u043E\u043D \u0446\u0432\u0435\u0442\u043A\u0430 \u0443\u0441\u0438\u043B\u0435\u043D \u043D\u0430 60%!`
      };
    }, "execute")
  },
  flower_devour: {
    id: "flower_devour",
    name: "\u041F\u043E\u0433\u043B\u043E\u0449\u0435\u043D\u0438\u0435 \u0440\u043E\u0434\u0438\u0447\u0430",
    description: "\u041F\u043E\u0433\u043B\u043E\u0449\u0430\u0435\u0442 \u0434\u0440\u0443\u0433\u043E\u0439 \u0441\u043E\u044E\u0437\u043D\u044B\u0439 \u0446\u0432\u0435\u0442\u043E\u043A \u0432 \u0434\u0443\u044D\u043B\u0438 (+50% HP, +30% \u0430\u0442\u0430\u043A\u0438, \u043E\u0442\u0445\u0438\u043B \u043D\u0430 100% \u043E\u0442 \u043F\u043E\u0433\u043B\u043E\u0449\u0451\u043D\u043D\u043E\u0433\u043E).",
    cooldown: 25,
    execute: /* @__PURE__ */ __name(({ attacker, duel }) => {
      const isAllies = duel.allies.some((a) => a.id === attacker.id);
      const myTeam = isAllies ? duel.allies : duel.hunters;
      const victim = myTeam.find((p) => p.id !== attacker.id && p.isFlower && p.hp > 0);
      if (!victim) {
        return {
          damage: 0,
          heal: 0,
          logText: `\u{1F331} <b>${attacker.username}</b> \u043E\u0433\u043B\u044F\u0434\u0435\u043B\u0441\u044F \u0432 \u043F\u043E\u0438\u0441\u043A\u0430\u0445 \u0446\u0432\u0435\u0442\u043A\u0430 \u0434\u043B\u044F \u043F\u043E\u0433\u043B\u043E\u0449\u0435\u043D\u0438\u044F, \u043D\u043E \u0440\u044F\u0434\u043E\u043C \u043D\u0438\u043A\u043E\u0433\u043E \u043D\u0435 \u043E\u043A\u0430\u0437\u0430\u043B\u043E\u0441\u044C!`
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
        logText: `\u{1F480} <span style="color:#c084fc; font-weight:bold;">${attacker.username}</span> \u0437\u0430\u0436\u0438\u0432\u043E \u043F\u043E\u0433\u043B\u043E\u0442\u0438\u043B <b>${victim.username}</b>! <b style="color:#4ade80">+${victimHp} HP</b>, \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 HP +${bonusMaxHp}, \u0430\u0442\u0430\u043A\u0430 +30%!`
      };
    }, "execute")
  }
};
function getSkill(skillId) {
  return SKILLS[skillId] || SKILLS.backstab;
}
__name(getSkill, "getSkill");

// combat.ts
function calcArmorReduction(armor) {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.9, pct / 100);
}
__name(calcArmorReduction, "calcArmorReduction");
function processCombatAction(action, chargeMultRaw, session, duel, boss, targetId) {
  if (action === "escape") {
    session.inDuel = false;
    session.escapedUntil = Date.now() + 5e3;
    return {
      finalDmg: 0,
      logText: `<span style="color:#facc15"><b>${session.username}</b> \u0442\u0440\u0443\u0441\u043B\u0438\u0432\u043E \u0441\u0431\u0435\u0436\u0430\u043B \u0438\u0437 \u0431\u0438\u0442\u0432\u044B!</span>`,
      isDead: false,
      isEscaped: true
    };
  }
  const isFlowerAttacker = session.stats?.classId?.startsWith("flower_");
  const now = Date.now();
  const isHunter = duel.hunters.some((h) => h.id === session.id);
  const targetList = isHunter ? duel.allies : duel.hunters;
  let target = (targetId ? targetList.find((t) => t.id === targetId && t.hp > 0) : null) || targetList.find((t) => t.hp > 0);
  if (!target) {
    return { finalDmg: 0, logText: "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0446\u0435\u043B\u0435\u0439", isDead: false };
  }
  const targetName = target.isBoss ? target.username : target.username;
  let rawIncomingDmg = 0;
  let logText = "";
  let extraLog = "";
  if (isFlowerAttacker) {
    const fType = session.stats.classId.replace("flower_", "");
    let baseAtk = session.stats.attack || 20;
    if (session.atkBuffUntil && now < session.atkBuffUntil) {
      baseAtk = Math.round(baseAtk * (1 + (session.atkBuffPct || 0.6)));
    }
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
        extraLog += `<br>\u{1F480} <b>${session.username}</b> \u043F\u043E\u0433\u043B\u043E\u0442\u0438\u043B \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0430! <b style="color:#4ade80">+${vHp} HP</b>, \u0430\u0442\u0430\u043A\u0430 \u0443\u0441\u0438\u043B\u0435\u043D\u0430!`;
      }
    }
    if (fType === "hell" && Math.random() < 0.3) {
      const red = 0;
      rawIncomingDmg = Math.max(1, Math.round(baseAtk * 1.5));
      target.dmgDebuffUntil = now + 1e4;
      target.dmgDebuffPct = 0.3;
      logText = `\u{1F30C} <span style="color:#c084fc; font-weight:bold;">${session.username}</span> \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043B <i>\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0440\u0430\u0437\u0440\u0435\u0437</i> \u0441\u043A\u0432\u043E\u0437\u044C \u0431\u0440\u043E\u043D\u044E <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${rawIncomingDmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
    } else {
      const ignoreArmor = fType === "hell";
      const reduction = ignoreArmor ? 0 : calcArmorReduction(target.armor);
      rawIncomingDmg = Math.max(1, Math.round(baseAtk * (1 - reduction)));
      if (fType === "fire") {
        target.burnTicks = 10;
        target.burnDmg = Math.floor(Math.random() * 15) + 5;
        target.armor = Math.max(0, Math.round(target.armor * 0.9));
        logText = `\u{1F525} <b>${session.username}</b> \u043E\u043F\u0430\u043B\u0438\u043B <b>${targetName}</b> \u043D\u0430 <span style="color:#f97316">${rawIncomingDmg}</span> \u0443\u0440\u043E\u043D\u0430! \u041E\u0433\u043E\u043D\u044C \u0438 \u043F\u043B\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0431\u0440\u043E\u043D\u0438!`;
      } else if (fType === "frost") {
        target.frostUntil = now + 8e3;
        logText = `\u2744\uFE0F <b>${session.username}</b> \u0437\u0430\u043C\u043E\u0440\u043E\u0437\u0438\u043B <b>${targetName}</b> \u043D\u0430 <span style="color:#38bdf8">${rawIncomingDmg}</span> \u0443\u0440\u043E\u043D\u0430! \u0417\u0430\u043C\u0430\u0445 \u0441\u0431\u0440\u043E\u0448\u0435\u043D!`;
      } else {
        logText = `\u{1F338} <b>${session.username}</b> \u0430\u0442\u0430\u043A\u043E\u0432\u0430\u043B <b>${targetName}</b> \u043D\u0430 <span style="color:#ef4444">${rawIncomingDmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
      }
    }
    logText += extraLog;
  } else {
    const classConfig = getClassConfig(session.stats.classId);
    const { minAtk, maxAtk } = classConfig.stats;
    let baseDmg = Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk;
    const isDismoraled = Boolean(session.dismoraleUntil && Date.now() < session.dismoraleUntil);
    if (isDismoraled) {
      baseDmg = Math.max(1, Math.round(baseDmg * 0.65));
    }
    if (session.dmgDebuffUntil && now < session.dmgDebuffUntil) {
      baseDmg = Math.max(1, Math.round(baseDmg * (1 - (session.dmgDebuffPct || 0.3))));
    }
    const chargeMult = Math.min(3, Math.max(0.2, Number(chargeMultRaw || 1)));
    if (action === "attack") {
      const rawDmg = baseDmg * chargeMult;
      const reduction = calcArmorReduction(target.armor);
      rawIncomingDmg = Math.max(1, Math.round(rawDmg * (1 - reduction)));
      logText = `<b>${session.username}</b> \u043D\u0430\u043D\u0451\u0441 <span style="color:#ef4444">${rawIncomingDmg}</span> \u0443\u0440\u043E\u043D\u0430 \u043F\u043E <b>${targetName}</b> [x${chargeMult}]!`;
    } else if (action === "ability") {
      const skill = getSkill(classConfig.abilityId);
      const result = skill.execute({
        attacker: session,
        target,
        baseDmg,
        chargeMult,
        duel,
        boss
      });
      rawIncomingDmg = result.damage;
      logText = result.logText;
      if (result.heal > 0) {
        session.stats.hp = Math.min(session.stats.maxHp, session.stats.hp + result.heal);
      }
    }
  }
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
    logText += ` <span style="color:#38bdf8; font-weight:bold;">[\u{1F6E1}\uFE0F \u0429\u0438\u0442 \u043F\u043E\u0433\u043B\u043E\u0442\u0438\u043B: ${shieldAbsorbed}]</span>`;
  }
  target.hp = Math.max(0, target.hp - hpDmg);
  if (target.isBoss && boss && target.id === boss.id) {
    boss.hp = target.hp;
  }
  return {
    finalDmg: hpDmg,
    logText,
    isDead: target.hp <= 0,
    target
  };
}
__name(processCombatAction, "processCombatAction");

// boss.ts
var WANDER_QUOTES = [
  "\u0410 \u0433\u0434\u0435 \u041D\u043E\u0444\u043E\u0440\u0434?",
  "\u041C\u043D\u0435 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0441\u043F\u0430\u0442\u044C...",
  "\u041D\u0435 \u0445\u043E\u0434\u0438\u0442\u0435 \u043F\u043E \u043F\u043E\u043C\u044B\u0442\u043E\u043C\u0443, \u043C\u0440\u044F)",
  "\u041D\u0435 \u0445\u043E\u0447\u0443 \u0447\u0442\u043E\u0431\u044B \u041C\u044D\u043B \u0437\u043B\u0438\u043B\u0430\u0441\u044C(",
  "\u041A\u044C\u044E\u0442 \u0445\u043E\u0440\u043E\u0448\u0430\u044F...",
  "\u041A\u0438\u0442\u0442\u0438 \u043F\u043B\u043E\u0445\u0430\u044F...",
  "\u041C\u0438\u043B\u043E\u0435 \u043C\u0435\u0441\u0442\u0435\u0447\u043A\u043E...",
  "\u0411\u0430\u0443 \u0431\u0430\u0443)))",
  "\u041A\u0442\u043E \u043D\u0435 \u0441\u043F\u0440\u044F\u0442\u0430\u043B\u0441\u044F, \u044F \u043D\u0435 \u0432\u0438\u043D\u043E\u0432\u0430\u0442\u0430",
  "\u0422\u0438\u043B\u0438 \u0442\u0438\u043B\u0438 \u0442\u0435\u0441\u0442\u043E, \u0436\u0435\u043D\u0438\u0445 \u0438 \u043D\u0435\u0432\u0435\u0441\u0442\u0430, \u043C\u0440\u044F!"
];
var KeytBoss = class {
  static {
    __name(this, "KeytBoss");
  }
  id = "boss_keyt";
  name = "\u041A\u0435\u0439\u0442";
  x = 700;
  y = 700;
  spawnX = 700;
  spawnY = 700;
  dirX = 0;
  dirY = 1;
  state = "wander";
  targetPlayerId = null;
  baseHp = 100;
  baseMaxHp = 100;
  baseArmor = 10;
  baseAtk = 5;
  hp = 100;
  maxHp = 100;
  armor = 10;
  attack = 5;
  inDuel = false;
  duelId = null;
  deathTime = 0;
  nextAttackTime = 0;
  nextWanderTime = 0;
  wanderTargetX = 700;
  wanderTargetY = 700;
  nextWanderSayTime = Date.now() + 5e3;
  nextCombatSayTime = 0;
  lastAltarSayTime = 0;
  lastGreetLorinTime = 0;
  lastGreetNo4dTime = 0;
  lastDuelCommentTime = 0;
  intervenedDuels = /* @__PURE__ */ new Set();
  AGGRO_RADIUS = 90;
  HITBOX_RADIUS = 35;
  SPEED = 185;
  clampPosition() {
    this.x = Math.max(40, Math.min(1160, this.x));
    this.y = Math.max(40, Math.min(1160, this.y));
  }
  getState() {
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
      duelId: this.duelId || void 0
    };
  }
  recalcPassives(duel) {
    const yells = [];
    if (!duel) {
      this.maxHp = this.baseMaxHp;
      this.armor = this.baseArmor;
      this.attack = this.baseAtk;
      this.hp = Math.min(this.hp, this.maxHp);
      return yells;
    }
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
    const bossParticipant = myTeam.find((p) => p.id === this.id);
    if (bossParticipant) {
      bossParticipant.maxHp = this.maxHp;
      bossParticipant.hp = this.hp;
      bossParticipant.armor = this.armor;
    }
    return yells;
  }
  onEnemyKilled() {
    this.hp = Math.min(this.maxHp, this.hp + 30);
    return `<span style="color:#f472b6; font-weight:bold;">\u041A\u0435\u0439\u0442: \xAB\u041D\u044F\u043C!\xBB</span> \u2014 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043B\u0430 \u0441\u0435\u0431\u0435 <b style="color:#4ade80">30 HP</b>!`;
  }
  onPlayerDuelFinished(winnerName, onBossSay) {
    const isNo4d = (winnerName || "").trim().toLowerCase() === "no4d";
    if (isNo4d) {
      onBossSay("\u041E! \u041C\u043E\u0439 \u043B\u044E\u0431\u0438\u043C\u044B\u0439 \u041D\u043E\u0444\u043E\u0440\u0434!");
    } else {
      onBossSay("\u0410 \u041D\u043E\u0444\u043E\u0440\u0434 \u0431\u044B \u043F\u043E\u0431\u0435\u0434\u0438\u043B!");
    }
  }
  update(dt, sessions, activeDuels, onTriggerCombat, onDuelUpdate, onDuelEnd, onBossSay, onBossIntervene) {
    const now = Date.now();
    if (this.state === "dead") {
      if (now - this.deathTime >= 5e3) {
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
        this.nextWanderSayTime = now + 4e3;
      }
      return;
    }
    if (this.state === "combat") {
      if (!this.duelId || !activeDuels.has(this.duelId)) {
        this.state = "wander";
        this.inDuel = false;
        this.duelId = null;
        this.recalcPassives(null);
        return;
      }
      const duel = activeDuels.get(this.duelId);
      const isKateInAllies = duel.allies.some((a) => a.id === this.id);
      const myTeam = isKateInAllies ? duel.allies : duel.hunters;
      const enemyTeam = isKateInAllies ? duel.hunters : duel.allies;
      const bossPart = myTeam.find((p) => p.id === this.id);
      if (bossPart) {
        this.hp = bossPart.hp;
      }
      if (now >= this.nextCombatSayTime) {
        this.nextCombatSayTime = now + (4500 + Math.random() * 4500);
        onBossSay("\u041F\u041E\u041C\u041E\u0413\u0418\u0422\u0415!");
      }
      if (now >= this.nextAttackTime) {
        this.nextAttackTime = now + (1500 + Math.random() * 3500);
        const livingEnemies = enemyTeam.filter((e) => e.hp > 0);
        if (livingEnemies.length > 0) {
          const target = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
          let targetSession = null;
          let targetWs = null;
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
            let logText = `<span style="color:#f472b6">\u041A\u0435\u0439\u0442</span> \u0430\u0442\u0430\u043A\u043E\u0432\u0430\u043B\u0430 <b>${target.username}</b> \u043D\u0430 <span style="color:#ef4444">${finalDmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
            if (target.hp <= 0) {
              logText += `<br>${this.onEnemyKilled()}`;
              targetSession.inDuel = false;
              targetSession.stats.hp = targetSession.stats.maxHp;
              targetSession.rejoinBlockedUntil = Date.now() + 3e4;
              if (targetWs) {
                try {
                  targetWs.send(JSON.stringify({ type: "combat_death", lockDuration: 30, winnerName: "\u041A\u0435\u0439\u0442" }));
                } catch (_) {
                }
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
              onDuelEnd(duel, "\u041A\u0435\u0439\u0442 \u0438 \u0435\u0451 \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0438");
            }
          }
        }
      }
      return;
    }
    if (this.state === "wander") {
      const distToAltar = Math.hypot(this.x - 565, this.y - 600);
      if (distToAltar <= 70 && now - this.lastAltarSayTime > 25e3) {
        this.lastAltarSayTime = now;
        onBossSay("\u0410\u0434\u0441\u043A\u043E\u0435 \u043F\u043B\u0430\u043C\u044F?");
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
      if (nearbyLorin && now - this.lastGreetLorinTime > 4e4) {
        this.lastGreetLorinTime = now;
        onBossSay("\u041F\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E \u0413\u043E\u0441\u043F\u043E\u0436\u0430!");
      } else if (nearbyNo4d && now - this.lastGreetNo4dTime > 4e4) {
        this.lastGreetNo4dTime = now;
        onBossSay("\u041F\u0440\u0438\u0432\u0435\u0442, \u0434\u043E\u0440\u043E\u0433\u043E\u0439!");
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
              if (roll < 0.2) {
                onBossSay("\u041F\u043E\u0440\u0430 \u043A\u0440\u043E\u043C\u0441\u0430\u0442\u044C!!!");
                onBossIntervene(duel, "join");
                return;
              } else if (roll < 0.4) {
                onBossSay("\u0427\u043C\u043E\u043A!");
                onBossIntervene(duel, "kiss");
                return;
              }
            }
            if (now - this.lastDuelCommentTime > 15e3) {
              this.lastDuelCommentTime = now;
              onBossSay("\u0414\u0443\u0440\u0430\u0447\u043A\u0438");
            }
          }
        }
      }
      if (now >= this.nextWanderSayTime) {
        this.nextWanderSayTime = now + (1e4 + Math.random() * 8e3);
        const quote = WANDER_QUOTES[Math.floor(Math.random() * WANDER_QUOTES.length)];
        onBossSay(quote);
      }
      if (now >= this.nextWanderTime) {
        this.nextWanderTime = now + (3500 + Math.random() * 4e3);
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
            onBossSay("\u0416\u0415\u0420\u0422\u0412\u0410!");
            break;
          }
        }
      }
      return;
    }
    if (this.state === "chase") {
      let targetSession = null;
      let targetWs = null;
      for (const [ws, s] of sessions.entries()) {
        if (s.id === this.targetPlayerId) {
          targetSession = s;
          targetWs = ws;
          break;
        }
      }
      const isTargetInvalid = !targetSession || targetSession.inDuel || !targetSession.stats.classId || targetSession.escapedUntil && now < targetSession.escapedUntil || targetSession.rejoinBlockedUntil && now < targetSession.rejoinBlockedUntil;
      const cdx = targetSession ? targetSession.x - this.x : 0;
      const cdy = targetSession ? targetSession.y - this.y : 0;
      const dist = Math.hypot(cdx, cdy);
      if (isTargetInvalid || dist > this.AGGRO_RADIUS + 90) {
        this.state = "wander";
        this.targetPlayerId = null;
        this.nextWanderSayTime = now + 4e3;
        onBossSay("\u0423\u0431\u0435\u0436\u0430\u043B(");
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
};

// dar.ts
var SIMPLE_QUOTES = [
  "\u041B\u044E\u0431\u043E\u0444\u044C \u0441\u043F\u0430\u0441\u0451\u0442 \u043C\u0438\u0440!",
  "\u0410 \u043D\u0430\u0441 \u0440\u0430\u0442\u044C!",
  "\u0421\u043B\u0443\u0447\u0430\u0439\u043D\u043E\u0441\u0442\u0438 \u043D\u0435 \u0441\u043B\u0443\u0447\u0430\u0439\u043D\u044B",
  "\u041C\u0438\u0443-\u043C\u0438\u0443 \u043A\u0440\u043E\u0448\u043A\u0430",
  "\u0425\u043E\u0434\u0438\u0442 \u0442\u0443\u0442 \u0434\u0440\u0430\u043D\u043D\u0430\u044F \u043A\u043E\u0448\u043A\u0430",
  "\u0425\u043E\u0434\u044F\u0442 \u0442\u0443\u0442 \u0432\u0441\u044F\u043A\u0438\u0435"
];
var DISMORALE_QUOTES = [
  "\u041F\u043E\u043F\u0443 \u043D\u0430\u0434\u043E \u043C\u044B\u0442\u044C!",
  "\u0416\u043E\u043F\u0443 \u043C\u044B\u0442\u044C!",
  "\u0418\u0434\u0438 \u043A\u0443\u043F\u0430\u0439\u0441\u0430!",
  "\u0423\u0448\u0438 \u043C\u044B\u043B?"
];
var DarBoss = class {
  static {
    __name(this, "DarBoss");
  }
  id = "boss_dar";
  name = "\u0414\u0430\u0440";
  x = 300;
  y = 300;
  dirX = 0;
  dirY = 1;
  state = "wander";
  targetPlayerId = null;
  targetFlowerId = null;
  rushTargetDuelId = null;
  rushSide = "random";
  baseHp = 200;
  baseMaxHp = 200;
  baseArmor = 20;
  minAtk = 2;
  maxAtk = 15;
  hp = 200;
  maxHp = 200;
  armor = 20;
  inDuel = false;
  duelId = null;
  deathTime = 0;
  decisionTick = 0;
  oneSecTimer = 0;
  nextAttackTime = 0;
  attackInterval = 4;
  loveBuffUntil = 0;
  cdLove = 0;
  cdHouse = 0;
  cdHorror = 0;
  lastPlantTime = 0;
  // Кулдаун посадки 40 секунд
  fleeUntil = 0;
  wanderTargetX = 300;
  wanderTargetY = 300;
  SPEED_NORMAL = 160;
  SPEED_FAST = 280;
  constructor() {
    this.respawnRandom();
  }
  clampPosition() {
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
  onPlayerEscaped(onSay) {
    onSay("\u0422\u0420\u0423\u0421!");
  }
  getState() {
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
      duelId: this.duelId || void 0
    };
  }
  update(dt, sessions, activeDuels, flowers, onSay, onSurpriseHit, onJoinDuel, onDuelUpdate, onDuelEnd, onPlantFlower, onWaterFlower) {
    const now = Date.now();
    if (this.state === "dead") {
      if (now - this.deathTime >= 8e3) {
        this.respawnRandom();
        onSay("\u041B\u044E\u0431\u043E\u0444\u044C \u0441\u043F\u0430\u0441\u0451\u0442 \u043C\u0438\u0440!");
      }
      return;
    }
    if (this.state === "combat") {
      this.updateCombat(dt, sessions, activeDuels, onSay, onDuelUpdate, onDuelEnd);
      return;
    }
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
        onSay("\u041F\u043E\u043B\u0438\u0432\u0430\u0448\u043A\u0438");
        onWaterFlower(targetFl);
        this.state = "wander";
        this.targetFlowerId = null;
      }
      return;
    }
    if (this.state !== "flee" && this.state !== "rush_combat") {
      let nearestMature = null;
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
        onSay("\u041C\u0430\u043D\u044E\u043D\u044F!!!");
        return;
      }
    }
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
        this.nextAttackTime = now + 2e3;
        const side = this.rushSide === "npc" ? duel.allies.some((a) => a.isBoss || a.isFlower) ? "allies" : "hunters" : Math.random() < 0.5 ? "hunters" : "allies";
        const yell = this.rushSide === "npc" ? `<span style="color:#34d399; font-weight:bold;">\u0414\u0430\u0440: \xAB\u041D\u0430\u0448\u0438\u0445 \u0431\u044C\u044E\u0442!\xBB</span> \u2014 \u0432\u043E\u0440\u0432\u0430\u043B\u0430\u0441\u044C \u0437\u0430\u0449\u0438\u0449\u0430\u0442\u044C \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0430!` : `<span style="color:#34d399; font-weight:bold;">\u0414\u0430\u0440: \xAB\u0421\u041F\u0410\u0420\u0422\u0410\u0410\u0410!\xBB</span> \u2014 \u043D\u0430 \u043F\u043E\u043B\u043D\u043E\u0439 \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u0438 \u0432\u043B\u0435\u0442\u0435\u043B\u0430 \u0432 \u0434\u0440\u0430\u043A\u0443!`;
        onJoinDuel(duel, side, yell);
      }
      return;
    }
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
    this.oneSecTimer += dt;
    if (this.oneSecTimer >= 1) {
      this.oneSecTimer = 0;
      this.handleOneSecondEvents(now, sessions, activeDuels, flowers, onSay, onSurpriseHit, onPlantFlower);
    }
    this.decisionTick += dt;
    if (this.decisionTick >= 4) {
      this.decisionTick = 0;
      this.makeBehaviorChoice(sessions, onSay);
    }
    this.movePeaceful(dt, sessions);
  }
  handleOneSecondEvents(now, sessions, activeDuels, flowers, onSay, onSurpriseHit, onPlantFlower) {
    if (now - this.lastPlantTime >= 4e4 && flowers.size < 8) {
      if (Math.random() < 0.05) {
        this.lastPlantTime = now;
        onSay("\u0418 \u0442\u0430\u043A \u0441\u043E\u0439\u0434\u0451\u0442");
        onPlantFlower(Math.round(this.x), Math.round(this.y));
      }
    }
    if (activeDuels.size > 0 && Math.random() < 0.1) {
      for (const [dId, duel] of activeDuels.entries()) {
        const p1 = duel.hunters[0];
        const s1 = [...sessions.values()].find((s) => s.id === p1?.id);
        if (s1 && Math.hypot(s1.x - this.x, s1.y - this.y) <= 1e3) {
          const hasNPC = duel.hunters.some((h) => h.isBoss || h.isFlower) || duel.allies.some((a) => a.isBoss || a.isFlower);
          this.state = "rush_combat";
          this.rushTargetDuelId = dId;
          this.rushSide = hasNPC ? "npc" : "random";
          onSay(hasNPC ? "\u041D\u0430\u0448\u0438\u0445 \u0431\u044C\u044E\u0442!" : "\u0421\u041F\u0410\u0420\u0422\u0410\u0410\u0410");
          return;
        }
      }
    }
    const playersIn10m = [];
    for (const s of sessions.values()) {
      if (s.stats.classId && Math.hypot(s.x - this.x, s.y - this.y) <= 200) {
        playersIn10m.push(s);
      }
    }
    if (playersIn10m.length > 0 && Math.random() < 0.05) {
      const lucky = playersIn10m[Math.floor(Math.random() * playersIn10m.length)];
      lucky.dismoraleUntil = now + 6e4;
      const quote = DISMORALE_QUOTES[Math.floor(Math.random() * DISMORALE_QUOTES.length)];
      onSay(quote);
    }
    if (this.state === "chase" && this.targetPlayerId) {
      const target = [...sessions.values()].find((s) => s.id === this.targetPlayerId);
      if (target && Math.hypot(target.x - this.x, target.y - this.y) <= 80) {
        if (Math.random() < 0.05) {
          onSay("\u0423 \u043C\u0435\u043D\u044F \u0434\u043B\u044F \u0442\u0435\u0431\u044F \u0441\u044E\u0440\u043F\u0440\u0438\u0437");
          const dmg = Math.max(2, Math.round((Math.random() * (this.maxAtk - this.minAtk) + this.minAtk) * 0.5));
          onSurpriseHit(target, dmg);
          this.state = "flee";
          this.fleeUntil = now + 4500;
          this.dirX = -(target.x - this.x);
          this.dirY = -(target.y - this.y);
          const len = Math.hypot(this.dirX, this.dirY) || 1;
          this.dirX /= len;
          this.dirY /= len;
          setTimeout(() => onSay("\u0425\u0418-\u0425\u0418 \u041D\u0435 \u0434\u043E\u0433\u043E\u043D\u0438\u0448\u044C!"), 500);
        }
      }
    }
  }
  makeBehaviorChoice(sessions, onSay) {
    let nearest = null;
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
      onSay("\u0410 \u044F \u0441 \u0442\u043E\u0431\u043E\u0439!");
      return;
    }
    const roll = Math.random();
    if (roll < 0.2) {
      const quote = SIMPLE_QUOTES[Math.floor(Math.random() * SIMPLE_QUOTES.length)];
      onSay(quote);
      if (quote === "\u0410 \u043D\u0430\u0441 \u0440\u0430\u0442\u044C!") {
        this.state = "flee";
        this.fleeUntil = Date.now() + 4e3;
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
  movePeaceful(dt, sessions) {
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
        this.dirX = dx / dist * sign;
        this.dirY = dy / dist * sign;
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
  updateCombat(dt, sessions, activeDuels, onSay, onDuelUpdate, onDuelEnd) {
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
    const currentAtkSpeed = isSpeedBuffed ? this.attackInterval / 1.5 : this.attackInterval;
    if (now >= this.nextAttackTime) {
      this.nextAttackTime = now + currentAtkSpeed * 1e3;
      const mySide = duel.allies.some((a) => a.id === this.id) ? duel.allies : duel.hunters;
      const enemySide = mySide === duel.allies ? duel.hunters : duel.allies;
      const livingEnemies = enemySide.filter((e) => e.hp > 0);
      if (livingEnemies.length === 0) {
        onDuelEnd(duel, "\u0414\u0430\u0440 \u0438 \u0435\u0451 \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0438");
        return;
      }
      if (this.cdLove <= 0 && Math.random() < 0.35) {
        this.cdLove = 20;
        this.loveBuffUntil = now + 1e4;
        onSay("\u041B\u044E\u0431\u043E\u0444\u044C \u0441\u043F\u0430\u0441\u0451\u0442 \u043C\u0438\u0440!");
        const log2 = `<span style="color:#34d399; font-weight:bold;">\u0414\u0430\u0440 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043B\u0430 \xAB\u0412\u0441\u0435\u043B\u0435\u043D\u0441\u043A\u0443\u044E \u043B\u044E\u0431\u043E\u0432\u044C\xBB!</span> \u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0430\u0442\u0430\u043A \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0443\u0432\u0435\u043B\u0438\u0447\u0435\u043D\u0430 \u0432 1.5 \u0440\u0430\u0437\u0430 \u043D\u0430 10 \u0441\u0435\u043A!`;
        onDuelUpdate(duel, log2);
        return;
      }
      if (this.cdHouse <= 0 && Math.random() < 0.35) {
        this.cdHouse = 24;
        onSay("\u042F \u0432 \u0434\u043E\u043C\u0438\u043A\u0435!");
        const livingAllies = mySide.filter((a) => a.hp > 0);
        const shieldPct = (10 + Math.random() * 90) / 100;
        const totalShield = Math.round(this.hp * shieldPct);
        const perAlly = Math.max(10, Math.round(totalShield / livingAllies.length));
        livingAllies.forEach((a) => {
          a.shield = (a.shield || 0) + perAlly;
        });
        const log2 = `<span style="color:#38bdf8; font-weight:bold;">\u0414\u0430\u0440: \xAB\u042F \u0432 \u0434\u043E\u043C\u0438\u043A\u0435!\xBB</span> \u041E\u0431\u0449\u0438\u0439 \u0449\u0438\u0442 <b style="color:#38bdf8">+${totalShield}</b> \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u043F\u043E\u0440\u043E\u0432\u043D\u0443 (+${perAlly} \u043A\u0430\u0436\u0434\u043E\u043C\u0443)!`;
        onDuelUpdate(duel, log2);
        return;
      }
      const isHorror = this.cdHorror <= 0 && Math.random() < 0.4;
      const hitsCount = isHorror ? 2 : 1;
      if (isHorror) {
        this.cdHorror = 15;
        onSay("\u042F \u0443\u0436\u0430\u0441 \u043B\u0435\u0442\u044F\u0449\u0438\u0439 \u043D\u0430 \u043A\u0440\u044B\u043B\u044C\u044F\u0445 \u043D\u043E\u0447\u0438!");
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
      let log = isHorror ? `<span style="color:#34d399">\u0414\u0430\u0440</span> \u043E\u0431\u0440\u0443\u0448\u0438\u043B\u0430 <i>\u0434\u0432\u043E\u0439\u043D\u043E\u0439 \u0443\u0434\u0430\u0440 \u043A\u0440\u044B\u043B\u044C\u044F\u043C\u0438</i> \u043F\u043E <b>${target.username}</b> \u043D\u0430 <span style="color:#ef4444">${totalDmgDone}</span> \u0443\u0440\u043E\u043D\u0430!` : `<span style="color:#34d399">\u0414\u0430\u0440</span> \u0430\u0442\u0430\u043A\u043E\u0432\u0430\u043B\u0430 <b>${target.username}</b> \u043D\u0430 <span style="color:#ef4444">${totalDmgDone}</span> \u0443\u0440\u043E\u043D\u0430!`;
      if (shieldAbsorbed > 0) {
        log += ` <span style="color:#38bdf8; font-weight:bold;">[\u{1F6E1}\uFE0F \u0429\u0438\u0442 \u043F\u043E\u0433\u043B\u043E\u0442\u0438\u043B: ${shieldAbsorbed}]</span>`;
      }
      if (target.hp <= 0) {
        log += `<br><b>${target.username}</b> \u043F\u043E\u0432\u0435\u0440\u0436\u0435\u043D!`;
        if (targetSession) {
          targetSession.inDuel = false;
          targetSession.stats.hp = targetSession.stats.maxHp;
          targetSession.rejoinBlockedUntil = now + 3e4;
        }
      }
      onDuelUpdate(duel, log);
      const aliveLeft = enemySide.filter((e) => e.hp > 0).length;
      if (aliveLeft === 0) {
        onDuelEnd(duel, "\u0414\u0430\u0440 \u0438 \u0435\u0451 \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0438");
      }
    }
  }
};

// room.ts
function getFlowerName(flower) {
  switch (flower.flowerType) {
    case "fire":
      return "\u041E\u0433\u043D\u0435\u043D\u043D\u044B\u0439 \u0442\u044E\u043B\u044C\u043F\u0430\u043D";
    case "frost":
      return "\u041C\u043E\u0440\u043E\u0437\u043D\u044B\u0439 \u0442\u044E\u043B\u044C\u043F\u0430\u043D";
    case "hell":
      return "\u0410\u0434\u0441\u043A\u0438\u0439 \u0442\u044E\u043B\u044C\u043F\u0430\u043D";
    default:
      return "\u0422\u044E\u043B\u044C\u043F\u0430\u043D-\u0432\u0430\u043C\u043F\u0438\u0440";
  }
}
__name(getFlowerName, "getFlowerName");
var GameRoom = class extends DurableObject {
  static {
    __name(this, "GameRoom");
  }
  sessions;
  activeDuels;
  boss;
  dar;
  flowers;
  lastTick = Date.now();
  lastHealTick = Date.now();
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = /* @__PURE__ */ new Map();
    this.activeDuels = /* @__PURE__ */ new Map();
    this.boss = new KeytBoss();
    this.dar = new DarBoss();
    this.flowers = /* @__PURE__ */ new Map();
    setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTick) / 1e3;
      this.lastTick = now;
      if (now - this.lastHealTick >= 1e3) {
        this.lastHealTick = now;
        let anyHealed = false;
        for (const s of this.sessions.values()) {
          if (s.stats.classId && !s.inDuel) {
            const dist = Math.hypot(s.x - 565, s.y - 600);
            if (dist <= 80 && s.stats.hp < s.stats.maxHp) {
              s.stats.hp = Math.min(s.stats.maxHp, s.stats.hp + 1);
              anyHealed = true;
            }
          }
        }
        if (anyHealed) {
          this.broadcast();
        }
      }
      this.boss.update(
        dt,
        this.sessions,
        this.activeDuels,
        (targetSession, ws) => this.startBossBattle(targetSession, ws),
        (duel, log) => this.broadcastDuelUpdate(duel, log),
        (duel, winner) => this.endBossBattle(duel, winner),
        (quote) => this.broadcastBossSay(quote),
        (duel, action) => {
          const hasDar = duel.hunters.some((h) => h.id === "boss_dar") || duel.allies.some((a) => a.id === "boss_dar");
          if (hasDar) {
            const darSide = duel.allies.some((a) => a.id === "boss_dar") ? duel.allies : duel.hunters;
            const playerSide = darSide === duel.allies ? duel.hunters : duel.allies;
            playerSide.push({
              id: this.boss.id,
              username: this.boss.name,
              classId: "boss",
              hp: this.boss.hp,
              maxHp: this.boss.maxHp,
              armor: this.boss.armor,
              isBoss: true
            });
            this.boss.inDuel = true;
            this.boss.duelId = duel.id;
            this.boss.state = "combat";
            this.boss.recalcPassives(duel);
            this.broadcastDuelUpdate(duel, `<span style="color:#f472b6; font-weight:bold;">\u041A\u0435\u0439\u0442: \xAB\u042F \u0441 \u0432\u0430\u043C\u0438 \u043F\u0440\u043E\u0442\u0438\u0432 \u044D\u0442\u043E\u0439 \u043A\u043E\u0437\u044F\u0432\u043A\u0438!\xBB</span> \u2014 \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u043B\u0430\u0441\u044C \u043A \u0438\u0433\u0440\u043E\u043A\u0430\u043C!`);
            return;
          }
          this.handleBossIntervention(duel, action);
        }
      );
      this.dar.update(
        dt,
        this.sessions,
        this.activeDuels,
        this.flowers,
        (quote) => this.broadcastDarSay(quote),
        (targetSession, dmg) => this.triggerDarSurpriseHit(targetSession, dmg),
        (duel, side, yell) => {
          const p = {
            id: this.dar.id,
            username: this.dar.name,
            classId: "boss_dar",
            hp: this.dar.hp,
            maxHp: this.dar.maxHp,
            armor: this.dar.armor,
            isBoss: true
          };
          duel[side].push(p);
          this.broadcastDuelUpdate(duel, yell);
        },
        (duel, log) => this.broadcastDuelUpdate(duel, log),
        (duel, winner) => this.endBossBattle(duel, winner),
        (x, y) => this.plantFlower(x, y),
        (flower) => this.waterFlower(flower)
      );
      this.updateFlowers(dt, now);
      for (const flower of this.flowers.values()) {
        if (flower.inDuel && flower.duelId) {
          const duel = this.activeDuels.get(flower.duelId);
          if (!duel) {
            flower.inDuel = false;
            flower.duelId = void 0;
            continue;
          }
          if (!flower.nextActionTime) flower.nextActionTime = now + 3e3;
          if (now >= flower.nextActionTime) {
            flower.nextActionTime = now + 3500;
            const mySide = duel.allies.some((a) => a.id === flower.id) ? duel.allies : duel.hunters;
            const enemySide = mySide === duel.allies ? duel.hunters : duel.allies;
            const livingEnemies = enemySide.filter((e) => e.hp > 0);
            if (livingEnemies.length === 0) continue;
            const target = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
            const targetSession = [...this.sessions.values()].find((s) => s.id === target.id);
            const baseAtk = flower.stats.atk || 15;
            const ignoreArmor = flower.flowerType === "hell";
            const reduction = ignoreArmor ? 0 : calcArmorReduction(target.armor);
            const dmg = Math.max(1, Math.round(baseAtk * (1 - reduction)));
            let log = `\u{1F338} <b>${getFlowerName(flower)}</b> \u0430\u0442\u0430\u043A\u043E\u0432\u0430\u043B <b>${target.username}</b> \u043D\u0430 <span style="color:#ef4444">${dmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
            if (flower.flowerType === "fire") {
              target.burnTicks = 10;
              target.burnDmg = 10;
              target.armor = Math.max(0, Math.round(target.armor * 0.9));
              log = `\u{1F525} <b>${getFlowerName(flower)}</b> \u043E\u043F\u0430\u043B\u0438\u043B <b>${target.username}</b> \u043D\u0430 <span style="color:#f97316">${dmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
            } else if (flower.flowerType === "frost") {
              target.frostUntil = now + 8e3;
              log = `\u2744\uFE0F <b>${getFlowerName(flower)}</b> \u0437\u0430\u043C\u043E\u0440\u043E\u0437\u0438\u043B <b>${target.username}</b> \u043D\u0430 <span style="color:#38bdf8">${dmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
            } else if (flower.flowerType === "hell") {
              log = `\u{1F30C} <b>${getFlowerName(flower)}</b> \u043F\u0440\u043E\u0432\u0451\u043B \u0442\u0451\u043C\u043D\u044B\u0439 \u0443\u0434\u0430\u0440 \u0441\u043A\u0432\u043E\u0437\u044C \u0431\u0440\u043E\u043D\u044E <b>${target.username}</b> \u043D\u0430 <span style="color:#c084fc">${dmg}</span> \u0443\u0440\u043E\u043D\u0430!`;
            }
            target.hp = Math.max(0, target.hp - dmg);
            if (targetSession) targetSession.stats.hp = target.hp;
            if (target.hp <= 0) {
              log += `<br><b>${target.username}</b> \u043F\u043E\u0432\u0435\u0440\u0436\u0435\u043D \u0446\u0432\u0435\u0442\u043A\u043E\u043C!`;
              if (targetSession) {
                targetSession.inDuel = false;
                targetSession.stats.hp = targetSession.stats.maxHp;
                targetSession.rejoinBlockedUntil = now + 3e4;
              }
            }
            this.broadcastDuelUpdate(duel, log);
            const aliveLeft = enemySide.filter((e) => e.hp > 0).length;
            if (aliveLeft === 0) {
              this.endBossBattle(duel, `${getFlowerName(flower)} \u0438 \u0441\u043E\u044E\u0437\u043D\u0438\u043A\u0438`);
            }
          }
        }
      }
      this.broadcast();
    }, 100);
  }
  plantFlower(x, y) {
    if (this.flowers.size >= 22) return;
    const fId = "flower_" + crypto.randomUUID();
    const flower = {
      id: fId,
      x: Math.max(40, Math.min(1160, x)),
      y: Math.max(40, Math.min(1160, y)),
      stage: "bud",
      flowerType: "normal",
      plantedAt: Date.now(),
      stats: { hp: 10, maxHp: 10, armor: 0, atk: 0 },
      fearDistance: Math.round(180 + Math.random() * 180),
      inDuel: false
    };
    this.flowers.set(fId, flower);
  }
  waterFlower(flower) {
    const randHp = Math.floor(Math.random() * (40 - 5 + 1)) + 5;
    const randAtk = Math.floor(Math.random() * (10 - 1 + 1)) + 1;
    const randDef = Math.floor(Math.random() * (4 - 1 + 1)) + 1;
    let fType = "normal";
    const roll = Math.random();
    if (roll < 0.5) {
      fType = "fire";
    } else if (roll < 0.8) {
      fType = "frost";
    } else if (roll < 0.9) {
      fType = "hell";
    } else {
      fType = "normal";
    }
    flower.stage = "active";
    flower.flowerType = fType;
    flower.stats = {
      hp: randHp,
      maxHp: randHp,
      atk: randAtk,
      armor: randDef
    };
  }
  updateFlowers(dt, now) {
    const ALTAR_X = 565;
    const ALTAR_Y = 600;
    for (const flower of this.flowers.values()) {
      if (flower.stage === "bud") {
        if (now - flower.plantedAt >= 9e5) {
          flower.stage = "mature";
        }
        continue;
      }
      if (flower.stage === "mature") {
        continue;
      }
      if (flower.stage === "active") {
        if (flower.inDuel) {
          if (flower.duelId && !this.activeDuels.has(flower.duelId)) {
            flower.inDuel = false;
            flower.duelId = void 0;
          }
          continue;
        }
        const distToAltar = Math.hypot(flower.x - ALTAR_X, flower.y - ALTAR_Y);
        if (distToAltar < flower.fearDistance) {
          const awayX = flower.x - ALTAR_X || Math.random() - 0.5;
          const awayY = flower.y - ALTAR_Y || Math.random() - 0.5;
          const awayLen = Math.hypot(awayX, awayY) || 1;
          flower.dirX = awayX / awayLen;
          flower.dirY = awayY / awayLen;
          flower.x += flower.dirX * 120 * dt;
          flower.y += flower.dirY * 120 * dt;
          this.clampEntity(flower);
          if (!flower.nextScreamTime || now >= flower.nextScreamTime) {
            flower.nextScreamTime = now + (1e4 + Math.random() * 8e3);
            this.broadcastFlowerSay(flower.id, getFlowerName(flower), "\u0420\u0420\u0420\u0420");
          }
          continue;
        }
        let helped = false;
        for (const duel of this.activeDuels.values()) {
          const hasDar = duel.hunters.some((h) => h.id === this.dar.id) || duel.allies.some((a) => a.id === this.dar.id);
          const hasOtherFlower = duel.hunters.some((h) => h.isFlower) || duel.allies.some((a) => a.isFlower);
          if (hasDar || hasOtherFlower) {
            let inRange = false;
            for (const p of [...duel.hunters, ...duel.allies]) {
              const s = [...this.sessions.values()].find((sess) => sess.id === p.id);
              if (s && Math.hypot(s.x - flower.x, s.y - flower.y) <= 200) {
                inRange = true;
                break;
              }
            }
            if (!inRange && Math.hypot(this.dar.x - flower.x, this.dar.y - flower.y) <= 200) {
              inRange = true;
            }
            if (inRange) {
              const isDarOrFlowerInAllies = duel.allies.some((a) => a.id === this.dar.id || a.isFlower);
              const side = isDarOrFlowerInAllies ? "allies" : "hunters";
              this.addFlowerToDuel(flower, duel, side);
              helped = true;
              break;
            }
          }
        }
        if (helped) continue;
        let targetSession = null;
        let targetWs = null;
        let minDist = 60;
        for (const [ws, s] of this.sessions.entries()) {
          if (s.stats.classId && !s.inDuel && (!s.escapedUntil || now >= s.escapedUntil) && (!s.rejoinBlockedUntil || now >= s.rejoinBlockedUntil)) {
            const d = Math.hypot(s.x - flower.x, s.y - flower.y);
            if (d <= minDist) {
              minDist = d;
              targetSession = s;
              targetWs = ws;
            }
          }
        }
        if (targetSession && targetWs) {
          const pdx = targetSession.x - flower.x;
          const pdy = targetSession.y - flower.y;
          const pDist = Math.hypot(pdx, pdy) || 1;
          if (pDist > 35) {
            flower.dirX = pdx / pDist;
            flower.dirY = pdy / pDist;
            flower.x += flower.dirX * 135 * dt;
            flower.y += flower.dirY * 135 * dt;
            this.clampEntity(flower);
          } else {
            this.startFlowerBattle(targetSession, targetWs, flower);
          }
          continue;
        }
        if (!flower.wanderTargetX || now >= (flower.nextWanderTime || 0)) {
          flower.nextWanderTime = now + (3500 + Math.random() * 4e3);
          flower.wanderTargetX = Math.max(40, Math.min(1160, flower.x + (Math.random() * 200 - 100)));
          flower.wanderTargetY = Math.max(40, Math.min(1160, flower.y + (Math.random() * 200 - 100)));
        }
        const wdx = (flower.wanderTargetX || flower.x) - flower.x;
        const wdy = (flower.wanderTargetY || flower.y) - flower.y;
        const wDist = Math.hypot(wdx, wdy);
        if (wDist > 8) {
          flower.dirX = wdx / wDist;
          flower.dirY = wdy / wDist;
          flower.x += flower.dirX * 55 * dt;
          flower.y += flower.dirY * 55 * dt;
          this.clampEntity(flower);
        }
      }
    }
  }
  addFlowerToDuel(flower, duel, side) {
    flower.inDuel = true;
    flower.duelId = duel.id;
    const p = {
      id: flower.id,
      username: getFlowerName(flower),
      classId: "flower_" + flower.flowerType,
      hp: flower.stats.hp,
      maxHp: flower.stats.maxHp,
      armor: flower.stats.armor,
      attack: flower.stats.atk,
      isBoss: true,
      isFlower: true,
      flowerType: flower.flowerType
    };
    duel[side].push(p);
    this.broadcastDuelUpdate(duel, `\u{1F338} <b>${p.username}</b> \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u043B\u0441\u044F \u043A \u0441\u0440\u0430\u0436\u0435\u043D\u0438\u044E!`);
  }
  startFlowerBattle(initialPlayer, initialWs, flower) {
    if (!initialPlayer.stats.classId) return;
    const duelId = "flower_duel_" + crypto.randomUUID();
    initialPlayer.inDuel = true;
    initialPlayer.duelId = duelId;
    flower.inDuel = true;
    flower.duelId = duelId;
    const p1Data = {
      id: initialPlayer.id,
      username: initialPlayer.username,
      classId: initialPlayer.stats.classId,
      hp: initialPlayer.stats.hp,
      maxHp: initialPlayer.stats.maxHp,
      armor: initialPlayer.stats.armor,
      ws: initialWs
    };
    const p2Data = {
      id: flower.id,
      username: getFlowerName(flower),
      classId: "flower_" + flower.flowerType,
      hp: flower.stats.hp,
      maxHp: flower.stats.maxHp,
      armor: flower.stats.armor,
      attack: flower.stats.atk,
      isBoss: true,
      isFlower: true,
      flowerType: flower.flowerType
    };
    const duelState = {
      id: duelId,
      isBossFight: true,
      hunters: [p1Data],
      allies: [p2Data],
      p1: p1Data,
      p2: p2Data
    };
    this.activeDuels.set(duelId, duelState);
    const payload = JSON.stringify({
      type: "duel_start",
      isBossFight: true,
      duel: {
        id: duelId,
        isBossFight: true,
        p1: { id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp, armor: p1Data.armor },
        p2: { id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, armor: p2Data.armor, isBoss: true },
        hunters: [{ id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp }],
        allies: [{ id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, isBoss: true }]
      }
    });
    initialWs.send(payload);
    this.broadcast();
  }
  clampEntity(ent) {
    ent.x = Math.max(40, Math.min(1160, ent.x));
    ent.y = Math.max(40, Math.min(1160, ent.y));
  }
  broadcastBossSay(text) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: "boss_keyt",
      username: "\u041A\u0435\u0439\u0442",
      text
    });
    for (const ws of [...this.sessions.keys()]) {
      try {
        ws.send(payload);
      } catch (_) {
        this.sessions.delete(ws);
      }
    }
  }
  broadcastDarSay(text) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: "boss_dar",
      username: "\u0414\u0430\u0440",
      text
    });
    for (const ws of [...this.sessions.keys()]) {
      try {
        ws.send(payload);
      } catch (_) {
        this.sessions.delete(ws);
      }
    }
  }
  broadcastFlowerSay(flowerId, name, text) {
    const payload = JSON.stringify({
      type: "chat_bubble",
      playerId: flowerId,
      username: name,
      text
    });
    for (const ws of [...this.sessions.keys()]) {
      try {
        ws.send(payload);
      } catch (_) {
        this.sessions.delete(ws);
      }
    }
  }
  triggerDarSurpriseHit(targetSession, dmg) {
    targetSession.stats.hp = Math.max(1, targetSession.stats.hp - dmg);
    const payload = JSON.stringify({
      type: "dar_surprise_hit",
      targetId: targetSession.id,
      damage: dmg,
      hp: targetSession.stats.hp,
      maxHp: targetSession.stats.maxHp
    });
    for (const ws of [...this.sessions.keys()]) {
      try {
        ws.send(payload);
      } catch (_) {
      }
    }
    this.broadcast();
  }
  handleBossIntervention(duel, action) {
    if (action === "join") {
      duel.isBossFight = true;
      this.boss.inDuel = true;
      this.boss.duelId = duel.id;
      this.boss.state = "combat";
      const bossParticipant = {
        id: this.boss.id,
        username: this.boss.name,
        classId: "boss",
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        armor: this.boss.armor,
        isBoss: true
      };
      if (Math.random() < 0.5) {
        duel.allies.push(bossParticipant);
      } else {
        duel.hunters.push(bossParticipant);
      }
      this.boss.recalcPassives(duel);
      const log = `<span style="color:#f472b6; font-weight:bold;">\u041A\u0435\u0439\u0442: \xAB\u041F\u043E\u0440\u0430 \u043A\u0440\u043E\u043C\u0441\u0430\u0442\u044C!!!\xBB</span> \u2014 \u0432\u043E\u0440\u0432\u0430\u043B\u0430\u0441\u044C \u0432 \u0434\u0443\u044D\u043B\u044C!`;
      this.broadcastDuelUpdate(duel, log);
    } else if (action === "kiss") {
      const lucky = Math.random() < 0.5 ? duel.hunters[0] : duel.allies[0];
      if (lucky) {
        const healAmt = Math.round((lucky.maxHp || 100) * 0.3);
        lucky.hp = Math.min(lucky.maxHp, lucky.hp + healAmt);
        for (const s of this.sessions.values()) {
          if (s.id === lucky.id) s.stats.hp = lucky.hp;
        }
        const log = `<span style="color:#f472b6; font-weight:bold;">\u041A\u0435\u0439\u0442: \xAB\u0425\u0438-\u0445\u0438\xBB</span> \u2014 \u043F\u043E\u0446\u0435\u043B\u043E\u0432\u0430\u043B\u0430 <b>${lucky.username}</b> \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043B\u0430 <b style="color:#4ade80">+${healAmt} HP</b>!`;
        this.broadcastDuelUpdate(duel, log);
      }
    }
  }
  startBossBattle(initialPlayer, initialWs) {
    if (!initialPlayer.stats.classId) return;
    const duelId = "boss_duel_" + crypto.randomUUID();
    initialPlayer.inDuel = true;
    initialPlayer.duelId = duelId;
    this.boss.inDuel = true;
    this.boss.duelId = duelId;
    this.boss.state = "combat";
    const p1Data = {
      id: initialPlayer.id,
      username: initialPlayer.username,
      classId: initialPlayer.stats.classId,
      hp: initialPlayer.stats.hp,
      maxHp: initialPlayer.stats.maxHp,
      armor: initialPlayer.stats.armor,
      ws: initialWs
    };
    const p2Data = {
      id: this.boss.id,
      username: this.boss.name,
      classId: "boss",
      hp: this.boss.baseMaxHp,
      maxHp: this.boss.baseMaxHp,
      armor: this.boss.baseArmor,
      isBoss: true
    };
    const duelState = {
      id: duelId,
      isBossFight: true,
      hunters: [p1Data],
      allies: [p2Data],
      p1: p1Data,
      p2: p2Data
    };
    this.activeDuels.set(duelId, duelState);
    this.boss.recalcPassives(duelState);
    const payload = JSON.stringify({
      type: "duel_start",
      isBossFight: true,
      duel: {
        id: duelId,
        isBossFight: true,
        p1: { id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp, armor: p1Data.armor },
        p2: { id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, armor: p2Data.armor, isBoss: true },
        hunters: duelState.hunters.map((h) => ({ id: h.id, username: h.username, classId: h.classId, hp: h.hp, maxHp: h.maxHp, armor: h.armor })),
        allies: duelState.allies.map((a) => ({ id: a.id, username: a.username, classId: a.classId, hp: a.hp, maxHp: a.maxHp, armor: a.armor, isBoss: a.isBoss }))
      }
    });
    initialWs.send(payload);
    this.broadcast();
  }
  startDarDuel(initialPlayer, initialWs) {
    if (!initialPlayer.stats.classId) return;
    const duelId = "dar_duel_" + crypto.randomUUID();
    initialPlayer.inDuel = true;
    initialPlayer.duelId = duelId;
    this.dar.inDuel = true;
    this.dar.duelId = duelId;
    this.dar.state = "combat";
    const p1Data = {
      id: initialPlayer.id,
      username: initialPlayer.username,
      classId: initialPlayer.stats.classId,
      hp: initialPlayer.stats.hp,
      maxHp: initialPlayer.stats.maxHp,
      armor: initialPlayer.stats.armor,
      ws: initialWs
    };
    const p2Data = {
      id: this.dar.id,
      username: this.dar.name,
      classId: "boss_dar",
      hp: this.dar.hp,
      maxHp: this.dar.maxHp,
      armor: this.dar.armor,
      isBoss: true
    };
    const duelState = {
      id: duelId,
      isBossFight: true,
      hunters: [p1Data],
      allies: [p2Data],
      p1: p1Data,
      p2: p2Data
    };
    this.activeDuels.set(duelId, duelState);
    const payload = JSON.stringify({
      type: "duel_start",
      isBossFight: true,
      duel: {
        id: duelId,
        isBossFight: true,
        p1: { id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp, armor: p1Data.armor },
        p2: { id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, armor: p2Data.armor, isBoss: true },
        hunters: [{ id: p1Data.id, username: p1Data.username, classId: p1Data.classId, hp: p1Data.hp, maxHp: p1Data.maxHp }],
        allies: [{ id: p2Data.id, username: p2Data.username, classId: p2Data.classId, hp: p2Data.hp, maxHp: p2Data.maxHp, isBoss: true }]
      }
    });
    initialWs.send(payload);
    this.broadcast();
  }
  broadcastDuelUpdate(duel, log) {
    const payload = JSON.stringify({
      type: "duel_update",
      isBossFight: Boolean(duel.isBossFight),
      hunters: duel.hunters.map((h) => ({ id: h.id, username: h.username, hp: h.hp, maxHp: h.maxHp, armor: h.armor, classId: h.classId, shield: h.shield || 0 })),
      allies: duel.allies.map((a) => ({ id: a.id, username: a.username, hp: a.hp, maxHp: a.maxHp, armor: a.armor, classId: a.classId, isBoss: a.isBoss, shield: a.shield || 0 })),
      p1Hp: duel.hunters[0]?.hp || 0,
      p2Hp: duel.allies[0]?.hp || 0,
      log
    });
    for (const p of [...duel.hunters, ...duel.allies]) {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        try {
          p.ws.send(payload);
        } catch (_) {
        }
      }
    }
  }
  endBossBattle(duel, winnerName) {
    const payload = JSON.stringify({ type: "duel_end", winnerName });
    for (const p of [...duel.hunters, ...duel.allies]) {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        try {
          p.ws.send(payload);
        } catch (_) {
        }
      }
      for (const s of this.sessions.values()) {
        if (s.id === p.id) {
          s.inDuel = false;
          s.stats.hp = s.stats.maxHp;
          s.escapedUntil = Date.now() + 5e3;
        }
      }
    }
    this.activeDuels.delete(duel.id);
    if (this.boss.duelId === duel.id) {
      this.boss.inDuel = false;
      this.boss.duelId = null;
      if (this.boss.state !== "dead") {
        this.boss.state = "wander";
        this.boss.nextWanderTime = Date.now() + 3e3;
        this.boss.nextWanderSayTime = Date.now() + 4e3;
      }
      this.boss.recalcPassives(null);
    }
    if (this.dar.duelId === duel.id) {
      this.dar.inDuel = false;
      this.dar.duelId = null;
      if (this.dar.state !== "dead") {
        this.dar.state = "wander";
      }
    }
    for (const flower of this.flowers.values()) {
      if (flower.duelId === duel.id) {
        flower.inDuel = false;
        flower.duelId = void 0;
      }
    }
    this.broadcast();
  }
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("\u041E\u0436\u0438\u0434\u0430\u043B\u0441\u044F WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
          return;
        }
        const session = this.sessions.get(server);
        if (msg.type === "join") {
          const cleanName = (msg.username || "\u0421\u0442\u0440\u0430\u043D\u043D\u0438\u043A").trim();
          const lowerName = cleanName.toLowerCase();
          for (const [oldWs, s] of this.sessions.entries()) {
            if (oldWs !== server && s.username && s.username.toLowerCase() === lowerName) {
              try {
                oldWs.send(JSON.stringify({ type: "kicked", reason: "\u0412\u0445\u043E\u0434 \u0441 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438" }));
                oldWs.close(1e3, "Duplicate session");
              } catch (_) {
              }
              this.sessions.delete(oldWs);
            }
          }
          const myId = crypto.randomUUID();
          this.sessions.set(server, {
            id: myId,
            username: cleanName,
            x: msg.x || 600,
            y: msg.y || 600,
            color: "#ffffff",
            inDuel: false,
            lastActionTime: 0,
            stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 }
          });
          const classesPayload = Object.fromEntries(
            Object.values(CHARACTER_CLASSES).map((c) => {
              const skill = getSkill(c.abilityId);
              return [
                c.id,
                {
                  id: c.id,
                  name: c.name,
                  color: c.color,
                  ...c.stats,
                  ability: {
                    id: skill.id,
                    name: skill.name,
                    desc: skill.description,
                    cooldown: skill.cooldown
                  }
                }
              ];
            })
          );
          server.send(
            JSON.stringify({
              type: "welcome",
              myId,
              portals: WORLD_PORTALS,
              classes: classesPayload
            })
          );
          this.broadcast();
        }
        if (msg.type === "move" && session && !session.inDuel) {
          session.x = msg.x;
          session.y = msg.y;
          this.broadcast();
        }
        if (msg.type === "use_portal" && session && !session.inDuel) {
          const portal = WORLD_PORTALS.find((p) => p.id === msg.portalId);
          if (portal && Math.hypot(session.x - portal.x, session.y - portal.y) <= 65) {
            if (portal.id === "portal_class_select") {
              server.send(JSON.stringify({ type: "open_class_selection" }));
            } else if (portal.id === "portal_arcade") {
              server.send(JSON.stringify({ type: "open_minigames_menu", portalName: portal.name, games: MINI_GAMES }));
            }
          }
        }
        if (msg.type === "select_class" && session) {
          const c = CHARACTER_CLASSES[msg.classId];
          if (c) {
            session.color = c.color;
            session.stats = {
              classId: msg.classId,
              hp: c.stats.hp,
              maxHp: c.stats.maxHp,
              armor: c.stats.armor,
              minAtk: c.stats.minAtk,
              maxAtk: c.stats.maxAtk
            };
            server.send(JSON.stringify({ type: "class_updated", stats: session.stats, color: session.color }));
            this.broadcast();
          }
        }
        if (msg.type === "touch_flower" && session && !session.inDuel) {
          const flower = this.flowers.get(msg.flowerId);
          if (flower && flower.stage === "bud") {
            const dist = Math.hypot(session.x - flower.x, session.y - flower.y);
            if (dist <= 120) {
              session.stats.hp = Math.max(1, session.stats.hp - 1);
              const touchPayload = JSON.stringify({
                type: "flower_touched_notify",
                targetId: session.id,
                damage: 1,
                hp: session.stats.hp,
                maxHp: session.stats.maxHp
              });
              for (const ws of [...this.sessions.keys()]) {
                try {
                  ws.send(touchPayload);
                } catch (_) {
                }
              }
              this.broadcast();
            }
          }
          return;
        }
        if (msg.type === "pick_flower" && session && !session.inDuel) {
          const flower = this.flowers.get(msg.flowerId);
          if (flower && flower.stage === "mature") {
            const dist = Math.hypot(session.x - flower.x, session.y - flower.y);
            if (dist <= 120) {
              this.flowers.delete(flower.id);
              session.shield = (session.shield || 0) + 20;
              const pickPayload = JSON.stringify({
                type: "flower_picked_notify",
                playerId: session.id,
                flowerId: flower.id,
                shield: session.shield
              });
              for (const ws of [...this.sessions.keys()]) {
                try {
                  ws.send(pickPayload);
                } catch (_) {
                }
              }
              this.broadcast();
            }
          }
          return;
        }
        if (msg.type === "duel_invite" && session && session.stats.classId && !session.inDuel) {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1e3);
            server.send(JSON.stringify({ type: "toast_error", message: `\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u043B\u0435 \u0433\u0438\u0431\u0435\u043B\u0438: ${leftSec}\u0441` }));
            return;
          }
          if (msg.targetId === "boss_dar") {
            const roll = Math.random();
            if (roll < 0.2) {
              this.broadcastDarSay("\u041B\u0430\u0434\u043D\u043E \u0443\u0433\u043E\u0432\u043E\u0440\u0438\u043B");
              this.startDarDuel(session, server);
            } else {
              const declineQuotes = ["\u042F \u043F\u0430\u0446\u0438\u0444\u0438\u0441\u0442", "\u0418\u0434\u0438\u0442\u0435 \u043D\u0430\u0444\u0438\u0433"];
              this.broadcastDarSay(declineQuotes[Math.floor(Math.random() * declineQuotes.length)]);
              server.send(JSON.stringify({ type: "duel_declined_notify", targetNick: "\u0414\u0430\u0440" }));
            }
            return;
          }
          if (msg.targetId && this.flowers.has(msg.targetId)) {
            const flower = this.flowers.get(msg.targetId);
            if (flower.stage === "active" && !flower.inDuel) {
              this.startFlowerBattle(session, server, flower);
            }
            return;
          }
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId && s.stats.classId && !s.inDuel) {
              targetWs.send(JSON.stringify({ type: "duel_incoming", fromId: session.id, fromUsername: session.username }));
              break;
            }
          }
        }
        if (msg.type === "duel_decline") {
          for (const [targetWs, s] of this.sessions.entries()) {
            if (s.id === msg.targetId) {
              targetWs.send(JSON.stringify({ type: "duel_declined_notify", targetNick: session.username }));
              break;
            }
          }
        }
        if (msg.type === "duel_accept" && session && !session.inDuel) {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1e3);
            server.send(JSON.stringify({ type: "toast_error", message: `\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u043B\u0435 \u0433\u0438\u0431\u0435\u043B\u0438: ${leftSec}\u0441` }));
            return;
          }
          let opponentWs = null;
          let opponentSession = null;
          for (const [ws, s] of this.sessions.entries()) {
            if (s.id === msg.targetId && !s.inDuel) {
              opponentWs = ws;
              opponentSession = s;
              break;
            }
          }
          if (opponentWs && opponentSession) {
            const duelId = crypto.randomUUID();
            session.inDuel = true;
            session.duelId = duelId;
            opponentSession.inDuel = true;
            opponentSession.duelId = duelId;
            session.stats.hp = session.stats.maxHp;
            opponentSession.stats.hp = opponentSession.stats.maxHp;
            const p1 = { id: session.id, username: session.username, classId: session.stats.classId, hp: session.stats.hp, maxHp: session.stats.maxHp, armor: session.stats.armor };
            const p2 = { id: opponentSession.id, username: opponentSession.username, classId: opponentSession.stats.classId, hp: opponentSession.stats.hp, maxHp: opponentSession.stats.maxHp, armor: opponentSession.stats.armor };
            const duelState = {
              id: duelId,
              isBossFight: false,
              hunters: [{ ...p1, ws: server }],
              allies: [{ ...p2, ws: opponentWs }],
              p1: { ...p1, ws: server },
              p2: { ...p2, ws: opponentWs }
            };
            this.activeDuels.set(duelId, duelState);
            const payload = JSON.stringify({
              type: "duel_start",
              isBossFight: false,
              duel: {
                id: duelId,
                isBossFight: false,
                hunters: [p1],
                allies: [p2],
                p1,
                p2
              }
            });
            server.send(payload);
            opponentWs.send(payload);
            this.broadcast();
          }
        }
        if (msg.type === "join_boss_fight" && session && session.stats.classId && !session.inDuel) {
          if (session.rejoinBlockedUntil && Date.now() < session.rejoinBlockedUntil) {
            const leftSec = Math.ceil((session.rejoinBlockedUntil - Date.now()) / 1e3);
            server.send(JSON.stringify({ type: "toast_error", message: `\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u043B\u0435 \u0433\u0438\u0431\u0435\u043B\u0438: ${leftSec}\u0441` }));
            return;
          }
          const targetDuelId = this.boss.duelId || this.dar.duelId;
          const duel = targetDuelId ? this.activeDuels.get(targetDuelId) : null;
          if (duel) {
            session.inDuel = true;
            session.duelId = duel.id;
            session.stats.hp = session.stats.maxHp;
            const participant = {
              id: session.id,
              username: session.username,
              classId: session.stats.classId,
              hp: session.stats.hp,
              maxHp: session.stats.maxHp,
              armor: session.stats.armor,
              ws: server
            };
            let yellLog = "";
            if (msg.side === "kate" || msg.side === "allies") {
              duel.allies.push(participant);
              this.boss.recalcPassives(duel);
              yellLog = `<b>${session.username}</b> \u0432\u0441\u0442\u0430\u043B \u043D\u0430 \u0441\u0442\u043E\u0440\u043E\u043D\u0443 \u0437\u0430\u0449\u0438\u0442\u043D\u0438\u043A\u043E\u0432!`;
            } else {
              duel.hunters.push(participant);
              this.boss.recalcPassives(duel);
              yellLog = `<b>${session.username}</b> \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u043B\u0441\u044F \u043A \u043E\u0445\u043E\u0442\u043D\u0438\u043A\u0430\u043C!`;
            }
            const payload = JSON.stringify({
              type: "duel_start",
              isBossFight: true,
              duel: {
                id: duel.id,
                isBossFight: true,
                hunters: duel.hunters.map((h) => ({ id: h.id, username: h.username, hp: h.hp, maxHp: h.maxHp, armor: h.armor, classId: h.classId })),
                allies: duel.allies.map((a) => ({ id: a.id, username: a.username, hp: a.hp, maxHp: a.maxHp, armor: a.armor, classId: a.classId, isBoss: a.isBoss })),
                p1: duel.p1,
                p2: duel.p2
              }
            });
            server.send(payload);
            this.broadcastDuelUpdate(duel, yellLog);
            this.broadcast();
          }
        }
        if (msg.type === "duel_action" && session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (!duel) return;
          const now = Date.now();
          if (msg.action === "escape") {
            const { logText: logText2 } = processCombatAction("escape", 1, session, duel, this.boss, msg.targetId);
            this.broadcastDuelUpdate(duel, logText2);
            const hasDar = duel.hunters.some((h) => h.id === this.dar.id) || duel.allies.some((a) => a.id === this.dar.id);
            if (hasDar) {
              this.dar.onPlayerEscaped((q) => this.broadcastDarSay(q));
            } else if (duel.isBossFight) {
              this.broadcastBossSay("\u0423\u0431\u0435\u0436\u0430\u043B(");
            }
            if (!duel.isBossFight) {
              const isP1 = duel.p1.id === session.id;
              const otherParticipant = isP1 ? duel.p2 : duel.p1;
              const otherSession = [...this.sessions.values()].find((s) => s.id === otherParticipant.id);
              session.inDuel = false;
              if (otherSession) {
                otherSession.inDuel = false;
                otherSession.stats.hp = otherSession.stats.maxHp;
              }
              const endPayload = JSON.stringify({ type: "duel_end", winnerName: otherParticipant.username });
              if (duel.p1.ws) duel.p1.ws.send(endPayload);
              if (duel.p2.ws) duel.p2.ws.send(endPayload);
              this.activeDuels.delete(duel.id);
              this.boss.onPlayerDuelFinished(otherParticipant.username, (q) => this.broadcastBossSay(q));
            } else {
              duel.hunters = duel.hunters.filter((h) => h.id !== session.id);
              duel.allies = duel.allies.filter((a) => a.id !== session.id);
              this.boss.recalcPassives(duel);
              if (duel.hunters.length === 0) {
                this.endBossBattle(duel, "\u0417\u0430\u0449\u0438\u0442\u043D\u0438\u043A\u0438");
              }
            }
            this.broadcast();
            return;
          }
          if (now - session.lastActionTime < 1900) return;
          session.lastActionTime = now;
          const { logText, isDead, target } = processCombatAction(
            msg.action,
            msg.chargeMult,
            session,
            duel,
            this.boss,
            msg.targetId
          );
          this.broadcastDuelUpdate(duel, logText);
          if (isDead && target) {
            let targetSession = null;
            let targetWs = null;
            for (const [ws, s] of this.sessions.entries()) {
              if (s.id === target.id) {
                targetSession = s;
                targetWs = ws;
                break;
              }
            }
            if (targetSession) {
              targetSession.inDuel = false;
              targetSession.stats.hp = targetSession.stats.maxHp;
              targetSession.rejoinBlockedUntil = Date.now() + 3e4;
            }
            if (targetWs) {
              try {
                targetWs.send(JSON.stringify({ type: "combat_death", lockDuration: 30, winnerName: session.username }));
              } catch (_) {
              }
            }
            if (!duel.isBossFight) {
              session.inDuel = false;
              session.stats.hp = session.stats.maxHp;
              const endPayload = JSON.stringify({ type: "duel_end", winnerName: session.username });
              if (duel.p1.ws) duel.p1.ws.send(endPayload);
              if (duel.p2.ws) duel.p2.ws.send(endPayload);
              this.activeDuels.delete(duel.id);
              this.boss.onPlayerDuelFinished(session.username, (q) => this.broadcastBossSay(q));
            } else {
              if (target.id === this.boss.id) {
                this.boss.state = "dead";
                this.boss.deathTime = Date.now();
                this.endBossBattle(duel, "\u041E\u0445\u043E\u0442\u043D\u0438\u043A\u0438");
              } else if (target.id === this.dar.id) {
                this.dar.state = "dead";
                this.dar.deathTime = Date.now();
                this.endBossBattle(duel, "\u041E\u0445\u043E\u0442\u043D\u0438\u043A\u0438");
              } else if (target.isFlower) {
                this.flowers.delete(target.id);
                this.broadcastDarSay("\u0412\u044B \u043C\u043E\u0438 \u0443\u043C\u043D\u0438\u0447\u043A\u0438!");
                duel.hunters = duel.hunters.filter((h) => h.id !== target.id);
                duel.allies = duel.allies.filter((a) => a.id !== target.id);
                if (duel.allies.length === 0 || duel.hunters.length === 0) {
                  this.endBossBattle(duel, "\u041F\u043E\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u0438");
                }
              } else {
                duel.hunters = duel.hunters.filter((h) => h.id !== target.id);
                duel.allies = duel.allies.filter((a) => a.id !== target.id);
                this.boss.recalcPassives(duel);
                if (duel.hunters.length === 0) {
                  this.endBossBattle(duel, "\u0417\u0430\u0449\u0438\u0442\u043D\u0438\u043A\u0438");
                }
              }
            }
            this.broadcast();
          }
        }
        if (msg.type === "chat" && session && msg.text) {
          const cleanText = String(msg.text).trim().slice(0, 45);
          if (cleanText.length > 0) {
            const chatPayload = JSON.stringify({
              type: "chat_bubble",
              playerId: session.id,
              username: session.username,
              text: cleanText
            });
            for (const ws of [...this.sessions.keys()]) {
              try {
                ws.send(chatPayload);
              } catch (_) {
                this.sessions.delete(ws);
              }
            }
          }
        }
      } catch (err) {
        console.error("\u041E\u0448\u0438\u0431\u043A\u0430:", err);
      }
    });
    const closeHandler = /* @__PURE__ */ __name(() => {
      try {
        const session = this.sessions.get(server);
        if (session && session.inDuel && session.duelId) {
          const duel = this.activeDuels.get(session.duelId);
          if (duel) {
            if (!duel.isBossFight) {
              const isP1 = duel.p1.id === session.id;
              const remainingPart = isP1 ? duel.p2 : duel.p1;
              const remSession = [...this.sessions.values()].find((s) => s.id === remainingPart.id);
              if (remSession) {
                remSession.inDuel = false;
                remSession.stats.hp = remSession.stats.maxHp;
              }
              const endPayload = JSON.stringify({ type: "duel_end", winnerName: "\u041F\u0440\u043E\u0442\u0438\u0432\u043D\u0438\u043A \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u043B\u0441\u044F" });
              if (remainingPart.ws) {
                try {
                  remainingPart.ws.send(endPayload);
                } catch (_) {
                }
              }
            }
            this.activeDuels.delete(session.duelId);
          }
        }
        this.sessions.delete(server);
        this.broadcast();
      } catch (_) {
      }
    }, "closeHandler");
    server.addEventListener("close", closeHandler);
    server.addEventListener("error", closeHandler);
    return new Response(null, { status: 101, webSocket: client });
  }
  broadcast() {
    try {
      const uniquePlayers = /* @__PURE__ */ new Map();
      for (const [_, s] of this.sessions.entries()) {
        if (s && s.username) {
          uniquePlayers.set(s.username.toLowerCase(), {
            id: s.id,
            username: s.username,
            x: s.x,
            y: s.y,
            color: s.color || "#ffffff",
            inDuel: Boolean(s.inDuel),
            escapedUntil: s.escapedUntil || 0,
            rejoinBlockedUntil: s.rejoinBlockedUntil || 0,
            dismoraleUntil: s.dismoraleUntil || 0,
            shield: s.shield || 0,
            stats: s.stats
          });
        }
      }
      const payload = JSON.stringify({
        type: "players_state",
        players: Array.from(uniquePlayers.values()),
        boss: this.boss.getState(),
        dar: this.dar.getState(),
        flowers: Array.from(this.flowers.values())
      });
      for (const ws of [...this.sessions.keys()]) {
        try {
          ws.send(payload);
        } catch (_) {
          this.sessions.delete(ws);
        }
      }
    } catch (err) {
      console.error("\u041E\u0448\u0438\u0431\u043A\u0430 \u0432 broadcast:", err);
    }
  }
};

// index.ts
var index_default = {
  async fetch(request, env) {
    try {
      const roomId = env.GAME_ROOM.idFromName("alkazak_v3");
      const room = env.GAME_ROOM.get(roomId);
      return await room.fetch(request);
    } catch (err) {
      return new Response("\u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430", { status: 500 });
    }
  }
};
export {
  GameRoom,
  index_default as default
};
//# sourceMappingURL=index.js.map
