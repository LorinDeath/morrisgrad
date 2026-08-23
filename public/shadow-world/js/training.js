// Модуль пассивных тренировок и полигона с прогрессивной разблокировкой по Престижу
const TRAINING_CONFIG = {
  atk:      { name: '⚔ Атака',           baseTime: 900,  baseCost: 1000,  statPerLevel: 1,   type: 'stat',     minTranscend: 0 },
  def:      { name: '🛡 Броня',          baseTime: 1200, baseCost: 1500,  statPerLevel: 1,   type: 'stat',     minTranscend: 0 },
  hp:       { name: '❤️ Здоровье',       baseTime: 600,  baseCost: 800,   statPerLevel: 15,  type: 'stat',     minTranscend: 0 },
  goldTrack:{ name: '🪙 Пассивное Золото', baseTime: 400,  baseCost: 600,   statPerLevel: 35,  type: 'resource', resource: 'gold', minTranscend: 1 },
  expTrack: { name: '📜 Пассивный Опыт',   baseTime: 700,  baseCost: 900,   statPerLevel: 25,  type: 'resource', resource: 'exp',  minTranscend: 1 },
  crit:     { name: '🎯 Крит. шанс',     baseTime: 1800, baseCost: 3000,  statPerLevel: 0.2, type: 'stat',     minTranscend: 2 },
  pierce:   { name: '🗡 Пробой',         baseTime: 1500, baseCost: 2500,  statPerLevel: 1,   type: 'stat',     minTranscend: 3 },
  aspd:     { name: '⚡ Скорость атаки', baseTime: 2200, baseCost: 5000,  statPerLevel: 1,   type: 'stat',     minTranscend: 4 },
  vamp:     { name: '🩸 Вампиризм',      baseTime: 3000, baseCost: 10000, statPerLevel: 0.5, type: 'stat',     minTranscend: 5 }
};

function initTrainingData() {
  if (typeof player === 'undefined') return;
  if (!player.trainingLevels) {
    player.trainingLevels = { atk: 1, def: 1, hp: 1, crit: 1, pierce: 1, goldTrack: 1, expTrack: 1, aspd: 1, vamp: 1 };
  }
  if (!player.trainingBonuses) {
    player.trainingBonuses = { atk: 0, def: 0, hp: 0, crit: 0, pierce: 0, aspd: 0, vamp: 0 };
  }
  if (!player.trainingProgress) {
    player.trainingProgress = { atk: 0, def: 0, hp: 0, crit: 0, pierce: 0, goldTrack: 0, expTrack: 0, aspd: 0, vamp: 0 };
  }
}

function getTrainingTime(statKey) {
  initTrainingData();
  const lvl = player.trainingLevels[statKey] || 1;
  const conf = TRAINING_CONFIG[statKey];
  return Math.round(conf.baseTime * Math.pow(1.28, lvl - 1));
}

function getTrainingCost(statKey) {
  initTrainingData();
  const lvl = player.trainingLevels[statKey] || 1;
  const conf = TRAINING_CONFIG[statKey];
  return Math.round(conf.baseCost * Math.pow(3.2, lvl - 1));
}

function upgradeTrainingBuilding(statKey) {
  initTrainingData();
  const conf = TRAINING_CONFIG[statKey];
  const playerTranscend = player.transcendLevel || 0;
  
  if (conf.minTranscend && playerTranscend < conf.minTranscend) {
    return alert(`🔒 Этот трек заблокирован! Требуется Возвышение (Престиж) ур. ${conf.minTranscend}+`);
  }

  const cost = getTrainingCost(statKey);
  if (player.gold < cost) return alert(`Требуется ${cost.toLocaleString()} Золота 🪙!`);

  player.gold -= cost;
  player.trainingLevels[statKey] = (player.trainingLevels[statKey] || 1) + 1;
  
  if (typeof Sound !== 'undefined') Sound.play('overcharge');
  saveGame();
  updateTrainingView();
  updateUI();
}

