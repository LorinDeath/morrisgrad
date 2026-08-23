const DEFAULT_ITEM_POOL = [
  { name: 'Меч Теней', slot: 'weapon', baseAtk: 10, baseDef: 0, baseHp: 20, baseAspd: 5, pierce: 2 },
  { name: 'Теневой Доспех', slot: 'armor', baseAtk: 0, baseDef: 8, baseHp: 50, baseAspd: 0, pierce: 0 },
  { name: 'Амулет Пустоты', slot: 'amulet', baseAtk: 4, baseDef: 2, baseHp: 30, baseAspd: 0, pierce: 1 }
];

function isItemUsable(item) {
  if (!item) return false;
  if (player.transcendLevel >= 1 && player.heritageBypassSlot === item.slot) return true;
  return player.lvl >= (item.reqLvl || 1);
}

function setHeritageSlot(slotKey) {
  player.heritageBypassSlot = slotKey;
  saveGame(); 
  updateUI();
}

// Требования престижа для каждого слота экипировки
const SLOT_UNLOCK_PRESTIGE = {
  weapon: 0,
  armor: 0,
  helm: 1,
  boots: 1,
  amulet: 2,
  ring: 2,
  belt: 3,
  cloak: 3,
  bracers: 4,
  relic: 5
};

function isSlotUnlocked(slotKey) {
  const reqPrestige = SLOT_UNLOCK_PRESTIGE[slotKey] || 0;
  return (player.transcendLevel || 0) >= reqPrestige;
}

function calcItemReqLvl(item) {
  if (!item) return 1;
  const baseLvl = item.baseReqLvl || 1;
  const qBonus = ((item.quality || 1) - 1) * 3;
  const diffBonus = ((item.dropDiff || 1) - 1) * 2;
  
  const stars = item.stars || 0;
  let starBonus = 0;
  if (stars <= 3) {
    starBonus = stars * 1;
  } else if (stars <= 6) {
    starBonus = 3 + (stars - 3) * 2;
  } else {
    starBonus = 9 + (stars - 6) * 3;
  }

  return Math.max(1, Math.round(baseLvl + qBonus + diffBonus + starBonus));
}

function getTranscendenceMultiplier() {
  return 1 + (player.transcendLevel || 0) * 0.25;
}

function getPlayerMaxHp() {
  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) {
      let hpVal = item.hp || 0;
      if (item.runes && item.runes.includes('r_creator')) hpVal = Math.round(hpVal * 1.35);
      extra += hpVal;
    }
  }
  const trainingHp = player.trainingBonuses?.hp || 0;
  const talentMult = 1 + (player.talents.hp * 0.04);
  return Math.round((((player.baseMaxHp + extra + trainingHp) * talentMult)) * getTranscendenceMultiplier());
}

function getPlayerMaxShield() {
  return getPlayerMaxHp() * 5.0 * (1 + (player.voidPerks.overheal || 0) * 0.5);
}

function getPlayerAtk() {
  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) {
      let atkVal = item.atk || 0;
      if (item.runes && item.runes.includes('r_creator')) atkVal = Math.round(atkVal * 1.35);
      extra += atkVal;
    }
  }
  if (player.astrolabe && player.astrolabe.midas) extra += Math.floor(player.gold / 50000);
  
  const trainingAtk = player.trainingBonuses?.atk || 0;
  const talentMult = 1 + (player.talents.atk * 0.03);
  let total = (((player.baseAtk + extra + trainingAtk) * talentMult)) * getTranscendenceMultiplier();
  if (player.matrixPerks && player.matrixPerks.damage) total *= (1 + player.matrixPerks.damage * 0.08);
  if (player.activeBuffs && player.activeBuffs.frenzy > 0) total *= 1.5;
  if (combat.isPurgatory) total *= 0.7;
  return Math.round(total);
}

function getPlayerDef() {
  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) {
      let defVal = item.def || 0;
      if (item.runes && item.runes.includes('r_creator')) defVal = Math.round(defVal * 1.35);
      extra += defVal;
    }
  }
  const trainingDef = player.trainingBonuses?.def || 0;
  const talentMult = 1 + (player.talents.def * 0.04);
  return Math.round((((player.baseDef + extra + trainingDef) * talentMult)) * getTranscendenceMultiplier());
}

function getPlayerDR() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 3) return 0; // Заблокировано до Престижа 3

  const def = getPlayerDef();
  let bonusRed = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) bonusRed += (item.dmgReduction || 0);
  }
  const k = 400 + (player.lvl * 25);
  const defDR = def > 0 ? (def / (def + k)) : 0;
  return Math.min(0.80, defDR + (bonusRed / 100));
}

