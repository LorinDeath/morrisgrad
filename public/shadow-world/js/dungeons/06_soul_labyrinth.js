(function() {
  // Пул хаотичных призрачных врагов для генерации 14 этажей лабиринта
  const soulEnemies = [
    { id: 'm_sl_1', name: 'Блуждающий Призрак', hp: 380, atk: 72, def: 18, xp: 210, gold: 170, isBoss: false, avatar: 'skeleton', attackSpeed: 2.4, desc: 'Бесплотная сущность, потерявшая рассудок в бесконечных коридорах.' },
    { id: 'm_sl_2', name: 'Расколотая Тень', hp: 320, atk: 85, def: 10, xp: 230, gold: 185, isBoss: false, avatar: 'shadow_guard', attackSpeed: 3.2, desc: 'Агрессивный сгусток мрака, жаждущий поглотить жизненные силы.' },
    { id: 'm_sl_3', name: 'Воющая Банши', hp: 350, atk: 78, def: 14, xp: 240, gold: 195, isBoss: false, avatar: 'reaper', attackSpeed: 2.8, desc: 'Ее пронзительный крик разрывает ткань пространства и рассудок.' },
    { id: 'e_soul_eater', name: 'Пожиратель Сущностей [ЭЛИТА]', hp: 600, atk: 110, def: 35, xp: 400, gold: 320, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.5, desc: 'Элитный демон хаоса, впитавший тысячи душ павших странников.' }
  ];

  const dungeonData = {
    id: 'dungeon_soul_labyrinth',
    name: '👻 Лабиринт Забытых Душ (14 Этажей)',
    desc: 'Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.',
    minLvl: 20,
    cooldownSec: 260,
    stages: generateTowerStages(
      14,
      'Лабиринт Хаоса',
      soulEnemies,
      { id: 'b_thanatos', name: 'Владыка Забвения Танатос [БОСС]', hp: 2800, atk: 180, def: 60, xp: 2200, gold: 1700, isBoss: true, avatar: 'reaper', attackSpeed: 2.1, desc: 'Верховный владыка хаоса и смерти, единолично управляющий тканью забвения.' }
    ),
    itemPool: [
      { name: 'Эфирная Коса', slot: 'weapon', baseAtk: 95, baseDef: 15, baseHp: 180, baseAspd: 18, pierce: 25 },
      { name: 'Клинок Потерянных Душ', slot: 'weapon', baseAtk: 105, baseDef: 0, baseHp: 120, baseAspd: 24, pierce: 20 },
      { name: 'Призрачный Саван', slot: 'armor', baseAtk: 0, baseDef: 45, baseHp: 350, baseAspd: 8, pierce: 0 },
      { name: 'Капюшон Забвения', slot: 'helm', baseAtk: 15, baseDef: 28, baseHp: 160, baseAspd: 12, pierce: 10 },
      { name: 'Поступь Призрака', slot: 'boots', baseAtk: 0, baseDef: 22, baseHp: 140, baseAspd: 25, pierce: 5 },
      { name: 'Наручи Душ', slot: 'bracers', baseAtk: 25, baseDef: 30, baseHp: 190, baseAspd: 20, pierce: 14 },
      { name: 'Амулет Загробного Эха', slot: 'amulet', baseAtk: 30, baseDef: 18, baseHp: 210, baseAspd: 15, pierce: 16 },
      { name: 'Кольцо Хаоса Душ', slot: 'ring', baseAtk: 40, baseDef: 10, baseHp: 130, baseAspd: 22, pierce: 18 },
      { name: 'Реликвия Душ', slot: 'relic', baseAtk: 45, baseDef: 30, baseHp: 240, baseAspd: 10, pierce: 15 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();