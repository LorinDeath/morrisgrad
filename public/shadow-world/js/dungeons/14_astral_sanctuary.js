(function() {
  // Пул безумных астральных существ с перекаченными параметрами и бешеной скоростью
  const franticAstralEnemies = [
    { 
      id: 'm_as_1', 
      name: '⚡ Квазаровый Бегун-Психопат', 
      hp: 42000, 
      atk: 4500, 
      def: 1100, 
      xp: 35000, 
      gold: 28000, 
      isBoss: false, 
      avatar: 'frost_elem', 
      attackSpeed: 4.5, 
      desc: 'Разорванный гравитацией звёздный дух, который двигается с бешеной, неестественной частотой, стирая всё на своем пути.' 
    },
    { 
      id: 'm_as_2', 
      name: '🌀 Парадоксальный Фрактал Света', 
      hp: 38000, 
      atk: 5100, 
      def: 850, 
      xp: 37000, 
      gold: 29500, 
      isBoss: false, 
      avatar: 'matrix', 
      attackSpeed: 3.8, 
      desc: 'Геометрический кошмар из параллельного спектра, чья атака буквально игнорирует логику пространства и бросает в дрожь.' 
    },
    { 
      id: 'm_as_3', 
      name: '👁️ Многомерный Звёздный Паразит', 
      hp: 45000, 
      atk: 4800, 
      def: 1200, 
      xp: 39000, 
      gold: 31000, 
      isBoss: false, 
      avatar: 'skeleton', 
      attackSpeed: 4.2, 
      desc: 'Впитывает свет сотен умирающих галактик, постоянно находясь в состоянии судорожного берсерка.' 
    },
    { 
      id: 'e_pulsar_berserk', 
      name: '🔥 Сверхновый Берсерк [ЭЛИТА]', 
      hp: 95000, 
      atk: 6800, 
      def: 1900, 
      xp: 75000, 
      gold: 60000, 
      isBoss: false, 
      avatar: 'dragon', 
      attackSpeed: 3.5, 
      desc: 'Элитное астральное чудовище с колоссально перекаченными статами, искривляющее время вокруг себя.' 
    }
  ];

  const dungeonData = {
    id: 'dungeon_astral_sanctuary',
    name: '✨ Астральное Святилище Звёзд',
    desc: 'Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.',
    minLvl: 130,
    cooldownSec: 450,
    stages: generateTowerStages(
      12,
      'Астральный Хаос',
      franticAstralEnemies,
      { 
        id: 'b_astral_demiurge', 
        name: 'Демиург Селестия [БОСС]', 
        hp: 280000, 
        atk: 8900, 
        def: 2800, 
        xp: 400000, 
        gold: 320000, 
        isBoss: true, 
        avatar: 'dragon', 
        attackSpeed: 2.8, 
        desc: 'Верховный архитектор звёздных систем, сошедший с ума от бесконечности и карающий смертных чудовищной мощью.' 
      }
    ),
    itemPool: [
      { name: 'Клинок Расколотого Космоса', slot: 'weapon', baseAtk: 2900, baseDef: 400, baseHp: 5500, baseAspd: 65, pierce: 550 },
      { name: 'Посох Сингулярности', slot: 'weapon', baseAtk: 3200, baseDef: 250, baseHp: 4800, baseAspd: 75, pierce: 500 },
      { name: 'Кираса Астрального Света', slot: 'armor', baseAtk: 500, baseDef: 2100, baseHp: 11000, baseAspd: 40, pierce: 0 },
      { name: 'Венец Звёздного Разума', slot: 'helm', baseAtk: 950, baseDef: 1300, baseHp: 8000, baseAspd: 45, pierce: 250 },
      { name: 'Поступь Сверхновой', slot: 'boots', baseAtk: 0, baseDef: 650, baseHp: 5200, baseAspd: 95, pierce: 210 },
      { name: 'Наручи Квазара', slot: 'bracers', baseAtk: 620, baseDef: 850, baseHp: 5800, baseAspd: 55, pierce: 180 },
      { name: 'Амулет Звёздного Ядра', slot: 'amulet', baseAtk: 1400, baseDef: 750, baseHp: 7000, baseAspd: 60, pierce: 300 },
      { name: 'Кольцо Бесконечной Орбиты', slot: 'ring', baseAtk: 1100, baseDef: 650, baseHp: 6200, baseAspd: 70, pierce: 240 },
      { name: 'Плащ Ткани Вселенной', slot: 'cloak', baseAtk: 1050, baseDef: 1500, baseHp: 8500, baseAspd: 35, pierce: 190 },
      { name: 'Пояс Гравитационного Коллапса', slot: 'belt', baseAtk: 550, baseDef: 1000, baseHp: 7200, baseAspd: 30, pierce: 160 },
      { name: 'Реликвия Селестии', slot: 'relic', baseAtk: 1200, baseDef: 800, baseHp: 6500, baseAspd: 40, pierce: 250 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();