function getPlayerAspd() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 4) return 0; // Заблокировано до Престижа 4

  let extra = player.talents.aspd * 4;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.aspd || 0);
  }
  if (combat.hasteTimer > 0) extra += 40;
  if (player.activeBuffs && player.activeBuffs.frenzy > 0) extra += 20;
  
  const trainingAspd = player.trainingBonuses?.aspd || 0;
  return Math.round(player.baseAspd + extra + trainingAspd);
}

function getPlayerCrit() {
  let extra = player.talents.crit * 1.5;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.crit || 0);
  }
  
  const trainingCrit = ((player.transcendLevel || 0) >= 2) ? (player.trainingBonuses?.crit || 0) : 0;
  return parseFloat((player.baseCrit + extra + trainingCrit).toFixed(1));
}

function getPlayerCritDmg() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 2) return 150; // Заблокировано до Престижа 2 (базовые 150%)

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.critDmg || 0);
  }
  return Math.round(150 + extra);
}

function getPlayerVamp() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 5) return 0; // Заблокировано до Престижа 5

  let extra = player.talents.vamp * 1.0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.vamp || 0);
  }
  
  const trainingVamp = player.trainingBonuses?.vamp || 0;
  return parseFloat((player.baseVamp + extra + trainingVamp).toFixed(1));
}

function getPlayerPierce() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 3) return 0; // Заблокировано до Престижа 3

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.pierce || 0);
  }
  
  const trainingPierce = ((player.transcendLevel || 0) >= 3) ? (player.trainingBonuses?.pierce || 0) : 0;
  const talentMult = 1 + (player.talents.pierce * 0.04);
  let total = (((player.basePierce + extra + trainingPierce) * talentMult)) * getTranscendenceMultiplier();
  if (player.matrixPerks && player.matrixPerks.damage) total *= (1 + player.matrixPerks.damage * 0.08);
  return Math.round(total);
}

function getPlayerDmgReduction() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 3) return 0; // Заблокировано до Престижа 3

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.dmgReduction || 0);
  }
  return parseFloat(extra.toFixed(1));
}

function getPlayerGoldBonus() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 2) return 0; // Заблокировано до Престижа 2

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.goldBonus || 0);
  }
  return Math.round(extra + ((player.transcendLevel || 0) * 15));
}

function getPlayerExpBonus() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 3) return 0; // Заблокировано до Престижа 3

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.expBonus || 0);
  }
  return Math.round(extra + ((player.transcendLevel || 0) * 15));
}

function getPlayerRegen() {
  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.regen || 0);
  }
  return Math.round((player.baseRegen + extra) * getTranscendenceMultiplier());
}

function getPlayerCurseChance() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 3) return 0; // Заблокировано до Престижа 3

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) {
      extra += (item.curseChance || 0);
      extra += (item.baseCurseChance || 0);
    }
  }
  return parseFloat(Math.max(0, (player.lvl * 0.5) + extra).toFixed(1));
}

function getPlayerSkillPower() {
  const transLvl = player.transcendLevel || 0;
  if (transLvl < 2) return 0; // Заблокировано до Престижа 2

  let extra = 0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item)) extra += (item.skillPower || 0);
  }
  return Math.round(player.lvl + extra);
}

function getPlayerCdReduction() { return player.talents.cd * 0.07; }
function getOverchargeTalentBonus() { return 1 + (player.talents.over * 0.25); }

function getOptimalChargeSec() {
  const aspd = getPlayerAspd();
  let baseOpt = 7.0;
  for (let s in player.equipment) {
    const item = player.equipment[s];
    if (item && isItemUsable(item) && item.runes && item.runes.includes('r_chrono')) baseOpt *= 0.75;
  }
  if (aspd < 0) return baseOpt / Math.max(0.35, 1 + aspd / 100);
  return Math.max(1.0, baseOpt / (1 + aspd / 100));
}

function getOverchargeStartSec() { return getOptimalChargeSec() * 2.14; }

function getMinClickSec() {
  const aspd = getPlayerAspd();
  let baseMin = 0.45 / Math.max(0.35, 1 + aspd / 100);
  if (player.matrixPerks && player.matrixPerks.charge) baseMin *= Math.max(0.3, 1 - player.matrixPerks.charge * 0.05);
  return Math.max(0.15, baseMin);
}

