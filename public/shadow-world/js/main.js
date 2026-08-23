setInterval(() => {
  const dt = 0.06;
  
  // Пассивный прирост статов со временем на полигоне
  updatePassiveTrainingTick(dt);

  const maxHp = getPlayerMaxHp();
  if (player.hp < maxHp) player.hp = Math.min(maxHp, player.hp + (combat.active ? getPlayerRegen() : getPlayerRegen() * 10) * dt);

  if (combat.active && player.hp > 0) {
    if (combat.hasteTimer > 0) combat.hasteTimer = Math.max(0, combat.hasteTimer - dt);
    if (combat.deathGameTimer > 0) combat.deathGameTimer = Math.max(0, combat.deathGameTimer - dt);
    if (combat.chronophaseCd > 0) combat.chronophaseCd = Math.max(0, combat.chronophaseCd - dt);
    if (combat.chronophaseImmuneTimer > 0) combat.chronophaseImmuneTimer = Math.max(0, combat.chronophaseImmuneTimer - dt);

    if (combat.isHorde) {
      combat.hordeTimer += dt;
      if (Math.floor(combat.hordeTimer) % 15 === 0 && Math.floor(combat.hordeTimer) > 0 && !combat.waveSpawning) {
        spawnArenaReinforcement();
      }
    }

    if (combat.isRaid) {
      combat.raidEnrageTimer -= dt;
      if (combat.raidEnrageTimer <= 0) { player.hp = 0; handlePlayerDeath(); }
    }

    if (combat.isArena && !combat.waveSpawning) {
      combat.arenaTimer -= dt;
      if (combat.arenaTimer <= 0) { combat.arenaTimer = 30; spawnArenaReinforcement(); }
    }

    for (let sId in combat.skillCooldowns) {
      if (combat.skillCooldowns[sId] > 0) combat.skillCooldowns[sId] = Math.max(0, combat.skillCooldowns[sId] - dt);
    }

    combat.enemies.forEach(e => {
      if (e.hp > 0) {
        if (e.skills) e.skills.forEach(s => { s.cd -= dt; if (s.cd <= 0) { s.cd = s.maxCd; executeEnemySkill(e, s); } });
        e.castProgress += dt / (e.attackSpeed * (combat.deathGameTimer > 0 ? 2.0 : 1.0));
        if (e.castProgress >= 1.0) { e.castProgress = 0; enemyAttackTick(e); }
      }
    });
    updateCombatUI();
  }

  DUNGEONS.forEach(d => {
    const cdEnd = dungeonCooldowns[d.id] || 0;
    if (cdEnd > 0 && Date.now() >= cdEnd) delete dungeonCooldowns[d.id];
  });
}, 60);

setInterval(saveGame, 10000);

window.onload = function() {
  loadGame();
  initTrainingData();
  
  // Расчет прогресса тренировок за время отсутствия
  if (player.lastSaveTimestamp) {
    const offlineSeconds = Math.floor((Date.now() - player.lastSaveTimestamp) / 1000);
    if (offlineSeconds > 0) {
      updatePassiveTrainingTick(offlineSeconds);
    }
  }

  if (dailyQuests.length === 0) generateNewQuests();
  updateUI();
  switchTab('profile');
};