(function() {
  // Безумный бестиарий финального босс-раша: существа нуль-измерения с запредельными параметрами
  const nullDimensionEnemies = [
    { 
      id: 'm_nd_1', 
      name: '⬛ Нуль-Разрушитель', 
      hp: 600000, 
      atk: 25000, 
      def: 7500, 
      xp: 600000, 
      gold: 500000, 
      isBoss: false, 
      avatar: 'matrix', 
      attackSpeed: 1.5, 
      desc: 'Первородный уничтожитель материи, стирающий целые пласты кода реальности одним ударом.' 
    },
    { 
      id: 'm_nd_2', 
      name: '🌀 Сингулярный Коллапсар', 
      hp: 550000, 
      atk: 28000, 
      def: 6800, 
      xp: 630000, 
      gold: 520000, 
      isBoss: false, 
      avatar: 'reaper', 
      attackSpeed: 1.8, 
      desc: 'Живая гравитационная аномалия, сжимающая пространство в бесконечную точку.' 
    },
    { 
      id: 'm_nd_3', 
      name: '⚡ Апокалиптический Фантом', 
      hp: 650000, 
      atk: 23000, 
      def: 8200, 
      xp: 660000, 
      gold: 550000, 
      isBoss: false, 
      avatar: 'dragon', 
      attackSpeed: 2.0, 
      desc: 'Призрак из конца времен, питающийся угасающей энергией вселенной.' 
    },
    { 
      id: 'e_absolute_avatar', 
      name: '👁️ Аватар Абсолюта [ЭЛИТА]', 
      hp: 1500000, 
      atk: 42000, 
      def: 14000, 
      xp: 1500000, 
      gold: 1200000, 
      isBoss: false, 
      avatar: 'matrix', 
      attackSpeed: 1.6, 
      desc: 'Прямая проекция Создателя, охраняющая тронный зал нуль-измерения.' 
    }
  ];

  const dungeonData = {
    id: 'dungeon_null_dimension',
    name: '⬛ Нуль-Измерение Создателя (20 Этажей)',
    desc: 'Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.',
    minLvl: 300,
    cooldownSec: 720,
    stages: generateTowerStages(
      20,
      'Нуль-Измерение',
      nullDimensionEnemies,
      { 
        id: 'b_absolute_creator', 
        name: 'Архитектор Бытия [ФИНАЛЬНЫЙ БОСС]', 
        hp: 6000000, 
        atk: 65000, 
        def: 22000, 
        xp: 12000000, 
        gold: 10000000, 
        isBoss: true, 
        avatar: 'matrix', 
        attackSpeed: 1.2, 
        desc: 'Высшее божество и создатель всего кода. Тот, кто написал этот мир — и тот, кто готов нажать кнопку полного удаления.' 
      }
    ),
    itemPool: [
      { name: 'Клинок Первородного Ничто', slot: 'weapon', baseAtk: 12000, baseDef: 1500, baseHp: 25000, baseAspd: 120, pierce: 2500 },
      { name: 'Жезл Абсолютного Замысла', slot: 'weapon', baseAtk: 13500, baseDef: 1000, baseHp: 22000, baseAspd: 140, pierce: 2300 },
      { name: 'Одеяние Архитектора', slot: 'armor', baseAtk: 2000, baseDef: 9500, baseHp: 50000, baseAspd: 80, pierce: 0 },
      { name: 'Корона Создателя', slot: 'helm', baseAtk: 3500, baseDef: 3500, baseHp: 32000, baseAspd: 100, pierce: 800 },
      { name: 'Поступь Запределья', slot: 'boots', baseAtk: 0, baseDef: 3000, baseHp: 20000, baseAspd: 250, pierce: 500 },
      { name: 'Наручи Нулевой Точки', slot: 'bracers', baseAtk: 2500, baseDef: 3200, baseHp: 24000, baseAspd: 110, pierce: 700 },
      { name: 'Амулет Первопричины', slot: 'amulet', baseAtk: 5500, baseDef: 3000, baseHp: 28000, baseAspd: 120, pierce: 1000 },
      { name: 'Кольцо Сингулярности Бытия', slot: 'ring', baseAtk: 4800, baseDef: 2600, baseHp: 26000, baseAspd: 140, pierce: 900 },
      { name: 'Плащ Чистой Энтропии', slot: 'cloak', baseAtk: 3200, baseDef: 4000, baseHp: 30000, baseAspd: 90, pierce: 600 },
      { name: 'Пояс Создателя Миров', slot: 'belt', baseAtk: 3000, baseDef: 4200, baseHp: 29000, baseAspd: 70, pierce: 550 },
      { name: 'Реликвия Абсолюта', slot: 'relic', baseAtk: 4500, baseDef: 3000, baseHp: 35000, baseAspd: 80, pierce: 1200 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();