function getChargeElapsedSec() {
  if (!combat.active) return 0;
  return Math.max(0, (Date.now() - combat.lastAttackTimestamp) / 1000);
}

function calculateChargeData() {
  const t = getChargeElapsedSec(), tOpt = getOptimalChargeSec(), tOverStart = getOverchargeStartSec(), tMin = getMinClickSec();
  let mult = 0.05, tier = 'low', label = '';
  if (t < tMin) {
    mult = 0.05; tier = 'low'; label = `⏳ КД (${(tMin - t).toFixed(2)}s)`;
  } else if (t < tOpt) {
    mult = 0.05 + 1.45 * Math.pow(t / tOpt, 1.6); tier = 'low'; label = `🗡 Замах: ${t.toFixed(1)}s / ${tOpt.toFixed(1)}s`;
  } else if (t < tOverStart) {
    mult = 1.50 + 0.30 * ((t - tOpt) / (tOverStart - tOpt)); tier = 'opt'; label = `⚡ ОПТИМАЛЬНО (x${mult.toFixed(2)})`;
  } else {
    mult = (1.80 + 3.40 * (1 - Math.exp(-(t - tOverStart) / 7.0))) * getOverchargeTalentBonus(); tier = 'over'; label = `🔥 СВЕРХЗАМАХ [${t.toFixed(1)}s] (x${mult.toFixed(2)})!`;
  }
  return { time: t, tOpt, tOverStart, tMin, mult, tier, label };
}

function getDiffMultiplier(diff) {
  let mults = [1.0, 2.2, 5.0, 12.0, 35.0, 100.0, 360.0];
  let base = mults[diff - 1] || 1.0;
  if (player.anomalyTier > 0) base *= Math.pow(1.5, player.anomalyTier);
  return base;
}

function getPactBonusMultiplier() {
  let b = 1.0;
  if (player.pacts.vamp) b += 0.5;
  if (player.pacts.speed) b += 0.5;
  if (player.pacts.stoneskin) b += 0.75;
  if (player.pacts.overlord) b += 1.0;
  return b;
}

function getForgeChances(item) {
  const stars = item.stars || 0;
  if (stars === 0) return { success: 100, fail: 0, break: 0 };
  if (stars === 1) return { success: 85, fail: 15, break: 0 };

  const success = Math.max(1, Math.round(100 * Math.pow(0.78, stars)));
  const brk = Math.min(65, Math.round(4 * Math.pow(1.42, stars - 2)));
  const fail = Math.max(0, 100 - success - brk);

  return { success, fail, break: brk };
}

function getForgeCost(item) {
  if (!item) return 50;
  const basePrice = item.price || 100;
  const stars = item.stars || 0;
  const cost = Math.round(basePrice * 0.35 * Math.pow(1.25, stars));
  return Math.max(30, cost);
}

function forgeItem(item, isEquippedSlot = null) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  const cost = getForgeCost(item);
  if (player.gold < cost) return alert(`Требуется: ${cost.toLocaleString()} Зл.`);
  
  const chances = getForgeChances(item);
  const stars = item.stars || 0;
  
  const msg = `⭐ Закалка предмета "${item.fullName}" [★x${stars}]\n` +
              `Стоимость: ${cost.toLocaleString()} Зл.\n\n` +
              `Шансы:\n` +
              `• Успех [★x${stars + 1}]: ${chances.success}%\n` +
              `• Неудача [-1 ★]: ${chances.fail}%\n` +
              `• Поломка [Уничтожение]: ${chances.break}%\n\n` +
              `⚠️ Внимание: Требуемый уровень предмета вырастет! Продолжить?`;
  
  if (!confirm(msg)) return;
  
  player.gold -= cost;
  const roll = Math.random() * 100;
  
  if (roll < chances.success) {
    if (typeof Sound !== 'undefined') Sound.play('overcharge');
    item.stars = stars + 1;
    ['atk','def','hp','pierce'].forEach(k => {
      if (item[k]) item[k] = Math.round(item[k] * 1.12);
    });
    ['crit','vamp','dmgReduction','curseChance','baseCurseChance','skillPower','critDmg','goldBonus','expBonus','aspd'].forEach(k => {
      if (item[k]) item[k] = parseFloat((item[k] * 1.04).toFixed(1));
    });
    if (item.regen) item.regen = Math.max(1, Math.round(item.regen * 1.1));
    item.price = Math.round(item.price * 1.15);
    item.reqLvl = calcItemReqLvl(item);
    checkMechanicQuest('forge');
    alert(`🎉 УСПЕХ! Предмет закален до [★x${item.stars}]! Требуемый уровень: Ур. ${item.reqLvl}!`);
  } else if (roll < chances.success + chances.fail) {
    if (typeof Sound !== 'undefined') Sound.play('hurt');
    if (stars > 0) {
      item.stars = Math.max(0, stars - 1);
      ['atk','def','hp','pierce'].forEach(k => {
        if (item[k]) item[k] = Math.max(1, Math.round(item[k] / 1.12));
      });
      ['crit','vamp','dmgReduction','curseChance','baseCurseChance','skillPower','critDmg','goldBonus','expBonus','aspd'].forEach(k => {
        if (item[k]) item[k] = parseFloat((item[k] / 1.04).toFixed(1));
      });
      item.price = Math.max(10, Math.round(item.price / 1.15));
      item.reqLvl = calcItemReqLvl(item);
    }
    alert(`⚠️ НЕУДАЧА! Уровень закалки сорвался до [★x${item.stars || 0}]. Требуемый уровень: Ур. ${item.reqLvl}.`);
  } else {
    if (typeof Sound !== 'undefined') Sound.play('death');
    const dustGain = (item.quality || 1) * 4 + stars * 3;
    player.synthDust = (player.synthDust || 0) + dustGain;
    
    if (isEquippedSlot) {
      player.equipment[isEquippedSlot] = null;
    } else {
      const idx = player.inventory.indexOf(item);
      if (idx !== -1) player.inventory.splice(idx, 1);
    }
    
    alert(`💥 ПОЛОМКА! Предмет уничтожен при закалке и распался на ${dustGain} Пыли Синтеза ✨!`);
  }
  
  saveGame(); 
  updateUI();
}

