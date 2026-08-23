function assignEnemySkills(enemy, tierIndex) {
  enemy.skills = [];
  enemy.skillLock = 3.0; // Начальная задержка перед первым кастом

  // Навыки выдаются ТОЛЬКО если враг элитный (мутант) или это эндгейм-режим
  if (tierIndex < 0) return;

  const skillKeys = Object.keys(player.skills);
  // Количество навыков строго ограничено: от 1 до максимум 4
  const count = Math.min(Math.max(1, tierIndex), 4);
  const shuffled = [...skillKeys].sort(() => 0.5 - Math.random());

  for (let i = 0; i < count; i++) {
    const sId = shuffled[i];
    const baseSkill = SKILLS_DB[sId];
    const maxCd = Math.max(7.0, (baseSkill ? baseSkill.baseCd : 8.0));
    // Плавный интервал между доступностью навыков
    const initialCd = 4.0 + i * 3.5 + Math.random() * 1.5;
    enemy.skills.push({ id: sId, cd: initialCd, maxCd: maxCd });
  }
}

function applyEtherShieldIfUnlocked() {
  if (player.transcendLevel >= 5) {
    const shieldVal = getPlayerMaxHp();
    player.shield = Math.max(player.shield || 0, shieldVal);
    addLog(`🛡 <b>Эфирный Щит Наследия:</b> +${shieldVal.toLocaleString()} Щита в начале боя!`, 'log-over');
    Sound.play('cast');
  }
}

function startDungeon(dungeonId) {
  const dungeon = DUNGEONS.find(d => d.id === dungeonId) || DUNGEONS[0];
  const diff = parseInt(document.getElementById('diff-select').value) || 1;
  const effectiveReqLvl = Math.max(dungeon.minLvl || 1, (typeof DIFF_MIN_LVL !== 'undefined' ? DIFF_MIN_LVL[diff] : 1) || 1);
  
  if (player.lvl < effectiveReqLvl) {
    return alert(`🔒 Подземелье заблокировано! Требуется ${effectiveReqLvl} уровень для данной сложности.`);
  }

  Sound.play('click');
  combat.active = true; combat.isArena = false; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = false;
  combat.dungeon = dungeon; combat.diff = diff; combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  if (player.activeBuffs.titan > 0) player.shield = getPlayerMaxHp() * 2.0;
  applyEtherShieldIfUnlocked();

  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  loadCombatStage();
}

function startArena() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.arena) ? MODE_MIN_LVL.arena : 5;
  if (player.lvl < minLvl) return alert(`🔒 Арена доступна с ${minLvl} уровня!`);

  Sound.play('click');
  const diff = parseInt(document.getElementById('diff-select').value) || 1;
  combat.active = true; combat.isArena = true; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = false;
  combat.dungeon = { id: 'arena_rift', name: 'Арена Испытаний', cooldownSec: 0 };
  combat.diff = diff; combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.arenaTimer = 30; combat.waveSpawning = false;
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`🌌 <b>Арена Испытаний начата!</b>`, 'log-over');
  spawnArenaWave(); buildCombatArenaDOM(); buildCombatSkillsDOM(); updateCombatUI();
}

function startDuelArena() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.duel) ? MODE_MIN_LVL.duel : 10;
  if (player.lvl < minLvl) return alert(`🔒 Дуэль доступна с ${minLvl} уровня!`);

  Sound.play('click');
  combat.active = true; combat.isArena = false; combat.isDuel = true; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = false;
  combat.dungeon = { id: 'arena_duel', name: 'Дуэль 1v1', cooldownSec: 0 };
  combat.diff = 1; combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`🤺 <b>Дуэль 1 на 1 против Теневого Двойника!</b>`, 'log-over');
  spawnDuelOpponent(); buildCombatArenaDOM(); buildCombatSkillsDOM(); updateCombatUI();
}

function startRaidDemiurge() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.demiurge) ? MODE_MIN_LVL.demiurge : 80;
  if (player.lvl < minLvl) return alert(`🔒 Рейд доступен с ${minLvl} уровня!`);

  Sound.play('click');
  combat.active = true; combat.isArena = false; combat.isDuel = false; combat.isRaid = true; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = false;
  combat.dungeon = { id: 'raid_demiurge', name: 'Рейд: Демиург', cooldownSec: 0 };
  combat.diff = 7; combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.raidEnrageTimer = 45.0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();

  const pMaxHp = getPlayerMaxHp(), pAtk = getPlayerAtk(), pPierce = getPlayerPierce(), pDef = getPlayerDef();
  const raidHp = Math.max(500000, pMaxHp * 120 + pAtk * 800);
  const raidAtk = Math.max(300, Math.round(pMaxHp * 0.18));
  const raidDef = Math.round(pPierce * 0.9 + pDef * 0.5);

  const demiurge = {
    id: 'b_demiurge_raid', originDungeonId: 'dungeon_5', name: '👁 Демиург [РЕЙД]', isBoss: true,
    eliteTier: { id: 'raid', name: 'Демиург', mult: 360, quality: 8, color: '#38bdf8' }, isMutated: true,
    atk: raidAtk, def: raidDef, xp: Math.round(raidHp * 0.3), gold: Math.round(raidHp * 0.15), avatar: 'matrix',
    attackSpeed: 1.6, maxHp: raidHp, hp: raidHp, castProgress: 0, isDeadHandled: false, skills: []
  };
  assignEnemySkills(demiurge, 4);

  combat.enemies = [demiurge];
  combat.targetIndex = 0; combat.lastAttackTimestamp = Date.now();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`👁🌌 <b>ДЕМИУРГ ПРОБУДИЛСЯ! 45 СЕКУНД!</b>`, 'log-raid');
  buildCombatArenaDOM(); buildCombatSkillsDOM(); updateCombatUI();
}