function updatePassiveTrainingTick(dt) {
  if (typeof player === 'undefined') return;
  initTrainingData();
  const playerTranscend = player.transcendLevel || 0;

  for (let key in TRAINING_CONFIG) {
    const conf = TRAINING_CONFIG[key];
    
    // Пропуск заблокированных престижем параметров
    if (conf.minTranscend && playerTranscend < conf.minTranscend) continue;

    const totalSecNeeded = getTrainingTime(key);
    if (!player.trainingProgress[key]) player.trainingProgress[key] = 0;
    
    player.trainingProgress[key] += dt;
    
    // Если накоплено на 1 или более полных циклов
    if (player.trainingProgress[key] >= totalSecNeeded) {
      const completedCycles = Math.floor(player.trainingProgress[key] / totalSecNeeded);
      player.trainingProgress[key] = player.trainingProgress[key] % totalSecNeeded; // Сохраняем остаток секунд

      const gainPerCycle = conf.statPerLevel * (player.trainingLevels[key] || 1);
      const totalGain = gainPerCycle * completedCycles;
      
      if (conf.type === 'resource') {
        if (conf.resource === 'gold') {
          player.gold += totalGain;
          addLog(`⛺ <b>Полигон:</b> Сбор завершен (x${completedCycles})! Получено: <b>+${totalGain.toLocaleString()} 🪙</b>`, 'log-over');
        } else if (conf.resource === 'exp') {
          addExp(totalGain);
          addLog(`⛺ <b>Полигон:</b> Занятие завершено (x${completedCycles})! Получено: <b>+${totalGain.toLocaleString()} XP 📜</b>`, 'log-over');
        }
      } else {
        player.trainingBonuses[key] = +(player.trainingBonuses[key] + totalGain).toFixed(1);
        addLog(`⛺ <b>Полигон:</b> Тренировка завершена (x${completedCycles})! Накоплено: <b>+${totalGain} к ${conf.name}</b>`, 'log-over');
      }
      
      saveGame();
      updateUI();
    }
  }
}
function updateTrainingView() {
  if (typeof player === 'undefined') return;
  initTrainingData();

  const container = document.getElementById('training-tracks-list');
  if (!container) return;
  container.innerHTML = '';

  const playerTranscend = player.transcendLevel || 0;

  for (let key in TRAINING_CONFIG) {
    const conf = TRAINING_CONFIG[key];
    const isLocked = conf.minTranscend && playerTranscend < conf.minTranscend;
    const lvl = player.trainingLevels[key] || 1;
    const progress = player.trainingProgress[key] || 0;
    const maxTime = getTrainingTime(key);
    const cost = getTrainingCost(key);
    const pct = isLocked ? 0 : Math.min(100, (progress / maxTime) * 100);
    
    const minutesLeft = Math.ceil((maxTime - progress) / 60);
    const gainPerCycle = conf.statPerLevel * lvl;

    let infoLabel = '';
    if (isLocked) {
      infoLabel = `<span style="font-size:9.5px; color:#f87171; font-weight:bold;">🔒 Требуется Престиж Ур. ${conf.minTranscend}</span>`;
    } else if (conf.type === 'resource') {
      infoLabel = `<span style="font-size:9.5px; color:var(--gold);">Награда: +${gainPerCycle.toLocaleString()}</span>`;
    } else {
      const currentBonus = player.trainingBonuses[key] || 0;
      infoLabel = `<span style="font-size:9.5px; color:var(--gold);">Бонус: +${currentBonus}</span>`;
    }

    const card = document.createElement('div');
    card.className = 'gear-card';
    card.style.marginBottom = '6px';
    card.style.background = isLocked ? 'rgba(15, 23, 42, 0.4)' : 'rgba(15, 23, 42, 0.6)';
    card.style.opacity = isLocked ? '0.7' : '1.0';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <b style="font-size:11px; color:#fff;">${conf.name} [Ур. ${lvl}]</b>
        ${infoLabel}
      </div>
      <div style="font-size:9px; color:var(--text-muted); margin-bottom:4px;">
        ${isLocked ? `Заблокировано. Требуется Возвышение Пустоты Ур. ${conf.minTranscend}.` : `Цикл: за ${Math.ceil(maxTime / 60)} мин. (Осталось: ~${minutesLeft} мин.)`}
      </div>
      <div class="progress-wrap" style="height:6px; margin-bottom:5px;">
        <div class="progress-fill charge-tier-opt" style="width:${pct}%;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:8.5px; color:var(--text-muted);">${isLocked ? 'Закрыто' : `Улучшение базы: 🪙 ${cost.toLocaleString()}`}</span>
        <button class="btn btn-sm ${isLocked ? 'btn-danger' : 'btn-gold'}" onclick="upgradeTrainingBuilding('${key}')">
          ${isLocked ? `🔒 Престиж Ур. ${conf.minTranscend}` : '⬆ Улучшить лагерь'}
        </button>
      </div>
    `;
    container.appendChild(card);
  }
}

setInterval(() => {
  const trainingView = document.getElementById('view-training');
  if (trainingView && trainingView.classList.contains('active')) {
    updateTrainingView();
  }
}, 1000);