function changeAnomalyTier(delta) {
  if (player.lvl < 19) return alert('🔒 Калибратор аномалий открывается на 19 уровне!');
  if (typeof Sound !== 'undefined') Sound.play('click');
  player.anomalyTier = Math.max(0, player.anomalyTier + delta);
  checkMechanicQuest('anomaly');
  setSafeText('anomaly-tier-txt', player.anomalyTier);
  saveGame(); 
  updateUI();
}

function upgradeMatrixPerk(perkKey) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.darkMatter < 5) return alert('Требуется 5 Тёмной Материи ⚛️!');
  if ((player.matrixPerks[perkKey] || 0) >= 20) return alert('Максимум!');
  player.darkMatter -= 5;
  player.matrixPerks[perkKey] = (player.matrixPerks[perkKey] || 0) + 1;
  saveGame(); 
  updateUI();
}

function unlockAstrolabe(nodeKey) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  const cost = ASTROLABE_COSTS[nodeKey];
  if (player.gold < cost) return alert(`Требуется: ${cost.toLocaleString()} Зл.`);
  if (player.astrolabe[nodeKey]) return alert('Уже активировано!');
  player.gold -= cost;
  player.astrolabe[nodeKey] = true;
  checkMechanicQuest('astrolabe');
  alert(`🌟 Созвездие активировано!`);
  saveGame(); 
  updateUI();
}

function awakenSkill(skillId) {
  if (typeof Sound !== 'undefined') Sound.play('cast');
  if (player.skills[skillId].lvl < 5) return alert('Нужен 5 уровень скила!');
  if (player.darkMatter < 25 || player.gold < 500000) return alert('Нужно 25 Материи ⚛️ и 500,000 Золота 🪙!');
  player.darkMatter -= 25;
  player.gold -= 500000;
  player.awakenedSkills[skillId] = true;
  alert(`✨ Навык «${SKILLS_DB[skillId].name}» ПРОБУЖДЁН!`);
  saveGame(); 
  updateUI();
}

function getTranscendCost() {
  // Базовая стоимость первого престижа — 100,000 золота. 
  // Каждый следующий уровень умножает стоимость примерно в 2.5 раза.
  return Math.round(100000 * Math.pow(2.5, player.transcendLevel));
}