function startHordeMode() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.horde) ? MODE_MIN_LVL.horde : 15;
  if (player.lvl < minLvl) return alert(`🔒 Орда Бездны доступна с ${minLvl} уровня!`);

  Sound.play('click');
  combat.active = true; combat.isArena = false; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = true; combat.isBossRush = false; combat.isPurgatory = false;
  combat.dungeon = { id: 'mode_horde', name: 'Орда Бездны', cooldownSec: 0 };
  combat.diff = parseInt(document.getElementById('diff-select').value) || 1;
  combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.hordeTimer = 0; combat.hordeScore = 0; combat.waveSpawning = false;
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`🛡 <b>Орда Бездны началась! Выживайте как можно дольше!</b>`, 'log-over');
  spawnHordeWave(); buildCombatArenaDOM(); buildCombatSkillsDOM(); updateCombatUI();
}

function spawnHordeWave() {
  combat.enemies = [];
  const count = Math.min(6, 3 + Math.floor(combat.hordeTimer / 30));
  for (let i = 0; i < count; i++) combat.enemies.push(generateArenaEnemy());
  combat.targetIndex = 0; combat.lastAttackTimestamp = Date.now();
  addLog(`⚔ <b>Новая волна Орды (${combat.enemies.length} врагов)!</b>`, 'log-enemy');
}

function startBossRushMode() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.bossrush) ? MODE_MIN_LVL.bossrush : 25;
  if (player.lvl < minLvl) return alert(`🔒 Босс-Раш доступен с ${minLvl} уровня!`);

  Sound.play('click');
  combat.active = true; combat.isArena = false; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = true; combat.isPurgatory = false;
  combat.dungeon = { id: 'mode_bossrush', name: 'Босс-Раш', cooldownSec: 0 };
  combat.diff = parseInt(document.getElementById('diff-select').value) || 1;
  combat.bossRushIndex = 0; combat.skillCooldowns = {};
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`👑 <b>БОСС-РАШ НАЧАТ! Сразитесь со всеми боссами!</b>`, 'log-over');
  loadBossRushStage();
}

function loadBossRushStage() {
  const allBosses = [];
  DUNGEONS.forEach(d => {
    if (d.stages) {
      d.stages.forEach(st => {
        st.enemies.forEach(e => {
          if (e.isBoss) allBosses.push({ ...e, originDungeonId: d.id });
        });
      });
    }
  });

  if (allBosses.length === 0 || combat.bossRushIndex >= allBosses.length) {
    addLog(`🏆 <b>НЕВЕРОЯТНО! Вы прошли весь Босс-Раш!</b>`, 'log-over');
    player.voidSpheres += 5; player.gold += 1000000;
    saveGame(); updateUI(); endCombat();
    return;
  }

  const baseBoss = allBosses[combat.bossRushIndex];
  const diffMult = getDiffMultiplier(combat.diff) * (1 + combat.bossRushIndex * 0.35);
  const hpVal = Math.round(baseBoss.hp * diffMult);
  const atkVal = Math.round(baseBoss.atk * diffMult);

  const bossObj = {
    id: baseBoss.id, originDungeonId: baseBoss.originDungeonId,
    name: `👑 [${combat.bossRushIndex + 1}/${allBosses.length}] ${baseBoss.name}`,
    isBoss: true, eliteTier: null, isMutated: false, atk: atkVal,
    def: Math.round(baseBoss.def * diffMult), xp: Math.round(baseBoss.xp * diffMult * 2),
    gold: Math.round(baseBoss.gold * diffMult * 2), avatar: baseBoss.avatar,
    attackSpeed: Math.max(1.1, baseBoss.attackSpeed * 0.9), maxHp: hpVal, hp: hpVal, castProgress: 0, isDeadHandled: false, skills: []
  };

  // В Босс-Раше скилы появляются только с 5-го босса
  if (combat.bossRushIndex >= 4) {
    assignEnemySkills(bossObj, Math.min(3, Math.floor((combat.bossRushIndex - 3) / 2)));
  }

  combat.enemies = [bossObj];
  combat.targetIndex = 0; combat.lastAttackTimestamp = Date.now();
  addLog(`👑 <b>Босс #${combat.bossRushIndex + 1}: ${baseBoss.name} вступил в бой!</b>`, 'log-crit');
  buildCombatArenaDOM(); buildCombatSkillsDOM(); updateCombatUI();
}

function startPurgatoryMode() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.purgatory) ? MODE_MIN_LVL.purgatory : 35;
  if (player.lvl < minLvl) return alert(`🔒 Чистилище доступно с ${minLvl} уровня!`);

  Sound.play('click');
  const unlocked = DUNGEONS.filter(d => player.lvl >= d.minLvl);
  const pickedDungeon = unlocked[unlocked.length - 1] || DUNGEONS[0];
  const diff = parseInt(document.getElementById('diff-select').value) || 1;

  combat.active = true; combat.isArena = false; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = true;
  combat.dungeon = pickedDungeon; combat.diff = diff; combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`🏛 <b>ЧИСТИЛИЩЕ АКТИВИРОВАНО! Урон -30%, враги бронированы, но лут x3!</b>`, 'log-over');
  loadCombatStage();
}

function startAbyss() {
  const minLvl = (typeof MODE_MIN_LVL !== 'undefined' && MODE_MIN_LVL.abyss) ? MODE_MIN_LVL.abyss : 20;
  if (player.lvl < minLvl) return alert(`🔒 Фрактальная Бездна доступна с ${minLvl} уровня!`);

  Sound.play('click');
  combat.active = true; combat.isArena = false; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = true;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = false;
  combat.abyssFloor = player.currentAbyssFloor || 1;
  combat.dungeon = { id: 'mode_abyss', name: `Фрактальная Бездна`, cooldownSec: 0 };
  combat.diff = Math.min(7, Math.floor((combat.abyssFloor - 1) / 5) + 1);
  combat.stageIndex = 0; combat.skillCooldowns = {};
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0; combat.hitCounter = 0; combat.mutatedEnemiesKilledCount = 0;

  applyEtherShieldIfUnlocked();
  document.getElementById('nav-combat-btn').style.display = 'block';
  switchTab('combat');
  addLog(`🌀 <b>Фрактальная Бездна: Этаж ${combat.abyssFloor}</b>!`, 'log-over');
  loadAbyssStage();
}

