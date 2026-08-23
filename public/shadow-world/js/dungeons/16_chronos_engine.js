(function() {
  // Пул часовых и темпоральных конструктов для 15 этажей Сердца Времени
  const chronosEnemies = [
    { 
      id: 'm_ce_1', 
      name: 'Автоматон', 
      hp: 90000, 
      atk: 6800, 
      def: 1900, 
      xp: 85000, 
      gold: 70000, 
      isBoss: false, 
      avatar: 'matrix', 
      attackSpeed: 1.4, 
      desc: 'Механический механизм, синхронизированный с потоком вечности.' 
    },
    { 
      id: 'm_ce_2', 
      name: 'Квантовый Часовщик', 
      hp: 85000, 
      atk: 7400, 
      def: 1600, 
      xp: 88000, 
      gold: 72000, 
      isBoss: false, 
      avatar: 'shadow_guard', 
      attackSpeed: 1.6, 
      desc: 'Создание, способное искусственно замедлять время вокруг своей цели.' 
    },
    { 
      id: 'm_ce_3', 
      name: 'Смещенный во Времени Страж', 
      hp: 98000, 
      atk: 6500, 
      def: 2100, 
      xp: 91000, 
      gold: 75000, 
      isBoss: false, 
      avatar: 'frost_golem', 
      attackSpeed: 1.3, 
      desc: 'Существует одновременно в нескольких временных линиях.' 
    },
    { 
      id: 'e_chronos_warden', 
      name: 'Элитный Темпоральный Надзиратель [ЭЛИТА]', 
      hp: 190000, 
      atk: 10500, 
      def: 3200, 
      xp: 150000, 
      gold: 120000, 
      isBoss: false, 
      avatar: 'matrix', 
      attackSpeed: 1.5, 
      desc: 'Элитный страж хроно-двигателя, наказывающий за любые попытки исказить график.' 
    }
  ];

  const dungeonData = {
    id: 'dungeon_chronos_engine',
    name: '⚙️ Сердце Вечного Времени (15 Этажей)',
    desc: 'Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.',
    minLvl: 175,
    cooldownSec: 500,
    stages: generateTowerStages(
      15,
      'Время',
      chronosEnemies,
      { 
        id: 'b_chronos_prime', 
        name: 'Хронос Прайм [БОСС]', 
        hp: 650000, 
        atk: 16000, 
        def: 5200, 
        xp: 1000000, 
        gold: 800000, 
        isBoss: true, 
        avatar: 'matrix', 
        attackSpeed: 1.2, 
        desc: 'Абсолютный разум вечности и часовщик мультивселенной, управляющий самим потоком секунд.' 
      }
    ),
    itemPool: [
      { name: 'Клинок Темпорального Сдвига', slot: 'weapon', baseAtk: 4500, baseDef: 700, baseHp: 8500, baseAspd: 90, pierce: 800 },
      { name: 'Жезл Искажения Времени', slot: 'weapon', baseAtk: 4900, baseDef: 450, baseHp: 7500, baseAspd: 110, pierce: 750 },
      { name: 'Доспех Вечного Цикла', slot: 'armor', baseAtk: 800, baseDef: 3500, baseHp: 18000, baseAspd: 55, pierce: 0 },
      { name: 'Шлем Часовщика', slot: 'helm', baseAtk: 1500, baseDef: 2100, baseHp: 13000, baseAspd: 65, pierce: 400 },
      { name: 'Поступь Вечности', slot: 'boots', baseAtk: 0, baseDef: 1300, baseHp: 8500, baseAspd: 150, pierce: 0 },
      { name: 'Наручи Хроноса', slot: 'bracers', baseAtk: 980, baseDef: 1350, baseHp: 9200, baseAspd: 75, pierce: 300 },
      { name: 'Хронометр Вечности', slot: 'amulet', baseAtk: 2200, baseDef: 1200, baseHp: 11000, baseAspd: 80, pierce: 500 },
      { name: 'Кольцо Часовой Стрелки', slot: 'ring', baseAtk: 1800, baseDef: 1000, baseHp: 9800, baseAspd: 95, pierce: 420 },
      { name: 'Плащ Парадокса', slot: 'cloak', baseAtk: 1300, baseDef: 1600, baseHp: 10500, baseAspd: 60, pierce: 250 },
      { name: 'Пояс Времени', slot: 'belt', baseAtk: 1200, baseDef: 1500, baseHp: 9500, baseAspd: 60, pierce: 200 },
      { name: 'Реликвия Хроно-Двигателя', slot: 'relic', baseAtk: 1900, baseDef: 1300, baseHp: 10800, baseAspd: 70, pierce: 450 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();