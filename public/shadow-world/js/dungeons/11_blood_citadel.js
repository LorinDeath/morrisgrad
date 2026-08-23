(function() {
  // Пул кровожадных существ для 12 этажей Кровавой Цитадели
  const bloodEnemies = [
    { id: 'm_bc_1', name: 'Кровавый Рыцарь', hp: 8000, atk: 1200, def: 320, xp: 6800, gold: 5200, isBoss: false, avatar: 'jailer', attackSpeed: 1.9, desc: 'Закованный в багровые латы страж цитадели, питающийся жизненной силой врагов.' },
    { id: 'm_bc_2', name: 'Кровавая Банши', hp: 7500, atk: 1350, def: 280, xp: 7100, gold: 5500, isBoss: false, avatar: 'skeleton', attackSpeed: 2.1, desc: 'Вопли этого духа источают порчу и замораживают кровь в венах.' },
    { id: 'm_bc_3', name: 'Ночной Хищник-Вампир', hp: 7200, atk: 1450, def: 250, xp: 7400, gold: 5800, isBoss: false, avatar: 'shadow_guard', attackSpeed: 1.7, desc: 'Проворный бессмертный убийца, нападающий из кромешной тьмы.' },
    { id: 'e_blood_priest', name: 'Элитный Жрец Крови [ЭЛИТА]', hp: 15000, atk: 1850, def: 480, xp: 12000, gold: 9500, isBoss: false, avatar: 'priest', attackSpeed: 1.8, desc: 'Проводит жуткие ритуалы, усиливая легионы вампиров.' }
  ];

  const dungeonData = {
    id: 'dungeon_blood_citadel',
    name: '🩸 Кровавая Цитадель Кармиллы',
    desc: 'Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.',
    minLvl: 75,
    cooldownSec: 380,
    stages: generateTowerStages(
      12,
      'Кровь',
      bloodEnemies,
      { id: 'b_carmilla', name: 'Королева Кармилла [БОСС]', hp: 52000, atk: 2900, def: 800, xp: 70000, gold: 55000, isBoss: true, avatar: 'priest', attackSpeed: 1.6, desc: 'Властная бессмертная королева ночи, чья жажда крови не знает границ.' }
    ),
    itemPool: [
      { name: 'Клинок Багрового Заката', slot: 'weapon', baseAtk: 1500, baseDef: 200, baseHp: 3000, baseAspd: 55, pierce: 250 },
      { name: 'Коса Истинного Вампира', slot: 'weapon', baseAtk: 1650, baseDef: 120, baseHp: 2500, baseAspd: 65, pierce: 220 },
      { name: 'Латы Кровавого Монарха', slot: 'armor', baseAtk: 0, baseDef: 580, baseHp: 5000, baseAspd: 35, pierce: 0 },
      { name: 'Венец Бессмертия', slot: 'helm', baseAtk: 450, baseDef: 550, baseHp: 3800, baseAspd: 40, pierce: 80 },
      { name: 'Поступь Носферату', slot: 'boots', baseAtk: 0, baseDef: 260, baseHp: 2100, baseAspd: 90, pierce: 90 },
      { name: 'Наручи Багрового Ритуала', slot: 'bracers', baseAtk: 350, baseDef: 410, baseHp: 2900, baseAspd: 70, pierce: 150 },
      { name: 'Амулет Вечной Жизни', slot: 'amulet', baseAtk: 600, baseDef: 340, baseHp: 3300, baseAspd: 55, pierce: 140 },
      { name: 'Кольцо Жажды Крови', slot: 'ring', baseAtk: 650, baseDef: 280, baseHp: 2900, baseAspd: 80, pierce: 130 },
      { name: 'Плащ Кровавой Луны', slot: 'cloak', baseAtk: 480, baseDef: 600, baseHp: 3400, baseAspd: 30, pierce: 70 },
      { name: 'Пояс Крови', slot: 'belt', baseAtk: 220, baseDef: 400, baseHp: 3200, baseAspd: 20, pierce: 40 },
      { name: 'Реликвия Древнего Клана', slot: 'relic', baseAtk: 750, baseDef: 480, baseHp: 3900, baseAspd: 50, pierce: 170 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();