function loadAbyssStage() {
  const floor = combat.abyssFloor;
  const isBossFloor = (floor % 5 === 0);
  const floorMult = Math.pow(1.35, floor - 1);

  const baseMob = {
    id: `abyss_guardian_${floor}`, originDungeonId: 'dungeon_5',
    name: isBossFloor ? `🌀 Повелитель Бездны [Этаж ${floor}]` : `Фрактальный Страж #${floor}`,
    isBoss: isBossFloor, eliteTier: isBossFloor ? ELITE_TIERS[Math.min(9, Math.floor(floor / 3))] : null,
    isMutated: isBossFloor, hp: Math.round(500 * floorMult * (isBossFloor ? 3.0 : 1.0)),
    atk: Math.round(40 * floorMult * (isBossFloor ? 1.5 : 1.0)), def: Math.round(15 * floorMult),
    xp: Math.round(150 * floorMult), gold: Math.round(120 * floorMult), avatar: isBossFloor ? 'matrix' : 'reaper',
    attackSpeed: Math.max(1.0, 2.5 - (floor * 0.05)), castProgress: 0, isDeadHandled: false, skills: []
  };
  baseMob.maxHp = baseMob.hp;

  // В Бездне скилы получают только боссы этажей (каждый 5-й этаж)
  if (isBossFloor) {
    assignEnemySkills(baseMob, Math.min(3, Math.floor(floor / 8) + 1));
  }

  combat.enemies = [baseMob];
  combat.targetIndex = 0; combat.lastAttackTimestamp = Date.now();
  buildCombatArenaDOM(); buildCombatSkillsDOM(); updateCombatUI();
}

function handleAbyssStageCleared() {
  addLog(`🌀 <b>Этаж ${combat.abyssFloor} Бездны пройден!</b>`, 'log-over');
  if (combat.abyssFloor > (player.abyssRecord || 0)) {
    player.abyssRecord = combat.abyssFloor;
    checkMechanicQuest('abyss');
  }
  player.currentAbyssFloor = combat.abyssFloor + 1;
  
  if (combat.abyssFloor % 5 === 0) {
    player.voidSpheres += 1;
    player.synthDust = (player.synthDust || 0) + 15;
    const dRef = DUNGEONS.length > 0 ? DUNGEONS[DUNGEONS.length - 1] : null;
    const abyssLoot = generateLoot(dRef, combat.diff, 6, 2);
    player.inventory.push(abyssLoot);
    addLog(`🎁 Награда за веху Бездны: +1 Сфера Пустоты, +15 Пыли и предмет [${abyssLoot.fullName}]!`, 'log-crit');
  }

  saveGame(); updateUI();
  combat.abyssFloor++;
  setTimeout(() => { if (combat.active && combat.isAbyss) loadAbyssStage(); }, 600);
}

function spawnDuelOpponent() {
  const spread = () => 0.9 + Math.random() * 0.2;
  const cloneHp = Math.round(getPlayerMaxHp() * spread()), cloneAtk = Math.round(getPlayerAtk() * spread()), cloneDef = Math.round(getPlayerDef() * spread());
  const rewardGold = Math.round((player.lvl * 850 + 500) * spread());

  const clone = {
    id: `m_clone_${Date.now()}`, originDungeonId: 'dungeon_intro_1', name: `🪞 Теневой Двойник [${player.lvl}]`,
    isBoss: true, eliteTier: { id: 'clone', name: 'Двойник', mult: 1, quality: 4, color: 'var(--gold)' }, isMutated: true,
    atk: cloneAtk, def: cloneDef, xp: 0, gold: rewardGold, avatar: 'shadow_guard',
    attackSpeed: Math.max(1.5, getOptimalChargeSec() * 0.6), maxHp: cloneHp, hp: cloneHp, castProgress: 0, isDeadHandled: false,
    skills: []
  };
  
  // Двойник копирует скилы только если игрок 20+ уровня
  if (player.lvl >= 20) {
    assignEnemySkills(clone, 2);
  }

  combat.enemies = [clone];
  combat.targetIndex = 0; combat.lastAttackTimestamp = Date.now();
  addLog(`⚔ <b>Новый Двойник! Награда: ${rewardGold.toLocaleString()} Зл.</b>`, 'log-hit');
}