function transcendHero() {
  if (typeof Sound !== 'undefined') Sound.play('overcharge');
  const cost = getTranscendCost();
  
  // Требуемый уровень: 15 для первого престижа, далее +5 за каждый ранг
  const reqLvl = 15 + (player.transcendLevel * 5);

  if (player.gold < cost || player.lvl < reqLvl) {
    return alert(`Требуется ${reqLvl}+ Уровень и ${cost.toLocaleString()} Золота!`);
  }

  const gainSpheres = (player.transcendLevel + 2) + Math.floor((player.abyssRecord || 0) / 10);
  if (!confirm(`Возвышение Пустоты? Постоянный бонус +25% ко всем статам, +${gainSpheres} Сфер Пустоты и активация Печатей Наследия!`)) return;

  player.gold -= cost;
  player.transcendLevel++;
  player.voidSpheres += gainSpheres;
  player.lvl = 1; 
  player.exp = 0; 
  player.expNext = 100;
  player.baseMaxHp = 120; 
  player.baseAtk = 12; 
  player.baseDef = 4; 
  player.talentPoints = 0;
  for (let k in player.talents) player.talents[k] = 0;

  // Сбрасываем накопленные статы полигона, но УРОВНИ ЗДАНИЙ (trainingLevels) НЕ ТРОГАЕМ!
  player.trainingBonuses = { atk: 0, def: 0, hp: 0, crit: 0, pierce: 0, aspd: 0, vamp: 0 };
  player.trainingProgress = { atk: 0, def: 0, hp: 0, crit: 0, pierce: 0, goldTrack: 0, expTrack: 0, aspd: 0, vamp: 0 };

  checkMechanicQuest('transcend');
  alert(`🌌 ВОЗВЫШЕНИЕ УСПЕШНО! Уровни зданий полигона сохранены!`);
  saveGame(); 
  updateUI();
}

function upgradeVoidPerk(perkKey) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.voidSpheres <= 0) return alert('Нужны Сферы Пустоты 🌌!');
  if ((player.voidPerks[perkKey] || 0) >= 10) return alert('Максимум!');
  player.voidSpheres--;
  player.voidPerks[perkKey] = (player.voidPerks[perkKey] || 0) + 1;
  saveGame(); 
  updateUI();
}

const MAX_POTIONS = 5;

function buyPotion(count, cost) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  
  if (player.potions >= MAX_POTIONS) {
    return alert(`🎒 Рюкзак полон! Максимально можно носить ${MAX_POTIONS} настоек.`);
  }

  const spaceLeft = MAX_POTIONS - player.potions;
  const actualCount = Math.min(count, spaceLeft);
  const actualCost = Math.round(cost * (actualCount / count));

  if (player.gold < actualCost) return alert('Недостаточно золота!');

  player.gold -= actualCost; 
  player.potions += actualCount;

  if (actualCount < count) {
    alert(`Куплено ${actualCount} шт. Достигнут лимит в ${MAX_POTIONS} настоек!`);
  }

  saveGame(); 
  updateUI();
}

function buyBuff(buffType, cost) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.gold < cost) return alert('Недостаточно золота!');
  player.gold -= cost; 
  player.activeBuffs[buffType] = (player.activeBuffs[buffType] || 0) + 3;
  alert(`Куплен эликсир на 3 боя!`);
  saveGame(); 
  updateUI();
}

function buyVoidSphereShop() {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.gold < 2500000) return alert('Нужно 2.5M Зл.');
  player.gold -= 2500000; 
  player.voidSpheres += 1;
  saveGame(); 
  updateUI();
}

function buyDarkMatterShop() {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.gold < 500000) return alert('Нужно 500k Зл.');
  player.gold -= 500000; 
  player.darkMatter += 10;
  saveGame(); 
  updateUI();
}

function buyPandoraChest() {
  if (typeof Sound !== 'undefined') Sound.play('overcharge');
  if (player.gold < 1000000) return alert('Нужно 1M Зл.');
  player.gold -= 1000000;
  const dRef = (typeof DUNGEONS !== 'undefined' && DUNGEONS.length > 0) ? DUNGEONS[DUNGEONS.length - 1] : null;
  const chestLoot = generateLoot(dRef, 4, 8, 2, 3);
  player.inventory.push(chestLoot);
  alert(`🎁 Получено: [★x3] ${chestLoot.fullName} (Треб. Ур: ${chestLoot.reqLvl})!`);
  saveGame(); 
  updateUI();
}

function buyTalentPoint() {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.gold < 50000) return alert('Нужно 50,000 Золота.');
  player.gold -= 50000; 
  player.talentPoints += 1;
  saveGame(); 
  updateUI();
}

function upgradeTalent(nodeKey) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.talentPoints <= 0) return alert('Нет TP!');
  if (player.talents[nodeKey] >= 5) return alert('Максимум!');
  player.talentPoints--; 
  player.talents[nodeKey]++;
  saveGame(); 
  updateUI();
}

function upgradeSkill(skillId) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.talentPoints <= 0) return alert('Нет TP!');
  if (player.skills[skillId].lvl >= 5) return alert('Максимум!');
  player.talentPoints--; 
  player.skills[skillId].lvl++;
  saveGame(); 
  updateUI();
}

