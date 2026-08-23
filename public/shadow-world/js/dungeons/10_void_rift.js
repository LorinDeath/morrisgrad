(function() {
  // Расширенный пул кошмарных существ для 10 этажей башни
  const voidEnemies = [
    { id: 'm_vr_1', name: 'Абсолютный Фантом', hp: 5500, atk: 850, def: 240, xp: 4500, gold: 3600, isBoss: false, avatar: 'matrix', attackSpeed: 2.0, desc: 'Бесплотная тень, существующая вне законов физики и времени.' },
    { id: 'm_vr_2', name: 'Пожиратель Миров', hp: 6200, atk: 920, def: 210, xp: 4800, gold: 3900, isBoss: false, avatar: 'reaper', attackSpeed: 2.2, desc: 'Голодное порождение темных миров, стирающее целые измерения.' },
    { id: 'm_vr_3', name: 'Тень Сингулярности', hp: 5800, atk: 990, def: 190, xp: 5100, gold: 4200, isBoss: false, avatar: 'shadow_guard', attackSpeed: 1.8, desc: 'Сгусток гравитационного коллапса и чистой, концентрированной тьмы.' },
    { id: 'e_void_guardian', name: 'Страж Нулевой Точки [ЭЛИТА]', hp: 11000, atk: 1300, def: 380, xp: 8500, gold: 7000, isBoss: false, avatar: 'matrix', attackSpeed: 1.9, desc: 'Элитный страж абсолютной пустоты, охраняющий подступы к Азатоту.' }
  ];

  const dungeonData = {
    id: 'dungeon_void_rift',
    name: '🌌 Разлом Вечной Тьмы (10 Этажей)',
    desc: 'Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.',
    minLvl: 60,
    cooldownSec: 350,
    stages: generateTowerStages(
      10,
      'Тьма',
      voidEnemies,
      { id: 'b_void_walker', name: 'Ходок Бездны Азатот [БОСС]', hp: 35000, atk: 2200, def: 600, xp: 45000, gold: 35000, isBoss: true, avatar: 'matrix', attackSpeed: 1.7, desc: 'Древний владыка пустоты, абсолютное воплощение первородного хаоса.' }
    ),
    itemPool: [
      { name: 'Серп Антиматерии', slot: 'weapon', baseAtk: 1100, baseDef: 150, baseHp: 2200, baseAspd: 50, pierce: 200 },
      { name: 'Клинок Поглощения', slot: 'weapon', baseAtk: 1200, baseDef: 100, baseHp: 1800, baseAspd: 60, pierce: 180 },
      { name: 'Кираса Абсолютной Тьмы', slot: 'armor', baseAtk: 0, baseDef: 420, baseHp: 3800, baseAspd: 30, pierce: 0 },
      { name: 'Шлем Вечного Мрака', slot: 'helm', baseAtk: 180, baseDef: 240, baseHp: 1900, baseAspd: 45, pierce: 100 },
      { name: 'Поступь Пустоты', slot: 'boots', baseAtk: 0, baseDef: 190, baseHp: 1500, baseAspd: 80, pierce: 70 },
      { name: 'Наручи Сингулярности', slot: 'bracers', baseAtk: 250, baseDef: 300, baseHp: 2100, baseAspd: 65, pierce: 120 },
      { name: 'Амулет Забытых Эпох', slot: 'amulet', baseAtk: 450, baseDef: 250, baseHp: 2400, baseAspd: 50, pierce: 110 },
      { name: 'Кольцо Нулевой Точки', slot: 'ring', baseAtk: 480, baseDef: 210, baseHp: 2100, baseAspd: 75, pierce: 100 },
      { name: 'Плащ Тьмы', slot: 'cloak', baseAtk: 350, baseDef: 450, baseHp: 2500, baseAspd: 25, pierce: 50 },
      { name: 'Реликвия Бездны', slot: 'relic', baseAtk: 550, baseDef: 350, baseHp: 2800, baseAspd: 45, pierce: 130 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();