function generateArenaEnemy() {
  const unlocked = DUNGEONS.filter(d => player.lvl >= d.minLvl);
  const pickedDungeon = unlocked[Math.floor(Math.random() * unlocked.length)] || DUNGEONS[0];
  const allEnemies = [];
  if (pickedDungeon && pickedDungeon.stages) {
    pickedDungeon.stages.forEach(st => st.enemies.forEach(e => allEnemies.push(e)));
  }
  const baseEnemy = allEnemies[Math.floor(Math.random() * allEnemies.length)] || { id: 'm_dummy_1', name: 'Манекен I', hp: 30, atk: 6, def: 1, xp: 10, gold: 8, isBoss: false, avatar: 'dummy', attackSpeed: 3.5 };

  const diffMult = getDiffMultiplier(combat.diff);
  const isDiff7 = (combat.diff === 7);
  let eliteTier = null, mult = 1, titlePrefix = '', tierIdx = -1;

  if (isDiff7) {
    tierIdx = 9; eliteTier = ELITE_TIERS[tierIdx]; mult = eliteTier.mult; titlePrefix = `👑 [${eliteTier.name}] `;
  } else {
    const maxTierIdx = Math.min(ELITE_TIERS.length, combat.diff * 2);
    if (Math.random() < (0.28 + combat.diff * 0.05)) {
      tierIdx = Math.floor(Math.random() * maxTierIdx);
      eliteTier = ELITE_TIERS[tierIdx]; mult = eliteTier.mult; titlePrefix = `👑 [${eliteTier.name}] `;
    }
  }

  let hpVal = Math.round(baseEnemy.hp * diffMult * mult);
  let atkVal = Math.round(baseEnemy.atk * diffMult * mult);
  if (player.pacts.overlord && eliteTier) { hpVal = Math.round(hpVal * 4.0); atkVal = Math.round(atkVal * 1.6); }

  const enemyObj = {
    id: baseEnemy.id, originDungeonId: pickedDungeon ? pickedDungeon.id : 'dungeon_intro_1', name: `${titlePrefix}${baseEnemy.name}`,
    isBoss: baseEnemy.isBoss || !!eliteTier, eliteTier: eliteTier, isMutated: !!eliteTier, atk: atkVal,
    def: Math.round(baseEnemy.def * diffMult * mult), xp: Math.round(baseEnemy.xp * diffMult * mult * getPactBonusMultiplier()),
    gold: Math.round((baseEnemy.gold || 10) * diffMult * mult * getPactBonusMultiplier()), avatar: baseEnemy.avatar,
    attackSpeed: Math.max(1.1, baseEnemy.attackSpeed * (eliteTier ? 0.85 : 1.0)), maxHp: hpVal, hp: hpVal, castProgress: 0, isDeadHandled: false, skills: []
  };

  // Навыки даются только мутантам
  if (eliteTier) {
    assignEnemySkills(enemyObj, tierIdx);
  }

  return enemyObj;
}

function spawnArenaWave() {
  combat.enemies = [];
  for (let i = 0; i < Math.floor(Math.random() * 4) + 1; i++) combat.enemies.push(generateArenaEnemy());
  combat.targetIndex = 0; combat.lastAttackTimestamp = Date.now();
  addLog(`⚔ <b>Новая волна врагов!</b>`, 'log-aoe');
}

function spawnArenaReinforcement() {
  if (!combat.active || (!combat.isArena && !combat.isHorde) || combat.waveSpawning) return;
  if (combat.enemies.filter(e => e.hp > 0).length >= 6) return;
  const newEnemy = generateArenaEnemy();
  combat.enemies.push(newEnemy);
  addLog(`⚠️ <b>Подкрепление:</b> ${newEnemy.name}!`, 'log-enemy');
  buildCombatArenaDOM(); updateCombatUI();
}

function checkCurseMutation(target) {
  if (!combat.active || target.hp <= 0 || target.isMutated || combat.isRaid || combat.isAbyss) return;
  const curseVal = getPlayerCurseChance();
  if (curseVal <= 0) return;

  let tierIdx = Math.min(ELITE_TIERS.length - 1, Math.floor(curseVal / 100));
  if (Math.random() * 100 < (curseVal % 100)) tierIdx++;

  if (tierIdx >= 1) {
    const chosenTier = ELITE_TIERS[Math.min(tierIdx - 1, ELITE_TIERS.length - 1)];
    target.isMutated = true; target.eliteTier = chosenTier; target.isBoss = true;
    target.maxHp *= chosenTier.mult; target.hp *= chosenTier.mult; target.atk *= chosenTier.mult;
    target.def *= chosenTier.mult; target.xp *= chosenTier.mult; target.gold *= chosenTier.mult;
    target.name = `👑 [${chosenTier.name}] ${target.name}`;
    assignEnemySkills(target, tierIdx - 1);
    checkMechanicQuest('curse');
    addLog(`🔮 <b>ПРОКЛЯТИЕ!</b> Мутация в ранг <b>${chosenTier.name} (x${chosenTier.mult})</b>!`, 'log-curse');
    buildCombatArenaDOM();
  }
}

