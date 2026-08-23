(function() {
  // Пул мелких роевых монстров и стражей для 14 этажей Колыбели Титанов
  const titanSwarmEnemies = [
    { id: 'm_tc_1', name: 'Каменный Осколок', hp: 14000, atk: 1800, def: 500, xp: 12000, gold: 9500, isBoss: false, avatar: 'frost_golem', attackSpeed: 3.2, desc: 'Мелкий, но прочный осколок древнего монолита, нападающий стремительным роем.' },
    { id: 'm_tc_2', name: 'Пылевой Элементаль', hp: 12500, atk: 2050, def: 420, xp: 12500, gold: 9800, isBoss: false, avatar: 'dummy', attackSpeed: 3.5, desc: 'Вихрь раскаленной каменной пыли, засыпающий глаза и изматывающий героя.' },
    { id: 'm_tc_3', name: 'Земляной Ползун', hp: 13200, atk: 1950, def: 480, xp: 13000, gold: 10200, isBoss: false, avatar: 'skeleton', attackSpeed: 3.0, desc: 'Проворное существо, выскакивающее из трещин скал целыми стаями.' },
    { id: 'e_titan_guardian', name: 'Пробужденный Страж [ЭЛИТА]', hp: 32000, atk: 3100, def: 950, xp: 24000, gold: 19000, isBoss: false, avatar: 'frost_golem', attackSpeed: 2.1, desc: 'Величественный механический страж, охраняющий покой спящих колоссов.' }
  ];

  const dungeonData = {
    id: 'dungeon_titan_cradle',
    name: '🗿 Колыбель Забытых Титанов',
    desc: 'Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.',
    minLvl: 110,
    cooldownSec: 420,
    stages: generateTowerStages(
      14,
      'Колыбель Титанов',
      titanSwarmEnemies,
      { id: 'b_atlas', name: 'Титан Атлас [БОСС]', hp: 140000, atk: 5200, def: 1800, xp: 200000, gold: 160000, isBoss: true, avatar: 'frost_golem', attackSpeed: 1.8, desc: 'Изначальный колосс невероятного величия, на чьих плечах покоятся руины ушедших эпох.' }
    ),
    itemPool: [
      { name: 'Сокрушитель Миров', slot: 'weapon', baseAtk: 2400, baseDef: 300, baseHp: 4500, baseAspd: 30, pierce: 450 },
      { name: 'Молот Первозданной Скалы', slot: 'weapon', baseAtk: 2600, baseDef: 450, baseHp: 5200, baseAspd: 25, pierce: 400 },
      { name: 'Кираса Несокрушимого Титана', slot: 'armor', baseAtk: 400, baseDef: 1600, baseHp: 8500, baseAspd: 20, pierce: 0 },
      { name: 'Корона Древних Колоссов', slot: 'helm', baseAtk: 750, baseDef: 950, baseHp: 6200, baseAspd: 25, pierce: 180 },
      { name: 'Поступь Горного Хребта', slot: 'boots', baseAtk: 0, baseDef: 480, baseHp: 3900, baseAspd: 55, pierce: 150 },
      { name: 'Наручи Атланта', slot: 'bracers', baseAtk: 480, baseDef: 620, baseHp: 4200, baseAspd: 25, pierce: 110 },
      { name: 'Амулет Сердца Земли', slot: 'amulet', baseAtk: 1100, baseDef: 650, baseHp: 6000, baseAspd: 35, pierce: 250 },
      { name: 'Кольцо Атласа', slot: 'ring', baseAtk: 750, baseDef: 500, baseHp: 4800, baseAspd: 25, pierce: 120 },
      { name: 'Плащ Небесного Свода', slot: 'cloak', baseAtk: 800, baseDef: 1100, baseHp: 6500, baseAspd: 20, pierce: 130 },
      { name: 'Пояс Непоколебимости', slot: 'belt', baseAtk: 400, baseDef: 750, baseHp: 5500, baseAspd: 15, pierce: 100 },
      { name: 'Реликвия Забытых Богов', slot: 'relic', baseAtk: 1350, baseDef: 900, baseHp: 7200, baseAspd: 30, pierce: 320 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();