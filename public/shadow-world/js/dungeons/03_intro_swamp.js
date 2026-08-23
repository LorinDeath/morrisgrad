(function() {
  const dungeonData = {
    id: 'dungeon_intro_3',
    name: 'Хрустальные Пещеры',
    desc: 'Мерцающие подземелья, наполненные кристальной магией и опасными агрессивными созданиями.',
    minLvl: 6,
    cooldownSec: 0,
    stages: [
      {
        name: 'Мерцающие Гроты',
        enemies: [
          { id: 'm_crystal_bat', name: 'Кристальная Летучая Мышь', hp: 70, atk: 18, def: 3, xp: 35, gold: 30, isBoss: false, avatar: 'skeleton', attackSpeed: 3.5, desc: 'Слепая тварь, ориентирующаяся по эху.' },
          { id: 'm_cave_crawler', name: 'Пещерный Ползун', hp: 85, atk: 20, def: 5, xp: 40, gold: 35, isBoss: false, avatar: 'dummy', attackSpeed: 2.8, desc: 'Монтр с панцирем из чистейшего кварца.' }
        ]
      },
      {
        name: 'Зал Осколков',
        enemies: [
          { id: 'e_crystal_golem', name: 'Кристальный Страж [ЭЛИТА]', hp: 150, atk: 25, def: 10, xp: 75, gold: 65, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.2, desc: 'Живой монолит из древнего минерала.' }
        ]
      },
      {
        name: 'Сердце Жеоды',
        enemies: [
          { id: 'b_crystal_queen', name: 'Кристальная Владычица [БОСС]', hp: 320, atk: 32, def: 12, xp: 160, gold: 140, isBoss: true, avatar: 'shadow_guard', attackSpeed: 2.4, desc: 'Древнее существо, управляющее энергией кристаллов.' }
        ]
      }
    ],
    itemPool: [
      { name: 'Кристальный Меч', slot: 'weapon', baseAtk: 20, baseDef: 0, baseHp: 15, baseAspd: 4, pierce: 3 },
      { name: 'Кираса из Жоеды', slot: 'armor', baseAtk: 0, baseDef: 9, baseHp: 75, baseAspd: -1, pierce: 0 },
      { name: 'Шлем Кристального Стража', slot: 'helm', baseAtk: 2, baseDef: 6, baseHp: 35, baseAspd: 0, pierce: 1 },
      { name: 'Пулковые Сапоги', slot: 'boots', baseAtk: 0, baseDef: 4, baseHp: 30, baseAspd: 6, pierce: 0 },
      // Предметы для слотов Амулет и Кольцо (требуют Престиж 2)
      { name: 'Кристальный Амулет', slot: 'amulet', baseAtk: 5, baseDef: 3, baseHp: 40, baseAspd: 2, pierce: 2 },
      { name: 'Кольцо Мерцающего Света', slot: 'ring', baseAtk: 8, baseDef: 1, baseHp: 20, baseAspd: 5, pierce: 1 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) DUNGEONS[idx] = dungeonData; else DUNGEONS.push(dungeonData);
})();