function handleEnemyKilled(enemy) {
  if (enemy.isDeadHandled) return;
  enemy.isDeadHandled = true;
  Sound.play('kill');
  updateQuestProgress(enemy.id);

  if (player.anomalyTier > 0 && Math.random() * 100 < Math.min(100, player.anomalyTier * 15)) {
    const gainMatter = Math.max(1, Math.floor(player.anomalyTier * 0.8));
    player.darkMatter += gainMatter;
    addLog(`⚛️ <b>Тёмная Материя: +${gainMatter} шт.</b>!`, 'log-aoe');
  }

  if (enemy.isMutated) combat.mutatedEnemiesKilledCount++;

  let multAnomalyHarvest = (player.transcendLevel >= 3 && enemy.isMutated) ? 2.0 : 1.0;
  if (multAnomalyHarvest > 1.0) addLog(`📜 <b>Жатва Аномалий:</b> Утроенная награда за элиту!`, 'log-over');

  const goldGain = Math.round(enemy.gold * (1 + getPlayerGoldBonus() / 100) * multAnomalyHarvest);
  const expGain = Math.round(enemy.xp * (1 + getPlayerExpBonus() / 100) * multAnomalyHarvest);
  addExp(expGain);
  player.gold += goldGain;

  if (combat.isAbyss) { handleAbyssStageCleared(); return; }

  if (combat.isBossRush) {
    combat.bossRushIndex++;
    checkMechanicQuest('bossrush');
    addLog(`👑 <b>Босс повержен! Переход к следующему...</b>`, 'log-hit');
    setTimeout(() => { if (combat.active && combat.isBossRush) loadBossRushStage(); }, 600);
    return;
  }

  if (combat.isHorde) {
    combat.hordeScore++;
    if (combat.hordeScore % 10 === 0) {
      player.voidSpheres += 1;
      addLog(`🛡 <b>Награда за выживание: +1 Сфера Пустоты!</b>`, 'log-over');
    }
    return;
  }

  if (combat.isRaid) {
    checkMechanicQuest('raid');
    const dRef = DUNGEONS.length > 0 ? DUNGEONS[DUNGEONS.length - 1] : null;
    const raidLoot = generateLoot(dRef, 5, 8, 3, 5);
    player.inventory.push(raidLoot);
    addLog(`🎁 Награда за Рейд: <span class="q-8">[★x5] ${raidLoot.fullName}</span>!`, 'log-over');
    saveGame(); updateUI();
    setTimeout(() => { alert(`🎉 ПОБЕДА НАД ДЕМИУРГОМ!`); endCombat(); }, 1000);
    return;
  }

  if (combat.isDuel) {
    checkMechanicQuest('duel');
    addLog(`🪙 <b>Двойник повержен!</b> +${goldGain.toLocaleString()} Зл.`, 'log-over');
    saveGame(); updateUI();
    setTimeout(() => { if (combat.active && combat.isDuel) { spawnDuelOpponent(); buildCombatArenaDOM(); updateCombatUI(); } }, 800);
    return;
  }

  if (enemy.eliteTier || combat.isPurgatory) {
    const originDungeon = DUNGEONS.find(d => d.id === enemy.originDungeonId) || DUNGEONS[0];
    const loot = generateLoot(originDungeon, combat.diff, enemy.eliteTier ? enemy.eliteTier.quality : 5, 3);
    player.inventory.push(loot);
    addLog(`👑 Трофей: <span class="${QUALITIES[loot.quality].cls}">[${loot.fullName}]</span>!`, 'log-over');
    saveGame(); updateUI();
  }
}

function handleArenaWaveCleared() {
  addLog(`🔥 <b>Волна зачищена!</b>`, 'log-over');
  combat.waveSpawning = true;
  setTimeout(() => {
    if (!combat.active) return;
    if (combat.isHorde) spawnHordeWave();
    else spawnArenaWave();
    combat.waveSpawning = false; combat.arenaTimer = 30;
    buildCombatArenaDOM(); updateCombatUI();
  }, 600);
}

function loadCombatStage() {
  if (!combat.dungeon || !combat.dungeon.stages || !combat.dungeon.stages[combat.stageIndex]) {
    endCombat();
    return;
  }
  const stage = combat.dungeon.stages[combat.stageIndex];
  const diffMult = getDiffMultiplier(combat.diff);
  const isDiff7 = (combat.diff === 7);

  combat.enemies = stage.enemies.map(e => {
    let eliteTier = null, mult = 1, titlePrefix = '', tierIdx = -1;
    if (isDiff7) {
      tierIdx = 9; eliteTier = ELITE_TIERS[tierIdx]; mult = eliteTier.mult; titlePrefix = `👑 [${eliteTier.name}] `;
    } else if (combat.diff > 1 && !e.isBoss && Math.random() < 0.25) {
      tierIdx = Math.floor(Math.random() * Math.min(ELITE_TIERS.length, combat.diff * 2));
      eliteTier = ELITE_TIERS[tierIdx]; mult = eliteTier.mult; titlePrefix = `👑 [${eliteTier.name}] `;
    }

    let hpVal = Math.round(e.hp * diffMult * mult);
    let atkVal = Math.round(e.atk * diffMult * mult);
    if (player.pacts.overlord && (e.isBoss || eliteTier)) { hpVal = Math.round(hpVal * 4.0); atkVal = Math.round(atkVal * 1.6); }

    const enemyObj = {
      id: e.id, originDungeonId: combat.dungeon.id, name: `${titlePrefix}${e.name}`,
      isBoss: e.isBoss || !!eliteTier, eliteTier: eliteTier, isMutated: !!eliteTier,
      atk: atkVal, def: Math.round(e.def * diffMult * mult),
      xp: Math.round(e.xp * diffMult * mult * getPactBonusMultiplier()),
      gold: Math.round((e.gold || 10) * diffMult * mult * getPactBonusMultiplier()), avatar: e.avatar,
      attackSpeed: Math.max(1.1, e.attackSpeed * (eliteTier ? 0.85 : 1.0)),
      maxHp: hpVal, hp: hpVal, castProgress: 0, isDeadHandled: false, skills: []
    };

    // Навыки даются ТОЛЬКО если моб мутировал или если сложность выше 3-й (Героическая+)
    if (eliteTier) {
      assignEnemySkills(enemyObj, tierIdx);
    } else if (e.isBoss && combat.diff >= 4) {
      assignEnemySkills(enemyObj, combat.diff - 3);
    }

    return enemyObj;
  });

  combat.targetIndex = 0; 
  combat.lastAttackTimestamp = Date.now();
  addLog(`⚔ <b>Этап ${combat.stageIndex + 1}: ${stage.name}</b>!`, 'log-aoe');
  buildCombatArenaDOM(); 
  buildCombatSkillsDOM(); 
  updateCombatUI();
}

function selectCombatTarget(idx) {
  Sound.play('click');
  if (combat.enemies[idx] && combat.enemies[idx].hp > 0) {
    combat.targetIndex = idx; updateCombatTargetsVisual();
  }
}

