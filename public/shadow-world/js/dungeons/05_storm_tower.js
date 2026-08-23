(function() {
  // Расширенный пул штормовых мобов для генерации этапов башни
  const stormEnemies = [
    { id: 'm_st_1', name: 'Грозовой Дух', hp: 160, atk: 32, def: 8, xp: 85, gold: 70, isBoss: false, avatar: 'frost_elem', attackSpeed: 2.5, desc: 'Неуловимый сгусток чистой электрической энергии.' },
    { id: 'm_st_2', name: 'Штормовой Страж', hp: 190, atk: 38, def: 12, xp: 95, gold: 80, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.8, desc: 'Закованный в грозовую сталь древний голем.' },
    { id: 'm_st_3', name: 'Электрический Сталкер', hp: 140, atk: 45, def: 6, xp: 105, gold: 85, isBoss: false, avatar: 'skeleton', attackSpeed: 2.1, desc: 'Бьет молниеносно из скрытых тенистых разломов.' },
    { id: 'e_storm_elite', name: 'Громовержец [ЭЛИТА]', hp: 280, atk: 52, def: 18, xp: 150, gold: 130, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.6, desc: 'Элитный ветеран армии бурь с тяжелым молотом.' }
  ];

  const dungeonData = {
    id: 'dungeon_storm_tower',
    name: '⚡ Башня Бесконечного Шторма (12 Этажей)',
    desc: 'Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.',
    minLvl: 10,
    cooldownSec: 210,
    stages: generateTowerStages(
      12,
      'Шторм',
      stormEnemies, // Передаем весь массив разнообразных мобов
      { id: 'b_raijin', name: 'Повелитель Бурь Райдзин [БОСС]', hp: 1100, atk: 75, def: 28, xp: 750, gold: 600, isBoss: true, avatar: 'dragon', attackSpeed: 2.2, desc: 'Древнее божество грома, единолично правящее небесами.' }
    ),
    itemPool: [
      { name: 'Громовой Клинок', slot: 'weapon', baseAtk: 40, baseDef: 0, baseHp: 50, baseAspd: 20, pierce: 12 },
      { name: 'Молот Бури', slot: 'weapon', baseAtk: 48, baseDef: 0, baseHp: 30, baseAspd: 10, pierce: 15 },
      { name: 'Кираса Небесного Грома', slot: 'armor', baseAtk: 0, baseDef: 22, baseHp: 150, baseAspd: 4, pierce: 0 },
      { name: 'Шлем Электрического Разряда', slot: 'helm', baseAtk: 6, baseDef: 14, baseHp: 70, baseAspd: 8, pierce: 4 },
      { name: 'Сапоги Ветрового Шага', slot: 'boots', baseAtk: 0, baseDef: 10, baseHp: 60, baseAspd: 15, pierce: 2 },
      { name: 'Наручи Молнии', slot: 'bracers', baseAtk: 12, baseDef: 14, baseHp: 80, baseAspd: 15, pierce: 4 },
      { name: 'Амулет Глаза Бури', slot: 'amulet', baseAtk: 15, baseDef: 8, baseHp: 90, baseAspd: 10, pierce: 6 },
      { name: 'Кольцо Шаровой Молнии', slot: 'ring', baseAtk: 20, baseDef: 4, baseHp: 50, baseAspd: 12, pierce: 5 },
      { name: 'Реликвия Древнего Шторма', slot: 'relic', baseAtk: 25, baseDef: 15, baseHp: 120, baseAspd: 18, pierce: 10 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();