(function() {
  const glitchEnemies = [
    { id: 'm_gl_1', name: 'Цифровой Фантом', hp: 2200, atk: 380, def: 110, xp: 2100, gold: 1800, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.2, desc: 'Нестабильный фрагмент кода, искажающий пространство вокруг себя.' },
    { id: 'm_gl_2', name: 'Блуждающий Баг', hp: 2500, atk: 420, def: 90, xp: 2300, gold: 1950, isBoss: false, avatar: 'skeleton', attackSpeed: 1.9, desc: 'Аномалия логики, безжалостно пожирающая окружающие данные.' },
    { id: 'm_gl_3', name: 'Перегруженный Брандмауэр', hp: 3100, atk: 350, def: 180, xp: 2600, gold: 2200, isBoss: false, avatar: 'dummy', attackSpeed: 2.8, desc: 'Защитный скрипт, сошедший с ума от системной коррупции.' },
    { id: 'e_corrupt_core', name: 'Коррумпированное Ядро [ЭЛИТА]', hp: 5200, atk: 650, def: 240, xp: 4500, gold: 3800, isBoss: false, avatar: 'matrix', attackSpeed: 2.0, desc: 'Элитный узел системы, испускающий волны статического сбоя.' }
  ];

  const dungeonData = {
    id: 'dungeon_5',
    name: 'Разрыв Антиматрицы',
    desc: 'Катастрофический цифровой сбой в ядре вселенной, где бесповоротно стираются законы физики и исходный код реальности.',
    minLvl: 50,
    cooldownSec: 360,
    stages: [
      {
        name: 'Поврежденный Сектор',
        enemies: [glitchEnemies[0], glitchEnemies[1]]
      },
      {
        name: 'Перегруженный Узел',
        enemies: [glitchEnemies[2], glitchEnemies[3]]
      },
      {
        name: 'Фрактальный Трон',
        enemies: [
          { id: 'b_matrix', name: 'Творец Искажения [БОСС]', hp: 28000, atk: 1650, def: 480, xp: 35000, gold: 28000, isBoss: true, avatar: 'matrix', attackSpeed: 1.8, desc: 'Первородный баг, стремящийся обратить всю ткань реальности в нули и единицы.' }
        ]
      }
    ],
    itemPool: [
      { name: 'Кинжал Нулевого Дня', slot: 'weapon', baseAtk: 850, baseDef: 120, baseHp: 1500, baseAspd: 65, pierce: 150 },
      { name: 'Клинок Квантовой Ошибки', slot: 'weapon', baseAtk: 920, baseDef: 80, baseHp: 1300, baseAspd: 75, pierce: 130 },
      { name: 'Кираса Системного Сбоя', slot: 'armor', baseAtk: 0, baseDef: 300, baseHp: 2800, baseAspd: 25, pierce: 0 },
      { name: 'Шлем Цифровой Сингулярности', slot: 'helm', baseAtk: 130, baseDef: 180, baseHp: 1400, baseAspd: 35, pierce: 75 },
      { name: 'Поступь Глюка', slot: 'boots', baseAtk: 0, baseDef: 140, baseHp: 1100, baseAspd: 70, pierce: 50 },
      { name: 'Наручи Антиматрицы', slot: 'bracers', baseAtk: 190, baseDef: 220, baseHp: 1500, baseAspd: 55, pierce: 90 },
      { name: 'Амулет Фрактального Кода', slot: 'amulet', baseAtk: 350, baseDef: 190, baseHp: 1800, baseAspd: 40, pierce: 85 },
      { name: 'Кольцо Бесконечного Цикла', slot: 'ring', baseAtk: 380, baseDef: 160, baseHp: 1600, baseAspd: 60, pierce: 80 },
      { name: 'Реликвия Сбоя', slot: 'relic', baseAtk: 400, baseDef: 250, baseHp: 1900, baseAspd: 35, pierce: 80 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();