function executePlayerAttack() {
  if (!combat.active || player.hp <= 0) return;
  const cData = calculateChargeData();
  if (cData.time < cData.tMin) return;

  const target = combat.enemies[combat.targetIndex];
  if (!target || target.hp <= 0) return;
  const targetBox = document.getElementById(`enemy-box-${combat.targetIndex}`);

  if (player.transcendLevel >= 4 && cData.tier === 'over' && !target.isBoss && Math.random() < 0.15) {
    target.hp = 0;
    combat.lastAttackTimestamp = Date.now();
    addLog(`🌌☠ <b>КАЗНЬ БЕЗДНЫ!</b> ${target.name} уничтожен!`, 'log-over');
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, 'КАЗНЬ БЕЗДНЫ!', 'over');
    Sound.play('overcharge');
    if (typeof triggerScreenShake === 'function') triggerScreenShake('lg');
    checkMechanicQuest('overcharge');
    handleEnemyKilled(target);
    checkStageEnemiesState(); 
    updateCombatUI();
    return;
  }

  let effDef = Math.max(0, target.def - getPlayerPierce());
  if (player.voidPerks && player.voidPerks.truepierce) effDef = Math.round(effDef * (1 - player.voidPerks.truepierce * 0.05));

  const critChance = getPlayerCrit();
  let isCrit = Math.random() * 100 < critChance || cData.tier === 'over';
  let critMult = 1.0;
  if (isCrit) {
    critMult = getPlayerCritDmg() / 100;
    if (critChance > 100 && player.voidPerks && player.voidPerks.supercrit) {
      critMult *= Math.pow(2.0, Math.min(4, Math.floor((critChance - 100) / 50) + 1));
    }
  }

  let dmgTrapMult = (combat.deathGameTimer > 0 ? 1.20 : 1.0) * (player.astrolabe.chaoslord ? (1 + combat.mutatedEnemiesKilledCount * 0.3) : 1.0);
  if (player.pacts.stoneskin && cData.tier === 'low') dmgTrapMult *= 0.4;

  combat.hitCounter = (combat.hitCounter || 0) + 1;
  let isSupernova = (player.astrolabe.supernova && combat.hitCounter % 8 === 0);
  if (isSupernova) dmgTrapMult *= 5.0;

  let totalDmg = Math.round(Math.max(1, getPlayerAtk() - effDef) * cData.mult * critMult * dmgTrapMult);
  combat.lastAttackTimestamp = Date.now();
  target.hp = Math.max(0, target.hp - totalDmg);

  if (cData.tier === 'over') checkMechanicQuest('overcharge');

  if (isSupernova) {
    Sound.play('overcharge');
    if (typeof triggerScreenShake === 'function') triggerScreenShake('lg');
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, `💥 ${totalDmg.toLocaleString()}`, 'nova');
    addLog(`🌟💥 <b>СОЗВЕЗДИЕ СВЕРХНОВОЙ!</b> Взрыв на <b>${totalDmg.toLocaleString()}</b>!`, 'log-over');
    combat.enemies.forEach((e, i) => {
      if (e.hp > 0 && e !== target) {
        const subDmg = Math.round(totalDmg * 0.7);
        e.hp = Math.max(0, e.hp - subDmg);
        if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById(`enemy-box-${i}`), subDmg.toLocaleString(), 'nova');
        if (e.hp <= 0) handleEnemyKilled(e);
      }
    });
  } else if (cData.tier === 'over') {
    Sound.play('overcharge');
    if (typeof triggerScreenShake === 'function') triggerScreenShake('lg');
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, `🔥 ${totalDmg.toLocaleString()}`, 'over');
    addLog(`🔥 <b>СВЕРХЗАМАХ!</b> Нанесено <b>${totalDmg.toLocaleString()}</b> урона!`, 'log-over');
  } else if (isCrit) {
    Sound.play('crit');
    if (typeof triggerScreenShake === 'function') triggerScreenShake('sm');
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, `💥 ${totalDmg.toLocaleString()}`, 'crit');
    addLog(`💥 <b>КРИТ!</b> ${totalDmg.toLocaleString()} урона.`, 'log-crit');
  } else {
    Sound.play('hit');
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, totalDmg.toLocaleString(), 'hit');
    addLog(`⚔ Удар: <b>${totalDmg.toLocaleString()}</b> урона.`, 'log-hit');
  }

  const weaponItem = player.equipment.weapon;
  if (weaponItem && isItemUsable(weaponItem) && weaponItem.runes && weaponItem.runes.includes('r_nova') && cData.tier === 'over') {
    const aoeDmg = Math.round(totalDmg * 2.5);
    combat.enemies.forEach((e, i) => {
      if (e.hp > 0 && e !== target) {
        e.hp = Math.max(0, e.hp - aoeDmg);
        if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById(`enemy-box-${i}`), aoeDmg.toLocaleString(), 'over');
        if (e.hp <= 0) handleEnemyKilled(e);
      }
    });
  }

  const vamp = getPlayerVamp();
  if (vamp > 0) {
    const healed = Math.round(totalDmg * (vamp / 100));
    const maxHp = getPlayerMaxHp();
    if (player.hp + healed > maxHp && player.voidPerks.overheal) {
      player.shield = Math.min(getPlayerMaxShield(), (player.shield || 0) + ((player.hp + healed) - maxHp));
    }
    player.hp = Math.min(maxHp, player.hp + healed);
    if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `+${healed.toLocaleString()}`, 'heal');
  }

  if (target.hp <= 0) handleEnemyKilled(target);
  else checkCurseMutation(target);

  checkStageEnemiesState();
  updateCombatUI();
}

