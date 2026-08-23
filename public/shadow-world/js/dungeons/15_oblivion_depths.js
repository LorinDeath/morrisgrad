(function() {
  // Пул кошмарных сущностей небытия и энтропии для 15 этажей
  const oblivionEnemies = [
    { 
      id: 'm_od_1', 
      name: 'Тень Забвения', 
      hp: 55000, 
      atk: 4800, 
      def: 1300, 
      xp: 50000, 
      gold: 40000, 
      isBoss: false, 
      avatar: 'reaper', 
      attackSpeed: 1.8, 
      desc: 'Бесплотный силуэт, стирающий из памяти саму историю сражений.' 
    },
    { 
      id: 'm_od_2', 
      name: 'Пожиратель Памяти', 
      hp: 51000, 
      atk: 5300, 
      def: 1100, 
      xp: 53000, 
      gold: 42000, 
      isBoss: false, 
      avatar: 'shadow_guard', 
      attackSpeed: 2.1, 
      desc: 'Откалывает фрагменты души каждого, кто осмелится ступить в эти коридоры.' 
    },
    { 
      id: 'm_od_3', 
      name: 'Страж Пустоты', 
      hp: 58000, 
      atk: 4600, 
      def: 1500, 
      xp: 55000, 
      gold: 44000, 
      isBoss: false, 
      avatar: 'matrix', 
      attackSpeed: 1.6, 
      desc: 'Древний молчаливый страж, охраняющий врата в абсолютное ничто.' 
    },
    { 
      id: 'e_entropy_manifest', 
      name: 'Манифестация Энтропии [ЭЛИТА]', 
      hp: 120000, 
      atk: 7200, 
      def: 2200, 
      xp: 95000, 
      gold: 75000, 
      isBoss: false, 
      avatar: 'reaper', 
      attackSpeed: 1.7, 
      desc: 'Воплощение распада и разрушения, ускоряющее гибель всего живого.' 
    }
  ];

  const dungeonData = {
    id: 'dungeon_oblivion_depths',
    name: '🕳 Глубины Небытия (15 Этажей)',
    desc: 'Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.',
    minLvl: 150,
    cooldownSec: 480,
    stages: generateTowerStages(
      15,
      'Небытие',
      oblivionEnemies,
      { 
        id: 'b_oblivion_lord', 
        name: 'Владыка Энтропия [БОСС]', 
        hp: 400000, 
        atk: 11000, 
        def: 3500, 
        xp: 600000, 
        gold: 480000, 
        isBoss: true, 
        avatar: 'reaper', 
        attackSpeed: 1.3, 
        desc: 'Верховный владыка распада, стремящийся обратить всю мультивселенную в абсолютный ноль.' 
      }
    ),
    itemPool: [
      { name: 'Коса Энтропии', slot: 'weapon', baseAtk: 3300, baseDef: 500, baseHp: 6500, baseAspd: 70, pierce: 600 },
      { name: 'Клинок Забвения', slot: 'weapon', baseAtk: 3600, baseDef: 300, baseHp: 5800, baseAspd: 85, pierce: 550 },
      { name: 'Латы Небытия', slot: 'armor', baseAtk: 600, baseDef: 2500, baseHp: 13000, baseAspd: 45, pierce: 0 },
      { name: 'Венец Энтропии', slot: 'helm', baseAtk: 1100, baseDef: 1500, baseHp: 9500, baseAspd: 50, pierce: 300 },
      { name: 'Сапоги Энтропии', slot: 'boots', baseAtk: 750, baseDef: 950, baseHp: 6200, baseAspd: 120, pierce: 0 },
      { name: 'Наручи Забвения', slot: 'bracers', baseAtk: 720, baseDef: 980, baseHp: 6800, baseAspd: 60, pierce: 210 },
      { name: 'Амулет Абсолютной Тьмы', slot: 'amulet', baseAtk: 1600, baseDef: 900, baseHp: 8000, baseAspd: 70, pierce: 350 },
      { name: 'Кольцо Разрушения Рассудка', slot: 'ring', baseAtk: 1300, baseDef: 750, baseHp: 7100, baseAspd: 80, pierce: 290 },
      { name: 'Плащ Небытия', slot: 'cloak', baseAtk: 950, baseDef: 1100, baseHp: 7500, baseAspd: 50, pierce: 150 },
      { name: 'Пояс Энтропии', slot: 'belt', baseAtk: 650, baseDef: 1200, baseHp: 8200, baseAspd: 35, pierce: 190 },
      { name: 'Реликвия Забытых Миров', slot: 'relic', baseAtk: 1400, baseDef: 950, baseHp: 7800, baseAspd: 45, pierce: 310 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();