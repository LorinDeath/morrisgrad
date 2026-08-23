(function() {
  // Пул лавовых и хаотичных демонов для 15 этажей пекла
  const infernoEnemies = [
    { id: 'm_ci_1', name: 'Лавовый Скорпион', hp: 950, atk: 160, def: 45, xp: 620, gold: 500, isBoss: false, avatar: 'demon', attackSpeed: 2.3, desc: 'Панцирь из застывшей магмы и безжалостные клешни, источающие жар.' },
    { id: 'm_ci_2', name: 'Пылающий Ифрит', hp: 880, atk: 190, def: 30, xp: 650, gold: 530, isBoss: false, avatar: 'archdemon', attackSpeed: 2.7, desc: 'Дух чистого пламени, сжигающий всё на своем пути.' },
    { id: 'm_ci_3', name: 'Пепельный Демон', hp: 1020, atk: 175, def: 40, xp: 680, gold: 560, isBoss: false, avatar: 'demon', attackSpeed: 2.1, desc: 'Порождение раскаленного пепла, вызывающее удушливые бури.' },
    { id: 'e_magma_lord', name: 'Элитный Магма-Голем [ЭЛИТА]', hp: 1800, atk: 240, def: 85, xp: 1100, gold: 900, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.0, desc: 'Живая гора раскаленной породы, охраняющая владения Суртура.' }
  ];

  const dungeonData = {
    id: 'dungeon_chaos_inferno',
    name: '🌋 Пекло Первородного Хаоса (15 Этажей)',
    desc: 'Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.',
    minLvl: 30,
    cooldownSec: 320,
    stages: generateTowerStages(
      15,
      'Инферно Хаоса',
      infernoEnemies,
      { id: 'b_surtur', name: 'Владыка Хаоса Суртур [БОСС]', hp: 6500, atk: 420, def: 135, xp: 5200, gold: 4200, isBoss: true, avatar: 'archdemon', attackSpeed: 2.0, desc: 'Титан первородного огня, чье дыхание плавит саму ткань реальности.' }
    ),
    itemPool: [
      { name: 'Меч Пламени', slot: 'weapon', baseAtk: 260, baseDef: 40, baseHp: 500, baseAspd: 30, pierce: 50 },
      { name: 'Топор Огненного Катаклизма', slot: 'weapon', baseAtk: 300, baseDef: 20, baseHp: 400, baseAspd: 20, pierce: 60 },
      { name: 'Латы Первородного Огня', slot: 'armor', baseAtk: 0, baseDef: 95, baseHp: 900, baseAspd: 12, pierce: 0 },
      { name: 'Шлем Пожирателя Миров', slot: 'helm', baseAtk: 40, baseDef: 60, baseHp: 450, baseAspd: 18, pierce: 25 },
      { name: 'Сапоги Магмового Шага', slot: 'boots', baseAtk: 0, baseDef: 45, baseHp: 350, baseAspd: 35, pierce: 15 },
      { name: 'Наручи Инферно', slot: 'bracers', baseAtk: 60, baseDef: 70, baseHp: 480, baseAspd: 25, pierce: 30 },
      { name: 'Амулет Инферно', slot: 'amulet', baseAtk: 120, baseDef: 60, baseHp: 650, baseAspd: 15, pierce: 25 },
      { name: 'Кольцо Живого Пламени', slot: 'ring', baseAtk: 140, baseDef: 30, baseHp: 400, baseAspd: 32, pierce: 28 },
      { name: 'Реликвия Пекла', slot: 'relic', baseAtk: 150, baseDef: 90, baseHp: 750, baseAspd: 20, pierce: 40 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();