function useCombatSkill(skillId, isEcho = false) {
  if (!combat.active || player.hp <= 0) return;
  if (!isEcho && (combat.skillCooldowns[skillId] || 0) > 0) return;
  const cData = calculateChargeData();
  if (!isEcho && cData.time < cData.tMin) return;

  Sound.play('cast');
  const sk = SKILLS_DB[skillId], sData = player.skills[skillId] || { lvl: 1 };
  const isAwk = !!(player.awakenedSkills && player.awakenedSkills[skillId]);

  if (!isEcho) combat.skillCooldowns[skillId] = sk.baseCd * (1 - getPlayerCdReduction());
  const target = combat.enemies[combat.targetIndex];
  const targetBox = document.getElementById(`enemy-box-${combat.targetIndex}`);
  const sp = getPlayerSkillPower();

  if (skillId === 'haste') {
    combat.hasteTimer = isAwk ? 10.0 : 6.0; addLog(`⚡ <b>Скорость активирована!</b>`, 'log-aoe');
  } else if (skillId === 'deathgame') {
    combat.deathGameTimer = 10.0; addLog(`🕸 <b>Смертельная игра!</b>`, 'log-over');
  } else if (skillId === 'leap') {
    if (!target || target.hp <= 0) return;
    combat.playerDodges += isAwk ? 5 : 3;
    const dmg = Math.max(1, sk.calcDmg(sData.lvl, getPlayerAtk(), cData.mult, sp, isAwk) - Math.max(0, target.def - getPlayerPierce()));
    target.hp = Math.max(0, target.hp - dmg);
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, `🌪 ${dmg.toLocaleString()}`, 'over');
    if (typeof triggerScreenShake === 'function') triggerScreenShake('sm');
    addLog(`🌪 <b>Атака с прыжка</b> наносит <b>${dmg.toLocaleString()}</b> урона!`, 'log-over');
    if (target.hp <= 0) handleEnemyKilled(target); else checkCurseMutation(target);
  } else if (sk.targetType === 'single') {
    if (!target || target.hp <= 0) return;
    let effDef = Math.max(0, target.def - getPlayerPierce());
    if (skillId === 'cleave') effDef = Math.round(effDef * 0.5);
    const dmg = Math.max(1, sk.calcDmg(sData.lvl, getPlayerAtk(), cData.mult, sp, isAwk) - effDef);
    target.hp = Math.max(0, target.hp - dmg);
    if (typeof spawnCombatText === 'function') spawnCombatText(targetBox, `${sk.icon} ${dmg.toLocaleString()}`, 'crit');
    addLog(`✨ <b>«${sk.name}»</b> наносит <b>${dmg.toLocaleString()}</b> урона!`, 'log-crit');
    if (skillId === 'harvest') {
      const hGain = Math.round(dmg * 0.8);
      player.hp = Math.min(getPlayerMaxHp(), player.hp + hGain);
      if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `+${hGain.toLocaleString()}`, 'heal');
    }
    if (target.hp <= 0) handleEnemyKilled(target); else checkCurseMutation(target);
  } else if (sk.targetType === 'aoe') {
    if (typeof triggerScreenShake === 'function') triggerScreenShake('sm');
    addLog(`🌋 <b>«${sk.name}»</b> поражает всех!`, 'log-aoe');
    combat.enemies.forEach((e, i) => {
      if (e.hp > 0) {
        const dmg = Math.max(1, sk.calcDmg(sData.lvl, getPlayerAtk(), cData.mult, sp, isAwk) - Math.max(0, e.def - getPlayerPierce()));
        e.hp = Math.max(0, e.hp - dmg);
        if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById(`enemy-box-${i}`), `🌋 ${dmg.toLocaleString()}`, 'over');
        if (e.hp <= 0) handleEnemyKilled(e); else checkCurseMutation(e);
      }
    });
  } else if (sk.targetType === 'buff') {
    const shieldVal = sk.calcEffect(sData.lvl, getPlayerMaxHp(), cData.mult, sp, isAwk);
    player.shield = Math.min(getPlayerMaxShield(), (player.shield || 0) + shieldVal);
    if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `🛡 +${shieldVal.toLocaleString()}`, 'shield');
    addLog(`🛡 <b>«${sk.name}»</b>: +${shieldVal.toLocaleString()} Щита!`, 'log-hit');
  }

  if (!isEcho && player.voidPerks.echo && Math.random() * 100 < (player.voidPerks.echo * 6)) {
    addLog(`🌌 <b>ЭХО ПУСТОТЫ!</b> Повторный каст «${sk.name}»!`, 'log-over');
    useCombatSkill(skillId, true);
  }

  combat.lastAttackTimestamp = Date.now();
  checkStageEnemiesState(); updateCombatUI();
}

function checkStageEnemiesState() {
  if (combat.enemies[combat.targetIndex] && combat.enemies[combat.targetIndex].hp <= 0) {
    const nextAliveIdx = combat.enemies.findIndex(e => e.hp > 0);
    if (nextAliveIdx !== -1) combat.targetIndex = nextAliveIdx;
  }
  if (combat.enemies.every(e => e.hp <= 0)) {
    if (combat.isArena || combat.isHorde) handleArenaWaveCleared();
    else if (!combat.isDuel && !combat.isRaid && !combat.isAbyss && !combat.isBossRush) handleStageCleared();
  }
}

function executeEnemySkill(enemy, skillObj) {
  if (!combat.active || enemy.hp <= 0 || player.hp <= 0) return;
  const sId = skillObj.id;
  const sk = SKILLS_DB[sId];
  const skName = sk ? sk.name : 'Спецприем';

  if (sId === 'fireball' || sId === 'cleave' || sId === 'leap') {
    const raw = Math.round(enemy.atk * 1.5);
    addLog(`🔥 <b>${enemy.name}</b> кастует «${skName}»!`, 'log-enemy');
    dealDamageToPlayer(raw, enemy.name, enemy);
  } else if (sId === 'hellfire') {
    const raw = Math.round(enemy.atk * 1.3);
    addLog(`🌋 <b>${enemy.name}</b> обрушивает «${skName}»!`, 'log-enemy');
    dealDamageToPlayer(raw, enemy.name, enemy);
  } else if (sId === 'harvest') {
    const raw = Math.round(enemy.atk * 1.4);
    addLog(`🩸 <b>${enemy.name}</b> применяет «${skName}»!`, 'log-enemy');
    dealDamageToPlayer(raw, enemy.name, enemy);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(raw * 0.5));
  } else if (sId === 'shield') {
    const healVal = Math.round(enemy.maxHp * 0.20);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + healVal);
    addLog(`🛡 <b>${enemy.name}</b> активирует «Барьер» (+${healVal.toLocaleString()} HP)!`, 'log-enemy');
  } else {
    const raw = Math.round(enemy.atk * 1.2);
    addLog(`⚡ <b>${enemy.name}</b> использует «${skName}»!`, 'log-enemy');
    dealDamageToPlayer(raw, enemy.name, enemy);
  }
}