function toggleEquipSkill(skillId) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  const idx = player.equippedSkills.indexOf(skillId);
  if (idx !== -1) {
    if (player.equippedSkills.length <= 1) return alert('Оставьте хотя бы 1 скил!');
    player.equippedSkills.splice(idx, 1);
  } else {
    if (player.equippedSkills.length >= 3) return alert('Максимум 3 скила!');
    player.equippedSkills.push(skillId);
  }
  saveGame(); 
  updateUI();
}

function resetTalents() {
  if (typeof Sound !== 'undefined') Sound.play('click');
  if (player.gold < 100) return alert('Нужно 100 Золота!');
  player.gold -= 100;
  let ref = 0;
  for (let k in player.talents) { ref += player.talents[k]; player.talents[k] = 0; }
  for (let s in player.skills) { ref += (player.skills[s].lvl - 1); player.skills[s].lvl = 1; }
  player.talentPoints += ref;
  saveGame(); 
  updateUI();
}

function craftRune() {
  if ((player.synthDust || 0) < 50) return alert('Требуется 50 Пыли Синтеза ✨!');
  player.synthDust -= 50;
  const pickedRune = RUNES_DB[Math.floor(Math.random() * RUNES_DB.length)];
  if (!player.storedRunes) player.storedRunes = [];
  player.storedRunes.push(pickedRune.id);
  checkMechanicQuest('rune');
  if (typeof Sound !== 'undefined') Sound.play('overcharge');
  alert(`🎉 Скована руна: ${pickedRune.icon} ${pickedRune.name}!`);
  saveGame(); 
  updateUI(); 
  renderSynthesisUI();
}

function salvageItem(invIndex) {
  const item = player.inventory[invIndex];
  if (!item) return;
  const dustReward = Math.max(5, (item.quality - 4) * 10 + (item.stars || 0) * 5);
  if (!confirm(`Растворить "${item.fullName}" на ${dustReward} Пыли Синтеза?`)) return;
  player.synthDust = (player.synthDust || 0) + dustReward;
  player.inventory.splice(invIndex, 1);
  if (typeof Sound !== 'undefined') Sound.play('kill');
  saveGame(); 
  updateUI(); 
  renderSynthesisUI();
}

function inlayRune(runeIndex) {
  const rId = player.storedRunes[runeIndex];
  const rune = RUNES_DB.find(x => x.id === rId);
  if (!rune) return;
  const weapon = player.equipment.weapon;
  if (!weapon) return alert('Сначала наденьте оружие в экипировку!');
  if (!weapon.runes) weapon.runes = [];
  if (weapon.runes.length >= 2) return alert('В оружие можно вставить максимум 2 руны!');
  if (weapon.runes.includes(rId)) return alert('Эта руна уже инкрустирована в данное оружие!');

  weapon.runes.push(rId);
  player.storedRunes.splice(runeIndex, 1);
  checkMechanicQuest('rune');
  if (typeof Sound !== 'undefined') Sound.play('cast');
  alert(`💎 Руна "${rune.name}" успешно инкрустирована в "${weapon.fullName}"!`);
  saveGame(); 
  updateUI(); 
  renderSynthesisUI();
}

