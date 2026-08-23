(function() {
  const dungeonData = {
    id: 'dungeon_intro_1',
    name: 'Подвалы Старого Замка',
    desc: 'Заброшенные тренировочные подвалы замка, где хранятся первые реликвии павших стражей.',
    minLvl: 1,
    cooldownSec: 0,
    stages: [
      {
        name: 'Сектор Мишеней',
        enemies: [
          { id: 'm_dummy_1', name: 'Оживленный Манекен', hp: 35, atk: 7, def: 1, xp: 12, gold: 10, isBoss: false, avatar: 'dummy', attackSpeed: 3.2, desc: 'Зачарованный деревянный манекен для отработки ударов.' },
          { id: 'm_rat_1', name: 'Подвальная Крыса-Мутант', hp: 28, atk: 9, def: 0, xp: 10, gold: 8, isBoss: false, avatar: 'skeleton', attackSpeed: 2.5, desc: 'Агрессивный обитатель сырых стен.' }
        ]
      },
      {
        name: 'Оружейный зал',
        enemies: [
          { id: 'b_shadow_guard', name: 'Теневой Страж [БОСС]', hp: 140, atk: 16, def: 5, xp: 60, gold: 50, isBoss: true, avatar: 'shadow_guard', attackSpeed: 2.7, desc: 'Призрачный хранитель, стерегущий старое снаряжение.' }
        ]
      },
      {
        name: 'Сокровищница Гарнизона',
        enemies: [
          { id: 'b_armored_skeleton', name: 'Осколок Командира [ЭЛИТА]', hp: 180, atk: 20, def: 8, xp: 85, gold: 75, isBoss: true, avatar: 'skeleton', attackSpeed: 3.0, desc: 'Остатки былой мощи гарнизона.' }
        ]
      }
    ],
    itemPool: [
      // Варианты оружия для начального этапа
      { name: 'Учебный Меч', slot: 'weapon', baseAtk: 8, baseDef: 0, baseHp: 10, baseAspd: 5, pierce: 1 },
      { name: 'Ржавый Кинжал', slot: 'weapon', baseAtk: 6, baseDef: 0, baseHp: 5, baseAspd: 12, pierce: 0 },
      { name: 'Тяжелый Тесак', slot: 'weapon', baseAtk: 11, baseDef: 0, baseHp: 0, baseAspd: -3, pierce: 2 },
      
      // Варианты доспехов для начального этапа
      { name: 'Кожаный Доспех', slot: 'armor', baseAtk: 0, baseDef: 4, baseHp: 30, baseAspd: 0, pierce: 0 },
      { name: 'Поношенный Кафтан', slot: 'armor', baseAtk: 1, baseDef: 2, baseHp: 45, baseAspd: 2, pierce: 0 },
      { name: 'Латный Нагрудник Стража', slot: 'armor', baseAtk: 0, baseDef: 7, baseHp: 60, baseAspd: -2, pierce: 0 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();