function dealDamageToPlayer(rawDmg, attackerName, enemyObj = null) {
  if (!combat.active || player.hp <= 0) return;
  if (combat.chronophaseImmuneTimer > 0) return;
  if (combat.playerDodges > 0) {
    combat.playerDodges--;
    Sound.play('dodge');
    if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), 'УКЛОНЕНИЕ!', 'dodge');
    return;
  }

  let incomingDmg = Math.max(1, Math.round(rawDmg * (1 - getPlayerDR())));
  if (player.shield > 0) {
    if (player.shield >= incomingDmg) {
      player.shield -= incomingDmg;
      if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `🛡 -${incomingDmg.toLocaleString()}`, 'shield');
      incomingDmg = 0;
    } else {
      incomingDmg -= player.shield;
      if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `🛡 -${player.shield.toLocaleString()}`, 'shield');
      player.shield = 0;
    }
  }

  if (incomingDmg > 0) {
    player.hp = Math.max(0, player.hp - incomingDmg);
    Sound.play('hurt');
    if (typeof triggerDamageFlash === 'function') triggerDamageFlash();
    if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `-${incomingDmg.toLocaleString()}`, 'player-dmg');
    if (player.pacts.vamp && enemyObj && enemyObj.hp > 0) {
      enemyObj.hp = Math.min(enemyObj.maxHp, enemyObj.hp + Math.round(incomingDmg * 0.30));
    }
  }

  if (player.transcendLevel >= 2 && (player.hp / getPlayerMaxHp()) < 0.30 && player.potions > 0 && player.hp > 0) {
    usePotionCombat();
    addLog(`🌿 <b>АВТО-НАСТОЙКА:</b> Выпита настойка при падении здоровья!`, 'log-hit');
  }

  if (player.hp <= 0 && player.astrolabe.chronophase && (combat.chronophaseCd || 0) <= 0) {
    player.hp = getPlayerMaxHp(); 
    combat.chronophaseCd = 90.0; 
    combat.chronophaseImmuneTimer = 4.0;
    Sound.play('overcharge');
    addLog(`⏳ <b>ХРОНО-ФАЗА:</b> Спасение от гибели!`, 'log-over');
    updateCombatUI(); 
    return;
  }

  updateCombatUI();

  if (player.hp <= 0) {
    handlePlayerDeath();
  }
}

function enemyAttackTick(enemy) {
  if (!combat.active || enemy.hp <= 0 || player.hp <= 0) return;
  dealDamageToPlayer(enemy.atk, enemy.name, enemy);
}

function handleStageCleared() {
  addLog(`🏆 <b>Зал зачищен!</b>`, 'log-over');
  const loot = generateLoot(combat.dungeon, combat.diff);
  player.inventory.push(loot);
  saveGame(); 
  updateUI();
  combat.stageIndex++;

  if (combat.dungeon && combat.dungeon.stages && combat.stageIndex < combat.dungeon.stages.length) {
    setTimeout(() => { if (combat.active) loadCombatStage(); }, 600);
  } else {
    if (combat.dungeon && combat.dungeon.cooldownSec > 0) {
      dungeonCooldowns[combat.dungeon.id] = Date.now() + combat.dungeon.cooldownSec * 1000;
    }
    if (player.activeBuffs.frenzy > 0) player.activeBuffs.frenzy--;
    if (player.activeBuffs.titan > 0) player.activeBuffs.titan--;
    saveGame();
    addLog(`🎉 <b>Подземелье полностью зачищено! Получен трофей: [${loot.fullName}]</b>`, 'log-crit');
    setTimeout(() => {
      endCombat();
    }, 1200);
  }
}

function handlePlayerDeath() {
  if (!combat.active) return;
  combat.active = false;
  Sound.play('death');

  addLog(`☠ <b>Поражение! Герой пал в бою (-20% золота)...</b>`, 'log-enemy');

  setTimeout(() => {
    player.gold = Math.round(player.gold * 0.8);
    player.hp = getPlayerMaxHp(); 
    player.shield = 0;
    saveGame(); 
    endCombat();
  }, 1200);
}

function usePotionCombat() {
  if (player.potions <= 0 || player.hp >= getPlayerMaxHp()) return;
  player.potions--;
  const hGain = Math.round(getPlayerMaxHp() * 0.5);
  player.hp = Math.min(getPlayerMaxHp(), player.hp + hGain);
  Sound.play('heal');
  if (typeof spawnCombatText === 'function') spawnCombatText(document.getElementById('c-player-hp-txt'), `+${hGain.toLocaleString()}`, 'heal');
  saveGame(); updateCombatUI();
}

function fleeCombat() {
  Sound.play('click');
  player.shield = 0; saveGame(); endCombat();
}

function endCombat() {
  combat.active = false; combat.isArena = false; combat.isDuel = false; combat.isRaid = false; combat.isAbyss = false;
  combat.isHorde = false; combat.isBossRush = false; combat.isPurgatory = false;
  combat.playerDodges = 0; combat.hasteTimer = 0; combat.deathGameTimer = 0;
  document.getElementById('nav-combat-btn').style.display = 'none';
  switchTab('dungeons'); updateUI();
}