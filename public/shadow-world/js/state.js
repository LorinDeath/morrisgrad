let player = {
  lvl: 1, exp: 0, expNext: 100, talentPoints: 0,
  hp: 120, baseMaxHp: 120, baseAtk: 12, baseDef: 4, baseAspd: 0,
  baseCrit: 5, baseVamp: 0, basePierce: 0, baseRegen: 1,
  gold: 80, potions: 3, shield: 0,
  
  lastSaveTimestamp: Date.now(),
  trainingLevels: { atk: 1, def: 1, hp: 1, crit: 1, pierce: 1, goldTrack: 1, expTrack: 1, aspd: 1, vamp: 1 },
  trainingBonuses: { atk: 0, def: 0, hp: 0, crit: 0, pierce: 0, aspd: 0, vamp: 0 },
  trainingProgress: { atk: 0, def: 0, hp: 0, crit: 0, pierce: 0, goldTrack: 0, expTrack: 0, aspd: 0, vamp: 0 },
  // ...

  transcendLevel: 0, voidSpheres: 0, voidPerks: { supercrit: 0, overheal: 0, echo: 0, truepierce: 0 },
  heritageBypassSlot: 'weapon',
  
  abyssRecord: 0, currentAbyssFloor: 1, synthDust: 0, storedRunes: [],
  anomalyTier: 0, darkMatter: 0, matrixPerks: { damage: 0, charge: 0 },
  awakenedSkills: {}, astrolabe: { midas: false, chronophase: false, supernova: false, chaoslord: false },
  activeBuffs: { frenzy: 0, titan: 0 },
  
  talents: { atk: 0, pierce: 0, over: 0, hp: 0, def: 0, vamp: 0, aspd: 0, crit: 0, cd: 0 },
  skills: { fireball: { lvl: 1 }, hellfire: { lvl: 1 }, harvest: { lvl: 1 }, shield: { lvl: 1 }, cleave: { lvl: 1 }, haste: { lvl: 1 }, leap: { lvl: 1 }, deathgame: { lvl: 1 } },
  equippedSkills: ['fireball', 'hellfire', 'harvest'],

  equipment: { weapon: null, armor: null, helm: null, boots: null, amulet: null, ring: null, belt: null, cloak: null, bracers: null, relic: null },
  inventory: [],
  storyIndex: 0, storyProgress: 0,
  pacts: { vamp: false, speed: false, stoneskin: false, overlord: false },
  mechanicStats: { forgeCount: 0, runeCount: 0, overchargeHits: 0, curseMutations: 0, bossRushWins: 0, raidWins: 0, duelWins: 0 }
};

let dungeonCooldowns = {};
let dailyQuests = [];
let currentBestiaryDungeonId = null;

let combat = {
  active: false, isArena: false, isDuel: false, isRaid: false, isAbyss: false,
  isHorde: false, isBossRush: false, isPurgatory: false,
  hordeTimer: 0, hordeScore: 0, bossRushIndex: 0,
  abyssFloor: 1, dungeon: null, diff: 1, stageIndex: 0, enemies: [], targetIndex: 0,
  lastAttackTimestamp: 0, skillCooldowns: {}, arenaTimer: 30, waveSpawning: false,
  playerDodges: 0, hasteTimer: 0, deathGameTimer: 0, raidEnrageTimer: 45.0,
  hitCounter: 0, chronophaseCd: 0, chronophaseImmuneTimer: 0, mutatedEnemiesKilledCount: 0
};

function saveGame() {
  player.lastSaveTimestamp = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ player, dungeonCooldowns, dailyQuests })); } catch(e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.player) Object.assign(player, data.player);
    if (data.dungeonCooldowns) dungeonCooldowns = data.dungeonCooldowns;
    if (data.dailyQuests) dailyQuests = data.dailyQuests;

    for (let s in SLOTS) {
      if (player.equipment[s] === undefined) player.equipment[s] = null;
    }

    for (let s in player.equipment) {
      if (player.equipment[s]) {
        if (!player.equipment[s].baseReqLvl) {
          player.equipment[s].baseReqLvl = Math.max(1, (player.equipment[s].reqLvl || 1) - ((player.equipment[s].quality || 1) - 1) * 5 - ((player.equipment[s].dropDiff || 1) - 1) * 3 - (player.equipment[s].stars || 0) * 4);
        }
        player.equipment[s].reqLvl = calcItemReqLvl(player.equipment[s]);
      }
    }
    player.inventory.forEach(it => {
      if (!it.baseReqLvl) {
        it.baseReqLvl = Math.max(1, (it.reqLvl || 1) - ((it.quality || 1) - 1) * 5 - ((it.dropDiff || 1) - 1) * 3 - (it.stars || 0) * 4);
      }
      it.reqLvl = calcItemReqLvl(it);
    });

    return true;
  } catch(e) { return false; }
}

function resetSaveData() {
  if (confirm("Полный сброс сохранения?")) { localStorage.removeItem(SAVE_KEY); location.reload(); }
}

function addExp(amount) {
  player.exp += amount;
  while (player.exp >= player.expNext) {
    player.exp -= player.expNext;
    player.lvl++; 
    player.talentPoints++;
    player.expNext = Math.round(100 * Math.pow(1.45, player.lvl - 1));
    player.baseMaxHp += 25; 
    player.baseAtk += 4; 
    player.baseDef += 2;
    player.hp = getPlayerMaxHp();
    
    addLog(`⚡ <b>НОВЫЙ УРОВЕНЬ: ${player.lvl}! (+1 TP)</b>`, 'log-crit');
    Sound.play('overcharge');
    const pEl = document.getElementById('c-player-hp-txt');
    if (pEl) spawnCombatText(pEl, `УРОВЕНЬ ${player.lvl}!`, 'crit');
  }
  saveGame();
}

function checkMechanicQuest(type, amount = 1) {
  if (!player.mechanicStats) player.mechanicStats = { forgeCount: 0, runeCount: 0, overchargeHits: 0, curseMutations: 0, bossRushWins: 0, raidWins: 0, duelWins: 0 };
  if (type === 'forge') player.mechanicStats.forgeCount += amount;
  if (type === 'rune') player.mechanicStats.runeCount += amount;
  if (type === 'overcharge') player.mechanicStats.overchargeHits += amount;
  if (type === 'curse') player.mechanicStats.curseMutations += amount;
  if (type === 'bossrush') player.mechanicStats.bossRushWins += amount;
  if (type === 'raid') player.mechanicStats.raidWins += amount;
  if (type === 'duel') player.mechanicStats.duelWins += amount;
}

function generateNewQuests() {
  dailyQuests = [
    { title: 'Зачистка Разлома', desc: 'Уничтожьте любых монстров в бою', targetEnemyId: 'any', total: 15, progress: 0, xp: 500, gold: 400, done: false },
    { title: 'Охота на Болотных Тварей', desc: 'Сразите монстров Топей', targetEnemyId: 'b_swamp_horror', total: 2, progress: 0, xp: 800, gold: 650, done: false },
    { title: 'Истребитель Теней', desc: 'Одолейте Теневых Стражей', targetEnemyId: 'b_shadow_guard', total: 3, progress: 0, xp: 600, gold: 450, done: false }
  ];
  saveGame();
}