// ГЕНЕРАЦИЯ ЛУТА С ФИЛЬТРАЦИЕЙ АФФИКСОВ ПО ПРЕСТИЖУ
function generateLoot(dungeon, diff, forceQuality = null, statMultiplier = 1, bonusStars = 0) {
  let pool = DEFAULT_ITEM_POOL;
  let dMinLvl = 1;

  if (dungeon && dungeon.itemPool && dungeon.itemPool.length > 0) {
    pool = dungeon.itemPool;
    dMinLvl = dungeon.minLvl || 1;
  } else if (typeof DUNGEONS !== 'undefined' && DUNGEONS.length > 0) {
    let dIndex = DUNGEONS.findIndex(d => d.id === (dungeon ? dungeon.id : ''));
    if (dIndex < 0) dIndex = 0;
    const pickedDungeon = DUNGEONS[Math.floor(Math.random() * (dIndex + 1))] || DUNGEONS[0];
    if (pickedDungeon && pickedDungeon.itemPool) {
      pool = pickedDungeon.itemPool;
      dMinLvl = pickedDungeon.minLvl || 1;
    }
  }

  // === СТРОГО ФИЛЬТРУЕМ ПУЛ ПО РАЗБЛОКИРОВАННЫМ СЛОТАМ ПРЕСТИЖА ===
  const unlockedPool = pool.filter(item => !item.slot || isSlotUnlocked(item.slot));
  const safePool = unlockedPool.length > 0 ? unlockedPool : DEFAULT_ITEM_POOL.filter(item => !item.slot || isSlotUnlocked(item.slot));
  
  const baseItem = safePool[Math.floor(Math.random() * safePool.length)] || DEFAULT_ITEM_POOL[0];
  const pickedSlot = baseItem.slot || 'weapon';
  // ================================================================

  const effectiveDiff = Math.floor(Math.random() * (diff || 1)) + 1;
  const diffIndex = Math.min(4, effectiveDiff - 1);

  let chosenQ = forceQuality;
  if (!chosenQ) {
    const rand = Math.random() * 100;
    let cumulative = 0; chosenQ = 1;
    for (let q = 1; q <= 8; q++) {
      cumulative += (QUALITIES[q] ? QUALITIES[q].dropRate[diffIndex] : 0);
      if (rand <= cumulative) { chosenQ = q; break; }
    }
  }

  const qData = QUALITIES[chosenQ] || QUALITIES[1];
  const diffMult = effectiveDiff === 7 ? 12.0 : Math.pow(1.5, effectiveDiff - 1);
  const pactMult = getPactBonusMultiplier();
  const totalMult = qData.mult * diffMult * statMultiplier * (1 + (pactMult - 1) * 0.2);

  const baseAtkVal = Math.round((baseItem.baseAtk || 5) * totalMult);
  const baseDefVal = Math.round((baseItem.baseDef || 3) * totalMult);
  const baseHpVal = Math.round((baseItem.baseHp || 25) * totalMult);
  const baseAspdVal = Math.round((baseItem.baseAspd || 0) * (1 + (effectiveDiff - 1) * 0.1));
  const basePierceVal = Math.round((baseItem.pierce || 0) * (statMultiplier > 1 ? statMultiplier : 1));

  const isPosCurse = Math.random() > 0.35;
  let baseCurseVal = isPosCurse 
    ? Math.round(1 + Math.random() * 2 + chosenQ * 0.4) 
    : -Math.round(1 + Math.random() * 2 + effectiveDiff * 0.3);

  let stackedStats = { atk: 0, def: 0, hp: 0, aspd: 0, crit: 0, critDmg: 0, vamp: 0, pierce: 0, dmgReduction: 0, regen: 0, curseChance: 0, skillPower: 0, goldBonus: 0, expBonus: 0 };
  let rolledAffixNames = [];
  const transLvl = player.transcendLevel || 0;

  for (let i = 0; i < qData.maxAffixes; i++) {
    let template;
    let attempts = 0;
    do {
      template = AFFIX_POOL[Math.floor(Math.random() * AFFIX_POOL.length)];
      attempts++;
      let allowed = true;

      if (['critDmg', 'skillPower', 'goldBonus'].includes(template.stat) && transLvl < 2) allowed = false;
      if (['pierce', 'dmgReduction', 'curseChance', 'expBonus'].includes(template.stat) && transLvl < 3) allowed = false;
      if (template.stat === 'aspd' && transLvl < 4) allowed = false;
      if (template.stat === 'vamp' && transLvl < 5) allowed = false;

      if (allowed || attempts > 50) break;
    } while (true);

    let finalVal;
    if (template.isPct) {
      const base = template.val[0] + Math.random() * (template.val[1] - template.val[0]);
      const softScale = 1 + (chosenQ - 1) * 0.20 + (effectiveDiff - 1) * 0.10;
      const raw = base * softScale;
      
      finalVal = ['critDmg', 'goldBonus', 'expBonus', 'aspd', 'skillPower'].includes(template.stat)
        ? Math.max(1, Math.round(raw))
        : parseFloat(Math.max(0.1, raw).toFixed(1));
      
      stackedStats[template.stat] += finalVal;
      rolledAffixNames.push(`${template.label} +${finalVal}% (${template.name})`);
    } else {
      const base = template.val[0] + Math.random() * (template.val[1] - template.val[0]);
      finalVal = Math.max(1, Math.round(base * totalMult * 0.3));
      stackedStats[template.stat] += finalVal;
      rolledAffixNames.push(`${template.label} +${finalVal.toLocaleString()} (${template.name})`);
    }
  }

  const prefix = PREFIX_NAMES[Math.floor(Math.random() * PREFIX_NAMES.length)];
  const bonusTag = statMultiplier > 1 ? ` [x${statMultiplier}]` : '';
  const fullName = `${chosenQ >= 4 ? prefix + ' ' : ''}${baseItem.name}${bonusTag}`;

  const baseReqLvl = Math.max(1, Math.round(dMinLvl * 0.75));
  const qLvlBonus = (chosenQ - 1) * 5;
  const diffLvlBonus = (effectiveDiff - 1) * 3;
  const starLvlBonus = bonusStars * 4;
  const calculatedReqLvl = Math.max(1, Math.round(baseReqLvl + qLvlBonus + diffLvlBonus + starLvlBonus));

  const finalItem = {
    fullName, slot: pickedSlot, quality: chosenQ, dropDiff: effectiveDiff,
    baseCurseChance: baseCurseVal, stars: bonusStars, runes: [], affixes: rolledAffixNames,
    baseReqLvl: baseReqLvl,
    reqLvl: calculatedReqLvl,
    baseStats: { atk: baseAtkVal, def: baseDefVal, hp: baseHpVal, aspd: baseAspdVal, pierce: basePierceVal },
    atk: baseAtkVal + stackedStats.atk, def: baseDefVal + stackedStats.def, hp: baseHpVal + stackedStats.hp,
    aspd: baseAspdVal + stackedStats.aspd, 
    crit: parseFloat(stackedStats.crit.toFixed(1)), 
    critDmg: Math.round(stackedStats.critDmg),
    vamp: parseFloat(stackedStats.vamp.toFixed(1)), 
    pierce: basePierceVal + stackedStats.pierce, 
    dmgReduction: parseFloat(stackedStats.dmgReduction.toFixed(1)),
    regen: stackedStats.regen, 
    curseChance: parseFloat(stackedStats.curseChance.toFixed(1)), 
    skillPower: Math.round(stackedStats.skillPower),
    goldBonus: Math.round(stackedStats.goldBonus), 
    expBonus: Math.round(stackedStats.expBonus),
    price: Math.round(25 * totalMult * effectiveDiff)
  };

  if (bonusStars > 0) {
    const starFactor = Math.pow(1.15, bonusStars);
    ['atk','def','hp','pierce'].forEach(k => { finalItem[k] = Math.round(finalItem[k] * starFactor); });
  }
  return finalItem;
}

function equipItem(index) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  const item = player.inventory[index];
  
  // Проверяем, разблокирован ли слот престижем
  if (!isSlotUnlocked(item.slot)) {
    const reqP = SLOT_UNLOCK_PRESTIGE[item.slot];
    return alert(`🔒 Слот «${SLOTS[item.slot]}» заблокирован! Требуется Возвышение (Престиж) ур. ${reqP}.`);
  }

  if (!isItemUsable(item)) return alert(`Нельзя надеть вещь! Требуется Уровень ${item.reqLvl || 1}!`);
  const current = player.equipment[item.slot];
  player.inventory.splice(index, 1);
  if (current) player.inventory.push(current);
  player.equipment[item.slot] = item;
  saveGame(); 
  updateUI();
}

function unequipItem(slot) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  const item = player.equipment[slot];
  if (!item) return;
  player.equipment[slot] = null;
  player.inventory.push(item);
  saveGame(); 
  updateUI();
}

function sellItem(index) {
  if (typeof Sound !== 'undefined') Sound.play('click');
  const item = player.inventory[index];
  player.gold += item.price;
  player.inventory.splice(index, 1);
  saveGame(); 
  updateUI();
}

function sellJunk() {
  if (typeof Sound !== 'undefined') Sound.play('click');
  let sold = 0, goldSum = 0;
  for (let i = player.inventory.length - 1; i >= 0; i--) {
    if (player.inventory[i].quality === 1 && !player.inventory[i].stars) {
      goldSum += player.inventory[i].price;
      player.inventory.splice(i, 1);
      sold++;
    }
  }
  player.gold += goldSum;
  saveGame(); 
  updateUI();
  if (sold > 0) alert(`Продано ${sold} предметов за ${goldSum.toLocaleString()} Зл.`);
}

function usePotion() {
  if (player.potions <= 0) return alert('Нет настоек!');
  const maxHp = getPlayerMaxHp();
  if (player.hp >= maxHp) return alert('Здоровье полно!');
  player.potions--;
  player.hp = Math.min(maxHp, player.hp + Math.round(maxHp * 0.5));
  if (typeof Sound !== 'undefined') Sound.play('heal');
  saveGame(); 
  updateUI();
}